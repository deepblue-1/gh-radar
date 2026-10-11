---
phase: 19-account-order-journal
verified: 2026-10-03T13:10:00Z
status: passed
score: 18/18 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/19-account-order-journal/19-01-PLAN.md
  - .planning/phases/19-account-order-journal/19-01-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-02-PLAN.md
  - .planning/phases/19-account-order-journal/19-02-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-03-PLAN.md
  - .planning/phases/19-account-order-journal/19-03-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-04-PLAN.md
  - .planning/phases/19-account-order-journal/19-04-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-05-PLAN.md
  - .planning/phases/19-account-order-journal/19-05-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-06-PLAN.md
  - .planning/phases/19-account-order-journal/19-06-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-07-PLAN.md
  - .planning/phases/19-account-order-journal/19-07-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-08-PLAN.md
  - .planning/phases/19-account-order-journal/19-08-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-09-PLAN.md
  - .planning/phases/19-account-order-journal/19-09-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-10-PLAN.md
  - .planning/phases/19-account-order-journal/19-10-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-11-PLAN.md
  - .planning/phases/19-account-order-journal/19-11-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-12-PLAN.md
  - .planning/phases/19-account-order-journal/19-12-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-13-PLAN.md
  - .planning/phases/19-account-order-journal/19-13-SUMMARY.md
  - .planning/phases/19-account-order-journal/19-CONTEXT.md
  - .planning/phases/19-account-order-journal/19-RECONCILIATION.md
  - .planning/phases/19-account-order-journal/19-REVIEW.md
  - docs/relay-operations.md
  - infra/relay/README.md
  - ops/alert-relay-down.yaml
  - packages/shared/src/journal.ts
  - packages/shared/src/relay.ts
  - relay/src/config.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/msg-type.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/journal/access.ts
  - relay/src/journal/codec.ts
  - relay/src/journal/observer.ts
  - relay/src/journal/status.ts
  - relay/src/journal/trading-window.ts
  - relay/src/journal/types.ts
  - relay/src/journal/writer.ts
  - relay/src/order/order-api.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/tests/journal-boot.test.ts
  - relay/tests/journal-codec.test.ts
  - relay/tests/journal-gateway.test.ts
  - relay/tests/journal-observer.test.ts
  - relay/tests/journal-push.test.ts
  - relay/tests/journal-status.test.ts
  - relay/tests/journal-writer.test.ts
  - relay/tests/ws-order.test.ts
  - scripts/deploy-relay.sh
  - scripts/setup-relay-iam.sh
  - server/src/routes/orders.ts
  - server/src/services/dma-orders.ts
  - server/tests/routes/orders.test.ts
  - supabase/migrations/20260924200000_dma_journal_tables.sql
  - supabase/migrations/20260924200100_dma_journal_rpcs.sql
  - supabase/migrations/20260929190000_dma_gateway_identities.sql
  - supabase/tests/dma_journal_apply.test.sql
  - supabase/tests/dma_journal_schema.test.sql
  - webapp/src/components/trading/origin-tag.tsx
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/src/lib/order-notices.ts
  - webapp/src/lib/orders-api.ts
  - webapp/src/lib/use-relay-socket.ts
covered_digest: "v1:sha256:b6cf30d3951e842318c1f163e175abad402f1a9daa674476392500b76f9442bb"
behavior_unverified: 0
overrides_applied: 0
superseded:
  - truth: "D-06 가시성 = user_id → dma_credentials.dma_user_id → dma_account_access → 계좌 조인 하나 (19-01 · 19-04 · 19-12 문구)"
    superseded_by: "quick-260929-sas — supabase/migrations/20260929190000_dma_gateway_identities.sql (dma_visibility_identities 뷰 + dma_visible_accounts 헬퍼, 게이트웨이 인지)"
    note: "dma_journal_orders_for_user 본문이 게이트웨이 인지 가시성으로 교체됨. 시그니처·반환 모양·권한 동일(server 무수정). D-06 의 의도(같은 DMA 신원 공유 사용자 = 같은 행)는 유지 — 교체 이후 09-28~10-02 에서도 203=203 동일."
  - truth: "19-05 · 19-07 매핑/관찰자 단일 게이트웨이 가정 (JournalAccess.replace 하나 · 관찰자 1개 · 종료 순서 기록기 1개 drain)"
    superseded_by: "quick-260929-c8e (relay 관찰자 다중 업스트림 · KYOBO) + quick-260929-sas (추가 게이트웨이 푸시는 명시 신원 연결)"
    note: "주 게이트웨이(KB) 경로는 Phase 19 설계 그대로. index.ts 가 journalPipelines 로 일반화되고 종료 시 주문·전략 기록기를 함께 drain."
  - truth: "19-07 관찰자 연결은 로그인 외 요청 0 · 80 JournalBatch 단일 스트림"
    superseded_by: "Phase 25 (80 두 스트림: 주문 + 전략, journal.events) · Phase 26 (role 1 시세 관찰자 = 별도 연결)"
    note: "주문 저널 role 0 연결은 여전히 로그인 + LivePing 뿐(journal-gateway.test.ts 통과). 전략 스트림·시세 연결은 후속 phase 의 기록된 결정."
