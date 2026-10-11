---
phase: quick-260913-g4c
plan: 01
subsystem: home-sync · intraday-sync · server home · webapp(scanner/home/themes) · deploy scripts
tags: [krx-aftermarket, home-sync, 1min-slot, thinning, auto-refresh, scheduler, themes-top20]
status: complete
requires: []
provides:
  - "home-sync 1분 슬롯 + aftermarket marketStatus + 20:04 경계 + Claude 게이트 단일 함수 + 과거 5분 thinning"
  - "GET /api/home index 1500 슬롯 .range 페이지네이션"
  - "Scheduler 2쌍(intraday 08:00~20:02 · home 08:00~20:04) 배포/스모크 스크립트"
  - "useAutoRefresh 공용 훅 — /scanner · / 30초 자동 갱신 (visibility + KST 평일 08:00~20:05 게이트)"
  - "/themes 시스템 테마 랭킹 상위 20개"
affects: [webapp /scanner, webapp /, webapp /themes, Cloud Scheduler 4개, home_theme_snapshots 저장량]
tech-stack:
  added: []
  patterns:
    - "시각 게이트 단일 지점(isAutoRefreshWindow) + 공용 훅(useAutoRefresh) — 수동 새로고침·초기 로드만 게이트 예외"
    - "PostgREST max_rows 우회 .range 페이지 + captured_at dedupe"
    - "워커 JS thinning(RPC 마이그레이션 없음) — delete 체인 lt(trade_date, 오늘) 이중 안전장치"
key-files:
  created:
    - workers/home-sync/src/pipeline/thinSnapshots.ts
    - workers/home-sync/src/pipeline/thinSnapshots.test.ts
    - webapp/src/lib/auto-refresh-window.ts
    - webapp/src/lib/auto-refresh-window.test.ts
    - webapp/src/hooks/use-auto-refresh.ts
    - webapp/src/hooks/use-auto-refresh.test.ts
    - webapp/src/hooks/__tests__/use-home-query.test.ts
    - webapp/src/components/home/__tests__/home-client.test.tsx
  modified:
    - packages/shared/src/home.ts
    - workers/home-sync/src/index.ts
    - workers/home-sync/src/index.test.ts
    - workers/home-sync/src/ai/prompt.ts
    - workers/home-sync/src/ai/prompt.test.ts
    - workers/home-sync/src/ai/clusterSurges.test.ts
    - workers/intraday-sync/src/marketWindow.ts
    - workers/intraday-sync/src/index.ts
    - server/src/routes/home.ts
    - server/src/routes/home.route.test.ts
    - scripts/deploy-intraday-sync.sh
    - scripts/smoke-intraday-sync.sh
    - scripts/deploy-home-sync.sh
    - scripts/smoke-home-sync.sh
    - webapp/src/hooks/use-polling.ts
    - webapp/src/hooks/use-polling.test.ts
    - webapp/src/hooks/use-home-query.ts
    - webapp/src/components/home/home-client.tsx
    - webapp/src/components/home/home-header.tsx
    - webapp/src/components/home/home-empty.tsx
    - webapp/src/components/scanner/scanner-client.tsx
    - webapp/src/components/theme/themes-client.tsx
    - webapp/src/components/theme/__tests__/themes-client.test.tsx
    - webapp/e2e/specs/home.spec.ts
    - webapp/e2e/fixtures/home.ts
decisions:
  - "Claude 재분류 게이트는 export 타입 가드 canReusePrevClassification 한 곳 — 쿨다운·knob 미추가(사용자 결정 1)"
  - "thinning 은 워커 JS(08:00~08:09, 스캔 1000행, 청크 100) — RPC/마이그레이션 없음"
  - "server index 는 INDEX_LIMIT 1500 / INDEX_PAGE 1000 .range 루프 + captured_at dedupe"
  - "보조 Scheduler 이름 -cron-20h, smoke-home-sync.sh 에 --check-scheduler(잡 실행 없음) 모드"
  - "홈 슬롯 라벨 pill 고정 폭 116→168px (390px 실측: 텍스트 126px, 156px 에선 live dot 과 1px)"
  - "시스템 테마 랭킹 SYSTEM_RANK_LIMIT=20, 막대 스케일 maxAvg 는 표시 20개 기준"
metrics:
  duration: "~20분 (Task 1·2 실행 + 게이트, 체크포인트 대기 제외)"
  completed: "2026-09-13 (Task 1·2 완료, Task 3 체크포인트 대기)"
