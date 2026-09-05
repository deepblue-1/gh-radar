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
 *   D-18  저장 포맷은 **base64(nonce(12B) ‖ tag(16B) ‖ ciphertext)**, AAD = `user_id`.
 *         AAD 를 거는 이유는 **행 이동 공격**을 막기 위해서다 — DB 를 쓸 수 있는 공격자가
 *         A 사용자의 암호문을 B 행에 복사해도 tag 검증이 실패한다.
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

import { logger } from "../logger.js";

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
 * 관리자 등록 스크립트(15-05)와 테스트가 쓰는 **대칭 함수**다. relay 런타임은 복호만 한다.
 * nonce 는 호출마다 새로 뽑는다 — 같은 평문을 두 번 암호화해도 결과가 달라야 한다
 * (GCM 은 nonce 재사용 시 평문이 드러난다).
 */
export function encryptDmaPassword(plain: string, userId: string, keyB64: string): string {
  const key = parseKey(keyB64);
  // 매 호출 새 nonce — `NONCE_BYTES = 12` 이므로 실질적으로 randomBytes(12) 다.
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  // AAD = user_id. 암호문을 다른 사용자 행으로 옮기는 공격을 tag 검증으로 막는다.
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/**
 * 저장 포맷을 평문으로 복호한다.
 *
 * 키 불일치·AAD(user_id) 불일치·본문 변조는 전부 tag 검증 실패로 **예외**가 된다.
 * "복호는 됐는데 값이 이상하다"는 상태를 만들지 않는 것이 GCM 을 쓰는 이유다.
 *
 * @throws 포맷이 짧거나 tag 검증에 실패하면 throw. 상위는 `unauthorized` 로 처리한다.
 */
export function decryptDmaPassword(enc: string, userId: string, keyB64: string): string {
  const key = parseKey(keyB64);
  const blob = Buffer.from(enc, "base64");
  if (blob.length < MIN_BLOB_BYTES) {
    throw new Error(`자격증명 암호문이 너무 짧습니다 (${blob.length}B)`);
  }

  const nonce = blob.subarray(0, NONCE_BYTES);
  const tag = blob.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const ciphertext = blob.subarray(NONCE_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(tag);
  // final() 이 tag 를 검증한다 — 실패하면 여기서 throw 된다.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * 사용자의 DMA 자격증명을 읽어 복호한다.
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
    logger.error({ userId, error }, "[CRED] dma_credentials 조회 실패");
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
