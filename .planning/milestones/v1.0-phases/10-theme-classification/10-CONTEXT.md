# Phase 10: Theme Classification — Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

한국 주식 "테마별 종목 묶기"를 수집·표시하고, 로그인 유저가 자신의 테마를 직접 만들고 편집할 수 있게 한다. 두 종류의 테마가 공존한다:

1. **시스템 테마 (read-only, 전역 공유)** — 네이버 금융 테마(산업/이벤트) + 알파스퀘어(정치인주/시사)를 일 1회 배치로 스크랩 → 이름 정규화 후 병합 → `themes`/`theme_stocks` 적재. 매일 갱신. 유저는 편집 불가(읽기만).
2. **유저 테마 (per-user CRUD)** — 로그인 유저가 본인 소유로 생성/편집/삭제 + 종목 add/remove. watchlist(Phase 06.2)와 동일한 per-user 소유 + RLS 모델. 스크래퍼가 절대 건드리지 않음(충돌 0). 시스템 테마를 **스냅샷 복사(fork)** 해서 시작 가능.

추가로 **AI 보강** — Claude Haiku로 뉴스 기반 신규 시스템 테마 후보 발굴 + 종목 오분류 교정. (기존 discussion-sync classify 패턴 재사용.)

표시: 웹앱 `/themes`(내 테마 상단 고정 + 시스템 테마, 소속 종목 등락률 상위 3종목 평균 순 정렬), `/themes/[id]` 상세(scanner row 재사용), `/stocks/[code]` 에 "이 종목의 테마" 칩(시스템 + 내 테마).

**한 종목 = 여러 테마** (M:N 태그). 매핑은 `theme_stocks` 조인.

Requirements: THEME-01(수집), THEME-02(표시). **⚠️ 논의 중 스코프 확장** — 유저 CRUD + AI 보강은 THEME-01/02 원문 범위를 초과. REQUIREMENTS.md 에 THEME-03(유저 테마 CRUD) / THEME-04(AI 보강) 추가 필요 (plan-phase 전 또는 중 처리).

**⚠️ 큰 phase 경고:** 이 phase 는 (a) 2-소스 스크랩 파이프라인 + 병합, (b) 시스템 테마 데이터/표시, (c) 유저 테마 per-user CRUD + fork, (d) AI 보강, (e) /themes·/themes/[id]·종목 칩 UI 를 모두 포함한다. planner 는 wave 를 무겁게 쪼갤 것(권장 순서: 데이터모델/스크랩 → 시스템 표시 → 유저 CRUD → AI 보강 → 통합). 사용자가 "한번에" 를 명시 선택함.

</domain>

## 이전 phase에서 이미 결정된 것 (carry forward)

- **네이버 스크래핑 = IP 차단 위험** → Phase 8에서 Bright Data Web Unlocker 프록시 도입 (`workers/discussion-sync/` `proxy/client.js` + GCP Secret `BRIGHT_DATA_TOKEN`). curl로 SSR이 보여도 production IP는 차단당함.
- **Worker 배포 패턴**: Cloud Run Job + Cloud Scheduler **OAuth invoker** (OIDC 금지 — Phase 05.1 Pitfall 2), GCP Secret Manager, pnpm workspace worker. Job 이름 `gh-radar-<role>`.
- **per-user CRUD + RLS 선례 = watchlist (Phase 06.2)**: `supabase/migrations/20260416120000_watchlists.sql`(테이블 + RLS owner-only), `server` 라우트, `webapp/src/lib/watchlist-api.ts`, `webapp/src/components/watchlist/watchlist-client.tsx`, `webapp/src/lib/auth-context.tsx` (Google OAuth 세션). 유저 테마 CRUD 는 이 패턴 복제.
- **Server route 패턴**: Zod + Supabase + `ApiClientError` envelope + rate-limit 미들웨어 (`server/src/routes/scanner.ts`, `stocks.ts`).
- **Client fetch 패턴**: `webapp/src/lib/api.ts` `apiFetch` + `ApiClientError` + `X-Request-Id`.
- **타입**: `packages/shared/src/` camelCase 계약 (신규 `theme.ts`).
- **RLS 메모리 규칙**: 신규 테이블은 `TO anon, authenticated` 둘 다 명시(anon만 쓰면 로그인 유저 default-deny). RPC는 `REVOKE FROM anon, authenticated` 명시(auto-grant가 PUBLIC revoke 덮음).
- **AI 분류 패턴 = discussion-sync**: Claude Haiku 4.5 inline, p-limit(5), temperature=0, 작은 max_tokens. `workers/discussion-sync/src/classify/`.
- **마이그레이션**: `YYYYMMDDHHMMSS_` prefix. 본 phase 는 신규 테이블(themes/theme_stocks/user_themes 등) 마이그레이션 **필요**.
- **법적/운영**: CLAUDE.md §"Naver 종목토론방 Scraping Risk" 운영 5원칙(2026-06-08 명문화) — 진짜 리스크는 형사 아닌 민사 DB제작자 권리 침해(대법원 2017다224395).

