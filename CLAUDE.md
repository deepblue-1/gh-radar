<!-- GSD:project-start source:PROJECT.md -->
## Project

**gh-radar**

한국 주식 트레이더를 위한 실시간 종목 정보 웹앱. 상한가에 근접한 종목을 실시간으로 스캔하고, 관심 종목의 뉴스와 네이버 종목토론방 정보를 AI가 요약하여 제공한다.

**Core Value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다.

### Constraints

- **Budget**: 무료 API 활용 우선, API 호출 비용 최소화
- **데이터 갱신**: 실시간이 이상적이나, API 제한 시 1분 간격 폴링 허용
- **배포 환경**: 프론트 Vercel, 백엔드 Cloud Run (컨테이너 기반)
- **법적**: 크롤링 시 robots.txt 준수, API 이용약관 준수
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x (App Router) | Frontend | Already decided in PROJECT.md; App Router enables server components that reduce client JS bundle, Vercel native |
| React | 19.x | UI runtime | Ships with Next.js 15; concurrent features improve perceived latency |
| TypeScript | 5.x | Language | Type safety across API calls and Supabase schema |
| Tailwind CSS | 4.x | Styling | Already decided; zero-config purging, fast iteration |
| shadcn/ui | latest | Component library | Already decided; unstyled Radix primitives + Tailwind, fully owned code |
### Backend
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Express | 5.x | HTTP server | Already decided; lightweight, well-understood, easy to containerize for Cloud Run |
| TypeScript | 5.x | Language | Shared types with frontend possible via monorepo |
| BullMQ | 5.x | Job queue | Background jobs for polling KIS REST API every ~60s and triggering Claude summarization; Redis-backed, mature |
| node-cron | 3.x | Scheduler | Simple cron triggers for market-hours-only polling; lighter than a full scheduler |
### Database / Realtime
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase | managed | PostgreSQL + realtime pub/sub | Already decided; Postgres with built-in `postgres_changes` realtime allows backend to write stock snapshots and frontend to subscribe without additional infrastructure |
| Redis (via Upstash) | managed | BullMQ backing store + rate-limiter | Serverless Redis from Upstash is zero-cost at low volume and compatible with Cloud Run's stateless containers |
### Stock Data Sources
| Source | Access Method | Data Type | Confidence |
|--------|--------------|-----------|------------|
| 한국투자증권 KIS OpenAPI | REST + WebSocket | Real-time current price, bid/ask, change rate ranking | HIGH |
| pykrx | Python scraping library | End-of-day OHLCV, sector data (supplement only) | HIGH |
| KRX OpenAPI (openapi.krx.co.kr) | REST | End-of-day historical, listed securities | MEDIUM |
- Provides `국내주식 등락률 순위` (change rate ranking) REST endpoint — this is the core API for scanning stocks approaching the upper limit (상한가)
- Supports real-time WebSocket subscriptions (TR code `H0STCNT0`) for live execution prices
- WebSocket rate limit: 41 stocks per session; use multiple sessions if subscribing to many
- REST API rate limit: 20 calls/second (error code `EGW00201` on breach)
- Requires: Korea Investment & Securities account (real or paper/모의투자); OAuth2 app key + secret via developer portal at `apiportal.koreainvestment.com`
- Account requirement is low friction — paper account (모의투자 계좌) is sufficient for market data read access; no actual investment needed
- Actively maintained with official GitHub repo (`koreainvestment/open-trading-api`) and community Python wrappers
### News Data Sources
| Source | Access Method | Data Type | Confidence |
|--------|--------------|-----------|------------|
| Naver Search OpenAPI (뉴스) | Official REST API | News articles by keyword/stock name | HIGH |
| Naver 종목토론방 (discussion board) | HTTP scraping (non-JS endpoint) | User posts by stock code | MEDIUM |
- Official API at `developers.naver.com`; requires client ID + secret (free tier)
- Rate limit: 25,000 calls/day; 100 results per call; `start` max = 1000 (100K items accessible)
- Search by stock name or ticker as keyword → returns recent news articles with title, description, pubDate, link
- Legally sound: official API, no scraping, terms allow non-commercial and commercial use with attribution
- Confidence: HIGH — official, documented, actively supported
- URL pattern: `https://finance.naver.com/item/board.naver?code={종목코드}`
- The discussion board page renders key content in server-side HTML (not fully SPA); basic HTTP GET + HTML parsing with `cheerio` works for listing posts
- Caveat: Naver has anti-bot measures and blocks aggressive crawlers; must respect rate limits (1–2 req/sec max), set realistic User-Agent, and monitor for blocks
- robots.txt: Naver disallows deep crawling; discussion board pages are in a gray zone — widely practiced in Korean quant community but carries legal risk if done at scale
- Korean Supreme Court 2022. 5. 12. 선고 2021도1533 (여기어때 v. 야놀자, criminal) acquitted scraping under 정보통신망법, 컴퓨터등장애업무방해, 저작권법 — criminal liability from ToS violation alone is **not** established when no explicit access protection (auth) is bypassed and copying is not of a "substantial part" of the DB.
- However, 대법원 2017다224395 (잡코리아 v. 사람인, civil) **did** uphold DB-producer rights infringement and ordered substantial damages — the real, live risk for Naver scraping is **civil**, not criminal. Keep scraping minimal, cached, attributed, and avoid full-DB equivalence to stay outside the civil DB-right zone.
- **Architecture decision:** Scrape on-demand (when user views a stock) rather than bulk-polling all stocks. Trigger scrape → cache result in Supabase for 5–10 minutes → serve from cache.
- Confidence: MEDIUM — technically feasible, legally gray, must stay conservative
### AI Summarization
| Technology | Model | Purpose | Why |
|------------|-------|---------|-----|
| Anthropic Claude API | claude-haiku-4-5 | Summarize news + discussion board content | Already decided; Korean language quality, cost-optimized |
- Pricing: Haiku 4.5 = $1.00/M input + $5.00/M output tokens
- Sonnet = $3.00/M input + $15.00/M output (3× more expensive)
- Korean news summarization is not a complex reasoning task — Haiku handles it with excellent quality
- Typical summarization call: ~2,000 input tokens + ~300 output tokens ≈ $0.0035/call with Haiku vs $0.015 with Sonnet
- Enable Batch API (50% discount) for non-urgent background summarization jobs queued via BullMQ
- On-demand (user-triggered) calls use real-time API; background pre-summarization uses Batch API
### Real-Time Data Delivery to Browser
| Pattern | Technology | When |
|---------|-----------|------|
| Server-Sent Events (SSE) | Native EventSource API + Express `res.write` | Push stock price updates to browser (server → client only) |
| Supabase Realtime | `postgres_changes` subscription | Push DB-level changes (e.g., new summary ready) |
| HTTP polling (fallback) | setInterval + fetch | If SSE drops or for low-frequency updates |
- Stock price display is purely server → client (no need for bidirectional WebSocket)
- SSE uses HTTP/1.1 or HTTP/2; no protocol upgrade; works through most proxies and load balancers
- Auto-reconnects via browser `EventSource` API without custom code
- Simpler than WebSocket for this use case: backend holds KIS WebSocket connection → fans out to browser clients via SSE
- Architecture: `KIS WebSocket → Express SSE broadcaster → Browser EventSource`
### Infrastructure
| Technology | Purpose | Why |
|------------|---------|-----|
| Vercel | Frontend hosting | Already decided; zero-config Next.js, edge CDN |
| Google Cloud Run | Backend (Express) container | Already decided; stateless containers, scale-to-zero cost model |
| Supabase | Database + realtime | Already decided; managed Postgres, free tier sufficient for v1 |
| Upstash Redis | BullMQ backing store | Serverless Redis compatible with Cloud Run; free tier = 10K commands/day |
| Docker | Container packaging | Required for Cloud Run; multi-stage build to minimize image size |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Primary stock data | KIS OpenAPI | pykrx | pykrx is end-of-day only; no real-time capability |
| Primary stock data | KIS OpenAPI | KRX OpenAPI | KRX API is batch/historical; no intraday/real-time |
| Primary stock data | KIS OpenAPI | LS증권 OpenAPI | KIS has superior documentation and largest community; LS is viable backup |
| News source | Naver Search API | Direct web scraping | Official API is legally safe, documented, rate-limited fairly |
| Discussion board | cheerio + axios | Playwright/Puppeteer | Headless browser too heavy for Cloud Run; HTML is parseable statically |
| AI model | claude-haiku-4-5 | claude-sonnet-4-6 | Haiku is 3× cheaper; quality sufficient for summarization tasks |
| Real-time push | SSE | Socket.io | Socket.io is overkill; SSE is sufficient for server-to-client stock feeds |
| Real-time push | SSE | Supabase Realtime only | Supabase Realtime for DB events; SSE for high-frequency price ticks |
| Job queue | BullMQ + Redis | Node-cron only | BullMQ gives retry logic, delay, concurrency control for API polling jobs |
| Redis | Upstash | Self-hosted Redis | Cloud Run is stateless; self-hosted Redis needs separate VM; Upstash is serverless |
## Key Constraints and Warnings
### KIS OpenAPI Account Requirement
### KIS WebSocket: 41-Stock Limit Per Session
### Market Hours Only
### Naver 종목토론방 Scraping Risk

