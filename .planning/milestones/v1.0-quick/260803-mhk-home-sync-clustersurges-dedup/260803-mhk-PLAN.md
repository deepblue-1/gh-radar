---
phase: quick-260803-mhk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/home-sync/src/ai/clusterSurges.ts
  - workers/home-sync/src/ai/clusterSurges.test.ts
autonomous: false
requirements: [HOME-01]

must_haves:
  truths:
    - "enforceMembershipInvariant 로 멤버가 줄어든 뒤에도 테마 배열이 최종 멤버 수 desc → 동률 시 평균 changeRate desc 순서로 정렬된다"
    - "dedup 으로 2종목이 된 테마가 3종목 테마보다 위에 노출되지 않는다"
    - "화면에 표시되는 'N종목 · 평균 X%' 값과 카드 노출 순서의 근거가 동일한 최종 stocks 로 일치한다"
    - "정렬 기준(멤버 수 → 평균 등락률)이 코드상 단일 비교 로직으로 존재해 sortThemes 와 최종 재정렬이 갈라지지 않는다"
    - "enforceMembershipInvariant 와 신규 재정렬 함수 모두 순수 — 입력 배열/원소를 변경하지 않는다"
    - "동률 테마의 상대 순서는 invariant 출력 순서를 유지한다 (안정 정렬)"
    - "기존 home-sync 테스트 129개가 회귀 없이 통과한다"
  artifacts:
    - path: "workers/home-sync/src/ai/clusterSurges.ts"
      provides: "공유 비교 로직 + HomeSurgeTheme 용 최종 재정렬 + clusterSurges 파이프라인 적용"
      contains: "sortHomeSurgeThemes"
    - path: "workers/home-sync/src/ai/clusterSurges.test.ts"
      provides: "sortHomeSurgeThemes 유닛(멤버 수/평균/순수/안정) + invariant 후 재정렬 통합 회귀"
      contains: "sortHomeSurgeThemes"
  key_links:
    - from: "enforceMembershipInvariant 결과"
      to: "clusterSurges 반환 themes"
      via: "sortHomeSurgeThemes 재정렬"
      pattern: "sortHomeSurgeThemes\\(inv\\.themes\\)"
    - from: "sortThemes (ClusterTheme)"
      to: "sortHomeSurgeThemes (HomeSurgeTheme)"
      via: "동일 비교 함수 공유"
      pattern: "compareThemeRank"
---

<objective>
home-sync clusterSurges 에서 중복 소속 invariant 적용 후 테마 배열을 다시 정렬해, 정렬 근거와
화면 표시 값의 불일치를 없앤다.

배경: 현재 테마 순서는 `sortThemes` 가 **dedup 이전** stockCodes 기준으로 확정한다. 그 뒤
`enforceMembershipInvariant` 가 중복 종목을 한쪽 테마에서 제거해도 순서는 그대로다. 결과적으로
종목을 뺏겨 2종목만 남은 테마가 3종목 테마보다 위에 노출될 수 있고, 카드에 찍히는
"N종목 · 평균 X%"(dedup 후 stocks 로 계산)는 정렬 근거와 다른 값이 된다.

Purpose: 홈 급등 테마 카드의 순서 신뢰성 — 위에 있는 테마가 실제로 더 넓은(그리고 더 센) 테마여야 한다.
Output: clusterSurges.ts 비교 로직 단일화 + invariant 후 재정렬, 유닛/통합 테스트, 프로덕션 배포+smoke.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@workers/home-sync/src/ai/clusterSurges.ts
@workers/home-sync/src/ai/clusterSurges.test.ts
@workers/home-sync/src/ai/roundup.ts

<interfaces>
<!-- 실행자가 직접 사용할 핵심 계약. 코드 탐색 불필요. -->

