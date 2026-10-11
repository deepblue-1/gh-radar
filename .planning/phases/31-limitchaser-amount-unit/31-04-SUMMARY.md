---
phase: 31-limitchaser-amount-unit
plan: 04
subsystem: trading
tags: [limit-chaser, webapp, amount-unit, manwon, tdd, react]
status: complete

requires:
  - phase: 31-limitchaser-amount-unit
    provides: "31-01 shared lc-amount.ts(LC_AMOUNT_PAIRS · qtyForSubmit · echoAmountOf · amountFromQty · LC_AMOUNT_MAX_MANWON) · 매도 매수잔량 한 쌍 트레이서 · 훅 짝 판정(lcAmountPairOf 8쌍)"
  - phase: 31-limitchaser-amount-unit
    provides: "31-03 seedFromUserSettings 선택 키 부재 폴백 한 줄(보존)"
provides:
  - "LimitChaserFormValues 에서 주 8키 제외 — 수량 8칸이 전부 만원 키(D-01)"
  - "lcSubmitQtyOf(values, 금액 키, server, price?) — 제출 주 산출 한 함수(cfg · 무장 판정 · 자동 체크 공용)"
  - "buildCfg 의 LC_AMOUNT_PAIRS 8쌍 루프 — 에코 메모 되싣기 · 비교가 변경 시 내림 재계산(D-02 · D-10)"
  - "seedListSharesDefaults(상장주식수, 매수 비교가, 매도 비교가) 만원 시딩 · 비교가 0 미룸 · 999,999,999 Clamp(D-12 · Pitfall 9)"
  - "LC_FIELD_RANGES 금액 8칸 0~999,999,999"
  - "lcAmountZeroWordOf(field) — 줄매수 최대 「무제한」 · 최소 「1주」 · 후매수 최소 「없음」"
  - "수량 8행 금액 키 · 단위 「만」 · 시트 설명 「이 금액」 · 접힌 요약 kv 만원 · 발동잔량/해제선 매수 비교가 역산"
affects: [31-05, 31-06, 31-07]

actuals:
  tokens: 41300
  tasks: 3
  commits: 4
plan_head_before: 0635b4d1cbf2e08c2b5566c9c4cc685a56dec852
plan_head_after: dfe53856e1010671214451fbb03c62c070574ed4

tech-stack:
  added: []
  patterns:
    - "제출 주는 lcSubmitQtyOf 한 함수 — 그룹 비교가는 쌍 표(pair.price)가 정하고, 자동 체크만 ① 에서 채운 매도 비교가를 price 인자로 넘긴다"
    - "상장주식수 시딩 이펙트는 C# 순서(상장주식수 0 → 서버 전략 소진 → 비교가 0 미룸)로 가드한다"

key-files:
  created: []
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/lc-ranges.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx

key-decisions:
  - "31-01 의 임시 SELL_WATCH_PAIR · sellWatchSubmitQtyOf 를 지우고 lcSubmitQtyOf(values, 금액 키, server, price?) 한 함수로 일반화했다 — buildCfg 루프 · canArm · 자동 체크가 같은 호출"
  - "상장주식수 시딩 이펙트는 서버 전략이 있으면 비교가 판정보다 먼저 가드를 소진한다(C# _lastApplied 분기 순서 동형)"
  - "lcValueTextOf 는 수량 칸 의미어를 주지 않는다 — 위 줄은 0 도 「0만」, 의미어는 lcAmountZeroWordOf(요약 · 31-06 아래 줄)"
  - "접힌 요약의 발동잔량 · 해제선 역산은 에코의 매수 비교가(server.buyWatchPrice)로 한다 — 0 이면 주 원값"

patterns-established:
  - "테스트 에코 픽스처의 수량 임계 칸은 금액 원값 + qtyFromAmount 짝 주를 싣는다(새 gh-trade 에코 모양) — 구 서버 경로는 금액 0 을 명시해 따로 잠근다"

requirements-completed: [AMT-02, AMT-04]

