# Phase 25: order-log-progress - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 32 (신규 18 · 변경 14)
**Analogs found:** 30 / 32

> 모든 analog 경로는 `git ls-files` 로 추적 소스임을 확인했다. `relay/src/generated/**` 는 손대지 않는다(생성물만 커밋).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `relay/src/generated/**` (58개 중 15개 신규/변경 + `StockDMA.fbs`) | generated | codegen | Phase 24 `24-01-PLAN.md` Task 1 ① | exact (절차) |
| `relay/src/dma/msg-type.ts` | config (수기 사본) | — | 자기 자신 `:180,208-228` (INBOUND 화이트리스트) | exact |
| `relay/src/dma/envelope.ts` | codec | transform | 자기 자신 `parseObserverLoginResp :2618` · `parseJournalBatch :2674` | exact |
| `relay/src/hub/subscription-hub.ts` | hub | pub-sub | `#onQueuedWindow :1187-1191` · `#clearCaches :1681` | exact |
| `relay/src/journal/types.ts` | model | — | 자기 자신 `JournalCodec.buildLoginReq :104` | exact |
| `relay/src/journal/writer.ts` | service | batch (queue→RPC) | 자기 자신 (스트림 서술자 주입) `:255-259,448-452,512,523-527` | exact |
| `relay/src/journal/observer.ts` | service | event-driven | 자기 자신 `#onLogin :313-314` · `#onBatch :338` | exact |
| `relay/src/journal/codec.ts` | codec | transform | 자기 자신 `:23-47` (79/80 분기) | exact |
| `relay/src/ws/fanout.ts` | service | pub-sub | `deliverJournalRows :1494-1522` · 인증 스냅 `:683-694` | exact |
| `relay/src/index.ts` | config (결선) | — | `:199-206` journalWriter.on("applied") | exact |
| `supabase/migrations/2026093xxxxxxx_dma_strategy_events.sql` | migration | CRUD | `20260924200000_dma_journal_tables.sql` | exact |
| `supabase/migrations/2026093xxxxxxx_dma_strategy_rpcs.sql` | migration (RPC) | batch/CRUD | `20260924200100_dma_journal_rpcs.sql` | exact |
| `supabase/tests/dma_strategy_apply.test.sql` | test (pgTAP) | — | `supabase/tests/dma_journal_apply.test.sql` | exact |
| `packages/shared/src/strategy-event.ts` | model | transform | `packages/shared/src/journal.ts :112,164` | exact |
| `packages/shared/src/strategy-event-labels.ts` | utility | transform | `packages/shared/src/strategy-display.ts :59,84` | role-match |
| `packages/shared/src/strategy-event-text.ts` | utility | transform | `webapp/src/lib/order-notices.ts :58-59,139-165` | role-match |
| `packages/shared/src/relay.ts` | model | — | 자기 자신 `:1175,1250,1271-1290` | exact |
| `server/src/routes/orders.ts` (+strategy-events 라우터) | route | request-response | 자기 자신 `:43-62` | exact |
| `server/src/services/dma-orders.ts` | service | request-response | `listTodayOrders :39-52` · `resolveTradeDate :59` | exact |
| `server/src/schemas/orders.ts` | config (zod) | — | `OrderListQuery :70-76` | exact |
| `server/src/app.ts` (마운트) | config | — | `:96` `app.use("/api/orders", ordersRouter)` | exact |
| `webapp/src/lib/strategy-events-api.ts` | service (client) | request-response | `webapp/src/lib/orders-api.ts :67,102,149` | exact |
| `webapp/src/lib/order-log-feed.ts` | utility | transform | `orders-api.ts mergeJournalRows :67-84` | exact |
| `webapp/src/lib/use-stick-to-bottom.ts` | hook | event-driven | — | none |
| `webapp/src/lib/queue-progress.ts` | utility | transform | `use-relay-socket.ts queued.window :902` | partial |
| `webapp/src/lib/use-relay-socket.ts` | store | event-driven | 자기 자신 `applyFrame journal.rows :804` · `rateCrossSnapSeq :899` | exact |
| `webapp/src/lib/order-notices.ts` (members · 별건 「주문」) | utility | transform | 자기 자신 `:58-59,139-163` | exact |
| `webapp/src/components/trading/today-orders-card.tsx` (펼침) | component | request-response + live | `account-panel.tsx :1330-1421` (Fragment+colSpan 상세행) · `theme-card.tsx :87,150` | role-match |
| `webapp/src/components/trading/order-timeline.tsx` | component | transform | `strategy-log.tsx :548` (줄 스타일만) | partial |
| `webapp/src/components/trading/order-log/{order-log-list,order-log-filters,order-log-panel}.tsx` | component | streaming (live append) | `strategy-log.tsx` (스타일만 — 순서 반대) | partial |
| `webapp/src/components/trading/workbench/shared-panels.tsx` · `webapp/src/lib/trading-layout.ts` · `card/card-tabs.tsx` · `trading-workbench.tsx` | component/config | — | 자기 자신 (탭 등록 3곳 + 카드) | exact |
| `webapp/src/components/orderbook/account-panel.tsx` (B안 보조행) | component | pub-sub read | 자기 자신 `:764-771,917,1330-1421` | exact |
| `webapp/src/app/trading/order-log/page.tsx` | route (page) | — | `webapp/src/app/trading/page.tsx` | role-match |