advisory:
  - finding: "WR-06 — dma_journal_orders_for_user 가 PostgREST max_rows(1000)에서 오래된 주문부터 조용히 잘림"
    category: other
    reason: "REST 는 setof RPC. 실측 최대 318행/일(공유 계좌)이라 현재 미발현이나 상따 활동이 많은 날 1,000건 도달 가능. jsonb 단일 반환 RPC 로 후속 전환 권장"
    evidence_status: "코드 리뷰 지적 · 운영 데이터상 미발현"
  - finding: "WR-08 — 통보 단위 묶기(mergeOrderNotices)를 주문 단위 행에 적용해 묶음 행의 상태·수량 표기가 어긋날 수 있음"
    category: other
    reason: "트레이더 판단 표면(상태 칸). 어떤 PLAN must_have 도 묶음 상태 정합을 단언하지 않아 gap 아님. 후속 정리 권장"
    evidence_status: "코드 리뷰 지적"
  - finding: "WR-01 — 전략 커서 읽기 실패가 주문 저널 관찰자 연결을 막음 (Phase 25 이후 결합)"
    category: architectural
    reason: "Phase 19 D-13 은 비밀+커서 읽기 후 붙기까지만 단언. 전략 마이그레이션이 이미 적용돼 현재 미발현"
    evidence_status: "코드 리뷰 지적"
  - finding: "WR-02 — 로그인 성공마다 백오프 리셋 → 로그인 뒤 결정적 실패는 1초 주기 재접속"
    category: architectural
    reason: "D-13 의 「상한 있는 무한 백오프」는 연결 실패 경로에서 성립. 로그인 후 결정적 실패 루프는 정상 경로 밖"
    evidence_status: "코드 리뷰 지적"
  - finding: "WR-03 · WR-04 · WR-05 · WR-09 — 게이트웨이 계약 위반(seq 재사용) · 빈 매핑 스냅샷 · apply_error 비가시 · 응답 유실 재시도 시 푸시 누락"
    category: other
    reason: "전부 정상 경로 밖 + 관측성/견고성. 운영 데이터(apply_error 0, seq 연속)에서 미발현"
    evidence_status: "코드 리뷰 지적"
  - finding: "WR-07 — 조회 실패 한 번이 이미 받은 행·푸시 행을 오류 문구로 가림 / IN-01 동시 재조회 순서 역전 / IN-02 notice-status.ts 낡은 주석 / IN-03 DMA_BROKER 가 게이트웨이 키 / IN-04 apply_error 재투영 경로 없음"
    category: other
    reason: "robustness · 문서 정합. 19-REVIEW.md 에 수정안 있음"
    evidence_status: "코드 리뷰 지적"
---

# Phase 19: 계좌별 주문기록 전용 연결 Verification Report

**Phase Goal:** relay↔gh-trade 게이트웨이 사이에 관찰자(읽기 전용) 기록 연결 1개를 장중 상시 유지해, 브라우저 접속 여부와 무관하게 모든 DMA 계정·계좌의 주문 통보(전략·수동 모두)를 seq 와 함께 받아 계좌 기준 테이블에 단독 기록한다. relay 가 끊겼다 붙으면 since_seq 이어받기로 공백을 메운다.
**Verified:** 2026-10-03T13:10:00Z
**Status:** passed
**Re-verification:** No — 최초 검증

적대적 자세로 시작했다(목표 미달성 가정). SUMMARY 서술이 아니라 현재 HEAD 의 코드·마이그레이션·테스트 실행으로 확인했고, 목표 문장의 각 절과 CONTEXT D-01~D-14 를 모두 증거로 닫았다. 반증은 나오지 않았다.

## Goal Achievement

### 목표 문장 (ROADMAP Goal 절 단위)

