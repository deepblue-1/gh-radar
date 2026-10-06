/**
 * Phase 29 Plan 24 Task 3 — D-19 재암호화 이관 계획(`planDmaUserMigration`) 단위 테스트.
 *
 * 옛 `dma_credentials`(AAD = 웹 user_id) → 새 `dma_users`(AAD = dma_user_id) 이관을 **순수 계획**으로 못박는다.
 * 쓰기 · 출력은 스크립트(`scripts/migrate-dma-users.ts`) 몫이고 여기서는 판정만 본다:
 *   - 같은 DMA id 를 공유하는 행은 암호문 1개로 모인다(D-19 「DMA 유저당 1개」).
 *   - 같은 DMA id 인데 비밀번호가 다르면 그 id 를 통째로 빼고 PASSWORD_MISMATCH(틀린 비밀번호 로그인 = 계좌 잠김 · T-15-10).
 *   - 신원 연결이 다른 DMA id 를 가리키면 IDENTITY_MISMATCH 경고 — 자격증명 id 는 그대로 이관(「모든 서버 같은 DMA id」).
 *   - 재암호화 결과는 AAD = dma_user_id 로만 복호된다(라운드트립 · 옛 AAD 로는 tag 실패).
 *   - 계획 어디에도 평문 · 옛 암호문 · 키가 실리지 않는다 · 충돌 · 건너뜀은 마스킹 id 만.
 *
 * 테스트 키는 테스트 전용 32B 난수다(운영 키 아님).
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptDmaPassword, encryptDmaPassword } from "../src/store/credentials.js";
import {
  maskDmaUserId,
  maskEmail,
  planDmaUserMigration,
  type DmaUserMigrationInput,
} from "../src/store/dma-users-migrate.js";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";

const PW_D1 = "pw-d1-secret";
const PW_D2 = "pw-d2-secret";

/** 옛 표 행 — AAD = 웹 user_id (Phase 15 D-18). */
function cred(userId: string, dmaUserId: string, plain: string, gateway = "KB120") {
  return { userId, dmaUserId, passwordEnc: encryptDmaPassword(plain, userId, KEY), gateway };
}

function baseInput(overrides: Partial<DmaUserMigrationInput> = {}): DmaUserMigrationInput {
  return {
    credentials: [cred(U1, "d1", PW_D1), cred(U2, "d1", PW_D1), cred(U3, "d2", PW_D2)],
    identities: [],
    emails: new Map([
      [U1, "alpha@example.com"],
      [U2, "bravo@example.com"],
      [U3, "charlie@example.com"],
    ]),
    appUsers: [
      { email: "alpha@example.com", role: "trader", dmaUserId: null },
      { email: "bravo@example.com", role: "admin", dmaUserId: null },
    ],
    existingDmaUsers: new Set<string>(),
    keyB64: KEY,
    ...overrides,
  };
}

