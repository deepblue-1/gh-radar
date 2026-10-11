---
phase: 25-order-log-progress
reviewed: 2026-09-29T15:00:41Z
review_commit: 6289e430
depth: standard
files_reviewed: 100
files_reviewed_list:
  - docs/relay-operations.md
  - packages/shared/src/__fixtures__/strategy-day.ts
  - packages/shared/src/__tests__/order-timeline.test.ts
  - packages/shared/src/__tests__/strategy-event-labels.test.ts
  - packages/shared/src/__tests__/strategy-event-text.test.ts
  - packages/shared/src/index.ts
  - packages/shared/src/order-timeline.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/strategy-event-labels.ts
  - packages/shared/src/strategy-event-text.ts
  - packages/shared/src/strategy-event.ts
  - relay/src/dma/__tests__/codec.test.ts
  - relay/src/dma/__tests__/envelope.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/journal/observer.ts
  - relay/src/journal/status.ts
  - relay/src/journal/strategy-stream.ts
  - relay/src/journal/types.ts
  - relay/src/journal/writer.ts
  - relay/src/order/order-api.ts
  - relay/src/ws/fanout.ts
  - relay/tests/fanout.test.ts
  - relay/tests/helpers/fake-gateway.ts
  - relay/tests/helpers/frames.ts
  - relay/tests/helpers/supabase-stub.ts
  - relay/tests/hub.test.ts
  - relay/tests/journal-boot.test.ts
  - relay/tests/journal-codec.test.ts
  - relay/tests/journal-gateway.test.ts
  - relay/tests/journal-observer.test.ts
  - relay/tests/journal-push.test.ts
  - relay/tests/journal-status.test.ts
  - relay/tests/journal-writer.test.ts
  - relay/tests/order-api.test.ts
  - server/src/app.ts
  - server/src/routes/orders.ts
  - server/src/routes/strategy-events.ts
  - server/src/schemas/orders.ts
  - server/src/services/dma-orders.ts
  - server/tests/routes/orders.test.ts
  - server/tests/routes/strategy-events.test.ts
  - supabase/migrations/20260929180000_dma_strategy_events.sql
  - supabase/migrations/20260929180100_dma_strategy_apply.sql
  - supabase/migrations/20260929180200_dma_strategy_read_rpcs.sql
  - supabase/tests/dma_strategy_apply.test.sql
  - supabase/tests/dma_strategy_read.test.sql
  - webapp/e2e/fixtures/relay.ts
  - webapp/e2e/specs/a11y.spec.ts
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/order-log.spec.ts
  - webapp/e2e/specs/unfilled-progress.spec.ts
  - webapp/src/app/trading/order-log/page.tsx
  - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
  - webapp/src/components/orderbook/__tests__/unfilled-progress.test.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/orderbook/unfilled-progress.tsx
  - webapp/src/components/trading/__tests__/card-tabs.test.tsx
  - webapp/src/components/trading/__tests__/order-timeline.test.tsx
  - webapp/src/components/trading/__tests__/shared-panels.test.tsx
  - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
  - webapp/src/components/trading/card/card-tabs.tsx
  - webapp/src/components/trading/card/strategy-card.tsx
  - webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx
  - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
  - webapp/src/components/trading/order-log/__tests__/order-log-panel.test.tsx
  - webapp/src/components/trading/order-log/__tests__/order-log-window.test.tsx
  - webapp/src/components/trading/order-log/order-log-feed-context.tsx
  - webapp/src/components/trading/order-log/order-log-filters.tsx
  - webapp/src/components/trading/order-log/order-log-list.tsx
  - webapp/src/components/trading/order-log/order-log-panel.tsx
  - webapp/src/components/trading/order-log/order-log-window.tsx
  - webapp/src/components/trading/order-timeline.tsx
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/src/components/trading/workbench/shared-panels.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/lib/__tests__/order-log-feed.test.ts
  - webapp/src/lib/__tests__/order-notices.test.ts
  - webapp/src/lib/__tests__/order-timeline.test.ts
  - webapp/src/lib/__tests__/orders-api.test.ts
  - webapp/src/lib/__tests__/queue-progress.test.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/__tests__/trading-alerts.test.ts
  - webapp/src/lib/__tests__/use-order-log-feed.test.tsx
  - webapp/src/lib/__tests__/use-stick-to-bottom.test.tsx
  - webapp/src/lib/order-log-feed.ts
  - webapp/src/lib/order-notices.ts
  - webapp/src/lib/order-timeline.ts
  - webapp/src/lib/orders-api.ts
  - webapp/src/lib/queue-progress.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/strategy-events-api.ts
  - webapp/src/lib/trading-layout.ts
  - webapp/src/lib/use-order-log-feed.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/use-stick-to-bottom.ts
  - webapp/src/test-fixtures/order-timeline.ts
  - webapp/src/test-fixtures/strategy-day.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 25: 코드 리뷰 보고서

