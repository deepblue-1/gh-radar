#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-relay.sh
# Phase 15 (RELAY-03) — relay 컨테이너를 GCE VM `radar-gw` 에 배포
#
# 워커 3종 세트(`setup-*-iam.sh` / `deploy-*.sh` / `smoke-*.sh`) 규약을 그대로 따르되
# 두 가지가 다르다:
#   ① 배포 대상이 Cloud Run Job 이 아니라 **VM 위 Docker 컨테이너**다.
#      AR push → IAP SSH → docker pull → docker run (restart 정책 always).
#   ② 알림 근거가 Job 실패 메트릭이 아니라 **uptime check** 다 (ops/alert-relay-down.yaml).
#
# 사용법:
#   GCP_PROJECT_ID=gh-radar \
#   SUPABASE_URL=https://<ref>.supabase.co \
#   NOTIFICATION_CHANNEL_ID=<채널 ID 또는 full resource name> \
#     bash scripts/deploy-relay.sh
#
#   bash scripts/deploy-relay.sh --rollback <이미지 태그>   # 빌드 없이 이전 태그로 복귀
#
#   GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=<채널> bash scripts/deploy-relay.sh --alert-only
#     # KB 알림 정책 + KYOBO 감시 동기화 — 빌드 · VM 배포 · KB uptime check · 컨테이너는 건드리지 않음
#     # (SUPABASE_URL 불필요). 알림 문서(ops/alert-*.yaml)만 고쳤을 때 relay 재배포 없이 쓴다.
#
# KYOBO 감시 (quick-260929-sar): uptime check `gh-radar-kyobo-observer-healthz`(JSONPath
#   `$.journalGateways.KYOBO.alerting` == false) + 정책 `gh-radar-kyobo-observer-down`(ops/alert-kyobo-observer-down.yaml).
#   정본은 **라이브 공개 healthz 본문의 KYOBO 키 유무**다(env 추정 아님). 키가 있으면 만들거나 갱신하고, 없으면
#   정책 → 체크 순서로 지우며, healthz 판정 불가면 손대지 않는다. 전체 배포(Section 6) · --alert-only · --rollback 이
#   같은 함수(sync_kyobo_monitoring)로 동기화한다. KYOBO 체크 생성은 같은 실행에서 KB 정책 check_id 한정이
#   적용된 뒤에만 한다 — check_passed 의 resource 라벨이 host 뿐이라 한정 전이면 새 체크가 KB 알림을 오염시킨다.
#
# 선택 env:
#   DMA_HOST   우선순위: **명시 주입 > 실행 중인 컨테이너 값 보존 > 127.0.0.1 (로컬 mock)**.
#              주입 없이 배포해도 **지금 붙어 있는 게이트웨이가 유지된다** — 배포가 프로덕션
#              상태를 조용히 되돌리지 않는다 (갭 5, 2026-09-09).
#              ⚠️ D-27 과 이 동작은 **다른 문장**이다. D-27 은 「실서버 주소를 **저장소에**
#              **박제하지 않는다**」이고, 저장소에는 지금도 실주소가 기본값으로 적혀 있지
#              않다 — 보존은 오직 런타임 `docker inspect` 조회로만 이뤄진다. 그것을
#              「배포 때 주입하지 말라」로 읽어 배포마다 mock 으로 되돌린 것이
#              16-26(`2cb5620`)·16-35(`c8aa7ae`) 의 프로덕션 강등이었다.
#   LOG_LEVEL  미설정 시 info
#   DMA_KYOBO_HOST  추가 관찰자(교보 게이트웨이 kyobo127 · 키 KYOBO — quick-260929-c8e) 주소.
#              우선순위: **명시 주입 > 실행 중인 컨테이너 값 보존 > 없음(KYOBO 관찰자 없음)**.
#              `off` 는 명시 해제다(보존 규칙을 끊는 유일한 방법). 보존 이유는 DMA_HOST 와 같다(갭 5,
#              2026-09-09 — 주입 없는 배포가 프로덕션 상태를 조용히 되돌리지 않는다). 저장소에는 실주소
#              기본값이 없다(D-27) — 첫 반영 때 배포자가 주입한다. 관찰자 전용이다(사용자 세션은 KB 단일).
#   DMA_KYOBO_PORT  미설정 시 9100
#
# 비밀은 이 스크립트가 만지지 않는다 (T-15-29 · T-19-03):
#   컨테이너 비밀 4종은 **VM 안에서** 메타데이터 토큰 → Secret Manager REST 로 읽어
#   tmpfs env-file(0600)에 쓰고 `docker run --env-file` 로 주입한 뒤 즉시 삭제한다.
#   명령줄로 넘기면 `ps` · `journalctl` · 셸 히스토리에 값이 남는다.
#     gh-radar-supabase-service-role → SUPABASE_SERVICE_ROLE_KEY
#     gh-radar-dma-cred-key          → DMA_CRED_KEY
#     gh-radar-relay-order-secret    → RELAY_ORDER_SECRET
#     gh-radar-dma-observer-secret   → DMA_OBSERVER_SECRET  (Phase 19 D-10 — 관찰자 기록 연결 비밀.
#                                      gh-trade 게이트웨이 `config/observer.toml` 과 **같은 값**이어야 한다.
#                                      relay 는 production 에서 이 값이 없으면 기동을 거부한다.
#                                      값 생성·순환 절차는 infra/relay/README.md §Secret 4종 값 주입)
#     gh-radar-dma-observer-secret-kyobo → DMA_OBSERVER_SECRET_KYOBO  (**선택** — quick-260929-c8e KYOBO 관찰자.
#                                      없거나 ENABLED 버전 · relay SA 접근권이 없으면 KYOBO 관찰자만 생략하고
#                                      KB 배포는 계속된다. 값은 gh-trade kyobo127 `config/observer.toml` 과 같아야 한다.
#                                      위 「비밀 4종」 은 치명 4종을 뜻한다 — 이 비밀은 그 밖이다)
# ═══════════════════════════════════════════════════════════════

MODE=deploy
ROLLBACK_TAG=""
case "${1:-}" in
  "") ;;
  --rollback)
    MODE=rollback
    ROLLBACK_TAG="${2:-}"
    ;;
  --alert-only) MODE=alert-only ;;
  *)
    echo "usage: bash scripts/deploy-relay.sh [--rollback <tag> | --alert-only]" >&2
    exit 1
    ;;
esac

# ───────────────────────────────────────────────────────────────
# Section 1: gcloud guard
# ───────────────────────────────────────────────────────────────
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

