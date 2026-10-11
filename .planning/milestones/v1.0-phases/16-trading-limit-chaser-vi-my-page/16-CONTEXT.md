# Phase 16: Trading 메뉴 — 상따(limit-chaser)·VI 전략 설정 + 종목검색 재편 + My page - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade WinForms 의 **상따전략창(`LimitChaserForm`)** 과 **[0402] 변동성완화 종합주문(`VITriggerForm`)** 을 웹앱 페이지 2개(`/trading/limit-chaser`, `/trading/vi`)로 옮기고, **relay 가 전략 메시지를 wss 로 중계**한다. WinForms 와 **같은 DMA 세션(`ezmesya`, Phase 15 D-17 철회)** 을 공유하므로 전략·체결·미체결이 두 클라이언트에 즉시 반영된다.

1. **트레이딩 › 상따** — 전략 필드 29개 전부(SetLimitChaser 테이블, deprecated 봉인 필드 제외), 매수/매도/한방체결/자동취소 박스, 호가 5단·잔고/미체결·전략 로그 보조 패널. 전략 키 `ISIN:accountNo:exchange`, KRX/NXT.
2. **트레이딩 › VI** — 세션당 1건(종목 축 없음, KRX 전용, 주문가=상한가 고정): 계좌·금액(만)·상승률(%)·시작/중지·VI 마감알림(브라우저 로컬). VI 주문내역(확인 체크 = 119초 미확인 취소 면제, 110/119초 데드라인 진행바, 상태 6종+부분체결) + 미체결·잔고.
3. **relay 확장** — 전략 메시지 `10/11/14/20/21/24/33/34 ↔ 60/61/64/65/56/72/73` 을 wss 로 중계하고, 세션 Ready 시 전략 상태를 캐시해 브라우저 인증 즉시 스냅샷을 내린다. **직접주문(2↔51/52/53)도 REST 에서 wss 로 이관**(Phase 15 D-08/D-22 대체).
4. **사이드 메뉴 재편** — 홈 / 종목검색(상승률 상위·테마·관심종목) / 트레이딩(상따 + 등록 전략 목록 · VI) / My page / AI 애널리스트. 기존 URL 유지.
5. **My page(`/me`)** — 전략 현황(상따 목록·VI 상태·전체 비활성화) → 미체결 → 잔고(계좌별 세로 반복).
6. **앱 전역 wss 1연결** — 로그인 상태면 AppShell 프로바이더가 relay wss 를 열어 유지. 사이드바 전략 목록·매핑 판정·계좌 상태의 원천.

**밖:** 거래원(74/75), 정정(M)/IOC/FOK/시장가, 서버측 주문 한도, 자격증명 입력 UI, 오늘 주문 이력 표(dma_orders 조회 UI), 모바일 하단 탭바, 그룹 접힘/토글, gh-trade 서버·스키마 변경(게이트웨이는 relay 를 클라이언트 하나로 본다), gh-trade WinForms 변경.

**Requirements:** TBD — plan 단계에서 **TRADE-01**(상따 페이지)·**TRADE-02**(VI 페이지)·**TRADE-03**(relay 전략 중계 + 주문 wss 이관)·**NAV-01**(사이드 메뉴 재편)·**MYPAGE-01** 등 신규 등록(REQUIREMENTS.md 갱신, Phase 11~15 선례).

**순서:** discuss(본 문서) → `/gsd-ui-phase 16`(목업 초안 2건 채택안 확정 + My page·사이드바 목업 추가 → 16-UI-SPEC.md) → plan → execute. **Phase 15 의존:** 15-20(실서버·실계좌 검증 [BLOCKING])이 아직 남아 있다. 주문 wss 이관은 15 의 REST 경로를 대체하므로 15-20 검증 결과(실서버 접속 여부)를 plan 이 참조한다.

</domain>

<decisions>
## Implementation Decisions

