#!/usr/bin/env bash
# Mantém o servidor de produção e as rotinas agendadas rodando em um servidor próprio (sem Vercel).
#  - reinicia o Next.js se ele cair ou travar (health check em /api/health)
#  - chama /api/cron/sync a cada 3 h e /api/cron/alertas a cada 24 h (mesmo contrato do vercel.json)
# Uso: scripts/serve-local.sh   (lê .env.local; logs em ./logs)
set -u
cd "$(dirname "$0")/.."
mkdir -p logs
set -a; . ./.env.local; set +a
export NODE_USE_ENV_PROXY="${NODE_USE_ENV_PROXY:-}" PORT="${PORT:-3000}"

(
  while true; do
    echo "[$(date -Is)] iniciando servidor" >> logs/server.log
    npx next start -p "$PORT" >> logs/server.log 2>&1
    echo "[$(date -Is)] servidor parou (código $?); reiniciando em 3 s" >> logs/server.log
    sleep 3
  done
) &

# Vigia de saúde: se /api/health falhar 3 vezes seguidas, derruba o processo travado (o laço acima reinicia).
(
  sleep 30; fails=0
  while true; do
    if curl -s -m 15 -o /dev/null -f "http://localhost:$PORT/api/health"; then fails=0; else fails=$((fails+1)); fi
    if (( fails >= 3 )); then
      echo "[$(date -Is)] health check falhou 3x; reiniciando à força" >> logs/server.log
      pkill -9 -f "next-server" ; fails=0; sleep 20
    fi
    sleep 60
  done
) &

(
  sleep 60
  last_alerts=0
  while true; do
    echo "[$(date -Is)] sincronização agendada" >> logs/cron.log
    if ! curl -s -f -m 3000 -H "Authorization: Bearer $CRON_SECRET" "http://localhost:$PORT/api/cron/sync?modo=atualizacao" >> logs/cron.log 2>&1; then
      echo " [falhou; nova tentativa em 5 min]" >> logs/cron.log; sleep 300; continue
    fi
    echo >> logs/cron.log
    now=$(date +%s)
    if (( now - last_alerts > 86400 )); then
      curl -s -m 600 -H "Authorization: Bearer $CRON_SECRET" "http://localhost:$PORT/api/cron/alertas" >> logs/cron.log 2>&1; echo >> logs/cron.log
      last_alerts=$now
    fi
    sleep 10800
  done
) &
wait
