---
phase: 19-account-order-journal
reviewed: 2026-10-03T12:54:29Z
depth: standard
files_reviewed: 60
files_reviewed_list:
  - docs/relay-operations.md
  - infra/relay/README.md
  - ops/alert-relay-down.yaml
  - packages/shared/src/__tests__/journal.test.ts
  - packages/shared/src/index.ts
  - packages/shared/src/journal.ts
  - packages/shared/src/relay.ts
  - relay/src/config.ts
  - relay/src/dma/__tests__/codec.test.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/journal/access.ts
  - relay/src/journal/codec.ts
  - relay/src/journal/observer.ts
  - relay/src/journal/status.ts
  - relay/src/journal/trading-window.ts
  - relay/src/journal/types.ts
  - relay/src/journal/writer.ts
  - relay/src/logger.ts
  - relay/src/order/notice-status.ts
  - relay/src/order/order-api.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
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
  - relay/tests/ws-order.test.ts
  - scripts/deploy-relay.sh
  - scripts/setup-relay-iam.sh
  - server/src/routes/orders.ts
  - server/src/services/dma-orders.ts
  - server/tests/routes/orders.test.ts
  - supabase/migrations/20260924200000_dma_journal_tables.sql
  - supabase/migrations/20260924200100_dma_journal_rpcs.sql
  - supabase/tests/dma_journal_apply.test.sql
  - supabase/tests/dma_journal_schema.test.sql
  - webapp/e2e/specs/me.spec.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
  - webapp/src/components/trading/origin-tag.tsx
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/src/lib/__tests__/order-notices.test.ts
  - webapp/src/lib/__tests__/orders-api.test.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/lib/order-notices.ts
  - webapp/src/lib/orders-api.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/use-relay-socket.ts
findings:
  critical: 0
  warning: 9
  info: 4
  total: 13
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-10-03T12:54:29Z
**Depth:** standard
**Files Reviewed:** 60
**Status:** issues_found

## Summary

Phase 19 의 계좌 주문 저널 경로(relay 관찰자 연결 → `JournalWriter` → `dma_journal_apply`/`dma_journal_project` → `dma_account_orders` → server `GET /api/orders` → webapp 「오늘 주문」 카드)를 standard 깊이로 검토했다. 생성 FlatBuffers 코드(`relay/src/generated/**`)는 지시대로 제외했다. 테스트 파일은 신뢰성 문제만 보았다(해당 없음).

핵심 불변식인 「이벤트 PK 삽입 성공 = 1회 적용 · 커서는 적용 RPC 트랜잭션 안에서만 전진」은 SQL 과 기록기 양쪽에서 정확히 지켜지고 있고, 9/28~10/2 운영 데이터(seq 1~5062 연속 · apply_error 0)와도 맞는다. 정상 경로에서 데이터를 잃거나 이중 적용하는 결함은 찾지 못했으므로 Critical 은 0건이다.

결함은 대부분 **정상 경로 밖**(전략 스트림 장애 · 게이트웨이 계약 위반 · 빈 매핑 스냅샷 · 하루 1000건 초과 · 일시적 조회 실패)에 몰려 있다. 공통 경향은 「조용한 실패」다 — 투영 실패(apply_error)·중복 seq 스킵·매핑 전면 소거가 `/healthz` 나 알림에 드러나지 않고, relay 로그는 Cloud Logging 에 없어 사실상 보이지 않는다. 또한 관찰자 로그인 성공마다 백오프를 1초로 되돌리므로 로그인 뒤의 결정적 실패가 1초 주기 무한 재접속이 된다. 웹앱 쪽은 조회 실패 한 번이 이미 받은 행과 실시간 푸시 행까지 모두 가리고, 통보 단위로 설계된 묶기 로직을 주문 단위 행에 그대로 적용해 묶음 행의 상태와 수량이 틀어질 수 있다.

