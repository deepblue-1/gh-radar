#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# Phase 43 Plan 07 — 공시 알림 조사 · 운영 수치 (kis-news-report.sh 꼴)
#
#   SUPABASE_URL=https://<ref>.supabase.co bash scripts/dart-alert-report.sh survey [days=30]
#   SUPABASE_URL=https://<ref>.supabase.co bash scripts/dart-alert-report.sh stats  [days=1]
#
# survey — 비밀 등록 뒤 한 번(가정 6 · 리서치 확인 1 · 3 · 5): OpenDART 목록을 최근 days 일(KST · 1 ~ 90) 읽어
#   ⑴ 주요사항보고서(B001) 종류명 분포(꼬리표 뗀 이름 · 건수 내림차순 상위 60)
#   ⑵ 허용 목록 4종 각각의 건수 · 그중 유가/코스닥(Y/K) 건수 · 평일당 평균(정정 포함 · 제외) = 하루 알림 예상
#   ⑶ 날짜별 B001 전체 건수 중 100 을 넘은 날 수(page_count 100 한 쪽으로 모자라는 날 · 리서치 확인 5)
#   ⑷ 공개매수(D004) 건수(전체 · Y/K)
#   ⑸ 목록 밖인데 「증자」 · 「합병」 이 든 종류명(근접 불일치 후보 — 허용 목록에 더할지 사람이 본다)
#   ⑹ 이번 조사의 OpenDART 호출 수 — 끝에 incr_api_usage('opendart_list', 오늘, n) 으로 수집기 카운터에 더한다
#   B001 은 total_page 까지 전 쪽(쪽 사이 1초) · D004 는 같은 기간 최대 10쪽. 30일이면 대개 20 ~ 40회.
#   오늘 사용량이 예산에 가깝거나 오늘 한도 의심 표시(020)가 있으면 조사하지 않는다(운영 기준 ①·④).
#   020 을 받으면 그 자리에서 멈추고 재시도하지 않는다.
#   조회 결과는 이 스크립트 실행 동안만 임시 디렉터리(권한 700)에 두고 끝나면 지운다 — DB · 저장소에 남기지 않는다.
# stats — RPC dart_alert_ops_stats(p_days · 1 ~ 31): 오늘 호출 수 · 한도 의심 표시 · 상태별 · 감시 대상별 · 늦은 알림 ·
#   처음 봄 → 보냄 지연 p50/p90 · 장애 상태 · 감시 대상별 마지막 성공 조회 · 임대 보유자(SC-4 · SC-7). 읽기 전용.
#
# 비밀:
#   - OpenDART 키: Secret gh-radar-opendart-key 최신 값을 변수에만(없으면 env 파일
#     ${DART_ALERT_ENV_FILE:-~/.config/gh-radar/dart-alert.env} 의 OPENDART_API_KEY 줄).
#   - 서비스롤 키: env SUPABASE_SERVICE_ROLE_KEY 가 있으면 그것, 없으면 Secret gh-radar-supabase-service-role 최신 값을 변수에만.
#   - 키는 출력하지 않고 명령줄에도 싣지 않는다 — 요청 주소 · 헤더는 printf 로 만든 curl 설정 줄을 파이프로 curl 의
#     표준입력 설정(-K -)에 넘긴다(printf 는 셸 내장 — 프로세스 목록 노출 0). curl 오류 문구도 화면에 내지 않는다.
#   - 셸 추적 모드를 켜지 않는다.
# 이 스크립트가 DB 를 바꾸는 것은 survey 의 호출 수 더하기(incr_api_usage) 하나뿐이다.
# ═══════════════════════════════════════════════════════════════

ENV_FILE="${DART_ALERT_ENV_FILE:-$HOME/.config/gh-radar/dart-alert.env}"
PROJECT="${GCP_PROJECT_ID:-gh-radar}"
DART_API=https://opendart.fss.or.kr/api/list.json
USAGE_SERVICE=opendart_list
DART_KEY_RE='^[A-Za-z0-9]{40}$'
# 수집기 설계 예산(config.ts DART_DAILY_BUDGET_LIMIT) — 조사가 이 선을 넘기지 않게
BUDGET_LIMIT=15000
SURVEY_HEADROOM=200
B001_MAX_PAGES=60
D004_MAX_PAGES=10
# 허용 목록 기본값 = workers/dart-alert/src/watches.ts DEFAULT_B001_KINDS (Job 과 같은 env 이름으로 바꿀 수 있다)
B001_KINDS="${DART_ALERT_B001_KINDS:-유상증자결정,유무상증자결정,회사합병결정,회사분할합병결정}"

usage() {
  echo "사용: SUPABASE_URL=… bash scripts/dart-alert-report.sh survey [days=30]   (OpenDART 조사 · 1 ~ 90일)" >&2
  echo "      SUPABASE_URL=… bash scripts/dart-alert-report.sh stats [days=1]     (운영 수치 · 1 ~ 31일)" >&2
}

