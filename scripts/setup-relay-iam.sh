#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# setup-relay-iam.sh
# Phase 15 (RELAY-03) — DMA relay VM 인프라 프로비저닝
#
# 결정 (15-CONTEXT.md):
#   D-07: VM = e2-micro / Debian 12 / asia-northeast3, 기존 gh-radar-vpc·서브넷 재사용,
#         relay 전용 신규 외부 고정 IP (Cloud NAT 용 IP 재사용 금지)
#   D-08: 주문 경로 = Cloud Run Direct VPC Egress → VM 내부 IP:8091.
#         Cloud Run 워크로드에는 네트워크 태그를 붙일 수 없어 source-ranges 로만 좁힌다.
#   D-09: 공인 인바운드는 443 만. SSH 는 IAP 터널만. gh-radar-vpc 에 방화벽 규칙이
#         0개이므로 3규칙을 여기서 최초 생성한다 (RESEARCH Pitfall 12).
#
# 멱등 — 재실행 시 기존 리소스 skip.
# 이 스크립트는 비밀 "값" 을 만들지도 출력하지도 않는다. 값 주입은 사람이 별도 수행한다.
#
# 사용법:
#   GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh --dry-run   # 계획만 출력
#   GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh             # 실제 생성
#   DEPLOYER_SA_EMAIL=... 를 주면 관리자 등록 스크립트 실행 주체에도
#   gh-radar-dma-cred-key 접근권을 추가로 바인딩한다.
# ═══════════════════════════════════════════════════════════════

usage() {
  cat <<'USAGE'
setup-relay-iam.sh [--dry-run] [-h|--help]

  --dry-run   리소스를 만들지 않고 실행 계획만 출력한다.
              (describe 같은 읽기 조회는 그대로 수행해 현재 상태를 반영한다)
USAGE
}

# ───────────────────────────────────────────────────────────────
# Section 0: 인자 파싱
# ───────────────────────────────────────────────────────────────
DRY_RUN=0
for ARG in "$@"; do
  case "$ARG" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument '$ARG'" >&2; usage >&2; exit 1 ;;
  esac
done

# 변경(mutating) 명령은 전부 이 래퍼를 통과한다. dry-run 이면 실행하지 않고 출력만 한다.
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

if [[ "$DRY_RUN" == "1" ]]; then
  echo "════ DRY-RUN 모드 — 어떤 리소스도 생성/변경하지 않는다 ════"
fi

# IAM 정책 바인딩 전용 재시도 래퍼.
#   (a) SA 생성 직후 바인딩은 "Service account ... does not exist" 로 실패할 수 있다.
#       IAM 은 최종 일관성이라 SA 가 정책 백엔드에 전파되기까지 수십 초가 걸린다.
#   (b) projects add-iam-policy-binding 은 정책 read-modify-write 라
#       동시 변경 시 409 ABORTED 로 실패할 수 있다.
# 둘 다 시간이 지나면 해소되는 일시적 실패이므로 상한을 두고 재시도한다.
run_retry() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [dry-run] %s\n' "$*"
    return 0
  fi
  local attempt=1 max=6 delay=10
  until "$@"; do
    if (( attempt >= max )); then
      echo "ERROR: IAM 바인딩이 ${max}회 재시도 후에도 실패했다: $*" >&2
      return 1
    fi
    echo "  · IAM 전파 대기 (${attempt}/${max}) — ${delay}s 후 재시도" >&2
    sleep "$delay"
    attempt=$(( attempt + 1 ))
  done
}

# ───────────────────────────────────────────────────────────────
# Section 1: gcloud guard (setup-intraday-sync-iam.sh mirror)
# ───────────────────────────────────────────────────────────────
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: export GCP_PROJECT_ID=gh-radar" >&2
  exit 1
fi

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]]; then
  echo "ERROR: active gcloud configuration is '$ACTIVE_CONFIG', expected '$EXPECTED_CONFIG'" >&2
  echo "Hint: gcloud config configurations activate $EXPECTED_CONFIG" >&2
  exit 1
