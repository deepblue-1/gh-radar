---
phase: 24-limitchaser-buy3
plan: 22
subsystem: webapp 상따 설정 폼 (추가매수 켜기 클라 사전 판정 D-36) · 카드 호가 배관
tags: [gap-closure, D-36, D-16, limit-chaser-form, use-lc-field-commit, card-body, e2e, tdd]
status: complete
requires: ["24-18", "24-20", "24-21"]
provides:
  - "lcExtraBuyUpperLimitBlockOf(bestBid, bestBidQty, values) — D-36 판정 지점 하나(막으면 문구 · 아니면 null)"
  - "lcExtraBuyAtUpperLimitText(bidQty, floor) — WinForms 원문 문구 원천(N · M ko-KR 쉼표 · U+2265)"
  - "LimitChaserForm prop bestBidQty(기본 0) · bestBidQtyRef — commitGroupSwitch 추가매수 켜기가 D-36 판정을 부른다"
  - "card-body bestBidQty = quote.bq[0](0 · 미수신이면 0) 배관"
  - "e2e P24-5 (b) D-36 원문 · P24-13 얇은 벽 허용"
  - "UI-SPEC 본문 D-36 갱신 · 부록 「D-36 추가매수 상한가 차단 — 매수1잔량 항(2026-09-28 · 24-22)」"
affects: [webapp 상따 설정 폼 추가매수 켜기 · 카드 전략 로그 클라 합성 줄 · 24-24 체크포인트 문구 확인]
tech-stack:
  added: []
  patterns:
    - "클라 사전 판정은 훅 파일의 순수 함수 하나(막으면 문구 · 아니면 null) — lcLegacyBlockOf · lcGroupAmountBlockOf 와 같은 결"
    - "숫자를 품는 원문 문구는 고정 상수가 아니라 문구 함수 하나로 — 다른 곳에서 다시 적지 않는다"
key-files:
  created:
    - .planning/phases/24-limitchaser-buy3/24-22-SUMMARY.md
  modified:
    - webapp/src/components/trading/lc/use-lc-field-commit.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
decisions:
  - "D-36: 추가매수 켜기 클라 차단 = 매수1호가 > 0 ∧ 비교가격 > 0 ∧ 매수1호가 == 비교가격 ∧ 매수1잔량 ≥ 최소(0 이면 1) — 얇은 벽 · 매수1잔량 모름(0)은 허용(서버 「모름」 단계 규칙이 백스톱 · gh-trade k3u 동형)"
  - "D-36 문구는 LC_COMMIT_TEXT 고정 항목을 지우고 lcExtraBuyAtUpperLimitText(bidQty, floor) 한 곳으로(별칭 없음) — N · M 은 toLocaleString('ko-KR') = WinForms {0:N0}"
  - "UI-SPEC 본문의 D-16 라벨(개요 표 · 상태 매트릭스 · 검증 훅 · 어조 줄 포함)을 모두 D-36 으로 맞췄다 — 플랜이 지목한 5곳 외 라벨도 같은 규칙의 개정이라 함께 갱신"
metrics:
  duration: "11 min (2026-09-28 09:24Z ~ 09:35Z)"
  completed: "2026-09-28"
  tasks: 3
  files: 9
actuals:
  tokens: 15500
  tasks: 3
  commits: 3
