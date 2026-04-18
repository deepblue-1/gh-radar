# Phase 08 — Deferred Items

본 파일은 Phase 08 실행 중 발견되었으나 현 plan 범위 밖으로 판단되어 후속 plan 또는 별도 patch 로 이관한 항목 목록.

---

## [08-02 regression] worker 의 UPSERT 가 DB 스키마에 없는 url 컬럼 포함 — ✅ RESOLVED 2026-04-18

- **해결:** (Wave 2 진입 전 inline fix 커밋) `workers/discussion-sync/src/pipeline/map.ts` `DiscussionRow` 에서 `url` 필드 제거. `isAllowedUrl(item.url)` 검증(T-07 open-redirect 방어)은 유지. 59 tests green. server mapper 와 대칭 (DB 에 url 컬럼 없고 stock_code+post_id 로 재구성).
- **발견 시점:** Plan 08-03 SUMMARY 작성 중 (08-02 회귀 검토)
- **위치:**
  - `workers/discussion-sync/src/pipeline/map.ts` — `DiscussionRow.url: string` 필드 존재
  - `workers/discussion-sync/src/pipeline/upsert.ts` — `supabase.from("discussions").upsert(rows, ...)` 가 url 을 그대로 INSERT
- **문제:**
  - DB 스키마 `supabase/migrations/20260413120000_init_tables.sql:58-71` 의 `discussions` 테이블에 `url` 컬럼이 **없음**.
  - 실제 production Cloud Run Job 실행 시 PostgreSQL 이 `column "url" does not exist` 로 INSERT 거부할 가능성.
  - Plan 08-02 의 테스트는 mock 기반이므로 unit/integration 수준에서는 잡히지 않음.
- **영향 범위:**
  - server route (Plan 08-03) 는 영향 없음 — UPSERT payload 에서 url 제외하고 응답 mapper 가 결정적 재구성.
  - worker 는 production 실행 시 실패 가능.
- **해결 옵션 (후속 plan 이 택일):**
  1. **worker fix (권장):** `workers/discussion-sync/src/pipeline/map.ts` 의 `DiscussionRow` 에서 url 제거, upsert payload 도 url 미포함. 응답/consumer 는 server mapper 와 동일하게 stock_code+post_id 로 URL 재구성.
  2. **스키마 추가:** 마이그레이션으로 `discussions.url TEXT` 컬럼 추가. 단 이 경우 server mapper 는 DB url 을 그대로 사용하도록 변경해야 함 (양측 동기화 필요).
- **우선순위:** Plan 08-06 (deploy-and-e2e) smoke 시 발견되기 전에 fix 권장. **Blocking** for production worker execution.
- **담당:** Phase 08 Wave 3 이후 후속 patch 또는 Plan 08-06 작업자 재량.
