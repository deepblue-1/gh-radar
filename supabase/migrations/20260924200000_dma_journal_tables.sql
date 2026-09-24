-- ============================================================
-- Phase 19 Plan 01 — 계좌별 주문기록 저널 테이블 4종 CREATE (D-05, D-06, D-11, D-12).
--
-- relay 의 관찰자(읽기 전용) 연결이 gh-trade 게이트웨이 저널 레코드(seq 부여)를 받아
-- `dma_journal_apply` RPC(20260924200100) 한 번으로 이 테이블들에 기록한다.
--   ① dma_journal_events  — 저널 레코드 원문 1건 = 1행. PK 가 재생 멱등의 유일한 근거.
--   ② dma_account_orders  — 주문 1건 = 1행 투영(계좌 기준). 「오늘 주문」 카드의 원천.
--   ③ dma_account_access  — DMA 사용자 → 계좌 매핑 스냅샷(관찰자 로그인 응답이 원천).
--   ④ dma_journal_cursor  — 게이트웨이별 마지막 적용 seq(relay 재시작 뒤 since_seq).
-- 웹앱은 이 테이블에 직접 닿지 않는다. server 가 `dma_journal_orders_for_user` RPC 로 읽는다.
--
-- 결정 근거:
--   D-05: **새 계좌 기준 테이블.** `user_id` 컬럼이 없고 계좌·주문번호·seq 가 키다.
--         `dma_orders` 는 전환 시점부터 쓰기를 멈추고 과거 기록으로 둔다 — 이관·복사 없음.
--         이 마이그레이션은 `dma_orders` 를 한 줄도 건드리지 않는다(동결).
--   D-06: 행 가시성은 계좌로 가른다. 매핑 원천은 관찰자 로그인 응답(users.toml 평탄화)이고,
--         users.toml 은 핫리로드가 없어 로그인 시점 스냅샷이 정본이다 → ③ 은 원자 교체된다.
--         `dma_credentials.dma_user_id` 가 UNIQUE 가 아니므로(여러 gh-radar 사용자 공유)
--         같은 DMA 계정의 사용자들은 같은 행을 본다.
--   D-11: 기록 범위는 게이트웨이 전 계좌다. gh-radar 에 매핑되지 않은 DMA 사용자·계좌의 통보도
--         ② 에 행으로 남는다. 매핑이 뒤에 생기면 그날 앞선 행이 바로 조회된다(조회 시점 조인).
--   D-12: 정본은 Supabase 다. 게이트웨이 디스크 저널은 relay 부재 구간을 넘기는 버퍼일 뿐이다.
--         since_seq 재생이 안전하려면 적용이 멱등이어야 한다 — ① 의 PK
--         `(gateway, journal_epoch, seq)` 삽입 성공 = 1회 적용(체결 수량 누적은 멱등이 아니다).
--   T-19-11 (Information Disclosure): 네 테이블 모두 RLS 활성 + 접근 규칙 0개 +
--         anon/authenticated 명시 REVOKE. `dma_credentials` 50-54 와 같은 4줄 구성.
--   자동 메모리 feedback_supabase_rpc_revoke: `REVOKE ... FROM PUBLIC` 단독은 플랫폼
--         auto-grant 에 덮인다 → anon, authenticated 를 이름으로 REVOKE.
--
-- 함정:
--   - Pitfall 5 — **재생 시각이 주문 시각이 된다.** relay 가 저녁에 재생한 오전 주문이
--     `DEFAULT now()` 로 찍히면 카드 정렬·「오늘」 경계가 틀어진다. 그래서 ② 의 `created_at`·
--     `updated_at` 에는 DEFAULT 가 없고 레코드의 게이트웨이 시각(gw_time_ms)을 넣는다.
--     DB `now()` 는 ① `applied_at`·③ `synced_at`·④ `updated_at`(적용 시각 자체가 의미인 칸)에만.
--   - Pitfall 6 — **빈 주문번호 upsert 가 서로 다른 거부를 한 행에 겹친다.** 로컬 거부(D-02)는
--     주문번호가 없으므로 `reject_seq`(= 그 레코드의 seq) 로 식별한다.
--     `(order_no IS NULL) <> (reject_seq IS NULL)` 로 두 키 중 정확히 하나만 갖게 한다.
--   - Pitfall 7 — **계좌번호는 게이트웨이 정규화값 그대로.** users.toml 도 KB 통보도 gh-trade
--     `NormalizeAccountNo` 를 거친 값이다. DB·relay 가 앞 0 을 붙이거나 떼면 ② ↔ ③ 조인이
--     0행이 된다. 여기서 형식 CHECK·정규화를 하지 않는다.
--   - ① 에는 값 CHECK 를 걸지 않는다. 원문 보존 칸이라, 여기서 거부하면 멱등 게이트(PK 삽입)
--     자체가 사라져 그 seq 가 영원히 재시도된다. 형식 이상은 ② 투영의 CHECK 가 막고
--     `apply_error` 에 사유가 남는다(포이즌 격리).
--   - ② `order_no` 에 형식 CHECK 를 걸지 않는다. 예약 주문 Q-ID(`^Q[0-9]{9}$`)의
--     접수·취소 회신도 같은 칸에 들어간다(오케스트레이터 Q3).
--   - `isin` 에 FK 를 걸지 않는다(`dma_orders` 와 같은 이유 — stocks.isin 이 비어 있을 수 있다).
--     12자 CHECK 로 단축코드 혼입만 막는다.
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 말 것.** 서비스롤(relay·server) 전용이다. 규칙을 하나라도
--     만드는 순간 브라우저(PostgREST)에서 닿는 경로가 열린다.
--   - `dma_orders` 수정·이관·삭제(D-05 동결 — 정리는 deferred).
--   - 비밀번호·비밀 칸. ③ 은 계좌 매핑만 담는다(users.toml 의 비밀번호는 싣지 않는다).
--   - ② `market` 컬럼. 게이트웨이 ExecutionReport 에 market 이 없다(RESEARCH Pattern A).
--   - 보관 기간 정리(purge) 잡. 감사 기록이라 지우지 않는 것이 기본값이다(RESEARCH Open Q8).
-- ============================================================

