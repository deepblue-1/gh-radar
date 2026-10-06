/**
 * Phase 15 Plan 04 — RELAY-01. `dma_credentials` 조회 + AES-256-GCM 복호.
 *
 * **평문 DMA 비밀번호가 존재하는 유일한 지점**이다. 여기서 나간 평문은 `SessionManager`
 * → `DmaSession` 의 private 필드까지만 흐르고 로그·상태 프레임·에러 메시지 어디에도
 * 실리지 않는다 (T-15-05 / T-15-19).
 *
 * 결정 근거:
 *   D-12  allowlist 의 정의는 **`dma_credentials` 매핑 행의 존재**다. 행이 없는 로그인
 *         사용자는 "권한 없음"이지 오류가 아니다 — 그래서 `null` 이고 throw 가 아니다.
 *   D-18  저장 포맷은 **base64(nonce(12B) ‖ tag(16B) ‖ ciphertext)**, AAD = 그 행의 주인 식별자.
 *         AAD 를 거는 이유는 **행 이동 공격**을 막기 위해서다 — DB 를 쓸 수 있는 공격자가
 *         A 의 암호문을 B 행에 복사해도 tag 검증이 실패한다.
 *   Phase 29 D-19  AAD 의 **의미만** 바뀐다 — 저장 포맷 · GCM 은 그대로다.
 *         - 옛 `dma_credentials.dma_password_enc` (Phase 15) : AAD = 웹 `user_id`
 *         - 새 `dma_users.password_enc`          (Phase 29) : AAD = `dma_user_id`(「DMA 유저당 1개 보관」 ·
 *           가입 전 사전 등록과 양립 — 웹 user_id 가 아직 없어도 암호화할 수 있다)
 *         relay wss 인증의 원천은 새 표다(`getDmaCredentialsByDmaUser` · `createAccessCredentials`). 옛
 *         `getDmaCredentials` 는 이관 스크립트(29-24) · dual-write(29-11)를 위해 남는다 — 두 AAD 를 섞으면 tag 검증이
 *         실패하므로(행 이동 방어와 같은 원리) 이관은 「옛 AAD 로 복호 → 새 AAD 로 재암호화」 만 가능하다.
 *   D-19  복호 주체는 relay 뿐이다. Cloud Run server 는 `DMA_CRED_KEY` 를 갖지 않는다.
 *   S-5   조회 실패(에러)는 `logger.error` 후 throw 한다. 조용한 `null` 반환은 "권한 없음"과
 *         "DB 장애"를 같은 화면으로 만들어 원인을 영원히 못 찾게 한다.
 *
 * 암호는 **직접 만들지 않는다** — `node:crypto` 표준 API 만 쓴다. nonce 재사용·tag 미검증은
 * 자체 구현이 늘 저지르는 사고이며, GCM 은 nonce 를 재사용하는 순간 평문이 드러난다.
 *
 * 하지 않는 것:
 *   - 복호 실패를 "빈 비밀번호"로 흘려보내지 않는다. 실패는 예외로 확정하고 상위가
 *     `unauthorized` 로 처리한다 — 틀린 비밀번호로 KB 에 로그인하면 계정이 잠긴다.
 *   - 평문을 캐시하지 않는다. 세션이 이미 메모리에 들고 있고, 두 벌이면 노출면이 두 배다.
 *   - 자격증명을 쓰지(write) 않는다. 등록은 관리자 수기 스크립트 소관이다 (D-18).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppAccessEntry } from "../access/app-access.js";
import { isDmaGranted } from "../access/app-access.js";
import type { DmaCredentials } from "../dma/session-manager.js";
import { logger } from "../logger.js";
import { safePgError } from "./pg-error.js";

// ============================================================
// 저장 포맷 상수 (D-18). 값을 여기서만 정의한다.
// ============================================================

/** GCM 권장 nonce 길이(byte). 12B 는 GCM 의 표준 IV 길이다. */
const NONCE_BYTES = 12;
/** GCM 인증 태그 길이(byte). */
const TAG_BYTES = 16;
/** AES-256 키 길이(byte). `DMA_CRED_KEY` 는 이 길이를 base64 로 담는다. */
const KEY_BYTES = 32;
/** 유효한 암호문의 최소 길이 — nonce + tag + 최소 1바이트. */
const MIN_BLOB_BYTES = NONCE_BYTES + TAG_BYTES + 1;

