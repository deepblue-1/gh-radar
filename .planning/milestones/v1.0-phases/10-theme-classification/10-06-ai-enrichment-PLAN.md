---
phase: 10-theme-classification
plan: 06
type: execute
wave: 5
depends_on: [03]
files_modified:
  - workers/theme-sync/src/ai/anthropic.ts
  - workers/theme-sync/src/ai/prompt.ts
  - workers/theme-sync/src/ai/discoverThemes.ts
  - workers/theme-sync/src/ai/correctMembership.ts
  - workers/theme-sync/src/ai/persistAi.ts
  - workers/theme-sync/src/index.ts
  - workers/theme-sync/tests/ai.test.ts
autonomous: false
requirements: [THEME-04]
must_haves:
  truths:
    - "Claude Haiku 4.5 가 news_articles 기반으로 신규 시스템 테마 후보를 발굴한다"
    - "AI 결과는 source='ai' 시스템 레이어로만 적재되고 유저 테마는 불가침"
    - "오분류 교정은 effective_to soft-제외만, 원 소스(naver/alphasquare) row 보존"
    - "classify_enabled kill-switch + 신규/변경분만 호출로 비용 통제"
  artifacts:
    - path: "workers/theme-sync/src/ai/discoverThemes.ts"
      provides: "뉴스 제목 → 신규 테마 후보 (JSON, confidence)"
    - path: "workers/theme-sync/src/ai/correctMembership.ts"
      provides: "종목↔테마 오분류 soft-제외 (effective_to)"
  key_links:
    - from: "ai/discoverThemes.ts"
      to: "themes (source='ai')"
      via: "norm_key 충돌 시 병합 (중복 발굴 방지)"
      pattern: "source.*ai"
    - from: "index.ts"
      to: "ai/discoverThemes"
      via: "theme-sync cycle 동반 실행 (classifyEnabled 게이트)"
      pattern: "classifyEnabled"
---

<objective>
AI 테마 보강을 discussion-sync classify 패턴 복제로 구현한다: (a) Claude Haiku 4.5 로 최근 `news_articles` 제목 기반 신규 시스템 테마 후보 발굴, (b) 종목↔테마 오분류 soft-교정. **반드시 source='ai' 시스템 레이어만** — 유저 테마 불가침. theme-sync cycle 에 동반 실행하되 classifyEnabled kill-switch + 신규/변경분만 호출로 비용 통제. **POC 게이트: 발굴 정확도/비용 검증 후 표시 여부 결정.**

Purpose: THEME-04. RESEARCH §Pattern 6 + discussion-sync classify(anthropic/classifyBatch/prompt) 재사용. 비용 ~월 $3~12(POC 실측). 정확도 미달 시 source='ai_candidate'(비표시) 격리(RESEARCH Open Q3). AI 가 잘못 발굴해도 시스템 레이어라 유저 테마 무영향.
Output: ai/ 모듈 4종 + cycle 통합 + POC 검증 체크포인트.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/10-theme-classification/10-RESEARCH.md

<interfaces>
복제 기준 (discussion-sync/src/classify/):

anthropic.ts (싱글톤 lazy + __resetForTests):
let _client; export function getAnthropicClient(): Anthropic { ... if(!cfg.anthropicApiKey) throw; _client = new Anthropic({apiKey}); }
export function __resetAnthropicClientForTests(): void

classifyBatch.ts (p-limit + Promise.allSettled):
- if (!cfg.classifyEnabled) return new Map();  ← kill-switch
- limit = pLimit(cfg.classifyConcurrency)  ← default 5
- Promise.allSettled(rows.map(r => limit(async () => { const label = await classifyOne(r); if(label) results.set(r.id, label); })))

classifyOne.ts (단건):
- client.messages.create({ model: cfg.classifyModel(claude-haiku-4-5), max_tokens, temperature:0, system, messages: [...fewShot, {role:'user', content}] })
- res.content.find(c=>c.type==='text') → 파싱. 실패 시 null(재시도).

news_articles 테이블 (Phase 07.1): title + description 컬럼 존재(AI 입력).
themes/theme_stocks (Plan 02): source 컬럼('naver'|'alphasquare'|'ai'|'user'), confidence, effective_to. norm_key 병합(Plan 03 normalizeName).
index.ts (Plan 03): runThemeSyncCycle — upsertThemes 직후 AI 보강 호출 자리 주석 표시됨.

