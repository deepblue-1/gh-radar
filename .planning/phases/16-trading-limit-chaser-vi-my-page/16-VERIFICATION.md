---
phase: 16-trading-limit-chaser-vi-my-page
verified: 2026-09-08T22:28:49Z
status: gaps_found
score: 78/82 must-haves verified
overrides_applied: 0
gaps:
  - truth: "상따·VI 자동주문 통보는 기존 행을 못 찾으면 새 행으로 insert 되어 감사 기록이 비지 않는다 (16-08 / D-03 / Pitfall 18)"
    status: failed
    reason: "`findIdByOrderNo` 가 `order_no` 만으로 조회한다 — `user_id` 필터도 날짜 범위도 없다. 브로커 주문번호는 일별 재사용 시퀀스이고 `dma_orders.order_no` 에 UNIQUE 제약이 없으므로(일반 인덱스), 운영 2일차부터는 **어제 행**이 매치되어 오늘 자동주문의 insert 가 일어나지 않는다. 이 함수가 막으려던 Pitfall 18 이 그대로 재발한다. 다중 매치 시에는 `maybeSingle()` 이 던지고 catch 가 셀렉터 없는 `enqueueUpdate` 로 열화해 `.update(patch).eq(\"order_no\", v)` 가 **전 사용자·전 날짜 행**을 덮는다(테넌트 간 쓰기)."
    artifacts:
      - path: "relay/src/store/orders.ts"
        issue: "L239-252 `supabaseOrderLookupSink` — `.eq(\"order_no\", orderNo).maybeSingle()` 만 있고 `user_id`·`created_at` 범위가 없다. L452-457 `selectorOf` 가 만드는 `{column:\"order_no\"}` 셀렉터도 사용자 경계가 없다."
      - path: "relay/src/ws/order-handler.ts"
        issue: "L275-302 `recordUnmatched` — 조회 실패 catch 가 셀렉터 없는 `enqueueUpdate(patch)` 로 열화한다. 주석의 전제(「대상은 내 행 하나뿐」)가 성립하지 않는다."
      - path: "supabase/migrations/20260905120200_dma_orders.sql"
        issue: "L76 `CREATE INDEX idx_dma_orders_order_no` — UNIQUE 가 아니라 DB 방어선이 없다."
    missing:
      - "`OrderLookupSink` 시그니처를 `(userId, orderNo)` 로 좁히고 `.eq(\"user_id\", userId)` + KST 당일 `created_at` 범위 필터 추가"
      - "`OrderSelector` 의 `order_no` 변형에 `userId` 를 실어 `supabaseOrderSink` 의 update 에도 `.eq(\"user_id\", …)` 적용"
      - "`dma_orders (user_id, order_no, (created_at AT TIME ZONE 'Asia/Seoul')::date)` 부분 UNIQUE 인덱스 마이그레이션"
      - "sink 를 스텁으로 바꾸지 않는 경계 테스트 — 같은 `order_no` 가 다른 사용자·다른 날짜에 있을 때의 동작"
  - truth: "브라우저가 wss 로 보낸 주문이 relay 에서 5초 상관 후 order.result 로 돌아온다 (16-08 / D-02)"
    status: partial
    reason: "상관 축이 ISIN 하나뿐이다. `state.pending.findIndex((p) => p.isin === notice.isin)` 이라 같은 종목의 대기 항목이 2건 이상이면 **먼저 등록된 것**이 무조건 정산된다. 「취소하고 다시 걸기」(호가주문 탭에서 주문 패널·계좌 패널이 나란히 있는, 이 phase 가 만든 가장 흔한 조작)에서 5초 안에 신규+취소가 겹치면 두 주문의 `order.result` 와 `dma_orders` 기록이 서로 바뀐다. 살아 있는 매수 주문이 「취소됨」으로 표시되고 사용자가 그 표시를 믿고 재주문하면 중복 체결이다. `PendingOrder.qty` 는 저장만 되고 매칭에 쓰이지 않으며, 통보의 `noticeType`·`orgOrderNo`·`price`·`quantity` 도 전혀 보지 않는다. (Phase 15 15-16 에서 이식된 축이지만, 16-10 이 같은 화면에 wss 취소를 붙이면서 이 phase 의 계약 안으로 들어왔다.)"
    artifacts:
      - path: "relay/src/ws/order-handler.ts"
        issue: "L232-245 통보 매칭이 ISIN 단일 축. `byUser` 루프도 ISIN 이 맞는 첫 연결을 고르므로 탭 A 의 통보가 탭 B 의 대기 주문을 정산한다."
    missing:
      - "`PendingOrder` 에 `isCancel`·`price` 를 싣고 `noticeType`(C/M vs 그 외)·`quantity` 로 후보를 좁히는 `matches()` 도입"
      - "못 좁히면 「가장 오래된 것」이 아니라 매칭 실패로 두어 `recordUnmatched` 로 보내기"
      - "같은 ISIN 의 신규+취소가 5초 안에 겹치는 relay 테스트 케이스"
  - truth: "전체 비활성화(킬 스위치)가 My page 에서 확인 다이얼로그를 거쳐 실제로 전략을 내린다 (16-15 / D-09 · PC-7)"
    status: partial
    reason: "버튼·다이얼로그·65 백스톱은 실재하고 연결 상태에서는 동작한다. 그러나 `use-relay-socket.ts` 의 `send()` 가 소켓 미연결 시 **로그도 반환값도 없이** 조용히 드롭하고(L850-854), 킬 스위치만 `status !== 'ready'` 가드가 없다(`disabled={nothingToDisable || awaitingAck}`). 리듀서는 단절 시 `isStale` 만 세우고 `limitChasers` 를 유지하므로 재접속 중에도 버튼이 활성이다. 결과: 게이트웨이로 0바이트가 나가고 8초 뒤 `awaitingAck` 만 내려가며 오류 문구·로그·재시도가 전부 없다 — 사용자는 껐다고 믿고 자동매매는 계속 돈다. `lc.set`/`vi.set`/`vi.confirm` 호출부는 전부 `sessionReady` 로 가려져 있어 킬 스위치만 예외다. 프로젝트 규율 「무로그 fail-safe 금지」(PC-7 / S-5) 위반이고 하필 대상이 가장 안전 임계적인 컨트롤이다."
    artifacts:
      - path: "webapp/src/lib/use-relay-socket.ts"
        issue: "L850-854 `send` 가 `readyState !== OPEN` 이면 무로그·무반환 드롭. 전략 4종의 유일한 출구다."
      - path: "webapp/src/components/trading/strategy-status-card.tsx"
        issue: "L456 `disabled={nothingToDisable || awaitingAck}` — 세션 상태를 보지 않는다. L360-368 `handleConfirm` 이 전송 성공 여부를 확인하지 않고 `awaitingAck` 를 세운다."
    missing:
      - "`send(msg): boolean` 으로 바꾸고 드롭 시 `console.error` 로그 남기기"
      - "킬 스위치 `disabled` 에 `status !== 'ready'` 추가"
      - "전송 실패 시 `awaitingAck` 를 세우지 않고 「연결이 끊겨 보내지 못했어요」 표시"
      - "8초 ack 타임아웃도 조용히 지나가지 않게 「반영을 확인하지 못했어요」 남기기"
  - truth: "relay·server·webapp 이 재배포되어 프로덕션에서 전략·주문 wss 경로가 살아 있다 (16-17)"
    status: partial
    reason: "배포 3종은 실측 확인됐다 — relay `4b6d792`(VM radar-gw), server `gh-radar-server-00042-p78`(env 17종·relay 바인딩 0건), webapp 은 Phase 16 사이드바(「상승률 상위」·「종목검색」)가 라이브다. 그러나 relay 공개 `/healthz` 는 지금 `503 {\"status\":\"degraded\",\"vpn\":true,\"dma\":false,\"version\":\"4b6d792\",\"sessionCount\":1}` 이다. DMA 게이트웨이 세션이 Ready 가 아니므로 **전략·주문 wss 경로는 프로덕션에서 끝까지 살아 있지 않다** — 로그인 사용자는 트레이딩 3표면에서 게이트만 본다. 판정 로직 차분은 0 이고 2026-09-06 에도 같은 구간이 있었던 재발형 조건이지만, 이 phase 가 `RelayProvider` 를 루트 레이아웃으로 올리면서(`enabled: user != null`) 트리거 표면이 「호가주문 탭」에서 「로그인한 모든 페이지」로 넓어졌다. uptime check 적색 + `gh-radar-relay-down` 발화가 상시화된다."
    artifacts:
      - path: "webapp/src/app/layout.tsx"
        issue: "RelayProvider 가 루트 레이아웃 — 게이트웨이 부재 구간에 503 트리거 표면이 앱 전역으로 넓어졌다."
      - path: "scripts/smoke-relay.sh"
        issue: "INV-9 가 `POST /api/orders` 도달성으로 판정하는데 그 라우트는 16-16 에서 사라졌다 — 토큰을 넣어도 무조건 404/inconclusive 다."
    missing:
      - "해법 4안 중 택1(사용자 결정): ① VM 에 mock 게이트웨이 상주 ② 실서버 결선(D-27 금지) ③ degraded 판정에서 「한 번도 Ready 인 적 없는 세션」 제외 ④ 알림 정책 조정"
      - "`smoke-relay.sh` INV-9 의 도달성 근거를 relay wss 주문 왕복으로 교체"