/** `dma_credentials` 조회 결과(복호 완료). 평문은 여기서만 밖으로 나간다. */
export type DmaCredentialRecord = {
  /** DMA 게이트웨이 로그인 id. */
  dmaUserId: string;
  /** 평문 비밀번호 (D-19 — 로그 금지). */
  password: string;
};

/** DB row 형태 (snake_case). 변환 책임은 이 모듈에 있다. */
type CredentialRow = {
  dma_user_id: string;
  dma_password_enc: string;
};

/** base64 키를 32바이트 버퍼로. 길이가 어긋나면 **기동/사용 시점에** 터뜨린다. */
function parseKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== KEY_BYTES) {
    // 키 값 자체는 절대 메시지에 넣지 않는다 — 길이만 말한다.
    throw new Error(`DMA_CRED_KEY 는 base64 ${KEY_BYTES}바이트여야 합니다 (현재 ${key.length}B)`);
  }
  return key;
}

/**
 * 평문을 저장 포맷으로 암호화한다.
 *
 * 관리자 등록 스크립트(15-05)와 테스트가 쓰는 **대칭 함수**다. nonce 는 호출마다 새로 뽑는다 — 같은 평문을 두 번
 * 암호화해도 결과가 달라야 한다(GCM 은 nonce 재사용 시 평문이 드러난다).
 *
 * @param aad 행 주인 식별자 — 옛 `dma_credentials` 는 웹 `user_id`(Phase 15), 새 `dma_users` 는 `dma_user_id`
 *            (Phase 29 D-19). 복호할 때 같은 값을 줘야 한다.
 */
