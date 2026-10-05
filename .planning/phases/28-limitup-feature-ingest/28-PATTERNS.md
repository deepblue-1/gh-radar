# Phase 28: 상한가 특징 연동 — 패턴 지도

**작성:** 2026-10-05
**분석 파일 수:** 42 (신규·수정)
**선례 확보:** 39 / 42

플랜 번호는 RESEARCH 「권장 플랜 분해」 표(28-01~28-12)를 따른다. 모든 선례 경로는 `git ls-files` 로 추적 파일임을 확인했다(gh-trade 선례는 gh-trade 저장소 추적 파일).

## 파일 분류

| 신규/수정 파일 | 역할 | 데이터 흐름 | 가장 가까운 선례 | 일치도 |
|---|---|---|---|---|
| `supabase/migrations/2026100?…_dma_strategy_events_limit_feature.sql` (28-01) | migration | CRUD(RPC 재정의) | `supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql` + `20261004090000_dma_journal_orders_for_user_json.sql` | exact |
| `supabase/migrations/…_limitup_tables.sql` · `…_limitup_rpcs.sql` (28-02) | migration | batch(stage+commit) | `20260929180000_dma_strategy_events.sql`(잠금 4줄) · 위 jsonb 래퍼 | role-match |
| `packages/shared/src/strategy-event.ts` (28-03 수정) | utility | transform | 자기 자신 kind 10 `BurstLimit` 줄 | exact |
| `packages/shared/src/strategy-event-text.ts` (28-03 수정) | utility | transform | 자기 자신 `case 10` | exact |
| `packages/shared/src/strategy-event-labels.ts` (수정) | utility | transform | kind 10 라벨 | exact |
| `packages/shared/src/relay.ts` (수정 — `RelayLimitFeatureMsg`) | model | — | 같은 파일 `RelayQuote`/`RelayTape`, `RelayOutbound` 유니온 | exact |
| `packages/shared/src/limit-feature.ts` (신규 — 9칸·숫자·`message` 파서) | utility | transform | `webapp/src/lib/limit-up-format.ts`(순수 포맷 함수) | role-match |
| `packages/shared/src/member-codes.ts` (신규) | utility | lookup | gh-trade `client/Services/Data/MemberCodes.cs` | 이식 |
| `relay/src/dma/msg-type.ts` (28-04) | config | — | 자기 자신 `QueueProgress`(83) 승격 선례 | exact |
| `relay/src/dma/envelope.ts` (`parseLimitFeature`) | utility | transform | 같은 파일 `parseQueueProgress`(:818-870) | exact |
| `relay/src/hub/subscription-hub.ts` | service | pub-sub | 같은 파일 `#onQuote`(:2027-2039) · `#onFrame` 58/59/69/71 warn case(:1666-1673) | exact |
| `relay/src/ws/fanout.ts` | service | pub-sub | 같은 파일 `#deliverMarket` tape 규칙(:1814-1824) · sub 분기(:1080-1114) | exact |
| `relay/tests/helpers/frames.ts` (`buildLimitFeatureFrame`) | test | — | 같은 파일 `buildQueuedWindowStateFrame`/`buildTradeTapeFrame` | exact |
| `relay/tests/**/envelope.test.ts` · `codec.test.ts` 단언 | test | — | 기존 85 OUT_OF_SCOPE 단언 뒤집기 | exact |
| `webapp/src/lib/use-relay-socket.ts` (28-05) | store | event-driven | 같은 파일 `isMarketFrame`·`applyMarketFrames`(:766, :1157-1191) | exact |
| `webapp/src/lib/relay-provider.tsx` | provider | event-driven | 같은 파일 `useRelaySubscription` quote/tape 반환(:524-608) | exact |
| `webapp/src/components/trading/card/card-tabs.tsx` | component | — | 같은 파일 `CardTab`·`CountBadge`(:78-131) | exact |
| `webapp/src/components/trading/card/strategy-card.tsx` | component | — | `useStrategyCardState`(:257-276) · 호출부(:1002-1018) | exact |
| `webapp/src/components/trading/card/limit-feature-table.tsx` (신규) | component | — | `card-tabs.tsx` 탭 본문 / `QuoteGrid10` | role-match |
| `webapp/src/lib/order-log-feed.ts` (28-06) | utility | transform | 같은 파일 `matchesKind`·`matchesSide`(:114-166) | exact |
| `webapp/src/lib/use-order-log-feed.ts` | hook | event-driven | 자기 자신 | exact |
| `webapp/src/components/trading/order-log/order-log-filters.tsx` · `order-log-list.tsx` · `card/card-log-popups.tsx` | component | — | 자기 자신 세그먼트·칩 | exact |
| `webapp/src/lib/trading-layout.ts` | utility | file-I/O(localStorage) | `readPanelsPref`(:149-165) | exact |
| `server/src/routes/strategy-events.ts` · `server/src/schemas/orders.ts` · `services/dma-orders.ts` (`lf=1`) | route/service | request-response | 자기 자신 | exact |
| `workers/limitup-sync/{package.json,tsconfig.json,vitest.config.ts,Dockerfile,src/config.ts,src/logger.ts,src/index.ts,src/services/supabase.ts,tests/*}` (28-07) | service(job) | batch / file-I/O | `workers/limit-up-sync/` 한 벌 | exact |
| `workers/limitup-sync/src/{manifest,load,grid,purge}.ts` (신규 로직) | service | batch | `workers/limit-up-sync/src/rebuild.ts`(RPC 호출) | role-match |
| `scripts/deploy-limitup-sync.sh` | config | — | `scripts/deploy-limit-up-sync.sh` + `deploy-intraday-sync.sh:160-186` | exact |
| `scripts/setup-limitup-sync-iam.sh` · `scripts/smoke-limitup-sync.sh` | config | — | `scripts/setup-limit-up-sync-iam.sh` · `scripts/smoke-limit-up-sync.sh` | exact |
| `ops/alert-limitup-sync-failure.yaml` | config | — | `ops/alert-intraday-sync-failure.yaml` | exact |
| `infra/relay/limitup-pull/{limitup-pull.sh,.service,.timer,install.sh}` (28-08) | config | file-I/O | gh-trade `server/tools/archive/{tick-archive.sh,.service,.timer,install.sh}` · `infra/relay/netcut-daily.{timer,service}` | exact |
| `server/src/routes/limitup-report.ts` · `services/limitup.ts` · `schemas/limitup.ts` · `app.ts` (28-09) | route/service | request-response | `server/src/routes/strategy-events.ts` · `services/dma-orders.ts` · `schemas/orders.ts` | exact |
| `webapp/src/app/analytics/limitup/page.tsx` (28-10) | route(page) | — | `webapp/src/app/trading/page.tsx` | exact |
| `webapp/src/components/layout/app-sidebar.tsx` | component | — | 같은 파일 트레이딩 `GroupHeading`(:414-) · `useTradingVisible`(:368-385) | exact |
| `webapp/src/components/trading/dma-gate.tsx` | component | — | `DmaGateSurface` 유니온(:31) | exact |
| `webapp/src/components/analytics/*` (신규 — KPI·격자·사건 카드·지문표·어제 결과) | component | request-response | `components/stock/stock-limit-up-section.tsx` · `components/stock/sparkline.tsx` · `lib/limit-up-format.ts` | role-match |
| `webapp/e2e/specs/limitup-report.spec.ts` (28-11) | test | — | `webapp/e2e/specs/order-log.spec.ts`(`page.route` 목) | exact |
| `webapp/e2e/fixtures/relay.ts` (`pushLimitFeatureFixture`) | test | — | 같은 파일 `pushQuoteFixture`(:614-645) | exact |
| `docs/inbox/from-gh-trade/261005-limitup-feature-85.md` · `docs/relay-operations.md` (28-12) | docs | — | 인박스 `README.md` 형식 | exact |

