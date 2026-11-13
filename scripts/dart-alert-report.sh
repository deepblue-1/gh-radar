#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# Phase 43 Plan 07 — 공시 알림 조사 · 운영 수치 (kis-news-report.sh 꼴)
#
#   SUPABASE_URL=https://<ref>.supabase.co bash scripts/dart-alert-report.sh survey [days=30]
#   SUPABASE_URL=https://<ref>.supabase.co bash scripts/dart-alert-report.sh stats  [days=1]
#   SUPABASE_URL=https://<ref>.supabase.co bash scripts/dart-alert-report.sh check
#
# survey — 비밀 등록 뒤 한 번(가정 6 · 리서치 확인 1 · 3 · 5): OpenDART 목록을 오늘 포함 최근 days 일(KST · 1 ~ 89) 읽어
#   (OpenDART 공시검색은 고유번호 없이 검색기간 3개월 제한 — 문서 기준 · 달력에 따라 90일이 넘칠 수 있어 89일까지 · 리뷰 IN-55)
#   ⑴ 주요사항보고서(B001) 종류명 분포(꼬리표 뗀 이름 · 건수 내림차순 상위 60)
#   ⑵ 허용 목록(기본 6종) 각각의 건수 · 그중 유가/코스닥(Y/K) 건수 · 평일당 평균(정정 포함 · 제외) = 하루 알림 예상
#   ⑶ 날짜별 B001 전체 건수 중 100 을 넘은 날 수(page_count 100 한 쪽으로 모자라는 날 · 리서치 확인 5)
#   ⑷ 공개매수(D004) 건수(전체 · Y/K)
#   ⑸ 목록 밖인데 「증자」 · 「합병」 이 든 종류명(근접 불일치 후보 — 허용 목록에 더할지 사람이 본다)
#   ⑹ 이번 조사의 OpenDART 호출 수 — incr_api_usage('opendart_list_k2', 오늘, n) 으로 키 2 카운터에 더한다
#      (운영 도구는 키 2 · 키 2 카운터 — 261113-rn7 U-2 · 키 1 은 공개매수 종일 5초로 여유가 약 240 뿐이다)
#   B001 은 total_page 까지 전 쪽(쪽 사이 1초) · D004 는 같은 기간 최대 10쪽. 30일이면 대개 20 ~ 40회.
#   오늘 키 2 사용량이 예산에 가깝거나 오늘 키 2 한도 의심 표시(020)가 있으면 조사하지 않는다(운영 기준 ①·④).
#   그 확인(api_usage 의 opendart_list_k2 · opendart_list_k2_quota_strike 를 PostgREST 로 직접 — `sb_usage_count` ·
#   운영 수치 RPC 는 키 1 카운터만 돌려준다)을 못 하면 조사하지 않는다 — 재시도는 사람이(리뷰 WR-54).
#   예산은 Job 설정의 DART_ALERT_DAILY_BUDGET(없으면 기본 15,000 · 키마다 같은 값)을 읽는다 — Job 을 못 읽으면 멈추고,
#   Job 배포 전이면 DART_ALERT_DAILY_BUDGET=15000 처럼 env 로 넘긴다.
#   호출 수는 쪽마다 바로 incr_api_usage 로 더한다(Ctrl-C · 터미널 종료에도 남은 몫은 종료 처리에서 더한다).
#   020 을 받으면 그 자리에서 멈추고 재시도하지 않는다.
#   조회 결과는 이 스크립트 실행 동안만 임시 디렉터리(권한 700)에 두고 끝나면 지운다 — DB · 저장소에 남기지 않는다.
# stats — RPC dart_alert_ops_stats(p_days · 1 ~ 31): 오늘 호출 수 · 한도 의심 표시(키 1 — RPC 몫 · 키 2 는 api_usage 를
#   `sb_usage_count` 로 직접) · 상태별 · 감시 대상별 · 늦은 알림 · 처음 봄 → 보냄 지연 p50/p90 · 장애 상태 · 감시 대상별
#   마지막 성공 조회 · 오늘 아침 전날 확인을 마친 감시 대상(`last_ok` 의 `prevday:<id>` = 오늘) · 임대 보유자(SC-4 · SC-7).
#   읽기 전용.
# check — 배포 뒤 읽기 전용 점검(스모크 INV-6 · INV-7 이 부른다 · 리뷰 WR-52). OpenDART 호출 0 · 단체방 글 0.
#   ① db: dart_alert_ops_stats 응답(SUPABASE_URL · 서비스롤 키 · 기본 마이그레이션)
#   ② migration: PostgREST 스키마(/rest/v1/ OpenAPI)의 dart_alert_outage 에 p_since 가 있는가(20261113400000 적용).
#      스키마를 못 읽으면 WARN 만(실패로 세지 않음).
#   ③ telegram: getMe(토큰) + getChatMember(방 id · 봇 자신)로 봇이 방에 있고 글을 쓸 수 있는가(글은 보내지 않는다)
#   하나라도 FAIL 이면 종료 1. 결과 줄에는 비밀(토큰 · 방 id · 키)을 싣지 않는다.
#
# 비밀:
#   - OpenDART 키(survey): 키 2 — Secret gh-radar-opendart-key-2 최신 값을 변수에만(없으면 env 파일
#     ${DART_ALERT_ENV_FILE:-~/.config/gh-radar/dart-alert.env} 의 OPENDART_API_KEY_2 줄).
#   - 서비스롤 키: env SUPABASE_SERVICE_ROLE_KEY 가 있으면 그것, 없으면 Secret gh-radar-supabase-service-role 최신 값을 변수에만.
#   - (check) 봇 토큰 · 방 id: Secret gh-radar-telegram-bot-token · gh-radar-telegram-chat-id 최신 값을 변수에만
#     (없으면 env 파일의 TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID 줄).
#   - 키는 출력하지 않고 명령줄에도 싣지 않는다 — 요청 주소 · 헤더는 printf 로 만든 curl 설정 줄을 파이프로 curl 의
#     표준입력 설정(-K -)에 넘긴다(printf 는 셸 내장 — 프로세스 목록 노출 0). curl 오류 문구도 화면에 내지 않는다.
#   - 셸 추적 모드를 켜지 않는다.
# 이 스크립트가 DB 를 바꾸는 것은 survey 의 호출 수 더하기(incr_api_usage · 키 2 카운터) 하나뿐이다.
# ═══════════════════════════════════════════════════════════════