원격에서 이미 실행된 마이그레이션(`20260924200000` · `20260924200100`)은 수정할 수 없으므로, DB 관련 수정안은 모두 후속 마이그레이션으로 제시한다. 참고로 `dma_journal_orders_for_user` 본문은 이미 `20260929190000_dma_gateway_identities.sql` 이 대체했다(교차 게이트웨이 신원 문제는 그쪽에서 해결됨).

## Warnings

### WR-01: 전략 커서 읽기 실패가 주문 저널 연결 자체를 막는다 (WR-01 격리 설계와 모순)

**File:** `relay/src/journal/observer.ts:222-242`
**Issue:** `#loadCursorThenConnect` 는 `Promise.all([writer.readCursor(), strategyWriter?.readCursor()])` 가 **둘 다** 성공해야 `connect()` 한다. 전략 기록기의 `readCursor` 는 `dma_journal_cursor` 에서 전략 전용 칸(Phase 25 마이그레이션이 추가한 칸)을 select 하므로, 그 칸이 없거나 이름이 바뀌거나 권한·스키마 캐시 문제로 전략 select 만 실패해도 주문 저널 관찰자는 영원히 `connecting` 이다. 장중이면 180초 뒤 `/healthz` 503 이 된다. 같은 파일 머리 주석 WR-01 과 `status.ts` 머리 주석(RESEARCH Pitfall 4 — 「전략 쪽 장애가 주문 저널 503 으로 번지지 않게」 · 「원격 마이그레이션 전 배포 한 번이 장중 거짓 503」)이 막으려던 결합을 부팅 경로에서 그대로 다시 만든다. 지금 운영이 정상인 것은 마이그레이션이 적용돼 있기 때문일 뿐이다.
**Fix:** 주문 커서만 연결의 필수 조건으로 두고, 전략 커서 실패는 전략 수신 일시 중지로 격리한다.
```ts
async #loadCursorThenConnect(attempt: number): Promise<void> {
  try {
    await this.#deps.writer.readCursor();           // 주문 커서만 필수
  } catch (err) { /* 기존 백오프 재시도 */ return; }
  const sw = this.#deps.strategyWriter;
  if (sw !== undefined) {
    try { await sw.readCursor(); }
    catch (err) {
      // 전략만 멈춘다 — 로그인 since 는 0 이 아니라 "받지 않음"으로 두고 배치 전략분은 버린다.
      this.#pauseStrategy("cursor", { pgError: safePgError(err) });
    }
  }
  if (!this.#stopped) this.#transport?.connect();
}
```
(`StrategyPauseReason` 에 `"cursor"` 를 추가하고 `/healthz` `journal.strategy.paused` 로 드러낸다. 일시 중지 상태에서는 `strategySinceSeq` 를 0 으로 보내 전량 재생을 유발하지 않도록 주의한다.)

### WR-02: 관찰자 로그인 성공마다 백오프를 리셋해 로그인 뒤 결정적 실패가 1초 주기 무한 재접속이 된다

