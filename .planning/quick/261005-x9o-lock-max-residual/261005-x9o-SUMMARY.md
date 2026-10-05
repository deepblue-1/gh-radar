---
phase: quick-261005-x9o
plan: 01
status: complete
subsystem: webapp/analytics (상한가 보고서)
tags: [limitup-report, lock-max, auction, lane]
requirements: [X9O-LOCKMAX, X9O-AUCTION]
key-files:
  modified:
    - webapp/src/lib/limitup-report.ts
    - webapp/src/lib/__tests__/limitup-report.test.ts
    - webapp/src/components/analytics/limitup-day-grid.tsx
    - webapp/src/components/analytics/__tests__/limitup-day-grid.test.tsx
    - webapp/src/lib/limitup-lanes.ts
    - webapp/src/lib/__tests__/limitup-lanes.test.ts
    - webapp/src/components/analytics/limitup-lane.tsx
    - webapp/src/components/analytics/__tests__/limitup-event-card.test.tsx
    - webapp/e2e/specs/limitup-report.spec.ts
decisions:
  - 목록 「잠김 최대 잔량」 = q_max 사실 krw 최대(gh-trade 같은 숫자 원칙의 의도된 예외) · grid_summary q_max_krw 는 스파크라인 y 상한에만 남김
  - 단일가 회색 음영은 목록 스파크라인이 아니라 펼친 카드 레인 2 「잠김 구간」에만
  - 폰 메타 · 행 설명은 짧은 라벨 「잠김 최대」
plan_head_before: 497bd3b87c8e07c09603832726075a0d2fa85316
actuals:
  tokens: 10500
  tasks: 2
  commits: 2
completed: 2026-10-06
---

# Quick 261005-x9o: 상한가 보고서 「잠김 최대 잔량」 + 잠김 구간 레인 단일가 회색 음영

목록 숫자를 하루 최대(VI 단일가 누적 포함)에서 잠김 기간 최대(q_max 사실)로 바꿨습니다. 덕우전자는 36.0억에서 27.6억으로, 엑시온그룹은 22.8억에서 6.9억으로 바뀝니다. 펼친 사건 카드의 레인 2 「잠김 구간」에서는 미잠김 단일가 구간을 회색 면(`--border-subtle`)으로 칠하고 캡션 「단일가」를 붙였습니다.

## 커밋

| 태스크 | 커밋 | 내용 |
|---|---|---|
| 1 (트레이서) | `fccdc183` | 목록 「잠김 최대 잔량」 — `lockMaxKrwOf` · `LimitupDayRow.lockMaxQ` · 열 머리 · 폰 메타 · WR-A05 설명 · 같은 숫자 원칙 예외 주석 |
| 2 | `b14ec955` | `auctionSpansOf` · `LaneLock.auctions` · 레인 2 회색 면 + 캡션 「단일가」 · aria 요약 「단일가 HH:MM:SS~HH:MM:SS」 |

push · 배포는 하지 않았습니다(`master` ahead 2). Co-Authored-By 는 넣지 않았습니다.

## 결정 기록

### (1) 잠김 최대 잔량 — q_max_krw 소비처 점검
- 목록 값은 `lockMaxKrwOf(facts)`로 만듭니다. `template_id === 'q_max'` 이고 `values.krw` 가 유한 숫자인 사실 중 최대이고, 없으면 「—」입니다. big_new · big_cancel · burst_wall 의 krw 는 거릅니다.
- `grid_summary.q_max_krw` 를 쓰는 곳을 점검했습니다.
  - 정렬(`stocksOf`)과 KPI(`kpisOf`)는 원래 이 값을 쓰지 않습니다. 둘 다 바꾸지 않았습니다.
  - 남은 소비처는 `sparkYMaxOf`(스파크라인 y 상한) 하나입니다. 하루 곡선의 단일가 봉우리가 상자 밖으로 나가지 않도록 계산은 그대로 두고, 결정 주석만 달았습니다.
  - 화면에 숫자로 보이는 q_max_krw 는 이제 없습니다.
- 값 계산 자리(`dayRowsOf`)에 gh-trade 「같은 숫자 원칙」의 의도된 예외라는 주석을 달고 픽스처 숫자를 예로 들었습니다. 덕우전자 36.0억 @09:03:50 단일가 vs 잠김 1 27.6억, 엑시온그룹 22.8억 @12:10:40 vs 잠김 2 6.9억입니다. 머리 주석의 ★ 같은 숫자 원칙 문단에도 예외 한 줄을 더했습니다.
- `maxQ` 필드 이름을 `lockMaxQ` 로 바꿨습니다. 의미가 바뀐 필드라 typecheck 가 모든 소비처를 잡게 하려는 것입니다.

### 폰 메타 · 행 설명 짧은 라벨
- xl 머리는 긴 이름 「잠김 최대 잔량」입니다. 폰 2줄 메타와 WR-A05 행 설명(`aria-describedby`)은 짧은 이름 「잠김 최대 {값}」입니다. 폰 메타 줄 폭을 지키려는 선택이고, 세 곳 모두 같은 값을 씁니다.
- `COLS_XL` 5번째 열을 72px 에서 88px 로 넓혔습니다. e2e 넘침 단언(scrollWidth ≤ clientWidth)이 통과했습니다.

