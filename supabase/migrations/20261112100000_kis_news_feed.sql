-- ============================================================
-- Phase 41 Plan 01 — 한투 뉴스·공시 피드: 저장 표 4개 + 들여오기 RPC + 종목 묶음 조회 RPC.
--
-- 무엇:
--   ① public.kis_news         — 한투 「종합 시황/공시(제목)」 글 1건 = 1행. srno(cntt_usiq_srno 첫 수신분) PK ·
--                                같은 날(KST) 같은 (제공업체 코드, 정규화 제목) 은 1행(수정본 · D-13).
--   ② public.kis_news_stocks  — 글 ↔ 종목 연결(PK stock_code, srno). hidden_reason 이 있으면 저장은 하되 조회에서 뺀다(D-09).
--   ③ public.kis_news_targets — 종목별 「등록(클라 조회)」 시각 · 「종목별 조회 마지막 성공」 시각(응답 collectedAt · D-06).
--   ④ public.kis_news_state   — 1행: 수집기 임대 · 전체 흐름 마지막 성공(feed_at) · 커서(last_srno) · 정리 날짜.
--   ⑤ RPC kis_news_ingest(p_rows jsonb, p_via text, p_queried_code text) — 수집기(workers/kis-news-sync) 전용 들여오기.
--   ⑥ RPC stock_feed_by_codes(p_codes text[], p_since timestamptz, p_per_source integer, p_register boolean, p_before timestamptz)
--      — server GET /api/news/by-stock · 종목 뉴스 목록 · home-sync 가 쓰는 묶음 조회(왕복 1회).
--
-- 결정(41-CONTEXT):
--   D-03 · D-04 조회 계약 = 종목 묶음 조회 하나 — 입력 순서 그대로 모든 코드(글 없는 코드도 빈 배열) · 종목별 collected_at.
--   D-05 묶음 조회는 한투를 부르지 않고 등록만 한다(last_requested_at · 같은 코드 60초에 1회 쓰기).
--   D-06 collected_at = 종목별 조회 마지막 성공 — 글 0건이어도 찍힌다(「아직 수집 전」 null 과 구분).
--   D-07 종목이 안 붙은 글은 저장하지 않는다(수집기가 거른다 — 연결 0개 행도 이 RPC 는 받되 kis_news 에만 남는다).
--   D-09 hidden_reason('etp' · 'derivative_notice')이 있는 연결은 조회에서 뺀다 — 규칙 변경은 UPDATE 로 소급.
--   D-13 · 리서치 뒤 확정: 수정본 키 = (provider_code, title_key, KST 작성일). 작성 시각은 LEAST(되감기는 최신 → 과거 순이라
--        수정본이 원본보다 먼저 들어온다 — Pitfall 4). 다른 날 같은 제목(「공매도 과열종목 지정」 등)은 별개 행.
--   D-14 거르기 · 합치기(한투 ↔ 네이버 같은 기사)는 gh-radar 에서 한 번 — DB 는 출처별 원 행만 주고 합치기는
--        shared mergeStockFeed 가 한다(규칙의 단일 정의).
--
-- 설계 메모:
--   - news_articles(네이버) 는 바꾸지 않는다(SC-5) — url NOT NULL · UNIQUE(stock_code, url) 와 url 없는 공시가 충돌하므로 새 표.
--   - kis_news_stocks.stock_code 에 stocks FK 를 걸지 않는다 — 종목 마스터 재적재 · 상폐 cascade 로 공시가 지워지지 않게.
--     (수집기가 stocks 마스터에 없는 코드는 연결하지 않는다.)
--   - PostgREST upsert 는 ON CONFLICT 대상 하나만 받아 유일키 두 개(srno · 수정본 키)를 못 다룬다 → plpgsql RPC.
--   - 조회 RPC 는 다른 RPC 의 jsonb 결과를 감싸지 않고 원 표를 인덱스로 직접 읽는다(lessons 2026-11-04 ·
--     Cloud Run 왕복 비용 — 메모리 project_cloudrun_egress_roundtrip_cost). jsonb 단일 값이라 db-max-rows(1000) 에 잘리지 않는다.
--
-- 권한: 네 표 모두 서비스롤 전용(RLS 활성 + 접근 규칙 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT) —
--   웹은 Express 경유로만 읽는다. 함수 권한 3줄은 프로젝트 관례대로 재진술(플랫폼 auto-grant 가 REVOKE FROM PUBLIC 을
--   덮는다 — 자동 메모리 feedback_supabase_rpc_revoke).
-- 원격 적용: 커밋만 — 원격은 41-09 `supabase db push`.
-- 되돌리기(이 순서): DROP FUNCTION public.stock_feed_by_codes(text[], timestamptz, integer, boolean, timestamptz);
--   DROP FUNCTION public.kis_news_ingest(jsonb, text, text); DROP TABLE public.kis_news_state; DROP TABLE public.kis_news_targets;
--   DROP TABLE public.kis_news_stocks; DROP TABLE public.kis_news;
-- ============================================================

