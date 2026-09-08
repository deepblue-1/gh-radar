---
phase: quick-260908-qnf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260702160000_security_perf_advisor_fixes.sql
  - server/Dockerfile.dockerignore
  - server/.dockerignore
  - workers/intraday-sync/Dockerfile.dockerignore
  - workers/intraday-sync/.dockerignore
  - webapp/e2e/fixtures/discussions.ts
  - webapp/e2e/fixtures/stocks.ts
  - webapp/e2e/specs/discussions.spec.ts
  - webapp/e2e/specs/auth-guards.spec.ts
  - webapp/src/components/orderbook/relay-status-bar.tsx
  - webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx
  - .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-UI-SPEC.md
  - server/vitest.config.ts
autonomous: true
requirements:
  - 15-DEFER-05   # rls_auto_enable CREATE 부재 (이관 5)
  - 15-DEFER-06   # 선재 E2E 11건 (이관 6)
  - 15-DEFER-07   # server 테스트 간헐 flake (이관 7, 시간 상자)
  - 15-DEFER-09   # server/.dockerignore 무효 (이관 9)
  - 15-DEFER-10   # 상태 바/게이트 문구 중복 (이관 10)
  - 15-DEFER-11   # e2e stocks 픽스처 isin (이관 11)

must_haves:
  truths:
    - "빈 DB 에서 supabase/migrations/*.sql 전체를 순서대로 재생하면 오류 0 으로 끝까지 돈다 (auth.jwt() 플랫폼 스텁 1개 제외)"
    - "재생된 빈 DB 에서 anon/authenticated 는 public.rls_auto_enable() 실행 권한이 없다"
    - "docker build -f server/Dockerfile . 의 빌드 컨텍스트에 node_modules/.git/.planning/.next/.env 가 들어가지 않고, 그 상태로 server 이미지가 정상 빌드된다"
    - "playwright test discussions / discussion-filter / auth-guards / stock-detail-tabs 가 전부 green"
    - "webapp 전체 Playwright 스위트가 exit 0"
    - "상태 바 unauthorized 문구와 권한 게이트 제목 문구가 서로 다르다"
  artifacts:
    - path: "supabase/migrations/20260702160000_security_perf_advisor_fixes.sql"
      provides: "rls_auto_enable() CREATE OR REPLACE 보정 (REVOKE 3줄보다 앞)"
      contains: "CREATE OR REPLACE FUNCTION public.rls_auto_enable()"
    - path: "server/Dockerfile.dockerignore"
      provides: "BuildKit 이 실제로 읽는 이름의 server 빌드 컨텍스트 제외 목록"
      contains: ".env"
    - path: "workers/intraday-sync/Dockerfile.dockerignore"
      provides: "동일 버그 클래스의 나머지 1건 교정"
    - path: "webapp/e2e/fixtures/discussions.ts"
      provides: "{ items, hasMore } envelope 를 반환하는 GET 스텁"
      contains: "hasMore"
    - path: "webapp/src/components/orderbook/relay-status-bar.tsx"
      provides: "게이트와 구분되는 unauthorized 상태 문구"
  key_links:
    - from: "supabase/migrations/20260702160000_security_perf_advisor_fixes.sql"
      to: "REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()"
      via: "같은 파일 안에서 CREATE 가 REVOKE 보다 위에 온다"
      pattern: "CREATE OR REPLACE FUNCTION public\\.rls_auto_enable"
    - from: "webapp/e2e/fixtures/discussions.ts"
      to: "webapp/src/lib/stock-api.ts::fetchStockDiscussions"
      via: "DiscussionListResponse = { items, hasMore } 계약 일치"
      pattern: "items.*hasMore|hasMore.*items"
    - from: "webapp/e2e/specs/discussions.spec.ts"
      to: "무한스크롤 loadMore"
      via: "인라인 route 2개도 envelope 로 응답 (첫 페이지 hasMore:true / 두 번째 false)"
      pattern: "hasMore"
---

