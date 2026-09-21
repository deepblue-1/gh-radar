-- ============================================================
-- Phase 18 Plan 01 — TRADE-07: dma_orders 정정("M") · 조각 수 · 시간외종가 세션 (D-21 / D-22 / D-23).
--
-- Phase 15 D-21 이 「범위를 넓힐 때 마이그레이션이 강제되도록」 좁혀 둔 CHECK 두 개를 이 phase 의
-- 주문 계약에 맞춰 연다. 세 가지를 한 트랜잭션으로 바꾼다 — 계약이 반쯤 열린 상태(정정은 되는데
-- 시간외종가 가격 0 은 막힌다 등)를 DB 에 남기지 않기 위해서다.
--
-- 결정 근거:
--   D-21: 정정(`order_type='M'`)이 열린다. relay 가 `order.modify` 를 받아 게이트웨이로 보내기
--         **전에** 이 테이블에 insert 한다 — CHECK 가 'M' 을 모르면 insert 가 실패하고 relay 는
--         「주문 기록에 실패했습니다」로 끝낸다(감사 기록 없는 주문을 만들지 않는 규율). 그래서
--         이 파일이 relay 배포보다 **먼저** 적용돼야 한다.
--         정정도 취소와 마찬가지로 `org_order_no` 가 필수다 — 애플리케이션(zod · 조립기)이 강제한다.
--   D-22: `piece_count` 는 예약구간(15:20~16:00) 신규 주문의 조각 수 감사 기록이다.
--         NULL = 미송신(= 서버 기본값 1). relay 는 1 이하를 와이어에 싣지 않으므로 기록도 NULL 이다.
--   D-23: `krx_session` 은 KRX 시간외종가 세션 지정(`"G2"` 장개시전 · `"G3"` 장종료후)이다.
--         NULL = 미지정(서버 자동 판정). 시간외종가는 서버가 결정가를 정하므로 **가격 0** 으로
--         주문이 나간다 — 그래서 `price > 0` CHECK 를 「G2/G3 일 때만 0 허용」으로 완화한다.
--         무조건 `>= 0` 으로 열지 않는다 — 가격 0 인 지정가가 기록되는 경로를 DB 가 마지막으로 막는다.
--
-- 함정:
--   - **제약 이름을 상수로 가정하지 않는다.** 20260905120200 은 컬럼 인라인 CHECK 라 이름을 Postgres
--     가 지었다(보통 `dma_orders_order_type_check` 지만 보장이 아니다 — RESEARCH [ASSUMED]).
--     그래서 `pg_constraint` 에서 **정의문에 해당 컬럼이 들어간 CHECK** 를 찾아 떨어뜨린 뒤
--     명시 이름으로 다시 건다. 이름이 달라도, 이미 한 번 적용돼 이름이 바뀌었어도 같은 결과가 된다.
--   - 정의문 매칭은 정규식 **단어 경계**(`\m…\M`)로 한다. 부분 문자열로 찾으면 장래에 이름에
--     `price` 가 들어간 다른 컬럼(예: `watch_price`)의 CHECK 까지 함께 떨어진다.
--   - 새 `price` CHECK 를 `price > 0 OR krx_session IN ('G2','G3')` 로 쓰면 **G2/G3 에서 음수가
--     통과한다.** 0 만 여는 것이 의도이므로 `price = 0 AND …` 로 좁힌다.
--   - 새 `price` CHECK 는 `krx_session` 컬럼을 참조하므로 **컬럼 추가 뒤에** 건다.
--
-- 하지 않는 것:
--   - **접근 규칙(POLICY)을 추가하지 않는다.** 정책 0개 default-deny 가 의도다 (T-15-01 / T-16-08).
--   - 권한 회수·부여 구문을 다시 실행하지 않는다 — 테이블 권한은 컬럼 추가로 바뀌지 않는다
--     (20260908120000 과 같은 판단).
--   - 기존 행을 고치지 않는다. 기존 행은 전부 `price > 0` 이고 `order_type IN ('N','C')` 라 새 CHECK
--     를 그대로 만족하며, 새 컬럼은 NULL(= 미송신)로 채워진다 — 그 값이 사실과 맞는다.
-- ============================================================

BEGIN;

-- ① order_type CHECK: 이름을 조회로 찾아 떨어뜨린다.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.dma_orders'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ~ '\morder_type\M'
  LOOP
    EXECUTE format('ALTER TABLE public.dma_orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE public.dma_orders
  ADD CONSTRAINT dma_orders_order_type_check
    CHECK (order_type IN ('N','M','C'));                              -- N=신규 M=정정 C=취소 (Phase 18 D-21 에서 M 개방)

-- ② 감사 컬럼 2종.
ALTER TABLE public.dma_orders
  ADD COLUMN piece_count integer,                                      -- 예약구간 조각 수. NULL = 미송신(= 1) (D-22)
  ADD COLUMN krx_session text
    CHECK (krx_session IS NULL OR krx_session IN ('G2','G3'));        -- 시간외종가 세션. NULL = 서버 자동 판정 (D-23)

COMMENT ON COLUMN public.dma_orders.piece_count IS '예약구간(15:20~16:00) 신규 주문의 조각 수. NULL = 미송신(서버 기본값 1). relay 는 1 이하를 와이어에 싣지 않는다 (Phase 18 D-22).';
COMMENT ON COLUMN public.dma_orders.krx_session IS 'KRX 시간외종가 세션 지정: G2=장개시전 / G3=장종료후. NULL = 미지정(서버 자동 판정). 값이 있을 때만 price 0(서버 결정가)이 허용된다 (Phase 18 D-23).';

-- ③ price CHECK: 이름을 조회로 찾아 떨어뜨린 뒤 조건부 완화로 다시 건다.
--    `\mprice\M` 는 단어 경계 매칭이라 `qty`·`filled_qty` 단독 CHECK 는 걸리지 않는다.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.dma_orders'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ~ '\mprice\M'
  LOOP
    EXECUTE format('ALTER TABLE public.dma_orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE public.dma_orders
  ADD CONSTRAINT dma_orders_price_check
    CHECK (price > 0 OR (price = 0 AND krx_session IN ('G2','G3')));  -- 0 은 시간외종가(G2/G3) 서버 결정가만 (D-23). 음수는 어느 경우에도 거부

COMMIT;
