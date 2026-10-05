---
phase: 28-limitup-feature-ingest
reviewed: 2026-10-05T12:30:00Z
depth: standard
diff_base: e8b9ce0f
review_head: 5755e256
parts: "A(relay · shared · webapp 42) + B(DB · worker · server · infra 33) — 76 소스 파일 범위가 커서 두 리뷰어로 나눠 병렬 실행"
files_reviewed: 75
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/limit-feature.ts
  - packages/shared/src/limitup-report.ts
  - packages/shared/src/member-codes.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/strategy-event-labels.ts
  - packages/shared/src/strategy-event-text.ts
  - packages/shared/src/strategy-event.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - webapp/src/app/analytics/limitup/page.tsx
  - webapp/src/components/analytics/limitup-date-nav.tsx
  - webapp/src/components/analytics/limitup-day-grid.tsx
  - webapp/src/components/analytics/limitup-event-card.tsx
  - webapp/src/components/analytics/limitup-fingerprint-table.tsx
  - webapp/src/components/analytics/limitup-kpi-strip.tsx
  - webapp/src/components/analytics/limitup-lane.tsx
  - webapp/src/components/analytics/limitup-report.tsx
  - webapp/src/components/analytics/limitup-sparkline.tsx
  - webapp/src/components/analytics/limitup-yesterday-table.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/trading/card/card-log-popups.tsx
  - webapp/src/components/trading/card/card-tabs.tsx
  - webapp/src/components/trading/card/limit-feature-table.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/dma-gate.tsx
  - webapp/src/components/trading/order-log/order-log-filters.tsx
  - webapp/src/components/trading/order-log/order-log-list.tsx
  - webapp/src/components/trading/order-log/order-log-panel.tsx
  - webapp/src/components/trading/order-log/order-log-window.tsx
  - webapp/src/lib/limitup-api.ts
  - webapp/src/lib/limitup-lanes.ts
  - webapp/src/lib/limitup-report.ts
  - webapp/src/lib/order-log-feed.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/strategy-events-api.ts
  - webapp/src/lib/trading-layout.ts
  - webapp/src/lib/use-limitup-grid.ts
  - webapp/src/lib/use-order-log-feed.ts
  - webapp/src/lib/use-relay-socket.ts
  - docs/relay-operations.md
  - infra/relay/limitup-pull/install.sh
  - infra/relay/limitup-pull/limitup-pull.service
  - infra/relay/limitup-pull/limitup-pull.sh
  - infra/relay/limitup-pull/limitup-pull.timer
  - ops/alert-limitup-sync-failure.yaml
  - scripts/deploy-limitup-sync.sh
  - scripts/setup-limitup-sync-iam.sh
  - scripts/smoke-limitup-sync.sh
  - server/src/app.ts
  - server/src/routes/limitup-report.ts
  - server/src/routes/strategy-events.ts
  - server/src/schemas/limitup-report.ts
  - server/src/schemas/orders.ts
  - server/src/services/dma-orders.ts
  - server/src/services/limitup-report.ts
  - supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql
  - supabase/migrations/20261006090100_limitup_tables.sql
  - supabase/migrations/20261006090200_limitup_load_rpcs.sql
  - supabase/migrations/20261006090300_limitup_retention_storage.sql
  - supabase/migrations/20261006090400_limitup_report_rpcs.sql
  - workers/limitup-sync/Dockerfile
  - workers/limitup-sync/package.json
  - workers/limitup-sync/src/config.ts
  - workers/limitup-sync/src/derive.ts
  - workers/limitup-sync/src/grid.ts
  - workers/limitup-sync/src/index.ts
  - workers/limitup-sync/src/load.ts
  - workers/limitup-sync/src/logger.ts
  - workers/limitup-sync/src/manifest.ts
  - workers/limitup-sync/src/purge.ts
  - workers/limitup-sync/src/services/supabase.ts
  - workers/limitup-sync/tsconfig.json
findings:
  critical: 1
  warning: 10
  info: 16
  total: 27
status: issues_found
---

# Phase 28 코드 리뷰 (A + B 합본)

테스트 · 픽스처를 뺀 Phase 28 소스 75개 파일을 standard 깊이로 봤다. 두 파트의 원문을 그대로 붙였다.

| 파트 | 범위 | Critical | Warning | Info |
|---|---|---|---|---|
| A | relay · shared · webapp | 0 | 5 | 9 |
| B | DB · worker · server · infra | 1 | 5 | 7 |

# 파트 A

# Phase 28 (Part A): 코드 리뷰 보고서

**검토 시각:** 2026-10-05T12:24:19Z
**깊이:** standard (diff_base `e8b9ce0f` — Phase 27 변경이 섞인 파일은 Phase 28 부분만 봤다)
**검토 파일:** 42
**상태:** issues_found

## 요약

Part A 범위(85 LimitFeature relay 경로 · shared 표기/창구표/kind 15 문장 조립 · 카드 「상한가」 탭 · 주문로그 「상한가 특징」 체크 · `/analytics/limitup` 보고서)를 읽었다. 파서(`parseLimitFeature`) · msg-type 화이트리스트/OUT_OF_SCOPE 이동 · `#deliverMarket` 의 full 소켓 한정 · .NET 반올림 재현(`formatEok` · `formatRatePct` · `roundPctHalfEven` · `formatManQty`) · kind 15 `message` 파서의 잘림 꼬리 처리는 추적해 보았고 맞다.

