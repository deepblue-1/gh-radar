---
phase: 42-tick-chart-candle-overlay
verified: 2026-11-13T11:30:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - ".planning/phases/42-tick-chart-candle-overlay/42-01-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-01-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-02-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-02-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-03-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-03-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-04-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-04-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-05-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-05-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-06-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-06-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-07-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-07-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-08-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-08-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-09-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-09-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-10-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-10-SUMMARY.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-11-PLAN.md"
  - ".planning/phases/42-tick-chart-candle-overlay/42-11-SUMMARY.md"
  - "packages/shared/src/tick-api.ts"
  - "server/tests/routes/ticks.test.ts"
  - "supabase/migrations/20261113100000_tick_open_accum_avg_px.sql"
  - "supabase/tests/tick_viewer.test.sql"
  - "webapp/src/components/ticks/candle-chart-band.tsx"
  - "webapp/src/components/ticks/candle-chart-caption.tsx"
  - "webapp/src/components/ticks/candle-chart-title.tsx"
  - "webapp/src/components/ticks/candle-chart.tsx"
  - "webapp/src/components/ticks/candle-lower-layers.tsx"
  - "webapp/src/components/ticks/candle-ma-chips.tsx"
  - "webapp/src/components/ticks/candle-ma-form.tsx"
  - "webapp/src/components/ticks/candle-price-layer.tsx"
  - "webapp/src/components/ticks/candle-return-layer.tsx"
  - "webapp/src/components/ticks/candle-unit-menu.tsx"
  - "webapp/src/components/ticks/chart-kind-switch.tsx"
  - "webapp/src/components/ticks/tick-chart-band.tsx"
  - "webapp/src/components/ticks/tick-chart.tsx"
  - "webapp/src/components/ticks/tick-viewer-page.tsx"
  - "webapp/src/components/ticks/tick-viewer.tsx"
  - "webapp/src/lib/ticks/candle-chart.ts"
  - "webapp/src/lib/ticks/candle-ma.ts"
  - "webapp/src/lib/ticks/candle-prefs.ts"
  - "webapp/src/lib/ticks/candle-readout.ts"
  - "webapp/src/lib/ticks/candle-returns.ts"
  - "webapp/src/lib/ticks/daily-closes.ts"
  - "webapp/src/lib/ticks/use-candle-prefs.ts"
  - "webapp/src/lib/ticks/use-prev-closes.ts"
  - "webapp/src/lib/ticks/use-view-sync.ts"
  - "webapp/src/styles/globals.css"
covered_digest: "v4:sha256:78762ba94b1f3281f5f5576a167c64efd2ec1fbd8a35b37fde2059f0e993fbcd"
behavior_unverified: 0
overrides_applied: 0
advisory:
  - finding: "WR-02 — 수익률 판 「팀 체결 없음」 · 눈금 표시가 창 밖 커서 점까지 포함한 day 로 갈린다(보기 창이 팀 첫 매수 전 구간이면 그날 체결이 있어도 「팀 체결 없음」)"
    category: other
    reason: "코드 리뷰 경고. 코드로 직접 확인했다(`candle-return-layer.tsx` hasDay 가 day 로 판정). SC-4/SC-5 의 문장을 깨지 않는 표시 결함이라 막지 않는다."
    evidence_status: "코드 읽기로 확인 · 실패 테스트 없음"
  - finding: "WR-01 — `candle-chart.tsx` 의 `turnoverPathsOf` 가 마우스 이동마다 메모 없이 다시 돈다(선 차트 tick-chart.tsx:421 도 같은 꼴)"
    category: other
    reason: "SC-7 의 「봉 집계는 세션 · 단위당 1회」 는 지켜진다(WeakMap 캐시). 호버 비용은 선 차트와 같은 수준이고 운영 UAT 11번(대량 체결 종목)에서 매끄럽다고 확인됨."
    evidence_status: "코드 읽기 · UAT 11 됨"
  - finding: "WR-03 — 키보드로 차트 종류를 바꾸면 초점이 body 로 떨어진다(조건부 렌더 언마운트)"
    category: other
    reason: "접근성 결함. D-04(두 차트 동시 마운트 금지) 결정과 맞물린 후속 개선 사항이다."
    evidence_status: "코드 읽기"
---

# Phase 42: 틱뷰어 봉차트 · 이동평균 · 수익률 겹쳐보기 검증 보고서