<decisions>
## Implementation Decisions

### 데이터 모델 / 소유

- **D-01:** 두 테마 종류 분리 — **시스템 테마**(전역, read-only, 스크랩) vs **유저 테마**(per-user, CRUD). 별도 row 집합으로 스크랩↔편집 충돌을 구조적으로 제거. (위키식 전역 편집안은 논의 중 폐기됨.)
- **D-02:** **한 종목 = 여러 테마** (M:N). `theme_stocks` 조인 테이블. 시스템·유저 테마 모두 종목 다중 매핑.
- **D-03:** 시스템 `theme_stocks` 행은 `source`(naver/alphasquare/...), `confidence`, `effective_from`/`effective_to`(편입·제외 이력) 보존. 스크랩 재실행 시 시스템 테마 전체 갱신(아래 D-09).
- **D-04:** 유저 테마는 본인 소유, 본인만 조회/편집 (watchlist 와 동일 per-user + owner-only RLS). 스크래퍼는 유저 테마를 절대 건드리지 않음.
- **D-05:** **fork = 스냅샷 복사**. 유저가 시스템 테마를 "내 테마로 복사" 시 그 시점의 종목 멤버십을 유저 테마로 복제 → 이후 독립(시스템 갱신 전파 안 됨). 빈 테마 신규 생성도 가능. (라이브 연결안 폐기 — 오버레이 복잡도 회피.)

### 수집 / 스크래핑

- **D-06:** 소스 2-tier — (1) 네이버 금융 테마 `https://finance.naver.com/sise/theme.naver` (SSR, EUC-KR→iconv-lite UTF-8 변환, ~265 테마, 산업/이벤트), (2) 알파스퀘어 `https://alphasquare.co.kr/home/theme-factor` (SSR, 정치인주/시사 — 네이버 미노출분 보강).
- **D-07:** **수집 방식 = 직접 fetch 먼저 → 429/403 차단 감지 시 Bright Data 프록시 폴백**. 일 1회 저빈도(265테마+상세+알파)라 직접 fetch 합리적, 차단 시에만 기존 프록시(`proxy/client.js`) 경유. 비용 최소.
- **D-08:** `workers/theme-sync`(신규) — Cloud Run Job + Cloud Scheduler **일 1회 16:00 KST**, OAuth invoker. master-sync/news-sync 템플릿 복제.
- **D-09:** 변경 감지 — 콘텐츠 **SHA256 해시**, 동일 콘텐츠면 DB write 스킵. 시스템 테마 이름/설명/멤버십은 **스크랩 항상 갱신**(시스템은 read-only라 유저 편집과 충돌 없음).
- **D-10:** **이름 정규화 후 병합** — 네이버 ↔ 알파스퀘어 동일/유사 테마명("AI챗봇"/"AI 챗봇")을 하나의 시스템 테마로 병합, 종목 합집합, `source` 다중 태그. 위키식 단일 네임스페이스 부합. **초기 자동 병합은 보수적으로**(확실한 정규화만), 애매한 건 분리 유지(유저가 fork 후 수동 병합 가능).
- **D-11:** 운영 5원칙 준수(CLAUDE.md) — 일 1회 배치 캡, 24h 캐싱+해시, on-demand fetch 금지(서버측 배치만), 429/403 즉시 24h backoff, 출처 표기 + 부분 캐싱(전체 DB 덤프 금지).

### AI 보강 (이 phase 포함)

- **D-12:** **AI 보강 포함** — Claude Haiku 4.5로 (a) 뉴스(`news_articles`) 기반 신규 시스템 테마 후보 발굴, (b) 종목↔테마 오분류 교정. discussion-sync classify 패턴(inline, p-limit, temp=0) 재사용. **AI 결과도 시스템 테마 레이어**(source=ai 등)로 들어가며 유저 테마와 분리. 비용·정확도는 plan/POC에서 검증.

