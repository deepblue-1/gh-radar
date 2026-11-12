-- ============================================================
-- Phase 41 UAT(2026-11-12 · 사용자 결정) — 네이버 뉴스는 제목에 종목명이 있는 기사만 보여 준다.
--
-- 네이버 뉴스(news_articles)는 종목명으로 검색한 결과라 본문 어딘가에 종목명이 한 번만 나와도 그 종목 뉴스로 들어온다.
-- 운영 표본(급등 29종목 · 시황 기사 제외 뒤)에서 네이버 줄 570개 중 422개(74%)가 제목에 그 종목 이름이 없었다 —
-- 「11월 11일 주식시장 주요공시」 · 「동원파츠 회전율 165.98%…」 · 다른 종목 특징주 같은 모음 · 남의 기사다.
-- 한투 뉴스는 그대로다(D-11 — 한투가 붙인 종목 그대로 표시 · 테마 · 업종 기사는 그쪽으로 보인다).
--
-- 무엇을 바꾸나
--   ① public.stock_title_needles(name) — 종목명 → 제목에서 찾을 낱말 배열(소문자 · 공백 제거)
--        · 종목명 전체(끝 마침표 제거)                       「JYP Ent.」 → jypent
--        · 우선주면 본주 이름(끝의 「우」 · 「2우B」 걷기)      「계양전기우」 → 계양전기
--        · 띄어 쓴 이름이면 첫 낱말(3자 이상)                 「JYP Ent.」 → jyp  (기사 표기 「JYP엔터」)
--   ② public.stock_feed_by_codes — 네이버 쪽 조회에 「제목(소문자 · 공백 제거)에 낱말 중 하나가 있다」 조건을
--        상한(p_per_source) 적용 전에 건다. 그 밖(한투 쪽 · 등록 · 반환 모양 · 권한)은 20261112100000 과 글자까지 같다.
--
-- 알려진 한계: 기사에서 약칭으로만 불리는 종목(「에스엠」 → 기사 「SM엔터」)은 기사가 빠진다 · 흔한 낱말인 종목명
--   (「영광」 → 「영광군」)은 남의 기사가 남는다. 저장은 그대로라 규칙을 바꾸면 바로 소급된다.
-- 되돌리기: 20261112100000 의 stock_feed_by_codes 정의를 다시 적용 · DROP FUNCTION public.stock_title_needles(text).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.stock_title_needles(p_name text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT rtrim(lower(replace(btrim(coalesce(p_name, '')), ' ', '')), '.') AS full_name,
           lower(split_part(btrim(coalesce(p_name, '')), ' ', 1))            AS first_word,
           position(' ' IN btrim(coalesce(p_name, ''))) > 0                  AS spaced
  )
  SELECT coalesce(array_agg(DISTINCT v.needle), ARRAY[]::text[])
    FROM base b
    CROSS JOIN LATERAL (
      VALUES
        (b.full_name, 1),
        (regexp_replace(b.full_name, '[0-9]?우[a-c]?$', ''), 2),
        (CASE WHEN b.spaced THEN b.first_word END, 3)
    ) AS v(needle, min_len)
   WHERE v.needle IS NOT NULL
     AND char_length(v.needle) >= v.min_len
     AND b.full_name <> ''
$$;

REVOKE ALL ON FUNCTION public.stock_title_needles(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_title_needles(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_title_needles(text) TO service_role;

COMMENT ON FUNCTION public.stock_title_needles(text) IS
  'Phase 41 — 종목명 → 뉴스 제목에서 찾을 낱말 배열(소문자 · 공백 제거 · 우선주는 본주 이름 · 띄어 쓴 이름은 첫 낱말). stock_feed_by_codes 의 네이버 조건이 쓴다';

CREATE OR REPLACE FUNCTION public.stock_feed_by_codes(
  p_codes      text[],
  p_since      timestamptz,
  p_per_source integer,
  p_register   boolean,
  p_before     timestamptz DEFAULT NULL
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

  IF coalesce(p_register, false) THEN
    INSERT INTO public.kis_news_targets AS t (stock_code, last_requested_at)
    SELECT DISTINCT c, now()
      FROM unnest(coalesce(p_codes, ARRAY[]::text[])) AS c
     WHERE c IS NOT NULL AND c <> ''
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
      SELECT public.stock_title_needles(st.name) AS needles
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
          SELECT s.srno, s.written_at
            FROM public.kis_news_stocks s
           WHERE s.stock_code = c.code
             AND s.hidden_reason IS NULL
             AND s.written_at >= p_since
             AND (p_before IS NULL OR s.written_at < p_before)
           ORDER BY s.written_at DESC, s.srno DESC
           LIMIT p_per_source
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

REVOKE ALL ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz) TO service_role;

COMMENT ON FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz) IS
  'Phase 41 종목 묶음 조회(D-04 · D-05 · D-06) — 입력 순서 · 모든 코드 · 출처별(kis · naver) 최신 p_per_source 건 원 행 · 숨김 연결 제외 · 네이버는 제목에 종목명 있는 기사만(stock_title_needles) · p_register 면 등록(60초 1회) · service_role 전용';

COMMIT;