ENV_FILE="${DART_ALERT_ENV_FILE:-$HOME/.config/gh-radar/dart-alert.env}"
PROJECT="${GCP_PROJECT_ID:-gh-radar}"
DART_API=https://opendart.fss.or.kr/api/list.json
# 운영 도구는 키 2 · 키 2 카운터(261113-rn7 U-2 — workers/dart-alert/src/apiUsage.ts DART_KEY_SERVICES[2])
USAGE_SERVICE=opendart_list_k2
STRIKE_SERVICE=opendart_list_k2_quota_strike
DART_KEY_SECRET=gh-radar-opendart-key-2
# 아침 전날 확인 표시 키 앞머리(collector.ts PREV_DAY_MARK_PREFIX 와 같은 글자)
PREV_DAY_MARK_PREFIX="prevday:"
DART_KEY_RE='^[A-Za-z0-9]{40}$'
# 수집기 예산 상한(config.ts DART_DAILY_BUDGET_LIMIT) — 실제 예산은 Job 설정에서 읽는다(resolve_budget)
BUDGET_CAP=15000
BUDGET_LIMIT=""
SURVEY_HEADROOM=200
DART_JOB=gh-radar-dart-alert
DART_JOB_REGION=asia-northeast3
B001_MAX_PAGES=60
D004_MAX_PAGES=10
# 허용 목록 기본값 = workers/dart-alert/src/watches.ts DEFAULT_B001_KINDS (Job 과 같은 env 이름으로 바꿀 수 있다)
B001_KINDS="${DART_ALERT_B001_KINDS:-유상증자결정,유무상증자결정,회사합병결정,회사분할합병결정,자기주식취득결정,주식교환ㆍ이전결정}"

usage() {
  echo "사용: SUPABASE_URL=… bash scripts/dart-alert-report.sh survey [days=30]   (OpenDART 조사 · 오늘 포함 1 ~ 89일)" >&2
  echo "      SUPABASE_URL=… bash scripts/dart-alert-report.sh stats [days=1]     (운영 수치 · 1 ~ 31일)" >&2
  echo "      SUPABASE_URL=… bash scripts/dart-alert-report.sh check              (배포 뒤 읽기 전용 점검 · DB · 마이그레이션 · 텔레그램)" >&2
}

CMD="${1:-}"
case "$CMD" in
  survey)
    DAYS="${2:-30}"
    MAX_DAYS=89
    ;;
  stats)
    DAYS="${2:-1}"
    MAX_DAYS=31
    ;;
  check)
    DAYS=1
    MAX_DAYS=1
    ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac

