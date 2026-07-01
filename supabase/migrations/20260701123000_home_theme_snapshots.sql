-- ============================================================
-- Phase 13 Plan 01: home_theme_snapshots
--   (홈 화면 "오늘의 급등 테마" 시점별 스냅샷 — JSONB-blob-per-row)
--   HOME-01 토대 — RESEARCH §Pattern 1(JSONB-blob 스냅샷) 을 limit_up_tables.sql 톤
--   (BEGIN/COMMIT · 공개 read RLS · 컬럼 주석) 으로 작성.
--
-- 데이터 흐름 (Plan 02 home-sync 워커):
--   top_movers ⋈ stock_quotes(change_rate ≥ 20%) + 급등종목 news_articles 를 읽어
--   Claude Haiku 1회(temp=0, JSON-only) 로 bottom-up 클러스터링 → payload(jsonb) 저장.
--   웹앱은 read-only(RLS SELECT). 워커만 service_role 로 write.
--
-- 결정 근거 (13-CONTEXT.md / 13-RESEARCH.md §Pattern 1):
--   D-01: 시점별(:30) 스냅샷 append — 장중 매시 :30 배치, 하루 여러 row 누적.
--         PK (trade_date, captured_at) 로 (날짜, 시점) 유일.
--   D-04: content_hash — 급등집합+뉴스 해시가 직전 스냅샷과 동일하면 Claude 호출 skip
--         (비용/일관성 가드, theme-sync 24h hash 패턴 재사용). skip 시 직전 payload 복제 append.
--   D-05: is_carried — hash-skip 으로 직전 스냅샷을 복제 append 한 row 표시(신규 계산 아님).
--   D-06: payload(jsonb) 는 Claude 출력 1:1 blob (themes/singles/threshold/marketStatus).
--
--   feedback_supabase_rls_authenticated: 신규 테이블 RLS 는 TO anon, authenticated 둘 다 명시.
--     anon-only 시 로그인(JWT authenticated) 사용자가 default-deny 로 0-row 회귀.
--
--   threat register (13-01 threat_model):
--     T-13-02 (정보노출/default-deny): RLS policy TO anon, authenticated USING (true) — 둘 다 명시
--     T-13-04 (권한상승/무단쓰기): INSERT/UPDATE/DELETE policy 부재 → service_role(워커)만 write
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- home_theme_snapshots — 시점별 홈 급등 테마 스냅샷 (JSONB-blob-per-row)
--   PK (trade_date, captured_at). payload 는 Claude 출력 verbatim blob.
-- ─────────────────────────────────────────────────────────
CREATE TABLE home_theme_snapshots (
  trade_date   date        NOT NULL,                 -- KST 거래일 (YYYY-MM-DD)
  captured_at  timestamptz NOT NULL,                 -- 스냅샷 시점 (장중 매시 :30, 마감직후 15:30)
  theme_count  int         NOT NULL DEFAULT 0,       -- payload.themes 개수 (인덱스/목록 표시용)
  stock_count  int         NOT NULL DEFAULT 0,       -- 급등 종목 총수 (테마 소속 + 개별 급등)
  content_hash text,                                 -- 급등집합+뉴스 SHA256 (D-04 hash-skip 변경감지)
  is_carried   boolean     NOT NULL DEFAULT false,   -- 직전 스냅샷 복제 append 여부 (D-05, hash 동일 skip)
  payload      jsonb,                                -- Claude 출력 1:1 blob (D-06 themes/singles/threshold/marketStatus)
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, captured_at)
);

-- 최신 스냅샷 조회(홈 기본 진입) + 날짜/시점 네비게이션 인덱스
CREATE INDEX idx_home_snapshots_captured ON home_theme_snapshots (captured_at DESC);
CREATE INDEX idx_home_snapshots_date     ON home_theme_snapshots (trade_date DESC, captured_at DESC);

-- ─────────────────────────────────────────────────────────
-- RLS — 공개 read (TO anon, authenticated 둘 다 — default-deny 함정 회피)
--   feedback_supabase_rls_authenticated / T-13-02.
--   INSERT/UPDATE/DELETE policy 없음 → service_role(워커)만 write (T-13-04).
--   RPC 없음(plain table) → REVOKE 불요.
-- ─────────────────────────────────────────────────────────
ALTER TABLE home_theme_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_home_theme_snapshots" ON home_theme_snapshots FOR SELECT TO anon, authenticated USING (true);

COMMIT;