BEGIN;

-- ── ① 글 ─────────────────────────────────────────────────────────
CREATE TABLE public.kis_news (
  srno          text        PRIMARY KEY,                                   -- cntt_usiq_srno (첫 수신분)
  provider_code text        NOT NULL,                                      -- news_ofer_entp_code (F 거래소 공시 · G 코스닥 공시 · 그 밖 언론사)
  source        text        NOT NULL,                                      -- dorg (예: '코스닥 공시' · '연합뉴스')
  kind          text        NOT NULL CHECK (kind IN ('news', 'disclosure')), -- F/G → disclosure
  category      text,                                                      -- news_lrdv_code
  title         text        NOT NULL,
  title_key     text        NOT NULL,                                      -- shared newsTitleKey(title)
  written_at    timestamptz NOT NULL,                                      -- data_dt + data_tm (KST) — 수정본이면 LEAST
  written_date  date        NOT NULL,                                      -- KST 작성일(수정본 키)
  received_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, title_key, written_date)
);

-- 보관 정리(41-02 kis_news_cleanup · 90일)용.
CREATE INDEX kis_news_written_at_idx ON public.kis_news (written_at);

-- ── ② 글 ↔ 종목 연결 ─────────────────────────────────────────────
CREATE TABLE public.kis_news_stocks (
  srno          text        NOT NULL REFERENCES public.kis_news(srno) ON DELETE CASCADE,
  stock_code    text        NOT NULL,                                      -- stocks FK 없음(위 설계 메모)
  via           text        NOT NULL CHECK (via IN ('feed', 'stock')),     -- 처음 연결한 경로
  hidden_reason text,                                                      -- NULL = 표시 · 'etp' · 'derivative_notice'
  written_at    timestamptz NOT NULL,                                      -- 조회 인덱스용 사본(kis_news.written_at 과 같이 고친다)
  PRIMARY KEY (stock_code, srno)
);

-- 묶음 조회 핫패스 — 종목별 보이는 글 최신순.
CREATE INDEX kis_news_stocks_visible_idx
  ON public.kis_news_stocks (stock_code, written_at DESC)
  WHERE hidden_reason IS NULL;
-- srno → 연결 코드 배열(codes) · 수정본 시각 고치기.
CREATE INDEX kis_news_stocks_srno_idx ON public.kis_news_stocks (srno);

-- ── ③ 등록 · 종목별 수집 시각 ─────────────────────────────────────
CREATE TABLE public.kis_news_targets (
  stock_code        text PRIMARY KEY,
  last_requested_at timestamptz,                                           -- 클라 묶음 조회(등록) — 60초에 1회 쓰기
  last_collected_at timestamptz                                            -- 종목별 조회 마지막 성공 → 응답 collectedAt
);

-- ── ④ 수집기 상태(1행) ────────────────────────────────────────────
CREATE TABLE public.kis_news_state (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lease_holder text,
  lease_until  timestamptz,
  feed_at      timestamptz,                                                -- 전체 흐름 마지막 성공(응답 feedAt · 수집기 생존 표시)
  last_srno    text,                                                       -- 피드 커서(마지막 본 일련번호)
  cleanup_date date                                                        -- 보관 정리를 마지막으로 한 KST 날짜
);
INSERT INTO public.kis_news_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── 표 권한(서비스롤 전용) ─────────────────────────────────────────
ALTER TABLE public.kis_news ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kis_news FROM PUBLIC;
REVOKE ALL ON TABLE public.kis_news FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kis_news TO service_role;

