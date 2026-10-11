---
phase: 16-trading-limit-chaser-vi-my-page
plan: 01
subsystem: infra
tags: [flatbuffers, flatc, radix-ui, shadcn, supabase, postgres, migration, requirements]

# Dependency graph
requires:
  - phase: 15-dma-relay-kb-gh-trade-server-10-wss
    provides: "relay/src/generated/** FlatBuffers 생성 코드 트리, dma_orders 테이블(정책 0개 default-deny), webapp shadcn 컴포넌트 규약(switch.tsx)"
provides:
  - "REQUIREMENTS.md 에 Phase 16 요구사항 5건(TRADE-01/02/03·NAV-01·MYPAGE-01) 등록 — 이후 모든 16-XX plan 의 requirements 참조 대상"
  - "SetLimitChaser 45 슬롯 생성 코드 — cancelQtyTrackBaseline 접근자(field 44) 사용 가능"
  - "UnfilledState 10 슬롯 생성 코드 — orderTime 접근자(field 9) 사용 가능"
  - "webapp/src/components/ui/checkbox.tsx — UI-SPEC A4a/A7a/A9 체크박스 6개 + B5 VI 확인 체크의 기반 컴포넌트"
  - "dma_orders.origin 컬럼(manual/limit_chaser/vi) — 프로덕션 적용 완료"
