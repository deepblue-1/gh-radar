# Phase 14: AI 애널리스트 챗봇 (멀티에이전트) - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

팀장 에이전트(Sonnet)가 전문가 에이전트 5명(Haiku: ①시세/수급 ②테마 ③뉴스/심리 ④상한가 패턴 ⑤실시간 웹서치)을 질문 성격에 따라 선택적 병렬 호출해 의견을 취합·답변하는 **상한가 따라잡기 전략 특화 AI 애널리스트 챗봇**.

- 데이터: 기존 Supabase 테이블(stock_quotes/stock_daily_ohlcv/themes/theme_stocks/theme_comovement/news_articles/discussions/limit_up_*/home_theme_snapshots)을 전문가 tool로 조회 + Anthropic web_search로 장중 속보/공시 실시간 파악
- 백엔드: 기존 Express 서버에 SSE 스트리밍 `POST /api/chat` 추가 (`../weekly-wine-bot` 패턴 이식)
- 히스토리: 로그인 사용자별+종목별 Supabase 저장 (conversations/messages, RLS)
- 프론트: 전역 FAB + 챗 시트(`../weekly-wine-cafe24` somi-chat 패턴 React 포팅), 종목상세=해당 종목 컨텍스트 대화, 사이드바 `/chat`=일반 대화

</domain>

<decisions>
## Implementation Decisions

### 접근/히스토리 아키텍처
- **D-01:** **로그인 필수.** 비로그인 사용자가 FAB/입력창 사용 시 로그인 유도. 비로그인 체험 모드 없음 (비용 통제 + 기존 개인화 기능과 일관).
- **D-02:** **서버 JWT 검증 신설.** 웹앱이 Supabase access token을 `Authorization: Bearer`로 전달 → 서버가 `supabase.auth.getUser(jwt)`로 검증 후 히스토리 로드/저장을 **모두 서버(서비스롤)가 전담**. 클라이언트 히스토리 위변조 불가, 단일 진실 소스. gh-radar 서버 최초의 사용자 인증 패턴 — 챗 라우트 한정. conversations/messages 테이블 자체에는 RLS(`TO authenticated`, `auth.uid() = user_id`) 정상 적용(watchlists 패턴 mirror — 서비스롤은 bypass).
- **D-03:** **종목상세 챗 = 해당 종목 최근 대화 자동 이어가기** + '새 대화' 버튼으로 새로 시작 가능. 트레이더의 장중 반복 확인 플로우 최적화.

### 멀티에이전트 진행 UX
- **D-04:** **에이전트별 단계 표시.** 답변 생성 중 "테마 전문가 분석 중…", "웹 검색 중…" 식으로 현재 활동 중인 전문가를 표시 (ww-bot `tool_start`/`tool_end` SSE 이벤트 확장). 5~20초 대기 체감 완화.
- **D-05:** **팀장 종합 답변만 노출.** 전문가 개별 의견 카드/전문은 표시하지 않음. 전문가 의견이 충돌하면 팀장이 답변 본문에서 언급하도록 시스템 프롬프트 설계.
- **D-06:** **중단 버튼 + 새 질문 시 자동 중단.** 스트리밍 중 정지 버튼 표시, 새 메시지 전송 시 이전 응답 자동 abort (ww-bot interrupt 패턴). 시트를 닫아도 진행 중 응답은 서버에서 완료 후 저장.

### 답변 콘텐츠/근거 표현
- **D-07:** **미니 종목 카드 인라인 삽입.** 답변 중 종목 언급 시 종목명+현재가+등락률 미니카드를 본문에 삽입, 클릭 시 `/stocks/[code]` 이동 (ww-bot wine 카드 SSE 이벤트 패턴 이식).
- **D-08:** **근거 출처 링크 인용.** DB 뉴스는 제목+출처+URL **verbatim**(Claude가 입력 뉴스 중 선택만 — Phase 13 환각 방지 원칙), 웹서치 결과는 Anthropic citations 활용. 크롤링 5원칙 #5(출처 표기) 일관.
- **D-09:** **풀 마크다운 렌더링.** react-markdown 계열로 표(종목 비교)/리스트/헤딩/강조 지원. somi-chat의 라이트 변환은 폐기.
- **D-10:** **차트 임베드 = 기존 lightweight-charts 재사용.** 가격 흐름 설명이 필요한 답변에서 기존 차트 라이브러리(Phase 09.2, lightweight-charts 5.2.0 + chart-colors.ts)로 미니 일봉차트 삽입. oklch 색상 직접 주입 금지 lesson 적용. (사용자: "이미 차트 라이브러리가 있으니까 필요시 이걸 사용하자")