---

## 패턴 배정

### 28-01 `supabase/migrations/…_dma_strategy_events_limit_feature.sql` (migration)

**선례 1:** `supabase/migrations/20261003120000_dma_strategy_events_burst_limit.sql` — 본문 그대로 복사하고 `(1, 2, 10)` 두 곳만 `(1, 2, 10, 15)` 로 바꾼다. 머리 주석 형식(무엇/왜/대상/집합 동기 경고)도 그대로.

```sql
       (e.kind NOT IN (1, 2, 10) AND EXISTS (
          SELECT 1
            FROM public.dma_visible_accounts(p_user_id) v
           WHERE v.gateway = e.gateway
             AND v.account_no = e.account_no))
       OR
       (e.kind IN (1, 2, 10) AND EXISTS (
          SELECT 1
            FROM public.dma_visible_accounts(p_user_id) v
           WHERE v.gateway = e.gateway))
     )
   ORDER BY e.gw_time_ms, e.gateway, e.seq;
$$;

-- 권한 재명시: service_role 전용 (시그니처 정확히 — Pitfall 13 · 플랫폼 auto-grant 대비 anon/authenticated 명시 REVOKE)
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_strategy_events_for_user(uuid, date) TO service_role;
```

**선례 2 (jsonb 래퍼 — max_rows 절단 방지):** `supabase/migrations/20261004090000_dma_journal_orders_for_user_json.sql`

