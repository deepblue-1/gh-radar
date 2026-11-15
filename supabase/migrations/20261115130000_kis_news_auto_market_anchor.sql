-- ============================================================
-- Phase 41 코드 리뷰 IN-35(2026-11-15) — auto_market 2번 규칙(인포스탁 시세 한 줄)에 끝 앵커 · 숨김 소급 3차.
--
-- 옛 2번 규칙 `^.+\([0-9A-Z]{6}\) +((소폭|…|하한가)|[+-][0-9])` 는 괄호 코드 뒤 방향 낱말만 보고 뒤 문구를 보지 않아
-- 「에코프로(086520) 급등, 2차전지 대규모 수주」 같은 재료 기사까지 숨겼다. 새 규칙은 끝까지 앵커한다 —
-- 괄호 코드 + 방향 낱말(짧은 꼬리 6자) 뒤에는 시세 숫자 · 「↑↓」 · 쉼표 뒤 수급 · 연속 낱말(외국계 · 외국인 · 기관 · 개인 ·
-- 프로그램 · N거래일 · N일 연속 · 이틀째 …) · 「<종목> ±N%」 목록만 온다. 옛 규칙의 부분집합이라 새로 숨는 글은 없다.
--
-- 규칙의 정본은 수집기 `workers/kis-news-sync/src/pipeline/classify.ts` 의 `AUTO_MARKET_NEWS_PATTERNS` 다.
-- 아래 배열은 그 목록 전체다(다시 돌려도 같은 결과) · `tests/classify.test.ts` 가 글자까지 대조한다.
--
-- - 뉴스만(kind = 'news') 바꾼다. 공시 · 'etp' · 'derivative_notice' 연결은 건드리지 않는다. 글은 지우지 않는다.
-- - ① 이미 'auto_market' 인데 새 배열에 안 맞는 연결 → NULL(숨김 해제). ② 보이는 연결이 새 배열에 맞으면 → 'auto_market'.
-- - 배열은 한 번만 쓴다(대조 테스트가 첫 배열을 읽는다) — 맞는 글 일련번호를 임시 표에 담아 두 UPDATE 가 같이 쓴다.
-- - 두 번 돌려도 같은 결과.
-- 되돌리기: 20261112310000 을 다시 적용(옛 배열로 보이는 연결을 다시 숨긴다).
-- ============================================================

BEGIN;

CREATE TEMP TABLE kis_news_auto_market_hit ON COMMIT DROP AS
SELECT n.srno
  FROM public.kis_news n
 WHERE n.kind = 'news'
   AND n.title ~ ANY (ARRAY[
     '^<[^>]{1,4}>.*(상한가|하한가) ?(진입|이탈)',
     '^.+\([0-9A-Z]{6}\) +((소폭|상승|하락|급등|급락|강세|약세|상한가|하한가)[^,0-9]{0,6}( *[+-][0-9.]+%)?|[+-][0-9.]+%)( *[↑↓])?(, *((외국계|외국인|기관|개인|프로그램|[0-9]+거래일|[0-9]+일 연속|[0-9]+일째|이틀째|사흘째|나흘째)[^,]*|[^, ]{1,20} [+-][0-9.]+%( *[↑↓])?))*$',
     '^.+\([0-9A-Z]{6}\) - 인포스탁 모닝 브리핑',
     '^(오전|오후) ?[0-9]{1,2}:[0-9]{2} 현재 (코스피|코스닥)',
     '^\[(개장|정오|마감|장중) ?시황\]',
     '^.+\([+-][0-9.]+%.?\)이 (강세|약세)인 가운데',
     '^증시요약\([0-9]+\)',
     '상위 ?[0-9]* ?종목',
     '기술적 분석 특징주',
     '★',
     '^변동성완화장치\(VI\) 발동 종목',
     '^전일대비 거래량 (급증|증가) 종목',
     '^종가 동시호가 특이 종목',
     '^전일자 주요 지분 변동 공시',
     '^\[표\]',
     '^오늘의 (메모|이슈)',
     '^기업 공시 \[',
     '^\[장중수급포착\]',
     '52주 신고가 경신, .*순매[수도]'
   ]);

-- ① 숨김 해제 — 새 규칙에 안 맞는 auto_market 연결.
UPDATE public.kis_news_stocks s
   SET hidden_reason = NULL
  FROM public.kis_news n
 WHERE n.srno = s.srno
   AND n.kind = 'news'
   AND s.hidden_reason = 'auto_market'
   AND NOT EXISTS (SELECT 1 FROM kis_news_auto_market_hit h WHERE h.srno = s.srno);

-- ② 숨김 — 보이는 연결 중 새 규칙에 맞는 것(옛 규칙의 부분집합이라 보통 0행 · 멱등 보장용).
UPDATE public.kis_news_stocks s
   SET hidden_reason = 'auto_market'
  FROM public.kis_news n
 WHERE n.srno = s.srno
   AND n.kind = 'news'
   AND s.hidden_reason IS NULL
   AND EXISTS (SELECT 1 FROM kis_news_auto_market_hit h WHERE h.srno = s.srno);

COMMIT;