describe("planDmaUserMigration — 기본 이관", () => {
  it("같은 DMA id 두 행 · 같은 비밀번호 → d1 암호문 1개 + d2 · 링크 3개 · 충돌 0", () => {
    const plan = planDmaUserMigration(baseInput());

    expect(plan.upserts.map((u) => u.dmaUserId)).toEqual(["d1", "d2"]);
    expect(plan.links).toEqual([
      { email: "alpha@example.com", dmaUserId: "d1" },
      { email: "bravo@example.com", dmaUserId: "d1" },
      { email: "charlie@example.com", dmaUserId: "d2", create: "trader" },
    ]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("재암호화 결과는 AAD = dma_user_id 로 복호하면 원문과 같다(라운드트립) · 옛 AAD(user_id)로는 tag 실패", () => {
    const plan = planDmaUserMigration(baseInput());
    const d1 = plan.upserts.find((u) => u.dmaUserId === "d1");
    const d2 = plan.upserts.find((u) => u.dmaUserId === "d2");
    expect(d1).toBeDefined();
    expect(d2).toBeDefined();

    expect(decryptDmaPassword(d1!.passwordEnc, "d1", KEY)).toBe(PW_D1);
    expect(decryptDmaPassword(d2!.passwordEnc, "d2", KEY)).toBe(PW_D2);
    expect(() => decryptDmaPassword(d1!.passwordEnc, U1, KEY)).toThrow();
    // 행 이동 방어 — d1 암호문은 d2 AAD 로 열리지 않는다.
    expect(() => decryptDmaPassword(d1!.passwordEnc, "d2", KEY)).toThrow();
  });

  it("app_users 에 이미 같은 DMA id 로 연결된 사용자는 링크하지 않고 건너뜀(ALREADY_LINKED)", () => {
    const plan = planDmaUserMigration(
      baseInput({
        appUsers: [
          { email: "alpha@example.com", role: "trader", dmaUserId: "d1" },
          { email: "bravo@example.com", role: "admin", dmaUserId: null },
        ],
      }),
    );
    expect(plan.links.map((l) => l.email)).toEqual(["bravo@example.com", "charlie@example.com"]);
    expect(plan.skipped).toContainEqual({ dmaUserIdMasked: maskDmaUserId("d1"), reason: "ALREADY_LINKED" });
  });
});

describe("planDmaUserMigration — 충돌", () => {
  it("u1 · u2 가 같은 d1 인데 복호 결과가 다름 → d1 upsert · 링크 둘 다 빠지고 PASSWORD_MISMATCH", () => {
    const plan = planDmaUserMigration(
      baseInput({
        credentials: [cred(U1, "d1", PW_D1), cred(U2, "d1", "pw-d1-different"), cred(U3, "d2", PW_D2)],
      }),
    );

    expect(plan.upserts.map((u) => u.dmaUserId)).toEqual(["d2"]);
    expect(plan.links.map((l) => l.dmaUserId)).toEqual(["d2"]);
    expect(plan.conflicts).toEqual([
      { dmaUserIdMasked: maskDmaUserId("d1"), reason: "PASSWORD_MISMATCH", severity: "skipped" },
    ]);
  });

  it("dma_gateway_identities 가 u3 · KYOBO → d9(자격증명 d2 와 다름) → IDENTITY_MISMATCH 경고 · d2 는 그대로 이관", () => {
    const plan = planDmaUserMigration(
      baseInput({ identities: [{ userId: U3, gateway: "KYOBO119", dmaUserId: "d9" }] }),
    );

    expect(plan.upserts.map((u) => u.dmaUserId)).toEqual(["d1", "d2"]);
    expect(plan.links).toContainEqual({ email: "charlie@example.com", dmaUserId: "d2", create: "trader" });
    expect(plan.conflicts).toEqual([
      { dmaUserIdMasked: maskDmaUserId("d2"), reason: "IDENTITY_MISMATCH", severity: "warning" },
    ]);
  });

  it("신원 연결이 같은 DMA id · 같은 게이트웨이 · 자격증명 없는 사용자를 가리키면 충돌이 아니다", () => {
    const plan = planDmaUserMigration(
      baseInput({
        identities: [
          { userId: U1, gateway: "KYOBO119", dmaUserId: "d1" }, // 같은 id
          { userId: U2, gateway: "KB120", dmaUserId: "zz" }, // 자격증명과 같은 게이트웨이 — 옛 뷰도 무시하던 행
          { userId: "44444444-4444-4444-8444-444444444444", gateway: "KYOBO119", dmaUserId: "d7" }, // 자격증명 없음
        ],
      }),
    );
    expect(plan.conflicts).toEqual([]);
  });

  it("복호 실패 행(다른 키로 암호화) → 그 DMA id 를 통째로 빼고 DECRYPT_FAILED", () => {
    const bad = { userId: U2, dmaUserId: "d1", passwordEnc: encryptDmaPassword(PW_D1, U2, OTHER_KEY), gateway: "KB120" };
    const plan = planDmaUserMigration(baseInput({ credentials: [cred(U1, "d1", PW_D1), bad, cred(U3, "d2", PW_D2)] }));

    expect(plan.upserts.map((u) => u.dmaUserId)).toEqual(["d2"]);
    expect(plan.links.map((l) => l.dmaUserId)).toEqual(["d2"]);
    expect(plan.conflicts).toEqual([
      { dmaUserIdMasked: maskDmaUserId("d1"), reason: "DECRYPT_FAILED", severity: "skipped" },
    ]);
  });

  it("app_users 가 이미 다른 DMA id 로 연결돼 있으면 덮어쓰지 않고 LINK_MISMATCH 경고", () => {
    const plan = planDmaUserMigration(
      baseInput({
        appUsers: [
          { email: "alpha@example.com", role: "trader", dmaUserId: "d5" },
          { email: "bravo@example.com", role: "admin", dmaUserId: null },
        ],
      }),
    );
    expect(plan.links.map((l) => l.email)).not.toContain("alpha@example.com");
    expect(plan.conflicts).toContainEqual({
      dmaUserIdMasked: maskDmaUserId("d1"),
      reason: "LINK_MISMATCH",
      severity: "warning",
    });
  });

  it("이메일을 모르는 자격증명 행은 링크하지 않고 EMAIL_MISSING 경고 — 암호문 이관은 그대로", () => {
    const emails = new Map([
      [U1, "alpha@example.com"],
      [U2, "bravo@example.com"],
    ]);
    const plan = planDmaUserMigration(baseInput({ emails }));
    expect(plan.upserts.map((u) => u.dmaUserId)).toEqual(["d1", "d2"]);
    expect(plan.links.map((l) => l.dmaUserId)).toEqual(["d1", "d1"]);
    expect(plan.conflicts).toEqual([
      { dmaUserIdMasked: maskDmaUserId("d2"), reason: "EMAIL_MISSING", severity: "warning" },
    ]);
  });
});

describe("planDmaUserMigration — 기존 dma_users · 출력 위생", () => {
  it("이미 dma_users 에 d1 이 있으면 upsert 하지 않고 skipped · 링크는 기존 d1 로 만든다", () => {
    const plan = planDmaUserMigration(baseInput({ existingDmaUsers: new Set(["d1"]) }));

    expect(plan.upserts.map((u) => u.dmaUserId)).toEqual(["d2"]);
    expect(plan.skipped).toContainEqual({ dmaUserIdMasked: maskDmaUserId("d1"), reason: "ALREADY_EXISTS" });
    expect(plan.links.filter((l) => l.dmaUserId === "d1").map((l) => l.email)).toEqual([
      "alpha@example.com",
      "bravo@example.com",
    ]);
  });

  it("app_users 에 u3 이메일이 없으면 links 에 create: trader 표시", () => {
    const plan = planDmaUserMigration(baseInput());
    expect(plan.links.find((l) => l.email === "charlie@example.com")).toEqual({
      email: "charlie@example.com",
      dmaUserId: "d2",
      create: "trader",
    });
  });

  it("계획 직렬화에 평문 비밀번호 · 옛 암호문 · 키가 없다 · 충돌 · 건너뜀은 원문 DMA id 를 싣지 않는다", () => {
    const input = baseInput({
      credentials: [cred(U1, "dmaA1", PW_D1), cred(U2, "dmaA1", "pw-other"), cred(U3, "dmaB2", PW_D2)],
      existingDmaUsers: new Set(["dmaB2"]),
    });
    const plan = planDmaUserMigration(input);
    const blob = JSON.stringify(plan);

    for (const secret of [PW_D1, PW_D2, "pw-other", KEY, ...input.credentials.map((c) => c.passwordEnc)]) {
      expect(blob).not.toContain(secret);
    }
    const masked = JSON.stringify({ conflicts: plan.conflicts, skipped: plan.skipped });
    expect(masked).not.toContain("dmaA1");
    expect(masked).not.toContain("dmaB2");
  });

  it("마스킹 — DMA id 는 앞 최대 2자(길이의 절반 이하) + 길이 · 이메일은 로컬 부분 앞 2자만", () => {
    expect(maskDmaUserId("dmaA1")).toBe("dm***(5)");
    expect(maskDmaUserId("d1")).toBe("d***(2)");
    expect(maskDmaUserId("d")).toBe("***(1)");
    expect(maskEmail("alpha@example.com")).toBe("al***");
    expect(maskEmail("a@x.io")).toBe("a***");
  });

  it("키 길이가 틀리면 계획 전에 throw — 메시지에 키가 없다", () => {
    const shortKey = randomBytes(16).toString("base64");
    expect(() => planDmaUserMigration(baseInput({ keyB64: shortKey }))).toThrow(/32바이트/);
    try {
      planDmaUserMigration(baseInput({ keyB64: shortKey }));
    } catch (err) {
      expect(String(err)).not.toContain(shortKey);
    }
  });
});
