---
phase: 29-dma-multi-server-admin
plan: 52
subsystem: relay-ws · relay-dma · webapp-workbench
tags: [relay, fanout, strategy-sweeper, stale-register, backoff, webapp, workbench, g-1, gap-closure, gc-09, gc-11, gc-12, tdd, tracer]
requires:
  - phase: 29-44
    provides: "60초 재시도(startStaleRetry · #retryStale · #retryUser) · 로그인 백스톱(#backstopSweep) · 확인 기록(#confirmedOwner)"
  - phase: 29-45
    provides: "(사용자, 서버) sweep 레인 · #sweepPending — 재시도 · 백스톱이 진행 중 계좌를 건너뛴다"
  - phase: 29-36
    provides: "상태 프레임 계좌 serverKey · movedFrom · staleStrategies(#withAccountExtras)"
  - phase: 29-39
    provides: "작업대 상태줄 끄기 미확인 경고 줄(WORKBENCH_STATUS_TEXT.staleStrategies · data-slot workbench-stale-strategies)"
provides:
  - "shared RelayAccount.staleStrategies.otherServers?: string[] — 같은 계좌의 다른 옛 서버 키(서버 키 순) · 없으면 옛 서버 하나"
  - "fanout #withAccountExtras — 계좌별 레지스터 항목을 전부 묶음: 서버 키 순 첫 서버 = serverKey · 나머지 = otherServers · count 는 모두 알려지면 합 · 하나라도 모르면 null"
  - "webapp WORKBENCH_STATUS_TEXT.staleStrategies(serverKey, count, otherServers?) — 「옛 서버 KB120 외 N개 서버 활성 전략 …」"
  - "strategy-sweeper StaleStrategyRegister.discard · staleRetryDelayMs(attempts, baseMs = 60_000) · STALE_RETRY_MAX_ATTEMPTS = 12 · STALE_RETRY_MAX_DELAY_MS = 1_800_000 · StrategySweeper.knowsServer(serverKey)"
  - "fanout 재시도: 항목별 지수 backoff(틱 단위 판정) · 상한 12회(자동 재시도만 멈춤 · 경고 유지) · 해소 불가 4사유 지우기 + info 1줄(#discardStale) · 상한 넘긴 키는 로그인 백스톱 1회 대상"
  - "fanout deps now?: () => number (미주입 Date.now) — 미확인 기록 시각 · backoff 판정"
  - "fanout 머리 11 (b) · #backstopSweep 주석 정정 — 확인 기록 TTL 없음 · OCX 재활성은 relay 재시작 · 소유 서버 변경 전까지 다시 끄지 않음(GC-11)"
affects: [ADMIN-06]
actuals:
  tokens: 12400
  tasks: 2
  commits: 4
plan_head_before: f48bbb2fa564609b368d95e617fe1996c4676b5c
plan_head_after: dab23327b242ef4b15a12c21ed15db262ea128eb
tech-stack:
  added: []
  patterns:
    - "재시도 backoff 는 틱 단위로 판정한다 — 다음 틱 전에 기한(마지막 시도 + 지연)이 오면 이번 틱에 시도(시도 소요 · 틱 위상으로 한 틱씩 밀리지 않게)"
    - "해소 불가 지우기는 「확인」 과 다른 이름(discard)과 다른 로그(info · 사유)로 — 끄기 확인과 섞지 않는다"
    - "시각이 판정에 들어가는 fanout 로직은 now 주입 — 하네스는 vi.getMockedSystemTime() 으로 가짜 타이머 시계를 준다(Date 는 가짜가 아님)"
key-files:
  created:
    - .planning/phases/29-dma-multi-server-admin/.red/29-52-task1-red.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-52-task1-red-webapp.json
    - .planning/phases/29-dma-multi-server-admin/.red/29-52-task2-red.json
  modified:
    - packages/shared/src/relay.ts
    - relay/src/ws/fanout.ts
    - relay/src/dma/strategy-sweeper.ts
    - relay/tests/order-server-resync.test.ts
    - relay/tests/strategy-sweeper.test.ts
    - webapp/src/components/trading/workbench/workbench-status-bar.tsx
    - webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx
key-decisions:
  - "29-52: 상태 프레임 staleStrategies 는 하위 호환 확장 — { serverKey, count } 의미 그대로 · 선택 otherServers 만 더함(옛 웹은 첫 서버만 그림). 첫 서버 = 서버 키 순 첫 항목"
  - "29-52: 재시도 기한은 틱 단위 판정(now - lastAttemptAt > staleRetryDelayMs(attempts, 틱) - 틱) — 연속 실패의 재시도 간격이 60 · 120 · 240 · 480 · 960 · 1800 …초가 된다"
  - "29-52: 상한(12회)을 넘긴 항목은 지우지 않는다 — 자동 재시도만 멈추고 경고(healthz · Admin · 상태 프레임)는 남김. 그 사용자 로그인마다 백스톱이 1회 대상에 넣는다"
  - "29-52: 비용 없는 해소 불가 판정(레지스트리에 없는 서버 · 어느 매핑에도 없는 계좌)은 기한 · 상한과 무관하게 매 틱 모든 항목에 한다. 자격증명 판정(unauthorized · dma-changed)은 기한이 와 자격증명을 물을 때만"
  - "29-52: 「어느 매핑에도 없음」 은 트래커(owners)가 있을 때만 판정한다 — 미주입(단위 하네스)이면 종전대로 건너뜀"
patterns-established:
  - "레지스터 항목을 지우는 새 사유는 #discardStale(사유 리터럴) 하나로 — info 1줄(userId · 서버 키 · 계좌 수 · 사유)"
requirements-completed: [ADMIN-06]
coverage:
  - id: D1
    description: "트레이서(GC-12) — 계좌 A 가 KB120 · KB122 에 미확인이면 인증 첫 상태 프레임 A = { serverKey: KB120, count: 3, otherServers: [KB122] } · 한쪽 수 모름이면 count null · 옛 서버 하나면 otherServers 키 없음"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#GC-12 — 한 계좌가 여러 옛 서버에 미확인 → 인증 첫 상태 프레임 …"
        status: pass
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#② 끄기 미확인 … staleStrategies { KB120, 1 } (무수정)"
        status: pass
    human_judgment: false
  - id: D2
    description: "작업대 상태줄 경고 — otherServers [KB122] → 「옛 서버 KB120 외 1개 서버 활성 전략 3건 — 끄지 못했어요 · 클라(OCX)에서 끄세요」 · 없거나 빈 배열이면 종전 문구"
    requirement: ADMIN-06
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx#GC-12 (3건) + 29-39 기존 경고 · 안내 케이스"
        status: pass
    human_judgment: false
  - id: D3
    description: "GC-09 해소 불가 4사유(unauthorized · dma-changed · 어느 매핑에도 없는 계좌 · 레지스트리에 없는 서버) → 60초 틱에 레지스터에서 지움 · sweep 0 · 로그인 0 · info 4줄(계좌번호 · DMA id 없음) · byServer 빔"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#GC-09 해소 불가 4사유 지우기 + info"
        status: pass
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#GC-09 transient 는 남고 attempts +1"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-sweeper.test.ts#GC-09 (29-52) discard · GC-09 targetOf 가 아는 서버 키만 true"
        status: pass
    human_judgment: false
  - id: D4
    description: "GC-09 지수 backoff — 계속 미확인이면 재시도 sweep 시작은 60 · 180 · 420 · 900초째뿐 · 지연 표 60 · 120 · 240 · 480 · 960 · 1800 · 1800 …초"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#GC-09 backoff 60 · 120 · 240 · 480"
        status: pass
      - kind: unit
        ref: "relay/tests/strategy-sweeper.test.ts#GC-09 (29-52) staleRetryDelayMs 표"
        status: pass
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#⑭ (대기 120초로 갱신) · ⑮ ⑯ ⑰"
        status: pass
    human_judgment: false
  - id: D5
    description: "GC-09 상한 — attempts 12 항목은 2시간 동안 재시도 0 · 레지스터 · byServer · 상태 프레임 경고 그대로 · 로그인 백스톱이 1회 sweep → 확인 · 사라짐"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "relay/tests/order-server-resync.test.ts#GC-09 상한 — attempts 12 항목은 60초 틱 재시도 0(2시간) …"
        status: pass
    human_judgment: false
  - id: D6
    description: "GC-11 — fanout 머리 11 (b) · #backstopSweep 주석이 실제 동작(확인 기록 TTL 없음 · OCX 재활성은 다시 끄지 않음)을 말한다 · OCX 재활성 수렴을 약속하던 구절 없음"
    verification:
      - kind: other
        ref: "test \"$(grep -c '다시 켠 전략 수렴' relay/src/ws/fanout.ts)\" = 0 && grep -q GC-11 relay/src/ws/fanout.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "운영 보존 — 레지스터가 빈 운영 모양에서 상태 프레임 · 상태줄 무변경(relay 전체 · webapp trading 회귀 green)"
    requirement: ADMIN-06
    verification:
      - kind: integration
        ref: "pnpm --filter @gh-radar/relay exec vitest run --maxWorkers=2 (57 파일 · 1478 green)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp exec vitest run src/components/trading src/lib/__tests__/relay-socket.test.ts --maxWorkers=2 (40 파일 · 1874 green)"
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-10-11
status: complete
---