실제 결함은 다섯 가지다.
1. **relay 85 캐시가 FULL→PRICE 강등 · quote 재접속 뒤에도 남는다.** 다시 펼친 카드가 그 낡은 프레임을 「지금」 값으로 받는다. 웹이 접을 때 지우는 장치(`limit-feature.drop`)도 relay 스냅샷이 곧바로 다시 채워 넣어 소용이 없다.
2. **켜 둔 채 장중 몇 시간이 지나면 kind 15 줄 중간이 조용히 빈다.** 「상한가 특징」 kind 15 라이브 저장소는 5,000행 상한이고, REST 는 날짜당 한 번만 불러온다.
3. **`orderLogLimitFeature` pref 를 `useState` 지연 초기화로 읽어** SSR 되는 `/trading/order-log` 창에서 하이드레이션이 어긋난다. 프로젝트의 다른 pref 는 마운트 뒤에 읽는다.
4. **보고서 격자 캐시(`gridCache`)에 상한이 없다.** 날짜를 넘길수록 해제된 격자 JSON 이 페이지 수명 동안 쌓인다.
5. **하루 격자 행이 `<button aria-label>` 이다.** 행의 메타값(첫 잠김 · 최대 잔량 · +60초 매도 · 결과 · 창구)이 보조기기에 전혀 노출되지 않는다.

Critical(BLOCKER) 은 없다. 85 표시는 D-19 상 주문 판단에 쓰지 않는 값이고, 위 결함 모두 데이터 손상이나 보안 문제는 아니다.

## Narrative Findings (AI reviewer)

## Warnings

### WR-A01: relay 85 키 캐시가 FULL→PRICE 강등 · quote 재접속 뒤에도 남아, 다시 펼친 카드에 낡은 「잠김 N초째」 를 스냅샷으로 준다

**File:** `relay/src/hub/subscription-hub.ts:1117`, `relay/src/hub/subscription-hub.ts:1064`, `relay/src/hub/subscription-hub.ts:1228`, `relay/src/ws/fanout.ts:1102`, `relay/src/ws/fanout.ts:1126`, `webapp/src/lib/use-relay-socket.ts:2106`

**Issue:** `#limitFeatures` 항목은 `#releaseKey`(1163) 와 `closeAll` 에서만 지워진다. 아래 세 경로는 업스트림이 더는 85 를 받지 않는데도 캐시를 그대로 둔다.
- `unsubscribe` 의 FULL→PRICE 강등(1117) — 마지막 FULL 소비자가 카드를 접은 경우.
- `#resumeFromLinger` 의 강등(1064).
- `resubscribeAll`(quote 연결 재접속, 1228) — 끊긴 동안 받지 못한 85 가 있다.

이 상태에서 같은 키를 다시 FULL 로 잡으면 다음 일이 차례로 일어난다.
1. hub 가 승격 28/29/32 를 보낸다.
2. fanout 이 곧바로 `#sendLimitFeatureSnapshot` 으로 강등 전(또는 재접속 전) 마지막 프레임을 내린다. 같은 소켓의 price→full 경로(1102)도, 새 키 full 경로(1126)도 마찬가지다.
3. 서버는 새 구독자에게 85 를 다시 보내지 않고 값이 바뀐 키만 보낸다(D-23). 그래서 조용한 키는 다음 85 가 올 때까지(최대 ~60초, 조용하면 그 이상) 낡은 값이 남는다. 그 값이 「잠김 43초째」 · 탭 제목 「상한가 · 잠김 43초」 같은 **틀린 현재 상태**일 수 있다. 낡았다는 표시(stale 감쇠)도 없다.

웹의 `limit-feature.drop`(use-relay-socket 2106)은 바로 이 「얼린 값」 을 막으려는 장치다. 하지만 다시 펼치는 순간 relay 스냅샷이 같은 낡은 값을 다시 넣으므로 실제로는 막지 못한다. 주석 「다시 펼치면 승격 스냅샷(D-23)이 즉시 덮는다」 는 relay 캐시가 최신이라는 전제를 깔고 있는데, 그 전제가 틀렸다.

**Fix:** 업스트림 실효 level 이 FULL 에서 벗어나는 모든 자리와 quote 재구독 시작점에서 캐시를 지운다.
```ts
// unsubscribe — FULL→PRICE 강등 분기 (pacer.control "demote" 직전)
this.#limitFeatures.delete(key);
// #resumeFromLinger — 강등 분기에서도 같은 한 줄 (marketKey(isin, exchange))
// resubscribeAll — pacer.reset() 뒤
this.#limitFeatures.clear(); // 새 연결은 85 를 재전송하지 않는다 — 끊긴 동안의 값은 모른다
```
선택 사항: 캐시에 수신 시각을 같이 두고 `Date.now() - receivedAt > 2_000` 이면 스냅샷을 생략하는 2차 방어도 둘 수 있다. hub 테스트에 「강등 → 재승격 시 85 스냅샷 없음」 단언을 추가한다.

### WR-A02: 「상한가 특징」 을 켠 채 몇 시간이 지나면 kind 15 줄 중간 구간이 조용히 빠진다(5,000 상한 + 날짜당 1회 REST)

**File:** `webapp/src/lib/use-relay-socket.ts:158`, `webapp/src/lib/use-relay-socket.ts:985`, `webapp/src/lib/use-order-log-feed.ts:163-168`, `webapp/src/lib/use-order-log-feed.ts:184-195`

**Issue:** 화면에 보이는 kind 15 는 아래 둘을 합친 것이다.
- **`restoredLf`:** 체크를 켠 시점(또는 relay ready 전이 시점)의 REST `?lf=1` 스냅샷. 날짜가 같으면 `lfCached` 때문에 다시 부르지 않는다.
- **`limitFeatureEvents`:** 라이브 저장소. `MAX_LIMIT_FEATURE_EVENTS = 5000` 을 넘으면 오래된 것부터 버린다.

kind 15 는 게이트웨이의 **모든 대상 키**가 분당 1행씩 모든 사용자에게 푸시된다(계약상 「수십 키 × 390분 ≈ 수천~1만 행/일」). 키가 40개면 약 2시간이면 5,000 이 찬다. 09:00 에 켜서(또는 pref 로 켜진 상태로 페이지를 열어) 14:00 까지 두면 이렇게 된다.
- REST 캐시 = 09:00 까지
- 라이브 = 최근 ~2시간
- **그 사이 수 시간 분량이 목록에서 사라진다.**

