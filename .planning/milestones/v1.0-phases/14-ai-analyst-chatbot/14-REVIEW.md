---
phase: 14-ai-analyst-chatbot
reviewed: 2026-07-02T13:38:17Z
depth: standard
files_reviewed: 56
files_reviewed_list:
  - packages/shared/src/chat.ts
  - packages/shared/src/index.ts
  - server/src/app.ts
  - server/src/config.ts
  - server/src/middleware/__tests__/require-auth.test.ts
  - server/src/middleware/require-auth.ts
  - server/src/routes/__tests__/chat.route.test.ts
  - server/src/routes/chat.ts
  - server/src/schemas/chat.ts
  - server/src/services/__tests__/anthropic-mock.ts
  - server/src/services/__tests__/chat-history.test.ts
  - server/src/services/__tests__/chat-orchestrator.test.ts
  - server/src/services/__tests__/chat-service.test.ts
  - server/src/services/chat-history.ts
  - server/src/services/chat-orchestrator.ts
  - server/src/services/chat-prompts.ts
  - server/src/services/chat-service.ts
  - server/src/services/specialists/__tests__/specialists.test.ts
  - server/src/services/specialists/anthropic-client.ts
  - server/src/services/specialists/helpers.ts
  - server/src/services/specialists/limitup-specialist.ts
  - server/src/services/specialists/news-specialist.ts
  - server/src/services/specialists/quote-specialist.ts
  - server/src/services/specialists/theme-specialist.ts
  - server/src/services/specialists/websearch-specialist.ts
  - server/src/services/supabase.ts
  - server/src/types/express.d.ts
  - supabase/migrations/20260702170000_chat_conversations.sql
  - webapp/e2e/fixtures/chat.ts
  - webapp/e2e/specs/chat.spec.ts
  - webapp/package.json
  - webapp/src/app/chat/page.tsx
  - webapp/src/app/layout.tsx
  - webapp/src/components/chat/__tests__/chat-fab.test.tsx
  - webapp/src/components/chat/__tests__/chat-sheet.test.tsx
  - webapp/src/components/chat/__tests__/conversation-list.test.tsx
  - webapp/src/components/chat/__tests__/message-render.test.tsx
  - webapp/src/components/chat/agent-progress.tsx
  - webapp/src/components/chat/chat-fab.tsx
  - webapp/src/components/chat/chat-provider.tsx
  - webapp/src/components/chat/chat-sheet.tsx
  - webapp/src/components/chat/chat-states.tsx
  - webapp/src/components/chat/chat-thread.tsx
  - webapp/src/components/chat/citation.tsx
  - webapp/src/components/chat/composer.tsx
  - webapp/src/components/chat/conversation-list.tsx
  - webapp/src/components/chat/delete-conversation-dialog.tsx
  - webapp/src/components/chat/message-assistant.tsx
  - webapp/src/components/chat/message-user.tsx
  - webapp/src/components/chat/mini-chart.tsx
  - webapp/src/components/chat/mini-stock-card.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/stock/stock-detail-client.tsx
  - webapp/src/lib/__tests__/chat-sse.test.ts
  - webapp/src/lib/chat-api.ts
  - webapp/src/lib/chat-sse.ts
findings:
  critical: 0
  warning: 8
  info: 12
  total: 20
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-02T13:38:17Z
**Depth:** standard
**Files Reviewed:** 56
**Status:** issues_found

## Summary

Phase 14 (AI 애널리스트 챗봇) 전체 — 서버(SSE 챗 라우트, requireAuth, 팀장 tool-use 루프, 전문가 5종, 대화 영속화, RLS 마이그레이션)와 웹앱(FAB/시트/`/chat` 페이지, SSE 파서, 마크다운 렌더) 및 테스트/E2E 를 표준 깊이로 검토했다.

**보안 관점은 전반적으로 견고하다.** 중점 항목 결과:

- **JWT 검증(T-14-02)**: `requireAuth` 가 `supabase.auth.getUser(jwt)` 로 검증하고 SSE 헤더 쓰기 전에 401 을 반환한다. 서비스롤 클라 재사용도 안전한 패턴. 이상 없음.
- **IDOR(T-14-01)**: `chat-history` 모든 read/write 가 `.eq("user_id", userId)` 명시 필터 + 미소유 404 흡수. RLS 마이그레이션도 `authenticated` role 명시 + messages EXISTS 서브쿼리로 defense-in-depth 완성(UPDATE 정책의 WITH CHECK 생략은 Postgres 기본 규칙상 USING 재사용이므로 안전). 이상 없음.
- **XSS(T-14-10)**: react-markdown 이 rehype-raw 없이 사용되어 raw HTML 이 이스케이프되고, react-markdown 기본 urlTransform 이 `javascript:` 링크를 차단한다. 이상 없음(Citation href 는 IN-12 참고).
- **입력 검증**: zod 로 message 길이/uuid/6자리 종목코드 검증 — 경계 적절.
- **SSE 자원**: keepalive `clearInterval` 이 finally 에서 보장되고, `done` 이벤트도 항상 전송된다.

Critical 은 없다. Warning 8건은 (1) 코드 없는 테마/뉴스 질의가 대표 예시 프롬프트("오늘 주도 테마는?")를 사실상 무력화하는 설계-구현 불일치, (2) SSE 재시도/멀티라운드에서 표시 텍스트와 저장 텍스트가 어긋나는 스트림 정합성 문제, (3) 클라이언트 비동기 경쟁/에러 처리 누락이 중심이다.

## Warnings

### WR-01: 코드 없는 theme/news 질의 — 오케스트레이터 의도와 전문가 구현이 모순 (대표 프롬프트 무력화)

**File:** `server/src/services/specialists/theme-specialist.ts:78`, `server/src/services/specialists/news-specialist.ts:79`, `server/src/services/chat-orchestrator.ts:25,70-75`
**Issue:** 오케스트레이터는 "news/theme/websearch 는 code 없이도 유효(테마/뉴스/웹은 코드 무관 질의 가능)하므로 guard 미적용"이라 명시하고, theme tool description 도 "오늘 주도 테마…분석"을 약속한다. 그러나 `consultThemeSpecialist`/`consultNewsSpecialist` 는 `if (!input.code) return SPECIALIST_UNAVAILABLE;` 로 즉시 포기한다. 결과적으로 EmptyState 대표 예시 칩 "오늘 주도 테마는?" 같은 코드 없는 질의에서 팀장이 theme 전문가를 호출해도 "실시간 분석을 사용할 수 없습니다"만 받는다 — DB(themes.top3_avg_change_rate)로 답할 수 있는 질문이 비싼 websearch 로 흘러가거나 "확인되지 않았다"로 끝난다. `chat-orchestrator.test.ts` Test 5 는 전문가를 mock 하기 때문에 이 불일치를 잡지 못한다(“news/theme 는 code 없이도 유효 — 호출됨” assert 가 실제 동작과 다름).
**Fix:** 둘 중 하나로 정합화:
```ts
// theme-specialist.ts — code 없으면 "오늘 주도 테마" 컨텍스트로 폴백
async function fetchLeadingThemes(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("themes")
    .select("name,description,top3_avg_change_rate")
    .eq("hidden", false)
    .order("top3_avg_change_rate", { ascending: false })
    .limit(10);
  return { leadingThemes: data ?? [] };
}
// consultThemeSpecialist: input.code ? fetchThemeContext(...) : fetchLeadingThemes(...)
```
news 도 동일하게 code 없으면 최근 전체 뉴스 상위 N 건 폴백. 폴백을 구현하지 않는다면 orchestrator 의 code guard 를 theme/news 에도 확장하고 tool description 에서 "오늘 주도 테마" 문구를 제거해 팀장이 잘못 호출하지 않게 해야 한다.

### WR-02: 스트리밍 중 재시도 시 `text_clear` 미전송 — 클라이언트 텍스트 중복