**File:** `relay/src/journal/observer.ts:341`, `relay/src/journal/observer.ts:397-407`, `relay/src/journal/writer.ts:375-383`
**Issue:** `#onLogin` 은 성공 시 `transport.resetReconnectAttempts()` 를 부르고, 이후 `gap` · `overflow` · `malformed` 는 `dropTransport` 로 끊는다. `DmaClient.#scheduleReconnect` 는 리셋된 카운터로 `backoffDelayMs(1)` = 1초를 쓰므로, 로그인 **뒤에** 매번 같은 방식으로 실패하는 경우(게이트웨이 디스크 저널의 seq 구멍 → 같은 갭 반복, 특정 레코드에서 항상 깨지는 프레임 → malformed 반복, 결선 오류로 `epoch === ""` 인 기록기 → 아래 참고) 백오프가 전혀 자라지 않고 1초 간격으로 영원히 재로그인·재생을 반복한다. 매 회 게이트웨이는 since 이후 구간을 다시 펌프한다(실거래 게이트웨이에 부하).
또한 기록기는 `closed` 와 `epoch 미설정` 을 모두 `"overflow"` 로 돌려주므로(writer.ts:375-383), 로그인 응답 epoch 가 빈 문자열인 경우(게이트웨이 설정 오류) 관찰자는 「저널 큐 상한」 이라는 **틀린 사유**로 1초 루프를 돈다 — 운영자가 원인을 큐 압력으로 오판하게 된다.
**Fix:**
1. 백오프 리셋 시점을 「로그인 성공」 이 아니라 「로그인 뒤 첫 배치를 정상 적재했거나 live 진입」 으로 늦춘다.
```ts
// #onLogin 에서 resetReconnectAttempts() 제거
// #onBatch 에서 주문 push 가 "ok" 이고 적재가 1건 이상이었거나 live 진입 시점에만 리셋
if (result === "ok") this.#transport?.resetReconnectAttempts();
```
2. `JournalPushResult` 에 `"not_ready"`(closed · epoch 미설정)를 분리하고, `#onLogin` 에서 `result.success && result.epoch === ""` 이면 계약 위반으로 error 로그 후 `#reject` 와 같은 정지 경로를 탄다.

### WR-03: 같은 epoch 의 seq 역행 뒤 게이트웨이가 seq 를 재사용하면 새 레코드가 debug 로그만 남기고 사라진다

**File:** `relay/src/journal/writer.ts:339-350`, `relay/src/journal/writer.ts:389-403`
**Issue:** `beginEpoch` 의 seq 역행 분기는 `lastReceivedSeq` 를 유지하고, gh-trade 가 「다음 seq 를 since+1 로 올린다」 는 합의를 지킨다고 가정한다. 게이트웨이가 이 합의를 어기고 `head+1`(≤ `lastReceivedSeq`)부터 새 레코드를 매기면, `push` 는 그것들을 **중복**으로 분류해 `logger.debug` 한 줄만 남기고 버린다. 설령 relay 를 통과해도 DB 의 `(gateway, epoch, seq)` PK 가 옛 내용으로 이미 있어 `ON CONFLICT DO NOTHING` 이 투영을 건너뛴다. 결과는 새 주문·체결의 **조용한 영구 누락**이고, 운영 LOG_LEVEL 에서는 debug 가 보이지 않으며 `/healthz` 에도 신호가 없다(`seqRegressions` 는 로그인 시점 역행만 센다).
**Fix:** 중복 스킵을 관측 가능하게 만든다. 역행을 한 번이라도 관측한 epoch 에서는 중복을 warn 이상으로 올리고 health 카운터를 둔다.
```ts
if (duplicates > 0) {
  this.#duplicatesSkipped += duplicates;
  const lvl = this.#seqRegressions > 0 ? "error" : "debug";
  logger[lvl]({ gateway: this.#gateway, stream, duplicates, lastReceivedSeq: this.#lastReceivedSeq },
    "[journal] 중복 seq 건너뜀");
}
// health(): duplicatesSkippedAfterRegression 노출
```
가능하면 레코드 내용 해시를 함께 비교하는 후속 마이그레이션(`dma_journal_apply` 가 PK 충돌 시 원문 불일치를 `apply_error`/카운터로 남김)도 고려한다.

### WR-04: 빈(또는 대부분 걸러진) 매핑 스냅샷 한 번이 모든 사용자의 가시성을 DB 와 메모리에서 동시에 지운다

