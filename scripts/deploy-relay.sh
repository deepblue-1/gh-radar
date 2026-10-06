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
#   bash scripts/deploy-relay.sh --registry-cutover
#     # 29-25 배포 창의 **1회** 전환 — 옛(레거시 env 모드) relay 를 정지한 뒤 레지스트리 모드로 처음 올릴 때만.
#     # 그 뒤로는 실행 중 값이 `DMA_REGISTRY_SOURCE=db` 라 플래그 없이 정상 배포가 열린다(아래 「전환 잠금」).
#
#   DMA_HOST=<KB 주소> DMA_KYOBO_HOST=<교보 주소 | off> bash scripts/deploy-relay.sh --rollback <이미지 태그>
#     # 빌드 없이 이전(레거시 env 모드) 태그로 복귀 — 두 호스트 명시 필수(아래 「롤백」)
#
#   GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=<채널> bash scripts/deploy-relay.sh --alert-only
#     # KB 알림 정책 + KYOBO 감시 동기화 — 빌드 · VM 배포 · KB uptime check · 컨테이너는 건드리지 않음
#     # (SUPABASE_URL 불필요). 알림 문서(ops/alert-*.yaml)만 고쳤을 때 relay 재배포 없이 쓴다.
#
#   bash scripts/deploy-relay.sh --self-test
#     # 순수 판정 함수(kyobo_presence · registry_cutover_gate) 오프라인 단언. 네트워크 · gcloud · env 불필요.
#
# KYOBO 감시 (quick-260929-sar · Phase 29 RESEARCH Pitfall 3): uptime check `gh-radar-kyobo-observer-healthz`
#   (JSONPath `$.brokers.KYOBO.alerting` == false) + 정책 `gh-radar-kyobo-observer-down`(ops/alert-kyobo-observer-down.yaml).
#   `brokers.KYOBO` 는 healthz 의 **고정 이름** 필드(증권사별 주문 서버 저널 — 29-03)라 서버 키 개명(KYOBO → KYOBO119)에
#   흔들리지 않는다. 옛 이미지(롤백) 본문은 `journalGateways.KYOBO` 로 알아보고 그 경로로 체크를 맞춘다.
#   정본은 **라이브 공개 healthz 본문**이다(env 추정 아님 — 판정은 순수 함수 kyobo_presence). 있으면 만들거나 갱신하고,
#   없으면 정책 → 체크 순서로 지우며, healthz 판정 불가면 손대지 않는다. 전체 배포(Section 6) · --alert-only · --rollback 이
#   같은 함수(sync_kyobo_monitoring)로 동기화한다. 체크 이름 · 체크 수는 그대로다(KB 1 + KYOBO 1 — 무료 한도).
#   KYOBO 체크 생성은 같은 실행에서 KB 정책 check_id 한정이 적용된 뒤에만 한다 — check_passed 의 resource 라벨이
#   host 뿐이라 한정 전이면 새 체크가 KB 알림을 오염시킨다.
#
# Phase 29 D-09 — 정상 배포는 게이트웨이 주소를 **모른다.** 서버 목록 · 주소 · 포트는 레지스트리 `dma_servers`
#   (Admin `/admin/servers`)가 정본이고, env-file 에는 `DMA_REGISTRY_SOURCE=db` 만 들어간다. 호스트 env 주입 · 실행 중
#   값 보존(갭 5, 2026-09-09 의 read_live_env 보존 경로)은 없앴다 — 호환 기간 없음(D-12). 저장소에는 여전히 실주소가 없다(D-27).
#
# 전환 잠금 (fail closed — registry_cutover_gate): 정상 배포는 실행 중 컨테이너의 `DMA_REGISTRY_SOURCE` 가 `db`
#   (전환 끝남)이거나 `--registry-cutover`(29-25 배포 창의 1회)일 때만 진행한다. 그 밖(레거시 env 모드 · 값 없음 ·
#   VM/컨테이너 조회 실패)은 빌드 · AR push · VM 변경 · 알림 동기화 **전에** 사유와 함께 exit 1 이다. 원격 DB 에 키 개명 ·
#   `dma_servers` 반영 · 비밀번호 이관이 끝나기 전의 임시 재배포가 KB120 · KYOBO119 관찰자를 DB 레지스트리로 바꾸지 못하게
#   한다. 레거시 env-host 동작으로 폴백하지 않는다 — 그 사이 재배포가 꼭 필요하면 두 호스트를 명시한 `--rollback <현재 태그>` 뿐.
#   `--alert-only` 는 relay 컨테이너를 건드리지 않아 잠금 대상이 아니다.
#
# 롤백 (--rollback · D-12): 대상은 레지스트리 이전(레거시 env 모드) 이미지다 — 주소를 스스로 모르므로 명시 주입한다.
#   DMA_HOST        **필수.** 없으면 즉시 실패(조용히 127.0.0.1 로 내리지 않는다).
#   DMA_KYOBO_HOST  **필수.** 교보 관찰자 주소, 또는 `off`(관찰자 해제 명시). 없으면 즉시 실패 — 실행 중 값 보존이
#                   사라졌으므로 미주입 롤백이 KYOBO 관찰자를 조용히 떨구지 않게 한다.
#   DMA_KYOBO_PORT  미설정 시 9100
#   `DMA_REGISTRY_SOURCE` 는 넣지 않는다. 레지스트리 시대 태그로 되돌리는 경로가 아니다(그 태그는 이 플래그로 기동을 거부한다).
#
# 선택 env:
#   LOG_LEVEL  미설정 시 info
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
#     gh-radar-dma-observer-secret-kyobo → DMA_OBSERVER_SECRET_KYOBO  (**비치명** — 증권사 KYOBO 비밀(RESEARCH Pitfall 11).
#                                      정상 배포는 있으면 늘 싣는다(어느 교보 서버가 켜졌는지는 레지스트리가 안다) ·
#                                      롤백은 교보 호스트를 줄 때만. 없거나 ENABLED 버전 · relay SA 접근권이 없으면
#                                      ⚠ 한 줄을 남기고 빼고 배포한다 — 그때 레지스트리의 교보 서버는 관찰자 · admin 연결이
#                                      disabled 다. 값은 교보 서버들의 gh-trade `config/observer.toml` 과 같아야 한다.
#                                      위 「비밀 4종」 은 치명 4종을 뜻한다 — 이 비밀은 그 밖이다)
# ═══════════════════════════════════════════════════════════════

