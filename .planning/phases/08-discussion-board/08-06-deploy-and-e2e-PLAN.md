---
plan: 08-06
phase: 08
type: execute
wave: 3
depends_on: [08-02, 08-03, 08-04, 08-05]
requirements: [DISC-01]
files_modified:
  - scripts/setup-discussion-sync-iam.sh
  - scripts/deploy-discussion-sync.sh
  - scripts/smoke-discussion-sync.sh
  - webapp/e2e/specs/discussions.spec.ts
  - .planning/phases/08-discussion-board/DEPLOY-LOG.md
autonomous: false
threat_refs: [T-01, T-02, T-03, T-04, T-05, T-09]

must_haves:
  truths:
    - "Cloud Run Job gh-radar-discussion-sync 가 GCP 에 존재하고 수동 트리거 시 exit 0 으로 정상 종료된다"
    - "Cloud Scheduler gh-radar-discussion-sync-hourly (0 * * * * KST) 가 OAuth invoker(gh-radar-scheduler-sa)로 Job 을 트리거한다 (OIDC 금지 — Pitfall 2)"
    - "SA gh-radar-discussion-sync-sa 가 SUPABASE_SERVICE_ROLE + PROXY_API_KEY Secret accessor 권한 보유"
    - "SA gh-radar-server-sa 가 PROXY_API_KEY Secret accessor 권한 추가 (on-demand refresh 경로)"
    - "server 재배포로 PROXY_BASE_URL + PROXY_API_KEY env 가 mount 되어 POST /refresh 가 503 PROXY_UNAVAILABLE 이 아닌 정상 응답"
    - "Playwright E2E discussions.spec.ts 최소 6개 concrete 시나리오 모두 그린 (detail 5건 + 새 탭 속성 + 풀페이지 50건 + Compact 헤더 + 쿨다운 + a11y)"
    - "프로덕션 smoke (scripts/smoke-discussion-sync.sh) 5+ invariant 통과"
    - "DEPLOY-LOG.md 에 Job 이름 / SHA / Scheduler 리소스 / IAM 바인딩 건수 / smoke 결과 기록"
  artifacts:
    - path: "scripts/setup-discussion-sync-iam.sh"
      provides: "SA 1종 + Secret 1종 + Accessor 3~4건 세팅"
      min_lines: 80
    - path: "scripts/deploy-discussion-sync.sh"
      provides: "Cloud Run Job + Scheduler 배포"
      min_lines: 90
    - path: "scripts/smoke-discussion-sync.sh"
      provides: "배포 후 invariants 검증"
      min_lines: 40
    - path: "webapp/e2e/specs/discussions.spec.ts"
      provides: "6+ concrete Playwright 시나리오"
      min_lines: 150
    - path: ".planning/phases/08-discussion-board/DEPLOY-LOG.md"
      provides: "배포 결과 기록"
      min_lines: 20
  key_links:
    - from: "Cloud Scheduler gh-radar-discussion-sync-hourly (0 * * * * KST)"
      to: "Cloud Run Job gh-radar-discussion-sync"
      via: "OAuth invoker (Pitfall 2)"
      pattern: "oauth-service-account"
    - from: "gh-radar-scheduler-sa"
      to: "Cloud Run Job invoker 바인딩"
      via: "roles/run.invoker"
      pattern: "run.invoker"
    - from: "Playwright discussions.spec.ts"
      to: "webapp/e2e/fixtures/discussions.ts (Plan 08-01 산출)"
      via: "mockDiscussionsApi"
      pattern: "mockDiscussionsApi"
---

<objective>
Phase 8 전체를 프로덕션에 배포하고 E2E 로 검증한다:
1) discussion-sync Cloud Run Job + Scheduler 배포 (Phase 7 news-sync 템플릿 미러, Pitfall 2 — OAuth invoker)
2) server 재배포 — PROXY_BASE_URL + PROXY_API_KEY env mount 추가 (on-demand 경로 활성화)
3) Playwright discussions.spec.ts concrete 구현 (Plan 08-01 스텁의 test.skip → 실제 시나리오). Plan 08-01 fixture(mockDiscussionsApi) 재사용 — **덮어쓰기 금지**.
4) smoke + DEPLOY-LOG 기록

Purpose: DISC-01 의 운영 활성화. 이 plan 이 완료되어야 트레이더가 실제 토론방 데이터를 볼 수 있다.
Output: GCP 리소스 2개(Job + Scheduler) + IAM 바인딩 4건 + server 재배포 + 6+ E2E spec + DEPLOY-LOG.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/08-discussion-board/08-CONTEXT.md
@.planning/phases/08-discussion-board/08-RESEARCH.md
@.planning/phases/08-discussion-board/08-VALIDATION.md
@.planning/phases/08-discussion-board/POC-RESULTS.md

@scripts/setup-news-sync-iam.sh
@scripts/deploy-news-sync.sh
@scripts/smoke-news-sync.sh
@scripts/setup-master-sync-iam.sh
@scripts/deploy-master-sync.sh
@scripts/deploy-server.sh

@webapp/playwright.config.ts
@webapp/e2e/auth.setup.ts
@webapp/e2e/specs/news.spec.ts
@webapp/e2e/specs/stock-detail.spec.ts
@webapp/e2e/fixtures/discussions.ts
@webapp/e2e/fixtures/mock-api.ts

<interfaces>
## Cloud Run Job 배포 계약 (Plan 08-02 image + Plan 08-00 POC §1 프록시)

- Job 이름: `gh-radar-discussion-sync`
- Region: `asia-northeast3`
- Memory: 512Mi, CPU 1, task-timeout 600s, max-retries 1, parallelism 1, tasks 1
- Image: `asia-northeast3-docker.pkg.dev/${GCP_PROJECT_ID}/gh-radar/discussion-sync:${GIT_SHA}`
- ENV (`--set-env-vars`):
  - SUPABASE_URL
  - PROXY_PROVIDER (scraperapi | brightdata — POC §1 확정)
  - PROXY_BASE_URL
  - DISCUSSION_SYNC_DAILY_BUDGET (POC §6 결과 기반, default 5000)
  - DISCUSSION_SYNC_CONCURRENCY (default 8)
  - DISCUSSION_SYNC_BODY_FETCH (POC §4 옵션 기반, 기본 true)
  - DISCUSSION_SYNC_BODY_TOP_N (default 5)
  - LOG_LEVEL=info
  - APP_VERSION=${GIT_SHA}
