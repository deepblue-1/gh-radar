#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# 260929-sas-verify-remote.sh — quick-260929-sas 원격 적용 전후 대조 래퍼
#
# 사용법 (어느 cwd 에서든):
#   bash .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh selftest
#        네트워크 없이 순수 함수 · 스냅샷 경로 규칙 검증 (env 불필요) → SELFTEST PASS
#   bash .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh snapshot [--out <경로>]
#        적용 전. 기본 스냅샷 경로 $HOME/.cache/gh-radar/260929-sas-baseline.json 에 쓰고 경로를 한 줄 출력
#   bash .planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.sh check [--baseline <경로>]
#        적용 후. PASS|FAIL|SKIP <ID> <설명> · 끝줄 ALL PASS 또는 FAIL <n> (FAIL 이면 종료 1)
#
# 선택 env: DMA_CRED_ENV_FILE (기본 workers/master-sync/.env) — snapshot · check 만 읽는다.
#
# 안전 경계:
#   - 읽기 전용 — select · 조회 RPC 만. 원격 쓰기 · DDL 없음.
#   - env 파일은 `set -a; source` 로만 읽는다. 값 · 파일 내용을 출력하지 않고, 빈 키는 이름만 출력한다.
#   - 스냅샷은 저장소 밖(수치만 · 0600)에만 쓴다. 저장소 안 경로는 스크립트가 거부한다.
# ═══════════════════════════════════════════════════════════════

SAS_VERIFY_CWD="$(pwd)"
export SAS_VERIFY_CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../../.."

TS_REL="../.planning/quick/260929-sas-gateway-aware-visibility/260929-sas-verify-remote.ts"
MODE="${1:-}"

case "$MODE" in
  selftest)
    exec pnpm --silent --filter @gh-radar/relay exec tsx "$TS_REL" "$@"
    ;;
  snapshot|check)
    ENV_FILE="${DMA_CRED_ENV_FILE:-workers/master-sync/.env}"
    if [[ ! -f "$ENV_FILE" ]]; then
      echo "ERROR: env 파일을 찾지 못했습니다: $ENV_FILE (저장소 루트 기준)" >&2
      exit 1
    fi
    # 파일 내용은 출력하지 않는다. `set -a` 로 source 하는 동안만 자동 export 한다.
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    MISSING=""
    if [[ -z "${SUPABASE_URL:-}" ]]; then MISSING="$MISSING SUPABASE_URL"; fi
    if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then MISSING="$MISSING SUPABASE_SERVICE_ROLE_KEY"; fi
    if [[ -n "$MISSING" ]]; then
      echo "ERROR: $ENV_FILE 에 다음 키가 비어 있습니다:$MISSING" >&2
      exit 1
    fi
    exec pnpm --silent --filter @gh-radar/relay exec tsx "$TS_REL" "$@"
    ;;
  *)
    echo "사용법: $0 selftest | snapshot [--out <경로>] | check [--baseline <경로>]" >&2
    exit 2
    ;;
esac
