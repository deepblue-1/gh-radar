---
phase: 16-trading-limit-chaser-vi-my-page
plan: 30
subsystem: relay
tags: [healthz, uptime, session-manager, smoke, secret-handling, vitest]

requires:
  - phase: 16
    provides: "16-21 이 gap 4 로 바꾼 `sessionsOk = everReadyCount === 0 || readyCount > 0` 판정"
  - phase: 16
    provides: "16-21 이 재작성한 smoke INV-9 `ws_order_probe` 3갈래 판정"
provides:
  - "`STALE_SESSION_MS`(5분) — 「never-Ready 는 정상」 면제의 **시간 상한**"
  - "`Entry.createdAt` + `SessionStats.stalledCount`(필수 필드) — 래치가 비어 있는 상태를 시간으로 가르는 축"
  - "`/healthz` 판정 `(everReadyCount === 0 && stalledCount === 0) || readyCount > 0` + 페이로드 `stalledCount`"
  - "smoke INV-9 프로브의 `SMOKE_TOKEN` env 전달 + 단일 출력 지점 판정"
affects: [Cloud Monitoring uptime check, relay 재배포 후 장애 탐지, 16-35 종결 plan 의 smoke 실행]

tech-stack:
  added: []
  patterns:
    - "인메모리 래치를 장애 판정의 **유일** 근거로 두지 않는다 — 프로세스 재시작이 곧 관측 실명이므로 시간축을 함께 둔다"
    - "벽시계는 생성자 주입(`now?: () => number`)으로 연다 — 기존 테스트가 `vi.useFakeTimers({ toFake: [...] })` 로 타이머만 가짜로 쓰기 때문에 `vi.setSystemTime` 이 닿지 않는다"
    - "비밀은 argv 가 아니라 env 로 자식 프로세스에 넘긴다 (argv 는 `ps` 로 world-readable, env 는 `/proc/PID/environ` 으로 동일 사용자만)"
    - "판정 문자열은 **대입으로 덮어쓰고** 출력 지점을 하나로 둔다 — 출력이 둘이면 언젠가 이어 붙는다"

key-files:
  created: []
  modified:
    - relay/src/dma/session-manager.ts
    - relay/src/order/order-api.ts
    - relay/tests/session-manager.test.ts
    - relay/tests/order-api.test.ts
    - scripts/smoke-relay.sh

key-decisions:
  - "`createdAt` 을 `DmaSession` 이 아니라 **`SessionManager` 의 `Entry`** 에 뒀다. `session.ts` 는 `hasBeenReady` 래치의 주인이고 그 래치의 의미는 「Ready 를 본 적 있는가」 하나뿐이다. 수명 시각을 얹으면 `session.ts` 가 「부재 vs 장애」 판정까지 아는 모듈이 되어 T-16-26 이 지키라는 래치의 의미가 흐려진다. `git diff relay/src/dma/session.ts` = **0줄**"
  - "`stalledCount` 를 optional 이 아니라 **필수 필드**로 넣었다 (`everReadyCount` 와 같은 규율). 그 결과 `order-api.test.ts` 의 스텁 5곳과 `session-manager.test.ts` 의 필드 화이트리스트가 컴파일·단정 단계에서 깨졌고, 그것이 이 설계의 의도다 — optional 이었다면 소비자가 갱신을 강제받지 않는다"
  - "`STALE_SESSION_MS` 를 env 로 덮지 않는다. 판정 임계를 배포 환경마다 달리 두면 uptime 알림의 의미가 환경별로 갈라진다. 눈금은 `SESSION_GRACE_MS` 와 같은 5분 — 둘 다 「사람의 왕복이 끝나기를 기다려 주는 시간」이라 같은 자릿수여야 운영자가 두 상수를 따로 기억하지 않는다"
  - "Ready 를 한 번이라도 본 세션은 `stalled` 로 세지 **않는다**(`else if`). 그 상태는 `everReadyCount` 가 이미 degraded 로 잡는다 — 한 사건을 두 카운터가 겹쳐 세면 어느 쪽이 울렸는지 사후에 못 가린다"
  - "`ws_order_probe` 의 사전 가드 2곳(`토큰 미설정`·`ws 모듈 해석 실패`)은 `printf 'inconclusive'; return 0` 를 유지했다. 이들은 프로브 실행 **이전**에 같은 줄에서 즉시 반환하므로 구조적으로 이어 붙을 수 없다. 갭이 지목한 자리는 프로브 실행 **이후**의 `rc != 0` 분기이고 그쪽만 대입으로 바꿨다"
  - "프로덕션 대상 smoke 실행은 하지 않았다. 대신 `node`·`pnpm` 을 PATH 셰임으로 갈아끼워 함수를 격리 실행해 두 결함의 수정 전/후를 실측했다 — 실서버에 패킷 한 개도 보내지 않고 `ps` 노출과 판정 강등을 직접 관측했다"