### 전송 경로 — 전략·주문 모두 wss 직접
- **D-01:** 상따/VI 설정 메시지(`SetLimitChaserReq 10`, `SetVITriggerReq 11`, `DisableStrategiesReq 14`, `ConfirmVIOrderReq 33`)는 **인증된 relay wss 로 직접** 올린다(`{t:"lc.set", ...}` 류 — 스키마는 재량). relay 가 FlatBuffer 로 변환해 그 사용자의 DMA 세션으로 보낸다. Cloud Run server 는 거치지 않는다. 응답/푸시(60/61/64/65/56/72/73)도 같은 wss 로 내린다.
- **D-02 (Phase 15 D-08·D-22·D-24 대체):** **직접주문(신규/취소, `DirectOrderReq 2`)도 wss 로 통일**한다. 브라우저 → relay wss `{t:"order", ...}` → DMA. 첫 `OrderResp(51)`(접수/거부)까지의 대기(5초)는 **wss 요청/응답 상관키**(클라이언트 생성 request id)로 재구현하고, 이후 체결(53)·취소확인(52)은 기존처럼 푸시. **`POST /api/orders` REST 라우트(server `routes/orders.ts`)·relay 내부 HTTP 주문 API(`order/order-api.ts` 의 주문 부분)·webapp `orders-api.ts` 의 createOrder 는 제거**하고 경로를 하나로 둔다. server `RELAY_INTERNAL_URL`/`RELAY_ORDER_SECRET` env·`deploy-server.sh` 주입·방화벽 내부포트 규칙은 relay 내부 HTTP 에 남는 것(healthz 등)에 맞춰 정리(재량). 형식 검사(D-20 동형: ISIN 12자, 수량/가격>0 정수, exchange, side, account_no ∈ 세션 계좌)는 relay 가 wss 수신 시 수행.
- **D-03:** `dma_orders` 기록은 **relay 가 insert·update 모두** 담당(서비스롤, 기존 `OrderStore` 확장). `GET /api/orders?date=` 조회 라우트는 유지(오늘 주문 목록 복원용). 상따·VI 자동주문의 체결 통보도 같은 세션으로 오므로 relay 가 동일하게 기록한다(자동주문 행의 출처 구분 컬럼은 재량).
- **D-04:** 인증·권한은 Phase 15 D-10~D-12 그대로 — wss 첫 메시지 auth, `dma_credentials` 매핑 = allowlist. 매핑 없으면 `unauthorized` 상태 프레임, 전략·주문 메시지는 거부.

### 조작 규율 — 스위치는 즉시, 값은 수정 버튼
- **D-05:** 상따 **매수주문/매도주문 스위치 ON/OFF 는 확인 다이얼로그 없이 즉시 서버 반영**(WinForms 동일, 목업대로). 등록 버튼 없음: 처음 켜는 스위치 = 등록(crud "C"). 오터치 방지는 스위치 크기·간격으로.
- **D-06 (목업 초안 수정):** **옵션 값 변경의 0.3초 자동 반영은 폐기.** 값이 바뀌면(더티) 폼에 **「수정」 버튼이 나타나고** 그 버튼으로만 서버 반영(SetLimitChaser crud "C" 전체 29필드를 현재 표시값으로 전송). 더티 없으면 버튼 숨김. 스위치는 D-05 대로 즉시(스위치 전송 시에는 그 시점의 폼 값이 함께 나간다 — 더티 필드가 있으면 그 값까지 같이 반영되므로 스위치 조작 전 더티 상태를 사용자가 인지하도록 표시).
- **D-07:** VI 페이지도 같은 규칙 — 계좌·금액·상승률 변경 시 「수정」 버튼(SetVITrigger, `run` 현재값 유지). **시작/중지는 확인 다이얼로그**(목업대로, 호가주문 탭 주문 확인과 같은 규율). 중지 상태에서 시작을 누르면 현재 폼 값으로 `run=true` 전송.
- **D-08:** 상따 전략 **삭제 = 매수·매도 스위치 둘 다 OFF**(WinForms 동일, 목업대로 crud "D"). 명시 삭제 버튼 없음. 폼은 빈 상태로 돌아가고 사이드바 목록에서 사라진다.
- **D-09:** **전체 비활성화(`DisableStrategiesReq 14`, key="")** 버튼은 My page 전략 현황에 두고 확인 다이얼로그를 붙인다. 단건 비활성화(key 지정)는 UI 없음(스위치 OFF 로 갈음).
- **D-10:** `ConfirmVIOrderReq(33)` 확인 체크는 즉시 전송(수정 버튼 대상 아님). `confirm_locked` 인 행은 체크 비활성.

