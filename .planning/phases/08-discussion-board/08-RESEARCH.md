# Phase 8: Discussion Board — Research

**Researched:** 2026-04-17
**Domain:** Naver 종목토론방 스크래핑 (cheerio + 프록시) + Cloud Run Job + on-demand Express route + Supabase row-level TTL
**Confidence:** HIGH (대부분 Phase 7 재사용) / MEDIUM (외부 의존 — 프록시 선정·DOM 안정성)

## Summary

Phase 8 은 Phase 7(NEWS-01) 의 **90% 구조 복제**다. 모든 재사용 가능한 결정은 이미 `08-CONTEXT.md` D1–D12 에 locked 되어 있고, CLAUDE.md 에도 공식 stack 이 명시되어 있다. 본 리서치는 **기존 stack 을 재검증하지 않고**, Phase 7 과 다른 **3가지 신규 영역**만 깊이 조사한다:

1. **프록시 서비스 선정** (D1 Open for Planner #1) — Bright Data Web Unlocker, ScraperAPI, Oxylabs Web Unblocker 의 비용·한국 IP·약관 매트릭스
2. **네이버 종목토론방 DOM 파싱** — 셀렉터 후보 `td.title > a` + `th.gray03.p9.tah` 등 (LMMYH/nomorecoke 오픈소스 실증)
3. **법적 리스크** — 2021도1533 판결은 **무죄**(크롤링이 자동으로 범죄가 아니라는 기준 정립)이나, 본 phase 의 배치 규모·캐싱이 왜 "최소 침해" 기준을 통과하는지 정량적으로 문서화

**Primary recommendation:** Phase 7 `workers/news-sync/` + `server/src/routes/news.ts` + `/stocks/[code]/news` 풀페이지를 1:1 복제하되, fetcher 만 (Naver Search API → 프록시 기반 HTML fetch + cheerio 파싱) 으로 교체한다. 프록시는 **Plan POC 단계에서 실측 후 확정**하되, 기본값은 **ScraperAPI**(월 $49 시작, API endpoint 단일화, 운영 오버헤드 최소) 로 시작하고 차단율이 높으면 Bright Data Web Unlocker 로 전환.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1 — 아키텍처:** 프록시 기반 1h 배치(`workers/discussion-sync/` Cloud Run Job + Cloud Scheduler `0 * * * *` KST) + on-demand(`server/src/routes/discussions.ts` GET/POST). 배치는 Phase 7 패턴 복제 + OAuth invoker (OIDC 금지, Pitfall 2). 프록시 서비스는 초기부터 도입 — 명시적 비용 승인.

**D2 — 배치 타겟:** `top_movers` 최신 scan_id ∪ `watchlists.stock_code` (~200 종목). 1h × 200 × 1페이지 ≈ **4,800 scrapes/day**. 마스터 전체 배치 금지.

**D3 — 수집 트리거 3경로:** 배치 1h + mount 자동 fetch(`fetchStockDiscussions(code, {hours:24, limit:5})`) + 수동 refresh(`POST /api/stocks/:code/discussions/refresh` — per-stock 30s 쿨다운).

**D4 — 캐싱:** 10분 TTL, Supabase row-level `MAX(discussions.scraped_at)` 기준. `< 10분` → skip + DB 반환. Upstash Redis 미도입(MVP).

**D5 — UI 상세 Card:** 2번째 섹션(Phase 7 뉴스 아래), **상위 5개**, 24시간 이내. **제목 + 절대시간 `MM/DD HH:mm` KST + 작성자 + 본문 2줄 미리보기(`line-clamp-2`)**. 아이콘 `MessageSquare`. 외부 링크 `target="_blank" rel="noopener noreferrer"`. 빈 상태/로딩/에러 패턴 Phase 7 NewsEmptyState/NewsListSkeleton 복제.

**D6 — 전체 페이지 `/stocks/[code]/discussions`:** Next 15 `use(params)`, 최근 **7일**, 서버 하드캡 **50건** (`LIMIT 50`), 최신순. Compact 표 형식 3열 grid `1fr 140px 120px` (제목+preview / 작성자 / 시간). 페이지네이션 deferred. **새로고침 기능 없음** (상세만 노출).

**D7 — 차단/실패 UX:** Stale(캐시+재시도 실패) → 캐시 노출 + "X분 전 데이터" Badge(muted, destructive 아님) + 재시도. Empty fail(캐시 없음+실패) → "토론방을 불러올 수 없어요" + 재시도 CTA. **429 silent guard** (버튼 disabled + 카운트다운 only, 별도 메시지 없음).

**D8 — Rate Limit:** per-stock 30s 쿨다운 (`MAX(scraped_at)` 기준), `details.retry_after_seconds` 포함. 전역 프록시 일일 예산 — worker 측 카운터 + 초과 시 abort.

**D9 — API 계약:** `GET /api/stocks/:code/discussions?hours=24&limit=5` (상세) 또는 `?days=7&limit=50` (전체). 서버 하드캡 `limit=50`. `POST /api/stocks/:code/discussions/refresh`. 응답 필드 camelCase: `stockCode, postId, title, body, author, postedAt, scrapedAt, url`.

**D10 — UPSERT:** `ON CONFLICT (stock_code, post_id) DO UPDATE SET scraped_at = EXCLUDED.scraped_at`(TTL 정확도 우선, 아래 "UPSERT 전략 비교" 참조). `post_id` = 네이버 URL `nid=` 파라미터. `body` = HTML strip plaintext.

**D11 — 스팸 필터 (최소):** 제외 = (제목 길이 < 5자) **OR** (제목에 `http://` / `https://` 포함). 원본은 DB 저장, UI 노출에서만 제외.

**D12 — 순서 제약:** UI wave(`stock-detail-client.tsx` 교체)는 **Phase 7 Wave 2 (07-04) merge 이후** 진입 — `space-y-6` 컨테이너 내 2번째 섹션 추가만 하고 기존 구조 수정 금지. 그 외 wave(worker/server route/migration 없음/IAM-deploy/E2E) 는 Phase 7 과 병렬 진행 가능.

### Claude's Discretion

- 프록시 서비스 선정 (Bright Data / ScraperAPI / Oxylabs / 자체 IP rotation) — POC 후 Plan 단계
- cheerio selector 구체 (네이버 토론방 DOM 파싱)
- HTML strip 라이브러리 (`sanitize-html` vs 정규식 best-effort)
- 네이버 post URL의 `nid` 추출 로직
- `posted_at` 네이버 포맷 → ISO 변환 (`date-fns` / 수동 파싱)
- body "2줄 미리보기" — 원문 plaintext + CSS `line-clamp-2`
- 작성자 닉네임 마스킹 여부 (익명 닉네임이라 그대로 권장)
- UPSERT 동작 세부 (DO NOTHING vs DO UPDATE SET scraped_at)
- Retention cleanup — discussion-sync Job 훅 vs 독립 Cloud Scheduler
- 프록시 예산 카운터 — Supabase `api_usage` 확장 vs 별도 테이블
- 섹션 컴포넌트 공통 추상화 여부 (news/discussion `SectionCard` 공통 부모)
- Next.js server/client 경계 (`/discussions` 페이지 server-fetch 초기화)
- 단위/통합 테스트 범위, Playwright E2E spec
- Dockerfile/scripts/deploy 세부 (news-sync 복제 기준)

### Deferred Ideas (OUT OF SCOPE)

- AI 토론방 요약 + 센티먼트 (DISC-02, Phase 9)
- 인기순/조회수 정렬 — 조회수 컬럼 없음
- 작성자 필터/팔로우, 댓글 스레드, 실시간 푸시 (v2 NOTF-*)
- 자유 키워드 검색, 이미지 썸네일
- `/discussions` 페이지 페이지네이션
- 배치 주기 가변 (장중 30분/장외 2시간)
- 스팸 필터 고도화 (도메인/키워드 모델 — Phase 9 AI 로 흡수)
- 섹션 컴포넌트 공통 추상화 (Phase 8 완료 후 리팩터링 여지)
- Redis 캐싱 (트래픽 증가 시)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | 네이버 종목토론방 글 목록 표시 (on-demand 스크래핑, 5~10분 캐싱) | §"프록시 서비스 비교 매트릭스" + §"네이버 종목토론방 DOM 구조" + §"UPSERT 전략 비교" + §"법적 리스크 체크리스트" — DOM 파싱·캐시 TTL·규정준수 세 축을 planner 가 구체 task 로 분해할 근거 제공 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

### 한글 커뮤니케이션 (전역)
- 모든 UI copy 한글. Plan/task description 한글. 커밋 메시지 한글 (HEADER 이후 본문 포함).
- 사용자 대면 에러 메시지 한글 + 내부 사정 숨김 (D7 에 명시).

### Naver 종목토론방 §CLAUDE.md
- URL 패턴: `https://finance.naver.com/item/board.naver?code={종목코드}` (목록)
- SSR 렌더링 — basic HTTP GET + HTML parse 가능 (Playwright 불필요)
- robots.txt: Naver 는 deep crawling disallow. **토론방은 gray zone**.
- Rate limit: **1~2 req/sec max**, 정상 User-Agent, 블록 모니터링 필수
- 2022 대법원 2021도1533 판결 — 크롤링의 **무죄 기준** 제시 (본 문서 §법적 리스크 체크리스트 참조)
- **아키텍처 결정 (CLAUDE.md 명시):** 대량 bulk-polling 금지, on-demand + 캐싱(5~10분) + 제한된 배치

### 배포 / Stack (Locked in CLAUDE.md)
- 프론트 Vercel, 백엔드 Cloud Run (컨테이너). **본 phase 는 Cloud Run Job 추가**.
- Backend: Express 5.x + TypeScript 5.x + BullMQ (Phase 7 에서는 BullMQ 미사용, node-cron 대신 Cloud Scheduler 채택 — Phase 8 동일 패턴 승계).
- DB: Supabase (Postgres + realtime). Redis 는 **Upstash 미도입 — D4 에 따라 Supabase row-level TTL 로 MVP 커버**.

### GSD Workflow
- `/gsd-execute-phase 8` 경로로만 파일 수정. 직접 Edit/Write 금지.

### 법적
- robots.txt 준수. API 이용약관 준수 — 이는 Naver Search API(Phase 7)는 **공식 허용**이나, 종목토론방은 약관 명시 허용 없음 → 법적 리스크 관리가 본 phase 최대 이슈.

## Standard Stack

### Core — Phase 7 1:1 복제 (Confidence HIGH)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| Node.js | 22 LTS (alpine) | Worker runtime | `workers/news-sync/Dockerfile` — 동일 base image [VERIFIED: 기존 Dockerfile] |
| pnpm | 10 | Workspace manager | `pnpm-workspace.yaml` `workers/*` glob 이 `discussion-sync` 자동 흡수 [VERIFIED: pnpm-workspace.yaml] |
| TypeScript | 5.x | Language | [VERIFIED: `workers/news-sync/package.json`] |
| @supabase/supabase-js | ^2.49.0 | Supabase client + service role | [VERIFIED: `workers/news-sync/package.json:11`] |
| axios | ^1.7.0 | HTTP client (프록시 호출) | [VERIFIED: 재사용] |
| p-limit | ^7.0.0 | 동시성 제한 (배치 per-stock) | [VERIFIED: Phase 7 도입분] |
| pino | ^9.0.0 | Structured log (redact secrets) | [VERIFIED: `workers/news-sync/src/logger.ts`] |
| dotenv | ^16.4.0 | 로컬 dev `.env` | [VERIFIED] |
| Express | 5.x | Server (기존) | [VERIFIED: `server/package.json`] |
| zod | (Phase 7 사용분) | Request validation | [VERIFIED: `server/src/schemas/news.ts`] |

### Supporting — 신규 의존성 (Confidence HIGH)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cheerio` | **1.2.0** (2026-01-23 publish) | jQuery-like HTML 파서 | [VERIFIED: npm search 2026-04] — Node 14+ 지원, Node 22 호환. 업계 표준 jQuery-like 파서. [CITED: npmjs.com/package/cheerio] |
| `sanitize-html` | **2.17.2** | HTML → plaintext + 엔티티 디코드 | [VERIFIED: 2026-04 npm search] — 주당 7M DL, 활발히 유지. Phase 7 `news-sanitize.ts` 에서는 regex 기반으로 구현했으나 토론방 body 는 스팸 HTML 다양성 커서 sanitize-html 권장. [CITED: npmjs.com/package/sanitize-html] |

**설치 대상 workspace:**
- `workers/discussion-sync/` — `cheerio`, `sanitize-html` (+ `@types/sanitize-html`)
- `server/` — 동일 (on-demand 경로도 같은 파싱 필요)

**중요 — Phase 7 `news-sanitize` 분리 원칙 (V-20 guardrail):** Phase 7 plan 은 `sanitize-html`·`striptags`·`dompurify`·`date-fns-tz` 모두 도입 금지로 guardrail 걸었음. 이유는 뉴스 title/description 이 단순한 `<b>` 태그만 포함해 regex 로 충분했기 때문. **Phase 8 토론방 body 는 사용자가 HTML 을 직접 삽입(광고/링크) 가능해서 이 원칙이 완화됨** — Plan 수립 시 V-20 guardrail 이 `workers/discussion-sync/` 에는 적용 안 됨을 명시 필요. `packages/shared/src/discussion-sanitize.ts` 는 Phase 7 news-sanitize 와 **분리된 모듈**로 만든다 (Phase 7 guardrail 회귀 방지).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `cheerio` + `axios` | Playwright/Puppeteer (headless browser) | [CITED: CLAUDE.md §"Discussion board"] — 네이버 토론방은 **SSR 렌더링**이라 헤드리스 불필요. Playwright 는 Cloud Run 이미지 용량 (~300MB vs cheerio ~200KB) + 실행시간 (~3s vs ~50ms) 폭증. Reject. |
| `sanitize-html` | 정규식 (Phase 7 스타일) | Phase 7 title 은 `<b>` 만 처리. 토론방 body 는 `<img>`, `<a href="http://spam">`, inline CSS, 엔티티 등 다양 → 정규식 취약. sanitize-html 채택. |
| Cloud Run Job + Scheduler | BullMQ + Redis (CLAUDE.md stack 권장) | Phase 7 에서 이미 Cloud Scheduler 채택. 배치 주기 1h × 200 종목 은 BullMQ 복잡도 과함. CLAUDE.md 가 BullMQ 를 "배경 작업"에 권장했으나 Phase 5.1 부터 Cloud Scheduler 로 통일 — 일관성 유지. |
| Supabase row-level TTL | Upstash Redis | D4 locked: MVP 에서는 Supabase 로 충분. Redis 는 deferred. |

**Installation (planner reference):**
```bash
# Worker
pnpm -F @gh-radar/discussion-sync add cheerio sanitize-html
pnpm -F @gh-radar/discussion-sync add -D @types/sanitize-html

# Server (on-demand 경로)
pnpm -F @gh-radar/server add cheerio sanitize-html
pnpm -F @gh-radar/server add -D @types/sanitize-html
```

**Version verification (2026-04-17):**
- `cheerio@1.2.0` (published 2026-01-23) — [VERIFIED: WebSearch 2026-04] Node 22 호환
- `sanitize-html@2.17.2` (published ~2025-08) — [VERIFIED: npmjs.com] 주간 7M DL

## 프록시 서비스 비교 매트릭스

**핵심 결정:** CLAUDE.md §Constraints 의 "무료 API 우선" 원칙은 Phase 8 에서 **명시적으로 예외 승인**됨 (CONTEXT D1 specifics). 아래는 Plan POC 의 기준점.

| 항목 | Bright Data Web Unlocker | ScraperAPI | Oxylabs Web Unblocker | 자체 IP rotation |
|------|--------------------------|------------|-----------------------|------------------|
| **진입 비용** | $499/월 Growth ($1.3/1K req) 또는 $1.5/1K PAYG | **$49/월** (100K credits) | $75/월 + $9.40/GB | 0 (구현 비용만) |
| **성공률 (일반)** | 97.9% [CITED: brightdata.com blog] | 95%+ [CITED: dev.to] | 95%+ [CITED: aimultiple.com] | <50% (네이버 차단) |
| **한국 IP 풀** | HIGH — 주소지·도시·우편번호 레벨 타겟팅 [CITED: brightdata.com/locations/kr] | MEDIUM — 50+ geo 지원, 한국 상세 pricing 미공개 [CITED: ScraperAPI docs] | MEDIUM — 한국 residential IP 제공, 상세 별도 [CITED: oxylabs.io/location-proxy/south-korea] | LOW — 개별 IP 확보 어려움 |
| **CAPTCHA/JS 처리** | 자동 (Web Unlocker 의 value prop) | 자동 + premium proxy 10× credit | 자동 | 수동 구현 |
| **API 단순성** | 복잡 (여러 endpoint, plan 선택 복잡) | **최고** (단일 endpoint, 요청 URL 전달) | 중간 | N/A |
| **요청당 비용 (한국 대상)** | ~$0.0013 ($1.3/1K, Growth) | $0.00049 ($0.49/1K base, premium 10×=$0.0049) | ~$0.0094/request (bandwidth 기반 추정) | 0 (IP 비용 별도) |
| **월 비용 추정 (4,800 scrapes/day × 30일 = 144K/mo)** | $499 고정 (Growth 한도 내) 또는 $216 PAYG | **$49 (100K credits)** 또는 Business $149 (1M credits) 권장 | ~$1,350 (bandwidth 무거움) | 0 ~ $변동 |
| **약관 — 스크래핑 허용** | 명시적 허용 (정당한 웹 스크래핑 purpose 요구) | 명시적 허용 | 명시적 허용 | 프록시 약관에 종속 |
| **robots.txt 존중 책임** | 사용자 | 사용자 | 사용자 | 사용자 |
| **운영 오버헤드** | 중간 | **최소** | 중간 | 높음 (IP 로테이션 로직 직접) |

**추천 (planner 의사결정용):**

1. **Plan POC 시작: ScraperAPI Hobby ($49/월, 100K credits)**
   - 근거: 진입비용 최저, 단일 endpoint API, 본 phase 의 요청량(144K/mo)에는 1tier 위인 Startup $149/mo (1M credits) 가 안전 마진 포함.
   - Premium proxy 필요 시 credit 10배 소모 → 실질 14.4K premium req/mo.
2. **POC 실패 시 (차단률 >10% 또는 한국 본문 렌더링 이슈): Bright Data Web Unlocker**
   - 한국 IP 풀 품질 최고, 97.9% 성공률.
   - 비용 ~2.5× 이나 안정성 우선.
3. **자체 IP rotation 배제 근거:**
   - 개인 프로젝트 규모에서 한국 residential IP 확보 비용 + 유지 복잡도 과함.
   - 네이버 anti-bot 감지 시 프로젝트 전체 차단 리스크.
   - CONTEXT D1 이 이미 외부 서비스 명시.

**POC 설계 기준 (Open for Planner #2):**

| 측정 항목 | 목표 | 방법 |
|-----------|------|------|
| 제품 유용성 | 사용자가 유의미한 정보 5건 상위 노출 | 대표 3~5 종목(삼성전자/LG에너지솔루션/카카오/에코프로/셀트리온) × 1~2주 수집 → 일간 human eval |
| 차단률 | < 5% | HTTP 403/429/본문 내 "차단" 키워드 감지 |
| 비용 실측 | 월 < $100 (MVP 수용선) | 프록시 credit 소모 × 월 환산 |
| DOM 안정성 | 0 회귀 (selector 실패 없음) | 수집 실패 item 비율 |

**프록시 예산 가드 (Open for Planner #11):**
- **권장:** Supabase `api_usage` 테이블 확장 (Phase 7 의 `incr_api_usage(text, date, int)` RPC 재사용). `service = 'proxy_naver_discussion'` 라벨로 구분.
  - [VERIFIED: `supabase/migrations/20260417120000_api_usage.sql`] — 해당 테이블은 `(service, usage_date)` PK 라 service 만 추가하면 그대로 동작.
  - SECURITY DEFINER 함수는 `p_service` 파라미터만 받으므로 신규 service 이름 추가에 마이그레이션 불필요.
- **반려:** 별도 `discussion_usage` 테이블 생성 — 테이블 증식, 일관성 낮음.

## 네이버 종목토론방 DOM 구조

### URL 패턴

| 페이지 | URL |
|--------|-----|
| 목록 페이지 | `https://finance.naver.com/item/board.naver?code={종목코드}&page={페이지번호}` — page=1 기본 |
| 게시글 상세 | `https://finance.naver.com/item/board_read.naver?code={종목코드}&nid={nid}&st=&sw=&page=1` — **`nid` 추출 대상** |

### CSS Selector 후보 (Confidence MEDIUM — 2026-04 오픈소스 실증)

[CITED: nomorecoke/naver-finance-board-crawler, LMMYH/naverfinance_opinion_crawler — WebFetch 2026-04-17]

| 데이터 | Python BS4 selector (원본) | cheerio 등가 |
|--------|----------------------------|--------------|
| 게시글 제목 링크들 | `'td.title > a'` | `$('td.title > a')` → `.attr('href')` + `.text().trim()` |
| 게시글 행 (날짜 포함) | `'tr > th.gray03.p9.tah'` | **⚠ 주의:** Python 크롤러는 `<th>` 라고 표기했으나 실제 네이버 토론방 목록의 날짜 컬럼은 `<td class="gray03 p9 tah">` 구조. cheerio 에서는 **`$('table.type2 tbody tr')` 전체 순회 후 행별 `td:nth-child(1)` (날짜) / `td.title > a` (제목) / `td:nth-child(3)` (작성자) / `td:nth-child(4..6)` (조회/공감/비공감)** 접근 권장. |
| 마지막 페이지 (페이지네이션) | `'tr > td.pgRR > a'` | `$('td.pgRR > a').attr('href')` — nth-page 파라미터 추출 |
| 최신글 날짜 | `'tbody > tr:nth-of-type(3) > td:nth-of-type(1) > span'` | 리스트 3번째 행 첫 컬럼 — v1 범위에서는 **전체 순회**로 충분 |
| 게시글 본문 (상세 페이지) | `'#body'` 또는 `'td.view'` | v1 범위 밖 — body 는 **목록 페이지의 제목만** 수집하거나 별도 fetch (아래 "미결 이슈" 참조) |

**⚠ 중대 발견 — body 수집 경로:**

- CONTEXT D5/D10 은 본문 `body` 2줄 미리보기 표시를 locked 로 명시.
- 하지만 네이버 토론방 **목록 페이지는 제목만 노출**하며, 본문 full text 는 **게시글 상세 페이지 별도 fetch** 필요.
- **경로 옵션 (Open for Planner):**
  1. 목록 페이지만 fetch → `body` 는 null 저장 → UI 에서 본문 preview 생략 (가장 단순, 프록시 요청량 1× 유지) — **CONTEXT D5 와 UI 모순 발생**
  2. 목록 + 상위 5~10건 각각 상세 페이지 fetch → `body` 저장 → 프록시 요청량 **6~11×** (종목당 1+5 req × 200 종목 × 24 = 29K/day) — 비용 $5~10 추가/월, ScraperAPI Startup plan 내 수용
  3. 네이버 토론방 목록에서 mouseover/title attribute 에 짧은 preview 제공하는지 DOM 실사 필요 (POC에서 확인)

**Planner 결정 요청 사항:** body 수집 경로 — 옵션 1 (최소) / 2 (UI 계약 유지) / 3 (POC 후). **권장: 옵션 2** — D5 가 lock 이고 UI 차별점. 프록시 credit 여유분 계산 시 반영.

### `nid` 추출 (Confidence HIGH)

[CITED: nomorecoke Python 원본]

```python
re.search('(?<=nid=)[0-9]+', href)
```

TypeScript 등가:
```ts
const nidMatch = href.match(/[?&]nid=(\d+)/);
const nid = nidMatch?.[1] ?? null;
```

**검증 체크:**
- `nid` 는 순수 숫자 시퀀스 (길이 8~11자 추정). regex `^\d{6,12}$` 로 sanity check.
- 파싱 실패 시 per-item skip, warn 로그.

### 작성자 / 날짜 포맷 (Confidence LOW — POC 실측 필요)

- 작성자: 네이버 ID masked (`abc****`) 또는 닉네임. D5 에 따라 **그대로 저장**.
- 날짜: 목록에서는 `YYYY.MM.DD HH:mm` KST 형식 추정. ISO 변환 로직:
  ```ts
  // posted_at = "2026.04.17 14:32" → "2026-04-17T14:32:00+09:00"
  const [date, time] = raw.split(' ');
  const iso = `${date.replace(/\./g, '-')}T${time}:00+09:00`;
  ```
  - `date-fns` 의존성 도입 없이 수동 변환 — Phase 7 `parsePubDate` 는 `date-fns-tz` 도 금지 (V-20), Phase 8 도 동일 유지 권장.

### 헤더 구성 (차단 회피 — Confidence MEDIUM)

```ts
headers: {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',  // 정상 브라우저
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://finance.naver.com/',
}
```

- **인코딩 주의:** 네이버 금융 페이지는 **EUC-KR** 인코딩 [CITED: greatSumini/naver-finance-crawl-mcp README]. cheerio 는 기본 UTF-8 — `iconv-lite` 또는 프록시 서비스의 자동 인코딩 처리 기능 활용 필요.
- **⚠ ScraperAPI / Bright Data 는 기본 UTF-8 decoding** — 실제 byte stream 확인 후 한글 깨짐 시 `iconv-lite` 추가 도입.

## 법적 리스크 체크리스트

### 2021도1533 판결 요지 — **무죄** 판결

[CITED: scourt.go.kr/dcboard/1727143941701_111221.pdf, kimnpark.com/blog, klep.or.kr]

대법원 2022. 5. 12. 선고 2021도1533 판결 — 피고 **무죄**. 크롤링이 자동으로 범죄가 아니라는 기준 정립:

1. **정보통신망 침입죄 (정보통신망법 제48조):**
   - 판단 기준: **서비스 제공자의 주관적 의사가 아니라, 객관적으로 드러난 기술적 보호조치·이용약관의 접근방법 명시 여부**.
   - 본 phase 함의: 네이버 토론방에 IP 차단·CAPTCHA·로그인 벽이 **없다면** 접근권한 위반 아님. 단, **robots.txt + 이용약관 명시 금지** 는 "객관적 사정"으로 작용 — **gray zone**.

2. **저작권법 위반 (데이터베이스 권):**
   - 판단 기준: **통상적 이용과 충돌 / 이익을 부당하게 해치는지**.
   - 본 phase 함의: 상위 5건 × 200 종목 × 1h 배치 = **4,800 req/day** 는 네이버 서버 부하 측면 미미. 데이터 재판매·광고 매체화 없음 → 저작권법 위반 가능성 낮음.

3. **컴퓨터등장애업무방해죄 (형법 제314조):**
   - 판단 기준: **업무방해 결과 발생**.
   - 본 phase 함의: 1~2 req/sec 제한 + p-limit(8) 동시성 → 서버 영향 0.

### 본 phase 가 "최소 침해" 기준을 통과하는 정량 근거

| 기준 | 본 phase 구현 | 근거 |
|------|---------------|------|
| **요청량** | 4,800 req/day (배치) + on-demand ≤ 30/min/user | vs. 네이버 금융 전체 일일 트래픽 (추정 1,000만+ PV) → 0.048% 미만 |
| **요청 간격** | p-limit(8) + 종목당 30초 쿨다운 | CLAUDE.md 권장 "1~2 req/sec max" 준수 |
| **캐싱** | Supabase row-level 10분 TTL | 중복 요청 방지 — 실제 프록시 호출 ~ 요청량의 5~10% |
| **User-Agent** | 정상 Firefox/Chrome UA 문자열 | CLAUDE.md 권장 |
| **재배포/재판매** | 없음 — Supabase 저장 + 로그인 사용자에게만 노출 | 판결 기준 "통상적 이용과 충돌" 회피 |
| **데이터 보존** | 90일 retention cleanup | 영구 DB 누적 배제 |
| **광고화** | 없음 — 비영리 개인 프로젝트 | 판결 기준 "이익 부당 침해" 회피 |

### Residual Risk (잔존 리스크)

1. **약관 변경 리스크:** 네이버가 금지 조항 추가 시 재평가. 본 phase 는 약관 변경 모니터링 cadence 미정의 — **Planner 결정 요청: 분기 1회 수동 review** 권장.
2. **차단 감지 시 즉시 중단:** 403/429 응답 비율 > 10% 시 자동 abort + 사람에게 알림 — Plan 에 Cloud Monitoring alert policy 추가 필요.
3. **개인 식별 정보:** 작성자 네이버 닉네임은 대부분 익명 ID. **본명/이메일/전화번호 저장 금지** (현 스키마 이미 해당 컬럼 없음 — 안전).

## Phase 7 복제 매핑 표

**핵심 원칙:** 아래 표의 모든 Phase 7 자산은 **1:1 복제 후 fetcher 교체** 로 Phase 8 대응. Phase 7 에서 해결된 문제(cooldown 로직, ApiClientError.details, CORS exposedHeaders Retry-After, auth fixture 등)는 **재발명 금지**.

| Phase 7 자산 | Phase 8 대응 | 변경 범위 | Confidence |
|-------------|--------------|-----------|-----|
| `workers/news-sync/Dockerfile` | `workers/discussion-sync/Dockerfile` | sed: `news-sync` → `discussion-sync` (3곳) | HIGH [VERIFIED: 기존 파일] |
| `workers/news-sync/package.json` | `workers/discussion-sync/package.json` | name 교체 + `cheerio`/`sanitize-html` deps 추가 | HIGH |
| `workers/news-sync/src/config.ts` | `workers/discussion-sync/src/config.ts` | `NAVER_CLIENT_ID/SECRET` 삭제 → `PROXY_API_KEY`, `PROXY_BASE_URL`, `DISCUSSION_SYNC_DAILY_BUDGET` 등 추가 | HIGH |
| `workers/news-sync/src/logger.ts` | `workers/discussion-sync/src/logger.ts` | redact paths 치환 (`naverClientSecret` → `proxyApiKey`) | HIGH |
| `workers/news-sync/src/retry.ts` | `workers/discussion-sync/src/retry.ts` | 1:1 복사 | HIGH |
| `workers/news-sync/src/services/supabase.ts` | `workers/discussion-sync/src/services/supabase.ts` | 1:1 복사 | HIGH |
| `workers/news-sync/src/naver/client.ts` (Naver API axios) | `workers/discussion-sync/src/proxy/client.ts` (프록시 경유 axios) | axios baseURL + auth 헤더만 교체. **ScraperAPI: `GET https://api.scraperapi.com/?api_key=...&url=https://finance.naver.com/item/board.naver?code=...`**. **Bright Data: 다른 endpoint** | MEDIUM |
| `workers/news-sync/src/naver/searchNews.ts` | `workers/discussion-sync/src/scraper/fetchBoard.ts` | **완전 교체** — Naver Search JSON API → HTML fetch | LOW |
| `workers/news-sync/src/naver/collectStockNews.ts` (페이지네이션 루프) | `workers/discussion-sync/src/scraper/collectDiscussions.ts` | 페이지 2~3페이지까지 스크래핑 후 `scraped_at` cutoff 도달 시 중단. Phase 7 의 `lastSeenIso` 로직 → Phase 8 은 `scraped_at` 기반 row-level TTL 이라 **훨씬 단순**. | MEDIUM |
| `workers/news-sync/src/apiUsage.ts` | `workers/discussion-sync/src/apiUsage.ts` | `service = 'naver_search_news'` → `'proxy_naver_discussion'` | HIGH |
| `workers/news-sync/src/retention.ts` | `workers/discussion-sync/src/retention.ts` | 테이블명 `news_articles` → `discussions`, 정책 동일 (90일) | HIGH |
| `workers/news-sync/src/pipeline/map.ts` | `workers/discussion-sync/src/pipeline/map.ts` | 필드 교체: `title/source/url/published_at/content_hash` → `post_id/title/body/author/posted_at/url`. `content_hash` 미도입(스키마 없음). | MEDIUM |
| `workers/news-sync/src/pipeline/upsert.ts` | `workers/discussion-sync/src/pipeline/upsert.ts` | `onConflict: 'stock_code,url'` → `onConflict: 'stock_code,post_id'` + **`ignoreDuplicates: false`** (DO UPDATE SET scraped_at — 아래 §UPSERT 전략) | HIGH |
| `workers/news-sync/src/pipeline/targets.ts` | `workers/discussion-sync/src/pipeline/targets.ts` | 1:1 복사 — `top_movers ∪ watchlists` 동일 | HIGH |
| `workers/news-sync/src/pipeline/lastSeen.ts` | **삭제 (불필요)** | Phase 7 은 `news_articles.MAX(published_at)` 로 pagination 종료. Phase 8 은 10분 TTL 기반 per-stock skip 만 필요 — `lastSeen` 모듈 부재 | HIGH |
| `workers/news-sync/src/index.ts` cycle | `workers/discussion-sync/src/index.ts` | 구조 동일. 페이지 루프 단순화, body 추출 로직 추가 | MEDIUM |
| — | `packages/shared/src/discussion.ts` (신규) | camelCase `Discussion` 타입: `id, stockCode, postId, title, body, author, postedAt, scrapedAt, url` | HIGH |
| `packages/shared/src/news-sanitize.ts` | **분리:** `packages/shared/src/discussion-sanitize.ts` (신규) | `stripHtmlToPlaintext`, `extractNid(url)`, `parseNaverBoardDate(raw)` | MEDIUM |
| `server/src/schemas/news.ts` | `server/src/schemas/discussions.ts` | `NewsListQuery` → `DiscussionListQuery` (days/hours/limit, limit max 50) | HIGH |
| `server/src/mappers/news.ts` (`toNewsArticle`) | `server/src/mappers/discussions.ts` (`toDiscussion`) | snake_case row → camelCase. `post_id → postId` 등 | HIGH |
| `server/src/routes/news.ts` (GET + POST) | `server/src/routes/discussions.ts` (GET + POST) | 구조 동일. fetcher 교체 (Naver API → 프록시 + cheerio) | MEDIUM |
| `server/src/errors.ts` `NewsRefreshCooldown`/`NaverBudgetExhausted`/`NaverUnavailable` | `DiscussionRefreshCooldown`/`ProxyBudgetExhausted`/`ProxyUnavailable` | 1:1 복사 + 이름 교체 | HIGH |
| `server/src/services/cors-config.ts` | 동일 (Phase 7 에서 `Retry-After` 이미 추가됨) | 변경 없음 | HIGH |
| `server/src/app.ts` `naverClient` 주입 | `proxyClient` 주입 | `AppDeps` 에 `proxyClient?: AxiosInstance` 추가 | HIGH |
| `server/src/server.ts` naverClient 생성 | proxyClient 생성 | ENV 기반 (없으면 undefined, 503 NAVER_UNAVAILABLE 과 동일 패턴) | HIGH |
| `webapp/src/components/stock/stock-news-section.tsx` | `webapp/src/components/stock/stock-discussion-section.tsx` | 구조 70~80% 복제. 아이콘 `MessageSquare`, copy "종목토론방", scope 24h/5, **Stale 상태 오케스트레이션 추가** (D7) | MEDIUM |
| `webapp/src/components/stock/news-refresh-button.tsx` | `discussion-refresh-button.tsx` | aria-label `"뉴스 새로고침"` → `"토론방 새로고침"`. 나머지 동일 | HIGH |
| `webapp/src/components/stock/news-empty-state.tsx` | `discussion-empty-state.tsx` | copy 교체 + 아이콘 `MessageSquareOff/Inbox` | HIGH |
| `webapp/src/components/stock/news-list-skeleton.tsx` | `discussion-list-skeleton.tsx` | variant `"card"` (5행×4줄) + `"full"` (10행×3열 grid) — UI-SPEC §5 | MEDIUM |
| `webapp/src/app/stocks/[code]/news/page.tsx` | `/discussions/page.tsx` | Compact 표 형식 (UI-SPEC §3) | MEDIUM |
| `webapp/src/lib/stock-api.ts` `fetchStockNews/refreshStockNews` | `fetchStockDiscussions/refreshStockDiscussions` | 동일 패턴 | HIGH |
| `webapp/e2e/fixtures/news.ts` | `webapp/e2e/fixtures/discussions.ts` (신규) | camelCase sample + `mockDiscussionsApi`, `buildDiscussionList` | HIGH |
| `webapp/e2e/specs/news.spec.ts` | `webapp/e2e/specs/discussions.spec.ts` | 4 concrete (list/page/cooldown/a11y) | HIGH |
| `scripts/setup-news-sync-iam.sh` | `scripts/setup-discussion-sync-iam.sh` | Secret 이름 교체: `gh-radar-naver-client-id/-secret` → `gh-radar-proxy-api-key` (단일). server SA 접근도 추가 | HIGH |
| `scripts/deploy-news-sync.sh` | `scripts/deploy-discussion-sync.sh` | Job 이름 `gh-radar-news-sync` → `gh-radar-discussion-sync`. Scheduler 1개 (`0 * * * *` KST, Phase 7 의 intraday/offhours 분리 미적용 — CONTEXT D1 명시) | HIGH |
| `scripts/smoke-news-sync.sh` | `scripts/smoke-discussion-sync.sh` | invariants 교체 | HIGH |

**복제 불필요 (Phase 7 에서 이미 설치되어 있고 범용):**
- `supabase/migrations/20260417120000_api_usage.sql` — 재사용 (service 라벨만 추가)
- `server/src/services/cors-config.ts` — `Retry-After` 이미 포함
- `webapp/src/lib/api.ts` `ApiClientError.details` — 이미 구현
- `03-UI-SPEC §4.4 Page Back Nav` R5 — 이미 구현

**신규 마이그레이션 필요성 — 없음** [VERIFIED: CONTEXT D1 이전 phase carry-forward]:
- `discussions` 테이블 (`supabase/migrations/20260413120000_init_tables.sql:58-71`) + `idx_discussions_stock_posted` 완성
- RLS `anon_read_discussions` (`20260413120100_rls_policies.sql:19-20`) 활성
- FK re-point 완료 (`20260415120000_split_stocks_master_quotes_movers.sql:141-145`)
- 단, **`api_usage` 테이블에 `service = 'proxy_naver_discussion'` 레코드가 자동 생성**되므로 마이그레이션 불필요 — `incr_api_usage(p_service, p_date, p_amount)` RPC 가 ON CONFLICT DO UPDATE 로 처리.

## UPSERT 전략 비교

**결정:** **`ON CONFLICT (stock_code, post_id) DO UPDATE SET scraped_at = EXCLUDED.scraped_at`** 채택 (CONTEXT D10 의 권장 경로).

| 전략 | 동작 | TTL 정확도 | 실제 체감 결과 | 결정 |
|------|------|-----------|----------------|------|
| `DO NOTHING` (ignoreDuplicates: true) | 중복 row skip. `scraped_at` 은 **최초 insert 시각으로 고정** | **실패** — 같은 post 가 10분 전 처음 수집됐고 지금 재수집 되면 `scraped_at = 초기값` 이라 캐시가 "오래됨" 판단 | 10분 TTL 을 per-row 가 아닌 per-stock `MAX(scraped_at)` 로 계산 (CONTEXT D4) → 이 경우에도 새 row 가 insert 되면 MAX 가 업데이트되므로 **정상 동작** | 반려 — `body` 변경 시(수정된 게시글) 저장 못 함 |
| `DO UPDATE SET scraped_at = EXCLUDED.scraped_at` | 중복 row 의 `scraped_at` 최신화, 다른 필드 보존 | ✅ 정확 | ✅ 정확 | **채택** |
| `DO UPDATE SET (scraped_at, body) = (EXCLUDED.scraped_at, EXCLUDED.body)` | scraped_at + body 최신화 | ✅ 정확 + 수정된 body 반영 | 네이버 토론방 edit 흔하지 않음. 단, 스팸 수정 시 UI 최신성 유지 | 선택지 — planner 재량 |

**권장 (planner 결정 기준):**
```sql
INSERT INTO discussions(stock_code, post_id, title, body, author, posted_at, scraped_at)
VALUES (...)
ON CONFLICT (stock_code, post_id) DO UPDATE SET scraped_at = EXCLUDED.scraped_at;
```

- `title/body/author/posted_at` 은 최초 insert 값 유지 (게시글 원본 정적 데이터).
- `scraped_at` 만 최신화 → per-stock `MAX(scraped_at)` 기반 10분 TTL 이 정확히 동작.
- `id` 는 Postgres default `gen_random_uuid()` 로 최초 insert 시 확정 — UPDATE 시 유지.

**Supabase JS SDK 표현:**
```ts
await supabase.from('discussions')
  .upsert(rows, {
    onConflict: 'stock_code,post_id',
    ignoreDuplicates: false,  // ← DO UPDATE 발동
  });
```
- 단, SDK 의 `upsert` 는 기본 모든 컬럼 UPDATE — 원하는 컬럼만 UPDATE 하려면 **직접 `.rpc()` 또는 raw SQL function** 필요. 실용적 단순화: SDK upsert 사용 시 모든 컬럼이 "같은 값"으로 덮어쓰여도 문제 없음(title/body 도 동일 값이므로 no-op).
- **주의:** 네이버가 게시글 edit 허용 → `body` 가 변경된 경우 SDK upsert 는 최신 값으로 덮어씀 — 이 경우 실제로는 **원하는 동작**.

## Cloud Run Job + Scheduler OAuth invoker 체크리스트

**재인용 근거:** Phase 05.1 Pitfall 2 + Phase 7 `scripts/deploy-news-sync.sh:148-184`. OIDC 금지. OAuth invoker SA `gh-radar-scheduler-sa` 재사용.

[VERIFIED: `scripts/deploy-news-sync.sh:152-183` — line-by-line 재확인]

### IAM 세팅 (setup-discussion-sync-iam.sh)

```bash
# 1. Runtime SA 생성 (Job 실행 주체)
gcloud iam service-accounts create gh-radar-discussion-sync-sa \
  --project="${EXPECTED_PROJECT}"

# 2. Secret Manager 신규 (프록시 API 키 1종)
echo -n "$PROXY_API_KEY" | gcloud secrets create gh-radar-proxy-api-key \
  --data-file=- --project="${EXPECTED_PROJECT}"

# 3. Secret accessor 5건 (discussion-sync 3 + server 2)
for SA in gh-radar-discussion-sync-sa; do
  for SECRET in gh-radar-supabase-service-role gh-radar-proxy-api-key; do
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
      --role=roles/secretmanager.secretAccessor \
      --project="${EXPECTED_PROJECT}"
  done
done

# 4. Server SA 에도 proxy-api-key 접근 권한 (on-demand 경로)
gcloud secrets add-iam-policy-binding gh-radar-proxy-api-key \
  --member="serviceAccount:gh-radar-server-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor \
  --project="${EXPECTED_PROJECT}"
```

### Deploy 스크립트 (deploy-discussion-sync.sh)

```bash
# Section 6: Cloud Run Job 생성/업데이트
gcloud run jobs deploy gh-radar-discussion-sync \
  --image="asia-northeast3-docker.pkg.dev/${EXPECTED_PROJECT}/gh-radar/discussion-sync:${SHA}" \
  --region="$REGION" \
  --service-account="gh-radar-discussion-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --memory=512Mi \
  --cpu=1 \
  --task-timeout=600s \
  --max-retries=1 \
  --parallelism=1 \
  --tasks=1 \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@PROXY_PROVIDER=scraperapi@PROXY_BASE_URL=https://api.scraperapi.com@DISCUSSION_SYNC_DAILY_BUDGET=4800@DISCUSSION_SYNC_CONCURRENCY=8@LOG_LEVEL=info@APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,PROXY_API_KEY=gh-radar-proxy-api-key:latest" \
  --project="$EXPECTED_PROJECT"

# Section 7: Scheduler SA → Job invoker (리소스 단위 바인딩)
gcloud run jobs add-iam-policy-binding gh-radar-discussion-sync \
  --region="$REGION" \
  --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project="$EXPECTED_PROJECT"

# Section 8: Cloud Scheduler — 단일 1h (R6 분리 운영 미적용 — CONTEXT D1)
# 주의: --oauth-service-account-email 필수, OIDC 금지 (Pitfall 2)
JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/gh-radar-discussion-sync:run"
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

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

### Pitfall 재확인

1. **Pitfall 2 (OIDC 금지):** `--oidc-service-account-email` 사용 시 Scheduler → Run Job `:run` API 호출 실패. OAuth 만 유효. [VERIFIED: Phase 05.1 DEPLOY-LOG + Phase 7 deploy-news-sync.sh:171, 181]
2. **Artifact Registry 경로 대소문자:** `asia-northeast3-docker.pkg.dev/${PROJECT}/gh-radar/discussion-sync:${SHA}` — 하이픈 유지, 소문자.
3. **Scheduler time-zone:** `Asia/Seoul` 명시 (기본값 UTC). `0 * * * *` KST 는 UTC 15시부터 시작하면 매시각 정각.
4. **Scheduler 2개 분리 금지:** Phase 7 R6 (intraday/offhours) 는 뉴스 장중/장외 특성. **토론방은 24/7 커뮤니티**라 단일 1시간 주기 — CONTEXT D1 명시.

## 테스트 레이어 제안

### Unit Tests (vitest — `workers/discussion-sync/tests/`)

| Test file | Coverage |
|-----------|----------|
| `tests/scraper/fetchBoard.test.ts` | 프록시 client axios mock → 200/403/429 response 별 throw/return. User-Agent 헤더 주입 검증. EUC-KR 인코딩 edge case. |
| `tests/scraper/parseBoardHtml.test.ts` | cheerio 파싱 — fixture HTML (목록 10건) → items 배열. `td.title > a` selector · `nid` 추출 · 작성자 · 날짜 포맷 · 빈 목록 edge. |
| `tests/pipeline/map.test.ts` | `mapToDiscussionRow(code, item)` — html strip, `post_id` null 시 skip, 날짜 invalid 시 skip, 스팸 필터(D11 — 제목 <5자 OR URL 포함) 적용. |
| `tests/pipeline/upsert.test.ts` | Supabase mock — `onConflict: 'stock_code,post_id'` + `ignoreDuplicates: false` 옵션 전달 검증. |
| `tests/pipeline/targets.test.ts` | `top_movers ∪ watchlists` dedupe (Phase 7 와 동일). |
| `tests/retention.test.ts` | `discussions` 테이블 90일 DELETE. `service_role` 전제 주석 검증. |
| `tests/apiUsage.test.ts` | `incr_api_usage('proxy_naver_discussion', ...)` 호출 검증. |
| `tests/logger.test.ts` | `proxyApiKey` redact — logger.info({cfg: {proxyApiKey: 'KEY123'}}) 출력에 'KEY123' 없음. |

### Integration Tests (server/tests/)

| Test file | Coverage |
|-----------|----------|
| `server/tests/routes/discussions.test.ts` | supertest — 6+ cases:<br>1. GET `?hours=24&limit=5` → 200, camelCase shape<br>2. GET `?limit=500` → 200 + length ≤ 50 (clamp V-13 등가)<br>3. GET invalid code → 400 INVALID_QUERY_PARAM<br>4. GET unknown code → 404 STOCK_NOT_FOUND<br>5. POST refresh (proxyClient 미주입) → 503 PROXY_UNAVAILABLE<br>6. POST refresh (scraped_at 10s 전) → 429 + Retry-After 헤더 + details.retry_after_seconds<br>7. CORS exposedHeaders contains Retry-After (Phase 7 기 추가분 재활용 검증) |

### E2E Tests (Playwright — `webapp/e2e/specs/discussions.spec.ts`)

| Test | Coverage |
|------|----------|
| Detail section render | `/stocks/005930` 방문 → `[data-testid="discussion-item"]` 5개 + 더보기 링크 + 각 `<a>` target=_blank + rel=noopener noreferrer |
| Full page render | `/stocks/005930/discussions` 방문 → `<li data-testid="discussion-item">` count ≤ 50. 컬럼 헤더 (제목/작성자/시간) 렌더. 모바일 `<720px` 에서 컬럼 헤더 숨김. |
| Refresh cooldown | 1회 refresh → 2회 refresh 시 429 mock → 버튼 disabled + `data-remaining-seconds` attribute ≤ 30 |
| Stale state | GET mock 으로 초기 데이터 로드 → refresh mock 500 응답 → Stale Badge `"X분 전 데이터"` 노출 + 재시도 버튼 |
| Empty state | GET empty → heading `"아직 토론 글이 없어요"` + CTA `"토론방 새로고침"` (primary variant) |
| a11y (axe) | detail section + full page 각각 axe-core 스캔 → serious/critical violation 0 |

### Mock 경계

- **Unit (worker):** 프록시 HTTP response (axios mock) + cheerio 에 fixture HTML 주입 — 실제 네이버 호출 없음
- **Integration (server):** Supabase mock + proxyClient mock → 실제 DB 없음
- **E2E (webapp):** `webapp/e2e/fixtures/mock-api.ts` 에서 서버 API mock → 실제 서버 없음
- **실제 프록시 호출은 Plan POC 단계 + smoke 스크립트 에서만** — CI 비용 회피.

## Sampling Rate (Validation Architecture)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (worker + server) · Playwright (webapp E2E) |
| Config file | `workers/discussion-sync/vitest.config.ts` (Phase 7 복제) · `server/vitest.config.ts` (기존) · `webapp/playwright.config.ts` (기존) |
| Quick run (worker) | `pnpm -F @gh-radar/discussion-sync test --run` |
| Quick run (server) | `pnpm -F @gh-radar/server test -- discussions.test.ts --run` |
| Quick run (webapp E2E) | `pnpm -F webapp e2e --grep discussions` |
| Full suite | `pnpm -r test --run && pnpm -F webapp e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 (1) 목록 표시 | 상세 Card 5건 + 전체 페이지 50건 | E2E | `pnpm -F webapp e2e --grep "discussions detail"` | ❌ Wave 0 |
| DISC-01 (2) on-demand + 캐싱 | 캐시 hit → Supabase 직접 반환 / 미스 → 프록시 호출 | Integration | `pnpm -F @gh-radar/server test -- discussions.test.ts --run` | ❌ Wave 0 |
| DISC-01 (3) discussions 테이블 저장 | UPSERT + 90일 retention | Unit | `pnpm -F @gh-radar/discussion-sync test --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm -F @gh-radar/{worker|server|webapp} test --run` (해당 workspace 만)
- **Per wave merge:** 해당 wave 의 모든 workspace test + E2E smoke
- **Phase gate:** Full suite + 프로덕션 smoke (`scripts/smoke-discussion-sync.sh`) green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/shared/src/discussion.ts` — camelCase `Discussion` 타입
- [ ] `packages/shared/src/discussion-sanitize.ts` — `stripHtmlToPlaintext`, `extractNid`, `parseNaverBoardDate`
- [ ] `workers/discussion-sync/` 디렉터리 스캐폴드 (Dockerfile/package.json/tsconfig 복제)
- [ ] `workers/discussion-sync/vitest.config.ts`
- [ ] `workers/discussion-sync/tests/helpers/naver-board-fixtures.ts` — 실제 네이버 HTML 샘플 (POC 캡처본)
- [ ] `server/tests/routes/discussions.test.ts` — stub (it.todo 8개)
- [ ] `webapp/e2e/fixtures/discussions.ts` — camelCase sample + mockDiscussionsApi
- [ ] `webapp/e2e/specs/discussions.spec.ts` — stub
- [ ] `scripts/setup-discussion-sync-iam.sh` + `deploy-discussion-sync.sh` + `smoke-discussion-sync.sh` 스캐폴드

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 본 phase 는 기존 Supabase Auth 상속 — 추가 인증 없음 |
| V3 Session Management | no | 해당 없음 |
| V4 Access Control | yes | `discussions` RLS `anon_read_discussions` 유지. 쓰기는 service_role 전용. |
| V5 Input Validation | yes | `StockCodeParam` regex `/^[A-Za-z0-9]{1,10}$/` + `DiscussionListQuery` Zod clamp (Phase 7 동일) |
| V6 Cryptography | no | 해당 없음 (프록시 통신은 HTTPS — axios client baseURL https:// 강제) |

### Known Threat Patterns for {cheerio + proxy + Cloud Run Job}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| HTML injection (크롤링된 body 저장 후 UI 노출) | Tampering (XSS) | `sanitize-html` 로 **server 저장 직전** plaintext 화. UI 는 plaintext 만 받아 React 기본 escape 로 안전. Phase 7 title 은 regex stripHtml 충분했으나 Phase 8 body 는 광범위 HTML 대응 필요. |
| URL tabnabbing | Tampering | `target="_blank" rel="noopener noreferrer"` 필수 (D5). UI-SPEC §1 lock. |
| Open redirect / 악성 URL 저장 | Tampering | `isAllowedUrl(url)` — http/https 만 허용 (Phase 7 T-02 mitigation 재사용). `javascript:`/`data:` 차단. 단, 네이버 URL 은 `finance.naver.com` 로 고정 → `allowedHosts` 화이트리스트 추가 권장. |
| Proxy API key 노출 | Information Disclosure | pino redact paths `'cfg.proxyApiKey', '*.PROXY_API_KEY', 'headers["X-Proxy-Auth"]'`. Phase 7 `naverClientSecret` 패턴 재사용. [CITED: workers/news-sync/src/logger.ts] |
| Log injection (네이버 HTML content) | Tampering | pino structured logging — 크롤링된 title/body 는 **로그에 저장 금지** (warn 로그는 `code/error.message` 만). |
| SQL injection (UPSERT 데이터) | Tampering | Supabase JS SDK parametric — `.upsert(rows, {onConflict})` 만 사용. 문자열 concat 금지 (Phase 7 T-08 동일). |
| Prototype pollution (외부 HTML → JS object) | Tampering | cheerio 는 안전 — 자체 파싱 엔진 사용, JS eval 없음. sanitize-html 은 `disallowedTagsMode: 'discard'` 기본값. |
| 프록시 서비스 약관 위반 → 계정 정지 | Denial of Service (운영 중단) | Plan 수립 시 약관 내 "personal/non-commercial use" 조항 확인 필수. robots.txt respect 체크. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Dockerfile 빌드 | ✓ | — | — |
| gcloud CLI | Cloud Run Job deploy | ✓ | — | — |
| GCP project `gh-radar` | Job/Secret/Scheduler | ✓ (기존) | — | — |
| Artifact Registry `gh-radar` repo | 이미지 push | ✓ (기존) | — | — |
| Supabase `discussions` 테이블 | 저장소 | ✓ (기존 스키마) | — | — |
| Supabase `api_usage` 테이블 + `incr_api_usage` RPC | 프록시 예산 카운터 | ✓ (Phase 7 생성분) | — | — |
| `gh-radar-scheduler-sa` SA | Scheduler invoker | ✓ (기존) | — | — |
| `gh-radar-server-sa` SA | server SA (Phase 2) | ✓ (기존) | — | — |
| **프록시 서비스 계정 (ScraperAPI 또는 Bright Data)** | 스크래핑 수단 | ✗ | — | **없음 — Plan POC 단계 필수 선정** |
| **프록시 API 키 (Secret Manager)** | 런타임 주입 | ✗ | — | 위 서비스 선정 후 생성 |

**Missing dependencies with no fallback:**
- 프록시 서비스 계정·API 키 — Plan POC 단계에서 **사용자 결제 필요** (월 $49~). 비용 승인은 CONTEXT D1 specifics 에 명시됨.

**Missing dependencies with fallback:**
- 없음

## Common Pitfalls

### Pitfall 1: 프록시 서비스 약관 미확인
**What goes wrong:** ScraperAPI/Bright Data 의 "personal use / commercial use" 약관 경계를 POC 없이 선정 → 계정 정지 또는 추가 요금.
**Why it happens:** 저렴한 Hobby plan 은 대부분 commercial use 금지.
**How to avoid:** Plan 1단계에서 약관 명시 조항 복사 + 본 phase 를 "non-commercial personal project" 로 classify 명시. Bright Data/ScraperAPI 문서 URL 을 PLAN 에 저장.
**Warning signs:** 계정 등록 시 use case 기입란에서 선택지 애매.

### Pitfall 2: 네이버 HTML 구조 변경
**What goes wrong:** 네이버 토론방 DOM 이 업데이트되면 cheerio selector 가 모두 실패 → 0건 파싱.
**Why it happens:** 외부 서비스 DOM 은 private API. 공지 없음.
**How to avoid:** Plan 에 **fallback selector 2~3종** 준비 + `parsed === 0` 감지 시 즉시 alert. 수집 성공률 < 50% 면 스케줄러 자동 중단 trigger.
**Warning signs:** 배치 실행 후 inserted=0 로그 연속.

### Pitfall 3: EUC-KR 인코딩 한글 깨짐
**What goes wrong:** cheerio 기본 UTF-8 파싱 → 네이버 EUC-KR 응답에서 제목/작성자 한글 깨짐.
**Why it happens:** 네이버 금융 페이지는 legacy EUC-KR. 프록시 서비스는 기본 UTF-8 decoding.
**How to avoid:** POC 단계에서 실제 byte stream 확인. 깨짐 시 `iconv-lite` 로 EUC-KR → UTF-8 변환 후 cheerio 파싱. 또는 프록시 서비스의 auto-detect 옵션 활용.
**Warning signs:** title/body 에 `?????` 문자.

### Pitfall 4: `nid` 파싱 실패
**What goes wrong:** URL 포맷 변경 (예: `nid=` → `articleId=`) 로 regex 매칭 실패 → `post_id` null → UPSERT 실패.
**Why it happens:** 네이버 URL 구조 리팩터.
**How to avoid:** regex `/[?&]nid=(\d+)/` + fallback regex `/[?&]articleId=(\d+)/` + 파싱 실패 시 per-item skip + warn.
**Warning signs:** 배치 로그 "nid not found" 경고 빈도.

### Pitfall 5: 프록시 비용 폭증
**What goes wrong:** DOM 실패·재시도 로직이 과도하게 재시도 → 프록시 credit 하루 안에 소진.
**Why it happens:** Phase 7 의 retry 로직 1회만 했던 기본값을 복제했는데, 프록시는 네트워크 타임아웃이 더 흔해 실패 재시도 2~3회가 실제 운영에 나아 보임.
**How to avoid:** Plan 에서 **retry 정책 보수적 설정** — 최대 1회 + exponential backoff + HTTP 4xx 는 재시도 금지. 일일 예산 카운터 atomic increment (Phase 7 `incr_api_usage` 재사용).
**Warning signs:** credit 사용량 그래프 선형 증가.

### Pitfall 6: 상세 페이지 body fetch 경로 미정
**What goes wrong:** 목록 페이지만 fetch 했는데 UI 는 `body` preview 노출 요구 → DB `body` null 로 UI 렌더 실패.
**Why it happens:** 네이버 목록은 제목만 SSR 렌더링.
**How to avoid:** Plan 초기에 **경로 확정** — 본 리서치 §"네이버 종목토론방 DOM 구조" 에서 옵션 2(목록+상위 5건 별도 fetch) 권장.
**Warning signs:** UI-SPEC 에 `body` preview 있는데 DB `body` null 다수.

### Pitfall 7: Phase 7 guardrail 회귀 (V-20)
**What goes wrong:** Phase 8 이 `sanitize-html` 도입 → Phase 7 `workers/news-sync/` 의 `grep -r "sanitize-html" workers/news-sync/` 가 여전히 0 이어야 하는 acceptance criteria 회귀 가능.
**Why it happens:** 루트 `pnpm add` 가 아닌 `pnpm -F @gh-radar/discussion-sync add` 로 격리해야 하는데 실수로 workspace 전역 설치.
**How to avoid:** Plan 에 **`pnpm -F @gh-radar/{target}` 필터 필수** 명시. V-20 guardrail 검증은 Phase 7 workspace 에만 적용되도록 acceptance criteria 에 workspace 경로 명시.
**Warning signs:** `pnpm ls sanitize-html --depth=0` 이 news-sync workspace 에 나타남.

## Code Examples

**주의: 아래 스니펫은 Plan 단계의 참조점. 구현은 plan task action 에서 수행.**

### cheerio 기본 파싱 (Discussion 목록)

```ts
// workers/discussion-sync/src/scraper/parseBoardHtml.ts (Plan 단계 구현)
import * as cheerio from 'cheerio';
import type { RawDiscussionItem } from '../types.js';

export function parseBoardHtml(html: string): RawDiscussionItem[] {
  const $ = cheerio.load(html);
  const items: RawDiscussionItem[] = [];

  // 목록 행 순회 — type2 테이블 tbody tr
  $('table.type2 tbody tr').each((_, el) => {
    const $row = $(el);
    const $titleLink = $row.find('td.title > a');
    const href = $titleLink.attr('href');
    if (!href) return;

    // nid 추출
    const nidMatch = href.match(/[?&]nid=(\d+)/);
    if (!nidMatch) return;
    const postId = nidMatch[1];

    const title = $titleLink.text().trim();
    const author = $row.find('td:nth-child(3)').text().trim();
    const postedRaw = $row.find('td:nth-child(1)').text().trim();  // "2026.04.17 14:32"
    const url = `https://finance.naver.com${href.startsWith('/') ? href : '/item/' + href}`;

    items.push({ postId, title, author, postedRaw, url });
  });

  return items;
}
```

Source: [CITED: nomorecoke/naver-finance-board-crawler Python original — 2026-04-17 WebFetch]

### sanitize-html 설정 (body plaintext)

```ts
// packages/shared/src/discussion-sanitize.ts (Plan 단계 구현)
import sanitizeHtml from 'sanitize-html';

export function stripHtmlToPlaintext(input: string): string {
  if (!input) return '';
  return sanitizeHtml(input, {
    allowedTags: [],  // 모든 태그 제거
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    textFilter: (text) => text.replace(/\s+/g, ' ').trim(),
  }).trim();
}

export function parseNaverBoardDate(raw: string): string | null {
  // "2026.04.17 14:32" → ISO "2026-04-17T14:32:00+09:00"
  const m = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
}

export function extractNid(href: string): string | null {
  const m = href.match(/[?&]nid=(\d+)/);
  return m?.[1] ?? null;
}
```

Source: [CITED: sanitize-html docs + Naver date format from nomorecoke crawler]

### 프록시 client (ScraperAPI 기준)

```ts
// workers/discussion-sync/src/proxy/client.ts (Plan 단계 구현)
import axios, { type AxiosInstance } from 'axios';
import type { DiscussionSyncConfig } from '../config.js';

export function createProxyClient(cfg: DiscussionSyncConfig): AxiosInstance {
  if (!cfg.proxyBaseUrl.startsWith('https://')) {
    throw new Error(`PROXY_BASE_URL must be https (got: ${cfg.proxyBaseUrl})`);
  }
  return axios.create({
    baseURL: cfg.proxyBaseUrl,
    timeout: 30000,  // 프록시 latency 고려 — Phase 7 Naver API (15s) 보다 길게
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'User-Agent': `gh-radar-discussion-sync/${cfg.appVersion}`,
    },
  });
}

// ScraperAPI: GET https://api.scraperapi.com/?api_key=KEY&url=ENCODED_TARGET
export async function fetchNaverBoard(
  client: AxiosInstance,
  cfg: DiscussionSyncConfig,
  stockCode: string,
): Promise<string> {
  const target = `https://finance.naver.com/item/board.naver?code=${stockCode}`;
  const res = await client.get<string>('/', {
    params: {
      api_key: cfg.proxyApiKey,
      url: target,
      country_code: 'kr',  // 한국 IP 요청
    },
    responseType: 'text',  // HTML 응답
  });
  return res.data;
}
```

Source: [CITED: docs.scraperapi.com — "?api_key&url"]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 자체 IP rotation | Managed proxy service (ScraperAPI/Bright Data) | 2024~ | 한국 사이트 스크래핑 업계 표준. 개인 프로젝트는 managed 가 압도적. |
| HTML 파싱: regex | cheerio (jQuery-like) | 2015+ | 표준. 2026 기준 cheerio 1.2.0 Node 22 호환 안정. |
| Playwright 강제 | cheerio + axios (SSR 페이지) | 2020+ | SSR 페이지는 cheerio 가 3000× 빠르고 200× 가볍다. |
| Redis 분산 캐시 | DB row-level TTL (MVP) | 본 phase | Supabase row-level 은 운영 단순성 우선. 트래픽 증가 시 Redis 재검토 — deferred |

**Deprecated/outdated:**
- `striptags` 패키지 — 2020 이후 업데이트 멈춤. `sanitize-html` 대체.
- `node-fetch` — Node 22 내장 fetch 로 대체 (단, 본 phase 는 axios 사용 — Phase 7 과 일관성).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ScraperAPI Hobby $49/월 100K credits 가 본 phase 배치량 144K/mo 에 충분 | 프록시 매트릭스 | **중** — Startup $149 로 업그레이드 필요 시 Plan 예산 재검토. body fetch 옵션 2 채택 시 ~862K credits/mo 예상 — Startup 필수. |
| A2 | 네이버 목록 테이블 구조가 2026-04 시점 실제로 `table.type2 tbody tr` + `td.title > a` | DOM 구조 | **중** — Plan POC 에서 실제 HTML 캡처 + selector 재검증 필수. fallback selector 2~3종 준비. |
| A3 | 네이버 토론방 목록 페이지가 SSR (JS 렌더링 불필요) | DOM 구조 | **저** — Phase Context D1 carry-forward + CLAUDE.md 명시. 반례 발생 시 Playwright 필요 → Cloud Run 이미지 용량 급증. |
| A4 | EUC-KR 인코딩이 현재도 유지 | DOM 구조 | **저** — 최근 네이버 페이지 중 일부는 UTF-8 전환 진행 중. POC 단계 실제 확인. |
| A5 | 프록시 서비스 약관이 "non-commercial personal use" 를 허용 | 프록시 매트릭스 | **중** — 각 서비스 TOS 실제 문서 확인 필수. Plan 에 링크 저장. |
| A6 | Phase 7 `incr_api_usage` RPC 가 `service='proxy_naver_discussion'` 값으로 자동 확장 가능 (마이그레이션 없이) | 프록시 예산 카운터 | **저** — [VERIFIED: 20260417120000_api_usage.sql:23-38] ON CONFLICT DO UPDATE 구조 확인됨 |
| A7 | Phase 7 의 Dockerfile/scripts 구조가 discussion-sync 에 100% 복제 가능 | 복제 매핑 | **저** — Phase 05.1/06.1/07 에서 3번 반복된 패턴. 회귀 리스크 최소. |
| A8 | Supabase JS SDK `upsert({ignoreDuplicates: false})` 로 `DO UPDATE SET` 발동 (모든 컬럼 UPDATE) | UPSERT 전략 | **중** — 필요 시 raw SQL RPC 함수로 fallback. |
| A9 | 2021도1533 판결의 "최소 침해" 기준이 본 phase 의 정량 수치 (4,800 req/day 등) 에 적용 안전 | 법적 리스크 | **중** — 법적 자문 아님. Plan 단계에서 사용자 최종 승인 받기. |
| A10 | `body` full text 는 게시글 상세 페이지 별도 fetch 필요 (목록 페이지엔 제목만) | DOM 구조 | **높음** — POC 단계 **최우선 확인**. 영향: body fetch 옵션 1/2/3 결정. |

**확인 필요 항목 (Plan POC 최우선):** A1 (credit 예산) · A2 (selector 실증) · A4 (인코딩) · A10 (body 경로)

## Open Questions — Planner 결정 요청 목록

아래는 CONTEXT "Open for Planner" 13개 + 본 리서치에서 추가 발굴한 항목. 가격 숫자 포함.

1. **[CRITICAL — 비용]** 프록시 서비스 선정
   - 선택지: ScraperAPI Hobby $49/mo (100K credits) / Startup $149/mo (1M credits) / Bright Data Web Unlocker Growth $499/mo / PAYG $1.5/1K req / Oxylabs $75/mo + bandwidth
   - 권장: **ScraperAPI Startup $149/mo** — 본 phase 144K/mo 배치 + body fetch 옵션 2 채택 시 ~862K/mo 여유 있게 커버 + premium proxy 10× credit 감안해도 부족하면 Business tier 고려
   - Planner 결정 필요: 서비스 + plan + 월 예산 상한

2. **[CRITICAL — UI 계약]** body 수집 경로 (본 리서치 §DOM 구조 3옵션)
   - 옵션 1: 목록만 fetch → body null → UI preview 생략 (UI-SPEC 모순)
   - 옵션 2: 목록 + 상위 5건 상세 fetch → body 저장 (프록시 요청량 6×, 월 ~$30 추가)
   - 옵션 3: POC 실측 후 DOM mouseover preview 확인
   - 권장: **옵션 2**

3. **POC 설계** — 대표 3~5 종목 (삼성전자 005930 / LG에너지솔루션 373220 / 카카오 035720 / 에코프로 086520 / 셀트리온 068270) × 1~2주 × 유용성/차단률/비용 측정
   - Planner 결정: POC plan 을 Wave 0 또는 Wave 1 에 둘지
   - 권장: **Wave 0** (인프라 스캐폴드 전에 POC — 프록시 서비스 약관/한글 인코딩 리스크 선제 해소)

4. **cheerio selector 구체** — 본 리서치 §DOM 구조 selector 를 POC 에서 실측 확정
   - Planner 결정: fallback selector 몇 개?
   - 권장: **primary + 2 fallback** (DOM 안정성 보험)

5. **HTML strip 라이브러리** — `sanitize-html@2.17.2` vs 정규식
   - 권장: **sanitize-html** (Phase 7 news-sanitize 와 분리)
   - Planner 결정: Phase 7 `news-sanitize.ts` 도 마이그레이션 할지 여부 — **반려 권장** (Phase 7 안정화 완료, 회귀 리스크)

6. **UPSERT 전략** — `DO NOTHING` vs `DO UPDATE SET scraped_at`
   - 권장: **DO UPDATE SET scraped_at** (본 리서치 §UPSERT 비교)
   - Planner 결정: 확정

7. **Retention cleanup** — discussion-sync Job 훅 vs 독립 Cloud Scheduler
   - 권장: **Job 훅** (Phase 7 패턴 재사용, 추가 Scheduler 생성 없음)
   - Planner 결정: 확정

8. **프록시 예산 카운터 저장소** — Supabase `api_usage` 확장 vs 별도 테이블
   - 권장: **`api_usage` 확장** (`service='proxy_naver_discussion'`) — 마이그레이션 불필요 [VERIFIED]
   - Planner 결정: 확정

9. **섹션 컴포넌트 공통 추상화** — `StockNewsSection` / `StockDiscussionSection` 공통 부모 `SectionCard`
   - 권장: **Deferred** (Phase 8 완료 후 리팩터링) — CONTEXT Deferred 명시
   - Planner 결정: Phase 8 범위 외 확정

10. **Next.js server/client 경계** — `/discussions` 페이지 server-fetch vs 'use client'
    - 권장: **`'use client'` + Next 15 `use(params)`** — Phase 7 `/news` 패턴 일치
    - Planner 결정: 확정

11. **테스트 범위** — unit / integration / E2E
    - 권장: 본 리서치 §"테스트 레이어 제안" 전체 채택 (≥ 20 unit + 7 integration + 6 E2E)
    - Planner 결정: 확정

12. **per-stock 실패 분리 + metrics** — Phase 7 패턴
    - 권장: per-stock try/catch + stopAll flag (401 / 프록시 budget 소진 시). metrics: pages/inserted/skipped/errors/budgetBefore/After/retentionDeleted
    - Planner 결정: 확정

13. **Dockerfile/deploy 복제** — news-sync 템플릿
    - 권장: 본 리서치 §"Phase 7 복제 매핑 표" 전체 채택
    - Planner 결정: 확정

14. **Wave 순서 명시** — Phase 7 Wave 2 의존
    - 권장: Wave 0 (shared types + POC) → Wave 1 (worker/server + unit/integration tests) → Wave 2 (webapp UI — **Phase 7 Wave 2 merge 이후 진입 blocking**) → Wave 3 (IAM + deploy + E2E + smoke)
    - Planner 결정: 확정

15. **[신규 — 법적]** 약관 변경 모니터링 주기
    - 권장: **분기 1회 수동 review** — 프록시 서비스 + 네이버 TOS
    - Planner 결정: Plan 에 명시적으로 documented maintenance schedule 추가 여부

16. **[신규 — 차단 감지]** 자동 abort 임계치
    - 권장: HTTP 403/429 응답 비율 > 10% → stopAll + Cloud Monitoring alert
    - Planner 결정: 임계치 확정 + alert policy 작성

17. **[신규 — body fetch retry]** 상세 페이지 fetch 실패 시
    - 옵션 1: skip (body null)
    - 옵션 2: 1회 재시도 후 skip
    - 권장: **옵션 1** (초기 보수적 운영, 프록시 credit 절약)
    - Planner 결정: 확정

## Sources

### Primary (HIGH confidence)
- `/Users/alex/repos/gh-radar/.planning/phases/08-discussion-board/08-CONTEXT.md` — D1~D12 locked decisions (2026-04-17)
- `/Users/alex/repos/gh-radar/.planning/phases/08-discussion-board/08-UI-SPEC.md` — UI 계약 (§1 상세 Card, §3 Compact 페이지, §4 빈 상태, §5 로딩, §6 에러)
- `/Users/alex/repos/gh-radar/.planning/phases/07-news-ingestion/07-CONTEXT.md` + `07-02` ~ `07-06` PLAN — Phase 7 복제 기준
- `/Users/alex/repos/gh-radar/.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/05.1-CONTEXT.md` — Pitfall 2 OAuth invoker 근거
- `/Users/alex/repos/gh-radar/CLAUDE.md` §"Naver 종목토론방" — 법적 가이드, 아키텍처 결정
- `/Users/alex/repos/gh-radar/supabase/migrations/20260413120000_init_tables.sql:58-71` — discussions 스키마
- `/Users/alex/repos/gh-radar/supabase/migrations/20260417120000_api_usage.sql` — api_usage 테이블 + RPC (Phase 7 생성분)
- `/Users/alex/repos/gh-radar/scripts/deploy-news-sync.sh:130-184` — OAuth invoker 실제 구현
- `/Users/alex/repos/gh-radar/webapp/src/components/stock/stock-detail-client.tsx:140-146` — 교체 대상 placeholder 위치

### Secondary (MEDIUM confidence)
- https://kimnpark.com/kr-blog/웹크롤링-형사처벌-가능성-대법원-2021도1533-판결-완전분석 — 판결 요지 해설 (무죄 판결 + 기준 정립) — WebSearch 2026-04-17
- https://file.scourt.go.kr/dcboard/1727143941701_111221.pdf — 법원행정처 판결 분석 PDF
- https://github.com/nomorecoke/naver-finance-board-crawler — Python BS4 크롤러 (selector 원본 — WebFetch 2026-04-17)
- https://github.com/LMMYH/naverfinance_opinion_crawler — 동일 사이트 크롤러 (CLAUDE.md 링크된 참조)
- https://www.npmjs.com/package/cheerio — cheerio 1.2.0 (2026-01-23) — WebSearch 2026-04-17
- https://www.npmjs.com/package/sanitize-html — sanitize-html 2.17.2 — WebSearch 2026-04-17
- https://brightdata.com/blog/web-data/best-web-unblockers — 성공률 데이터
- https://docs.scraperapi.com/control-and-optimization/premium-residential-mobile-proxy-pools — ScraperAPI premium 10× credit
- https://oxylabs.io/pricing/residential-proxy-pool — Oxylabs pricing
- https://dev.to/agenthustler/best-web-scraping-apis-in-2026-scraperapi-vs-scrapeops-vs-bright-data-vs-oxylabs — 비교 분석

### Tertiary (LOW confidence — POC 검증 필요)
- 네이버 토론방 실제 DOM 구조 (A2) — Python 오픈소스의 selector 가 cheerio JS 환경에서도 동작하는지 Plan POC 에서 확증 필요
- EUC-KR 인코딩 유지 여부 (A4) — 실제 HTTP response byte stream 확인 필요
- body 수집 경로 (A10) — DOM 실사 + 프록시 credit 영향 실측
- 프록시 서비스 약관 "commercial use" 해석 (A5) — 사용자 직접 확인 권장

## Metadata

**Confidence breakdown:**
- Phase 7 복제 매핑: **HIGH** — 코드 실존 확인 완료
- 프록시 비교: **MEDIUM** — 공식 pricing 확인 완료, 한국 IP 성공률은 서비스별 문서 기준 (실측 없음)
- DOM 파싱: **MEDIUM** — Python 오픈소스 selector 실증, cheerio 이식성·실제 DOM 2026-04 확인은 POC 필요
- 법적 리스크: **MEDIUM** — 판결 요지 검증 완료, 본 phase 적용은 법적 자문 아님
- UPSERT 전략: **HIGH** — Supabase SDK + Postgres 표준 동작

**Research date:** 2026-04-17
**Valid until:** 2026-06-17 (네이버 DOM 은 불안정 — 2개월 후 재검증 권장. 프록시 pricing 은 분기 1회 재검증.)
