---
plan: 07-06
phase: 07
type: execute
wave: 3
depends_on: [07-02, 07-03, 07-04, 07-05]
requirements: [NEWS-01]
files_modified:
  - scripts/setup-news-sync-iam.sh
  - scripts/deploy-news-sync.sh
  - scripts/smoke-news-sync.sh
  - webapp/e2e/specs/news.spec.ts
  - webapp/e2e/fixtures/mock-api.ts
  - .planning/phases/07-news-ingestion/DEPLOY-LOG.md
autonomous: false
threat_refs: [T-01, T-04, T-02, T-03]

must_haves:
  truths:
    - "Cloud Run Job gh-radar-news-sync 이 GCP 에 존재하고 정상 실행된다 (--wait exit 0)"
    - "Cloud Scheduler 2개 (`gh-radar-news-sync-intraday` */15 9-15 * * 1-5 + `gh-radar-news-sync-offhours` 0 */2 * * *) 가 동일 Job 을 트리거한다 (R6)"
    - "SA gh-radar-news-sync-sa 가 NAVER_CLIENT_ID/SECRET + SUPABASE_SERVICE_ROLE Secret Accessor 권한을 가진다"
    - "SA gh-radar-server-sa 가 NAVER_CLIENT_ID/SECRET Secret Accessor 권한을 가진다 (scripts/setup-news-sync-iam.sh 한 번 실행으로 5건 accessor 모두 자동 부여)"
    - "server 배포에 NAVER_CLIENT_ID/SECRET env 가 mount 되어 POST /refresh 가 503 NAVER_UNAVAILABLE 이 아닌 정상 응답"
    - "Playwright E2E news.spec.ts 4개 시나리오가 모두 그린"
    - "axe-core 접근성 스캔 0 violation (serious/critical)"
  artifacts:
    - path: "scripts/setup-news-sync-iam.sh"
      provides: "SA + Secret + Accessor 5건(news-sync 3 + server 2) 세팅"
      min_lines: 80
    - path: "scripts/deploy-news-sync.sh"
      provides: "Cloud Run Job + Scheduler 배포"
      min_lines: 80
    - path: "scripts/smoke-news-sync.sh"
      provides: "배포 후 invariants 검증"
      min_lines: 40
    - path: "webapp/e2e/specs/news.spec.ts"
      provides: "V-17/V-18/V-19/V-20 concrete 테스트"
      min_lines: 120
    - path: ".planning/phases/07-news-ingestion/DEPLOY-LOG.md"
      provides: "배포 결과 기록"
      min_lines: 20
  key_links:
    - from: "Cloud Scheduler gh-radar-news-sync-intraday (*/15 9-15 * * 1-5 KST)"
      to: "Cloud Run Job gh-radar-news-sync"
    - from: "Cloud Scheduler gh-radar-news-sync-offhours (0 */2 * * * KST)"
      to: "Cloud Run Job gh-radar-news-sync"
      via: "OAuth invoker"
      pattern: "oauth-service-account"
    - from: "Playwright news.spec.ts"
      to: "webapp/e2e/fixtures/news.ts (Plan 07-01 산출 재사용)"
      via: "mockNewsApi"
      pattern: "mockNewsApi"
---

<objective>
Phase 7 전체를 프로덕션에 배포하고 E2E 로 검증한다:
1) news-sync Cloud Run Job + Scheduler 배포 (master-sync 템플릿 미러)
2) server 재배포 — NAVER_CLIENT_ID/SECRET env mount 추가
3) Playwright news.spec.ts concrete 구현 (Plan 01 스텁의 test.skip → 실제 시나리오). **fixture 파일(webapp/e2e/fixtures/news.ts) 은 Plan 07-01 이 생성한 camelCase 샘플을 그대로 재사용 — 덮어쓰기 금지.** mock-api.ts 만 패치.
4) smoke + DEPLOY-LOG 기록

Purpose: NEWS-01 의 운영 활성화. 이 plan 이 완료되어야 트레이더가 실제 데이터를 볼 수 있다.
Output: GCP 리소스 2개(Job + Scheduler) + IAM 바인딩 5건(setup 스크립트 일괄) + server 재배포 + 4 E2E spec + DEPLOY-LOG.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/07-news-ingestion/07-CONTEXT.md
@.planning/phases/07-news-ingestion/07-RESEARCH.md
@.planning/phases/07-news-ingestion/07-VALIDATION.md

@scripts/setup-master-sync-iam.sh
@scripts/deploy-master-sync.sh
@scripts/smoke-master-sync.sh
@scripts/deploy-server.sh
@webapp/playwright.config.ts
@webapp/e2e/auth.setup.ts
@webapp/e2e/specs/stock-detail.spec.ts
@webapp/e2e/fixtures/mock-api.ts
@webapp/e2e/fixtures/news.ts

<interfaces>
Cloud Run Job 배포 리소스 (RESEARCH §5 명시):
- Job 이름: `gh-radar-news-sync`
- Region: `asia-northeast3`
- Memory: 512Mi, task-timeout 600s, max-retries 1, parallelism 1
- Image: `asia-northeast3-docker.pkg.dev/${GCP_PROJECT_ID}/gh-radar/news-sync:${GIT_SHA}`
- ENV: `SUPABASE_URL, NAVER_BASE_URL, NAVER_DAILY_BUDGET, NEWS_SYNC_CONCURRENCY, LOG_LEVEL, APP_VERSION`
- Secrets (--set-secrets):
  `SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest`
  `NAVER_CLIENT_ID=gh-radar-naver-client-id:latest`
  `NAVER_CLIENT_SECRET=gh-radar-naver-client-secret:latest`
- SA: `gh-radar-news-sync-sa@${PROJECT}.iam.gserviceaccount.com`

Server Cloud Run service SA (Phase 2 배포에서 확정된 기존값):
- `gh-radar-server-sa@${PROJECT}.iam.gserviceaccount.com`
- 본 plan 이 이 SA 에 Naver secret accessor 2건을 추가 (setup-news-sync-iam.sh 안에서)

