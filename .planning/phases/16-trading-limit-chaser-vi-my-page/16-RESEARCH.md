# Phase 16: Trading 메뉴 — 상따(limit-chaser)·VI 전략 설정 + 종목검색 재편 + My page - Research

**Researched:** 2026-09-08
**Domain:** 코드베이스 통합 리서치 (gh-trade FlatBuffers 프로토콜 ↔ gh-radar relay ↔ Next.js 웹앱). 외부 라이브러리 서베이 아님.
**Confidence:** HIGH (프로토콜·통합 지점은 전부 소스 실측) / MEDIUM (로컬 mock 전략 왕복 — 미실행)

> 본 문서의 사실 주장은 전부 **파일:줄 실측**이다. `[VERIFIED: 소스]` 는 이 세션에서 파일을 열어 확인한 것,
> `[ASSUMED]` 는 확인하지 못하고 추론한 것이다. Assumptions Log 에 후자를 전부 모았다.

---

<user_constraints>
## User Constraints (from 16-CONTEXT.md)

### Locked Decisions (verbatim)

**전송 경로 — 전략·주문 모두 wss 직접**
- **D-01:** 상따/VI 설정 메시지(`SetLimitChaserReq 10`, `SetVITriggerReq 11`, `DisableStrategiesReq 14`, `ConfirmVIOrderReq 33`)는 **인증된 relay wss 로 직접** 올린다(`{t:"lc.set", ...}` 류 — 스키마는 재량). relay 가 FlatBuffer 로 변환해 그 사용자의 DMA 세션으로 보낸다. Cloud Run server 는 거치지 않는다. 응답/푸시(60/61/64/65/56/72/73)도 같은 wss 로 내린다.
- **D-02 (Phase 15 D-08·D-22·D-24 대체):** **직접주문(신규/취소, `DirectOrderReq 2`)도 wss 로 통일**한다. 브라우저 → relay wss `{t:"order", ...}` → DMA. 첫 `OrderResp(51)`(접수/거부)까지의 대기(5초)는 **wss 요청/응답 상관키**(클라이언트 생성 request id)로 재구현하고, 이후 체결(53)·취소확인(52)은 기존처럼 푸시. **`POST /api/orders` REST 라우트(server `routes/orders.ts`)·relay 내부 HTTP 주문 API(`order/order-api.ts` 의 주문 부분)·webapp `orders-api.ts` 의 createOrder 는 제거**하고 경로를 하나로 둔다. server `RELAY_INTERNAL_URL`/`RELAY_ORDER_SECRET` env·`deploy-server.sh` 주입·방화벽 내부포트 규칙은 relay 내부 HTTP 에 남는 것(healthz 등)에 맞춰 정리(재량). 형식 검사(D-20 동형: ISIN 12자, 수량/가격>0 정수, exchange, side, account_no ∈ 세션 계좌)는 relay 가 wss 수신 시 수행.
- **D-03:** `dma_orders` 기록은 **relay 가 insert·update 모두** 담당(서비스롤, 기존 `OrderStore` 확장). `GET /api/orders?date=` 조회 라우트는 유지(오늘 주문 목록 복원용). 상따·VI 자동주문의 체결 통보도 같은 세션으로 오므로 relay 가 동일하게 기록한다(자동주문 행의 출처 구분 컬럼은 재량).
- **D-04:** 인증·권한은 Phase 15 D-10~D-12 그대로 — wss 첫 메시지 auth, `dma_credentials` 매핑 = allowlist. 매핑 없으면 `unauthorized` 상태 프레임, 전략·주문 메시지는 거부.

**조작 규율 — 스위치는 즉시, 값은 수정 버튼**
- **D-05:** 상따 **매수주문/매도주문 스위치 ON/OFF 는 확인 다이얼로그 없이 즉시 서버 반영**(WinForms 동일, 목업대로). 등록 버튼 없음: 처음 켜는 스위치 = 등록(crud "C"). 오터치 방지는 스위치 크기·간격으로.
- **D-06 (목업 초안 수정):** **옵션 값 변경의 0.3초 자동 반영은 폐기.** 값이 바뀌면(더티) 폼에 **「수정」 버튼이 나타나고** 그 버튼으로만 서버 반영(SetLimitChaser crud "C" 전체 29필드를 현재 표시값으로 전송). 더티 없으면 버튼 숨김. 스위치는 D-05 대로 즉시(스위치 전송 시에는 그 시점의 폼 값이 함께 나간다 — 더티 필드가 있으면 그 값까지 같이 반영되므로 스위치 조작 전 더티 상태를 사용자가 인지하도록 표시).
- **D-07:** VI 페이지도 같은 규칙 — 계좌·금액·상승률 변경 시 「수정」 버튼(SetVITrigger, `run` 현재값 유지). **시작/중지는 확인 다이얼로그**(목업대로, 호가주문 탭 주문 확인과 같은 규율). 중지 상태에서 시작을 누르면 현재 폼 값으로 `run=true` 전송.
- **D-08:** 상따 전략 **삭제 = 매수·매도 스위치 둘 다 OFF**(WinForms 동일, 목업대로 crud "D"). 명시 삭제 버튼 없음. 폼은 빈 상태로 돌아가고 사이드바 목록에서 사라진다.
- **D-09:** **전체 비활성화(`DisableStrategiesReq 14`, key="")** 버튼은 My page 전략 현황에 두고 확인 다이얼로그를 붙인다. 단건 비활성화(key 지정)는 UI 없음(스위치 OFF 로 갈음).
- **D-10:** `ConfirmVIOrderReq(33)` 확인 체크는 즉시 전송(수정 버튼 대상 아님). `confirm_locked` 인 행은 체크 비활성.

**동기화·복원 — 서버값 우선, relay 세션 캐시**
- **D-11:** 게이트웨이 에코(`SetLimitChaserResp 60` 300ms 콜드 틱 Broadcast, `SetVITriggerResp 61`, `VIOrderListPush 73`)가 도착하면 **서버값이 항상 이긴다** — 더티 필드도 덮어쓰고 수정 버튼은 사라지며 토스트 「다른 단말에서 변경됨」을 띄운다. 편집 중 보호·보류 없음.
- **D-12:** **relay 가 세션 단위 전략 캐시**를 가진다. DMA 세션 Ready 직후 `GetLimitChaserListReq(24)`·`GetVITriggerReq(21)`·`GetVIOrderListReq(34)` 를 한 번 호출해 채우고 이후 60/61/64/72/73 로 갱신. 브라우저 wss 인증이 끝나면 종목 구독과 무관하게 **전략 스냅샷(상따 전수 + VI 설정 + VI 추적 목록)을 즉시 내린다**(Phase 15 D-37 시세 스냅샷 캐시 동형). 페이지가 따로 요청하지 않는다.
- **D-13:** 캐시 재조회는 **DMA 재접속(재로그인) 시에만**(24/21/34 재호출). 주기 재조회·사용자 새로고침 버튼 없음. 60 이 Broadcast(드롭 가능)라도 서버가 dirty 를 되세워 재시도하므로 실무 유실은 드물다고 본다.
- **D-14:** 상따 전략은 **세션의 전략 전부**(WinForms 에서 등록한 것 포함)를 표시·편집한다. 웹/WinForms 출처 구분 없음.

**사이드 메뉴 재편**
- **D-15:** **기존 URL 유지** — `/scanner`(라벨 「상승률 상위」로 변경), `/themes`, `/watchlist` 는 종목검색 그룹 아래 그대로. 신규 `/trading/limit-chaser`(새 전략 폼), `/trading/limit-chaser/[key]`(전략 편집, key = `ISIN:accountNo:exchange`), `/trading/vi`, `/me`. 홈 `/` 최상단, `/chat` AI 애널리스트 최하단(그룹 밖). 홈 화면 등 기존 표면의 「스캐너」 라벨도 「상승률 상위」로 통일(재량 범위 내 동시 갱신).
- **D-16:** 종목검색▾ / 트레이딩▾ 그룹은 **항상 펼침, 접기 없음** — 그룹 헤더는 클릭 불가 소제목. 접힘 상태 저장 없음.
- **D-17:** **사이드바 트레이딩 › 상따 아래에 등록 전략 목록**을 나열(목업대로): 종목명 · 거래소 · 상태 배지, 클릭 → `/trading/limit-chaser/[key]`. 원천은 D-12 전역 전략 스냅샷/에코. 상따 항목 자체 = 새 전략(빈 폼). VI 항목엔 가동 중일 때 「가동」 배지.
- **D-18:** 모바일은 **헤더 ☰ Sheet drawer 그대로**, 데스크톱과 같은 트리(목록이 길면 drawer 내부 스크롤). 하단 탭바 없음.
- **D-19:** **DMA 매핑 없는 로그인 사용자·비로그인 사용자에게는 트레이딩·My page 항목을 사이드바에서 숨긴다**(wss `unauthorized`/미연결 상태 기준). 직접 URL 진입 시 빈상태(비로그인 → 로그인 유도, 매핑 없음 → 「DMA 계정이 연결되지 않았습니다」). 호가주문 탭의 Phase 15 D-12 「권한 없음」 배지는 그대로.

**My page**
- **D-20:** `/me` 구성(모바일 세로 스택): **전략 현황 → 미체결 → 잔고**. 전략 현황 = 상따 전략 목록(종목·거래소·계좌·무장/발주 상태, 클릭 → 편집 페이지) + VI 가동 상태(→ `/trading/vi`) + 전체 비활성화 버튼(D-09). 미체결(취소 버튼 포함)·잔고는 Phase 15 `account-panel` 재사용. **오늘 주문 이력 표는 미포함**(deferred).
- **D-21:** 계좌가 2개 이상이면 **계좌별 미체결·잔고 섹션을 세로로 반복**(계좌 선택 UI 없음, 계좌번호 전체 표시 — Phase 15 D-02a 동일).

**연결 모델 — 앱 전역 wss 1연결 (Phase 15 D-15 보완)**
- **D-22:** **AppShell 수준 프로바이더(`RelayProvider` 류)가 로그인 상태면 relay wss 1개를 열어 유지**한다. 전략 스냅샷·에코·계좌 상태(66/67)·주문 통보·ServerMessage 를 전역으로 받고, 호가주문 탭은 이 연결 위에 종목 구독(sub/unsub)만 얹는다. `useRelaySocket` 을 섹션 단위 훅에서 전역 컨텍스트로 승격(호가주문 탭 회귀 E2E 포함). 결과적으로 DMA 세션은 **앱을 열어둔 동안 살아 있고**, D-15 의 5분 유예는 모든 탭이 닫힌 뒤에만 발동한다(relay 변경 없음).
- **D-23:** 비로그인이면 연결하지 않는다. 로그아웃 시 즉시 close.

**목업 채택**
- **D-24:** 초안 2건을 채택안 초안으로 삼고 ui-phase 에서 (a) 수정 버튼 서술, (b) `--warn` 재사용, (c) My page·사이드바 목업 추가, (d) 모바일 390 + 데스크톱 1280 · 다크/라이트 를 반영해 확정한다.
  → **ui-phase 완료(2026-09-08). 채택안 3건 + `16-UI-SPEC.md` 확정.** (b) 는 `--warn` 토큰 부재로 「중립 확정」으로 해소됨(UI-SPEC FLAG-1).

### Claude's Discretion (verbatim)
- wss 메시지 스키마(`{t:"lc.set"|"lc.list"|"vi.set"|"vi.confirm"|"strategies.disable"|"order"|...}`, 상관키 필드명, 전략 스냅샷 프레임 형식), `@gh-radar/shared/relay.ts` 타입 확장 방식, zod 스키마.
- relay 전략 캐시 구조(세션당 Map<key, LimitChaser> + VITrigger + VIOrderList), 60 에코 → 캐시 갱신 → 팬아웃 경로, 스냅샷 전달 시점(auth 직후 `state` 프레임 뒤).
- 주문 wss 요청/응답 타임아웃(5초 유지 권장), 응답 대기 중 중복 전송 방지, `dma_orders` 컬럼 추가(출처 manual/limit_chaser/vi 등).
- FlatBuffer 필드 변환(단일 문자 필드·BasisPoints·bigint→Number)은 한 모듈에서만.
- 사이드바 전략 배지 상태 종류·문구와 에코 필드(buyArmed/sellArmed/sellEntryLatched)→배지 매핑.
- 전략 로그 원천 = `ServerMessage(54)` + 에코 상태 전이 요약, 브라우저 메모리만.
- 15:40 서버 자동 비활성화(`DisableAllStrategies`)의 표시.
- 수정 버튼 미적용 상태에서 페이지 이탈 시 경고.
- VI 마감알림: 브라우저 Notification API + localStorage, 권한 요청 시점, `vi_end_time` 기준 타이머.
- 매수 수량 = 주문금액(만원)÷매수가격 산출·표시, 매도 수량 「예상」 표시.
- 종목 선택 진입: 기존 검색 컴포넌트 재사용, `stocks.isin`·상한가/기준가/호가단위 원천, 선택 시 필드 기본값.
- 계좌 선택 기본값, 계좌비번 필드 처리.
- REST 주문 라우트 제거 순서(15-20 검증과의 선후), 방화벽·env 정리 범위, `orderbook.spec.ts` E2E 갱신.
- 라우트 파일 구조, 서버/클라이언트 경계, 스켈레톤·빈상태.

### Deferred Ideas (OUT OF SCOPE — verbatim)
- 오늘 주문 이력 표(dma_orders) My page 표시 · 명시 삭제 버튼 · 주기 재조회/수동 동기화 버튼 · 편집 중 필드 보호 · 그룹 접힘 토글/모바일 하단 탭바 · 매핑 없는 사용자 안내 페이지 규격(+`/settings/dma`) · 단건 비활성화 UI · VI NXT 지원 · 거래원(74/75)·정정/IOC/FOK/시장가·서버측 한도 · Cloud Run server 의 relay 내부 HTTP 완전 제거.
</user_constraints>

---

<phase_requirements>
## Phase Requirements (신규 등록 대상)

CONTEXT 의 「plan 단계에서 신규 등록」 지시대로, 아래 5개를 `REQUIREMENTS.md` 에 추가한다.
문구는 초안이며 planner 가 확정한다.

| ID | 초안 설명 | 이 리서치의 지원 근거 |
|----|-----------|----------------------|
| **TRADE-01** | 상따(LimitChaser) 전략 페이지 `/trading/limit-chaser/new` · `/trading/limit-chaser/{key}` — `SetLimitChaser` 활성 37필드(입력 30 + S→C 표시 4 + 클라 고정 3) 폼, 매수/매도/한방 스위치 즉시 전송(crud "C") · 둘 다 OFF = 삭제(crud "D") · 값 변경은 「수정」 버튼, 호가 10단 + 최근 체결 · 미체결/잔고 · 전략 로그 | §Protocol A · §UI-SPEC A · §Pitfalls 1~7 |
| **TRADE-02** | VI 종합주문 페이지 `/trading/vi` — 세션당 1건(`SetVITrigger`: account_no·order_amount_krw·check_rate·price_type "U"·run), 시작/중지 확인 다이얼로그, VI 주문내역(`VIOrderList` 72/73, 상태 6종 + 부분체결 파생, `confirm_locked`, 110/119초 데드라인) + `ConfirmVIOrderReq(33)` 확인 체크 | §Protocol B · §UI-SPEC B |
| **TRADE-03** | relay 전략 중계 + 주문 wss 이관 — wss 인바운드 확장(전략 4종 + 주문), DMA 세션 Ready 시 24/21/34 프리페치 + 세션 전략 캐시, auth 직후 전략 스냅샷 팬아웃, 60/61/64/65/56/72/73 파싱·팬아웃, `DirectOrderReq(2)` wss 상관(5초) 이관 + `dma_orders` insert/update 를 relay 가 전담, server `POST /api/orders` 제거(GET 유지) | §Protocol · §Relay 통합 지점 · §Suggested plan decomposition |
| **NAV-01** | 사이드 메뉴 2단 그룹 트리 재편 — 홈 / 종목검색(상승률 상위·테마·관심종목) / 트레이딩(상따 + 등록 전략 3단 목록 · VI) / My page / AI 애널리스트, 기존 URL 유지, 비로그인·`unauthorized` 시 트레이딩·My page 숨김, 모바일 Sheet drawer 동일 트리 | §UI-SPEC N · §Webapp 통합 지점 |
| **MYPAGE-01** | My page `/me` — 전략 현황(상따 목록 + VI 상태 + 전체 비활성화) → 계좌별 미체결·잔고 세로 반복(`account-panel` 재사용, 모바일 `.rlist` 2줄 카드 행) | §UI-SPEC C |

### 선례 — Phase 11~15 의 요구사항 등록 방식 `[VERIFIED: .planning/REQUIREMENTS.md]`

Phase 15 가 마지막 선례다. 세 곳을 **한 커밋에서** 함께 고쳤다:

