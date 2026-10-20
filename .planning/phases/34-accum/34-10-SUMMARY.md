---
phase: 34-accum
plan: 10
status: complete
subsystem: ui
tags: [playwright, e2e, backstop, regression, accum, tracer]

requires:
  - phase: 34-09
    provides: "accum-report.spec P34-AC1 · accumReportFixture · accumDetailFixtureOf · ACCUM_WORST_ROW"
  - phase: 34-05
    provides: "pgTAP accum_report · limitup_load 섹션 K"
  - phase: 34-02
    provides: "limitup-sync accum_flow 적재 · 워커 실측 픽스처"
provides:
  - "webapp/e2e/fixtures/accum-report.ts — ACCUM_WORST_DETAIL(합성 사이클 3 · 짧은 사이클 · 7자리) · ACCUM_WORST_DROP_DETAIL(7자리 · 06:00 이월 탈락) · accumReportFixture(d, { backstop }) · accumKpiWorstFixture"
  - "webapp/e2e/specs/accum-report.spec.ts — P34-AC2 폰 390 경로 · 백스톱 6종 × 390/1280 · 빈 상태 2 · 403 게이트"
  - "webapp lib/accum-chart.ts cumTicksOf — 누적 축 글자 겹침 제거"
  - "전 워크스페이스 회귀 결과 표(34-11 배포 전제)"
affects: [34-11, 34-12]

actuals:
  tokens: 11200
  tasks: 3
  commits: 3
plan_head_before: 16b2de68dc03b22fcd5f9190dec30d05c90ce2c3
plan_head_after: 4080ea138c131e1de3bd14a376e2ecc8fe039cfe

tech-stack:
  added: []
  patterns:
    - "SVG 글자 백스톱 = getBBox(1:1 이면 CSS px) 쌍별 겹침 + 그림 영역 [L, W − 56] 경계 — L 은 가격 축 글자 기준점 x + 6 으로 DOM 에서 읽는다"
    - "합성 상세는 실측 payload 를 가격만 늘리고(scale) 시각만 옮긴다(shift) — 원 반지름 · 누적 · 막대는 실측 그대로"

key-files:
  created: []
  modified:
    - webapp/e2e/specs/accum-report.spec.ts
    - webapp/e2e/fixtures/accum-report.ts
    - webapp/src/lib/accum-chart.ts
    - webapp/src/components/analytics/accum-chart.tsx
    - webapp/src/lib/__tests__/accum-chart.test.ts

key-decisions:
  - "누적 축 글자는 0 과 세로 12px 미만으로 붙은 min/max 를 뺀다(0 글자 우선) — UI-SPEC 치수 · 문구 변경 없음"
  - "백스톱 합성 ISIN = KR790000AC98(7자리 사이클 3) · AC97(7자리 06:00 이월 탈락) · KPI 최악값 32행 KR790000K000~031"
  - "폰 전체 창 2시간 눈금은 KST 자정 정렬이라 「10 · 12 · … · 20」 — 플랜 예시 「11 · 13」 대신 간격 2시간을 단언"

requirements-completed: []

coverage:
  - id: D-08-D-14-D-20-phone
    description: "폰 390 — 목록 3줄 카드(종목 · 태그 · 셰브론 한 줄 / 배지 · 사유 / 메타) → 사이클 3 행 펼침 → viewBox 폭 = 렌더 폭(±1 · W 290~330) · 눈금 2시간 간격 · ≥ 28px → 사이클 표 래퍼 안 가로 스크롤 → 페이지 가로 스크롤 0"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/accum-report.spec.ts#P34-AC2"
        status: pass
    human_judgment: false
  - id: UI-BACKSTOP-6
    description: "백스톱 A1 overflow · A2 overflow · A3 long-text · A5 overflow · A6 overflow · A6 long-text — 390 · 1280 각각"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/accum-report.spec.ts#P34-AC-B1~B6"
        status: pass
    human_judgment: false
  - id: A1-empty-gate
    description: "빈 상태 2종(이력 0 · 행 없는 날 → 「최신 보고서 보기」 → ?d=20261014) · 목록 403 → DmaGate 문구"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/accum-report.spec.ts#P34-AC-E1 · E2 · G1"
        status: pass
    human_judgment: false
  - id: SC6-regression
    description: "전 워크스페이스 회귀 — worker · server · relay(accum-backfill) · webapp typecheck + vitest · E2E 4 spec · pgTAP 4파일"
    verification:
      - kind: other
        ref: "34-10-SUMMARY 「회귀 게이트」 표"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-20
