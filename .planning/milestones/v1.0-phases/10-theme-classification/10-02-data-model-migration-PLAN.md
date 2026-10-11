---
phase: 10-theme-classification
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - supabase/migrations/20260609120000_theme_tables.sql
  - packages/shared/src/theme.ts
  - packages/shared/src/index.ts
  - packages/shared/src/__tests__/theme.test.ts
autonomous: false
requirements: [THEME-01, THEME-03]
must_haves:
  truths:
    - "themes + theme_stocks 테이블이 생성되고 production Supabase 에 push 됨"
    - "시스템 테마는 anon+authenticated 모두 읽기 가능, 유저 테마는 owner-only"
    - "유저는 is_system 테마를 위조/편집 불가 (RLS WITH CHECK)"
    - "packages/shared 가 Theme/ThemeStock/ThemeWithStats 타입을 export"
  artifacts:
    - path: "supabase/migrations/20260609120000_theme_tables.sql"
      provides: "themes + theme_stocks + RLS 7정책 + 종목수 limit trigger"
      contains: "owner uuid references auth.users"
    - path: "packages/shared/src/theme.ts"
      provides: "camelCase 테마 타입 계약"
      exports: ["Theme", "ThemeStock", "ThemeWithStats", "ThemeStockSource"]
  key_links:
    - from: "theme_stocks.stock_code"
      to: "stocks.code"
      via: "FK ON DELETE CASCADE"
      pattern: "references stocks"
    - from: "themes RLS read_system_themes"
      to: "anon, authenticated"
      via: "TO anon, authenticated (Pitfall 3)"
      pattern: "TO anon, authenticated"
---

<objective>
시스템/유저 테마를 단일 `themes` 테이블(+`owner_id` nullable + `is_system` 플래그) + 단일 `theme_stocks`(provenance 컬럼) 로 모델링하고, RLS(시스템 read 전역 + 유저 owner-only CRUD)와 종목수 limit trigger 를 포함한 마이그레이션을 작성한 뒤 **[BLOCKING] production Supabase 에 push** 한다. packages/shared 에 camelCase 타입 계약을 추가한다.

Purpose: D-01(시스템/유저 분리)의 "충돌 0" 의도를 테이블 분리가 아닌 RLS + owner_id NULL 분기로 달성(RESEARCH Pattern 1). 모든 후속 wave(스크랩 upsert, server 라우트, 유저 CRUD, AI 보강)가 이 스키마/타입에 의존하는 Wave 1 토대.
Output: theme_tables 마이그레이션(production 적용 완료) + theme.ts 타입 + index re-export.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/10-theme-classification/10-RESEARCH.md
@.planning/phases/10-theme-classification/10-CONTEXT.md

<interfaces>
복제 기준 = watchlists.sql (per-user owner-only RLS + limit trigger), 20260515163000 (RLS authenticated 명시).

watchlists.sql 핵심 패턴 (이 plan 이 따라야 할 톤):
- BEGIN; ... COMMIT; 트랜잭션 래핑
- CREATE POLICY "auth_select_own_watchlists" FOR SELECT TO authenticated USING (auth.uid() = user_id)
- 50-limit = BEFORE INSERT trigger, RAISE EXCEPTION ... USING ERRCODE = 'P0001' (subquery RLS 금지)
- 기존 anon 정책 확장: DROP POLICY "anon_read_X" → CREATE ... TO anon, authenticated

packages/shared/src/index.ts 현재 export 패턴 (camelCase, .js 확장자):
export type { Stock, StockQuote, StockMaster } from "./stock.js";
신규 라인 추가: export type { Theme, ThemeStock, ThemeWithStats, ThemeStockSource } from "./theme.js";