| # | 목표 절 | 상태 | 증거 |
|---|---------|------|------|
| G1 | 관찰자 기록 연결 1개를 상시 유지, 브라우저 접속과 무관 | ✓ VERIFIED | `relay/src/index.ts` 가 부팅 시 `journalObserver.start()` 로 사용자 접속과 무관하게 연결. `DmaClient` 상한 백오프 재접속. `journal-boot.test.ts`(실 프로세스 부팅), `journal-observer.test.ts` 통과. 운영: 09-28~10-02 사용자 세션 없이 seq 1~5062 적재 |
| G2 | 모든 DMA 계정·계좌 통보(접수·체결·정정·취소·거부, 전략·수동)를 seq 와 함께 수신 | ✓ VERIFIED | `dma_journal_events` PK `(gateway, journal_epoch, seq)`, `dma_journal_apply` 가 전 레코드 적재(매핑 여부 무관 — D-11). 운영 대조표: 계좌별 A/E/C/R 통보 모두 존재, 출처 상따·수동·VI 혼재, KB 계좌 2개 전부 기록 |
| G3 | 계좌 기준 테이블에 단독 기록 | ✓ VERIFIED | `dma_account_orders`(user_id 컬럼 없음). relay 에 `dma_orders` 쓰기 코드 0(`store/orders.ts` 삭제, `order-handler.ts` 에 supabase 호출 0 — grep 확인). `dma_orders` 최신 updated_at = 09-23(동결) |
| G4 | 끊겼다 붙으면 since_seq 이어받기 | ✓ VERIFIED | 로그인 요청 `sinceSeq` = 기록기 마지막 수신 seq(`journal-gateway.test.ts` 실 TCP: 끊김 뒤 `sinceSeq:2` 재로그인 확인), 커서는 적용 RPC 트랜잭션 안에서만 전진. 운영: 이벤트 seq 1~5062 빠진 번호 0 = `dma_journal_cursor.last_seq` |

### D-01~D-14 (CONTEXT 결정 = 요구사항 집합)

