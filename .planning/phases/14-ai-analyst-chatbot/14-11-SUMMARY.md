---
phase: 14-ai-analyst-chatbot
plan: 11
subsystem: infra
tags: [e2e, playwright, cloud-run, vercel, sse, web-search, sonnet-5, production, smoke]

# Dependency graph
requires:
  - phase: 14-ai-analyst-chatbot
    provides: "14-06 서버 챗 파이프라인(handleChatStream + chatRouter + app 결선)"
  - phase: 14-ai-analyst-chatbot
    provides: "14-08~14-10 webapp 챗 UI(FAB/시트/렌더/대화관리 페이지)"
provides:
  - "chat E2E 4시나리오(비로그인 게이트/SSE 스트리밍/종목상세 FAB 라벨/대화목록·삭제) + SSE mock 픽스처"
  - "CHAT-01 요구사항 v1 정의 + Traceability Complete (Coverage 36→37)"
  - "production 배포: server 4회(최종 2918a4b) + webapp 2회(gh-radar-webapp.vercel.app aliased)"
  - "web_search 활성 실측 확정 + 챗 모델 전면 claude-sonnet-5(사용자 결정)"
  - "면책 문구 전면 제거(사용자 checkpoint 결정) — 서버 프롬프트 + webapp UI + 테스트"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "챗 E2E SSE mock: text/event-stream body 한 덩어리 fulfill → parseSSEStream 이 라인 파싱(결정론, Anthropic 비용 0)"
    - "list 엔드포인트 bare array 규약 재확인 — apiFetch<T[]> 는 envelope unwrap 안 함(scanner/themes/news/chat 동일)"
    - "Sonnet 5 호출 규칙: 전문가(단발 요약) thinking:{type:disabled} + sampling 파라미터 금지 / 팀장(품질) thinking 생략=adaptive ON + max_tokens 8192"

key-files:
  created:
    - webapp/e2e/specs/chat.spec.ts
    - webapp/e2e/fixtures/chat.ts
  modified:
    - .planning/REQUIREMENTS.md
    - server/src/routes/chat.ts
    - server/src/routes/__tests__/chat.route.test.ts
    - server/src/services/chat-prompts.ts
    - server/src/config.ts
    - server/src/services/chat-service.ts
    - server/src/services/specialists/quote-specialist.ts
    - server/src/services/specialists/theme-specialist.ts
    - server/src/services/specialists/news-specialist.ts
    - server/src/services/specialists/limitup-specialist.ts
    - server/src/services/specialists/websearch-specialist.ts
    - webapp/src/components/chat/message-assistant.tsx
    - webapp/src/components/chat/composer.tsx

key-decisions:
  - "챗 대화목록 GET 은 bare array 반환 — { data } envelope 가 webapp apiFetch 계약과 불일치해 히스토리 유실(Rule 1 버그, production smoke 로 발견·수정)"
  - "면책 문구 전면 제거 — 사용자 checkpoint 결정(2026-07-02). 매매지시 금지·환각 금지 안전 가드는 유지"
  - "챗 모델 전면 claude-sonnet-5 — 사용자 결정(팀장+전문가 모두). 전문가는 temperature 제거+thinking disabled, 팀장은 adaptive thinking 유지+max_tokens 8192"
  - "web_search tool 버전 web_search_20250305 유지 — _20260209 업그레이드는 후속 검토"
  - "web_search 콘솔 활성 실측 확인(web citation 2건, tool_result_error 0) — 웹서치 전문가 descope 불필요"

patterns-established:
  - "production SSE smoke: Supabase REST 토큰 → raw SSE POST → 이벤트 시퀀스/첫 토큰 latency/히스토리 행 검증 스크립트"

requirements-completed: [CHAT-01]

# Metrics
duration: ~50min
completed: 2026-07-02
---

# Phase 14 Plan 11: 배포 + E2E + phase 마감 Summary

**챗 E2E 4시나리오 green + CHAT-01 추적성 완결 + server/webapp production 배포(무토큰 401 · SSE 첫 토큰 0.4~0.5s · 히스토리 영속 · web_search 활성 실측 · `[chat] usage` 토큰 로깅 관측) — 실행 중 사용자 결정 2건(면책 문구 전면 제거, 챗 모델 전면 Sonnet 5)과 Rule 1 버그 1건(대화목록 envelope 불일치)을 반영·재배포·재검증 완료**

## Performance

- **Duration:** ~50 min (21:44 ~ 22:26 KST, 배포 4회 포함)
- **Completed:** 2026-07-02
- **Tasks:** 2 (Task 1 auto + Task 2 checkpoint — 자동화 단계 전부 수행 후 육안 검증, 사용자 피드백 반영)
- **Files:** 15 (2 created, 13 modified)

## Accomplishments