1. **`## v1 Requirements` 아래 새 소제목 섹션** 추가 (`### DMA Relay`) 후 `- [ ] **RELAY-01**: … — Phase 15` 형태의 불릿. 상태 체크박스는 미완료면 `- [ ]`, 완료면 `- [x]`.
2. **`## Traceability` 표**에 `| RELAY-01 | Phase 15 | Pending |` 행 추가.
3. **`## Coverage`** 의 `v1 requirements: N total (…)` 괄호 이력에 `RELAY-01·RELAY-02·RELAY-03 added 2026-09-05 with Phase 15(DMA 중계 서버) → 37→40` 를 append 하고 `Mapped to phases` / `Unmapped: 0 ✓` 를 갱신.
4. 파일 맨 아래 `*Last updated: …*` 줄을 이번 phase 기준으로 교체.

Phase 16 은 40 → **45** 가 된다(TRADE-01/02/03 + NAV-01 + MYPAGE-01).
`Out of Scope` 표의 「주문/매매 기능(공개 사용자 대상)」 행에는 이미 Phase 15 allowlist 예외 주석이 달려 있다 —
Phase 16 은 그 예외 범위 안(같은 allowlist·본인 계좌)이므로 **새 예외 주석은 불필요**하나, 「전략 자동매매(상따·VI)」가
「AI 자동매매 추천」과 다른 것임을 한 줄로 구분해 두는 편이 안전하다(재량).
</phase_requirements>

---

## Summary

이 phase 는 **새 기술을 도입하지 않는다.** 스택(Next.js 15 / React 19 / Tailwind 4 / shadcn·radix-ui / Node 22 relay / FlatBuffers 25.12.19 / Supabase)은
Phase 15 에서 이미 고정됐고, 신규 npm 의존성은 **0개**다(UI-SPEC 이 요구하는 `checkbox` 는 이미 설치된 `radix-ui@^1.4.3` 의
하위 export 를 쓰는 shadcn 공식 소스 복사). 그래서 리서치의 실질은 **① gh-trade FlatBuffers 전략 메시지의 정확한 필드 계약,
② relay 의 어느 지점을 어떻게 확장하는가, ③ 웹앱 전역 연결 승격의 회귀면**이다.

**가장 중요한 3가지 실측 결과:**

1. **relay 의 생성 코드가 2파일 stale 하다.** `sync-relay-schema.sh --check` 가 「신규/변경 예정 2개」를 보고한다 —
   `set-limit-chaser.ts` 에 `cancelQtyTrackBaseline()`(vtable offset 92, field 44)이 **없고**, `unfilled-state.ts` 에
   `orderTime()`(offset 22, field 9)이 **없다**. 전자는 이 phase 가 표시해야 하는 상따 취소 잔량추적 기준선이다.
   **Wave 0 에서 `sync-relay-schema.sh`(--check 없이) 재동기화가 선행되어야 한다.** flatc 25.12.19 는 로컬에 설치돼 있다.
2. **CONTEXT D-11/D-13 의 「60 은 Broadcast(드롭 가능)」 전제는 절반만 맞다.** `Gateway::ProcessSetLimitChaser`
   의 Set 에코는 2인자 `SendToSession(session, echo)` = **`MsgClass::Notice`** 다(큐 가득참 시 드롭이 아니라 연결 종료).
   Broadcast 는 `PushLimitChaserEcho`(300ms 콜드 틱 런타임 진행 표시)와 `PushVITriggerEcho`(15:40 자동 비활성화)뿐이다.
   즉 **사용자 조작에 대한 응답 에코는 유실되지 않는다** — D-13(주기 재조회 없음)의 안전 마진은 CONTEXT 가정보다 넓다.
3. **`SetLimitChaser` 의 활성 필드는 29개가 아니라 37개**(deprecated 8개 봉인, 총 45 슬롯 = 생성 코드 `startObject(45)`).
   그중 클라이언트가 실제로 채우는 것은 **30개**, WinForms 가 상수로 고정해 보내는 것이 **3개**(`sweep_recalc_enabled=true`,
   `sweep_min_count=0`, `sweep_min_rate=0`), 서버가 요청값을 **읽지 않는 S→C 전용 표시값이 4개**
   (`sell_order_qty`, `sell_qty_track_baseline`, `sell_entry_latched`, `cancel_qty_track_baseline`)다.
   CONTEXT/UI-SPEC 의 「29필드」 표현은 planner 가 **37/30/3/4** 로 정정해 쓴다.

**Primary recommendation:** relay 에 `StrategyHub`(또는 `SubscriptionHub` 확장) 1개를 추가해 **전략 캐시 + 전략 프레임 파싱/조립**을
한 모듈에 가두고, `packages/shared/src/relay.ts` 의 `RelayInbound`/`RelayOutbound` 유니온에 전략·주문 메시지를 append 한 뒤,
웹앱은 `useRelaySocket` 을 그대로 **컨텍스트로 승격**(내부 로직 무변경 + 구독 ref-count 추가)해 전역 1연결로 만든다.
FlatBuffer ↔ JSON 변환(단일 문자·BasisPoints·bigint)은 `relay/src/dma/envelope.ts` **한 파일에만** 추가한다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 전략 상태의 정본(등록/무장/래치/기준선) | **gh-trade 게이트웨이(C++)** | — | `StrategyManager` 가 소유하고 에코가 유일한 진실 통로. relay·웹앱은 뷰다 (D-11/D-14) |
| 전략 메시지 FlatBuffer ↔ JSON 변환 | **relay (VM Node)** | — | 브라우저에 FlatBuffers 런타임을 얹지 않는다. Phase 15 D-34 「와이어 계약은 전부 number」 승계 |
| 세션 단위 전략 캐시 + 스냅샷 팬아웃 | **relay** | — | 사용자당 DMA 세션이 1개이므로 캐시 소유자도 relay 여야 한다 (D-12) |
| 주문 요청/응답 상관(5초) | **relay** | — | Phase 15 는 Cloud Run server 였다. D-02 로 relay 로 이관 — 세션을 쥔 프로세스가 상관도 쥐는 것이 맞다 |
| `dma_orders` 감사 기록 insert+update | **relay (service_role)** | — | D-03. server 는 조회만 |
| 오늘 주문 목록 조회(`GET /api/orders`) | **Cloud Run server** | Supabase | 유지. 브라우저가 Supabase 에 직접 닿지 않는다(RLS default-deny) |
| 종목 검색·마스터(ISIN·상한가·기준가) | **Cloud Run server** | Supabase | 기존 `/api/stocks/search`·`/api/stocks/:code` 가 `isin` 포함해 내려준다 |
| 전역 wss 연결 수명·재접속 | **브라우저(Next.js 클라이언트)** | — | D-22 `RelayProvider`. Next 서버 컴포넌트는 소켓을 쥘 수 없다 |
| 전략 폼 더티 추적 · 「수정」 버튼 | **브라우저** | — | 순수 표시 상태. 서버로 나가는 것은 버튼 클릭 시점의 전체 필드 스냅샷 하나뿐 |
| 파생값(매수수량 = 금액÷가격, 예상 매도수량) | **브라우저(표시)** | 게이트웨이(정본) | 발주 정본은 서버 계산값. 브라우저는 「예상」 표기 |
| VI 마감알림 | **브라우저(localStorage + Notification API)** | — | 이 기기 전용. 서버 저장 없음 |
| 사이드바 전략 목록 | **브라우저(전역 컨텍스트)** | relay 캐시 | D-17. 별도 API 없음 |

---

## Project Constraints (from CLAUDE.md · 자동 메모리 · lessons.md)

| # | 지시 | 이 phase 에서의 구속 |
|---|------|----------------------|
| PC-1 | 커밋 메시지 한글 · **커밋 전 메시지 보여주고 확인** · Co-Authored-By 금지 · 커밋 후 push | `commit_docs: true` 는 커밋 **대상 정의**이지 승인 게이트 면제가 아니다 (lessons 2026-09-08) |
| PC-2 | 모든 사용자 대면 커뮤니케이션 한글 | RESEARCH·PLAN·SUMMARY 전부 한글 |
| PC-3 | Supabase 신규 테이블/컬럼: **RLS 활성 + `REVOKE ALL FROM anon, authenticated` 명시** | `dma_orders` 컬럼 추가 마이그레이션 시 기존 규약 유지(테이블은 이미 default-deny) |
| PC-4 | Supabase RLS 정책은 `TO anon, authenticated` 둘 다 명시 | `dma_orders` 는 정책 0개가 의도 — **정책을 추가하지 말 것** |
| PC-5 | dev 포트는 `dev.sh` 기준: webapp 3100 · server 8080 · relay ws 8090 · relay 내부 8091 | E2E·수동 검증 명령 전부 이 값 |
| PC-6 | 병렬 Wave 는 worktree 분리 (shared tree git add race) | `parallelization: false` 이므로 순차 — 해당 없음 |
| PC-7 | 무로그 fail-safe 금지 — 변환 실패·거부는 브라우저 상태 영역 + pino 양쪽에 | 전략 메시지 파싱 실패·`ServerMessage ERROR` 를 조용히 삼키지 않는다 |
| PC-8 | 그리드/플렉스 자식에 `min-w-0` 필수 (overflow-hidden 아래 조용한 잘림) | UI-SPEC R8 과 동일. `.lc3`/`.lc2`/`.acct-grid` 전부 |
| PC-9 | `lightweight-charts` 는 oklch 거부 | **본 phase 무관** — canvas 렌더러를 쓰지 않는다(UI-SPEC 명시) |
| PC-10 | Vercel env paste trailing newline 검증 | 신규 `NEXT_PUBLIC_*` 를 추가하지 않으면 해당 없음 |
| PC-11 | 손보는 표면 안의 명백한 시각 결함은 묻지 말고 고친다 | 상따/VI/My page/사이드바 표면 안 |
| PC-12 | 필터 완화 시 **신규 유입 집합을 먼저 센다** | `INBOUND_MSG_TYPES` 화이트리스트를 넓힐 때: 새로 통과할 msg_type 을 전부 세고 하류(파서·팬아웃)에서 어떻게 취급되는지 한 단계씩 확인 |
| PC-13 | GSD 워크플로우 필수 — 직접 편집 금지 | plan → execute |
| PC-14 | 실서버(10.41.1.120)·실계좌 접속은 **사용자 명시 지시가 있을 때만** (Phase 15 D-27) | 기본 경로는 mock 검증 |

---

## Standard Stack

### Core (전부 기존 — 신규 도입 0)

| Library | Version (실측) | Purpose | 근거 |
|---------|---------------|---------|------|
| Next.js | ^15.0.0 (App Router) | 웹앱 | `webapp/package.json` `[VERIFIED: 파일]` |
| React | ^19.0.0 | UI | 동상 |
| radix-ui | ^1.4.3 | shadcn primitives (Checkbox 포함) | 동상 |
| lucide-react | ^1.8.0 | 아이콘 | `components.json` `iconLibrary: lucide` |
| shadcn CLI | ^4.2.0 (devDep 아님 — dependencies) | `npx shadcn add checkbox` | `webapp/package.json` |
| zod | (relay·server 기존) | wss 인바운드 검증 | `relay/src/ws/protocol.ts` |
| flatbuffers (npm) | 25.x — 생성기는 `flatc 25.12.19` **고정** | FlatBuffers 런타임 | `sync-relay-schema.sh` `FLATC_REQUIRED` |
| ws | (relay 기존) | wss 서버 | `relay/src/ws/fanout.ts` |
| Playwright | ^1.59.1 | E2E | `webapp/package.json` |
| vitest | ^2.1.9 (webapp) / relay·server 각 워크스페이스 | 단위 | 동상 |

### 신규 설치 1건 (npm 의존성 아님)

```bash
cd webapp && npx shadcn@latest add checkbox
```

- shadcn **공식 1st-party registry**. `components.json.registries = {}` 이므로 3rd-party 벳팅 게이트 대상이 아니다 `[VERIFIED: webapp/components.json]`.
- 산출물은 `webapp/src/components/ui/checkbox.tsx` **소스 파일 1개**. `package.json` 은 바뀌지 않는다(이미 `radix-ui` 설치됨).
- 현재 `webapp/src/components/ui/` 에 `checkbox.tsx` **없음** `[VERIFIED: ls]`.

### 비채택 (UI-SPEC Registry Safety 확정)

| 후보 | 사유 | 대체 |
|------|------|------|
| `sonner` (토스트) | 새 npm 의존성. Phase 15 D-36 이 알림 채널을 「상태 영역 누적」으로 고정 | 상태줄 인라인 배너(6초, `role="status"`) + 전략 로그 |
| `select` | 계좌 2~3개. Phase 15 결정 승계 | 네이티브 `<select>` + `<label>` |
| `progress` | 단일 div + `role="progressbar"` 로 충분 | 전용 마크업 |
| `accordion`/`collapsible` | 그룹 항상 펼침(D-16) | 정적 중첩 `ul` |
| shadcn `sidebar` block | 기존 AppShell 이 drawer·240px·`data-nav-item` 계약 소유 | `app-sidebar.tsx` 확장 |

---

## Package Legitimacy Audit

**이 phase 는 외부 패키지를 하나도 설치하지 않는다.**

| Package | Registry | 조치 | Disposition |
|---------|----------|------|-------------|
| (없음) | — | `npx shadcn add checkbox` 는 **소스 코드 복사**이며 npm 설치가 아니다. 의존 대상 `radix-ui@^1.4.3` 은 이미 `webapp/package.json` 에 있고 Phase 3 에서 도입·검증됐다 | N/A |

- `slopcheck` 실행 불필요 (설치 대상 0건).
- **planner 주의:** 실행 중 누군가 「토스트가 필요하다」로 `sonner` 를, 「진행바가 필요하다」로 `@radix-ui/react-progress` 를 추가하려 하면
  UI-SPEC Registry Safety 표가 이미 비채택으로 닫아 놓았다. 새 의존성을 넣어야 한다면 그 자체가 UI-SPEC 재개정 사유다.

---

## Protocol — gh-trade FlatBuffers 전략 계약 (정본 실측)

정본: `/Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs` `[VERIFIED: 파일 실독]`

### 0. MsgType 표 (이 phase 가 다루는 것 전부)

| 방향 | MsgType | 값 | Envelope 슬롯 | 전송 클래스 | 대상 |
|------|---------|----|---------------|------------|------|
| C→S | `SetLimitChaserReq` | 10 | `set_limit_chaser` | — | — |
| C→S | `SetVITriggerReq` | 11 | `set_vi_trigger` | — | — |
| C→S | `DisableStrategiesReq` | 14 | `disable_strategies_req` | — | — |
| C→S | `GetLimitChaserReq` | 20 | `get_strategy_req`(key) | — | 단건 조회 — **이 phase 는 안 씀**(24 로 갈음) |
| C→S | `GetVITriggerReq` | 21 | **요청 본문 없음** (`get_strategy_req` 는 파싱되나 무시) | — | — |
| C→S | `GetLimitChaserListReq` | 24 | **요청 테이블 없음 — 빈 Envelope** | — | — |
| C→S | `ConfirmVIOrderReq` | 33 | `confirm_vi_order_req` | — | — |
| C→S | `GetVIOrderListReq` | 34 | **요청 테이블 없음 — 빈 Envelope** | — | — |
| C→S | `DirectOrderReq` | 2 | `direct_order_req` | — | (D-02 이관 대상) |
| S→C | `OrderResp` | 51 | `order_resp` | Notice | 주문자 세션 |
| S→C | `ServerMessage` | 54 | `server_message` | Notice(요청 연결) / Broadcast(세션 전 연결, 상따 발주 근거) | — |
| S→C | `VIOrderNotice` | 56 | `vi_order_notice` | Notice | 발주 세션 전 연결 |
| S→C | `SetLimitChaserResp` | 60 | `set_limit_chaser` | **Notice**(Set 에코) / **Broadcast**(300ms 런타임 푸시) | 세션 전 연결 |
| S→C | `SetVITriggerResp` | 61 | `set_vi_trigger` | **Notice**(Set 에코) / **Broadcast**(15:40 자동 중지) | 세션 전 연결 |
| S→C | `GetLimitChaserListResp` | 64 | `limit_chaser_list` | Notice | **요청 연결에만** |
| S→C | `DisableStrategiesResp` | 65 | `disable_strategies_resp` | Notice | **요청 연결에만** (에코 60/61 이 먼저 나간 뒤) |
| S→C | `GetVIOrderListResp` | 72 | `vi_order_list`(is_snapshot=true) | Notice | **요청 연결에만** |
| S→C | `VIOrderListPush` | 73 | `vi_order_list`(is_snapshot=false) | **Notice** | 세션 전 연결 |

> **72/73 은 `vi_order_list` 슬롯 하나를, 60/61 은 각각 `set_limit_chaser`/`set_vi_trigger` 슬롯을 공유한다** —
> `msg_type` 이 유일한 구분자다. 58/59·66/67·69/71 와 같은 규약 `[CITED: gh-trade CLAUDE.md §전송 클래스]`.

