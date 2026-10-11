---
phase: quick-260720-iqh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/home/solo-card.tsx
  - webapp/src/components/home/__tests__/solo-card.test.tsx
  - webapp/src/components/chat/chat-fab.tsx
  - webapp/src/components/chat/composer.tsx
  - webapp/src/components/chat/chat-states.tsx
  - webapp/src/components/chat/chat-sheet.tsx
  - webapp/src/app/chat/page.tsx
  - webapp/src/components/chat/__tests__/chat-fab.test.tsx
  - webapp/src/components/chat/__tests__/chat-sheet.test.tsx
  - webapp/e2e/specs/chat.spec.ts
autonomous: true
requirements: [QUICK-260720-IQH]

must_haves:
  truths:
    - "모바일 홈 스크롤 시 sticky 탑바가 개별 급등 카드 뉴스 영역 위에 유지된다"
    - "AI 챗 FAB 버튼 라벨이 'AI' 로 표시된다 (일반: 'AI', 종목: 'AI · {종목명} 분석')"
    - "챗 입력창에 placeholder 와 'Enter 전송/Shift+Enter 줄바꿈' 힌트가 없다"
    - "챗 빈 상태에 부제 설명과 추천 질문 칩이 없다"
    - "종목 컨텍스트로 열면 빈 상태 제목이 '{종목명}에 대해 무엇이든 물어보세요' 로 표시된다"
  artifacts:
    - path: "webapp/src/components/home/solo-card.tsx"
      provides: "isolate 로 카드 내부 z-index 스택 격리"
      contains: "isolate"
    - path: "webapp/src/components/chat/chat-states.tsx"
      provides: "stockName 기반 빈 상태 제목, 칩/부제 제거"
      contains: "stockName"
  key_links:
    - from: "webapp/src/components/chat/chat-sheet.tsx"
      to: "EmptyState stockName"
      via: "stockContext?.name 전달"
      pattern: "EmptyState stockName"
---

<objective>
사용자 요청 5건 (프론트 webapp, Next.js 15 App Router + Tailwind) 처리:

1. 모바일 홈 z-index 버그 — 개별 급등(SoloCard) 뉴스 영역이 스크롤 시 sticky 탑바를 가림.
2. AI 챗 FAB 라벨 "AI 애널리스트" → "AI".
3. 챗 입력창 placeholder + Enter/Shift+Enter 힌트 제거.
4. 챗 빈 상태 부제 + 추천 질문 칩 제거.
5. 종목 컨텍스트로 열면 빈 상태 제목을 종목 기준으로 표시.

Purpose: 홈 스크롤 표시 버그 해소 + AI 애널리스트 챗 UI 군더더기 정리(라벨/입력/빈 상태) + 종목 컨텍스트 안내 강화.
Output: solo-card z-index 격리 + 챗 4개 컴포넌트/2개 페이지 정리 + 단위·E2E 테스트 기대값 정합.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<root_cause>
## z-index 버그 근본 원인 (조사 완료)

- `webapp/src/components/layout/app-header.tsx` L26: 헤더는 `sticky top-0 z-10`.
- `webapp/src/components/home/solo-card.tsx`: `<article>` 은 `relative` (z-index auto → 스택 컨텍스트 미생성).
  내부에 stretched-link 오버레이 `z-10` + 뉴스 블록 래퍼 `<div className="relative z-20">` 존재.
- article 이 스택 컨텍스트를 만들지 않으므로 내부 `z-20` 이 **root 스택 컨텍스트로 새어나가** 헤더의
  `z-10` 과 경쟁 → `z-20 > z-10` 이라 스크롤 시 뉴스 블록이 헤더 위에 그려짐.
- ThemeCard 는 뉴스 블록에 z-wrapper 가 없어 누수 없음 → SoloCard 만 문제.

## 우아한 해법
- SoloCard `<article>` 에 `isolate`(isolation:isolate) 추가 → 카드가 자체 스택 컨텍스트 생성.
  내부 `z-10`/`z-20` 이 카드 내부로 국한되고 root 로 누수 안 됨 → 헤더 z-10 이 항상 카드 위.
  헤더 z-index 를 올리는 대신 누수를 막는 것이 root-cause 수정 (FAB z-40 등 다른 레이어 영향 없음).
</root_cause>

<interfaces>
현재 계약 (변경 대상):

chat-fab.tsx:      const BASE_LABEL = "AI 애널리스트";  // → "AI"
                   label = stockContext ? `${BASE_LABEL} · ${name} 분석` : BASE_LABEL;
                   본문도 BASE_LABEL(굵게) + "{name} 분석"(서브라인) 렌더.

composer.tsx:      Textarea placeholder="상한가 종목·주도 테마·익절 판단을 물어보세요…"  // 제거
                   <p>Enter 전송 · Shift+Enter 줄바꿈</p>  // 제거 (aria-label "메시지 입력" 은 유지)