human_verification:
  - test: "WinForms ↔ 웹 「한 세션」 동기화 — WinForms 상따창과 `/trading/limit-chaser/[key]` 를 동시에 열고, 웹 스위치 ON → WinForms 무장 배지 확인, WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인"
    expected: "같은 DMA 세션(`ezmesya`)에서 전략·체결·미체결이 즉시 공유된다 (phase goal 의 핵심 문장)"
    why_human: "실 gh-trade 서버 + WinForms 클라이언트가 필요하다. mock 으로 재현 불가이며 D-27 상 사용자 명시 지시가 있어야 실행한다."
  - test: "gh-trade mock 서버 대상 전략 왕복 — `../gh-trade/server/scripts/run-mac.sh` 기동 → relay 로컬 기동 → 브라우저 로그인 → 스냅샷 3프레임 수신 로그 확인 → 상따 등록 → 60 에코 수신 확인"
    expected: "24/21/34 빈 Envelope 요청에 60/61/73 응답이 돌아오고 화면에 반영된다"
    why_human: "로컬 mock 바이너리 실행이 필요하다. E2E 는 relay 스텁 게이트웨이까지만 검증한다."
  - test: "VI 마감알림 — 브라우저 Notification 권한 허용 후 `vi_end_time` 임박 시 알림 표시 확인"
    expected: "마감 10초 전 알림이 이 기기에서만 뜬다 (다른 단말 전파 없음)"
    why_human: "headless Chromium 에서 Notification 실제 표시가 불가능하다. 단위 테스트는 생성자 호출 여부까지만 잠근다."
  - test: "15:40 서버 자동 비활성화(61 Broadcast) — 장 마감 후 VI 페이지에서 `run=false` 반영 + 로그 1줄 확인"
    expected: "서버가 내린 61 Broadcast 가 화면의 가동 램프를 「중지됨」으로 바꾸고 전략 로그에 남는다"
    why_human: "서버 시각에 의존한다."
  - test: "확인 체크 잠금의 영구화 — 실계좌 검증 시 73 정정도 `confirmLocked` 도 오지 않는 행이 실제로 관측되는지 확인"
    expected: "D-10 상 의도된 동작(무응답이 정상 경로)이지만 실측으로 관측 빈도를 확인한다"
    why_human: "서버가 영원히 아무것도 보내지 않는 경우를 mock 으로 재현할 수 없다."
  - test: "relay `/healthz` 503 해법 결정 — 위 gap 4 의 4안 중 어느 것을 채택할지"
    expected: "프로덕션 uptime check 가 녹색으로 돌아오거나, 알림 정책이 이 조건을 정상으로 인정한다"
    why_human: "게이트웨이 상주 여부·D-27 완화·판정 로직 변경·알림 정책은 전부 사용자 결정 사항이다. 실행자가 단독으로 고를 수 없다."
---

# Phase 16: 트레이딩 메뉴(상따·VI·My page) 검증 보고서

**Phase Goal:** gh-trade 상따전략창·VI 종합주문창을 웹앱으로 옮겨(트레이딩 메뉴), 같은 DMA 세션(`ezmesya`)으로 WinForms 와 전략·체결·미체결이 즉시 공유되게 한다. 사이드 메뉴를 종목검색(상승률 상위·테마·관심종목)/트레이딩(상따·VI)/My page 로 재편하고, My page 에 전략 현황·잔고·미체결을 둔다.

**검증 일시:** 2026-09-08T22:28:49Z
**상태:** gaps_found
**재검증:** 아니오 — 최초 검증

---

## 요약

**골격은 실재한다.** 17개 plan 이 선언한 46개 아티팩트가 전부 존재하고, 선언한 `contains` 패턴 37건이 100% 일치하며, 키 링크 17건이 전부 결선돼 있다. 스텁 파일도, 자리표시 카피도, 미해결 부채 마커(`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`)도 phase 16 이 손댄 141개 파일에서 **0건**이다. 자동 검증은 SUMMARY 주장을 그대로 재현했다 — typecheck 13 워크스페이스 exit 0, 단위 1,293 통과(shared 99 / relay 315 / server 251 / webapp 628), Playwright **126 통과 · 0 실패 · 9 skip (2.4분)**. 프로덕션도 실측했다: `dma_orders.origin` 컬럼이 라이브 DB 에 존재하고(PostgREST 200 vs 없는 컬럼 400 대조), server 리비전 `00042-p78` 의 env 이름 17종에 relay 바인딩이 0건이며, webapp 은 Phase 16 사이드바가 라이브다.

**문제는 「있는데 틀린」 네 자리다.** 전부 각 모듈이 자기 규율을 지켰는데 모듈 사이 계약이 어긋난 형태이고, 세 자리가 **돈이 나가는 경로**에 있다.

1. **감사 기록이 운영 2일차부터 빈다 (BLOCKER).** 자동주문 통보의 행 조회가 `order_no` 단독이라, 일별 재사용되는 브로커 주문번호가 어제 행에 매치되면 오늘 자동주문의 insert 가 아예 일어나지 않는다. 16-08 의 must-have 문장이 정확히 이 실패를 막겠다고 선언한 것인데, 그 방어가 자기 조건에서 무력하다. 다중 매치 열화 경로에서는 `order_no` 단독 update 가 **다른 사용자의 행**까지 덮는다.
2. **주문 결과가 서로 바뀔 수 있다.** 통보 상관이 ISIN 하나뿐이라 「취소하고 다시 걸기」에서 신규와 취소의 결과·기록이 교차한다. 살아 있는 매수 주문이 「취소됨」으로 보이면 사용자는 재주문하고, 그게 중복 체결이다.
3. **킬 스위치가 조용히 사라진다.** 소켓이 끊긴 상태에서 「전체 비활성화」를 눌러도 0바이트가 나가고 로그도 오류 표시도 없다. 전략 4종 중 이것만 세션 상태 가드가 없다.
4. **프로덕션 relay 가 지금 503 이다.** 배포는 됐지만 게이트웨이 세션이 없어 전략·주문 wss 경로가 끝까지 살아 있지 않다. 판정 로직 차분은 0 이나, `RelayProvider` 의 루트 승격이 트리거 표면을 앱 전역으로 넓혔다.

1~3 은 코드로 닫을 수 있고, 4 는 사용자 결정이 필요하다.

---

## Goal Achievement

### Observable Truths

**Score: 78/82 truths verified**

