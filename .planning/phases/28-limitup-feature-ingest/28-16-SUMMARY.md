---
phase: 28-limitup-feature-ingest
plan: 16
subsystem: workers (limitup-sync 적재 규칙)
tags: [worker, cloud-run-job, skip, exit-code, files_sig, sha256, vitest, limit-feature]
status: complete

requires:
  - phase: 28-limitup-feature-ingest
    provides: "28-03 워커 핵심 경로(dispatch · readManifest · filesSig · verifyFiles · KNOWN_SCHEMA_VERSION) · RPC limitup_record_skip(text, text) → integer · 가짜 Supabase"
provides:
  - "dispatch() 결과 skipped: { schema · sha · manifest · unchanged: string[] } · alert: boolean · alertDates: string[]"
  - "판정 순서 manifest → schema_version → files_sig(unchanged) → verifyFiles(sha) → 적재"
  - "skip = warn `limitup-sync skip — …`({ date, reason, detail }) + limitup_record_skip(p_date, p_reason) — dry-run 은 RPC 무접촉"
  - "export main(argv) → 종료 코드(skip 만 0 · streak >= ALERT_SKIP_STREAK(3) 1 · 예외 1) · export ALERT_SKIP_STREAK · type SkipReason"
  - "fake-supabase 주입 자리 loads(limitup_loads 행) · recordSkip(streak 값 또는 함수) · type LoadRow"
  - "tests/dispatch.test.ts 10건 — 28-06 이 넓힌다"
affects: [28-06, 28-08, 28-14]

plan_head_before: a652152bfdffd02fcdee811917039ff59b12e240
actuals:
  tokens: 4300    # chars/4 over 추가 줄(17,312자)
  tasks: 1
  commits: 2      # MEASURED: git rev-list --count a652152b..HEAD (SUMMARY 커밋 전). 그중 4d141470 docs(27) 는 동시 세션 커밋 — 이 플랜 커밋은 f7f766ce 1개

tech-stack:
  added: []
  patterns:
    - "main(argv) 가 종료 코드를 반환 · CLI 가드만 process.exit — 종료 코드 규약을 vitest 로 직접 증명"
    - "dispatch 테스트는 logger 모듈을 vi.doMock 으로 바꿔 warn/error 호출(obj · msg)을 기록한다"
    - "skip 은 run 을 끊지 않는다 — 날짜 루프 continue, 종료 코드는 run 끝 result.alert 로만"

key-files:
  created:
    - workers/limitup-sync/tests/dispatch.test.ts
  modified:
    - workers/limitup-sync/src/index.ts
    - workers/limitup-sync/tests/helpers/fake-supabase.ts
    - workers/limitup-sync/tests/load.test.ts

key-decisions:
  - "28-16: 판정 순서 고정 manifest → schema → files_sig(unchanged) → sha → 적재. unchanged 는 막힌 날짜가 아니라 record_skip 을 부르지 않는다. schema 판정은 파일을 읽기 전, unchanged 판정은 verifyFiles 전(바뀌지 않은 날짜는 sha 를 다시 계산하지 않는다)"
  - "28-16: record_skip 이 정수가 아닌 값을 돌려주거나 RPC 오류면 날짜 · 사유를 담아 throw → 종료 1(무로그 fail-safe 금지). 행 수 ≠ manifest rows · manifest 에 표 파일 항목 없음은 28-03 그대로 throw(gh-trade 계약 위반이라 skip 이 아니다)"
  - "28-16: main(argv) 가 종료 코드를 돌려준다. alert 면 error `limitup-sync alert — 같은 날짜 3회 연속 skip`({ result }) 후 1"

patterns-established:
  - "skip 사유 3종(schema · sha · manifest) = limitup_loads.last_skip_reason 값 그대로"

requirements-completed: [D-14, D-20]