**전송 클래스 정정 (중요):**
- `Gateway.cpp:1612` — Set 에코: `SendToSession(conn.session, echo)` **2인자판 = Notice** `[VERIFIED: Gateway.cpp]`
- `Gateway.cpp:1637` — `PushLimitChaserEcho`: `SendToSession(session, b, MsgClass::Broadcast)` `[VERIFIED]`
- `Gateway.cpp:~1648` — `PushVITriggerEcho`: `MsgClass::Broadcast` (호출자 `Server::DisableAllStrategies` 15:40) `[VERIFIED]`
- `Gateway.h:317` — `PushVIOrderList`: **Notice** ("돈이 걸린 상태") `[VERIFIED: Gateway.h 주석]`
- `ProcessDisableStrategies` 의 60/61 에코도 2인자 `SendToSession` = Notice `[VERIFIED: Gateway.cpp:2970~2982]`

### A. `SetLimitChaser` — 45 슬롯 (활성 37 · deprecated 8)

`.fbs:297~468` / 생성 코드 `relay/src/generated/stock-dma/set-limit-chaser.ts` (**재동기화 후** `startObject(45)`)

**deprecated 8종 — 접근자가 생성되지 않는다. 절대 보내지도, 읽지도 않는다.**
`client_key`(ubyte) · `sell_min_cum_volume`(uint) · `sell_cum_volume_enabled`(bool) · `a3_buy4_enabled`(bool) ·
`smart_sell`(bool) · `origin_ord_qty`(uint) · `buy_price_break_enabled`(bool) · `sell_price_break_enabled`(bool)

**활성 37 필드 (선언 순서 = TS 접근자 camelCase):**

| # | fbs 필드 | TS 접근자 | 타입 | 방향 | 의미 / 서버 규약 |
|---|----------|-----------|------|------|------------------|
| 1 | `isin` | `isin()` | string | ↔ | 12자. **서버가 13B 버퍼에 `strncpy(…,12)`** — 클라도 12자로 절단해야 키가 일치 |
| 2 | `account_no` | `accountNo()` | string | ↔ | 최대 12자, 동일 절단 |
| 3 | `market` | `market()` | string | ↔ | **첫 글자만** 파싱. `'Q'`=KOSDAQ, 그 외=KOSPI |
| 4 | `crud` | `crud()` | string | ↔ | 첫 글자. `'D'`=삭제, 그 외=`'C'` upsert |
| 5 | `buy_order_price` | `buyOrderPrice()` | uint | ↔ | 매수 주문가(원) |
| 6 | `buy_order_qty` | `buyOrderQty()` | uint | ↔ | 매수 주문수량(주). **발주 정본** |
| 7 | `buy_watch_price` | `buyWatchPrice()` | uint | ↔ | 매수 감시가 |
| 8 | `buy_watch_qty` | `buyWatchQty()` | uint | ↔ | 감시 잔량 |
| 9 | `buy_min_trade_qty` | `buyMinTradeQty()` | uint | ↔ | 최소 체결수량 |
| 10 | `buy_watch_side` | `buyWatchSide()` | string | ↔ | 첫 글자. `'1'`=매수호가, 그 외=매도호가 |
| 11 | `buy_trade_qty_enabled` | `buyTradeQtyEnabled()` | bool | ↔ | 체결수량 조건 |
| 12 | `buy_enabled` | `buyEnabled()` | bool | ↔ | **에코는 `cfg.buyEnabled && buyArmed`** (소진되면 false) |
| 13 | `sell_order_price` | `sellOrderPrice()` | uint | ↔ | 매도 주문가 |
| 14 | `sell_order_qty` | `sellOrderQty()` | uint | **S→C 전용** | 서버가 Set 시점 `매도가능×비율/100` 스냅샷. 요청값 무시 |
| 15 | `sell_watch_price` | `sellWatchPrice()` | uint | ↔ | 매도 감시가 |
| 16 | `sell_watch_qty` | `sellWatchQty()` | uint | ↔ | 호가잔량. **0 이면 서버가 매도 활성화 거부** |
| 17 | `sell_min_trade_qty` | `sellMinTradeQty()` | uint | ↔ | 체결 임계. **취소 「체결」 항이 재사용** |
| 18 | `sell_enabled` | `sellEnabled()` | bool | ↔ | 에코는 `&& sellArmed` |
| 19 | `sell_trade_qty_enabled` | `sellTradeQtyEnabled()` | bool | ↔ | |
| 20 | `sweep_watch_price` | `sweepWatchPrice()` | uint | ↔ | 한방 감시가 |
| 21 | `sweep_enabled` | `sweepEnabled()` | bool | ↔ | Case2/3 + A3Buy4 공통 게이트 |
| 22 | `sweep_min_tick_count` | `sweepMinTickCount()` | ubyte | ↔ | 호가변경 횟수 |
| 23 | `sweep_recalc_enabled` | `sweepRecalcEnabled()` | bool | ↔ | **WinForms 는 `true` 고정 송신** |
| 24 | `sweep_min_count` | `sweepMinCount()` | ubyte | ↔ | **WinForms 는 `0` 고정** (0 = Case3 비활성) |
| 25 | `sweep_min_rate` | `sweepMinRate()` | uint | ↔ | **BasisPoints** (2950 = 29.5%). WinForms 는 `0` 고정 |
| 26 | `exchange` | `exchange()` | string | ↔ | `"KRX"`/`"NXT"` 화이트리스트. 빈 값→`"KRX"` 정규화. **NXT 미거래 종목은 서버가 ERROR 로 거부** |
| 27 | `sell_order_ratio` | `sellOrderRatio()` | ubyte | ↔ | 매도비율 % **1~100** |
| 28 | `sell_qty_track_enabled` | `sellQtyTrackEnabled()` | bool | ↔ | 잔량추적(래칫). **에코는 접지 않는 원값** |
| 29 | `sell_qty_track_ratio` | `sellQtyTrackRatio()` | ubyte | ↔ | **1~90** (100 금지 — 서버 검증). 취소 잔량추적이 재사용 |
| 30 | `sell_qty_track_baseline` | `sellQtyTrackBaseline()` | uint | **S→C 전용** | 현재 기준선(주) |
| 31 | `buy_order_amount` | `buyOrderAmount()` | uint | ↔ | **단위 만원.** 서버는 보관·에코만. **0 = 서버가 모름 → 클라는 금액 칸을 건드리지 않는다** |
| 32 | `sell_entry_latched` | `sellEntryLatched()` | bool | **S→C 전용** | 매도 진입 확인 래치 **원값**(무장과 접지 않음) |
| 33 | `cancel_qty_enabled` | `cancelQtyEnabled()` | bool | ↔ | 취소:잔량 게이트. 에코는 `&& cancelArmed` |
| 34 | `cancel_watch_qty` | `cancelWatchQty()` | uint | ↔ | 취소 감시 잔량(주) |
| 35 | `cancel_trade_enabled` | `cancelTradeEnabled()` | bool | ↔ | 취소:체결 게이트. 에코는 `&& cancelArmed` |
| 36 | `cancel_qty_track_enabled` | `cancelQtyTrackEnabled()` | bool | ↔ | 옵션. **에코는 접지 않는 원값** |
| 37 | `cancel_qty_track_baseline` | `cancelQtyTrackBaseline()` | uint | **S→C 전용** | **⚠ 현재 relay 생성 코드에 없음 — 재동기화 필요** |

**클라이언트가 보내는 30 + 고정 3:** WinForms `LimitChaserForm.Send()` 는 위 표에서 S→C 전용 4개를 빼고,
`sweepRecalcEnabled:true` / `sweepMinCount:0` / `sweepMinRate:0` 을 **하드코딩**해 총 33 인자를 넘긴다
`[VERIFIED: LimitChaserForm.cs:2695~2735]`. gh-radar 도 같게 한다.

**서버측 게이트 (relay/webapp 이 미리 알아야 조용한 거부를 피한다) `[VERIFIED: Gateway.cpp:1319~1546]`:**

| 조건 | 서버 동작 |
|------|-----------|
| `exchange ∉ {KRX, NXT}` | **저장도 에코도 안 함.** `ServerMessage ERROR` 만 (source=`SetLimitChaser`) |
| `exchange=="NXT"` ∧ crud≠'D' ∧ NXT 미거래 종목 | 동상 (등록 거부) |
| `buy_enabled` ∧ (`buy_order_price==0` ∨ `buy_order_qty==0` ∨ `buy_watch_price==0`) | **저장하되 `buy_enabled=false` 로 눕힘** + ERROR |
| `sell_enabled` ∧ (`sell_order_price==0` ∨ `sell_watch_price==0` ∨ ratio∉1..100 ∨ (track ∧ trackRatio∉1..90)) | `sell_enabled=false` 로 눕힘 + ERROR |
| 취소 활성 ∧ (`buy_order_price==0` ∨ (qty ∧ `cancel_watch_qty==0`) ∨ (trade ∧ `sell_min_trade_qty==0`) ∨ (qty∧track∧ratio∉1..90)) | `cancel_qty_enabled=false`,`cancel_trade_enabled=false` 로 눕힘 + ERROR (`cancel_qty_track_enabled` 는 안 눕힘) |
| 발주 가능 설정(buy∨sell∨cancel) ∧ crud≠'D' ∧ `account_no ∉ 세션 계좌` | **return — 저장·에코 없음.** `ServerMessage ERROR` source=`Account`, isin=cfg.isin |
| crud=='C' ∧ buy·sell·cancel 전부 OFF | **`crud='D'` 로 정규화** = 삭제 (검증·계좌가드 **뒤**에 적용) |

> **핵심:** 서버는 「거부」를 응답 코드로 주지 않는다. **에코가 아예 안 오거나(계좌·거래소 거부), 눕혀진 값으로 온다.**
> 그래서 웹 UI 의 「반영됨」 판정은 **60 에코 수신**이어야 하고, `ServerMessage(level="ERROR", source="SetLimitChaser"|"Account")`
> 를 반드시 사용자에게 보여야 한다 (PC-7 무로그 fail-safe 금지).

**전략 키:** `ISIN:accountNo:exchange` — `WireCodes.StrategyKey()` `[VERIFIED: WireCodes.cs:163]`
예: `KR7005930003:1234567890:KRX`. 서버 `LimitChaser::MakeKey` 와 동형.
`DisableStrategiesReq.key` 길이 상한 **64B**(서버 WR-09) — 실제 최대는 12+1+12+1+3 = 29B.

**WinForms 기본값 (신규 폼 시딩 참고) `[VERIFIED: LimitChaserForm.cs:129~178]`:**

| 상수 | 값 | 비고 |
|------|----|------|
| `DEFAULT_BUY_WATCH_QTY` | 10,000 | 매수 감시잔량 |
| `DEFAULT_BUY_ORDER_AMOUNT` | **10** (만원) | Designer 기본 20,000 과 다름 — 리셋 시 10 |
| `DEFAULT_BUY_MIN_TRADE_QTY` | 30,000 | |
| `DEFAULT_SELL_WATCH_QTY` | 10 | |
| `DEFAULT_SELL_QTY_TRACK_RATIO` | 50 | |
| `DEFAULT_SELL_MIN_TRADE_QTY` | 30,000 | |
| `DEFAULT_SELL_ORDER_RATIO` | 100 | |
| `DEFAULT_SWEEP_MIN_TICK_COUNT` | 3 | |
| `DEFAULT_CANCEL_QTY` | 10 | |
| 게이트 5종 | 전부 `false` | 매수/매도/한방/취소잔량/취소체결/취소추적 |
| `buy_watch_side` | `Ask`("0") | |
| `CONFIRM_WATCH_DEVIATION_PCT` | 5 | WinForms 조건부 확인 모달 임계 — **웹은 D-05 로 확인 없음** |
| `RespTimeoutMs` | 3000 | 서버 무응답 판정 |

**가격 5칸 시딩:** 종목 선택 시 `buyWatchPrice`/`buyOrderPrice`/`sellWatchPrice`/`sellOrderPrice`/`sweepWatchPrice`
= **상한가**로 1회 시딩. 서버 에코가 있으면 서버값이 이긴다 `[VERIFIED: SeedFromUpperLimitOnce(), LimitChaserForm.cs:711]`.

**매수수량 산출식 (유일 지점):** `qty = floor(buyOrderAmount(만원) × 10000 / buyOrderPrice)`, `price<=0`이면 0.
long 으로 계산 후 좁힌다(uint 래핑 방지) `[VERIFIED: BuyOrderQtyFromAmount(), LimitChaserForm.cs:2809~2817]`.
**역산 금지** — 수량×가격÷10000 은 나머지 손실로 왕복이 깨진다(11 D-15).

**예상 매도수량 (표시 전용):** `sellableQty × sellOrderRatio / 100`. `sellableQty` 는 계좌 스토어(67 델타)에서 읽는다 —
gh-radar 에서는 `RelayAccountState.hold[].sellableQty` `[VERIFIED: LimitChaserForm.cs:2394~2400 · packages/shared/src/relay.ts]`.

### B. `SetVITrigger` — 5 필드 (`.fbs:469~483`)

| fbs | TS 접근자 | 타입 | 규약 |
|-----|-----------|------|------|
| `account_no` | `accountNo()` | string | 최대 12자 |
| `order_amount_krw` | `orderAmountKrw()` | **ulong → bigint** | **원 단위.** UI 는 만원 입력 → ×10,000. ⚠ bigint→Number 변환 필요 |
| `check_rate` | `checkRate()` | int | 정수 % (25 = 25% 이상) |
| `price_type` | `priceType()` | string | 첫 글자. `'L'`=하한가, 그 외=`'U'` 상한가. **폼은 U 고정, 노출 안 함** |
| `run` | `run()` | bool | 가동 |

서버 게이트 `[VERIFIED: Gateway.cpp:1649~1707]`:
- `run ∧ order_amount_krw==0` → **저장하되 `run=false`** + `ServerMessage ERROR` (source=`SetVITrigger`, **isin=""**)
- `run ∧ account_no ∉ 세션 계좌` → **저장하지 않음.** ERROR(source=`Account`, **isin=""**) + **저장본(또는 run=false 인 요청값) 을 에코**
- 그 외 → 저장 + 세션 전 연결 에코(Notice)

> **`ServerMessage` 로 VI 거부를 판정하는 규칙** `[VERIFIED: WireCodes.IsStrategyRejectMessage()]`:
> `level=="ERROR"` ∧ (`source=="SetVITrigger"` ∨ (`source=="Account"` ∧ `isin` 이 빈 문자열)).
> `Account` 거부는 상따·VI 가 공유하므로 **isin 이 비었을 때만 VI 몫**이다. 이 판정을 relay 나 웹앱의 한 함수에만 둔다.

`GetVITriggerReq(21)` → 전략 없으면 **빈 `SetVITriggerResp`(테이블 없음) Envelope** 를 보낸다(무응답 금지).
즉 웹은 「빈 61」을 **미등록**으로 읽어야 하고, 이때 **입력값은 그대로 두되 run 만 내린다**(WinForms CR-01 규율).

### C. VI 주문 추적 (`VIOrderItem` / `VIOrderList` / `ConfirmVIOrderReq`)

`VIOrderItem` 15 필드 `[VERIFIED: .fbs:766~785 + 생성 TS]`:

| fbs | TS | 타입 | 비고 |
|-----|----|------|------|
| `isin` | `isin()` | string | 12자 |
| `market` | `market()` | string | "K"/"Q" — 취소 `DirectOrderReq.market` 원천 |
| `account_no` | `accountNo()` | string | |
| `order_no` | `orderNo()` | string | **`""` = 접수 전(Pending) → 확인 체크 불가** |
| `order_qty` | `orderQty()` | uint | |
| `order_price` | `orderPrice()` | uint | 발주 시 상한가 |
| `trigger_price` | `triggerPrice()` | uint | VI 발동가 |
| `base_price` | `basePrice()` | uint | 전일대비 % 계산용 |
| `vi_end_time` | `viEndTime()` | string | `"HHMMSSuuu"` 9자 |
| `deadline110_ms` | `deadline110Ms()` | **long → bigint** | epoch ms. ⚠ Number 변환 |
| `deadline119_ms` | `deadline119Ms()` | **long → bigint** | epoch ms. ⚠ Number 변환 |
| `confirmed` | `confirmed()` | bool | 서버 영속 |
| `confirm_locked` | `confirmLocked()` | bool | **서버 계산 — 클라 재계산 금지** |
| `state` | `state()` | string | `Pending`\|`Accepted`\|`Cancelling`\|`Cancelled`\|`Filled`\|`Rejected` |
| `filled_qty` | `filledQty()` | uint | **부분체결은 별 상태가 아니라 `Accepted ∧ filledQty>0`** (클라 파생 `PartiallyFilled`) |

