---
phase: quick-260923-onn
plan: 01
status: complete
subsystem: webapp/trading-workbench
tags: [workbench, strategy-card, latch-led, account-panel, tabs, quick]
requires:
  - latchLedStateOf (latch-led.tsx) — LED 판정 1곳
  - AccountPanel section 임베드(⑪) · StrategyLog embed
  - 작업대 selectUnfilled / liveSelected (D-21)
provides:
  - LatchLed variant="dot" (접힌 카드 헤더 전용)
  - CardHeader 접힘 l2 요약 칩(미체결 N · 잔고 N주)
  - card-account-slice.ts (cardUnfilledOf · cardHoldingOf · cardAccountSliceOf)
  - CardTabs (정보 | 미체결 N | 잔고 | 로그 N)
  - AccountPanel embedScope="stock" · embedEmptyTitle
  - StrategyLog emptyTitle
  - nextUnfilledSelection (shared-panels.tsx) — 재선택=해제 토글 유일 지점
affects:
  - webapp /trading 작업대 전략 카드(접힘 헤더 · 펼친 본문 상단)
tech-stack:
  added: []
  patterns:
    - 카드 계좌 상태 슬라이스 1회 파생 → 헤더 칩 · 탭 배지 · 탭 본문이 같은 값 읽음
    - 선택 상태는 작업대 하나, 카드는 selectedUnfilled?.orderNo 파생만
key-files:
  created:
    - webapp/src/components/trading/card/card-account-slice.ts
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/__tests__/card-account-slice.test.ts
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
  modified:
    - webapp/src/components/trading/latch-led.tsx
    - webapp/src/components/trading/card/card-header.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/workbench/shared-panels.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/__tests__/latch-led.test.tsx
    - webapp/src/components/trading/__tests__/card-header.test.tsx
    - webapp/src/components/trading/__tests__/strategy-card.test.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/src/components/trading/__tests__/shared-panels.test.tsx
    - webapp/src/components/trading/__tests__/trading-workbench.test.tsx
decisions:
  - 점 변형은 LatchLed 안 별도 분기(LatchLedDot)로 두고 latchLedStateOf 결과 객체만 받는다 — 칩 분기 DOM 무변경
  - 카드 탭 선택 콜백은 카드 계좌 = 상태줄 계좌일 때만 배선(selectedUnfilled 조건과 같은 술어)
  - AccountPanel 임베드 루트에 data-scope 속성을 두 스코프 모두에 추가(플랜 behavior 대로 기본은 "account")
metrics:
  duration: "13분 (플랜 읽기 직후 기록한 시각부터 SUMMARY 작성까지 실측 · Playwright 2.9분 포함)"
  completed: 2026-09-23
  tasks: 3
  files: 18
estimate:
  tokens: 190000
actuals:
  tokens: 20600
  tasks: 3
  commits: 2
plan_head_before: 00100f0da7780acdc95204c0054c9fe49b53facc
---

# Quick 260923-onn: 작업대 카드 — 접힌 헤더 LED 점 + 요약 칩 · 펼친 카드 정보|미체결|잔고|로그 탭 Summary

접힌 전략 카드 헤더 2줄째를 LED 점 3개(latchLedStateOf 판정 그대로) + 「미체결 N」·「잔고 N주」 요약 칩으로, 펼친 카드 본문 상단(종전 QuoteGrid10 자리)을 이 카드 종목·거래소·계좌로 자른 계좌 상태를 쓰는 「정보 | 미체결 N | 잔고 | 로그 N」 탭으로 바꿨다(목업 ①A · ②A). 새 relay/REST 경로 0, 새 의존성 0.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| T1 | `12e88a2` | feat(quick-260923-onn): 접힌 카드 헤더 LED 점 3개 + 미체결·잔고 요약 칩 · 카드 계좌 슬라이스 순수 함수 |
| T2 | `381dd52` | feat(quick-260923-onn): 펼친 카드 정보\|미체결\|잔고\|로그 탭 — AccountPanel stock 스코프 임베드 · 선택 토글 헬퍼 공유 · 작업대 배선 |
| T3 | (없음) | 게이트만 실행 — 남은 코드·테스트 변경 0 이라 커밋하지 않음 |

push 하지 않았다. `git rev-list --count 00100f0..HEAD` = 2.