BEGIN;

-- ── ① 저널 레코드 원문 ───────────────────────────────────────────
-- 키 목록은 relay 기록기(19-05)와의 계약이다 — dma_journal_apply 가 같은 이름의 JSON 키를 읽는다.
CREATE TABLE public.dma_journal_events (
  gateway        text        NOT NULL,                        -- 게이트웨이(브로커) 식별자, 예: 'KB'
  journal_epoch  text        NOT NULL,                        -- 저널 저장소 신원(초기화되면 바뀐다 — Pitfall 3)
  seq            bigint      NOT NULL CHECK (seq > 0),        -- 게이트웨이 전역 단조·조밀 seq
  trade_date     date        NOT NULL,                        -- KST 레코드 발생일
  gw_time        timestamptz NOT NULL,                        -- 게이트웨이 벽시계(gw_time_ms) — 표시 시각의 정본
  dma_user_id    text        NOT NULL DEFAULT '',             -- 발주 세션 DMA user. 모르면 ''(재시작 뒤 termId=0)
  account_no     text        NOT NULL,                        -- 게이트웨이 정규화값 그대로(Pitfall 7)
  isin           text        NOT NULL,
  side           text        NOT NULL DEFAULT '',             -- 'B'/'S'/''
  side_trusted   boolean     NOT NULL DEFAULT false,          -- C/M 에서 원주문 메타로 채운 값인지
  order_no       text        NOT NULL DEFAULT '',             -- 로컬 거부는 ''
  org_order_no   text        NOT NULL DEFAULT '',
  notice_type    text        NOT NULL DEFAULT '',             -- A/E/C/M/R 원문
  request_kind   text        NOT NULL DEFAULT '',             -- New/Modify/Cancel/''
  requester      text        NOT NULL DEFAULT '',             -- 'Manual'/''
  origin         text        NOT NULL DEFAULT '',             -- Manual/LimitChaser/VITrigger/''
  exchange       text        NOT NULL DEFAULT '',             -- KRX/NXT
  board          text        NOT NULL DEFAULT '',             -- G2/G3/''
  order_price    integer     NOT NULL DEFAULT 0,
  order_qty      integer     NOT NULL DEFAULT 0,
  exec_price     integer     NOT NULL DEFAULT 0,
  exec_qty       integer     NOT NULL DEFAULT 0,
  result_code    integer     NOT NULL DEFAULT 0,
  message        text        NOT NULL DEFAULT '',             -- 게이트웨이 조립 문구 — 파싱하지 않는다
  local_reject   boolean     NOT NULL DEFAULT false,          -- 게이트웨이 로컬 거부(D-02)
  applied_at     timestamptz NOT NULL DEFAULT now(),          -- DB 적용 시각(주문 시각 아님)
  apply_error    text,                                        -- 투영 실패 사유(포이즌 격리). NULL = 정상 투영
  PRIMARY KEY (gateway, journal_epoch, seq)
);

CREATE INDEX idx_dma_journal_events_account_day
  ON public.dma_journal_events (gateway, account_no, trade_date);