# Phase 29 Plan 52: 끄지 못한 전략 경고 다중 옛 서버 · 미확인 레지스터 위생 (GC-12 · GC-09 · GC-11) Summary

**한 계좌가 여러 옛 서버에 끄지 못한 전략을 남기면 relay 상태 프레임이 `otherServers` 를 싣고, 작업대가 「옛 서버 KB120 외 1개 서버 …」 로 말한다. 60초 재시도는 이제 항목마다 지수 backoff(60초 → 최대 30분)로 시도하고 12회에서 멈춘다(경고는 남김 · 로그인 백스톱 1회). 해소할 수 없는 항목 4사유는 info 1줄과 함께 지운다. 머리 주석은 실제 동작에 맞췄다(확인 기록 TTL 없음).**

## Performance

- **Duration:** 약 10 min
- **Started:** 2026-10-11T01:48:54Z
- **Completed:** 2026-10-11T01:59:23Z
- **Tasks:** 2 (둘 다 TDD — RED/GREEN 커밋 각 2)
- **Files modified:** 10 (코드 3 · 테스트 3 · webapp 2 · RED 증거 3 — shared 포함)

## Accomplishments

- **GC-12 트레이서(relay → shared → webapp).**
  - `#withAccountExtras` 가 계좌별 레지스터 항목을 서버 키 순으로 전부 묶는다. 첫 서버가 `serverKey`, 나머지가 `otherServers` 다. 키는 2대 이상일 때만 붙는다.
  - `count` 는 모든 서버의 수가 알려졌으면 합, 하나라도 null 이면 null 이다.
  - 옛 서버 하나면 종전 `{ serverKey, count }` 그대로다(29-36 ② 무수정 green · 키 부재를 `toStrictEqual` 로 고정).
  - 작업대 경고 문구는 `otherServers` 가 비어 있지 않을 때만 「외 N개 서버」 를 붙인다. 새 요소는 없다.