coverage:
  - id: D1
    description: "「바뀐 날짜만」 — 이력 files_sig == manifest filesSig 면 verify · stage · commit · record_skip 없이 skipped.unchanged. 다르거나 null 이면 적재"
    requirement: D-14
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#이력 files_sig == manifest filesSig → unchanged · verifyFiles · stage · commit · record_skip 0회"
        status: pass
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#이력 files_sig 가 다르거나 null(= skip 만 있던 날짜)이면 적재"
        status: pass
    human_judgment: false
  - id: D2
    description: "schema · sha · manifest skip — warn(원문 값 · 불일치 파일 이름) + limitup_record_skip { p_date, p_reason } · 그 날짜 stage/commit 0 · 다른 날짜 적재 · dry-run 은 RPC 무접촉 · RPC 오류 throw"
    requirement: D-14
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#dispatch — skip 기록 (5건: schema · sha · manifest · dry-run · record_skip RPC 오류)"
        status: pass
    human_judgment: false
  - id: D3
    description: "종료 코드(D-20) — streak 3 이면 남은 날짜를 끝까지 처리한 뒤 alert · main 1 · 2 이하 0 · stage insert 오류는 사유(표 · 날짜 · 메시지) error 로그 + 1"
    requirement: D-20
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#main — 종료 코드 (3건)"
        status: pass
      - kind: command
        ref: "LIMITUP_EXPORT_DIR=$HOME/ticks/research/export LIMITUP_KEEP_DAYS=3650 npx tsx src/index.ts --dry-run → exit 0 · skipped 전부 빈 배열 · totals = 28-03 숫자 / env 없이 실행 → exit 1 + error 로그"
        status: pass
    human_judgment: false

duration: 4 min
completed: 2026-10-05
---

# Phase 28 Plan 16: 적재 규칙 Summary

**limitup-sync 가 바뀐 날짜(files_sig 기준)만 적재하고, 모르는 schema · sha 불일치 · 깨진 manifest 날짜는 warn + `limitup_record_skip` 으로 건너뛰며, 같은 날짜가 3회 연속 막히면 run 을 종료 1 로 끝낸다. dispatch 테스트 10건, 워커 전체 42건 통과.**

## Performance

- **Duration:** 약 4분
- **Started:** 2026-10-05T09:15:54Z
- **Completed:** 2026-10-05T09:19:50Z
- **Tasks:** 1
- **Files modified:** 4(새 파일 1 · 수정 3)

## Accomplishments

- `dispatch()` 날짜 루프 앞에 판정 4단을 붙였다: manifest → `schema_version` → files_sig(unchanged) → `verifyFiles`(sha). 28-03 정상 경로(stage_clear → stage → commit)와 `--dry-run` 합계 출력은 그대로다.
- skip 하면 결과에 남기고, warn 로그를 쓰고, `limitup_record_skip` 을 부른다. 돌아온 streak 가 3 이상이면 `alertDates` 에 넣고, run 은 남은 날짜를 끝까지 처리한다.
- `main(argv)` 가 종료 코드를 돌려준다. skip 만 있으면 0, alert 면 1, 예외면 사유를 로그에 남기고 1.

## 결과 객체 모양(28-06 이 `grids` · `purged` 를 더한다)

```ts
type DispatchResult = {
  dryRun: boolean; since: string; dates: string[]; loaded: string[];
  rows: Record<string, Record<ExportTbl, number>>; totals: Record<ExportTbl, number>;
  skipped: { schema: string[]; sha: string[]; manifest: string[]; unchanged: string[] };
  alert: boolean;          // alertDates.length > 0
  alertDates: string[];    // record_skip streak >= ALERT_SKIP_STREAK(3)
};
```

로그: warn `limitup-sync skip — manifest 파손 | 모르는 schema_version | 파일 sha256 불일치 · 없음`(`{ date, reason, detail }` — detail = `{ error }` | `{ schema_version, known }` | `{ files }`) · warn `limitup-sync skip streak — 알림 임계 도달`(`{ date, reason, streak }`) · info `limitup day unchanged — files_sig 같음` · error `limitup-sync alert — 같은 날짜 3회 연속 skip`(`{ result }`) · error `limitup-sync failed`(`{ err }`).

## Task Commits

1. **Task 1: 적재 규칙 — 바뀐 날짜만 · schema/sha/manifest skip 기록 · 3연속 skip 알림 종료** — `f7f766ce` (feat)

## dispatch 테스트(behavior 6항목 + 4건)

