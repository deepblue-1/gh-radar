---
phase: 33-teamflow
plan: 07
subsystem: testing
tags: [playwright, e2e, vitest, pgtap, teamflow, regression, backstop]

# Dependency graph
requires:
  - phase: 33-04
    provides: "teamflow-report.spec.ts(relay 규약 · installTeamflowMocks · worst 모드) · e2e 픽스처 WORST_ROW(15자 종목명 · 상한가 15:19 · −1,234.5억)"
  - phase: 33-05
    provides: "TeamflowDetail 2열(teamflow-bands | teamflow-members) · TeamflowBandChart(data-slot teamflow-band-chart · 1:1 viewBox) · TeamflowToggle · teamflow-rules"
  - phase: 33-06
    provides: "TeamflowBucketChart(teamflow-bucket-chart · 39칸 · 높이 228) · teamflow-buckets 래퍼 · teamflow-bucket-legend · teamflow-bucket-table"
provides:
  - "E2E P33-TF5~TF8 · P33-TF-B4 · P33-TF-B5 — 펼친 상세 배치(1280 2열 · 390 1열) · 동양고속형 · 토글 독립 · 행 접힘 초기화 · 백스톱 T6 · T8 실측"
  - "WORST_ROW 합성 payload — 9 구간 + 하루 합계(28%~상한 미만 −1,234.5억 · 37%) · buckets 11칸(key 93 포함) · window 14:10~14:19 · members 3행 · summary 2줄"
  - "전 워크스페이스 회귀 게이트 green 기록 — 33-08 배포 전제"
affects: [33-08, 33-09]

# Actuals (#2632)
actuals:
  tokens: 6600
  tasks: 2
  commits: 1
commits: 1
plan_head_before: c343e4a5b32df95359d605fcebeb6319627ee12e
plan_head_after: bc48978233975e0f2b8bf7a2c3598fa2135dad28

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SVG 차트 E2E = 먼저 1:1 대기(viewBox 폭 = 그린 폭 ±1 을 expect.poll — 폴백 640 첫 페인트를 건너뛴다) → 상세 안 블록 박스를 evaluate 한 번으로(스크롤 보정이 끼어도 같은 좌표계)"
    - "백스톱 실측값은 console.log 로 남겨 SUMMARY 에 숫자로 옮긴다(단언은 계약 범위만)"

key-files:
  created: []
  modified:
    - webapp/e2e/fixtures/teamflow-report.ts
    - webapp/e2e/specs/teamflow-report.spec.ts

key-decisions:
  - "배치 단언의 「구간 차트 블록」 은 svg 가 아니라 teamflow-bands 래퍼(소제목 + svg + 「구간표 보기」) — teamflow-members 도 소제목부터 재므로 top 비교는 블록끼리 해야 같은 줄이다. 거래원이 오른쪽 칸인지(가로)만 svg teamflow-band-chart 로 잰다"
  - "WORST_ROW 10분 최대 막대는 +5.3억(한 자리 억) — 두 자리 억 축 글자(33-06 열린 항목)는 계약 단언이 아니라 실측 로그로만 남긴다(+5.3억 left = svg 왼쪽 + 2.1px)"
  - "Task 2 는 소스 변경 없음(flake 0) — 회귀 결과는 이 SUMMARY 「회귀 게이트」 표가 정본이고 코드 커밋은 없다"

patterns-established:
  - "상세 슬롯 헬퍼 slot(page, isin, name) = #tf-{isin} [data-slot=…] · openDetail(page, isin)"

requirements-completed: [TEAM-01, TEAM-02, TEAM-03, TEAM-04]

