---
phase: 16-trading-limit-chaser-vi-my-page
verified: 2026-09-09T03:54:59Z
status: gaps_found
score: 127/133 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 78/82
  gaps_closed:
    - "자동주문 통보의 행 조회·갱신에 사용자·당일 경계가 없다 (gap 1 BLOCKER) — 16-18 이 3축 좁히기 + 부분 UNIQUE 인덱스(프로덕션 실측 확인)로 닫았다"
    - "전체 비활성화(킬 스위치)가 소켓 미연결 시 조용히 사라진다 (gap 3) — 16-19 가 send→boolean·console.error·세션 가드·실패/ack 문구로 닫았다. 감사 중 vi.set 의 두 번째 구멍까지 찾아 막았다"
    - "프로덕션 relay /healthz 가 503 이다 (gap 4) — 16-21 의 everReadyCount 판정 + 16-26 배포(2cb5620)로 200 이 됐다. 본 검증에서 직접 실측 확인"
  gaps_remaining:
    - "주문 통보 상관의 오귀속 (gap 2 잔여) — 후보 2건 이상은 닫혔으나 후보 1건 경로가 열려 있다 (GC-CR-01)"
  regressions:
    - "GC-CR-02 — 좁히지 못한 수동 통보가 존재하지 않는 order_no 행을 갱신해 0행·무로그로 사라진다 (16-18/16-22 가 새로 만든 경로)"
    - "GC-CR-03 — await insertRequest 중 연결이 닫히면 고아 대기·타이머가 남고 실제 나간 주문이 timeout 으로 확정된다"
gaps:
  - truth: "통보로 대기 항목을 하나로 좁히지 못하면 「가장 오래된 것」을 고르지 않고 매칭 실패로 두어 recordUnmatched 로 보낸다 — 잘못 귀속된 기록은 없는 기록보다 나쁘다 (16-22 truth 2 / gap 2)"
    status: failed
    reason: "`narrowPending` 의 첫 줄이 `if (candidates.length <= 1) return candidates[0] ?? null;` 이다(order-handler.ts:864-865). 후보 수집 필터는 `entry.isin === notice.isin` 하나뿐이므로(:340), 후보가 1건이면 통보가 무엇을 실어 왔든 그 대기가 정산된다 — `orgOrderNo` 가 채워진 취소확인이든, 세션 합류로 들어온 남의 통보(notice-status.ts:51 이 그 존재를 명시한다)든 상관없다. 결과는 이 파일이 스스로 「최악의 결과」라고 적은 그 상황이다: 살아 있는 매수 주문이 `{t:\"order.result\", status:\"cancelled\"}` 로 화면에 「취소됨」으로 뜨고(statusOf 의 \"C\"→cancelled), 사용자가 그 표시를 믿고 재주문하면 중복 체결이다. 동시에 `dma_orders` 행에 남의 `order_no` 가 기록된다(finish 의 enqueueUpdate, :749-758). 단위 테스트 `ws-order.test.ts:991-998` (「유일 후보는 축을 보지 않는다」)가 이 동작을 **의도로 못박아** 두었으므로 회귀가 아니라 설계 결함이다. 근거로 든 「구 서버가 축을 비워 보낸다」는 **비어 있는 축을 건너뛸** 이유이지 **통보가 실제로 실어 온 축을 무시할** 이유가 아니다. 후보 2건 이상 경로(원래 gap 2)는 실제로 닫혔다 — 이 갭은 그 인접면이다."
    artifacts:
      - path: "relay/src/ws/order-handler.ts"
        issue: "L864-865 후보 1개 지름길이 모든 상관 축을 건너뛴다. L340 후보 수집 필터는 ISIN 단일 축이다."
      - path: "relay/tests/ws-order.test.ts"
        issue: "L991-998 이 지름길을 「정상 경로 회귀 방지」로 고정한다 — 고칠 때 이 케이스를 함께 뒤집어야 한다."
    missing:
      - "통보가 **실어 온** 강한 축(`orgOrderNo` 비어 있지 않음 · `noticeType` 이 C/M)은 후보 수와 무관하게 하드 필터로 적용 — 비어 있는 축만 건너뛰면 구 서버 호환은 그대로 유지된다"
      - "하드 필터 결과가 0건이면 `null` 을 돌려 아무것도 정산하지 않기 (5초 타임아웃이 진실이다)"
      - "테스트 「유일 후보는 축을 보지 않는다」를 「유일 후보라도 취소확인은 신규 대기를 정산하지 않는다」로 뒤집기"
  - truth: "브라우저가 낸 주문의 수명주기(요청→접수·체결·취소·타임아웃)가 dma_orders 에 결손·오기록 없이 남는다 (phase goal 파생 / TRADE-03 「dma_orders insert/update 를 relay 가 전담」 · 프로젝트 규율 「무로그 fail-safe 금지」)"
    status: failed
    reason: "두 경로가 조용히 기록을 잃는다. ① **수동 통보의 0행 갱신 (GC-CR-02).** 수동 주문의 insert 는 `order_no` 를 싣지 않는다(order-handler.ts:661-681 — 접수 전이라 주문번호를 모른다). `order_no` 는 `finish` 가 정산할 때 채운다(:749-758). 그런데 좁히기에 실패했거나 연결이 이미 닫힌 통보는 `recordUnmatched` 의 manual 분기로 가서 `enqueueUpdate({...patch, userId})` 를 큐에 넣고(:395-403), `selectorOf` 가 이를 `order_no` 셀렉터로 만든다(store/orders.ts:597-609). **그 시점에 그 사용자의 오늘 행 중 `order_no = notice.orderNo` 인 행은 없다.** PostgREST 의 update 는 0행이어도 에러가 아니므로 이 갱신은 아무것도 하지 않고 끝나며, 로그도 없다 — 이 모듈이 머리말에서 「Pitfall 18」이라고 부르며 없애겠다고 선언한 바로 그 침묵이다. 후보 0건 경로(`closeConn` 이후 도착한 통보)는 `candidates.length > 1` 이 아니라 warn 조차 없다. ② **await 중 연결 종료 (GC-CR-03).** `handle` 은 `insertRequest` 를 `await` 하는데(:661-689), 그 사이 `closeConn` 이 돌면 `state.pending` 을 비우고 `conns`·`byUser` 에서 연결을 지운다(:816-835). `await` 재개 후 코드는 **연결 생존을 다시 확인하지 않고** 타이머를 걸고(:770) 고아 `ConnState` 에 대기를 등록하고(:786) **주문을 실제로 게이트웨이에 보낸다**(:789). 통보 상관은 `byUser`→`conns` 를 훑으므로 이 대기는 영원히 후보가 되지 않고, 5초 뒤 고아 타이머가 `enqueueUpdate({orderRowId, status:\"timeout\"})` 을 확정한다 — **실제로 접수·체결된 주문이 감사 기록에 `timeout` 으로 남고 정정 경로가 없다.**"
    artifacts:
      - path: "relay/src/ws/order-handler.ts"
        issue: "L395-403 manual 분기가 존재하지 않는 order_no 행을 무로그로 갱신한다. L661-689 `await insertRequest` 직후 연결 생존 재확인이 없다. L770·L786·L789 가 고아 상태에 타이머·대기를 걸고 주문을 송신한다."
      - path: "relay/src/dma/subscription-hub.ts"
        issue: "L690-703 `#onOrderNotice` 가 통보를 stdout 에 남기지 않아 D-24 의 「두 번째 감사 사본」이 이 경로에 없다."
    missing:
      - "manual 분기도 `findIdByOrderNo(userId, orderNo)` 로 좁혀 `orderRowId` 로 갱신하고, 행이 없으면 통보 원문을 `logger.error` 로 남기기 (S-5)"
      - "`await insertRequest` 직후 `conns.get(conn) !== state` 재확인 — 죽었으면 조립·송신 **이전에** 중단하고 `status:\"rejected\"` 로 기록"
      - "연결 종료·좁히기 실패로 도착한 통보에 대한 relay 테스트 (현재 ㉑ 은 좁히기 실패까지만 고정하고 그 뒤 0행 갱신은 관찰하지 않는다)"
  - truth: "닫힌 14건과 남은 항목이 VALIDATION·STATE·ROADMAP·REQUIREMENTS 에 정직하게 반영된다 (16-26 truth 5)"
    status: partial
    reason: "서술은 정직하다 — TRADE-03 을 Pending 으로 남긴 근거(`everReadyCount:0`)와 INV-9 미실행 사실이 정확히 적혀 있고 과장이 없다. 그러나 **REQUIREMENTS.md 안에서 두 표현이 서로 어긋난다.** Traceability 표(L173·174·176)는 TRADE-01·TRADE-02·NAV-01 을 Complete 로 재판정했는데, 같은 파일 요구사항 목록의 체크박스(L97·98·100)는 여전히 `- [ ]` 다. 이 파일의 관례는 체크박스 = Complete 다(RELAY-01·RELAY-03 은 `- [x]`, Pending 인 RELAY-02 는 `- [ ]`, 그리고 같은 phase 의 MYPAGE-01 은 `- [x]` 로 갱신돼 있다). 세 요구사항의 상태를 파일 안에서 두 곳이 다르게 말한다."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "L97 TRADE-01 · L98 TRADE-02 · L100 NAV-01 이 `- [ ]` 인데 L173·174·176 은 Complete. MYPAGE-01(L101)만 `- [x]` 로 갱신됐다."
    missing:
      - "TRADE-01 · TRADE-02 · NAV-01 요구사항 목록 체크박스를 `- [x]` 로 갱신 (TRADE-03 은 Pending 이므로 `- [ ]` 유지가 맞다)"
