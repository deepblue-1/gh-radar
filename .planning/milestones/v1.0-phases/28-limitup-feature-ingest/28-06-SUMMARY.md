---
phase: 28-limitup-feature-ingest
plan: 06
subsystem: workers (limitup-sync 파생 · 격자 업로드 · 보존 정리) · database
tags: [worker, supabase, storage, pgtap, rpc, retention, golden, gh-trade, limit-feature]
status: complete

requires:
  - phase: 28-limitup-feature-ingest
    provides: "28-03 표 10개 · limitup_commit_day(8표 기대 수) · 워커 핵심 경로 · 픽스처 20261002 · 가짜 Supabase storage 자리"
  - phase: 28-limitup-feature-ingest
    provides: "28-16 skip 규칙 · DispatchResult(skipped · alert) · dispatch.test.ts 하네스(addDay · corrupt · fakeLogger · loadIndex)"
  - phase: 28-limitup-feature-ingest
    provides: "28-02 dma_strategy_events_purge_limit_feature(integer) → integer"
provides:
  - "derive.ts — kstSecOfDay(ms) · gridSummaryOf(date, grid, locks) · memberTopShares(alloc, side, loMs, hiMs) · memberDailyOf(date, entries, locks, alloc) · type GridJson · GridSummaryRow · MemberDailyRow"
  - "grid.ts — GRID_BUCKET('limitup-grid') · GRID_NAME_RE · gridObjectPath · readGridGz(path) → { bytes, json } · uploadGrids(sb, date, grids)"
  - "purge.ts — purgeOld(sb, { keepDays, allocKeepDays, kind15KeepDays, now }) → { tables, storageDates, kind15 } · kstYmdDaysAgo(이동, index 에서 재수출)"
  - "DispatchResult 확장 — rows/totals 8키(6표 + grid_summary · member_daily) · grids(격자 수) · purged(PurgeResult | null)"
  - "RPC limitup_purge_old(integer, integer) → jsonb { cutoff, alloc_cutoff, deleted: { 표: 수 } } · Storage 버킷 limitup-grid(private · 10MB · application/gzip · 정책 0)"
  - "골든 make-golden.py → export/20261002/expected-derive.json(member_daily 9 · grid_summary 3)"
affects: [28-08, 28-10, 28-14]

plan_head_before: a33218d38081b8092eede28f0b4df040f524b909
actuals:
  tokens: 18000   # chars/4 over 추가 줄(72,192자)
  tasks: 2
  commits: 2      # MEASURED: git rev-list --count a33218d3..HEAD (SUMMARY 커밋 전)

tech-stack:
  added: []
  patterns:
    - "파생 정의 = 외부(gh-trade) Python 함수를 venv 로 import 해 만든 골든 JSON 과 TS 결과를 1e-9 로 대조"
    - "격자 업로드는 commit 앞 — 업로드 실패면 commit 0(「적재됐는데 격자 없음」 차단), commit 실패면 이력 미갱신이라 다음 run 이 통째 재시도"
    - "보존 경계 한 식 — 워커 적재 창 `date >= KST 오늘 − keep` 과 정리 `date < KST 오늘 − keep` 이 같은 kstYmdDaysAgo"

key-files:
  created:
    - supabase/migrations/20261006090300_limitup_retention_storage.sql
    - workers/limitup-sync/src/derive.ts
    - workers/limitup-sync/src/grid.ts
    - workers/limitup-sync/src/purge.ts
    - workers/limitup-sync/tests/derive.test.ts
    - workers/limitup-sync/tests/grid.test.ts
    - workers/limitup-sync/tests/purge.test.ts
    - workers/limitup-sync/tests/fixtures/make-golden.py
    - workers/limitup-sync/tests/fixtures/export/20261002/expected-derive.json
  modified:
    - workers/limitup-sync/src/index.ts
    - supabase/tests/limitup_load.test.sql
    - workers/limitup-sync/tests/dispatch.test.ts
    - workers/limitup-sync/tests/helpers/fake-supabase.ts
    - workers/limitup-sync/tests/load.test.ts

