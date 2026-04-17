-- ============================================================
-- Phase 07 Plan 01 — Naver Search API 호출 카운터.
-- service_role 만 접근 (RLS 활성 + 정책 0개 = anon/authenticated 전면 deny, service_role bypass).
--
-- 결정 근거:
--   T-06 mitigation: RLS enable + 0 정책 → 쓰기/읽기 모두 service_role 만 허용.
--   T-08 mitigation: RPC 는 SECURITY DEFINER + SET search_path = public + 파라미터화 (동적 SQL 금지).
--   RESEARCH §4 (Section "호출 카운터 저장소") 스펙 그대로.
-- ============================================================

CREATE TABLE api_usage (
  service     text        NOT NULL,
  usage_date  date        NOT NULL,
  count       bigint      NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service, usage_date)
);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
-- 정책 미생성 — anon/authenticated 는 전면 deny, service_role 은 RLS bypass.

-- Atomic increment + 누적 count 반환.
CREATE OR REPLACE FUNCTION incr_api_usage(p_service text, p_date date, p_amount int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_count bigint;
BEGIN
  INSERT INTO api_usage(service, usage_date, count, updated_at)
    VALUES (p_service, p_date, p_amount, now())
    ON CONFLICT (service, usage_date)
    DO UPDATE SET count = api_usage.count + p_amount, updated_at = now()
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION incr_api_usage(text, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION incr_api_usage(text, date, int) TO service_role;