estimate:
  tokens: 190000
  tasks: 3
actuals:
  tokens: 25794      # chars/4 over git diff HEAD + 신규 파일(103,177 chars)
  tasks: 2           # Task 1·2 완료, Task 3 는 단계 A 에서 정지
  commits: 0         # 사용자 전역 규칙 — 승인 전 커밋 금지. 전 변경 unstaged working tree
plan_head_before: bef1c45
---

# Phase quick-260913-g4c Plan 01: KRX 애프터마켓 대응 — 급등 탐색 20:00 연장 · 홈 테마 1분 · 30초 자동 새로고침 Summary

**한 줄 요약:** home-sync 를 KST 1분 슬롯(08:00~20:04, 15:30~19:59 aftermarket)으로 전환하고 과거 거래일은 08:00~08:09 에 5분 해상도로 thinning 한다. `/api/home` index 는 max_rows 를 넘는 1500 슬롯을 `.range` 로 받는다. Scheduler 는 2쌍(intraday 08:00~20:02, home 08:00~20:04)으로 늘렸다. `/scanner`·`/` 는 공용 `useAutoRefresh` 로 30초 자동 갱신(탭 visible + KST 평일·비휴장일 08:00~20:05)하고, `/themes` 시스템 랭킹은 상위 20개만 보인다.

> **상태: incomplete.** Task 1·2 는 완료·검증됐다. Task 3(커밋 승인 게이트 → 커밋·push → 배포 4개)는 단계 A 에서 멈췄다. 커밋·push·배포·잡 실행은 0건이며 HEAD 는 `bef1c45` 그대로다.

## 완료 태스크

| Task | 이름 | 커밋 | 검증 |
| ---- | ---- | ---- | ---- |
| 1 (tracer, tdd) | 저녁 1분 슬롯 경로 end-to-end | 없음(unstaged) | `TASK1_OK` |
| 2 (auto, tdd) | 30초 자동 새로고침 + 홈 라벨·문구 + 테마 top 20 + 전량 게이트 | 없음(unstaged) | `TASK2_OK` |
| 3 (checkpoint) | 커밋 승인 게이트 → 배포 | — | 단계 A 에서 대기 |

## 게이트 수치

| 게이트 | 결과 | 기준선(260913-0em) |
| ------ | ---- | ------------------ |
| webapp 유닛 (vitest) | **838 passed · 1 skipped** (67 files) | 820 passed |
| server 유닛 | 254 passed (31 files) | — |
| home-sync | 148 passed (9 files) | — |
| intraday-sync | 154 passed (19 files) | — |
| shared / relay / 기타 워커 | shared 99 · relay 401 · candle 65 · co-movement 7 · limit-up 9 · discussion 77(+3 todo) · master 43 · news 75(+3 todo) · theme 48 — 전부 green | — |
| `pnpm typecheck` (전 워크스페이스, shared build 선행) | exit 0 | — |
| `pnpm --filter @gh-radar/webapp lint` | **warning 3** (theme-detail-client `ScannerEmpty` 미사용 · strategy-status-card.test `_msg` · use-relay-socket ref cleanup) — 전부 이번 변경과 무관한 선재 경고, error 0 | warning 3 |
| `pnpm --filter @gh-radar/webapp build` | Compiled successfully | — |
| Playwright 전량 (dev 포트 3100) | **132 passed · 0 failed · 9 skipped** (2.7m) | 132 passed · 0 failed |
| Playwright home.spec | 10 passed (390px 라벨 pill 넘침 단언 포함) | — |
| `bash -n` 스크립트 4종 | 통과 | — |

### RED 증거 (TDD)

- **server 테스트 7·8:** 수정 전 코드(`.limit(400)`)에서 `expected 400 to be 1200` / `expected 400 to be 1500` 로 실패했다. 이어서 plan 이 경고한 함정을 실측하려고 `.limit(1500)` 단일 쿼리로 임시 교체해 돌렸다. 결과는 **`expected 1000 to be 1200` / `expected 1000 to be 1500`** 이었다. mock `DB_MAX_ROWS=1000` 이 max_rows 절단을 재현함이 관측됐고, 원복 뒤 `.range` 페이지네이션으로 구현해 green 이 됐다.
- **home-sync index.test:** 구현 전 14 failed. computeSlot 5분 floor(`01:35` vs `01:37`), `closed` vs `aftermarket`, 20:00 afterClose=true, `canReusePrevClassification is not a function`, 15:40/20:04 skip, 08:05 thinning 미실행. clusterSurges 의 '5분 전' 기대 문자열 1건도 여기서 드러났다.
- **webapp:** 구현 전 6 files failed. 신규 모듈 2개 resolve 실패, usePolling 창 밖 interval `called 4 times`, useHomeQuery·HomeClient 30초 폴링 `called 1 times`, themes 25개 전부 렌더(`21` vs `20`).