### 동기화·복원 — 서버값 우선, relay 세션 캐시
- **D-11:** 게이트웨이 에코(`SetLimitChaserResp 60` 300ms 콜드 틱 Broadcast, `SetVITriggerResp 61`, `VIOrderListPush 73`)가 도착하면 **서버값이 항상 이긴다** — 더티 필드도 덮어쓰고 수정 버튼은 사라지며 토스트 「다른 단말에서 변경됨」을 띄운다. 편집 중 보호·보류 없음.
- **D-12:** **relay 가 세션 단위 전략 캐시**를 가진다. DMA 세션 Ready 직후 `GetLimitChaserListReq(24)`·`GetVITriggerReq(21)`·`GetVIOrderListReq(34)` 를 한 번 호출해 채우고 이후 60/61/64/72/73 로 갱신. 브라우저 wss 인증이 끝나면 종목 구독과 무관하게 **전략 스냅샷(상따 전수 + VI 설정 + VI 추적 목록)을 즉시 내린다**(Phase 15 D-37 시세 스냅샷 캐시 동형). 페이지가 따로 요청하지 않는다.
- **D-13:** 캐시 재조회는 **DMA 재접속(재로그인) 시에만**(24/21/34 재호출). 주기 재조회·사용자 새로고침 버튼 없음. 60 이 Broadcast(드롭 가능)라도 서버가 dirty 를 되세워 재시도하므로 실무 유실은 드물다고 본다.
- **D-14:** 상따 전략은 **세션의 전략 전부**(WinForms 에서 등록한 것 포함)를 표시·편집한다. 웹/WinForms 출처 구분 없음.

### 사이드 메뉴 재편
- **D-15:** **기존 URL 유지** — `/scanner`(라벨 「상승률 상위」로 변경), `/themes`, `/watchlist` 는 종목검색 그룹 아래 그대로. 신규 `/trading/limit-chaser`(새 전략 폼), `/trading/limit-chaser/[key]`(전략 편집, key = `ISIN:accountNo:exchange`), `/trading/vi`, `/me`. 홈 `/` 최상단, `/chat` AI 애널리스트 최하단(그룹 밖). 홈 화면 등 기존 표면의 「스캐너」 라벨도 「상승률 상위」로 통일(재량 범위 내 동시 갱신).
- **D-16:** 종목검색▾ / 트레이딩▾ 그룹은 **항상 펼침, 접기 없음** — 그룹 헤더는 클릭 불가 소제목. 접힘 상태 저장 없음.
- **D-17:** **사이드바 트레이딩 › 상따 아래에 등록 전략 목록**을 나열(목업대로): 종목명 · 거래소 · 상태 배지, 클릭 → `/trading/limit-chaser/[key]`. 원천은 D-12 전역 전략 스냅샷/에코. 상따 항목 자체 = 새 전략(빈 폼). VI 항목엔 가동 중일 때 「가동」 배지.
- **D-18:** 모바일은 **헤더 ☰ Sheet drawer 그대로**, 데스크톱과 같은 트리(목록이 길면 drawer 내부 스크롤). 하단 탭바 없음.
- **D-19:** **DMA 매핑 없는 로그인 사용자·비로그인 사용자에게는 트레이딩·My page 항목을 사이드바에서 숨긴다**(wss `unauthorized`/미연결 상태 기준). 직접 URL 진입 시 빈상태(비로그인 → 로그인 유도, 매핑 없음 → 「DMA 계정이 연결되지 않았습니다」). 호가주문 탭의 Phase 15 D-12 「권한 없음」 배지는 그대로.

### My page
- **D-20:** `/me` 구성(모바일 세로 스택): **전략 현황 → 미체결 → 잔고**. 전략 현황 = 상따 전략 목록(종목·거래소·계좌·무장/발주 상태, 클릭 → 편집 페이지) + VI 가동 상태(→ `/trading/vi`) + 전체 비활성화 버튼(D-09). 미체결(취소 버튼 포함)·잔고는 Phase 15 `account-panel` 재사용. **오늘 주문 이력 표는 미포함**(deferred).
- **D-21:** 계좌가 2개 이상이면 **계좌별 미체결·잔고 섹션을 세로로 반복**(계좌 선택 UI 없음, 계좌번호 전체 표시 — Phase 15 D-02a 동일).

