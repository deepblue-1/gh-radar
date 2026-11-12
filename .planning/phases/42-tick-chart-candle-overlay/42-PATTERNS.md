# Phase 42: 틱뷰어 봉차트·이동평균·수익률 겹쳐보기 - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 24 (새 파일 18 · 고칠 파일 6)
**Analogs found:** 24 / 24

> 기존 차트 함수 지도(재사용 export 표)는 `42-RESEARCH.md` 「기존 코드 지도」 · 「Recommended Project Structure」 · Pattern 1 ~ 8 이 정본이다. 여기는 **새 파일마다 어느 파일을 본뜰지 + 발췌**만 더한다. 모든 analog 경로는 `git ls-files` 로 추적 파일임을 확인했다.

## File Classification

| 새/고칠 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `webapp/src/lib/ticks/candle-chart.ts` | utility(순수 기하) | transform | `webapp/src/lib/ticks/tick-chart.ts` | exact |
| `webapp/src/lib/ticks/candle-returns.ts` | utility(순수 계산) | transform | `tick-chart.ts` + `lib/ticks/team-model.ts:152-167`(`teamKpiAt`) | exact |
| `webapp/src/lib/ticks/candle-prefs.ts` | store(localStorage 구독) | event-driven | `webapp/src/lib/sidebar-collapse.ts` + `hooks/use-sidebar-collapsed.ts` | exact |
| `webapp/src/lib/ticks/daily-closes.ts` | service(Supabase 브라우저 읽기) | request-response | `webapp/src/lib/daily-ohlcv-api.ts` | exact |
| `lib/ticks/__tests__/candle-chart.test.ts` · `candle-returns.test.ts` | test | — | `lib/ticks/__tests__/tick-chart.test.ts` | exact |
| `lib/ticks/__tests__/candle-prefs.test.ts` | test | — | (sidebar-collapse 테스트 있으면 그것) + jsdom localStorage | role-match |
| `lib/ticks/__tests__/daily-closes.test.ts` | test | — | `webapp/src/lib/__tests__/daily-ohlcv-api.test.ts` | exact |
| `components/ticks/candle-chart.tsx` | component | render | `components/ticks/tick-chart.tsx` (조작 골격 복제) | exact |
| `components/ticks/candle-chart-band.tsx` | component | render | `components/ticks/tick-chart-band.tsx` | exact |
| `components/ticks/chart-kind-switch.tsx` | component | event | `components/trading/lc/setting-group.tsx:1130-1240`(`ChoiceRow` 세그먼트 radiogroup) | role-match |
| `components/ticks/candle-unit-menu.tsx` | component(Popover 목록) | event | `components/analytics/limitup-date-nav.tsx:114-204` + 위 radiogroup 키보드 | role-match |
| `components/ticks/candle-ma-chips.tsx` | component | event | `components/theme/theme-chips.tsx` | role-match |
| `components/ticks/candle-ma-form.tsx` | component(팝오버 ↔ 시트) | event | `components/me/push-alert-bell.tsx:76-146` | exact |
| `components/ticks/__tests__/*.test.tsx` (5개) | test | — | `components/ticks/__tests__/tick-chart.test.tsx` | exact |
| `supabase/migrations/<ts>_tick_open_accum_avg_px.sql` | migration(RPC 전체 재정의) | CRUD | `supabase/migrations/20261103210000_tick_open_listing_shares.sql` | exact |
| `supabase/tests/tick_viewer.test.sql` (D 절 추가) | test(pgTAP) | — | 같은 파일 134 ~ 143행 | exact |
| `packages/shared/src/tick-api.ts` | model(타입) | — | 같은 파일 140행 `accum` 타입 | exact |
| `server/tests/routes/ticks.test.ts` | test | — | 같은 파일 98행 `accum` 픽스처 | exact |
| `webapp/src/styles/globals.css` · `styles/__tests__/tds-tokens.test.ts` | config · test | — | 같은 파일 `THEME_COLOR_TOKENS` 루프(150 ~ 158행) | exact |
| `components/ticks/tick-chart.tsx`(전환 스위치 자리 · 보기 창 공유) | component | — | RESEARCH Pattern 참조 | exact |

## Pattern Assignments

### `webapp/src/lib/ticks/candle-chart.ts` · `candle-returns.ts` (utility, transform)

**Analog:** `webapp/src/lib/ticks/tick-chart.ts`