human_verification:
  - test: "WinForms ↔ 웹 「한 세션」 동기화 — WinForms 상따창과 `/trading/limit-chaser/[key]` 를 동시에 열고, 웹 스위치 ON → WinForms 무장 배지 확인, WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인"
    expected: "같은 DMA 세션(`ezmesya`)에서 전략·체결·미체결이 즉시 공유된다 — phase goal 의 핵심 문장이다"
    why_human: "실 gh-trade 서버 + WinForms 클라이언트가 필요하다. mock 으로 재현 불가이며 D-27 상 사용자 명시 지시가 있어야 실행한다. 프로덕션 `/healthz` 의 `everReadyCount:0` 은 이 경로가 **한 번도 실행된 적이 없음**을 뜻한다"
  - test: "smoke `INV-9` 첫 실행 — 로그인 브라우저 localStorage 의 `access_token` 을 `SMOKE_AUTH_TOKEN` 으로 넣고 `bash scripts/smoke-relay.sh` 실행"
    expected: "`reachable` (주문 핸들러가 거부로 답한다). 프로브는 화이트리스트 밖 계좌번호 + 미해석 ISIN 을 쓰므로 실계좌에 주문이 나가지 않는다"
    why_human: "16-21 이 재작성한 프로브가 **한 번도 실행된 적이 없다.** 토큰은 사용자 브라우저에서만 얻을 수 있고 약 1시간 만료다"
  - test: "gh-trade mock 서버 대상 전략 왕복 — `../gh-trade/server/scripts/run-mac.sh` 기동 → relay 로컬 기동 → 브라우저 로그인 → 스냅샷 3프레임 수신 로그 확인 → 상따 등록 → 60 에코 수신 확인"
    expected: "24/21/34 빈 Envelope 요청에 60/61/73 응답이 돌아오고 화면에 반영된다"
    why_human: "로컬 mock 바이너리 실행이 필요하다. E2E 는 relay 스텁 게이트웨이까지만 검증한다"
  - test: "VI 마감알림 — 브라우저 Notification 권한 허용 후 `vi_end_time` 임박 시 알림 표시 확인"
    expected: "마감 10초 전 알림이 이 기기에서만 뜬다 (다른 단말 전파 없음)"
    why_human: "headless Chromium 에서 Notification 실제 표시가 불가능하다. 단위 테스트는 생성자 호출 여부까지만 잠근다"
  - test: "15:40 서버 자동 비활성화(61 Broadcast) — 장 마감 후 VI 페이지에서 `run=false` 반영 + 로그 1줄 확인"
    expected: "서버가 내린 61 Broadcast 가 화면의 가동 램프를 「중지됨」으로 바꾸고 전략 로그에 남는다"
    why_human: "서버 시각에 의존한다"
  - test: "확인 체크 잠금의 영구화 — 실계좌 검증 시 73 정정도 `confirmLocked` 도 오지 않는 행이 실제로 관측되는지 확인"
    expected: "D-10 상 의도된 동작(무응답이 정상 경로)이지만 실측으로 관측 빈도를 확인한다"
    why_human: "서버가 영원히 아무것도 보내지 않는 경우를 mock 으로 재현할 수 없다"
---

# Phase 16: 트레이딩 메뉴(상따·VI·My page) 검증 보고서 — 갭 클로징 후 재검증

**Phase Goal:** gh-trade 상따전략창·VI 종합주문창을 웹앱으로 옮겨(트레이딩 메뉴), 같은 DMA 세션(`ezmesya`)으로 WinForms 와 전략·체결·미체결이 즉시 공유되게 한다. 사이드 메뉴를 종목검색(상승률 상위·테마·관심종목)/트레이딩(상따·VI)/My page 로 재편하고, My page 에 전략 현황·잔고·미체결을 둔다.

**검증 일시:** 2026-09-09T03:54:59Z
**HEAD:** `8207a47` (배포본 `2cb5620` + 문서 3커밋)
**상태:** gaps_found
**재검증:** 예 — 1차 검증(2026-09-08T22:28:49Z, 78/82 · 갭 4건) 이후 갭 클로징 9개 plan(16-18~16-26) 실행 결과에 대한 재검증

---

## 이 phase 가 지나온 경로 (이력 보존)

| 단계 | 결과 |
|---|---|
| 1차 실행 (16-01~16-17) | 17 plan 완료 |
| 1차 검증 | **78/82** · 갭 4건 · TRADE-03 BLOCKED |
| 1차 코드 리뷰 (`16-REVIEW.md`) | Critical 4 · Warning 9 · Info 7 (`CR-`/`WR-`/`IN-`) |
| 갭 클로징 (16-18~16-26) | 14건 종결 (G1~G4 · CR-01 · WR-01~09) · 배포 `2cb5620` |
| 2차 코드 리뷰 (`16-REVIEW.md` §갭 클로징 재리뷰) | **Critical 3 · Warning 12 · Info 4** (`GC-` 네임스페이스) — 전부 relay 주문 상관 경로 |
| **본 재검증** | **127/133** · 갭 3건(BLOCKER 2 · WARNING 1) · TRADE-03 Pending 유지 |

---

## 요약

**1차 갭 4건 중 3건은 실제로 닫혔다.** SUMMARY 주장을 믿지 않고 코드·라이브 DB·프로덕션 엔드포인트를 직접 쳤고, 세 건 모두 1차 증거가 나왔다.

