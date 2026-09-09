---
phase: 16-trading-limit-chaser-vi-my-page
verified: 2026-09-09T00:00:00Z
status: gaps_found
score: 162/165 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 127/133
  gaps_closed:
    - "갭 1 (GC-CR-01 구 네임스페이스) — narrowPending 의 「후보 1건」 지름길이 실제로 제거됐다. order-handler.ts:1009-1027 이 하드 필터(0건이면 null)로 재작성됐고, 비어 있는 축은 건너뛰어 구 게이트웨이 호환이 유지된다. 코드에서 직접 확인함."
    - "갭 2① (GC-CR-02) — 좁히지 못한 수동 통보가 findIdByOrderNo 로 행 존재를 확인한 뒤에만 갱신을 큐에 넣는다(order-handler.ts:449-493). 행이 없으면 큐에 넣지 않고 통보 원문을 logger.error 로 stdout 에 남긴다(D-24 두 번째 감사 사본). 코드에서 직접 확인함."
    - "갭 2② (GC-CR-03) — await insertRequest 직후·게이트웨이 송신 이전에 conns.get(conn) !== state 재확인이 들어갔다(order-handler.ts:805-827). 죽은 연결이면 orderRowId 를 status:\"rejected\" 로 갱신하고 송신 자체를 중단한다 — 고아 대기·타이머 경로가 존재하지 않는다. 코드에서 직접 확인함."
    - "갭 3 — REQUIREMENTS.md 체크박스(L97·98·100)가 Traceability 표(L173·174·176)와 이제 일치한다: TRADE-01·TRADE-02·NAV-01 `- [x]`, TRADE-03 `- [ ]`. 파일에서 직접 확인함."
  gaps_remaining: []
  regressions:
    - "R2-CR-01 — fanout.ts#isTeardown 이 클라이언트가 보낸 crud:\"D\" 를 게이트 상태와 무관하게 그대로 믿는다. crud:\"D\" + buyEnabled:true(+ 가격·수량 유효) 조합이 시장 해석 엄격성(T-16-42)과 무장 가드(T-16-43)를 동시에 우회한다. GC-WR-04(16-29) 가 만든 결함."
    - "R2-CR-02 — session-manager.ts 의 stalledCount 가 NO_RETRY_STATES(session_rejected/unauthorized)를 구분하지 않는다. 자격증명이 거부된 세션 1개가 탭을 연 채로 5분을 넘기면 게이트웨이가 완전히 정상이어도 /healthz 가 영구 503 이 된다. GC-WR-07(16-30) 이 만든 결함."
    - "R2-CR-03 — orders.ts:294/361/395 세 곳이 PostgREST error 원문을 그대로 로그에 싣는다. CHECK(23514)/NOT NULL(23502)/FK(23503) 위반의 details 에 Failing row 전체(계좌번호·주문번호 포함)가 담겨 Cloud Logging 에 유출된다. 16-28 이 23505 만 예외 처리하고 인접 경로를 그대로 둔 결과 — T-16-45/D-19 계좌번호 마스킹 규율 위반."
