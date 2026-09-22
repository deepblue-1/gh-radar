-- ============================================================
-- Phase 18 Plan 24 — TRADE-07 갭 클로징 R3 GC-CR-01: `dma_orders_price_check` 가 NULL 을 통과시키지 않게 한다.
--
-- 20260922120000 이 건 CHECK `price > 0 OR (price = 0 AND (order_type = 'C' OR krx_session IN ('G2','G3')))`
-- 는 세션 없는 가격 0 신규·정정을 막는다고 선언했지만 **한 번도 막은 적이 없다.**
--
-- 결정 근거:
--   GC-CR-01 (18-REVIEW-R2): 3값 논리 평가 순서 — 행 (price=0, order_type='N', krx_session=NULL) 에서
--     1) `krx_session IN ('G2','G3')`            → NULL   (NULL 과의 비교는 NULL)
--     2) `order_type = 'C' OR NULL`              → NULL   (FALSE OR NULL = NULL)
--     3) `price = 0 AND NULL`                     → NULL   (TRUE AND NULL = NULL)
--     4) `price > 0 OR NULL`                      → NULL   (FALSE OR NULL = NULL)
--     Postgres 는 CHECK 식이 NULL 이면 **위반이 아니라 통과**로 본다 → 행이 들어간다.
--     정정 (0,'M',NULL) 도 같은 경로로 들어가고, (0,'M','G2') 는 1) 이 TRUE 라 식이 그냥 TRUE 다.
--   D-21 · D-23: 가격 0 은 두 갈래로만 열린다 — 취소('C', 원주문 가격 사본) · 시간외종가 **신규**
--     ('N' + krx_session G2/G3). 정정 가격 0 과 세션 없는 신규 가격 0 은 거부. 음수는 어디서나 거부.
--   새 식은 NULL 을 FALSE 로 접는다: 식 안의 비교는 NOT NULL 컬럼(price · order_type)이거나
--     `COALESCE(… , false)` 로 감싼 krx_session 비교뿐이다 — 식 전체가 NULL 로 평가되는 갈래가 없다.
--     `order_type = 'N'` 을 명시해 정정 + G2/G3 + 0 도 막는다.
--   relay 코드 층(zod · 조립기 `priceFloor`)이 같은 규칙을 이미 강제한다. 이 CHECK 는 그 규칙의
--     최후 방어선이고, 이 파일은 그 방어선이 선언대로 서게 한다.
--
-- 정정 기록:
--   - 20260922120000 머리 주석의 「정정('M') 가격 0 은 여전히 거부된다」 는 사실이 아니었다.
--   - 18-18 SUMMARY 의 T-18-82 「세션 없는 가격 0 신규·정정도 계속 거부된다」 도 사실이 아니었다.
--   - 옛 CHECK(20260921120000, `price > 0 OR (price = 0 AND krx_session IN ('G2','G3'))`)도 같은
--     NULL 경로로 세션 없는 가격 0 **취소**를 원래부터 통과시켰다 — R1 CR-01 의 「DB 층이 가격 0 취소를
--     막는다」 는 전제도 틀렸다.
--   - 근거: 이 파일과 짝인 pgTAP 회귀 `supabase/tests/dma_orders_price_check.test.sql`
--     (`scripts/verify-dma-orders-price-check.sh --until <버전>` 으로 수정 전·후를 재현).
--   - 적용된 옛 파일(20260921120000 · 20260922120000)은 고치지 않는다 — 정정은 이 파일과 18-24 SUMMARY 에만 쓴다.
--
-- 함정:
--   - NULL 은 CHECK 에서 통과다. 새 식에 NULL 이 남는 비교를 하나라도 두면 같은 구멍이 다시 생긴다.
--   - 사전 확인의 WHERE 에도 같은 함정이 있다: 「새 CHECK 의 부정」 안에 NULL 이 남으면 WHERE 가 그
--     행을 빼 버려 위반 행을 0 으로 잘못 센다. 그래서 사전 확인은 **새 CHECK 와 같은 null-safe 식**의
--     부정으로 쓴다(NOT 안의 식이 TRUE/FALSE 로만 평가되므로 NOT 도 TRUE/FALSE 다).
--   - 제약 이름은 `dma_orders_price_check` 로 확정돼 있다 — `IF EXISTS` 없이 떨어뜨린다(20260922120000
--     과 같은 이유: 원격이 예상과 다르면 트랜잭션째 실패하는 편이 CHECK 두 개가 조용히 겹치는 것보다 낫다).
--   - ADD CONSTRAINT 는 기존 행을 전부 검증한다(검증 생략 옵션을 붙이지 않는다). 사전 확인 DO 블록과
--     함께 이중 안전장치다 — DO 블록은 위반 개수를 사람이 읽을 문장으로 알려 주는 몫이다.
--
-- 하지 않는 것:
--   - 접근 규칙·권한 구문을 다시 쓰지 않는다 — 정책 0개 default-deny 가 의도이고(T-15-01 / T-16-08),
--     테이블 권한은 CHECK 교체로 바뀌지 않는다.
--   - 기존 행을 고치지 않는다. 위반 행이 있으면 트랜잭션째 실패하고 아무것도 바뀌지 않는다.
--     relay 는 새 CHECK 가 막는 행을 만드는 경로가 없다(가격 0 = 수동 취소 · 시간외종가 신규뿐,
--     자동주문 통보 행은 가격 0 이하면 만들지 않는다).
--   - 이 파일을 원격에 적용하는 것은 18-29 의 사람 확인 게이트 뒤다. 18-24 는 파일과 로컬 증거만 만든다.
-- ============================================================

BEGIN;

-- ① 사전 확인 (같은 트랜잭션): 새 CHECK 를 어기는 기존 행이 있으면 개수를 말하며 실패한다.
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*)
    INTO bad_count
    FROM public.dma_orders
   WHERE NOT (
           price > 0
        OR (price = 0 AND (order_type = 'C'
                           OR (order_type = 'N' AND COALESCE(krx_session IN ('G2','G3'), false))))
         );

  IF bad_count <> 0 THEN
    RAISE EXCEPTION
      'dma_orders_price_check 위반 기존 행 %건 — 새 CHECK 를 걸 수 없어 트랜잭션째 중단합니다 (GC-CR-01)', bad_count;
  END IF;
END
$$;

-- ② 옛 CHECK 를 떨어뜨린다.
ALTER TABLE public.dma_orders
  DROP CONSTRAINT dma_orders_price_check;

-- ③ NULL 을 FALSE 로 접는 CHECK 로 다시 건다.
ALTER TABLE public.dma_orders
  ADD CONSTRAINT dma_orders_price_check
    CHECK (
      price > 0
      OR (price = 0 AND (order_type = 'C'
                         OR (order_type = 'N' AND COALESCE(krx_session IN ('G2','G3'), false))))
    );  -- 0 은 취소(원주문 사본) · 시간외종가(G2/G3) 신규만 (GC-CR-01 / D-21 / D-23). 음수는 어느 경우에도 거부

COMMIT;