- **gap 1 (BLOCKER · 감사 기록 결손 + 테넌트 간 쓰기)** — `supabaseOrderLookupSink` 가 `(user_id, order_no, KST 당일)` 3축으로 좁고(`orders.ts:314-331`), `order_no` 셀렉터 update 도 같은 3축을 건다(`:246-250`), `userId` 없는 `order_no` 갱신은 `selectorOf` 가 `null` 을 돌려 드롭 로그를 남긴다(`:456`). 경계 테스트는 **sink 를 스텁으로 바꾸지 않고** 가짜 `SupabaseClient` 가 필터를 실제 적용해 「영향 받은 행」을 계산한다(`order-store.test.ts:436-560`) — 1차 갭이 통과했던 사각지대가 구조적으로 닫혔다. 그리고 **라이브 DB 를 직접 덤프해 부분 UNIQUE 인덱스의 실재를 확인했다**(아래 실측 ①).
- **gap 3 (킬 스위치 무로그 드롭)** — `send()` 가 `boolean` 을 돌려주고 드롭 시 `console.error` 를 남기며(`use-relay-socket.ts:863-876`), 킬 스위치 `disabled` 에 `status !== "ready"` 가 붙었고(`strategy-status-card.tsx:460`), 전송 실패 시 `awaitingAck` 를 세우지 않고 문구를 띄우며(`:354-365`), 8초 ack 타임아웃도 「반영을 확인하지 못했어요」를 남긴다(`:333-346`). 감사 과정에서 `vi.set` 의 「수정」 경로에 같은 구멍이 **하나 더** 있었음을 찾아 막았다(`vi-settings-card.tsx:306` `if (locked) return;`) — 1차 리뷰의 「킬 스위치만 예외」는 사실이 아니었고 SUMMARY 가 그것을 정정해 적었다.
- **gap 4 (프로덕션 relay 503)** — 판정이 `sessionsOk = everReadyCount === 0 || readyCount > 0` 로 바뀌었고(`order-api.ts:223`), 「Ready 였다가 죽은 세션」은 여전히 degraded 이며(`order-api.test.ts:227-243`), 회선(`vpn`) 신호는 세션과 독립이다(`:274-283`). **본 검증에서 프로덕션을 직접 쳐 200 을 받았다**(아래 실측 ②).

**gap 2 는 선언한 범위까지만 닫혔다.** 후보 2건 이상에서 `narrowPending` 이 `orgOrderNo`→`noticeType`→`quantity`→`price` 로 좁히고 폴백 없이 미정산으로 두는 것은 코드·테스트로 확인된다. 그런데 **후보가 1건이면 함수 첫 줄이 모든 축을 건너뛴다**(`order-handler.ts:864-865`). 후보 수집 필터가 ISIN 하나뿐이므로, 살아 있는 매수 주문 하나가 대기 중일 때 도착한 취소확인·남의 통보가 그 대기를 정산한다 — 이 파일이 스스로 「최악의 결과」라고 적어 둔 상황(살아 있는 주문이 「취소됨」으로 표시 → 사용자 재주문 → 중복 체결)이 그대로 재현된다. 단위 테스트가 이 동작을 **의도로 못박고** 있으므로 실수가 아니라 설계 결함이다.

**그리고 갭 클로징이 두 개의 새 침묵을 만들었다.** 둘 다 「기록이 조용히 사라지거나 틀리게 확정되는」 형태다 — 이 phase 가 `Pitfall 18` · `D-24` · `S-5` 로 반복해 금지한 바로 그 부류다.

- **GC-CR-02** — 좁히지 못한 **수동** 통보가 `order_no` 셀렉터로 갱신되는데, 수동 insert 는 `order_no` 를 싣지 않으므로 그 시점에 매치되는 행이 없다. PostgREST 는 0행 update 를 에러로 보지 않고, 이 경로에는 로그가 없다.
- **GC-CR-03** — `await insertRequest` 중에 연결이 닫히면 코드가 그것을 확인하지 않고 타이머·대기를 고아 상태에 걸고 **주문을 실제로 보낸다**. 그 주문은 영원히 상관 후보가 되지 않고 5초 뒤 `status:"timeout"` 으로 확정된다.

**phase goal 의 핵심 문장은 여전히 미검증이다.** 「같은 DMA 세션으로 WinForms 와 즉시 공유」는 프로덕션에서 한 번도 실행된 적이 없다 — 실측한 `everReadyCount: 0` 이 그 증거다. TRADE-03 을 Pending 으로 남긴 판단은 정확하다. 다만 이것은 갭 클로징의 실패가 아니라 D-27(사용자 명시 지시 없이 실서버 결선 금지)의 결과이며, 문서가 이를 과장 없이 적었다.

---

## 본 검증이 직접 취한 실측 (SUMMARY 인용이 아님)

### ① 프로덕션 부분 UNIQUE 인덱스 — 라이브 DB 덤프 원문

```
$ npx supabase db dump --linked --schema public | grep dma_orders
CREATE UNIQUE INDEX "idx_dma_orders_user_order_no_kst_day" ON "public"."dma_orders"
  USING "btree" ("user_id", "order_no", ((("created_at" AT TIME ZONE 'Asia/Seoul'::"text"))::"date"))
  WHERE ("order_no" IS NOT NULL);
COMMENT ON INDEX "public"."idx_dma_orders_user_order_no_kst_day" IS '한 사용자의 하루 안에서 order_no 는 유일하다. …';
CONSTRAINT "dma_orders_origin_check" CHECK (("origin" = ANY (ARRAY['manual','limit_chaser','vi'])))
```

16-18 의 「프로덕션 적용」 주장은 참이다. `origin` 컬럼의 CHECK 3종도 라이브에 실재한다(16-01·16-20 계약의 근거).

### ② 프로덕션 relay `/healthz`

```
$ curl -s -o - -w "%{http_code}" https://dma.jx1.io/healthz
200
{"status":"ok","vpn":true,"dma":true,"version":"2cb5620","sessionCount":2,"everReadyCount":0}
```

배포본 `2cb5620` 이 프로덕션에서 돌고 있고, **세션이 2건 붙어 있는 상태에서** 200 이다 — 「배포 직후 세션 0 인 200」이 아니므로 16-26 truth 3 의 증거 기준을 만족한다. 동시에 `everReadyCount: 0` 은 **Ready 에 도달한 DMA 세션이 프로덕션에 한 건도 없었다**는 뜻이며, TRADE-03 Pending 판정의 1차 근거다.

### ③ 부채 마커 스캔

`relay/src` · `webapp/src` · `server/src` · `packages/shared/src` 전량에서 `TBD`/`FIXME`/`XXX` **0건**, `TODO`/`HACK` **0건**. (검출된 `XXXX` 1건은 `limit-chaser.test.ts:99` 의 테스트용 ISIN 접미사, `PLACEHOLDER` 는 Phase 7/8 표면의 em-dash 상수로 이 phase 무관.)

---

## Goal Achievement

### Observable Truths

**Score: 127/133** (plan frontmatter 131 + goal 파생 2)

#### 1차 갭 4건 — 재판정

| # | Truth (1차 갭) | 1차 | 지금 | 증거 |
|---|---|---|---|---|
| G1 | 자동주문 통보는 기존 행을 못 찾으면 새 행으로 insert 되어 감사 기록이 비지 않는다 | ✗ FAILED | ✓ **VERIFIED** | `orders.ts:314-331` 3축 조회 · `:246-250` 3축 update · `:456` userId 없는 갱신 드롭 로그 · `ensureRow`/`autoInsertRow` insert 분기 · 라이브 DB 인덱스(실측 ①) |
| G2 | 브라우저가 wss 로 보낸 주문이 relay 에서 5초 상관 후 order.result 로 돌아온다 | ⚠️ PARTIAL | ⚠️ **PARTIAL** | 후보 2건 이상 다축 상관은 실재(`order-handler.ts:868-891`, 테스트 ⑳㉑). **후보 1건 지름길(:864-865)이 남아 오귀속 경로가 열려 있다** → 갭 1 |
| G3 | 전체 비활성화가 확인 다이얼로그를 거쳐 실제로 전략을 내린다 | ⚠️ PARTIAL | ✓ **VERIFIED** | `use-relay-socket.ts:863-876` · `strategy-status-card.tsx:354·460` · `vi-settings-card.tsx:306` |
| G4 | relay·server·webapp 이 재배포되어 프로덕션에서 전략·주문 wss 경로가 살아 있다 | ⚠️ PARTIAL | ✓ **VERIFIED** | 실측 ② — `version:2cb5620` · `status:ok` · 200 |

