import { describe, it, expect } from "vitest";
import {
  CLUSTER_SYSTEM_PROMPT,
  buildClusterFewShot,
  formatClusterMessage,
} from "./prompt";
import type { Surge } from "../pipeline/loadSurges";

/**
 * Phase 13 후속 — 프롬프트 consolidation 개선 검증.
 *
 * 근본 원인(금호건설류 고아 발생) 완화: 시스템 프롬프트가 (1) 같은 지역/업종/재료로
 * 동반 상한가한 종목을 서사 차이 무관 하나의 테마로 통합하도록, (2) 1종목 테마를 만들지
 * 않도록 지시하는지 확인. few-shot 에 지역 통합 예시가 추가되었는지 + 모든 assistant
 * 출력이 여전히 유효 JSON(계약 유지)인지 검증.
 */

describe("CLUSTER_SYSTEM_PROMPT consolidation 규칙", () => {
  it("가장 잘 맞는 테마 하나로 귀속 + 서사 차이 무관 통합 지시 포함", () => {
    expect(CLUSTER_SYSTEM_PROMPT).toContain("하나");
    expect(CLUSTER_SYSTEM_PROMPT).toContain("통합");
  });

  it("1종목 테마 금지 지시 포함", () => {
    expect(CLUSTER_SYSTEM_PROMPT).toContain("1종목 테마");
  });
});

describe("buildClusterFewShot 지역 통합 예시", () => {
  it("지역 통합 예시가 추가됨 (기존 초전도체/빈 예시 + 신규)", () => {
    const shots = buildClusterFewShot();
    // user/assistant 쌍 → 최소 3개 쌍(6 메시지) 이상 (기존 2 + 신규 1).
    expect(shots.length).toBeGreaterThanOrEqual(6);
    // 지역 통합 관련 키워드가 어느 user 프롬프트에 등장.
    const userText = shots.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    expect(userText).toContain("호남");
  });

  it("모든 assistant few-shot 출력은 여전히 유효 JSON (JSON-only 계약)", () => {
    const shots = buildClusterFewShot();
    const assistants = shots.filter((m) => m.role === "assistant");
    expect(assistants.length).toBeGreaterThanOrEqual(3);
    for (const a of assistants) {
      const parsed = JSON.parse(a.content) as { themes?: unknown; singles?: unknown };
      expect(Array.isArray(parsed.themes)).toBe(true);
      expect(Array.isArray(parsed.singles)).toBe(true);
    }
  });

  it("지역 통합 assistant 예시는 건설+반도체를 하나의 테마로 묶음", () => {
    const shots = buildClusterFewShot();
    const assistants = shots.filter((m) => m.role === "assistant");
    // 호남 통합 예시: 하나의 테마에 2종목 이상 + singles 로 흩어지지 않음.
    const regional = assistants.find((a) => {
      const p = JSON.parse(a.content) as {
        themes: Array<{ stockCodes: string[] }>;
      };
      return p.themes.some((t) => t.stockCodes.length >= 2);
    });
    expect(regional).toBeDefined();
  });
});

describe("formatClusterMessage description 스니펫", () => {
  const surge = (news: Surge["news"]): Surge => ({
    code: "026910",
    name: "광진실업",
    changeRate: 29,
    news,
  });

  it("뉴스 라인에 description 스니펫(HTML strip)이 제목 뒤 덧붙음", () => {
    const { message } = formatClusterMessage([
      surge([
        {
          id: "m1",
          stock_code: "026910",
          title: "광진실업 지분 인수",
          url: "https://n/m1",
          source: "s",
          published_at: "2026-07-01T18:00:00Z",
          description: "<b>씨씨홀딩스</b> 지분 인수 및 유상증자 결정",
        },
      ]),
    ]);
    expect(message).toContain("씨씨홀딩스 지분 인수 및 유상증자 결정");
    expect(message).not.toContain("<b>"); // stripHtml 적용.
    expect(message).toContain("[0] 026910 광진실업 지분 인수 —");
  });

  it("description 이 null 이면 스니펫 없이 제목만 (구분자 없음)", () => {
    const { message } = formatClusterMessage([
      surge([
        {
          id: "r1",
          stock_code: "026910",
          title: "오늘의 급등주 총정리",
          url: "https://n/r1",
          source: "s",
          published_at: "2026-07-02T09:00:00Z",
          description: null,
        },
      ]),
    ]);
    expect(message).toContain("[0] 026910 오늘의 급등주 총정리");
    expect(message).not.toContain("—");
  });

  it("긴 description 은 truncate + 말줄임표", () => {
    const long = "가".repeat(300);
    const { message } = formatClusterMessage([
      surge([
        {
          id: "m1",
          stock_code: "026910",
          title: "테스트",
          url: "https://n/m1",
          source: "s",
          published_at: "2026-07-01T18:00:00Z",
          description: long,
        },
      ]),
    ]);
    expect(message).toContain("…");
    expect(message).not.toContain("가".repeat(200)); // 120자 컷.
  });
});