coverage:
  - id: D1
    description: "폼 값 모델 — 주 8키 제외 · 금액 8칸 기본 0 · 상장주식수 만원 시딩(비교가 0 미룸 · 매도 비교가 0 이면 매도 체결 생략 · 999,999,999 Clamp) · 자동 체크 환산 주"
    requirement: "AMT-02"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/limit-chaser.test.ts#P31 수량 8칸 만원 — 기본 0 · 상장주식수 만원 시딩 · 자동 체크 환산 주 (7 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildCfg 8쌍 조립 — C# 원값 에코 8칸 되싣기 · 비교가 13,000 변경 뒤 769주 재계산 · 취소 추적 ON 기준선 되싣기"
    requirement: "AMT-02"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#P31 수량 8칸 만원 (a) · (b) · (e)"
        status: pass
    human_judgment: false
  - id: D3
    description: "줄매수 사전 검증 최소>최대 금액끼리 · 상장주식수 시딩 이펙트 비교가 가드(비교가 들어온 뒤 시딩)"
    requirement: "AMT-02"
    verification:
      - kind: automated_ui
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#P31 수량 8칸 만원 (c) · (d)"
        status: pass
    human_judgment: false
  - id: D4
    description: "8칸 성공 판정 짝 기준 — 선매수 매도잔량 · 취소 매수잔량 확정 뒤 구 서버 에코(금액 0 · 주 일치) = 성공 · 주 불일치는 실패(sentQty 기록)"
    requirement: "AMT-02"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#P31 수량 8칸 짝 판정 (3 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "행 스펙 · 요약 — 8행 단위 「만」 · 범위 0~999,999,999 · 시트 설명 「이 금액」 · lcAmountZeroWordOf · 요약 S7 8상태(populated · empty · error · partial · overflow · zero-one-many · long-text · loading)"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/lc-fields.test.ts#P31 S7 (62 passed)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/setting-group.test.tsx#라벨 · 단위 · 시트 설명 (79 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "요약 줄 시각 폭(「999,999,999만」 이 옛 최악값과 같은 폭) · 「0만」 위 줄만 보이는 과도 상태의 사용감"
    verification: []
    human_judgment: true
    rationale: "폭 · 시각 판단은 단위 테스트가 글자만 잠근다 — 실제 밴드 렌더는 31-07 e2e · 사람 확인 몫. 아래 줄 의미어는 31-06 이 얹는다"

duration: 19min
completed: 2026-10-11
---

# Phase 31 Plan 04: 수량 8칸 만원 입력 전환 Summary