gaps:
  - truth: "무장(발주가·수량이 유효한) 상따 전략 설정은 시장 해석 엄격성(T-16-42)과 무장 가드(T-16-43)를 반드시 거친 뒤에만 게이트웨이로 나간다 — 클라이언트가 주장하는 crud 값이 아니라 실제 게이트 상태가 판정 근거다 (16-29 must-have 3 파생 / R2-CR-01)"
    status: failed
    reason: "`#isTeardown(cfg)` 의 첫 줄이 `if (cfg.crud === \"D\") return true;` 다(relay/src/ws/fanout.ts:793-798). `crud` 는 인바운드 필드이고(`relay/src/ws/protocol.ts:109` `z.enum([\"C\",\"D\"])`), `RelayLimitChaserInput`(`packages/shared/src/relay.ts:235-243`)이 Omit 하지 않아 브라우저(또는 임의 wss 클라이언트)가 정한다. 계약 원문(`packages/shared/src/relay.ts:136-141`)은 삭제의 정본이 게이트이지 crud 가 아니라고 못박고 있는데, 이 함수는 그 반대로 crud 를 단독 근거로 받아들인다. 그 결과 `{crud:\"D\", buyEnabled:true, buyOrderPrice:70000, buyOrderQty:10, isin:<마스터에 없는 ISIN>}` 같은 프레임 하나가 `#teardownMarket`(못 풀면 폴백 \"K\", `fanout.ts:824`)과 `#strategyArmable` 첫 줄의 조기 반환(`fanout.ts:903` `if (this.#isTeardown(cfg)) return true;`)을 동시에 통과해, 시장이 틀리고 무장까지 걸린 반복 발주 설정이 게이트웨이로 나간다. 기존 테스트 ⑰-e(`relay/tests/fanout.test.ts:729`)가 `crud:\"D\"` 를 보내지만 `lcInput()` 기본값이 `buyEnabled:true`·유효 가격·유효 수량이라 이 시나리오를 그대로 통과시키면서도 그 위험성(무장 상태로 나간다는 사실)을 단언하지 않는다 — 회귀 잠금이 없다."
    artifacts:
      - path: "relay/src/ws/fanout.ts"
        issue: "L793-798 #isTeardown 이 cfg.crud === \"D\" 를 게이트 상태 확인 없이 단독 근거로 받아들인다. L903 #strategyArmable 첫 줄이 그 판정에 의존해 무장 가드를 통째로 면제한다."
      - path: "relay/tests/fanout.test.ts"
        issue: "⑰-e/⑰-e2(L729-787)는 crud:\"D\"+게이트 ON 조합을 실질적으로 태우지만(lcInput 기본값이 buyEnabled:true) 그 위험(무장 상태로 나감)을 단언하지 않는다."
    missing:
      - "#isTeardown 을 게이트 4종(isDeleteIntent 와 같은 네 항)으로 판정하고, crud:\"D\" 는 게이트가 실제로 전부 꺼져 있을 때만 신호로 쓴다 — 단독 근거로 쓰지 않는다"
      - "회귀 테스트: crud:\"D\" + buyEnabled:true + 미해석 ISIN → 거부, crud:\"D\" + buyEnabled:true + buyOrderQty:0 → 거부(무장 가드 적용)"
  - truth: "relay 공개 /healthz 의 degraded(503) 판정은 게이트웨이 자체 장애만 반영하고, 개별 사용자의 자격증명 거부 상태와 독립적이다 — 16-30 이 스스로 적은 「상시 적색은 곧 알림 무시다」 원칙의 반대 사례가 없다 (16-30 근거 취지 파생 / R2-CR-02)"
    status: failed
    reason: "`stalledCount` 판정(`relay/src/dma/session-manager.ts:265-268`)은 「생성 후 STALE_SESSION_MS(5분)가 지나도록 한 번도 Ready 가 아닌 세션」을 사유 불문 전부 센다. 그런데 `NO_RETRY_STATES`(`session-manager.ts:125` — session_rejected·unauthorized)는 `acquire` 가 재시도하지 않고 그대로 재사용하는 영구 터미널 상태다(`session-manager.ts:176-186`). 탭이 열려 있는 한 refCount>0 이라 유예 타이머도 걸리지 않아(`release` 로직) 그 세션은 무기한 stalledCount 에 남는다. 사용자 한 명이 DMA 비밀번호를 잘못 등록해 두고 탭을 열어 두면, 게이트웨이가 완전히 정상이고 다른 모든 사용자의 세션이 Ready 여도(`readyCount>0` 이 아닌 한) `/healthz` 가 영구 503 을 반환한다 — 16-30 자신이 막으려던 「상시 적색 → 알림 무시 → 진짜 장애도 놓침」과 같은 실패 형태를 다른 원인으로 재현한다. `session-manager.test.ts` ⑩/⑪ 은 「응답 없는 게이트웨이」와 「Ready 였던 세션」만 다루고 session_rejected 케이스가 없어 잠기지 않았다. (참고: 2026-09-09 실측 프로덕션 503 은 이 시나리오가 아니라 DMA_HOST 자체가 VM 에 없는 정상적으로 의도된 degraded 다 — deferred-items.md §16-35 확인. 그러나 코드 결함 자체는 별개로 실재하며 게이트웨이가 정상 가동되는 순간부터 언제든 발현될 수 있다.)"
    artifacts:
      - path: "relay/src/dma/session-manager.ts"
        issue: "L265-268 stats() 의 stalledCount 집계가 NO_RETRY_STATES(session_rejected/unauthorized)를 제외하지 않는다. L176-186 acquire() 가 이 상태의 세션을 재로그인 없이 refCount만 올려 재사용해 무기한 생존시킨다."
      - path: "relay/src/order/order-api.ts"
        issue: "L249-250 sessionsOk 판정이 stalledCount 를 그대로 반영해, 위 세션 하나가 전체 판정을 뒤집는다."
    missing:
      - "stalledCount 집계에서 사용자 원인(NO_RETRY_STATES) 세션을 제외 — 게이트웨이가 원인일 수 있는 상태로만 좁힌다"
      - "테스트 추가: session_rejected 세션이 STALE_SESSION_MS 를 한참 넘겨도 stalledCount === 0"
  - truth: "dma_orders 관련 모든 에러 로그가 계좌번호·주문번호 원문을 싣지 않는다 (T-16-45/D-19 — 이 phase 가 도처에서 지키는 규율, 16-28 이 23505 분기에서 명시적으로 재확인함 / R2-CR-03)"
    status: failed
    reason: "16-28 은 23505 분기에서 의도적으로 error 원문을 로그에서 뺐고 그 이유(주문번호 원문 노출)까지 적었다(`orders.ts:285-287`). 그런데 바로 인접한 일반 경로 3곳이 그 규율을 적용하지 않는다: `logger.error({ error, column: sel.column }, ...)`(`orders.ts:294`, update 실패), `logger.error({ error, origin: row.origin }, ...)`(`orders.ts:361`, insert 실패), `logger.error({ error }, ...)`(`orders.ts:395`, order_no 조회 실패). PostgreSQL 은 CHECK(23514)·NOT NULL(23502)·FK(23503) 위반의 DETAIL 에 `Failing row contains (<모든 컬럼 값>)` 을 담고, PostgREST 는 그것을 error.details 로 그대로 전달한다. `dma_orders` 컬럼에는 account_no·order_no·user_id 가 모두 있어, qty<=0 같은 CHECK 위반 한 번으로 계좌번호 원문이 Cloud Logging 에 남는다. `relay/tests/order-store.test.ts` ⓼ 가 23514 를 흘려보내는 경로를 이미 테스트하고 있어(로깅 내용은 단언하지 않음) 실제 도달 가능 경로임이 확인된다."
    artifacts:
      - path: "relay/src/store/orders.ts"
        issue: "L294 update 실패, L361 insert 실패, L395 order_no 조회 실패 — 세 곳 모두 PostgREST error 객체 원문을 로그에 싣는다. details 필드에 컬럼 전체 값(계좌번호 포함)이 담길 수 있다."
    missing:
      - "세 곳 모두 error 원문 대신 { code, message } 처럼 식별자를 담지 않는 안전한 필드만 뽑아 로그하는 공용 헬퍼로 교체"
      - "PostgREST DETAIL/HINT 필드는 어떤 경로에서도 로그에 싣지 않는다는 규율을 코드 주석 또는 lint 로 고정"
