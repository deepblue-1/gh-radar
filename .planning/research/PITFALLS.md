# Domain Pitfalls: Korean Stock Market Screening & News Summarization App

**Domain:** Real-time Korean stock market data + AI summarization web app
**Researched:** 2026-04-10
**Sources:** KIS OpenAPI developer docs, pykrx GitHub issues, Korean legal crawling precedents, Cloud Run docs, Supabase docs, financial LLM hallucination research

---

## Critical Pitfalls

Mistakes that cause rewrites, legal risk, or service outages.

---

### Pitfall 1: KIS WebSocket Hard Subscription Limit (41 symbols per session)

**What goes wrong:** The Korea Investment & Securities (한국투자증권) WebSocket API enforces a hard limit of **41 stock subscriptions per authenticated session**. If the app subscribes to more than 41 symbols for real-time price tracking (상한가 근접 스캔), additional subscriptions silently fail or drop — no error is thrown to the client.

**Why it happens:** Each WebSocket approval key (접속키) is tied to a single developer center account. The 41-symbol cap is enforced server-side per session/account. This is not prominently documented in the official portal.

**Consequences:** Real-time scanning across KOSPI + KOSDAQ candidates (potentially hundreds of symbols) is impossible with a single session. The app shows stale or missing data for symbols beyond slot 41.

**Prevention:**
- Architect a multi-session / multi-account connection pool from day one. Use a `SubscriptionManager` that distributes symbols across sessions in round-robin fashion.
- Deduplicate upstream subscriptions: if two users watch the same symbol, maintain only one upstream subscription and fan out to both.
- Alternatively, use 1-minute polling via REST for the broad scan (get top movers by % change across all stocks) and only upgrade specific user-selected symbols to WebSocket.

**Detection:** Test with > 41 symbol subscriptions in development. Monitor gap between subscribed count and received tick count.

**Phase:** Data layer / backend foundation phase.

---

### Pitfall 2: KIS REST API Rate Limit — Sliding Window vs. Token Bucket Mismatch

**What goes wrong:** The KIS REST API allows **20 calls per second**, but uses a sliding window algorithm server-side. Most rate-limiter libraries (e.g., Guava `RateLimiter`) use a token bucket algorithm. Burst requests at window boundaries can violate the sliding window even when the token bucket reports capacity available, triggering `EGW00201` errors.

**Why it happens:** Token bucket releases permits in a burst at the start of each second. Sliding window smooths more strictly. At N stocks × 2 API calls each (current price + minute data), the burst multiplier kills compliance:
- 70 stocks × 2 = 140 calls in ~0.8 seconds = **875% over limit**

**Consequences:** Service degradation (`EGW00201`), temporary API bans. Hard-coded batch sizes that work for 10 stocks fail catastrophically at 50+.

**Prevention:**
- Implement a dynamic batch calculator: batch_size and delay are computed based on total stock count, not hardcoded.
- Target **15 permits/second** (not 20) to leave a safety buffer for window boundary effects.
- Always implement retry logic with exponential backoff even after applying throttling — boundary violations still occur occasionally.
- Fetch the access token **once before** the scan loop, not inside it. Repeated `getAccessToken()` calls inside a loop multiplied Redis pressure 2,742x in one documented case.

**Detection:** Monitor for `EGW00201` error codes. Test with 50+ and 100+ stock lists in staging.

**Phase:** Data polling / scan engine phase.

---

### Pitfall 3: pykrx / KRX Data Marketplace Scraping is Now Blocked

**What goes wrong:** As of **December 27, 2024**, KRX converted its public data portal to "KRX Data Marketplace" which now requires mandatory login. The `pykrx` library (widely used Python library that scraped the old portal) is broken for stock listing and historical data. KRX explicitly stated they will **permanently block IPs** that continue scraping with pykrx, with no unblock path.

**Why it happens:** KRX changed architecture to require session authentication. The unofficial library used unauthenticated HTTP scraping and now hits login walls or 403 responses.

**Consequences:** Any plan to use pykrx for getting the full stock list (전종목 리스트) or historical OHLCV fails silently or throws errors. Apps depending on it at runtime break without warning.

