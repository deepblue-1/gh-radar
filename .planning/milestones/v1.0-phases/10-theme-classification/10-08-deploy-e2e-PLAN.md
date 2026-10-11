---
phase: 10-theme-classification
plan: 08
type: execute
wave: 7
depends_on: [03, 04, 05, 06, 07]
files_modified:
  - workers/theme-sync/Dockerfile
  - scripts/setup-theme-sync-iam.sh
  - scripts/deploy-theme-sync.sh
  - scripts/smoke-theme-sync.sh
  - webapp/e2e/themes.spec.ts
  - webapp/e2e/user-themes.spec.ts
  - webapp/e2e/theme-chips.spec.ts
autonomous: false
requirements: [THEME-01, THEME-02, THEME-03, THEME-04]
must_haves:
  truths:
    - "workers/theme-sync 가 Cloud Run Job + Cloud Scheduler 로 일 1회 16:00 KST 실행된다"
    - "Scheduler→Job 호출이 OAuth invoker 로 인증된다 (OIDC 금지)"
    - "theme-sync SA 가 기존 시크릿 3종(supabase/brightdata/anthropic) accessor 바인딩"
    - "production smoke 에서 theme-sync 1회 실행 후 themes count > 0"
    - "Playwright E2E 가 /themes 목록 + 유저 CRUD + 종목 칩 흐름을 검증한다"
  artifacts:
    - path: "scripts/deploy-theme-sync.sh"
      provides: "Cloud Run Job 배포 + Scheduler OAuth invoker (master-sync 복제)"
    - path: "webapp/e2e/themes.spec.ts"
      provides: "/themes 목록 + /themes/[id] E2E"
    - path: "workers/theme-sync/Dockerfile"
      provides: "multi-stage pnpm deploy 빌드 (master-sync 복제)"
  key_links:
    - from: "scripts/deploy-theme-sync.sh"
      to: "Cloud Scheduler"
      via: "--oauth-service-account-email (OIDC 금지, Pitfall 4)"
      pattern: "oauth-service-account-email"
    - from: "deploy-theme-sync.sh"
      to: "gh-radar-theme-sync-sa"
      via: "기존 시크릿 3종 accessor"
      pattern: "set-secrets"
---

<objective>
theme-sync 워커를 Cloud Run Job + Cloud Scheduler(일 1회 16:00 KST, OAuth invoker)로 배포하고, Playwright E2E(/themes 목록, 유저 CRUD, 종목 칩)로 통합 검증한다. **[BLOCKING] GCP 배포 + production smoke(themes count > 0).** master-sync 배포 스택 1:1 복제, OIDC 금지(Pitfall 4), 기존 시크릿 3종 재사용.

Purpose: 전체 phase 의 production 게이트 + E2E. RESEARCH §Don't Hand-Roll(master-sync 디렉터리/스크립트 복제) + §Code Examples(deploy OAuth). MEMORY 규칙: 기존 creds 재요청 금지(시크릿 3종 이미 존재), Deployer SA 영구 인증.
Output: Dockerfile + setup/deploy/smoke 스크립트 + Cloud Run Job/Scheduler(배포 완료) + E2E 3종.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/10-theme-classification/10-RESEARCH.md

<interfaces>
복제 기준 (master-sync 배포 스택 1:1):

workers/master-sync/Dockerfile (multi-stage pnpm deploy — master-sync→theme-sync 치환):
- builder: node:22-alpine, corepack pnpm@10, COPY workspace + packages/shared + workers/master-sync, pnpm install --frozen-lockfile, pnpm -F @gh-radar/shared build, pnpm -F @gh-radar/master-sync build, pnpm --filter=@gh-radar/master-sync --prod --legacy deploy /out, cp dist /out/dist
- prod: node:22-alpine, COPY /out/dist + package.json + node_modules + shared/dist, USER app, CMD node dist/index.js

