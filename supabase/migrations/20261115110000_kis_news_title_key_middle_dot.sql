-- ============================================================
-- Phase 41 코드 리뷰 IN-32(2026-11-15) — 정규화 제목 키(title_key)에서 가운뎃점 「ㆍ」 를 지운다.
--
-- shared newsTitleKey 는 글자(L) · 숫자(N)만 남기는데, 한국 공시 · 기사 제목에 흔한 「ㆍ」(U+318D)는 NFKC 뒤 「ᆞ」(U+119E ·
-- 문자 범주 Lo)라 키에 남았다. 그래서 「단일판매ㆍ공급계약」(한투) 과 「단일판매·공급계약」(네이버 · U+00B7 은 지워짐)의 키가 갈려
-- 한투 ↔ 네이버 합치기(D-12)와 같은 날 수정본 키(D-13 · UNIQUE (provider_code, title_key, written_date))가 실패했다.
-- shared 는 같은 커밋에서 두 글자를 지우게 바꿨다. DB 쪽은
--   ① kis_news_ingest — 받은 title_key 에서 두 글자를 지운다(그 밖 본문 · 서명 · 권한은 20261112100000 그대로).
--      수집기(workers/kis-news-sync)는 shared 를 이미지에 묶으므로, 새 shared 로 다시 배포되기 전 옛 이미지가 보내는 키도
--      여기서 같은 모양이 된다 — 수집기 배포 순서와 무관하다.
--   ② 기존 행 소급 — 두 글자가 든 title_key 를 지운 키로 바꾼다. 바꾼 키가 같은 (제공업체, 키, KST 날)의 다른 행과 겹치면
--      (원래 한 글의 수정본인데 키가 갈려 따로 들어간 경우) 그 행은 그대로 둔다 — 유일키 위반 없이 · 행을 지우거나 합치지 않는다.
--      겹치는 후보끼리는 일련번호가 가장 작은 한 행만 바꾼다. 다시 돌려도 결과가 같다(멱등).
-- 되돌리기: 20261112100000 의 kis_news_ingest 정의를 다시 적용(소급된 키는 그대로 둬도 동작에 문제 없다).
-- ============================================================

BEGIN;

-- ① 들여오기
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
    -- 가운뎃점 「ㆍ」(U+318D) · 그 NFKC 꼴 「ᆞ」(U+119E)는 키에서 지운다(IN-32 — shared newsTitleKey 와 같은 규칙).
    -- 옛 수집기 이미지가 두 글자가 든 키를 보내도 수정본 키(D-13)가 갈리지 않는다. 다 지워 빈 키가 되면 받은 그대로.
    v_key := coalesce(nullif(translate(v_key, 'ㆍᆞ', ''), ''), v_key);
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
  'Phase 41 한투 뉴스·공시 들여오기(D-13 수정본 · D-06 수집 시각) — 일련번호 멱등 · 같은 KST 날 같은 (제공업체, 정규화 제목) 1행(작성 시각 LEAST) · 정규화 제목에서 가운뎃점 ㆍ/ᆞ 제거 · service_role 전용';

-- ② 기존 행 소급(멱등)
WITH cand AS (
  SELECT n.srno, n.provider_code, n.written_date, translate(n.title_key, 'ㆍᆞ', '') AS new_key
    FROM public.kis_news n
   WHERE n.title_key ~ '[ㆍᆞ]'
     AND translate(n.title_key, 'ㆍᆞ', '') <> ''
),
ranked AS (
  SELECT c.*, row_number() OVER (PARTITION BY c.provider_code, c.new_key, c.written_date ORDER BY c.srno) AS rn
    FROM cand c
)
UPDATE public.kis_news n
   SET title_key = r.new_key
  FROM ranked r
 WHERE n.srno = r.srno
   AND r.rn = 1
   AND NOT EXISTS (
     SELECT 1 FROM public.kis_news o
      WHERE o.provider_code = r.provider_code
        AND o.title_key = r.new_key
        AND o.written_date = r.written_date
   );

COMMIT;