```sql
CREATE OR REPLACE FUNCTION public.dma_journal_orders_for_user_json(p_user_id uuid, p_trade_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.last_seq DESC), '[]'::jsonb)
    FROM public.dma_journal_orders_for_user(p_user_id, p_trade_date) r;
$$;
```
차이: 원천 SETOF 가 이미 `jsonb` 를 돌려주므로 `r` 은 jsonb — `jsonb_agg(r ORDER BY (r->>'gw_time_ms')::bigint, r->>'gateway', (r->>'seq')::int)` + `WHERE p_include_limit_feature OR (r->>'kind')::int <> 15`. 시그니처 `(uuid, date, boolean)` 로 REVOKE/GRANT 3줄. purge RPC(`kind = 15 AND trade_date < KST오늘 - p_keep_days`)와 부분 인덱스 `ON dma_strategy_events (trade_date) WHERE kind = 15` 도 같은 파일, `BEGIN; … COMMIT;` 감싸기.

### 28-02 `…_limitup_tables.sql` · `…_limitup_rpcs.sql` (migration, batch)

**선례:** `20260929180000_dma_strategy_events.sql` 의 잠금 4줄(RLS ENABLE · `REVOKE ALL FROM PUBLIC` · `REVOKE ALL FROM anon, authenticated` · `GRANT SELECT, INSERT, UPDATE, DELETE TO service_role`, 정책 0개)을 표 6개 + `limitup_stage` + `limitup_loads` + 파생 표에 반복. RPC 는 위 래퍼와 같은 REVOKE 3줄 문법. 예약어 `"foreign"`·`"values"` 따옴표(Pitfall 7). commit RPC 모양은 RESEARCH §D-2 그대로(`jsonb_populate_record(NULL::public.limitup_x, row)`). Storage 버킷은 `INSERT INTO storage.buckets (...) VALUES ('limitup-grid', 'limitup-grid', false, …) ON CONFLICT DO NOTHING`.

### 28-03 shared

**`strategy-event.ts`** — kind 10 선례(:30-33, :70-84):
```ts
  /** 버스트 상한가 — 상한 매도잔량이 버스트 조각만으로 소진(gh-trade 3dabd6ff · 시세 이벤트 · 계좌 없음).
   *  슬롯 재사용: condActual = 조각 수 · evTradeQty = 합계 수량 · evPrice = 상한가 · cumVolume = 누적. */
  BurstLimit: 10,
...
 * ★ 같은 집합 {1, 2, 10} 을 조회 RPC `dma_strategy_events_for_user`(supabase 20261003120000)가 SQL 로 쓴다 —
 *   하나만 바뀌면 wss 푸시와 REST 백필이 갈린다.
 */
export function isMarketStrategyEvent(kind: number): boolean {
  return (
    kind === STRATEGY_EVENT_KIND.LimitExposed ||
    kind === STRATEGY_EVENT_KIND.LimitEntered ||
    kind === STRATEGY_EVENT_KIND.BurstLimit
  );
}
```
할 일: `LimitFeature: 15` 키(슬롯 매핑을 JSDoc 에), 11~14 주석의 「15 … Deferred」 줄 삭제, 판정에 `|| kind === STRATEGY_EVENT_KIND.LimitFeature`, ★ 주석 집합·마이그레이션 번호 갱신.

**`strategy-event-text.ts`** — `strategyEventParts` switch 의 `case 10`(:113-114):
```ts
    case 10:
      return { badge: strategyKindLabel(10), tone: "market", action: null, body: burstLimitBody(ev), cum };
```
`case 15` 는 같은 모양으로 `tone: "feature"`(새 값), `action: null`, 본문은 `limit-feature.ts` 의 「row → RelayLimitFeatureMsg 되돌림」 + 문장 함수. 강조 조각(「잠김 N초」)은 `StrategyEventParts`(:84-97)에 선택 필드 추가 — `orderLogLineText`(:429-438)는 평문 유지.

