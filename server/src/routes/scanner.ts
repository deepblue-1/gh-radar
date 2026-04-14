import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ScannerQuery } from "../schemas/scanner.js";
import { rowToStock, type StockRow } from "../mappers/stock.js";
import { ApiError } from "../errors.js";

export const COLS =
  "code,name,market,price,change_amount,change_rate,volume,trade_amount,open,high,low,market_cap,upper_limit,lower_limit,updated_at";

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

    let query = supabase.from("stocks").select(COLS);

    if (market !== "ALL") query = query.eq("market", market);
    if (typeof minRate === "number")
      query = query.gte("change_rate", minRate);

    const sortMap = {
      rate_desc: { col: "change_rate", asc: false },
      rate_asc: { col: "change_rate", asc: true },
      volume_desc: { col: "volume", asc: false },
    } as const;
    const s = sortMap[sort];
    query = query.order(s.col, { ascending: s.asc });

    if (typeof limit === "number") query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as StockRow[];

    // D-10/D-11: 응답에 포함된 stocks 의 MAX(updated_at) 을 ISO 8601 UTC 헤더로 노출.
    // 0건 또는 모든 updated_at 이 invalid 면 헤더 생략 (빈 문자열도 금지).
    if (rows.length > 0) {
      const maxMs = Math.max(
        ...rows.map((r) => new Date(r.updated_at).getTime()),
      );
      if (Number.isFinite(maxMs) && maxMs > 0) {
        res.setHeader("X-Last-Updated-At", new Date(maxMs).toISOString());
      }
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(rows.map(rowToStock));
  } catch (e) {
    next(e);
  }
});
