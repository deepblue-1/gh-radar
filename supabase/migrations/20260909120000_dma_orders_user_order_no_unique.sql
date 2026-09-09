-- Phase 16 Plan 18 — TRADE-03 gap 1: dma_orders (user_id, order_no, KST일) 부분 UNIQUE 인덱스
-- ============================================================
--
-- 한 사용자의 하루 안에서 `order_no` 는 유일하다. 그 유일성을 DB 가 직접 보장한다.
--
-- 결정 근거:
--   · 브로커 주문번호는 **일별 재사용 시퀀스**다. 어제의 `0000012345` 와 오늘의
--     `0000012345` 는 다른 주문이고, 다른 사용자의 같은 번호도 다른 주문이다. 그래서
--     `order_no` 에 전역 UNIQUE 는 걸 수 없다 — 걸면 운영 2일차에 정상 주문이 거부된다.
--   · relay 의 조회·갱신이 `(user_id, order_no, KST 당일)` 세 축으로 좁혀졌다
--     (`relay/src/store/orders.ts` — 16-18 Task 1). 애플리케이션이 세 축으로 유일성을
--     가정한다면 DB 도 같은 세 축으로 그것을 강제해야 **2차 방어선**이 된다. 가정만 있고
--     제약이 없으면, 경주 한 번에 같은 주문이 감사 기록에 두 벌 남는다 (WR-01 / T-16-16).
--   · `timezone(text, timestamptz)`(= `AT TIME ZONE`) 와 `timestamp::date` 는 IMMUTABLE 이라
--     표현식 인덱스에 쓸 수 있다. 반면 `created_at::date` 는 세션 TimeZone 에 의존해
--     STABLE 이므로 인덱스 표현식으로 쓸 수 없다 — 그래서 KST 를 명시한다.
--   · 부분 인덱스(`WHERE order_no IS NOT NULL`)인 이유: 접수 전 거부·타임아웃 행은
--     `order_no` 가 NULL 이다. 그 행들끼리는 유일성을 물을 대상이 아니다.
--
-- 함정:
--   · **선행 중복이 있으면 인덱스 생성은 실패한다.** 그 실패를 Postgres 의 기본 메시지로
--     맞으면 「무엇이 몇 건 중복인지」가 드러나지 않는다. 그래서 인덱스 생성 **전에**
--     중복을 세고, 0 이 아니면 사유가 담긴 예외로 멈춘다.
--   · 중복 행은 감사 기록이다. 이 마이그레이션은 **어떤 행도 지우지 않는다** — 정리 방법은
--     사람이 결정한다.
--
-- 하지 않는 것:
--   · 접근 규칙(정책)을 추가하지 않는다. 이 테이블은 정책 0개 default-deny 가 의도다
--     (T-15-01 / T-16-08). 인덱스가 늘었다고 브라우저에 열어 줄 이유가 생기지 않는다.
--   · 권한 구문을 다시 실행하지 않는다. 테이블 단위 권한은 20260905120200 에서 확정됐고
--     인덱스 추가로 바뀌지 않는다.
--   · 기존 `idx_dma_orders_order_no` 를 제거하지 않는다. 인덱스 제거는 이 갭의 요구가
--     아니고, 남겨 두어도 조회 계획에 해가 없다.
--   · 데이터 마이그레이션을 하지 않는다.
--
-- 선행 중복이 걸렸을 때 사람이 볼 조회:
--   SELECT user_id,
--          order_no,
--          (created_at AT TIME ZONE 'Asia/Seoul')::date AS kst_day,
--          count(*) AS rows,
--          array_agg(id ORDER BY created_at) AS ids
--     FROM public.dma_orders
--    WHERE order_no IS NOT NULL
--    GROUP BY 1, 2, 3
--   HAVING count(*) > 1
--    ORDER BY 3 DESC, 4 DESC;
-- ============================================================

BEGIN;

-- 선행 중복 점검 — 있으면 인덱스를 만들지 않고 사유와 함께 멈춘다.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*)
    INTO dup_count
    FROM (
      SELECT 1
        FROM public.dma_orders
       WHERE order_no IS NOT NULL
       GROUP BY user_id, order_no, (created_at AT TIME ZONE 'Asia/Seoul')::date
      HAVING count(*) > 1
    ) AS dups;

  IF dup_count <> 0 THEN
    RAISE EXCEPTION
      '선행 중복 %건 — 정리 후 재실행 (조회: 이 파일 머리말의 SELECT)', dup_count;
  END IF;
END
$$;

CREATE UNIQUE INDEX idx_dma_orders_user_order_no_kst_day
  ON public.dma_orders (user_id, order_no, ((created_at AT TIME ZONE 'Asia/Seoul')::date))
  WHERE order_no IS NOT NULL;

COMMENT ON INDEX public.idx_dma_orders_user_order_no_kst_day IS '한 사용자의 하루 안에서 order_no 는 유일하다. 브로커 주문번호가 일별 재사용 시퀀스라 전역 UNIQUE 는 불가능하다.';

COMMIT;