### 연결 모델 — 앱 전역 wss 1연결 (Phase 15 D-15 보완)
- **D-22:** **AppShell 수준 프로바이더(`RelayProvider` 류)가 로그인 상태면 relay wss 1개를 열어 유지**한다. 전략 스냅샷·에코·계좌 상태(66/67)·주문 통보·ServerMessage 를 전역으로 받고, 호가주문 탭은 이 연결 위에 종목 구독(sub/unsub)만 얹는다. `useRelaySocket` 을 섹션 단위 훅에서 전역 컨텍스트로 승격(호가주문 탭 회귀 E2E 포함). 결과적으로 DMA 세션은 **앱을 열어둔 동안 살아 있고**, D-15 의 5분 유예는 모든 탭이 닫힌 뒤에만 발동한다(relay 변경 없음).
- **D-23:** 비로그인이면 연결하지 않는다. 로그아웃 시 즉시 close.

### 목업 채택 (초안 → 채택안)
- **D-24:** `16-limit-chaser-mockup-draft.html`·`16-vi-trigger-mockup-draft.html`(2026-09-07 커밋 4d6cb40)을 **채택안 초안**으로 삼는다. ui-phase 에서 다음을 반영해 확정한다: (a) 「0.3초 자동 반영」 서술 → 수정 버튼(D-06/D-07), (b) 자동취소 박스 주황은 `--warn` 토큰 재사용(globals.css 신규 토큰 없음 — 목업 info 참조), (c) My page 목업과 사이드바 숨김/배지 상태 추가, (d) 모바일 390 기준 + 데스크톱 1280, 다크/라이트.

### Claude's Discretion
- wss 메시지 스키마(`{t:"lc.set"|"lc.list"|"vi.set"|"vi.confirm"|"strategies.disable"|"order"|...}`, 상관키 필드명, 전략 스냅샷 프레임 형식), `@gh-radar/shared/relay.ts` 타입 확장 방식, zod 스키마.
- relay 전략 캐시 구조(세션당 Map<key, LimitChaser> + VITrigger + VIOrderList), 60 에코 → 캐시 갱신 → 팬아웃 경로, 스냅샷 전달 시점(auth 직후 `state` 프레임 뒤).
- 주문 wss 요청/응답 타임아웃(5초 유지 권장), 응답 대기 중 중복 전송 방지, `dma_orders` 컬럼 추가(출처 manual/limit_chaser/vi 등).
- FlatBuffer 필드 변환(단일 문자 필드·BasisPoints·bigint→Number)은 한 모듈에서만.
- 사이드바 전략 배지 상태 종류·문구(예: 매수ON / 매도대기 / 매도감시 / 발주됨 / 비활성)와 에코 필드(buyArmed/sellArmed/sellEntryLatched)→배지 매핑.
- 전략 로그(목업 하단) 원천 = `ServerMessage(54)` + 에코 상태 전이 요약, 브라우저 메모리만(새로고침 시 소실).
- 15:40 서버 자동 비활성화(`DisableAllStrategies`)의 표시(에코 run=false 반영 + 로그 1줄).
- 수정 버튼 미적용 상태에서 페이지 이탈 시 경고(beforeunload 또는 라우트 가드).
- VI 마감알림: 브라우저 Notification API + 로컬 설정(localStorage, 이 기기만), 권한 요청 시점, `vi_end_time` 기준 타이머.
- 매수 수량 = 주문금액(만원)÷매수가격 산출·표시, 매도 수량 「예상」 표시(서버 계산값 `sell_order_qty` 는 표시 전용).
- 종목 선택 진입(상따 새 전략 폼): 기존 검색 컴포넌트 재사용, `stocks.isin`·상한가/기준가/호가단위 원천, 선택 시 필드 기본값(상한가 기준) 채움 규칙.
- 계좌 선택 기본값(첫 계좌 / 마지막 선택 기억), 계좌비번 필드 처리(WinForms 와 동일 필요 여부는 fbs·게이트웨이 실측으로 결정 — SetLimitChaser 에 비번 필드 없음).
- REST 주문 라우트 제거 순서(15-20 검증과의 선후), 방화벽·env 정리 범위, `orderbook.spec.ts` E2E 갱신.
- 라우트 파일 구조(`app/trading/limit-chaser/[key]/page.tsx` 등), 서버 컴포넌트/클라이언트 경계, 스켈레톤·빈상태.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 이 phase 의 목업 초안·선행 결정
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-limit-chaser-mockup-draft.html` — 상따 페이지 채택안 초안(모바일 390 + 데스크톱 1280 + 새 사이드 메뉴 트리, 상태 시나리오 3종, 다크). 필드 배치·전략 6박스·보조 패널·사이드바 트리 정본. D-24 수정사항 반영 후 확정.
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-vi-trigger-mockup-draft.html` — VI 페이지 채택안 초안(설정 5개, 시작/중지 확인, VI 주문내역 카드/표, 110/119초 진행바, 미체결·잔고).
- `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-CONTEXT.md` — 세션 모델(D-13~D-16, **D-17 철회: ezmesya 공유 세션**), 인증(D-10~D-12), 자격증명(D-18/D-19), 주문 형식 검사(D-20/D-21), 계좌 상태(D-23), 프로토콜 준수(D-30~D-38), 로컬 개발(D-40/D-41). **본 문서 D-02/D-03/D-22 가 15 의 D-08/D-22/D-24/D-15 를 대체·보완한다.**
- `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-UI-SPEC.md` — 종목상세 4탭·호가주문 탭 레이아웃·상태 배지 8종·계좌번호 표시 규칙. 트레이딩 페이지·My page 가 같은 규율을 따른다.
- `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-orderbook-mockup.html`, `15-tabs-mockup.html` — 호가창·탭 채택 목업(색·배지·주문 확인 다이얼로그 선례).
- `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-20-PLAN.md` — 실서버·실계좌 검증 [BLOCKING] 게이트(미완). 주문 wss 이관의 선후 관계.