**현재 clusterSurges 실행 순서 (clusterSurges.ts:446~590):**
```
Claude 1x → parseClusterResponse
  → demoteInvalidThemes (급등 집합 밖 drop, <2 → single 강등)
  → resolveNewsRefs
  → reassignOrphans (고아 종목 테마 병합)
  → sortThemes(mergedThemes, rateByCode)      ← 정렬 지점 (dedup 이전 stockCodes 기준)
  → HomeSurgeTheme 빌드 (stocks 해석 + 멤버 뉴스 보강 + dedupeNewsByUrl)
  → singles 정리 + changeRate desc
  → enforceMembershipInvariant (중복 제거 → 멤버 수 변동!)   ← 여기서 순서 무효화
  → inv.singles.sort(changeRate desc)                        ← singles 만 재정렬
  → return inv
```

**타입 차이 (재정렬이 그냥 sortThemes 재호출로 안 되는 이유):**
```typescript
// sortThemes 가 받는 형태 (invariant 이전)
export function sortThemes<T extends { stockCodes: string[] }>(themes: T[], rateByCode: Map<string, number>): T[]

// enforceMembershipInvariant 가 다루는 형태 (invariant 이후) — @gh-radar/shared
interface HomeSurgeTheme {
  name: string;
  reason: string | null;
  stocks: Array<{ code: string; name: string; changeRate: number }>;  // ← stockCodes 아님
  news: HomeNewsRef[];
}
```
HomeSurgeTheme 의 `stocks[].changeRate` 는 surgeByCode 에서 온 값이라 `rateByCode` 조회 결과와
항상 동일하다 → 최종 재정렬은 rateByCode 없이 stocks 만으로 계산 가능하다.

**현재 정렬 기준 (D-05, clusterSurges.ts:264-280) — 그대로 보존할 규칙:**
① 멤버 수 desc ② 동률 시 멤버 평균 changeRate desc. 빈 배열 평균은 0.

**invariant 계약 (변경 금지):** 순수 함수 — 입력 배열/원소 원본 미변경. 테스트
`clusterSurges.test.ts:450` 이 `JSON.stringify` 전후 비교로 이를 강제한다. 신규 재정렬 함수도
같은 계약을 따른다(`[...themes].sort(...)`, in-place 금지).

**소비 측 (변경 없음, 확인만):** server `/api/home` 및 webapp `theme-card.tsx` 는 payload 의
themes 배열 순서를 그대로 렌더하고 "N종목 · 평균 X%" 는 dedup 후 stocks 로 계산한다.
→ 워커 쪽 배열 순서만 고치면 화면이 자동으로 일치한다. 웹앱/서버 코드 수정 불필요.

**테스트 mock 패턴 (clusterSurges.test.ts:19-83, 그대로 사용):**
```typescript
const hoist = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn().mockImplementation(() => ({ messages: { create: hoist.mockCreate } })) }));
hoist.mockCreate.mockResolvedValue(textResponse(JSON.stringify({ themes: [...], singles: [] })));
```
`textResponse(text)` 헬퍼는 `{ content: [{ type: "text", text }] }` 를 만든다.
(주의: 기존 헬퍼는 `stop_reason` 이 없어 `!== "end_turn"` 경고 로그가 찍히지만 logLevel=silent
+ 파싱은 정상이라 무해 — 기존 통합 테스트들과 동일 패턴 유지.)

