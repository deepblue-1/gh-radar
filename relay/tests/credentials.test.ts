/**
 * Phase 15 Plan 04 — RELAY-01. 자격증명 복호 + 토큰 검증 단위 테스트.
 *
 * 검증 대상은 **실패가 확정되는가**다. AES-GCM 을 쓰는 이유가 "복호는 됐는데 값이
 * 이상하다"를 없애는 것이므로, 키 불일치·AAD(user_id) 불일치·본문 변조 3종이 전부
 * 예외로 끝나는지를 못박는다 (T-15-05).
 *
 * `getDmaCredentials` 는 **행 없음(null)** 과 **조회 실패(throw)** 를 구분해야 한다 —
 * 전자는 "권한 없음"(D-12)이고 후자는 장애다. 둘을 같은 화면으로 만들면 원인을 못 찾는다(S-5).
 */
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createAccessCredentials,
  decryptDmaPassword,
  encryptDmaPassword,
  getDmaCredentials,
  getDmaCredentialsByDmaUser,
  type AccessLookup,
} from "../src/store/credentials.js";
import type { AppAccessEntry } from "../src/access/app-access.js";
import { verifyToken } from "../src/auth/verify-token.js";
import { logger } from "../src/logger.js";

const USER_ID = "3f1c2b7a-9d40-4a11-8e55-000000000001";
const OTHER_USER_ID = "3f1c2b7a-9d40-4a11-8e55-000000000002";
const PASSWORD = "kb-dma-p@ssw0rd-절대노출금지";

function newKey(): string {
  return randomBytes(32).toString("base64");
}

/** `from().select().eq().maybeSingle()` 체인만 흉내 내는 최소 스텁. */
function fakeDbClient(result: { data: unknown; error: unknown }): SupabaseClient {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
}

/** `auth.getUser` 만 흉내 내는 최소 스텁. */
function fakeAuthClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    auth: { getUser: vi.fn().mockResolvedValue(result) },
  } as unknown as SupabaseClient;
}

describe("decryptDmaPassword / encryptDmaPassword", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("① 같은 키·같은 user_id 면 왕복이 일치한다", () => {
    const key = newKey();
    const enc = encryptDmaPassword(PASSWORD, USER_ID, key);

    expect(decryptDmaPassword(enc, USER_ID, key)).toBe(PASSWORD);
    // 저장 포맷은 base64(nonce 12B + tag 16B + ct) 다.
    expect(Buffer.from(enc, "base64").length).toBeGreaterThanOrEqual(12 + 16 + 1);
    // 암호문 어디에도 평문이 그대로 들어 있지 않다.
    expect(enc).not.toContain(PASSWORD);
  });

  it("② 다른 user_id 로 복호하면 AAD 불일치로 실패한다 (행 이동 공격 차단)", () => {
    const key = newKey();
    const enc = encryptDmaPassword(PASSWORD, USER_ID, key);

    expect(() => decryptDmaPassword(enc, OTHER_USER_ID, key)).toThrow();
  });

  it("③ 다른 키로 복호하면 실패한다", () => {
    const enc = encryptDmaPassword(PASSWORD, USER_ID, newKey());

    expect(() => decryptDmaPassword(enc, USER_ID, newKey())).toThrow();
  });

  it("④ 암호문을 1바이트만 바꿔도 tag 검증에서 실패한다", () => {
    const key = newKey();
    const blob = Buffer.from(encryptDmaPassword(PASSWORD, USER_ID, key), "base64");
    // 마지막 바이트(=ciphertext 끝)를 뒤집는다.
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 0xff;

    expect(() => decryptDmaPassword(blob.toString("base64"), USER_ID, key)).toThrow();
  });

  it("⑤ 같은 평문을 두 번 암호화하면 결과가 다르다 (nonce 재사용 없음)", () => {
    const key = newKey();
    const a = encryptDmaPassword(PASSWORD, USER_ID, key);
    const b = encryptDmaPassword(PASSWORD, USER_ID, key);

    expect(a).not.toBe(b);
    // nonce(앞 12B)가 실제로 다르다.
    expect(Buffer.from(a, "base64").subarray(0, 12).equals(Buffer.from(b, "base64").subarray(0, 12)))
      .toBe(false);
    // 그래도 둘 다 같은 평문으로 풀린다.
    expect(decryptDmaPassword(a, USER_ID, key)).toBe(PASSWORD);
    expect(decryptDmaPassword(b, USER_ID, key)).toBe(PASSWORD);
  });

  it("⑥ 길이가 어긋난 키는 사용 시점에 즉시 거부한다", () => {
    const shortKey = randomBytes(16).toString("base64");

    expect(() => encryptDmaPassword(PASSWORD, USER_ID, shortKey)).toThrow(/32바이트/);
  });

  it("⑦ 너무 짧은 암호문은 복호 전에 거부한다", () => {
    expect(() => decryptDmaPassword(randomBytes(20).toString("base64"), USER_ID, newKey())).toThrow(
      /너무 짧습니다/,
    );
  });
});