### UI — /themes 목록

- **D-13:** 구성 — **내 테마 상단 고정**, 그 아래 시스템 테마. (탭 분리 / 한 목록+뱃지안 대신 채택.)
- **D-14:** **정렬 = 테마 소속 종목 중 등락률 상위 3종목의 평균 등락률 내림차순** ("지금 뜨는 테마" 우선, 라거드 종목 희석 방지). 등락률 source 는 기존 `stock_quotes`(장중) / 일봉 close(장외) — 정확한 source·계산 위치(워커 precompute vs server aggregate)는 researcher/planner.

### UI — 테마 상세 + 종목 칩

- **D-15:** 테마 클릭 → **별도 페이지 `/themes/[id]`**. 종목 행은 **scanner row 재사용**(`scanner-table.tsx`/`scanner-card-list.tsx` — 종목명+현재가+등락률+거래대금). 종목 클릭 시 `/stocks/[code]`. 이동 가능한 URL.
- **D-16:** **종목 상세 `/stocks/[code]` 에 "이 종목의 테마" 칩** — 그 종목이 속한 시스템 테마 + 로그인 유저의 내 테마 모두 표시. 칩 클릭 시 `/themes/[id]`.

### Claude's Discretion (planner/researcher 재량)

- 테이블 정확 스키마: `themes`(시스템) / `user_themes` 분리 vs 단일 `themes` + `owner_id` nullable + `is_system` 플래그 — planner 결정. `theme_stocks` 도 동일 고민.
- 이름 정규화 알고리즘 구체(공백/특수문자/동의어 사전 범위).
- "상위 3종목 평균 등락률" 계산·캐싱 위치(theme-sync 워커 precompute 컬럼 vs server 쿼리 aggregate vs materialized view).
- 등락률 source 분기(장중 stock_quotes vs 장외 일봉).
- 알파스퀘어 DOM 파싱 selector, theme id 추출.
- AI 보강 트리거 주기(theme-sync 동반 vs 별도 스케줄), 프롬프트 설계, source 라벨.
- fork 스냅샷 시 effective 이력 복사 범위.
- /themes 빈 상태("아직 내 테마가 없어요" + 생성 CTA), 로딩 skeleton, 에러 상태(scanner/news 패턴 재사용).
- 유저 테마 편집 UI 형태(전용 페이지 vs 모달 vs 인라인) — watchlist-client 패턴 참고.
- 종목 칩 최대 표시 개수 + overflow("+N").
- 테스트 범위(unit: 병합/정규화/정렬, integration: 스크랩 mock+upsert+RLS, E2E: /themes CRUD).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 전체
- `.planning/ROADMAP.md` §"Phase 10: Theme Classification" — Goal/Depends/Scope/SC 5개/OOS/Notes
- `.planning/REQUIREMENTS.md` — THEME-01(수집)/THEME-02(표시). **THEME-03(유저 CRUD)/THEME-04(AI 보강) 추가 필요**
- `.planning/PROJECT.md` — vision, News/Stock Data Sources, "무료 API 우선" 제약(프록시 예외는 Phase 8 선례)
- `.planning/STATE.md` — 진행도, Roadmap Evolution(Phase 10 added 2026-06-08)
- `CLAUDE.md` §"Naver 종목토론방 Scraping Risk" — **한국 크롤링 운영 5원칙** + 법적(2021도1533 형사무죄 / 2017다224395 민사 DB권)

### 선행 phase 아티팩트 (필수 참조)
- `.planning/phases/08-discussion-board/08-CONTEXT.md` — Bright Data 프록시 도입(D1), 프록시 예산, worker/route/UI 복제 패턴, 법적 방어
- `.planning/phases/07-news-ingestion/07-CONTEXT.md` — 섹션 패턴, `news_articles`(AI 보강 입력 소스), 30s 쿨다운, ApiClientError.details
- `.planning/phases/06.2-auth-watchlist/06.2-CONTEXT.md` — **per-user CRUD + owner-only RLS + Google OAuth 세션** (유저 테마 직접 선례)
- `.planning/phases/06.1-stock-master-universe/06.1-CONTEXT.md` — `stocks` 마스터, FK re-point, master-sync 패턴
- `.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/` — Cloud Run Job + Scheduler + SA + Secret 배포 템플릿 + **Pitfall 2 (OAuth invoker, OIDC 금지)**

