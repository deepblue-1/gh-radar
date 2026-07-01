# Phase 13: 홈 화면 — 오늘의 급등 테마 AI 분석 - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

앱 루트(`/`)에 새 **"홈"** 화면을 신설한다. 오늘 **+20% 이상 급등**한 종목들을 기존 큐레이션 테마(`themes`/`theme_stocks`)와 **무관하게 AI(Claude Haiku)가 bottom-up 으로 순수 발견·클러스터링**하여, "오늘의 상승을 이끈 테마 · 상승 이유 · 소속 종목"을 **뉴스 근거와 함께** 제시한다.

데이터 흐름:
1. 신규 `home-sync` 워커(Cloud Run Job)가 **장중 매시 :30**(9:30·10:30···15:30 마감직후)에 실행.
2. `top_movers ⋈ stock_quotes`(change_rate ≥ +20%) + 급등 종목들의 `news_articles`를 읽음.
3. **급등집합 + 뉴스 content hash 가 직전 스냅샷과 동일하면 Claude 호출 skip**(비용/일관성 가드, theme-sync hash 패턴 재사용).
4. 변경 시 **Claude Haiku 1회**(temp=0, JSON-only) 호출 → bottom-up 클러스터링.
5. `home_theme_snapshots`(**날짜 + :30 시점별 row**)에 저장.
6. 웹앱 `/` 는 **read-only** 로 표시 + 날짜/장중 시점 네비.

**핵심 가치:** 트레이더가 "오늘 실제로 함께 오른 종목이 무엇이고, 왜 올랐는지"를 뉴스 근거와 함께 앱 첫 화면에서 즉시 파악.

**Requirements:** TBD (plan 단계에서 **HOME-01** 신규 추가 확정 — REQUIREMENTS.md 갱신 필요).

**⚠️ 프론트 성격 강함:** 홈 UI(카드 정보 구성 + 날짜/시점 네비 + 개별 급등 섹션 + 빈 상태)가 커서 plan-phase 의 UI gate 가 UI-SPEC 을 요구할 가능성 높음. 본 CONTEXT 는 **정보 구조(무엇을 보여줄지)** 를 확정하고, 픽셀/레이아웃 세부는 UI-SPEC 에 위임.

</domain>

## 이전 phase / 사전 논의에서 이미 결정된 것 (carry forward — 재질문 안 함)

STATE.md "Phase 13 added 2026-07-01" 로드맵 진화 항목(사용자와 사전 설계 논의 완료)에서 확정된 골격:

