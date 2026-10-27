-- ============================================================
-- Phase 35 Plan 10 — kind 17(LaunchPiece) · 18(LaunchHead) 정식 칸 매핑: launch_project_event 교체(Wave B · D-06).
--
-- 정본: gh-trade 정식 인계 노트 `docs/inbox/from-gh-trade/261028-launch-plan-contract.md` ⓑ
--   (from_commit 2e090eb9 · fbs_sync_marker f156cb6f · 표의 정본은 gh-trade server/src/trade/queued/LaunchJournal.h 머리 주석).
--   Wave A 스텁(20261027200100 ①)과 같은 시그니처로 교체한다 — apply 의 17·18 서브블록 · launch_reproject 가 이 함수를 부른다.
--
-- kind 17 LaunchPiece(조각 1건 → launch_upsert_piece(…, 'journal')):
--   trade_date · gateway(원문 행) · profile ← cond_metric(1 Q16 · 2 A · 3 N) · fire_exchange ← exchange("KRX"/"NXT") ·
--   fire_base ← expected_cum(HHMMSSmmm — 160000000 · 090027000 · 090030000 → time) · market ← ev_kind(75 'K' · 81 'Q') ·
--   wire ← entry_round · side ← order_condition(B buy · S sell) · queued_id ← message `q=` · piece_idx ← ev_qty_before ·
--   round ← ev_price(−1 = 탐침 — 그대로 둔다 · probe 가 같은 뜻) · probe ← has_remaining · order_no ← order_no ·
--   sent_rel_us ← cond_threshold · result ← queue_case(1 접수 · 2 → 101/515 · 3 기타 · 4 무응답) ·
--   result_code ← message `rc=` 원문(없으면 정수 result_code · 0 이면 null) · accept_time ← cond_actual ·
--   retry ← ev_qty_after · abandoned ← cancel_reason · isin · price · qty · filled_qty ← ev_trade_qty ·
--   account ← account_no · dma_user_id ← dma_user_id · 추적 열 journal_epoch · seq · gw_time_ms ← 원문 행.
-- kind 18 LaunchHead(회차 1건 → launch_upsert_head(…, 'journal')):
--   profile · fire_exchange · fire_base · market 은 17 과 같다 · next_offset_us ← cond_threshold(직접 — A2 폴백
--   `correction_after_us − one_way_us` 는 쓰지 않는다: 노트 ⓔ 「확정」) · offset_used_us ← cond_actual ·
--   gate_lo_us ← error_volume · gate_hi_us ← remaining_volume · nonmono ← cancel_reason · n_pieces ← ev_price ·
--   n_accepted ← ev_qty_before · n_reject ← ev_qty_after(n_retry_rejects — 재전송분 포함 횟수 · Q16 101 · N 515) ·
--   n_other ← ev_trade_qty · first_accept_idx ← limit_bid_qty · retries ← bid1_price · abandoned ← bid1_qty ·
--   one_way_us ← accept_latency_us · rtt_min_us ← immediate_fill_qty ·
--   fire_at_us ← message `fire=HHMMSS.uuuuuu`(KST) 를 trade_date 와 묶은 epoch µs(없거나 형식 밖이면 gw_time_ms × 1000).
--   Q16 학습 8칸(correction_before/after_us · step_us · last_dir · bracketed · same_dir_run · reject_span_us · jump)은
--   노트에서 폐지(gh-trade D-12) — journal 행에서 null. 열은 남긴다(형 변경 없음 → ALTER 없음).
--
-- 센티널 — 「빈값/0 → null」 한 가지가 아니다. 칸별(노트 표 null 열):
--   조각: order_no "" · accept_time 0 · result_code 0(rc 빈 값일 때) · filled_qty 0(= 모름 — gh-trade 0 고정, 체결은 order_no 로
--         주문 저널과 join) · queued_id "" · isin · account · dma_user_id "" → null. round −1 은 null 이 아니다(탐침).
--   머리: gate_lo_us / gate_hi_us 는 0 **이면서** message `lo=-` / `hi=-` 일 때만 null(hi=0 은 진짜 0) ·
--         first_accept_idx −1 · one_way_us 0 · rtt_min_us 0(= 표본 없음) → null.
-- 515 판정(노트 ⓑ): queue_case 2(res=101) 이면서 정수 result_code = 515 또는 rc 가 0515 / E127 이면 result '515'(N 의
--   재전송대상 거부), 아니면 '101'. queue_case 가 1~4 밖이면 res= 원문(없으면 숫자) — CHECK 없음(Pitfall 6 · 웹이 「기타」).
-- profile · fire_exchange · fire_base · market 을 원문에서 정할 수 없으면 null → 헬퍼가 「필수 키 누락」 RAISE →
--   apply errors[{seq, error}] 로 보고된다(조용히 버리지 않는다 · 원문은 남아 매핑을 고친 뒤 reproject).
--
-- 매핑 안 함 — 사용자 결정 2026-10-28(열 추가 없음): 조각 root_ord_num(base_cum) · planned_us(error_volume) ·
--   offset_used_us(remaining_volume) · 머리 plan_rev(entry_round). 머리 gate_both(has_remaining) 는 열 없음 —
--   gate_lo_us · gate_hi_us 가 둘 다 non-null 인 것과 같다(파생). 머리 message `plan=` 목록은 원문 message 에만 남는다.
--   gateway 칸은 원문에 없다 — relay 가 연결(서버)로 알아 원문 행 gateway 에 싣는다(기존 계약).
--
-- 원격 적용: 커밋만 — 35-11 메인 세션 `supabase db push` 뒤 `SELECT public.launch_reproject();` 1회
--   (Wave A 스텁 때 쌓인 kind 17·18 원문을 이 매핑으로 푼다 · 멱등).
-- 되돌리기: 20261027200100 ① 스텁 본문(RETURN 만) 재적용 — launch_* 행은 남는다(필요하면 source='journal' 행 삭제 후 백필 재실행).
-- ============================================================

