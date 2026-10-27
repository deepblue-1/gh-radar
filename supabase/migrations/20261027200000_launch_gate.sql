-- ============================================================
-- Phase 35 Plan 02 — 발사 경계 지도 어드민(launch-gate) 저장소: 조각 · 머리 표 · 조건부 upsert · 어드민 조회 RPC.
--
-- 무엇:
--   ① public.launch_pieces — 발사 조각 한 행(PK trade_date, gateway, profile, fire_exchange, market, wire).
--   ② public.launch_heads  — 발사 머리 한 행(PK trade_date, gateway, profile, fire_exchange, market).
--   ③ launch_upsert_piece(p_row jsonb, p_source text) · launch_upsert_head(p_row jsonb, p_source text)
--      — 「최신 seq 우선 · journal > backfill」 규칙 한 곳(라이브 해석 35-04 와 백필 RPC 가 같이 부른다).
--   ④ launch_backfill_apply(p_pieces jsonb, p_heads jsonb) — 백필 스크립트(35-03)의 쓰기 입구.
--   ⑤ launch_orders_for_admin(p_date text) — 「주문 내역」 탭 하루치(jsonb 1값).
--   ⑥ launch_map_for_admin(p_fire text, p_days integer) — 「경계 지도」 탭(발사 기준 · 최근 N 거래일 · 최신 머리).
--
-- 왜: gh-trade 16:00 Q16 · 09:00:30 N · A(09:00:27 KRX 매수 + 09:00:30 NXT 매도) 발사의 조각 · 머리 이력 정본.
--   서버는 하루치만 남기므로 이 표가 영구 보관한다(D-01 · 보존 정리 없음).
--
-- 결정(35-CONTEXT):
--   D-01 논리 키 + 최신 seq 우선. A1 — 키에 fire_exchange 를 더한다: A 는 한 프로파일 안에서 두 다리(KRX · NXT)를
--        쏘므로 (날짜, 서버, 'A', 시장, wire 0) 이 두 번 나온다. fire_exchange 를 넣어야 두 다리가 두 행으로 공존한다
--        (RESEARCH Pitfall 1 · D-03 의 귀결 — 새 외부 계약 아님).
--   D-02 account · dma_user_id 는 마스킹 없이 저장하고 어드민 응답에 그대로 싣는다 — 「D-02 · 어드민 전용 예외」.
--        원문 표(dma_strategy_events) 머리 주석의 감사 칸 규칙 T-19-08(dma_user_id 는 어떤 RPC 도 반환하지 않는다)과
--        다르다. 사용자 경로(rows · 래퍼)로는 35-04 가 막는다.
--   D-04 source = 'journal' | 'backfill'. 백필 머리는 백필 스크립트가 조각에서 계산해 싣는다(학습 · next_offset_us 는 null).
--   D-06 두 표는 독립 — 외래키 없음. kind 17(조각)과 kind 18(머리)은 도착 순서가 정해져 있지 않다.
--
-- 함정:
--   Pitfall 6 — result · profile · market · fire_exchange 에 CHECK 를 걸지 않는다. 투영 표의 CHECK 위반은 포이즌 격리로
--     그 조각만 조용히 빠진다(어휘는 이미 무응답 · 515 · E127 로 늘어 왔다). 모르는 값은 웹이 회색 「기타」 로 보인다.
--     source 만 CHECK.
--   Pitfall 8 — DB 는 trade_date date · 응답은 to_char(…, 'YYYYMMDD') 텍스트(웹 LimitupDate 와 같은 형식) ·
--     fire_base 는 HH:MM:SS. p_date 는 YYYYMMDD 로 받는다.
--
-- 권한: 두 표는 RLS 켬 + 접근 규칙 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT(서비스롤 전용).
--   읽기는 서버 어드민 RPC 뿐(D-20 · 인가는 Express requireAdmin). 함수는 SECURITY INVOKER + 권한 3줄 재진술
--   (플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을 덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 35-09 메인 세션 `supabase db push`.
-- 되돌리기: DROP FUNCTION public.launch_map_for_admin(text, integer); DROP FUNCTION public.launch_orders_for_admin(text);
--   DROP FUNCTION public.launch_backfill_apply(jsonb, jsonb); DROP FUNCTION public.launch_upsert_head(jsonb, text);
--   DROP FUNCTION public.launch_upsert_piece(jsonb, text); DROP TABLE public.launch_heads; DROP TABLE public.launch_pieces;
-- ============================================================

BEGIN;

-- ── ① 조각 표 ─────────────────────────────────────────────────────
CREATE TABLE public.launch_pieces (
  trade_date    date        NOT NULL,
  gateway       text        NOT NULL,
  profile       text        NOT NULL,
  fire_exchange text        NOT NULL,
  fire_base     time        NOT NULL,
  market        text        NOT NULL,
  wire          integer     NOT NULL,
  side          text,
  queued_id     text,
  piece_idx     integer,
  round         smallint,
  probe         boolean,
  order_no      text,
  sent_rel_us   integer     NOT NULL,
  result        text        NOT NULL,
  result_code   text,
  accept_time   integer,
  retry         smallint,
  abandoned     boolean,
  isin          text,
  price         integer,
  qty           integer,
  filled_qty    integer,
  account       text,
  dma_user_id   text,
  source        text        NOT NULL CHECK (source IN ('journal','backfill')),
  journal_epoch text,
  seq           bigint,
  gw_time_ms    bigint,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (source = 'backfill' OR (journal_epoch IS NOT NULL AND seq IS NOT NULL)),
  PRIMARY KEY (trade_date, gateway, profile, fire_exchange, market, wire)
);

COMMENT ON TABLE public.launch_pieces IS
  'gh-trade 발사 조각 이력 정본(Phase 35 D-01 · A1 — 키에 fire_exchange · 영구 보관). service_role 전용 · 읽기는 launch_orders_for_admin · launch_map_for_admin';
COMMENT ON COLUMN public.launch_pieces.gateway       IS '서버 키 — KB120 · KYOBO119';
COMMENT ON COLUMN public.launch_pieces.profile       IS '발사 프로파일 — Q16 · N · A (CHECK 없음 · Pitfall 6)';
COMMENT ON COLUMN public.launch_pieces.fire_exchange IS '발사 거래소 — KRX · NXT. A 두 다리를 가르는 키 열(A1)';
COMMENT ON COLUMN public.launch_pieces.fire_base     IS '발사 기준시각 — 16:00:00 · 09:00:27 · 09:00:30 (D-03)';
COMMENT ON COLUMN public.launch_pieces.market        IS '시장 — K(코스피) · Q(코스닥). 표시 이름은 웹';
COMMENT ON COLUMN public.launch_pieces.wire          IS '시장 송신 순번(발사 다리 안)';
COMMENT ON COLUMN public.launch_pieces.side          IS 'buy · sell — 백필은 null 가능(D-08)';
COMMENT ON COLUMN public.launch_pieces.queued_id     IS 'Q16 큐 id(Q153027001) · N/A key';
COMMENT ON COLUMN public.launch_pieces.piece_idx     IS '큐 안 조각 순번(j / idx)';
COMMENT ON COLUMN public.launch_pieces.round         IS '회차 0 · 1 · 2';
COMMENT ON COLUMN public.launch_pieces.probe         IS '탐침 조각 여부 — 탐침도 한 조각(gh-trade 게이트 정의)';
COMMENT ON COLUMN public.launch_pieces.sent_rel_us   IS '첫 발 송신 − 기준시각 µs(음수 = 기준시각 전)';
COMMENT ON COLUMN public.launch_pieces.result_code   IS '결과 코드 원문 — 0 · 101 · 515 또는 브로커 원 거부 코드(KB F083 · 교보 E124/E127). text(gh-trade 261027-launch-backfill — 저널은 숫자 아닌 거부코드를 -1000 으로만 가져 원 코드를 문자열로 싣는다)';
COMMENT ON COLUMN public.launch_pieces.result        IS '접수 · 101 · 515 · 기타 · 무응답 … — CHECK 없음(Pitfall 6 · 모르는 값은 웹이 「기타」)';
COMMENT ON COLUMN public.launch_pieces.accept_time   IS '접수 시각 HHMMSSmmm — 앞 0 이 빠진 숫자 그대로(09시대 8자리 · 웹이 9자리 0 패딩 · Pitfall 7)';
COMMENT ON COLUMN public.launch_pieces.retry         IS '재송신 횟수';
COMMENT ON COLUMN public.launch_pieces.abandoned     IS '포기 여부';
COMMENT ON COLUMN public.launch_pieces.account       IS 'D-02 · 어드민 전용 예외 — 계좌번호를 마스킹 없이 저장 · 어드민 응답에만 싣는다(원문 표 T-19-08 감사 칸 규칙과 다름)';
COMMENT ON COLUMN public.launch_pieces.dma_user_id   IS 'D-02 · 어드민 전용 예외 — DMA 사용자 id 를 그대로 저장 · 어드민 응답에만 싣는다(원문 표 T-19-08 감사 칸 규칙과 다름)';
COMMENT ON COLUMN public.launch_pieces.source        IS 'journal(kind 17 라이브 해석) | backfill(로그 백필) — journal 이 backfill 을 덮는다(D-04)';
COMMENT ON COLUMN public.launch_pieces.journal_epoch IS '원문 저널 epoch — journal 행만(백필 null)';
COMMENT ON COLUMN public.launch_pieces.seq           IS '원문 저널 seq — 같은 epoch 안 최신 seq 우선(D-01)';
COMMENT ON COLUMN public.launch_pieces.gw_time_ms    IS '원문 게이트웨이 시각 epoch ms — journal 행만';

-- 지도 날짜 목록(발사 기준별 거래일 내림차순 — launch_map_for_admin)
CREATE INDEX launch_pieces_fire_date_idx ON public.launch_pieces (fire_exchange, fire_base, trade_date DESC);

-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것 — 읽기는 서버 어드민 RPC 뿐(D-20).
ALTER TABLE public.launch_pieces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.launch_pieces FROM PUBLIC;
REVOKE ALL ON TABLE public.launch_pieces FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.launch_pieces TO service_role;

-- ── ② 머리 표 ─────────────────────────────────────────────────────
CREATE TABLE public.launch_heads (
  trade_date           date        NOT NULL,
  gateway              text        NOT NULL,
  profile              text        NOT NULL,
  fire_exchange        text        NOT NULL,
  fire_base            time        NOT NULL,
  market               text        NOT NULL,
  offset_used_us       integer,
  fire_at_us           bigint,
  n_pieces             integer,
  n_accepted           integer,
  n_reject             integer,
  n_other              integer,
  first_accept_idx     integer,
  retries              integer,
  abandoned            integer,
  gate_lo_us           integer,
  gate_hi_us           integer,
  nonmono              boolean,
  correction_before_us integer,
  correction_after_us  integer,
  step_us              integer,
  last_dir             smallint,
  bracketed            boolean,
  same_dir_run         integer,
  reject_span_us       integer,
  jump                 integer,
  one_way_us           integer,
  rtt_min_us           integer,
  next_offset_us       integer,
  source               text        NOT NULL CHECK (source IN ('journal','backfill')),
  journal_epoch        text,
  seq                  bigint,
  gw_time_ms           bigint,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (source = 'backfill' OR (journal_epoch IS NOT NULL AND seq IS NOT NULL)),
  PRIMARY KEY (trade_date, gateway, profile, fire_exchange, market)
);

COMMENT ON TABLE public.launch_heads IS
  'gh-trade 발사 머리 이력 정본(Phase 35 D-01 · A1 · D-04 — 백필 머리는 조각에서 계산 · 외래키 없음 D-06). service_role 전용';
COMMENT ON COLUMN public.launch_heads.fire_base            IS '발사 기준시각 — 16:00:00 · 09:00:27 · 09:00:30 (D-03)';
COMMENT ON COLUMN public.launch_heads.offset_used_us       IS '이번 발사에 쓴 첫 조각 rel 목표 µs(백필 = 첫 조각 sent_rel_us)';
COMMENT ON COLUMN public.launch_heads.fire_at_us           IS '첫 송신 시각 µs(정식 노트 뒤 확정)';
COMMENT ON COLUMN public.launch_heads.n_reject             IS '거부 수 — profile 이 뜻을 정함(Q16 = 101 수 · N = 515 수)';
COMMENT ON COLUMN public.launch_heads.gate_lo_us           IS '경계 하한 µs — 마지막 거부 조각 rel(없으면 null)';
COMMENT ON COLUMN public.launch_heads.gate_hi_us           IS '경계 상한 µs — 첫 접수 조각 rel(없으면 null)';
COMMENT ON COLUMN public.launch_heads.nonmono              IS '비단조 — lo > hi';
COMMENT ON COLUMN public.launch_heads.correction_before_us IS 'Q16 학습 — 보정 전 µs(kind 18 · 백필 null)';
COMMENT ON COLUMN public.launch_heads.correction_after_us  IS 'Q16 학습 — 보정 후 µs(편도 기준 위의 값 · 다음 오프셋 아님 · Pitfall 3)';
COMMENT ON COLUMN public.launch_heads.next_offset_us       IS '다음 발사 첫 조각 rel 목표 µs — kind 18 계산값 · 백필 null(Pitfall 3)';
COMMENT ON COLUMN public.launch_heads.source               IS 'journal(kind 18 라이브 해석) | backfill(조각에서 계산) — journal 이 backfill 을 덮는다(D-04)';

-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것 — 읽기는 서버 어드민 RPC 뿐(D-20).
ALTER TABLE public.launch_heads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.launch_heads FROM PUBLIC;
REVOKE ALL ON TABLE public.launch_heads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.launch_heads TO service_role;

-- ── ③ 조건부 upsert 헬퍼 — 규칙 한 곳(D-01 · D-04) ────────────────
-- 규칙:
--   - 기존이 backfill 이면 무엇이든 덮는다(백필 재실행 멱등 · 라이브가 백필을 덮음).
--   - 기존이 journal 이면 들어오는 journal 만 덮는다 — 같은 journal_epoch 는 seq 가 같거나 클 때
--     (같은 seq = 같은 원문의 재해석 · launch_reproject 가 매핑 수정을 반영), 다른 epoch 는 새로 온 쪽.
--   - backfill 은 journal 행을 덮지 못한다(false 반환).
-- 입력은 표 열 이름 그대로의 jsonb(라이브 해석은 「원문 칸 → jsonb」 만 만든다). 없는 키는 null.
-- 반환: 쓰였으면 true(삽입 또는 갱신), 규칙에 막혔으면 false.
CREATE FUNCTION public.launch_upsert_piece(p_row jsonb, p_source text)
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
  ON CONFLICT (trade_date, gateway, profile, fire_exchange, market, wire) DO UPDATE
     SET fire_base     = EXCLUDED.fire_base,
         side          = EXCLUDED.side,
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
  'Phase 35 D-01/D-04 — 발사 조각 조건부 upsert(backfill 은 무엇이든 덮임 · journal 은 journal 만 · 같은 epoch 는 seq 같거나 클 때). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_upsert_piece(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_upsert_piece(jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_upsert_piece(jsonb, text) TO service_role;

CREATE FUNCTION public.launch_upsert_head(p_row jsonb, p_source text)
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
  ON CONFLICT (trade_date, gateway, profile, fire_exchange, market) DO UPDATE
     SET fire_base            = EXCLUDED.fire_base,
         offset_used_us       = EXCLUDED.offset_used_us,
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
  'Phase 35 D-01/D-04 — 발사 머리 조건부 upsert(launch_upsert_piece 와 같은 규칙). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_upsert_head(jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_upsert_head(jsonb, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_upsert_head(jsonb, text) TO service_role;

-- ── ④ 백필 쓰기 입구(D-04 · D-08 · D-09) ─────────────────────────
-- source = 'backfill' 강제 · 추적 열(journal_epoch · seq · gw_time_ms)은 헬퍼가 비운다.
-- supabase-js .upsert({onConflict}) 는 조건부 WHERE 를 못 걸어 journal 행을 덮으므로 이 RPC 만 쓴다.
-- 한 원소라도 RAISE 면 호출 전체가 되돌아간다(스크립트가 보고 · 배치 단위 원자).
-- 반환: {pieces_in, pieces_written, heads_in, heads_written} — written = 헬퍼가 true 를 돌려준 수
--   (journal 행이 이미 있는 키는 false 라 written 에서 빠진다).
CREATE FUNCTION public.launch_backfill_apply(p_pieces jsonb, p_heads jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pieces jsonb := coalesce(p_pieces, '[]'::jsonb);
  v_heads  jsonb := coalesce(p_heads, '[]'::jsonb);
  e        jsonb;
  v_pw     integer := 0;
  v_hw     integer := 0;
BEGIN
  IF jsonb_typeof(v_pieces) <> 'array' OR jsonb_typeof(v_heads) <> 'array' THEN
    RAISE EXCEPTION 'launch_backfill_apply: p_pieces · p_heads 는 jsonb 배열이어야 한다' USING ERRCODE = '22023';
  END IF;

  FOR e IN SELECT x.value FROM jsonb_array_elements(v_pieces) AS x(value) LOOP
    IF public.launch_upsert_piece(e, 'backfill') THEN
      v_pw := v_pw + 1;
    END IF;
  END LOOP;

  FOR e IN SELECT x.value FROM jsonb_array_elements(v_heads) AS x(value) LOOP
    IF public.launch_upsert_head(e, 'backfill') THEN
      v_hw := v_hw + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pieces_in', jsonb_array_length(v_pieces), 'pieces_written', v_pw,
    'heads_in',  jsonb_array_length(v_heads),  'heads_written',  v_hw);
END;
$$;

COMMENT ON FUNCTION public.launch_backfill_apply(jsonb, jsonb) IS
  'Phase 35 D-04/D-09 — 발사 백필 쓰기(source=backfill 강제 · journal 행은 덮지 않음 · 원소 하나라도 실패면 전체 롤백). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_backfill_apply(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_backfill_apply(jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_backfill_apply(jsonb, jsonb) TO service_role;

-- ── ⑤ 주문 내역 RPC(D-12 · D-13 · D-20) ─────────────────────────
-- 틀 = accum_report_for_user 에서 DMA 게이트 · access 키 · p_user_id 를 뺀 모양(인가는 Express requireAdmin).
-- 응답:
--   {dates: [], date: null, heads: [], pieces: []}  — 조각 행 0
--   {dates, date, heads, pieces}                    — dates = launch_pieces 에 행 있는 날짜 내림차순 YYYYMMDD(조각 기준 · D-12)
--     date = p_date 또는 최신. 행 없는 날짜를 p_date 로 주면 heads · pieces 빈 배열(404 아님 — 200 · Phase 34 D-07 결).
--     행 = 표의 모든 열 − created_at − updated_at · trade_date YYYYMMDD · fire_base HH:MM:SS.
--     조각 행에만 응답 전용 stock_code · stock_name(stocks 를 isin 으로 LEFT JOIN — 없거나 isin null 이면 null · D-13).
--     account · dma_user_id 는 그대로 싣는다 — D-02 · 어드민 전용 예외(원문 표 T-19-08 감사 칸 규칙과 다름).
-- jsonb 스칼라 1값 — SETOF 는 PostgREST max_rows 에 조용히 잘린다. 왕복 1회.
CREATE FUNCTION public.launch_orders_for_admin(p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates text[];
  v_date  text;
  v_day   date;
BEGIN
  IF p_date IS NOT NULL AND p_date !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'launch_orders_for_admin: p_date 는 YYYYMMDD (got %)', p_date USING ERRCODE = '22023';
  END IF;

  v_dates := ARRAY(SELECT DISTINCT to_char(p.trade_date, 'YYYYMMDD') FROM public.launch_pieces p ORDER BY 1 DESC);

  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('dates', '[]'::jsonb, 'date', NULL, 'heads', '[]'::jsonb, 'pieces', '[]'::jsonb);
  END IF;

  v_date := coalesce(p_date, v_dates[1]);
  v_day  := to_date(v_date, 'YYYYMMDD');

  RETURN jsonb_build_object(
    'dates', to_jsonb(v_dates),
    'date', v_date,
    'heads', (SELECT coalesce(jsonb_agg(
                       to_jsonb(h) - 'created_at' - 'updated_at'
                       || jsonb_build_object('trade_date', to_char(h.trade_date, 'YYYYMMDD'),
                                             'fire_base', to_char(h.fire_base, 'HH24:MI:SS'))
                       ORDER BY h.gateway, h.market, h.fire_base, h.profile), '[]'::jsonb)
                FROM public.launch_heads h WHERE h.trade_date = v_day),
    'pieces', (SELECT coalesce(jsonb_agg(
                        to_jsonb(p) - 'created_at' - 'updated_at'
                        || jsonb_build_object('trade_date', to_char(p.trade_date, 'YYYYMMDD'),
                                              'fire_base', to_char(p.fire_base, 'HH24:MI:SS'),
                                              'stock_code', s.code,
                                              'stock_name', s.name)
                        ORDER BY p.gateway, p.market, p.fire_base, p.fire_exchange, p.profile, p.wire), '[]'::jsonb)
                 FROM public.launch_pieces p
                 LEFT JOIN public.stocks s ON s.isin = p.isin
                WHERE p.trade_date = v_day));
END;
$$;

COMMENT ON FUNCTION public.launch_orders_for_admin(text) IS
  'Phase 35 D-12/D-13/D-20 — 발사 주문 내역 하루치(jsonb 1회 · 조각 + 머리 · D-02 어드민 전용 예외로 account · dma_user_id 포함). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_orders_for_admin(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_orders_for_admin(text) TO service_role;

-- ── ⑥ 경계 지도 RPC(D-15 · D-16 · D-17 · D-20 · A4) ──────────────
-- 발사 기준(p_fire):
--   q16   = (KRX, 16:00:00)
--   n0930 = (NXT, 09:00:30) — profile 을 가로지른다(N 매수 + A 매도 · D-03 · D-17).
--   A 의 09:00:27 KRX 매수 다리는 어느 기준에도 걸리지 않는다(지도 없음 — 주문 내역에만).
--   그 밖 값 · p_days < 1 은 SQLSTATE 22023.
-- 응답 {days, heads, pieces}:
--   days   = 그 발사 기준에 조각이 있는 거래일 내림차순 YYYYMMDD · LIMIT p_days(null = 전체).
--            「최근 N일」 은 발사 기준별 거래일이다(A4 — N 은 개장차익 가동일만 있어 q16 날짜로 자르면 안 된다).
--   pieces = 그 날짜들의 그 발사 기준 조각 — 지도 열만(trade_date YYYYMMDD · gateway · market · profile · fire_exchange ·
--            side · wire · piece_idx · sent_rel_us · result · retry) · trade_date, gateway, market, profile, wire 오름차순.
--   heads  = 서버 × 시장 × 프로파일별 그 발사 기준 최신 머리 1행(범위와 무관 — 다음 오프셋 선 · D-16 · D-17).
--            행 모양은 주문 내역 머리와 같다.
-- 경계 · 리본 계산은 웹(shared launchDaysOf) — SQL 에 두 번째 구현을 두지 않는다(왕복 1회는 같다).
-- 빈 경우 {days: [], heads: [], pieces: []}.
CREATE FUNCTION public.launch_map_for_admin(p_fire text, p_days integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ex   text;
  v_base time;
  v_days date[];
BEGIN
  IF p_fire = 'q16' THEN
    v_ex := 'KRX'; v_base := time '16:00:00';
  ELSIF p_fire = 'n0930' THEN
    v_ex := 'NXT'; v_base := time '09:00:30';
  ELSE
    RAISE EXCEPTION 'launch_map_for_admin: p_fire 는 q16 | n0930 (got %)', p_fire USING ERRCODE = '22023';
  END IF;
  IF p_days IS NOT NULL AND p_days < 1 THEN
    RAISE EXCEPTION 'launch_map_for_admin: p_days 는 1 이상 또는 null (got %)', p_days USING ERRCODE = '22023';
  END IF;

  -- 발사 기준별 거래일(launch_pieces_fire_date_idx) — LIMIT NULL = 전체
  v_days := ARRAY(SELECT d.trade_date
                    FROM (SELECT DISTINCT p.trade_date FROM public.launch_pieces p
                           WHERE p.fire_exchange = v_ex AND p.fire_base = v_base) d
                   ORDER BY d.trade_date DESC
                   LIMIT p_days);

  RETURN jsonb_build_object(
    'days', (SELECT coalesce(jsonb_agg(to_char(d, 'YYYYMMDD') ORDER BY d DESC), '[]'::jsonb) FROM unnest(v_days) AS d),
    'heads', (SELECT coalesce(jsonb_agg(
                       to_jsonb(x) - 'created_at' - 'updated_at'
                       || jsonb_build_object('trade_date', to_char(x.trade_date, 'YYYYMMDD'),
                                             'fire_base', to_char(x.fire_base, 'HH24:MI:SS'))
                       ORDER BY x.gateway, x.market, x.profile), '[]'::jsonb)
                FROM (SELECT DISTINCT ON (h.gateway, h.market, h.profile) h.*
                        FROM public.launch_heads h
                       WHERE h.fire_exchange = v_ex AND h.fire_base = v_base
                       ORDER BY h.gateway, h.market, h.profile, h.trade_date DESC) x),
    'pieces', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'trade_date', to_char(p.trade_date, 'YYYYMMDD'),
                        'gateway', p.gateway,
                        'market', p.market,
                        'profile', p.profile,
                        'fire_exchange', p.fire_exchange,
                        'side', p.side,
                        'wire', p.wire,
                        'piece_idx', p.piece_idx,
                        'sent_rel_us', p.sent_rel_us,
                        'result', p.result,
                        'retry', p.retry)
                        ORDER BY p.trade_date, p.gateway, p.market, p.profile, p.wire), '[]'::jsonb)
                 FROM public.launch_pieces p
                WHERE p.fire_exchange = v_ex AND p.fire_base = v_base AND p.trade_date = ANY (v_days)));
END;
$$;

COMMENT ON FUNCTION public.launch_map_for_admin(text, integer) IS
  'Phase 35 D-15/D-16/D-17/D-20 — 발사 경계 지도(q16 = KRX 16:00 · n0930 = NXT 09:00:30 N+A · 발사 기준별 최근 p_days 거래일 · 최신 머리). service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_map_for_admin(text, integer) TO service_role;

COMMIT;

-- PostgREST 스키마 캐시가 새 표 · 함수를 읽게 한다.
NOTIFY pgrst, 'reload schema';
