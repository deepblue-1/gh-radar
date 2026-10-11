---
phase: quick-260706-erk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/theme-sync/src/ai/
  - workers/theme-sync/src/index.ts
  - workers/theme-sync/src/config.ts
  - workers/theme-sync/src/logger.ts
  - workers/theme-sync/tests/ai.test.ts
  - workers/theme-sync/tests/scrape.test.ts
  - workers/theme-sync/tests/pipeline.test.ts
  - workers/theme-sync/package.json
  - scripts/deploy-theme-sync.sh
  - packages/shared/src/theme.ts
  - webapp/src/components/theme/theme-source-badge.tsx
  - webapp/src/components/theme/themes-client.tsx
  - supabase/migrations/
  - supabase/SCHEMA.md
autonomous: true
requirements: [quick-260706-erk]
must_haves:
  truths:
    - "theme-sync 워커가 Claude(anthropic) 호출 없이 스크랩→병합→UPSERT 만 수행한다"
    - "theme-sync 배포 스크립트가 ANTHROPIC secret / CLASSIFY env 없이 배포된다"
    - "ThemeStockSource 타입에 'ai' 값이 존재하지 않는다 (naver/alphasquare/user 만)"
    - "테마 메뉴 UI 어디에도 'AI' 출처 뱃지/문구가 렌더되지 않는다"
    - "DB 정리 마이그레이션이 source='ai' 매핑과 ai 단독 시스템 테마를 제거한다"
  artifacts:
    - path: "supabase/migrations/20260706120000_remove_ai_theme_source.sql"
      provides: "AI 출처 데이터 정리 마이그레이션"
      contains: "DELETE FROM theme_stocks"
    - path: "packages/shared/src/theme.ts"
      provides: "ThemeStockSource 타입 ('ai' 제거)"
  key_links:
    - from: "packages/shared/src/theme.ts"
      to: "webapp/src/components/theme/theme-source-badge.tsx"
      via: "ThemeStockSource 타입 컴파일"
      pattern: "ThemeStockSource"
---

<objective>
테마 메뉴(/themes)를 채우는 `workers/theme-sync` 의 AI 보강 파이프라인(Claude Haiku 기반
신규 테마 발굴 + 오분류 교정)을 완전히 제거한다. 코드·배포 설정·DB 데이터·프론트 표시·공유 타입
전 계층에서 'ai' source 흔적을 지운다.

Purpose: theme-sync 의 AI 보강은 유지비(Claude 호출)와 복잡도 대비 가치가 낮아 폐기한다.
theme-sync 는 순수 스크랩(네이버 금융 테마 + 알파스퀘어) 병합/적재 워커로 단순화된다.

Output: AI 코드/설정/의존성 제거된 theme-sync, 'ai' 없는 공유 타입/프론트, AI 데이터 정리 마이그레이션.

**절대 건드리지 않는 것 (혼동 주의):**
- 홈 '주도테마' 파이프라인 (`workers/home-sync`, `home_theme_snapshots`) — 완전 별개, 무변경
- 다른 Claude 사용처: discussion classify, 챗봇, `home-sync` clusterSurges — 무변경
- `webapp/src/components/ui/ai-pick-badge.tsx` — 스캐너/종목상세(`scanner-table.tsx`,
  `info-stock-card.tsx`)에서 사용 중이므로 **유지** (테마 전용 아님)
- `gh-radar-anthropic-api-key` Secret 자체는 다른 워커(home-sync/discussion)가 쓰므로 **삭제 금지**.
  theme-sync 배포에서 **바인딩만** 제거.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/260706-erk-ai-ai-env-db/260706-erk-PLAN.md

<interfaces>
<!-- 실행자가 바로 쓸 수 있게 조사에서 추출한 계약. 재탐색 불필요. -->

packages/shared/src/theme.ts (변경 전):
```typescript
export type ThemeStockSource = "naver" | "alphasquare" | "ai" | "user";
export const THEME_STOCK_SOURCES: readonly ThemeStockSource[] = [
  "naver", "alphasquare", "ai", "user",  // (실제 순서/포맷은 파일 확인)
];
```

workers/theme-sync/src/index.ts 의 AI 진입점:
- L25: `import { enrichWithAi } from "./ai/enrich";`
- L227~250 부근: `enrichWithAi()` 호출 + `aiDiscovered/aiCorrected/aiConsolidated` 집계 + try/catch
- 이후 `log.info({ ..., aiDiscovered, aiCorrected, aiConsolidated, ... })`

