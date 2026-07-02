import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SPECIALIST_TOOL_NAMES,
  type SpecialistId,
} from "@gh-radar/shared";
import { consultQuoteSpecialist } from "./specialists/quote-specialist.js";
import { consultThemeSpecialist } from "./specialists/theme-specialist.js";
import { consultNewsSpecialist } from "./specialists/news-specialist.js";
import { consultLimitupSpecialist } from "./specialists/limitup-specialist.js";
import { consultWebSearchSpecialist } from "./specialists/websearch-specialist.js";

/**
 * Phase 14 — 팀장 오케스트레이터 코어 (CHAT-01, RESEARCH Pattern 2 agent-as-tool).
 *
 * 두 가지를 제공한다:
 *   1) SPECIALIST_TOOLS — 팀장(Sonnet)에 노출할 5개 전문가 `Anthropic.Tool[]`.
 *      팀장은 질문을 보고 필요한 전문가만 tool_use 로 호출한다.
 *   2) runSpecialist — tool_use.name → 전문가 dispatch → tool_result content 조립.
 *      한 turn 에 여러 tool_use 가 오면 팀장 루프(P06)가 Promise.all 로 병렬 실행한다
 *      (선택적 병렬 호출). 여기선 단일 dispatch 만 담당.
 *
 * 환각 방지(D-08): 종목 코드가 필요한 전문가(quote/limitup)는 code 미지정 시 consult 함수를
 * 호출하지 않고 graceful skip 텍스트를 반환한다 — 무데이터 시세/상한가 조회·환각 원천 차단.
 * news/theme/websearch 는 code 없이도 유효(테마/뉴스/웹은 코드 무관 질의 가능)하므로 미적용.
 */

/** 전문가 입력 — code 는 종목 컨텍스트(없을 수 있음), question 은 사용자 질문. */
export interface SpecialistInput {
  code?: string;
  question: string;
}

/** runSpecialist 반환 — text 는 팀장 tool_result content, citations(웹서치)는 SSE 별도 전파(D-08). */
export interface SpecialistRunResult {
  text: string;
  citations?: Array<{ title: string; url: string }>;
}

/** quote/limitup code 미지정 시 graceful skip 텍스트 (D-08 환각방지). */
const CODE_REQUIRED_SKIP = "종목이 특정되지 않아 시세/상한가 분석을 건너뜁니다.";

/** 미지의 tool 이름 → 안내 텍스트 (throw 안 함, 팀장 루프 계속 진행, T-14-04c). */
const UNKNOWN_TOOL = "해당 전문가를 찾을 수 없습니다.";

/**
 * 팀장에 노출할 5개 전문가 tool 정의 (RESEARCH Pattern 2 verbatim).
 *
 * - name 은 shared 의 SPECIALIST_TOOL_NAMES 값 사용 (SSE agent_start 라벨 매핑과 정합).
 * - input_schema: code(optional) + question(required). code 를 required 로 올리지 않는 이유 —
 *   팀장이 종목 없는 일반 질문에서 tool 스키마 위반 에러를 내지 않고 자연스럽게 미호출하도록 두고,
 *   실제 방어는 runSpecialist 의 code guard 로 강제한다(D-08).
 * - quote/limitup description 에 "종목 코드가 특정되지 않으면 호출하지 말 것" 명시(D-08 환각방지).
 * - websearch description 에 "비용 큼 — 꼭 필요할 때만"(D-12).
 *
 * P06 팀장 루프가 마지막 원소에 cache_control 을 부착하므로 배열은 그대로 export 한다.
 */
