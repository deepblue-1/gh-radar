---
phase: 10-theme-classification
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - workers/theme-sync/package.json
  - workers/theme-sync/tsconfig.json
  - workers/theme-sync/vitest.config.ts
  - workers/theme-sync/src/logger.ts
  - workers/theme-sync/src/retry.ts
  - workers/theme-sync/src/services/supabase.ts
  - workers/theme-sync/tests/fixtures/naver-theme-list.html
  - workers/theme-sync/tests/fixtures/naver-theme-detail.html
  - workers/theme-sync/tests/fixtures/alpha-all-themes.json
  - workers/theme-sync/tests/fixtures/alpha-stocks.json
  - workers/theme-sync/tests/helpers/supabase-mock.ts
  - pnpm-workspace.yaml
autonomous: true
requirements: [THEME-01, THEME-04]
must_haves:
  truths:
    - "theme-sync 워크스페이스가 pnpm 에 인식되고 vitest 가 0 test 로 exit 0"
    - "네이버/알파스퀘어 실측 fixture 가 캡처되어 Wave 2 파서 unit test 가 참조 가능"
    - "cheerio/iconv-lite/anthropic-sdk/p-limit 가 theme-sync 의존성에 설치됨"
  artifacts:
    - path: "workers/theme-sync/vitest.config.ts"
      provides: "워커 테스트 러너 (master-sync/discussion-sync 복사)"
    - path: "workers/theme-sync/tests/fixtures/naver-theme-list.html"
      provides: "네이버 테마 목록 EUC-KR 디코딩 실측 HTML (table.type_1.theme)"
    - path: "workers/theme-sync/tests/fixtures/alpha-all-themes.json"
      provides: "알파스퀘어 all-themes 실측 JSON (정치 카테고리 포함)"
    - path: "workers/theme-sync/tests/helpers/supabase-mock.ts"
      provides: "Supabase service-role mock (discussion-sync 패턴)"
  key_links:
    - from: "pnpm-workspace.yaml"
      to: "workers/theme-sync"
      via: "packages glob 등록"
      pattern: "workers"
---

<objective>
theme-sync 워커 워크스페이스를 스캐폴드하고, Nyquist 검증의 토대가 될 테스트 인프라(vitest + Supabase mock)와 외부 소스 실측 fixture(네이버 EUC-KR HTML 2종, 알파스퀘어 JSON 2종)를 확보한다. Wave 0 — 모든 후속 wave 의 automated verify 가 이 fixture/mock 에 의존한다.

Purpose: 후속 plan 의 모든 태스크가 automated verify 를 가질 수 있도록 테스트 토대를 먼저 만든다(VALIDATION.md Wave 0 Gaps 해소). 외부 API 는 변동 가능하므로(RESEARCH valid_until 2026-07-09) 실측 fixture 를 지금 캡처해 파서 회귀를 고정한다.
Output: theme-sync 워크스페이스 골격 + 4 fixture + supabase-mock + cheerio/iconv-lite 설치.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/10-theme-classification/10-RESEARCH.md
@.planning/phases/10-theme-classification/10-VALIDATION.md

<interfaces>
master-sync 스캐폴드 = 복제 기준. 실행자는 아래 파일을 그대로 복사 후 master-sync→theme-sync 치환.

workers/master-sync/package.json (복제 기준 — name 만 @gh-radar/theme-sync 로):
scripts: dev(tsx), build(tsc), typecheck(tsc --noEmit), test(vitest run)
deps: @gh-radar/shared workspace:*, @supabase/supabase-js ^2.49.0, axios ^1.7.0, dotenv ^16.4.0, pino ^9.0.0
devDeps: tsx ^4.0.0, typescript ^5.0.0, vitest ^3.0.0, @types/node ^22.0.0

workers/discussion-sync/vitest.config.ts (복제 기준): defineConfig, test.include = tests glob + src glob, environment node, passWithNoTests true