**File:** `relay/src/journal/access.ts:76-106`, `supabase/migrations/20260924200100_dma_journal_rpcs.sql:539-550`, `relay/src/dma/envelope.ts:2851-2854`
**Issue:** `JournalAccess.replace` 는 로그인 응답 `accounts` 를 무조건 정본으로 받아 메모리 맵을 교체하고, `dma_journal_sync_access` 는 `DELETE FROM dma_account_access WHERE gateway = p_gateway` 후 재삽입한다. 게이트웨이가 `success=true` 인데 `accounts` 가 비어 있거나(users.toml 로드 실패 등), 계좌번호 형식이 바뀌어 `parseObserverLoginResp` 의 `isValidAccountNo`(12자 상한) 검사로 항목이 전부 스킵되면, 매 재접속마다 전 사용자의 「오늘 주문」 REST 조회가 0행이 되고 `journal.rows` 푸시도 멈춘다. 경고는 `skipAccount` warn 로그뿐이고 `/healthz` 는 정상이다. 저널 적용은 계속되므로 데이터는 남지만, 사용자 화면은 「오늘 낸 주문이 없어요」 를 보여 **거짓 빈 목록**이 된다(T-19-31 이 막으려던 오해).
**Fix:** 이전 스냅샷이 비어 있지 않은데 새 스냅샷이 0행이면 교체를 거부하고 error 로그 + health 신호를 남긴다. 스킵된 항목이 있으면 그 수도 `/healthz` `journal` 에 싣는다.
```ts
replace(rows: readonly ObserverAccountRow[]): void {
  // … 필터링 …
  if (syncRows.length === 0 && this.#rows > 0) {
    logger.error({ gateway: this.#gateway, previous: this.#rows },
      "[journal] 빈 매핑 스냅샷 — 기존 매핑을 유지한다(교체 거부)");
    this.#emptySnapshotRejected += 1;
    return;
  }
  // … 기존 교체 …
}
```

### WR-05: 투영 실패(apply_error)가 운영자에게 보이지 않는다

**File:** `relay/src/journal/writer.ts:564-566`, `relay/src/journal/status.ts:131-150`, `supabase/migrations/20260924200100_dma_journal_rpcs.sql:455-465`
**Issue:** 포이즌 격리 설계상 투영 실패 이벤트는 `apply_error` 에 사유를 남기고 커서는 전진한다. 그런데 relay 쪽 신호는 이벤트마다 `logger.warn` 한 줄뿐이고, `JournalWriterHealth`/`/healthz` 에는 실패 건수가 없다. 배포 문서대로 relay 로그는 Cloud Logging 에 없으므로(docker json-file · 30MB 회전), 게이트웨이 업데이트로 새 `notice_type`/`request_kind` 가 생기거나 CHECK 위반이 체계적으로 나기 시작하면 **모든 주문 행이 조용히 투영되지 않는데도** 상태는 `live` · 200 이다. 현재 apply_error 0 은 결과일 뿐 감시 장치가 아니다.
**Fix:** 기록기 health 에 누적 `projectionErrors` · `lastProjectionErrorAtMs` 를 추가하고 `/healthz` `journal` 본문에 싣는다. 장중 일정 시간 안에 N건 이상이면 503(또는 별도 uptime JSONPath 알림)으로 올린다.
```ts
// #onSuccess
if (result.errors.length > 0) {
  this.#projectionErrors += result.errors.length;
  this.#lastProjectionErrorAtMs = Date.now();
  this.emit("health", this.health());
}
```

### WR-06: 「오늘 주문」 REST 조회가 PostgREST max_rows(1000)에서 조용히 잘린다

