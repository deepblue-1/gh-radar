---
phase: 26-shared-quote-feed
reviewed: 2026-09-30T23:05:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - relay/src/dma/envelope.ts
  - relay/src/journal/types.ts
  - relay/src/quote/feed.ts
  - relay/src/quote/status.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/hub/subscribe-pacer.ts
  - relay/src/ws/fanout.ts
  - relay/src/config.ts
  - relay/src/logger.ts
  - relay/src/index.ts
  - relay/src/order/order-api.ts
  - packages/shared/src/relay.ts
  - packages/shared/src/index.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/quote-state.ts
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/e2e/fixtures/relay.ts
  - infra/relay/README.md
  - relay/tests/helpers/fake-gateway.ts
  - relay/tests/helpers/frames.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 26: 코드 리뷰 보고서

**Reviewed:** 2026-09-30T23:05:00Z (KST 2026-10-01 08:05)
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Phase 26 변경분(775e7f00..HEAD 중 Phase 26 커밋 — 다른 세션의 카드 · 테마 · 모바일 커밋은 범위 밖)을 standard 깊이로 읽었다.
중점은 공유 quote 연결(관찰자 role 1) · 전역 참조계수 · linger 15초 · PRICE 게이트 · 구독 한도(2000 / 200) ·
재구독 페이서(창 32 · 3초) · 83 넛지 · QuoteStatus / healthz 503 · quote.state 프레임 · 비밀 로그 누출이다.
relay 단위 테스트 7개 파일(hub · pacer · quote-feed · quote-status · fanout · order-api · config-quote, 253건)은 로컬에서 전부 통과했다.

**확인한 것(결함 없음):**

- 참조계수 하한 — `unsubscribe` 는 `refs[level] <= 0` 에서 멈추고, `#releaseUserRef` 도 `held <= 0` 에서 멈춘다. 음수로 내려가는 경로가 없다.
- linger 타이머 — 복귀(`#clearLinger`) · 만료(정본 대조 `this.#lingering.get(key) !== linger`) · 재접속 정리(`resubscribeAll` → `#releaseKey(…, false)`) · `closeAll` 네 곳에서 모두 풀린다. 새는 경로를 찾지 못했다.
- PRICE 게이트 타이머 — `#dropPriceGate` 가 price 이탈 · 강등 · `#releaseKey` · 58 스냅샷 · `closeAll` 에서 지운다. 키당 최대 1개다.
- 페이서 in-flight — 해제(`control("unsubscribe")`), 응답(58/69), 기한 만료(다음 `subscribe` 또는 대기열·추적이 있을 때 건 타이머), `reset`(quote ready · feed 교체 · closeAll)으로 풀린다. quote 연결이 끊긴 동안 쌓인 대기열은 다음 ready 의 `reset` 이 먼저 비우므로, 해제된 키가 뒤늦게 다시 구독되지 않는다.
- 사용자 간 누출 — 공개 시세는 `HubMarketEvent`(`RelayQuote | RelayTape` 로 좁힘) → `#keyConns` 경로 하나로만 나간다. `sub.limit` 은 거부된 그 소켓에만, `quote.state` 는 `#users`(자격증명 있는 연결)에만 간다. quote 연결로 온 83 · 76 · 78 은 무시된다. 계좌 데이터가 전역 캐시로 새는 경로는 보이지 않았다.
- 비밀 — `QuoteFeed` 는 비밀을 `buildObserverLoginReq` 에만 넘기고, 에러 문구와 로그 인자 어디에도 싣지 않는다. logger redact 에 `*.secret` · `*.dmaQuoteObserverSecret` · `*.DMA_QUOTE_OBSERVER_SECRET` 가 들어 있다. 부팅 로그는 enabled/disabled 만 남긴다.
- 정지 순서 — `#halt` 는 stopReconnect → destroy → 상태 설정 순서다. `DmaClient.destroy()` 는 down 을 내지 않으므로 거부 뒤에 재접속이 다시 예약되지 않는다.

