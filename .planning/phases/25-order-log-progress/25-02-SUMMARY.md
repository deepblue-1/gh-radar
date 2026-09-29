---
phase: 25-order-log-progress
plan: 02
subsystem: relay
tags: [relay, observer, journal, healthz, strategy-events, tdd]

requires:
  - phase: 25-01 (트레이서)
    provides: JournalObserver 두 스트림(pending 2 · since 2 · 주문 먼저) · JournalStreamSpec · STRATEGY_STREAM · createStrategyWriter · frames.ts omitStrategy/fakeStrategyEventRecord
provides:
  - "두 스트림 경계 테스트 잠금 — 전략 갭 · 전략 overflow · strategy_resync+oldest 0 · 구 게이트웨이 0/0/false · 두 pending · 주문 먼저 · since epoch 짝 (단위 7 + 실 TCP 2)"
  - "전략 기록기 서술자 테스트 — 커서 칸 select · NULL 전략 칸 = 커서 없음 · dma_strategy_apply 재시도 · toStrategyEventRow · 모든 로그 stream:strategy"
  - "JournalHealth.strategy { lastSeq · headSeq · lagSeq · dbError · queueDepth } | null — /healthz 본문 전용 표시 신호(503 · 파생 상태 무관)"
  - "JournalStatusDeps.strategyWriter? · StatusObserverView.strategyHeadSeq · 부팅 결선 new JournalStatus({ observer, writer, strategyWriter })"
  - "supabase-stub: StubCursorRow 전략 칸 · KNOWN_PATHS /rest/v1/rpc/dma_strategy_apply"
affects: [25-03, 25-11, 25-12]

actuals:
  tokens: 8900
  tasks: 2
  commits: 3
plan_head_before: f9fef0e6df4094bd61651adbde45cce794eb85b2

tech-stack:
  added: []
  patterns:
    - "전략 스트림 관측값은 본문 전용 칸 — 파생 상태(#derive)는 주문 기록기만 본다(seqRegressions 와 같은 규율)"
    - "테스트 rig 에 선택형 전략 기록기 — 같은 fakeDb 위에 실제 createStrategyWriter, 미주입 rig 는 구 동작 그대로"

key-files:
  created: []
  modified:
    - relay/src/journal/types.ts
    - relay/src/journal/status.ts
    - relay/src/index.ts
    - relay/src/journal/observer.ts
    - relay/src/order/order-api.ts
    - relay/tests/journal-observer.test.ts
    - relay/tests/journal-writer.test.ts
    - relay/tests/journal-gateway.test.ts
    - relay/tests/journal-status.test.ts
    - relay/tests/journal-boot.test.ts
    - relay/tests/helpers/supabase-stub.ts
    - relay/tests/order-api.test.ts
    - docs/relay-operations.md

key-decisions:
  - "observer.ts 경계 로직은 고치지 않았다 — 25-01 이 이미 규칙(주문 먼저 · pending 2 · epoch 짝 since · 사유 문자열 4종)을 만족했다. 새 테스트가 실제로 잡는지는 변이 4종(epoch 가드 제거 · resync+oldest0 무시 · strategyCaughtUp 무시 · 전략 먼저 push)으로 확인 — 모두 1건씩 실패"
  - "JournalHealth.strategy 는 필수 키(값 null 허용) — 키 집합이 고정돼야 order-api 의 키 목록 단언 · smoke 가 흔들리지 않는다. 추가 게이트웨이(journalGateways.<키>)도 같은 9키"
  - "전략 기록기 health 이벤트는 구독하되 재평가 결과 불변 — 구독 줄을 생성자에서 #derive 호출보다 앞에 둬 파생 상태 구역에 strategyWriter 참조가 없게 했다(구역 한정 부정 grep)"

patterns-established:
  - "전략 스트림 운영 가시성 = 본문 칸 + 기록기 로그 stream:strategy — 503 은 주문 스트림 기준 유지(마이그레이션 전 배포의 장중 거짓 503 방지)"

requirements-completed: []

