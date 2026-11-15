-- ============================================================
-- Phase 41 코드 리뷰 IN-32(2026-11-15) — 정규화 제목 키에서 가운뎃점 「ㆍ」(U+318D) · 「ᆞ」(U+119E) 제거 pgTAP.
--
-- 대상: 20261115110000_kis_news_title_key_middle_dot.sql (kis_news_ingest 키 정규화 + 기존 행 소급)
--
-- 잠그는 것:
--   B. 소급 — 두 글자가 든 키는 지운 키로 · 다른 날은 따로 · 후보끼리 겹치면 일련번호 작은 한 행만 · 이미 있는 키와 겹치면
--      그대로 · 지우면 빈 키가 되는 행은 그대로 · 마이그레이션을 두 번 돌려도 같다(픽스처 뒤 --with 로 두 번 얹는다)
--   I. 들여오기 — 옛 수집기 키(ᆞ 포함)도 소급된 행의 같은 날 수정본으로 붙는다 · 새 글은 지운 키로 저장 · 빈 키 예외 없음
--   S. 서명 · SECURITY INVOKER · search_path 고정 · service_role 만
--
-- 실행(마이그레이션 「전」 상태를 먼저 만들고 그 위에 마이그레이션을 두 번 얹는다 — 멱등 확인):
--   bash scripts/verify-dma-orders-price-check.sh --until 20261115100000 \
--     --with supabase/tests/fixtures/41_title_key_dot_pre.sql \
--     --with supabase/migrations/20261115110000_kis_news_title_key_middle_dot.sql \
--     --with supabase/migrations/20261115110000_kis_news_title_key_middle_dot.sql \
--     --test supabase/tests/kis_news_title_key_middle_dot.test.sql
-- — 일회용 로컬 컨테이너(원격 DB 접촉 0). 테스트 본문은 한 트랜잭션 + ROLLBACK.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(14);

CREATE FUNCTION pg_temp.key_of(p_srno text) RETURNS text LANGUAGE sql AS $$
  SELECT title_key FROM public.kis_news WHERE srno = p_srno
$$;

-- ── B. 소급 ───────────────────────────────────────────────────────
SELECT is(pg_temp.key_of('TD01'), '주가람전자단일판매공급계약체결', 'B1 「ᆞ」 가 든 키 → 지운 키');
SELECT is(pg_temp.key_of('TD02'), '주가람전자단일판매공급계약체결', 'B2 다른 날 같은 키는 따로 바뀐다(유일키는 날짜 포함)');
SELECT is(pg_temp.key_of('TD03'), '가람전자기사',   'B3 후보끼리 겹치면 일련번호 작은 행만 바뀐다');
SELECT is(pg_temp.key_of('TD04'), '가람전자ᆞ기사', 'B4 겹친 나머지 후보는 그대로(유일키 위반 없음)');
SELECT is(pg_temp.key_of('TD06'), '나래ᆞ수주기사', 'B5 이미 있는 키와 겹치는 행은 그대로');
SELECT is(pg_temp.key_of('TD07'), 'ᆞ',              'B6 지우면 빈 키가 되는 행은 그대로');

-- ── I. 들여오기 ───────────────────────────────────────────────────
CREATE FUNCTION pg_temp.row(p_srno text, p_key text, p_at text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'srno', p_srno, 'provider_code', 'G', 'source', '코스닥 공시', 'kind', 'disclosure', 'category', '01',
    'title', '(주)가람전자 단일판매ㆍ공급계약체결', 'title_key', p_key, 'written_at', p_at,
    'links', jsonb_build_array(jsonb_build_object('code', '900301', 'hidden_reason', NULL)))
$$;

-- 옛 수집기가 보낸 「ᆞ」 키 · 더 이른 작성 시각 → 소급된 TD01 의 같은 날 수정본(LEAST)
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('TD10', '주가람전자단일판매ᆞ공급계약체결', '2026-11-12T17:30:00+09:00')), 'stock'),
  '{"inserted": 0, "revisions": 1, "linked": 1}'::jsonb,
  'I1 옛 수집기 키(ᆞ 포함)도 소급된 행의 수정본으로 붙는다');
SELECT is((SELECT written_at FROM public.kis_news WHERE srno = 'TD01'), timestamptz '2026-11-12 17:30:00+09',
          'I2 수정본 작성 시각은 LEAST');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.kis_news WHERE srno = 'TD10'), 'I3 수정본은 새 행을 만들지 않는다');

-- 새 글 — 「ㆍ」(U+318D) 그대로 보낸 키도 지운 키로 저장 · 이어서 지운 키로 온 같은 날 글은 수정본
SELECT public.kis_news_ingest(jsonb_build_array(pg_temp.row('TD11', '새공시ㆍ테스트', '2026-11-14T09:00:00+09:00')), 'stock');
SELECT is(pg_temp.key_of('TD11'), '새공시테스트', 'I4 새 글은 두 글자를 지운 키로 저장');
SELECT is(
  public.kis_news_ingest(jsonb_build_array(pg_temp.row('TD12', '새공시테스트', '2026-11-14T09:10:00+09:00')), 'stock'),
  '{"inserted": 0, "revisions": 1, "linked": 0}'::jsonb,
  'I5 새 수집기 키(이미 지운 키)도 같은 글의 수정본');
SELECT lives_ok(
  $$ SELECT public.kis_news_ingest(jsonb_build_array(pg_temp.row('TD13', 'ᆞ', '2026-11-14T10:00:00+09:00')), 'stock') $$,
  'I6 지우면 빈 키가 되는 키는 받은 그대로(예외로 run 을 죽이지 않는다)');

-- ── S. 서명 · 속성 · 권한 ─────────────────────────────────────────
SELECT ok(
  (SELECT NOT p.prosecdef AND 'search_path=public, pg_temp' = ANY (p.proconfig) FROM pg_proc p
    WHERE p.oid = 'public.kis_news_ingest(jsonb,text,text)'::regprocedure),
  'S1 SECURITY INVOKER · search_path 고정');
SELECT ok(NOT has_function_privilege('anon', 'public.kis_news_ingest(jsonb,text,text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.kis_news_ingest(jsonb,text,text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.kis_news_ingest(jsonb,text,text)', 'EXECUTE'),
          'S2 권한 — service_role 만');

SELECT * FROM finish();
ROLLBACK;