key-decisions:
  - "28-06: 창구 비중 가중 곱셈은 실수(float) — gh-trade facts.member_top 의 int64 곱셈(d_value × 겹침 ns)이 6e19 급에서 감겨(wrap) 비중이 틀린다. 정의(docstring)대로 계산하고 골든도 같은 보정(member_top_f64)으로 만들었다. gh-trade 가 곱셈 한 줄을 고치면 두 쪽 숫자가 같아진다(gh-trade 에 알릴 것)"
  - "28-06: limitup_purge_old 는 보존 일수 1 미만 · NULL 을 예외로 거부한다(0 이면 오늘 이전 전부 삭제) · 반환 { cutoff, alloc_cutoff, deleted }"
  - "28-06: 격자 JSON date ≠ 적재 날짜 · 파일 이름 isin ≠ JSON isin 이면 throw(gh-trade 계약 위반 — skip 아님)"
  - "28-06: Storage 폴더 정리는 폴더당 list 1,000개 1회 — 남으면 그 폴더는 여전히 cutoff 이전이라 다음 run 이 마저 지운다(무한 루프 방지)"
  - "28-06: 정리 실패 = error `limitup purge failed — 적재는 끝남`({ loaded, grids, err }) + throw → 종료 1. 업로드 실패 run 은 정리까지 가지 않는다"

patterns-established:
  - "가짜 Supabase 의 storage 응답 주입(storage: (bucket, op, args) => Resp) · 정리 RPC 2개 기본 응답(실 RPC 모양)"

requirements-completed: [D-08, D-14, D-16, D-17, D-19]

coverage:
  - id: D1
    description: "파생 2표 계산(D-17) — grid_summary(q_krw 스파크 · sec0 · step_s · 최대 잔량 · +60초 매도) · member_daily(창구 기여분 sum/cnt) 가 gh-trade 정의 골든과 같다"
    requirement: D-17
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/derive.test.ts — 14건(골든 대조 · fine 점 규칙 · 동률 · 겹침 가중 · lock_buy 0.0 · 선행 동률 · anchor 순서)"
        status: pass
      - kind: other
        ref: "실 export 4일(20260929~20261002) Python(make-golden 같은 식) ↔ TS 대조 일회성 vitest — 창구 64행 · 격자 99행 전부 1e-9 일치(커밋 안 함)"
        status: pass
    human_judgment: false
  - id: D2
    description: "격자 업로드(D-14) — limitup-grid/grid/<date>/<isin>.json.gz · application/gzip · upsert · 바이트 그대로 · commit 앞 · 업로드 error 면 commit 0 · throw"
    requirement: D-14
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/grid.test.ts — 4건"
        status: pass
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#업로드 → stage → commit 순서: stage_clear → upload × 3 → stage insert(6표 + 파생 2) → commit_day(8키) → 정리"
        status: pass
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#업로드 error 면 commit 0회 · dispatch throw(사유에 경로) · 정리도 안 한다(다음 run 이 날짜를 다시 한다)"
        status: pass
    human_judgment: false
  - id: D3
    description: "보존 정리(D-16 · D-19) — limitup_purge_old(90, 30): 91일 전 표 5 · 파생 2 · 이력 · stage 삭제 / 89일 전 남김 · member_alloc 31일 전 삭제 / 29일 전 남김 · 권한 service_role 전용 · Storage 폴더 cutoff 이전만"
    requirement: D-19
    verification:
      - kind: integration
        ref: "supabase/tests/limitup_load.test.sql#H (bash scripts/verify-dma-orders-price-check.sh --test …) — 1..145 · # RESULT: PASS"
        status: pass
      - kind: unit
        ref: "workers/limitup-sync/tests/purge.test.ts — 5건 · dispatch.test.ts#날짜 0개여도 limitup_purge_old { 90, 30 } 1회 …"
        status: pass
    human_judgment: false
  - id: D4
    description: "kind 15 30일 purge(D-08) — run 끝 dma_strategy_events_purge_limit_feature { p_keep_days: KIND15_KEEP_DAYS } 1회 · 정리 오류는 종료 1"
    requirement: D-08
    verification:
      - kind: unit
        ref: "workers/limitup-sync/tests/dispatch.test.ts#LIMITUP_ALLOC_KEEP_DAYS · KIND15_KEEP_DAYS env 를 RPC 인자로 · #정리 RPC error → … main 종료 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "원격 버킷 생성 · 원격 RPC — 로컬 재생 이미지에는 storage 스키마가 없어 버킷 삽입은 가드로 건너뛴다. 원격 적용 · 실제 업로드는 28-14 push · 28-08 배포 뒤 확인"
    requirement: D-14
    verification: []
    human_judgment: true
    rationale: "원격 Supabase(storage.buckets 존재) 적용과 실제 Storage 업로드는 이 플랜에서 실행 금지(커밋만) — 28-14 push 후 버킷 존재 · 28-08 smoke 에서 업로드/서명 URL 확인 필요"