**File:** `server/src/services/dma-orders.ts:56-68` (RPC 본문: `supabase/migrations/20260929190000_dma_gateway_identities.sql:136`, 원본 `20260924200100_dma_journal_rpcs.sql:562-609`), `supabase/config.toml:18`
**Issue:** `dma_journal_orders_for_user` 는 set-returning 함수라 `supabase.rpc` 결과에도 `max_rows = 1000` 이 적용된다. 정렬이 `created_at DESC` 라 1000건을 넘는 날은 **가장 오래된 주문부터** 오류 없이 사라진다. 행 모델이 계좌 기준이라 공유 계좌(여러 DMA 사용자 · WinForms · 상따 자동주문)의 주문이 한 사용자 응답에 모두 합쳐지므로, 상따 활동이 많은 날 1000건은 현실적인 상한이다(9/28~10/2 이벤트가 약 1,200건/일). 웹앱 보관 상한(`MAX_JOURNAL_ROWS = 2000`)과도 어긋난다. 이 코드베이스는 같은 함정을 `home.ts` · `themes.ts` · `quoteJoin.ts` 에서 이미 막았다.
**Fix:** 조회 RPC 를 `jsonb` 단일 값 반환으로 바꾸는 후속 마이그레이션(themes.ts 의 「jsonb 단일 값이라 max_rows 에 잘리지 않는다」 패턴)을 추가하거나, `.range()` 페이지 루프로 전량을 읽는다. 최소한 응답 길이가 1000 이면 warn 로그를 남겨 절단을 드러낸다.
```ts
// 후속 마이그레이션: dma_journal_orders_for_user_json(p_user_id uuid, p_trade_date date) RETURNS jsonb
const { data, error } = await supabase.rpc("dma_journal_orders_for_user_json", { … });
return ((data ?? []) as JournalOrderDbRow[]).map(toJournalOrderRow);
```

### WR-07: 조회 실패 한 번이 이미 그린 행과 실시간 푸시 행을 모두 가리고, 스스로 회복하지 않는다

**File:** `webapp/src/components/trading/today-orders-card.tsx:273-287`, `webapp/src/components/trading/today-orders-card.tsx:405-413`
**Issue:** `load()` 의 catch 는 `setRestored([])` · `setFailed(true)` 이고, 렌더는 `failed ? <오류 문구> : …` 라서 실패 상태에서는 목록 전체를 그리지 않는다. 그래서
1. 재인증(ready 재진입)·`delayed → live` 재조회가 일시적 네트워크 오류로 실패하면, 직전까지 보이던 정상 목록이 **오류 문구로 통째로 바뀐다**(모바일 백그라운드 복귀가 바로 이 재조회 시점이라 실패 확률이 가장 높은 순간이다).
2. 마운트 조회가 실패하면(server 콜드 스타트 · 타임아웃) 그 뒤 도착하는 `journal.rows` 푸시도 화면에 나오지 않는다 — `rows` 는 계산되지만 `failed` 분기가 가린다.
3. 재시도가 없어 다음 재접속·기록 복구 전이 전까지 이 상태가 유지된다.
머리 주석 ④ 의 목적(다른 카드를 지키는 것)은 맞지만, 이 카드 안의 유효한 데이터를 버릴 이유는 없다.
**Fix:** 실패 시 직전 `restored` 를 유지하고, 오류는 목록 위 한 줄 안내로만 표시한다. 행이 있으면 목록을 계속 그린다. 짧은 지수 재시도(예: 3회)를 둔다.
```tsx
} catch {
  setRestored((prev) => prev ?? []);   // 직전 성공 결과 유지
  setFailed(true);
}
// 렌더: rows.length > 0 이면 목록을 그리고, failed 는 머리 아래 안내 줄로만
```

### WR-08: 통보 단위 묶기 로직을 주문 단위 저널 행에 적용해 묶음 행의 상태·수량이 틀어진다