Cloud Scheduler (R6 — **2개 분리 운영**):
- 이름 ①: `gh-radar-news-sync-intraday` — schedule `*/15 9-15 * * 1-5` (장중 평일 KST)
- 이름 ②: `gh-radar-news-sync-offhours` — schedule `0 */2 * * *` (장외 전시간 KST, 2시간 주기)
- 두 scheduler 모두 동일 Cloud Run Job(`gh-radar-news-sync`) 을 POST 로 트리거. 시간대 겹침 구간에서 중복 실행돼도 ON CONFLICT DO NOTHING 이 흡수
- (참고) 기존 단일 scheduler 이름 `gh-radar-news-sync-scheduler` 은 사용하지 않음
- Location: `asia-northeast3`
- Schedule (각각): intraday = `*/15 9-15 * * 1-5`, offhours = `0 */2 * * *` (time-zone `Asia/Seoul`)
- Target: Cloud Run Job invoker (OAuth — `gh-radar-scheduler-sa`, OIDC 금지 / Pitfall 2)

server 재배포 (scripts/deploy-server.sh):
- 추가 env: NAVER_BASE_URL, NAVER_DAILY_BUDGET
- 추가 secrets: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET

Playwright 기존 auth fixture (webapp/e2e/auth.setup.ts) 재사용.

