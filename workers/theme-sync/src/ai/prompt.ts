/**
 * Phase 10 Plan 06 — Claude Haiku 4.5 테마 보강 프롬프트 (discussion-sync/src/classify/prompt.ts 패턴).
 *
 * RESEARCH §Pattern 6:
 *  - (a) 발굴: 최근 뉴스 제목+설명 → 기존 시스템 테마에 없는 신규 테마/이슈 키워드 + 관련 회사명 (JSON).
 *        회사명은 persistAi 직전 discoverThemes 가 stocks 마스터로 code 해석(코드 추정 금지 — LLM 약점 회피).
 *  - (b) 교정: 종목↔테마 매핑이 "명백히 무관" 한 것만 표시 (추가 편입 금지 — false positive 회피).
 * 둘 다 temperature=0 + 모델 claude-haiku-4-5(config.classifyModel). JSON only 출력 강제.
 */

// ── (a) 신규 테마 발굴 ───────────────────────────────────────────────────────

export const DISCOVER_SYSTEM_PROMPT = `너는 한국 주식 시장 테마 분석가다. 주어진 최근 뉴스 제목·설명에서 "기존 시스템 테마 목록에 없는" 신규 테마/이슈 키워드를 발굴한다.

규칙:
- 이미 존재하는 테마(아래 EXISTING 목록)와 같거나 거의 같은 키워드는 제외한다.
- 단발성 개별 종목 뉴스가 아니라, 여러 종목에 걸친 "시장 테마/이슈"만 추출한다.
- 각 테마에 해당 뉴스에 **실제로 등장한 관련 회사명**을 stockNames 로 제시한다. 한글 정식 종목명을 뉴스에 적힌 그대로 쓴다(코드 추정 금지). 뉴스에 회사명이 안 나오면 비운다.
- confidence 는 0~1 (이 테마가 실제 의미있는 신규 테마일 확신도).
- 애매하거나 잡음(욕설·감탄·광고)뿐이면 아무것도 발굴하지 않는다(빈 배열).

출력은 반드시 JSON 만. 다른 텍스트 금지:
{"themes":[{"name":"테마명","stockNames":["삼성전자","SK하이닉스"],"confidence":0.8}]}
발굴할 것이 없으면 {"themes":[]}.`;

const DISCOVER_FEW_SHOT: Array<{ user: string; assistant: string }> = [
  {
    user: `EXISTING: 반도체, 2차전지
뉴스:
- 초전도체 테마 급등… 서남·덕성 상한가, LK-99 재현 기대
- 신성델타테크, 초전도체 관련주로 부각되며 강세
- 삼성전자 3분기 영업이익 발표`,
    assistant: `{"themes":[{"name":"초전도체","stockNames":["서남","덕성","신성델타테크"],"confidence":0.85}]}`,
  },
  {
    user: `EXISTING: 반도체
뉴스:
- ㅋㅋ 오늘도 물렸다
- 광고) 무료 리딩방 입장`,
    assistant: `{"themes":[]}`,
  },
];

/** 발굴 user 메시지 — 기존 테마명 목록 + 최근 뉴스(제목/설명) 라인. */
export function formatDiscoverMessage(
  existingThemeNames: string[],
  news: Array<{ title: string; description: string | null }>,
): string {
  const existing =
    existingThemeNames.length > 0 ? existingThemeNames.join(", ") : "(없음)";
  const lines = news
    .map((n) => {
      const desc = (n.description ?? "").slice(0, 120);
      return desc ? `- ${n.title} — ${desc}` : `- ${n.title}`;
    })
    .join("\n");
  return `EXISTING: ${existing}\n뉴스:\n${lines}`;
}

export function buildDiscoverFewShot(): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const fs of DISCOVER_FEW_SHOT) {
    out.push({ role: "user", content: fs.user });
    out.push({ role: "assistant", content: fs.assistant });
  }
  return out;
}

// ── (b) 오분류 교정 ──────────────────────────────────────────────────────────

export const CORRECT_SYSTEM_PROMPT = `너는 한국 주식 테마 분류 검수자다. 주어진 "종목 ↔ 테마" 매핑 각각에 대해, 그 종목이 그 테마에 "명백히 무관" 한지만 판정한다.

규칙:
- 조금이라도 관련 가능성이 있으면 무관으로 판정하지 않는다(보수적 — false positive 회피).
- "명백히 무관"(완전히 다른 업종/맥락) 인 것만 표시한다.
- 추가 편입 제안은 하지 않는다. 오직 제외 후보만.

출력은 반드시 JSON 만. 다른 텍스트 금지:
{"unrelated":["<themeId>::<stockCode>", ...]}
제외할 것이 없으면 {"unrelated":[]}.`;

const CORRECT_FEW_SHOT: Array<{ user: string; assistant: string }> = [
  {
    user: `매핑:
- id=t1 theme="반도체" stock=005930(삼성전자) reason=메모리 반도체 생산
- id=t1 theme="반도체" stock=068270(셀트리온) reason=null`,
    assistant: `{"unrelated":["t1::068270"]}`,
  },
];

/** 교정 user 메시지 — (themeId, themeName, stockCode, reason) 라인. */
export function formatCorrectMessage(
  rows: Array<{
    themeId: string;
    themeName: string;
    stockCode: string;
    reason: string | null;
  }>,
): string {
  const lines = rows
    .map(
      (r) =>
        `- id=${r.themeId} theme="${r.themeName}" stock=${r.stockCode} reason=${r.reason ?? "null"}`,
    )
    .join("\n");
  return `매핑:\n${lines}`;
}

export function buildCorrectFewShot(): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const fs of CORRECT_FEW_SHOT) {
    out.push({ role: "user", content: fs.user });
    out.push({ role: "assistant", content: fs.assistant });
  }
  return out;
}