| # | 결정 | 상태 | 증거 |
|---|------|------|------|
| D-01 | 관찰자가 유일한 기록자, 사용자 세션 경로는 DB 무기록 · rid 즉시응답은 유지 | ✓ VERIFIED | `relay/src` 전체에서 `from("dma_orders")`/OrderStore/insertRequest/recordUnmatched/autoInsertRow/settleOriginal 0건. `order-handler.ts` 에 narrowPending 상관만 유지. `ws-order.test.ts` 통과. `dma_orders` 동결 실측 |
| D-02 | 로컬 거부도 기록, seq 로 식별 | ✓ VERIFIED | `reject_seq` 컬럼 + `(order_no IS NULL) <> (reject_seq IS NULL)` CHECK + 투영 RPC 의 local_reject 갈래. pgTAP `dma_journal_apply`(79) 직접 실행 PASS. 운영: 로컬 거부 수 = reject_seq 행 수(09-30 1/1, 3/3 …) |
| D-03 | 카드 원천 = REST + `journal.rows` 푸시(계좌 권한 사용자만), 세션 51 `{t:order}` 는 카드 병합에서 제외 | ✓ VERIFIED | `use-relay-socket.ts` `journal.rows` 케이스(id 기준 lastSeq 큰 쪽 upsert), 카드는 `mergeJournalRows(restored, journalRows, kstDateIso())`. `fanout.deliverJournalRows` 는 accountsOf(dmaUserId) 필터. `journal-push.test.ts`·카드/relay-socket 테스트 통과. `DmaOrderRow`/`DmaOrderOrigin` 참조 0 |
| D-04 | 끊김 두 곳에 노출 — 카드 「기록 지연」 표식 + `/healthz` journal · 장중 503 | ✓ VERIFIED | `journal.state` 프레임(10초 디바운스, `status.ts`), 카드 `today-orders-delayed`, `/healthz` `journal{…}` + `inTradingWindow`(08:00~20:00, `isKoreanMarketOpen` 미사용) 장중 180초 503. `journal-status.test.ts`·`order-api.test.ts` 통과. 운영문서 `ops/alert-relay-down.yaml` 8번 행 존재 |
| D-05 | 새 계좌 기준 테이블, `dma_orders` 동결, `GET /api/orders` 는 새 테이블만 · RPC 1회 | ✓ VERIFIED | 마이그레이션 4테이블(RLS · 정책 0 · anon/authenticated REVOKE). `server/src/services/dma-orders.ts` `listTodayOrders` = `rpc("dma_journal_orders_for_user")` 1회. pgTAP `dma_journal_schema`(93) 직접 실행 PASS. server `orders.test.ts` 21 통과 |
| D-06 | 가시성은 계좌, 매핑 원천 = 관찰자 로그인 응답 → DB 동기화, 공유 신원 사용자는 같은 행 | ✓ VERIFIED (조인 규칙은 superseded — 아래) | `JournalAccess.replace` + `dma_journal_sync_access` 원자 교체. 운영: 공유 사용자 둘이 09-28 203=203(id 집합 동일), 이후 4거래일 전부 동일 — 09-23 의 43 vs 2 비재현. 가시성 RPC 본문은 20260929190000 이 게이트웨이 인지 규칙으로 교체 |
| D-07 | 카드 B′ 계좌별 묶음 · 좁은 폭↔표 전환 유지 · 390px 줄바꿈 수정 | ✓ VERIFIED | `groupJournalRowsByAccount` 결선, `today-orders-card.test.tsx` 51 테스트 통과, 19-08 산출 스크린샷 8장(phone/wide × light/dark × delayed). 사용자 실사용 확인(RECONCILIATION) |
| D-08 | 출처 칩(상따·VI·수동, 미상 null 은 생략) · NXT 에만 거래소 태그 · 로컬 거부 주문번호 「—」 · 주문자 미표시 | ✓ VERIFIED | `origin-tag.tsx`(`originTagOf`), account-panel 이 같은 컴포넌트 import. `toJournalOrderRow` 는 공개 컬럼만(dma_user_id 제외), origin NULL 그대로. 카드·shared 테스트 통과 |
| D-09 | 관찰자 자격 분리 · 요청은 로그인뿐 · 거부 시 정지 | ✓ VERIFIED | `observer.ts` 거부 시 `stopReconnect` + state `rejected`, 재로그인 없음. 실 TCP 가짜 게이트웨이에서 관찰자 연결의 요청 종류 = 로그인 + LivePing 만(`journal-gateway.test.ts`). 79/80 은 `INBOUND_MSG_TYPES` 와 hub 명시 case 가 같은 커밋에서 추가(`msg-type.ts`, `subscription-hub.ts:1764`). 게이트웨이 측 서버 강제(G2)는 별도 저장소 — 운영에서 관찰자 로그인·수신 정상 |
| D-10 | 비밀 하나(IP 제한 없음), Secret Manager + env, 로그 무평문 | ✓ VERIFIED | `config.ts` production 에서 `DMA_OBSERVER_SECRET` 필수, `deploy-relay.sh` 가 `gh-radar-dma-observer-secret` 사전 검사 후 env-file 주입, `setup-relay-iam.sh` 접근권. `journal-boot.test.ts` 가 production 비밀 누락 시 기동 거부 확인 |
| D-11 | 게이트웨이 전 계좌 기록 · 매핑은 조회 시점 조인 | ✓ VERIFIED | 적용 RPC 는 매핑과 무관하게 전량 적재, 필터는 푸시/조회에만. pgTAP 에 「뒤늦은 매핑 → 앞선 행 조회」 단언. 운영 apply_error 0 |
| D-12 | 게이트웨이 당일 보관 + since_seq, 최종 정본은 Supabase · 멱등(PK 삽입 성공 = 1회 적용) | ✓ VERIFIED | `dma_journal_apply`: advisory lock → `INSERT … ON CONFLICT DO NOTHING` → 삽입된 경우만 투영 → 커서 전진(한 트랜잭션). pgTAP 로 재생 멱등·포이즌 격리·epoch 교체·투영 규칙(E 누적 · C/M/R · Q-ID) 직접 실행 PASS. 기록기 갭/중복/상한/직렬 재시도 `journal-writer.test.ts` 통과 |
| D-13 | 관찰자 24시간 상시, 상한 있는 백오프, 거부 시 정지, 장 시간은 알림 판정에만 | ✓ VERIFIED | `observer.ts`/`trading-window.ts` 머리 주석·코드 모두 연결 유지에 장 시간 미사용. SIGTERM 순서: HTTP → fanout → sessions → observer stop → writer drain(2초) → hub. 커서가 RPC 안에서만 전진해 drain 실패 시 유실 0 |
| D-14 | 한 번에 전환 + 첫 거래일 실장 대조 | ✓ VERIFIED | 19-11(원격 db push, migration list 어긋남 0) · 19-12(relay 43d4d0c 부팅 즉시 live, server 00051 배포, 사용자 go 뒤 push, Vercel Ready) · 19-13 RECONCILIATION(09-28~10-02 불일치 0, 사용자 종결 판정 2026-10-03) |