Pitfall 7: 신규/변경분만 호출(중복 방지) + classify_enabled + source 분리 + soft-제외(원본 보존) + POC 먼저.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: AI 모듈 (anthropic 싱글톤 + 발굴 + 교정 + persist)</name>
  <files>workers/theme-sync/src/ai/anthropic.ts, workers/theme-sync/src/ai/prompt.ts, workers/theme-sync/src/ai/discoverThemes.ts, workers/theme-sync/src/ai/correctMembership.ts, workers/theme-sync/src/ai/persistAi.ts, workers/theme-sync/tests/ai.test.ts</files>
  <read_first>
    - workers/discussion-sync/src/classify/anthropic.ts, classifyOne.ts, classifyBatch.ts, prompt.ts (복제 기준)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 6 (발굴/교정 설계 + 안전장치)
    - workers/theme-sync/src/merge/normalizeName.ts (Plan 03 norm_key 병합)
  </read_first>
  <behavior>
    - discoverThemes(newsRows): SDK mock → JSON 응답 파싱 → 신규 테마 후보 [{name, stockCodes, confidence}]
    - 기존 norm_key 와 충돌하는 후보는 병합(중복 발굴 방지)
    - correctMembership(themeStockRows): SDK mock → "명백히 무관"만 effective_to 마킹 대상 반환 (추가 편입 안 함)
    - classifyEnabled=false 시 즉시 빈 결과 (Claude 호출 0)
    - SDK 예외/파싱 실패 시 빈 결과 (다음 cycle 재시도)
  </behavior>
  <action>
    1. ai/anthropic.ts — discussion-sync 복사 (getAnthropicClient 싱글톤 + __resetForTests). theme-sync config 사용.
    2. ai/prompt.ts — 발굴 system prompt("다음 뉴스 제목들에서 기존 시스템 테마에 없는 신규 테마/이슈 키워드 추출, 각 키워드에 관련 종목코드, JSON 출력") + 교정 system prompt("이 종목이 이 테마에 맞는가, 명백히 무관한 것만 표시"). few-shot 포함. temperature=0.
    3. ai/discoverThemes.ts — 입력: 최근 N일 news_articles(title+description). p-limit 배치. JSON 응답 파싱 → 후보. classifyEnabled 게이트. 실패 시 빈 결과.
    4. ai/correctMembership.ts — 입력: theme_stocks(reason 있는 신규/변경분만). AI "무관" 판단만 → effective_to 마킹 대상. 추가 편입 금지(false positive 회피).
    5. ai/persistAi.ts — 발굴 후보 → themes(source='ai', confidence) + theme_stocks(source='ai') UPSERT(norm_key 충돌 시 병합). 교정 → effective_to soft-마킹(원 source row 보존, naver/alphasquare 삭제 금지).
    6. ai.test.ts — SDK mock(__resetForTests)으로 발굴 JSON 파싱 + 교정 soft-제외 + classifyEnabled=false skip + 파싱 실패 빈 결과.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/theme-sync test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/theme-sync test` exits 0 (ai.test.ts green)
    - `grep -q "claude-haiku-4-5" workers/theme-sync/src/ai/prompt.ts` exits 0 OR config classifyModel 사용
    - `grep -q "classifyEnabled" workers/theme-sync/src/ai/discoverThemes.ts` exits 0 (kill-switch)
    - `grep -q "effective_to" workers/theme-sync/src/ai/correctMembership.ts` exits 0 (soft-제외)
    - `grep -q "ai" workers/theme-sync/src/ai/persistAi.ts` exits 0 (source='ai' 적재)
    - ai.test.ts: classifyEnabled=false skip + 교정 soft-제외(원본 보존) + 파싱 실패 빈 결과 케이스 존재
  </acceptance_criteria>
  <done>AI 발굴+교정 모듈이 source='ai' 적재 + soft-제외 + kill-switch + 실패 안전을 SDK mock 테스트로 green.</done>
</task>

<task type="auto">
  <name>Task 2: theme-sync cycle 에 AI 보강 통합</name>
  <files>workers/theme-sync/src/index.ts, workers/theme-sync/tests/ai.test.ts</files>
  <read_first>
    - workers/theme-sync/src/index.ts (Plan 03 runThemeSyncCycle — AI 호출 자리 주석)
    - workers/discussion-sync/src/index.ts (classifyBatch cycle 통합 패턴 — upsert 직후 신규분만)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 6 (트리거 주기 = 일1회 동반)
  </read_first>
  <action>
    workers/theme-sync/src/index.ts 의 upsertThemes 직후에 AI 보강 단계 추가:
    - classifyEnabled 일 때만: 최근 news_articles fetch → discoverThemes → persistAi(발굴) → correctMembership(신규/변경분만) → persistAi(교정 soft-제외).
    - 비용 통제: 신규/변경 theme_stocks 만 교정 대상(discussion-sync unclassifiedRows 패턴). 발굴은 일1회 cycle 동반(별도 스케줄 없음).
    - summary 로그에 aiDiscovered/aiCorrected 카운트 추가. AI 실패가 cycle 전체를 죽이지 않게 try/catch isolation.
    ai.test.ts 에 cycle 통합 smoke(mock: 발굴/교정 호출 + classifyEnabled=false 시 미호출) 추가.
  </action>
  <verify>
    <automated>pnpm -F @gh-radar/theme-sync test</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -F @gh-radar/theme-sync test` exits 0
    - `pnpm -F @gh-radar/theme-sync build` exits 0
    - `grep -q "discoverThemes" workers/theme-sync/src/index.ts` exits 0
    - index.ts: AI 단계가 classifyEnabled 게이트 + try/catch isolation 포함
    - ai.test.ts: classifyEnabled=false 시 AI 미호출 케이스 존재
  </acceptance_criteria>
  <done>AI 보강이 theme-sync cycle 에 동반 통합(kill-switch + isolation), build+test green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: AI 보강 POC 게이트 (정확도/비용 검증)</name>
  <files>workers/theme-sync/src/ai/discoverThemes.ts</files>
  <read_first>
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 6 (POC 범위), §Open Questions 3 (POC 통과 기준)
  </read_first>
  <action>
    POC 검증 실행: 로컬 .env 에 ANTHROPIC_API_KEY + classifyEnabled=true 설정 후 최근 1일 news_articles 샘플로 discoverThemes 1회 호출. 발굴 후보의 정확도와 토큰 비용을 수집해 표시 여부(source=ai 유지 vs ai_candidate 격리)를 결정한다. 자동 진행 금지 — 결과를 사용자에게 보고하고 결정 대기.
  </action>
  <what-built>AI 발굴+교정 모듈(Task 1) + cycle 통합(Task 2). classify_enabled kill-switch 로 비표시 격리 가능.</what-built>
  <how-to-verify>
    1. 로컬에서 작은 샘플(최근 1일 news_articles)로 discoverThemes 1회 실행 (classifyEnabled=true, ANTHROPIC_API_KEY 로컬 .env).
    2. 발굴된 테마 후보의 정확도 육안 검토 — 실제 의미있는 신규 테마인가? 엉뚱한 키워드 비율?
    3. Anthropic 대시보드/응답에서 토큰량·비용 확인 — 일 $1 미만(RESEARCH ~월 $3~12 추정 범위)?
    4. 정확도 충분(대부분 의미있음) → source='ai' 표시 유지 결정. 정확도 미달 → source='ai_candidate'(비표시) 로 격리하고 표시 레이어(Plan 07/04)에서 제외 결정(RESEARCH Open Q3).
  </how-to-verify>
  <resume-signal>POC 결과(정확도/비용 + 표시 여부 결정)를 보고하고 "approved" 또는 "ai_candidate 격리" 입력. AI 게이트 실패 시 W5 만 후속 phase 10.1 분리도 옵션(RESEARCH 대안).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AI(Claude) 출력 → themes/theme_stocks | 비결정적 AI 출력이 시스템 레이어 쓰기 경계 |