#### 갭 클로징 plan 별 must-have (16-18 ~ 16-26, 49건)

**16-18 — dma_orders 사용자·당일 경계 + in-flight 가드 + 부분 UNIQUE 인덱스 (6/6)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | 같은 `order_no` 가 타 사용자·타 날짜에 있어도 내 오늘 행만 찾고, 못 찾으면 insert | ✓ VERIFIED | `orders.ts:314-331` `.eq(user_id).eq(order_no).gte/lt(created_at).order(desc).limit(1)` · `ensureRow` → `autoInsertRow` |
| 2 | `order_no` 셀렉터 update 가 `user_id`·KST 당일로 좁혀져 남의 행을 덮을 수 없다 | ✓ VERIFIED | `orders.ts:246-250` 세 축 전부 |
| 3 | `userId` 없는 `order_no` 갱신은 큐에 실리지 않고 error 로그 + 드롭 카운터 | ✓ VERIFIED | `selectorOf`(`:597-609`) 가 `null` → `:450-457` 드롭 로그 「userId 없는 order_no 갱신 포함」 |
| 4 | 같은 자동주문의 접수(A)·체결(E) 가 겹쳐도 행은 1건 | ✓ VERIFIED | `order-handler.ts` `inflight` Map(`${userId}\|${orderNo}`) 재사용. ※ `orderNo === ""` 키 충돌은 별개 문제(GC-WR-02, 아래 경고) |
| 5 | DB 부분 UNIQUE 인덱스가 프로덕션에 적용 | ✓ VERIFIED | **실측 ① — 라이브 덤프 원문** |
| 6 | 경계 테스트가 sink 를 스텁으로 바꾸지 않고 적용 필터를 검사 | ✓ VERIFIED | `order-store.test.ts:436-560` — `fakeDmaOrders` 가 필터를 **실제 적용**해 `matched` 계산, 픽스처 3행(타사용자 오늘·내 어제·내 오늘) |

**16-19 — send() boolean 계약 + 킬 스위치 세션 가드 (5/5)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 7 | 미연결 `send()` 가 로그를 남기고 false 반환 | ✓ VERIFIED | `use-relay-socket.ts:863-876` `console.error(\`[relay] 소켓 미연결 … (t=${msg.t})\`)` + 본문 미기재 |
| 8 | 「전체 비활성화」가 `status !== 'ready'` 면 비활성 | ✓ VERIFIED | `strategy-status-card.tsx:460` |
| 9 | 전송 실패 시 `awaitingAck` 안 서고 「연결이 끊겨…」 표시 | ✓ VERIFIED | `:354-365` `if (!send(...)) { setSendError(...); return; }` |
| 10 | 8초 ack 타임아웃이 「반영을 확인하지 못했어요」를 남긴다 | ✓ VERIFIED | `:333-346` |
| 11 | 나머지 4개 호출부가 전부 세션 준비 상태로 가려져 있음이 확인된다 | ✓ VERIFIED (정정) | 감사 결과 3곳은 실재, **`vi.set` 1곳은 부재였고 이 plan 이 세웠다**(`vi-settings-card.tsx:306`). SUMMARY 가 「킬 스위치만 예외」가 거짓이었음을 정직하게 기록 |

**16-20 — 죽은 orders-api 삭제 + origin 읽기 노출 (5/5)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 12 | 임포터 0건 죽은 주문 모듈이 남아 있지 않다 | ✓ VERIFIED | `webapp/src/lib/orders-api.ts` 부재, 참조 0건 |
| 13 | `server/src/errors.ts` 의 거짓 문장이 정정 | ✓ VERIFIED | `errors.ts:68` 「16-20 에서 …를 삭제했다」 + 판정 정본 명시 |
| 14 | `GET /api/orders` 응답에 `origin` 이 실린다 | ✓ VERIFIED | `dma-orders.ts:60` ORDER_COLS 에 `origin` · `:81` `origin: r.origin` |
| 15 | `DmaOrderRow.origin` 이 3종 열거로 shared 에 | ✓ VERIFIED | `shared/relay.ts:880` `DmaOrderOrigin` · `:913` · 라이브 CHECK 3종(실측 ①) |
| 16 | 주문 이력 표는 범위 밖(D-20)이라는 근거가 남는다 | ✓ VERIFIED | `errors.ts:68` 주석 + 16-20-SUMMARY §91 |

**16-21 — /healthz never-Ready 제외 + INV-9 재작성 (4/5, 1 UNCERTAIN)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 17 | 한 번도 Ready 인 적 없는 환경에서 `/healthz` 가 ok 200 | ✓ VERIFIED | `order-api.ts:223` + `order-api.test.ts:254-265` + **실측 ②** |
| 18 | Ready 였다가 죽은 세션은 여전히 degraded 503 | ✓ VERIFIED | `order-api.test.ts:227-243` (`sessionCount:2, readyCount:0, everReadyCount:2` → degraded) |
| 19 | 회선(VPN) 실측 신호는 세션과 무관하게 유지 | ✓ VERIFIED | `order-api.test.ts:274-283` (`vpn:false` → degraded, `everReadyCount:0` 이어도) |
| 20 | 판정 변경 근거가 코드 주석·테스트 이름에 남는다 | ✓ VERIFIED | `order-api.ts:177-210` ★ 2026-09-09 문단 |
| 21 | `smoke-relay.sh` INV-9 가 relay wss 주문 왕복으로 도달성을 잰다 | ? **UNCERTAIN** | 프로브는 실재하고 4갈래 판정 로직도 있다(`:317-468`). **그러나 `SMOKE_AUTH_TOKEN` 이 없어 재작성 후 한 번도 실행된 적이 없다** — 「돌렸는데 SKIP」이 아니라 「못 돌렸다」이다. 게다가 `:468` 이 `printf 'inconclusive'` 를 **덧붙여** FAIL 을 SKIP 으로 강등시킬 수 있다(GC-WR-11) |

**16-22 — 통보 다축 상관 + 사용자 스코프 중복 가드 (5/6)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 22 | 같은 종목 신규+취소가 5초 안에 겹쳐도 각자의 통보로 정산 | ✓ VERIFIED | `narrowPending` ①~④ 축(`:868-891`) + 테스트 ⑳ (`ws-order.test.ts:794`) |
| 23 | 좁히지 못하면 「가장 오래된 것」 폴백 없이 `recordUnmatched` 로 | ✗ **FAILED** | 후보 2건 이상은 참(테스트 ㉑ `:839`, `:1048`). **후보 1건은 축을 보지 않고 정산한다**(`:864-865`) — 테스트 `:991-998` 이 그것을 의도로 고정. → **갭 1** |
| 24 | 탭 A 의 통보가 탭 B 의 대기를 정산하지 않는다 | ✓ VERIFIED | `:336-342` 후보를 `byUser` 전 연결에서 모은 뒤 좁힌다 · 테스트 ⑰ |
| 25 | 중복 주문 판정이 사용자 스코프 | ✓ VERIFIED | `userDupKeys` Map(`:253-262`) + 테스트 ㉓ (`:902`) |
| 26 | `rid` 상관은 여전히 연결 스코프 | ✓ VERIFIED | `conns` Map 유지, 전역 rid 맵 부재 |
| 27 | `PendingOrder.qty` 가 실제 매칭에 쓰인다 | ✓ VERIFIED | `:886` `refine((p) => p.qty === n.quantity)` |

