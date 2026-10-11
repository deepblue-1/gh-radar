---
phase: quick-260911-dps
plan: 01
subsystem: infra/relay
tags: [caddy, static-hosting, gh-trade, auto-update, radar-gw]
status: complete

requires:
  - "radar-gw VM · dma.jx1.io 443 + Let's Encrypt TLS (Phase 15 RELAY-03)"
  - "gh-trade D-09/D-11/D-16 (manifest RSA 서명 · 고정 Bearer 키 · 업로드 순서)"
provides:
  - "https://dma.jx1.io/ghtrade/* 정적 배포 표면 (설정 레벨 — VM 미적용)"
  - "/srv/ghtrade 멱등 준비 (startup.sh)"
  - "운영 문서 — 인증 · 캐시 · 업로드 · 리로드 타이밍"
affects:
  - "gh-trade Phase 20 (클라 자동 업데이트) — 이 플랜이 선행 의존"

tech-stack:
  added: []
  patterns:
    - "Caddy handle/handle_path 상호 배타 그룹에서 배치 순서로 라우팅 안전성을 보장"
    - "미인증 응답을 401 이 아닌 404 로 두어 경로 존재 자체를 은닉"
    - "install -d 3단 폴백으로 set -euo pipefail 아래 부팅 안전한 멱등 디렉터리 생성"

key-files:
  created: []
  modified:
    - infra/relay/Caddyfile
    - infra/relay/startup.sh
    - infra/relay/README.md

decisions:
  - "고정 Bearer 키를 Secret Manager 가 아니라 Caddyfile 리터럴로 둔다 — 같은 문자열이 배포된 exe 에 컴파일돼 있어 비밀성이 성립하지 않고, 무결성은 클라의 manifest RSA-SHA256 서명이 담당한다"
  - "미인증·불일치 응답은 401 이 아니라 404 — 경로 존재를 숨긴다"
  - "트레일링 슬래시 없는 정확 경로 /ghtrade 도 별도 404 블록으로 닫는다 — 없으면 이 요청만 기본 handle 의 relay wss(주문) 프록시로 샌다"
  - "startup.sh 는 디렉터리만 보증하고 내용물은 건드리지 않는다 — 안의 파일은 gh-trade 발행 스크립트 산출물"

metrics:
  duration: ~25m
  completed: 2026-09-11

actuals:
  tokens: 16800    # chars/4 over the 3 changed files (67,305 chars). 순수 diff 만이면 9,002 chars ≈ 2,250
  tasks: 2
  commits: 2
plan_head_before: 5e6136b29028c7a4a4f572d40c1808e33dc42833
---

# quick-260911-dps: radar-gw Caddy `/ghtrade/*` 정적 배포 표면 Summary

`dma.jx1.io/ghtrade/*` 에 고정 Bearer 정확 일치 인증 + 미인증 404 은닉 방식의 정적 배포 표면을 Caddyfile 설정으로 열고, `/srv/ghtrade` 를 `startup.sh` 가 3단 폴백으로 멱등 준비하도록 만들었으며, 운영 규칙(업로드 순서·리로드 타이밍)을 README 에 박제했다. **저장소 파일 3개만 변경 — VM 적용 0 · gcloud 호출 0.**

## 무엇을 했나

### Task 1 — Caddyfile 3블록 + startup.sh `/srv/ghtrade` (commit `5fa7221`)

`dma.jx1.io` 사이트 블록 안, `handle /healthz` **뒤** · 매처 없는 기본 `handle` **앞** 에 세 개의 형제 블록을 순서대로 삽입했다.