patterns-established:
  - "회귀 잠금 실증: 새 분기를 무력화해 새 테스트가 실제로 실패하는지 확인 후 복원 (16-27·16-28·16-29 승계)"
  - "스크립트 검증은 PATH 셰임 + 함수 격리 추출로 한다 — 프로덕션 엔드포인트를 치지 않고도 분기 동작을 실측한다"

requirements-completed: []

duration: 20min
completed: 2026-09-09
---

# Phase 16 Plan 30: `/healthz` 시간 상한 + smoke 판정 무결성 Summary

「우리가 장애를 **관측하는 수단**」이 스스로를 무력화하던 두 자리를 닫았다 — `/healthz` 는 재시작으로 눈이 멀었고, smoke INV-9 는 FAIL 을 SKIP 으로 강등하며 토큰을 `ps` 에 흘렸다.

## 무엇이 바뀌었나

### GC-WR-07 — 재시작 후 영원한 초록을 막았다

16-21 은 `sessionsOk = everReadyCount === 0 || readyCount > 0` 으로 「게이트웨이가 애초에 없는 환경」을 장애에서 면제했다. 그 면제의 근거인 `hasBeenReady` 는 **`DmaSession` 인스턴스의 인메모리 래치**다. 게이트웨이가 죽어 있는 동안 relay 가 재배포·OOM·크래시로 **한 번만** 재시작하면 `everReadyCount` 가 0 으로 초기화되고, 그 뒤로는 사용자가 아무리 붙어도 진짜 장애가 영원히 `ok/200` 이다. 예전 규칙(`sessionCount > 0 && readyCount === 0` → degraded)이 잡던 사례가 통째로 빠져 있었다.

**이 plan 은 16-21 을 되돌리지 않는다.** `everReadyCount === 0` 유예는 그대로 두고 거기에 **시간 상한**을 붙였다.

| 축 | 전 | 후 |
|---|---|---|
| 판정 | `everReadyCount === 0 \|\| readyCount > 0` | `(everReadyCount === 0 && stalledCount === 0) \|\| readyCount > 0` |
| 부팅 직후 never-Ready | 200 | **200 (유지)** |
| 5분 넘긴 never-Ready | 200 ← 갭 | **503** |
| Ready 였다가 죽음 | 503 | **503 (유지)** |
| VPN 다운 | 503 | **503 (유지 — 세션과 독립)** |

구현:

- `STALE_SESSION_MS = 300_000` — 근거를 docstring 에 적었다(유예 안에서는 never-Ready 가 정상, 넘으면 게이트웨이가 응답하지 않는다는 뜻).
- `Entry.createdAt: number` — `#create` 에서 채운다. **`session.ts` 를 건드리지 않는다** (아래 「래치를 지키기 위해 옮긴 것」).
- `SessionStats.stalledCount: number` — 필수 필드. `stats()` 가 `!hasBeenReady && now - createdAt > STALE_SESSION_MS` 를 센다.
- `SessionManagerOptions.now?: () => number` — 벽시계 주입구.
- `HealthPayload.stalledCount` — 페이로드에도 노출해 `everReadyCount:0` 두 상황(부재 vs 재시작 후 장애)을 응답에서 바로 읽게 했다. 식별자는 없다(`sessionCount` 와 같은 취급).
- `/healthz` docstring 의 ★ 2026-09-09(16-21) 문단 **뒤에** ★ 2026-09-09 보강(16-30) 문단을 이어 적었다.

### 래치를 지키기 위해 `createdAt` 을 매니저에 뒀다

`hasBeenReady` 를 지우거나 되돌리면 진짜 게이트웨이 장애 탐지가 함께 죽는다(T-16-26). 그래서 시각을 `DmaSession` 이 아니라 `SessionManager` 의 `Entry` 에 얹었고, 그 이유를 코드 주석에 남겼다. **`git diff --stat relay/src/dma/session.ts` = 0줄.**

### GC-WR-11 — 토큰 노출과 판정 강등

두 결함 모두 격리 실행으로 **수정 전/후를 실측**했다(프로덕션 미접속, 아래 §검증).

