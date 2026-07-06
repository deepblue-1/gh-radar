---
phase: quick-260706-dvl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - webapp/src/components/stock/stock-detail-client.tsx
  - webapp/src/components/stock/stock-comovement-section.tsx
  - webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx
autonomous: true
requirements: [COMV-01]
must_haves:
  truths:
    - "종목 상세 페이지에서 '상한가 다음날 이력' 섹션이 '동반상승 후보' 섹션보다 먼저(위에) 표시된다"
    - "'동반상승 후보' 카드의 근거(점수 분해) 아코디언이 기본적으로 접힌 상태로 표시된다"
    - "사용자가 '근거 보기' 버튼을 클릭하면 근거가 펼쳐지고, 다시 클릭하면 접힌다"
    - "webapp vitest 스위트가 전부 통과한다"
  artifacts:
    - path: "webapp/src/components/stock/stock-detail-client.tsx"
      provides: "섹션 렌더 순서 (LimitUp → Comovement)"
      contains: "StockLimitUpSection"
    - path: "webapp/src/components/stock/stock-comovement-section.tsx"
      provides: "근거 아코디언 기본 접힘 상태"
      contains: "useState(false)"
  key_links:
    - from: "stock-detail-client.tsx"
      to: "StockLimitUpSection / StockComovementSection"
      via: "JSX 렌더 순서"
      pattern: "StockLimitUpSection[\\s\\S]*StockComovementSection"
---

<objective>
종목 상세 페이지(`/stocks/[code]`)의 두 가지 표시 동작을 변경한다:

1. **섹션 순서 교체** — 현재 "동반상승 후보"(StockComovementSection)가 먼저, "상한가 다음날 이력"(StockLimitUpSection)이 나중에 렌더된다. 이 둘의 순서를 서로 바꿔 "상한가 다음날 이력"을 먼저(위에) 표시한다.

2. **근거 기본 접힘** — "동반상승 후보" 카드(CandidateRow)의 근거 아코디언(점수 분해: 연결 경로·동반급등·발화일 동반율·표본·선후행·최근 동반급등)이 현재 기본 펼침(`useState(true)`)이다. 이를 기본 접힘(`useState(false)`)으로 변경한다. 접기/펼치기 토글 버튼("근거 보기" / "근거 접기")은 이미 구현되어 있으므로 재사용한다.

Purpose: 상한가 다음날 이력이 더 핵심 정보이므로 상단 노출. 동반상승 후보는 카드가 길어 근거를 접어 스캔성을 높인다.
Output: 섹션 순서 변경 + 근거 기본 접힘 + 의존 테스트 업데이트.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- 탐색 완료. 실행자는 아래 정확한 위치만 수정하면 된다 — 추가 탐색 불필요. -->

## 현재 섹션 렌더 순서 — webapp/src/components/stock/stock-detail-client.tsx (line 156-162)
```tsx
      <StockThemeChips stockCode={stock.code} />
      <StockComovementSection stockCode={stock.code} />   {/* line 157 — 동반상승 후보 */}
      <StockLimitUpSection stockCode={stock.code} />       {/* line 158 — 상한가 다음날 이력 */}
      <div className="space-y-6">
        <StockNewsSection stockCode={stock.code} />
        <StockDiscussionSection stockCode={stock.code} />
      </div>
```
→ 157 과 158 두 줄의 순서만 교체 (LimitUp 을 위로).

## 근거 아코디언 기본 상태 — webapp/src/components/stock/stock-comovement-section.tsx (line 114-116)
```tsx
function CandidateRow({ c }: { c: CoMovementCandidate }) {
  // 기본 펼침 — 점수 근거를 항상 노출(사용자 요청). 토글로 접기 가능.
  const [open, setOpen] = useState(true);   // line 116
```
→ `useState(true)` → `useState(false)`, 주석도 "기본 접힘" 으로 갱신.
→ 토글 버튼(line 208-219: "근거 보기" / "근거 접기", `aria-expanded={open}`)은 그대로 재사용.

## 테스트 의존성 — webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx
- **Test 10 (line 221-264)** "근거 아코디언 기본 펼침" — 기본 펼침을 명시 검증(로드 직후 '연결 경로' 노출 기대, 토글 '근거 접기'/aria-expanded=true). **반드시 기본 접힘 로직으로 뒤집어야 함.**
- **Test 5 (line 133)** / **Test 6 (line 149)** — 주석이 "기본 펼침이라 …양쪽 노출" 이라 서술. `getAllByText(...).length >= 1` assertion 자체는 접힘에서도 통과하지만, 주석이 부정확해지므로 주석 정정.
- 나머지 테스트(1-4, 7-9)는 근거 기본 상태·섹션 순서와 무관.

## E2E 확인 결과
e2e/specs/stock-detail.spec.ts 및 기타 spec 은 두 섹션의 순서/근거 펼침 상태를 assert 하지 않음 → E2E 수정 불필요.