workers/theme-sync/src/config.ts 의 classify 관련 필드 (interface + loadConfig 둘 다):
`anthropicApiKey, classifyEnabled, classifyModel, classifyConcurrency,
 discoverNewsLookbackDays, discoverNewsMax, discoverExistingThemesMax`

DB 스키마 (supabase/migrations/20260609120000_theme_tables.sql):
```sql
CREATE TABLE themes ( id uuid, is_system boolean, sources text[] NOT NULL DEFAULT '{}', ... );
CREATE TABLE theme_stocks (
  theme_id uuid REFERENCES themes(id) ON DELETE CASCADE,  -- 테마 삭제 시 매핑 자동 삭제
  stock_code ..., source text, manual_override text,
  PRIMARY KEY (theme_id, stock_code)
);
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: theme-sync 워커 AI 코드/설정/의존성/배포 제거</name>
  <files>workers/theme-sync/src/ai/ (디렉터리 삭제), workers/theme-sync/src/index.ts, workers/theme-sync/src/config.ts, workers/theme-sync/src/logger.ts, workers/theme-sync/tests/ai.test.ts (삭제), workers/theme-sync/tests/scrape.test.ts, workers/theme-sync/tests/pipeline.test.ts, workers/theme-sync/package.json, scripts/deploy-theme-sync.sh</files>
  <action>
theme-sync 에서 AI 보강 관련 코드를 전부 제거한다:

1. **src/ai/ 디렉터리 전체 삭제** (`git rm -r workers/theme-sync/src/ai`):
   enrich.ts, discoverThemes.ts, correctMembership.ts, persistAi.ts, prompt.ts, anthropic.ts, parseJson.ts.

2. **src/index.ts**:
   - L25 `import { enrichWithAi } from "./ai/enrich";` 제거.
   - AI 보강 블록(약 L226~250) 전체 제거: 주석(`// ── AI 보강(Plan 06) …`),
     `let aiDiscovered/aiCorrected/aiConsolidated`, `try { const ai = await enrichWithAi(...) } catch { ... }`.
   - 마지막 `log.info({ ... })` 에서 `aiDiscovered, aiCorrected, aiConsolidated` 키 제거.

3. **src/config.ts**: `ThemeSyncConfig` 인터페이스와 `loadConfig()` 반환 객체 양쪽에서
   `anthropicApiKey, classifyEnabled, classifyConcurrency, classifyModel,
   discoverNewsLookbackDays, discoverNewsMax, discoverExistingThemesMax` 필드 제거.
   관련 JSDoc 주석(Plan 06 설명)도 정리. 나머지 필드(brightdata/supabase/alpha/naver/maxPages/alphaCategories)는 유지.

4. **src/logger.ts**: redact paths 에서 `cfg.anthropicApiKey`, `*.anthropicApiKey` 두 줄 제거
   (다른 redact 경로는 유지).

5. **tests/ai.test.ts 삭제** (`git rm`).

6. **tests/scrape.test.ts + tests/pipeline.test.ts**: config 픽스처 객체에서
   `anthropicApiKey/classifyEnabled/classifyConcurrency/classifyModel` (+ discover* 있으면) 필드 제거.
   pipeline.test.ts 의 `classifyEnabled=true → enrichWithAi 실행` 검증 테스트 케이스(약 L510~525,
   `cycleConfig({ classifyEnabled: true, anthropicApiKey: "k" })` + `news_articles.limit` 기대) 전체 삭제.
   주의: `theme("ai", "AI", [...])` 형태 호출은 테마 **이름** 픽스처이지 source='ai' 가 아니므로 **유지**.

7. **package.json**: dependencies 에서 `"@anthropic-ai/sdk"` 제거 (theme-sync 워커만).
   삭제 후 `pnpm install` 로 lockfile 갱신.