| 결함 | 전 | 후 |
|---|---|---|
| ① 토큰 전달 | `node "$js" url ws_module "$token"` → `ps` 로 world-readable | `SMOKE_TOKEN="$token" node "$js" url ws_module` (`:469`) |
| ① 프로브 수신 | `process.argv[4]` | `process.env.SMOKE_TOKEN` (`:375`) |
| ② `rc != 0` | `printf 'inconclusive'` **덧붙임** → `reachable\ninconclusive` → `case *` → **SKIP** | `verdict="inconclusive"` **대입** (`:474`), 출력은 `printf '%s' "$verdict"` **한 곳** (`:476`) |
| ③ `case *` 갈래 | 관측 문자열을 남기지 않음 | 관측 원문을 skip 사유에 인용 (`:673`) — 토큰은 프로브가 출력하지 않으므로 실릴 수 없다 |

`rm -rf "$dir"` 정리는 `|| rc=$?` 뒤에 그대로 있어 어느 경로에서도 실행된다(격리 실행에서 임시 디렉터리 소멸 확인).

## 검증

### 자동 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/relay test` | **17 files / 365 tests 통과** (16-29 의 361 → +4) |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `bash -n scripts/smoke-relay.sh` | exit 0 |

신규 테스트 4종:

- `order-api.test.ts` ⑧-d — `everReadyCount:0` + `stalledCount:1` → **degraded 503**, `vpn:true`(터널이 아니라 게이트웨이 프로세스가 죽었다)
- `order-api.test.ts` ⑧-e — `stalledCount:1` 이라도 `readyCount:1` 이면 **ok 200** (`|| readyCount > 0` 항이 덮는다)
- `session-manager.test.ts` ⑩ — 생성 직후 0 → 정확히 `STALE_SESSION_MS` 경과 시점도 **0**(경계 위는 정상) → `+1ms` 에서 **1**
- `session-manager.test.ts` ⑪ — Ready 를 본 세션은 `STALE_SESSION_MS × 10` 이 지나도, 전송이 끊겨 Ready 가 풀린 뒤에도 `stalled` 0

기존 4케이스(⑧ Ready 였다가 죽음 503 · ⑧-b never-Ready 200 · ⑧-c VPN 다운 503 · ⑨ Ready 있으면 ok)는 그대로 통과한다. ⑧-b 에는 `stalledCount: 0` 단정을 추가해 **16-21 의 면제가 16-30 에 잡아먹히지 않았음**을 잠갔다.

### 회귀 잠금 실증 (무력화 → 실패 확인 → 복원)

| 무력화한 것 | 실패한 테스트 | 복원 |
|---|---|---|
| `sessionsOk` 를 16-21 원형(`everReadyCount === 0 \|\| readyCount > 0`)으로 되돌림 | ⑧-d 1 failed / 18 passed | ✅ |
| `stats()` 의 stalled 계산 분기를 `false &&` 로 차단 | ⑩ 1 failed / 10 passed | ✅ |

복원 후 30 tests 전부 통과.

### smoke 프로브 격리 실측 (프로덕션 미접속)

`node`·`pnpm` 을 PATH 셰임으로 갈아끼우고 `ws_order_probe` 함수만 떼어내 실행했다. 셰임 `node` 는 argv·`SMOKE_TOKEN` 을 파일로 기록하고 `reachable` 을 찍은 뒤 지정한 코드로 종료한다 — 「판정을 찍은 **뒤** 비정상 종료」의 정확한 재현이다.

| 케이스 | 수정 전 (HEAD) | 수정 후 |
|---|---|---|
| A. 판정 출력 후 rc=1 | 판정 `reachable\ninconclusive` → `case *` → **SKIP** (FAIL 강등) | 판정 **`inconclusive`** (덮어쓰기) |
| A. argv 내 토큰 | **1건** (`ps` 노출) | **0건** — argv 는 `[probe.cjs, wss://…/ws, …/ws.js]` 3개뿐 |
| A. env 내 토큰 | — | 1건 (`SMOKE_TOKEN`) |
| B. rc=0 | `reachable` | `reachable` (동일) |
| C. 토큰 미설정 | `inconclusive` | `inconclusive` (동일) |

즉 **토큰 없는 일상 실행의 INV-9 는 이 plan 전후로 동일하게 SKIP** 이고, 나머지 검사는 코드가 바뀌지 않았다.

### 실행하지 않은 것과 그 이유

