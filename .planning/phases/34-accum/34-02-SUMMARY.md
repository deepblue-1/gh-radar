---
phase: 34-accum
plan: 02
status: complete
subsystem: infra
tags: [relay, supabase, kind16, accum, backfill, jsonl, cli, tracer, tdd]

requires:
  - phase: 34
    provides: "인박스 261020 「소급 목록 파일 형식」 23키 표 · RESEARCH §소급 스크립트(D-23) · Pitfall 16~18"
provides:
  - "relay/src/store/accum-backfill.ts — ACCUM_BACKFILL_KEYS(23키 · gh-trade EVENT_KEYS_REQUIRED 와 같은 집합) · KIND16_SELECT · Kind16Row · tradeDateOf · accumBackfillLineOf · exportAccumBackfillDay"
  - "exportAccumBackfillDay({ sb, date, outDir, force?, onPreview? }) → { path, rows, isins, missingSince, missingReg } — count(exact·head) 미리보기 → range 1000행 페이지 → 행 수 대조 → 임시 파일 rename"
  - "scripts/export-accum-backfill.ts — --date(반복 · 중복 제거) · --out(기본 ~/ticks/accum-backfill) · --force · --help(env 불필요)"
  - "scripts/export-accum-backfill.sh — 비출력 env 래퍼(ACCUM_BACKFILL_ENV_FILE · 기본 workers/master-sync/.env)"
affects: [34-11]

actuals:
  tokens: 9400
  tasks: 2
  commits: 4
plan_head_before: 6037c0c40862f30565327f21bf36363d39b479ef
plan_head_after: bec08c0805a015d928e09381b3ac69a689310f72

tech-stack:
  added: []
  patterns:
    - "운영 스크립트의 판정 · 조회 · 파일 쓰기는 relay/src/store 순수 모듈 + 가짜 Supabase 테스트로 잠그고, scripts/*.ts 는 인자 · env · 출력만(dma-users-migrate 선례 확장)"
    - "가짜 Supabase 빌더 — 체인 호출 기록 + thenable(head 면 count · 아니면 range 슬라이스)"

key-files:
  created:
    - relay/src/store/accum-backfill.ts
    - relay/tests/accum-backfill.test.ts
    - scripts/export-accum-backfill.ts
    - scripts/export-accum-backfill.sh
    - .planning/phases/34-accum/tdd-evidence/34-02-T1-red.json
  modified: []

key-decisions:
  - "소급 줄의 정수 칸은 null/비숫자를 0 으로 바꾼다 — 키가 빠지면 gh-trade 가 그 줄을 bad= 로 버리므로 23키를 항상 싣는다"
  - "exportAccumBackfillDay 에 onPreview 콜백 — CLI 가 페이지 조회 전에 미리보기 count 를 먼저 출력하게(D-23 「실행 전 행 수 미리보기」)"
  - "Kind16Row 의 bigint 칸은 number | string | null — PostgREST 가 큰 bigint 를 문자열로 줄 수 있어 Number 로 정규화"

patterns-established:
  - "RED 증거: vitest tap-flat 은 다중행 진단(Array/Object diff)을 내면 분류기가 Malformed TAP 으로 거부한다 → 같은 명령에 -t 로 대상 테스트만 재실행해 단일행 진단으로 기록"

requirements-completed: []

coverage:
  - id: D1
    description: "kind 16 한 행 → 23키 소급 줄 매핑(since/reg 문자열 · 앞 0 유지 · 결측 \"\" · th 셋째/snap_cum 결측 0)"
    verification:
      - kind: unit
        ref: "relay/tests/accum-backfill.test.ts#accumBackfillLineOf — 매핑 경계(Pitfall 17)"
        status: pass
      - kind: unit
        ref: "relay/tests/accum-backfill.test.ts#accumBackfillLineOf ↔ shared accumSignalOf 열 대응"
        status: pass
  - id: D2
    description: "한 날짜 내보내기 — 필터 · 정렬 · 1000+7 페이지 순회 · count 대조 실패 시 미작성 · 기존 파일 --force · 임시 파일 rename"
    verification:
      - kind: unit
        ref: "relay/tests/accum-backfill.test.ts#exportAccumBackfillDay — 한 날짜 경로(트레이서)"
        status: pass
  - id: D3
    description: "CLI · 비출력 래퍼 — --help env 없이 exit 0 · 인자/env 오류 exit 1 · 쓰기 호출 0"
    verification:
      - kind: other
        ref: "pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts --help; bash -n scripts/export-accum-backfill.sh"
        status: pass
  - id: D4
    description: "실 DB 10/19 · 10/20 내보내기 + gh-trade 전달"
    verification:
      - kind: manual_procedural
        ref: "34-11 메인 세션 — bash scripts/export-accum-backfill.sh --date 20261019 --date 20261020"
        status: unknown

