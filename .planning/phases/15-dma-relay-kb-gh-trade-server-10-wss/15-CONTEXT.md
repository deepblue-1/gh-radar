# Phase 15: DMA 중계 서버(relay) — KB gh-trade-server 호가 10단 시세 wss 팬아웃 + 주문 릴레이 - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-radar 에 **DMA 중계 서버 `relay/` 워크스페이스**(Node 22 + TypeScript, pnpm 워크스페이스 `relay/` — gh-trade 의 `sync-relay-schema.sh` 가 이 경로를 기본값으로 본다)를 신설한다. GCE VM(`radar-gw`, asia-northeast3) 위에서 KB 증권 AnyConnect VPN(openconnect) 너머의 gh-trade-server(C++ DMA 게이트웨이, KB 데이터센터 10.41.1.120:9100, `[uint32 LE 길이][FlatBuffer Envelope]`)에 TCP 로 붙어 다음을 제공한다.

1. **시세 팬아웃(읽기):** 호가 10단(`QuoteState`) + 체결 테이프(`TradeTape`), KRX/NXT — 브라우저에 **wss 로 직접**(`wss://dma.jx1.io`, Caddy TLS) 푸시. 웹앱 `/stocks/[code]` 에 호가창 섹션 신설.
2. **계좌 상태 팬아웃:** 잔고·미체결(`AccountState` 66/67 스냅샷+델타) — 미체결 목록·취소 버튼·잔고 패널의 원천.
3. **주문 릴레이(쓰기):** 브라우저 → Cloud Run `server` REST(`requireAuth`) → Direct VPC Egress → VM relay 내부 HTTP → `DirectOrderReq`. 신규 매수/매도 + 취소, 지정가 보통만.
4. **인프라:** VM 프로비저닝(e2-micro Debian 12, 신규 고정 IP, 방화벽 443/IAP/내부포트), openconnect systemd 유닛, Caddy, `relay/Dockerfile` + `scripts/deploy-relay.sh`(Artifact Registry → VM pull), **kbs124 계정으로 VM 에서 VPN 연결·출발지 IP 제한·동시 세션 선검증**(초기 게이트).

**DMA 세션 모델은 사용자별**이다. gh-radar 사용자(Gmail 로그인) ↔ DMA `user_id/password` 매핑(Supabase, AES 암호화)으로 사용자마다 별도 DMA TCP 세션을 열고, 그 세션으로 시세·체결·계좌·주문을 모두 처리한다. 이는 gh-trade **Phase 17**(users.toml 로그인 인증 + `LoginResp.accounts` 허용 계좌 공급)에 의존하며 두 phase 는 병행한다.

**밖:** 거래원(`MemberStats` 74/75) 팬아웃, 정정(M) 주문·IOC/FOK·시장가, 서버측 주문 한도, 웹앱 자격증명 입력 UI, 공용 시세 세션, Cloud Run WebSocket, 상따/VI 전략 조작(gh-trade 전략 메시지 10~26·33~34 는 relay 가 다루지 않음), 종목마스터 다운로드(27/57 — ISIN 은 gh-radar `stocks` 마스터에서 해결, D-28).

**Requirements:** TBD — plan 단계에서 **RELAY-01**(시세·계좌 팬아웃)·**RELAY-02**(주문 릴레이)·**RELAY-03**(VM/VPN 인프라) 등 신규 등록(REQUIREMENTS.md 갱신, Phase 11~14 선례).

**원천 문서:** `tasks/relay-handoff.md`(gh-trade 세션 2026-09-05 인계). 핸드오프는 "재검토 금지"라 했으나 사용자 지시로 전면 재검토했다. 아래 결정이 핸드오프와 다른 곳(세션 모델·인증·계좌·VPN 선검증·거래원 제외·ISIN 매핑 등)은 **본 CONTEXT 가 우선**한다. 핸드오프 §3 프로토콜 실측 사실은 fbs 대조로 확인돼 그대로 유효(D-30~D-38).

</domain>

<decisions>
## Implementation Decisions