**File:** `server/src/services/chat-service.ts:381-399,485-507`
**Issue:** 팀장 스트림이 부분 text delta 를 SSE 로 이미 내보낸 뒤 429/529 로 실패하면 retry 가 스트림을 처음부터 다시 소비한다. 서버는 `textBuffer` 를 리셋하지만 클라이언트로 이미 나간 `text` 이벤트는 회수되지 않으므로, 클라이언트 `assembled` 에는 이전 시도의 부분 텍스트 + 재시도 전체 텍스트가 이어붙는다(중복 표시 + `response_complete` 시 중복 저장된 메시지로 확정). SSE 계약(`ChatSSEEventMap.text_clear`)과 클라이언트 핸들러(chat-sheet/page 의 `text_clear` case)는 이미 존재하지만 **서버가 이 이벤트를 어디서도 전송하지 않는다**(dead contract).
**Fix:** 두 retry 지점(팀장 루프, recovery 콜)에서 재시도 직전에 clear 를 보낸다:
```ts
} catch (err) {
  if (isRetryableError(err) && attempt < MAX_RETRIES) {
    if (textBuffer) sendSSE(res, "text_clear", {});
    await sleep(1000 * (attempt + 1));
    continue;
  }
  throw err;
}
```

### WR-03: 저장되는 assistant content ≠ 사용자가 본 텍스트 (멀티라운드 중간 텍스트 유실)

**File:** `server/src/services/chat-service.ts:351,381-391,457`
**Issue:** 팀장이 tool_use 전 라운드에서 텍스트를 먼저 내보내는 경우("전문가에게 확인해볼게요…" 류), 그 delta 들은 SSE 로 전송되어 클라이언트 `assembled` 에 누적되지만, 서버의 `finalText = textBuffer || messageText(finalMessage)` 는 **마지막 라운드의 buffer 만** 사용한다(`textBuffer` 가 라운드마다 리셋). 결과: (a) 화면에 표시·확정된 메시지와 DB 에 저장된 `content` 가 다르고, (b) 대화 재로드/이어가기 시 히스토리가 사용자가 본 것과 달라지며 팀장 컨텍스트에서도 중간 서술이 사라진다.
**Fix:** 라운드 루프 바깥에 누적 변수를 두고 저장에 사용한다:
```ts
let accumulatedText = "";           // 루프 밖
// ... 각 라운드 스트림 소비 후:
accumulatedText += textBuffer;
// end_turn 분기:
finalText = accumulatedText || messageText(finalMessage);
```
(WR-02 의 text_clear 를 도입하면 clear 시점에 accumulated 도 함께 리셋해 클라이언트와 동일 규칙 유지.)

### WR-04: 웹서치 전문가 — 첫 text 블록만 추출해 실제 답변 유실 위험

**File:** `server/src/services/specialists/helpers.ts:15-18`, `server/src/services/specialists/websearch-specialist.ts:111`
**Issue:** `specialistText` 는 `content.find(c => c.type === "text")` 로 **첫 번째** text 블록만 반환한다. 데이터 전문가 4종(단일 text 블록)에는 문제없지만, web_search 서버 tool 응답은 통상 `[text(검색 전 서두), server_tool_use, web_search_tool_result, text(인용 포함 실제 요약)]` 처럼 여러 text 블록이 섞인다. 이 경우 팀장 tool_result 에 "검색해볼게요" 류 서두만 전달되고 실제 검색 요약이 유실될 수 있다. (`chat-service.ts` 의 `messageText` 는 이미 전체 text 블록을 join 하는 올바른 패턴을 갖고 있다.)
**Fix:** websearch 경로는 전체 text 블록을 join:
```ts
// websearch-specialist.ts
const text = res.content
  .filter((b): b is Anthropic.TextBlock => b.type === "text")
  .map((b) => b.text)
  .join("\n")
  .trim();
return { text: text || WEBSEARCH_UNAVAILABLE, citations: extractCitations(res) };
```

### WR-05: 대화 삭제 실패 시 무처리 — unhandled rejection + 무피드백

