# gh-radar 주문로그 · 저널 · 미체결 그리드 사실 정리 (2026-09-29, gh-trade-6d 회신용)

기획서(claude.ai/artifact/8L3dF7tJyqgsjKjaDLn1vk)는 gh-radar 세션에서도 읽히지 않는다(Claude Docs read → access deny, 공유 안 됨). 사용자가 공유하거나 본문을 붙여넣어야 한다.

## ① 「오늘 주문」 화면 · 테이블 · 쓰는 쪽

화면: `webapp/src/components/trading/today-orders-card.tsx` (`TodayOrdersCard`). My page(`me-client.tsx` 281행 부근)에서 AccountPanel 아래 페이지당 1회 렌더.
- 계좌별 묶음(소제목: 계좌 · 번호 · 상품명 · N건) → 데스크톱(≥1280) 표 / 모바일 2줄 카드 행.
- 표 컬럼: 시각 · 종목(이름+코드+NXT 태그) · 구분(▲매수/▼매도/취소/정정, `lib/order-notices.ts`) · 출처(상따/VI/수동 칩, null 이면 생략) · 수량 · 가격(묶음이면 min~max) · 상태(접수/부분체결/체결/취소/거부/정정) · 주문번호(+ (N건)).
- 모바일 ①줄: 종목명(유일 신축) · 코드 · NXT · 구분 · 출처 · (우)상태. ②줄: 시각 · 수량 · 가격 · (우)주문번호. 신축 항목은 종목명 하나 규율(⑤).
- `filledQty` · `modifiedQty` 는 행에 실려 오지만 화면에 그리지 않는다 → 잔량진행률 데이터는 이미 도착해 있음.
- 같은 키의 통보를 시간창(`MERGE_WINDOW_MS`, order-notices.ts 165행)으로 접어 1행(`MergedOrderNotice`: head / count / qty 합 / priceMin~Max / at / orderNoText).

데이터 원천 2개뿐 (`lib/orders-api.ts`):
1. REST `GET /api/orders` → server `routes/orders.ts` → `services/dma-orders.ts` → RPC `dma_journal_orders_for_user(p_user_id, p_trade_date)` 1회.
2. relay wss 푸시 `{t:"journal.rows", rows: JournalOrderRow[]}` (`relay/src/ws/fanout.ts deliverJournalRows`, 계좌 권한 사용자에게만).
같은 `id` 면 `lastSeq` 큰 쪽 승. 재조회 트리거: 마운트 1회 · relay ready 재진입 · journal.state delayed→live 전이. 폴링 없음. 세션 51 기반 `{t:"order"}` 는 토스트/전략로그 전용.

Supabase 테이블 (`supabase/migrations/20260924200000_dma_journal_tables.sql`, Phase 19). 전부 RLS + 정책 0 + anon/authenticated REVOKE = service_role 전용. 웹앱 직접 접근 없음.
- `dma_account_orders` — 주문 1건 = 1행 투영. 「오늘 주문」 원천.
  컬럼: id uuid PK · gateway · trade_date · account_no · order_no(로컬거부 NULL) · journal_epoch · reject_seq(로컬거부 키, order_no 와 XOR) · isin(12자) · exchange(KRX/NXT) · board · side(B/S/NULL) · order_type(N/M/C) · org_order_no · qty(체결이 접수보다 먼저면 NULL) · price(취소 0) · filled_qty · modified_qty(정정으로 새 번호로 이동한 수량) · status(accepted/partially_filled/filled/cancelled/rejected/modified) · result_code · notice_type(마지막 통보 1자) · message · origin(manual/limit_chaser/vi/NULL) · requester · request_kind · dma_user_id(감사용, 응답엔 안 실림) · first_seq · last_seq · created_at(첫 이벤트 gw_time, DEFAULT 없음) · updated_at(마지막 gw_time).
  유니크: (gateway, trade_date, account_no, order_no) / (gateway, journal_epoch, reject_seq). 조회 인덱스 (gateway, account_no, trade_date, created_at DESC).
- `dma_journal_events` — 저널 레코드 원문 1건 = 1행. PK (gateway, journal_epoch, seq) = 재생 멱등 게이트. 23 필드 그대로 + applied_at · apply_error(포이즌 격리).
- `dma_account_access` — 관찰자 로그인 응답의 dma_user_id → account_no 매핑 스냅샷(gateway 단위 원자 교체). 가시성 조인: user_id → dma_credentials.dma_user_id → dma_account_access → 계좌.
- `dma_journal_cursor` — gateway PK · journal_epoch · last_seq.
- 구 `dma_orders`(20260905, user_id 기준)는 Phase 19 D-05 로 동결. 조회하지 않는다.

쓰는 쪽 = relay 뿐. server 는 읽기 전용(쓰기 함수 없음). 앱은 REST/wss 로만.

## ② 저널(5/79/80)이 Supabase 에 쌓이는 형태