- **GC-09 레지스터 위생.**
  - 지우기: 4사유는 레지스터 `discard` 로 지우고 info 1줄을 남긴다(userId · 서버 키 · 계좌 수 · 사유 — 계좌번호 · DMA id 없음).
    - 매 틱 판정(비용 없음): 레지스트리에 없는 서버(`unknown-server` — `StrategySweeper.knowsServer` 거짓) · 어느 매핑에도 없는 계좌(`unmapped`).
    - 기한이 와 자격증명을 물었을 때 판정: 자격증명 `unauthorized` · `dma-changed`.
    - 그 뒤 healthz `staleAccounts` · Admin 카드 · 상태 프레임에서 사라진다(연결 중이면 상태 프레임 재송신).
  - 일시 실패(`not_ready` · `lookup-failed`)는 종전대로 남기고 `attempts` +1 이다.
  - backoff: `now - lastAttemptAt > staleRetryDelayMs(attempts, 틱) - 틱` 일 때만 sweep 한다. 연속 실패의 재시도 간격은 60 · 120 · 240 · 480 · 960 · 1800 · 1800 …초다.
  - 상한: `attempts >= 12` 면 자동 재시도를 멈춘다. 항목은 남고, 그 사용자 로그인 백스톱이 그 (서버, 계좌)를 1회 대상에 넣는다.
- **GC-11 주석.** 머리 11 (b) · `#backstopSweep` 문서 주석에서 「클라(OCX)에서 다시 켠 전략 수렴」 약속을 지웠다. 대신 「확인 기록은 프로세스 수명 동안 남는다 — relay 재시작 · 소유 서버 변경 전까지 다시 끄지 않는다(GC-11 · TTL 없음)」 를 적었다. 동작은 바꾸지 않았다. 머리 11 (c) 에 backoff · 상한 · 지우기 한 줄을 더했다.
- **운영 보존.** 운영 레지스터는 비어 있다. 그래서 재시도 · 지우기 · 상태 프레임 부가 필드가 모두 0 이고, 상태 프레임과 작업대 상태줄은 종전과 같다.

## Task Commits

1. **Task 1 RED: GC-12 실패 테스트(relay · webapp)** — `cf233348` (test)
2. **Task 1 GREEN: otherServers · 「외 N개 서버」** — `36138591` (fix)
3. **Task 2 RED: GC-09 실패 테스트 · 하네스 시계 주입 · ⑭ 대기 120초** — `d9d81d4e` (test)
4. **Task 2 GREEN: 해소 불가 지우기 · backoff · 상한 · 주석 정정** — `dab23327` (fix)

REFACTOR 없음. 트레이서 게이트(interactive · end-of-phase · automated 만)는 Task 1 verify 를 다시 돌려 green 을 확인한 뒤 Task 2 로 넘어갔다.

## TDD Gate Compliance

- **Task 1 RED** `cf233348`: 증거는 두 파일이다(JUnit · 둘 다 `RED_EVIDENCE_OK`).
  - relay `.red/29-52-task1-red.json`: 23 수집 · 실패 1 · errors 0. 목표 「GC-12 — 한 계좌가 여러 옛 서버 …」 는 `toStrictEqual` 에서 실패했다. 종전 코드가 첫 기록 항목 `{ serverKey: 'KB122', count: 1 }` 만 실었기 때문이다(GC-12 그대로).
  - webapp `.red/29-52-task1-red-webapp.json`: 41 수집 · 실패 2 · errors 0. 경고 줄 글자가 종전 문구였다. 문구 상수 케이스도 같은 이유로 실패했다.
  - 「otherServers 없으면 종전 문구」 와 29-39 기존 케이스는 처음부터 green 이었다.
- **Task 2 RED** `d9d81d4e`: 증거는 `.red/29-52-task2-red.json` 이다(JUnit · `RED_EVIDENCE_OK`). 27 수집 · 실패 3 · errors 0.
  - 목표 「GC-09 backoff …」 는 시작 시각 `toEqual` 에서 실패했다. 종전 코드는 60초 틱마다 16회 시작했다.
  - 같은 미구현으로 「4사유 지우기」(waitFor 시한)와 「상한 → 재시도 0」(2시간 60회 sweep)이 실패했다.
  - strategy-sweeper 단위 3건(`discard` · `staleRetryDelayMs` · `knowsServer`)은 미정의 심볼로 실패했다. 32 수집 · errors 0 이다.
  - 「transient 는 남고 attempts +1」 과 ⑭ ⑮ ⑯ ⑰ 은 종전 동작으로도 green 이었다(회귀 고정).
