---
phase: 07
slug: news-ingestion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 기준 아티팩트: `07-RESEARCH.md §Validation Architecture` (V-01~V-20). planner 가 PLAN.md 의 `acceptance_criteria` 에 그대로 녹인다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` (worker + server + webapp unit) · `@playwright/test` (webapp E2E) |
| **Config file** | `workers/news-sync/vitest.config.ts` (Wave 0 신설) · `server/vitest.config.ts` (기존) · `webapp/vitest.config.ts` (기존) · `webapp/playwright.config.ts` (기존) |
| **Quick run command** | `pnpm -F @gh-radar/<scope> test --run` (대상 워크스페이스만) |
| **Full suite command** | `pnpm -r test --run && pnpm -r typecheck && pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts` |
| **Estimated runtime** | quick ≈ 10–30s · full ≈ 2–3분 (E2E 포함) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -F @gh-radar/<scope> test --run` (현재 플랜 대상 워크스페이스)
- **After every plan wave:** Run `pnpm -r test --run && pnpm -r typecheck`
- **Before `/gsd-verify-work`:** Full suite + `gcloud run jobs execute gh-radar-news-sync --wait` smoke + Supabase `news_articles` 행 증가 확인
- **Max feedback latency:** 30s (quick) · 180s (full)

---

## Per-Task Verification Map

> Wave/Plan 번호는 planner 가 확정. 아래는 NEWS-01 요구사항을 연구 §Validation Architecture(V-01~V-20) 매핑으로 제시 — planner 가 task 로 분해하며 `<acceptance_criteria>` 에 그대로 인용.