affects: [16-02, 16-03, 16-04, 16-05, 16-06, 16-07, 16-08, 16-09, 16-10, 16-11, 16-12, 16-13, 16-14, 16-15, 16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sync-relay-schema.sh 를 worktree 에서 돌릴 때는 RELAY= 로 대상 워크스페이스를 명시한다(기본값은 메인 체크아웃)"
    - "shadcn 레지스트리 산출물은 그대로 쓰지 않는다 — cn import 경로와 상태 셀렉터를 저장소의 radix 버전에 맞춘다"

key-files:
  created:
    - webapp/src/components/ui/checkbox.tsx
    - supabase/migrations/20260908120000_dma_orders_origin.sql
  modified:
    - .planning/REQUIREMENTS.md
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - relay/src/generated/stock-dma/unfilled-state.ts

key-decisions:
  - "sync-relay-schema.sh 는 RELAY= 환경변수로 worktree 를 가리켜 실행 — 기본값 ../../gh-radar/relay 는 메인 체크아웃이라 worktree 격리를 깬다"
  - "shadcn CLI 는 webapp 에 이미 pinned 된 shadcn@^4.2.0 로컬 바이너리로 실행 — npx @latest 네트워크 다운로드를 피한다"
  - "레지스트리 checkbox 원본이 끌어온 무관한 npm 패키지 cn@0.2.6 은 즉시 되돌리고 import 를 @/lib/utils 로 교정 — 신규 의존성 0건 유지"
  - "레지스트리 원본의 data-checked: 셀렉터를 data-[state=checked]: 로 교체 — 이 저장소의 @radix-ui/react-checkbox@1.3.3 은 data-state 만 내보낸다"
  - "origin 마이그레이션은 컬럼 추가 + COMMENT 만 — RLS 정책/권한 구문을 재실행하지 않아 default-deny 표면을 그대로 둔다"

patterns-established:
  - "worktree 실행 시 형제 repo 스크립트의 출력 경로는 환경변수로 재지정 후 메인 체크아웃 무변경을 실측 확인한다"
  - "shadcn 신규 컴포넌트 추가는 package.json / pnpm-lock.yaml diff 0 을 게이트로 검증한다"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-09-08
---

# Phase 16 Plan 01: 선행 조건 4건 Summary

**Phase 16 요구사항 5건 등록 + relay 생성 코드를 gh-trade 정본에 재동기화(SetLimitChaser 44→45, UnfilledState 9→10) + shadcn checkbox 추가(신규 의존성 0건) + `dma_orders.origin` 프로덕션 적용**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-08T09:22:58Z
- **Completed:** 2026-09-08T09:33:15Z
- **Tasks:** 3
- **Files modified:** 6 (created 2, modified 4)

## Accomplishments

- **요구사항 추적성 복구.** `REQUIREMENTS.md` 에 `### Trading` 섹션을 신설하고 TRADE-01/TRADE-02/TRADE-03·NAV-01·MYPAGE-01 5건을 Phase 11~15 선례 형식으로 등록. Traceability 5행 + Coverage 40→45 + Mapped 45 / Unmapped 0 정합. 이제 16-02 이후 모든 plan 의 `requirements:` 가 실재하는 ID 를 가리킨다.
- **상따 취소 잔량추적 기준선 접근 가능.** `SetLimitChaser` 가 `startObject(44)` → `startObject(45)` 로 갱신되어 `cancelQtyTrackBaseline()` 접근자와 `addCancelQtyTrackBaseline()` 빌더가 생겼다. D-06 「전체 필드를 현재 표시값으로 전송」의 S→C 표시값 4번째 필드를 이제 읽고 되쓸 수 있다.
- **미체결 주문시각 접근 가능.** `UnfilledState` 가 `startObject(9)` → `startObject(10)` 으로 갱신되어 `orderTime()` 접근자가 생겼다.
- **체크박스 기반 컴포넌트 확보.** UI-SPEC A4a/A7a/A9 체크박스 6개와 B5 VI 확인 체크가 쓸 `Checkbox` 를 **신규 npm 의존성 0건**으로 추가했다.
- **`dma_orders.origin` 프로덕션 적용.** relay 가 51 통보로 자동주문 행을 insert 할 때 수동/상따/VI 를 구분할 수 있다.

## Task Commits

1. **Task 1: REQUIREMENTS.md 에 Phase 16 요구사항 5건 등록** — `286aecb` (docs)
2. **Task 2: relay 생성 코드 재동기화 + shadcn checkbox 설치** — `ca21b1b` (chore)
3. **Task 3: dma_orders.origin 마이그레이션 작성 + supabase db push** — `fc8bab2` (feat)

## Files Created/Modified

- `.planning/REQUIREMENTS.md` — `### Trading` 섹션 5건 + Traceability 5행 + Coverage 45 + Out of Scope 주석 + Last updated 교체
- `relay/src/generated/StockDMA.fbs` — 정본 사본 갱신 (SYNC MARKER 7줄 CRLF + 정본 본문)
- `relay/src/generated/stock-dma/set-limit-chaser.ts` — 45 슬롯, `cancelQtyTrackBaseline` 접근자/빌더 추가
- `relay/src/generated/stock-dma/unfilled-state.ts` — 10 슬롯, `orderTime` 접근자/빌더 추가
- `webapp/src/components/ui/checkbox.tsx` — Radix Checkbox 래핑 (`radix-ui` 배럴 + `@/lib/utils` cn + `data-[state=checked]`)
- `supabase/migrations/20260908120000_dma_orders_origin.sql` — `origin text NOT NULL DEFAULT 'manual' CHECK IN ('manual','limit_chaser','vi')` + COMMENT

## Decisions Made

1. **`sync-relay-schema.sh` 를 `RELAY=` 로 worktree 에 고정.** 스크립트 기본값은 `../../gh-radar/relay` = **메인 체크아웃**이다. 그대로 돌렸으면 worktree 밖으로 파일을 썼고, 이 plan 의 커밋에는 아무것도 담기지 않은 채 메인 트리만 dirty 가 됐다. 스크립트가 이미 제공하는 `RELAY=` 오버라이드를 썼고, 실행 후 메인 체크아웃의 `set-limit-chaser.ts` 가 여전히 `startObject(44)` 임을 실측해 무변경을 확인했다.
2. **shadcn CLI 는 로컬 pinned 바이너리로 실행.** 계획은 `npx shadcn@latest` 였으나 `webapp/package.json` 에 이미 `shadcn: ^4.2.0` 이 있다. `./node_modules/.bin/shadcn add checkbox` 를 써서 매 실행마다 달라지는 최신본 네트워크 다운로드를 피했다.
3. **마이그레이션 첫 줄은 `-- ====` 구분선 유지.** acceptance 는 "첫 줄이 `-- Phase 16 Plan 01 — TRADE-03` 으로 시작" 이라고 썼지만, analog 인 `20260905120200_dma_orders.sql` 을 포함해 저장소 마이그레이션 대다수가 구분선으로 시작하고 제목은 2번째 줄이다. PATTERNS 가 "머리말 주석 형식 `:1~44` 전체 복사" 를 요구하므로 코퍼스 일관성을 택했다 — 제목 문구 자체는 2행에 정확히 들어 있다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] sync 스크립트 출력 경로가 worktree 밖(메인 체크아웃)을 가리킴**

