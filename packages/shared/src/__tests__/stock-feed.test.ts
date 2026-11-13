import { describe, it, expect } from "vitest";
import {
  NAVER_SOURCE_FALLBACK,
  SAME_ARTICLE_WINDOW_MS,
  TITLE_PREFIX_MIN_CHARS,
  isSameArticle,
  mergeStockFeed,
  newsTitleKey,
  STOCK_FEED_MIN_DISCLOSURES,
  stockFeedPerSource,
  takeFeedWithDisclosures,
  toKstOffsetIso,
  type StockFeedRpcKisRow,
  type StockFeedRpcNaverRow,
} from "../stock-feed";

// Phase 41 D-12 · D-13 · D-14 · D-20 · 리서치 뒤 확정 「앞부분 일치」 — 같은 기사 합치기 규칙의 단일 정의.

const H = 3600_000;
/** KST 벽시계 → RPC 가 주는 UTC 오프셋 ISO. */
const at = (kst: string) => new Date(Date.parse(`${kst}+09:00`)).toISOString();

let seq = 0;
function kis(title: string, writtenKst: string, over: Partial<StockFeedRpcKisRow> = {}): StockFeedRpcKisRow {
  seq += 1;
  return {
    srno: `2026111200000${String(seq).padStart(5, "0")}`,
    kind: "news",
    source: "연합뉴스",
    title,
    title_key: newsTitleKey(title),
    written_at: at(writtenKst),
    received_at: at(writtenKst),
    codes: ["005930"],
    ...over,
  };
}
function naver(title: string, publishedKst: string, over: Partial<StockFeedRpcNaverRow> = {}): StockFeedRpcNaverRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    title,
    description: `${title} 요약`,
    source: "한국경제",
    url: `https://example.invalid/${seq}`,
    published_at: at(publishedKst),
    created_at: at(publishedKst),
    ...over,
  };
}

// 실측 표본(reference/kis-news-title-probe-result.json) — 한투 제목은 길이 상한에서 잘린다 · 정정 공시는 제목 앞에 「(정정)」.
const TRUNCATED_KIS = '[단독] 삼성 사장단, 올트먼 만남 이후... 자필 메시지로 "AI 대전환 결의" [오픈AI,';
const TRUNCATED_NAVER_FULL = '[단독] 삼성 사장단, 올트먼 만남 이후... 자필 메시지로 "AI 대전환 결의" [오픈AI, 삼성 협력 확대]';
const CORRECTION = "(주)서진시스템 (정정)최대주주 변경을 수반하는 주식 담보제공 계약 체결";
const ORIGINAL = "(주)서진시스템 최대주주 변경을 수반하는 주식 담보제공 계약 체결";

describe("newsTitleKey", () => {
  it("따옴표 · 말줄임(… / ...) · 쉼표 · 공백 차이를 무시한다", () => {
    expect(newsTitleKey("삼성전자, “AI 반도체” 수혜… 강세")).toBe(newsTitleKey("삼성전자 AI반도체 수혜...강세"));
  });

  it("영문 대소문자 무시 · 한자 · 숫자는 남기고 괄호 · 홑따옴표는 뺀다", () => {
    expect(newsTitleKey("韓 증시 ‘KOSPI’ (2,500) 돌파")).toBe("韓증시kospi2500돌파");
  });
});

