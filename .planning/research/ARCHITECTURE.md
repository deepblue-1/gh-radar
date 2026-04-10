# Architecture Patterns

**Domain:** Korean stock screener + AI news summarization web app
**Researched:** 2026-04-10

---

## Recommended Architecture

Three distinct runtime processes, each with a clear ownership boundary:

```
┌─────────────────────────────────────────────────────────────┐
│                      Supabase (Postgres)                    │
│  stocks | candles | news_articles | summaries | discussions │
└────────────────────┬────────────────────────────────────────┘
                     │  read/write                  ▲ notify (Realtime)
                     ▼                              │
┌────────────────────────────────┐    ┌─────────────────────────────┐
│   Ingestion Worker             │    │   Express API (Cloud Run)   │
│   (Cloud Run Job, cron/loop)   │    │   - /api/screener           │
│                                │    │   - /api/stock/:code/news   │
│   1. KIS OpenAPI poller        │    │   - /api/stock/:code/discussions│
│      (REST, 1-min interval)    │    │   - /api/summarize (trigger)│
│   2. News scraper              │    │                             │
│      (Naver Finance / 한경)    │    │   Claude API calls here     │
│   3. Discussion scraper        │    │   with DB-level dedup       │
│      (Naver 종목토론방)         │    └──────────────┬──────────────┘
│                                │                   │ HTTP
└────────────────────────────────┘                   ▼
                                       ┌─────────────────────────┐
                                       │   Next.js (Vercel)      │
                                       │   - /   screener list   │
                                       │   - /stock/[code]       │
                                       │     news + summary tab  │
                                       │     discussion tab      │
                                       │                         │
                                       │   Supabase Realtime     │
                                       │   subscription for live │
                                       │   screener updates      │
                                       └─────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Ingestion Worker** | Fetch raw stock prices from KIS API; scrape news and Naver discussions; write to Supabase | Supabase (write-only from this component) |
| **Express API** | Serve screener results, trigger AI summarization on demand, return cached summaries | Supabase (read + write summaries), Claude API, Next.js frontend |
| **Next.js Frontend** | Render screener UI, stock detail page, receive live updates | Express API (REST), Supabase Realtime (websocket) |
| **Supabase** | Source of truth for all data; Realtime channel for push to frontend | All components |

### Boundary Rule
The ingestion worker MUST NOT call the Claude API directly. AI summarization is expensive and should only happen on-demand (user requests a stock detail page), not during bulk ingestion. The Express API owns all Claude API interactions.

---

## Data Flow

### Flow 1: Stock Price Screener (primary path)

```
KIS REST API (every 1 min)
  → Ingestion Worker fetches top movers / all tickers
  → writes to stocks table (code, name, rate, price, volume, updated_at)
  → Supabase Realtime broadcasts postgres_changes to frontend
  → Next.js screener list auto-updates (no page refresh)
```

**Why 1-min polling not WebSocket:** KIS WebSocket allows max 41 subscriptions per session. Screening hundreds of tickers requires REST bulk endpoints. 1-min REST polling is the standard approach used by the community.

**KIS rate limits:** 20 req/sec (sliding window). Use a token-bucket / leaky-bucket with a safe 15 req/sec ceiling. Error code `EGW00201` = rate exceeded; implement exponential retry. Re-use the access token across all calls (daily issuance limit).

### Flow 2: News & Discussion Ingestion

```
Naver Finance news endpoint (per ticker, every 5 min)
  → Ingestion Worker scrapes title, url, published_at, content_snippet
  → dedup by url (unique constraint on news_articles.url)
  → writes to news_articles table

Naver 종목토론방 (per ticker, every 5 min)
  → scrapes recent posts (title, content, upvotes, date)
  → dedup by (stock_code, post_id)
  → writes to discussions table