if [[ ! "$DAYS" =~ ^[0-9]+$ ]] || (( 10#$DAYS < 1 || 10#$DAYS > MAX_DAYS )); then
  echo "ERROR: days 는 1 ~ ${MAX_DAYS} 정수 (받은 값 '$DAYS')" >&2
  exit 1
fi
DAYS=$((10#$DAYS))

: "${SUPABASE_URL:?SUPABASE_URL must be set}"
if [[ ! "$SUPABASE_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]]; then
  echo "ERROR: SUPABASE_URL 꼴이 아니다(https://<ref>.supabase.co)" >&2
  exit 1
fi

for bin in curl node; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: $bin 가 없다" >&2
    exit 1
  fi
done

# ── 서비스롤 키(변수에만) ─────────────────────────────────────────
SB_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$SB_KEY" ]]; then
  SB_KEY="$(gcloud secrets versions access latest --secret=gh-radar-supabase-service-role \
            --project="$PROJECT" 2>/dev/null || true)"
fi
if [[ -z "$SB_KEY" ]]; then
  echo "ERROR: 서비스롤 키를 얻지 못했다 — SUPABASE_SERVICE_ROLE_KEY env 또는 gcloud 인증(Secret gh-radar-supabase-service-role 접근)을 확인" >&2
  exit 1
fi
# 설정 줄에 따옴표 · 역슬래시 · 공백이 끼어들지 않게(JWT · sb_secret_ 꼴은 모두 통과)
if [[ ! "$SB_KEY" =~ ^[A-Za-z0-9._-]+$ ]]; then
  SB_KEY=""
  echo "ERROR: 서비스롤 키 꼴이 아니다(영숫자 . _ - 만)" >&2
  exit 1
fi

DART_KEY=""
TG_TOKEN=""
TG_CHAT=""
WORK=""
CALLS=0
FLUSHED=0
TODAY_ISO=""
cleanup() {
  # 조사 도중 끊겨도(Ctrl-C · 종료) 아직 안 더한 호출 수를 카운터에 더한다 — 키를 지우기 전에(리뷰 WR-54)
  if [[ "$CMD" == survey && -n "$TODAY_ISO" ]] && (( CALLS > FLUSHED )); then
    if ! flush_usage; then
      echo "WARN: api_usage 더하기 실패 — 오늘 카운터에 $((CALLS - FLUSHED)) 이 빠졌다(수동 확인)" >&2
    fi
  fi
  SB_KEY=""
  DART_KEY=""
  TG_TOKEN=""
  TG_CHAT=""
  if [[ -n "$WORK" && -d "$WORK" ]]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT
# 신호로 끝날 때도 EXIT 처리(cleanup)를 거치게
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# Supabase RPC 1회 — 본문(비밀 없음)만 명령줄 · 주소와 키 헤더는 표준입력 설정으로. 응답 본문을 표준출력으로.
sb_rpc() {
  local rpc="$1" body="$2"
  printf 'url = "%s/rest/v1/rpc/%s"\nheader = "apikey: %s"\nheader = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\nmax-time = 30\n' \
    "${SUPABASE_URL%/}" "$rpc" "$SB_KEY" "$SB_KEY" \
    | curl -fsS -X POST -K - --data "$body" 2>/dev/null
}

# api_usage 의 그날 count 하나(행 없으면 0) — PostgREST GET(주소 · 키 헤더는 표준입력 설정으로) · 응답을 못 읽으면 실패(1).
#   운영 수치 RPC(dart_alert_ops_stats)가 키 1 카운터만 돌려줘 키 2 카운터 · 한도 의심 표시는 이것으로 읽는다(워커 checkBudget 과 같은 표).
sb_usage_count() {
  local service="$1" day="$2" resp
  resp="$(printf 'url = "%s/rest/v1/api_usage?select=count&service=eq.%s&usage_date=eq.%s"\nheader = "apikey: %s"\nheader = "Authorization: Bearer %s"\nmax-time = 30\n' \
      "${SUPABASE_URL%/}" "$service" "$day" "$SB_KEY" "$SB_KEY" \
    | curl -fsS -K - 2>/dev/null)" || return 1
  printf '%s' "$resp" | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let j;
      try { j = JSON.parse(s); } catch { process.exit(1); }
      if (!Array.isArray(j)) process.exit(1);
      if (j.length === 0) { console.log(0); return; }
      const n = Number(j[0]?.count);
      if (!Number.isInteger(n) || n < 0) process.exit(1);
      console.log(n);
    });'
}

# 오늘 KST 날짜 YYYY-MM-DD
kst_today_iso() {
  node -e 'console.log(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10))'
}

# 하루 예산 — env DART_ALERT_DAILY_BUDGET 가 있으면 그것, 없으면 Job 설정의 같은 env(없으면 기본 15,000).
#   Job 을 읽지 못하면 실패(1) — 조사는 예산을 모른 채 진행하지 않는다(리뷰 WR-54). 값은 정수 1 ~ 15,000.
resolve_budget() {
  local b="${DART_ALERT_DAILY_BUDGET:-}"
  if [[ -z "$b" ]]; then
    b="$(gcloud run jobs describe "$DART_JOB" --region="$DART_JOB_REGION" --project="$PROJECT" --format=json 2>/dev/null \
      | node -e '
        const cap = process.argv[1];
        let s = "";
        process.stdin.on("data", (d) => (s += d)).on("end", () => {
          const j = JSON.parse(s);
          const c = j?.spec?.template?.spec?.template?.spec?.containers?.[0] ?? j?.template?.template?.containers?.[0];
          if (!c) process.exit(1);
          const e = (c.env ?? []).find((x) => x.name === "DART_ALERT_DAILY_BUDGET");
          console.log(e?.value ?? cap);
        });
      ' "$BUDGET_CAP" 2>/dev/null)" || return 1
  fi
  [[ "$b" =~ ^[0-9]+$ ]] && (( 10#$b >= 1 && 10#$b <= BUDGET_CAP )) || return 1
  printf '%s' "$((10#$b))"
}

# 아직 안 더한 호출 수(CALLS − FLUSHED)를 incr_api_usage 1회로 더한다 — 실패하면 다음에 다시
flush_usage() {
  local n=$((CALLS - FLUSHED))
  (( n > 0 )) || return 0
  if sb_rpc incr_api_usage "{\"p_service\":\"${USAGE_SERVICE}\",\"p_date\":\"${TODAY_ISO}\",\"p_amount\":${n}}" >/dev/null; then
    FLUSHED=$((FLUSHED + n))
    return 0
  fi
  return 1
}

# env 파일의 「KEY=값」 줄 값(따옴표 · 공백 제거) — 명령 치환 안에서만 부른다(값은 변수로만 · 화면 출력 0)
env_file_get() {
  local want="$1" line_raw line_key val=""
  [[ -f "$ENV_FILE" ]] || return 0
  while IFS= read -r line_raw || [[ -n "$line_raw" ]]; do
    line_raw="${line_raw%$'\r'}"
    [[ "$line_raw" == *=* ]] || continue
    line_key="${line_raw%%=*}"
    line_key="${line_key#export }"
    line_key="${line_key//[[:space:]]/}"
    if [[ "$line_key" == "$want" ]]; then
      val="${line_raw#*=}"
    fi
  done < "$ENV_FILE"
  printf '%s' "${val//[[:space:]\"\']/}"
}

# ═══════════════════════════════════════════════════════════════
# stats
# ═══════════════════════════════════════════════════════════════
if [[ "$CMD" == stats ]]; then
  BUDGET_LIMIT="$(resolve_budget || true)"
  if ! RESP="$(sb_rpc dart_alert_ops_stats "{\"p_days\":${DAYS}}")"; then
    echo "ERROR: RPC dart_alert_ops_stats 호출 실패 (URL · 마이그레이션 적용 여부 확인)" >&2
    exit 1
  fi
  STATS_TODAY="$(kst_today_iso)"
  # 키 2 카운터 · 한도 의심 표시 — 못 읽으면 빈 값(「?」 로 보인다 · 나머지 수치는 그대로)
  K2_CALLS="$(sb_usage_count "$USAGE_SERVICE" "$STATS_TODAY" || true)"
  K2_STRIKES="$(sb_usage_count "$STRIKE_SERVICE" "$STATS_TODAY" || true)"
  printf '%s' "$RESP" | node -e '
    const days = process.argv[1];
    const budget = process.argv[2];
    const k2Calls = process.argv[3];
    const k2Strikes = process.argv[4];
    const today = process.argv[5];
    const markPrefix = process.argv[6];
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const j = JSON.parse(s) ?? {};
      const n = (v) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-US"));
      const kst = (iso) => {
        if (!iso) return "-";
        const t = new Date(new Date(iso).getTime() + 9 * 3600e3);
        return t.toISOString().replace("T", " ").slice(0, 19) + " KST";
      };
      const st = j.by_status ?? {};
      // collector.ts WATCH_LABEL 과 같은 글자(261113-rn7 — 감시 대상 6개)
      const watchLabel = {
        tender_offer: "공개매수",
        rights_merger: "주요사항보고서",
        market_action: "거래소 시장조치",
        exchange_disclosure: "거래소 수시공시",
        largest_holder_change: "최대주주 소유주식 변동",
        insider_trade_plan: "임원ㆍ주요주주 거래계획",
      };
      const b = budget ? n(budget) : "?(Job 설정 못 읽음)";
      const k2 = (v) => (v === "" || v === undefined ? "?(읽기 실패)" : n(v));
      const lastOk = Object.entries(j.last_ok ?? {});
      const prevDone = lastOk.filter(([k, v]) => k.startsWith(markPrefix) && v === today).map(([k]) => k.slice(markPrefix.length));
      const rows = [
        ["오늘 OpenDART 호출", `키 1 ${n(j.calls_today)} / 예산 ${b} · 키 2 ${k2(k2Calls)} / 예산 ${b} (키마다 공식 20,000)`],
        ["오늘 한도 의심 표시", `키 1 ${n(j.strikes_today)} · 키 2 ${k2(k2Strikes)}`],
        [`상태별(최근 ${days}일)`, `보냄 ${n(st.sent)} · 대기 ${n(st.pending)} · 보내는 중 ${n(st.sending)} · 채움(seed) ${n(st.seeded)} · 닫힘(지난 날) ${n(st.expired)}`],
        ["감시 대상별", Object.entries(j.by_watch ?? {}).map(([k, v]) => `${watchLabel[k] ?? k} ${n(v)}`).join(" · ") || "-"],
        ["늦은 알림", n(j.late_count)],
        ["지연(처음 봄 → 보냄)", `p50 ${j.latency_p50_s ?? "-"}초 · p90 ${j.latency_p90_s ?? "-"}초`],
        ["장애", j.outage?.since ? `${kst(j.outage.since)} 부터 · 사유 ${j.outage.reason ?? "-"} · 단체방 글 ${j.outage.notice ?? "-"}` : "없음"],
        ["마지막 성공 조회", lastOk.filter(([k]) => !k.startsWith(markPrefix)).map(([k, v]) => `${watchLabel[k] ?? k} ${kst(v)}`).join(" · ") || "-"],
        ["전날 확인(오늘)", prevDone.map((k) => watchLabel[k] ?? k).join(" · ") || "-"],
        ["임대 보유자", j.lease_holder ?? "-"],
      ];
      console.log(`# 공시 알림 운영 수치 — 최근 ${days}일 (호출 수 · 표시는 오늘 KST)`);
      const w = Math.max(...rows.map(([k]) => k.length));
      for (const [k, v] of rows) console.log(`${k.padEnd(w + 2, " ")}${v}`);
    });
  ' "$DAYS" "$BUDGET_LIMIT" "$K2_CALLS" "$K2_STRIKES" "$STATS_TODAY" "$PREV_DAY_MARK_PREFIX"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════
# check — 배포 뒤 읽기 전용 점검(스모크 INV-6 · INV-7 · 리뷰 WR-52). OpenDART 호출 0 · 단체방 글 0.
# ═══════════════════════════════════════════════════════════════
if [[ "$CMD" == check ]]; then
  CHECK_FAILS=0

  # ① db — 운영 수치 RPC 가 응답하는가(URL 오타 · 서비스롤 키 폐기 · 기본 마이그레이션 미적용이면 실패)
  RESP=""
  if RESP="$(sb_rpc dart_alert_ops_stats '{"p_days":1}')" && printf '%s' "$RESP" | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const j = JSON.parse(s);
          process.exit(j && typeof j === "object" && "calls_today" in j ? 0 : 1);
        } catch {
          process.exit(1);
        }
      });'; then
    echo "OK db — dart_alert_ops_stats 응답"
  else
    echo "FAIL db — dart_alert_ops_stats 호출 실패(SUPABASE_URL · 서비스롤 키 · 마이그레이션 20261113200000 적용 여부)"
    CHECK_FAILS=$((CHECK_FAILS + 1))
  fi

  # ② migration — dart_alert_outage 에 p_since(20261113400000)가 있는가. 새 워커는 p_since 를 보내므로 없으면 장애 open 이 실패한다.
  SPEC_STATE="$(printf 'url = "%s/rest/v1/"\nheader = "apikey: %s"\nheader = "Authorization: Bearer %s"\nheader = "Accept: application/openapi+json"\nmax-time = 30\n' \
      "${SUPABASE_URL%/}" "$SB_KEY" "$SB_KEY" \
    | curl -fsS -K - 2>/dev/null \
    | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        let j;
        try { j = JSON.parse(s); } catch { console.log("unknown"); return; }
        if (!j || typeof j.paths !== "object") { console.log("unknown"); return; }
        const p = j.paths["/rpc/dart_alert_outage"];
        console.log(p && JSON.stringify(p).includes("p_since") ? "ok" : "missing");
      });' 2>/dev/null || true)"
  case "$SPEC_STATE" in
    ok) echo "OK migration — dart_alert_outage(p_since) 있음(20261113400000 적용)" ;;
    missing)
      echo "FAIL migration — dart_alert_outage 에 p_since 가 없다(20261113400000 미적용 — supabase db push 먼저)"
      CHECK_FAILS=$((CHECK_FAILS + 1))
      ;;
    *) echo "WARN migration — PostgREST 스키마를 읽지 못해 확인 못 함(실패로 세지 않음)" ;;
  esac

  # ③ telegram — 토큰이 살아 있고 봇이 방에 있어 글을 쓸 수 있는가(getMe · getChatMember — 글 0)
  TG_TOKEN="$(gcloud secrets versions access latest --secret=gh-radar-telegram-bot-token --project="$PROJECT" 2>/dev/null || true)"
  if [[ -z "$TG_TOKEN" ]]; then TG_TOKEN="$(env_file_get TELEGRAM_BOT_TOKEN)"; fi
  TG_CHAT="$(gcloud secrets versions access latest --secret=gh-radar-telegram-chat-id --project="$PROJECT" 2>/dev/null || true)"
  if [[ -z "$TG_CHAT" ]]; then TG_CHAT="$(env_file_get TELEGRAM_CHAT_ID)"; fi
  TG_CHAT="${TG_CHAT//[[:space:]]/}"
  # 꼴 검사 — curl 설정 줄에 따옴표 · 역슬래시가 끼어들지 않게(config.ts 와 같은 꼴)
  if [[ ! "$TG_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ || ! "$TG_CHAT" =~ ^-?[0-9]+$ ]]; then
    echo "FAIL telegram — 봇 토큰 · 방 id 를 얻지 못했거나 꼴이 아니다(Secret gh-radar-telegram-bot-token · gh-radar-telegram-chat-id)"
    CHECK_FAILS=$((CHECK_FAILS + 1))
  else
    tg_call() {
      local method="$1" data="${2:-}"
      {
        printf 'url = "https://api.telegram.org/bot%s/%s"\nmax-time = 20\n' "$TG_TOKEN" "$method"
        if [[ -n "$data" ]]; then printf 'data = "%s"\n' "$data"; fi
      } | curl -sS -K - 2>/dev/null
    }
    # 결과 판정 — 토큰 · 방 id 는 싣지 않고 봇 이름 · 상태 · 오류 코드만
    TG_NODE='
      const kind = process.argv[1];
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        let j;
        try { j = JSON.parse(s); } catch { console.log("FAIL 응답을 읽지 못함(네트워크?)"); return; }
        const clean = (v) => String(v ?? "").replace(/-?[0-9]{6,}/g, "#").slice(0, 80);
        if (!j.ok) { console.log(`FAIL ${j.error_code ?? "-"} ${clean(j.description)}`); return; }
        const r = j.result ?? {};
        if (kind === "me") { console.log(`OK @${clean(r.username)}`); return; }
        const st = String(r.status ?? "");
        const canPost = ["creator", "administrator", "member"].includes(st) || (st === "restricted" && r.is_member && r.can_send_messages);
        console.log(canPost ? `OK ${st}` : `FAIL 방 상태 ${st || "-"}(봇이 방에 없거나 글쓰기 권한이 없다)`);
      });
    '
    ME="$(tg_call getMe | node -e "$TG_NODE" me 2>/dev/null || echo "FAIL 응답 없음")"
    if [[ "$ME" == OK* ]]; then
      MEMBER="$(tg_call getChatMember "chat_id=${TG_CHAT}&user_id=${TG_TOKEN%%:*}" | node -e "$TG_NODE" member 2>/dev/null || echo "FAIL 응답 없음")"
    else
      MEMBER="FAIL getMe 실패라 확인 안 함"
    fi
    if [[ "$ME" == OK* && "$MEMBER" == OK* ]]; then
      echo "OK telegram — 봇 ${ME#OK } · 방 상태 ${MEMBER#OK }(글은 보내지 않음)"
    else
      echo "FAIL telegram — getMe: ${ME} · getChatMember: ${MEMBER} (토큰 폐기면 401 · 봇이 내보내졌으면 403/left · kicked)"
      CHECK_FAILS=$((CHECK_FAILS + 1))
    fi
  fi
  TG_TOKEN=""
  TG_CHAT=""

  if (( CHECK_FAILS > 0 )); then
    echo "check: FAIL ${CHECK_FAILS}건" >&2
    exit 1
  fi
  echo "check: all OK"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════