껐다 켜도 `lfCached` 가 참이라 다시 불러오지 않는다. 건수(「N건」) 도 그대로 줄어든 값을 보여 주므로 사용자가 결손을 알아챌 수 없다. 주석(use-relay-socket 151-157)의 「체크를 켤 때 REST `?lf=1` 이 그날 분량을 다시 준다」 는 실제 동작과 다르다. 다시 받는 것은 그날 처음 켤 때 한 번뿐이다.

**Fix:** 아래 중 하나를 택한다.
- 피드가 켜져 있는 동안 받은 kind 15 를 `restoredLf` 쪽 누적기에 이어 붙인다. 켜진 동안에만 그 날짜 상한 없이 보관하고, 라이브 저장소의 축출과는 무관하게 한다.
- 라이브 저장소에서 축출이 일어났다는 신호(예: `limitFeatureEvents[0]` 의 키가 바뀜)를 감지하면, 켜져 있을 때 `loadLf()` 를 다시 부른다.
```ts
// 예: 축출 감지 → 재조회
const oldestLive = limitFeatureEvents[0];
useEffect(() => {
  if (!showLimitFeature || !isToday || oldestLive === undefined) return;
  const cachedTail = restoredLf?.rows.at(-1);
  if (cachedTail && compareStrategyEventAsc(cachedTail, oldestLive) < 0) void loadLf(); // 틈 발생
}, [oldestLive, showLimitFeature, isToday]);
```
같이 할 일: use-relay-socket 151-157 주석을 실제 동작에 맞게 고친다.

### WR-A03: `orderLogLimitFeature` pref 를 `useState` 지연 초기화로 읽어, SSR 되는 `/trading/order-log` 창에서 하이드레이션이 어긋난다

**File:** `webapp/src/lib/use-order-log-feed.ts:119`

**Issue:** `useState(() => readPanelsPref().orderLogLimitFeature === true)` 는 서버에서는 `false`(`window` 없음 → `{}`), 클라이언트 첫 렌더에서는 `true` 가 된다. `/trading/order-log` 페이지는 `generateMetadata` 가 `searchParams` 를 읽어 동적 SSR 되고, `OrderLogWindow → OrderLogFilters` 가 서버에서 그려진다. 그래서 pref 가 켜진 사용자에게는 체크박스 `checked`, 칩 `data-on`/`className`, `resetKey`, 피드 `status`(lf 로딩 합성)가 서버 HTML 과 다르다. React 19 는 속성 불일치를 프로덕션에서 고치지 않는다. 그 결과 체크는 켜져 있는데 칩이 꺼진 모양으로 남는 식의 시각 불일치가 생기고, dev 에서는 hydration 경고가 뜬다. 같은 파일 묶음의 다른 pref(`vi-trigger-strip.tsx:82` · `shared-panels.tsx:216`)는 일부러 「마운트 후에 읽는다(하이드레이션)」 규율을 지킨다. 이 훅만 그 규율을 어겼다.

**Fix:**
```ts
const [showLimitFeature, setShowLimitFeatureState] = useState(false);
useEffect(() => {
  if (readPanelsPref().orderLogLimitFeature === true) setShowLimitFeatureState(true);
}, []);
```
지연 초기화로 첫 페인트 점프를 피하는 `card-tabs.tsx:200` 선례는 「SSR 대상이 아닌 클라이언트 전용 조각」 이라는 전제가 있을 때만 성립한다. 피드 훅은 그 전제를 만족하지 않는다.

### WR-A04: 보고서 격자 모듈 캐시(`gridCache`)에 상한이 없어 날짜를 넘길수록 메모리가 계속 쌓인다

**File:** `webapp/src/lib/use-limitup-grid.ts:25`, `webapp/src/lib/use-limitup-grid.ts:83`

**Issue:** `gridCache` 는 모듈 수준 `Map` 이고, 페이지 수명 동안 지우는 경로가 없다(`__resetLimitupGridCache` 는 테스트 전용). 격자 하나의 크기는 다음과 같다.
- coarse 2,340점 × 24열에 fine 창이 더해진다. fine 창은 잠김이 길면 23,400초 × 24열까지 간다.
- 하루치가 gzip 으로 약 2.5MB(인박스 답 1)이고, 해제한 JSON 은 JS 배열로 그 몇 배가 된다.

`‹ ›` 로 며칠을 오가며 스크롤하면 사건 카드가 IntersectionObserver 로 종목마다 격자를 받는다. 그 결과 수백 MB 단위로 힙이 커질 수 있다. SPA 라 라우트를 떠나도 모듈 캐시는 남는다. `urlCache` 도 같은 방식으로 날짜마다 쌓인다(크기는 작다).

**Fix:** 날짜 단위로 최근 N일만 남기는 LRU 를 둔다. 예: 지금 보는 날짜 ± 1일만 남긴다.
```ts
const MAX_GRID_DATES = 2;
function remember(date: LimitupDate, key: string, g: LimitupGridFile) {
  gridCache.set(key, g);
  const dates = [...new Set([...gridCache.keys()].map((k) => k.split('|')[0]!))];
  while (dates.length > MAX_GRID_DATES) {
    const drop = dates.shift()!;
    for (const k of gridCache.keys()) if (k.startsWith(`${drop}|`)) gridCache.delete(k);
    urlCache.delete(drop);
  }
}
```
또는 키 수 상한(예: 60개)으로 오래된 것부터 지운다.

### WR-A05: 하루 격자 행 `<button aria-label=…>` 이 행의 모든 값을 보조기기에서 감춘다

**File:** `webapp/src/components/analytics/limitup-day-grid.tsx:132`, `webapp/src/components/analytics/limitup-day-grid.tsx:80`