8. **scripts/deploy-theme-sync.sh**:
   - secret 검증 루프(약 L65)에서 `gh-radar-anthropic-api-key` 제거
     (`gh-radar-supabase-service-role gh-radar-brightdata-api-key` 만 유지).
   - `--set-secrets`(약 L147)에서 `ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest` 제거.
   - `--set-env-vars`(약 L146)에서 `THEME_SYNC_CLASSIFY_ENABLED=...` 토큰 제거.
   - `THEME_SYNC_CLASSIFY_ENABLED_VAL` 변수(약 L95), 관련 echo(L97, L200), 상단 주석(L20/L25/L27) 정리.
  </action>
  <verify>
    <automated>cd workers/theme-sync && pnpm typecheck && pnpm test</automated>
  </verify>
  <done>src/ai/ 삭제됨, theme-sync typecheck+test 통과, package.json 에 @anthropic-ai/sdk 없음, deploy 스크립트에 ANTHROPIC/CLASSIFY 참조 없음. `grep -rn "anthropic\|classify\|enrichWithAi" workers/theme-sync/src` 결과 0건.</done>
</task>

<task type="auto">
  <name>Task 2: 공유 타입 + webapp 테마 프론트에서 'ai' source 제거</name>
  <files>packages/shared/src/theme.ts, webapp/src/components/theme/theme-source-badge.tsx, webapp/src/components/theme/themes-client.tsx</files>
  <action>
'ai' source 를 공유 타입과 테마 표시 컴포넌트에서 제거한다:

1. **packages/shared/src/theme.ts**:
   - `ThemeStockSource` union 에서 `"ai"` 제거 → `"naver" | "alphasquare" | "user"`.
   - `THEME_STOCK_SOURCES` 배열에서 `"ai"` 원소 제거.
   - 관련 JSDoc(`ai: Claude Haiku 보강 …`, `다중 출처 태그: {naver, alphasquare, ai}` 등) 주석에서 ai 언급 정리.

2. **webapp/src/components/theme/theme-source-badge.tsx**:
   - `SOURCE_LABEL` Record 에서 `ai: 'AI'` 키 제거.
   - `SOURCE_DOT` Record 에서 `ai: 'bg-[var(--primary)]'` 키 제거.
   - JSX 의 `variant={src === 'ai' ? 'default' : 'outline'}` → `variant="outline"` 로 단순화.
   - `src === 'ai' && 'bg-[var(--accent)] …'` className 분기 제거.
   - 상단 JSDoc 의 ai/accent 출처 설명 정리.
   - 타입 `Exclude<ThemeStockSource, 'user'>` 는 자동으로 `'naver' | 'alphasquare'` 가 되어 Record 키와 정합해야 함(컴파일로 검증).

3. **webapp/src/components/theme/themes-client.tsx**:
   - `SOURCE_FOOTER` 문자열에서 `· AI 보강(Claude)` 제거
     → `'출처: 네이버 금융 테마 · 알파스퀘어 · 일 1회 16:00 KST 갱신'`.

**변경 불요 확인(무변경 유지):**
- `webapp/src/components/ui/ai-pick-badge.tsx` — 스캐너/종목상세 전용, 유지.
- `server/src/routes/themes.ts`, `server/src/mappers/theme.ts` — 'ai' 특별 취급 없음(grep 0건), 유지.
  단, 공유 타입 변경이 server 컴파일에 전파되므로 server typecheck 로 회귀 확인.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared typecheck && pnpm --filter webapp typecheck && pnpm --filter server typecheck</automated>
  </verify>
  <done>ThemeStockSource 에 'ai' 없음, shared/webapp/server typecheck 통과. `grep -rn "'ai'" webapp/src/components/theme` 결과 0건. ai-pick-badge.tsx 무변경.</done>
</task>

<task type="auto">
  <name>Task 3: AI 출처 데이터 정리 마이그레이션 + SCHEMA 문서 갱신</name>
  <files>supabase/migrations/20260706120000_remove_ai_theme_source.sql (신규), supabase/SCHEMA.md</files>
  <action>
theme_stocks/themes 에 남은 'ai' 출처 데이터를 정리하는 마이그레이션을 작성한다.
theme_stocks.theme_id 는 `ON DELETE CASCADE` 이므로 테마 삭제 시 매핑은 자동 삭제되나,
명시성과 안전을 위해 순서대로 처리한다.

**신규 파일 `supabase/migrations/20260706120000_remove_ai_theme_source.sql`:**