**핵심 우려:** 공유 연결이 단일 장애점이 됐는데, **수신만 멈추는 정체(half-open · 터널 정지)는 배지로도 healthz 로도 잡히지 않는다(WR-01).**
그 밖에는 이미 연 종목을 새 소켓이 구독할 때 체결 테이프가 중복되는 문제(WR-02), 일시적인 관찰자 거부 한 번에 시세 전체가 멈추는 정지 정책(WR-03),
웹의 구독 한도 · 시세 상태 표시가 실제와 어긋날 수 있는 문제(WR-04 · WR-05)가 있다. 오늘 밤 배포를 막는 BLOCKER 급 결함은 찾지 못했다.

## Warnings

### WR-01: 공유 quote 연결의 「수신 정체」(half-open TCP · 터널 정지)를 배지도 healthz 도 잡지 못한다

**File:** `relay/src/quote/status.ts:66-72`, `relay/src/quote/feed.ts:238`, `relay/src/order/order-api.ts:347-350`

**Issue:**
`quoteAlerting` 은 `state` 와 `disconnectedSec` 만 본다. `QuoteFeed` 는 TCP `down` 이 와야만 `ready` 를 벗어난다.
`DmaClient` 에는 수신 유휴 감시가 없다. 30초 LivePing 은 송신만 하고, 송신 정체 감지(`SEND_TIMEOUT_MS`)는 커널 송신 버퍼가 찰 때만 발동한다.
그래서 VPN 터널이 조용히 멈추면(README §터널 정지 판정 절차 — wg-probe 가 실측한 실제 장애 유형이다) 다음 상태가 TCP 재전송 타임아웃(수 분~15분)까지 이어진다.

- 전 사용자의 시세가 멈춘다.
- 그런데 `state` 는 `"ready"` 이고, 배지는 초록 「● 시세」, `/healthz` 는 200 이다.

`lastFrameAgeSec` 는 본문에만 실리고 판정에는 들어가지 않는다. README 는 「수 초 이상이면 시세 멈춤 의심」 이라고 사람에게 맡긴다.
D-01(「시세가 끊기면 시세 배지만 적색」)과 D-02(단일 장애점이라 503 축)의 목적이 이 가장 흔한 장애 유형에서 성립하지 않는다.
사용자 세션별 시세 시절에도 같은 사각이 있었지만, 이제는 연결 하나가 전원을 지므로 영향 범위가 N배다.

**Fix:** 장중 창 안에서 구독 키가 있는데도 프레임이 끊긴 상태를 「끊김」 과 같게 다룬다. 두 곳을 고친다.
① 판정: `quoteAlerting` 과 `QuoteStatus` 의 down 판정에 정체 조건을 넣는다.
② 복구: `QuoteFeed` 에 수신 워치독을 두어 `dropTransport` 로 재접속을 유도한다.

```ts
// quote/status.ts
export const QUOTE_STALL_AFTER_SEC = 60; // 장중 · keyCount>0 에서 이만큼 무수신이면 정체
export function quoteAlerting(health: QuoteHealth, now: Date): boolean {
  if (health.state === "rejected" || health.state === "role_mismatch") return true;
  if (!inTradingWindow(now)) return false;
  if (health.state === "ready") {
    return health.keyCount > 0 && health.lastFrameAgeSec !== null
      && health.lastFrameAgeSec >= QUOTE_STALL_AFTER_SEC;
  }
  if (health.state === "disabled") return false;
  return (health.disconnectedSec ?? 0) * 1000 >= QUOTE_ALERT_AFTER_MS;
}
// quote/feed.ts — ready 동안 주기 점검(unref 타이머):
//   inTradingWindow(now) && hubKeyCount() > 0 && now - lastFrameAtMs > STALL_MS
//   → this.#dropTransport("quote 수신 정체")
```

임계값은 장중에 가장 조용한 구독 조합(예: 상한가에 묶인 종목만 구독한 경우)에서 나오는 최소 프레임 간격을 실측한 뒤 정한다. 오탐이 나면 재접속만 반복되므로 보수적으로 잡는다.

### WR-02: 이미 흐르는 종목을 새 FULL 소켓이 구독하면 체결 테이프가 중복된다(200ms 배치 창)

**File:** `relay/src/ws/fanout.ts:1027`, `relay/src/ws/fanout.ts:1049`, `relay/src/hub/subscription-hub.ts:1440-1443`, `relay/src/hub/subscription-hub.ts:2389-2403`

