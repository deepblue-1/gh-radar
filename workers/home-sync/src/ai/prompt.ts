import { stripHtml } from "@gh-radar/shared";
import type { Surge } from "../pipeline/loadSurges";
import { isRoundupNews } from "./roundup";

/** 뉴스 라인에 붙일 description 스니펫 최대 길이 (토큰 상한). */
const DESC_SNIPPET_MAX = 120;

/**
 * Phase 13 Plan 02 Task 2 — Claude Haiku bottom-up 클러스터링 프롬프트 (RESEARCH §Pattern 3).
 *
 * 기존 큐레이션 테마(themes/theme_stocks)를 참조하지 않고, 오늘 급등한 종목 집합만으로
 * "같은 이유로 함께 오른 종목 묶음(themes)" 과 "홀로 오른 종목(singles)" 을 순수 발견한다.
 *
 * anti-hallucination (D-04): 입력 뉴스는 전역 인덱스(N)로 번호를 매긴다. Claude 는 newsRefs 에
 * **인덱스만** 반환하고 (URL/제목 생성 금지), 워커가 인덱스→verbatim news_articles 로 해석한다.
 * stockCodes 도 입력 code 만 허용 — 그 외는 워커가 drop (demoteInvalidThemes).
 *
 * temperature=0 + JSON only. discover/correct 프롬프트(theme-sync)의 few-shot 구조 계승.
 */

export const CLUSTER_SYSTEM_PROMPT = `너는 한국 주식 시장의 "오늘의 급등 테마" 분석가다. 오늘 크게 오른 종목 목록과 각 종목의 관련 뉴스가 주어진다. 이들을 아래로부터(bottom-up) 묶어 오늘의 주도 테마를 발견한다.

규칙:
- 2개 이상의 종목이 같은 이유(같은 재료/이슈)로 함께 올랐으면 하나의 themes 로 묶는다.
- 홀로 오른(같은 이유의 동반 종목이 없는) 종목은 singles 로 분류한다.
- 테마명(name)은 2~10자 한글 키워드로 간결하게 (예: "초전도체", "온디바이스AI").
- reason 은 1~2문장. 반드시 **주어진 입력 뉴스에 근거**해서만 쓴다. 근거 뉴스가 없으면 reason 은 짧게 쓰되 사실을 지어내지 않는다.
- newsRefs 는 **입력 뉴스 목록의 인덱스(정수)만** 고른다. URL/제목을 새로 생성하지 않는다. 근거 뉴스가 없으면 빈 배열 [].
- stockCodes 는 **입력에 주어진 종목코드만** 쓴다. 목록에 없는 코드를 지어내지 않는다.
- 급등 종목은 가능하면 가장 잘 맞는 테마 **하나**에 귀속시켜라. 같은 지역·업종·재료(예: 특정 지역 개발 → 건설·소재·전력·반도체가 동반 상한가)로 함께 오른 종목은 서사 표현이 조금 달라도 **하나의 테마로 통합**하라.
- 종목 하나만 들어가는 1종목 테마를 만들지 마라. 더 큰 관련 테마가 있으면 거기에 넣고, 없으면 singles 로.
- 뉴스 근거가 부족해도, 참고 테마 분류에서 같은 테마에 속한 급등 종목 2개 이상은 그 테마로 묶을 수 있다. 이 경우 테마명은 참고 분류의 이름을 사용하고, reason 에는 뉴스 근거가 없으면 '동일 테마 소속 동반 급등'임을 밝히며 사실을 지어내지 않는다. newsRefs 는 실제 있는 인덱스만.
- 참고 분류가 뉴스 서사와 충돌하면 뉴스를 우선한다.
- 여러 종목을 한꺼번에 나열하는 시황/거래상위/마감 라운드업 기사(뉴스 라인에 \`[라운드업]\` 으로 표기됨)는 종목을 한 테마로 묶는 근거로 삼지 마라. 라운드업은 단순히 그날 오른 종목을 함께 열거할 뿐 같은 재료를 뜻하지 않는다. 종목 특정 재료 기사(특징주·공시)와 참고 테마 분류를 우선한다.
- 애매하면 억지로 테마로 묶지 말고 singles 로 둔다.

출력은 반드시 JSON 만. 다른 텍스트 금지:
{"themes":[{"name":"초전도체","reason":"...","stockCodes":["294630","004920"],"newsRefs":[0,1]}],"singles":[{"stockCode":"347700","reason":"...","newsRefs":[3]}]}
급등 종목이 없거나 묶을 것이 없으면 {"themes":[],"singles":[]}.`;