Plan 07-01 Task 3 이 이미 생성한 fixture (**본 plan 에서 덮어쓰기 금지**):
- `webapp/e2e/fixtures/news.ts` — camelCase `NEWS_ITEM_SAMPLE` + `buildNewsList` + `mockNewsApi` export 완비. 서버 mapper(Plan 07-03) 응답 shape 과 일치.
- `webapp/e2e/fixtures/mock-api.ts` — `export { mockNewsApi, buildNewsList, NEWS_ITEM_SAMPLE } from './news';` 재-export 포함.
→ 본 plan 의 Task 1 은 fixture 를 재정의하지 않고 **import 해서 사용**만 한다.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Playwright E2E concrete 구현 (V-17/V-18/V-19/V-20) — Plan 07-01 fixture 재사용</name>
  <files>
    webapp/e2e/specs/news.spec.ts,
    webapp/e2e/fixtures/mock-api.ts
  </files>
  <read_first>
    - webapp/e2e/specs/news.spec.ts (Plan 01 스텁 — test.skip 4개)
    - webapp/e2e/fixtures/news.ts (Plan 01 Task 3 산출 — camelCase fixture — **수정 금지, import 만**)
    - webapp/e2e/fixtures/mock-api.ts (기존 패턴 — news re-export 가 이미 있는지 grep 으로 확인)
    - webapp/e2e/specs/stock-detail.spec.ts (기존 패턴 — auth fixture 사용 + route mock)
    - webapp/e2e/auth.setup.ts (storageState 위치)
    - webapp/playwright.config.ts (axe 설치 여부 확인 — 미설치 시 install 필요)
    - .planning/phases/07-news-ingestion/07-VALIDATION.md V-17/V-18/V-19/V-20
    - .planning/phases/07-news-ingestion/07-UI-SPEC.md §Accessibility Contract
    - packages/shared/src/news.ts (camelCase NewsArticle — fixture 의 필드명과 일치해야 함)
  </read_first>
  <behavior>
    V-17 (detail list): /stocks/005930 방문 → 뉴스 섹션 5 items + 더보기 링크 + 각 &lt;a&gt; 가 target=_blank + rel 에 noopener 와 noreferrer 포함
    V-18 (full page): /stocks/005930/news 방문 → &lt;li data-testid="news-item"&gt; count ≤ 100, ← 링크 클릭 시 /stocks/005930 로 이동
    V-19 (refresh cooldown): 첫 refresh 클릭 → 2번째 클릭 시 429 mock → 버튼 disabled + `data-remaining-seconds` attribute 존재 (≤30)
    V-20 (a11y): @axe-core/playwright 로 뉴스 섹션 스캔 → violations 중 serious/critical 0

    **fixture 재정의 금지.** 본 task 는 `webapp/e2e/fixtures/news.ts` 를 수정하지 않는다. Plan 07-01 Task 3 이 이미 camelCase 샘플을 생성했으며, Plan 07-03 의 server mapper 가 동일 camelCase 응답을 반환한다. files_modified 에서 news.ts 는 제외 — mock-api.ts 만 패치 (이미 Plan 07-01 에서 re-export 라인이 추가됐다면 noop, 누락 시 한 줄 보정).

    mock-api.ts: 기존 export 유지하면서 NEWS mock 통합 사용 — `grep -q "mockNewsApi" webapp/e2e/fixtures/mock-api.ts` 가 이미 1 이상이어야 한다. 0 이면 한 줄 `export { mockNewsApi, buildNewsList, NEWS_ITEM_SAMPLE } from './news';` 추가 (확인만, 대부분 noop).

    news.spec.ts: Plan 07-01 fixture 의 `mockNewsApi` / `buildNewsList` 을 import 해서 그대로 사용. Refresh 횟수 카운트 등 추가 상태가 필요한 테스트는 spec 내부에 route 핸들러를 직접 작성하되, 샘플 데이터는 `buildNewsList(code, n)` 로부터 생성해 camelCase 계약을 유지한다.
  </behavior>
  <action>
    먼저 `@axe-core/playwright` 설치 확인:
    ```bash
    cd webapp && pnpm add -D @axe-core/playwright
    ```
    (이미 설치돼 있으면 skip — `grep '@axe-core/playwright' webapp/package.json` 확인)

    `webapp/e2e/fixtures/news.ts` — **수정하지 않는다.** Plan 07-01 Task 3 이 생성한 camelCase 샘플 그대로 재사용. 본 task 의 files_modified 목록에도 news.ts 는 포함되지 않음. (재정의 금지 — 덮어쓰면 Plan 07-01 의 `grep -q "stockCode" webapp/e2e/fixtures/news.ts` acceptance criteria 가 불안정해질 수 있음.)

    `webapp/e2e/fixtures/mock-api.ts` — 확인만:
    - `grep -q "mockNewsApi" webapp/e2e/fixtures/mock-api.ts` 이 1 match 여야 함.
    - 없으면 한 줄 `export { mockNewsApi, buildNewsList, NEWS_ITEM_SAMPLE } from './news';` 추가 (Plan 07-01 에서 이미 처리됐을 가능성이 높음).

    `webapp/e2e/specs/news.spec.ts` — test.skip 을 concrete 로 교체. Plan 07-01 fixture 의 `mockNewsApi` / `buildNewsList` 을 직접 import:

    ```ts
    import { test, expect } from '@playwright/test';
    import AxeBuilder from '@axe-core/playwright';
    import { mockNewsApi, buildNewsList } from '../fixtures/news';

    // 기존 auth fixture 재사용 (webapp/e2e/auth.setup.ts 가 생성한 storageState)
    test.use({ storageState: 'playwright/.auth/user.json' });

    const STOCK_CODE = '005930';

    async function mockStockDetail(page: import('@playwright/test').Page) {
      await page.route(`**/api/stocks/${STOCK_CODE}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: STOCK_CODE,
            name: '삼성전자',
            market: 'KOSPI',
            price: 70000,
            changeAmount: 1500,
            changeRate: 2.19,
            volume: 12345678,
            tradeAmount: 123456789000,
            open: 68500,
            high: 70200,
            low: 68500,
            marketCap: 4_500_000_000_000_000,
            upperLimit: 89000,
            lowerLimit: 48000,
            updatedAt: new Date().toISOString(),
          }),
        }),
      );
    }

    test.describe('News — detail list (V-17, external link security)', () => {
      test('renders 5 news items + 전체 뉴스 보기 link', async ({ page }) => {
        await mockStockDetail(page);
        await mockNewsApi(page, { code: STOCK_CODE, list: buildNewsList(STOCK_CODE, 5) });

        await page.goto(`/stocks/${STOCK_CODE}`);
        await expect(page.getByTestId('stock-news-section')).toBeVisible();
        const items = page.getByTestId('news-item');
        await expect(items).toHaveCount(5);
        await expect(page.getByRole('link', { name: /전체 뉴스 보기/ })).toHaveAttribute(
          'href',
          `/stocks/${STOCK_CODE}/news`,
        );
      });

      test('items have target="_blank" rel containing noopener noreferrer', async ({ page }) => {
        await mockStockDetail(page);
        await mockNewsApi(page, { code: STOCK_CODE, list: buildNewsList(STOCK_CODE, 3) });

        await page.goto(`/stocks/${STOCK_CODE}`);
        const firstLink = page.getByTestId('news-item').first().locator('a').first();
        await expect(firstLink).toHaveAttribute('target', '_blank');
        const rel = (await firstLink.getAttribute('rel')) ?? '';
        expect(rel).toMatch(/noopener/);
        expect(rel).toMatch(/noreferrer/);
      });
    });

    test.describe('News — full page (V-18)', () => {
      test('renders all items (mock 50) on /news with ← back link', async ({ page }) => {
        await mockStockDetail(page);
        await mockNewsApi(page, { code: STOCK_CODE, list: buildNewsList(STOCK_CODE, 50) });

        await page.goto(`/stocks/${STOCK_CODE}/news`);
        await expect(page.getByRole('heading', { level: 1, name: /최근 7일 뉴스/ })).toBeVisible();
        const items = page.getByTestId('news-item');
        await expect(items).toHaveCount(50);

        const backLink = page.getByRole('link', { name: '종목 상세로 돌아가기' });
        await backLink.click();
        await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}$`));
      });

      test('caps list at server-provided limit (mock provides ≤100)', async ({ page }) => {
        await mockStockDetail(page);
        await mockNewsApi(page, { code: STOCK_CODE, list: buildNewsList(STOCK_CODE, 100) });

        await page.goto(`/stocks/${STOCK_CODE}/news`);
        const count = await page.getByTestId('news-item').count();
        expect(count).toBeLessThanOrEqual(100);
      });
    });

    test.describe('News — refresh cooldown (V-19)', () => {
      test('refresh button → 429 cooldown → button disabled with data-remaining-seconds', async ({ page }) => {
        await mockStockDetail(page);
        await mockNewsApi(page, {
          code: STOCK_CODE,
          list: buildNewsList(STOCK_CODE, 3),
          refreshResult: 'cooldown',
          refreshRetryAfter: 25,
        });

        await page.goto(`/stocks/${STOCK_CODE}`);
        const btn = page.getByTestId('news-refresh-button');
        await expect(btn).toBeEnabled();
        await btn.click();

        // 429 수신 후 버튼이 disabled + data-remaining-seconds 속성 존재
        await expect(btn).toBeDisabled();
        const remaining = await btn.getAttribute('data-remaining-seconds');
        expect(remaining).not.toBeNull();
        expect(Number(remaining)).toBeGreaterThan(0);
        expect(Number(remaining)).toBeLessThanOrEqual(30);
      });
    });

    test.describe('News — a11y (V-20)', () => {
      test('axe scan on detail /stocks/[code] with news section → 0 serious/critical violations', async ({ page }) => {
        await mockStockDetail(page);
        await mockNewsApi(page, { code: STOCK_CODE, list: buildNewsList(STOCK_CODE, 5) });

        await page.goto(`/stocks/${STOCK_CODE}`);
        await expect(page.getByTestId('stock-news-section')).toBeVisible();
        const results = await new AxeBuilder({ page })
          .include('[data-testid="stock-news-section"]')
          .disableRules(['color-contrast'])
          .analyze();
        const blocking = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        expect(blocking).toEqual([]);
      });
    });
    ```
  </action>
  <verify>
    <automated>cd webapp &amp;&amp; pnpm exec playwright test e2e/specs/news.spec.ts --reporter=list</automated>
  </verify>
  <acceptance_criteria>
    - `webapp/e2e/fixtures/news.ts` 는 본 plan 에서 **수정되지 않음** (Plan 07-01 산출 재사용). `git diff` 에서 news.ts 변경 0 line. 또한 fixture 는 여전히 camelCase 를 유지: `grep -q "stockCode" webapp/e2e/fixtures/news.ts` + `grep -q "publishedAt" webapp/e2e/fixtures/news.ts` 각 1 match
    - `grep -q "test.skip" webapp/e2e/specs/news.spec.ts` → 0 match (모든 스텁 교체됨)
    - `grep -c "test(" webapp/e2e/specs/news.spec.ts` ≥ 6
    - `grep -q "@axe-core/playwright" webapp/package.json` → 1 match
    - `grep -q "data-remaining-seconds" webapp/e2e/specs/news.spec.ts` (V-19)
    - `grep -q "noopener" webapp/e2e/specs/news.spec.ts` (V-17 security)
    - `grep -q "mockNewsApi" webapp/e2e/fixtures/mock-api.ts` ≥ 1 match (Plan 07-01 의 re-export 유지)
    - `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts` (또는 `pnpm exec playwright test e2e/specs/news.spec.ts`) exit 0 — 6개 test 모두 그린
    - 기존 E2E 회귀 없음: `pnpm -F @gh-radar/webapp test:e2e` 전체 스펙 그린
  </acceptance_criteria>
  <done>news.spec.ts concrete 6개 test 모두 그린, news.ts fixture 는 touch 되지 않음</done>
</task>

<task type="auto">
  <name>Task 2: setup-news-sync-iam.sh + deploy-news-sync.sh + smoke-news-sync.sh 작성 (static — 실행은 Task 3). Accessor 5건(news-sync 3 + server 2) 자동화 포함</name>
  <files>
    scripts/setup-news-sync-iam.sh,
    scripts/deploy-news-sync.sh,
    scripts/smoke-news-sync.sh
  </files>
  <read_first>
    - scripts/setup-master-sync-iam.sh (1:1 템플릿 — sed 치환 기반)
    - scripts/deploy-master-sync.sh (1:1 템플릿)
    - scripts/smoke-master-sync.sh (1:1 템플릿)
    - scripts/deploy-server.sh (server SA 이름 확정 — `gh-radar-server-sa@...`)
    - .planning/phases/07-news-ingestion/07-RESEARCH.md §5 (배포 아티팩트 델타 표)
    - .planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/ (OIDC vs OAuth Pitfall 2 참조)
    - STATE.md "Scheduler → Cloud Run Job 인증은 --oauth-service-account-email 전용 (OIDC 금지)"
  </read_first>
  <behavior>
    setup-news-sync-iam.sh:
      - 가드: GCP_PROJECT_ID env + active configuration=gh-radar 확인
      - **env 기본값**: `NEWS_SYNC_SA="gh-radar-news-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"`, `SERVER_SA="${SERVER_SA:-gh-radar-server-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com}"` — SERVER_SA 는 env override 허용 (기본값 = Phase 2 배포에서 확정된 server Cloud Run service SA)
      - SA 생성: `gh-radar-news-sync-sa` (display: "News Sync Worker")
      - Secret 생성 2개: `gh-radar-naver-client-id`, `gh-radar-naver-client-secret`
        - 이미 존재 시 skip, 없으면 `gcloud secrets create <name> --replication-policy=automatic` + stdin 프롬프트로 값 주입
      - Accessor 바인딩 **5건**:
        - news-sync-sa → gh-radar-supabase-service-role:accessor
        - news-sync-sa → gh-radar-naver-client-id:accessor
        - news-sync-sa → gh-radar-naver-client-secret:accessor
        - server-sa → gh-radar-naver-client-id:accessor (서버 POST /refresh 용)
        - server-sa → gh-radar-naver-client-secret:accessor
      - KIS / KRX / scheduler secret 에는 바인딩 안 함 (최소권한)

    deploy-news-sync.sh:
      - 가드
      - 선행 리소스 확인: news-sync-sa, naver secret 2개, supabase-service-role, gh-radar-scheduler-sa
      - git SHA 캡처
      - Docker build + push: `asia-northeast3-docker.pkg.dev/${PROJECT}/gh-radar/news-sync:${SHA}`
        - Dockerfile: `workers/news-sync/Dockerfile`
        - build-arg `GIT_SHA=${SHA}`
      - Cloud Run Job create-or-update:
        - `--image` 위 이미지
        - `--region=asia-northeast3`
        - `--service-account=gh-radar-news-sync-sa@...`
        - `--memory=512Mi --cpu=1 --task-timeout=600 --max-retries=1 --parallelism=1`
        - `--set-env-vars=SUPABASE_URL=...,NAVER_BASE_URL=https://openapi.naver.com,NAVER_DAILY_BUDGET=24500,NEWS_SYNC_CONCURRENCY=8,LOG_LEVEL=info,APP_VERSION=${SHA}`
        - `--set-secrets=SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,NAVER_CLIENT_ID=gh-radar-naver-client-id:latest,NAVER_CLIENT_SECRET=gh-radar-naver-client-secret:latest`
      - Invoker 바인딩: Scheduler SA → Cloud Run Job invoker (§5.5 패턴, Job 생성 후)
      - Cloud Scheduler create-or-update (R6 — **2개 병행**):
        - 이름 ①: `gh-radar-news-sync-intraday` · `--schedule="*/15 9-15 * * 1-5"` (장중 평일 KST)
        - 이름 ②: `gh-radar-news-sync-offhours` · `--schedule="0 */2 * * *"` (장외 전시간 KST, 2시간 주기)
        - 공통: `--location=asia-northeast3`, `--time-zone="Asia/Seoul"`, Target: Cloud Run Job invoke URI, `--oauth-service-account-email=gh-radar-scheduler-sa@...` (OIDC 금지, Pitfall 2)
        - deploy script 는 bash array loop 로 두 scheduler 를 순차 create-or-update

    smoke-news-sync.sh:
      - INV-1: Job 실행 --wait exit 0 (일회성 invocation)
      - INV-2: Job describe — exists
      - INV-3a: Scheduler `gh-radar-news-sync-intraday` schedule === "*/15 9-15 * * 1-5" (R6)
      - INV-3b: Scheduler `gh-radar-news-sync-offhours` schedule === "0 */2 * * *" (R6)
      - INV-4: news_articles 테이블 row 증가 확인 (supabase CLI 또는 psql)
      - INV-5: api_usage row 증가 확인 (usage_date=KST today, count > 0)
      - PASS/FAIL count + FAILED_INVS 리스트
  </behavior>
  <action>
    master-sync 스크립트 3개를 기반으로 sed 치환:
    `master-sync` → `news-sync`
    `master-sync-sa` → `news-sync-sa`
    `@gh-radar/master-sync` → `@gh-radar/news-sync`
    `Master Sync` → `News Sync`
    (단, Scheduler 이름은 `gh-radar-news-sync-intraday` + `gh-radar-news-sync-offhours` 2개 — R6)

    **setup-news-sync-iam.sh 내 SA 변수 + Secret 생성 블록**:
    ```bash
    # SA — news-sync 워커용 + server Cloud Run service (Phase 2 에서 확정된 기존값)
    NEWS_SYNC_SA="gh-radar-news-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
    SERVER_SA="${SERVER_SA:-gh-radar-server-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com}"
    # SERVER_SA 는 env 로 override 가능 — 기본값은 scripts/deploy-server.sh 에서 사용 중인 SA.

    # ═══════════════════════════════════════════════════════════════
    # Naver Search API Secret 생성
    # ═══════════════════════════════════════════════════════════════
    for secret_name in gh-radar-naver-client-id gh-radar-naver-client-secret; do
      if gcloud secrets describe "$secret_name" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
        echo "  SKIP: secret '$secret_name' already exists"
      else
        echo "  CREATING: '$secret_name' (stdin 입력 대기 — Naver Developer 포털 값 붙여넣기)"
        gcloud secrets create "$secret_name" \
          --replication-policy=automatic \
          --project="$EXPECTED_PROJECT"
        echo "  Enter value for $secret_name (Ctrl-D to finish):"
        gcloud secrets versions add "$secret_name" --data-file=- --project="$EXPECTED_PROJECT"
      fi
    done
    ```

    **setup-news-sync-iam.sh 내 Accessor 바인딩 블록 — 5건 자동화**:
    ```bash
    # ═══════════════════════════════════════════════════════════════
    # Secret Accessor 바인딩 — 5건 (news-sync SA 3건 + server SA 2건)
    # ═══════════════════════════════════════════════════════════════

    # news-sync SA → 3건 (기존)
    gcloud secrets add-iam-policy-binding gh-radar-supabase-service-role \
      --member="serviceAccount:${NEWS_SYNC_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$EXPECTED_PROJECT"
    gcloud secrets add-iam-policy-binding gh-radar-naver-client-id \
      --member="serviceAccount:${NEWS_SYNC_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$EXPECTED_PROJECT"
    gcloud secrets add-iam-policy-binding gh-radar-naver-client-secret \
      --member="serviceAccount:${NEWS_SYNC_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$EXPECTED_PROJECT"

    # server SA → 2건 (신규 — server POST /refresh 가 Naver secret 을 mount 해서 읽을 수 있도록)
    gcloud secrets add-iam-policy-binding gh-radar-naver-client-id \
      --member="serviceAccount:${SERVER_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$EXPECTED_PROJECT"
    gcloud secrets add-iam-policy-binding gh-radar-naver-client-secret \
      --member="serviceAccount:${SERVER_SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$EXPECTED_PROJECT"
    ```

    **deploy-news-sync.sh 내 Cloud Run Job 블록 템플릿** (master-sync 와 델타만):
    ```bash
    gcloud run jobs deploy gh-radar-news-sync \
      --image="$IMAGE" \
      --region=asia-northeast3 \
      --service-account="gh-radar-news-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
      --memory=512Mi --cpu=1 \
      --task-timeout=600 --max-retries=1 --parallelism=1 \
      --set-env-vars="SUPABASE_URL=${SUPABASE_URL},NAVER_BASE_URL=https://openapi.naver.com,NAVER_DAILY_BUDGET=24500,NEWS_SYNC_CONCURRENCY=8,LOG_LEVEL=info,APP_VERSION=${SHA}" \
      --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,NAVER_CLIENT_ID=gh-radar-naver-client-id:latest,NAVER_CLIENT_SECRET=gh-radar-naver-client-secret:latest" \
      --project="$EXPECTED_PROJECT"
    ```

    **Scheduler 블록** (R6 — **2개 scheduler 병행**, OAuth 전용):
    ```bash
    JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/gh-radar-news-sync:run"

    # R6: 장중/장외 scheduler 2개를 loop 으로 create-or-update
    #   intraday = */15 9-15 * * 1-5 (평일 KST 09~15시, 15분 주기)
    #   offhours = 0 */2 * * *         (전 시간 KST, 2시간 주기 — 장외 시간대 커버)
    declare -a NEWS_SCHEDULERS=(
      "gh-radar-news-sync-intraday|*/15 9-15 * * 1-5"
      "gh-radar-news-sync-offhours|0 */2 * * *"
    )

    for entry in "${NEWS_SCHEDULERS[@]}"; do
      SCHEDULER_NAME="${entry%%|*}"
      SCHEDULE="${entry#*|}"
      if gcloud scheduler jobs describe "$SCHEDULER_NAME" --location=asia-northeast3 --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
        gcloud scheduler jobs update http "$SCHEDULER_NAME" \
          --location=asia-northeast3 \
          --schedule="$SCHEDULE" \
          --time-zone="Asia/Seoul" \
          --uri="$JOB_INVOKE_URI" \
          --http-method=POST \
          --oauth-service-account-email="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
          --project="$EXPECTED_PROJECT"
      else
        gcloud scheduler jobs create http "$SCHEDULER_NAME" \
          --location=asia-northeast3 \
          --schedule="$SCHEDULE" \
          --time-zone="Asia/Seoul" \
          --uri="$JOB_INVOKE_URI" \
          --http-method=POST \
          --oauth-service-account-email="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
          --project="$EXPECTED_PROJECT"
      fi
    done
    ```

    smoke-news-sync.sh — master-sync smoke 1:1 복사 + 추가 check:
    - INV-X: `psql -c "SELECT count FROM api_usage WHERE service='naver_search_news' AND usage_date = (now() AT TIME ZONE 'Asia/Seoul')::date"` 반환값이 > 0

    각 script 에 `chmod +x` (git commit 시 executable bit 보존).
  </action>
  <verify>
    <automated>test -x scripts/setup-news-sync-iam.sh &amp;&amp; test -x scripts/deploy-news-sync.sh &amp;&amp; test -x scripts/smoke-news-sync.sh &amp;&amp; bash -n scripts/setup-news-sync-iam.sh &amp;&amp; bash -n scripts/deploy-news-sync.sh &amp;&amp; bash -n scripts/smoke-news-sync.sh &amp;&amp; grep -q "gh-radar-news-sync-intraday" scripts/deploy-news-sync.sh &amp;&amp; grep -q "gh-radar-news-sync-offhours" scripts/deploy-news-sync.sh &amp;&amp; grep -qE '\*/15 9-15 \* \* 1-5' scripts/deploy-news-sync.sh &amp;&amp; grep -qE '0 \*/2 \* \* \*' scripts/deploy-news-sync.sh &amp;&amp; grep -q "oauth-service-account-email" scripts/deploy-news-sync.sh &amp;&amp; ! grep -q "oidc" scripts/deploy-news-sync.sh &amp;&amp; grep -q "SERVER_SA" scripts/setup-news-sync-iam.sh &amp;&amp; [ $(grep -c "gh-radar-naver-client-id" scripts/setup-news-sync-iam.sh) -ge 2 ] &amp;&amp; [ $(grep -c "gh-radar-naver-client-secret" scripts/setup-news-sync-iam.sh) -ge 2 ]</automated>
  </verify>
  <acceptance_criteria>
    - 3개 script executable bit set, `bash -n` syntax check 통과
    - deploy script 에 R6 scheduler 2개 + OAuth invoker 포함 — `grep -q "gh-radar-news-sync-intraday" scripts/deploy-news-sync.sh` + `grep -q "gh-radar-news-sync-offhours" scripts/deploy-news-sync.sh` 각 1 match, `grep -qE '\\*/15 9-15 \\* \\* 1-5' scripts/deploy-news-sync.sh` + `grep -qE '0 \\*/2 \\* \\* \\*' scripts/deploy-news-sync.sh` 각 1 match, `grep -q "oauth-service-account-email" scripts/deploy-news-sync.sh` (Pitfall 2 — OIDC 금지)
    - 구 scheduler 이름 `gh-radar-news-sync-scheduler` 잔존 금지: `! grep -q "gh-radar-news-sync-scheduler[^a-z-]" scripts/deploy-news-sync.sh`
    - deploy script 에 `oidc-service-account-email` 문자열 0 match (OIDC 금지)
    - deploy script 에 `--set-secrets` 로 `gh-radar-naver-client-id:latest` + `gh-radar-naver-client-secret:latest` 포함
    - setup script 에 news-sync-sa + naver secret 2개 포함
    - setup script 에 `SERVER_SA` 변수 선언 존재 (env override 허용, 기본값 `gh-radar-server-sa@...`)
    - setup script 에 Accessor 바인딩이 **5건** 존재: news-sync SA 3건 + server SA 2건. 검증:
      - `grep -c "gh-radar-naver-client-id" scripts/setup-news-sync-iam.sh` ≥ 2 (news-sync 바인딩 1 + server 바인딩 1, 최소 2회 언급)
      - `grep -c "gh-radar-naver-client-secret" scripts/setup-news-sync-iam.sh` ≥ 2
      - `grep -c "\${NEWS_SYNC_SA}\\|NEWS_SYNC_SA" scripts/setup-news-sync-iam.sh` ≥ 3 (accessor 바인딩 3건 + 선언 1)
      - `grep -c "\${SERVER_SA}\\|SERVER_SA" scripts/setup-news-sync-iam.sh` ≥ 2 (accessor 바인딩 2건 + 선언/기본값 1)
    - smoke script 에 `gh-radar-news-sync` job describe / execute 체크 포함
  </acceptance_criteria>
  <done>3개 script 생성, syntax/grep 검증 통과, Accessor 5건 자동화 (실제 실행은 Task 3)</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3 [BLOCKING]: GCP 배포 실행 — IAM(5건) + deploy + server redeploy + smoke</name>
  <files>GCP resources (Cloud Run Job, Scheduler, SA, Secret, 5 IAM bindings), server Cloud Run revision</files>
  <what-built>
    Task 2 에서 생성한 3개 script 를 사용자가 **로컬 shell 에서 직접 실행**한다. Naver Developer 포털에서 발급받은 Client ID/Secret 을 secret 생성 프롬프트에 입력해야 하므로 사람 참여 필수.
    또한 기존 server Cloud Run revision 을 NAVER_* env/secret mount 로 재배포 (scripts/deploy-server.sh 인자 추가).
    **Accessor 바인딩은 setup 스크립트가 일괄 처리** — 수동 `gcloud secrets add-iam-policy-binding` 단계는 제거됨.
  </what-built>
  <how-to-verify>
    다음을 순차 실행 (실패 시 즉시 중단 + 에러 로그 공유):

    1. Naver Developer 포털 등록 (사용자가 이미 완료했을 수도 있음 — 확인만):
       - https://developers.naver.com/apps 에서 "애플리케이션 등록"
       - 서비스 환경 "WEB 설정" + 검색 API 권한
       - 발급된 Client ID / Client Secret 값 준비

    2. SA + Secret + Accessor 5건 일괄 설정:
       ```bash
       export GCP_PROJECT_ID=gh-radar
       gcloud config configurations activate gh-radar
       bash scripts/setup-news-sync-iam.sh
       # 프롬프트에서 Client ID → (붙여넣기 + Ctrl-D), Client Secret → (붙여넣기 + Ctrl-D)
       # 스크립트는 Accessor 5건(news-sync-sa 3건 + server-sa 2건) 을 모두 부여함.
       # SERVER_SA 기본값(gh-radar-server-sa@...) 을 바꾸려면 `SERVER_SA=... bash scripts/setup-news-sync-iam.sh` 형태로 override.
       ```

    3. Image build + Job + Scheduler 배포:
       ```bash
       bash scripts/deploy-news-sync.sh
       # 첫 실행은 Docker build 포함 — 약 5~10분 소요
       ```

    4. Server 재배포 (NAVER_* env/secret 마운트):
       ```bash
       # scripts/deploy-server.sh 가 NAVER_* env/secret 을 이미 mount 하도록 갱신되었는지 확인
       # 안 되어 있으면 deploy-server.sh 에 다음 라인 추가 후 실행:
       #   --set-env-vars 에 NAVER_BASE_URL=https://openapi.naver.com,NAVER_DAILY_BUDGET=24500 추가
       #   --set-secrets 에 NAVER_CLIENT_ID=gh-radar-naver-client-id:latest,NAVER_CLIENT_SECRET=gh-radar-naver-client-secret:latest 추가
       # (Accessor 는 setup-news-sync-iam.sh 가 이미 부여했으므로 수동 바인딩 불필요.)

       bash scripts/deploy-server.sh
       ```

    5. Smoke:
       ```bash
       bash scripts/smoke-news-sync.sh
       ```
       **통과 조건**: PASS 개수 ≥ INV 총수, FAIL == 0.

    6. Playwright E2E (mock API) — 로컬 실행:
       ```bash
       cd webapp
       pnpm test:e2e -- news.spec.ts
       ```
       6개 test 모두 그린.

    7. 실제 뉴스 상세 페이지 smoke — production URL:
       - https://gh-radar-webapp.vercel.app/stocks/005930 방문
       - 관련 뉴스 섹션 표시 확인 (empty state 도 OK — 첫 tick 이후)
       - 새로고침 버튼 클릭 → 실제 Naver 뉴스 수신 확인

    문제 발생 시 공유할 정보:
    - 실패한 INV 이름
    - `gcloud run jobs executions list --job=gh-radar-news-sync --region=asia-northeast3 --limit=3`
    - server Cloud Run logs `gcloud run services logs read gh-radar-server --region=asia-northeast3 --limit=20`
  </how-to-verify>
  <resume-signal>Type "approved" with PASS count and production URL verification, or paste error logs</resume-signal>
  <action>
    사용자가 다음을 순차 실행: (1) scripts/setup-news-sync-iam.sh — Naver Client ID/Secret 입력 + Accessor 5건 일괄 부여 (news-sync-sa 3 + server-sa 2) (2) scripts/deploy-news-sync.sh — image build + Job + Scheduler (3) scripts/deploy-server.sh — NAVER_* env/secret mount 추가된 버전으로 server 재배포 (server SA 에 Accessor 는 이미 setup 스크립트가 부여했으므로 수동 바인딩 불필요) (4) scripts/smoke-news-sync.sh (5) pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts (6) https://gh-radar-webapp.vercel.app/stocks/005930 수동 확인.
  </action>
  <verify>
    <automated>MISSING — 사용자 실행 결과 확인 필요: gcloud run jobs describe gh-radar-news-sync --region=asia-northeast3 exit 0, gcloud scheduler jobs describe gh-radar-news-sync-intraday --format='value(schedule)' == '*/15 9-15 * * 1-5' AND gcloud scheduler jobs describe gh-radar-news-sync-offhours --format='value(schedule)' == '0 */2 * * *' (R6), smoke-news-sync.sh PASS > 0/FAIL == 0, playwright news.spec.ts 6/6 그린, naver-client-id secret accessor 바인딩 ≥ 2 (news-sync-sa + server-sa)</automated>
  </verify>
  <done>모든 GCP 리소스 검증 통과 + server 재배포 후 POST /refresh 가 503 NAVER_UNAVAILABLE 이 아닌 정상 응답 + Playwright 6/6 그린 + production URL 에서 뉴스 섹션 렌더 확인</done>
  <acceptance_criteria>
    - `gcloud run jobs describe gh-radar-news-sync --region=asia-northeast3` exit 0 (V-17 deploy)
    - **R6 Scheduler 2개 — V-24**:
      - `gcloud scheduler jobs describe gh-radar-news-sync-intraday --location=asia-northeast3 --format='value(schedule)'` == `*/15 9-15 * * 1-5`
      - `gcloud scheduler jobs describe gh-radar-news-sync-offhours --location=asia-northeast3 --format='value(schedule)'` == `0 */2 * * *`
    - `gcloud secrets versions access latest --secret=gh-radar-naver-client-id` 성공 (news-sync-sa SA 로)
    - `gcloud secrets get-iam-policy gh-radar-naver-client-id --format=json | jq '[.bindings[].members[]] | length'` ≥ 2 (news-sync-sa + server-sa 둘 다 바인딩 — I-04 확증)
    - `gcloud secrets get-iam-policy gh-radar-naver-client-secret --format=json | jq '[.bindings[].members[]] | length'` ≥ 2
    - `gcloud logging read 'resource.type=cloud_run_job AND textPayload:naver_client_secret' --limit=10` 0 matches (V-19 secret redact)
    - `smoke-news-sync.sh` PASS count > 0, FAIL == 0
    - server 재배포 후 `curl -X POST https://<server>/api/stocks/005930/news/refresh` → 200 또는 429(쿨다운), NOT 503 NAVER_UNAVAILABLE
    - Playwright news.spec.ts 6/6 그린
    - production URL 에서 뉴스 섹션 visible
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 4: DEPLOY-LOG.md 기록 + REQUIREMENTS/ROADMAP/STATE 갱신</name>
  <files>
    .planning/phases/07-news-ingestion/DEPLOY-LOG.md,
    .planning/REQUIREMENTS.md,
    .planning/ROADMAP.md,
    .planning/STATE.md
  </files>
  <read_first>
    - .planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/DEPLOY-LOG.md (템플릿 참고)
    - .planning/REQUIREMENTS.md Traceability 섹션 (NEWS-01 상태 갱신)
    - .planning/ROADMAP.md Phase 7 섹션 (Plans 목록)
    - .planning/STATE.md (current position 갱신)
    - CLAUDE.md (commit 규칙 — 한글 작성, Co-Authored-By 금지)
  </read_first>
  <action>
    `.planning/phases/07-news-ingestion/DEPLOY-LOG.md` 작성 (Task 3 사용자 실행 결과 반영):
    ```markdown
    # Phase 7 — Deploy Log

    **Deployed:** YYYY-MM-DD
    **Image:** asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/news-sync:<SHA>
    **Job:** gh-radar-news-sync (asia-northeast3)
    **Schedulers (R6):**
      - gh-radar-news-sync-intraday (schedule: */15 9-15 * * 1-5, Asia/Seoul)
      - gh-radar-news-sync-offhours (schedule: 0 */2 * * *, Asia/Seoul)
    **SA:** gh-radar-news-sync-sa@gh-radar.iam.gserviceaccount.com
    **Secrets created:** gh-radar-naver-client-id, gh-radar-naver-client-secret
    **Accessor bindings (5):**
      - news-sync-sa → supabase-service-role, naver-client-id, naver-client-secret
      - server-sa → naver-client-id, naver-client-secret
    **Server revision:** <gh-radar-server revision id>

    ## Invariants — smoke-news-sync.sh
    (사용자 실행 결과 붙여넣기)

    ## E2E (Playwright news.spec.ts)
    (6/6 PASS — 구체 결과 붙여넣기)

    ## Production smoke
    - https://gh-radar-webapp.vercel.app/stocks/005930 "관련 뉴스" 섹션 렌더 확인
    - 새로고침 버튼 1회 클릭 — 실제 Naver 뉴스 수신 확인

    ## Known issues / next
    - (있으면)
    ```

    REQUIREMENTS.md Traceability 테이블에서 `NEWS-01 | Phase 7 | Pending` → `NEWS-01 | Phase 7 | Complete` 로 수정.

    ROADMAP.md Phase 7 섹션:
    - 체크박스 `[ ]` → `[x]`
    - Plans 목록 6개 모두 `[x]`
    - Completed: YYYY-MM-DD (task 3 실행일)

    STATE.md:
    - completed_phases: 7 → 8
    - completed_plans: 35 → 41 (Phase 7 6 plans)
    - percent: 재계산
    - stopped_at: "Phase 07 complete — news ingestion production" 또는 유사 메시지
  </action>
  <verify>
    <automated>test -f .planning/phases/07-news-ingestion/DEPLOY-LOG.md &amp;&amp; grep -q "NEWS-01.*Complete" .planning/REQUIREMENTS.md &amp;&amp; grep -q "\[x\] \*\*Phase 7" .planning/ROADMAP.md</automated>
  </verify>
  <acceptance_criteria>
    - DEPLOY-LOG.md 존재 + Image/Job/Scheduler/Secrets/Accessor bindings(5) 필드 채워짐
    - REQUIREMENTS.md Traceability 에서 NEWS-01 → `Complete`
    - ROADMAP.md Phase 7 체크박스 + 6 plans 모두 `[x]`
    - STATE.md 의 completed_phases/completed_plans 가 갱신됨 (숫자 증가 확인)
  </acceptance_criteria>
  <done>4개 문서 갱신 완료</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 07-06)

| Boundary | Description |
|----------|-------------|
| 로컬 shell → GCP | gcloud 명령이 SA/Secret/Job 생성 — 실수로 잘못된 리소스 생성 가능 |
| Naver 포털 → Secret Manager | 사용자가 발급받은 secret 값이 stdin 을 통과 — 로그 노출 방어 필요 |
| Cloud Run Job ↔ Supabase | service_role 쓰기 — 전체 news_articles upsert 권한 |
| Playwright E2E → webapp | mock API 가 현실과 다를 수 있는 edge case |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01 | Information Disclosure | Secret 생성 프롬프트 | mitigate | `gcloud secrets versions add --data-file=-` 으로 stdin 주입 — shell history 에 값 남지 않음. setup script 는 `set -u` 사용 (unset 변수 조기 실패). |
| T-04 | DoS | Scheduler 주기 | mitigate | deploy script 에 2개 cron 고정(R6) — intraday `*/15 9-15 * * 1-5`, offhours `0 */2 * * *`. ENV override 금지. 주기 완화 시 Scheduler 리소스 직접 수정. 예상 호출량 ≈ 7,200/일 (25K 한도의 29%, 안전 마진 충분). |
| T-02 | Tampering (외부 링크) | E2E 검증 | mitigate | Playwright 테스트가 target=_blank + rel=noopener noreferrer 를 assertion 으로 검증 (V-17). |
| T-03 | Tampering (Stored XSS) | E2E 검증 | accept | 본 plan 은 검증만 — 방어는 Plan 04 의 React text escape. E2E 에 별도 XSS payload fuzzing 은 범위 밖. |
</threat_model>

<verification>
- Playwright: `pnpm -F @gh-radar/webapp test:e2e -- news.spec.ts` → 6/6 그린 (V-17/V-18/V-19/V-20)
- Fixture 불변: `git diff --stat webapp/e2e/fixtures/news.ts` → 본 plan commit 에서 0 line 변경 (Plan 07-01 산출 재사용)
- GCP: `gcloud run jobs describe gh-radar-news-sync --region=asia-northeast3` exit 0 (V-17)
- GCP: `gcloud scheduler jobs describe gh-radar-news-sync-intraday --location=asia-northeast3 --format='value(schedule)'` == `*/15 9-15 * * 1-5` (V-24, R6 장중)
- GCP: `gcloud scheduler jobs describe gh-radar-news-sync-offhours --location=asia-northeast3 --format='value(schedule)'` == `0 */2 * * *` (V-24, R6 장외)
- GCP: `gcloud secrets get-iam-policy gh-radar-naver-client-id --format=json | jq '[.bindings[].members[]] | length'` ≥ 2 (I-04)
- GCP: `gcloud logging read 'textPayload:naver_client_secret'` 0 matches (V-19)
- server: `curl -X POST https://<server>/api/stocks/005930/news/refresh -o /dev/null -w '%{http_code}\n'` != 503 (naver client 주입 성공)
- DB: `SELECT count FROM api_usage WHERE usage_date = (now() AT TIME ZONE 'Asia/Seoul')::date` > 0 (첫 tick 이후)
- webapp: https://gh-radar-webapp.vercel.app/stocks/005930 뉴스 섹션 visible

## Commit 규칙 (CLAUDE.md 글로벌 규칙 준수)
- 본 plan 의 각 task 완료 commit 및 전체 Phase 7 배포 기록 commit 은 **모두 한글로 작성**한다.
- commit trailer 에 `Co-Authored-By` 절대 포함하지 않는다.
- 예: `feat(07.6): news-sync Cloud Run Job 배포 + Scheduler 15분 주기 가동` / `docs(07): Phase 7 deploy log 기록`
</verification>

<success_criteria>
- news-sync Cloud Run Job + Scheduler 배포 완료, 15분 주기 자동 실행
- Accessor 5건 자동 부여 — news-sync SA 3건 + server SA 2건 (수동 바인딩 없음)
- server 재배포 — NAVER_* 시크릿 mount 완료 → POST /refresh 작동
- Playwright 6 test 그린 (V-17/V-18/V-19/V-20)
- Fixture 재정의 없음 — Plan 07-01 이 생성한 camelCase `webapp/e2e/fixtures/news.ts` 를 그대로 재사용
- axe-core a11y scan: 0 serious/critical violation
- smoke-news-sync.sh INV 전부 PASS
- DEPLOY-LOG + REQUIREMENTS + ROADMAP + STATE 4개 문서 갱신
- Phase 7 전체 요구사항 NEWS-01 (3가지 success criteria) 충족
- **commit 메시지는 한글로 작성하며 `Co-Authored-By` 절대 포함하지 않는다 (CLAUDE.md 글로벌 규칙)**
</success_criteria>

<output>
After completion, create `.planning/phases/07-news-ingestion/07-06-SUMMARY.md`:
- 배포한 GCP 리소스 리스트 (Job + Scheduler + SA + Secrets + Accessor 5건)
- Playwright 결과 (6/6 PASS)
- smoke PASS/FAIL count
- production URL 검증 결과
- Phase 7 전체 완료 선언 (all requirements traced)
</output>