**Phase Goal:** 틱뷰어 차트에서 「가격 흐름(봉 · 이동평균 · 거래량)」과 「팀 매집(주문 원 · 평단 · 순매수)」을 한 시간축에 겹쳐 본다. 기존 차트는 건드리지 않고 새 차트를 별도 컴포넌트로 만들어 전환 스위치로 번갈아 본다.
**Verified:** 2026-11-13T11:30:00Z
**Status:** passed
**Re-verification:** No — 최초 검증

## 요약

목표는 달성됐다. SUMMARY 의 주장을 믿지 않고 코드를 직접 읽었다. 봉 차트가 새 파일로 존재하고(실질 구현 · 스텁 아님), 뷰어 `tick-viewer.tsx` 에 결선돼 있으며, 가격 판 · 수익률 판 · 아래 세 판 · 값 띠 · 캡션 · 제목 줄이 모두 `candle-chart.tsx` 에서 실제로 그려진다. 기존 선 차트 diff 는 허용 범위(선택 입력 3개 · `export` 2단어 · `useViewSync` · 대기 중 숨김)뿐이다. 차트 라이브러리 import 는 0건이고, 봉 차트 파일에 TBD · FIXME · XXX · TODO 마커는 없다. 하루 전체 ticks 스위트를 이 검증에서 직접 다시 돌려 45파일 · 800 테스트가 모두 통과했다.