### gh-trade 프로토콜·게이트웨이 정본 (형제 저장소 `/Users/alex/repos/gh-trade`)
- `/Users/alex/repos/gh-trade/server/src/protocol/StockDMA.fbs` — `MsgType`(10/11/14/20/21/24/33/34 ↔ 60/61/64/65/56/72/73), `SetLimitChaser`(297~, 29 활성 필드 + deprecated 봉인 슬롯 — **접근자 없는 필드는 보내지 않는다**), `SetVITrigger`(469~), `VIOrderNotice`(484~), `LimitChaserList`(503~), `DisableStrategiesReq/Resp`(511~/519~), `GetStrategyReq`(528~), `ConfirmVIOrderReq`(760~), `VIOrderItem`(766~, state 6종·confirm_locked·deadline110/119_ms), `VIOrderList`(786~).
- `/Users/alex/repos/gh-trade/CLAUDE.md` §「FlatBuffers 메시지 (StockDMA.fbs)」 — MsgType↔테이블 표, 전송 클래스(Notice/Broadcast), 「요청 테이블 없음」 메시지(24/34: 빈 Envelope 로 요청), 요청 연결에만 vs 같은 user 전 연결 규약.
- `/Users/alex/repos/gh-trade/server/src/net/Gateway.h` §`PushLimitChaserEcho` / `BuildLimitChaserEcho` / `BuildVITriggerEcho` 주석 — 60/61 에코가 **Set 응답과 같은 바이트로 세션 전 연결에 Broadcast(드롭 가능, 300ms 콜드 틱)** 된다는 근거(D-11~D-13). `Gateway.cpp` ~2100(BuildLimitChaserEcho, sellQtyTrackBaseline/cancelQtyTrackBaseline/buyArmed/sellArmed/sellEntryLatched/cancelArmed 런타임 필드), ~1983(SetVITriggerResp).
- `/Users/alex/repos/gh-trade/client/Forms/Trading/LimitChaserForm.cs` — 상따전략창 원본(필드 의미·기본값·스위치=등록·둘 다 OFF=삭제·수량 산출 규칙). 웹 폼의 의미 정본.
- `/Users/alex/repos/gh-trade/client/Forms/Trading/VITriggerForm.cs`(+`.Designer.cs`) — [0402] VI 종합주문 원본(확인 체크·119초 면제·마감알림·상태 표시).
- `/Users/alex/repos/gh-trade/client/Services/DMA/Client.cs`, `NotificationHub.cs`, `WireCodes.cs` — 60/61/56/73 수신 처리·단일 문자 코드 변환 선례.
- `/Users/alex/repos/gh-trade/.planning/phases/11.2-limitchaser-push-autosubmit/11.2-CONTEXT.md` — 상따 에코 푸시·자동 반영 설계 근거. `11.1-vi-vitriggerform-get/11.1-CONTEXT.md` — VI 조회/확인 체크 설계. `16-nxt-dma-limitchaser-nxt/16-CONTEXT.md` — 상따 `exchange` 필드(KRX/NXT, nxtTradable 거부) 규약.
- `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh` — 생성물 재동기화(Phase 15 D-26). 전략 테이블 생성 코드는 `relay/src/generated/stock-dma/*.ts` 에 이미 포함.