**16-23 — 계좌축 소비자 정리 + ISIN 역매핑 공용 훅 (6/6)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 28 | 호가주문 탭 계좌 패널이 **선택 계좌**를 그린다 | ✓ VERIFIED | `stock-orderbook-section.tsx:170-171` `accountStates.get(selectedAccountNo)` → `AccountPanel account={selectedAccount}` (`:463`) |
| 29 | `✕ 취소` 가 그 행이 속한 계좌로 나간다 | ✓ VERIFIED | `account-panel.tsx:257` `accountNo: selectedAccountNo` (같은 `selectedAccountNo` 가 표시 축) |
| 30 | `sellableQty` 도 선택 계좌 보유에서 계산 | ✓ VERIFIED | `stock-orderbook-section.tsx:265-267` |
| 31 | `account`(마지막 수신 계좌)가 계약에서 사라진다 | ✓ VERIFIED | `use-relay-socket.ts:250` 「계약에서 **제거됐다**」 + 소비자 계약에 필드 부재 |
| 32 | ISIN 역매핑 사본 3개가 `lib/` 훅 하나로 합쳐지고 `accountStates` 전체를 훑는다 | ✓ VERIFIED | `isin-labels.ts:44` `useIsinLabels()` · `app-sidebar.tsx:21,265` |
| 33 | 역매핑이 `useMemo` 로 감싸진다 | ✓ VERIFIED | `isin-labels.ts:47` |

**16-24 — VI 주문금액 상한 3층 + flushNow (5/5)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 34 | VI 주문금액이 표현 범위를 넘으면 거부 | ✓ VERIFIED | `envelope.ts:1033-1036` |
| 35 | 상한이 zod·envelope·UI 세 층에 같은 값 | ✓ VERIFIED | `shared/relay.ts:258` 단일 정본 → `protocol.ts:164` `.max()` · `envelope.ts:1033` · `vi-settings-card.tsx:97` |
| 36 | 확인 다이얼로그 금액 = 실제 나가는 금액 | ✓ VERIFIED | UI 가 같은 상수를 만원 단위로 환산, 조립 단계 무변환 |
| 37 | 종료의 `flushNow()` 가 진행 중 플러시와 겹쳐도 비우고 반환 | ✓ VERIFIED | `orders.ts:519-526` `while (#current !== null) await #current` · 테스트 ⑮ (`order-store.test.ts:230`) · `index.ts:202` `await orderStore.flushNow()` |
| 38 | 재큐잉분(재시도 1회)까지 비운 뒤 반환 | ✓ VERIFIED | `ORDER_FLUSH_MAX_ROUNDS` 루프 + 테스트 ⑯ (`:273`) |

**16-25 — lc.set 시장구분 소유권 relay 이전 + 무장 차단 (6/6)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 39 | 상따 전략 시장구분을 relay 가 ISIN 으로 푼다 | ✓ VERIFIED | `fanout.ts:579` `#strategyMarket` → `:772` `#symbols.lookup(isin)` |
| 40 | 브라우저의 `KOSDAQ ? 'Q' : 'K'` 추정이 사라진다 | ✓ VERIFIED | `shared/relay.ts:229` 「market 은 브라우저가 싣지 않는다」 · `limit-chaser-client.tsx:854` 「`market` 을 싣지 않는다」 · zod 스키마에서 필드 제거 |
| 41 | ISIN 을 못 풀면 거부 + 사유 프레임 | ✓ VERIFIED | `fanout.ts:761-781` `rejectFrame` (※ 삭제까지 막는 부작용은 GC-WR-04 경고) |
| 42 | 발주가 0·산출 수량 0 이면 매수 게이트를 켤 수 없다 | ✓ VERIFIED | `limit-chaser-form.tsx:343` `canArmBuy` → `gateBlocked` → `toggleGate:394` |
| 43 | relay 도 `buyEnabled && (price===0 \|\| qty===0)` 를 거부 | ✓ VERIFIED | `fanout.ts:802-804` (※ 매도·한방 축 누락은 GC-WR-05 경고) |
| 44 | 시장구분 미상 종목은 `isin === null` 과 같은 취급으로 선택 차단 | ✓ VERIFIED | `limit-chaser-client.tsx:784-785` `isPickable` = `isin !== null && ORDERABLE_MARKETS.includes(market)` · `:847,849,872` |

**16-26 — 전량 스위트 + 배포 + 문서 (4/5)**

| # | Truth | Status | Evidence |
|---|---|---|---|
| 45 | 전체 스위트가 갭 수정 후에도 green | ✓ VERIFIED | typecheck 13 워크스페이스 exit 0 · `typecheck:tests` exit 0 · `pnpm -r test` 1,970 pass / 1 skip / 6 todo (189 파일) · `pnpm build` exit 0 |
| 46 | relay·server·webapp 3종이 갭 수정본으로 재배포 | ✓ VERIFIED | 실측 ② `version:"2cb5620"` |
| 47 | 세션이 붙은 상태에서 `/healthz` 200 | ✓ VERIFIED | 실측 ② `sessionCount:2, everReadyCount:0, 200` — 「배포 직후 세션 0」이 아니다 |
| 48 | INV-9 통과 또는 SKIP 사유가 `SMOKE_AUTH_TOKEN` 미설정임이 기록 | ✓ VERIFIED | smoke PASS 12/FAIL 0/SKIP 1, SKIP 사유 명시 · `deferred-items.md:122-142` 가 「돌렸는데 SKIP 이 아니라 못 돌렸다」로 정확히 기록 |
| 49 | 닫힌 14건·남은 항목이 4개 문서에 정직하게 반영 | ⚠️ **PARTIAL** | 서술은 정직하고 과장이 없다. **그러나 REQUIREMENTS.md 체크박스(L97·98·100)가 Traceability 표(L173·174·176)와 어긋난다** → **갭 3** |

#### phase goal 파생 truth (ROADMAP 에 Success Criteria 배열이 없어 목표에서 역산)

| # | Truth | Status | Evidence |
|---|---|---|---|
| G-A | 브라우저가 낸 주문의 수명주기가 `dma_orders` 에 결손·오기록 없이 남는다 | ✗ **FAILED** | GC-CR-02(수동 통보 0행 무로그 갱신) + GC-CR-03(고아 대기 → 실제 나간 주문이 `timeout` 확정) → **갭 2** |
| G-B | 같은 DMA 세션(`ezmesya`)으로 WinForms 와 전략·체결·미체결이 즉시 공유된다 | ? **UNCERTAIN** | 프로덕션 `everReadyCount: 0` — **이 경로가 한 번도 실행된 적이 없다.** D-27 상 실서버 결선은 사용자 명시 지시 사항. 인간 검증 #1 |

#### 1차 검증에서 VERIFIED 였던 78건 — 회귀 점검

갭 클로징 9개 plan 이 손댄 표면(`use-relay-socket` · `relay-provider` · `strategy-status-card` · `limit-chaser-form` · `limit-chaser-client` · `vi-settings-card` · `vi-order-list` · `stock-orderbook-section` · `app-sidebar` · `orders.ts` · `order-handler.ts` · `fanout.ts` · `protocol.ts` · `envelope.ts` · `order-api.ts` · `session.ts` · `session-manager.ts` · `shared/relay.ts` · `server/dma-orders.ts` · `errors.ts` · `smoke-relay.sh`)을 직접 열어 확인했고, 전량 스위트가 green 이다. 회귀 **0건**. 특히:

