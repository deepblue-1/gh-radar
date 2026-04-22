/**
 * Phase 08.1 — Claude Haiku 4.5 분류 프롬프트.
 *
 * approved plan D7:
 *  - 고정 system prompt
 *  - 4 카테고리 정의 + few-shot 3개
 *  - input ≤ 1500 토큰 가정
 *  - max_tokens=10 (라벨만)
 *  - temperature=0
 */
export const CLASSIFY_SYSTEM_PROMPT = `한국 주식 종목토론방 글을 다음 4개 라벨 중 하나로 분류해라. price_reason(가격 움직임 이유·차트·수급), theme(테마·업종·정책 언급), news_info(뉴스 인용·공시·실적 사실), noise(욕설·감탄사·뇌피셜·광고·단순 반응). 출력은 라벨 단어 하나만.`;

const FEW_SHOT: Array<{ title: string; body: string; label: string }> = [
  {
    title: "실적 서프라이즈 — 영업이익 35% 증가",
    body: "금일 공시된 1분기 실적, 컨센 대비 35% 초과 달성. 매출도 전년 대비 12% 증가.",
    label: "news_info",
  },
  {
    title: "2차전지 섹터 로테이션 지속",
    body: "정책 수혜 테마가 돌면서 관련 업종으로 자금 유입. LG엔솔/포스코퓨처엠 동반 강세.",
    label: "theme",
  },
  {
    title: "ㅋㅋㅋ 또 떨어지네",
    body: "",
    label: "noise",
  },
];

/** User 메시지 포맷터 — body 500자 truncate. */
export function formatUserMessage(title: string, body: string | null): string {
  const b = (body ?? "").slice(0, 500);
  return `제목: ${title}\n본문: ${b}`;
}

/** few-shot 을 대화 형식으로 전개 — messages.create 의 messages[] 앞에 prepend. */
export function buildFewShotMessages(): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const fs of FEW_SHOT) {
    out.push({ role: "user", content: formatUserMessage(fs.title, fs.body) });
    out.push({ role: "assistant", content: fs.label });
  }
  return out;
}