## Pattern Assignments

### 생성물 + 수기 사본 3곳 (`relay/src/generated/**`, `msg-type.ts`, `envelope.ts`, `subscription-hub.ts`)

**Analog:** `.planning/phases/24-limitchaser-buy3/24-01-PLAN.md` Task 1 ① (line 217) + 검증 (line 232) + T-24-04 (line 322)

- 재생성 절차 (Phase 24 문법 그대로, 경로만 phase-25 worktree):
  ```bash
  cd /Users/alex/repos/gh-trade/.claude/worktrees/phase-25-order-log-progress/server
  RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check   # 기대: 신규/변경 예정 15 개 · .fbs 사본 갱신 예정
  RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh           # 반영
  ```
- verify (24-01 :232 동형): 반영 뒤 `--check` 가 `신규/변경 예정 +: 0 개` 와 `\.fbs 사본 +: 최신` 을 출력. 바뀐 생성 파일 수가 15 + fbs 가 아니면 멈추고 보고. SUMMARY 에 worktree 팁 해시(`3a1a6cf2`)·fbs 커밋(`5f49cfa5`) 기록. **주의:** fbs 는 gh-trade master 미병합 — 계획에 이 의존을 명시.
- `msg-type.ts` INBOUND 화이트리스트 (`:206-228`) 끝에 추가:
  ```typescript
    MSG.ObserverLoginResp,
    MSG.JournalBatch,
  ]);   // ← 여기에 MSG.QueueProgress (83) 추가, MSG 상수표(:180 부근)에 39/81/82/83 추가
  ```
- `envelope.ts`: `parseObserverLoginResp`(:2618)·`parseJournalBatch`(:2674)에 strategy 필드(slot 20/22/24, 10/12/14) 읽기 추가, `parseQueueProgress` 신설. 구 서버 내성: 없는 필드는 0/false 로 읽힘(RESEARCH Pattern 1).
- `subscription-hub.ts` `#onFrame` case 추가(:964,1090-1091 동형) → 아래 hub 절.

---

### `relay/src/hub/subscription-hub.ts` (hub, pub-sub) — QueueProgress 캐시

**Analog:** `#onQueuedWindow` (lines 1187-1191)
```typescript
#onQueuedWindow(userId: string, session: HubSession, state: RelayQueuedWindowMsg): void {
  this.#queuedWindows.set(userId, state);
  if (!session.isReady) return;
  this.#fanout(userId, state);
}
```
- 차이점: ① `session.allowedAccounts` 로 항목 필터(HubSession `:143-152` 에 `readonly allowedAccounts: RelayAccount[]` 추가 — `DmaSession.allowedAccounts` `relay/src/dma/session.ts:200-202` 에서 공급, 테스트 스텁 갱신) ② `dma_user_id` 제거 ③ 키 `${userId}|${isin}|${exchange}` 전량 교체 ④ 비어있음→비어있음은 팬아웃 억제 ⑤ `#clearCaches`(:1681 `this.#queuedWindows.delete(userId)` 옆)에 prefix 삭제 필수(Pitfall 6).

---

### `relay/src/journal/writer.ts` (service, batch) — 스트림 서술자 주입