- Secrets (`--set-secrets`):
  - `SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest`
  - `PROXY_API_KEY=gh-radar-proxy-api-key:latest`
- SA: `gh-radar-discussion-sync-sa@${PROJECT}.iam.gserviceaccount.com`

## Cloud Scheduler 계약 (단일 1h — Phase 7 R6 2개 분리와 다름)

CONTEXT D1 명시: 토론방은 24/7 커뮤니티라 단일 주기. Phase 7 의 intraday/offhours 분리 미적용.

- 이름: `gh-radar-discussion-sync-hourly`
- Location: `asia-northeast3`
- Schedule: `0 * * * *` (time-zone `Asia/Seoul`)
- Target: Cloud Run Job invoker — **OAuth (`--oauth-service-account-email`), OIDC 금지 (Pitfall 2)**
- URI: `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/gh-radar-discussion-sync:run`

## Server 재배포 — PROXY_BASE_URL + PROXY_API_KEY 추가

기존 `scripts/deploy-server.sh` 에 Phase 8 env/secret 추가 (Phase 7 NAVER_* 옆에):
- ENV: PROXY_PROVIDER, PROXY_BASE_URL
- Secrets: PROXY_API_KEY=gh-radar-proxy-api-key:latest (server SA 에 accessor 권한은 setup-discussion-sync-iam.sh 가 부여)

## Phase 8 camelCase fixture (Plan 08-01 산출 — 본 plan 에서 덮어쓰기 금지)

