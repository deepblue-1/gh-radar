import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { logger } from "../../../logger.js";
import { sanitizeSearchTerm } from "../../../schemas/search.js";
import { TICK_REQUEST_DAILY_CAP_DEFAULT } from "../../ticks.js";
import { getMarketTicksText, type MarketMemo } from "./diagnosis-market.js";
import { getOrderLogText, type OrderLogMemo } from "./diagnosis-order-log.js";
import type { DiagnosisDeps } from "./diagnosis-specialist.js";

/**
 * Phase 39 — 진단 전문가의 도구 정의 · 디스패처.
 *
 * 계좌 범위(SC-2): **어느 도구 스키마에도 계좌 · 사용자 · 서버 칸이 없다.** 디스패처가 실행 state 의 `userId`
 * (라우트 `req.userId` → `ctx.userId`)를 RPC 에 넣는다 — 모델이 입력에 무엇을 덧붙여도 zod 가 모르는 키를 버린다.
 * 도구는 전부 조회 전용이다.
 *
 * 도구 배열은 매 요청 같은 순서 · 같은 내용이어야 한다(prefix 캐시 · preserved thinking — 루프 안에서 바꾸지 않는다).
 */

/** 한 진단 실행 단위 state — 진단 전문가가 만들고 디스패처가 채운다(39-07 은 시세 칸만 채운다). */
export type DiagnosisToolState = {
  supabase: SupabaseClient;
  userId: string;
  deps?: DiagnosisDeps;
  /** 도구별 호출 수(상한 판정 · usage 로그). */
  calls: Record<string, number>;
  /** get_order_log 실행 단위 메모 — 키 `${date}|${isin ?? "*"}` → 진행 중 · 끝난 RPC Promise(병렬 호출도 RPC 1회). */
  orderLogMemo: OrderLogMemo;
  /** get_market_ticks 실행 단위 메모(39-04 MarketMemo). */
  marketMemo: MarketMemo;
  /** 시세 도구가 돌려준 레코드 수 합(usage 로그 · 39-07 이 채운다). */
  marketRecords: number;
  /** 시세 도구 결과가 잘렸는지(usage 로그 · 39-07 이 채운다). */
  truncated: boolean;
};

/** 한 진단 실행 안 도구별 호출 상한 — 넘으면 조회 0 · 「상한 도달」 텍스트(is_error 아님 · 모델이 지금 자료로 답하게). */
export const DIAGNOSIS_TOOL_CAPS = { search_stock: 4, get_order_log: 3, get_market_ticks: 4 } as const;

const CAP_LABELS: Record<keyof typeof DIAGNOSIS_TOOL_CAPS, string> = {
  search_stock: "종목 검색",
  get_order_log: "주문로그 조회",
  get_market_ticks: "시세 조회",
};

/** 종목 검색 결과 상한(행). */
const SEARCH_LIMIT = 10;

/**
 * 도구 정의 — 순서 고정(get_order_log → search_stock → get_market_ticks · 새 도구는 끝에만 붙인다).
 * 매 요청 같은 배열이어야 prefix 캐시 · preserved thinking 이 산다.
 */
