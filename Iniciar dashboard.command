#!/bin/zsh

set -e

project_dir="${0:A:h}"

cd "$project_dir"

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instalá Node.js 22.13 o posterior desde https://nodejs.org/"
  echo "Presioná Enter para cerrar."
  read
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Preparando la aplicación por primera vez…"
  npm install
fi

echo "Iniciando Huella alimentaria · Argentina…"
echo "El dashboard se abrirá en http://localhost:4173"
echo "Para detenerlo, presioná Control + C en esta ventana."

(sleep 2; open http://localhost:4173) &
npm run dev:local
