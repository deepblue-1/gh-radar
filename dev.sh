#!/usr/bin/env bash
# gh-radar local dev — webapp(:3100) + server(:8080) 동시 실행
#
# 로컬 포트 규약 (Phase 15 D-41):
#   webapp        :3100   (Next.js)
#   server        :8080   (Express, /api/health)
#   relay ws      :8090   (브라우저 wss — 경로 /ws)
#   relay 내부    :8091   (Cloud Run 전용 HTTP, /healthz)
#
#   webapp 이 relay 에 붙으려면 webapp/.env.local 에 아래를 넣는다:
#     NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:8090/ws
#
# Usage: ./dev.sh [--webapp-only | --server-only] [--with-relay]
#
#   relay 는 기본 비활성이다(opt-in). DMA 게이트웨이 mock 없이 띄우면 재접속 실패 로그만
#   쌓이므로, mock 을 먼저 올린 뒤 --with-relay 를 붙인다. 준비 절차는 relay/README.md.

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

WITH_RELAY=0
ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--with-relay" ]]; then
    WITH_RELAY=1
  else
    ARGS+=("$arg")
  fi
done

lsof -ti :3100 -ti :8080 -ti :8090 -ti :8091 2>/dev/null | xargs kill -9 2>/dev/null || true

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
CYAN='\033[0;36m'
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

MODE="${ARGS[0]:-all}"

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

# relay 는 --with-relay 일 때만 (Phase 15 D-40/D-41).
# DMA_HOST 기본값은 실서버(KB 사내망)라 로컬에서는 반드시 mock 을 가리켜야 한다 (D-27).
if [[ "$WITH_RELAY" == "1" ]]; then
  echo -e "${CYAN}[relay]${NC} Starting relay on ws :8090 / internal :8091..."
  echo -e "${CYAN}[relay]${NC} DMA_HOST=${DMA_HOST:-127.0.0.1} DMA_PORT=${DMA_PORT:-9100} (mock 게이트웨이가 떠 있어야 합니다)"
  (cd "$ROOT" && DMA_HOST="${DMA_HOST:-127.0.0.1}" DMA_PORT="${DMA_PORT:-9100}" \
    pnpm --filter @gh-radar/relay run dev < /dev/null 2>&1) | prefix_output "$CYAN" "relay" &
fi

echo ""
echo "========================================="
echo "  gh-radar dev 서비스 기동"
echo "  Webapp: http://localhost:3100  (/design 카탈로그)"
echo "  Server: http://localhost:8080  (/api/health)"
if [[ "$WITH_RELAY" == "1" ]]; then
  echo "  Relay : ws://localhost:8090/ws  ·  http://localhost:8091/healthz"
else
  echo "  Relay : 비활성 (--with-relay 로 기동 — relay/README.md 참고)"
fi
echo "  Ctrl+C 로 전체 종료"
echo "========================================="
echo ""

wait