**머리 주석 + import 규약** (1 ~ 24행) — 번호 매긴 머리 주석(①②③…)으로 판 치수 · 시각 축 · 솎기 규칙 · 「컴포넌트는 그리기만, 기하는 여기서 테스트가 잠근다」를 적는다. import 순서: `@gh-radar/shared` → `@/lib/...` → 같은 폴더 `./...` 타입.
```ts
import { A3_LAYOUT, dayStartNs, decodeFields, payloadOf, type AccumReportPayload, type TickOpenResponse } from '@gh-radar/shared';

import { posNetPathOf, posNetPointsOf, type PosNetPoint, type View } from '@/lib/accum-chart';
...
import type { TickSession } from './tick-session';

const SEC = 1000;
const MIN = 60 * SEC;
```

**세션당 1회 집계 = WeakMap 캐시** (180 ~ 217행) — `candleBaseOf`(1분봉) · `dayReturnSeriesOf` 가 그대로 따를 모양. 타입드 배열을 a3.n 으로 잡고 `subarray(0, n)` 으로 자른다.
```ts
const seriesCache = new WeakMap<TickSession, PriceSeries>();

export function priceSeriesOf(session: TickSession): PriceSeries {
  const hit = seriesCache.get(session);
  if (hit !== undefined) return hit;
  const { recvOrder, a3Of, a3, index } = session;
  const t = new Float64Array(a3.n);
  ...
  for (let p = 0; p < recvOrder.length; p++) {
    const r = recvOrder[p]!;
    const j = a3Of[r]!;
    if (j < 0) continue;
    const v = a3.px[j]!;
    if (!(v > 0)) continue;
    ...
  }
  const out: PriceSeries = { n, t: t.subarray(0, n), px: px.subarray(0, n), rec: rec.subarray(0, n), maxPx };
  seriesCache.set(session, out);
  return out;
}
```
- 봉 집계 거름(중복 수신 제외 · 가격/수량 0 제외)은 `turnoverSeriesOf`(573 ~ 751행)를 기준으로 삼는다(RESEARCH 지도 참조).
- 판 치수는 `TICK_CHART`(44 ~ 52행) 모양으로 `CANDLE_CHART` 를 새로 두고, `CandlePanels extends TickPanels`(RESEARCH Pattern 1).
- 당일 수익률은 `teamKpiAt`(team-model.ts 152 ~ 167행)만 계산원으로 쓴다(D-14).

---

### `webapp/src/lib/ticks/candle-prefs.ts` (store, event-driven)

**Analog:** `webapp/src/lib/sidebar-collapse.ts` + `webapp/src/hooks/use-sidebar-collapsed.ts`

**키 상수 · 모듈 listeners · 저장 실패 삼키기 · 구독 해제 함수** (sidebar-collapse.ts 16 ~ 65행):
```ts
export const SIDEBAR_COLLAPSED_KEY = 'gh-radar:sidebar-collapsed';

const listeners = new Set<() => void>();

export function setSidebarCollapsed(next: boolean): void {
  if (typeof document === 'undefined') return;
  ...
  try {
    if (next) window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');
    else window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
    /* 저장 불가(사파리 개인 모드 등) — 이번 세션 모양만 바뀐다 */
  }
  for (const cb of listeners) cb();
}

/** 접힘 변경 구독. 해제 함수를 돌려준다(`useSyncExternalStore` 규약). */
export function subscribeSidebarCollapsed(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
```
**훅** (use-sidebar-collapsed.ts 전체) — 서버 스냅샷은 기본값으로 하이드레이션 불일치 0:
```ts
'use client';
import { useSyncExternalStore } from 'react';
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribeSidebarCollapsed, isSidebarCollapsed, () => false);
}
```
적용 시 주의:
- 키 3개는 `gh-radar:` 접두사. getSnapshot 은 **같은 참조**를 돌려야 하므로(객체 · 배열 값) 파싱 결과를 「마지막 원문 문자열 → 마지막 파싱값」으로 캐시한다 — sidebar 는 boolean 이라 이 문제가 없었다.
- parse/validate 는 순수 함수로 export 해 테스트가 직접 잠근다. 저장값이 깨졌으면 기본값으로 떨어진다(throw 금지).
- 탭 간 동기화는 sidebar 처럼 하지 않아도 된다(단순성) — 하려면 `storage` 이벤트를 subscribe 안에서 붙인다.
- 훅은 lib 파일 안에 둬도 되지만, lib 에 `'use client'` 를 넣지 않는 sidebar 규율을 따르려면 훅을 같은 파일 하단이 아닌 `components/ticks` 쪽 사용처나 별도 훅 파일로 분리.