- `webapp/e2e/fixtures/discussions.ts` — `DISCUSSION_ITEM_SAMPLE`, `buildDiscussionList`, `mockDiscussionsApi`
- `webapp/e2e/fixtures/mock-api.ts` — re-export 이미 추가됨
- server mapper (Plan 08-03) 가 동일 camelCase 응답
→ 본 plan 의 Task 1 은 import 만, 수정 안 함.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Playwright discussions.spec.ts concrete 구현 (Plan 08-01 fixture 재사용)</name>
  <files>
    webapp/e2e/specs/discussions.spec.ts
  </files>
  <read_first>
    - webapp/e2e/specs/discussions.spec.ts (Plan 08-01 스텁 — test.skip 교체 대상)
    - webapp/e2e/fixtures/discussions.ts (Plan 08-01 산출 — mockDiscussionsApi + DISCUSSION_ITEM_SAMPLE — **수정 금지**)
    - webapp/e2e/fixtures/mock-api.ts (기존 — re-export 확인만, Phase 7 `mockNewsApi` 는 그대로 유지)
    - webapp/e2e/specs/news.spec.ts (Phase 7 concrete 패턴 — axe-core + mockStockDetail 활용)
    - webapp/e2e/specs/stock-detail.spec.ts (route mock 기본 패턴)
    - webapp/e2e/auth.setup.ts (storageState 경로)
    - webapp/playwright.config.ts (axe 의존성 확인 — `@axe-core/playwright` Phase 7 에서 이미 설치됨)
    - .planning/phases/08-discussion-board/08-VALIDATION.md Per-Task Verification Map
    - .planning/phases/08-discussion-board/08-UI-SPEC.md §Accessibility Contract + §Deviation Guardrails
    - packages/shared/src/discussion.ts (camelCase — fixture 필드명 일치)
  </read_first>
  <behavior>
    Plan 08-01 Task 3 스텁을 concrete 로 교체. Plan 08-01 의 `mockDiscussionsApi` / `buildDiscussionList` 직접 import 후 사용.

    구체 시나리오 (최소 6개, ≥150 lines):
    1. **detail list** — /stocks/005930 방문 → `[data-testid="discussion-item"]` 5개 + 더보기 링크 + 각 `<a target="_blank" rel="noopener noreferrer">`
    2. **detail fields** — 각 discussion item 에 제목 + body preview + 작성자 + time (`MM/DD HH:mm` 형식) 렌더 확인
    3. **full page 50건 + Compact 헤더** — /stocks/005930/discussions 방문 → `<li data-testid="discussion-item">` ≤50, 데스크톱에서 컬럼 헤더 "제목/작성자/시간" 렌더
    4. **full page 모바일 컬럼 헤더 숨김** — viewport 375px 설정 후 방문 → 컬럼 헤더 `display:none` 확인 (또는 `not.toBeVisible`)
    5. **full page 새로고침 버튼 없음** — /discussions 페이지에 `[data-testid="discussion-refresh-button"]` 0 count
    6. **refresh cooldown** — mockDiscussionsApi 로 첫 refresh 성공, 두 번째 refresh 429 응답 → 버튼 `disabled` + `data-remaining-seconds` 30 이하
    7. **← back link** — /discussions 에서 `[aria-label="종목 상세로 돌아가기"]` 클릭 → /stocks/005930 이동
    8. **a11y (axe)** — detail section + 풀페이지 각각 axe-core 스캔 → serious/critical violation 0

    **fixture 수정 금지** — 본 task 의 files_modified 에 discussions.ts 는 포함되지 않음. 스펙 내부 route 핸들러 추가가 필요하면 buildDiscussionList(code, n) 로 샘플 생성 후 page.route 직접 작성 (fixture 덮어쓰기 회피).
  </behavior>
  <action>
    **`webapp/e2e/specs/discussions.spec.ts`** — Plan 08-01 Task 3 스텁 전체 교체:
    ```ts
    import { test, expect } from '@playwright/test';
    import AxeBuilder from '@axe-core/playwright';
    import { mockDiscussionsApi, buildDiscussionList } from '../fixtures/discussions';

    // Phase 06.2 auth fixture 재사용
    test.use({ storageState: 'playwright/.auth/user.json' });

    const STOCK_CODE = '005930';
    const STOCK_NAME = '삼성전자';

    async function mockStockDetail(page: import('@playwright/test').Page) {
      await page.route(`**/api/stocks/${STOCK_CODE}`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            code: STOCK_CODE,
            name: STOCK_NAME,
            market: 'KOSPI',
            price: 70000,
            changeAmount: 1500,
            changeRate: 2.19,
            volume: 12345678,
            tradeAmount: 123456789000,
            open: 68500,
            high: 70200,
            low: 68500,
            previousClose: 68500,
            updatedAt: new Date().toISOString(),
          }),
        }),
      );
    }

    test.describe('Discussion — detail Card (Phase 8)', () => {
      test('renders 5 items + 더보기 + external link attrs (T-02)', async ({ page }) => {
        await mockStockDetail(page);
        await mockDiscussionsApi(page, { code: STOCK_CODE, list: buildDiscussionList(STOCK_CODE, 5) });

        await page.goto(`/stocks/${STOCK_CODE}`);
        const items = page.locator('[data-testid="discussion-item"]');
        await expect(items).toHaveCount(5);

        // target=_blank + rel 검증
        const firstLink = items.first().locator('a').first();
        await expect(firstLink).toHaveAttribute('target', '_blank');
        const rel = await firstLink.getAttribute('rel');
        expect(rel).toContain('noopener');
        expect(rel).toContain('noreferrer');

        // 더보기 링크
        const more = page.getByRole('link', { name: /전체 토론 보기/ });
        await expect(more).toBeVisible();
      });

      test('each item shows title + body + author + time', async ({ page }) => {
        await mockStockDetail(page);
        const list = buildDiscussionList(STOCK_CODE, 3);
        await mockDiscussionsApi(page, { code: STOCK_CODE, list });

        await page.goto(`/stocks/${STOCK_CODE}`);
        const first = page.locator('[data-testid="discussion-item"]').first();
        // 제목 텍스트
        await expect(first).toContainText(list[0].title);
        // 본문 preview (body 필드)
        await expect(first).toContainText(list[0].body!.slice(0, 20));
        // 작성자
        await expect(first).toContainText(list[0].author!);
        // time 엘리먼트 존재
        await expect(first.locator('time')).toBeVisible();
      });
    });

    test.describe('Discussion — full page (/stocks/:code/discussions)', () => {
      test('renders up to 50 items + Compact column headers at desktop', async ({ page }) => {
        await mockStockDetail(page);
        await mockDiscussionsApi(page, { code: STOCK_CODE, list: buildDiscussionList(STOCK_CODE, 50) });

        await page.goto(`/stocks/${STOCK_CODE}/discussions`);
        const items = page.locator('[data-testid="discussion-item"]');
        await expect(items).toHaveCount(50);

        // Compact 컬럼 헤더 3종 (desktop viewport 기본)
        await expect(page.getByText('제목', { exact: true })).toBeVisible();
        await expect(page.getByText('작성자', { exact: true })).toBeVisible();
        await expect(page.getByText('시간', { exact: true })).toBeVisible();

        // 새로고침 버튼 없음
        await expect(page.locator('[data-testid="discussion-refresh-button"]')).toHaveCount(0);
      });

      test('column headers hidden on mobile (<720px)', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await mockStockDetail(page);
        await mockDiscussionsApi(page, { code: STOCK_CODE, list: buildDiscussionList(STOCK_CODE, 10) });

        await page.goto(`/stocks/${STOCK_CODE}/discussions`);
        // 컬럼 헤더 row 가 hidden (CSS hidden md:grid)
        const header = page.locator('span', { hasText: '제목' }).filter({ hasText: '제목' }).first();
        // `.hidden` class 포함 혹은 boundingBox 가 null
        const box = await header.boundingBox();
        // md:grid 가 적용 안되면 hidden 이라 박스 없음 또는 매우 작음
        expect(box === null || box.height < 5).toBeTruthy();
      });

      test('← back link navigates to /stocks/:code', async ({ page }) => {
        await mockStockDetail(page);
        await mockDiscussionsApi(page, { code: STOCK_CODE, list: buildDiscussionList(STOCK_CODE, 3) });

        await page.goto(`/stocks/${STOCK_CODE}/discussions`);
        const back = page.getByRole('link', { name: '종목 상세로 돌아가기' });
        await back.click();
        await expect(page).toHaveURL(new RegExp(`/stocks/${STOCK_CODE}$`));
      });
    });

    test.describe('Discussion — refresh cooldown', () => {
      test('second refresh within 30s → 429 + disabled + data-remaining-seconds', async ({ page }) => {
        await mockStockDetail(page);
        let callCount = 0;
        await page.route(`**/api/stocks/${STOCK_CODE}/discussions?**`, (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDiscussionList(STOCK_CODE, 3)) }),
        );
        await page.route(`**/api/stocks/${STOCK_CODE}/discussions/refresh`, (route) => {
          callCount++;
          if (callCount === 1) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDiscussionList(STOCK_CODE, 3)) });
          }
          return route.fulfill({
            status: 429,
            headers: { 'Retry-After': '25' },
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'DISCUSSION_REFRESH_COOLDOWN', message: '잠시 후 다시 시도해주세요' },
              retry_after_seconds: 25,
            }),
          });
        });

        await page.goto(`/stocks/${STOCK_CODE}`);
        const btn = page.locator('[data-testid="discussion-refresh-button"]');
        await btn.click();
        // 첫 클릭 성공 후 쿨다운 시작
        await expect(btn).toBeDisabled();
        await expect(btn).toHaveAttribute('data-remaining-seconds', /^\d+$/);
        const remaining = await btn.getAttribute('data-remaining-seconds');
        expect(Number(remaining)).toBeLessThanOrEqual(30);
      });
    });

    test.describe('Discussion — a11y (axe-core scan)', () => {
      test('detail section has 0 serious/critical violations', async ({ page }) => {
        await mockStockDetail(page);
        await mockDiscussionsApi(page, { code: STOCK_CODE, list: buildDiscussionList(STOCK_CODE, 5) });

        await page.goto(`/stocks/${STOCK_CODE}`);
        await page.waitForSelector('[data-testid="discussion-item"]');
        const results = await new AxeBuilder({ page }).analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(serious).toHaveLength(0);
      });

      test('full page has 0 serious/critical violations', async ({ page }) => {
        await mockStockDetail(page);
        await mockDiscussionsApi(page, { code: STOCK_CODE, list: buildDiscussionList(STOCK_CODE, 20) });

        await page.goto(`/stocks/${STOCK_CODE}/discussions`);
        await page.waitForSelector('[data-testid="discussion-item"]');
        const results = await new AxeBuilder({ page }).analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(serious).toHaveLength(0);
      });
    });
    ```
  </action>
  <verify>
    <automated>test -f webapp/e2e/specs/discussions.spec.ts &amp;&amp; grep -q "mockDiscussionsApi" webapp/e2e/specs/discussions.spec.ts &amp;&amp; grep -q "AxeBuilder" webapp/e2e/specs/discussions.spec.ts &amp;&amp; ! grep -q "test.skip" webapp/e2e/specs/discussions.spec.ts &amp;&amp; grep -c "test(" webapp/e2e/specs/discussions.spec.ts | xargs -I {} test {} -ge 6</automated>
  </verify>
  <acceptance_criteria>
    - discussions.spec.ts 에 `test.skip` 0 match (모두 concrete 로 전환)
    - `grep -c "test(" webapp/e2e/specs/discussions.spec.ts` ≥ 6 (8개 권장)
    - fixture 재정의 금지 — `git diff webapp/e2e/fixtures/discussions.ts` 0 lines
    - AxeBuilder import + 2 a11y test 포함
    - Compact 표 검증 (제목/작성자/시간 헤더 3종) + 모바일 헤더 hidden
    - 새로고침 버튼 없음 검증 (`toHaveCount(0)`)
    - target=_blank + noopener + noreferrer 검증
    - `pnpm -F @gh-radar/webapp e2e --grep discussions` 로컬 실행 시 그린 (mock 기반 — 실제 서버 불필요)
  </acceptance_criteria>
  <done>6+ concrete test 그린 + axe 2 case 그린 + fixture 무수정</done>
