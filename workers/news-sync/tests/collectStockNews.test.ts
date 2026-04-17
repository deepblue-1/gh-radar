import { describe, it, expect, vi } from "vitest";
import { collectStockNews } from "../src/naver/collectStockNews";

/**
 * collectStockNews 는 searchNews 를 내부적으로 호출한다.
 * 본 테스트는 axios-compatible client.get 을 mock 해서 page 응답을 차례로 돌려준다.
 */

type Item = {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
};

function mkItem(iso: string, idx = 0): Item {
  // iso 는 ISO UTC → Naver pubDate 는 RFC 822 형식. Date.parse 는 양쪽 모두 수용.
  return {
    title: `t${idx}`,
    originallink: `https://ex.com/${idx}`,
    link: `https://ex.com/${idx}`,
    description: "",
    pubDate: iso,
  };
}

function mkClient(pages: Item[][]) {
  const get = vi.fn((_url: string, _opts: unknown) => {
    const next = pages.shift() ?? [];
    return Promise.resolve({ data: { items: next } });
  });
  return { get } as unknown as Parameters<typeof collectStockNews>[0];
}

describe("collectStockNews — R7 페이지네이션 종료조건", () => {
  it("V-22: 증분 — page2 에서 youngest 가 lastSeen 이하 → cutoff 종료", async () => {
    const lastSeen = "2026-04-16T00:00:00.000Z";
    // page1: 100 items 모두 pubDate > lastSeen
    const page1 = Array.from({ length: 100 }, (_, i) =>
      mkItem("2026-04-17T12:00:00.000Z", i),
    );
    // page2: 50 > lastSeen, 50 <= lastSeen → youngest 중 일부가 컷오프 이하 → hitCutoff=true
    const page2 = [
      ...Array.from({ length: 50 }, (_, i) =>
        mkItem("2026-04-16T12:00:00.000Z", 100 + i),
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        mkItem("2026-04-15T12:00:00.000Z", 200 + i),
      ),
    ];
    const client = mkClient([page1, page2]);

    const res = await collectStockNews(client, "q", {
      lastSeenIso: lastSeen,
      firstCutoffIso: "2026-04-10T00:00:00.000Z",
      onPage: async () => true,
    });

    expect(res.stoppedBy).toBe("cutoff");
    expect(res.pages).toBe(2);
    // page1 의 100 + page2 의 50 = 150 (<= lastSeen 인 50 제외)
    expect(res.items).toHaveLength(150);
  });

  it("V-23: 첫 수집 — firstCutoffIso(7일 전) 컷오프 적용", async () => {
    const firstCutoff = "2026-04-10T00:00:00.000Z"; // 7일 전
    // page1: 50 items > firstCutoff, 50 <= firstCutoff → cutoff 종료
    const page1 = [
      ...Array.from({ length: 50 }, (_, i) =>
        mkItem("2026-04-15T00:00:00.000Z", i),
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        mkItem("2026-04-08T00:00:00.000Z", 50 + i),
      ),
    ];
    const client = mkClient([page1]);

    const res = await collectStockNews(client, "q", {
      lastSeenIso: null,
      firstCutoffIso: firstCutoff,
      onPage: async () => true,
    });

    expect(res.stoppedBy).toBe("cutoff");
    expect(res.pages).toBe(1);
    expect(res.items).toHaveLength(50);
  });

  it("budget: onPage 가 false 반환 → 1 page 후 stoppedBy='budget'", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      mkItem("2026-04-17T12:00:00.000Z", i),
    );
    const client = mkClient([page1]);

    const res = await collectStockNews(client, "q", {
      lastSeenIso: null,
      firstCutoffIso: "2026-04-10T00:00:00.000Z",
      onPage: async () => false,
    });

    expect(res.stoppedBy).toBe("budget");
    expect(res.pages).toBe(1);
  });

  it("API 상한: 10 페이지 연속 full 100-item (cutoff 위) → start>1000 에서 api-limit", async () => {
    const fullPage = () =>
      Array.from({ length: 100 }, (_, i) =>
        mkItem("2026-04-17T12:00:00.000Z", i),
      );
    const pages = Array.from({ length: 10 }, fullPage);
    const client = mkClient(pages);

    const res = await collectStockNews(client, "q", {
      lastSeenIso: null,
      firstCutoffIso: "2026-04-10T00:00:00.000Z",
      onPage: async () => true,
    });

    expect(res.stoppedBy).toBe("api-limit");
    expect(res.pages).toBe(10);
    expect(res.items).toHaveLength(1000);
  });

  it("empty 페이지 (items=0) → stoppedBy='empty'", async () => {
    const client = mkClient([[]]);
    const res = await collectStockNews(client, "q", {
      lastSeenIso: null,
      firstCutoffIso: "2026-04-10T00:00:00.000Z",
      onPage: async () => true,
    });
    expect(res.stoppedBy).toBe("empty");
    expect(res.pages).toBe(1);
    expect(res.items).toHaveLength(0);
  });

  it("short 페이지 (items<100) → stoppedBy='empty' (마지막 페이지)", async () => {
    const page1 = Array.from({ length: 30 }, (_, i) =>
      mkItem("2026-04-17T12:00:00.000Z", i),
    );
    const client = mkClient([page1]);
    const res = await collectStockNews(client, "q", {
      lastSeenIso: null,
      firstCutoffIso: "2026-04-10T00:00:00.000Z",
      onPage: async () => true,
    });
    expect(res.stoppedBy).toBe("empty");
    expect(res.pages).toBe(1);
    expect(res.items).toHaveLength(30);
  });
});
