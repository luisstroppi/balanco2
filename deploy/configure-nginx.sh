#!/usr/bin/env bash
set -Eeuo pipefail

readonly DOMAIN="balanco2.ar"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HTTP_CONFIG="${SCRIPT_DIR}/nginx/${DOMAIN}.http.conf"
readonly TLS_CONFIG="${SCRIPT_DIR}/nginx/${DOMAIN}.conf"
readonly ACME_ROOT="/var/www/letsencrypt"
readonly CERTIFICATE_DIR="/etc/letsencrypt/live/${DOMAIN}"
readonly DNS_WAIT_SECONDS="${DNS_WAIT_SECONDS:-900}"
readonly DNS_POLL_SECONDS="${DNS_POLL_SECONDS:-15}"

if [[ $EUID -ne 0 ]]; then
  echo "Este script debe ejecutarse como root o mediante sudo." >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx no está instalado." >&2
  exit 1
fi

if [[ ! -f "$HTTP_CONFIG" || ! -f "$TLS_CONFIG" ]]; then
  echo "No se encontraron las configuraciones de Nginx para ${DOMAIN}." >&2
  exit 1
fi

if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
  target="/etc/nginx/sites-available/${DOMAIN}.conf"
  enabled="/etc/nginx/sites-enabled/${DOMAIN}.conf"
else
  target="/etc/nginx/conf.d/${DOMAIN}.conf"
  enabled=""
fi

# Si el dominio ya está definido por otro archivo, no tocar ninguna configuración.
for search_root in /etc/nginx/sites-enabled /etc/nginx/conf.d; do
  [[ -d "$search_root" ]] || continue
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    if [[ "$(realpath "$match")" != "$(realpath -m "$target")" ]]; then
      echo "El dominio ${DOMAIN} ya está definido en ${match}; se cancela sin modificarlo." >&2
      exit 1
    fi
  done < <(grep -RslE "server_name[[:space:]]+[^;]*${DOMAIN//./\\.}([[:space:];]|$)" "$search_root" 2>/dev/null || true)
done

backup=""
created_link="false"
if [[ -f "$target" ]]; then
  backup="${target}.backup.$(date -u +%Y%m%dT%H%M%SZ)"
  cp --archive "$target" "$backup"
fi

if [[ -n "$enabled" ]]; then
  if [[ ( -e "$enabled" || -L "$enabled" ) && "$(realpath -m "$enabled")" != "$(realpath -m "$target")" ]]; then
    echo "${enabled} ya apunta a otra configuración; se cancela sin modificarlo." >&2
    if [[ -n "$backup" ]]; then
      cp --archive "$backup" "$target"
    else
      rm -f "$target"
    fi
    exit 1
  fi
  if [[ ! -e "$enabled" && ! -L "$enabled" ]]; then
    ln -s "$target" "$enabled"
    created_link="true"
  fi
fi

restore_configuration() {
  if [[ -n "$backup" ]]; then
    cp --archive "$backup" "$target"
  else
    rm -f "$target"
  fi
  if [[ "$created_link" == "true" ]]; then
    rm -f "$enabled"
  fi
}

reload_nginx() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx
  else
    nginx -s reload
  fi
}

activate_configuration() {
  local source_file="$1"
  install -o root -g root -m 0644 "$source_file" "$target"

  if ! nginx -t; then
    return 1
  fi
  reload_nginx
}

mkdir -p "${ACME_ROOT}/.well-known/acme-challenge"

# Activar primero HTTP para que Let's Encrypt pueda validar únicamente este dominio.
if ! activate_configuration "$HTTP_CONFIG"; then
  restore_configuration
  nginx -t || true
  reload_nginx || true
  echo "La configuración HTTP fue restaurada porque Nginx no pudo activarla." >&2
  exit 1
fi

if [[ ! -s "${CERTIFICATE_DIR}/fullchain.pem" || ! -s "${CERTIFICATE_DIR}/privkey.pem" ]]; then
  if ! command -v certbot >/dev/null 2>&1; then
    restore_configuration
    nginx -t || true
    reload_nginx || true
    echo "Certbot no está instalado; no se modificó la configuración definitiva." >&2
    exit 1
  fi

  # NIC Argentina puede demorar en publicar una delegación recién creada.
  # Esperar evita consumir intentos de Let's Encrypt mientras el dominio aún
  # responde NXDOMAIN. `getent` usa el mismo resolvedor que luego usa Certbot.
  dns_deadline=$((SECONDS + DNS_WAIT_SECONDS))
  echo "Esperando que ${DOMAIN} resuelva públicamente (máximo ${DNS_WAIT_SECONDS}s)..."
  until getent ahostsv4 "$DOMAIN" >/dev/null 2>&1; do
    if (( SECONDS >= dns_deadline )); then
      restore_configuration
      nginx -t || true
      reload_nginx || true
      echo "${DOMAIN} sigue sin resolver; se restauró la configuración anterior." >&2
      exit 1
    fi
    sleep "$DNS_POLL_SECONDS"
  done

  # Dar un breve margen para que desaparezcan respuestas negativas cacheadas
  # antes de que la autoridad certificadora consulte el dominio.
  sleep 30

  if ! certbot certonly \
    --webroot \
    --webroot-path "$ACME_ROOT" \
    --domains "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --keep-until-expiring; then
    restore_configuration
    nginx -t || true
    reload_nginx || true
    echo "No se pudo emitir el certificado; se restauró la configuración anterior." >&2
    exit 1
  fi
fi

if ! activate_configuration "$TLS_CONFIG"; then
  restore_configuration
  nginx -t || true
  reload_nginx || true
  echo "La configuración HTTPS fue restaurada porque Nginx no pudo activarla." >&2
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  https_ready="false"
  for attempt in {1..15}; do
    if curl --fail --silent --show-error --max-time 15 \
      --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" >/dev/null 2>&1; then
      https_ready="true"
      break
    fi
    sleep 2
  done

  if [[ "$https_ready" != "true" ]]; then
    restore_configuration
    nginx -t || true
    reload_nginx || true
    echo "La configuración fue restaurada porque el sitio HTTPS no respondió correctamente." >&2
    exit 1
  fi
fi

echo "Nginx dirige https://${DOMAIN} a 127.0.0.1:3000."