export function encryptDmaPassword(plain: string, aad: string, keyB64: string): string {
  const key = parseKey(keyB64);
  // 매 호출 새 nonce — `NONCE_BYTES = 12` 이므로 실질적으로 randomBytes(12) 다.
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  // AAD = 행 주인 식별자. 암호문을 다른 행으로 옮기는 공격을 tag 검증으로 막는다.
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/**
 * 저장 포맷을 평문으로 복호한다.
 *
 * 키 불일치·AAD 불일치·본문 변조는 전부 tag 검증 실패로 **예외**가 된다.
 * "복호는 됐는데 값이 이상하다"는 상태를 만들지 않는 것이 GCM 을 쓰는 이유다.
 *
 * @param aad 암호화 때 준 행 주인 식별자(옛 표 = 웹 `user_id` · 새 `dma_users` = `dma_user_id`, D-19).
 * @throws 포맷이 짧거나 tag 검증에 실패하면 throw. 상위는 `unauthorized` 로 처리한다.
 */
export function decryptDmaPassword(enc: string, aad: string, keyB64: string): string {
  const key = parseKey(keyB64);
  const blob = Buffer.from(enc, "base64");
  if (blob.length < MIN_BLOB_BYTES) {
    throw new Error(`자격증명 암호문이 너무 짧습니다 (${blob.length}B)`);
  }

  const nonce = blob.subarray(0, NONCE_BYTES);
  const tag = blob.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(NONCE_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  // final() 이 tag 를 검증한다 — 실패하면 여기서 throw 된다.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * 사용자의 DMA 자격증명을 **옛 표**(`dma_credentials` · AAD = 웹 user_id)에서 읽어 복호한다.
 *
 * Phase 29 부터 relay 운영 경로(`index.ts`)는 `createAccessCredentials`(새 표)를 쓴다. 이 함수는 fanout 의 주입 미지정
 * 기본값(단위 테스트) · 이관 스크립트(29-24) · dual-write(29-11)를 위해 남는다.
 *
 * @returns 매핑 행이 있으면 복호된 자격증명, **없으면 `null`**(= allowlist 미포함, D-12)
 * @throws 조회 자체가 실패했거나 복호에 실패하면 throw — "권한 없음"과 구분해야 한다
 */
export async function getDmaCredentials(
  supabase: SupabaseClient,
  userId: string,
  keyB64: string,
): Promise<DmaCredentialRecord | null> {
  const { data, error } = await supabase
    .from("dma_credentials")
    .select("dma_user_id, dma_password_enc")
    // RLS 는 정책 0개(D-18)라 실질 필터는 이 명시 조건이다 (chat-history 규약 동형).
    .eq("user_id", userId)
    .maybeSingle<CredentialRow>();

  if (error !== null) {
    // `error` 원문을 싣지 않는다 (16-38 / R2-CR-03 · T-16-45) — PostgREST 오류의
    // `details`/`hint` 는 위반 행의 값을 담고, 이 테이블의 행에는 `dma_password_enc` 가
    // 있다. 사유(SQLSTATE)는 `pgError.code` 로 그대로 남는다. → `store/pg-error.ts`
    logger.error({ userId, pgError: safePgError(error) }, "[CRED] dma_credentials 조회 실패");
    throw error;
  }
  if (data === null) {
    // 오류가 아니다 — 등록되지 않은 사용자다 (D-12).
    logger.info({ userId }, "[CRED] dma_credentials 매핑 없음 — 권한 없음");
    return null;
  }

  // 복호 실패는 여기서 그대로 위로 올린다. 예외 메시지에 평문·암호문·키를 넣지 않는다.
  const password = decryptDmaPassword(data.dma_password_enc, userId, keyB64);
  return { dmaUserId: data.dma_user_id, password };
}

/** `dma_users` 행 형태 (snake_case). */
type DmaUserRow = {
  dma_user_id: string;
  password_enc: string;
};

/**
 * DMA 유저의 비밀번호를 **새 표**(`dma_users` · AAD = `dma_user_id`, Phase 29 D-19)에서 읽어 복호한다.
 *
 * @returns 행이 있으면 복호된 자격증명, **없으면 `null`**(의도 표에 그 DMA 유저가 없다 — 권한 없음)
 * @throws 조회 실패 · 복호 실패(옛 AAD 로 암호화된 행 포함)면 throw — 「권한 없음」 과 갈라야 한다(S-5)
 */
export async function getDmaCredentialsByDmaUser(
  supabase: SupabaseClient,
  dmaUserId: string,
  keyB64: string,
): Promise<DmaCredentialRecord | null> {
  const { data, error } = await supabase
    .from("dma_users")
    .select("dma_user_id, password_enc")
    .eq("dma_user_id", dmaUserId)
    .maybeSingle<DmaUserRow>();

  if (error !== null) {
    // 원문 미기록(16-38 · T-16-45) — `details` 에 `password_enc` 가 실릴 수 있다. dmaUserId 도 로그 금지.
    logger.error({ pgError: safePgError(error) }, "[CRED] dma_users 조회 실패");
    throw error;
  }
  if (data === null) {
    logger.info({}, "[CRED] dma_users 행 없음 — 권한 없음");
    return null;
  }

  // AAD = dmaUserId(D-19). 옛 형식(AAD = 웹 user_id) 행이면 여기서 tag 검증이 실패해 throw 한다.
  const password = decryptDmaPassword(data.password_enc, dmaUserId, keyB64);
  return { dmaUserId: data.dma_user_id, password };
}

/** `createAccessCredentials` 가 읽는 접근 맵 표면 — `AppAccess` 가 만족한다. */
export type AccessLookup = {
  readonly loaded: boolean;
  lookup(userId: string): Promise<AppAccessEntry | undefined>;
};

/**
 * wss 인증의 자격증명 공급자 (Phase 29 · D-02 · D-19) — `WsFanoutDeps.credentials` 에 주입한다.
 *
 *   - 접근 맵 미적재(첫 적재 전 · 실패 지속) → `"not_ready"` — fanout 이 「조회 실패」 갈래(failed 프레임 + 1011)로 끝낸다.
 *     「권한 없음」 으로 위장하지 않는다(재접속 가치가 있는 장애다).
 *   - 맵에 없음(승인 대기) · viewer · DMA 연결 없음 → `null` — `unauthorized`(연결 유지 · 세션 0).
 *   - admin · trader + DMA 연결 → `dma_users` 복호(AAD = dmaUserId). 행 없음이면 `null`, 조회 · 복호 실패면 throw.
 */
export function createAccessCredentials(deps: {
  access: AccessLookup;
  supabase: SupabaseClient;
  credKey: string;
}): (userId: string) => Promise<DmaCredentials | null | "not_ready"> {
  return async (userId) => {
    const entry = await deps.access.lookup(userId);
    if (!deps.access.loaded) return "not_ready";
    if (!isDmaGranted(entry)) return null;
    const record = await getDmaCredentialsByDmaUser(deps.supabase, entry.dmaUserId, deps.credKey);
    if (record === null) return null;
    // 평문은 여기서 세션으로만 넘어간다. 로그 · 상태 프레임에 싣지 않는다.
    return { dmaUserId: record.dmaUserId, password: record.password };
  };
}
