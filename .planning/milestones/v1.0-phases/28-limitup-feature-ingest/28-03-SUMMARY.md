---
phase: 28-limitup-feature-ingest
plan: 03
subsystem: database · workers (limitup-sync 밤 적재 트레이서)
tags: [supabase, pgtap, rpc, jsonb, rls, cloud-run-job, worker, ndjson, gzip, sha256, limit-feature]
status: complete

requires:
  - phase: 28-limitup-feature-ingest
    provides: "28-02 마이그레이션 20261006090000(이 플랜 타임스탬프는 그 뒤 090100 · 090200)"
provides:
  - "표 10개: limitup_entries · limitup_locks · limitup_jumps · limitup_member_alloc · limitup_facts · limitup_touches(인박스 (C) 열 그대로) + limitup_stage · limitup_loads · limitup_grid_summary · limitup_member_daily"
  - "RPC limitup_stage_clear(text) → integer · limitup_commit_day(text, text, text, integer, jsonb) → jsonb · limitup_record_skip(text, text) → integer (service_role 전용)"
  - "워커 패키지 @gh-radar/limitup-sync — dispatch({ dryRun, now }) · loadConfig({ dryRun }) · listExportDates · readManifest · filesSig · sha256File · verifyFiles · readNdjsonGz · stageDay · commitDay · KNOWN_SCHEMA_VERSION = 1"
  - "픽스처 workers/limitup-sync/tests/fixtures/export/20261002(종목 3개) + make-fixture.mjs · 가짜 Supabase(tests/helpers/fake-supabase.ts — storage 자리 포함)"
affects: [28-06, 28-08, 28-09, 28-14, 28-16]

plan_head_before: d33c8bc0abe490f36a090b7dbab3a0a263cd0840
actuals:
  tokens: 20500   # chars/4 over 추가 줄(81,890자 — pnpm-lock · .gz 제외)
  tasks: 1
  commits: 1      # MEASURED: git rev-list --count d33c8bc0..HEAD (SUMMARY 커밋 전)

tech-stack:
  added: []
  patterns:
    - "날짜 원자 교체 = stage 표(payload jsonb 원문) + commit RPC 1회 — PostgREST 요청 간 트랜잭션 부재를 함수 하나로 메운다"
    - "jsonb_populate_record(NULL::public.<표>, payload) 정적 문장 8쌍 — 동적 SQL · format('%I') 없음"
    - "「바뀐 날짜」 판정 키 files_sig = files[] name 정렬 `name:sha256\\n` 의 sha256(manifest finished_at 무시)"
    - "워커 CLI 가드 /index\\.(js|ts)$/ — node dist · tsx dry-run 둘 다"

key-files:
  created:
    - supabase/migrations/20261006090100_limitup_tables.sql
    - supabase/migrations/20261006090200_limitup_load_rpcs.sql
    - supabase/tests/limitup_load.test.sql
    - workers/limitup-sync/package.json
    - workers/limitup-sync/tsconfig.json
    - workers/limitup-sync/vitest.config.ts
    - workers/limitup-sync/src/config.ts
    - workers/limitup-sync/src/logger.ts
    - workers/limitup-sync/src/services/supabase.ts
    - workers/limitup-sync/src/manifest.ts
    - workers/limitup-sync/src/load.ts
    - workers/limitup-sync/src/index.ts
    - workers/limitup-sync/tests/config.test.ts
    - workers/limitup-sync/tests/manifest.test.ts
    - workers/limitup-sync/tests/load.test.ts
    - workers/limitup-sync/tests/helpers/fake-supabase.ts
    - workers/limitup-sync/tests/fixtures/make-fixture.mjs
    - workers/limitup-sync/tests/fixtures/export/20261002/ (manifest.json · 6 ndjson.gz · grid 3개)
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "limitup_commit_day 한 번이 그날 8표를 한 트랜잭션으로 교체한다 — 표별 stage 수 ≠ 기대 수(키 없으면 0) 또는 payload date ≠ p_date 면 예외로 전부 되돌려 기존 행이 남는다. DELETE 후 INSERT 라 재처리로 줄어든 행이 남지 않는다(D-14 · D-17)"
  - "표 10개 RLS + 정책 0 + PUBLIC · anon · authenticated 명시 REVOKE + service_role GRANT, RPC 3개도 같은 3줄 — server 경유 읽기만(D-15)"
  - "limitup_loads.files_sig IS NULL = 「적재 안 됨」(skip 만 기록) · record_skip 은 files_sig 를 건드리지 않고 streak 만 올린다 · 성공 commit 이 0 으로(D-20 DB 절반)"
  - "워커는 이 플랜에서 정상 경로만 — 깨진 manifest · 모르는 schema_version · sha 불일치 · 행 수 ≠ manifest rows 는 사유를 담아 throw → main 이 error 로그 + 종료 1. skip 전환 · 바뀐 날짜만 · 3연속 종료 코드는 28-16"
  - "숫자 env 4개는 양의 정수만 허용(Number.isFinite + isInteger + > 0) — 잘못된 값을 조용히 기본값으로 바꾸지 않는다"