**Analog:** 자기 자신. 스트림 고유 4지점만 주입(RESEARCH Pattern 2): `readCursor` `.from("dma_journal_cursor").select("journal_epoch, last_seq")` (:255-259), `rpc("dma_journal_apply", {p_gateway, p_epoch, p_events: batch.map(toApplyEvent)})` (:448-452), `result.rows.map(toJournalOrderRow)` (:512), `isApplyResult` (:523-527). `push`(:322-370)·`beginEpoch`(:291-312)·재시도(:472-496)는 복제 금지. 기본값 = 현 저널 → 기존 테스트 무변경. 로그 문맥에 `stream: "journal" | "strategy"`.

### `relay/src/journal/observer.ts` (service, event-driven)

**Analog:** 자기 자신
```typescript
// 현행 :313-314
const nothingToReplay = result.resync && result.oldestSeq === 0;
this.#setState(!nothingToReplay && result.headSeq > received ? "replaying" : "live");
// 현행 :338
if (batch.caughtUp) this.#setState("live");
```
→ `#pendingJ/#pendingS` 두 플래그로 교체(RESEARCH Pattern 1 의사코드 :234-256 그대로). 콜백은 동기 유지(D-32, :16-17). since 2개는 `:226` `writer.lastReceivedSeq ?? 0` 옆에 추가, `types.ts:104` `buildLoginReq` 입력 확장.

---

### `relay/src/ws/fanout.ts` (service, pub-sub)

**Analog:** `deliverJournalRows` / `#pushJournalRows` (lines 1494-1522)
```typescript
#pushJournalRows(rows: readonly JournalOrderRow[], access: JournalAccessView): void {
  for (const [userId, entry] of this.#users) {
    const accounts = access.accountsOf(entry.dmaUserId);
    if (accounts === undefined || accounts.size === 0) continue;
    const subset = rows.filter((row) => accounts.has(row.accountNo));
    if (subset.length === 0) continue;
    this.#deliver(userId, { t: "journal.rows", rows: subset });
  }
}
```
- `deliverStrategyEvents(rows, access?)` = 위 복제, `t: "journal.events"`. **차이:** market 이벤트(`kind IN (1,2)`)는 계좌 필터 대신 게이트웨이 권한 사용자 전원 — `account_no = ''` 로 판정 금지(Security).
- 인증 직후 스냅 (:683-694) 옆에 `unf.progress` snap:true 1프레임 — `rate.cross.snap` 규율(빈 배열도 1프레임):
  ```typescript
  this.#send(conn, { t: "rate.cross.snap", items: this.#hub.getRateCrossItems(userId) });
  const queuedWindow = this.#hub.getQueuedWindow(userId);
  if (queuedWindow !== undefined) this.#send(conn, queuedWindow);
  ```

### `relay/src/index.ts` (결선) — lines 199-206
```typescript
journalWriter.on("applied", (rows) => fanout.deliverJournalRows(rows));
for (const extra of extraJournals) {
  extra.writer.on("applied", (rows) => fanout.deliverJournalRows(rows, extra.access));
}
```
→ `strategyWriter.on("applied", rows => fanout.deliverStrategyEvents(rows))` + extra 게이트웨이마다 동형.

---

### `supabase/migrations/..._dma_strategy_events.sql` (migration)

**Analog:** `supabase/migrations/20260924200000_dma_journal_tables.sql`
- 커서 (lines 163-168) — 여기에 `strategy_journal_epoch text` · `strategy_last_seq bigint CHECK (>=0)` 칸을 `ALTER TABLE ADD COLUMN` (nullable/default 0):
  ```sql
  CREATE TABLE public.dma_journal_cursor (
    gateway       text        PRIMARY KEY,
    journal_epoch text        NOT NULL,
    last_seq      bigint      NOT NULL CHECK (last_seq >= 0),
    updated_at    timestamptz NOT NULL DEFAULT now()
  );
  ```
- 잠금 4줄 (lines 171-174), 정책 0개:
  ```sql
  ALTER TABLE public.dma_journal_events ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.dma_journal_events FROM PUBLIC;
  REVOKE ALL ON public.dma_journal_events FROM anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_journal_events TO service_role;
  ```
- PK `(gateway, journal_epoch, seq)` (:62-90 동형), `gw_time_ms bigint` 원문 칸, 인덱스 `(trade_date, gateway, account_no)` · `(gateway, trade_date, account_no, order_no) WHERE order_no <> ''`.

### `supabase/migrations/..._dma_strategy_rpcs.sql` (RPC)

