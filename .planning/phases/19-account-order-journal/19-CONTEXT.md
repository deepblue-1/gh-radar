# Phase 19: 계좌별 주문기록 전용 연결 - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

relay 가 gh-trade 게이트웨이에 **관찰자(읽기 전용) 기록 연결 1개**를 24시간 상시로 유지한다. 게이트웨이는 모든 DMA 사용자·계좌의 주문 통보(접수·체결·정정·취소·거부, 전략·수동, 게이트웨이 로컬 거부 포함)를 **seq·계좌·DMA 사용자**와 함께 기록 통보로 발행한다. 연결이 0인 세션의 통보도 발행한다. 게이트웨이는 당일분을 디스크에 보관하고, relay 가 끊겼다 다시 붙으면 since_seq 로 이어받는다. relay 는 이것을 Supabase **새 계좌 기준 테이블**에 단독으로 기록한다. 기록 결과는 My page 「오늘 주문」 카드(계좌별 묶음)에 계좌 권한 기준으로 표시하고, 실시간 푸시도 한다.

**배경:** debug `mobile-bg-resume-gaps` 1번(2026-09-24 확정). relay 사용자별 DMA 세션이 마지막 wss 가 끊기고 5분 뒤 닫히면, 게이트웨이는 연결 0 세션의 51 을 버린다(D-05). 그러면 부재 중 자동주문이 `dma_orders` 에 영구히 남지 않는다. 09-23 실측: 같은 DMA 계정을 쓰는 두 사용자의 자동주문 기록이 43건 vs 2건이었다.

**밖:**
- 사용자별 DMA 세션 모델(Phase 15 D-13)은 **바꾸지 않는다**. 이 세션은 시세·주문·전략 조작·계좌 상태(66/67)·토스트/전략 로그용 `{t:"order"}` 에 그대로 쓴다.
- 과거 날짜 주문 이력 화면은 만들지 않는다.
- 교보 게이트웨이(112) 관찰자는 이 phase 에 없다.
- 동결된 `dma_orders` 의 삭제도 이 phase 에 없다.

</domain>

<decisions>
## Implementation Decisions

### 기록 주체 단일화
- **D-01: 관찰자 연결이 유일한 기록자다.** 사용자 세션 경로는 DB 에 쓰지 않는다. 걷어내는 것은 `order-handler` 의 기록 부분이다: `insertRequest` requested 행, `settle`, `recordUnmatched`, `autoInsertRow`/`ensureRow`, `settleOriginal`, 전략 캐시로 계좌를 추정하는 로직. **남기는 것**은 수동 주문의 즉시 응답(`order.result`)을 rid 로 요청 탭에 돌려주는 경로다(중복 가드·5초 타임아웃·ISIN/수량/가격 상관은 메모리에서만 한다). — **Reversibility:** costly — relay 기록 경로와 테스트 다수가 걸리고, 되돌리면 이중 기록자 상관 규칙을 다시 설계해야 한다.
- **D-02: 게이트웨이 로컬 거부(브로커에 가기 전 거부, 주문번호 없음)도 기록 통보로 발행한다.** 수동 `BuildDirectOrderResp` 경로와 전략 자동주문의 사전 거부가 모두 해당한다. 이 행은 주문번호 대신 **seq 로 식별**한다.
- **D-03: 「오늘 주문」 카드의 실시간 원천은 관찰자 기록이다.** relay 가 기록한 행을 **그 계좌에 접근할 수 있는 연결 중 사용자**에게 새 wss 프레임으로 푸시한다. 카드는 REST 조회와 이 푸시 두 가지만 병합한다(한 원천). 세션 51 기반 `{t:"order"}` 는 토스트·전략 로그 표면 전용으로 남고, 카드 병합에서는 빠진다. 1826307 의 라이브↔복원 join 규칙은 새 원천에 맞게 다시 설계한다.
- **D-04: 기록 연결 끊김은 두 곳에 드러낸다.** (a) 카드에 「기록 지연 — 복구되면 채워집니다」 표식을 띄운다(B′ 목업 상태). (b) relay `/healthz` 에 기록 연결 상태·마지막 적용 seq·지연을 싣고, 장중(08:00~20:00 KST)에 일정 시간 넘게 끊기면 운영 알림을 보낸다.

