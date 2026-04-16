import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ScannerQuery } from "../schemas/scanner.js";
import {
  scannerRowToStock,
  type TopMoverRow,
} from "../mappers/scanner.js";
import type { StockMasterRow, StockQuoteRow } from "../mappers/stock.js";
import { ApiError } from "../errors.js";

const QUOTE_COLS =
  "code,price,change_amount,change_rate,volume,trade_amount,open,high,low,market_cap,upper_limit,lower_limit,updated_at";
const MASTER_COLS = "code,name,market"; // scanner 는 name/market 만 필요
const MOVER_COLS =
  "code,name,market,rank,ranked_at,scan_id,updated_at";

export const scannerRouter: RouterT = Router();

scannerRouter.get("/", async (req, res, next) => {
  try {
    const parsed = ScannerQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        `${issue.path.join(".")}: ${issue.message}`,
      );
    }
    const { market, minRate, sort, limit } = parsed.data;
    const supabase = req.app.locals.supabase as SupabaseClient;

    // 1. top_movers 후보 fetch (랭킹 + 표시 캐시)
    let moverQ = supabase.from("top_movers").select(MOVER_COLS);
    if (market !== "ALL") moverQ = moverQ.eq("market", market);
    const { data: movers, error: moErr } = await moverQ;
    if (moErr) throw moErr;
    const moverRows = (movers ?? []) as unknown as TopMoverRow[];

    if (moverRows.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.json([]);
      return;
    }

    // 2. stock_quotes IN (codes) — 시세
    const codes = moverRows.map((m) => m.code);
    const { data: quotes, error: qErr } = await supabase
      .from("stock_quotes")
      .select(QUOTE_COLS)
      .in("code", codes);
    if (qErr) throw qErr;
    const quoteByCode = new Map<string, StockQuoteRow>();
    for (const q of (quotes ?? []) as unknown as StockQuoteRow[]) {
      quoteByCode.set(q.code, q);
    }

    // 3. stocks (마스터) IN (codes) — name/market 캐노니컬 (top_movers 의 캐시보다 우선)
    const { data: masters, error: mErr } = await supabase
      .from("stocks")
      .select(MASTER_COLS)
      .in("code", codes);
    if (mErr) throw mErr;
    const masterByCode = new Map<string, StockMasterRow>();
    for (const m of (masters ?? []) as unknown as StockMasterRow[]) {
      masterByCode.set(m.code, m);
    }

    // 4. 평탄화 + 필터
    let merged = moverRows.map((mv) =>
      scannerRowToStock(
        mv,
        masterByCode.get(mv.code) ?? null,
        quoteByCode.get(mv.code) ?? null,
      ),
    );

    if (typeof minRate === "number") {
      merged = merged.filter((s) => s.changeRate >= minRate);
    }

    // 5. 정렬
    const sortMap = {
      rate_desc: (a: any, b: any) => b.changeRate - a.changeRate,
      rate_asc: (a: any, b: any) => a.changeRate - b.changeRate,
      volume_desc: (a: any, b: any) => b.volume - a.volume,
    } as const;
    merged.sort(sortMap[sort]);

    // 6. limit
    if (typeof limit === "number") merged = merged.slice(0, limit);

    // 7. X-Last-Updated-At — MAX(stock_quotes.updated_at) (SCAN-08 회귀)
    if (merged.length > 0) {
      const maxMs = Math.max(
        ...merged
          .map((s) => new Date(s.updatedAt).getTime())
          .filter(Number.isFinite),
      );
      if (Number.isFinite(maxMs) && maxMs > 0) {
        res.setHeader(
          "X-Last-Updated-At",
          new Date(maxMs).toISOString(),
        );
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(merged);
  } catch (e) {
    next(e);
  }
});
