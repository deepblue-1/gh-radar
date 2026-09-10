/**
 * `authFetch` — Supabase access_token 을 Authorization 헤더로 주입한 `apiFetch` 래퍼.
 *
 * quick-260910-jce 에서 `chat-api.ts` 의 private 함수를 **본문 무변경으로** 이 파일로 옮겼다.
 * 옮긴 이유는 하나다: `GET /api/orders` 도 같은 `requireAuth(P03)` 규약을 쓰는데, 사본을
 * 하나 더 만들면 인증 패턴이 두 벌이 되고 언젠가 한쪽만 고쳐진다(T-16-14 와 같은 규율).
 * **새 인증 방식을 발명하지 않는다** — 서버 라우트가 요구하는 것은 언제나
 * `Authorization: Bearer <supabase access_token>` 하나다.
 *
 * 세션이 없으면 서버 왕복 없이 401 성격의 `ApiClientError` 를 throw 한다(로그인 게이트).
 */

import { apiFetch, ApiClientError, type ApiFetchInit } from "./api";
import { createClient } from "./supabase/client";

export async function authFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (!session) {
    throw new ApiClientError({
      code: "UNAUTHENTICATED",
      message: "로그인이 필요합니다.",
      status: 401,
    });
  }

  return apiFetch<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers ?? {}),
    },
  });
}