export const DIAGNOSIS_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_order_log",
    description:
      "그날 사용자가 볼 수 있는 계좌의 주문 · 체결 · 전략 이벤트(발주 사유 · 조건 실측) · 상태전이를 시간순으로 준다. 날짜 생략 = 오늘(KST) · 종목 생략 = 그날 전체. from/to(HH:MM:SS(.mmm) KST · 초까지만 주면 to 는 그 초 끝까지)로 시각을 좁힐 수 있다. 400줄을 넘으면 종목 생략 시 종목별 요약, 종목 지정 시 앞 400줄만 준다.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD (KST)" },
        isin: { type: "string", description: "12자 ISIN" },
        from: { type: "string", description: "HH:MM:SS(.mmm) KST" },
        to: { type: "string", description: "HH:MM:SS(.mmm) KST" },
      },
      required: [],
    },
  },
  {
    name: "search_stock",
    description: "종목 이름 · 코드로 ISIN · 코드 · 시장을 찾는다. 질문에 종목명이 있으면 먼저 부른다.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "종목명 또는 코드 일부(1~40자)" } },
      required: ["query"],
    },
  },
  {
    // 39-07 — 계좌 칸 없음. 사용자 범위(tick_open_for_user 등)는 state.userId 로만 정해진다(SC-2).
    name: "get_market_ticks",
    description:
      "체결(A3)+호가(B6) 원본 전문을 시간순 한 줄씩 준다. 최대 60초 · 400건 — 넘으면 잘림 표시가 붙으니 범위를 좁혀 다시 부른다. 처음엔 사건 시각 −10초~+5초로 부른다. 오늘은 당일 경로, 지난 날짜는 저장 격자 — 없으면 변환을 걸고 『변환 중』 을 돌려준다. 『자료 없음』 이면 시세 없이 판단한다.",
    input_schema: {
      type: "object",
      properties: {
        isin: { type: "string", description: "12자 ISIN" },
        exchange: { type: "string", enum: ["KRX", "NXT"], description: "거래소" },
        date: { type: "string", description: "YYYY-MM-DD (KST)" },
        from: { type: "string", description: "HH:MM:SS(.mmm) KST · 창 시작" },
        to: { type: "string", description: "HH:MM:SS(.mmm) KST · 창 끝(from 뒤 60초 이내)" },
      },
      required: ["isin", "exchange", "date", "from", "to"],
    },
  },
];

const TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;

/** 모르는 키는 버린다(`.strip()` — account_no · user_id 같은 덧붙임이 RPC 에 닿지 않는다). */
const OrderLogInput = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다").optional(),
    isin: z.string().regex(/^[A-Z0-9]{12}$/, "12자 ISIN 이어야 합니다").optional(),
    from: z.string().regex(TIME_RE, "HH:MM:SS 형식이어야 합니다").optional(),
    to: z.string().regex(TIME_RE, "HH:MM:SS 형식이어야 합니다").optional(),
  })
  .strip();