MODE=deploy
ROLLBACK_TAG=""
REGISTRY_CUTOVER=0
case "${1:-}" in
  "") ;;
  --registry-cutover)
    MODE=deploy
    REGISTRY_CUTOVER=1
    ;;
  --rollback)
    MODE=rollback
    ROLLBACK_TAG="${2:-}"
    ;;
  --alert-only) MODE=alert-only ;;
  --self-test) MODE=self-test ;;
  *)
    echo "usage: bash scripts/deploy-relay.sh [--registry-cutover | --rollback <tag> | --alert-only | --self-test]" >&2
    exit 1
    ;;
esac

# ───────────────────────────────────────────────────────────────
# 순수 판정 함수 — 명령을 실행하지 않고 전역을 보지 않는다(python3 만 쓴다). --self-test 가 오프라인으로 단언한다.
# ───────────────────────────────────────────────────────────────

# KYOBO 감시 판정 (Phase 29 RESEARCH Pitfall 3). 인자: <healthz 본문> → 한 줄
#   brokers         새 이미지 — `brokers.KYOBO` 객체가 있다 → JSONPath `$.brokers.KYOBO.alerting`
#   legacy          옛 이미지(롤백) — `journalGateways.KYOBO` 객체가 있다 → JSONPath `$.journalGateways.KYOBO.alerting`
#   absent          JSON 객체인데 둘 다 없다 — KYOBO 가 꺼졌다(또는 레지스트리에 켜진 교보 주문 서버가 없다)
#   unknown:<사유>  빈 본문 · 무응답 · JSON 아님 — 판정 불가(손대지 않는다)
# 새 이미지 db 모드의 `journalGateways` 키는 서버 키(`KYOBO119` …)라 `journalGateways.KYOBO` 로는 영영 absent 다 —
# 그래서 고정 이름 `brokers` 를 먼저 본다. 절대 실패하지 않는다(판정 실패도 unknown).
kyobo_presence() {
  local verdict
  verdict="$(printf '%s' "${1-}" | python3 -c '
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
b = d.get("brokers")
if isinstance(b, dict) and isinstance(b.get("KYOBO"), dict):
    print("brokers"); sys.exit(0)
g = d.get("journalGateways")
if isinstance(g, dict) and isinstance(g.get("KYOBO"), dict):
    print("legacy"); sys.exit(0)
print("absent")
' 2>/dev/null || true)"
  [[ -n "$verdict" ]] || verdict="unknown:판정 실패"
  printf '%s\n' "$verdict"
}