**Score:** 18/18 truths verified (목표 절 4 + 결정 14), behavior-unverified 0.

### Behavior-dependent 진실의 행동 증거

상태 전이·멱등·정리 불변식은 존재 확인에 그치지 않고 직접 실행했다.

| 항목 | 실행 | 결과 |
|------|------|------|
| 투영·멱등·포이즌 격리·epoch (D-02 · D-11 · D-12) | `bash scripts/verify-dma-orders-price-check.sh --until 20260924200100 --test supabase/tests/dma_journal_apply.test.sql` (로컬 컨테이너 재생, 44 마이그레이션) | `RESULT: PASS`, `not ok` 0, 계획 수 불일치 문구 없음 |
| 스키마 제약·RLS·권한 (D-05 · T-19-01/11) | 위와 같은 러너로 `dma_journal_schema.test.sql` | `RESULT: PASS` |
| 관찰자 상태기계·거부 정지·갭/상한 끊기 | relay vitest 10개 파일(journal-* 7 + ws-order + order-api + hub) | 314/314 통과 |
| 실 TCP 재접속 since_seq · 로그인뿐 요청 · 76 방송 무시 | `journal-gateway.test.ts` | 통과 |
| `GET /api/orders` RPC 1회 · req.userId 단일 | server `orders.test.ts` | 21/21 |
| 카드 병합·B′ 묶음·delayed 표식·journal.rows upsert | webapp 4개 파일 | 246/246 |
| shared 매퍼 | `journal.test.ts` | 7/7 |

pgTAP 러너는 마이그레이션을 `--until 20260924200100` 까지만 재생했으므로 19-01~03 시점 RPC 본문을 검증한 것이다. 이후 교체된 조회 RPC(superseded 항목)는 운영 대조(203=203)와 server 테스트로 갈음했다.

### Required Artifacts / Key Links

| 산출물 | 상태 | 비고 |
|--------|------|------|
| `20260924200000_dma_journal_tables.sql`, `20260924200100_dma_journal_rpcs.sql` | ✓ VERIFIED | 존재·실질·원격 적용(19-11 migration list). 함수 6종 REVOKE anon/authenticated + service_role GRANT 확인 |
| `supabase/tests/dma_journal_{apply,schema}.test.sql` | ✓ VERIFIED | 79 · 93 계획 단언, 실행 PASS |
| `relay/src/journal/{observer,writer,access,codec,status,trading-window,types}.ts` | ✓ VERIFIED | 실질 구현 + `index.ts` 결선(`journalWriter.on("applied") → fanout.deliverJournalRows`, `journalStatus.on("frame") → deliverJournalState`) |
| `relay/src/dma/{envelope,msg-type}.ts` · hub case | ✓ VERIFIED | 79/80 화이트리스트와 hub 명시 case 동시 존재 |
| `packages/shared/src/{journal,relay}.ts` | ✓ VERIFIED | `JournalOrderRow` · `toJournalOrderRow` · `journal.rows`/`journal.state` 가 `RelayOutbound` 유니온에 포함 |
| `server` 라우트·서비스 | ✓ VERIFIED | RPC 1회, 쓰기 함수 없음 |
| webapp 카드·origin-tag·orders-api·use-relay-socket | ✓ VERIFIED | 와이어링·데이터 흐름(REST + wss → mergeJournalRows → group → 렌더) 확인 |
| 배포·IAM·알림 문서 | ✓ VERIFIED | 스크립트·`ops/alert-relay-down.yaml`·`docs/relay-operations.md` 존재, 관찰자 비밀 항목 포함 |

### Data-Flow Trace (Level 4)

| 컴포넌트 | 데이터 | 원천 | 실데이터 | 상태 |
|----------|--------|------|----------|------|
| TodayOrdersCard | `restored` | `GET /api/orders` → `dma_journal_orders_for_user` RPC → `dma_account_orders` | 운영에서 계좌당 105~318행/일 | ✓ FLOWING |
| TodayOrdersCard | `journalRows` | relay 기록기 applied → 계좌 권한 사용자 `journal.rows` | 단위·통합 테스트 + 운영 푸시 | ✓ FLOWING |
| `/healthz` journal | JournalStatus | 관찰자 상태 이벤트 | 배포 직후 `state: live` 확인(19-12) | ✓ FLOWING |

### Requirements Coverage