## 구현 요점

- **shared** — `HomeSnapshotPayload.marketStatus` 에 `"aftermarket"` 를 추가했다(구간 JSDoc 포함). ":30 시점" 주석은 1분 슬롯 + thinning 으로 갱신했다. server·webapp 에 marketStatus 분기 코드는 없다(grep 재확인).
- **home-sync `computeSlot`** — KST 분을 그대로 쓰고(초 버림) 이름 붙은 상수로 판정한다: `REGULAR_OPEN_MIN` 540, `AFTERMARKET_START_MIN` 930, `CLOSE_SLOT_MIN` 1200, `LAST_SLOT_MIN` 1204. 반환 타입은 `HomeSnapshotPayload["marketStatus"]` 를 참조한다. skip 로그는 "마감(20:04) 초과 슬롯 — cycle skip (upsert 없음)".
- **Claude 게이트** — `export function canReusePrevClassification(prevRow, hash): prevRow is … & { payload }` 가 기존 hash-match 조건을 대체했다. 분기 동작(transient-empty → carry+applyLatestRates → cluster)은 그대로다.
- **thinning** — upsert 성공 뒤 `shouldThinPastSnapshots(now)` 가 참이면 try/catch 로 호출한다. 성공하면 `log.info({deleted})`, 실패하면 `log.warn({err}, …)` 이다. 휴장·마감 skip 경로에서는 호출하지 않는다.
- **prompt** — "직전 테마 구성 (직전 슬롯):" 헤더와 시스템 프롬프트·JSDoc 문구를 갱신했다.
- **intraday-sync** — 주석만 바꿨다. `git diff workers/intraday-sync/src` 는 `index.ts 2 +-`, `marketWindow.ts 9 +++++-----` 이고 +/- 줄은 전부 주석이다.
  - 시각 게이트 재확인 grep(`isKoreanMarketOpen\|15 \* 60`): `marketWindow.ts:26 REGULAR_CLOSE_MIN = 15 * 60 + 30` 1건뿐이다. 시각 게이트는 `isDailyWriteWindow`·`isEodClosePass` 두 함수뿐이고 판정 값은 무변경이다.
- **server** — `INDEX_LIMIT=1500`, `INDEX_PAGE=1000` `.range` 루프에서 짧은 페이지를 받으면 중단한다. 이후 `captured_at` 중복을 제거한다.
- **scripts**
  - deploy 2종은 `upsert_scheduler_job NAME SCHEDULE` 함수로 describe→update/create 를 한다. OAuth SA 는 기존과 같고 OIDC 는 쓰지 않는다.
  - smoke-intraday `--check-scheduler` 는 2개 × ENABLED+schedule+Asia/Seoul 을 보고, INV-6 은 2개 ENABLED 를 본다.
  - smoke-home `--check-scheduler` 는 INV-1~4 를 건너뛰고 INV-5(2개 ENABLED+schedule)·INV-6(2개 OAuth SA)만 본다.
  - 이번 실행에서 gcloud 는 호출하지 않았다.
- **webapp**
  - `isAutoRefreshWindow` 는 `+9h` 후 UTC getter 와 `isKrxHoliday(kstDateIso(now))` 로 판정한다. `.getHours/.getDay/.getMinutes` 는 0건이다.
  - `useAutoRefresh` 는 onTick 을 ref 에 담고 `[enabled, intervalMs]` 에 의존한다. interval 과 visibilitychange 둘 다 visible && 창 조건을 탄다.
  - `usePolling` 은 자체 setInterval 을 제거하고 effect 의존성을 `[key]` 로 줄였다. 주기 호출은 useAutoRefresh 에 위임하고 `refresh()` 는 게이트와 무관하다.
  - `useHomeQuery(params, { autoRefresh })` 를 받고 HomeClient 는 `{ autoRefresh: selected === null }` 을 넘긴다.
  - scanner-client 는 `AUTO_REFRESH_INTERVAL_MS` 를 import 한다(60_000 리터럴 0건).
