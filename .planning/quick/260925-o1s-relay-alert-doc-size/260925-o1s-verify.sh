#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# quick-260925-o1s 검증 하네스
#
#   bash 260925-o1s-verify.sh stub                       # deploy-relay.sh 두 경로를 가짜 gcloud/docker 로 실행
#   bash 260925-o1s-verify.sh size                       # 알림 documentation 크기 · 문서 밖 필드 불변 · 옮긴 사실
#   bash 260925-o1s-verify.sh precheck <before.json>     # 적용 전: 로컬 문서 밖 필드 ⊆ 라이브
#   bash 260925-o1s-verify.sh live-diff <before> <after> # 적용 후: 문서만 바뀌었는지
#
# stub 은 **실제 GCP·docker 에 닿을 수 없다.** 가짜 `gcloud`·`docker` 를 PATH 맨 앞에 두고,
# 가짜 gcloud 가 모르는 하위명령은 전부 `unexpected gcloud: …` + exit 97 로 실패시킨다.
# precheck · live-diff 는 describe JSON 파일만 읽는다(네트워크 호출 없음).
#
# YAML 파싱은 시스템 ruby(Psych), JSON 비교는 python3 (python3 에는 PyYAML 이 없다).
# 실패는 원인 한 줄 + exit 1, 통과는 `<NAME> PASS …` 한 줄.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BASE_REF="${BASE_REF:-1978d9b}"
ALERT_FILE=ops/alert-relay-down.yaml
OPS_DOC=docs/relay-operations.md
DEPLOY=scripts/deploy-relay.sh
MAX_DOC=9500
LIVE_CHANNEL=projects/gh-radar/notificationChannels/14409521670382124894

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() { echo "$*" >&2; exit 1; }

# YAML 파일의 documentation.content (GCP 가 받는 문자열 그대로)의 UTF-8 바이트
doc_bytes() { ruby -ryaml -e 'print YAML.load_file(ARGV[0])["documentation"]["content"].bytesize' "$1"; }

# ───────────────────────────────────────────────────────────────
# stub
# ───────────────────────────────────────────────────────────────
make_stubs() {
  local bin="$1"
  mkdir -p "$bin"
  cat > "$bin/gcloud" <<'GCLOUD_EOF'
#!/usr/bin/env bash
printf 'gcloud %s\n' "$*" >> "$STUB_LOG"
args="$*"
case "$args" in
  "config configurations list"*) echo gh-radar ;;
  "config get-value project"*) echo gh-radar ;;
  "compute ssh"*"docker inspect"*) echo 10.41.1.120 ;;
  "compute ssh"*) : ;;
  "compute instances describe"*) echo RUNNING ;;
  "secrets describe"*) : ;;
  "secrets versions list"*) echo 1 ;;
  "secrets get-iam-policy"*) echo "serviceAccount:gh-radar-relay-sa@gh-radar.iam.gserviceaccount.com" ;;
  "compute firewall-rules list"*)
    printf 'relay-allow-https\tradar-gw\nrelay-allow-iap-ssh\tradar-gw\nrelay-allow-internal-order\tradar-gw\nrelay-allow-wireguard\tradar-gw\n' ;;
  "auth configure-docker"*) : ;;
  "monitoring uptime list-configs"*) echo "projects/gh-radar/uptimeCheckConfigs/stub-uptime" ;;
  "monitoring uptime update"*) : ;;
  "alpha monitoring policies list"*)
    [ "${STUB_NO_POLICY:-}" = 1 ] || echo "projects/gh-radar/alertPolicies/7995724305267722560" ;;
  "alpha monitoring policies update"*|"alpha monitoring policies create"*)
    for a in "$@"; do
      case "$a" in --policy-from-file=*) cp "${a#--policy-from-file=}" "$STUB_OUT/resolved.yaml" ;; esac
    done ;;
  *) echo "unexpected gcloud: $*" >&2; exit 97 ;;
