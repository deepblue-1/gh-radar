#!/usr/bin/env bash
# gh-radar local dev — webapp(:3100) + server(:8080) 동시 실행
# Usage: ./dev.sh [--webapp-only | --server-only]

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

lsof -ti :3100 -ti :8080 2>/dev/null | xargs kill -9 2>/dev/null || true

# 공용 env 로드 — .env > workers/ingestion/.env 순
ENV_FILE=""
if [[ -f "$ROOT/.env" ]]; then
  ENV_FILE="$ROOT/.env"
elif [[ -f "$ROOT/workers/ingestion/.env" ]]; then
  ENV_FILE="$ROOT/workers/ingestion/.env"
fi

if [[ -n "$ENV_FILE" ]]; then
  echo "[env] Loading $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "[env] 경고: .env 파일을 찾지 못했습니다. server 가 SUPABASE_* 부재로 실패할 수 있습니다."
fi

BLUE='\033[0;34m'
GREEN='\033[0;32m'
PURPLE='\033[0;35m'
NC='\033[0m'

cleanup() {
  echo ""
  echo "Shutting down all services..."
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Stopped."
}
trap cleanup EXIT INT TERM

prefix_output() {
  local color="$1" name="$2"
  while IFS= read -r line; do
    echo -e "${color}[${name}]${NC} $(date +%H:%M:%S) $line"
  done
}

MODE="${1:-all}"

# shared 최초 빌드 보장 — dist 가 없으면 webapp/server 의 초기 import 가 실패한다
if [[ ! -f "$ROOT/packages/shared/dist/index.js" ]]; then
  echo -e "${PURPLE}[shared]${NC} Initial build (dist 없음)..."
  (cd "$ROOT" && pnpm --filter @gh-radar/shared run build)
fi

# shared watch — webapp/server 앞에 먼저 기동해서 src 수정 시 dist 즉시 재빌드
echo -e "${PURPLE}[shared]${NC} Starting tsup --watch..."
(cd "$ROOT" && pnpm --filter @gh-radar/shared run dev < /dev/null 2>&1) | prefix_output "$PURPLE" "shared" &

if [[ "$MODE" != "--server-only" ]]; then
  echo -e "${BLUE}[webapp]${NC} Starting Next.js on :3100..."
  (cd "$ROOT" && PORT=3100 pnpm --filter @gh-radar/webapp run dev < /dev/null 2>&1) | prefix_output "$BLUE" "webapp" &
fi

if [[ "$MODE" != "--webapp-only" ]]; then
  echo -e "${GREEN}[server]${NC} Starting Express on :8080..."
  (cd "$ROOT" && pnpm --filter @gh-radar/server run dev < /dev/null 2>&1) | prefix_output "$GREEN" "server" &
fi

echo ""
echo "========================================="
echo "  gh-radar dev 서비스 기동"
echo "  Webapp: http://localhost:3100  (/design 카탈로그)"
echo "  Server: http://localhost:8080  (/api/health)"
echo "  Ctrl+C 로 전체 종료"
echo "========================================="
echo ""

wait