# survey
# ═══════════════════════════════════════════════════════════════

# ── 0. 날짜(KST) ─────────────────────────────────────────────────
read -r TODAY_YMD BGN_YMD TODAY_ISO <<< "$(node -e '
  const days = Number(process.argv[1]);
  const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
  const now = Date.now();
  const today = kst(now);
  const bgn = kst(now - (days - 1) * 86400e3); // 오늘 포함 days 일(30 → 30일)
  console.log(today.replace(/-/g, ""), bgn.replace(/-/g, ""), today);
' "$DAYS")"

# ── 1. 오늘 키 2 사용량 · 키 2 한도 의심 표시 확인(운영 기준 ①·④ · 운영 도구는 키 2) ──────────
#   확인을 못 하면(호출 실패 · 응답을 못 읽음) 조사하지 않는다 — 예산 · 한도 의심을 모른 채 최대 70회를 부르지 않게(리뷰 WR-54).
if ! BUDGET_LIMIT="$(resolve_budget)"; then
  echo "ERROR: 하루 예산을 정하지 못했다 — Job ${DART_JOB} 설정을 읽지 못했거나 값이 1 ~ ${BUDGET_CAP} 밖이다." >&2
  echo "       Job 배포 전이면 DART_ALERT_DAILY_BUDGET=15000 처럼 env 로 넘긴다(재시도는 사람이)" >&2
  exit 1
