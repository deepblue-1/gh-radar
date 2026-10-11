# Phase 19: 계좌별 주문기록 전용 연결 (account-order-journal) - Research

**Researched:** 2026-09-24
**Domain:** 교차 저장소(gh-trade C++ 게이트웨이 ↔ gh-radar relay/Supabase/server/webapp) 주문 통보 저널 · 이어받기(since_seq) · 계좌 기준 기록 · 실시간 푸시
**Confidence:** HIGH(코드 사실·현재 구조) / MEDIUM(제안 와이어 계약·SQL 투영 설계 — 설계 제안이라 gh-trade 쪽 합의가 필요)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- **관찰자 접속 출발지 IP/대역 제한:** 이번에는 비밀만 쓴다(D-10). 게이트웨이가 공용망에 노출되거나 비밀 유출 위험이 커지면 재검토한다.
- **동결된 `dma_orders` 삭제·정리**와 **과거 날짜 주문 이력 화면**(새 테이블 기반): 별도 phase 또는 quick 으로 한다.
- **교보 게이트웨이(112) 관찰자 연결:** relay 가 교보를 붙일 때 같은 설계로 확장한다.
- **「다른 단말」 주문자 칩**(목업 변형 C): 미채택. 같은 DMA 사용자 안에서 gh-radar 와 WinForms 를 구분하지 못한다는 한계가 있다.
- **그림자 병행 전환**(관찰자 기록을 먼저 쓰고 1~2일 대조한 뒤 카드 전환): 한 번에 전환하기로 해 기각했다. 대신 첫 거래일 실장 대조 체크포인트를 둔다(D-14).
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 매핑된 ID 가 없다(TBD). 오케스트레이터 지시대로 CONTEXT D-01~D-14 를 요구사항 집합으로 쓴다.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | 관찰자 단독 기록자 · order-handler 기록부 제거 · rid 즉시응답 유지 | §「D-01 제거 인벤토리」(함수·라인·테스트 목록), §Pattern C |
| D-02 | 로컬 거부도 기록 통보 · seq 키 행 | §Pattern A(발행 지점 4곳), §Pattern D(`reject_seq` 행), Pitfall 4(핫패스) |
| D-03 | 카드 원천 = REST + 저널 푸시 · `{t:"order"}` 는 토스트 전용 | §Pattern F(병합 = `id` 기준 `lastSeq` 큰 쪽), §Pattern C(푸시 라우팅) |
| D-04 | 카드 「기록 지연」 + healthz 필드 + 장중 끊김 알림 | §Pattern G(healthz·503 규칙·uptime), `journal.state` 프레임 |
| D-05 | 새 계좌 기준 테이블 · dma_orders 동결 | §Pattern D(스키마 4종), §Runtime State Inventory |
| D-06 | 가시성 = dma_user_id→계좌 매핑(관찰자 공급) | §Pattern A(`ObserverLoginResp.accounts`), §Pattern D(`dma_account_access` + 조회 RPC) |
| D-07 | 카드 B′ 계좌별 묶음 · 390px 줄바꿈 수정 | §Pattern F(목업 CSS `.fix .l2{flex-wrap:wrap;row-gap:2px}` 이식) |
| D-08 | 출처 칩(상따·VI·수동) 전 행 · NXT 태그 · 로컬 거부 「—」 · 「· 수동」 꼬리 제거 | §Pattern F(`OriginTag` 추출·`ExchangeTag` 재사용) |
| D-09 | `[observer]` 분리 설정 · 전용 로그인 · 요청 전부 거부 | §Pattern A/B(`ObserverLoginReq=5`, ProcessPacket 단일 관문) |
| D-10 | 비밀 하나 · Secret Manager + gh-trade 운영 설정 | §Runtime State Inventory(비밀 2벌), Open Q1(deploy-config.sh 는 users.toml 을 옮기지 않는다) |
| D-11 | 전 계좌 기록 | §Pattern D(매핑과 무관하게 events/orders 기록) |
| D-12 | 게이트웨이 디스크 보관 · seq 재시작 연속 · since_seq | §Pattern B(저널 스토어 + 펌프), §Pattern A(`journal_epoch`) |
| D-13 | 24h 상시 · 백오프 · 인증 실패 정지 | §Pattern C(`DmaClient` 재사용 · `stopReconnect`) |
| D-14 | 한 번에 전환 · 20:00 이후 · 첫 거래일 대조 | §「배포 순서」, §Validation(수동 체크포인트) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md`(프로젝트)와 `~/.claude/CLAUDE.md`(사용자 전역)에서 뽑은, 이 phase 에 걸리는 지시다.

- **GSD 워크플로 필수** — 파일 변경은 GSD 명령(`/gsd-execute-phase` 등) 안에서만.
- **커밋:** 메시지 한글, 커밋 전 메시지를 사용자에게 먼저 보여 주고 확인, Co-Authored-By 넣지 않기, 커밋 후 push 까지(단 **이 저장소에서 push = webapp 프로덕션 배포** — 메모리 「배포는 relay 먼저·push 나중」이 우선한다).
- **배포 환경:** 백엔드 Cloud Run(server) · relay 는 GCE VM `radar-gw`(Docker) · 프론트 Vercel.
- **법적/운영:** 이 phase 는 크롤링이 아니라 사내 게이트웨이 통보라 스크래핑 5원칙 비적용. 대신 D-27 실서버 규율(장중 relay 재시작·배포 금지)이 적용된다.
- **UI 규약:** 상따 화면 반응형 정본은 `globals.css` §2.2b(이 카드는 My page 라 뷰포트 브레이크포인트 `max-[1279px]` 규칙 유지 — D-07). 목업 먼저·사용자 검토 게이트(B′ 확정 완료).
- **Supabase 규칙(메모리):** RPC 는 `REVOKE ... FROM anon, authenticated` **명시**(플랫폼 auto-grant 가 `REVOKE FROM PUBLIC` 을 덮는다). 서비스롤 전용 테이블은 RLS 활성 + 정책 0 + 명시 REVOKE.
- **Cloud Run 왕복 비용(메모리):** server 는 VPC all-traffic egress 라 Supabase 왕복 수가 지연을 지배 — 다중 쿼리 집계는 RPC 1회로.
- **무로그 fail-safe 금지(메모리):** catch 는 사유와 함께 로깅.
- **동시 세션 커밋 경합(메모리):** `git add -A`·relay 배포 직전 `git status -sb` 재확인.
- **Vercel(메모리):** `ignoreCommand` 가 docs-tip push 를 skip 한 전력 — push 뒤 실제 배포 여부를 확인.
- **워커 배포 스크립트 env(메모리):** `GCP_PROJECT_ID`+`SUPABASE_URL` 필수, `DMA_HOST` 는 라이브 값 보존(주입 생략 가능).
- **gh-trade 스키마 동기화(메모리/`docs/relay-operations.md`):** `sync-relay-schema.sh` 는 gh-trade 소유, `RELAY=` 필수, flatc 25.12.19 고정, `relay/src/generated/**` 손편집 금지, **`INBOUND_MSG_TYPES` 와 hub 명시 `case` 는 같은 커밋**, 계약 변경 시 `pnpm --filter @gh-radar/shared build` 먼저.

## Summary

현재 relay 의 `dma_orders` 기록은 **사용자별 DMA 세션**이 받은 51 통보에 매달려 있다. 세션은 wss 인증에서만 생기고 마지막 탭 종료 5분 뒤 닫히며(`SESSION_GRACE_MS` 300000), 게이트웨이 `SendToSession` 은 연결 0 세션의 통보를 버린다(`if (ids.empty()) return false;   // 연결 0개 — 통보는 버린다 (D-05, ...)`) [VERIFIED: gh-trade server/src/net/Gateway.cpp SendToSession 본문, 이번 세션 Read]. 그래서 이 phase 의 본질은 **「게이트웨이가 모든 통보를 seq 로 영속하고, relay 가 커서로 빈틈 없이 끌어와 계좌 기준 테이블에 멱등 투영한다」** 이다. 이 구조는 전형적인 **아웃박스/저널 + 체크포인트 소비자** 패턴이다.

설계의 핵심 결정 세 가지를 권고한다. ① 게이트웨이는 저널을 **전역 단조 seq**(재시작·자정을 넘어 이어짐) + `journal_epoch`(저널 저장소 신원)로 발행하고, 관찰자 연결마다 **펌프(tail) 방식**으로 seq 순서대로 보낸다 — 재생과 실시간을 한 경로로 합쳐야 순서 역전과 송신 큐 초과(1,024프레임 → 연결 끊김)를 동시에 피한다. ② Supabase 에는 **원시 이벤트 테이블 + 주문 투영 테이블**을 두고, 투영은 **서비스롤 전용 plpgsql RPC 한 번**(이벤트 PK 충돌이면 건너뜀 → 적용 → 커서 갱신이 한 트랜잭션)으로 한다. 체결 조각 누적(`filled_qty += Δ`)처럼 멱등이 아닌 연산이 있으므로 「이벤트 삽입 성공 = 1회 적용」 이 재생 안전성의 유일한 근거가 된다. ③ relay 는 `DmaClient`(프레이밍·LivePing 30s·백오프·세대 규율)를 그대로 재사용하는 **관찰자 클라이언트 + 단일 비동기 적용 워커**를 두고, RPC 가 돌려준 변경 행을 `fanout` 의 사용자별 전달(`#deliver`)로 「그 계좌 접근 사용자」에게만 민다.

gh-trade 쪽은 별도 저장소·자체 GSD(현재 Phase 22 교보 실행 중, 22-10·22-11 남음 — 둘 다 Gateway/Server 코드를 건드리지 않는 체크포인트·문서) 이므로, **gh-trade Phase 23(신규) 으로 계획·커밋·배포하고 gh-radar 19 의 계획에는 [BLOCKING] 의존 게이트로 둔다**(15 D-25 선례). gh-radar 쪽 계획은 「gh-trade `.fbs` 커밋 → `sync-relay-schema.sh`(RELAY= 지정) → 생성물 커밋」 뒤에야 relay 관찰자 코드를 확정할 수 있다. 계약이 먼저 고정되면 relay·DB·server·webapp 작업은 가짜 게이트웨이(`tests/helpers/fake-gateway.ts`)로 병행 가능하다.

**Primary recommendation:** 와이어 계약(`ObserverLoginReq=5` · `ObserverLoginResp=79` · `JournalBatch=80`, 전역 seq + `journal_epoch` + 펌프 전송)을 gh-trade Phase 23 에서 먼저 확정하고, gh-radar 는 「이벤트 테이블 + 투영 RPC(멱등 적용·커서 동일 트랜잭션)」 를 정본으로 삼아 relay 기록 경로(order-handler 1,000여 줄)를 걷어낸다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 통보 저널 발행(seq 부여·디스크 보관·재생) | gh-trade 게이트웨이(C++) | — | 통보가 처음 생기는 곳이고 relay 부재를 넘기는 버퍼는 게이트웨이만 들 수 있다(D-12) |
| 관찰자 인증·요청 차단 | gh-trade 게이트웨이 | relay(비밀 공급) | 서버 측 강제(D-09) — relay 가 알아서 안 보내는 것은 방어가 아니다 |
| DMA 사용자→계좌 매핑 공급 | gh-trade 게이트웨이(users.toml) | relay → DB 동기화 | users.toml 이 정본, 핫리로드 없음 → 로그인 시점 스냅샷(D-06) |
| 저널 소비·커서·재접속 | relay(Node, GCE VM) | Supabase(커서 저장) | 게이트웨이 9100 은 VPN/WG 안쪽 — relay 만 닿는다 |
| 멱등 투영(상태 단조·체결 누적·정정 이동·취소 원주문) | Database(plpgsql RPC) | relay(배치 호출) | 이벤트 삽입과 투영을 한 트랜잭션에 묶어야 재생이 안전하다 |
| 행 가시성 필터(계좌 권한) | Database(조회 RPC) | server(requireAuth 로 user_id 확정) | 조인 3개(주문·매핑·자격증명)를 왕복 1회로(Cloud Run 왕복 메모) |
| 실시간 푸시(계좌 접근 사용자에게만) | relay(fanout `#deliver`) | — | wss 를 쥔 프로세스, T-15-02 사용자 스코프 전달 |
| 「기록 지연」 판단 | relay(관찰자 상태) | webapp(표시) | 끊김 사실은 relay 만 안다 |
| 장중 끊김 알림 | relay `/healthz` → Cloud Monitoring uptime | ops 문서 | relay 로그는 Cloud Logging 에 없음(docker json-file) — uptime 이 유일한 알림 경로 |
| 카드 B′ 렌더·병합 | Browser(webapp) | — | 표시 전용, 계좌 이름·순서는 이미 받은 relay `accounts` |

## Standard Stack

이 phase 는 **새 외부 패키지를 설치하지 않는다.** 전부 기존 스택 위의 코드·스키마 변경이다.

### Core (기존, 버전 확인)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flatbuffers (npm, relay) | `^25.9.23` [VERIFIED: relay/package.json] | 새 테이블 3종 디코드(생성 코드) | gh-trade flatc 25.12.19 생성물과 짝 [VERIFIED: gh-trade server/scripts/sync-relay-schema.sh `FLATC_REQUIRED="flatc version 25.12.19"`] |
| @supabase/supabase-js (relay/server) | `^2.103.0` [VERIFIED: relay/package.json] | `.rpc()` 호출(적용·매핑 동기화·조회) | 기존 서비스롤 클라 재사용 |
| ws (relay) | `^8.21.3` [VERIFIED: relay/package.json] | 새 아웃바운드 프레임 | 기존 fanout |
| vitest | relay `^4.1.4` [VERIFIED: relay/package.json] | 단위·통합 테스트 | 3워크스페이스 공통 |
| pgTAP (로컬 컨테이너) | 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` [VERIFIED: scripts/verify-dma-orders-price-check.sh `IMAGE=`, 로컬 docker images 에 존재] | 투영 RPC 회귀 | 원격 DB 접촉 0 러너가 이미 있다 |
| flatc | 25.12.19 [VERIFIED: `flatc --version` 이번 세션 실행] | 스키마 재생성(gh-trade 가 실행) | 버전 고정 가드 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `toNum(v: bigint, label)` (relay 내부) | — [VERIFIED: relay/src/dma/envelope.ts:249] | `ulong` 필드 → number 승격 | seq·게이트웨이 시각을 `ulong` 으로 둘 때 |
| `isKrxHoliday` (shared) | — [VERIFIED: packages/shared/src/krxCalendar.ts] | 장중 알림 창 판정 | healthz 503 판정(주말·휴장일 제외) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 투영 plpgsql RPC | relay TS 에서 행별 PostgREST CAS(`last_seq < seq` 조건 UPDATE) | 로직을 vitest 로 잠그기 쉽지만, 이벤트당 2~3 왕복(재생 5천 건 = 수 분) + 커서·투영 원자성 부재. **RPC 권장** |
| 전역 단조 seq | 거래일별 seq(자정 리셋) + `(trade_date, seq)` 커서 | 날짜 협상 로직이 relay·게이트웨이 양쪽에 생긴다. 전역 seq 는 「거래일 범위 단조」 요건을 자동 충족 |
| 펌프(tail) 전송 | 로그인 시 재생 일괄 enqueue + 실시간 별도 | 재생이 1,024프레임을 넘으면 게이트웨이가 Notice 큐 초과로 **연결을 끊는다**(Pitfall 1), 재생·실시간 순서 역전 |
| healthz 503 편승 알림 | 두 번째 uptime check(JSONPath 매처) + 별도 정책 | 의미가 깔끔하나 인프라 1벌 추가. uptime 은 JSONPath 매처를 지원 [CITED: cloud.google.com/monitoring/uptime-checks/response-validation] |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다(npm/pypi/crates 신규 0).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────── gh-trade 게이트웨이 (KB 120:9100) ────────────────────┐
 KB 브로커 통보 ───────► │ WireExecutionCallback ─┬─► (기존) 51 → SendToSession(발주 세션; 0연결이면 버림) │
 전략 사전 거부(핫패스)─► │   (NotifyLocalReject)  │                                                     │
 수동 즉시 실패/예약 ──► │ ProcessDirectOrderReq ─┤                                                     │
                         │                         └─► JournalAppend(seq++, epoch) ─► 비동기 기록 스레드   │
                         │                                   │                        └► journal/*.bin   │
                         │   ObserverLoginReq(5){secret,since_seq,epoch}                    (N일 보관)   │
                         │     ├─ 거부 → LoginResp 단일 문구 (사유는 게이트웨이 로그만)                   │
                         │     └─ 성공 → ObserverLoginResp(79){epoch,head,oldest,resync,accounts[]}      │
                         │               + 관찰자 펌프: seq>since 부터 순서대로 JournalBatch(80) 전송     │
                         │                 (송신 큐 깊이 보고 스로틀 · 따라잡으면 실시간 1건씩)            │
                         │   관찰자 연결: Session 없음 · 5/4 외 모든 요청 거부 · 76 브로드캐스트 제외       │
                         └──────────────────────────────┬───────────────────────────────────────────────┘
                                                        │ TCP (WireGuard/VPN)
                         ┌──────────────── relay (radar-gw, Node 22) ──────────────────────────────────┐
                         │ JournalObserver (DmaClient 재사용: 프레이밍·LivePing 30s·백오프·세대)         │
                         │   up → ObserverLoginReq(since = DB 커서) ── 거부 → stopReconnect + state=rejected│
                         │   frame 80 → 메모리 큐(동기 push만, D-32) ──► 적용 워커(직렬, 배치 ≤200)        │
                         │                                              │  supabase.rpc(dma_journal_apply)  │
                         │   79 accounts ─► rpc(dma_journal_sync_access) + 메모리 매핑(dmaUser→계좌)      │
                         │                                              ▼                                  │
                         │   변경 행 ──► WsFanout.deliverJournalRows: 사용자별(creds.dmaUserId→계좌) #deliver│
                         │   상태 전이 ─► {t:"journal.state"} (인증 사용자 전원, 사용자별 전달)             │
                         │   /healthz ◄─ journal{state,lastSeq,headSeq,lag,disconnectedSec} (장중 지연 → 503)│
                         │ (기존) 사용자 세션 51 → hub → {t:"order"} 토스트 + order-handler rid 즉시응답만   │
                         └──────────────┬───────────────────────────────┬──────────────────────────────────┘
                                        │ service_role RPC               │ wss
                         ┌──────────────▼───────────── Supabase ───────┐ │
                         │ dma_journal_events (PK gateway,epoch,seq)    │ │
                         │ dma_account_orders (투영: 주문 1건=1행)        │ │
                         │ dma_account_access (dmaUser→계좌 매핑)        │ │
                         │ dma_journal_cursor (gateway→epoch,last_seq)   │ │
                         │ dma_orders (동결)                              │ │
                         └──────────────▲───────────────────────────────┘ │
                                        │ rpc(dma_journal_orders_for_user) │
                         ┌──────────────┴──── server (Cloud Run) ────┐    │
 브라우저 GET /api/orders ─► requireAuth → user_id → RPC 1회 → 배열  │    │
                         └──────────────────────────────────────────┘    │
                         ┌──────────────── webapp /me TodayOrdersCard ────▼──────────────┐
                         │ REST 복원 + journal.rows 푸시 → id 로 병합(lastSeq 큰 쪽)        │
                         │ 계좌별 묶음(B′) · 출처 칩 · NXT 태그 · journal.state=delayed 표식 │
                         └───────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (gh-radar 신규·변경)

```
supabase/migrations/
  2026092xxxxx00_dma_journal_tables.sql     # events · orders · access · cursor + RLS/REVOKE
  2026092xxxxx10_dma_journal_rpcs.sql       # apply · sync_access · orders_for_user (service_role EXECUTE 만)
supabase/tests/
  dma_journal_apply.test.sql                # pgTAP — 투영 규칙·멱등·REVOKE
relay/src/
  journal/observer.ts                       # 관찰자 상태기계(DmaClient 재사용)
  journal/writer.ts                         # 메모리 큐 + 직렬 RPC 적용 워커 + 커서
  journal/access.ts                         # dmaUserId→계좌 매핑(메모리)
  journal/trading-window.ts                 # 08:00~20:00 KST · 평일 · isKrxHoliday (알림 판정 전용)
  dma/envelope.ts                           # buildObserverLoginReq · parseObserverLoginResp · parseJournalBatch
  dma/msg-type.ts                           # ObserverLoginReq 5 / ObserverLoginResp 79 / JournalBatch 80
  ws/order-handler.ts                       # 기록부 제거 (D-01)
  ws/fanout.ts                              # UserEntry.dmaUserId · deliverJournalRows · journal.state 스냅샷
  order/order-api.ts                        # /healthz journal 필드 + 장중 지연 503
  store/orders.ts  (삭제 권장)              # OrderStore — 쓰기 주체가 사라진다
relay/tests/
  journal-observer.test.ts · journal-writer.test.ts · helpers/fake-gateway.ts(관찰자 확장)
packages/shared/src/relay.ts                # JournalOrderRow · RelayJournalRowsMsg · RelayJournalStateMsg
server/src/services/dma-orders.ts           # listTodayOrders → RPC 로 교체
webapp/src/lib/orders-api.ts                # 새 행 타입 · id/lastSeq 병합
webapp/src/components/trading/today-orders-card.tsx   # B′
webapp/src/components/trading/origin-tag.tsx          # account-panel OriginTag 추출(「수동」 포함)
```

### Pattern A: gh-trade 와이어 계약 (gh-trade Phase 23 에서 확정 — 제안)

**이미 확인된 제약** [VERIFIED: gh-trade server/src/protocol/StockDMA.fbs Read 이번 세션]:
- `enum MsgType : byte {` (fbs 3행) — `byte` 는 부호 있는 8비트라 값 상한 127.
- 요청 대역에서 쓰이는 번호: `LoginReq = 1,` `DirectOrderReq = 2,` `UpdateAccountNoReq = 3,` `LivePing = 4,` `SetLimitChaserReq = 10,` `SetVITriggerReq = 11,` … `ArmBuyLatchReq = 38,` — **5~9 는 비어 있다.**
- 응답 대역 마지막: `RateCrossSnapshot = 78` (fbs 116행) — **79 이상 비어 있다.**
- 재사용 금지 주석: `// 12/13: (예약) ... 재사용 금지`, `// 22/23: (예약) ... 재사용 금지`, `// 62/63: (예약) ... 재사용 금지`, `SetLimitChaserNXTReq = 30,     // (예약 봉인) ... 재사용 금지`, `SetLimitChaserNXTResp = 70,    // (예약 봉인) ...`.
- Envelope 규칙: 기존 필드 끝(`rate_cross_snapshot: RateCrossSnapshot;      // 78 본문 ... (vtable 슬롯 74)`) 뒤에만 append.
- `LoginResp.accounts: [AccountEntry]`, `AccountEntry { account_no: string; name: string; }` — 매핑 원소가 재사용할 수 있는 모양.

**제안 계약** [ASSUMED: 설계 제안 — gh-trade Phase 23 discuss 에서 확정]:

```fbs
// MsgType (추가)
ObserverLoginReq  = 5,   // C→S — 관찰자(기록 전용) 로그인. 사용자 Session 에 붙지 않는다 (gh-radar 19 D-09)
ObserverLoginResp = 79,  // S→C — 요청 연결에만
JournalBatch      = 80,  // S→C — 관찰자 연결에만, seq 오름차순 보장

table ObserverLoginReq {
  secret: string;          // [observer] 비밀 — 어떤 로그에도 남기지 않는다
  since_seq: ulong;        // 이 seq **초과**부터 보낸다. 0 = 보관분 처음부터
  journal_epoch: string;   // relay 가 마지막으로 본 epoch ("" = 모름)
  client: string;          // "gh-radar-relay" (로그 표시용)
}
table ObserverAccount {    // users.toml 평탄화 1행
  dma_user_id: string;     // users.toml user_id (비밀번호는 절대 싣지 않는다)
  account_no: string;      // LoadUsers 정규화값 그대로
  name: string;
  priority: int;
}
table ObserverLoginResp {
  success: bool;
  message: string;         // 거부 = 단일 문구 (17 D-04 동형)
  broker: string;          // "KB" — 행의 gateway 식별자 원천
  journal_epoch: string;   // 저널 저장소 신원 (생성 시 1회 랜덤, 파일에 영속)
  head_seq: ulong;         // 로그인 시점 마지막 seq
  oldest_seq: ulong;       // 보관 중 가장 오래된 seq (0 = 없음)
  resync: bool;            // epoch 불일치 · since_seq < oldest-1 · since_seq > head → oldest 부터 다시 보냄
  accounts: [ObserverAccount];
}
table JournalRecord {
  seq: ulong;
  trade_date: string;      // "YYYY-MM-DD" (KST, 레코드 발생 시각 기준)
  gw_time_ms: ulong;       // 게이트웨이 벽시계 epoch ms (표시용 시각의 정본)
  dma_user_id: string;     // 발주 세션 user (termId→Session).. 모르면 "" (재시작 뒤 termId=0)
  account_no: string;
  isin: string;
  side: string;            // "B"/"S"/"" — C/M 은 원주문 메타로 채울 수 있으면 채움
  side_trusted: bool;
  order_no: string;        // 로컬 거부는 ""
  org_order_no: string;
  notice_type: string;     // A/E/C/M/R (ExecutionReport.noticeType 그대로)
  request_kind: string;    // New/Modify/Cancel/"" (RequestKindWireText)
  requester: string;       // "Manual"/"" (manualRequest)
  origin: string;          // Manual/LimitChaser/VITrigger/"" (OriginName)
  exchange: string;        // KRX/NXT
  board: string;           // "G2"/"G3"/"" (BoardWireText)
  order_price: int;        // ExecutionReport.orderPrice  — 51 처럼 useExecuted 로 섞지 않는다
  order_qty: int;          // ExecutionReport.orderQty
  exec_price: int;         // ExecutionReport.executedPrice
  exec_qty: int;           // ExecutionReport.executedQty
  result_code: int;
  message: string;         // 804 친화 문구 교체 후 문자열(51 과 같은 조립)
  local_reject: bool;      // localSynthetic 또는 Gateway 즉시 실패 회신
}
table JournalBatch {
  records: [JournalRecord];
  head_seq: ulong;         // 이 프레임 조립 시점의 게이트웨이 head
  caught_up: bool;         // records 마지막 seq == head_seq
}
// Envelope 말미 append (가운데 삽입 금지)
//   observer_login_req: ObserverLoginReq;
//   observer_login_resp: ObserverLoginResp;
//   journal_batch: JournalBatch;
```

근거가 되는 필드 원천 [VERIFIED: gh-trade server/src/broker/IBroker.h:99-159 Read]: `int origin = 0;` `int termId = 0;` `char isin[13]{};` `char accountNo[13]{};` `char side = 'B';` `char orderNo[11]{};` `char orgOrderNo[11]{};` `char requestKind = 0;` `bool manualRequest = false;` `int orderPrice = 0;` `int orderQty = 0;` `int executedPrice = 0;` `int executedQty = 0;` `int resultCode = 0;` `char message[64]{};` `char noticeType = 'A';` `bool localSynthetic = false;` `char exchange = ORDER_EXCHANGE_KRX;` `char board = 0;`. ExecutionReport 에 **market 이 없다** → 새 테이블 `market` 은 두지 않거나 nullable.

**`ulong` 은 relay 생성 코드에서 `bigint`** 다(`D-34 long → 생성 코드는 bigint` [VERIFIED: relay/src/dma/envelope.ts:15]) — 파서 경계에서 `toNum()` 으로 number 로 내린다. seq 를 `uint`(32비트)로 두면 bigint 처리를 피할 수 있다(하루 1만 건이면 42만 일) — gh-trade 와 합의할 재량.

**발행 지점 4곳** (D-02 포함) [VERIFIED: gh-trade Read]:
1. `Server::WireExecutionCallback` (Server.cpp:150-401) — 브로커 통보 + `NotifyLocalReject` 합성 거부(`const bool localReject = broker::IsLocalReject(report);`). 51 조립 **앞**(예열 억제 판정 전후 정책은 Open Q4).
2. `Gateway::ProcessDirectOrderReq` 즉시 실패 — `BuildDirectOrderResp(builder, req, "R", "", result, failMsg, ...)` (Gateway.cpp:2713 부근) → `ReplyToConn` 요청 연결에만 간다(세션 팬아웃도 아님).
3. 예약(Q-ID) 등록 회신 `BuildDirectOrderResp(builder, req, "A", qId.c_str(), ...)` (Gateway.cpp:2356), 예약 취소 회신 `"C"` (2396·2434) — Q-ID 형식 `^Q[0-9]{9}$` 10자 [VERIFIED: gh-trade server/src/trade/queued/QueuedOrder.h:273-274 `// \`^Q[0-9]{9}$\` 10자인가 (18.1 D-15).`]. 저널 포함 여부는 Open Q3.
4. 전략 사전 거부 — `LimitChaser.cpp`·`StrategyManager.cpp` 의 `NotifyLocalReject` 호출(= 1번 콜백으로 합류). **호출 스레드가 MarketFeed 핫패스**다(Server.cpp:154 주석 「로컬 거부(NotifyLocalReject)는 **호출자 스레드에서** 이 콜백을 직접 부른다」).

### Pattern B: 게이트웨이 저널 스토어 + 관찰자 펌프 (gh-trade 쪽 — 제안)

- **스토어:** `OrderRecorder`(길이 프리픽스 + 1초 flush 스레드 + 자정 롤오버 + `kMaxPendingBytes` 16MB 상한) [VERIFIED: gh-trade server/src/trade/recorder/OrderRecorder.h Read] 를 선례로, 별도 `JournalStore` — 레코드 = 직렬화된 `JournalRecord`(FlatBuffers 바이트 그대로) + 4B 길이. 날짜별 파일(`journal/YYYYMMDD.jrnl`), 메모리에는 **당일+전일 레코드 벡터**(재생 소스), seq 는 `journal/seq.state` 에 영속(Kyobo 22-02 `execseq 영속` 선례), epoch 는 `journal/epoch` 에 1회 생성.
- **append 는 락 없는 큐 또는 짧은 mutex push 만**, 파일 I/O 는 기록 스레드. 핫패스(로컬 거부) 규율: 「핫패스에 락/파일 I/O 금지」 [VERIFIED: Server.cpp:163-178 주석]. Open Q5 로 gh-trade 가 SPSC/MPSC 선택.
- **펌프:** 관찰자 연결마다 `nextSeq` 커서를 가진 송신 루프(Server::Run 틱 또는 전용 스레드). 레코드를 seq 순으로 최대 100건/≈32KB 씩 `JournalBatch` 로 묶어 `EnqueueToConn(connId, frame, MsgClass::Notice)` — **큐 깊이가 여유(예: < 64프레임)일 때만** 다음 배치. 따라잡으면 새 append 마다 즉시 1건 배치.
- **관찰자 연결:** `ClientConn` 에 `bool observer` 추가, `Session*` 은 계속 `nullptr`. `ProcessPacket` 진입부 **단일 관문**: `observer && msg_type ∉ {ObserverLoginReq, LivePing}` → warn 1회 + 무시(D-09 서버 강제). 반대로 `observer == false` 연결의 `ObserverLoginReq` 는 비밀 검증 전 거부하지 않는다(일반 연결이 관찰자로 승격 가능 — 단 이미 `session` 이 있으면 거부).
- **브로드캐스트 제외:** 76 `RateCrossAlert` 는 「로그인 전 연결에도 온다」(msg-type.ts 주석, `BroadcastFrame`) — 관찰자 연결은 `BroadcastFrame`·`BroadcastServerMessage` 대상에서 제외 권장(대역·relay 소음).
- **유휴 스윕:** 현재 스윕은 `if (!conn.session || !net::IsIdleExpired(...))` 로 **세션 없는 연결을 건너뛴다** [VERIFIED: Gateway.cpp:552]. 관찰자도 스윕 대상에 넣어야 반개방 relay 연결이 남지 않는다(relay 는 LivePing 30s 를 보낸다 [VERIFIED: relay/src/dma/dma-client.ts:71 `export const PING_INTERVAL_MS = 30_000;`]).
- **복수 관찰자:** relay 재시작 직후 옛 연결이 남아 있을 수 있으므로 「이미 관찰자 있음」 으로 거부하지 않는다(연결별 독립 펌프, 상한 2~4).
- **비밀 설정:** `config/observer.toml`(git 미추적·chmod 600, `[observer] secret = "..."`) — `server.toml`(git 추적) 에 두면 안 된다. `deploy-config.sh` 는 **server.toml 만** 옮긴다 [VERIFIED: gh-trade server/scripts/deploy-config.sh `CONFIG_SRC="config/kb/120/server.toml"` · `REMOTE_PATH="gh-trade-server/config/server.toml"`] → users.toml 처럼 **수동 배치**(Open Q1). 비교는 상수시간.

### Pattern C: relay 관찰자 클라이언트 + 적용 워커 + 푸시

**What:** `DmaClient` 1개를 소유하는 `JournalObserver`(세션 상태기계 `session.ts` 의 축소판) + `JournalWriter`(직렬 비동기 적용).

- **재사용 가능한 것** [VERIFIED: relay/src/dma/dma-client.ts Read]: `RECONNECT_MAX_DELAY_MS = 30_000`, `backoffDelayMs(attempt)` 1→2→4→8→16→30…초 무한, `RECONNECT_ESCALATE_ATTEMPTS = 10` 넘으면 error 승격, `stopReconnect(reason)`(명시 거부 시 루프 정지 — D-13), `CONNECT_TIMEOUT_MS = 3_000`, `SEND_TIMEOUT_MS = 2_000`, generation 규율, `#onData` 가 `tryParseEnvelope` 를 통과한 프레임만 `emit("frame")`.
- **수신 화이트리스트:** `tryParseEnvelope` 는 `INBOUND_MSG_TYPES` 밖을 드롭한다 [VERIFIED: relay/src/dma/msg-type.ts:186-210]. 79·80 을 추가하면 **같은 커밋에** 사용자 세션 쪽 `SubscriptionHub.#onFrame` 에도 명시 `case MSG.ObserverLoginResp: case MSG.JournalBatch:`(warn 후 무시)를 넣어야 한다(`docs/relay-operations.md` 「INBOUND_MSG_TYPES 한 줄과 hub 명시 case 는 언제나 같은 커밋」, `unhandledFrameCount` 불변식).
- **상태:** `disabled`(비밀 미설정) · `connecting` · `logging_in`(5초 타임아웃 — `LOGIN_RESP_TIMEOUT_MS = 5000` 선례 [VERIFIED: relay/src/dma/session.ts]) · `syncing`(매핑 RPC) · `replaying` · `live` · `rejected`(비밀 거부 → `stopReconnect`, 재시작 전 복구 없음) · `db_error`.
- **수신 콜백은 동기 push 만**(D-32: 「수신 콜백에서 Supabase 를 await 하면 게이트웨이 송신 큐가 찬다」 [VERIFIED: relay/src/store/orders.ts 헤더]). `JournalWriter` 가 큐를 직렬로 비운다: 배치 ≤200 → `supabase.rpc("dma_journal_apply", …)` → 성공 시 메모리 `lastAppliedSeq` 갱신 + 반환 행 푸시. 실패 → 같은 배치 지수 백오프 재시도(커서 미전진), 연속 실패면 state `db_error`.
- **메모리 상한(e2-micro):** 큐가 상한(예: 5,000 레코드)을 넘으면 **스스로 연결을 끊고**(`dropTransport`) 적용이 따라잡은 뒤 `since_seq = lastAppliedSeq` 로 재접속 — 게이트웨이 펌프 스로틀과 이중 방어. relay 컨테이너는 `--memory=384m` [VERIFIED: scripts/deploy-relay.sh `--memory=384m`], 기동 실측 48MiB [VERIFIED: infra/relay/README.md 표].
- **seq 연속성 검사:** 적용 전 `record.seq === expected` 아니면(갭) error 로그 + 재접속(since=lastApplied). 게이트웨이 seq 는 **조밀**(모든 저널 레코드가 seq 소비)해야 이 검사가 성립한다 — 필터링(예열 제외 등)은 seq 부여 **전**에 한다.
- **매핑:** 79 수신 → `rpc("dma_journal_sync_access", {gateway, rows})`(원자 교체) + 메모리 `Map<dmaUserId, Set<accountNo>>`. 매핑 RPC 실패해도 저널 적용은 진행(가시성만 늦음), 재시도.
- **푸시 라우팅(D-03):** `WsFanout` 의 `UserEntry` 에 `dmaUserId`(인증 시 `#lookupCredentials` 가 이미 얻는 값, 로그 금지)를 저장하고 `deliverJournalRows(rows, access)` 가 `#users` 를 돌며 `access.get(entry.dmaUserId)?.has(row.accountNo)` 인 행만 모아 `#deliver(userId, {t:"journal.rows", rows})`. **전역 브로드캐스트 함수를 만들지 않는다**(T-15-02 [VERIFIED: fanout.ts 헤더]).
- **상태 프레임:** `{t:"journal.state", s:"live"|"delayed", since?: ISO}` — 전이 시 `#users` 전원, 인증 직후 `#onFirstMessage` 스냅샷에 1프레임(알려진 값이므로 항상 보냄). 짧은 재접속 깜빡임을 막으려 `delayed` 는 끊김 후 N초(권장 10초) 뒤에 낸다.
- **부팅·종료 순서** [VERIFIED: relay/src/index.ts:188-225 현행 순서 1)HTTP close 2)fanout.closeAll 3)sessionManager.closeAll 4)hub.closeAll 5)orderStore.flushNow]:
  - 부팅: supabase → sessionManager → symbols → hub → fanout → **observer.start()**(커서 읽기 → 연결). index.ts:34 「부팅 시 DMA 게이트웨이에 미리 접속하지 않는다」 주석을 「사용자 세션은 그렇다, 관찰자는 예외(D-13)」로 고친다.
  - 종료: 1) HTTP close 2) fanout.closeAll 3) sessionManager.closeAll 4) **observer.stop()**(수신 중단 → DmaClient.destroy) 5) **writer.drain(상한 2초)** 6) hub/symbols close. 커서는 RPC 트랜잭션 안에서만 전진하므로 drain 을 못 끝내도 **유실 0**(다음 부팅이 재생) — `SHUTDOWN_TIMEOUT_MS = 5_000` 안에 넉넉하다.

### Pattern D: Supabase 스키마 + 투영 RPC

```sql
-- 테이블 (이름은 재량 — 아래는 권장)
dma_journal_events   (gateway text, journal_epoch text, seq bigint, trade_date date, gw_time timestamptz,
                      dma_user_id text, account_no text, isin text, side text, order_no text, org_order_no text,
                      notice_type text, request_kind text, requester text, origin text, exchange text, board text,
                      order_price int, order_qty int, exec_price int, exec_qty int, result_code int, message text,
                      local_reject bool, applied_at timestamptz default now(), apply_error text,
                      PRIMARY KEY (gateway, journal_epoch, seq))
dma_account_orders   (id uuid pk, gateway, trade_date date, account_no, order_no text NULL,
                      journal_epoch text NULL, reject_seq bigint NULL,   -- 로컬/접수전 거부 행 키 (D-02)
                      isin, exchange CHECK (KRX,NXT), board, side NULL CHECK (B,S), order_type CHECK (N,M,C),
                      org_order_no, qty int NULL CHECK (>0), price int NULL CHECK (>=0),
                      filled_qty int DEFAULT 0, modified_qty int DEFAULT 0,
                      status CHECK ('accepted','partially_filled','filled','cancelled','rejected','modified'),
                      result_code, notice_type, message, origin NULL CHECK (manual,limit_chaser,vi), requester,
                      dma_user_id text NULL,   -- 감사용. 조회·푸시로 내보내지 않는다 (D-08)
                      first_seq, last_seq, created_at (= 첫 이벤트 gw_time), updated_at (= 마지막 gw_time),
                      CHECK ((order_no IS NULL) <> (reject_seq IS NULL)))
  UNIQUE (gateway, trade_date, account_no, order_no) WHERE order_no IS NOT NULL
  UNIQUE (gateway, journal_epoch, reject_seq)        WHERE reject_seq IS NOT NULL
  INDEX  (gateway, account_no, trade_date, created_at DESC)
dma_account_access   (gateway, dma_user_id, account_no, account_name, priority int, synced_at,
                      PRIMARY KEY (gateway, dma_user_id, account_no)); INDEX (gateway, account_no)
dma_journal_cursor   (gateway text PRIMARY KEY, journal_epoch text, last_seq bigint, updated_at)
-- 전부: ENABLE RLS · 정책 0 · REVOKE ALL FROM PUBLIC · REVOKE ALL FROM anon, authenticated · GRANT ... TO service_role
```

권한 패턴 원문 [VERIFIED: supabase/migrations/20260905120200_dma_orders.sql]: `ALTER TABLE public.dma_orders ENABLE ROW LEVEL SECURITY;` `REVOKE ALL ON public.dma_orders FROM PUBLIC;` `REVOKE ALL ON public.dma_orders FROM anon, authenticated;` `GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_orders TO service_role;`. RPC 패턴 원문 [VERIFIED: supabase/migrations/20260914090000_stock_comovement_inputs_rpc.sql:24-29,87-89]: `LANGUAGE sql` `STABLE` `SECURITY INVOKER` `SET search_path = public, pg_temp` … `REVOKE EXECUTE ON FUNCTION public.stock_comovement_inputs(text) FROM PUBLIC;` `REVOKE EXECUTE ON FUNCTION public.stock_comovement_inputs(text) FROM anon, authenticated;` `GRANT EXECUTE ON FUNCTION public.stock_comovement_inputs(text) TO service_role;`.

**`dma_journal_apply(p_gateway text, p_epoch text, p_events jsonb) RETURNS jsonb`** (plpgsql, SECURITY INVOKER, service_role 전용):
1. `PERFORM pg_advisory_xact_lock(hashtext('dma_journal:' || p_gateway));` — 두 번째 writer(오결선 relay)를 직렬화.
2. 이벤트를 seq 오름차순으로 순회: `INSERT INTO dma_journal_events … ON CONFLICT DO NOTHING` → **삽입된 경우에만** 투영(재생 멱등의 유일한 근거).
3. 투영은 이벤트별 `BEGIN … EXCEPTION WHEN OTHERS THEN UPDATE dma_journal_events SET apply_error = SQLERRM …` 서브블록 — **포이즌 이벤트 하나가 배치 전체·커서를 영원히 막지 않게** 한다(오류는 이벤트 행에 남고 반환 `errors` 로 relay 가 warn).
4. `INSERT INTO dma_journal_cursor … ON CONFLICT (gateway) DO UPDATE SET journal_epoch = p_epoch, last_seq = GREATEST(...)` — **같은 트랜잭션**.
5. 변경된 투영 행(dma_user_id 제외 컬럼)을 `jsonb_agg` 로 반환 → relay 가 추가 조회 없이 푸시.

**투영 규칙** (기존 relay 규칙의 이식 — 단조 격자 원문 [VERIFIED: relay/src/order/notice-status.ts:83-95] `requested: 0,` `timeout: 0,` `accepted: 1,` `partially_filled: 2,` `filled: 3,` `cancelled: 3,` `rejected: 3,` `modified: 3,` · `const TERMINAL ... = new Set<DmaOrderStatus>(["filled", "cancelled", "rejected", "modified"]);` · `replaceableStatusesOf(next)` = `cur === next || (!TERMINAL.has(cur) && STATUS_RANK[cur] <= rank)`):

| 이벤트 | 대상 행 | 동작 |
|--------|---------|------|
| `local_reject` 또는 (R ∧ order_no="") | 새 행 `reject_seq = seq` | status `rejected`, order_type = request_kind(New→N/Modify→M/Cancel→C, ""→N), qty/price = order_* |
| A | (account, order_no) upsert | 없으면 생성(qty=order_qty, price=order_price, order_type=request_kind, org_order_no), status→`accepted`(단조) |
| E | (account, order_no) upsert | `filled_qty += exec_qty`; qty 알면 `filled_qty+modified_qty >= qty` → `filled` 아니면 `partially_filled`(단조). A 보다 먼저 오면 qty NULL 로 생성, 뒤의 A 가 채우고 재판정 |
| C | 자기 order_no 행(취소 주문) + 원주문 행 | 자기 행 order_type C·status `cancelled`; 원주문(org, 비면 자기 번호 = 거래소 자동취소 예외 [VERIFIED: order-handler.ts:859-860]) status→`cancelled`(단조 — `filled` 는 안 덮음) |
| M | 자기 order_no 행(정정 주문) + 원주문 행 | moved = LEAST(M.order_qty, 원주문 잔량 qty−filled−modified); 자기 행 order_type M·qty=moved·`accepted`; 원주문 `modified_qty += moved`, 합이 qty 이상이면 `modified`. 원주문 없으면 moved = M.order_qty(폴백) |
| R ∧ order_no≠"" ∧ request_kind ∈ {Cancel, Modify} | 자기 order_no 행 | order_type C/M·status `rejected`; **원주문은 불변**(거부 = 원주문 살아 있음 [VERIFIED: order-handler.ts:851-856 주석]) |
| R ∧ order_no≠"" ∧ New | 자기 행 | status `rejected` |
| 모든 이벤트 | 대상 행 | `last_seq = seq`, `notice_type/result_code/message` 최신화, `updated_at = gw_time`; `created_at` 은 **첫 이벤트 gw_time**(재생 시각 아님), C/M 행 side 는 원주문 side 로 채움 |

**조회 RPC `dma_journal_orders_for_user(p_user_id uuid, p_trade_date date)`:** `dma_account_orders o JOIN dma_account_access a ON (a.gateway, a.account_no) = (o.gateway, o.account_no) JOIN dma_credentials c ON c.dma_user_id = a.dma_user_id WHERE c.user_id = p_user_id AND o.trade_date = p_trade_date ORDER BY o.created_at DESC` — **`dma_user_id` 컬럼을 반환하지 않는다.** `dma_credentials.user_id` 는 PK 라 사용자당 dma_user_id 1개 [VERIFIED: supabase/migrations/20260905120100_dma_credentials.sql `user_id uuid PRIMARY KEY`] → 중복 행 없음. `dma_user_id` 는 UNIQUE 가 아니다(여러 사용자 공유 — 95e9·b1e2 가 같은 행을 보게 되는 근거).

### Pattern E: server `GET /api/orders`

`listTodayOrders` 의 `.from("dma_orders")…eq("user_id", userId)` [VERIFIED: server/src/services/dma-orders.ts] 를 `supabase.rpc("dma_journal_orders_for_user", { p_user_id: userId, p_trade_date: kstDate })` 한 번으로 교체. `kstDateIso()`(shared) 와 `date` 쿼리(zod `OrderListQuery`) 규약은 유지, bare array 유지(route 주석 「list 엔드포인트는 bare array」). 응답 타입은 새 shared `JournalOrderRow`(camelCase). `p_user_id` 는 **requireAuth 가 확정한 값만** — 쿼리·바디에서 받지 않는다.

### Pattern F: webapp 카드 B′

- **행 모델:** `JournalOrderRow = { id, accountNo, isin, stockCode?, exchange, board, side|null, orderType, orgOrderNo|null, qty|null, price|null, orderNo|null, filledQty, modifiedQty, status, resultCode|null, noticeType|null, message|null, origin|null, requester|null, lastSeq, createdAt, updatedAt }`. `stockCode` 는 relay/서버가 채우지 않는다면 `useIsinLabels` 폴백(현 ⑥ 규율 그대로).
- **병합(D-03 재설계):** `Map<id, row>` — REST 스냅샷 + `journal.rows` 푸시, **같은 id 면 `lastSeq` 큰 쪽**. 푸시 행은 완전한 행이라 **행을 만들 수 있다**(구 ③ 「라이브는 행을 못 만든다」 규율 폐기) → `unmatchedOrderNos` 재조회 루프·`requestedRef` 삭제. 상태는 DB 투영이 이미 단조이므로 `orderDisplayStatus` 는 `STATUS_LABELS[row.status]` 조회만(라이브 join 제거).
- **재조회 트리거:** 마운트 1회 + relay ready **재진입**(현 ⑦ 유지 [VERIFIED: today-orders-card.tsx:177-193]) + `journal.state` 가 `delayed→live` 로 바뀔 때 1회.
- **묶기:** `mergeOrderNotices` 는 유지하되 `mergeKeyOf` 가 `row.live` 대신 `row.noticeType`/`row.requester` 를 읽게 바꾼다 [VERIFIED: order-notices.ts `mergeKeyOf` 가 `row.live` 의존].
- **그룹핑:** 계좌 순서·이름은 relay `accounts`(state 프레임의 `RelayAccount{accountNo,name}` [VERIFIED: packages/shared/src/relay.ts:632-635]) — 같은 users.toml 원천이라 매핑과 같은 집합. 목록에 없는 계좌(세션 미준비)는 번호만으로 뒤에 붙인다. 헤더 「N건」 = 묶기 **전** 행 수(목업 주석 그대로).
- **칩·태그:** `OriginTag` 는 account-panel 안의 비공개 함수 [VERIFIED: account-panel.tsx:1410 `function OriginTag`] → `components/trading/origin-tag.tsx` 로 추출(클래스 그대로: `whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted-fg)]`)하고 「수동」 값을 허용. `origin null` → 칩 생략(Open Q6). NXT 는 `ExchangeTag`(exchange-tag.tsx) 를 **NXT 일 때만** 렌더. 「· 수동」 메타(`label.meta`)는 이 카드에서 렌더하지 않는다. 로컬 거부 행 주문번호 「—」 는 기존 `group.orderNoText ?? "—"` 로 이미 성립.
- **390px 수정:** 목업 CSS `.fix .l2, .fix .l3 { flex-wrap: wrap; row-gap: 2px; }` [VERIFIED: 19-today-orders-mockup.html] → ②줄 div 에 `flex-wrap gap-y-0.5` 추가. ①줄은 종목명만 신축(헤더 ⑤ 규율 유지). 목업 ①줄: 종목명 · 코드 · NXT · 구분 · 출처 · (우) 상태.
- **데스크톱 표:** 「출처」 열을 「구분」 뒤에, NXT 태그는 종목 셀 코드 뒤.
- **「기록 지연」:** 헤더 옆 배지(`role="status"`, pulse 점, `prefers-reduced-motion` 시 애니메이션 끔) + 한 줄 안내 「기록 지연 — 복구되면 채워집니다. HH:MM:SS 이후 주문이 아직 안 보일 수 있어요.」 — 이미 기록된 행은 흐리게 하지 않는다(목업 lead).

### Pattern G: `/healthz` + 장중 알림

- 현재 페이로드 [VERIFIED: relay/src/order/order-api.ts `HealthPayload`]: `status` `vpn` `dma` `version` `sessionCount` `everReadyCount` `stalledCount`, degraded → **HTTP 503**. 공개 경로라 식별자 금지 — smoke 가 `"(accountNo|userId|account_no|user_id)"` 키를 grep 해 FAIL 처리 [VERIFIED: scripts/smoke-relay.sh health_probe].
- 추가 권장: `journal: { state, lastSeq, headSeq, lagSeq, disconnectedSec, lastAppliedAgeSec }` (키 이름에 account/user 금지).
- 판정: `inTradingWindow(now)`(평일 · `!isKrxHoliday(kstDate)` · 08:00 ≤ KST < 20:00) **이고** (`state === "rejected"` **또는** `state ∉ {live}` 가 `JOURNAL_ALERT_AFTER_MS`(권장 180초) 초과) → `healthy = false` → 503. 창 밖에서는 본문에만 드러내고 200.
- 알림 경로: relay 로그는 Cloud Logging 에 없다(docker json-file, Ops Agent 미설치 [VERIFIED: infra/relay/README.md 「Ops Agent 는 설치하지 않는다」]) → 기존 uptime check `gh-radar-relay-healthz` + 정책 `gh-radar-relay-down`(5분 창·0.9 임계·싱가포르 AND [VERIFIED: ops/alert-relay-down.yaml]) 에 편승. 끊김 후 알림까지 ≈ 3분 + 5분. `ops/alert-relay-down.yaml` 문서 표에 「503 `{"journal":{"state":…}}` → 관찰자 기록 연결」 행 추가.
- **쓰지 말 것:** `isKoreanMarketOpen`(shared) 는 **08:00~15:30** 이다(`return timeInMinutes >= 480 && timeInMinutes <= 930;` [VERIFIED: packages/shared/src/marketHours.ts]) — 20:00 창과 다르다.

### Anti-Patterns to Avoid

- **재생을 로그인 직후 한꺼번에 enqueue:** 게이트웨이 Notice 큐 1,024프레임/4MB 초과 시 연결 절단(Pitfall 1).
- **relay TS 에서 `filled_qty` 를 조회→계산→갱신:** 재생 시 이중 누적. 멱등 근거는 이벤트 PK 삽입뿐이다.
- **커서를 별도 호출로 저장:** 적용 성공·커서 실패(또는 반대)의 틈이 생긴다 — 같은 트랜잭션.
- **`created_at DEFAULT now()` 에 기대기:** 재생 시각이 주문 시각이 된다. 게이트웨이 `gw_time` 이 정본.
- **관찰자 매핑을 relay 세션 `allowedAccounts` 로 대체:** 사용자 세션이 없을 때 푸시·가시성이 사라진다. 매핑 원천은 관찰자 하나(D-06).
- **journal 행 푸시용 전역 브로드캐스트 함수:** T-15-02 위반. `#deliver(userId)` 만 쓴다.
- **`toOrderOrigin("") → "manual"` 을 새 테이블에도 적용:** 「수동」과 「출처 불명」이 다시 같은 값이 된다 [VERIFIED: shared `DmaOrderRow.origin` 주석 「"수동"과 "출처 불명"이 같은 값」]. NULL 로 둔다.

## D-01 제거 인벤토리 (relay/src/ws/order-handler.ts — 1,887행)

[VERIFIED: 이번 세션 Read, 라인은 HEAD 46e8bea 기준]

**걷어낼 것 (기록부):**
| 위치 | 대상 | 비고 |
|------|------|------|
| 76-80 | import `kstDayRangeUtc`·`OrderInsertRow`·`OrderUpdate`(store/orders), `safePgError`, `stocksCodeOf` | `statusOf`/`filledQtyOf` 는 `finish` 의 order.result status 계산에 남긴다 |
| 112-129 | `OrderNoticeSource.getLimitChasers/getViTrigger/getAccountStates` | `on("order")` 만 남긴다 |
| 131-144 | `interface OrderRecorder` (`insertRequest`/`enqueueUpdate`/`findIdByOrderNo`) | 전부 |
| 146-157 | `OrderHandlerDeps.orderStore` | `symbols`·`sessions`·`hub`·`send`·`timeoutMs` 는 유지 |
| 313-323 | `type EnsureResult` | |
| 346-422 | `inflight` 맵 · `RelayTrail`/`relayTrail`/`trailOf`/`markTrailIsin`/`markTrailOrderNo`/`isRelayRelated` | 미부착 통보 ERROR 판정 전용 |
| 473-550 | `hub.on("order")` 중 `modifyMoveOf`·`recordModifyMove`(482-491)·`recordUnmatched` 호출(540-549) | **남김**: 후보 수집(501-508) · `narrowPending` · `settle`(510-520) · 좁히기 실패 warn(525-530). `settle` 인자 `movedQty` 제거 |
| 559-584 | `modifyMoveOf` | |
| 590-666 | `OriginalLookup` · `findOriginalRowId` · `recordModifyMove` | |
| 676-686 | `patchOf` | |
| 733-824 | `recordUnmatched` | |
| 843-899 | `settleOriginal` | |
| 911-986 | `ensureRow` · `insertOnly` | |
| 996-1138 | `autoInsertRow` · `sideOf` · `strategyOf` · `soleAccountOf`(「전략 캐시로 계좌 추정」) | |
| 1239-1275 | ③-2 `insertRequest` await(「기록 실패 → 주문 안 보냄」 게이트) | D-01 로 사라짐 |
| 1277-1299 | ③-3 연결 생존 재확인 | await 가 없어지면 불필요(동기 경로). `closeConn` 경쟁은 사라진다 |
| 1333 | 조립 거부 시 `enqueueUpdate(rejected)` | reject 프레임은 유지 |
| 1355-1370 | timeout 의 `markTrailIsin`·`enqueueUpdate(timeout)` | timeout 프레임은 유지 |
| 1373-1395 | settle 의 `markTrailOrderNo`·`enqueueUpdate`·qtyCap 항목 | order.result 프레임(1396-1404)은 유지 |
| 1439-1443 | 송신 실패 `enqueueUpdate(rejected)` | reject 프레임 유지 |
| 1466-1471 | `closeConn` 의 `markTrailIsin` | 타이머 정리는 유지 |
| 1562-1580 | `isCancelLikeNotice` · `orderNoLookupKeys` | narrowPending 은 쓰지 않음 |
| 1582-1631 | `ModifyMove` · `modifyMovedQty` | SQL 투영이 대신 |

**남길 것:** `InboundOrderMsg`, `OrderHandlerSession(s)`, `PendingOrder`(orderRowId 필드 제거), `ConnState`, `ridKey`/`dupKey`/`claimKeys`, `RELAY_RESULT_CODE`, `stateOf`/`release`/`dropUserDupKeys`/`reject`, `handle`(게이트 ⓪①②③③-1, 조립, ④대기, ⑤송신), `closeConn`/`close`, `normalizeOrderNo`, `NEW_ORDER_NOTICE_TYPES`, `REQUEST_KIND_BY_*`, `ANSWERABLE_KINDS_BY_NOTICE_TYPE`, `narrowPending`.

**결선 변화:**
- `relay/src/ws/fanout.ts`: `this.#orders = deps.orderStore !== undefined && deps.symbols !== undefined ? createOrderHandler(...)` [VERIFIED: fanout.ts 생성자] → `symbols` 만으로 열리게. `WsFanoutDeps.orderStore` 제거.
- `relay/src/index.ts:111-121` `OrderStore` 생성·`start()`, 131 `orderStore` 주입, 216-217 `flushNow`/`close` 제거. `relay/src/store/orders.ts`(1,318행)와 `tests/order-store.test.ts`(1,624행)·`tests/helpers/fake-dma-orders.ts`(참조처 확인 후) 삭제 권장 — 동결 테이블에 쓸 수 있는 코드가 남는 것 자체가 위험(D-05).
- `relay/src/hub/subscription-hub.ts` `HubOrderEvent` 주석(「주문 라우트는 … 원문이 필요」) 갱신, `#onOrderNotice` 의 감사 로그(1221-1230)는 **유지**(D-24 두 번째 사본 역할은 이제 관찰자 쪽 로그로 옮겨도 됨 — 재량).
- `packages/shared` `DmaOrderRow` 는 webapp 전환 후 참조 0 이면 삭제(또는 deprecated 표기).

**테스트 영향** (relay/tests/ws-order.test.ts 92건 · HEAD 실행 92 passed [VERIFIED: 이번 세션 `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts`]):
- **삭제:** ⑫⑬⑭⑯⑱⑲㉕㉖㉗㉘㉞㊹㊺, describe「quick-260923-m23 — 정정확인 M 수량」 전체, describe「quick-260923-e1m — 통보 기록 경로」 전체, describe「isCancelLikeNotice」, describe「modifyMovedQty」.
- **수정(DB 단언만 걷어냄):** ① ①-b ①-c ③ ④ ⑤ ⑥ ㊴(와이어 조각·세션 단언은 유지).
- **유지:** ②⑦⑧⑨⑩⑪⑮⑰⑳㉑㉒㉓㉔㉙㉚㉛㉜㉝㉟㊱㊲㊳㊵㊶㊷㊸, describe「narrowPending」.
- 하네스 `mkOrderStore`·`orderStore: orders.store` 주입(ws-order.test.ts:137-160, 290) 제거.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TCP 프레이밍·재접속·핑 | 관찰자 전용 소켓 코드 | `DmaClient` 그대로 | 세대 규율·desync 재수립·송신 정체 타이머가 이미 실전 검증됨 |
| 64비트 → number | `Number(bigint)` 직접 | `toNum(v, label)` (envelope.ts:249) | SAFE_MAX 클램프·로그 규율 |
| 재생 멱등 | relay 쪽 「이미 적용?」 조회 | 이벤트 PK `ON CONFLICT DO NOTHING` + 같은 트랜잭션 투영 | 조회-후-갱신 경합과 부분 실패 창을 구조적으로 제거 |
| 두 writer 직렬화 | 앱 레벨 락 | `pg_advisory_xact_lock` | 트랜잭션 종료 시 자동 해제 |
| 상태 단조 | 새 순위표 | `STATUS_RANK`/`replaceableStatusesOf` 규칙을 SQL 로 1:1 이식 | 같은 격자 — 웹 `orders-api.ts` `STATUS_RANK` 와도 같은 축 |
| 계좌번호 정규화 | relay 재정규화 | 게이트웨이 `NormalizeAccountNo` 결과 문자열 그대로 비교 | 매핑·저널 둘 다 게이트웨이 정규화값 (Pitfall 7) |
| KST 날짜 | 새 함수 | shared `kstDateIso()` / 게이트웨이 `trade_date` | 두 벌이 되면 한쪽만 고쳐진다 |
| 휴장일 | 하드코딩 | shared `isKrxHoliday` | 12월 seed 갱신 규율이 이미 있다 |
| 가짜 게이트웨이 | 새 스텁 | `tests/helpers/fake-gateway.ts` + `frames.ts` 빌더 확장 | 청크 분할·강제 종료·자동 응답 규율 재사용 |
| pgTAP 러너 | 새 스크립트 | `scripts/verify-dma-orders-price-check.sh --test <file>` | 원격 접촉 0·일회용 컨테이너·trap 정리 |

**Key insight:** 이 도메인의 사고는 알고리즘이 아니라 **「같은 통보가 두 번 적용되거나 한 번도 적용되지 않는 틈」** 에서 난다. 그 틈을 닫는 수단(이벤트 PK·단일 트랜잭션·seq 연속성 검사)은 이미 표준이고, 손으로 만든 보정 로직은 전부 그 틈 위에 선다.

## Runtime State Inventory

> 이 phase 는 기록 주체 이전(dma_orders → 새 테이블) + 새 비밀·새 연결을 도입하므로 적용한다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `dma_orders` 434행(CONTEXT) — 동결, 이관 없음(D-05). 새 테이블 4종은 빈 상태로 시작. relay 커서 없음 → 첫 접속 `since_seq=0` → 게이트웨이 보관분(업그레이드 **이후** 통보만) 전체 재생 | 마이그레이션(코드). 데이터 이관 없음. 전환일 당일 앞선 주문은 새 카드에 없다 — 20:00 이후 전환이라 당일 영향은 「그날 저녁」 뿐 |
| Live service config | Cloud Monitoring uptime `gh-radar-relay-healthz` · 정책 `gh-radar-relay-down`(문서만 갱신, 조건 불변) [VERIFIED: ops/alert-relay-down.yaml]. gh-trade 120 `stock-dma` systemd 서비스(재시작 필요) | ops yaml 문서 행 추가 → `deploy-relay.sh` 가 멱등 갱신. 게이트웨이 재시작은 20:00 이후 수동 |
| OS-registered state | 120: 저널 디렉터리(신규)·보관 정리(N일) — 기존 `log/MMDD_order.bin` 옆. radar-gw: 컨테이너 env 에 새 변수(docker run 시 고정) | gh-trade 배포 시 디렉터리 권한 확인. relay 재배포로 env 반영(`--env-file` 은 실행 시 복사되어 재시작 정책에도 유지 [VERIFIED: deploy-relay.sh 주석]) |
| Secrets/env vars | **신규** Secret Manager `gh-radar-dma-observer-secret`(이름 제안) → relay env `DMA_OBSERVER_SECRET`; **신규** 120 `config/observer.toml`(git 미추적 600). 두 값이 같아야 한다. 현재 deploy-relay.sh 는 비밀 3종만 읽는다: `SB_KEY="$(fetch_secret gh-radar-supabase-service-role)"` `CRED_KEY="$(fetch_secret gh-radar-dma-cred-key)"` `ORDER_SECRET="$(fetch_secret gh-radar-relay-order-secret)"` [VERIFIED: scripts/deploy-relay.sh:312-314] · IAM 루프 `for SECRET_NAME in gh-radar-dma-cred-key gh-radar-relay-order-secret gh-radar-kb-vpn-password; do` [VERIFIED: scripts/setup-relay-iam.sh:179] | deploy-relay.sh 사전 검사 목록(184행 루프)·fetch·env-file·빈 값 검사에 추가, setup-relay-iam.sh 접근권 루프에 추가, logger redact 경로에 `dmaObserverSecret`. 값 생성·주입은 사용자 또는 비출력 파이프 |
| Build artifacts | `relay/src/generated/**`(sync marker `gh-trade 6adcb62f` → 새 해시), gh-trade C# 생성물(`sync-client-schema.sh`) + `scripts/expected-vtable.txt`(`--update-expected`) [VERIFIED: gh-trade scripts/expected-vtable.txt 헤더 「의도한 스키마 확장은 --update-expected 로 갱신」], `packages/shared/dist`(계약 변경 후 빌드 먼저) | gh-trade 쪽 두 동기화 스크립트 실행, gh-radar 생성물 별도 커밋, shared build → typecheck 순서 |

**`dma_orders` 의 남은 읽기/쓰기 참조** [VERIFIED: grep 이번 세션]: server `routes/orders.ts`·`services/dma-orders.ts`, relay `index.ts`·`store/orders.ts`·`ws/order-handler.ts`·`ws/fanout.ts`·주석 다수, webapp `orders-api.ts`·`today-orders-card.tsx`·`account-panel.tsx`(주석), `scripts/smoke-relay.sh`·`smoke-server.sh`(주석), `scripts/verify-dma-orders-price-check.sh`(pgTAP). 전환 뒤 실제 쓰기 경로는 0 이어야 한다.

## Common Pitfalls

### Pitfall 1: 재생 폭주로 게이트웨이가 관찰자를 끊는다
**What goes wrong:** since_seq 재생을 로그인 직후 한꺼번에 큐에 넣으면 체결 조각이 많은 날(상따 1주문 ≈ 90 체결 [debug relay-ws-order-unmatched-notice 조사 2 `체결 ~90건`]) 수천 프레임이 되고, 게이트웨이는 Notice 큐 초과 시 연결을 끊는다.
**Why:** `constexpr size_t kSendQueueMaxFrames = 1024;` `constexpr size_t kSendQueueMaxBytes  = 4u * 1024 * 1024;` 이고 Notice 는 「가득차면 **연결을 끊어** 그 사실을 드러낸다」 [VERIFIED: gh-trade server/src/net/Gateway.h:65-66, 84-91; Gateway.cpp EnqueueLocked `DisconnectClient(conn.fd)`]. 재접속 → 같은 재생 → 무한 루프.
**How to avoid:** 펌프 + 큐 깊이 스로틀 + 배치 프레임(레코드 벡터). 16KB 이상 프레임은 송신 상한이 5초로 늘어난다(`kBulkFrameMinBytes = 16u * 1024` / `kBulkFrameSendTimeoutMs = 5000` [VERIFIED: Gateway.h]) — 배치 ≈32KB 는 안전 범위.
**Warning signs:** 게이트웨이 로그 `송신 큐 가득참 conn=… — 연결을 끊는다 (D-02)`, relay 관찰자 재접속 반복·lastSeq 정지.

### Pitfall 2: 재생 이중 적용(체결 수량 두 배)
**What goes wrong:** relay 가 적용 후 커서 저장 전에 죽으면 같은 E 가 다시 오고 `filled_qty += Δ` 가 두 번.
**How to avoid:** 이벤트 PK 삽입 성공일 때만 투영, 커서는 같은 트랜잭션. pgTAP 에 「같은 배치 두 번 호출 → 행 불변」 단언.

### Pitfall 3: epoch 없는 커서 → 조용한 전면 누락
**What goes wrong:** 게이트웨이 저널 디렉터리가 초기화(새 호스트·수동 삭제)되면 seq 가 1 부터 다시 시작하는데 relay 커서는 5,000 → 「since 5000」 에 보낼 것이 없어 영원히 빈 기록.
**How to avoid:** `journal_epoch` 비교 + `since_seq > head_seq` 도 `resync`. relay 는 resync 를 error 로그 + healthz 필드로 드러낸다.

### Pitfall 4: 로컬 거부 저널링이 시세 핫패스에 파일 I/O·락을 얹는다
**What goes wrong:** 전략 사전 거부는 MarketFeed 수신 스레드에서 콜백을 직접 부른다 — 여기서 동기 파일 쓰기·긴 락을 잡으면 시세 처리 지연 = 잘못된 전략 판정.
**Why:** Server.cpp 주석 「로컬 거부의 호출자 스레드는 MarketFeed 시세 수신 스레드… 핫패스에 락/파일 I/O 금지가 이 프로젝트의 핵심 제약」 [VERIFIED: Server.cpp:163-178].
**How to avoid:** 저널 append = 사전 할당 링버퍼/MPSC push 만, 직렬화·파일은 기록 스레드(gh-trade 설계 결정 — Open Q5).

### Pitfall 5: 재생 시각이 주문 시각이 된다
**What goes wrong:** `created_at DEFAULT now()` 면 relay 가 저녁에 재생한 오전 주문이 저녁 시각으로 찍혀 카드 정렬·「오늘」 경계가 틀어진다.
**How to avoid:** `created_at`/`updated_at` = 레코드 `gw_time_ms`, `trade_date` = 레코드 값. DB `now()` 는 `applied_at` 에만.

### Pitfall 6: 로컬 거부가 R ∧ order_no="" 로 여러 건 → 한 행에 겹친다
**What goes wrong:** 빈 주문번호를 키로 upsert 하면 서로 다른 거부가 한 행을 덮는다(현 relay GC-WR-02 가 같은 함정을 적어 두었다 [VERIFIED: order-handler.ts:912-917]).
**How to avoid:** 빈 주문번호 레코드는 `reject_seq = seq` 새 행, CHECK `(order_no IS NULL) <> (reject_seq IS NULL)`.

### Pitfall 7: 계좌번호 표기 불일치로 행이 안 보인다
**What goes wrong:** 매핑의 계좌와 저널의 계좌가 다른 표기(앞 0)면 조인이 0행.
**Why:** users.toml 은 `NormalizeAccountNo` 적용값을 저장하고(「앞 0 없음, ≤12자」), KB 통보도 같은 함수로 만든다 [VERIFIED: gh-trade Config.h:120-124, KBBroker.cpp:43]. 둘 다 게이트웨이가 정규화한 값이므로 relay·DB 는 **재정규화하지 않는다**.
**Warning signs:** pgTAP/실측에서 events 는 있는데 `orders_for_user` 0행.

### Pitfall 8: 관찰자 연결에 76 브로드캐스트가 쏟아진다
**What goes wrong:** `RateCrossAlert(76)` 은 「**Broadcast — 로그인 전 연결에도 온다.**」 [VERIFIED: relay/src/dma/msg-type.ts:157-160] — 관찰자가 이를 warn 으로 찍으면 소음, 무시 목록이 없으면 `unknown-msg-type` 드롭 카운터가 오른다.
**How to avoid:** 게이트웨이에서 관찰자 제외 + relay 관찰자 핸들러가 76 을 조용히 무시(명시 분기).

### Pitfall 9: `INBOUND_MSG_TYPES` 에 79/80 만 넣고 hub `case` 를 안 넣음
**What goes wrong:** 사용자 세션에 우연히 79/80 이 오면 `default:` → `unhandledFrameCount` 증가, 운영 불변식 「0」 이 깨진다.
**How to avoid:** 같은 커밋에서 hub 명시 `case`(warn 후 무시) — `docs/relay-operations.md` 규칙.

### Pitfall 10: RPC EXECUTE 가 authenticated 에 열려 있으면 IDOR
**What goes wrong:** `dma_journal_orders_for_user(p_user_id)` 가 `authenticated` 에 실행 권한이 있으면 로그인 사용자가 PostgREST 로 **남의 user_id** 를 넣어 조회한다. `dma_journal_apply` 는 쓰기다.
**How to avoid:** 세 함수 모두 `REVOKE EXECUTE … FROM PUBLIC` + `FROM anon, authenticated` 명시 + `GRANT … TO service_role`(메모리 규칙). pgTAP 에 `has_function_privilege('authenticated', …, 'EXECUTE') = false` 단언.

### Pitfall 11: 저널 seq 가 조밀하지 않으면 relay 갭 검사가 오탐
**What goes wrong:** 게이트웨이가 seq 를 먼저 올리고 레코드를 필터(예: 예열 제외)하면 relay 는 매번 「갭」 으로 재접속.
**How to avoid:** 필터 → seq 부여 순서를 gh-trade 계약에 명시.

### Pitfall 12: 배포 창에서 server 와 webapp 응답 모양이 어긋난다
**What goes wrong:** `GET /api/orders` 응답 모양이 바뀌므로 server(Cloud Run) 를 먼저 배포하고 webapp push 가 늦어지면 구 webapp 카드가 새 행을 잘못 그린다. CONTEXT D-14 순서에는 server 가 빠져 있다.
**How to avoid:** server 배포를 webapp push **직전**에 같은 창에서(20:00 이후라 사용 영향 최소). 또는 새 경로를 두는 대안(Open Q2).

### Pitfall 13: push 했는데 Vercel 이 빌드를 건너뜀
**What goes wrong:** 마지막 커밋이 docs 뿐이면 `ignoreCommand` 가 skip — 과거 13일 정체(메모리).
**How to avoid:** push 후 Vercel 배포 커밋 해시 확인, 필요 시 repo root 에서 `vercel pull → build → deploy --prebuilt`.

### Pitfall 14: 120 재배포가 미배포 변경을 함께 싣는다
**What goes wrong:** gh-trade master 에는 「120 미배포」 로 표기된 서버 변경이 여럿 쌓여 있다(quick-260923-hp5 PRICE 100ms · i0m VI 참조가 영속 · jsv vi_released · k5b 정정 수량 캡 · a70f6ab7 상따 M 캡 · created_ms 슬롯 38 · mkt 발사 오프셋) [VERIFIED: gh-trade .planning/STATE.md Quick Tasks 표]. Phase 23 배포가 이들을 **함께** 올린다.
**How to avoid:** gh-trade Phase 23 계획이 「동반 배포 목록」 을 명시하고 사용자 확인 체크포인트를 둔다(또는 사전 분리 배포).

## Code Examples

### relay — 관찰자 상태기계 뼈대 (DmaClient 재사용)
```typescript
// 출처: relay/src/dma/session.ts 부트 패턴 축소. 이름·필드는 제안 [ASSUMED].
export class JournalObserver extends EventEmitter {
  readonly #client: DmaClient;
  #state: JournalObserverState = "idle";
  constructor(private readonly deps: { secret: string | undefined; cursor: () => Promise<Cursor>;
                                       writer: JournalWriter; client?: DmaClient; host: string; port: number }) {
    super();
    this.#client = deps.client ?? new DmaClient({ host: deps.host, port: deps.port });
    this.#client.on("up", (e) => void this.#onUp(e.generation));
    this.#client.on("frame", (e) => this.#onFrame(e));          // 동기 — await 금지 (D-32)
    this.#client.on("down", () => this.#setState("connecting"));
  }
  start(): void {
    if (this.deps.secret === undefined) { this.#setState("disabled"); logger.warn({}, "[JOURNAL] 비밀 미설정 — 관찰자 비활성"); return; }
    this.#client.connect();
  }
  async #onUp(gen: number): Promise<void> {
    const cur = await this.deps.cursor();                      // 커서 읽기 실패 → dropTransport(재시도)
    if (gen !== this.#client.generation) return;               // 세대 규율
    this.#client.send(buildObserverLoginReq(this.deps.secret!, cur.lastSeq, cur.epoch));
    this.#armLoginTimer(gen);                                  // 5초
  }
  #onFrame(e: TransportFrameEvent): void {
    switch (e.msgType) {
      case MSG.ObserverLoginResp: {
        const r = parseObserverLoginResp(e.env);
        if (r === null || !r.success) { this.#client.stopReconnect("관찰자 로그인 거부"); this.#setState("rejected"); return; }
        this.emit("access", r.accounts);                       // 매핑 RPC 는 writer 쪽 비동기
        this.deps.writer.beginEpoch(r.broker, r.epoch, r.resync);
        this.#setState(r.headSeq > this.deps.writer.lastSeq ? "replaying" : "live");
        return;
      }
      case MSG.JournalBatch: {
        const b = parseJournalBatch(e.env);
        if (b !== null && !this.deps.writer.push(b.records)) this.#client.dropTransport("저널 큐 상한");
        if (b?.caughtUp) this.#setState("live");
        return;
      }
      case MSG.RateCrossAlert: return;                         // 76 — 관찰자와 무관, 조용히 무시
      default: logger.warn({ msgType: e.msgType }, "[JOURNAL] 관찰자 연결에 예상 밖 프레임");
    }
  }
}
```

### Supabase — 적용 RPC 골격
```sql
-- 출처: 20260914090000_stock_comovement_inputs_rpc.sql 권한 패턴 + 이 문서 Pattern D. 본문은 제안 [ASSUMED].
CREATE OR REPLACE FUNCTION public.dma_journal_apply(p_gateway text, p_epoch text, p_events jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE ev jsonb; v_rows jsonb := '[]'::jsonb; v_applied int := 0; v_errors int := 0; v_max bigint := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('dma_journal:' || p_gateway));
  FOR ev IN SELECT value FROM jsonb_array_elements(p_events) ORDER BY (value->>'seq')::bigint LOOP
    v_max := GREATEST(v_max, (ev->>'seq')::bigint);
    INSERT INTO dma_journal_events (gateway, journal_epoch, seq, /* … */) VALUES (p_gateway, p_epoch, (ev->>'seq')::bigint /* … */)
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;                         -- 이미 적용된 seq — 재생 멱등
    BEGIN
      v_rows := v_rows || dma_journal_project(p_gateway, p_epoch, ev);   -- 표 규칙 구현, 변경 행 jsonb 반환
      v_applied := v_applied + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE dma_journal_events SET apply_error = SQLERRM
       WHERE gateway = p_gateway AND journal_epoch = p_epoch AND seq = (ev->>'seq')::bigint;
      v_errors := v_errors + 1;
    END;
  END LOOP;
  INSERT INTO dma_journal_cursor (gateway, journal_epoch, last_seq, updated_at) VALUES (p_gateway, p_epoch, v_max, now())
    ON CONFLICT (gateway) DO UPDATE SET journal_epoch = EXCLUDED.journal_epoch,
      last_seq = CASE WHEN dma_journal_cursor.journal_epoch = EXCLUDED.journal_epoch
                      THEN GREATEST(dma_journal_cursor.last_seq, EXCLUDED.last_seq) ELSE EXCLUDED.last_seq END,
      updated_at = now();
  RETURN jsonb_build_object('applied', v_applied, 'errors', v_errors, 'rows', v_rows);