## 무엇을 했나

- **T1 (TDD)** — RED: 신규 5케이스 실패 + card-account-slice.test 모듈 없음으로 실패(`Tests 5 failed | 49 passed`) 확인 뒤 GREEN.
  - `LatchLed variant="dot"`: `button|span[data-slot="latch-led"][data-variant="dot"]`, 24px 히트 · 10px 도트(DOT_CLASS 재사용) · sr-only 「{이름} 래치 {라벨}」 · 툴팁 항상(「{이름} · {라벨}」 + 있으면 C# 원문). 칩 분기는 한 글자도 안 바꿨다.
  - `CardHeader`: `unfilledCount?` · `holdingQty?` 추가. `open=false` 일 때만 `latch-led-dots` 그룹 + `card-summary-unfilled`(>0) + `card-summary-holding`(>0) — 손익 없음. `open=true` 는 종전 칩 3개.
  - `card-account-slice.ts`: 순수 함수 3종. 규칙은 `cardForUnfilled` 와 같다(같은 ISIN ∧ 거래소), 잔고는 거래소 무관 · qty 0 톰스톤 제외.
  - `StrategyCard`: `useRelayContext().accountStates` → `useMemo(cardAccountSliceOf)` 1회 → 헤더 숫자.
- **T2 (TDD)** — RED: 신규 7케이스 실패 + card-tabs.test 모듈 없음(`Tests 7 failed | 99 passed`) 확인 뒤 GREEN.
  - `AccountPanel`: `embedScope?: 'account'|'stock'`, `embedEmptyTitle?`. stock = 미체결 5열(구분 첫 셀에 선택 핸들 + 출처 배지 + StatusNotes) · 잔고 6열, 취소 결과 행 colSpan 5/7. 같은 `cancelButton`/`rowSelectProps`/`selectHandle` 클로저. `EmptyState.body` 선택화.
  - `StrategyLog`: `emptyTitle?`(embed 빈 상태 제목).
  - `shared-panels.tsx`: `nextUnfilledSelection` 추출, `handleSelect` 가 호출(동작 불변).
  - `card-tabs.tsx`: Radix Tabs 4탭 · h-6 트리거 · 배지 `card-tab-count`(미체결·로그, 0 생략) · 본문 래퍼 `max-h-[210px] overflow-auto` · 빈 문구 「이 종목의 미체결이 없어요」/「보유 없음」/「로그 없음」 · 탭 state 는 컴포넌트 안(저장 헬퍼 미사용).
  - `StrategyCard`: QuoteGrid10 → `<CardTabs account={slice.account} …/>`, 새 props `selectedOrderNo` · `onSelectUnfilled` · `priceOf` · `originOf` · `onCancelSubmitted`.
  - `TradingWorkbench`: `onSelectUnfilled={c.accountNo === accountNo ? selectUnfilled : undefined}` · `priceOf`, `WorkbenchCardItem` → `selectedOrderNo={selectedUnfilled?.orderNo ?? null}`.
- **T3** — 전량 게이트(아래). 깨진 e2e 단언 0건.

## 게이트 결과 (원문)

- config `build_command` — `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` → **exit 0** (`BUILD_EXIT=0`)
- `pnpm --filter @gh-radar/webapp run test` → **exit 0** · `Test Files  94 passed (94)` · `Tests  1561 passed | 1 skipped (1562)` (stderr 로그는 home/stock/scanner 기존 테스트의 의도된 에러 경로 출력 — 이번 변경 무관)
- `cd webapp && pnpm exec playwright test trading-workbench` → **exit 0** · `38 passed (2.9m)` · 0 fail
- `git diff --quiet HEAD -- pnpm-lock.yaml package.json webapp/package.json` → 변경 0 (`DEPS_UNCHANGED`)
- T1 verify(6파일): `Test Files 6 passed (6)` · `Tests 102 passed (102)` + grep 게이트 통과 · `quote-grid-10.tsx` 무변경
- T2 verify(6파일): `Test Files 6 passed (6)` · `Tests 209 passed (209)` + grep 게이트 통과

## 갱신한 기존 단언

1건 — `trading-workbench.test.tsx` 「카드에 전략 배열·라벨 Map 을 prop 으로 내리지 않는다」의 허용 prop 집합에 `selectedOrderNo` · `onSelectUnfilled` · `priceOf` 추가(새 계약 — 문자열|null · 작업대 안정 콜백). 같은 파일 「카드 콜백은 모든 카드에 같은 참조」에 두 콜백 참조 동일 단언을 **추가**. 그 밖의 기존 단언(latch-led · card-header · strategy-card · strategy-card-flow · card-body · account-panel · shared-panels · strategy-log · e2e spec)은 수정 0건.

## 사실 기록

- `originOf` / `onCancelSubmitted` 는 **공용 패널과 카드 탭 양쪽 모두 미배선**이다(작업대가 오늘 어느 쪽에도 넘기지 않는다). 카드는 prop 통로만 갖고 출처를 지어내지 않는다.
- 사람 확인(목업 ①A/②A 육안 대조)은 수행하지 않았다 — 플랜상 선택 항목. Playwright 6(접힘 스택 한 칸) · 9(정보 탭 기본 10칸) · 10/11(펼친 칩) · GC2 · GC4 는 통과.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] trading-workbench.test 허용 prop 목록 갱신이 T2 에서 필요**
- **Found during:** Task 2 회귀
- **Issue:** 작업대가 카드에 새 prop 3개를 내리자 「허용 prop 집합」 단언이 실패(플랜은 T3 후보로만 예상, T2 files 목록에 없음 — 플랜 전체 files_modified 에는 있음).
- **Fix:** 새 계약으로 허용 집합 확장 + 안정 콜백 참조 단언 추가 + 카드 탭 선택 배선 케이스 1건 추가(다른 계좌 카드 `onSelectUnfilled` undefined · `selectedOrderNo` 파생 · 공용 패널 행 `data-selected` 동기).
- **Commit:** `381dd52`

