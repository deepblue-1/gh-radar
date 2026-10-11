---
phase: quick-260926-bwu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - infra/relay/startup.sh
  - infra/relay/README.md
  - scripts/setup-relay-iam.sh
autonomous: true
requirements: [BWU-WG0FIX, BWU-DOC, BWU-IAM]

estimate:
  tokens: 40000
  raw_tokens: 40000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "부팅 직후 상태(DOCKER-USER 에 wg0 규칙 0개)에서 startup.sh 가 생성하는 wg0.conf 의 PostUp 17개가 전부 성공한다 — 하네스 `wg0` 부팅 모의가 `OK 17`. 계획 시점 원본은 교보 10.16.207.119 응답 규칙 선삭제에서 HOOK-FAIL 로 실제 장애와 같은 지점에서 재현됐다 (BWU-WG0FIX)"
    - "wg0.conf 의 `iptables -D` 14줄(PostUp 7 + PostDown 7)이 전부 오류 무시 꼬리(`2>/dev/null || true`)로 끝나고, PostUp `iptables -I` 7줄은 꼬리 없이 `-j ACCEPT` 로 끝난다(삽입 실패는 숨기지 않음). startup.sh 의 비주석 변경은 559행 한 줄(-1 +1)뿐이다 (BWU-WG0FIX)"
    - "README 는 radar-gw 를 e2-small(2 vCPU 공유 / 2048 MB · 보장 0.5코어, 2026-09-26 전환)로 기술한다 — §구성 개요 행 · §메모리 예산 헤딩·합계·전환 문단 · 재부팅 런북 §2 불릿. 날짜 박힌 과거 실측(2026-09-05 머신 타입 행 · 2026-09-06 free -m 행 · 9/22 netcut 부하 줄)은 바이트 그대로다 (BWU-DOC)"
    - "README §교보 SecuwaySSL VPN 안에 2026-09-26 사건 기록(경위 · 원인 559행 꼬리 누락 · 규칙 · 반영 절차 · VM 반영 대기 상태)이 있고, §막힐 때 에 재부팅 후 wg0 부재 행이, DOCKER-USER 검증 주석에 ACCEPT 일곱 줄이 있다 (BWU-DOC)"
    - "setup-relay-iam.sh 로 VM 을 새로 만들면 e2-small 로 생성된다(생성 분기의 안내문과 플래그). 기존 VM 경로(메타데이터 갱신)는 동작 불변 (BWU-IAM)"
    - "코드 커밋은 `fix(quick-260926-bwu): …` 1건, 한글 메시지, 공동 저자 트레일러 없음, 정확히 3개 경로만 담고 push 하지 않는다. 실행 중 gcloud · ssh · VM 조작 0 — 반영(rollout)은 사용자가 실행한다"
  artifacts:
    - path: "infra/relay/startup.sh"
      provides: "wg0.conf PostUp 선삭제 전부 오류 무시 꼬리 + §8.5 주석 가드(규칙 · 사건 태그)"
      contains: "quick-260926-bwu"
    - path: "infra/relay/README.md"
      provides: "e2-small 반영(구성 개요 · 메모리 예산 · 런북 불릿) + 교보 절 사건 기록 + 막힐 때 행 + ACCEPT 일곱 줄"
      contains: "### 사건 기록 — 2026-09-26 재부팅 시 wg0 기동 실패"
    - path: "scripts/setup-relay-iam.sh"
      provides: "VM 생성 분기 머신 타입 e2-small + D-07 전환 주석"
      contains: "--machine-type=e2-small"
    - path: ".planning/quick/260926-bwu-radar-gw-wg0-e2-small/260926-bwu-verify.sh"
      provides: "계획 단계에서 작성·접지된 읽기 전용 검증 하네스 (wg0 | docs | commit | all). 실행자는 수정하지 않는다"
      contains: "sim_boot"
  key_links:
    - from: "infra/relay/startup.sh §8.5 heredoc (WG0_CONF_EOF)"
      to: "/etc/wireguard/wg0.conf → wg-quick@wg0 PostUp"
      via: "startup.sh 가 매 부팅 wg0.conf 를 재작성하고, wg-quick 은 PostUp 하나만 실패해도 wg0 를 지운다 — 그래서 부팅 직후 성공 여부가 곧 wg0 생존 여부"
    - from: "README §막힐 때 「(A) VM 재부팅 후 wg0 자체가 없음」 행"
      to: "README §교보 SecuwaySSL VPN → 사건 기록"
      via: "행 본문의 「§교보 SecuwaySSL VPN → 사건 기록」 상호 참조"
    - from: "README §메모리 예산 전환 문단"
      to: "README §교보 SecuwaySSL VPN → 사건 기록"
      via: "전환 재부팅에서 wg-quick@wg0 만 실패했다는 한 줄 참조"