`VIOrderList`: `is_snapshot`(true=전량 교체 / false=항목별 upsert) + `items`(0건도 길이 0 벡터).

`ConfirmVIOrderReq(33)`: `order_no`(10자) + `confirmed`(같은 메시지로 on/off).
- `order_no` 없거나 빈 문자열 → **서버가 드롭(응답 없음)** → 웹은 보내지 않는다.
- 반영되면 서버가 `Server::ConfirmVIOrder` 안에서 저장 + 전 연결 73 푸시. Gateway 는 추가 응답을 보내지 않는다.
- 늦은 확인(`confirm_locked`) → 현재 항목만 `PushVIOrderList({item}, is_snapshot=false)` 로 되돌린다.
- 대상 없음(타 user·미추적) → **응답 없음**. 웹은 타임아웃 UI 를 만들지 말고 낙관 반영 후 73 으로 정정한다.

**VI 마감알림 (클라 로컬) `[VERIFIED: VITriggerForm.cs:120~127, 1610~1628]`:**
`vi_end_time` 을 `HH MM SS mmm` 로 파싱해 오늘 날짜에 붙이고 **−10초**(`ViAlertLeadSeconds`)에 알린다.
파싱 실패·과거 시각이면 **수신 시각 +110초**(`ViAlertFallbackSeconds`) 폴백.

### D. `DisableStrategiesReq(14)` / `DisableStrategiesResp(65)`

- `key==""` → 세션의 상따 **전부 + VI**. `key` 있으면 그 한 건. 어느 쪽이든 **등록 유지, 발주 게이트만 내림**(삭제 아님).
- 서버 순서: 키별 60/61 에코를 **세션 전 연결에 먼저** 보낸 뒤 65 집계를 **요청 연결에만**.
  → 웹이 65 를 받은 시점에는 이미 모든 행이 OFF 다. **웹은 65 를 「완료 신호」로만 쓰고 상태는 에코로 갱신한다.**
- `DisableStrategiesResp`: `disabled_count`(uint) + `vi_disabled`(bool).
- `StrategyManager` 가 없어도 `disabled_count=0` 정상 응답 (무응답 금지).

### E. `DirectOrderReq(2)` — wss 이관 대상

이미 `relay/src/dma/envelope.ts` 에 완성된 빌더·파서가 있다 `[VERIFIED]`:
- `buildDirectOrderReq(req: DirectOrderInput): Uint8Array` (envelope.ts:722)
- `parseOrderResp(env): ParsedOrderResp | null` (envelope.ts:822)
- `toWireSide` / `toWireMarket` / `toWireOrderType` / `ORDER_CONDITION="0"` (envelope.ts:662~692)
- `OrderBuildError` — 수량 0·취소 원주문번호 누락 등 조립 단계 최후 방어

**이관은 「전송 계층 교체」이지 「프로토콜 재작성」이 아니다.** `order-api.ts` 의 HTTP 핸들러 몸통(대기 큐 · 5초 타이머 ·
`statusOf` · `filledQtyOf` · 계좌 화이트리스트 대조)을 그대로 wss 핸들러로 옮긴다.

---

## Relay 통합 지점 (실측 시그니처)

### `relay/src/generated/stock-dma/` — **재동기화 필요** `[VERIFIED: sync-relay-schema.sh --check + 수동 diff]`

```
$ /Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check
      flatc version 25.12.19
      생성 .ts        : 41 개
      신규/변경 예정  : 2 개
      삭제 예정       : 없음
      .fbs 사본       : 갱신 예정
```

차이 2건(수동 diff 로 특정):

| 파일 | 누락된 것 |
|------|-----------|
| `stock-dma/set-limit-chaser.ts` | `cancelQtyTrackBaseline()` (vtable offset 92) · `addCancelQtyTrackBaseline`(field 44) · `startObject(44→45)` |
| `stock-dma/unfilled-state.ts` | `orderTime()` (offset 22) · `addOrderTime`(field 9) · `startObject(9→10)` |

**조치:** Wave 0 에서
```bash
cd /Users/alex/repos/gh-trade/server && ./scripts/sync-relay-schema.sh
```
을 실행하고, gh-radar 쪽 `relay/src/generated/**` + `StockDMA.fbs` 사본 변경을 **gh-radar 저장소에서 커밋**한다
(스크립트는 커밋하지 않는다). gh-trade 저장소는 무변경(정본 .fbs 는 이미 최신).

`unfilled-state.orderTime` 은 이 phase 의 요구사항은 아니지만 **같은 재동기화에 딸려 온다** — `RelayUnfilled` 계약에
넣을지는 재량(미체결 행에 주문시각 표시 = UI-SPEC 미요구). 넣지 않아도 생성 코드에 접근자가 생기는 것 자체는 무해하다.

### `relay/src/dma/msg-type.ts` — 화이트리스트 확장

현재 `MSG` 상수와 `INBOUND_MSG_TYPES` 에 **전략 계열이 의도적으로 빠져 있다** `[VERIFIED: msg-type.ts 주석]`:
> 「상따/VI/종목마스터 계열(10·11·27·33·57·72·73 등)도 같은 이유로 제외한다」

추가할 값:
```ts
// 요청
SetLimitChaserReq: 10, SetVITriggerReq: 11, DisableStrategiesReq: 14,
GetVITriggerReq: 21, GetLimitChaserListReq: 24,
ConfirmVIOrderReq: 33, GetVIOrderListReq: 34,
// 응답·푸시 (INBOUND_MSG_TYPES 에도 추가)
VIOrderNotice: 56, SetLimitChaserResp: 60, SetVITriggerResp: 61,
GetLimitChaserListResp: 64, DisableStrategiesResp: 65,
GetVIOrderListResp: 72, VIOrderListPush: 73,
```
**PC-12 적용:** 화이트리스트를 넓히면 `SubscriptionHub.#onFrame` 의 `default:` 로 조용히 떨어지던 프레임이 새로 들어온다.
새로 통과하는 7개(56/60/61/64/65/72/73)에 **전부 명시 case 를 만들고**, 파싱 실패는 로그를 남긴다.
`relay/src/dma/__tests__/codec.test.ts` 가 생성 enum 과 `MSG` 를 대조하므로 그 테스트도 갱신 대상이다.

### `relay/src/ws/protocol.ts` (109줄)

```ts
export const RelayAuthSchema  // { t:"auth", token: string(1..4096) }
export const RelaySubSchema   // { t:"sub",  isin: 12자 /^[A-Z]{2}[A-Z0-9]{10}$/, ex: "KRX"|"NXT" }
export const RelayUnsubSchema
export const RelayInboundSchema = z.discriminatedUnion("t", [Auth, Sub, Unsub])
export function parseInbound(raw: string): RelayInbound | null   // total, throw 안 함
export function encode(msg: RelayOutbound): string               // bigint 섞이면 TypeError throw (D-34)
```
파일 상단 주석에 **「주문 메시지를 받지 않는다. 주문은 `POST /api/orders` 전용이다 (D-08)」** 가 박혀 있다 — D-02 로 이 문장을 뒤집는다.
`IsinSchema` / `ExchangeSchema` 를 전략 스키마가 재사용한다.

### `relay/src/ws/fanout.ts` (580줄)

| 심볼 | 값/시그니처 | 이 phase 에서의 의미 |
|------|------------|---------------------|
| `AUTH_TIMEOUT_MS` | 5_000 | 첫 메시지 상한 |
| `HEARTBEAT_INTERVAL_MS` | 30_000 | |
| `MAX_PAYLOAD_BYTES` | 65,536 | 전략 프레임도 여유 있음 |
| `BACKPRESSURE_LIMIT_BYTES` / `BACKPRESSURE_STRIKES` | 1MB / 3 | 전략 스냅샷 대량 전송 시 유의 |
| `DEFAULT_WS_PATH` | `"/ws"` | |
| `interface FanoutSessions` | `acquire(userId, creds): DmaSession` · `release(userId): void` | 주문 핸들러가 `sessions.get()` 을 쓰려면 **인터페이스 확장 필요** |
| `type WsFanoutDeps` | `{ server?, supabase, sessions, hub, credKey, path?, authTimeoutMs?, heartbeatMs?, backpressureLimitBytes? }` | 주문 기록 큐(`OrderStore`)를 여기로 주입 |
| `class WsFanout` | `stats()` · `handleUpgrade()` · `closeAll(code?, reason?, graceMs?)` | |
| private `#onMessage(conn, raw, isBinary)` | fanout.ts:321 | 바이너리 거부 → `parseInbound` → 미인증이면 `#onFirstMessage` |
| private `#onFirstMessage` | :345 | 토큰 검증 → `#lookupCredentials` → `sessions.acquire` → `hub.attach` → `#register` → **`#send(conn, session.stateFrame())`** → `for (acct of hub.getAccountStates(userId)) #send(conn, acct)` |
| private `#onAuthedMessage(conn, userId, msg)` | :400 | `auth` 재인증 무시 · `conn.unauthorized` 면 `{t:"state",s:"unauthorized"}` 되돌림 · `sub`/`unsub` 분기 |
| private `#deliver(userId, msg)` | :504 | **그 사용자의 소켓 집합에만** (T-15-02) |
| private `#send(conn, msg)` | :513 | 동기 write + 백프레셔 |

**전략 스냅샷 삽입 지점:** `#onFirstMessage` 의 `getAccountStates` 루프 **바로 뒤**.
계좌 스냅샷과 정확히 같은 자리·같은 이유(「구독을 기다리면 아무 종목도 열지 않은 탭이 영원히 빈 화면」)다.

**주문/전략 인바운드 분기 지점:** `#onAuthedMessage` 의 `conn.unauthorized` 가드 **바로 뒤**, `keyOf` 계산 **앞**.
현재 코드는 가드 직후 `const key = keyOf(msg.isin, msg.ex)` 를 무조건 실행하므로 — 전략 메시지에는 `isin`/`ex` 가 없다 —
**그 줄을 sub/unsub 분기 안으로 밀어 넣어야 한다.** 이걸 놓치면 런타임 `undefined` 키가 만들어진다.

### `relay/src/hub/subscription-hub.ts` (756줄) — 전략 캐시의 본보기

| 심볼 | 시그니처 |
|------|----------|
| `interface HubSession` | `userId` · `isReady` · `send(payload: Uint8Array): boolean` · `on("frame"\|"ready", …)` |
| `type HubFanoutEvent` | `{ userId: string; msg: RelayOutbound }` |
| `type HubOrderEvent` | `{ userId: string; notice: ParsedOrderResp }` |
| `class SubscriptionHub extends EventEmitter` | `on("fanout"\|"order")` |
| | `attach(session)` — **멱등**, 세션 교체 시 캐시 폐기·참조계수 유지 |
| | `detach(userId)` · `subscribe/unsubscribe(userId, isin, ex)` · `releaseAll` · `resubscribeAll` |
| | `requestAccountState(userId)` · `getAccountStates(userId): RelayAccountState[]` |
| | `getSnapshot(userId,isin,ex): RelayQuote \| undefined` · `getTape(...)` · `refCount(...)` · `stats()` · `closeAll()` |
| private `#onFrame(userId, session, e)` | :418 — **세대 대조 후** `switch (e.msgType)` |
| private `#onReady(userId, session)` | :699 — `resubscribeAll` + `requestAccountState` **한 자리** (Pitfall 4) |
| private `#fanout(userId, msg)` | :708 — `emit("fanout", {userId,msg})` |
| private `#clearCaches(userId)` | :712 — prefix 순회 삭제 |
| 캐시 맵 | `#quotes` `#tapes` `#accountStates` — 키는 `` `${userId}|${isin}|${ex}` `` 또는 `` `${userId}|${accountNo}` `` |

**전략 캐시 권고 구조** (Claude 재량 — D-12):
```ts
#limitChasers = new Map<string /* `${userId}|${strategyKey}` */, RelayLimitChaser>();
#viTriggers   = new Map<string /* userId */, RelayViTrigger>();
#viOrders     = new Map<string /* `${userId}|${orderNo}` */, RelayViOrderItem>();
```
- `#onReady` 에 **`requestStrategySnapshot(userId)`** 를 한 줄 추가 → `send(buildGetLimitChaserListReq())`,
  `send(buildGetVITriggerReq())`, `send(buildGetVIOrderListReq())` 3연발. 「재구독·계좌 재요청과 같은 트리거 한 자리」 규율 유지.
- 60 수신 → `crud==='D'` 면 캐시 delete, 아니면 upsert → `#fanout`. 61 → VI upsert(빈 테이블이면 delete) → `#fanout`.
- 64 → **전량 교체** 후 `{t:"lc.snap", items:[...]}` 1프레임. 72 → VI 주문 전량 교체. 73 → `is_snapshot` 에 따라 교체/upsert.
- 65 → 그대로 팬아웃(완료 신호). 56 → 그대로 팬아웃(발주 통지).
- `#clearCaches` 에 3맵 삭제를 **반드시** 추가 (세션 교체 시 남으면 옛 전략이 화면에 남는다).

**빈 요청 Envelope (24/34) 빌더 — envelope.ts 에 추가:**
`GetSymbolMasterReq(27)` 선례가 있으나 relay 에 빌더가 없다. 조립은 `EnvelopeBuilder` 에 `msg_type` 만 넣고 `Finish` 하면 된다.
`buildGetQuoteReq`(envelope.ts:332) 를 본보기로 3줄짜리 함수 3개를 만든다.

### `relay/src/dma/session.ts` (584줄) / `session-manager.ts` (229줄)

| 심볼 | 값/시그니처 |
|------|------------|
| `LOGIN_RESP_TIMEOUT_MS` / `ACCOUNT_RESP_TIMEOUT_MS` | 5000 / 5000 |
| `NO_ACCOUNTS_MESSAGE` | `"서버에 등록된 계좌가 없습니다"` |
| `type DmaSessionState` | `"idle" \| RelaySessionState` |
| `type SessionReadyEvent` | `{ generation: number; accounts: RelayAccount[] }` |
| `class DmaSession extends EventEmitter` | `on("state"\|"ready"\|"frame")` · `stateFrame(msg?, attempt?): RelayStateMsg` · `start()` · `manualReconnect()` · **`send(payload: Uint8Array): boolean`** · `close()` · `allowedAccounts` · `isReady` |
| `#onFrame(e)` | :309 — **`this.emit("frame", e)` 를 먼저** 한 뒤 50/55 만 자기가 처리. 전략 프레임은 그대로 Hub 로 흐른다 → **session.ts 변경 불필요** |
| `#onAccountsMatched(gen)` | :434 — `emit("ready", {generation, accounts})` |
| `SESSION_GRACE_MS` | 300_000 (env `SESSION_GRACE_MS`) |
| `SessionManager` | `acquire(userId, creds)` · `release(userId)` · **`get(userId): DmaSession \| undefined`** |

**결론: `session.ts` 는 손대지 않는다.** 전략 프레임 처리는 전부 Hub 쪽이다. `#onReady` 훅만 Hub 에서 확장한다.

### `relay/src/order/order-api.ts` (565줄) — 이관 원본

| 심볼 | 값 |
|------|----|
| `ORDER_RESP_TIMEOUT_MS` | **5000** |
| `ORDERS_PATH` | `"/internal/orders"` (제거 대상) |
| `HEALTH_PATH` | `"/healthz"` (유지) |
| `interface OrderApiSessions` | `get(userId): OrderApiSession \| undefined` |
| `interface OrderNoticeSource` | `on("order", cb)` |
| `interface OrderQueue` | `enqueueUpdate(u: OrderUpdate)` |
| `OrderRequestSchema` (zod) | `userId(uuid)` · `orderRowId(uuid)` · `isin(12, regex)` · `exchange` · `market` · `side` · `orderType` · `orgOrderNo?` · `qty(int>0)` · `price(int>0)` · `accountNo(1..12)` |
| `statusOf(notice, requestedQty): DmaOrderStatus \| undefined` | `"R"`→rejected · `"A"`→accepted · `"C"`→cancelled · `"M"`→accepted · `"E"`→(requestedQty null 이면 undefined, 아니면 qty≥requested ? filled : partially_filled) · default→rc===0?accepted:rejected |
| `filledQtyOf(notice)` | `noticeType==="E"` 일 때만 `notice.quantity` |
| `type PendingOrder` | `{ orderRowId, isin, qty, timer, settle }` |
| 상관 자료구조 | `Map<userId, PendingOrder[]>` — userId 로 1차 격리, **ISIN 으로 2차 매칭** |
| 처리 순서 (그대로 이식) | ① 세션 Ready 확인 ② `session.allowedAccounts` 계좌 화이트리스트 ③ 취소 원주문번호 필수 ④ **대기 등록을 송신보다 먼저** ⑤ 송신 실패 시 대기 즉시 제거 |
| 타임아웃 응답 | HTTP 202 + `{error:{code:"ORDER_TIMEOUT"}}` — **「실패」가 아니라 「결과 모름」** |