### 저장 모델·화면 필터
- **D-05: 새 계좌 기준 테이블을 만들고 `dma_orders` 는 동결한다.** 새 테이블에는 `user_id` 가 없고 계좌·주문번호·seq 가 키다. `dma_orders`(434행)는 전환 시점부터 쓰기를 멈추고 과거 기록으로 둔다. 이관이나 복사는 하지 않는다. `GET /api/orders` 와 「오늘 주문」은 새 테이블만 읽는다. — **Reversibility:** one-way — 새 테이블 마이그레이션과 동결 이후, dma_orders 로 돌아가면 전환 이후의 데이터가 없다.
- **D-06: 행 가시성은 계좌로 가른다. 매핑 원천은 관찰자다.** 관찰자 로그인 응답(또는 직후 메시지)으로 게이트웨이가 users.toml 의 **DMA 사용자→계좌 전체 매핑**을 내려준다. relay 는 이 매핑을 DB 테이블로 동기화한다. users.toml 은 핫리로드가 없어 게이트웨이 재시작 = 관찰자 재로그인이므로, 로그인 시점 동기화로 충분하다. 사용자가 보는 행은 「내 `dma_credentials.dma_user_id` 에 매핑된 계좌」의 **모든 행**이다. 같은 계좌에 다른 DMA 사용자·WinForms 가 낸 주문도 포함한다.
- **D-07: 카드 = B′ 계좌별 묶음(채택 목업 `19-today-orders-mockup.html` 최상단 「B′ — 채택안」).** 계좌마다 소제목을 두고 목록을 반복한다(My page 계좌별 미체결·잔고와 같은 문법). 좁은 폭 카드 행 ↔ 넓은 폭 표 전환 규칙은 현행을 유지한다. 390px 에서 묶인 행의 둘째 줄이 줄바꿈되지 않아 주문번호가 잘리는 **기존 결함을 함께 고친다**(줄바꿈 허용). 목업에서 A·C 는 미채택이다.
- **D-08: 모든 행에 출처 칩(상따·VI·수동)을 붙이고, NXT 행에만 거래소 태그를 붙인다.** 출처 칩은 계좌 패널의 기존 출처 태그 스타일을 재사용하되, 원래 태그가 생략하는 「수동」도 표시한다. 주문번호가 없는 로컬 거부 행은 주문번호 자리에 「—」를 쓴다. 현행 「· 수동」 꼬리 표시는 없앤다. 주문자(DMA 사용자) 표시는 하지 않는다.

### 관찰자 자격·보안 경계
- **D-09: 관찰자 자격은 users.toml 과 분리된 `[observer]` 설정 + 전용 로그인 메시지로 둔다.** 게이트웨이의 관찰자 연결은 어떤 사용자 Session 에도 붙지 않는다. 주문·전략·시세·계좌 요청은 모두 거부한다(서버 측 강제). 로그인 실패는 거부 문구 하나로만 알리고, 사유는 게이트웨이 로그에만 남긴다(gh-trade 17 D-04 동형). 계좌 0건 기동 거부 규칙과 무관하다.
- **D-10: 인증은 비밀 하나로만 한다. 출발지 IP 제한은 두지 않는다**(사용자 결정). 9100 은 원래 VPN/WireGuard 로만 닿는다. 비밀은 gh-trade 쪽 운영 설정(users.toml 처럼 `deploy-config.sh` 경로)과 relay 쪽 Secret Manager 새 시크릿으로 공급한다. 로그·저장소에는 평문을 남기지 않는다.
- **D-11: 기록 범위는 게이트웨이 전 계좌다.** gh-radar 에 매핑되지 않은 DMA 사용자(WinForms 전용 등)의 통보도 Supabase 에 기록한다(사용자 결정). 보이는 범위는 D-06 으로 가른다. 나중에 매핑이 생기면 그날 앞선 주문도 바로 보인다.