<objective>
Phase 15 종결 문서가 남긴 **기술부채 6건**(이관 5·6·7·9·10·11)을 저장소 안에서 닫는다.
전부 phase 15 가 원인이 아닌 선재 이슈이고, `deferred-items.md` 에 원인 분석과 권고가 이미 적혀 있다.

Purpose: 마이그레이션 이력 재생 가능성 복구(재해복구·신규 스테이징의 전제) + 선재 E2E 적자 청산 +
빌드 컨텍스트 위생 + UI 문구 정본 정리. 남겨두면 "원래 빨간 테스트" 가 새 회귀를 가려 준다.

Output: 마이그레이션 1건 보정, dockerignore 2건 교정, E2E 픽스처·스펙 교정, UI 문구 분리, UI-SPEC 갱신.

**이 quick 은 저장소 안에서 끝난다.** `supabase db push` 금지 · 배포 스크립트 실행 금지 ·
production 스키마 변경 금지. 읽기 전용 조회(`supabase db dump`, `supabase migration list`)만 허용한다.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/deferred-items.md

작업 트리: **worktree 격리 없이 main tree(`master`)에서 직접 작업한다.**
(자동 메모리 `project_gsd_roadmap_append_worktree_restore` — 격리하면 merge 가 되돌린다)

로컬 포트 규약(`dev.sh` · Phase 15 D-41): webapp `:3100` / server `:8080` / relay ws `:8090`.
**3000 을 가정하지 말 것.** Playwright `baseURL=http://localhost:3100`, `webServer` 가 `pnpm dev` 를
자동 기동한다(`reuseExistingServer=true`).

E2E 전제 파일은 **둘 다 이미 존재함을 확인했다** — `webapp/.env.local`, `webapp/.env.test.local`.
`setup` project 가 Supabase REST 로 테스트 유저 세션을 만들어 `storageState` 를 굽는다.
만약 실행 시점에 둘 중 하나가 없으면 그 사실을 SUMMARY 에 블로커로 적고 Task 2 를 중단할 것.

pnpm 필터는 스코프를 벗겨 매칭한다 — `pnpm --filter webapp ...` 이 `@gh-radar/webapp` 에 붙는 것을
실측 확인했다. `--filter @gh-radar/server` 도 동일.

## 계약 원문 (추측 금지 — 아래가 실측한 정본)

`packages/shared/src/discussion.ts`
```ts
export type DiscussionListResponse = {
  items: Discussion[];
  hasMore: boolean;
};
```

`webapp/src/lib/stock-api.ts`
```ts
// GET  → Promise<DiscussionListResponse>   쿼리: hours|days, limit, before(cursor=마지막 항목 postedAt), filter
// POST /refresh → Promise<Discussion[]>    (배열이 맞다 — refresh 스텁은 고치지 않는다)
```

`packages/shared/src/stock.ts`
```ts
export type StockDetailResponse = Stock & { upperLimitProximity: number; isin: string | null };
// isin = KRX ISU_CD 표준코드 12자 (예: KR7005930003). DB 제약 length(isin)=12 + UNIQUE 부분인덱스.
```

## production `rls_auto_enable()` 정의 (2026-09-08 `supabase db dump --linked --schema public` 실측)

```sql
CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;
```

**부수 사실:** 이 함수는 `RETURNS event_trigger` 다. 짝이 되는 EVENT TRIGGER 객체는 public 스키마
덤프에 나오지 않는다(클러스터 레벨 객체 · 대시보드가 `supabase_admin` 으로 만든 것). 마이그레이션에
`CREATE EVENT TRIGGER` 를 넣으면 **실제 Supabase 대상에서 권한 오류로 실패**한다 — 넣지 말 것.
이 quick 의 목표는 "이력 재생 가능성 복구" 이지 이벤트 트리거 재현이 아니다.
</context>

<tasks>

