---
phase: quick-260911-dps
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - infra/relay/Caddyfile
  - infra/relay/startup.sh
  - infra/relay/README.md
autonomous: true
requirements: [RELAY-03]

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 2
  confidence: low   # estimate-calibration: sample_count=0, factor=1.0 (applied=false)

must_haves:
  truths:
    - "`/ghtrade/*` 정적 서빙 블록이 `handle /healthz` **뒤**, 매처 없는 기본 `handle` **앞**에 놓인다 — 기본 `handle` 은 모든 경로에 일치하고 `handle`/`handle_path` 는 상호 배타적이라, 뒤에 두면 요청이 relay wss 프록시로 새어 정적 파일이 영원히 안 나온다"
    - "`Authorization: Bearer <고정키>` 가 **정확히** 일치할 때만 파일이 나오고, 불일치·부재는 401 이 아니라 **404** 다 (경로의 존재 자체를 숨긴다)"
    - "`/ghtrade` 이름 아래 어떤 경로도 relay wss 프록시로 새지 않는다 — 미인증 `/ghtrade`·`/ghtrade/*` 는 404, 인증된 `/ghtrade`(파일 미지목)도 404"
    - "`manifest.json`·`manifest.sig` 두 파일에만 `Cache-Control: no-store` 가 붙고 나머지 파일은 기본 캐시 동작을 그대로 쓴다"
    - "Caddyfile 상단 주석 ①~⑤ · `tls` 블록 · `handle /healthz` · 기본 `reverse_proxy 127.0.0.1:8090` · `log` 블록은 한 글자도 바뀌지 않는다"
    - "고정키 리터럴이 왜 SC-8(비밀 미기록) 위반이 아닌지가 Caddyfile 주석에 근거와 함께 남아, 다음 사람이 규율 위반으로 오독하거나 반사적으로 Secret Manager 로 옮기지 않는다"
    - "`startup.sh` 가 `/srv/ghtrade` 를 멱등하게 만들고, `alex` 계정이 없는 환경에서도 `set -euo pipefail` 아래에서 죽지 않고 부팅을 완주한다"
    - "`startup.sh` 는 caddy 를 기동·재기동·리로드하지 않는다 — 기존 caddy 가드(`is-active || is-enabled` 면 미개입)와 `install_asset caddyfile` 흐름이 그대로다"
    - "README 만 읽고도 gh-trade 발행 스크립트가 어디로·어떤 사용자로·어떤 순서로 올리는지, 그리고 이 블록을 바꿀 때 언제 리로드해야 하는지 알 수 있다"
    - "고정키 리터럴은 저장소 안에서 `infra/relay/Caddyfile` 단 한 곳에만 존재한다 (README 는 값을 복제하지 않고 Caddyfile 을 지목한다)"
  artifacts:
    - infra/relay/Caddyfile
    - infra/relay/startup.sh
    - infra/relay/README.md
    - .planning/quick/260911-dps-radar-gw-caddy-ghtrade-srv-ghtrade/260911-dps-SUMMARY.md
  key_links:
    - "Caddyfile `handle_path /ghtrade/*` → `root * /srv/ghtrade` → startup.sh 가 만드는 실제 디렉터리 — 경로 문자열이 두 파일에서 같아야 한다"
    - "startup.sh `/srv/ghtrade` 소유·권한(`alex:caddy` 2755) → caddy(uid 999) 의 읽기 가능성 → `file_server` 가 실제로 파일을 내보낼 수 있는지"
    - "Caddyfile 고정키 리터럴 → gh-trade 클라 소스 상수(D-11) — 두 저장소가 같은 문자열이어야 동작한다. 한쪽만 바꾸면 전 클라가 404 를 받는다"
    - "`Authorization: Bearer` 형식 선택(D-11) → Caddyfile 상단 주석 ④(Caddy 기본 로그가 Authorization 헤더를 가린다) — 그 기본값을 유지해야 키가 `dma.log` 에 남지 않는다"
    - "이 블록 변경 → caddy 리로드 → 진행 중 wss 강제 종료(상단 주석 ③) — README 운영 절이 리로드 타이밍 규칙을 명시해야 한다"
---