- **라벨** — `slotPhaseLabel` 로 통합했다: 08시대 프리마켓 / ≥20:00 마감 / ≥15:30 애프터마켓. 725 슬롯 슬라이더에서 ArrowLeft 가 `20:04 · 마감 → 20:03 · 마감 → 20:02 · 마감` 로 1분씩 이동함을 실측했다(코드 변경 불필요).
- **themes** — `SYSTEM_RANK_LIMIT = 20` 이고 `rankedSystemThemes` 는 useMemo 로 slice 한다. `maxAvg` 는 표시 20개 기준이다. 빈 상태·에러 분기는 원본 length 기준이고 myThemes 는 무제한, `/api/themes` 계약은 무변경이다. 시스템 테마 행 수를 20 초과로 단언하는 e2e 는 없었다(themes.spec grep).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] clusterSurges.test.ts 의 옛 헤더 기대 문자열**
- **Found during:** Task 1 RED 실행
- **Issue:** plan 은 prompt.test.ts :295-297 만 명시했으나 `clusterSurges.test.ts:736` 도 `"직전 테마 구성 (5분 전):"` 을 기대해 헤더 변경 시 실패했다.
- **Fix:** 기대 문자열을 `"직전 테마 구성 (직전 슬롯):"` 으로 갱신했다.
- **Files modified:** workers/home-sync/src/ai/clusterSurges.test.ts

**2. [계측 기록] server RED 가 1000 이 아니라 400 으로 관측됨**
- **Found during:** Task 1 (f)
- **Issue:** plan 은 "수정 전 코드로 7 이 1000 으로 실패" 라 적었다. 하지만 수정 전 코드는 `.limit(1500)` 이 아니라 `.limit(400)` 이라 실제 실패값은 400 이었다.
- **Fix:** 400 RED 를 기록했다. 추가로 `.limit(1500)` 임시 교체 실측에서 1000 절단을 관측해 plan 의 max_rows 주장을 증명했고, 원복 뒤 구현했다.

**3. [손보는 표면 내 시각 결함] 홈 라벨 pill 폭 156→168px**
- **Found during:** Task 2 (e) 브라우저 실측(임시 Playwright 측정 spec — 측정 후 삭제)
- **Issue:** 390px 에서 "15:30 · 애프터마켓" 텍스트가 125.9px 이다. 156px 에선 live dot 과 텍스트 간격이 1px 로 거의 붙었다.
- **Fix:** 168px + `whitespace-nowrap` + `px-[14px]` 로 바꿨다. 재실측 결과 텍스트↔dot 7px, 문서 가로 스크롤 0, 슬라이더 트랙 99px 이다. e2e 에 `data-testid="home-slot-label"` 를 추가하고 390px 에서 잘림·줄바꿈·가로 스크롤 부재를 단언한다.
- **Files modified:** webapp/src/components/home/home-header.tsx, webapp/e2e/specs/home.spec.ts

**4. [TDD 순서] thinSnapshots.ts 구현을 테스트보다 먼저 작성**
- **Found during:** Task 1 (c)
- **Issue:** thinSnapshots 단위 테스트는 구현 파일 작성 직후에 썼다(해당 파일 단독 RED 미관측). 대신 index.test 의 08:05 thinning 배선 테스트는 구현 전에 RED 를 관측했다.
- **Fix:** 단위 테스트 7건을 behavior 목록 그대로 잠갔다(5분 행 비삭제, lt(trade_date) 2회, 250 → 100·100·50, select/delete error throw).

**5. [주석 정합] marketWindow.ts :23-24**
- plan 은 "NXT 애프터마켓 시작 15:40 정합" 만 요구했다. 원문의 "15:31 부터 NXT 애프터마켓 이미 개시(15:30~)" 가 15:40 과 모순되어 "15:31 부터는 정규장 밖(NXT 애프터마켓 15:40~ 개시 전후 — 보수적으로 창 밖 처리)" 로 고쳤다. 판정 코드는 무변경이다.

### 사용자 규칙에 따른 조정

- **커밋 0건:** GSD 태스크별 커밋 프로토콜 대신 사용자 전역 규칙(커밋 전 메시지 확인, HEAD 대비 working tree 전체를 한 번에 커밋)을 따랐다. 모든 변경은 unstaged 로 남겼다. `commits: 0` 은 누락이 아니라 의도다.
- **STATE.md / ROADMAP.md 미갱신:** 오케스트레이터 지시.

## Known Stubs

없음.

## Threat Flags

