-- ============================================================
-- Phase 41 코드 리뷰 IN-33(2026-11-15) — 네이버 「제목에 종목명」 낱말 규칙이 남의 기사를 끌어오는 빈틈 셋.
--
--   ① 우선주 걷기(`[0-9]?우[a-c]?$`)의 최소 길이가 2라 「LG우」 · 「SK우」 · 「CJ우」 · 「GS우」 의 본주 낱말이 lg · sk · cj · gs 가
--      되어 그룹 계열사 기사 전부가 그 우선주 줄로 남았다 → 본주 낱말은 3자 이상만(stock_title_needles).
--   ② 띄어 쓴 이름의 첫 낱말(3자 이상)이 다른 상장사 이름이면(「NHN KCP」 → nhn = NHN) 남의 기사가 남았다
--      → stock_feed_by_codes 가 그 첫 낱말을 다른 종목 이름(공백 · 끝 마침표 제거 · 소문자)과 같을 때 뺀다.
--        stock_title_needles 는 이름만 보는 IMMUTABLE 함수로 둔다(종목 표를 읽지 않는다).
--   ③ 제목 공백 제거가 ASCII 공백만 지워 탭 · NBSP · 전각 공백이 든 제목은 「가람 전자」 꼴 매칭이 실패했다
--      → `regexp_replace(lower(title), '[[:space:]\u00a0\u3000]', '', 'g')`.
--
-- 저장은 그대로라(응답 시점 규칙) 소급 UPDATE 는 없다. stock_feed_by_codes 의 그 밖(서명 6인자 · 등록 · 한투 쪽 · 공시 보장 ·
-- 반환 모양 · 권한 · SECURITY INVOKER · search_path)은 20261115100000 과 같다(CREATE OR REPLACE — 배포 순서 의존 없음).
--
-- 알려진 한계(그대로): 기사에서 약칭으로만 불리는 종목(「에스엠」 → 「SM엔터」)은 기사가 빠진다(별칭 표 stock_title_aliases 로 메운다) ·
--   흔한 낱말인 종목명(「영광」 → 「영광군」)은 남의 기사가 남는다 · 이름 끝이 「우」 인 보통주(4자 이상)는 「우」 를 걷은 낱말도 쓴다 ·
--   「SK우」 처럼 본주 낱말이 빠진 2자 그룹 우선주는 제목에 「SK우」 가 있는 기사만 남는다.
-- 되돌리기: 20261112320000 의 stock_title_needles · 20261115100000 의 stock_feed_by_codes 정의를 다시 적용.
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
        -- 우선주 본주 이름은 3자 이상만(IN-33 — 「LG우」 → lg 는 그룹 계열사 기사 전부를 끌어온다)
        (regexp_replace(b.full_name, '[0-9]?우[a-c]?$', ''), 3),
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
  'Phase 41 — 종목명 → 뉴스 제목에서 찾을 낱말 배열(소문자 · 공백 제거 · 우선주는 본주 이름(3자 이상) · 띄어 쓴 이름은 첫 낱말(3자 이상 · 다른 종목 이름과 같으면 stock_feed_by_codes 가 뺀다)). stock_feed_by_codes 의 네이버 조건이 쓴다';

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
      -- 띄어 쓴 이름의 첫 낱말이 다른 종목 이름과 같으면 넣지 않는다(IN-33 — 「NHN KCP」 → nhn 은 NHN 기사를 끌어온다).
      SELECT ARRAY(
               SELECT x.needle
                 FROM unnest(public.stock_title_needles(st.name)) AS x(needle)
                WHERE NOT (
                  position(' ' IN btrim(st.name)) > 0
                  AND x.needle = lower(split_part(btrim(st.name), ' ', 1))
                  AND EXISTS (
                    SELECT 1 FROM public.stocks o
                     WHERE o.code <> st.code
                       AND rtrim(lower(replace(btrim(o.name), ' ', '')), '.') = x.needle
                  )
                )
             )
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
                  -- 공백 제거는 ASCII 공백만이 아니라 탭 · NBSP(U+00A0) · 전각 공백(U+3000)까지(IN-33 — 「가람\u00a0전자」)
                  WHERE strpos(regexp_replace(lower(na.title), '[[:space:]\u00a0\u3000]', '', 'g'), x.needle) > 0
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
  'Phase 41 종목 묶음 조회(D-04 · D-05 · D-06) — 입력 순서 · 모든 코드 · 출처별(kis · naver) 최신 p_per_source 건 원 행 · 숨김 연결 제외 · 네이버는 제목에 종목명 · 별칭 있는 기사만(stock_title_needles · stock_title_aliases · 다른 종목 이름과 같은 첫 낱말 제외 · 제목 공백은 탭 · NBSP · 전각 포함 제거) · p_register 면 등록(60초 1회) · p_min_disclosures 면 기간 안 최신 공시를 그만큼 따로 보장(kis 가 p_per_source 를 넘을 수 있다) · 등록은 코드 순으로 잠근다 · service_role 전용';

COMMIT;