coverage:
  - id: D1
    description: "1280 상세 2열 — 에스엠벡셀: 요약 → [구간 차트 | 거래원] 같은 줄(top 차이 ≤ 8 · 거래원 left > 구간 차트 가운데) → 10분 차트 전폭(상세 폭 90% 이상) → 판정 기준 · 두 차트 1:1 · 가로 넘침 0"
    requirement: TEAM-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF5 1280 — 상세 2열: 요약 → [구간 차트 | 거래원] → 10분 전폭 → 판정 기준"
        status: pass
    human_judgment: false
  - id: D2
    description: "390 상세 1열 — 구간 차트 블록 아래 거래원 · 그 아래 10분 차트 · svg 폭 = 부모 폭(±1) · viewBox 1:1 · 10분 차트 글자 높이 9~16 · scrollWidth ≤ innerWidth"
    requirement: TEAM-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF6 390 — 상세 1열 · 차트 svg 1:1 · 글자 9~16px · 가로 스크롤 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "동양고속형(팀 거의 없음 · 미도달) — 구간 차트 height 220(7행) · 0선 1 · 눈금 「9시」~「15시」 7 · 등락률 띠 rect 39 · 「첫 상한가」 글자 · 선 0 · 빈 상태 문구 없음"
    requirement: TEAM-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF7 동양고속형(팀 거의 없음) — 구간 차트 220 · 0선 · 눈금 7 · 등락률 띠 39 · 첫 상한가 없음"
        status: pass
    human_judgment: false
  - id: D4
    description: "「구간표 보기」 · 「10분 표 보기」 · 「판정 기준」 독립 · 행 접었다 다시 열면 셋 다 aria-expanded false · 표 언마운트"
    requirement: TEAM-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF8 토글 셋 독립 · 행 접으면 초기화"
        status: pass
    human_judgment: false
  - id: D5
    description: "백스톱 T6 — 합성 최악값 행 390(svg 326 = 목록 카드 안 폭) · 1280(xl 반폭 464): 「28%~상한 미만」 라벨이 96 칸 안 · 「−1,234.5억」 ↔ 「37%」 겹침 0 · 둘 다 svg 안"
    requirement: TEAM-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF-B4 구간 차트 최악값 — 「28%~상한 미만」 라벨 96 칸 안 · 「−1,234.5억」 ↔ 「37%」 겹침 0 · 390 · 1280 (백스톱 T6)"
        status: pass
    human_judgment: false
  - id: D6
    description: "백스톱 T8 — 폰 390 10분 차트: svg W 326 → 칸 6.41px(6~8) · 「첫 상한가 15:19」 238.2~310.9 ⊂ svg 32.0~358.0 · 축 글자 13개 높이 최대 13.0(≤ 16)"
    requirement: TEAM-04
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/teamflow-report.spec.ts#P33-TF-B5 10분 차트 폰 390 — 칸 폭 6~8 · 「첫 상한가 15:19」 svg 안 · 축 글자 ≤ 16 (백스톱 T8)"
        status: pass
    human_judgment: false
  - id: D7
    description: "전 워크스페이스 회귀 게이트 — limitup-sync · server · webapp typecheck + vitest 전체 · E2E 3 spec 25 · pgTAP 3파일 300 ok"
    requirement: TEAM-01
    verification:
      - kind: unit
        ref: "pnpm --filter @gh-radar/limitup-sync exec vitest run --maxWorkers=2 (108/108)"
        status: pass
      - kind: integration
        ref: "pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 (521/521)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2 (4234 passed · 1 skipped)"
        status: pass
      - kind: e2e
        ref: "playwright test teamflow-report · sidebar-tree · limitup-report --workers=1 (25 passed)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/{limitup_load,teamflow_report,limitup_report}.test.sql (218 · 28 · 54 ok · not ok 0)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-16
status: complete
---

# Phase 33 Plan 07: 상세 E2E · 폭 백스톱 · 전 워크스페이스 회귀 게이트 Summary

**실브라우저에서 펼친 상세의 배치(1280 2열 · 390 1열) · 동양고속형 · 토글 독립 · 행 접힘 초기화를 E2E 6개로 잠갔습니다. 합성 최악값 행(28%~상한 미만 −1,234.5억 · 37% · 첫 상한가 15:19)으로 백스톱 T6 · T8 을 실측해 모두 계약 안에 들었습니다. 이어서 worker · server · webapp 타입 · 단위 전체, E2E 3 spec, pgTAP 3파일 회귀 게이트를 돌려 전부 green 이었습니다. 33-08 배포 전제가 충족됐습니다.**

## Performance

- **Duration:** 25 min (다른 세션 E2E 회귀가 끝나기를 기다린 약 10분 포함)
- **Started:** 2026-10-16T07:50:19Z
- **Completed:** 2026-10-16T08:15:59Z
- **Tasks:** 2 (tracer 1 · auto 1)
- **Files modified:** 2

## Accomplishments

