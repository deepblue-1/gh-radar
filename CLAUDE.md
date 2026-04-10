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
- 대법원 2022. 5. 12. 선고 2021도1533 판결 established that violating terms of service during scraping can constitute criminal liability; keep scraping minimal and for personal/informational use
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