</task>

<task type="auto">
  <name>Task 2: setup-discussion-sync-iam.sh + deploy-discussion-sync.sh + smoke-discussion-sync.sh (Phase 7 복제 + rename)</name>
  <files>
    scripts/setup-discussion-sync-iam.sh,
    scripts/deploy-discussion-sync.sh,
    scripts/smoke-discussion-sync.sh
  </files>
  <read_first>
    - scripts/setup-news-sync-iam.sh (Phase 7 — 복제 기준. Secret 이름만 naver → proxy, Job SA 이름만 news-sync → discussion-sync)
    - scripts/deploy-news-sync.sh (Phase 7 — 복제 기준. Image path + Secret mount + Scheduler 1개 (R6 미적용 — CONTEXT D1))
    - scripts/smoke-news-sync.sh (Phase 7 — 복제 기준. invariants 교체)
    - scripts/deploy-server.sh (server 재배포 스크립트 — 본 plan 에서 수정하지 않고, 대신 Task 3 에서 사용자가 수동 실행하되 ENV/Secret 추가 내용을 DEPLOY-LOG 에 기록)
    - .planning/phases/08-discussion-board/08-RESEARCH.md §"Cloud Run Job + Scheduler OAuth invoker 체크리스트" (전체 스크립트 구조 포함)
    - .planning/phases/08-discussion-board/08-CONTEXT.md D1 (Scheduler 단일 1h)
    - .planning/phases/08-discussion-board/POC-RESULTS.md §1 (프록시 provider — env PROXY_PROVIDER 값 확정)
  </read_first>
  <behavior>
    setup-discussion-sync-iam.sh:
      1. Runtime SA 생성: `gh-radar-discussion-sync-sa@${PROJECT}.iam.gserviceaccount.com`
      2. Secret 1개 생성 (이미 값 있으면 versioning 추가): `gh-radar-proxy-api-key`
         - 값은 Plan 08-00 POC §1 에서 확보한 PROXY_API_KEY
         - 사용자가 로컬 .env.local 또는 직접 secret 등록 스크립트 실행 시 값 제공
      3. Secret accessor 바인딩 3건:
         - discussion-sync SA ← SUPABASE_SERVICE_ROLE (기존 Secret)
         - discussion-sync SA ← gh-radar-proxy-api-key (신규)
         - server SA ← gh-radar-proxy-api-key (on-demand 경로용)
         - (기존 Phase 2 server SA ← SUPABASE 이미 있음, 재확인)

    deploy-discussion-sync.sh:
      Section 1~3 — Phase 7 news-sync 구조 복제 (Docker build + push + tag 관리)
      Section 6 — Cloud Run Job 생성:
        - --image asia-northeast3-docker.pkg.dev/${PROJECT}/gh-radar/discussion-sync:${SHA}
        - --region asia-northeast3
        - --service-account gh-radar-discussion-sync-sa@...
        - --memory 512Mi --cpu 1 --task-timeout 600s --max-retries 1 --parallelism 1 --tasks 1
        - --set-env-vars: SUPABASE_URL, PROXY_PROVIDER, PROXY_BASE_URL, DISCUSSION_SYNC_DAILY_BUDGET, DISCUSSION_SYNC_CONCURRENCY, DISCUSSION_SYNC_BODY_FETCH, DISCUSSION_SYNC_BODY_TOP_N, LOG_LEVEL, APP_VERSION
        - --set-secrets: SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest, PROXY_API_KEY=gh-radar-proxy-api-key:latest
      Section 7 — Cloud Run Job invoker 바인딩:
        - gcloud run jobs add-iam-policy-binding gh-radar-discussion-sync --member=serviceAccount:gh-radar-scheduler-sa@... --role=roles/run.invoker
      Section 8 — Cloud Scheduler (단일 1h, OAuth invoker — CONTEXT D1 + Pitfall 2):
        - 이름: `gh-radar-discussion-sync-hourly`
        - schedule: `0 * * * *`
        - time-zone: `Asia/Seoul`
        - URI: `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/gh-radar-discussion-sync:run`
        - http-method: POST
        - `--oauth-service-account-email` = gh-radar-scheduler-sa@... (OIDC 금지)
        - idempotent: describe 시도 → 있으면 update, 없으면 create (Phase 7 패턴 계승)

    smoke-discussion-sync.sh:
      invariants (5~8건):
      - INV-1: Cloud Run Job 리소스 존재 (`gcloud run jobs describe gh-radar-discussion-sync`)
      - INV-2: Scheduler 리소스 존재 (`gcloud scheduler jobs describe gh-radar-discussion-sync-hourly`)
      - INV-3: Scheduler 가 OAuth invoker 사용 (`gcloud scheduler jobs describe ... --format="value(httpTarget.oauthToken.serviceAccountEmail)"` = scheduler-sa)
      - INV-4: Job SA 에 PROXY_API_KEY accessor 권한 (`gcloud secrets get-iam-policy gh-radar-proxy-api-key | grep discussion-sync-sa`)
      - INV-5: Server SA 에도 PROXY_API_KEY accessor (`... grep server-sa`)
      - INV-6: 수동 Job 실행 → exit 0 (`gcloud run jobs execute gh-radar-discussion-sync --wait`)
      - INV-7: POST /api/stocks/005930/discussions/refresh → 200 또는 429 (503 PROXY_UNAVAILABLE 아님) — 실제 서버 URL 에 호출
      - INV-8: GET /api/stocks/005930/discussions → 200 + camelCase JSON array
  </behavior>
  <action>
    **Step 1 — `scripts/setup-discussion-sync-iam.sh`:**
    Phase 7 `scripts/setup-news-sync-iam.sh` 를 복제 후 sed 치환:
    ```bash
    sed -e 's/news-sync/discussion-sync/g' \
        -e 's/gh-radar-naver-client-id/gh-radar-proxy-api-key/g' \
        scripts/setup-news-sync-iam.sh > scripts/setup-discussion-sync-iam.sh
    ```
    그 후 파일을 열어 다음 조정:
    - Naver 관련 Secret 2개(`gh-radar-naver-client-id`, `gh-radar-naver-client-secret`) 를 단일 Secret `gh-radar-proxy-api-key` 로 축소 (반복 loop 의 SECRET 목록에서 2건 제거 + 1건 추가)
    - echo 문구 한글화 (사용자 안내 — "프록시 API key 를 Secret Manager 에 등록합니다")
    - 파일 헤더 주석에 Phase 8 근거 및 POC §1 프록시 서비스 메모

    **Step 2 — `scripts/deploy-discussion-sync.sh`:**
    Phase 7 `scripts/deploy-news-sync.sh` 를 복제 후 sed + 구조 조정:
    ```bash
    sed -e 's/news-sync/discussion-sync/g' scripts/deploy-news-sync.sh > scripts/deploy-discussion-sync.sh
    ```
    그 후 파일을 열어 다음 조정:
    - `--set-env-vars` 섹션 — NAVER_BASE_URL, NEWS_SYNC_DAILY_BUDGET, NEWS_SYNC_CONCURRENCY 제거 후 PROXY_PROVIDER, PROXY_BASE_URL, DISCUSSION_SYNC_DAILY_BUDGET, DISCUSSION_SYNC_CONCURRENCY, DISCUSSION_SYNC_BODY_FETCH, DISCUSSION_SYNC_BODY_TOP_N 추가
    - `--set-secrets` 섹션 — NAVER_CLIENT_ID/SECRET 2개 제거 후 PROXY_API_KEY=gh-radar-proxy-api-key:latest 1개만
    - Scheduler 섹션: Phase 7 의 **intraday/offhours 2개 분리를 제거하고 단일 `gh-radar-discussion-sync-hourly` 만** 생성 (CONTEXT D1). schedule `0 * * * *`, time-zone `Asia/Seoul`, OAuth invoker SA.
    - Phase 7 주석 "R6 intraday/offhours" 등을 제거하고 "CONTEXT D1 — 토론방 24/7 단일 1h" 주석 추가

    Scheduler 섹션 예시 (Phase 7 2개 → Phase 8 1개 치환 기준):
    ```bash
    # Section 8: Cloud Scheduler — 단일 1h (CONTEXT D1)
    SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
    JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/gh-radar-discussion-sync:run"

    if gcloud scheduler jobs describe gh-radar-discussion-sync-hourly \
       --location="$REGION" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
      gcloud scheduler jobs update http gh-radar-discussion-sync-hourly \
        --location="$REGION" \
        --schedule="0 * * * *" \
        --time-zone="Asia/Seoul" \
        --uri="$JOB_INVOKE_URI" \
        --http-method=POST \
        --oauth-service-account-email="$SCHED_SA" \
        --project="$EXPECTED_PROJECT"
    else
      gcloud scheduler jobs create http gh-radar-discussion-sync-hourly \
        --location="$REGION" \
        --schedule="0 * * * *" \
        --time-zone="Asia/Seoul" \
        --uri="$JOB_INVOKE_URI" \
        --http-method=POST \
        --oauth-service-account-email="$SCHED_SA" \
        --project="$EXPECTED_PROJECT"
    fi
    ```

    **Step 3 — `scripts/smoke-discussion-sync.sh`:**
    Phase 7 `scripts/smoke-news-sync.sh` 복제 후 invariants 교체:
    ```bash
    #!/usr/bin/env bash
    set -euo pipefail

    PROJECT="${EXPECTED_PROJECT:-gh-radar}"
    REGION="asia-northeast3"
    SERVER_URL="${GH_RADAR_SERVER_URL:-https://gh-radar-server-1023658565518.asia-northeast3.run.app}"
    STOCK_CODE="005930"

    pass=0
    fail=0

    run() {
      local label="$1"; shift
      if "$@" >/dev/null 2>&1; then
        echo "PASS $label"; pass=$((pass+1))
      else
        echo "FAIL $label"; fail=$((fail+1))
      fi
    }

    # INV-1: Cloud Run Job 존재
    run "INV-1 Job exists" gcloud run jobs describe gh-radar-discussion-sync --region="$REGION" --project="$PROJECT"

    # INV-2: Scheduler 존재
    run "INV-2 Scheduler exists" gcloud scheduler jobs describe gh-radar-discussion-sync-hourly --location="$REGION" --project="$PROJECT"

    # INV-3: Scheduler OAuth invoker
    SCHED_AUTH=$(gcloud scheduler jobs describe gh-radar-discussion-sync-hourly --location="$REGION" --project="$PROJECT" --format="value(httpTarget.oauthToken.serviceAccountEmail)" 2>/dev/null || true)
    if [[ "$SCHED_AUTH" == *"gh-radar-scheduler-sa"* ]]; then
      echo "PASS INV-3 Scheduler OAuth invoker ($SCHED_AUTH)"; pass=$((pass+1))
    else
      echo "FAIL INV-3 Scheduler auth = $SCHED_AUTH"; fail=$((fail+1))
    fi

    # INV-4: Job SA accessor
    if gcloud secrets get-iam-policy gh-radar-proxy-api-key --project="$PROJECT" --format=json | grep -q "gh-radar-discussion-sync-sa"; then
      echo "PASS INV-4 Job SA has PROXY_API_KEY accessor"; pass=$((pass+1))
    else
      echo "FAIL INV-4 Job SA missing accessor"; fail=$((fail+1))
    fi

    # INV-5: Server SA accessor
    if gcloud secrets get-iam-policy gh-radar-proxy-api-key --project="$PROJECT" --format=json | grep -q "gh-radar-server-sa"; then
      echo "PASS INV-5 Server SA has PROXY_API_KEY accessor"; pass=$((pass+1))
    else
      echo "FAIL INV-5 Server SA missing accessor"; fail=$((fail+1))
    fi

    # INV-6: 수동 Job 실행 (실트래픽 — 프록시 credit 소모 주의)
    if gcloud run jobs execute gh-radar-discussion-sync --region="$REGION" --project="$PROJECT" --wait >/dev/null 2>&1; then
      echo "PASS INV-6 Job executes exit 0"; pass=$((pass+1))
    else
      echo "FAIL INV-6 Job execution failed"; fail=$((fail+1))
    fi

    # INV-7: Server /api/stocks/:code/discussions 200
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${SERVER_URL}/api/stocks/${STOCK_CODE}/discussions?hours=24&limit=5" || echo "000")
    if [[ "$HTTP" == "200" ]]; then
      echo "PASS INV-7 GET discussions 200"; pass=$((pass+1))
    else
      echo "FAIL INV-7 GET = $HTTP"; fail=$((fail+1))
    fi

    # INV-8: Server /refresh 503 PROXY_UNAVAILABLE 이 아니어야 함
    REFRESH_HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${SERVER_URL}/api/stocks/${STOCK_CODE}/discussions/refresh" || echo "000")
    # 200 또는 429 (쿨다운) 허용, 503 PROXY_UNAVAILABLE 은 실패
    if [[ "$REFRESH_HTTP" == "200" || "$REFRESH_HTTP" == "429" ]]; then
      echo "PASS INV-8 POST refresh not 503 ($REFRESH_HTTP)"; pass=$((pass+1))
    else
      echo "FAIL INV-8 POST refresh = $REFRESH_HTTP"; fail=$((fail+1))
    fi

    echo "---"
    echo "PASS=$pass FAIL=$fail"
    [[ "$fail" -eq 0 ]]
    ```

    **Step 4 — chmod +x:**
    ```bash
    chmod +x scripts/setup-discussion-sync-iam.sh scripts/deploy-discussion-sync.sh scripts/smoke-discussion-sync.sh
    ```
  </action>
  <verify>
    <automated>test -x scripts/setup-discussion-sync-iam.sh &amp;&amp; test -x scripts/deploy-discussion-sync.sh &amp;&amp; test -x scripts/smoke-discussion-sync.sh &amp;&amp; grep -q "gh-radar-discussion-sync" scripts/deploy-discussion-sync.sh &amp;&amp; grep -q "oauth-service-account-email" scripts/deploy-discussion-sync.sh &amp;&amp; ! grep -q "oidc-service-account-email" scripts/deploy-discussion-sync.sh &amp;&amp; grep -q "gh-radar-proxy-api-key" scripts/setup-discussion-sync-iam.sh &amp;&amp; grep -q "gh-radar-proxy-api-key" scripts/deploy-discussion-sync.sh &amp;&amp; grep -qE "0 \* \* \* \*" scripts/deploy-discussion-sync.sh &amp;&amp; ! grep -qE "intraday|offhours" scripts/deploy-discussion-sync.sh &amp;&amp; bash -n scripts/setup-discussion-sync-iam.sh &amp;&amp; bash -n scripts/deploy-discussion-sync.sh &amp;&amp; bash -n scripts/smoke-discussion-sync.sh</automated>
  </verify>
  <acceptance_criteria>
    - 3개 스크립트 파일 생성 + `chmod +x` 적용
    - bash -n (syntax check) 모두 통과
    - Pitfall 2 준수: `grep -q "oauth-service-account-email" scripts/deploy-discussion-sync.sh` 1+ match, `grep -q "oidc-service-account-email" scripts/deploy-discussion-sync.sh` 0 match
    - Scheduler 단일 (CONTEXT D1): `grep -c "scheduler jobs create\|scheduler jobs update" scripts/deploy-discussion-sync.sh` ≤ 2 (create OR update, 같은 이름)
    - Scheduler 이름: `grep -q "gh-radar-discussion-sync-hourly" scripts/deploy-discussion-sync.sh`
    - 프록시 Secret 이름: `grep -q "gh-radar-proxy-api-key" scripts/setup-discussion-sync-iam.sh` + `grep -q "gh-radar-proxy-api-key" scripts/deploy-discussion-sync.sh` 각 1+ match
    - Phase 7 naver-client-id/secret 미사용: `! grep -q "naver-client" scripts/setup-discussion-sync-iam.sh` + `! grep -q "naver-client" scripts/deploy-discussion-sync.sh`
    - smoke 스크립트 8 invariants 포함: `grep -c "^# INV-" scripts/smoke-discussion-sync.sh` ≥ 5
  </acceptance_criteria>
  <done>3개 스크립트 작성 + syntax 검증 + Pitfall 2 준수 + POC 산출 프록시 Secret 이름 반영</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3 [DEPLOY]: 실배포 실행 — IAM setup + Cloud Run Job + Scheduler + server 재배포 + smoke</name>
  <files>.planning/phases/08-discussion-board/DEPLOY-LOG.md</files>
  <read_first>
    - scripts/setup-discussion-sync-iam.sh (Task 2 산출 — IAM 실행 대상 명령)
    - scripts/deploy-discussion-sync.sh (Task 2 산출 — Cloud Run Job + Scheduler)
    - scripts/smoke-discussion-sync.sh (Task 2 산출 — invariants)
    - scripts/deploy-server.sh (server 재배포 스크립트 — PROXY env/secret 추가 지점)
    - .planning/phases/08-discussion-board/POC-RESULTS.md §1 (프록시 provider + base URL)
    - .planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/DEPLOY-LOG.md (Phase 05.1 DEPLOY-LOG 포맷 근거 — Pitfall 2 기록 방식)
    - .planning/phases/07-news-ingestion/DEPLOY-LOG.md (Phase 7 DEPLOY-LOG 포맷 근거 — 섹션 구조)
  </read_first>
  <what-built>
    Task 2 에서 만든 3개 스크립트를 실제 GCP 에 실행한다. 사용자가 결제된 프록시 API key (Plan 08-00 POC §1 산출물) + gcloud 인증 상태여야 함. 실패 시 중단하고 원인 분석 후 재실행.
  </what-built>
  <how-to-verify>
    사용자가 다음 순서로 실행 + DEPLOY-LOG.md 에 결과 기록:

    **Step A — Secret 값 준비 (로컬):**
    Plan 08-00 POC §1 에서 발급받은 PROXY_API_KEY 를 **환경변수로만** export (파일 저장 금지):
    ```bash
    read -rs PROXY_API_KEY  # input 안 보임, stdin 으로 받기
    export PROXY_API_KEY
    ```

    **Step B — IAM + Secret 등록:**
    ```bash
    # gh-radar-proxy-api-key Secret 등록 (첫 실행 시)
    echo -n "$PROXY_API_KEY" | gcloud secrets create gh-radar-proxy-api-key \
      --data-file=- --project=gh-radar 2>/dev/null || \
    echo -n "$PROXY_API_KEY" | gcloud secrets versions add gh-radar-proxy-api-key \
      --data-file=- --project=gh-radar

    # IAM setup 실행
    bash scripts/setup-discussion-sync-iam.sh
    ```

    **Step C — Docker image 빌드 + push + Job deploy:**
    ```bash
    bash scripts/deploy-discussion-sync.sh
    ```
    실행 후 출력에서 GIT_SHA / image 경로 / Job / Scheduler 생성 확인.

    **Step D — Server 재배포 (PROXY env/secret mount 추가):**
    `scripts/deploy-server.sh` 를 수정해서 PROXY_BASE_URL / PROXY_API_KEY env+secret 추가한 뒤 실행. 또는 one-liner 로 `gcloud run services update gh-radar-server` + `--update-env-vars` + `--update-secrets`:
    ```bash
    gcloud run services update gh-radar-server \
      --region=asia-northeast3 \
      --update-env-vars="PROXY_PROVIDER=scraperapi,PROXY_BASE_URL=https://api.scraperapi.com" \
      --update-secrets="PROXY_API_KEY=gh-radar-proxy-api-key:latest" \
      --project=gh-radar
    ```
    (provider/base-url 은 POC §1 선택 결과 기준)

    **Step E — Smoke 실행:**
    ```bash
    bash scripts/smoke-discussion-sync.sh
    ```
    결과에서 PASS=8 FAIL=0 확인. 실패 항목 있으면 원인 분석 + 재배포.

    **Step F — DEPLOY-LOG.md 작성:**
    `.planning/phases/08-discussion-board/DEPLOY-LOG.md`:
    ```markdown
    # Phase 8 Discussion Board — Deploy Log

    **Deployed:** 2026-04-{DD} KST
    **Image:** `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/discussion-sync:{SHA}`

    ## Resources

    | Resource | Name | Location |
    |----------|------|----------|
    | Cloud Run Job | gh-radar-discussion-sync | asia-northeast3 |
    | Cloud Scheduler | gh-radar-discussion-sync-hourly | asia-northeast3 |
    | SA (Job runtime) | gh-radar-discussion-sync-sa | — |
    | Secret | gh-radar-proxy-api-key | — |

    ## Schedule

    - **Single hourly:** `0 * * * *` KST (CONTEXT D1 — 토론방 24/7)
    - **OAuth invoker:** gh-radar-scheduler-sa (Pitfall 2)

    ## IAM bindings

    | Grantee SA | Role | Resource |
    |-----------|------|----------|
    | gh-radar-discussion-sync-sa | roles/secretmanager.secretAccessor | gh-radar-supabase-service-role |
    | gh-radar-discussion-sync-sa | roles/secretmanager.secretAccessor | gh-radar-proxy-api-key |
    | gh-radar-server-sa | roles/secretmanager.secretAccessor | gh-radar-proxy-api-key |
    | gh-radar-scheduler-sa | roles/run.invoker | gh-radar-discussion-sync |

    ## Smoke result

    | # | Invariant | Result |
    |---|-----------|--------|
    | INV-1 | Cloud Run Job exists | PASS |
    | INV-2 | Scheduler exists | PASS |
    | INV-3 | OAuth invoker | PASS |
    | INV-4 | Job SA PROXY accessor | PASS |
    | INV-5 | Server SA PROXY accessor | PASS |
    | INV-6 | Manual Job execute exit 0 | PASS |
    | INV-7 | GET /discussions 200 | PASS |
    | INV-8 | POST /refresh not 503 | PASS |

    **Total: 8/8 PASS**

    ## Operational notes

    - 프록시 provider: {POC §1 확정}
    - 월 예산: ${N}
    - 첫 배치 실행 시 upserted={M} discussions
    - 관측 과제: 차단률 (< 5% 목표), DOM 파싱 실패율, proxy credit 소진 페이스

    ## Server redeploy

    - Service `gh-radar-server` revision: {REV}
    - 추가 env: PROXY_PROVIDER, PROXY_BASE_URL
    - 추가 secret: PROXY_API_KEY=gh-radar-proxy-api-key:latest

    ## Known issues

    (없음 또는 관찰된 문제)
    ```

    **Step G — "approved" resume.**
  </how-to-verify>
  <resume-signal>Type "approved" with smoke result summary (PASS/FAIL counts) + image SHA + DEPLOY-LOG.md 경로</resume-signal>
  <action>
    사용자에게 how-to-verify 의 Step A~F 를 안내한다. 각 단계 실행 후 결과 확인 + 장애 시 중단 + 원인 분석 재실행. Step E smoke 결과 `PASS=8 FAIL=0` 이 아니면 resume 금지, 원인 기록 후 수정/재시도.

    **주의 (RESEARCH Pitfall 5 — 비용 폭증):**
    smoke INV-6 는 실제 Job 을 실행하므로 프록시 credit 이 소모된다. 예상 소모: 약 200 종목 × (1 + 5 본문) = ~1,200 credits. POC §6 예산 tier 가 일간 소모량 수용 가능한지 재확인 후 실행.

    **주의 (T-03 secret 로그):**
    PROXY_API_KEY 를 bash history 에 남기지 않도록 `read -rs` 사용. DEPLOY-LOG.md 에 key 값 절대 기록 금지.
  </action>
  <verify>
    <automated>test -f .planning/phases/08-discussion-board/DEPLOY-LOG.md &amp;&amp; grep -q "Cloud Run Job" .planning/phases/08-discussion-board/DEPLOY-LOG.md &amp;&amp; grep -q "gh-radar-discussion-sync-hourly" .planning/phases/08-discussion-board/DEPLOY-LOG.md &amp;&amp; grep -q "OAuth invoker" .planning/phases/08-discussion-board/DEPLOY-LOG.md &amp;&amp; grep -q "8/8 PASS\|PASS=8" .planning/phases/08-discussion-board/DEPLOY-LOG.md</automated>
  </verify>
  <acceptance_criteria>
    - DEPLOY-LOG.md 존재 + 필수 섹션 5개 (Resources / Schedule / IAM / Smoke / Operational notes)
    - Smoke 결과: 8 PASS / 0 FAIL (or 사유 명시된 부분 PASS — 최소 INV-1~INV-5 + INV-7 6개)
    - Cloud Scheduler OAuth invoker 확증 (Pitfall 2)
    - DEPLOY-LOG.md 에 PROXY_API_KEY 값 평문 0 match (`! grep -q "PROXY_API_KEY=[^:]" .planning/phases/08-discussion-board/DEPLOY-LOG.md` — Secret reference 는 허용하되 실제 key 값 금지)
    - 배치 첫 실행 upserted 수치 ≥ 0 (0이면 관측 이슈 기록)
    - 사용자 "approved" + smoke PASS=8 확증
  </acceptance_criteria>
  <done>GCP 리소스 배포 + server 재배포 + smoke 8 PASS + DEPLOY-LOG.md 완성 + 사용자 approved</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries (Plan 08-06)