```

Naver Finance does not provide an official RSS/API for the discussion board; BeautifulSoup-style HTML scraping is the standard approach used in open-source projects. Respect `robots.txt`. Identify with a user-agent header. Rate-limit scraper to ~1 req/sec per domain.

### Flow 3: AI Summarization (on-demand, cached)

```
User opens /stock/[code]
  → Next.js calls Express GET /api/stock/:code/news
  → API checks summaries table for (stock_code, type='news', content_hash)
  → cache HIT  → return stored summary immediately
  → cache MISS → fetch latest news_articles for this code
              → compute content_hash of concatenated articles
              → call Claude API (claude-3-5-haiku for cost, or sonnet for quality)
              → store result in summaries (stock_code, type, content_hash, summary_text, created_at)
              → return summary
```

**Cache key:** `SHA256(sorted article URLs + published_at)`. If no new articles since last summary, return cached result without calling Claude.

**TTL policy:** Summaries older than 1 hour are considered stale — re-check content_hash before serving. If hash unchanged, extend TTL without a new Claude call.

**Cost optimization:**
- Use `claude-3-5-haiku` for discussion summarization (high volume, lower quality bar)
- Use `claude-3-5-sonnet` only for news summarization (user-visible, quality matters)
- Claude prompt caching: place static instructions in the system prompt with `cache_control: ephemeral` to get 10% token cost on repeated calls
- Batch non-urgent summaries via Message Batches API (50% discount) for pre-warming popular stocks

---

## Data Schema (logical)

```sql
-- Core price data
stocks (
  code TEXT PRIMARY KEY,         -- e.g. '005930' (삼성전자)
  name TEXT,
  market TEXT,                   -- 'KOSPI' | 'KOSDAQ'
  price INTEGER,
  change_rate NUMERIC(5,2),      -- e.g. 28.5 (%)
  volume BIGINT,
  updated_at TIMESTAMPTZ
)

-- Raw news
news_articles (
  id UUID PRIMARY KEY,
  stock_code TEXT REFERENCES stocks(code),
  title TEXT,
  url TEXT UNIQUE,
  source TEXT,                   -- 'naver_finance' | 'hankyung'
  published_at TIMESTAMPTZ,
  content_snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Raw discussion posts
discussions (
  id UUID PRIMARY KEY,
  stock_code TEXT REFERENCES stocks(code),
  post_id TEXT,                  -- Naver internal post ID
  title TEXT,
  content TEXT,
  upvotes INTEGER,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_code, post_id)
)

-- AI summary cache
summaries (
  id UUID PRIMARY KEY,
  stock_code TEXT REFERENCES stocks(code),
  type TEXT,                     -- 'news' | 'discussion'
  content_hash TEXT,             -- SHA256 of source content
  summary_text TEXT,
  model TEXT,                    -- which Claude model was used
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stock_code, type, content_hash)
)
```

---

## Caching Strategy

| Layer | What | TTL | Mechanism |
|-------|------|-----|-----------|
| Supabase `summaries` table | Claude API output | Hash-based (no TTL, serves until content changes) | content_hash dedup |
| Express in-memory | KIS access token | 23 hours (token lasts 24h) | module-level variable |
| Express response | Screener list | 30 sec | `Cache-Control: max-age=30` |
| Supabase Realtime | Stock price push | N/A (event-driven) | postgres_changes trigger |
| Claude prompt cache | System prompt tokens | 5 min (Sonnet) / 1 hr (Haiku) | cache_control: ephemeral |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Calling Claude During Ingestion
**What:** Summarize every article as it is scraped
**Why bad:** Ingestion runs every minute on many tickers. Most users never view most stocks. This wastes ~95% of Claude API spend on unseen summaries.
**Instead:** Summarize on-demand when a user opens a stock detail page. Cache result immediately.

### Anti-Pattern 2: Per-Request KIS API Calls from the Frontend
**What:** Next.js server actions call KIS API directly for each user
**Why bad:** KIS tokens have daily issuance limits and rate limits. Multiple Vercel serverless instances cannot share token state.
**Instead:** Only the Ingestion Worker holds a KIS session. All frontends read from Supabase.

### Anti-Pattern 3: Polling Supabase from Frontend on a Timer
**What:** `setInterval(() => fetch('/api/screener'), 1000)` in the browser
**Why bad:** Creates N×clients HTTP load; Vercel cold starts; no push semantics.
**Instead:** Use Supabase Realtime `postgres_changes` subscription on the `stocks` table. Ingestion Worker update triggers immediate push to all connected clients.

### Anti-Pattern 4: No Rate Limit Handling for KIS API
**What:** Call KIS REST API without throttling
**Why bad:** KIS uses sliding-window rate limiting at 20 req/sec. Bursts across the window boundary cause `EGW00201` errors that silently skip data.
**Instead:** Implement token-bucket at 15 req/sec with retry on `EGW00201`.

---

## Suggested Build Order

Dependencies determine sequence:

```
Phase 1: Foundation (data layer)
  └── Supabase schema (stocks, news_articles, discussions, summaries)
  └── KIS API client module with token management + rate limiting
  └── Ingestion Worker: stock price polling → DB

