/**
 * Phase 29 Plan 24 — D-19 재암호화 이관 **계획**(순수). `dma_credentials` → `dma_users`.
 *
 * 옛 표(Phase 15)는 웹 사용자당 1행이고 암호문의 AAD 가 웹 `user_id` 다. 새 표(Phase 29 D-19)는 DMA 유저당 1행이고
 * AAD 가 `dma_user_id` 다. AAD 가 다르면 GCM tag 가 맞지 않으므로(행 이동 방어와 같은 원리) 암호문을 복사할 수 없다 —
 * 「옛 AAD 로 복호 → 새 AAD 로 재암호화 → 재복호 검증」 만 가능하고, 키는 relay 에만 있으므로 SQL 로는 못 한다.
 *
 * 이 모듈은 **판정만** 한다 — DB 를 읽지도 쓰지도 않고 로그도 남기지 않는다(입력 → 계획). 읽기 · 쓰기 · 출력은
 * `scripts/migrate-dma-users.ts` 몫이다(기본 dry-run · `--apply`).
 *
 * 규칙:
 *   - 같은 DMA id 를 공유하는 웹 사용자 여럿(실데이터 — RESEARCH Pitfall 5)은 암호문 1개로 모은다. 그러려면 그 id 의
 *     **모든 행이 같은 비밀번호**여야 한다. 다르면 그 DMA id 를 통째로 뺀다(`PASSWORD_MISMATCH` — 어느 쪽이 맞는지
 *     모르는 채 고르면 틀린 비밀번호로 로그인해 계좌가 잠긴다 · T-15-10). 한 행이라도 복호에 실패해도 통째로 뺀다
 *     (`DECRYPT_FAILED` — 확인할 수 없는 비밀번호와 일치 여부를 판정할 수 없다).
 *   - 「모든 서버 같은 DMA id」(gh-trade 세션 합류 결정): `dma_gateway_identities` 가 자격증명과 **다른 게이트웨이에서
 *     다른 DMA id** 를 가리키면 `IDENTITY_MISMATCH` **경고**다. 자격증명 id 는 그대로 이관한다 — 새 모델에서 그 사용자는
 *     모든 서버에서 자격증명 id 를 쓰게 되고, 연결이 가리키던 id 는 이관되지 않는다(Admin 이 확인할 대상).
 *     같은 게이트웨이의 연결은 옛 뷰도 무시하던 행이라 보지 않는다. 자격증명 없는 사용자의 연결도 보지 않는다(옛 규칙 —
 *     자격증명 행 = allowlist).
 *   - 이미 `dma_users` 에 있는 DMA id 는 upsert 하지 않는다(`ALREADY_EXISTS` — Admin 이 먼저 만든 행을 덮지 않는다).
 *     링크는 그 기존 행으로 만든다.
 *   - 링크: `app_users` 에 이메일이 있으면 `dma_user_id` 연결 · 없으면 `create: "trader"`(D-20 시드 규칙 — 자격증명
 *     보유자 = trader). 이미 같은 id 면 `ALREADY_LINKED` 로 건너뛰고, **다른 id 로 연결돼 있으면 덮어쓰지 않는다**
 *     (`LINK_MISMATCH` 경고). 이메일을 모르면 링크만 빼고 `EMAIL_MISSING` 경고(암호문 이관은 그대로).
 *
 * 출력 위생: 계획에는 **새 암호문**과 이메일 · DMA id(쓰기용)만 있다 — 평문 · 옛 암호문 · 키는 없다. 충돌 · 건너뜀은
 * 마스킹 id 만 싣는다(스크립트가 그대로 출력한다). 평문은 `reencrypt` 스코프를 벗어나지 않는다.
 */
import { maskDmaUserId } from "@gh-radar/shared";

import { decryptDmaPassword, encryptDmaPassword } from "./credentials.js";

/** AES-256 키 길이(byte) — `credentials.ts` 와 같다. 계획 전에 한 번 확인해 행마다 같은 실패를 쌓지 않는다. */
const KEY_BYTES = 32;

/** 옛 `dma_credentials` 행(camelCase). `passwordEnc` 의 AAD = `userId`. */
export type MigrationCredentialRow = {
  userId: string;
  dmaUserId: string;
  passwordEnc: string;
  /** 자격증명 자신의 게이트웨이(`dma_credentials.gateway` — 개명 뒤 `KB120` 등). 모르면 생략. */
  gateway?: string;
};

/** 옛 `dma_gateway_identities` 행. */
export type MigrationIdentityRow = { userId: string; gateway: string; dmaUserId: string };

