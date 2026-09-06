#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_NAME="balanco2"
readonly CONTAINER_NAME="balanco2-web"
readonly PREVIOUS_CONTAINER="balanco2-web-previous"
readonly NETWORK_NAME="balanco2-network"
readonly HOST_PORT="3000"

if [[ $# -ne 2 ]]; then
  echo "Uso: remote-deploy.sh <directorio-deploy> <commit-sha>" >&2
  exit 2
fi

readonly DEPLOY_ROOT="$1"
readonly RELEASE_SHA="$2"
readonly RELEASE_DIR="${DEPLOY_ROOT}/releases/${RELEASE_SHA}"
readonly SHORT_SHA="${RELEASE_SHA:0:12}"
readonly IMAGE_NAME="${APP_NAME}:${RELEASE_SHA}"
readonly CANDIDATE_NAME="${CONTAINER_NAME}-candidate-${SHORT_SHA}"

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "El identificador de la versión no es válido." >&2
  exit 2
fi

if [[ ! -f "${RELEASE_DIR}/Dockerfile" ]]; then
  echo "No se encontró el Dockerfile en ${RELEASE_DIR}." >&2
  exit 2
fi

for command_name in docker; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Falta el comando requerido: ${command_name}." >&2
    exit 1
  fi
done

docker info >/dev/null

container_exists() {
  docker container inspect "$1" >/dev/null 2>&1
}

managed_container() {
  [[ "$(docker container inspect --format '{{ index .Config.Labels "ar.balanceo2.managed" }}' "$1" 2>/dev/null || true)" == "true" ]]
}

wait_for_health() {
  local container="$1"
  local attempt state health

  for attempt in $(seq 1 45); do
    state="$(docker container inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
    health="$(docker container inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"

    if [[ "$health" == "healthy" ]]; then
      return 0
    fi
    if [[ "$state" == "exited" || "$state" == "dead" || "$health" == "unhealthy" ]]; then
      docker logs --tail 100 "$container" >&2 || true
      return 1
    fi
    sleep 2
  done

  docker logs --tail 100 "$container" >&2 || true
  return 1
}

remove_candidate() {
  if container_exists "$CANDIDATE_NAME"; then
    if ! managed_container "$CANDIDATE_NAME"; then
      echo "Existe un contenedor ajeno llamado ${CANDIDATE_NAME}; se cancela sin modificarlo." >&2
      return 1
    fi
    docker rm --force "$CANDIDATE_NAME" >/dev/null
  fi
}

rollback() {
  echo "La nueva versión no quedó saludable; restaurando la versión anterior." >&2

  if container_exists "$CONTAINER_NAME" && managed_container "$CONTAINER_NAME"; then
    docker rm --force "$CONTAINER_NAME" >/dev/null
  fi

  if container_exists "$PREVIOUS_CONTAINER" && managed_container "$PREVIOUS_CONTAINER"; then
    docker rename "$PREVIOUS_CONTAINER" "$CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
    wait_for_health "$CONTAINER_NAME" || true
  fi
}

trap remove_candidate EXIT

# Nunca reemplazar un contenedor ajeno que use el nombre reservado.
if container_exists "$CONTAINER_NAME" && ! managed_container "$CONTAINER_NAME"; then
  echo "Ya existe un contenedor no administrado llamado ${CONTAINER_NAME}; se cancela el despliegue." >&2
  exit 1
fi

# Nunca tomar el puerto 3000 si está publicado por otro contenedor.
current_publishes_port="false"
while IFS= read -r published_name; do
  [[ -z "$published_name" ]] && continue
  if [[ "$published_name" == "$CONTAINER_NAME" ]]; then
    current_publishes_port="true"
  else
    echo "El puerto 3000 pertenece al contenedor ${published_name}; se cancela sin modificarlo." >&2
    exit 1
  fi
done < <(docker ps --filter publish=3000 --format '{{.Names}}')

# Detectar procesos no Docker en el puerto, pero permitir el contenedor vigente de balanco2.
if [[ "$current_publishes_port" == "false" ]] && command -v ss >/dev/null 2>&1 && ss -H -ltn 'sport = :3000' | grep -q .; then
  echo "El puerto 3000 ya está ocupado por otro proceso; se cancela el despliegue." >&2
  exit 1
fi

echo "Construyendo la imagen ${IMAGE_NAME}."
docker build --pull --tag "$IMAGE_NAME" "$RELEASE_DIR"

if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  if [[ "$(docker network inspect --format '{{ index .Labels "ar.balanceo2.managed" }}' "$NETWORK_NAME" 2>/dev/null || true)" != "true" ]]; then
    echo "La red ${NETWORK_NAME} ya existe y no pertenece a balanco2; se cancela sin modificarla." >&2
    exit 1
  fi
else
  docker network create --label ar.balanceo2.managed=true "$NETWORK_NAME" >/dev/null
fi

# La imagen candidata se prueba sin publicar ningún puerto del host.
remove_candidate
docker run --detach \
  --name "$CANDIDATE_NAME" \
  --network "$NETWORK_NAME" \
  --label ar.balanceo2.managed=true \
  --label ar.balanceo2.commit="$RELEASE_SHA" \
  --security-opt no-new-privileges:true \
  --init \
  "$IMAGE_NAME" >/dev/null

if ! wait_for_health "$CANDIDATE_NAME"; then
  echo "La imagen candidata no superó el control de salud." >&2
  exit 1
fi
remove_candidate
trap - EXIT

if container_exists "$PREVIOUS_CONTAINER"; then
  if ! managed_container "$PREVIOUS_CONTAINER"; then
    echo "Existe un contenedor ajeno llamado ${PREVIOUS_CONTAINER}; se cancela el despliegue." >&2
    exit 1
  fi
  docker rm --force "$PREVIOUS_CONTAINER" >/dev/null
fi

if container_exists "$CONTAINER_NAME"; then
  previous_image="$(docker container inspect --format '{{.Config.Image}}' "$CONTAINER_NAME")"
  docker image tag "$previous_image" "${APP_NAME}:previous"
  docker stop --time 20 "$CONTAINER_NAME" >/dev/null
  docker rename "$CONTAINER_NAME" "$PREVIOUS_CONTAINER"
fi

if ! docker run --detach \
  --name "$CONTAINER_NAME" \
  --network "$NETWORK_NAME" \
  --publish "127.0.0.1:${HOST_PORT}:3000" \
  --restart unless-stopped \
  --label ar.balanceo2.managed=true \
  --label ar.balanceo2.commit="$RELEASE_SHA" \
  --security-opt no-new-privileges:true \
  --init \
  "$IMAGE_NAME" >/dev/null; then
  rollback
  exit 1
fi

if ! wait_for_health "$CONTAINER_NAME"; then
  rollback
  exit 1
fi

if command -v curl >/dev/null 2>&1 && ! curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:${HOST_PORT}/" >/dev/null; then
  rollback
  exit 1
fi

if container_exists "$PREVIOUS_CONTAINER" && managed_container "$PREVIOUS_CONTAINER"; then
  docker rm "$PREVIOUS_CONTAINER" >/dev/null
fi

printf '%s\n' "$RELEASE_SHA" > "${DEPLOY_ROOT}/current-version"
echo "Despliegue ${RELEASE_SHA} activo en 127.0.0.1:${HOST_PORT}."