# ───────────────────────────────────────────────────────────────
# Section 2: 변수
# ───────────────────────────────────────────────────────────────
VM=radar-gw
ZONE=asia-northeast3-a
REGION=asia-northeast3
REPO=gh-radar
VPC=gh-radar-vpc
CONTAINER=gh-radar-relay
HEALTH_HOST=dma.jx1.io
UPTIME_CHECK=gh-radar-relay-healthz
ALERT_POLICY=gh-radar-relay-down
ALERT_FILE="ops/alert-relay-down.yaml"
# KYOBO 관찰자 감시 (quick-260929-sar). 이름 둘은 KB 이름(gh-radar-relay-healthz · gh-radar-relay-down)을
# 부분 문자열로 품지 않게 정했다 — gcloud displayName 필터 · smoke INV-8 의 「정확히 1건」 보호.
KYOBO_UPTIME_CHECK=gh-radar-kyobo-observer-healthz
KYOBO_ALERT_POLICY=gh-radar-kyobo-observer-down
KYOBO_ALERT_FILE="ops/alert-kyobo-observer-down.yaml"
KYOBO_JSON_PATH='$.journalGateways.KYOBO.alerting'
# 실행 상태: KB 정책(check_id 한정)이 이번 실행에서 적용됐는지 · KYOBO 감시 동기화 결과(요약 줄용).
KB_POLICY_APPLIED=0
KYOBO_MONITOR_RESULT="미실행"
RELAY_SA="gh-radar-relay-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

# uptime check displayName → full resource name(첫 줄). 없거나 조회 실패면 빈 문자열 — **절대 실패하지 않는다**.
# 체크 ID 는 호출부가 `${name##*/}` 로 얻는다.
uptime_check_name() {
  gcloud monitoring uptime list-configs \
    --filter="displayName=$1" --format='value(name)' 2>/dev/null | head -1 || true
}

# 정책 파일 적용(update-or-create). 인자: <displayName> <yaml> <checkId>
#   반환 0 = 적용됨 · 1 = 전제 불충족/치환 잔여로 **적용 거부**(gcloud 미호출) · 2 = gcloud 실패.
# yaml 의 `${NOTIFICATION_CHANNEL_ID}` · `${UPTIME_CHECK_ID}` 를 치환한다. 하나라도 남으면 적용하지 않는다 —
# 필터가 아무것도 못 잡는 조용히 죽은 알림을 만들지 않기 위해서다(T-sar-06).
# ⚠ 호출부는 `if` · `||` 문맥에서 부른다 — bash 는 그 문맥의 함수 안에서 `set -e` 를 멈추므로
#   모든 gcloud 호출의 반환값을 여기서 명시적으로 검사한다.
apply_policy_file() {
  local display="$1" file="$2" check_id="$3"
  local channel resolved existing
  [[ -f "$file" && -n "${NOTIFICATION_CHANNEL_ID:-}" && -n "$check_id" ]] || return 1
  # gcloud monitoring 은 notificationChannels 에 full resource name 을 요구 — ID 만 주어지면 정규화.
  channel="$NOTIFICATION_CHANNEL_ID"
  case "$channel" in
    projects/*) ;;
    *) channel="projects/${EXPECTED_PROJECT}/notificationChannels/${NOTIFICATION_CHANNEL_ID}" ;;
  esac
  resolved=$(mktemp) || return 2
  if ! sed -e "s|\${NOTIFICATION_CHANNEL_ID}|${channel}|g" \
           -e "s|\${UPTIME_CHECK_ID}|${check_id}|g" "$file" > "$resolved"; then
    rm -f "$resolved"; return 2
  fi
  if grep -qF '${' "$resolved"; then
    echo "⚠ $file: 치환 뒤에도 \${…} 토큰이 남았다 — 정책 $display 적용 거부" >&2
    rm -f "$resolved"; return 1
  fi
  existing=$(gcloud alpha monitoring policies list \
    --filter="displayName=${display}" --format='value(name)' 2>/dev/null | head -1) || existing=""
  if [[ -n "$existing" ]]; then
    echo "▶ updating alert policy: ${display} ..."
    gcloud alpha monitoring policies update "$existing" --policy-from-file="$resolved" >/dev/null \
      || { rm -f "$resolved"; return 2; }
  else
    echo "▶ creating alert policy: ${display} ..."
    gcloud alpha monitoring policies create --policy-from-file="$resolved" >/dev/null \
      || { rm -f "$resolved"; return 2; }
  fi
  rm -f "$resolved"
  return 0
}

# KB 알림 정책 update-or-create. **Section 6(전체 배포)과 `--alert-only` 가 같은 이 함수를 쓴다** —
# 두 벌로 적으면 언젠가 한쪽만 고쳐진다 (quick-260925-o1s).
# 필터의 `${UPTIME_CHECK_ID}` 는 KB 체크 ID 로 치환한다(quick-260929-sar — 같은 host 의 KYOBO 체크와 격리).
# 적용에 성공해야만 KB_POLICY_APPLIED=1 — KYOBO 체크 생성은 이 값을 게이트로 쓴다.
apply_alert_policy() {
  local kb_check_name rc
  # NOTIFICATION_CHANNEL_ID 는 **선택**이다. 없다고 배포를 실패시키면 안 된다 —
  # `set -e` 로 여기서 죽으면 아래 최종 요약(무엇이 어디에 붙었는지)이 아예 출력되지 않아,
  # 잘못된 DMA_HOST 로 뜬 것을 배포자가 못 본다 (2026-09-06 실장애).
  if [[ -f "$ALERT_FILE" && -z "${NOTIFICATION_CHANNEL_ID:-}" ]]; then
    echo "⚠ NOTIFICATION_CHANNEL_ID 미설정 — 알림 정책 단계 건너뜀 (배포 자체는 완료됨)" >&2
    echo "  기존 정책이 있으면 그대로 유효합니다. 새로 걸려면 채널 ID 를 넣고 재실행하세요." >&2
  elif [[ -f "$ALERT_FILE" ]]; then
    kb_check_name="$(uptime_check_name "$UPTIME_CHECK")"
    if [[ -z "$kb_check_name" ]]; then
      echo "⚠ KB uptime check ID 해석 실패 — 알림 정책 단계 건너뜀(기존 정책 유지)" >&2
      return 0
    fi
    rc=0
    apply_policy_file "$ALERT_POLICY" "$ALERT_FILE" "${kb_check_name##*/}" || rc=$?
    case "$rc" in
      0)
        KB_POLICY_APPLIED=1
        echo "✓ Alert policy ready: $ALERT_POLICY"
        ;;
      1)
        echo "⚠ KB 알림 정책 치환 거부 — $ALERT_POLICY 적용 건너뜀(기존 정책 유지)" >&2
        ;;
      *)
        # 종전에는 set -e 로 여기서 죽었다 — 동작을 같게 둔다(문서 크기 초과 등 · docs/relay-operations.md).
        echo "ERROR: 알림 정책 $ALERT_POLICY 적용 실패 (gcloud)" >&2
        exit 1
        ;;
    esac
  fi
  return 0
}

