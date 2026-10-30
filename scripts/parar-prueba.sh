#!/bin/bash
# Para la copia de prueba, borra sus datos de prueba y vuelve a la versión actual (main).
set -uo pipefail
cd "$(dirname "$0")/.."
docker compose -f docker-compose.prueba.yml down -v --remove-orphans
git checkout main >/dev/null 2>&1 && echo "✅ Prueba parada. Estás de nuevo en main."