- **픽스처 `WORST_ROW.payload`(합성):**
  - bands: 9 구간 라벨 전부 + 「하루 합계」. 「28%~상한 미만」 은 net_val −123,450,000,000 · share 0.37 이고 나머지는 작은 값입니다.
  - buckets: key 54 · 60 · 66 · 72 · 78(share null) · 84 · 85 · 86 · 90 · 91 · 93 의 11칸입니다.
  - window 14:10~14:19(+5.3억) · members 3행(absent 2 · net null 1) · summary_lines 2줄입니다. worst · reach 는 비웠습니다.
- **P33-TF5 (1280):** 에스엠벡셀 상세가 요약 → [구간 차트 블록 | 거래원] 같은 줄 → 10분 차트 전폭(상세 폭 90% 이상) → 판정 기준 순서로 그려집니다. 두 차트 모두 viewBox 폭 = 그린 폭입니다.
- **P33-TF6 (390):** 같은 상세가 1열로 그려집니다. 순서는 구간 차트 블록 → 거래원 → 10분 차트입니다. svg 폭은 부모 폭과 같고(±1), 10분 차트 첫 글자 높이는 9~16 사이입니다. 문서 · main 가로 넘침은 0 입니다.
- **P33-TF7 (동양고속):** 구간 차트 `height="220"`(7행) · 0선 1 · 눈금 「9시」~「15시」 7개 · 등락률 띠(`rx=1` · `--faint`) 39개를 확인했습니다. 「첫 상한가」 글자 · `--up` 세로선 · 빈 상태 문구는 없습니다.
- **P33-TF8 (천일고속):** 토글 셋이 서로 독립입니다. 행을 접었다 다시 열면 셋 다 `aria-expanded="false"` 이고 두 표는 언마운트됩니다.
- **P33-TF-B4 · B5:** 백스톱 T6 · T8 실측값은 아래 「백스톱 실측」 표에 있습니다.

## 백스톱 실측 (Playwright 로그)

| 백스톱 | 폭 | 실측 | 계약 | 판정 |
|---|---|---|---|---|
| T6 구간 차트 | 390 (svg 326 = 목록 카드 안 폭) | 라벨 50.8~120.0 · 판 왼쪽 128.0 · 값 246.0~302.4 · % 330.2~354.0 (svg 32~358) | 라벨 ≤ 판 왼쪽(96) · 값.right ≤ %.left · svg 안 | PASS |
| T6 구간 차트 | 1280 (xl 반폭 · svg 464) | 라벨 306.8~376.0 · 판 왼쪽 384.0 · 값 640.0~696.4 · % 724.2~748.0 | 같음 | PASS |
| T8 10분 차트 | 390 | svg W 326 → 칸 (326 − 76) ÷ 39 = 6.41px · 「첫 상한가 15:19」 238.2~310.9 ⊂ svg 32.0~358.0 · 축 글자 13개 높이 최대 13.0 | 칸 6~8 · 라벨 svg 안 · 글자 ≤ 16 | PASS |

- 「28%~상한 미만」 라벨의 실측 폭은 69.2px 입니다(UI-SPEC 추정 ≈ 80). 「첫 상한가 15:19」 는 72.7px 로, `FIRST_LIMIT_LABEL_W` 추정 상수 84 보다 좁아 anchor 'end' 판정이 안전한 쪽입니다.
- 폰 칸 폭 6.41px 은 UI-SPEC 의 「≈ 7px」 보다 좁지만 계약 범위(6~8) 안입니다. 폰 svg W 326 은 UI-SPEC 의 「본문 ≈ 334~358」 가정보다 좁은데, 상세 `px-2` 때문입니다.
- **33-06 열린 항목(왼쪽 축 「+N.N억」):** 한 자리 억 「+5.3억」 은 svg 왼쪽에서 2.1px 안쪽에 그려집니다. 두 자리 억(예 「+12.3억」)은 약 6px 더 넓어 svg 왼쪽 밖으로 나갈 수 있습니다. 이 플랜 계약 밖이라 단언은 넣지 않았고 33-09 라이브 UAT 관찰 항목으로 넘깁니다.

## 회귀 게이트

