---
phase: 10-theme-classification
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - workers/theme-sync/src/config.ts
  - workers/theme-sync/src/scrape/fetchWithFallback.ts
  - workers/theme-sync/src/scrape/naver/parseThemeList.ts
  - workers/theme-sync/src/scrape/naver/parseThemeDetail.ts
  - workers/theme-sync/src/scrape/naver/fetchNaverThemes.ts
  - workers/theme-sync/src/scrape/alphasquare/fetchAlphaThemes.ts
  - workers/theme-sync/src/scrape/scrapeState.ts
  - workers/theme-sync/src/merge/normalizeName.ts
  - workers/theme-sync/src/merge/mergeThemes.ts
  - workers/theme-sync/src/pipeline/upsertThemes.ts
  - workers/theme-sync/src/pipeline/contentHash.ts
  - workers/theme-sync/src/proxy/client.ts
  - workers/theme-sync/src/proxy/errors.ts
  - workers/theme-sync/src/index.ts
  - workers/theme-sync/tests/scrape.test.ts
  - workers/theme-sync/tests/merge.test.ts
  - workers/theme-sync/tests/pipeline.test.ts
autonomous: true
requirements: [THEME-01]
must_haves:
  truths:
    - "네이버 EUC-KR HTML 이 iconv 로 디코딩되어 테마명/종목명이 깨지지 않는다"
    - "네이버 목록/상세 cheerio 파서가 테마 ID + 종목 code 를 추출한다"
    - "알파스퀘어 정치/시사 JSON 이 테마+종목으로 파싱된다"
    - "직접 fetch 403/429 시 Bright Data 프록시로 폴백한다"
    - "직접+프록시 모두 차단 시 24h backoff 상태가 저장되고 다음 cycle skip"
    - "콘텐츠 SHA256 동일 시 DB write 를 skip 한다"
    - "stocks 마스터에 없는 종목 code 는 per-stock skip"
  artifacts:
    - path: "workers/theme-sync/src/scrape/naver/parseThemeDetail.ts"
      provides: "table.type_5 → 종목 code/name/reason 추출"
    - path: "workers/theme-sync/src/scrape/fetchWithFallback.ts"
      provides: "직접 axios → 403/429 시 fetchViaProxy 폴백"
    - path: "workers/theme-sync/src/merge/normalizeName.ts"
      provides: "보수적 norm_key 정규화 (NFKC + 소문자 + 공백/특수문자 제거)"
    - path: "workers/theme-sync/src/pipeline/upsertThemes.ts"
      provides: "themes + theme_stocks effective UPSERT (FK skip)"
  key_links:
    - from: "fetchWithFallback"
      to: "fetchViaProxy"
      via: "403/429 차단 감지 후 프록시 재시도"
      pattern: "fetchViaProxy"
    - from: "upsertThemes"
      to: "theme_stocks"
      via: "service_role UPSERT effective_from/to"
      pattern: "theme_stocks"
---

<objective>
theme-sync 워커의 스크랩 파이프라인을 구현한다: 네이버 금융 테마(EUC-KR HTML, cheerio) + 알파스퀘어(공개 JSON API) 2-tier 수집 → 직접 fetch→403/429 시 Bright Data 프록시 폴백 → 보수적 이름 정규화 병합 → themes/theme_stocks service_role UPSERT → 콘텐츠 SHA256 변경 감지 + 429/403 24h backoff. **AI 보강은 제외(Plan 06).** 한국 크롤링 운영 5원칙을 구조적으로 반영한다.

Purpose: THEME-01 의 수집 코어. RESEARCH §Pattern 2/3/4/9 실측 구조 + discussion-sync proxy/api_usage 재사용. 5원칙(서버측 배치만, on-demand 금지, 24h 해시 캐싱, 429/403 24h backoff, 출처 표기 + 부분 캐싱)을 코드 레벨로 보장.
Output: 동작하는 스크랩→병합→upsert cycle (Cloud Run 배포는 Plan 08).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/10-theme-classification/10-RESEARCH.md
@CLAUDE.md