| # | behavior | 테스트 | 결과 |
|---|---|---|---|
| 1 | files_sig 같음 → verify · stage · commit · record_skip 0 · `skipped.unchanged` | 파일을 일부러 망가뜨려도 unchanged 가 이긴다(verifyFiles 를 안 부른다는 증거) · 호출은 select 1개 | pass |
| 1b | files_sig 다름 · null → 적재 | 두 날짜 commit | pass |
| 2 | schema 2 → 파일 안 읽음 · `{ p_reason: "schema" }` 1회 · warn 원문 2 | 데이터 파일 하나를 지워도 schema 사유(파일을 안 읽는다는 증거) | pass |
| 3 | sha 불일치 → `{ p_reason: "sha" }` · warn 파일 이름 · 다른 날짜 적재 | 20261001 변조 + 20261002 정상 → stage · commit 은 20261002 만 | pass |
| 4 | streak 3 → 끝까지 처리 · alert · main 1 / 2 이하 → 0 | 2건 | pass |
| 5 | stage insert error → main 이 표 · 날짜 · 메시지 error 로그 · 1 | 1건 | pass |
| 6 | manifest JSON 파손 → `{ p_reason: "manifest" }` | 1건 | pass |
| + | dry-run → record_skip 없음 · createSupabaseClient 없음 · 결과 · warn 에는 남음 | 1건 | pass |
| + | record_skip RPC 오류 → throw | 1건 | pass |