### 보관·이어받기·운영 시간
- **D-12: 게이트웨이는 당일 기록 통보를 seq 와 함께 디스크에 보관한다.** 기존 `MMDD_order.bin` 곁이나 전용 파일에 둔다. 게이트웨이를 재시작해도 seq 가 이어지고, relay 는 `since_seq` 로 빈틈 없이 이어받는다. 결과적으로 재시작 직후 KB 주문 메타 소실(`termId=0`, 세션 미도달) 통보도 계좌 기준으로 기록된다. 최종 기록(정본)은 Supabase 다. 게이트웨이 파일은 relay 부재 구간을 넘기는 버퍼다. 게이트웨이가 Supabase 에 직접 쓰는 방안은 기각했다(120 내부망 출구·C++ HTTP·서비스롤 키 배치).
- **D-13: 관찰자 연결은 24시간 상시다.** relay 가 부팅하면 바로 붙고, 끊기면 상한이 있는 백오프로 계속 재접속한다. 비밀 거부(인증 실패)면 루프를 멈추고 healthz·알림으로 드러낸다(15 D-16 동형). 운영 알림은 장중 끊김에만 보낸다. 장 시간 판정 로직은 연결 유지에 쓰지 않는다.
- **D-14: 전환은 한 번에 한다**(그림자 병행 없음, 사용자 결정). 장 마감(20:00) 뒤 한 배포 창에서 DB → gh-trade 게이트웨이 → relay → 검증 → webapp push 순으로 올린다. 다음 거래일부터 카드는 새 테이블만 읽고 세션 기록은 꺼진다. 게이트웨이 재시작은 전략 무인 복원을 수반하므로 20:00 이후에만 한다. — **Reversibility:** costly — 전환 뒤 문제가 나면 롤백에 relay·webapp·gh-trade 재배포가 모두 필요하다. 그림자 기간이 없으므로 plan 에 첫 거래일 실장 대조(브로커 체결내역·게이트웨이 로그 vs 새 테이블) 체크포인트를 넣는다.

### Claude's Discretion
- **행 모델:** 주문 1건 = 1행(계좌+주문번호+KST 거래일 멱등 upsert, 연속 통보로 상태 전이)이 기본이다(ROADMAP 「계좌+주문번호 멱등 upsert」). 상태는 뒤로 가지 않는다(단조 join). 로컬 거부는 seq 키 행이다. 원시 통보 이벤트 로그 테이블을 따로 둘지는 재량이다.
- **seq:** 게이트웨이·거래일 범위에서 단조 증가하고 재시작 뒤에도 이어진다. 거래일 경계와 보관 기간 밖 `since_seq` 요청 처리(당일 전체 재생 등)는 재량이다. relay 는 마지막 적용 seq 를 **Supabase 에 커서로 저장**해 relay 재시작 뒤에도 이어받는다.
- **기록 통보 메시지:** 번호와 필드는 재량이다. 비어 있는 번호: 요청 5~9·15~19·39~49, 응답 79·80+. 12·13·22·23·62·63·30·31·70 은 재사용 금지다. Envelope 필드는 끝에만 추가한다. 최소 필드는 seq · 거래일 · DMA user · account_no · ISIN · side · order_no · org_order_no · notice_type · request_kind · requester · origin · exchange · board · price · qty · 체결 수량 · result_code · message · 게이트웨이 시각이다. 정정·취소 통보의 side 는 원주문 값으로 채울 수 있으면 채운다(현 51 은 C/M 에서 side 가 부정확).
- **테이블·컬럼 이름, 인덱스:** 재량이다. RLS 는 기존 `dma_*` 처럼 서비스롤 전용으로 두고, server 라우트가 가시성 필터를 적용한다. 또는 RPC 1회로 처리한다(Cloud Run 왕복 비용 메모).
- **기타:** 푸시 프레임 이름·형식, 백오프 수치, 장중 끊김 알림 임계, healthz 필드 이름, 게이트웨이 디스크 파일 보관 일수.
- **여러 게이트웨이:** relay 는 현재 `DMA_HOST` 하나(KB 120)에 붙는다. 관찰자도 게이트웨이당 1개로 설계하고, 행에 게이트웨이(브로커) 식별을 넣을지는 재량이다. 교보 확장을 막지 않는 형태로 한다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 근본 원인·배경
- `.planning/debug/resolved/mobile-bg-resume-gaps.md` — 1번 근본 원인 확정. 조사 1~4: 세션 수명, 게이트웨이 D-05 폐기, 로그 실측, 43 vs 2 차등 대조. 2~4 웹앱 수정(1826307)의 join 규칙.
- `.planning/debug/relay-ws-order-unmatched-notice.md` — 게이트웨이가 같은 DMA user 의 모든 연결(WinForms 포함)에 51 을 팬아웃하는 사실.
- `.planning/ROADMAP.md` §Phase 19 — 목표·범위 초안·쟁점.