describe("getDmaCredentials", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("⑧ 매핑 행이 있으면 복호된 자격증명을 돌려준다", async () => {
    const key = newKey();
    const client = fakeDbClient({
      data: {
        dma_user_id: "kbdma-login",
        dma_password_enc: encryptDmaPassword(PASSWORD, USER_ID, key),
      },
      error: null,
    });

    await expect(getDmaCredentials(client, USER_ID, key)).resolves.toEqual({
      dmaUserId: "kbdma-login",
      password: PASSWORD,
    });
  });

  it("⑨ 매핑 행이 없으면 null 이다 (allowlist 미포함 — 오류가 아니다)", async () => {
    const client = fakeDbClient({ data: null, error: null });

    await expect(getDmaCredentials(client, USER_ID, newKey())).resolves.toBeNull();
  });

  it("⑩ 조회가 실패하면 logger.error 후 throw 한다 (조용한 null 금지)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const dbError = new Error("PostgREST 연결 실패");
    const client = fakeDbClient({ data: null, error: dbError });

    await expect(getDmaCredentials(client, USER_ID, newKey())).rejects.toBe(dbError);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("⑪ 저장된 암호문이 다른 사용자 것이면 복호 실패로 확정된다 (행 이동 방어)", async () => {
    const key = newKey();
    const client = fakeDbClient({
      data: {
        dma_user_id: "kbdma-login",
        // 다른 사용자 AAD 로 암호화된 값이 이 행에 들어 있는 상황.
        dma_password_enc: encryptDmaPassword(PASSWORD, OTHER_USER_ID, key),
      },
      error: null,
    });

    await expect(getDmaCredentials(client, USER_ID, key)).rejects.toThrow();
  });
});