discussion-sync/src/services/supabase.ts: export function createSupabaseClient(url, serviceRoleKey) returns SupabaseClient
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: theme-sync 워크스페이스 스캐폴드 (master-sync 복제)</name>
  <read_first>
    - workers/master-sync/package.json, tsconfig.json, src/retry.ts, src/services/supabase.ts (복제 원본)
    - workers/discussion-sync/src/logger.ts (redact 패턴), workers/discussion-sync/vitest.config.ts (passWithNoTests)
    - pnpm-workspace.yaml (workers glob 확인)
  </read_first>
  <action>
    workers/theme-sync/ 생성 후 master-sync 에서 복사:
    1. package.json — master-sync 복사, name 을 "@gh-radar/theme-sync" 로 변경. dependencies 에 cheerio ^1.0.0, iconv-lite ^0.6.3, @anthropic-ai/sdk ^0.65.0, p-limit ^7.0.0 추가. 나머지 deps 유지.
    2. tsconfig.json — master-sync 복사 (변경 없음).
    3. vitest.config.ts — discussion-sync 복사 + passWithNoTests true.
    4. src/logger.ts — discussion-sync/src/logger.ts 복사. redact paths 를 theme-sync 시크릿에 맞춤: brightdataApiKey, anthropicApiKey, supabaseServiceRoleKey, headers.authorization, access_token, token, Authorization.
    5. src/retry.ts — master-sync/src/retry.ts 복사 (withRetry).
    6. src/services/supabase.ts — discussion-sync 복사 (createSupabaseClient url serviceRoleKey).
    pnpm-workspace.yaml 에 workers glob 있으면 그대로, 없으면 추가.
    설치: pnpm -F @gh-radar/theme-sync add cheerio iconv-lite @anthropic-ai/sdk p-limit
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/theme-sync test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/theme-sync test` exits 0 (passWithNoTests)
    - `grep -q "@gh-radar/theme-sync" workers/theme-sync/package.json` exits 0
    - `grep -q cheerio workers/theme-sync/package.json` exits 0 (and iconv-lite present)
    - `grep -q createSupabaseClient workers/theme-sync/src/services/supabase.ts` exits 0
    - `grep -q brightdataApiKey workers/theme-sync/src/logger.ts` exits 0 (and anthropicApiKey present)
  </acceptance_criteria>
  <done>theme-sync 워크스페이스가 pnpm 에 인식되고 vitest exit 0, cheerio/iconv-lite/anthropic-sdk/p-limit 설치 완료.</done>
</task>

<task type="auto">
  <name>Task 2: 네이버/알파스퀘어 실측 fixture 캡처 + supabase-mock 헬퍼</name>
  <read_first>
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 2 (네이버 URL/구조), §Pattern 3 (알파 JSON 엔드포인트), §Validation Architecture Wave 0 Gaps
    - workers/discussion-sync/src/classify/__tests__/classifyBatch.test.ts (Supabase v2 builder mock 패턴 참고)
  </read_first>
  <action>
    실측 fixture 캡처. EUC-KR 은 UTF-8 변환 후 저장:
    1. tests/fixtures/naver-theme-list.html — curl finance.naver.com/sise/theme.naver?page=1 응답을 iconv -f EUC-KR -t UTF-8 변환 후 저장. table.type_1.theme + sise_group_detail.naver?type=theme anchor 포함.
    2. tests/fixtures/naver-theme-detail.html — curl finance.naver.com/sise/sise_group_detail.naver?type=theme&no=536 동일 변환 저장 (HBM ~33종목). table.type_5 + item/main.naver?code= 포함.
    3. tests/fixtures/alpha-all-themes.json — curl api.alphasquare.co.kr/theme/v2/all-themes 저장 (UTF-8 JSON). 정치 카테고리 + themes 배열 포함.
    4. tests/fixtures/alpha-stocks.json — curl api.alphasquare.co.kr/theme/v2/themes/6/stocks 저장 (이재명 ~40종목). code + country_code 필드 포함.
    5. tests/helpers/supabase-mock.ts — createMockSupabase() 가 from/select/eq/in/is/maybeSingle/single 및 rpc 체이닝을 vi.fn 기반으로 지원. final method 에서 mockResolvedValue 주입 가능. discussion-sync 테스트 mock 패턴 복제.
    ※ curl 이 IP 차단(403, Pitfall 1)으로 실패하면 RESEARCH §Pattern 2/3 의 실측 구조로 minimal fixture 손작성(네이버 최소 2 테마 anchor + 상세 3 종목 row, 알파 정치 카테고리 1개 + themes 2개 + stocks 3개). 파서 검증용이라 전체 페이지 불필요.
  </action>
  <verify>
    <automated>ls workers/theme-sync/tests/fixtures/naver-theme-list.html workers/theme-sync/tests/fixtures/naver-theme-detail.html workers/theme-sync/tests/fixtures/alpha-all-themes.json workers/theme-sync/tests/fixtures/alpha-stocks.json workers/theme-sync/tests/helpers/supabase-mock.ts</automated>
  </verify>
  <acceptance_criteria>
    - `ls` of all 4 fixtures + supabase-mock.ts exits 0 (files exist, non-empty)
    - `grep -q theme workers/theme-sync/tests/fixtures/naver-theme-list.html` exits 0 (sise_group_detail anchor captured)
    - `grep -q country_code workers/theme-sync/tests/fixtures/alpha-stocks.json` exits 0
    - `grep -q createMockSupabase workers/theme-sync/tests/helpers/supabase-mock.ts` exits 0
  </acceptance_criteria>
  <done>4 fixture + supabase-mock 캡처 완료, Wave 2 파서 unit test 가 참조 가능.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 외부 스크랩 소스 → fixture | 네이버/알파 응답을 테스트 fixture 로 저장 (실행 코드 아님, 표시 경로 없음) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-01-01 | Information Disclosure | logger.ts redact | mitigate | brightdataApiKey/anthropicApiKey/supabaseServiceRoleKey redact 경로를 Task 1 에서 포함 (discussion-sync 선례) |
| T-10-01-02 | Tampering | fixture 무결성 | accept | fixture 는 테스트 전용, production 경로 없음. 손작성 fallback 도 파서 구조 검증만 |
</threat_model>

<verification>
- `pnpm -F @gh-radar/theme-sync test` exits 0 (passWithNoTests, Wave 0 시점 0 test 허용)
- 4 fixture + supabase-mock 파일 존재 + non-empty
- cheerio/iconv-lite/@anthropic-ai/sdk/p-limit 설치 확인 (package.json grep)
</verification>

<success_criteria>
- theme-sync 워크스페이스가 pnpm workspace 에 인식되고 vitest 가 green (0 test exit 0)
- 네이버 EUC-KR 디코딩 HTML 2종 + 알파 JSON 2종 fixture 가 실측(or minimal) 캡처됨
- supabase-mock 헬퍼가 Supabase v2 builder 체이닝을 지원해 Wave 2+ integration test 가 사용 가능
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-01-SUMMARY.md`
</output>