---

# Phase 34 Plan 10: 폰 경로 · 폭 백스톱 · 전 워크스페이스 회귀 게이트 Summary

**폰 390 실브라우저에서 목록 카드 → 사이클 3개 합성 행 펼침 → 차트 1:1 · 2시간 눈금 → 사이클 표 내부 가로 스크롤까지 페이지 가로 스크롤 없이 이어지는 것을 확인했다. UI-SPEC 폭 백스톱 6종은 390 · 1280 두 폭에서 실측으로 잠갔다. 실측 중 누적 축 글자 「−0.3억」 과 「0.0억」 이 겹치는 결함이 나와 그 자리에서 고쳤다. 전 워크스페이스 회귀와 pgTAP 4파일도 green 이다.**

## Performance

- **Duration:** 약 12분 (14:28Z 시작 → 14:40Z 회귀 종료)
- **Completed:** 2026-10-20
- **Tasks:** 3개 (Task 1 tracer · Task 2 auto · Task 3 auto — 회귀만, 코드 변경 없음)
- **Files:** 수정 5개 (e2e 2 · 차트 lib 1 · 차트 컴포넌트 1 · lib 단위 테스트 1)

## Accomplishments

- **합성 백스톱 픽스처 (Task 1)** — `webapp/e2e/fixtures/accum-report.ts`
  - `ACCUM_WORST_DETAIL`(KR790000AC98) 의 구성:
    - 사이클 3개: 09:05~09:15 청산 · 09:20~09:30 청산 · 13:00 재등록(살아 있음). cycle 값은 1 · 1 · 2 다(CR-01).
    - 가격은 한선엔지니어링 실측을 최대 1,234,500 으로 늘린 7자리다.
  - `ACCUM_WORST_DROP_DETAIL`(AC97) 은 같은 7자리 가격에 이월 D+3 · 06:00 이월 탈락을 붙였다. 종료 라벨이 최악 길이인 「이월 탈락(복원 안 됨) 06:00」 이 된다.
  - 날짜는 20261013 이다. `accumReportFixture(d, { backstop: true })` 가 `ACCUM_WORST_ROW` 와 이 두 행을 실측 6행 앞에 싣는다(9행).
  - `accumKpiWorstFixture()` 는 종료 32행 목록이다. 청산 12 · 탈락 10 · 만료 10 이고, 팀 순매수 합은 −1,234.5억이다.
  - 합성 payload 는 가격만 늘리고(scale) 시각만 날짜로 옮긴다(shift). 원 반지름 · 누적 · 막대 금액은 실측 그대로다.
- **P34-AC2 폰 390 (Task 1, 트레이서)**
  - ① 최악값 행은 3줄 카드다. 종목명 · 결과 태그 · 셰브론이 세로로 겹친다(같은 줄). 배지 묶음은 그 아래, 사유 줄은 배지 아래, 메타는 사유 아래다.
  - ② 사이클 3 행을 펼치면 상세 요청은 1회다. viewBox 폭과 렌더 폭의 차는 1px 이하이고 W 는 290~330 이다. 눈금은 정시만 있고 간격은 2시간 · 28px 이상이다.
  - ③ 사이클 표는 3행이다. `table-container` 는 `overflow-x: auto` 이고 scrollWidth > clientWidth 다.
  - ④ 문서와 `main` 모두 가로 스크롤 0 이고 pageerror 도 0 이다.