---

<objective>
2026-09-26 08:11 KST radar-gw 를 e2-micro → e2-small 로 올린 재부팅에서 `wg-quick@wg0` 가 기동 실패했다.
원인은 `infra/relay/startup.sh` 559행 — wg0.conf PostUp 의 선삭제 `iptables -D` 가운데 이 한 줄만 오류 무시 꼬리가
빠져 있어, 부팅 직후(지울 규칙 없음) `Bad rule` 로 실패하고 wg-quick 이 wg0 를 통째로 지웠다(quick-260921-or9 · c6d1594 도입,
09-16 이후 첫 재부팅이라 잠복). relay(웹앱 호가·주문) 경로는 무관하고, 끊긴 것은 wg0 를 타는 gh-trade 클라이언트·alex-mac 의 DMA 직결이다.

1. 559행을 형제 줄과 같은 형태로 고치고 §8.5 주석에 규칙을 박아 재발을 막는다.
2. README 를 현실(e2-small)에 맞추고, 사건 기록 · 막힐 때 행 · DOCKER-USER 검증 주석을 갱신한다.
3. setup-relay-iam.sh 의 VM 생성 분기를 e2-small 로 맞춰 재생성 시에도 현실과 일치시킨다.

**저장소 변경만.** VM 반영(startup-script 메타데이터 재적용 + 재부팅)은 사용자가 실행한다 — 이 플랜의 어떤 단계도
gcloud · ssh · VM 조작을 하지 않는다.

Purpose: 다음 재부팅에서 wg0 가 살아남게 하고, 운영 문서가 실제 머신 타입과 사건 이력을 정확히 담게 한다.
Output: 코드 커밋 1건(3개 경로), push 없음.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@infra/relay/startup.sh
@infra/relay/README.md
@scripts/setup-relay-iam.sh
@.planning/quick/260926-bwu-radar-gw-wg0-e2-small/260926-bwu-verify.sh

<interfaces>
검증 하네스 `.planning/quick/260926-bwu-radar-gw-wg0-e2-small/260926-bwu-verify.sh` (계획 단계에서 작성 · 접지 완료, **수정 금지**):
- `wg0` — bash -n · 부팅 모의(PostUp 17개를 wg-quick 처럼 `(set -e; eval hook)` 로 실행, 가짜 iptables 는 `-D` 전부 실패) · `-D` 14줄 전부 꼬리 · `-I` 7줄 꼬리 없음 · 기준 커밋 afe26e2 대비 비주석 변경 2줄 · startup.sh 에 `quick-260926-bwu` 태그.
  계획 시점 실측: 원본 = FAIL(HOOK-FAIL 119 응답 규칙 · 꼬리 13/14 · 변경 0), 559행만 고친 사본 = 모의 `OK 17` · 14 · 7 PASS.