fi
if ! CALLS_TODAY="$(sb_usage_count "$USAGE_SERVICE" "$TODAY_ISO")"; then
  echo "ERROR: 오늘 키 2 사용량(api_usage ${USAGE_SERVICE})을 확인하지 못해 조사하지 않는다 — 재시도는 사람이" >&2
  exit 1
fi
if ! STRIKES_TODAY="$(sb_usage_count "$STRIKE_SERVICE" "$TODAY_ISO")"; then
  echo "ERROR: 오늘 키 2 한도 의심 표시(api_usage ${STRIKE_SERVICE})를 확인하지 못해 조사하지 않는다 — 재시도는 사람이" >&2
  exit 1
fi
if (( STRIKES_TODAY > 0 )); then
  echo "ERROR: 오늘 키 2 한도 의심 표시(020)가 ${STRIKES_TODAY}건 있다 — 조사로 두드리지 않는다. 내일 다시 실행" >&2
  exit 1
fi
if (( CALLS_TODAY + SURVEY_HEADROOM > BUDGET_LIMIT )); then
  echo "ERROR: 오늘 키 2 호출 ${CALLS_TODAY} — 조사 여유 ${SURVEY_HEADROOM} 을 더하면 예산 ${BUDGET_LIMIT} 을 넘는다. 내일 다시 실행" >&2
  exit 1