- **폭 백스톱 6종 × 2폭 (Task 2)**
  - **B1 백스톱 A1 overflow:** h1 · 알약 · 출처 칩 · 설명이 보고서 루트 안에 있다. h1 과 알약은 겹치지 않는다. 칩은 설명 안에 있고 잘리지 않는다. 설명은 `word-break: keep-all` 이다.
  - **B2 백스톱 A2 overflow:** 폰 2열 칸에서 보조 글자 「청산 12 · 탈락 10 · 만료 10」 이 값 아래 줄로 내려간다. 값 · 보조는 칸 안(p-3)에 있고 「−1,234.5억」 도 칸 안이다. 4칸 모두 dd 잘림이 0 이다.
  - **B3 백스톱 A3 long-text:** 15자 종목명 · 「상한가 +29.9%」 · 셰브론이 한 줄이고 서로 겹치지 않는다. 배지 3개와 사유 줄은 쌍별 겹침이 0 이다. 1280 에서는 다음을 더 본다.
    - 사유 줄은 한 줄이고 결과 칸과 겹치지 않는다.
    - 「평단 200,407 · 등록가 205,500」 에는 `title` 이 있고, 잘리면 말줄임이 된다.
    - 그 아랫줄은 하루 순매수 칸과 겹치지 않는다.
  - **B4 백스톱 A5 overflow:** 프리셋 3 · 창 범위가 쌍별로 겹치지 않고 상세 안에 있다. 버튼 높이는 32 이상이고 글자 잘림은 0 이다.
  - **B5 백스톱 A6 overflow:** 전체 창에서 확인했다. 왼쪽 축 폭 L 은 60(7자리)이다.
    - 세로선 5개와 `<title>` 5개가 남는다. 라벨 일부는 생략된다.
    - 라벨은 3줄 이하다. 쌍별 getBBox 겹침이 0 이고 전부 [L, W − 56] 안이다.
    - 눈금 간격은 28px 이상이다. 폰은 「10 · 12 · 14 · 16 · 18 · 20」 이다.
    - 가격 · 누적 축 글자끼리 겹침이 0 이다(이 수정의 회귀 단언).
  - **B6 백스톱 A6 long-text:** 7자리 가격 축 글자는 0 이상 L 이하에 있다. 「이월 탈락(복원 안 됨) 06:00」 은 그림 영역 안에 있다. 이월 줄 「이월 D+3 · 10/08 14:12 등록」 과는 겹치지 않는다.
- **빈 상태 · 게이트 (Task 2)**
  - **E1:** `dates: []` 이면 「아직 올라온 매집감지 보고서가 없어요」 + 「첫 보고서는 평일 밤 20:30쯤 올라와요」 다. KPI · 목록은 0 이다.
  - **E2:** `?d=20261012` 이면 「이 날은 매집감지 데이터가 없어요」 + 「최신 보고서는 10/14예요」 다. 「최신 보고서 보기」 를 누르면 `?d=20261014` 로 가고 6행이 나온다.
  - **G1:** 목록 403(DMA_UNMAPPED)이면 DmaGate 문구가 나온다. 목록 · KPI 는 0 이고 상세 요청도 0 이다.
- 스크린샷 9장(목록 행 · KPI · 차트 최악값 · 06:00 종료 × 390/1280 · 상세 390)을 눈으로 확인했다. 위 겹침 외 결함은 없었다.

## 회귀 게이트

모든 명령은 한 번씩 순서대로 돌렸다. 동시 실행은 없었다. vitest 는 `--maxWorkers=2`, Playwright 는 `--workers=1` 이다. 시간은 벽시계 초다.