describe("formatClusterMessage 참고 테마 분류 섹션 (quick-260720-in0)", () => {
  // 곡물사료 케이스 — 뉴스 없는 3종목이 '사료' 테마 공유.
  const surges: Surge[] = [
    { code: "002140", name: "고려산업", changeRate: 29.9, news: [] },
    { code: "002680", name: "한탑", changeRate: 18.2, news: [] },
    { code: "218150", name: "미래생명자원", changeRate: 21.4, news: [] },
  ];

  it("themeHints 전달 시 '참고 테마 분류' 섹션을 메시지 끝에 추가 (종목명 해석)", () => {
    const hints = new Map<string, string[]>([
      ["사료", ["002140", "002680", "218150"]],
    ]);
    const { message } = formatClusterMessage(surges, hints);
    expect(message).toContain(
      "참고 테마 분류 (네이버, 2개 이상 급등 종목이 공유하는 것만):",
    );
    expect(message).toContain(
      "- 사료: 002140 고려산업, 002680 한탑, 218150 미래생명자원",
    );
  });

  it("surges 에 없는 코드는 코드만 노출 (종목명 미해석 방어)", () => {
    const hints = new Map<string, string[]>([["사료", ["002140", "999999"]]]);
    const { message } = formatClusterMessage(surges, hints);
    expect(message).toContain("- 사료: 002140 고려산업, 999999");
  });

  it("빈 themeHints(기본값) → 섹션 미출력 (하위호환, 기존 message 동일)", () => {
    const withEmpty = formatClusterMessage(surges, new Map());
    const withDefault = formatClusterMessage(surges);
    expect(withEmpty.message).not.toContain("참고 테마 분류");
    expect(withEmpty.message).toBe(withDefault.message);
  });

  it("themeHints 유무와 무관하게 indexedNews 계약 불변", () => {
    const withNews: Surge[] = [
      {
        code: "002140",
        name: "고려산업",
        changeRate: 29.9,
        news: [
          {
            id: "n0",
            stock_code: "002140",
            title: "사료 특징주",
            url: "https://n/n0",
            source: "s",
            published_at: "2026-07-01T00:00:00Z",
            description: null,
          },
        ],
      },
    ];
    const hints = new Map<string, string[]>([["사료", ["002140", "002680"]]]);
    const withHint = formatClusterMessage(withNews, hints);
    const noHint = formatClusterMessage(withNews);
    expect(withHint.indexedNews).toEqual(noHint.indexedNews);
    expect(withHint.indexedNews).toHaveLength(1);
  });
});

describe("CLUSTER_SYSTEM_PROMPT 참고 테마 규칙 + few-shot (quick-260720-in0)", () => {
  it("뉴스 부족해도 참고 테마 2+ 묶기 허용 + 뉴스 우선 규칙 포함", () => {
    expect(CLUSTER_SYSTEM_PROMPT).toContain("참고 테마 분류");
    expect(CLUSTER_SYSTEM_PROMPT).toContain("동일 테마 소속 동반 급등");
    expect(CLUSTER_SYSTEM_PROMPT).toContain("뉴스를 우선한다");
  });

  it("사료 few-shot 추가 — 뉴스 없는 2종목을 참고 테마로 묶는 예시", () => {
    const shots = buildClusterFewShot();
    const userText = shots
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    expect(userText).toContain("사료");
    // 사료 예시 assistant 출력: 뉴스 없이 사료 테마 2종목 + newsRefs 빈 배열.
    const feed = shots
      .filter((m) => m.role === "assistant")
      .map((a) => JSON.parse(a.content) as { themes: Array<{ name: string; stockCodes: string[]; newsRefs: number[] }> })
      .find((p) => p.themes.some((t) => t.name === "사료"));
    expect(feed).toBeDefined();
    const feedTheme = feed!.themes.find((t) => t.name === "사료")!;
    expect(feedTheme.stockCodes.length).toBeGreaterThanOrEqual(2);
    expect(feedTheme.newsRefs).toEqual([]);
  });
});
