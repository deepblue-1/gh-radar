-- ============================================================
-- quick-261109-tn6 — dma_accum_signals_for_user_json 재정의: 회색 「청산」 행을 gh-trade 서버 저널 시드와 같은 집합으로 복원한다
-- (인박스 docs/inbox/from-gh-trade/261109-accum-day-net.md · gh-trade Phase 48 하루 순매수 · 사이클 규칙).
--
-- 왜: KB120 이 2026-11-09 21:15 새 규칙으로 재기동해 21:16 기동 하루 판정 종료(queue_case 4 · cancel_reason 5) 행을 냈다.
--   옛 웹 목록 규칙은 회색 행을 사유 1 · 옛 사유 4 만 실어 사유 5 종목이 실시간 목록에서 사라졌고, 옛 RPC(20261104740000)는 복원 묶음
--   자르기 뒤 행에서 「최신 + 그날 최신 청산(4·1) 동반」 만 실어 그 사이클의 발표 행(재기동 앞)을 웹에 주지 못했다.
--
-- 정본: gh-trade server/src/market/publish/AccumSignal.cpp `AccumClosedTodayFromJournal` — 같은 날 재기동 때 kind 16 저널에서
--   89 「오늘 청산」 원소를 되살리는 함수(WinForms 회색 행 = 88 종료 프레임 + 89 오늘 청산 원소). 웹 webapp/src/lib/accum-list.ts
--   `listedAccumOf`(`closedTodayOf` · `isClosedTodayCandidate`)가 같은 걷기를 한다.
--   ★ 웹 accum-list listedAccumOf 와 같은 규칙 — 한쪽만 바꾸면 복원과 라이브가 갈린다.
--
-- 규칙(웹 걷기가 같은 결과를 내는 데 필요한 행만 싣는다):
--   - 후보(cand) = (gateway, isin) 별 그날 최신 행이 queue_case IN (4, 6) AND cancel_reason IN (1, 4, 5) 인 (gateway, isin, 사이클).
--   - ann = 후보 사이클(expected_cum)의 queue_case IN (1, 2, 3, 5) 행 중 마지막(ms DESC, seq DESC) — 「마지막 발표 행」.
--   - cls = 후보 사이클의 queue_case = 4 AND cancel_reason IN (1, 4, 5) 행 중 ann 뒤(ann 없으면 전부) 첫 행(ms ASC, seq ASC)
--     — 「그 뒤 첫 종료 행」 = 웹 closeRow · 「갱신」 시각.
--     ann 이 없으면 웹의 「발표됨」 은 사유 1 종료 행으로만 켜진다. 사유 4 · 5 종료는 사이클을 끝내므로(다음 등록은 새 사이클) 그 뒤 같은
--     사이클 사유 1 은 없다 — 그래서 첫 종료 행 하나로 웹 걷기와 같은 판정이 나온다(사유 1 이면 실리고, 4 · 5 이면 안 실림).
--   - 최종 원소 = ranked 행 중 (rn_latest = 1 AND (자르기 없음 OR 자르기 뒤 OR 회색 후보)) OR ann 행 OR cls 행. 행 단위 WHERE 라 한 행이
--     여러 조건에 걸려도 한 번만 실린다.
--   - 자르기(복원 묶음 · 20261018233000 ⑤)는 **활성 행에만** — 서버 시드에는 복원 묶음 개념이 없다(하루 저널 전체). 자르기는 2026-10-18
--     이월 파일 교체 뒤 종료 행 없이 사라진 활성 46종목 대책이었다. ann · cls 도 자르기 없이 고른다.
--   - 의도된 변경: 옛 「최신 청산(4·1) 동반 행」 규칙은 cls 로 대체된다 — 최신이 활성(재등장)인 isin 에는 이제 동반 행이 붙지 않는다
--     (웹 목록은 최신이 활성이면 동반 행을 쓰지 않는다).
--
-- 성능: ev 는 그대로 kind 16 부분 인덱스(idx_dma_strategy_events_accum_signal_day) 직접 읽기다. ann · cls 는 후보(그날 종료한 종목 —
--   수십 개)의 한 사이클 행만 더 고른다. row 6(하루 값 갱신)으로 행이 약 30% 늘어도 읽는 행 집합은 같은 그날 kind 16 이다.
-- 원소 모양 · 정렬 · 빈 날 '[]' 는 20261104740000 그대로.
-- 권한: PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT.
-- 되돌리기: 20261104740000 본문 재적용.
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
  ev AS (        -- 그날 kind 16 만(부분 인덱스) · 원소 모양 = dma_strategy_events_for_user 행 jsonb
    SELECT to_jsonb(e) - 'dma_user_id' - 'applied_at' || jsonb_build_object('stock_code', s.code) AS ev,
           e.gateway,
           e.journal_epoch,
           e.isin,
           e.gw_time_ms                 AS ms,
           e.seq,
           e.expected_cum               AS cyc,
           e.queue_case::int            AS queue_case,
           e.cancel_reason::int         AS cancel_reason
      FROM public.dma_strategy_events e
      JOIN vis ON vis.gateway = e.gateway
      LEFT JOIN public.stocks s ON s.isin = e.isin
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
  )
  -- 행마다 한 번만 평가하므로 최신 행이 곧 청산 행이어도 한 번만 실린다(UNION · 중복 제거 불필요).
  SELECT coalesce(jsonb_agg(r.ev ORDER BY r.gateway, r.isin, r.ms, r.seq), '[]'::jsonb)
    FROM ranked r
   WHERE (r.rn_latest = 1
          AND (r.cut_ms IS NULL OR r.ms >= r.cut_ms
               OR (r.queue_case IN (4, 6) AND r.cancel_reason IN (1, 4, 5))))
      OR EXISTS (SELECT 1 FROM ann a
                  WHERE a.gateway = r.gateway AND a.journal_epoch = r.journal_epoch AND a.seq = r.seq)
      OR EXISTS (SELECT 1 FROM cls l
                  WHERE l.gateway = r.gateway AND l.journal_epoch = r.journal_epoch AND l.seq = r.seq);
$$;

COMMENT ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) IS
  'kind 16 매집감지 읽기 — (gateway, isin) 별 최신 1행(활성은 복원 묶음 자르기 뒤만) + 회색 후보(최신 row 4/6 · 사유 1/4/5) 사이클의 마지막 발표 행 + 그 뒤 첫 종료 행 · gh-trade AccumClosedTodayFromJournal = 웹 listedAccumOf 동형(quick-261109-tn6) · 가시 게이트웨이만 · kind 16 부분 인덱스 직접 읽기. service_role 전용';

REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_accum_signals_for_user_json(uuid, date) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