duration: 13 min
completed: 2026-10-05
---

# Phase 28 Plan 06: 파생 2표 · 격자 업로드 · 보존 정리 Summary

**limitup-sync 가 날짜마다 gh-trade 정의 그대로의 파생 2표(스파크 · 최대 잔량 · +60초 매도 · 창구 기여분)를 계산해 같은 commit 으로 교체하고, 격자 파일을 비공개 버킷 `limitup-grid` 에 commit 앞에서 올리며, run 끝에 90/30일 보존 정리와 kind 15 30일 purge 를 한다. 골든 대조 중 gh-trade `member_top` 의 int64 곱셈 넘침을 발견했다(아래).**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-10-05T09:22:47Z
- **Completed:** 2026-10-05T09:36:14Z
- **Tasks:** 2
- **Files modified:** 14(새 파일 9 · 수정 5)

## Accomplishments

- `derive.ts` — `report.py` `_sec` · `_sell_share_after` · `_anchor_ns` · `fingerprint_agg` 와 `facts.py` `member_top` 을 TS 로 옮겼다. 픽스처 골든과 1e-9 안에서 같고, 실 export 4일(창구 64행 · 격자 99행)도 Python 과 전부 같다.
- 날짜 처리 순서: 격자 읽기 → 파생 → `limitup_stage_clear` → 격자 업로드 × N → stage(6표 + grid_summary + member_daily) → `limitup_commit_day`(기대 수 8키).
- run 끝(날짜 0개여도): `limitup_purge_old(90, 30)` → Storage `grid/<date>/` 중 cutoff 이전 폴더 삭제 → `dma_strategy_events_purge_limit_feature(30)`. 결과는 `purged` 에 담긴다.
- 마이그레이션 `20261006090300`: 정리 RPC(service_role 전용, 보존 일수 1 미만 거부)와 버킷 `limitup-grid`(private · 10MB · application/gzip · 정책 0개 · `to_regclass('storage.buckets')` 가드).

## Task Commits

1. **Task 1: 파생 계산 — gridSummaryOf · memberDailyOf (gh-trade 정의 동형) + venv 골든** — `5221f7c9` (feat)
2. **Task 2: 배선 — 파생 stage · 격자 업로드(commit 앞) · 90/30일 정리 RPC + Storage 폴더 정리 · kind 15 30일 purge · 버킷 마이그레이션** — `4407912a` (feat)

## 골든

- 생성 명령: `/Users/alex/repos/gh-trade/server/tools/analysis/.venv/bin/python workers/limitup-sync/tests/fixtures/make-golden.py`(CI 에서 돌리지 않는다. 출력 JSON 을 커밋했다)
- gh-trade HEAD: `6766a064`(파일은 읽기만 했다)
- 출력 `expected-derive.json`: member_daily 9행, grid_summary 3행.