RED → GREEN: 테스트를 먼저 쓰고 돌렸을 때 10건이 모두 계획한 동작 지점에서 실패했다(28-03 은 skip 대신 `unknown schema_version 2` · `sha256 mismatch` 를 throw 했고, `skipped` 가 undefined 였고, `main is not a function`). `gsd-tools check tdd-red-evidence` 판정 `RED_EVIDENCE_OK`(target: schema_version 2 테스트). 단 vitest TAP 에는 node-test 요약 줄이 없어서, 실제 출력에서 센 `# tests 10 / # pass 0 / # fail 10` 을 붙인 뒤 판정했다. 구현 뒤에는 10건 모두 통과했다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/limitup-sync run typecheck` | 오류 0 |
| `vitest run tests/dispatch.test.ts tests/load.test.ts tests/manifest.test.ts --reporter=verbose` | 3 files · 33 passed |
| 워커 전체 `vitest run` | 4 files · 42 passed(28-03 의 34건 − 대체 2건 + 새 10건) |
| 실 export 4일 dry-run(CLI) | exit 0 · skipped 4종 빈 배열 · alert false · totals 99 · 39 · 40,626 · 253,247 · 542 · 216(28-03 과 같음) |
| env 없이 실적재 CLI | exit 1 + error 로그 `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set` |
| 수락 기준 grep | index.ts `limitup_record_skip` 4 · `alert` 12 / dispatch.test.ts `unchanged` 7 · `"schema"` 4 · `"sha"` 4 — 모두 ≥ 1 |
| `git diff -- workers/limit-up-sync` | 0줄(하이픈 워커 무변경 · Pitfall 12) |

## Decisions Made

frontmatter `key-decisions` 참고.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 막힘] `load.test.ts` 의 28-03 throw 기대 2건을 지웠다**
- **Found during:** Task 1 GREEN
- **Issue:** 28-03 `load.test.ts` 에 「sha256 불일치 → throw」 · 「모르는 schema_version → throw」 테스트가 있었다. 이 플랜이 바꾸는 동작이 바로 그것이라(throw 대신 skip) 두 건이 실패했다. `load.test.ts` 는 플랜 `files_modified` 에 없는 파일이다.
- **Fix:** 두 건을 지우고, dispatch.test.ts 가 같은 상황을 skip 으로 증명한다는 주석을 남겼다. 남는 `writeFileSync` import 도 지웠다. 정상 경로 4건 · stage/commit 오류 2건 · readNdjsonGz 1건은 그대로 둬서 회귀 없이 통과한다.
- **Files modified:** workers/limitup-sync/tests/load.test.ts
- **Commit:** f7f766ce

**2. [Rule 2 - 정합성] record_skip 반환값 검사**
- **Issue:** 플랜은 「반환 streak >= 3」 비교만 적었다. RPC 가 null 이나 정수가 아닌 값을 돌려주면 `null >= 3` 이 false 가 되어 알림이 조용히 사라진다.
- **Fix:** `Number.isInteger(streak)` 가 아니면 날짜 · 사유를 담아 throw → 종료 1.
- **Files modified:** workers/limitup-sync/src/index.ts
- **Commit:** f7f766ce

**3. [Rule 3 - 테스트 가능성] `main()` → `main(argv): Promise<number>`**
- **Issue:** 기존 `main()` 은 안에서 `process.exit` 을 불러서 종료 코드 규약을 테스트할 수 없었다.
- **Fix:** 종료 코드를 반환하게 바꾸고 export 했다. `process.exit` 은 CLI 가드(`void main().then((code) => process.exit(code))`)에서만 부른다. CLI 로 dry-run 해서 exit 0, env 없이 돌려서 exit 1 이 나오는 것을 확인했다.
- **Commit:** f7f766ce

**참고(편차 아님):** `fake-supabase.ts` 는 이미 select · rpc · insert 응답 주입을 일반형으로 지원했다. 플랜이 말한 주입 자리 3개는 이름 붙은 옵션으로 더했다(`loads` · `recordSkip` — insert error 는 기존 `insert` 자리). 같은 이름의 `select` · `rpc` 키를 주면 그쪽이 이기므로 기존 기록 · 응답 모양은 바뀌지 않았다.

**커밋 위치:** 일반 executor 의 HEAD 보호 검사는 master 를 보호 브랜치로 판정한다(`git.base-branch --is-protected master` → true). 그래도 오케스트레이터 지시(master 위 순차 실행 · branching_strategy none)와 사용자 규칙(「작업은 master 에서」)에 따라 28-01~05 처럼 master 에 커밋했다. push 는 하지 않았다.

**Total deviations:** 3 auto-fixed(Rule 3 2건 · Rule 2 1건). **Impact:** 결과 객체 · RPC 인자 · 로그 계약은 플랜과 같다. 늘어난 것은 거부 경로와 테스트 가능성뿐이다.

## Issues Encountered

- **streak 잔존(후속 판단 거리 — 28-06/28-08 참고):** 적재된 날짜(sig A, streak 0)가 운반 중 한 번 sha skip(streak 1, files_sig 는 A 그대로)된 뒤 다음 run 에서 다시 sig A 로 돌아오면 `unchanged` 로 넘어간다. 성공 commit 이 없으니 streak 는 1 로 남는다. 이후 그 날짜가 띄엄띄엄 두 번 더 skip 되면 연속이 아닌데도 3 이 되어 알림이 뜰 수 있다. 플랜 truth(「files_sig 같으면 commit 하지 않는다」)를 지키려고 그대로 두었다. 고친다면 「unchanged 이고 skip_streak > 0 이면 streak 를 0 으로 되돌리는 RPC」가 필요하다(마이그레이션 → 이 플랜 범위 밖). 실제로는 D+1 재export 뒤 보존 창 90일 안에서 같은 날짜가 세 번 막혀야 생기는 드문 경우다.
- 같은 시각 다른 세션이 master 에 `4d141470 docs(27)` 를 커밋했다. 그래서 `rev-list` 로 잰 커밋 수는 2 다(frontmatter 주석).

## Known Stubs

없음.

## User Setup Required

없음 — 원격 적용은 28-14 `supabase db push`, 워커 배포 · 알림 정책은 28-08 몫이다. 이 플랜은 커밋만 했다.

## Next Phase Readiness

28-06 을 진행할 수 있다. 결과 객체에 `grids` · `purged` 를 더하고, 날짜 루프 뒤에 파생 · 업로드 · 정리를 붙이고, `tests/dispatch.test.ts` 를 넓히면 된다. 테스트 하네스(`addDay` · `corrupt` · `fakeLogger` · `loadIndex`)는 그대로 쓸 수 있다.

## Self-Check: PASSED

- 파일 4개 존재: workers/limitup-sync/src/index.ts · tests/dispatch.test.ts · tests/helpers/fake-supabase.ts · tests/load.test.ts
- 커밋 `f7f766ce` 존재(`git log --oneline --all`)
- 수락 기준 grep 5개 재실행 모두 ≥ 1 · 워커 vitest failed 0