human_verification:
  - test: "WinForms ↔ 웹 「한 세션」 동기화 — WinForms 상따창과 /trading/limit-chaser/[key] 를 동시에 열고, 웹 스위치 ON → WinForms 무장 배지 확인, WinForms 매수가격 변경 → 웹 토스트 「다른 단말에서 변경됨」 + 값 갱신 확인"
    expected: "같은 DMA 세션(ezmesya)에서 전략·체결·미체결이 즉시 공유된다 — phase goal 의 핵심 문장이다"
    why_human: "실 gh-trade 서버 + WinForms 클라이언트가 필요하다. mock 으로 재현 불가이며 D-27 상 사용자 명시 지시가 있어야 실행한다. 프로덕션 everReadyCount:0 은 이 경로가 한 번도 실행된 적이 없음을 뜻한다. **이번 재검증에서 발견한 R2-CR-01(무장 가드 우회)·R2-CR-03(계좌번호 로그 유출)은 실서버 결선 전에 반드시 닫아야 한다 — 결선하는 순간 실계좌 위에서 도는 경로다.**"
  - test: "smoke INV-9 첫 실행 — 로그인 브라우저 localStorage 의 access_token 을 SMOKE_AUTH_TOKEN 으로 넣고 bash scripts/smoke-relay.sh 실행"
    expected: "reachable (주문 핸들러가 거부로 답한다). 프로브는 화이트리스트 밖 계좌번호 + 미해석 ISIN 을 쓰므로 실계좌에 주문이 나가지 않는다"
    why_human: "16-30 이 재작성한 프로브(argv 노출 제거 + 판정 이어붙임 제거)가 프로덕션에서 여전히 한 번도 실행된 적이 없다 — SKIP 사유가 SMOKE_AUTH_TOKEN 미설정으로 조기 반환이었고 프로브 본체는 돌지 않았다. 토큰은 사용자 브라우저에서만 얻을 수 있고 약 1시간 만료다"
  - test: "gh-trade mock 서버 대상 전략 왕복 — ../gh-trade/server/scripts/run-mac.sh 기동 → relay 로컬 기동 → 브라우저 로그인 → 스냅샷 3프레임 수신 로그 확인 → 상따 등록 → 60 에코 수신 확인"
    expected: "24/21/34 빈 Envelope 요청에 60/61/73 응답이 돌아오고 화면에 반영된다"
    why_human: "로컬 mock 바이너리 실행이 필요하다. E2E 는 relay 스텁 게이트웨이까지만 검증한다"
  - test: "VI 마감알림 — 브라우저 Notification 권한 허용 후 vi_end_time 임박 시 알림 표시 확인"
    expected: "마감 10초 전 알림이 이 기기에서만 뜬다 (다른 단말 전파 없음)"
    why_human: "headless Chromium 에서 Notification 실제 표시가 불가능하다. 단위 테스트는 생성자 호출 여부까지만 잠근다"
  - test: "15:40 서버 자동 비활성화(61 Broadcast) — 장 마감 후 VI 페이지에서 run=false 반영 + 로그 1줄 확인"
    expected: "서버가 내린 61 Broadcast 가 화면의 가동 램프를 「중지됨」으로 바꾸고 전략 로그에 남는다"
    why_human: "서버 시각에 의존한다"
  - test: "확인 체크 잠금의 영구화 — 실계좌 검증 시 73 정정도 confirmLocked 도 오지 않는 행이 실제로 관측되는지 확인"
    expected: "D-10 상 의도된 동작(무응답이 정상 경로)이지만 실측으로 관측 빈도를 확인한다"
    why_human: "서버가 영원히 아무것도 보내지 않는 경우를 mock 으로 재현할 수 없다"
---

# Phase 16: 트레이딩 메뉴(상따·VI·My page) 재검증 보고서 — 갭 클로징 2라운드(16-27~16-35) 이후

**Phase Goal:** gh-trade 상따전략창·VI 종합주문창을 웹앱으로 옮겨(트레이딩 메뉴), 같은 DMA 세션(`ezmesya`)으로 WinForms 와 전략·체결·미체결이 즉시 공유되게 한다. 사이드 메뉴를 종목검색(상승률 상위·테마·관심종목)/트레이딩(상따·VI)/My page 로 재편하고, My page 에 전략 현황·잔고·미체결을 둔다.

**검증 일시:** 2026-09-09
**상태:** gaps_found
**재검증:** 예 — 2차 검증(2026-09-09T03:54:59Z, 127/133 · 갭 3건: BLOCKER 2·WARNING 1) 이후 갭 클로징 2라운드(16-27~16-35, GC- 19건) 실행 결과에 대한 3차 검증

---

## 이 phase 가 지나온 경로 (이력 보존)

| 단계 | 결과 |
|---|---|
| 1차 실행 (16-01~16-17) | 17 plan 완료 |
| 1차 검증 | 78/82 · 갭 4건 · TRADE-03 BLOCKED |
| 1차 갭 클로징 (16-18~16-26) | 14건 종결 |
| 2차 검증 (`16-VERIFICATION.md`, 정본) | **127/133** · 갭 3건(BLOCKER 2·WARNING 1) · TRADE-03 Pending 유지 |
| 2차 코드 리뷰 (`16-REVIEW.md` §갭 클로징 재리뷰, GC- 네임스페이스) | Critical 3·Warning 12·Info 4 |
| 갭 클로징 2라운드 (16-27~16-35) | GC- 19건 종결 주장 |
| 3차 코드 리뷰 (`16-REVIEW-R2.md`, R2- 네임스페이스) | **Critical 3·Warning 7·Info 5** — 이번 라운드가 새로 만든 결함만 대상 |
| **본 재검증 (본 문서)** | **162/165** · 갭 3건(전부 BLOCKER, 이번 라운드가 새로 만든 결함) · TRADE-03 Pending 유지 |

---

## 요약

**2차 검증의 갭 3건은 전부 실제로 닫혔다.** SUMMARY·REVIEW 주장을 믿지 않고 코드를 직접 열어 확인했다.

- **갭 1 (GC-CR-01 구 네임스페이스 — narrowPending 「후보 1건」 지름길)** — `order-handler.ts:1009-1027` 이 하드 필터로 재작성됐다. `if (candidates.length <= 1) return candidates[0] ?? null;` 지름길이 사라지고, 통보가 실어 온 강한 축(비어 있지 않은 `orgOrderNo` · 취소성 `noticeType`)만 후보 수와 무관하게 하드 필터로 적용되며 0건이면 `null` 을 돌린다. 비어 있는 축은 그대로 건너뛰어 구 게이트웨이 호환이 유지된다.
- **갭 2① (GC-CR-02 — 수동 통보 0행 무로그 갱신)** — `recordUnmatched` 의 manual 분기(`order-handler.ts:449-493`)가 `findIdByOrderNo` 로 행 존재를 **먼저 확인**한 뒤에만 `orderRowId` 로 갱신을 큐에 넣는다. 행이 없으면 갱신을 큐에 넣지 않고 통보 원문(주문번호·통보종류·결과코드·ISIN·수량·가격)을 `logger.error` 로 stdout 에 남긴다 — 계좌번호는 싣지 않는다.
- **갭 2② (GC-CR-03 — await TOCTOU)** — `handle`(`order-handler.ts:805-827`)이 `await insertRequest` 직후·게이트웨이 조립·송신 **이전에** `conns.get(conn) !== state` 를 재확인한다. 죽었으면 그 행을 `status:"rejected"` 로 갱신하고 송신 자체를 중단한다 — 고아 대기·타이머 경로가 존재하지 않는다.
- **갭 3 (REQUIREMENTS.md 체크박스 불일치)** — TRADE-01·TRADE-02·NAV-01 체크박스가 `- [x]` 로 갱신됐고 Traceability 표(Complete)와 일치한다. TRADE-03 은 `- [ ]` 로 정확히 남아 있다.