**리뷰 시각:** 2026-09-29T15:00:41Z
**깊이:** standard
**리뷰 대상 커밋:** 6289e430 (배포본). 지정된 7개 파일은 `git show 6289e430:<path>` 로 읽었다.
**리뷰 파일 수:** 100
**상태:** issues_found

## 요약

Phase 25 가 추가한 전략 이벤트 파이프라인 전 구간을 읽었다. 대상은 관찰자 80 두 번째 스트림 파싱, `JournalWriter` 스트림 서술자 일반화, `dma_strategy_apply`/조회 RPC, `journal.events`/`unf.progress` 팬아웃, server 조회 라우트 2개, 웹 주문로그 피드·목록·창 분리, 오늘 주문 펼침 타임라인, 잔량진행률 보조행이다.

보안 경계는 대체로 탄탄하다.
- 주문자(`dma_user_id`) 제거가 적용 RPC, 조회 RPC, 공개 매퍼, hub 캐시 네 곳에서 모두 확인된다.
- 시세 공개 판정은 kind 로만 한다. RPC 와 relay 양쪽에서 같다.
- 83 계좌 필터는 fail-closed 다.
- `:id` 는 uuid 로, `orderNos` 는 형식과 개수로 검증한다.
- 서비스롤 전용 REVOKE 3줄 구성도 지켜졌다.

180200 조회 RPC 의 자격증명 조인은 190000(quick-260929-sas)이 재정의했으므로 라이브 동작으로 지적하지 않았다.

Critical 결함은 찾지 못했다. 주요 우려는 다섯 가지다.
1. 전략 스트림 장애가 공유 관찰자 소켓을 통해 **주문 저널**까지 멈추게 하는 결합
2. relay hub 세션 교체 뒤 잔량진행률 「삭제 신호」가 억제돼 브라우저에 옛 진행률이 남는 경로
3. `hidden` 으로 가려진 목록 스크롤러에서 맨 아래 고정이 깨지는 문제
4. `noopener` 때문에 창 분리 재사용(R4)이 성립하지 않는 문제
5. 첫 ready 를 건너뛰는 규칙이 만드는 복원·푸시 사이 누락 구간

## 경고 (Warnings)

### WR-01: 전략 기록기 장애가 공유 관찰자 소켓을 통해 주문 저널 적재를 멈춘다

**파일:** `relay/src/journal/observer.ts:386-397`, `relay/src/journal/writer.ts:405-411`, `supabase/migrations/20260929180100_dma_strategy_apply.sql:74-76`

**문제:**
전략 기록기는 주문 기록기와 같은 관찰자 소켓을 쓴다. 전략 적용이 계속 실패하는 경우는 세 가지다.
- 원격 마이그레이션 누락이나 DB 오류
- 포이즌 이벤트. 예를 들어 `trade_date` 가 `""` 이면 `(ev->>'trade_date')::date` 캐스트가 실패한다. `seq = 0` 이면 `CHECK (seq > 0)` 위반이다. 적용 RPC 는 이런 경우 배치 전체를 거부하고, 기록기는 같은 배치를 영원히 재시도한다.
- 파서(`readStrategyEvent`)는 `trade_date`·`gw_time_ms` 형식을 검사하지 않고 `?? ""` 로 흘린다.