fi
echo "오늘 OpenDART 키 2 호출 ${CALLS_TODAY} / 예산 ${BUDGET_LIMIT} · 키 2 한도 의심 표시 0 — 조사 시작"

# ── 2. OpenDART 키 2(변수에만) ───────────────────────────────────
DART_KEY="$(gcloud secrets versions access latest --secret="$DART_KEY_SECRET" --project="$PROJECT" 2>/dev/null || true)"
if [[ -z "$DART_KEY" ]]; then
  DART_KEY="$(env_file_get OPENDART_API_KEY_2)"
fi
if [[ -z "$DART_KEY" ]]; then
  echo "ERROR: OpenDART 키 2 를 얻지 못했다 — Secret ${DART_KEY_SECRET}(! bash scripts/setup-dart-alert-secrets.sh) 또는 env 파일 OPENDART_API_KEY_2 줄" >&2
  exit 1
fi
if [[ ! "$DART_KEY" =~ $DART_KEY_RE ]]; then
  DART_KEY=""
  echo "ERROR: OpenDART 키 꼴이 아니다(영숫자 40자)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
STOP_REASON=""
# 쪽 상한에서 잘렸으면 「읽은 쪽/전체 쪽」(분석 머리에 표시)
TRUNC_B001=""
TRUNC_D004=""