<task type="auto">
  <name>Task 1: rls_auto_enable 보정 마이그레이션 + dockerignore 실효화 (이관 5·9)</name>
  <files>
    supabase/migrations/20260702160000_security_perf_advisor_fixes.sql
    server/Dockerfile.dockerignore (신규, server/.dockerignore 를 git mv)
    workers/intraday-sync/Dockerfile.dockerignore (신규, workers/intraday-sync/.dockerignore 를 git mv)
  </files>
  <action>
**먼저 재확인(선재 여부 · 현재도 재현되는가).** `grep -rn "rls_auto_enable" supabase/` 로 CREATE 가
없고 REVOKE 3줄(`20260702160000_security_perf_advisor_fixes.sql:23-25`)만 있음을 확인한다.
`git ls-files | grep -i dockerignore` 로 `relay/Dockerfile.dockerignore` 만 존재하고
`server/.dockerignore` · `workers/intraday-sync/.dockerignore` 는 고아임을 확인한다.
`grep -n -A6 "docker build" scripts/deploy-server.sh scripts/deploy-intraday-sync.sh` 로 두 빌드 모두
**컨텍스트가 저장소 루트**(`-f <dir>/Dockerfile .`)임을 확인한다. 셋 중 하나라도 이미 해소돼 있으면
그 항목은 건드리지 말고 SUMMARY 에 "재확인 결과 이미 해소" 로 기록한다.

**(A) 마이그레이션 보정 — 배치 결정과 그 근거.**
먼저 `supabase migration list < /dev/null` 을 실행해 `20260702160000` 이 **원격에 이미 적용됨**을
확인한다(자격증명은 캐시돼 있다 — 계획 단계에서 `supabase db dump --linked` 성공을 실측했다).
확인되면 **기존 파일을 제자리에서 보강한다**: `CREATE OR REPLACE FUNCTION public.rls_auto_enable()` 를
같은 파일의 `-- 1) SECURITY DEFINER RPC REVOKE` 섹션 **바로 앞**에 삽입한다. 본문은 위
`<context>` 의 production 덤프를 **글자 그대로** 옮긴다(따옴표 스타일 포함). `OWNER TO` 줄은 넣지 않는다.

이 배치를 택한 이유를 파일 주석으로 남긴다: ①REVOKE 보다 앞에 와야 빈 DB 재생이 성립한다,
②이미 원격 적용된 파일이라 `db push` 가 다시 실행하지 않으므로 production 영향이 0 이다,
③`20260702155900_*.sql` 처럼 **더 이른 타임스탬프의 새 파일**을 끼우면 이후 모든 `db push` 가
"원격 마지막 마이그레이션보다 앞선 로컬 파일" 로 막혀 `--include-all` 을 요구하는 함정을 남긴다.
만약 `migration list` 가 원격 미적용으로 나오면(예상 밖) 같은 in-place 보강이 여전히 안전하다 —
그때는 파일 전체가 처음 적용되면서 CREATE 가 REVOKE 앞에서 실행될 뿐이다.

`CREATE EVENT TRIGGER` 는 넣지 않는다(위 부수 사실). `supabase db push` 는 실행하지 않는다.