- **Found during:** Task 2
- **Issue:** `sync-relay-schema.sh` 의 `RELAY` 기본값이 `../../gh-radar/relay` 로 해석돼 **메인 체크아웃**에 생성물을 쓴다. 이 executor 는 worktree 격리 상태라 그 결과물은 커밋 대상이 아니고, 동시에 메인 트리를 오염시킨다.
- **Fix:** 스크립트가 자체 제공하는 `RELAY=<경로>` 환경변수로 worktree 의 `relay` 를 명시해 실행. `gh-trade` 저장소는 손대지 않았다(스크립트가 `.fbs` 정본을 읽기만 함).
- **Files modified:** 없음 (실행 방식 변경)
- **Verification:** 실행 후 `--check` 재실행 → `신규/변경 예정 : 0 개`. 메인 체크아웃의 `relay/src/generated/stock-dma/set-limit-chaser.ts` 는 여전히 `startObject(44)` + `cancelQtyTrackBaseline` 0건 → 무변경 확인.
- **Committed in:** `ca21b1b`

**2. [Rule 3 - Blocking] worktree 에 node_modules 부재로 typecheck 불가**

- **Found during:** Task 2
- **Issue:** worktree 는 새 체크아웃이라 `node_modules` 가 없어 `pnpm typecheck` 를 돌릴 수 없었다.
- **Fix:** `pnpm install --frozen-lockfile` 실행. 락파일 그대로 설치이므로 신규 패키지 도입이 아니며 `pnpm-lock.yaml` diff 는 0.
- **Files modified:** 없음 (tracked 파일 무변경)
- **Verification:** `git diff --stat pnpm-lock.yaml` 빈 출력.
- **Committed in:** 해당 없음 (추적 파일 변경 없음)

**3. [Rule 1 - Bug] shadcn 레지스트리 산출물이 무관한 npm 패키지 `cn@0.2.6` 을 새 의존성으로 추가**

- **Found during:** Task 2
- **Issue:** `shadcn add checkbox` 가 만든 `checkbox.tsx` 첫머리가 `import { cn } from "cn"` 이었고, CLI 가 그에 맞춰 `cn@0.2.6`(`hasBin: true` 인 별개 CLI 패키지)을 `webapp/package.json` + `pnpm-lock.yaml` 에 설치했다. 저장소 규약은 `@/lib/utils` 이며(`switch.tsx` 등 전 컴포넌트 동일), 계획과 threat model T-16-SC 는 **신규 npm 의존성 0건**을 명시적 게이트로 둔다.
- **Fix:** `git checkout -- webapp/package.json pnpm-lock.yaml` 로 의존성을 되돌리고, `pnpm install --frozen-lockfile` 로 `node_modules` 에서도 제거(`Packages: -1`). `checkbox.tsx` 의 import 를 `@/lib/utils` 로 교정.
- **Files modified:** `webapp/src/components/ui/checkbox.tsx`
- **Verification:** `git diff --stat webapp/package.json` / `git diff --stat pnpm-lock.yaml` 모두 빈 출력. `pnpm typecheck` exit 0.
- **Committed in:** `ca21b1b`