ROADMAP 의 Requirements 가 TBD 이고 `.planning/REQUIREMENTS.md` 에 Phase 19 로 매핑된 ID 가 없다. 지시대로 CONTEXT D-01~D-14 를 요구사항 집합으로 삼았다. 13개 PLAN frontmatter 의 `requirements` 합집합이 D-01~D-14 를 전부 덮는다(D-01: 02·12·13, D-02: 01·03·09·13, D-03: 04·05·06·12, D-04: 04·06·07·08·10, D-05: 01·02·04·06·11·12, D-06: 01·04·05·12·13, D-07: 08, D-08: 03·04·06·08, D-09: 01·07·09·11, D-10: 07·10·11, D-11: 01·05·12·13, D-12: 01·03·05·07·09·13, D-13: 07·09·10·12, D-14: 10·11·12·13). **ORPHANED 요구사항 없음.**

### Anti-Patterns

| 검사 | 결과 |
|------|------|
| `TBD`/`FIXME`/`XXX` 부채 마커 (Phase 19 수정 파일 전체) | 0건 |
| `TODO`/`HACK`/`PLACEHOLDER` (journal · 카드 · dma-orders) | 0건 |
| 스텁 의심 (빈 구현 · 하드코딩 빈 데이터 렌더) | 해당 없음 — 상태 초기값은 fetch/푸시가 채움 |
| 낡은 주석 | `relay/src/order/notice-status.ts` 머리 주석이 동결된 `dma_orders` 를 현역으로 서술(IN-02) — Info |

### Probe Execution

PLAN 이 선언한 프로브 스크립트 없음(pgTAP 은 위 행동 증거에서 실행). SKIPPED.

### Deferred Items

`deferred-items.md` 의 두 항목(pgTAP 러너가 계획 수 불일치를 통과시킴, 표 머리 `.num` 정렬)은 Phase 19 범위 밖 기록 사항이며 later phase 로 명시 배정되지 않았다. 목표 달성과 무관하므로 gap 아님. 러너 문제는 이번 실행 출력에서 `Looks like you planned` 문구가 없음을 확인해 영향 배제했다.

### Human Verification Required

없음. 시각 항목(B′ 레이아웃 · 390px 줄바꿈 · 기록 지연 표식)은 e2e/컴포넌트 테스트와 스크린샷으로 갖춰져 있고 사용자가 프로덕션 실사용으로 확인·종결했다(19-RECONCILIATION, 2026-10-03). 브로커 체결내역·게이트웨이 `MMDD_order.bin` 과의 건별 대조는 사용자 판단으로 생략됐으나 seq 연속성(5062/5062)으로 게이트웨이 저널 전량 수신이 보장되고 종결 판정은 사용자 소관이다.

### 검증 한계 (투명성)

- 프로덕션 DB·relay 로그에 직접 접근하지 않았다. 운영 수치는 19-RECONCILIATION · 19-12/13 SUMMARY 및 요청에 첨부된 수집 결과를 근거로 삼았다. relay 컨테이너 로그는 수집 불가였다 — 「실제 끊김이 있었고 이어받기로 메워졌다」 는 운영 관측이 아니라 실 TCP 통합 테스트와 seq 연속성으로 뒷받침된다.
- gh-trade 게이트웨이(관찰자 계약 G1 · 서버측 요청 거부 G2)는 별도 저장소다. relay 측 계약 소비(코덱 · 화이트리스트 · 로그인 · 배치)와 운영에서의 정상 수신으로 확인했고 게이트웨이 소스는 보지 않았다.
- Playwright e2e 와 전체 스위트는 실행하지 않았다(회귀 게이트: relay 915 · webapp 3182 통과를 요청자가 제공).

### Gaps Summary

갭 없음. 목표 문장 4절과 D-01~D-14 가 코드·테스트·운영 대조로 모두 닫혔다. Supersede 3건은 후속 phase/quick 의 기록된 결정이 Phase 19 산출물을 의도적으로 교체한 것으로 gap 이 아니다. 코드 리뷰 지적 13건(Critical 0 · Warning 9 · Info 4)은 정상 경로 밖 견고성이며, 어떤 PLAN must_have 도 위반하지 않아 advisory 로 남긴다. 우선 처리 후보는 WR-06(1,000행 절단 — 후속 jsonb RPC)과 WR-08(묶음 행 상태 표기), 그다음 WR-05(apply_error 가시성)다.

---

_Verified: 2026-10-03T13:10:00Z_
_Verifier: Claude (gsd-verifier)_