**evidence 판정 (enforceMembershipInvariant → isRoundupNews):** 테마의 news 중
"라운드업이 아니고(급등 종목명 3개 미만 등장) 제목에 그 종목명이 verbatim 포함" 인 뉴스가 있으면
그 테마가 근거 테마. HomeSurgeTheme 빌드 시 **멤버 종목의 뉴스가 테마 news 로 보강**되므로,
통합 테스트에서 "한쪽 테마에만 evidence" 를 만들려면 evidence 기사를 **공유 종목이 아닌,
한쪽 테마에만 속한 멤버 종목의 뉴스**로 넣어야 한다 (공유 종목 자신의 뉴스로 넣으면 양쪽
테마 모두 evidence 를 갖게 되어 복수 소속 유지 분기로 빠진다).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 정렬 비교 로직 단일화 + sortHomeSurgeThemes 신설</name>
  <files>workers/home-sync/src/ai/clusterSurges.ts, workers/home-sync/src/ai/clusterSurges.test.ts</files>
  <behavior>
    신규 `export function sortHomeSurgeThemes(themes: HomeSurgeTheme[]): HomeSurgeTheme[]`:
    - stocks.length desc 로 정렬한다 (3종목 테마가 2종목 테마보다 앞).
    - 멤버 수 동률이면 멤버 changeRate 평균 desc 로 정렬한다.
    - 순수 — 입력 배열과 원소를 변경하지 않는다(`[...themes].sort`).
    - 안정 정렬 — 멤버 수·평균이 모두 같은 두 테마는 입력 순서를 유지한다.
    - 빈 배열 입력 → 빈 배열.

    기존 `sortThemes` 는 시그니처/동작 무변경 — 내부적으로 신규 공유 비교 함수를 쓸 뿐이며
    `clusterSurges.test.ts:154` "sortThemes (D-05 breadth sort)" 테스트가 그대로 통과해야 한다.

    신규 유닛 테스트 describe("sortHomeSurgeThemes (invariant 후 재정렬)"):
    1. 멤버 3개 테마가 멤버 2개 테마보다 앞 (2개 테마의 평균 등락률이 더 높아도).
    2. 멤버 수 동률 → 평균 changeRate 높은 테마가 앞.
    3. 순수 — 호출 전후 `JSON.stringify(input)` 동일.
    4. 멤버 수·평균 모두 동률 → 입력 순서 유지(안정).
  </behavior>
  <action>
    clusterSurges.ts 의 `sortThemes` (264-280) 자리에서 비교 로직을 추출한다. 정렬 기준이 두 군데로
    갈라지면 곧바로 이번 버그가 재발하므로 **비교 로직은 반드시 한 곳**에 둔다:

    ```typescript
    /** 멤버 등락률 배열 평균 (빈 배열 0). */
    function avgRate(rates: number[]): number {
      if (rates.length === 0) return 0;
      let sum = 0;
      for (const r of rates) sum += r;
      return sum / rates.length;
    }

    /**
     * 테마 랭킹 비교 (D-05) — 멤버 수 desc → 동률 시 멤버 평균 changeRate desc.
     * sortThemes(클러스터 단계, stockCodes)와 sortHomeSurgeThemes(invariant 후, stocks)가
     * 같은 기준을 쓰도록 단일 비교 함수로 공유한다.
     */
    function compareThemeRank(a: number[], b: number[]): number {
      if (b.length !== a.length) return b.length - a.length;
      return avgRate(b) - avgRate(a);
    }
    ```

    `sortThemes` 는 rateByCode 조회로 rate 배열을 만들어 위 비교를 호출하도록만 바꾼다
    (기존 `rateByCode.get(c) ?? 0` 기본값 유지, 시그니처·export 무변경):
    ```typescript
    export function sortThemes<T extends { stockCodes: string[] }>(
      themes: T[],
      rateByCode: Map<string, number>,
    ): T[] {
      const rates = (codes: string[]): number[] => codes.map((c) => rateByCode.get(c) ?? 0);
      return [...themes].sort((a, b) => compareThemeRank(rates(a.stockCodes), rates(b.stockCodes)));
    }
    ```

    그 아래(또는 enforceMembershipInvariant 직후)에 신규 함수를 추가한다:
    ```typescript
    /**
     * invariant 후 최종 재정렬 (quick-260803-mhk) — D-05 와 동일 기준을 **dedup 후 실제 멤버**에
     * 적용한다. enforceMembershipInvariant 가 중복 종목을 제거하면 sortThemes 가 확정한 순서
     * (dedup 이전 stockCodes 기준)가 무효화되어, 2종목으로 줄어든 테마가 3종목 테마 위에
     * 남는 사고가 있었다(정렬 근거 ≠ 카드에 표시되는 "N종목 · 평균 X%").
     *
     * HomeSurgeTheme.stocks[].changeRate 는 surgeByCode 에서 온 값이라 rateByCode 재조회 불필요.
     * 순수 — 입력 배열/원소 미변경. 안정 정렬이라 완전 동률은 invariant 출력 순서를 유지.
     */
    export function sortHomeSurgeThemes(themes: HomeSurgeTheme[]): HomeSurgeTheme[] {
      return [...themes].sort((a, b) =>
        compareThemeRank(
          a.stocks.map((s) => s.changeRate),
          b.stocks.map((s) => s.changeRate),
        ),
      );
    }
    ```

    테스트 파일 상단 import 에 `sortHomeSurgeThemes` 를 추가하고, 기존
    "sortThemes (D-05 breadth sort)" describe 바로 아래에 신규 describe 를 넣는다. 픽스처는
    기존 invariant describe 의 `theme()` 헬퍼처럼 `{ name, reason: null, stocks: [...], news: [] }`
    형태 로컬 헬퍼로 만들되 changeRate 를 케이스별로 지정할 수 있게 한다.

    이 태스크에서 clusterSurges 본체(446~590)는 아직 건드리지 않는다 — Task 2 에서 적용한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar/workers/home-sync && pnpm test && pnpm typecheck</automated>
  </verify>
  <done>sortHomeSurgeThemes 유닛 4케이스 통과 + 기존 129개 회귀 0 + typecheck exit 0. 비교 로직이 compareThemeRank 한 곳에만 존재한다(grep 으로 정렬 기준 중복 구현 없음 확인).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: clusterSurges 파이프라인에 invariant 후 재정렬 적용 + 통합 회귀</name>
  <files>workers/home-sync/src/ai/clusterSurges.ts, workers/home-sync/src/ai/clusterSurges.test.ts</files>
  <behavior>
    clusterSurges 반환값의 themes 가 `enforceMembershipInvariant` 결과에 `sortHomeSurgeThemes` 를
    적용한 배열이어야 한다. singles 는 기존대로 changeRate desc.

    신규 통합 테스트 (describe("clusterSurges") 안, 기존 invariant 통합 테스트 근처):
    "중복 제거로 멤버가 줄어든 테마는 최종 순서에서 내려간다 (quick-260803-mhk)"

    픽스처 (surge 헬퍼를 쓰지 말고 로컬에서 name/뉴스 제목을 직접 지정 — evidence 매칭 필요):
      - 001 알파  30%  news 없음
      - 002 베타  29%  news 없음
      - 003 감마  28%  news 없음                    ← 두 테마 공유 종목
      - 004 델타  21%  news: ["감마 대규모 공급계약 체결"]   ← 테마 "나" 전용 멤버의 evidence 기사
      - 005 엡실론 20%  news 없음
    Claude mock 응답:
      themes: [
        { name: "가", reason: null, stockCodes: ["001","002","003"], newsRefs: [] },  // 평균 29
        { name: "나", reason: null, stockCodes: ["003","004","005"], newsRefs: [] },  // 평균 23
      ], singles: []

    기대 동작:
      - 초기 sortThemes: 둘 다 3종목 동률 → 평균 높은 "가" 가 앞 → [가, 나].
      - HomeSurgeTheme 빌드: 멤버 뉴스 보강으로 "나" 의 news 에만 "감마 대규모 공급계약 체결" 이
        들어간다("가" 는 004 를 멤버로 갖지 않음). 이 기사는 급등 종목명 1개만 등장 → 라운드업 아님.
      - invariant: 003 이 2테마 중복 → evidence 는 "나" 뿐(1개) → "나" 가 003 유지, "가" 는 003 제거
        → "가" 2종목(알파·베타), "나" 3종목.
      - **최종 themes 순서 = ["나", "가"]** (3종목이 2종목보다 앞). 수정 전이면 ["가", "나"] 로 실패한다.
    assert:
      - `res.themes.map(t => t.name)` === ["나", "가"]
      - "나".stocks.length === 3, "가".stocks.length === 2
      - "가".stocks 에 003 없음 (dedup 유지 회귀 가드)
      - singles 는 빈 배열 (강등 없음)

    기존 통합 테스트 `clusterSurges.test.ts:475` (D-05 정렬)과 `:688` (invariant 통합)이
    회귀 없이 통과해야 한다.
  </behavior>
  <action>
    clusterSurges.ts 580-589 구간을 재정렬 적용으로 바꾼다:
    ```typescript
    // 중복 소속 invariant (quick-260720-kyh) — 테마간 중복 정리 + 테마+single 동시 제거 +
    // sub-2 테마 강등. 순수 후처리.
    const inv = enforceMembershipInvariant(
      themes,
      singles,
      surges.map((s) => s.name),
      surgeByCode,
    );
    // invariant 가 멤버를 제거하므로 위쪽 sortThemes(dedup 이전 stockCodes 기준) 결과는 무효 —
    // 최종 멤버 기준으로 D-05 정렬을 다시 적용한다 (quick-260803-mhk). 강등 single 이 추가될 수
    // 있으므로 singles 도 재정렬.
    const finalSingles = [...inv.singles].sort((a, b) => b.changeRate - a.changeRate);
    return { themes: sortHomeSurgeThemes(inv.themes), singles: finalSingles };
    ```
    (기존 `inv.singles.sort(...)` in-place 를 복제 정렬로 바꿔도 되고 그대로 둬도 된다 —
    inv.singles 는 invariant 가 만든 새 배열이라 둘 다 안전. 한 스타일로 통일할 것.)

    파일 상단 JSDoc 흐름 설명(25-36 라인)의 5번 항목에 "invariant 후 최종 멤버 기준 재정렬"
    단계를 1줄 추가한다.

    테스트는 기존 통합 describe 안에 위 픽스처로 케이스를 추가한다. 로컬 surge 빌더 예시:
    ```typescript
    const s = (code: string, name: string, changeRate: number, titles: string[] = []): Surge => ({
      code, name, changeRate,
      news: titles.map((t, i) => ({
        id: `${code}-${i}`, stock_code: code, title: t,
        url: `https://n/${code}/${i}`, source: "출처",
        published_at: "2026-08-03T00:00:00Z",
      })),
    });
    ```
    index.ts / prompt.ts / server / webapp 은 변경하지 않는다 — 워커가 저장하는 payload 의
    themes 배열 순서만 달라지고 소비 측은 그 순서를 그대로 렌더한다.
  </action>
  <verify>
    <automated>cd /Users/alex/repos/gh-radar/workers/home-sync && pnpm test && pnpm typecheck && pnpm build</automated>
  </verify>
  <done>신규 통합 케이스가 ["나","가"] 순서를 assert 하며 통과하고(수정 전 코드에서는 실패함을 확인), 기존 129개 회귀 0, typecheck/build exit 0.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: 배포 + smoke + 홈 순서 육안 확인 (체크포인트)</name>
  <action>오케스트레이터가 아래 how-to-verify 절차를 실행한 뒤 사용자 승인을 받는다. 코드 변경 없음.</action>
  <what-built>
    clusterSurges 에 invariant 후 최종 재정렬(sortHomeSurgeThemes) 적용 — 중복 제거로 멤버가 줄어든
    테마가 더 넓은 테마 위에 남던 순서 오류 해소. 정렬 기준은 compareThemeRank 한 곳으로 단일화.
    코드/테스트 완료. 프로덕션 배포 + smoke 는 오케스트레이터가 실행.
  </what-built>
  <how-to-verify>
    오케스트레이터 실행 절차:
    1. 빌드: `cd /Users/alex/repos/gh-radar/workers/home-sync && pnpm build`
    2. 배포: `bash /Users/alex/repos/gh-radar/scripts/deploy-home-sync.sh`
       (env: GCP_PROJECT_ID + SUPABASE_URL 필수 — MEMORY reference_deploy_worker_env)
    3. smoke: `bash /Users/alex/repos/gh-radar/scripts/smoke-home-sync.sh` — 전 항목 PASS.
    4. Job 1회 실행 후 오늘 최신 home_theme_snapshots payload 확인:
       - themes 배열이 stocks.length desc 로 정렬돼 있다(앞 테마의 멤버 수가 뒤 테마보다 작지 않다).
       - 멤버 수 동률 구간은 멤버 평균 changeRate 가 내림차순이다.
       - 한 종목이 2개 테마에 중복 등장하지 않는다(invariant 회귀 가드).
       - 테마 수/종목 수가 이전 슬롯 대비 급감하지 않았다(순서만 바뀌어야 함).
       - 급등 없는 시간대라 비어 있으면 최근 급등 있던 trade_date 스냅샷과 비교.
    5. 프로덕션 홈(https://gh-radar-webapp.vercel.app/) 육안 확인 — 위 카드의 "N종목" 이
       아래 카드보다 작지 않다.
    커밋은 CLAUDE.md 규칙(한글 메시지, 사용자 확인 후, Co-Authored-By 금지) 준수.
  </how-to-verify>
  <resume-signal>배포+smoke PASS 및 홈 카드 순서 확인 후 "approved" 또는 이슈 보고</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (변경 없음) | 순수 in-process 후처리 — 외부 입력·네트워크·DB 스키마 경계 변화 없음 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mhk-01 | Tampering | enforceMembershipInvariant 입력 배열 | mitigate | 신규 재정렬은 `[...themes].sort` 복제 정렬 — 순수 계약 유지, 기존 순수성 테스트(:450)로 강제 |
| T-mhk-02 | Denial of Service | clusterSurges 정렬 비용 | accept | 테마 수 한 자릿수, O(n log n) 비교당 평균 계산 — 사이클 예산 대비 무시 가능 |
| T-mhk-03 | Information Disclosure | 저장 payload | accept | 저장 필드·뉴스 건수 변화 없음(순서만 변경) — CLAUDE.md 5원칙 #5 영향 없음 |
</threat_model>

<verification>
- `cd workers/home-sync && pnpm test && pnpm typecheck && pnpm build` 통과 (기존 129개 회귀 0).
- sortHomeSurgeThemes 유닛: 멤버 수 우선 / 동률 시 평균 / 순수 / 안정 정렬 4케이스.
- 통합 회귀: 003 중복 → evidence 테마 "나" 유지, "가" 2종목 축소 → 최종 순서 ["나","가"].
- 정렬 기준이 compareThemeRank 단일 구현으로만 존재(중복 정렬 로직 없음).
- 배포 후 smoke-home-sync.sh 전 항목 PASS + 스냅샷 themes 순서가 멤버 수 desc.
</verification>

<success_criteria>
1. clusterSurges 결과 themes 가 dedup 후 최종 멤버 기준으로 정렬된다(멤버 수 desc → 평균 등락률 desc).
2. 2종목으로 줄어든 테마가 3종목 테마보다 위에 노출되지 않는다.
3. 카드의 "N종목 · 평균 X%" 표시 값과 노출 순서 근거가 동일한 stocks 집합이다.
4. 정렬 기준이 코드상 한 곳(compareThemeRank)에만 존재한다.
5. enforceMembershipInvariant 순수 계약 + 기존 테스트 129개 무회귀, 프로덕션 smoke 전 항목 PASS.
</success_criteria>

<output>
완료 후 `.planning/quick/260803-mhk-home-sync-clustersurges-dedup/260803-mhk-SUMMARY.md` 생성.
</output>