```sql
-- Quick 260706-erk: theme-sync AI 보강 폐기에 따른 'ai' 출처 데이터 정리.
-- 홈 파이프라인(home_theme_snapshots)과 무관 — themes/theme_stocks 만 대상.
BEGIN;

-- 1) AI 보강으로 추가된 개별 종목 매핑 제거
DELETE FROM theme_stocks WHERE source = 'ai';

-- 2) AI 단독 시스템 테마(sources 가 정확히 {ai}) 제거 — 잔여 매핑은 CASCADE 로 함께 삭제.
--    admin 오버라이드(hidden/manual_override)가 함께 사라지는 것은 허용(설계 확정).
DELETE FROM theme_stocks
  WHERE theme_id IN (
    SELECT id FROM themes WHERE is_system = true AND sources = ARRAY['ai']::text[]
  );
DELETE FROM themes
  WHERE is_system = true AND sources = ARRAY['ai']::text[];

-- 3) 혼합 출처 테마의 sources 배열에서 'ai' 원소 제거
UPDATE themes
  SET sources = array_remove(sources, 'ai')
  WHERE 'ai' = ANY(sources);

COMMIT;
```

주의사항:
- theme_stocks/themes 에 INSERT/UPDATE 트리거가 있음(20260610120000_theme_triggers_followup.sql).
  DELETE 위주이므로 재계산 트리거 영향은 낮으나, 실행자는 트리거가 DELETE 에서
  sources/top3avg 를 오염시키지 않는지 확인(트리거 정의가 INSERT/UPDATE 대상이면 무관).
- naver/alphasquare 매핑이 남아있는 테마는 유지된다(step 2 는 sources 가 정확히 {ai} 인 것만).

**SCHEMA 문서 갱신 `supabase/SCHEMA.md`:**
- theme_stocks.source / themes.sources 설명에서 'ai' 허용값 제거
  (naver/alphasquare/user 만 남김). 관련 설명 문구 정리.

**로컬 적용 (실행자가 실행):**
```bash
supabase db push   # 또는 프로젝트 관례 (SCHEMA.md/이전 마이그레이션 방식 확인)
```

**프로덕션 적용은 이 plan 범위 밖.** SUMMARY 에 "프로덕션 Supabase 적용 필요(별도 단계)"를
명시하고, 적용 전/후 검증 쿼리(`SELECT count(*) FROM theme_stocks WHERE source='ai';` = 0)를 기록.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260706120000_remove_ai_theme_source.sql && grep -q "DELETE FROM theme_stocks WHERE source = 'ai'" supabase/migrations/20260706120000_remove_ai_theme_source.sql && echo OK</automated>
  </verify>
  <done>마이그레이션 파일 존재 + 3단계 정리 SQL 포함, SCHEMA.md 에서 'ai' 허용값 제거됨. 로컬 적용 명령 SUMMARY 에 기록, 프로덕션 적용은 별도 단계로 명시.</done>
</task>

</tasks>

<verification>
전체 phase 검증:
- theme-sync: `cd workers/theme-sync && pnpm typecheck && pnpm test` 통과
- 공유/프론트/서버: `pnpm --filter @gh-radar/shared typecheck && pnpm --filter webapp typecheck && pnpm --filter server typecheck` 통과
- 잔여 참조 0건: `grep -rn "enrichWithAi\|anthropic\|classify" workers/theme-sync/src`,
  `grep -rn "'ai'" webapp/src/components/theme packages/shared/src/theme.ts`
- 마이그레이션 파일 존재 + SCHEMA 갱신
- ai-pick-badge.tsx / home-sync / discussion / 챗봇 무변경 확인
</verification>

<success_criteria>
- theme-sync 워커가 Claude 호출 없이 스크랩→병합→UPSERT 만 수행 (src/ai/ 삭제, 의존성 제거)
- 배포 스크립트에 ANTHROPIC secret / CLASSIFY env 바인딩 없음 (Secret 자체는 존치)
- ThemeStockSource 에 'ai' 없음, 테마 UI 에 AI 뱃지/문구 없음
- DB 정리 마이그레이션 작성 + 로컬 적용, 프로덕션 적용은 SUMMARY 에 별도 단계로 명시
- 모든 workspace typecheck/test 통과
- 커밋 메시지 한글
</success_criteria>

<output>
After completion, create `.planning/quick/260706-erk-ai-ai-env-db/260706-erk-SUMMARY.md`
(프로덕션 Supabase 마이그레이션 적용 필요 여부/검증 쿼리 포함).
</output>