**`relay.ts`** — RESEARCH §A-4 의 `RelayLimitFeatureMsg` 모양, `RelayOutbound` 유니온(:1549-1573)에 추가.

**`limit-feature.ts` (신규)** — 순수 포맷 함수 모듈 문법은 `webapp/src/lib/limit-up-format.ts`(`export function fmtRet(v: number | null): string` 식 total 함수, null → 「—」). WinForms 원문은 RESEARCH §B-4(반올림 Pitfall 6: .NET 기본 ToEven), `message` 파서는 §C-4(잘린 꼬리는 버림).

### 28-04 relay 85

**`msg-type.ts`** — `INBOUND_MSG_TYPES` 끝(:270-274)에 `MSG.LimitFeature,` 추가, `OUT_OF_SCOPE_INBOUND_MSG_TYPES`(:297-299)에서 85 제거 + 주석 목록의 `LimitFeature = 85` 줄 삭제:
```ts
export const OUT_OF_SCOPE_INBOUND_MSG_TYPES: ReadonlySet<number> = new Set<number>([
  68, 70, 74, 75, 81, 82, 85,
]);
```

**`envelope.ts` — `parseQueueProgress`(:818-870) 문법:**
```ts
export function parseQueueProgress(env: Envelope): QueueProgressFrame | null {
  const msgType = MSG.QueueProgress;
  const qp = env.queueProgress();
  if (qp === null) return dropField("slot-null", msgType, { slot: "queue_progress" });

  const isin = qp.isin() ?? "";
  const exchange = qp.exchange() ?? "";
  if (!isValidIsin(isin)) return dropField("bad-isin", msgType, { isin });
  if (!isValidExchange(exchange)) return dropField("bad-exchange", msgType, { isin, exchange });

  const n = takeCount(qp.itemsLength(), MAX_QUEUE_PROGRESS_ITEMS, "잔량진행률 항목");
  const items: QueueProgressWireItem[] = [];
  const scratch = new QueueProgressItem();
  ...
      expectedCum: toNum(it.expectedCum(), "queue_progress.expected_cum"),
```
`parseLimitFeature` 완성형은 RESEARCH 「Code Examples · relay — 85 파서」 그대로(`MAX_LIMIT_FEATURE_MEMBERS = 3`, `MemberDelta` scratch, bigint 는 전부 `toNum`). 계좌가 없으므로 계좌 스킵 로깅 블록은 불필요.

**`subscription-hub.ts`** — 캐시 수명은 `#onQuote`(:2027-2039)를 그대로:
```ts
  #onQuote(quote: RelayQuote): void {
    const key = marketKey(quote.i, quote.x);
    const refs = this.#refs.get(key);
    if (refs === undefined) {
      logger.debug({ isin: quote.i, exchange: quote.x }, "[HUB] 구독 없는 키의 시세 — 버림 (해제 뒤 늦은 프레임)");
      return;
    }
    const prev = this.#quotes.get(key);
    this.#quotes.set(key, quote);
    const price = this.#priceFlag(key, refs, prev, quote);
    this.emit("market", { key, msg: quote, full: true, price });
  }
```
`#onLimitFeature` 는 `price: false` 고정(tape `#flush` :2470-2483 과 같은 플래그). `#onFeedFrame` 의 `case MSG.QueueProgress:` 옆에 `case MSG.LimitFeature:` 명시 case. 사용자 세션 `#onFrame` 은 명시 warn case(:1666-1673 문법):
```ts
      case MSG.GetQuoteResp:
      case MSG.QuoteUpdate:
      case MSG.TradeTapeResp:
      case MSG.TradeTapePush:
        // Phase 26 D-08 — 사용자 세션은 종목을 구독하지 않는다. ...
        logger.warn({ userId, msgType: e.msgType }, "[HUB] 사용자 세션에 시세 프레임 — 구독이 없으니 이상 신호, 무시");
        return;
```
→ 85 를 이 묶음에 더한다. `#releaseKey`(:1135-1150) · `closeAll`(:1620-1655)에 `#limitFeatures.delete/clear`, `getLimitFeature(isin, ex)` 공개 접근자, `HubMarketEvent.msg` 유니온 확장(:352-360 주석에 이유).

