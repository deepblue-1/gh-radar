-- ============================================================
-- gh-radar: RLS 활성화 + 정책
-- anon SELECT 허용 (공개 앱), 쓰기는 service_role만 가능
-- kis_tokens는 anon 정책 없음 (service_role이 RLS 우회)
-- ============================================================

ALTER TABLE stocks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE kis_tokens      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_stocks"
  ON stocks FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_news"
  ON news_articles FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_discussions"
  ON discussions FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_summaries"
  ON summaries FOR SELECT TO anon USING (true);
