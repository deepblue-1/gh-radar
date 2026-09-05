/**
 * Phase 15 Plan 04 — RELAY-01. wss 첫 메시지 토큰 검증 (순수함수).
 *
 * `server/src/middleware/require-auth.ts` 이식. server 는 express 미들웨어지만 relay 의
 * 진입점은 wss 첫 메시지(D-11)라 **미들웨어가 아니라 함수**여야 한다. 검증 방식 자체는
 * 두 진입점이 완전히 같다 — 같은 `getUser(token)` 네트워크 위임이다.
 *
 * 결정 근거:
 *   D-10  검증은 **네트워크 검증 한 가지**다. 로컬 서명 검증(오프라인 공개키 라이브러리)은
 *         도입하지 않는다 — 로컬 검증은 로그아웃·revoke 를 만료 시각까지 반영하지 못한다.
 *         증권 계좌를 다루는 표면에서 "로그아웃했는데 아직 붙어 있다"는 허용할 수 없다.
 *   D-11  토큰은 **첫 메시지 본문 전용**이다. URL·쿼리스트링에 실으면 Caddy 액세스 로그와
 *         브라우저 히스토리에 그대로 남는다 (T-15-04). 이 함수도 URL 을 만들지 않는다.
 *
 * 하지 않는 것:
 *   - 실패 사유를 호출자에게 돌려주지 않는다. `null` 하나다 — 만료·위조·revoke 를 구분해
 *     알려 주는 것은 공격자에게 주는 정보다. 진단은 로그에만 남긴다.
 *   - 토큰 값을 로그에 넣지 않는다(logger 의 `*.token` redact 는 2차 방어다).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";

/**
 * 액세스 토큰을 검증하고 gh-radar 사용자 id 를 돌려준다.
 *
 * @returns 검증 성공 시 `user.id`, 실패(빈 토큰·검증 오류·사용자 없음)면 `null`
 */
export async function verifyToken(
  supabase: SupabaseClient,
  token: string,
): Promise<string | null> {
  if (token === "") {
    logger.warn("[WS] 빈 토큰 — 인증 실패");
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error !== null) {
    // 사유는 로그에만 남긴다. 브라우저에는 close 코드 4401 하나로만 알린다.
    logger.warn({ reason: error.message }, "[WS] 토큰 검증 실패");
    return null;
  }
  if (data.user === null) {
    logger.warn("[WS] 토큰은 유효하나 사용자가 없다 — 인증 실패");
    return null;
  }

  return data.user.id;
}