# KYOBO 관찰자 감시 동기화 (quick-260929-sar). **비치명** — 본문에 exit 가 없고 항상 return 0,
# 결과는 KYOBO_MONITOR_RESULT 로 남긴다. 평문 호출이라 set -e 가 살아 있으므로 실패할 수 있는 명령마다
# `|| true` 또는 `|| { KYOBO_MONITOR_RESULT="실패: …"; return 0; }` 를 붙인다.
# 정본은 공개 healthz 본문의 journalGateways.KYOBO 키 유무다:
#   present → 체크 create/update + 정책 적용 · absent → 정책 → 체크 삭제 · unknown → 손대지 않음.
sync_kyobo_monitoring() {
  local body verdict KYOBO_UPTIME_NAME KYOBO_POLICY_NAME rc deleted=""
  # (a) 본문만 읽는다. -f 금지 — 장중 KB 503 본문에도 journalGateways 가 실린다.
  body="$(curl -s --max-time 10 "https://${HEALTH_HOST}/healthz" 2>/dev/null || true)"
  # (b) present / absent / unknown:<사유>
  verdict="$(printf '%s' "$body" | python3 -c '
import json, sys
raw = sys.stdin.read()
if not raw.strip():
    print("unknown:빈 본문 또는 무응답"); sys.exit(0)
try:
    d = json.loads(raw)
except Exception:
    print("unknown:JSON 아님"); sys.exit(0)
if not isinstance(d, dict):
    print("unknown:JSON 객체 아님"); sys.exit(0)
g = d.get("journalGateways")
print("present" if isinstance(g, dict) and isinstance(g.get("KYOBO"), dict) else "absent")
' 2>/dev/null || true)"
  [[ -n "$verdict" ]] || verdict="unknown:판정 실패"

  if [[ "$verdict" == unknown:* ]]; then
    echo "⚠ KYOBO 감시: healthz 판정 불가 (${verdict#unknown:}) — 기존 상태 유지" >&2
    KYOBO_MONITOR_RESULT="판정 불가 — 기존 상태 유지"
    return 0
  fi

  # (c) 기존 자원(목록 조회 — describe 는 쓰지 않는다)
  KYOBO_UPTIME_NAME="$(uptime_check_name "$KYOBO_UPTIME_CHECK")"
  KYOBO_POLICY_NAME="$(gcloud alpha monitoring policies list \
    --filter="displayName=${KYOBO_ALERT_POLICY}" --format='value(name)' 2>/dev/null | head -1 || true)"

  # (e) absent — KYOBO 가 꺼졌거나 옛 이미지다. 남은 JSONPath 체크는 영구 실패하므로 지운다(정책 먼저).
  if [[ "$verdict" == absent ]]; then
    if [[ -n "$KYOBO_POLICY_NAME" ]]; then
      echo "▶ KYOBO 감시 정책 삭제: ${KYOBO_ALERT_POLICY} ..."
      gcloud alpha monitoring policies delete "$KYOBO_POLICY_NAME" --quiet >/dev/null \
        || { KYOBO_MONITOR_RESULT="실패: KYOBO 정책 삭제"; return 0; }
      deleted=1
    fi
    if [[ -n "$KYOBO_UPTIME_NAME" ]]; then
      echo "▶ KYOBO 감시 체크 삭제: ${KYOBO_UPTIME_CHECK} ..."
      gcloud monitoring uptime delete "$KYOBO_UPTIME_NAME" --quiet >/dev/null \
        || { KYOBO_MONITOR_RESULT="실패: KYOBO 체크 삭제"; return 0; }
      deleted=1
    fi
    if [[ -n "$deleted" ]]; then
      KYOBO_MONITOR_RESULT="없음 — KYOBO 꺼짐(감시 삭제)"
    else
      KYOBO_MONITOR_RESULT="없음"
    fi
    return 0
  fi

  # present
  if [[ -z "$KYOBO_UPTIME_NAME" ]]; then
    # (f) 생성은 KB 정책 check_id 한정이 이번 실행에서 적용된 뒤에만 (T-sar-01).
    if [[ "$KB_POLICY_APPLIED" != 1 ]]; then
      echo "⚠ KB 정책 check_id 한정이 이번 실행에서 확인되지 않아 KYOBO 체크 생성을 보류" >&2
      KYOBO_MONITOR_RESULT="생성 보류"
      return 0
    fi
    echo "▶ KYOBO 감시 체크 create: ${KYOBO_UPTIME_CHECK} ..."
    gcloud monitoring uptime create "$KYOBO_UPTIME_CHECK" \
      --resource-type=uptime-url \
      --resource-labels="host=${HEALTH_HOST},project_id=${EXPECTED_PROJECT}" \
      --protocol=https \
      --port=443 \
      --path=/healthz \
      --period=1 \
      --timeout=10 \
      --validate-ssl=true \
      --status-classes=2xx,5xx \
      --matcher-type=matches-json-path \
      --json-path="$KYOBO_JSON_PATH" \
      --json-path-matcher-type=exact-match \
      --matcher-content=false >/dev/null \
      || { KYOBO_MONITOR_RESULT="실패: KYOBO 체크 생성"; return 0; }
    KYOBO_UPTIME_NAME="$(uptime_check_name "$KYOBO_UPTIME_CHECK")"
    if [[ -z "$KYOBO_UPTIME_NAME" ]]; then
      KYOBO_MONITOR_RESULT="실패: KYOBO 체크 생성 후 ID 조회"
      return 0
    fi
  else
    # (g) 이미 있음 — update 는 반복 필드가 --set-status-classes(전량 치환)다.
    echo "▶ KYOBO 감시 체크 update: ${KYOBO_UPTIME_CHECK} ..."
    gcloud monitoring uptime update "$KYOBO_UPTIME_NAME" \
      --period=1 --timeout=10 --validate-ssl=true --set-status-classes=2xx,5xx \
      --matcher-type=matches-json-path \
      --json-path="$KYOBO_JSON_PATH" \
      --json-path-matcher-type=exact-match \
      --matcher-content=false >/dev/null \
      || { KYOBO_MONITOR_RESULT="실패: KYOBO 체크 갱신"; return 0; }
  fi

  # (h) 정책
  if [[ -z "${NOTIFICATION_CHANNEL_ID:-}" ]]; then
    KYOBO_MONITOR_RESULT="체크만 — 정책 건너뜀(NOTIFICATION_CHANNEL_ID 미설정)"
    return 0
  fi
  rc=0
  apply_policy_file "$KYOBO_ALERT_POLICY" "$KYOBO_ALERT_FILE" "${KYOBO_UPTIME_NAME##*/}" || rc=$?
  if [[ "$rc" == 0 ]]; then
    KYOBO_MONITOR_RESULT="켜짐 (체크 ${KYOBO_UPTIME_NAME##*/} · 정책 ${KYOBO_ALERT_POLICY})"
  else
    KYOBO_MONITOR_RESULT="실패: 정책 적용"
  fi
  return 0
}

# --alert-only: KB 알림 정책 + KYOBO 감시 동기화만 하고 끝낸다. SUPABASE_URL 가드와 IAP SSH(DMA_HOST 조회)보다
# **앞**이라 둘 다 요구·실행하지 않는다. 빌드·VM 배포·KB uptime check · 컨테이너는 건드리지 않는다.
if [[ "$MODE" == alert-only ]]; then
  if [[ ! -f "$ALERT_FILE" ]]; then
    echo "ERROR: $ALERT_FILE 이 없습니다 — 저장소 루트에서 실행하세요" >&2
    exit 1
  fi
  # 전체 경로와 달리 여기서는 알림 정책 갱신이 유일한 목적이라 건너뛰지 않고 실패한다.
  if [[ -z "${NOTIFICATION_CHANNEL_ID:-}" ]]; then
    echo "ERROR: --alert-only 는 NOTIFICATION_CHANNEL_ID 가 필요합니다" >&2
    exit 1
  fi
  apply_alert_policy
  # KB 한정이 적용되지 않았으면 KYOBO 체크를 만들 수 없다(오염 방지) — 여기서는 목적 실패다.
  if [[ "$KB_POLICY_APPLIED" != 1 ]]; then
    echo "ERROR: KB 알림 정책 미적용 — KYOBO 감시 동기화 중단" >&2
    exit 1
  fi
  sync_kyobo_monitoring
  if [[ "$KYOBO_MONITOR_RESULT" == 실패* ]]; then
    echo "✗ KYOBO 감시 실패: ${KYOBO_MONITOR_RESULT#실패: }" >&2
    exit 1
  fi
  echo "✓ KYOBO 감시: $KYOBO_MONITOR_RESULT"
  echo "  (--alert-only: relay 컨테이너 · KB uptime check 는 건드리지 않았습니다 — KYOBO 감시는 healthz 실측에 맞춰 동기화)"
  exit 0