END $$;
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) TO service_role;
```
주의: plpgsql 의 `BEGIN … EXCEPTION` 블록은 서브트랜잭션이라 비용이 있으나 배치 ≤200 이면 무시 가능 [CITED: postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING]. `v_rows` 에는 같은 행이 여러 번 들어갈 수 있으니 반환 전 id 기준 마지막 값만 남긴다.

### webapp — 병합
```typescript
// 출처: 현 orders-api.ts mergeTodayOrders 대체 제안 [ASSUMED 이름].
export function mergeJournalRows(restored: readonly JournalOrderRow[], pushed: readonly JournalOrderRow[]): JournalOrderRow[] {
  const byId = new Map<string, JournalOrderRow>();
  for (const r of [...restored, ...pushed]) {
    const cur = byId.get(r.id);
    if (cur === undefined || r.lastSeq > cur.lastSeq) byId.set(r.id, r);   // 투영이 단조라 lastSeq 가 최신성의 정본
  }
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
```

## 배포 순서 (D-14) · 교차 저장소 게이트

**gh-trade 쪽은 gh-trade 저장소에서** `/gsd-phase add`(→ Phase 23 권장, 22 는 교보·잔여 22-10/22-11 은 코드 무관) → discuss(위 Pattern A/B 를 입력으로) → plan → execute → `cloud-verify` 게이트. gh-radar 19 계획에는 다음 [BLOCKING] 게이트를 둔다:

- **G1 계약 고정:** gh-trade `.fbs` 커밋 해시 → gh-radar 에서 `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh` → `--check` 차이 0 → 생성물 커밋(gh-radar). 이 전까지 relay 관찰자 코드는 계약 초안 기반 가짜 게이트웨이로만 진행.
- **G2 gh-trade 배포 준비 완료:** 바이너리 빌드 게이트 통과·`observer.toml` 배치 절차 합의.

**배포 창 (장 마감 20:00 이후, 사용자 승인 하에):**
1. **DB:** `supabase db push`(마이그레이션 2개 — 추가 전용이라 현행 relay 무영향). 직후 원격에서 권한 확인 쿼리(`has_function_privilege`). [BLOCKING]
2. **비밀:** Secret Manager `gh-radar-dma-observer-secret` 새 버전(값 비출력) + 120 `config/observer.toml` 같은 값(600). setup-relay-iam.sh 로 접근권.
3. **gh-trade:** `./scripts/deploy.sh kb prod-120`(바이너리+server.toml, 자동 재시작 없음 — `RESTART_SERVICE` 기본 false [VERIFIED: gh-trade scripts/deploy.sh]) → 20:00 이후 `systemctl restart stock-dma`(전략 무인 복원 동반) → 기동 로그에서 저널 epoch·seq 복원 확인.
4. **relay:** `git status -sb` 재확인 → `GCP_PROJECT_ID=gh-radar SUPABASE_URL=… bash scripts/deploy-relay.sh`(DMA_HOST 라이브 보존) → `/healthz` `journal.state=live` · `dma_account_access` 행 수 = users.toml 계좌 수 · `dma_journal_cursor` 행 존재.
5. **server:** `scripts/deploy-server.sh`(GET /api/orders RPC 전환) — webapp push **직전**.
6. **webapp push**(= Vercel 프로덕션) → 실제 배포 해시 확인.
7. **검증(당일 밤):** 두 사용자(95e9·b1e2 — 같은 DMA 계정) 토큰으로 `GET /api/orders` 결과가 동일한지(행 수·id 집합). 장 마감 뒤라 새 주문 기록 경로는 **다음 거래일** 에 검증된다.
8. **첫 거래일 실장 대조 체크포인트(수동):** 장 마감 후 계좌별로 ① 브로커 체결내역(사용자) ② 게이트웨이 저널/`MMDD_order.bin`·서버 로그 ③ `dma_account_orders` 건수·상태를 대조, 불일치 0 이면 종결. 2026-09-24(목)·25(금)는 KRX 휴장(`"2026-09-24", // 추석 연휴` `"2026-09-25", // 추석` [VERIFIED: packages/shared/src/krxCalendar.ts]) → 이번 주 전환 시 첫 거래일은 **2026-09-28(월)**. 10-05·10-09 도 휴장.

**선택 프로브(사용자 명시 승인 필요):** 20:00 이후 수동 주문은 게이트웨이가 「정규장 G1 · 애프터마켓 G4 · 둘 다 아니면 거부」 로 즉시 R 을 줄 가능성이 높아 로컬 거부 → 저널 → 행 생성을 실주문 없이 확인할 수 있다 — 단 창 판정 코드를 이번 세션에 끝까지 읽지 않았으므로 [ASSUMED], 실주문 위험이 있어 기본 계획에 넣지 않는다.

**롤백:** relay `deploy-relay.sh --rollback 6b85c1e`(현 라이브 = `"version":"6b85c1e"` [VERIFIED: 이번 세션 `curl https://dma.jx1.io/healthz`]) — 구 relay 는 dma_orders 를 다시 쓴다(동결 해제 = 수용 가능한 롤백 상태). webapp 은 Vercel 이전 배포 승격, server 는 이전 revision, gh-trade 는 deploy.sh 백업 바이너리. DB 는 추가 전용이라 롤백 불필요.

**참고:** 라이브 relay `6b85c1e` 와 HEAD 사이 `relay/ packages/shared supabase server` 차이 0 [VERIFIED: `git diff --stat 6b85c1e HEAD -- relay packages/shared supabase server` 빈 출력] — STATE.md 의 「relay 미배포」 문구는 낡았다. 이 phase 의 relay 배포가 다른 미배포 변경을 싣지 않는다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 사용자 세션 51 → `dma_orders`(user_id 키) 기록, 요청 시점 `requested` insert | 게이트웨이 저널(seq) → 관찰자 → 이벤트+투영(계좌 키) | Phase 19 | 부재 중 자동주문 누락 소거, 공유 계좌 동일 표시 |
| 카드 = REST + `{t:"order"}` 라이브 join(`orderDisplayStatus` 격자) | REST + `journal.rows` 푸시, `id`/`lastSeq` 병합 | Phase 19 | unmatched 재조회 루프·라이브 우선 규칙 폐기 |
| 「· 수동」 꼬리(requester) | 출처 칩(origin) 전 행 | Phase 19 D-08 | requester 는 저장만 |

**Deprecated/outdated:**
- `relay/src/store/orders.ts` `OrderStore`: 쓰기 주체 소멸 — 삭제 권장.
- `DmaOrderRow`(shared): webapp·server 전환 후 참조 0 이면 삭제.
- `quick-260923-m23`·`e1m` 의 relay 측 정정·취소 보정: SQL 투영으로 이전.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 와이어 계약 전체(번호 5/79/80, 필드, `ulong` 선택, resync 규칙) | Pattern A | gh-trade 합의에서 바뀌면 relay 파서·가짜 게이트웨이 재작업 — G1 게이트가 흡수 |
| A2 | 게이트웨이가 펌프 방식·큐 깊이 스로틀을 구현할 수 있다 | Pattern B | 불가하면 relay 가 요청-응답 페이징(`ObserverReplayReq`)으로 끌어오는 대안 필요 |
| A3 | `JournalStore` 를 OrderRecorder 선례로 만들고 전역 seq·epoch 를 파일에 영속 | Pattern B | 설계 자유 영역 — gh-trade 결정 |
| A4 | 정정 이동 수량을 SQL 이 `LEAST(M.qty, 원주문 잔량)` 로 재계산하면 서버 캡(k5b)과 같은 값 | Pattern D | 원주문이 저널에 없는 경우(전일 주문·예약) 폴백 차이. 게이트웨이가 `moved_qty` 를 실어 주는 대안 |
| A5 | 20:00 이후 수동 주문은 게이트웨이 로컬 거부 | 배포 순서 | 틀리면 실주문 — 그래서 선택·승인 프로브로만 둠 |
| A6 | 장중 알림 임계 180초 · 「기록 지연」 표시 지연 10초 · 배치 200 · 큐 상한 5,000 · 보관 N일 | Pattern C/G | 운영 튜닝 값 — 재량 |
| A7 | 테이블·RPC·프레임·env·비밀 이름(`dma_account_orders`, `journal.rows`, `DMA_OBSERVER_SECRET`, `gh-radar-dma-observer-secret` 등) | 전반 | 이름만의 문제 |
| A8 | 조회 결과의 계좌 이름·순서를 relay `accounts` 에서 가져와도 매핑과 같은 집합 | Pattern F | 세션 미준비 시 번호만 표시(목업과 약간 다름) |

## Open Questions

1. **gh-trade 쪽 비밀 파일 배치 경로**
   - What we know: D-10 은 「users.toml 처럼 `deploy-config.sh` 경로」 라고 했지만 deploy-config.sh 는 **server.toml 한 파일만** 옮긴다(git 추적 파일). users.toml 은 Phase 22-07 처럼 수동 600 배치다.
   - Recommendation: `config/observer.toml`(git 미추적) 을 users.toml 과 같은 수동 배치 절차로. deploy-config.sh 확장은 gh-trade 재량.
2. **server 응답 모양 전환 창**
   - Recommendation: 같은 경로 유지 + server 배포를 webapp push 직전. 대안 = 새 경로 `/api/orders/journal` 추가 후 구 경로 삭제(한 phase 안에서 두 번 배포).
3. **예약(Q-ID) 접수·취소 회신을 저널에 넣는가**
   - What we know: `^Q[0-9]{9}$` 는 숫자 주문번호와 겹치지 않는다. 회신은 요청 연결에만 간다. 16:00 발사 뒤 조각은 실제 주문번호로 따로 통보된다.
   - Recommendation: 넣는다(order_no = Q-ID 행, 상태 accepted/cancelled). 조각 행과의 연결은 이번 범위 밖.
4. **예열(warm-up) 주문**
   - What we know: 51 을 억제한다(`IsWarmupOrderNo`), 하한가 1주 진단 주문.
   - Recommendation: 저널 **제외**(seq 부여 전 필터) — 카드에 뜨면 사용자가 취소·재발주한다는 기존 근거와 같다. gh-trade 결정.
5. **핫패스 append 구현** — gh-trade 결정(MPSC 링버퍼 권장).
6. **origin 미상(재시작 뒤 termId=0) 행의 출처 칩** — 칩 생략 권장(「수동」 으로 표시하면 거짓). D-08 「모든 행」 과 충돌하므로 사용자 확인 필요(드문 경우: 20:00 이후 재시작이면 당일 주문이 남지 않는다).
7. **감사 사본(`[HUB] 주문 통보 수신(감사 사본)`) 유지 여부** — relay stdout 두 번째 사본의 역할이 관찰자 로그로 옮겨간다. 유지해도 무해.
8. **이벤트 테이블 보관 기간** — 연 수십만~백만 행 규모 [ASSUMED]. 정리는 deferred(dma_orders 정리와 함께).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | relay/server/webapp 빌드·테스트 | ✓ | v22.22.0 | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| Docker daemon | pgTAP 러너 | ✓ | Server 29.4.0 | — |
| supabase/postgres 이미지 | pgTAP 러너 | ✓(로컬) | 17.6.1.104 | 러너는 pull 하지 않고 멈춤 |
| Supabase CLI | `db push` | ✓ | 2.75.0 (2.117 존재) | — |
| flatc | 스키마 재생성(gh-trade 스크립트) | ✓ | 25.12.19 | — |
| clang / g++-15 | gh-trade 로컬 빌드 | ✓ (clang 21.0.0 응답 — 라이선스 게이트 해소됨) | — | cloud-verify(원격 빌드 VM) |
| gcloud + deployer SA | relay/server 배포 | 메모리상 존재(미확인) | — | — |
| 120 SSH(VPN/WG) | gh-trade 배포 | 이번 세션 미확인 | — | 사용자 실행 |
| 라이브 relay | 롤백 기준 | ✓ | `6b85c1e` | — |

**Missing dependencies with no fallback:** 없음(배포 권한은 사용자·메모리 자격증명 경로).
**Missing dependencies with fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest — relay `^4.1.4`(`vitest run`), server(`vitest` = **watch** — 반드시 `exec vitest run`), webapp(`vitest --run`), shared; pgTAP(로컬 Postgres 17 컨테이너); Playwright(webapp e2e) |
| Config file | `relay/vitest.config.ts`(include `tests/**/*.test.ts`, `src/**/*.test.ts`, setup `tests/setup.ts`), `webapp/vitest.config.ts`, `webapp/playwright.config.ts`, server vitest 기본 |
| Quick run command | `pnpm --filter @gh-radar/relay exec vitest run tests/<file>.test.ts` (실측: order-api 19 passed 0.55s · ws-order 92 passed 0.83s) |
| Full suite command | `.planning/config.json` `build_command` + `test_command`: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` · `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` + `pnpm --filter @gh-radar/server exec vitest run` + pgTAP |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | order.result rid 경로 불변(접수·거부·timeout·중복·narrowPending) · DB 쓰기 0 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts` | ✅ (수정) |
| D-01 | fanout 주문 분기가 `symbols` 만으로 열림 · OrderStore 결선 부재 | unit/grep | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` + `! grep -rn "OrderStore\|orderStore" relay/src` | ✅ / ❌ Wave 0 grep 게이트 |
| D-02 | 로컬 거부(order_no "") → `reject_seq` 행 2건이 서로 안 겹침 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql` | ❌ Wave 0 |
| D-03 | 적용 행이 매핑 사용자에게만 `journal.rows` 로 감(타 사용자 0) · 두 사용자 같은 DMA → 둘 다 받음 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts` | ❌ Wave 0 |
| D-03 | 카드 병합: 같은 id 는 lastSeq 큰 쪽, 푸시가 새 행 생성, `{t:"order"}` 무시 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/orders-api.test.ts` | ✅ (재작성) |
| D-04 | healthz journal 필드 · 장중 180초 초과/rejected → 503 · 창 밖 200 · 식별자 키 없음 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/order-api.test.ts` | ✅ (확장) |
| D-04 | `journal.state` delayed/live 전이·인증 스냅샷 · 카드 배지·안내 | unit | relay `tests/journal-observer.test.ts` · webapp `today-orders-card.test.tsx` | ❌ / ✅ |
| D-05 | 새 테이블 CHECK·UNIQUE·RLS·REVOKE · RPC EXECUTE 는 service_role 만 | pgTAP | 위 러너 `--test supabase/tests/dma_journal_schema.test.sql` | ❌ Wave 0 |
| D-05 | server `GET /api/orders` 가 RPC 1회 · user_id 는 requireAuth 값 · 쓰기 0 · bare array | integration | `pnpm --filter @gh-radar/server exec vitest run tests/routes/orders.test.ts` | ✅ (재작성) |
| D-06 | 매핑 동기화 원자 교체 · 조회 RPC 가 매핑 계좌 전 행(타 DMA 사용자 주문 포함) · 미매핑 사용자 0행 | pgTAP | 위 러너 | ❌ Wave 0 |
| D-07 | 계좌별 묶음 순서(relay accounts 순) · 390px ②줄 wrap(주문번호 비잘림) | unit + e2e | webapp `today-orders-card.test.tsx` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/me.spec.ts` | ✅ (확장) |
| D-08 | 출처 칩 3종·origin null 처리 · NXT 만 태그 · 로컬 거부 「—」 · 「· 수동」 부재 | unit | webapp `today-orders-card.test.tsx` | ✅ (확장) |
| D-09 | 관찰자 로그인 거부 → stopReconnect · state rejected · 재시도 0 | integration(fake gateway) | relay `tests/journal-observer.test.ts` | ❌ Wave 0 |
| D-09 (gh-trade) | 관찰자 연결의 주문·전략·시세 요청 거부 · Session 미부착 | C++ doctest | gh-trade `cloud-verify.sh`(gh-trade Phase 23 소관) | gh-trade |
| D-12 | since_seq 이어받기 · epoch 불일치 resync · 갭 감지 재접속 · 같은 배치 재적용 멱등 | integration + pgTAP | relay `journal-writer.test.ts` + pgTAP 「두 번 호출 → 불변」 | ❌ Wave 0 |
| D-12 | 투영 규칙(A/E/C/M/R, 단조, 체결 누적, 정정 이동, 취소 원주문, created_at = gw_time) | pgTAP | `dma_journal_apply.test.sql` | ❌ Wave 0 |
| D-13 | 백오프 재접속 무한 · 부팅 즉시 연결 · 종료 시 유실 0(커서 미전진) | integration | relay `journal-observer.test.ts` | ❌ Wave 0 |
| D-14 | 배포 순서·첫 거래일 대조 | manual-only | 체크포인트(브로커 체결내역 대조는 사용자만 가능) | — |

### Sampling Rate
- **Per task commit:** 해당 파일 quick run(위 표) + 변경 워크스페이스 typecheck.
- **Per wave merge:** 루트 build_command + test_command + server `exec vitest run` + pgTAP 2파일.
- **Phase gate:** 전량 green + `sync-relay-schema.sh --check` 차이 0 + Playwright `me.spec.ts` + (배포 후) `smoke-relay.sh` PASS, 그 뒤 `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `supabase/tests/dma_journal_schema.test.sql` — 테이블 제약·RLS·REVOKE·EXECUTE 권한(D-05, Pitfall 10)
- [ ] `supabase/tests/dma_journal_apply.test.sql` — 투영 규칙 표 전 행 + 멱등 + 로컬 거부 분리 + 매핑 조회(D-02·D-06·D-12)
- [ ] `relay/tests/helpers/fake-gateway.ts` 확장 — 관찰자 로그인 응답·JournalBatch 송출·거부(`frames.ts` 빌더 3종 추가)
- [ ] `relay/tests/journal-observer.test.ts` — 로그인·거부·재접속·76 무시·상태 전이·healthz 소스
- [ ] `relay/tests/journal-writer.test.ts` — 큐·배치·재시도·갭·상한 끊기(가짜 `supabase.rpc`)
- [ ] `relay/tests/journal-push.test.ts` — 사용자별 라우팅(T-15-02)·인증 스냅샷 `journal.state`
- [ ] grep 게이트: relay/src 에 `OrderStore`·`insertRequest`·`dma_orders` 쓰기 0, webapp 카드에 `label.meta` 렌더 0
- [ ] 프레임워크 설치: 없음(전부 존재)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | 관찰자 공유 비밀(상수시간 비교 — relay `secretMatches` 선례 `timingSafeEqual`), 거부 단일 문구, 비밀 거부 시 재시도 중단(D-13) |
| V3 Session Management | yes(간접) | 관찰자 연결은 Session 미부착 · 유휴 스윕 대상 포함 |
| V4 Access Control | yes | 행 가시성 = 조회 RPC 조인(user_id→dma_user_id→계좌), 푸시 = 사용자별 `#deliver` 필터, RPC EXECUTE service_role 전용, 게이트웨이 관찰자 요청 전면 거부(D-09) |
| V5 Input Validation | yes | 저널 파서 형식 가드(ISIN·계좌 길이 — 기존 `isValidIsin`·계좌 가드 재사용), SQL CHECK, zod(server `OrderListQuery`) |
| V6 Cryptography | no(신규 없음) | 비밀은 Secret Manager·600 파일, 전송은 기존 VPN/WG |
| V7 Error/Logging | yes | 비밀·계좌번호 로그 금지(`maskAccountNo`, pino redact 에 `dmaObserverSecret` 추가), PostgREST 오류는 `safePgError` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 로그인 사용자가 조회 RPC 에 남의 user_id 를 넣음 | Information Disclosure / IDOR | EXECUTE REVOKE(anon, authenticated) + server 가 requireAuth 값만 전달 |
| 관찰자 비밀 유출 → 외부가 전 계좌 통보 열람 | Information Disclosure | 9100 은 VPN/WG 전용(D-10), 비밀 비출력·600, 관찰자는 읽기 전용(주문 불가 — D-09) |
| 관찰자 연결로 주문·전략 요청 주입 | Elevation of Privilege | 게이트웨이 `ProcessPacket` 단일 관문 거부 |
| 푸시가 다른 사용자에게 샘 | Information Disclosure | 전역 브로드캐스트 함수 금지(T-15-02), 사용자별 매핑 필터 테스트 |
| 두 relay 가 같은 게이트웨이 저널을 동시에 적용 | Tampering | 이벤트 PK 멱등 + advisory lock |
| healthz 가 식별자 노출 | Information Disclosure | 필드명·값에 계좌/사용자 없음, smoke `health_probe` grep |
| dma_user_id 가 브라우저로 감 | Information Disclosure | 조회·푸시 컬럼에서 제외(D-08) |

## Sources

### Primary (HIGH confidence) — 이번 세션 Read/실행
- gh-radar: `relay/src/ws/order-handler.ts`(전량), `relay/src/ws/fanout.ts`(헤더·생성자·#onFirstMessage·#register·#deliver·#send), `relay/src/dma/{dma-client,session,msg-type,envelope}.ts`, `relay/src/hub/subscription-hub.ts`(#onOrderNotice), `relay/src/store/orders.ts`(헤더), `relay/src/order/{notice-status,order-api}.ts`, `relay/src/index.ts`, `relay/src/config.ts`, `packages/shared/src/{relay,marketHours,krxCalendar}.ts`, `server/src/{services/dma-orders,routes/orders}.ts`, `webapp/src/{lib/orders-api,lib/order-notices,components/trading/today-orders-card,components/trading/exchange-tag}.tsx?`, `account-panel.tsx`(OriginTag), migrations(dma_orders·dma_credentials·comovement RPC·m23), `scripts/{deploy-relay,setup-relay-iam,smoke-relay,verify-dma-orders-price-check}.sh`, `infra/relay/{README.md,Caddyfile}`, `ops/alert-relay-down.yaml`, `docs/relay-operations.md`, debug 2건, CONTEXT·DISCUSSION-LOG·목업.
- gh-trade(읽기 전용): `server/src/protocol/StockDMA.fbs`(MsgType·LoginReq/Resp·OrderResp·Envelope), `server/src/net/Gateway.{cpp,h}`(ProcessLoginReq·SendToSession·ProcessPacket·idle sweep·EnqueueLocked·BuildDirectOrderResp·송신 큐 상수), `server/src/app/Server.{cpp,h}`(WireExecutionCallback·BuildOrderRespEnvelope·SendOrderRespToSession·FanoutToAccountSessions), `server/src/broker/IBroker.h`(ExecutionReport·NotifyLocalReject), `server/src/trade/recorder/OrderRecorder.{h,cpp}`, `server/src/util/Config.h`, `config/users.toml.example`, `scripts/{deploy-config,deploy,sync-relay-schema}.sh`, `expected-vtable.txt`, `.planning/{STATE,ROADMAP}.md`.
- 실행: relay `order-api`(19)·`ws-order`(92), server `orders`(11), webapp 3파일(67) 전부 green; `curl https://dma.jx1.io/healthz` → `version 6b85c1e`; `git diff 6b85c1e HEAD -- relay …` 빈 출력; flatc 25.12.19; docker·이미지 존재.

### Secondary (MEDIUM confidence)
- Cloud Monitoring uptime check 응답 검증(콘텐츠·JSONPath 매처): https://cloud.google.com/monitoring/uptime-checks/response-validation
- gcloud uptime update 매처 플래그: https://docs.cloud.google.com/sdk/gcloud/reference/monitoring/uptime/update
- PostgreSQL plpgsql 오류 트래핑(서브트랜잭션): https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING

### Tertiary (LOW confidence)
- 없음(설계 제안은 Assumptions Log 에 [ASSUMED] 로 분리).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 0, 기존 버전·도구 실측.
- Architecture: MEDIUM — 현재 구조 사실은 HIGH, 와이어 계약·투영 설계는 gh-trade 합의 전 제안.
- Pitfalls: HIGH — 대부분 코드 상수·주석에 근거(큐 상한·핫패스·브로드캐스트·REVOKE).

**Research date:** 2026-09-24
**Valid until:** gh-trade Phase 23 discuss 전까지(계약 확정 시 Pattern A 갱신). 코드 사실은 2026-10-08 까지 유효로 본다(빠르게 움직이는 저장소 — 7~14일).
