-- ============================================================
-- Phase 41 UAT(2026-11-12) — 네이버 뉴스 종목명 조건에 「별칭」 더하기.
--
-- 20261112320000 이 네이버 뉴스를 「제목에 종목명이 있는 기사만」 으로 거른 뒤, 기사에서 다른 이름으로만 불리는
-- 종목의 자기 기사가 빠졌다(에스엠 → 「SM엔터」 · NAVER → 「네이버」 · 신한지주 → 「신한금융」 등).
--   ① public.stock_title_aliases(stock_code, alias) — 종목별 별칭 표. 비교는 소문자 · 공백 제거로 한다.
--      처음 넣는 값은 2026-11-05 ~ 11-12 운영 네이버 뉴스에서 「종목명은 없고 별칭이 있는 제목」 을 세어
--      실제로 그 종목 기사인 것만 골랐다. 다른 상장사와 겹치는 짧은 이름은 넣지 않았다
--      (「SM」 → SM그룹 · 「아시아나」 → 아시아나IDT · 「한전」 → 한전KPS · 「CU」 · 「삼바」).
--   ② stock_feed_by_codes — 찾을 낱말 = stock_title_needles(종목명) + 이 표의 별칭. 나머지는 20261112320000 그대로.
-- 별칭을 더하거나 빼려면 이 표에 INSERT / DELETE 만 하면 된다(함수는 그대로).
-- 표는 service_role 만 읽는다(RLS 켜고 정책 없음 · anon · authenticated 권한 회수).
-- 되돌리기: 20261112320000 의 stock_feed_by_codes 정의를 다시 적용 · DROP TABLE public.stock_title_aliases.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_title_aliases (
  stock_code text NOT NULL,
  alias      text NOT NULL CHECK (char_length(btrim(alias)) >= 2),
  note       text,
  PRIMARY KEY (stock_code, alias)
);
ALTER TABLE public.stock_title_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stock_title_aliases FROM PUBLIC;
REVOKE ALL ON TABLE public.stock_title_aliases FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stock_title_aliases TO service_role;

COMMENT ON TABLE public.stock_title_aliases IS
  'Phase 41 — 네이버 뉴스 「제목에 종목명」 조건의 종목 별칭(기사에서 다른 이름으로 불리는 종목). 비교는 소문자 · 공백 제거 · service_role 전용';

-- 괄호 안 숫자 = 11-05 ~ 11-12 네이버 뉴스 중 종목명은 없고 이 별칭이 있는 제목 수
INSERT INTO public.stock_title_aliases (stock_code, alias, note) VALUES
  ('041510', 'SM엔터',     '에스엠 (6)'),
  ('122870', 'YG엔터',     '와이지엔터테인먼트 (6)'),
  ('035420', '네이버',     'NAVER (9)'),
  ('010950', '에쓰오일',   'S-Oil (30)'),
  ('161390', '한국타이어', '한국타이어앤테크놀로지 (151)'),
  ('055550', '신한금융',   '신한지주 (78)'),
  ('086790', '하나금융',   '하나금융지주 (116)'),
  ('316140', '우리금융',   '우리금융지주 (28)'),
  ('138040', '메리츠금융', '메리츠금융지주'),
  ('010120', 'LS일렉트릭', 'LS ELECTRIC (10)'),
  ('207940', '삼성바이오', '삼성바이오로직스 (114)'),
  ('036460', '가스공사',   '한국가스공사 (87)'),
  ('096770', 'SK이노',     'SK이노베이션 (8)'),
  ('361610', 'SKIET',      'SK아이이테크놀로지 (2)'),
  ('373220', 'LG엔솔',     'LG에너지솔루션'),
  ('017670', 'SKT',        'SK텔레콤 (358)'),
  ('032640', 'LGU+',       'LG유플러스 (140 · 「LG U+」 도 공백 제거로 같다)'),
  ('018260', '삼성SDS',    '삼성에스디에스 (5)')
ON CONFLICT (stock_code, alias) DO NOTHING;

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
  'Phase 41 종목 묶음 조회(D-04 · D-05 · D-06) — 입력 순서 · 모든 코드 · 출처별(kis · naver) 최신 p_per_source 건 원 행 · 숨김 연결 제외 · 네이버는 제목에 종목명 · 별칭 있는 기사만(stock_title_needles · stock_title_aliases) · p_register 면 등록(60초 1회) · service_role 전용';

COMMIT;
