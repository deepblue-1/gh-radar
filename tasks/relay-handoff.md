# gh-radar 중계 서버(relay) 신설 — 새 세션 인계 프롬프트

> 아래 전체를 gh-radar 저장소(`/Users/alex/repos/gh-radar`)에서 여는 새 Claude Code 세션의 첫 메시지로 붙여 넣는다.
> gh-trade 세션(2026-09-05)에서 확정한 결정·실측 사실·gh-trade 쪽 준비물이 전부 들어 있다.

---

gh-radar 에 **DMA 중계 서버 `relay/` 워크스페이스**를 신설한다. gh-radar(GCP) 가 KB 증권 VPN 너머의 gh-trade-server(C++ DMA 서버, KB 데이터센터 10.41.1.120:9100) 에 TCP/FlatBuffers 로 붙어 **호가 10단 시세를 브라우저로 팬아웃하고 주문을 릴레이**하는 Node/TS 프로세스다. 이 저장소 규칙대로 GSD(`/gsd-quick`) 로 작업을 시작하고, 커밋 메시지는 한글, Co-Authored-By 는 넣지 않는다. 아래는 2026-09-05 gh-trade 세션에서 확정한 사실이므로 재검토하지 말고 그대로 따른다.

## 1. 확정된 구성

```
[브라우저 ≤5명] ──REST──▶ [Vercel 웹앱] ──REST──▶ [Cloud Run gh-radar server] ──▶ [Supabase]
     │                                                    │ 주문 요청 (VPC 커넥터, VM 내부 IP)
     │ wss (호가 10단 JSON, 업스트림 100ms 프레임 그대로)   ▼
     └────────────────────────────────────▶ [GCE VM radar-gw, asia-northeast3, e2-micro]
                                            ├ openconnect systemd (KB AnyConnect VPN, tun 10.41.1.124)
                                            └ relay 프로세스 (Docker): DMA 세션 1개 보유
                                                시세 참조계수 단일 구독 + wss 팬아웃 + 주문 내부 HTTP API
                                                     │ VPN
                                                     ▼
                                   [KB 10.41.1.120] gh-trade-server :9100 (4바이트 LE 길이 + FlatBuffer)
```

- **Cloud Run 에서 WebSocket 을 열지 않는다.** 연결이 살아 있는 동안 활성 요금(월 $40~60)이 붙는다. 시세 스트림은 VM 의 relay 가 브라우저에 직접 wss 로 준다. Cloud Run 은 인증·REST·주문 라우트만.
- **규모:** 사용자 5명 이내, 호가 10단 + 체결 테이프. 업스트림이 이미 100ms 코얼레싱이라 relay 는 추가 코얼레싱 없이 통과시킨다(체결 테이프만 200ms 배치). egress 는 월 $1~6 수준이라 비용 최적화는 하지 않는다. permessage-deflate 는 켠다.
- **KB 방향 구독은 사용자 수와 무관하게 종목당 1개**(참조 계수). 마지막 사용자가 떠나면 해제.
- **VPN 은 relay 코드와 무관하게 VM 호스트의 systemd 유닛.** 재시도는 백오프 + 실패 상한 + 알림. 반복 실패는 KB 계정 잠금이므로 무한 재시도 금지. 터널 IP 는 계정별 고정으로 보이고(3회 모두 10.41.1.124), tun 에는 MAC 이 없다.
- **KB 확인 대기 항목(실서버 연결 전 블로커, 코드 작업은 진행 가능):** kbs124 계정 동시 세션 허용 여부, 고정 IP 정책, VPN 출발지 공인 IP 제한 여부.

## 2. gh-trade 쪽에 준비된 것 (완료)

- **TS 생성 스크립트** `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh` (커밋 d83e11d).
  - `RELAY` 기본값이 `../../gh-radar/relay` (gh-trade/server 기준 → 이 저장소의 `relay/`). **`relay/` 디렉터리를 먼저 만들고** 스크립트를 실행하면 `relay/src/generated/` 에 `flatc --ts` 산출물 40개(`StockDMA.ts`, `stock-dma.ts`, `stock-dma/*.ts` 38개) 와 SYNC MARKER 7줄이 붙은 `StockDMA.fbs` 사본이 mirror 된다. 고아 `.ts` 는 삭제된다. 재실행은 멱등. `--check` 는 무변경 대조.
  - 실행 예: `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh` (어느 cwd 에서든 됨).
  - 생성물은 **손으로 고치지 않는다.** 이 저장소에 커밋한다(스크립트는 커밋하지 않음). 스키마 정본은 gh-trade 의 `server/src/protocol/StockDMA.fbs` 하나다.
  - flatc 는 25.12.19 로 고정. npm `flatbuffers` 는 25.x(현재 최신 25.9.23)를 고정 설치. TS 런타임엔 C# 같은 버전 상수 검사가 없어 25.x 끼리 호환된다.
  - 생성 코드의 import 는 `.js` 확장자다. 이 저장소 server 와 같은 ESM + `moduleResolution: NodeNext` 로 relay 의 tsconfig 를 잡으면 그대로 맞는다.
