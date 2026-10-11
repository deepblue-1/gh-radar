#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# quick-260929-c8e — KYOBO 관찰자 비밀 생성 · relay SA 접근권 · 값 주입 (비출력)
#
# 대상: Secret Manager `gh-radar-dma-observer-secret-kyobo` → relay env `DMA_OBSERVER_SECRET_KYOBO`.
# 짝: gh-trade kyobo127 게이트웨이 `config/observer.toml`(600). 그 배치는 **gh-trade 세션 몫**이다 —
#     이 스크립트는 게이트웨이에 접속하지 않는다.
#
# 실행 주체: 사용자가 `! bash .planning/quick/260929-c8e-relay-kyobo-observer/260929-c8e-kyobo-secret.sh`
#            로 직접 실행한다(Secret Manager 쓰기는 에이전트 분류기가 막는다).
#
# 값은 어느 단계에서도 터미널 · 셸 히스토리 · 명령줄 인자에 나오지 않는다. 출력은 sha256 앞 12자뿐이다.
# 절차 원형: infra/relay/README.md §관찰자 비밀 (한 번 생성 → 0600 임시 파일 → 주입 → 해시 대조 → 삭제).
#
# 사용법:
#   bash 260929-c8e-kyobo-secret.sh            # 없으면 만들고 값 주입. 이미 ENABLED 버전이 있으면
#                                              # 해시만 보여 주고 끝낸다(멱등 — 조용한 순환 금지).
#   bash 260929-c8e-kyobo-secret.sh --rotate   # 새 값을 새 버전으로 추가(순환). 적용 순서는
#                                              # 게이트웨이 재시작 → relay 재배포(마지막)다.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

PROJECT_EXPECTED="gh-radar"
SECRET_NAME="gh-radar-dma-observer-secret-kyobo"
RELAY_SA="gh-radar-relay-sa@${PROJECT_EXPECTED}.iam.gserviceaccount.com"

ROTATE=0
case "${1:-}" in
  "") ;;
  --rotate) ROTATE=1 ;;
  *)
    echo "usage: bash $0 [--rotate]" >&2
    exit 1
    ;;
esac

ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$ACTIVE_PROJECT" != "$PROJECT_EXPECTED" ]]; then
  echo "ERROR: gcloud project 가 ${PROJECT_EXPECTED} 가 아닙니다 (현재: ${ACTIVE_PROJECT:-<없음>})" >&2
  echo "       CLOUDSDK_CORE_PROJECT=${PROJECT_EXPECTED} 로 다시 실행하세요." >&2
  exit 1
fi

# 최신 버전 값의 sha256 앞 12자. 값은 파이프로만 흐른다.
hash12_latest() {
  gcloud secrets versions access latest --secret="$SECRET_NAME" | shasum -a 256 | cut -c1-12
}

# ① 빈 껍데기 — setup-relay-iam.sh Section 4 와 같은 명령.
if gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
  echo "✓ secret exists: $SECRET_NAME"
else
  echo "▶ creating secret: $SECRET_NAME"
  gcloud secrets create "$SECRET_NAME" --replication-policy=automatic >/dev/null
fi

# ② relay SA 접근권 (멱등). 없으면 deploy-relay.sh 가 KYOBO 관찰자를 생략한다(KB 배포는 계속된다).
gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --member="serviceAccount:${RELAY_SA}" \
  --role=roles/secretmanager.secretAccessor >/dev/null
echo "✓ secretAccessor bound: $SECRET_NAME → gh-radar-relay-sa"

# ③ 값 — 이미 있으면 새로 만들지 않는다(순환은 --rotate 로만).
ENABLED="$(gcloud secrets versions list "$SECRET_NAME" --filter='state=ENABLED' \
  --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${ENABLED:-0}" -ge 1 && "$ROTATE" -eq 0 ]]; then
  echo "✓ 이미 ENABLED 버전 ${ENABLED}개 — 새 값을 만들지 않는다 (순환은 --rotate)"
  echo "  sha256 앞 12자: $(hash12_latest)"
  exit 0
fi

umask 077
T="$(mktemp)"
trap 'rm -f "$T"' EXIT
# hex 라 TOML 따옴표와 부딪히지 않는다 (README §관찰자 비밀과 같은 규칙).
openssl rand -hex 32 | tr -d '\n' > "$T"
gcloud secrets versions add "$SECRET_NAME" --data-file="$T" >/dev/null
LOCAL12="$(shasum -a 256 "$T" | cut -c1-12)"
REMOTE12="$(hash12_latest)"
rm -f "$T"

if [[ "$LOCAL12" != "$REMOTE12" ]]; then
  echo "ERROR: 로컬 해시(${LOCAL12}) 와 Secret Manager 해시(${REMOTE12}) 가 다릅니다" >&2
  exit 1
fi
echo "✓ 새 버전 주입 완료 — sha256 앞 12자: ${LOCAL12}"
echo "  다음: gh-trade 세션이 kyobo127 config/observer.toml 에 같은 값을 넣는다"
echo "        (값은 'gcloud secrets versions access latest --secret=${SECRET_NAME}' 를 파이프로만 흘린다)."
echo "        게이트웨이 재시작 뒤 파일 값의 sha256 앞 12자가 위 값과 같은지 알려 받는다."