**`fanout.ts`** — `#deliverMarket`(:1814-1824):
```ts
      if (e.msg.t === "tape" && lv !== "full") continue;
```
→ `(e.msg.t === "tape" || e.msg.t === "limit.feature") && lv !== "full"`. 스냅샷은 두 자리(price→full 승격 :1082-1091 · 새 키 full :1109-1112)에서 tape 다음에:
```ts
          const snapshot = this.#hub.getSnapshot(msg.isin, msg.ex);
          if (snapshot !== undefined) this.#send(conn, snapshot);
          this.#sendTapeSnapshot(conn, msg.isin, msg.ex);
```

**`tests/helpers/frames.ts`** — `buildQueuedWindowStateFrame`(:1219) / `buildTradeTapeFrame`(:178) 문법(Fake 입력 타입 + 기본값 + `flatbuffers.Builder` → Envelope). import 는 :46-47 처럼 `../../src/generated/stock-dma/limit-feature.js` · `member-delta.js`.

### 28-05 webapp 85

**`use-relay-socket.ts`** — 배치 대상 판정(:763-768)과 copy-on-write 병합(:1157-1191):
```ts
type RelayMarketFrame = RelayQuote | RelayTape;

function isMarketFrame(frame: RelayOutbound): frame is RelayMarketFrame {
  return frame.t === "q" || frame.t === "tape";
}
...
  let quotes: Map<string, RelayQuote> | null = null;
  ...
      quotes ??= new Map(state.quotes);
```
→ 유니온·판정에 `"limit.feature"`, `let limitFeatures` 같은 지연 복사, 반환에 `limitFeatures: limitFeatures ?? state.limitFeatures`. level 하강/해제 시 키 삭제는 `flushSubscriptions`(:1485-1545)에서.

**`card-tabs.tsx`** (:78, :112-131):
```ts
export type CardTab = "info" | "unfilled" | "holdings";
...
const CARD_TABS_BODY_H = "h-[calc(3*(11px*var(--lh-normal)+6px)+4px)]";

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span data-slot="card-tab-count" className="mono">
      ({count})
    </span>
  );
}
```
→ `"limit"` 추가, 제목 접미 「 · 잠김 43초」 를 `CountBadge` 자리 문법으로, props 에 `limitFeature: RelayLimitFeatureMsg | null`. `alertTabFor`(`lib/trading-alerts.ts:364-377`)가 `"limit"` 를 반환하지 않음을 테스트로 고정.

### 28-06 webapp kind 15

**`order-log-feed.ts`** (:114-119, :160-166):
```ts
export function matchesKind(row: StrategyEventRow, kind: OrderLogKindFilter): boolean {
  if (kind === 'all') return true;
  const market = isMarketStrategyEvent(row.kind);
  if (kind === 'market') return market;
  return !market && KIND_GROUPS[kind].includes(row.group);
}
...
export function matchesSide(row: StrategyEventRow, side: OrderLogSideFilter): boolean {
  if (side === 'all') return true;
  return strategyEventParts(row, 'log').tone === side;
}
```
→ `matchesSide` 의 `'market'` 은 `isMarketStrategyEvent` 로(Pitfall 4). `applyOrderLogFilters` 앞단에 `showLimitFeature` 체크 필터.

**`trading-layout.ts`** `readPanelsPref`(:149-165) — 키 화이트리스트 한 줄씩:
```ts
    if (typeof p.cardTabsFolded === "boolean") out.cardTabsFolded = p.cardTabsFolded;
```
→ 타입 필드 + `if (typeof p.orderLogLimitFeature === "boolean") …` 한 줄.

**server** — `schemas/orders.ts:122` `export const StrategyEventsQuery = OrderListQuery;` 를 `OrderListQuery.extend({ lf: z.enum(["0","1"]).optional() })` 로, `services/dma-orders.ts:101` `listStrategyEvents` 가 새 `_json` RPC 를 부르도록(같은 파일 `dma_journal_orders_for_user_json` 호출이 선례 — :57 주석).

### 28-07 `workers/limitup-sync` (batch job)

**선례:** `workers/limit-up-sync/` 한 벌(Pitfall 12 — 이름 하이픈 유무 혼동 주의, 새 패키지명 `@gh-radar/limitup-sync`).