---

### `webapp/src/lib/ticks/daily-closes.ts` (service, request-response)

**Analog:** `webapp/src/lib/daily-ohlcv-api.ts` (18 ~ 92행)
```ts
'use client';

import { createClient } from '@/lib/supabase/client';

export async function fetchDailyOhlcv(code: string, range: DailyOhlcvRangeKey, signal?: AbortSignal): Promise<DailyOhlcvRow[]> {
  const supabase = createClient();
  const from = rangeToFromDate(range);

  let query = supabase
    .from('stock_daily_ohlcv')
    .select('date, open, high, low, close, volume, change_amount, change_rate')
    .eq('code', code)
    .gte('date', from)
    .order('date', { ascending: true });

  if (signal) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return [];
  // numeric 은 string 으로 올 수 있다 → Number() · close 0 행 제외
```
`fetchPrevCloses(code, ymd, n)` 은 `.lt('date', isoOf(ymd)).order('date', { ascending: false }).limit(n)` 뒤 뒤집기. `close` 는 `Number()` 변환 · 0 이하 제외(위 파일 95 ~ 100행 거래정지 처리 주석 참고). RLS 는 anon + authenticated 이미 허용(파일 머리 주석 Pitfall 10).

**테스트 Analog:** `webapp/src/lib/__tests__/daily-ohlcv-api.test.ts` (1 ~ 40행) — 체인 mock + thenable:
```ts
const thenable = {
  then: (resolve: (v: unknown) => void) => resolve(finalResolved),
  abortSignal: (s: AbortSignal) => { recordedAbortSignal = s; return thenable; },
};
const orderMock = vi.fn(() => thenable);
const gteMock = vi.fn(() => ({ order: orderMock }));
const eqMock = vi.fn(() => ({ gte: gteMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase/client', () => ({ ...
```
체인을 `eq → lt → order → limit` 으로 바꿔 쓴다.

---

### `components/ticks/candle-ma-form.tsx` (component, 팝오버 ↔ 시트)

**Analog:** `webapp/src/components/me/push-alert-bell.tsx`

**열림 state 하나 · 폭에 따라 둘 중 하나** (76 ~ 146행):
```tsx
const desktop = native === false && wide;
const [open, setOpen] = useState(false);
const titleId = useId();
const buttonRef = useRef<HTMLButtonElement>(null);
return (
  <>
    <Popover open={open && desktop} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button ref={buttonRef} type="button" ...>…</button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-labelledby={titleId}
        className="w-[360px] max-w-[calc(100vw-32px)] gap-0 rounded-[16px] bg-[var(--popover)] px-3 pt-3.5 pb-2.5">
        <h2 id={titleId} …>{title}</h2>
        <Panel />
      </PopoverContent>
    </Popover>

    <Sheet open={open && !desktop} onOpenChange={setOpen}>
      <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined}
        onCloseAutoFocus={(e) => { e.preventDefault(); buttonRef.current?.focus(); }}
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-[22px] bg-[var(--card)] px-4 pt-2.5 pb-6">
        <div aria-hidden="true" className="mx-auto mb-2.5 h-1 w-9 shrink-0 rounded-full bg-[var(--raised-2)]" />
        <SheetHeader className="border-0 p-0"><SheetTitle …>{title}</SheetTitle></SheetHeader>
        <Panel />
      </SheetContent>
    </Sheet>
  </>
);
```
- 본문은 한 컴포넌트(`Panel`)로 두 면이 공유. import 는 `@/components/ui/popover` · `@/components/ui/sheet`.
- 폭 판정: UI-SPEC 이 정한 경계(`TICK_CHART.PHONE_MAX_W` 600 기준 여부)를 따르고, push-alert-bell 의 `useWideViewport`(768) 를 그대로 가져오지 않는다 — 판정 기준만 바꿔 같은 모양.
- 시트는 `NativeOverlayMarker` 를 이미 렌더한다(머리 주석 ⑤) — 따로 할 일 없음.

---

### `components/ticks/chart-kind-switch.tsx` · `candle-unit-menu.tsx` (component, event)

