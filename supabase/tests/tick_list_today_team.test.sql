-- ============================================================
-- quick 261104-n9h — 틱뷰어 목록 오늘 팀 칸(매집감지 kind 16) · 시가 등락률 pgTAP.
--
-- 대상: 20261104700000_tick_list_today_team_open.sql(tick_today_for_user · tick_day_for_user 교체).
--
-- 잠그는 것:
--   - 권한: 두 함수 anon · authenticated EXECUTE 없음 · service_role 있음 · SECURITY INVOKER
--   - kind 16 매핑: isin 별 최신 1행(옛 행 값 안 섞임) → accum_pos_net_krw(cond_threshold) · team_day_buy/sell_krw
--     (snap_qty[2] · snap_cum[2]) · team_day_net_krw(차) · team_day_avg_px(accept_latency_us) · team_day_net_qty(message day=)
--     · accum_last_px(price)
--   - snap 길이 2(옛 행) → 당일 5키 null · 누적 · 현재가는 값 / state(qty) ∉ {1,2,3} → 7키 null(행은 있음)
--   - 가시 게이트웨이 밖 kind 16 → 행은 있고(sources accum) 7키 null / message day= 깨짐 → team_day_net_qty 만 null
--   - 오늘 open_rate 가드(ohlc_updated_at 오늘 ∧ 저가 ≤ 현재가 ≤ 고가 ∧ 저가 ≤ 시가 ≤ 고가)
--   - tick_day_for_user open_rate: KRX 행만 · 기준가 = base_px 우선 · 없으면 일봉 close − change_amount · NXT · 일봉 없음 null
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_list_today_team.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(원격 DB 접촉 0). 전체가 한 트랜잭션 + ROLLBACK.
-- 사용자: U1 dma-tt1 → KB120 …4201(가시 계좌 있음 · KYOBO119 매핑 없음) — tick_grid_team_day.test.sql 동형(새 uuid · email).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(21);

-- ── 픽스처: 게이트 사용자 ─────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000004201', 'tt-u1@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('dma-tt1', 'test-enc');
INSERT INTO public.app_users (email, role, dma_user_id) VALUES ('tt-u1@example.invalid', 'trader', 'dma-tt1');
SELECT public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-tt1","account_no":"1234564201","name":"위탁","priority":1}
]'::jsonb);

CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000004201'::uuid $$;
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql AS $$ SELECT (now() AT TIME ZONE 'Asia/Seoul')::date $$;

-- 오늘 목록 한 행(isin).
CREATE FUNCTION pg_temp.trow(p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(public.tick_today_for_user(pg_temp.u1())->'rows') e WHERE e->>'isin' = p_isin
$$;
-- 팀 7키만(open_rate 제외).
CREATE FUNCTION pg_temp.team7(p_row jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'accum_pos_net_krw', p_row->'accum_pos_net_krw', 'team_day_net_krw', p_row->'team_day_net_krw',
    'team_day_buy_krw', p_row->'team_day_buy_krw', 'team_day_sell_krw', p_row->'team_day_sell_krw',
    'team_day_avg_px', p_row->'team_day_avg_px', 'team_day_net_qty', p_row->'team_day_net_qty',
    'accum_last_px', p_row->'accum_last_px')
$$;
CREATE FUNCTION pg_temp.null7() RETURNS jsonb LANGUAGE sql AS $$
  SELECT '{"accum_pos_net_krw": null, "team_day_net_krw": null, "team_day_buy_krw": null, "team_day_sell_krw": null,
           "team_day_avg_px": null, "team_day_net_qty": null, "accum_last_px": null}'::jsonb
$$;
-- 격자 메타 한 행(base_px 인자 · tick_grid_team_day.test.sql grow 동형).
CREATE FUNCTION pg_temp.grow(p_date text, p_ex text, p_isin text, p_base integer) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'date', p_date, 'exchange', p_ex, 'isin', p_isin, 'sources', jsonb_build_array('accum'),
    'object_path', 'grid/' || p_date || '/' || p_ex || '/' || p_isin || '.nightly.ticks.zst',
    'bytes', 1000, 'records', 50, 'a3_count', 20, 'first_recv_ms', 1793000000000, 'last_recv_ms', 1793000100000,
    'base_px', p_base, 'high_rate', 20.0, 'last_rate', 12.5)