**4. [Rule 1 - Bug] 레지스트리 원본의 `data-checked:` 셀렉터가 이 저장소 Radix 버전에서 전부 무효**

- **Found during:** Task 2
- **Issue:** 레지스트리가 내려준 className 은 `data-checked:border-primary data-checked:bg-primary …` 를 쓴다. 그런데 이 저장소가 쓰는 `radix-ui@1.4.3` → `@radix-ui/react-checkbox@1.3.3` 은 `data-state="checked|unchecked|indeterminate"` 만 내보낸다(dist 실측: `data-state` 2건, `data-checked` 0건). 그대로 뒀으면 타입체크·빌드는 통과하면서 **체크 상태 스타일이 통째로 죽어** 체크된 박스와 안 된 박스가 시각적으로 동일해진다 — UI-SPEC B5 VI 확인 체크에서 치명적이다.
- **Fix:** `data-checked:` → `data-[state=checked]:` 로 교체(`switch.tsx` 의 `data-[state=checked]:` 규약과 동형). `data-[state=indeterminate]:` 도 함께 정의. 아울러 이 저장소에 존재하지 않는 shadcn `Field` 컴포넌트를 전제한 `group-has-…/field` 계열 셀렉터(죽은 CSS)를 제거.
- **Files modified:** `webapp/src/components/ui/checkbox.tsx`
- **Verification:** `@radix-ui/react-checkbox@1.3.3` dist 에서 `data-state` 방출 실측. `pnpm typecheck` exit 0.
- **Committed in:** `ca21b1b`

**5. [Rule 3 - Blocking] JSDoc 주석 안의 `*/` 가 블록 주석을 조기 종료**

- **Found during:** Task 2
- **Issue:** `checkbox.tsx` 문서 주석에 `group-has-*/field*` 라고 적었는데 그 안의 `*/` 가 블록 주석을 끊어 `tsc` 가 TS1005/TS1160 7건으로 실패했다.
- **Fix:** 해당 문구를 `group-has-...` 로 바꿔 `*/` 제거.
- **Files modified:** `webapp/src/components/ui/checkbox.tsx`
- **Verification:** `pnpm typecheck` exit 0.
- **Committed in:** `ca21b1b`

**6. [Rule 3 - Blocking] worktree 에 supabase 링크 상태(`supabase/.temp`) 부재**

- **Found during:** Task 3
- **Issue:** `supabase/.temp` 는 gitignore 대상이라 worktree 에 `project-ref` 가 없어 `--linked` 명령이 성립하지 않았다.
- **Fix:** 메인 체크아웃의 `supabase/.temp/project-ref`(`ivdbzxgaapbmrxreyuht`) 와 `pooler-url` 을 worktree 로 복사. 둘 다 gitignore 대상이라 커밋 표면 없음.
- **Files modified:** 없음 (untracked 로컬 상태)
- **Verification:** `supabase migration list --linked` 정상 응답.
- **Committed in:** 해당 없음

**7. [Rule 2 - 문서 정합] 마이그레이션 「하지 않는 것」 문구에서 `REVOKE`/`GRANT` 리터럴 제거**

- **Found during:** Task 3
- **Issue:** acceptance 는 `grep -c "REVOKE\|GRANT"` == 0 을 요구하는데, 계획의 action 은 같은 파일 주석에 "REVOKE/GRANT 를 다시 실행하지 않는다" 를 쓰라고 지시한다 — 문자 그대로면 서로 충돌한다(14-01 SUMMARY 의 동일 유형 선례).
- **Fix:** 주석 문구를 "권한 회수·부여 구문을 다시 실행하지 않는다" 로 바꿔 의미는 보존하고 리터럴만 제거. **실행 SQL 에는 애초에 권한 구문이 없다**(T-16-08 의도 그대로).
- **Files modified:** `supabase/migrations/20260908120000_dma_orders_origin.sql`
- **Verification:** `grep -c 'REVOKE\|GRANT'` == 0, `grep -c 'CREATE POLICY'` == 0.
- **Committed in:** `fc8bab2`