**Issue:** 행 전체가 `<button>` 이고 `aria-label="{종목} {코드} — 사건 카드로 이동"` 을 단다. ARIA 에서 button 의 자식은 presentational 이다. 거기에 `aria-label` 이 접근 이름을 덮어쓰므로, 스크린리더는 이 행에서 「종목명 — 사건 카드로 이동」 만 읽는다. 첫 잠김 시각 · 잠김 수 · 최대 잔량 · +60초 매도 · 결과 태그(깨짐/유지) · 진입 매수 창구와 출처 배지는 전혀 전달되지 않는다. `xl:sr-only` 로 일부러 남긴 메타 라벨(80)도 읽히지 않으니 소용이 없다. 사건 카드 쪽 사실 문장에 일부가 있지만, 최대 잔량 · +60초 매도 · 창구 열 같은 격자 고유 값은 다른 곳에 없다. 결과적으로 보고서 머리 표가 보조기기 사용자에게 사실상 비어 있다.

**Fix:** 아래 중 하나를 택한다.
- `aria-label` 을 빼고 버튼 안 텍스트가 이름이 되게 한다.
- 행을 `<li>`(또는 표 행)로 두고, 종목명 칸에만 `<button>`(「사건 카드로 이동」)을 놓는다.
```tsx
<li ...>
  <div className="grid ..." >
    <button type="button" onClick={() => scrollToEventCard(r.isin)} className="... text-left">
      {r.label}{r.code && <span className="mono ...">{r.code}</span>}
      <span className="sr-only"> — 사건 카드로 이동</span>
    </button>
    {/* 결과 태그 · 스파크라인 · Meta 는 버튼 밖 형제로 — 읽힌다 */}
  </div>
</li>
```
행 전체 클릭 영역이 꼭 필요하면 `aria-describedby` 로 메타 묶음 id 를 잇는다.

## Info

### IN-A01: `limitFeatureEventsBatch` 는 만들기만 하고 아무도 읽지 않는다

**File:** `webapp/src/lib/use-relay-socket.ts:475`, `webapp/src/lib/use-relay-socket.ts:998`, `webapp/src/lib/use-relay-socket.ts:2224`

**Issue:** kind 15 프레임마다 seq 와 rows 를 새로 만들어 컨텍스트 값에 싣는다. 하지만 webapp 어디에도 소비처가 없다(grep 결과 0). 피드는 `takeNewRows` 로 직접 비교한다. 죽은 상태이고, 컨텍스트 값 변경 표면만 넓힌다.
**Fix:** 필드와 리듀서 갱신을 지운다. 나중에 필요해지면 그때 되살린다.

### IN-A02: kind 15 의 model_state 원천이 둘인데(`snap_qty` 길이 · `message` 의 `|m=`) 하나만 쓰고 다른 하나는 버린다

**File:** `packages/shared/src/limit-feature.ts:269`, `packages/shared/src/limit-feature.ts:326`

**Issue:** `parseLimitFeatureMessage` 는 `modelState` 를 파싱하지만, `limitFeatureOfStrategyEvent` 는 `row.snapQty.length > 0 ? 1 : 0` 만 쓴다. 파싱 결과는 어디에도 쓰이지 않는다. 두 값이 어긋나도(서버 회귀 신호인데도) 조용히 지나간다.
**Fix:** 둘 중 하나를 정본으로 정하고 주석에 적는다. 두 값이 다르면 `snap_qty` 를 우선하고, 테스트에서 불일치 픽스처를 단언한다. 아니면 파싱 필드를 지운다.

### IN-A03: `timelineStrategyText` 가 `lead` 를 버린다(잠재)

**File:** `packages/shared/src/strategy-event-text.ts:463`

**Issue:** `orderLogLineText` 는 `joinDot([action, lead, body])` 로 lead 를 잇는다. 하지만 타임라인 표면은 `joinDot([prefix, parts.body, parts.cum])` 이라 kind 15 잠김 줄의 「잠김 43초」 가 빠진다. 지금은 타임라인이 주문번호 조인이라 kind 15 가 들어오지 않지만, D-09(「두 표면 본문 동일」)는 이미 어긋나 있다.
**Fix:** `joinDot([prefix, parts.lead ?? null, parts.body, parts.cum])`

### IN-A04: 「상한가 특징」 체크는 열린 창들 사이에 동기화되지 않는다

**File:** `webapp/src/lib/use-order-log-feed.ts:119-123`

**Issue:** 작업대와 `/trading/order-log` 창은 피드 훅 인스턴스가 따로다. 한쪽에서 바꿔도 다른 창은 다시 마운트되기 전까지 옛 값을 보인다. D-07 의 「세 표면이 같은 값을 공유」 는 다시 열 때만 성립한다.
**Fix:** `storage` 이벤트(`TRADING_PANELS_KEY`)를 구독해 상태를 맞춘다. 아니면 문서에 「다시 열 때 반영」 이라고 명시한다.

### IN-A05: KPI 「종가까지 유지」 와 결과 태그가 종가 비교를 서로 다르게 한다 · pandas `first()` 의미와도 다르다

**File:** `webapp/src/lib/limitup-report.ts:170`, `webapp/src/lib/limitup-report.ts:199`

**Issue:** 종가 비교 방식이 두 곳에서 다르다.
- `kpisOf` 는 `close_px === upper_px`(엄격 비교)이고, `resultTagsOf` 는 `Math.trunc` 를 거친 비교다. 소수 가격이 섞이면 KPI 와 태그가 갈린다.
- gh-trade `groupby("isin")[...].first()` 는 **열마다 첫 non-null** 을 고른다. 웹은 첫 행을 고른 뒤 null 이면 세지 않는다. 첫 잠김 행의 `close_px` 가 null 인 드문 경우에 「같은 숫자 원칙」 이 깨진다.