**wss 이관 시 바뀌는 것:**
- `userId`/`orderRowId` 는 요청 바디가 아니라 **연결(conn.userId)** 과 **relay 자신이 insert 한 행 id** 에서 온다 → 스키마에서 제거.
- `isin`/`market` 은 브라우저가 6자 코드만 보내던 D-28 계약이 깨진다 — **relay 가 `stocks` 를 조회해야 한다.**
  `relay/src/store/symbols.ts` 의 `SymbolMap` 이 이미 ISIN→이름·단축코드 맵을 부팅 1회 + 매일 08:30 적재한다 `[VERIFIED: index.ts 주석]`.
  **역방향(코드→ISIN·market) 조회가 있는지 확인이 필요하다** → Assumptions Log A3.
- 타임아웃 응답은 HTTP status 가 아니라 `{t:"order.result", rid, status:"timeout", …}` 프레임 1건.
- **중복 전송 방지:** 같은 `rid` 재전송, 또는 같은 (userId, isin, side, price, qty) 가 대기 중이면 거부 (재량, 권고).

### `relay/src/store/orders.ts` (288줄) — insert 확장 대상

| 심볼 | 값 |
|------|----|
| `ORDER_FLUSH_INTERVAL_MS` / `ORDER_MAX_RETRIES` / `ORDER_QUEUE_LIMIT` | 200 / 1 / 10,000 |
| `type OrderUpdate` | `{ orderRowId?, orderNo?, status?, resultCode?, noticeType?, message?, filledQty? }` |
| `type OrderSelector` | `{ column: "id" \| "order_no"; value: string }` |
| `type OrderUpdateSink` | `(sel, patch) => Promise<void>` |
| `supabaseOrderSink(supabase)` | `.from("dma_orders").update(patch).eq(sel.column, sel.value)` |
| `class OrderStore` | `start()` · `enqueueUpdate(u)` · `close()` · `stats()` · (`flushNow()`) |
| `selectorOf(update)` | `id` 우선, 없으면 `order_no` |
| `rowPatchOf(update)` | **camelCase↔snake_case 경계의 유일 지점**. `filled_qty` 는 `Math.max(0, …)` |

**D-03 확장:** `insertOrderRequest` 에 해당하는 경로가 relay 에 **없다**(현재 server `services/dma-orders.ts` 소관).
`OrderStore` 에 `insertRequest(row): Promise<string /* id */>` 를 추가하되 — **insert 는 큐잉하면 안 된다**
(반환 id 가 상관 1순위 키라 동기적으로 필요하다). 즉 insert 는 `await`, update 만 큐잉이다.

### `relay/src/index.ts` (212줄) · `config.ts` (86줄)

- `createOrderApi({ relayOrderSecret, dmaHost, ... , orders: hub, orderStore })` — 주문 라우트는
  `deps.orders && deps.orderStore` 가 둘 다 있어야 열린다. **D-02 후에는 이 두 인자를 넘기지 않으면 라우트가 사라진다**
  (코드 삭제 전 단계적 비활성화가 가능) `[VERIFIED: order-api.ts:344 · index.ts]`.
- `config.relayOrderSecret: string` 은 **required** 다 `[VERIFIED: config.ts:34]` — `relaySecretGuard` 가 `/healthz` 를
  포함한 **모든** 내부 HTTP 요청에 걸린다. 주문 라우트를 지워도 `/healthz` 가 남는 한 이 env 는 유지하는 것이 안전하다(deferred 항목).

---

## Shared 계약 (`packages/shared/src/relay.ts`, 442줄)

현재 export `[VERIFIED: grep]`:
```
RelayExchange, RelaySessionState, RELAY_STATE_LABELS, RELAY_WS_CLOSE,
RelayAuthMsg, RelaySubMsg, RelayUnsubMsg, RelayInbound,
RelayAccount, RelayStateMsg, RelayQuote, RelayTapeEntry, RelayTape,
RelayHolding, RelayUnfilled, RelayAccountState, RelayOrderMsg, RelayServerMsg, RelayOutbound,
OrderSide, OrderType, OrderMarket, ORDER_CONDITION_NORMAL,
CreateOrderRequest, DmaOrderStatus, CreateOrderResponse, DmaOrderRow
```

- `RelayInbound = RelayAuthMsg | RelaySubMsg | RelayUnsubMsg`
- `RelayOutbound = RelayStateMsg | RelayQuote | RelayTape | RelayAccountState | RelayOrderMsg | RelayServerMsg`
- `RelayOrderMsg = { t:"order", no, nt, rc, msg, org, p, q, x }` — **`side` 를 의도적으로 싣지 않는다**(취소·정정 통보의 매매구분은 신뢰 불가)
- webapp·relay 둘 다 `@gh-radar/shared` 에서 import 한다. `pnpm typecheck` 은 shared 를 먼저 build 한다 `[VERIFIED: 루트 package.json]`.

**⚠ 이름 충돌:** 새 인바운드 주문 메시지를 `{t:"order"}` 로 두면 **기존 아웃바운드 `RelayOrderMsg.t === "order"` 와 충돌**한다.
`RelayInbound`/`RelayOutbound` 는 별개 유니온이라 타입 레벨에서는 컴파일되지만, 로그·테스트·디버깅에서 구분이 사라진다.
**권고:** 인바운드는 `{t:"order.new"}` / `{t:"order.cancel"}`, 응답은 `{t:"order.result"}`, 기존 푸시는 `{t:"order"}` 유지.

**권고 인바운드 추가 (재량 범위):**
```ts
{ t:"lc.set",  crud:"C"|"D", key?: string, ...37필드 중 입력 30+3 }
{ t:"vi.set",  accountNo, orderAmountKrw:number, checkRate:number, run:boolean }
{ t:"vi.confirm", orderNo:string, confirmed:boolean }
{ t:"strategies.disable", key?: string }        // 생략·"" = 전체
{ t:"order.new"|"order.cancel", rid:string, ... }
```
**권고 아웃바운드 추가:**
```ts
{ t:"lc",      item: RelayLimitChaser }          // 60 에코 1건 (crud "D" 포함)
{ t:"lc.snap", items: RelayLimitChaser[] }       // 64 전량
{ t:"vi",      cfg: RelayViTrigger | null }      // 61 (null = 미등록)
{ t:"vi.list", snap: boolean, items: RelayViOrderItem[] }   // 72/73
{ t:"vi.notice", ... }                            // 56
{ t:"strategies.disabled", count:number, viDisabled:boolean }  // 65
{ t:"order.result", rid:string, orderNo, resultCode, message, status }
```

---

## Webapp 통합 지점 (실측)

### `webapp/src/lib/use-relay-socket.ts` (631줄) — 전역 승격 대상

| 심볼 | 값 |
|------|----|
| `RELAY_MAX_RECONNECT_ATTEMPTS` | 10 |
| `relayBackoffDelayMs(attempt)` | 지수 백오프 |
| `type RelayStatus` | `RelaySessionState \| "idle"` |
| `type RelayServerMessageEntry` | `RelayServerMsg & { receivedAt: string }` |
| `interface UseRelaySocketOptions` | `{ isin: string; exchange: RelayExchange; enabled?: boolean }` |
| `interface RelaySocketState` | `status · statusLabel · statusMessage · attempt · accounts · quote · tape · account · orders · messages · isStale · send(msg) · reconnect()` |
| 내부 리듀서 | `local-status` · `frame` · `stale` · `switch` 4액션. `applyFrame` 이 `t` 로 분기 — **알 수 없는 `t` 는 무시**(T-15-41) → 새 프레임 타입을 추가해도 구버전 브라우저가 터지지 않는다 |
| 연결 effect | `isin/exchange` 에 의존하지 않는다. **종목 전환 = 재구독**. `authAckedRef` → `setAuthEpoch` → 구독 effect |
| 인증 | `createClient().auth.getSession()` → `ws.send({t:"auth",token})` on open |
| 세션 없음 | `{status:"unauthorized"}` — 백오프 없음 |
| 스냅샷 캐시 | `quoteCacheRef: Map<"isin|ex", RelayQuote>` |
| 지연 프레임 필터 | `wantedKeyRef` 로 이전 키 `q`/`tape` 드롭 (T-15-40) |

**승격 전략 (권고 — 최소 변경):**
1. `useRelaySocket` 의 **연결·인증·리듀서 부분은 그대로** 두고, `isin`/`exchange` 옵션을 제거한 `useRelayConnection()`(내부용)으로 분리.
2. `RelayProvider` 가 그 연결을 소유하고 컨텍스트로 `RelaySocketState` + `subscribe(isin, ex)` / `unsubscribe(isin, ex)` 를 노출.
3. **구독 ref-count** 는 프로바이더가 `Map<key, count>` 로 관리(relay Hub 와 같은 규율). 0→1 에서만 `sub`, 1→0 에서만 `unsub`.
4. `stock-orderbook-section.tsx` 는 `useRelaySocket({isin, exchange, enabled})` → `useRelaySubscription({isin, exchange, enabled})`
   로 한 줄 교체. **반환 형태를 동일하게 유지하면 나머지 499줄이 무변경**이다.
5. `quote`/`tape` 는 전역 상태에 여러 종목이 섞이므로, `useRelaySubscription` 이 **자기 키에 해당하는 것만** 골라 반환한다.
   현재 `wantedKeyRef` 필터가 훅 안에 있으므로 이 로직이 프로바이더→소비자 경계로 이동한다.

**회귀 대상 (반드시 통과시켜야):** `webapp/src/lib/__tests__/relay-socket.test.ts` · `webapp/e2e/specs/orderbook.spec.ts` ·
`stock-detail-tabs.spec.ts` · `auth-guards.spec.ts` · `smoke.spec.ts` · `a11y.spec.ts`.

### `webapp/src/app/layout.tsx` (53줄)

현재 중첩: `ThemeProvider > AuthProvider > ChatProvider > WatchlistSetProvider > {children}` + `ChatFab` + `ChatSheet`.
`RelayProvider` 는 **AuthProvider 안쪽**(세션 필요) · `ChatProvider` 와 형제 또는 안쪽 어디든 무방.
권고: `AuthProvider > RelayProvider > ChatProvider > WatchlistSetProvider`.

### `webapp/src/components/layout/app-sidebar.tsx` (69줄)

```ts
const NAV = [
  { href: "/",          label: "홈",           icon: Home },
  { href: "/scanner",   label: "스캐너",        icon: Activity },   // → "상승률 상위"
  { href: "/themes",    label: "테마",          icon: Layers },
  { href: "/watchlist", label: "관심종목",       icon: Star },
  { href: "/chat",      label: "AI 애널리스트",  icon: MessageSquare },
] as const;
```
- `<nav aria-label="주 메뉴" className="flex h-full flex-col justify-between">` + `<ul>` + `<UserSection />`
- 활성 판정: `pathname === href` (**정확 일치**) → `/trading/limit-chaser/[key]` 에서 부모 「상따」를 활성으로 보이려면
  `startsWith` 분기가 필요하다.
- `data-nav-item` 속성 + `aria-current="page"` 유지 필수 (drawer 자동 닫힘 계약).

### `webapp/src/components/layout/app-shell.tsx` (91줄)

- 데스크톱 `aside w-60`(240px) `hidden lg:block`, 모바일 `Sheet side="left" w-[min(280px,85vw)]`.
- Drawer 자동 닫힘: `onClick` 에서 조상 순회하며 `tagName==='A'` 또는 `BUTTON[data-nav-item]` 이면 닫는다.
  → **그룹 소제목을 `<button>` 으로 만들면 안 된다**(D-16 클릭 불가). `<li>` + 시각 스타일만.
- `hideSidebar` 는 `/design`·error/not-found 전용.

### `webapp/src/lib/orders-api.ts` (151줄) — 부분 제거

| 심볼 | 조치 |
|------|------|
| `ORDER_REQUEST_TIMEOUT_MS = 9_000` | 제거(wss 로 이관) |
| `ORDER_ERROR_CODES` (8종) / `OrderErrorCode` | **일부 유지** — wss 결과 코드로 재사용 가능 |
| `UNKNOWN_OUTCOME_CODES = {ORDER_TIMEOUT, TIMEOUT, NETWORK_ERROR}` | **유지 (핵심 규율)** |
| `createOrder(req)` | **제거** (D-02) |
| `listOrders(date?)` | **유지** |
| `orderErrorCode` / `orderErrorMessage` / `isUnknownOutcome` | 유지 — wss 결과에도 같은 판정을 적용 |

**소비자 2곳:** `account-panel.tsx:148`(취소) · `order-panel.tsx:344`(신규) `[VERIFIED: grep]` — 둘 다 wss 호출로 교체.

### shadcn 컴포넌트 현황 `[VERIFIED: ls webapp/src/components/ui/]`

**보유:** `ai-pick-badge, badge, button, card, chart, command, dialog, input-group, input, number, popover, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle-group, toggle, tooltip`
**부재(설치 필요):** `checkbox`
**부재(비채택 — 설치하지 말 것):** `select, progress, accordion, collapsible, sidebar, sonner, alert-dialog, label`

### 재사용 가능한 기존 함수

| 함수/컴포넌트 | 위치 | 용도 |
|--------------|------|------|
| `deriveTickSize(askPrices, bidPrices, referencePrice)` | `order-panel.tsx:121` (export) | 호가단위 — **관측값 우선, 없으면 표 폴백** |
| `AccountPanel` props | `account-panel.tsx:80` | `accounts · selectedAccountNo · onAccountChange · account · code · name · isin · currentPrice? · status · onCancelSubmitted? · className?` |
| `searchStocks(q, signal): Promise<Stock[]>` | `lib/stock-api.ts:21` | 종목 검색. **응답에 `isin` 포함** (`MASTER_COLS` 에 isin) |
| `fetchStockDetail(code, signal): Promise<StockDetailResponse>` | `lib/stock-api.ts:31` | `isin` + `upperLimit`/`lowerLimit`/`price` 등 |
| `GlobalSearch()` | `components/search/global-search.tsx:30` | **인자 없음** — 상따 폼용 종목 선택은 이 컴포넌트를 그대로 쓸 수 없다. `searchStocks` 를 직접 호출하는 인라인 검색을 만드는 편이 맞다(재량) |
| `OrderConfirmDialog` | `orderbook/order-confirm-dialog.tsx` | VI 시작/중지·전체 비활성화 확인 |
| `OrderbookLadder` | `orderbook/orderbook-ladder.tsx` | 호가 10단 |
| `RelayStatusBar` | `orderbook/relay-status-bar.tsx` (`data-slot="relay-status-bar"`) | 상태줄 + ServerMessage 누적 |
| `RELAY_STATE_LABELS` | `@gh-radar/shared` | 상태 배지 한글 라벨 9종 |

---

## Server 정리 대상 (D-02)

| 파일 | 조치 |
|------|------|
| `server/src/routes/orders.ts` (186줄) | **`ordersRouter.post("/")` 블록(72~132행) + `recordFailure`(~163행) 제거.** `ordersRouter.get("/")`(166~186) 유지 |
| `server/src/app.ts:87` | `app.use("/api/orders", ordersRouter)` **유지** (GET 이 남는다) |
| `server/src/app.ts:19,43,59` | `RelayClient` import·`AppDeps.relayClient`·`app.locals.relayClient` — POST 제거 후 **미사용** → 삭제 |
| `server/src/server.ts:7,67~91` | `createRelayClient` 결선 삭제 |
| `server/src/services/relay-client.ts` | **파일 삭제** |
| `server/src/services/dma-orders.ts` | `insertOrderRequest` / `updateOrderResult` / `patchFromRelayResult` 는 **relay 로 이식**, server 는 `listTodayOrders` 만 유지 |
| `server/src/config.ts:48-49,102-106` | `relayInternalUrl`·`relayOrderSecret`·`orderTimeoutMs` 제거 |
| `scripts/deploy-server.sh:188,189,205,208,230-233` | `RELAY_INTERNAL_URL`·`ORDER_TIMEOUT_MS` env + `RELAY_ORDER_SECRET` secret 바인딩 + 검증 출력 3줄 제거 |
| `ordersRateLimit` (orders.ts:60) | POST 전용이었다면 제거, GET 에도 걸려 있으면 유지 — **실측 필요** |
| 방화벽 relay 내부포트(10.10.0.0/26 → 8091) | **deferred 항목** — `/healthz` 가 남으므로 규칙 유지 (CONTEXT deferred 목록 명시) |

**제거 순서 (15-20 과의 선후) — 안전:**
15-20 은 **A안 skip-live 로 종결**됐고 `dma_credentials` 는 **0행**이다 `[VERIFIED: 15-LIVE-VERIFICATION.md]`.
즉 REST 주문 경로는 **한 번도 실계좌로 검증된 적이 없다** — 제거해도 「검증된 기능을 잃는」 상황이 아니다.
mock 왕복 증거는 `15-MOCK-ORDER-EVIDENCE.md` 에 남아 있고, wss 이관본은 같은 시나리오를 mock 으로 재현하면 된다.
**권고: 새 wss 주문 경로가 mock 왕복 E2E 로 green 이 된 뒤 같은 wave 안에서 REST 를 지운다**(둘을 동시에 살려 두는 기간을 만들지 않는다 — 두 경로가 같은 `dma_orders` 행을 다투면 상태가 갈린다).

