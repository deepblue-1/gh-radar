---
phase: 40-fill-push-notification
plan: 02
subsystem: shared
tags: [push, shared, golden-test, sketch-029, sc-4]

requires: []
provides:
  - "packages/shared/src/push.ts — PushPlatform · PushDevice · PushDeviceRegisterBody · PushStage · PUSH_STAGES · PushFacts · PushAutoSellFacts · PUSH_CHANNEL_ID(fills) · PUSH_CHANNEL_NAME(체결 알림) · PUSH_ORDER_LOG_PATH(/trading/order-log)"
  - "packages/shared/src/push-message.ts — pushMessageOf · pushTapPathOf · pushThreadIdOf · pushGroupWord · formatPushKstTime"
  - "index.ts 재수출 2줄(./push · ./push-message)"
affects: [40-01, 40-05, 40-06, 40-07, 40-10]

actuals:
  tokens: 5300
  tasks: 2
  commits: 3
plan_head_before: 617542dbe56857851fce6e94129cbb2ba7c39eab
plan_head_after: 3e4e93b6c8a8b6ac07a74f94ae92f48075180c7d

tech-stack:
  added: []
  patterns:
    - "사실(facts) → 문안 순수 함수 한 곳 — relay 는 조립하지 않고 import 만"
    - "계좌 칸 없는 입력 타입으로 SC-4 를 구조로 막음"

key-files:
  created:
    - packages/shared/src/push.ts
    - packages/shared/src/push-message.ts
    - packages/shared/src/__tests__/push-message.test.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "손익 % 반올림은 크기(절댓값)를 반올림해 부호를 붙인다 — ±같은 크기가 같은 숫자로 보이게(−12.35 → −12.4). 반올림 결과 0 이면 부호 없는 0.0%"
  - "pushMessageOf 의 default 는 never 검사 + throw — 빠진 단계는 타입 오류, 계약 밖 문자열은 조용히 넘기지 않고 relay(40-06)가 잡아 로깅"
  - "origin 폴백 낱말 수동 · VI 는 ORDER_GROUP_LABELS[7] · [8] 에서 읽고, 상따만 상수(그룹 표에 낱말이 없음)"
  - "자동매도 사실(autosell)이 null 이면 제목은 그대로 「자동매도 시작/완료」 · 본문은 시각만"

patterns-established:
  - "푸시 문안 골든: 스케치 029 index.html C 열 7종을 toEqual({ title, body }) 로 잠근다"

requirements-completed: [SC-1, SC-4]

coverage:
  - id: D1
    description: "스케치 029 C 안 7단계 문안(접수 · 첫 체결 · 전량 · 거부 · 서버 취소 · 자동매도 시작 · 완료)이 글자 단위로 같다"
    requirement: SC-1
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/push-message.test.ts#pushMessageOf — 스케치 029 C 안 골든"
        status: pass
    human_judgment: false
  - id: D2
    description: "구분 낱말 폴백 · 가격 0 · 억 표기 · 종목명 없음 · 취소/거부/자동매도 경계"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/push-message.test.ts#경계"
        status: pass
    human_judgment: false
  - id: D3
    description: "계좌번호가 문안에 들어갈 길이 없다(타입에 계좌 칸 없음 + 7단계 대표 문안에 8자리 이상 연속 숫자 없음)"
    requirement: SC-4
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/push-message.test.ts#SC-4 — 계좌 꼴 숫자(8자리 이상 연속)가 문안에 없다"
        status: pass
      - kind: other
        ref: "grep -cE 'accountNo|account_no' packages/shared/src/push.ts packages/shared/src/push-message.ts = 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "탭 경로 /trading/order-log?stock=<ISIN>&date=<YYYY-MM-DD> · 묶음 키 ISIN · KST 시각"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/push-message.test.ts#탭 경로 · 묶음 키 · 시각"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-07
status: complete
---

# Phase 40 Plan 02: 푸시 문안 정본 Summary

**사실(PushFacts) → 제목 「종목 · 구분 사건」 · 본문 「수량 (만원) · 잔량 · 가격 · 거래소 시각」을 만드는 순수 함수 한 곳 — 스케치 029 C 안 7종 골든과 글자 단위로 같고, 계좌 칸이 없는 계약 타입으로 SC-4 를 구조로 막았다.**