- **클러스터링 = bottom-up** — 기존 큐레이션 테마(`themes`/`theme_stocks`) 미참조, 순수 발견. Phase 10 시스템 테마와 **다른 축**.
- **근거 = `news_articles`** — 이미 news-sync 가 수집 중인 데이터 재사용. **신규 외부 호출 0** → 크롤링 5원칙 자연 준수(home-sync 자체는 크롤링 없음, 순수계산 + Claude).
- **갱신 = 장중 매시 :30** — Cloud Scheduler intraday(9:30~15:30, 마감직후 포함).
- **임계값 = +20% 고정** — 급등 없는 날은 빈 상태 표시.
- **단일종목 = 별도 '개별 급등' 섹션** — 2종목 이상 묶이면 '테마' 카드, 1종목이면 개별 급등.
- **이력 = 일별 스냅샷 누적** — (본 논의에서 **시점별 row 보존**으로 구체화, D-01).
- **홈 = 루트(`/`) 승격** — 기존 `/scanner` 리다이렉트를 홈으로 교체. 스캐너는 `/scanner` 유지, 사이드바 NAV 2번째로.
- **워커 배포 패턴** — Cloud Run Job `gh-radar-home-sync` + Cloud Scheduler **OAuth invoker (OIDC 금지**, Phase 05.1 Pitfall 2). theme-sync `anthropic.ts` 싱글톤 · `config` 재사용, **프롬프트만 신규**.
- **RLS 메모리 규칙** — 신규 테이블 `home_theme_snapshots` 는 `TO anon, authenticated` **둘 다 명시**(anon-only 시 로그인 유저 default-deny).
- **Haiku JSON 펜스 버그 가드** — Phase 10 lesson: `parseJson.extractJsonObject` 공유 유틸(첫 `{`~마지막 `}` 슬라이스)로 ` ```json ` 펜스 방어.
- **사전계산 → Supabase → read-only 워커 선례** — theme-sync(Phase 10) / limit-up-sync(Phase 12). on-demand fetch 금지, 배치가 미리 채운 스냅샷만 읽음.

<decisions>
## Implementation Decisions

### 갱신 / 저장 시맨틱
- **D-01:** `home_theme_snapshots` = **시점별 row 보존**. `(date, captured_at/time-slot)` 단위 1 row. 매 :30 마다 새 스냅샷을 **append**(같은 날 덮어쓰기 아님). 장중 테마 변화 시계열을 보존 → 트레이더가 "9:30엔 이 테마, 11:30엔 저 테마" 를 따라볼 수 있음. (권장안이던 "하루 1 row 덮어쓰기" 는 **폐기** — 사용자가 시계열 보존 선택.)

### 이력 / 네비 UX
- **D-02:** 홈 **기본 뷰 = 오늘 최신(:30) 스냅샷**. **v1 UI 가 날짜 + 장중 시점 둘 다 탐색** — 날짜 네비(과거 날짜)와 그 날 안의 :30 시점 탐색(9:30/10:30/···) 모두 v1 에 포함. (사용자가 "저장만 시점별, 표시는 날짜 단위" 권장안 대신 "장중 시점도 탐색" 선택 → 시점별 보존 데이터를 v1 에서 바로 활용.)
- **D-03:** **비교 = 날짜/시점 전환만**. 날짜·시점 네비로 "그 시점의 급등 테마"를 각각 보는 방식. **별도 나란히-비교(side-by-side) 뷰 없음** — "오늘 vs 어제 지속/신규 하이라이트" 같은 본격 비교는 deferred(별도 phase 후보).

### 뉴스 근거 표현 (핵심 가치)
- **D-04:** **테마당 대표 뉴스 1-2건**. Claude 가 그 테마의 상승 이유를 **가장 잘 설명하는 뉴스 1-2건**을 선별(제목 + 출처 + 링크). `news_articles` 의 `title`/`url` 을 **그대로 저장**(Claude 가 URL/제목을 지어내지 못하게 → 환각 방지, 입력 뉴스 중 선택만). 출처 표기(5원칙). (종목별 뉴스 전량 나열 / 요약 텍스트만은 폐기 — 근거 추적성 + 간결성 균형.)

### 정렬 / 우선순위
- **D-05:** **주도 테마 정렬 = 소속 급등종목 수 desc, 동수면 평균 등락률 desc**. "가장 많은 종목이 함께 오른 테마"가 오늘의 주도 = **breadth(폭) 우선**. 소수(1종목) 강력 급등은 D-06 의 '개별 급등' 섹션으로 자연 분리. (Phase 10 의 "상위 3종목 평균 등락률"[강도 우선] / 거래대금 합은 폐기 — 홈은 "오늘 시장을 움직인 테마" 조망이 목적.)

### 임계값 / 섹션 구성 (carry-forward 재확인)
- **D-06:** +20% 고정 임계값. **2종목 이상 클러스터 = 테마 카드**, **1종목 = '개별 급등' 섹션**(별도). 급등 없는 날 = 빈 상태("오늘은 +20% 급등 종목이 없습니다" 류). 개별/테마 판정은 Claude 클러스터링 결과 기반.

### Claude's Discretion (planner/researcher/UI-SPEC 재량)
- `home_theme_snapshots` 정확 스키마 — 시점별 row 키 형태(`date` + `captured_at`), 테마/종목/뉴스를 **JSON blob per row** vs **정규화 테이블** 저장.
- **hash-skip 가드 × 시점별 row 상호작용** — 콘텐츠(급등집합+뉴스 hash)가 직전 슬롯과 동일할 때: 새 시점 row 를 **아예 skip** vs 이전 스냅샷 참조/복제로 append. (시계열 연속성 vs 중복 저장 트레이드오프 — planner 결정.)
- Claude **프롬프트 설계** — bottom-up 클러스터링 지시, JSON 출력 계약, 테마명 생성 규칙, 상승이유 요약 톤/길이, 대표 뉴스 선별 기준, 개별 급등(1) vs 테마(2+) 판정.
- 소속 종목 카드 표시 개수(top N + "+N개") — UI-SPEC.
- 장중 시점 네비 UI 형태(슬라이더 vs 드롭다운 vs 탭) + 날짜 네비 형태 — UI-SPEC.
- '개별 급등' 섹션에도 뉴스 근거(1-2건) 부여 여부/형태.
- 등락률 source — 홈은 장중 화면이라 `stock_quotes.change_rate`(scanner 동형). 장외 시간대 표시 정책.
- `home-sync` cron 정확 표현(`30 9-15 * * 1-5` vs `0,30 9-15 ...`), 마감(15:30) 직후 슬롯 포함 방식.
- `/api/home` 응답 계약(latest 스냅샷 + 탐색용 날짜/시점 목록).
- 테스트 범위(unit: 클러스터 파싱/정렬, integration: 스냅샷 upsert+RLS, E2E: `/` 홈 표시 + 날짜/시점 네비).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 전체
- `.planning/ROADMAP.md` §"Phase 13: 홈 화면 — 오늘의 급등 테마 AI 분석" — Goal / Depends(Phase 12)
- `.planning/REQUIREMENTS.md` — **HOME-01 신규 추가 필요**(홈 급등 테마 AI 분석) + Traceability/커버리지 갱신
- `.planning/PROJECT.md` — vision(Core Value: 급등 포착 + AI 심리 파악), News/Stock Data Sources, "무료 API 우선" 제약
- `.planning/STATE.md` — "Phase 13 added 2026-07-01" 로드맵 진화 항목(**확정 결정 원본** — bottom-up/근거/갱신/임계값/섹션/이력/루트승격/데이터흐름/구성)
- `CLAUDE.md` §"Naver 종목토론방 Scraping Risk" — 크롤링 운영 5원칙. **본 phase 는 news_articles 재사용으로 신규 외부호출 0** → home-sync 자체 크롤링 없음(순수계산+Claude). 출처 표기만 준수.

### 선행 phase 아티팩트 (필수 참조)
- `.planning/phases/10-theme-classification/10-CONTEXT.md` — theme-sync 워커, `anthropic.ts` 싱글톤, `ai/` 모듈, AI 클러스터링/발굴 패턴, Cloud Run Job/Scheduler OAuth invoker, `parseJson.extractJsonObject` 펜스 가드, hash 변경감지 skip
- `.planning/phases/12-a-n-master-sync/12-CONTEXT.md` — limit-up-sync = **사전계산 → Supabase → read-only** 워커 선례, 응답 **객체 계약**(배열 아님), read-only 표시(on-demand fetch 금지)
- `.planning/phases/07-news-ingestion/07-CONTEXT.md` — `news_articles`(AI 근거 입력 소스), 섹션/에러 패턴
- `.planning/phases/09.1-intraday-current-price/09.1-CONTEXT.md` — intraday-sync 워커(`top_movers`/`stock_quotes` 매분 갱신 주체), intraday cron `* 9-15 * * 1-5` 선례
- `.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/` — Cloud Run Job + Scheduler + SA + Secret 배포 템플릿 + **Pitfall 2 (OAuth invoker, OIDC 금지)**

### 소스 코드 — 재사용/복제 기준
- `workers/theme-sync/src/config.ts` · `src/index.ts` · `src/ai/anthropic.ts` · `src/ai/prompt.ts` — **home-sync 1:1 클론 기준**(프롬프트만 신규)
- `workers/theme-sync/Dockerfile` · `scripts/deploy-theme-sync.sh` — 배포 템플릿(Cloud Run Job 512Mi + Scheduler + Secret 재사용 SUPABASE_SERVICE_ROLE_KEY/ANTHROPIC_API_KEY)
- `scripts/deploy-intraday-sync.sh` (cron `* 9-15 * * 1-5`, scheduler `gh-radar-intraday-sync-cron`) — **intraday :30 스케줄러 참조**
- `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql` — `top_movers`(code/name/market/rank/ranked_at) + `stock_quotes`(change_rate numeric(8,4)/price/name/market/trade_amount) 스키마
- `supabase/migrations/20260413120000_init_tables.sql` + `20260417120200_news_description.sql` — `news_articles`(id/stock_code/title/source/url/published_at/description, unique(stock_code,url), idx(stock_code,published_at DESC))
- `supabase/migrations/20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql` — RLS `TO anon, authenticated` 명시 선례(신규 테이블 복제 기준)
- `server/src/routes/scanner.ts` — **`top_movers ⋈ stock_quotes` 조인 + `.in()` 청크 패턴**(`/api/home` 라우트 기준)
- `server/src/routes/themes.ts` — read-only 시스템 데이터 라우트 패턴
- `server/src/app.ts` — 라우트 등록(`app.use("/api/home", ...)`) + rate-limit 미들웨어
- `webapp/src/app/page.tsx` — **현재 `/scanner` 서버 리다이렉트 → 홈 페이지로 교체 지점**
- `webapp/src/app/scanner/page.tsx` — `AppShell + Suspense + Skeleton` **새 홈 페이지 구조 템플릿**(`export const dynamic='force-dynamic'`)
- `webapp/src/components/layout/app-sidebar.tsx` — **NAV 배열**(href/label/icon; 홈 진입점 추가 + 스캐너 2번째 재정렬)
- `packages/shared/src/theme.ts` — camelCase 타입 계약 위치(**신규 `home.ts`**: HomeThemeSnapshot/HomeSurgeTheme/HomeSurgeStock/HomeNewsRef)
- `webapp/src/lib/api.ts` — `apiFetch`, `ApiClientError`, `X-Request-Id`
- `packages/shared` `parseJson.extractJsonObject` — Haiku JSON 펜스 방어 유틸(Phase 10 신설)

### 외부 의존
- Claude Haiku 4.5 (`claude-haiku-4-5`, temp=0, JSON-only) — theme-sync `anthropic.ts` 싱글톤 재사용, GCP Secret `ANTHROPIC_API_KEY`(기존)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **theme-sync 워커 스택** — `anthropic.ts`(Claude Haiku lazy 싱글톤), `config.ts`(env 로더), `ai/prompt.ts`, `Dockerfile`, `scripts/deploy-theme-sync.sh`. home-sync 는 이 구조 1:1 클론 후 식별자/프롬프트만 교체(신규 외부 소스 0).
- **사전계산→Supabase→read-only 워커 선례** — theme-sync / limit-up-sync. 워커가 배치로 스냅샷 채우고 웹앱은 읽기만.
- **scanner.ts 라우트** — `top_movers ⋈ stock_quotes` 조인 + `.in()` 청크 → `/api/home` 데이터 페치 재사용.
- **scanner/page.tsx + AppShell + Suspense + Skeleton** — 새 홈 페이지 구조.
- **app-sidebar.tsx NAV 배열** — 홈 진입점 추가.
- **parseJson.extractJsonObject** — Haiku JSON 펜스 가드(Phase 10 라이브 버그 수정 유틸).

### Established Patterns
- service_role 쓰기(워커) + anon/authenticated 읽기(RLS 둘 다 명시).
- Cloud Run Job `gh-radar-home-sync` + Scheduler **OAuth invoker(OIDC 금지)**.
- 마이그레이션 `YYYYMMDDHHMMSS_` prefix. 신규 테이블 `home_theme_snapshots` **필요**.
- Claude Haiku temp=0, JSON-only, 펜스-tolerant 파서.
- **hash 변경감지 skip 가드** — theme-sync 는 24h 콘텐츠 hash; home-sync 는 **급등집합 + 뉴스 content hash** 가 직전 시점 스냅샷과 동일하면 Claude 호출 skip.

### Integration Points
- `top_movers` / `stock_quotes` = **intraday-sync 워커가 매분 갱신**(home-sync 읽기 소스, change_rate ≥ +20% 필터).
- `news_articles` = **news-sync 수집분**(급등종목 `stock_code IN (...)` 쿼리, `published_at DESC`).
- `webapp/src/app/page.tsx` = 현재 `/scanner` 리다이렉트 → **홈 페이지로 교체**(스캐너는 `/scanner` 라우트 유지).
- `home_theme_snapshots`(신규) = 시점별 스냅샷; 종목 참조는 코드 문자열(FK 는 stocks 존재 종목만, planner 판단).
- `/api/home`(신규 라우트) → `server/src/app.ts` 등록.
- 사이드바 NAV — 홈 1번째, 스캐너 2번째.

</code_context>

<specifics>
## Specific Ideas

- **시점별 스냅샷 보존 + 장중 시점 탐색** (사용자 명시) — "하루 1 row 최신본"보다 장중 테마 변화 시계열을 트레이더가 따라볼 수 있게. 저장은 `(date, :30 시점)` row, v1 UI 가 날짜 + 장중 시점 둘 다 탐색.
- **bottom-up 클러스터링** (사용자 명시) — 큐레이션 테마 미참조. "오늘 실제로 함께 오른 종목"을 뉴스로 순수 발견. Phase 10 시스템 테마(수집 기반)와 다른 축.
- **뉴스 근거 필수** — `news_articles` 재사용, 신규 외부호출 0(5원칙 자연 준수). home-sync 자체는 크롤링 없음(순수계산 + Claude). 테마당 대표 뉴스 1-2건.
- **정렬 breadth 우선**(급등종목 수) — "가장 많은 종목이 함께 오른 테마"가 오늘의 주도. 소수 강력 급등은 개별 급등 섹션으로 분리.
- **홈 루트 승격** — 앱 첫 인상을 "오늘 뭐가 왜 올랐나"로. 스캐너는 2번째.

</specifics>

<deferred>
## Deferred Ideas

- **장중 시점 시계열 차트/슬라이더 고도화** (테마별 시간대 등락 변화 그래프) — 데이터 누적 후 재검토.
- **오늘 vs 어제 나란히-비교(side-by-side) 뷰** — 지속/신규 테마 하이라이트. 별도 phase 후보(본 phase 는 날짜/시점 전환만).
- **테마 기반 알림** (특정 급등 테마 발생 시 푸시) — v2 NOTF-*.
- **개별 급등 종목 → 동조 후보 연계** — Phase 11 co-movement 재사용(개별 급등 카드에서 "따라 오를 후보" 링크).
- **home-sync 결과를 Phase 10 시스템 테마로 승격/피드백** — bottom-up 발견 테마를 큐레이션 테마 후보로. 데이터 관찰 후.

### Reviewed Todos (not folded)
(해당 없음 — 매칭 todo 0건)

</deferred>

---

## Open for Planner

1. **REQUIREMENTS 확장** — `HOME-01`(홈 급등 테마 AI 분석) 신규 추가 + Traceability/커버리지 갱신.
2. **`home_theme_snapshots` 스키마** — 시점별 row 키(`date` + `captured_at`), JSON blob vs 정규화, RLS `TO anon, authenticated` 둘 다 명시.
3. **Claude 프롬프트** — bottom-up 클러스터링 지시, JSON 계약, 테마명/상승이유/대표뉴스(1-2건) 선별, 개별 급등(1) vs 테마(2+) 판정. POC 로 비용/정확도 검증(theme-sync ~$1.83/월 선례).
4. **hash-skip 가드 × 시점별 row** — 동일 콘텐츠 슬롯 처리(skip vs 참조 복제).
5. **home-sync 워커** — theme-sync 클론, cron `30 9-15 * * 1-5`(+마감 슬롯 포함 방식), OAuth invoker, Secret 재사용(신규 0).
6. **`/api/home` 응답 계약** — latest 스냅샷(객체) + 탐색용 날짜/시점 목록.
7. **홈 UI** — 카드 정보 구성(테마명/상승이유/소속종목 top N/대표뉴스 1-2건), 개별 급등 섹션, 날짜+장중 시점 네비, 빈 상태. **UI-SPEC 후보**(plan-phase UI gate).
8. **Wave 분할** — 권장: 마이그레이션(home_theme_snapshots) → home-sync 워커(프롬프트+클러스터링+hash 가드) → `/api/home` 라우트 → 홈 페이지+네비 UI → 사이드바/루트 교체 → 배포 → E2E.
9. **테스트** — unit(클러스터 파싱/정렬 D-05), integration(스냅샷 upsert+RLS), E2E(`/` 홈 + 날짜/시점 네비 + 빈 상태).

---

*Phase: 13-home-surge-themes*
*Context gathered: 2026-07-01*