**File:** `webapp/src/components/chat/delete-conversation-dialog.tsx:48-57`
**Issue:** `handleDelete` 가 `try { await deleteConversation(...) } finally { ... }` 구조로 **catch 가 없다**. 서버 404/500/네트워크 실패 시 rejection 이 onClick 핸들러 밖으로 새어 unhandled promise rejection 이 되고, 다이얼로그는 열린 채 아무 피드백 없이 버튼만 다시 활성화된다.
**Fix:**
```ts
try {
  await deleteConversation(conversation.id);
  onDeleted(conversation.id);
} catch {
  setError(true); // "삭제에 실패했어요. 다시 시도해 주세요." 표시
} finally {
  setDeleting(false);
}
```

### WR-06: 전송 중 새 전송/abort 시 `isStreaming` 상태 경쟁 — 이전 finally 가 새 스트림 상태를 덮음

**File:** `webapp/src/components/chat/chat-sheet.tsx:241-243`, `webapp/src/app/chat/page.tsx:211-213`
**Issue:** `send()` 는 먼저 `abortRef.current?.abort()` 후 `setIsStreaming(true)` 를 호출한다. 이전 `send` 호출의 rejection(abort) 은 마이크로태스크로 처리되므로, 이전 호출의 `finally { setIsStreaming(false) }` 가 **새 호출이 true 로 설정한 뒤에** 실행될 수 있다. 결과: 새 스트림이 진행 중인데 composer 가 유휴 상태(전송 버튼/입력 활성)로 표시되고, 정지 버튼이 사라진다. `startNewConversation`/`selectConversation` 의 abort → `setIsStreaming(false)` 경로도 동일 계열.
**Fix:** controller 정체성 가드:
```ts
} finally {
  if (abortRef.current === controller) setIsStreaming(false);
}
```

### WR-07: 클라이언트 disconnect 후 동일 대화 재요청 — 두 생성 스트림의 동시 appendMessage 로 히스토리 순서 꼬임

**File:** `server/src/services/chat-service.ts:289-296,527-532`
**Issue:** interrupt 가드는 `existing?.busy && !existing.busyAbortSignal?.aborted` 일 때만 이전 요청을 abort 한다. 사용자가 시트를 닫아(clientAbort) 생성이 백그라운드로 계속되는 동안(D-06 의도) 재접속해 같은 대화에 새 메시지를 보내면, 이전 생성은 interrupt 되지 않고 **두 스트림이 동시에** 같은 conversation 에 user/assistant 쌍을 append 한다. created_at 순서가 `user2, user1, assistant1, assistant2` 처럼 인터리브될 수 있고, 새 요청의 히스토리 복원 시점에는 이전 교환이 아직 저장 전이라 팀장 컨텍스트에서도 누락된다. 복원 시 `sanitizeMessages` 의 연속 role 제거가 인터리브된 메시지를 **삭제**하므로 팀장에게 보이는 히스토리 손실로도 이어진다.
**Fix:** 최소 변경으로는 busy 세션이 살아있는 한(클라이언트 disconnect 여부와 무관하게 append 이전이면) 새 요청 시작을 짧게 직렬화하거나, append 완료를 세션에 promise 로 걸어 새 요청의 히스토리 복원 전에 `await session.pendingPersist` 하는 방식을 권한다:
```ts
// 세션에 pendingPersist: Promise<void> 저장 → 새 요청 top 에서
await sessions.get(sessionKey)?.pendingPersist?.catch(() => {});
```

### WR-08: 전문가 무로그 fail-safe — 빈 text 폴백 시 stop_reason 미로깅 (프로젝트 lesson 위반)