plan_head_before: ec17d0e03bd0680411d2f6dc55b1ddef5383ab72
commits: 3
requirements-completed: []
coverage:
  - id: D1
    description: "카드 호가 매수1잔량 ≥ 최소면 추가매수 켜기 = 전송 0 + D-36 원문 error 한 줄 · 얇은 벽 · 잔량 모름 = 전송 1 · 호가 없음 = 로그 0"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/card-body.test.tsx#24-22 — 폼에 매수1호가 · 매수1잔량(bestBid · bestBidQty) · 클라 로그 통로를 넘긴다 (D-36)"
        status: pass
    human_judgment: false
  - id: D2
    description: "판정 함수 표 6행 · 문구 원천(쉼표 · U+2265)"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx#D-36 — 추가매수 상한가 차단은 매수1잔량 ≥ 최소일 때만 (lcExtraBuyUpperLimitBlockOf)"
        status: pass
    human_judgment: false
  - id: D3
    description: "폼 순서(사전 검증 → D-36 → 자동 체크) · D-36 이 먼저면 자동 체크 0 · 얇은 벽이면 추가매수 · 마스터 · 6체크 한 제출 + 성공 뒤 자동 체크 한 줄 · 카드 흐름 원문"
    verification:
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx#⑱ · D-35 (D-36 이 먼저 · D-36 얇은 벽)"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/__tests__/strategy-card-flow.test.tsx#24-06 — 클라 로그 통로 pushClientLog (D-36 · 순서)"
        status: pass
    human_judgment: false
  - id: D4
    description: "진짜 브라우저 → relay → 스텁 게이트웨이: 두꺼운 벽(매수1잔량 10 ≥ 최소 1) D-36 원문 · 얇은 벽(10 < 11) 10 한 건 · 로그 없음"
    verification:
      - kind: e2e
        ref: "pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g \"P24-5|P24-12|P24-13\""
        status: pass
    human_judgment: false
  - id: D5
    description: "새 로그 문구(N · M 포함)의 화면 가독성 — 사용자 확인"
    human_judgment: true
    rationale: "플랜이 새 문구 확인을 24-24 체크포인트에서 사용자에게 맡겼다(새 시각 요소 없음 · 목업 게이트 대상 아님)"
---

# Phase 24 Plan 22: D-36 추가매수 상한가 차단 — 매수1잔량 항 Summary

**추가매수 켜기의 클라 상한가 차단을 「매수1호가 == 비교가격 ∧ 매수1잔량(`bq[0]`) ≥ 최소(0 이면 1)」로 좁히고(얇은 벽 · 잔량 모름은 허용 — gh-trade k3u · WinForms HandleArmToggle 동형), 막힘 로그를 WinForms 원문 `… 매수1잔량 N ≥ 최소 M`(ko-KR 쉼표)으로 바꿨다 — 판정 · 문구는 훅 파일 `lcExtraBuyUpperLimitBlockOf` · `lcExtraBuyAtUpperLimitText` 한 곳.**

## Performance

- 시작 2026-09-28T09:24Z · 끝 09:35Z (11분)
- 태스크 3 · 파일 9 · 커밋 3(+ 문서 커밋)

## Accomplishments

- 훅 `use-lc-field-commit.ts`: `LC_COMMIT_TEXT.extraBuyAtUpperLimit`(종전 D-16 고정 문구) 삭제 · `lcExtraBuyAtUpperLimitText(bidQty, floor)` · `lcExtraBuyUpperLimitBlockOf(bestBid, bestBidQty, values)` 신설.
- 폼 `limit-chaser-form.tsx`: `bestBidQty?: number`(기본 0) · `bestBidQtyRef` · `commitGroupSwitch` D-16 자리를 D-36 판정 호출로 교체(순서 · 자동 체크 슬롯 처리 불변 — 막힘은 어떤 슬롯도 건드리지 않는다).
- 카드 본문 `card-body.tsx`: `bestBidQty={quote !== null && quote.bq[0] > 0 ? quote.bq[0] : 0}`.
- 테스트: 카드 본문 4 · 훅 문구 원천 + 판정 표 6 · 폼 ⑱ 5(두꺼운 벽 · 얇은 벽 · 잔량 모름 · 호가 모름 · 추가매수만) · 폼 D-35 2(D-36 이 먼저 · D-36 얇은 벽) · 카드 흐름 1.
- e2e: P24-5 (b) D-36 원문(스텁 매수1잔량 10 ≥ 최소 1) · P24-13 신설(얇은 벽 10 < 11 → 10 한 건 · `extraBuyMinQty 11` · 로그 없음 · 고정 대기 0).
- UI-SPEC: 검증 순서 · 사전 검증 표 행 · 판정 입력 · 로그 매핑 · D-35 순서 ② 를 D-36 으로, 부록 소절 「D-36 추가매수 상한가 차단 — 매수1잔량 항(2026-09-28 · 24-22)」.