/** `app_users` 행(이메일은 소문자 · trim 정규화값). */
export type MigrationAppUserRow = { email: string; role: string; dmaUserId: string | null };

export type DmaUserMigrationInput = {
  credentials: ReadonlyArray<MigrationCredentialRow>;
  identities: ReadonlyArray<MigrationIdentityRow>;
  /** 웹 user_id → 이메일(`auth.users`). */
  emails: ReadonlyMap<string, string>;
  appUsers: ReadonlyArray<MigrationAppUserRow>;
  /** 이미 `dma_users` 에 있는 dma_user_id. */
  existingDmaUsers: ReadonlySet<string>;
  /** `DMA_CRED_KEY` (base64 32B). */
  keyB64: string;
};

export type MigrationConflictReason =
  | "PASSWORD_MISMATCH"
  | "DECRYPT_FAILED"
  | "ROUNDTRIP_FAILED"
  | "IDENTITY_MISMATCH"
  | "LINK_MISMATCH"
  | "EMAIL_MISSING";

export type DmaUserMigrationPlan = {
  /** `dma_users` 에 넣을 행 — 암호문 AAD = dmaUserId. */
  upserts: { dmaUserId: string; passwordEnc: string }[];
  /** `app_users.dma_user_id` 연결 · `create` 면 그 이메일을 trader 로 새로 만든다. */
  links: { email: string; dmaUserId: string; create?: "trader" }[];
  /**
   * 충돌 — `skipped` = 그 DMA id 를 이관하지 않았다 · `warning` = 이관은 했지만 사람이 볼 것.
   * id 는 마스킹만(같은 id · 사유는 한 번만).
   */
  conflicts: { dmaUserIdMasked: string; reason: MigrationConflictReason; severity: "skipped" | "warning" }[];
  /** 이미 끝난 일 — `ALREADY_EXISTS`(dma_users 행 있음) · `ALREADY_LINKED`(같은 id 로 연결됨). */
  skipped: { dmaUserIdMasked: string; reason: "ALREADY_EXISTS" | "ALREADY_LINKED" }[];
};

const SKIP_SEVERITY: Readonly<Record<MigrationConflictReason, "skipped" | "warning">> = {
  PASSWORD_MISMATCH: "skipped",
  DECRYPT_FAILED: "skipped",
  ROUNDTRIP_FAILED: "skipped",
  IDENTITY_MISMATCH: "warning",
  LINK_MISMATCH: "warning",
  EMAIL_MISSING: "warning",
};

/** DMA id 마스킹 — shared 한 벌(29-40 IN-01 · relay admin-api · Express 감사와 같은 꼴). 기존 import 경로 호환 재수출. */
export { maskDmaUserId };