**Analog:** `webapp/src/components/trading/lc/setting-group.tsx` (1200 ~ 1240행 `ChoiceRow` 세그먼트)
```tsx
const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const buttons = Array.from(segRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
  buttons[(at + step + buttons.length) % buttons.length]?.focus();
};
...
<div ref={segRef} role="radiogroup" aria-label={a11yName} onKeyDown={onKeyDown}
  className="inline-flex flex-none items-center gap-0.5 rounded-[9px] bg-[var(--muted)] p-0.5">
  {options.map((o) => (
    <button key={o.value} type="button" role="radio" aria-checked={o.value === value} …/>
  ))}
</div>
```
- 스위치(선/봉)는 선택이 곧 전환이라 저기처럼 「화살표 = 포커스만」이 아니라 UI-SPEC 의 키보드 규칙을 따른다(차이가 있으면 UI-SPEC 우선). 선택 면 토큰은 기존 `--seg-on-*`.
- 봉 단위 메뉴의 Popover 껍데기는 `components/analytics/limitup-date-nav.tsx:114-204`(`<Popover open onOpenChange>` + `PopoverTrigger asChild` + `PopoverContent`) 를 본뜨고, 안의 목록에 위 radiogroup 을 넣는다.

### `components/ticks/candle-ma-chips.tsx`
**Analog:** `webapp/src/components/theme/theme-chips.tsx` — 칩 줄 + 끝 버튼 모양. 칩 색은 새 `--ma-1 ~ --ma-6`.

### `components/ticks/candle-chart.tsx` · `candle-chart-band.tsx`
**Analog:** `components/ticks/tick-chart.tsx` · `tick-chart-band.tsx` — `useChartView` · `useChartGestures` · `useChartWidth` · `createTouchInspect` 조작 골격을 그대로 복제(RESEARCH 지도 · UI-SPEC S1 「훅 수정 금지」).

---

### 컴포넌트 테스트 5개 (`components/ticks/__tests__/*.test.tsx`)

**Analog:** `webapp/src/components/ticks/__tests__/tick-chart.test.tsx` (1 ~ 45행)
```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { a3TimeMs, type TickOpenResponse, … } from '@gh-radar/shared';
import { tickBoundsOf } from '@/lib/ticks/tick-chart';
import { SYNTH_DATE, SYNTH_ISIN, a3Msg, b6Msg, synthNs, synthSession } from '@/test-fixtures/tick-synth';
import { TickChart } from '../tick-chart';

/**
 * Phase 37 Plan 14 Task 2 — …
 * 깨지면: <사용자가 보게 될 고장을 일상어로>.
 */
const krx = synthSession([
  [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
  [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
  …
]);
```
머리 주석에 「깨지면:」 문단을 두는 규약을 따른다. 순수 lib 테스트는 `lib/ticks/__tests__/tick-chart.test.ts` 1 ~ 25행처럼 `@/test-fixtures/tick-synth` · `tick-grid` 픽스처를 쓴다.

---

### `supabase/migrations/<ts>_tick_open_accum_avg_px.sql` (migration, RPC 전체 재정의)

**Analog:** `supabase/migrations/20261103210000_tick_open_listing_shares.sql` (65행 전체가 템플릿)
- 머리 주석: 무엇을 더하는지 · 「나머지 계약은 <이전 마이그레이션> 그대로」 · server 재배포 필요 여부.
- `BEGIN;` → `CREATE OR REPLACE FUNCTION public.tick_open_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp` → **본문 전체 복사** 후 한 줄만 변경 → COMMENT → REVOKE/GRANT → `COMMIT;`
- 바꿀 줄(48 ~ 50행):
```sql
'accum', (SELECT jsonb_build_object('reg_time_ms', a.reg_time_ms, 'pos_net', a.payload->'pos_net')
            FROM public.limitup_accum_flow a
           WHERE a.date = p_date AND a.isin = p_isin),
```
→ `'avg_px', a.payload->'avg_px'` 추가.
- 끝 권한 3줄 그대로(메모리 규칙: REVOKE anon/authenticated 명시):
```sql
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) TO service_role;
```
- ★ 본문 복사 원천은 **가장 최근에 tick_open_for_user 를 재정의한 파일**이어야 한다. 현재 `grep -lE "FUNCTION (public\.)?tick_open"` 결과 최신은 `20261103210000` 이지만, 실행 직전 다시 grep 해 그 뒤 재정의가 없는지 확인할 것(옆 세션 추가 가능).