# 레지스트리 전환 잠금 (fail closed — Phase 29 D-09 · D-12). 인자: <실행 중 DMA_REGISTRY_SOURCE 값> <0|1 --registry-cutover>
#   → `allow:<출처>` | `deny:<사유>` 한 줄. 값이 db 면 전환이 끝났다 · 플래그 1 이면 29-25 배포 창의 1회 전환이다.
#   그 밖(빈 값 = 레거시 env 모드이거나 조회 실패 · env · 알 수 없는 값)은 전부 deny — 레거시 env-host 폴백은 없다.
#   값 자체는 출력하지 않는다(비밀은 아니지만 판정 문구만으로 충분하다).
registry_cutover_gate() {
  local live="${1-}" flag="${2-0}"
  if [[ "$live" == db ]]; then
    echo "allow:실행 중 relay 가 이미 레지스트리 모드(DMA_REGISTRY_SOURCE=db) — 전환 끝남"
  elif [[ "$flag" == 1 ]]; then
    echo "allow:--registry-cutover — 29-25 배포 창의 1회 전환"
  elif [[ -z "$live" ]]; then
    echo "deny:실행 중 컨테이너에 DMA_REGISTRY_SOURCE 가 없다 — 레거시 env 모드이거나 VM/컨테이너 조회 실패"
  elif [[ "$live" == env ]]; then
    echo "deny:실행 중 relay 가 레거시 env 모드(DMA_REGISTRY_SOURCE=env)"
  else
    echo "deny:실행 중 DMA_REGISTRY_SOURCE 값을 알아볼 수 없다"
  fi
}

