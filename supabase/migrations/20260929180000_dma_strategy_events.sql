-- ============================================================
-- Phase 25 Plan 01 — 상따 전략 이벤트 원문 테이블 + 전략 커서 칸 (주문로그 · 잔량진행률).
--
-- relay 관찰자 연결이 gh-trade 게이트웨이 80 `JournalBatch` 의 두 번째 스트림(`strategy_events`)을 받아
-- `dma_strategy_apply` RPC(20260929180100) 한 번으로 이 테이블에 적재한다. 필드 이름 · enum 번호는 gh-trade
-- `.fbs` 5f49cfa5(blob f08677d9) `table StrategyEvent` 43필드와 1:1 인 one-way 계약이다(G1 통보 (c)).
-- 웹앱은 이 테이블에 직접 닿지 않는다 — server 가 조회 RPC(25-03)로 읽고, relay 가 적용 RPC 반환 rows 를
-- `journal.events` 로 푸시한다.
--
-- 결정 근거(Phase 25 CONTEXT 「이미 확정된 것」):
--   - **원문 보존 · 투영 없음.** 이벤트는 불변 원문이라 삽입뿐이다. 주문 저널(dma_journal_events →
--     dma_account_orders 투영)과 달리 투영 테이블이 없다 — 표시 문장은 shared 조립기가 만든다(D-09).
--   - **같은 epoch · 별도 seq 공간.** 게이트웨이 전략 저널은 주문 저널과 같은 `journal_epoch` 를 쓰지만 seq 는
--     1 부터 따로 센다(G1 (e)). 그래서 PK 는 주문 저널과 같은 모양 `(gateway, journal_epoch, seq)` 이고 멱등
--     게이트다 — 삽입 성공 = 1회 적재. 커서는 `dma_journal_cursor` 같은 행의 **전략 칸 두 개**다.
--   - **가시성은 조회 RPC 조인.** 주문 이벤트는 `account_no` → `dma_account_access` 조인, 시세 이벤트(kind 1·2 —
--     계좌 없음)는 자격증명 보유자 전원(D-07). 이 테이블 자체에는 사용자 칸이 없다.
--   - **enum 칸(kind · group · cond_metric · ev_kind · cancel_reason · queue_case)에 CHECK 없음.** G1 ⓓ 가 v0.1
--     밖 말미 추가(CondMetric 6·7 · CancelReason 7·8·9)를 이미 냈고 앞으로도 말미 추가가 온다. 원문 보존
--     칸에서 CHECK 로 거부하면 PK 멱등 게이트 자체가 사라져 그 seq 가 영원히 재시도된다(주문 저널 ① 과 같은 이유).
--     표시는 모르는 값을 원문 숫자로 그린다(D-10).
--   - `dma_user_id` 는 감사 칸이다 — 적재만 하고 적용 · 조회 RPC 어디에서도 반환하지 않는다(T-19-08).
--   - `gw_time_ms` 는 원문 ms(bigint) 그대로 — 정렬 · 반환의 정본이다(RESEARCH Pattern 4). timestamptz 로 바꾸면
--     ms 3자리 표시 · 정렬 동률 판정이 변환을 한 번 더 거친다.
--   - `"group"` 은 예약어라 따옴표 칸 이름이다 — JSON 키 `group` 과 1:1 을 지키려고 이름을 바꾸지 않는다.
--   - 없는 값은 0 / '' / false / '{}' (와이어 규약 — 게이트웨이도 없는 값을 0/"" 로 싣는다) — NULL 칸 없음.
--   T-19-01 · T-25-03: RLS 활성 + 접근 규칙 0개 + anon/authenticated 명시 REVOKE(주문 저널 4줄 구성 그대로).
--   자동 메모리 feedback_supabase_rpc_revoke: `REVOKE ... FROM PUBLIC` 단독은 플랫폼 auto-grant 에 덮인다.
--
-- 커서 칸:
--   `strategy_journal_epoch` 는 NULL 허용이다 — 기존 행(주문 스트림만 적용된 게이트웨이)에 전략 커서가 아직
--   없다는 뜻이고, relay 기록기는 NULL/빈 값을 「커서 없음」 으로 읽어 since 0 부터 받는다(이관 없음 — 전략
--   스트림은 보관분 처음부터 받는 것이 정답 · RESEARCH Runtime State).
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 말 것.** 서비스롤(relay · server) 전용이다.
--   - 원격 적용. 이 파일은 원격 미적용으로 커밋되고 25-11 에서 사용자가 `supabase db push` 한다.
--   - 보관 기간 정리(purge) 잡 — 주문 저널과 같이 감사 기록이라 지우지 않는 것이 기본값이다.
-- ============================================================

BEGIN;

