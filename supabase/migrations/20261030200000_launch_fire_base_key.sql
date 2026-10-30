-- ============================================================
-- quick-261030-d7b — 발사 조각 · 머리 키에 fire_base(A KRX 재확인 회차 공존).
--
-- 무엇:
--   ① public.launch_pieces PK (trade_date, gateway, profile, fire_exchange, market, wire)
--      → (trade_date, gateway, profile, fire_exchange, fire_base, market, wire). 제약 이름 launch_pieces_pkey 유지.
--   ② public.launch_heads  PK (trade_date, gateway, profile, fire_exchange, market)
--      → (trade_date, gateway, profile, fire_exchange, fire_base, market). 제약 이름 launch_heads_pkey 유지.
--   ③ launch_upsert_piece(p_row jsonb, p_source text) · launch_upsert_head(p_row jsonb, p_source text) 같은 시그니처 재정의 —
--      20261027200000 ③ 본문 그대로에서 두 곳만 바꾼다: ON CONFLICT 대상에 fire_base(fire_exchange 다음) ·
--      DO UPDATE SET 의 fire_base 갱신 줄 삭제(이제 충돌 키라 바뀔 수 없다). 검사 · 필수 키 · source 처리 ·
--      WHERE 조건부 덮기 규칙(backfill 은 무엇이든 덮임 · journal 끼리 epoch 다르거나 seq 같거나 큼)은 원문 그대로.
--
-- 왜(원문 사실 — 35-11 Task 2 진행): gh-trade 교보 KYOBO119 의 A 는 마감선 09:00:29.5 폴링에서 KRX 매수를 다시 쏜다
--   (재확인 회차). 그 회차의 kind 17 은 expected_cum 090029000(→ fire_base 09:00:29) · entry_round 0 부터 다시 오고,
--   kind 18 머리도 회차마다 1건이다. 옛 키에는 fire_base 가 없어 재확인 회차 wire 0·1… 이 같은 날 09:00:27 본회차의
--   wire 0·1… 과 같은 키가 되어(같은 epoch · seq 가 더 큼) 본회차 조각 · 머리를 덮었다 — 10-29 KYOBO119 Q ·
--   10-30 KYOBO119 K·Q (seq 3160182 · 3160185 · 3372361 · 3372364 · 3372365~3372367). 원문(dma_strategy_events)은
--   남아 있으므로 이 키 수정 뒤 launch_reproject 로 사라진 행이 복구된다.
--
-- 결정: gh-radar 쪽 키를 고친다(PK 에 fire_base). gh-trade 가 재확인 회차 wire 를 본회차 뒤로 이어 붙이는 방식은 기각 —
--   (1) 이미 쌓인 원문(10-29 · 10-30)은 고칠 수 없어 사라진 행이 돌아오지 않는다 (2) gh-trade 서버 배포가 필요하다.
--
-- 영향 없음(무변경):
--   - launch_backfill_apply · launch_reproject · launch_project_event — 헬퍼를 부르기만 한다(키는 헬퍼 안 ON CONFLICT 뿐).
--   - launch_orders_for_admin(20261030120000 재정의 포함) — ORDER BY 가 이미 fire_base 를 포함하고 키 조인이 없다.
--   - launch_map_for_admin — fire_exchange · fire_base 로 거르므로(q16 = KRX 16:00:00 · n0930 = NXT 09:00:30) 회차마다
--     한 행이 되어도 지도 결과가 같다. A KRX 회차는 어느 지도에도 걸리지 않는다.
--   - relay launch-backfill 의 기준시각 기본값(shared launchFireBaseOf — A KRX 09:00:27) — 백필 입력은 본회차로 정한다.
--   - 인덱스 launch_pieces_fire_date_idx(fire_exchange, fire_base, trade_date DESC) — PK 와 무관.
--
-- 권한: 두 함수 SECURITY INVOKER + 권한 3줄 재진술(CREATE OR REPLACE 는 권한을 유지하지만 플랫폼 auto-grant 관례상
--   명시 — 자동 메모리 feedback_supabase_rpc_revoke). 표 권한 · RLS 무변경.
-- 원격 적용: 커밋만 — 메인 세션이 20:00 KST 뒤(장 밖)에
--   `supabase db push --linked --yes` → `bash scripts/launch-backfill.sh --reproject --from 20261028` (dry-run)
--   → `bash scripts/launch-backfill.sh --reproject --from 20261028 --apply`.
-- 되돌리기: 옛 PK 는 회차가 공존하는 지금 데이터에서 중복으로 실패한다 — 먼저 옛 키별 최신 seq 한 행만 남긴다:
--   DELETE FROM public.launch_pieces a USING public.launch_pieces b
--    WHERE (a.trade_date, a.gateway, a.profile, a.fire_exchange, a.market, a.wire)
--        = (b.trade_date, b.gateway, b.profile, b.fire_exchange, b.market, b.wire)
--      AND (coalesce(a.seq, -1), a.fire_base) < (coalesce(b.seq, -1), b.fire_base);
--   (launch_heads 도 wire 를 뺀 키로 같게) → ALTER TABLE … DROP CONSTRAINT launch_pieces_pkey,
--   ADD CONSTRAINT launch_pieces_pkey PRIMARY KEY (trade_date, gateway, profile, fire_exchange, market, wire)
--   (heads 는 …, market) → 20261027200000 ③ 두 함수 본문(CREATE → CREATE OR REPLACE)과 COMMENT 재적용.
-- ============================================================

