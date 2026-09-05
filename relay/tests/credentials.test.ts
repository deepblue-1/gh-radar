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
  decryptDmaPassword,
  encryptDmaPassword,
  getDmaCredentials,
} from "../src/store/credentials.js";
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
