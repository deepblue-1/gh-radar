-- Phase 41 UAT — 20261112300000_kis_news_auto_market_hidden.sql 소급 검증용 「마이그레이션 전」 상태.
-- 실행: supabase/tests/kis_news_auto_market.test.sql 머리 주석 참고(--until 20261112200000 --with 이 파일 --with 마이그레이션).
-- 제목은 2026-11-12 운영 응답에서 본 실제 꼴이다.
INSERT INTO public.stocks (code, name, market, isin, security_group) VALUES
  ('900001', '가람전자',     'KOSDAQ', 'KR7900001001', '주권'),
  ('900002', '나래테크',     'KOSDAQ', 'KR7900002009', '주권'),
  ('900009', 'KODEX 테스트', 'KOSPI',  'KR7900009004', 'ETF');

CREATE FUNCTION pg_temp.put(p_srno text, p_provider text, p_source text, p_kind text, p_title text,
                            p_code text, p_hidden text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_at timestamptz := timestamptz '2026-11-12 09:06:00+09';
BEGIN
  INSERT INTO public.kis_news (srno, provider_code, source, kind, category, title, title_key, written_at, written_date, received_at)
  VALUES (p_srno, p_provider, p_source, p_kind, '01', p_title, 'k-' || p_srno, v_at, date '2026-11-12', v_at)
  ON CONFLICT (srno) DO NOTHING;
  INSERT INTO public.kis_news_stocks (srno, stock_code, via, hidden_reason, written_at)
  VALUES (p_srno, p_code, 'feed', p_hidden, v_at);
END $$;

-- 숨겨져야 하는 자동 기사(뉴스)
SELECT pg_temp.put('H01', '4', '서울경제', 'news', '<코>비큐AI, 상한가 진입.. +29.90% ↑',                         '900001');
SELECT pg_temp.put('H01', '4', '서울경제', 'news', '<코>비큐AI, 상한가 진입.. +29.90% ↑',                         '900002'); -- 같은 글 · 다른 종목 연결
SELECT pg_temp.put('H02', '4', '서울경제', 'news', '<유>티와이홀딩스우, 하한가 이탈.. -27.10% ↓',                 '900001');
SELECT pg_temp.put('H03', '2', '인포스탁', 'news', 'GST(083450) 소폭 상승세 +3.19%, 외국계 매수 유입',            '900001');
SELECT pg_temp.put('H04', '2', '인포스탁', 'news', '썸에이지(208640) 상한가 진입, 이틀째 상한가',                 '900001');
SELECT pg_temp.put('H05', '2', '인포스탁', 'news', '디아이(003160)  +6.51%, 에프에스티 +5.50%, 테크윙 +4.21%',    '900001');
SELECT pg_temp.put('H06', '2', '인포스탁', 'news', 'TIGER 코스닥액티브(0204S0) - 인포스탁 모닝 브리핑 (2026.11.09)', '900001');
SELECT pg_temp.put('H07', '4', '서울경제', 'news', '오후 3:21 현재 코스닥은 55:45으로 매도우위, 매도강세 업종은 출판?매체복제업(0.13%↑)', '900001');
SELECT pg_temp.put('H08', '4', '서울경제', 'news', '[마감 시황]  기관 매수 우위.. 코스닥 667.61(▲28.64, +4.48%) 상승 마감', '900001');
SELECT pg_temp.put('H09', '4', '서울경제', 'news', '의료정밀업(+6.74%↑)이 강세인 가운데, 코스피도 상승 흐름(+4.36%↑)', '900001');
SELECT pg_temp.put('H10', '2', '인포스탁', 'news', '코스닥 상승률 상위 20종목(직전 30분 기준)',                   '900001');
SELECT pg_temp.put('H11', '2', '인포스탁', 'news', '외국계 순매수,도 상위종목(코스닥) 수량기준',                  '900001');
SELECT pg_temp.put('H12', '2', '인포스탁', 'news', '증시요약(6) - 특징 상한가 및 급등종목',                       '900001');
SELECT pg_temp.put('H13', '2', '인포스탁', 'news', '오후장★테마동향',                                            '900001');
SELECT pg_temp.put('H14', '5', '뉴스핌',   'news', '[표]11월 11일 52주 신고가 종목 및 최근 동향',                  '900001');
SELECT pg_temp.put('H15', '2', '인포스탁', 'news', '변동성완화장치(VI) 발동 종목, 발동시간 기준',                 '900001');

-- 남아야 하는 뉴스
SELECT pg_temp.put('K01', '8', '머니투데이', 'news', '비큐AI, 퓨리오사AI 대박에 순익 흑자…"엔트로픽·오픈AI 저작권 리스크 반사이익"', '900001');
SELECT pg_temp.put('K02', '5', '뉴스핌',     'news', '[장중수급포착] 지니언스, 기관 5일 연속 순매수행진... 주가 +19.60%',           '900001');
SELECT pg_temp.put('K03', '1', '한국경제',   'news', '후성 수주공시 - 화학 제품 공급 계약 711.9억원 (매출액대비  15.10 %)',         '900001');
SELECT pg_temp.put('K04', '2', '인포스탁',   'news', '인텍플러스, 400.64억원 규모 공급계약(반도체 및 Substrate 검사 장비) 체결',    '900001');
SELECT pg_temp.put('K05', '5', '뉴스핌',     'news', '[리포트 브리핑]JYP Ent., ''저력은 확인했다, 이제는 성장의 확장'' 목표가 50,000원 - 삼성증권', '900001');
SELECT pg_temp.put('K06', '9', '연합뉴스',   'news', '[특징주] JYP엔터, 스트레이키즈 활약 등 호실적에 장초반 20% 급등',             '900001');
SELECT pg_temp.put('K07', '1', '한국경제',   'news', '''에스텍'' 52주 신고가 경신, 외국인 3일 연속 순매수(1.9만주)',                 '900001');

-- 공시는 제목이 같은 꼴이어도 그대로 · 이미 숨긴 연결은 사유 유지
SELECT pg_temp.put('D01', 'G', '코스닥 공시', 'disclosure', '코스닥 상승률 상위 20종목 관련 안내',            '900001');
SELECT pg_temp.put('E01', '4', '서울경제',    'news',       '<유>KODEX 테스트, 상한가 진입.. +29.90% ↑',     '900009', 'etp');