#### 16-01 — REQUIREMENTS · relay 생성코드 · checkbox · origin 마이그레이션

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | REQUIREMENTS.md 에 TRADE-01/02/03·NAV-01·MYPAGE-01 5건 등록 + Coverage 40→45 | ✓ VERIFIED | `REQUIREMENTS.md:97-101` 정의 5건, `:173-177` Traceability 5행, `:180` "40→45" |
| 2 | `SetLimitChaser.cancelQtyTrackBaseline()` 접근자 존재 (정본 .fbs 동기화) | ✓ VERIFIED | `set-limit-chaser.ts` 에 `cancelQtyTrackBaseline` + `startObject(45)` 둘 다 존재 |
| 3 | webapp 에 shadcn checkbox 존재 | ✓ VERIFIED | `webapp/src/components/ui/checkbox.tsx` 48줄, Radix 래핑 |
| 4 | `dma_orders.origin` 이 **프로덕션 DB** 에 적용 | ✓ VERIFIED | 라이브 PostgREST 실측 — `select=origin` → `200`, `select=bogus_col_xyz` → `400 42703`. 컬럼 실재 확인 |

#### 16-02 — 테스트 하네스

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | 60/61/64/72/73/56/51 프레임을 FakeGateway 로 주입 가능 | ✓ VERIFIED | `frames.ts` 909줄 `buildSetLimitChaserRespFrame` 외, `fake-gateway.ts` `respondLimitChaserList` 등 5종. relay 315 테스트 통과 |
| 6 | relay spec 다중 파일에서 8090 EADDRINUSE 없음 | ✓ VERIFIED | `playwright.config.ts` `workers: 1` + `fullyParallel: false`. relay 쓰는 spec 5개 포함 E2E 126 통과 |
| 7 | 실서버 IP·실계좌 리터럴 0건 | ✓ VERIFIED | 테스트의 IP 는 RFC1918 (`10.41.1.124` 등) 이고 `order-api.test.ts:67` 이 "실주소를 테스트에 [적지 않는다]" 명시. `ezmesya`·게이트웨이 주소 0건 |

#### 16-03 — shared 계약 + zod 인바운드

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 8 | 전략·주문 메시지가 하나의 타입 계약 | ✓ VERIFIED | `packages/shared/src/relay.ts` `RelayLimitChaser` 외, `protocol.ts:217` `z.discriminatedUnion("t", …)` |
| 9 | 스키마 위반 인바운드는 조용히 무시되지 않고 거부 | ✓ VERIFIED | `protocol.ts:244,251` `logger.warn` → `null` → 호출자 `close(4400)` |
| 10 | 인바운드 주문 판별자가 아웃바운드 `{t:"order"}` 와 비충돌 | ✓ VERIFIED | 인바운드는 `order.new`/`order.cancel`, 아웃바운드는 `order`/`order.result` — 판별자 분리 |

#### 16-04 — msg-type 화이트리스트 + 요청 빌더 7종

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 11 | 전략 요청 7종(10/11/14/21/24/33/34) FlatBuffers 조립 | ✓ VERIFIED | `envelope.ts` `buildSetLimitChaserReq`·`buildSetVITriggerReq`·`buildConfirmVIOrderReq`·`buildDisableStrategiesReq`·`buildGetLimitChaserListReq`·`buildGetVITriggerReq`·`buildGetVIOrderListReq` |
| 12 | 새로 통과하는 수신 msg_type 7종(56/60/61/64/65/72/73) 전부 열거 | ✓ VERIFIED | `msg-type.ts:136-155` `INBOUND_MSG_TYPES` 에 7종 명시. 74/75·27/57 제외 근거도 주석에 있음 |
| 13 | deprecated 슬롯·위치 인자 생성 함수 미사용 | ✓ VERIFIED | `createSetLimitChaser(`/`createSetVITrigger(`/`createDirectOrder(` 호출 0건. `startXxx` + `addXxx` 개별 호출만 |

#### 16-05 — 응답 파서 7종

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 14 | 60/61/64/65/72/73/56 을 JSON 계약으로 파싱 (브라우저에 FlatBuffers 미노출) | ✓ VERIFIED | `parseLimitChaserEcho`·`parseLimitChaserList`·`parseViTrigger`·`parseViOrderList`·`parseViOrderNotice`·`parseDisableStrategiesResp` |
| 15 | bigint 필드가 Number 로 변환되어 팬아웃 루프가 죽지 않음 | ✓ VERIFIED | `envelope.ts:213` `toNum(v: bigint, label)` 단일 통과점 + `:1493` 주석 계약 |
| 16 | 60 에코의 `crud "D"` 가 삭제 신호로 보존 | ✓ VERIFIED | `:1579` `crud: fromWireCrud(t.crud() ?? "")`, `:1635` "삭제 판정은 스위치가 아니라 이 값" |

#### 16-06 — SubscriptionHub 전략 캐시 + Ready 프리페치

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 17 | 세션 단위 전략 캐시 3맵 | ✓ VERIFIED | `subscription-hub.ts:253/261/268` `#limitChasers`·`#viTriggers`·`#viOrders` |
| 18 | Ready 직후 24/21/34 를 한 번 호출해 캐시 시딩 | ✓ VERIFIED | `requestStrategySnapshot()` 이 `buildGetLimitChaserListReq`/`GetVITriggerReq`/`GetVIOrderListReq` 3종 송신. `#onReady` 에서만 호출(`:1007`) |
| 19 | 60 에코의 `crud "D"` 가 캐시에서 삭제로 반영 | ✓ VERIFIED | `:748` `if (item.crud === "D") this.#limitChasers.delete(key)` |
| 20 | 세션 교체 시 전략 캐시 폐기 | ✓ VERIFIED | `#clearCaches(userId)` 가 3맵 전부 prefix 삭제. 호출점 3개(`:302/318/398`) |
| 21 | 전략 팬아웃은 언제나 userId 한 명 대상 | ✓ VERIFIED | `#fanout(userId, msg)` 단일 경로, 전역 브로드캐스트 함수 부재 |

#### 16-07 — fanout 전략 인바운드 + auth 직후 스냅샷

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 22 | 인증만 하면 종목 구독 없이 전략 스냅샷 3프레임 즉시 수신 | ✓ VERIFIED | `fanout.ts:526-529` `lc.snap` + `vi` + `vi.list` 를 auth 직후 `#send` |
| 23 | 전략 4종이 wss 로 올라가 그 사용자의 DMA 세션으로 나감 | ✓ VERIFIED | `:560-610` `lc.set`/`vi.set`/`vi.confirm`/`strategies.disable` 4분기 → `session.send(payload)` |
| 24 | 매핑 없는 사용자의 전략 메시지는 거부 + unauthorized 프레임 | ✓ VERIFIED | `:543-547` `conn.unauthorized` → `logger.warn` + `{t:"state", s:"unauthorized"}` |
| 25 | 전략 `account_no` 는 `session.allowedAccounts` 대조 후에만 송신 | ✓ VERIFIED | `:564/578` `#accountAllowed(conn, session, userId, msg.t, accountNo)` 게이트. 근거는 `session.allowedAccounts` 하나 |

#### 16-08 — 주문 wss 이관 · SymbolMap market · dma_orders insert/origin

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 26 | wss 주문이 5초 상관 후 `order.result` 로 복귀 | ⚠️ **PARTIAL** | 왕복 자체는 실재(`ORDER_RESP_TIMEOUT_MS`, `ws-order.test.ts` 17케이스 통과). **그러나 상관 축이 ISIN 단일**(`order-handler.ts:238`) — 같은 종목 대기 2건이면 먼저 등록된 것이 무조건 정산된다. 「취소하고 다시 걸기」에서 결과·기록 교차. → **gap 2** |
| 27 | 5초 초과는 「실패」가 아니라 「결과 모름」 | ✓ VERIFIED | relay `ORDER_RESP_TIMEOUT_MS` + webapp `order-panel.tsx:370` `res.status === 'timeout'` → `setResult({kind:'unknown'}); setBlocked(true)` |
| 28 | `dma_orders` insert·update 를 relay 가 전담 | ✓ VERIFIED | `server/src/services/dma-orders.ts:22` "★ **쓰기 함수가 없다**" — `insertOrderRequest`·`updateOrderResult` 전부 relay 로 이식. relay `OrderStore.insertRequest`/`enqueueUpdate` |
| 29 | 자동주문 통보는 기존 행을 못 찾으면 새 행으로 insert (감사 기록 미결손) | ✗ **FAILED** | `orders.ts:239-252` `findIdByOrderNo` 가 `order_no` 단독 조회 — `user_id`·날짜 범위 없음. `order_no` 는 일별 재사용, DB 는 일반 인덱스(UNIQUE 아님) → 2일차부터 어제 행 매치 → insert 안 일어남. 다중 매치는 전역 update 로 열화. → **gap 1 (BLOCKER)** |
| 30 | 주문 `account_no` 는 `allowedAccounts` 대조 후에만 송신 | ✓ VERIFIED | `order-handler.ts:471-478` 화이트리스트 대조, 근거는 `session.allowedAccounts` 하나 |

