-- ============================================================
-- 데이터 정리: 2026-10-17(토) limitup 적재분 삭제 — KRX 시험 송출
-- ============================================================
-- 무엇: date = '20261017' 행을 limitup 표 11개 전부에서 지운다(표 6 · team_flow · 파생 2 · 적재 이력 · stage).
-- 왜:   10/17 토요일 KRX 가 시험 시세(10:20~16:00)를 보냈고 119 밤 배치가 이를 거래일로 보고 9종목을 탐지해 export 를 만들었다
--       (삼성전자 · SK하이닉스 · 기아 등 가짜 20%↑). gh-trade 가 배치를 토 · 일 제외로 고쳤고(b59cfd61) 119 export/20261017 을 치웠다
--       (gh-trade-35 요청 · 사용자 확인 2026-10-20).
-- 재적재 방지: GCS gs://gh-radar-limitup-export/export/20261017/ 은 이 마이그레이션 전에 지웠다. radar-gw 미러는 다음 운반의
--       rsync --delete 가 지우고(119 에 없음) 업로드는 rsync 뒤라 다시 올리지 않는다 → 워커가 이 날짜를 보지 못한다.
-- 남는 것: Storage limitup-grid/grid/20261017/ 격자 파일 — 행이 없어 화면에서 닿지 않고 90일 보존 정리가 지운다
--       (SQL 로 storage.objects 를 지우면 실제 파일이 남는다 — purge.ts 주석).
-- 되돌리기: 없음(119 백업 ~/ticks/_removed-20261017 을 되돌리고 운반 · 적재하면 다시 들어온다).
-- ============================================================

BEGIN;

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'limitup_team_flow', 'limitup_entries', 'limitup_locks', 'limitup_jumps', 'limitup_member_alloc',
    'limitup_facts', 'limitup_touches', 'limitup_grid_summary', 'limitup_member_daily',
    'limitup_stage', 'limitup_loads'
  ] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE date = %L', t, '20261017');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'limitup 20261017 삭제: % = %행', t, n;
  END LOOP;
END $$;

COMMIT;