<objective>
radar-gw 의 Caddy 에 gh-trade WinForms 클라 자동 업데이트용 **정적 배포 표면**(`https://dma.jx1.io/ghtrade/*`)을 열고, 그 파일이 놓일 `/srv/ghtrade` 를 `startup.sh` 가 멱등하게 준비하도록 만든다. 운영 문서에 파일 맵·인증·캐시·업로드·리로드 규칙을 남긴다.

Purpose: gh-trade Phase 20(클라 자동 업데이트)의 **선행 의존**이다. 클라는 기동 시 `https://dma.jx1.io/ghtrade/manifest.json` 을 받아 파일별 SHA-256 이 다른 것만 내려받아 자기 교체한다. 게이트웨이(10.41.1.120)가 아니라 radar-gw 에 두는 이유는 확정돼 있다 — WireGuard 터널 사용자는 VM 의 nft `wgfwd` 규칙상 120 의 9100·22 에만 닿지만, `dma.jx1.io` 는 공인 443 + Let's Encrypt TLS 가 이미 있어 VPN·터널 상태와 무관하게 받을 수 있다.

Output: `infra/relay/Caddyfile` 의 `/ghtrade` 3블록, `infra/relay/startup.sh` 의 `/srv/ghtrade` 멱등 생성, `infra/relay/README.md` 의 파일 맵 1행 + 운영 절 1개.

**이 플랜은 저장소 파일 3개만 고친다. VM 적용 0 · 메타데이터 갱신 0 · caddy 리로드 0 · gcloud 호출 0 · 배포 0 · 실계좌 주문 0.**
리로드는 **오늘 15:40 KST 에 오케스트레이터가 별도로** 한다 (장중 리로드가 진행 중 wss 를 끊기 때문 — 상단 주석 ③).
gh-trade 저장소 파일은 **읽기만** 했고 편집하지 않는다 (D-15 의 분업 경계).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@infra/relay/Caddyfile
@infra/relay/startup.sh
@infra/relay/README.md
</context>

<inherited_facts>
오케스트레이터가 VM 에서 **실측**한 사실이다. 다시 조사하지 말 것 (VM 접속 자체가 이 플랜에서 금지다).

| 사실 | 값 |
|------|-----|
| IAP ssh 사용자 | `alex` (`/home/alex`, VM 의 유일한 사용자 계정) |
| caddy 실행 사용자 | `caddy` (uid 999, gid 994, `www-data` 그룹 겸함) |
| `/srv` | 존재·비어 있음, `root:root 0755` |
| 디스크 여유 | 15G |
| 고정 Bearer 키 (gh-trade D-11) | `<고정키 — 정본은 infra/relay/Caddyfile 한 곳. gh-trade D-11>` — 2026-09-11 생성, gh-trade 클라 소스에도 같은 상수가 들어간다 |
| 로컬 도구 | `caddy` **미설치**, `shellcheck` **미설치** (executor 가 재확인해 SUMMARY 에 기록) |

Caddy 동작 사실(공식 문서 확인, 2026-09-11):
- `handle` 과 `handle_path` 는 **서로 상호 배타적**이다 — 같은 그룹에서 **적힌 순서대로** 첫 일치 하나만 실행된다.
- `handle_path` 의 접두어 제거는 블록 **안쪽 지시어·매처가 평가되기 전에** 일어난다. 따라서 블록 안의 `path` 매처는 **접두어가 제거된** 경로(`/ghtrade/manifest.json` → `/manifest.json`)를 본다.
- 기본 지시어 순서상 `root` · `header` 는 `file_server` 보다 앞이다 — 블록 안에서 적은 순서와 무관하게 응답 헤더가 먼저 붙는다.
</inherited_facts>

<tasks>

<task type="auto">
  <name>Task 1: Caddy `/ghtrade/*` 정적 서빙 블록 + `startup.sh` 의 `/srv/ghtrade` 멱등 생성</name>
  <files>infra/relay/Caddyfile, infra/relay/startup.sh</files>

  <action>
**A. `infra/relay/Caddyfile` — `dma.jx1.io` 블록 안, `handle /healthz { ... }` 닫는 중괄호 **뒤** 와 매처 없는 기본 `handle { ... }` **앞** 사이에 아래를 삽입한다.** 파일의 나머지(상단 주석 ①~⑤, `tls`, `encode`, `handle /healthz`, 기본 `handle`+`reverse_proxy 127.0.0.1:8090`, `log`)는 한 글자도 건드리지 않는다. 들여쓰기는 기존과 같이 **탭**을 쓴다.