**Analog:** `supabase/migrations/20260924200100_dma_journal_rpcs.sql`
- 머리 (lines 382-409):
  ```sql
  CREATE OR REPLACE FUNCTION public.dma_journal_apply(p_gateway text, p_epoch text, p_events jsonb)
  RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
  SET search_path = public, pg_temp
  AS $$ ...
    IF coalesce(p_gateway, '') = '' OR coalesce(p_epoch, '') = '' THEN RAISE EXCEPTION ...
    PERFORM pg_advisory_xact_lock(hashtext('dma_journal:' || p_gateway));   -- 전략은 'dma_strategy:' 로 다른 키
  ```
- 멱등 (lines 447-453): `ON CONFLICT DO NOTHING; IF NOT FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;` — 전략은 투영/포이즌 격리 없음, 삽입분만 반환.
- 커서 upsert (lines 470-479) — 전략은 `strategy_journal_epoch`·`strategy_last_seq` 만 SET (저널 칸 건드리지 말 것; 행 부재 시 `journal_epoch=p_epoch, last_seq=0` INSERT).
- 조회 RPC 2개(하루치 `dma_strategy_events_for_user(uuid,date)` · 주문별 `(uuid, account, text[], date)`)는 `dma_journal_orders_for_user`(:562) 의 `dma_account_access` 조인 가시성 동형.
- EXECUTE 잠금 3줄 (lines 634-636) — 시그니처별:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) FROM anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.dma_journal_orders_for_user(uuid, date) TO service_role;
  ```
- 원격 적용은 사용자가 `supabase db push` (README.md:47-48). executor 는 적용하지 않는다.

### `supabase/tests/dma_strategy_apply.test.sql` (pgTAP)

**Analog:** `supabase/tests/dma_journal_apply.test.sql` (lines 1-30): 머리 주석에 잠그는 것 목록 + 실행 명령, `BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path = public, extensions;` … 끝 `ROLLBACK`. 단언 설명에 (seq, 계좌 말미, 기대값) 튜플. 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql`. 커서 칸 신설은 `dma_journal_schema.test.sql` 에도 단언 추가 권장. 잠글 것: 재생 멱등 · 저널/전략 커서 독립 · 가시성(market kind 1,2 포함) · REVOKE.

---

### `server/src/routes/orders.ts` (+ strategy-events 라우터) (route)

**Analog:** 자기 자신 lines 43-62
```typescript
ordersRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = OrderListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const data: JournalOrderRow[] = await listTodayOrders(supabase, req.userId!, parsed.data.date);
    res.json(data);   // bare array 규약
  } catch (e) { next(e); }
});
```
- 주문별 `GET /api/orders/events` 는 `/:id` 계열보다 **먼저** 등록. 새 라우터 `app.use("/api/strategy-events", …)` 는 `server/src/app.ts:96` 옆.

### `server/src/services/dma-orders.ts` — lines 39-52
```typescript
export async function listTodayOrders(supabase, userId, date?) {
  const tradeDate = resolveTradeDate(date);
  const { data, error } = await supabase.rpc("dma_journal_orders_for_user", { p_user_id: userId, p_trade_date: tradeDate });
  if (error) throw DbError("주문 목록 조회에 실패했습니다.");
  return ((data ?? []) as JournalOrderDbRow[]).map(toJournalOrderRow);
}
```
→ `listStrategyEvents` · `listOrderEvents` 동형, `toStrategyEventRow`(shared) 매핑, `resolveTradeDate`(:59) 재사용.

### `server/src/schemas/orders.ts` — lines 70-76
```typescript
export const OrderListQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
```
→ `OrderEventsQuery { account(1~12자), orderNos(comma split, max 100, 각 1~20자), date? }`.

---

### `packages/shared/src/strategy-event.ts` (model)

**Analog:** `packages/shared/src/journal.ts` (`JournalOrderDbRow`/`JournalOrderRow`/`toJournalOrderRow` :112,164) — DbRow(snake) → Row(camel) 매퍼 + PUBLIC_COLUMNS, `dma_user_id` 는 행에 없음(T-19-08).

### `packages/shared/src/strategy-event-labels.ts` · `strategy-event-text.ts` (utility)

**Analog:** `packages/shared/src/strategy-display.ts :59,84` (순수 표시 함수·shared 배치), `webapp/src/lib/order-notices.ts:58-59` (`orderActionWord` 분기 스타일). 모르는 코드 → `String(code)`(D-10). 시각 포맷은 `Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",second:"2-digit",fractionalSecondDigits:3,hourCycle:"h23"})` — 기존 `today-orders-card.tsx:132-138` 의 `hour12:false` 는 쓰지 않는다. 숫자는 `Intl.NumberFormat("ko-KR")` (`today-orders-card.tsx:126`). 픽스처 = CONTEXT specifics 의 ○○전자 12451~12455 흐름.