터치 · 체감 성능 같은 사람 눈 항목(SC-6 의 폰 길게 누르기 · SC-7 의 매끄러움 등)은 jsdom 으로 증명할 수 없는데, 사용자가 운영(`trade.jx1.io`)에서 폰 · PC 로 확인표 1 ~ 12 를 모두 「됨」 으로 확인했다(42-11-SUMMARY.md 기록). 그래서 미해결 사람 검증 항목은 없다.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 1 ~ 7)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | 제목 줄 「선 차트 \| 봉 차트」 스위치로 두 차트를 오가고, 고른 쪽이 브라우저에 기억된다(처음은 선 차트) · 바꿔도 보던 구간 유지(D-24) · 선 차트 diff = 스위치 연결부 + 선택 입력 | ✓ VERIFIED | `chart-kind-switch.tsx`(`role="group"` `aria-label="차트 종류"` · `aria-pressed`) · `tick-viewer.tsx:332` `useChartKind()`(기억 키 `gh-radar:tick-chart-kind` · `candle-prefs.ts:21`) · `tick-viewer.tsx:341-348` `onKindChange` 가 `lastViewRef` 를 `switchView` 로 넘기고 `:531-564` 가 `initialView={switchView}` 로 양쪽 차트에 전달. `git diff b72dcd0f HEAD -- tick-chart.tsx` = `titleAddon` · `initialView` · `onViewChange` · `useViewSync` · `export` 2개 · `visibility` 1줄뿐(범위 밖 0). `tick-chart-band.tsx` diff = `export` 4단어. `chart-kind-switch.test` · `tick-chart-view-sync.test` 통과. UAT 1 · 9 됨 |
| SC-2 | 봉 단위 「자동 · 1 · 5 · 10 · 15 · 30 · 60분」 · 시/고/저/종/거래대금이 체결(A3) 직접 집계와 일치 · 자동 = 봉 폭 4px 이상 가장 작은 단위 | ✓ VERIFIED | `candle-chart.ts:105-181` `buildBase`(중복 · 가격 0 · 수량 0 · 08:00 전 · 20:00 뒤 제외, O/H/L/C/Σ가격×수량) + `rollUp`(08:00 정시 맞물림) · `:197` `candlesOf` WeakMap 캐시 · `:382-388` `autoUnitOf`(`CANDLE_AUTO_MIN_PX = 4` 이상 첫 단위, 없으면 60). `candle-unit-menu.tsx` 메뉴 · `candle-chart.tsx:307-311` 단위 결선. `candle-chart.test.ts`(집계 `toBe` 오라클) · `candle-unit-menu.test` 통과. UAT 2 · 3 됨 |
| SC-3 | 이동평균 「봉 기준 \| 일 기준」 × 기간 × (봉 기준은 단순 \| 지수) 최대 6개 · 정의식 일치 · 모자라는 구간은 그리지 않음 · 구성 기억 | ✓ VERIFIED | `candle-ma.ts:74-107` `smaOf`(누적합 · i<N−1 NaN) · `emaOf`(α=2/(N+1) · 시드=처음 N 봉 평균) · `daySmaOf`(앞 N−1 종가 + 그 봉 종가 ÷ N · 모자라면 NaN) · `:31` `MA_MAX_LINES = 6` · `:63-71` `isValidMaSpec`(기간 2 ~ 240 · 일 + 지수 거부) · `candle-prefs.ts:23` 기억 키 · `daily-closes.ts` + `use-prev-closes.ts` 앞 거래일 종가 조회 · 색 토큰 `--ma-1` ~ `--ma-6` 라이트 · 다크 `globals.css`. `candle-ma.test` · `daily-closes.test` · `candle-ma-form.test` · `candle-prefs.test` 통과. UAT 4 · 5 됨 |
| SC-4 | 팀 주문 원 · 당일 평단 · 우리 체결 ◆ · 근거 ○ 가 봉과 한 시간축에 겹침 · 수익률 판 당일 수익률 커서 시점 값 = 팀 거래정보 패널 「평단 대비 수익률」 | ✓ VERIFIED | `candle-price-layer.tsx:107,175` `teamAvgPathOf`(`data-slot="candle-team-avg"`) · `:187` `candle-price-overlay` children 자리에 `candle-chart.tsx:756-814` 팀 원 · `OwnDiamond` · 근거 ○. `candle-returns.ts:30-31` `dayReturnAt` = `teamKpiAt(...).pnl.ret`(패널과 같은 함수) · `candle-readout.ts:73` 띠도 `teamKpiAt` 쌍. `candle-chart.test.tsx:706-717` 가 현재 틱에서 띠 수익률 글자 = 패널 `[data-slot="tick-team-ret"]` textContent 를 끝-끝 대조. 통과. UAT 6 됨 |
| SC-5 | 과거 날짜 · 매집감지 등록 종목이면 누적 평단 선(가격 판)과 누적 수익률(수익률 판 · 미실현) · 미등록 · 당일은 그 선과 값 띠 누적 줄만 빠지고 나머지는 그대로 | ✓ VERIFIED | DB→화면 한 길: ① `20261113100000_tick_open_accum_avg_px.sql:48` `'avg_px', a.payload->'avg_px'`(STABLE · REVOKE PUBLIC / anon, authenticated · GRANT service_role 유지) ② `packages/shared/src/tick-api.ts` `avg_px?: unknown` ③ `server/tests/routes/ticks.test.ts:252-253` 모양 검사 없이 통과 단언(server src 무변경) ④ `candle-chart.ts:336` `cumAvgPointsOf`(당일 · null · 키 없음 → []) · `:346` `cumAvgPathOf`(px ≤ 0 끊김) ⑤ `candle-returns.ts:97` `cumReturnPointsOf` · `:169` `returnScalesOf`(두 눈금 0% 맞춤). pgTAP `tick_viewer.test.sql:144-151`(키 없음 → JSON null · 있으면 그대로). 운영 DB 에 `20261113100000` Local · Remote 반영(42-11). UAT 7 됨 |
| SC-6 | 선 차트 조작(휠/끌기/핀치 · `+ − 0` · 클릭 시각 점프 · 주문 원 클릭 · ◆ ○ 클릭 · Shift+끌기 구간 합계 · 폰 길게 누르기 · 값 띠)이 봉 차트에서도 동작 | ✓ VERIFIED | `candle-chart.tsx` — `useChartGestures`(휠 · 끌기 · 핀치) · `:598` 클릭 → `onSeekMs(tOfTick(...))` · `:602-604` `onKeyDown` · `:541` Shift+끌기(데스크톱 마우스) + `data-slot="candle-range"` 구간 합계 · `:527-533` ◆ ○ ◇ 클릭 → `onOwnJump` / `onOwnFillLine` · `:584` 원 클릭 → `onJumpRec` · 묶음 상자는 선 차트 `TickGroupBox` 재사용 · 값 띠 `CandleChartBand` 4칸. `candle-chart.test.tsx`(조작 · 겹침) 통과. 폰 길게 누르기는 jsdom 으로 못 재현하나 UAT 8 됨(폰 · PC) |
| SC-7 | 하루 수십만 체결 종목에서도 확대/이동이 선 차트만큼 매끄럽다(봉 집계 세션 · 단위당 1회) | ✓ VERIFIED | `candle-chart.ts:103,183-205` `candleCache`(WeakMap · 세션 → 1분봉 + 단위별 Map) · 같은 세션 · 단위면 같은 객체(캐시 오라클 테스트). 체감 매끄러움은 사람 판정 항목인데 UAT 11 「대량 체결 종목 매끄러움(폰 포함)」 됨. 호버 중복 계산(WR-01)은 아래 Advisory 참고 |

