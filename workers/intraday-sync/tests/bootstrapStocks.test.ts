import { describe, it, expect, vi } from "vitest";
import {
  bootstrapMissingStocks,
  UNCLASSIFIED_SECURITY_GROUP,
} from "../src/pipeline/bootstrapStocks";

/** index.ts 의 rebuildTopMovers 화이트리스트 사본 — sentinel 이 여기 없어야 한다. */
const ELIGIBLE_SECGROUPS = new Set([
  "주권",
  "외국주권",
  "주식예탁증권",
  "부동산투자회사",
  "투자회사",
  "사회간접자본투융자회사",
]);

describe("bootstrapMissingStocks", () => {
  it("빈 입력 → 0 inserted", async () => {
    const supabase = { from: vi.fn() } as unknown as Parameters<typeof bootstrapMissingStocks>[0];
    const out = await bootstrapMissingStocks(supabase, []);
    expect(out.inserted).toBe(0);
    expect((supabase as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("dedupe by code + _AL strip + 잘못된 코드 skip", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null, count: 2 });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as Parameters<typeof bootstrapMissingStocks>[0];

    const rows = [
      { stk_cd: "005930_AL", stk_nm: "삼성전자", cur_prc: "+70000" },
      { stk_cd: "005930_AL", stk_nm: "삼성전자", cur_prc: "+70100" }, // dup
      { stk_cd: "035720_AL", stk_nm: "카카오", cur_prc: "+45000" },
      // 영문 포함 단축코드(KRX 2025~ 숫자 소진분) — bootstrap 대상이어야 한다
      { stk_cd: "0011T0_AL", stk_nm: "채비", cur_prc: "+4695" },
      { stk_cd: "INVALID_AL", stk_nm: "잘못", cur_prc: "+1000" }, // skip (7자)
      { stk_cd: "0011t0_AL", stk_nm: "소문자", cur_prc: "+1000" }, // skip (소문자)
      { stk_cd: "12345_AL", stk_nm: "다섯자", cur_prc: "+1000" }, // skip (5자)
    ];
    const out = await bootstrapMissingStocks(
      supabase,
      rows as unknown as Parameters<typeof bootstrapMissingStocks>[1],
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ code: "005930", name: "삼성전자" }),
        expect.objectContaining({ code: "035720" }),
        expect.objectContaining({ code: "0011T0", name: "채비" }),
      ]),
      expect.objectContaining({ onConflict: "code", ignoreDuplicates: true }),
    );
    // payload size = 3 (dedupe + invalid 3건 skip)
    const payload = upsert.mock.calls[0][0] as Array<{ code: string }>;
    expect(payload).toHaveLength(3);
    expect(payload.map((p) => p.code).sort()).toEqual(["0011T0", "005930", "035720"].sort());
    expect(out.inserted).toBe(2);
  });

  // 2026-09-08 회귀: 영문코드 ETF 297종이 마스터에 없어 bootstrap 이 '주권' 으로 등록 →
  // rebuildTopMovers 화이트리스트를 통과해 SK하이닉스 단일종목 레버리지 ETF 가 스캐너
  // 급등 목록에 올라갔다. bootstrap 은 분류하지 않는다 — sentinel 로 배제 상태를 유지한다.
  it("미확인 종목은 '주권' 이 아니라 sentinel 로 등록 — top_movers 화이트리스트 배제", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null, count: 1 });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as Parameters<typeof bootstrapMissingStocks>[0];

    await bootstrapMissingStocks(
      supabase,
      [
        // 실제 유입 사례: 영문코드 ETF. 이름만으로는 ETF 인지 알 수 없다는 것이 요점이다.
        { stk_cd: "0193T0_AL", stk_nm: "KODEX SK하이닉스단일종목레버리지", cur_prc: "+12000" },
      ] as unknown as Parameters<typeof bootstrapMissingStocks>[1],
    );

    const payload = upsert.mock.calls[0][0] as Array<{ security_group: string }>;
    expect(payload[0].security_group).toBe(UNCLASSIFIED_SECURITY_GROUP);
    expect(payload[0].security_group).not.toBe("주권");
    expect(ELIGIBLE_SECGROUPS.has(payload[0].security_group)).toBe(false);
    // ETP 계열로도 오분류하지 않는다 — 모르면 모른다고 둔다.
    expect(["ETF", "ETN", "ELW"]).not.toContain(payload[0].security_group);
  });

  it("error 시 throw", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: new Error("supabase down") });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as Parameters<typeof bootstrapMissingStocks>[0];
    await expect(
      bootstrapMissingStocks(
        supabase,
        [{ stk_cd: "005930_AL", stk_nm: "x", cur_prc: "+1" }] as unknown as Parameters<
          typeof bootstrapMissingStocks
        >[1],
      ),
    ).rejects.toThrow(/supabase down/);
  });
});