| ISIN | 종목 | q_max_krw | q_max_ms | sell_share_60s |
|---|---|---|---|---|
| KR7069920007 | 엑시온그룹(유지) | 2,346,454,647 | 1790919446000 | 0.24605858595688773 |
| KR7263600009 | 덕우전자(깨짐) | 3,705,287,310 | 1790899426000 | 0.7826114495641058 |
| KR7308100007 | 형지글로벌(미도달) | 365,176,832 | 1790921507000 | null |

## gh-trade `member_top` int64 넘침 — gh-trade 에 알려야 한다

- **증상:** `facts.member_top` 은 `w = a["d_value"].astype("int64").to_numpy() * ov / np.maximum(e - s, 1)` 로 가중치를 구한다. 여기서 `ov` 는 겹친 길이(ns, int64)다. d_value 가 10억 원 급이고 겹침이 60초(6e10 ns)면 곱이 6e19 가 되어 int64 상한 9.2e18 을 넘는다. numpy 는 경고 없이 값을 감는다. 픽스처에서 나온 곱의 최댓값은 6.48e19 였다.
- **영향:** 같은 날의 창구 비중이 틀린다. 픽스처 하루에서 창구 5곳의 entry · lock_buy · pre_sell 합이 달라지고, 00050 은 n 이 5에서 4로, 00002 와 00050 은 lead 가 뒤바뀐다. 실 export 4일에서는 날마다 9~16곳이 갈린다. 이 함수를 같이 쓰는 C 지문표(`fingerprint_agg`)와 facts 의 `member_entry_buy` · `member_prebreak_sell` 문장이 영향을 받을 수 있다.
- **처리:** gh-radar 는 정의(「d_value 를 겹친 길이 ÷ 구간 길이로 가중」)대로 실수 곱셈을 한다. 골든은 gh-trade `fingerprint_agg` 를 그대로 부르되, `tickana.report.member_top` 만 곱셈을 float64 로 바꾼 `member_top_f64` 로 끼워 만든다. 원본 int64 와 갈리는 창구는 스크립트가 stderr 에 찍는다. gh-trade 가 `.astype("float64")` 한 줄을 고치면 두 쪽 숫자가 같아진다.
- **남은 일:** gh-trade 쪽에 노트를 남길지는 메인 세션이 정한다. executor 는 gh-trade 저장소를 건드리지 않았다.

## 파생 정의 대조

| 항목 | gh-trade 원문 | TS | 대조 |
|---|---|---|---|
| s0 | `_sec(min start_ns)` | `kstSecOfDay(min start_ms)`(내림) | 테스트 50228 |
| +60초 매도 | `sec > s0 · ≤ s0+60 · (sec−s0)%10==0` 의 sell ÷ (sell+buy), 합 0 이면 None | 같다. fine 점만 쓰고, 같은 sec 가 둘이면 먼저 나온 것 | 골든 3종목 |
| 최대 잔량 | `max(q_krw) FROM grid` | coarse ∪ fine 최대. q_max_ms 는 동률일 때 이른 t_ms | 골든 3종목 |
| 겹침 가중 | `d_value × ov / max(e−s, 1)`, 0 이하 제외 | 같다(실수 곱셈) | 단위 테스트 + 골든 |
| anchor | first_upper → t{pct} → t25/t20/t15 → 첫 잠김 | 같다 | 단위 테스트 |
| lock_buy · pre_sell · lead | 매수∪매도 창구, `buy.get(m, 0.0)`, 동률이면 회원번호 큰 쪽 | 같다. start/end 가 없는 잠김은 건너뛴다 | 단위 테스트 + 골든 9창구 |

## 검증 결과