이렇게 실패가 이어지면 전략 큐가 `JOURNAL_MAX_QUEUE`(5,000)에 닿는다. 그 뒤로는 전략 이벤트가 실린 모든 프레임에서 `strategyWriter.push` 가 `overflow` 를 내고, `#dropTransport("전략 큐 상한")` 이 소켓을 끊는다. 주문 레코드는 끊기기 전에 push 되므로 프레임 하나씩은 전진한다. 하지만 재로그인이 반복되면서 관찰자 상태가 `live` 에 머물지 못하고, 결국 `journal.state` delayed 를 거쳐 장중 `/healthz` 503 에 이른다.

`status.ts` 는 전략 `dbError` 를 503 에서 일부러 뺐다(Pitfall 4). 그런데 이 경로에서는 결국 주문 저널 장애로 번져서 설계 의도가 무너진다. 운영 문서(`docs/relay-operations.md`)도 「주문 기록도 멈춘다」 고 인정하지만, 전략 쪽 원인을 알리는 신호는 표시용 필드 `journal.strategy.dbError` 뿐이다.

**수정:**
전략 스트림의 역압을 주문 스트림과 분리한다. 전략 큐 상한에서는 소켓을 끊지 말고 전략 수신만 멈춘다. `pendingStrategy` 를 유지한 채 이후 프레임의 전략분을 버리고, 큐가 비면 다음 재로그인 때 `strategySinceSeq` 로 이어받는다. 필수 키는 파서 경계에서 검증해 계약 위반을 즉시 드러낸다.
```ts
// observer.ts #onBatch — 전략 overflow 는 주문 스트림을 끊지 않는다
if (strategyResult === "overflow") {
  this.#strategyPaused = true;   // 다음 재로그인까지 전략분만 버린다(since 는 전진하지 않음)
  logger.error({ gateway: this.#deps.gateway }, "[JOURNAL] 전략 큐 상한 — 전략 수신만 일시 중지");
} else if (strategyResult === "gap") { ... }
```
최소한 전략 `dbError` 가 지속되면(예: N분) 별도 알림을 두어, 주문 저널 503 이 나기 전에 원인을 드러낸다.

### WR-02: hub 세션 교체 뒤 잔량진행률 삭제 신호가 억제되어 브라우저에 옛 진행률이 남는다

**파일:** `relay/src/hub/subscription-hub.ts:1257-1262` (`#onQueueProgress`), `relay/src/hub/subscription-hub.ts:1768-1771` (`#clearCaches`), `relay/src/hub/subscription-hub.ts:512-518` (`attach`)

**문제:**
`attach` 는 회선 실패 뒤 세션이 재생성되면 `#clearCaches(userId)` 로 `#queueProgress` 를 비운다. 이때 브라우저 연결은 유지되고, 브라우저에 알리는 프레임은 없다. `unf.progress` snap 은 브라우저 인증 직후에만 나간다.

그 뒤 새 세션에서 83 이 「그 (isin, exchange) 대기 주문 전부 사라짐」(빈 items, G1 ⓕ — 첫 체결이나 취소 뒤 1회만 온다)을 보내면 `prev === undefined && items.length === 0` 조건에 걸려 **팬아웃하지 않는다**. 브라우저 `queueProgress` 는 그 키를 계속 들고 있게 된다.

결과가 가장 잘 드러나는 경우는 부분 체결로 미체결 행이 남은 주문이다. account-panel 조인은 계속 성립하므로 「곧 내 차례 · 99%」 같은 옛 진행률이 무기한 표시된다(D-13 은 「마지막 값 유지」 지만 여기서는 서버가 이미 삭제를 알린 값이다). 빈→빈 억제 최적화는 hub 캐시가 브라우저 상태를 그대로 비춘다고 가정하는데, `#clearCaches` 가 그 가정을 깬다.

**수정:** 셋 중 하나를 쓴다.
- (a) `#clearCaches` 에서 비우기 직전에 그 사용자 키마다 빈 `unf.progress`(snap:false, items:[])를 팬아웃한다.
- (b) 새 세션 `ready` 에서 `{ t: "unf.progress", snap: true, entries: [] }` 를 한 번 팬아웃해 브라우저 Map 을 초기화한다.
- (c) 억제 조건을 「이 세션에서 한 번도 비어 있지 않은 적 없는 키」로 좁힌다.
```ts
// #clearCaches — 브라우저 사본도 같이 비운다
for (const key of [...this.#queueProgress.keys()]) {
  if (!key.startsWith(prefix)) continue;
  const parsed = this.#splitKey(key);
  this.#queueProgress.delete(key);
  if (parsed) this.#fanout(userId, { t: "unf.progress", snap: false, i: parsed.isin, x: parsed.exchange, items: [] });
}
```

