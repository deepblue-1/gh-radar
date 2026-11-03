# Phase 38: 틱뷰어 우리 주문·체결 표시 - Pattern Map

**Mapped:** 2026-11-03
**Files analyzed:** 27 (새 13 · 수정 14)
**Analogs found:** 26 / 27 (생성기 `gen-own-fixtures.mjs` 만 부분 analog)

모든 analog 경로는 git 추적 원본(HEAD 9b662c10 기준 — 9645d5d2 「최신 받기」 · 89b602f1 「‹ 목록으로」 반영본).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `packages/shared/src/ticks/own-fills.ts` (새) | utility(순수) | transform | `packages/shared/src/ticks/record-index.ts` · `team-pnl.ts` | role-match |
| `packages/shared/src/ticks/record-index.ts` (수정 cumVolume) | utility | transform | 같은 파일 `a3ColumnsOf` 의 `cumValue` 열 | exact |
| `packages/shared/src/ticks/index.ts` (수정) | barrel | — | 같은 파일 | exact |
| `packages/shared/src/tick-api.ts` (수정 TickOwn*) | model(계약) | request-response | 같은 파일 `TickOpenResponse` | exact |
| `packages/shared/src/__tests__/ticks-own.golden.test.ts` (새) | test(오라클) | file-I/O | `ticks-pnl.golden.test.ts` + `helpers/tick-digest.ts` | exact |
| `packages/shared/src/__tests__/ticks-own.test.ts` (새, 합성) | test | transform | `ticks-pnl.golden.test.ts` 「합성 · 단위」 블록 · `ticks-record-index.test.ts` | role-match |
| `packages/shared/src/__tests__/ticks-record-index.test.ts` (수정) | test | — | 같은 파일 | exact |
| `packages/shared/src/__fixtures__/ticks/own1030-*` + README (새) | fixture | file-I/O | 같은 디렉터리 기존 `*.ticks.zst` · `*.pnl.json` · README 표 | exact |
| `scripts/tick-oracle/gen-own-fixtures.mjs` (새) | script | batch | `scripts/tick-oracle/gen-fixtures.sh` | partial |
| `supabase/migrations/2026110XHHMMSS_tick_own_for_user.sql` (새) | migration(RPC) | request-response | `20261102200000_tick_viewer.sql` `tick_open_for_user` (302-353) | exact |
| `supabase/tests/tick_own.test.sql` (새) | test(pgTAP) | — | `supabase/tests/tick_viewer.test.sql` | exact |
| `server/src/routes/ticks.ts` (수정 GET /own) | route | request-response | 같은 파일 `/open` (150-158) | exact |
| `server/src/services/ticks.ts` (수정 getTickOwn) | service | request-response | 같은 파일 `getTickDay` · `openTick` · `gate()` | exact |
| `server/tests/routes/ticks.test.ts` (수정) | test(supertest) | — | 같은 파일 `makeSupabase` | exact |
| `webapp/src/lib/ticks/tick-api.ts` (수정 fetchTickOwn) | client | request-response | 같은 파일 `fetchTickOpen` (47-50) | exact |
| `webapp/src/lib/ticks/own-model.ts` (새) | model(뷰 모델) | transform | `webapp/src/lib/ticks/team-model.ts` `buildTeamModel` | exact |
| `webapp/src/lib/ticks/use-tick-own.ts` (새) | hook | request-response | `use-tick-grid.ts` · `use-tick-live.ts` (refresh 1회) | role-match |
| `webapp/src/lib/ticks/msg-rows.ts` (수정 ORDER/NOFILL) | model | transform | 같은 파일 `MSG_ITEM` · `buildMsgRows` | exact |
| `webapp/src/lib/ticks/use-tick-cursor.ts` (수정 `[` `]` · export isTypingTarget) | hook | event-driven | 같은 파일 160-177 | exact |
| `webapp/src/lib/ticks/tick-chart.ts` · `tick-chart-tip.ts` (수정) | utility | transform | 같은 파일 · `team-model.ts` `teamCirclesOf` | exact |
| `webapp/src/components/ticks/tick-msg-list.tsx` (수정 둘째 레일) | component | — | 같은 파일 `GRID` · `railStyle` · `joinedAt` | exact |
| `webapp/src/components/ticks/tick-order-card.tsx` (수정 ◆ 섹션) | component | — | 같은 파일 기존 섹션 · `rl` 표 | exact |
| `webapp/src/components/ticks/tick-chart.tsx` (수정 ◆○) | component | — | 같은 파일 팀 원 그리기 | exact |
| `webapp/src/components/ticks/tick-header.tsx` (수정 알약 k/n ‹ ›) | component | — | 같은 파일 `tick-live-refresh` 버튼 (127-144) | exact |
| `webapp/src/components/ticks/tick-viewer.tsx` · `tick-viewer-page.tsx` (수정) | component(조립) | — | 같은 파일 `useMemo(buildTeamModel)` 결선 | exact |
| `webapp/src/styles/globals.css` (수정 `--mine` 등) | config | — | 같은 파일 `--team`/`--team-bg` (83-84 · 262-263) | exact |
| `webapp/e2e/fixtures/ticks.ts` (수정 `/api/ticks/own`) | test fixture | — | 같은 파일 `case '/api/ticks/open'` (261-272) | exact |
| webapp 테스트 신규 `own-model.test.ts` · `use-tick-own.test.tsx` | test | — | `team-model.test.ts` · `use-tick-live.test.tsx` | exact |