---

**Total deviations:** 7 auto-fixed (Rule 1 버그 2 · Rule 3 블로킹 4 · Rule 2 문서정합 1)
**Impact on plan:** 스코프 확장 없음. #1/#2/#6 은 worktree 실행 환경 때문에 생긴 경로·부트스트랩 문제이고, #3/#4/#5 는 shadcn 레지스트리 산출물이 이 저장소 규약·Radix 버전과 어긋난 데서 온 실제 결함이다. 특히 #4 는 타입체크를 통과하면서 UI 만 조용히 죽는 종류라 지금 잡지 않았으면 16-06 이후 VI 확인 체크에서 재발견됐을 것이다.

## Acceptance Criteria 문언 불일치 2건 (기록용)

계획서의 grep 게이트 중 2건은 같은 계획서의 action 지시와 문자 그대로 충돌한다. 둘 다 **action 지시를 따랐고**, 판단 근거를 남긴다.

| 게이트 | 기대 | 실제 | 판단 |
|--------|------|------|------|
| `grep -c "40→45" REQUIREMENTS.md` == 1 | 1 | **2** | action ③ 이 Last updated 줄에도 `Coverage 40→45.` 를 쓰라고 지시. Phase 15 원본도 `37→40` 이 Coverage·Last updated 두 줄에 있어 동일하게 2였다 — 선례 정합. |
| 마이그레이션 **첫 줄**이 `-- Phase 16 Plan 01 — TRADE-03` | 1행 | **2행** (1행은 `-- ====` 구분선) | analog `20260905120200_dma_orders.sql` 및 저장소 마이그레이션 대다수가 구분선으로 시작. PATTERNS 가 머리말 형식 전체 복사를 요구. |

## Issues Encountered

- **`gh-trade` 저장소가 사전 dirty 상태.** `git status` 에 `server/docs/krx/*.xlsb|xlsm|xlsx` 삭제/추가와 `.vscode/`, `.clangd`, `.planning/quick/260908-f0s-…` 가 잡힌다. **이 plan 과 무관한 기존 상태**이며 건드리지 않았다. 이 plan 이 실제로 관계된 경로(`server/src/protocol`, `server/scripts`, `relay`)는 `git status --short` 로 확인 시 **완전히 깨끗**하다 — verification 의 "gh-trade 무변경" 은 그 범위에서 충족.
- **`supabase db push` 는 비대화형으로 완주.** 자동 메모리 `feedback_dont_ask_existing_creds` 에 따라 사용자에게 재요청하지 않고 기존 자격증명을 먼저 확인했다: `SUPABASE_ACCESS_TOKEN` 환경변수 존재(len=44) + 메인 체크아웃의 `project-ref`. 인증 게이트 발생 없음.

## Verification 결과

| 항목 | 결과 |
|------|------|
| `pnpm typecheck` | exit **0** (14 workspace 전부 Done) |
| `sync-relay-schema.sh --check` | `신규/변경 예정 : 0 개` · `삭제 예정 : 없음` · `.fbs 사본 : 최신` |
| `grep -c "startObject(45)" set-limit-chaser.ts` | **1** |
| `grep -c "cancelQtyTrackBaseline" set-limit-chaser.ts` | **5** (≥2 요구) |
| `grep -c "orderTime" unfilled-state.ts` | **7** (≥2 요구) |
| `git diff --stat webapp/package.json` | 빈 출력 (신규 의존성 0건) |
| `git diff --stat pnpm-lock.yaml` | 빈 출력 |
| REQUIREMENTS grep 5종 | 불릿 5 · Traceability 5 · `45 total` 1 · `Mapped to phases: 45` 1 · `Unmapped: 0 ✓` 1 |
| 마이그레이션 `CREATE POLICY` / `REVOKE\|GRANT` | **0 / 0** |
| gh-trade `server/src/protocol`·`server/scripts`·`relay` | 무변경 |
| 메인 체크아웃 `relay/.../set-limit-chaser.ts` | 여전히 `startObject(44)` — worktree 격리 유지 확인 |

