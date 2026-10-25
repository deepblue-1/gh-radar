-- ============================================================
-- quick-261025-uf2 — `limitup_accum_flow` 에 당일 축 4열을 더한다(매집감지 당일 축 기반 · 화면 변화 없음).
--
-- 왜: 인박스 docs/inbox/from-gh-trade/261025-accum-day-axis.md ⑤ — gh-trade 51e21a8f 가 밤 export
--   `accum_flow.ndjson.gz` 평평한 열 말미에 4열을 append 했다(schema_version 무변경).
--   - pos_day_buy_krw · pos_day_sell_krw — 그 isin 그날 마지막 이벤트 행(kind 16 snap_qty[2] · snap_cum[2])의
--     당일 팀 매수 · 매도 금액(원 · 우리 체결 제외). 전날 요약(전날 마지막 행 pos_day_* 차)의 원천.
--   - th_recent_pieces · th_recent_sec — 서버 등록 임계: 최근 th_recent_sec 초 팀 매수 조각 수 합(A3 체결 조각 · 기본 30 / 60초).
--
-- 적재 · 보고서 RPC 는 바꾸지 않는다:
--   - 적재(20261020200000 limitup_commit_day)는 `INSERT INTO public.limitup_accum_flow SELECT (jsonb_populate_record(NULL::
--     public.limitup_accum_flow, s.payload)).*` — 열 목록 없는 행 타입 위치 대응이다. ADD COLUMN 은 표와 레코드 양쪽 끝에
--     같은 순서로 붙으므로 새 키는 같은 이름 열에 그대로 들어가고, 키가 없는 payload(옛 export)는 NULL 이 된다.
--     본문을 다시 적으면 바이트 동일 재진술이 되고 Pitfall 2(statement_timeout 120s 소실) 위험만 생긴다.
--     선례 = quick-261006-ide(20261006120000_limitup_locks_lock_risk.sql).
--   - 상세(accum_detail_for_user)는 `to_jsonb(a)` 라 새 4키가 row 에 그대로 실린다. 목록(accum_report_for_user ·
--     20261021140000)은 37열 명시 서브쿼리라 그대로 — 당일 축 UI 에서 필요하면 그때 목록에 더한다.
--
-- 권한: 20261020200000 의 표 단위 잠금(RLS 활성 + 정책 0 + anon · authenticated 회수 + service_role 4권한)이 새 열에도
--   그대로 적용된다(열 단위 GRANT 없음). 새 권한 문장을 더하지 않는다.
--
-- 옛 행: 이 열 추가 전 적재 행은 NULL 이다(export 옛 행은 0). gh-trade 가 재생성하면 files_sig 가 바뀌어 다시 적재된다.
-- 주의: 이 마이그레이션 원격 적용 **전에** 새 키가 실린 날짜가 적재되면 jsonb_populate_record 가 모르는 키를 버리고
--   files_sig 는 같아 다시 적재되지 않는다 — 그때는 해당 날짜 limitup_loads.files_sig 를 비워 재적재를 유도한다.
-- 원격 적용: 이 커밋은 파일만 — `supabase db push` 는 메인 세션이 한다.
--
-- 되돌리기: ALTER TABLE public.limitup_accum_flow DROP COLUMN pos_day_buy_krw, DROP COLUMN pos_day_sell_krw,
--   DROP COLUMN th_recent_pieces, DROP COLUMN th_recent_sec;
-- ============================================================

BEGIN;

ALTER TABLE public.limitup_accum_flow
  ADD COLUMN pos_day_buy_krw  bigint,
  ADD COLUMN pos_day_sell_krw bigint,
  ADD COLUMN th_recent_pieces integer,
  ADD COLUMN th_recent_sec    integer;

COMMENT ON COLUMN public.limitup_accum_flow.pos_day_buy_krw  IS '서버 값 — 그날 마지막 이벤트 행(kind 16 snap_qty[2])의 당일 팀 매수 금액(원) · 우리 체결 제외 · 전날 요약의 원천 · day_buy_krw(pcap 하루 전체 · 우리 체결 포함)와 뜻이 다르다 · 이 열 추가 전 적재 행 null';
COMMENT ON COLUMN public.limitup_accum_flow.pos_day_sell_krw IS '서버 값 — 그날 마지막 이벤트 행(kind 16 snap_cum[2])의 당일 팀 매도 금액(원) · 우리 체결 제외 · day_sell_krw 와 뜻이 다르다 · 이 열 추가 전 적재 행 null';
COMMENT ON COLUMN public.limitup_accum_flow.th_recent_pieces IS '서버 등록 임계 — 최근 th_recent_sec 초 팀 매수 조각 수 합(A3 체결 조각 · 기본 30) · 0 = 옛 서버';
COMMENT ON COLUMN public.limitup_accum_flow.th_recent_sec    IS '서버 등록 임계 — 위 창 길이(초 · 기본 60) · 0 = 옛 서버';

COMMIT;

-- PostgREST 스키마 캐시가 새 열을 다시 읽게 한다.
NOTIFY pgrst, 'reload schema';