다른 세션(Phase 32)의 E2E 다중 spec 회귀(`trading-workbench` · `me` · `a11y` · `sidebar-tree` · `order-log` …)가 3100 을 쥐고 도는 동안 기다렸습니다. 그 실행이 끝나고 3100 이 비고 vitest · playwright 프로세스가 0 일 때 webapp vitest 부터 다시 시작했습니다. 패키지는 하나씩 순서대로, vitest `--maxWorkers=2` · Playwright `--workers=1` 로 돌렸습니다. E2E 는 이 worktree 의 Next 서버를 새로 띄웠고(로그 `[WebServer]` 8줄 · 다른 세션 서버 재사용 없음), 끝난 뒤 3100 이 비었습니다.

| 단계 | 명령 | 결과 |
|---|---|---|
| shared build | `pnpm --filter @gh-radar/shared build` | exit 0 |
| worker typecheck | `pnpm --filter @gh-radar/limitup-sync run typecheck` | exit 0 · error TS 0 |
| worker vitest | `… limitup-sync exec vitest run --maxWorkers=2` | 9 파일 · **108/108 passed** |
| server typecheck | `pnpm --filter @gh-radar/server run typecheck` | exit 0 · error TS 0 |
| server vitest | `… server exec vitest run --maxWorkers=2` | 40 파일 · **521/521 passed** |
| webapp typecheck | `pnpm --filter @gh-radar/webapp run typecheck` (tsc + tsconfig.e2e) | exit 0 · error TS 0 |
| webapp vitest | `… webapp exec vitest run --maxWorkers=2` | 172 파일 · **4234 passed · 1 skipped**(기존 skip) |
| E2E 3 spec | `playwright test teamflow-report · sidebar-tree · limitup-report --workers=1` | **25 passed**(setup 1 · teamflow 13 · sidebar-tree 8 · limitup-report 3) · failed 0 |
| pgTAP limitup_load | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` | exit 0 · **218/218 ok** · not ok 0 |
| pgTAP teamflow_report | `… --test supabase/tests/teamflow_report.test.sql` | exit 0 · **28/28 ok** · not ok 0 |
| pgTAP limitup_report | `… --test supabase/tests/limitup_report.test.sql` | exit 0 · **54/54 ok** · not ok 0 |

- pgTAP 은 실행했습니다(미실행 아님). 이미지는 `public.ecr.aws/supabase/postgres:17.6.1.104`(로컬 보유 `sha256:eefa6c87…`)이고, 일회용 컨테이너는 끝난 뒤 남지 않았습니다.
- webapp vitest 로그의 `[StockComovementSection] fetch failed …` · `[StockDailyChartSection] fetch failed …` 는 오류 경로를 일부러 태우는 기존 테스트 출력이고 실패가 아닙니다.
- 회귀 실패 · load 유발 재실행 · 기존 실패는 없었습니다.

## Task Commits

1. **Task 1 (tracer): 실브라우저 상세 E2E · 백스톱 T6 · T8** — `bc489782` (test)
2. **Task 2: 전 워크스페이스 회귀 게이트** — 코드 커밋 없음. flake 0 이라 spec 수정이 없었고, 결과는 위 「회귀 게이트」 표가 정본입니다.

트레이서 피드백 게이트: auto_advance false · human_verify_mode end-of-phase 이고 Task 1 `<verify>` 는 automated 만 있습니다. 커밋 뒤 verify 를 다시 돌려 14 passed(setup 포함)를 확인하고 Task 2 로 확장했습니다.

## Files Created/Modified

- `webapp/e2e/fixtures/teamflow-report.ts` — `worstBand` · `worstBucket` 합성 헬퍼 · `WORST_ROW.payload`(bands · buckets · window · members · summary_lines) · 머리 주석에 T6 · T8 용도 추가
- `webapp/e2e/specs/teamflow-report.spec.ts` — `slot` · `openDetail` · `expectOneToOne` · `detailBoxes` 헬퍼 + P33-TF5~TF8 · P33-TF-B4 · P33-TF-B5

## Decisions Made

key-decisions(프런트매터)를 참조하세요. 요지는 다음 셋입니다.
- 배치 비교는 블록(`teamflow-bands` ↔ `teamflow-members`)끼리 합니다.
- 최악값 10분 막대는 한 자리 억으로 둡니다. 두 자리 억 축 글자는 로그 · UAT 몫입니다.
- Task 2 는 코드 커밋 없이 표로 기록합니다.

## Deviations from Plan

### 계약 정합 (셀렉터 선택)

**1. [계약 정합] 「구간 차트 ↔ 거래원 top 차이 ≤ 8」 을 블록 래퍼로 측정**
- **Found during:** Task 1 (P33-TF5)
- **Issue:** 플랜 action 은 `teamflow-band-chart` 와 `teamflow-members` 의 boundingBox 를 비교하라고 적었습니다. 그런데 `teamflow-band-chart` 는 svg 이고(소제목 줄 아래 · +28px), `teamflow-members` 는 소제목을 포함한 블록입니다. 이대로 비교하면 같은 줄이어도 차이가 ≈ 28px 이 됩니다.
- **Fix:** top · bottom 비교는 같은 층위의 블록 `teamflow-bands`(33-05 래퍼)로 합니다. 거래원이 오른쪽 칸인지(`members.x > band.x + band.width / 2`)는 플랜대로 svg 로 잽니다. 390 의 「거래원 ≥ 구간 블록 bottom − 1」 도 블록 기준이라 플랜보다 엄격합니다(「구간표 보기」 토글까지 포함).
- **Files modified:** webapp/e2e/specs/teamflow-report.spec.ts
- **Commit:** bc489782

**2. [플래너 재량 보완] TF7 등락률 띠 셀렉터 `rect[fill="var(--faint)"][rx="1"]`**
- 동양고속은 팀 순매수가 0.0억으로 반올림되는 칸이 많습니다. 그런 칸은 막대도 `--faint` 라 fill 만으로 세면 39를 넘습니다. 그래서 띠(`rx=1`)와 막대(`rx=1.5`)를 rx 로 구분했습니다.

---

**Total deviations:** 자동 수정 0 · 계약 정합 1 · 재량 보완 1. **Impact:** 컴포넌트 · Phase 32 파일 변경은 없습니다. 33-05 · 33-06 소스도 손대지 않았습니다.

## Issues Encountered

- **다른 세션 회귀와 겹침:** webapp typecheck 직후 Phase 32 세션이 E2E 다중 spec 을 시작했습니다(3100 점유). 프로젝트 규칙(동시 회귀 금지 · 3100 재사용 금지)대로 그 프로세스가 끝날 때까지 기다린 뒤 webapp vitest 부터 이어 돌렸습니다. 처음 만든 대기 루프는 자기 명령줄의 「vitest」 문자열에 걸려 끝나지 않아서, `^node …` 패턴으로 다시 걸었습니다.
- **샌드박스 명령 거부:** 변수로 만든 명령 · `docker ps --format` 같은 복합 명령은 worktree 격리 검사가 거부했습니다. 단순한 개별 호출로 나눠 실행했습니다.
- **플랜 커밋 원장:** 33-04~33-06 과 같이 세션 scratchpad 에 두었습니다. `commits: 1` 은 `git rev-list --count c343e4a5..HEAD` 실측값입니다.

## Known Stubs

없습니다. `WORST_ROW` payload 는 의도한 **합성** 테스트 입력이고, 픽스처 머리 주석과 행 주석에 그렇게 적었습니다. 화면 코드에는 스텁이 없습니다.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **33-08 배포 전제 충족:** 전 워크스페이스 회귀 게이트가 green 이고 pgTAP 3파일도 실행 · 통과했습니다(「pgTAP 미실행」 아님). push · 배포는 33-08 이 메인 세션에서 합니다.
- **33-09 라이브 UAT 관찰 항목:**
  - 두 자리 억 「+NN.N억」 왼쪽 축 글자가 svg 왼쪽 밖으로 나가는지(실측 근거는 「백스톱 실측」 참조)
  - 10분 표 폰 가로 스크롤 · hover opacity(33-06 D5 의 남은 브라우저 항목)

## Self-Check: PASSED

- **파일 존재 확인(FOUND):**
  - webapp/e2e/fixtures/teamflow-report.ts
  - webapp/e2e/specs/teamflow-report.spec.ts
- **커밋 존재 확인(FOUND):** bc489782
- **acceptance_criteria:**
  - `grep -c "test('P33-TF"` = 13 · `P33-TF-B5` 있음 · `WORST_ROW` · 「합성」 있음 · verify exit 0
  - Task 2: 첫 verify 전 단계 exit 0 · pgTAP exit 0 · 「회귀 게이트」 표 있음