### 이전 phase 결정
- `.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-CONTEXT.md`
  - D-13~D-16: 사용자별 세션·라이프사이클·재접속. D-17 철회: 공유 세션.
  - D-18·D-19: `dma_credentials`, 복호 주체 relay.
  - D-24: dma_orders.
  - D-27: 실서버 규율.
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-CONTEXT.md`
  - D-02·D-03: wss 주문·relay 가 dma_orders insert/update.
  - D-20·D-21: My page 계좌별 반복.
  - D-22: 앱 전역 wss.
- `.planning/phases/17-gh-trade-led/17-CONTEXT.md` D-08 — 주문통보 확장(`board`·`requestKind`·`requester`). `origin` 은 원주문 주체이고, message 문구는 파싱 금지.
- `.planning/phases/18-gh-trade-ui-nxt-vi/18-CONTEXT.md` — 정정(M) 통보·modified 상태·NXT/예약구간(G2/G3).

### UI 정본
- `.planning/phases/19-account-order-journal/19-today-orders-mockup.html` — **최상단 「B′ — 채택안」이 카드 구현 정본이다.** 0/A/B/C 는 검토용이다.
- `webapp/src/styles/globals.css` — 토큰. §2.2b 컨테이너 쿼리 규칙.

### relay (gh-radar)
- `relay/src/ws/order-handler.ts` — 현 기록 경로(`hub.on("order")` :473, `recordUnmatched` :733, `autoInsertRow` :996, `narrowPending` :1753). D-01 로 기록 부분을 걷어낸다.
- `relay/src/hub/subscription-hub.ts` `#onOrderNotice` :1197 — 세션 51 수신·감사 로그.
- `relay/src/dma/session-manager.ts`, `relay/src/dma/session.ts`, `relay/src/dma/dma-client.ts` — 세션·로그인·LivePing 30s·백오프. 관찰자 클라이언트의 재료다.
- `relay/src/store/orders.ts` — 현 OrderStore(flush·CAS).
- `relay/src/store/credentials.ts` — `dma_credentials` 조회.
- `relay/src/dma/envelope.ts` — `ParsedOrderResp` :1524.
- `relay/src/index.ts` — 부팅·종료 순서. :34 D-13 주석.
- `relay/src/config.ts` — `DMA_HOST`·`DMA_BROKER`·`SESSION_GRACE_MS`.
- `relay/src/ws/fanout.ts` — wss 인증·`#onFirstMessage` 스냅샷 재생·heartbeat. 새 푸시 프레임의 출구다.
- `relay/src/generated/` — flatc 생성물(sync marker gh-trade 6adcb62f).
- `packages/shared/src/relay.ts` — wss 프레임 계약(`RelayOrderMsg` 등).
- `docs/relay-operations.md` — 스키마 재동기화 규칙. `INBOUND_MSG_TYPES` 와 hub `case` 는 같은 커밋에서 바꾼다.
- `infra/relay/README.md`, `scripts/deploy-relay.sh` — radar-gw 배포·메모리 예산(e2-micro).