경로: gh-trade 게이트웨이 → 관찰자 소켓(5 `ObserverLoginReq` 송신 / 79 `ObserverLoginResp` · 80 `JournalBatch` 수신) → relay `journal/observer.ts`(상태기계) → `journal/codec.ts`(79/80 분기, 76·54 무시) → `dma/envelope.ts parseJournalBatch`(fbs `JournalRecord` 23 필드 → camelCase) → `journal/writer.ts`(동기 큐 적재, 직렬 워커, 최대 200건/배치) → RPC `dma_journal_apply(p_gateway, p_epoch, events jsonb)` 한 트랜잭션: advisory lock → `dma_journal_events` INSERT ON CONFLICT DO NOTHING → 삽입된 것만 `dma_journal_project` 투영 → 커서 전진 → 건드린 행을 공개 25 컬럼으로 반환 → relay 가 `toJournalOrderRow` 로 바꿔 fanout → `journal.rows` 푸시.

fbs `JournalRecord`(relay/src/generated/StockDMA.fbs 1158행, gh-trade Phase 23 8285a265 기준) 23 필드:
seq · trade_date · gw_time_ms · dma_user_id · account_no · isin · side · side_trusted · order_no · org_order_no · notice_type(A/E/C/M/R) · request_kind(New/Modify/Cancel/"") · requester · origin · exchange · board · order_price · order_qty · exec_price · exec_qty · result_code · message · local_reject.
relay 는 값 보정 없이 snake_case 키 1:1 로 RPC 에 넘긴다(`toApplyEvent`). 필수 키는 seq · trade_date · gw_time_ms.

투영 규칙 (`dma_journal_project`, migrations/20260924200100):
- 로컬 거부, 또는 주문번호 없는 R, 또는 C·M 거부(order_no == org_order_no) → reject_seq 키로 `rejected` 행 1개.
- A → accepted, qty · price 채움.
- E → filled_qty += exec_qty. 그 뒤 filled_qty + modified_qty >= qty 면 filled, 아니면 partially_filled.
- C(자기 번호 = 원주문: 거래소 자동취소) → 그 행 cancelled. C(별도 원주문) → 취소 요청 행(order_type C) + 원주문 행 cancelled.
- M → 정정 행(order_type M, qty = min(요청수량, 원주문 잔량)) + 원주문 modified_qty += 이동수량, 전량 이동 시 `modified`.
- 상태 단조(rank: accepted 1 < partially_filled 2 < 종결 3). 뒤로 가지 않는다.
- 시각은 gw_time_ms 정본(재생 시각 아님). 모르는 notice_type / request_kind / exec_qty ≤ 0 은 RAISE → apply_error 격리, 커서는 계속.
- 잔량 = qty − filled_qty − modified_qty 로 행에서 계산 가능(컬럼은 없음).

## ③ 미체결 그리드

컴포넌트: `webapp/src/components/orderbook/account-panel.tsx` (`AccountPanel`) 한 벌. shadcn `Table`(`@/components/ui/table`) 기반, 그리드 라이브러리 없음.
원천: relay `{t:"acct"}` 의 `unf: RelayUnfilled[]` (`packages/shared/src/relay.ts` 873행): orderNo · orgOrderNo · isin · side · price · orderQty · filledQty · unfilledQty · exchange · orderTime "HHMMSS" · queuedStatus · pendingStatus · board · pendingCancelSent · name? · code?. 저널 테이블과 무관한 라이브 스냅샷(gh-trade `UnfilledState`).

표면 3가지, 같은 파일:
- 기본 모드(My page `me-client.tsx`, 호가주문 탭): 데스크톱 ≥1280 표 — 주문번호 · 구분 · 종목 · 주문가 · 주문(orderQty) · 미체결(unfilledQty) · 취소 (account-panel.tsx 763~771행). 모바일 <1280 2줄 카드 — r1 종목명(신축)+구분 … (우)주문가 / r2 「미체결 {unfilledQty} / {orderQty}주」 … (우)취소 / r3 서버 상태 문구 (900~920행).
- 임베드 모드(작업대 하단 `workbench/shared-panels.tsx` 공용 패널 + 카드 「미체결」 탭 `card/card-tabs.tsx` 253행): 표만 — [종목 · 거래소](stockScope 면 제외) · 구분 · 주문가 · 「주문/미체결」 한 셀 `{orderQty} / {unfilledQty}` · 주문No · 취소 (1320행, 1409행).
- 잔량진행률 컬럼 / 2줄 목업 후보 자리: 기본 모드 표의 「주문」·「미체결」 두 열, 모바일 r2 줄, 임베드의 「주문/미체결」 셀.
- 규율: 회색 · 취소 버튼 숨김 판정은 `pendingCancelSent` 하나. queued/pending 문구는 표시만. 취소 수량 = 잔량 전부(D-21).

참고 정본: `.planning/phases/19-account-order-journal/19-GH-TRADE-HANDOFF.md`(23 필드 대응표) · `19-CONTEXT.md`.
