-- ============================================================
-- Phase 35 Plan 04 — kind 17(LaunchPiece) · 18(LaunchHead) DB 쪽 해석 배선 pgTAP.
--
-- 대상 마이그레이션: supabase/migrations/20261027200100_launch_gate_apply.sql
--   (launch_project_event 스텁 · dma_strategy_apply 재정의 · launch_reproject ·
--    dma_strategy_events_for_user_json · dma_order_events_for_user 재정의)
--
-- 잠그는 것:
--   - 스텁(마이그레이션 그대로): kind 17 원문은 남고 launch_* 는 비며 errors 는 빈 배열이다(서버 먼저 배포 안전).
--   - 트레이서: kind 1 · 17 · 18 이 섞인 한 배치 → applied 3 · rows 길이 1(kind 1 만) · 원문 3행 ·
--     launch_pieces 1 · launch_heads 1(source journal · 추적 열은 원문 epoch · seq) · 커서 전진.
--   - 포이즌(T-19-15 동형): 투영이 RAISE → applied 그대로 · errors[{seq, error}] 1 · 원문 남음 · 같은 배치의 kind 1 정상 ·
--     커서 전진 · 그 이벤트의 투영만 되돌림.
--   - 재생 멱등: 같은 배치 2회째 = skipped 3 · 투영 호출 0 · launch_* updated_at 불변.
--   - 도착 순서: 머리 먼저 / 조각 먼저(다른 배치) / 한 배치 [18, 17] — 결과 동일.
--   - launch_reproject: 스텁 때 쌓인 원문 → 매핑 교체 → 재투영으로 행이 생긴다 · 같은 키 seq 큰 쪽이 이긴다 ·
--     2회 멱등 · 날짜 범위로 거른다.
--   - 가시성(D-05): 실계좌 account_no + order_no 를 실은 kind 17 이 주문로그 래퍼 · 주문 펼침 타임라인 어디에도 없다.
--   - purge(D-05): kind 15·16 보존 purge 가 옛날짜 kind 17·18 원문을 지우지 않고 반환 수에도 넣지 않는다.
--   - 권한: 새 함수 2개 · 재정의 3함수 EXECUTE (anon, authenticated, service_role) = (f, f, t).
--
-- 테스트 매핑은 정식 매핑이 아니다 — 칸 매핑은 gh-trade 노트 뒤 35-10 이 정한다. 이 파일은 테스트 트랜잭션 안에서
-- `launch_project_event` 를 테스트용 가짜 매핑(reason_code → profile · exchange → fire_exchange · message → market ·
-- entry_round → wire · price → sent_rel_us · result_code → result · qty → n_pieces)으로 `CREATE OR REPLACE` 해
-- apply 배선만 증명한다. 끝의 ROLLBACK 으로 사라진다.
-- 매핑 버전은 t_mode 한 칸으로 고른다: 'map'(가짜 매핑) · 'boom'(RAISE — 포이즌) · 'stub'(no-op — Wave A 와 같음).
--
-- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate_apply.test.sql`
-- — 일회용 로컬 컨테이너에 저장소 마이그레이션을 재생한 뒤에만 돈다(공유 · 원격 DB 접촉 0).
-- 전체가 한 트랜잭션이고 끝에서 ROLLBACK 한다. 다른 테스트 파일에 의존하지 않는다.
--
-- 단언 설명에는 (게이트웨이 epoch seq, kind, 기대) 튜플을 적는다.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

-- ── 픽스처 ──────────────────────────────────────────────────────
INSERT INTO public.stocks (code, name, market, isin)
VALUES ('005930', '삼성전자', 'KOSPI', 'KR7005930003');

-- 전략 이벤트 1건 — relay `STRATEGY_APPLY_KEYS` 43키 전부(없는 값은 0 / "" / false / [] — 와이어 규약) 위에 p_over 를 덮는다.
-- (dma_strategy_apply.test.sql 의 헬퍼 + 거래일 인자)
CREATE FUNCTION pg_temp.sev(
  p_seq bigint, p_kind int, p_group int, p_account text, p_order_no text, p_hms text,
  p_over jsonb DEFAULT '{}'::jsonb, p_date text DEFAULT '2026-09-29'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq,
    'trade_date', p_date,
    'gw_time_ms', (extract(epoch FROM (p_date || ' ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'kind', p_kind,
    'group', p_group,
    'exchange', 'KRX',
    'isin', 'KR7005930003',
    'cum_volume', 0,
    'dma_user_id', CASE WHEN p_account = '' THEN '' ELSE 'dma-shared' END,
    'account_no', p_account,
    'order_no', p_order_no,
    'price', 0,
    'qty', 0,
    'order_condition', '',
    'reason_code', '',
    'cond_threshold', 0,
    'cond_actual', 0,
    'cond_metric', 0,
    'ev_kind', 0,
    'ev_price', 0,
    'ev_qty_before', 0,
    'ev_qty_after', 0,
    'ev_trade_qty', 0,
    'limit_bid_qty', 0,
    'bid1_price', 0,
    'bid1_qty', 0,
    'accept_latency_us', 0,
    'immediate_fill_qty', 0,
    'queue_case', 0,
    'base_cum', 0,
    'ahead_qty', 0,
    'expected_cum', 0,
    'error_volume', 0,
    'remaining_volume', 0,
    'has_remaining', false,
    'cancel_reason', 0,
    'result_code', 0,
    'message', '',
    'entry_round', 0,
    'snap_qty', '[]'::jsonb,
    'snap_cum', '[]'::jsonb,
    'ask_qty_at_limit', 0,
    'open_at_limit', false
  ) || p_over
$$;

-- 발사 조각(kind 17) 1건 — 프로파일 · 시장 · wire · 상대 발사 시각(µs) · 결과코드.
CREATE FUNCTION pg_temp.piece(
  p_seq bigint, p_profile text, p_wire int, p_rel int, p_result int DEFAULT 101,
  p_date text DEFAULT '2026-09-29', p_over jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(p_seq, 17, 0, '', '', '15:59:59.700', jsonb_build_object(
    'reason_code', p_profile, 'message', 'K', 'entry_round', p_wire, 'price', p_rel, 'result_code', p_result
  ) || p_over, p_date)
$$;

-- 발사 머리(kind 18) 1건 — 조각 수는 qty.
CREATE FUNCTION pg_temp.head(
  p_seq bigint, p_profile text, p_n int, p_date text DEFAULT '2026-09-29'
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.sev(p_seq, 18, 0, '', '', '16:00:01.000', jsonb_build_object(
    'reason_code', p_profile, 'message', 'K', 'qty', p_n
  ), p_date)
$$;

-- KST 오늘 기준 날짜(문자열) — purge 기준이 now() 라 옛날짜는 상대값으로 둔다. 트랜잭션 안이라 now() 는 고정이다.
CREATE FUNCTION pg_temp.kd(p_offset int) RETURNS text LANGUAGE sql AS $$
  SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date - p_offset, 'YYYY-MM-DD')
$$;

-- 주문 통보 1건 — relay 주문 기록기 23키(접수 A 기본값) 위에 p_over 를 덮는다(dma_strategy_read.test.sql 헬퍼).
CREATE FUNCTION pg_temp.jev(
  p_seq bigint, p_account text, p_order_no text, p_hms text, p_over jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'seq', p_seq, 'trade_date', '2026-09-29',
    'gw_time_ms', (extract(epoch FROM ('2026-09-29 ' || p_hms || '+09')::timestamptz) * 1000)::bigint,
    'dma_user_id', 'dma-audit', 'account_no', p_account, 'isin', 'KR7005930003',
    'side', 'B', 'side_trusted', true, 'order_no', p_order_no, 'org_order_no', '',
    'notice_type', 'A', 'request_kind', 'New', 'requester', '', 'origin', 'LimitChaser',
    'exchange', 'KRX', 'board', '', 'order_price', 12350, 'order_qty', 300,
    'exec_price', 0, 'exec_qty', 0, 'result_code', 0, 'message', '접수', 'local_reject', false
  ) || p_over
$$;

-- 가시성 픽스처: U1(dma-lg-a) → KB120 …7801. (Phase 29 v2 — app_users trader + DMA 연결 × 그 게이트웨이 계좌 매핑)
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-000000003501', 'lg-u1@example.invalid');
INSERT INTO public.dma_users (dma_user_id, password_enc) VALUES ('dma-lg-a', 'test-enc');
INSERT INTO public.app_users (email, role, dma_user_id) VALUES ('lg-u1@example.invalid', 'trader', 'dma-lg-a');

CREATE TEMP TABLE t_apply (label text PRIMARY KEY, r jsonb NOT NULL);

INSERT INTO t_apply SELECT 'access_kb', to_jsonb(public.dma_journal_sync_access('KB120', '[
  {"dma_user_id":"dma-lg-a","account_no":"1234567801","name":"위탁","priority":1}
]'::jsonb));

-- Wave A 스텁(20261027200100 ① 과 같은 no-op) — kind 17 원문 2건(같은 논리 키 KYOBO119 · R · wire 0 · seq 20 −300 · seq 21 −290).
-- 아래 reproject 단언이 이 원문을 다시 푼다. 35-10(20261028200000)이 정식 매핑으로 교체한 뒤에도 이 단언이 「스텁 시절」
-- 을 재현하도록 테스트 안에서 스텁 본문을 다시 깐다(정식 매핑 단언은 launch_project_mapping.test.sql).
CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp
AS $$ BEGIN RETURN; END; $$;

INSERT INTO t_apply
SELECT 'stub', public.dma_strategy_apply('KYOBO119', 'r1', jsonb_build_array(
  pg_temp.piece(20, 'R', 0, -300, 101, '2026-08-03'),
  pg_temp.piece(21, 'R', 0, -290, 101, '2026-08-03')
));

-- 테스트 매핑 스위치 · 호출 계수.
CREATE TEMP TABLE t_mode (mode text NOT NULL);
INSERT INTO t_mode VALUES ('map');
CREATE TEMP TABLE t_calls (kind smallint NOT NULL, seq bigint NOT NULL);

-- 테스트용 가짜 매핑(정식 매핑 아님 — ROLLBACK 으로 사라진다). 같은 시그니처로 교체한다.
CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text := (SELECT mode FROM pg_temp.t_mode LIMIT 1);
BEGIN
  IF v_mode = 'stub' THEN
    RETURN;
  ELSIF v_mode = 'boom' THEN
    RAISE EXCEPTION 'boom (kind %, seq %)', p_ev.kind, p_ev.seq;
  END IF;

  INSERT INTO pg_temp.t_calls VALUES (p_ev.kind, p_ev.seq);

  IF p_ev.kind = 17 THEN
    PERFORM public.launch_upsert_piece(jsonb_build_object(
      'trade_date', p_ev.trade_date, 'gateway', p_ev.gateway, 'profile', p_ev.reason_code,
      'fire_exchange', p_ev.exchange, 'fire_base', '16:00:00', 'market', p_ev.message,
      'wire', p_ev.entry_round, 'sent_rel_us', p_ev.price, 'result', p_ev.result_code::text,
      'order_no', nullif(p_ev.order_no, ''), 'account', nullif(p_ev.account_no, ''),
      'dma_user_id', nullif(p_ev.dma_user_id, ''),
      'journal_epoch', p_ev.journal_epoch, 'seq', p_ev.seq, 'gw_time_ms', p_ev.gw_time_ms
    ), 'journal');
  ELSIF p_ev.kind = 18 THEN
    PERFORM public.launch_upsert_head(jsonb_build_object(
      'trade_date', p_ev.trade_date, 'gateway', p_ev.gateway, 'profile', p_ev.reason_code,
      'fire_exchange', p_ev.exchange, 'fire_base', '16:00:00', 'market', p_ev.message,
      'n_pieces', p_ev.qty,
      'journal_epoch', p_ev.journal_epoch, 'seq', p_ev.seq, 'gw_time_ms', p_ev.gw_time_ms
    ), 'journal');
  END IF;
  RETURN;
END;
$$;

SELECT plan(38);

-- ── 0. 마이그레이션 스텁(no-op) ─────────────────────────────────
SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors', jsonb_array_length(r->'rows'))::text
     FROM t_apply WHERE label = 'stub'),
  '(2,0,[],0)', '(KYOBO119 r1 seq 20·21, kind 17, 스텁) (applied, skipped, errors, rows 길이) = (2, 0, [], 0)'
);
SELECT is(
  row((SELECT count(*)::int FROM public.dma_strategy_events WHERE gateway = 'KYOBO119' AND journal_epoch = 'r1'),
      (SELECT count(*)::int FROM public.launch_pieces) + (SELECT count(*)::int FROM public.launch_heads))::text,
  '(2,0)', '(KYOBO119 r1 seq 20·21, kind 17, 스텁) (원문 행, launch_* 행) = (2, 0) — 스텁은 아무것도 투영하지 않는다'
);

-- ── 1. 트레이서: kind 1 · 17 · 18 이 섞인 한 배치 ─────────────────
INSERT INTO t_apply
SELECT 'mixed', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.sev(1, 1, 0, '', '', '09:42:13.215', '{"ask_qty_at_limit":185400}'::jsonb),
  pg_temp.piece(2, 'Q16', 0, -305, 101),
  pg_temp.head(3, 'Q16', 3)
));

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors')::text FROM t_apply WHERE label = 'mixed'),
  '(3,0,[])', '(KB120 e1 seq 1·2·3, kind 1·17·18) (applied, skipped, errors) = (3, 0, [])'
);
SELECT is(
  (SELECT row(jsonb_array_length(r->'rows'), (r->'rows'->0->>'kind')::int, (r->'rows'->0->>'seq')::int)::text
     FROM t_apply WHERE label = 'mixed'),
  '(1,1,1)', '(KB120 e1 seq 1·2·3, kind 1·17·18) rows 길이 1 · rows[0] = kind 1 seq 1 — 17·18 은 rows 에 없다(ws 푸시 0)'
);
SELECT is(
  (SELECT array_agg(kind ORDER BY seq)::text FROM public.dma_strategy_events WHERE gateway = 'KB120' AND journal_epoch = 'e1'),
  '{1,17,18}', '(KB120 e1 seq 1·2·3) 원문 3행 — kind {1, 17, 18} 모두 남는다'
);
SELECT is(
  (SELECT row(source, journal_epoch, seq, sent_rel_us, wire, result, fire_exchange, market, fire_base)::text
     FROM public.launch_pieces WHERE gateway = 'KB120' AND profile = 'Q16'),
  '(journal,e1,2,-305,0,101,KRX,K,16:00:00)',
  '(KB120 e1 seq 2, kind 17, Q16) launch_pieces 1행 (source, epoch, seq, sent_rel_us, wire, result, 거래소, 시장, 기준) = (journal, e1, 2, −305, 0, 101, KRX, K, 16:00:00)'
);
SELECT is(
  (SELECT row(source, journal_epoch, seq, n_pieces)::text FROM public.launch_heads WHERE gateway = 'KB120' AND profile = 'Q16'),
  '(journal,e1,3,3)', '(KB120 e1 seq 3, kind 18, Q16) launch_heads 1행 (source, epoch, seq, n_pieces) = (journal, e1, 3, 3)'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces) + (SELECT count(*)::int FROM public.launch_heads),
  2, '(KB120 e1, kind 17·18) 두 표 합계 2행 — kind 1 은 투영되지 않는다'
);
SELECT is(
  (SELECT row(strategy_journal_epoch, strategy_last_seq, (SELECT r->>'last_seq' FROM t_apply WHERE label = 'mixed'))::text
     FROM public.dma_journal_cursor WHERE gateway = 'KB120'),
  '(e1,3,3)', '(KB120 e1 seq 3) 전략 커서 (epoch, strategy_last_seq, 반환 last_seq) = (e1, 3, 3)'
);

-- ── 2. 포이즌: 투영이 RAISE ─────────────────────────────────────
UPDATE t_mode SET mode = 'boom';
INSERT INTO t_apply
SELECT 'poison', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.piece(10, 'P', 0, -301, 101),
  pg_temp.sev(11, 1, 0, '', '', '10:00:00.000')
));
UPDATE t_mode SET mode = 'map';

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, jsonb_array_length(r->'errors'), (r->'errors'->0->>'seq')::int)::text
     FROM t_apply WHERE label = 'poison'),
  '(2,0,1,10)', '(KB120 e1 seq 10·11, kind 17 포이즌 · kind 1) (applied, skipped, errors 길이, errors[0].seq) = (2, 0, 1, 10)'
);
SELECT ok(
  (SELECT r->'errors'->0->>'error' FROM t_apply WHERE label = 'poison') LIKE '%boom%',
  '(KB120 e1 seq 10, kind 17 포이즌) errors[0].error 에 투영 함수의 사유(boom)가 실린다'
);
SELECT is(
  (SELECT array_agg(kind ORDER BY seq)::text FROM public.dma_strategy_events
    WHERE gateway = 'KB120' AND journal_epoch = 'e1' AND seq IN (10, 11)),
  '{17,1}', '(KB120 e1 seq 10·11, kind 17 포이즌 · kind 1) 원문 2행 모두 남는다(INSERT 는 예외 블록 밖)'
);
SELECT is(
  (SELECT row(jsonb_array_length(r->'rows'), (r->'rows'->0->>'seq')::int, (r->'rows'->0->>'kind')::int)::text
     FROM t_apply WHERE label = 'poison'),
  '(1,11,1)', '(KB120 e1 seq 11, kind 1) 같은 배치의 다른 이벤트는 정상 — rows 길이 1 · rows[0] = seq 11 kind 1'
);
SELECT is(
  (SELECT row(strategy_last_seq, (SELECT r->>'last_seq' FROM t_apply WHERE label = 'poison'))::text
     FROM public.dma_journal_cursor WHERE gateway = 'KB120'),
  '(11,11)', '(KB120 e1 seq 11, 포이즌 배치) 커서 전진 (strategy_last_seq, 반환 last_seq) = (11, 11)'
);
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE profile = 'P'),
  0, '(KB120 e1 seq 10, kind 17 포이즌, P) 실패한 투영은 되돌려져 launch_pieces 에 행이 없다'
);

-- ── 3. 재생 멱등: 트레이서 배치를 그대로 한 번 더 ───────────────────
-- updated_at 은 트랜잭션 안에서 now() 로 고정이라 표시값(2000-01-01)을 박아 두고 그대로인지 본다.
UPDATE public.launch_pieces SET updated_at = '2000-01-01 00:00:00+00' WHERE profile = 'Q16';
UPDATE public.launch_heads  SET updated_at = '2000-01-01 00:00:00+00' WHERE profile = 'Q16';
INSERT INTO t_apply
SELECT 'replay', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.sev(1, 1, 0, '', '', '09:42:13.215', '{"ask_qty_at_limit":185400}'::jsonb),
  pg_temp.piece(2, 'Q16', 0, -305, 101),
  pg_temp.head(3, 'Q16', 3)
));

SELECT is(
  (SELECT row((r->>'applied')::int, (r->>'skipped')::int, r->'errors', jsonb_array_length(r->'rows'))::text
     FROM t_apply WHERE label = 'replay'),
  '(0,3,[],0)', '(KB120 e1 seq 1·2·3 재생) (applied, skipped, errors, rows 길이) = (0, 3, [], 0)'
);
SELECT is(
  (SELECT count(*)::int FROM t_calls),
  2, '(KB120 e1 seq 1·2·3 재생) 투영 호출 누계 2(트레이서 seq 2·3 만) — 재생은 투영을 다시 돌리지 않는다'
);
SELECT is(
  row((SELECT updated_at FROM public.launch_pieces WHERE profile = 'Q16'),
      (SELECT updated_at FROM public.launch_heads WHERE profile = 'Q16'))::text,
  row('2000-01-01 00:00:00+00'::timestamptz, '2000-01-01 00:00:00+00'::timestamptz)::text,
  '(KB120 e1 seq 2·3 재생, Q16) launch_pieces · launch_heads updated_at 불변'
);

-- ── 4. 도착 순서: 머리 먼저 / 조각 먼저 / 한 배치 [18, 17] ─────────────
INSERT INTO t_apply SELECT 'qa_head',  public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(pg_temp.head(30, 'QA', 2)));
INSERT INTO t_apply SELECT 'qa_piece', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(pg_temp.piece(31, 'QA', 0, -310)));
INSERT INTO t_apply SELECT 'qb_piece', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(pg_temp.piece(32, 'QB', 0, -310)));
INSERT INTO t_apply SELECT 'qb_head',  public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(pg_temp.head(33, 'QB', 2)));
INSERT INTO t_apply SELECT 'qc_mixed', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.head(34, 'QC', 2), pg_temp.piece(35, 'QC', 0, -310)));

SELECT results_eq(
  $$SELECT profile, wire, sent_rel_us, result, source FROM public.launch_pieces
     WHERE gateway = 'KB120' AND profile IN ('QA', 'QB', 'QC') ORDER BY profile$$,
  $$VALUES ('QA', 0, -310, '101', 'journal'), ('QB', 0, -310, '101', 'journal'), ('QC', 0, -310, '101', 'journal')$$,
  '(KB120 e1 seq 30~35, kind 17, QA 머리 먼저 · QB 조각 먼저 · QC 한 배치) launch_pieces 세 키 같은 값 (wire 0, −310, 101, journal)'
);
SELECT results_eq(
  $$SELECT profile, n_pieces, source FROM public.launch_heads
     WHERE gateway = 'KB120' AND profile IN ('QA', 'QB', 'QC') ORDER BY profile$$,
  $$VALUES ('QA', 2, 'journal'), ('QB', 2, 'journal'), ('QC', 2, 'journal')$$,
  '(KB120 e1 seq 30~35, kind 18, QA · QB · QC) launch_heads 세 키 같은 값 (n_pieces 2, journal) — 도착 순서 무관'
);

-- ── 5. launch_reproject: 스텁 때 쌓인 원문을 매핑 교체 뒤 다시 푼다 ───────
SELECT is(
  (SELECT count(*)::int FROM public.launch_pieces WHERE gateway = 'KYOBO119' AND profile = 'R'),
  0, '(KYOBO119 r1 seq 20·21, kind 17, R) 매핑 교체 전 적재분은 아직 launch_pieces 에 없다'
);

INSERT INTO t_apply SELECT 'rp1', public.launch_reproject();
INSERT INTO t_apply SELECT 'rp1_n', to_jsonb((SELECT count(*)::int FROM public.launch_pieces) + (SELECT count(*)::int FROM public.launch_heads));
INSERT INTO t_apply SELECT 'rp2', public.launch_reproject();

SELECT is(
  (SELECT row((r->>'projected')::int, r->'errors')::text FROM t_apply WHERE label = 'rp1'),
  row((SELECT count(*)::int FROM public.dma_strategy_events WHERE kind IN (17, 18)), '[]'::jsonb)::text,
  '(전 게이트웨이, kind 17·18, reproject()) (projected, errors) = (원문 17·18 행 수, [])'
);
SELECT is(
  (SELECT row(sent_rel_us, seq, journal_epoch, source)::text FROM public.launch_pieces WHERE gateway = 'KYOBO119' AND profile = 'R'),
  '(-290,21,r1,journal)', '(KYOBO119 r1 seq 20·21, kind 17, R) 재투영 뒤 (sent_rel_us, seq, epoch, source) = (−290, 21, r1, journal) — seq 큰 쪽이 이긴다'
);
SELECT is(
  row((SELECT (r->>'projected')::int FROM t_apply WHERE label = 'rp2'),
      (SELECT r::int FROM t_apply WHERE label = 'rp1_n'),
      (SELECT sent_rel_us FROM public.launch_pieces WHERE gateway = 'KYOBO119' AND profile = 'R'))::text,
  row((SELECT (r->>'projected')::int FROM t_apply WHERE label = 'rp1'),
      (SELECT count(*)::int FROM public.launch_pieces) + (SELECT count(*)::int FROM public.launch_heads),
      -290)::text,
  '(전 게이트웨이, reproject() 2회째) (projected, 1회 뒤 행 수, R sent_rel_us) = (1회 projected, 지금 행 수, −290) — 멱등'
);
SELECT is(
  (SELECT (public.launch_reproject('2026-08-03', '2026-08-03')->>'projected')::int),
  2, '(KYOBO119 r1, 2026-08-03 ~ 2026-08-03) 그날만 → projected 2'
);
SELECT is(
  (SELECT (public.launch_reproject(NULL, '2026-08-02')->>'projected')::int),
  0, '(—, ~ 2026-08-02) 그날을 범위에서 빼면 projected 0'
);
SELECT is(
  (SELECT (public.launch_reproject('2026-08-04', '2026-08-31')->>'projected')::int),
  0, '(—, 2026-08-04 ~ 2026-08-31) p_from 으로 그날을 빼면 projected 0'
);

-- ── 6. 가시성: 실계좌 · 주문번호를 실은 kind 17 ──────────────────────
INSERT INTO t_apply SELECT 'journal_kb', public.dma_journal_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.jev(101, '1234567801', '12451', '09:45:02.861')
));
INSERT INTO t_apply SELECT 'vis', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.piece(50, 'VIS', 0, -305, 101, '2026-09-29',
    '{"account_no":"1234567801","order_no":"12451","dma_user_id":"dma-lg-a"}'::jsonb),
  pg_temp.sev(51, 3, 1, '1234567801', '12451', '09:45:02.861', '{"price":12350,"qty":300}'::jsonb)
));

CREATE FUNCTION pg_temp.oid12451() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.dma_account_orders
   WHERE gateway = 'KB120' AND trade_date = '2026-09-29' AND account_no = '1234567801' AND order_no = '12451'
$$;

SELECT ok(
  EXISTS (SELECT 1 FROM public.dma_strategy_events_for_user('00000000-0000-4000-8000-000000003501', '2026-09-29') AS t(ev)
           WHERE (t.ev->>'kind')::int = 17 AND t.ev->>'seq' = '50'),
  '(U1, KB120 …7801 12451, kind 17 seq 50) 전제: SETOF 원천은 실계좌 kind 17 을 그 계좌 사용자에게 돌려준다 — 거르는 곳은 래퍼'
);
SELECT is(
  (SELECT array_agg(DISTINCT (x->>'kind')::int ORDER BY (x->>'kind')::int)::text
     FROM jsonb_array_elements(public.dma_strategy_events_for_user_json('00000000-0000-4000-8000-000000003501', '2026-09-29', true)) x),
  '{1,3}', '(U1, KB120 2026-09-29, 주문로그 래퍼 include_limit_feature=true) kind 집합 = {1, 3} — kind 3 있음 · 17·18 없음'
);
SELECT is(
  (SELECT row(
     (SELECT array_agg(DISTINCT (t.ev->>'kind')::int)::text
        FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000003501', pg_temp.oid12451(), NULL) t
       WHERE t.source = 'strategy'),
     (SELECT count(*)::int
        FROM public.dma_order_events_for_user('00000000-0000-4000-8000-000000003501', pg_temp.oid12451(), NULL) t
       WHERE t.source = 'journal'))::text),
  '({3},1)', '(U1, KB120 …7801 12451, 주문 펼침 타임라인) (strategy 갈래 kind 집합, journal 행 수) = ({3}, 1) — kind 17 없음'
);

-- ── 7. purge: kind 15·16 보존 purge 는 kind 17·18 을 지우지 않는다 ─────────
INSERT INTO t_apply SELECT 'old', public.dma_strategy_apply('KB120', 'e1', jsonb_build_array(
  pg_temp.piece(60, 'OLD', 0, -300, 101, pg_temp.kd(40)),
  pg_temp.head(61, 'OLD', 1, pg_temp.kd(40)),
  pg_temp.sev(62, 15, 0, '', '', '15:30:00.000', '{}'::jsonb, pg_temp.kd(40))
));

SELECT is(
  public.dma_strategy_events_purge_limit_feature(30),
  1, '(KB120 e1 seq 60·61·62, kind 17·18·15, KST 오늘 − 40일) purge(30) 반환 1 — kind 15 만 센다'
);
SELECT is(
  (SELECT array_agg(kind ORDER BY seq)::text FROM public.dma_strategy_events
    WHERE gateway = 'KB120' AND journal_epoch = 'e1' AND seq IN (60, 61, 62)),
  '{17,18}', '(KB120 e1 seq 60·61·62, KST 오늘 − 40일) purge 뒤 kind 17·18 원문 2행이 남고 kind 15 만 지워졌다'
);
SELECT is(
  row((SELECT count(*)::int FROM public.launch_pieces WHERE profile = 'OLD'),
      (SELECT count(*)::int FROM public.launch_heads WHERE profile = 'OLD'))::text,
  '(1,1)', '(KB120 e1 seq 60·61, OLD) purge 뒤에도 launch_pieces · launch_heads 각 1행(영구 보관)'
);

-- ── 8. 권한: service_role 전용 ──────────────────────────────────
SELECT is(
  row(has_function_privilege('anon', 'public.launch_project_event(public.dma_strategy_events)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.launch_project_event(public.dma_strategy_events)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.launch_project_event(public.dma_strategy_events)', 'EXECUTE'))::text,
  '(f,f,t)', 'launch_project_event EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.launch_reproject(date,date)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.launch_reproject(date,date)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.launch_reproject(date,date)', 'EXECUTE'))::text,
  '(f,f,t)', 'launch_reproject EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_strategy_apply(text,text,jsonb)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_strategy_apply(text,text,jsonb)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_strategy_apply(text,text,jsonb)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_strategy_apply EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_strategy_events_for_user_json(uuid,date,boolean)', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_strategy_events_for_user_json(uuid,date,boolean)', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_strategy_events_for_user_json(uuid,date,boolean)', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_strategy_events_for_user_json EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);
SELECT is(
  row(has_function_privilege('anon', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE'),
      has_function_privilege('authenticated', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE'),
      has_function_privilege('service_role', 'public.dma_order_events_for_user(uuid,uuid,text[])', 'EXECUTE'))::text,
  '(f,f,t)', 'dma_order_events_for_user EXECUTE (anon, authenticated, service_role) = (f, f, t)'
);

SELECT * FROM finish();
ROLLBACK;
