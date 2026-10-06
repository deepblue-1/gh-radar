-- ============================================================
-- quick-261006-ide — `limitup_locks` 에 잠김 누적 매도 · 취소 · 위험도 6열을 더한다(스케치 012-A 보고서 요약 칩).
--
-- 왜: gh-trade ea8d9171(quick-261006-f1j)이 밤 export `locks.ndjson.gz` 에 새 키 6개를 실었다.
--   - sell_krw · cancel_krw — 그 잠김의 누적 매도 주도 상한가 체결 금액 · 상한가 매수잔량 취소 금액 합(원 정수).
--   - risk_3s · risk_10s · risk_60s — 잠김 시작 +3 / +10 / +60초 시점 위험도.
--   - risk_pre — 깨짐(또는 장 끝까지 유지면 끝) −3초 시점 위험도.
--   위험도 = 그 시점까지 누적 매도 ÷ 그 시점 q_krw, **소수**(0.36 = 36%) — 100% 초과면 1 보다 크다.
--   잠김 밖이거나 q_krw 0 이면 null. 판정 임계가 아니라 비율 수치다.
--
-- 적재 · 보고서 RPC 는 바꾸지 않는다:
--   - 적재(20261006090200 limitup_commit_day)는 `INSERT INTO public.limitup_locks SELECT (jsonb_populate_record(NULL::
--     public.limitup_locks, s.payload)).*` — 열 목록 없는 위치 대응이다. ADD COLUMN 은 표와 레코드 양쪽 끝에 같은 순서로
--     붙으므로 새 키는 같은 이름 열에 그대로 들어가고, 키가 없는 payload(옛 export)는 null 이 된다.
--   - 보고서(20261006090400 limitup_report_for_user)는 `to_jsonb(l)` 이라 새 6키가 day.locks 원소에 그대로 실린다.
--
-- 권한: 20261006090100 의 표 단위 잠금(RLS 활성 + 정책 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT)이
--   새 열에도 그대로 적용된다(열 단위 GRANT 없음). 새 GRANT · POLICY 를 더하지 않는다.
--
-- 옛 날짜 행은 6열이 null 이다. gh-trade 가 재export 하면 files_sig 가 바뀌어 limitup-sync 가 그 날짜를 다시 적재한다.
-- 주의: 이 마이그레이션 **전에** 새 키가 실린 날짜가 적재되면 jsonb_populate_record 가 모르는 키를 버리고 files_sig 는
--   같아 다시 적재되지 않는다 — 그때는 해당 날짜 limitup_loads.files_sig 를 비워 재적재를 유도한다.
--
-- 되돌리기: ALTER TABLE public.limitup_locks DROP COLUMN sell_krw, DROP COLUMN cancel_krw, DROP COLUMN risk_3s,
--   DROP COLUMN risk_10s, DROP COLUMN risk_60s, DROP COLUMN risk_pre;
-- ============================================================

BEGIN;

ALTER TABLE public.limitup_locks
  ADD COLUMN sell_krw   bigint,
  ADD COLUMN cancel_krw bigint,
  ADD COLUMN risk_3s    double precision,
  ADD COLUMN risk_10s   double precision,
  ADD COLUMN risk_60s   double precision,
  ADD COLUMN risk_pre   double precision;

COMMENT ON COLUMN public.limitup_locks.sell_krw   IS '그 잠김 누적 매도 주도 상한가 체결 금액(원) — gh-trade ea8d9171 · 옛 날짜 null';
COMMENT ON COLUMN public.limitup_locks.cancel_krw IS '그 잠김 상한가 매수잔량 취소 금액(원, 하한) — gh-trade ea8d9171 · 옛 날짜 null';
COMMENT ON COLUMN public.limitup_locks.risk_3s    IS '잠김 시작 +3초 위험도(누적 매도 ÷ q_krw, 소수 — 100% 초과면 1 초과) · 잠김 밖/q_krw 0 이면 null';
COMMENT ON COLUMN public.limitup_locks.risk_10s   IS '잠김 시작 +10초 위험도(소수) · 잠김 밖/q_krw 0 이면 null';
COMMENT ON COLUMN public.limitup_locks.risk_60s   IS '잠김 시작 +60초 위험도(소수) · 잠김 밖/q_krw 0 이면 null';
COMMENT ON COLUMN public.limitup_locks.risk_pre   IS '깨짐(유지면 끝) −3초 위험도(소수) · q_krw 0 이면 null';

COMMIT;

-- PostgREST 스키마 캐시가 새 열을 다시 읽게 한다.
NOTIFY pgrst, 'reload schema';