- **chat E2E** (`webapp/e2e/specs/chat.spec.ts` + `fixtures/chat.ts`) — ①비로그인 FAB → "로그인이 필요해요" 게이트(D-01, composer 미오픈) ②로그인 → 시트 → 질문 → SSE 스트리밍(text 조립 + 미니 종목카드 링크) ③종목상세 FAB 라벨 "AI 애널리스트 · SK하이닉스 분석"(D-03) ④/chat 대화목록 + 삭제 다이얼로그 open/취소(T-14-11). SSE 는 `text/event-stream` mock(결정론, 비용 0). **5/5 green**(setup 포함, PORT 3100 dev.sh 규약).
- **CHAT-01 추적성** — REQUIREMENTS.md v1 `### Chat` 섹션 + `| CHAT-01 | Phase 14 | Complete |` + Coverage 36→37.
- **production 배포** — server 4회 재배포(최종 revision image `2918a4b`, ANTHROPIC_API_KEY 기바인딩 재사용·신규 secret 0, smoke INV 9/9 매회 PASS) + webapp Vercel 2회(`vercel pull→build→deploy --prebuilt --prod`, `gh-radar-webapp.vercel.app` aliased).
- **production smoke** — 무토큰 POST /api/chat → **401 UNAUTHENTICATED**(T-14-02d) / 유효 토큰 SSE → **첫 토큰 0.41~0.50s** + session→agent→text→response_complete→done / **conversations 2행 영속**(히스토리 저장) / Vercel `NEXT_PUBLIC_API_BASE_URL` trailing newline 없음(63자, T-14-06b) / Cloud Logging **`[chat] usage`**(inputTokens/outputTokens/model/toolRounds — T-14-04d).
- **web_search 실측**(T-14-12) — 속보 유발 질문에서 websearch 전문가 dispatch + **web citation 2건**(Investing.com/인포스탁) + `web_search_tool_result_error` **0** → 콘솔 활성 확인, 웹서치 descope 불필요. (Haiku 로 정상 동작 확인 후, 사용자 결정으로 모델 자체가 Sonnet 5 로 전면 전환.)
- **Sonnet 5 업그레이드 검증** — 전문가 콜 유발 질문에서 quote+theme dispatch 정상(temperature 잔존 400 **없음**), error 이벤트 0, `[chat] usage` 에 **`model=claude-sonnet-5`** 관측, 답변에 면책 문구 미출현.

## Task Commits

1. **Task 1: chat E2E 4시나리오 + CHAT-01 추적성** — `bf19863` (test)
2. **[Rule 1] 챗 대화목록 bare array 수정** — `05e96b4` (fix)
3. **[사용자 결정] 면책 문구 전면 제거** — `8fd25cc` (feat)
4. **[사용자 결정] 챗 모델 전면 Sonnet 5** — `2918a4b` (feat)

## Files Created/Modified

- `webapp/e2e/specs/chat.spec.ts` (신규) — 챗 E2E 4시나리오
- `webapp/e2e/fixtures/chat.ts` (신규) — SSE + 대화관리 mock 픽스처
- `.planning/REQUIREMENTS.md` — CHAT-01 정의 + Traceability + Coverage 37
- `server/src/routes/chat.ts` — 대화목록 bare array (+ 규약 주석)
- `server/src/services/chat-prompts.ts` — CHAT_DISCLAIMER 삭제 + 팀장 프롬프트 면책 지시 삭제
- `server/src/config.ts` — 챗 모델 3키 기본값 `claude-sonnet-5`
- `server/src/services/chat-service.ts` — 팀장 max_tokens 4096→8192 ×2 (adaptive thinking + 신형 토크나이저)
- `server/src/services/specialists/*.ts` ×5 — temperature 제거(데이터 4) + `thinking:{type:"disabled"}`(5 전부)
- `webapp/src/components/chat/message-assistant.tsx` — 답변 말미 면책 렌더 삭제
- `webapp/src/components/chat/composer.tsx` — 하단 면책 삭제(Enter 힌트만 유지)
- 테스트 3파일(chat.route/message-render/anthropic-mock) — 단언/골격 정합

## Decisions Made

- **대화목록 bare array:** 코드베이스 list 규약(scanner/themes/news = `res.json([...])`)과 webapp `apiFetch<T[]>`(unwrap 없음) 계약에 맞춤. `{ data }` envelope 는 통합에서 히스토리를 조용히 유실시키는 실버그였다.
- **면책 전면 제거(사용자):** 프롬프트 지시·상수·UI 렌더·테스트 assert 전부 삭제. 매매지시 금지/환각 금지/인젝션 방어 등 안전 가드는 유지. 제거 이력은 코드 주석으로 박제(재유입 방지).
- **Sonnet 5 전면 전환(사용자):** 팀장+전문가+웹서치 3키 모두 `claude-sonnet-5`. Sonnet 5 특성 반영 — ①비기본 sampling 파라미터(temperature) 400 거부 → 제거 ②전문가 단발 콜은 `thinking:{type:"disabled"}`(생략 시 adaptive 기본 ON 이 max_tokens 700/1024 잠식) ③팀장은 adaptive 유지(품질) + max_tokens 8192. 스트림 소비부는 text_delta-only 라 thinking delta 가 SSE 로 새지 않고, tool 루프는 `finalMessage.content` 전체를 되돌려 thinking 블록 보존. 가격: Sonnet 5 $3/$15(인트로 2026-08-31 까지 $2/$10) — 팀장 동일~절감, 전문가 Haiku 대비 3배(인트로 2배)는 사용자 인지·승인.
- **web_search_20250305 유지:** `_20260209` 버전 업그레이드는 후속 검토 항목으로만 기록(최소 변경).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 챗 대화목록 `{ data }` envelope → bare array**
- **Found during:** Task 2 (production smoke — conversations delta=0 관측 조사)
- **Issue:** `GET /api/chat/conversations` 가 `{ data:[...] }` 로 응답하나 webapp `apiFetch<ConversationRow[]>` 는 unwrap 하지 않아 `listConversations` 가 배열 아닌 객체 수신 → FAB 자동 이어가기·/chat 목록에서 종목별 히스토리가 조용히 사라짐(14-06 유입).
- **Fix:** 코드베이스 규약대로 `res.json(data)` bare array + 라우트 테스트 기대값 정합.
- **Files modified:** server/src/routes/chat.ts, chat.route.test.ts
- **Verification:** 서버 8/8 green + 재배포 후 production GET 이 배열 반환(count=2) 확인.
- **Committed in:** `05e96b4`