**Issue:**
`#onTape` 는 증분(71)을 **링버퍼에 먼저 넣고**, 같은 항목을 `#pendingTapes` 에도 넣어 200ms 뒤 증분으로 내보낸다.
그 200ms 사이에 새 소켓이 `sub`(또는 price→full 승격)하면 순서가 이렇게 된다.

1. `#sendTapeSnapshot` 이 `getTape()`(링 전체 — 아직 안 나간 대기 항목 포함)를 `snap:true` 로 보낸다.
2. 곧이어 `#flush` 가 같은 대기 항목을 `snap:false` 로 **그 소켓에도** 보낸다.

웹 `applyMarketFrames`(use-relay-socket.ts:1146-1149)는 중복을 거르지 않고 앞에 붙이므로, 같은 체결이 두 줄로 보인다.
per-user 시절에도 있던 경합이다. 다만 Phase 26 에서 캐시가 사용자 간에 공유되면서 「다른 사용자가 이미 보고 있는 활발한 종목을 연다」 가 기본 경로가 되어 발생 빈도가 크게 늘었다.

**Fix:** 스냅샷을 만들 때 아직 나가지 않은 대기 증분을 뺀다. 대기분이 `snap` 이면 곧 나갈 전량 교체에 맡긴다.

```ts
// subscription-hub.ts
getTape(isin: string, exchange: RelayExchange): RelayTapeEntry[] | undefined {
  const key = marketKey(isin, exchange);
  const ring = this.#tapes.get(key);
  if (ring === undefined) return undefined;
  const pending = this.#pendingTapes.get(key);
  if (pending === undefined) return [...ring];
  if (pending.snap) return undefined; // 곧 나갈 snap:true 가 전량을 준다
  return ring.slice(0, Math.max(0, ring.length - pending.entries.length));
}
```

### WR-03: 79 거부 한 번(일시적인 관찰자 정원 초과 포함)에 시세가 수동 재시작 전까지 영구 정지한다

**File:** `relay/src/quote/feed.ts:248-253`, `relay/src/quote/feed.ts:281-287`

**Issue:**
`success=false` 면 `#halt("rejected")` 가 재접속 루프를 끊는다. 이후 복구 경로는 relay 재시작뿐이다.
게이트웨이의 `kMaxObservers = 4` 는 journal · quote 역할을 합산한다. 그리고 거부 문구는 사유를 구분하지 않는 단일 문구다(23 D-09~D-13).

그래서 비밀이 틀린 경우뿐 아니라 **정원 초과**로도 같은 거부가 온다. 정원 초과가 생기는 경우는 이렇다.

- 터널이 흔들린 뒤 서버가 옛 half-open 관찰자 연결(유휴 스윕 90초 전)을 아직 세고 있다.
- 배포 중 옛 · 새 relay 가 겹친다.
- 개발 PC relay 가 같은 게이트웨이에 붙는다.

relay 한 대가 쓰는 칸만 이미 2개(journal + quote)다. 이런 일시적 초과 한 번이 폴백 없는 공유 시세 전체를 멈추고, 장 밖에도 즉시 503 을 낸다.
「거부면 중단」 은 19 D-13 · 26 CONTEXT 의 결정이다. 그러나 저널(지연 허용 · 재생 가능)과 달리 quote 는 단일 장애점이 되어, 같은 정책의 비용이 커졌다.

**Fix:**
- `role_mismatch` 는 정지를 유지한다.
- `rejected` 는 긴 간격의 유한 재시도로 바꾼다. 예: 5분 간격, 계정 잠금 위험이 없는 공유 비밀이므로 가능. 503 · 로그 승격은 그대로 둔다.
- 최소한 gh-trade 와 정원 초과 시의 79 `message` 를 구분할 수 있는지 확인하고, 그 경우만 재시도한다.

```ts
if (!result.success) {
  this.#setState("rejected");
  this.#transport?.dropTransport("quote 관찰자 거부");
  this.#scheduleRejectedRetry(REJECTED_RETRY_MS); // 5분 뒤 connect(), 그 사이 503 유지
  return;
}
```

### WR-04: 구독 한도 거부(`sub.limit`) 뒤 웹이 재시도하지 않고, 경고는 영구히 남으며, 안내 문구가 사실과 다르다

**File:** `webapp/src/lib/use-relay-socket.ts:880-882`, `webapp/src/lib/use-relay-socket.ts:1478-1487`, `webapp/src/lib/quote-state.ts:94-99`