CMD="${1:-}"
case "$CMD" in
  survey)
    DAYS="${2:-30}"
    MAX_DAYS=90
    ;;
  stats)
    DAYS="${2:-1}"
    MAX_DAYS=31
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
WORK=""
cleanup() {
  SB_KEY=""
  DART_KEY=""
  if [[ -n "$WORK" && -d "$WORK" ]]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT

# Supabase RPC 1회 — 본문(비밀 없음)만 명령줄 · 주소와 키 헤더는 표준입력 설정으로. 응답 본문을 표준출력으로.
sb_rpc() {
  local rpc="$1" body="$2"
  printf 'url = "%s/rest/v1/rpc/%s"\nheader = "apikey: %s"\nheader = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\nmax-time = 30\n' \
    "${SUPABASE_URL%/}" "$rpc" "$SB_KEY" "$SB_KEY" \
    | curl -fsS -X POST -K - --data "$body" 2>/dev/null
}

# ═══════════════════════════════════════════════════════════════
# stats
# ═══════════════════════════════════════════════════════════════
if [[ "$CMD" == stats ]]; then
  if ! RESP="$(sb_rpc dart_alert_ops_stats "{\"p_days\":${DAYS}}")"; then
    echo "ERROR: RPC dart_alert_ops_stats 호출 실패 (URL · 마이그레이션 적용 여부 확인)" >&2
    exit 1
  fi
  printf '%s' "$RESP" | node -e '
    const days = process.argv[1];
    const budget = process.argv[2];
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
      const watchLabel = { tender_offer: "공개매수", rights_merger: "유상증자·합병" };
      const rows = [
        ["오늘 OpenDART 호출", `${n(j.calls_today)} / 예산 ${n(budget)} (공식 20,000)`],
        ["오늘 한도 의심 표시", n(j.strikes_today)],
        [`상태별(최근 ${days}일)`, `보냄 ${n(st.sent)} · 대기 ${n(st.pending)} · 보내는 중 ${n(st.sending)} · 채움(seed) ${n(st.seeded)} · 닫힘(지난 날) ${n(st.expired)}`],
        ["감시 대상별", Object.entries(j.by_watch ?? {}).map(([k, v]) => `${watchLabel[k] ?? k} ${n(v)}`).join(" · ") || "-"],
        ["늦은 알림", n(j.late_count)],
        ["지연(처음 봄 → 보냄)", `p50 ${j.latency_p50_s ?? "-"}초 · p90 ${j.latency_p90_s ?? "-"}초`],
        ["장애", j.outage?.since ? `${kst(j.outage.since)} 부터 · 사유 ${j.outage.reason ?? "-"} · 단체방 글 ${j.outage.notice ?? "-"}` : "없음"],
        ["마지막 성공 조회", Object.entries(j.last_ok ?? {}).map(([k, v]) => `${watchLabel[k] ?? k} ${kst(v)}`).join(" · ") || "-"],
        ["임대 보유자", j.lease_holder ?? "-"],
      ];
      console.log(`# 공시 알림 운영 수치 — 최근 ${days}일 (호출 수 · 표시는 오늘 KST)`);
      const w = Math.max(...rows.map(([k]) => k.length));
      for (const [k, v] of rows) console.log(`${k.padEnd(w + 2, " ")}${v}`);
    });
  ' "$DAYS" "$BUDGET_LIMIT"
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
  const bgn = kst(now - days * 86400e3);
  console.log(today.replace(/-/g, ""), bgn.replace(/-/g, ""), today);
' "$DAYS")"

# ── 1. 오늘 사용량 · 한도 의심 표시 확인(운영 기준 ①·④) ──────────
STATS="$(sb_rpc dart_alert_ops_stats '{"p_days":1}' || true)"
if [[ -n "$STATS" ]]; then
  read -r CALLS_TODAY STRIKES_TODAY <<< "$(printf '%s' "$STATS" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { const j = JSON.parse(s); console.log(Number(j.calls_today ?? 0), Number(j.strikes_today ?? 0)); }
      catch { console.log("0 0"); }
    });')"
  if (( STRIKES_TODAY > 0 )); then
    echo "ERROR: 오늘 한도 의심 표시(020)가 ${STRIKES_TODAY}건 있다 — 조사로 두드리지 않는다. 내일 다시 실행" >&2
    exit 1
  fi
  if (( CALLS_TODAY + SURVEY_HEADROOM > BUDGET_LIMIT )); then
    echo "ERROR: 오늘 호출 ${CALLS_TODAY} — 조사 여유 ${SURVEY_HEADROOM} 을 더하면 예산 ${BUDGET_LIMIT} 을 넘는다. 내일 다시 실행" >&2
    exit 1
  fi
  echo "오늘 OpenDART 호출 ${CALLS_TODAY} · 한도 의심 표시 0 — 조사 시작"
else
  echo "WARN: dart_alert_ops_stats 를 읽지 못했다(마이그레이션 적용 전?) — 오늘 사용량 확인 없이 진행" >&2
fi

