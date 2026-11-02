#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-tickgw-iam.sh
# Phase 37 (D-05 · D-07) — 당일 틱 경로 tickgw(radar-gw :8092) 방화벽 · 공유 비밀 프로비저닝
#
#   ① 방화벽 relay-allow-internal-tickgw — tcp:8092 ← 10.10.0.0/26(Cloud Run Direct VPC egress 서브넷)만,
#      대상 태그 radar-gw. relay 주문 포트 규칙 relay-allow-internal-order(tcp:8091) 와 동형(setup-relay-iam.sh).
#   ② Secret gh-radar-tickgw-secret — 없으면 만들고, ENABLED 버전이 없으면 `openssl rand -hex 32` 를
#      **파이프로** `gcloud secrets versions add --data-file=-` 에 넣는다(화면 · 셸 히스토리 · ps 에 값이 남지 않는다).
#      이미 버전이 있으면 값을 건드리지 않는다(순환은 아래 「순환」).
#   ③ server 실행 SA · relay VM SA(gh-radar-relay-sa)에 그 Secret 만 roles/secretmanager.secretAccessor.
#      server 는 TICKGW_SECRET 로(37-15 deploy-server.sh), tickgw 는 VM 메타데이터 자격으로(deploy-tickgw.sh) 읽는다.
#
# 멱등 — 재실행 시 있는 리소스는 건너뛴다. **비밀 값을 출력하지 않는다.**
# Secret Manager 쓰기는 분류기가 막으므로 사용자가 `!` 한 줄로 돌린다(메모리 「비밀 주입은 사용자 `!` 실행」):
#   ! GCP_PROJECT_ID=gh-radar bash scripts/setup-tickgw-iam.sh
#   ! GCP_PROJECT_ID=gh-radar bash scripts/setup-tickgw-iam.sh --dry-run    # 계획만
#
# 순환: `openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add gh-radar-tickgw-secret --data-file=-` 뒤
#       deploy-tickgw.sh(새 값으로 tickgw 재기동) → deploy-server.sh(server 새 revision) 순서. 그 사이 몇십 초 401.
#
# 선택 env: SERVER_SA=<email> — 기본은 gh-radar-server 서비스의 실행 SA(없으면 default compute SA)
# ═══════════════════════════════════════════════════════════════

usage() {
  sed -n '4,25p' "$0" | sed 's/^# \{0,1\}//'
}

DRY_RUN=0
for ARG in "$@"; do
  case "$ARG" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$ARG'" >&2; exit 1 ;;
  esac
done

run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

# ── Section 1: gcloud guard ────────────────────────────────────
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"
if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi
ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]] || [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: gcloud config mismatch (config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT)" >&2
  exit 1
fi
echo "✓ guard: config=$ACTIVE_CONFIG project=$ACTIVE_PROJECT"
[[ "$DRY_RUN" == "1" ]] && echo "════ DRY-RUN 모드 — 어떤 리소스도 생성/변경하지 않는다 ════"

# ── Section 2: 변수 ────────────────────────────────────────────
VPC_NAME=gh-radar-vpc
NETWORK_TAG=radar-gw
SOURCE_RANGE=10.10.0.0/26
TICKGW_PORT=8092
FW_RULE=relay-allow-internal-tickgw
SECRET_NAME=gh-radar-tickgw-secret
RELAY_SA="gh-radar-relay-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

detect_server_sa() {
  local detected pn
  detected=$(gcloud run services describe gh-radar-server \
    --region=asia-northeast3 \
    --format='value(spec.template.spec.serviceAccountName)' \
    --project="$EXPECTED_PROJECT" 2>/dev/null || true)
  if [[ -n "$detected" ]]; then
    echo "$detected"
    return
  fi
  pn=$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')
  echo "${pn}-compute@developer.gserviceaccount.com"
}
SERVER_SA="${SERVER_SA:-$(detect_server_sa)}"
echo "✓ SERVER_SA: $SERVER_SA  (override: SERVER_SA=<email>)"
echo "✓ RELAY_SA:  $RELAY_SA"

# ── Section 3: 방화벽 tcp:8092 ← Cloud Run 서브넷 ───────────────
if ! gcloud compute firewall-rules describe "$FW_RULE" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "▶ creating firewall rule: $FW_RULE ..."
  run gcloud compute firewall-rules create "$FW_RULE" \
    --project="$EXPECTED_PROJECT" \
    --network="$VPC_NAME" --direction=INGRESS --action=ALLOW \
    --rules=tcp:8092 --source-ranges="$SOURCE_RANGE" --target-tags="$NETWORK_TAG" \
    --description="Phase37 tickgw: internal tick port ${TICKGW_PORT} from Cloud Run subnet only"
fi
echo "✓ firewall ready: $FW_RULE (tcp:${TICKGW_PORT} ← ${SOURCE_RANGE} · tag ${NETWORK_TAG})"

# ── Section 4: Secret + 첫 버전(값 미출력) ─────────────────────
if ! gcloud secrets describe "$SECRET_NAME" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "▶ creating secret: $SECRET_NAME ..."
  run gcloud secrets create "$SECRET_NAME" --project="$EXPECTED_PROJECT" --replication-policy=automatic
fi
ENABLED_VERSIONS=$(gcloud secrets versions list "$SECRET_NAME" --project="$EXPECTED_PROJECT" \
  --filter='state=ENABLED' --format='value(name)' 2>/dev/null || true)
if [[ -z "$ENABLED_VERSIONS" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [dry-run] openssl rand -hex 32 | tr -d '\\n' | gcloud secrets versions add $SECRET_NAME --data-file=-"
  else
    command -v openssl >/dev/null 2>&1 || { echo "ERROR: openssl 이 없다" >&2; exit 1; }
    echo "▶ adding first version (openssl rand -hex 32 — 값은 출력하지 않는다) ..."
    openssl rand -hex 32 | tr -d '\n' \
      | gcloud secrets versions add "$SECRET_NAME" --project="$EXPECTED_PROJECT" --data-file=- >/dev/null
  fi
  echo "✓ secret version added: $SECRET_NAME"
else
  echo "✓ secret has ENABLED version — 값은 건드리지 않는다: $SECRET_NAME"
fi

# ── Section 5: accessor — 이 Secret 에만 ───────────────────────
for SA in "$SERVER_SA" "$RELAY_SA"; do
  run gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --project="$EXPECTED_PROJECT" \
    --member="serviceAccount:${SA}" \
    --role=roles/secretmanager.secretAccessor \
    --condition=None >/dev/null
  echo "✓ secretAccessor: $SA → $SECRET_NAME"
done

echo ""
echo "✅ tickgw IAM 준비 끝"
echo "   다음(20:00 KST 이후 · 메인 세션): infra/relay/tickpull/install.sh(radar-gw) → bash scripts/deploy-tickgw.sh"
echo "   server 결선: deploy-server.sh 에 TICKGW_URL=http://<radar-gw 내부 IP>:${TICKGW_PORT} + Secret ${SECRET_NAME} → TICKGW_SECRET (37-15)"