ALTER TABLE public.kis_news_stocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kis_news_stocks FROM PUBLIC;
REVOKE ALL ON TABLE public.kis_news_stocks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kis_news_stocks TO service_role;

ALTER TABLE public.kis_news_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kis_news_targets FROM PUBLIC;
REVOKE ALL ON TABLE public.kis_news_targets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kis_news_targets TO service_role;

ALTER TABLE public.kis_news_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kis_news_state FROM PUBLIC;
REVOKE ALL ON TABLE public.kis_news_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kis_news_state TO service_role;

-- ── ⑤ 들여오기 RPC ────────────────────────────────────────────────
-- p_rows: [{ srno, provider_code, source, kind, category, title, title_key, written_at(ISO · 오프셋 포함),
--            links: [{ code, hidden_reason }] }]  — 수집기 classify.toIngestRows 가 만든다(41-12).
-- 행마다: (가) 같은 srno 가 있으면 그 글에 연결만 더한다
--         (나) 없고 같은 (provider_code, title_key, KST 작성일) 이 있으면 수정본 — written_at = LEAST 로 고치고
--              (연결 사본 포함) 기존 srno 에 연결한다
--         (다) 둘 다 없으면 새 글.
-- p_via='feed' 면 kis_news_state.feed_at = now() · last_srno 전진(행 0개여도 feed_at 은 갱신).
-- p_queried_code 가 있으면 kis_news_targets.last_collected_at = now() — 행 0개여도(D-06 「수집했는데 글 없음」).
-- 반환: {"inserted": 새 글 수, "revisions": 수정본 경로를 탄 행 수(같은 수정본 재수신 포함), "linked": 새 연결 수}
CREATE OR REPLACE FUNCTION public.kis_news_ingest(
  p_rows         jsonb,
  p_via          text,
  p_queried_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row        jsonb;
  v_link       jsonb;
  v_srno       text;
  v_provider   text;
  v_key        text;
  v_written    timestamptz;
  v_date       date;
  v_target     text;
  v_prev_at    timestamptz;
  v_n          integer;
  v_max_srno   text;
  v_inserted   integer := 0;
  v_revisions  integer := 0;
  v_linked     integer := 0;
BEGIN
  IF p_via IS NULL OR p_via NOT IN ('feed', 'stock') THEN
    RAISE EXCEPTION 'kis_news_ingest: p_via 는 feed 또는 stock 이어야 한다 (받은 값 %)', p_via;
  END IF;
  IF p_rows IS NOT NULL AND jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'kis_news_ingest: p_rows 는 jsonb 배열이어야 한다 (받은 타입 %)', jsonb_typeof(p_rows);
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    v_srno     := v_row->>'srno';
    v_provider := v_row->>'provider_code';
    v_key      := v_row->>'title_key';
    v_written  := (v_row->>'written_at')::timestamptz;
    IF v_srno IS NULL OR v_srno = '' OR v_provider IS NULL OR v_key IS NULL OR v_key = '' OR v_written IS NULL THEN
      RAISE EXCEPTION 'kis_news_ingest: 필수 키 누락 (srno %, provider_code %, title_key %, written_at %)',
        v_srno, v_provider, v_key, v_row->>'written_at';
    END IF;
    v_date := (v_written AT TIME ZONE 'Asia/Seoul')::date;
    v_target := NULL;

    -- (가) 같은 일련번호
    SELECT srno INTO v_target FROM public.kis_news WHERE srno = v_srno;

    IF v_target IS NULL THEN
      -- (나) 같은 날 수정본
      SELECT srno, written_at INTO v_target, v_prev_at
        FROM public.kis_news
       WHERE provider_code = v_provider AND title_key = v_key AND written_date = v_date
       FOR UPDATE;

      IF v_target IS NULL THEN
        -- (다) 새 글. 동시 실행이 먼저 넣었으면 그 행에 붙는다(유일키 위반으로 run 을 죽이지 않는다).
        INSERT INTO public.kis_news
          (srno, provider_code, source, kind, category, title, title_key, written_at, written_date)
        VALUES
          (v_srno, v_provider, v_row->>'source', v_row->>'kind', v_row->>'category', v_row->>'title', v_key, v_written, v_date)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n = 1 THEN
          v_target := v_srno;
          v_inserted := v_inserted + 1;
        ELSE
          SELECT srno INTO v_target
            FROM public.kis_news
           WHERE srno = v_srno
              OR (provider_code = v_provider AND title_key = v_key AND written_date = v_date)
           LIMIT 1;
          IF v_target IS NULL THEN
            RAISE EXCEPTION 'kis_news_ingest: srno % 삽입 충돌 뒤 대상 행을 찾지 못했다', v_srno;
          END IF;
        END IF;
      ELSE
        v_revisions := v_revisions + 1;
        IF v_written < v_prev_at THEN
          UPDATE public.kis_news        SET written_at = v_written WHERE srno = v_target;
          UPDATE public.kis_news_stocks SET written_at = v_written WHERE srno = v_target;
        END IF;
      END IF;
    END IF;

    -- 연결(via = 이번 경로 · 이미 있으면 그대로)
    FOR v_link IN SELECT value FROM jsonb_array_elements(coalesce(v_row->'links', '[]'::jsonb)) LOOP
      IF coalesce(v_link->>'code', '') = '' THEN
        RAISE EXCEPTION 'kis_news_ingest: srno % 의 연결에 code 가 없다', v_srno;
      END IF;
      INSERT INTO public.kis_news_stocks (srno, stock_code, via, hidden_reason, written_at)
      SELECT v_target, v_link->>'code', p_via, NULLIF(v_link->>'hidden_reason', ''), n.written_at
        FROM public.kis_news n
       WHERE n.srno = v_target
      ON CONFLICT (stock_code, srno) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_linked := v_linked + v_n;
    END LOOP;

    IF v_max_srno IS NULL OR v_srno COLLATE "C" > v_max_srno COLLATE "C" THEN
      v_max_srno := v_srno;
    END IF;
  END LOOP;

  IF p_via = 'feed' THEN
    UPDATE public.kis_news_state
       SET feed_at   = now(),
           last_srno = CASE
                         WHEN v_max_srno IS NULL THEN last_srno
                         WHEN last_srno IS NULL OR v_max_srno COLLATE "C" > last_srno COLLATE "C" THEN v_max_srno
                         ELSE last_srno
                       END
     WHERE id = 1;
  END IF;

  IF p_queried_code IS NOT NULL AND p_queried_code <> '' THEN
    INSERT INTO public.kis_news_targets (stock_code, last_collected_at)
    VALUES (p_queried_code, now())
    ON CONFLICT (stock_code) DO UPDATE SET last_collected_at = now();
  END IF;

  RETURN jsonb_build_object('inserted', v_inserted, 'revisions', v_revisions, 'linked', v_linked);
END;
$$;

REVOKE ALL ON FUNCTION public.kis_news_ingest(jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kis_news_ingest(jsonb, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kis_news_ingest(jsonb, text, text) TO service_role;

COMMENT ON FUNCTION public.kis_news_ingest(jsonb, text, text) IS
  'Phase 41 한투 뉴스·공시 들여오기(D-13 수정본 · D-06 수집 시각) — 일련번호 멱등 · 같은 KST 날 같은 (제공업체, 정규화 제목) 1행(작성 시각 LEAST) · service_role 전용';

-- ── ⑥ 종목 묶음 조회 RPC ──────────────────────────────────────────
-- 반환: {"feed_at": <state.feed_at>, "stocks": [{"code", "collected_at", "kis": [...], "naver": [...]}]}
--   stocks = p_codes 입력 순서 · 모든 코드(글 없는 코드도 빈 배열 · 수집 전이면 collected_at null).
--   kis   = 보이는 연결(hidden_reason IS NULL) · written_at ∈ [p_since, p_before) · 최신순 p_per_source 건
--           {srno, kind, source, title, title_key, written_at, received_at, codes(보이는 연결 코드 · 코드순)}
--   naver = news_articles · published_at ∈ [p_since, p_before) · 최신순 p_per_source 건
--           {id, title, description, source, url, published_at, created_at}
-- p_register 가 참이면 같은 호출 안에서 등록(D-05) — 같은 코드는 60초에 한 번만 쓴다.
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
  'Phase 41 종목 묶음 조회(D-04 · D-05 · D-06) — 입력 순서 · 모든 코드 · 출처별(kis · naver) 최신 p_per_source 건 원 행 · 숨김 연결 제외 · p_register 면 등록(60초 1회) · service_role 전용';

COMMIT;

NOTIFY pgrst, 'reload schema';
