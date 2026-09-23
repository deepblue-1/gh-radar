#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# verify-dma-orders-price-check.sh
# Phase 18 Plan 24 (GC-CR-01 · D-21 · D-23) — `dma_orders_price_check` pgTAP 회귀 러너
#
# 일회용 로컬 컨테이너에 저장소 마이그레이션을 파일명 순으로 재생한 뒤
# supabase/tests/dma_orders_price_check.test.sql 을 돌려 TAP 출력을 그대로 내보낸다.
# --test 로 다른 dma_orders 회귀도 돌린다 (quick-260923-m23 — dma_orders_modified.test.sql).
#
# Usage:
#   bash scripts/verify-dma-orders-price-check.sh                     # 전 마이그레이션 재생 (수정 후 = GREEN 기대)
#   bash scripts/verify-dma-orders-price-check.sh --until 20260922120000
#                                                                     # 그 버전 **이하**만 재생 (수정 전 = RED 재현)
#   bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_orders_modified.test.sql
#                                                                     # 다른 회귀 파일 (기본 = dma_orders_price_check.test.sql)
#
# 종료 코드: TAP 에 `not ok` 가 1줄이라도 있거나 psql 이 실패하면 non-zero.
#
# 안전 경계:
#   - 공유·원격 DB 접촉 0 — 이 스크립트는 원격 접속 정보·환경변수를 읽지 않는다.
#     포트를 공개하지 않고 `docker exec` 로만 컨테이너 안의 Postgres 에 접속한다.
#   - 이미지는 로컬에 있는 것만 쓴다. 없으면 받지 않고 멈춘다(새 이미지 네트워크 pull 0).
#   - 컨테이너는 성공·실패·중단 모두 trap 으로 지운다.
#   - 마이그레이션 파일은 읽기만 한다. 재생에 필요한 사전 스텁(auth.jwt())은 러너 안에서만 만든다
#     (quick 260908-qnf Task 1-A 선례).
# ═══════════════════════════════════════════════════════════════

IMAGE="public.ecr.aws/supabase/postgres:17.6.1.104"
NAME="dma-price-check-$$"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"
TEST_FILE="$ROOT/supabase/tests/dma_orders_price_check.test.sql"
UNTIL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --until)
      [ $# -ge 2 ] || { echo "ERROR: --until 에 버전(예: 20260922120000)이 필요합니다" >&2; exit 2; }
      UNTIL="$2"; shift 2 ;;
    --test)
      [ $# -ge 2 ] || { echo "ERROR: --test 에 회귀 파일 경로가 필요합니다" >&2; exit 2; }
      case "$2" in
        /*) TEST_FILE="$2" ;;
        *)  TEST_FILE="$ROOT/$2" ;;
      esac
      shift 2 ;;
    -h|--help)
      sed -n '4,27p' "$0"; exit 0 ;;
    *)
      echo "ERROR: 알 수 없는 인자: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f "$TEST_FILE" ]; then
  echo "ERROR: 회귀 파일이 없습니다: $TEST_FILE" >&2
  exit 2
fi

if [ -n "$UNTIL" ] && ! [[ "$UNTIL" =~ ^[0-9]{14}$ ]]; then
  echo "ERROR: --until 은 14자리 버전이어야 합니다: $UNTIL" >&2
  exit 2
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "ERROR: 로컬에 $IMAGE 이미지가 없습니다 — 이 러너는 이미지를 새로 받지 않습니다." >&2
  echo "       이미지를 직접 확인·준비한 뒤 다시 실행하세요." >&2
  exit 3
fi

ERR_FILE="$(mktemp)"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "$ERR_FILE"; }
trap cleanup EXIT INT TERM

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

psql_c() { docker exec -i "$NAME" psql -X -q -U supabase_admin -d postgres -h 127.0.0.1 "$@"; }

# 초기화 스크립트가 끝난 뒤의 본 서버를 기다린다(초기화 중 임시 서버는 TCP 를 열지 않는다).
ready=0
for _ in $(seq 1 120); do
  if docker exec "$NAME" pg_isready -q -h 127.0.0.1 -U postgres >/dev/null 2>&1 \
     && psql_c -tAc "SELECT 1" >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done
[ "$ready" = 1 ] || { echo "ERROR: 컨테이너 Postgres 가 120초 안에 준비되지 않았습니다" >&2; docker logs "$NAME" 2>&1 | tail -20 >&2; exit 4; }

# 사전 스텁: auth.jwt() — GoTrue 가 만드는 함수라 이미지에 없다 (260908-qnf 선례).
psql_c -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
SQL

applied=0
for f in "$MIG_DIR"/*.sql; do
  base="$(basename "$f")"
  ver="${base%%_*}"
  if [ -n "$UNTIL" ] && [ "$ver" \> "$UNTIL" ]; then
    continue
  fi
  if ! psql_c -v ON_ERROR_STOP=1 >/dev/null 2>"$ERR_FILE" < "$f"; then
    echo "ERROR: 마이그레이션 재생 실패: $base" >&2
    cat "$ERR_FILE" >&2
    exit 5
  fi
  applied=$((applied + 1))
done
echo "# replayed $applied migrations${UNTIL:+ (until $UNTIL)}"

set +e
out="$(psql_c -v ON_ERROR_STOP=1 -tA < "$TEST_FILE" 2>&1)"
rc=$?
set -e
printf '%s\n' "$out"

if [ "$rc" -ne 0 ] || printf '%s\n' "$out" | grep -q '^not ok'; then
  echo "# RESULT: FAIL (psql exit $rc)" >&2
  exit 1
fi
echo "# RESULT: PASS"