BEGIN;

-- 열 설명 갱신(형은 그대로) — 정식 노트로 뜻이 정해진 칸.
COMMENT ON COLUMN public.launch_heads.fire_at_us IS
  '첫 송신 시각 epoch µs — kind 18 message fire=(KST HHMMSS.uuuuuu) + trade_date(없으면 gw_time_ms × 1000) · 백필 null';
COMMENT ON COLUMN public.launch_heads.next_offset_us IS
  '다음 발사 첫 조각 rel 목표 µs — kind 18 cond_threshold(콜드3 시점 최신 발사 계획 첫 값 · 노트 261028 ⓔ) · 백필 null';
COMMENT ON COLUMN public.launch_heads.n_reject IS
  '재전송대상 거부 총 횟수(재전송분 포함 — Q16 = 101 · N = 515 · kind 18 n_retry_rejects) · 백필 = 조각 수';
COMMENT ON COLUMN public.launch_heads.correction_before_us IS 'Q16 학습 — gh-trade D-12 폐지(kind 18 에 칸 없음 · journal null)';
COMMENT ON COLUMN public.launch_heads.correction_after_us  IS 'Q16 학습 — gh-trade D-12 폐지(kind 18 에 칸 없음 · journal null)';

CREATE OR REPLACE FUNCTION public.launch_project_event(p_ev public.dma_strategy_events)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile text;
  v_market  text;
  v_base    time;
  v_msg     text := coalesce(p_ev.message, '');
  v_res     text;
  v_rc      text;
  v_lo      text;
  v_hi      text;
  v_fire    text;
  v_fire_us bigint;