**File:** `webapp/src/lib/order-notices.ts:209-222`, `webapp/src/lib/order-notices.ts:264-352`, `webapp/src/components/trading/today-orders-card.tsx:533-536`, `webapp/src/components/trading/today-orders-card.tsx:592-597`
**Issue:** `mergeOrderNotices` 는 17-10 에서 **통보 한 건 = 한 행** 모델(체결 통보의 수량 = 체결 수량)을 위해 만들어졌다. Phase 19 이후 행은 **주문 한 건 = 한 행**이고 `noticeType` 은 「마지막 통보」, `qty` 는 「주문 수량」 이다. 이 상태에서
- `mergeKeyOf` 는 마지막 통보가 `E` 인 자동주문 행들을 `FG|…` 로 묶는데, 그 행들의 상태는 `partially_filled`/`filled` 가 섞일 수 있다. 화면 상태 칸은 `notice.head` **한 행의 상태만** 그리므로(`orderDisplayStatus(row)`), 3건 중 1건이 체결이고 2건이 부분체결이어도 「체결」 로 보일 수 있다(트레이더 판단에 직접 쓰이는 칸).
- 수량 칸은 묶음 구성원의 **주문 수량 합**이다. 체결 묶음에서 의미 있는 값은 체결 수량인데 `filledQty` 는 카드 어디에도 표시되지 않는다.
- 묶기 키가 가변 필드(`noticeType`)라 행이 A→E 로 바뀌면 다른 묶음으로 이동해 `members[0].id`(펼침 키)가 바뀌고, 열어 둔 행이 닫힐 수 있다.
**Fix:** 주문 행 모델에 맞게 묶기 축을 재정의한다. 최소 수정으로는 묶음의 상태를 구성원 상태로부터 계산(모두 같으면 그 값, 다르면 「혼합」/가장 덜 진행된 상태)하고, 체결 묶음은 `filledQty` 합을 수량으로 보인다. 근본적으로는 묶기 키에서 `noticeType` 을 빼고 `(origin, isin, exchange, side, status 그룹)` 같은 안정 축을 쓰거나, 주문 행 모델에서는 묶기를 하지 않는다.

### WR-09: 커밋 뒤 응답 유실로 같은 배치를 재시도하면 그 배치의 실시간 푸시가 영구히 빠진다

**File:** `relay/src/journal/writer.ts:497-521`, `supabase/migrations/20260924200100_dma_journal_rpcs.sql:449-453`, `supabase/migrations/20260924200100_dma_journal_rpcs.sql:486-498`
**Issue:** 적용 RPC 가 DB 에서 커밋됐는데 HTTP 응답이 유실되면(소켓 리셋 · 게이트웨이 타임아웃 · Supabase 측 504) 기록기는 실패로 보고 같은 배치를 재시도한다. 두 번째 호출에서는 모든 이벤트가 PK 충돌로 `skipped` 가 되고 투영을 건너뛰므로 `v_ids` 가 비어 `rows: []` 가 돌아온다. 결과적으로 첫 호출이 바꾼 행은 **어떤 브라우저에도 푸시되지 않는다**. 그 주문에 후속 통보가 없으면(마지막 체결 · 취소 확인처럼 종결 통보) 카드는 새로고침·재접속 전까지 옛 상태(예: 「부분체결」)에 머문다. 이 경우 `journal.state` 는 `live` 라 「기록 지연」 표식도 뜨지 않는다.
**Fix:** `dma_journal_apply` 가 건너뛴(이미 적용된) 이벤트가 가리키는 행도 반환하도록 후속 마이그레이션으로 바꾼다. 웹앱 병합은 `lastSeq` 비교로 멱등이므로 같은 행을 다시 보내도 안전하다.
```sql
-- 후속 마이그레이션: 스킵 분기에서도 행 id 를 모은다
IF NOT FOUND THEN
  v_skipped := v_skipped + 1;
  v_ids := v_ids || ARRAY(
    SELECT o.id FROM public.dma_account_orders o
     WHERE o.gateway = p_gateway
       AND ((o.order_no IS NOT NULL AND o.trade_date = (ev->>'trade_date')::date
             AND o.account_no = ev->>'account_no'
             AND o.order_no IN (NULLIF(ev->>'order_no',''), NULLIF(ev->>'org_order_no','')))
         OR (o.journal_epoch = p_epoch AND o.reject_seq = v_seq)));
  CONTINUE;
END IF;
```

## Info

### IN-01: 동시 재조회의 응답 순서가 뒤바뀌면 더 오래된 스냅샷이 남는다

