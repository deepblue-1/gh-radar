import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPECIALIST_TOOL_NAMES } from "@gh-radar/shared";

/**
 * Phase 14 Plan 05 — 팀장 오케스트레이터 유닛 테스트 (CHAT-01, RESEARCH Pattern 2 agent-as-tool).
 *
 * 검증 핵심:
 *   - SPECIALIST_TOOLS 5종 정의 (name = SPECIALIST_TOOL_NAMES 값, input_schema.type=="object")
 *   - runSpecialist 이름 기반 dispatch → 해당 consult 전문가 호출
 *   - 웹서치는 { text, citations } 분리 노출 (팀장 tool_result 엔 text 만, citation 은 별도)
 *   - 미지의 tool 이름 → 안내 텍스트 (throw 안 함, 팀장 루프 계속 진행)
 *   - quote/limitup code guard (D-08 환각방지): code 미지정 시 consult 미호출 + graceful skip
 *
 * 전문가 5종 모듈은 vi.mock 으로 스텁 — 여기선 dispatch/guard 배선만 검증.
 */

const { quoteMock, themeMock, newsMock, limitupMock, websearchMock } = vi.hoisted(() => ({
  quoteMock: vi.fn(),
  themeMock: vi.fn(),
  newsMock: vi.fn(),
  limitupMock: vi.fn(),
  websearchMock: vi.fn(),
}));

vi.mock("../specialists/quote-specialist", () => ({ consultQuoteSpecialist: quoteMock }));
vi.mock("../specialists/theme-specialist", () => ({ consultThemeSpecialist: themeMock }));
vi.mock("../specialists/news-specialist", () => ({ consultNewsSpecialist: newsMock }));
vi.mock("../specialists/limitup-specialist", () => ({ consultLimitupSpecialist: limitupMock }));
vi.mock("../specialists/websearch-specialist", () => ({ consultWebSearchSpecialist: websearchMock }));

// mock 이후 import (orchestrator 가 mock 된 전문가 모듈을 참조).
import { SPECIALIST_TOOLS, runSpecialist, extractStockRefs } from "../chat-orchestrator";

// 전문가는 mock 이므로 supabase 는 아무 객체나 통과시킨다.
const sb = {} as unknown as SupabaseClient;

describe("SPECIALIST_TOOLS (팀장에 노출할 전문가 tool 정의)", () => {
  it("Test 1: 길이 5, 각 name 이 SPECIALIST_TOOL_NAMES 값과 일치, input_schema.type==object", () => {
    expect(SPECIALIST_TOOLS).toHaveLength(5);

    const toolNames = SPECIALIST_TOOLS.map((t) => t.name).sort();
    const expected = Object.values(SPECIALIST_TOOL_NAMES).sort();
    expect(toolNames).toEqual(expected);

    for (const tool of SPECIALIST_TOOLS) {
      expect(tool.input_schema.type).toBe("object");
      // question 은 required, code 는 optional (팀장이 종목 없는 질문에서 미호출 자연스럽게).
      expect(tool.input_schema.required).toContain("question");
    }
  });

  it("Test 1b: quote/limitup tool description 에 code 미지정 시 미호출 지침 명시 (D-08)", () => {
    for (const name of [SPECIALIST_TOOL_NAMES.quote, SPECIALIST_TOOL_NAMES.limitup]) {
      const tool = SPECIALIST_TOOLS.find((t) => t.name === name);
      expect(tool?.description).toContain("종목 코드");
    }
  });
});

describe("runSpecialist (이름 기반 dispatch)", () => {
  beforeEach(() => {
    quoteMock.mockReset().mockResolvedValue("시세 opinion");
    themeMock.mockReset().mockResolvedValue("테마 opinion");
    newsMock.mockReset().mockResolvedValue("뉴스 opinion");
    limitupMock.mockReset().mockResolvedValue("상한가 opinion");
    websearchMock.mockReset().mockResolvedValue({
      text: "오늘 속보 요약",
      citations: [{ title: "속보", url: "https://news.example/1" }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("Test 2: consult_quote_specialist → consultQuoteSpecialist 호출 결과(문자열) 반환", async () => {
    const out = await runSpecialist(
      "consult_quote_specialist",
      { code: "005930", question: "지금 시세 어때?" },
      sb,
    );

    expect(out.text).toBe("시세 opinion");
    expect(quoteMock).toHaveBeenCalledTimes(1);
    expect(quoteMock).toHaveBeenCalledWith(sb, { code: "005930", question: "지금 시세 어때?" });
  });

  it("Test 3: consult_websearch_specialist → text 는 tool_result content, citations 는 별도 노출", async () => {
    const out = await runSpecialist(
      "consult_websearch_specialist",
      { question: "오늘 무슨 이슈?" },
      sb,
    );

    expect(out.text).toBe("오늘 속보 요약");
    expect(out.citations).toEqual([{ title: "속보", url: "https://news.example/1" }]);
    // 웹서치는 supabase 불필요 — { question } 만 전달.
    expect(websearchMock).toHaveBeenCalledWith({ question: "오늘 무슨 이슈?" });
  });

  it("Test 4: 알 수 없는 tool 이름 → 안내 텍스트 (throw 안 함)", async () => {
    const out = await runSpecialist("consult_unknown_specialist", { question: "?" }, sb);

    expect(out.text).toContain("찾을 수 없습니다");
    expect(quoteMock).not.toHaveBeenCalled();
    expect(websearchMock).not.toHaveBeenCalled();
  });

  it("Test 5: quote/limitup code 미지정 → consult 미호출 + graceful skip 텍스트 (D-08)", async () => {
    const q = await runSpecialist("consult_quote_specialist", { question: "시세?" }, sb);
    expect(q.text).toContain("종목이 특정되지 않아");
    expect(quoteMock).not.toHaveBeenCalled();

    const l = await runSpecialist("consult_limitup_specialist", { question: "상한가 이력?" }, sb);
    expect(l.text).toContain("종목이 특정되지 않아");
    expect(limitupMock).not.toHaveBeenCalled();

    // news/theme 는 code 없이도 유효 — guard 미적용 (호출됨).
    const n = await runSpecialist("consult_news_specialist", { question: "뉴스?" }, sb);
    expect(n.text).toBe("뉴스 opinion");
    expect(newsMock).toHaveBeenCalledTimes(1);
  });
});

describe("extractStockRefs (답변 텍스트에서 종목 참조 추출, D-07)", () => {
  it("6자리 종목코드 (괄호 표기) 를 추출하고 dedupe 한다", () => {
    const text = "삼성전자(005930)와 SK하이닉스(000660)가 강세. 삼성전자(005930) 재언급.";
    const refs = extractStockRefs(text);

    expect(refs).toEqual([{ code: "005930" }, { code: "000660" }]);
  });

  it("종목 참조가 없으면 빈 배열", () => {
    expect(extractStockRefs("오늘은 특정 종목 언급이 없습니다.")).toEqual([]);
  });
});