---

## Supabase

### `dma_orders` 현재 스키마 `[VERIFIED: supabase/migrations/20260905120200_dma_orders.sql]`

```
id uuid PK · user_id uuid FK auth.users ON DELETE CASCADE · account_no text
isin text CHECK(length=12) · stock_code text FK stocks(code) ON DELETE SET NULL
exchange text CHECK IN ('KRX','NXT') · market text CHECK IN ('K','Q')
side text CHECK IN ('B','S') · order_type text CHECK IN ('N','C') · org_order_no text
qty int CHECK>0 · price int CHECK>0 · order_no text
status text DEFAULT 'requested' CHECK IN ('requested','accepted','rejected','filled','partially_filled','cancelled','timeout')
result_code int · notice_type text · message text · filled_qty int DEFAULT 0 CHECK>=0
created_at timestamptz · updated_at timestamptz
```
인덱스: `(user_id, created_at DESC)` · `(order_no) WHERE order_no IS NOT NULL`
보안: `ENABLE ROW LEVEL SECURITY` + **정책 0개(default deny)** + `REVOKE ALL FROM PUBLIC` + `REVOKE ALL FROM anon, authenticated` + `GRANT … TO service_role`

### D-03 컬럼 추가 (재량) — 권고 마이그레이션

```sql
ALTER TABLE public.dma_orders
  ADD COLUMN origin text NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual','limit_chaser','vi'));
```
- **정책을 추가하지 말 것** (기존 주석의 「하지 않는 것」).
- 신규 GRANT/REVOKE 불필요 (테이블 단위 권한이 이미 확정).
- 원천: `OrderResp.origin` 필드 — `"VITrigger"`/`"LimitChaser"`/`"Manual"`, 구 서버는 빈 값 `[VERIFIED: WireCodes.FromWireOrigin]`.
  **⚠ `relay/src/dma/envelope.ts` 의 `parseOrderResp` 가 `origin` 을 읽고 있는지 확인 필요** → Assumptions Log A4.
- 자동주문(상따·VI)은 relay 가 **요청을 만들지 않았으므로 insert 행이 없다** — 51 통보가 `order_no` 로 기존 행을 못 찾는다.
  → 자동주문 행은 **통보 수신 시 relay 가 새로 insert** 해야 한다(D-03 「상따·VI 자동주문의 체결 통보도 relay 가 동일하게 기록」).
  이때 `qty`/`price` 는 통보의 값, `origin` 은 `OrderResp.origin` 매핑, `stock_code` 는 SymbolMap 역매핑.
  **`status='requested'` 로 시작하지 않으므로 CHECK 는 문제없다.**

`supabase db push` 는 **[BLOCKING] 게이트**다(Phase 15 15-09 선례).

---

## Runtime State Inventory

> 이 phase 는 rename/refactor 가 아니지만, **REST → wss 이관**과 **relay 캐시 도입**이 런타임 상태를 만든다.

| Category | 실측 결과 | 필요 조치 |
|----------|-----------|----------|
| **Stored data** | `dma_orders` 0행 여부 미확인(운영 DB). `dma_credentials` **0행**(2026-09-06 실측) — 즉 어떤 사용자도 아직 DMA 세션을 만들 수 없다 `[VERIFIED: 15-LIVE-VERIFICATION.md §2]` | `origin` 컬럼 DEFAULT `'manual'` 로 기존 행 무해. **데이터 마이그레이션 불필요** |
| **Live service config** | Cloud Run `gh-radar-server` 리비전 env: `RELAY_INTERNAL_URL`·`ORDER_TIMEOUT_MS`(env) + `RELAY_ORDER_SECRET`(Secret Manager 바인딩). **git 의 deploy 스크립트를 고쳐도 기존 리비전은 그대로다** | `deploy-server.sh` 수정 후 **재배포해야** 리비전에서 사라진다. Secret Manager 의 `gh-radar-relay-order-secret` 자체는 relay 가 아직 쓰므로 **삭제 금지** |
| | GCE VM `radar-gw` 의 relay Docker 컨테이너 env(`RELAY_ORDER_SECRET` 등) | `deploy-relay.sh` 재배포. `config.relayOrderSecret` 이 required 인 한 값 유지 |
| | 방화벽 규칙 `10.10.0.0/26 → 8091` | `/healthz` 가 남으므로 **유지**(deferred) |
| **OS-registered state** | Cloud Scheduler·Cloud Run Job 은 주문 경로와 무관 | 없음 |
| **Secrets / env vars** | `gh-radar-relay-order-secret`(Secret Manager) — server 바인딩만 끊고 secret 은 존치. `DMA_CRED_KEY`·`SESSION_GRACE_MS`·`DMA_HOST` 무변경 | server 리비전에서 바인딩 제거 |
| **Build artifacts** | `relay/dist/`(tsc) · `webapp/.next/` · `packages/shared/dist/`(tsup) — **`relay/src/generated/` 재동기화 후 relay 재빌드 필수** | `pnpm --filter @gh-radar/shared build` 선행 + relay `pnpm build` |
| **브라우저 로컬** | 신규: VI 마감알림 설정 `localStorage` 키(재량). 기존 키와 충돌 없게 `gh-radar:vi-alert` 류 네임스페이스 권고 | 없음(신규) |

---

## Common Pitfalls

### 1. `SetLimitChaser` 위치 인자 생성 함수 금지 — **relay 에도 그대로 적용**
**무엇이 잘못되나:** `SetLimitChaser.createSetLimitChaser(builder, ...36개 위치 인자)` 를 쓰면 deprecated 슬롯이 인자 목록에서
빠져 있어 **뒤 인자가 한 칸씩 당겨져도 컴파일된다**. bool 자리에 uint 가 들어가 게이트가 뒤바뀐 채 실계좌 발주가 나간다.
**어떻게 피하나:** **반드시 `SetLimitChaser.startSetLimitChaser(b)` + `addXxx(b, v)` 개별 호출 + `endSetLimitChaser(b)`.**
gh-trade 서버가 같은 이유로 위치 인자를 금지한다 `[VERIFIED: Gateway.cpp:2136 「Pitfall 1」]`.
**조기 경보:** 코드 리뷰에서 `createSetLimitChaser(` / `createSetVITrigger(` / `createVIOrderItem(` 검색 → 0건이어야 한다.

### 2. FlatBuffers 문자열 중첩 위반
`startXxx()` 이후의 `builder.createString()` 은 **릴리스에서 조용히 깨진 버퍼**를 만든다. 문자열·벡터 원소는 **테이블 빌더를 열기 전에 전부** 만든다.
벡터도 마찬가지 — 원소 N개를 각각 끝낸 뒤에야 `createVector`. `Gateway::ProcessGetLimitChaserList` 가 이 순서의 본보기다.

### 3. bigint → Number 변환 누락 (D-34)
`SetVITrigger.orderAmountKrw()`, `VIOrderItem.deadline110Ms()/deadline119Ms()` 가 **bigint** 를 반환한다.
`encode()` 가 bigint 를 만나면 **TypeError 를 던진다**(protocol.ts) — 즉 런타임에 프레임 하나가 통째로 사라지는 게 아니라
**팬아웃 루프가 예외로 죽는다**. `envelope.ts` 의 `toNum(v: bigint, label: string)` 헬퍼를 반드시 통과시킨다.
`deadline*_ms` 는 epoch ms 라 2^53 을 한참 밑돌아 안전하다.

### 4. 단일 문자 wire 코드 — 서버는 **첫 글자만** 읽는다
`market`/`crud`/`buy_watch_side`/`price_type`/`side`/`order_type`/`order_condition` 전부 `c_str()[0]`.
빈 문자열이면 각각 기본값(`'K'`/`'C'`/`'0'`/`'U'`/`'B'`/`'N'`/`'0'`)이다.
**변환 함수를 relay `envelope.ts` 한 곳에만** 둔다(Phase 15 D-21 승계). 웹앱에는 `"K"`/`"Q"` 같은 리터럴을 흩뿌리지 않는다.

### 5. `sweep_min_rate` 는 BasisPoints
2950 = 29.5%. WinForms 는 항상 0 을 보내므로 **웹도 0 고정**이면 이 함정을 만나지 않는다.
UI 에 상승률 입력을 추가하려면 (그것은 스코프 밖) ×100 변환을 잊지 말 것.
반면 **`SetVITrigger.check_rate` 는 정수 %** (25 = 25%) — 두 필드가 다른 단위다.

### 6. 「29필드」 오해
CONTEXT·UI-SPEC 의 「29필드」는 실측과 다르다 — 활성 **37**, 클라 입력 **30**, 고정 **3**, S→C 전용 **4**.
「전체 필드를 현재 표시값으로 전송」(D-06)을 구현할 때 **S→C 전용 4개를 보내면 안 된다**(서버가 읽지는 않지만,
보내면 「값이 왕복한다」는 착각이 생기고 에코와 폼 비교 로직이 오염된다).

### 7. 「둘 다 OFF = 삭제」의 정확한 조건
서버 정규화는 `!buy_enabled && !sell_enabled && !AnyCancelEnabled(cfg)` 일 때만 `crud='D'` 다 `[VERIFIED: Gateway.cpp:1533]`.
**취소 게이트(잔량·체결)가 켜져 있으면 매수·매도를 둘 다 꺼도 전략이 남는다** — 살아 있는 미체결을 지키는 등록이기 때문.
UI 의 「삭제됨」 표시를 매수/매도 두 스위치만 보고 판정하면 서버 진실과 갈린다. **에코의 crud 를 봐야 한다.**

### 8. 「서버 거부」가 조용하다
계좌 가드·거래소 거부는 **에코 자체가 오지 않는다**. 웹은 「보냈으니 됐다」로 판정하면 안 되고,
`ServerMessage(level="ERROR")` 를 잡아 상태줄·전략 로그에 남겨야 한다(PC-7). WinForms 는 3초 무응답 타이머(`RespTimeoutMs=3000`)로
「미반영」 주황 상태를 만든다 — **자동 재전송은 하지 않는다**(재전송 = 사용자가 누르지 않은 두 번째 등록).
웹도 같은 규율을 따른다.

### 9. `ServerMessage` 의 주인 판정
`source=="Account"` 는 상따·VI 두 가드가 공유한다. **`isin` 이 비었을 때만 VI 몫**이다 `[VERIFIED: WireCodes.IsStrategyRejectMessage]`.
이 구분이 없으면 상따 거부 한 건에 VI 표시가 흔들린다.

### 10. 에코의 `enabled` 는 설정값이 아니라 **무장 상태**
`buy_enabled = cfg.buyEnabled && buyArmed` — 발주가 나가 게이트가 소진되면 **에코가 false 로 온다**.
「내가 켰는데 서버가 껐다」가 아니라 **「발주가 나갔다」**는 뜻이다. UI 배지 문구가 이 둘을 구분해야 한다
(UI-SPEC 상태 배지 6종이 이 매핑의 자리다). `sell_entry_latched`·`sell_qty_track_enabled`·`cancel_qty_track_enabled` 는
**접지 않은 원값**이라 반대로 취급한다.

### 11. `buy_order_amount == 0` = 「서버가 모른다」
구 클라가 보냈거나 한 번도 실린 적이 없다는 뜻. **0 이면 금액 칸을 건드리지 않는다** (덮어쓰면 사용자 입력이 사라진다).
역산(수량×가격÷10000) 금지 — 나머지 손실로 왕복이 깨진다. 이 함정의 실측 사고가 gh-trade 에 있다(무장 수량 2주 → 598주, 약 300배).

### 12. 그리드 자식 `min-width:0` (lessons.md 등재)
`.lc3`/`.lc2`/`.acct-grid` 전부. 누락 시 `overflow-hidden` 아래에서 **스크롤이 아니라 조용한 잘림**.
`display:contents` 래퍼의 **자식**에 직접 걸어야 한다.

### 13. 모바일 탭 pane 은 `hidden` + `[hidden]{display:none!important}`
작성자 규칙 `display:grid` 가 UA 의 `[hidden]{display:none}` 을 이긴다 (UI-SPEC R7 · 목업 R2① 회귀).

### 14. `#onAuthedMessage` 의 `keyOf` 무조건 실행
현행 코드는 `unauthorized` 가드 직후 `keyOf(msg.isin, msg.ex)` 를 무조건 부른다. 전략·주문 메시지에는 그 필드가 없다.
**분기 순서를 먼저 바꾼 뒤** 새 메시지를 추가한다.

### 15. `{t:"order"}` 이름 충돌
인바운드 주문과 기존 아웃바운드 주문 통보가 같은 판별자를 쓰면 로그·테스트에서 구분이 사라진다. 접미사로 분리한다(§Shared 계약).

### 16. `unfilledQty === 0` / `qty === 0` 은 **삭제 신호**
계좌 델타 병합 규약. `relay/src/hub/subscription-hub.ts#mergeAccountState` 와
`webapp/src/lib/use-relay-socket.ts#mergeAccount` 가 **한 글자도 달라선 안 된다**(파일 주석 명시).
전역 승격 리팩터에서 이 함수를 옮길 때 두 벌이 갈리지 않게 주의.

### 17. Supabase RPC/테이블 auto-grant
새 마이그레이션에서 `REVOKE ... FROM PUBLIC` 단독은 플랫폼 auto-grant 에 덮인다 — `anon, authenticated` 를 **이름으로** REVOKE.
`dma_orders` 는 컬럼 추가만이면 권한 변화가 없다.

### 18. `origin` 자동주문 행의 insert 경로 부재
상따·VI 발주는 relay 가 요청을 만들지 않으므로 `dma_orders` 행이 없다. 51 통보가 `order_no` 셀렉터로 **0행 update** 를 하고
조용히 성공한다(PostgREST update 는 0행이어도 에러가 아니다). **자동주문 통보는 insert 로 분기**해야 기록이 남는다.

### 19. 15:40 자동 비활성화의 61 Broadcast
`Server::DisableAllStrategies` 가 `PushVITriggerEcho`(Broadcast, 드롭 가능)로 `run=false` 를 알린다.
**드롭되면 화면이 「가동」으로 남는다.** D-13 이 주기 재조회를 금지했으므로, 최소한 **15:40 이후 「장 마감」 표시**로
사용자가 오해하지 않게 한다(재량 — CONTEXT 「15:40 서버 자동 비활성화의 표시」 항목).

### 20. E2E 8090 고정 포트 직렬화
`NEXT_PUBLIC_RELAY_WS_URL` 이 빌드 시점 인라인이라 임의 포트를 못 쓴다. 새 `trading-*.spec.ts`/`me.spec.ts` 도
`test.describe.configure({ mode: 'serial' })` + `withLocalRelay()` 를 `beforeAll` 1회여야 한다. **파일 간 병렬도 EADDRINUSE 다** —
`orderbook.spec.ts` 와 동시에 돌 수 없다. Playwright 프로젝트/워커 설정 확인 필요 → Assumptions Log A6.

---

## Code Examples (실측 소스에서)

### 빈 요청 Envelope 빌더 (24/34) — `envelope.ts` 추가 패턴
```ts
// Source: relay/src/dma/envelope.ts:332 buildGetQuoteReq 구조를 축약
export function buildGetLimitChaserListReq(): Uint8Array {
  const b = new flatbuffers.Builder(64);
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MsgType.GetLimitChaserListReq);   // 24 — 본문 테이블 없음
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
```

### 60 에코 파싱 → 캐시 upsert/delete
```ts
// Source 규약: gh-trade Gateway.cpp:1600~1615 (crud='D' 는 요청 cfg 를 되비춘다)
case MSG.SetLimitChaserResp: {
  const t = env.setLimitChaser();
  if (t === null) return;                      // 빈 응답 = "그 키에 전략 없음" (정상)
  const item = parseLimitChaser(t);            // 새 파서 — 37필드 + 단문자/BasisPoints 변환
  const key = `${userId}|${item.key}`;
  if (item.crud === "D") this.#limitChasers.delete(key);
  else this.#limitChasers.set(key, item);
  this.#fanout(userId, { t: "lc", item });
  return;
}
```

### 세션 Ready 시 전략 프리페치 (`#onReady` 확장)
```ts
// Source: relay/src/hub/subscription-hub.ts:699
#onReady(userId: string, session: HubSession): void {
  if (this.#sessions.get(userId) !== session) return;
  this.resubscribeAll(userId);
  this.requestAccountState(userId);
  this.requestStrategySnapshot(userId);   // ← 추가. 24 / 21 / 34 3연발
}
```