**File:** `webapp/src/components/trading/today-orders-card.tsx:273-322`
**Issue:** 마운트 조회 · ready 재진입 · `delayed → live` 세 트리거가 각자 `load()` 를 부르고 마지막 응답이 `restored` 를 덮는다. relay 재시작 뒤 브라우저 재접속에서는 ready 재진입과 `delayed → live` 가 거의 동시에 일어나 두 요청이 겹친다. 먼저 보낸 요청의 응답이 늦게 오면 더 오래된 스냅샷이 남는다(이 세션에 푸시된 행은 `lastSeq` 병합으로 보정되지만, 끊긴 동안 바뀐 행은 보정되지 않는다).
**Fix:** 요청 세대 번호를 ref 로 두고 최신 세대의 응답만 반영하거나, `restored` 도 `mergeJournalRows` 처럼 `id`·`lastSeq` 기준으로 병합한다.

### IN-02: `notice-status.ts` 주석이 동결된 `dma_orders` 를 현역 기록 대상으로 설명한다

**File:** `relay/src/order/notice-status.ts:1-16`, `relay/src/order/notice-status.ts:29-41`
**Issue:** 머리 주석 「주문 통보(51) → `dma_orders` 상태 판정」 · 「`dma_orders.status` CHECK 에 있는 8종 밖으로 나가면 그 행의 갱신이 통째로 사라진다」 · 「`filled_qty` 만 갱신하고」 는 Phase 19 D-01/D-05 이후 사실이 아니다(relay 는 DB 에 쓰지 않고 `filledQtyOf` 의 소비자도 사라졌다). 다음 작업자가 이 주석을 근거로 기록 경로를 되살릴 위험이 있다.
**Fix:** 「즉시응답 `order.result` 의 상태 판정 전용」 으로 주석을 정정하고, 소비자가 없으면 `filledQtyOf` 를 삭제한다.

### IN-03: 주 게이트웨이 키가 `DMA_BROKER` 값이라 값이 바뀌면 커서·행·매핑이 갈라진다

**File:** `relay/src/config.ts:149`, `supabase/migrations/20260924200100_dma_journal_rpcs.sql:539`
**Issue:** `journalUpstreams[0].gateway = dmaBroker` 다. 운영 중 `DMA_BROKER` 표기가 바뀌면(예: `KB` → `kb`) 새 키로 커서 없음 → 전량 재생 → `dma_account_orders` 에 같은 주문이 다른 `gateway` 로 한 번 더 생긴다. `dma_journal_sync_access` 는 `p_gateway` 범위만 지우므로 옛 키의 매핑 행이 남아, 사용자는 같은 주문을 두 줄로 보게 된다.
**Fix:** 저널 게이트웨이 키를 브로커 표기와 분리된 상수 env(예: `JOURNAL_GATEWAY_KEY`, 기본 `"KB"`)로 고정하고, config 에서 정규식(`^[A-Z0-9_]+$`)으로 검증한다.

### IN-04: 투영 실패 이벤트를 다시 투영할 경로가 없다

**File:** `supabase/migrations/20260924200100_dma_journal_rpcs.sql:449-465`
**Issue:** `apply_error` 가 남은 이벤트는 원문 행이 이미 있으므로 재생해도 PK 게이트에서 `skipped` 가 되어 다시 투영되지 않는다. 투영 버그를 후속 마이그레이션으로 고쳐도 이미 실패한 이벤트를 적용할 공식 경로가 없어, 그날의 주문 행이 영구히 빠지거나 수작업 SQL 이 필요하다.
**Fix:** service_role 전용 유지보수 RPC `dma_journal_reproject(p_gateway, p_epoch, p_from_seq, p_to_seq)` 를 후속 마이그레이션으로 추가한다. advisory lock 아래에서 `apply_error IS NOT NULL` 인 이벤트만 seq 순으로 `dma_journal_project` 에 다시 넣고, 성공하면 `apply_error` 를 NULL 로 되돌린다. 운영 문서(`docs/relay-operations.md`)에 절차를 추가한다.

---

_Reviewed: 2026-10-03T12:54:29Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