| Boundary | Description |
|----------|-------------|
| gcloud CLI → GCP | SA 권한 부여 — 최소 권한 원칙 유지 |
| Secret Manager → Cloud Run | 런타임에만 env 로 주입, 코드/로그 평문 저장 금지 |
| Scheduler → Run Job | OAuth 만 (OIDC 금지) |
| Playwright E2E mock | 모든 `/api/stocks/:code/discussions*` 엔드포인트 mock — 실서버 호출 없음 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01 | Information Disclosure | PROXY_API_KEY | mitigate | GCP Secret Manager only. `gcloud secrets versions add` 로만 값 주입. DEPLOY-LOG.md 평문 금지 — `gcloud secrets` reference 만 기록. `read -rs` 로 bash history 우회. |
| T-02 | Tampering (URL tabnabbing) | Playwright E2E | mitigate | discussions.spec.ts 1번째 테스트가 `target="_blank" rel="noopener noreferrer"` attribute 검증. 회귀 방지. |
| T-03 | Information Disclosure | smoke 스크립트 output | mitigate | smoke 가 Secret 값 로그 출력 금지 — PASS/FAIL 만. `gcloud secrets get-iam-policy` 는 policy JSON 만 (값 아님). |
| T-04 | Tampering (log injection) | server 재배포 후 로그 | mitigate | Plan 08-02/08-03 이 이미 logger redact 구현 — 본 plan 은 환경변수 주입만. Cloud Run 로그에서 PROXY_API_KEY 리터럴 grep 결과 0 확증 (smoke 시 추가 체크 권장). |
| T-05 | DoS (프록시 예산 소진) | smoke INV-6 실제 Job 실행 | mitigate | 실행 1회당 ~1,200 credit. POC §6 tier 가 일간 소모량 수용 가능한지 smoke 전 재확인. credit alert 설정 권장 (POC §1 monitoring). |
| T-09 | Elevation of Privilege / Authorization | Cloud Run Job SA + Secret Manager | mitigate | `scripts/setup-discussion-sync-iam.sh` 가 discussion-sync-sa 에 `roles/secretmanager.secretAccessor` 만, scheduler-sa 에 `roles/run.invoker` 만 부여 (다른 role 차단 — 최소권한 원칙). smoke INV-4/INV-5 가 Secret Manager IAM policy 에 **예상 SA 만** 존재하는지 검증 — `gcloud secrets get-iam-policy gh-radar-proxy-api-key` 출력에서 discussion-sync-sa + server-sa 외 SA 없음을 확인. I3 revision: RESEARCH §"Security Domain" 의 T-01~T-07 범위를 넘어서 본 plan 이 IAM 관리 책임을 추가로 짐 — disposition=mitigate. |
</threat_model>