`src/index.ts` 진입·종료 문법:
```ts
async function main(): Promise<void> {
  try {
    const out = await dispatch();
    logger.info({ result: out }, "limit-up-sync complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "limit-up-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 (vitest import 시에는 실행 안 함) — candle-sync 패턴 mirror
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main();
}
```
`dispatch()` 는 `loadConfig()` → `logger.child({ app, version })` → `createSupabaseClient(config)` → 작업 함수, 결과 객체 반환(요약 1줄 `loaded/skipped/purged`).

`src/config.ts` — env 필수 검증 후 throw(:`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set`), 숫자 env 는 `Number.isFinite` 검사. `LIMITUP_EXPORT_DIR` 추가.

`src/logger.ts`:
```ts
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: ["*.supabaseServiceRoleKey"], censor: "[REDACTED]" },
});
```
`Dockerfile` — 2단 빌드를 이름만 치환(`workers/limit-up-sync` → `workers/limitup-sync`, `@gh-radar/limit-up-sync` → `@gh-radar/limitup-sync`). shared dist 복사 줄 유지:
```dockerfile
RUN pnpm --filter=@gh-radar/limit-up-sync --prod --legacy deploy /out
RUN cp -r /app/workers/limit-up-sync/dist /out/dist
...
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist
```
휴장일 가드가 필요하면 `index.ts` 의 `isKrxHoliday`/`isKrxCalendarStale` 블록 재사용(단, 이 워커는 manifest 존재가 기준이라 가드 불필요할 수 있음 — 플래너 재량).

### `scripts/deploy-limitup-sync.sh` · setup-iam · smoke · alert yaml

**선례:** `scripts/deploy-limit-up-sync.sh` Section 1~5 (가드 → SA 확인 → build `--platform=linux/amd64` → push → `deploy_job`):
```bash
RUNTIME_SA="gh-radar-limit-up-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
COMMON_ENV="^@^SUPABASE_URL=${SUPABASE_URL}@LOG_LEVEL=info@APP_VERSION=${SHA}@LOOKBACK_MONTHS=24"
COMMON_SECRETS="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

deploy_job() {
  local job="$1" timeout="$2" memory="$3"
  gcloud run jobs deploy "$job" \
    --image="$IMAGE" --region="$REGION" --service-account="$RUNTIME_SA" \
    --cpu=1 --memory="$memory" --task-timeout="$timeout" \
    --max-retries=0 --parallelism=1 --tasks=1 \
    --set-env-vars="${COMMON_ENV}" --set-secrets="$COMMON_SECRETS"
```
차이: `--add-volume=name=export,type=cloud-storage,bucket=gh-radar-limitup-export,readonly=true --add-volume-mount=volume=export,mount-path=/mnt/export`, env `LIMITUP_EXPORT_DIR=/mnt/export/export`, Scheduler `"20 21 * * 1-5"` Asia/Seoul, timeout 1800s · 1Gi.

알림 단계 = `scripts/deploy-intraday-sync.sh:160-186` 그대로(displayName 만 `gh-radar-limitup-sync-failure`):
```bash
ALERT_FILE="ops/alert-intraday-sync-failure.yaml"
if [[ -f "$ALERT_FILE" ]]; then
  : "${NOTIFICATION_CHANNEL_ID:?NOTIFICATION_CHANNEL_ID must be set for alert policy}"
  CHANNEL_RESOURCE="$NOTIFICATION_CHANNEL_ID"
  case "$CHANNEL_RESOURCE" in
    projects/*) ;;
    *) CHANNEL_RESOURCE="projects/${EXPECTED_PROJECT}/notificationChannels/${NOTIFICATION_CHANNEL_ID}" ;;
  esac
  RESOLVED_YAML=$(mktemp)
  sed "s|\${NOTIFICATION_CHANNEL_ID}|${CHANNEL_RESOURCE}|g" "$ALERT_FILE" > "$RESOLVED_YAML"
  EXISTING_POLICY=$(gcloud alpha monitoring policies list \
    --filter="displayName=gh-radar-intraday-sync-failure" --format='value(name)' 2>/dev/null | head -1)
  if [[ -n "$EXISTING_POLICY" ]]; then
    gcloud alpha monitoring policies update "$EXISTING_POLICY" --policy-from-file="$RESOLVED_YAML" >/dev/null
  else
    gcloud alpha monitoring policies create --policy-from-file="$RESOLVED_YAML" >/dev/null
  fi
  rm -f "$RESOLVED_YAML"
fi
```
`setup-limitup-sync-iam.sh` = `setup-limit-up-sync-iam.sh` 복제 + 버킷 생성(멱등) + 버킷 단위 `roles/storage.objectViewer`(워커 SA) + relay SA 에 `roles/storage.objectUser`(Pitfall 8). `smoke-limitup-sync.sh` = `smoke-limit-up-sync.sh` INV 복제 + 「날짜별 행 수 == manifest rows」.