#### 16-09 — RelayProvider 전역 승격 + 구독 ref-count

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 31 | 로그인 상태면 앱 전역 relay wss 1연결 유지 | ✓ VERIFIED | `layout.tsx` AuthProvider 안쪽 RelayProvider, `relay-provider.tsx:227` `useRelayConnection({ enabled: user != null })` |
| 32 | 비로그인 미연결 · 로그아웃 즉시 close | ✓ VERIFIED | 같은 `enabled` 게이트 + `case "reset"` 이 계좌·전략·시세 전량 폐기(`use-relay-socket.ts:322`) |
| 33 | 같은 종목 다중 소비자에도 sub/unsub 는 0→1 · 1→0 에서만 | ✓ VERIFIED | `subscribe`/`unsubscribe` 가 `subRefsRef` count 증감, `entry.count > 0` 이면 조기 반환 |
| 34 | 호가주문 탭이 전역 연결 위에서 회귀 없이 동작 | ✓ VERIFIED | `stock-orderbook-section.tsx:158` `useRelaySubscription`, `orderbook.spec.ts` E2E 통과 (`POST /api/orders` 부재도 `restHits` 로 강제) ※ 다중계좌 결함은 아래 WR-A 참조 (Phase 15 승계) |
| 35 | 전략 프레임 7종이 전역 상태에 반영 | ✓ VERIFIED | `use-relay-socket.ts:391-423` `lc`·`lc.snap`·`vi`·`vi.list`·`vi.notice`·`strategies.disabled` case + `order.result` 는 `rid` Promise 상관 |

#### 16-10 — 주문·취소 wss 전환 + account-panel 공용화

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 36 | 신규 주문·취소가 REST 아닌 wss 로 | ✓ VERIFIED | `order-panel.tsx:359` `sendOrder({kind:'new', …})`, `account-panel.tsx` wss 취소. `orders-api.createOrder` 삭제됨 |
| 37 | 타임아웃은 실패로 렌더되지 않고 제출 버튼이 잠긴 채 미체결 확인 안내 | ✓ VERIFIED | `order-panel.tsx:370-372` + `:355-357` "catch 가 없는 것이 의도" 주석 |
| 38 | 미체결·잔고가 모바일에서 2줄 카드 행으로 리플로우, 3표면 공유 | ✓ VERIFIED | `account-panel.tsx` `.rlist` + `me.spec.ts`/`trading-vi.spec.ts`/`trading-limit-chaser.spec.ts` 390px 케이스 전부 통과 |
| 39 | account-panel 이 계좌 전용 모드로 렌더 (My page 계좌별 반복) | ✓ VERIFIED | `me-client.tsx:170-178` `code` 미전달 + `accounts.map` 반복 |

#### 16-11 — 사이드바 2단 트리 + 3단 전략 목록

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 40 | 홈 / 종목검색(3) / 트레이딩(상따+목록 · VI) / My page / AI 애널리스트 2단 트리 | ✓ VERIFIED | `app-sidebar.tsx:74-93` NAV 상수 + `:300-360` 렌더 |
| 41 | 그룹 소제목은 링크 아님 · 항상 펼침 · 접기 상태 미저장 | ✓ VERIFIED | `GroupHeading` 은 `<li>` + 텍스트, 접기 state 없음 |
| 42 | 3단에 종목명 + 매수/매도 원 아이콘 2개, 클릭 시 편집 페이지 | ✓ VERIFIED | `StrategyItem` → `limitChaserHref(item.key)` + `role="img" aria-label={ioLabel}` 원 2개 |
| 43 | 비로그인 · unauthorized · 미연결이면 트레이딩·My page 미렌더 | ✓ VERIFIED | `useTradingVisible()` — `user == null \|\| status === "unauthorized"` → false. `app-sidebar.test.tsx` 조건부 숨김 4케이스 |
| 44 | 모바일 drawer 가 같은 트리 · 링크 클릭 시 자동 닫힘 | ✓ VERIFIED | `app-shell.tsx:61-87` Sheet 안에 같은 `sidebar` 노드, `data-nav-item` 클릭 위임 → `setSheetOpen(false)` |
| 45 | `/scanner` 라벨이 「상승률 상위」이고 URL 유지 | ✓ VERIFIED | `:79` `{ href: "/scanner", label: "상승률 상위" }`. **프로덕션 HTML 에서도 확인** |
| 46 | 시각 계약은 승인 목업 `16-mypage-sidebar-mockup.html` 정본 | ✓ VERIFIED | 목업 파일 존재 + `sidebar-tree.spec.ts` E2E 통과 |
| 47 | 직접 URL 진입 시 비로그인=로그인 유도, 매핑 없음=DMA 게이트 | ✓ VERIFIED | `dma-gate.tsx` 「DMA 계정이 연결되지 않았어요」 + `auth-guards.spec.ts` E2E 통과 |