- `docs` — README · setup-relay-iam.sh 게이트 34개. 계획 시점에 아래 Task 2 명세대로 만든 모의 편집본에서 전부 PASS 확인.
- `commit` — `git log origin/master..HEAD` 에서 `fix(` + `quick-260926-bwu` 커밋 정확히 1건 · 경로 3개 · 공동 저자 트레일러 0 · 제목에 「wg0 부팅 실패 수정」.
- `all` — wg0 + docs (+ 커밋이 있으면 commit).
- 대상 경로는 `STARTUP=` · `README=` · `IAM=` 환경변수로 바꿀 수 있다(모의 편집 검증용).

startup.sh 559행 현재 형태(고칠 대상): `PostUp = iptables -D DOCKER-USER -o wg0 -s 10.16.207.119 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`
형제 줄(557행, 정답 형태): 같은 규칙의 `10.16.207.112` 판 — 끝이 ` 2>/dev/null || true`.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: wg0.conf PostUp 부팅 실패 수정 — 559행 오류 무시 꼬리 + §8.5 주석 가드</name>
  <files>infra/relay/startup.sh</files>
  <behavior>
    - RED(계획 시점에 이미 재현): 원본에서 하네스 `wg0` 부팅 모의가 `HOOK-FAIL iptables -D DOCKER-USER -o wg0 -s 10.16.207.119 …` 로 실패 — 실제 09-26 장애와 같은 줄
    - GREEN: 수정 후 부팅 모의 `OK 17`, `-D` 14줄 전부 꼬리, `-I` 7줄 꼬리 없음, 비주석 변경 2줄(559행 -1 +1)
  </behavior>
  <action>
경로 하나를 끝까지 증명하는 tracer 다: startup.sh §8.5 heredoc → 생성되는 /etc/wireguard/wg0.conf → wg-quick@wg0 PostUp 실행.

1. 먼저 하네스 `wg0` 를 한 번 돌려 FAIL(HOOK-FAIL · 13/14 · 변경 0)을 눈으로 확인한다(RED). 결과를 SUMMARY 에 한 줄로 적는다.
2. startup.sh 559행(`PostUp = iptables -D DOCKER-USER -o wg0 -s 10.16.207.119 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`) 끝에
   한 칸 띄우고 `2>/dev/null || true` 를 붙인다 — 557행(10.16.207.112 판)과 글자 형태가 똑같아야 한다. heredoc 안의 다른 줄은 한 글자도 바꾸지 않는다.
   560행 `iptables -I` 에는 꼬리를 붙이지 않는다(삽입 실패는 wg-quick 을 멈춰 드러나야 한다 — 숨기면 조용히 통로가 닫힌다).
3. heredoc **바깥**, `# 8.5 wg0.conf — 매 부팅 재작성(순수 생성물).` 주석 블록의 기존 ⚠️ 두 줄 바로 아래에 `#` 로 시작하는 주석 2~3줄을 더한다.
   담을 내용: PostUp 의 선삭제 `iptables -D` 는 전부 오류 무시 꼬리로 끝나야 한다 · 부팅 직후엔 지울 규칙이 없어 -D 가 실패하고
   wg-quick 은 PostUp 하나만 실패해도 wg0 를 통째로 지운다 · 삽입(-I)에는 붙이지 않는다 · 사건 태그 `2026-09-26 재부팅 · quick-260926-bwu`.
   주석 줄은 반드시 `#` 로 시작해야 한다(하네스가 `+#` 줄을 비주석 변경에서 제외한다). heredoc 안에는 주석을 넣지 않는다.
4. 하지 말 것: 55행 swap 주석(옛 머신 타입 언급)·§8 다른 부분 수정, startup.sh 전체 재정렬, 커밋(단일 커밋은 Task 2 끝에서 한다),
   gcloud/ssh/VM 조작, 하네스 파일 수정.
  </action>
  <verify>
    <automated>bash /Users/alex/repos/gh-radar/.planning/quick/260926-bwu-radar-gw-wg0-e2-small/260926-bwu-verify.sh wg0</automated>
  </verify>
  <done>하네스 `wg0` 가 `ALL PASS`(부팅 모의 OK 17 · -D 14/14 꼬리 · -I 7 · 비주석 변경 2 · 태그 1+). RED→GREEN 두 결과가 SUMMARY 에 있다. 아직 커밋하지 않았다.</done>