/** `from(table).select(cols).eq(col, val).maybeSingle()` 를 기록하는 스텁 — 새 표 조회 모양을 잠근다. */
function recordingDbClient(result: { data: unknown; error: unknown }): {
  client: SupabaseClient;
  calls: Array<{ table: string; select: string; column: string; value: string }>;
} {
  const calls: Array<{ table: string; select: string; column: string; value: string }> = [];
  const client = {
    from: (table: string) => ({
      select: (select: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => {
            calls.push({ table, select, column, value });
            return Promise.resolve(result);
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("Phase 29 AAD = dma_user_id (D-19)", () => {
  const DMA_ID = "dmaA";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("⑯ AAD = dmaUserId 로 암호화한 dma_users 행 → 평문 · 조회는 dma_users.dma_user_id 한 줄", async () => {
    const key = newKey();
    const { client, calls } = recordingDbClient({
      data: { dma_user_id: DMA_ID, password_enc: encryptDmaPassword(PASSWORD, DMA_ID, key) },
      error: null,
    });

    await expect(getDmaCredentialsByDmaUser(client, DMA_ID, key)).resolves.toEqual({ dmaUserId: DMA_ID, password: PASSWORD });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("dma_users");
    expect(calls[0]?.select.split(",").map((c) => c.trim()).sort()).toEqual(["dma_user_id", "password_enc"]);
    expect(calls[0]?.column).toBe("dma_user_id");
    expect(calls[0]?.value).toBe(DMA_ID);
  });

  it("⑰ 옛 형식(AAD = 웹 user_id)으로 암호화된 행은 복호 실패로 throw 한다(이관 없이 섞이지 않는다)", async () => {
    const key = newKey();
    const { client } = recordingDbClient({
      data: { dma_user_id: DMA_ID, password_enc: encryptDmaPassword(PASSWORD, USER_ID, key) },
      error: null,
    });

    await expect(getDmaCredentialsByDmaUser(client, DMA_ID, key)).rejects.toThrow();
  });

  it("⑱ 행 없음 → null · 조회 실패 → throw + error 로그(dmaUserId · 원문 details 없음)", async () => {
    const { client: empty } = recordingDbClient({ data: null, error: null });
    await expect(getDmaCredentialsByDmaUser(empty, DMA_ID, newKey())).resolves.toBeNull();

    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const dbError = { code: "57P01", message: "terminating", details: `Key (dma_user_id)=(${DMA_ID}) password_enc` };
    const { client: failing } = recordingDbClient({ data: null, error: dbError });
    await expect(getDmaCredentialsByDmaUser(failing, DMA_ID, newKey())).rejects.toBe(dbError);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(errorSpy.mock.calls[0]);
    expect(logged).toContain("57P01");
    expect(logged).not.toContain(DMA_ID);
  });

  it("⑲ 같은 DMA id 를 공유하는 두 웹 사용자는 같은 암호문 한 벌을 복호한다(DMA 유저당 1개 보관)", () => {
    const key = newKey();
    const enc = encryptDmaPassword(PASSWORD, DMA_ID, key);
    expect(decryptDmaPassword(enc, DMA_ID, key)).toBe(PASSWORD);
    expect(() => decryptDmaPassword(enc, "dmaB", key)).toThrow();
  });
});

describe("createAccessCredentials (Phase 29 D-02)", () => {
  const DMA_ID = "dmaA";

  function access(entries: Record<string, AppAccessEntry>, loaded = true): AccessLookup {
    return { loaded, lookup: (u) => Promise.resolve(entries[u]) };
  }
  function entry(role: AppAccessEntry["role"], dmaUserId: string | null): AppAccessEntry {
    return { userId: USER_ID, email: "u@example.com", role, dmaUserId };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(logger, "info").mockImplementation(() => undefined);
  });

  it("⑳ 접근 맵 미적재 → \"not_ready\"(권한 없음으로 위장하지 않는다) · DB 조회 없음", async () => {
    const { client, calls } = recordingDbClient({ data: null, error: null });
    const creds = createAccessCredentials({ access: access({}, false), supabase: client, credKey: newKey() });
    await expect(creds(USER_ID)).resolves.toBe("not_ready");
    expect(calls).toHaveLength(0);
  });

  it("㉑ viewer · 맵에 없음 · DMA 연결 없음 → null(DB 조회 없음)", async () => {
    const { client, calls } = recordingDbClient({ data: null, error: null });
    const key = newKey();
    await expect(
      createAccessCredentials({ access: access({ [USER_ID]: entry("viewer", DMA_ID) }), supabase: client, credKey: key })(USER_ID),
    ).resolves.toBeNull();
    await expect(createAccessCredentials({ access: access({}), supabase: client, credKey: key })(USER_ID)).resolves.toBeNull();
    await expect(
      createAccessCredentials({ access: access({ [USER_ID]: entry("trader", null) }), supabase: client, credKey: key })(USER_ID),
    ).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("㉒ trader · admin + DMA 연결 → dma_users 복호(AAD = dma id) · 행 없음이면 null", async () => {
    const key = newKey();
    const { client } = recordingDbClient({
      data: { dma_user_id: DMA_ID, password_enc: encryptDmaPassword(PASSWORD, DMA_ID, key) },
      error: null,
    });
    for (const role of ["trader", "admin"] as const) {
      const creds = createAccessCredentials({ access: access({ [USER_ID]: entry(role, DMA_ID) }), supabase: client, credKey: key });
      await expect(creds(USER_ID)).resolves.toEqual({ dmaUserId: DMA_ID, password: PASSWORD });
    }
    const { client: empty } = recordingDbClient({ data: null, error: null });
    const none = createAccessCredentials({ access: access({ [USER_ID]: entry("trader", DMA_ID) }), supabase: empty, credKey: key });
    await expect(none(USER_ID)).resolves.toBeNull();
  });
});

describe("verifyToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  it("⑫ 정상 토큰이면 user.id 를 돌려준다", async () => {
    const client = fakeAuthClient({ data: { user: { id: USER_ID } }, error: null });

    await expect(verifyToken(client, "valid-token")).resolves.toBe(USER_ID);
  });

  it("⑬ 빈 토큰은 네트워크 호출 없이 null 이다", async () => {
    const client = fakeAuthClient({ data: { user: { id: USER_ID } }, error: null });

    await expect(verifyToken(client, "")).resolves.toBeNull();
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("⑭ getUser 가 오류를 내면 null 이다", async () => {
    const client = fakeAuthClient({ data: { user: null }, error: { message: "invalid JWT" } });

    await expect(verifyToken(client, "expired-token")).resolves.toBeNull();
  });

  it("⑮ 오류는 없는데 user 가 null 이면 null 이다", async () => {
    const client = fakeAuthClient({ data: { user: null }, error: null });

    await expect(verifyToken(client, "weird-token")).resolves.toBeNull();
  });
});