#### 16-12 — 상따 폼 조작 규율

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 48 | 스위치 3종은 확인 다이얼로그 없이 즉시 전송 | ✓ VERIFIED | `limit-chaser-form.tsx:305-315` `toggleGate` → `send({t:'lc.set', cfg})` 직행 |
| 49 | 값 변경은 즉시 전송 안 함 — 더티 + 「수정」 액션 바로만 | ✓ VERIFIED | `:290-293` `setField` 주석 "여기서 전송하지 않는다. 디바운스도 타이머도 없다" |
| 50 | 스위치 전송에 그 시점 폼 값(더티 포함) 동반 + 액션 바 상시 고지 | ✓ VERIFIED | `toggleGate` 가 `{...formRef.current, [key]: next}` 전량 전송. `dirty-action-bar.tsx` 보조문 |
| 51 | 매수·매도·취소 게이트 전부 OFF = 삭제(crud "D"), 별도 삭제 버튼 없음 | ✓ VERIFIED | `limit-chaser.ts:182` `crudOf(gates)` 단일 판정점 + 삭제 버튼 부재 |
| 52 | 서버 에코 도착 시 더티 필드도 덮고 액션 바 사라지고 배너 표시 | ✓ VERIFIED | `:335` `useEffect(() => setSubmitting(false), [server])` + `onDirtyCountChange` 소비 |
| 53 | 전송 필드 = 클라 입력 30 + 고정 3, S→C 전용 4필드 미전송 | ✓ VERIFIED | `RelayLimitChaserInput` 이 `sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·`cancelQtyTrackBaseline` Omit (`shared/relay.ts:231-234`), `buildCfg` 가 고정 3 추가 |

#### 16-13 — 상따 페이지 조립

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 54 | 종목·거래소·계좌 · 상태줄 · 호가 10단 · 매수/매도 폼 · 미체결/잔고 · 전략 로그 구성 | ✓ VERIFIED | `limit-chaser-client.tsx` 924줄, `data-slot="limit-chaser-page"` + `strategy-log.tsx` + `orderbook-ladder.tsx` `recentTrades` |
| 55 | ≥1280 3열(460\|250\|250), 390 2열(42%\|58%) | ✓ VERIFIED | `:540` `grid-cols-[42%_minmax(0,1fr)] … min-[1280px]:grid-cols-[460px_minmax(0,1fr)]` + E2E 반응형 케이스 통과 |
| 56 | 종목 선택 시 가격 5칸 상한가 1회 시딩, 이후 서버 에코 우선 | ✓ VERIFIED | `limit-chaser-form.tsx:206` `upperLimit > 0` 일 때만 `seedFromUpperLimit`, 이후 `formFromServer` |
| 57 | 서버 거부(ServerMessage ERROR)가 상태줄·전략 로그 양쪽에 기록 | ✓ VERIFIED | `:322-336` `messages` 소비 → `pushLog` + 상태줄. `trading-limit-chaser.spec.ts` E2E 통과 |
| 58 | 전략 편집 페이지가 전략 키로 진입, 두 스위치 OFF 후 빈 폼 복귀 | ✓ VERIFIED | `/trading/limit-chaser/[key]` 라우트 + `:29` remount 주석 + E2E |
| 59 | 더티 상태 이탈 시 경고 | ✓ VERIFIED | `:92` `LEAVE_WARNING` + `:916` `beforeunload` 리스너 (더티 0 이면 미등록) |
| 60 | 시각 계약은 승인 목업 `16-limit-chaser-mockup.html` 정본 | ✓ VERIFIED | 목업 파일 존재 + E2E 12케이스 통과 |

#### 16-14 — VI 페이지

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 61 | VI 설정은 세션당 1건, 주문가 상한가 고정·KRX 전용 | ✓ VERIFIED | `fanout.ts:579` "`priceType` 은 싣지 않는다 — 상한가(\"U\") 고정이라 조립기가 채운다" |
| 62 | 계좌·금액·상승률은 「수정」으로만 반영, run 유지 | ✓ VERIFIED | `vi-settings-card.tsx:271` `handleModify = submit(run)` + `:74` DIRTY_HINT |
| 63 | 시작/중지는 확인 다이얼로그 · 기본 포커스 취소/닫기 | ✓ VERIFIED | `:618-697` `ViConfirmDialog` + `:639` "기본 포커스 대상(취소/닫기)" `onOpenAutoFocus` 가로채기 |
| 64 | VI 주문 확인 체크 즉시 전송 · `confirm_locked` 행 체크 불가 | ✓ VERIFIED | `vi-order-list.tsx:227` `send({t:'vi.confirm', …})` 직행, `:136-142` `isConfirmable` 이 `disabled` 와 전송 가드 공유 |
| 65 | VI 주문 상태 6종 + 부분체결 파생이 색·형태·텍스트 3중 구분 | ✓ VERIFIED | `vi-order-list.tsx` 배지 매핑 + `vi-order-list.test.tsx` + E2E |
| 66 | 110/119초 데드라인이 진행바+숫자, 20초 미만 색 변화 | ✓ VERIFIED | `VI_DEADLINE_SECONDS = 110`, `role="progressbar"`, E2E 「7. 데드라인 — 20초 경계에서 색·문구가 바뀐다」 통과 |
| 67 | VI 마감알림은 이 기기 전용(localStorage + Notification), 서버 미저장 | ✓ VERIFIED | `vi-alert.ts:131/142` localStorage, `:167-191` `window.Notification`. fetch·api 호출 0건 |
| 68 | 시각 계약은 승인 목업 `16-vi-trigger-mockup.html` 정본 | ✓ VERIFIED | 목업 파일 존재 + `trading-vi.spec.ts` 11케이스 통과 |

#### 16-15 — My page

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 69 | `/me` 가 전략 현황 → 계좌별 미체결 → 잔고 순서로 세로 배치 | ✓ VERIFIED | `me-client.tsx:132-178` `MeStatusBar` → `StrategyStatusCard` → `accounts.map(AccountPanel)` |
| 70 | 계좌 2개 이상이면 선택 UI 없이 계좌별 섹션 세로 반복 · 계좌번호 전체 표시 | ✓ VERIFIED | `accounts.map` + `accountStates.get(acct.accountNo)`. `me.spec.ts` 「계좌 2개 반복」 E2E 통과 |
| 71 | 전략 현황 행이 종목·코드·거래소·계좌번호·상태 배지 표시 + 클릭 시 편집 | ✓ VERIFIED | `strategy-status-card.tsx` + `<Link href={limitChaserHref}>` |
| 72 | 전체 비활성화가 My page 에만 있고 확인 다이얼로그를 거쳐 실제로 전략을 내림 | ⚠️ **PARTIAL** | 버튼·다이얼로그·65 백스톱 실재하고 연결 상태에서 동작(E2E 「전체 비활성화 14 왕복」 통과). **그러나 `send()` 가 소켓 미연결 시 무로그 드롭**(`use-relay-socket.ts:850-854`)이고 킬 스위치만 `status` 가드 없음(`:456`). 단절 중 눌러도 0바이트. → **gap 3** |
| 73 | 전체 비활성화 후 상태는 65 가 아니라 60/61 에코로 갱신 | ✓ VERIFIED | `strategy-status-card.tsx:23` "65 는 **완료 신호로만**" + `ackBaseline`/`awaitingAck` 구조 |

#### 16-16 — REST 주문 경로 제거

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 74 | 주문 경로가 wss 하나뿐 (POST /api/orders · relay 내부 HTTP 주문 라우트 제거) | ✓ VERIFIED | `server/src/routes/orders.ts` 는 `ordersRouter.get` 1개뿐, `order-api.ts` 의 Express 라우트는 `/healthz` 하나. `orderbook.spec.ts` 가 `restHits` 로 부재를 강제 |
| 75 | `GET /api/orders?date=` 조회 라우트는 동작 | ✓ VERIFIED | `routes/orders.ts:38-57` + `app.ts:84` 마운트. smoke INV-11 미인증 401 확인 ※ 브라우저 호출자는 0건 (WR-B) |
| 76 | server 에 relay 결선(RelayClient · RELAY_INTERNAL_URL · RELAY_ORDER_SECRET · ORDER_TIMEOUT_MS) 잔존 없음 | ✓ VERIFIED | `services/relay-client.ts` 파일 부재. 코드 내 언급은 전부 주석. **프로덕션 리비전 `00042-p78` env 17종에 0건** (gcloud 실측) |
| 77 | relay 내부 HTTP 는 `/healthz` 만, `relaySecretGuard` 유지 | ✓ VERIFIED | `order-api.ts:163` `app.use(relaySecretGuard(...))`, `:187` `app.get(HEALTH_PATH, …)` 하나 |

#### 16-17 — a11y · 전체 테스트 · 배포

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 78 | 신규 3표면이 axe 위반 0 으로 통과 | ✓ VERIFIED | `a11y.spec.ts` `/trading/limit-chaser/new`·`/trading/limit-chaser`(390)·`/trading/vi`·`/me` 4케이스 — **직접 실행하여 통과 확인** |
| 79 | 전체 테스트(typecheck · 전 워크스페이스 단위 · E2E 전량) green | ✓ VERIFIED | **직접 재현**: `pnpm typecheck` 13 워크스페이스 exit 0 / 단위 1,293 통과 / Playwright **126 통과 0 실패 9 skip (2.4분)** |
| 80 | relay·server·webapp 재배포 + 프로덕션에서 전략·주문 wss 경로 생존 | ⚠️ **PARTIAL** | 배포는 실측 확인(relay `4b6d792` · server `00042-p78` · webapp 사이드바 라이브). **그러나 relay 공개 `/healthz` 가 지금 503 `{"status":"degraded","dma":false,"sessionCount":1}`** — 게이트웨이 세션 부재로 wss 경로가 끝까지 살아 있지 않다. → **gap 4** |
| 81 | server 리비전에서 RELAY_* · ORDER_TIMEOUT_MS 바인딩 소멸 | ✓ VERIFIED | `gcloud run revisions describe gh-radar-server-00042-p78` env 이름 17종 나열 — 3종 모두 0건 |
| 82 | 실서버·실계좌 검증은 Manual-Only, 이 phase 는 mock 검증 종결 | ✓ VERIFIED | `16-VALIDATION.md` Manual-Only 표 5항목 + 코드·픽스처·주석에 게이트웨이 주소·실계좌 리터럴 0건 |

---

### Required Artifacts

46개 선언 아티팩트 전부 존재하고 선언한 `contains` 패턴 37건이 100% 일치한다. Level 3(결선) 이상에서 문제가 있는 것만 표기한다.

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `relay/src/generated/stock-dma/set-limit-chaser.ts` | 45 슬롯 빌더·접근자 | ✓ VERIFIED | `startObject(45)` + `cancelQtyTrackBaseline` |
| `supabase/migrations/20260908120000_dma_orders_origin.sql` | `dma_orders.origin` | ✓ VERIFIED | **라이브 DB 반영 실측** |
| `relay/src/dma/msg-type.ts` · `envelope.ts` | 화이트리스트 + 빌더 7 + 파서 7 | ✓ VERIFIED | 전부 결선, relay 315 테스트 통과 |
| `relay/src/hub/subscription-hub.ts` | 3맵 + 프리페치 + 7 case | ✓ VERIFIED | |
| `relay/src/ws/fanout.ts` | 전략 4분기 + auth 스냅샷 | ✓ VERIFIED | |
| `relay/src/ws/order-handler.ts` | 5초 상관 + 5단계 | ⚠️ **결함** | 존재·결선 OK. 통보 매칭이 ISIN 단일 축(gap 2) |
| `relay/src/store/orders.ts` | insertRequest + update 큐 + origin | ⚠️ **결함** | 존재·결선 OK. `findIdByOrderNo` 에 사용자·날짜 경계 없음(gap 1) |
| `webapp/src/lib/relay-provider.tsx` | 전역 컨텍스트 + ref-count + sendOrder | ✓ VERIFIED | |
| `webapp/src/components/trading/*` (8종) | 상따·VI·My page 표면 | ✓ VERIFIED | 전부 라우트에 결선 + E2E 커버 |
| `webapp/src/lib/orders-api.ts` | `listOrders` + 오류 판정 유틸 | ⚠️ **ORPHANED** | webapp 전체에서 **임포터 0건**. `listOrders`·`isUnknownOutcome`·`orderErrorCode`·`ORDER_ERROR_CODES` 전부 사용처 0. `GET /api/orders` 의 클라이언트가 없다 (WR-B) |
| `webapp/src/components/trading/surface-placeholder.tsx` | (16-11 자리표시) | ⚠️ **DEAD** | 사용처 0건. deferred-items 에 「다음 quick 에서 삭제」로 기록됨 |
| `webapp/e2e/specs/a11y.spec.ts` | 신규 3표면 a11y | ✓ VERIFIED | 직접 실행 통과 |
| `.planning/STATE.md` · `ROADMAP.md` | Phase 16 완료 기록 | ✓ VERIFIED | ROADMAP 17/17 Complete 2026-09-08 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `e2e/fixtures/relay.ts` | `relay/tests/helpers/fake-gateway.ts` | `LocalRelay.gateway` 위임 | ✓ WIRED | `:655/664/692` |
| `relay/src/ws/protocol.ts` | `packages/shared/src/relay.ts` | `RelayInbound` 판별 유니온 | ✓ WIRED | `:217` |
| `relay/src/dma/envelope.ts` | `generated/stock-dma/set-limit-chaser.ts` | `startSetLimitChaser` + `addXxx` | ✓ WIRED | `:941` |
| `relay/src/dma/envelope.ts` | `packages/shared/src/relay.ts` | `RelayLimitChaser` 반환 | ✓ WIRED | 7개소 |
| `subscription-hub.ts` | `envelope.ts` | `parseLimitChaserEcho`/`parseViTrigger`/`parseViOrderList` | ✓ WIRED | `:620/632/639` |
| `subscription-hub.ts` | `ws/fanout.ts` | `emit("fanout", {userId, msg})` | ✓ WIRED | `#fanout(userId, …)` 5개소 |
| `ws/fanout.ts` | `subscription-hub.ts` | `hub.getLimitChasers`/`getViTrigger`/`getViOrders` | ✓ WIRED | `:526-529` |
| `ws/fanout.ts` | `envelope.ts` | `build*Req` 4종 | ✓ WIRED | `:565/579/593/607` |
| `order-handler.ts` | `store/symbols.ts` | `lookup(isin) → {code, market}` | ✓ WIRED | `:352/487` |
| `order-handler.ts` | `store/orders.ts` | `insertRequest` 로 얻은 id 가 상관 1순위 키 | ✓ WIRED | `:308/503` |
| `stock-orderbook-section.tsx` | `relay-provider.tsx` | `useRelaySubscription({isin, exchange, enabled})` | ✓ WIRED | `:158` |
| `order-panel.tsx` | `relay-provider.tsx` | `sendOrder({t:'order.new'}) → order.result` | ✓ WIRED | `:240/359` |
| `app-sidebar.tsx` | `relay-provider.tsx` | 전역 전략 스냅샷 + 상태 | ✓ WIRED | `:247/268/287` `useRelayContext` |
| `limit-chaser-form.tsx` | `relay-provider.tsx` | `send({t:"lc.set", cfg})` | ✓ WIRED | `:311/322` |
| `limit-chaser-client.tsx` | `relay-provider.tsx` | `useRelaySubscription` + `limitChasers` | ✓ WIRED | `:158/176` |
| `vi-client.tsx` | `relay-provider.tsx` | `send({t:"vi.set"})` / `send({t:"vi.confirm"})` | ⚠️ **PARTIAL** | vi-client 자신은 `sendOrder`·스냅샷만 소비. `vi.set` 은 자식 `vi-settings-card.tsx:252`, `vi.confirm` 은 `vi-order-list.tsx:227` 에서 나간다. **기능적으로는 완전히 결선**돼 있고 E2E 가 왕복을 확인한다 — 선언한 파일 위치만 다르다 |
| `strategy-status-card.tsx` | `relay-provider.tsx` | `send({t:"strategies.disable"})` | ⚠️ **PARTIAL** | `:368` 호출은 실재. **전송 실패 경로가 무처리**(gap 3) |
| `server/src/app.ts` | `routes/orders.ts` | `app.use("/api/orders", ordersRouter)` — GET 만 | ✓ WIRED | `:84` |
| `scripts/deploy-relay.sh` | GCE VM radar-gw | 컨테이너 재배포 후 smoke | ✓ WIRED | 프로덕션 `/healthz` 가 `version:"4b6d792"` 응답 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `app-sidebar.tsx` | `limitChasers`, `viTrigger` | `useRelayContext()` ← `use-relay-socket` `case "lc"/"lc.snap"/"vi"` ← relay 60/61/64 | 예 | ✓ FLOWING |
| `limit-chaser-client.tsx` | `limitChasers`, `accountStates`, `messages`, `quote/tape` | 동상 + `useRelaySubscription` | 예 | ✓ FLOWING |
| `vi-client.tsx` / `vi-order-list.tsx` | `viTrigger`, `viOrders` | `case "vi"/"vi.list"/"vi.notice"` ← relay 61/72/73/56 | 예 | ✓ FLOWING |
| `me-client.tsx` | `accounts`, `accountStates` | `case "acct"` ← relay 66/67 | 예 | ✓ FLOWING |
| `strategy-status-card.tsx` | `limitChasers`, `viTrigger`, `strategiesDisabled` | `case "strategies.disabled"` ← relay 65 | 예 | ✓ FLOWING |
| `order-panel.tsx` | `res` (주문 결과) | `sendOrder` rid 상관 ← relay `order.result` | 예 (단, gap 2 로 **엉뚱한 주문의** 결과가 올 수 있음) | ⚠️ 오귀속 위험 |
| `account-panel.tsx` (호가주문 탭) | `account` | `useRelaySubscription().account` = **마지막 수신 계좌** | 예 (단, 선택 계좌와 불일치 가능) | ⚠️ HOLLOW_PROP (WR-A, Phase 15 승계) |
| `webapp/src/lib/orders-api.ts` | `listOrders` 결과 | — | 소비자 없음 | ✗ DISCONNECTED (WR-B) |
| `dma_orders.origin` | — | relay 가 write, 브라우저 read 경로 없음 (`ORDER_COLS`·`DmaOrderRow` 에 부재) | write-only | ⚠️ 단방향 (WR-C) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 13 워크스페이스 타입 검사 | `pnpm typecheck` | 전 워크스페이스 `Done`, exit 0 | ✓ PASS |
| relay 단위 | `pnpm --filter @gh-radar/relay test` | 17 파일 · **315 통과** | ✓ PASS |
| webapp 단위 | `pnpm --filter @gh-radar/webapp test` | 57 파일 · **628 통과 1 skip** | ✓ PASS |
| server 단위 | `pnpm --filter @gh-radar/server test` | 31 파일 · **251 통과** | ✓ PASS |
| shared 단위 | `pnpm --filter @gh-radar/shared test` | 8 파일 · **99 통과** | ✓ PASS |
| E2E 전량 (a11y 3표면 포함) | `pnpm exec playwright test` | **126 통과 · 0 실패 · 9 skip (2.4분)**, exit 0 | ✓ PASS |
| 프로덕션 `dma_orders.origin` 존재 | PostgREST `select=origin` vs `select=bogus_col_xyz` | `200` vs `400 42703` | ✓ PASS |
| server 리비전 relay env 부재 | `gcloud run revisions describe gh-radar-server-00042-p78` | env 17종, RELAY_*·ORDER_TIMEOUT_MS **0건** | ✓ PASS |
| server 헬스 | `GET /api/health` | `{"status":"ok","version":"99fdf15"}` 200 | ✓ PASS |
| **relay 공개 헬스** | `GET https://dma.jx1.io/healthz` | `{"status":"degraded","vpn":true,"dma":false,"version":"4b6d792","sessionCount":1}` **503** | ✗ **FAIL** |
| webapp 배포 반영 | `GET https://gh-radar-webapp.vercel.app/` HTML | 「상승률 상위」·「종목검색」·「관심종목」·「AI 애널리스트」 검출 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | 이 저장소에는 `scripts/*/tests/probe-*.sh` 규약이 없고 PLAN·SUMMARY 어디에도 probe 선언이 없다 | SKIPPED |

프로브 대신 `scripts/smoke-*.sh` 규약을 쓰며, 그 실행 기록은 `16-VALIDATION.md` §Deployment Verification 에 있다. 위 Behavioral Spot-Checks 가 그 중 핵심 불변식(server env 제거 · relay healthz · webapp 배포 반영)을 **검증자 프로세스에서 직접 재실행**했다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| **TRADE-01** | 16-01·11·12·13·17 | 상따 전략 페이지 — 라우트 2종, 37필드 폼, 스위치 즉시 전송, 전부 OFF=삭제, 값은 「수정」, 호가 10단 + 체결 10건, 미체결/잔고, 전략 로그 | ✓ SATISFIED | Truth 48~60 전부 VERIFIED. `trading-limit-chaser.spec.ts` 12케이스 + `limit-chaser-form.test.tsx` 23케이스 통과 |
| **TRADE-02** | 16-01·11·14·17 | VI 종합주문 페이지 — 세션당 1건, 시작/중지 확인, 주문내역 상태 6종+부분체결, `confirm_locked`, 110/119초, `ConfirmVIOrderReq(33)` | ✓ SATISFIED | Truth 61~68 전부 VERIFIED. `trading-vi.spec.ts` 11케이스 통과 |
| **TRADE-03** | 16-01~10·16·17 | relay 전략 중계 + 주문 wss 이관 — 인바운드 6, Ready 프리페치 24/21/34 + 캐시, auth 직후 스냅샷, 56/60/61/64/65/72/73 파싱·팬아웃, `DirectOrderReq(2)` 5초 상관, `dma_orders` insert/update relay 전담(origin), `POST /api/orders` 제거 | ✗ **BLOCKED** | 인바운드·프리페치·캐시·스냅샷·파서·팬아웃·REST 제거는 전부 VERIFIED. **그러나 「`dma_orders` insert/update 를 relay 가 전담」의 감사 기록 보장이 깨졌고(gap 1) 5초 상관이 오귀속된다(gap 2).** 요구사항 문장의 핵심 절이 「구현됐지만 틀렸다」 |
| **NAV-01** | 16-01·11·17 | 사이드 메뉴 2단 그룹 트리, 기존 URL 유지, 조건부 숨김, 모바일 Sheet 동일 트리 | ✓ SATISFIED | Truth 40~47 전부 VERIFIED. `sidebar-tree.spec.ts`·`auth-guards.spec.ts`·`app-sidebar.test.tsx` 통과. 프로덕션 HTML 실측 |
| **MYPAGE-01** | 16-01·11·15·17 | My page — 전략 현황(상따 목록 + VI + 전체 비활성화 `key=""`) → 계좌별 미체결·잔고 세로 반복, 모바일 2줄 카드 행 | ⚠️ **PARTIAL** | Truth 69~71·73 VERIFIED, `me.spec.ts` 8케이스 통과. **전체 비활성화가 단절 시 무로그 no-op**(gap 3) — 요구사항의 킬 스위치 절이 안전하게 성립하지 않는다 |

**Orphaned requirements:** 없음. REQUIREMENTS.md 가 Phase 16 에 매핑한 ID 는 정확히 이 5건이고 모두 plan frontmatter 에 선언돼 있다.

**참고:** Traceability 표(`REQUIREMENTS.md:173-177`)는 5건 모두 `Pending` 이다. `Complete` 전환은 이 검증 결과 반영 후에 해야 하며, 현재 판정상 TRADE-03 · MYPAGE-01 은 아직 `Complete` 로 올릴 수 없다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `relay/src/store/orders.ts` | 239-252 | 사용자·날짜 경계 없는 조회 + UNIQUE 없는 컬럼 | 🛑 Blocker | 감사 기록 결손 + 테넌트 간 쓰기 (gap 1) |
| `relay/src/ws/order-handler.ts` | 232-245 | 단일 축 매칭 (ISIN) | 🛑 Blocker | 주문 결과·기록 교차 (gap 2) |
| `webapp/src/lib/use-relay-socket.ts` | 850-854 | **무로그 fail-safe** — `if (!ws \|\| readyState !== OPEN) return;` | 🛑 Blocker | 킬 스위치 조용한 소실 (gap 3). 프로젝트 규율 PC-7 / 자동 메모리 「무로그 fail-safe 금지」 정면 위반 |
| `webapp/src/components/stock/stock-orderbook-section.tsx` | 452 | 「선택 계좌」와 「마지막 수신 계좌」 혼선 | ⚠️ Warning | WR-A — 계좌 2개 이상에서 엉뚱한 계좌로 취소 가능. **Phase 15 (`8a96283`) 승계**이며 phase 16 은 신규 3표면만 `accountStates` 로 고쳤다 |
| `webapp/src/lib/orders-api.ts` | 1-127 | 죽은 모듈 (임포터 0건) | ⚠️ Warning | WR-B — 「새로고침 후 목록 복원」이 구현돼 있지 않다. `server/src/errors.ts:62-63` 주석은 사실과 다르다 |
| `server/src/services/dma-orders.ts` | 53-54 | `ORDER_COLS` 에 `origin` 부재 | ⚠️ Warning | WR-C — 마이그레이션이 선언한 목적(「내가 낸 주문」 vs 「전략이 낸 주문」 구분)이 브라우저에 도달하지 못한다 |
| `webapp/src/components/trading/surface-placeholder.tsx` | 전체 | 죽은 코드 (사용처 0건) | ℹ️ Info | 「아직 준비 중인 화면이 있다」는 잘못된 신호. deferred-items 기록됨 |
| `webapp/src/lib/use-relay-socket.ts` | `clockStamp()` | ko-KR locale 버그 (Chromium `0시 57분 16초`) | ℹ️ Info | 호가주문 탭 알림 시각 폭이 흔들린다. deferred-items 기록됨 |
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` | ✓ 없음 | phase 16 이 손댄 141개 파일에서 **0건** |

