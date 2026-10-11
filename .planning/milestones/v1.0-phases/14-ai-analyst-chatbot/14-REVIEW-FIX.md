---
phase: 14-ai-analyst-chatbot
fixed_at: 2026-07-02T13:56:29Z
review_path: .planning/phases/14-ai-analyst-chatbot/14-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-07-02T13:56:29Z
**Source review:** .planning/phases/14-ai-analyst-chatbot/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (Critical 0 + Warning 8, fix_scope=critical_warning — Info 12건 제외)
- Fixed: 8
- Skipped: 0

**최종 검증:** server 전체 스위트 29 files / 219 tests green, webapp 전체 스위트 37 files / 286 tests green(1 skipped), server·webapp `tsc --noEmit` clean, working tree clean.

## Fixed Issues

### WR-01: 코드 없는 theme/news 질의 — 오케스트레이터 계약과 전문가 구현 정합화

**Files modified:** `server/src/services/specialists/theme-specialist.ts`, `server/src/services/specialists/news-specialist.ts`, `server/src/services/specialists/__tests__/specialists.test.ts`
**Commit:** 3bcd429
**Applied fix:** REVIEW 의 폴백 구현 방안 채택. theme 전문가에 `fetchLeadingThemes`(themes를 `top3_avg_change_rate` desc, `hidden=false`, nullsFirst:false, 상위 10건) 폴백, news 전문가에 `fetchRecentNews`(최근 7일 전체 뉴스 상위 20건, 종목코드 포함) 폴백 추가. `if (!input.code) return SPECIALIST_UNAVAILABLE` 조기 포기 제거 → code 유무로 컨텍스트 분기. "오늘 주도 테마는?" 대표 예시 칩이 실제 DB 데이터로 답변 가능해짐. 폴백 경로 검증 테스트 2건(Test 2b/3b) 추가.

### WR-02: 스트리밍 재시도 시 `text_clear` 미전송 (dead contract)

**Files modified:** `server/src/services/chat-service.ts`
**Commit:** 9aecbd1
**Applied fix:** 팀장 루프와 recovery 콜 두 retry 지점에서, 부분 text delta 가 이미 나간 경우(`textBuffer`/`recoveryText` 비어있지 않음) 재시도 직전에 `sendSSE(res, "text_clear", {})` 전송. 클라이언트 핸들러(chat-sheet/page)의 기존 `text_clear` case 가 활성화되어 재시도 시 텍스트 중복 표시/저장이 방지됨.
**참고:** retry 경로 자체는 유닛테스트 미커버(스트림 mock 이 429/529 를 재현하지 않음) — 로직 정확성은 human verification 권장 (fixed: requires human verification).

### WR-03: 저장되는 assistant content ≠ 사용자가 본 텍스트 (멀티라운드 중간 텍스트 유실)

**Files modified:** `server/src/services/chat-service.ts`
**Commit:** 441a778
**Applied fix:** 라운드 루프 밖에 `accumulatedText` 누적 변수 도입. 각 라운드 스트림 소비 후 `accumulatedText += textBuffer`, end_turn 시 `finalText = accumulatedText || messageText(finalMessage)`. recovery 경로도 `recoveryText` 로 분리 후 `finalText = accumulatedText + recoveryText` 로 화면 표시분 전체와 저장 content 를 일치시킴. WR-02 의 text_clear 이후에는 `accumulatedText` 를 다시 SSE 로 밀어 "클라이언트 누적 == accumulated" 규칙 유지 (REVIEW 의 'clear 시점 accumulated 동반 리셋' 대신, 이전 라운드 텍스트를 보존하는 재전송 방식 채택 — 화면/DB 양쪽에서 중간 서술이 살아남는 상위 호환).
**참고:** 멀티라운드 중간 텍스트 시나리오는 기존 Test 5 골격이 delta 빈 배열이라 직접 커버되지 않음 — human verification 권장 (fixed: requires human verification).

### WR-04: 웹서치 전문가 — 첫 text 블록만 추출해 실제 답변 유실

**Files modified:** `server/src/services/specialists/websearch-specialist.ts`, `server/src/services/specialists/__tests__/specialists.test.ts`
**Commit:** d4d826e
**Applied fix:** `specialistText`(첫 블록만) 대신 REVIEW 제안대로 전체 text 블록을 filter→map→`join("\n")`→trim 하도록 교체 (chat-service `messageText` 와 동일 패턴). 미사용이 된 `specialistText` import 제거. 멀티 블록(서두 text + server_tool_use + web_search_tool_result + 요약 text) 응답에서 요약과 citations 이 모두 보존됨을 검증하는 Test 1b 추가.