patterns-established:
  - "적재 워커 테스트 = 가짜 Supabase 호출 기록(순서 · 인자) + DB 쪽 pgTAP 이 같은 stage → commit 계약을 각자 증명"

requirements-completed: [D-14, D-15, D-17, D-20]

coverage:
  - id: D1
    description: "표 10개 DDL · 잠금 — 6표 열 = 실 export 첫 행 키(순서 포함) · 예약어 열 · RLS · 정책 0 · GIN 0 · anon/authenticated 불가 · service_role 가능"
    requirement: D-15
    verification:
      - kind: integration
        ref: "supabase/tests/limitup_load.test.sql#F (bash scripts/verify-dma-orders-price-check.sh --test …) — 81건"
        status: pass
      - kind: command
        ref: "DDL 열 목록 ↔ ~/ticks/research/export/20261002/<표>.ndjson.gz 첫 행 키 대조 6표 OK · 4일 전 행 타입 스캔 ALL TYPES OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "limitup_commit_day 날짜 원자 교체 — 8표 삽입 · 예약어/배열 열 · 이력 · stage 비움 · 재적재 축소 · 기대 수/날짜 불일치 예외 시 기존 행 보존"
    requirement: D-17
    verification:
      - kind: integration
        ref: "supabase/tests/limitup_load.test.sql#A-D,G — 29건"
        status: pass
      - kind: integration
        ref: "로컬 일회용 컨테이너에 실 export 4일 stage(294,769행 COPY) → commit 4회 → 6표 합계 99 · 39 · 40,626 · 253,247 · 542 · 216 · stage 0 · loads 4"
        status: pass
    human_judgment: false
  - id: D3
    description: "skip streak — record_skip 1 · 2 · 3 → 성공 commit 0 · skip 은 files_sig 불변"
    requirement: D-20
    verification:
      - kind: integration
        ref: "supabase/tests/limitup_load.test.sql#E — 8건"
        status: pass
    human_judgment: false
  - id: D4
    description: "워커 핵심 경로 — dispatch 호출 순서 select loads → rpc stage_clear → insert stage × k → rpc commit 1회 · 표별 stage 합 == manifest rows · 청크 env · expected 6키 · p_files_sig == filesSig · dry-run 무접촉 · 보존 창 · 예외 throw"
    requirement: D-14
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/{config,manifest,load}.test.ts — vitest 34건"
        status: pass
      - kind: command
        ref: "LIMITUP_EXPORT_DIR=$HOME/ticks/research/export LIMITUP_KEEP_DAYS=3650 pnpm --filter @gh-radar/limitup-sync exec tsx src/index.ts --dry-run → totals = 인박스 숫자"
        status: pass
    human_judgment: false

duration: 10 min
completed: 2026-10-05
---

# Phase 28 Plan 03: 밤 적재 트레이서 Summary

**gh-trade 밤 export 하루가 stage 표 → `limitup_commit_day` 한 번으로 Supabase limitup 6표(+ 파생 2)에 원자 교체된다 — 로컬 pgTAP 118건 · 워커 vitest 34건 · 실 export 4일 dry-run 과 실 DB 적재 합계가 인박스 숫자와 일치.**

## Performance

- **Duration:** 약 10분
- **Started:** 2026-10-05T08:42:00Z
- **Completed:** 2026-10-05T08:52:30Z
- **Tasks:** 1 (tracer)
- **Files modified:** 28 (손으로 쓴 파일 17 · 픽스처 생성물 10 · pnpm-lock 1)
- **TASK_BASE:** `d33c8bc0` — `git diff --name-only d33c8bc0..HEAD -- workers/limit-up-sync` 0줄(기존 하이픈 워커 무변경 · Pitfall 12)

## Accomplishments

- 표 10개 마이그레이션(`20261006090100`) — 6표 열은 실 export 첫 행 키와 순서까지 1:1(스크립트 대조), 4일 전 행의 값 타입이 DDL 타입과 맞음(정수 열에 비정수 0건).
- RPC 3개(`20261006090200`) — commit 은 동적 SQL 없이 정적 8쌍, 함수 하나가 한 트랜잭션.
- 워커 `@gh-radar/limitup-sync` 핵심 경로 — manifest → sha 대조 → 행 수 대조 → stage 청크 → commit 1회, `--dry-run`.
- 픽스처 하루(종목 3개, 448KB) + 재생성 스크립트.