**상따 수량 8칸 전부를 만원 키로 편집하고, buildCfg 가 LC_AMOUNT_PAIRS 8쌍마다 shared qtyForSubmit(에코 메모 · 그룹 비교가)으로 주를 산출 — 옛 주 기본값은 0 으로 버리고 상장주식수 시딩 · 자동 체크 · 사전 검증 · 접힌 요약까지 만원 의미로 맞췄다**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-11T14:39:54Z
- **Completed:** 2026-10-11T14:59:03Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- 폼 값 모델에서 주 8키를 빼고 금액 8칸 기본값을 0 으로 했다. 옛 주 기본값 10,000 · 30,000 · 10 · 100,000 은 옮기지 않고 버렸다(D-12 · gh-trade D-24).
- `buildCfg` 가 8쌍 루프로 주를 산출한다. C# 원값 에코에서 아무 칸을 확정해도 8 금액 · 8 주가 에코 그대로 되실린다(D-10). 비교가를 바꾸면 내림으로 다시 계산한다.
- 상장주식수 시딩은 만원이다. 매수 비교가가 0 이면 가드를 남기고, 비교가가 들어온 뒤 채운다(Pitfall 9). 매도 비교가가 0 이면 매도 체결 칸만 건너뛴다. 값은 999,999,999 에서 멈춘다.
- 자동 체크의 「취소 매수잔량 0」 · 「매도 체결 0」 은 상한가로 채운 매도 비교가의 환산 주로 판정한다(Pitfall 8 · 토큰 글자 불변).
- 줄매수 최소>최대 사전 검증은 금액끼리 비교한다(C# 동형 · 문구 불변).
- 수량 7행을 금액 키 · 단위 「만」 · 시트 설명 「이 금액」 으로 바꿨다. 행 id · 시트 제목은 그대로다. 8행 모두 0~999,999,999 범위를 펼친다.
- 접힌 카드 요약 kv 를 만원으로 바꿨다. 금액 0 이면 의미어를 쓰고, 발동잔량 · 해제선은 매수 비교가로 역산한다(비교가 0 이면 주 원값).

## Task Commits

1. **Task 1 RED: 폼 값 모델 실패 테스트** - `eca4b6c7` (test)
2. **Task 1 GREEN: 주 키 제외 · 기본 0 · 만원 시딩 · 환산 주 자동 체크 · 범위** - `3cbe7fc5` (feat)
3. **Task 2: cfg 8쌍 조립 · 행 스펙 · 금액끼리 최소>최대 · 시딩 비교가 가드 · 요약** - `c60a750f` (feat)
4. **Task 3: 단위 테스트 갱신 · 8칸 되싣기 · 짝 판정 회귀** - `dfe53856` (test)

## TDD Gate Compliance (Task 1)

- **RED** — `eca4b6c7`. P31 describe 7건이 전부 어서션 실패로 떨어졌다(구 기본값 · 구 시그니처 · 구 주 키 판정). `gsd-tools check tdd-red-evidence` 결과는 `RED_EVIDENCE_OK`(target_test_failed)다. 대상은 「아주 큰 상장주식수 · 비교가는 각 칸이 999,999,999 에서 멈춘다(C# Clamp)」 · expected 999999999 · actual undefined 이고, 실패 원인은 구 시그니처가 주 키를 돌려준 것이다. 의도한 이유의 실패임을 확인했다. 다줄 diff 어서션은 TAP YAML 이 Malformed 로 분류돼 스칼라 어서션 대상을 골랐다(31-01 과 같은 우회).
- **GREEN** — `3cbe7fc5`. limit-chaser.test.ts 137 passed · P31 7 passed.
- **REFACTOR** — 따로 하지 않았다.

## Files Created/Modified

- `webapp/src/lib/limit-chaser.ts` — Omit 주 8키 · `lcSubmitQtyOf` · 기본값 금액 0 · `seedListSharesDefaults` 3인자 만원 · 84 시딩 표에서 `postBuyFloorQty` 제거 · 자동 체크 환산 주 · `formFromServer` 주 7줄 제거 · `SELL_WATCH_PAIR` · `UINT32_MAX` 제거
- `webapp/src/lib/lc-ranges.ts` — 금액 8칸 `AMOUNT_MANWON` 범위 · 줄매수 주 uint32 제거
- `webapp/src/components/trading/limit-chaser-form.tsx` — `buildCfg` 8쌍 루프 · `sellWatchSubmitQtyOf` 제거 · 사전 검증 금액끼리 · 시딩 이펙트 비교가 가드
- `webapp/src/components/trading/lc/lc-fields.ts` — `LcNumField` 금액 키 · 7행 「만」 · 「이 금액」 · `lcAmountZeroWordOf` · `lcValueTextOf` 옛 의미어 제거 · 요약 `amountKv` · `buyQtyKv`
- 테스트 7개 — 위 key-files 참조

## Decisions Made

- `SELL_WATCH_PAIR` · `sellWatchSubmitQtyOf`(31-01 임시)를 `lcSubmitQtyOf(values, 금액 키, server, price?)` 로 일반화했다. 테스트 2곳(limit-chaser.test · use-lc-field-commit.test)이 쓰던 임시 상수도 함께 바꿨다.
- 시딩 이펙트의 가드 순서는 C# 을 따른다. 상장주식수 0 이면 미소진, 서버 전략이 있으면 소진, 매수 비교가 0 이면 미소진 순이다.
- 31-03 의 `seedFromUserSettings` 선택 키 부재 폴백 한 줄은 그대로 뒀다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 테스트 에코 픽스처를 금액 짝 모양으로 갱신**
- **Found during:** Task 3
- **Issue:** `limit-chaser-form.test.tsx` 의 기본 에코는 주만 있고 금액이 0 이었다. 그래서 수량 칸이 「130,000만」 같은 역산값으로 섰고, 기존 단언(「10,000주」 · 취소 10주)의 의미가 사라졌다. 또 매도 비교가 0 픽스처(strategy-card-flow R3-WR-01)에서는 취소 · 매도 체결 금액 0 이 환산 0주가 돼 자동 체크가 빠졌다.
- **Fix:** 기본 에코에 금액 원값과 `qtyFromAmount` 짝 주를 넣었다(선매수 매도잔량 10,000만 · 체결량 30,000만 · 매도 체결 30,000만 · 취소 1,000만). R3-WR-01 픽스처에는 `sellMinTradeAmount: 500` · `cancelWatchAmount: 1000` 을 넣었다. 구 서버 경로는 금액 0 을 명시한 별도 단언으로 남겼다(91,000만 역산).
- **Committed in:** `dfe53856`

**2. [Rule 3 - Blocking] P31 (b) 테스트의 답 신호 프로토콜**
- **Found during:** Task 3
- **Issue:** 에코와 답 신호를 한 rerender 에 같이 넘기면 훅 장벽(⑦ — 서버 값이 바뀐 렌더 뒤 증가를 기다린다)에 걸려 다음 확정이 대기에 섰다. 제품 버그가 아니라 테스트 순서 문제였다.
- **Fix:** 다른 테스트와 같이 에코 렌더와 답 신호 렌더를 둘로 나눴다.
- **Committed in:** `dfe53856`

---

**Total deviations:** 2 auto-fixed (1 bug/test-sync · 1 blocking)
**Impact on plan:** 테스트 동기화뿐이다. 소스 범위 확장은 없다. `use-lc-field-commit.ts` · `setting-group.tsx` · 31-03 · 31-05 소유 파일은 건드리지 않았다. 목록에 있는 `inline-navigation.test.tsx` · `lc-tracer.test.tsx` 는 고칠 필요 없이 통과했다.

## Behavior change to note (검증자 · 31-06 · 31-07 참고)

- 수량 칸 0 의 행 위 줄은 이제 「0만」 이다. 옛 「무제한」 · 「1주」 · 「없음」 은 행에서 빠졌고, 31-06 이 두 줄 행 아래 줄로 다시 얹는다. 접힌 요약은 이미 의미어를 쓴다. 시트 「지금 ○○」 도 「지금 0만」 이다.
- 새 폼의 후매수 최소는 31-06 이 84 `postBuyFloorAmount` 시딩을 더할 때까지 0 이다(웨이브 사이 과도 상태 · 플랜 명시). 84 의 봉인 주 `postBuyFloorQty` 는 더 이상 폼에 시딩하지 않는다.
- 상한가 미수신(매수 비교가 0)인 새 폼은 상장주식수가 와도 시딩하지 않는다. 비교가가 생긴 뒤 채운다(C# 동형).
- e2e(trading-workbench 등)의 수량 칸 기대는 주 기준이라 31-07 에서 만원으로 바뀐다(정상).

## Known Stubs

- 위 과도 상태 둘(행 아래 줄 의미어 · 84 후매수 최소 시딩)은 같은 phase 의 31-06 이 닫는다. 코드 스텁(TODO · 플레이스홀더)은 없다. 같은 phase 안의 계획된 전이라 WINDOWS 원장에는 올리지 않았다.

## Issues Encountered

- vitest `tap-flat` 다줄 YAML 이 RED 분류기에서 Malformed 로 나왔다. 스칼라 어서션 대상으로 해결했다(31-01 과 같다).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 31-05(주문로그 · 타임라인)와 31-06(두 줄 행 · 시트 안내 · 등록 차단 · 84 후매수 최소 시딩)이 쓸 폼 · cfg 데이터 층이 준비됐다. `lcAmountZeroWordOf` · `lcSubmitQtyOf` 가 아래 줄과 시트 안내의 원천이다.
- 검증: shared build · webapp typecheck(e2e tsconfig 포함) exit 0 · webapp 3944 passed / 1 skipped(165 files) · P31 필터 13 passed.
- 배포 · push 는 하지 않았다(지시대로).

---
*Phase: 31-limitchaser-amount-unit*
*Completed: 2026-10-11*

## Self-Check: PASSED

- 파일: `webapp/src/lib/limit-chaser.ts` · `webapp/src/lib/lc-ranges.ts` · `webapp/src/components/trading/lc/lc-fields.ts` · `webapp/src/components/trading/limit-chaser-form.tsx` — FOUND
- 커밋: `eca4b6c7` · `3cbe7fc5` · `c60a750f` · `dfe53856` — HEAD 조상 FOUND · `check evaluation-scope --plan 31-04 --commits-only` resolved(4 commits)
- 수용 기준: Task 1 grep(DEFAULT_* 0 · 시그니처 1줄 · `'postBuyFloorQty'` 1) · Task 2 grep(LC_AMOUNT_PAIRS · `unit: '주'` 7→0 · lcAmountZeroWordOf · 「이 금액 이하로 줄면」 · 금액끼리 줄) · Task 3 grep(옛 lcValueTextOf 단언 0 · lcAmountZeroWordOf 4 · 769 단언) 전부 PASS
- 플랜 검증: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp run test` 통과
- 요구사항 AMT-02 · AMT-04 는 같은 phase 의 다른 플랜도 선언한다. `requirements.ready-ids` 가 0/2 라 Complete 표시는 마지막 선언 플랜 몫이다