- 1차 truth 36 「`orders-api.createOrder` 삭제됨」 → 16-20 이 모듈 전체를 지워 더 강해졌다.
- 1차 truth 34 「호가주문 탭 회귀 없음」 → 16-23 이 계좌축을 고쳤고 webapp 652 테스트 green.
- 1차 truth 48~52 (상따 폼 조작 규율) → 16-25 가 `market` 을 빼고 무장 가드를 추가했으나 스위치 즉시 전송 · 값은 수정 버튼 · 전 게이트 OFF = 삭제 규율은 그대로다.

---

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `ws/order-handler.ts` | `store/orders.ts` | `findIdByOrderNo(userId, orderNo)` | ✓ WIRED | `ensureRow` 가 `userId` 를 실어 호출 |
| `store/orders.ts` | Supabase `dma_orders` | `user_id` 필터가 붙은 select/update | ✓ WIRED | `:246-250`, `:314-331` |
| `strategy-status-card.tsx` | `relay-provider.tsx` | `if (!send(...))` 반환값 분기 | ✓ WIRED | `:354` |
| `relay-provider.tsx` | `use-relay-socket.ts` | `RelayInbound → boolean` | ✓ WIRED | `:215`, `:262` `send: (msg: RelayInbound) => boolean` |
| `services/dma-orders.ts` | `shared/relay.ts` | `mapOrder → DmaOrderRow.origin` | ✓ WIRED | `:81` `origin: r.origin` |
| `order/order-api.ts` | `dma/session-manager.ts` | `stats().everReadyCount` | ✓ WIRED | `:223` |
| `dma/session-manager.ts` | `dma/session.ts` | `entry.session.hasBeenReady` | ✓ WIRED | `:215` |
| `ws/order-handler.ts` | `dma/envelope.ts` | `noticeType`·`orgOrderNo`·`quantity` 를 매칭 축으로 소비 | ⚠️ PARTIAL | 축은 소비되지만 **후보 1건에서는 소비되지 않는다**(:864-865) |
| `ws/protocol.ts` | `shared/relay.ts` | `z.max(MAX_VI_ORDER_AMOUNT_KRW)` | ✓ WIRED | `:164` |
| `index.ts` | `store/orders.ts` | 종료 절차 `await orderStore.flushNow()` | ✓ WIRED | `:202` |
| `ws/fanout.ts` | `store/symbols.ts` | `symbols.lookup(cfg.isin) → market` | ✓ WIRED | `:772` |
| `stock-orderbook-section.tsx` | `relay-provider.tsx` | `accountStates.get(selectedAccountNo)` | ✓ WIRED | `:171` |
| `app-sidebar.tsx` | `lib/isin-labels.ts` | `useIsinLabels()` | ✓ WIRED | `:21`, `:265` |
| `scripts/deploy-relay.sh` | GCE VM `radar-gw` | 재배포 후 `/healthz` | ✓ WIRED | 실측 ② `version:2cb5620` |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| 프로덕션 relay healthz | `curl -s -w "%{http_code}" https://dma.jx1.io/healthz` | `200 {"status":"ok",…,"version":"2cb5620","sessionCount":2,"everReadyCount":0}` | ✓ PASS |
| 프로덕션 부분 UNIQUE 인덱스 실재 | `npx supabase db dump --linked --schema public \| grep idx_dma_orders` | `CREATE UNIQUE INDEX "idx_dma_orders_user_order_no_kst_day" … WHERE (order_no IS NOT NULL)` | ✓ PASS |
| 프로덕션 `dma_orders.origin` CHECK | 같은 덤프 | `CHECK (origin = ANY (ARRAY['manual','limit_chaser','vi']))` | ✓ PASS |
| 부채 마커 0건 | `grep -rn "TBD\|FIXME\|XXX\|TODO\|HACK"` (4 워크스페이스 src) | 0건 (테스트용 `XXXX` 접미사 1건 제외) | ✓ PASS |
| 전량 스위트 | typecheck / `typecheck:tests` / `pnpm -r test` / `pnpm build` | exit 0 · 1,970 pass / 1 skip / 6 todo | ✓ PASS (오케스트레이터 실측) |
| relay 주문 왕복 도달성 (INV-9) | `SMOKE_AUTH_TOKEN=… bash scripts/smoke-relay.sh` | 미실행 — 토큰 부재 | ? **SKIP** → 인간 검증 #2 |
| WinForms ↔ 웹 세션 공유 | — | 실행 불가 (실서버·D-27) | ? **SKIP** → 인간 검증 #1 |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| `scripts/*/tests/probe-*.sh` | `find scripts -path '*/tests/probe-*.sh'` | 0건 — 이 프로젝트는 probe 관례를 쓰지 않는다 | N/A |
| `scripts/smoke-relay.sh` | 오케스트레이터 실행 | PASS 12 / FAIL 0 / **SKIP 1 (INV-9)** | ⚠️ 부분 |
| `scripts/smoke-server.sh` | 오케스트레이터 실행 | PASS 15 / FAIL 0 / SKIP 0 | ✓ PASS |

> smoke 2종은 프로덕션 엔드포인트를 치므로 본 검증에서 중복 실행하지 않고 오케스트레이터 실측을 인용했다. 다만 그 결과의 **핵심 한 칸(INV-9)이 SKIP** 이며, 그 프로브는 재작성 후 한 번도 실행된 적이 없다.

---

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| **TRADE-01** (상따 전략 페이지) | 16-01·02·11·12·13·17·23·25·26 | ✓ SATISFIED | 1차 truth 48~60 VERIFIED + 16-25 무장 규율. 프로덕션 `2cb5620` 배포. ※ REQUIREMENTS.md 체크박스 미갱신(갭 3) |
| **TRADE-02** (VI 종합주문) | 16-01·02·11·14·17·24·26 | ✓ SATISFIED | 1차 truth 61~68 VERIFIED + 16-24 상한 3층. ※ 체크박스 미갱신(갭 3) |
| **TRADE-03** (relay 전략 중계 + 주문 wss 이관) | 16-01~10·16·17·18·19·20·21·22·23·24·25·26 | ✗ **BLOCKED** | 코드·단위·E2E 층위는 대부분 닫혔고 gap 1 도 닫혔다. **그러나** ① 프로덕션에서 이 경로가 한 번도 실행된 적 없음(`everReadyCount:0`, `DMA_HOST` 는 뜨지 않은 로컬 mock) ② 주문 상관에 오귀속·무로그 결손 3건(갭 1·2)이 남아 있다. REQUIREMENTS.md 의 Pending 판정이 정확하다 |
| **NAV-01** (사이드 메뉴 2단 트리) | 16-01·09·11·17·23·26 | ✓ SATISFIED | 1차 truth 40~47 VERIFIED · 프로덕션 HTML 실측 · 16-23 이 `useIsinLabels` 로 다계좌 3단 목록 교정. ※ 체크박스 미갱신(갭 3) |
| **MYPAGE-01** (My page) | 16-01·10·11·15·17·19·23·26 | ✓ SATISFIED | 1차 truth 69~73 + 16-19 가 gap 3 종결. REQUIREMENTS.md `- [x]` + Traceability Complete 일치 |