## Performance

- **Duration:** 약 5분
- **Started:** 2026-11-06T22:36:19Z
- **Completed:** 2026-11-06T22:41:39Z
- **Tasks:** 2
- **Files modified:** 4 (새 파일 3 · 수정 1)

## Accomplishments

- `push.ts` — 40-01 CHECK · 40-05 facts 키 · 40-06 import · 40-07 기기 API · 40-10 웹이 공유하는 계약 타입 · 상수. `PUSH_STAGES` 7단계 문자열 한 벌.
- `push-message.ts` — `pushMessageOf` 7 갈래(never 완전성 검사) · `pushGroupWord`(D-03 표 낱말 → origin 폴백 → 매수/매도 붙임 → 「주문」) · `pushTapPathOf`(D-21) · `pushThreadIdOf`(D-18) · `formatPushKstTime`(KST 고정). 낱말은 `ORDER_GROUP_LABELS` · `CANCEL_REASON_LABELS` · `autoSellBasisLabel` 에서만, 금액은 `amountFromQty` + `formatManwon` 한 벌.
- 테스트 42건 — 골든 7건(스케치 029 C 열) + 경계 28건 + SC-4 7단계 계좌 꼴 부재 7건.

## 내보낸 이름

- `push.ts`: `PushPlatform` · `PushDevice` · `PushDeviceRegisterBody` · `PushStage` · `PUSH_STAGES` · `PushFacts` · `PushAutoSellFacts` · `PUSH_CHANNEL_ID` · `PUSH_CHANNEL_NAME` · `PUSH_ORDER_LOG_PATH`
- `push-message.ts`: `pushMessageOf` · `pushTapPathOf` · `pushThreadIdOf` · `pushGroupWord` · `formatPushKstTime`
- **골든 수: 7** (접수 · 첫 체결 · 전량 · 거부 · 서버 취소 · 자동매도 시작 · 자동매도 완료)

## Task Commits

1. **Task 1: 계약 타입 + 주문 3단계 문안 + 탭 경로 (tracer)** — `c6e84c85` (feat)
2. **Task 2: 거부 · 서버 취소 · 자동매도 문안 + 경계 (TDD)**
   - RED — `8945ca93` (test)
   - GREEN — `3e4e93b6` (feat)

REFACTOR 커밋 없음(정리할 것 없음).

## TDD (Task 2)

- **RED:** 골든 4건 + 경계 테스트를 먼저 커밋 — 18건 실패 / 24건 통과(Task 1 이 이미 만든 구분 낱말 · 금액 경계는 통과). 증거: `npx vitest run src/__tests__/push-message.test.ts --reporter=tap-flat -t "사유 없음 →"` exit 1, 대상 `경계 — 취소 > 사유 없음 → 「잔량 N주 (M만) 취소」` 가 expected `잔량 300주 (94만) 취소 · KRX 09:05:10` / actual `KRX 09:05:10` 로 실패 → `gsd-tools check tdd-red-evidence` = `RED_EVIDENCE_OK`(target_test_failed). 의미 판정: 대상이 실제로 실행되어 계획한 단언에서 실패 — 로드 · 문법 · 픽스처 오류 아님, `cancelled` 갈래가 없어 default 꼴이 나온 것이 원인.
  - 참고: 전체 파일을 TAP 로 돌리면 vitest tap 리포터가 객체 diff 를 들여쓰기 없이 여러 줄로 내보내 분류기가 `invalid_record`(Malformed TAP)로 거부한다 — 문자열 단언 대상 하나로 좁혀 재수집했다.
- **GREEN:** 4 갈래 + never 검사 구현 — 42/42 통과 · typecheck 통과.

## Verification

