#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# export-accum-backfill.sh
# Phase 34 Plan 02 (D-23) — scripts/export-accum-backfill.ts 실행 래퍼
#
# env 를 주입하고 **어느 cwd 에서 실행해도** 동작하게 한다(dma-credentials.sh Section 1~2 와 같다).
# 스크립트는 읽기 전용이다 — kind 16(KYOBO119)을 날짜별 JSON lines 로 내보낸다.
#
# 사용법:
#   bash scripts/export-accum-backfill.sh --date 20261019 --date 20261020   # 기본 출력 ~/ticks/accum-backfill/
#   bash scripts/export-accum-backfill.sh --date 20261019 --out <dir> --force
#   bash scripts/export-accum-backfill.sh --help
#
# 선택 env:
#   ACCUM_BACKFILL_ENV_FILE   env 파일 경로. 기본 workers/master-sync/.env
#
# 비밀은 이 래퍼가 화면에 내보내지 않는다:
#   env 파일은 `set -a; source` 로만 읽고 내용을 echo 하지 않으며, 검증 실패 시에도
#   **비어 있는 키 이름만** 출력한다. 값은 어떤 경로로도 찍지 않는다.
# ═══════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────
# Section 1: 저장소 루트로 이동
# ───────────────────────────────────────────────────────────────
cd "$(dirname "$0")/.."

# ───────────────────────────────────────────────────────────────
# Section 2: env 파일 로드
# ───────────────────────────────────────────────────────────────
ENV_FILE="${ACCUM_BACKFILL_ENV_FILE:-workers/master-sync/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env 파일을 찾지 못했습니다: $ENV_FILE" >&2
  echo "       (탐색 기준 = 저장소 루트 $(pwd))" >&2
  echo "       다른 경로를 쓰려면:" >&2
  echo "         ACCUM_BACKFILL_ENV_FILE=<경로> bash scripts/export-accum-backfill.sh ..." >&2
  exit 1
fi

# 파일 내용은 출력하지 않는다. `set -a` 로 source 하는 동안만 자동 export 한다.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 배열 대신 문자열 — bash 3.2(macOS 기본)에서 `set -u` + 빈 배열 참조가 터진다.
MISSING=""
if [[ -z "${SUPABASE_URL:-}" ]]; then MISSING="$MISSING SUPABASE_URL"; fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then MISSING="$MISSING SUPABASE_SERVICE_ROLE_KEY"; fi
if [[ -n "$MISSING" ]]; then
  # 이름만 찍는다 — 값은 절대 출력하지 않는다.
  echo "ERROR: $ENV_FILE 에 다음 키가 비어 있습니다:$MISSING" >&2
  exit 1
fi

# ───────────────────────────────────────────────────────────────
# Section 3: 실행
# ───────────────────────────────────────────────────────────────
# relay 워크스페이스 경유 — tsx·@supabase/supabase-js 가 relay/node_modules 에만 있다. `exec` 라 종료코드가 그대로다.
exec pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts "$@"