### `supabase/tests/tick_viewer.test.sql` (pgTAP)
**Analog:** 같은 파일 134 ~ 143행 D 절
```sql
INSERT INTO public.limitup_accum_flow (date, isin, reg_time_ms, payload)
VALUES ('20261030', 'KR7370001001', 1793010000000,
        '{"pos_net": [[1793010000000, 0], [1793010060000, 1500000]], "price": []}'::jsonb);
SELECT is(pg_temp.open1('20261030', 'KRX', 'KR7370001001')->'accum'->'pos_net',
          '[[1793010000000, 0], [1793010060000, 1500000]]'::jsonb, 'D open accum.pos_net = payload.pos_net 그대로');
```
payload 에 `avg_px` 를 넣고 `->'accum'->'avg_px'` 단언 + 키 없는 payload 면 `null` 단언 추가. 29행 `SELECT plan(138);` 을 추가한 단언 수만큼 올린다.

### `packages/shared/src/tick-api.ts` · `server/tests/routes/ticks.test.ts`
- tick-api.ts 140행: `accum: { reg_time_ms: number | null; pos_net: unknown } | null;` → `avg_px?: unknown` 추가(옛 RPC 면 키 없음 — 44 · 88행의 `?:` + 주석 관례).
- ticks.test.ts 98행 픽스처 `accum: { reg_time_ms: …, pos_net: [[…]] }` 에 `avg_px` 를 넣고 응답에 그대로 통과하는지 단언.

### `webapp/src/styles/globals.css` · `styles/__tests__/tds-tokens.test.ts`
- `--ma-1 ~ --ma-6` 을 라이트 · 다크 블록 둘 다 정의(hex/rgb — lightweight-charts 가 아니어도 SVG 인라인 색 일관을 위해 oklch 금지 규칙에 맞춘다).
- 테스트: `THEME_COLOR_TOKENS` 목록에 추가하면 150 ~ 158행 루프가 정의 · oklch 부재를 자동 단언:
```ts
it.each([['라이트', LIGHT], ['다크', DARK]] as const)('%s 블록이 테마 색 토큰 집합을 모두 정의하고 oklch 가 없다', (_label, block) => {
  for (const name of THEME_COLOR_TOKENS) {
    expect(block[name], `--${name} 미정의`).toBeDefined();
    expect(block[name], `--${name} 에 oklch`).not.toMatch(/oklch/i);
  }
});
```

## Shared Patterns

### 순수 lib ↔ 그리기 컴포넌트 분리
**Source:** `lib/ticks/tick-chart.ts` 머리 주석 ④ — 모든 기하 · 집계 · 수익률 계산은 lib 순수 함수, 컴포넌트는 path 문자열만 그린다. 테스트는 lib 에 몰고 컴포넌트 테스트는 상호작용만.

### 세션 단위 캐시
**Source:** `tick-chart.ts` 191행 `WeakMap<TickSession, …>` — 1분봉 · 수익률 열 · 누적 평단 점 모두 세션(또는 payload) 키 WeakMap. 상위 봉 단위는 1분봉에서 묶는다(RESEARCH).

### 저장 실패 · 깨진 값은 조용히 기본값
**Source:** `lib/sidebar-collapse.ts` 50 ~ 56행 try/catch — prefs 파싱 실패는 throw 하지 않는다.

### 팝오버 ↔ 시트 한 state
**Source:** `components/me/push-alert-bell.tsx` 90 ~ 144행 — 더하기 창 · (필요 시) 봉 단위 메뉴 폰 갈래.

### RPC 재정의 권한
**Source:** `20261103210000_tick_open_listing_shares.sql` 61 ~ 63행 REVOKE PUBLIC · anon/authenticated + GRANT service_role.

## No Analog Found

없음. 이동평균(sma/ema/일 단위 sma) 계산 자체는 코드베이스에 선례가 없으니 수식은 RESEARCH.md 를 따른다(파일 모양은 tick-chart.ts).

## Metadata

**Analog search scope:** `webapp/src/lib`, `webapp/src/hooks`, `webapp/src/components/{ticks,me,trading/lc,analytics,theme}`, `webapp/src/styles`, `supabase/migrations`, `supabase/tests`, `packages/shared/src`, `server/tests/routes`
**Files scanned:** 약 20
**Pattern extraction date:** 2026-11-12