scripts/deploy-master-sync.sh + setup-master-sync-iam.sh + smoke-master-sync.sh — Job 이름 gh-radar-theme-sync 로 치환.
RESEARCH §Code Examples deploy 골격:
- gcloud run jobs deploy gh-radar-theme-sync --service-account=gh-radar-theme-sync-sa@${PROJECT}... --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest" --task-timeout=600s --max-retries=1
- gcloud scheduler jobs create http gh-radar-theme-sync-daily --schedule="0 16 * * *" --time-zone="Asia/Seoul" --oauth-service-account-email=gh-radar-scheduler-sa@... (OIDC 금지)

기존 시크릿(재사용, MEMORY 기존 creds 재요청 금지): gh-radar-supabase-service-role, gh-radar-brightdata-api-key, gh-radar-anthropic-api-key.
GCP 인증: Deployer SA — GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json + CLOUDSDK_CORE_PROJECT=gh-radar (MEMORY).
Pitfall 4: Cloud Run Job 호출은 OAuth bearer 만 (OIDC 금지). Job invoker 바인딩은 deploy 스크립트 Job 생성 후 §5.5(05.1 선례).
webapp e2e: 기존 Playwright storageState auth fixture 재사용(로그인 유저 테스트). dev.sh PORT=3100(MEMORY).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dockerfile + setup/deploy/smoke 스크립트 (master-sync 복제, OAuth invoker)</name>
  <files>workers/theme-sync/Dockerfile, scripts/setup-theme-sync-iam.sh, scripts/deploy-theme-sync.sh, scripts/smoke-theme-sync.sh</files>
  <read_first>
    - workers/master-sync/Dockerfile (multi-stage 복제 기준)
    - scripts/deploy-master-sync.sh, setup-master-sync-iam.sh, smoke-master-sync.sh (1:1 복제 기준)
    - scripts/deploy-discussion-sync.sh (Bright Data + Anthropic 시크릿 바인딩 참고)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Code Examples (deploy OAuth), §Pitfall 4
    - MEMORY: reference_gh_radar_deployer_sa, feedback_dont_ask_existing_creds
  </read_first>
  <action>
    1. workers/theme-sync/Dockerfile — master-sync Dockerfile 복사, master-sync→theme-sync 전부 치환. dist 명시 COPY 유지.
    2. scripts/setup-theme-sync-iam.sh — setup-master-sync-iam.sh 복제. SA gh-radar-theme-sync-sa 생성 + 기존 시크릿 3종(gh-radar-supabase-service-role, gh-radar-brightdata-api-key, gh-radar-anthropic-api-key) accessor 바인딩(신규 시크릿 생성 금지 — 재사용). Scheduler SA(gh-radar-scheduler-sa) invoker 권한.
    3. scripts/deploy-theme-sync.sh — deploy-master-sync.sh 복제 + RESEARCH §Code Examples 골격: gcloud run jobs deploy gh-radar-theme-sync (SA + set-secrets 3종 + task-timeout=600s + max-retries=1) → Job invoker 바인딩(Job 생성 후 §5.5) → gcloud scheduler jobs create/update http gh-radar-theme-sync-daily (schedule "0 16 * * *", time-zone Asia/Seoul, --oauth-service-account-email, OIDC 금지). APP_VERSION=git sha.
    4. scripts/smoke-theme-sync.sh — smoke-master-sync.sh 복제. INV: Job 1회 execute → 로그 cycle complete + themes count > 0 검증(Supabase). DI-02 헤더 CR 파싱 패턴 주의(기존 알려진 버그 회피).
    스크립트는 작성만 — 실제 GCP 실행은 Task 3 [BLOCKING].
  </action>
  <verify>
    <automated>bash -n scripts/deploy-theme-sync.sh</automated>
  </verify>
  <acceptance_criteria>
    - `bash -n scripts/deploy-theme-sync.sh` exits 0 (syntax ok), same for setup/smoke scripts
    - `grep -q "oauth-service-account-email" scripts/deploy-theme-sync.sh` exits 0 (OAuth invoker)
    - `grep -q "oidc" scripts/deploy-theme-sync.sh` returns NOTHING (OIDC 금지, Pitfall 4)
    - `grep -q "gh-radar-supabase-service-role" scripts/deploy-theme-sync.sh` exits 0 (기존 시크릿 재사용)
    - `grep -q "gh-radar-anthropic-api-key" scripts/deploy-theme-sync.sh` exits 0
    - `grep -q "0 16" scripts/deploy-theme-sync.sh` exits 0 (16:00 KST schedule)
    - Dockerfile 이 theme-sync 로 치환됨 (master-sync 문자열 없음)
  </acceptance_criteria>
  <done>Dockerfile + setup/deploy/smoke 스크립트가 master-sync 복제 + OAuth invoker + 기존 시크릿 3종 재사용으로 작성, 문법 green.</done>