const MarketTicksInputSchema = z
  .object({
    isin: z.string().regex(/^[A-Z0-9]{12}$/, "12자 ISIN 이어야 합니다"),
    exchange: z.enum(["KRX", "NXT"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다"),
    from: z.string().regex(TIME_RE, "HH:MM:SS 형식이어야 합니다"),
    to: z.string().regex(TIME_RE, "HH:MM:SS 형식이어야 합니다"),
  })
  .strip();

const SearchInput = z.object({ query: z.string().min(1, "검색어가 비었습니다").max(40, "40자 이하여야 합니다") }).strip();

function inputError(id: string, err: z.ZodError): Anthropic.ToolResultBlockParam {
  const issue = err.issues[0];
  const where = issue?.path.join(".");
  return {
    type: "tool_result",
    tool_use_id: id,
    is_error: true,
    content: `입력 오류: ${where ? `${where}: ` : ""}${issue?.message ?? "형식이 맞지 않습니다"}`,
  };
}

function textResult(id: string, content: string): Anthropic.ToolResultBlockParam {
  return { type: "tool_result", tool_use_id: id, content };
}

/**
 * 종목 검색 — `/api/stocks/search` 와 같은 규칙(sanitize · name/code ilike · ETP 블랙리스트 · 상폐 제외) · 시세 조인 없음.
 * 사용자 계좌와 무관한 공개 마스터라 userId 를 쓰지 않는다.
 */
async function searchStockText(supabase: SupabaseClient, q: string, query: string): Promise<string> {
  const { data, error } = await supabase
    .from("stocks")
    .select("code,name,isin,market")
    .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
    .not("security_group", "in", '("ETF","ETN","ELW")')
    .eq("is_delisted", false)
    .order("name", { ascending: true })
    .limit(SEARCH_LIMIT);
  if (error) {
    logger.warn({ err: error.message }, "[chat] diagnosis search_stock failed");
    return "조회 실패: 종목을 검색하지 못했습니다";
  }
  const rows = (data ?? []) as Array<{ code: string; name: string; isin: string | null; market: string | null }>;
  if (rows.length === 0) return `종목 없음: ${query}`;
  return ["범례: 코드 이름 ISIN 시장", ...rows.map((r) => `${r.code} ${r.name} ${r.isin ?? "—"} ${r.market ?? "—"}`)].join(
    "\n",
  );
}

/** 도구 하나 실행 → tool_result. throw 하지 않는다. 호출마다 `[chat] diagnosis tool` 서버 로그(D-03). */
export async function dispatchDiagnosisTool(
  block: Anthropic.ToolUseBlock,
  state: DiagnosisToolState,
): Promise<Anthropic.ToolResultBlockParam> {
  const started = Date.now();
  let result: Anthropic.ToolResultBlockParam;
  try {
    result = await runTool(block, state);
  } catch (err) {
    // 도구 하나의 예외가 진단 루프 전체를 깨지 않게 — 모델에는 오류 결과, 서버에는 원인.
    logger.warn({ tool: block.name, err: err instanceof Error ? err.message : String(err) }, "[chat] diagnosis tool failed");
    result = { type: "tool_result", tool_use_id: block.id, is_error: true, content: "조회 실패: 도구 실행 중 오류" };
  }
  const content = typeof result.content === "string" ? result.content : "";
  logger.info(
    { tool: block.name, ms: Date.now() - started, chars: content.length, isError: result.is_error === true },
    "[chat] diagnosis tool",
  );
  return result;
}

function isCapped(name: string): name is keyof typeof DIAGNOSIS_TOOL_CAPS {
  return Object.hasOwn(DIAGNOSIS_TOOL_CAPS, name);
}

async function runTool(block: Anthropic.ToolUseBlock, state: DiagnosisToolState): Promise<Anthropic.ToolResultBlockParam> {
  const n = (state.calls[block.name] ?? 0) + 1;
  state.calls[block.name] = n;
  if (isCapped(block.name) && n > DIAGNOSIS_TOOL_CAPS[block.name]) {
    const cap = DIAGNOSIS_TOOL_CAPS[block.name];
    return textResult(block.id, `${CAP_LABELS[block.name]} 상한(${cap}회) 도달 — 지금까지 자료로 답하세요`);
  }
  switch (block.name) {
    case "get_order_log": {
      const parsed = OrderLogInput.safeParse(block.input ?? {});
      if (!parsed.success) return inputError(block.id, parsed.error);
      return textResult(
        block.id,
        await getOrderLogText(state.supabase, state.userId, parsed.data, new Date(), state.orderLogMemo),
      );
    }
    case "search_stock": {
      const parsed = SearchInput.safeParse(block.input ?? {});
      if (!parsed.success) return inputError(block.id, parsed.error);
      // PostgREST or-식 주입 방지 — 구분 문자를 지운 뒤 비면 조회하지 않는다(/api/stocks/search 와 같은 규칙).
      const term = sanitizeSearchTerm(parsed.data.query).trim();
      if (term.length === 0) {
        return { type: "tool_result", tool_use_id: block.id, is_error: true, content: "입력 오류: query: 검색할 글자가 없습니다" };
      }
      return textResult(block.id, await searchStockText(state.supabase, term, parsed.data.query));
    }
    case "get_market_ticks": {
      const parsed = MarketTicksInputSchema.safeParse(block.input ?? {});
      if (!parsed.success) return inputError(block.id, parsed.error);
      // 의존성은 라우트 app.locals → ctx.deps 에서만 온다. 없으면 시세 엔진이 「자료 없음」 사유를 만든다.
      const r = await getMarketTicksText(
        parsed.data,
        {
          supabase: state.supabase,
          userId: state.userId,
          tickgw: state.deps?.tickgw,
          trigger: state.deps?.tickConvertTrigger,
          dailyCap: state.deps?.tickRequestDailyCap ?? TICK_REQUEST_DAILY_CAP_DEFAULT,
        },
        state.marketMemo,
      );
      // [chat] diagnosis usage 로그(39-05)가 이 두 칸을 그대로 싣는다.
      state.marketRecords += r.records;
      state.truncated ||= r.truncated;
      return textResult(block.id, r.text);
    }
    default:
      return { type: "tool_result", tool_use_id: block.id, is_error: true, content: `모르는 도구: ${block.name}` };
  }
}