<verification>
- `test -f scripts/setup-discussion-sync-iam.sh && test -f scripts/deploy-discussion-sync.sh && test -f scripts/smoke-discussion-sync.sh`
- `bash -n` 3개 스크립트 syntax OK
- `grep -q "oauth-service-account-email" scripts/deploy-discussion-sync.sh` + `! grep -q "oidc" scripts/deploy-discussion-sync.sh` (Pitfall 2)
- `grep -q "gh-radar-discussion-sync-hourly" scripts/deploy-discussion-sync.sh` (단일 Scheduler 이름)
- `! grep -qE "intraday|offhours" scripts/deploy-discussion-sync.sh` (Phase 7 R6 미적용)
- `pnpm -F @gh-radar/webapp e2e --grep discussions` 로컬 그린 (mock 기반)
- DEPLOY-LOG.md 에 smoke PASS=8 + Resources + IAM + Schedule 섹션 완비
- `! grep -q "PROXY_API_KEY=[a-zA-Z0-9]\+" .planning/phases/08-discussion-board/DEPLOY-LOG.md` (평문 key 없음)
</verification>

<success_criteria>
- discussion-sync Cloud Run Job + Scheduler 배포 완료 (OAuth invoker, 단일 1h)
- server 재배포로 PROXY env/secret mount — POST /refresh 503 PROXY_UNAVAILABLE 해소
- Playwright 6+ concrete test 그린 (5건/새탭속성/Compact 헤더/모바일/쿨다운/a11y)
- smoke 8 invariants PASS (최소 필수 6건)
- DEPLOY-LOG.md 완성 — Phase 7 DEPLOY-LOG 와 동일 수준 상세도
</success_criteria>

<output>
After completion, create `.planning/phases/08-discussion-board/08-06-SUMMARY.md`:
- 배포된 GCP 리소스 리스트 + image SHA
- IAM 바인딩 diff (Phase 7 대비 추가된 4건)
- smoke 결과 (INV별 PASS/FAIL)
- Playwright E2E 결과 (test count + axe violations)
- 다음 단계 권장사항 (e.g., 차단률/credit 소모 모니터링, Phase 9 AI 요약 준비)
</output>