**Issue:**
세 가지가 겹친다.

- **재시도 없음:** `sendSub` 는 보내는 순간 `wireSubsRef` 에 키를 「와이어에 있음」 으로 기록한다. `sub.limit` 리듀서는 `subLimit` 만 바꾸고 `wireSubsRef` 를 되돌리지 않는다. 그래서 `flushSubscriptions` 가 그 키를 다시 보내지 않는다. relay 는 그 키를 `conn.keys` 에 넣지 않았으므로, 해당 카드는 페이지 새로고침 · 소켓 재접속 · 카드를 닫았다 다시 열기 전까지 시세 0 이다.
- **문구가 사실과 다름:** user scope 문구는 「쓰지 않는 카드를 닫으면 다시 받을 수 있어요」 라고 안내한다. 하지만 다른 카드를 닫아도 거부된 카드는 복구되지 않는다.
- **경고가 영구히 남음:** `subLimit` 은 로그아웃(`reset`) 전까지 지워지지 않는다. 재접속 뒤 전 구독이 성공해도 시세 필 `title` 은 옛 거부를 계속 말한다.

**Fix:** 거부된 키를 와이어 기록에서 빼서 다음 흘림(버킷 · 백오프)에서 다시 시도하게 한다. 그 키가 다시 수락되면(해당 `q` 수신) 또는 새 인증 ACK 에서 `subLimit` 을 지운다.

```ts
// onmessage 에서 sub.limit 수신 시(리듀서 밖 — ref 는 훅 소유)
wireSubsRef.current.delete(relayQuoteKey(frame.i, frame.x));
scheduleSubRetry(SUB_LIMIT_RETRY_MS); // 예: 30초 뒤 flushSubscriptions()
// 리듀서: case "q" 에서 state.subLimit?.i === frame.i && x 일치면 subLimit: null
//         인증 ACK(state ready 전환)에서도 subLimit: null
```

### WR-05: 브라우저 ↔ relay 소켓이 끊겨도 시세 필이 마지막 「live」(초록)로 남는다

**File:** `webapp/src/lib/use-relay-socket.ts:876-878`, `webapp/src/lib/use-relay-socket.ts:1617-1619`, `webapp/src/lib/quote-state.ts:111-115`

**Issue:**
`quoteState` 는 `reset`(로그아웃)에서만 null 이 된다. 소켓이 닫혀 `scheduleRetry` 가 `stale` 만 세우는 동안에도 마지막 `quote.state`(live)가 남는다.
그 결과 relay VM 이 내려가거나 Caddy · 망이 끊겨 브라우저가 수 분간 재접속 중일 때, 주문 필은 「재연결 중」 인데 **시세 필은 초록 「● 시세」** 다. 이 브라우저에 시세가 한 줄도 오지 않는데도 그렇다.

재접속 뒤도 문제다. relay 는 `QuoteStatus.frame()` 이 null(재기동 직후 3초 디바운스 전, 또는 quote disabled)이면 프레임을 보내지 않는다(fanout.ts:744-745). 그러면 브라우저는 **이전 relay 프로세스의 live** 를 계속 그린다.
quote-state.ts ② 「모름이면 필이 없다 · live 로 위장하지 않는다」 계약과 D-01 목적(「시세가 멈췄는가를 한눈에」)에 어긋난다.

**Fix:** 소켓이 닫히면(또는 `stale` 이 true 가 되면) `quoteState` 를 null(모름)로 되돌린다. 새 연결의 인증 스냅샷이 오면 다시 채워진다.

```ts
case "stale":
  if (state.isStale === action.value) return state;
  return action.value
    ? { ...state, isStale: true, quoteState: null }
    : { ...state, isStale: false };
```

## Info

### IN-01: 페이서가 단일 FIFO라 재구독 burst 뒤에 대화형 새 구독이 줄을 선다

**File:** `relay/src/hub/subscribe-pacer.ts:147`, `relay/src/hub/subscribe-pacer.ts:213-219`, `relay/src/hub/subscription-hub.ts:1233`

