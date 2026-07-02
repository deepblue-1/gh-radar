import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConversationRow,
  MessageRow,
  MessageBlock,
  ChatRole,
} from "@gh-radar/shared";
import { ApiError } from "../errors.js";

/**
 * Phase 14 — 대화/메시지 영속화 read/write 계층 (CHAT-01, T-14-01 IDOR mitigate).
 *
 * 서비스롤 SupabaseClient 를 인자로 받는 순수 함수 모듈. 서비스롤은 RLS 를 bypass 하므로
 * 모든 read/write 는 `.eq("user_id", userId)` 명시 소유권 필터를 직접 건다 — RLS 는
 * defense-in-depth 방어선이고, 서버 경로의 실제 방어선은 이 명시 필터다(RESEARCH Pattern 3).
 *
 * 타 사용자 conversationId 접근은 존재 여부를 누설하지 않도록 404(CONVERSATION_NOT_FOUND)
 * 로 흡수한다(T-14-01). DB 는 snake_case → 아래 매퍼가 camelCase 계약 타입으로 변환.
 */

/** conversations 테이블 row (snake_case). */
type ConversationDbRow = {
  id: string;
  user_id: string;
  stock_code: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
};

/** messages 테이블 row (snake_case). */
type MessageDbRow = {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  blocks: MessageBlock[] | null;
  created_at: string;
};

function mapConversation(r: ConversationDbRow): ConversationRow {
  return {
    id: r.id,
    userId: r.user_id,
    stockCode: r.stock_code,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMessage(r: MessageDbRow): MessageRow {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    blocks: r.blocks ?? null,
    createdAt: r.created_at,
  };
}

const ConversationNotFound = () =>
  new ApiError(404, "CONVERSATION_NOT_FOUND", "대화를 찾을 수 없습니다.");
const DbError = (msg: string) => new ApiError(500, "DB_ERROR", msg);

/**
 * 대화 소유권 검증. `WHERE id AND user_id` 명시 필터로 조회 — user_id 불일치도
 * not-found 로 흡수해 존재 여부 누설을 막는다(T-14-01). null → 404.
 */
export async function assertConversationOwner(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<ConversationRow> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw DbError("대화 조회에 실패했습니다.");
  if (!data) throw ConversationNotFound();
  return mapConversation(data as ConversationDbRow);
}

/**
 * 사용자 대화 목록. stockCode 있으면 해당 종목 대화만(D-13), 없으면 전체.
 * 최근 활동순(updated_at DESC).
 */
export async function listConversations(
  supabase: SupabaseClient,
  userId: string,
  stockCode?: string | null,
): Promise<ConversationRow[]> {
  let query = supabase.from("conversations").select("*").eq("user_id", userId);
  if (stockCode) query = query.eq("stock_code", stockCode);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw DbError("대화 목록 조회에 실패했습니다.");
  return ((data ?? []) as ConversationDbRow[]).map(mapConversation);
}

/**
 * 새 대화 생성. title 은 첫 user 메시지 앞 30자 truncate(추가 LLM 콜 없음 — RESEARCH Open Q3).
 */
export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  opts: { stockCode?: string | null; firstUserMessage: string },
): Promise<ConversationRow> {
  const title = opts.firstUserMessage.slice(0, 30);
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      stock_code: opts.stockCode ?? null,
      title,
    })
    .select("*")
    .single();
  if (error || !data) throw DbError("대화 생성에 실패했습니다.");
  return mapConversation(data as ConversationDbRow);
}

/**
 * 메시지 저장 + 대화 updated_at 갱신(목록 최신순 유지). content 는 렌더용 마크다운,
 * blocks 는 종목카드/차트/citation 구조화 부가물(D-07/08/10).
 */
export async function appendMessage(
  supabase: SupabaseClient,
  conversationId: string,
  msg: { role: ChatRole; content: string; blocks?: MessageBlock[] | null },
): Promise<void> {
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: msg.role,
    content: msg.content,
    blocks: msg.blocks ?? null,
  });
  if (insertError) throw DbError("메시지 저장에 실패했습니다.");

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/**
 * 대화 + 메시지 전체 로드. 소유권 검증 후 messages 를 created_at ASC 로 반환.
 */
export async function loadConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<{ conversation: ConversationRow; messages: MessageRow[] }> {
  const conversation = await assertConversationOwner(
    supabase,
    conversationId,
    userId,
  );
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw DbError("메시지 조회에 실패했습니다.");
  return {
    conversation,
    messages: ((data ?? []) as MessageDbRow[]).map(mapMessage),
  };
}

/**
 * 대화 삭제. 소유권 검증 후 삭제(messages 는 FK CASCADE). `.eq("user_id")` 이중 필터.
 */
export async function deleteConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<void> {
  await assertConversationOwner(supabase, conversationId, userId);
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (error) throw DbError("대화 삭제에 실패했습니다.");
}
