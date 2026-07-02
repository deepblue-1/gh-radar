/**
 * Phase 14 Plan 07 — 챗 대화관리 API 래퍼 (CHAT-01, D-13).
 *
 * 대화 목록/상세/삭제는 JSON 응답이므로 lib/api.ts 의 `apiFetch`(Phase 2 envelope +
 * 8s 타임아웃)를 재사용한다. SSE 스트리밍(POST /api/chat)만 chat-sse.ts 의 raw fetch 로
 * 분리 — 이 모듈은 스트림이 아니므로 apiFetch 로 충분하다.
 *
 * 서버 챗 라우트는 requireAuth(P03) — `Authorization: Bearer <access_token>` 필수.
 * apiFetch 는 헤더 주입을 지원(ApiFetchInit.headers)하므로, getSession 으로 토큰을
 * 취득해 헤더로 부착하는 얇은 래퍼(withAuth)만 얹는다.
 */

import type { ConversationRow, MessageRow } from "@gh-radar/shared";

import { apiFetch, ApiClientError, type ApiFetchInit } from "./api";
import { createClient } from "./supabase/client";

/** getConversation 응답 — 대화 메타 + 메시지 목록(오래된→최신). */
export interface ConversationDetail {
  conversation: ConversationRow;
  messages: MessageRow[];
}

/**
 * Supabase access_token 을 Authorization 헤더로 주입한 apiFetch 래퍼.
 * 세션이 없으면 서버 왕복 없이 401 성격의 ApiClientError 를 throw(로그인 게이트).
 */
async function authFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
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

/**
 * 로그인 사용자의 대화 목록을 조회한다.
 * @param stockCode 지정 시 해당 종목 컨텍스트 대화만(종목별 필터, D-13).
 */
export function listConversations(stockCode?: string): Promise<ConversationRow[]> {
  const qs = stockCode ? `?stockCode=${encodeURIComponent(stockCode)}` : "";
  return authFetch<ConversationRow[]>(`/api/chat/conversations${qs}`);
}

/** 단일 대화의 메타 + 메시지 전체를 조회한다. */
export function getConversation(id: string): Promise<ConversationDetail> {
  return authFetch<ConversationDetail>(
    `/api/chat/conversations/${encodeURIComponent(id)}`,
  );
}

/** 대화를 삭제한다(messages ON DELETE CASCADE). 소유권 불일치는 서버가 404 로 흡수. */
export function deleteConversation(id: string): Promise<void> {
  return authFetch<void>(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type { ConversationRow, MessageRow };