### WR-03: `hidden` 으로 가려진 동안 줄이 늘면 맨 아래 고정이 깨진다 (카드 접힘·카드 탭 접힘·공용 패널 폰 접힘)

**파일:** `webapp/src/lib/use-stick-to-bottom.ts:80-91`, `webapp/src/components/trading/card/card-tabs.tsx:310-314`, `webapp/src/components/trading/card/strategy-card.tsx:991`, `webapp/src/components/trading/workbench/shared-panels.tsx:356-360`

**문제:**
카드 본문(`hidden={!open}`), 카드 탭 본문(`hidden={folded}`), 폰 밴드 공용 패널(`hidden @min-[700px]/wb:block`)은 `display:none` 으로 가려진다. 이때 목록 컴포넌트는 마운트된 채 남는다. 가려진 동안 푸시로 `itemCount` 가 늘면 layout effect 가 다음처럼 동작한다.
- `scrollHeight`, `clientHeight`, `lastHeightRef` 가 모두 0 이다.
- 그래서 `wasAtBottom` 이 항상 참이 된다.
- `el.scrollTop = el.scrollHeight(0)` 은 아무 효과가 없다.

다시 보이게 되면 목록은 스크롤 0(가장 오래된 줄) 이거나 이전 위치에 머문다. 「자동 따라감」(card-tabs ⑧ · UI-SPEC ②-2)과 달리 새 줄이 화면 밖에 있다. card 변형은 핀도 없어서(`showPin=false`) 새 줄이 왔다는 표시조차 없다. 배지(`useUnseenOrderLogCount`)는 N 을 셌다가 보이는 순간 0 으로 돌아가므로, 사용자는 아래로 스크롤해야 한다는 사실을 알 수 없다.

**수정:** 가시성이 돌아오는 시점에 맨 아래로 맞춘다. 다음 둘 중 하나를 쓴다.
- `useStickToBottom` 이 ResizeObserver 로 `clientHeight` 가 0 에서 >0 으로 바뀌는 순간을 감지하고, 직전에 맨 아래였거나 가려진 동안 증가가 있었으면 `scrollTop = scrollHeight` 를 적용한다.
- 호출자가 `resetKey` 에 가시성(`cardOpen`·`folded`)을 섞는다.
```ts
useEffect(() => {
  const el = ref.current; if (!el) return;
  let wasHidden = el.clientHeight === 0;
  const ro = new ResizeObserver(() => {
    const hidden = el.clientHeight === 0;
    if (wasHidden && !hidden && atBottomRef.current) el.scrollTop = el.scrollHeight;
    wasHidden = hidden;
  });
  ro.observe(el); return () => ro.disconnect();
}, []);
```
그리고 가려진 동안의 증가는 `wasAtBottom` 판정을 건너뛰고 「맨 아래였다」 상태를 보존한다(`clientHeight === 0` 이면 return).

### WR-04: `noopener` 때문에 창 분리 재사용(R4)이 성립하지 않는다 — 누를 때마다 새 창과 새 wss 가 열린다

**파일:** `webapp/src/lib/order-log-feed.ts:223-226`, `webapp/src/components/trading/order-log/order-log-panel.tsx:82-86`

**문제:**
`ORDER_LOG_WINDOW_NAME` 주석은 「다시 누르면 같은 창을 재사용한다(창이 쌓이지 않는다 · R4)」 라고 약속한다. 그런데 features 에 `noopener` 가 들어 있다. HTML 표준의 「rules for choosing a navigable」 은 noopener 가 참이면 이름으로 기존 창을 찾지 않고 늘 새 창을 만든다. noopener 창은 새 browsing context group 에 속하므로 opener 쪽에서 이름으로 접근할 수도 없다. 그래서 클릭할 때마다 새 창이 쌓인다.

각 창은 루트 `RelayProvider` 로 자기 wss 를 열고 `GET /api/strategy-events` 를 1회 호출한다. 창 수에 비례해 relay 연결과 server 왕복이 늘어난다. 이 동작을 검증하는 테스트는 `window.open` 모킹 단위 테스트(`order-log-panel.test.tsx:92`) 뿐이다.