## Pattern Assignments

### `packages/shared/src/ticks/own-fills.ts` (utility, transform)

**Analog:** `packages/shared/src/ticks/record-index.ts` (typed array 열 · 행 객체 금지) · `team-pnl.ts` (순수 함수 export)

- 입력은 `A3Columns` 열(`px` · `qty` · `tNs` · `rec` · 새 `cumVolume`) + `TickIndex`(`recvNs` · `tag` · `ok`) + `TickOwnFill[]`/`TickOwnEvent[]`. 출력은 `Int32Array`/`Uint8Array` 열(Web Worker 이식 가능). 시각 규칙 `tNs !== -1n ? tNs : recvNs[rec]` 는 `webapp/src/lib/ticks/team-model.ts:95-96` 과 같은 꼴.
- 규칙 본문(짝 후보 창 [−200, +1500] · 20ms 추정 · 남은 수량 차감 · B6 마지막 일치 · 구간 (before, after] · cum 앵커)은 RESEARCH §Pattern 1 원문 그대로 — 정의 변경 금지(Pitfall 1).
- 위치 계산은 `lowerBoundRecv`(`packages/shared/src/ticks/tick-time.ts:73`) 재사용 — 직접 이분 탐색 쓰지 않는다.
- `index.ts` 에 한 줄 추가: `export * from "./own-fills";` (현재 2-13행 패턴).

### `packages/shared/src/ticks/record-index.ts` — `A3Columns.cumVolume`

**Analog:** 같은 파일 `cumValue` 열 (193-211 인터페이스 · 220-231 `A3_OFF` · 247-~ `a3ColumnsOf`)
```ts
export interface A3Columns { n: number; rec: Int32Array; ... cumValue: Float64Array; nxt: Uint8Array; isin: string[]; toTrades(): A3Trade[]; }
const A3_OFF = { ..., cumValue: fieldOff(A3_LAYOUT, "cum_value"), ... };
```
- 추가: 인터페이스 `cumVolume: Float64Array;` · `A3_OFF.cumVolume: fieldOff(A3_LAYOUT, "cum_volume")` (layouts.ts:106 `.add("cum_volume", 113, 12, "uint")`) · `a3ColumnsOf` 안 `new Float64Array(n)` 할당 + 루프 대입(`cumValue` 줄 옆, `toNum` 사용) · 반환 객체에 포함. 오프셋 하드코딩 금지 — `fieldOff` 경유.
- `ticks-record-index.test.ts` 에 cumVolume 단언 1개 추가.

### `packages/shared/src/tick-api.ts` (계약)

**Analog:** `TickOpenResponse` (104-115) — `access: true` 리터럴 + snake_case 필드 그대로 통과.
```ts
export type TickOpenResponse = {
  access: true;
  date: string;
  exchange: TickExchange;
  isin: string;
  ...
};
```
- `TickOwnFill` · `TickOwnEvent` · `TickOwnOrder` · `TickOwnResponse = { access: true; date; exchange: TickExchange; isin; servers: string[]; fills; events; orders }` — 필드 목록은 RESEARCH §Code Examples 「공유 계약」. `dma_user_id` 필드 없음.

### `packages/shared/src/__tests__/ticks-own.golden.test.ts` (오라클)

