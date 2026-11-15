-- Phase 41 코드 리뷰 IN-32 — 가운뎃점 키 소급(20261115110000) 검증용 「마이그레이션 전」 상태.
-- 실행: supabase/tests/kis_news_title_key_middle_dot.test.sql 머리 주석 참고(--until 20261115100000 --with 이 파일 --with 마이그레이션).
-- 키는 옛 수집기(shared newsTitleKey — 「ㆍ」 → NFKC 「ᆞ」 가 남던 판)가 만든 모양이다.
INSERT INTO public.stocks (code, name, market, isin) VALUES
  ('900301', '가람전자', 'KOSDAQ', 'KR7900301005')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.kis_news (srno, provider_code, source, kind, category, title, title_key, written_at, written_date, received_at)
VALUES
  -- A. 바뀐다
  ('TD01', 'G', '코스닥 공시', 'disclosure', '01', '(주)가람전자 단일판매ㆍ공급계약체결', '주가람전자단일판매ᆞ공급계약체결',
   timestamptz '2026-11-12 17:36:54+09', date '2026-11-12', timestamptz '2026-11-12 17:37:00+09'),
  -- A'. 다른 날 같은 키 — 따로 바뀐다
  ('TD02', 'G', '코스닥 공시', 'disclosure', '01', '(주)가람전자 단일판매ㆍ공급계약체결', '주가람전자단일판매ᆞ공급계약체결',
   timestamptz '2026-11-13 09:00:00+09', date '2026-11-13', timestamptz '2026-11-13 09:00:05+09'),
  -- B. 후보끼리 겹친다(지우면 둘 다 「가람ㆍ전자」 → 가람전자) — 일련번호 작은 TD03 만 바뀐다
  ('TD03', '4', '서울경제', 'news', '01', '가람ㆍ전자 기사', '가람ᆞ전자기사',
   timestamptz '2026-11-12 10:00:00+09', date '2026-11-12', timestamptz '2026-11-12 10:00:01+09'),
  ('TD04', '4', '서울경제', 'news', '01', '가람전자ㆍ 기사', '가람전자ᆞ기사',
   timestamptz '2026-11-12 10:05:00+09', date '2026-11-12', timestamptz '2026-11-12 10:05:01+09'),
  -- C. 이미 있는 키와 겹친다 — 그대로
  ('TD05', '4', '서울경제', 'news', '01', '나래 수주 기사', '나래수주기사',
   timestamptz '2026-11-12 11:00:00+09', date '2026-11-12', timestamptz '2026-11-12 11:00:01+09'),
  ('TD06', '4', '서울경제', 'news', '01', '나래ㆍ수주 기사', '나래ᆞ수주기사',
   timestamptz '2026-11-12 11:05:00+09', date '2026-11-12', timestamptz '2026-11-12 11:05:01+09'),
  -- D. 지우면 빈 키 — 그대로
  ('TD07', '4', '서울경제', 'news', '01', 'ㆍ', 'ᆞ',
   timestamptz '2026-11-12 12:00:00+09', date '2026-11-12', timestamptz '2026-11-12 12:00:01+09');