**그러나 이번 라운드가 3건의 새 Critical 결함을 만들었다 — 3차 코드 리뷰(`16-REVIEW-R2.md`)의 주장을 코드에서 전부 직접 재현·확인했다.** 셋 다 이 phase 가 반복해 금지한 부류(가드 우회 · 오탐/누락 판정 · 개인정보 유출)이고, 전부 relay(TRADE-03) 표면이다.

1. **R2-CR-01 (16-29 / GC-WR-04 가 만든 결함)** — `fanout.ts#isTeardown` 이 클라이언트가 보내는 `crud:"D"` 필드를 게이트 상태 확인 없이 단독 근거로 믿는다. `crud` 는 인바운드 필드이고 계약 원문은 「삭제의 정본은 게이트이지 crud 가 아니다」라고 명시하는데, 이 함수는 그 반대다. `{crud:"D", buyEnabled:true, 유효 가격·수량, 미해석 ISIN}` 프레임 하나가 시장 해석 엄격성(T-16-42, 못 풀면 거부)과 무장 가드(T-16-43, 발주가·수량 0 이면 거부)를 **동시에** 우회해 폴백 시장으로 무장된 반복 발주 설정이 게이트웨이로 나간다. 기존 테스트 ⑰-e 가 이 조합을 실질적으로 태우면서도 위험성을 단언하지 않아 회귀 잠금이 없다.
2. **R2-CR-02 (16-30 / GC-WR-07 이 만든 결함)** — `session-manager.ts` 의 `stalledCount` 가 자격증명 거부(`session_rejected`/`unauthorized`, `NO_RETRY_STATES`)로 인한 영구 미Ready 상태를 게이트웨이 장애와 구분하지 않는다. `acquire` 는 이 상태의 세션을 재로그인 없이 재사용하고, 탭이 열려 있으면 유예 타이머도 걸리지 않아 무기한 stalledCount 에 남는다. 사용자 한 명의 잘못된 자격증명이, 게이트웨이가 완전히 정상이어도 `/healthz` 를 영구 503 으로 만든다 — 16-30 이 스스로 막으려던 「상시 적색은 곧 알림 무시」를 다른 경로로 재현한다. (참고: 2026-09-09 실측 프로덕션 503 은 이 시나리오가 **아니라** DMA_HOST 부재로 인한 의도된 degraded 다 — `deferred-items.md` §16-35 로 확인. 코드 결함 자체는 별개로 실재하며 게이트웨이가 정상 가동되는 순간 언제든 발현될 수 있다.)
3. **R2-CR-03 (16-28 의 인접 경로 — 사각지대, 이번 라운드가 도입하지는 않았으나 이번 리뷰에서 처음 확인)** — `orders.ts` 의 update 실패(:294)·insert 실패(:361)·order_no 조회 실패(:395) 세 로그가 PostgREST `error` 원문을 그대로 싣는다. 16-28 이 `23505` 분기에서만 의도적으로 원문을 뺐지만, CHECK(23514)·NOT NULL(23502)·FK(23503) 위반의 `DETAIL` 에는 `Failing row contains (<모든 컬럼 값>)` 이 담겨 계좌번호·주문번호가 Cloud Logging 에 그대로 남는다 — T-16-45/D-19 마스킹 규율 위반.

**phase goal 의 핵심 문장은 여전히 미검증이다.** 프로덕션 `/healthz` 실측(`{"status":"degraded","dma":false,"version":"c8aa7ae","sessionCount":1,"everReadyCount":0,"stalledCount":1}`, HTTP 503)이 보여주듯 DMA 경로는 실서버에서 한 프레임도 나른 적이 없다. TRADE-03 을 Pending 으로 유지한 판단은 정확하고, 이번 재검증은 그 판단을 뒤집을 근거를 찾지 못했다 — 오히려 실서버 결선 이전에 닫아야 할 항목이 3건 더 늘었다.

---

## 본 검증이 직접 취한 실측 (SUMMARY·REVIEW 인용이 아님)

### ① R2-CR-01 — `#isTeardown` 원문 직접 대조

`relay/src/ws/fanout.ts:793-798`:
```ts
#isTeardown(cfg: RelayLimitChaserInput): boolean {
  if (cfg.crud === "D") return true;
  return (!cfg.buyEnabled && !cfg.sellEnabled && !cfg.cancelQtyEnabled && !cfg.cancelTradeEnabled);
}
```
`crud` 가 인바운드 필드임을 `relay/src/ws/protocol.ts:109`(`z.enum(["C","D"])`)와 `packages/shared/src/relay.ts:235-243`(`RelayLimitChaserInput` 이 `crud` 를 Omit 하지 않음)에서 직접 확인. `#strategyArmable`(`fanout.ts:903`) 첫 줄이 `if (this.#isTeardown(cfg)) return true;` 로 무장 가드를 면제하는 것도 확인.

### ② R2-CR-02 — `stalledCount`/`NO_RETRY_STATES` 원문 직접 대조

`relay/src/dma/session-manager.ts:125`(`NO_RETRY_STATES = new Set(["session_rejected","unauthorized"])`), `:176-186`(`acquire` 가 이 상태를 재로그인 없이 refCount 만 올려 재사용), `:265-268`(`stalledCount` 집계가 이 상태를 제외하지 않음)을 직접 확인.

### ③ R2-CR-03 — `orders.ts` 로그 3곳 원문 직접 대조

`relay/src/store/orders.ts:294`(`logger.error({ error, column: sel.column }, ...)`), `:361`(`logger.error({ error, origin: row.origin }, ...)`), `:395`(`logger.error({ error }, ...)`)이 error 원문을 그대로 싣는 것을 직접 확인. `:285-287` 이 23505 분기에서만 의도적으로 원문을 뺀 것과 대조.

### ④ 갭 클로징 확인 — narrowPending / recordUnmatched(manual) / TOCTOU 가드

