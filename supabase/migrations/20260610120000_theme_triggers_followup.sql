-- ============================================================
-- Phase 10 follow-up — theme 트리거 보강 (code-review 10 WR-D-02 / WR-D-03)
--
-- 20260609120000_theme_tables.sql 가 이미 운영에 적용된 상태이므로 in-place 수정 대신
-- 후속 마이그레이션으로 ALTER/REPLACE 한다(소스↔운영 divergence 방지).
--
--   WR-D-02: themes.updated_at 이 UPDATE 시 갱신되지 않음(BEFORE UPDATE 트리거 부재).
--            통계 업데이트·유저 CRUD 가 updated_at 을 올리도록 touch 트리거 추가.
--   WR-D-03: 기존 limit 트리거 함수 2개가 SET search_path 누락(프로젝트 plpgsql 규약 불일치).
--            CREATE OR REPLACE 로 SET search_path = public 추가(INVOKER 라 위험 낮으나 방어).
-- ============================================================

-- ---------------------------------------------------------
-- WR-D-02 — themes.updated_at touch 트리거 (BEFORE UPDATE)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_themes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS trg_touch_themes_updated_at ON themes;
CREATE TRIGGER trg_touch_themes_updated_at
  BEFORE UPDATE ON themes
  FOR EACH ROW
  EXECUTE FUNCTION touch_themes_updated_at();

-- ---------------------------------------------------------
-- WR-D-03 — 기존 limit 트리거 함수에 SET search_path = public 추가.
--   본문은 20260609120000 와 동일(검증 로직 불변), search_path 만 명시.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_user_theme_stock_limit()
RETURNS TRIGGER AS $$
DECLARE
  is_sys boolean;
  cnt    int;
BEGIN
  SELECT t.is_system INTO is_sys FROM themes t WHERE t.id = NEW.theme_id;

  -- 시스템 테마(워커) 또는 부모 부재(FK 가 별도 차단)면 limit 미적용
  IF is_sys IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt
  FROM theme_stocks
  WHERE theme_id = NEW.theme_id AND effective_to IS NULL;

  IF cnt >= 50 THEN
    RAISE EXCEPTION 'user_theme_stock_limit_exceeded'
      USING HINT = '하나의 테마에는 최대 50개 종목까지 추가할 수 있습니다.',
            ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE OR REPLACE FUNCTION enforce_user_theme_count_limit()
RETURNS TRIGGER AS $$
DECLARE
  cnt int;
BEGIN
  -- 시스템 테마 INSERT(워커)는 limit 미적용
  IF NEW.is_system = true OR NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO cnt
  FROM themes
  WHERE owner_id = NEW.owner_id AND is_system = false;

  IF cnt >= 50 THEN
    RAISE EXCEPTION 'user_theme_count_limit_exceeded'
      USING HINT = '테마는 최대 50개까지 만들 수 있습니다.',
            ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;
