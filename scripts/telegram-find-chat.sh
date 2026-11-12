#!/usr/bin/env bash
set -euo pipefail
umask 077

# ═══════════════════════════════════════════════════════════════
# telegram-find-chat.sh — 봇이 받은 대화에서 방 id · 종류 · 이름만 보여 주는 도우미 (Phase 43 · 43-07 · D-15)
#
# 사용자가 직접 실행한다:
#   ! bash scripts/telegram-find-chat.sh
#
# 순서(RESEARCH Pattern 7):
#   1. BotFather 로 봇을 만들고 토큰을 ~/.config/gh-radar/dart-alert.env(권한 600)에 한 줄로 적는다
#        TELEGRAM_BOT_TOKEN=<토큰>
#   2. 봇과 1:1 대화를 열고 「시작(Start)」 을 누른다 — 봇은 먼저 대화를 건 적 없는 사람에게 글을 못 보낸다(시험 글 403 방지).
#   3. 팀 단체방에 봇을 초대한다(초대 자체가 봇에게 업데이트로 남는다).
#   4. 바로 이 스크립트를 실행한다 — 텔레그램은 업데이트를 24시간만 보관한다.
#   5. 보인 id 를 env 파일 TELEGRAM_CHAT_ID= 에 적고 `! bash scripts/setup-dart-alert-secrets.sh`
#      (처음엔 개인 대화 id 로 시험 글 → 확인 뒤 단체방 id 로 바꿔 다시 실행)
#
# 규약:
#   - 토큰은 env 파일에서 TELEGRAM_BOT_TOKEN 한 줄만 읽어 변수에만 둔다. 명령줄 · 화면 · 프로세스 목록에 나오지 않는다 —
#     요청 주소는 printf 로 만든 curl 설정 줄을 파이프로 curl 의 표준입력 설정(-K -)에 넘긴다(printf 는 셸 내장).
#   - 출력은 방 id · 종류(type) · 이름(title 또는 username 또는 first_name)뿐 — 원본 JSON · 토큰 · 글 내용은 출력하지 않는다.
#   - getUpdates 는 읽기만 한다(offset 을 넘기지 않아 업데이트를 지우지 않는다). 웹훅이 걸린 봇이면 동작하지 않는다.
#   - 셸 추적 모드를 켜지 않는다.
#
# 선택 env
#   DART_ALERT_ENV_FILE   입력 파일. 기본 ~/.config/gh-radar/dart-alert.env
# ═══════════════════════════════════════════════════════════════

ENV_FILE="${DART_ALERT_ENV_FILE:-$HOME/.config/gh-radar/dart-alert.env}"
TELEGRAM_API=https://api.telegram.org
TG_TOKEN_RE='^[0-9]+:[A-Za-z0-9_-]{30,}$'

case "${1:-}" in
  -h | --help)
    echo "사용: ! bash scripts/telegram-find-chat.sh   (입력: \${DART_ALERT_ENV_FILE:-~/.config/gh-radar/dart-alert.env} 의 TELEGRAM_BOT_TOKEN 한 줄)"
    echo "      출력: 방 id · 종류 · 이름만 (토큰 · 원본 응답은 나오지 않는다)"
    exit 0
    ;;
  "") ;;
  *)
    echo "ERROR args — 인자를 받지 않는다 (--help 참고)" >&2
    exit 1
    ;;
esac

for bin in curl node; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR $bin — 명령이 없다" >&2
    exit 1
  fi
done

file_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR input — 파일 없음: $ENV_FILE (머리 주석 1번)" >&2
  exit 1
fi
MODE="$(file_mode "$ENV_FILE")"
if [[ "$MODE" != 600 && "$MODE" != 400 ]]; then
  echo "ERROR input — 권한이 600 또는 400 이 아니다: $ENV_FILE (chmod 600 뒤 다시 실행)" >&2
  exit 1
fi

# TELEGRAM_BOT_TOKEN 한 줄만 — 첫 '=' 에서만 자르고 따옴표 한 겹 · 앞뒤 공백을 걷는다.
TG_TOKEN=""
while IFS= read -r line_raw || [[ -n "$line_raw" ]]; do
  line_raw="${line_raw%$'\r'}"
  [[ "$line_raw" == *=* ]] || continue
  line_key="${line_raw%%=*}"
  line_key="${line_key#export }"
  line_key="${line_key//[[:space:]]/}"
  if [[ "$line_key" == TELEGRAM_BOT_TOKEN ]]; then
    TG_TOKEN="${line_raw#*=}"
  fi