fi

SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/relay:${SHA}"
IMAGE_LATEST="${REGISTRY}/relay:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or .env.deploy)}"

# 컨테이너 env (비밀 아님). 값은 아래 remote head 로만 전달된다.
LOG_LEVEL="${LOG_LEVEL:-info}"
WS_PORT=8090
ORDER_API_PORT=8091
DMA_PORT=9100
DMA_KYOBO_PORT="${DMA_KYOBO_PORT:-9100}"
DMA_BROKER=KB

# 돌고 있는 컨테이너의 env 값 하나(인자 KEY)를 되읽는다. **배포 전(기본값 결정)과 배포 후(최종 요약)가**
# **같은 이 함수를 쓴다** — 두 벌로 적으면 언젠가 한쪽만 고쳐진다 (T-16-14). DMA_HOST · DMA_KYOBO_HOST 공용.
# 실패(VM 접근 불가 · 컨테이너 부재 · 최초 배포)는 **정상 경로**다. 빈 문자열을 돌려주고
# 호출부가 다음 순위로 넘어간다. `set -e` 아래이므로 호출부는 `|| true` 를 붙인다.
# ⚠️ docker inspect 의 Env 에는 비밀도 들어 있다 — **비밀 키 이름(…_SECRET* · …_KEY)으로는 부르지 않는다**
#    (T-c8e-01). 값이 로컬 터미널에 찍힌다. 주소 · 포트 같은 공개 설정만 되읽는다.
read_live_env() {
  local KEY="$1"
  # 식별자만 받는다 — sed 식에 그대로 들어가므로.
  [[ "$KEY" =~ ^[A-Z_][A-Z0-9_]*$ ]] || return 1
  gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap --command \
    "sudo docker inspect $CONTAINER --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^${KEY}=//p'" \
    2>/dev/null | tr -d '\r' | tail -1
}

# 종전 호출부 두 곳(배포 전 해석 · 최종 요약)이 그대로 쓰는 한 줄 래퍼.
read_live_dma_host() { read_live_env DMA_HOST; }

# KYOBO 관찰자 호스트 해석 (quick-260929-c8e). **명령을 실행하지 않고 다른 전역을 보지 않는다** —
# 입력 전역 DMA_KYOBO_HOST_INJECTED · CURRENT_KYOBO_HOST → 출력 KYOBO_HOST · KYOBO_HOST_SOURCE(항상 비어 있지 않음).
# 우선순위: off(명시 해제) > 명시 주입 > 실행 중 컨테이너 보존 > 미설정.
resolve_kyobo_host() {
  if [[ "$DMA_KYOBO_HOST_INJECTED" == "off" ]]; then
    KYOBO_HOST=""
    KYOBO_HOST_SOURCE="명시 해제(off)"
  elif [[ -n "$DMA_KYOBO_HOST_INJECTED" ]]; then
    KYOBO_HOST="$DMA_KYOBO_HOST_INJECTED"
    KYOBO_HOST_SOURCE="명시 주입"
  elif [[ -n "$CURRENT_KYOBO_HOST" ]]; then
    KYOBO_HOST="$CURRENT_KYOBO_HOST"
    KYOBO_HOST_SOURCE="실행 중 컨테이너 보존"
  else
    KYOBO_HOST=""
    KYOBO_HOST_SOURCE="미설정"
  fi
}

# D-27 / T-15-30 — 이 스크립트에는 실서버 주소가 **기본값으로 적히지 않는다.** 값은
# 배포자의 명시 주입이거나, 지금 돌고 있는 컨테이너에서 런타임으로 읽어 온 것이다.
#
# 갭 5 (2026-09-09) — 종전 해석은 미주입 시 무조건 `127.0.0.1` 로 떨어져 **현재 컨테이너 값을**
# **보존하지 않아**, 주입 없는 배포가 실 게이트웨이를 로컬 mock 으로 되돌렸다. mock 은 VM 에
# 기동돼 있지도 않아 `connect ECONNREFUSED 127.0.0.1:9100` 이 된다. Phase 16 에서 **두 번**
# 일어났다(16-26 `2cb5620` · 16-35 `c8aa7ae`). 두 executor 다 D-27 을 「주입하지 말라」로
# 읽고 그 강등을 의도된 상태로 기록했다. **「저장소에 박제하지 않는다」와 「배포마다 mock 으로**
# **되돌린다」는 다른 문장이다** — 이 오독을 되풀이하지 않도록 우선순위를 아래 한 줄에 모아 둔다.
#
# 우선순위: 명시 주입 > 실행 중인 컨테이너 값 > 로컬 mock
DMA_HOST_INJECTED="${DMA_HOST:-}"
echo "▶ 현재 컨테이너 DMA_HOST 조회 ..."
CURRENT_DMA_HOST="$(read_live_dma_host || true)"
DMA_HOST="${DMA_HOST_INJECTED:-${CURRENT_DMA_HOST:-127.0.0.1}}"
if [[ -n "$DMA_HOST_INJECTED" ]]; then
  DMA_HOST_SOURCE="명시 주입"
elif [[ -n "$CURRENT_DMA_HOST" ]]; then
  DMA_HOST_SOURCE="실행 중 컨테이너 보존"
else
  DMA_HOST_SOURCE="기본값(로컬 mock)"
fi

# 값이 바뀌는 배포는 **변경 전/후를 나란히** 찍는다. 강등(실주소 → mock)이든 승격이든
# 배포자가 그 자리에서 본다. 같으면 조용히 한 줄만 남긴다.
if [[ -z "$CURRENT_DMA_HOST" ]]; then
  echo "  현재 값 확인 실패 — 기본값을 쓴다 (VM 접근 불가 · 컨테이너 부재 · 최초 배포)"
elif [[ "$CURRENT_DMA_HOST" == "$DMA_HOST" ]]; then
  echo "  현재 컨테이너 DMA_HOST=$CURRENT_DMA_HOST — 이번 배포로 바뀌지 않는다"
else
  echo "⚠ DMA_HOST 가 이번 배포로 바뀝니다:  $CURRENT_DMA_HOST  →  $DMA_HOST  (출처: $DMA_HOST_SOURCE)" >&2
  if [[ "$DMA_HOST" == "127.0.0.1" ]]; then
    echo "  이것은 실서버 → 로컬 mock **강등**입니다. 의도한 것이 아니면 중단하고" >&2
    echo "  현재 값을 명시 주입해 다시 실행하세요: DMA_HOST=$CURRENT_DMA_HOST bash scripts/deploy-relay.sh" >&2
  fi