CREATE TABLE public.dma_strategy_events (
  gateway            text        NOT NULL,                       -- 게이트웨이(브로커) 식별자, 예: 'KB'
  journal_epoch      text        NOT NULL,                       -- 주문 저널과 같은 epoch(별도 seq 공간)
  seq                bigint      NOT NULL CHECK (seq > 0),       -- 전략 스트림 seq — 조밀 · 단조
  trade_date         date        NOT NULL,                       -- KST 발생일
  gw_time_ms         bigint      NOT NULL,                       -- 발생 epoch ms 원문(주문 이벤트 = 전송 직전 시각)
  kind               smallint    NOT NULL DEFAULT 0,             -- StrategyEventKind(CHECK 없음 — 말미 추가 수용)
  "group"            smallint    NOT NULL DEFAULT 0,             -- OrderGroup — JSON 키 group 과 1:1(예약어라 따옴표)
  exchange           text        NOT NULL DEFAULT '',            -- KRX/NXT
  isin               text        NOT NULL DEFAULT '',
  cum_volume         bigint      NOT NULL DEFAULT 0,             -- 이벤트 시점 그 거래소 누적거래량
  dma_user_id        text        NOT NULL DEFAULT '',            -- 감사 칸 — 반환 금지(T-19-08). 시세 이벤트는 ''
  account_no         text        NOT NULL DEFAULT '',            -- 주문 이벤트만. 게이트웨이 정규화값 그대로
  order_no           text        NOT NULL DEFAULT '',            -- 없으면 ''(거부 · 시세)
  price              integer     NOT NULL DEFAULT 0,
  qty                integer     NOT NULL DEFAULT 0,
  order_condition    text        NOT NULL DEFAULT '',
  reason_code        text        NOT NULL DEFAULT '',            -- 서버 OrderReasonName 원문 — 연산자 판정 키
  cond_threshold     bigint      NOT NULL DEFAULT 0,
  cond_actual        bigint      NOT NULL DEFAULT 0,
  cond_metric        smallint    NOT NULL DEFAULT 0,             -- CondMetric(CHECK 없음)
  ev_kind            smallint    NOT NULL DEFAULT 0,             -- EvidenceKind(CHECK 없음)
  ev_price           integer     NOT NULL DEFAULT 0,
  ev_qty_before      bigint      NOT NULL DEFAULT 0,
  ev_qty_after       bigint      NOT NULL DEFAULT 0,
  ev_trade_qty       bigint      NOT NULL DEFAULT 0,
  limit_bid_qty      bigint      NOT NULL DEFAULT 0,
  bid1_price         integer     NOT NULL DEFAULT 0,
  bid1_qty           bigint      NOT NULL DEFAULT 0,
  accept_latency_us  integer     NOT NULL DEFAULT 0,             -- 0 = 미측정
  immediate_fill_qty bigint      NOT NULL DEFAULT 0,
  queue_case         smallint    NOT NULL DEFAULT 0,             -- CHECK 없음
  base_cum           bigint      NOT NULL DEFAULT 0,
  ahead_qty          bigint      NOT NULL DEFAULT 0,
  expected_cum       bigint      NOT NULL DEFAULT 0,
  error_volume       bigint      NOT NULL DEFAULT 0,             -- 부호 있음
  remaining_volume   bigint      NOT NULL DEFAULT 0,
  has_remaining      boolean     NOT NULL DEFAULT false,
  cancel_reason      smallint    NOT NULL DEFAULT 0,             -- CancelReason(CHECK 없음 — 7~9 말미 추가)
  result_code        integer     NOT NULL DEFAULT 0,
  message            text        NOT NULL DEFAULT '',
  entry_round        integer     NOT NULL DEFAULT 0,
  snap_qty           bigint[]    NOT NULL DEFAULT '{}',          -- 상한가진입 즉시 · 1초 · 3초 매수잔량(길이 0~3)
  snap_cum           bigint[]    NOT NULL DEFAULT '{}',
  ask_qty_at_limit   bigint      NOT NULL DEFAULT 0,
  open_at_limit      boolean     NOT NULL DEFAULT false,
  applied_at         timestamptz NOT NULL DEFAULT now(),         -- DB 적용 시각(발생 시각 아님) — 반환 금지
  PRIMARY KEY (gateway, journal_epoch, seq)
);

-- 조회 RPC(25-03)의 「그날 · 게이트웨이 · 계좌」 범위 조회.
CREATE INDEX idx_dma_strategy_events_day
  ON public.dma_strategy_events (trade_date, gateway, account_no);

-- 오늘 주문 펼침 타임라인(주문번호별 이벤트) — 주문번호 있는 주문 이벤트만.
CREATE INDEX idx_dma_strategy_events_order
  ON public.dma_strategy_events (gateway, trade_date, account_no, order_no)
  WHERE order_no <> '';

-- ── 전략 커서 칸 — 같은 게이트웨이 행에서 주문 커서와 독립 ─────────────
ALTER TABLE public.dma_journal_cursor
  ADD COLUMN strategy_journal_epoch text,
  ADD COLUMN strategy_last_seq bigint NOT NULL DEFAULT 0 CHECK (strategy_last_seq >= 0);

-- ── 서비스롤 전용 잠금: 주문 저널 테이블과 동일 구성 (RLS 활성 + 접근 규칙 0개 = default deny) ──
ALTER TABLE public.dma_strategy_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_strategy_events FROM PUBLIC;
REVOKE ALL ON public.dma_strategy_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_strategy_events TO service_role;

COMMIT;