### gh-radar 통합 지점
- `relay/src/ws/protocol.ts`(zod 인바운드 스키마·`encode`), `relay/src/ws/fanout.ts`(auth 5초·heartbeat·backpressure·`FanoutSessions`), `relay/src/hub/subscription-hub.ts`(스냅샷 캐시·`HubFanoutEvent`/`HubOrderEvent`), `relay/src/dma/session.ts`(`DmaSession` 상태기계·`SessionReadyEvent`), `relay/src/dma/session-manager.ts`(`SESSION_GRACE_MS` 5분), `relay/src/order/order-api.ts`(내부 HTTP 주문 API — D-02 로 주문 부분 제거, `ORDER_RESP_TIMEOUT_MS` 5초·상관 로직 재사용), `relay/src/store/orders.ts`(`OrderStore` 큐·`supabaseOrderSink` — D-03 insert 확장).
- `packages/shared/src/relay.ts` — `RelayInbound`/`RelayOutbound`/`RelayStateMsg`/`RelayAccountState`/`RelayOrderMsg`/`CreateOrderRequest`/`DmaOrderRow` 계약. 전략 메시지·주문 wss 메시지 타입 추가 위치.
- `webapp/src/lib/use-relay-socket.ts`(`useRelaySocket`, `RelayStatus`, 재접속 백오프 상한 10) — D-22 전역 프로바이더로 승격. `webapp/src/lib/orders-api.ts`(`createOrder` 제거, `listOrders` 유지), `webapp/src/lib/relay-url.ts`.
- `webapp/src/components/orderbook/` — `account-panel.tsx`(잔고·미체결·취소, My page 재사용), `order-confirm-dialog.tsx`(VI 시작/중지·전체 비활성화 확인 선례), `order-panel.tsx`(주문 전송부 wss 전환), `relay-status-bar.tsx`(연결 상태 배지 재사용), `orderbook-ladder.tsx`(상따 호가 5단 보조 패널 재사용).
- `webapp/src/components/stock/stock-orderbook-section.tsx` — 현재 유일한 `useRelaySocket` 소비자(전역 전환 시 회귀 대상).
- `webapp/src/components/layout/app-sidebar.tsx`(NAV 배열 평탄 5개 → 트리), `app-shell.tsx`(Sheet drawer, `data-nav-item` 자동 닫힘), `user-section.tsx`. `webapp/src/app/layout.tsx`(Provider 중첩: Theme > Auth > Chat > WatchlistSet — RelayProvider 는 Auth 안쪽).
- `webapp/src/app/scanner/page.tsx`, `themes/`, `watchlist/`, `chat/` — URL 유지, 라벨만.
- `webapp/e2e/specs/orderbook.spec.ts`, `stock-detail-tabs.spec.ts`, `auth-guards.spec.ts`, `smoke.spec.ts` — 회귀 대상 + 신규 `trading-*.spec.ts`/`me.spec.ts`/사이드바 트리 E2E.
- `server/src/routes/orders.ts`, `server/src/app.ts`(87행 `/api/orders` 결선), `server/src/config.ts`(`relayInternalUrl`/`relayOrderSecret` optional) — D-02 제거·정리 대상. `scripts/deploy-server.sh` env 주입.
- `supabase/migrations/` — `dma_orders` 컬럼 추가(출처 등, 재량) 시 마이그레이션.
- `dev.sh`(webapp 3100, server 8080) + relay 로컬 포트(Phase 15 D-41), gh-trade mock 서버(`../gh-trade/server/scripts/run-mac.sh`) — 전략 메시지는 mock 브로커에서도 StrategyManager 가 응답하므로 로컬 검증 가능(빈 응답 규약 확인).