</task>

<task type="auto">
  <name>Task 2: README e2-small 반영 · 사건 기록 · setup-relay-iam.sh 생성 분기 + 단일 코드 커밋</name>
  <files>infra/relay/README.md, scripts/setup-relay-iam.sh</files>
  <action>
**A. infra/relay/README.md** — 아래 위치만 고친다. 표 셀 안에는 파이프 문자를 쓰지 않는다(GFM 표가 깨진다 — 하네스가 행의 파이프 수 3개를 센다).

A1. §구성 개요 「머신 타입」 행 → 정확히 `| 머신 타입 | `e2-small` (2 vCPU 공유 / 2048 MB · 보장 0.5코어) — 2026-09-26 전환 (이전 `e2-micro` 1024 MB · 근거 §메모리 예산) |`.

A2. §현재 배포 상태 의 2026-09-05T13:45Z 머신 타입 행, relay 컨테이너 표의 2026-09-06 `free -m` 행, netcut 절의 9/22 부하 실측 줄(0.25코어의 ≈10%)은 **건드리지 않는다** — 날짜 박힌 과거 실측이다.

A3. §DMA 터널 → 검증 명령 의 `sudo iptables -S DOCKER-USER` 줄 끝 주석을 `# ACCEPT 일곱 줄이 있어야 한다 (120 · alex-mac 전용 121 · tun0 응답 · 교보 112·119 · 교보 응답 2)` 로 바꾼다. 근거: PostUp `-I` 가 7개다(quick-260921-or9 이후 문서가 갱신되지 않았다 — 반영 후 사용자가 이 줄로 확인한다).

A4. §막힐 때 표의 첫 행(「(A) 핸드셰이크는 되는데 9100 이 안 열림」) 바로 아래에 새 행 하나를 넣는다. 첫 칸은 정확히 `(A) VM 재부팅 후 `wg0` 자체가 없음 (`systemctl is-active wg-quick@wg0` → `failed`)`.
    둘째 칸 내용: PostUp 한 줄이라도 실패하면 wg-quick 이 wg0 를 지운다 · `journalctl -u wg-quick@wg0 -b --no-pager` 에서 실패한 PostUp 을 찾는다 · 2026-09-26 사례는 선삭제 `iptables -D` 의 오류 무시 꼬리 누락 (§교보 SecuwaySSL VPN → 사건 기록) · 저장소 수정 → startup-script 메타데이터 재적용 → 재부팅. (꼬리 자체를 표 안에 글자로 쓰지 말 것 — 파이프가 들어간다.)

A5. §DMA 터널 → 장 마감 후 재부팅 생존 반영 런북 의 「② 가 장중 금지인 이유」 1번 불릿(§2 apt-get update + 패키지 8종 설치)에서 머신 타입 표현만 `공유코어 VM(현재 e2-small)에서` 로 바꾼다. 나머지 문장 불변.