**File:** `server/src/services/specialists/quote-specialist.ts:93`, `theme-specialist.ts:93`, `news-specialist.ts:94`, `limitup-specialist.ts:112`, `websearch-specialist.ts:111`
**Issue:** `specialistText(res) || SPECIALIST_UNAVAILABLE` 폴백은 응답에 text 블록이 없거나 비었을 때(예: `stop_reason: "max_tokens"` 절단, 예상 밖 블록 구성) **아무 로그 없이** 안내 문구를 반환한다. 프로젝트 lesson(무로그 fail-safe 금지 — "LLM 워커 catch 는 stop_reason 포함 로깅, threshold 변경 시 출력 상한 같이 점검")과 어긋난다. max_tokens=700/1024 상한에서 간헐 절단이 생겨도 원인 추적이 불가능하다. 또한 전문가 usage(input/output tokens)가 어디에도 로깅되지 않아 비용 로깅(Pitfall 4)이 팀장 몫만 집계된다.
**Fix:**
```ts
const text = specialistText(res);
if (!text) {
  logger.warn(
    { code: input.code, stopReason: res.stop_reason, usage: res.usage },
    "quote specialist empty text — fallback",
  );
  return SPECIALIST_UNAVAILABLE;
}
```
아울러 정상 경로에서도 `logger.info({ usage: res.usage, model }, "[chat] specialist usage")` 1줄 추가 권장.

## Info

### IN-01: Haiku 잔존 주석 — 모델 문서 드리프트

**File:** `server/src/services/specialists/websearch-specialist.ts:17`, `server/src/services/chat-prompts.ts:4,56-66`, `server/src/services/specialists/__tests__/specialists.test.ts:89` 등
**Issue:** 모델이 전면 Sonnet 5 로 확정(config 기본값)됐는데 주석/docstring 이 "Haiku 1콜", "chatWebSearchModel 기본 Haiku — claude-sonnet-4-6 폴백" 등 구모델 서술을 유지한다. deploy default 회귀 함정(메모리 lesson)과 결합하면 운영 중 혼선 소지.
**Fix:** 주석의 Haiku 언급을 "전문가 모델(chatSpecialistModel)" 로 일괄 치환.

### IN-02: 스트림 실패 시 빈 대화 row 잔존

**File:** `server/src/services/chat-service.ts:318-324`
**Issue:** `createConversation` 이 스트리밍 전에 실행되므로 이후 실패(키 미설정, API 에러) 시 메시지 0건짜리 대화가 목록에 남는다.
**Fix:** 첫 `appendMessage` 성공 시점으로 생성을 미루거나, 실패 finally 에서 메시지 0건 대화를 정리.

### IN-03: `AbortSignal.any([단일 signal])` — 불필요한 래핑

**File:** `server/src/services/chat-service.ts:300`
**Issue:** 원소 1개짜리 `AbortSignal.any` 는 `interruptController.signal` 그대로와 동일하다(과거 clientAbort 포함 흔적으로 보임).
**Fix:** `const effectiveSignal = interruptController.signal;`

### IN-04: 팀장 경로에서 anthropicApiKey 미검사 — 빈 키 싱글톤 고착

**File:** `server/src/services/chat-service.ts:340`, `server/src/services/specialists/anthropic-client.ts:16-20`
**Issue:** `getChatAnthropicClient(cfg.anthropicApiKey ?? "")` — 키 미설정으로 부팅되면 빈 키 클라이언트가 싱글톤으로 캐시되고 팀장 콜은 401 로 실패해 generic error 만 스트림된다(전문가는 graceful 안내를 주는 것과 비대칭).
**Fix:** 루프 진입 전 `if (!cfg.anthropicApiKey)` 체크 후 친절한 error 이벤트 + 조기 종료.

### IN-05: `SpecialistInput` 인터페이스 중복 정의

**File:** `server/src/services/chat-orchestrator.ts:29-32`, `server/src/services/specialists/quote-specialist.ts:24-27`
**Issue:** 동일 shape 인터페이스가 두 곳에 선언되어 있고 나머지 전문가는 quote-specialist 에서 import 한다. 도메인 타입이 전문가 파일에 얹혀 있는 것도 부자연스럽다.
**Fix:** orchestrator(또는 shared)로 단일화하고 전문가들이 그것을 import.

### IN-06: `appendMessage` 의 updated_at 갱신 결과 미확인

**File:** `server/src/services/chat-history.ts:142-145`
**Issue:** conversations.updated_at UPDATE 의 error 를 확인하지 않아 실패 시 목록 최신순 정렬이 조용히 어긋난다.
**Fix:** `const { error } = await ...; if (error) logger.warn(...)` (실패해도 메시지 저장은 성공이므로 warn 로깅으로 충분).

