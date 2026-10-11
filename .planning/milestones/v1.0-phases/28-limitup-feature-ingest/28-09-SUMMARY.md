---
phase: 28-limitup-feature-ingest
plan: 09
subsystem: ui
tags: [shared, strategy-event, order-log, kind-15, limit-feature, react]

requires:
  - phase: 28-02
    provides: "STRATEGY_EVENT_KIND.LimitFeature 15 · 라벨 「상한가특징」 · isMarketStrategyEvent(15)"
  - phase: 28-07
    provides: "9칸 숫자 함수(formatEok · formatDuration · formatRatePct · roundPctHalfEven · formatGroup) · memberName"
provides:
  - "parseLimitFeatureMessage — kind 15 message total 파서(잘린 꼬리 버림)"
  - "limitFeatureOfStrategyEvent — kind 15 행 → RelayLimitFeatureMsg(슬롯 매핑표 = 특징 사전 ③)"
  - "limitFeatureLogParts — 주문로그 한 줄 조각 { lead, body } (UI-SPEC ②-2)"
  - "StrategyEventParts.tone 'feature' · lead?: string · strategyEventParts case 15 · orderLogLineText lead 포함"
  - "픽스처 STRATEGY_LIMIT_FEATURE_ROWS(배열) · STRATEGY_LIMIT_FEATURE_BY_NAME · STRATEGY_LIMIT_FEATURE_GOLDEN"
  - "웹 F-A 목록 · dense · 카드 팝업(표 · 폰 행)의 tone feature · lead 렌더"
affects: [28-11, 28-12, 28-13]

actuals:
  tokens: 13800
  tasks: 2
  commits: 2
plan_head_before: 1eaaa04bc9c96e328e45399cc53016c57469b961

tech-stack:
  added: []
  patterns:
    - "kind 15 는 StrategyEvent 칸을 85 모양으로 되돌린 뒤 카드 9칸과 같은 숫자 함수로 문장을 만든다 — 숫자 표기 1벌"
    - "조립기 조각에 lead(강조 조각)를 더하고, 평문(title · 골든)은 joinDot([action, lead, body])"

key-files:
  created: []
  modified:
    - packages/shared/src/limit-feature.ts
    - packages/shared/src/index.ts
    - packages/shared/src/strategy-event-text.ts
    - packages/shared/src/__fixtures__/strategy-day.ts
    - packages/shared/src/__tests__/limit-feature.test.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts
    - webapp/src/components/trading/order-log/order-log-list.tsx
    - webapp/src/components/trading/card/card-log-popups.tsx
    - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx

key-decisions:
  - "message 파서: 종결자 「|」 가 없으면(256B 에서 잘림) 마지막 갈래의 마지막 원소는 형식이 맞아 보여도 버린다 — 「=7407」 이 「=74」 로 잘려 1% 를 지어내는 것을 막는다"
  - "10초 우세 갈래를 limit-feature.ts 안 헬퍼 tenSecondLead 하나로 뽑아 9칸(색 포함)과 kind 15 문장(글자만)이 같이 쓴다"
  - "STRATEGY_LIMIT_FEATURE_ROWS 는 플랜대로 배열(시각 오름차순 — 28-11 e2e 목 응답용)이고, 골든 대조용 이름 표 STRATEGY_LIMIT_FEATURE_BY_NAME 을 따로 더했다"
  - "F-A 비feature 본문은 글자 노드 그대로 두고 kind 15 본문만 --muted-fg span(order-log-feature-body) — 기존 줄 DOM 불변"
  - "카드 팝업 matchesSide 의 tone 판정(시세 세그먼트에서 kind 15 가 빠짐 · Pitfall 4)은 28-11 범위라 건드리지 않았다"

patterns-established:
  - "StrategyEventParts.lead: 본문 앞 강조 조각 — 표면은 data-slot=order-log-lead · --up 600 으로 그린다"

requirements-completed: [D-06, D-07]