### User-directed Changes (checkpoint 피드백)

**2. [사용자 결정] 면책 문구 전면 제거**
- **Trigger:** checkpoint 육안 검증에서 사용자 지시("면책용 문구는 다 지워").
- **Change:** 서버 프롬프트(CHAT_DISCLAIMER + 팀장 지시) / webapp(message-assistant 말미 `<p>` + composer 하단 문구) / 테스트·E2E assert 삭제. 매매지시 금지 등 안전 가드 유지. grep 잔존 0(이력 주석 제외).
- **Verification:** 서버 16/16 + webapp 챗 20/20 + E2E 5/5 → 서버·webapp 재배포 → production SSE 답변 banned-phrase hits **NONE**.
- **Committed in:** `8fd25cc`

**3. [사용자 결정] 챗 모델 전면 claude-sonnet-5**
- **Trigger:** 사용자 AskUserQuestion 선택("팀장 Sonnet 5 + 전문가도 Sonnet 5").
- **Change:** config 3키 기본값 + 전문가 temperature 제거/thinking disabled + 팀장 max_tokens 8192. Cloud Run 에 CHAT_* env override 없음 확인(deploy default 회귀 함정 없음).
- **Verification:** 서버 전체 215/215 + tsc 0 → 재배포 → smoke 첫 토큰 0.50s + quote/theme dispatch(400 없음) + `[chat] usage` `model=claude-sonnet-5`.
- **Committed in:** `2918a4b`

---

**Total deviations:** 1 auto-fixed (Rule 1) + 2 user-directed (checkpoint 피드백)
**Impact on plan:** Rule 1 수정은 챗 히스토리 기능의 정확성에 필수. 사용자 결정 2건은 명시 지시에 따른 스코프 반영 — 전부 테스트·재배포·production smoke 로 재검증됨.

## Issues Encountered

- **챗 라우트 rate-limit(20/60s)로 smoke 429** — 연속 smoke 실행 시 자연 발생. 재시도 루프(30~35s 대기)로 흡수. 방어 기능이 의도대로 동작한다는 방증.
- **장 마감 시간대 데이터 공백** — "오늘 상한가 종목" 질문에 데이터 tool 이 빈 결과 → 팀장이 "확인 불가 + 대체 경로 안내"로 정직 응답(환각 0). 파이프라인 정상, 콘텐츠 캐비앗일 뿐.

## Known Stubs

None — E2E/배포/smoke 전부 실배선. 후속 검토 항목: web_search tool 버전 `_20260209` 업그레이드(기능 개선 여부 검토), chat-sheet ↔ /chat 페이지 SSE 오케스트레이션 공유 훅 추출(14-10 기록 승계).

## Threat Flags

None — threat register 4건 전부 mitigate 검증: T-14-02d(무토큰 401), T-14-04d(`[chat] usage` 로깅 + max_uses:3), T-14-12(web_search 실측 활성), T-14-06b(Vercel env newline clean).

## User Setup Required

None — plan frontmatter 의 user_setup(Claude Console web search 활성화)은 **POC 실측으로 이미 활성 확인**(web citation 수신, tool_result_error 0) → USER-SETUP.md 생성 불필요.

## Next Phase Readiness

- Phase 14 전 plan(11/11) 완료 — 챗 기능 end-to-end 프로덕션 라이브(server `2918a4b` + webapp aliased).
- 권장 후속: `/gsd-verify-work 14`, 장중 실데이터 질문 확인, Sonnet 5 비용 모니터링(`[chat] usage` 로그, 인트로 가격 2026-08-31 종료 유의).

---
*Phase: 14-ai-analyst-chatbot*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: created 2파일(chat.spec.ts, fixtures/chat.ts) + SUMMARY 디스크 존재
- FOUND: 4개 커밋(bf19863 / 05e96b4 / 8fd25cc / 2918a4b) git log 존재
- 검증: E2E 5/5 · 서버 215/215 · webapp 285/1skip · production server version=2918a4b · webapp / 200