**Fix:** 비교 헬퍼 하나를 두 곳이 같이 쓴다. 열마다 첫 non-null 을 고르는 방식으로 맞춘다.

### IN-A06: 레인 1 「매도벽 소진」 마커를 export 값이 아니라 웹이 판정한다

**File:** `webapp/src/lib/limitup-lanes.ts:332`

**Issue:** `wall.find((p) => p.sec <= a && p.v === 0)` 는 창 안 **첫 0 점**을 소진 시각으로 정한다. 매도벽이 0 이 됐다가 다시 쌓인 뒤 다시 소진되는 경우에는 이른 쪽을 고른다. coarse 10초 해상도에서는 0 을 놓칠 수도 있다. entries 에 `wall_clear_s` 가 이미 있는데 웹이 새 판정값을 만든 셈이다(D-19 「새 판정값 금지」 취지와 어긋난다).
**Fix:** `entry.wall_clear_s` 로 위치를 정한다. 없을 때만 지금 방식으로 폴백하고, 그 차이를 주석에 적는다.

### IN-A07: `lockTagsOf` 가 `broke == null` 인 잠김을 「종가 유지」 로 단정한다

**File:** `webapp/src/lib/limitup-lanes.ts:531`

**Issue:** 결측(PK 밖 전부 NULL 허용)인 `broke` 를 유지로 그리면서 `--down` 색까지 단다. 이는 방향을 지어내지 않는다는 규율(D-10 계열)과 어긋난다.
**Fix:** `l.broke === false` 일 때만 「종가 유지」 로 쓰고, null 은 「잠김 ① · —」(muted)로 둔다.

### IN-A08: relay 가 `feature_schema` 를 검사하지 않는다

**File:** `relay/src/dma/envelope.ts:928`

**Issue:** 특징 사전 v1 의미를 전제로 표기하는데, v2 프레임(필드 의미 변경)이 와도 그대로 통과해 v1 표기로 그려진다.
**Fix:** `featureSchema !== 1` 이면 debug 로그와 카운터를 남기고 드롭한다. 아니면 웹 `limitFeatureCells` 가 「—」 로 수렴하게 한다.

### IN-A09: 격자 URL 재발급 경합 · 지문표 펼침 상태 이월

**File:** `webapp/src/lib/use-limitup-grid.ts:67`, `webapp/src/components/analytics/limitup-fingerprint-table.tsx:29`

**Issue:**
- 서명이 만료된 뒤 여러 카드가 동시에 4xx 를 받으면, 각 카드가 `urlCache.delete(date)` 를 부른다. 그 결과 다른 카드가 막 새로 받은 Promise 까지 지워 grid-urls 를 여러 번 호출한다.
- `LimitupFingerprintTable` 은 날짜 키가 없어서, 날짜를 바꿔도 「더 보기」 펼침(`all`)이 다음 날짜에 이어진다.

**Fix:**
- 삭제는 `if (urlCache.get(date) === stalePromise)` 일 때만 한다.
- 지문표에 `key={loaded.date}` 를 준다.

---

_Reviewed: 2026-10-05T12:24:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# 파트 B

# Phase 28 (Part B): 코드 리뷰 보고서

**검토 시각:** 2026-10-05T23:30:00Z
**깊이:** standard
**검토 파일 수:** 33
**상태:** issues_found

## 요약

마이그레이션 5개(kind 15 가시성 · jsonb 래퍼 · purge, limitup 표 10개, 날짜 원자 commit RPC, 보존 정리 · Storage 버킷, 보고서 RPC), Cloud Run Job `workers/limitup-sync`, server 보고서 라우트, radar-gw 운반기, 배포 · IAM · smoke 스크립트를 읽었다.

잘 된 부분부터 적는다. 권한은 일관되다. 표 10개 모두 RLS를 켜고 정책은 0개이며 PUBLIC · anon · authenticated를 명시해서 REVOKE했다. 함수 8개는 모두 `SECURITY INVOKER`와 `SET search_path = public, pg_temp`를 쓰고 service_role에만 GRANT했다. 동적 SQL은 없다. `dma_strategy_events_for_user`의 재정의 본문은 20261003120000 본문과 비교했고, kind 집합 두 곳 말고는 같다. server는 `req.userId`만 RPC에 넘기고, `d`는 zod로 실재 날짜까지 검사한다. 날짜 하나의 교체는 RPC 한 번, 즉 한 트랜잭션으로 원자적으로 이뤄진다. 운반기는 GCS 객체를 지우지 않고 manifest를 마지막에 올린다. 그래서 「옛 manifest + 새 데이터」를 읽는 창에서도 `files_sig`가 같아 unchanged로 넘어간다.

핵심 결함은 **워커의 실패 격리**다. 날짜 하나가 영구적으로 예외를 내면(행 수 불일치 · 타입 오류 · 8초 statement_timeout 등) 그 run 전체가 멈춘다. 날짜는 오름차순으로 처리되므로 그 뒤의 더 새로운 날짜와 run 끝의 보존 정리(kind 15 purge 포함)가 매일 밤 실행되지 않는다. 이 상태는 최대 90일까지 이어질 수 있다(CR-B01).

두 번째로 큰 문제는 **신선도 감시가 없다는 것**이다. 119 export나 radar-gw 운반이 멈추면 워커는 「새 날짜 없음」으로 종료 0을 내고, 알림은 발화하지 않는다(WR-B01).

## Critical Issues

### CR-B01: 날짜 하나의 영구 예외가 그 뒤 모든 날짜의 적재와 run 끝 보존 정리를 무기한 막는다 (head-of-line blocking)

**파일:** `workers/limitup-sync/src/index.ts:136-236` (throw 지점은 174 · 177 · 188 · 205-215, 그리고 `derive.ts:99,101` · `load.ts:26` · `load.ts:72`)