### auth 직후 전략 스냅샷 팬아웃 (`#onFirstMessage` 확장)
```ts
// Source: relay/src/ws/fanout.ts:427 (계좌 스냅샷 루프 바로 뒤)
for (const acct of this.#hub.getAccountStates(userId)) this.#send(conn, acct);
// ↓ 추가
this.#send(conn, { t: "lc.snap", items: this.#hub.getLimitChasers(userId) });
this.#send(conn, { t: "vi", cfg: this.#hub.getViTrigger(userId) });
this.#send(conn, { t: "vi.list", snap: true, items: this.#hub.getViOrders(userId) });
```

### 매수수량 산출 (유일 지점)
```ts
// Source: gh-trade LimitChaserForm.cs:2809 BuyOrderQtyFromAmount
export function buyOrderQtyFromAmount(amountManwon: number, price: number): number {
  if (price <= 0) return 0;
  return Math.floor((amountManwon * 10_000) / price);   // 역산 금지 (11 D-15)
}
```

### 전략 키 조립 (유일 지점)
```ts
// Source: gh-trade WireCodes.cs:163 StrategyKey
export function strategyKey(isin: string, accountNo: string, ex: RelayExchange): string {
  return `${isin.slice(0, 12)}:${accountNo.slice(0, 12)}:${ex}`;   // 서버 strncpy(…,12) 와 동형
}
```

---

## Validation Architecture

`workflow.nyquist_validation: true` `[VERIFIED: .planning/config.json]`

### Test Framework

| Property | Value |
|----------|-------|
| Framework (webapp 단위) | vitest ^2.1.9 + @testing-library/react ^16.3.2 + jsdom ^29 |
| Framework (relay/server/shared) | vitest (워크스페이스별) |
| Framework (E2E) | Playwright ^1.59.1 (+ @axe-core/playwright) |
| Config 파일 | 각 워크스페이스 `vitest.config.*` / `webapp/playwright.config.*` |
| Quick run (webapp 단위) | `pnpm --filter gh-radar-webapp test` (= `vitest --run --passWithNoTests`) |
| Quick run (relay) | `pnpm --filter @gh-radar/relay test` (= `vitest run`) |
| Typecheck (전 워크스페이스) | `pnpm typecheck` (shared build 선행) |
| Full suite | `pnpm typecheck && pnpm -r test && pnpm --filter gh-radar-webapp test:e2e` |

### Phase Requirements → Test Map