**수정:** 재사용과 opener 차단 중 하나를 고른다. 재사용이 요구사항이면 `noopener` 를 빼고, 열린 창에서 `window.opener = null` 로 끊는다. 같은 출처라 보안 이득이 작다.
```ts
export const ORDER_LOG_WINDOW_FEATURES = 'width=960,height=720';
// popout
const w = window.open(url, ORDER_LOG_WINDOW_NAME, ORDER_LOG_WINDOW_FEATURES);
if (w) { try { w.opener = null; } catch {} w.focus(); }
```
실제 브라우저(Playwright `context.waitForEvent('page')` 2회)로 재사용을 단언하는 e2e 를 추가한다.

### WR-05: 첫 ready 건너뛰기 규칙이 「복원 응답 ~ relay 인증」 사이 이벤트를 영구 누락시킨다 (특히 창 분리)

**파일:** `webapp/src/lib/use-order-log-feed.ts:100-112`

**문제:**
마운트 조회(`load`)와 relay 인증은 병렬로 진행된다. `wasReadyRef` 가 `false` 로 시작하면(창 분리 페이지처럼 새 wss 를 여는 경우) **첫** ready 는 「마운트 조회와 같은 시점」 으로 보고 재조회를 건너뛴다.

REST 응답이 relay 인증보다 먼저 끝나면, 그 사이 `dma_strategy_apply` 로 적재된 이벤트는 둘 다에서 빠진다.
- REST 결과에는 없다. REST 가 먼저 읽었다.
- `journal.events` 로도 오지 않는다. relay 는 삽입 시점에 연결된 사용자에게만 밀고 재생하지 않는다.

장중 시세 이벤트는 잦아서 창을 여는 순간마다 누락이 생길 수 있다. 그 줄은 다음 ready 재진입이나 날짜 이동 전까지 보이지 않는다. 주석 ②는 이 규칙을 today-orders-card ⑦ 에서 가져왔다. 오늘 주문은 `journalState` 전이 재조회가 따로 있지만, 주문로그에는 그런 보완 경로가 없다.

**수정:** 첫 ready 가 마운트 조회 **완료 뒤에** 오면 한 번 더 조회한다(호출 1회 추가, O(1)). 또는 첫 ready 시점에 진행 중 요청이 없으면 재조회한다.
```ts
const loadDoneAtRef = useRef<number | null>(null); // load 성공 시 Date.now()
...
if (!wasReadyRef.current) {
  wasReadyRef.current = true;
  if (isToday && loadDoneAtRef.current !== null) void load(); // 복원이 먼저 끝났다 → 갭 메우기
  return;
}
```

## 정보 (Info)

### IN-01: `dma_strategy_apply` 가 만든 커서 행의 주문 칸 `last_seq = 0` 은 「커서 없음」과 같지 않다

**파일:** `supabase/migrations/20260929180100_dma_strategy_apply.sql:15-17, 137-139`, `relay/src/journal/writer.ts:319-322`

**문제:** 주석은 「주문 기록기는 last_seq 0 을 「since 0」 으로 읽어 결과가 같다」 고 한다. 하지만 `readCursor` 는 행이 있고 epoch 가 채워져 있으면 `#lastReceivedSeq = 0`(null 아님)으로 둔다. 그러면 주문 첫 레코드가 seq 1 이 아닐 때 갭 판정이 걸린다. 커서가 정말 없을 때(null)는 첫 레코드를 판정 없이 받는다. 전략 이벤트가 주문 저널보다 먼저 오는 신규 게이트웨이에서, 게이트웨이 보관분이 seq 1 부터가 아니고 `resync` 도 오지 않으면 갭 재접속이 반복될 수 있다.

**수정:** 전략 적용이 행을 만들 때 `journal_epoch` 를 `''` 로 둔다(`readCursor` 의 「빈 epoch = 커서 없음」 분기를 타게). 스키마상 불가능하면 주석을 실제 의미에 맞게 고친다.

### IN-02: `#onSuccess` 의 `toOut` 매핑이 try 밖이라 예외 시 unhandled rejection 이 된다

**파일:** `relay/src/journal/writer.ts:567` (`void this.#runBatch()` 경로)