**Legal posture (정정 요약).** 본 프로젝트의 보수적 운영 근거는 형사 처벌 회피가 아니라 **민사 DB제작자 권리 침해 (대법원 2017다224395) 회피** 이다. 대법원 2021도1533 (형사) 은 무죄 확정이며 ToS 위반만으로 형사 책임은 성립하지 않는다. 단, 민사 DB권 침해는 "전체의 상당한 부분" 복제 / 반복적 체계적 수집 / 원본 서비스의 시장가치 잠식 시 인정될 수 있다.

**Operational 5 rules — 모든 한국 크롤링 (Naver 종목토론방 포함) 에 적용.**

1. **일 1~2회 배치 캡.** 장중 실시간 폴링 금지. 배치 잡 (Cloud Run Job + Scheduler) 만 허용. 사용자 트래픽에 비례하는 호출량은 "체계적 수집" 으로 해석될 위험이 있으므로 사용자 수와 분리된 고정 배치만 사용.

2. **24h 캐싱 + 콘텐츠 해시 변경 감지 시에만 갱신.** Supabase 에 fetch 결과를 저장하고 24시간 TTL. 재방문 시 원본 페이지의 콘텐츠 해시 (또는 last-modified, etag) 가 바뀐 경우에만 갱신 호출. 동일 콘텐츠 재크롤링은 비용 / 법적 양면에서 순손실.