**Warning 상세(WR-01·02·06·07·08·09 등 나머지 6건)는 `16-REVIEW.md` 를 정본으로 본다.** 이 보고서는 must-have 판정에 직접 걸리는 것만 재확인했다.

### Human Verification Required

#### 1. WinForms ↔ 웹 「한 세션」 동기화

**Test:** WinForms 상따창과 `/trading/limit-chaser/[key]` 를 동시에 열고 → 웹 스위치 ON → WinForms 무장 배지 확인 → WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인
**Expected:** 같은 DMA 세션(`ezmesya`)에서 전략·체결·미체결이 즉시 공유된다
**Why human:** 실 gh-trade 서버 + WinForms 클라이언트 필요. **이것이 phase goal 문장의 핵심 절이며 지금까지 한 번도 실측되지 않았다.** D-27 상 사용자 명시 지시가 있어야 실행한다.

#### 2. gh-trade mock 서버 대상 전략 왕복

**Test:** `../gh-trade/server/scripts/run-mac.sh` 기동 → relay 로컬 기동 → 브라우저 로그인 → 스냅샷 3프레임 수신 로그 확인 → 상따 등록 → 60 에코 수신 확인
**Expected:** 24/21/34 빈 Envelope 요청에 60/61/73 응답이 돌아오고 화면에 반영된다
**Why human:** 로컬 mock 바이너리 실행 필요. E2E 는 relay 의 스텁 게이트웨이까지만 검증한다