### 운영 규칙(자동 메모리·lessons)
- UI 는 HTML 목업 먼저(globals.css 토큰 인라인, 변형 + 다크/라이트) → UI-SPEC → 구현. 요청한 표면 안의 시각 결함은 묻지 말고 바로 고칠 것.
- IA 결정은 한 번에 하나·모바일 우선. 종목상세 = 상단 4탭 확정(변경 없음).
- Supabase 신규 테이블/컬럼 RLS·REVOKE 명시. Vercel env paste 검증. 커밋 한글·Co-Authored-By 금지.
- 무로그 fail-safe 금지 — relay 전략 변환 실패·거부(ServerMessage ERROR)는 브라우저 상태 영역과 pino 양쪽에 남긴다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useRelaySocket` + `RelayStatus`/`RelayServerMessageEntry` — 전역 프로바이더의 몸통. 인증·재접속·상태 프레임 처리 그대로, 구독을 ref-count 로 바꿔 여러 소비자가 공유.
- `WsFanout`/`SubscriptionHub` 의 스냅샷 캐시 + `HubFanoutEvent` — 전략 캐시·전략 스냅샷 팬아웃의 본보기(D-12).
- `order-api.ts` 의 `ORDER_RESP_TIMEOUT_MS`·OrderResp 상관 로직 → wss 주문 핸들러로 이식(D-02). `OrderStore` 큐 → insert 추가(D-03).
- `account-panel.tsx`(잔고·미체결·취소), `order-confirm-dialog.tsx`, `relay-status-bar.tsx`, `orderbook-ladder.tsx` — My page·상따 보조 패널·VI 확인에 재사용.
- shadcn `Switch/Card/Badge/Table/Dialog/Tabs/Skeleton`, `--up/--down/--warn` 토큰, `stock-hero.tsx` 가격 표시, 종목 검색 컴포넌트(`components/search`).
- `packages/shared/src/relay.ts` 계약 + relay zod 스키마 — 전략·주문 메시지 타입을 3자(relay/webapp/shared)에 한 번에 추가.
- `relay/src/generated/stock-dma/` 에 `SetLimitChaser`/`SetVITrigger`/`VIOrderList` 등 생성 코드 이미 존재(재동기화 불필요할 가능성 높음 — `sync-relay-schema.sh --check` 로 확인).

### Established Patterns
- relay ↔ 브라우저 메시지는 `{t: "..."}` 판별 유니온 + zod 파싱(`protocol.ts`), 상태는 `state` 프레임, ServerMessage 는 누적 표시.
- 단일 문자 wire 코드("B"/"S", "K"/"Q", "N"/"C", "0"/"1") 변환은 한 함수/모듈에서만(Phase 15 D-21).
- 신규 워크스페이스 코드는 `typecheck`·vitest 필수, 프론트는 Playwright E2E(스펙 파일 단위), 배포는 `deploy-relay.sh`/Vercel prebuilt.
- 프론트 phase 순서: 목업(다크/라이트, 모바일 390 기준) → `16-UI-SPEC.md` → 구현.
- 사이드바 NAV 는 상수 배열 + `aria-current` + `data-nav-item`(drawer 자동 닫힘) — 트리로 확장해도 같은 속성 유지.

### Integration Points
- `relay/src/ws/fanout.ts` 인바운드 분기(sub/unsub 옆에 전략·주문 메시지), `relay/src/dma/session.ts` Ready 훅(24/21/34 초기 호출), 60/61/64/72/73/56/51/52/53 수신 → 캐시 갱신 + 팬아웃.
- `webapp/src/app/layout.tsx` 에 RelayProvider 추가(Auth 안쪽), `app-sidebar.tsx` 트리 + 전략 목록 + 숨김, 신규 라우트 `app/trading/**`, `app/me`.
- `stock-orderbook-section.tsx`/`order-panel.tsx` — 전역 연결 소비 + wss 주문 전송으로 전환, `orderbook.spec.ts` 갱신.
- server: `routes/orders.ts` POST 제거(GET 유지), `config.ts`/`deploy-server.sh` env 정리.
- Supabase: `dma_orders` 컬럼 추가(재량) 마이그레이션 [BLOCKING] db push.
- 인프라: relay 내부 HTTP 가 healthz 만 남으면 방화벽 내부포트 규칙 축소(재량), 재배포 `deploy-relay.sh` + smoke 갱신.

</code_context>

<specifics>
## Specific Ideas

- **WinForms 와 「한 세션」 감각:** 웹에서 스위치를 켜면 WinForms 상따창에 즉시 「무장」이 뜨고, WinForms 에서 값을 바꾸면 웹 폼이 토스트와 함께 서버값으로 바뀐다. 웹은 서버 상태의 뷰이지 별도 복사본이 아니다.
- **수정 버튼 규율:** 값 변경은 명시 버튼으로만, 스위치는 즉시 — 실수로 값을 바꿔 자동 반영되는 사고를 막되 상한가 직전의 스위치 조작은 한 번에.
- **사이드바 = 전략 대시보드:** 어느 페이지에서나 등록 전략과 무장 상태(배지)가 보인다. 목업 초안 트리 그대로.
- **모바일 390 기준** 세로 순서(상따): 종목·거래소·계좌 → 상태줄 → 매수주문 → 매수가격 → 한방체결 → 매도주문 → 매도가격 → 자동취소 → 호가 5단 → 잔고/미체결 → 전략 로그. VI: 설정 → 시작/중지 → 상태줄 → VI 주문내역(카드) → 미체결 → 잔고.
- **수량 입력 없음:** 매수 수량 = 주문금액(만원)÷매수가격 산출 표시, 매도 수량은 매도가능×비율 「예상」 표시(서버 계산값이 정본).
- **VI 마감알림은 이 기기만**(브라우저 Notification, 서버 저장 없음).
- 상따 자동취소 박스 색은 `--warn`(gh-trade 주황 대응), 새 토큰 없음.

</specifics>

<deferred>
## Deferred Ideas

- **오늘 주문 이력 표(dma_orders)** 를 My page 에 — v1 미포함(D-20). 조회 라우트는 유지되므로 후속 quick 으로 추가 용이.
- **명시 삭제 버튼**(스위치 둘 다 OFF 외 경로) — v1 은 WinForms 동일(D-08).
- **주기 재조회·수동 「서버와 다시 맞춤」 버튼** — 60 드롭으로 캐시가 어긋나는 사례가 관측되면(D-13).
- **편집 중 필드 보호(더티 필드 덮어쓰기 유예)** — 서버값 우선(D-11)으로 불편이 확인되면.
- **그룹 접힘/토글 기억, 모바일 하단 탭바** — 항목이 더 늘면(D-16/D-18).
- **매핑 없는 사용자용 안내 페이지 규격**(사이드바 숨김 대신 노출 + 안내) — 자격증명 입력 UI(`/settings/dma`, Phase 15 deferred)와 함께.
- **단건 비활성화 UI**(DisableStrategies key 지정) — 스위치 OFF 로 갈음(D-09).
- **VI NXT 지원**(현재 서버가 KRX 전용) — gh-trade 측 변경 필요.
- **거래원(74/75)·정정/IOC/FOK/시장가·서버측 한도** — Phase 15 deferred 그대로.
- **Cloud Run server 의 relay 내부 HTTP 완전 제거**(healthz 포함) — 주문 이관 후 남는 용도가 없으면 후속 정리.

</deferred>

---

*Phase: 16-trading-limit-chaser-vi-my-page*
*Context gathered: 2026-09-08*