-- ── ② 계좌 기준 주문 투영 ─────────────────────────────────────────
-- 주문 1건 = 1행. 연속 통보로 상태가 단조 전이한다(dma_journal_next_status — 뒤로 가지 않는다).
CREATE TABLE public.dma_account_orders (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway       text        NOT NULL,
  trade_date    date        NOT NULL,
  account_no    text        NOT NULL,                          -- 게이트웨이 정규화값 그대로(Pitfall 7)
  order_no      text,                                          -- 주문번호 또는 Q-ID. 로컬 거부 행은 NULL
  journal_epoch text,                                          -- reject_seq 행의 seq 네임스페이스
  reject_seq    bigint,                                        -- 로컬/접수 전 거부 행 키(D-02, Pitfall 6)
  isin          text        NOT NULL CHECK (length(isin) = 12),
  exchange      text        NOT NULL CHECK (exchange IN ('KRX','NXT')),
  board         text,
  side          text        CHECK (side IN ('B','S')),         -- 모르면 NULL(C/M 통보의 side 는 부정확할 수 있다)
  order_type    text        NOT NULL CHECK (order_type IN ('N','M','C')),
  org_order_no  text,
  qty           integer     CHECK (qty > 0),                   -- 체결이 접수보다 먼저 오면 NULL
  price         integer     CHECK (price >= 0),                -- 취소는 0 이 정상
  filled_qty    integer     NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
  modified_qty  integer     NOT NULL DEFAULT 0 CHECK (modified_qty >= 0),
  status        text        NOT NULL CHECK (status IN ('accepted','partially_filled','filled','cancelled','rejected','modified')),
  result_code   integer,
  notice_type   text,                                          -- 마지막 통보 원문 1자 — CHECK 없음은 의도
  message       text,
  origin        text        CHECK (origin IN ('manual','limit_chaser','vi')),  -- 미상은 NULL(D-08 보충 — 칩 생략)
  requester     text,
  request_kind  text,
  dma_user_id   text,                                          -- 감사용. 조회·푸시 컬럼에 싣지 않는다(D-08 — 주문자 표시 안 함, T-19-08)
  first_seq     bigint      NOT NULL,
  last_seq      bigint      NOT NULL,                          -- 웹앱 병합의 최신성 정본(같은 id 면 큰 쪽)
  created_at    timestamptz NOT NULL,                          -- 첫 이벤트 gw_time — DEFAULT 금지(Pitfall 5)
  updated_at    timestamptz NOT NULL,                          -- 마지막 이벤트 gw_time — DEFAULT 금지(Pitfall 5)
  CONSTRAINT dma_account_orders_key_xor    CHECK ((order_no IS NULL) <> (reject_seq IS NULL)),
  CONSTRAINT dma_account_orders_reject_epoch CHECK (reject_seq IS NULL OR journal_epoch IS NOT NULL)
);

-- 주문번호 행의 멱등 upsert 키 — (게이트웨이, KST 거래일, 계좌, 주문번호).
CREATE UNIQUE INDEX uq_dma_account_orders_order_no
  ON public.dma_account_orders (gateway, trade_date, account_no, order_no)
  WHERE order_no IS NOT NULL;

-- 로컬 거부 행 키 — 같은 epoch 의 seq 는 하나뿐이다.
CREATE UNIQUE INDEX uq_dma_account_orders_reject
  ON public.dma_account_orders (gateway, journal_epoch, reject_seq)
  WHERE reject_seq IS NOT NULL;

-- 「오늘 주문」 조회 형태 — 계좌·거래일 필터 후 최신순.
CREATE INDEX idx_dma_account_orders_account_day
  ON public.dma_account_orders (gateway, account_no, trade_date, created_at DESC);

-- ── ③ DMA 사용자 → 계좌 매핑 스냅샷 ───────────────────────────────
-- dma_journal_sync_access 가 게이트웨이 단위로 원자 교체한다(D-06).
CREATE TABLE public.dma_account_access (
  gateway       text        NOT NULL,
  dma_user_id   text        NOT NULL,                          -- users.toml user_id (비밀번호는 싣지 않는다)
  account_no    text        NOT NULL,                          -- 게이트웨이 정규화값 그대로(Pitfall 7)
  account_name  text        NOT NULL DEFAULT '',
  priority      integer     NOT NULL DEFAULT 0,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway, dma_user_id, account_no)
);

CREATE INDEX idx_dma_account_access_account
  ON public.dma_account_access (gateway, account_no);

-- ── ④ 적용 커서 ──────────────────────────────────────────────────
-- 이벤트 적재·투영과 같은 트랜잭션에서만 전진한다(dma_journal_apply) — drain 을 못 끝내도 유실 0.
CREATE TABLE public.dma_journal_cursor (
  gateway       text        PRIMARY KEY,
  journal_epoch text        NOT NULL,
  last_seq      bigint      NOT NULL CHECK (last_seq >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 서비스롤 전용 잠금: dma_credentials 와 동일 구성 (RLS 활성 + 접근 규칙 0개 = default deny) ──
ALTER TABLE public.dma_journal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_journal_events FROM PUBLIC;
REVOKE ALL ON public.dma_journal_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_journal_events TO service_role;

ALTER TABLE public.dma_account_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_account_orders FROM PUBLIC;
REVOKE ALL ON public.dma_account_orders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_account_orders TO service_role;

ALTER TABLE public.dma_account_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_account_access FROM PUBLIC;
REVOKE ALL ON public.dma_account_access FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_account_access TO service_role;

ALTER TABLE public.dma_journal_cursor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_journal_cursor FROM PUBLIC;
REVOKE ALL ON public.dma_journal_cursor FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_journal_cursor TO service_role;

COMMIT;