**Analog:** `ticks-pnl.golden.test.ts` (1-55) + `__tests__/helpers/tick-digest.ts`
```ts
/** Phase 37 (D-10 · D-12 · D-20) ... 픽스처(생성 `bash scripts/tick-oracle/gen-fixtures.sh pnl` · README): ... */
import { existsSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { readA3Trades, readTickJson, tickFixturePath } from "./helpers/tick-digest";
```
helper (tick-digest.ts:22-48):
```ts
export function tickFixturePath(name: string): string { return fileURLToPath(new URL(name, FIXTURE_DIR)); }
export function readTicksZst(name: string): Uint8Array {
  const buf = zstdDecompressSync(readFileSync(tickFixturePath(name)));   // node:zlib zstd — 테스트는 fzstd 아님
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
export function readTickJson<T>(name: string): T { return JSON.parse(readFileSync(tickFixturePath(name), "utf8")) as T; }
```
- 흐름: `readTicksZst("own1030-krx-KR7184230001.ticks.zst")` → `buildTickIndex` → `a3ColumnsOf` → `matchOwnFills(..., readTickJson("own1030.journal.json").fills)` → 종목별 표(RESEARCH Pattern 1 표) `it.each` 단언 + 합 401/406 · 29/29 · 2 · 9 · 100/100.
- 머리 주석에 생성 명령(`node scripts/tick-oracle/gen-own-fixtures.mjs`) 명시 (pnl 테스트 머리 주석 꼴).
- 실행: `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-own.golden.test.ts --maxWorkers=2`.

### `scripts/tick-oracle/gen-own-fixtures.mjs` (부분 analog)

**Analog:** `scripts/tick-oracle/gen-fixtures.sh` (37 픽스처 생성기 · 서브커맨드별 산출 · README 행) — 입력 원천(Storage + PostgREST)·계좌 익명화·결정적 출력·자기검사(406)는 RESEARCH §10/30 픽스처 계획 1-4 를 따른다. 키 비출력, 실행은 사용자 `!` 한 줄.

### `supabase/migrations/..._tick_own_for_user.sql` (RPC)

**Analog:** `supabase/migrations/20261102200000_tick_viewer.sql:302-353`
```sql
CREATE FUNCTION public.tick_open_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE ...
BEGIN
  -- 게이트 — 하루 목록과 같은 판정
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  ...
COMMENT ON FUNCTION public.tick_open_for_user(uuid, text, text, text) IS ...;
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_open_for_user(uuid, text, text, text) TO service_role;
```
- 머리 주석 블록(1-49행 꼴: 반환 모양 · 권한 · 롤백 `DROP FUNCTION ...`)도 복제.
- 어드민 판정 `dma_app_access_map()` (20261006200100_dma_registry_intent.sql:156-169) · 켜진 서버 `JOIN public.dma_servers s ON s.key = j.gateway AND s.enabled` 를 체결 · 이벤트 둘 다(Pitfall 6). 가시 계좌 조인/jsonb_agg 꼴은 `20261004090000_dma_journal_orders_for_user_json.sql`. 본문 골격은 RESEARCH Pattern 3.
- 메모리 규칙: REVOKE anon/authenticated 명시 필수.

### `supabase/tests/tick_own.test.sql` (pgTAP)