# ── 2. OpenDART 키(변수에만) ─────────────────────────────────────
DART_KEY="$(gcloud secrets versions access latest --secret=gh-radar-opendart-key --project="$PROJECT" 2>/dev/null || true)"
if [[ -z "$DART_KEY" && -f "$ENV_FILE" ]]; then
  while IFS= read -r line_raw || [[ -n "$line_raw" ]]; do
    line_raw="${line_raw%$'\r'}"
    [[ "$line_raw" == *=* ]] || continue
    line_key="${line_raw%%=*}"
    line_key="${line_key#export }"
    line_key="${line_key//[[:space:]]/}"
    if [[ "$line_key" == OPENDART_API_KEY ]]; then
      DART_KEY="${line_raw#*=}"
    fi
  done < "$ENV_FILE"
  line_raw=""
  DART_KEY="${DART_KEY//[[:space:]\"\']/}"
fi
if [[ -z "$DART_KEY" ]]; then
  echo "ERROR: OpenDART 키를 얻지 못했다 — Secret gh-radar-opendart-key(! bash scripts/setup-dart-alert-secrets.sh) 또는 env 파일 OPENDART_API_KEY 줄" >&2
  exit 1
fi
if [[ ! "$DART_KEY" =~ $DART_KEY_RE ]]; then
  DART_KEY=""
  echo "ERROR: OpenDART 키 꼴이 아니다(영숫자 40자)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
CALLS=0
STOP_REASON=""

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
    line="$(fetch_page "$ty" "$page" "$out")"
    CALLS=$((CALLS + 1))
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

# ── 3. 호출 수를 수집기 카운터에 더한다(실패 호출 포함 · 조사가 멈췄어도) ──
if (( CALLS > 0 )); then
  if sb_rpc incr_api_usage "{\"p_service\":\"${USAGE_SERVICE}\",\"p_date\":\"${TODAY_ISO}\",\"p_amount\":${CALLS}}" >/dev/null; then
    USAGE_NOTE="api_usage ${USAGE_SERVICE} ${TODAY_ISO} 에 +${CALLS} 더함"
  else
    USAGE_NOTE="api_usage 더하기 실패 — 오늘 카운터에 ${CALLS} 이 빠졌다(수집기 예산 판단에 영향 · 수동 확인)"
  fi
else
  USAGE_NOTE="호출 0"
fi

if [[ "$SURVEY_OK" != 1 ]]; then
  echo "ERROR: 조사 중단 — ${STOP_REASON}" >&2
  echo "⑹ 이번 조사 호출 수: ${CALLS} (${USAGE_NOTE})" >&2
  exit 1
fi

# ── 4. 분석 ───────────────────────────────────────────────────────
node -e '
  const fs = require("fs");
  const [b001File, d004File, kindsCsv, calls, usageNote, bgn, end] = process.argv.slice(1);
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
  console.log("⑵ 허용 목록 — 건수(전 법인) · 유가/코스닥 · 유가/코스닥 정정 제외 · 평일당 평균(정정 포함 / 제외)");
  console.log(["종류명", "전체", "Y/K", "Y/K 정정 제외", "평일당(포함)", "평일당(제외)"].join("\t"));
  for (const [k, a] of allowedStat) console.log([k, a.all, a.yk, a.ykNoCorr, avg(a.yk), avg(a.ykNoCorr)].join("\t"));
  console.log(["합계", "", ykAll, ykNoCorr, avg(ykAll), avg(ykNoCorr)].join("\t"));
  const d004yk = d004.filter(([, cls]) => isYK(cls)).length;
  console.log(`하루 알림 예상(평일당) — 유상증자·합병 ${avg(ykAll)}건(정정 제외 ${avg(ykNoCorr)}) + 공개매수 ${avg(d004yk)}건`);
  console.log("");
  const over = [...perDay.entries()].filter(([, n]) => n > 100).sort();
  console.log(`⑶ B001 하루 전체 건수가 100 을 넘은 날: ${over.length}일 / 조회된 ${perDay.size}일` +
    (over.length ? ` — ${over.map(([d, n]) => `${d}(${n})`).join(" · ")}` : ""));
  const maxDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (maxDay) console.log(`    가장 많은 날 ${maxDay[0]} ${maxDay[1]}건`);
  console.log("");
  console.log(`⑷ 공개매수(D004): 전체 ${d004.length}건 · 유가/코스닥 ${d004yk}건`);
  console.log("");
  console.log("⑸ 근접 불일치 후보 — 허용 목록 밖인데 「증자」 · 「합병」 이 든 종류명");
  if (near.size === 0) console.log("    없음");
  for (const [k, n] of [...near.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${n}\t${k}`);
  console.log("");
  console.log(`⑹ 이번 조사 OpenDART 호출 수: ${calls} (${usageNote})`);
' "$WORK/b001.tsv" "$WORK/d004.tsv" "$B001_KINDS" "$CALLS" "$USAGE_NOTE" "$BGN_YMD" "$TODAY_YMD"