**Orphaned requirements:** 없음. REQUIREMENTS.md 가 Phase 16 에 매핑한 5개 ID 가 전부 plan frontmatter 에 선언돼 있다.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `relay/src/ws/order-handler.ts` | 864-865 | 상관 축을 건너뛰는 조기 반환 | 🛑 **Blocker** | 살아 있는 주문이 「취소됨」으로 정산 → 재주문 → 중복 체결 (갭 1) |
| `relay/src/ws/order-handler.ts` | 395-403 | 존재하지 않는 행에 대한 무로그 0행 update | 🛑 **Blocker** | 접수·체결 기록 소실 — 이 파일이 금지 선언한 Pitfall 18 (갭 2) |
| `relay/src/ws/order-handler.ts` | 661-689 / 770 / 786 / 789 | `await` 후 상태 재확인 없음 (TOCTOU) | 🛑 **Blocker** | 고아 대기·타이머 + 실제 나간 주문이 `timeout` 확정 (갭 2) |
| `relay/src/ws/order-handler.ts` | 367 | `.catch` 없는 `void` 비동기 호출 | ⚠️ Warning | `index.ts:220` 의 `unhandledRejection` → **프로세스 종료** → 전 사용자 세션 절단 (GC-WR-01) |
| `relay/src/ws/order-handler.ts` | 435 | 빈 키(`${userId}\|`)의 inflight 병합 | ⚠️ Warning | 서로 다른 자동주문 거부가 한 행에 겹쳐 쓰임 (GC-WR-02) |
| `relay/src/ws/order-handler.ts` | 874-889 | 신뢰 가능한 축(`sideTrusted`/`side`)을 쓰지 않음 | ⚠️ Warning | 매수/매도 동시 대기가 둘 다 「결과 모름」 (GC-WR-03) |
| `relay/src/ws/order-handler.ts` | 215-218 | 취소 dup 키에 `orgOrderNo` 없음 | ⚠️ Warning | 동일 가격·수량 미체결 2건 연속 취소가 최대 5초 차단 — 급락 국면 자산 위험 (GC-WR-10) |
| `relay/src/ws/fanout.ts` | 579, 761-790 | `crud` 무관 ISIN 해석 강제 | ⚠️ Warning | 상장폐지·마스터 미로딩 종목의 전략을 **내릴 수 없다** (GC-WR-04) |
| `relay/src/ws/fanout.ts` | 796-812 | 마지막 관문이 첫 관문보다 느슨 | ⚠️ Warning | `sellWatchQty === 0` · 한방 게이트가 서버에서 통과 (GC-WR-05) |
| `relay/src/store/orders.ts` | 269-298, 239-260 | `23505` 미처리 | ⚠️ Warning | 새 UNIQUE 인덱스 위반이 「기록 불가」로 열화 — 경주가 「두 벌」에서 「소실」로 바뀌었을 뿐 (GC-WR-08) |
| `relay/src/order/order-api.ts` | 223 | 인메모리 래치에 의존한 장애 판정 | ⚠️ Warning | relay 재시작 후 게이트웨이 장애가 영원히 `ok/200` (GC-WR-07) — gap 4 해법의 부작용 |
| `webapp/.../vi-order-list.tsx` | 230-233 | `send()` 반환값 미확인 + 낙관 반영 | ⚠️ Warning | 나가지 않은 `vi.confirm` 에 잠금이 걸려 행이 영구 회색 (GC-WR-06) |
| `webapp/.../limit-chaser-form.tsx` | 405-415 / 주석 26 | 주석이 사실과 다름 (`handleSubmit` 이 `gateBlocked` 미독) | ⚠️ Warning | 「수정」이 relay 에 통째로 거부되고 사유는 일반 거부 한 줄 (GC-WR-09) |
| `webapp/.../limit-chaser-form.tsx` | 113-118 | 안내 문구가 가장 흔한 원인을 잘못 짚음 | ℹ️ Info | 사용자가 엉뚱한 곳(재접속)을 만짐 (GC-WR-12) |
| `scripts/smoke-relay.sh` | 465-468 | 토큰 argv 노출 + 판정 문자열 이어붙임 | ⚠️ Warning | `ps` 노출 + FAIL 이 SKIP 으로 강등 (GC-WR-11) — 이 검사가 3갈래인 이유를 무너뜨린다 |
| `.planning/REQUIREMENTS.md` | 97·98·100 vs 173·174·176 | 같은 파일 안 두 표현 불일치 | ⚠️ Warning | 세 요구사항의 상태를 두 곳이 다르게 말한다 (갭 3) |

> **부채 마커(`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`)는 0건**이다. 위 항목은 전부 코드 구조·계약 결함이지 미완성 표시가 아니다.
> **Info 6건(IN-02~IN-07)** 과 **GC-IN-01~04** 는 `deferred-items.md` 가 이미 범위 밖으로 명시 기록했다 — 새 갭으로 세지 않는다.

---

### 반증(Disconfirmation) 패스

1. **부분적으로만 충족된 요구사항:** TRADE-03. 「`dma_orders` insert/update 를 relay 가 전담」은 구현돼 있으나 **전담이 정확할 때만** 성립하고, 수동 통보 0행 경로(GC-CR-02)와 고아 대기 경로(GC-CR-03)에서 정확하지 않다.
2. **통과하지만 서술한 동작을 실제로 검사하지 않는 테스트:** `ws-order.test.ts:991-998` 「후보가 없으면 null, 하나면 축이 어긋나도 그것이다」. 이 케이스는 「정상 경로 회귀 방지」를 표방하지만 실제로 잠그는 것은 **오귀속 허용**이다. 같은 파일의 ㉑ 도 좁히기 실패까지만 고정하고 그 뒤 `recordUnmatched` 가 실제로 무엇을 하는지(0행 갱신)는 관찰하지 않는다.
3. **테스트 커버리지가 없는 에러 경로:** `await insertRequest` 진행 중 `closeConn` 이 도는 경합. `ws-order.test.ts` 에 이 순서를 재현하는 케이스가 없고, `order-store.test.ts` 의 `insertGate` 는 insert 경주만 재현한다.
4. **DEVIATION 재해석:** 16-19 SUMMARY 가 must-have #5 를 「⚠️ 정정」으로 기록했다 — 계획의 전제(「킬 스위치만 예외」)가 거짓이었고 `vi.set` 에 구멍이 하나 더 있었다. 이것은 must-have 미달이 아니라 **더 강한 충족**이므로 VERIFIED 로 판정했다. 반대로 16-22 의 must-have #2 는 SUMMARY 가 충족으로 적었으나 코드가 그 문장의 원칙(「잘못 귀속된 기록은 없는 기록보다 나쁘다」)을 후보 1건 경로에서 어기므로 FAILED 로 판정했다.

---

### Deferred Items

Phase 16 은 ROADMAP 의 **마지막 phase** 다. 뒤에 오는 phase 가 없으므로 이번 갭을 넘길 곳이 없다 — 전부 실제 갭이다. (`deferred-items.md` 가 기록한 Info 6건 · UI 후속 3건은 phase 범위 밖으로 이미 확정된 항목이며 must-have 가 아니다.)

---

### Human Verification Required

#### 1. WinForms ↔ 웹 「한 세션」 동기화 — phase goal 의 핵심 문장

**Test:** WinForms 상따창과 `/trading/limit-chaser/[key]` 를 동시에 열고, 웹 스위치 ON → WinForms 무장 배지 확인, WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인
**Expected:** 같은 DMA 세션(`ezmesya`)에서 전략·체결·미체결이 즉시 공유된다
**Why human:** 실 gh-trade 서버 + WinForms 클라이언트가 필요하고 D-27 상 사용자 명시 지시가 있어야 실행한다. 프로덕션 `everReadyCount:0` 은 이 경로가 **한 번도 실행된 적이 없음**을 뜻한다 — 추론으로 메울 수 없다

#### 2. smoke `INV-9` 첫 실행