**문제:**
날짜 루프 안에서 일어나는 skip이 아닌 오류는 모두 `throw`되어 `dispatch` 전체를 끝낸다. 해당하는 오류는 다음과 같다.
- manifest에 6표 파일 항목이 없음 (174)
- 실제 행 수 ≠ manifest rows (177)
- 격자 isin ≠ 파일 이름 (188)
- 격자 date ≠ 디렉터리 날짜 (derive.ts:99)
- ndjson · 격자 JSON.parse 실패
- `limitup_commit_day` 예외 (PK 중복 · `jsonb_populate_record` 타입 변환 실패 · payload date 불일치 · statement_timeout 8초)

모두 sha256 대조를 통과한 뒤에 나는 오류다. 그래서 데이터가 그대로인 한 **매일 밤 같은 자리에서 다시 난다**(재시도로 복구되지 않는다). 그 결과는 이렇다.

1. `dates`가 오름차순(manifest.ts:42)이라 실패하는 날짜보다 **새로운 날짜는 하나도 적재되지 않는다**. 보고서의 핵심 가치인 최신일이 멈춘다.
2. purge는 루프 뒤(222-236)에만 있으므로 `limitup_purge_old` · Storage 정리 · **kind 15 purge(`dma_strategy_events_purge_limit_feature`)가 매일 밤 실행되지 않는다**. `dma_strategy_events`에는 kind 15가 하루 수천~1만 행씩 쌓인다(D-08의 30일 보존이 깨진다).
3. 실패한 날짜가 보존 창(90일)을 벗어날 때까지 이 상태가 이어진다.
4. 운영자가 쓸 탈출구가 없다. 날짜를 건너뛰는 env가 없고, GCS에서 지워도 운반기가 radar-gw 미러에서 다시 올린다.

알림은 매일 「failed execution」으로 발화하지만, 해결하려면 코드 배포가 필요하다. 28-03 SUMMARY에도 commit이 8초에 근접할 위험이 「별도 결정」으로 남아 있어 트리거가 실재한다(WR-B02).

**수정:** 날짜마다 오류를 격리하고 정리는 항상 돌린다.
```ts
// index.ts — 날짜 루프 본문을 try/catch 로 감싸 실패 날짜를 기록하고 다음 날짜로 진행
result.failed = [] as { date: string; error: string }[];
for (const date of dates) {
  try {
    await processDate(date);           // 기존 루프 본문(skip 은 그대로 continue)
  } catch (err) {
    const msg = (err as Error).message;
    result.failed.push({ date, error: msg });
    log.error({ date, err }, "limitup day failed — 다음 날짜로 진행");
    if (sb) await skip(date, "load", { error: msg }).catch((e) => log.error({ date, e }, "record_skip failed"));
  }
}
// purge 는 실패 날짜가 있어도 실행
...
// main: result.alert || result.failed.length > 0 → 종료 1
```
`SkipReason`에 `"load"`를 추가한다(DB의 `limitup_record_skip`은 reason을 자유 텍스트로 받는다). 여기에 더해 운영 탈출구로 `LIMITUP_SKIP_DATES=20261002,...` env를 두는 것을 권한다.

## Warnings

### WR-B01: 신선도 감시가 없다 — 119 export나 radar-gw 운반이 멈추면 아무 알림 없이 「정상」이 된다

**파일:** `ops/alert-limitup-sync-failure.yaml:9-22`, `workers/limitup-sync/src/index.ts:136-162,240-249`, `infra/relay/limitup-pull/limitup-pull.service:8-9`

**문제:** 워커는 GCS에 있는 날짜만 보고, 새 날짜가 없으면 루프가 비어 종료 0을 낸다. 아래 경우가 모두 같은 「성공」 실행으로 끝난다.
- 119 배치가 멈춤
- 119 `authorized_keys`에서 `radar-gw-pull` 줄이 빠짐
- radar-gw 재생성으로 유닛이 사라짐
- gcloud 업로드가 OOM으로 죽음 (`MemoryMax=300M`, IN-B03 참고)

운반기 실패는 journald에만 남고(서비스 주석 8-9행이 「비영 종료로 남는다」고 하지만 그것을 감시하는 정책은 없다), 알림 정책은 Job 실패 실행만 센다. 프로젝트 메모리의 「무로그 fail-safe 금지」 원칙에 정면으로 걸린다. 사용자는 보고서가 며칠째 옛 날짜에 멈춰 있어도 알 수 없다.

**수정:** 워커가 run 끝에 `max(limitup_loads.date WHERE files_sig IS NOT NULL)`를 KST 오늘과 비교한다. 거래일 기준 N일(예: 영업일 2일) 넘게 늦으면 `stale` 경고와 함께 종료 1을 낸다. 공휴일 오탐을 피하려면 `limit_up_events`나 거래일 캘린더 표로 「직전 거래일」을 구한다. 대안으로 Cloud Monitoring 로그 기반 지표에 「`limitup day committed`가 72시간 동안 0건」이라는 부재 조건(`conditionAbsent`)을 추가해도 된다.

### WR-B02: `limitup_commit_day`가 statement_timeout 8초 위험을 안고 있는데, 이를 판단할 commit 소요 시간이 로그에 없다

**파일:** `supabase/migrations/20261006090200_limitup_load_rpcs.sql:51-172`, `workers/limitup-sync/src/load.ts:64-74`, `workers/limitup-sync/src/index.ts:209-216`

**문제:** 28-03 SUMMARY에 따르면 service_role RPC도 authenticator의 `statement_timeout=8s`를 받는다. 가장 큰 날(member_alloc 79,220행)이 로컬에서 2~3초 걸렸다. 「28-08 smoke에서 실제 commit 시간을 로그로 보고 결정」하기로 했지만, 워커의 `limitup day committed` 로그(216행)에도 `commitDay`에도 소요 시간이 없다. 즉 위험이 가까워지는지 알 방법이 없다. 상한가 종목이 많은 날 member_alloc이 몇 배로 늘면 `57014 canceling statement due to statement timeout`이 나고, 이 날짜는 CR-B01 경로로 영구 실패가 된다. RPC 하나가 8표의 DELETE · INSERT를 모두 하므로 줄일 여지도 없다.