fi

# KYOBO 관찰자 호스트 (quick-260929-c8e) — 같은 보존 규칙(명시 > 실행 중 보존 > 없음 · off = 명시 해제).
DMA_KYOBO_HOST_INJECTED="${DMA_KYOBO_HOST:-}"
echo "▶ 현재 컨테이너 DMA_KYOBO_HOST 조회 ..."
CURRENT_KYOBO_HOST="$(read_live_env DMA_KYOBO_HOST || true)"
resolve_kyobo_host
if [[ "$CURRENT_KYOBO_HOST" == "$KYOBO_HOST" ]]; then
  echo "  현재 컨테이너 DMA_KYOBO_HOST=${CURRENT_KYOBO_HOST:-<없음>} — 이번 배포로 바뀌지 않는다 (출처: $KYOBO_HOST_SOURCE)"
else
  echo "⚠ DMA_KYOBO_HOST 가 이번 배포로 바뀝니다:  ${CURRENT_KYOBO_HOST:-<없음>}  →  ${KYOBO_HOST:-<없음>}  (출처: $KYOBO_HOST_SOURCE)" >&2
fi

if [[ "$DMA_HOST" == "10.41.1.120" ]]; then
  echo "⚠ 실서버 접속 모드 — 사용자 지시가 있었는지 확인하세요 (D-27)" >&2
  echo "  이 phase 의 기본 검증 대상은 로컬 mock 이며, 실서버 접속 검증은 15-20 소관입니다." >&2
fi

if [[ "$MODE" == rollback ]]; then
  if [[ -z "$ROLLBACK_TAG" ]]; then
    echo "ERROR: --rollback 은 이미지 태그가 필요합니다. 사용 가능한 태그:" >&2
    gcloud artifacts docker tags list "${REGISTRY}/relay" --format='value(tag)' 2>/dev/null | tail -10 >&2
    exit 1
  fi
  TARGET_IMAGE="${REGISTRY}/relay:${ROLLBACK_TAG}"
  APP_VERSION="$ROLLBACK_TAG"
else
  TARGET_IMAGE="$IMAGE"
  APP_VERSION="$SHA"
fi
echo "✓ variables: mode=$MODE SHA=$SHA TARGET=$TARGET_IMAGE DMA_HOST=$DMA_HOST DMA_KYOBO_HOST=${KYOBO_HOST:-<없음>}"
# 「무슨 값이냐」만으로는 부족하다 — **어디서 왔느냐**가 강등을 알아채는 유일한 단서다.
# rollback 경로도 위의 같은 해석을 이미 지나왔으므로 여기서 함께 찍힌다.
echo "  DMA_HOST 출처: $DMA_HOST_SOURCE (배포 전 컨테이너 값=${CURRENT_DMA_HOST:-<확인 실패>})"

# ───────────────────────────────────────────────────────────────
# Section 3: 선행 리소스 검증
#   실패하면 setup-relay-iam.sh 를 먼저 돌리라고 안내하고 중단한다.
# ───────────────────────────────────────────────────────────────
SETUP_HINT="Run: GCP_PROJECT_ID=${EXPECTED_PROJECT} bash scripts/setup-relay-iam.sh"

VM_STATUS=$(gcloud compute instances describe "$VM" --zone="$ZONE" --format='value(status)' 2>/dev/null || true)
if [[ "$VM_STATUS" != "RUNNING" ]]; then
  echo "ERROR: VM '$VM' 상태가 RUNNING 이 아닙니다 (status=${VM_STATUS:-NOT_FOUND}). $SETUP_HINT" >&2
  exit 1
fi
echo "✓ VM RUNNING: $VM ($ZONE)"

# 컨테이너에 주입하는 비밀 4종. 존재 + ENABLED 버전 + relay SA 접근권까지 본다.
# (`gh-radar-kb-vpn-password` 는 host systemd 소관이라 컨테이너 배포의 전제가 아니다.)
# 관찰자 비밀(Phase 19 D-10)이 빠진 채 배포하면 relay 가 production 기동을 거부해 재시작 루프에 빠진다 —
# 컨테이너를 내리기 **전에** 여기서 막는다(T-19-36).
for SECRET_NAME in gh-radar-supabase-service-role gh-radar-dma-cred-key gh-radar-relay-order-secret gh-radar-dma-observer-secret; do
  if ! gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET_NAME' not found. $SETUP_HINT" >&2
    exit 1
  fi
  VERSION_COUNT=$(gcloud secrets versions list "$SECRET_NAME" --filter='state=ENABLED' \
    --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "${VERSION_COUNT:-0}" -lt 1 ]]; then
    echo "ERROR: Secret '$SECRET_NAME' 에 ENABLED 버전이 없습니다 — 값 주입이 선행돼야 합니다." >&2
    echo "       (값은 대화·커밋에 남기지 않는다. infra/relay/README.md §Secret 4종 값 주입 참조)" >&2
    exit 1
  fi
  if ! gcloud secrets get-iam-policy "$SECRET_NAME" --format='value(bindings.members)' 2>/dev/null \
      | grep -q "$RELAY_SA"; then
    echo "ERROR: '$RELAY_SA' 에 Secret '$SECRET_NAME' 접근권이 없습니다. $SETUP_HINT" >&2
    exit 1
  fi
done
echo "✓ Secret 4종 존재 + ENABLED 버전 + relay SA 접근권"

# KYOBO 관찰자 비밀 사전 점검 (quick-260929-c8e) — **비치명**이다. 위 치명 4종 루프 밖이고 절대 exit 하지 않는다.
# 하나라도 실패하면 KYOBO 관찰자만 생략하고(KYOBO_HOST 비움 → env-file 에 KYOBO 3줄 없음) KB 단독으로 배포한다.
# (`set -eo pipefail` 아래라 파이프 대입에는 `|| true` 를 붙인다 — 여기서 죽으면 KB 배포까지 막힌다.)
KYOBO_SECRET_NAME=gh-radar-dma-observer-secret-kyobo
if [[ -z "$KYOBO_HOST" ]]; then
  echo "  KYOBO 관찰자 없음 (${KYOBO_HOST_SOURCE}) — KB 단독"
else
  KYOBO_SKIP_REASON=""
  if ! gcloud secrets describe "$KYOBO_SECRET_NAME" >/dev/null 2>&1; then
    KYOBO_SKIP_REASON="Secret '$KYOBO_SECRET_NAME' 없음"
  else
    KYOBO_VERSION_COUNT=$(gcloud secrets versions list "$KYOBO_SECRET_NAME" --filter='state=ENABLED' \
      --format='value(name)' 2>/dev/null | wc -l | tr -d ' ' || true)
    if [[ "${KYOBO_VERSION_COUNT:-0}" -lt 1 ]]; then
      KYOBO_SKIP_REASON="Secret '$KYOBO_SECRET_NAME' 에 ENABLED 버전 없음"
    elif ! gcloud secrets get-iam-policy "$KYOBO_SECRET_NAME" --format='value(bindings.members)' 2>/dev/null \
        | grep -q "$RELAY_SA"; then
      KYOBO_SKIP_REASON="'$RELAY_SA' 에 Secret '$KYOBO_SECRET_NAME' 접근권 없음"
    fi
  fi
  if [[ -n "$KYOBO_SKIP_REASON" ]]; then
    echo "⚠ KYOBO 관찰자 생략: ${KYOBO_SKIP_REASON} — KB 단독으로 배포한다 (infra/relay/README.md §다중 게이트웨이 관찰자)" >&2
    KYOBO_HOST=""
  else
    echo "✓ KYOBO 관찰자 비밀 확인 ($KYOBO_SECRET_NAME · ENABLED · relay SA 접근권) — KYOBO=$KYOBO_HOST:$DMA_KYOBO_PORT"
  fi