#### 3. VI 마감알림 브라우저 Notification

**Test:** Notification 권한 허용 후 `vi_end_time` 임박 시 알림 표시 확인
**Expected:** 마감 10초 전 알림이 이 기기에서만 뜬다
**Why human:** headless Chromium 에서 실제 표시 불가. 단위 테스트는 생성자 호출 여부까지만 잠금

#### 4. 15:40 서버 자동 비활성화(61 Broadcast) 표시

**Test:** 장 마감 후 VI 페이지에서 `run=false` 반영 + 로그 1줄 확인
**Expected:** 서버가 내린 61 Broadcast 가 가동 램프를 「중지됨」으로 바꾸고 전략 로그에 남는다
**Why human:** 서버 시각 의존

#### 5. 확인 체크 잠금의 영구화

**Test:** 실계좌 검증 시 73 정정도 `confirmLocked` 도 오지 않는 행이 실제로 관측되는지 확인
**Expected:** D-10 상 의도된 동작이나 관측 빈도를 실측
**Why human:** 서버 무응답 케이스를 mock 으로 재현 불가

#### 6. relay `/healthz` 503 해법 결정 — **결정 요청**

**Test:** 아래 4안 중 채택안 지정
① VM 에 mock 게이트웨이 상주 / ② 실서버 결선(현 D-27 금지) / ③ degraded 판정에서 「한 번도 Ready 인 적 없는 세션」 제외 / ④ 알림 정책 조정
**Expected:** uptime check 가 녹색으로 돌아오거나 알림 정책이 이 조건을 정상으로 인정한다
**Why human:** 게이트웨이 상주 여부·D-27 완화·판정 로직 변경·알림 정책은 전부 사용자 결정 사항이다. 실행자가 단독으로 고를 수 없다