describe("isSameArticle", () => {
  const k = (title: string, hoursFromNoon = 0) => ({ key: newsTitleKey(title), at: Date.parse("2026-11-12T12:00:00+09:00") + hoursFromNoon * H });

  it("키가 같고 시각이 가까우면 같은 기사", () => {
    expect(isSameArticle(k("삼성전자, “AI 반도체” 수혜… 강세"), k("삼성전자 AI반도체 수혜...강세", 1))).toBe(true);
  });

  it("짧은 키 15자 이상 · 긴 키의 앞부분 · 12시간 이내면 같은 기사(잘린 한투 제목)", () => {
    expect(newsTitleKey(TRUNCATED_KIS).length).toBeGreaterThanOrEqual(TITLE_PREFIX_MIN_CHARS);
    expect(isSameArticle(k(TRUNCATED_KIS), k(TRUNCATED_NAVER_FULL, 2))).toBe(true);
    expect(isSameArticle(k(TRUNCATED_NAVER_FULL, 2), k(TRUNCATED_KIS))).toBe(true);
  });

  it("14자 앞부분은 같은 기사가 아니다", () => {
    const short = "가나다라마바사아자차카타파하"; // 14자
    expect(newsTitleKey(short)).toHaveLength(TITLE_PREFIX_MIN_CHARS - 1);
    expect(isSameArticle(k(short), k(`${short} 그리고 더 긴 제목`))).toBe(false);
  });

  it("정확히 15자 앞부분은 같은 기사", () => {
    const fifteen = "가나다라마바사아자차카타파하거"; // 15자
    expect(isSameArticle(k(fifteen), k(`${fifteen} 그리고 더 긴 제목`))).toBe(true);
  });

  it("앞부분이어도 13시간 차이면 같은 기사가 아니다", () => {
    expect(isSameArticle(k(TRUNCATED_KIS), k(TRUNCATED_NAVER_FULL, 13))).toBe(false);
  });

  it("12시간 정각 차이는 같은 기사(경계 포함)", () => {
    expect(SAME_ARTICLE_WINDOW_MS).toBe(12 * H);
    expect(isSameArticle(k(TRUNCATED_KIS), k(TRUNCATED_NAVER_FULL, 12))).toBe(true);
  });

  it("매일 같은 제목(「[표] 외국인 순매수 상위」)이 다른 날이면 같은 기사가 아니다", () => {
    expect(isSameArticle(k("[표] 외국인 순매수 상위"), k("[표] 외국인 순매수 상위", 24))).toBe(false);
  });

  it("「(정정)」 공시는 원 공시와 키가 달라 같은 기사가 아니다", () => {
    expect(newsTitleKey(CORRECTION)).not.toBe(newsTitleKey(ORIGINAL));
    expect(isSameArticle(k(CORRECTION), k(ORIGINAL))).toBe(false);
  });

  it("빈 키는 어떤 것과도 같은 기사가 아니다", () => {
    expect(isSameArticle(k("…"), k("..."))).toBe(false);
  });
});