### 소스 코드 — 재사용/복제 기준
- `workers/discussion-sync/` — `proxy/client.js`(Bright Data 폴백 재사용), `src/classify/`(AI 보강 패턴 재사용), Dockerfile/deploy 구조
- `workers/master-sync/` · `workers/news-sync/` — theme-sync 워커 디렉터리/배포 템플릿
- `supabase/migrations/20260416120000_watchlists.sql` — per-user 테이블 + owner-only RLS 패턴(유저 테마 복제 기준)
- `supabase/migrations/` (`YYYYMMDDHHMMSS_` prefix, 최신 `20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql`) — RLS authenticated 명시 선례
- `webapp/src/lib/watchlist-api.ts` — 유저 테마 CRUD API 클라이언트 복제 기준
- `webapp/src/components/watchlist/watchlist-client.tsx` — 유저 테마 CRUD UI 복제 기준
- `webapp/src/lib/auth-context.tsx` — Google OAuth 세션(유저 테마 소유자 식별)
- `webapp/src/components/scanner/scanner-table.tsx` · `scanner-card-list.tsx` — /themes/[id] 종목 행 재사용
- `webapp/src/lib/scanner-api.ts` · `scanner-query.ts` — 종목 행 데이터 패턴
- `webapp/src/lib/api.ts` — `apiFetch`, `ApiClientError`
- `webapp/src/components/stock/stock-detail-client.tsx` — 종목 상세 테마 칩 삽입 위치
- `server/src/routes/scanner.ts` · `stocks.ts` — 신규 `themes.ts` 라우트 패턴(Zod+Supabase+envelope)
- `server/src/app.ts` — 라우트 등록 + rate-limit 미들웨어
- `packages/shared/src/stock.ts` — 신규 `theme.ts` camelCase 타입 위치

### 외부 스펙 (researcher 확인)
- 네이버 금융 테마: `https://finance.naver.com/sise/theme.naver` (목록), `/sise/sise_group_detail.naver?type=theme&no={ID}` (상세, 종목 매핑). EUC-KR. robots.txt 외부봇 차단(5원칙으로 완화)
- 알파스퀘어 테마: `https://alphasquare.co.kr/home/theme-factor` (SSR, 정치/시사)
- Bright Data Web Unlocker (Phase 8 도입): GCP Secret `BRIGHT_DATA_TOKEN`
- Claude Haiku 4.5 (AI 보강): discussion-sync classify 선례

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **watchlist 스택(Phase 06.2)** — 유저 테마 CRUD 의 1:1 선례: `watchlists.sql`(per-user RLS), `watchlist-api.ts`, `watchlist-client.tsx`, `auth-context.tsx`. 테이블·API·UI 모두 복제 후 "stock_code 리스트" → "theme + theme_stocks" 로 확장.
- **discussion-sync 프록시 + classify** — `proxy/client.js`(Bright Data 폴백), `src/classify/`(Claude Haiku inline) → theme-sync 의 차단 폴백 + AI 보강에 재사용.
- **scanner 컴포넌트** — `scanner-table.tsx`/`scanner-card-list.tsx`/`scanner-skeleton.tsx`/`scanner-empty.tsx`/`scanner-error.tsx` → /themes/[id] 종목 행·상태 재사용.
- **worker 템플릿** — `workers/master-sync/`·`workers/news-sync/` 디렉터리 구조 + `scripts/deploy-*.sh` + Cloud Run Job/Scheduler.
- **server route 골격** — `scanner.ts`/`stocks.ts` (Zod + Supabase service role + ApiClientError).
- **packages/shared** — camelCase 타입 계약(신규 `theme.ts`).

### Established Patterns
- service role 쓰기(워커) + anon/authenticated 읽기(RLS). 신규 테이블 `TO anon, authenticated` 둘 다 명시.
- 유저 소유 테이블은 `owner = auth.uid()` owner-only RLS (watchlists 선례).
- Cloud Run Job 이름 `gh-radar-theme-sync`, Scheduler OAuth invoker.
- 마이그레이션 `YYYYMMDDHHMMSS_` prefix.

### Integration Points
- `theme_stocks.stock_code` FK → `stocks` 마스터(존재 종목만, 실패 per-stock skip).
- 유저 테마 소유자 FK → Supabase auth user (watchlists 선례).
- `webapp/src/app/themes/page.tsx`(신규) + `themes/[id]/page.tsx`(신규) — Next 15 dynamic route.
- `stock-detail-client.tsx` 에 테마 칩 섹션 추가(기존 구조 최소 침습).
- 사이드바/네비(`app-sidebar.tsx`)에 /themes 진입점 추가.
- 정렬용 "상위 3종목 평균 등락률" — `stock_quotes`(장중)/일봉(장외) source.