| 워크스페이스 | 명령 | 결과 | 시간 |
|---|---|---|---|
| shared | `pnpm --filter @gh-radar/shared build` | exit 0 | 1s |
| worker (limitup-sync) | `run typecheck` | exit 0 | 1s |
| worker (limitup-sync) | `exec vitest run --maxWorkers=2` | 9 files · **124 passed** · failed 0 | 3s |
| server | `run typecheck` | exit 0 | 2s |
| server | `exec vitest run --maxWorkers=2` (전체 1회차) | 42 files · 545 passed · **2 failed**(`tests/routes/admin-dma.test.ts` order-server 2건 — `read ECONNRESET`) | 9s |
| server | `exec vitest run tests/routes/admin-dma.test.ts --maxWorkers=2` (그 파일 단독 재실행) | **85 passed** · failed 0 | — |
| relay | `run typecheck` | exit 0 | 2s |
| relay | `exec vitest run tests/accum-backfill.test.ts --maxWorkers=2` | **17 passed** · failed 0 | <1s |
| webapp | `run typecheck` (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | exit 0 | 4s |
| webapp | `exec vitest run --maxWorkers=2` | 181 files · **4572 passed** · 1 skipped · failed 0 | 97s |
| webapp E2E | `playwright test accum-report · sidebar-tree · teamflow-report · limitup-report --workers=1` | **48 passed**(setup 1 · accum 17 · sidebar 11 · teamflow 16 · limitup 3) · failed 0 | 78s |
| pgTAP | `verify-dma-orders-price-check.sh --test supabase/tests/limitup_load.test.sql` | **ok 271/271** · not ok 0 | 8s |
| pgTAP | `… --test supabase/tests/accum_report.test.sql` | **ok 52/52** · not ok 0 | 8s |
| pgTAP | `… --test supabase/tests/teamflow_report.test.sql` | **ok 28/28** · not ok 0 | 7s |
| pgTAP | `… --test supabase/tests/limitup_report.test.sql` | **ok 54/54** · not ok 0 | 8s |

- **server 1회차 실패 판정:** 실패 2건은 phase 34 가 건드리지 않은 `PUT /api/admin/dma-users/…/order-server` 라우트에서 나왔다. 단언 실패가 아니라 테스트 HTTP 연결의 `ECONNRESET` 이다.
  - 그 파일만 다시 돌리니 85/85 green 이었다. 부하나 연결 경합에 의한 일시 실패로 본다. 타임아웃은 올리지 않았다.
  - 34-10 이 바꾼 server 코드는 0 이다. 두 실행 결과를 모두 표에 남겼다.
- pgTAP 은 로컬 일회용 Docker 컨테이너에서 4파일 모두 **실행됐다**(미실행 아님). 원격 접촉은 0 이다.
- webapp vitest 의 1 skipped 는 기존 skip 이다. 이 플랜은 skip 을 추가하지 않았다.
- 플랜 verify 체인은 `&&` 로 이어져 있어서 server 1회차 실패에서 멈춘다. 그래서 같은 명령들을 단계별로 나눠, 같은 순서로 끝까지 돌렸다.
- `git push` · 배포 · `supabase db push` 는 하지 않았다.

## Task Commits

1. **Task 1: 폰 390 상세 경로 E2E** — `cc3a54dc` (test)
2. **Task 2 fix: 누적 축 글자 겹침 제거** — `76beb9c5` (fix)
3. **Task 2: 폭 백스톱 6종 · 빈 상태 · 게이트 E2E** — `4080ea13` (test)
4. **Task 3: 회귀 게이트** — 코드 변경이 없어 커밋이 없다. 결과는 위 표에 있다.

## Verification

- Task 1 verify: shared build 후 `playwright test e2e/specs/accum-report.spec.ts --workers=1` 결과 3 passed(setup 포함), failed 0.
  - 트레이서 게이트: auto 모드가 아니고 end-of-phase 이며 verify 는 자동 검증뿐이다. 다시 돌려 통과를 확인한 뒤 확장했다.
- Task 2 verify: shared build → webapp typecheck exit 0 → 같은 spec 18 passed, failed 0.
- 수정 단위 테스트: `vitest run accum --maxWorkers=2` 결과 7 files 168 passed. `cumTicksOf` 케이스 1건이 새로 들어갔다.
- 변경 파일 eslint: error 0 · warning 0. 픽스처의 미사용 변수 경고 2건은 Task 2 커밋에서 정리했다.
- 수용 grep: spec 에 「백스톱 A1 overflow」 · 「A2 overflow」 · 「A3 long-text」 · 「A5 overflow」 · 「A6 overflow」 · 「A6 long-text」 6종 이름과 `width: 390` describe 가 있다. 픽스처에는 `ACCUM_WORST_DETAIL` 과 「합성」 머리 주석이 있다.

## Decisions Made

- 누적 축 글자는 0 과 세로 간격이 12px(11px 글자 + 여유) 미만인 끝값을 뺀다. 0 글자는 0선과 짝이라 항상 남긴다. UI-SPEC 치수 · 문구는 바꾸지 않았다.
- 합성 ISIN 은 34-04 · 34-09 합성 대역을 이어 쓴다. 7자리 사이클 3 은 AC98, 7자리 06:00 탈락은 AC97, KPI 최악값 32행은 K000~K031 이다.
- 폰 전체 창 눈금은 `ticksOf` 가 KST 자정에 맞춰 놓아서 「10 · 12 · … · 20」 이다. 플랜 예시는 「11 · 13」 이었지만, 계약(UI-SPEC 「폰 전체 창 2시간」)에 맞춰 간격 2시간을 단언한다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 차트 누적 축 글자 「−0.3억」 ↔ 「0.0억」 겹침 (accum-chart.tsx · lib/accum-chart.ts)**
- **Found during:** Task 2 백스톱 A6 overflow (390 실측)
- **Issue:** 누적 축 글자를 `[cMin, 0, cMax]` 값 중복 제거만으로 골랐다. 한선엔지니어링 실측처럼 하루 최저가 −0.3억이고 최고가 +22.8억이면, −0.3억 글자가 0 글자와 약 1.5px 떨어져 겹쳤다. 390 · 1280 모두, 실측 데이터에서도 나는 결함이다.
- **Fix:** `cumTicksOf(range, y)` 를 lib 에 추가했다. 0 과 세로 12px 미만인 끝값 글자는 뺀다. 컴포넌트는 이 함수를 쓰고, 단위 테스트를 1건 더했다. 백스톱 B5 에 축 글자 쌍별 겹침 0 단언을 넣어 회귀를 잠갔다.
- **Files modified:** `webapp/src/lib/accum-chart.ts`, `webapp/src/components/analytics/accum-chart.tsx`, `webapp/src/lib/__tests__/accum-chart.test.ts`(단위 테스트 — files_modified 밖)
- **Commit:** `76beb9c5`

**2. [플랜 예시 정정] 2시간 눈금 글자**
- 플랜 Task 1 은 「11 · 13 같은 2시간 간격(「10」 없음)」 을 예로 들었다. 구현(34-06 `ticksOf`)은 KST 자정 정렬이라 「10 · 12 · …」 다. 단언은 「정시 글자 · 간격 2시간 · ≥ 28px」 와 폰 전체 창 `['10','12','14','16','18','20']` 로 썼다. 코드 변경은 없다.

## Issues Encountered

- server 전체 vitest 1회차에서 `admin-dma.test.ts` 2건이 `ECONNRESET` 으로 실패했다. phase 34 와 무관한 라우트다. 단독 재실행에서는 85/85 green 이었다(회귀 게이트 참고).
- 처음에는 회귀 체인을 백그라운드로 띄웠다. 대기 수단이 없어 server vitest 도중 중단했고, 고아 vitest 프로세스도 정리했다. 그 뒤 같은 명령을 포그라운드에서 처음부터 한 번 돌렸다. 표의 수치는 포그라운드 실행 결과다.

## Next Phase Readiness

- 34-11 배포의 전제가 충족됐다. 회귀 게이트 green 이고 pgTAP 4파일은 실행돼 green 이다. push 전 사용자 승인 조건(pgTAP 미실행)에는 해당하지 않는다.
- 34-12 라이브 UAT 에 남은 것은 두 가지다.
  - 폰 터치 툴팁(UI Considerations unresolved): `<title>` 은 터치에서 뜨지 않는다.
  - 실데이터 성능 체감.

## Self-Check: PASSED

- FOUND: webapp/e2e/specs/accum-report.spec.ts
- FOUND: webapp/e2e/fixtures/accum-report.ts
- FOUND: webapp/src/lib/accum-chart.ts
- FOUND: webapp/src/components/analytics/accum-chart.tsx
- FOUND: cc3a54dc
- FOUND: 76beb9c5
- FOUND: 4080ea13