| 순서 | 블록 | 역할 |
|------|------|------|
| 1 | `@ghtrade_deny { path /ghtrade /ghtrade/*; not header Authorization "Bearer <키>" }` → `handle @ghtrade_deny { respond 404 }` | 인증 불일치·부재를 **404** 로 닫는다 |
| 2 | `handle_path /ghtrade/*` → `root * /srv/ghtrade`, `@ghtrade_nostore path /manifest.json /manifest.sig`, `header @ghtrade_nostore Cache-Control no-store`, `file_server` | 인증 통과분만 서빙. 목록 옵션 **미지정** = 디렉터리 목록 비활성 |
| 3 | `handle /ghtrade { respond 404 }` | 트레일링 슬래시 없는 정확 경로를 닫는다 |

`startup.sh` 는 섹션 4 끝(구 `CADDY_EMAIL` 드롭인 제거 뒤 · 섹션 5 앞)에 `install -d` 3단 폴백을 추가했다: `alex:caddy 2755` → `:caddy 2755` → `0755` → 실패 시 경고 로그. 각 단계는 `2>/dev/null` + `if/elif` 조건부라 `alex` 계정이 없는 환경에서도 `set -euo pipefail` 아래 부팅을 완주한다.

### Task 2 — README 운영 문서 (commit `3fa691e`)

파일 맵에 `/srv/ghtrade` 1행 + 「예외 3」 문단, `## Caddy / TLS` 와 `## 자산 갱신 절차` 사이에 새 절 `## /ghtrade/* — gh-trade 클라 자동 업데이트 정적 배포`, `## 자산 갱신 절차` 에 "Caddyfile 변경은 메타데이터 재적용만으로 반영되지 않는다" 단서 1문단.

## `handle` 배치 순서의 근거 (다음 사람을 위해 재서술)

Caddy 의 `handle` 과 `handle_path` 는 **같은 그룹 안에서 서로 상호 배타적**이다 — 위에서부터 평가해 **첫 번째로 일치하는 하나만** 실행하고 나머지는 건너뛴다. 기존 `dma.jx1.io` 블록의 마지막 라우트인 매처 없는 `handle { reverse_proxy 127.0.0.1:8090 }` 은 **매처가 없으므로 모든 경로에 일치**한다. 따라서 `/ghtrade` 관련 블록을 그 **뒤**에 두면 `/ghtrade/*` 요청이 기본 `handle` 에 먼저 잡혀 relay wss 프록시 — 즉 **주문 경로** — 로 넘어가고, 정적 파일은 영원히 나오지 않는다. 자리는 반드시 `handle /healthz` 뒤 · 기본 `handle` 앞이다.

같은 이유로 **`@ghtrade_deny` 블록이 `handle_path` 보다 앞**이어야 한다. 뒤로 가면 서빙 블록이 먼저 일치해 미인증 요청이 파일을 그대로 받아 간다.

세 번째 블록 `handle /ghtrade { respond 404 }` 이 이 작업의 핵심 안전장치다. `handle_path /ghtrade/*` 는 **트레일링 슬래시 없는** 정확 경로 `/ghtrade` 에 일치하지 않는다. 이 블록이 없으면 인증을 통과한 `/ghtrade` 요청 **하나만** 아래 기본 `handle` 로 흘러 주문 wss 프록시에 닿는다.

또 하나 조용히 틀리기 쉬운 지점: `handle_path` 의 접두어 제거는 **블록 안쪽 지시어·매처가 평가되기 전에** 일어난다. 그래서 `@ghtrade_nostore` 의 `path` 는 제거 후 기준인 `/manifest.json`·`/manifest.sig` 로 적어야 한다. `/ghtrade/manifest.json` 으로 적으면 **오류 없이 조용히 안 맞고** 캐시 헤더만 사라진다.

## 검증 결과

Task 1 의 ①~⑨, Task 2 의 ①~⑥ 을 **실제로 실행**해 전부 통과했다.