| Req | 검증 대상 | Type | Automated Command | 파일 |
|-----|----------|------|-------------------|------|
| TRADE-03 | `MSG`/`INBOUND_MSG_TYPES` ↔ 생성 enum 대조 (전략 7종 추가) | unit | `pnpm --filter @gh-radar/relay test -- codec` | ✅ `relay/src/dma/__tests__/codec.test.ts` (확장) |
| TRADE-03 | `SetLimitChaser` 37필드 round-trip (build → parse) | unit | `pnpm --filter @gh-radar/relay test -- envelope` | ✅ `relay/src/dma/__tests__/envelope.test.ts` (확장) |
| TRADE-03 | deprecated 슬롯 미사용 + 위치 인자 미사용 | unit | 동상 | ❌ Wave 0 — `envelope.test.ts` 신규 케이스 |
| TRADE-03 | 전략 캐시 upsert/delete + 세션 교체 시 폐기 | unit | `pnpm --filter @gh-radar/relay test -- hub` | ✅ `relay/tests/hub.test.ts` (확장) |
| TRADE-03 | Ready 시 24/21/34 3연발 송신 | unit | 동상 | ❌ Wave 0 신규 케이스 |
| TRADE-03 | auth 직후 전략 스냅샷 3프레임 | unit | `pnpm --filter @gh-radar/relay test -- fanout` | ✅ `relay/tests/fanout.test.ts` (확장) |
| TRADE-03 | wss 주문 상관 5초 · 타임아웃 = 「결과 모름」 · 계좌 화이트리스트 403 | unit | `pnpm --filter @gh-radar/relay test -- order` | ⚠ `relay/tests/order-api.test.ts` **재작성**(HTTP → wss) |
| TRADE-03 | `dma_orders` insert + update 큐 | unit | `pnpm --filter @gh-radar/relay test -- order-store` | ✅ `relay/tests/order-store.test.ts` (확장) |
| TRADE-01 | 매수수량 산출식 · 전략 키 조립 · 더티 판정 | unit | `pnpm --filter gh-radar-webapp test` | ❌ Wave 0 — `webapp/src/lib/__tests__/limit-chaser.test.ts` |
| TRADE-01 | 스위치 ON → 즉시 전송 / 둘 다 OFF → crud "D" / 더티 → 「수정」 버튼 등장 | unit(RTL) | 동상 | ❌ Wave 0 — `webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx` |
| TRADE-01 | 에코 도착 시 더티 덮어쓰기 + 배너 (D-11) | unit(RTL) | 동상 | ❌ Wave 0 |
| TRADE-02 | VI 상태 6종 + 부분체결 파생 + `confirm_locked` 비활성 | unit(RTL) | 동상 | ❌ Wave 0 — `vi-order-list.test.tsx` |
| TRADE-02 | 110/119초 데드라인 진행바 (<20초 `--destructive`) | unit(RTL) | 동상 | ❌ Wave 0 |
| TRADE-02 | 시작/중지 확인 다이얼로그 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- trading-vi` | ❌ Wave 0 — `webapp/e2e/specs/trading-vi.spec.ts` |
| NAV-01 | 트리 구조 · `aria-current` · `data-nav-item` · drawer 자동 닫힘 | unit(RTL) | `pnpm --filter gh-radar-webapp test` | ❌ Wave 0 — `app-sidebar.test.tsx` |
| NAV-01 | 비로그인/`unauthorized` 시 트레이딩·My page 미렌더 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- auth-guards` | ✅ `auth-guards.spec.ts` (확장) |
| MYPAGE-01 | 계좌 2개 세로 반복 · 전체 비활성화 확인 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- me` | ❌ Wave 0 — `webapp/e2e/specs/me.spec.ts` |
| 회귀 | 전역 연결 승격 후 호가주문 탭 왕복 | e2e | `pnpm --filter gh-radar-webapp test:e2e -- orderbook` | ✅ `orderbook.spec.ts` (**필수 회귀**) |
| 회귀 | `useRelaySocket` 재접속·백오프 | unit | `pnpm --filter gh-radar-webapp test` | ✅ `webapp/src/lib/__tests__/relay-socket.test.ts` |
| 회귀 | a11y | e2e | `... test:e2e -- a11y` | ✅ `a11y.spec.ts` (신규 3표면 추가 권고) |

### Sampling Rate
- **Per task commit:** `pnpm typecheck` + 해당 워크스페이스 `test`
- **Per wave merge:** `pnpm typecheck && pnpm -r test`
- **Phase gate:** 위 + `pnpm --filter gh-radar-webapp test:e2e` 전량 green

### Wave 0 Gaps
- [ ] `relay/src/generated/**` **재동기화** (`sync-relay-schema.sh`) — 이것이 없으면 `cancelQtyTrackBaseline` 을 못 읽는다
- [ ] `webapp/src/components/ui/checkbox.tsx` (`npx shadcn add checkbox`)
- [ ] `relay/tests/helpers/fake-gateway.ts` 에 **전략 응답 주입 API 추가**:
      `respondLimitChaserList(items)` · `pushLimitChaserEcho(sock, cfg)` · `respondViTrigger(cfg)` · `pushViOrderList(sock, items, snap)` · `pushOrderResp(sock, notice)`
      (현재 `pushQuote`/`pushTape`/`respondLogin` 만 있다 `[VERIFIED]`)
- [ ] `webapp/e2e/fixtures/relay.ts` 의 `LocalRelay` 인터페이스에 위 API 노출
- [ ] `webapp/src/components/trading/__tests__/` 디렉터리 + 공용 픽스처(에코 1건·전략 목록 3건·VI 주문 5건)
- [ ] `webapp/e2e/specs/trading-limit-chaser.spec.ts` · `trading-vi.spec.ts` · `me.spec.ts` · `sidebar-tree.spec.ts`
- [ ] `supabase/migrations/2026____dma_orders_origin.sql` (재량 채택 시)

---

## Security Domain

`security_enforcement` 키가 `.planning/config.json` 에 **없다 → 활성으로 취급** `[VERIFIED]`.

### Applicable ASVS Categories

| ASVS | 적용 | 표준 통제 (이 phase) |
|------|------|---------------------|
| **V2 Authentication** | yes | wss 첫 메시지 `{t:"auth", token}` → `verifyToken(supabase, token)` (Supabase `auth.getUser`). 5초 미수신 시 `close(4401)`. **재인증으로 사용자 교체 불가**(T-15-03). 신규 전략·주문 메시지도 반드시 이 게이트 뒤 |
| **V3 Session Management** | yes | `SessionManager.acquire/release` + `SESSION_GRACE_MS` 5분. D-22 전역 연결로 세션 수명이 「앱 열린 동안」으로 길어진다 — **탭 다중 열기 시 `acquire` 참조계수가 정확해야** 조기 반납이 안 난다 |
| **V4 Access Control** | **yes (핵심)** | ① `dma_credentials` 매핑 = allowlist(없으면 `unauthorized`). ② **주문·전략의 `account_no` 는 `session.allowedAccounts` 대조가 최후 방어선**(요청 바디·상태 프레임 사본을 근거로 삼으면 IDOR). ③ 팬아웃은 언제나 `userId` 1명 대상(`#deliver`) — 전역 브로드캐스트 경로를 만들지 않는다(T-15-02). ④ `dma_orders` RLS default-deny + service_role 만 |
| **V5 Input Validation** | yes | zod discriminated union. 전략 메시지에도 동일: ISIN 12자 정규식, 계좌 1..12, 정수·범위(ratio 1..100, trackRatio 1..90, checkRate 정수, qty/price>0), exchange/side/orderType/crud enum. **관대한 무시 금지 — 스키마 위반은 `close(4400)`** |
| **V6 Cryptography** | yes (변경 없음) | `DMA_CRED_KEY` AES-256-GCM 로 자격증명 복호. 이 phase 는 손대지 않는다 |
| V7 Error handling & Logging | yes | 계좌번호는 **로그에서만 마스킹**(`maskAccountNo`), 화면에는 전체 표시(UI-SPEC D2). 인바운드 원문을 로그에 싣지 않는다(첫 메시지에 토큰) |
| V13 API | yes | wss 메시지 크기 상한 64KB · 백프레셔 1MB/3스트라이크 유지 |

### Known Threat Patterns

| 패턴 | STRIDE | 완화 |
|------|--------|------|
| 남의 계좌로 전략 등록·주문 (IDOR) | Elevation of Privilege | `session.allowedAccounts` 대조 (relay). **게이트웨이도 `CheckSessionAccount` 로 2중 차단** — 다만 게이트웨이 거부는 조용하므로 relay 가 먼저 막고 이유를 돌려줘야 한다 |
| 타인 전략·체결 유출 | Information Disclosure | `#deliver(userId, …)` 단일 경로. **전략 스냅샷 팬아웃도 반드시 이 함수를 통과**시킨다 |
| 상관키 위조로 남의 주문 결과 수신 | Spoofing | `rid` 는 **연결 스코프**로만 매칭(`Map<conn, Pending[]>` 또는 `Map<userId, …>` + conn 검증). 전역 `rid` 맵 금지 |
| 대량 전략 등록으로 게이트웨이 큐 포화 | DoS | wss 인바운드 rate-limit(재량, 권고: 사용자당 초당 N건). 현재 fanout 에 인바운드 rate-limit 이 **없다** — server `apiRateLimiter` 를 우회하는 새 경로가 생기는 것이므로 검토 필요 |
| 중복 주문 (재전송·더블클릭) | — (금전 손실) | `rid` 멱등 + 대기 중 동일 주문 거부. **타임아웃을 「실패」로 렌더하지 않는다**(`isUnknownOutcome`) |
| 잘린 FlatBuffer 로 잘못된 필드 읽기 | Tampering | JS 런타임에 Verifier 가 없다 → `INBOUND_MSG_TYPES` 화이트리스트 + 파서의 null 가드가 실질 방어선. 새 7종에도 동일 적용 |
| `key` 문자열 로그 폭탄 | DoS | `DisableStrategiesReq.key` 64B 상한은 **서버측**이다. relay 도 zod `max(64)` 로 같이 막고 로그 출력은 절단 |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `flatc` | 생성 코드 재동기화 (Wave 0) | ✓ | **25.12.19** (스크립트 요구값과 정확히 일치) | 없음 — 버전 불일치 시 스크립트가 중단 |
| gh-trade repo (형제) | `.fbs` 정본 · `sync-relay-schema.sh` | ✓ | `/Users/alex/repos/gh-trade` | 없음 |
| gh-trade mock 서버 바이너리 | 로컬 전략 왕복 검증 | ✓ | `server/build/stock-dma-server` 존재, `config/server.toml` `[broker] name="mock"` | E2E `FakeGateway`(TS 스텁) |
| Node / pnpm | 전 워크스페이스 | ✓ (Phase 15 가동 중) | — | — |
| Playwright 브라우저 | E2E | ✓ (기존 spec 18개 가동) | ^1.59.1 | — |
| Supabase CLI (`supabase db push`) | `origin` 컬럼 마이그레이션 | [ASSUMED] 사용 가능 (Phase 15 15-09 선례) | — | 마이그레이션 SQL 을 대시보드에서 수동 실행 |
| gcloud + `gh-radar-deployer` SA | server/relay 재배포 | ✓ (자동 메모리 등재, key `~/.config/gcloud/gh-radar-deployer.json`) | — | — |
| **실서버 10.41.1.120 / 실계좌** | 라이브 검증 | **✗ (의도적)** | — | **mock 검증만.** Phase 15 D-27 · 15-20 A안 승계 |
| `dma_credentials` 행 | 어떤 라이브 세션이든 | **✗ (0행, 2026-09-06 실측)** | — | E2E 는 `seedDmaCredential()` 스텁으로 채운다 |

**차단 없음(fallback 존재):** 실계좌·실서버는 애초에 스코프 밖(D-27). 로컬 mock + `FakeGateway` 로 전 경로 검증 가능.

**로컬 검증 절차 (dev.sh 기준):**
```bash
# 1) mock 게이트웨이
cd /Users/alex/repos/gh-trade/server && ./scripts/run-mac.sh          # :9100, broker=mock
# 2) relay
DMA_HOST=127.0.0.1 DMA_PORT=9100 pnpm --filter @gh-radar/relay run dev   # ws :8090, 내부 :8091
curl -s http://localhost:8091/healthz
# 3) webapp (.env.local 에 NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:8090/ws)
./dev.sh --webapp-only    # :3100
```
**mock 에서 전략 메시지가 실제로 응답하는가:** 10/11/14/20/21/24/33/34 핸들러는 전부 `Gateway` 계층이고 브로커에 의존하지 않는다
(`StrategyManager` 는 세션 소유). 24/21/34 는 「무응답 금지」 규약으로 **전략이 0건이어도 빈 응답을 반드시 보낸다**.
따라서 mock 에서도 왕복이 성립한다 — 다만 **실제 실행 확인은 하지 않았다** → Assumptions Log A5.

---

## Suggested Plan Decomposition

`parallelization: false` · `granularity: fine` `[VERIFIED: config.json]` → 순차 wave.

| Wave | 내용 | 독립성 | 비고 |
|------|------|--------|------|
| **W0** | ① `sync-relay-schema.sh` 재동기화 + 커밋 ② `npx shadcn add checkbox` ③ `FakeGateway` 전략 API 확장 ④ `relay.ts` 계약 타입 append (shared) ⑤ (재량) `dma_orders.origin` 마이그레이션 **[BLOCKING] db push** | — | 이후 전부의 선행 |
| **W1** | relay 전략 중계 — `msg-type.ts` 확장 · `envelope.ts` 전략 빌더/파서 · `protocol.ts` zod · `SubscriptionHub` 전략 캐시 + `#onReady` 프리페치 · `fanout.ts` 인바운드 분기 + auth 직후 스냅샷 | **독립** | 웹앱 없이 relay 단위 테스트로 완결 |
| **W2** | 주문 wss 이관 — `order-api.ts` 상관 로직 → wss 핸들러 · `OrderStore.insertRequest` · 자동주문 통보 insert 분기 | W1 의존(인바운드 분기 자리 공유) | REST 는 아직 살려 둔다 |
| **W3** | `RelayProvider` 전역 승격 + `useRelaySubscription` — `layout.tsx` 중첩 · 구독 ref-count · `stock-orderbook-section.tsx` 교체 · `order-panel`/`account-panel` 주문 wss 전환 · **`orderbook.spec.ts` 회귀 green** | W1·W2 의존 | 여기서 회귀가 나면 뒤가 전부 흔들린다 — 게이트로 삼는다 |
| **W4** | 사이드바 트리 재편 + 라우트 셸 — `app-sidebar.tsx` 2단 그룹 + 3단 전략 목록 + 조건부 숨김 · `/trading/**`·`/me` 라우트 · `dma-gate.tsx` · `strategy-badge.tsx` · `/scanner` 라벨 통일 | W3 의존(전역 컨텍스트) | UI 만 — 페이지 내용은 빈 셸 |
| **W5** | 상따 페이지 — `limit-chaser-form.tsx` · `dirty-action-bar.tsx` · 호가 10단 + 최근 체결 변형 · `strategy-log.tsx` · 모바일 2열 | W4 의존 | 가장 큰 단일 표면 |
| **W6** | VI 페이지 — 설정 카드 · 시작/중지 확인 · `vi-order-list.tsx` + 데드라인 진행바 · 마감알림 | W4 의존 (W5 와 **독립**) | |
| **W7** | My page — 전략 현황 카드 · 전체 비활성화 확인 · `account-panel` 계좌별 반복 + 모바일 `.rlist` 리플로우 | W4 의존 (W5·W6 와 **독립**) | `.rlist` 는 3표면 공용이므로 **W5 보다 먼저 뽑는 편이 나을 수도** |
| **W8** | server 정리 — `POST /api/orders` 제거 · `relay-client.ts` 삭제 · `config.ts`/`deploy-server.sh` env · `orders-api.ts` `createOrder` 제거 | W3 green 이후 | 되돌리기 어려우므로 마지막 |
| **W9** | E2E 신규 4종 + 회귀 전량 · a11y · 배포(`deploy-relay.sh` + `deploy-server.sh` + Vercel prebuilt) · smoke | 전부 의존 | |

**의존 없이 병렬 가능한 묶음(순차 실행이라도 순서 자유):** W5 / W6 / W7 는 서로 독립.
**`.rlist` 모바일 리플로우는 `account-panel.tsx` 안에 넣어 3표면이 공유**하므로(UI-SPEC 재사용 표), 어느 wave 에 두든 **한 번만** 구현한다.

---

## State of the Art

| 이전 (Phase 15) | 현재 (Phase 16) | 이유 |
|-----------------|-----------------|------|
| 주문 = `POST /api/orders` → Cloud Run server → relay 내부 HTTP | 주문 = 브라우저 wss → relay | 경로 하나. 세션을 쥔 프로세스가 상관도 쥔다 (D-02) |
| `dma_orders` insert = server, update = relay | insert·update 전부 relay | 자동주문(상따·VI) 행은 server 가 만들 수 없다 (D-03) |
| `useRelaySocket` = 섹션 단위 훅 (호가주문 탭 1곳) | `RelayProvider` 전역 1연결 + 구독 ref-count | 사이드바 전략 목록·My page 가 종목 구독 없이도 상태를 봐야 한다 (D-22) |
| relay 는 시세·체결·계좌만 중계 | + 전략(상따·VI) 중계 + 세션 전략 캐시 | WinForms 와 같은 DMA 세션 공유 (D-01/D-12) |
| 사이드바 = 평탄 5항목 | 2단 그룹 트리 + 3단 전략 목록 | NAV-01 |
| `INBOUND_MSG_TYPES` 12종 | + 7종 (56/60/61/64/65/72/73) | TRADE-03 |

**폐기 / 정정:**
- CONTEXT 「상따 호가 5단」 → **UI-SPEC 은 10단 + 데스크톱 최근 체결 10건**으로 확정. UI-SPEC 이 정본.
- CONTEXT D-24(b) `--warn` 재사용 → **토큰 부재로 중립 확정** (UI-SPEC FLAG-1, C1/C2).
- CONTEXT D-17 「종목명 · 거래소 · 상태 배지」 → **UI-SPEC N3: 종목명 + 매수/매도 원 아이콘 2개만** (사용자 2026-09-08 확정).
- CONTEXT 「29필드」 → **37 활성 / 30 입력 / 3 고정 / 4 S→C 전용**.
- CONTEXT 「60 은 Broadcast」 → **Set 에코는 Notice**, Broadcast 는 런타임 진행 푸시뿐.

---

## Assumptions Log

| # | 주장 | 섹션 | 틀렸을 때의 영향 |
|---|------|------|-----------------|
| A1 | `SubscriptionHub` 에 전략 캐시를 얹는 것이 별도 `StrategyHub` 를 만드는 것보다 낫다 | Relay 통합 | 설계 선택. 파일이 756줄 → 1000줄+ 이 되면 분리가 맞다. planner 재량 |
| A2 | `useRelaySocket` 을 컨텍스트로 승격할 때 내부 리듀서·재접속 로직을 그대로 재사용할 수 있다 | Webapp | 631줄 중 구독 effect 만 분리하면 된다고 보았으나, `wantedKeyRef` 지연 프레임 필터가 다중 구독에서 어떻게 동작할지는 **실제 리팩터에서 확인해야 한다**. 잘못되면 종목 A 의 호가가 종목 B 화면에 뜬다 |
| A3 | relay 에 **6자 단축코드 → ISIN·market 역매핑**이 필요하며 `SymbolMap` 에 그 경로가 있거나 추가할 수 있다 | 주문 이관 | `relay/src/store/symbols.ts` 를 열어보지 않았다. 없으면 ① 브라우저가 ISIN 을 직접 보내도록 D-28 계약을 완화하거나(권장하지 않음) ② `SymbolMap` 에 역방향 인덱스를 추가해야 한다. **plan 단계에서 반드시 확인** |
| A4 | `parseOrderResp` 가 `OrderResp.origin` 을 읽는다 | dma_orders origin | 안 읽는다면 파서에 필드 추가 필요(생성 코드에는 이미 있을 것). 자동주문 출처 구분이 불가능해진다 |
| A5 | gh-trade mock 서버(`broker=mock`)에서 전략 메시지 10/11/14/21/24/33/34 왕복이 실제로 성립한다 | Environment | 코드 경로상 성립하지만 **실행하지 않았다.** 성립하지 않으면 로컬 검증이 `FakeGateway`(TS 스텁)에만 의존하게 된다 — 치명적이지는 않으나 실물 대조가 사라진다 |
| A6 | Playwright 설정에서 새 relay 사용 spec 들이 `orderbook.spec.ts` 와 **동시에 실행되지 않도록** 강제할 수 있다 | Pitfall 20 | `webapp/playwright.config.*` 를 열어보지 않았다. `fullyParallel: true` 라면 파일 간 병렬이라 8090 충돌이 난다. 해결책: relay spec 들을 한 파일로 합치거나 별도 프로젝트 + `workers: 1` |
| A7 | `ordersRateLimit`(orders.ts:60) 이 POST 전용이다 | Server 정리 | GET 에도 걸려 있으면 제거하면 안 된다. 실제 미들웨어 결선 1줄 확인 필요 |
| A8 | Supabase CLI `db push` 를 이 환경에서 실행할 수 있다 | Environment | Phase 15 15-09 선례가 있으나 이 세션에서 실행 확인은 안 했다 |
| A9 | 전역 wss 승격 후에도 `SESSION_GRACE_MS` 5분 유예가 relay 변경 없이 D-22 의도대로 동작한다 | Webapp | CONTEXT 가 명시한 가정. 탭 다중 열기 시 `acquire`/`release` 참조계수가 정확해야 한다 — `SessionManager` 는 이미 참조계수 기반이므로 성립할 것으로 본다 |
| A10 | wss 인바운드에 rate-limit 이 없다 | Security | `fanout.ts` 580줄을 전부 읽지 않았다. `#onMessage` 부근에 카운터가 없는 것은 확인했으나 상위에 있을 가능성 |
| A11 | 「자동주문 통보 → relay 가 새 `dma_orders` 행 insert」가 올바른 설계다 | Supabase | 대안: 자동주문은 기록하지 않는다(감사 구멍) / 별도 테이블. CONTEXT D-03 이 「relay 가 동일하게 기록한다」라고 했으므로 insert 가 맞다고 읽었으나, 컬럼(`org_order_no` 등) 결손이 있을 수 있다 |
| A12 | `origin` 컬럼명·값 집합(`manual`/`limit_chaser`/`vi`)은 재량 범위 안 | Supabase | CONTEXT 「자동주문 행의 출처 구분 컬럼은 재량」에 근거 |

---

## Open Questions (RESOLVED — plan 16-08/06/11/12/13/16 에 반영)

1. **주문 상관키(`rid`)의 스코프 — 연결인가 사용자인가?**
   - 아는 것: 기존 HTTP 구현은 `Map<userId, PendingOrder[]>` + ISIN 매칭이었다. 전역 wss 승격 후에는 **한 사용자가 여러 탭**을 열 수 있다.
   - 불분명: 탭 A 가 낸 주문의 결과 프레임을 탭 B 도 받아야 하는가? (사용자 관점에서는 「받는 게 맞다」이고, 51 푸시는 이미 세션 전 연결로 간다)
   - 권고: **`order.result`(상관 응답)는 요청한 연결에만**, `{t:"order"}`(51 푸시)는 기존대로 사용자 전 연결에. 게이트웨이의 「요청 연결에만 vs 전 연결」 규약과 동형.

2. **전략 스냅샷의 프레임 분할**
   - 아는 것: 백프레셔 한계 1MB. 상따 전략이 수십 건이면 `lc.snap` 1프레임이 커진다.
   - 권고: 전략 수가 현실적으로 10건 미만이므로 **분할하지 않는다**. 다만 `takeCount(n, max, label)` 헬퍼(envelope.ts:180)로 상한(예: 200)을 두어 파손 프레임 방어.

3. **`/trading/limit-chaser` (키 없음) 라우트의 정체**
   - CONTEXT D-15 는 `/trading/limit-chaser`(새 전략 폼), UI-SPEC P1 은 `/trading/limit-chaser/new`(빈 폼)로 **서로 다르다**.
   - 권고: **UI-SPEC 우선**(`/new`) + `/trading/limit-chaser` 는 `/new` 로 redirect. 사이드바의 「상따」 항목은 `/new` 를 가리킨다.

4. **더티 상태에서 스위치를 켰을 때의 정확한 전송 내용**
   - D-06 은 「스위치 전송 시에는 그 시점의 폼 값이 함께 나간다」. 즉 스위치 = 「전체 필드 + 그 스위치만 뒤집힌 값」의 crud "C".
   - 불분명: 그 전송 후 **더티 표시를 지워야 하는가**? (값이 실제로 서버에 반영됐으므로 지우는 것이 맞다)
   - 권고: 스위치 전송 성공(60 에코 수신) 시 더티를 **에코 기준으로 재계산** — 별도 「지우기」 로직을 두지 않는다(D-11 서버값 우선과 일관).

5. **전략 로그의 「에코 상태 전이 요약」 생성 위치**
   - 브라우저 메모리 전용이므로 웹앱이 만든다. 이전 에코와 새 에코의 diff 를 문장으로 바꾸는 함수가 필요하다.
   - 권고: `strategy-log.ts` 순수 함수 + 단위 테스트. 전이 종류를 6~8개로 고정(무장/해제/발주/래치/취소무장/삭제/거부/서버통지).

6. **`GET /api/orders` 를 남기는데 server 에 relay 결선이 사라져도 되는가**
   - GET 은 Supabase 직접 조회(`listTodayOrders`)이므로 relay 무관 `[VERIFIED: routes/orders.ts:166~186]`. **문제 없음.**

---

## Sources

### Primary (HIGH — 이 세션에서 파일 실독)
- `/Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs` — MsgType enum, SetLimitChaser(297~468), SetVITrigger(469~483), VIOrderNotice(484~502), LimitChaserList(503~510), DisableStrategiesReq/Resp(511~527), GetStrategyReq(528~540), ConfirmVIOrderReq(760~765), VIOrderItem(766~785), VIOrderList(786~800), Envelope(822~882)
- `/Users/alex/repos/gh-trade/CLAUDE.md` §FlatBuffers 메시지 (140~228) — MsgType↔테이블 표, 전송 클래스 선택 기준
- `/Users/alex/repos/gh-trade/server/src/net/Gateway.h` (195~330, 455~530) — 에코 함수 선언부 주석
- `/Users/alex/repos/gh-trade/server/src/net/Gateway.cpp` — ProcessSetLimitChaser(1319~1613), PushLimitChaserEcho(1637), PushVITriggerEcho(1648), ProcessSetVITrigger(1649~1707), BuildVITriggerEcho(2071), AddLimitChaserTable(2105~2195), BuildLimitChaserEcho(2196), ProcessGetVITrigger(2221), ProcessGetLimitChaserList(2272), ProcessConfirmVIOrder(2379), ProcessGetVIOrderList(2410), ProcessDisableStrategies(2908~3005)
- `/Users/alex/repos/gh-trade/client/Forms/Trading/LimitChaserForm.cs` — 클래스 주석(15~40), 기본값 상수(129~178), ResetStrategyOptionsToDefault, SeedFromUpperLimitOnce(711), TryPrepareSubmission(2340~2600), Send(2690~2755), BuyOrderQtyFromAmount(2809)
- `/Users/alex/repos/gh-trade/client/Forms/Trading/VITriggerForm.cs` — 클래스 주석(13~27), 상수(57~127), 마감알림(1610~1628), 확인 체크(1566~1600)
- `/Users/alex/repos/gh-trade/client/Services/DMA/WireCodes.cs` (전체 374줄)
- `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh` + `--check` 실행 결과
- gh-radar: `relay/src/ws/protocol.ts`, `relay/src/ws/fanout.ts`, `relay/src/hub/subscription-hub.ts`, `relay/src/dma/msg-type.ts`, `relay/src/dma/session.ts`, `relay/src/dma/session-manager.ts`, `relay/src/order/order-api.ts`, `relay/src/store/orders.ts`, `relay/src/index.ts`, `relay/src/config.ts`, `relay/src/generated/stock-dma/*.ts`, `relay/tests/helpers/fake-gateway.ts`
- gh-radar: `packages/shared/src/relay.ts`, `packages/shared/src/stock.ts`
- gh-radar: `webapp/src/lib/use-relay-socket.ts`, `webapp/src/lib/orders-api.ts`, `webapp/src/lib/stock-api.ts`, `webapp/src/app/layout.tsx`, `webapp/src/components/layout/app-sidebar.tsx`, `webapp/src/components/layout/app-shell.tsx`, `webapp/src/components/orderbook/{account-panel,order-panel}.tsx`, `webapp/src/components/stock/stock-orderbook-section.tsx`, `webapp/e2e/fixtures/relay.ts`, `webapp/e2e/specs/orderbook.spec.ts`, `webapp/components.json`, `webapp/package.json`
- gh-radar: `server/src/routes/orders.ts`, `server/src/routes/stocks.ts`, `server/src/app.ts`, `server/src/config.ts`, `scripts/deploy-server.sh`, `supabase/migrations/20260905120200_dma_orders.sql`, `dev.sh`, `relay/README.md`
- 계획 산출물: `16-CONTEXT.md`, `16-UI-SPEC.md`, `15-CONTEXT.md`(참조), `15-20-SUMMARY.md`, `15-LIVE-VERIFICATION.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json`, `tasks/lessons.md`, `CLAUDE.md`

### Secondary (MEDIUM)
- `sync-relay-schema.sh` 결과를 `flatc --ts` 수동 재실행으로 교차 검증 (2파일 차이 특정)

### Tertiary (LOW)
- 없음 — 이 phase 는 웹 검색을 하지 않았다. 외부 라이브러리 도입이 0건이고 모든 계약이 저장소 안에 있기 때문이다.

---

## Metadata

**Confidence breakdown:**
- **Standard stack: HIGH** — 신규 의존성 0. 모든 버전이 `package.json`·`components.json` 실측
- **Protocol (FlatBuffers 계약): HIGH** — `.fbs` 정본 + 서버 핸들러 + 클라 송신부 3중 대조
- **Relay/webapp 통합 지점: HIGH** — 파일·줄·시그니처 실측. 단 `symbols.ts`·`playwright.config` 미확인(A3/A6)
- **전송 클래스(Notice/Broadcast): HIGH** — `SendToSession` 오버로드 호출부를 직접 확인해 CONTEXT 가정을 정정
- **Pitfalls: HIGH** — 대부분 gh-trade/gh-radar 소스 주석에 사고 사례와 함께 명시돼 있다
- **로컬 mock 전략 왕복: MEDIUM** — 코드 경로상 성립, 미실행 (A5)
- **아키텍처 권고(전역 승격 방식·캐시 구조): MEDIUM** — 설계 판단이며 planner 재량 (A1/A2)

**Research date:** 2026-09-08
**Valid until:** 2026-10-08 (30일 — 스택 고정, 다만 **gh-trade `.fbs` 가 바뀌면 즉시 무효**.
`sync-relay-schema.sh --check` 를 plan 직전에 한 번 더 돌려 「신규/변경 예정」이 0인지 확인할 것)
