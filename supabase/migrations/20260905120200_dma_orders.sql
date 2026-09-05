-- ============================================================
-- Phase 15 Plan 09 — RELAY-02: dma_orders CREATE (D-24, D-21, D-22).
--
-- DMA 주문의 감사 기록. 한 행이 주문 하나의 **수명주기 전체**를 담는다 —
-- server 가 `POST /api/orders` 에서 요청을 insert 하고, 접수/거부 응답으로 1차 update,
-- 이후 체결·취소확인 통보가 relay 로 들어오면 relay(서비스롤)가 같은 행을 update 한다.
-- 웹앱은 이 테이블에 직접 닿지 않고 server REST 를 통해서만 읽는다.
--
-- 결정 근거:
--   D-24: 주문 기록은 Supabase + relay stdout(pino) 두 벌이다. 웹앱이 새로고침해도
--         **오늘 주문 목록을 복원**해야 하므로 `(user_id, created_at DESC)` 인덱스가
--         그 조회의 정본 형태다.
--   D-21: v1 주문 유형은 신규("N")·취소("C") 둘뿐이다. 정정("M")·시장가·IOC/FOK 는
--         범위 밖이라 `order_type` CHECK 가 두 값만 허용한다 — 범위를 넓힐 때
--         마이그레이션이 강제되도록 두는 편이 안전하다. 취소는 `org_order_no` 가
--         필수이고 수량은 미체결 잔량 전부다(애플리케이션이 강제, 0 은 거부).
--   D-22: 결과는 두 경로다 — 동기 응답(첫 접수/거부, 최대 5초) + 이후 wss 푸시.
--         `status` 가 그 두 경로의 합류점이라 한 행이 계속 갱신된다.
--   T-15-01 (Elevation of Privilege / IDOR): 브라우저가 PostgREST 로 직접 접근하면
--         타인의 주문 이력을 읽을 수 있다. `dma_credentials` 와 **동일하게** RLS 활성 +
--         접근 규칙 0개 + anon/authenticated 명시 REVOKE 로 그 표면을 없앤다.
--         서비스롤은 RLS 를 우회하므로 소유권은 애플리케이션이 `WHERE user_id` 명시
--         필터로 강제한다(15-17 소관, chat-history 규약과 동형).
--   T-15-32 (Repudiation): 요청·접수·체결·취소확인을 `status`/`notice_type`/
--         `result_code`/`message` 로 남겨 사후 추적을 가능하게 한다.
--   자동 메모리 feedback_supabase_rpc_revoke / PATTERNS S-3: `REVOKE ... FROM PUBLIC`
--         단독은 플랫폼 auto-grant 에 덮인다 → anon, authenticated 를 이름으로 REVOKE.
--
-- 함정:
--   - `status='timeout'` 은 **"실패"가 아니라 "결과를 모름"** 이다 (RESEARCH Pitfall 9).
--     5초 안에 접수 응답이 안 왔을 뿐, 주문은 이미 나갔을 수 있다. UI 는 "결과 확인 중 —
--     미체결 목록을 확인하세요"를 표시하고 재주문 버튼을 막는다. 여기를 실패로 읽으면
--     사용자가 재주문해 중복 체결이 난다.
--   - `notice_type` 은 게이트웨이 통보 원문 1자("A" 접수 / "E" 체결 / "C" 취소확인 /
--     "R" 거부)를 **해석 없이** 담는다. CHECK 를 걸지 않는 것은 의도다 — 게이트웨이가
--     모르는 값을 보냈을 때 감사 기록이 통째로 실패하는 편이 더 나쁘다.
--   - `isin` 에 FK 를 걸지 않는다. `stocks.isin` 은 15-10 백필 전까지 대부분 NULL 이라
--     참조 대상이 없다. 대신 12자 CHECK 로 단축코드 혼입만 막는다(Pitfall 13 동형).
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 말 것.** `dma_credentials` 와 같은 이유다.
--   - 체결 단가/체결 이력 별도 테이블. v1 은 `filled_qty` 누적으로 충분하다.
--   - 보존 기간 정리(purge) 잡. 감사 기록이라 지우지 않는 것이 기본값이다.
-- ============================================================

BEGIN;

CREATE TABLE public.dma_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_no   text NOT NULL,
  isin         text NOT NULL CHECK (length(isin) = 12),          -- 게이트웨이 종목 키 (D-28)
  stock_code   text REFERENCES public.stocks(code) ON DELETE SET NULL,  -- 6자 단축코드 (상장폐지돼도 기록은 남는다)
  exchange     text NOT NULL CHECK (exchange IN ('KRX','NXT')),  -- D-04
  market       text NOT NULL CHECK (market IN ('K','Q')),        -- K=KOSPI Q=KOSDAQ, server 가 stocks.market 으로 채운다
  side         text NOT NULL CHECK (side IN ('B','S')),          -- B=매수 S=매도
  order_type   text NOT NULL CHECK (order_type IN ('N','C')),    -- N=신규 C=취소 (정정 M 은 v1 범위 밖, D-21)
  org_order_no text,                                             -- 취소 시 원주문번호 (신규는 NULL)
  qty          integer NOT NULL CHECK (qty > 0),
  price        integer NOT NULL CHECK (price > 0),               -- 보통가 고정 (order_condition "0", D-21)
  order_no     text,                                             -- 접수 후 부여. 접수 전 거부/타임아웃이면 NULL
  status       text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','rejected','filled','partially_filled','cancelled','timeout')),
  result_code  integer,                                          -- 0=성공, 그 외 거부코드
  notice_type  text,                                             -- 게이트웨이 통보 원문 1자 (A/E/C/R) — 해석하지 않는다
  message      text,                                             -- 거부 사유 등 원문 메시지
  filled_qty   integer NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 오늘 주문 목록 복원 (D-24) — 웹앱 새로고침 시 server 가 이 형태로 조회한다.
CREATE INDEX idx_dma_orders_user_created ON public.dma_orders (user_id, created_at DESC);

-- 체결/취소확인 통보 상관 — relay 가 order_no 로 행을 찾아 update 한다.
-- 접수 전 거부/타임아웃 행은 order_no 가 NULL 이라 인덱스에서 제외한다.
CREATE INDEX idx_dma_orders_order_no ON public.dma_orders (order_no) WHERE order_no IS NOT NULL;

-- 서비스롤 전용: dma_credentials 와 동일 구성 (RLS 활성 + 접근 규칙 0개 = default deny).
ALTER TABLE public.dma_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.dma_orders FROM PUBLIC;
REVOKE ALL ON public.dma_orders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_orders TO service_role;

COMMIT;
