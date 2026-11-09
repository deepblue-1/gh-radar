-- ============================================================
-- fast — dma_accum_signals_for_user_json 속도 개선: 좁은 열로 고르고, 고른 행만 PK 로 되짚어 jsonb 를 만든다.
--
-- 왜: 작업대 「매집」 패널 복원(GET /api/accum-signals)이 느리다. 2026-11-09 19:50 KST server 로그에서 19~23초였고(옛 20261104740000),
--   20261109500000 적용 뒤 운영 DB 직접 호출(PostgREST rpc · KB120 하루 약 7만 행)도 약 7.2초였다.
--   원인: ev CTE 가 그날 kind 16 **모든 행**을 to_jsonb(e) + stocks 조인으로 넓은 jsonb 행으로 만든 뒤, 그 넓은 행을 들고
--   창 함수(row_number · max OVER) 정렬 · ann/cls DISTINCT ON 정렬 · EXISTS 를 돌았다. 정작 실리는 원소는 수백 행이다.
--
-- 고침(결과 불변 — 행 집합 · 원소 모양 · 정렬은 20261109500000 그대로):
--   ① ev = 좁은 열만(gateway · journal_epoch · seq · isin · ms · cyc · queue_case · cancel_reason). jsonb · stocks 조인 없음.
--   ② cut · ranked · cand · ann · cls · 최종 선택 조건은 20261109500000 과 글자 그대로 같다(선택 결과 = pick).
--   ③ pick 의 PK (gateway, journal_epoch, seq) 로 dma_strategy_events 를 되짚어, 고른 행만 to_jsonb(e) - 'dma_user_id' - 'applied_at'
--      || stock_code 를 만든다. 정렬은 같은 (gateway, isin, ms, seq).
--   ★ 규칙은 웹 accum-list listedAccumOf 와 같은 그대로 — 이 마이그레이션은 규칙을 바꾸지 않는다.
--
-- 권한: PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
-- 되돌리기: 20261109500000 본문 재적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dma_accum_signals_for_user_json(p_user_id uuid, p_trade_date date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH vis AS (  -- 시세 kind 가시성 — 그 게이트웨이에 가시 계좌(dma_strategy_events_for_user 와 같은 규칙)
    SELECT DISTINCT v.gateway FROM public.dma_visible_accounts(p_user_id) v
  ),
  ev AS (        -- 그날 kind 16 만(부분 인덱스) · 고르기에 필요한 좁은 열만(jsonb 는 pick 뒤에)
    SELECT e.gateway,
           e.journal_epoch,
           e.isin,
           e.gw_time_ms                 AS ms,
           e.seq,
           e.expected_cum               AS cyc,
           e.queue_case::int            AS queue_case,
           e.cancel_reason::int         AS cancel_reason
      FROM public.dma_strategy_events e
      JOIN vis ON vis.gateway = e.gateway
     WHERE e.kind = 16
       AND e.trade_date = p_trade_date
  ),
  -- 게이트웨이별 가장 최근 복원 묶음(queue_case 3 · 마지막 복원 행 기준 2분 창)의 시작 시각(20261018233000 ⑤).
  cut AS (
    SELECT r.gateway, min(r.ms) AS cut_ms
      FROM (
        SELECT e.gateway, e.ms, max(e.ms) OVER (PARTITION BY e.gateway) AS last_ms
          FROM ev e
         WHERE e.queue_case = 3
      ) r
     WHERE r.ms >= r.last_ms - 120000
     GROUP BY r.gateway
  ),
  -- 하루 전체(자르기 안 함) · (gateway, isin) 별 최신 순번.
  ranked AS (
    SELECT e.*,
           c.cut_ms,
           row_number() OVER (PARTITION BY e.gateway, e.isin ORDER BY e.ms DESC, e.seq DESC) AS rn_latest
      FROM ev e
      LEFT JOIN cut c ON c.gateway = e.gateway
  ),
  -- 회색 후보 — 최신 행이 종료(4) · 하루 값 갱신(6)이고 사유 1 청산 · 4 즉시 종료 · 5 하루 판정 종료(웹 isClosedTodayCandidate).
  cand AS (
    SELECT r.gateway, r.isin, r.cyc
      FROM ranked r
     WHERE r.rn_latest = 1
       AND r.queue_case IN (4, 6) AND r.cancel_reason IN (1, 4, 5)
  ),
  -- 후보 사이클의 마지막 발표 행(row 1 · 2 · 3 · 5).
  ann AS (
    SELECT DISTINCT ON (r.gateway, r.isin)
           r.gateway, r.isin, r.journal_epoch, r.seq, r.ms
      FROM ranked r
      JOIN cand c ON c.gateway = r.gateway AND c.isin = r.isin AND c.cyc = r.cyc
     WHERE r.queue_case IN (1, 2, 3, 5)
     ORDER BY r.gateway, r.isin, r.ms DESC, r.seq DESC
  ),
  -- 후보 사이클의 마지막 발표 뒤(없으면 처음부터) 첫 종료 행(row 4 · 사유 1/4/5) = 웹 closeRow.
  cls AS (
    SELECT DISTINCT ON (r.gateway, r.isin)
           r.gateway, r.journal_epoch, r.seq
      FROM ranked r
      JOIN cand c ON c.gateway = r.gateway AND c.isin = r.isin AND c.cyc = r.cyc
      LEFT JOIN ann a ON a.gateway = r.gateway AND a.isin = r.isin
     WHERE r.queue_case = 4 AND r.cancel_reason IN (1, 4, 5)
       AND (a.seq IS NULL OR (r.ms, r.seq) > (a.ms, a.seq))
     ORDER BY r.gateway, r.isin, r.ms ASC, r.seq ASC
  ),
  -- 실을 행(20261109500000 최종 WHERE 그대로) — PK 와 정렬 키만.
  pick AS (
    SELECT r.gateway, r.journal_epoch, r.seq, r.isin, r.ms
      FROM ranked r
     WHERE (r.rn_latest = 1
            AND (r.cut_ms IS NULL OR r.ms >= r.cut_ms
                 OR (r.queue_case IN (4, 6) AND r.cancel_reason IN (1, 4, 5))))
        OR EXISTS (SELECT 1 FROM ann a
                    WHERE a.gateway = r.gateway AND a.journal_epoch = r.journal_epoch AND a.seq = r.seq)
        OR EXISTS (SELECT 1 FROM cls l
                    WHERE l.gateway = r.gateway AND l.journal_epoch = r.journal_epoch AND l.seq = r.seq)
  )
  -- 고른 행만 PK 로 되짚어 원소를 만든다 · 원소 모양 = dma_strategy_events_for_user 행 jsonb(20261104740000 그대로).
  SELECT coalesce(jsonb_agg(
           to_jsonb(e) - 'dma_user_id' - 'applied_at' || jsonb_build_object('stock_code', s.code)
           ORDER BY p.gateway, p.isin, p.ms, p.seq), '[]'::jsonb)
    FROM pick p
    JOIN public.dma_strategy_events e
      ON e.gateway = p.gateway AND e.journal_epoch = p.journal_epoch AND e.seq = p.seq
    LEFT JOIN public.stocks s ON s.isin = e.isin;
$$;

COMMENT ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) IS
  'kind 16 매집감지 읽기 — (gateway, isin) 별 최신 1행(활성은 복원 묶음 자르기 뒤만) + 회색 후보(최신 row 4/6 · 사유 1/4/5) 사이클의 마지막 발표 행 + 그 뒤 첫 종료 행 · gh-trade AccumClosedTodayFromJournal = 웹 listedAccumOf 동형(quick-261109-tn6) · 좁은 열로 고른 뒤 PK 로 되짚어 jsonb(fast 261109) · 가시 게이트웨이만 · kind 16 부분 인덱스 직접 읽기. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