### 28-08 `infra/relay/limitup-pull/` (radar-gw systemd)

**선례:** gh-trade `server/tools/archive/tick-archive.{timer,service,sh}` + `install.sh` (같은 호스트).

타이머(UTC 호스트 — `Asia/Seoul` 접미사 필수, `Persistent=` 없음):
```ini
[Unit]
Description=Run tick-archive daily at 22:00 KST

[Timer]
OnCalendar=*-*-* 22:00:00 Asia/Seoul
Unit=tick-archive.service

[Install]
WantedBy=timers.target
```
→ `OnCalendar=Mon..Fri 21:00:00 Asia/Seoul`. 서비스(자원 상한 · 전용 사용자 · EnvironmentFile · [Install] 없음):
```ini
[Service]
Type=oneshot
User=tickarc
Group=tickarc
EnvironmentFile=/etc/tick-archive.env
ExecStart=/usr/local/lib/tick-archive/tick-archive.sh
Nice=19
IOSchedulingClass=idle
MemoryMax=600M
OOMScoreAdjust=500
TimeoutStartSec=6h
```
스크립트 머리: `set -euo pipefail`, 옵션 `--self-test`/`--check`/`--dry-run`, 종료코드 0/1/2 규약, env 기본값 `REMOTE=${REMOTE:-smok95@10.16.207.119}`·`SSH_KEY`·`KNOWN_HOSTS`. 차이: 본문은 `rsync -az --delete --exclude='*.tmp'` → `gcloud storage rsync`(manifest 제외 1차 → manifest 2차, RESEARCH §F-2). gh-radar 쪽 유닛 배치 선례 = `infra/relay/netcut-daily.{timer,service}`(`OnCalendar=Mon-Fri 08:00 Asia/Seoul`, `Persistent=false`).

### 28-09 server `/api/limitup`

**선례:** `server/src/routes/strategy-events.ts`(머리 방어선 주석 블록 + 핸들러):
```ts
strategyEventsRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = StrategyEventsQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const rows: StrategyEventRow[] = await listStrategyEvents(supabase, req.userId!, parsed.data.date);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
```
서비스 에러는 `services/dma-orders.ts:51` `const DbError = (msg: string) => new ApiError(500, "DB_ERROR", msg);`, 한 요청 = RPC 1회 원칙(같은 파일 :45 주석). 등록은 `app.ts:99` 다음 줄 `app.use("/api/limitup", limitupRouter);`(주석 한 줄 동반). 서명 URL 은 `supabase.storage.from('limitup-grid').createSignedUrls(paths, 600)`.

### 28-10 `webapp/src/app/analytics/limitup/page.tsx`

**선례:** `webapp/src/app/trading/page.tsx`
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
(`useSearchParams` 때문에 Suspense, 폴백 비움 — 같은 머리 주석 규율.)

**`app-sidebar.tsx`** — lucide import(:6 `import { Home, MessageSquare, Search, User, Zap } from "lucide-react";`)에 아이콘 추가, 트레이딩 블록(:414-) 다음에 같은 조건:
```tsx
        {tradingVisible && (
          <>
            <GroupHeading
              label={NAV_TRADING.label}
              icon={NAV_TRADING.icon}
              item={NAV_TRADING}
              active={isActive(NAV_TRADING.href)}
              rail={rail}
              badge={sidebarChasers.length}
            />
```
**`dma-gate.tsx:31`**:
```ts
export type DmaGateSurface = "상따 전략" | "VI 자동매수" | "전략·잔고·미체결" | "트레이딩";
```
→ `| "상한가 보고서"`.

### 28-10/11 `webapp/src/components/analytics/*`

**선례:** `components/stock/stock-limit-up-section.tsx`(상한가 데이터 섹션 구조) · `components/stock/sparkline.tsx`(inline SVG, `stroke={'var(--up)'}`) · `lib/limit-up-format.ts`(`fmtRet` 은 **퍼센트 입력** — export 소수는 ×100, Pitfall 10; `sparkBucketTone`·`fmtTurnover` 재사용).