## Task Commits

1. **Task 1: 트레이서 — limitup 표 10개 · commit RPC · pgTAP + 워커 핵심 경로 · 픽스처 · 실데이터 dry-run** — `5ea22b16` (feat)

트레이서 게이트: auto 모드 아님 · `human_verify_mode` 기본 end-of-phase · `<verify>` 자동만 → verify 3개 재실행 통과(⚡ Tracer verified end-to-end). 이 플랜에는 확장 태스크가 없다(확장은 28-16).

## 검증 결과

| 검증 | 결과 |
|---|---|
| RED: `--until 20261006090000 --test limitup_load.test.sql` | FAIL(`relation "public.limitup_stage" does not exist`) — 의도된 RED |
| GREEN: `verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` | 55 마이그레이션 재생 · `1..118` · ok 118 · `# RESULT: PASS` |
| `pnpm --filter @gh-radar/limitup-sync run typecheck` | 오류 0 |
| `vitest run --reporter=verbose` | 3 files · 34 passed |
| 실 export 4일 dry-run | 아래 출력 — 6개 합계 grep 전부 통과 |
| (추가) 실 export 4일 로컬 DB 적재 | stage 294,769행 COPY → commit 4회(합 7.6초) → 6표 99 · 39 · 40,626 · 253,247 · 542 · 216, stage 0, loads 4, `"foreign"` true 1,753행 |

dry-run 합계 출력(그대로):

```
"rows":{"20260929":{"entries":20,"locks":12,"jumps":1135,"member_alloc":49847,"facts":128,"touches":108},
        "20260930":{"entries":23,"locks":10,"jumps":18576,"member_alloc":79220,"facts":134,"touches":45},
        "20261001":{"entries":27,"locks":5,"jumps":11684,"member_alloc":61971,"facts":111,"touches":32},
        "20261002":{"entries":29,"locks":12,"jumps":9231,"member_alloc":62209,"facts":169,"touches":31}},
"totals":{"entries":99,"locks":39,"jumps":40626,"member_alloc":253247,"facts":542,"touches":216}
```

pgTAP plan 수 118 = A 첫 commit 16 · B 재적재 축소 6 · C 기대 수 불일치 3 · D payload date 불일치 3 · E skip streak 8 · G 날짜 형식 1 · F 권한 81(10표 × 6 권한 60 · 3 RPC × 3 역할 9 · RLS 10 · 정책 0 · GIN 0).

## 픽스처

`workers/limitup-sync/tests/fixtures/export/20261002/` — 합계 **448KB**(`du -sk`), 각 범주에서 격자 파일이 가장 작은 종목:

| ISIN | 종목 | 고른 이유 | 격자 |
|---|---|---|---|
| KR7263600009 | 덕우전자 | 깨진 잠김(locks lock_id 1 broke = true) | 58,842B · 3,013점 |
| KR7069920007 | 엑시온그룹 | 깨짐 없이 잠김 유지(lock_id 2 유지) | 156,261B · 16,143점 |
| KR7308100007 | 형지글로벌 | 미도달(reached = false) — 일반 주식이라 창구 행이 있다(623) | 35,217B · 3,241점 |

행 수: entries 3 · locks 2 · jumps 359 · member_alloc 4,926 · facts 24 · touches 3. manifest 는 원본 키 그대로 · files 9개(6표 + 격자 3) rows · sha256 재계산.

## pnpm-lock 새 외부 패키지 0 근거

`git diff pnpm-lock.yaml` 은 `importers:` 에 `workers/limitup-sync:` 블록 25줄 추가뿐이다 — 7개 의존이 모두 기존 워커와 같은 해석 버전(`@supabase/supabase-js 2.103.2` · `dotenv 16.6.1` · `pino 9.14.0` · `@types/node 22.19.17` · `tsx 4.21.0` · `typescript 5.9.3` · `vitest 3.2.4`)이고 `packages:`/`snapshots:` 항목 추가 0(`+…resolution` 줄 0). `pnpm install` 로그 `downloaded 0, added 0`.

## Decisions Made

frontmatter `key-decisions` 참고. 요지: commit 원자성 · 정적 SQL · 잠금 3/4줄 · files_sig null = 미적재 · 정상 경로만(예외 종료 1) · 숫자 env 양의 정수.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정합성] 워커가 ndjson 실제 행 수를 manifest rows 와 대조**
- **Found during:** Task 1 ⑦
- **Issue:** 플랜은 commit RPC 의 stage 수 대조만 적었지만 dry-run 은 DB 를 안 거치므로 행 수 불일치(잘린 파일 등)를 못 잡는다.
- **Fix:** 6표 읽기 직후 `rows.length !== manifest rows` 면 사유를 담아 throw(dry-run · 실적재 공통).
- **Files modified:** workers/limitup-sync/src/index.ts
- **Commit:** 5ea22b16