fi

# relay VM 에 닿는 방화벽은 **정확히 4규칙**이어야 한다. 포트 80 규칙이 늘어나면 D-09
# 위반이므로 이름까지 본다.
# (`--filter='... AND allowed.ports=80'` 형태는 기대대로 걸러지지 않는다 — 목록을 읽는다.)
#
# ★ 판정 대상은 **VPC 전체가 아니라 relay VM 표면**이다 (2026-09-20, Phase 17 배포).
#   이 VPC 는 gh-trade 와 공유한다. gh-trade 가 자기 빌드 머신용으로 `build-ssh` 태그
#   규칙(`gh-trade-builder-ssh` tcp:22 · `gh-trade-builder-dma` tcp:9100-9110, 둘 다
#   고정 /32 출처)을 올리자 VPC 전체 목록 비교가 불일치로 exit 1 해 배포가 막혔다.
#   그 규칙들은 `radar-gw` 를 겨냥하지 않으므로 이 가드가 지키려는 표면과 무관하고,
#   `setup-relay-iam.sh` 로 "정리"하면 남의 프로젝트 빌더가 끊긴다.
#   그래서 **`radar-gw` 를 겨냥한 규칙 + 태그 없는(= 전 인스턴스 적용) 규칙**만 본다.
#   태그 없는 규칙을 포함하는 것이 핵심이다 — 대상 태그가 비면 relay VM 에도 걸린다.
#
# ⚠️ 적용 순서는 **방화벽 먼저 → 배포**다. 4번째 규칙(개발기 WireGuard 직결 udp:51820,
#    quick-260909-muo)이 아직 GCP 에 없으면 이 게이트가 불일치로 exit 1 해 배포가 통째로
#    막힌다. 먼저 `GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh` 로 규칙을
#    만든 뒤 이 스크립트를 돌린다 (infra/relay/README.md §적용 런북).
FW_RULES=$(gcloud compute firewall-rules list --filter="network=${VPC}" \
  --format='value(name,targetTags.list())' \
  | awk -F'\t' -v tag="$VM" '$2 == "" || index($2, tag) { print $1 }' | sort | tr '\n' ' ')
EXPECTED_FW="relay-allow-https relay-allow-iap-ssh relay-allow-internal-order relay-allow-wireguard "
if [[ "$FW_RULES" != "$EXPECTED_FW" ]]; then
  echo "ERROR: ${VPC} 에서 ${VM} 에 닿는 방화벽 규칙이 기대와 다릅니다." >&2
  echo "  expected: $EXPECTED_FW" >&2
  echo "  actual  : $FW_RULES" >&2
  echo "  (${VM} 을 겨냥하지 않는 타 프로젝트 규칙은 판정에서 제외됩니다)" >&2
  echo "  $SETUP_HINT" >&2
  exit 1
fi
echo "✓ ${VM} 대상 방화벽 4규칙 (포트 80 규칙 없음)"

# ───────────────────────────────────────────────────────────────
# Section 4: amd64 빌드 + push  (rollback 에서는 건너뛴다)
#   VM 은 x86_64 인데 개발기는 arm64 Mac 이다. 플랫폼을 고정하지 않으면
#   `exec format error` 로 컨테이너가 즉시 죽는다.
# ───────────────────────────────────────────────────────────────
if [[ "$MODE" == deploy ]]; then
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null 2>&1 || true

  echo "▶ docker build..."
  docker build \
    --platform=linux/amd64 \
    --build-arg "GIT_SHA=${SHA}" \
    -f relay/Dockerfile \
    -t "$IMAGE" -t "$IMAGE_LATEST" .

  echo "▶ docker push..."
  docker push "$IMAGE"
  docker push "$IMAGE_LATEST"
  echo "✓ pushed: $IMAGE"
else
  if ! gcloud artifacts docker images describe "$TARGET_IMAGE" >/dev/null 2>&1; then
    echo "ERROR: rollback 대상 이미지가 없습니다: $TARGET_IMAGE" >&2
    exit 1
  fi
  echo "✓ rollback 대상 이미지 확인: $TARGET_IMAGE"
fi

# ───────────────────────────────────────────────────────────────
# Section 5: VM 배포 (IAP SSH)
#
#   원격 스크립트는 base64 로 감싸 넘긴다. `--command` 문자열에 따옴표가 섞이면
#   로컬 셸 → gcloud → ssh → 원격 셸 4중 인용을 통과하며 조용히 깨진다.
#
#   head(공개 설정) + body(리터럴) 로 나눈 이유: body 를 인용 heredoc 으로 두면
#   원격에서 쓰는 `$VAR` 가 로컬에서 전개되지 않는다. 비밀은 head 에도 body 에도 없다.
# ───────────────────────────────────────────────────────────────
REMOTE_HEAD=$(printf 'PROJECT=%q\nTARGET_IMAGE=%q\nCONTAINER=%q\nAPP_VERSION=%q\nLOG_LEVEL=%q\nSUPABASE_URL=%q\nWS_PORT=%q\nORDER_API_PORT=%q\nDMA_HOST=%q\nDMA_PORT=%q\nDMA_BROKER=%q\nDMA_KYOBO_HOST=%q\nDMA_KYOBO_PORT=%q\n' \
  "$EXPECTED_PROJECT" "$TARGET_IMAGE" "$CONTAINER" "$APP_VERSION" "$LOG_LEVEL" \
  "$SUPABASE_URL" "$WS_PORT" "$ORDER_API_PORT" "$DMA_HOST" "$DMA_PORT" "$DMA_BROKER" \
  "$KYOBO_HOST" "$DMA_KYOBO_PORT")