## 테스트 명령
webapp: `pnpm --filter webapp test` (vitest --run --passWithNoTests)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 섹션 순서 교체 + 근거 아코디언 기본 접힘</name>
  <files>webapp/src/components/stock/stock-detail-client.tsx, webapp/src/components/stock/stock-comovement-section.tsx</files>
  <action>
1. **stock-detail-client.tsx (line 157-158)** — 두 섹션의 렌더 순서를 교체한다. `<StockLimitUpSection stockCode={stock.code} />` 를 먼저, `<StockComovementSection stockCode={stock.code} />` 를 나중에 배치. import 문(line 18-19)은 변경 불필요.

   변경 후:
   ```tsx
         <StockThemeChips stockCode={stock.code} />
         <StockLimitUpSection stockCode={stock.code} />
         <StockComovementSection stockCode={stock.code} />
   ```

2. **stock-comovement-section.tsx (line 115-116)** — CandidateRow 의 근거 아코디언 기본 상태를 접힘으로 변경:
   - `const [open, setOpen] = useState(true);` → `const [open, setOpen] = useState(false);`
   - line 115 주석 `// 기본 펼침 — 점수 근거를 항상 노출(사용자 요청). 토글로 접기 가능.` → `// 기본 접힘 — 카드 스캔성 우선(사용자 요청). "근거 보기" 토글로 펼침.` 로 갱신.
   - 토글 버튼(line 208-219)과 조건부 렌더(`{open && ...}`, line 221)는 이미 open state 를 소비하므로 변경 불필요.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter webapp typecheck</automated>
  </verify>
  <done>stock-detail-client.tsx 에서 StockLimitUpSection 이 StockComovementSection 보다 먼저 렌더되고, stock-comovement-section.tsx 의 CandidateRow open 초기값이 false. typecheck 통과.</done>
</task>

<task type="auto">
  <name>Task 2: 근거 기본 접힘에 의존하는 단위 테스트 업데이트</name>
  <files>webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx</files>
  <action>
근거 아코디언이 이제 기본 접힘이므로 이를 검증하는 테스트를 정정한다:

1. **Test 10 (line 221-264, "근거 아코디언 기본 펼침 → …")** — 기본 접힘 시나리오로 뒤집는다:
   - 테스트 제목을 "근거 아코디언 기본 접힘 → 토글로 펼침" 으로 변경.
   - 로드 직후에는 점수 분해가 **보이지 않아야** 함: `expect(screen.queryByText('연결 경로')).not.toBeInTheDocument();` 및 최근 동반급등('최근 동반급등') 등도 미노출 확인.
   - 초기 토글 버튼은 `screen.getByRole('button', { name: '근거 보기' })` 이고 `aria-expanded` 가 `'false'` 여야 함.
   - 토글 클릭(`await userEvent.click(toggle)`) 후 점수 분해가 노출되어야 함: `expect(screen.getByText('연결 경로')).toBeInTheDocument();`, `expect(screen.getByText('테마 + 동반급등')).toBeInTheDocument();`, `expect(screen.getByText('06/18')).toBeInTheDocument();`, `expect(screen.getByText('+25%')).toBeInTheDocument();` 등 기존 펼침 assertion 을 클릭 이후로 이동. 펼친 뒤 버튼 이름은 '근거 접기', aria-expanded='true'.

2. **Test 5 (line 133) / Test 6 (line 149)** — 주석 "기본 펼침이라 …양쪽 노출" 을 "기본 접힘이라 근거상세 미노출 — 칩/우측 메트릭만" 으로 정정. assertion(`getAllByText(...).length >= 1`)은 그대로 두어도 통과하지만, 근거상세가 접혀 실제로는 1회만 노출됨을 반영해 주석을 정확히 한다. (assertion 을 `toHaveLength(1)` 로 좁혀도 무방하나 필수 아님 — 최소 변경 우선.)

나머지 테스트(1-4, 7-9)는 수정하지 않는다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar && pnpm --filter webapp test</automated>
  </verify>
  <done>vitest 스위트 전체 통과. Test 10 이 기본 접힘 → 토글 펼침을 검증하고, 로드 직후 '연결 경로' 미노출 · 클릭 후 노출을 확인한다.</done>
</task>

</tasks>

<verification>
- `pnpm --filter webapp typecheck` 통과
- `pnpm --filter webapp test` 전체 통과 (특히 stock-comovement-section.test.tsx)
- stock-detail-client.tsx JSX 에서 StockLimitUpSection 이 StockComovementSection 보다 앞에 위치
- stock-comovement-section.tsx 의 CandidateRow `useState(false)`
</verification>

<success_criteria>
- 종목 상세 페이지에서 "상한가 다음날 이력"이 "동반상승 후보"보다 위에 표시된다
- "동반상승 후보" 각 카드의 근거가 기본 접힌 상태로 나타나고 "근거 보기" 클릭 시 펼쳐진다
- typecheck + vitest 그린
</success_criteria>

<output>
After completion, create `.planning/quick/260706-dvl-detail-section-order/260706-dvl-SUMMARY.md`
</output>
