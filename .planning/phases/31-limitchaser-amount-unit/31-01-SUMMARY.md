---
phase: 31-limitchaser-amount-unit
plan: 01
subsystem: trading
tags: [limit-chaser, flatbuffers, zod, relay, webapp, shared, amount-unit, tdd]
status: complete

requires:
  - phase: 31-limitchaser-amount-unit
    provides: "31-CONTEXT D-01·D-02·D-06·D-10·D-11·D-12 · RESEARCH §계약 정본 · UI-SPEC 예시 수치 정정 표"
provides:
  - "shared lc-amount.ts — §10 환산 한 벌(qtyFromAmount · narrowQty · amountFromQty BigInt 폴백 · amountOrDerive) · LC_AMOUNT_PAIRS 8쌍 · echoAmountOf · qtyForSubmit · amountEchoMatches"
  - "RelayLimitChaser 금액 8필드(만원 · 양방향 · 보관/에코만)"
  - "relay lc.set zod 금액 8필드 UIntSchema.optional · 10 조립 add*Amount(?? 0) · 60/64 파서 8필드"
  - "webapp 매도 「매수잔량」 만원 한 칸(단위 「만」) · buildCfg/armBlockOf(values, server) · 성공 판정 짝 기준 · PadUnit 「만」"
  - "webapp 나머지 7칸 금액은 에코 적용값 통과(입력 전환은 31-04)"
affects: [31-02, 31-03, 31-04, 31-05, 31-06, 31-07]

actuals:
  tokens: 34245
  tasks: 3
  commits: 4
plan_head_before: a2bd38d7e5fcbc10d546b0125baa91d36eb45d68
plan_head_after: 6d7d3cc660e05a8d70178edffcee834d7fa5921d

tech-stack:
  added: []
  patterns:
    - "에코 메모를 상태로 두지 않고 server 에코에서 매번 다시 계산(echoAmountOf) — 폼 기준값이 늘 formFromServer(server) 라 C# _echoQtyMemo 와 같은 불변식"
    - "금액↔주 쌍 표 한 벌(LC_AMOUNT_PAIRS · as const satisfies) 을 shared · relay 테스트 · webapp 이 같이 읽는다"
    - "relay 와이어는 금액 선택(부재 = 0), shared 입력 계약은 필수 — 「shared 는 새 클라 계약 · relay 는 구 탭 관용」 규약 유지"

key-files:
  created:
    - packages/shared/src/lc-amount.ts
    - packages/shared/src/__tests__/lc-amount.test.ts
  modified:
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - relay/src/ws/protocol.ts
    - relay/src/dma/envelope.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/fanout.test.ts
    - relay/tests/protocol.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/lc-ranges.ts
    - webapp/src/lib/numpad.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/test-fixtures/limit-chaser.ts
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/lib/__tests__/numpad.test.ts
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx

key-decisions:
  - "D-10 「에코 원값」 = echoAmountOf(...).shown(에코가 그 칸에 쓴 값) — C# s.SellWatchAmount = (uint)칸.Value 동형. 추적 OFF·짝이면 원값, 추적 ON 이면 기준선 역산"
  - "구 서버 성공 판정 = 에코 주 = 보낸 주 ∧ (에코 금액 = 보낸 금액 ∨ 0). 보내기 전 no-op 은 echoAmountOf(...).shown === 값"
  - "금액 필드 in-flight · 실패 기록에 실은 짝 주(sentQty)를 함께 둔다 — 늦은 에코도 짝 판정"
  - "자동 체크(groupAutoChecksOf)는 ① 에서 채운 매도 비교가로 환산한 주를 본다 — 비교가 0 ∧ 상한가 미수신이면 매도 두 체크도 「매도 매수잔량 0」(C# 「가격 채움 뒤 환산 주」 동형)"
  - "groupAutoChecksOf 의 server 인자는 laid 뒤 5번째 선택 인자(기존 기본값 인자 순서 보존)"