### (2) 단일가 회색 음영의 위치 — 목록 스파크라인 대신 레인 2
- 목록 스파크라인은 RPC `grid_summary.q_krw`(coarse) 하나로 그립니다. grid_summary 와 보고서 응답에는 `auction` · `lock_state` 열이 **없습니다**. 이 둘은 행을 펼칠 때 지연으로 받는 종목별 격자 파일에만 있습니다.
- 목록에 칠하려면 행마다 격자 파일을 받아야 합니다. 그러면 진입 즉시 N건(해제 시 수 MB)을 받게 되고, e2e 「격자 파일은 연 행만」 계약이 깨집니다. 그래서 같은 잔량 곡선과 잠김 음영이 이미 있는 펼친 카드 레인 2 「잠김 구간」에만 칠했습니다.
- 마이그레이션 · server · RPC · 워커 변경은 0건입니다. 목록 스파크라인과 레인 1 도 바꾸지 않았습니다.
- 해당 조건은 `auction === true` 이고 `lock_state === 0` 입니다. 잠김 중 단일가는 잠김 음영이 이미 덮으므로 뺐습니다.
  - 구간 끝은 구간 뒤 첫 비해당 칸의 sec 입니다(다음 표본까지 유지). 끝까지 이어지면 hi 입니다.
  - 덕우전자는 1구간 09:04:01~09:06:01 입니다(x = 0, 잠김 시작과 맞닿음). 엑시온그룹은 0구간입니다(15:20 종가 단일가는 lock_state 1).
- `gridSeries` 의 걷기를 `gridCells`(원값 · 같은 칸에서 여러 열을 읽음)로 꺼냈습니다. 그래서 auction · lock_state 두 열이 같은 칸에서 정렬된 채 읽힙니다. 기존 gridSeries 테스트는 바꾸지 않았고 그대로 통과합니다.

## 계획과 달라진 점

1. **[Rule 1 — 시각 결함] 「단일가」 캡션 위치.** 계획은 회색 면 왼쪽 위(`top: 2`)였습니다. 1280 스크린샷에서는 단일가 동안 잔량이 높아서 곡선이 캡션 바로 아래를 지나갔습니다. 그래서 캡션을 왼쪽 아래(`bottom: 2`)로 옮겼고, 같은 줄의 창 캡션(「깨짐 직전 1분」)과 가로로 겹칠 때만 위로 올립니다. 1280 · 390 둘 다 겹침이 0입니다(P28-R1b 오버레이 겹침 검사 통과). 수정은 `b14ec955` 에 들어 있습니다.
2. **gridCells 시그니처.** 계획은 `gridCells(grid, lo, hi, col)`(열 하나의 원값)이었습니다. 실제로는 칸 참조 `{sec, cols, i}` 를 돌려주는 `gridCells(grid, lo, hi)` 로 만들었습니다. 두 열을 각각 걸어 순서가 같기를 가정하는 대신, 한 번 걸어서 같은 칸에서 두 열을 읽게 하려는 것입니다. 동작은 같고 더 안전합니다.
3. **TDD 순서.** Task 2(tdd="true")는 구현과 테스트를 같은 커밋에 넣었습니다. 계획이 태스크당 커밋 1건이라 그렇게 했고, RED 단계를 따로 커밋하지 않았습니다.

## 검증

- `pnpm --filter @gh-radar/webapp run typecheck`(앱 + e2e): 0 오류
- `pnpm --filter @gh-radar/webapp run test`: 149 파일 · 3537 통과 · 1 skip(기존) · 실패 0
- `playwright test e2e/specs/limitup-report.spec.ts`(dev 3100): P28-R1(1280) · P28-R1b(390 겹침 0) 모두 통과
  - 행 설명 「잠김 최대 27.6억」 · 「잠김 최대 6.9억」(픽스처 summary 는 36.0억 · 22.8억이라 예외가 증명됨)
  - 머리 「잠김 최대 잔량」 넘침 0
  - 레인 2 aria-label 「… 깨짐 09:06:12, 단일가 09:04:01~09:06:01」, `rect[data-slot="limitup-auction"]` 1개, 캡션 「단일가」
- 머리 스크린샷은 e2e 에 임시 줄을 넣어 찍었고, 찍은 뒤 spec 을 원래대로 되돌렸습니다(커밋에 없음).

## 스크린샷(커밋하지 않음)

- `/Users/alex/repos/gh-radar/.planning/quick/261005-x9o-lock-max-residual/shots/limitup-report-1280.png`: 전체 페이지. 레인 2 의 회색 단일가 면(09:04~09:06), 파란 「깨짐 직전 1분」 면, 잠김 음영이 구분되고, 캡션 「단일가」가 왼쪽 아래에 있습니다.
- `/Users/alex/repos/gh-radar/.planning/quick/261005-x9o-lock-max-residual/shots/limitup-report-390.png`: 폰. 메타 「잠김 최대 27.6억」이 한 줄에 들어가고, 「단일가」 · 「깨짐 직전 1분」 캡션이 나란히 있으며 겹치지 않습니다.
- `/Users/alex/repos/gh-radar/.planning/quick/261005-x9o-lock-max-residual/shots/limitup-grid-head-1280.png`: 뷰포트 캡처. 머리 「잠김 최대 잔량」이 열 안에 들어가고 값은 27.6억입니다. 전체 페이지 캡처에서는 고정 앱 머리가 이 머리줄을 가립니다.

## Known Stubs

없음.

## Self-Check: PASSED

- 커밋 `fccdc183` · `b14ec955` 이 있습니다(`git rev-list --count 497bd3b8..HEAD` = 2).
- 수정 파일 9개와 스크린샷 3개가 있습니다.