**(B) dockerignore 실효화.**
`git mv server/.dockerignore server/Dockerfile.dockerignore` 후 내용을
`relay/Dockerfile.dockerignore` 와 대조해 맞춘다(왜 이 이름이어야 하는지 설명하는 머리 주석 포함).
현재 server 목록은 `**/.env*` 재귀 패턴과 `.claude` 가 빠져 있고, 무엇보다 **`webapp/.next`(527MB)와
`.vercel`(`.env.production.local` 보유)이 빠져 있다.** relay 목록 + `**/.next` + `.vercel` +
`**/test-results` + `**/playwright-report` 로 구성한다. `server/Dockerfile` 이 실제로 COPY 하는 것은
루트 `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `tsconfig.base.json` / `packages/shared/` /
`server/` 뿐이고 `server/tsconfig.json` 이 `tests` 를 exclude 하므로 `**/tests` · `**/*.test.ts` 제외는
빌드를 깨지 않는다. **워크스페이스 디렉터리 자체(`webapp/`)를 통째로 제외하지는 말 것** —
`pnpm install --frozen-lockfile` 이 워크스페이스 importer 불일치로 깨진다.

`workers/intraday-sync/.dockerignore` 도 같은 버그 클래스이므로 동일하게 `git mv` +
동일 내용으로 맞춘다(1 파일, 위험 0).

`relay/Dockerfile.dockerignore` 에 `**/.next` 를 더할지는 `relay/Dockerfile` 이 webapp 을 COPY 하지
않음을 확인한 뒤 판단한다 — 더하면 relay 빌드 컨텍스트도 527MB 줄어든다. 더했다면 SUMMARY 에 적는다.
dockerignore 가 아예 없는 나머지 워커 9종은 **이 quick 의 대상이 아니다**(원래 없었던 것이지 무효화된
것이 아니다). 관측만 SUMMARY 에 남긴다.
  </action>
  <verify>
    <automated>
    # A-1. 빈 DB 이력 재생 (일회용 컨테이너, 공유 DB 접촉 0회 — 15-09 패턴 재사용)
    #      이미지는 로컬에 있다: public.ecr.aws/supabase/postgres:17.6.1.104
    docker run -d --name qnf-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 \
      public.ecr.aws/supabase/postgres:17.6.1.104
    # readiness 대기 후, GoTrue 가 제공하는 플랫폼 함수만 스텁으로 심는다 (auth.jwt()).
    #   CREATE SCHEMA IF NOT EXISTS auth;
    #   CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    # 그 다음 파일명 순(=타임스탬프 순)으로 전량 재생:
    #   for f in supabase/migrations/*.sql; do
    #     docker exec -i qnf-pg psql -U postgres -v ON_ERROR_STOP=1 -q -f - < "$f" || { echo "FAILED: $f"; break; }
    #   done
    # 기대: 35개 파일 전부 오류 0. rls_auto_enable 지점에서 멈추지 않는다.
    #
    # A-2. 재생 결과 단언 (psql -tA)
    #   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    #     WHERE n.nspname='public' AND p.proname='rls_auto_enable';                     -- 기대 1
    #   SELECT has_function_privilege('anon','public.rls_auto_enable()','execute');      -- 기대 f
    #   SELECT has_function_privilege('authenticated','public.rls_auto_enable()','execute'); -- 기대 f
    # 검증 후 docker rm -f qnf-pg
    #
    # B-1. dockerignore 실효 + 빌드 무회귀 (push 없음, 배포 스크립트 미실행)
    docker build --progress=plain -f server/Dockerfile -t gh-radar-server:qnf-verify . 2>&1 \
      | tee /tmp/qnf-build.log | tail -5
    # 기대 ①: "transferring context" 바이트가 50MB 미만 (node_modules 768M + webapp/.next 527M 제외 증명)
    grep -o "transferring context: [0-9.]*[kMG]*B" /tmp/qnf-build.log | tail -2
    # 기대 ②: 빌드 성공 (이미지 태그 생성) — 과잉 제외로 빌드가 깨지지 않았음을 증명
    docker image inspect gh-radar-server:qnf-verify > /dev/null && echo "BUILD OK"
    # 정리: docker image rm gh-radar-server:qnf-verify
    </automated>
  </verify>
  <done>
    - `supabase/migrations/*.sql` 전량이 빈 DB 에서 오류 0 으로 재생된다(auth.jwt() 스텁 1개만 사전 생성).
    - 재생된 DB 에서 `rls_auto_enable` 이 1개 존재하고 anon/authenticated 실행 권한은 f 다.
    - `server/Dockerfile.dockerignore` · `workers/intraday-sync/Dockerfile.dockerignore` 가 존재하고
      고아 `.dockerignore` 는 남아 있지 않다(`git ls-files | grep dockerignore` 로 확인).
    - server 이미지가 로컬 빌드에 성공하고 컨텍스트 전송이 50MB 미만이다.
    - `supabase db push` 를 실행하지 않았고 production 스키마는 무변경이다.
    - 커밋 2건(한글, `Co-Authored-By` 없음): `fix(supabase): rls_auto_enable 정의를 마이그레이션 이력에 보정` /
      `fix(docker): server·intraday-sync dockerignore 를 BuildKit 이 읽는 이름으로 교정`
  </done>
</task>

<task type="auto">
  <name>Task 2: 선재 E2E 11건 + stocks 픽스처 ISIN 정합 (이관 6·11)</name>
  <files>
    webapp/e2e/fixtures/discussions.ts
    webapp/e2e/specs/discussions.spec.ts
    webapp/e2e/specs/auth-guards.spec.ts
    webapp/e2e/fixtures/stocks.ts
  </files>
  <action>
**먼저 재확인.** `pnpm --filter webapp exec playwright test e2e/specs/discussions.spec.ts
e2e/specs/discussion-filter.spec.ts e2e/specs/auth-guards.spec.ts` 를 그대로 한 번 돌려 **지금도
재현되는 실패 목록과 건수**를 기록한다(고치기 전 baseline). 재현되지 않는 항목은 손대지 않는다.

**(B-1) 토론 픽스처 계약 교정.**
`webapp/e2e/fixtures/discussions.ts` 의 GET 스텁 2개(쿼리 있음/없음)가 지금 배열을 그대로 반환한다.
둘 다 `{ items, hasMore }` envelope 로 바꾼다. `mockDiscussionsApi` opts 에 `hasMore?: boolean`
(기본 `false`)를 추가하고 `filter=meaningful` 필터링은 **items 배열에만** 적용한다.
POST `/refresh` 스텁은 `Discussion[]` 이 실제 계약이므로 **배열 그대로 둔다**(고치지 말 것).

`hasMore` 시나리오를 픽스처 안에서 커서 시뮬레이션으로 일반화하려 들지 말 것 —
`buildDiscussionList` 가 만드는 항목들은 `postedAt` 이 전부 동일해서 `before` 커서 페이징을
픽스처 레벨에서 흉내내면 가짜 복잡도만 는다. 대신 무한스크롤은 스펙이 인라인 route 로 직접
두 페이지를 정의하는 지금 구조를 유지하고, 그 인라인 route 2개
(`discussions.spec.ts` 의 "Discussion — infinite scroll (before cursor)")를 envelope 로 바꾼다:
첫 페이지 `{ items: firstPage, hasMore: true }` / `before` 있는 두 번째 `{ items: secondPage, hasMore: false }`.
단언(50건 → 80건, `beforeCalls >= 1`)은 그대로 둔다.

**(B-2) `auth-guards.spec.ts` 루트 단언 갱신.**
Phase 13 D-07 로 `webapp/src/app/page.tsx` 의 `/scanner` 서버사이드 이동이 사라졌고
`/` 는 `PUBLIC_EXACT`(`webapp/src/lib/supabase/middleware.ts:14`)라 미인증도 통과해 홈이 렌더된다.
테스트를 지우지 말고 **지금 보장해야 할 것**으로 다시 쓴다: 미인증 컨텍스트에서 `/` 가
`/login` 으로 리다이렉트되지 **않고** HTTP 200 으로 유지된다. `page.goto('/')` 의 응답 status 200 +
최종 URL 이 baseURL 루트임을 단언하고, 리다이렉트 부재를 `expect(page).not.toHaveURL(/\/login/)` 로
못박는다. 테스트 제목과 주석의 `(/ → /scanner → /login)` 서사도 현재 동작으로 고친다.
홈 **내용**에는 단언하지 말 것 — 이 파일은 auth 가드 전용이고 `/api/home` 을 목하지 않는다
(내용 단언은 `home.spec.ts` 소관).

**(B-3) `e2e/fixtures/stocks.ts` ISIN 정합 (이관 11 — 재확인 결과 대부분 이미 해소됨).**
계획 단계 실측: 15-14 가 이미 타입을 `StockDetailResponse` 로 좁히고 `FIXTURE_SAMSUNG.isin =
'KR7005930003'`, `FIXTURE_NULL_PRICE.isin = null` 을 채웠다. **남은 어긋남은 하나다** —
`FIXTURE_SK_HYNIX` / `FIXTURE_KAKAO` 가 스프레드로 삼성 ISIN 을 그대로 상속해 세 종목이 같은 ISIN 을
갖는다. 실제 계약은 종목당 유일하다(`supabase/migrations/20260905120000_stocks_isin.sql` 의
`idx_stocks_isin` UNIQUE 부분인덱스 + `length(isin)=12` CHECK). 두 픽스처에 실제 표준코드를 명시한다:
SK하이닉스(000660) `KR7000660001`, 카카오(035720) `KR7035720002`. 형식 규칙(`KR7` + 6자리 종목코드 +
체크디짓 = 12자)을 주석 한 줄로 남긴다. 그 외에는 이 파일을 건드리지 않는다.
  </action>
  <verify>
    <automated>
    pnpm --filter webapp typecheck
    pnpm --filter webapp exec playwright test e2e/specs/discussions.spec.ts e2e/specs/discussion-filter.spec.ts e2e/specs/auth-guards.spec.ts e2e/specs/stock-detail-tabs.spec.ts
    # 회귀 게이트 — 전체 스위트가 exit 0 이어야 한다 (선재 적자를 닫는 것이 이 task 의 목적이므로
    # "원래 빨간 것" 이라는 예외를 남기지 않는다)
    pnpm --filter webapp exec playwright test
    </automated>
  </verify>
  <done>
    - baseline 실패 목록/건수가 SUMMARY 에 기록돼 있다(고치기 전 · 고친 후 대조).
    - `discussions` / `discussion-filter` / `auth-guards` / `stock-detail-tabs` 전부 green.
    - `pnpm --filter webapp exec playwright test` 전체가 exit 0.
    - `pnpm --filter webapp typecheck` exit 0.
    - POST `/refresh` 스텁은 배열 계약 그대로다(불필요한 변경 없음).
    - 커밋 2~3건(한글, `Co-Authored-By` 없음): 토론 픽스처/스펙 · auth-guards 단언 · stocks 픽스처 ISIN.
  </done>
</task>

<task type="auto">
  <name>Task 3: 상태 바/게이트 문구 분리 + server flake 시간 상자 (이관 10·7)</name>
  <files>
    webapp/src/components/orderbook/relay-status-bar.tsx
    webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx
    .planning/phases/15-dma-relay-kb-gh-trade-server-10-wss/15-UI-SPEC.md
    server/vitest.config.ts (조건부 — 아래 시간 상자 규칙 충족 시에만)
  </files>
  <action>
**먼저 재확인.** `grep -rn "실시간 호가·주문 권한이 없어요" webapp/src` 로 중복 2곳이 남아 있는지 본다
(계획 단계 실측: `relay-status-bar.tsx:123` body + `stock-orderbook-section.tsx:467` 게이트 제목.
`server/src/errors.ts:64` 는 API 에러 메시지라 다른 표면이므로 **건드리지 않는다**).

**(E) 문구 분리 — 어느 쪽이 정본인가.**
`15-UI-SPEC.md` §게이트·에러·빈 상태 표의 `권한 없음 — 제목` 이 정본이므로 **게이트 카드 제목
`실시간 호가·주문 권한이 없어요` 는 그대로 둔다.** 바꾸는 쪽은 상태 바다 — 상태 바의 일은
"연결이 지금 어떤 상태인가" 를 말하는 것이지 권한 없음의 이유를 반복하는 것이 아니다.
`relay-status-bar.tsx` 의 `unauthorized` 항목을 다음으로 바꾼다(배지 라벨 `권한 없음` 은 유지):
body = `실시간 연결을 시작하지 않았어요`, sub = `관리자에게 계정 연결을 문의해 주세요.`
(다른 상태 body 의 어투 — `연결이 끊겨 다시 연결하는 중이에요` · `증권사 회선(VPN)이 끊겼어요` — 와 맞춘다.)

`15-UI-SPEC.md` 의 세션 상태 표 `unauthorized` 행에서 본문 칸의 `본문을 C13 게이트로 교체` 를
위 상태 바 문구로 교체하고, 제목 문구는 게이트 카드 전용임을 한 줄로 명시한다
(이 모호한 한 줄이 15-12 가 같은 문구를 상태 바에 복사한 원인이다).

`relay-status-bar.test.tsx` 에 회귀 단언 1건을 더한다: `status="unauthorized"` 렌더 결과가
새 body 문구를 포함하고 게이트 제목 문구(`실시간 호가·주문 권한이 없어요`)는 **포함하지 않는다**.
`orderbook.test.tsx` / `stock-detail-client.test.tsx` 의 기존 단언은 `within(gate)` 로 스코프돼 있어
수정이 필요 없다 — 실행해서 확인하고, 필요 없으면 건드리지 않는다.

**(F) server 테스트 간헐 flake — 시간 상자.**
`pnpm --filter @gh-radar/server test` 를 **3회 연속** 돌려 실패 유무·파일·실패 유형을 기록한다.
그 다음은 아래 규칙대로만 움직인다(무리한 리팩터 금지):
- 3회 모두 통과 → **아무것도 고치지 않는다.** 관측 결과만 SUMMARY 에 적고 이관 유지.
- 실패가 **기본 5000ms 타임아웃**이고 단언 실패가 아니면 → `server/vitest.config.ts` 에
  `test.testTimeout = 15000` 만 추가한다. 단언·구조를 바꾸지 않는 예산 조정이며,
  이 스위트는 Supabase 를 목하는 통합 테스트라 5초는 CPU 포화 시 굶기 쉬운 예산이다.
- 실패가 `read ECONNRESET` 이거나 단언 실패면 → **고치지 않는다.** supertest 가 파일마다 임시 서버를
  bind/close 하는 구조 문제이고(이미 `tests/setup.ts` 의 `keepAlive=false` 로 1차 완화됨),
  구조 변경은 이 quick 의 범위 밖이다. 재현 로그(파일·케이스·에러 문자열·회차)만 SUMMARY 에
  이관으로 남긴다.
어느 경로든 "관측했다" 를 근거 없이 적지 말고 3회 실행 결과를 수치로 적는다.
  </action>
  <verify>
    <automated>
    grep -rn "실시간 호가·주문 권한이 없어요" webapp/src | grep -v "__tests__" | wc -l   # 기대 1 (게이트 카드만)
    pnpm --filter webapp test
    pnpm --filter webapp typecheck
    # flake 시간 상자 — 3회 연속 (실패해도 즉시 중단하지 말고 3회 전부 기록)
    for i in 1 2 3; do echo "=== run $i ==="; pnpm --filter @gh-radar/server test; echo "exit=$?"; done
    </automated>
  </verify>
  <done>
    - `webapp/src` 안에서 `실시간 호가·주문 권한이 없어요` 는 게이트 카드 1곳에만 남는다.
    - 상태 바 `unauthorized` 가 연결 상태 문구를 쓰고, 그 구분을 못박는 테스트 1건이 추가됐다.
    - `15-UI-SPEC.md` 의 `unauthorized` 행이 상태 바 문구 정본을 담고 있고 제목 문구의 소유처가 명시됐다.
    - `pnpm --filter webapp test` · `typecheck` exit 0.
    - server 테스트 3회 실행 결과가 수치로 SUMMARY 에 있고, 시간 상자 규칙에 따라 수정했거나
      수정하지 않은 근거가 적혀 있다.
    - 커밋 1~2건(한글, `Co-Authored-By` 없음): `fix(webapp): 상태 바 권한 없음 문구를 게이트와 분리` (+ 조건부 flake 예산 조정)
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 저장소 → production Supabase | 마이그레이션 파일이 `db push` 로 스키마를 바꾼다. 이 quick 은 **push 하지 않는다**(읽기 전용 dump/list 만) |
| 저장소 → 빌드 컨텍스트 → 이미지 캐시 | `docker build` 컨텍스트에 들어간 `.env` 는 builder 레이어와 빌드 캐시에 남는다 |
| 브라우저 ← 상태 바/게이트 문구 | 권한 없음 상태에서 내부 사유를 과다 노출하지 않아야 한다 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QNF-01 | Information Disclosure | `docker build -f server/Dockerfile .` 컨텍스트 | mitigate | `server/Dockerfile.dockerignore` 로 `.env`·`**/.env*`·`.vercel`·`.git`·`.planning`·`node_modules`·`**/.next` 제외. 컨텍스트 전송 <50MB 로 실증 |
| T-QNF-02 | Tampering | `rls_auto_enable()` production 정의 | mitigate | 본문을 `supabase db dump` 실측 덤프에서 **글자 그대로** 옮긴다. 임의 작성 금지 — `CREATE OR REPLACE` 라 잘못된 본문은 다음 push 때 production 함수를 덮어쓴다. 이 quick 에서는 push 자체를 하지 않는다 |
| T-QNF-03 | Elevation of Privilege | `rls_auto_enable()` (SECURITY DEFINER) | mitigate | 보정 CREATE 는 반드시 REVOKE 3줄 **앞**에 둬 신규 DB 에서도 anon/authenticated 실행 권한이 제거되게 한다. 재생 후 `has_function_privilege` 로 f 를 실증 |
| T-QNF-04 | Denial of Service | 마이그레이션 이력 재생 불가 | mitigate | 이 quick 의 본체. 재해복구·신규 스테이징이 막히는 상태를 해소하고 일회용 컨테이너 재생으로 증명 |
| T-QNF-05 | Tampering | 이미 원격 적용된 마이그레이션 파일 in-place 편집 | accept | `db push` 는 버전(파일명)만 비교하고 본문을 재검증하지 않는다. 편집은 **가산적·멱등**(`CREATE OR REPLACE`)이며 원격 재실행 경로가 없다. 대안(더 이른 타임스탬프 신규 파일)은 이후 모든 push 에 `--include-all` 함정을 남겨 더 위험하다 |
| T-QNF-SC | Tampering | npm/pip/cargo 설치 | n/a | 이 quick 은 **의존성을 추가하지 않는다**. 패키지 설치 task 가 없으므로 legitimacy 게이트 대상 아님 |
</threat_model>

<verification>
1. 빈 DB 재생: `supabase/migrations/*.sql` 35건 전량 오류 0 (auth.jwt() 플랫폼 스텁만 사전 생성).
2. `has_function_privilege('anon'|'authenticated','public.rls_auto_enable()','execute')` = f.
3. `docker build -f server/Dockerfile .` 성공 + 컨텍스트 전송 <50MB.
4. `git ls-files | grep dockerignore` 에 고아 `.dockerignore` 가 없다.
5. `pnpm --filter webapp exec playwright test` exit 0 (전체).
6. `pnpm --filter webapp test` / `typecheck` exit 0.
7. `grep -rn "실시간 호가·주문 권한이 없어요" webapp/src | grep -v __tests__` 가 1건.
8. `supabase db push` · `scripts/deploy-*.sh` 를 한 번도 실행하지 않았다.
</verification>

<success_criteria>
- 이관 5·6·9·10·11 이 닫혔고, 7 은 시간 상자 규칙에 따라 처리(수정 또는 근거 있는 이관 유지)됐다.
- production DB·실계좌·배포에 아무 변경이 없다.
- 모든 커밋 메시지가 한글이고 `Co-Authored-By` 가 없다.
- SUMMARY 에 항목별 "재확인 결과(선재/이미 해소)" 와 실측 수치(baseline 실패 건수, 컨텍스트 전송량,
  server 3회 실행 결과)가 적혀 있다.
</success_criteria>

<output>
Create `.planning/quick/260908-qnf-phase-15-rls-auto-enable-e2e-11-dockerig/260908-qnf-SUMMARY.md` when done.
</output>