**수정:**
```ts
const t0 = Date.now();
await commitDay(sb, {...});
log.info({ date, rows: counts, commitMs: Date.now() - t0, ... }, "limitup day committed");
```
경고 임계(예: `commitMs > 5000` → `log.warn`)를 두고, 근본적으로는 RPC 안에서 `SET LOCAL statement_timeout = '60s'`를 거는 방식을 검토한다. 함수 정의에 `SET statement_timeout = '60s'`를 붙여도 되는데, 이 값은 그 함수 실행에만 적용되고 role 전역 설정은 바꾸지 않는다.

### WR-B03: server 보고서 · 격자 경로가 DB · Storage 오류 원인을 버린다 — 로그에 고정 문구만 남는다

**파일:** `server/src/services/limitup-report.ts:46-47,62-63,76-78`

**문제:** `if (error) throw DbError("상한가 보고서 조회에 실패했습니다.")`는 PostgREST의 `error.code` · `error.message`(예: `57014` timeout, `42883` 함수 없음, 마이그레이션 누락)를 어디에도 남기지 않는다. `errorHandler`도 ApiError의 code와 고정 문구만 warn으로 찍는다(`middleware/error-handler.ts:7-10`). 보고서 RPC가 커지거나(facts · prev locks · fingerprint), 서명 URL 발급이 실패해도 운영자가 원인을 볼 수 없다. 응답에 원문을 싣지 않는 T-15-07은 지켜야 하지만, **로그**에는 남겨야 한다.

**수정:** 응답은 그대로 두고 원인을 cause로 싣는다. 예: `throw Object.assign(DbError("…"), { cause: { code: error.code, message: error.message } })`. errorHandler는 ApiError일 때 `err.cause`를 warn 로그에 포함한다. 같은 패턴이 `dma-orders.ts:120`(`listStrategyEvents`)에도 있다.

### WR-B04: 격자 업로드 후 commit이 실패하면 「새 격자 + 옛 DB 행」이 섞인 보고서가 나간다 — 주석의 「무해」는 사실이 아니다

**파일:** `workers/limitup-sync/src/grid.ts:8-10`, `workers/limitup-sync/src/index.ts:205-215`

**문제:** 순서는 `stage_clear → uploadGrids(upsert) → stageDay → commitDay`다. 이미 적재된 날짜가 재export되어(D+1 보충) `files_sig`가 바뀐 경우, 업로드는 `grid/<D>/<isin>.json.gz`를 **덮어쓴다**. 그런데 commit이 실패하면(행 수 불일치 · timeout 등) DB에는 옛 locks · summaries · facts가 남는다. 보고서는 같은 경로를 서명하므로, 사용자는 새 export의 격자 위에 옛 export의 잠김 구간과 마커를 겹쳐 보게 된다. 주석이 말하는 「앞선 업로드가 남긴 객체는 무해」는 **처음 적재하는 날짜**에만 맞다. CR-B01과 겹치면 이 불일치가 최대 90일까지 고정된다.

**수정:** 격자를 내용 주소 경로로 올린다(예: `grid/<D>/<files_sig 앞 12자>/<isin>.json.gz`). `limitup_grid_summary`나 `limitup_loads`에 그 접두를 저장하고 server가 그 경로를 서명한다. 옛 접두는 다음 성공 run에서 지운다. 이렇게 하면 commit 전까지 새 격자는 보이지 않는다.

### WR-B05: kind 15 purge가 limitup 보존 정리 · Storage 정리 뒤에 직렬로 묶여 있어, 앞 단계 하나가 실패하면 실행되지 않는다

**파일:** `workers/limitup-sync/src/purge.ts:40-71`

**문제:** `limitup_purge_old` → Storage `list`/`remove` → `dma_strategy_events_purge_limit_feature` 순서이고, 앞 단계가 throw하면 kind 15 purge는 실행되지 않는다. 데이터 소유자도 성격도 다르다. kind 15는 relay 관찰자 저널로 들어오는 시세 이벤트이고, 하루 수천~1만 행이라 가장 빨리 커지는 표다. 그런데 Storage API 일시 오류 같은 무관한 실패가 이 정리를 막는다. CR-B01의 경우에는 아예 purge 단계에 도달하지 않는다.

**수정:** 세 단계를 각각 try/catch로 실행하고 오류를 모아 마지막에 한 번 throw한다. kind 15 purge는 날짜 루프보다 먼저(run 시작 시) 실행해도 된다. 적재와 독립적이기 때문이다.
```ts
const errs: string[] = [];
const step = async (name: string, f: () => Promise<void>) => { try { await f(); } catch (e) { errs.push(`${name}: ${(e as Error).message}`); } };
await step("kind15", ...); await step("tables", ...); await step("storage", ...);
if (errs.length) throw new Error(errs.join(" | "));
```

## Info

### IN-B01: relay SA가 「보존 사본」 버킷에 `objectUser`(삭제 포함) 권한을 가진다 — 객체 버전 관리 · 보존 정책이 없다

**파일:** `scripts/setup-limitup-sync-iam.sh:104-130`

**문제:** D-16은 GCS 사본을 재적재 원천으로 보존한다는 결정이다. 하지만 인터넷에 노출된 relay VM의 SA가 이 버킷의 객체를 삭제 · 덮어쓰기할 수 있고, 워커는 manifest sha와 데이터가 서로만 맞으면 그대로 적재한다. 덮어쓰기 때문에 `objectUser`가 필요하다는 근거는 타당하다. 다만 실수나 침해에 대비한 안전장치가 GCS 기본 soft delete(7일)뿐이다.
**수정:** 버킷 생성 단계에 `gcloud storage buckets update gs://gh-radar-limitup-export --versioning`을 추가하고, 비현행 버전 N일 보존 수명 주기를 둔다(현행 객체 삭제 규칙은 계속 두지 않는다).