| 검증 | 결과 |
|------|------|
| 배치 순서 (awk 기계 검증) | `healthz=47 < ghtrade=106 < default=121` ✅ |
| deny < 서빙 (awk) | `deny=85 < serve=106` ✅ |
| 비주석 영역 `browse` 등장 | 0건 ✅ |
| 기존 자산 무손상 | `8090`·`8091`·`disable_http_challenge` 각 1건, 상단 주석 `^# ⑤` 1건 ✅ |
| 고정키 등장 횟수 | Caddyfile **1회**, README 0회, 저장소 전체 grep 결과 Caddyfile 단 1곳 ✅ |
| `bash -n infra/relay/startup.sh` | exit 0 ✅ |
| startup.sh 의 caddy 기동/리로드 | 0건 ✅ |
| `/srv/ghtrade` 비주석 등장 | 7건 (install 3 + log 4) ✅ |
| README 절 순서 (awk) | `caddy=758 < ghtrade=802 < assets=874` ✅ |
| README 필수 문자열 10종 | 전부 PRESENT ✅ |
| `git diff --stat` | 3파일 · **183 insertions · 0 deletions** ✅ |

`git diff` 는 **삽입만** 있다 — 기존 줄의 삭제·수정 0행. `.planning/STATE.md` 와 gh-trade 저장소 파일은 diff 에 없다.

### ⚠️ 수행하지 **못한** 검증 (사실 그대로 기록)

- **로컬에 `caddy` 가 설치돼 있지 않다 → `caddy validate` 를 수행하지 못했다.** 이 플랜은 Caddy 설정을 파서에 통과시킨 적이 **없다.** 설정 검증은 **15:40 리로드 직전 VM 에서** 해야 한다:
  ```bash
  sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  ```
  > `sudo caddy validate` (root) 로 실행하지 말 것 — validate 가 파일 로거를 실제로 provisioning 해 `/var/log/caddy/dma.log` 를 `root:root 0600` 으로 만들고, 그 상태로 caddy(`User=caddy`)가 기동하면 `permission denied` 로 설정 로드가 통째로 실패한다 (README 규율 · 15-07 실측).
- **로컬에 `shellcheck` 가 설치돼 있지 않다 → `bash -n`(문법 검사)만 수행했다.** 정적 린트는 돌리지 못했다.

두 사실 모두 플랜의 `<inherited_facts>` 예측과 일치했으며, executor 가 `command -v` 로 재확인했다.

## 15:40 KST 적용 절차 (오케스트레이터용 — 이 플랜 범위 밖)

순서대로. **1~2 는 장중에 해도 무해하다** (`startup.sh` 는 caddy 를 켜거나 리로드하지 않는다). **3 만 장 마감 후.**

```bash
# 1) 메타데이터 갱신 — 저장소의 Caddyfile·startup.sh 를 인스턴스 메타데이터로 밀어 넣는다
GCP_PROJECT_ID=gh-radar bash scripts/setup-relay-iam.sh

# 2) VM 재적용 — /etc/caddy/Caddyfile 이 새 내용으로 깔리고 /srv/ghtrade 가 생성된다
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo google_metadata_script_runner startup'

# 2-a) 반영 확인 (아직 caddy 는 옛 설정으로 돌고 있다)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='grep -c ghtrade /etc/caddy/Caddyfile; ls -ld /srv/ghtrade'
#   기대: ghtrade 등장 다수, /srv/ghtrade 가 drwxr-sr-x 2755 alex caddy

# 3) 설정 검증 → 리로드  ⚠️ 장 마감 후에만 (리로드가 진행 중 wss 를 강제 종료한다)
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a \
  --command='sudo systemctl reload caddy && systemctl is-active caddy'
```

### 리로드 후 확인 명령 (5종 — 전부 개발기에서)

