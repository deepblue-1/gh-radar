# 기술 스택 · 데이터 소스 참조

출처: CLAUDE.md 「Technology Stack」 블록에서 2026-10-11 이관(quick-261011-j87). 원 리서치는 `.planning/research/STACK.md`(2026-04-10). 운영 수치의 정본은 CLAUDE.md 「데이터 소스 운영 기준」과 코드다 — 이 문서는 선정 근거·판례·설치·출처 참조용.

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
- **Architecture decision:** Scrape on-demand (when user views a stock) rather than bulk-polling all stocks. Trigger scrape → cache result in Supabase for 5–10 minutes → serve from cache. — **(폐기, 2026-06-08 quick-260608-g0k)** 현행은 CLAUDE.md 스크래핑 5원칙 2 「24h 캐싱」과 3 「사용자 클릭 시 on-demand fetch 금지」가 대체한다.
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
A 한국투자증권 account is required (paper trading / 모의투자 is sufficient). Paper accounts have lower REST API call limits than live accounts. For production, a live account is recommended for higher throughput.
### KIS WebSocket: 41-Stock Limit Per Session
One WebSocket session subscribes to at most 41 stocks. The 상한가 근접 스캔 feature shows N stocks; if N > 41, you need multiple sessions. Architecture should support session pooling from the start.
### Market Hours Only
KIS real-time APIs only provide live data during trading hours (09:00–15:30 KST). The polling/scanning job should only run during market hours; implement a market-hours guard using Korean timezone (Asia/Seoul). *(2026-04 리서치 시점 기준. 현행 운영은 NXT 포함 평일 08:00~20:00 KST 를 장 시간으로 본다.)*
### Naver 종목토론방 Scraping Risk

**Legal posture (정정 요약).** 본 프로젝트의 보수적 운영 근거는 형사 처벌 회피가 아니라 **민사 DB제작자 권리 침해 (대법원 2017다224395) 회피** 이다. 대법원 2021도1533 (형사) 은 무죄 확정이며 ToS 위반만으로 형사 책임은 성립하지 않는다. 단, 민사 DB권 침해는 "전체의 상당한 부분" 복제 / 반복적 체계적 수집 / 원본 서비스의 시장가치 잠식 시 인정될 수 있다.

- Korean Supreme Court 2022. 5. 12. 선고 2021도1533 (여기어때 v. 야놀자, criminal) acquitted scraping under 정보통신망법, 컴퓨터등장애업무방해, 저작권법 — criminal liability from ToS violation alone is **not** established when no explicit access protection (auth) is bypassed and copying is not of a "substantial part" of the DB.
- However, 대법원 2017다224395 (잡코리아 v. 사람인, civil) **did** uphold DB-producer rights infringement and ordered substantial damages — the real, live risk for Naver scraping is **civil**, not criminal. Keep scraping minimal, cached, attributed, and avoid full-DB equivalence to stay outside the civil DB-right zone.

운영 5원칙 본문(정본)은 CLAUDE.md 「스크래핑 source 운영 5원칙」. 이 절은 판례 근거만 둔다.

## Installation Reference

```bash
# Frontend (Next.js)
npx create-next-app@latest --typescript --tailwind --app

# shadcn/ui
npx shadcn@latest init

# Backend dependencies
npm install express bullmq ioredis node-cron axios cheerio

# Dev dependencies
npm install -D typescript @types/express @types/node tsx

# AI
npm install @anthropic-ai/sdk

# Supabase client
npm install @supabase/supabase-js
```

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
- Naver OpenAPI 공식 오류 코드 (429 = 일 허용량 초과): https://developers.naver.com/docs/common/openapiguide/errorcode.md