esac
GCLOUD_EOF
  cat > "$bin/docker" <<'DOCKER_EOF'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$STUB_LOG"
exit 0
DOCKER_EOF
  chmod +x "$bin/gcloud" "$bin/docker"
}

# run_stub <name> <script> [env assignments...] -- [script args...]
# 결과: $WORK/<name>/{log,out,err,rc,resolved.yaml}
run_stub() {
  local name="$1" script="$2"; shift 2
  local dir="$WORK/$name" envs=() rc=0
  mkdir -p "$dir/tmp"
  : > "$dir/log"
  while [[ $# -gt 0 && "$1" != "--" ]]; do envs+=("$1"); shift; done
  [[ "${1:-}" == "--" ]] && shift
  env -u SUPABASE_URL -u NOTIFICATION_CHANNEL_ID -u DMA_HOST -u LOG_LEVEL -u STUB_NO_POLICY \
      -u CLOUDSDK_CORE_PROJECT -u GOOGLE_APPLICATION_CREDENTIALS \
      PATH="$WORK/bin:$PATH" TMPDIR="$dir/tmp" STUB_LOG="$dir/log" STUB_OUT="$dir" \
      ${envs[@]+"${envs[@]}"} \
      bash "$script" "$@" > "$dir/out" 2> "$dir/err" || rc=$?
  echo "$rc" > "$dir/rc"
}
rc_of() { cat "$WORK/$1/rc"; }
count_in() { grep -c -- "$2" "$WORK/$1/log" || true; }
norm_log() { sed -E 's|--policy-from-file=[^ ]+|--policy-from-file=<RESOLVED>|g' "$WORK/$1/log"; }

cmd_stub() {
  make_stubs "$WORK/bin"
  git show "$BASE_REF:$DEPLOY" > "$WORK/base-deploy.sh"
  local full_env=(GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://stub.supabase.co NOTIFICATION_CHANNEL_ID=123)
  local ao_env=(GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=123)

  # S1 전체 경로 회귀 — 기준판 vs 새 판
  run_stub s1-base "$WORK/base-deploy.sh" "${full_env[@]}" --
  run_stub s1-new "$DEPLOY" "${full_env[@]}" --
  [[ "$(rc_of s1-base)" == 0 ]] || fail "S1 기준판 exit=$(rc_of s1-base): $(tail -3 "$WORK/s1-base/err")"
  [[ "$(rc_of s1-new)" == 0 ]] || fail "S1 새 판 exit=$(rc_of s1-new): $(tail -3 "$WORK/s1-new/err")"
  diff <(norm_log s1-base) <(norm_log s1-new) >&2 || fail "S1 호출 로그가 기준판과 다르다"
  cat "$WORK/s1-base/out" "$WORK/s1-base/err" > "$WORK/s1-base/all"
  cat "$WORK/s1-new/out" "$WORK/s1-new/err" > "$WORK/s1-new/all"
  diff "$WORK/s1-base/all" "$WORK/s1-new/all" >&2 || fail "S1 출력(stdout+stderr)이 기준판과 다르다"
  local up_ln pol_ln
  up_ln=$(grep -n 'monitoring uptime update' "$WORK/s1-new/log" | head -1 | cut -d: -f1)
  pol_ln=$(grep -n 'alpha monitoring policies update' "$WORK/s1-new/log" | head -1 | cut -d: -f1)
  [[ -n "$up_ln" && -n "$pol_ln" && "$up_ln" -lt "$pol_ln" ]] || fail "S1 uptime update 가 policies update 보다 앞이 아니다 ($up_ln / $pol_ln)"
  [[ -f "$WORK/s1-base/resolved.yaml" && -f "$WORK/s1-new/resolved.yaml" ]] || fail "S1 resolved.yaml 미포착"
  cmp -s "$WORK/s1-base/resolved.yaml" "$WORK/s1-new/resolved.yaml" || fail "S1 resolved.yaml 이 기준판과 다르다"
  echo "  S1 ok — 전체 경로: 호출 $(wc -l < "$WORK/s1-new/log" | tr -d ' ')건 · 출력 · resolved.yaml 기준판과 동일"

  # S2 --alert-only (SUPABASE_URL 없음)
  run_stub s2 "$DEPLOY" "${ao_env[@]}" -- --alert-only
  [[ "$(rc_of s2)" == 0 ]] || fail "S2 exit=$(rc_of s2): $(tail -3 "$WORK/s2/err")"
  [[ "$(count_in s2 'alpha monitoring policies list')" -ge 1 ]] || fail "S2 policies list 호출 없음"
  [[ "$(count_in s2 'alpha monitoring policies update')" -ge 1 ]] || fail "S2 policies update 호출 없음"
  local pat
  for pat in 'compute ssh' 'compute instances' 'gcloud secrets' 'firewall-rules' 'monitoring uptime' '^docker '; do
    [[ "$(count_in s2 "$pat")" == 0 ]] || fail "S2 금지 호출 발견: $pat"
  done
  local r2="$WORK/s2/resolved.yaml"
  [[ -f "$r2" ]] || fail "S2 resolved.yaml 미포착"
  grep -q 'projects/gh-radar/notificationChannels/123' "$r2" || fail "S2 채널 치환 없음"
  ! grep -qF '${NOTIFICATION_CHANNEL_ID}' "$r2" || fail "S2 자리표시자 잔존"
  cmp -s "$r2" "$WORK/s1-new/resolved.yaml" || fail "S2 resolved.yaml 이 S1 과 다르다"
  echo "  S2 ok — --alert-only: 호출 $(wc -l < "$WORK/s2/log" | tr -d ' ')건(가드 2 + list + update) · resolved documentation=$(doc_bytes "$r2") bytes"

  # S2b 생성 갈래
  run_stub s2b "$DEPLOY" "${ao_env[@]}" STUB_NO_POLICY=1 -- --alert-only
  [[ "$(rc_of s2b)" == 0 ]] || fail "S2b exit=$(rc_of s2b)"
  [[ "$(count_in s2b 'alpha monitoring policies create')" -ge 1 ]] || fail "S2b policies create 호출 없음"
  echo "  S2b ok — 정책 없음 → create"

  # S3 --alert-only + 채널 미설정
  run_stub s3 "$DEPLOY" GCP_PROJECT_ID=gh-radar -- --alert-only
  [[ "$(rc_of s3)" != 0 ]] || fail "S3 채널 없이 exit 0"
  [[ "$(count_in s3 'policies update')" == 0 && "$(count_in s3 'policies create')" == 0 ]] || fail "S3 정책 호출 발생"
  echo "  S3 ok — 채널 미설정 → exit $(rc_of s3), 정책 호출 0"

  # S4 알 수 없는 인자
  run_stub s4 "$DEPLOY" GCP_PROJECT_ID=gh-radar -- --bogus
  [[ "$(rc_of s4)" == 1 ]] || fail "S4 exit=$(rc_of s4) (기대 1)"
  grep -q 'usage:' "$WORK/s4/err" && grep -q -- '--alert-only' "$WORK/s4/err" || fail "S4 usage 문구에 --alert-only 없음"
  echo "  S4 ok — --bogus → exit 1 + usage"

  # S5 기본 모드 + SUPABASE_URL 미설정 → 가드 순서 불변
  run_stub s5 "$DEPLOY" GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID=123 --
  [[ "$(rc_of s5)" != 0 ]] || fail "S5 SUPABASE_URL 없이 exit 0"
  grep -q 'SUPABASE_URL must be set' "$WORK/s5/err" || fail "S5 SUPABASE_URL 가드 메시지 없음"
  [[ "$(count_in s5 'compute ssh')" == 0 ]] || fail "S5 가드 전에 compute ssh 호출"
  echo "  S5 ok — 기본 모드 SUPABASE_URL 미설정 → exit $(rc_of s5), compute ssh 0"

  echo "STUB PASS"
}

# ───────────────────────────────────────────────────────────────
# size
# ───────────────────────────────────────────────────────────────
cmd_size() {
  local n base="$WORK/base-alert.yaml"
  git show "$BASE_REF:$ALERT_FILE" > "$base"

  # (1) 크기
  n=$(doc_bytes "$ALERT_FILE")
  [[ "$n" -le "$MAX_DOC" ]] || fail "SIZE documentation=$n bytes > $MAX_DOC (기준판 $(doc_bytes "$base"))"

  # (2) 문서 밖 구조 동등
  ruby -ryaml -e '
    a = YAML.load_file(ARGV[0]); b = YAML.load_file(ARGV[1])
    [a, b].each { |y| y["documentation"].delete("content") }
    exit(a == b ? 0 : 1)' "$base" "$ALERT_FILE" || fail "SIZE 문서 밖 구조가 기준판과 다르다"

  # (3) mimeType 이하 바이트 동일
  cmp -s <(sed -n '/^  mimeType:/,$p' "$base") <(sed -n '/^  mimeType:/,$p' "$ALERT_FILE") \
    || fail "SIZE mimeType 이하가 기준판과 바이트 단위로 다르다"
  [[ -n "$(sed -n '/^  mimeType:/,$p' "$ALERT_FILE")" ]] || fail "SIZE mimeType 줄을 찾지 못했다"

  # (4) 8번은 4줄 이하
  local lines8
  lines8=$(ruby -ryaml -e '
    ls = YAML.load_file(ARGV[0])["documentation"]["content"].lines
    i = ls.index { |l| l.start_with?("8. ") } or (puts(-1); exit)
    c = 0
    ls[i..-1].each { |l| break if l.strip.empty?; c += 1 }
    puts c' "$ALERT_FILE")
  [[ "$lines8" -ge 1 && "$lines8" -le 4 ]] || fail "SIZE 8번 줄 수=$lines8 (1~4 기대)"

  # (5) ops 본문(주석 줄 제외) 필수/금지 문자열
  local body="$WORK/ops-body.txt" s
  grep -v -E '^[[:space:]]*#' "$ALERT_FILE" > "$body"
  for s in '「상태별 대응」' 'docs/relay-operations.md 「관찰자 기록 연결 (Phase 19)」' \
           '"state":"rejected"' '"state":"db_error"' 'disconnectedSec' 'curl -s -w'; do
    grep -qF -- "$s" "$body" || fail "SIZE ops 에 필수 문자열 없음: $s"
  done
  for s in 'lagSeq' 'apply_error is not null' '관찰자 로그인(5)'; do
    [[ "$(grep -cF -- "$s" "$body" || true)" == 0 ]] || fail "SIZE ops 에 옮겨야 할 문자열 잔존: $s"
  done

  # (6) 운영 문서에 옛 8번 사실 + 새 규칙
  for s in '| tail -50' '은 관찰자(연결·로그인·상태 전이)' '아침 확인 대상' '호가·주문 자체는 영향이 없' \
           '**해시로** 대조' '관찰자 로그인(5)' '30초 간격' 'lagSeq' \
           'apply_error is not null order by seq desc limit 20' '**유실은 없다**' \
           '상태별 대응 (알림 8번 상세)' '--alert-only' '10,240 바이트'; do
    grep -qF -- "$s" "$OPS_DOC" || fail "SIZE 운영 문서에 없음: $s"
  done
  [[ "$(grep -cxF '## 관찰자 기록 연결 (Phase 19)' "$OPS_DOC")" == 1 ]] || fail "SIZE 운영 문서 헤딩 '## 관찰자 기록 연결 (Phase 19)' 가 정확히 1회가 아니다"

  echo "SIZE PASS bytes=$n (base=$(doc_bytes "$base") lines8=$lines8)"
}

# ───────────────────────────────────────────────────────────────
# precheck / live-diff 공용 — 로컬 YAML(채널 치환) → JSON
# ───────────────────────────────────────────────────────────────
local_json() {
  sed "s|\${NOTIFICATION_CHANNEL_ID}|${LIVE_CHANNEL}|g" "$ALERT_FILE" > "$WORK/local.yaml"
  ruby -ryaml -rjson -e 'print JSON.generate(YAML.load_file(ARGV[0]))' "$WORK/local.yaml" > "$WORK/local.json"
}

cmd_precheck() {
  local before="${1:?usage: precheck <before.json>}"
  [[ -f "$before" ]] || fail "PRECHECK before 파일 없음: $before"
  local_json
  python3 - "$WORK/local.json" "$before" <<'PY' || { echo "PRECHECK STOP — 적용하면 문서 밖 설정이 바뀐다" >&2; exit 1; }
import json, re, sys
local = json.load(open(sys.argv[1])); live = json.load(open(sys.argv[2]))
bad = []
def ws(s): return re.sub(r'\s+', ' ', s).strip()
def sub(l, r, path):
    if isinstance(l, dict):
        if not isinstance(r, dict): bad.append(f"{path}: 라이브가 객체가 아님 ({r!r})"); return
        for k, v in l.items():
            if k not in r: bad.append(f"{path}.{k}: 라이브에 없음 (로컬 {v!r})"); continue
            sub(v, r[k], f"{path}.{k}")
        extra = sorted(set(r) - set(l))
        if extra: print(f"  info: {path} 라이브에만 있는 키 {extra}")
    elif isinstance(l, list):
        if not isinstance(r, list) or len(l) != len(r): bad.append(f"{path}: 목록 불일치 {l!r} vs {r!r}"); return
        for i, (a, b) in enumerate(zip(l, r)): sub(a, b, f"{path}[{i}]")
    elif isinstance(l, bool) or l is None:
        if l != r: bad.append(f"{path}: {l!r} vs {r!r}")
    elif isinstance(l, (int, float)):
        try:
            if abs(float(l) - float(r)) > 1e-9: bad.append(f"{path}: {l!r} vs {r!r}")
        except (TypeError, ValueError): bad.append(f"{path}: {l!r} vs {r!r}")
    elif isinstance(l, str):
        if path.endswith('.filter'):
            if not isinstance(r, str) or ws(l) != ws(r): bad.append(f"{path}: filter 불일치\n    로컬 {ws(l)!r}\n    라이브 {r!r}")
        elif l != r: bad.append(f"{path}: {l!r} vs {r!r}")
    else:
        if l != r: bad.append(f"{path}: {l!r} vs {r!r}")

for k in ('displayName', 'combiner', 'enabled', 'notificationChannels'):
    if local.get(k) != live.get(k): bad.append(f"{k}: 로컬 {local.get(k)!r} vs 라이브 {live.get(k)!r}")
if (local.get('alertStrategy') or {}).get('autoClose') != (live.get('alertStrategy') or {}).get('autoClose'):
    bad.append(f"alertStrategy.autoClose: {local.get('alertStrategy')!r} vs {live.get('alertStrategy')!r}")

lc = local.get('conditions') or []; rc = live.get('conditions') or []
if len(lc) != len(rc): bad.append(f"conditions 개수: 로컬 {len(lc)} vs 라이브 {len(rc)}")
rmap = {c.get('displayName'): c for c in rc}
for c in lc:
    dn = c.get('displayName'); r = rmap.get(dn)
    if r is None: bad.append(f"condition '{dn}': 라이브에 없음"); continue
    if 'conditionThreshold' not in r: bad.append(f"condition '{dn}': 라이브에 conditionThreshold 없음"); continue
    sub(c.get('conditionThreshold') or {}, r['conditionThreshold'], f"conditions['{dn}'].conditionThreshold")

if bad:
    for b in bad: print("  MISMATCH " + b, file=sys.stderr)
    sys.exit(1)
print(f"  conditions {len(lc)}개 · combiner {local['combiner']} · enabled {local['enabled']} · channels {local['notificationChannels']} · autoClose {local['alertStrategy']['autoClose']} — 라이브와 일치")
PY
  echo "PRECHECK PASS"
}

cmd_live_diff() {
  local before="${1:?usage: live-diff <before.json> <after.json>}" after="${2:?usage: live-diff <before.json> <after.json>}"
  [[ -f "$before" && -f "$after" ]] || fail "LIVE before/after 파일 없음"

  # (1) 문서 밖 투영 동일
  python3 - "$before" "$after" <<'PY' || fail "LIVE 문서 밖 투영이 before/after 에서 다르다"
import json, sys
def proj(p):
    d = json.load(open(p))
    conds = []
    for c in d.get('conditions') or []:
        c = dict(c); c.pop('name', None); conds.append(c)
    conds.sort(key=lambda c: c.get('displayName', ''))
    return {k: d.get(k) for k in ('displayName', 'combiner', 'enabled', 'notificationChannels',
                                  'alertStrategy', 'severity', 'userLabels')} | {'conditions': conds}
a, b = proj(sys.argv[1]), proj(sys.argv[2])
if a != b:
    print(json.dumps(a, sort_keys=True, indent=1, ensure_ascii=False), file=sys.stderr)
    print(json.dumps(b, sort_keys=True, indent=1, ensure_ascii=False), file=sys.stderr)
    sys.exit(1)
PY

  # (2) after 문서 = 로컬 content (바이트)
  ruby -ryaml -e 'print YAML.load_file(ARGV[0])["documentation"]["content"]' "$ALERT_FILE" > "$WORK/local-doc.txt"
  python3 - "$before" "$after" "$WORK" <<'PY'
import json, sys
for tag, p in (('before', sys.argv[1]), ('after', sys.argv[2])):
    c = ((json.load(open(p)).get('documentation') or {}).get('content')) or ''
    open(f"{sys.argv[3]}/{tag}-doc.txt", 'wb').write(c.encode('utf-8'))
PY
  cmp -s "$WORK/after-doc.txt" "$WORK/local-doc.txt" || fail "LIVE 라이브 문서가 로컬 content 와 바이트 단위로 다르다 (after=$(wc -c < "$WORK/after-doc.txt" | tr -d ' ') local=$(wc -c < "$WORK/local-doc.txt" | tr -d ' '))"

  # (3) 「상태별 대응」 포함 · before 와 다름
  grep -qF '「상태별 대응」' "$WORK/after-doc.txt" || fail "LIVE after 문서에 「상태별 대응」 없음"
  ! cmp -s "$WORK/after-doc.txt" "$WORK/before-doc.txt" || fail "LIVE 문서가 적용 전과 같다 (갱신 안 됨)"

  # (4) 크기
  local b a
  b=$(wc -c < "$WORK/before-doc.txt" | tr -d ' '); a=$(wc -c < "$WORK/after-doc.txt" | tr -d ' ')
  [[ "$a" -le "$MAX_DOC" ]] || fail "LIVE after 문서 $a bytes > $MAX_DOC"

  echo "LIVE PASS before_doc=$b after_doc=$a"
}

case "${1:-}" in
  stub) cmd_stub ;;
  size) cmd_size ;;
  precheck) shift; cmd_precheck "$@" ;;
  live-diff) shift; cmd_live_diff "$@" ;;
  *) echo "usage: $0 stub | size | precheck <before.json> | live-diff <before.json> <after.json>" >&2; exit 2 ;;
esac
