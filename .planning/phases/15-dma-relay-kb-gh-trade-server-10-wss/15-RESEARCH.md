# Phase 15: DMA 중계 서버(relay) — KB gh-trade-server 호가 10단 시세 wss 팬아웃 + 주문 릴레이 - Research

**Researched:** 2026-09-05
**Domain:** TCP/FlatBuffers 게이트웨이 클라이언트(Node) · WebSocket 팬아웃 · GCE VM + AnyConnect VPN 인프라 · Cloud Run→VPC 주문 릴레이
**Confidence:** HIGH (프로토콜·생성코드·GCP 실측은 도구로 직접 검증 / MEDIUM: VPN 라우팅·VM 메모리 예산)

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

> 15-CONTEXT.md `<decisions>` 전문을 정본으로 따른다. 아래는 리서치가 직접 제약받는 항목의 축약이며,
> **충돌 시 CONTEXT.md 원문이 우선**한다.

**범위·분할**
- **D-01:** 시세 팬아웃 + 주문 릴레이를 한 phase(15)에 포함. plan 은 wave 로 나누되 계좌·주문 wave 는 D-25 의존 게이트 뒤.
- **D-02:** 웹앱 `/stocks/[code]` 에 호가창 섹션 포함 — 호가 10단 + 체결 테이프 + 연결/세션 상태 + 주문 패널 + 잔고·미체결. HTML 목업 → UI-SPEC → 구현.
- **D-03:** VM 프로비저닝·openconnect·Caddy·relay 배포까지 이 phase. kbs124 계정으로 VM 에서 VPN 연결·출발지 IP 제한·동시 세션 선검증(초기 wave, [BLOCKING] 체크포인트). 시도 ≤3회, 실패 시 자동 재시도 없이 중단.
- **D-04:** 호가 10단 + 체결 테이프, KRX+NXT. 거래원(MemberStats) 제외.