stocks 마스터 PK = code (text). theme_stocks.stock_code FK → stocks.code.
auth.users(id) uuid = 유저 테마 owner FK (watchlists 선례).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: packages/shared theme 타입 계약</name>
  <files>packages/shared/src/theme.ts, packages/shared/src/index.ts, packages/shared/src/__tests__/theme.test.ts</files>
  <read_first>
    - packages/shared/src/stock.ts (camelCase 타입 톤), packages/shared/src/index.ts (re-export 패턴, .js 확장자)
    - packages/shared/src/__tests__/ (기존 타입 테스트 형태)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 1 DDL (컬럼명 매핑)
  </read_first>
  <behavior>
    - theme.ts 가 Theme, ThemeStock, ThemeWithStats, ThemeStockSource 를 export (타입 전용)
    - ThemeStockSource = 'naver' | 'alphasquare' | 'ai' | 'user' union
    - ThemeWithStats = Theme & top3AvgChangeRate/stockCount/stocks (정렬 응답용)
    - theme.test.ts 가 타입 컴파일 + ThemeStockSource union 멤버 존재를 런타임 sentinel 로 검증
  </behavior>
  <action>
    packages/shared/src/theme.ts 작성 (camelCase, DB snake_case 와 매핑):
    - ThemeStockSource = 'naver' | 'alphasquare' | 'ai' | 'user'
    - Theme = { id: string; name: string; description: string | null; isSystem: boolean; ownerId: string | null; sources: ThemeStockSource[]; top3AvgChangeRate: number | null; statsUpdatedAt: string | null; createdAt: string; updatedAt: string }
    - ThemeStock = { themeId: string; stockCode: string; source: ThemeStockSource; confidence: number | null; reason: string | null; effectiveFrom: string; effectiveTo: string | null }
    - ThemeWithStats = Theme & { top3AvgChangeRate: number | null; stockCount: number; stocks?: ThemeStockMember[] }
    - ThemeStockMember = { code: string; name: string; market: 'KOSPI' | 'KOSDAQ'; price: number; changeRate: number; tradeAmount: number; source: ThemeStockSource }
    index.ts 에 re-export 라인 추가 (.js 확장자). theme.test.ts 작성 (RED→GREEN).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gh-radar/shared build` exits 0
    - `grep -q "export type" packages/shared/src/theme.ts` exits 0 with Theme, ThemeStock, ThemeWithStats present
    - `grep -q "theme.js" packages/shared/src/index.ts` exits 0
    - `pnpm --filter @gh-radar/shared test` exits 0
  </acceptance_criteria>
  <done>theme.ts 가 4개 타입 export, index re-export, shared build + test green.</done>
</task>

<task type="auto">
  <name>Task 2: theme_tables 마이그레이션 (단일 테이블 + RLS + limit trigger)</name>
  <files>supabase/migrations/20260609120000_theme_tables.sql</files>
  <read_first>
    - supabase/migrations/20260416120000_watchlists.sql (RLS 4정책 + P0001 trigger + anon→authenticated 확장 톤 — verbatim 복제 기준)
    - supabase/migrations/20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql (TO anon, authenticated 선례)
    - .planning/phases/10-theme-classification/10-RESEARCH.md §Pattern 1 DDL (전체 DDL 스케치)
    - MEMORY: feedback_supabase_rls_authenticated (TO anon,authenticated 둘 다), feedback_supabase_rpc_revoke
  </read_first>
  <action>
    supabase/migrations/20260609120000_theme_tables.sql 작성. BEGIN; ... COMMIT; 래핑. RESEARCH §Pattern 1 DDL 을 watchlists 톤으로 최종화:

    1) themes 테이블:
       - id uuid PK DEFAULT gen_random_uuid()
       - name text NOT NULL, description text
       - is_system boolean NOT NULL DEFAULT false
       - owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE  (시스템=NULL)
       - norm_key text  (정규화 병합 키, 시스템 전용)
       - sources text[] NOT NULL DEFAULT '{}'
       - top3_avg_change_rate numeric(10,4), stats_updated_at timestamptz
       - created_at/updated_at timestamptz NOT NULL DEFAULT now()
       - CONSTRAINT themes_owner_consistency CHECK ((is_system AND owner_id IS NULL) OR (NOT is_system AND owner_id IS NOT NULL))
       인덱스: CREATE UNIQUE INDEX uq_themes_system_norm ON themes(norm_key) WHERE is_system; CREATE INDEX idx_themes_owner ON themes(owner_id) WHERE owner_id IS NOT NULL; CREATE INDEX idx_themes_system_sort ON themes(top3_avg_change_rate DESC NULLS LAST) WHERE is_system;

    2) theme_stocks 테이블 (M:N + provenance):
       - theme_id uuid NOT NULL REFERENCES themes(id) ON DELETE CASCADE
       - stock_code text NOT NULL REFERENCES stocks(code) ON DELETE CASCADE
       - source text NOT NULL DEFAULT 'naver', confidence numeric(4,3), reason text
       - effective_from timestamptz NOT NULL DEFAULT now(), effective_to timestamptz
       - PRIMARY KEY (theme_id, stock_code)
       인덱스: CREATE INDEX idx_theme_stocks_code ON theme_stocks(stock_code); CREATE INDEX idx_theme_stocks_active ON theme_stocks(theme_id) WHERE effective_to IS NULL;

    3) RLS (ALTER TABLE ... ENABLE ROW LEVEL SECURITY 둘 다):
       themes:
       - read_system_themes: FOR SELECT TO anon, authenticated USING (is_system = true)
       - read_own_themes: FOR SELECT TO authenticated USING (owner_id = auth.uid())
       - insert_own_themes: FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND is_system = false)
       - update_own_themes: FOR UPDATE TO authenticated USING (owner_id=auth.uid() AND is_system=false) WITH CHECK (owner_id=auth.uid() AND is_system=false)
       - delete_own_themes: FOR DELETE TO authenticated USING (owner_id=auth.uid() AND is_system=false)
       theme_stocks:
       - read_theme_stocks: FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM themes t WHERE t.id=theme_id AND (t.is_system OR t.owner_id=auth.uid())))
       - write_own_theme_stocks: FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM themes t WHERE t.id=theme_id AND t.owner_id=auth.uid() AND NOT t.is_system)) WITH CHECK (동일)
       주석: 시스템 theme_stocks 쓰기는 service_role(워커)만 — RLS bypass. authenticated 쓰기 정책은 유저 테마만.

    4) 유저 테마 종목수 50-limit BEFORE INSERT trigger (watchlists enforce_watchlist_limit 복제):
       - enforce_user_theme_stock_limit() — NEW.theme_id 의 themes.is_system=false 일 때만 count >= 50 검사, RAISE EXCEPTION 'user_theme_stock_limit_exceeded' USING ERRCODE='P0001'. 시스템 테마(워커)는 무제한.
       - 유저 테마 개수 limit trigger (선택, themes is_system=false count >= 50): enforce_user_theme_count_limit() 동일 패턴.
  </action>
  <verify>
    <automated>grep -q "TO anon, authenticated" supabase/migrations/20260609120000_theme_tables.sql && grep -q "P0001" supabase/migrations/20260609120000_theme_tables.sql && grep -iq "create policy" supabase/migrations/20260609120000_theme_tables.sql</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "TO anon, authenticated" supabase/migrations/20260609120000_theme_tables.sql` exits 0 (Pitfall 3)
    - migration contains `owner uuid references auth.users` (or owner_id uuid REFERENCES auth.users)
    - migration contains `references stocks(code)` AND `PRIMARY KEY (theme_id, stock_code)`
    - migration contains `themes_owner_consistency` CHECK constraint
    - migration contains `P0001` (limit trigger) AND `is_system = false` (5 user policies)
    - migration contains `read_system_themes` AND `write_own_theme_stocks` policies
  </acceptance_criteria>
  <done>themes + theme_stocks 마이그레이션이 RLS 7정책 + limit trigger + provenance 컬럼을 포함하고 SQL 문법 정합.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: [BLOCKING] production Supabase db push</name>
  <files>supabase/migrations/20260609120000_theme_tables.sql</files>
  <read_first>
    - .planning §schema_push_requirement (이 phase 필수 게이트)
    - 09 phase SUMMARY 들의 db push 선례 (Supabase CLI 이미 gh-radar 에 linked)
  </read_first>
  <what-built>themes + theme_stocks 테이블 + RLS + trigger 마이그레이션 (Task 2). config-기반 타입 체크는 이 push 없이 통과하므로 false-positive 방지 위해 실제 push 필수.</what-built>
  <action>
    pnpm supabase db push (필요 시 --include-all) 실행. Supabase CLI 가 gh-radar 프로젝트에 이미 linked (Phase 1~9 routine). push 후 themes/theme_stocks 테이블이 production 에 존재하는지 확인.
    push 실패(권한/링크) 시 STOP 후 사용자에게 보고 — 강제 진행 금지.
  </action>
  <how-to-verify>
    1. `pnpm supabase db push` 가 themes/theme_stocks 마이그레이션을 applied 로 보고
    2. `pnpm supabase db diff` 또는 Supabase 대시보드에서 themes/theme_stocks 테이블 + RLS 정책 7개 존재 확인
    3. 비로그인(anon) 으로 themes WHERE is_system 읽기 가능, 유저 테마는 owner-only (RLS 동작)
  </how-to-verify>
  <resume-signal>push 완료 + 테이블 존재 확인 후 "approved" 입력</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| webapp(authenticated) → themes/theme_stocks | 로그인 유저가 본인 테마 CRUD — owner-only RLS 경계 |