| V-ID | Behavior / 결정 | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|-----------------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| V-01 | `api_usage` 테이블 + RLS(service_role only) | NEWS-01(3) | T-06 | 비service_role INSERT 거부 | SQL | `psql ... "INSERT INTO api_usage ..." as anon → 42501` | ❌ W0 | ⬜ pending |
| V-02 | `incr_api_usage(service, date, amount)` RPC atomic 증가 | NEWS-01(3) | T-04, T-06 | 동시 10회 호출 → count +10 정확 | vitest integration | `pnpm -F @gh-radar/news-sync test -- apiUsage.test.ts -g "concurrent"` | ❌ W0 | ⬜ pending |
| V-03 | `news_articles.idx_news_created_at` 존재 | NEWS-01(3) | — | retention/cooldown query 가 Seq Scan 아님 | SQL | `psql ... "SELECT indexname FROM pg_indexes WHERE tablename='news_articles'" grep idx_news_created_at` | ❌ W0 | ⬜ pending |
| V-04 | `stripHtml` — `<b>`/`&quot;`/`&#39;`/`&amp;` 제거 & decode | NEWS-01(2) | T-03 | `<b>삼성` → `삼성` · `&quot;` → `"` | vitest unit | `pnpm -F @gh-radar/shared test -- news-sanitize.test.ts -g "stripHtml"` | ❌ W0 | ⬜ pending |
| V-05 | `parsePubDate(rfc822)` → ISO UTC timestamptz | NEWS-01(2) | — | `'Fri, 17 Apr 2026 14:32:00 +0900'` → `'2026-04-17T05:32:00.000Z'` | vitest unit | `pnpm -F @gh-radar/shared test -- news-sanitize.test.ts -g "parsePubDate"` | ❌ W0 | ⬜ pending |
| V-06 | `extractSourcePrefix(url)` — 도메인 prefix + naver special-case | NEWS-01(2) | — | `hankyung.com` → `hankyung` · `n.news.naver.com` → `naver` · `news.mt.co.kr` → `mt` | vitest unit | `pnpm -F @gh-radar/shared test -- news-sanitize.test.ts -g "sourcePrefix"` | ❌ W0 | ⬜ pending |
| V-07 | URL protocol whitelist (`http`/`https` 외 reject) | NEWS-01(2) | T-02 | `javascript:alert(1)` → `null` / skip | vitest unit + E2E | `pnpm -F @gh-radar/news-sync test -- map.test.ts -g "protocol"` | ❌ W0 | ⬜ pending |
| V-08 | Naver API client — secret header 전송 | NEWS-01(3) | T-01, T-09 | `X-Naver-Client-Id` + `X-Naver-Client-Secret` 헤더 · `https://` 강제 | vitest integration (nock/msw) | `pnpm -F @gh-radar/news-sync test -- naver.test.ts -g "headers"` | ❌ W0 | ⬜ pending |
| V-09 | `news-sync` budget 선제 체크 — 잔여 < margin 이면 fetch skip | NEWS-01(3) | T-04 | budget=24500 · used=24490 · stocks=200 → fetch count=0 | vitest integration | `pnpm -F @gh-radar/news-sync test -- pipeline.test.ts -g "budget exhaustion"` | ❌ W0 | ⬜ pending |
| V-10 | UPSERT ON CONFLICT DO NOTHING — 동일 (stock_code,url) 재수집 skip | NEWS-01(2) | T-08 | 2회 수집 → DB rows 증가 0 + `created_at` 불변 | vitest integration | `pnpm -F @gh-radar/news-sync test -- upsert.test.ts -g "idempotent"` | ❌ W0 | ⬜ pending |
| V-11 | Retention — 90일 초과 행 삭제 | NEWS-01(3) | — | seed 3 행(old/border/new) → DELETE 후 1행 남음 | vitest integration | `pnpm -F @gh-radar/news-sync test -- retention.test.ts` | ❌ W0 | ⬜ pending |
| V-12 | logger redact — secret/service-role key log 노출 금지 | — | T-01, T-07 | `logger.info({ cfg })` → `[Redacted]` 출력 | vitest unit | `pnpm -F @gh-radar/news-sync test -- logger.test.ts` | ❌ W0 | ⬜ pending |
| V-13 | `GET /api/stocks/:code/news` Zod clamp (days ≤ 7, limit ≤ 100) | NEWS-01(1) | T-05 | `?days=30&limit=500` → 200 + body `days=7, limit=100` | vitest integration (supertest) | `pnpm -F @gh-radar/server test -- news.test.ts -g "clamp"` | ❌ W0 | ⬜ pending |
| V-14 | `POST /:code/news/refresh` cooldown 30s → 429 + `retry_after_seconds` | NEWS-01(3) | T-04, T-05 | 2번째 연속 호출 → 429 · body `{ error: { code: 'NEWS_REFRESH_COOLDOWN', retry_after_seconds: <=30 } }` · `Retry-After` 헤더 존재 | vitest integration | `pnpm -F @gh-radar/server test -- news.test.ts -g "cooldown"` | ❌ W0 | ⬜ pending |
| V-15 | 잘못된 `code` 파라미터 400 | NEWS-01(1) | T-07 | `/api/stocks/XYZ/news` → 400 | vitest integration | `pnpm -F @gh-radar/server test -- news.test.ts -g "invalid code"` | ❌ W0 | ⬜ pending |
| V-16 | CORS `exposedHeaders: Retry-After` | NEWS-01(3) | — | preflight OPTIONS response Access-Control-Expose-Headers 에 `Retry-After` 포함 | vitest integration | `pnpm -F @gh-radar/server test -- cors.test.ts -g "Retry-After"` | ❌ W0 | ⬜ pending |
| V-17 | 상세 페이지 뉴스 섹션 렌더 — 5개 + 더보기 | NEWS-01(1),(2) | T-02 | E2E: `/stocks/005930` → `[data-testid="news-item"]` 5개 + `<a href="/stocks/005930/news">`. 각 `<a target="_blank" rel="noopener noreferrer">` | Playwright | `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts -g "detail list"` | ❌ W0 | ⬜ pending |
| V-18 | `/stocks/[code]/news` 전체 페이지 — 7일, 하드캡 100 | NEWS-01(1),(2) | T-02 | `news-list > li` 개수 ≤ 100 · 각 항목 제목/출처/날짜/링크 표시 · 타이틀 좌측 `←` 링크 | Playwright | `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts -g "full page"` | ❌ W0 | ⬜ pending |
| V-19 | 수동 새로고침 쿨다운 UX — 버튼 disabled + 카운트다운 | NEWS-01(3) | T-05 | 첫 클릭 정상 · 30초 이내 재클릭 → 429 수신 → 버튼 aria-disabled + `data-remaining-seconds` ≤ 30 | Playwright | `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts -g "refresh cooldown"` | ❌ W0 | ⬜ pending |
| V-20 | Axe 접근성 — 외부 링크 name, 새로고침 버튼 aria-label, 빈 상태 role | — | — | Axe-core scan violations = 0 (serious/critical) | Playwright + `@axe-core/playwright` | `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts -g "a11y"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `workers/news-sync/vitest.config.ts` + `workers/news-sync/tests/helpers/` — Naver API nock/msw fixture (응답 JSON 샘플 20건)
- [ ] `packages/shared/src/__tests__/news-sanitize.test.ts` — `stripHtml` / `parsePubDate` / `extractSourcePrefix` 스텁 → V-04/V-05/V-06
- [ ] `server/src/__tests__/news.test.ts` — supertest + msw fixture → V-13/V-14/V-15
- [ ] `webapp/e2e/news.spec.ts` — Playwright 스펙 스텁 (`list`, `full page`, `refresh cooldown`, `a11y`) → V-17/V-18/V-19/V-20
- [ ] `webapp/e2e/fixtures/mock-api.ts` — `GET /api/stocks/:code/news` + `POST /refresh` mock 추가
- [ ] `@axe-core/playwright` 설치 확인(미설치 시 추가) + `tests/a11y-helper.ts` 헬퍼
- [ ] `workers/news-sync/tests/helpers/supabase-mock.ts` — Supabase JS SDK 모킹 공용 모듈 (master-sync 패턴 미러)

*각 스텁은 Wave 0 에서 `test.todo()` 로 생성 → Wave 1+ 에서 구현이 채워지며 자연스럽게 green 으로 전환.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Naver API 실제 응답 smoke | NEWS-01(2),(3) | 실제 Naver 서비스 상태 의존 | `gcloud run jobs execute gh-radar-news-sync --wait` 후 `SELECT count(*) FROM news_articles WHERE created_at > now() - interval '5 minutes'` 1 이상 확인 |
| Cloud Run Job 스케줄러 15분 주기 동작 | NEWS-01(3) | Cloud Scheduler 상태 의존 | `gcloud scheduler jobs describe gh-radar-news-sync-scheduler --location=asia-northeast3` → `state: ENABLED`, `schedule: */15 * * * *` 확인 · 2회 tick 후 로그 증가 확인 |
| GCP Secret Manager 접근 권한 | NEWS-01(3) | 외부 권한 정책 | `gcloud secrets versions access latest --secret=gh-radar-naver-client-id` 성공 + news-sync SA 외 접근 거부 |
| KST 일자 경계 카운터 reset | NEWS-01(3) | 시간 경계 수동 검증 | KST 23:55 / 00:05 두 시점에 `api_usage` row 비교 → 새 `usage_date` row 생성 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (V-01~V-20 전부)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick) / 180s (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