`relay/src/ws/order-handler.ts:1009-1027`(하드 필터), `:449-493`(manual 분기 findIdByOrderNo 선확인), `:805-827`(conns.get(conn) !== state 재확인)을 각각 직접 읽어 GC-CR-01(구)·GC-CR-02·GC-CR-03 종결 주장이 사실임을 확인.

### ⑤ REQUIREMENTS.md 체크박스

`.planning/REQUIREMENTS.md:97-101`(체크박스) vs `:173-177`(Traceability)을 직접 대조 — TRADE-01·02·NAV-01·MYPAGE-01 `[x]`/Complete 일치, TRADE-03 `[ ]`/Pending 일치.

### ⑥ 프로덕션 실측 (오케스트레이터 제공, 본 검증에서 해석)

```
$ curl -s -o - -w "%{http_code}" https://dma.jx1.io/healthz
503
{"status":"degraded","vpn":true,"dma":false,"version":"c8aa7ae","sessionCount":1,"everReadyCount":0,"stalledCount":1}
```
`deferred-items.md` §16-35 와 대조해 이 503 이 GC-WR-07 의 의도된 동작(게이트웨이 부재)임을 확인 — R2-CR-02 시나리오(session_rejected)의 직접 증거는 아니다. 다만 코드 결함 자체는 이 인스턴스와 무관하게 실재한다.

---

## Goal Achievement

### Observable Truths

**Score: 162/165**

#### 2차 검증 갭 3건 — 재판정

| # | Truth (2차 갭) | 2차 | 지금 | 증거 |
|---|---|---|---|---|
| 갭1(구) | 통보가 실어 온 강한 축은 후보 수와 무관하게 하드 필터로 적용, 비어 있는 축은 건너뜀 | ✗ FAILED | ✓ **VERIFIED** | `order-handler.ts:1009-1027` 하드 필터 재작성 (실측 ①/④) |
| 갭2① | 좁히지 못한 수동 통보가 0행 무로그 갱신으로 사라지지 않는다 | ✗ FAILED | ✓ **VERIFIED** | `order-handler.ts:449-493` findIdByOrderNo 선확인 (실측 ④) |
| 갭2② | await insertRequest 중 연결 종료가 고아 대기·timeout 오귀속을 만들지 않는다 | ✗ FAILED | ✓ **VERIFIED** | `order-handler.ts:805-827` 재확인 가드 (실측 ④) |
| 갭3 | REQUIREMENTS.md 체크박스와 Traceability 가 일치 | ⚠️ PARTIAL | ✓ **VERIFIED** | `.planning/REQUIREMENTS.md:97-101` vs `:173-177` (실측 ⑤) |

#### 2라운드 plan 별 must-have (16-27 ~ 16-35, 33건)

| Plan | Must-have 수 | 결과 |
|---|---|---|
| 16-27 (GC-CR-01 구·GC-CR-03) | 4 | 4 VERIFIED |
| 16-28 (GC-WR-08·GC-IN-04) | 3 | 3 VERIFIED (`orders.ts:91` `ORDER_FLUSH_MAX_ROUNDS`, `:255-270` patch.order_no 게이트) |
| 16-29 (GC-WR-04·GC-WR-05) | 3 | 2 VERIFIED · **1 FAILED** — 「relay 의 무장 가드가 UI 세 식과 동일하게 판정한다」가 `crud:"D"` 스푸핑 시나리오에서 성립하지 않는다 (R2-CR-01, 아래 갭 참조) |
| 16-30 (GC-WR-07·GC-WR-11) | 4 | 4 VERIFIED (문면 그대로는 성립 — session_rejected 시나리오는 문면 밖의 새 파생 결함, 아래 갭 참조) |
| 16-31 (GC-WR-09·06·12·IN-01) | 4 | 4 VERIFIED (`limit-chaser-form.tsx:449-500` gateBlocked 가드 위치·범위) |
| 16-32 (GC-WR-06·IN-03) | 3 | 3 VERIFIED (`vi-order-list.tsx:253`, `vi-settings-card.tsx:359` send() 반환값 확인) |
| 16-33 (GC-CR-02·GC-WR-01·02) | 4 | 4 VERIFIED |
| 16-34 (GC-WR-03·GC-WR-10) | 4 | 4 VERIFIED (`order-handler.ts` PendingOrder.side·dupKey 원주문번호 축) |
| 16-35 (전량 스위트·배포·문서) | 4 | 4 VERIFIED (측정값 — 전 워크스페이스 typecheck/test/build/e2e green, 프로덕션 배포 확인, smoke 실행) |

**33건 중 32 VERIFIED · 1 FAILED.**

#### phase goal 파생 truth — 이번 라운드가 새로 만든 결함 (goal-backward, R2-REVIEW-R2 Critical 3건 코드 직접 확인)

| # | Truth | Status | Evidence |
|---|---|---|---|
| G-C | 무장된 상따 전략 설정은 시장 해석·무장 가드를 반드시 거친 뒤에만 게이트웨이로 나간다 — crud 자칭이 아니라 실제 게이트 상태가 판정 근거다 | ✗ **FAILED** | `fanout.ts:793-798`·`:903` (R2-CR-01, 실측 ①) → **갭 1** |
| G-D | /healthz degraded 판정은 게이트웨이 장애만 반영하고 개별 사용자 자격증명 상태와 독립적이다 | ✗ **FAILED** | `session-manager.ts:125,176-186,265-268` (R2-CR-02, 실측 ②) → **갭 2** |
| G-E | dma_orders 관련 모든 에러 로그가 계좌번호·주문번호 원문을 싣지 않는다 (T-16-45 전 경로) | ✗ **FAILED** | `orders.ts:294,361,395` (R2-CR-03, 실측 ③) → **갭 3** |

#### 2차 검증에서 VERIFIED 였던 127건 — 회귀 점검 (정성적 regression pass)

2라운드가 손댄 표면(`order-handler.ts` · `fanout.ts` · `session-manager.ts` · `order-api.ts` · `orders.ts` · `limit-chaser-form.tsx` · `vi-order-list.tsx` · `vi-settings-card.tsx` · `me-client.tsx` · `smoke-relay.sh`)을 R2-REVIEW-R2 의 파일 목록과 대조해 확인했다. 전량 스위트가 green(typecheck 13 워크스페이스 exit 0 · `typecheck:tests` exit 0 · `pnpm -r test` 190 파일 2,012 pass/1 skip/6 todo · Playwright 126 pass/9 skip/0 fail)이므로 2차 검증의 127건에 대한 **명시적 실패 신호는 없다.** 다만 정밀 재검증은 위 3건의 새 결함이 확인된 표면(fanout.ts `#isTeardown`/`#strategyArmable`, session-manager.ts stats())에 집중했고, 나머지 파일은 diff·테스트 통과를 근거로 한 회귀 부재 판단이다 — 재검증 모드의 「통과 항목은 존재성+기본 정합성만 확인」 원칙을 따랐다.