### IN-B02: 운반기 잠금 파일을 열지 못해도 「다른 회차 실행 중」으로 보고 종료 0을 낸다

**파일:** `infra/relay/limitup-pull/limitup-pull.sh:223-228`

**문제:** `do_pull`은 `do_pull … || exit 1` 문맥에서 호출되므로 함수 안에서는 `set -e`가 꺼진다. 그래서 `exec 9>"$LOCK_FILE"`가 실패해도(권한 · 디스크 가득 참) 계속 진행되고, `flock -n 9`가 잘못된 fd로 실패하면 「건너뜀」 · 종료 0이 된다. 실패가 정상으로 둔갑한다.
**수정:** `exec 9>"$LOCK_FILE" || die "잠금 파일 열기 실패 $LOCK_FILE" 1`로 바꾼다. `mkdir -p`에도 `|| die`를 붙인다.

### IN-B03: radar-gw 미러와 버킷이 끝없이 커지는데, gcloud rsync는 매 회차 전체를 비교한다 (MemoryMax 300M)

**파일:** `infra/relay/limitup-pull/limitup-pull.service:31`, `limitup-pull.sh:242-253`

**문제:** 119는 export를 지우지 않고 GCS도 지우지 않는다. 하루에 파일이 약 37개(6 ndjson + 격자 약 30 + manifest)씩 늘어나고, `gcloud storage rsync --checksums-only`는 매 회차 로컬 전체를 해시하고 버킷 전체를 나열한다. 1년이 지나면 파일이 약 9천 개가 되어 300M 상한에서 OOM이 날 수 있다. 이 실패는 WR-B01 때문에 알림 없이 묻힌다.
**수정:** 미러 rsync에 최근 N일 날짜만 `--include`로 넣거나, 업로드를 `latest − 7일` 이후 날짜 디렉터리에 대해서만 실행한다.

### IN-B04: `dma_strategy_events_purge_limit_feature`에는 `limitup_purge_old`에 있는 하한 가드가 없다

**파일:** `supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql:96-110`

**문제:** `p_keep_days`가 0이거나 음수이면 오늘 이전(또는 미래까지)의 kind 15를 모두 지운다. 지금은 워커의 `positiveInt`가 막아 주지만, 같은 phase의 `limitup_purge_old`(090300:43-45)는 DB에서도 거부한다. 일관성을 위해 맞춘다.
**수정:** plpgsql로 바꾸고 `IF p_keep_days IS NULL OR p_keep_days < 1 THEN RAISE EXCEPTION … END IF;`를 넣는다.

### IN-B05: 기본 주문로그(`lf=0`)도 안쪽 SETOF 함수에서 kind 15를 전부 만들고 나서 버린다

**파일:** `supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql:84-88`

**문제:** `dma_strategy_events_for_user`에 `SET search_path`가 붙어 있어 인라인되지 않는다. 그래서 래퍼의 `WHERE … <> 15`가 안쪽으로 내려가지 못하고, 매 요청마다 kind 15 수천~1만 행에 대해 `to_jsonb` + `stocks` 조인을 계산한 뒤 버린다. 기본 경로가 kind 15 양에 비례해 느려진다. `lf=1`일 때는 응답이 수 MB가 될 수 있다.
**수정:** SETOF 함수에 `p_include_limit_feature` 인자를 넣은 오버로드(가시성 본문은 하나로 유지)를 만들거나, 래퍼 대신 kind 조건을 안쪽 WHERE에 직접 넣는다.

### IN-B06: 성공 commit이 `last_skip_at`을 지우지 않는다 · `config.logLevel`을 쓰는 곳이 없다

**파일:** `supabase/migrations/20261006090200_limitup_load_rpcs.sql:156-166`, `workers/limitup-sync/src/config.ts:17,49`, `workers/limitup-sync/src/logger.ts:4`

**문제:** commit은 `skip_streak = 0` · `last_skip_reason = NULL`로 되돌리지만 `last_skip_at`은 남긴다(index.ts:156의 streak 리셋도 마찬가지). 로거는 `process.env.LOG_LEVEL`을 직접 읽어서 `Config.logLevel`은 쓰이지 않는다.
**수정:** upsert의 SET 절에 `last_skip_at = NULL`을 넣는다. `logLevel`은 로거 생성에 쓰거나 Config에서 지운다.

### IN-B07: manifest의 격자 이름이 `GRID_NAME_RE`와 맞지 않으면 아무 말 없이 무시되고, smoke 실행도 skip_streak를 올린다

**파일:** `workers/limitup-sync/src/index.ts:184-190`, `workers/limitup-sync/src/grid.ts:20`, `scripts/smoke-limitup-sync.sh:130-135`

**문제:** `grid/`로 시작하지만 isin에 소문자 등이 들어간 항목은 sha 대조는 통과하고 파생 · 업로드 대상에서는 빠진다. 로그도 남지 않는다. 또 smoke의 INV-1은 Job을 실제로 실행하므로, 깨진 날짜가 있을 때 smoke를 세 번 돌리면 그 자리에서 「3연속 skip」 알림이 난다.
**수정:** `f.name.startsWith("grid/") && !hit`이면 warn을 남기거나 skip(`"manifest"`) 처리한다. smoke 문서에 「INV-1은 streak를 올린다」를 적거나, smoke 전용 `--no-record-skip` 플래그를 둔다.

---

_검토 시각: 2026-10-05T23:30:00Z_
_검토자: Claude (gsd-code-reviewer)_
_깊이: standard_
