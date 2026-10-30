-- ============================================================
-- Phase 35 Plan 02 — 발사 경계 지도 어드민 저장소(launch_pieces · launch_heads) · 조건부 upsert · 어드민 RPC pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261027200000_launch_gate.sql
--                  supabase/migrations/20261030210000_launch_map_tail_probe.sql(지도 조각 probe · round · result_code)
--
-- 잠그는 것:
--   - 트레이서: 첨부 pieces.json 의 한 발사(10/12 KB120 코스피 Q16 16:00 · wire 0~2 · rel −305 · −303 · −302 · 101)가
--     launch_backfill_apply → 두 표 → launch_orders_for_admin 으로 나온다(전 마이그레이션 재생 위).
--   - 응답 모양: trade_date YYYYMMDD · fire_base HH:MM:SS · created_at/updated_at 없음 · 조각 행에 account ·
--     dma_user_id 키(D-02 어드민 전용 예외) · stock_code · stock_name.
--   - 빈 상태: 행 0 → {dates:[], date:null, heads:[], pieces:[]} · 지도 {days:[], heads:[], pieces:[]}.
--   - upsert 규칙 행렬(조각 · 머리 각 8단계): backfill 은 무엇이든 덮임 · journal 은 journal 만(같은 epoch seq ≥ ·
--     다른 epoch 는 새로 온 쪽) · backfill 은 journal 을 못 덮음(false · pieces_written 0).
--   - 도착 순서 무관(D-06 — 외래키 없음) · A 두 다리(KRX 09:00:27 · NXT 09:00:30)가 두 행으로 공존(A1).
--   - CHECK 없음(result E127 · profile X 통과 · Pitfall 6) · p_source 'other' · 필수 키 누락 → 22023 · 백필 원자성.
--   - 주문 내역: dates 내림차순 · 행 없는 p_date 는 빈 배열 · stocks 조인 stock_code · stock_name · 조각 순서.
--   - 경계 지도: q16 p_days 절단(발사 기준별 거래일 · A4) · n0930 = N 매수 + A 매도(KRX 09:00:27 다리 없음) ·
--     지도 열 14개(+ 뒤탐침 판정 재료 probe · round · result_code — quick-261030-dz7) · 뒤탐침 행 값 ·
--     최신 머리(프로파일별 1행) · 모르는 p_fire · p_days 0 → 22023.
--   - 권한: 두 표 RLS 켬 · pg_policies 0 · anon/authenticated SELECT 불가 · 함수 5개 EXECUTE
--     (anon, authenticated, service_role) = (f, f, t).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
-- 단언 설명에는 (날짜, 서버, 프로파일, 거래소, 시장, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

CREATE TEMP TABLE t_setup (label text PRIMARY KEY, r jsonb);

SELECT plan(62);

-- ── 1. 빈 상태 ─────────────────────────────────────────────────
SELECT is(
  public.launch_orders_for_admin(),
  '{"dates":[],"date":null,"heads":[],"pieces":[]}'::jsonb,
  '(—, —, —, —, —, 빈 표) launch_orders_for_admin() = {dates:[], date:null, heads:[], pieces:[]}'
);

-- ── 2. 트레이서: 첨부 첫 발사 백필 ────────────────────────────────
INSERT INTO t_setup SELECT 'bf_1012', public.launch_backfill_apply(
  '[
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "wire":0,"queued_id":"Q153027001","piece_idx":0,"sent_rel_us":-305,"result":"101"},
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "wire":1,"queued_id":"Q153027001","piece_idx":1,"sent_rel_us":-303,"result":"101"},
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "wire":2,"queued_id":"Q153027001","piece_idx":2,"sent_rel_us":-302,"result":"101"}
  ]'::jsonb,
  '[
    {"trade_date":"2026-10-12","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "n_pieces":3,"n_accepted":0,"n_reject":3,"n_other":0,"gate_lo_us":-302,"gate_hi_us":null,"offset_used_us":-305}
  ]'::jsonb);

SELECT is(
  (SELECT r FROM t_setup WHERE label = 'bf_1012'),
  '{"pieces_in":3,"pieces_written":3,"heads_in":1,"heads_written":1}'::jsonb,
  '(2026-10-12, KB120, Q16, KRX, K, 백필) launch_backfill_apply → {pieces_in 3, pieces_written 3, heads_in 1, heads_written 1}'
);

INSERT INTO t_setup SELECT 'orders_latest', public.launch_orders_for_admin();