| 워커 → Anthropic API | 시크릿(ANTHROPIC_API_KEY) 사용 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-06-01 | Tampering | AI 가 유저 테마 건드림 | mitigate | persistAi 가 source='ai' + is_system=true 만 씀. 유저 테마(is_system=false)는 절대 미접근(코드 + Plan 02 RLS 이중 분리) |
| T-10-06-02 | Tampering | AI 오분류로 원 소스 데이터 삭제 | mitigate | 교정은 effective_to soft-제외만, naver/alphasquare row 물리 삭제 금지(원본 보존) |
| T-10-06-03 | DoS / 비용 | AI 비용 폭주 | mitigate | classifyEnabled kill-switch + 신규/변경분만 호출 + 일1회 cycle 동반 + POC 게이트(Task 3) |
| T-10-06-04 | Information Disclosure | ANTHROPIC_API_KEY 로그 노출 | mitigate | pino redact(anthropicApiKey, Plan 01 logger) |
| T-10-06-05 | Tampering | AI 발굴 정확도 미달로 잘못된 테마 표시 | mitigate | confidence 기록 + source 분리 → 미달 시 ai_candidate 비표시 격리(POC 게이트 결정) |
</threat_model>

<verification>
- `pnpm -F @gh-radar/theme-sync test` green (ai 모듈 + cycle 통합)
- `pnpm -F @gh-radar/theme-sync build` exits 0
- POC 게이트(Task 3): 정확도/비용 검증 + 표시 여부 결정
</verification>

<success_criteria>
- SC#7 충족: Claude Haiku 4.5 가 news_articles 기반 신규 테마 후보 발굴 + 종목 오분류 교정 (source='ai' 시스템 레이어 분리)
- 유저 테마 불가침(코드+RLS 이중) + soft-제외(원본 보존) + kill-switch + POC 게이트
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-06-SUMMARY.md`
</output>