없음 — 새 표면(thinning delete 경로, 30초 폴링, Scheduler 2개)은 모두 plan `<threat_model>` T-g4c-01~08 에 이미 등록돼 있다. mitigate 항목의 반영 상태는 다음과 같다.
- T-01: `lt` 이중 안전장치 + 5분 필터 + 1000행·청크 100 — 단위 테스트로 잠김.
- T-02: `log.warn({ err })`.
- T-04: hidden·창 밖·과거 탐색 중 요청 0 — 훅·HomeClient 테스트로 잠김.
- T-05: `--check-scheduler`.
- T-07: 두 Scheduler 모두 OAuth SA 검사.
- T-08: intraday 주석만 변경.

## 배포 결과

사용자 승인 커밋 `ec81e59` (push 완료) 기준, 2026-09-13(일) 배포. 일요일이라 Job 수동 실행 0건.

- 워커 배포 스크립트는 서브에이전트 경로에서 권한 분류기에 막혀, 사용자가 `settings.local.json` 에 허용 규칙을 추가한 뒤 메인 세션에서 실행했다.
- **intraday-sync:** image `intraday-sync:ec81e59`.
- **home-sync:** image `home-sync:ec81e59`, `deploy-home-sync.sh complete`.
- **Scheduler 4개 (describe 결과, 모두 Asia/Seoul · ENABLED):**
  - `gh-radar-intraday-sync-cron`: `* 8-19 * * 1-5`
  - `gh-radar-intraday-sync-cron-20h`: `0-2 20 * * 1-5`
  - `gh-radar-home-sync-cron`: `* 8-19 * * 1-5`
  - `gh-radar-home-sync-cron-20h`: `0-4 20 * * 1-5`
- **server:** `deploy-server.sh` 의 smoke **PASS 15 / FAIL 0**, `/api/health` version `ec81e59`.
- **프로덕션 `/api/home`:** 200, index.length **1500**, captured_at 중복 0 → max_rows 1000 을 넘기는 페이지네이션을 실데이터로 확인.
- **webapp:** Vercel prebuilt prod `dpl_4iUccugLQk5HWq6GxYo2AP7F15WT` (Ready), `gh-radar-webapp.vercel.app` alias 가 이 배포를 가리킨다.

## 후속 확인 항목 (이 플랜 범위 밖 — 기록만)

1. (사용자 결정 3) 월 2026-09-14 16:05 이후 키움 애프터마켓 반영 실측 — 오케스트레이터 수행. 볼 것: stock_quotes/top_movers 갱신 시각·등락률, home_theme_snapshots aftermarket 슬롯, Cloud Logging intraday/home 사이클, 공개 시세 대조.
2. 월 19:59~20:04 마지막 슬롯과 화 08:00~08:09 thinning 로그(deleted 수, warn 0) 확인.
3. ka10001(KRX 단독) vs ka10027(통합) 가격 불일치(price > high) — 월요일 실측 후 결정.
4. vi-client 15:40 장 마감 판정이 브라우저 로컬 시각 기반이다.
5. discussion-sync 대상이 저녁 급등주로 바뀌는 부수효과.
6. candle-sync-eod 17:30 이 애프터마켓 도중 실행된다.
7. krxCalendar 2027 휴장일 seed 가 없다(2026-12-31 까지만).
8. home-sync 주말 수동 실행 시 가짜 스냅샷을 쓰는 가드 갭(주말은 cron 만 막음).
9. Claude 매분 호출 비용 추이 — 필요 시 `canReusePrevClassification` 에 N분 쿨다운 도입(사용자 결정 1 확장 지점).
10. (추가 관찰) news-sync Scheduler 는 여전히 `*/15 8-15 * * 1-5` 라 저녁 급등주 뉴스가 home-sync 입력에 늦게 들어올 수 있다. 범위 밖이라 미변경.

## Self-Check: PASSED

- 신규 파일 8개가 `git status --short` 에 `??` 로 존재한다(thinSnapshots.ts/test, auto-refresh-window.ts/test, use-auto-refresh.ts/test, use-home-query.test, home-client.test).
- 수정 파일 25개가 `M` 로 존재한다(`git diff --stat HEAD`: 25 files, +593 / −253).
- 임시 측정 spec(`webapp/e2e/specs/zz-tmp-measure-pill.spec.ts`)은 삭제되어 status 에 없다.
- 커밋 0건 — 의도(사용자 규칙). `git log -1` = `bef1c45`.