</code_context>

<specifics>
## Specific Ideas

- **유저별 테마 분리가 핵심 단순화** — 위키식 전역 편집을 검토했으나, 스크랩↔유저편집 오버라이드 충돌이 너무 복잡 → per-user 분리로 선회. 시스템(read-only 전역) / 유저(per-user CRUD) 두 레이어가 절대 섞이지 않음.
- **정렬 지표 = 상위 3종목 평균 등락률** (사용자 명시) — 테마 전체 평균은 라거드 종목에 희석됨. 대장주 3개의 평균이 "테마 발화" 신호를 더 정확히 포착.
- **직접 fetch 우선, 프록시는 폴백** — 일 1회 저빈도라 Phase 8(시간당 ~200종목)과 달리 직접 fetch 가 합리적. 비용 최소화하되 차단 시 안전망(Bright Data) 유지.
- **AI 보강 포함** (사용자 명시) — 네이버가 정치인주를 안 잡고, 신규 시사 테마는 뉴스에서 먼저 뜨므로 Claude Haiku로 뉴스 기반 테마 후보 발굴 가치 높음. 시스템 레이어로만 들어가 유저 테마와 분리.
- **fork 스냅샷** — 시스템 테마를 내 테마 시드로 복사, 이후 독립. 예측가능·단순.

</specifics>

<deferred>
## Deferred Ideas

- **테마 기반 알림** (특정 테마 급등 시 푸시) — v2 NOTF-*.
- **테마 간 상관/상한가 동조 분석 (C/D/E)** — Phase 11+ (후속 phase로 명시 분리). 본 phase 의 테마 데이터가 동조 분석의 후보 풀 필터로 작동 예정.
- **유저 테마 공유/공개** — 현재 per-user private. 공개/팔로우는 personalization 확장.
- **테마 트렌드 시계열**(테마별 등락률 히스토리 차트) — 데이터 누적 후 재검토.
- **이름 정규화 동의어 사전 고도화** — 초기 보수적 정규화, 운영 중 개선.

### Reviewed Todos (not folded)
(해당 없음 — 매칭 todo 0건)

</deferred>

---

## Success Criteria Mapping

| Requirement | 결정 위치 |
|---|---|
| THEME-01 (수집: 2-tier, 일 1회, 해시, 5원칙) | D-06, D-07, D-08, D-09, D-10, D-11 |
| THEME-02 (표시: /themes + 테마별 종목) | D-13, D-14, D-15, D-16 |
| THEME-03 (유저 테마 CRUD — **신규, 추가 필요**) | D-01, D-04, D-05 |
| THEME-04 (AI 보강 — **신규, 추가 필요**) | D-12 |

## Open for Planner

1. **REQUIREMENTS 확장** — THEME-03(유저 테마 CRUD)/THEME-04(AI 보강) 추가 + Traceability/커버리지 갱신.
2. **테이블 스키마 결정** — `themes`+`owner_id` nullable+`is_system` 단일 테이블 vs `themes`(시스템)/`user_themes` 분리. `theme_stocks` provenance(source/confidence/effective).
3. **정렬 계산 위치** — "상위 3종목 평균 등락률" precompute(워커 컬럼) vs server aggregate vs materialized view. 장중/장외 source 분기.
4. **이름 정규화/병합 알고리즘** — 보수적 자동 병합 규칙.
5. **AI 보강 설계** — 트리거 주기, 프롬프트, source 라벨, 비용 예산, POC.
6. **스크랩 파서** — 네이버(EUC-KR, 상세 페이지 종목 매핑) + 알파스퀘어 DOM selector + 직접/프록시 폴백 로직.
7. **유저 테마 CRUD** — watchlist 스택 복제 범위, fork 스냅샷 구현.
8. **Wave 분할** (큰 phase) — 권장: 데이터모델/마이그레이션 → 스크랩 파이프라인 → 시스템 테마 표시 → 유저 CRUD → AI 보강 → 종목 칩/통합 → E2E.
9. **테스트** — unit(병합/정규화/정렬), integration(스크랩 mock+upsert+RLS), E2E(/themes CRUD + fork).

---

*Phase: 10-theme-classification*
*Context gathered: 2026-06-09*