### 범위·분할
- **D-01:** 시세 팬아웃 + 주문 릴레이를 **한 phase(15)** 에 포함(핸드오프 유지). plan 은 wave 로 나누되 계좌·주문 wave 는 D-25 의존 게이트 뒤에 둔다.
- **D-02:** 웹앱 `/stocks/[code]` 에 **호가창 섹션 포함** — 호가 10단 + 체결 테이프 + 연결/세션 상태 + 주문 패널(신규/취소, 계좌 선택) + 잔고·미체결. 프론트 phase 규칙대로 **HTML 목업(globals.css 토큰 인라인, 변형 + 다크/라이트) 시각 확인 → UI-SPEC → 구현**.
- **D-02a (UI-phase 2026-09-05 사용자 결정 — D-02 의 마운트 위치를 대체):** 종목상세 `/stocks/[code]` 를 **히어로(공통) + 상단 4탭 `차트 · 호가주문 · 종목정보 · 뉴스토론`** 으로 재구성한다(모바일 기준, 토스증권식). 호가창은 별도 섹션이 아니라 **호가주문 탭**이다. 탭 배치: 차트=일봉차트 / 종목정보=통계·테마·상한가이력·동조종목 / 뉴스토론=뉴스·종목토론 — 기존 섹션(Phase 6/7/9/11/12 표면)은 내용 무변경으로 탭 안에 재배치만 하며 **Playwright 회귀 E2E**(각 탭 진입·딥링크·기존 섹션 렌더)를 plan 에 포함한다. 탭은 `?tab=chart|orderbook|info|news` 쿼리로 URL 반영(딥링크·뒤로가기), 기본 `chart`, 탭 바 sticky. 탭 컴포넌트는 shadcn 공식 registry `tabs`(Radix, ARIA tablist 내장) 추가. 데스크톱에서 호가주문 탭 패널만 넓은 컨테이너(좌우 여백 24px, 다른 탭은 현행 `max-w-4xl`)를 쓰고 채택 레이아웃 L1=B(좌 호가+체결 / 우 주문+잔고·미체결) / L2=A(중앙 가격 1열) / L3=A(단계 최대 정규화 잔량바). 모바일(390px)은 세로 스택 **연결상태 → 호가 5단(+10단 전체 버튼) → 주문 패널 → 체결 → 잔고 → 미체결**. 이중 가격(히어로 스냅샷 vs 호가주문 실시간)은 둘 다 유지 + 출처 라벨, 계좌번호는 화면 전체 표시(로그만 마스킹). 채택 목업: `15-tabs-mockup.html`(페이지 구조·탭·모바일) + `15-orderbook-mockup.html`(호가창 상세·상태 8종). 정본은 `15-UI-SPEC.md`.
- **D-03:** **VM 프로비저닝·openconnect·Caddy·relay 배포까지 이 phase.** 핸드오프의 "KB 확인 3건 대기" 대신 **kbs124 계정으로 VM 에서 openconnect 연결이 되는지·출발지 공인 IP 제한이 있는지·Mac 세션과 동시 접속이 되는지를 먼저 검증**한다(초기 wave, [BLOCKING] 사용자 체크포인트). 검증 시도는 수동 소수 횟수(≤3)로 제한하고 실패 시 자동 재시도 없이 중단 — 반복 실패는 KB 계정 잠금.
- **D-04:** 데이터 범위 = **호가 10단 + 체결 테이프, KRX+NXT**(거래소는 보는 사람이 토글). 거래원(MemberStats)은 제외(deferred).