coverage:
  - id: D1
    description: "두 스트림 관찰자 경계 — since epoch 짝 · 두 pending · 구 게이트웨이 · 전략 갭(since 3) · 전략 overflow · 주문 먼저 · strategy_resync+oldest 0"
    verification:
      - kind: unit
        ref: "relay/tests/journal-observer.test.ts#두 스트림 (Phase 25)"
        status: pass
      - kind: other
        ref: "변이 4종(observer.ts) → 각 1 failed · git checkout 으로 원복"
        status: pass
    human_judgment: false
  - id: D2
    description: "전략 기록기 서술자 — select 'strategy_journal_epoch, strategy_last_seq' · NULL 칸 = 커서 없음 · dma_strategy_apply 재시도 같은 배치 · applied = toStrategyEventRow · 로그 stream strategy"
    verification:
      - kind: unit
        ref: "relay/tests/journal-writer.test.ts#전략 스트림 서술자 (Phase 25)"
        status: pass
    human_judgment: false
  - id: D3
    description: "실 TCP — omitStrategy 구 프레임 → strategyEvents [] · live / 로그인 strategy_resync+oldest 0 → 전략 기록기 비움 · 주문 커서 유지 · 다음 이벤트 수용"
    verification:
      - kind: integration
        ref: "relay/tests/journal-gateway.test.ts#⑦ · ⑧"
        status: pass
    human_judgment: false
  - id: D4
    description: "/healthz journal.strategy — 조립 · 미주입 null · 전략 dbError/적체는 live · 200 · 식별자 부재"
    verification:
      - kind: unit
        ref: "relay/tests/journal-status.test.ts#journal.strategy 전략 스트림 관측값 (Phase 25 · 503 판정 무관)"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-observer.test.ts#④ · ④b"
        status: pass
      - kind: integration
        ref: "relay/tests/order-api.test.ts#journal 필드 키는 9종 · 전략 스트림 적용 실패만으로는 503 이 아니다"
        status: pass
    human_judgment: false
  - id: D5
    description: "부팅 결선 — 실 relay 프로세스 → 80 전략 BuyOrder 1건 → dma_strategy_apply(p_gateway KB) → healthz journal.strategy.lastSeq 1 · unknownRequests 0 · SIGTERM 0"
    verification:
      - kind: integration
        ref: "relay/tests/journal-boot.test.ts#전략 이벤트 적용 결선 (Phase 25)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-29
status: complete
---

# Phase 25 Plan 02: 두 스트림 경계 · /healthz 전략 칸 Summary

**전략 이벤트 스트림의 갭 · resync · 구 게이트웨이 · 두 pending · 주문 먼저 · since epoch 짝을 FakeCodec 단위 7건 + 실 TCP 2건으로 잠그고(observer.ts 무수정 · 변이 4종으로 테스트 유효성 확인), `/healthz` 에 503 과 분리된 `journal.strategy` 칸을 더한 뒤 실 relay 프로세스가 전략 이벤트를 `dma_strategy_apply` 로 적용하는 부팅 결선을 증명했다.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-29T09:55:02Z
- **Completed:** 2026-09-29T10:05:04Z
- **Tasks:** 2
- **Files modified:** 13

## healthz 새 키 모양

```jsonc
"journal": {
  // … 기존 8키 그대로 …
  "strategy": { "lastSeq": 1, "headSeq": 1, "lagSeq": 0, "dbError": false, "queueDepth": 0 }
  // 전략 기록기 미주입 상태 요약이면 "strategy": null (키는 늘 있다)
}
```

- `lastSeq` = 전략 기록기 `lastAppliedSeq`, `headSeq` = 관찰자 `strategyHeadSeq`, `lagSeq` = max(head − last, 0) 또는 null
- `state` · 503(`journalAlerting`)은 주문 스트림 기준 그대로 — `strategy.dbError` · `queueDepth` 는 본문에만
- 추가 게이트웨이 `journalGateways.<키>` 도 같은 9키 + `alerting`

## 추가한 경계 테스트

- `journal-observer.test.ts` 「두 스트림 (Phase 25)」 — since epoch 짝(7 / 옛 epoch 0 / 미주입 0) · 두 pending · 구 게이트웨이 · 전략 갭(「전략 seq 갭」 · since 3 · 주문 커서 불변 · 로그 stream strategy) · 전략 overflow(「전략 큐 상한」) · 주문 먼저(「저널 seq 갭」 · 전략 큐 0 · 적용 0) · strategy_resync+oldest 0(비움 · 즉시 live · 다음 이벤트 수용)
- `journal-observer.test.ts` ④ `strategy: null` · ④b 전략 주입 healthz 값 · 식별자 부재 (`fetchHealthz` · `expectNoIdentifiers` 헬퍼)
- `journal-writer.test.ts` 「전략 스트림 서술자 (Phase 25)」 5건
- `journal-gateway.test.ts` ⑦ `omitStrategy: true` 구 프레임 · ⑧ strategy_resync+oldest 0 (FakeWriter 제네릭화 · 초기 커서 주입)
- `journal-status.test.ts` 「journal.strategy 전략 스트림 관측값」 5건
- `journal-boot.test.ts` 「전략 이벤트 적용 결선 (Phase 25)」
- `order-api.test.ts` 키 9종 · 전략 dbError/적체만으로 503 아님

## observer 수정 여부

