#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 41 Plan 02 — 한투 뉴스·공시 보고 (41-11 사용자 확인용 · 읽기만)
#
#   SUPABASE_URL=https://<ref>.supabase.co bash scripts/kis-news-report.sh kinds [days=1]
#   SUPABASE_URL=https://<ref>.supabase.co bash scripts/kis-news-report.sh stats [days=1]
#
#   kinds — RPC kis_disclosure_kinds(p_days): 최근 공시 제목을 회사명을 걷은 종류별로 묶은 표
#           (건수 · 자료원 코드 · 종류 이름 · 숨김 사유 · 정정 수 · 예시 제목) — D-10 「더 뺄 종류가 있는지」 확인용.
#   stats — RPC kis_news_ops_stats(p_days): 글 수 · 종류별 · 경로별 · 수신 지연 p50/p90 · feed_at · 활성 등록 ·
#           오늘 한투 호출 수 · 한도 의심 표시 수(SC-1 · SC-4).
#
# 서비스롤 키: env SUPABASE_SERVICE_ROLE_KEY 가 있으면 그것, 없으면 Secret gh-radar-supabase-service-role 최신 값을
#   변수에만 담는다. 키는 출력하지 않고 명령줄에도 싣지 않는다(curl 헤더는 stdin 으로 넘긴다 — 프로세스 목록 노출 0).
# 이 스크립트는 DB 를 바꾸지 않는다(두 RPC 모두 STABLE 읽기).
# ═══════════════════════════════════════════════════════════════

usage() {
  echo "사용: SUPABASE_URL=… bash scripts/kis-news-report.sh <kinds|stats> [days=1]" >&2
}

CMD="${1:-}"
DAYS="${2:-1}"

case "$CMD" in
  kinds) RPC=kis_disclosure_kinds ;;
  stats) RPC=kis_news_ops_stats ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac

if [[ ! "$DAYS" =~ ^[0-9]+$ ]] || (( DAYS < 1 || DAYS > 90 )); then
  echo "ERROR: days 는 1 ~ 90 정수 (받은 값 '$DAYS')" >&2
  exit 1
fi

: "${SUPABASE_URL:?SUPABASE_URL must be set}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node 가 없다(표 출력에 쓴다)" >&2
  exit 1
fi

KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
if [[ -z "$KEY" ]]; then
  KEY="$(gcloud secrets versions access latest --secret=gh-radar-supabase-service-role \
          --project="${GCP_PROJECT_ID:-gh-radar}" 2>/dev/null || true)"
fi
if [[ -z "$KEY" ]]; then
  echo "ERROR: 서비스롤 키를 얻지 못했다 — SUPABASE_SERVICE_ROLE_KEY env 또는 gcloud 인증(Secret gh-radar-supabase-service-role 접근)을 확인" >&2
  exit 1
fi

# 헤더는 stdin(-H @-)으로 — 키가 명령줄 · 프로세스 목록에 남지 않는다. printf 는 셸 내장이라 별도 프로세스 인자도 없다.
if ! RESP="$(printf 'apikey: %s\nAuthorization: Bearer %s\nContent-Type: application/json\n' "$KEY" "$KEY" \
  | curl -fsS -X POST "${SUPABASE_URL%/}/rest/v1/rpc/${RPC}" -H @- --data "{\"p_days\":${DAYS}}")"; then
  KEY=""
  echo "ERROR: RPC ${RPC} 호출 실패 (URL · 마이그레이션 적용 여부 확인)" >&2
  exit 1
fi
KEY=""

printf '%s' "$RESP" | node -e '
  const mode = process.argv[1];
  const days = process.argv[2];
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const j = JSON.parse(s);
    if (mode === "kinds") {
      const rows = Array.isArray(j) ? j : [];
      console.log(`# 공시 종류 — 최근 ${days}일 · 묶음 ${rows.length}개 · 글 ${rows.reduce((a, r) => a + r.count, 0)}건`);
      console.log(["건수", "자료원", "종류 이름", "숨김 사유", "정정", "예시 제목"].join("\t"));
      for (const r of rows) {
        console.log([r.count, r.provider_code, r.kind_label, r.hidden_reason ?? "-", r.corrected_count, r.example_title].join("\t"));
      }
      return;
    }
    const flat = (o, p = "") =>
      Object.entries(o ?? {}).flatMap(([k, v]) =>
        v !== null && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]);
    console.log(`# 운영 수치 — 최근 ${days}일`);
    for (const [k, v] of flat(j)) console.log(`${k}\t${v ?? "-"}`);
  });
' "$CMD" "$DAYS"