**문제:** `result.rows.map(toOut)` 이 throw 하면 `#runBatch` 의 프로미스가 거부된다. 원인은 예컨대 RPC 가 `snap_qty: null` 을 돌려주는 경우다. 이 프로미스는 `void` 로 버려지므로 Node 기본 설정에서 프로세스가 종료되고, `#kick()` 도 건너뛴다. DB 칸이 NOT NULL 이라 지금 발생할 가능성은 낮지만, 방어가 `emit` 에만 있고 매핑에는 없다.

**수정:** 매핑과 emit 을 같은 try 로 감싸고 행 단위로 실패를 로그한다.

### IN-03: 접수 지연이 1ms 미만이면 「접수 +0ms」 로 그려진다

**파일:** `packages/shared/src/strategy-event-text.ts:235-237`

**문제:** 주석은 「+0ms 로 그리면 측정값처럼 읽혀 생략한다」 고 하는데, 0 < µs < 500 이면 `Math.round` 결과 0 이라 「접수 +0ms」 가 나온다. 이때는 측정값인데 값이 0 으로 뭉개진다.

**수정:** 1ms 미만은 `<1ms` 로 표기하거나 소수 1자리(`(us/1000).toFixed(1)`)로 그린다.

### IN-04: 종목 필터 값이 옵션 목록에 없으면 select 가 빈칸으로 보이는데 필터는 계속 걸린다

**파일:** `webapp/src/components/trading/order-log/order-log-filters.tsx:75-89`, `webapp/src/components/trading/order-log/order-log-window.tsx:117-124`

**문제:** 창 분리 URL 의 `stock=ISIN` 이 그날 범위에 없거나, 날짜를 옮겨 그 종목이 없어지면 `stockOptions` 에 그 값이 없다. 이 경우 controlled `<select>` 는 선택 없음(빈칸)으로 보이는데 칩은 `data-on` 이고 목록은 「조건에 맞는 로그가 없어요」 다. 무엇이 걸렸는지 보이지 않는다. 공용 패널에서 상태줄 계좌를 바꿀 때도 같다.

**수정:** 현재 선택값이 옵션에 없으면 옵션 끝에 `{value: filters.stock, label: nameOf 폴백 또는 ISIN}` 을 덧붙인다.

### IN-05: 창 분리 페이지에는 `DmaGate` 가 없다

**파일:** `webapp/src/app/trading/order-log/page.tsx:35-41`

**문제:** 작업대는 `<DmaGate>` 뒤에서만 피드를 조회하지만(trading-workbench 주석), 창 분리 라우트는 로그인만 되어 있으면 그대로 `GET /api/strategy-events` 를 부른다. 서버 RPC 가 가시성을 판정하므로 데이터 노출은 없다. 다만 DMA 권한이 없는 사용자에게 게이트 안내 대신 「오늘 주문로그가 없어요」 가 보인다.

**수정:** 창 본문을 같은 게이트로 감싸거나 게이트 판정 훅을 공유한다.

### IN-06: 주문로그가 `useStockNames` 의 기존 경주를 자주 건드린다

**파일:** `webapp/src/components/trading/order-log/order-log-panel.tsx:49-63` (소비), `webapp/src/lib/stock-names.ts:57-80` (범위 밖 기존 코드)

**문제:** 시세 이벤트로 새 ISIN 이 들어올 때마다 `unnamed` 키가 바뀐다. `useStockNames` 는 키가 바뀌면 진행 중 조회의 `alive=false` 로 `setVersion` 을 건너뛰고, 새 effect 는 `inflight` 인 ISIN 을 제외해 조회하지 않는다. 그래서 마지막 effect 에 누락 ISIN 이 없으면 이름이 캐시에 들어와도 재렌더가 일어나지 않고, 다음 변화 전까지 코드로 표시된다. 주문로그가 이 경주를 가장 자주 일으키는 소비처가 되었다.

**수정:** `stock-names.ts` 에서 조회 완료 시 모듈 수준 구독자에게 알린다. 예를 들어 전역 version 과 `useSyncExternalStore` 를 쓴다. `alive` 로 알림을 버리지 않는다.

---

_리뷰 시각: 2026-09-29T15:00:41Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