REMOTE_BODY=$(cat <<'REMOTE_BODY_EOF'
set -euo pipefail
log() { printf '  [vm] %s\n' "$*"; }

MD_URL="http://metadata.google.internal/computeMetadata/v1"
MD_HDR="Metadata-Flavor: Google"

# Secret Manager REST 접근용 액세스 토큰. VM 에 gcloud 를 설치하지 않아도 된다.
ACCESS_TOKEN="$(curl -sf -H "$MD_HDR" "${MD_URL}/instance/service-accounts/default/token" \
  | python3 -c 'import sys, json; print(json.load(sys.stdin)["access_token"])')"
[ -n "$ACCESS_TOKEN" ] || { echo "메타데이터 액세스 토큰 획득 실패" >&2; exit 1; }

fetch_secret() {
  curl -sf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/$1/versions/latest:access" \
    | python3 -c 'import sys, json, base64; print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode("utf-8").rstrip("\r\n"), end="")'
}

# Artifact Registry 토큰은 1시간 만료 — pull 직전에 로그인한다.
/usr/local/sbin/relay-docker-login >/dev/null
log "Artifact Registry 로그인"

docker pull "$TARGET_IMAGE" >/dev/null
log "pull 완료: $TARGET_IMAGE"

# `docker login` 은 액세스 토큰을 /root/.docker/config.json 에 **평문으로** 남긴다
# (docker 가 경고로 알려 준다). 이미지를 이미 받았으니 자격증명을 붙들고 있을 이유가 없다 —
# 재시작 정책은 로컬 이미지를 쓰므로 로그아웃해도 컨테이너 복구에 지장이 없다.
docker logout "$(echo "$TARGET_IMAGE" | cut -d/ -f1)" >/dev/null 2>&1 || true

# ── 비밀 4종 → tmpfs env-file (T-15-29 · T-19-03) ─────────────────
# /dev/shm 는 tmpfs 라 디스크에 닿지 않는다. 0600 + trap 삭제로 실행 직후 사라진다.
umask 077
ENV_FILE="$(mktemp /dev/shm/relay-env.XXXXXXXX)"
trap 'rm -f "$ENV_FILE"' EXIT
chmod 600 "$ENV_FILE"

SB_KEY="$(fetch_secret gh-radar-supabase-service-role)"
CRED_KEY="$(fetch_secret gh-radar-dma-cred-key)"
ORDER_SECRET="$(fetch_secret gh-radar-relay-order-secret)"
OBS_SECRET="$(fetch_secret gh-radar-dma-observer-secret)"
# KYOBO 관찰자 비밀(quick-260929-c8e) — **비치명**. 호스트가 넘어온 때만 읽고, 실패하면 KYOBO 없이 기동한다.
KYOBO_SECRET=""
if [ -n "$DMA_KYOBO_HOST" ]; then
  KYOBO_SECRET="$(fetch_secret gh-radar-dma-observer-secret-kyobo || true)"
  if [ -z "$KYOBO_SECRET" ]; then
    log "KYOBO 비밀 획득 실패 — KYOBO 관찰자 없이 기동 (KB 무영향)"
    DMA_KYOBO_HOST=""
  fi
fi
# 빈 값 검사 — 값이 아니라 **어느 키가 비었는지**만 남긴다.
[ -n "$SB_KEY" ]       || { echo "빈 비밀: supabase service role" >&2; exit 1; }
[ -n "$CRED_KEY" ]     || { echo "빈 비밀: dma cred key" >&2; exit 1; }
[ -n "$ORDER_SECRET" ] || { echo "빈 비밀: relay order secret" >&2; exit 1; }
[ -n "$OBS_SECRET" ]   || { echo "빈 비밀: dma observer secret" >&2; exit 1; }
if [ -n "$DMA_KYOBO_HOST" ]; then KYOBO_NOTE="KYOBO 포함"; else KYOBO_NOTE="KYOBO 없음"; fi
log "비밀 4종 획득 (값은 기록하지 않음) · ${KYOBO_NOTE}"

{
  printf 'NODE_ENV=production\n'
  printf 'LOG_LEVEL=%s\n' "$LOG_LEVEL"
  printf 'APP_VERSION=%s\n' "$APP_VERSION"
  printf 'SUPABASE_URL=%s\n' "$SUPABASE_URL"
  printf 'WS_PORT=%s\n' "$WS_PORT"
  printf 'ORDER_API_PORT=%s\n' "$ORDER_API_PORT"
  printf 'DMA_HOST=%s\n' "$DMA_HOST"
  printf 'DMA_PORT=%s\n' "$DMA_PORT"
  printf 'DMA_BROKER=%s\n' "$DMA_BROKER"
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SB_KEY"
  printf 'DMA_CRED_KEY=%s\n' "$CRED_KEY"
  printf 'RELAY_ORDER_SECRET=%s\n' "$ORDER_SECRET"
  printf 'DMA_OBSERVER_SECRET=%s\n' "$OBS_SECRET"
  # KYOBO 관찰자 — 호스트와 비밀이 모두 있을 때만 3줄. 없으면 relay 는 KB 단독(오늘과 같다).
  if [ -n "$DMA_KYOBO_HOST" ]; then
    printf 'DMA_KYOBO_HOST=%s\n' "$DMA_KYOBO_HOST"
    printf 'DMA_KYOBO_PORT=%s\n' "$DMA_KYOBO_PORT"
    printf 'DMA_OBSERVER_SECRET_KYOBO=%s\n' "$KYOBO_SECRET"
  fi
} > "$ENV_FILE"

# ── 컨테이너 교체 ──────────────────────────────────────────────
# kill → 3초 → rm (quick-261006-pdw):
#   rm -f 는 json 로그 파일을 즉시 지운다. VM 의 Ops Agent 가 옛 파일의 마지막
#   줄까지 읽어 Cloud Logging(relay_docker)에 싣도록 3초를 준다.
#   · kill 기본 신호는 rm -f 와 같은 SIGKILL 이라 relay 종료 의미는 그대로다.
#   · kill 은 수동 정지로 표시돼 restart=always 가 되살리지 않는다.
#   · 첫 배포(컨테이너 없음)는 대기 없이 지나간다. 대가는 교체 중단 +3초.
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker kill "$CONTAINER" >/dev/null 2>&1 || true
  sleep 3
fi
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# --network=host 인 이유(D-05/D-07):
#   ① 아웃바운드가 host 라우팅 테이블을 그대로 탄다 — KB 대역은 openconnect 의 tun0,
#      나머지는 ens4. 브리지 네트워크였다면 VPN 이 올라올 때마다 컨테이너 쪽 경로를
#      따로 손봐야 한다.
#   ② Caddy 가 127.0.0.1:8090 / 127.0.0.1:8091 로 프록시한다. host 네트워크면
#      포트 매핑 없이 그대로 맞는다.
# 메모리 유계 이유(Pitfall 11):
#   e2-micro 는 1GB 다. 상한이 없으면 relay 가 새어도 OOM killer 가 호스트 전체
#   (Caddy·openconnect·sshd 포함)에서 희생자를 고른다. 상한을 걸면 컨테이너만 죽고
#   재시작 정책이 되살린다. swap 포함 상한은 그 2배로 둔다.
# 로그 드라이버는 json-file 유지 — `docker logs` 와 Ops Agent tail 의 공통 원천.
#   gcplogs 는 Cloud Logging 장애가 컨테이너 기동 실패로 번져 쓰지 않는다
#   (infra/relay/README.md §메모리 예산).
docker run -d \
  --name "$CONTAINER" \
  --restart=always \
  --network=host \
  --memory=384m \
  --memory-swap=768m \
  --log-driver=json-file \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  --env-file "$ENV_FILE" \
  "$TARGET_IMAGE" >/dev/null
log "컨테이너 기동: $CONTAINER"

# env-file 은 여기서 사라진다. docker 는 이미 컨테이너 설정에 값을 복사했으므로
# 재시작(restart 정책)에도 env 는 유지된다.
rm -f "$ENV_FILE"

# ── 기동 확인 ──────────────────────────────────────────────────
HEALTH_OK=0
for _ in $(seq 1 20); do
  if curl -sf --max-time 3 "http://127.0.0.1:${ORDER_API_PORT}/healthz" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done

STATUS="$(docker ps --filter "name=${CONTAINER}" --format '{{.Status}}')"
log "docker ps: ${STATUS:-<없음>}"
if [ "$HEALTH_OK" -ne 1 ]; then
  echo "  [vm] /healthz 응답 없음 — 최근 로그 40줄:" >&2
  docker logs --tail 40 "$CONTAINER" >&2 || true
  exit 1
fi
log "/healthz 200: $(curl -s --max-time 5 "http://127.0.0.1:${ORDER_API_PORT}/healthz")"

# 메모리 실측 (Pitfall 11 — 합계 700MB 초과 시 e2-small 전환 검토)
log "free -m: $(free -m | awk '/^Mem:/{printf "total=%s used=%s available=%s", $2, $3, $7}')"
log "docker stats: $(docker stats --no-stream --format '{{.MemUsage}} cpu={{.CPUPerc}}' "$CONTAINER")"
REMOTE_BODY_EOF
)