SELECT is(
  (SELECT r->'dates' FROM t_setup WHERE label = 'orders_latest'),
  '["20261012"]'::jsonb,
  '(20261012, —, —, —, —, dates) orders dates = ["20261012"]'
);
SELECT is(
  (SELECT r->'date' FROM t_setup WHERE label = 'orders_latest'),
  '"20261012"'::jsonb,
  '(20261012, —, —, —, —, date) p_date 없으면 date = 최신 "20261012"'
);
SELECT is(
  (SELECT jsonb_array_length(r->'heads') FROM t_setup WHERE label = 'orders_latest'),
  1,
  '(20261012, KB120, Q16, KRX, K, 머리) heads 길이 1'
);
SELECT is(
  (SELECT jsonb_agg((e->>'wire')::int ORDER BY o)
     FROM t_setup, jsonb_array_elements(r->'pieces') WITH ORDINALITY AS x(e, o) WHERE label = 'orders_latest'),
  '[0,1,2]'::jsonb,
  '(20261012, KB120, Q16, KRX, K, 조각 순서) pieces wire 0 · 1 · 2 순'
);
SELECT is(
  (SELECT jsonb_agg((e->>'sent_rel_us')::int ORDER BY o)
     FROM t_setup, jsonb_array_elements(r->'pieces') WITH ORDINALITY AS x(e, o) WHERE label = 'orders_latest'),
  '[-305,-303,-302]'::jsonb,
  '(20261012, KB120, Q16, KRX, K, rel) pieces sent_rel_us −305 · −303 · −302'
);
SELECT is(
  (SELECT row((r->'pieces'->0) ? 'account', (r->'pieces'->0) ? 'dma_user_id',
              (r->'pieces'->0)->'account', (r->'pieces'->0)->'dma_user_id')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(t,t,null,null)',
  '(20261012, KB120, Q16, KRX, K, D-02) 조각 행에 account · dma_user_id 키가 있고 백필이라 값 null'
);
SELECT is(
  (SELECT row(r->'pieces'->0->>'trade_date', r->'pieces'->0->>'fire_base', r->'pieces'->0->>'source',
              r->'pieces'->0->>'result', r->'pieces'->0->>'queued_id')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(20261012,16:00:00,backfill,101,Q153027001)',
  '(20261012, KB120, Q16, KRX, K, 조각 형식) trade_date "20261012" · fire_base "16:00:00" · source backfill · result 101'
);
SELECT is(
  (SELECT row(r->'heads'->0->>'trade_date', r->'heads'->0->>'fire_base', r->'heads'->0->>'source',
              r->'heads'->0->>'n_reject', r->'heads'->0->>'gate_lo_us', r->'heads'->0->'gate_hi_us',
              r->'heads'->0->>'offset_used_us')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(20261012,16:00:00,backfill,3,-302,null,-305)',
  '(20261012, KB120, Q16, KRX, K, 머리 형식) trade_date · fire_base 텍스트 · n_reject 3 · gate_lo −302 · gate_hi null · offset −305'
);
SELECT is(
  (SELECT row((r->'pieces'->0) ? 'created_at', (r->'pieces'->0) ? 'updated_at',
              (r->'heads'->0) ? 'created_at', (r->'heads'->0) ? 'journal_epoch',
              (r->'pieces'->0) ? 'stock_code', (r->'pieces'->0)->'stock_name')::text
     FROM t_setup WHERE label = 'orders_latest'),
  '(f,f,f,t,t,null)',
  '(20261012, —, —, —, —, 응답 키) created_at/updated_at 없음 · 추적 열 있음 · stock_code 키 있음 · isin null 이라 stock_name null'
);

-- ── 3. upsert 규칙 행렬 — 조각(2026-10-13, KB120, Q16, KRX, K, wire 0) ─────────────
-- 단계: backfill → backfill(다른 값) → journal(e1,5) → backfill(막힘) → journal(e1,3)(막힘) → journal(e1,7)
--       → journal(e1,7) 다른 값(재해석) → journal(e2,1)(다른 epoch). 결과 튜플 = (source, sent_rel_us, epoch, seq, 행 수).
CREATE FUNCTION pg_temp.pc(p_rel int, p_epoch text, p_seq bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('trade_date', '2026-10-13', 'gateway', 'KB120', 'profile', 'Q16', 'fire_exchange', 'KRX',
                            'fire_base', '16:00:00', 'market', 'K', 'wire', 0, 'sent_rel_us', p_rel, 'result', '101',
                            'journal_epoch', p_epoch, 'seq', p_seq, 'gw_time_ms', 1760338800000)
$$;
CREATE FUNCTION pg_temp.pc_state() RETURNS text LANGUAGE sql AS $$
  SELECT row(p.source, p.sent_rel_us, p.journal_epoch, p.seq,
             (SELECT count(*) FROM public.launch_pieces q WHERE q.trade_date = '2026-10-13'))::text
    FROM public.launch_pieces p WHERE p.trade_date = '2026-10-13'
$$;

INSERT INTO t_setup VALUES ('pm1', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-100, 'e0', 99), 'backfill')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm1') || ' ' || pg_temp.pc_state(), 'true (backfill,-100,,,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 1) backfill 삽입 → true · source backfill · 추적 열 비움');
INSERT INTO t_setup VALUES ('pm2', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-101, NULL, NULL), 'backfill')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm2') || ' ' || pg_temp.pc_state(), 'true (backfill,-101,,,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 2) backfill 재실행(다른 값) → true · 덮임 · 행 수 1 불변');
INSERT INTO t_setup VALUES ('pm3', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-105, 'e1', 5), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm3') || ' ' || pg_temp.pc_state(), 'true (journal,-105,e1,5,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 3) journal (e1, 5) → true · 백필을 덮음');
INSERT INTO t_setup VALUES ('pm4', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-200, NULL, NULL), 'backfill')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm4') || ' ' || pg_temp.pc_state(), 'false (journal,-105,e1,5,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 4) backfill → false · journal 행 불변');
INSERT INTO t_setup VALUES ('pm5', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-103, 'e1', 3), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm5') || ' ' || pg_temp.pc_state(), 'false (journal,-105,e1,5,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 5) journal (e1, 3) 옛 seq → false · 불변');
INSERT INTO t_setup VALUES ('pm6', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-107, 'e1', 7), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm6') || ' ' || pg_temp.pc_state(), 'true (journal,-107,e1,7,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 6) journal (e1, 7) → true · 덮임');
INSERT INTO t_setup VALUES ('pm7', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-177, 'e1', 7), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm7') || ' ' || pg_temp.pc_state(), 'true (journal,-177,e1,7,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 7) journal (e1, 7) 다른 값 → true · 같은 seq 재해석이 덮음');
INSERT INTO t_setup VALUES ('pm8', to_jsonb(public.launch_upsert_piece(pg_temp.pc(-201, 'e2', 1), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'pm8') || ' ' || pg_temp.pc_state(), 'true (journal,-201,e2,1,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 행렬 8) journal (e2, 1) → true · 다른 epoch 는 새로 온 쪽');

-- ── 4. upsert 규칙 행렬 — 머리(2026-10-13, KB120, Q16, KRX, K) · 결과 튜플 = (source, next_offset_us, epoch, seq, 행 수) ──
CREATE FUNCTION pg_temp.hd(p_next int, p_epoch text, p_seq bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('trade_date', '2026-10-13', 'gateway', 'KB120', 'profile', 'Q16', 'fire_exchange', 'KRX',
                            'fire_base', '16:00:00', 'market', 'K', 'next_offset_us', p_next,
                            'journal_epoch', p_epoch, 'seq', p_seq)
$$;
CREATE FUNCTION pg_temp.hd_state() RETURNS text LANGUAGE sql AS $$
  SELECT row(h.source, h.next_offset_us, h.journal_epoch, h.seq,
             (SELECT count(*) FROM public.launch_heads q WHERE q.trade_date = '2026-10-13'))::text
    FROM public.launch_heads h WHERE h.trade_date = '2026-10-13'
$$;

INSERT INTO t_setup VALUES ('hm1', to_jsonb(public.launch_upsert_head(pg_temp.hd(-100, 'e0', 99), 'backfill')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm1') || ' ' || pg_temp.hd_state(), 'true (backfill,-100,,,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 1) backfill 삽입 → true · 추적 열 비움');
INSERT INTO t_setup VALUES ('hm2', to_jsonb(public.launch_upsert_head(pg_temp.hd(-101, NULL, NULL), 'backfill')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm2') || ' ' || pg_temp.hd_state(), 'true (backfill,-101,,,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 2) backfill 재실행(다른 값) → true · 행 수 1 불변');
INSERT INTO t_setup VALUES ('hm3', to_jsonb(public.launch_upsert_head(pg_temp.hd(-105, 'e1', 5), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm3') || ' ' || pg_temp.hd_state(), 'true (journal,-105,e1,5,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 3) journal (e1, 5) → true');
INSERT INTO t_setup VALUES ('hm4', to_jsonb(public.launch_upsert_head(pg_temp.hd(-200, NULL, NULL), 'backfill')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm4') || ' ' || pg_temp.hd_state(), 'false (journal,-105,e1,5,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 4) backfill → false · 불변');
INSERT INTO t_setup VALUES ('hm5', to_jsonb(public.launch_upsert_head(pg_temp.hd(-103, 'e1', 3), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm5') || ' ' || pg_temp.hd_state(), 'false (journal,-105,e1,5,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 5) journal (e1, 3) → false');
INSERT INTO t_setup VALUES ('hm6', to_jsonb(public.launch_upsert_head(pg_temp.hd(-107, 'e1', 7), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm6') || ' ' || pg_temp.hd_state(), 'true (journal,-107,e1,7,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 6) journal (e1, 7) → true');
INSERT INTO t_setup VALUES ('hm7', to_jsonb(public.launch_upsert_head(pg_temp.hd(-177, 'e1', 7), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm7') || ' ' || pg_temp.hd_state(), 'true (journal,-177,e1,7,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 7) journal (e1, 7) 다른 값 → true · 재해석');
INSERT INTO t_setup VALUES ('hm8', to_jsonb(public.launch_upsert_head(pg_temp.hd(-201, 'e2', 1), 'journal')));
SELECT is((SELECT r::text FROM t_setup WHERE label = 'hm8') || ' ' || pg_temp.hd_state(), 'true (journal,-201,e2,1,1)',
  '(2026-10-13, KB120, Q16, KRX, K, 머리 행렬 8) journal (e2, 1) → true · 다른 epoch');

-- ── 5. 도착 순서 무관(D-06 — 외래키 없음) ─────────────────────────
-- 키 X = (2026-10-14, KB120, Q16, KRX, K): 머리 먼저 → 조각 나중. 키 Y = (2026-10-14, KYOBO119, Q16, KRX, Q): 조각 먼저 → 머리 나중.
INSERT INTO t_setup VALUES ('ord_x_head', to_jsonb(public.launch_upsert_head(
  '{"trade_date":"2026-10-14","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
    "journal_epoch":"e1","seq":11}'::jsonb, 'journal')));
INSERT INTO t_setup VALUES ('ord_x_piece', to_jsonb(public.launch_upsert_piece(
  '{"trade_date":"2026-10-14","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
    "wire":0,"sent_rel_us":-150,"result":"접수","journal_epoch":"e1","seq":12}'::jsonb, 'journal')));
INSERT INTO t_setup VALUES ('ord_y_piece', to_jsonb(public.launch_upsert_piece(
  '{"trade_date":"2026-10-14","gateway":"KYOBO119","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"Q",
    "wire":0,"sent_rel_us":-160,"result":"101","journal_epoch":"e9","seq":21}'::jsonb, 'journal')));
INSERT INTO t_setup VALUES ('ord_y_head', to_jsonb(public.launch_upsert_head(
  '{"trade_date":"2026-10-14","gateway":"KYOBO119","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"Q",
    "journal_epoch":"e9","seq":22}'::jsonb, 'journal')));
SELECT is(
  row((SELECT string_agg(r::text, ',' ORDER BY label) FROM t_setup WHERE label LIKE 'ord\_%'),
      (SELECT count(*) FROM public.launch_pieces WHERE trade_date = '2026-10-14'),
      (SELECT count(*) FROM public.launch_heads WHERE trade_date = '2026-10-14'))::text,
  '("true,true,true,true",2,2)',
  '(2026-10-14, KB120 · KYOBO119, Q16, KRX, K · Q, 도착 순서) 머리→조각 · 조각→머리 둘 다 true · 두 표 각 2행'
);

-- ── 6. A 두 다리 공존(A1) ─────────────────────────────────────────
INSERT INTO t_setup SELECT 'fx_a_legs', public.launch_backfill_apply(
  '[
    {"trade_date":"2026-10-15","gateway":"KB120","profile":"A","fire_exchange":"KRX","fire_base":"09:00:27","market":"K",
     "wire":0,"side":"buy","sent_rel_us":-210,"result":"접수"},
    {"trade_date":"2026-10-15","gateway":"KB120","profile":"A","fire_exchange":"NXT","fire_base":"09:00:30","market":"K",
     "wire":0,"side":"sell","sent_rel_us":-190,"result":"515"}
  ]'::jsonb,
  '[
    {"trade_date":"2026-10-15","gateway":"KB120","profile":"A","fire_exchange":"KRX","fire_base":"09:00:27","market":"K","n_pieces":1},
    {"trade_date":"2026-10-15","gateway":"KB120","profile":"A","fire_exchange":"NXT","fire_base":"09:00:30","market":"K","n_pieces":1}
  ]'::jsonb);
SELECT is(
  row((SELECT string_agg(fire_exchange || '/' || fire_base::text || '/' || side, ',' ORDER BY fire_exchange)
         FROM public.launch_pieces WHERE trade_date = '2026-10-15' AND gateway = 'KB120' AND profile = 'A' AND market = 'K' AND wire = 0),
      (SELECT count(*) FROM public.launch_heads WHERE trade_date = '2026-10-15' AND gateway = 'KB120' AND profile = 'A' AND market = 'K'))::text,
  '("KRX/09:00:27/buy,NXT/09:00:30/sell",2)',
  '(2026-10-15, KB120, A, KRX · NXT, K, wire 0) A 두 다리가 조각 2행 · 머리 2행으로 공존'
);

-- ── 7. CHECK 없음(Pitfall 6) · source 만 거부 ─────────────────────
INSERT INTO t_setup VALUES ('nocheck', to_jsonb(public.launch_upsert_piece(
  '{"trade_date":"2026-10-15","gateway":"KYOBO119","profile":"X","fire_exchange":"KRX","fire_base":"16:00:00","market":"Q",
    "wire":0,"sent_rel_us":-180,"result":"E127","result_code":"E127"}'::jsonb, 'backfill')));
SELECT is(
  row((SELECT r::text FROM t_setup WHERE label = 'nocheck'),
      (SELECT result || '/' || profile || '/' || result_code FROM public.launch_pieces WHERE trade_date = '2026-10-15' AND gateway = 'KYOBO119'))::text,
  '(true,E127/X/E127)',
  '(2026-10-15, KYOBO119, X, KRX, Q, CHECK 없음) result E127 · profile X · result_code 브로커 원 코드 문자열이 들어간다'
);
-- result_code 는 text — gh-trade 백필은 숫자(515)와 브로커 원 코드(F083)를 섞어 보낸다(261027-launch-backfill).
SELECT public.launch_upsert_piece(
  '{"trade_date":"2026-10-15","gateway":"KYOBO119","profile":"N","fire_exchange":"NXT","fire_base":"09:00:30","market":"Q",
    "wire":0,"side":"buy","sent_rel_us":-200,"result":"515","result_code":515}'::jsonb, 'backfill');
SELECT is(
  (SELECT result_code FROM public.launch_pieces WHERE trade_date = '2026-10-15' AND gateway = 'KYOBO119' AND profile = 'N'),
  '515',
  '(2026-10-15, KYOBO119, N, NXT, Q, result_code 숫자) JSON 숫자 515 → text 「515」'
);
SELECT throws_ok(
  $$SELECT public.launch_upsert_piece('{"trade_date":"2026-10-15","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":9,"sent_rel_us":-1,"result":"101"}'::jsonb, 'other')$$,
  '22023', NULL, '(2026-10-15, KB120, Q16, KRX, K, p_source other) launch_upsert_piece → 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_upsert_head('{"trade_date":"2026-10-15","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K"}'::jsonb, 'other')$$,
  '22023', NULL, '(2026-10-15, KB120, Q16, KRX, K, p_source other) launch_upsert_head → 22023'
);

-- ── 8. 필수 키 누락 · 백필 원자성 ─────────────────────────────────
SELECT throws_ok(
  $$SELECT public.launch_upsert_piece('{"trade_date":"2026-10-16","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":0,"result":"101"}'::jsonb, 'backfill')$$,
  '22023', 'launch_upsert_piece: 필수 키 누락 sent_rel_us',
  '(2026-10-16, KB120, Q16, KRX, K, sent_rel_us 없음) 필수 키 누락 → 22023 · 누락 키 이름'
);
SELECT throws_ok(
  $$SELECT public.launch_backfill_apply('[
      {"trade_date":"2026-10-16","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":0,"sent_rel_us":-300,"result":"101"},
      {"trade_date":"2026-10-16","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":1,"result":"101"}
    ]'::jsonb, NULL)$$,
  '22023', NULL, '(2026-10-16, KB120, Q16, KRX, K, 원소 2 불량) launch_backfill_apply 호출 전체 실패'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE trade_date = '2026-10-16'),
  0,
  '(2026-10-16, KB120, Q16, KRX, K, 원자성) 실패한 백필 호출의 앞 원소도 남지 않는다'
);

-- ── 9. 백필은 journal 행을 못 덮는다 ──────────────────────────────
INSERT INTO t_setup SELECT 'fx_journal_1017', to_jsonb(public.launch_upsert_piece(
  '{"trade_date":"2026-10-17","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
    "wire":0,"sent_rel_us":-140,"result":"접수","journal_epoch":"e1","seq":31}'::jsonb, 'journal'));
INSERT INTO t_setup SELECT 'bf_over_journal', public.launch_backfill_apply(
  '[{"trade_date":"2026-10-17","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K",
     "wire":0,"sent_rel_us":-999,"result":"101"}]'::jsonb, NULL);
SELECT is(
  row((SELECT r::text FROM t_setup WHERE label = 'bf_over_journal'),
      (SELECT source || '/' || sent_rel_us FROM public.launch_pieces WHERE trade_date = '2026-10-17'))::text,
  row('{"heads_in": 0, "pieces_in": 1, "heads_written": 0, "pieces_written": 0}', 'journal/-140')::text,
  '(2026-10-17, KB120, Q16, KRX, K, 백필 vs journal) pieces_written 0 · journal 행 그대로'
);

-- ── 10. 주문 내역 · 경계 지도 — 깨끗한 표에서 ──────────────────────
DELETE FROM public.launch_pieces;
DELETE FROM public.launch_heads;

SELECT is(
  public.launch_map_for_admin('q16'),
  '{"days":[],"heads":[],"pieces":[]}'::jsonb,
  '(—, —, —, —, —, 빈 지도) launch_map_for_admin(q16) = {days:[], heads:[], pieces:[]}'
);

INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003')
ON CONFLICT DO NOTHING;

-- 픽스처: q16(KRX 16:00) KB120 K — 10/20 wire 0·1(0 은 isin 삼성전자 · 1 은 isin null) · 10/21 wire 0 · 10/22 wire 0.
--         10/22 개장: N NXT 09:00:30 buy wire 0·1 · A NXT 09:00:30 sell wire 0 · A KRX 09:00:27 buy wire 0.
--         머리: Q16 KB120 K 10/21(next −150) · 10/22(next −146) · 10/22 N · A(NXT) · A(KRX 09:00:27).
INSERT INTO t_setup SELECT 'fx_map', public.launch_backfill_apply(
  '[
    {"trade_date":"2026-10-20","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":0,"sent_rel_us":-160,"result":"접수","isin":"KR7005930003"},
    {"trade_date":"2026-10-20","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":1,"sent_rel_us":-158,"result":"접수"},
    {"trade_date":"2026-10-21","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":0,"sent_rel_us":-155,"result":"101"},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":0,"sent_rel_us":-150,"result":"접수"},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"N","fire_exchange":"NXT","fire_base":"09:00:30","market":"K","wire":0,"side":"buy","sent_rel_us":-205,"result":"515"},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"N","fire_exchange":"NXT","fire_base":"09:00:30","market":"K","wire":1,"side":"buy","sent_rel_us":-195,"result":"접수"},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"A","fire_exchange":"NXT","fire_base":"09:00:30","market":"K","wire":0,"side":"sell","sent_rel_us":-190,"result":"접수"},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"A","fire_exchange":"KRX","fire_base":"09:00:27","market":"K","wire":0,"side":"buy","sent_rel_us":-210,"result":"접수"}
  ]'::jsonb,
  '[
    {"trade_date":"2026-10-21","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","next_offset_us":-150},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","next_offset_us":-146},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"N","fire_exchange":"NXT","fire_base":"09:00:30","market":"K","n_pieces":2},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"A","fire_exchange":"NXT","fire_base":"09:00:30","market":"K","n_pieces":1},
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"A","fire_exchange":"KRX","fire_base":"09:00:27","market":"K","n_pieces":1}
  ]'::jsonb);

-- 주문 내역
SELECT is(
  public.launch_orders_for_admin()->'dates',
  '["20261022","20261021","20261020"]'::jsonb,
  '(—, —, —, —, —, dates) 조각 있는 날짜 내림차순 YYYYMMDD'
);
SELECT is(
  public.launch_orders_for_admin('20261013') - 'dates',
  '{"date":"20261013","heads":[],"pieces":[]}'::jsonb,
  '(20261013, —, —, —, —, 행 없는 날) date = p_date · heads · pieces 빈 배열'
);
SELECT is(
  public.launch_orders_for_admin('20261013')->'dates',
  '["20261022","20261021","20261020"]'::jsonb,
  '(20261013, —, —, —, —, 행 없는 날) dates 는 그대로'
);
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(e->>'wire', e->'stock_code', e->'stock_name') ORDER BY o)
     FROM jsonb_array_elements(public.launch_orders_for_admin('20261020')->'pieces') WITH ORDINALITY AS x(e, o)),
  '[["0","005930","삼성전자"],["1",null,null]]'::jsonb,
  '(20261020, KB120, Q16, KRX, K, 종목) isin 실은 조각 → 005930 · 삼성전자 · isin null 조각 → null · null'
);
SELECT is(
  (SELECT jsonb_agg(e->>'fire_base' || ' ' || (e->>'fire_exchange') || ' ' || (e->>'profile') || ' ' || (e->>'wire') ORDER BY o)
     FROM jsonb_array_elements(public.launch_orders_for_admin('20261022')->'pieces') WITH ORDINALITY AS x(e, o)),
  '["09:00:27 KRX A 0","09:00:30 NXT A 0","09:00:30 NXT N 0","09:00:30 NXT N 1","16:00:00 KRX Q16 0"]'::jsonb,
  '(20261022, KB120, 전부, —, K, 순서) pieces = gateway, market, fire_base, fire_exchange, profile, wire 순'
);
-- 체결 — kind 17 filled_qty 는 0 고정(모름 → null) · 주문 저널(dma_account_orders)을 order_no 로 join 해 채운다.
UPDATE public.launch_pieces SET account = '37703857101', order_no = '3404000005', qty = 7
 WHERE trade_date = '2026-10-22' AND profile = 'A' AND fire_exchange = 'KRX';
UPDATE public.launch_pieces SET account = '37703857101', order_no = '3404000099', qty = 3
 WHERE trade_date = '2026-10-22' AND profile = 'N' AND wire = 0;
INSERT INTO public.dma_account_orders
  (gateway, trade_date, account_no, order_no, isin, exchange, side, order_type, qty, price, filled_qty, status,
   first_seq, last_seq, created_at, updated_at)
VALUES ('KB120', '2026-10-22', '37703857101', '3404000005', 'KR7005930003', 'KRX', 'B', 'N', 7, 1000, 7, 'filled',
        1, 2, now(), now());
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(e->>'profile', e->>'wire', e->'filled_qty') ORDER BY o)
     FROM jsonb_array_elements(public.launch_orders_for_admin('20261022')->'pieces') WITH ORDINALITY AS x(e, o)
    WHERE e->>'fire_base' <> '16:00:00'),
  '[["A","0",7],["A","0",null],["N","0",null],["N","1",null]]'::jsonb,
  '(20261022, KB120, A·N, —, K, 체결) 저널에 있는 order_no → filled_qty 7 · 저널에 없는 order_no · order_no null → null'
);

SELECT throws_ok(
  $$SELECT public.launch_orders_for_admin('2026-10-22')$$,
  '22023', NULL, '(2026-10-22 형식, —, —, —, —, p_date) YYYYMMDD 아니면 22023'
);

-- 경계 지도
SELECT is(
  public.launch_map_for_admin('q16', 2)->'days',
  '["20261022","20261021"]'::jsonb,
  '(q16, KB120, Q16, KRX, K, p_days 2) days = 최신 2 거래일 내림차순'
);
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(e->>'trade_date', e->>'fire_exchange', e->>'wire') ORDER BY o)
     FROM jsonb_array_elements(public.launch_map_for_admin('q16', 2)->'pieces') WITH ORDINALITY AS x(e, o)),
  '[["20261021","KRX","0"],["20261022","KRX","0"]]'::jsonb,
  '(q16, KB120, Q16, KRX, K, p_days 2) pieces = 그 2일 KRX 16:00 조각만 · trade_date 오름차순'
);
SELECT is(
  row(jsonb_array_length(public.launch_map_for_admin('q16')->'days'),
      jsonb_array_length(public.launch_map_for_admin('q16')->'pieces'))::text,
  '(3,4)',
  '(q16, KB120, Q16, KRX, K, p_days null) 전체 = 3일 · 조각 4'
);
SELECT is(
  (SELECT array_agg(k ORDER BY k COLLATE "C") FROM jsonb_object_keys(public.launch_map_for_admin('q16')->'pieces'->0) AS k),
  ARRAY['fire_exchange','gateway','market','piece_idx','probe','profile','result','result_code','retry','round','sent_rel_us','side','trade_date','wire'],
  '(q16, —, —, —, —, 지도 열) 지도 조각은 14열만(account · dma_user_id · source 없음 · quick-261030-dz7 probe · round · result_code)'
);
-- 뒤탐침(quick-261030-dz7) — gh-trade 16:00 뒤쪽 탐침은 kind 17 probe true · round −2 · wire = 실조각 수 + i.
INSERT INTO t_setup SELECT 'fx_probe', public.launch_backfill_apply(
  '[
    {"trade_date":"2026-10-22","gateway":"KB120","profile":"Q16","fire_exchange":"KRX","fire_base":"16:00:00","market":"K","wire":1,"piece_idx":0,"round":-2,"probe":true,"side":"buy","sent_rel_us":-140,"result":"기타","result_code":"F083"}
  ]'::jsonb,
  '[]'::jsonb);
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(e->'wire', e->'probe', e->'round', e->'result_code') ORDER BY o)
     FROM jsonb_array_elements(public.launch_map_for_admin('q16', 1)->'pieces') WITH ORDINALITY AS x(e, o)),
  '[[0,null,null,null],[1,true,-2,"F083"]]'::jsonb,
  '(20261022, KB120, Q16, KRX, K, 뒤탐침) 실조각 probe · round · result_code null · 뒤탐침 true · −2 · F083'
);
SELECT is(
  (SELECT row(m->'days', jsonb_array_length(m->'pieces'),
              (SELECT jsonb_agg(e->>'side' ORDER BY o) FROM jsonb_array_elements(m->'pieces') WITH ORDINALITY AS x(e, o)),
              (SELECT bool_and(e->>'fire_exchange' = 'NXT' AND e->>'fire_base' IS NULL) FROM jsonb_array_elements(m->'pieces') e))::text
     FROM (SELECT public.launch_map_for_admin('n0930') AS m) s),
  row('["20261022"]'::jsonb, 3, '["sell", "buy", "buy"]'::jsonb, true)::text,
  '(n0930, KB120, N+A, NXT, K, 지도) days 1 · pieces 3(A sell · N buy 2) · KRX 09:00:27 다리 없음'
);
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(e->>'trade_date', e->>'profile', (e->>'next_offset_us')::int) ORDER BY o)
     FROM jsonb_array_elements(public.launch_map_for_admin('q16', 1)->'heads') WITH ORDINALITY AS x(e, o)),
  '[["20261022","Q16",-146]]'::jsonb,
  '(q16, KB120, Q16, KRX, K, 최신 머리) 머리 2일치 중 최신 1행(next_offset_us −146)'
);
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(e->>'profile', e->>'fire_exchange', e->>'fire_base') ORDER BY o)
     FROM jsonb_array_elements(public.launch_map_for_admin('n0930')->'heads') WITH ORDINALITY AS x(e, o)),
  '[["A","NXT","09:00:30"],["N","NXT","09:00:30"]]'::jsonb,
  '(n0930, KB120, A · N, NXT, K, 최신 머리) 프로파일별 1행 · KRX 09:00:27 머리 없음'
);
SELECT throws_ok(
  $$SELECT public.launch_map_for_admin('x')$$,
  '22023', NULL, '(x, —, —, —, —, p_fire) 모르는 발사 기준 → 22023'
);
SELECT throws_ok(
  $$SELECT public.launch_map_for_admin('q16', 0)$$,
  '22023', NULL, '(q16, —, —, —, —, p_days 0) p_days < 1 → 22023'
);

-- ── 11. 권한 ────────────────────────────────────────────────────
SELECT is(
  (SELECT row(
     (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.launch_pieces'::regclass),
     (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.launch_heads'::regclass),
     (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('launch_pieces', 'launch_heads'))
   )::text),
  '(t,t,0)',
  '(—, —, —, —, —, RLS) 두 표 RLS 켬 · pg_policies 0개(service_role 전용 · D-20)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_upsert_piece(jsonb,text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_upsert_piece(jsonb,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_upsert_piece(jsonb,text)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_upsert_piece EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_upsert_head(jsonb,text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_upsert_head(jsonb,text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_upsert_head(jsonb,text)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_upsert_head EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_backfill_apply(jsonb,jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_backfill_apply(jsonb,jsonb)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_backfill_apply(jsonb,jsonb)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_backfill_apply EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_orders_for_admin(text)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_orders_for_admin(text)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_orders_for_admin(text)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_orders_for_admin EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_function_privilege('anon', 'public.launch_map_for_admin(text,integer)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.launch_map_for_admin(text,integer)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.launch_map_for_admin(text,integer)', 'EXECUTE')
  )::text,
  '(f,f,t)', 'launch_map_for_admin EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(
    has_table_privilege('anon', 'public.launch_pieces', 'SELECT'),
    has_table_privilege('authenticated', 'public.launch_pieces', 'SELECT'),
    has_table_privilege('service_role', 'public.launch_pieces', 'SELECT'),
    has_table_privilege('anon', 'public.launch_heads', 'SELECT'),
    has_table_privilege('authenticated', 'public.launch_heads', 'SELECT'),
    has_table_privilege('service_role', 'public.launch_heads', 'SELECT')
  )::text,
  '(f,f,t,f,f,t)', '두 표 SELECT (anon, authenticated, service_role) = (f, f, t) — launch_pieces · launch_heads'
);

SELECT * FROM finish();
ROLLBACK;