- `pnpm --filter @gh-radar/shared build && … vitest run src/__tests__/push-message.test.ts --maxWorkers=2 && … typecheck` — 42/42 · 통과
- shared 전체 회귀 `vitest run --maxWorkers=2` — 45 파일 · 1201 통과 · 2 skip · 실패 0
- `relay` · `server` · `webapp` typecheck — 통과(재수출 이름 충돌 없음)
- 수락 기준: `export function pushMessageOf` 1 · 계좌 낱말 0/0 · `export * from "./push-message"` 1 · U+2212 1 · `CANCEL_REASON_LABELS` 4 · `ORDER_GROUP_LABELS` 5 · 「금양그린파워 · 」 15(≥7) — 전부 PASS

## Decisions Made

- 손익 % 반올림은 절댓값 기준(대칭) — 아래 Deviations 1.
- `default` 는 never 검사 + throw — 계약 밖 단계 문자열이 와도 엉뚱한 문안이 조용히 나가지 않는다. relay(40-06)가 잡아 `[push]` 로깅할 몫.
- 거부 사유는 공백만 있어도 빈 값으로 본다(trim 뒤 빈 문자열 → 조각 생략).
- 취소 잔량 0 은 「모름」과 같이 잔량 조각을 뺀다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 손익 % 음수 반올림 비대칭**
- **Found during:** Task 2
- **Issue:** 플랜의 `Math.round(pnlPct * 10) / 10` 은 JS `Math.round` 가 .5 를 +∞ 쪽으로 올려 −12.35% 가 「−12.3%」, +12.35% 가 「+12.4%」 로 같은 크기의 손실이 더 작게 보인다.
- **Fix:** 크기를 반올림하고(`Math.round(Math.abs(pct) * 10)`) 부호를 따로 붙인다. 0 으로 반올림되면 부호 없는 `0.0%`. 골든(−0.48 → −0.5) · +1.24 → +1.2 · 0 → 0.0 결과는 플랜과 같다.
- **Files modified:** packages/shared/src/push-message.ts
- **Verification:** 테스트 「완료 · 손익 부호」(−12.35 → −12.4 · −0.04 → 0.0)
- **Committed in:** `3e4e93b6`

**2. [Rule 2 - 경계] 기본 · 실패 경로 보강**
- **Found during:** Task 2
- **Issue:** 플랜 behavior 에 없는 입력 — 자동매도 사실 null · 보유 평균가 모름 · 표에 없는 취소 사유 · 거래소 빈 값.
- **Fix:** 각각 「제목 그대로 · 시각만」 · 「보유 500주(금액 생략)」 · 「사유 없음」 · 「시각만」으로 정하고 테스트로 잠갔다.
- **Files modified:** packages/shared/src/push-message.ts · packages/shared/src/__tests__/push-message.test.ts
- **Committed in:** `8945ca93` · `3e4e93b6`

---

**Total deviations:** 2 auto-fixed (Rule 1 1건 · Rule 2 1건)
**Impact on plan:** 골든 7건 문안은 플랜 그대로. 계약 타입 · 이름 변경 없음.

## Issues Encountered

- worktree 에 node_modules 가 없어 `pnpm install --frozen-lockfile --prefer-offline` 로 설치(새 패키지 0).
- SC-4 테스트 첫 초안에서 비현실적 극단값(2,147,483,647주 × 5,000,000원)은 억 갈래가 「107374182.4억」 처럼 9자리 숫자를 내 `/\d{8,}/` 에 걸린다 — 계좌와 무관한 금액 표기라 대표 픽스처를 현실 값(30,000주 × 12,350)으로 두었다. 억 단위 정수부가 8자리가 되려면 1경 원 이상이라 실주문에서는 생기지 않는다.

## Known Stubs

없음.

## Next Phase Readiness

- 40-05(판정 RPC)는 facts jsonb 키를 `PushFacts` · `PushAutoSellFacts` camelCase 그대로 만든다.
- 40-06(relay)은 `import { pushMessageOf, pushTapPathOf, pushThreadIdOf, PUSH_CHANNEL_ID } from "@gh-radar/shared"` — `pushMessageOf` 가 던지는 경우를 잡아 로깅해야 한다.

## Self-Check: PASSED

- FOUND: packages/shared/src/push.ts · packages/shared/src/push-message.ts · packages/shared/src/__tests__/push-message.test.ts
- FOUND commits: c6e84c85 · 8945ca93 · 3e4e93b6