### IN-07: client disconnect 후 destroyed 소켓에 계속 write

**File:** `server/src/services/chat-service.ts:65-72`, `server/src/routes/chat.ts:83-85,106-109`
**Issue:** D-06 설계상 시트 닫힘 후에도 생성이 계속되는데, `sendSSE`/keepalive 는 `writableEnded` 만 검사한다. 클라이언트 disconnect 후엔 `res.destroyed` 가 true 이고 `writableEnded` 는 false 로 남아 종료 시까지 모든 write 가 destroyed 스트림으로 향한다(Node 가 흡수하므로 crash 는 아니지만 불필요).
**Fix:** `if (res.writableEnded || res.destroyed) return;` 으로 조건 보강 (finally 의 done/end 도 동일).

### IN-08: 미소유 conversationId 로 POST 시 SSE 헤더 이후 404 → 200 + generic error

**File:** `server/src/routes/chat.ts:75-93`, `server/src/services/chat-service.ts:312`
**Issue:** POST / 의 소유권 검증(loadConversation)은 writeHead(200) 이후에 실행되어, 미소유/삭제된 대화 id 는 404 대신 200 SSE + "처리 중 문제가 발생했어요" 로 끝난다. 정보 누설은 없으나(오히려 균일 에러) 클라이언트가 "대화가 사라졌음"을 구분해 새 대화로 리셋할 수 없다.
**Fix:** conversationId 가 있으면 writeHead 전에 `assertConversationOwner` 를 선호출해 404 JSON 을 반환하는 방안 검토.

### IN-09: SSE 이벤트 switch 분기 ~100줄이 시트/페이지에 중복

**File:** `webapp/src/components/chat/chat-sheet.tsx:141-246`, `webapp/src/app/chat/page.tsx:116-216`
**Issue:** 동일한 send/abort/이벤트 축적 로직이 두 곳에 복제되어 있다(주석으로 wave 격리 의도는 인지). WR-02/WR-06 류 수정이 두 곳에 각각 필요해지는 유지보수 비용.
**Fix:** 후속 phase 에서 `useChatStream()` 공용 훅으로 추출 권장.

### IN-10: interrupt 세션 키 경계 — 새 대화 첫 메시지(userId 키)와 후속 메시지(conversationId 키) 불연속

**File:** `server/src/services/chat-service.ts:289`
**Issue:** 세션 키가 `conversationId ?? userId` 라서, 새 대화의 첫 요청(키=userId) 진행 중 클라이언트가 `session` 이벤트로 받은 conversationId 를 붙여 재요청하면(키=conversationId) 이전 요청이 interrupt 되지 않는다.
**Fix:** 첫 요청도 conversation 생성 직후 세션 키를 conversationId 로 재등록하거나, userId 레벨 세션도 함께 조회.

### IN-11: `hasWebSearchError` 가 부분 성공(max_uses_exceeded)도 전체 폐기

**File:** `server/src/services/specialists/websearch-specialist.ts:72-82,106-109`
**Issue:** 검색 3회 성공 후 4번째 시도가 `max_uses_exceeded` 로 에러 블록을 남기면, 유효한 요약/인용까지 버리고 "실시간 검색을 사용할 수 없습니다"를 반환한다.
**Fix:** error 블록이 있어도 text/citations 가 존재하면 그대로 반환하고 warn 로깅만 남기는 완화 검토.

### IN-12: Citation href 프로토콜 미검증 (defense-in-depth)

**File:** `webapp/src/components/chat/citation.tsx:36-40`
**Issue:** citation url 은 web_search 결과/DB 뉴스에서만 오므로 현재 위협은 낮지만, blocks 는 DB jsonb 로 왕복 저장되는 데이터라 향후 소스가 늘면 `javascript:` 류가 그대로 href 에 들어갈 수 있다(react-markdown 링크와 달리 sanitizer 를 거치지 않음).
**Fix:** `hostnameOf` 처럼 `new URL(url)` 파싱 후 `http:`/`https:` 만 허용, 아니면 링크 비활성 렌더.

---

_Reviewed: 2026-07-02T13:38:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