```bash
# ① 기존 표면 무손상 — 200 이어야 한다 (이게 깨지면 즉시 롤백)
curl -s -o /dev/null -w '%{http_code}\n' https://dma.jx1.io/healthz

# ② 미인증 /ghtrade/* → 404
curl -s -o /dev/null -w '%{http_code}\n' https://dma.jx1.io/ghtrade/manifest.json

# ③ 미인증 정확 경로 /ghtrade → 404 (핵심 안전장치. 여기서 101/200 이 나오면 wss 로 샌 것)
curl -s -o /dev/null -w '%{http_code}\n' https://dma.jx1.io/ghtrade

# ④ 인증 + 파일 존재 → 200 & Cache-Control: no-store
#    (KEY 는 infra/relay/Caddyfile 의 @ghtrade_deny 값. 첫 업로드 뒤에 의미가 있다)
curl -sI -H "Authorization: Bearer $KEY" https://dma.jx1.io/ghtrade/manifest.json

# ⑤ 인증 + 디렉터리 지목 → 목록이 나오지 않아야 한다 (404)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $KEY" \
  https://dma.jx1.io/ghtrade/
```

②③ 이 404 가 아니면 **배치 순서가 틀린 것**이다 — 즉시 롤백하고 블록 위치를 확인한다.

## 남은 일 (이 플랜 범위 밖)

1. `scripts/setup-relay-iam.sh` 로 메타데이터 갱신 — **미수행**
2. VM 재적용 (`google_metadata_script_runner startup`) — **미수행**
3. 2026-09-11 15:40 KST caddy 리로드 — **미수행** (오케스트레이터)
4. gh-trade 발행 스크립트로 첫 업로드 (파일들 → `manifest.sig` → `manifest.json` 순서) — **미수행**
5. 인증 헤더 유무 양쪽 실측 (200 / 404) — **미수행**. 위 확인 명령 ①~⑤ 를 그대로 쓴다.

## Deviations from Plan

None — 플랜대로 실행했다. 자동 수정(Rule 1~3) 적용 0건, 아키텍처 결정(Rule 4) 0건.

## 범위 밖 발견 (고치지 않고 이관)

- **`260911-dps-PLAN.md` 자체가 고정키 리터럴을 포함한다.** 플랜의 must-have "고정키는 저장소 안에서 Caddyfile 한 곳에만" 은 **소스 자산 기준으로는 충족**했고(저장소 전체 grep 결과 `infra/relay/Caddyfile:83` 단 1건), PLAN 은 현재 main 체크아웃에서 **untracked** 라 아직 히스토리에 없다. 다만 오케스트레이터가 PLAN 을 커밋하면 키가 2곳이 된다. 플랜 파일 편집은 이 작업 범위 밖이므로 손대지 않았다 — 커밋 전에 판단이 필요하다.
- **`/ghtrade/` (트레일링 슬래시) 는 `handle_path /ghtrade/*` 에 일치한다.** 접두어 제거 후 경로가 `/` 가 되어 `file_server` 가 디렉터리를 보게 되는데, 목록 옵션이 없고 `index.html` 도 없으므로 404 가 된다 — 의도한 결과다. 다만 이는 "목록이 꺼져 있다" 에 의존하는 결과이지 명시적 차단이 아니다. 위 확인 명령 ⑤ 로 실측할 것.

## Threat Flags

없음 — 새로 도입한 표면(`/ghtrade/*`)은 플랜의 `<threat_model>` 이 T-dps-01~07 로 이미 등록·처리했다.

## Self-Check: PASSED

- `infra/relay/Caddyfile` — FOUND (69줄 삽입)
- `infra/relay/startup.sh` — FOUND (32줄 삽입)
- `infra/relay/README.md` — FOUND (82줄 삽입)
- `.planning/quick/260911-dps-radar-gw-caddy-ghtrade-srv-ghtrade/260911-dps-SUMMARY.md` — FOUND
- commit `5fa7221` — FOUND
- commit `3fa691e` — FOUND
- `git rev-list --count 5e6136b..HEAD` = **2** (frontmatter `commits: 2` 와 일치)

> `commits: 2` 는 **SUMMARY 작성 시점의 실측값**이며 task 커밋 2건만 센다. 이 SUMMARY 를
> 담는 최종 문서 커밋이 그 뒤에 1건 더 붙으므로, 사후에 같은 명령을 돌리면 **3** 이 나온다.
