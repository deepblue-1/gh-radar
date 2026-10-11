---
phase: quick-260720-kyh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/home-sync/src/ai/prompt.ts
  - workers/home-sync/src/ai/prompt.test.ts
  - workers/home-sync/src/ai/clusterSurges.ts
  - workers/home-sync/src/ai/clusterSurges.test.ts
  - workers/home-sync/src/index.ts
  - workers/home-sync/src/index.test.ts
autonomous: false
requirements: [HOME-01]

must_haves:
  truths:
    - "hash-miss(4b) 클러스터링 시 직전 슬롯 테마 구성이 프롬프트에 '직전 테마 구성' 섹션으로 전달된다"
    - "prevRow 가 empty payload(themes 0)면 직전 테마 구성 섹션이 생략된다"
    - "같은 참고 테마에 속한 급등 2+ 종목은, 뉴스가 명확히 다른 재료를 제시하지 않는 한 그 테마로 묶인다(should)"
    - "한 종목이 테마+single 동시 등장하면 single 에서 제거된다"
    - "한 종목이 2+ 테마에 있으면 뉴스 근거 있는 테마만 유지(2+면 복수 허용, 0~1이면 우선순위로 1개 축소)"
    - "stock_count 가 unique 코드 수로 집계된다(복수 소속 중복 집계 없음)"
    - "기존 홈싱크 테스트 스위트가 회귀 없이 통과한다"
  artifacts:
    - path: "workers/home-sync/src/ai/prompt.ts"
      provides: "sticky-prior 섹션 렌더링 + can→should 힌트 규칙 + 중복 소속 원칙 프롬프트"
      contains: "직전 테마 구성"
    - path: "workers/home-sync/src/ai/clusterSurges.ts"
      provides: "enforceMembershipInvariant 후처리 + prevThemes passthrough"
      contains: "enforceMembershipInvariant"
    - path: "workers/home-sync/src/index.ts"
      provides: "4b 에서 prevRow.payload.themes 전달 + countStocks unique"
  key_links:
    - from: "workers/home-sync/src/index.ts"
      to: "clusterSurges"
      via: "4b 분기에서 prevRow.payload.themes 전달"
      pattern: "cluster\\(surges, cfg, themeHints"
    - from: "workers/home-sync/src/ai/clusterSurges.ts"
      to: "formatClusterMessage"
      via: "prevThemes 인자 passthrough"
      pattern: "formatClusterMessage\\("
---

<objective>
home-sync 클러스터링 안정화 3종 — 5분 슬롯마다 백지 재클러스터링으로 테마 구성이 명멸하고
(고려산업 [사료]→[애국테마]→single 요동), 같은 종목이 두 테마 또는 테마+single 에 동시
소속되는 중복이 다수 발생하는 문제를 해결한다.

세 가지 승인된 변경:
① sticky prior — 직전 슬롯 테마 구성을 프롬프트에 넘겨 "직전을 기본값으로 유지" 하도록 유도.
② 힌트 규칙 can→should — 같은 참고 테마 급등 2+ 종목은 명확한 다른 재료 뉴스가 없는 한 묶어라.
③ 중복 소속 invariant — 테마+single 동시 제거 + 테마간 중복은 근거 있을 때만 복수 허용.

Purpose: 슬롯 간 테마 안정성 확보 + 중복 소속 정리로 홈 화면 신뢰도 상승.
Output: prompt.ts / clusterSurges.ts / index.ts 3파일 로직 + 테스트, 프로덕션 배포+smoke.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@workers/home-sync/src/ai/prompt.ts
@workers/home-sync/src/ai/clusterSurges.ts
@workers/home-sync/src/ai/roundup.ts
@workers/home-sync/src/index.ts
@workers/home-sync/src/pipeline/loadSurges.ts

<interfaces>
<!-- 실행자가 직접 사용할 핵심 계약. 코드 탐색 불필요. -->

packages/shared/src/home.ts (읽기전용, 변경 금지):
```typescript
export interface HomeNewsRef { title: string; url: string; source: string; }  // description 없음 → isRoundupNews 는 title 만으로 판정
export interface HomeSurgeStock { code: string; name: string; changeRate: number; }
export interface HomeSurgeTheme { name: string; reason: string | null; stocks: HomeSurgeStock[]; news: HomeNewsRef[]; }
export interface HomeSurgeSingle { code: string; name: string; changeRate: number; reason: string | null; news: HomeNewsRef[]; }
export interface HomeSnapshotPayload { threshold: number; marketStatus: "premarket"|"open"|"closed"; themes: HomeSurgeTheme[]; singles: HomeSurgeSingle[]; }
```