$$;
CREATE FUNCTION pg_temp.dayrow(p_date text, p_ex text, p_isin text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(public.tick_day_for_user(pg_temp.u1(), p_date)->'rows') e
   WHERE e->>'exchange' = p_ex AND e->>'isin' = p_isin
$$;

-- 종목 A~H(stock_daily_ohlcv 가 stocks.code FK 라 먼저).
INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('420001', '팀종목A', 'KOSDAQ', 'KR7420001001'),
  ('420002', '팀종목B', 'KOSDAQ', 'KR7420002009'),
  ('420003', '팀종목C', 'KOSDAQ', 'KR7420003007'),
  ('420004', '팀종목D', 'KOSDAQ', 'KR7420004005'),
  ('420005', '팀종목E', 'KOSDAQ', 'KR7420005002'),
  ('420006', '팀종목F', 'KOSDAQ', 'KR7420006000'),
  ('420007', '팀종목G', 'KOSDAQ', 'KR7420007008'),
  ('420008', '팀종목H', 'KOSDAQ', 'KR7420008006');

-- ── A. 권한 ────────────────────────────────────────────────────────
CREATE TEMP TABLE t_fn (sig text PRIMARY KEY);
INSERT INTO t_fn VALUES ('public.tick_today_for_user(uuid)'), ('public.tick_day_for_user(uuid, text)');

SELECT ok(NOT (SELECT bool_or(has_function_privilege(r, f.sig, 'EXECUTE'))
                 FROM t_fn f, unnest(ARRAY['anon', 'authenticated']) r),
          'A 함수 2 — anon · authenticated EXECUTE 불가');
SELECT ok((SELECT bool_and(has_function_privilege('service_role', f.sig, 'EXECUTE')) FROM t_fn f),
          'A 함수 2 — service_role EXECUTE 가능');
SELECT ok((SELECT bool_and(NOT p.prosecdef) FROM pg_proc p WHERE p.oid IN (SELECT f.sig::regprocedure FROM t_fn f)),
          'A 함수 2 — SECURITY INVOKER');

-- ── B. 오늘 kind 16 팀 칸 ─────────────────────────────────────────
DELETE FROM public.stock_quotes;
INSERT INTO public.dma_strategy_events
  (gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, exchange, isin, qty, cond_threshold,
   snap_qty, snap_cum, accept_latency_us, price, message) VALUES
  -- A 옛 행(이른 시각 · 다른 값) → 새 행(qty 1 · 당일 축 snap 길이 3)
  ('KB120', 'tt-ep', 1, pg_temp.today(), 1793000000000, 16, 'KRX', 'KR7420001001', 2, 1,
   '{1,2,3}', '{4,5,6}', 7, 8, 'since=20261104|reg=091500|day=9/1/2|recent=30/60'),
  ('KB120', 'tt-ep', 2, pg_temp.today(), 1793000060000, 16, 'KRX', 'KR7420001001', 1, 4520000000,
   '{9800,10200,1000000000}', '{100000000,30,550000000}', 10000, 12000,
   'since=20261104|reg=091500|day=50000/9800/10200|recent=30/60'),
  -- B 옛 행(snap 길이 2 · 당일 칸 없음)
  ('KB120', 'tt-ep', 3, pg_temp.today(), 1793000060000, 16, 'KRX', 'KR7420002009', 1, 1000,
   '{1,2}', '{3,4}', 0, 5000, 'since=20261104|reg=091500'),
  -- C qty 0(표시할 수 없는 행)만
  ('KB120', 'tt-ep', 4, pg_temp.today(), 1793000060000, 16, 'KRX', 'KR7420003007', 0, 777,
   '{1,2,3}', '{4,5,6}', 9, 9000, 'day=1/2/3'),
  -- D 가시 게이트웨이 밖(KYOBO119 — U1 매핑 없음)
  ('KYOBO119', 'tt-ep', 1, pg_temp.today(), 1793000060000, 16, 'KRX', 'KR7420004005', 1, 2000,
   '{1,2,3}', '{4,5,6}', 9, 9000, 'day=1/2/3'),
  -- E message day= 깨짐(snap 길이 3)
  ('KB120', 'tt-ep', 5, pg_temp.today(), 1793000060000, 16, 'KRX', 'KR7420005002', 1, 3000,
   '{1,2,700000000}', '{4,5,200000000}', 15000, 16000, 'since=20261104|day=abc|recent=30/60'),
  -- G · H — 목록에 올리는 용도(값은 아래 open 가드 확인용)
  ('KB120', 'tt-ep', 6, pg_temp.today(), 1793000060000, 16, 'KRX', 'KR7420007008', 0, 0, '{}', '{}', 0, 0, ''),
  ('KB120', 'tt-ep', 7, pg_temp.today(), 1793000060000, 16, 'KRX', 'KR7420008006', 0, 0, '{}', '{}', 0, 0, '');

-- 시세: base = price − change_amount = 10000.
-- F = +16% 고가(15%↑) · 시가 10300 ∈ [저가 10100, 고가 11600] → open_rate 3.0
-- G = 시가 11200 > 고가 11000 → open_rate null · high_rate 10.0
-- H = 값은 맞지만 ohlc_updated_at 5일 전 → open_rate · high_rate null
INSERT INTO public.stock_quotes (code, price, change_amount, change_rate, open, high, low, upper_limit, lower_limit, updated_at) VALUES
  ('420006', 11500, 1500, 15.0, 10300, 11600, 10100, 13000, 7000, now()),
  ('420007', 10500,  500,  5.0, 11200, 11000,  9900, 13000, 7000, now()),
  ('420008', 10500,  500,  5.0, 10200, 11000,  9900, 13000, 7000, now());
UPDATE public.stock_quotes SET ohlc_updated_at = now() - interval '5 days' WHERE code = '420008';

SELECT ok(pg_temp.trow('KR7420001001') ?& ARRAY['open_rate', 'accum_pos_net_krw', 'team_day_net_krw', 'team_day_buy_krw',
                                                 'team_day_sell_krw', 'team_day_avg_px', 'team_day_net_qty', 'accum_last_px'],
          'B 오늘 행에 새 키 8개');
SELECT is(pg_temp.team7(pg_temp.trow('KR7420001001')),
          '{"accum_pos_net_krw": 4520000000, "team_day_buy_krw": 1000000000, "team_day_sell_krw": 550000000,
            "team_day_net_krw": 450000000, "team_day_avg_px": 10000, "team_day_net_qty": 50000, "accum_last_px": 12000}'::jsonb,
          'B kind 16 최신 행 → 7키(옛 행 값 안 섞임)');