coverage:
  - id: D1
    description: "kind 15 message total 파서 — 잘린 꼬리 · |m= 없음 · 쓰레기 입력을 지어내지 않고 넘긴다"
    requirement: D-07
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/limit-feature.test.ts#parseLimitFeatureMessage — total (지어내지 않는다)"
        status: pass
    human_judgment: false
  - id: D2
    description: "kind 15 행 → 85 이름 되돌림 · 한 줄 조각(lead/body) — UI-SPEC ②-2 예문과 글자 하나까지 같다"
    requirement: D-07
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/limit-feature.test.ts#Phase 28 kind 15 되돌림 · 문장 (28-09 · UI-SPEC ②-2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "조립기 case 15 · tone feature · lead · orderLogLineText 골든(STRATEGY_LIMIT_FEATURE_GOLDEN 6행) · 기존 kind 골든 불변"
    requirement: D-07
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#Phase 28 kind 15 (28-09 · UI-SPEC ②-2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "웹 F-A 목록 · dense · 카드 팝업에서 「상한가특징」 회색 배지 · 빨간 「잠김 N초」 600 · 회색 본문 · 주문번호 칸 없음 · title = 평문"
    requirement: D-07
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx#OrderLogList — kind 15 상한가 특징 줄 (28-09 · UI-SPEC ②-2)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-tabs.test.tsx#kind 15 상한가 특징 줄(28-09 · UI-SPEC ②-2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "kind 15 줄이 실제 화면에서 주문 줄보다 한 단계 옅게 읽히는지(색 대비 · 말줄임 체감)"
    verification: []
    human_judgment: true
    rationale: "체크 칩 · 스토어 분리(28-11) 전에는 실제 화면에 kind 15 줄이 들어오는 경로가 없다 — 시각 체감은 28-11 e2e/UAT 에서 본다"

duration: 8min
completed: 2026-10-05
status: complete
---

# Phase 28 Plan 09: kind 15 한 줄 문장 Summary

**관찰자 저널 kind 15 행을 85 필드 이름으로 되돌려 카드 9칸과 같은 숫자 함수로 「잠김 43초 · 잔량 17.3억 · 매도벽 0 · …」 한 줄을 만들고, 조립기 `case 15`(tone `feature` · `lead`)로 F-A 목록과 카드 팝업이 회색 배지 · 빨간 lead · 회색 본문으로 그린다**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-10-05T10:06:28Z
- **Completed:** 2026-10-05T10:14:30Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- `parseLimitFeatureMessage`: total 파서. `;` · `,` · `=` · `|m=` 로 나누고, 형식이 깨진 원소나 256B 에서 잘린 꼬리는 버린다. throw 하지 않는다.
- `limitFeatureOfStrategyEvent`: 슬롯 매핑표(특징 사전 ③)를 그대로 따른다. 창구는 `dQty 0 · shareBp` 만 채우고, `modelState` 는 `snap_qty` 길이로 정한다.
- `limitFeatureLogParts`: lock 0/1/2 세 갈래, 단일가 접두, 10초 우세, 신규/취소 또는 체결 합, 창구 %(R-4), 깨짐확률을 만든다. UI-SPEC ②-2 예문과 글자 하나까지 같다.
- 조립기 `case 15`: `{ badge: "상한가특징", tone: "feature", action: null, lead?, body, cum }`. `orderLogLineText` 는 행위 · lead · 본문을 한 줄로 잇고, 기존 kind 의 출력은 바뀌지 않았다.
- 웹 F-A 목록과 dense 줄은 `Sentence` 로 lead(`--up` 600)와 feature 본문(`--muted-fg`)을 그린다. 카드 팝업(표 · 폰 행)은 `BADGE_TONE.feature` 와 `LogBody` 를 쓴다.

## Task Commits

1. **Task 1: shared — message 파서 · 행 → 85 되돌림 · kind 15 문장 · 골든 픽스처** — `f0cfbcc0` (feat)
2. **Task 2: 조립기 case 15 · tone feature · lead + 웹 두 표면 렌더** — `530451f3` (feat)

## 골든 행 이름 (`STRATEGY_LIMIT_FEATURE_GOLDEN` · seq 301~306 · 시각 오름차순)

| 이름 | 갈래 |
|---|---|
| `lfNotReached` | 미도달 · 매도벽 잘림 「4.2억+」 · 「상한가 13,000」 · 체결 합 |
| `lfLocked43` | 잠김 43초 — UI-SPEC ②-2 예문 그대로 (lead 「잠김 43초」) |
| `lfLocked103` | 잠김 1분 43초 · 소진 1분 35초 · 10초 반반 · 신규 0 |
| `lfBroken` | 깨짐 · 매도 우세 74% · 모델 적용 「깨짐확률 18.3%」 |
| `lfAuctionLocked` | 단일가 잠김(lead 「단일가 · 잠김 12초」) · 체결 없음 · message 없음 → 「매수 — / 매도 —」 |
| `lfTruncatedMessage` | 잘린 message `buy:00050=7407,0004` → 「매수 키움증권 74% / 매도 —」 |

**폴백 단언에서 뺀 kind:** 15. `strategy-event-text.test.ts` 의 「kind 15 LimitFeature 는 조립기 밖 — D-10 폴백(원문 숫자)」 단언을 지웠다. 모르는 kind 폴백은 기존 kind 99 단언이 계속 지킨다.

## Files Created/Modified