| 검증 | 결과 |
|---|---|
| Task 1 RED | stub `derive.ts` 로 12/14 실패(assertion). 모듈 없음 같은 INVALID_RED 는 아니었다 |
| `pnpm --filter @gh-radar/limitup-sync run typecheck` | 오류 0 |
| `vitest run tests/derive.test.ts` | 14 passed |
| 골든 검사 python one-liner | member_daily 9 > 0 · grid_summary 3 → exit 0 |
| `verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` | `1..145` · `# RESULT: PASS`(118 → 145: H 보존 정리 24 + purge 권한 3) |
| 워커 전체 `vitest run` | 7 files · 71 passed |
| Task 2 RED(사후) | HEAD 의 index.ts 로 돌리면 dispatch 새 테스트 7건이 실패한다(업로드 · 8키 · 정리 부재) |
| 실 export 4일 dry-run | exit 0 · totals 아래 · `"grid_summary":99` · `"member_daily":64` · grids 99 · purged null → verify grep 3개 통과 |
| `git diff -- workers/limit-up-sync` | 0줄(하이픈 워커는 그대로다 · Pitfall 12) |

dry-run 합계(그대로):

```
"totals":{"entries":99,"locks":39,"jumps":40626,"member_alloc":253247,"facts":542,"touches":216,"grid_summary":99,"member_daily":64}
날짜별 파생: 20260929 격자 20 · 창구 11 / 20260930 23 · 16 / 20261001 27 · 18 / 20261002 29 · 19
```

수락 기준 grep: `to_regclass('storage.buckets')` 2 · `'limitup-grid', 'limitup-grid', false` 1 · REVOKE anon/authenticated 1 · grid.ts `upsert: true` 2 · `application/gzip` 2 · purge.ts `dma_strategy_events_purge_limit_feature` 4 · `limitup_purge_old` 4 · derive.ts export 2개 각 1 · make-golden `_sell_share_after|fingerprint_agg` 8 · derive.test `expected-derive.json` 2. 모두 ≥ 1.

dispatch 순서 단언 테스트 이름:
- 「업로드 → stage → commit 순서: stage_clear → upload × 3 → stage insert(6표 + 파생 2) → commit_day(8키) → 정리」
- 「업로드 error 면 commit 0회 · dispatch throw(사유에 경로) · 정리도 안 한다(다음 run 이 날짜를 다시 한다)」

## Decisions Made

frontmatter `key-decisions` 참고. 요지: 가중 곱셈은 실수로 한다(gh-trade 넘침 보정) · 정리 RPC 는 보존 일수 1 미만을 거부한다 · 격자 date/isin 이 맞지 않으면 throw · 폴더당 list 는 1회 · 정리가 실패해도 적재 날짜는 로그에 남는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] gh-trade `member_top` int64 넘침을 그대로 옮기지 않았다**
- **Found during:** Task 1(골든 생성 직후 실수 계산과 대조)
- **Issue:** 플랜은 「gh-trade venv 골든과 같은 값」 을 요구했다. 그런데 원본 함수는 int64 곱셈 넘침 때문에 정의와 다른 숫자를 낸다(위 절).
- **Fix:** TS 는 정의대로 실수 곱셈을 한다. 골든은 gh-trade `fingerprint_agg` 를 그대로 쓰고 `member_top` 만 float64 곱셈판으로 바꿔 끼워 만든다. 갈리는 창구는 stderr 로 보고한다.
- **Files modified:** workers/limitup-sync/src/derive.ts, tests/fixtures/make-golden.py
- **Commit:** 5221f7c9

**2. [Rule 3 - 막힘] `load.test.ts` 의 28-03 단언을 고쳤다(플랜 files_modified 밖)**
- **Found during:** Task 2
- **Issue:** stage · expected · totals 가 6키에서 8키로 바뀌었다. 업로드 호출과 정리 호출이 늘면서 「commit 이 마지막 호출」 · 「select 외 호출 0」 단언이 깨졌다.
- **Fix:** 기대값을 `stageRows`(6표 + 골든 파생 수)로 바꾸고, 순서 단언에 업로드 3개와 정리 3개를 넣었다. 다른 단언은 그대로 두었다.
- **Commit:** 4407912a