**Score:** 7/7 truths verified (behavior_unverified 0 — 상태 전이 · 정리 불변식류 truth 의 행동 증거는 테스트와 운영 UAT 가 맡는다)

### 목표 문장 대비 핵심 능력

| 능력 | 상태 | 근거 |
|------|------|------|
| 봉 · 이동평균 · 거래량(가격 흐름)이 한 시간축 | ✓ | `candle-price-layer.tsx` — `candlePathsOf` · `maPathOf` · `amountBarsOf` 가 같은 `x`/`y` 로 한 클립 안에 |
| 팀 매집(주문 원 · 평단 · 순매수)이 같은 시간축에 겹침 | ✓ | 가격 판 children 오버레이 + `CandleReturnLayer` + `CandleLowerLayers`(선 차트와 같은 판 함수) |
| 「그때 평단과 수익률」 | ✓ | 값 띠 둘째 칸(평단 · 수익률 = `teamKpiAt`) + 수익률 판 |
| 기존 차트 불변 · 되돌리기 쉬움(D-24) | ✓ | 보호 파일 13개의 `b72dcd0f` 대비 diff 0 · 선 차트 diff 는 선택 입력 범위 · 새 파일 + 스위치 삭제로 원복 가능 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20261113100000_tick_open_accum_avg_px.sql` | RPC `accum.avg_px` | ✓ VERIFIED | `payload->'avg_px'` 한 키 추가 · 권한 불변 · 운영 반영 |
| `packages/shared/src/tick-api.ts` | `avg_px?: unknown` | ✓ VERIFIED | 선택 키 · 옛 응답과 호환 |
| `webapp/src/lib/ticks/candle-chart.ts`(540줄) | 집계 · 기하 · 누적 평단 | ✓ VERIFIED | 실질 로직 · 캐시 · 자동 단위 |
| `webapp/src/lib/ticks/candle-ma.ts`(162줄) | 이동평균 | ✓ VERIFIED | 정의식 일치 |
| `webapp/src/lib/ticks/candle-returns.ts`(235줄) | 당일 · 누적 수익률 · 눈금 | ✓ VERIFIED | `teamKpiAt` 재사용 |
| `webapp/src/lib/ticks/candle-readout.ts` · `candle-prefs.ts` · `daily-closes.ts` · `use-*.ts` | 띠 값 · 기억 · 일 종가 · 훅 | ✓ VERIFIED | 모두 결선 |
| `webapp/src/components/ticks/candle-chart.tsx`(998줄) | 봉 차트 본체 | ✓ VERIFIED | 모든 층 · 조작 결선 |
| `candle-price-layer` · `candle-return-layer` · `candle-lower-layers` · `candle-chart-band` · `candle-chart-caption` · `candle-chart-title` · `candle-unit-menu` · `candle-ma-chips` · `candle-ma-form` · `chart-kind-switch` | 층 · 조작부 | ✓ VERIFIED | 전부 `candle-chart.tsx` / `tick-viewer.tsx` 에서 렌더 |
| `tick-chart.tsx` · `tick-chart-band.tsx` | 최소 diff | ✓ VERIFIED | 허용 범위 안(위 SC-1) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| RPC `accum.avg_px` | 봉 차트 누적 평단 선 | shared 타입 → server 통과 → `cumAvgPointsOf` → `cumAvgPathOf` → `CandlePriceLayer` | ✓ WIRED | 4단 모두 코드 · 테스트로 확인 |
| `ChartKindSwitch` | `tick-viewer.tsx` 조건부 렌더 | `titleAddon` → `kindAddon(phone)` | ✓ WIRED | `:526,531-564` |
| 뷰어 `lastViewRef` | 새 차트 처음 창 | `onViewChange` → `switchView` → `initialView` → `useViewSync` | ✓ WIRED | 양쪽 차트 모두 |
| `teamKpiAt` | 팀 패널 · 수익률 판 · 띠 | `dayReturnAt` · `candleBandAt` | ✓ WIRED | 같은 함수 · 끝-끝 대조 테스트 |
| `usePrevCloses` → `stock_daily_ohlcv` | 일 이동평균 | `candle-chart.tsx:320` → `maValuesOf` | ✓ WIRED | 받는 중 · 실패 · 코드 없음 분기 테스트 |
| `CandleChart` | 선 차트 부품 재사용 | `OwnDiamond` · `TickGroupBox`(tick-chart) · 띠 `Head`/`Row`/`Kv`/`Rest`(export) | ✓ WIRED | 복제 대신 export |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| `CandlePriceLayer` 봉 | `candles` | `candlesOf(session, unit)` ← A3 체결 | 예 | ✓ FLOWING |
| `CandlePriceLayer` 누적 평단 | `cumAvg` | RPC `payload->'avg_px'` ← `limitup_accum_flow` | 예(과거 · 등록 종목) | ✓ FLOWING |
| `CandleReturnLayer` 당일 | `day` | `teamKpiAt` ← `session.team` | 예 | ✓ FLOWING |
| 일 이동평균 | `prev` | `stock_daily_ohlcv` 조회 | 예 | ✓ FLOWING |

### Behavioral Spot-Checks

| 동작 | 명령 | 결과 | Status |
|------|------|------|--------|
| ticks 스위트(`src/lib/ticks` · `src/components/ticks` · `src/styles`) | `pnpm exec vitest --run ... --maxWorkers=2` | 45 파일 · 800 테스트 통과 | ✓ PASS |
| 전체 회귀(오케스트레이터 보고 · 42-11) | webapp 257 파일 6,312 통과 · server ticks 34 · pgTAP 141/141 · relay 65 파일 2,006 | 통과 | ✓ PASS(보고 인용 · 이번엔 ticks 스위트만 직접 재실행) |
| 차트 라이브러리 import | `grep lightweight-charts\|recharts\|d3 candle-*` | 0건 | ✓ PASS |

### Probe Execution

해당 없음(이 phase 는 `probe-*.sh` 를 선언하지 않았다).

### Requirements Coverage

REQUIREMENTS.md 에 이 phase 의 요구사항 ID 가 없다(`Requirements: TBD`). 플랜의 SC-1 ~ SC-7 이 ROADMAP 성공 기준이며 위 표에서 7개 모두 확인했다. 고아 요구사항 없음.

| 항목 | 상태 | 근거 |
|------|------|------|
| SC-1 ~ SC-7 | ✓ SATISFIED | 위 Observable Truths |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase 신규 · 수정 파일) | — | TBD · FIXME · XXX · TODO · HACK | — | 0건. 부채 마커 게이트 통과 |
| `candle-return-layer.tsx` | 34 · 85-94 · 106-118 | `hasDay` 가 창 밖 커서 점까지 포함(WR-02) | ⚠️ Warning | 보기 창이 팀 첫 매수 전일 때 「팀 체결 없음」 오표시 가능. 성공 기준 문장은 깨지 않음 |
| `candle-chart.tsx` | 362-364 | 메모 없는 `turnoverPathsOf`(WR-01) | ⚠️ Warning | 호버마다 O(창 안 체결 수). 선 차트와 같은 꼴 · UAT 11 매끄러움 확인 |
| `tick-viewer.tsx` / `chart-kind-switch.tsx` | 341-348 | 키보드 전환 시 초점 손실(WR-03) | ⚠️ Warning | 접근성 |
| `candle-chart.ts` 등 | — | IN-01 ~ IN-05(참고 5건) | ℹ️ Info | 코드 리뷰에 기록됨 |

코드 리뷰(`42-REVIEW.md`)는 치명 0 · 경고 3 · 참고 5 이며, `42-REVIEW-DISPOSITION.md` 에 8건 모두 `open` 으로 기록돼 있다. 어느 것도 성공 기준 7개를 깨지 않고 목표를 막지 않으므로 BLOCKER 가 아니다. 다만 아직 처리 방침이 정해지지 않았다는 점은 남는다.

### Human Verification Required

없음. 사용자가 운영(폰 · PC)에서 확인표 1 ~ 12 를 모두 「됨」 으로 확인했다(42-11-SUMMARY.md · 42-VALIDATION.md 서명 2026-11-13). 여기에는 NXT 화면 일 이동평균이 KRX 일봉 종가 기준이어도 괜찮다는 가정 A5 승인(UAT 12)도 포함된다.

### Deferred Items

없음.

## Gaps Summary

막는 갭이 없다. 7개 성공 기준 모두 코드 · 테스트 · 운영 UAT 증거가 있다. 후속으로 정리하면 좋은 것은 코드 리뷰 경고 3건이다. WR-02(수익률 판 빈 상태 오표시)는 코드로 직접 확인된 실제 표시 결함이라 가장 먼저 손볼 가치가 있고, WR-01(호버 메모)과 WR-03(전환 시 초점)이 뒤를 잇는다. 이들은 `/gsd-code-review-fix 42` 또는 별도 quick 작업으로 처리하면 된다.

---

_Verified: 2026-11-13T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