# --self-test: 위 두 함수를 표본으로 돌려 기대값과 다르면 exit 1. 네트워크 · gcloud · env 없이 돈다
# (infra/relay/limitup-pull/limitup-pull.sh --self-test 선례).
self_test() {
  local n=0 fail=0 got want label body live flag
  # KYOBO 감시 — 새 본문 · 옛 본문 · KYOBO 없음 · 깨진 JSON
  while IFS='|' read -r label want body; do
    got="$(kyobo_presence "$body")"
    if [[ "$want" == "unknown" && "$got" == unknown:* ]] || [[ "$got" == "$want" ]]; then
      echo "ok   kyobo_presence  ${label} → ${got}"
    else
      echo "FAIL kyobo_presence  ${label} → ${got} (기대 ${want})" >&2
      fail=1
    fi
    n=$((n + 1))
  done <<'SAMPLES'
새 본문(brokers.KYOBO)|brokers|{"status":"ok","version":"x","brokers":{"KB":{"server":"KB120","alerting":false},"KYOBO":{"server":"KYOBO119","alerting":false}},"journalGateways":{"KYOBO119":{"state":"live","alerting":false}},"adminConns":{"KB120":{"state":"ready","usersRev":"3"}}}
옛 본문(journalGateways.KYOBO)|legacy|{"status":"ok","version":"y","journalGateways":{"KYOBO":{"state":"live","alerting":false}}}
KYOBO 없음|absent|{"status":"ok","version":"x","brokers":{"KB":{"server":"KB120","alerting":false}},"journalGateways":{"KYOBO119":{"state":"live","alerting":false}}}
깨진 JSON|unknown|{"status":"ok","brokers":
SAMPLES
  # 전환 잠금 — db+0 allow · 빈 값+0 deny · env+0 deny · 빈 값+1 allow
  while IFS='|' read -r label live flag want; do
    got="$(registry_cutover_gate "$live" "$flag")"
    if [[ "${got%%:*}" == "$want" ]]; then
      echo "ok   registry_cutover_gate  ${label} → ${got}"
    else
      echo "FAIL registry_cutover_gate  ${label} → ${got} (기대 ${want})" >&2
      fail=1
    fi
    n=$((n + 1))
  done <<'SAMPLES'
db + 플래그 없음|db|0|allow
값 없음 + 플래그 없음||0|deny
env + 플래그 없음|env|0|deny
값 없음 + --registry-cutover||1|allow
SAMPLES
  if [[ "$fail" != 0 ]]; then
    echo "self-test FAIL ($n cases)" >&2
    exit 1
  fi
  echo "self-test OK $n cases"
}

if [[ "$MODE" == self-test ]]; then
  self_test
  exit 0
fi

# 롤백은 옛(레거시 env 모드) 이미지라 주소를 명시 주입해야 한다 — gcloud · VM 에 닿기 전에 오프라인으로 거른다(D-12).
if [[ "$MODE" == rollback ]]; then
  if [[ -z "${DMA_HOST:-}" ]]; then
    echo "ERROR: --rollback 은 DMA_HOST 명시 주입이 필수다 — 옛 이미지는 레지스트리를 모르고, 미주입이면 127.0.0.1(로컬 mock)로 뜬다." >&2
    echo "  주소는 infra/relay/README.md (KB 게이트웨이 행) · 예: DMA_HOST=<KB 주소> DMA_KYOBO_HOST=<교보 주소|off> bash scripts/deploy-relay.sh --rollback <tag>" >&2
    exit 1
  fi
  if [[ -z "${DMA_KYOBO_HOST:-}" ]]; then
    echo "ERROR: --rollback 은 DMA_KYOBO_HOST 도 명시해야 한다 — 교보 관찰자 주소, 또는 관찰자 해제면 DMA_KYOBO_HOST=off." >&2
    echo "  (실행 중 값 보존이 없어졌으므로 미주입 롤백이 KYOBO 관찰자를 조용히 떨구지 않게 막는다)" >&2
    exit 1
  fi
fi

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
# JSONPath 는 kyobo_presence 판정을 따른다 — 새 이미지 = 고정 이름 brokers.KYOBO(키 개명 무관) · 옛 이미지(롤백) = journalGateways.KYOBO.
KYOBO_JSON_PATH='$.brokers.KYOBO.alerting'
KYOBO_JSON_PATH_LEGACY='$.journalGateways.KYOBO.alerting'
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
# 정본은 공개 healthz 본문이고 판정은 순수 함수 kyobo_presence 다:
#   brokers | legacy → 체크 create/update(그 판정의 JSONPath) + 정책 적용 · absent → 정책 → 체크 삭제 · unknown → 손대지 않음.
sync_kyobo_monitoring() {
  local body verdict json_path KYOBO_UPTIME_NAME KYOBO_POLICY_NAME rc deleted=""
  # (a) 본문만 읽는다. -f 금지 — 장중 KB 503 본문에도 brokers · journalGateways 가 실린다.
  body="$(curl -s --max-time 10 "https://${HEALTH_HOST}/healthz" 2>/dev/null || true)"
  # (b) brokers / legacy / absent / unknown:<사유>
  verdict="$(kyobo_presence "$body")"

  if [[ "$verdict" == unknown:* ]]; then
    echo "⚠ KYOBO 감시: healthz 판정 불가 (${verdict#unknown:}) — 기존 상태 유지" >&2
    KYOBO_MONITOR_RESULT="판정 불가 — 기존 상태 유지"
    return 0
  fi
  case "$verdict" in
    brokers) json_path="$KYOBO_JSON_PATH" ;;
    legacy)  json_path="$KYOBO_JSON_PATH_LEGACY" ;;
    *)       json_path="" ;;
  esac

  # (c) 기존 자원(목록 조회 — describe 는 쓰지 않는다)
  KYOBO_UPTIME_NAME="$(uptime_check_name "$KYOBO_UPTIME_CHECK")"
  KYOBO_POLICY_NAME="$(gcloud alpha monitoring policies list \
    --filter="displayName=${KYOBO_ALERT_POLICY}" --format='value(name)' 2>/dev/null | head -1 || true)"

  # (e) absent — KYOBO 가 꺼졌다(새 이미지 brokers.KYOBO 없음 · 옛 이미지 journalGateways.KYOBO 없음).
  #     남은 JSONPath 체크는 영구 실패하므로 지운다(정책 먼저).
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

  # brokers | legacy — 체크는 하나다(이름 무변경). JSONPath 만 판정에 맞춘다.
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
      --json-path="$json_path" \
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
      --json-path="$json_path" \
      --json-path-matcher-type=exact-match \
      --matcher-content=false >/dev/null \
      || { KYOBO_MONITOR_RESULT="실패: KYOBO 체크 갱신"; return 0; }
  fi

  # (h) 정책
  if [[ -z "${NOTIFICATION_CHANNEL_ID:-}" ]]; then
    KYOBO_MONITOR_RESULT="체크만(${json_path}) — 정책 건너뜀(NOTIFICATION_CHANNEL_ID 미설정)"
    return 0
  fi
  rc=0
  apply_policy_file "$KYOBO_ALERT_POLICY" "$KYOBO_ALERT_FILE" "${KYOBO_UPTIME_NAME##*/}" || rc=$?
  if [[ "$rc" == 0 ]]; then
    KYOBO_MONITOR_RESULT="켜짐 (체크 ${KYOBO_UPTIME_NAME##*/} · ${json_path} · 정책 ${KYOBO_ALERT_POLICY})"
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