**Analog:** `supabase/tests/tick_viewer.test.sql` (1-40)
```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(N);
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-000000003701', 'tv-u1@example.invalid'), ...;
INSERT INTO public.dma_users (dma_user_id, password_enc) SELECT d, 'test-enc' FROM unnest(ARRAY['dma-tv1',...]) d;
INSERT INTO public.app_users (email, role, dma_user_id) VALUES ('tv-u1@example.invalid','trader','dma-tv1'), ...;
SELECT public.dma_journal_sync_access('KB120', '[ ...
```
- 머리 주석 「잠그는 것」 목록 + 실행 명령 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql`. UUID 접미사는 3801~ 등 37 과 겹치지 않게. admin 사용자 1명 · KB121 꺼짐→`UPDATE dma_servers SET enabled = true` 케이스 · 끝 `ROLLBACK`.

### `server/src/routes/ticks.ts` — `GET /own`

**Analog:** 같은 파일 150-158
```ts
ticksRouter.get("/open", requireAuth(), async (req, res, next) => {
  try {
    const q = parseOr400(TickOpenQuery, req.query);
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await openTick(supabase, req.userId!, q));
  } catch (e) {
    next(e);
  }
});
```
- `TickOpenQuery` 재사용(schemas/ticks.ts) · `parseOr400` (54-62) · `res.set("Cache-Control", "no-store")`. 서비스 import 를 10-17 import 블록에 추가.

### `server/src/services/ticks.ts` — `getTickOwn`

**Analog:** `getTickDay` · `openTick` (동 파일 72-~)
```ts
const { data, error } = await supabase.rpc("tick_open_for_user", {
  p_user_id: userId, p_date: q.d, p_isin: q.isin, p_ex: q.ex,
});
if (error) throw DbError(FAIL, causeOf(error));
const out = gate("tick_open_for_user", data);
for (const k of ["dates", "rows", "requests"] as const) {
  if (!Array.isArray(out[k])) throw DbError(FAIL, shapeCause(`tick_day_for_user.${k}`, out[k]));
}
return out as unknown as TickDayResponse;
```
- `gate()` (63-70): `access === false` → `DmaUnmapped()` 403 · 그 밖 모양 위반 → 500 `DB_ERROR`. own 은 `servers` · `fills` · `events` · `orders` 배열 검사. 머리 주석 방어선 목록에 D-01/D-03 항목 추가. admin 판정은 RPC 안(require-admin 미들웨어 쓰지 않음 — 일반 사용자도 접근).

### `server/tests/routes/ticks.test.ts`

**Analog:** 같은 파일 `makeSupabase` (22-61) — `rpc()` 기록 · `from()` throw.
```ts
from() { throw new Error("server 는 표를 from() 으로 읽지 않는다 — RPC 만"); },
```
- 케이스: 401 · 400 · 403(`{access:false}`) · 500(배열 아님) · `rec.rpcCalls` 길이 1 · 파라미터 키 정확히 `p_user_id,p_date,p_isin,p_ex`(쿼리에 `p_all_accounts`·`user_id` 넣어도 미전달). `nextUser()` · `auth()` · `app()` 헬퍼 재사용.

### `webapp/src/lib/ticks/tick-api.ts` — `fetchTickOwn`

**Analog:** 47-50
```ts
export function fetchTickOpen(q: { isin: string; d: string; ex: TickExchange }): Promise<TickOpenResponse> {
  const params = new URLSearchParams({ isin: q.isin, d: q.d, ex: q.ex });
  return authFetch<TickOpenResponse>(`/api/ticks/open?${params.toString()}`);
}
```

### `webapp/src/lib/ticks/own-model.ts` (새)

**Analog:** `team-model.ts:74-~` `buildTeamModel(session)` — 세션 열에서 shared 순수 함수 호출 → typed array 모델. 시그니처 `buildOwnModel(session: TickSession, own: TickOwnResponse): OwnModel`, 뷰어에서 `useMemo([session, own])` (팀 모델과 같은 결선). 차트용 점 목록 함수는 `teamCirclesOf` (166) 꼴.

### `webapp/src/lib/ticks/use-tick-own.ts` (새)

**Analog:** `use-tick-live.ts` (머리 주석 10-14: 「증분 = 버튼(`refresh()`)을 눌렀을 때만 1회」 · `refreshing` · 실패 플래그) + `use-tick-grid.ts`(열기 시 1회 조회). own 실패(404/5xx/네트워크)는 조용히 null — 401/403 만 게이트와 동일 처리(Pitfall 5). 당일 「최신 받기」 클릭 시 live 증분과 함께 1회. 자동 타이머 금지.

### `webapp/src/lib/ticks/msg-rows.ts` — ORDER/NOFILL

**Analog:** 34-48 · 79-135
```ts
export const MSG_ITEM = { ROW: 0, TAIL: 1, SLOT: 2 } as const;
...
for (let p = 0; p < n; p++) {
  const r = order[p]!;
  posOfRec[r] = k;
  items[k++] = msgItem(MSG_ITEM.ROW, r);
  const sl = slotAfter.get(r);
  if (sl) for (const b6 of sl) { slotPosOfB6.set(b6, k); items[k++] = msgItem(MSG_ITEM.SLOT, b6); }
  const t = tailAfter[r]!;
  if (t >= 0) { tailPosOfOrder[t] = k; items[k++] = msgItem(MSG_ITEM.TAIL, t); }
}
```
- `ORDER: 3` · `NOFILL: 4` 추가. 슬롯 p 의 ORDER/NOFILL 은 ROW 앞에 삽입(`slotAfter` 처럼 Map/배열 미리 계산, `items` 길이에 개수 더함). 새 색인 `ownPosOfOrder` · `ownPosOfFill` · `ownNavPos` 는 `tailPosOfOrder` 처럼 Int32Array(-1 채움). `buildMsgRows(session, mode, own?)` — own 없으면 기존과 동일.

### `webapp/src/components/ticks/tick-msg-list.tsx`

**Analog:** 53-54 `ROW_H_DESKTOP = 24` · `ROW_H_PHONE = 22` · 77 `GRID` · 122-126 `railStyle`
```ts
function railStyle(order: ViewOrder | null, sel: boolean): CSSProperties | undefined {
  if (order && order.pieces >= 2) return { boxShadow: `inset 3px 0 0 var(${order.team ? '--team' : '--faint'})` };
  if (sel) return { boxShadow: 'inset 3px 0 0 var(--fg)' };
  return undefined;
}
```
- `GRID` 앞에 `14px_` 열 · 머리 행에도 빈 칸. 기존 3px 레일은 시각 칸으로 이동. `joinedAt` (331-343) 은 새 종류 처리 추가. 행 컴포넌트는 기존 ROW/TAIL/SLOT 분기(239 · 263 · 300 주변)와 같은 모양으로 ORDER/NOFILL 분기.

### `webapp/src/lib/ticks/use-tick-cursor.ts`

**Analog:** 56-62 `isTypingTarget`(→ export) · 160-177 키 핸들러
```ts
if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); ... }
```
- `[` `]` 는 같은 가드 순서로 별도 훅(`useOwnNav`) 또는 같은 effect 에 추가.

### `webapp/src/components/ticks/tick-header.tsx`

**Analog:** 127-144 「↻ 최신 받기」 버튼(`data-slot="tick-live-refresh"` · `disabled`/`aria-busy` · `cn(...)` 색 토큰). 알약 「◆ 우리 체결 k/n ‹ ›」 은 같은 버튼 클래스 꼴 + `data-slot="tick-own-nav"`.

### `webapp/src/styles/globals.css`

**Analog:** 83-84 (라이트) · 262-263 (다크)
```css
--team: #a234c7;
--team-bg: #f9f0fc;
/* dark */
--team: #c353e5;
--team-bg: rgba(174, 61, 209, 0.16);
```
- 바로 아래 축 주석과 함께 `--mine: #0f9d8a; --mine-bg: #e3f7f3;` (+ 글자용 `--mine-fg` 여부는 UI-SPEC — Pitfall 8) · 다크 `#2fd3bb` / `rgba(47,211,187,.16)`. 주석에 「팀(--team) 축과 대체 금지」 명시(85-86 꼴).