describe("mergeStockFeed", () => {
  it("빈 입력 → []", () => {
    expect(mergeStockFeed([], [])).toEqual([]);
  });

  it("네이버 출처가 null 이면 「네이버 뉴스」(D-20)", () => {
    const [item] = mergeStockFeed([], [naver("삼성전자 강세", "2026-11-12T09:00:00", { source: null })]);
    expect(item!.source).toBe(NAVER_SOURCE_FALLBACK);
  });

  it("합친 줄 — 시각은 이른 쪽 · url · 요약문은 네이버 · 자료원 · kind · 종목은 한투", () => {
    const k1 = kis("삼성전자, “AI 반도체” 수혜… 강세", "2026-11-12T09:05:00", { kind: "news", source: "연합뉴스", codes: ["000660", "005930"] });
    const n1 = naver("삼성전자 AI반도체 수혜...강세", "2026-11-12T09:01:00", { source: "한국경제" });
    const out = mergeStockFeed([k1], [n1]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "news",
      publishedAt: "2026-11-12T09:01:00.000+09:00",
      title: k1.title,
      source: "연합뉴스",
      stockCodes: ["000660", "005930"],
      url: n1.url,
      description: n1.description,
    });
  });

  it("잘린 한투 제목과 네이버 전체 제목은 한 줄로 합친다", () => {
    const out = mergeStockFeed([kis(TRUNCATED_KIS, "2026-11-12T10:00:00")], [naver(TRUNCATED_NAVER_FULL, "2026-11-12T10:03:00")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).not.toBeNull();
  });

  it("id 불변 — 한투가 먼저 받았으면 네이버 링크가 늦게 붙어도 id 는 kis:<srno>", () => {
    const k1 = kis("가람전자 대형 공급계약 수주에 강세", "2026-11-12T09:10:00");
    const first = mergeStockFeed([k1], []);
    const n1 = naver("가람전자, 대형 공급계약 수주에 강세", "2026-11-12T09:12:00", { created_at: at("2026-11-12T09:16:00") });
    const later = mergeStockFeed([k1], [n1]);
    expect(later).toHaveLength(1);
    expect(later[0]!.id).toBe(first[0]!.id);
    expect(later[0]!.id).toBe(`kis:${k1.srno}`);
    expect(later[0]!.url).toBe(n1.url);
  });

  it("id 는 받은 시각이 이른 쪽 — 네이버를 먼저 받았으면 naver:<id>", () => {
    const n1 = naver("가람전자 대형 공급계약 수주에 강세", "2026-11-12T09:00:00", { created_at: at("2026-11-12T09:02:00") });
    const k1 = kis("가람전자 대형 공급계약 수주에 강세", "2026-11-12T09:01:00", { received_at: at("2026-11-12T09:03:00") });
    const out = mergeStockFeed([k1], [n1]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(`naver:${n1.id}`);
    expect(out[0]!.receivedAt).toBe("2026-11-12T09:02:00.000+09:00");
  });

  it("네이버 1건은 한투 1건과만 합친다 — 한투를 시각 내림차순으로 훑어 첫 짝", () => {
    const older = kis("가람전자 대형 공급계약 수주에 강세", "2026-11-12T08:00:00", { source: "뉴스핌" });
    const newer = kis("가람전자 대형 공급계약 수주에 강세", "2026-11-12T09:00:00", { source: "연합뉴스" });
    const n1 = naver("가람전자 대형 공급계약 수주에 강세", "2026-11-12T09:30:00");
    const out = mergeStockFeed([older, newer], [n1]);
    expect(out).toHaveLength(2);
    const withUrl = out.filter((i) => i.url !== null);
    expect(withUrl).toHaveLength(1);
    expect(withUrl[0]!.source).toBe("연합뉴스");
  });

  it("한투끼리 · 네이버끼리는 합치지 않는다", () => {
    const out = mergeStockFeed(
      [kis("같은 제목의 한투 기사 두 건입니다", "2026-11-12T09:00:00"), kis("같은 제목의 한투 기사 두 건입니다", "2026-11-12T09:01:00")],
      [naver("같은 제목의 네이버 기사 두 건입니다", "2026-11-12T09:00:00"), naver("같은 제목의 네이버 기사 두 건입니다", "2026-11-12T09:01:00")],
    );
    expect(out).toHaveLength(4);
  });

  it("「(정정)」 공시는 원 공시와 다른 줄 — 네이버 기사는 원 공시와만 합친다", () => {
    const orig = kis(ORIGINAL, "2026-11-12T15:00:00", { kind: "disclosure", source: "코스닥 공시" });
    const corr = kis(CORRECTION, "2026-11-12T15:30:00", { kind: "disclosure", source: "코스닥 공시" });
    const n1 = naver(ORIGINAL, "2026-11-12T15:10:00");
    const out = mergeStockFeed([orig, corr], [n1]);
    expect(out).toHaveLength(2);
    expect(out.find((i) => i.title === CORRECTION)!.url).toBeNull();
    expect(out.find((i) => i.title === ORIGINAL)!.url).toBe(n1.url);
  });

  it("다른 날 같은 제목은 합치지 않는다", () => {
    const out = mergeStockFeed([kis("[표] 외국인 순매수 상위", "2026-11-12T16:00:00")], [naver("[표] 외국인 순매수 상위", "2026-11-11T16:00:00")]);
    expect(out).toHaveLength(2);
  });

  it("정렬 — 시각 내림차순 · 같은 시각이면 공시 먼저 · 그다음 id 오름차순", () => {
    const news = kis("같은 시각 뉴스 제목입니다 아주 길게", "2026-11-12T09:00:00", { kind: "news", srno: "B" });
    const disc = kis("같은 시각 공시 제목입니다 아주 길게", "2026-11-12T09:00:00", { kind: "disclosure", srno: "Z" });
    const news2 = kis("같은 시각 다른 뉴스 제목 아주 길게", "2026-11-12T09:00:00", { kind: "news", srno: "A" });
    const latest = naver("가장 최근 네이버 기사 제목입니다", "2026-11-12T09:30:00");
    const out = mergeStockFeed([news, disc, news2], [latest]);
    expect(out.map((i) => i.id)).toEqual([`naver:${latest.id}`, "kis:Z", "kis:A", "kis:B"]);
  });
});

describe("toKstOffsetIso · stockFeedPerSource", () => {
  it("UTC 자정 → 같은 날 09:00+09:00 · 밀리초 유지", () => {
    expect(toKstOffsetIso("2026-11-12T00:00:00.123Z")).toBe("2026-11-12T09:00:00.123+09:00");
    expect(toKstOffsetIso(new Date("2026-11-12T15:30:00Z"))).toBe("2026-11-13T00:30:00.000+09:00");
  });

  it("읽을 수 없는 시각은 throw", () => {
    expect(() => toKstOffsetIso("not-a-date")).toThrow();
  });

  it("출처별 행 수 — limit + 10 · 상한 110", () => {
    expect(stockFeedPerSource(1)).toBe(11);
    expect(stockFeedPerSource(100)).toBe(110);
  });
});

describe("takeFeedWithDisclosures — 뉴스에 밀린 공시 따로 보장 (gh-trade 인박스 261113)", () => {
  const disc = (title: string, kst: string) => kis(title, kst, { kind: "disclosure", source: "거래소 공시" });
  const feed = () =>
    mergeStockFeed(
      [
        disc("금호건설(주) 단일판매ㆍ공급계약체결", "2026-11-12T17:36:54"),
        disc("금호건설(주) 기타 공시 1", "2026-11-12T16:00:00"),
        disc("금호건설(주) 기타 공시 2", "2026-11-12T15:00:00"),
        disc("금호건설(주) 기타 공시 3", "2026-11-12T14:00:00"),
        kis("금호건설 상한가 기사 1", "2026-11-12T23:00:00"),
        kis("금호건설 상한가 기사 2", "2026-11-12T22:00:00"),
      ],
      [naver("금호건설 수주 기사", "2026-11-12T21:00:00"), naver("금호건설 강세 기사", "2026-11-12T20:00:00")],
    );

  it("보장 수는 3", () => {
    expect(STOCK_FEED_MIN_DISCLOSURES).toBe(3);
  });

  it("limit=3 — 뉴스 3줄 뒤에 최신 공시 3건이 최신순으로 붙는다(넷째 공시는 안 붙음)", () => {
    const out = takeFeedWithDisclosures(feed(), 3, 3);
    expect(out.map((i) => i.title)).toEqual([
      "금호건설 상한가 기사 1",
      "금호건설 상한가 기사 2",
      "금호건설 수주 기사",
      "금호건설(주) 단일판매ㆍ공급계약체결",
      "금호건설(주) 기타 공시 1",
      "금호건설(주) 기타 공시 2",
    ]);
    const times = out.map((i) => Date.parse(i.publishedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("앞 limit 줄에 이미 든 공시는 다시 붙이지 않는다", () => {
    const out = takeFeedWithDisclosures(feed(), 5, 3);
    expect(out).toHaveLength(7);
    expect(new Set(out.map((i) => i.id)).size).toBe(7);
    expect(out.filter((i) => i.kind === "disclosure")).toHaveLength(3);
  });

  it("공시가 없거나 보장 0 이면 앞 limit 줄 그대로", () => {
    const newsOnly = mergeStockFeed([kis("기사 A", "2026-11-12T10:00:00")], [naver("기사 B", "2026-11-12T09:00:00")]);
    expect(takeFeedWithDisclosures(newsOnly, 1, 3).map((i) => i.title)).toEqual(["기사 A"]);
    expect(takeFeedWithDisclosures(feed(), 2, 0)).toHaveLength(2);
    expect(takeFeedWithDisclosures([], 20, 3)).toEqual([]);
  });
});

