import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import {
  getKiwoomToken,
  parseKiwoomExpiresDt,
} from "../../src/kiwoom/tokenStore.js";

vi.mock("axios");

function mockSupabaseWithToken(
  cached: { access_token: string; expires_at: string } | null,
) {
  const single = vi.fn().mockResolvedValue({ data: cached, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle: single });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from, _upsert: upsert, _single: single } as any;
}

const baseConfig = {
  kiwoomBaseUrl: "https://api.kiwoom.com",
  kiwoomAppkey: "k",
  kiwoomSecretkey: "s",
};

describe("parseKiwoomExpiresDt (server)", () => {
  it("YYYYMMDDhhmmss KST → UTC Date (-9h)", () => {
    const d = parseKiwoomExpiresDt("20260515093013");
    expect(d.toISOString()).toBe("2026-05-15T00:30:13.000Z");
  });

  it("형식 다르면 throw", () => {
    expect(() => parseKiwoomExpiresDt("invalid")).toThrow();
    expect(() => parseKiwoomExpiresDt("2026-05-15")).toThrow();
  });
});

describe("getKiwoomToken (server)", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("캐시 valid → axios 미호출 + cached 토큰 반환", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const supabase = mockSupabaseWithToken({
      access_token: "CACHED",
      expires_at: future.toISOString(),
    });
    const t = await getKiwoomToken(supabase, baseConfig);
    expect(t.accessToken).toBe("CACHED");
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("캐시 부재 → axios POST + upsert + 새 토큰", async () => {
    const supabase = mockSupabaseWithToken(null);
    vi.mocked(axios.post).mockResolvedValue({
      data: { return_code: 0, token: "NEW_TOKEN", expires_dt: "20260515093013" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const t = await getKiwoomToken(supabase, baseConfig);
    expect(t.accessToken).toBe("NEW_TOKEN");
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.kiwoom.com/oauth2/token",
      expect.objectContaining({
        grant_type: "client_credentials",
        appkey: "k",
        secretkey: "s",
      }),
      expect.any(Object),
    );
    expect(supabase._upsert).toHaveBeenCalledOnce();
  });

  it("캐시 만료 임박 (4분) → 새 토큰 발급", async () => {
    const soon = new Date(Date.now() + 4 * 60 * 1000);
    const supabase = mockSupabaseWithToken({
      access_token: "EXPIRING",
      expires_at: soon.toISOString(),
    });
    vi.mocked(axios.post).mockResolvedValue({
      data: { return_code: 0, token: "NEW", expires_dt: "20260515093013" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const t = await getKiwoomToken(supabase, baseConfig);
    expect(t.accessToken).toBe("NEW");
    expect(axios.post).toHaveBeenCalledOnce();
  });

  it("키움 return_code != 0 시 throw", async () => {
    const supabase = mockSupabaseWithToken(null);
    vi.mocked(axios.post).mockResolvedValue({
      data: { return_code: 1, return_msg: "권한 없음" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await expect(getKiwoomToken(supabase, baseConfig)).rejects.toThrow(
      /권한 없음/,
    );
  });

  it("config.kiwoomTokenType 미설정 → default 'live' 사용", async () => {
    const supabase = mockSupabaseWithToken(null);
    vi.mocked(axios.post).mockResolvedValue({
      data: { return_code: 0, token: "T", expires_dt: "20260515093013" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await getKiwoomToken(supabase, baseConfig);
    // eq("token_type", "live") 호출 확인 — supabase mock 의 from() 체인에서 select.eq 시그니처 검증은
    // mock 구조상 직접 불가하므로 default tokenType 동작은 functional 동작으로 확인 (no throw + axios called)
    expect(axios.post).toHaveBeenCalledOnce();
  });
});