**Issue:** quote 재접속 뒤 `resubscribeAll` 이 합집합(최대 2000 키)을 대기열에 넣는다. 그 사이 사용자가 새 카드를 열면 그 키는 대기열 **맨 뒤**에 붙는다.
응답이 늦거나 오지 않는 키(69 미응답 등 — RESEARCH A5 · A10 ASSUMED)는 슬롯을 3초씩 점유한다. 그래서 최악의 경우 새 카드 시세가 수십 초~수 분 비어 있을 수 있다.

**Fix:** 재구독 중에는 대화형 `subscribe`(재구독 루프 밖의 0→1 · 승격)를 대기열 앞에 넣는 우선 차선을 둔다. 재구독 완료 로그의 `elapsedMs` · `timeouts` 로 창 · 타임아웃 값을 먼저 실측한다.

### IN-02: `QUOTE_LINGER_MS` 에 상한이 없다 — 2^31-1ms 를 넘으면 setTimeout 오버플로로 즉시 해제된다

**File:** `relay/src/config.ts:138-142`

**Issue:** 유한 · 0 이상만 검사한다. Node 는 2147483647ms 를 넘는 지연을 1ms 로 바꾸므로(TimeoutOverflowWarning), 큰 값은 「오래 유지」 가 아니라 「즉시 해제」 로 뒤집힌다. 같은 검증 규약(T-26-13)의 빈틈이다.

**Fix:** `quoteLingerMs > 600_000` 처럼 합리적인 상한으로 기동을 거부한다.

### IN-03: 구독 한도 수치(200 · 2000)가 웹에 복제돼 있다

**File:** `webapp/src/lib/quote-state.ts:74-75`

**Issue:** relay `USER_SUB_LIMIT` · `QUOTE_SUB_LIMIT` 과 같은 값을 문구용으로 따로 적었다. 한쪽만 바뀌면 안내 수치가 틀린다.

**Fix:** `@gh-radar/shared` 에 상수를 두고 양쪽이 import 한다. 또는 `sub.limit` 프레임에 `limit` 수치를 싣는다.

### IN-04: My page 상태줄에 aria-live 영역이 중첩돼 있다

**File:** `webapp/src/components/trading/me-client.tsx:185`, `webapp/src/components/trading/me-client.tsx:191`

**Issue:** 바깥 컨테이너(`aria-live="polite"`) 안의 시세 필 span 에도 `aria-live="polite"` 가 있다. 일부 스크린리더는 같은 변경을 두 번 읽는다. 작업대 상태줄은 형제 span 두 개라 해당하지 않는다.

**Fix:** My page 에서는 안쪽 `aria-live` 를 빼고 바깥 영역 하나로 둔다.

### IN-05: 구독 한도 안내가 `title` 뿐이라 터치 · 네이티브 앱에서는 보이지 않는다

**File:** `webapp/src/lib/quote-state.ts:26-28`, `webapp/src/components/trading/workbench/workbench-status-bar.tsx:145`

**Issue:** 안 B 결정(칩 대신 title)은 hover 가 없는 폰 · iOS/Android 래퍼에서 사용자에게 전달되지 않는다. 거부된 카드만 시세가 비고, 이유를 알 방법이 없다. WR-04 가 고쳐지면 영향은 줄어든다.

**Fix:** 거부된 카드 자체에 인라인 표식을 두거나, 다음 UI 조정 때 터치 기기용 대체 표면을 검토한다.

### IN-06: 합집합 재구독 완료 로그가 평시 구독 흐름에 가려질 수 있고, feed 교체 시 진행 상태가 남는다

**File:** `relay/src/hub/subscription-hub.ts:1239-1251`, `relay/src/hub/subscription-hub.ts:829-835`

**Issue:**
- 완료 판정은 「대기열과 창이 모두 빔」 이다. 장 시작처럼 새 구독이 계속 들어오면 idle 이 늦게 오거나 오지 않는다. 그러면 A5 튜닝 근거인 `elapsedMs` · `timeouts` 가 과대 측정되거나 누락된다.
- `attachFeed` 교체 경로는 `#pacer.reset()` 만 하고 `#resubscribeRun` 을 비우지 않는다.

**Fix:** 재구독에서 넣은 키 집합만 따로 추적해, 그 집합이 전부 응답 · 타임아웃되면 완료 로그를 낸다. `attachFeed` 교체에서도 `#resubscribeRun = null` 로 둔다.

---

_Reviewed: 2026-09-30T23:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
