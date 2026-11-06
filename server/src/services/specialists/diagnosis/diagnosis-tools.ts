import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { logger } from "../../../logger.js";
import type { MarketMemo } from "./diagnosis-market.js";
import { getOrderLogText } from "./diagnosis-order-log.js";
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
  /** get_order_log 실행 단위 메모 — 키 `${date}|${isin ?? "*"}`. */
  orderLogMemo: Map<string, string>;
  /** get_market_ticks 실행 단위 메모(39-04 MarketMemo). */
  marketMemo: MarketMemo;
  /** 시세 도구가 돌려준 레코드 수 합(usage 로그 · 39-07 이 채운다). */
  marketRecords: number;
  /** 시세 도구 결과가 잘렸는지(usage 로그 · 39-07 이 채운다). */
  truncated: boolean;
};

export const DIAGNOSIS_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_order_log",
    description:
      "그날 사용자가 볼 수 있는 계좌의 주문 · 체결 · 전략 이벤트(발주 사유 · 조건 실측) · 상태전이를 시간순으로 준다. 날짜 생략 = 오늘(KST) · 종목 생략 = 그날 전체. from/to(HH:MM:SS) 로 시각을 좁힐 수 있다.",
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

async function runTool(block: Anthropic.ToolUseBlock, state: DiagnosisToolState): Promise<Anthropic.ToolResultBlockParam> {
  state.calls[block.name] = (state.calls[block.name] ?? 0) + 1;
  switch (block.name) {
    case "get_order_log": {
      const parsed = OrderLogInput.safeParse(block.input ?? {});
      if (!parsed.success) return inputError(block.id, parsed.error);
      return textResult(block.id, await getOrderLogText(state.supabase, state.userId, parsed.data));
    }
    default:
      return { type: "tool_result", tool_use_id: block.id, is_error: true, content: `모르는 도구: ${block.name}` };
  }
}