- **GREEN** `36138591` · `dab23327`: 커밋 접두는 플랜 action 예시대로 `fix(29-52)` 다. TDD 게이트의 `feat(...)` 패턴 대신 쓴 것이고, 29-45 · 29-46 · 29-55 와 같은 관례다.

## Verification

- Task 1 verify: shared build · relay typecheck · typecheck:tests · `order-server-resync` 23 green · webapp typecheck · `workbench-status-bar` + `relay-socket` 2 파일 185 green(이름에 「GC-12」 4건)
- Task 2 verify: relay typecheck · typecheck:tests · `strategy-sweeper` + `order-server-resync` + `order-api` 3 파일 121 green(이름에 「GC-09」 7건) · `다시 켠 전략 수렴` 0 · `GC-11` 있음 → `OK`
- 끝에 한 번(`--maxWorkers=2`): relay 전체 57 파일 1478 green · webapp `src/components/trading` + `relay-socket` 40 파일 1874 green
- 수용 기준 grep:
  - shared `otherServers` = 1 · fanout `otherServers` = 3 · workbench-status-bar `otherServers` = 5
  - strategy-sweeper `staleRetryDelayMs` = 2 · `knowsServer` = 1 · fanout `STALE_RETRY_MAX_ATTEMPTS` = 7
  - fanout `discard(` = 1 — 기준(>= 2)에 못 미친다. 아래 편차 2 참고.

## Files Created/Modified

- `packages/shared/src/relay.ts` — `staleStrategies.otherServers?` · 다중 서버 count 규칙 주석
- `relay/src/ws/fanout.ts` — `#withAccountExtras` 다중 서버 묶음 · `now` 주입 · `#staleRetryIntervalMs` · `#staleRetryDue` · `#retryUser` 4사유 지우기 · `#discardStale` · `#backstopSweep` 상한 키 1회 · `pushTo` · 머리 11 (b)(c) · 문서 주석
- `relay/src/dma/strategy-sweeper.ts` — `STALE_RETRY_MAX_ATTEMPTS` · `STALE_RETRY_MAX_DELAY_MS` · `staleRetryDelayMs` · `StaleStrategyRegister.discard` · `StrategySweeper.knowsServer` · 레지스터 머리 주석
- `relay/tests/order-server-resync.test.ts` — 하네스 가짜 시계(`now`) · `recording` 이 `knowsServer` 전달 · GC-12 1건 · GC-09 4건 · ⑭ 대기 120초
- `relay/tests/strategy-sweeper.test.ts` — `discard` · `staleRetryDelayMs` 표 · `knowsServer` 3건
- `webapp/src/components/trading/workbench/workbench-status-bar.tsx` — 문구 함수 세 번째 인자 · 호출부 · 머리 ⑧ 한 줄
- `webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx` — GC-12 3건

## Decisions Made