SELECT is(pg_temp.team7(pg_temp.trow('KR7420002009')),
          '{"accum_pos_net_krw": 1000, "team_day_buy_krw": null, "team_day_sell_krw": null,
            "team_day_net_krw": null, "team_day_avg_px": null, "team_day_net_qty": null, "accum_last_px": 5000}'::jsonb,
          'B snap 길이 2(옛 행) → 누적 · 현재가만 · 당일 5키 null');
SELECT is(pg_temp.trow('KR7420003007')->'sources', '["accum"]'::jsonb, 'B qty 0 만 → 행은 있다(sources accum)');
SELECT is(pg_temp.team7(pg_temp.trow('KR7420003007')), pg_temp.null7(), 'B qty 0 만 → 7키 null');
SELECT is(pg_temp.trow('KR7420004005')->'sources', '["accum"]'::jsonb, 'B 가시 게이트웨이 밖 → 행은 있다(기존 k 규칙)');
SELECT is(pg_temp.team7(pg_temp.trow('KR7420004005')), pg_temp.null7(), 'B 가시 게이트웨이 밖 → 7키 null');
SELECT is(pg_temp.trow('KR7420005002')->'team_day_net_qty', 'null'::jsonb, 'B message day= 깨짐 → team_day_net_qty null');
SELECT is(pg_temp.trow('KR7420005002')->'team_day_buy_krw', '700000000'::jsonb, 'B message 깨져도 team_day_buy_krw 값');

-- ── C. 오늘 open_rate 가드 ─────────────────────────────────────────
SELECT is(pg_temp.team7(pg_temp.trow('KR7420006000')) || jsonb_build_object('sources', pg_temp.trow('KR7420006000')->'sources'),
          pg_temp.null7() || '{"sources": ["up15"]}'::jsonb,
          'C 15%↑ 만(kind 16 없음) → 팀 7키 null');
SELECT is((pg_temp.trow('KR7420006000')->>'open_rate')::float8, 3.0::float8, 'C 시가 ∈ [저가, 고가] → open_rate = (open − base)·100/base');
SELECT is(pg_temp.trow('KR7420007008')->'open_rate', 'null'::jsonb, 'C 시가 > 고가 → open_rate null');
SELECT is((pg_temp.trow('KR7420007008')->>'high_rate')::float8, 10.0::float8, 'C 시가만 탈락 — high_rate 값');
SELECT is(jsonb_build_object('o', pg_temp.trow('KR7420008006')->'open_rate', 'h', pg_temp.trow('KR7420008006')->'high_rate'),
          '{"o": null, "h": null}'::jsonb, 'C ohlc_updated_at 5일 전 → open_rate · high_rate 둘 다 null');

-- ── D. tick_day_for_user open_rate ─────────────────────────────────
SELECT public.tick_grid_upsert('nightly', jsonb_build_array(
  pg_temp.grow('20261030', 'KRX', 'KR7420001001', 10000),
  pg_temp.grow('20261030', 'NXT', 'KR7420001001', 10000),
  pg_temp.grow('20261030', 'KRX', 'KR7420002009', NULL),
  pg_temp.grow('20261030', 'KRX', 'KR7420003007', 10000)));
INSERT INTO public.stock_daily_ohlcv (code, date, open, high, low, close, change_amount) VALUES
  ('420001', '2026-10-30', 10300, 11500, 10000, 11000, 1200),  -- base_px 10000 우선 → 3.0(일봉 기준가 9800 이면 5.1)
  ('420002', '2026-10-30',  9500, 10600,  9400, 10500,  500);  -- base_px null → 일봉 10500 − 500 = 10000 → −5.0

SELECT is((pg_temp.dayrow('20261030', 'KRX', 'KR7420001001')->>'open_rate')::float8, 3.0::float8,
          'D KRX · base_px 있음 → 기준가 base_px(3.0)');
SELECT is((pg_temp.dayrow('20261030', 'KRX', 'KR7420002009')->>'open_rate')::float8, -5.0::float8,
          'D KRX · base_px null → 일봉 close − change_amount 폴백(−5.0)');
SELECT is(pg_temp.dayrow('20261030', 'NXT', 'KR7420001001')->'open_rate', 'null'::jsonb, 'D NXT 행 → open_rate null');
SELECT is(pg_temp.dayrow('20261030', 'KRX', 'KR7420003007')->'open_rate', 'null'::jsonb, 'D 일봉 없는 KRX → open_rate null');

SELECT * FROM finish();
ROLLBACK;