BEGIN;

-- ── ① · ② 키 교체(제약 이름 유지 · 한 ALTER 안에서 DROP + ADD) ─────
ALTER TABLE public.launch_pieces
  DROP CONSTRAINT launch_pieces_pkey,
  ADD CONSTRAINT launch_pieces_pkey PRIMARY KEY (trade_date, gateway, profile, fire_exchange, fire_base, market, wire);

ALTER TABLE public.launch_heads
  DROP CONSTRAINT launch_heads_pkey,
  ADD CONSTRAINT launch_heads_pkey PRIMARY KEY (trade_date, gateway, profile, fire_exchange, fire_base, market);

COMMENT ON TABLE public.launch_pieces IS
  'gh-trade 발사 조각 이력 정본(Phase 35 D-01 · A1 — 키에 fire_exchange · quick-261030-d7b — 키에 fire_base(재확인 회차 공존) · 영구 보관). service_role 전용 · 읽기는 launch_orders_for_admin · launch_map_for_admin';
COMMENT ON TABLE public.launch_heads IS
  'gh-trade 발사 머리 이력 정본(Phase 35 D-01 · A1 · D-04 — 백필 머리는 조각에서 계산 · 외래키 없음 D-06 · quick-261030-d7b — 키에 fire_base(재확인 회차 공존)). service_role 전용';
COMMENT ON COLUMN public.launch_pieces.fire_base IS
  '발사 기준시각 — 16:00:00 · 09:00:27 · 09:00:30 (D-03). 키 열 — A KRX 는 본회차 09:00:27 + 마감선 재확인 09:00:29 처럼 하루 여러 기준시각(quick-261030-d7b)';
COMMENT ON COLUMN public.launch_heads.fire_base IS
  '발사 기준시각 — 16:00:00 · 09:00:27 · 09:00:30 (D-03). 키 열 — A KRX 는 본회차 09:00:27 + 마감선 재확인 09:00:29 처럼 하루 여러 기준시각(quick-261030-d7b)';