- **backoff 판정은 틱 단위다.** 플랜 문장 「마지막 시도 + 지연이 지나야」 를 그대로 쓰면 첫 재시도가 한 틱 밀린다. 실패 시각(시도 끝)이 틱 시작보다 늦기 때문이고, 그러면 간격이 120 · 180 · 300 …초가 된다. 그래서 「다음 틱 전에 기한이 오면 이번 틱에 시도」 로 정했다. behavior 의 60 · 120 · 240 … 과 ⑭ 「두 번째 실패 뒤 120초」 가 이 규칙으로 맞는다.
- **비용 없는 해소 불가 판정은 매 틱 모든 항목에 한다.** 대상은 레지스트리에 없는 서버와 매핑 없는 계좌다. 상한을 넘긴 항목도 포함한다. 이렇게 해야 상한 뒤 레지스트리에서 서버를 지워도 영구 경보가 남지 않는다. 자격증명 판정은 DB 조회라 기한이 왔을 때만 한다.
- **판정 순서는 되돌아옴 해제 → 레지스트리에 없는 서버 → 매핑 없음 → 기한 · 상한 → 자격증명이다.** 「매핑 없음」 은 트래커가 있을 때만 판정한다.
- **12회 도달 시점(참고).** 연속 실패면 시도 사이 지연 합이 60 + 120 + 240 + 480 + 960 + 1800 × 6 = 12,660초다. 즉 첫 실패에서 약 3.5시간 뒤 12회에 닿는다(플랜 머리 「약 4.6시간」 과 다르다 — 숫자는 근거 표기일 뿐 단언하지 않았다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] fanout 에 시계 주입(`now?: () => number`)**
- **Found during:** Task 2 RED 설계
- **Issue:** backoff 는 `lastAttemptAt` 과 지금 시각을 견준다. 그런데 `order-server-resync` 하네스는 setTimeout 계열만 가짜이고 `Date` 는 진짜라, 가짜 타이머로 60초를 밀어도 `Date.now()` 는 거의 그대로다. 그러면 기한이 영원히 오지 않아 ⑭ 와 새 backoff 테스트를 검증할 수 없다.
- **Fix:** `WsFanoutDeps.now?` 를 더했다(미주입 = `Date.now` — 운영 index 무변경). `#markStale` 기록 시각과 재시도 판정이 그것을 쓴다. 하네스는 `vi.getMockedSystemTime()?.getTime() ?? Date.now()` 를 준다. 파일 전체의 가짜 타이머 범위(toFake)는 그대로 두었다.
- **Files modified:** relay/src/ws/fanout.ts, relay/tests/order-server-resync.test.ts
- **Verification:** relay 전체 1478 green
- **Committed in:** d9d81d4e(하네스) · dab23327(fanout)

**2. [수용 기준 편차] `grep -c "discard(" relay/src/ws/fanout.ts` = 1 (기준 >= 2)**
- **Found during:** Task 2 수용 기준 확인
- **Issue:** 레지스터 `discard` 호출과 info 1줄을 `#discardStale` 한 곳으로 모았다. 4사유 호출부 3곳은 `#discardStale(` 라서 패턴 `discard(` 에 걸리지 않는다.
- **Fix:** 코드는 바꾸지 않았다. 사유마다 `discard` 와 로그를 따로 쓰면 같은 4줄이 세 번 반복된다. 기준의 의도(4사유가 레지스터에서 지운다)는 「GC-09 해소 불가 4사유 지우기 + info」 테스트가 증명한다.
- **Files modified:** 없음

**3. [의도된 단언 변경 — 플랜 명시] ⑭ 두 번째 실패 뒤 대기 60초 → 120초**
- 테스트 이름과 루프 상한(`STALE_STRATEGY_RETRY_MS * 2`)을 고쳤다. 다른 단언은 그대로다. ⑮ ⑯ ⑰ 은 무수정 green 이다.

---

**Total deviations:** 1 auto-fixed(Rule 3) · 수용 기준 grep 편차 1 · 플랜 명시 단언 변경 1
**Impact on plan:** 시계 주입은 운영 동작을 바꾸지 않는다(기본 Date.now). 범위 확장은 없다.

## Issues Encountered

- 테스트 로그의 `journalAlerting` TypeError 는 order-api 기존 brokers 오류 케이스의 의도된 500 로그다. 이 플랜과 무관하다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 배포 안 함 — 코드 · 테스트만. relay 는 다음 relay 배포 때, 작업대 문구는 webapp push 때 반영된다. relay 가 먼저 배포돼도 옛 웹은 `otherServers` 를 무시하고 첫 서버만 그린다.
- 「어느 매핑에도 없음」 판정은 트래커 스냅샷(지금 파이프라인 매핑)을 따른다. 어떤 서버 파이프라인의 매핑이 잠시 비는 순간이 있다면, 그 서버에만 있던 계좌의 항목이 그 틱에 지워질 수 있다(사유 `unmapped` info 로 되짚을 수 있음). 오케스트레이터 결정 8 대로 구현했고, 운영 레지스터가 비어 있어 지금은 해당 없다.

---
*Phase: 29-dma-multi-server-admin*
*Completed: 2026-10-11*