없음(주석 한 줄만 — `strategyHeadSeq` getter 설명을 「25-02 예정」 → 「healthz journal.strategy.headSeq 원천」). Task 1 규칙은 25-01 action ⑦ 구현이 이미 만족했다.

## Task Commits

1. **Task 1: 두 스트림 경계 (단위 + 실 TCP)** — `697b8bda` (test)
   - 새 테스트가 바로 통과(25-01 이 구현) → TDD fail-fast 「unexpected GREEN」 조사: 기능 존재 확인 후 변이 4종으로 테스트가 규칙을 실제로 잡는지 증명(각 1 failed, 원복 후 git status 깨끗)
2. **Task 2: /healthz journal.strategy · 부팅 결선 (TDD)**
   - RED — `d608fd53` (test): 9 failed — `health().strategy` undefined, 부팅은 `dma_strategy_apply` 까지 오고 healthz `journal.strategy.lastSeq 1` 조건에서 멈춤
   - GREEN — `5db54e24` (feat): 72/72 · relay 전체 695 passed

## 검증 결과

| 명령 | 결과 |
|---|---|
| `vitest run tests/journal-observer.test.ts tests/journal-writer.test.ts tests/journal-gateway.test.ts` | 3 files · 54 passed |
| `vitest run tests/journal-observer.test.ts -t "두 스트림" --reporter=verbose` | 7 passed (22 skipped) |
| `vitest run tests/journal-status.test.ts tests/journal-observer.test.ts tests/journal-boot.test.ts` | 3 files · 72 passed |
| shared build → relay typecheck → typecheck:tests → relay 전체 test | exit 0 · error TS 0 · 29 files · 695 passed |
| 수용 기준 grep (Task 1 · 2 전부) | pass — `#onBatch`/`#onLogin` await 0 · `#derive()` 구역 strategyWriter 0 |

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 플랜 files 목록 밖 `relay/tests/order-api.test.ts` · `relay/src/order/order-api.ts` 갱신**
- **Found during:** Task 2 GREEN
- **Issue:** `JournalHealth.strategy` 가 필수 키가 되어 order-api 테스트의 `JournalHealth` 리터럴이 typecheck:tests 에서 깨지고, 키 목록 단언(8종)이 실패한다.
- **Fix:** 리터럴에 `strategy` 값 · 키 목록에 `"strategy"` 추가(9종) · 「전략 dbError/적체만으로 503 아님」 케이스 1건 추가 · order-api.ts JSDoc 「8키」→「9키」.
- **Files modified:** relay/tests/order-api.test.ts · relay/src/order/order-api.ts (주석만)
- **Commit:** 5db54e24

**2. [Rule 2 - 운영 가시성] `docs/relay-operations.md` 상태별 대응에 `journal.strategy` 판독 한 줄**
- **Found during:** Task 2
- **Issue:** healthz 에 새 칸이 생겼는데 운영 문서가 모르면 T-25-11(전략 영구 실패 → 전략 큐 상한 → 소켓 전체 끊김)의 원인 판독이 안 된다.
- **Fix:** 503 밖 표시 신호 · `dbError` = 마이그레이션 적용 여부 먼저 · `queueDepth` 적체 = 주문 기록도 멈춤 · 로그 `stream:"strategy"`.
- **Commit:** 5db54e24

**3. [TDD] Task 1 은 RED 없이 test 커밋 하나**
- 규칙이 25-01 에 이미 있어 새 테스트가 처음부터 통과했다. 플랜 action ② 가 「실패하는 경계가 있으면」 으로 이를 예상했다. 빈 feat 커밋 대신 변이 검사로 테스트 유효성을 증명했다(위 Task Commits).

---

**Total deviations:** 2 auto-fixed (Rule 3 ×1 · Rule 2 ×1) + TDD 해석 1. **Impact:** 스코프 변화 없음 — 키 추가에 따른 테스트 기대값 · 주석 · 운영 문서.

## Known Stubs

없음.

## Issues Encountered

None.

## User Setup Required

없음.

## Next Phase Readiness

- 전략 스트림 경계 · 가시성이 잠겼다 — 25-03 이후 플랜은 이 위에서 진행 가능
- 배포 순서는 변함없이 **원격 마이그레이션(25-11) → relay 배포(25-12)**. 순서가 뒤집히면 이제 `journal.strategy.dbError: true` · `queueDepth` 증가로 원인이 본문에 드러난다(503 은 나지 않는다)

## Self-Check: PASSED

- 수정 파일 13개 전부 존재 확인
- 커밋 `697b8bda` · `d608fd53` · `5db54e24` 전부 `git log --all` 에 있음
- 플랜 `<verification>` 재실행: relay 전체 test · typecheck green · 수신 경로 await 추가 0
