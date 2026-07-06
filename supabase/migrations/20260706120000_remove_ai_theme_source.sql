-- Quick 260706-erk: theme-sync AI 보강 폐기에 따른 'ai' 출처 데이터 정리.
-- 홈 파이프라인(home_theme_snapshots)과 무관 — themes/theme_stocks 만 대상.
-- theme_stocks.theme_id 는 ON DELETE CASCADE 이나, 명시성/안전을 위해 순서대로 처리한다.
-- theme 테이블 트리거는 BEFORE UPDATE(touch updated_at) / BEFORE INSERT(limit) 뿐이라
-- DELETE 는 sources/top3_avg 를 오염시키지 않는다.
BEGIN;

-- 1) AI 보강으로 추가된 개별 종목 매핑 제거
DELETE FROM theme_stocks WHERE source = 'ai';

-- 2) AI 단독 시스템 테마(sources 가 정확히 {ai}) 제거 — 잔여 매핑은 CASCADE 로 함께 삭제.
--    admin 오버라이드(hidden/manual_override)가 함께 사라지는 것은 허용(설계 확정).
DELETE FROM theme_stocks
  WHERE theme_id IN (
    SELECT id FROM themes WHERE is_system = true AND sources = ARRAY['ai']::text[]
  );
DELETE FROM themes
  WHERE is_system = true AND sources = ARRAY['ai']::text[];

-- 3) 혼합 출처 테마의 sources 배열에서 'ai' 원소 제거
UPDATE themes
  SET sources = array_remove(sources, 'ai')
  WHERE 'ai' = ANY(sources);

COMMIT;