- `packages/shared/src/limit-feature.ts`: 파서 · 되돌림 · 문장 조각을 더했다. `tenSecondLead` 헬퍼는 9칸과 같이 쓴다.
- `packages/shared/src/index.ts`: 새 함수 3개와 타입 3개를 export 했다.
- `packages/shared/src/strategy-event-text.ts`: tone `feature`, `lead?`, `case 15`, `orderLogLineText` 의 lead 처리를 더했다.
- `packages/shared/src/__fixtures__/strategy-day.ts`: kind 15 행 6개와 골든을 더했다.
- `webapp/src/components/trading/order-log/order-log-list.tsx`: `TONE_CLASS.feature` 와 `Sentence`(lead · feature 본문)를 더하고, `hasSentence` 에 lead 를 넣었다.
- `webapp/src/components/trading/card/card-log-popups.tsx`: `BADGE_TONE.feature`, `bodyTone`, `LogBody` 를 더했다(표 · 폰 행 두 곳).
- 테스트: `limit-feature.test.ts` · `strategy-event-text.test.ts` · `order-log-list.test.tsx` · `card-tabs.test.tsx`.

## Decisions Made

- 종결자 `|` 가 없는 message 는 마지막 원소를 버린다. 숫자 중간에서 잘렸을 수 있어서다(지어내지 않음 규율).
- 픽스처는 배열 `STRATEGY_LIMIT_FEATURE_ROWS`(28-11 e2e 용)와 이름 표 `STRATEGY_LIMIT_FEATURE_BY_NAME` 두 가지로 냈다.
- kind 15 본문만 span 으로 감쌌다. 주문 줄 DOM 은 그대로다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `packages/shared/src/index.ts` export 추가**
- **Found during:** Task 1
- **Issue:** 플랜 files_modified 에 없었다. 그런데 webapp 과 이후 플랜(28-11~13)이 패키지 진입점으로 새 함수를 써야 한다.
- **Fix:** `parseLimitFeatureMessage` · `limitFeatureOfStrategyEvent` · `limitFeatureLogParts` 와 타입 3개를 export 했다.
- **Committed in:** `f0cfbcc0`

**2. [Rule 2 - Verification] 카드 dense 팝업 렌더 테스트를 `card-tabs.test.tsx` 에 추가**
- **Found during:** Task 2
- **Issue:** behavior 5(카드 팝업 lead · 배지 색)를 검증할 테스트가 플랜 파일 목록에 없었다.
- **Fix:** 기존 「주문로그 버튼 + 팝업」 describe 에 kind 15 줄 단언 1건을 더했다(표 · 폰 행).
- **Committed in:** `530451f3`

**3. [Rule 2] 픽스처 이름 표 `STRATEGY_LIMIT_FEATURE_BY_NAME` 추가**
- **Found during:** Task 1
- **Issue:** 플랜이 정한 ROWS 는 배열이고 GOLDEN 은 이름 키라서, 골든을 대조하려면 이름 → 행 표가 필요했다.
- **Fix:** 같은 원본에서 만든 이름 표를 export 했다. 값은 한 벌이다.
- **Committed in:** `f0cfbcc0`

---

**Total deviations:** 3건 자동 처리(Rule 3 1 · Rule 2 2). **Impact:** 셋 다 export · 테스트 · 픽스처 보조이고 범위는 늘지 않았다.

## TDD 메모

- Task 1 은 RED 를 먼저 확인했다(19 failed, 새 함수 미구현) → GREEN 66 passed.
- Task 2 의 shared 조립기는 구현과 테스트를 같은 사이클에 썼다. webapp 테스트는 shared 를 다시 빌드하기 전에 실행해 RED 3 failed(배지 「15」 · 문장 없음)를 확인한 뒤 GREEN 이 됐다.
- 커밋은 플랜 ④ 대로 태스크당 1개다(28-01~08 선례).

## Verification

- shared 전체 376 passed · build OK
- webapp typecheck(tsc + e2e tsconfig) OK · webapp 전체 3369 passed / 1 skipped(142 files)
- relay typecheck · typecheck:tests OK · relay 전체 1007 passed
- 수용 기준 grep 전부 ≥ 1

## Issues Encountered

- webapp 테스트는 shared `dist` 를 읽는다. 조립기를 바꾼 뒤 `pnpm --filter @gh-radar/shared build` 를 먼저 해야 반영된다(첫 실행 RED 의 원인).

## Next Phase Readiness

- 28-11: 체크 칩 · 스토어 분리 · `lf=1` 조회 · 카드 팝업 「시세」 세그먼트 kind 판정(Pitfall 4)이 이 문장과 골든(`STRATEGY_LIMIT_FEATURE_ROWS` · `_GOLDEN`)을 그대로 쓴다.
- 28-12/13 보고서는 `limitFeatureOfStrategyEvent` · 숫자 함수를 다시 쓸 수 있다.

## Self-Check: PASSED

- 파일 4개 존재 · 커밋 f0cfbcc0 · 530451f3 존재 확인