# 돌고 있는 컨테이너의 env 값 하나(인자 KEY)를 되읽는다. **배포 전(전환 잠금 판정)과 배포 후(최종 요약)가**
# **같은 이 함수를 쓴다** — 두 벌로 적으면 언젠가 한쪽만 고쳐진다 (T-16-14).
# 실패(VM 접근 불가 · 컨테이너 부재 · 최초 배포)는 빈 문자열이다. `set -e` 아래이므로 호출부는 `|| true` 를 붙인다.
# Phase 29 D-09 — 주소 보존 경로(배포마다 실행 중 호스트를 되읽어 다시 주입)는 없앴다. 지금 쓰는 키는
# `DMA_REGISTRY_SOURCE`(공개 설정) 하나다.
# ⚠️ docker inspect 의 Env 에는 비밀도 들어 있다 — **비밀 키 이름(…_SECRET* · …_KEY)으로는 부르지 않는다**
#    (T-c8e-01). 값이 로컬 터미널에 찍힌다. 공개 설정만 되읽는다.
read_live_env() {
  local KEY="$1"
  # 식별자만 받는다 — sed 식에 그대로 들어가므로.
  [[ "$KEY" =~ ^[A-Z_][A-Z0-9_]*$ ]] || return 1
  gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap --command \
    "sudo docker inspect $CONTAINER --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^${KEY}=//p'" \
    2>/dev/null | tr -d '\r' | tail -1
}

# ── 레지스트리 전환 잠금 (fail closed — Phase 29 D-09 · D-12) ─────────────
# 정상 배포만 본다(rollback 은 옛 이미지 명시 주입 경로 · --alert-only 는 위에서 이미 끝났다).
# **Section 3(선행 리소스 검증) · Section 4(빌드 · push) · Section 5(VM 변경) · Section 6(알림) 보다 앞이다** —
# deny 면 아무것도 바꾸지 않고 끝난다. 레거시 env-host 모드로 폴백하지 않는다.
if [[ "$MODE" == deploy ]]; then
  echo "▶ 실행 중 컨테이너 DMA_REGISTRY_SOURCE 조회 (전환 잠금) ..."
  LIVE_REGISTRY_SOURCE="$(read_live_env DMA_REGISTRY_SOURCE || true)"
  CUTOVER_VERDICT="$(registry_cutover_gate "$LIVE_REGISTRY_SOURCE" "$REGISTRY_CUTOVER")"
  if [[ "$CUTOVER_VERDICT" != allow:* ]]; then
    echo "ERROR: 레지스트리 전환 잠금 — ${CUTOVER_VERDICT#deny:}" >&2
    echo "  운영 relay 가 아직 레지스트리 전(또는 조회 불가)이다. 전환은 29-25 배포 창 런북의" >&2
    echo "  \`bash scripts/deploy-relay.sh --registry-cutover\` 1회뿐이다(옛 relay 정지 · 키 개명 · 비밀번호 이관 뒤)." >&2
    echo "  그 전 재배포가 꼭 필요하면 두 호스트를 명시한 롤백 경로뿐이다:" >&2
    echo "    DMA_HOST=<KB 주소> DMA_KYOBO_HOST=<교보 주소|off> bash scripts/deploy-relay.sh --rollback <현재 태그>" >&2
    echo "  (현재 태그: curl -s https://${HEALTH_HOST}/healthz | jq -r .version · 주소: infra/relay/README.md)" >&2
    echo "  빌드 · AR push · VM 변경 · 알림 동기화 전 — 아무것도 바꾸지 않았다." >&2
    exit 1
  fi
  echo "✓ 전환 잠금 통과: ${CUTOVER_VERDICT#allow:}"
fi

