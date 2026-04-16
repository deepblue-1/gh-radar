import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxiosInstance } from "axios";
import { SearchQuery, sanitizeSearchTerm } from "../schemas/search.js";
import {
  mergeMasterAndQuote,
  inquirePriceToQuoteRow,
  type StockMasterRow,
  type StockQuoteRow,
} from "../mappers/stock.js";
import { fetchInquirePrice } from "../kis/inquirePrice.js";
import { ApiError, StockNotFound } from "../errors.js";
import { logger } from "../logger.js";

export const stocksRouter: RouterT = Router();

const MASTER_COLS =
  "code,name,market,sector,security_type,listing_date,is_delisted,updated_at";
const QUOTE_COLS =
  "code,price,change_amount,change_rate,volume,trade_amount,open,high,low,market_cap,upper_limit,lower_limit,updated_at";

// 순서 중요: /search 를 /:code 보다 먼저 등록해야 ':code'가 'search'를 흡수하지 않음
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

    // 1. 마스터 universe 에서 매치 (name ilike + code ilike)
    const { data: masters, error: mErr } = await supabase
      .from("stocks")
      .select(MASTER_COLS)
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .order("name", { ascending: true })
      .limit(20);
    if (mErr) throw mErr;
    const masterRows = (masters ?? []) as unknown as StockMasterRow[];
    if (masterRows.length === 0) {
      res.json([]);
      return;
    }

    // 2. 매치된 code 들의 시세 LEFT JOIN (별도 쿼리, 코드 IN list)
    const codes = masterRows.map((m) => m.code);
    const { data: quotes, error: qErr } = await supabase
      .from("stock_quotes")
      .select(QUOTE_COLS)
      .in("code", codes);
    if (qErr) throw qErr;
    const quoteByCode = new Map<string, StockQuoteRow>();
    for (const qr of (quotes ?? []) as unknown as StockQuoteRow[]) {
      quoteByCode.set(qr.code, qr);
    }

    // 3. 병합 + 응답
    res.json(
      masterRows.map((m) =>
        mergeMasterAndQuote(m, quoteByCode.get(m.code) ?? null),
      ),
    );
  } catch (e) {
    next(e);
  }
});

stocksRouter.get("/:code", async (req, res, next) => {
  try {
    const code = req.params.code;
    if (!/^[A-Za-z0-9]{1,10}$/.test(code)) {
      throw new ApiError(400, "INVALID_QUERY_PARAM", "code: invalid format");
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const kisClient = req.app.locals.kisClient as AxiosInstance | undefined;

    // 순서 불변식 (Pitfall 4): 마스터 존재 확인 먼저
    const { data: master, error: mErr } = await supabase
      .from("stocks")
      .select(MASTER_COLS)
      .eq("code", code)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!master) throw StockNotFound(code);
    const masterRow = master as unknown as StockMasterRow;

    // On-demand inquirePrice (D9 — 무조건 1회). kisClient 미주입(테스트/폴백) 시 skip.
    let freshQuote: StockQuoteRow | null = null;
    if (kisClient) {
      try {
        const price = await fetchInquirePrice(kisClient, code);
        freshQuote = inquirePriceToQuoteRow(code, price);
        // upsert (실패해도 응답 우선 — try/catch 분리)
        const { error: upErr } = await supabase
          .from("stock_quotes")
          .upsert(freshQuote, { onConflict: "code" });
        if (upErr) {
          logger.warn(
            { code, err: upErr },
            "stock_quotes upsert failed (continuing with fresh quote)",
          );
        }
      } catch (err) {
        logger.warn(
          { code, err: (err as Error).message },
          "inquirePrice failed — fall back to cached quote",
        );
      }
    }

    // 폴백: cached stock_quotes 조회 (fresh 가 있으면 skip)
    let quote: StockQuoteRow | null = freshQuote;
    if (!quote) {
      const { data: cached, error: cErr } = await supabase
        .from("stock_quotes")
        .select(QUOTE_COLS)
        .eq("code", code)
        .maybeSingle();
      if (cErr) throw cErr;
      quote = (cached as unknown as StockQuoteRow | null) ?? null;
    }

    res.json(mergeMasterAndQuote(masterRow, quote));
  } catch (e) {
    next(e);
  }
});