<interfaces>
복제/임포트 기준:

discussion-sync/src/proxy/client.ts (theme-sync 로 복사):
export function createProxyClient(cfg): AxiosInstance  // baseURL https 강제, Authorization Bearer
export function fetchViaProxy(client, cfg, targetUrl: string): Promise<string>  // body {zone, url, format:'raw', country:'kr'}, 401→ProxyAuthError, 402→Budget, 400/403→BadRequest, 429/503→retry once→NaverRateLimitError

discussion-sync/src/apiUsage.ts (패턴 복제, service 라벨 변경):
export function kstDateString(now?): string
export function checkBudget(supabase, dateKst): Promise<number>
export function incrementUsage(supabase, dateKst, amount?): Promise<number>  // rpc incr_api_usage
→ theme-sync: service 라벨 = 'theme_naver' / 'theme_alpha'. backoff_until 은 api_usage 테이블 재사용 or scrapeState 전용 관리.

RESEARCH §Pattern 2 실측 (네이버):
- 목록 GET /sise/theme.naver?page=N, EUC-KR. table.type_1.theme 내 a[href*="sise_group_detail.naver?type=theme"], no= 추출. ~7페이지. 마지막=직전 page 와 theme ID 집합 동일 시 stop.
- 상세 GET /sise/sise_group_detail.naver?type=theme&no={ID}. table.type_5 td.name a[href*="/item/main.naver?code="], code 6자리. p.info_txt = 편입사유(reason).
- axios responseType:'arraybuffer' → iconv.decode(Buffer.from(data),'EUC-KR'). text 금지(Pitfall 2).

RESEARCH §Pattern 3 실측 (알파스퀘어):
- ALPHA_BASE = https://api.alphasquare.co.kr
- GET /theme/v2/all-themes → {data:[{name(카테고리), themes:[{id,name,description,aliases[]}]}]}. POLITICS_CATEGORIES = {'정치','트렌드'}.
- GET /theme/v2/themes/{id}/stocks → [{code, ko_name, market, is_alive, country_code}]. country_code==='KR' && is_alive 필터.

RESEARCH §Pattern 4 정규화:
norm_key(name) = NFKC(name).toLowerCase().replace(공백,'').replace([·/-,],''). 정확 일치만 병합(Levenshtein 금지).