# 정상 배포 env 와 롤백 env 는 **다른 모양**이다(Phase 29 D-09):
#   정상 배포 — `DMA_REGISTRY_SOURCE=db` 만. 서버 목록 · 주소 · 포트 · 주문/시세 주 서버는 레지스트리 `dma_servers` 가 정한다.
#   롤백      — 옛 이미지라 레거시 env 모드. 주소는 배포자 명시 주입뿐(위 오프라인 검사) — 실행 중 값 보존 · 기본값 없음.
# KYOBO 증권사 비밀(DMA_OBSERVER_SECRET_KYOBO)은 정상 배포에서는 늘 싣고(어느 교보 서버가 켜졌는지는 레지스트리가 안다),
# 롤백에서는 교보 호스트가 있을 때만 싣는다. 비치명 — 아래 Section 3 사전 점검이 실패하면 빼고 배포한다.
if [[ "$MODE" == rollback ]]; then
  if [[ -z "$ROLLBACK_TAG" ]]; then
    echo "ERROR: --rollback 은 이미지 태그가 필요합니다. 사용 가능한 태그:" >&2
    gcloud artifacts docker tags list "${REGISTRY}/relay" --format='value(tag)' 2>/dev/null | tail -10 >&2
    exit 1
  fi
  TARGET_IMAGE="${REGISTRY}/relay:${ROLLBACK_TAG}"
  APP_VERSION="$ROLLBACK_TAG"
  RELAY_ENV_MODE=legacy-env
  ROLLBACK_DMA_HOST="$DMA_HOST"
  ROLLBACK_DMA_PORT=9100
  ROLLBACK_DMA_BROKER=KB
  ROLLBACK_KYOBO_PORT="${DMA_KYOBO_PORT:-9100}"
  if [[ "$DMA_KYOBO_HOST" == off ]]; then
    ROLLBACK_KYOBO_HOST=""
    ROLLBACK_KYOBO_NOTE="명시 해제(off)"
  else
    ROLLBACK_KYOBO_HOST="$DMA_KYOBO_HOST"
    ROLLBACK_KYOBO_NOTE="명시 주입"
  fi
  if [[ -n "$ROLLBACK_KYOBO_HOST" ]]; then KYOBO_SECRET_WANTED=1; else KYOBO_SECRET_WANTED=0; fi
  echo "✓ variables: mode=rollback TARGET=$TARGET_IMAGE (레거시 env 모드 — DMA_REGISTRY_SOURCE 미주입)"
  echo "  롤백 주소 (명시 주입): KB=${ROLLBACK_DMA_HOST}:${ROLLBACK_DMA_PORT} · KYOBO=${ROLLBACK_KYOBO_HOST:-<없음>} (${ROLLBACK_KYOBO_NOTE})"
else
  TARGET_IMAGE="$IMAGE"
  APP_VERSION="$SHA"
  RELAY_ENV_MODE=registry
  KYOBO_SECRET_WANTED=1
  echo "✓ variables: mode=deploy SHA=$SHA TARGET=$TARGET_IMAGE (레지스트리 모드 — DMA_REGISTRY_SOURCE=db · 주소는 dma_servers)"
fi

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

# KYOBO 증권사 비밀 사전 점검 (quick-260929-c8e · Phase 29 Pitfall 11) — **비치명**이다. 위 치명 4종 루프 밖이고 절대 exit 하지 않는다.
# 하나라도 실패하면 KYOBO_SECRET_WANTED=0 → env-file 에 KYOBO 비밀이 없다. 정상 배포에서는 레지스트리의 교보 서버가
# 관찰자 · admin 연결 disabled 로 뜨고, 롤백에서는 교보 호스트도 빼서 KB 단독으로 뜬다.
# (`set -eo pipefail` 아래라 파이프 대입에는 `|| true` 를 붙인다 — 여기서 죽으면 KB 배포까지 막힌다.)
KYOBO_SECRET_NAME=gh-radar-dma-observer-secret-kyobo
if [[ "$KYOBO_SECRET_WANTED" != 1 ]]; then
  echo "  KYOBO 관찰자 없음 (롤백 · ${ROLLBACK_KYOBO_NOTE:-미설정}) — KB 단독"
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
    KYOBO_SECRET_WANTED=0
    if [[ "$MODE" == rollback ]]; then
      echo "⚠ KYOBO 관찰자 생략: ${KYOBO_SKIP_REASON} — KB 단독으로 롤백한다 (infra/relay/README.md §다중 게이트웨이 관찰자)" >&2
      ROLLBACK_KYOBO_HOST=""
    else
      echo "⚠ KYOBO 비밀 생략: ${KYOBO_SKIP_REASON} — 레지스트리의 교보 서버는 관찰자 · admin 연결이 disabled 로 뜬다 (infra/relay/README.md §관찰자 비밀)" >&2
    fi
  else
    echo "✓ KYOBO 비밀 확인 ($KYOBO_SECRET_NAME · ENABLED · relay SA 접근권)"
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
# 공통 head — 주소가 없다. RELAY_ENV_MODE(registry | legacy-env)가 원격 env-file 모양을 고른다.
REMOTE_HEAD=$(printf 'PROJECT=%q\nTARGET_IMAGE=%q\nCONTAINER=%q\nAPP_VERSION=%q\nLOG_LEVEL=%q\nSUPABASE_URL=%q\nWS_PORT=%q\nORDER_API_PORT=%q\nRELAY_ENV_MODE=%q\nKYOBO_SECRET_WANTED=%q\n' \
  "$EXPECTED_PROJECT" "$TARGET_IMAGE" "$CONTAINER" "$APP_VERSION" "$LOG_LEVEL" \
  "$SUPABASE_URL" "$WS_PORT" "$ORDER_API_PORT" "$RELAY_ENV_MODE" "$KYOBO_SECRET_WANTED")