BEGIN
  IF p_ev.kind NOT IN (17, 18) THEN
    RETURN;  -- 그 밖 kind 는 무시(apply 는 17·18 만 부른다 — 직접 호출 방어)
  END IF;

  -- 공통 축(노트 ⓑ 「공통」) — 정할 수 없으면 null → 헬퍼 「필수 키 누락」.
  v_profile := CASE p_ev.cond_metric WHEN 1 THEN 'Q16' WHEN 2 THEN 'A' WHEN 3 THEN 'N' END;
  v_market  := CASE p_ev.ev_kind WHEN 75 THEN 'K' WHEN 81 THEN 'Q' END;
  -- HHMMSSmmm 정수(09시대는 앞 0 이 빠진 8자리) → time. 0 = 없음. 범위 밖이면 make_time 이 RAISE(→ errors).
  v_base := CASE WHEN p_ev.expected_cum > 0 THEN
              make_time((p_ev.expected_cum / 10000000)::int,
                        ((p_ev.expected_cum / 100000) % 100)::int,
                        ((p_ev.expected_cum / 1000) % 100) + (p_ev.expected_cum % 1000) / 1000.0)
            END;

  IF p_ev.kind = 17 THEN
    v_res := (regexp_match(v_msg, '(?:^|\|)res=([^|]*)'))[1];
    v_rc  := nullif((regexp_match(v_msg, '(?:^|\|)rc=([^|]*)'))[1], '');

    PERFORM public.launch_upsert_piece(jsonb_build_object(
      'trade_date',    p_ev.trade_date,
      'gateway',       p_ev.gateway,
      'profile',       v_profile,
      'fire_exchange', nullif(p_ev.exchange, ''),
      'fire_base',     v_base,
      'market',        v_market,
      'wire',          p_ev.entry_round,
      'side',          CASE p_ev.order_condition WHEN 'B' THEN 'buy' WHEN 'S' THEN 'sell' END,
      'queued_id',     nullif((regexp_match(v_msg, '(?:^|\|)q=([^|]*)'))[1], ''),
      'piece_idx',     p_ev.ev_qty_before,
      'round',         p_ev.ev_price,
      'probe',         p_ev.has_remaining,
      'order_no',      nullif(p_ev.order_no, ''),
      'sent_rel_us',   p_ev.cond_threshold,
      'result',        CASE p_ev.queue_case
                         WHEN 1 THEN '접수'
                         WHEN 2 THEN CASE WHEN p_ev.result_code = 515 OR v_rc IN ('0515', 'E127') THEN '515' ELSE '101' END
                         WHEN 3 THEN '기타'
                         WHEN 4 THEN '무응답'
                         ELSE coalesce(nullif(v_res, ''), p_ev.queue_case::text)
                       END,
      'result_code',   coalesce(v_rc, nullif(p_ev.result_code, 0)::text),
      'accept_time',   nullif(p_ev.cond_actual, 0),
      'retry',         p_ev.ev_qty_after,
      'abandoned',     p_ev.cancel_reason <> 0,
      'isin',          nullif(p_ev.isin, ''),
      'price',         p_ev.price,
      'qty',           p_ev.qty,
      'filled_qty',    nullif(p_ev.ev_trade_qty, 0),
      'account',       nullif(p_ev.account_no, ''),
      'dma_user_id',   nullif(p_ev.dma_user_id, ''),
      'journal_epoch', p_ev.journal_epoch,
      'seq',           p_ev.seq,
      'gw_time_ms',    p_ev.gw_time_ms
    ), 'journal');

  ELSE  -- kind 18
    v_lo   := (regexp_match(v_msg, '(?:^|\|)lo=([^|]*)'))[1];
    v_hi   := (regexp_match(v_msg, '(?:^|\|)hi=([^|]*)'))[1];
    v_fire := (regexp_match(v_msg, '(?:^|\|)fire=([0-9]{6}\.[0-9]{6})(?:\||$)'))[1];
    v_fire_us := CASE
      WHEN v_fire IS NOT NULL AND substr(v_fire, 1, 2)::int < 24 AND substr(v_fire, 3, 2)::int < 60
           AND substr(v_fire, 5, 2)::int < 60 THEN
        (extract(epoch FROM ((p_ev.trade_date
                              + make_time(substr(v_fire, 1, 2)::int, substr(v_fire, 3, 2)::int,
                                          substr(v_fire, 5, 9)::numeric::double precision))
                             AT TIME ZONE 'Asia/Seoul')) * 1000000)::bigint
      ELSE p_ev.gw_time_ms * 1000
    END;

    PERFORM public.launch_upsert_head(jsonb_build_object(
      'trade_date',       p_ev.trade_date,
      'gateway',          p_ev.gateway,
      'profile',          v_profile,
      'fire_exchange',    nullif(p_ev.exchange, ''),
      'fire_base',        v_base,
      'market',           v_market,
      'offset_used_us',   p_ev.cond_actual,
      'fire_at_us',       v_fire_us,
      'n_pieces',         p_ev.ev_price,
      'n_accepted',       p_ev.ev_qty_before,
      'n_reject',         p_ev.ev_qty_after,
      'n_other',          p_ev.ev_trade_qty,
      'first_accept_idx', nullif(p_ev.limit_bid_qty, -1),
      'retries',          p_ev.bid1_price,
      'abandoned',        p_ev.bid1_qty,
      'gate_lo_us',       CASE WHEN p_ev.error_volume = 0 AND v_lo = '-' THEN NULL ELSE p_ev.error_volume END,
      'gate_hi_us',       CASE WHEN p_ev.remaining_volume = 0 AND v_hi = '-' THEN NULL ELSE p_ev.remaining_volume END,
      'nonmono',          p_ev.cancel_reason <> 0,
      'one_way_us',       nullif(p_ev.accept_latency_us, 0),
      'rtt_min_us',       nullif(p_ev.immediate_fill_qty, 0),
      'next_offset_us',   p_ev.cond_threshold,
      'journal_epoch',    p_ev.journal_epoch,
      'seq',              p_ev.seq,
      'gw_time_ms',       p_ev.gw_time_ms
    ), 'journal');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.launch_project_event(public.dma_strategy_events) IS
  'Phase 35 D-06 — kind 17·18 원문 1행 → launch_pieces/launch_heads 정식 칸 매핑(gh-trade 261028-launch-plan-contract ⓑ · 35-10). 그 밖 kind 무시. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.launch_project_event(public.dma_strategy_events) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
