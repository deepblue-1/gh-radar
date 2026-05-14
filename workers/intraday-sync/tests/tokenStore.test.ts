import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { getKiwoomToken, parseKiwoomExpiresDt } from "../src/kiwoom/tokenStore";
import oauthFixture from "./fixtures/oauth-token.json";

vi.mock("axios");

function mockSupabaseWithToken(cached: { access_token: string; expires_at: string } | null) {
  const single = vi.fn().mockResolvedValue({ data: cached, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle: single });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ select, upsert });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from, _single: single, _upsert: upsert } as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseConfig: any = {
  kiwoomBaseUrl: "https://api.kiwoom.com",
  kiwoomAppkey: "appkey",
  kiwoomSecretkey: "secretkey",
  kiwoomTokenType: "live",
};

describe("parseKiwoomExpiresDt", () => {
  it("YYYYMMDDhhmmss KST → UTC Date", () => {
    const d = parseKiwoomExpiresDt("20260515093013");
    expect(d.toISOString()).toBe("2026-05-15T00:30:13.000Z");
  });

  it("형식 다르면 throw", () => {
    expect(() => parseKiwoomExpiresDt("invalid")).toThrow();
    expect(() => parseKiwoomExpiresDt("2026-05-15")).toThrow();
  });
});

describe("getKiwoomToken", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("캐시에 만료 1시간 남은 token 있으면 axios 미호출 + cached 반환", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const supabase = mockSupabaseWithToken({
      access_token: "CACHED",
      expires_at: future.toISOString(),
    });
    const tok = await getKiwoomToken(supabase, baseConfig);
    expect(tok.accessToken).toBe("CACHED");
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("캐시 부재 시 axios POST + upsert + 새 토큰 반환", async () => {
    const supabase = mockSupabaseWithToken(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(axios.post).mockResolvedValue({ data: oauthFixture } as any);
    const tok = await getKiwoomToken(supabase, baseConfig);
    expect(tok.accessToken).toBe(oauthFixture.token);
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.kiwoom.com/oauth2/token",
      expect.objectContaining({
        grant_type: "client_credentials",
        appkey: "appkey",
        secretkey: "secretkey",
      }),
      expect.any(Object),
    );
    expect(supabase._upsert).toHaveBeenCalledOnce();
  });

  it("캐시 만료 임박 (4분 남음) 시 새 토큰 발급", async () => {
    const soon = new Date(Date.now() + 4 * 60 * 1000);
    const supabase = mockSupabaseWithToken({
      access_token: "EXPIRING",
      expires_at: soon.toISOString(),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(axios.post).mockResolvedValue({ data: oauthFixture } as any);
    const tok = await getKiwoomToken(supabase, baseConfig);
    expect(tok.accessToken).toBe(oauthFixture.token);
    expect(axios.post).toHaveBeenCalledOnce();
  });

  it("키움 return_code != 0 시 throw", async () => {
    const supabase = mockSupabaseWithToken(null);
    vi.mocked(axios.post).mockResolvedValue({
      data: { return_code: 1, return_msg: "권한 없음" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await expect(getKiwoomToken(supabase, baseConfig)).rejects.toThrow(/권한 없음/);
  });
});