**배포 토폴로지**
- **D-05:** 브라우저 시세 wss 는 VM 직접 + Caddy(Let's Encrypt). Cloud Run 에서 WebSocket 을 열지 않는다.
- **D-06:** 호스트명 `dma.jx1.io`. 웹앱 env `NEXT_PUBLIC_RELAY_WS_URL=wss://dma.jx1.io/ws`.
- **D-07:** VM = e2-micro, Debian 12, asia-northeast3, 기존 `gh-radar-vpc`/`gh-radar-subnet-an3`(10.10.0.0/26) 안, 신규 외부 고정 IP. relay 는 Docker(`--restart=always`), openconnect 는 host systemd, Caddy 는 재량. swap 1GB.
- **D-08:** 주문 경로 = 브라우저 → Cloud Run REST → Direct VPC Egress → VM 내부 IP:내부포트 HTTP → relay OrderApi. 내부 포트는 서브넷 출발지만 + 공유 비밀 헤더. 9100·내부포트 공인망 노출 금지.
- **D-09:** VM 접근은 IAP 터널 SSH(22 는 35.235.240.0/20 만). 공인 인바운드는 443 만. 방화벽 3규칙 신설.

**인증·접속 권한**
- **D-10:** relay 의 Supabase 토큰 검증 = `supabase.auth.getUser(token)` 네트워크 검증(jose 미사용).
- **D-11:** 토큰 전달 = 업그레이드 후 첫 메시지 `{t:"auth", token}`. 5초 내 미인증 시 close(4401). 인증 전 구독·주문 메시지는 close. URL·Caddy 로그에 토큰 미기록.
- **D-12:** 시세·주문 모두 allowlist — allowlist = `dma_credentials` 매핑 행 존재. 매핑 없으면 `unauthorized` 상태 프레임 + "권한 없음". 서버 주문 라우트도 같은 기준 403.

**세션 모델**
- **D-13:** gh-radar 사용자별 DMA 세션 1개(Idle→Connecting→LoggingIn→DeclaringAccounts→Ready). 구독 참조계수는 세션(사용자) 단위.
- **D-14:** `LoginReq(1)` → `LoginResp(50)` success + `accounts` → 모든 계좌를 `UpdateAccountNoReq(3)` mode "1" 선언 → `UpdateAccountNoResp(55)` 대조 → Ready. mode "2" 조회 왕복 없음. 계좌 0건이면 세션 실패.
- **D-15:** wss 첫 인증 연결 시 로그인, 모든 wss 종료 후 5분 유예 뒤 TCP 종료. 주문 REST 는 Ready 세션 없으면 409 `SESSION_NOT_READY`.
- **D-16:** 재접속 = 백오프 + 재로그인 + 계좌 재선언 + 전 구독 재구독. 서버가 재로그인 거부하면 루프 중단. **무한 재시도 금지.**
- **D-17:** gh-radar 매핑용 DMA `user_id` 는 WinForms 클라이언트와 다른 값. users.toml 편집은 gh-trade 운영 절차, 값은 이 저장소에 미기록.

**자격증명**
- **D-18:** Supabase `dma_credentials`(user_id PK → auth.users, dma_user_id, dma_password_enc, created_at/updated_at). RLS 활성 + 정책 0개(서비스롤만). AES-256-GCM, 키는 Secret Manager `gh-radar-dma-cred-key`. 등록은 관리자 수기 스크립트. 웹앱 입력 UI 없음.
- **D-19:** 복호·조회 주체 = relay(VM). 기동 시 Secret Manager 에서 `SUPABASE_SERVICE_ROLE_KEY`·`DMA_CRED_KEY`·`RELAY_ORDER_SECRET`·`SUPABASE_URL` 수령. 평문 비밀번호는 세션 메모리에만(pino redact). Cloud Run server 는 AES 키를 갖지 않는다.

**주문**
- **D-20:** 서버측 금액·수량 한도 없음. 형식 검사만(ISIN 12자, 수량>0 정수, 가격>0 정수, exchange ∈ KRX/NXT, side ∈ B/S, account_no ∈ 그 사용자 세션 계좌 목록).
- **D-21:** 신규 매수/매도("N") + 취소("C", `org_order_no` 필수, 취소수량 = 미체결 잔량, 0 은 즉시 거부), `order_condition` "0" 고정. 시장가·정정 없음. `market` "K"/"Q" 는 `stocks.market` 으로 서버가 채움. 단일 문자 변환은 한 함수에서만.
- **D-22:** `POST /api/orders` 는 첫 `OrderResp(51)`(A 또는 R)까지 최대 5초 대기 후 응답. 이후 "E"/"C" 는 주문자 wss 로 푸시. 상관키는 `order_no`(접수 전 거부는 stock_code+account_no+요청시각).
- **D-23:** 세션 Ready 후 `GetAccountStateReq(25)`{account_no:""} → `GetAccountStateResp(66)` + `AccountStateDelta(67)` 를 wss 로. 미체결 행의 order_no 가 취소의 `org_order_no`.
- **D-24:** `dma_orders`(server 가 요청·접수 insert, relay 가 체결·취소확인 update) + relay pino 로그. 새로고침 후 오늘 주문 목록 복원.

**gh-trade 의존·병행**
- **D-25:** gh-trade Phase 17 과 병행. 초반 wave 는 현행 스키마(mock 무인증, accounts 빈 벡터)로. **계좌 선언·계좌 상태·주문 wave 는 17 완료 후 `sync-relay-schema.sh` 재실행이 선행 조건 — plan 에 [BLOCKING] 게이트 명시.**
- **D-26:** 생성물은 gh-trade 스크립트가 만들고 gh-radar 에 커밋, 손으로 고치지 않는다. flatc 25.12.19 / npm `flatbuffers` 25.x 고정. relay tsconfig 는 server 와 같은 ESM + `NodeNext`.
- **D-27:** 실서버(10.41.1.120) 접속·실계좌 주문은 D-03 통과 + gh-trade 17 배포 후 **사용자 지시가 있을 때만**. 그 전 검증은 mock 브로커 + `inject_b6.py`.
- **D-28:** ISIN 매핑은 gh-radar `stocks` 마스터. `stocks.isin` 컬럼 추가 + master-sync 저장. 단축코드→ISIN 산술 유도 금지. `GetSymbolMasterReq(27)` 미사용.

**프로토콜 준수 (D-30~D-38)** — 프레이밍/Verifier 부재/30초 LivePing/NoDelay/시세 28→29/체결 32→69·71/change_sign·exchange_time/bigint→Number/100ms 통과·200ms 배치·permessage-deflate ON/`ServerMessage` 상태 프레임/재접속 스냅샷/C# 기준 구현. 원문 참조.

**로컬 개발 (D-40, D-41)** — VPN 없이 mock gh-trade-server(:9100) + `inject_b6.py --send`. vitest + 가짜 서버 소켓. `dev.sh`(webapp :3100, server :8080) + relay 로컬(:8090 ws / :8091 내부 HTTP).

### Claude's Discretion

- wss 메시지 스키마(압축 JSON 필드명, 상태 프레임 종류, 구독 프로토콜 `{t:"sub", isin, ex}` 류), TradeTape 배치 형식, `@gh-radar/shared` 계약 타입 공유 여부(권장: `packages/shared/src/relay.ts`).
- 토큰 만료 처리(1h access token): 연결 시 1회 검증 유지 vs 주기 재인증.
- 재접속 백오프 수치·상한, 세션 유예 시간(5분 기본), 스냅샷 캐시 TTL, ws 30초 ping.
- 장애·알림 UX: 상태 배지, openconnect systemd 재시도 상한·백오프·Cloud Monitoring 알림 정책 — **무한 재시도 금지** 원칙만 고정.
- relay 모듈 구조(DmaClient/SubscriptionHub/WsFanout/OrderApi), 로거(pino + GCP config), 헬스 엔드포인트.
- `dma_orders`·`dma_credentials` 정확 스키마, 오늘 주문 목록 조회 라우트, 체결 통보 반영 방식.
- AES 구현 세부(nonce·AAD=user_id), 관리자 등록 스크립트 형태.
- VM 프로비저닝 세부: Caddyfile, docker 로그 로테이션, swap, unattended-upgrades, openconnect 유닛 옵션, VM SA·Secret 접근 IAM.
- 호가창 UI 세부는 목업 → UI-SPEC. 국내 색상 관례(`--up` 빨강 / `--down` 파랑).
- Cloud Run server 의 relay 내부 URL 설정·타임아웃·`deploy-server.sh` env 추가.

### Deferred Ideas (OUT OF SCOPE)

- 거래원(MemberStats 74/75) 팬아웃
- 정정(M) 주문·IOC/FOK·시장가
- 서버측 주문 금액·수량 한도
- 웹앱 자격증명 입력 UI(`/settings/dma`)
- 공용 시세 세션(radar 전용 계정) + 사용자별 주문 세션 2단 모델
- 주문 REST 즉시 로그인(lazy 로그인)
- JWKS 로컬 JWT 검증(jose)
- Cloudflare Tunnel
- 토큰 만료 시 wss 주기 재인증
- `GetSymbolMasterReq(27)` 기반 `nxt_tradable` 표시

---

## Project Constraints (from CLAUDE.md)

| 지시 | 본 phase 적용 |
|------|----------------|
| 커밋 메시지 한글, 사용자 확인 후 진행, Co-Authored-By 금지 | relay 생성물·마이그레이션 커밋 모두 해당 |
| HEAD↔worktree 전체 차이를 한 번에 커밋 + push | 대형 생성물 커밋(40 파일)도 같은 규율 |
| GSD 워크플로 밖 직접 편집 금지 | plan/execute 경유 |
| 크롤링 5원칙(일 1~2회 배치, 24h 캐싱, on-demand fetch 금지 …) | **본 phase 는 외부 웹 크롤링 없음 — 비적용.** 단 "사용자 수에 비례하는 외부 호출 금지" 사상은 KB 게이트웨이 구독에도 유효(D-13 참조계수) |
| 병렬 Wave 는 worktree 분리 | `parallelization: false` 이므로 순차 |
| Supabase 신규 테이블 RLS role 명시 | 비공개 테이블은 정책 0개 + **REVOKE 명시**(§Security) |
| lightweight-charts oklch 금지 | 호가창이 차트 색 재사용 시 hex 변환 필요(`--up`/`--down` 은 oklch) |
| Vercel env paste trailing newline 검증 | `NEXT_PUBLIC_RELAY_WS_URL` |
| 무로그 fail-safe 금지 | DMA/ws 예외 경로 전부 로깅 |
| 프로젝트 스킬 | `.claude/skills/` 없음 — 해당 없음 |

---

## Phase Requirements

**신규 등록 대상 (plan 단계에서 REQUIREMENTS.md 갱신).** Phase 11~14 선례 형식을 그대로 따른다.

### REQUIREMENTS.md 삽입 문안 (초안)

`### Chat`(85행) 다음에 새 섹션을 추가한다.

```markdown
### DMA Relay

- [ ] **RELAY-01**: KB gh-trade-server(C++ DMA 게이트웨이) 에 gh-radar **사용자별 DMA 세션**으로 붙어 호가 10단(`QuoteState`)·체결 테이프(`TradeTape`, KRX/NXT)·계좌 상태(`AccountState` 스냅샷+델타)·`ServerMessage` 를 브라우저에 `wss://dma.jx1.io` 로 직접 팬아웃 — GCE VM `radar-gw` 의 `relay/` 워크스페이스(Node 22 + TS, FlatBuffers `[uint32 LE 길이][Envelope]` 프레이밍, 30초 LivePing, 백오프 재접속·재구독), 업그레이드 후 첫 메시지 `{t:"auth"}` Supabase 토큰 검증 + `dma_credentials` allowlist, 종목당 세션 단위 참조계수 구독(`GetQuoteReq(28)`→`SubscribeQuoteReq(29)`), 웹앱 `/stocks/[code]` 호가창 섹션(호가·체결·잔고·미체결·연결 상태 배지) — Phase 15
- [ ] **RELAY-02**: 지정가 보통 신규 매수/매도 + 취소 주문 릴레이 — 브라우저 → Cloud Run `POST /api/orders`(requireAuth + allowlist + 형식 검사, 금액·수량 한도 없음) → Direct VPC Egress → VM relay 내부 HTTP(공유 비밀 헤더) → `DirectOrderReq(2)`, 첫 `OrderResp(51)`(접수 "A"/거부 "R") ≤5초 응답, 체결("E")·취소확인("C")은 주문자 wss 푸시, `dma_orders` 기록 + 오늘 주문 목록 복원, `stocks.isin` 코드↔ISIN 매핑, 활성 세션 없으면 409 — Phase 15
- [ ] **RELAY-03**: DMA 중계 인프라 — GCE VM `radar-gw`(e2-micro, Debian 12, asia-northeast3, 신규 외부 고정 IP, 방화벽 3규칙: 443 공개 / 22 IAP 35.235.240.0/20 / relay 내부포트 10.10.0.0/26), KB AnyConnect VPN openconnect host systemd 유닛(재시도 상한·백오프, 비밀번호는 Secret Manager stdin, 값 미기록), Caddy TLS(`dma.jx1.io`), `relay/Dockerfile` + `setup-relay-iam.sh`/`deploy-relay.sh`/`smoke-relay.sh` + Cloud Monitoring 알림 정책, kbs124 VPN 선검증(연결·출발지 IP 제한·동시 세션) 기록 — Phase 15
```

### Traceability 행 (115행 표 말미에 추가)

```markdown
| RELAY-01 | Phase 15 | Pending |
| RELAY-02 | Phase 15 | Pending |
| RELAY-03 | Phase 15 | Pending |
```

### Coverage 문장 갱신 (158행)

기존 `… CHAT-01 added 2026-07-02 with Phase 14(AI 애널리스트 챗봇) → 36→37)` 뒤에 이어붙인다:

```
; RELAY-01·RELAY-02·RELAY-03 added 2026-09-05 with Phase 15(DMA 중계 서버) → 37→40)
```

그리고 `- v1 requirements: 37 total` → `40 total`, `- Mapped to phases: 37` → `40`.

### 리서치 ↔ 요구사항 매핑

| ID | Description | Research Support |
|----|-------------|------------------|
| RELAY-01 | 시세·계좌 팬아웃 | §Standard Stack(ws/flatbuffers), §Pattern 1~5(프레이밍·세션기계·SubscriptionHub·WsFanout), §Code Examples 1~4, §Pitfall 1~6 |
| RELAY-02 | 주문 릴레이 | §Pattern 6(OrderApi 상관), §Pattern 9(Cloud Run→VPC), §Code Examples 5, §Pitfall 7·9, §Security(V5) |
| RELAY-03 | VM·VPN 인프라 | §Pattern 7~8(VM·openconnect·Caddy), §Environment Availability, §Pitfall 10~14, §Validation Architecture INV |

---

## Summary

이 phase 는 **세 개의 독립적인 기술 축**이 한 phase 안에 들어 있다. ① gh-trade C# 클라이언트의 TCP/FlatBuffers 세션 규율을 Node/TS 로 이식하는 프로토콜 축, ② `ws` 서버로 브라우저에 팬아웃하는 실시간 전달 축, ③ GCE VM + AnyConnect VPN + Caddy 라는 gh-radar 최초의 IaaS 인프라 축이다. 세 축의 리스크 성격이 완전히 달라 wave 분리가 필수다 — 프로토콜 축은 mock 서버로 완전 검증 가능하고, 인프라 축은 KB 계정·DNS·실서버라는 외부 좌표에 묶여 있으며, 그 사이에 gh-trade Phase 17 이라는 **외부 저장소 의존**이 끼어 있다.

**리서치가 밝힌 가장 중요한 사실:** gh-trade 정본 스키마(`StockDMA.fbs`, 커밋 `14bd025`)에 **`AccountEntry` 테이블도 `LoginResp.accounts` 필드도 아직 없다**. gh-trade Phase 17 은 CONTEXT·RESEARCH·PLAN 까지만 작성된 상태(8플랜 계획 커밋)이고 스키마 변경은 미반영이다. 따라서 D-14/D-23 의 계좌 선언·계좌 상태 wave 는 **가정이 아니라 실측으로 확인된 blocking 의존**이다. 초반 wave 는 `LoginResp{success, message}` 만 있는 현행 스키마로 진행해야 하며, `sync-relay-schema.sh` 재실행 전에는 accounts 관련 코드를 아예 작성할 수 없다(생성 코드에 접근자가 없다).

두 번째로 중요한 것은 **JS/TS FlatBuffers 런타임의 안전성 공백**이다. 핸드오프가 "Verifier 가 없다"고 적은 것은 맞지만, 실제로 검증해 보니 그보다 나쁘다 — 잘린 페이로드는 예외를 던지지 않고 **조용히 깨진 값을 반환한다**(`userId()` 가 `"al"` 로 잘려 나옴). 즉 `try/catch` 만으로는 방어가 안 되고, C# `Client.cs` 의 `TakeCount` 에 해당하는 **필드 단위 상한·형식 가드**를 TS 에도 반드시 이식해야 한다. 또 프레임 상한은 핸드오프의 4MB 가 아니라 **1MB** 가 맞다(서버 `kMaxRecvBufSize = 1MB`, C# `MAX_FRAME_SIZE = 1MB`; 4MB 는 서버 *송신 큐* 바이트 상한이다).

세 번째는 인프라의 실측이다. `gh-radar-vpc` 에는 방화벽 규칙이 **0개**이고(gcloud 에 보이는 4개는 전부 `default` 네트워크), VM 도 0대다. 즉 인그레스는 전부 기본 거부 상태이며 443/IAP-22/내부포트 3규칙을 새로 만들어야 IAP SSH 조차 불가능하다. Cloud Run 의 Direct VPC Egress 는 서브넷 `gh-radar-subnet-an3`(10.10.0.0/26) 안에 `serverless-ipv4-…` /28(10.10.0.16/28)을 이미 예약해 두었고, **Cloud Run 워크로드에는 네트워크 태그를 붙일 수 없으므로** 내부 포트 방화벽은 반드시 **source-ranges(서브넷 CIDR)** 로 써야 한다.

**Primary recommendation:** `relay/` 를 server 와 동일한 ESM/NodeNext·pino·Dockerfile 규약으로 세우고, DmaClient 는 C# `Session.cs`/`Client.cs` 의 **transport generation + 5초 응답 타임아웃 + 필드 상한 가드**를 1:1 이식하되 프레임 상한만 1MB 로 맞춘다. 인프라는 "VPN 선검증 → VM/방화벽 → Caddy/DNS → relay 배포" 순서로 각각 독립 검증 가능한 INV 를 붙여 wave 화하고, 계좌·주문은 gh-trade 17 재동기화 게이트 뒤에 둔다.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DMA TCP 세션·프레이밍·로그인·핑·재접속 | **VM relay (Node)** | — | VPN 안쪽에서만 10.41.1.120:9100 도달 가능. Cloud Run 은 stateless·요청기반이라 장기 TCP 세션을 소유할 수 없다 |
| 종목 구독 참조계수 + 스냅샷 캐시 | **VM relay** | — | 세션 소유자가 곧 구독 소유자(D-13). 캐시가 세션 메모리에 있어야 브라우저 재접속에 즉시 응답 |
| 브라우저 실시간 푸시(wss) | **VM relay + Caddy** | — | Cloud Run WebSocket 은 연결 유지 중 vCPU 활성 과금(D-05). Caddy 는 TLS 종단만 |
| 사용자 인증(JWT 검증) | **Cloud Run server**(REST) / **VM relay**(wss) | Supabase Auth | 두 진입점이 각자 `supabase.auth.getUser` — 동일 미들웨어 로직 2벌이 아니라 **공유 함수 1벌**을 각 런타임이 호출 |
| allowlist 판정(`dma_credentials` 존재) | **VM relay**(wss) / **Cloud Run server**(주문) | Supabase(service_role) | 두 곳 모두 같은 기준. server 는 존재 여부만, relay 는 복호까지 |
| 자격증명 복호(AES-GCM) | **VM relay 전용** | Secret Manager | Cloud Run 은 AES 키를 갖지 않는다(D-19) — 키 노출면 최소화 |
| 주문 접수(형식 검사·감사 기록) | **Cloud Run server** | Supabase `dma_orders` | 기존 `requireAuth`·에러 envelope·rate-limit 재사용. 브라우저→VM 직결을 만들지 않아 공인 노출면이 443/wss 하나로 유지 |
| 주문 게이트웨이 송신·결과 상관 | **VM relay** | — | `DirectOrderReq` 는 DMA 세션 위에서만 나간다 |
| 코드↔ISIN 매핑 | **Supabase `stocks`** (server 가 조회) | master-sync 워커 | D-28. 게이트웨이 `GetSymbolMasterReq(27)` 미사용 |
| 호가창 렌더링·주문 확인 다이얼로그 | **Browser (Next.js client)** | — | relay 는 판단하지 않는다(D-20) |
| VPN 터널 유지 | **VM host systemd** | — | relay 코드와 무관(D-07). 컨테이너 재시작이 터널을 흔들면 안 된다 |
| TLS 인증서 발급·갱신 | **Caddy (VM host)** | Let's Encrypt | 자동. relay 는 평문 HTTP 로만 listen |

**미배정 경고:** "VPN 이 끊겼다"는 사실을 브라우저에 알리는 책임은 relay(상태 프레임)와 Cloud Monitoring(알림 정책) 둘 다 갖는다. relay 는 *사용자 UX*, 모니터링은 *운영자 통지* — 서로 대체재가 아니므로 plan 에서 둘 다 태스크로 남겨야 한다.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ws` | **8.21.3** (2026-08-07) | relay 의 WebSocket 서버 | Node 생태계 사실상 표준(주당 2.7억 다운로드). `noServer`+`handleUpgrade` 로 HTTP 서버와 포트 공유, `perMessageDeflate` 내장. [VERIFIED: npm registry — `npm view ws version`] |
| `flatbuffers` | **25.9.23** (2025-09-24) | 생성 코드의 런타임(`Builder`/`ByteBuffer`) | flatc 25.12.19 산출물이 `import * as flatbuffers from 'flatbuffers'` 로 참조. D-26 이 25.x 고정. [VERIFIED: npm registry + 로컬 roundtrip 실행] |
| `@supabase/supabase-js` | `^2.103.0` (server 와 동일) | `auth.getUser` 토큰 검증 + service_role DB 접근 | D-10/D-19. server 가 이미 쓰는 버전을 그대로. [VERIFIED: 코드베이스 `server/package.json`] |
| `pino` + `pino-http` | `^10.3.1` / `^11.0.0` | 구조화 로그 | server 동형. redact 로 비밀번호·토큰 차단 |
| `@google-cloud/pino-logging-gcp-config` | `^1.3.3` | Cloud Logging 포맷 | server `src/logger.ts` 그대로 이식 |
| `express` | `^5.2.1` | 내부 HTTP(OrderApi + `/healthz`) | server 동형. 라우터 2~3개뿐이라 `node:http` 로도 되지만 에러 핸들러·json 파서 재사용이 낫다 |
| `zod` | `^4.0.0` | 내부 HTTP 바디 + wss 메시지 스키마 검증 | server 동형. wss 는 **신뢰 경계**이므로 필수 |
| Node.js | **22.x** (로컬 22.22.0) | 런타임 | 루트 `engines.node >= 22`. `node:crypto` AES-GCM·`node:net` 사용 |
| TypeScript | `^5.x` | 언어 | server tsconfig(ESM + NodeNext) 그대로 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/ws` | 8.18.1 | ws 타입 | devDependency |
| `vitest` | `^4.1.4` | 단위 테스트 | server 와 동일 버전 — 가짜 서버 소켓(`node:net`) 테스트 |
| `tsx` | `^4.21.0` | 로컬 dev/스크립트 | `relay` dev + `scripts/dma-credentials.ts` |
| `dotenv` | `^16.4.0` | 로컬 env | dev 전용 |
| Caddy | **2.x** (Debian apt, Cloudsmith repo) | TLS 종단 + wss 리버스 프록시 | v2 는 WebSocket 자동 통과(설정 0줄) [CITED: caddyserver.com/docs/v2-upgrade] |
| openconnect | **9.01-3** (Debian 12 bookworm) | AnyConnect VPN | apt 표준 패키지 [CITED: packages.debian.org/bookworm/openconnect] |
| `vpn-slice` | 0.16.1 (PyPI) | split-tunnel vpnc-script 대체 | **Debian 저장소에 없음** — pipx/venv 설치 필요. 대안은 `CISCO_SPLIT_INC` env 주입(§Pattern 8) |
| bufferutil / utf-8-validate | optional | ws 성능 | 5명 규모에선 불필요 — 네이티브 빌드 의존을 늘리지 않는다 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ws` | `uWebSockets.js` | 훨씬 빠르지만 네이티브 바이너리·비표준 API. 5명·10Hz 규모에서 이득 없음 |
| `ws` + 자체 인증 | `socket.io` | 재연결·룸이 내장이지만 프로토콜 오버헤드·번들 증가. 브라우저 `WebSocket` 표준으로 충분(D-11 첫 메시지 인증) |
| Caddy | nginx + certbot | 인증서 자동화·WS 설정을 직접 써야 함. Caddy 는 Caddyfile 2줄 |
| Caddy | Cloudflare Tunnel | 공인 포트 0 이지만 계정·도메인 위임 필요 — CONTEXT deferred |
| Docker `json-file` 로그 | Ops Agent | fluent-bit+otel 이 e2-micro 1GB 에 부담(§Pitfall 11). 알림은 uptime check 로 대체 |
| Docker `json-file` 로그 | `gcplogs` 드라이버 | Cloud Logging 직송이지만 `docker logs` 불가 — 초기 디버깅 비용↑ |
| `supabase.auth.getUser` | `jose` JWKS 로컬 검증 | D-10 이 네트워크 검증으로 확정(revoke 즉시 반영). deferred |
| 자체 프레이밍 코덱 | `length-prefixed-stream` 류 | 4바이트 LE + 상한 검사뿐이라 30줄. 외부 의존을 늘릴 이유 없음(§Don't Hand-Roll 반례) |

**Installation:**

```bash
# relay 워크스페이스 (pnpm-workspace.yaml 에 `- relay` 추가 후)
pnpm --filter @gh-radar/relay add ws flatbuffers @supabase/supabase-js express zod pino pino-http @google-cloud/pino-logging-gcp-config @gh-radar/shared
pnpm --filter @gh-radar/relay add -D @types/ws @types/express @types/node typescript vitest tsx dotenv
```

**Version verification (2026-09-05 실측):**

```
npm view ws version          → 8.21.3   (modified 2026-08-07)
npm view flatbuffers version → 25.9.23  (modified 2025-09-24)
npm view @types/ws version   → 8.18.1
flatc --version              → flatc version 25.12.19   ✓ D-26 요구값 일치
node --version               → v22.22.0
pnpm --version               → 11.15.1   ⚠ server/Dockerfile 은 pnpm@10 고정 — relay/Dockerfile 도 동일하게
```

---

## Package Legitimacy Audit

`slopcheck` 0.6.1 (pip3) 로 검증했다. **주의: `slopcheck install` 은 검증 후 실제로 `npm install` 을 실행한다** — 저장소 루트에서 돌리면 `package.json` 이 오염된다(이번 세션에서 발생 → `git checkout` + `node_modules` 정리로 원복 확인). plan 에서는 반드시 격리 디렉터리에서 돌리거나 `slopcheck scan` 을 쓴다.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `ws` | npm | 2011-12 최초 공개 (~14년) | 269.8M/주 | github.com/websockets/ws | `[OK]` | Approved |
| `flatbuffers` | npm | 2016-03 최초 공개 (~9년) | 8.9M/주 | github.com/google/flatbuffers | `[OK]` | Approved |
| `@types/ws` | npm | DefinitelyTyped | (types) | github.com/DefinitelyTyped/DefinitelyTyped | `[OK]` | Approved |
| `express`·`zod`·`pino`·`@supabase/supabase-js`·`vitest`·`tsx` | npm | — | — | — | (기설치) | Approved — **이미 server/워커가 쓰는 버전 재사용, 신규 도입 아님** |
| `vpn-slice` | PyPI | 0.16.1 | — | github.com/dlenski/vpn-slice | 미실행(PyPI) | **Flagged** — VM 에 pip 설치가 필요. §Pattern 8 의 무의존 대안(`CISCO_SPLIT_INC`)을 1순위로, vpn-slice 는 2순위 |

`npm view ws scripts.postinstall` / `flatbuffers scripts.postinstall` → 둘 다 없음(출력 공백). 의심스러운 설치 훅 없음. [VERIFIED: npm registry]

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none (npm). `vpn-slice` 는 slopcheck 미적용 영역(PyPI + VM 설치)이라 planner 가 `checkpoint:human-verify` 로 감쌀 것을 권고.

---

## Architecture Patterns

### System Architecture Diagram

```
                     ┌──────────────────────────────────────────────┐
   브라우저 (≤5명)    │  Vercel  Next.js  /stocks/[code] 호가창 섹션   │
                     └───┬───────────────────────────┬──────────────┘
                         │ ① wss (시세·체결·계좌·상태)  │ ② REST (주문·조회)
                         │    첫 메시지 {t:"auth"}      │    Authorization: Bearer
                         ▼                             ▼
         ┌────────────────────────────┐   ┌──────────────────────────────┐
         │  Caddy :443 (VM host)      │   │ Cloud Run  gh-radar-server   │
         │  dma.jx1.io · LE 자동 TLS   │   │  requireAuth → allowlist     │
         │  reverse_proxy → :8090     │   │  형식검사 → stocks.isin 조회  │
         └────────────┬───────────────┘   └───────────┬──────────────────┘
                      │ ws (평문, localhost)           │ ③ Direct VPC Egress
                      ▼                                │    (10.10.0.16/28 출발)
   ┌──────────────────────────────────────────────┐    │
   │  GCE VM  radar-gw  (e2-micro, an3, 10.10.0.x)│◀───┘  POST /internal/orders
   │                                              │        X-Relay-Secret
   │  ┌────────────────────────────────────────┐  │
   │  │ relay (Docker, --restart=always)       │  │
   │  │  ┌──────────┐   ┌────────────────┐     │  │
   │  │  │ WsFanout │◀─▶│ SubscriptionHub│     │  │
   │  │  │  :8090   │   │ (참조계수+캐시) │     │  │
   │  │  └────┬─────┘   └───────┬────────┘     │  │
   │  │       │                 │              │  │
   │  │  ┌────▼─────────────────▼───────────┐  │  │
   │  │  │ SessionManager (userId → 세션 1)  │  │  │
   │  │  │  DmaClient: 코덱·상태기계·핑·재접속│  │  │
   │  │  └────────────┬─────────────────────┘  │  │
   │  │  ┌────────────▼──────┐                 │  │
   │  │  │ OrderApi :8091    │  ┌────────────┐ │  │
   │  │  │  /healthz         │  │ CredStore  │ │  │
   │  │  └───────────────────┘  │ AES-GCM 복호│ │  │
   │  │                         └─────┬──────┘ │  │
   │  └───────────────────────────────┼────────┘  │
   │             ▲ Secret Manager      │           │
   │             │ (VM SA 메타데이터)   ▼           │
   │  ┌──────────┴──────────┐   ┌──────────────┐  │
   │  │ openconnect(systemd)│   │  Supabase     │──┼─▶ dma_credentials / dma_orders
   │  │  tun0 → 10.41.1.x   │   │  (service_role)│  │   stocks(isin)
   │  └──────────┬──────────┘   └──────────────┘  │
   └─────────────┼────────────────────────────────┘
                 │ ④ VPN 터널 (10.41.0.0/16 만 split-route)
                 ▼
   ┌──────────────────────────────────────────────┐
   │ KB 데이터센터  gh-trade-server 10.41.1.120:9100│
   │  [uint32 LE len][FlatBuffer Envelope]         │
   │  1 LoginReq → 50 LoginResp                    │
   │  3 UpdateAccountNoReq → 55 Resp               │
   │  4 LivePing (30s, idle 90s 끊김)              │
   │  28 GetQuoteReq → 58 / 29 Subscribe → 59 push │
   │  32 GetTradeTapeReq → 69 / 71 push            │
   │  25 GetAccountStateReq → 66 / 67 delta        │
   │  2 DirectOrderReq → 51 OrderResp (A/R/E/C)    │
   │  54 ServerMessage (경보)                       │
   └──────────────────────────────────────────────┘
```

**흐름 요약**
1. 브라우저가 wss 연결 → 5초 내 `{t:"auth", token}` → relay 가 `auth.getUser` → `dma_credentials` 조회 → 없으면 `unauthorized` 상태 프레임(연결은 유지), 있으면 세션 부팅.
2. 세션 Ready 후 `{t:"sub", isin, ex}` → SubscriptionHub 가 캐시 hit 이면 즉시 스냅샷 전송, miss 면 `GetQuoteReq(28)`+`SubscribeQuoteReq(29)`+`GetTradeTapeReq(32)`.
3. 주문은 wss 가 아니라 REST. Cloud Run 이 소유권·형식을 검사하고 `dma_orders` 에 요청 행을 insert 한 뒤 relay 내부 HTTP 로 릴레이. relay 는 `OrderResp` 첫 프레임을 5초 안에 되돌리고, 이후 체결·취소확인은 **그 사용자 wss 로만** 푸시하며 `dma_orders` 를 update.
4. VPN 은 relay 프로세스와 무관한 host systemd. 터널이 죽으면 DmaClient 의 TCP 가 끊기고 재접속 백오프가 돌며, 상태 프레임으로 브라우저에 "VPN 단절"이 뜬다.

### Recommended Project Structure

```
relay/
├── package.json                 # @gh-radar/relay, type:module, engines node>=22
├── tsconfig.json                # ../tsconfig.base.json extends + module/moduleResolution NodeNext
├── vitest.config.ts             # include: ["src/**/*.test.ts","tests/**/*.test.ts"]
├── Dockerfile                   # server/Dockerfile 동형(멀티스테이지 + shared 빌드 + non-root)
└── src/
    ├── index.ts                 # 부팅: config → Secret 확인 → SessionManager → ws/http listen
    ├── config.ts                # env 로더 (server/src/config.ts 패턴)
    ├── logger.ts                # pino + GCP config + redact(비밀번호·토큰)
    ├── generated/               # ← sync-relay-schema.sh 산출물. 손대지 않음 (40 files)
    │   ├── StockDMA.fbs         #   SYNC MARKER 7줄(CRLF) + 정본 본문
    │   ├── StockDMA.ts
    │   ├── stock-dma.ts
    │   └── stock-dma/*.ts       #   38개
    ├── dma/
    │   ├── codec.ts             # frame()/FrameReader — 4바이트 LE, 1MB 상한
    │   ├── envelope.ts          # build*(요청 조립) + read*(안전 접근자, 필드 상한)
    │   ├── dma-client.ts        # net.Socket, generation, 30s ping, 백오프 재접속
    │   ├── session.ts           # 상태기계 Idle→Connecting→LoggingIn→DeclaringAccounts→Ready
    │   └── session-manager.ts   # userId → Session, 5분 유예 소멸
    ├── hub/
    │   └── subscription-hub.ts  # (userId, isin, exchange) 참조계수 + 스냅샷 캐시
    ├── ws/
    │   ├── fanout.ts            # WebSocketServer(noServer), 인증 타이머, 30s ping
    │   └── protocol.ts          # zod 스키마(수신) + 인코더(송신) — 계약은 shared 에서 import
    ├── order/
    │   └── order-api.ts         # express :8091 — /internal/orders, /healthz
    ├── store/
    │   ├── credentials.ts       # dma_credentials 조회 + AES-GCM 복호
    │   └── orders.ts            # dma_orders update(체결·취소확인)
    └── auth/
        └── verify-token.ts      # supabase.auth.getUser (require-auth.ts 이식)

packages/shared/src/relay.ts     # wss 메시지·주문 DTO 계약 (server·webapp·relay 3자 공유)
webapp/src/lib/relay-socket.ts   # useRelaySocket 훅 + 재접속 + 스냅샷 캐시
webapp/src/components/stock/stock-orderbook-section.tsx
scripts/dma-credentials.ts       # 관리자 수기 등록(tsx)
scripts/{setup-relay-iam,deploy-relay,smoke-relay}.sh
ops/alert-relay-down.yaml
supabase/migrations/2026MMDDHHMMSS_{stocks_isin,dma_credentials,dma_orders}.sql
```

**pnpm 워크스페이스 등록 [VERIFIED: 코드베이스]** — 현재 `pnpm-workspace.yaml` 은 `webapp / server / workers/* / packages/*` 만 포함한다. `- relay` 를 추가하지 않으면 `pnpm -r run typecheck`(루트 스크립트)가 relay 를 아예 보지 않는다. **디렉터리 생성 → workspace 등록 → `pnpm install` 까지가 `sync-relay-schema.sh` 실행의 선행 조건**이다(스크립트 가드 0 이 `../../gh-radar/relay` 존재를 확인).

### Pattern 1: 프레이밍 코덱 (스트림 → 프레임)

**What:** `[uint32 LE 길이(페이로드만)][FlatBuffer]` 를 결합/분할된 TCP 스트림에서 잘라내는 루프.
**When to use:** 소켓 `data` 이벤트마다.

**핵심 규율 (C# `PacketCodec.TryExtract` 실측 이식):**
- 길이 상한 검사를 **산술보다 먼저**. `len > MAX` 면 프레임 desync 로 판정하고 **연결 재수립**(프레임 드롭이 아님 — 다음 경계를 신뢰할 수 없다).
- 상한값은 **1MB**. 서버 `kMaxRecvBufSize = 1024*1024` 이고 C# 클라도 1MB 다. 핸드오프의 "4MB" 는 서버 `kSendQueueMaxBytes`(송신 큐 총량)를 오독한 것. [VERIFIED: `gh-trade/server/src/net/Gateway.h:53,64` + `client/Services/DMA/PacketCodec.cs:20`]
- Node 는 `Buffer.readUInt32LE` 가 uint 를 반환하므로 C# 의 랩어라운드 함정은 없지만, `if (buf.length < 4 + len)` 비교는 `len` 이 2^31 을 넘어도 안전하도록 Number 비교를 유지한다(1MB 가드가 앞서 막는다).
- 반쯤 남은 바이트는 버퍼에 남기고 다음 `data` 를 기다린다. 절반 이상 소비되면 compact.

### Pattern 2: 안전한 Envelope 파싱 (Verifier 부재 대응)

**What:** 파싱 실패·구조 손상 프레임을 **그 프레임만 버리고 연결은 유지**하는 규율.

**리서치 실측 — 이것이 왜 어려운가:**

```
junk 12바이트 파싱  → 예외 없음. msgType()=0, loginReq()=null      (조용히 무해)
80B 정상 프레임을 70B 로 자름 → 예외 없음. msgType()=1, userId="al"  ← 값이 조용히 깨진다
40B 로 자름          → 예외 없음. userId=""
flatbuffers 런타임에 "Verifier" 심볼 존재 여부 → false
```
[VERIFIED: 본 세션에서 flatc 25.12.19 산출물 + flatbuffers 25.9.23 로 직접 실행]

즉 **`try/catch` 는 필요조건이지 충분조건이 아니다.** 방어는 3단으로 쌓는다.

1. **프레임 레벨:** 길이 헤더가 페이로드 완결성을 보장 → 정상 경로에서 truncation 은 발생하지 않는다(위 실험은 desync 시나리오).
2. **구조 레벨:** 최소 크기(8B: root offset 4 + vtable soffset 4) 미만 즉시 드롭. `msg_type` 이 알려진 enum 값이 아니면 드롭.
3. **필드 레벨(가장 중요):** C# `TakeCount(n, max, label)` 동형 가드 — `askPricesLength()` 는 10 으로 클램프, `entriesLength()`·`holdingsLength()`·`unfilledLength()`·`removedOrderNosLength()` 모두 상한을 두고 초과 시 warn 로그 + 절단. 문자열은 `isin.length === 12`, `exchange ∈ {"KRX","NXT"}`, `change_sign.length === 1` 등 형식 가드.
   [VERIFIED: `gh-trade/client/Services/DMA/Client.cs:1963,2004,2019,2040,2120-2135,2197`]

**Anti-pattern:** 드롭 카운터 없이 조용히 `return` — "간헐적으로 호가가 안 옴"의 원인을 영원히 못 찾는다. C# 은 `_droppedFrameCount` + 선두 64B hex 덤프를 남긴다. 그대로 이식(자동 메모리 「무로그 fail-safe 금지」).

### Pattern 3: Envelope 조립 — `createEnvelope()` 가 없다

**What:** 요청 프레임 만들기.

**중요:** flatc 25.12.19 는 `Envelope` 에 대해 **`createEnvelope(...)` 편의 함수를 생성하지 않는다**(deprecated 슬롯 2종 때문). `LoginReq` 같은 일반 테이블에는 `createLoginReq(...)` 가 생성된다. 따라서 Envelope 는 반드시 `startEnvelope → addMsgType → addXxx → endEnvelope` 순서로 조립한다. [VERIFIED: 생성 코드 `stock-dma/envelope.ts` 에 `static createEnvelope` 부재, `login-req.ts:67` 에 `createLoginReq` 존재]

또한 **`Envelope` 은 FlatBuffers `union` 이 아니라 optional 테이블 슬롯을 나열한 일반 table** 이다(작업 지시서의 "payload union" 표현은 부정확). 미설정 슬롯 접근자는 `null` 을 반환하므로 `msg_type` 으로 분기한 뒤 해당 슬롯이 `null` 이면 드롭한다.

`msg_type` 은 `byte` 기반 enum → 생성 코드가 `readInt8` 을 쓴다. 값 목록은 §Code Examples 6 참조.

### Pattern 4: 세션 상태기계 (C# `Session.cs` 이식)

**What:** TCP 올림/내림과 "운용 준비"를 분리한 상태기계.

**이식해야 할 규율 (C# 실측):**

| 규율 | C# 근거 | TS 이식 |
|------|---------|---------|
| 상태 6종 `Idle / Connecting / LoggingIn / DeclaringAccounts / Ready / Reconnecting / Failed` | `EventArgs.cs:462-482` | 그대로. 라벨 문구의 정본도 세션이 소유 — wss 상태 프레임이 그 라벨을 그대로 실어 브라우저가 switch 를 중복하지 않게 |
| **transport generation** — 재접속마다 증가, 늦게 깨어난 워커는 세대 불일치 시 아무것도 보고하지 않음 | `Session.cs:100-105`, `Client.cs:1362,1381` | `#generation: number` + 모든 async 콜백 진입부에서 `if (gen !== this.#generation) return;` |
| 응답 5초 타임아웃 (`LOGIN_RESP_TIMEOUT_MS` / `ACCOUNT_RESP_TIMEOUT_MS`) | `Session.cs:60-61` | `AbortSignal.timeout(5000)` 또는 `Promise.race` |
| 부트 실패 vs 운용 중 실패 구분(`_bootPhase`) | `Session.cs:97` | 부트 실패 = 사용자에게 즉시 실패 상태 프레임 / 운용 중 실패 = 재접속 |
| **서버 로그인 거부는 부트 여부와 무관하게 재시도 중단**(`FailNoRetry`) | `Session.cs` WR-02, gh-trade 17 D-17 | 재접속 루프 중단 + `session_rejected` 상태 프레임(D-16) |
| 재접속 상한 10회 + 백오프 | `Client.cs:50 MAX_RECONNECT_ATTEMPTS=10` | 동일 상한 채택 권장(무한 재시도 금지 D-16). 소진 시 `manual_reconnect_required` 상태 |
| 계좌 목록 대조 후에만 Ready | `Session.cs:616 OnClientAccountListReceived` | `UpdateAccountNoResp.account_list` ⊇ 선언 목록 확인 |
| `socket.setNoDelay(true)` | `Client.cs:296` | `socket.setNoDelay(true)` |
| 30초 LivePing | `Client.cs:52 PING_INTERVAL_MS=30000` | `setInterval` — **서버는 클라→서버 완성 패킷만 활동으로 센다**(`server.toml client_idle_timeout_sec = 90`) |

**단, 현행 스키마 제약:** `LoginResp` 에 `accounts` 가 없으므로(§Open Question 1) 초반 wave 의 `DeclaringAccounts` 는 "선언할 계좌 없음 → 즉시 Ready" 로 가는 축약 경로만 구현하고, 재동기화 후 계좌 루프를 채운다. 상태 enum 자체는 처음부터 6종을 두어 나중에 상태를 추가하지 않는다.

### Pattern 5: SubscriptionHub — 참조계수 + 스냅샷 캐시

**What:** `(userId, isin, exchange)` 키의 참조계수. 0→1 에서 `GetQuoteReq(28)` + `SubscribeQuoteReq(29)` + `GetTradeTapeReq(32)`, 1→0 에서 `SubscribeQuoteReq{subscribe:false}`.

**설계 포인트**
- **키에 userId 를 포함한다.** D-13 이 세션을 사용자별로 두므로 구독도 세션 단위다. 전역 키를 쓰면 A 사용자가 해제할 때 B 세션의 구독을 끊는다.
- 스냅샷 캐시는 세션 안에 `Map<"isin|ex", QuoteSnapshot>` 로. 브라우저 재접속(D-37)·다중 탭에서 즉시 응답.
- 캐시에 저장하는 형태는 **이미 Number 로 변환된 wire JSON**(bigint 아님). 매 push 마다 재변환하지 않는다.
- 체결 테이프는 별도 구독이 없다(시세 구독 편승). 캐시는 최근 N건 링버퍼(예: 200) + 200ms 배치 플러시.
- 재접속 시 재구독은 **Hub 가 소유한 키 집합**을 순회 — 브라우저 상태에 의존하지 않는다(Pitfall 4 방지).

### Pattern 6: WsFanout — 인증·백프레셔·팬아웃

**What:** `ws` 서버. HTTP 서버와 포트를 공유하고(`noServer`), 업그레이드 후 첫 메시지로 인증.

```
서버 생성 → wss.handleUpgrade → connection
  ├ 5초 authTimer 시작 (미인증 시 ws.close(4401, "auth timeout"))
  ├ 첫 메시지가 {t:"auth"} 아니면 close(4400)
  ├ auth.getUser(token) → 실패 close(4401)
  ├ dma_credentials 조회 → 없으면 상태 프레임 {t:"state", s:"unauthorized"} (연결 유지, 구독 거부)
  └ 있으면 SessionManager.acquire(userId) → 상태 프레임 스트림 시작
30초 ping/pong 하트비트 (isAlive 패턴)
```

**백프레셔:** 매 전송 전에 `ws.bufferedAmount` 를 확인. 임계(예: 1MB) 초과가 연속 N회면 그 연결만 `terminate()`. **수신 경로(DMA)에서 동기 블로킹 금지**(D-32) — 느린 브라우저 하나가 DMA 소켓 소비를 막으면 게이트웨이 송신 큐(1024프레임/4MB)가 차서 **서버가 연결을 끊는다**.

**perMessageDeflate:** D-35 가 ON 으로 고정. 단 `ws` 공식 README 가 명시적으로 경고한다 — "adds a significant overhead in terms of performance and memory consumption", "Node.js has a variety of issues with high-performance compression, where increased concurrency, especially on Linux, can lead to catastrophic memory fragmentation" [CITED: github.com/websockets/ws README]. e2-micro 1GB 에서는 **기본값 `true` 를 쓰지 말고 명시 튜닝**을 권고:

```js
perMessageDeflate: {
  threshold: 1024,              // 1KB 미만은 압축 안 함 (상태 프레임·핑)
  concurrencyLimit: 4,          // 기본 10 → 4
  serverNoContextTakeover: true,// 연결당 컨텍스트 유지 안 함 = 메모리↓ (압축률은 소폭↓)
  clientNoContextTakeover: true,
  serverMaxWindowBits: 12,      // 기본 15 → 12 (windowBits 당 메모리 2배 차이)
  zlibDeflateOptions: { level: 3, memLevel: 7 },
}
```

**메시지 스키마 제안 (Claude's Discretion — `packages/shared/src/relay.ts` 에 계약으로 고정 권장):**

수신(브라우저 → relay)
| `t` | 필드 | 의미 |
|-----|------|------|
| `auth` | `token` | 첫 메시지 필수 |
| `sub` | `isin`(12), `ex`("KRX"\|"NXT") | 구독 |
| `unsub` | `isin`, `ex` | 해제 |
| `ping` | — | 앱 레벨(옵션. 프로토콜 ping 으로 충분) |

송신(relay → 브라우저) — 필드명은 짧게, 가격·수량은 **Number**
| `t` | 내용 |
|-----|------|
| `state` | `{s: "connecting"\|"logging_in"\|"declaring"\|"ready"\|"reconnecting"\|"failed"\|"unauthorized"\|"session_rejected", msg?, attempt?, accounts?}` |
| `q` | QuoteState 1건 `{i, x, snap, p, o, h, l, c, cs, cr, v, va, ap[10], aq[10], bp[10], bq[10], ta, tb, ul, ll, base, viu, vid, ls, et}` |
| `tape` | `{i, x, snap, e:[{t,p,cs,c,q,cv}]}` — 200ms 배치 |
| `acct` | AccountState `{a, snap, hold:[…], unf:[…], rm:[…], st}` |
| `order` | OrderResp 파생 `{no, nt, rc, msg, org, p, q, x}` |
| `msg` | ServerMessage `{lv, m, i, a, src, kind}` — 상태 영역에 최근 N개 누적 |

### Pattern 7: GCE VM 프로비저닝 (gcloud 초안 — **실행 금지**)

> 아래는 planner 가 `scripts/setup-relay-iam.sh` / `deploy-relay.sh` 로 옮길 초안이다. 이번 리서치에서는 **읽기 조회만** 수행했고 어떤 리소스도 만들지 않았다.

**실측 전제 (2026-09-05, 읽기 전용 gcloud) [VERIFIED]**
- VM: 0대
- `gh-radar-vpc` 방화벽 규칙: **0개** (`gcloud compute firewall-rules list` 의 4건은 전부 `default` 네트워크)
- 서브넷: `gh-radar-subnet-an3` / asia-northeast3 / **10.10.0.0/26**
- 외부 IP: `gh-radar-static-ip` 34.64.195.151 (IN_USE — **Cloud NAT 용, 재사용 금지**)
- 내부 예약: `serverless-ipv4-1778809091997182387` **10.10.0.16/28** RESERVED (Cloud Run Direct VPC Egress 용)
- Cloud Run `gh-radar-server`: `network-interfaces: gh-radar-vpc/gh-radar-subnet-an3`, `vpc-access-egress: all-traffic`
- Artifact Registry: `gh-radar` (asia-northeast3, DOCKER)
- 알림 채널: `projects/gh-radar/notificationChannels/14409521670382124894` (gh-radar ops email)
- SA 12개(워커별) — relay SA 없음
- Secret 8개 — `gh-radar-dma-cred-key` / `gh-radar-relay-order-secret` / `gh-radar-kb-vpn-password` 전부 **없음(신설 필요)**
- `e2-micro` = 2 vCPU(공유) / **1024 MB**, `e2-small` = 2 vCPU / 2048 MB
- Debian 12 이미지 패밀리 `debian-12`(현행 `debian-12-bookworm-v20260902`), 존 a/b/c 모두 UP

```bash
REGION=asia-northeast3; ZONE=asia-northeast3-a
VPC=gh-radar-vpc; SUBNET=gh-radar-subnet-an3
VM=radar-gw; SA=gh-radar-relay-sa

# 1) 서비스 계정 + IAM (setup-relay-iam.sh)
gcloud iam service-accounts create $SA --display-name="gh-radar relay VM"
SA_EMAIL="$SA@${PROJECT}.iam.gserviceaccount.com"
for ROLE in roles/secretmanager.secretAccessor roles/artifactregistry.reader \
            roles/logging.logWriter roles/monitoring.metricWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA_EMAIL" --role="$ROLE"
done
# Secret 단위로 좁히는 것이 더 낫다(프로젝트 레벨 secretAccessor 대신):
#   gcloud secrets add-iam-policy-binding gh-radar-dma-cred-key \
#     --member="serviceAccount:$SA_EMAIL" --role=roles/secretmanager.secretAccessor

# 2) 신규 외부 고정 IP (Cloud NAT 용 gh-radar-static-ip 와 별개)
gcloud compute addresses create gh-radar-relay-ip --region=$REGION
gcloud compute addresses describe gh-radar-relay-ip --region=$REGION --format='value(address)'
#   → 이 값을 사용자에게 전달해 jx1.io 에 dma A 레코드 등록 [BLOCKING 체크포인트]

# 3) 내부 고정 IP (RELAY_INTERNAL_URL 안정화 — serverless /28(10.10.0.16-31) 회피)
gcloud compute addresses create gh-radar-relay-internal \
  --region=$REGION --subnet=$SUBNET --addresses=10.10.0.5 --purpose=GCE_ENDPOINT

# 4) 방화벽 3규칙 (gh-radar-vpc 최초 규칙)
gcloud compute firewall-rules create relay-allow-https \
  --network=$VPC --direction=INGRESS --action=ALLOW --rules=tcp:443 \
  --source-ranges=0.0.0.0/0 --target-tags=radar-gw
gcloud compute firewall-rules create relay-allow-iap-ssh \
  --network=$VPC --direction=INGRESS --action=ALLOW --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 --target-tags=radar-gw
gcloud compute firewall-rules create relay-allow-internal-order \
  --network=$VPC --direction=INGRESS --action=ALLOW --rules=tcp:8091 \
  --source-ranges=10.10.0.0/26 --target-tags=radar-gw
#   ↑ Cloud Run 워크로드에는 네트워크 태그를 붙일 수 없다 → source-ranges 로만 좁힌다.
#     더 좁히려면 10.10.0.16/28(serverless 예약)이지만 재배포 시 변동 가능성 → /26 + 공유 비밀 헤더 이중 방어.

# 5) VM
gcloud compute instances create $VM \
  --zone=$ZONE --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB --boot-disk-type=pd-balanced \
  --subnet=$SUBNET --private-network-ip=10.10.0.5 \
  --address=<위에서 만든 외부 IP> \
  --can-ip-forward \
  --tags=radar-gw \
  --service-account="$SA_EMAIL" \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --metadata-from-file=startup-script=infra/relay/startup.sh \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring
```

**`--can-ip-forward` 주의:** tun 인터페이스로의 라우팅만 필요하고 GCE 외부로 포워딩하지 않으므로 **없어도 동작한다.** 최소권한 원칙상 **빼는 것을 권고**하고, VPN 라우팅 문제가 확인될 때만 추가한다.

**startup-script 가 해야 할 일 (멱등):** swap 1GB(`fallocate`+`swapon`+`/etc/fstab`), `apt-get install -y docker.io openconnect`, Caddy apt repo + 설치, `/etc/docker/daemon.json` 로그 로테이션, unattended-upgrades, Secret Manager 에서 VPN 비밀번호를 읽는 래퍼 스크립트 배치(600), systemd 유닛 2종 배치, `docker login` 대신 `gcloud auth configure-docker` 또는 `docker-credential-gcr`.

**Secret Manager 접근:** GCE Debian 공개 이미지에 gcloud 가 항상 있다고 가정하지 말 것 [ASSUMED — Debian wiki·GCP 문서에서 확정 못 함]. 무의존 경로를 1순위로:

```bash
TOKEN=$(curl -s -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/$NAME/versions/latest:access" \
  | python3 -c 'import sys,json,base64;print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode(),end="")'
```
(python3 는 Debian 12 기본 포함. jq 는 없을 수 있다.)

### Pattern 8: openconnect systemd + **split-tunnel** (최대 인프라 리스크)

**What:** KB AnyConnect 터널을 호스트에 상시 유지하되 **기본 경로를 빼앗기지 않게** 한다.

**Mac 기준 인자 [VERIFIED: `/usr/local/sbin/kbvpn-connect` 읽기 — 값은 미기록]**
`--protocol=anyconnect` · `--user=<stdin 1행>` · `--authgroup=KBSEC_DMA` · `--servercert pin-sha256:<핀>` · `--passwd-on-stdin` · `--background` · `--pid-file=/var/run/kbvpn.pid` · 서버 `https://211.47.35.211:65535`. **비밀번호는 stdin 2행**으로 들어간다(스크립트가 1행을 `read` 로 소비한 뒤 나머지를 openconnect 에 넘김).

**핵심 리스크:** openconnect 는 기본 `vpnc-script` 로 서버가 푸시한 라우트를 설치한다. 서버가 default route 를 푸시하면 VM 의 모든 아웃바운드가 KB 로 가고 그 순간 **Caddy 의 ACME 갱신·Artifact Registry pull·Secret Manager·Supabase·Cloud Logging 이 전부 깨진다.** 인바운드 443 은 conntrack 덕에 잠시 버티지만 비대칭 경로가 되면 신규 연결이 죽는다. VM 이 IAP SSH 로도 안 들어와서 복구가 어려워질 수 있다.

**대응 3안 (권장 순서)**

1. **`CISCO_SPLIT_INC` 환경변수로 라우트 강제** — 추가 패키지 0. 래퍼가 stock `vpnc-script` 를 호출하기 전에 서버 푸시를 덮어쓴다.
   ```sh
   # /usr/local/sbin/kbvpn-vpnc-wrapper
   #!/bin/sh
   export CISCO_SPLIT_INC=1
   export CISCO_SPLIT_INC_0_ADDR=10.41.0.0
   export CISCO_SPLIT_INC_0_MASK=255.255.0.0
   export CISCO_SPLIT_INC_0_MASKLEN=16
   unset CISCO_BANNER
   exec /usr/share/vpnc-scripts/vpnc-script "$@"
   ```
   `openconnect --script=/usr/local/sbin/kbvpn-vpnc-wrapper …`
   [CITED: vpnc-script 환경변수 규약 — gist.github.com/stefancocora/686bbce938f27ef72649a181e7bd0158, lists.unix-ag.uni-kl.de vpnc-devel]

2. **`vpn-slice`** — `--script 'vpn-slice 10.41.0.0/16'`. 가장 검증된 split-tunnel 도구지만 **Debian 저장소에 없다**(sources.debian.org 검색 결과 0건) → `apt install pipx && pipx install vpn-slice`. PyPI 0.16.1. [VERIFIED: PyPI API; Debian 부재도 확인]

3. **사후 라우트 교정** — 연결 후 `ip route del default dev tun0` + `ip route add 10.41.0.0/16 dev tun0`. 경합이 있어 권장하지 않지만 검증용 1회 시도에는 유효.

**systemd 유닛 규율 (무한 재시도 금지 — D-16/Discretion)**
```ini
[Unit]
Description=KB AnyConnect VPN (openconnect)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=3600
StartLimitBurst=5          # 1시간에 5회 초과 재시작 시 유닛 정지 → 계정 잠금 방지

[Service]
Type=simple
ExecStartPre=/usr/local/sbin/kbvpn-fetch-secret     # Secret Manager → /run/kbvpn.cred (0600, tmpfs)
ExecStart=/usr/local/sbin/kbvpn-connect             # cred 를 stdin 으로 openconnect 실행(--background 없이 foreground)
ExecStopPost=/bin/rm -f /run/kbvpn.cred
Restart=on-failure
RestartSec=30
```
- systemd 유닛에서는 `--background` 를 **빼고** foreground 로 돌린다(Type=simple 과 맞다).
- 비밀번호는 `/run`(tmpfs) 에만, 0600, 종료 시 삭제. `ExecStart=` 라인에 값이 들어가면 `systemctl show` · `ps` 에 노출된다.
- `journalctl` 에 비밀번호가 남지 않도록 래퍼가 openconnect stdout 만 넘기고 cred 는 echo 하지 않는다.

**D-03 선검증 체크리스트 ([BLOCKING] 체크포인트 — 수동 ≤3회, 실패 시 즉시 중단)**

| # | 확인 항목 | 방법 | 기록 위치 |
|---|-----------|------|-----------|
| 1 | VM 에서 openconnect 연결 성립 | 유닛 1회 수동 실행 → `ip -br addr show tun0` | SUMMARY/STATE |
| 2 | 터널 IP | `ip -4 addr show tun0` (Mac 실측은 3회 모두 10.41.1.124 — 계정 고정 추정) | 기록 |
| 3 | **출발지 공인 IP 제한 여부** | GCE 외부 IP 에서 연결 성공 = 제한 없음. 실패 시 KB 문의 전환 | 기록 |
| 4 | **Mac 세션과 동시 접속 가능 여부** | Mac 터널 유지 중 VM 연결 시도 → 둘 다 유지되는지, 한쪽이 끊기는지 | 기록 |
| 5 | 라우팅 영향 | 연결 전/후 `ip route` diff + `curl -s ifconfig.me` (VM 공인 IP 유지되어야 함) + `curl -sI https://secretmanager.googleapis.com` | 기록 |
| 6 | 게이트웨이 도달성 | `nc -zv 10.41.1.120 9100` — **연결만 확인, 로그인·주문 금지**(D-27) | 기록 |
| 7 | 실패 시 | **자동 재시도 없이 중단.** 3회 초과 금지(KB 계정 잠금) | 즉시 사용자 보고 |

### Pattern 9: Caddy

```caddyfile
{
    email <운영 이메일>
}

dma.jx1.io {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8090
    log {
        output file /var/log/caddy/dma.log
        format json
    }
}
```

- **WebSocket 설정 불필요** — Caddy v2 는 `Upgrade` 헤더를 감지해 자동 통과 [CITED: caddyserver.com/docs/v2-upgrade "WebSocket proxying 'just works' in v2"].
- **포트 80 은 필수가 아니다.** HTTP-01(80) 과 TLS-ALPN-01(443) 중 하나면 되고 443 만 열려 있으면 TLS-ALPN 으로 발급된다 [CITED: caddyserver.com/docs/automatic-https]. D-09 의 "공인 인바운드는 443 만"과 정합. 단 발급 실패 시 원인 파악이 어려워지므로, **최초 발급만 80 을 임시 개방하는 것**도 선택지(방화벽 규칙 임시 추가 → 발급 확인 → 삭제).
- **토큰 로그 미기록 검증:** D-11 이 토큰을 첫 메시지로 보내므로 URL·쿼리스트링에 토큰이 없다. Caddy access log 는 URI 만 남기므로 안전. `Authorization` 헤더를 로그하지 않는 기본 설정 유지.
- `/healthz` 는 relay 의 **공개 헬스**(세션 수·VPN 상태 요약, PII·계좌번호 없음)를 Caddy 로 노출 → Cloud Monitoring uptime check 대상.
- **Caddy 설정 리로드 시 WebSocket 이 강제 종료된다.** `stream_close_delay` 로 유예 가능 [CITED: caddyserver.com/docs/caddyfile/directives/reverse_proxy]. 운영 중 Caddyfile 변경은 장중 회피.

### Pattern 10: Cloud Run → VM 내부 HTTP (주문)

- `server/src/config.ts` 에 `relayInternalUrl`(`RELAY_INTERNAL_URL`, 예 `http://10.10.0.5:8091`), `relayOrderSecret`(`RELAY_ORDER_SECRET`) 추가. 둘 다 **optional** 로 두고 미설정 시 `/api/orders` 만 503 을 반환하게 하면(Bright Data 선례) 부분 롤아웃이 안전하다.
- `scripts/deploy-server.sh` 의 `--set-env-vars` 델리미터가 `^@^` 이므로 `@RELAY_INTERNAL_URL=...` 형태로 추가하고, 비밀은 `--update-secrets` 에 `RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest` 를 append.
- 타임아웃 5초(D-22)는 `AbortSignal.timeout(5000)` 로. relay 가 `OrderResp` 를 못 받으면 **504 가 아니라** `{code:"ORDER_TIMEOUT"}` 로 매핑하고 `dma_orders.status='timeout'` 으로 남긴다 — "보냈는지 안 보냈는지 모른다"가 진실이므로 UI 가 "결과 확인 중"을 표시해야 한다.
- 매핑: relay 409(세션 없음) → server 409 `SESSION_NOT_READY`, relay 5xx/연결실패 → 502 `RELAY_UNAVAILABLE`, relay 401(비밀 불일치) → 500(내부 설정 오류, 사용자 노출 금지).
- **Direct VPC Egress 는 서브넷 IP 에서 나온다** [CITED: docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc] — 방화벽은 태그가 아니라 `--source-ranges` 로.

### Pattern 11: 웹앱 데이터 흐름 (`useRelaySocket`)

```
useRelaySocket(code)
  ├ stocks 상세에서 isin 확보 (server 응답에 isin 추가 — D-28)
  ├ createClient().auth.getSession() → access_token   (chat-sse.ts 와 동일 경로)
  ├ new WebSocket(resolveRelayWsUrl())                 // .trim() 필수 (Vercel newline 함정)
  ├ onopen  → send {t:"auth", token}
  ├ onmessage → zod 파싱 → reducer(state)
  │    q    → orderbook/quote 갱신
  │    tape → 링버퍼 앞에 prepend (스냅샷이면 교체)
  │    acct → 잔고·미체결 (snap=교체, delta=upsert + rm 제거)
  │    order→ 주문 상태 갱신
  │    state→ 배지
  ├ 재접속: exponential backoff (1s→2s→4s→8s, 상한 30s, 최대 N회) + 재구독
  └ cleanup: unsub → close(1000)
```

- **거래소 토글** 전환 시 이전 `{t:"unsub"}` 를 반드시 보낸다(참조계수 누수 방지).
- **스냅샷 캐시:** 훅 내부에 `Map<isin|ex, quote>` 를 두어 토글 왕복 시 깜빡임 제거.
- `--up`/`--down` 은 **oklch** 로 정의돼 있다 [VERIFIED: `webapp/src/styles/globals.css:39-43,110-114`] — 호가창이 lightweight-charts 계열 캔버스 렌더러를 쓰게 되면 hex 변환 필수(자동 메모리).
- 섹션 마운트는 `stock-detail-client.tsx` 의 기존 배치(`StockDailyChartSection` 아래, `StockStatsGrid` 위 등)에 한 줄 추가하는 패턴.
- 비로그인/권한 없음은 섹션을 **감추지 말고** 안내 상태로 렌더(기존 chat FAB 게이트 선례).

### Anti-Patterns to Avoid

- **DMA 수신 콜백에서 `await` 로 Supabase 를 호출** — 게이트웨이 송신 큐가 차서 연결이 끊긴다(D-32). DB 쓰기는 큐에 넣고 별도 워커 tick 에서 처리.
- **bigint 를 그대로 `JSON.stringify`** — `TypeError: Do not know how to serialize a BigInt` [VERIFIED: 실행 확인]. 경계에서 한 번만 Number 변환.
- **`Envelope` 을 union 으로 다루기** — table 이다. `msg_type` 분기 + 슬롯 null 검사.
- **생성 코드 수정** — 다음 동기화에서 소실(D-26).
- **wss 로 주문 전송** — D-08 이 REST 로 확정. wss 에 주문 경로를 만들면 감사·rate-limit·requireAuth 가 이중화된다.
- **전역(사용자 무관) 구독 키** — 세션 모델과 불일치.
- **openconnect 를 Docker 컨테이너 안에서 실행** — D-07 이 host systemd. 컨테이너 재시작이 터널을 흔들면 전체가 흔들린다.
- **`gh-radar-static-ip` 재사용** — Cloud NAT 용(IN_USE). 뺏으면 워커 outbound 가 깨진다.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT 검증 | 자체 서명 검증·JWKS 캐시 | `supabase.auth.getUser(token)` (D-10) | 서비스롤 클라이언트로도 동작함이 코드베이스에서 이미 검증됨. revoke·만료가 즉시 반영 |
| WebSocket 프레이밍·마스킹·close 코드 | 자체 RFC6455 구현 | `ws` 8.21.3 | 압축 협상·핑퐁·백프레셔가 전부 들어 있다 |
| TLS 인증서 발급·갱신 | certbot cron | Caddy 자동 HTTPS | 갱신 실패 시 서비스 중단. Caddy 는 실패 재시도·OCSP 까지 |
| FlatBuffers 직렬화 | 자체 바이너리 파서 | flatc 생성 코드 + `flatbuffers` 런타임 | vtable 슬롯 규약(deprecated 보존)을 손으로 맞추면 **실계좌 오주문** |
| AES-GCM | 자체 nonce/tag 조합 | `node:crypto` `createCipheriv("aes-256-gcm")` | tag 검증·AAD 가 표준. 직접 만들면 nonce 재사용 사고 |
| 지수 백오프·재시도 | ad-hoc setTimeout 사슬 | 단일 `ReconnectPolicy` 객체(상한 포함) | C# `MAX_RECONNECT_ATTEMPTS` 단일 정본 규율(IN-01) — 두 곳에 상한을 복제하면 어긋난다 |
| VPN 프로세스 감시 | 자체 데몬·cron 핑 | systemd `Restart=on-failure` + `StartLimitBurst` | 재시도 상한이 곧 KB 계정 보호 장치 |
| 컨테이너 로그 로테이션 | logrotate 커스텀 | Docker `json-file` `max-size`/`max-file` | 20GB 디스크에서 로그 폭주 = 디스크 풀 = VM 정지 |
| 헬스체크 알림 | 자체 크론 curl | Cloud Monitoring uptime check + 기존 알림 채널 | VM 에 에이전트 불필요(메모리 절약), 채널 재사용 |
| **반례 — 직접 만들 것** | | | |
| 4바이트 LE 길이 프레이밍 | 외부 length-prefix 라이브러리 | **직접 30줄** | 상한·desync 정책이 gh-trade 규약에 묶여 있어 범용 라이브러리가 오히려 제약 |
| wss 메시지 스키마 | 범용 RPC 프레임워크 | **zod + 공유 타입** | 메시지 6종뿐. 프레임워크는 번들·러닝코스트만 늘린다 |

**Key insight:** 이 도메인의 위험은 "복잡한 알고리즘"이 아니라 **와이어 호환성과 연결 수명 관리**다. 직렬화·TLS·암호화 같은 표준 문제는 전부 라이브러리에 위임하고, 엔지니어링 예산 전부를 상태기계·백프레셔·재접속 규율에 쏟는 것이 옳다.

---

## Common Pitfalls

### Pitfall 1: `LoginResp.accounts` 가 아직 없다 — 계좌·주문 wave 전체가 컴파일 불가
**What goes wrong:** 계좌 선언·계좌 상태·주문 코드를 먼저 짜면 생성 코드에 `accounts()` 접근자가 없어 타입 에러가 난다.
**Why:** gh-trade `StockDMA.fbs`(커밋 14bd025)에 `AccountEntry` 테이블도 `LoginResp.accounts` 필드도 **존재하지 않는다**. Phase 17 은 CONTEXT/RESEARCH/PLAN 까지만 진행됐다. [VERIFIED: `grep -n "accounts\|AccountEntry" StockDMA.fbs` → 0건; `git log --oneline -3` → "docs(17): Phase 17 계획"]
**How to avoid:** D-25 게이트를 plan 의 [BLOCKING] 태스크로 명시. 초반 wave 는 `LoginResp{success, message}` 만 쓰고, 계좌 목록은 **빈 배열**로 취급하는 코드 경로를 처음부터 둔다. 게이트 통과 시 `sync-relay-schema.sh` 재실행 → 생성물 재커밋 → 계좌 코드 추가.
**Warning signs:** "accounts 가 undefined 인데 왜 빈 배열이 아니지?" — 스키마가 아직 안 왔다는 뜻.

### Pitfall 2: 프레임 상한을 4MB 로 잡음
**What goes wrong:** 서버가 절대 보내지 않는 크기를 허용해 desync 감지가 늦어지고, 최악의 경우 수 MB 버퍼를 붙들고 있다가 e2-micro 메모리를 압박.
**Why:** 핸드오프의 "4MB" 는 서버 **송신 큐 바이트 상한**(`kSendQueueMaxBytes`)이다. 프레임/수신 버퍼 상한은 **1MB**(`kMaxRecvBufSize`, C# `MAX_FRAME_SIZE`).
**How to avoid:** `MAX_FRAME_SIZE = 1024 * 1024` 로 고정하고 상수에 근거 주석. 상한 초과는 드롭이 아니라 **연결 재수립**.
**Warning signs:** 수신 버퍼가 수백 KB 이상 자라는 로그.

### Pitfall 3: `try/catch` 만 믿고 필드 가드를 생략
**What goes wrong:** 깨진 프레임이 예외 없이 통과해 호가 배열이 3단만 오거나 문자열이 잘린 채 브라우저로 나간다.
**Why:** JS 런타임에 Verifier 가 없고, 잘린 버퍼는 예외 대신 **깨진 값**을 반환한다(실측).
**How to avoid:** `TakeCount` 동형 클램프 + 형식 가드(ISIN 12자, exchange 화이트리스트, 벡터 길이 ≤ 10/N). 위반 시 드롭 + 카운터 + 선두 64B hex.
**Warning signs:** UI 에 호가 단수가 들쭉날쭉.

### Pitfall 4: 재접속 후 재구독 누락
**What goes wrong:** VPN 이 잠깐 끊겼다 붙은 뒤 시세가 영원히 안 온다.
**Why:** 구독 상태가 브라우저나 폼 생명주기에 묶여 있으면 재접속 경로가 그것을 모른다. C# 이 "TCP 가 올라오는 경로 셋이 모두 같은 세션 수립 워커를 탄다"는 규율을 둔 이유가 정확히 이것이다(`Session.cs` 주석 Pitfall 4).
**How to avoid:** 구독 집합의 정본을 SubscriptionHub 에 두고, `Ready` 진입 이벤트 한 곳에서만 재구독. 재구독 경로를 두 벌 만들지 않는다.
**Warning signs:** "재접속 후 새로고침하면 나온다".

### Pitfall 5: 수신 경로 동기 블로킹 → 게이트웨이가 연결을 끊음
**What goes wrong:** 원인 불명의 주기적 연결 종료.
**Why:** 연결당 송신 큐 1024프레임/4MB. Notice 급(OrderResp/계좌)이 큐 가득에서 **연결 종료** 정책이다 [VERIFIED: `Gateway.h:63-75`]. relay 가 수신을 늦추면 서버 큐가 찬다.
**How to avoid:** DMA 콜백에서 DB·압축·동기 JSON 대량 처리 금지. 팬아웃은 비동기 큐 + 배치.
**Warning signs:** ServerMessage 없이 소켓이 조용히 닫힘.

### Pitfall 6: bigint 직렬화 폭발 + 정밀도 손실
**What goes wrong:** `JSON.stringify` 가 던지거나, `Number()` 변환으로 누적거래대금이 틀어진다.
**Why:** `long` → `bigint`. `cum_value` 는 2^53 을 넘길 수 있다(실측 테스트에서 `9007199254740993n` 이 안전범위 밖 판정).
**How to avoid:** 변환 함수 하나(`toNum(v: bigint): number`)에서 `v > BigInt(Number.MAX_SAFE_INTEGER)` 를 검사해 warn 로그 + 클램프하거나, `cum_value` 만 문자열로 내려 UI 가 포맷. 가격·수량은 안전범위 안이라 무해.
**Warning signs:** 거래대금이 음수/이상값.

### Pitfall 7: 취소 주문 수량 0 / 단일 문자 필드 산발 생성
**What goes wrong:** 즉시 거부되거나 엉뚱한 시장으로 주문이 나간다.
**Why:** 취소수량 0 은 전량취소가 아니라 **즉시 거부**(fbs `DirectOrderReq.quantity` 주석). `side`/`market`/`order_type`/`order_condition` 은 서버가 **첫 글자만** 읽는다.
**How to avoid:** D-21 대로 변환 함수 한 곳(`toWireSide`, `toWireMarket`, …). 취소는 미체결 잔량을 `AccountState.unfilled[].unfilled_qty` 에서 읽어 채우고 0 이면 클라이언트에서 막는다.
**Warning signs:** rc≠0 + "수량" 관련 메시지.

### Pitfall 8: `OrderResp.side` 를 취소/정정 통보에서 신뢰
**What goes wrong:** 취소확인이 "매수"로 표시된다.
**Why:** fbs 주석 명시 — 취소·정정 통보에는 매매구분이 없어 브로커가 채울 값이 없다(MockBroker 는 "B" 로 남김).
**How to avoid:** `notice_type` 이 "C"/"M" 이면 매수/매도 대신 "취소"/"정정" 표기.

### Pitfall 9: 주문 5초 타임아웃을 "실패"로 단정
**What goes wrong:** 사용자가 재주문 → 중복 주문.
**Why:** 타임아웃은 "결과를 모른다"이지 "안 나갔다"가 아니다.
**How to avoid:** `dma_orders.status='timeout'` + UI 는 "결과 확인 중 — 미체결 목록을 확인하세요". 재주문 버튼을 비활성.

### Pitfall 10: openconnect 가 기본 경로를 가져감
**What goes wrong:** VM 이 Secret Manager/AR/Supabase 에 못 붙고, ACME 갱신 실패로 며칠 뒤 TLS 가 만료된다. IAP SSH 도 막혀 복구가 어려울 수 있다.
**Why:** 서버가 default route 를 푸시하면 stock vpnc-script 가 그대로 설치한다.
**How to avoid:** Pattern 8 의 `CISCO_SPLIT_INC` 래퍼. 검증은 연결 후 `ip route`(default 가 ens4 인지) + `curl -s ifconfig.me`(VM 공인 IP 유지) + `curl -sI https://secretmanager.googleapis.com`. **선검증 단계에서 반드시 확인**하고, 최초 시도는 IAP SSH 세션 대신 **직렬 콘솔** 또는 `--metadata startup-script` 로 3분 뒤 자동 `systemctl stop` 하는 안전장치를 걸어 두는 것을 권고.
**Warning signs:** 연결 직후 SSH 가 끊김.

### Pitfall 11: e2-micro 1GB 메모리 초과
**Why:** 아래 대략 예산(1024MB 중)

| 구성요소 | 추정 RSS | 근거 |
|----------|----------|------|
| Debian 12 + systemd + sshd + guest agent | 120–180 MB | [ASSUMED] 일반 값 |
| dockerd + containerd | 120–180 MB | [ASSUMED] |
| Caddy | 30–60 MB | [ASSUMED] |
| openconnect | 10–20 MB | [ASSUMED] |
| relay (Node 22, 5 세션 + ws + deflate) | 120–250 MB | [ASSUMED] deflate 컨텍스트가 변수 |
| **합계** | **400–690 MB** | 여유 330–620 MB |
| Ops Agent 추가 시 | **+150–250 MB** | 위험 구간 진입 |

**How to avoid:** ① Ops Agent 대신 Docker `json-file`(`max-size=10m`,`max-file=3`) + Cloud Monitoring **uptime check** 로 알림. ② perMessageDeflate 명시 튜닝(Pattern 6). ③ swap 1GB. ④ `docker run --memory=384m --memory-swap=768m` 로 relay 를 유계화해 OOM 이 호스트 전체가 아니라 컨테이너에서 나게 한다. ⑤ 압박이 실측되면 e2-small(2GB) 로 머신타입만 변경(D-07 허용).
**Warning signs:** `dmesg | grep -i oom`, 컨테이너 재시작 반복.

### Pitfall 12: `gh-radar-vpc` 에 방화벽이 하나도 없어 IAP SSH 조차 안 됨
**Why:** 실측 0개. 인그레스 기본 거부.
**How to avoid:** VM 생성 **전에** 방화벽 3규칙 생성. IAP SSH 는 `35.235.240.0/20` + 사용자에게 `roles/iap.tunnelResourceAccessor` [CITED: docs.cloud.google.com/iap/docs/using-tcp-forwarding]. `gh-radar-deployer` SA 로 SSH 할 것인지 사용자 계정으로 할 것인지 plan 에서 확정.

### Pitfall 13: `stocks.isin` 백필의 ETP 오염
**What goes wrong:** ETF/ETN 행의 `isin` 이 null 로 덮이거나, 최악의 경우 6자 단축코드가 isin 에 들어간다.
**Why:** `fetchEtpBaseInfo.ts` 는 ETP 응답의 `ISU_CD`(=**단축코드 6자**)를 `ISU_SRT_CD` 로 매핑해 반환하고 `ISU_CD` 는 채우지 않는다. `upsertMasters` 는 code 기준 **last-wins** dedup 이고 `masters = [...krxRows, ...etpRows]` 라 ETP 가 뒤에 온다. [VERIFIED: `fetchEtpBaseInfo.ts:78-89`, `index.ts:79`, `upsert.ts:13-14`]
**How to avoid:** `krxToMasterRow` 에서 **`ISU_CD` 가 `/^KR\w{10}$/`(12자) 일 때만** `isin` 을 채운다. 컬럼은 nullable + `CHECK (isin IS NULL OR length(isin)=12)`. `upsertMasters` 는 isin 이 null 인 행에서 기존 값을 지우지 않도록 **부분 업데이트**(별도 upsert) 하거나, dedup 시 isin 을 merge.
**Warning signs:** 백필 후 주식 종목의 isin 이 null.

### Pitfall 14: Vercel env trailing newline
**Why:** 자동 메모리 기록된 기존 사고.
**How to avoid:** `resolveRelayWsUrl()` 에서 `.trim()`(기존 `api.ts:21` 선례) + `vercel env pull` 후 `tail -c1 | xxd -p` 가 `0a` 인지 확인하는 절차를 배포 문서에.

### Pitfall 15: `slopcheck install` 이 실제로 설치한다
**Why:** 이번 세션에서 저장소 루트 `package.json` 에 `ws/flatbuffers/@types/ws` 가 추가되고 npm 방식 `node_modules` 가 생성됨(원복 완료).
**How to avoid:** 격리 디렉터리에서 실행하거나 `slopcheck scan` 사용. 실행 후 `git status` 확인을 절차에 포함.

---

## Code Examples

### 1. 프레이밍 코덱 (Pattern 1)

```ts
// relay/src/dma/codec.ts
// 근거: gh-trade client/Services/DMA/PacketCodec.cs (TryExtract) + server Gateway.h:53
export const HEADER_SIZE = 4;
export const MAX_FRAME_SIZE = 1024 * 1024; // 서버 kMaxRecvBufSize 와 동일 (4MB 는 송신 큐 상한)

export function frame(payload: Uint8Array): Buffer {
  if (payload.length > MAX_FRAME_SIZE) throw new Error(`frame too large: ${payload.length}`);
  const head = Buffer.allocUnsafe(HEADER_SIZE);
  head.writeUInt32LE(payload.length, 0);
  return Buffer.concat([head, Buffer.from(payload)]);
}

export type ExtractResult =
  | { kind: "need-more" }
  | { kind: "desync"; declared: number }         // 상한 초과 = 연결 재수립 신호
  | { kind: "frame"; payload: Buffer; consumed: number };

export function tryExtract(buf: Buffer): ExtractResult {
  if (buf.length < HEADER_SIZE) return { kind: "need-more" };
  const len = buf.readUInt32LE(0);
  if (len > MAX_FRAME_SIZE) return { kind: "desync", declared: len };   // 상한을 먼저
  if (buf.length < HEADER_SIZE + len) return { kind: "need-more" };
  return { kind: "frame", payload: buf.subarray(HEADER_SIZE, HEADER_SIZE + len), consumed: HEADER_SIZE + len };
}

/** 소켓 data 이벤트용 누적 리더. compact 는 절반 이상 소비 시. */
export class FrameReader {
  #buf: Buffer = Buffer.alloc(0);
  push(chunk: Buffer): { frames: Buffer[]; desync: boolean } {
    this.#buf = this.#buf.length === 0 ? chunk : Buffer.concat([this.#buf, chunk]);
    const frames: Buffer[] = [];
    for (;;) {
      const r = tryExtract(this.#buf);
      if (r.kind === "need-more") break;
      if (r.kind === "desync") { this.#buf = Buffer.alloc(0); return { frames, desync: true }; }
      frames.push(Buffer.from(r.payload));           // 뷰가 아니라 복사 — 다음 concat 이 덮어쓴다
      this.#buf = this.#buf.subarray(r.consumed);
    }
    return { frames, desync: false };
  }
}
```

### 2. Envelope 조립 — LoginReq / LivePing / SubscribeQuoteReq

```ts
// relay/src/dma/envelope.ts
// Source: flatc 25.12.19 생성 코드 (본 세션에서 직접 생성·실행 검증)
import * as flatbuffers from "flatbuffers";
import { Envelope } from "../generated/stock-dma/envelope.js";
import { LoginReq } from "../generated/stock-dma/login-req.js";
import { LivePing } from "../generated/stock-dma/live-ping.js";
import { SubscribeQuoteReq } from "../generated/stock-dma/subscribe-quote-req.js";
import { MsgType } from "../generated/stock-dma/msg-type.js";

export function buildLoginReq(userId: string, password: string, broker: "KB"): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const req = LoginReq.createLoginReq(b, b.createString(userId), b.createString(password), b.createString(broker));
  // ⚠ Envelope 에는 createEnvelope() 가 생성되지 않는다 (deprecated 슬롯 때문) — start/add/end 필수
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MsgType.LoginReq);
  Envelope.addLoginReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();                 // C# SizedByteArray() 대응
}

export function buildLivePing(): Uint8Array {
  const b = new flatbuffers.Builder(64);
  const p = LivePing.createLivePing(b, Math.floor(Date.now() / 1000));
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MsgType.LivePing);
  Envelope.addLivePing(b, p);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

export function buildSubscribeQuote(isin: string, exchange: "KRX" | "NXT", subscribe: boolean): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = SubscribeQuoteReq.createSubscribeQuoteReq(b, b.createString(isin), b.createString(exchange), subscribe);
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MsgType.SubscribeQuoteReq);
  Envelope.addSubscribeQuoteReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
```

**실행 검증 출력 (본 세션):**
```
frame bytes = 84  payload len header = 80
msgType = 1 == LoginReq? true
login_req.user_id = alex-radar
login_req.broker  = KB
order_resp slot (미설정) = null
```

### 3. 안전 파싱 + 필드 가드

```ts
// relay/src/dma/envelope.ts (계속)
const MIN_ENVELOPE_SIZE = 8;                 // root offset(4) + vtable soffset(4)
const KNOWN = new Set<number>(Object.values(MsgType).filter((v): v is number => typeof v === "number"));
const DEPTH = 10;

export function tryParse(payload: Buffer): Envelope | null {
  if (payload.length < MIN_ENVELOPE_SIZE) return null;
  try {
    const env = Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(new Uint8Array(payload)));
    const mt = env.msgType();
    if (!KNOWN.has(mt) || mt === MsgType.None) return null;   // ← 예외가 안 나므로 이 검사가 실질 방어선
    return env;
  } catch {
    return null;
  }
}

/** C# TakeCount 동형 — 상한 초과는 warn + 절단. */
function takeCount(n: number, max: number, label: string, log: Logger): number {
  if (n > max) { log.warn({ n, max, label }, "벡터 길이 상한 초과 — 절단"); return max; }
  return n < 0 ? 0 : n;
}

const toNum = (v: bigint, label: string, log: Logger): number => {
  if (v > 9007199254740991n || v < -9007199254740991n) {
    log.warn({ label, v: v.toString() }, "안전 정수 범위 초과 — 정밀도 손실");
  }
  return Number(v);                          // ⚠ JSON.stringify(bigint) 는 TypeError
};

export function readQuote(env: Envelope, log: Logger): WireQuote | null {
  const q = env.quoteState();
  if (!q) return null;
  const isin = q.isin() ?? "";
  const ex = q.exchange() ?? "";
  if (isin.length !== 12 || (ex !== "KRX" && ex !== "NXT")) { log.warn({ isin, ex }, "형식 가드 위반 — 드롭"); return null; }
  const n = takeCount(q.askPricesLength(), DEPTH, "매도호가", log);
  return {
    i: isin, x: ex, snap: q.isSnapshot(),
    p: toNum(q.lastPrice(), "last_price", log),
    cs: (q.changeSign() ?? "").slice(0, 1),          // 원문 1자가 부호 정본 (D-34)
    ap: Array.from({ length: n }, (_, k) => toNum(q.askPrices(k) ?? 0n, "ask", log)),
    et: q.exchangeTime() ?? "",                       // "HHMMSSuuuuuu" — 신선도 원천
    // …
  };
}
```

### 4. ws 서버 — 첫 메시지 인증 + 하트비트

```ts
// relay/src/ws/fanout.ts
import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";

const AUTH_TIMEOUT_MS = 5_000;
const PING_INTERVAL_MS = 30_000;
const BUFFER_LIMIT = 1_000_000;

export function attachWs(server: Server, deps: Deps) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: {                       // D-35 ON — e2-micro 대비 명시 튜닝
      threshold: 1024, concurrencyLimit: 4,
      serverNoContextTakeover: true, clientNoContextTakeover: true,
      serverMaxWindowBits: 12, zlibDeflateOptions: { level: 3, memLevel: 7 },
    },
    maxPayload: 64 * 1024,
  });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket & { isAlive?: boolean; userId?: string }) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });
    ws.on("error", (e) => deps.log.warn({ err: e }, "ws error"));

    const timer = setTimeout(() => ws.close(4401, "auth timeout"), AUTH_TIMEOUT_MS);

    ws.on("message", async (raw) => {
      const msg = deps.parseClientMessage(raw);                       // zod
      if (!msg) return ws.close(4400, "bad message");
      if (!ws.userId) {
        if (msg.t !== "auth") return ws.close(4400, "auth required"); // 인증 전 구독·주문 금지 (D-11)
        clearTimeout(timer);
        const userId = await deps.verifyToken(msg.token);             // supabase.auth.getUser
        if (!userId) return ws.close(4401, "invalid token");
        ws.userId = userId;
        const cred = await deps.credentials.find(userId);             // allowlist = 매핑 행 존재 (D-12)
        if (!cred) return deps.send(ws, { t: "state", s: "unauthorized" });  // 연결은 유지
        return deps.sessions.attach(userId, ws, cred);
      }
      deps.handleAuthed(ws.userId, ws, msg);
    });

    ws.on("close", () => { clearTimeout(timer); if (ws.userId) deps.sessions.detach(ws.userId, ws); });
  });

  const hb = setInterval(() => {
    for (const c of wss.clients) {
      const ws = c as WebSocket & { isAlive?: boolean };
      if (ws.isAlive === false) { ws.terminate(); continue; }         // README 공식 패턴
      ws.isAlive = false; ws.ping();
      if (ws.bufferedAmount > BUFFER_LIMIT) { deps.log.warn("백프레셔 — terminate"); ws.terminate(); }
    }
  }, PING_INTERVAL_MS);
  wss.on("close", () => clearInterval(hb));
}
```
[CITED: github.com/websockets/ws README — isAlive/terminate 하트비트, perMessageDeflate 옵션]

### 5. AES-256-GCM (nonce||tag||ciphertext, AAD = user_id)

```ts
// relay/src/store/credentials.ts  /  scripts/dma-credentials.ts 공용
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export function encryptSecret(plain: string, key: Buffer, userId: string): string {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(Buffer.from(userId, "utf8"));                 // 행 이동 공격 차단
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([nonce, c.getAuthTag(), ct]).toString("base64");   // 12 + 16 + N
}

export function decryptSecret(b64: string, key: Buffer, userId: string): string {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 12 + 16 + 1) throw new Error("cred blob too short");
  const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAAD(Buffer.from(userId, "utf8"));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
```

**실행 검증 (본 세션):** 13자 평문 → base64 56자(raw 41B). AAD 불일치·키 불일치 모두 `Unsupported state or unable to authenticate data` 로 실패. [VERIFIED]

키는 32바이트 랜덤을 base64 로 Secret Manager `gh-radar-dma-cred-key` 에:
```bash
head -c 32 /dev/urandom | base64 | tr -d '\n' | gcloud secrets create gh-radar-dma-cred-key --data-file=-
```

### 6. MsgType 상수 (생성 코드 실측)

```
요청: LoginReq=1 DirectOrderReq=2 UpdateAccountNoReq=3 LivePing=4
      GetAccountStateReq=25 GetSymbolMasterReq=27 GetQuoteReq=28 SubscribeQuoteReq=29 GetTradeTapeReq=32
응답: LoginResp=50 OrderResp=51 OrderConfirm=52 TradeExecution=53 ServerMessage=54 UpdateAccountNoResp=55
      SymbolMasterResp=57 GetQuoteResp=58 QuoteUpdate=59
      GetAccountStateResp=66 AccountStateDelta=67 TradeTapeResp=69 TradeTapePush=71
      MemberStatsResp=74 MemberStatsPush=75  (74/75 는 본 phase 범위 밖)
슬롯 공유: 58/59 → quote_state · 66/67 → account_state · 69/71 → trade_tape (구분은 is_snapshot)
```

### 7. Supabase 마이그레이션 (service-role 전용 테이블 — `kiwoom_tokens` 선례 mirror)

```sql
-- supabase/migrations/2026MMDDHHMMSS_dma_credentials.sql
BEGIN;

CREATE TABLE public.dma_credentials (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dma_user_id      text NOT NULL,
  dma_password_enc text NOT NULL,           -- base64(nonce||tag||ct), AAD = user_id
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dma_credentials ENABLE ROW LEVEL SECURITY;   -- 정책 0개 = default deny (D-18)
REVOKE ALL ON public.dma_credentials FROM PUBLIC;
REVOKE ALL ON public.dma_credentials FROM anon, authenticated;  -- 플랫폼 auto-grant 회귀 방어
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_credentials TO service_role;

COMMIT;
```
[VERIFIED: `supabase/migrations/20260514120100_create_kiwoom_tokens.sql` 동일 패턴 + 자동 메모리 「REVOKE anon/authenticated 명시」]

```sql
-- 2026MMDDHHMMSS_dma_orders.sql  (제안 스키마)
CREATE TABLE public.dma_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_no   text NOT NULL,
  isin         text NOT NULL CHECK (length(isin) = 12),
  stock_code   text REFERENCES public.stocks(code) ON DELETE SET NULL,
  exchange     text NOT NULL CHECK (exchange IN ('KRX','NXT')),
  market       text NOT NULL CHECK (market IN ('K','Q')),
  side         text NOT NULL CHECK (side IN ('B','S')),
  order_type   text NOT NULL CHECK (order_type IN ('N','C')),        -- v1: 신규/취소만
  org_order_no text,                                                 -- 취소 시 필수
  qty          integer NOT NULL CHECK (qty > 0),
  price        integer NOT NULL CHECK (price > 0),
  order_no     text,
  status       text NOT NULL DEFAULT 'requested'
               CHECK (status IN ('requested','accepted','rejected','filled','partially_filled','cancelled','timeout')),
  result_code  integer,
  notice_type  text,                                                 -- A/E/C/M/R 원문
  message      text,
  filled_qty   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dma_orders_user_created ON public.dma_orders (user_id, created_at DESC);
CREATE INDEX idx_dma_orders_order_no     ON public.dma_orders (order_no) WHERE order_no IS NOT NULL;
-- RLS/REVOKE/GRANT 는 dma_credentials 와 동일 (service_role only)
```

```sql
-- 2026MMDDHHMMSS_stocks_isin.sql
ALTER TABLE public.stocks ADD COLUMN isin text;
ALTER TABLE public.stocks ADD CONSTRAINT stocks_isin_len CHECK (isin IS NULL OR length(isin) = 12);
CREATE UNIQUE INDEX idx_stocks_isin ON public.stocks (isin) WHERE isin IS NOT NULL;
-- 기존 anon/authenticated SELECT 정책은 컬럼 단위가 아니므로 자동 노출됨 (공개 마스터라 무해)
```

### 8. 가짜 서버 소켓 테스트 (vitest)

```ts
// relay/src/dma/__tests__/codec.test.ts
import { describe, it, expect } from "vitest";
import { createServer, connect, type Server } from "node:net";
import { frame, FrameReader } from "../codec.js";

describe("FrameReader", () => {
  it("두 프레임이 붙어서 와도 분리한다", () => {
    const r = new FrameReader();
    const a = frame(new Uint8Array([1, 2, 3])), b = frame(new Uint8Array([4, 5]));
    const { frames } = r.push(Buffer.concat([a, b]));
    expect(frames.map((f) => [...f])).toEqual([[1, 2, 3], [4, 5]]);
  });

  it("프레임이 잘려서 와도 다음 청크에서 완성한다", () => {
    const r = new FrameReader();
    const f = frame(new Uint8Array([9, 9, 9, 9]));
    expect(r.push(f.subarray(0, 5)).frames).toHaveLength(0);
    expect(r.push(f.subarray(5)).frames).toHaveLength(1);
  });

  it("1MB 초과 길이 헤더는 desync 로 보고한다", () => {
    const head = Buffer.alloc(4); head.writeUInt32LE(2 * 1024 * 1024, 0);
    expect(new FrameReader().push(head).desync).toBe(true);
  });
});

// tests/dma-client.test.ts — 가짜 게이트웨이
function fakeGateway(onFrame: (mt: number, payload: Buffer) => Buffer[] | void): Promise<Server> { /* net.createServer */ }
// 시나리오: ① LoginReq → LoginResp(success) ② 30초 후 LivePing 수신 확인(fake timers)
//           ③ 서버가 socket.destroy() → 백오프 재접속 + 재로그인 + 재구독 관측
//           ④ 쓰레기 프레임 1개 주입 → 드롭 카운터 +1, 연결 유지
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 핸드오프: "단일 radar 세션 · 종목당 구독 1개" | **사용자별 DMA 세션** + 세션 단위 참조계수 | 15-CONTEXT D-13 | 구독 키에 userId 포함. gh-trade 17 의존이 생김 |
| 핸드오프: WsFanout 이 `jose` 로 JWT 검증 | `supabase.auth.getUser` 네트워크 검증 | 15-CONTEXT D-10 | jose 의존 제거, revoke 즉시 반영 |
| 핸드오프: "KB 확인 3건 대기" | kbs124 로 **선검증**(D-03) | 15-CONTEXT | 초기 wave 에 [BLOCKING] 체크포인트 |
| 핸드오프: 프레임 상한 4MB | **1MB** | 본 리서치 실측 | 서버 `kMaxRecvBufSize` / C# 상수 일치 |
| 핸드오프: VPC 커넥터 | **Direct VPC Egress**(기존 설정 재사용) | 15-CONTEXT D-08 / 실측 | 커넥터 신설 없음, 방화벽 source-ranges |
| 클라 `UpdateAccountNoReq(mode "2")` 조회 왕복 | 제거 — `LoginResp.accounts` 가 원천 | gh-trade 17 D-11 | relay 도 mode "2" 를 쓰지 않는다 |
| `TradeExecution(53)` 로 체결 통보 | **`OrderResp(51)` `notice_type="E"`** | gh-trade Phase 16 | 53 은 스키마 정합용. 53 파싱 경로를 만들지 않는다 (fbs 주석 명시) |
| flatc `--ts` 가 모든 테이블에 `createX` 생성 | Envelope 은 deprecated 슬롯 때문에 **미생성** | flatc 25.x | start/add/end 조립 필수 |

**Deprecated/outdated:**
- `MsgType` 12/13/22/23/30/31/62/63/70 — 재사용 금지 봉인. relay 는 참조하지 않는다.
- `Envelope.reserved_after_hour` / `reserved_after_hour_auction` — deprecated. 생성 코드에 접근자 없음. `sync-relay-schema.sh` 가드 1 이 이 봉인을 검사한다.
- `OrderResp.slot_id`, `TradeExecution.slot_id`, `ServerMessage.slot_id` — deprecated.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | KB VPN 서버가 default route 를 푸시할 것이므로 split-tunnel 이 필요하다 | Pattern 8 / Pitfall 10 | 실제로 split-include 만 푸시한다면 래퍼가 불필요(무해). 반대로 푸시하는데 대비 안 하면 VM 이 고립됨 |
| A2 | kbs124 계정이 GCE 외부 IP 에서 접속 가능하고 Mac 세션과 동시 접속된다 | Pattern 8 / D-03 | 불가하면 phase 전체 재설계(전용 계정 발급 or Mac 상시 릴레이). **D-03 선검증이 이 가정을 검증하는 목적** |
| A3 | e2-micro 1GB 로 Docker+Node+Caddy+openconnect 가 동작한다 | Pitfall 11 | OOM 반복 시 e2-small 로 변경(D-07 허용). 비용 +$7/월 |
| A4 | GCE Debian 12 이미지에 gcloud 가 있는지 불확실 | Pattern 7 | 없어도 메타데이터+REST 경로로 동작하도록 설계했으므로 영향 없음 |
| A5 | gh-trade Phase 17 이 이 phase 진행 중 완료된다 | D-25 / Pitfall 1 | 지연 시 계좌·주문 wave 가 무기한 대기 → RELAY-01 의 시세 부분만 먼저 완료 처리하는 분할이 필요 |
| A6 | `dma.jx1.io` A 레코드를 사용자가 설정한다 | D-06 | 미설정 시 Let's Encrypt 발급 불가 → Caddy 가 재시도 루프. rate limit 주의 |
| A7 | Docker `json-file` + uptime check 조합이 알림 요구를 충족한다 | Pitfall 11 / Validation | 컨테이너 내부 에러(예: 재로그인 거부)는 uptime check 로 안 잡힌다 → relay 가 `/healthz` 를 degraded 로 내려 uptime check 가 실패하게 설계해야 함 |
| A8 | 5명 규모에서 permessage-deflate CPU 가 문제 되지 않는다 | Pattern 6 | e2-micro 는 공유 코어(0.25 baseline) — 버스트 크레딧 소진 시 지연. 측정 필요 |
| A9 | `stocks` 마스터의 `ISU_CD` 가 모든 주식 행에 채워져 있다 | Pitfall 13 / D-28 | 일부 종목에 없으면 그 종목은 주문·구독 불가 → 백필 후 null 카운트를 INV 로 검증 |
| A10 | 주문 상관키로 `order_no` 가 충분하다(접수 전 거부 제외) | D-22 | 동일 사용자가 같은 종목·계좌·가격으로 1초 내 2건을 내면 접수 전 거부 상관이 모호. 요청 UUID 를 relay 가 보관하는 편이 안전 |

---

## Open Questions

1. **`LoginResp.accounts` 부재 — 초반 wave 의 계좌 취급**
   - 알고 있는 것: 현행 fbs 에 필드 없음(실측). gh-trade 17 D-19 가 append 예정. mock 무인증 로그인은 빈 벡터.
   - 불명확한 것: 17 완료 시점. 재동기화 후 생성물 diff 규모(LoginResp 1필드 + AccountEntry 1테이블 → 생성 .ts 39→40 예상, `sync-relay-schema.sh` 가 고아 삭제·개수 보고).
   - 권고: plan 에 `[BLOCKING] gh-trade 17 완료 + sync-relay-schema.sh 재실행 + 생성물 재커밋` 태스크를 계좌 wave 첫 항목으로 명시. 그 전 wave 는 `accounts: []` 가정으로 Ready 진입.

2. **선검증 실패 시 phase 진로**
   - 알고 있는 것: 실패 시 자동 재시도 금지, KB 문의 전환(D-03).
   - 불명확한 것: 문의 소요 기간. 그동안 코드 wave 를 계속할지.
   - 권고: 선검증을 **인프라 wave 의 첫 태스크**로 두되 **코드 wave 와 병렬 진행 가능**하도록 의존을 끊는다(mock 서버로 전부 검증 가능, D-40).

3. **관리자 자격증명 등록 스크립트의 키 접근 경로**
   - 알고 있는 것: 로컬에서 Secret Manager 의 키를 읽어 암호화 후 upsert(D-18).
   - 불명확한 것: 로컬 실행 주체가 `gh-radar-deployer` SA 인지 사용자 계정인지. deployer SA 에 `secretmanager.secretAccessor` 가 있는지 미확인(리서치는 IAM 정책 조회를 하지 않았다).
   - 권고: `setup-relay-iam.sh` 에서 deployer SA 에도 해당 secret 접근 권한을 부여하거나, 스크립트가 `gcloud secrets versions access` 실패 시 명확한 안내를 출력.

4. **`/healthz` 노출 범위**
   - 알고 있는 것: 내부 포트 `/healthz`(Discretion). uptime check 는 공인 443 이 필요.
   - 불명확한 것: 공개 `/healthz` 에 세션 수·VPN 상태를 넣으면 정보 노출인가.
   - 권고: 공개는 `{status:"ok"|"degraded", vpn:bool, dma:bool}` 수준(계좌번호·사용자 수 미포함), 상세는 내부 포트 전용.

5. **토큰 1시간 만료 처리**
   - 알고 있는 것: Discretion. 주문 REST 는 매 요청 requireAuth 를 거친다.
   - 불명확한 것: 장중 6시간 연속 접속 시 wss 를 그대로 둘지.
   - 권고: v1 은 연결 시 1회 검증 유지 + 브라우저가 토큰 갱신 시 `{t:"auth"}` 재전송을 허용(멱등). 서버측 강제 재인증은 deferred.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `flatc` | 생성물 동기화 (D-26) | ✓ | **25.12.19** — 요구값 정확히 일치 | 없음(가드 2 가 버전 불일치 시 중단) |
| Node.js | relay 런타임·빌드 | ✓ | v22.22.0 | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | ⚠ Dockerfile 은 pnpm@10 고정 — 동일 유지 |
| Docker | 이미지 빌드 | ✓ | 29.4.0 | — |
| gcloud | VM·방화벽·Secret·모니터링 | ✓ | 558.0.0 (deployer SA 인증 확인) | — |
| supabase CLI | `supabase db push` | ✓ | 2.75.0 (v2.116.0 권고 알림) | — |
| openconnect (Mac) | 참조용 | ✓ | /opt/homebrew/bin | 로컬 연결은 **금지**(D-27) |
| `/usr/local/sbin/kbvpn-connect` | 인자 참조 | ✓ | 읽기 완료(비밀값 미기록) | — |
| gh-trade 저장소 | fbs·C# 기준구현·mock 서버·sync 스크립트 | ✓ | HEAD `14bd025` | — |
| gh-trade mock 서버 빌드 | 로컬 통합 검증(D-40) | 미확인 | `server/scripts/build.sh` 존재 | 빌드 실패 시 순수 `net.createServer` 스텁으로 대체 가능 |
| `slopcheck` | 패키지 검증 | ✓ (pip3 설치함) | 0.6.1 | ⚠ `install` 서브커맨드가 실제 설치 수행 |
| GCE VM `radar-gw` | 전 인프라 | ✗ | — | **없음 — 생성 필요(RELAY-03)** |
| `gh-radar-vpc` 방화벽 | IAP SSH·443·내부포트 | ✗ (0개) | — | **없음 — 3규칙 생성 필요** |
| 외부 고정 IP(relay 용) | DNS·TLS | ✗ | — | **없음 — 신규 예약 필요** (기존 `gh-radar-static-ip` 는 NAT 용, 재사용 금지) |
| Secret `gh-radar-dma-cred-key` | 자격증명 복호 | ✗ | — | **없음 — 생성 필요** |
| Secret `gh-radar-relay-order-secret` | 주문 공유 비밀 | ✗ | — | **없음 — 생성 필요** |
| Secret `gh-radar-kb-vpn-password` | openconnect | ✗ | — | **없음 — 생성 필요** |
| SA `gh-radar-relay-sa` | VM 신원 | ✗ | — | **없음 — 생성 필요** |
| DNS `dma.jx1.io` A 레코드 | Caddy TLS | ✗ | — | **없음 — 사용자 작업 [BLOCKING]** |
| gh-trade `users.toml` (120 배포) | 실서버 로그인 | ✗ | — | **gh-trade 17 의존 — mock 무인증으로 대체 검증** |
| `vpn-slice` | split-tunnel(2안) | ✗ (Debian repo 부재) | PyPI 0.16.1 | 1안 `CISCO_SPLIT_INC` 래퍼(무의존) |
| Ops Agent | Cloud Logging | ✗ | — | Docker `json-file` + uptime check |

**Missing dependencies with no fallback (실행 차단):**
- GCE VM·방화벽·고정 IP·SA·Secret 4종 — RELAY-03 wave 가 만든다.
- `dma.jx1.io` A 레코드 — **사용자 체크포인트**. IP 확보 후 전달 → 등록 확인까지 Caddy 배포 불가.
- gh-trade Phase 17 — 계좌·주문 wave [BLOCKING].
- kbs124 VPN 접속 가능성 — D-03 선검증. 실패 시 KB 문의.

**Missing dependencies with fallback:**
- `vpn-slice` → `CISCO_SPLIT_INC` 래퍼
- Ops Agent → json-file + uptime check
- gh-trade mock 서버 빌드 → 순수 TS 스텁 게이트웨이

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (relay) | vitest `^4.1.4` (server 와 동일 버전 고정) |
| Framework (server) | vitest `^4.1.4` — `server/vitest.config.ts` |
| Framework (webapp) | vitest + @testing-library/react + Playwright(E2E, baseURL `http://localhost:3100`) |
| Config file | `relay/vitest.config.ts` — **없음 → Wave 0** (server 설정 복제: `include: ["tests/**/*.test.ts","src/**/*.test.ts"]`) |
| Quick run (relay) | `pnpm --filter @gh-radar/relay test` |
| Quick run (server) | `pnpm --filter @gh-radar/server test` |
| Quick run (webapp) | `pnpm --filter webapp test` |
| Full suite | 위 3종 + `pnpm --filter webapp exec playwright test orderbook.spec` + `pnpm typecheck` |
| 인프라 검증 | `bash scripts/smoke-relay.sh` (INV-1~8) |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| RELAY-01 | 프레임 결합/분할/1MB 초과 desync | unit | `pnpm --filter @gh-radar/relay test codec` | ❌ Wave 0 |
| RELAY-01 | 불량·잘린 프레임 드롭 + 카운터, 연결 유지 | unit | `pnpm --filter @gh-radar/relay test envelope` | ❌ Wave 0 |
| RELAY-01 | 필드 상한 클램프(호가 10단·테이프·미체결) | unit | `pnpm --filter @gh-radar/relay test envelope` | ❌ Wave 0 |
| RELAY-01 | bigint→Number 변환 + 안전범위 경고 | unit | `pnpm --filter @gh-radar/relay test envelope` | ❌ Wave 0 |
| RELAY-01 | 세션 상태기계 Idle→…→Ready, 5초 타임아웃, generation | unit (가짜 net 서버) | `pnpm --filter @gh-radar/relay test session` | ❌ Wave 0 |
| RELAY-01 | 30초 LivePing 송신(fake timers) | unit | `pnpm --filter @gh-radar/relay test dma-client` | ❌ Wave 0 |
| RELAY-01 | 단절→백오프 재접속→재로그인→재구독, 거부 시 루프 중단 | unit | `pnpm --filter @gh-radar/relay test dma-client` | ❌ Wave 0 |
| RELAY-01 | 참조계수 0→1 구독 / 1→0 해제 / 스냅샷 캐시 즉시응답 | unit | `pnpm --filter @gh-radar/relay test hub` | ❌ Wave 0 |
| RELAY-01 | 5초 미인증 close(4401), 인증 전 sub close, 매핑 없으면 unauthorized 프레임 | unit (ws 클라) | `pnpm --filter @gh-radar/relay test fanout` | ❌ Wave 0 |
| RELAY-01 | 다중 탭 팬아웃 + bufferedAmount 백프레셔 terminate | unit | `pnpm --filter @gh-radar/relay test fanout` | ❌ Wave 0 |
| RELAY-01 | `dma_credentials` AES 왕복 + AAD/키 불일치 실패 | unit | `pnpm --filter @gh-radar/relay test credentials` | ❌ Wave 0 |
| RELAY-01 | webapp `useRelaySocket` 재접속·스냅샷 캐시·unsub | unit | `pnpm --filter webapp test relay-socket` | ❌ Wave 0 |
| RELAY-01 | 호가창 렌더(10단·거래소 토글·상태 배지·권한 없음) | component | `pnpm --filter webapp test orderbook` | ❌ Wave 0 |
| RELAY-01 | 브라우저 wss 왕복(로컬 relay + 스텁 게이트웨이) | e2e | `playwright test orderbook.spec` | ❌ Wave 0 |
| RELAY-02 | 주문 형식 검사(ISIN/수량/가격/exchange/side/account) | unit | `pnpm --filter @gh-radar/server test orders` | ❌ Wave 0 |
| RELAY-02 | 미인증 401 / allowlist 없음 403 / 세션 없음 409 | unit | `pnpm --filter @gh-radar/server test orders` | ❌ Wave 0 |
| RELAY-02 | 첫 OrderResp 5초 대기 + 타임아웃 매핑 | unit (relay stub) | `pnpm --filter @gh-radar/server test orders` | ❌ Wave 0 |
| RELAY-02 | 취소 수량 0 즉시 거부 · org_order_no 필수 | unit | `pnpm --filter @gh-radar/relay test order-api` | ❌ Wave 0 |
| RELAY-02 | 공유 비밀 헤더 불일치 401 | unit | `pnpm --filter @gh-radar/relay test order-api` | ❌ Wave 0 |
| RELAY-02 | `OrderResp` E/C 를 주문자 wss 로만 푸시 + `dma_orders` update | unit | `pnpm --filter @gh-radar/relay test order-api` | ❌ Wave 0 |
| RELAY-02 | mock 브로커 가격 0 거부 경로 | integration (수동/스크립트) | mock 서버 + `curl` — 결과를 SUMMARY 기록 | ❌ Wave 0 |
| RELAY-02 | `stocks.isin` 백필 후 null 카운트 0(주식 한정) | integration | `smoke-relay.sh --check-isin` | ❌ Wave 0 |
| RELAY-03 | VM RUNNING · 방화벽 3규칙 · 고정 IP 결선 | infra INV | `bash scripts/smoke-relay.sh` INV-1~3 | ❌ Wave 0 |
| RELAY-03 | VPN 터널 활성 + **split-tunnel 유지**(default route 가 ens4) | infra INV | `smoke-relay.sh` INV-4 (IAP SSH 원격 명령) | ❌ Wave 0 |
| RELAY-03 | `https://dma.jx1.io/healthz` 200 + 유효 TLS | infra INV | `smoke-relay.sh` INV-5 | ❌ Wave 0 |
| RELAY-03 | wss 인증 왕복(잘못된 토큰 4401 / 정상 상태 프레임) | infra INV | `smoke-relay.sh` INV-6 (node 원라이너) | ❌ Wave 0 |
| RELAY-03 | 내부 포트가 **공인망에서 닫혀 있음** | infra INV | `smoke-relay.sh` INV-7 (`nc -z -w3 <공인IP> 8091` 실패해야 PASS) | ❌ Wave 0 |
| RELAY-03 | Cloud Monitoring 알림 정책 존재 + 채널 결선 | infra INV | `smoke-relay.sh` INV-8 | ❌ Wave 0 |
| RELAY-03 | `sync-relay-schema.sh --check` 무변경 | 정합 | `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check` | ✅ 스크립트 존재 |

### Sampling Rate

- **Per task commit:** 해당 패키지 quick run (`pnpm --filter <pkg> test`) + `pnpm typecheck`
- **Per wave merge:** relay+server+webapp 단위 테스트 전부 + `sync-relay-schema.sh --check` 무변경
- **인프라 wave:** `smoke-relay.sh` 전 INV green (배포 직후 1회 + 다음 날 1회 — 인증서 갱신·VPN 지속성 확인)
- **Phase gate:** 전 단위 테스트 green + Playwright `orderbook.spec` green + `smoke-relay.sh` INV 8/8 + mock 브로커 주문 거부 경로 증거 → `/gsd:verify-work`
- **실서버 검증:** D-27 — 사용자 지시 시에만, 별도 체크포인트로 분리

### Wave 0 Gaps

- [ ] `relay/vitest.config.ts` — server 설정 복제
- [ ] `relay/tests/helpers/fake-gateway.ts` — `net.createServer` 기반 스텁(로그인 응답·시세 푸시·연결 강제 종료·쓰레기 프레임 주입)
- [ ] `relay/tests/helpers/ws-client.ts` — 인증 왕복 헬퍼
- [ ] `relay/src/dma/__tests__/codec.test.ts`
- [ ] `relay/src/dma/__tests__/envelope.test.ts`
- [ ] `relay/tests/dma-client.test.ts` · `relay/tests/session.test.ts`
- [ ] `relay/tests/hub.test.ts` · `relay/tests/fanout.test.ts` · `relay/tests/order-api.test.ts` · `relay/tests/credentials.test.ts`
- [ ] `server/tests/routes/orders.test.ts`
- [ ] `webapp/src/lib/__tests__/relay-socket.test.ts`
- [ ] `webapp/src/components/stock/__tests__/orderbook.test.tsx`
- [ ] `webapp/e2e/specs/orderbook.spec.ts` (로컬 relay + 스텁 게이트웨이 기동 픽스처 포함)
- [ ] `scripts/smoke-relay.sh` (INV-1~8, `smoke-intraday-sync.sh` 의 `check()` 패턴)
- [ ] 프레임워크 설치: **불요** — vitest/Playwright 기설치. relay 워크스페이스에 vitest devDependency 추가만

---

## Security Domain

`security_enforcement` 키가 `.planning/config.json` 에 없음 → 활성으로 간주(absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `supabase.auth.getUser(jwt)` — REST(requireAuth)·wss 양쪽. 자체 인증 로직 금지. DMA 로그인 비밀번호는 **KB 게이트웨이 인증**으로 gh-radar 인증과 별개 |
| V3 Session Management | yes | Supabase access token(1h). relay 세션은 userId 키 인메모리 + 마지막 wss 종료 5분 뒤 소멸(D-15). close 코드 4400/4401 로 실패 사유 구분 |
| V4 Access Control | yes | allowlist = `dma_credentials` 행 존재(D-12). 주문은 `account_no ∈ 그 사용자 세션 계좌 목록`(D-20). `dma_orders` 조회는 `WHERE user_id` 명시 필터. 체결 푸시는 **주문자 소켓에만** |
| V5 Input Validation | yes | zod — wss 수신 메시지, 내부 HTTP 바디, REST 바디. ISIN 정규식, exchange/side/order_type 화이트리스트, 정수 범위. **FlatBuffers 수신도 신뢰 경계**(필드 상한 가드) |
| V6 Cryptography | yes | AES-256-GCM(`node:crypto`), 12B 랜덤 nonce, AAD=user_id, 32B 키는 Secret Manager. TLS 는 Caddy/Let's Encrypt. **자체 암호 구현 금지** |
| V7 Error Handling & Logging | yes | 에러 envelope `{error:{code,message}}`. pino redact 에 `*.password`, `*.dma_password_enc`, `*.token`, `req.headers.authorization`, `*.X-Relay-Secret`, `*.DMA_CRED_KEY`, `*.RELAY_ORDER_SECRET` 추가. **VPN 비밀번호는 어떤 로그에도 미기록** |
| V8 Data Protection | yes | 평문 DMA 비밀번호는 **세션 객체 메모리에만**. 파일·DB·로그 미기록. Cloud Run 은 AES 키 미보유(D-19). VPN cred 는 tmpfs 0600 + 종료 시 삭제 |
| V12 Files & Resources | partial | 파일 업로드 없음. `maxPayload` 64KB, `express.json({limit:"16kb"})` |
| V13 API & Web Service | yes | 내부 HTTP 는 **서브넷 출발지 + 공유 비밀 헤더** 이중. 9100·8091 공인 노출 금지(INV-7 이 검증) |

### Known Threat Patterns for {Node relay + FlatBuffers TCP + ws + GCE/VPN}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 타인 계좌로 주문(IDOR) | Elevation of Privilege | `account_no` 를 그 사용자 세션의 계좌 목록과 대조(D-20). 세션은 userId 키 |
| 타인 체결·잔고 정보 수신 | Information Disclosure | 팬아웃 대상은 **그 userId 의 소켓 집합**만. 전역 브로드캐스트 경로를 만들지 않는다 |
| 인증 없는 wss 구독 | Spoofing | 첫 메시지 인증 + 5초 타이머 + 인증 전 메시지 close(D-11) |
| 토큰 로그·URL 노출 | Information Disclosure | 쿼리스트링 미사용, Caddy 로그는 URI 만, pino redact |
| 자격증명 DB 유출 | Information Disclosure | AES-GCM + 키 분리(Secret Manager) + RLS 정책 0개 + REVOKE anon/authenticated |
| 내부 주문 포트 직접 호출 | Spoofing / Elevation | 방화벽 `--source-ranges=10.10.0.0/26`(태그 불가) + `X-Relay-Secret` 상수시간 비교(`crypto.timingSafeEqual`) |
| 악성/손상 FlatBuffer 프레임 | Tampering / DoS | 1MB 상한 + 최소 크기 + msg_type 화이트리스트 + 필드 상한 클램프 + 드롭 카운터 |
| 느린 클라이언트로 relay 메모리 고갈 | DoS | `bufferedAmount` 임계 terminate + `maxPayload` + 컨테이너 `--memory` 유계 |
| DMA 수신 지연 → 게이트웨이 강제 종료 | DoS(자기유발) | 수신 경로 논블로킹, DB 쓰기 비동기 큐 |
| 반복 로그인 실패로 KB 계정 잠금 | DoS(자기유발) | systemd `StartLimitBurst=5/1h`, 재접속 상한 10, 서버 거부 시 루프 중단, 선검증 ≤3회 |
| VPN 라우팅 탈취로 관리 경로 상실 | DoS | split-tunnel 강제 + 라우팅 INV + 초기 시도에 자동 중지 안전장치 |
| 공인 IP 스캔으로 내부 포트 발견 | Information Disclosure | INV-7 이 외부에서 8091 닫힘을 능동 검증 |
| Let's Encrypt rate limit 소진 | DoS | DNS A 레코드 확인 **후** Caddy 기동. 실패 반복 시 staging CA 로 검증 |
| 잘못된 값의 주문(오주문) | (안전성) | 브라우저 확인 다이얼로그(D-20) + 형식 검사 + `dma_orders` 감사 로그. **서버 한도 없음은 사용자 결정** |
| 로그에 계좌번호 평문 | Information Disclosure | 로그의 `account_no` 는 마스킹(뒤 4자리) 권고 |

---

## Sources

### Primary (HIGH confidence)

- **gh-trade 저장소 직접 읽기** (`/Users/alex/repos/gh-trade`, HEAD `14bd025`)
  - `server/src/protocol/StockDMA.fbs` (852줄) — MsgType·전 테이블·Envelope 슬롯 규약. **`accounts`/`AccountEntry` 부재 확인**
  - `server/src/net/Gateway.h:53,63-75` — `kMaxRecvBufSize=1MB`, `kSendQueueMaxFrames=1024`, `kSendQueueMaxBytes=4MB`, MsgClass Notice/Broadcast 정책
  - `server/config/server.toml` — port 9100, `client_idle_timeout_sec=90`, keepalive, `[broker] name="mock"`
  - `server/scripts/sync-relay-schema.sh` — 가드 3종, `--check`, mirror·고아 삭제, SYNC MARKER CRLF 규약, `RELAY=../../gh-radar/relay`
  - `client/Services/DMA/PacketCodec.cs` — `TryExtract`, `MAX_FRAME_SIZE=1MB`, `MIN_ENVELOPE_SIZE=8`
  - `client/Services/DMA/Client.cs:45,52,58,296,1360-1560,1963-2352,2563-2694` — 수신 루프, 드롭 정책, `PING_INTERVAL_MS=30000`, `NoDelay`, `TakeCount`, `MAX_RECONNECT_ATTEMPTS=10`
  - `client/Services/DMA/Session.cs:60-105,616` — 5초 타임아웃, generation, bootPhase, 계좌 대조
  - `client/Services/DMA/EventArgs.cs:462-482` — SessionState 6종 + 라벨 정본
  - `.planning/phases/17-dma-login-auth-user-accounts/17-CONTEXT.md` — D-11/D-12/D-16/D-17/D-19 계약
- **gh-radar 코드베이스 직접 읽기** — `server/src/middleware/require-auth.ts`, `server/src/services/supabase.ts`, `server/src/logger.ts`, `server/src/config.ts`, `server/src/app.ts`, `server/src/errors.ts`, `server/Dockerfile`, `server/tsconfig.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `scripts/deploy-server.sh`, `scripts/deploy-intraday-sync.sh`, `scripts/smoke-intraday-sync.sh`, `ops/alert-intraday-sync-failure.yaml`, `workers/master-sync/src/{index.ts,krx/fetchBaseInfo.ts,krx/fetchEtpBaseInfo.ts,pipeline/{map,upsert}.ts}`, `supabase/migrations/{20260415120000,20260416120000,20260514120100,20260702170000}*.sql`, `webapp/src/lib/{api.ts,chat-sse.ts,auth-context.tsx}`, `webapp/src/components/stock/stock-detail-client.tsx`, `webapp/src/styles/globals.css`, `webapp/playwright.config.ts`, `dev.sh`
- **본 세션 실행 검증** — flatc 25.12.19 로 `StockDMA.fbs` → TS 40파일 생성, TypeScript(NodeNext) 컴파일, Node 22 실행: Envelope 조립/파싱 왕복, bigint 확인, `JSON.stringify(bigint)` 예외, 잘린 버퍼 무예외 손상, Verifier 부재, AES-256-GCM 왕복·AAD/키 불일치 실패
- **GCP 읽기 전용 조회** (`gh-radar-deployer` SA) — instances/firewall-rules/addresses/subnets/secrets/run services/artifacts/monitoring channels/iam service-accounts/machine-types/images/zones
- **npm registry** — `ws` 8.21.3, `flatbuffers` 25.9.23, `@types/ws` 8.18.1, repository URL, postinstall 부재, 주간 다운로드
- **slopcheck 0.6.1** — ws/flatbuffers/@types/ws 전부 `[OK]`

### Secondary (MEDIUM confidence)

- github.com/websockets/ws README — perMessageDeflate 옵션·메모리 경고, isAlive/terminate 하트비트 패턴
- caddyserver.com/docs/automatic-https — HTTP-01(80) vs TLS-ALPN-01(443), 80 비필수
- caddyserver.com/docs/install — Debian apt 설치 절차
- caddyserver.com/docs/v2-upgrade, /docs/caddyfile/directives/reverse_proxy — WebSocket 자동 통과, 리로드 시 스트림 종료·`stream_close_delay`
- docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc — Direct VPC egress 출발지 = 서브넷 범위, 최소 /26, 네트워크 태그 미지원
- docs.cloud.google.com/iap/docs/using-tcp-forwarding — `35.235.240.0/20`, `roles/iap.tunnelResourceAccessor`
- packages.debian.org/bookworm/openconnect — 9.01-3
- pypi.org/pypi/vpn-slice — 0.16.1 / sources.debian.org 검색 0건(Debian 부재)
- docs.docker.com/engine/logging/drivers/gcplogs/ — 메타데이터 기반 자격증명, 옵션
- docs.cloud.google.com/stackdriver/docs/solutions/agents/ops-agent — Fluent Bit + OTel 구성

### Tertiary (LOW confidence — 검증 필요)

- gist.github.com/stefancocora/686bbce938f27ef72649a181e7bd0158 — openconnect split-tunnel `CISCO_SPLIT_INC` 패턴 (커뮤니티 문서. **VM 선검증에서 실증 필요**)
- e2-micro 상의 컴포넌트별 RSS 추정치 — 일반 경험값. **실측으로 대체해야 함**
- GCE Debian 12 공개 이미지의 gcloud 사전 설치 여부 — 확정 불가. 무의존 경로로 우회 설계

---

## Metadata

**Confidence breakdown:**
- 프로토콜·생성 코드·프레이밍: **HIGH** — fbs·C# 원문 + flatc 산출물 직접 생성·실행 검증
- 표준 스택(ws/flatbuffers/Caddy): **HIGH** — 레지스트리 실측 + 공식 문서 + slopcheck
- gh-radar 통합 지점: **HIGH** — 전 파일 직접 읽음
- GCP 현황·프로비저닝 명령: **HIGH**(현황) / **MEDIUM**(명령 초안 — 실행 미검증)
- openconnect split-tunnel: **MEDIUM-LOW** — 서버 푸시 라우트를 알 수 없어 선검증 전엔 확정 불가
- e2-micro 메모리 예산: **LOW-MEDIUM** — 추정치. 배포 후 실측 필요
- gh-trade 17 완료 시점: **정보 없음** — 외부 저장소 일정

**Research date:** 2026-09-05
**Valid until:** 2026-10-05 (npm/Caddy/GCP 는 안정) — 단 **gh-trade `StockDMA.fbs` 는 변경 시 즉시 무효**. 계좌·주문 wave 착수 전 `sync-relay-schema.sh --check` 로 재확인할 것.

---

## RESEARCH COMPLETE

**Phase:** 15 - DMA 중계 서버(relay) — KB gh-trade-server 호가 10단 시세 wss 팬아웃 + 주문 릴레이
**Confidence:** HIGH (프로토콜·스택·통합 지점) / MEDIUM (VPN 라우팅·VM 메모리)

### Key Findings

1. **`LoginResp.accounts` / `AccountEntry` 가 gh-trade 정본 스키마에 아직 없다** (커밋 14bd025 실측). Phase 17 은 계획 단계. D-25 의 [BLOCKING] 게이트는 가정이 아니라 확인된 사실이며, 계좌·주문 wave 는 생성 코드에 접근자가 없어 **작성 자체가 불가능**하다.
2. **프레임 상한은 4MB 가 아니라 1MB.** 서버 `kMaxRecvBufSize`·C# `MAX_FRAME_SIZE` 모두 1MB이고, 4MB 는 서버 *송신 큐* 바이트 상한이다.
3. **JS FlatBuffers 는 Verifier 가 없을 뿐 아니라, 잘린 버퍼가 예외 없이 깨진 값을 반환한다**(직접 실행 확인 — `userId()` 가 `"al"`). `try/catch` 는 충분조건이 아니며 C# `TakeCount` 동형 필드 가드 이식이 필수다. 또 `Envelope` 은 union 이 아닌 table 이고 flatc 가 `createEnvelope()` 를 생성하지 않아 start/add/end 조립이 강제된다.
4. **`gh-radar-vpc` 방화벽 규칙 0개, VM 0대.** 3규칙 생성 전에는 IAP SSH 조차 불가. Direct VPC Egress 는 `10.10.0.16/28` 을 예약해 두었고 Cloud Run 워크로드에는 태그를 못 붙이므로 내부 포트 방화벽은 반드시 `--source-ranges` 로.
5. **최대 미검증 리스크는 openconnect 라우팅**이다. 기본 경로를 VPN 이 가져가면 Secret Manager·AR·ACME·IAP 가 동시에 죽는다. 무의존 `CISCO_SPLIT_INC` 래퍼를 1순위로, `vpn-slice`(Debian repo 부재)를 2순위로 제시했고 D-03 선검증 체크리스트 7항목에 라우팅 검증을 포함시켰다.

### File Created

`/Users/alex/repos/gh-radar/.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | npm 레지스트리 실측 + slopcheck [OK] + 공식 README/문서 |
| Architecture (프로토콜) | HIGH | fbs·C# 원문 + flatc 산출물 생성·컴파일·실행 왕복 검증 |
| Architecture (인프라) | MEDIUM | GCP 현황은 실측이나 프로비저닝 명령은 미실행(D-27 준수) |
| Pitfalls | HIGH | 14건 중 9건이 코드/실행 근거, 5건은 문서 근거 |
| VPN | MEDIUM-LOW | KB 서버의 푸시 라우트·동시 세션 정책을 알 수 없음 — D-03 선검증이 유일한 해소 경로 |
| 메모리 예산 | LOW-MEDIUM | 추정치. 배포 후 `free -m`/`docker stats` 실측 필요 |

### Open Questions

- gh-trade Phase 17 완료 시점 (외부 일정) — 계좌·주문 wave 진입 시점을 결정
- kbs124 계정의 출발지 IP 제한·동시 세션 정책 — 선검증 전 확인 불가
- `gh-radar-deployer` SA 의 Secret Manager 접근 권한 유무 (관리자 등록 스크립트 실행 주체)
- 공개 `/healthz` 노출 범위
- wss 토큰 만료 처리 방식(v1 미채택 권고)

### Ready for Planning

리서치 완료. planner 는 다음 순서로 wave 를 구성할 것을 권고한다.

- **Wave A (병렬 가능·외부 의존 없음):** `relay/` 워크스페이스 + `pnpm-workspace.yaml` 등록 → `sync-relay-schema.sh` 실행·생성물 커밋 → 코덱·Envelope 가드 + 단위 테스트
- **Wave B:** DmaClient/Session(현행 스키마, accounts=[]) + SubscriptionHub + WsFanout + 인증 → mock 게이트웨이 통합
- **Wave C (병렬):** VPN 선검증 [BLOCKING 체크포인트] → VM/방화벽/고정 IP/SA/Secret → DNS A 레코드 [사용자 체크포인트] → Caddy → relay 배포 + `smoke-relay.sh`
- **Wave D:** `stocks.isin` 마이그레이션 + master-sync 저장·백필 [BLOCKING db push] + 호가창 목업 → UI-SPEC → 구현 + E2E
- **Wave E ([BLOCKING] gh-trade 17 완료 + 재동기화 뒤):** 계좌 선언·계좌 상태 팬아웃 → OrderApi → `POST /api/orders` → `dma_orders` → 주문 패널
