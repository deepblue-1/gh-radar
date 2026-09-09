#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# dma-credentials.sh
# Phase 15 (D-18) — scripts/dma-credentials.ts 실행 래퍼
#
# env 로드와 gcloud 인증 준비를 대신하고, **어느 cwd 에서 실행해도** 동작하게 한다.
# `scripts/` 안에서 실행하면 상대경로 `source workers/master-sync/.env` 가 깨진다 —
# 이 래퍼는 첫 줄에서 저장소 루트로 이동해 그 사고를 구조적으로 막는다.
#
# 사용법:
#   bash scripts/dma-credentials.sh --list                                      # 등록 현황
#   bash scripts/dma-credentials.sh --email <이메일> --dma-user <DMA user_id>   # 비밀번호 프롬프트
#   bash scripts/dma-credentials.sh --email <대상> --from-email <원본>          # 기존 자격증명 연결
#
# 선택 env:
#   DMA_CRED_ENV_FILE             env 파일 경로. 기본 workers/master-sync/.env
#   CLOUDSDK_CORE_PROJECT         gcloud 프로젝트. 기본 gh-radar
#   GOOGLE_APPLICATION_CREDENTIALS  SA 키 경로. 비어 있으면 deployer 키가 있을 때 자동 지정
#
# 비밀은 이 래퍼가 화면에 내보내지 않는다 (deploy-relay.sh 와 동일 규약):
#   env 파일은 `set -a; source` 로만 읽고 내용을 echo 하지 않으며, 검증 실패 시에도
#   **비어 있는 키 이름만** 출력한다. 값은 어떤 경로로도 찍지 않는다.
# ═══════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────
# Section 1: 저장소 루트로 이동 — 이 한 줄이 이 래퍼의 존재 이유다
# ───────────────────────────────────────────────────────────────
cd "$(dirname "$0")/.."

# ───────────────────────────────────────────────────────────────
# Section 2: env 파일 로드
# ───────────────────────────────────────────────────────────────
ENV_FILE="${DMA_CRED_ENV_FILE:-workers/master-sync/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env 파일을 찾지 못했습니다: $ENV_FILE" >&2
  echo "       (탐색 기준 = 저장소 루트 $(pwd))" >&2
  echo "       다른 경로를 쓰려면:" >&2
  echo "         DMA_CRED_ENV_FILE=<경로> bash scripts/dma-credentials.sh ..." >&2
  exit 1
fi

# 파일 내용은 출력하지 않는다. `set -a` 로 source 하는 동안만 자동 export 한다.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 배열 대신 문자열로 모은다 — bash 3.2(macOS 기본)에서 `set -u` + 빈 배열 참조가 터지고,
# `[[ ... ]] && arr+=(...)` 형태는 조건이 거짓일 때 `set -e` 로 스크립트를 죽인다.
MISSING=""
if [[ -z "${SUPABASE_URL:-}" ]]; then MISSING="$MISSING SUPABASE_URL"; fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then MISSING="$MISSING SUPABASE_SERVICE_ROLE_KEY"; fi
if [[ -n "$MISSING" ]]; then
  # 이름만 찍는다 — 값은 절대 출력하지 않는다.
  echo "ERROR: $ENV_FILE 에 다음 키가 비어 있습니다:$MISSING" >&2
  exit 1
fi

# ───────────────────────────────────────────────────────────────
# Section 3: gcloud 준비 (DMA_CRED_KEY 를 Secret Manager 에서 읽는 경로용)
# ───────────────────────────────────────────────────────────────
export CLOUDSDK_CORE_PROJECT="${CLOUDSDK_CORE_PROJECT:-gh-radar}"

DEPLOYER_KEY="$HOME/.config/gcloud/gh-radar-deployer.json"
if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -f "$DEPLOYER_KEY" ]]; then
  export GOOGLE_APPLICATION_CREDENTIALS="$DEPLOYER_KEY"
fi

# 여기서 실패시키지 않는다 — `--list` 는 AES 키가 필요 없고, DMA_CRED_KEY 를 직접 넣어
# 실행하는 경로도 유효하다. 키가 필요한 순간에 TS 쪽이 안내와 함께 exit 1 한다.
if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" && -z "${DMA_CRED_KEY:-}" ]]; then
  echo "note: gcloud SA 키도 DMA_CRED_KEY 도 없습니다 — 등록/연결 시 AES 키 조회에 실패할 수 있습니다." >&2
fi

echo "준비 완료: env=$ENV_FILE project=$CLOUDSDK_CORE_PROJECT" >&2

# ───────────────────────────────────────────────────────────────
# Section 4: 실행
# ───────────────────────────────────────────────────────────────
# relay 워크스페이스를 경유하는 이유: tsx·@supabase/supabase-js 가 relay/node_modules 에만
# 있고 저장소 루트에는 없다(pnpm 워크스페이스). `exec` 라 종료코드가 그대로 전달된다.
exec pnpm --filter @gh-radar/relay exec tsx ../scripts/dma-credentials.ts "$@"