3. **사용자 클릭 시 on-demand fetch 금지.** 종목 상세 페이지 진입이 백엔드 원본 fetch 를 트리거하면 안 됨. 서버측 배치가 미리 채워둔 캐시만 읽음. 사용자 수가 N 일 때 호출량이 O(N) 이 되는 패턴 전면 금지. (= "서버측 배치만, on-demand 금지" 원칙)

4. **HTTP 429 / 403 감지 시 즉시 24h backoff.** 429 (rate-limit) 또는 403 (access denied) 응답이 한 번이라도 관측되면 해당 source 전체에 대해 24시간 동안 새 호출을 차단하고 알림을 띄움. 자동 재시도 / 지수 backoff 으로 두드리지 않음 — 차단 신호는 명시 차단으로 해석.

5. **출처 표기 + 부분 캐싱 (전체 DB 덤프 보관 금지).** 캐시 / 요약 / 표시에 원본 URL + 출처명을 항상 함께 노출. DB 에는 표시·요약에 필요한 최소 필드만 저장 (전체 본문·전체 게시판 덤프 불가). 핵심 가치는 "AI 요약 + 컨텍스트" 이지 "원본 데이터의 재배포" 가 아님 — 민사 DB권 침해의 핵심 요건인 "상당한 부분 복제" 를 구조적으로 회피.

> 이 5원칙은 Naver 종목토론방뿐 아니라 Naver Search API · 향후 추가될 다른 한국 데이터 소스에도 동일 적용. 새로운 source 추가 시 본 5원칙을 만족하는 운영 설계를 먼저 점검할 것.

### Naver Search API Rate Limit
## Installation Reference
# Frontend (Next.js)
# shadcn/ui
# Backend dependencies
# Dev dependencies
# AI
# Supabase client
## Sources
- KIS OpenAPI official repo: https://github.com/koreainvestment/open-trading-api
- KIS developer portal: https://apiportal.koreainvestment.com/apiservice
- KIS WebSocket 41-stock limit: https://hky035.github.io/web/refact-kis-websocket/
- KIS REST rate limit (20/sec): https://tgparkk.github.io/robotrader/2025/10/09/robotrader-1-70stocks-problem.html
- pykrx PyPI (v1.2.4, Feb 2026): https://pypi.org/project/pykrx/
- KRX OpenAPI services: https://openapi.krx.co.kr/contents/OPP/INFO/service/OPPINFO004.cmd
- Naver Search API (25,000/day limit): https://velog.io/@dev_hyjang/네이버-검색-API-활용한-뉴스-크롤링10분-컷
- Naver OpenAPI list: https://naver.github.io/naver-openapi-guide/apilist.html
- naverfinance discussion crawler: https://github.com/LMMYH/naverfinance_opinion_crawler
- Claude API pricing (Haiku 4.5 $1/$5): https://platform.claude.com/docs/en/about-claude/pricing
- SSE vs WebSocket for stock tickers: https://ably.com/blog/websockets-vs-sse
- BullMQ + Express pattern: https://www.thisdot.co/blog/bullmq-with-expressjs
- Supabase realtime + Next.js 15: https://dev.to/lra8dev/building-real-time-magic-supabase-subscriptions-in-nextjs-15-2kmp
- Korean scraping legal ruling (2022): https://file.scourt.go.kr/dcboard/1727143941701_111221.pdf
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