- 서버 코드 변경은 없다. 게이트웨이는 relay 를 그냥 클라이언트 하나로 본다.

## 3. 프로토콜 — TS 구현이 반드시 지켜야 할 것 (게이트웨이 코드 실측)

- **프레이밍:** `[uint32 LE 길이][FlatBuffer]`. 길이는 페이로드만(헤더 4바이트 제외). 루트 테이블은 `Envelope`, `msg_type` 필드(enum `MsgType`)로 분기하고 실제 페이로드는 Envelope 의 해당 슬롯 테이블에 있다. 스트림이라 프레임이 붙거나 잘려 오므로 수신 버퍼에서 길이만큼 잘라내는 루프가 필요하다.
- **Verifier 가 없다.** JS/TS FlatBuffers 런타임에는 C++/C# 의 buffer verifier 가 없다. 길이 상한(예: 4MB) 검사 + 접근자 호출을 try/catch 로 감싸고, 실패 시 **그 프레임만 버리고 경고 로그, 연결은 유지**한다.
- **LivePing(4) 을 30초마다 보낸다.** 게이트웨이는 클라이언트→서버 완성 패킷만 활동으로 세고 유휴 90초면 끊는다. 서버→클라 시세 푸시는 활동이 아니다.
- **수신을 멈추면 서버가 끊는다.** 연결당 송신 큐 1024프레임/4MB, 주문·계좌 등 Notice 급은 큐가 차면 연결 종료. 수신 경로에 이벤트 루프를 막는 동기 작업을 두지 않는다.
- `socket.setNoDelay(true)`. 서버도 TCP_NODELAY.
- **단일 문자 필드**(`side`, `market`, `order_condition`, `mode` 등)는 서버가 문자열 첫 글자만 읽는다. `"B"`/`"S"`, `"K"`/`"Q"` 같은 값은 변환 함수 한 곳에서만 만든다.
- **user_id 는 WinForms 클라이언트와 다른 값**(예: `radar`)으로 로그인한다. 전략 상태 복원·계좌 범위가 user_id 기준이라 섞이면 안 된다. 로그인 비밀번호는 서버가 검사하지 않는다. 9100 포트는 VPN·VPC 밖으로 절대 노출하지 않는다.
- **부팅 순서:** TCP 연결 → `LoginReq(1)` {user_id, password, broker:"KB"} → `LoginResp(50)` success 확인 → `UpdateAccountNoReq(3)` {mode:"1", account_no} 로 주문할 계좌 선언 → `UpdateAccountNoResp(55)` → Ready. 재접속 시 이 순서를 자동으로 다시 밟고 남아 있는 구독을 전부 재구독한다.
- **시세:** 창 열림 순서는 **`GetQuoteReq(28)` 스냅샷 → `SubscribeQuoteReq(29)` 구독**. 키는 `isin`(12자) + `exchange`("KRX"/"NXT"). 해제는 별도 메시지가 아니라 **`subscribe:false`**. 응답 `GetQuoteResp(58)` 과 푸시 `QuoteUpdate(59)` 는 둘 다 Envelope 의 `quote_state` 슬롯(`QuoteState` 테이블)이고 `is_snapshot` 으로 구분한다. `QuoteState` 에는 현재가·시고저·전일대비(`change_sign` 원문 1자가 부호의 정본)·등락률·누적거래량·거래대금·`ask_prices/ask_qtys/bid_prices/bid_qtys` 각 10단·총잔량·상하한가·기준가·VI 예상가·`exchange_time`("HHMMSSuuuuuu") 이 있다.
- **체결 테이프:** `GetTradeTapeReq(32)` {isin, exchange, count} → `TradeTapeResp(69)`, 푸시 `TradeTapePush(71)`. 둘 다 `trade_tape` 슬롯(`TradeTape` {entries:[TradeTapeEntry{trade_time, price, change_sign, change, qty, cum_volume}], is_snapshot}). 시세 구독에 편승하므로 별도 구독 메시지가 없다.
- **주문:** `DirectOrderReq(2)` {stock_code(ISIN 12자), account_no, side "B"/"S", price, quantity, order_condition "0"/"1"/"2", market "K"/"Q", exchange "KRX"/"NXT", order_type "N"/"M"/"C", org_order_no(정정·취소 시)}. 결과는 `OrderResp(51)` {order_no, result_code(0=성공), message, notice_type "A"접수/"E"체결/"C"취소확인/"M"정정확인/"R"거부, org_order_no, origin, exchange} 와 `TradeExecution(53)` {order_no, executed_price, executed_qty}. 수량·가격은 정수(원·주).
- **서버 메시지:** `ServerMessage(54)` {level, message, isin, account_no, source, kind}. 시세 끊김·브로커 다운 같은 경보가 온다. 브라우저 상태 표시에 그대로 흘린다.
- **기준 구현(읽어볼 것):** gh-trade 의 C# 클라이언트 `client/Services/DMA/Session.cs`(상태기계 Idle→Connecting→LoggingIn→DeclaringAccounts→Ready·재접속), `Client.cs`(프레이밍·핑·수신 스레드), `PacketCodec.cs`. 서버 측 명세는 gh-trade 루트 `CLAUDE.md` 의 「FlatBuffers 메시지」 표.