### `packages/shared/src/relay.ts` — outbound union (:1175,1250,1271-1290)
`RelayJournalEventsMsg {t:"journal.events", rows}` · `RelayUnfProgressMsg` (snap:false `{i,x,items}` / snap:true `{entries}`) 를 `RelayOutbound` union 에 추가.

---

### `webapp/src/lib/use-relay-socket.ts` (store)

**Analog:** `applyFrame` (lines 804-808, 899, 902)
```typescript
case "journal.rows": {
  const journalRows = upsertJournalRows(state.journalRows, frame.rows);
  return journalRows === state.journalRows ? state : { ...state, journalRows };
}
...
rateCrossSnapSeq: state.rateCrossSnapSeq + 1,   // 카운터 선례 → strategyEventsSeq
case "queued.window":
  return { ...state, queuedWindow: frame };
```
→ `journal.events`: 키 `gateway|epoch|seq` upsert + `strategyEventsSeq += 신규수`. `unf.progress`: snap:true 면 Map 전량 교체, false 면 `${i}|${x}` 키 교체(빈 items = 키 삭제). 상태 초기값 :362,391,396,516 에 필드 추가.

### `webapp/src/lib/strategy-events-api.ts` · `order-log-feed.ts`

**Analog:** `webapp/src/lib/orders-api.ts` `mergeJournalRows` (lines 67-84)
```typescript
for (const row of pushed) {
  if (row.tradeDate !== today) continue;
  const cur = byId.get(row.id);
  if (cur === undefined || row.lastSeq > cur.lastSeq) byId.set(row.id, row);
}
return [...byId.values()].sort(compareJournalNewestFirst);
```
→ 전략 이벤트는 불변 원문이라 키 존재 시 skip, 정렬은 **오름차순** (`gwTimeMs`, gateway, seq). 펼침 타임라인은 같은 ms 면 통보 → 전략 순.

### `webapp/src/lib/order-notices.ts`
`MergedOrderNotice`(:139-163)에 `members: JournalOrderRow[]` 추가(`absorb` 에서 push). 별건: `orderActionWord` 마지막 `return "";`(:58-59) → `"주문"`. `orders-api.ts:149-151` `orderDisplayStatus` 에 `status==="rejected" && resultCode===-2` → 「접수 불명」 선판정.

### `webapp/src/components/trading/today-orders-card.tsx` (펼침) · `order-timeline.tsx`

**Analog (상세행 문법):** `webapp/src/components/orderbook/account-panel.tsx:1330-1421`
```tsx
<Fragment key={…}>
  <TableRow …/>
  {open && (
    <TableRow data-slot="account-embed-cancel-result">
      <TableCell colSpan={stockScope ? 5 : 7}>…</TableCell>
    </TableRow>
  )}
</Fragment>
```
- 오늘 주문 표 열 = 8 (:407-418) → `colSpan={8}`, `data-slot="today-order-detail"`. 모바일 `OrderCardRow`(:515)는 카드 아래 블록.
- 토글: 첫 칸 실제 `<button aria-expanded>` (예: `components/home/theme-card.tsx:87,150` · `card/card-tabs.tsx:222`), 행 클릭은 위임.
- 계좌 묶음은 이미 `groupJournalRowsByAccount(...).map(g => ({...g, merged: mergeOrderNotices(g.rows)}))` (:275-282) → 한 묶음 = 한 계좌.
- 라이브: 스토어 `strategyEvents` 이어붙임 + 구성원 `lastSeq` 상승 시 400ms trailing 재조회 1회.

### `webapp/src/components/trading/order-log/*` · 탭 등록

- 탭 등록 3곳: `shared-panels.tsx:94` `type SharedTab = 'unfilled' | 'holdings' | 'log'`, `trading-layout.ts:112` `SharedPanelTab`, 복원 화이트리스트 `trading-layout.ts:140`; 카드 `card-tabs.tsx:64` `CardTab` + `CardTabRequest`(:66-70), 탭 목록 `:203-217,249-279`; `writePanelsPref` (shared-panels :333). 데이터 공급은 `trading-workbench.tsx:1438-1442` 전략 로그 entries 옆.
- 줄 스타일만 `strategy-log.tsx:548` 참고 — `StrategyLog` 재사용 금지(최신이 index 0, :522-523).
- 반응형: 컨테이너 쿼리 `@min-[700px]/wb` 밴드(`webapp/src/styles/globals.css` §2.2b 정본). main 은 overflow-auto 라 CSS sticky 는 목록 자체 스크롤러 안에서만(목업 `.body{max-height;overflow-y:auto}` · `.pin{position:sticky;bottom:0}`).

