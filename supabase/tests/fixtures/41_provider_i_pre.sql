-- Phase 41 UAT — 제공처 I 공시 전환 소급(20261112330000) 검증용 「마이그레이션 전」 상태.
-- 실행: supabase/tests/kis_news_provider_i.test.sql 머리 주석 참고.
INSERT INTO public.stocks (code, name, market, isin, security_group) VALUES
  ('900001', '가람전자',     'KOSDAQ', 'KR7900001001', '주권'),
  ('900009', 'KODEX 테스트', 'KOSPI',  'KR7900009004', 'ETF');

CREATE FUNCTION pg_temp.put(p_srno text, p_provider text, p_source text, p_kind text, p_title text,
                            p_code text, p_hidden text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_at timestamptz := timestamptz '2026-11-12 09:06:00+09';
BEGIN
  INSERT INTO public.kis_news (srno, provider_code, source, kind, category, title, title_key, written_at, written_date, received_at)
  VALUES (p_srno, p_provider, p_source, p_kind, '12', p_title, 'k-' || p_srno, v_at, date '2026-11-12', v_at)
  ON CONFLICT (srno) DO NOTHING;
  INSERT INTO public.kis_news_stocks (srno, stock_code, via, hidden_reason, written_at)
  VALUES (p_srno, p_code, 'feed', p_hidden, v_at);
END $$;

-- 제공처 I 파생 안내(뉴스로 잘못 들어옴)
SELECT pg_temp.put('I01', 'I', '공시', 'news', '(주)가람전자 주식선물 3단계 가격제한폭 확대요건 도달(상승)', '900001');
SELECT pg_temp.put('I02', 'I', '공시', 'news', '(주)가람전자 주식선물ㆍ주식옵션 2단계 가격제한폭 확대요건 도달(하락)', '900001');
SELECT pg_temp.put('I03', 'I', '공시', 'news', '(주)가람전자 주식선물 2단계 가격제한폭 확대요건 도달(상승)', '900009', 'etp'); -- 이미 etp
-- 제공처 I 이지만 파생 안내가 아닌 제목(가정) — 공시로만 바뀌고 보인다
SELECT pg_temp.put('I04', 'I', '공시', 'news', '(주)가람전자 기타 시장 안내', '900001');
-- 다른 제공처는 그대로
SELECT pg_temp.put('N01', '8', '머니투데이', 'news', '가람전자, 주식선물 편입 기대감', '900001');
SELECT pg_temp.put('F01', 'F', '거래소 공시', 'disclosure', '(주)가람전자 단일판매ㆍ공급계약체결', '900001');
