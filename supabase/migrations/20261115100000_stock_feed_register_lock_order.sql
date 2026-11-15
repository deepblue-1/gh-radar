-- ============================================================
-- Phase 41 코드 리뷰 WR-32(2026-11-15) — 묶음 조회 등록 upsert 의 잠금 순서 고정.
--
-- stock_feed_by_codes 의 등록(p_register)은 `INSERT ... SELECT DISTINCT ... ON CONFLICT DO UPDATE ... WHERE <60초>` 다.
-- ON CONFLICT DO UPDATE 는 WHERE 가 거짓이어도 충돌한 행을 잠그는데(PostgreSQL 문서), 잠그는 순서가 DISTINCT 출력 순서
-- (HashAggregate 버킷 순서)라 정해져 있지 않았다. gh-trade 클라 여러 대 · 웹 작업대가 겹치는 돌파 종목 묶음을 5 ~ 10초마다
-- 서로 다른 조합으로 부르므로 두 트랜잭션이 A → B · B → A 로 잠그면 교착(40P01)으로 한쪽 요청이 500 이 된다.
--   → 등록할 코드를 `ORDER BY` 로 정렬해 잠금 순서를 코드 순으로 고정한다.
--
-- 서명(6인자) · 반환 모양 · 권한 · SECURITY INVOKER · search_path 는 20261113300000 과 같다(CREATE OR REPLACE —
-- server · home-sync 와 배포 순서 의존 없음). 바뀐 곳은 등록 INSERT 한 문장뿐이다.
-- 되돌리기: 20261113300000 의 stock_feed_by_codes 정의를 다시 적용.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.stock_feed_by_codes(
  p_codes      text[],
  p_since      timestamptz,
  p_per_source integer,
  p_register   boolean,
  p_before     timestamptz DEFAULT NULL,
  p_min_disclosures integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF p_per_source IS NULL OR p_per_source < 1 THEN
    RAISE EXCEPTION 'stock_feed_by_codes: p_per_source 는 1 이상이어야 한다 (받은 값 %)', p_per_source;
  END IF;
  IF p_min_disclosures IS NOT NULL AND (p_min_disclosures < 0 OR p_min_disclosures > 10) THEN
    RAISE EXCEPTION 'stock_feed_by_codes: p_min_disclosures 는 0 ~ 10 이어야 한다 (받은 값 %)', p_min_disclosures;
  END IF;

  IF coalesce(p_register, false) THEN
    -- 잠금 순서 고정(WR-32) — ON CONFLICT DO UPDATE 는 WHERE 가 거짓이어도 충돌 행을 잠근다. 순서가 입력 · 해시 순서면
    -- 겹치는 묶음을 동시에 등록하는 두 요청이 A → B · B → A 로 잠가 교착(40P01 → 500)할 수 있다. 코드 순으로 잠근다.
    INSERT INTO public.kis_news_targets AS t (stock_code, last_requested_at)
    SELECT d.c, now()
      FROM (SELECT DISTINCT c
              FROM unnest(coalesce(p_codes, ARRAY[]::text[])) AS c
             WHERE c IS NOT NULL AND c <> '') d
     ORDER BY d.c
    ON CONFLICT (stock_code) DO UPDATE
      SET last_requested_at = now()
      WHERE t.last_requested_at IS NULL OR t.last_requested_at < now() - interval '60 seconds';
  END IF;

  SELECT jsonb_build_object(
           'feed_at', (SELECT s.feed_at FROM public.kis_news_state s WHERE s.id = 1),
           'stocks', coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'code', c.code,
                 'collected_at', tg.last_collected_at,
                 'kis', coalesce(k.items, '[]'::jsonb),
                 'naver', coalesce(nv.items, '[]'::jsonb)
               ) ORDER BY c.ord
             ),
             '[]'::jsonb
           )
         )
    INTO v_out
    FROM unnest(coalesce(p_codes, ARRAY[]::text[])) WITH ORDINALITY AS c(code, ord)
    LEFT JOIN public.kis_news_targets tg ON tg.stock_code = c.code
    LEFT JOIN LATERAL (
      SELECT public.stock_title_needles(st.name)
             || coalesce((SELECT array_agg(DISTINCT lower(replace(btrim(a.alias), ' ', '')))
                            FROM public.stock_title_aliases a
                           WHERE a.stock_code = c.code), ARRAY[]::text[]) AS needles
        FROM public.stocks st
       WHERE st.code = c.code
    ) nm ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'srno', n.srno,
                 'kind', n.kind,
                 'source', n.source,
                 'title', n.title,
                 'title_key', n.title_key,
                 'written_at', n.written_at,
                 'received_at', n.received_at,
                 'codes', (
                   SELECT coalesce(jsonb_agg(x.stock_code ORDER BY x.stock_code), '[]'::jsonb)
                     FROM public.kis_news_stocks x
                    WHERE x.srno = n.srno AND x.hidden_reason IS NULL
                 )
               ) ORDER BY ks.written_at DESC, ks.srno DESC
             ) AS items
        FROM (
          (SELECT s.srno, s.written_at
             FROM public.kis_news_stocks s
            WHERE s.stock_code = c.code
              AND s.hidden_reason IS NULL
              AND s.written_at >= p_since
              AND (p_before IS NULL OR s.written_at < p_before)
            ORDER BY s.written_at DESC, s.srno DESC
            LIMIT p_per_source)
          UNION
          -- 기간 안 최신 공시 p_min_disclosures 건은 뉴스에 밀려도 따로 싣는다(위 최신 N건과 겹치면 UNION 이 한 번만 남긴다).
          (SELECT s.srno, s.written_at
             FROM public.kis_news_stocks s
             JOIN public.kis_news dn ON dn.srno = s.srno AND dn.kind = 'disclosure'
            WHERE coalesce(p_min_disclosures, 0) > 0
              AND s.stock_code = c.code
              AND s.hidden_reason IS NULL
              AND s.written_at >= p_since
              AND (p_before IS NULL OR s.written_at < p_before)
            ORDER BY s.written_at DESC, s.srno DESC
            LIMIT greatest(coalesce(p_min_disclosures, 0), 0))
        ) ks
        JOIN public.kis_news n ON n.srno = ks.srno
    ) k ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', a.id,
                 'title', a.title,
                 'description', a.description,
                 'source', a.source,
                 'url', a.url,
                 'published_at', a.published_at,
                 'created_at', a.created_at
               ) ORDER BY a.published_at DESC, a.id
             ) AS items
        FROM (
          SELECT na.id, na.title, na.description, na.source, na.url, na.published_at, na.created_at
            FROM public.news_articles na
           WHERE na.stock_code = c.code
             AND na.published_at >= p_since
             AND (p_before IS NULL OR na.published_at < p_before)
             -- 제목에 종목명이 있는 기사만(상한 적용 「전」에 거른다 — 종목명 없는 기사가 자리를 먹지 않게).
             AND (
               nm.needles IS NULL
               OR cardinality(nm.needles) = 0
               OR EXISTS (
                 SELECT 1 FROM unnest(nm.needles) AS x(needle)
                  WHERE strpos(replace(lower(na.title), ' ', ''), x.needle) > 0
               )
             )
           ORDER BY na.published_at DESC, na.id
           LIMIT p_per_source
        ) a
    ) nv ON true;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz, integer) IS
  'Phase 41 종목 묶음 조회(D-04 · D-05 · D-06) — 입력 순서 · 모든 코드 · 출처별(kis · naver) 최신 p_per_source 건 원 행 · 숨김 연결 제외 · 네이버는 제목에 종목명 · 별칭 있는 기사만(stock_title_needles · stock_title_aliases) · p_register 면 등록(60초 1회) · p_min_disclosures 면 기간 안 최신 공시를 그만큼 따로 보장(kis 가 p_per_source 를 넘을 수 있다) · 등록은 코드 순으로 잠근다 · service_role 전용';

COMMIT;