# 롤백 전용 head — 옛 이미지(레거시 env 모드)의 명시 주입 주소. 정상 배포에는 이 줄들이 없다.
if [[ "$MODE" == rollback ]]; then
  REMOTE_HEAD="${REMOTE_HEAD}
$(printf 'RB_DMA_HOST=%q\nRB_DMA_PORT=%q\nRB_DMA_BROKER=%q\nRB_KYOBO_HOST=%q\nRB_KYOBO_PORT=%q\n' \
  "$ROLLBACK_DMA_HOST" "$ROLLBACK_DMA_PORT" "$ROLLBACK_DMA_BROKER" "$ROLLBACK_KYOBO_HOST" "$ROLLBACK_KYOBO_PORT")"
fi

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
# KYOBO 증권사 비밀(quick-260929-c8e · Phase 29 Pitfall 11) — **비치명**. 로컬 사전 점검을 통과한 때만 읽고,
# 실패하면 KYOBO 비밀 없이 기동한다(정상 배포 = 교보 서버 관찰자 · admin disabled · 롤백 = 교보 호스트도 뺀다).
KYOBO_SECRET=""
if [ "$KYOBO_SECRET_WANTED" = 1 ]; then
  KYOBO_SECRET="$(fetch_secret gh-radar-dma-observer-secret-kyobo || true)"
  if [ -z "$KYOBO_SECRET" ]; then
    log "KYOBO 비밀 획득 실패 — KYOBO 비밀 없이 기동 (KB 무영향)"
    if [ "$RELAY_ENV_MODE" = legacy-env ]; then RB_KYOBO_HOST=""; fi
  fi
fi
# 빈 값 검사 — 값이 아니라 **어느 키가 비었는지**만 남긴다.
[ -n "$SB_KEY" ]       || { echo "빈 비밀: supabase service role" >&2; exit 1; }
[ -n "$CRED_KEY" ]     || { echo "빈 비밀: dma cred key" >&2; exit 1; }
[ -n "$ORDER_SECRET" ] || { echo "빈 비밀: relay order secret" >&2; exit 1; }
[ -n "$OBS_SECRET" ]   || { echo "빈 비밀: dma observer secret" >&2; exit 1; }
if [ -n "$KYOBO_SECRET" ]; then KYOBO_NOTE="KYOBO 비밀 포함"; else KYOBO_NOTE="KYOBO 비밀 없음"; fi
log "비밀 4종 획득 (값은 기록하지 않음) · ${KYOBO_NOTE} · env 모양=${RELAY_ENV_MODE}"