## 4. relay 프로세스 설계

Node 22 + TypeScript, pnpm 워크스페이스 `relay/`(`pnpm-workspace.yaml` 에 추가). 모듈 넷:

1. **DmaClient** — `net.Socket`, 프레이밍 코덱, 부팅 상태기계, 30초 핑, 백오프 재접속(+재로그인·계좌 재선언·재구독), `msg_type` 디스패치. 핫패스 없음, 로그는 Cloud Run server 와 같은 로거.
2. **SubscriptionHub** — `isin+exchange` 키 참조 계수. 첫 요청에 Get(28)+Subscribe(29), 마지막 해제에 `subscribe:false`. 스냅샷 캐시를 들고 있어 새 사용자에게 즉시 준다.
3. **WsFanout** — `ws` 서버(perMessageDeflate). 업그레이드 시 Supabase JWT(`jose`) 검증. 연결별 구독 집합. QuoteState → 압축 JSON(필드명 짧게), 체결 테이프 200ms 배치. 30초 ping 으로 죽은 연결 정리. VPN/DMA 세션 상태와 ServerMessage 를 상태 프레임으로 내린다. 브라우저 재접속 시 스냅샷부터 다시.
4. **OrderApi** — Express, VPC 내부 포트만 수신, 공유 비밀 헤더. `DirectOrderReq` 송신 후 `OrderResp`/`TradeExecution` 을 요청자에게 되돌린다(요청 상관은 stock_code+account+시각 또는 order_no). 요청·응답을 파일 로그로 남긴다. 확인 대화상자는 웹앱 몫이고 relay 는 판단하지 않는다.

배포: `server/Dockerfile` 을 본뜬 `relay/Dockerfile`, `scripts/deploy-relay.sh`(Artifact Registry push → VM 에서 pull·`docker run --restart=always`). VM 은 IAP 터널로 접근.

## 5. 작업 순서 (quick 태스크 단위 제안)

1. `relay/` 워크스페이스 뼈대(package.json, tsconfig NodeNext, `flatbuffers` 25.x 고정) + gh-trade 스크립트로 생성물 받기 + 커밋.
2. 프레이밍 코덱 + DmaClient(로그인·계좌 선언·핑·재접속) + 단위 테스트(vitest, 가짜 서버 소켓).
3. SubscriptionHub + WsFanout + JWT. 웹앱 호가 컴포넌트를 wss 에 붙여 로컬 왕복.
4. OrderApi + Cloud Run 주문 라우트(`--vpc-connector` 경유 VM 내부 IP).
5. Dockerfile·deploy-relay.sh·VM 프로비저닝 문서(Debian 12 e2-micro, 외부 고정 IP, 방화벽 443 만, openconnect systemd 유닛, Caddy Let's Encrypt). openconnect 옵션은 Mac 의 `/usr/local/sbin/kbvpn-connect` 와 동일(`--protocol=anyconnect --authgroup=KBSEC_DMA --servercert pin-sha256:… --passwd-on-stdin`, 서버 `https://211.47.35.211:65535`). 비밀번호는 Secret Manager 에서 읽고 문서·로그·커밋에 값을 적지 않는다.
6. KB 확인 3건 완료 후 실서버 연결·실시세 재검증.

## 6. 로컬 개발 환경 (VPN 불필요)

- gh-trade-server 를 Mac 에서 mock 브로커로 띄운다: `cd /Users/alex/repos/gh-trade/server && ./scripts/build.sh && ./scripts/run-mac.sh` (설정 `config/server.toml`, 포트 9100, `[broker] name="mock"`). 다른 개발 서버가 9100/시세 포트를 이미 잡고 있으면 UAT 사본 toml 로 포트를 옮긴다.
- 가짜 호가는 `server/scripts/uat/inject_b6.py`(기본 dry-run, `--send` 로 전송, TTL 0 루프백)로 넣는다. 이걸로 구독·팬아웃·재접속·프레임 드롭을 전부 재현할 수 있다.
- mock 브로커는 가격 0 주문에 거부를 돌려주므로 OrderApi 의 거부 경로도 확인된다.
- 실계좌·실서버(10.41.1.120)에는 KB 확인과 사용자 지시 전에 붙지 않는다.

## 7. 비용 참고

VM(e2-micro+디스크+고정 IP) 월 $12~15, 사용자 방향 egress 월 $1~6(5명·5종목·10Hz 기준, 압축 전). KB→VM 수신은 무료. Cloud Run 은 시세를 거치지 않으므로 변화 없음.
