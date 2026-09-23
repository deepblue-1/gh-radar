-- ============================================================
-- quick-260923-m23 — dma_orders 정정 이동 수량(`modified_qty`) · 상태 'modified'.
--
-- gh-trade 정정확인 수량 캡(a940b25f · a70f6ab7)에 relay 감사 기록을 맞춘다. 정정확인(51,
-- noticeType "M")의 `quantity` 는 **요청 수량 에코**이고, 거래소는 min(요청, 원주문 잔량) 만
-- 새 주문번호로 옮긴다. 원주문 행이 그 이동분을 기록하지 않으면 전량 정정된 원주문이
-- accepted/partially_filled 로 영구히 남는다.
--
-- 결정 근거:
--   - 정정 이동분을 **원주문 행**에 `modified_qty` 로 누적한다. 그래야 원주문 행에서
--     `filled_qty + modified_qty >= qty` 로 종결을 판정할 수 있다(체결만으로는 닫히지 않는다).
--   - 'modified' = 원주문 잔량이 정정으로 새 주문번호에 옮겨가 **마지막 이동으로 닫힌** 원주문
--     행의 종결 상태다. 새 정정 행은 이 상태를 쓰지 않는다. relay store 가 수량으로만 파생한다
--     (통보 1자에서 직접 오지 않는다).
--
-- 함정:
--   - **제약 이름을 상수로 가정하지 않는다.** 원 status CHECK(20260905120200)는 컬럼 인라인이라
--     이름을 Postgres 가 지었다. `pg_constraint` 에서 `contype='c'` 이고 정의문이 단어 경계
--     `\mstatus\M` 에 걸리는 CHECK 를 찾아 떨어뜨린 뒤 `dma_orders_status_check` 명시 이름으로
--     다시 건다. 단어 경계라 `krx_session`·`notice_type` 같은 다른 컬럼 CHECK 는 걸리지 않는다.
--   - 떨어뜨린 개수가 0 이면 멈춘다(RAISE EXCEPTION). 조용히 진행하면 옛 CHECK 와 새 CHECK 가
--     공존해 'modified' 가 계속 거부되는 상태가 남는다.
--
-- 하지 않는 것:
--   - 접근 규칙(POLICY)·권한 구문을 다시 실행하지 않는다 — 컬럼 추가로 테이블 권한은 바뀌지 않는다.
--   - 기존 행을 고치지 않는다. 새 컬럼 DEFAULT 0 이 사실과 맞다(지금까지 relay 는 이동분을 기록한
--     적이 없다).
--   - **원격 적용은 이 quick 이 하지 않는다** — 사람 게이트.
--
-- 호환:
--   - 추가 전용이다. 구 relay 는 새 컬럼·새 상태를 쓰지 않으므로 이 파일 적용 뒤에도 그대로 돈다.
--   - 반대로 **새 relay 는 `modified_qty` 를 읽는다** — 이 파일이 relay 배포보다 **먼저** 원격
--     적용돼야 한다(순서가 뒤집히면 수량 CAS 경로의 읽기가 실패한다).
-- ============================================================

BEGIN;

-- ① status CHECK: 이름을 조회로 찾아 떨어뜨린다.
DO $$
DECLARE
  c record;
  dropped integer := 0;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.dma_orders'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ~ '\mstatus\M'
  LOOP
    EXECUTE format('ALTER TABLE public.dma_orders DROP CONSTRAINT %I', c.conname);
    dropped := dropped + 1;
  END LOOP;
  IF dropped = 0 THEN
    RAISE EXCEPTION 'dma_orders status CHECK 를 찾지 못했다 — 새 CHECK 와 공존시키지 않기 위해 멈춘다';
  END IF;
END
$$;

ALTER TABLE public.dma_orders
  ADD CONSTRAINT dma_orders_status_check
    CHECK (status IN ('requested','accepted','rejected','filled','partially_filled','cancelled','timeout','modified'));

-- ② 정정 이동 수량.
ALTER TABLE public.dma_orders
  ADD COLUMN modified_qty integer NOT NULL DEFAULT 0
    CONSTRAINT dma_orders_modified_qty_check CHECK (modified_qty >= 0);

COMMENT ON COLUMN public.dma_orders.modified_qty IS '정정확인(M)으로 이 원주문에서 새 주문번호로 옮겨간 누적 수량. relay 가 M 통보 1건당 1회 더한다(이동 수량 = min(정정 요청, 원주문 잔량)). filled_qty + modified_qty >= qty 이면 행이 닫힌다 (quick-260923-m23).';
COMMENT ON COLUMN public.dma_orders.status IS '수명주기 상태 8종. modified = 원주문 잔량이 정정으로 새 주문번호에 옮겨가 마지막 이동으로 닫힌 원주문 행(relay store 가 filled_qty + modified_qty >= qty 에서 파생). 새 정정 행은 쓰지 않는다 (quick-260923-m23).';

COMMIT;
