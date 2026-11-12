-- ============================================================
-- Phase 41 UAT(2026-11-12) — 한투 제공처 I(자료원 「공시」)를 공시로 · 파생시장 안내 숨김 소급.
--
-- 운영에서 제공처 I 로 들어온 192건이 전부 거래소 파생시장 안내였다
--   「(주)제이와이피엔터테인먼트 주식선물 3단계 가격제한폭 확대요건 도달(상승)」
--   「(주)메리츠금융지주 주식선물ㆍ주식옵션 2단계 가격제한폭 확대요건 도달(하락)」
-- 수집기가 F · G 만 공시로 보던 탓에 「뉴스」 로 분류돼 종목 뉴스 목록에 보였다.
-- 수집기 `DISCLOSURE_PROVIDERS` 에 I 를 더했고(새 글), 이미 들어온 글은 여기서 고친다:
--   ① 글 종류 news → disclosure
--   ② 제목이 파생 안내(D-09 `DERIVATIVE_NOTICE_PATTERN` 과 같은 식)인 아직 보이는 연결 → derivative_notice
-- 글은 지우지 않는다(되돌리려면 kind 를 news, hidden_reason 을 NULL 로). 다시 돌려도 바뀌는 행이 없다.
-- ============================================================

BEGIN;

UPDATE public.kis_news
   SET kind = 'disclosure'
 WHERE provider_code = 'I'
   AND kind = 'news';

UPDATE public.kis_news_stocks s
   SET hidden_reason = 'derivative_notice'
  FROM public.kis_news n
 WHERE n.srno = s.srno
   AND n.provider_code = 'I'
   AND s.hidden_reason IS NULL
   AND n.title ~ 'ELW|주식워런트증권|ETN|상장지수증권|상장지수펀드|ETF|주식선물|주식옵션';

COMMIT;