-- ── ③ 조건부 upsert 헬퍼 — 규칙 한 곳(D-01 · D-04) · ON CONFLICT 대상만 새 키 ──
-- 규칙:
--   - 기존이 backfill 이면 무엇이든 덮는다(백필 재실행 멱등 · 라이브가 백필을 덮음).
--   - 기존이 journal 이면 들어오는 journal 만 덮는다 — 같은 journal_epoch 는 seq 가 같거나 클 때
--     (같은 seq = 같은 원문의 재해석 · launch_reproject 가 매핑 수정을 반영), 다른 epoch 는 새로 온 쪽.
--   - backfill 은 journal 행을 덮지 못한다(false 반환).
-- 입력은 표 열 이름 그대로의 jsonb(라이브 해석은 「원문 칸 → jsonb」 만 만든다). 없는 키는 null.
-- 반환: 쓰였으면 true(삽입 또는 갱신), 규칙에 막혔으면 false.
CREATE OR REPLACE FUNCTION public.launch_upsert_piece(p_row jsonb, p_source text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  r         public.launch_pieces;
  v_missing text[];
  v_n       integer;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('journal', 'backfill') THEN
    RAISE EXCEPTION 'launch_upsert_piece: p_source 는 journal | backfill (got %)', p_source USING ERRCODE = '22023';
  END IF;
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION 'launch_upsert_piece: p_row 는 jsonb 객체여야 한다' USING ERRCODE = '22023';
  END IF;

  r := jsonb_populate_record(NULL::public.launch_pieces, p_row);

  v_missing := array_remove(ARRAY[
    CASE WHEN r.trade_date    IS NULL THEN 'trade_date'    END,
    CASE WHEN r.gateway       IS NULL THEN 'gateway'       END,
    CASE WHEN r.profile       IS NULL THEN 'profile'       END,
    CASE WHEN r.fire_exchange IS NULL THEN 'fire_exchange' END,
    CASE WHEN r.fire_base     IS NULL THEN 'fire_base'     END,
    CASE WHEN r.market        IS NULL THEN 'market'        END,
    CASE WHEN r.wire          IS NULL THEN 'wire'          END,
    CASE WHEN r.sent_rel_us   IS NULL THEN 'sent_rel_us'   END,
    CASE WHEN r.result        IS NULL THEN 'result'        END
  ], NULL);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'launch_upsert_piece: 필수 키 누락 %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;

  r.source := p_source;
  IF p_source = 'backfill' THEN
    r.journal_epoch := NULL;
    r.seq           := NULL;
    r.gw_time_ms    := NULL;
  ELSIF r.journal_epoch IS NULL OR r.seq IS NULL THEN
    RAISE EXCEPTION 'launch_upsert_piece: journal 은 journal_epoch · seq 가 필요하다' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.launch_pieces AS t
         (trade_date, gateway, profile, fire_exchange, fire_base, market, wire,
          side, queued_id, piece_idx, round, probe, order_no, sent_rel_us, result, result_code, accept_time,
          retry, abandoned, isin, price, qty, filled_qty, account, dma_user_id,
          source, journal_epoch, seq, gw_time_ms)
  VALUES (r.trade_date, r.gateway, r.profile, r.fire_exchange, r.fire_base, r.market, r.wire,
          r.side, r.queued_id, r.piece_idx, r.round, r.probe, r.order_no, r.sent_rel_us, r.result, r.result_code, r.accept_time,
          r.retry, r.abandoned, r.isin, r.price, r.qty, r.filled_qty, r.account, r.dma_user_id,
          r.source, r.journal_epoch, r.seq, r.gw_time_ms)
  ON CONFLICT (trade_date, gateway, profile, fire_exchange, fire_base, market, wire) DO UPDATE
     SET side          = EXCLUDED.side,
         queued_id     = EXCLUDED.queued_id,
         piece_idx     = EXCLUDED.piece_idx,
         round         = EXCLUDED.round,
         probe         = EXCLUDED.probe,
         order_no      = EXCLUDED.order_no,
         sent_rel_us   = EXCLUDED.sent_rel_us,
         result        = EXCLUDED.result,
         result_code   = EXCLUDED.result_code,
         accept_time   = EXCLUDED.accept_time,
         retry         = EXCLUDED.retry,
         abandoned     = EXCLUDED.abandoned,
         isin          = EXCLUDED.isin,
         price         = EXCLUDED.price,
         qty           = EXCLUDED.qty,
         filled_qty    = EXCLUDED.filled_qty,
         account       = EXCLUDED.account,
         dma_user_id   = EXCLUDED.dma_user_id,
         source        = EXCLUDED.source,
         journal_epoch = EXCLUDED.journal_epoch,
         seq           = EXCLUDED.seq,
         gw_time_ms    = EXCLUDED.gw_time_ms,
         updated_at    = now()
   WHERE t.source = 'backfill'
      OR (EXCLUDED.source = 'journal'
          AND (t.journal_epoch IS DISTINCT FROM EXCLUDED.journal_epoch OR EXCLUDED.seq >= t.seq));

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

COMMENT ON FUNCTION public.launch_upsert_piece(jsonb, text) IS
  'Phase 35 D-01/D-04 — 발사 조각 조건부 upsert(backfill 은 무엇이든 덮임 · journal 은 journal 만 · 같은 epoch 는 seq 같거나 클 때 · quick-261030-d7b — 키에 fire_base(재확인 회차 공존)). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_upsert_piece(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_upsert_piece(jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_upsert_piece(jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.launch_upsert_head(p_row jsonb, p_source text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  r         public.launch_heads;
  v_missing text[];
  v_n       integer;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('journal', 'backfill') THEN
    RAISE EXCEPTION 'launch_upsert_head: p_source 는 journal | backfill (got %)', p_source USING ERRCODE = '22023';
  END IF;
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RAISE EXCEPTION 'launch_upsert_head: p_row 는 jsonb 객체여야 한다' USING ERRCODE = '22023';
  END IF;

  r := jsonb_populate_record(NULL::public.launch_heads, p_row);

  v_missing := array_remove(ARRAY[
    CASE WHEN r.trade_date    IS NULL THEN 'trade_date'    END,
    CASE WHEN r.gateway       IS NULL THEN 'gateway'       END,
    CASE WHEN r.profile       IS NULL THEN 'profile'       END,
    CASE WHEN r.fire_exchange IS NULL THEN 'fire_exchange' END,
    CASE WHEN r.fire_base     IS NULL THEN 'fire_base'     END,
    CASE WHEN r.market        IS NULL THEN 'market'        END
  ], NULL);
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'launch_upsert_head: 필수 키 누락 %', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
  END IF;

  r.source := p_source;
  IF p_source = 'backfill' THEN
    r.journal_epoch := NULL;
    r.seq           := NULL;
    r.gw_time_ms    := NULL;
  ELSIF r.journal_epoch IS NULL OR r.seq IS NULL THEN
    RAISE EXCEPTION 'launch_upsert_head: journal 은 journal_epoch · seq 가 필요하다' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.launch_heads AS t
         (trade_date, gateway, profile, fire_exchange, fire_base, market,
          offset_used_us, fire_at_us, n_pieces, n_accepted, n_reject, n_other, first_accept_idx, retries, abandoned,
          gate_lo_us, gate_hi_us, nonmono, correction_before_us, correction_after_us, step_us, last_dir, bracketed,
          same_dir_run, reject_span_us, jump, one_way_us, rtt_min_us, next_offset_us,
          source, journal_epoch, seq, gw_time_ms)
  VALUES (r.trade_date, r.gateway, r.profile, r.fire_exchange, r.fire_base, r.market,
          r.offset_used_us, r.fire_at_us, r.n_pieces, r.n_accepted, r.n_reject, r.n_other, r.first_accept_idx, r.retries, r.abandoned,
          r.gate_lo_us, r.gate_hi_us, r.nonmono, r.correction_before_us, r.correction_after_us, r.step_us, r.last_dir, r.bracketed,
          r.same_dir_run, r.reject_span_us, r.jump, r.one_way_us, r.rtt_min_us, r.next_offset_us,
          r.source, r.journal_epoch, r.seq, r.gw_time_ms)
  ON CONFLICT (trade_date, gateway, profile, fire_exchange, fire_base, market) DO UPDATE
     SET offset_used_us       = EXCLUDED.offset_used_us,
         fire_at_us           = EXCLUDED.fire_at_us,
         n_pieces             = EXCLUDED.n_pieces,
         n_accepted           = EXCLUDED.n_accepted,
         n_reject             = EXCLUDED.n_reject,
         n_other              = EXCLUDED.n_other,
         first_accept_idx     = EXCLUDED.first_accept_idx,
         retries              = EXCLUDED.retries,
         abandoned            = EXCLUDED.abandoned,
         gate_lo_us           = EXCLUDED.gate_lo_us,
         gate_hi_us           = EXCLUDED.gate_hi_us,
         nonmono              = EXCLUDED.nonmono,
         correction_before_us = EXCLUDED.correction_before_us,
         correction_after_us  = EXCLUDED.correction_after_us,
         step_us              = EXCLUDED.step_us,
         last_dir             = EXCLUDED.last_dir,
         bracketed            = EXCLUDED.bracketed,
         same_dir_run         = EXCLUDED.same_dir_run,
         reject_span_us       = EXCLUDED.reject_span_us,
         jump                 = EXCLUDED.jump,
         one_way_us           = EXCLUDED.one_way_us,
         rtt_min_us           = EXCLUDED.rtt_min_us,
         next_offset_us       = EXCLUDED.next_offset_us,
         source               = EXCLUDED.source,
         journal_epoch        = EXCLUDED.journal_epoch,
         seq                  = EXCLUDED.seq,
         gw_time_ms           = EXCLUDED.gw_time_ms,
         updated_at           = now()
   WHERE t.source = 'backfill'
      OR (EXCLUDED.source = 'journal'
          AND (t.journal_epoch IS DISTINCT FROM EXCLUDED.journal_epoch OR EXCLUDED.seq >= t.seq));

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

COMMENT ON FUNCTION public.launch_upsert_head(jsonb, text) IS
  'Phase 35 D-01/D-04 — 발사 머리 조건부 upsert(launch_upsert_piece 와 같은 규칙 · quick-261030-d7b — 키에 fire_base(재확인 회차 공존)). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_upsert_head(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_upsert_head(jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_upsert_head(jsonb, text) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 바뀐 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