---

## Gaps Summary

**82개 must-have 중 78개가 검증됐고 4개가 남았다.** 넷 다 「없다」가 아니라 「있는데 틀렸다」이며, 그래서 파일 존재·테스트 green·배포 성공 어느 신호로도 잡히지 않았다.

**gap 1 (BLOCKER) — 감사 기록.** 16-08 은 「자동주문 통보는 기존 행을 못 찾으면 새 행으로 insert 되어 감사 기록이 비지 않는다」를 must-have 로 선언했다. 그 방어의 유일한 근거인 `findIdByOrderNo` 가 `order_no` 단독으로 조회하고, 그 컬럼에는 UNIQUE 제약이 없으며, 브로커 주문번호는 일별 재사용 시퀀스다. 세 사실을 곱하면 **운영 2일차부터 이 방어가 정상 경로에서 무력하다** — 어제 행이 매치되어 오늘 자동주문의 행이 만들어지지 않고, 동시에 어제 행(때로는 **다른 사용자의** 행)이 오늘 값으로 덮인다. 테스트가 이 경계를 못 잡는 이유도 명확하다: `ws-order.test.ts` 는 sink 를 스텁으로 대체해 Supabase 쿼리 자체를 검사 범위 밖에 둔다. 요구사항 TRADE-03 의 「`dma_orders` insert/update 를 relay 가 전담」이 성립하려면 그 전담이 **정확해야** 하므로, 이 phase 의 TRADE-03 은 아직 닫히지 않았다.

**gap 2 — 주문 결과 오귀속.** 통보 상관이 ISIN 하나다. `PendingOrder` 는 `qty` 를 들고 있고 통보는 `noticeType`·`orgOrderNo`·`price`·`quantity` 를 실어 오는데 어느 것도 매칭에 쓰이지 않는다. 「취소하고 다시 걸기」는 호가주문 탭에서 주문 패널과 계좌 패널이 나란히 놓인 이 phase 의 가장 흔한 조작이고, 그 조작에서 5초 창이 겹치면 살아 있는 매수 주문이 「취소됨」으로 표시된다. 사용자가 그 표시를 믿고 재주문하면 중복 체결 — `order-handler.ts` 가 스스로 「최악의 결과」라고 적어 둔 상황이다. Phase 15 에서 이식된 축이지만 16-10 이 같은 화면에 wss 취소를 붙이면서 이 phase 의 계약 안으로 들어왔다.

**gap 3 — 킬 스위치의 침묵.** `send()` 는 전략 4종의 유일한 출구인데 소켓이 닫혀 있으면 로그도 반환값도 없이 사라진다. `lc.set`/`vi.set`/`vi.confirm` 호출부는 전부 `status !== 'ready'` 로 가려져 있어 이 구멍에 닿지 않지만, **전체 비활성화만 그 가드가 없다.** 리듀서가 단절 시 목록을 지우지 않으므로 재접속 중에도 버튼은 활성이고, 누르면 0바이트가 나가고 8초 뒤 `awaitingAck` 만 조용히 내려간다. 사용자는 껐다고 믿고 자리를 뜨고 자동매매는 계속 돈다. 프로젝트 규율 「무로그 fail-safe 금지」(PC-7 / S-5)를 정면으로 위반하는 자리이고 하필 그 대상이 킬 스위치다.

**gap 4 — 프로덕션 wss 경로.** 배포 3종은 실측으로 확인됐다. 그러나 relay 공개 `/healthz` 가 지금 이 순간 503 `degraded, dma:false` 다. 게이트웨이 세션이 Ready 가 아니므로 로그인 사용자는 트레이딩 3표면에서 게이트만 본다. 판정 로직 차분은 0 이고 2026-09-06 에도 같은 구간이 있었으나, 이 phase 가 `RelayProvider` 를 루트 레이아웃으로 올리면서 트리거 표면이 「호가주문 탭」에서 「로그인한 모든 페이지」로 넓어졌다 — 게이트웨이 부재 구간이 길어지고 `gh-radar-relay-down` 발화가 상시화된다. 해법 4안이 전부 사용자 결정이라 실행자가 단독으로 고르지 않았고, 이 검증도 같은 판단이다.

**닫는 순서 제안.** gap 1 → gap 3 → gap 2 → gap 4. gap 1 은 데이터 정합성이자 테넌트 경계라 가장 급하고 DB 마이그레이션이 붙는다. gap 3 은 한 파일 두 곳 수정이라 비용이 가장 작은데 안전 임계도는 가장 높다. gap 2 는 매칭 축 설계 변경이라 테스트를 함께 늘려야 한다. gap 4 는 코드가 아니라 결정이다.

**Phase goal 자체는 어떤가.** 「상따전략창·VI 종합주문창을 웹앱으로 옮긴다」와 「사이드 메뉴 재편 + My page」는 달성됐다 — 화면·라우트·폼·조작 규율·반응형·a11y 가 전부 실재하고 126개 E2E 가 그것을 잠근다. 달성되지 **않은** 절은 「같은 DMA 세션으로 WinForms 와 전략·체결·미체결이 즉시 공유된다」이다. 그 절은 mock 왕복까지만 검증됐고(D-27), 프로덕션에서는 게이트웨이가 없어 지금 살아 있지 않으며, 그 위에 얹힌 주문 기록·상관 경로에 위 3개의 결함이 있다.

---

_Verified: 2026-09-08T22:28:49Z_
_Verifier: Claude (gsd-verifier)_