**2. [Rule 2 - 보안] manifest `files[].name` 경로 탈출 거부**
- **Found during:** Task 1 ⑤
- **Issue:** `name` 을 그대로 `join(dir, date, name)` 하면 `../` 로 날짜 디렉터리 밖을 읽을 수 있다.
- **Fix:** `readManifest` 가 상대 경로 문자 집합 · `..` 세그먼트 · sha256 64hex · rows 정수 ≥ 0 을 검사해 `{ ok: false, reason }`. 테스트 1건.
- **Files modified:** workers/limitup-sync/src/manifest.ts, tests/manifest.test.ts
- **Commit:** 5ea22b16

**3. [Rule 2 - 정합성] commit RPC 입력 검사**
- **Issue:** `p_date` 형식 · `p_files_sig` 빈 값 · `p_expected` 가 객체가 아님을 거르지 않으면 이력에 깨진 날짜 키 · null sig(= 「적재 안 됨」 으로 오판)가 남을 수 있다.
- **Fix:** 세 경우 예외. pgTAP G 1건.
- **Files modified:** supabase/migrations/20261006090200_limitup_load_rpcs.sql
- **Commit:** 5ea22b16

**Total deviations:** 3 auto-fixed(모두 Rule 2). **Impact:** 계약 · 인자 · 표 모양 변화 없음 — 거부 경로만 늘었다.

## Issues Encountered

- 테스트 기대값 계산 실수(KST 10-05 − 90일 = 20260707, 처음에 0706 으로 적음) — 테스트만 고침.
- 수락 기준 grep `"foreign" boolean` 이 정렬 공백 때문에 0 → DDL 정렬 공백만 줄여 1(의미 변화 없음, pgTAP 재통과).

## 후속 플랜이 알아야 할 것

- **PostgREST statement_timeout 8초(위험 — 28-08 smoke · 28-14 확인 대상).** 로컬 Supabase 이미지 `authenticator` 역할에 `statement_timeout=8s` 가 있고 `service_role` 에는 따로 설정이 없다 → service_role RPC 도 8초 제한을 받는다. 로컬 실측 commit 4일 합 7.6초(가장 큰 날 20260930 = member_alloc 79,220 + jumps 18,576 행 · 대략 2~3초). 하루 단위 호출이라 지금은 여유가 있지만 원격 CPU 가 느리거나 member_alloc 이 크게 늘면 넘을 수 있다 — 28-08 smoke 에서 실제 commit 시간을 로그로 보고, 넘으면 `ALTER ROLE service_role SET statement_timeout` 이 아니라 표 단위 commit 분할 등 별도 결정(Rule 4 성격).
- 원본 데이터 특성: entries 99행 중 20행은 `short_code` · `name` 이 null(export 원문 그대로 — 20260929 등). 보고서(28-10)는 null 이름을 처리해야 한다.
- `limitup_loads` select 결과(prevSig)는 지금 로그(`replaced` · `sigChanged`)에만 쓴다 — 「같으면 넘어감」 판정은 28-16.
- 가짜 Supabase 는 `storage.from(b).upload/list/remove` 를 기록만 한다 — 28-06 격자 업로드 테스트가 그대로 쓸 수 있다.
- 워커에는 아직 Dockerfile 이 없다(28-08 배포 한 벌 몫).

## Known Stubs

없음 — 파생 2표(grid_summary · member_daily)는 DDL · commit 경로만 있고 값은 28-06 이 채운다(플랜 계약상 의도된 빈 자리이며 UI 에 흐르지 않는다).

## Next Phase Readiness

Ready for 28-04. 원격 DB 적용은 28-14 `supabase db push`, 워커 배포는 28-08 — 이 플랜은 커밋만.

## Self-Check: PASSED

- 생성 파일 18개(디렉터리 포함) 존재 확인 · 커밋 `5ea22b16` 존재 확인.
- 수락 기준 7개 재실행 전부 통과: CREATE TABLE 10 · `"foreign" boolean` 1 · `"values" jsonb` 1 · `REVOKE ALL ON TABLE public.limitup_` 20 · `USING gin` 0 · `jsonb_populate_record(NULL::public.limitup_` 9 · `FROM anon, authenticated` 3 · 패키지명 1 · `passWithNoTests: false` 1 · 픽스처 manifest 존재 · 448KB ≤ 1024 · limit-up-sync diff 0줄.