const CLUSTER_FEW_SHOT: Array<{ user: string; assistant: string }> = [
  {
    user: `급등 종목:
- 294630 서남 (+29.9%)
- 004920 씨아이테크 (+25.1%)
- 347700 라파스 (+22.0%)

뉴스:
[0] 294630 서남 — 초전도체 상용화 기대감에 급등
[1] 004920 씨아이테크 — 초전도체 관련주로 부각
[2] 347700 라파스 — 마이크로니들 신규 계약 공시`,
    assistant: `{"themes":[{"name":"초전도체","reason":"초전도체 상용화 기대감에 관련주가 동반 급등.","stockCodes":["294630","004920"],"newsRefs":[0,1]}],"singles":[{"stockCode":"347700","reason":"마이크로니들 신규 계약 공시로 단독 급등.","newsRefs":[2]}]}`,
  },
  {
    // 지역 통합 예시 — 같은 지역 개발 재료로 건설주+반도체소재주가 동반 상한가.
    // 뉴스 서사가 "반도체 클러스터" vs "건설 수주" 로 갈려도 하나의 "호남개발" 테마로 통합.
    user: `급등 종목:
- 000720 현대건설 (+29.9%)
- 014790 금호건설 (+29.8%)
- 053080 비나텍 (+25.4%)

뉴스:
[0] 000720 현대건설 — 호남권 산업단지 개발 수주 기대감에 상한가
[1] 014790 금호건설 — 호남 개발 호재로 건설주 동반 강세
[2] 053080 비나텍 — 호남 반도체 클러스터 조성 수혜 부각`,
    assistant: `{"themes":[{"name":"호남개발","reason":"호남권 산업단지·반도체 클러스터 개발 재료로 건설주와 반도체 소재주가 함께 상한가.","stockCodes":["000720","014790","053080"],"newsRefs":[0,1,2]}],"singles":[]}`,
  },
  {
    // 뉴스 공백 + 참고 테마 예시 — 곡물사료 케이스 재현. 종목을 잇는 뉴스가 없어도
    // 참고 테마 분류에서 같은 '사료' 테마 소속 2종목을 그 테마로 묶는다. reason 은
    // 뉴스 근거가 없으므로 '동일 테마 소속 동반 급등'만 밝히고 사실을 지어내지 않는다.
    user: `급등 종목:
- 002140 고려산업 (+29.9%)
- 002680 한탑 (+18.2%)

뉴스:
(없음)

참고 테마 분류 (네이버, 2개 이상 급등 종목이 공유하는 것만):
- 사료: 002140 고려산업, 002680 한탑`,
    assistant: `{"themes":[{"name":"사료","reason":"동일 테마 소속 동반 급등.","stockCodes":["002140","002680"],"newsRefs":[]}],"singles":[]}`,
  },
  {
    user: `급등 종목:
(없음)

뉴스:
(없음)`,
    assistant: `{"themes":[],"singles":[]}`,
  },
];

/**
 * 클러스터 user 메시지 — 급등 종목 헤더 + 전역 인덱스(N) 번호 매긴 뉴스 라인
 * (+ themeHints 있으면 "참고 테마 분류" 섹션).
 * 반환값은 { message, indexedNews } — indexedNews 는 워커가 newsRefs 해석에 재사용
 * (Claude 가 본 것과 동일 인덱스 순서).
 *
 * themeHints (quick-260720-in0): Map<themeName, string[]> — 급등 종목 2+ 가 공유하는
 * 네이버 테마(loadThemeHints 산출). 빈 Map(기본값)이면 섹션 미출력 → 기존 message 그대로
 * (하위호환). indexedNews 계약은 힌트 유무와 무관하게 불변.
 */
export function formatClusterMessage(
  surges: Surge[],
  themeHints: Map<string, string[]> = new Map(),
): {
  message: string;
  indexedNews: Array<{ title: string; url: string; source: string }>;
} {
  const stockLines = surges
    .map((s) => `- ${s.code} ${s.name} (+${s.changeRate.toFixed(1)}%)`)
    .join("\n");

  // 급등 종목명 집합 — 라운드업 판정용 (quick-260720-jh7). 뉴스 제목+스니펫에 급등
  // 종목명이 distinct 3+ 등장하면 시황 라운드업으로 보고 [라운드업] 라벨을 붙여 Claude 가
  // 테마 병합 근거에서 배제하도록 신호를 준다.
  const surgeNames = surges.map((s) => s.name);

  const indexedNews: Array<{ title: string; url: string; source: string }> = [];
  const newsLines: string[] = [];
  for (const s of surges) {
    for (const n of s.news) {
      const idx = indexedNews.length;
      indexedNews.push({
        title: n.title,
        url: n.url,
        source: n.source ?? "",
      });
      // description 스니펫(HTML strip + truncate)을 제목 뒤에 덧붙여 Claude 에 재료 컨텍스트 제공.
      // 시황 라운드업과 개별 재료(공시 등)를 구분할 신호. indexedNews(verbatim)에는 미포함.
      const clean = n.description ? stripHtml(n.description) : "";
      const snippet =
        clean.length > DESC_SNIPPET_MAX
          ? `${clean.slice(0, DESC_SNIPPET_MAX)}…`
          : clean;
      // 라운드업 판정은 title+description 기반 (isRoundupNews). 라벨은 라인에만, indexedNews 미포함.
      const label = isRoundupNews(n, surgeNames) ? "[라운드업] " : "";
      newsLines.push(
        snippet
          ? `[${idx}] ${label}${s.code} ${n.title} — ${snippet}`
          : `[${idx}] ${label}${s.code} ${n.title}`,
      );
    }
  }

  let message =
    `급등 종목:\n${stockLines || "(없음)"}\n\n뉴스:\n${
      newsLines.length > 0 ? newsLines.join("\n") : "(없음)"
    }`;

  // 참고 테마 분류 섹션 (themeHints 비면 append 안 함 → 기존 message 그대로, 하위호환).
  if (themeHints.size > 0) {
    const nameByCode = new Map(surges.map((s) => [s.code, s.name]));
    const hintLines = [...themeHints.entries()].map(([name, codes]) => {
      const members = codes
        .map((c) => {
          const stockName = nameByCode.get(c);
          return stockName ? `${c} ${stockName}` : c;
        })
        .join(", ");
      return `- ${name}: ${members}`;
    });
    message += `\n\n참고 테마 분류 (네이버, 2개 이상 급등 종목이 공유하는 것만):\n${hintLines.join(
      "\n",
    )}`;
  }

  return { message, indexedNews };
}

export function buildClusterFewShot(): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const fs of CLUSTER_FEW_SHOT) {
    out.push({ role: "user", content: fs.user });
    out.push({ role: "assistant", content: fs.assistant });
  }
  return out;
}