### 배포 토폴로지
- **D-05:** 브라우저 시세 wss 는 **VM 직접 + Caddy(Let's Encrypt 자동)**. Cloud Run 에서 WebSocket 을 열지 않는다(연결 유지 중 vCPU 활성 과금). Cloud Run 은 인증·REST·주문 라우트만.
- **D-06:** 호스트명 **`dma.jx1.io`** — 사용자 보유 도메인 `jx1.io` 에 사용자가 A 레코드 추가(VM 고정 IP 확보 후 값 전달, 체크포인트). 웹앱 env `NEXT_PUBLIC_RELAY_WS_URL=wss://dma.jx1.io/ws`(경로는 재량).
- **D-07:** VM = **e2-micro, Debian 12**, asia-northeast3, 기존 `gh-radar-vpc`/`gh-radar-subnet-an3`(10.10.0.0/26) 안, **신규 외부 고정 IP**(기존 `gh-radar-static-ip` 34.64.195.151 은 Cloud NAT 용이라 재사용 금지). relay 는 **Docker**(`--restart=always`, Artifact Registry pull), **openconnect 는 host systemd**, Caddy 는 host 패키지 또는 컨테이너(재량). swap 1GB. 메모리 압박 시 머신타입만 e2-small 로 변경.
- **D-08:** 주문 경로 = **브라우저 → Cloud Run `server` REST → Direct VPC Egress(기존 `--network/--subnet/--vpc-egress=all-traffic`) → VM 내부 IP:내부포트 HTTP → relay OrderApi**. VPC 커넥터 신설 없음. relay 내부 포트는 서브넷(10.10.0.0/26) 출발지만 방화벽 허용 + 공유 비밀 헤더(Secret Manager). 9100·내부포트는 공인망에 절대 노출하지 않는다.
- **D-09:** VM 접근은 **IAP 터널 SSH**(방화벽 22 는 35.235.240.0/20 만). 공인 인바운드는 443 만. `gh-radar-vpc` 에는 현재 방화벽 규칙이 하나도 없으므로 443/IAP-22/내부포트 3규칙을 새로 만든다.

### 인증·접속 권한
- **D-10:** relay 의 Supabase 토큰 검증 = **`supabase.auth.getUser(token)` 네트워크 검증**(서버 Phase 14 D-02 와 동일 패턴, jose 미사용). 로그아웃·revoke 즉시 반영.
- **D-11:** 토큰 전달 = **업그레이드 후 첫 메시지 `{t:"auth", token}`**. 5초 내 미인증 시 close(4401). 인증 전 구독·주문 메시지는 close. URL·Caddy 로그에 토큰 미기록.
- **D-12:** **시세·주문 모두 allowlist** — allowlist 의 정의는 **`dma_credentials` 매핑 행 존재**(D-18). 매핑 없는 로그인 사용자는 wss 인증 후 `unauthorized` 상태 프레임을 받고 호가창은 "권한 없음" 상태를 표시. 서버 주문 라우트도 같은 기준으로 403.

### 세션 모델 (핸드오프 §1 "단일 radar 세션·종목당 구독 1개" 대체)
- **D-13:** **gh-radar 사용자별 DMA 세션 1개.** 매핑된 DMA `user_id/password` 로 사용자마다 별도 TCP 세션(Idle→Connecting→LoggingIn→DeclaringAccounts→Ready, gh-trade `Session.cs` 상태기계 이식). 시세·체결·계좌 상태·주문 모두 그 세션. 구독 참조계수는 **세션(사용자) 단위** — 같은 사용자의 탭 여러 개가 같은 종목을 보면 KB 방향 구독 1개, 다른 사용자는 각자 구독(게이트웨이가 세션별 팬아웃하므로 무해).
- **D-14:** 세션 부팅: `LoginReq(1)` {user_id, password, broker:"KB"} → `LoginResp(50)` success + **`accounts`(gh-trade 17 D-19 append, `AccountEntry{account_no,name}`)** → 목록의 **모든 계좌**를 `UpdateAccountNoReq(3)` mode "1" 로 선언 → `UpdateAccountNoResp(55)` 목록 대조 → Ready. `mode "2"` 조회 왕복은 하지 않는다(gh-trade 17 D-11). 계좌 0건이면 세션 실패("서버에 등록된 계좌가 없습니다"). 계좌 목록은 상태 프레임으로 브라우저에 내려 주문 패널 계좌 선택의 원천으로 쓴다.
- **D-15:** 라이프사이클: **wss 첫 인증 연결 시 로그인**, 그 사용자의 **모든 wss 가 끊긴 뒤 5분 유예** 후 TCP 종료(구독 전부 해제). 주문 REST 는 활성 Ready 세션이 없으면 **409 `SESSION_NOT_READY`**("호가창을 먼저 열어 주세요") — 즉시 로그인은 하지 않는다.
- **D-16:** 재접속: 운영 중 단절은 백오프 재접속 + 재로그인(메모리 보관 비밀번호) + 계좌 재선언 + 구독 전부 재구독(gh-trade 17 D-16 동형). **서버가 재로그인을 거부하면 재접속 루프를 멈추고** 브라우저에 실패 상태를 내린다(17 D-17 동형). 재접속 상한·백오프 수치는 재량이나 **무한 재시도 금지**.
- **D-17:** gh-radar 매핑용 DMA `user_id` 는 **WinForms 클라이언트가 쓰는 값과 다른 값**으로 users.toml 에 등록한다(핸드오프 §3 원칙 유지 — 게이트웨이는 user_id+broker 로 세션을 합류시키므로 같은 값이면 전략 상태·계좌 범위가 섞인다). 예: WinForms `alex`, gh-radar `alex-radar`. users.toml 편집은 gh-trade 측 운영 절차이며 값은 이 저장소에 적지 않는다.

### 자격증명
- **D-18:** Supabase 테이블 **`dma_credentials`**(user_id PK → `auth.users`, dma_user_id, dma_password_enc, created_at/updated_at). **RLS 활성 + 정책 0개**(어떤 클라이언트 role 도 접근 불가, 서비스롤만). 비밀번호는 **AES-256-GCM 암호화** 저장, 키는 Secret Manager `gh-radar-dma-cred-key`. 등록은 **관리자 수기 스크립트**(로컬에서 키를 Secret Manager 에서 읽어 암호화 후 upsert). 웹앱 입력 UI 없음(deferred).
- **D-19:** 복호·조회 주체 = **relay**(VM). relay 컨테이너는 기동 시 Secret Manager 에서 `SUPABASE_SERVICE_ROLE_KEY`(`dma_credentials`·`dma_orders` 접근)·`DMA_CRED_KEY`·`RELAY_ORDER_SECRET`·`SUPABASE_URL` 을 받아 env 로 가진다(VM SA 에 secretAccessor). 평문 비밀번호는 세션 객체 메모리에만 있고 로그·파일에 남기지 않는다(pino redact). Cloud Run server 는 AES 키를 갖지 않는다.

### 주문
- **D-20:** **서버측 금액·수량 한도 없음.** 형식 검사만(ISIN 12자, 수량>0 정수, 가격>0 정수, exchange ∈ KRX/NXT, side ∈ B/S, account_no ∈ 그 사용자 세션의 계좌 목록). 확인 다이얼로그는 웹앱 몫, relay 는 판단하지 않는다.
- **D-21:** 주문 유형 = **신규 매수/매도(`order_type` "N") + 취소("C", `org_order_no` 필수, 취소수량 = 미체결 잔량 — 0 은 즉시 거부)**, `order_condition` **"0"(보통) 고정**, 시장가 없음, 정정("M") 없음. `market` "K"/"Q" 는 `stocks.market` 으로 서버가 채운다. 단일 문자 필드("B"/"S", "K"/"Q", "N"/"C", "1") 변환은 한 함수에서만.
- **D-22:** 주문 결과: `POST /api/orders` 는 relay 에 릴레이한 뒤 **첫 `OrderResp(51)`(접수 "A" 또는 거부 "R")까지 최대 5초 대기** 후 응답(order_no, result_code, message). 이후 체결("E")·취소확인("C")은 relay 가 **주문자 wss 로 푸시**. 상관키는 `order_no`(접수 전 거부는 stock_code+account_no+요청시각).
- **D-23:** **계좌 상태 팬아웃**: 세션 Ready 후 `GetAccountStateReq(25)`{account_no:""} → `GetAccountStateResp(66)` 스냅샷(계좌당 1프레임) + `AccountStateDelta(67)` 증분(`removed_order_nos` 삭제 표식)을 wss 로 내려 미체결 목록(+취소 버튼)·잔고 패널을 표시. 미체결 행의 order_no 가 취소 요청의 `org_order_no`.
- **D-24:** 주문 기록 = **Supabase `dma_orders`**(server 가 요청·접수 응답을 insert, relay 가 체결·취소확인 통보를 서비스롤로 update) + relay stdout(pino) 로그. 웹앱 새로고침 후에도 오늘 주문 목록을 복원한다.

### gh-trade 의존·병행
- **D-25:** gh-trade **Phase 17**(users.toml 인증 + `LoginResp.accounts`)과 **병행**. 15 초반 wave(VM·VPN 선검증·`relay/` 뼈대·코덱·DmaClient·SubscriptionHub·WsFanout·호가 UI)는 **현행 스키마**(mock 서버 users.toml 없음 = 무인증, accounts 빈 벡터)로 진행. **계좌 선언·계좌 상태·주문 wave 는 gh-trade 17 완료 후 `sync-relay-schema.sh` 재실행(생성물 재커밋)을 선행 조건**으로 둔다 — plan 에 [BLOCKING] 의존 게이트 명시. 17 완료 전에는 mock 무인증 로그인으로 D-13 세션 구조까지만 검증.
- **D-26:** 생성물(`relay/src/generated/` — `StockDMA.ts`, `stock-dma.ts`, `stock-dma/*.ts` 38개, SYNC MARKER 붙은 `StockDMA.fbs` 사본)은 gh-trade 스크립트가 만들고 gh-radar 에 커밋, 손으로 고치지 않는다. flatc 25.12.19 / npm `flatbuffers` 25.x 고정. 스키마 정본은 gh-trade `server/src/protocol/StockDMA.fbs` 하나. relay tsconfig 는 server 와 같은 ESM + `NodeNext`(생성 코드 `.js` import).
- **D-27:** 실서버(10.41.1.120) 접속과 실계좌 주문은 D-03 VPN 선검증 통과 + gh-trade 17 배포(120 에 users.toml 배치) 후 **사용자 지시가 있을 때만**. 그 전 모든 검증은 mock 브로커(로컬 Mac 또는 VM 안 mock gh-trade-server) + `inject_b6.py` 가짜 호가.
- **D-28:** **ISIN 매핑은 gh-radar `stocks` 마스터로 해결.** 게이트웨이 키는 12자 ISIN 인데 gh-radar 는 6자 단축코드다. KRX 기본정보(`fetchBaseInfo.ts`)에 `ISU_CD`(표준코드)가 이미 오므로 `stocks.isin` 컬럼을 추가하고 master-sync 가 저장한다(단축코드→ISIN 산술 유도는 우선주 등에서 어긋나므로 금지). 서버 주문 라우트·웹앱 호가창은 `stocks.isin` 을 쓰며, gh-trade `GetSymbolMasterReq(27)` 는 쓰지 않는다.

### 프로토콜 준수 (게이트웨이 실측 — 핸드오프 §3, fbs 대조 확인, 그대로 유효)
- **D-30:** 프레이밍 `[uint32 LE 길이(페이로드만, 헤더 4바이트 제외)][FlatBuffer]`, 루트 `Envelope`, `msg_type` 분기, 수신 버퍼에서 길이만큼 잘라내는 루프(프레임 결합/분할). 길이 상한 4MB.
- **D-31:** JS/TS 런타임엔 Verifier 가 없다 → 길이 상한 + 접근자 try/catch, 실패 프레임만 버리고 경고 로그, 연결 유지.
- **D-32:** `LivePing(4)` 30초마다(서버는 클라→서버 완성 패킷만 활동으로 세고 유휴 90초면 끊음). `socket.setNoDelay(true)`. 수신 경로에 동기 블로킹 금지(연결당 송신 큐 1024프레임/4MB 초과 시 서버가 연결 종료).
- **D-33:** 시세 = `GetQuoteReq(28)` 스냅샷 → `SubscribeQuoteReq(29)` 구독, 키 `isin+exchange`, 해제는 `subscribe:false`. 58/59 는 `quote_state` 슬롯 공유·`is_snapshot` 구분. 체결 테이프 `GetTradeTapeReq(32)`{isin, exchange, count} → 69/71 `trade_tape` 슬롯, 별도 구독 없음(시세 구독 편승).
- **D-34:** `change_sign` 원문 1자가 부호 정본. `exchange_time` "HHMMSSuuuuuu" 가 신선도 원천. 가격·수량 필드는 `long` → 생성 코드가 `bigint` 를 내므로 JSON 직렬화 전 Number 변환(안전 범위 확인, 누적거래대금 주의).
- **D-35:** 업스트림 100ms 코얼레싱 그대로 통과(추가 코얼레싱 없음), 체결 테이프만 200ms 배치. permessage-deflate ON. egress 최적화 안 함(월 $1~6 수준).
- **D-36:** `ServerMessage(54)` {level, message, isin, account_no, source, kind} 는 상태 프레임으로 브라우저에 그대로 흘림. VPN/DMA 세션 상태도 상태 프레임.
- **D-37:** 브라우저 재접속 시 스냅샷부터 다시(SubscriptionHub 스냅샷 캐시로 즉시 전달).
- **D-38:** 기준 구현은 gh-trade C# 클라이언트(`Session.cs`/`Client.cs`/`PacketCodec.cs`) — 상태기계·프레이밍·핑·재접속 규율을 TS 로 이식. 서버 코드 변경은 없다(게이트웨이는 relay 를 클라이언트 하나로 본다).

### 로컬 개발
- **D-40:** VPN 없이 Mac 에서 gh-trade-server mock(`cd ../gh-trade/server && ./scripts/build.sh && ./scripts/run-mac.sh`, 포트 9100, `[broker] name="mock"`) + `server/scripts/uat/inject_b6.py --send` 가짜 호가. mock 은 가격 0 주문에 거부를 돌려주므로 거부 경로 검증. relay 단위 테스트는 vitest + 가짜 서버 소켓(프레임 결합/분할·불량 프레임 드롭·핑·재접속 재현). 다른 개발 서버가 9100 을 잡고 있으면 UAT 사본 toml 로 포트를 옮긴다.
- **D-41:** 웹앱 로컬은 `dev.sh`(webapp :3100, server :8080) + relay 로컬 포트(재량, 예 :8090 ws / :8091 내부 HTTP). `NEXT_PUBLIC_RELAY_WS_URL` 로컬값 `ws://localhost:8090/ws`.

### Claude's Discretion
- wss 메시지 스키마(압축 JSON 필드명, 상태 프레임 종류, 구독 프로토콜 `{t:"sub", isin, ex}` 류), TradeTape 배치 형식, `@gh-radar/shared` 에 계약 타입 공유 여부(권장: `packages/shared/src/relay.ts`).
- 토큰 만료 처리(1h access token): 연결 시 1회 검증 유지 vs 주기 재인증 — 주문 REST 는 매 요청 서버 `requireAuth` 를 거치므로 위험은 낮다.
- 재접속 백오프 수치·상한, 세션 유예 시간(5분 기본), 스냅샷 캐시 TTL, ws 30초 ping.
- 장애·알림 UX: VPN/DMA 단절 시 브라우저 상태 배지, openconnect systemd 재시도 상한(`StartLimitBurst`)·백오프·Cloud Monitoring 알림 정책(`ops/alert-*.yaml` 패턴, 기존 알림 채널) — **무한 재시도 금지** 원칙만 고정.
- relay 모듈 구조(DmaClient/SubscriptionHub/WsFanout/OrderApi 는 핸드오프 제안), 로거(server 와 같은 pino + GCP config), 헬스 엔드포인트(내부포트 `/healthz`).
- `dma_orders`·`dma_credentials` 정확 스키마, 오늘 주문 목록 조회 라우트(`GET /api/orders?date=`), 체결 통보 반영 방식.
- AES 구현 세부(nonce·AAD=user_id), 관리자 등록 스크립트 형태(`scripts/dma-credentials.ts` 류).
- VM 프로비저닝 세부: Caddyfile, docker 로그 로테이션, swap, unattended-upgrades, openconnect 유닛 옵션(Mac `/usr/local/sbin/kbvpn-connect` 와 동일 인자 — 비밀번호는 Secret Manager 에서 읽어 stdin, 값은 문서·로그·커밋에 절대 미기록), VM SA·Secret 접근 IAM.
- 호가창 UI 세부(레이아웃·색·호가 클릭→가격 입력·거래소 토글·주문 패널·잔고/미체결 배치)는 목업 → UI-SPEC. 국내 색상 관례(상승 빨강 `--up`, 하락 파랑 `--down`, Phase 14 D-07 동일).
- Cloud Run server 의 relay 내부 URL 설정(`RELAY_INTERNAL_URL=http://10.10.0.x:8091`), 타임아웃, `deploy-server.sh` env 추가.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 인계·프로토콜 정본 (gh-trade — 형제 저장소 `../gh-trade`, 절대경로 `/Users/alex/repos/gh-trade`)
- `tasks/relay-handoff.md` — 원 인계 문서. §3 프로토콜 실측·§4 모듈 제안·§5 작업 순서·§6 로컬 개발·§7 비용. 본 CONTEXT 와 충돌 시 CONTEXT 우선.
- `../gh-trade/server/src/protocol/StockDMA.fbs` — 스키마 정본(852줄). `MsgType`(3~), `LoginReq`(99~), `DirectOrderReq`(113~), `UpdateAccountNoReq`(140~), `LoginResp`(155~), `OrderResp`(161~), `TradeExecution`(220~), `ServerMessage`(244~), `GetQuoteReq`(603~), `SubscribeQuoteReq`(614~), `GetTradeTapeReq`(621~), `QuoteState`(636~), `TradeTape`(682~), `Envelope`(783~). append-only·deprecated 슬롯 규약 주석.
- `../gh-trade/CLAUDE.md` §「FlatBuffers 메시지 (StockDMA.fbs)」 — MsgType↔테이블 표(1~35 요청, 50~75 응답/푸시), 전송 클래스(Notice/Broadcast) 기준, 58/59·66/67·69/71 슬롯 공유 규약.
- `../gh-trade/server/scripts/sync-relay-schema.sh` — `relay/src/generated/` 생성·mirror 스크립트(가드 3종, `--check`, 멱등). `relay/` 디렉터리 선행 필요. gh-trade 커밋 d83e11d.
- `../gh-trade/.planning/phases/17-dma-login-auth-user-accounts/17-CONTEXT.md` — **로그인 인증·`LoginResp.accounts`(`AccountEntry{account_no,name}`) 계약**, D-03 mock 무인증, D-04 거부 단일 문구, D-11 mode "2" 제거, D-12 계좌 0건 실패, D-13 허용 밖 계좌 warn, D-16/D-17 재접속 재로그인·거부 시 루프 중단. 본 D-14/D-16/D-25 의 근거.
- `../gh-trade/client/Services/DMA/Session.cs` — 세션 상태기계(Idle→Connecting→LoggingIn→DeclaringAccounts→Ready, 부트 실패 vs 운용 중 실패, transport generation, 5초 응답 타임아웃).
- `../gh-trade/client/Services/DMA/Client.cs` — 프레이밍·수신 버퍼 루프(~1370-1520)·핑(~1247)·NoDelay(~296)·TakeCount 벡터 상한.
- `../gh-trade/client/Services/DMA/PacketCodec.cs` — `TryExtract` 길이 프레이밍 코덱.
- `../gh-trade/server/config/server.toml` — 포트 9100, `client_idle_timeout_sec = 90`, TCP keepalive, `[broker] name="mock"`.
- `../gh-trade/server/scripts/uat/inject_b6.py` — 가짜 호가 주입(기본 dry-run, `--send`).
- `../gh-trade/server/scripts/build.sh`, `../gh-trade/server/scripts/run-mac.sh` — mock 서버 로컬 실행.

### gh-radar 통합 지점
- `server/src/middleware/require-auth.ts` — `supabase.auth.getUser` JWT 검증 패턴(D-10 relay 이식 + 주문 라우트 적용).
- `server/src/app.ts` — 라우터 결선·`app.locals` DI·`express.json 16kb`. `/api/orders` 등록 지점.
- `server/src/config.ts` — env 키 추가 위치(`RELAY_INTERNAL_URL`, `RELAY_ORDER_SECRET`).
- `server/src/middleware/rate-limit.ts`, `server/src/errors.ts`, `server/src/middleware/error-handler.ts` — 에러 envelope `{error:{code,message}}` + ApiError.
- `server/Dockerfile` — `relay/Dockerfile` 본보기(멀티스테이지 pnpm deploy --legacy, non-root, GIT_SHA).
- `server/tsconfig.json` — ESM + `NodeNext`(생성 코드 `.js` import 와 일치) — relay tsconfig 동형.
- `scripts/deploy-server.sh` §VPC(~120-145) — `gh-radar-vpc`/`gh-radar-subnet-an3`/`--vpc-egress=all-traffic` Direct VPC Egress(D-08 근거).
- `scripts/deploy-intraday-sync.sh` — gcloud 가드·Artifact Registry 태깅(`asia-northeast3-docker.pkg.dev/gh-radar/…:${SHA}`)·Secret 주입·알림 정책 갱신 패턴 → `deploy-relay.sh` 본보기.
- `ops/alert-intraday-sync-failure.yaml` — Cloud Monitoring 알림 정책 YAML 패턴.
- `workers/master-sync/src/krx/fetchBaseInfo.ts` — KRX 기본정보 `ISU_CD`(표준코드 12자) 필드(D-28 `stocks.isin` 원천). `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql` — 현행 `stocks` 컬럼.
- `webapp/src/lib/chat-sse.ts`(~120-135), `webapp/src/lib/auth-context.tsx` — `getSession().access_token` 취득 경로(wss auth 메시지용).
- `webapp/src/lib/api.ts` — `NEXT_PUBLIC_API_BASE_URL` 패턴(→ `NEXT_PUBLIC_RELAY_WS_URL` 동형).
- `webapp/src/components/stock/stock-detail-client.tsx`, `stock-daily-chart-section.tsx`, `stock-comovement-section.tsx`, `stock-hero.tsx` — 종목상세 섹션 마운트·스켈레톤/빈상태·가격 표시 선례.
- `webapp/src/app/stocks/[code]/page.tsx` — 서버 컴포넌트 진입.
- `supabase/migrations/20260416120000_watchlists.sql` — RLS 정책 패턴(비교용; `dma_credentials`/`dma_orders` 는 정책 0개·서비스롤 전용).
- `.planning/phases/14-ai-analyst-chatbot/14-CONTEXT.md` D-02 — 서버 JWT 검증 선례.
- `dev.sh` — 로컬 포트(webapp 3100, server 8080).
- Mac `/usr/local/sbin/kbvpn-connect` — openconnect 실인자(`--protocol=anyconnect --authgroup=KBSEC_DMA --servercert pin-sha256:… --passwd-on-stdin`, 서버 `https://211.47.35.211:65535`) — VM 유닛 작성 시 참조(비밀번호 값 제외).

### 운영 규칙(자동 메모리·lessons)
- Supabase 신규 테이블 RLS 는 role 명시(공개 테이블 `TO anon, authenticated`; 본 phase 비공개 테이블은 정책 0개 = default-deny 의도, RPC 는 `REVOKE FROM anon, authenticated` 명시).
- lightweight-charts oklch 금지(호가창이 차트 색 재사용 시 hex 변환).
- Vercel env paste trailing newline 검증(`NEXT_PUBLIC_RELAY_WS_URL`).
- 워커 배포 스크립트 env(`GCP_PROJECT_ID`,`SUPABASE_URL`, `NOTIFICATION_CHANNEL_ID`).
- 스케줄·상수 변경 시 설정처와 검증처(smoke) 동시 갱신.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAuth` 미들웨어 — 주문 라우트에 그대로 적용, relay 에 동일 로직 이식(D-10).
- 에러 envelope/ApiError, rate-limit, pino+GCP 로거(`@google-cloud/pino-logging-gcp-config`) — relay 로거 동형.
- `server/Dockerfile`·워커 Dockerfile — 멀티스테이지 pnpm deploy 패턴 → `relay/Dockerfile`.
- 배포/smoke/setup-iam 스크립트 3종 세트 패턴(`scripts/*-{sync}.sh`) → `setup-relay-iam.sh`/`deploy-relay.sh`/`smoke-relay.sh`.
- shadcn `Card/Badge/Table/Skeleton/Dialog/Switch`, `stock-hero.tsx` 가격 표시, `--up/--down` 토큰.
- `packages/shared` — wss 메시지 타입·주문 DTO 를 server·webapp·relay 3자가 공유(relay 는 `@gh-radar/shared` 의존, Dockerfile 에 shared 빌드 포함).
- `stocks` 마스터 + master-sync KRX 기본정보 — `isin` 컬럼 추가만으로 코드↔ISIN 해결(D-28).
- `webapp/src/lib/chat-sse.ts` — raw fetch + getSession 토큰 패턴(wss 클라이언트 훅의 토큰 취득부 재사용).

### Established Patterns
- 서버는 서비스롤 Supabase 단일 클라 + `app.locals` DI; 사용자 인증은 `requireAuth` 를 라우트 단위로 적용.
- 신규 워크스페이스는 `pnpm-workspace.yaml` 등록 + 루트 `typecheck/build` 가 `-r` 로 자동 포함 → relay 도 `typecheck`·`test` 스크립트 필수.
- 워커 tsconfig 는 commonjs 지만 **relay 는 server 와 같은 ESM/NodeNext**(생성 코드 `.js` import 때문 — 워커 패턴을 따르지 말 것).
- 신규 인프라는 gcloud 스크립트 + smoke INV 검증 + Cloud Monitoring 알림 정책 YAML 을 한 세트로.
- 프론트 phase: HTML 목업(다크/라이트) → UI-SPEC → 구현, Playwright E2E, Vercel 배포 스크립트(`vercel pull → build → deploy --prebuilt`).
- 커밋: 한글 메시지, Co-Authored-By 금지, 보여준 범위 = 스테이징 범위.

### Integration Points
- `server/src/app.ts` 라우터 1곳(`/api/orders`) + `server/src/config.ts` env 2개 + `scripts/deploy-server.sh` env 주입.
- `webapp/src/components/stock/stock-detail-client.tsx` 섹션 마운트 + `webapp/src/lib/` 에 relay ws 클라이언트/훅 + env `NEXT_PUBLIC_RELAY_WS_URL`.
- `supabase/migrations/` — `stocks.isin`, `dma_credentials`, `dma_orders` 3건([BLOCKING] db push).
- `workers/master-sync` — `ISU_CD` → `stocks.isin` 저장 1줄급 변경 + 재배포 + 1회 실행(백필).
- GCP: 신규 고정 IP, 방화벽 3규칙, VM + SA(secretAccessor, artifactregistry.reader), Secret 3~4개(`gh-radar-dma-cred-key`, `gh-radar-relay-order-secret`, `gh-radar-kb-vpn-password`; anon key 는 공개값이라 env), Artifact Registry `relay` 이미지.
- 외부 좌표: 사용자 DNS(`dma.jx1.io` A 레코드), gh-trade users.toml(운영 절차), Vercel env.
- **인프라 실측(2026-09-05):** GCP `gh-radar` 에 VM 0대, `gh-radar-vpc` 방화벽 규칙 0개, Cloud DNS 미사용, 고정 IP `gh-radar-static-ip`(NAT 용) + serverless 예약 1개, Secret 8개, Cloud Run 서비스 `gh-radar-server` 1개(Direct VPC Egress).

</code_context>

<specifics>
## Specific Ideas

- 호가창은 **트레이더용 10단 호가 + 체결 테이프 + 주문 패널**(호가 가격 클릭 → 주문 가격 입력, 계좌 선택, 매수/매도, 취소는 미체결 행에서) — 세부는 목업에서 확정. 국내 관례 색상.
- 연결 상태 배지: `VPN 단절` / `DMA 로그인 중` / `준비` / `권한 없음` / `세션 거부(재로그인 중단)` 식으로 사용자가 지금 주문 가능한지 즉시 알 수 있게(gh-trade Session 라벨 정본 개념 이식).
- `ServerMessage` 는 토스트가 아니라 상태 영역에 최근 N개 누적(시세 끊김·브로커 다운 경보).
- VPN 선검증(D-03)은 사용자와 함께 진행하는 체크포인트: VM 에서 `openconnect` 1회 시도 → 결과(터널 IP, 동시 세션 여부, 출발지 IP 제한 여부)를 STATE/SUMMARY 에 기록. 실패 시 KB 문의로 전환.
- 비용 참고: VM(e2-micro+디스크+고정 IP) 월 $10~15, 사용자 방향 egress 월 $1~6. Cloud Run 변화 없음.

</specifics>

<deferred>
## Deferred Ideas

- **거래원(MemberStats 74/75) 팬아웃** — 스키마는 생성물에 포함되므로 후속 quick/phase 에서 추가 용이.
- **정정(M) 주문·IOC/FOK·시장가** — v1 은 신규+취소·보통만(D-21).
- **서버측 주문 금액·수량 한도** — 사용자가 v1 무한도 선택(D-20). 오주문 사고 시 재검토.
- **웹앱 자격증명 입력 UI**(`/settings/dma`) — v1 은 관리자 수기 등록(D-18).
- **공용 시세 세션(radar 전용 계정) + 사용자별 주문 세션** 2단 모델 — 시청 전용 사용자가 늘면 재검토(gh-trade users.toml 계좌 0건 기동 거부 예외 필요).
- **주문 REST 즉시 로그인**(세션 없을 때 lazy 로그인) — v1 은 409(D-15).
- **JWKS 로컬 JWT 검증**(jose) — Supabase 비대칭 키 전환 시.
- **Cloudflare Tunnel** — VM 공인 포트 0 구성이 필요해지면.
- **토큰 만료 시 wss 주기 재인증** — 재량 항목이나 v1 미채택 시 후속.
- **gh-trade `GetSymbolMasterReq(27)` 기반 NXT 거래가능 여부(`nxt_tradable`) 표시** — 거래소 토글 비활성화 근거로 유용, v1 은 KRX/NXT 단순 토글.

</deferred>

---

*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Context gathered: 2026-09-05*
