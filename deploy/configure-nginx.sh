#!/usr/bin/env bash
set -Eeuo pipefail

readonly DOMAIN="balanceo2.ar"
readonly SOURCE_CONFIG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nginx/${DOMAIN}.conf"

if [[ $EUID -ne 0 ]]; then
  echo "Este script debe ejecutarse como root o mediante sudo." >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx no está instalado." >&2
  exit 1
fi

if [[ ! -f "$SOURCE_CONFIG" ]]; then
  echo "No se encontró ${SOURCE_CONFIG}." >&2
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

install -o root -g root -m 0644 "$SOURCE_CONFIG" "$target"

if [[ -n "$enabled" ]]; then
  if [[ -e "$enabled" && "$(realpath "$enabled")" != "$(realpath "$target")" ]]; then
    echo "${enabled} ya apunta a otra configuración; se cancela sin modificarlo." >&2
    if [[ -n "$backup" ]]; then
      cp --archive "$backup" "$target"
    else
      rm -f "$target"
    fi
    exit 1
  fi
  if [[ ! -e "$enabled" ]]; then
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

if ! nginx -t; then
  restore_configuration
  nginx -t || true
  echo "La configuración fue restaurada porque Nginx no la aceptó." >&2
  exit 1
fi

reload_nginx() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx
  else
    nginx -s reload
  fi
}

if ! reload_nginx; then
  restore_configuration
  nginx -t || true
  reload_nginx || true
  echo "La configuración fue restaurada porque Nginx no pudo recargarse." >&2
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  if ! curl --fail --silent --show-error --max-time 10 -H "Host: ${DOMAIN}" http://127.0.0.1/ >/dev/null; then
    restore_configuration
    nginx -t || true
    reload_nginx || true
    echo "La configuración fue restaurada porque el virtual host no respondió correctamente." >&2
    exit 1
  fi
fi

echo "Nginx dirige ${DOMAIN} a 127.0.0.1:3000."