**2. [플랜 사실 불일치] trading-workbench.test 는 실물 StrategyCard 를 렌더하지 않는다**
- 플랜 T2-7 「실물 StrategyCard 를 렌더하므로 새 prop 배선이 여기서 실행된다」 — 실제로는 `vi.mock('@/components/trading/card/strategy-card')` 스텁이다. 그래서 배선은 스텁이 기록한 prop 으로 단언했고(위 1), 실물 카드 경로는 strategy-card.test · card-tabs.test · Playwright 가 덮는다.

**3. [해석] `data-scope` 속성**
- 플랜 ONN-D 는 「embedScope 미지정이면 종전과 한 글자도 다르지 않다」고 하면서 behavior 는 기본 `data-scope="account"` 를 요구한다. behavior 대로 두 스코프 모두 루트에 `data-scope` 를 붙였다 — 기본 경로의 열·문구·행 DOM 은 불변이고 루트 속성 1개만 늘었다(기존 테스트 무수정 초록).

**4. [절차] master 직접 커밋**
- executor 프로토콜의 보호 브랜치 가드(`git.base-branch --is-protected master` = true)와 달리, 오케스트레이터 지시와 이 저장소의 quick 운영(순차 · main tree · master 커밋)을 따라 master 에 커밋했다. push 없음. 커밋 메시지는 사용자 규칙대로 한글 · Co-Authored-By 없음.

**5. [TDD 절차] T1 에서 latch-led 구현을 먼저 쓴 뒤 되돌려 RED 를 확인**
- 구현을 scratchpad 로 옮기고 `git checkout -- latch-led.tsx` 로 원본 복귀 → 테스트 작성 → RED 확인 → 구현 복원. 커밋 내용에는 영향 없음.

## Known Stubs

없음.

## Threat Flags

없음 — 새 송신 경로 0. 카드 탭 취소는 AccountPanel 같은 클로저(확인 다이얼로그 · row.isin 키 · 결과 모름 잠금), `selectedAccountNo` = 카드 계좌. 선택 콜백은 카드 계좌 = 상태줄 계좌일 때만(T-onn-04), 점 클릭 불가는 비상호작용 span(T-onn-02).

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/card/card-account-slice.ts
- FOUND: webapp/src/components/trading/card/card-tabs.tsx
- FOUND: webapp/src/components/trading/__tests__/card-account-slice.test.ts
- FOUND: webapp/src/components/trading/__tests__/card-tabs.test.tsx
- FOUND: 12e88a2
- FOUND: 381dd52