done < "$ENV_FILE"
line_raw=""
TG_TOKEN="${TG_TOKEN#"${TG_TOKEN%%[![:space:]]*}"}"
TG_TOKEN="${TG_TOKEN%"${TG_TOKEN##*[![:space:]]}"}"
if [[ ${#TG_TOKEN} -ge 2 && ( ( "${TG_TOKEN:0:1}" == '"' && "${TG_TOKEN: -1}" == '"' ) || ( "${TG_TOKEN:0:1}" == "'" && "${TG_TOKEN: -1}" == "'" ) ) ]]; then
  TG_TOKEN="${TG_TOKEN:1:${#TG_TOKEN}-2}"
fi

if [[ -z "$TG_TOKEN" ]]; then
  echo "ERROR TELEGRAM_BOT_TOKEN — 파일에 줄이 없거나 값이 비었다: $ENV_FILE" >&2
  exit 1
fi
# 꼴 검사는 curl 설정 줄에 따옴표 · 역슬래시가 끼어드는 것도 막는다.
if [[ ! "$TG_TOKEN" =~ $TG_TOKEN_RE ]]; then
  TG_TOKEN=""
  echo "ERROR TELEGRAM_BOT_TOKEN — 꼴이 아니다(숫자:영숫자_- · BotFather 토큰 전체를 복사했는지 확인)" >&2
  exit 1
fi

# 요청 — 주소(토큰 포함)는 표준입력 설정으로만. curl 오류 문구도 화면에 내지 않는다(종료 코드만).
CURL_RC=0
RESP="$(printf 'url = "%s/bot%s/getUpdates"\nmax-time = 20\n' "$TELEGRAM_API" "$TG_TOKEN" \
  | curl -sS -K - 2>/dev/null)" || CURL_RC=$?
TG_TOKEN=""
if [[ "$CURL_RC" != 0 ]]; then
  echo "ERROR getUpdates — 요청 실패(curl 종료 코드 $CURL_RC · 네트워크 확인)" >&2
  exit 1
fi

# 응답에서 방 정보만 뽑는다 — 원본 JSON · 글 내용은 출력하지 않는다.
printf '%s' "$RESP" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    let j;
    try {
      j = JSON.parse(s);
    } catch {
      console.error("ERROR getUpdates — 응답이 JSON 이 아니다");
      process.exit(1);
    }
    if (!j || j.ok !== true) {
      const desc = typeof j?.description === "string" ? j.description.slice(0, 200) : "(설명 없음)";
      console.error(`ERROR getUpdates — ${desc}`);
      process.exit(1);
    }
    const chats = new Map();
    for (const u of Array.isArray(j.result) ? j.result : []) {
      for (const key of ["message", "edited_message", "channel_post", "my_chat_member", "chat_member"]) {
        const c = u?.[key]?.chat;
        if (!c || (typeof c.id !== "number" && typeof c.id !== "string")) continue;
        const name = c.title ?? (c.username ? `@${c.username}` : c.first_name) ?? "-";
        chats.set(String(c.id), { id: String(c.id), type: String(c.type ?? "-"), name: String(name).slice(0, 60) });
      }
    }
    if (chats.size === 0) {
      console.log("찾은 방이 없다 — 아래를 하고 바로 다시 실행한다:");
      console.log("  1. 봇과 1:1 대화를 열고 「시작(Start)」 을 누른다(개인 대화 id)");
      console.log("  2. 팀 단체방에 봇을 초대한다(또는 단체방에 아무 글이나 하나 쓴다)");
      console.log("  3. 텔레그램은 업데이트를 24시간만 보관한다 — 초대 · 시작 직후에 실행한다");
      return;
    }
    console.log(["방 id", "종류", "이름"].join("\t"));
    for (const c of chats.values()) console.log([c.id, c.type, c.name].join("\t"));
    console.log("");
    console.log("종류: private = 개인 대화(시험 글용) · supergroup · group = 단체방 · channel = 채널");
    if ([...chats.values()].some((c) => c.type === "group")) {
      console.log("주의: 일반 그룹(group) — 슈퍼그룹으로 바뀌면 방 id 가 바뀐다. 수집기가 새 id 로 다시 보내고 이메일로 알린다 —");
      console.log("      그때 env 파일 TELEGRAM_CHAT_ID 를 새 id 로 바꾸고 ! bash scripts/setup-dart-alert-secrets.sh 를 다시 실행한다.");
    }
    console.log("다음: env 파일에 TELEGRAM_CHAT_ID=<방 id> 를 적고 ! bash scripts/setup-dart-alert-secrets.sh");
  });
'
RESP=""
