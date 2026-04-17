# Phase 07 — Deferred Items

Discovered during execution but out of current task scope. Each item lists the source task, context, and proposed follow-up.

---

## DI-01: Supabase 플랫폼 자동 GRANT 가 `incr_api_usage` RPC REVOKE 를 덮어씀

**발견 위치:** Plan 07-01 Task 4 (supabase db push 후 `supabase db dump` 검증 중)

**현상:**
- 마이그레이션은 `REVOKE ALL ON FUNCTION incr_api_usage(text, date, int) FROM PUBLIC;` + `GRANT EXECUTE ... TO service_role;` 를 명시.
- 그러나 `supabase db dump` 결과:
  ```
  REVOKE ALL ON FUNCTION "public"."incr_api_usage"(...) FROM PUBLIC;
  GRANT ALL  ON FUNCTION "public"."incr_api_usage"(...) TO "anon";
  GRANT ALL  ON FUNCTION "public"."incr_api_usage"(...) TO "authenticated";
  GRANT ALL  ON FUNCTION "public"."incr_api_usage"(...) TO "service_role";
  ```
- 원인: Supabase 는 `public` 스키마에 생성되는 모든 함수/테이블에 `anon/authenticated/service_role` 로 기본 `GRANT ALL` 을 자동 부여하는 플랫폼 디폴트가 있음. (기존 `enforce_watchlist_limit`, `update_stocks_updated_at` 등 모든 함수에 동일 패턴 관찰.)

**영향 (T-06 재평가):**
- 테이블 `api_usage` 는 RLS enabled + 정책 0개 → anon/authenticated 는 테이블 직접 SELECT/INSERT/UPDATE/DELETE 모두 차단됨 (GRANT 가 있어도 RLS 가 먼저 deny). ✅ 안전.
- RPC `incr_api_usage` 는 `SECURITY DEFINER` + 자동 GRANT → anon/authenticated 가 **RPC 호출 가능** → 카운터 bump 가능 (T-06 partial mitigation).
- 단, RPC 는 count 를 증가만 시키고 반환값(잔여량)을 공개. 실제 Naver 호출은 worker 가 service_role 로 수행하므로 공격자는 "쿼터를 고갈시키는" DoS 는 불가 (worker 가 호출 여부를 결정). 다만 **카운터 숫자 위변조** 가능성은 있음.

**제안 follow-up:**
- Plan 07-02 (news-sync worker) 작성 시, 마이그레이션 끝에 추가 REVOKE 를 명시:
  ```sql
  -- Supabase 자동 GRANT 상쇄
  REVOKE ALL ON FUNCTION incr_api_usage(text, date, int) FROM anon, authenticated;
  ```
- 또는 함수 스키마를 `internal` 로 이동 (Supabase 가 public 외 스키마엔 auto-grant 안 함).
- 본 Plan 범위엔 worker 코드가 없으므로 defer.

**우선순위:** Low (현재 미치는 실제 피해 없음, Plan 07-02 시작 시 해결)

---