삽입할 것은 주석 + 세 개의 형제 블록이다. 정확한 형태:

1. 이름 있는 매처 `@ghtrade_deny` — 블록 형식으로 두 조건을 AND 로 묶는다. `path /ghtrade /ghtrade/*` 와 `not header Authorization "Bearer <고정키 — 정본은 infra/relay/Caddyfile 한 곳. gh-trade D-11>"`. Caddy 의 `header` 매처는 값에 `*` 가 없으면 **정확 일치**이므로 이것으로 "정확히 일치할 때만" 이 성립한다.
2. `handle @ghtrade_deny { respond 404 }` — 인증 불일치·부재. **401 이 아니라 404**. 경로의 존재 자체를 숨기기 위해서다.
3. `handle_path /ghtrade/*` 블록 — 안에 `root * /srv/ghtrade`, 이름 있는 매처 `@ghtrade_nostore path /manifest.json /manifest.sig`, `header @ghtrade_nostore Cache-Control no-store`, `file_server` 를 이 순서로 둔다. 목록 옵션은 **주지 않는다**(주지 않는 것이 곧 목록 비활성이다).
4. `handle /ghtrade { respond 404 }` — 인증은 됐으나 파일을 지목하지 않은 정확 경로 `/ghtrade`. 이게 없으면 이 요청만 기본 `handle` 로 흘러 relay wss 프록시에 닿는다.

블록 순서는 **2 → 3 → 4** 여야 한다. 2 가 3 보다 뒤로 가면 미인증 요청이 파일을 받아 간다.

**주석에 반드시 담을 것** (한글, 기존 주석 톤과 같이):

- **배치 순서의 근거.** `handle`/`handle_path` 는 상호 배타적이라 위에서부터 첫 일치 하나만 실행된다. 매처 없는 기본 `handle` 은 **모든 경로**에 일치하므로 이 블록이 그 뒤로 가면 `/ghtrade/*` 가 relay wss 프록시로 넘어가 정적 파일이 영원히 안 나온다. 자리는 `/healthz` 와 기본 `handle` 사이다.
- **404 인 이유.** 401 은 "여기 뭔가 있다" 를 알려 준다. 이 표면은 존재를 숨긴다.
- **접두어 제거 시점.** `handle_path` 는 안쪽 지시어·매처 평가 **전에** `/ghtrade` 를 떼므로, `@ghtrade_nostore` 의 `path` 는 `/manifest.json`·`/manifest.sig`(제거 후 기준)로 적어야 한다. `/ghtrade/manifest.json` 으로 적으면 조용히 안 맞는다.
- **디렉터리 목록.** `file_server` 는 목록 옵션을 주지 않는 한 디렉터리를 나열하지 않는다. 여기서는 **의도적으로 주지 않았다** — 나중에 편의로 켜면 배포 파일 전체 목록이 공개된다.
- **캐시.** manifest 2종만 `no-store`. 클라는 이 둘로 "무엇이 바뀌었나" 를 판단하므로 캐시된 옛 manifest 를 받으면 업데이트가 조용히 멈춘다. 나머지 파일은 내용이 바뀌면 파일명·해시가 달라지므로 기본 캐시로 충분하다.
- **키가 왜 비밀이 아닌가 (SC-8 오독 방지, 가장 중요한 문단).** 다섯 가지를 적는다.
  ① **무결성은 이 키가 담당하지 않는다** — 클라가 manifest 의 RSA-SHA256 서명을 검증한다(gh-trade D-09). 이 키가 새도 가짜 exe 를 밀어 넣을 수 없다.
  ② 이 키의 용도는 **무관한 접근·크롤러 차단과 존재 은닉(404)** 뿐이다.
  ③ **양쪽 저장소의 소스 상수여야만 동작한다**(D-11) — 같은 문자열이 gh-trade 클라에 컴파일돼 배포된 exe 안에 이미 실려 나간다. Secret Manager 로 옮겨도 비밀성이 생기지 않고, 한쪽만 바꾸면 전 클라가 404 를 받는다.
  ④ **Phase 15 SC-8("비밀 미기록") 이 막은 것은 접속 자격증명**이다. quick-260908-py9 가 저장소의 KB VPN 계정 ID 를 마스킹해 그 조항을 닫았고, 실제 접속 비밀 값은 지금도 Secret Manager 와 VM `/etc/kbvpn.env`(0600) 에만 있다. 이 Bearer 값은 그 범주가 아니다.
  ⑤ 그래도 **로그에는 남지 않는다** — 이 값을 `Authorization: Bearer` 형식으로 받는 것 자체가 상단 주석 ④ 의 Caddy 기본 헤더 마스킹을 이용하려는 선택이다(D-11). 그 기본값을 유지할 것.