### `webapp/src/components/orderbook/account-panel.tsx` (B안 보조행)
- 데스크톱 표 열 7 (:764-771) → `<Fragment>` + `<TableRow><TableCell colSpan={7}>`; 모바일 r3 는 `StatusNotes`(:917) 옆; 임베드 표는 이미 Fragment (:1330-1331), colSpan `stockScope ? 5 : 7` (:1421).
- 데이터: `useRelayContext()`(:357) 에서 `queueProgress.get(`${row.isin}|${row.exchange}`)` → `(accountNo, orderNo)` 항목. 막대 `role="progressbar" aria-valuenow aria-valuemin=0 aria-valuemax=100 aria-label="체결예상까지 진행률"` + 퍼센트 숫자 병기. 웹은 계산하지 않음(D-11) — 클램프만.

### `webapp/src/app/trading/order-log/page.tsx` (창 분리)

**Analog:** `webapp/src/app/trading/page.tsx`
```tsx
export default function TradingPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <TradingWorkbench />
      </Suspense>
    </AppShell>
  );
}
```
→ AppShell/사이드바 **없이** `<Suspense fallback={null}><OrderLogPanel standalone/></Suspense>`. `RelayProvider` 는 루트 layout(`app/layout.tsx:75`) 전역. 네이티브는 `isNativeApp()`(`webapp/src/lib/native/native-detect.ts:24`) 시 창 분리 버튼 숨김/같은 창. `/trading/vi`·`/trading/limit-chaser/[key]` 는 리다이렉트 전용이라 골격 아님.

## Shared Patterns

### 서비스롤 전용 잠금 (DB)
**Source:** `20260924200000_dma_journal_tables.sql:171-174` · `20260924200100_dma_journal_rpcs.sql:634-636` — 모든 새 테이블/함수. RLS on + 정책 0 + anon/authenticated **명시** REVOKE(메모리 규칙: 플랫폼 auto-grant 가 PUBLIC REVOKE 를 덮음).

### 인증·가시성
**Source:** `server/src/routes/orders.ts:43-62` — `requireAuth()` → `req.userId!` 만 RPC 로, 가시성은 SQL `dma_account_access` 조인. relay 푸시는 `accountsOf(entry.dmaUserId)` (fanout.ts:1515) — 복원과 푸시가 같은 신원 규칙.

### 에러 처리
server: zod 실패 → `ValidationFailed(...)`, RPC 실패 → `DbError("...")`, 전부 `next(e)`. relay: 콜백 동기, gap/overflow → `#dropTransport(사유)`, 로그에 `stream` 문맥.

### 서버 진실 표시만 (D-11 · D-36)
문구 파싱·진행률/대기 추정 금지. 모르는 코드는 원문 문자열.

### 스냅샷 프레임 규율
빈 배열도 1프레임(`rate.cross.snap` 선례, fanout.ts:683-692) — `unf.progress` snap:true.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `webapp/src/lib/use-stick-to-bottom.ts` | hook | event-driven | 코드베이스에 stick-to-bottom 스크롤 훅 없음 — RESEARCH Pattern 7 (scroll 이벤트로 atBottom 추적 + useLayoutEffect 로 scrollTop=scrollHeight, 아니면 pendingNew 누적) 사용 |
| `webapp/src/components/trading/order-log/order-log-list.tsx` (sticky 핀 부분) | component | streaming | 오름차순 라이브 목록 + 「새 로그 N · 맨 아래로 ↓」 핀 선례 없음 — UI-SPEC ③ 과 목업 `reference/mockup-order-log-tab.html` 기준 |

## Metadata

**Analog search scope:** relay/src/{journal,dma,hub,ws,index.ts}, supabase/{migrations,tests}, server/src/{routes,services,schemas,app.ts}, packages/shared/src, webapp/src/{lib,components/trading,components/orderbook,app/trading}, .planning/phases/24-limitchaser-buy3
**Files scanned:** ~25
**Pattern extraction date:** 2026-09-29