master-sync MIN_EXPECTED 가드 패턴: 응답 비정상 적으면 throw (Pitfall 10).
최근 회귀 37afcde: stock_quotes .in(codes) 대량 조회는 청크 분할 — upsert 도 chunk.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: fetch 레이어 (네이버 cheerio 파서 + 알파 JSON + fetchWithFallback + backoff)</name>
  <files>workers/theme-sync/src/config.ts, workers/theme-sync/src/proxy/client.ts, workers/theme-sync/src/proxy/errors.ts, workers/theme-sync/src/scrape/fetchWithFallback.ts, workers/theme-sync/src/scrape/naver/parseThemeList.ts, workers/theme-sync/src/scrape/naver/parseThemeDetail.ts, workers/theme-sync/src/scrape/naver/fetchNaverThemes.ts, workers/theme-sync/src/scrape/alphasquare/fetchAlphaThemes.ts, workers/theme-sync/src/scrape/scrapeState.ts, workers/theme-sync/tests/scrape.test.ts</files>
  <read_first>
    - workers/discussion-sync/src/proxy/client.ts, errors.ts (복사 기준)
    - workers/discussion-sync/src/apiUsage.ts (backoff/budget 패턴)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 2/3/9, §Pitfall 1/2/6/8
    - workers/theme-sync/tests/fixtures/ (Plan 01 캡처 fixture)
  </read_first>
  <behavior>
    - parseThemeList(html): table.type_1.theme fixture → [{no, name}] dedupe by no
    - parseThemeDetail(html): table.type_5 fixture → [{code, name, reason}] (6자리 code)
    - EUC-KR fixture 디코딩 → 한글 테마명 mojibake 없음
    - fetchAlphaThemes: alpha-all-themes.json fixture → 정치 카테고리만, /stocks fixture → KR+is_alive code 만
    - fetchWithFallback: 직접 fetch 가 403/429 throw → fetchViaProxy 호출 (mock 으로 검증)
    - scrapeState: 403/429 → backoff_until=now+24h 저장, cycle 시작 시 backoff 미경과면 source skip
  </behavior>
  <action>
    1. proxy/client.ts + errors.ts — discussion-sync 에서 복사 (theme-sync config 타입에 맞춤).
    2. config.ts — discussion-sync config 패턴. ThemeSyncConfig = supabaseUrl, supabaseServiceRoleKey, brightdataApiKey/Zone/Url, anthropicApiKey(Plan 06용), alphaApiBase(default https://api.alphasquare.co.kr), naverThemeBase(default https://finance.naver.com), themeSyncMaxPages(default 10), alphaCategories(default ['정치','트렌드']), classifyEnabled, classifyConcurrency, classifyModel(claude-haiku-4-5), appVersion, logLevel. req() helper.
    3. naver/parseThemeList.ts + parseThemeDetail.ts — RESEARCH §Pattern 2 cheerio 골격 verbatim.
    4. naver/fetchNaverThemes.ts — 목록 페이지네이션(page 1..maxPages, 직전 theme ID 집합 동일 시 stop) + 각 테마 상세 fetch. fetchFn 주입(fetchWithFallback). EUC-KR: arraybuffer + iconv.decode.
    5. alphasquare/fetchAlphaThemes.ts — RESEARCH §Pattern 3 골격 verbatim. JSON 응답 zod 검증.
    6. fetchWithFallback.ts — 직접 axios.get(arraybuffer/text) → catch 시 status 403/429/undefined 면 fetchViaProxy 재시도. 둘 다 차단이면 throw 후 scrapeState 가 backoff 기록.
    7. scrapeState.ts — api_usage 테이블 재사용(service='theme_naver'/'theme_alpha') 또는 backoff_until 컬럼 패턴. isBackedOff(source)/markBackoff(source). 5원칙 #4: 자동 지수 재시도 금지.
    8. scrape.test.ts — fixture 기반 파서 + iconv + fallback(mock) + backoff(mock) unit 테스트.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/theme-sync test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/theme-sync test` exits 0 (scrape.test.ts green)
    - `grep -q "EUC-KR" workers/theme-sync/src/scrape/naver/fetchNaverThemes.ts` exits 0 (iconv 디코딩)
    - `grep -q "fetchViaProxy" workers/theme-sync/src/scrape/fetchWithFallback.ts` exits 0
    - `grep -q "table.type_5" workers/theme-sync/src/scrape/naver/parseThemeDetail.ts` exits 0
    - `grep -q "country_code" workers/theme-sync/src/scrape/alphasquare/fetchAlphaThemes.ts` exits 0
    - scrape.test.ts 에 EUC-KR 디코딩 + 403→proxy fallback + 24h backoff 케이스 존재
  </acceptance_criteria>
  <done>네이버/알파 fetch + 파서 + 직접→프록시 폴백 + 24h backoff 가 fixture/mock 테스트로 green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 병합 + UPSERT + 콘텐츠 해시 파이프라인</name>
  <files>workers/theme-sync/src/merge/normalizeName.ts, workers/theme-sync/src/merge/mergeThemes.ts, workers/theme-sync/src/pipeline/upsertThemes.ts, workers/theme-sync/src/pipeline/contentHash.ts, workers/theme-sync/tests/merge.test.ts, workers/theme-sync/tests/pipeline.test.ts</files>
  <read_first>
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 4 (정규화/병합), §Pattern 1 DDL (theme_stocks effective), §Pitfall 5 (FK skip), §Code Examples (청크 IN)
    - workers/master-sync/src/pipeline/upsert.ts (UPSERT 패턴), src/index.ts (MIN_EXPECTED 가드)
    - workers/theme-sync/tests/helpers/supabase-mock.ts (Plan 01)
  </read_first>
  <behavior>
    - normalizeName: 'AI챗봇' 과 'ai 챗봇' 이 동일 norm_key, 'HBM(고대역폭메모리)' 괄호 유지(보수적)
    - mergeThemes: 네이버 ∪ 알파 동일 norm_key 병합, sources 배열 합집합, 종목 code 합집합
    - upsertThemes: 시스템 theme upsert(norm_key 충돌 시 update + sources append), theme_stocks UPSERT(effective_from=now, source 태그), stocks 미존재 code per-stock skip, 청크 분할
    - contentHash: 동일 콘텐츠 SHA256 시 write skip 반환
  </behavior>
  <action>
    1. normalizeName.ts — RESEARCH §Pattern 4: norm_key = NFKC(name).toLowerCase().replace(/\s+/g,'').replace(/[·/\-,]/g,''). 괄호 유지. Levenshtein 금지.
    2. mergeThemes.ts — 스크랩된 네이버+알파 ThemeScrape[] 를 norm_key 로 group. 동일 키 → 1 시스템 테마(name 은 네이버 우선 또는 더 짧은 것), sources 합집합, 종목 code 합집합(source 태그 보존).
    3. contentHash.ts — crypto.createHash('sha256') 로 스크랩 결과 직렬화 해시. 직전 해시(api_usage meta 또는 별도 저장)와 동일 시 skipWrite=true.
    4. upsertThemes.ts — service_role 로 themes UPSERT(onConflict norm_key WHERE is_system, sources array_append dedupe) + theme_stocks UPSERT. stocks 존재 확인(IN 청크 200) 후 미존재 code skip+로그(Pitfall 5). 제외된 종목 effective_to=now 마킹(편입/제외 이력). MIN_EXPECTED 가드(테마/종목 비정상 적으면 throw, Pitfall 10). 청크 분할(37afcde 교훈).
    5. merge.test.ts + pipeline.test.ts — 정규화/병합 unit + upsert(supabase-mock) FK skip + 해시 skip integration.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/theme-sync test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/theme-sync test` exits 0 (merge.test.ts + pipeline.test.ts green)
    - `grep -q "NFKC" workers/theme-sync/src/merge/normalizeName.ts` exits 0
    - `grep -q "sha256" workers/theme-sync/src/pipeline/contentHash.ts` exits 0
    - `grep -q "effective_to" workers/theme-sync/src/pipeline/upsertThemes.ts` exits 0
    - merge.test.ts: AI챗봇/ai 챗봇 동일 norm_key 케이스 + pipeline.test.ts: 미존재 종목 skip + 해시 동일 skip 케이스 존재
  </acceptance_criteria>
  <done>정규화/병합/해시/UPSERT 가 FK skip + 청크 + 이력 보존 + MIN_EXPECTED 가드 포함 green.</done>
</task>

<task type="auto">
  <name>Task 3: cycle 결선 (index.ts — 스크랩→병합→upsert, 5원칙 가드)</name>
  <files>workers/theme-sync/src/index.ts, workers/theme-sync/tests/pipeline.test.ts</files>
  <read_first>
    - workers/discussion-sync/src/index.ts (runDiscussionSyncCycle 구조 — budget precheck, stopAll, summary 로그)
    - workers/master-sync/src/index.ts (runMasterSync — withRetry, MIN_EXPECTED, main() CLI 진입)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 9, §Pitfall 8
  </read_first>
  <action>
    workers/theme-sync/src/index.ts — runThemeSyncCycle() 작성:
    1. loadConfig + createLogger + createSupabaseClient(service_role) + createProxyClient.
    2. 각 source(네이버/알파) 별로 scrapeState.isBackedOff 체크 → backoff 중이면 skip + 알림 로그(5원칙 #4).
    3. fetchNaverThemes + fetchAlphaThemes (withRetry, fetchWithFallback 주입). 차단(403/429) catch → markBackoff(24h) + 알림.
    4. contentHash 비교 → 동일 시 write skip 로그하고 종료(5원칙 #2).
    5. mergeThemes → upsertThemes(service_role). incrementUsage 로 api_usage 카운트(5원칙 #1 일1회 캡 검증).
    6. summary 로그(테마수/종목수/skipped/backoff). main() CLI 진입점(index.js endsWith 가드). AI 보강 호출 자리는 주석으로 표시(Plan 06 이 채움).
    pipeline.test.ts 에 cycle smoke(mock fetch + mock supabase → upsert 호출 검증) 추가.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/theme-sync test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/theme-sync test` exits 0
    - `pnpm -F @gh-radar/theme-sync build` exits 0 (tsc)
    - `grep -q "runThemeSyncCycle" workers/theme-sync/src/index.ts` exits 0
    - `grep -q "isBackedOff" workers/theme-sync/src/index.ts` exits 0 (5원칙 #4 backoff 게이트)
    - index.ts 가 contentHash skip + markBackoff + mergeThemes + upsertThemes 호출 순서 포함
  </acceptance_criteria>
  <done>runThemeSyncCycle 이 5원칙 가드(backoff/해시/일1회)를 포함해 스크랩→병합→upsert 를 결선, build+test green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 외부 스크랩 소스(네이버/알파 HTML·JSON) → 워커 | 미검증 외부 입력이 파싱/저장 경계를 넘음 |
| 워커(service_role) → themes/theme_stocks | 시스템 테마 쓰기 (RLS bypass — service_role) |
| 워커 → Bright Data 프록시 | 시크릿(BRIGHTDATA_API_KEY) 사용 + 고정 도메인만 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-03-01 | Tampering / XSS | 스크랩 테마명·reason 에 악성 HTML | mitigate | zod 검증 + 저장 전 정규화. 표시 측 React 자동 이스케이프(Plan 07). 6자리 code 정규식 필터 |
| T-10-03-02 | Information Disclosure | BRIGHTDATA/ANTHROPIC 토큰 로그 노출 | mitigate | pino redact(Plan 01 logger 7-path) + proxy client 가 status/byte length 만 로그 |
| T-10-03-03 | DoS / 법적 | 과호출로 차단 + 민사 DB권 | mitigate | 5원칙 코드 반영: 일1회 캡(api_usage) + 403/429 24h backoff(scrapeState, 자동 재시도 금지) + 콘텐츠 해시 캐싱 + 부분 캐싱(정치/트렌드만) |
| T-10-03-04 | SSRF | 프록시 url 파라미터 | mitigate | targetUrl 은 고정 도메인(naver/alphasquare)만 — 사용자 입력 url 없음 |
| T-10-03-05 | Tampering | FK 위반으로 batch 전체 실패 | mitigate | stocks 존재 확인 후 미존재 code per-stock skip(Pitfall 5) |
</threat_model>

<verification>
- `pnpm -F @gh-radar/theme-sync test` green (scrape/merge/pipeline 테스트)
- `pnpm -F @gh-radar/theme-sync build` exits 0
- EUC-KR 디코딩 + 403→프록시 폴백 + 24h backoff + 콘텐츠 해시 skip + FK skip 케이스가 테스트에 존재
</verification>

<success_criteria>
- SC#1 충족: 네이버(~265) + 알파 정치/시사 테마가 themes/theme_stocks 로 적재(effective + source + FK)
- SC#2 부분(해시): 콘텐츠 SHA256 동일 시 write skip
- SC#3 충족: 5원칙(일1회 캡 / 24h 해시 / 서버측 배치만 / 429·403 24h backoff / 출처표기+부분캐싱) 코드 반영
- SC#4 충족: iconv-lite EUC-KR→UTF-8 한글 무손상
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-03-SUMMARY.md`
</output>