chat-states.tsx:   EmptyState({ onPromptSelect })  // → EmptyState({ stockName })
                   title="무엇이든 물어보세요" + 부제 <p>…</p> + EXAMPLE_PROMPTS 칩  // 부제/칩 제거
                   StateBox children 필수 → 선택(children?)으로 변경 필요.

chat-sheet.tsx L306:   <EmptyState onPromptSelect={(t) => void send(t)} />  // → stockName={stockContext?.name}
                       (stockContext 는 이미 useChat() 로 보유)
chat/page.tsx L270:    <EmptyState onPromptSelect={(t) => void send(t)} />  // 일반 /chat, 종목 없음 → <EmptyState />
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 홈 z-index 수정 — SoloCard 스택 격리</name>
  <files>webapp/src/components/home/solo-card.tsx, webapp/src/components/home/__tests__/solo-card.test.tsx</files>
  <action>
solo-card.tsx `<article>` className 의 `relative` 옆에 `isolate` 추가 (예: `group card-shadow relative isolate flex ...`).
이로써 카드가 자체 스택 컨텍스트를 만들어 내부 `z-10`(링크 오버레이)/`z-20`(뉴스 블록)이 root 로 누수되지 않고
sticky 헤더(z-10)가 항상 카드 위에 유지된다. 파일 상단 stretched-link 설명 주석에 "isolate 로 내부 z-index 를
카드 스택 컨텍스트에 가둬 헤더(sticky z-10) 위로 새는 것을 방지" 한 줄 보강.
solo-card.test.tsx 에 회귀 가드 1건 추가: 렌더 후 `screen.getByRole('link', { name: '삼성전자 종목 상세 보기' })`
의 `closest('article')` 이 `isolate` 클래스를 갖는지 `expect(article?.className).toContain('isolate')` 로 검증.
  </action>
  <verify>
    <automated>cd webapp && pnpm test --run src/components/home/__tests__/solo-card.test.tsx</automated>
  </verify>
  <done>SoloCard article 에 isolate 클래스 존재 + solo-card 테스트 green. 모바일 홈 스크롤 시 뉴스가 탑바를 가리지 않음(체크포인트 검증).</done>
</task>

<task type="auto">
  <name>Task 2: 챗 UI 정리 — FAB 라벨 + 입력창 + 빈 상태 + 종목 컨텍스트</name>
  <files>webapp/src/components/chat/chat-fab.tsx, webapp/src/components/chat/composer.tsx, webapp/src/components/chat/chat-states.tsx, webapp/src/components/chat/chat-sheet.tsx, webapp/src/app/chat/page.tsx</files>
  <action>
(2) chat-fab.tsx: `const BASE_LABEL = "AI 애널리스트";` → `= "AI";`. 파일 상단 주석의 `AI 애널리스트 · {종목명}`
예시도 `AI · {종목명}` 으로 갱신. 종목 컨텍스트 시 라벨/서브라인 로직(BASE_LABEL + "{name} 분석")은 그대로 두어
결과가 "AI · {종목명} 분석" 이 되게 한다.

(3) composer.tsx: Textarea 의 `placeholder="..."` 속성 제거(aria-label "메시지 입력"은 유지). 하단
`<p className="text-[length:11px] ...">Enter 전송 · Shift+Enter 줄바꿈</p>` 요소 제거. 이제 바깥 flex-col 래퍼는
입력행 하나만 감싸므로 그대로 두거나 자연스러운 구조 유지. 상단 주석에서 "입력 힌트만 노출" 문구를 "힌트/placeholder
제거(사용자 요청)"로 정정. Enter 전송 / Shift+Enter 줄바꿈 **동작(handleKeyDown)은 유지** — 표시 텍스트만 제거.

(4)+(5) chat-states.tsx: EmptyState 시그니처를 `{ onPromptSelect?: ... }` → `{ stockName?: string }` 로 변경.
title 을 `stockName ? \`${stockName}에 대해 무엇이든 물어보세요\` : "무엇이든 물어보세요"` 로 계산.
부제 `<p>오늘 주도 테마, ...</p>` 와 추천 칩(EXAMPLE_PROMPTS map + 래퍼 div) 전부 제거. 사용되지 않는
`EXAMPLE_PROMPTS` 상수 삭제. StateBox 의 `children` 를 선택적(`children?: React.ReactNode`)으로 바꾸고 본문 div 는
children 이 있을 때만 렌더 → EmptyState 가 children 없이 `<StateBox icon title />` 만 렌더 가능하게. Button/MessageSquare
import 는 LoginRequiredState/ChatErrorState/아이콘에서 계속 쓰이므로 유지. 상단 주석의 EmptyState 설명을 칩 제거·종목
컨텍스트 제목 반영으로 갱신.