duration: 5min
completed: 2026-10-20
---

# Phase 34 Plan 02: 매집감지 소급 내보내기 도구 Summary

**kind 16(KYOBO119) 행을 gh-trade `tickana.batch --accum-events` 입력용 23키 JSON lines 로 날짜별로 내보내는 읽기 전용 모듈 · CLI · 비출력 래퍼. count 미리보기, 1000행 페이지 순회, 행 수 대조, 원자적 파일 쓰기까지 가짜 Supabase 테스트 17건으로 잠갔다.**

## Performance

- **Duration:** 약 5분
- **Completed:** 2026-10-20
- **Tasks:** 2/2
- **Files:** 4개 생성(+ RED 증거 1)

## Accomplishments

- `accumBackfillLineOf` 는 인박스 표대로 23키를 매핑한다. `since_date` · `reg_time` 은 항상 문자열이다(reg=095720 → "095720", 못 읽으면 ""). `th_max_mcap_krw` 는 `th=` 셋째 값이고 없으면 0, `th_net_krw` · `th_min_same` 은 `snap_cum` 에서 오며 칸이 모자라면 0 이다.
- `exportAccumBackfillDay` 는 `kind=16 · gateway=KYOBO119 · trade_date=YYYY-MM-DD` 로 select 만 한다. head count 를 먼저 받고, `gw_time_ms · journal_epoch · seq` 순으로 `range(i, i+999)` 를 짧은 페이지가 나올 때까지 돈다. 읽은 행 수가 count 와 다르면 파일을 쓰지 않고 throw 한다. 쓸 때는 `<D>.jsonl.tmp-<pid>` 에 쓴 뒤 rename 한다.
- 라이브 `accumSignalOf`(shared)와 열 대응 21필드 + since/reg 표기를 대조하는 테스트를 넣었다. 소급 매핑과 장중 패널이 같은 열을 가리킨다는 증거다.
- CLI 는 날짜마다 「미리보기 N행」 줄과 「경로 · 행 · isin · since 결측 · reg 결측」 줄을 낸다(34-11 SUMMARY 기록용). 한 날짜가 실패해도 나머지는 계속하고 끝에 exit 1 이다.

## Task Commits

1. **Task 1 (tracer) RED** — `cfd5cc68` test(34-02): 소급 내보내기 한 날짜 경로 실패 테스트
2. **Task 1 (tracer) GREEN** — `6e447d3a` feat(34-02): kind 16 → 23키 소급 내보내기 함수
3. **Task 2 테스트** — `bb519380` test(34-02): 소급 매핑 경계 · accumSignalOf 열 대응 테스트
4. **Task 2 CLI · 래퍼** — `bec08c08` feat(34-02): 소급 내보내기 CLI · 비출력 래퍼

## TDD Gate Compliance

- **Task 1 RED:** 테스트 6건 + 타입만 있는 골격 모듈(동작 없음). 전체 실행에서 6/6 이 AssertionError 로 실패했다. 분류기 기록은 대상 「미리보기 count 1007 · 2페이지(1000 + 7) → 1,007줄 파일 …」 하나를 `-t` 로 재실행한 tap-flat 출력이다 → `RED_EVIDENCE_OK (target_test_failed)`. 증거 파일은 `.planning/phases/34-accum/tdd-evidence/34-02-T1-red.json` 이다.
  - semanticAssessment: 대상 테스트가 실행되어 계획한 단언(`res.path === <outDir>/20261019.jsonl`, :137)에서 실패했다. import · 구문 · 픽스처 오류가 아니다. 전체 실행 TAP 은 vitest 의 다중행 진단 때문에 분류기가 Malformed 로 거부해서 대상만 다시 돌렸다.
- **Task 1 GREEN:** 6/6 pass, typecheck · typecheck:tests exit 0.
- **Task 2 RED:** 바로 green(11/11 신규 pass)이었다. 원인을 확인했다. Task 1 action 이 경계 규칙(문자열 since/reg · "" 결측 · th/snap 0 · null→0)을 이미 지정했고, GREEN 이 그대로 구현했다. 테스트가 공허하지 않다는 것은 변이 3종(reg 원문 그대로 · `sell_krw←ev_qty_after` 뒤바꿈 · `Number(snap[1])` NaN)을 넣어 확인했다 → 4건 실패, 원복 후 diff 0. 그래서 이 커밋은 경계를 잠그는 테스트다(RED 증거 기록 없음).
- **REFACTOR:** 필요 없었다.