A6. §교보 SecuwaySSL VPN 의 마지막 「MAC 바인딩」 인용 블록 **다음**, D-03 헤딩 앞 `---` **이전**에 새 소절을 넣는다. 헤딩은 정확히 `### 사건 기록 — 2026-09-26 재부팅 시 wg0 기동 실패`.
    소절 안에는 `#` 로 시작하는 하위 헤딩과 `---` 줄을 두지 않는다(굵은 글씨 리드로 단락을 나눈다 — 하네스가 다음 `##`/`---` 에서 소절을 자른다). 내용(짧게, 단락 4개 + 상태 인용 1줄):
    - 상태 인용: `> **반영 상태: 저장소 수정 완료 (quick-260926-bwu) · VM 반영 대기 — 사용자 실행 (2026-09-26).**`
    - **경위.** 2026-09-26(토) 08:11 KST e2-micro → e2-small 전환(§메모리 예산) 재부팅 뒤 `wg-quick@wg0` 만 failed. relay healthz · `openconnect@kb` · `securwayssl` · `caddy` · `docker` · `wg-probe` 는 active. relay(웹앱 호가·주문) 경로는 wg0 를 타지 않아 무영향, 끊긴 것은 wg0 로 게이트웨이·교보 DMA 서버에 붙는 gh-trade 클라이언트·alex-mac 직결.
    - **원인.** startup.sh §8.5 가 생성하는 wg0.conf 에서 교보 `10.16.207.119` 응답 규칙의 선삭제 PostUp 한 줄만 `2>/dev/null || true` 가 빠져 있었다(quick-260921-or9 · 커밋 `c6d1594`, 2026-09-22). 부팅 직후엔 지울 규칙이 없어 `Bad rule (does a matching rule exist in that chain?)` 로 실패 → wg-quick 이 wg0 삭제. 직전 재부팅이 09-16 이라 도입 후 첫 부팅에서 드러났다.
    - **규칙.** wg0.conf PostUp 의 모든 `iptables -D` 는 `2>/dev/null || true` 로 끝나야 한다 — 부팅 직후엔 지울 규칙이 없다. 선삭제는 재적용 멱등(중복 삽입 방지)용일 뿐이다. `iptables -I` 에는 붙이지 않는다(삽입 실패는 숨기지 않는다). 수정: quick-260926-bwu (해당 줄 + §8.5 주석 가드).
    - **반영 절차 (장 마감 20:00 KST 이후 또는 주말).** ① `GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh` — startup-script 메타데이터 재적용 ② VM 재부팅(startup.sh 가 매 부팅 wg0.conf 를 재작성한다) ③ 확인: `systemctl is-active wg-quick@wg0` = active · `sudo iptables -S DOCKER-USER` 의 ACCEPT 7줄 · `ip route show default` = `dev ens4`.
    - 키·공개키·`wg show` 출력·비밀 값은 넣지 않는다.

A7. §메모리 예산:
    - 헤딩(현재 괄호 안이 1024 MB 인 줄) → 정확히 `## 메모리 예산 (2048 MB · e2-small — 2026-09-26 전환)`.
    - 합계 행 → `| **합계** | **408–698 MB** (여유 1350–1640 MB · e2-micro 1024 MB 시절 326–616 MB) |` (대시는 기존과 같은 en dash `–`). 구성요소 행들과 Ops Agent 문단은 그대로 둔다.
    - Ops Agent 문단 다음의 「메모리 압박이 측정되면 머신 타입만 올린다」는 조건부 문단(굵은 리드로 시작하는 그 한 단락)을 새 단락으로 **교체**한다. 새 단락은 정확히 `**2026-09-26 e2-small 전환.**` 으로 시작하고 담을 것: 2026-09-26(토) 08:11 KST 사용자 요청 · 메모리 압박이 아니라 CPU 여유 때문 — 5명 × 30종목 풀구독 시 추정 피크 0.22코어가 e2-micro 보장 0.25코어의 약 90% (이 두 수치는 **같은 줄**에, e2-small 보장 0.5코어 병기) · 전환 후 실측 RAM 1976 MB · 외부/내부 IP 와 ens4 MAC 불변 · relay healthz ok · 단 `wg-quick@wg0` 는 기동 실패 — §교보 SecuwaySSL VPN → 사건 기록.
    - 이어서 한 단락: 다음에 머신 타입을 바꿀 때도 같은 3단계 · 정지가 relay·KB/교보 VPN·wg0 를 전부 끊으므로 **장 마감(20:00 KST) 이후 또는 주말에만** · 아래는 2026-09-26 에 실행한 명령이며 다음엔 `--machine-type` 값만 바꾼다.
    - 기존 3줄 gcloud 코드 블록(stop / set-machine-type … e2-small / start)은 **그대로 유지**한다(set-machine-type 줄이 섹션에 정확히 1개).
    - 코드 블록 뒤 「외부/내부 고정 IP 는 예약되어 …」 문장은 유지하고, 뒤에 이어서: ens4 MAC 도 유지된다(교보 등록 MAC 과 같아야 접속 — §교보 SecuwaySSL VPN) · 재기동 뒤 `systemctl is-active wg-quick@wg0 openconnect@kb securwayssl caddy docker wg-probe` 가 전부 active 인지 확인.