# 한 쪽 조회 — 행은 TSV(접수일 · 시장 · 보고서명)로 덧붙이고, 「status total_page」 를 표준출력으로.
# 키가 든 주소는 표준입력 설정으로만 넘긴다.
NODE_PAGE='
  const out = process.argv[1];
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    let j;
    try { j = JSON.parse(s); } catch { console.log("json 0 -"); return; }
    const status = String(j.status ?? "none");
    const rows = Array.isArray(j.list) ? j.list : [];
    const clean = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
    if (rows.length > 0) {
      require("fs").appendFileSync(out, rows.map((r) => [clean(r.rcept_dt), clean(r.corp_cls), clean(r.report_nm)].join("\t")).join("\n") + "\n");
    }
    const msg = clean(j.message).slice(0, 80).replace(/ /g, "_") || "-";
    console.log(status, Number(j.total_page ?? 0) || 0, msg);
  });
'
fetch_page() {
  local ty="$1" page="$2" out="$3" rc=0 resp
  resp="$(printf 'url = "%s?crtfc_key=%s&bgn_de=%s&end_de=%s&pblntf_detail_ty=%s&last_reprt_at=N&page_no=%s&page_count=100"\nmax-time = 20\n' "$DART_API" "$DART_KEY" "$BGN_YMD" "$TODAY_YMD" "$ty" "$page" | curl -sS -K - 2>/dev/null)" || rc=$?
  if [[ "$rc" != 0 ]]; then
    echo "net 0 curl_exit_$rc"
    return 0
  fi
  printf '%s' "$resp" | node -e "$NODE_PAGE" "$out"
}

# 감시 유형 하나를 1쪽부터 total_page 까지(최대 max 쪽). 020 · 오류면 그 자리에서 멈춘다(재시도 없음).
survey_type() {
  local ty="$1" max="$2" out="$3" page=1 total=1 status msg line
  : > "$out"
  while (( page <= total && page <= max )); do
    # fetch_page 는 명령 치환(하위 셸) 안에서 돌므로 호출 수는 여기서 센다(실패 호출 포함).
    # 부르기 전에 센다 — 도중에 끊겨도 보낸 호출이 빠지지 않게(많아야 1 더 셈 · 보수적). 그리고 쪽마다 바로 더한다.
    CALLS=$((CALLS + 1))
    line="$(fetch_page "$ty" "$page" "$out")"
    flush_usage || true
    read -r status total msg <<< "$line"
    case "$status" in
      000) ;;
      013)
        break
        ;;
      020)
        STOP_REASON="020(요청 제한 초과) — ${ty} ${page}쪽에서 멈춤 · 재시도 안 함"
        return 1
        ;;
      *)
        STOP_REASON="${ty} ${page}쪽 status ${status} (${msg//_/ }) — 멈춤"
        return 1
        ;;
    esac
    if (( page == 1 && total > max )); then
      echo "WARN: ${ty} 가 ${total}쪽 — 앞 ${max}쪽만 읽는다(days 를 줄이면 전부 읽는다)" >&2
      printf -v "TRUNC_${ty}" '%s/%s' "$max" "$total"
    fi
    page=$((page + 1))
    if (( page <= total && page <= max )); then sleep 1; fi
  done
  return 0
}

echo "조사 기간 ${BGN_YMD} ~ ${TODAY_YMD} (KST · ${DAYS}일) — B001 전 쪽 · D004 최대 ${D004_MAX_PAGES}쪽 · 쪽 사이 1초"
SURVEY_OK=1
survey_type B001 "$B001_MAX_PAGES" "$WORK/b001.tsv" || SURVEY_OK=0
if [[ "$SURVEY_OK" == 1 ]]; then
  sleep 1
  survey_type D004 "$D004_MAX_PAGES" "$WORK/d004.tsv" || SURVEY_OK=0
fi
DART_KEY=""

# ── 3. 호출 수 — 쪽마다 더했다. 남은 몫(앞 더하기 실패)이 있으면 한 번 더 · 실패 호출 포함 · 조사가 멈췄어도 ──
if (( CALLS == 0 )); then
  USAGE_NOTE="호출 0"
elif flush_usage; then
  USAGE_NOTE="api_usage ${USAGE_SERVICE} ${TODAY_ISO} 에 +${CALLS} 더함(쪽마다)"
else
  USAGE_NOTE="api_usage 더하기 일부 실패 — 오늘 카운터에 $((CALLS - FLUSHED)) 이 빠졌다(수집기 예산 판단에 영향 · 수동 확인)"
fi

if [[ "$SURVEY_OK" != 1 ]]; then
  echo "ERROR: 조사 중단 — ${STOP_REASON}" >&2
  echo "⑹ 이번 조사 호출 수: ${CALLS} (${USAGE_NOTE})" >&2
  exit 1
fi

