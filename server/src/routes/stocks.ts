import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SearchQuery, sanitizeSearchTerm } from "../schemas/search.js";
import { COLS } from "./scanner.js";
import { rowToStock, type StockRow } from "../mappers/stock.js";
import { ApiError, StockNotFound } from "../errors.js";

export const stocksRouter: RouterT = Router();

// /api/stocks/search?q=...
// 순서 중요: /search를 /:code보다 먼저 등록해야 ':code'가 'search'를 흡수하지 않음
stocksRouter.get("/search", async (req, res, next) => {
  try {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        `${issue.path.join(".")}: ${issue.message}`,
      );
    }
    const q = sanitizeSearchTerm(parsed.data.q);
    if (q.length === 0) {
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        "q: empty after sanitization",
      );
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase
      .from("stocks")
      .select(COLS)
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .order("name", { ascending: true })
      .limit(20);
    if (error) throw error;
    const rows = (data ?? []) as unknown as StockRow[];
    res.json(rows.map(rowToStock));
  } catch (e) {
    next(e);
  }
});

// /api/stocks/:code
stocksRouter.get("/:code", async (req, res, next) => {
  try {
    const code = req.params.code;
    if (!/^[A-Za-z0-9]{1,10}$/.test(code)) {
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        "code: invalid format",
      );
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase
      .from("stocks")
      .select(COLS)
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw StockNotFound(code);
    res.json(rowToStock(data as unknown as StockRow));
  } catch (e) {
    next(e);
  }
});