A8. 그 밖의 README 부분은 바꾸지 않는다.

**B. scripts/setup-relay-iam.sh**
B1. 헤더 D-07 블록(9~10행) 바로 아래에 주석 한 줄 추가: `#         (2026-09-26 e2-small 로 전환 — 근거 infra/relay/README.md §메모리 예산)`. D-07 원문은 결정 기록이므로 고치지 않는다.
B2. VM 생성 분기의 `creating VM` 안내문 괄호와 `--machine-type=` 플래그 값을 e2-small 로 바꾼다. 메타데이터 갱신 분기·다른 플래그는 불변.
B3. 스크립트를 **실행하지 않는다**(실행 = GCP 변경).

**C. 범위 밖 — 손대지 않고 SUMMARY 「후속 후보」에만 적는다:** startup.sh 55행 swap 주석, scripts/deploy-relay.sh 416행 · 455행 주석(옛 머신 타입 기준 설명). 브리프 범위가 3개 파일 · 지정 위치로 한정돼 있다.

**D. 단일 코드 커밋 (Task 1 + Task 2 합산)** — 동시 세션이 돌고 있다.
D1. 하네스 `docs` 와 `wg0` 가 ALL PASS 인지 먼저 확인한다. 실패하면 고치고 다시 돌린다(하네스는 고치지 않는다).
D2. `git status -sb` 와 `git diff --cached --name-only` 로 남의 변경·스테이징을 확인한다. 다른 파일(mobile/ · tasks/lessons.md · .planning/state.json 등)은 절대 스테이징하지 않는다. 전체 추가 명령(add -A · add .) 금지.
D3. 경로 지정 커밋으로 3개 경로만 담는다: `git commit -F <메시지 파일> -- infra/relay/startup.sh infra/relay/README.md scripts/setup-relay-iam.sh` (경로를 주면 git 은 그 경로만 커밋한다 — 남이 스테이징한 것이 섞이지 않는다). 메시지 파일은 스크래치 디렉터리에 둔다.
D4. 메시지(한글, 공동 저자 트레일러를 넣지 않는다):
    제목 `fix(quick-260926-bwu): radar-gw wg0 부팅 실패 수정 · e2-small 전환 문서 반영`
    본문 불릿 3개 — startup.sh: wg0.conf PostUp 교보 119 응답 규칙 선삭제에 오류 무시 꼬리 누락 → 부팅 직후 Bad rule 로 wg-quick 이 wg0 삭제, 형제 줄과 같은 형태로 수정 + §8.5 주석 가드 / README: 머신 타입 e2-small(2026-09-26 전환) · 메모리 예산 · DOCKER-USER ACCEPT 7줄 · 막힐 때 행 · 교보 절 사건 기록(VM 반영 대기) / setup-relay-iam.sh: VM 생성 머신 타입 e2-small.
D5. pre-commit 훅이 실패하면 원인을 고치고 **새로** 커밋한다(amend 금지). push 하지 않는다(push 는 webapp 프로덕션 배포를 겸한다 — 사용자 몫). 커밋 메시지 전문과 SHA 를 SUMMARY 에 적는다.
  </action>
  <verify>
    <automated>bash /Users/alex/repos/gh-radar/.planning/quick/260926-bwu-radar-gw-wg0-e2-small/260926-bwu-verify.sh all</automated>
  </verify>
  <done>하네스 `all` 이 `ALL PASS`(wg0 + docs 34개 + commit: 미push fix 커밋 1건 · 경로 3개 · 트레일러 0 · 제목 요지). `git status -sb` 에서 남의 변경은 그대로 남아 있고 스테이징되지 않았다. gcloud/ssh 호출 0.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 인터넷 → radar-gw wg0 (UDP 51820) | 피어 공개키로만 인증되는 개발기·gh-trade 클라이언트 → 사내망(tun0)·교보(tun1) DMA 서버 |