**Test:**
```bash
GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co \
SMOKE_AUTH_TOKEN='<브라우저 localStorage 의 access_token>' bash scripts/smoke-relay.sh
```
**Expected:** `reachable` — 주문 핸들러가 **거부**로 답한다. 화이트리스트 밖 계좌번호 + 미해석 ISIN 을 쓰므로 실계좌에 주문이 나가지 않는다
**Why human:** 토큰은 로그인 브라우저에서만 얻을 수 있고 약 1시간 만료다. 16-21 이 재작성한 프로브가 아직 **한 번도 실행되지 않았다** — 「돌렸는데 SKIP」과 섞지 말 것. (실행 전에 GC-WR-11 의 `printf 'inconclusive'` 덧붙임 버그를 먼저 고치는 편이 좋다. 안 고치면 FAIL 이 SKIP 으로 보인다.)

#### 3. gh-trade mock 서버 대상 전략 왕복

**Test:** `../gh-trade/server/scripts/run-mac.sh` 기동 → relay 로컬 기동 → 브라우저 로그인 → 스냅샷 3프레임 수신 로그 확인 → 상따 등록 → 60 에코 수신 확인
**Expected:** 24/21/34 빈 Envelope 요청에 60/61/73 응답이 돌아오고 화면에 반영된다
**Why human:** 로컬 mock 바이너리 실행이 필요하다. E2E 는 relay 스텁 게이트웨이까지만 검증한다

#### 4. VI 마감알림 실환경

**Test:** 브라우저 Notification 권한 허용 후 `vi_end_time` 임박 시 알림 표시 확인
**Expected:** 마감 10초 전 알림이 이 기기에서만 뜬다
**Why human:** headless Chromium 에서 Notification 실제 표시가 불가능하다

#### 5. 15:40 서버 자동 비활성화(61 Broadcast)

**Test:** 장 마감 후 VI 페이지에서 `run=false` 반영 + 로그 1줄 확인
**Expected:** 서버가 내린 61 Broadcast 가 가동 램프를 「중지됨」으로 바꾼다
**Why human:** 서버 시각에 의존한다

#### 6. 확인 체크 잠금의 영구화

**Test:** 실계좌 검증 시 73 정정도 `confirmLocked` 도 오지 않는 행이 실제로 관측되는지 확인
**Expected:** D-10 상 의도된 동작이지만 실측으로 관측 빈도를 확인한다
**Why human:** 서버가 영원히 아무것도 보내지 않는 경우를 mock 으로 재현할 수 없다

---

## Gaps Summary

**갭 3건. 두 건은 BLOCKER 이고 둘 다 relay 주문 상관 경로에 있다 — 돈이 나가는 자리다.**

**갭 1 (BLOCKER · GC-CR-01) — 후보 1개면 상관 축을 통째로 건너뛴다.**
16-22 는 「좁히지 못하면 정산하지 않는다」를 세웠고 후보 2건 이상에서는 그것이 지켜진다. 그런데 함수 첫 줄이 `candidates.length <= 1` 을 지름길로 빼놓았고, 후보 수집 필터는 ISIN 하나뿐이다. 그래서 대기가 1건일 때는 취소확인이든 세션 합류로 들어온 남의 통보든 그 대기를 정산한다. 화면에는 살아 있는 매수 주문이 「취소됨」으로 뜨고, `dma_orders` 에는 남의 주문번호가 박힌다. **1차 갭 2 를 만든 것과 똑같은 실패 모양이 인접면에 남아 있다.** 단위 테스트가 이것을 「정상 경로 회귀 방지」로 못박아 두었으니, 고칠 때 그 케이스를 함께 뒤집어야 한다. 수정 방향은 명확하다 — 통보가 **실어 온** 축만 하드 필터로 걸고 비어 있는 축은 건너뛴다. 그러면 구 서버 호환(축을 비워 보내는 게이트웨이)은 그대로 유지된다.

**갭 2 (BLOCKER · GC-CR-02 + GC-CR-03) — 기록이 조용히 사라지거나 틀리게 확정된다.**
갭 클로징이 새로 만든 두 경로다. ① 수동 통보가 좁히기에 실패하거나 연결 종료 후 도착하면 `order_no` 셀렉터로 갱신되는데, 수동 insert 는 `order_no` 를 싣지 않으므로 매치되는 행이 없고 PostgREST 는 0행을 에러로 보지 않으며 이 경로에 로그가 없다. ② `await insertRequest` 중에 사용자가 탭을 닫으면 코드가 그것을 확인하지 않고 고아 상태에 타이머·대기를 걸고 **주문을 실제로 보낸다** — 그 주문은 영원히 상관 후보가 되지 않고 5초 뒤 `timeout` 으로 확정되며 정정 경로가 없다. 두 경로 모두 이 phase 가 `Pitfall 18`·`D-24`·`S-5`(「무로그 fail-safe 금지」)로 반복 금지한 부류다. 수정은 각각 한 자리다: manual 분기도 `findIdByOrderNo` 를 거치고 행이 없으면 통보 원문을 `logger.error` 로 남기기, 그리고 `await` 직후 `conns.get(conn) !== state` 재확인 후 **보내기 전에** 중단하기.

**갭 3 (WARNING) — REQUIREMENTS.md 가 자기 자신과 어긋난다.**
16-26 이 Traceability 표에서 TRADE-01·TRADE-02·NAV-01 을 Complete 로 재판정했는데 같은 파일의 요구사항 목록 체크박스는 `- [ ]` 로 남아 있다. 이 파일의 관례는 체크박스 = Complete 이고(RELAY-01/03 은 `[x]`, Pending 인 RELAY-02 는 `[ ]`, 같은 phase 의 MYPAGE-01 은 `[x]`), 서술 자체는 정직하므로 기계적 누락이다. 체크박스 3개면 끝난다.

**갭이 아닌 것 — 명확히 해 둔다.**
- **gap 1·3·4 는 진짜로 닫혔다.** 코드를 읽었고, 라이브 DB 를 덤프해 인덱스를 봤고, 프로덕션 엔드포인트를 직접 쳤다. 특히 16-18 의 경계 테스트는 「필터를 불렀다」가 아니라 「필터가 실제로 무엇을 걸렀다」를 단언하므로 1차 갭이 통과했던 사각지대가 구조적으로 닫혔다.
- **TRADE-03 Pending 은 갭 클로징의 실패가 아니다.** D-27 이 실서버 결선을 사용자 명시 지시 사항으로 두었고, 문서가 「mock·단위 검증만으로 Complete 로 올리지 않는다」를 명시했다. 이 절제는 정확하고, RELAY-02 와 같은 기준이다.
- **`everReadyCount` 판정 완화(GC-WR-07)는 gap 4 해법 ③ 을 사용자가 고른 결과다.** 다만 그 래치가 프로세스 메모리라 relay 가 한 번만 재시작하면 진짜 장애도 초록이 된다 — 「생성 후 N분 경과 + 미Ready」 카운터를 함께 넣어야 예전 규칙이 잡던 사례를 잃지 않는다.
- **Warning 12건 · Info 4건 중 위에 갭으로 올리지 않은 것들**은 must-have 문장을 어기지 않는다. 다만 GC-WR-01(프로세스 종료), GC-WR-10(급락 국면 일괄 취소 차단), GC-WR-11(FAIL→SKIP 강등)은 다음 라운드 우선순위로 둘 만하다.

**진행 판단.** 갭 1·2 는 relay 주문 경로(TRADE-03)에 국한되고, 그 요구사항은 이미 Pending 이다. 프로덕션에서 그 경로가 아직 한 프레임도 나른 적이 없으므로 **지금 당장 실사용자에게 손실이 발생하고 있지는 않다.** 그러나 실서버 결선(인간 검증 #1) 이전에 반드시 닫혀야 한다 — 결선하는 순간 이 세 경로가 전부 실계좌 위에서 돈다.

---

_Verified: 2026-09-09T03:54:59Z_
_Verifier: Claude (gsd-verifier) — 재검증 (갭 클로징 16-18~16-26 이후)_