### 대화 관리 + 비용/제한
- **D-11:** **v1 사용자별 턴 제한 없음.** 기존 글로벌 IP rate limit(200req/60s)만 의존. 개인 프로젝트 규모에서 실사용자 수 적음 — 사용자별 일일 quota는 deferred.
- **D-12:** **웹서치 전문가는 팀장 판단으로 필요 시만 호출.** 오늘 속보/공시/장중 이슈성 질문에만 위임, DB로 답할 수 있는 질문은 미호출 (web_search $10/1,000회 — 가장 비싼 전문가, 비용 최소화).
- **D-13:** **대화 목록/종목 필터 UI는 `/chat` 페이지에서만.** FAB 시트는 현재 대화 + '새 대화' 버튼만으로 가볍게 유지. 대화 관리(목록 탐색, 종목별 필터)는 사이드바 `/chat` 페이지 담당.

### Claude's Discretion
- conversations/messages 정확 스키마 (제목 자동 생성 방식, 컬럼 구성, 인덱스)
- 대화 보존 정책 (기본 무기한, 삭제 UI 여부), 메시지 길이 제한 (1,000자 내외 참고)
- 서버 인메모리 동시성 가드 세부 (busy/interrupt/턴 상한 — ww-bot MAX_TURNS/MAX_HISTORY 수치 참고)
- 에이전트 실패/타임아웃 처리 (일부 전문가 실패 시 가용 의견으로 답변 + 본문 고지 예상)
- 팀장-전문가 오케스트레이션 구현 형태 (전문가를 팀장의 tool로 노출 vs 별도 fan-out 오케스트레이터)
- SSE 이벤트 정확 스펙 (ww-bot SSEEventMap 확장: agent_start/agent_end, stock 카드, chart 카드 등)
- 모델 config 키 설계 (chatLeadModel=Sonnet, chatSpecialistModel=Haiku 등), 프롬프트 캐싱 적용
- 면책 문구 (투자자문 아님) 표시 위치/방식

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 이식 원본 (외부 레포 — 반드시 읽고 패턴 이식)
- `../weekly-wine-bot/server/src/services/chat-service.ts` — 세션 Map/busy·interrupt 가드/tool-use 루프(MAX_TOOL_ROUNDS)/sanitizeMessages/pruneHistory/429·529 retry/sendSSE 헬퍼. **챗 서비스 재구현의 기준 템플릿**
- `../weekly-wine-bot/server/src/routes/chat.ts` — SSE 헤더(text/event-stream + X-Accel-Buffering:no)/15s keepalive/req close→abort/route-level rate limit/CHAT_DISABLED kill-switch/터미널 done 이벤트 보장
- `../weekly-wine-bot/packages/somi-chat-core/` — SSEEventMap 이벤트 프로토콜(session/text/text_clear/tool_start/tool_end/wine/response_complete/error/done) + parseSSEStream 클라이언트 파서
- `../weekly-wine-cafe24/skin34/layout/basic/js/somi-chat.js` — FAB+시트 상태머신, SSE 이벤트→UI 매핑(handleEvent switch), 타이핑 인디케이터, 중단 처리. **React 포팅 원본**