| docker filter/FORWARD(DROP) ↔ DOCKER-USER | wg0 통로는 PostUp 이 넣는 DOCKER-USER ACCEPT 규칙에만 의존한다 |
| 저장소 → VM 메타데이터 | startup.sh 가 매 부팅 실행된다 — 저장소 결함이 곧 부팅 결함 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-bwu-01 | Denial of Service | startup.sh §8.5 wg0.conf PostUp (559행) | high | mitigate | 559행에 형제 줄과 같은 오류 무시 꼬리 · §8.5 주석 가드 · 하네스 부팅 모의(`-D` 전부 실패 조건에서 PostUp 17개 성공)로 재부팅 생존 증명 |
| T-bwu-02 | Elevation of Privilege / Tampering (fail-open 은닉) | PostUp `iptables -I` 7줄 | medium | mitigate | 꼬리는 선삭제(-D)에만. 하네스가 `-I` 7줄이 꼬리 없이 `-j ACCEPT` 로 끝남을 강제 — 삽입 실패는 wg-quick 을 멈춰 드러난다. wgfwd nft 의 명시 drop · 피어 /32 · daddr 제한은 불변 |
| T-bwu-03 | Information Disclosure | README 사건 기록 | low | mitigate | 키 · 공개키 · `wg show` 출력 · 비밀 값 기재 금지(이미 문서에 있는 사설 IP·커밋 SHA 만) |
| T-bwu-04 | Tampering | 동시 세션 git 작업 트리 | medium | mitigate | 경로 지정 커밋(3개 경로) · 전체 추가 금지 · 커밋 전 status/cached 확인 · push 금지 · 하네스 `commit` 이 경로 3개를 검증 |
| T-bwu-05 | Tampering | setup-relay-iam.sh 생성 분기 | low | accept | VM 이 없을 때만 타는 분기라 현 VM 에 영향 없음. 스크립트는 실행하지 않는다 |
</threat_model>

<verification>
- `bash .planning/quick/260926-bwu-radar-gw-wg0-e2-small/260926-bwu-verify.sh all` → ALL PASS
- `git log origin/master..HEAD --oneline` 맨 위에 `fix(quick-260926-bwu)` 1건, `git show --stat HEAD` 에 3개 경로만
- 실행 로그에 gcloud · ssh · `google_metadata_script_runner` 호출 없음
</verification>

<success_criteria>
- 다음 부팅에서 wg0.conf PostUp 이 규칙 0개 상태로도 전부 성공한다(부팅 모의 OK 17) — 사용자가 메타데이터 재적용 + 재부팅만 하면 wg0 가 복구된다
- README · setup-relay-iam.sh 가 e2-small 현실과 일치하고, 과거 실측 기록은 보존되며, 사건 · 규칙 · 반영 절차가 교보 절에 남는다
- 코드 커밋 1건 · 3개 경로 · 한글 · 공동 저자 트레일러 없음 · 미push
</success_criteria>

<output>
Create `.planning/quick/260926-bwu-radar-gw-wg0-e2-small/260926-bwu-SUMMARY.md` when done — RED/GREEN 하네스 결과, 커밋 SHA · 메시지 전문, 범위 밖 후속 후보(startup.sh 55행 · deploy-relay.sh 416·455행 주석), 사용자 반영 절차(메타데이터 재적용 + 20:00 KST 이후 재부팅 + 확인 3항목) 포함.
</output>