---

### Key Link Verification (2라운드 신규/변경분)

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `ws/order-handler.ts` `handle` | `store/orders.ts` `insertRequest` | `await` 후 `conns.get(conn) !== state` 재확인 | ✓ WIRED | `:805-827` — 송신 전 중단 |
| `ws/order-handler.ts` `recordUnmatched` | `store/orders.ts` `findIdByOrderNo` | manual 분기 선확인 | ✓ WIRED | `:449-493` |
| `ws/order-handler.ts` `narrowPending` | 통보 축(`orgOrderNo`/`noticeType`) | 하드 필터 | ✓ WIRED | `:1009-1027` |
| `ws/fanout.ts` `#isTeardown` | `RelayLimitChaserInput.crud`(인바운드) | 단독 신뢰 | ⚠️ **위험 WIRED** | 게이트 상태 검증 없이 클라이언트 값을 신뢰 — R2-CR-01 |
| `dma/session-manager.ts` `stats()` | `order/order-api.ts` `sessionsOk` | `stalledCount` | ⚠️ **과다 WIRED** | 사용자 원인 상태를 게이트웨이 장애로 오분류 — R2-CR-02 |
| `store/orders.ts` 3개 로그 지점 | Cloud Logging | `logger.error({ error, ... })` | ⚠️ **과다 노출 WIRED** | error.details 원문 유출 — R2-CR-03 |
| `.planning/REQUIREMENTS.md` 체크박스 | Traceability 표 | 문서 내부 일치 | ✓ WIRED | 실측 ⑤ |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| 프로덕션 relay healthz | 오케스트레이터 실측 | `503 {"status":"degraded","dma":false,"version":"c8aa7ae","sessionCount":1,"everReadyCount":0,"stalledCount":1}` | ✓ PASS (예상된 degraded — GC-WR-07 의도 동작) |
| 전량 스위트 | 오케스트레이터 실측 | typecheck/typecheck:tests exit 0 · `pnpm -r test` 2,012 pass/1 skip/6 todo · Playwright 126/9/0 | ✓ PASS |
| smoke-relay/server | 오케스트레이터 실측 | relay 12 PASS/0 FAIL/1 SKIP(INV-9, 토큰부재 조기반환) · server 15 PASS/0 FAIL/0 SKIP | ✓ PASS (INV-9 는 인간 검증 #2 로 이월) |
| `crud:"D"`+게이트ON 무장 가드 우회 재현 | 코드 직접 대조(`fanout.ts:793-798`,`:903`) | 게이트 상태 미확인 조기 반환 확인 | ✗ **FAIL** → 갭 1 |
| `session_rejected` stalledCount 재현 | 코드 직접 대조(`session-manager.ts:125,176-186,265-268`) | NO_RETRY_STATES 미제외 확인 | ✗ **FAIL** → 갭 2 |
| 비-23505 CHECK/FK 위반 로그 유출 재현 | 코드 직접 대조(`orders.ts:294,361,395`) | error 원문 로깅 확인 | ✗ **FAIL** → 갭 3 |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| `scripts/*/tests/probe-*.sh` | `find scripts -path '*/tests/probe-*.sh'` | 0건 — probe 관례 미사용 (2차 검증과 동일) | N/A |

---

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| **TRADE-01** | ✓ SATISFIED | 2차 VERIFIED 유지 + 16-29(무장 가드 강화, 단 R2-CR-01 은 relay 표면)·16-31(gateBlocked 위치 수정) 이 웹앱 표면을 더 강화. REQUIREMENTS.md `[x]`/Complete 일치 |
| **TRADE-02** | ✓ SATISFIED | 2차 VERIFIED 유지 + 16-32(vi-order-list/vi-settings-card send() 확인) 이 강화. `[x]`/Complete 일치 |
| **TRADE-03** | ✗ **BLOCKED (Pending 유지)** | 코드 층위 갭 1·2(구)·3(구)은 전부 닫혔다. **그러나 이번 라운드가 새 Critical 3건(R2-CR-01·02·03)을 만들었고, 프로덕션에서 이 경로가 한 프레임도 나른 적이 없다(everReadyCount:0)는 사실도 그대로다.** RELAY-02 와 같은 기준으로 Complete 승격 보류가 맞다 |
| **NAV-01** | ✓ SATISFIED | 변경 없음. `[x]`/Complete 일치 |
| **MYPAGE-01** | ✓ SATISFIED | 16-32(vi-settings-card send 확인)·16-35 문서 갱신. `[x]`/Complete 일치 |

**Orphaned requirements:** 없음. REQUIREMENTS.md 가 Phase 16 에 매핑한 5개 ID 가 전부 9개 plan 의 frontmatter 에 선언돼 있다.

---

### Anti-Patterns Found (2라운드 신규분 · R2-REVIEW-R2 대조)

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `relay/src/ws/fanout.ts` | 793-798, 903 | 클라이언트 입력(`crud`)을 단독 신뢰해 이중 가드 우회 | 🛑 **Blocker** | 무장된 반복 발주 설정이 시장·수량 가드 없이 게이트웨이로 나감 (갭 1) |
| `relay/src/dma/session-manager.ts` | 265-268 | 사유 불문 카운터가 사용자 원인과 인프라 원인을 합침 | 🛑 **Blocker** | 자격증명 오류 1건이 relay 전체를 영구 503 으로 만듦 (갭 2) |
| `relay/src/store/orders.ts` | 294, 361, 395 | PostgREST error 원문을 그대로 로그 | 🛑 **Blocker** | CHECK/FK 위반 시 계좌번호·주문번호가 Cloud Logging 에 유출 (갭 3) |
| `relay/src/ws/order-handler.ts` | 1043-1046 | `noticeType` 미지 값을 「신규」로 단정(블랙리스트) | ⚠️ Warning | R2-IN-03 — 장래 통보 종류 확장에 취약, 지금 당장 must-have 위반은 아님 |
| `relay/src/ws/order-handler.ts` | 1015-1026 | `orgOrderNo` 문자열 완전일치, 정규화 없음 | ⚠️ Warning | R2-WR-03 — 표기 차이(선행 0 등) 시 실제 체결 취소가 timeout 오기록 가능. deferred-items 미기재, 다음 라운드 후보 |
| `webapp/.../limit-chaser-form.tsx` | 495-500 | 「수정」 무장 가드에 철거 면제 없음 | ⚠️ Warning | R2-WR-02 — relay 는 허용하는 삭제를 UI 가 막음(방향 반대, 자산 손실 아님) |
| `relay/src/ws/fanout.ts` | 1044-1059 | `#register` state 리스너가 재접속마다 누적 | ⚠️ Warning | R2-WR-05 — 11회 재접속 시 MaxListenersExceededWarning, `removeListener` 없음 |
| `relay/src/store/orders.ts` | 284-291, 618 | 23505 갱신 예외가 패치 전체를 버리고 `flushed` 로 집계 | ⚠️ Warning | R2-WR-01 — 수동 주문 행이 requested 상태로 영구 잔류 가능 |

> 부채 마커(`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`)는 **0건**(오케스트레이터 실측 그대로 인용). 위 항목은 전부 코드 구조·계약 결함이지 미완성 표시가 아니다.
> Warning/Info 급 나머지 항목(R2-WR-04·06·07·IN-01~05)은 must-have 문장을 직접 어기지 않으며 `16-REVIEW-R2.md` 원문에 상세가 있다 — 이번 재검증은 3개 BLOCKER 로 스코프를 좁혔다(오케스트레이터 지시).

---

### 반증(Disconfirmation) 패스

1. **부분적으로만 충족된 요구사항:** TRADE-03. 「16-30 의 stalledCount 는 게이트웨이 장애만 반영한다」는 정상 재시작-중-장애 시나리오에서는 참이지만, 자격증명 거부 시나리오에서는 거짓이다 — 하나의 카운터가 서로 다른 두 원인을 구분하지 못한다.
2. **통과하지만 서술한 위험을 실제로 검사하지 않는 테스트:** `fanout.test.ts` ⑰-e/⑰-e2 는 `crud:"D"`+유효 게이트 조합을 실질적으로 실행하면서도 「무장 상태로 나갔다」는 위험을 단언하지 않는다 — 그린이지만 안전을 증명하지 않는다.
3. **테스트 커버리지가 없는 에러 경로:** `session-manager.test.ts` 에 `session_rejected` 세션의 `stalledCount` 영향을 재현하는 케이스가 없다. `order-store.test.ts` ⓼ 는 23514 를 흘려보내지만 로깅 내용을 단언하지 않는다.
4. **DEVIATION 재해석:** 2차 검증이 「TRADE-03 Pending 유지는 갭 클로징의 실패가 아니라 D-27 의 결과」라고 정확히 적었던 판단은 이번에도 유효하다 — 다만 이번 라운드가 만든 3건의 새 결함은 D-27 과 무관한 **순수 코드 결함**이므로 실서버 결선 여부와 별개로 지금 닫아야 한다.

---

## Human Verification Required

2차 검증의 인간 검증 6건이 전부 아직 미실행이다(상세는 위 YAML frontmatter `human_verification` 참조). 특히 #1(WinForms↔웹 세션 공유)은 이번 재검증에서 확인한 R2-CR-01·R2-CR-03 이 닫히기 전에 실행하면 실계좌 위험이 있다는 경고를 추가했다.

---

## Gaps Summary

**갭 3건. 전부 BLOCKER 이고, 전부 이번 갭 클로징 2라운드가 relay 주문/전략 경로에 새로 만든 결함이다.**

**갭 1 — `crud:"D"` 스푸핑이 시장·무장 가드를 동시 우회한다 (R2-CR-01, 16-29 의 부작용).**
GC-WR-04(「전략을 못 지우는 상태를 만들지 않는다」)는 옳은 목표였지만 구현이 클라이언트가 주장하는 `crud` 필드를 게이트 상태 확인 없이 믿는 방식으로 됐다. 계약 원문이 「삭제의 정본은 게이트」라고 못박은 것과 정반대다. 수정 방향은 명확하다 — `#isTeardown` 을 `isDeleteIntent()` 와 같은 네 항(게이트 4종)으로 판정하고, `crud:"D"` 는 게이트가 실제로 꺼져 있을 때만 신호로 쓴다.

**갭 2 — 자격증명 거부 세션 1건이 relay 전체를 영구 503 으로 만든다 (R2-CR-02, 16-30 의 부작용).**
GC-WR-07(「재시작 중 장애가 초록으로 위장되지 않게 한다」)도 옳은 목표였지만, `stalledCount` 가 원인을 가리지 않고 세는 바람에 정반대 오탐(진짜 건강한 게이트웨이가 적색으로 표시)이 생겼다. 16-30 이 스스로 적은 원칙(「상시 적색은 알림 무시로 이어져 진짜 장애를 놓친다」)을 다른 경로로 위반한다. 수정은 한 자리다 — `stalledCount` 집계에서 `NO_RETRY_STATES` 세션을 제외한다.

**갭 3 — CHECK/FK 위반 로그가 계좌번호를 유출한다 (R2-CR-03, 16-28 의 사각지대).**
16-28 이 `23505` 만 특수 처리하며 「다른 코드는 완전히 동일」이라고 명시적으로 남긴 그 「다른 코드」 세 곳이 실제로는 이 phase 전체가 지키는 T-16-45 규율(계좌번호 마스킹) 밖에 있다. 수정은 안전한 필드만 뽑는 공용 헬퍼 하나로 세 곳을 교체하면 된다.

**갭이 아닌 것 — 명확히 해 둔다.**
- **2차 검증의 갭 1·2·3 은 전부 진짜로 닫혔다.** 코드를 직접 읽어 확인했다 — narrowPending 하드 필터, manual 통보 findIdByOrderNo 선확인, TOCTOU 재확인 가드, REQUIREMENTS.md 체크박스 일치.
- **TRADE-03 Pending 은 갭 클로징의 실패가 아니다.** D-27 이 실서버 결선을 사용자 명시 지시 사항으로 두었고, 프로덕션에서 DMA 경로가 한 프레임도 나른 적이 없다는 사실은 이번 라운드 이전과 동일하다.
- **프로덕션 현재 503 은 갭 2(R2-CR-02)의 실제 발현이 아니다.** `deferred-items.md` §16-35 가 이것이 DMA_HOST 부재로 인한 의도된 degraded 임을 이미 기록했다. 다만 R2-CR-02 코드 결함 자체는 이 인스턴스와 무관하게 실재하며, 게이트웨이가 살아나는 순간부터 다른 형태로 발현할 수 있다.
- **Warning 급 8건(R2-WR-01~07 잔여, R2-IN-01~05)은 must-have 문장을 직접 어기지 않는다.** 다음 라운드 우선순위로 둘 만하며 상세는 `16-REVIEW-R2.md` 원문을 참조.

**진행 판단.** 갭 1·2·3 은 전부 relay 주문·전략 경로(TRADE-03)에 국한되고, 그 요구사항은 이미 Pending 이다. 프로덕션에서 이 경로가 아직 한 프레임도 나른 적이 없으므로 **지금 당장 실사용자에게 손실이 발생하고 있지는 않다.** 그러나 실서버 결선(인간 검증 #1) 이전에 반드시 닫아야 한다 — 특히 갭 1(무장 가드 우회)과 갭 3(계좌번호 유출)은 결선하는 순간 실계좌·실개인정보 위에서 도는 경로다.

---

_Verified: 2026-09-09_
_Verifier: Claude (gsd-verifier) — 재검증 (갭 클로징 2라운드 16-27~16-35 이후)_

---

## 부록 — 검증 직후 전제가 바뀌었다 (2026-09-09, orchestrator 추가)

위 「진행 판단」은 **「프로덕션에서 이 경로가 아직 한 프레임도 나른 적이 없다」**를 전제로 위험을 유예했고, **「실서버 결선 이전에 반드시 닫아야 한다」**를 조건으로 달았다. **그 결선이 이 검증 직후에 일어났다 — 조건이 발동했다.**

### A. 전제 정정 — 프로덕션 503 은 「의도된 degraded」가 아니라 배포 회귀였다

위 본문의 「프로덕션 현재 503 은 … DMA_HOST 부재로 인한 **의도된** degraded」는 사실이 아니다. `scripts/deploy-relay.sh:95` 의 `DMA_HOST="${DMA_HOST:-127.0.0.1}"` 가 **현재 컨테이너 값을 보존하지 않아**, Phase 16 의 배포 2회(16-26 `2cb5620` · 16-35 `c8aa7ae`)가 Phase 15 에서 결선했던 실 게이트웨이를 로컬 mock 으로 되돌려 놓은 것이다. 두 executor 가 D-27 을 「주입하지 말라」로 읽고 그 강등을 의도된 상태로 SUMMARY 에 기록했고, 검증도 그 기록을 승계했다.

한 원인이 세 증상으로 보였다 — ① `/healthz` 503 ② `gh-radar-relay-down` 알림(**참 양성**이었다) ③ 웹앱 사이드바 「트레이딩」 그룹 미표시(`useTradingVisible()` 이 relay `ready` 를 요구).

### B. 결선 실측 — 위험이 이론에서 실제로 옮겨왔다

`DMA_HOST=10.41.1.120 bash scripts/deploy-relay.sh` -> `relay:59465e1`.
- 게이트웨이 TCP 도달성 `REACHABLE 10.41.1.120:9100`
- `/healthz` **200** `{"vpn":true,"dma":true,"version":"59465e1","sessionCount":1,"everReadyCount":1,"stalledCount":0}`
- **`everReadyCount: 1` — 프로덕션에서 DMA 세션이 Ready 에 도달한 첫 실측**
- `smoke-relay.sh` PASS 12 · FAIL 0 · SKIP 1(INV-9)

따라서 **R2-CR-01(무장 가드 우회)과 R2-CR-03(계좌번호 유출)은 이제 실계좌 위에서 도는 경로다.** 라운드 3 최우선.

### C. 새 갭 2건 — 결선 후 실사용에서 드러났다

**갭 4 — 사이드바 상따 전략이 종목명 대신 ISIN 으로 표시된다.**
`webapp/src/lib/isin-labels.ts` 는 `accountStates.hold` · `unf` · `viOrders` 에서만 이름을 모은다. 보유도 미체결도 없는 종목에 전략을 걸면 이름을 알 길이 없어 `KR7005930003` 같은 원문이 사이드바에 그대로 뜬다. 파일 주석은 이를 「모르면 ISIN 을 그대로 보여준다가 정답」이라고 규정했고 근거로 T-16-02(목록의 원천을 둘로 만들지 않는다)를 든다.

**그러나 원천을 늘리지 않고 고칠 수 있다.** relay 는 이미 `SymbolMap`(`relay/src/store/symbols.ts`, Supabase `stocks` 기반, 부팅 1회 + 매일 08:30 재적재)을 메모리에 들고 있고 `lookup(isin)` 이 `{code, name, market}` 을 돌려준다. 잔고·미체결·VI 주문의 이름도 Hub 가 같은 맵으로 붙인다. **상따 전략 에코(60/61)에도 같은 방식으로 `name`·`code` 를 붙이면** 웹앱에 새 조회 경로가 생기지 않고 원천도 여전히 relay wss 하나다 — T-16-02 를 지키면서 증상이 사라진다. 계약 변경(`RelayLimitChaser` 에 선택 필드 추가)과 relay fanout·webapp 표시·테스트가 범위다.

**갭 5 — `deploy-relay.sh` 가 현재 `DMA_HOST` 를 보존하지 않는다 (A 의 근본 원인).**
고치지 않으면 다음 배포에서 프로덕션이 **또** mock 으로 떨어진다. 이번 라운드에 두 번 일어났다. 수정 방향: 배포 전 실행 중인 컨테이너의 `DMA_HOST` 를 읽어 기본값으로 삼고(명시 주입이 있으면 그것이 우선), 값이 바뀌는 배포는 요약에 **변경 전/후를 나란히** 찍는다. D-27 의 취지는 「실주소를 저장소에 박제하지 않는다」이지 「배포마다 mock 으로 되돌린다」가 아니다.

_부록 작성: 2026-09-09, orchestrator (execute-phase 16 --gaps-only 세션)_