### `supabase db push` 실행 로그 (인용)

```
Initialising login role...
Connecting to remote database...
Do you want to push these migrations to the remote database?
 • 20260908120000_dma_orders_origin.sql

 [Y/n] y
Applying migration 20260908120000_dma_orders_origin.sql...
Finished supabase db push.
```

**적용 후 실측 확인 2건:**

```
$ supabase migration list --linked | tail -3
   20260905120200 | 20260905120200 | 2026-09-05 12:02:00
   20260908120000 | 20260908120000 | 2026-09-08 12:00:00     ← Local/Remote 양쪽 기록
```

```
$ supabase gen types typescript --linked --schema public | grep -A32 "dma_orders: {"
        Row: {
          ...
          origin: string          ← 라이브 DB 스키마에 실재
```

## Known Stubs

없음. 이 plan 의 산출물은 생성 코드·컴포넌트·마이그레이션·문서로, 하드코딩된 빈 값이나 placeholder 를 UI 로 흘리는 지점이 없다.

## Threat Flags

없음. 계획의 `<threat_model>` 밖 신규 보안 표면이 생기지 않았다.

- **T-16-08 (Information Disclosure):** `CREATE POLICY` 0건 · 권한 구문 0건으로 `dma_orders` 의 정책 0개 default-deny + service_role 단독 권한을 그대로 유지.
- **T-16-05 (Tampering):** 생성 코드를 손으로 편집하지 않았다. flatc 25.12.19 산출물만 커밋했고 `--check` 로 차이 0 을 증명.
- **T-16-SC (Tampering):** `components.json.registries = {}` 확인, shadcn 1st-party 레지스트리. CLI 가 시도한 무관 패키지 `cn@0.2.6` 설치는 **되돌렸고** `package.json`/`pnpm-lock.yaml` diff 0 으로 게이트 충족.

## User Setup Required

없음 — 외부 서비스 신규 설정 불필요. `dma_orders.origin` 은 이미 프로덕션에 적용됐다.

## Next Phase Readiness

**16-02 이후로 열린 것:**

- `SetLimitChaser.cancelQtyTrackBaseline()` / `addCancelQtyTrackBaseline()` — D-06 「전체 필드를 현재 표시값으로 전송」 구현 가능
- `UnfilledState.orderTime()` — 미체결 표의 주문시각 컬럼 가능
- `Checkbox` — UI-SPEC A4a/A7a/A9 + B5 사용 가능
- `dma_orders.origin` — TRADE-03 의 relay insert/update 전담 시 출처 기록 가능
- 5개 요구사항 ID — 각 plan frontmatter `requirements:` 에서 참조 가능

**후속 plan 이 확인해야 할 것 (RESEARCH Assumptions Log A4 미해소):**

- `relay/src/dma/envelope.ts` 의 `parseOrderResp` 가 `origin` 필드를 **읽고 있는지** 아직 확인되지 않았다. 컬럼은 준비됐지만 파서가 값을 꺼내지 않으면 전부 DEFAULT `'manual'` 로만 쌓인다 — TRADE-03 구현 plan 이 반드시 짚어야 한다.
- 51 통보 update 가 0행일 때 insert 로 넘어가는 분기(자동주문 행 신설)도 TRADE-03 소관으로 남아 있다.

**블로커:** 없음.

## Self-Check: PASSED

- 파일 6/6 FOUND (`.planning/REQUIREMENTS.md`, `relay/src/generated/StockDMA.fbs`, `relay/src/generated/stock-dma/set-limit-chaser.ts`, `relay/src/generated/stock-dma/unfilled-state.ts`, `webapp/src/components/ui/checkbox.tsx`, `supabase/migrations/20260908120000_dma_orders_origin.sql`)
- 커밋 3/3 FOUND (`286aecb`, `ca21b1b`, `fc8bab2` — `git cat-file -t` 전부 `commit`)

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*