### 28-11 `webapp/e2e/specs/limitup-report.spec.ts`

**선례:** `webapp/e2e/specs/order-log.spec.ts:78-85`
```ts
async function mockRestore(page: Page, rows: readonly StrategyEventRow[]): Promise<{ count: () => number }> {
  let n = 0;
  await page.route('**/api/strategy-events*', async (route) => {
    n += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  return { count: () => n };
}
```
→ `**/api/limitup/report*` · `**/api/limitup/grid-urls*` 목. 머리 주석 ①②③ 형식(무엇을 증명 · 픽스처 · 규약)도 그대로. 카드 탭 85 e2e 는 `e2e/fixtures/relay.ts` `pushQuoteFixture`(:614-645) 문법으로 `pushLimitFeatureFixture(gateway, sock, { isin, exchange })` 를 두고 GetQuoteReq 처리(:715)처럼 FULL 구독 시 밀어 넣는다.

---

## 공통 패턴

### Supabase RPC 잠금
**출처:** `20261003120000_…burst_limit.sql` 끝 3줄 · `20261004090000_…json.sql`
**적용:** 28-01·28-02 의 모든 함수 — `REVOKE … FROM PUBLIC` + `REVOKE … FROM anon, authenticated` + `GRANT … TO service_role`, 시그니처 정확히, `SECURITY INVOKER` · `SET search_path = public, pg_temp`, `BEGIN/COMMIT`.

### 시세 집합 이중 정본
**출처:** `strategy-event.ts` ★ 주석 · 마이그레이션 머리 주석
**적용:** 28-01·28-03 — SQL `(1, 2, 10, 15)` 와 `isMarketStrategyEvent` 를 한 플랜 경계 안에서 같이 바꾸고 서로의 파일명을 주석에 적는다. relay 는 shared 를 import 하므로 재배포 필요.

### PC-12 명시 case
**출처:** `subscription-hub.ts` `#onFrame`/`#onFeedFrame` default 계수기
**적용:** 28-04 — 화이트리스트(`INBOUND_MSG_TYPES`) 변경과 명시 case 는 한 커밋. `default:` 에 맡기지 않는다.

### 공개 시세 = FULL 소켓만
**출처:** `fanout.ts:1820` tape 규칙
**적용:** 28-04 팬아웃 · 28-05 카드(level `"full"` 일 때만 사용).

### server 라우트 규율
**출처:** `routes/strategy-events.ts`
**적용:** 28-06 · 28-09 — `requireAuth()` → zod `safeParse` → `ValidationFailed` → `req.userId!` 만 RPC 로 → `next(e)`. list 응답은 bare array.

### 워커 배포 한 벌
**출처:** `scripts/deploy-limit-up-sync.sh` + `deploy-intraday-sync.sh:160-186`
**적용:** 28-07 — env `GCP_PROJECT_ID`·`SUPABASE_URL` 필수, `NOTIFICATION_CHANNEL_ID` 없으면 알림 단계만 실패(메모리 기록). 실행은 메인 세션(서브에이전트 배포 금지).

## 선례 없음

| 파일 | 역할 | 데이터 흐름 | 이유 |
|---|---|---|---|
| `limitup_commit_day` RPC (stage → 날짜 단위 원자 교체) | migration | batch | 기존 적재는 전부 upsert/apply — stage+commit 선례 없음. RESEARCH §D-2 모양 사용 |
| `workers/limitup-sync` GCS 볼륨 읽기 · sha256 대조 · Storage 업로드 | service | file-I/O | 기존 워커는 HTTP API/DB 만 읽음. 로직은 RESEARCH §E-2, Storage `upload(..., { upsert: true })` |
| `components/analytics/*` 사건 카드 레인(다층 SVG) | component | — | `sparkline.tsx` 가 가장 가깝지만 레인·오버레이 마커 선례 없음 — UI-SPEC 규칙(`preserveAspectRatio="none"`, 마커는 HTML 오버레이) |

## 메타데이터

**검색 범위:** `relay/src/{dma,hub,ws}`, `relay/tests/helpers`, `packages/shared/src`, `supabase/migrations`, `workers/limit-up-sync`, `scripts`, `ops`, `infra/relay`, `server/src/{routes,services,schemas,app.ts}`, `webapp/src/{app,components,lib}`, `webapp/e2e`, gh-trade `server/tools/archive`
**스캔 파일 수:** 약 30
**추출일:** 2026-10-05