**Prevention:**
- Do **not** use pykrx as a runtime dependency for production data.
- Use the **official KRX Open API** at `openapi.krx.co.kr` (requires registration, provides proper API keys).
- For current-price scanning, rely on KIS OpenAPI — it covers KOSPI/KOSDAQ real-time data authoritatively.
- For full stock universe list, fetch once per day from KRX Open API or KIS and cache in Supabase.

**Detection:** `pykrx` call returns HTTP 401/403 or empty results. GitHub issue [#244](https://github.com/sharebook-kr/pykrx/issues/244) and [#276](https://github.com/sharebook-kr/pykrx/issues/276) document this.

**Phase:** Data sourcing / architecture decision — resolve before any code is written.

---

### Pitfall 4: Naver Finance / 종목토론방 Scraping — Legal and Technical Risk

**What goes wrong:** Naver's Terms of Service explicitly prohibit commercial scraping. Korean courts have ruled (대법원 2022년 판결) that violating a platform's ToS via scraping can constitute a violation of the Computer Network Act (정보통신망법), potentially carrying criminal liability, especially if the data is used commercially or at scale.

**Why it happens:** 종목토론방 and Naver Finance news have no official API. Developers default to HTML scraping. Naver actively blocks datacenter IPs, uses JavaScript rendering, behavioral analysis (scroll timing, cursor movement, session aging), and CAPTCHA.

**Consequences:**
- Legal: Cease-and-desist risk, criminal referral under 정보통신망법 if scraping violates ToS at commercial scale.
- Technical: IP blocks within hours from Cloud Run IP ranges (datacenter IPs blocked aggressively). Playwright/Puppeteer overhead makes 1-minute polling loops impractical.

**Prevention:**
- Check Naver Finance's `robots.txt` and ToS before launch. As of research date, robots.txt disallows automated crawlers on finance paths.
- Pursue **Naver Search API** (네이버 검색 API — 뉴스 검색) as an official alternative for news. Rate limit is 25,000 calls/day on the free tier — sufficient for this use case.
- For 종목토론방: no official API exists. Options in priority order: (1) use Naver Search API + keyword search as proxy; (2) use very low-frequency scraping (5+ minute intervals, single stock on-demand) with residential proxy; (3) scope this feature to only activate on explicit user request, not in background polling.
- Never run scraping from Cloud Run directly without proxy rotation — datacenter IPs are immediately flagged.

**Detection:** Requests return 200 with CAPTCHA page body (not real content). Or 403/429 from Naver's CDN layer.

**Phase:** Feature scoping / legal review — before building the 종목토론방 feature.

---

### Pitfall 5: Claude API Cost Explosion on Unbounded Summarization

**What goes wrong:** News articles and 토론방 threads are long. Without token budgets, a single summarization call can easily consume 8,000–15,000 input tokens. At Claude Haiku pricing ($1/M input, $5/M output), this is cheap per call — but if triggered on every news item for every user page load, costs compound fast. At scale, or with Sonnet/Opus, costs multiply 5–20x.

**Why it happens:** Developers pass raw HTML or full article text to the LLM without preprocessing. No caching of summaries. Summarization triggered on every request rather than cached by content hash.

**Consequences:** Monthly AI API bill grows unpredictably. A spike in users (viral stock movement) causes a cost spike in AI calls simultaneously.

**Prevention:**
- **Cache summaries by content hash**: store `(article_url_hash + scraped_content_hash) → summary` in Supabase. TTL: 1 hour for news, 30 min for 토론방.
- **Truncate inputs aggressively**: strip HTML, limit to first 2,000–3,000 tokens of article text before sending to Claude. Most useful signal is in the first third of financial news articles.
- **Use Claude Haiku for summarization** (not Sonnet/Opus). Haiku quality is sufficient for extraction/summarization tasks.
- **Set `max_tokens` on output**: summaries should be 150–250 tokens. Without this, the model may produce verbose output multiplying output token cost.
- **Summarize on-demand (user click) not on-crawl**: don't pre-summarize all news; summarize when a user expands a stock's news section.
- Set hard monthly budget alerts via Anthropic usage API.

**Detection:** Monitor `/v1/usage` endpoint. Alert when daily token consumption exceeds threshold. Log input token count per request.

**Phase:** AI integration phase — budget controls must be in place before any production traffic.

---

## Moderate Pitfalls

---

### Pitfall 6: LLM Hallucination of Specific Financial Numbers

**What goes wrong:** When Claude summarizes financial news or 토론방 discussion, it may hallucinate specific numbers — fabricating stock prices, percentages, earnings figures, or dates that are not in the source text. In a trading context, this is high-stakes: a trader acting on a hallucinated "EPS beat of 30%" is materially misled.

**Why it happens:** Financial text is dense with numbers. LLMs under compression pressure (long input → short summary) are known to substitute plausible-sounding numbers. Claude has no log-probability exposure for downstream verification.

**Prevention:**
- System prompt must include explicit instruction: "Only state numbers that appear verbatim in the source text. If uncertain about a specific figure, omit it rather than estimate."
- Format the output as a structured bullet list, not a narrative paragraph — this forces the model to be specific and attributable, reducing confabulation.
- Display disclaimer: "AI-generated summary. Verify figures before trading."
- Consider a post-processing step: extract all numbers from the summary and verify each appears in the source text (regex check).

**Detection:** QA review of 50 summaries manually — spot-check figures. User feedback mechanism ("this summary is wrong").

**Phase:** AI integration / QA phase.

---

### Pitfall 7: Korean Encoding in Data Pipeline (EUC-KR / CP949)

**What goes wrong:** KRX public data exports, some legacy API responses, and many Korean financial news sources still use EUC-KR or CP949 encoding instead of UTF-8. Node.js/TypeScript has no native EUC-KR decoding support. Attempting to parse as UTF-8 produces mojibake silently — stock names like "삼성전자" become unreadable garbage.

**Why it happens:** Korean financial infrastructure has legacy systems dating to the 1990s. CP949 is a Microsoft extension of EUC-KR used widely in Korean Windows environments. Public data portals (공공데이터포털) export CSVs in CP949 by default.

**Consequences:** Silent data corruption. Stock names and sector names stored garbled in DB. Downstream search and display broken.

**Prevention:**
- Always detect encoding before parsing. For Node.js: use the `iconv-lite` or `iconv` package to decode CP949/EUC-KR byte buffers to UTF-8 strings before any processing.
- When fetching KRX CSV exports: `iconv.decode(buffer, 'cp949')`.
- For Python scrapers: `response.encoding = 'cp949'` before `response.text`.
- Normalize and store everything as UTF-8 in Supabase.

**Detection:** Non-ASCII garbage in stock name fields after initial fetch. Unit test: fetch 삼성전자 (005930) and assert the name field contains the correct Korean string.

**Phase:** Data ingestion layer — build encoding normalization before storing any data.

---

### Pitfall 8: Cloud Run Cold Starts Break Polling Continuity

**What goes wrong:** Cloud Run scales to zero when there is no traffic. When the first request arrives after a cold period, startup latency is 2–5 seconds for a Node.js/TypeScript container. If the backend is responsible for polling KIS API every 60 seconds, a cold start mid-cycle causes a missed poll cycle or a poll that returns before the KIS auth token has been initialized.

**Why it happens:** Cloud Run's default behavior is scale-to-zero. The polling scheduler (setInterval or cron) resets on each instance start. If the instance was killed, the 60-second clock resets.

**Consequences:** Data gaps in real-time scan results during market hours. Users see stale data after low-traffic periods. Auth token not initialized → first scan cycle throws errors.

**Prevention:**
- Set `--min-instances=1` on the Cloud Run backend service to prevent scale-to-zero. Cost impact: ~$10–20/month for 1 always-on instance in `us-central1` (acceptable given the use case).
- Implement KIS access token as a module-level singleton with lazy initialization + auto-refresh before expiry (tokens expire every 24 hours).
- Alternatively, move the polling responsibility to a Cloud Scheduler → Cloud Run Job (separate from the HTTP server) to decouple polling lifecycle from request traffic.

**Detection:** Monitor polling heartbeat timestamps in Supabase. Alert if last_polled_at is > 90 seconds ago during market hours.

**Phase:** Infrastructure / deployment phase.

---

### Pitfall 9: Supabase Realtime Requires RLS to Be Configured Correctly

**What goes wrong:** Enabling Supabase Realtime on a table (e.g., `stock_prices`) requires Row Level Security (RLS) to be enabled on that table. However, enabling RLS without adding explicit policies silently blocks all data access — including legitimate reads from the frontend. The SQL Editor runs as postgres superuser and bypasses RLS, so development tests pass while production breaks.

**Why it happens:** This is a Supabase architectural requirement that is not prominently surfaced in the Realtime quick-start docs. RLS defaults to deny-all when enabled.

**Consequences:** Frontend shows no real-time updates. No error message — the subscription just receives no events. Developers waste hours debugging WebSocket connections while the issue is an RLS policy gap.

**Prevention:**
- For v1 (no auth): add a permissive read policy `CREATE POLICY "public_read" ON stock_prices FOR SELECT USING (true)` immediately after enabling RLS.
- Test Realtime subscriptions from the Supabase JS client (not the SQL Editor) in development.
- Always verify the subscription receives at least one event during development by manually inserting a test row.

**Detection:** Realtime subscription fires `subscribed` event but never fires `INSERT`/`UPDATE` events despite DB writes happening.

**Phase:** Database / infrastructure phase.

---

### Pitfall 10: 상한가 Threshold Logic — KONEX vs KOSPI/KOSDAQ Difference

**What goes wrong:** The app scans for stocks near the upper limit (상한가). The limit is ±30% for KOSPI and KOSDAQ, but only ±15% for KONEX (코넥스). If the stock universe includes KONEX stocks and the threshold logic hardcodes 30%, a KONEX stock that is at its actual limit (15%) will not be flagged — or worse, will appear to be at only 50% of limit when it is at 100%.

**Why it happens:** Most developers know the standard 30% rule and overlook KONEX. KIS API returns market type in the response data, but it requires checking the `mrkt_cls_code` field.

**Consequences:** KONEX stocks at 상한가 not surfaced in scan results. Potential false positives if KONEX stocks are included in scans designed around 30%.

**Prevention:**
- Filter KONEX from the initial stock universe (v1 can reasonably exclude KONEX — it is illiquid and irrelevant to most retail traders).
- If KONEX is included: store market type per symbol in the DB and apply per-stock threshold in scan logic.
- Additionally, account for the **Volatility Interruption (VI)** system: stocks triggering VI (10% deviation from reference price) enter a 2-minute single-price matching period and price moves pause — the app should not interpret this as a scan candidate without context.

**Detection:** Query KIS for any KONEX stock and compare the percent-from-limit calculation against the actual limit price returned by the API.

**Phase:** Scan engine feature implementation phase.

---

## Minor Pitfalls

---

### Pitfall 11: KIS Access Token Issued Too Frequently Gets Restricted

**What goes wrong:** KIS restricts accounts that issue access tokens too frequently. Issuing a new token on every server restart or every API call causes the account to be flagged and eventually banned.

**Prevention:** Cache the access token (valid for 24 hours) in a persistent store (Supabase or Redis). Check validity before issuing a new one. On Cloud Run: use module-level singleton, not a stateless function.

**Phase:** Backend initialization / auth layer.

---

### Pitfall 12: Market Hours Edge Cases

**What goes wrong:** Korean market hours are 09:00–15:30 KST. Pre-market (동시호가) runs 08:00–09:00. After-hours data exists but prices are not final. Polling outside market hours returns stale last-close prices which are meaningless for 상한가 scanning.

**Prevention:**
- Implement market hours guard: polling scan only runs 09:00–15:35 KST.
- Display "장 마감" state in UI outside market hours.
- Use Korea Standard Time (UTC+9) explicitly — do not rely on server timezone (Cloud Run defaults to UTC).
- Handle holidays: KRX publishes annual holiday calendar via their Open API. Fetch and cache this list.

**Phase:** Scan engine / UI phase.

---

### Pitfall 13: Naver News API Returns Titles with HTML Entities

**What goes wrong:** Naver Search API (뉴스) returns article titles and descriptions with HTML entities (`&amp;`, `&lt;`, `&quot;`) and sometimes embedded `<b>` tags for search term highlighting. Passing raw API responses directly to Claude or displaying in UI causes garbled text.

**Prevention:** Strip HTML tags and decode HTML entities before storing or sending to Claude. Use a library (`he` in Node.js) rather than regex — regex-based HTML stripping is notoriously fragile.

**Phase:** News ingestion pipeline phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Data source selection | pykrx is broken (KRX login required) | Use KIS OpenAPI + official KRX Open API only |
| Real-time scan architecture | KIS WebSocket 41-symbol limit | Multi-session pool or REST polling for broad scan |
| KIS REST polling | Sliding window rate limit bursts | Dynamic batch calculator, 15 req/s target, retry logic |
| 종목토론방 feature | Naver blocking + legal ToS risk | Naver Search API proxy or on-demand only, not background polling |
| AI summarization | Cost explosion without caching | Cache by content hash, truncate inputs, use Haiku, set max_tokens |
| AI summarization | Hallucinated financial numbers | System prompt constraints, structured output, source verification |
| Data encoding | EUC-KR/CP949 from KRX exports | iconv-lite decode before any string processing |
| Infrastructure | Cloud Run scale-to-zero breaks polling | --min-instances=1, token singleton, polling as separate job |
| Database realtime | Supabase RLS blocks events silently | Add permissive read policy before enabling realtime |
| Scan threshold logic | KONEX 15% limit vs KOSPI/KOSDAQ 30% | Exclude KONEX in v1, or store market type per symbol |
| Market hours | Polling in off-hours returns stale data | KST market hours guard, holiday calendar integration |
| KIS auth | Token issued too frequently = banned | 24-hour cached token singleton |

---

## Sources

- [KIS OpenAPI Throttling Deep Dive (hky035)](https://hky035.github.io/web/kis-api-throttling/) — HIGH confidence
- [KIS WebSocket Multi-Account Solution (hky035)](https://hky035.github.io/web/refact-kis-websocket/) — HIGH confidence
- [KIS 70-Stock Rate Limit Problem (tgparkk)](https://tgparkk.github.io/robotrader/2025/10/09/robotrader-1-70stocks-problem.html) — HIGH confidence
- [pykrx GitHub Issue #244 — KRX Login Required](https://github.com/sharebook-kr/pykrx/issues/244) — HIGH confidence
- [pykrx GitHub Issue #276 — Service Outage](https://github.com/sharebook-kr/pykrx/issues/276) — HIGH confidence
- [KRX Open API Official Portal](https://openapi.krx.co.kr/) — HIGH confidence
- [Naver Scraping Anti-Bot (scrapfly.io)](https://scrapfly.io/blog/posts/how-to-scrape-naver) — MEDIUM confidence
- [Korean Crawling Law Analysis (Shin & Kim)](https://www.shinkim.com/kor/media/newsletter/1843) — HIGH confidence
- [Korean Crawling Legal Standards (Mondaq)](https://www.mondaq.com/copyright/1266554/) — HIGH confidence
- [Cloud Run WebSockets Official Docs](https://docs.cloud.google.com/run/docs/triggering/websockets) — HIGH confidence
- [Cloud Run Min Instances Docs](https://docs.cloud.google.com/run/docs/configuring/min-instances) — HIGH confidence
- [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — HIGH confidence
- [Why Supabase Realtime Was Replaced (Medium)](https://medium.com/@khushidiwan953/why-i-ditched-supabases-realtime-and-built-my-own-a6fc20c542d4) — MEDIUM confidence
- [LLM Hallucination in Financial Multi-Doc Summarization (NAACL 2025)](https://aclanthology.org/2025.findings-naacl.293.pdf) — HIGH confidence
- [Korean Price Limits — 가격제한폭 (Namuwiki)](https://namu.wiki/w/%EA%B0%80%EA%B2%A9%EC%A0%9C%ED%95%9C%ED%8F%AD) — MEDIUM confidence
- [FinanceData FAQ — 한글 인코딩](https://financedata.github.io/posts/faq_crawling_data_encoding.html) — HIGH confidence
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing) — HIGH confidence