REMOTE_SCRIPT="${REMOTE_HEAD}
${REMOTE_BODY}"
REMOTE_B64=$(printf '%s' "$REMOTE_SCRIPT" | base64 | tr -d '\n')

echo "▶ IAP SSH 배포: $VM ..."
gcloud compute ssh "$VM" \
  --tunnel-through-iap \
  --zone="$ZONE" \
  --project="$EXPECTED_PROJECT" \
  --command="echo '${REMOTE_B64}' | base64 -d | sudo bash -s"
echo "✓ VM 배포 완료"

if [[ "$MODE" == rollback ]]; then
  echo ""
  echo "✅ Rolled back @ $TARGET_IMAGE"
  # 옛 이미지면 healthz 에서 KYOBO 키가 사라진다 — 남은 체크가 영구 실패로 메일을 보내지 않게 같은 실행에서
  # 동기화한다(T-sar-04). rollback 은 KB 정책을 적용하지 않으므로 생성은 보류되고 갱신·삭제만 한다.
  # ⚠ 방금 뜬 컨테이너의 healthz 가 아직 안 올라왔으면 판정 불가로 손대지 않는다 — 그때는 --alert-only 로 맞춘다.
  sync_kyobo_monitoring
  echo "   KYOBO 감시: $KYOBO_MONITOR_RESULT"
  echo "Next: bash scripts/smoke-relay.sh"
  exit 0
fi

# ───────────────────────────────────────────────────────────────
# Section 6: uptime check + 알림 정책 (멱등 — update-or-create)
#   Cloud Run Job 처럼 "실행 실패" 메트릭이 없다. 상시 프로세스의 가용성은
#   외부에서 실제로 두드려 보는 uptime check 가 유일한 근거다.
#   `--validate-ssl=true` 라 인증서 만료도 같은 알림으로 잡힌다 (T-15-13).
#   KYOBO 감시(quick-260929-sar): KB 정책(check_id 한정) 적용 뒤 sync_kyobo_monitoring 이 공개 healthz 의
#   KYOBO 키 유무에 맞춰 JSONPath 체크 · 정책을 만들거나 지운다(비치명 — 결과는 최종 요약 한 줄).
# ───────────────────────────────────────────────────────────────
EXISTING_UPTIME=$(gcloud monitoring uptime list-configs \
  --filter="displayName=${UPTIME_CHECK}" --format='value(name)' 2>/dev/null | head -1)

if [[ -n "$EXISTING_UPTIME" ]]; then
  # ⚠️ update 는 create 와 **플래그 이름이 다르다**: 반복 필드라서 `--status-classes` 가
  #    아니라 `--set-status-classes`(전량 치환) 다. 15-08 은 create 경로만 탔기 때문에
  #    이 갈래가 처음 도는 15-19 재배포에서 드러났다 — `set -e` 라 여기서 죽으면
  #    컨테이너는 이미 새 이미지로 떠 있는데 알림 정책만 갱신되지 않은 채 끝난다.
  echo "▶ uptime check update: $UPTIME_CHECK ..."
  gcloud monitoring uptime update "$EXISTING_UPTIME" \
    --period=1 --timeout=10 --validate-ssl=true --set-status-classes=2xx >/dev/null
else
  echo "▶ uptime check create: $UPTIME_CHECK ..."
  gcloud monitoring uptime create "$UPTIME_CHECK" \
    --resource-type=uptime-url \
    --resource-labels="host=${HEALTH_HOST},project_id=${EXPECTED_PROJECT}" \
    --protocol=https \
    --port=443 \
    --path=/healthz \
    --period=1 \
    --timeout=10 \
    --validate-ssl=true \
    --status-classes=2xx >/dev/null
fi
echo "✓ uptime check ready: $UPTIME_CHECK → https://${HEALTH_HOST}/healthz"

apply_alert_policy
sync_kyobo_monitoring

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Deployed @ $TARGET_IMAGE"
echo "   VM:        $VM ($ZONE)"
echo "   Container: $CONTAINER (재시작 정책 always · 384MB 상한)"
# 셸 변수가 아니라 **돌고 있는 컨테이너**에서 되읽는다. "내가 넘긴 값" 이 아니라
# "실제로 붙는 주소" 를 봐야 한다 — 인자를 빠뜨려 기본값(127.0.0.1 mock)으로 뜬 것을
# 성공 로그만 보고 놓치는 사고를 막는다 (2026-09-06 실장애).
LIVE_DMA_HOST="$(read_live_dma_host || true)"
# 배포 전 실측(위 `CURRENT_DMA_HOST`) 대비 실제로 무엇이 바뀌었는지를 나란히 남긴다.
if [[ -n "$LIVE_DMA_HOST" && -n "$CURRENT_DMA_HOST" && "$LIVE_DMA_HOST" != "$CURRENT_DMA_HOST" ]]; then
  echo "   변경:      $CURRENT_DMA_HOST  →  $LIVE_DMA_HOST   (출처: $DMA_HOST_SOURCE)"
fi
LIVE_DMA_HOST="${LIVE_DMA_HOST:-(확인 실패)}"
if [[ "$LIVE_DMA_HOST" == "127.0.0.1" ]]; then
  echo "   DMA_HOST:  $LIVE_DMA_HOST : $DMA_PORT   ⚠️  로컬 MOCK 입니다 (실서버 아님)"
  echo "              실서버로 붙이려면: DMA_HOST=10.41.1.120 bash scripts/deploy-relay.sh"
else
  echo "   DMA_HOST:  $LIVE_DMA_HOST : $DMA_PORT   ← 실제 컨테이너 값"
fi
# KYOBO 관찰자도 돌고 있는 컨테이너에서 되읽는다(같은 read_live_env).
LIVE_KYOBO_HOST="$(read_live_env DMA_KYOBO_HOST || true)"
if [[ -n "$LIVE_KYOBO_HOST" ]]; then
  echo "   KYOBO:     $LIVE_KYOBO_HOST : $DMA_KYOBO_PORT   ← 관찰자 전용(사용자 세션 아님)"
else
  echo "   KYOBO:     관찰자 없음"
fi
echo "   KYOBO 감시: $KYOBO_MONITOR_RESULT"
echo "   Public:    https://${HEALTH_HOST}/healthz"
echo ""
echo "Next: bash scripts/smoke-relay.sh"