</task>

<task type="auto">
  <name>Task 2: Playwright E2E (themes 목록 + 유저 CRUD + 종목 칩)</name>
  <files>webapp/e2e/themes.spec.ts, webapp/e2e/user-themes.spec.ts, webapp/e2e/theme-chips.spec.ts</files>
  <read_first>
    - .planning/phases/10-theme-classification/10-VALIDATION.md §Phase Requirements Test Map (E2E 행)
    - webapp/e2e/ 기존 spec (storageState auth fixture + 셀렉터 패턴)
    - .planning/phases/10-theme-classification/10-UI-SPEC.md §S1~S4 (검증 대상 카피/구조)
    - MEMORY: feedback_check_dev_sh_first (PORT=3100)
  </read_first>
  <action>
    기존 Playwright 셋업(storageState auth fixture, dev PORT=3100) 재사용:
    1. themes.spec.ts — /themes 진입 → 시스템 테마 랭킹 리스트 렌더(상위3평균 표시) + 행 클릭 → /themes/[id] 종목 리스트(scanner row) + 종목 클릭 → /stocks/[code] 이동.
    2. user-themes.spec.ts — 로그인 storageState → /themes [＋ 테마 만들기] 모달 → 테마 생성 → 종목 add → 내 테마 섹션 상단 노출 → 편집(remove) → 삭제(확인). + 시스템 테마 fork → 내 테마 독립 생성 확인.
    3. theme-chips.spec.ts — /stocks/[code] (테마 보유 종목 예: 005930 or fixture 종목) → 테마 칩 표시 → 칩 클릭 → /themes/[id] 이동.
    셀렉터는 카피 계약(테마 만들기/상위 3종목 평균 등락률) + role 기반.
  </action>
  <verify>
    <automated>ls webapp/e2e/themes.spec.ts webapp/e2e/user-themes.spec.ts webapp/e2e/theme-chips.spec.ts && pnpm -F webapp build</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F webapp build` exits 0
    - `ls webapp/e2e/themes.spec.ts webapp/e2e/user-themes.spec.ts webapp/e2e/theme-chips.spec.ts` exits 0
    - themes.spec.ts: /themes → /themes/[id] → /stocks/[code] 이동 흐름 존재
    - user-themes.spec.ts: 생성/편집/삭제/fork 흐름 + storageState 로그인 사용
    - theme-chips.spec.ts: 칩 → /themes/[id] 이동 존재
    - (E2E green 은 Task 3 production/로컬 서버 기동 후 실행 — 여기선 spec 작성 + build 통과)
  </acceptance_criteria>
  <done>themes/user-themes/theme-chips E2E spec 작성 + webapp build green.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: [BLOCKING] GCP 배포 + production smoke + E2E 실행</name>
  <files>scripts/deploy-theme-sync.sh, scripts/smoke-theme-sync.sh</files>
  <read_first>
    - scripts/deploy-theme-sync.sh, setup-theme-sync-iam.sh, smoke-theme-sync.sh (Task 1)
    - .planning/phases/05.1-* (Cloud Run Job 배포 선례), MEMORY: reference_gh_radar_deployer_sa
    - .planning/phases/10-theme-classification/10-VALIDATION.md §Sampling Rate (Phase gate)
  </read_first>
  <what-built>theme-sync Dockerfile + setup/deploy/smoke 스크립트(Task 1) + E2E spec(Task 2). 전 워크스페이스 코드(Plan 02~07) 완료.</what-built>
  <action>
    GCP 인증(Deployer SA, GOOGLE_APPLICATION_CREDENTIALS + CLOUDSDK_CORE_PROJECT=gh-radar) 확인 후:
    1. bash scripts/setup-theme-sync-iam.sh — SA 생성 + 기존 시크릿 3종 accessor 바인딩.
    2. bash scripts/deploy-theme-sync.sh — Cloud Run Job gh-radar-theme-sync 빌드/배포 + invoker 바인딩 + Scheduler gh-radar-theme-sync-daily(16:00 KST OAuth) 생성.
    3. bash scripts/smoke-theme-sync.sh — Job 1회 execute → 로그 cycle complete + Supabase themes count > 0 검증.
    4. classifyEnabled 은 Plan 06 POC 게이트 결정 따름(통과 시 true, 미달 시 false 또는 ai_candidate).
    5. 로컬/preview 서버 기동 후 Playwright E2E 3종 실행(green 확인). dev PORT=3100.
    배포/스모크 실패 시 STOP 후 보고 — 강제 진행 금지. 권한 에러 시 사용자에게 인증 확인 요청.
  </action>
  <how-to-verify>
    1. `gcloud run jobs describe gh-radar-theme-sync` 존재 + `gcloud scheduler jobs describe gh-radar-theme-sync-daily` schedule 0 16 Asia/Seoul OAuth
    2. smoke: Job execute 후 themes count > 0 (네이버 ~265 + 알파 정치 테마 적재)
    3. /themes production URL 에서 테마 랭킹 + 종목 + 칩 표시 (사용자 mockup 대조)
    4. Playwright E2E 3 spec green
  </how-to-verify>
  <resume-signal>배포 완료 + themes count > 0 + E2E green 확인 후 "approved" 입력. 실패 시 에러 보고.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cloud Scheduler → Cloud Run Job | OAuth bearer 인증 경계 (OIDC 불가) |
| Cloud Run Job → GCP Secret Manager | service-role/brightdata/anthropic 시크릿 접근 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-08-01 | Elevation of Privilege | Scheduler→Job 인증 | mitigate | --oauth-service-account-email 사용, OIDC 금지(Pitfall 4, 05.1 선례). 실패 시 401 로 미실행 |
| T-10-08-02 | Information Disclosure | 시크릿 평문 노출 | mitigate | GCP Secret Manager set-secrets(평문 env 금지) + theme-sync SA 최소 accessor 바인딩 |
| T-10-08-03 | Tampering | 잘못된 SA 권한으로 타 리소스 접근 | mitigate | gh-radar-theme-sync-sa 는 시크릿 3종 accessor + Supabase service-role 만. 최소 권한 |
| T-10-08-04 | DoS | Job 무한 재시도 | mitigate | --max-retries=1 + --task-timeout=600s. Scheduler 일1회(5원칙 #1) |
</threat_model>

<verification>
- `bash -n` 으로 3 스크립트 문법 green + Dockerfile theme-sync 치환 (Task 1)
- `pnpm -F webapp build` + E2E spec 3종 작성 (Task 2)
- [BLOCKING] GCP 배포(Job+Scheduler OAuth) + smoke themes count > 0 + E2E green (Task 3)
</verification>

<success_criteria>
- SC#2 충족: theme-sync 가 Cloud Run Job + Scheduler 일1회 16:00 KST 실행 (SHA256 해시 skip 은 Plan 03)
- SC#3 충족: 일1회 캡 + OAuth invoker (5원칙 운영)
- 전 phase 통합 검증: production themes count > 0 + /themes·/themes/[id]·칩 E2E green
- THEME-01~04 전부 production 동작 확인
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-08-SUMMARY.md`
</output>