chat-sheet.tsx L306: `<EmptyState onPromptSelect={(t) => void send(t)} />` → `<EmptyState stockName={stockContext?.name} />`.
(stockContext 는 이미 useChat() 로 구조분해되어 있음.)

chat/page.tsx L270: `<EmptyState onPromptSelect={(t) => void send(t)} />` → `<EmptyState />` (일반 /chat 은 종목 컨텍스트 없음).

주의: chat-sheet/page 의 `send` 는 여전히 Composer onSend 로 사용되므로 미사용 경고 없음.
  </action>
  <verify>
    <automated>cd webapp && pnpm typecheck</automated>
  </verify>
  <done>FAB 라벨 "AI"(+종목 시 "AI · {종목명} 분석"), composer placeholder/힌트 없음, 빈 상태 부제/칩 없음, 종목 컨텍스트 시 제목 "{종목명}에 대해 무엇이든 물어보세요". typecheck exit 0.</done>
</task>

<task type="auto">
  <name>Task 3: 테스트 기대값 정합 (단위 + E2E)</name>
  <files>webapp/src/components/chat/__tests__/chat-fab.test.tsx, webapp/src/components/chat/__tests__/chat-sheet.test.tsx, webapp/e2e/specs/chat.spec.ts</files>
  <action>
교훈(lessons.md: UI 문자열 변경 시 하드코딩 기대값 동시 점검) 준수 — 코드 변경과 함께 테스트 기대값 갱신.

chat-fab.test.tsx: FAB 라벨 기대를 'AI 애널리스트' → 'AI' 로 갱신.
  - L34, L48, L73: `{ name: 'AI 애널리스트' }` → `{ name: 'AI' }`.
  - L62: `{ name: 'AI 애널리스트 · 삼성전자 분석' }` → `{ name: 'AI · 삼성전자 분석' }`.
  - L70 테스트 설명 문자열 "기본 라벨 AI 애널리스트" → "기본 라벨 AI". L77 `/분석$/` 쿼리는 유지.

chat-sheet.test.tsx: 종목 컨텍스트가 있는 케이스의 빈 상태 제목 갱신.
  - Test 2 (L108, stockContext SAMSUNG): `getByText('무엇이든 물어보세요')` → `getByText('삼성전자에 대해 무엇이든 물어보세요')`.
  - Test 3 (L137, stockContext SAMSUNG): 동일하게 `'삼성전자에 대해 무엇이든 물어보세요'` 로 갱신.
  - Test 4 (L150, stockContext null): `'무엇이든 물어보세요'` 유지(변경 없음).

chat.spec.ts (Playwright, 라이브 서버 필요 — quick verify 게이트 아님, 정합성만 갱신):
  - L44, L71: `{ name: 'AI 애널리스트', exact: true }` → `{ name: 'AI', exact: true }`.
  - L101: `name: /AI 애널리스트 · SK하이닉스 분석/` → `/AI · SK하이닉스 분석/`. (이후 서브라인 "SK하이닉스 분석" 체크는 유지.)
  - 입력창은 `getByLabel('메시지 입력')` 로 찾으므로 placeholder 제거 영향 없음(수정 불필요).
  </action>
  <verify>
    <automated>cd webapp && pnpm test --run</automated>
  </verify>
  <done>vitest 전체 green (chat-fab / chat-sheet / solo-card 포함). e2e 기대 문자열은 신규 라벨과 정합.</done>
</task>

</tasks>

<verification>
- `cd webapp && pnpm test --run` → 전체 green (특히 chat-fab, chat-sheet, solo-card).
- `cd webapp && pnpm typecheck` → exit 0.
- 체크포인트(사용자): 모바일 뷰 홈에서 개별 급등 카드 스크롤 시 sticky 탑바가 뉴스 위에 유지되는지 육안 확인.
</verification>

<success_criteria>
1. 모바일 홈 스크롤 시 개별 급등 뉴스가 탑바를 가리지 않음 (SoloCard isolate).
2. FAB 라벨 "AI" (종목 컨텍스트 시 "AI · {종목명} 분석").
3. 챗 입력창 placeholder + Enter/Shift+Enter 힌트 텍스트 없음 (동작은 유지).
4. 챗 빈 상태 부제 설명 + 추천 질문 칩 없음.
5. 종목 컨텍스트로 열면 빈 상태 제목 "{종목명}에 대해 무엇이든 물어보세요", 일반 모드는 "무엇이든 물어보세요".
6. 단위 테스트 green + typecheck 통과.
</success_criteria>

<output>
After completion, create `.planning/quick/260720-iqh-z-index-ai-ui/260720-iqh-SUMMARY.md`
</output>