## Files Created/Modified

- `relay/src/store/accum-backfill.ts` — 23키 상수 · 매핑 · 날짜 내보내기(읽기 전용)
- `relay/tests/accum-backfill.test.ts` — 가짜 Supabase 빌더 · 테스트 17건
- `scripts/export-accum-backfill.ts` — CLI(--date 반복 · --out · --force · --help)
- `scripts/export-accum-backfill.sh` — 비출력 env 래퍼(100755)

## Verification

- `pnpm --filter @gh-radar/relay exec vitest run tests/accum-backfill.test.ts --maxWorkers=2` → Tests 17 passed (17)
- `pnpm --filter @gh-radar/relay run typecheck` · `run typecheck:tests` → exit 0
- `bash -n scripts/export-accum-backfill.sh` · `test -x` → OK
- `--help`(SUPABASE_* unset) → exit 0, 사용법에 `--date` 있음. env 없이 `--date` → 「env 가 비어 있습니다: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY」 exit 1(이름만). `--date 2026-10-19` → 형식 오류 exit 1. `--date` 없음 → exit 1
- `grep -nE '\.(insert|update|delete|upsert|rpc)\('` 스크립트 · 모듈 → 0줄
- 추가: scripts 는 어떤 tsconfig 도 보지 않아서 `tsc --noEmit --strict` 로 CLI 를 한 번 타입검사했다 → OK
- 실 DB 실행은 하지 않았다(34-11 메인 세션 몫).

## Decisions Made

- 정수 칸은 null/비숫자를 0 으로 바꾼다. 키를 빼면 gh-trade 가 그 줄을 `bad=` 로 버리기 때문이다.
- `onPreview` 콜백을 더했다. 미리보기 count 를 페이지 조회 전에 출력하려는 것이다.
- `--date` 값이 다음 `--` 인자처럼 보이면 「값이 없습니다」 로 거부한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RED 커밋에 골격 모듈 포함**
- **Found during:** Task 1 RED
- **Issue:** 플랜은 RED 커밋을 「테스트만」 으로 적었다. 하지만 없는 모듈을 import 하면 로드 실패이고, TDD 게이트는 이것을 INVALID_RED(fixture_or_load_failure)로 본다.
- **Fix:** 타입 · 시그니처만 있고 빈 값을 돌려주는 골격 `accum-backfill.ts` 를 RED 커밋에 함께 넣었다. 그래서 RED 가 단언 실패로 성립한다.
- **Files modified:** relay/src/store/accum-backfill.ts
- **Commit:** cfd5cc68

**2. [실행 환경] master 직접 커밋**
- gsd-tools `git.base-branch --is-protected master` 는 true 를 낸다. 그래도 오케스트레이터가 이 실행기를 master 순차 실행기로 명시했고, 34-01 도 master 에 커밋했으며, 프로젝트 관례도 master 작업이다. 그래서 master 에 경로 지정 커밋을 했다(push 없음).

**3. 검증 명령 미세 조정**
- 프롬프트의 `--minWorkers=1` 은 vitest 4.1.4 가 모르는 옵션이다(CACError). 그래서 `--maxWorkers=2` 만 썼다.

## Issues Encountered

- vitest `tap` / `tap-flat` reporter 는 diff 가 여러 줄인 실패를 내면 gsd 분류기가 「Non-TAP data / Malformed TAP」 으로 거부한다. 같은 명령에 `-t <대상>` 을 붙여 재실행하는 것으로 해결했다(patterns-established 참고).

## User Setup Required

없음. 실행은 34-11 에서 한다: `bash scripts/export-accum-backfill.sh --date 20261019 --date 20261020`. Bash 훅이 env 파일 source 를 막으면 사용자 `!` 실행으로 넘긴다(RESEARCH Pitfall 18).

## Next Phase Readiness

- 34-11: 래퍼를 한 줄 실행한 뒤 출력의 「경로 · 행 · isin · since/reg 결측」 을 SUMMARY 에 남기고 gh-trade 세션에 전달한다. 미리보기 count 가 0 이면 그 날짜의 kind 16 저장 여부(30일 purge 범위 · 10/18 마이그레이션 이후)를 먼저 확인한다.

## Self-Check: PASSED

- FOUND: relay/src/store/accum-backfill.ts · relay/tests/accum-backfill.test.ts · scripts/export-accum-backfill.ts · scripts/export-accum-backfill.sh · .planning/phases/34-accum/tdd-evidence/34-02-T1-red.json
- FOUND commits: cfd5cc68 · 6e447d3a · bb519380 · bec08c08 (rev-list count 6037c0c4..HEAD = 4)