export const SPECIALIST_TOOLS: Anthropic.Tool[] = [
  {
    name: SPECIALIST_TOOL_NAMES.quote,
    description:
      "특정 종목의 현재가·등락률·거래대금·시가총액·최근 일봉 흐름·수급 관점 분석이 필요할 때. 종목 코드(code)가 특정되지 않으면 호출하지 말 것.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    },
  },
  {
    name: SPECIALIST_TOOL_NAMES.theme,
    description:
      "오늘 주도 테마·특정 종목의 소속 테마·테마 동조(co-movement) 후보 분석이 필요할 때",
    input_schema: {
      type: "object",
      properties: { code: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    },
  },
  {
    name: SPECIALIST_TOOL_NAMES.news,
    description: "종목 관련 뉴스·종목토론방 심리 요약이 필요할 때 (DB 저장 뉴스/토론 기반)",
    input_schema: {
      type: "object",
      properties: { code: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    },
  },
  {
    name: SPECIALIST_TOOL_NAMES.limitup,
    description:
      "과거 상한가 다음날 익절 패턴·테마별 상한가 경향 분석이 필요할 때. 종목 코드(code)가 특정되지 않으면 호출하지 말 것.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    },
  },
  {
    name: SPECIALIST_TOOL_NAMES.websearch,
    description:
      "오늘 속보·공시·장중 이슈 등 DB 로 답할 수 없는 실시간 정보가 필요할 때만 (비용 큼 — 꼭 필요할 때만)",
    input_schema: {
      type: "object",
      properties: { code: { type: "string" }, question: { type: "string" } },
      required: ["question"],
    },
  },
];

/** tool 이름 → SpecialistId 역매핑 (SSE agent_start 라벨용, P06 재사용). */
const TOOL_NAME_TO_ID: Record<string, SpecialistId> = Object.fromEntries(
  (Object.entries(SPECIALIST_TOOL_NAMES) as Array<[SpecialistId, string]>).map(([id, name]) => [
    name,
    id,
  ]),
);

/** tool 이름 → SpecialistId | null (미지의 이름은 null). */
export function toolNameToSpecialistId(name: string): SpecialistId | null {
  return TOOL_NAME_TO_ID[name] ?? null;
}

/**
 * 팀장이 고른 전문가 하나를 실행해 tool_result content 를 조립한다 (Pattern 2 dispatch).
 *
 * @param name  팀장 tool_use.name (예: "consult_quote_specialist")
 * @param input 팀장이 생성한 tool 인자 { code?, question }
 * @param supabase 서비스롤 클라 (데이터 전문가 조회용, 웹서치는 미사용)
 * @returns { text } — 팀장 tool_result content. 웹서치만 { text, citations } 로 citation 분리 노출.
 *
 * - 미지의 name → 안내 텍스트 반환 (throw 안 함 — 팀장 루프가 계속 진행, T-14-04c).
 * - quote/limitup 에서 code 미지정 → consult 미호출 + graceful skip (D-08 환각방지).
 */
export async function runSpecialist(
  name: string,
  input: SpecialistInput,
  supabase: SupabaseClient,
): Promise<SpecialistRunResult> {
  const id = toolNameToSpecialistId(name);
  if (id === null) return { text: UNKNOWN_TOOL };

  // code 의존 전문가(quote/limitup): code 없으면 무데이터 조회·환각 차단 (D-08).
  if ((id === "quote" || id === "limitup") && !input.code) {
    return { text: CODE_REQUIRED_SKIP };
  }

  switch (id) {
    case "quote":
      return { text: await consultQuoteSpecialist(supabase, input) };
    case "theme":
      return { text: await consultThemeSpecialist(supabase, input) };
    case "news":
      return { text: await consultNewsSpecialist(supabase, input) };
    case "limitup":
      return { text: await consultLimitupSpecialist(supabase, input) };
    case "websearch": {
      const out = await consultWebSearchSpecialist({ question: input.question });
      return { text: out.text, citations: out.citations };
    }
    default:
      return { text: UNKNOWN_TOOL };
  }
}

/** 6자리 종목코드 (괄호 표기) 추출 정규식 — 예: "삼성전자(005930)". */
const STOCK_REF_RE = /\((\d{6})\)/g;

/**
 * 팀장 답변 텍스트에서 종목 참조(6자리 코드)를 추출한다 (D-07 인라인 미니 카드 트리거).
 *
 * 실제 카드 데이터(가격/등락률) 조회는 P06 이 stock_quotes 로 수행한다 — 여기선 코드만 추출.
 * 등장 순서 유지 + dedupe.
 */
export function extractStockRefs(text: string): Array<{ code: string }> {
  const out: Array<{ code: string }> = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(STOCK_REF_RE)) {
    const code = m[1];
    if (!seen.has(code)) {
      seen.add(code);
      out.push({ code });
    }
  }
  return out;
}
