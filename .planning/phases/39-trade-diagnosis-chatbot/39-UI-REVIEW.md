---
phase: 39
audited: 2026-11-09
baseline: abstract 6-pillar + 채택 목업 A (reference/mockup-diagnosis-answer.html) · UI-SPEC 없음
screenshots: none (코드 전용 감사 — dev 서버 미기동)
overall: 16/24
status: advisory
---

# Phase 39 — UI Review (매매진단 챗봇)

사용자가 프로덕션 UAT 를 통과시킨 뒤의 사후 감사라 전부 advisory 다. BLOCKER 없음.

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---|---|
| 1. Copywriting | 3/4 | 사유 사전은 일관. 제출자 괄호 이음새 · 「초안 낱말」 주석 잔존 |
| 2. Visuals | 3/4 | 틱 칩이 목업보다 작고 같은 라벨 반복 · 접근성 이름 없음 |
| 3. Color | 3/4 | 토큰만 사용(하드코딩 hex 0). `wait` 단계 `opacity-60` 대비 의심 |
| 4. Typography | 2/4 | 11px 임의값 5곳 · h1/h2/h3 같은 스타일 · 목업과 크기 어긋남 |
| 5. Spacing | 3/4 | 토큰 대체로 준수. 표 셀 세로 정렬 · 칩 줄 높이 틈 |
| 6. Experience Design | 2/4 | 진행 상태가 색·글리프만 · 칩 터치 타깃 작음 · 스트리밍 중 server-log 튐 |

**Overall: 16/24**

## Top Priority Fixes

1. **틱 칩 터치 타깃 · 접근성 이름** (`message-assistant.tsx:50-51, 105-109`) — 11px · `px-1.5` · 높이 약 17px. 행마다 같은 「틱 보기 →」 라 스크린리더가 구분 못 함. → `aria-label`(행 맥락) · `py-1` · `min-h-6` 또는 투명 히트영역.
2. **AgentProgress 상태가 색·글리프에만 의존** (`agent-progress.tsx:54-84`) — 점 `aria-hidden` · 상태 텍스트 없음 · `aria-live` 가 목록 전체. `wait` 의 `opacity-60` + `--muted-fg` 대비 미달 가능. → `sr-only` 「완료/진행 중/대기」 · `role="status"` · opacity 대신 토큰 색.
3. **제목 위계 · 11px 임의값** (`message-assistant.tsx:77-91, 128, 137, 173, 214`) — h1~h3 모두 16px semibold, 목업은 14px/700. 11px 는 토큰 스케일 밖. → 제목 `--t-sm` bold · 11px 를 `--t-caption` 또는 새 토큰으로.
4. **kind 9 제출자 괄호 이음새** (`strategy-event-text.ts:213-214`) — `${body}(${id})` 공백 없음 · 본문 비면 「(milles)」 만. → ` (${id})` · 빈 본문 규칙.
5. **스트리밍 중 server-log 블록 높이 튐** (`message-assistant.tsx:121-135`) — 펜스가 닫히기 전 일반 `<pre>` → 닫히면 접힌 `<details>`. → 스트리밍 중 미완 펜스 숨김 또는 접힌 채 렌더.
6. **그 밖 내부 경로가 조용히 글자로** (`message-assistant.tsx:104-113`) — 보안 의도는 맞음. 테스트로 잠겨 있음(message-render.test.tsx) — 문서화만.

## Detailed Findings

### Copywriting (3/4)
- 강점: `STATE_REASON_LABELS` 18개가 사람이 읽는 행위 문구 · 모르는 토큰은 원문 폴백(뜻을 지어내지 않음).
- 「설정 재제출 · 재무장」 의 가운뎃점이 `joinDot` 구분자와 같아 행위/본문 경계가 모호.
- `strategy-event-labels.ts:150` 주석 「초안 낱말 … 회신 뒤 맞춘다」 가 회신 반영 후에도 남음.
- `stateStageText` 의 「감시→보유중」 화살표 공백 없음.
- 접두(Cfg/Auto/Sys)별 일반 폴백 문구 검토 가능.

### Visuals (3/4)
- 답변 구조는 목업 A 와 일치(요약 → 시각 표 → 접힌 원문).
- 틱 칩은 UAT 지적으로 목업의 단독 버튼 → 11px 인라인 알약으로 의도 변경. 존재감 · 터치 타깃이 같이 줄었다.
- 표 숫자 열 우측 정렬 없음 · 좁은 폭 가로 스크롤 힌트 없음.
- 상태전이 행은 회색 한 톤 — 방향 색 없음은 설계 결정(D-10), 배지만 약한 구분 검토.

### Color (3/4)
- 하드코딩 hex 0. `--pill-on-*` 는 틱 칩에만, `--up` 은 done 점에만.
- 칩 대비 라이트 약 5:1 · 다크 약 8:1(계산치, 실측 아님).
- 틱 칩과 일반 링크가 다른 파랑 체계.

### Typography (2/4)
- 11px 임의값 5곳 + 진행 점 10px. 가장 작은 글자가 12px 하한 아래.
- h1/h2/h3 → 모두 `<h3>` 16px. 본문 14px 보다 제목이 큼(목업은 14px/700).
- 굵기는 `font-semibold` 하나로 일관.

### Spacing (3/4)
- `--s-1`~`--s-4` 토큰 위주, 임의값은 국소적.
- 표 셀 기본 `middle` 정렬 — 칩 든 긴 행에서 `align-top` 권장.

### Experience Design (2/4)
- 칩 · `summary` 에 키보드 `focus-visible` 대체 표시 없음(터치 포커스 링 끔은 프로젝트 방침).
- 블록(카드 · 차트 · 인용)은 스트리밍 중 숨김(양호), server-log 펜스만 튐.
- 주문로그 「상태전이」 칩은 「시세」 앞 · URL `kind=state` 왕복 테스트 · 폰 폭 UAT OK · kind 9 는 그룹 칩에서 제외.

## Files Audited

- webapp/src/components/chat/message-assistant.tsx
- webapp/src/components/chat/agent-progress.tsx
- webapp/src/components/trading/order-log/order-log-list.tsx (발췌)
- webapp/src/lib/order-log-feed.ts (grep)
- packages/shared/src/strategy-event-labels.ts (발췌)
- packages/shared/src/strategy-event-text.ts (발췌)
- webapp/src/styles/globals.css (토큰)
- reference/mockup-diagnosis-answer.html

## Recommendation Count

- Priority fixes: 6
- Minor: 7 (상태전이 배지 구분 · 링크 색 통일 · 표 `align-top`·스크롤 힌트 · 은어 정리 · 화살표 공백 · 초안 주석 · 접두별 폴백)