/** 이메일 마스킹 — 로컬 부분 앞 2자 + `***`. 도메인도 싣지 않는다. */
export function maskEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2)}***`;
}

/**
 * 한 DMA id 의 행들을 복호해 비밀번호가 하나인지 보고, 하나면 AAD = dmaUserId 로 재암호화 · 재복호 검증한다.
 * 평문은 이 함수 밖으로 나가지 않는다 — 반환은 새 암호문 또는 실패 사유뿐이다. 예외 메시지도 흘리지 않는다.
 */
function reencrypt(
  dmaUserId: string,
  rows: ReadonlyArray<MigrationCredentialRow>,
  keyB64: string,
): { ok: true; passwordEnc: string } | { ok: false; reason: "PASSWORD_MISMATCH" | "DECRYPT_FAILED" | "ROUNDTRIP_FAILED" } {
  let plain: string | undefined;
  for (const row of rows) {
    let p: string;
    try {
      p = decryptDmaPassword(row.passwordEnc, row.userId, keyB64);
    } catch {
      return { ok: false, reason: "DECRYPT_FAILED" };
    }
    if (plain === undefined) plain = p;
    else if (plain !== p) return { ok: false, reason: "PASSWORD_MISMATCH" };
  }
  if (plain === undefined) return { ok: false, reason: "DECRYPT_FAILED" };
  try {
    const next = encryptDmaPassword(plain, dmaUserId, keyB64);
    if (decryptDmaPassword(next, dmaUserId, keyB64) !== plain) return { ok: false, reason: "ROUNDTRIP_FAILED" };
    return { ok: true, passwordEnc: next };
  } catch {
    return { ok: false, reason: "ROUNDTRIP_FAILED" };
  }
}

/**
 * 이관 계획을 만든다(순수 · 결정적 — upsert 는 DMA id 첫 등장 순, 링크는 자격증명 행 순).
 *
 * @throws 키가 base64 32B 가 아니면 계획 전에 throw(메시지에 키 없음) — 모든 행이 DECRYPT_FAILED 로 위장되지 않게.
 */
export function planDmaUserMigration(input: DmaUserMigrationInput): DmaUserMigrationPlan {
  const keyLen = Buffer.from(input.keyB64, "base64").length;
  if (keyLen !== KEY_BYTES) {
    throw new Error(`DMA_CRED_KEY 는 base64 ${KEY_BYTES}바이트여야 합니다 (현재 ${keyLen}B)`);
  }

  const plan: DmaUserMigrationPlan = { upserts: [], links: [], conflicts: [], skipped: [] };
  const seenConflict = new Set<string>();
  const seenSkip = new Set<string>();
  const conflict = (dmaUserId: string, reason: MigrationConflictReason): void => {
    const k = `${dmaUserId}\u0000${reason}`;
    if (seenConflict.has(k)) return;
    seenConflict.add(k);
    plan.conflicts.push({ dmaUserIdMasked: maskDmaUserId(dmaUserId), reason, severity: SKIP_SEVERITY[reason] });
  };
  const skip = (dmaUserId: string, reason: "ALREADY_EXISTS" | "ALREADY_LINKED"): void => {
    const k = `${dmaUserId}\u0000${reason}`;
    if (seenSkip.has(k)) return;
    seenSkip.add(k);
    plan.skipped.push({ dmaUserIdMasked: maskDmaUserId(dmaUserId), reason });
  };

  // ① DMA id 별로 묶는다(첫 등장 순).
  const groups = new Map<string, MigrationCredentialRow[]>();
  for (const row of input.credentials) {
    const g = groups.get(row.dmaUserId);
    if (g === undefined) groups.set(row.dmaUserId, [row]);
    else g.push(row);
  }

  // ② 그룹마다 비밀번호 단일성 · 재암호화. 이미 있는 id 도 일치 검사는 한다 — 공유 행끼리 다르면 링크도 위험하다.
  const migratable = new Set<string>();
  for (const [dmaUserId, rows] of groups) {
    const result = reencrypt(dmaUserId, rows, input.keyB64);
    if (!result.ok) {
      conflict(dmaUserId, result.reason);
      continue;
    }
    migratable.add(dmaUserId);
    if (input.existingDmaUsers.has(dmaUserId)) {
      skip(dmaUserId, "ALREADY_EXISTS");
    } else {
      plan.upserts.push({ dmaUserId, passwordEnc: result.passwordEnc });
    }
  }

  // ③ 신원 연결 대조 — 다른 게이트웨이에서 다른 DMA id 를 가리키면 경고(자격증명 id 는 그대로 이관).
  const credByUser = new Map<string, MigrationCredentialRow>();
  for (const row of input.credentials) credByUser.set(row.userId, row);
  for (const ident of input.identities) {
    const credRow = credByUser.get(ident.userId);
    if (credRow === undefined) continue; // 자격증명 없는 연결은 옛 규칙에서도 무효였다
    if (credRow.gateway !== undefined && credRow.gateway === ident.gateway) continue; // 옛 뷰도 무시하던 행
    if (ident.dmaUserId === credRow.dmaUserId) continue;
    if (!migratable.has(credRow.dmaUserId)) continue; // 이미 skipped 충돌로 보고된 id
    conflict(credRow.dmaUserId, "IDENTITY_MISMATCH");
  }

  // ④ 링크 — 이관 가능한 id 의 자격증명 행 순서대로.
  const appByEmail = new Map<string, MigrationAppUserRow>();
  for (const a of input.appUsers) appByEmail.set(a.email.trim().toLowerCase(), a);
  const linked = new Set<string>();
  for (const row of input.credentials) {
    if (!migratable.has(row.dmaUserId)) continue;
    const rawEmail = input.emails.get(row.userId);
    const email = rawEmail?.trim().toLowerCase();
    if (email === undefined || email === "") {
      conflict(row.dmaUserId, "EMAIL_MISSING");
      continue;
    }
    if (linked.has(email)) continue; // 같은 이메일 두 번(있을 수 없지만 방어)
    linked.add(email);
    const app = appByEmail.get(email);
    if (app === undefined) {
      plan.links.push({ email, dmaUserId: row.dmaUserId, create: "trader" });
    } else if (app.dmaUserId === row.dmaUserId) {
      skip(row.dmaUserId, "ALREADY_LINKED");
    } else if (app.dmaUserId !== null && app.dmaUserId !== "") {
      conflict(row.dmaUserId, "LINK_MISMATCH");
    } else {
      plan.links.push({ email, dmaUserId: row.dmaUserId });
    }
  }

  return plan;
}