Phase 2: Backend API
  └── Express app scaffold on Cloud Run
  └── GET /api/screener (reads stocks table, filter by change_rate)
  └── GET /api/stock/:code (reads stocks + metadata)

Phase 3: Frontend Shell
  └── Next.js app with Tailwind + shadcn/ui
  └── Screener list page (polls Express API initially)
  └── Stock detail page stub

Phase 4: Real-time
  └── Supabase Realtime subscription in Next.js screener
  └── Auto-refresh without polling

Phase 5: News & Discussions
  └── Ingestion Worker: news scraper + discussion scraper
  └── Express: GET /api/stock/:code/news and /discussions endpoints
  └── Frontend: news tab + discussion tab on stock detail page

Phase 6: AI Summarization
  └── Claude API integration in Express
  └── Summary cache logic (content_hash dedup)
  └── Frontend: summary display with loading state

Phase 7: UX Polish
  └── Change rate threshold slider (user-adjustable, default 25%)
  └── Stock search
  └── Mobile-responsive layout
```

Each phase produces a working, deployable slice. Phase 1-2 can be developed before the frontend exists. Phase 6 is the most expensive to iterate; leaving it last avoids burning Claude API budget on UI experiments.

---

## Scalability Considerations

| Concern | At launch (~10 users) | At 1K concurrent users |
|---------|----------------------|------------------------|
| Stock data freshness | 1-min polling is fine | Same — ingestion is decoupled from user count |
| Supabase Realtime | Works up to ~200 concurrent connections on free tier | Upgrade to Pro tier ($25/mo) for 500 connections |
| Claude API cost | On-demand, low volume | Implement queue + dedup; popular stocks pre-warmed |
| KIS API | Single worker, 15 req/sec ceiling | Rate limit is per-account; single worker saturates at ~900 tickers/min |
| Scraping Naver | 1 req/sec is safe | Add IP rotation only if blocked; unlikely at this scale |

---

## Sources

- [KIS OpenAPI throttling analysis (Korean)](https://hky035.github.io/web/kis-api-throttling/) — HIGH confidence (measured production behavior)
- [KIS WebSocket 41-subscription limit](https://hky035.github.io/web/refact-kis-websocket/) — HIGH confidence
- [KIS OpenAPI rate limit: 20 req/sec, 초당 20건](https://tgparkk.github.io/robotrader/2025/10/09/robotrader-1-70stocks-problem.html) — HIGH confidence
- [Naver 종목토론방 crawlers (open source reference)](https://github.com/gadamer1/naver_finance_debate_crawler) — MEDIUM confidence (pattern is well-established, UI may change)
- [Supabase Realtime with Next.js 15](https://dev.to/lra8dev/building-real-time-magic-supabase-subscriptions-in-nextjs-15-2kmp) — HIGH confidence
- [Claude API prompt caching: 10% cost on cache hits](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) — HIGH confidence (official docs)
- [Claude API cost optimization patterns](https://dev.to/whoffagents/claude-api-cost-optimization-caching-batching-and-60-token-reduction-in-production-3n49) — MEDIUM confidence
- [Supabase background jobs pattern](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions) — MEDIUM confidence