### gh-radar 내부 통합 지점
- `server/src/app.ts` — 라우터 등록(`app.use("/api/chat", ...)`) + 미들웨어 순서 + `app.locals` DI. 글로벌 `express.json({limit:"16kb"})` 주의
- `server/src/config.ts` — `anthropicApiKey`/`classifyModel` 기존 키. 챗 모델 키 추가 위치
- `server/src/services/discussion-classify.ts` — 서버 내 Anthropic 클라이언트 lazy 싱글톤 선례
- `server/src/middleware/rate-limit.ts`, `server/src/errors.ts`, `server/src/middleware/error-handler.ts` — 에러 envelope `{error:{code,message}}` + rate limit 패턴
- `webapp/src/lib/auth-context.tsx` + `webapp/src/lib/supabase/client.ts` — useAuth/세션 토큰 취득 경로 (JWT 전달용)
- `webapp/src/lib/api.ts` — apiFetch는 JSON 전용 8s 타임아웃이라 **SSE에 사용 불가** — 챗 클라이언트는 raw fetch + getReader 필요
- `webapp/src/app/layout.tsx` — ThemeProvider>AuthProvider>WatchlistSetProvider 트리. 전역 FAB/ChatProvider 마운트 지점
- `webapp/src/components/layout/app-sidebar.tsx` — NAV 배열(`/chat` 메뉴 추가 지점)
- `webapp/src/components/ui/sheet.tsx` — shadcn Sheet(side right/bottom) — 챗 시트 기반
- `supabase/migrations/20260416120000_watchlists.sql` — 사용자 스코프 RLS 4정책 패턴 (conversations/messages mirror 대상)
- `workers/theme-sync/src/ai/parseJson.ts` — Haiku JSON 출력 견고 파싱 유틸 (전문가 구조화 출력 시)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- shadcn `Sheet`/`Dialog`/`Textarea`/`Badge`/`Skeleton` (webapp/src/components/ui/) — 챗 시트·입력 UI
- lightweight-charts 5.2.0 + chart-colors.ts (Phase 09.2) — 미니 차트 카드 (D-10)
- 서버 mappers/lib (mappers/stock.ts, lib/quoteJoin.ts, lib/computeTop3.ts) — 전문가 tool 구현에 재사용 가능
- Anthropic SDK 이미 서버 의존성에 존재 (discussion-classify)

### Established Patterns
- 서버는 서비스롤 Supabase 단일 클라이언트 + `app.locals` DI — 챗 라우트만 JWT 검증 추가 (D-02, 신규 패턴)
- 에러 envelope `{error:{code,message}}` + ApiError 팩토리 — 챗 비-SSE 경로(목록 조회 등)에 동일 적용
- 신규 테이블 RLS는 명시 정책 필수 (watchlists 4정책 패턴; 비공개 테이블은 `TO authenticated`만)
- pino redact에 ANTHROPIC_API_KEY 이미 포함
- 읽기 전용 공개 테이블(stock_quotes 등)은 서비스롤 tool 조회에 RLS 무관

### Integration Points
- `server/src/app.ts` 라우터 등록 1곳 + `webapp/src/app/layout.tsx` 프로바이더 트리 + `app-sidebar.tsx` NAV 배열
- 종목상세 컨텍스트: FAB이 `usePathname`/route params로 `/stocks/[code]` 감지 → `{code, name}` 컨텍스트 전달
- **서버 SSE는 greenfield** — gh-radar에 스트리밍 선례 없음, ww-bot 패턴이 유일한 기준
- Cloud Run 프록시 idle timeout → 15s keepalive comment 필수 (ww-bot 패턴에 포함)

</code_context>

<specifics>
## Specific Ideas

- **상한가 따라잡기 특화**: 주도 테마 파악, 오늘 상한가 종목 분석, 내일 익절 판단이 대표 시나리오 — Phase 12(limit_up_events/stats)·Phase 11(co-movement)·Phase 13(home_theme_snapshots) 데이터가 상한가 패턴 전문가의 핵심 tool
- 진행 표시 문구는 한글 전문가 명칭("시세 전문가", "테마 전문가", "뉴스·심리 전문가", "상한가 패턴 전문가", "실시간 검색") 사용
- 프론트 UI 확정 전 HTML 목업 먼저 (사용자 워크플로 룰: globals.css 토큰 인라인 standalone 목업 → 시각 확인 → 채택안 박제) — `/gsd-ui-phase 14` 또는 plan 단계에서 적용
- 국내 색상 관례: 수익/상승=빨강(--up), 손실/하락=파랑(--down) — 미니 종목 카드에도 적용

</specifics>

<deferred>
## Deferred Ideas

- **사용자별 일일 quota** — v1 무제한(D-11). 비용 증가 관측 시 사용자별 일 N턴 제한 도입 (별도 quick task/phase)
- **비로그인 체험 모드** — 온보딩용 임시 대화 (로그인 전환율 필요해지면)
- **전문가 의견 개별 카드 노출** — v1은 팀장 종합만(D-05). 투명성 요구 시 접기식 카드
- **FAB 시트 내 대화 전환 UI** — v1은 /chat 페이지에서만 목록(D-13)

</deferred>

---

*Phase: 14-ai-analyst-chatbot*
*Context gathered: 2026-07-02*