| webapp(anon) → themes(is_system) | 비로그인 시스템 테마 read-only 경계 |
| worker(service_role) → themes(is_system) | 워커만 시스템 테마 쓰기 (RLS bypass) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-10-02-01 | Information Disclosure | 유저 A 가 유저 B 테마 조회 | mitigate | read_own_themes USING (owner_id = auth.uid()) — DB 레벨 강제 (watchlist 선례) |
| T-10-02-02 | Tampering | 유저가 시스템 테마 위조/편입 | mitigate | insert/update/delete 정책 WITH CHECK (is_system = false) + 시스템 쓰기는 service_role only |
| T-10-02-03 | Elevation of Privilege | RLS authenticated 누락 → 로그인 유저 빈 화면(역방향) | mitigate | read_system_themes + read_theme_stocks 에 TO anon, authenticated 둘 다 명시 (Pitfall 3) |
| T-10-02-04 | DoS | 유저 테마 종목 무제한 INSERT | mitigate | enforce_user_theme_stock_limit BEFORE INSERT trigger (P0001, 50 cap) |
</threat_model>

<verification>
- `pnpm --filter @gh-radar/shared build` + test green (Task 1)
- 마이그레이션 SQL 이 RLS 7정책 + limit trigger + provenance 컬럼 포함 (Task 2)
- `pnpm supabase db push` 적용 완료 + themes/theme_stocks 테이블 production 존재 (Task 3 [BLOCKING])
</verification>

<success_criteria>
- SC#1 부분 충족: themes + theme_stocks 테이블 생성 (effective_from/to + source/confidence + stocks FK)
- 시스템 테마 anon+authenticated 읽기, 유저 테마 owner-only — RLS 검증
- packages/shared 가 Theme/ThemeStock/ThemeWithStats/ThemeStockSource export → 후속 wave 가 import 가능
</success_criteria>

<output>
After completion, create `.planning/phases/10-theme-classification/10-02-SUMMARY.md`
</output>
