#!/bin/bash
# Arranca en este Mac una copia de prueba de la app con los cambios de un PR.
#   ./scripts/probar-pr.sh 110   → prueba el PR número 106
#   ./scripts/probar-pr.sh       → prueba la versión actual (main)
# Para pararla: ./scripts/parar-prueba.sh
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.prueba.yml)

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Falta Docker Desktop. Descárgalo de https://www.docker.com/products/docker-desktop/ y ábrelo."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker Desktop está cerrado. Ábrelo (icono de la ballena), espera a que diga «running» y repite."
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Hay archivos cambiados en esta carpeta. Para no perder nada, no cambio de versión."
  git status --short
  exit 1
fi

PR="${1:-}"
if [ -n "$PR" ]; then
  if ! [[ "$PR" =~ ^[0-9]+$ ]]; then
    echo "❌ Escribe solo el número del PR, por ejemplo: ./scripts/probar-pr.sh 110"
    exit 1
  fi
  echo "⬇️  Descargando el PR #$PR…"
  git fetch origin "+pull/$PR/head:prueba-pr-$PR"
  git checkout "prueba-pr-$PR"
else
  echo "⬇️  Descargando la versión actual (main)…"
  git checkout main
  git pull --ff-only origin main
fi

echo "🧹 Borrando la copia de prueba anterior…"
"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
echo "🚀 Arrancando (la primera vez tarda unos minutos)…"
"${COMPOSE[@]}" up --build -d

printf "⏳ Esperando a que la app esté lista"
for _ in $(seq 1 180); do
  if curl -fs http://localhost:8000/health >/dev/null 2>&1 && curl -fs -o /dev/null http://localhost:3000/login; then
    echo
    echo "✅ Lista: http://localhost:3000/login"
    echo "   Usuario:    prova@example.com"
    echo "   Contraseña: ProvaNakama2026!"
    echo "   (son datos de prueba: puedes crear, cambiar y borrar lo que quieras)"
    echo "   Para parar: ./scripts/parar-prueba.sh"
    open http://localhost:3000/login 2>/dev/null || true
    exit 0
  fi
  printf "."
  sleep 2
done
echo
echo "❌ No ha arrancado en 6 minutos. Esto es lo último que ha pasado:"
"${COMPOSE[@]}" logs --tail 40
exit 1