patterns-established:
  - "제출 주 산출은 shared qtyForSubmit 한 곳 — 화면 · 무장 판정(canArmOf/canArmStaticOf) · cfg(buildCfg) · 자동 체크가 같은 호출"
  - "isMasterOnlyDelta 의 쌍 키 비교는 에코 원값이 아니라 에코 적용값(금액 = shown · 주 = 메모 주)"

requirements-completed: [AMT-02, AMT-04]

coverage:
  - id: D1
    description: "트레이서 — 매도 「매수잔량」 1000만 @12,870원 확정 → lc.set(1000 · 777) → relay zod → 10 → 60 에코 → lc 프레임 → 행 「1,000만」"
    requirement: "AMT-02"
    verification:
      - kind: integration
        ref: "relay/tests/fanout.test.ts#P31 트레이서 — lc.set 금액 → 10 → 60 에코 → lc (D-10 · D-11)"
        status: pass
      - kind: automated_ui
        ref: "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx#P31 트레이서 — 매도 「매수잔량」 만원 한 칸"
        status: pass
    human_judgment: false
  - id: D2
    description: "C# 원값 에코(100만 · 77주)에서 다른 칸 확정 시 cfg 금액 100 · 주 77 유지(0 을 지어내지 않음) · 추적 ON 은 기준선 1554 되싣기(래칫 보존)"
    requirement: "AMT-02"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx#P31 ③ · ④"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#P31 매도 추적 ON 에코 — cfg 주는 기준선(래칫 보존)"
        status: pass
    human_judgment: false
  - id: D3
    description: "§10 환산 한 벌 — 정정표 수치 · narrowQty int.MaxValue 경계 · BigInt 역산 정밀도 · amountOrDerive 짝 · echoAmountOf · qtyForSubmit · amountEchoMatches · LC_AMOUNT_PAIRS 8쌍"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/lc-amount.test.ts (48 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "relay 금액 8필드 계약 — zod 선택(부재 통과 · -1/1.5/문자열 위반 · buy3 파생 무관) · 10 조립 8필드 왕복 · 부재 = 0 + 슬롯 부재 · readLimitChaser 8필드/구 에코 0"
    requirement: "AMT-02"
    verification:
      - kind: unit
        ref: "relay/src/dma/__tests__/envelope.test.ts#P31 SetLimitChaser 금액 8필드"
        status: pass
      - kind: unit
        ref: "relay/tests/protocol.test.ts#P31 lc.set 금액 8필드 선택 (D-11)"
        status: pass
    human_judgment: false
  - id: D5
    description: "구 gh-trade 서버 에코(금액 0 · 주 일치)도 확정 성공 — 실패 말풍선 없음 · isMasterOnlyDelta 순수 델타 true"
    requirement: "AMT-02"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#P31 금액 필드 짝 판정"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#P31 구 서버 에코(금액 8 모두 0 · 주는 값 있음)로 만든 마스터 OFF cfg 도 순수 델타 true"
        status: pass
    human_judgment: false
  - id: D6
    description: "실서버(gh-trade feature/limitchaser-amount-unit 배포 뒤) 금액 에코 왕복 · 실브라우저 e2e(매도 매수잔량 의미 변경)"
    requirement: "AMT-02"
    verification: []
    human_judgment: true
    rationale: "gh-trade 서버 배포 · e2e 는 31-07/31-08 과 메인 세션 몫(이 플랜은 배포 금지 · 단위/통합 테스트까지만)"

duration: 21min
completed: 2026-10-11
---

# Phase 31 Plan 01: 매도 「매수잔량」 만원 트레이서 + lc.set 금액 8필드 계약 Summary

**shared §10 환산 한 벌(lc-amount.ts · gh-trade LimitChaserForm.cs 이식)과 금액 8필드 계약(shared 타입 · relay zod/조립/파서)을 닫고, 매도 「매수잔량」 한 칸을 만원 입력으로 바꿔 행 → lc.set(1000만 · 777주) → relay → 10 → 60 에코 → 행 「1,000만」 까지 한 경로로 증명했다 — C# 원값 보존 · 추적 ON 래칫 보존 · 구 서버 에코 성공 포함.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-10-11T13:48:03Z
- **Completed:** 2026-10-11T14:09:09Z
- **Tasks:** 3 (Task 1 tracer · Task 2 TDD RED/GREEN · Task 3)
- **Files modified:** 25 (신규 2)

## Accomplishments

- **shared `lc-amount.ts`** — `qtyFromAmount`(내림) · `narrowQty`(int.MaxValue 클램프) · `amountFromQty`(`(주×가격+5000)÷10000` · 2^53 초과 시 BigInt) · `amountOrDerive`(짝이면 원값) · `LC_AMOUNT_PAIRS` 8쌍(D-01 순서 · 그룹 비교가 · 매도/취소만 track/baseline) · `echoAmountOf` · `qtyForSubmit` · `amountEchoMatches`. 부동소수 반올림 함수 0.
- **계약** — `RelayLimitChaser` 금액 8필드(각 짝 주 뒤 · `LIMIT_CHASER_SERVER_*_FIELDS` 불변) · relay `lc.set` zod 8필드 `UIntSchema.optional()`(12필드 블록 밖) · `buildSetLimitChaserReq` 의 `add*Amount(toWireUint(cfg.X ?? 0))` 8줄 · `readLimitChaser` 8필드(구 서버 0).
- **webapp 트레이서 칸** — 폼 키 `sellWatchQty` → `sellWatchAmount`(단위 「만」 · 행 id `lc-sell-watch-qty` 유지) · `buildCfg(values, server)` 가 `qtyForSubmit` 으로 제출 주 산출 · `canArmOf/canArmStaticOf/armBlockOf` 가 같은 환산 주를 본다 · `groupAutoChecksOf` 는 채운 비교가로 환산.
- **성공 판정 짝 기준(Pitfall 1)** — 훅이 금액 필드는 `amountEchoMatches`(in-flight · 늦은 에코 · 실패 회수), no-op 은 `echoAmountOf(...).shown` 로 본다. `isMasterOnlyDelta` 는 쌍 키를 에코 적용값과 비교(Pitfall 2).
- **7칸 과도 상태** — `formFromServer` 가 `LC_AMOUNT_PAIRS` 루프로 금액 8키를 채워 cfg 에 에코 적용값이 그대로 실린다(입력 전환은 31-04). `defaultLimitChaserForm` 금액 8키 0(D-12).
- `PadUnit` 「만」 · `PAD_CHIPS['만']` = 만원 칩 배열 공유.

## Task Commits

1. **Task 1 (tracer): 매도 매수잔량 만원 한 칸 끝에서 끝까지** — `9b852bc6` (feat) — Tracer feedback gate: end-of-phase + automated-only `<verify>` 재실행 통과(relay P31 2 · webapp P31 4) → 확장 진행
2. **Task 2 (TDD): 금액 8필드 계약 완성**
   - RED `eaf6a980` (test) — `lc-amount.test.ts` 대상 「8쌍이다」 실패 · relay P31 12건 실패
   - GREEN `14e625a7` (feat)
3. **Task 3: webapp 7칸 통과 · 테스트 갱신** — `6d7d3cc6` (feat)

## TDD Gate Compliance (Task 2)

- **RED:** `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts -t "8쌍이다" --reporter=tap-flat` → exit 1 · `expected 1 to be 8`. `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK** (`target_test_failed`, matched_test = 「P31 LC_AMOUNT_PAIRS — 8쌍 표 한 벌 … > 8쌍이다」).
  - semanticAssessment: 대상 테스트가 실행됐고 계획한 단언(8쌍)에서 실패 — import · 구문 · 픽스처 오류 아님. 전체 실행 첫 RED 는 7쌍 부재 한 원인으로 8건 실패(나머지 39건은 Task 1 이 이미 구현한 환산 함수라 통과).
  - 첫 증거 기록(전체 파일 실행)은 vitest tap-flat 의 다줄 actual/expected 가 「Malformed TAP」 로 `invalid_record` 였다 → 스칼라 단언 「8쌍이다」 를 대상 테스트로 더해 재실행(같은 커밋에 포함).
- **GREEN:** `14e625a7` — shared 48 · relay envelope/protocol/fanout 369 통과.
- **REFACTOR:** 없음.

## Files Created/Modified

- `packages/shared/src/lc-amount.ts` — §10 환산 한 벌 · 쌍 표 · 에코 메모 · 짝 판정(신규)
- `packages/shared/src/__tests__/lc-amount.test.ts` — 정정표 · 경계 · 정밀도 · 쌍 표 · 에코 · 제출 · 짝 48건(신규)
- `packages/shared/src/relay.ts` — `RelayLimitChaser` 금액 8필드 · `buyOrderAmount` 주의 문단 한 줄
- `packages/shared/src/index.ts` — `export * from "./lc-amount"`
- `relay/src/ws/protocol.ts` — lc.set 금액 8필드 선택 zod
- `relay/src/dma/envelope.ts` — `LcAmountKey` · `LcSetCfg` 선택 재부착 · 조립 8줄 · 파서 8필드
- `relay/tests/helpers/{frames,fake-gateway}.ts` — 금액 8필드(+ 10 디코드 `sellWatchQty`)
- `relay/tests/{fanout,protocol}.test.ts` · `relay/src/dma/__tests__/envelope.test.ts` — P31 케이스 · lc 키 개수 69 → 77
- `webapp/src/lib/limit-chaser.ts` — Omit `sellWatchQty` · 기본값 · formFromServer 금액 루프 · isMasterOnlyDelta 쌍 키 · groupAutoChecksOf server · `SELL_WATCH_PAIR`
- `webapp/src/lib/{lc-ranges,numpad}.ts` — `sellWatchAmount` 범위 0~999,999,999 · `PadUnit` 「만」
- `webapp/src/components/trading/lc/lc-fields.ts` — 매도 매수잔량 행 금액 · 단위 「만」 · 설명 「이 금액보다」
- `webapp/src/components/trading/limit-chaser-form.tsx` — `sellWatchSubmitQtyOf` · buildCfg/canArm/armBlockOf server 인자
- `webapp/src/components/trading/lc/use-lc-field-commit.ts` — `serverHolds` · `echoConfirms` · `sentQty` 기록 · 옵션 시그니처
- `webapp/src/test-fixtures/limit-chaser.ts` — 금액 8필드 0(38개)
- webapp 테스트 7개 — 위 key-files 참조

## Decisions Made

- D-10 「에코 원값」 해석 = `echoAmountOf(...).shown`(C# 동형) — 플랜 가정 그대로.
- 구 서버 성공 판정 = 주 일치 ∧ (금액 일치 ∨ 에코 금액 0) — 플랜 가정 그대로. 보내기 전 no-op 은 에코 적용값.
- 금액 필드의 보낸 짝 주(`sentQty`)를 in-flight · 실패 기록(`LcCommitFailure.sentQty` 선택 필드)에 둔다 — 늦은 에코의 짝 판정용.
- `groupAutoChecksOf(gate, values, upperLimit, laid, server)` — server 는 기본값 인자 `laid` 뒤 선택 인자.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] relay 10 디코드 헬퍼에 `sellWatchQty` 추가**
- **Found during:** Task 1
- **Issue:** 플랜 (a) 가 10 디코드의 `sellWatchQty: 777` 을 단언하는데 `SetLimitChaserRequest` 에 그 필드가 없었다.
- **Fix:** `fake-gateway.ts` `SetLimitChaserRequest` · `readSetLimitChaserRequest` 에 `sellWatchQty` 를 금액과 함께 더함.
- **Committed in:** `9b852bc6`

**2. [Rule 1 - Bug] 기존 lc · cfg 키 개수 단언 갱신(relay 69 → 77 · webapp cfg 50 → 58)**
- **Found during:** Task 2 · Task 3
- **Issue:** 플랜은 「⑰-buy3」 한 곳만 지목했지만 envelope.test 11곳 · fanout.test 5곳 · limit-chaser-form.test 3곳 · lc-tracer 2곳이 같은 키 개수를 단언한다.
- **Fix:** 금액 8필드 합류로 개수 갱신 · `expectCleanCfg` EXPECTED_KEYS 에 금액 8키.
- **Committed in:** `14e625a7` · `6d7d3cc6`

**3. [Rule 1 - Bug] lc-amount 테스트 역산 기대값 산수 오류 정정**
- **Found during:** Task 2 GREEN
- **Issue:** 테스트에 388주 → 500만 · 1165주 → 1500만 으로 적었으나 정확한 반올림 역산은 499만 · 1499만(500만 → 388주 → 499만 왕복 손실 — gh-trade 문서 「왕복에서 몇 주 어긋날 수 있다」).
- **Fix:** 기대값 499 · 1499 로 정정(구현은 C# 식 그대로).
- **Committed in:** `14e625a7`

**4. [Rule 1 - Bug] 자동 체크 · 무장 판정 픽스처를 만원 의미로 갱신(목록 밖 1파일 포함)**
- **Found during:** Task 3
- **Issue:** 매도 비교가 0 · `sellWatchQty: 10` 에코 픽스처는 금액 0 이라 상한가 채움 뒤 환산 0주 → 매도 3체크가 「매도 매수잔량 0」 으로 빠진다(C# 「가격 채움 뒤 환산 주」 동형의 새 행동).
- **Fix:** 해당 픽스처에 `sellWatchAmount: 1000`(비교가 0 → 원값 · 150,800원 채움 뒤 66주), 0 케이스는 `sellWatchAmount: 0` 명시. 「상한가 0(미수신)」 케이스 기대값은 매도 두 체크도 「매도 매수잔량 0」 으로 갱신. 목록 밖: `webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx`(R3-WR-01 픽스처 한 줄).
- **Committed in:** `6d7d3cc6`

---

**Total deviations:** 4 auto-fixed (1 blocking · 3 bug/test-sync)
**Impact on plan:** 전부 계약 합류에 따른 테스트 동기화 · 헬퍼 보강. 범위 확장 없음. 31-02 소유 파일 · component 소스는 건드리지 않았다.

## Behavior change to note (검증자 · 31-06 참고)

- 상한가 미수신(0) ∧ 매도 비교가 0 에서 선매수 · 줄매수를 켜면 종전에는 매도>잔량추적 · 매도>체결이 켜졌지만 이제는 「매도 매수잔량 0」 으로 켜지지 않는다 — 만원 칸은 비교가 없이 주로 환산할 수 없어서다(C# 동형 · relay 프레임 전체 거부 회피).
- 매도 매수잔량 행 값이 주가 아니라 만원이다(구 서버 에코면 주 역산 · 추적 ON 이면 기준선 역산 — 「잔량추적 기준선」 파생 행과 같은 값이 두 번 보일 수 있음 · UI-SPEC 문구 정리는 후속 플랜).

## Issues Encountered

- vitest `tap-flat` 리포터의 다줄 YAML 이 TDD RED 분류기에서 `Malformed TAP` — 스칼라 대상 테스트로 해결(위 TDD 절).

## Known Stubs

- `webapp/src/lib/limit-chaser.ts` `SELL_WATCH_PAIR` · `limit-chaser-form.tsx` `sellWatchSubmitQtyOf` — 매도 매수잔량 한 쌍만 산출하는 과도 상태. 의도적이며 31-04 가 `LC_AMOUNT_PAIRS` 8쌍 루프로 넓힌다(플랜 명시). 나머지 7칸은 입력이 주이고 금액은 에코 적용값 통과(배포 없음 · 브랜치 전용).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 31-02 ~ 31-06 이 쓰는 shared 환산 한 벌 · 쌍 표 · relay 계약이 준비됐다. 31-04 는 `SELL_WATCH_PAIR` 한 쌍 경로를 8쌍 루프로 넓히면 된다.
- 검증: shared typecheck · 567 tests / relay typecheck · typecheck:tests · 1533 tests / webapp typecheck · 3901 tests 전부 통과. E2E 는 31-07.
- 배포 · push 없음(지시대로).

---
*Phase: 31-limitchaser-amount-unit*
*Completed: 2026-10-11*