{
  printf 'NODE_ENV=production\n'
  printf 'LOG_LEVEL=%s\n' "$LOG_LEVEL"
  printf 'APP_VERSION=%s\n' "$APP_VERSION"
  printf 'SUPABASE_URL=%s\n' "$SUPABASE_URL"
  printf 'WS_PORT=%s\n' "$WS_PORT"
  printf 'ORDER_API_PORT=%s\n' "$ORDER_API_PORT"
  if [ "$RELAY_ENV_MODE" = registry ]; then
    # Phase 29 D-09 — 정상 배포: 서버 목록 · 주소는 레지스트리 dma_servers. 주소 env 는 넣지 않는다.
    printf 'DMA_REGISTRY_SOURCE=db\n'
  else
    # 롤백(옛 이미지 · 레거시 env 모드) — 배포자 명시 주입 주소만. 교보는 호스트와 비밀이 모두 있을 때만.
    printf 'DMA_HOST=%s\n' "$RB_DMA_HOST"
    printf 'DMA_PORT=%s\n' "$RB_DMA_PORT"
    printf 'DMA_BROKER=%s\n' "$RB_DMA_BROKER"
    if [ -n "$RB_KYOBO_HOST" ] && [ -n "$KYOBO_SECRET" ]; then
      printf 'DMA_KYOBO_HOST=%s\n' "$RB_KYOBO_HOST"
      printf 'DMA_KYOBO_PORT=%s\n' "$RB_KYOBO_PORT"
    fi
  fi
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SB_KEY"
  printf 'DMA_CRED_KEY=%s\n' "$CRED_KEY"
  printf 'RELAY_ORDER_SECRET=%s\n' "$ORDER_SECRET"
  printf 'DMA_OBSERVER_SECRET=%s\n' "$OBS_SECRET"
  # KYOBO 증권사 비밀 — 획득했을 때만. 정상 배포는 레지스트리의 교보 서버들이 이 비밀 하나를 쓴다(증권사별 매핑).
  if [ -n "$KYOBO_SECRET" ]; then
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
# 레지스트리 주문 서버 확인 (Phase 29 · 29-03 healthz brokers) — 없으면 경고만(롤백 이미지에는 brokers 가 없다).
KB_ORDER_SERVER="$(curl -s --max-time 5 "http://127.0.0.1:${ORDER_API_PORT}/healthz" | python3 -c 'import json, sys
try:
    d = json.load(sys.stdin); b = d.get("brokers") or {}; k = b.get("KB") or {}
    print(k.get("server") or "")
except Exception:
    print("")' 2>/dev/null || true)"
if [ -n "$KB_ORDER_SERVER" ]; then
  log "brokers.KB.server=${KB_ORDER_SERVER} (레지스트리 KB 주문 서버)"
else
  echo "  [vm] ⚠ healthz 에 brokers.KB.server 없음 — 롤백(옛) 이미지면 정상 · 새 이미지면 레지스트리에 켜진 KB 주문 서버가 없다" >&2
fi

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
  # 옛 이미지는 brokers 가 없고 journalGateways.KYOBO 만 있다(legacy) — 체크 JSONPath 를 옛 경로로 되돌리고, 교보를
  # 껐으면(off) 남은 체크가 영구 실패로 메일을 보내지 않게 지운다. 같은 실행에서 동기화한다(T-sar-04).
  # rollback 은 KB 정책을 적용하지 않으므로 생성은 보류되고 갱신·삭제만 한다.
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
#   KYOBO 감시(quick-260929-sar · Phase 29 Pitfall 3): KB 정책(check_id 한정) 적용 뒤 sync_kyobo_monitoring 이 공개
#   healthz 의 kyobo_presence 판정(brokers.KYOBO 고정 필드)에 맞춰 JSONPath 체크 · 정책을 만들거나 지운다(비치명 — 결과는 최종 요약 한 줄).
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
# 셸 변수가 아니라 **돌고 있는 컨테이너**에서 되읽는다 — "내가 넘긴 값" 이 아니라 "실제로 뜬 모드" 를 본다
# (2026-09-06 실장애의 교훈 그대로). Phase 29 — 주소는 레지스트리라 컨테이너 env 에 없다. 대신 레지스트리 모드 여부와
# 공개 healthz 의 증권사별 주문 서버 키(brokers.<증권사>.server · 서버 키뿐 — 주소 · 사용자 식별자 없음)를 찍는다.
LIVE_REGISTRY_SOURCE="$(read_live_env DMA_REGISTRY_SOURCE || true)"
echo "   레지스트리: DMA_REGISTRY_SOURCE=${LIVE_REGISTRY_SOURCE:-(확인 실패)}   ← 실제 컨테이너 값 (주소는 dma_servers)"
LIVE_BROKERS="$(curl -s --max-time 10 "https://${HEALTH_HOST}/healthz" 2>/dev/null | python3 -c 'import json, sys
try:
    b = json.load(sys.stdin).get("brokers") or {}
    print(" · ".join("%s=%s" % (k, (v or {}).get("server", "?")) for k, v in sorted(b.items())) or "")
except Exception:
    print("")' 2>/dev/null || true)"
echo "   주문 서버: ${LIVE_BROKERS:-(healthz brokers 확인 실패)}"
echo "   KYOBO 감시: $KYOBO_MONITOR_RESULT"
echo "   Public:    https://${HEALTH_HOST}/healthz"
echo ""
echo "Next: bash scripts/smoke-relay.sh"