### DB·server·webapp
- `supabase/migrations/20260905120200_dma_orders.sql` 외 `*_dma_orders_*.sql` 6건 — 현 스키마(동결 대상).
- `supabase/migrations/20260905120100_dma_credentials.sql` — `dma_user_id` 는 UNIQUE 가 아니다(여러 사용자가 한 DMA user 를 공유).
- `server/src/services/dma-orders.ts` `listTodayOrders`, `server/src/routes/orders.ts` — `GET /api/orders`(새 테이블·계좌 필터로 교체).
- `webapp/src/components/trading/today-orders-card.tsx` — 현 카드. 헤더 주석 ①~⑤ 규율.
- `webapp/src/lib/orders-api.ts` — `fetchTodayOrders`·`mergeTodayOrders`·`orderDisplayStatus`(join).
- `webapp/src/components/trading/me-client.tsx` — My page 배치(맨 아래 블록).
- `webapp/src/components/orderbook/account-panel.tsx` — 출처 태그·거래소 태그 스타일, 계좌별 반복 문법.
- `webapp/src/lib/use-relay-socket.ts`, `webapp/src/lib/relay-provider.tsx` — wss 번역기(새 프레임 수신).

### gh-trade 게이트웨이 (별도 저장소 `../gh-trade`, 자체 GSD `.planning/` 소유 — 현재 Phase 22 교보 진행 중)
- `../gh-trade/server/src/net/Gateway.cpp`
  - `ProcessLoginReq` :856-1075: 인증·세션 합류·로그인 직후 송신.
  - `SendToSession` :1093-1112: D-05 폐기.
  - `BuildDirectOrderResp` :1872: 로컬 거부.
- `../gh-trade/server/src/app/Server.cpp`
  - `WireExecutionCallback` :150-401: 기록 통보 발행 지점 후보.
  - `BuildOrderRespEnvelope` :416.
  - `SendOrderRespToSession` :515.
  - `FindOrCreateSession` :3186.
  - `ForEachSession`.