- **`bash scripts/smoke-relay.sh` 프로덕션 전체 실행은 하지 않았다.** 이 plan 의 승인 기준에는 「실행 결과 PASS/FAIL/SKIP 수가 전후 동일」이 있으나, phase 운영 지시가 **「smoke 스크립트는 수정만 하고 프로덕션 대상 실행은 종결 plan 16-35 몫」** 으로 정해져 있다. 그 대신 위 격리 실측으로 바뀐 분기의 동작을 직접 관측했고, 바뀌지 않은 검사들은 diff 가 `ws_order_probe`(+ 호출부 `*` 갈래 문구) 밖으로 나가지 않는다는 사실로 대신했다 — `git diff --stat scripts/smoke-relay.sh` = **18 insertions, 6 deletions**, 전부 INV-9 경로.
- **relay 재배포도 하지 않았다.** 2라운드 종결 plan 에서 일괄 처리한다. 즉 `stalledCount` 판정은 아직 프로덕션 `/healthz` 에 없다.
- **실서버·실계좌 미접속** (D-27). 이 plan 은 `10.41.1.120` 이나 실계좌에 어떤 요청도 보내지 않았다.

### 저장소 실측 메모 — `10.41.1.120` 2건

phase 내 여러 plan 이 인용하는 `grep -rn "10.41.1.120" relay/` **0건** 조건은 이 plan 의 승인 기준에는 없으나, 실측은 **2건**이다.

- `relay/README.md:17` — 「실서버 `10.41.1.120` 과 실계좌 접속은 …」 **경고 문장**
- `relay/src/dma/link-health.ts:20` — 「게이트웨이가 `10.41.1.120` 이라 이 조건이 곧 "터널이 서 있다"」 **판정 근거 주석**

둘 다 이 phase 이전부터 있던 **산문**이고 접속 대상 설정이 아니다. **삭제하지 않았다** — 지우면 D-27 안전장치의 근거가 사라진다.

## Deviations from Plan

### Rule 1 — 버그 (실행 중 자초한 것)

**1. [Rule 1 - Bug] prettier 일괄 포맷이 무관한 줄을 재배열한 것을 되돌렸다**

- **발견 시점:** Task 1 커밋 직전
- **문제:** 코드 정리 목적으로 `npx prettier --write` 를 돌렸는데, 저장소에 prettier 설정 파일이 **없어** 기본 `printWidth: 80` 이 적용됐다. 그 결과 4개 파일에서 이 plan 과 무관한 줄이 통째로 재배열됐다(`git diff --stat` 459 insertions).
- **수정:** src 2종은 어긋난 줄(로거 인자 1줄)만 손으로 복원했고, 테스트 2종은 `git checkout -- <file>` 로 되돌린 뒤 편집을 **다시 적용**했다. prettier 의 「`{` 뒤 개행이 있으면 다시 합치지 않는다」 규칙 때문에 width 를 100 으로 올린 재실행으로는 복구되지 않아서다.
- **결과:** 최종 diff 의 삭제 줄은 **의도한 5줄뿐**(`sessionsOk` 1 · `stats()` return 1 · `#sessions.set` 1 · 테스트 stats 리터럴 11 — 전부 필드 추가 때문). 이 저장소에는 자동 포매터가 없으므로 앞으로도 돌리지 않는다.

### 계획과 다르게 한 것

**2. `bash scripts/smoke-relay.sh` 프로덕션 실행을 생략했다** — 위 §실행하지 않은 것 참조. phase 운영 지시(smoke 실행은 16-35)가 plan 의 승인 기준보다 우선한다고 판단했고, 대체 검증(격리 실측 + diff 범위)을 남겼다.

**3. `STALE_SESSION_MS` 를 env 로 열지 않았다** — plan 이 「실행자 판단」으로 남긴 자리다. 판정 임계가 환경별로 갈리면 uptime 알림의 의미가 갈린다는 이유로 상수로 고정했다.

## Authentication Gates

없음.

## Known Stubs

없음. 이 plan 이 만든 값은 전부 실제 계산·실제 전달 경로에 연결돼 있다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경이 없다. `HealthPayload` 에 필드 1개가 늘었으나 수(count)이고 식별자가 아니며, `order-api.test.ts` ② 의 필드 화이트리스트가 이를 잠근다(T-15-22).

## 요구사항

**TRADE-03 은 Pending 유지.** `requirements.mark-complete` 를 돌리지 않았다 — 코드 층위만 닫혔고 프로덕션 `/healthz` 의 `everReadyCount: 0` 판정(16-26)은 그대로다. 이 plan 이 만든 `stalledCount` 는 아직 배포되지 않았다.

## Commits

| Task | 내용 | Commit |
|---|---|---|
| 1 | GC-WR-07 — `stalledCount` 판정 + 회귀 테스트 4종 | `51a66c8` |
| 2 | GC-WR-11 — `SMOKE_TOKEN` env 전달 + 판정 덮어쓰기 | `024ce72` |

## Self-Check: PASSED