### `webapp/e2e/fixtures/ticks.ts`

**Analog:** 261-272 `case '/api/ticks/open'` · 기본 295-296 `default: return json(route, 404, ...)`
- `case '/api/ticks/own':` 추가 — `rec.own.push(key)` 기록 + `opts.own ? opts.own(q) : tickOwnFixture(q)` (에코앤드림 10/16 컷 합성 체결). `opts.forbid` 403 분기는 자동 적용.

### 웹 테스트

- `own-model.test.ts` ← `webapp/src/lib/ticks/__tests__/team-model.test.ts` (세션 픽스처로 모델 생성 후 단언).
- `use-tick-own.test.tsx` ← `use-tick-live.test.tsx` (refresh 1회 · 타이머 0).
- 컴포넌트 케이스 추가: `components/ticks/__tests__/tick-msg-list.test.tsx` · `tick-order-card.test.tsx` · `tick-chart.test.tsx` · `lib/ticks/__tests__/use-tick-cursor.test.tsx` · `tick-chart-tip.test.ts` · `msg-rows.test.ts`.
- 명령: `pnpm --filter @gh-radar/webapp exec vitest run <files> --maxWorkers=2` · e2e `--workers=1`.

## Shared Patterns

### 게이트 · 권한 (DB + server)
**Source:** `tick_viewer.sql:313-314` + `services/ticks.ts:63-70 gate()` + `errors.ts:83-84 DmaUnmapped`
**Apply to:** RPC · 서비스 · 라우트 · pgTAP · supertest. RPC 1회/요청(Cloud Run 왕복 비용), 브라우저 입력으로 계좌/권한 결정 금지.

### 오류 원문 비노출
**Source:** `services/ticks.ts` `DbError` · `causeOf` · `shapeCause` (38-56) — 고정 문구 `FAIL` + cause 는 로그에만.

### typed array 뷰 모델
**Source:** `record-index.ts a3ColumnsOf` · `msg-rows.ts` Int32Array 색인 · `team-model.ts` — 행 객체 대량 생성 금지.

### 테스트 실행 메모리 가드
모든 vitest `--maxWorkers=2`, playwright `--workers=1` (메모리 「Mac 멈춤」).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/tick-oracle/gen-own-fixtures.mjs` | script | batch | 기존 생성기는 bash + python(oracle.py) · 저널(PostgREST) 입력·계좌 익명화 선례 없음 → RESEARCH §10/30 픽스처 계획 사양 사용 |

## Metadata

**Analog search scope:** packages/shared/src/{ticks,__tests__,tick-api.ts} · server/src/{routes,services} · server/tests/routes · supabase/{migrations,tests} · webapp/src/{lib/ticks,components/ticks,styles} · webapp/e2e/fixtures · scripts/tick-oracle
**Files scanned:** ~30
**Pattern extraction date:** 2026-11-03
