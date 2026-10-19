-- ============================================================
-- home_theme_by_stock(p_codes, p_days) pgTAP — inbox 261019-theme-by-stock (종목별 「오늘의 급등 테마」 역조회).
--
-- 대상 마이그레이션: supabase/migrations/20261019170000_home_theme_by_stock_rpc.sql
--
-- 잠그는 것:
--   - 거래일별 **가장 최근 스냅샷**만 본다 — 오늘 이른 스냅샷에서 A 가 「반도체」 였어도 최신 스냅샷의 「HBM」 이 답.
--   - 거래일 내림차순 · 같은 날은 payload.themes 순서 · 한 종목이 두 테마면 두 행.
--   - 창 밖(p_days 이전) 거래일은 안 본다 · payload null 스냅샷은 건너뛴다 · 이름 없는 테마는 제외.
--   - p_codes 에 없는 코드 · singles(개별 급등)만 있는 코드는 행이 없다. 빈 결과 '[]'(null 아님).
--   - 권한: anon · authenticated EXECUTE 불가 · service_role 가능.
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/home_theme_by_stock.test.sql`
-- 날짜는 KST 오늘 기준 상대값(창 판정이 now() 기준).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE FUNCTION pg_temp.kd(p_offset int) RETURNS date LANGUAGE sql AS $$
  SELECT (now() AT TIME ZONE 'Asia/Seoul')::date - p_offset
$$;
CREATE FUNCTION pg_temp.kts(p_offset int, p_hm text) RETURNS timestamptz LANGUAGE sql AS $$
  SELECT (to_char(pg_temp.kd(p_offset), 'YYYY-MM-DD') || ' ' || p_hm || ':00+09')::timestamptz
$$;
CREATE FUNCTION pg_temp.snap(p_offset int, p_hm text, p_payload jsonb) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.home_theme_snapshots (trade_date, captured_at, theme_count, stock_count, payload)
  VALUES (pg_temp.kd(p_offset), pg_temp.kts(p_offset, p_hm),
          jsonb_array_length(coalesce(p_payload->'themes', '[]'::jsonb)), 0, p_payload)
$$;

-- 오늘: 10:30 스냅샷(A = 반도체) → 15:30 최신 스냅샷(A = HBM · B = 2차전지 · B 는 로봇에도)
SELECT pg_temp.snap(0, '10:30', '{"themes":[{"name":"반도체","stocks":[{"code":"005930"}]}],"singles":[]}');
SELECT pg_temp.snap(0, '15:30', '{"themes":[
  {"name":"HBM","stocks":[{"code":"005930"},{"code":"000660"}]},
  {"name":"2차전지","stocks":[{"code":"373220"}]},
  {"name":"로봇","stocks":[{"code":"373220"}]}
],"singles":[{"code":"035720"}]}');
-- 어제: C(035720) = 바이오 · payload null 스냅샷이 더 늦지만 건너뛴다
SELECT pg_temp.snap(1, '15:30', '{"themes":[{"name":"바이오","stocks":[{"code":"035720"}]}],"singles":[]}');
INSERT INTO public.home_theme_snapshots (trade_date, captured_at, theme_count, stock_count, payload)
VALUES (pg_temp.kd(1), pg_temp.kts(1, '16:00'), 0, 0, NULL);
-- 5일 전: D(005380) = 자동차 · 이름 없는 테마에 E(000270)
SELECT pg_temp.snap(5, '15:30', '{"themes":[{"name":"자동차","stocks":[{"code":"005380"}]},{"name":"","stocks":[{"code":"000270"}]}],"singles":[]}');
-- 45일 전(창 밖): F(005490) = 철강
SELECT pg_temp.snap(45, '15:30', '{"themes":[{"name":"철강","stocks":[{"code":"005490"}]}],"singles":[]}');

CREATE FUNCTION pg_temp.hits(p_codes text[], p_days int DEFAULT 30)
RETURNS TABLE (ord bigint, code text, trade_date text, theme_name text) LANGUAGE sql AS $$
  SELECT x.ord, x.e->>'code', x.e->>'trade_date', x.e->>'theme_name'
    FROM jsonb_array_elements(public.home_theme_by_stock(p_codes, p_days)) WITH ORDINALITY AS x(e, ord)
$$;

SELECT plan(8);

SELECT is(
  jsonb_typeof(public.home_theme_by_stock(ARRAY['005930'], 30)),
  'array', '(—, 반환형) jsonb 배열'
);
SELECT results_eq(
  $$SELECT code, trade_date, theme_name FROM pg_temp.hits(ARRAY['005930']) ORDER BY ord$$,
  $$VALUES ('005930', to_char(pg_temp.kd(0), 'YYYY-MM-DD'), 'HBM')$$,
  '(A, 오늘) 거래일별 최신 스냅샷만 — 10:30 「반도체」 가 아니라 15:30 「HBM」'
);
SELECT results_eq(
  $$SELECT code, theme_name FROM pg_temp.hits(ARRAY['373220']) ORDER BY ord$$,
  $$VALUES ('373220', '2차전지'), ('373220', '로봇')$$,
  '(B, 오늘) 같은 날 두 테마면 두 행 · payload.themes 순서'
);
SELECT results_eq(
  $$SELECT code, trade_date, theme_name FROM pg_temp.hits(ARRAY['035720']) ORDER BY ord$$,
  $$VALUES ('035720', to_char(pg_temp.kd(1), 'YYYY-MM-DD'), '바이오')$$,
  '(C, 어제) 오늘은 singles 뿐 → 어제 최신 유효 스냅샷의 「바이오」 · payload null 스냅샷은 건너뛴다'
);
SELECT results_eq(
  $$SELECT code, trade_date, theme_name FROM pg_temp.hits(ARRAY['005930','035720','005380']) ORDER BY ord$$,
  $$VALUES ('005930', to_char(pg_temp.kd(0), 'YYYY-MM-DD'), 'HBM'),
           ('035720', to_char(pg_temp.kd(1), 'YYYY-MM-DD'), '바이오'),
           ('005380', to_char(pg_temp.kd(5), 'YYYY-MM-DD'), '자동차')$$,
  '(A·C·D) 거래일 내림차순 정렬'
);
SELECT is(
  public.home_theme_by_stock(ARRAY['005490', '000270', '999999'], 30),
  '[]'::jsonb, '(F 창 밖 · E 이름 없는 테마 · 없는 코드) [] — null 이 아니다'
);
SELECT results_eq(
  $$SELECT code, theme_name FROM pg_temp.hits(ARRAY['005490'], 60) ORDER BY ord$$,
  $$VALUES ('005490', '철강')$$,
  '(F, p_days 60) 창을 넓히면 45일 전 거래일도 본다'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.home_theme_by_stock(text[],integer)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.home_theme_by_stock(text[],integer)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.home_theme_by_stock(text[],integer)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'home_theme_by_stock EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish();
ROLLBACK;