- **교체 비용.** 키를 바꾸려면 배포된 모든 클라를 갱신해야 한다(D-11/D-12). 그래서 회전이 아니라 서명에 무결성을 의존하는 설계다.

**B. `infra/relay/startup.sh` — 섹션 4 의 맨 끝(구 `CADDY_EMAIL` 드롭인 제거 블록 **뒤**, `# 5. VPN 자산 배치` 헤더 **앞**)에 `/srv/ghtrade` 준비를 추가한다.**

- 만드는 방법은 이 파일이 이미 `/var/log/caddy` 에 쓰는 방어 관용구를 그대로 따른다: `install -d` 로 만들고, 소유권 지정이 실패하면 덜 엄격한 형태로 **폴백**한다. `install -d` 는 **이미 있는 디렉터리에도** 모드·소유권을 적용하므로 이 자체가 멱등이자 자가 치유다.
- 1순위: 소유 `alex`, 그룹 `caddy`, 모드 `2755`. 2순위(=`alex` 부재): 그룹 `caddy` + `2755`. 3순위: 모드 `0755` 만. 각 폴백은 `2>/dev/null` 로 삼키고 `log` 로 어느 경로를 탔는지 남긴다. **`set -euo pipefail` 아래이므로 실패할 수 있는 명령은 반드시 `if !` 조건부나 `|| true` 안에 둔다** — `alex` 가 없는 환경에서 부팅이 죽으면 안 된다.
- 이 디렉터리의 **내용물은 저장소가 정본이 아니다.** gh-trade 발행 스크립트가 IAP scp 로 올린다. `startup.sh` 는 디렉터리만 준비하고 안의 파일은 만들지도 지우지도 않는다 — 주석으로 명시할 것.
- **권한 근거를 주석에 따져 남길 것.** caddy 가 읽으려면 `/srv`(root:root 0755)와 `/srv/ghtrade` 의 검색 권한 `o+x` 가 필요하고 둘 다 충족된다. scp 는 `-p` 없이도 원본 모드를 원격 umask 로 마스킹해 적용하므로 발행 측 umask 022 → `0644` 가 되어 caddy 는 **other 비트로** 읽는다. `2755` 의 setgid 는 그것 자체가 필수라서가 아니라, 발행 측 umask 가 027 이어서 `0640` 이 되는 경우에도 그룹 `caddy` 로 읽히게 하는 **보험**이다. umask 077(`0600`)이면 setgid 로도 못 읽으니 그때는 발행 측이 모드를 보장해야 한다 — 이 한계까지 적는다.
- **이 스크립트가 caddy 를 기동·재기동·리로드하게 만들지 말 것.** 기존 caddy 가드(`is-active || is-enabled` 면 미개입 — 2026-09-06 전면 down 실장애의 원인)와 `install_asset caddyfile` 흐름은 **그대로 둔다**. 새 Caddyfile 이 VM 에 실제로 반영되는 시점은 15:40 의 별도 리로드다.
  </action>

  <verify>
  <automated>
  set -e
  # ① Caddyfile 배치 순서: healthz < ghtrade < 기본 handle (주석 줄은 제외하고 센다)
  awk '/^[[:space:]]*#/ {next}
       /handle \/healthz/      {h=NR}
       /handle_path \/ghtrade/ {g=NR}
       /^\thandle \{/          {d=NR}
       END { printf "healthz=%s ghtrade=%s default=%s\n", h, g, d
             exit !(h && g && d && h < g && g < d) }' infra/relay/Caddyfile
  # ② deny 블록이 서빙 블록보다 앞
  awk '/^[[:space:]]*#/ {next}
       /handle @ghtrade_deny/  {a=NR}
       /handle_path \/ghtrade/ {b=NR}
       END { exit !(a && b && a < b) }' infra/relay/Caddyfile
  # ③ 목록 옵션 미사용 (주석은 이 단어를 써도 되므로 줄머리·줄꼬리 주석을 모두 걷어내고 센다)
  test "$(sed 's/#.*//' infra/relay/Caddyfile | grep -c 'browse')" = 0
  # ④ 기존 자산 무손상
  grep -q 'reverse_proxy 127.0.0.1:8090' infra/relay/Caddyfile
  grep -q 'reverse_proxy 127.0.0.1:8091' infra/relay/Caddyfile
  grep -q 'disable_http_challenge'      infra/relay/Caddyfile
  test "$(grep -c '^# ⑤' infra/relay/Caddyfile)" = 1
  # ⑤ 고정키는 저장소 안에서 Caddyfile 한 곳에만 (1회 등장)
  test "$(grep -c '<고정키 — 정본은 infra/relay/Caddyfile 한 곳. gh-trade D-11>' infra/relay/Caddyfile)" = 1
  # ⑥ startup.sh 문법
  bash -n infra/relay/startup.sh
  # ⑦ startup.sh 가 caddy 를 켜지 않는다 (기존 disable/is-active 가드는 무해)
  test "$(sed 's/#.*//' infra/relay/startup.sh | grep -Ec 'systemctl (start|restart|reload|enable --now) caddy')" = 0
  # ⑧ /srv/ghtrade 준비가 실제로 들어갔다
  test "$(grep -v '^[[:space:]]*#' infra/relay/startup.sh | grep -c '/srv/ghtrade')" -ge 1
  # ⑨ 로컬 caddy/shellcheck 유무를 확인해 SUMMARY 에 기록할 사실을 만든다
  command -v caddy >/dev/null \
    && caddy validate --config infra/relay/Caddyfile --adapter caddyfile \
    || echo "LOCAL-FACT: caddy 미설치 — 로컬 validate 생략 (SUMMARY 에 기록)"
  command -v shellcheck >/dev/null \
    && shellcheck -S error infra/relay/startup.sh \
    || echo "LOCAL-FACT: shellcheck 미설치 — bash -n 만 수행 (SUMMARY 에 기록)"
  </automated>
  </verify>

  <done>
`/ghtrade` 세 블록이 `/healthz` 와 기본 `handle` 사이에 순서대로(deny → handle_path → 정확경로 404) 들어갔고, 위 ①~⑨ 가 모두 통과한다. 미인증 요청이 404 를 받고 인증 요청만 `/srv/ghtrade` 에서 서빙되며 manifest 2종에만 `no-store` 가 붙는 구조다. 키 리터럴이 SC-8 위반이 아닌 근거 5항목이 주석에 있다. `startup.sh` 는 `bash -n` 을 통과하고 `/srv/ghtrade` 를 3단 폴백으로 멱등 생성하며 caddy 를 켜지 않는다. VM 은 건드리지 않았다.
  </done>
</task>

<task type="auto">
  <name>Task 2: 운영 문서 — 파일 맵 1행 + `/ghtrade/*` 운영 절 + 업로드·리로드 규칙</name>
  <files>infra/relay/README.md</files>

  <action>
**A. `## 파일 맵` 표에 1행 추가.** 표는 `저장소 파일 | VM 배치 위치 | 권한` 3열이다. `_(생성됨)_` 항목들 뒤, `wireguard/client.conf.template` 행 앞에 넣는다. 첫 열은 `**(생성됨 — 내용물은 gh-trade 발행 스크립트가 올린다)**`, 둘째 열 `` `/srv/ghtrade` ``, 셋째 열 `` `2755` `` + 소유 `alex:caddy` 를 밝힌다.
표 아래 「예외 2종」 문단 뒤에 **예외가 하나 더 있음**을 한두 줄로 덧붙인다: `/srv/ghtrade` 는 **디렉터리만** `startup.sh` 가 매 부팅 보증하고 **안의 파일은 저장소 정본이 아니다**(gh-trade 발행 스크립트 산출물). `startup.sh` 는 내용물을 만들지도 지우지도 않는다.

**B. `## Caddy / TLS` 절과 `## 자산 갱신 절차` 절 **사이**에 새 절 `## /ghtrade/* — gh-trade 클라 자동 업데이트 정적 배포` 를 추가한다.** 담을 것:

1. **목적 한 문단.** gh-trade WinForms 클라가 기동 시(로그인 창 전) `https://dma.jx1.io/ghtrade/manifest.json` 을 받아 서명을 검증하고, 파일별 SHA-256 이 다른 파일만 내려받아 자기 교체한 뒤 재실행한다. **게이트웨이(10.41.1.120)가 아니라 여기에 둔 이유**: WireGuard 터널 사용자는 VM nft `wgfwd` 규칙상 120 의 9100·22 에만 닿지만, `dma.jx1.io` 는 공인 443 + Let's Encrypt TLS 가 이미 있어 VPN·터널 상태와 무관하게 받을 수 있다.
2. **인증.** 고정 `Authorization: Bearer <키>` **정확 일치**일 때만 서빙, 불일치·부재는 **404**(401 이 아니다 — 존재를 숨긴다). 인증된 요청이라도 정확 경로 `/ghtrade` 는 404 다. **키 값은 이 문서에 다시 적지 않는다** — 정본은 `infra/relay/Caddyfile` 의 `@ghtrade_deny` 매처 한 곳이고, 같은 문자열이 gh-trade 클라 소스 상수에도 있다(D-11). 이 키가 비밀이 아닌 근거(무결성은 클라의 RSA 서명 검증 담당)는 Caddyfile 주석에 있다고 지목만 한다.
3. **캐시·목록.** `manifest.json`·`manifest.sig` 만 `Cache-Control: no-store`(클라가 이 둘로 변경 여부를 판단한다), 나머지는 기본 캐시. 디렉터리 목록은 꺼져 있고 의도적으로 켜지 않는다.
4. **업로드(gh-trade 발행 스크립트용).** 사용자 `alex`, 대상 `/srv/ghtrade`, 공개 URL `https://dma.jx1.io/ghtrade/<파일명>`. 명령 형태는 이 문서의 다른 절과 같은 스타일의 `bash` 코드블록 하나로 — `gcloud compute scp --tunnel-through-iap --zone=asia-northeast3-a <로컬파일...> alex@radar-gw:/srv/ghtrade/` (디렉터리째면 `--recurse`). **업로드 순서 규칙**을 굵게 남긴다: **파일들 먼저 → `manifest.sig` → `manifest.json` 마지막**(gh-trade D-16). manifest 가 먼저 올라가면 아직 없는 파일을 가리키는 중간 상태가 클라에 노출된다. 업로드 후 확인은 `curl -sI -H "Authorization: Bearer <Caddyfile 의 값>" https://dma.jx1.io/ghtrade/manifest.json` 형태로 적되 **키 자리는 플레이스홀더**로 둔다.
5. **권한 주의 한 줄.** 올라간 파일이 `0600` 이면 caddy(uid 999)가 못 읽어 404 처럼 보인다. 발행 측 umask 가 022(→`0644`)면 문제없고, 027(→`0640`)이어도 `/srv/ghtrade` 의 setgid(`2755`, 그룹 `caddy`) 덕에 읽힌다.
6. **리로드 타이밍 규칙(굵게).** 이 블록을 바꾸면 `## 자산 갱신 절차` 대로 메타데이터를 갱신하고 VM 에 재적용해야 하는데, **Caddy 설정 리로드는 진행 중인 wss 연결을 강제 종료한다**(Caddyfile 상단 주석 ③ · `## Caddy / TLS` 절 마지막 줄과 같은 규칙). 그러므로 **장중(09:00–15:30 KST) 리로드 금지**, 장 마감 후 1회만. 최초 반영은 2026-09-11 15:40 KST 에 수행. `startup.sh` 재적용 자체는 caddy 를 켜거나 리로드하지 않으므로(가드 유지), 리로드는 **사람이 명시적으로** 해야 반영된다는 점을 함께 적는다.

**C. `## 자산 갱신 절차` 절**에 한 줄 덧붙인다 — `Caddyfile` 을 바꾼 경우 메타데이터 재적용만으로는 반영되지 않고 별도 리로드가 필요하며 그 타이밍은 위 `/ghtrade/*` 절의 규칙을 따른다고 §참조로 지목한다.

기존 문장·표의 다른 행·다른 절은 건드리지 않는다. 문서 톤(한글, `—` 대시, `⚠️` 경고 상자)은 기존과 맞춘다.
  </action>

  <verify>
  <automated>
  set -e
  # ① 파일 맵에 /srv/ghtrade 행이 있고 권한이 명시됐다
  grep -q '`/srv/ghtrade`' infra/relay/README.md
  grep -q '2755' infra/relay/README.md
  # ② 새 운영 절이 Caddy/TLS 와 자산 갱신 절차 사이에 있다
  awk '/^## Caddy \/ TLS/        {c=NR}
       /^## \/ghtrade\/\* /      {g=NR}
       /^## 자산 갱신 절차/       {a=NR}
       END { printf "caddy=%s ghtrade=%s assets=%s\n", c, g, a
             exit !(c && g && a && c < g && g < a) }' infra/relay/README.md
  # ③ 업로드 정보 3종(사용자·경로·명령 형태)이 모두 있다
  grep -q 'alex@radar-gw:/srv/ghtrade' infra/relay/README.md
  grep -q 'gcloud compute scp --tunnel-through-iap --zone=asia-northeast3-a' infra/relay/README.md
  grep -q 'https://dma.jx1.io/ghtrade/' infra/relay/README.md
  # ④ 업로드 순서 규칙과 리로드 타이밍 규칙이 기록됐다
  grep -q 'manifest.sig' infra/relay/README.md
  grep -q '15:40' infra/relay/README.md
  # ⑤ 고정키 리터럴을 README 가 복제하지 않는다 (정본은 Caddyfile 한 곳)
  #    <!-- planner-discipline-allow: <고정키 — 정본은 infra/relay/Caddyfile 한 곳. gh-trade D-11> -->
  test "$(grep -c '<고정키 — 정본은 infra/relay/Caddyfile 한 곳. gh-trade D-11>' infra/relay/README.md)" = 0
  # ⑥ 기존 절 무손상 (앵커 표본)
  grep -q '^## 파일 맵'            infra/relay/README.md
  grep -q '^## 메모리 예산'         infra/relay/README.md
  grep -q 'sudo -u caddy caddy validate' infra/relay/README.md
  </automated>
  </verify>

  <done>
README 만 읽고도 ① `/srv/ghtrade` 가 무엇이고 누가 소유하며 내용물이 왜 저장소 정본이 아닌지 ② `/ghtrade/*` 의 인증(정확 일치 Bearer, 불일치 404)·캐시(manifest 2종만 no-store)·목록 비활성 ③ gh-trade 발행 스크립트가 어떤 사용자·경로·명령·**순서**로 올리는지 ④ 이 블록을 바꿀 때 왜·언제 리로드해야 하는지를 알 수 있다. 고정키 값은 README 에 없고 Caddyfile 을 지목한다. 위 ①~⑥ 이 모두 통과한다.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 공중망 → `dma.jx1.io:443` | 인증되지 않은 임의의 인터넷 클라이언트가 새 정적 경로에 도달한다 |
| `alex`(IAP scp) → `/srv/ghtrade` | 사람이 올린 파일이 그대로 공중망에 서빙된다 |
| `/srv/ghtrade` 파일 → caddy(uid 999) | 파일 모드가 서빙 가능 여부를 결정한다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dps-01 | Information Disclosure | `file_server` 디렉터리 목록 | medium | mitigate | 목록 옵션 미사용 + 켜지 말라는 근거를 주석·README 양쪽에 기록. Task 1 verify ③ 이 비주석 영역에서 0건을 강제 |
| T-dps-02 | Information Disclosure | 미인증 요청에 대한 응답 코드 | low | mitigate | 401 이 아닌 **404** — 경로 존재 자체를 숨긴다 |
| T-dps-03 | Tampering | 배포 산출물 위변조 | high | transfer | 이 게이트웨이는 무결성을 보장하지 않는다. 클라가 manifest RSA-SHA256 서명을 검증한다(gh-trade D-09/D-10). Caddyfile 주석이 이 분담을 명시 |
| T-dps-04 | Elevation of Privilege | Caddy 라우팅 순서 | high | mitigate | `/ghtrade` 3블록을 기본 `handle` **앞**에 배치. 잘못 두면 정적 요청이 relay wss 프록시(주문 경로)로 흘러든다. Task 1 verify ①② 가 순서를 기계 검증 |
| T-dps-05 | Information Disclosure | 접근 로그에 남는 인증 키 | low | mitigate | `Authorization: Bearer` 형식 채택으로 Caddy 기본 헤더 마스킹 이용(D-11). 상단 주석 ④ 의 "커스텀 로그 포맷 금지" 규율을 그대로 유지 |
| T-dps-06 | Denial of Service | 장중 caddy 리로드 | high | mitigate | 이 플랜은 리로드하지 않는다. `startup.sh` 의 caddy 가드 유지 + README 에 장중 리로드 금지·15:40 규칙 기록. Task 1 verify ⑦ 이 스크립트의 caddy 기동 0건을 강제 |
| T-dps-07 | Denial of Service | 부팅 실패 | medium | mitigate | `set -euo pipefail` 아래 3단 폴백 + `2>/dev/null` — `alex` 부재 환경에서도 부팅 완주 |
| T-dps-SC | Tampering | 패키지 설치 | n/a | accept | 이 플랜은 npm/pip/cargo 설치를 하지 않는다 (설정·문서 편집만) |
</threat_model>

<verification>
1. Task 1·2 의 `<automated>` 블록이 모두 exit 0.
2. `git diff --stat` 이 `infra/relay/Caddyfile` · `infra/relay/startup.sh` · `infra/relay/README.md` **3파일만** 보여 준다. `.planning/STATE.md` 와 gh-trade 저장소 파일은 diff 에 없다.
3. `git diff infra/relay/Caddyfile` 이 **삽입만** 보여 준다 — 기존 줄의 삭제·수정 0행.
4. 로컬에 `caddy`·`shellcheck` 가 없다는 사실이 SUMMARY 에 **명시**된다 (검증을 한 것처럼 쓰지 않는다).
5. VM 부작용 0 — `gcloud`·`ssh`·`systemctl`·`add-metadata` 호출이 실행 로그에 없다.
</verification>

<success_criteria>
- `/ghtrade/*` 정적 서빙이 `/healthz` 와 기본 `handle` 사이에 있고, 미인증 404 · 정확 일치 Bearer 서빙 · manifest 2종 `no-store` · 목록 비활성이 설정으로 표현됐다.
- 키 리터럴이 SC-8 위반이 아닌 근거가 Caddyfile 주석에 5항목으로 남아 있고, 값의 정본은 저장소 안에서 Caddyfile 한 곳뿐이다.
- `startup.sh` 가 `/srv/ghtrade` 를 `alex:caddy 2755` 로 멱등 생성하되 `alex` 부재 환경에서 죽지 않고, caddy 를 켜지 않는다.
- README 가 파일 맵·인증·캐시·업로드(사용자·경로·URL·명령·순서)·리로드 타이밍을 모두 담는다.
- VM 미적용. 리로드는 15:40 KST 에 오케스트레이터가 별도 수행한다.
</success_criteria>

<output>
Create `.planning/quick/260911-dps-radar-gw-caddy-ghtrade-srv-ghtrade/260911-dps-SUMMARY.md` when done.

SUMMARY 에 반드시 포함할 사실:
- 로컬 `caddy` 미설치 → `caddy validate` **미수행**. 설정 검증은 15:40 리로드 직전 VM 에서 `sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 로 해야 한다(README 규율 — root 로 실행하면 `dma.log` 소유권이 깨진다).
- 로컬 `shellcheck` 미설치 → `bash -n` 만 수행.
- `handle` 배치 순서 근거를 한 문단으로 재서술(다음 사람이 SUMMARY 만 읽어도 알도록).
- **남은 일**(이 플랜 범위 밖): ① `scripts/setup-relay-iam.sh` 로 메타데이터 갱신 ② VM 재적용 ③ 15:40 KST caddy 리로드 ④ gh-trade 발행 스크립트로 첫 업로드 ⑤ 인증 헤더 유무 양쪽 실측(200/404).
</output>