## TDD 기록

- **① RED (Task 1):** 카드 본문 「24-22 — … (D-36)」 4 케이스 중 3 실패 — 두꺼운 벽은 종전 문구 「추가매수는 상한가 도달 전에만 …」 이 나왔고, 얇은 벽(최소 500 · 잔량 200) · 잔량 모름(0)은 D-16 이 막아 로그 1회 · 전송 0(기대: 로그 0 · 전송 1). 호가 없음은 종전과 같아 통과.
- **GREEN:** 훅 함수 · 폼 prop · 카드 배관 뒤 카드 본문 56/56 통과.
- 트레이서 게이트(end-of-phase · 자동 검증만): Task 1 `<verify>` 재실행 green → 확장 진행.

## Task Commits

| Task | 이름 | 커밋 |
|---|---|---|
| 1 (tracer) | 판정 · 문구 함수 · 폼 prop · 카드 배관 + 카드 본문 RED→GREEN | `3596f09d` |
| 2 | 훅 · 폼 · 카드 흐름 테스트 D-36 | `ee5ce864` |
| 3 | e2e P24-5 (b) · P24-13 + UI-SPEC | `d9dca6b4` |

## Verification

- `vitest --run src/components/trading/__tests__/card-body.test.tsx` — 56 passed.
- `vitest --run src/components/trading src/lib` — 77 files · 2203 passed · 1 skipped.
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`(tsc + e2e tsconfig) — 0 error.
- `playwright test e2e/specs/trading-workbench.spec.ts -g "P24-5|P24-12|P24-13"` — 4 passed(setup 포함).
- 종전 문구 「상한가 도달 전에만」: webapp/src 0 · e2e 0 · UI-SPEC 0 (CONTEXT D-16 원문 기록은 결정 이력이라 유지).
- 서버 · 프로토콜 · relay · shared 변경 없음.

## Deviations from Plan

### 범위 조정

**1. UI-SPEC 본문의 나머지 D-16 라벨도 D-36 으로**
- **Found during:** Task 3
- **Issue:** 플랜이 지목한 5곳(검증 순서 · 표 행 · 판정 입력 · 로그 매핑 · D-35 순서) 밖에도 개요 표 · 어조 줄 · Error state · 상태 매트릭스 · 상태 표 · 검증 훅에 「D-16」 라벨이 남아 있어 본문이 폐기된 규칙을 가리키게 된다.
- **Fix:** 같은 규칙의 개정이라 라벨을 D-36 으로 맞췄다(개요 표 · 표 행은 「D-16 개정」 병기). 문구 · 조건 외 내용은 바꾸지 않았다.
- **Files modified:** .planning/phases/24-limitchaser-buy3/24-UI-SPEC.md
- **Commit:** `d9dca6b4`

**2. e2e 헬퍼 주석 한 줄** — `lcSetCount` JSDoc 의 계약 목록 「D-16」 → 「D-36」(동작 무변화 · `d9dca6b4`).

**Total deviations:** 2 범위 조정(문서 · 주석 라벨). **Impact:** 동작 무변화 — 정본 문서가 개정 규칙만 가리키게 했다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 네트워크 · 인증 · 스키마 표면 없음(T-24-71 accept · T-24-72 mitigate 는 카드 본문 · 폼 · e2e P24-5 단언으로 이행).

## Next

Ready for 24-23.

## Self-Check: PASSED

- 파일: use-lc-field-commit.ts · limit-chaser-form.tsx · card-body.tsx · 테스트 4 · e2e spec · UI-SPEC — 존재 · 수정 확인.
- 커밋: `3596f09d` · `ee5ce864` · `d9dca6b4` — `git log` 에 존재.
- 수락 기준 Task 1~3 전부 PASS(grep · sed · 자동 명령 종료 코드 0).
