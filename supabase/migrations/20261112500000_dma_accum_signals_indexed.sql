-- ============================================================
-- fast — dma_accum_signals_for_user_json 을 인덱스로 종목마다 집어 읽게 바꾼다(그날 행 전체를 읽고 정렬하지 않는다).
--
-- 왜: 작업대 「매집」 패널 복원(GET /api/accum-signals)이 저녁에 1.4 ~ 3초(최악 4초)다(2026-11-10 ~ 11-12 server 로그 · 실제 조회 56건).
--   20261109520000 은 그날 kind 16 행을 **전부** 읽어(서버당 약 7만 · 하루 약 20만) (gateway, isin) 로 정렬한 뒤 최신 행을 골랐다.
--   운영 DB 직접 호출이 보는 서버 1대 0.85초 · 2대 1.45초 · 3대 2.05초 — 하루 행 수 × 보는 서버 수에 비례해 느려진다.
--   읽기(0.1 ~ 0.3초) · 전송(0.1초)이 아니라 정렬 · 창 함수 계산 시간이다. 실리는 원소는 서버당 수백 행뿐이다.
--
-- 고침(결과 불변 — 행 집합 · 원소 모양 · 정렬은 20261109520000 그대로):
--   ① 부분 인덱스 2개
--      idx_dma_strategy_events_accum_isin_latest (trade_date, gateway, isin, gw_time_ms DESC, seq DESC) WHERE kind = 16
--        — 종목 건너뛰기 · 종목별 최신 행 · 발표 행 · 종료 행을 이 인덱스 순서로 집는다.
--      idx_dma_strategy_events_accum_restore (trade_date, gateway, gw_time_ms) WHERE kind = 16 AND queue_case = 3
--        — 서버별 마지막 복원 묶음의 시작 시각(cut). 하루 서버당 수백 행이라 아주 작다.
--   ② 본문
--      isins = 서버별 그날 종목 목록. 재귀로 「다음 종목」 한 건씩 건너뛴다(종목당 인덱스 1회 · 행 수와 무관).
--      lat   = 종목별 최신 1행(LIMIT 1) = 옛 rn_latest = 1.
--      ann   = 회색 후보 사이클의 마지막 발표 행. 최신 행에서 거꾸로 걸어 첫 row 1 · 2 · 3 · 5 에서 멈춘다(지나치는 것은 종료 뒤 row 4 · 6 뿐).
--      cls   = 발표 행 뒤(없으면 처음부터) 첫 종료 행. 발표 시각을 인덱스 하한으로 써서 바로 다음 몇 행만 본다.
--      pick  = lat(활성은 복원 묶음 자르기 뒤만 · 회색 후보는 늘) ∪ ann ∪ cls — 옛 최종 WHERE 와 같은 집합.
--      끝에서 pick 의 PK 로 되짚어 원소를 만든다(20261109520000 그대로). LATERAL + OFFSET 0 = 늘 PK 인덱스 조회
--      (행 수 추정이 틀려도 큰 테이블 전체 읽기로 바뀌지 않는다).
--   ★ 규칙은 웹 accum-list listedAccumOf 와 같은 그대로 — 이 마이그레이션은 규칙을 바꾸지 않는다.
--
-- 실측(로컬 일회용 DB · 운영 닮은꼴 합성 255만 행 · 그날 kind 16 21만 행): 3서버 780ms → 112ms · 1서버 330ms → 37ms · 결과 jsonb 동일.
--
-- 잠금: CREATE INDEX 는 CONCURRENTLY 가 아니다 — `supabase db push` 가 파일을 한 묶음(암묵 트랜잭션)으로 보내 CONCURRENTLY 를 못 쓴다.
--   만드는 동안 이 테이블 **쓰기**가 기다린다(읽기는 계속). 그래서 **20:00 이후(장 마감 · relay 기록 없음)에만 적용**한다.
--   lock_timeout 5초 — 다른 잠금에 막히면 줄 서지 않고 실패한다(아무것도 안 바뀜 · 다시 적용하면 된다).
--   인덱스와 함수 교체가 한 트랜잭션이라, 새 본문이 인덱스 없이 도는 순간은 없다.
--
-- 권한: PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
-- 되돌리기: 20261109520000 본문 재적용 + DROP INDEX 2개.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10min';

CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_accum_isin_latest
  ON public.dma_strategy_events (trade_date, gateway, isin, gw_time_ms DESC, seq DESC)
  WHERE kind = 16;

CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_accum_restore
  ON public.dma_strategy_events (trade_date, gateway, gw_time_ms)
  WHERE kind = 16 AND queue_case = 3;

CREATE OR REPLACE FUNCTION public.dma_accum_signals_for_user_json(p_user_id uuid, p_trade_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE vis AS (  -- 시세 kind 가시성 — 그 게이트웨이에 가시 계좌(dma_strategy_events_for_user 와 같은 규칙)
    SELECT DISTINCT v.gateway FROM public.dma_visible_accounts(p_user_id) v
  ),
  -- 서버별 그날 kind 16 종목 목록 — 인덱스에서 「다음 종목」 한 건씩 건너뛴다.
  isins AS (
    SELECT v.gateway, f.isin
      FROM vis v
     CROSS JOIN LATERAL (
            SELECT e.isin
              FROM public.dma_strategy_events e
             WHERE e.kind = 16 AND e.trade_date = p_trade_date AND e.gateway = v.gateway
             ORDER BY e.isin
             LIMIT 1) f
    UNION ALL
    SELECT i.gateway, n.isin
      FROM isins i
     CROSS JOIN LATERAL (
            SELECT e.isin
              FROM public.dma_strategy_events e
             WHERE e.kind = 16 AND e.trade_date = p_trade_date AND e.gateway = i.gateway
               AND e.isin > i.isin
             ORDER BY e.isin
             LIMIT 1) n
  ),
  -- 게이트웨이별 가장 최근 복원 묶음(queue_case 3 · 마지막 복원 행 기준 2분 창)의 시작 시각(20261018233000 ⑤).
  cut AS (
    SELECT v.gateway, m.cut_ms
      FROM vis v
     CROSS JOIN LATERAL (
            SELECT e.gw_time_ms AS last_ms
              FROM public.dma_strategy_events e
             WHERE e.kind = 16 AND e.queue_case = 3
               AND e.trade_date = p_trade_date AND e.gateway = v.gateway
             ORDER BY e.gw_time_ms DESC
             LIMIT 1) l
     CROSS JOIN LATERAL (
            SELECT min(e.gw_time_ms) AS cut_ms
              FROM public.dma_strategy_events e
             WHERE e.kind = 16 AND e.queue_case = 3
               AND e.trade_date = p_trade_date AND e.gateway = v.gateway
               AND e.gw_time_ms >= l.last_ms - 120000) m
  ),
  -- (gateway, isin) 별 최신 1행 — 고르기에 필요한 좁은 열만(jsonb 는 pick 뒤에).
  lat AS (
    SELECT l.*, c.cut_ms
      FROM isins i
     CROSS JOIN LATERAL (
            SELECT e.gateway, e.journal_epoch, e.isin, e.gw_time_ms AS ms, e.seq,
                   e.expected_cum AS cyc, e.queue_case::int AS queue_case, e.cancel_reason::int AS cancel_reason
              FROM public.dma_strategy_events e
             WHERE e.kind = 16 AND e.trade_date = p_trade_date AND e.gateway = i.gateway AND e.isin = i.isin
             ORDER BY e.gw_time_ms DESC, e.seq DESC
             LIMIT 1) l
      LEFT JOIN cut c ON c.gateway = l.gateway
  ),
  -- 회색 후보 — 최신 행이 종료(4) · 하루 값 갱신(6)이고 사유 1 청산 · 4 즉시 종료 · 5 하루 판정 종료(웹 isClosedTodayCandidate).
  cand AS (
    SELECT l.gateway, l.isin, l.cyc
      FROM lat l
     WHERE l.queue_case IN (4, 6) AND l.cancel_reason IN (1, 4, 5)
  ),
  -- 후보 사이클의 마지막 발표 행(row 1 · 2 · 3 · 5) — 없으면 그 후보는 null 행으로 남는다(cls 가 「처음부터」 로 본다).
  ann AS (
    SELECT c.gateway, c.isin, c.cyc, a.journal_epoch, a.seq, a.ms
      FROM cand c
      LEFT JOIN LATERAL (
            SELECT e.journal_epoch, e.seq, e.gw_time_ms AS ms
              FROM public.dma_strategy_events e
             WHERE e.kind = 16 AND e.trade_date = p_trade_date AND e.gateway = c.gateway AND e.isin = c.isin
               AND e.queue_case IN (1, 2, 3, 5) AND e.expected_cum = c.cyc
             ORDER BY e.gw_time_ms DESC, e.seq DESC
             LIMIT 1) a ON true
  ),
  -- 후보 사이클의 마지막 발표 뒤(없으면 처음부터) 첫 종료 행(row 4 · 사유 1/4/5) = 웹 closeRow.
  -- gw_time_ms >= 발표 시각 은 인덱스 하한(같은 뜻의 좁히기) · 정확한 순서 비교는 그 아래 줄이 한다.
  cls AS (
    SELECT a.gateway, a.isin, l.journal_epoch, l.seq, l.ms
      FROM ann a
     CROSS JOIN LATERAL (
            SELECT e.journal_epoch, e.seq, e.gw_time_ms AS ms
              FROM public.dma_strategy_events e
             WHERE e.kind = 16 AND e.trade_date = p_trade_date AND e.gateway = a.gateway AND e.isin = a.isin
               AND e.queue_case = 4 AND e.cancel_reason IN (1, 4, 5) AND e.expected_cum = a.cyc
               AND e.gw_time_ms >= coalesce(a.ms, 0)
               AND (a.seq IS NULL OR (e.gw_time_ms, e.seq) > (a.ms, a.seq))
             ORDER BY e.gw_time_ms ASC, e.seq ASC
             LIMIT 1) l
  ),
  -- 실을 행(20261109520000 최종 WHERE 와 같은 집합) — PK 와 정렬 키만.
  pick AS (
    SELECT l.gateway, l.journal_epoch, l.seq, l.isin, l.ms
      FROM lat l
     WHERE l.cut_ms IS NULL OR l.ms >= l.cut_ms
        OR (l.queue_case IN (4, 6) AND l.cancel_reason IN (1, 4, 5))
    UNION
    SELECT a.gateway, a.journal_epoch, a.seq, a.isin, a.ms FROM ann a WHERE a.seq IS NOT NULL
    UNION
    SELECT l.gateway, l.journal_epoch, l.seq, l.isin, l.ms FROM cls l
  )
  -- 고른 행만 PK 로 되짚어 원소를 만든다 · 원소 모양 = dma_strategy_events_for_user 행 jsonb(20261104740000 그대로).
  SELECT coalesce(jsonb_agg(
           to_jsonb(e) - 'dma_user_id' - 'applied_at' || jsonb_build_object('stock_code', s.code)
           ORDER BY p.gateway, p.isin, p.ms, p.seq), '[]'::jsonb)
    FROM pick p
   CROSS JOIN LATERAL (
          SELECT e0.*
            FROM public.dma_strategy_events e0
           WHERE e0.gateway = p.gateway AND e0.journal_epoch = p.journal_epoch AND e0.seq = p.seq
          OFFSET 0) e
    LEFT JOIN public.stocks s ON s.isin = e.isin;
$$;

COMMENT ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) IS
  'kind 16 매집감지 읽기 — (gateway, isin) 별 최신 1행(활성은 복원 묶음 자르기 뒤만) + 회색 후보(최신 row 4/6 · 사유 1/4/5) 사이클의 마지막 발표 행 + 그 뒤 첫 종료 행 · gh-trade AccumClosedTodayFromJournal = 웹 listedAccumOf 동형(quick-261109-tn6) · 종목 건너뛰기 + 종목별 인덱스 조회(idx_dma_strategy_events_accum_isin_latest · _accum_restore · fast 261112) · 가시 게이트웨이만. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
