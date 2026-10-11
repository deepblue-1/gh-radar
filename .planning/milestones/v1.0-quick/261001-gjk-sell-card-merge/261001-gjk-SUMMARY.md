---
phase: quick-261001-gjk
plan: 01
subsystem: webapp/trading (상따 limit-chaser 설정 폼)
status: complete
tags: [limit-chaser, settings-card, a11y, refactor]
requires: []
provides:
  - "LC_SELL_GROUPS = [sell(매도주문 — 행 6 + 기준선), cancel]"
  - "LcGroupSpec.title 필수 · 헤더 없는 그룹 렌더 경로 제거"
affects:
  - webapp/src/components/trading/limit-chaser-form.tsx (pane sell 렌더 · 인라인 Tab)
tech-stack:
  added: []
  patterns: ["단일 원천 lc-fields.ts 스펙 행 순서 = 화면 행 순서 = Tab 순서"]
key-files:
  created: []
  modified:
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
decisions:
  - "매도 열의 제목줄 없는 주문가격 · 매도비율 카드를 「매도주문」 카드에 합쳤다(행 순서 = 주문가격 → 비교가격 → 매도비율 → 매수잔량 → 잔량추적 → 체결 → [래치 때 기준선])"
  - "헤더 없는 그룹 경로(title optional · 섹션 ariaLabel · pt-1 분기 · 헤더 조건부 렌더)를 제거하고 LcGroupSpec.title 을 필수로 해 타입으로 재발을 막는다"
metrics:
  duration: "~15분"
  completed: 2026-10-01
commits: 2
plan_head_before: fa31efea0eb2acffa85a3b695d1e8f0dd0af40b2
actuals:
  tokens: 7400
  tasks: 2
  commits: 2
---

# Phase quick-261001-gjk Plan 01: 매도 주문가격·매도비율을 매도주문 카드로 합치기 Summary

상따 매도 열을 「매도주문」(제목줄 → 주문가격 → 비교가격 → 매도비율 → 매수잔량 → ○잔량추적 → ○체결 → [래치 때 기준선]) → 「매수취소」 두 카드로 합치고, 소비자가 없어진 헤더 없는 그룹 렌더 경로를 지워 카드 제목을 필수 필드로 좁혔다.

## 매도 열 구성 before / after

- **Before:** [제목줄 없는 카드: 주문가격 · 매도비율] → 「매도주문」(비교가격 · 매수잔량 · ○잔량추적 · ○체결 · [기준선]) → 「매수취소」
- **After:** 「매도주문」(주문가격 · 비교가격 · 매도비율 · 매수잔량 · ○잔량추적 · ○체결 · [기준선]) → 「매수취소」
- 인라인 Tab: 주문가격 → 비교가격 → 매도비율 → 매수잔량 → 잔량추적 % → 체결 → 편집 종료(매수취소로 넘어가지 않는다)

## 동작 불변 근거

| 항목 | 불변 근거 |
|------|-----------|
| 옮긴 두 행의 dimWhenOff false → true | 화면 영향 0 — 폼 `renderGroup` 이 `dimRows={false}` 로 컨테이너 흐림을 끄고, 매도주문은 접기(fold)가 없어 요약 줄 흐림도 없다. 행 흐림은 `lcRowDimOf` 가 `group.dimGate`(sellEnabled)만 보며, 옛 묶음도 같은 dimGate 였다. 테스트: 매도 에코 OFF → lc-sell-order-price · lc-sell-order-ratio opacityLayers 1 |
| 접근성 이름 | 두 행 모두 `a11yPrefix: '매도'` 그대로 → 「매도 주문가격 …」 · 「매도 매도비율 …」 불변 (⑯ 테스트 green) |
| 범위 검사 순서(lcRangeIssue) | ALL_GROUPS 행 순서상 sellOrderRatio(1~100)가 여전히 sellQtyTrackRatio(1~90)보다 앞 |
| lc.set cfg · 시트 제목 · 범위 | 행 객체 필드(id · label · unit · desc · a11yPrefix · range) 한 글자도 바꾸지 않고 이동. 전송 테스트(trading vitest 전량) green |
| 스위치 위치 | 제목줄 오른쪽 끝(마지막 자식) — 제목줄 내부 구조 · 클래스 · headerCheck/switchNode 순서 불변(재들여쓰기만) |

## 새로 생긴 a11y 차이

- 주문가격 · 매도비율 값 버튼이 이제 매도주문 카드 설명을 단다 — `aria-describedby` = 카드 제목 + 상태 문구 → 「주문가격 127,400원, 매도주문 감시 중」. setting-group ⑦ 테스트가 `toHaveAccessibleDescription('매도주문 감시 중')` 으로 고정.

## 검증 결과

- **RED (Task 1, 스펙 변경 전):** 4파일 8 failed / 334 passed. 대표 메시지: `AssertionError: expected [ 'sell-price', 'sell', 'cancel' ] to deeply equal [ 'sell', 'cancel' ]`
- **GREEN (Task 1):** 4파일 342/342 passed
- **Task 2 grep 게이트 3개:** 옛 slot · 옛 섹션 접근성 이름 · 「가격 섹션」 문구 0건 (webapp/src · webapp/e2e · lc 디렉터리)
- **trading vitest 전량:** 38 files, 1515/1515 passed
- **typecheck:** `tsc --noEmit && tsc -p tsconfig.e2e.json` 오류 0
- **eslint (7파일):** 오류 · 경고 0
- `git log --format=%B -n 2 | grep -ci co-authored-by` = 0

## Commits

| Task | Commit | 내용 |
|------|--------|------|
| 1 | 9757def7 | refactor(quick-261001-gjk): 매도 주문가격·매도비율을 매도주문 카드로 합친다 (스펙 병합 + 테스트 4파일) |
| 2 | 980ab8db | refactor(quick-261001-gjk): 헤더 없는 상따 그룹 경로를 지우고 카드 제목을 필수로 한다 |

## Deviations from Plan

None - plan executed exactly as written.

참고: Task 1 의 재발 방지 테스트는 title 이 아직 optional 인 시점의 타입 오류를 피하려고 `String(g.title)` 로 썼다가 Task 2 에서 title 이 필수가 되며 `g.title` 로 되돌렸다(그래서 Task 2 커밋에 setting-group.test.tsx 1줄이 포함됨). `lcRowA11yNameOf` 의 빈 접두 분기도 plan 이 허용한 대로 제거했다.

## 확인 권장 (메인 세션)

- 1단(본문 ≥685) 두 열에서 매수 「매수주문」 · 매도 「매도주문」 제목줄과 주문가격 · 비교가격 행이 같은 높이에서 시작하는지 브라우저로 한 번 본다 (dev 포트 3100 — dev.sh 기준).
- push 는 하지 않았다(push = webapp 프로덕션 배포).

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/lc/lc-fields.ts · setting-group.tsx · limit-chaser-form.tsx
- FOUND: 9757def7 · 980ab8db (git log)