### WR-05: 대화 삭제 실패 시 무처리 — unhandled rejection + 무피드백

**Files modified:** `webapp/src/components/chat/delete-conversation-dialog.tsx`, `webapp/src/components/chat/__tests__/conversation-list.test.tsx`
**Commit:** 9600ac2
**Applied fix:** `handleDelete` 에 catch 추가 → `error` state 로 "삭제에 실패했어요. 다시 시도해 주세요." 를 `role="alert"` 로 표시(기존 디자인 토큰 `--destructive`/`--t-sm` 사용). 재시도 시작 시와 다이얼로그 닫힘 시 error 리셋. 실패 시 onDeleted 미호출 + 버튼 재활성(재시도 가능) 검증 테스트(Test 5) 추가.

### WR-06: 전송 중 새 전송/abort 시 `isStreaming` 상태 경쟁

**Files modified:** `webapp/src/components/chat/chat-sheet.tsx`, `webapp/src/app/chat/page.tsx`
**Commit:** cd5bcd1
**Applied fix:** REVIEW 제안대로 두 파일의 `send()` finally 에 controller 정체성 가드 적용: `if (abortRef.current === controller) setIsStreaming(false);`. 이전 send 의 abort rejection 마이크로태스크가 새 스트림이 설정한 `isStreaming=true` 를 덮어쓰는 경쟁 차단.
**참고:** IN-09 가 지적한 시트/페이지 중복 로직이라 두 곳 모두 동일 수정. 마이크로태스크 타이밍 경쟁은 유닛테스트로 재현이 어려워 human verification 권장 (fixed: requires human verification).

### WR-07: disconnect 후 동일 대화 재요청 — 두 생성 스트림의 동시 append 인터리브

**Files modified:** `server/src/services/chat-service.ts`, `server/src/services/__tests__/chat-service.test.ts`
**Commit:** 1849b56
**Applied fix:** REVIEW 권장안(pendingPersist promise) 채택. `ChatSession` 에 `pendingPersist?: Promise<void>` 추가 — resolve 전용 deferred 를 요청 시작 시 세션에 걸고 finally 에서 항상 resolve(실패 경로 포함). 새 요청은 히스토리 복원(`loadConversation`) 전에 이전 세션의 `pendingPersist` 를 await → 이전 생성(백그라운드 계속 포함)의 user/assistant 저장이 끝난 뒤에만 복원 시작. created_at 인터리브와 sanitizeMessages 의 연속 role 삭제로 인한 히스토리 손실 차단. 직렬화 순서를 검증하는 Test 6b(append gate 로 저장 지연 후 load 순서 assert) 추가. 기존 interrupt 테스트(Test 6) 회귀 없음.

### WR-08: 전문가 무로그 fail-safe — stop_reason 미로깅 (프로젝트 lesson 위반)

**Files modified:** `server/src/services/specialists/quote-specialist.ts`, `theme-specialist.ts`, `news-specialist.ts`, `limitup-specialist.ts`, `websearch-specialist.ts`
**Commit:** d33b310
**Applied fix:** 전문가 5종 모두에서 `specialistText(res) || SPECIALIST_UNAVAILABLE` 무로그 폴백 제거. 빈 text 시 `logger.warn({ code, stopReason: res.stop_reason, usage: res.usage }, "... empty text — fallback")` 로깅 후 안내 문구 반환, 정상 경로에는 `logger.info({ code, model, usage }, "[chat] {id} specialist usage")` 1줄 추가 — REVIEW 가 함께 지적한 전문가 usage 비용 미집계(Pitfall 4)도 해소. 프로젝트 lesson "무로그 fail-safe 금지 + stop_reason 포함 로깅" 준수.

## 비고

- 챗 모델 관련 제약 준수: 수정 과정에서 temperature/top_p/top_k 등 sampling 파라미터는 일절 추가하지 않음 (Sonnet 5 400 거부).
- 면책 문구는 재도입하지 않음 (사용자 결정 유지).
- WR-02/WR-03/WR-06 은 syntax/테스트 통과로는 의미 정합성이 완전히 증명되지 않는 스트림/타이밍 로직 — 검증(verifier) 단계에서 429 재시도·멀티라운드·연속 전송 시나리오의 수동 확인 권장.

---

_Fixed: 2026-07-02T13:56:29Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