**3. [Rule 3 - 테스트 하네스] dispatch `addDay` 가 다른 날짜 사본의 격자 date 를 고친다**
- **Issue:** 격자 date 검사(Rule 2, 아래)를 넣자 28-16 의 「files_sig 다르거나 null → 적재」 테스트에서 20261001 사본이 실패했다. 사본 격자가 date 20261002 를 그대로 들고 있었기 때문이다.
- **Fix:** 사본을 만들 때 격자 JSON 의 date 를 바꿔 다시 gzip 하고 manifest sha256 을 다시 계산한다.
- **Commit:** 4407912a

**4. [Rule 2 - 정합성] 거부 경로를 더했다**
- 격자 JSON `date` ≠ 적재 날짜, 파일 이름 isin ≠ JSON isin, coarse q_krw 길이 ≠ sec 길이면 throw.
- `limitup_purge_old` 는 보존 일수 1 미만 · NULL 이면 예외(pgTAP 1건). 0 이 들어가면 오늘 이전 전부가 지워지기 때문이다.
- kind 15 purge 가 null 이나 정수가 아닌 값을 돌려주면 throw(무로그 fail-safe 금지). 그래서 가짜 Supabase 는 두 정리 RPC 에 실 RPC 와 같은 모양의 기본 응답을 준다.
- **Commit:** 5221f7c9 · 4407912a

**5. [Rule 3 - 구조] `kstYmdDaysAgo` 를 purge.ts 로 옮기고 index 에서 다시 내보낸다**
- **Issue:** 정리 cutoff 와 적재 창이 같은 식을 써야 한다. 그런데 purge.ts 가 index.ts 를 import 하면 순환이 된다.
- **Commit:** 4407912a

**TDD 커밋 단위:** 플랜이 태스크마다 커밋 1개를 지정해서 test → feat 를 따로 커밋하지 않았다. RED 는 실행해서 확인했다(Task 1 은 stub 으로 12건 실패, Task 2 는 HEAD index.ts 로 7건 실패).

**커밋 위치:** 오케스트레이터 지시(master 위 순차 실행)와 사용자 규칙(「작업은 master 에서」)에 따라 28-01~05 · 28-16 처럼 master 에 커밋했다. push 와 배포는 하지 않았다.

**Total deviations:** 5(Rule 1 1건 · Rule 2 1건 · Rule 3 3건). **Impact:** RPC 이름 · 결과 객체 · 로그 키는 플랜과 같다. `limitup_purge_old` 반환은 `{ cutoff, alloc_cutoff, deleted }` 로 표별 수를 `deleted` 아래에 둔다. 숫자 정의는 gh-trade 의 넘침 버그만큼 다르다.

## Issues Encountered

- gh-trade int64 넘침(위 절). 이 플랜 범위에서는 막히는 일이 아니고 알림만 하면 된다.
- statement_timeout 8초(28-03 메모): 파생 2표는 하루에 격자 ≈ 30행(행마다 q_krw 2,340칸)과 창구 ≈ 20행이 더해질 뿐이라 commit 시간에 거의 영향이 없다. 정리 RPC 는 날짜 키 조건 DELETE 10개다. 90일 밖 하루치만 지우므로 평소에는 가볍다. 첫 적용 때 지울 것도 없다(원격에 아직 행이 없다).

## Known Stubs

없음.

## User Setup Required

없음. 원격 마이그레이션(정리 RPC · 버킷)은 28-14 `supabase db push` 가 적용한다. 원격에는 `storage.buckets` 가 있어서 가드를 통과한다. 워커 배포와 알림은 28-08 몫이다.

## Next Phase Readiness

28-08(워커 배포)과 28-10(보고서 RPC — `limitup_grid_summary` · `limitup_member_daily` 90일 SUM · 서명 URL `limitup-grid/grid/<date>/<isin>.json.gz`)을 진행할 수 있다.

## Self-Check: PASSED

- 생성 파일 9개 존재 확인 · 커밋 `5221f7c9` · `4407912a` 존재 확인(`git log --oneline a33218d3..HEAD`).
- 수락 기준 grep 전부 ≥ 1 · pgTAP PASS · vitest 71 · dry-run verify grep 3개 통과.