fi
if [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: active project is '$ACTIVE_PROJECT', expected '$EXPECTED_PROJECT'" >&2
  exit 1
fi
echo "✓ gcloud guard: config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT"

# 공통 변수
REGION=asia-northeast3
ZONE=asia-northeast3-a
VPC_NAME=gh-radar-vpc
SUBNET_NAME=gh-radar-subnet-an3
VM_NAME=radar-gw
NETWORK_TAG=radar-gw
SA_NAME=gh-radar-relay-sa
SA_EMAIL="${SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
EXT_IP_NAME=gh-radar-relay-ip
INT_IP_NAME=gh-radar-relay-internal
INT_IP_ADDR=10.10.0.5

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_ASSET_DIR="${REPO_ROOT}/infra/relay"
STARTUP_SCRIPT="${RELAY_ASSET_DIR}/startup.sh"

# VM 자산은 저장소가 단일 정본이고 인스턴스 메타데이터로 실어 보낸다.
# startup.sh 가 메타데이터 서버에서 읽어 /usr/local/sbin 등에 배치한다
# (저장소와 VM 에 사본을 이중 관리하지 않기 위함).
VM_METADATA_FILES="startup-script=${STARTUP_SCRIPT}"
VM_METADATA_FILES="${VM_METADATA_FILES},kbvpn-fetch-secret=${RELAY_ASSET_DIR}/kbvpn-fetch-secret.sh"
VM_METADATA_FILES="${VM_METADATA_FILES},kbvpn-connect=${RELAY_ASSET_DIR}/kbvpn-connect.sh"
VM_METADATA_FILES="${VM_METADATA_FILES},kbvpn-vpnc-wrapper=${RELAY_ASSET_DIR}/kbvpn-vpnc-wrapper.sh"
VM_METADATA_FILES="${VM_METADATA_FILES},openconnect-service=${RELAY_ASSET_DIR}/openconnect@.service"
VM_METADATA_FILES="${VM_METADATA_FILES},caddyfile=${RELAY_ASSET_DIR}/Caddyfile"

# ───────────────────────────────────────────────────────────────
# Section 2: API enable (멱등)
# ───────────────────────────────────────────────────────────────
echo "▶ enabling required APIs..."
run gcloud services enable \
  compute.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  iap.googleapis.com \
  monitoring.googleapis.com
echo "✓ APIs enabled"

# ───────────────────────────────────────────────────────────────
# Section 3: 서비스 계정 (최소권한)
#   프로젝트 레벨에는 secretmanager.secretAccessor 를 주지 않는다.
#   Secret 접근은 Section 4 에서 Secret 단위 바인딩으로만 좁힌다 (T-15-27).
# ───────────────────────────────────────────────────────────────
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  echo "✓ SA exists: $SA_NAME"
else
  run gcloud iam service-accounts create "$SA_NAME" \
    --display-name="gh-radar DMA relay VM (Phase 15 RELAY-03)"
  echo "✓ SA created: $SA_NAME"
fi

for ROLE in roles/artifactregistry.reader roles/logging.logWriter roles/monitoring.metricWriter; do
  run_retry gcloud projects add-iam-policy-binding "$EXPECTED_PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None >/dev/null
  echo "✓ project role bound: $ROLE → $SA_NAME"
done

# ───────────────────────────────────────────────────────────────
# Section 4: Secret 3종 (빈 껍데기만 생성 — 값은 사람이 주입)
#   이 스크립트는 어떤 비밀 값도 생성·출력·기록하지 않는다.
# ───────────────────────────────────────────────────────────────
for SECRET_NAME in gh-radar-dma-cred-key gh-radar-relay-order-secret gh-radar-kb-vpn-password; do
  if gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
    echo "✓ secret exists: $SECRET_NAME"
  else
    echo "▶ creating empty secret: $SECRET_NAME (값은 별도 주입 필요)"
    run gcloud secrets create "$SECRET_NAME" --replication-policy=automatic
  fi

  run_retry gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
  echo "✓ secretAccessor bound: $SECRET_NAME → $SA_NAME"
done

# 관리자 등록 스크립트(dma-credentials) 실행 주체에도 AES 키 접근권을 준다.
# RESEARCH Open Question 3 — 실행 주체가 VM SA 가 아니라 배포자 SA 이기 때문.
if [[ -n "${DEPLOYER_SA_EMAIL:-}" ]]; then
  run_retry gcloud secrets add-iam-policy-binding gh-radar-dma-cred-key \
    --member="serviceAccount:${DEPLOYER_SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
  echo "✓ secretAccessor bound: gh-radar-dma-cred-key → ${DEPLOYER_SA_EMAIL}"
else
  echo "· DEPLOYER_SA_EMAIL 미지정 — 관리자 등록 스크립트 실행 주체 바인딩 skip"
fi

# ───────────────────────────────────────────────────────────────
# Section 5: 네트워크
# ───────────────────────────────────────────────────────────────

# 5.1 기존 VPC/서브넷은 존재만 확인한다 (Phase 09.1 이 이미 생성했다 — 만들지 않는다).
if ! gcloud compute networks describe "$VPC_NAME" >/dev/null 2>&1; then
  echo "ERROR: VPC '$VPC_NAME' not found — scripts/setup-intraday-sync-iam.sh 가 선행되어야 함" >&2
  exit 1
fi
echo "✓ VPC exists (reused): $VPC_NAME"

if ! gcloud compute networks subnets describe "$SUBNET_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "ERROR: Subnet '$SUBNET_NAME' not found — scripts/setup-intraday-sync-iam.sh 가 선행되어야 함" >&2
  exit 1
fi
echo "✓ Subnet exists (reused): $SUBNET_NAME"

# 5.2 relay 전용 신규 외부 고정 IP `gh-radar-relay-ip`
# ⚠️ 기존 `gh-radar-static-ip`(34.64.195.151) 는 Cloud NAT 바인딩용이라 **재사용 금지** — 뺏으면 워커 outbound 가 전부 깨진다.
if ! gcloud compute addresses describe "$EXT_IP_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ reserving external static IP: $EXT_IP_NAME..."
  run gcloud compute addresses create "$EXT_IP_NAME" --region="$REGION"
fi
RELAY_EXT_IP=$(gcloud compute addresses describe "$EXT_IP_NAME" --region="$REGION" \
  --format='value(address)' 2>/dev/null || echo "(dry-run: 아직 미예약)")
echo "✓ external static IP: $EXT_IP_NAME = $RELAY_EXT_IP"

# 5.3 내부 고정 IP — RELAY_INTERNAL_URL 안정화용.
# serverless 예약 대역 10.10.0.16/28 (Cloud Run Direct VPC Egress) 을 피해 .5 를 고른다.
if ! gcloud compute addresses describe "$INT_IP_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ reserving internal static IP: $INT_IP_NAME ($INT_IP_ADDR)..."
  run gcloud compute addresses create "$INT_IP_NAME" \
    --region="$REGION" \
    --subnet="$SUBNET_NAME" \
    --addresses="$INT_IP_ADDR" \
    --purpose=GCE_ENDPOINT
fi
echo "✓ internal static IP: $INT_IP_NAME = $INT_IP_ADDR"

# 5.4 방화벽 3규칙 — gh-radar-vpc 최초 규칙 (현재 0개, 인그레스 기본 거부).
#     이 3규칙이 없으면 IAP SSH 조차 되지 않는다 (RESEARCH Pitfall 12).

# (a) 공개 HTTPS — Caddy TLS 종단. 유일한 공인 인바운드.
#     포트 80 은 열지 않는다: Caddy 는 TLS-ALPN-01(443)로 인증서를 발급받을 수 있다.
#     최초 발급이 계속 실패할 때만 80 을 임시 개방했다가 발급 확인 후 규칙을 삭제한다.
if ! gcloud compute firewall-rules describe relay-allow-https >/dev/null 2>&1; then
  echo "▶ creating firewall rule: relay-allow-https..."
  run gcloud compute firewall-rules create relay-allow-https \
    --network="$VPC_NAME" --direction=INGRESS --action=ALLOW \
    --rules=tcp:443 --source-ranges=0.0.0.0/0 --target-tags="$NETWORK_TAG" \
    --description="Phase15 relay: public HTTPS (Caddy TLS termination)"
fi
echo "✓ firewall ready: relay-allow-https (tcp:443 ← 공인망)"

# (b) IAP 터널 SSH — 공인망에 22 를 직접 열지 않는다.
#     실행 주체에 roles/iap.tunnelResourceAccessor 가 필요하다.
if ! gcloud compute firewall-rules describe relay-allow-iap-ssh >/dev/null 2>&1; then
  echo "▶ creating firewall rule: relay-allow-iap-ssh..."
  run gcloud compute firewall-rules create relay-allow-iap-ssh \
    --network="$VPC_NAME" --direction=INGRESS --action=ALLOW \
    --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags="$NETWORK_TAG" \
    --description="Phase15 relay: SSH via IAP TCP forwarding only"
fi
echo "✓ firewall ready: relay-allow-iap-ssh (tcp:22 ← IAP 대역)"

# (c) 내부 주문 포트 8091 — Cloud Run → VM.
#     ⚠️ Cloud Run 워크로드에는 네트워크 태그를 붙일 수 없어 source-ranges 로만 좁힌다.
#        서브넷 전체를 허용하므로 방화벽만으로는 부족하다 —
#        relay OrderApi 의 공유 비밀 헤더(gh-radar-relay-order-secret)가 두 번째 방어선이다.
#        (serverless 예약 /28 로 더 좁힐 수도 있으나 Cloud Run 재배포 시 변동 가능)
if ! gcloud compute firewall-rules describe relay-allow-internal-order >/dev/null 2>&1; then
  echo "▶ creating firewall rule: relay-allow-internal-order..."
  run gcloud compute firewall-rules create relay-allow-internal-order \
    --network="$VPC_NAME" --direction=INGRESS --action=ALLOW \
    --rules=tcp:8091 --source-ranges=10.10.0.0/26 --target-tags="$NETWORK_TAG" \
    --description="Phase15 relay: internal order port from Cloud Run subnet only"
fi
echo "✓ firewall ready: relay-allow-internal-order (tcp:8091 ← 서브넷 출발지)"

# ───────────────────────────────────────────────────────────────
# Section 6: VM radar-gw
# ───────────────────────────────────────────────────────────────

# 6.1 VM 생성 전 방화벽 가드 — 규칙이 없는 상태에서 VM 을 띄우면 IAP SSH 로도 못 들어간다.
MISSING_RULES=""
for RULE in relay-allow-https relay-allow-iap-ssh relay-allow-internal-order; do
  if ! gcloud compute firewall-rules describe "$RULE" >/dev/null 2>&1; then
    MISSING_RULES="${MISSING_RULES} ${RULE}"
  fi
done
if [[ -n "$MISSING_RULES" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [dry-run] 방화벽 미생성:${MISSING_RULES} — 실제 실행 시 Section 5 가 먼저 만든다"
  else
    echo "ERROR: 방화벽 규칙이 없어 VM 생성을 중단한다:${MISSING_RULES}" >&2
    echo "Hint: 규칙 0개 상태의 VM 은 IAP SSH 로도 접근할 수 없다 (RESEARCH Pitfall 12)" >&2
    exit 1
  fi
fi
echo "✓ firewall guard passed (VM 생성 전 3규칙 확인)"

# 6.2 VM 자산 존재 확인 (메타데이터로 실어 보낼 파일 전부)
for ASSET in startup.sh kbvpn-fetch-secret.sh kbvpn-connect.sh kbvpn-vpnc-wrapper.sh \
             "openconnect@.service" Caddyfile; do
  if [[ ! -f "${RELAY_ASSET_DIR}/${ASSET}" ]]; then
    echo "ERROR: VM 자산이 없다: infra/relay/${ASSET}" >&2
    exit 1
  fi
done
echo "✓ VM 자산 6종 확인 (startup-script 포함)"

# 6.3 VM 생성 (멱등)
# IP forwarding 옵션은 의도적으로 붙이지 않는다: tun 인터페이스로의 로컬 라우팅에는
#   불필요하고 VM 을 라우터로 만들 이유가 없다(최소권한 · T-15-27).
#   VPN 라우팅 문제가 실측되면 그때 추가한다.
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  echo "✓ VM exists: $VM_NAME (기존 인스턴스 유지 — 재생성하지 않는다)"
  # 자산이 바뀌었을 수 있으므로 메타데이터만 갱신한다. 반영은 재부팅 또는
  # VM 에서 `sudo google_metadata_script_runner startup` 실행 시점.
  echo "▶ VM 메타데이터 갱신 (저장소 자산 → 인스턴스)..."
  run gcloud compute instances add-metadata "$VM_NAME" \
    --zone="$ZONE" \
    --metadata-from-file="$VM_METADATA_FILES"
  echo "✓ VM 메타데이터 갱신 완료 (반영: 재부팅 또는 google_metadata_script_runner startup)"
else
  echo "▶ creating VM: $VM_NAME (e2-micro / Debian 12 / $ZONE)..."
  run gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type=e2-micro \
    --image-family=debian-12 \
    --image-project=debian-cloud \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-balanced \
    --subnet="$SUBNET_NAME" \
    --private-network-ip="$INT_IP_ADDR" \
    --address="$EXT_IP_NAME" \
    --tags="$NETWORK_TAG" \
    --service-account="$SA_EMAIL" \
    --scopes=cloud-platform \
    --metadata-from-file="$VM_METADATA_FILES" \
    --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
    --description="gh-radar DMA relay gateway (Phase 15 RELAY-03)"
fi
echo "✓ VM ready: $VM_NAME"

# ───────────────────────────────────────────────────────────────
# Section 7: 다음 단계 안내 (비밀 값은 출력하지 않는다)
# ───────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [[ "$DRY_RUN" == "1" ]]; then
  echo "✅ setup-relay-iam.sh --dry-run 완료 — GCP 상태 변경 0건"
else
  echo "✅ setup-relay-iam.sh 완료"
fi
echo ""
echo "📌 relay 외부 고정 IP ($EXT_IP_NAME): $RELAY_EXT_IP"
echo "📌 relay 내부 고정 IP ($INT_IP_NAME): $INT_IP_ADDR"
echo ""
echo "🚨 다음 단계 (사용자 작업 · 15-07 체크포인트):"
echo "  1. [BLOCKING · D-06] jx1.io DNS 에 'dma' A 레코드를 위 외부 고정 IP 로 등록한다."
echo "     dig +short dma.jx1.io 가 그 값을 반환하기 전에는 Caddy 를 켜지 않는다"
echo "     (Let's Encrypt rate limit 소진 방지)."
echo "  2. Secret 3종에 값을 주입한다. 값은 대화 로그·커밋·문서에 남기지 않는다:"
echo "       openssl rand -base64 32 | tr -d '\\n' | gcloud secrets versions add gh-radar-dma-cred-key --data-file=-"
echo "       openssl rand -base64 32 | tr -d '\\n' | gcloud secrets versions add gh-radar-relay-order-secret --data-file=-"
echo "       gcloud secrets versions add gh-radar-kb-vpn-password --data-file=-   # KB VPN 자격증명, 사용자가 직접 입력"
echo "  3. IAP 터널로 VM 접속 확인 (실행 주체에 roles/iap.tunnelResourceAccessor 필요):"
echo "       gcloud compute ssh radar-gw --tunnel-through-iap --zone=$ZONE --command='echo ok && free -m'"
echo "  4. [BLOCKING · D-03] VPN 선검증 — infra/relay/README.md 의 7항목 체크리스트를 따른다."
echo "     시도는 수동 최대 3회. 실패해도 자동 재시도하지 않는다 (KB 계정 잠금 방지)."