# ── 4. 분석 ───────────────────────────────────────────────────────
node -e '
  const fs = require("fs");
  const [b001File, d004File, kindsCsv, calls, usageNote, bgn, end, truncB001, truncD004] = process.argv.slice(1);
  // 쪽 상한에서 잘렸으면 그 집계는 적게 나온다 — 머리에 표시(리뷰 IN-55)
  const cut = (t) => (t ? ` (잘림 — 앞 ${t.split("/")[0]}쪽만 · 전체 ${t.split("/")[1]}쪽 · 과소 집계)` : "");
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")) : []);
  const b001 = read(b001File);
  const d004 = read(d004File);
  const allowed = kindsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const isYK = (cls) => cls === "Y" || cls === "K";
  // watches.ts 와 같은 규칙: 공백 정리 → 앞 대괄호 꼬리표 반복 제거 → 주요사항보고서(종류) 의 괄호 안 · 공백 제거
  const kindOf = (nm) => {
    const norm = nm.trim().replace(/\s+/g, " ");
    const tagged = /^\[[^\]]*\]/.test(norm);
    const body = norm.replace(/^(\[[^\]]*\]\s*)+/, "");
    const m = /^주요사항보고서\s*\((.+)\)$/.exec(body);
    return { kind: (m ? m[1] : body).replace(/\s+/g, ""), correction: tagged };
  };
  const ymd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  let weekdays = 0;
  for (let t = ymd(bgn); t <= ymd(end); t = new Date(t.getTime() + 86400e3)) {
    const d = t.getUTCDay();
    if (d !== 0 && d !== 6) weekdays++;
  }
  const avg = (n) => (weekdays > 0 ? (n / weekdays).toFixed(1) : "-");

  const dist = new Map();
  const perDay = new Map();
  const allowedStat = new Map(allowed.map((k) => [k, { all: 0, yk: 0, ykNoCorr: 0 }]));
  const near = new Map();
  let ykAll = 0;
  let ykNoCorr = 0;
  for (const [dt, cls, nm] of b001) {
    const { kind, correction } = kindOf(nm ?? "");
    dist.set(kind, (dist.get(kind) ?? 0) + 1);
    perDay.set(dt, (perDay.get(dt) ?? 0) + 1);
    const a = allowedStat.get(kind);
    if (a) {
      a.all++;
      if (isYK(cls)) {
        a.yk++;
        ykAll++;
        if (!correction) {
          a.ykNoCorr++;
          ykNoCorr++;
        }
      }
    } else if (/증자|합병/.test(kind)) {
      near.set(kind, (near.get(kind) ?? 0) + 1);
    }
  }

  console.log("");
  console.log(`# 공시 알림 조사 — ${bgn} ~ ${end} (KST) · 평일 ${weekdays}일 · B001 ${b001.length}건 · D004 ${d004.length}건`);
  console.log("");
  console.log("⑴ 주요사항보고서(B001) 종류명 분포 — 꼬리표 뗀 이름 · 상위 60 (전 법인)");
  console.log(["건수", "종류명", "허용"].join("\t"));
  for (const [k, n] of [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
    console.log([n, k, allowedStat.has(k) ? "●" : ""].join("\t"));
  }
  console.log("");
  console.log("⑵ 허용 목록 — 건수(전 법인) · 유가/코스닥 · 유가/코스닥 정정 제외 · 평일당 평균(정정 포함 / 제외)" + cut(truncB001));
  console.log(["종류명", "전체", "Y/K", "Y/K 정정 제외", "평일당(포함)", "평일당(제외)"].join("\t"));
  for (const [k, a] of allowedStat) console.log([k, a.all, a.yk, a.ykNoCorr, avg(a.yk), avg(a.ykNoCorr)].join("\t"));
  console.log(["합계", "", ykAll, ykNoCorr, avg(ykAll), avg(ykNoCorr)].join("\t"));
  const d004yk = d004.filter(([, cls]) => isYK(cls)).length;
  console.log(`하루 알림 예상(평일당) — 유상증자·합병 ${avg(ykAll)}건(정정 제외 ${avg(ykNoCorr)}) + 공개매수 ${avg(d004yk)}건`);
  console.log("");
  const over = [...perDay.entries()].filter(([, n]) => n > 100).sort();
  console.log(`⑶ B001 하루 전체 건수가 100 을 넘은 날${cut(truncB001)}: ${over.length}일 / 조회된 ${perDay.size}일` +
    (over.length ? ` — ${over.map(([d, n]) => `${d}(${n})`).join(" · ")}` : ""));
  const maxDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (maxDay) console.log(`    가장 많은 날 ${maxDay[0]} ${maxDay[1]}건`);
  console.log("");
  console.log(`⑷ 공개매수(D004)${cut(truncD004)}: 전체 ${d004.length}건 · 유가/코스닥 ${d004yk}건`);
  console.log("");
  console.log("⑸ 근접 불일치 후보 — 허용 목록 밖인데 「증자」 · 「합병」 이 든 종류명");
  if (near.size === 0) console.log("    없음");
  for (const [k, n] of [...near.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${n}\t${k}`);
  console.log("");
  console.log(`⑹ 이번 조사 OpenDART 호출 수: ${calls} (${usageNote})`);
' "$WORK/b001.tsv" "$WORK/d004.tsv" "$B001_KINDS" "$CALLS" "$USAGE_NOTE" "$BGN_YMD" "$TODAY_YMD" "$TRUNC_B001" "$TRUNC_D004"