- `../gh-trade/server/src/app/Server.h` — `FanoutToAccountSessions` :452.
- `../gh-trade/server/src/broker/IBroker.h` `ExecutionReport` :99-159 — accountNo·termId·origin 원천.
- `../gh-trade/server/src/trade/recorder/OrderRecorder.h` — 당일 `MMDD_order.bin` 기록기(디스크 버퍼 선례).
- `../gh-trade/server/src/util/Config.h`, `../gh-trade/server/config/users.toml.example`, `../gh-trade/server/config/server.toml` — 설정 구조(`[observer]` 추가 위치).
- `../gh-trade/server/src/protocol/StockDMA.fbs` — MsgType 할당표. Envelope 끝 append 규칙.
- `../gh-trade/server/scripts/sync-relay-schema.sh` — relay 생성물 동기화(gh-trade 소유, flatc 25.12.19 고정, `RELAY=` 지정). C# 쪽 `sync-client-schema.sh` 도 함께 돌린다.
- `../gh-trade/server/scripts/deploy.sh` — 게이트웨이 빌드·배포(GCE 빌드 VM → 120).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DmaClient`(relay): TCP 프레이밍, LivePing 30s(게이트웨이 유휴 90s 판정 회피), 지수 백오프 재접속. 관찰자 클라이언트가 그대로 얹을 수 있다.
- `OrderStore`(relay): 서비스롤 upsert·flush·`filled_qty` CAS 패턴을 새 테이블 기록기로 옮길 수 있다.
- `OrderRecorder`(gh-trade): 당일 롤오버·비동기 flush 스레드가 있는 디스크 기록기. seq 보관 파일의 선례다.
- `Server::ForEachSession`/`SnapshotSessions`, `FanoutToAccountSessions`(gh-trade): 전 세션·계좌 단위 순회. 매핑 스냅샷을 만들 때 쓴다.
- account-panel 의 출처·거래소 태그 컴포넌트는 D-08 칩에 재사용한다.
- 1826307 의 `orderDisplayStatus` join(진행 단계 격자)은 새 원천 병합에도 같은 원리를 적용한다.

### Established Patterns
- relay 가 Supabase 에 서비스롤로 기록하고, server 가 서비스롤로 읽어 user 필터를 건다. `dma_*` 테이블은 RLS 활성 + 정책 0개 + anon/authenticated REVOKE 다(메모리: RPC·RLS REVOKE 명시).
- 스키마 변경 흐름: gh-trade fbs 수정 → `sync-relay-schema.sh`(gh-trade 소유) → relay 생성물 커밋은 gh-radar 에서 따로 한다.
- 배포 규율: 장중 relay 재시작·배포 금지. relay 먼저 → 검증 → push(push = webapp 프로덕션 배포). 동시 세션 커밋 경합에 주의한다.
- 게이트웨이 재시작 시 세션·termId 는 메모리 소실, 전략은 무인 복원된다. KB OrderMetaTable 이 메모리 전용이라 재시작 뒤 통보가 `termId=0` 이다.

### Integration Points
- gh-trade: 기록 통보 발행은 `WireExecutionCallback`(브로커 통보)과 `BuildDirectOrderResp`·전략 사전 거부(로컬 거부)에서 한다. 관찰자 로그인은 `ProcessLoginReq` 와 별개 분기, `[observer]` 설정은 `Config.h` 에 둔다.
- relay: 부팅 시 관찰자 클라이언트를 기동한다(`index.ts`, SessionManager 와 독립). 종료 순서에 커서 flush 를 넣는다. `order-handler` 기록 경로를 제거하고, 새 기록기 → fanout 푸시(계좌 권한 사용자)로 잇는다.
- DB: 새 주문 테이블 + DMA user→계좌 매핑 테이블 + 커서 저장소 마이그레이션([BLOCKING] db push).
- server: `GET /api/orders` 를 새 테이블 + 계좌 가시성 필터로 교체한다(가능하면 RPC 1회).
- webapp: 카드 B′(계좌별 묶음·출처 칩·NXT·기록 지연 표식)와 새 푸시 프레임 수신.
- **교차 저장소:** gh-trade 변경은 gh-trade 저장소·자체 `.planning` 에서 계획·커밋·배포한다(현재 gh-trade Phase 22 진행 중이므로 충돌 여부를 확인). gh-radar plan 은 이것을 [BLOCKING] 의존 게이트로 둔다(15 D-25 선례).

</code_context>

<specifics>
## Specific Ideas

- 카드는 목업 B′ 를 그대로 따른다. 계좌 소제목 아래 행을 반복하고, 출처 칩은 모든 행에, NXT 태그는 NXT 행에만 붙인다. 로컬 거부 행의 주문번호는 「—」다. 「기록 지연 — 복구되면 채워집니다」 카드 표식도 B′ 대로다.
- 사용자 의도: 「최종 기록은 Supabase」. 게이트웨이 디스크는 relay 부재 구간을 넘기기 위한 버퍼일 뿐이다.
- 실측 기준: 같은 DMA 계정을 공유하는 두 gh-radar 사용자(95e9·b1e2)가 전환 뒤에는 같은 계좌의 같은 주문을 **동일하게** 봐야 한다. 09-23 43 vs 2 가 재현되지 않아야 한다.

</specifics>

<deferred>
## Deferred Ideas

- **관찰자 접속 출발지 IP/대역 제한:** 이번에는 비밀만 쓴다(D-10). 게이트웨이가 공용망에 노출되거나 비밀 유출 위험이 커지면 재검토한다.
- **동결된 `dma_orders` 삭제·정리**와 **과거 날짜 주문 이력 화면**(새 테이블 기반): 별도 phase 또는 quick 으로 한다.
- **교보 게이트웨이(112) 관찰자 연결:** relay 가 교보를 붙일 때 같은 설계로 확장한다.
- **「다른 단말」 주문자 칩**(목업 변형 C): 미채택. 같은 DMA 사용자 안에서 gh-radar 와 WinForms 를 구분하지 못한다는 한계가 있다.
- **그림자 병행 전환**(관찰자 기록을 먼저 쓰고 1~2일 대조한 뒤 카드 전환): 한 번에 전환하기로 해 기각했다. 대신 첫 거래일 실장 대조 체크포인트를 둔다(D-14).

</deferred>

---

*Phase: 19-account-order-journal*
*Context gathered: 2026-09-24*
