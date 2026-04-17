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

**상태 (Plan 07-06):** 여전히 미해결. Plan 07-02 에서 REVOKE 추가가 누락됐고, 본 Plan 7-06 는
API/Scheduler/E2E 배포가 주목적이라 DB 마이그레이션 추가는 scope out. 실제 피해는 여전히 없음
(api_usage 테이블 자체는 RLS 로 anon/authenticated deny + worker 만 service_role 로 호출).
후속 Plan 또는 Phase 8 워크에서 아래 마이그레이션 추가 필요:
```sql
REVOKE ALL ON FUNCTION incr_api_usage(text, date, int) FROM anon, authenticated;
```

---

## DI-02: `scripts/smoke-master-sync.sh` INV-4 헤더 파싱 CR 제거 누락

**발견 위치:** Plan 07-06 Task 3 (news-sync smoke 작성 중 동일 패턴 비교)

**현상:**
- `scripts/smoke-master-sync.sh:71` 의 `TOTAL=$(echo "$RANGE_HEADER" | grep -oE '[0-9]+$')`
  는 `content-range: 0-868/869\r` 의 trailing CR 때문에 `[0-9]+$` regex 매칭에 실패해
  TOTAL 이 빈 문자열이 된다. 그 결과 INV-4 stocks count 체크가 항상 FAIL.
- 실제 stocks 테이블에는 2800+ row 존재 (REST 쿼리로 확인) — 데이터는 정상.
- 현재 master-sync 스모크는 이 invariant 가 silent FAIL 이지만 다른 INV 이 PASS 하므로
  일상 운영에는 거의 드러나지 않음 (단, CI 에서 master-sync 배포 검증을 자동화할 때 걸림).

**해결:**
- `grep -i 'content-range' | tr -d '\r'` 로 파이프 확장 (본 Plan news-sync smoke 에서는 이미 적용).
- 별도 PR 로 master-sync smoke 에도 동일 fix 적용 필요.

**우선순위:** Medium (master-sync 배포 검증 정상화 필요, 실 데이터 문제는 아님)

---