workers/home-sync/src/ai/roundup.ts (읽기전용, 재사용):
```typescript
// 종목명(surgeNames)이 title+description 에 distinct minDistinct(기본 3)개 이상 등장하면 라운드업.
export function isRoundupNews(news: { title: string; description?: string | null }, surgeNames: Iterable<string>, minDistinct?: number): boolean;
```

workers/home-sync/src/ai/prompt.ts (현재 시그니처 — 이 plan 에서 확장):
```typescript
export function formatClusterMessage(surges: Surge[], themeHints?: Map<string, string[]>):
  { message: string; indexedNews: Array<{ title: string; url: string; source: string }> };
```

workers/home-sync/src/ai/clusterSurges.ts (현재 시그니처 — 이 plan 에서 확장):
```typescript
export async function clusterSurges(surges: Surge[], cfg: HomeSyncConfig, themeHints?: Map<string, string[]>): Promise<ClusterResult>;
// ClusterResult = Pick<HomeSnapshotPayload, "themes" | "singles">
```

**중요 — server/webapp 영향 확인 완료 (grep):**
- server/src/mappers/home.ts 는 stock_count 를 DB row 에서 **verbatim 통과** (재계산 없음).
- webapp/src/components/home/* 은 stockCount 를 재계산하지 않음 (theme-* 컴포넌트의 stockCount 는 별개 도메인).
- 따라서 countStocks 를 unique 로 바꿔도 server/webapp 영향 없음 — 워커 저장값이 곧 표시값.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 프롬프트 3종 — sticky prior 섹션 + can→should 힌트 + 중복 소속 원칙</name>
  <files>workers/home-sync/src/ai/prompt.ts, workers/home-sync/src/ai/prompt.test.ts</files>
  <behavior>
    formatClusterMessage(surges, themeHints, prevThemes):
    - prevThemes(HomeSurgeTheme[]) 비어있거나 모든 테마가 현재 급등집합과 교집합 0 → "직전 테마 구성" 섹션 미출력 (기존 message 그대로, 하위호환).
    - prevThemes 있으면 "참고 테마 분류" 섹션 뒤(또는 마지막)에 아래 포맷 append:
        `직전 테마 구성 (5분 전):\n- 사료: 002140 고려산업, 218150 미래생명자원`
      멤버는 현재 급등집합(surges code)에 존재하는 종목만 렌더(이탈 종목 제외), 이름은 현재 surges name 사용, 남은 멤버 0인 테마 라인은 skip. 뉴스/reason 은 미포함(토큰 절약).
    - indexedNews 계약은 prevThemes 유무와 무관하게 불변.
    시스템 프롬프트(CLUSTER_SYSTEM_PROMPT):
    - sticky rule 추가: "직전 테마 구성이 주어지면 그것을 기본값으로 유지하라. 새 뉴스나 급등 집합 변화가 명확히 다른 분류를 요구할 때만 변경한다. 테마명도 직전 이름을 그대로 재사용한다(같은 묶음에 새 이름 금지)."
    - 힌트 규칙 can→should: 기존 "묶을 수 있다" 문장을 "같은 참고 테마 분류에 속한 급등 종목 2개 이상은, 각 종목의 뉴스가 서로 다른 재료를 명확히 제시하지 않는 한, 그 테마로 묶어라." 로 강화. 뉴스 우선 규칙과의 관계 명시: 뉴스가 **명확한 다른 재료**를 제시할 때만 힌트를 이긴다(무정보 기사·[라운드업]은 다른 재료로 보지 않음).
    - 중복 소속 원칙 추가: "한 종목은 원칙적으로 가장 잘 맞는 테마 하나에. 서로 다른 재료가 각각 뉴스로 확인될 때만 복수 테마 소속 허용."
    prompt.test.ts:
    - prevThemes 주면 "직전 테마 구성 (5분 전):" 라인 + 멤버 포맷 존재.
    - prevThemes=[] 이면 섹션 미출력.
    - prevThemes 멤버가 현재 급등집합 밖이면 해당 멤버/테마 렌더 제외.
    - 시스템 프롬프트에 sticky/should/복수소속 문구 존재(핵심 키워드 assert).
  </behavior>
  <action>
    prompt.ts: formatClusterMessage 에 3번째 인자 `prevThemes: HomeSurgeTheme[] = []` 추가(HomeSurgeTheme import from "@gh-radar/shared"). 기존 themeHints 섹션 append 로직 아래에, prevThemes.length>0 일 때 현재 surges code Set 으로 멤버 필터 → 라인 구성 → 하나라도 라인 있으면 `\n\n직전 테마 구성 (5분 전):\n{lines}` append. CLUSTER_SYSTEM_PROMPT 규칙 리스트에 위 behavior 3문구 반영(기존 line 32 "묶을 수 있다" 문장을 should 문장으로 교체, 뉴스우선 line 33 근처에 "명확한 다른 재료" 조건 명시, 마지막 규칙으로 복수소속 원칙 추가). few-shot 은 변경하지 않음(토큰 절약).
    표시 문구는 위 behavior 의 한글 원문을 그대로 사용(사용자 승인 문구).
  </action>
  <verify>
    <automated>cd workers/home-sync && pnpm test -- prompt.test.ts && pnpm typecheck</automated>
  </verify>
  <done>prompt.test.ts green + typecheck 통과. 직전 테마 구성 섹션 렌더/생략 조건 + 프롬프트 문구 검증.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 중복 소속 invariant + prevThemes 배선 + countStocks unique</name>
  <files>workers/home-sync/src/ai/clusterSurges.ts, workers/home-sync/src/ai/clusterSurges.test.ts, workers/home-sync/src/index.ts, workers/home-sync/src/index.test.ts</files>
  <behavior>
    enforceMembershipInvariant(themes: HomeSurgeTheme[], singles: HomeSurgeSingle[], surgeNames: string[]): { themes, singles } — 순수함수, export:
    - (a) 테마간 중복: 2+ 테마에 있는 code 마다 → 각 테마에서 "비라운드업 뉴스 중 해당 종목명이 title 에 verbatim 등장"(hasEvidence = theme.news.some(n => !isRoundupNews(n, surgeNames) && n.title.includes(stockName))) 판정.
        · evidenceThemes.length >= 2 → 그 evidence 테마들에만 유지, 나머지 테마에서 code 제거(복수 허용, 사용자 결정).
        · evidenceThemes.length <= 1 → 1개로 축소. 우선순위: hasEvidence 있는 테마 > (동률) stocks.length 큰 테마 > (동률) 먼저 나온 테마. 나머지 테마에서 code 제거.
    - (b) invariant 후 stocks.length < 2 로 줄어든 테마는 제거하고, 그 테마의 남은 멤버 중 어느 살아있는 테마에도 없는 code 는 single 로 강등(surgeByCode 로 code/name/changeRate 재구성, reason=null, news=[]; 기존 single 과 dedup).
    - (c) 테마+single 동시: 살아있는 테마 멤버 집합에 있는 code 는 singles 에서 제거.
    - 순수 반환(입력 배열 원본 미변경 — 명시 복제).
    clusterSurges 마지막 단계(return 직전): themes/singles 최종 구성 후 enforceMembershipInvariant 적용. clusterSurges 에 4번째 인자 `prevThemes: HomeSurgeTheme[] = []` 추가 → formatClusterMessage 로 passthrough.
    index.ts:
    - countStocks: unique 코드 수 집계(테마 stocks code ∪ singles code 의 Set size). export(테스트용).
    - 4b(hash-miss) 분기: cluster 호출에 prevRow.payload.themes 전달(prevRow.payload 존재 시, 없으면 []). HomeSyncDeps.cluster 시그니처에 prevThemes 인자 추가.
    clusterSurges.test.ts:
    - enforceMembershipInvariant 12:05 실사례 fixture: 한 종목(예 218150 미래생명자원)이 [곡물공급망불안]+[애국테마주] 2테마 + singles 동시 → 근거 있는 테마만 유지, single 제거, sub-2 collapse 검증.
    - evidence 2+ → 복수 소속 유지 케이스.
    - clusterSurges 가 prevThemes 를 formatClusterMessage 로 넘기는지(spy/mock) 확인.
    index.test.ts:
    - countStocks unique: 같은 code 가 테마+테마/테마+single 에 있어도 1회만 집계.
    - runHomeSyncCycle 4b 에서 prevRow.payload.themes 가 cluster 로 전달되는지(주입 cluster 인자 캡처).
  </behavior>
  <action>
    clusterSurges.ts: enforceMembershipInvariant 신규 export(HomeSurgeTheme/HomeSurgeSingle 은 이미 shared import). isRoundupNews 재사용(이미 import). surgeNames 는 clusterSurges 내 surges.map(s=>s.name) 로 확보, 강등 시 surgeByCode 사용. clusterSurges 반환 직전 `const inv = enforceMembershipInvariant(themes, singles, surges.map(s=>s.name)); return inv;` (surgeByCode 도 넘겨 강등 재구성 — 시그니처는 구현 편의에 맞게, 단 순수/테스트가능하게). clusterSurges 4번째 인자 prevThemes 추가 → formatClusterMessage(surges, themeHints, prevThemes).
    index.ts: countStocks 를 unique Set 집계로 교체 + export. 4b 에서 `const prevThemes = prevRow?.payload?.themes ?? []; const clustered = await cluster(surges, cfg, themeHints, prevThemes);`. HomeSyncDeps.cluster 타입에 `prevThemes: HomeSurgeTheme[]` 인자 추가(HomeSurgeTheme import 필요). deps.cluster ?? clusterSurges 는 시그니처 호환.
    주의: carry(4a)/surges 0 경로는 변경 없음. prevSelect 는 이미 payload 조회 중 — 추가 쿼리 없음.
  </action>
  <verify>
    <automated>cd workers/home-sync && pnpm test && pnpm typecheck</automated>
  </verify>
  <done>home-sync 전체 테스트 스위트 green(기존 회귀 0) + 신규 invariant/unique/prevThemes 테스트 통과 + typecheck.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    home-sync 클러스터링 안정화 3종(sticky prior + can→should 힌트 + 중복 소속 invariant + countStocks unique).
    코드/테스트 완료. 프로덕션 배포 + smoke 는 오케스트레이터가 실행.
  </what-built>
  <how-to-verify>
    오케스트레이터 실행 절차:
    1. workers/home-sync 빌드: `cd workers/home-sync && pnpm build`
    2. 배포: `bash scripts/deploy-home-sync.sh` (Cloud Run Job 이미지 갱신)
    3. smoke: `bash scripts/smoke-home-sync.sh` (전 항목 PASS 확인)
    4. 즉시 1회 실행 후 최신 스냅샷 확인 — themeCount/stockCount 정상, 한 종목이 테마+single 동시 등장 없음, stock_count 가 unique 집계와 일치.
    커밋은 CLAUDE.md 규칙(한글 메시지, 사용자 확인 후, Co-Authored-By 금지) 준수.
  </how-to-verify>
  <resume-signal>배포+smoke PASS 확인 후 "approved" 또는 이슈 보고</resume-signal>
</task>

</tasks>

<verification>
- `cd workers/home-sync && pnpm test && pnpm typecheck` 전부 통과(기존 스위트 회귀 0).
- prompt.test.ts: sticky prior 섹션 렌더/생략, 프롬프트 문구.
- clusterSurges.test.ts: 12:05 중복 invariant fixture, evidence 2+ 복수 허용, prevThemes passthrough.
- index.test.ts: countStocks unique, 4b prevThemes 전달.
- 배포 후 smoke-home-sync.sh 전 항목 PASS.
</verification>

<success_criteria>
- hash-miss 클러스터링이 직전 슬롯 테마 구성을 프롬프트로 받아 이름/구성 안정화.
- 같은 참고 테마 급등 2+ 종목이 명확한 다른 재료 뉴스 없으면 그 테마로 묶임(should).
- 종목이 테마+single 동시 소속 0, 테마간 중복은 근거 있을 때만 복수(0~1이면 1개 축소).
- stock_count 가 unique 코드 수(server/webapp 영향 없음 — verbatim 통과 확인).
- 프로덕션 배포 + smoke PASS.
</success_criteria>

<output>
After completion, create `.planning/quick/260720-kyh-home-sync-3-sticky-prior/260720-kyh-SUMMARY.md`
</output>
