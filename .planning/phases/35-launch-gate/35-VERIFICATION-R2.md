---
phase: 35-launch-gate
verified: 2026-11-01T02:00:00Z
status: human_needed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/35-launch-gate/35-01-PLAN.md
  - .planning/phases/35-launch-gate/35-01-SUMMARY.md
  - .planning/phases/35-launch-gate/35-02-PLAN.md
  - .planning/phases/35-launch-gate/35-02-SUMMARY.md
  - .planning/phases/35-launch-gate/35-03-PLAN.md
  - .planning/phases/35-launch-gate/35-03-SUMMARY.md
  - .planning/phases/35-launch-gate/35-04-PLAN.md
  - .planning/phases/35-launch-gate/35-04-SUMMARY.md
  - .planning/phases/35-launch-gate/35-05-PLAN.md
  - .planning/phases/35-launch-gate/35-05-SUMMARY.md
  - .planning/phases/35-launch-gate/35-06-PLAN.md
  - .planning/phases/35-launch-gate/35-06-SUMMARY.md
  - .planning/phases/35-launch-gate/35-07-PLAN.md
  - .planning/phases/35-launch-gate/35-07-SUMMARY.md
  - .planning/phases/35-launch-gate/35-08-PLAN.md
  - .planning/phases/35-launch-gate/35-08-SUMMARY.md
  - .planning/phases/35-launch-gate/35-09-PLAN.md
  - .planning/phases/35-launch-gate/35-09-SUMMARY.md
  - .planning/phases/35-launch-gate/35-10-PLAN.md
  - .planning/phases/35-launch-gate/35-10-SUMMARY.md
  - .planning/phases/35-launch-gate/35-11-PLAN.md
  - .planning/phases/35-launch-gate/35-11-SUMMARY.md
  - .planning/phases/35-launch-gate/35-12-PLAN.md
  - .planning/phases/35-launch-gate/35-12-SUMMARY.md
  - .planning/phases/35-launch-gate/35-13-PLAN.md
  - .planning/phases/35-launch-gate/35-13-SUMMARY.md
  - .planning/phases/35-launch-gate/35-14-PLAN.md
  - .planning/phases/35-launch-gate/35-14-SUMMARY.md
  - .planning/phases/35-launch-gate/35-15-PLAN.md
  - .planning/phases/35-launch-gate/35-15-SUMMARY.md
  - .planning/phases/35-launch-gate/35-16-PLAN.md
  - .planning/phases/35-launch-gate/35-16-SUMMARY.md
  - .planning/phases/35-launch-gate/35-17-PLAN.md
  - .planning/phases/35-launch-gate/35-17-SUMMARY.md
  - .planning/phases/35-launch-gate/35-18-PLAN.md
  - .planning/phases/35-launch-gate/35-18-SUMMARY.md
  - .planning/phases/35-launch-gate/35-19-PLAN.md
  - .planning/phases/35-launch-gate/35-19-SUMMARY.md
  - .planning/phases/35-launch-gate/35-REVIEW-R2-DISPOSITION.md
  - .planning/phases/35-launch-gate/35-REVIEW-R2.md
  - relay/src/admin/admin-api.ts
  - relay/src/admin/launch-plan.ts
  - relay/src/tools/launch-backfill.ts
  - server/src/routes/admin-launch.ts
  - server/src/services/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - supabase/migrations/20261028200000_launch_project_mapping.sql
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/lib/launch-plan-view.ts
covered_digest: "v3:sha256:aa6e3ba0c685fa5e534a785ca603e55a3a8ebda4e7193a3bbe72ad87face04d4"
behavior_unverified: 0
overrides_applied: 0
supersedes: 35-VERIFICATION.md (1차 — stale: 1차 리뷰 7건 수정 전 기준)
human_verification:
  - test: "R2-WR-01 · R2-WR-02 · R2-WR-03 · R2-IN-01 처리 결정 (35-REVIEW-R2-DISPOSITION.md 4건 모두 open)"
    expected: "고친다면 갭 클로징(소형): ① 웹 reloadPlan 에 순번 가드 + 서버별 ok 일 때만 반영 ② relay read() 에 요청 마감 · 서버별 timeout 접기 ③ server 의 「확실히 안 보낸」 실패(ECONNREFUSED · 401 · 503 LAUNCH_PLAN_UNAVAILABLE · 400)는 offline 유지. 안 고친다면 각 건을 deferred + 사유로 기록."
    why_human: "세 건 모두 코드에 리뷰 서술 그대로 존재함을 확인했다. 그러나 전부 저장 timeout · relay 혼잡 · relay 거절이라는 예외 경로에서만 나오고, 정상 경로(조회 · 편집 · 저장 · 이력 · 다음 발사부터 반영)는 라이브 UAT 로 입증돼 phase 목표(SC1~7)를 막지 않는다. 실거래 발사 시각 설정 화면의 오표시를 운영자가 감수할지는 코드로 판정할 수 없는 운영 판단이다."
  - test: "UI 검토(35-UI-REVIEW 15/24, 코드 전용) — 폰 390 · 키보드 포커스에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃 크기, 35-UAT.md pending 3건"
    expected: "포커스가 보이고 값이 hover 없이도 읽힌다."
    why_human: "시각 · 접근성은 grep 으로 확인할 수 없다. 목표 달성을 막는 항목은 아니다. (1차 human 항목 중 CR-01 · WR-01 · WR-02 처리 결정은 1ef9a8fe 까지의 수정으로 해소됐고 위 R2 항목으로 대체됐다.)"
---

# Phase 35: 발사 경계 지도 어드민 — 2차(R2) 재검증 보고서

**Phase Goal:** gh-trade 서버(KB120 · KYOBO119)의 16:00 예약 발사(Q16)와 09:00:30 개장차익 발사(N · A) 결과를 조각·머리 단위로 gh-radar DB 에 쌓고, 웹 어드민에서 날짜별 주문 내역과 날짜 범위 발사 경계 지도를 보며(범위 7: 발사 계획 조회·편집·저장·이력), relay 는 무변경으로 DB 쪽 해석이 `launch_pieces` · `launch_heads` 로 푼다.
**Verified:** 2026-11-01
**Status:** human_needed
**Re-verification:** 예 — 정본 `35-VERIFICATION.md`(human_needed · 7/7)가 1차 리뷰 7건 수정(f448079f ~ 1ef9a8fe) 전 기준이라 stale. 이 문서는 수정분과 2차 리뷰 `35-REVIEW-R2.md` 를 반영한 갱신판이다(정본은 수정하지 않음).

## 판정 요약

- **gaps 가 아니다.** 7개 must-have(ROADMAP SC1~7) 중 FAILED 없음. 2차 리뷰 Warning 3건 · Info 1건은 코드에서 모두 리뷰 서술대로 확인했지만, 전부 **예외 경로(저장 timeout · relay 혼잡 · relay 거절)의 보고·표시 정확도**다. phase 목표인 적재 · 조회 · 편집 · 저장 · 이력 · 다음 발사부터 반영은 이 경로를 밟지 않고 막히지도 않는다.
- **조용히 통과시키지도 않는다.** 4건 모두 `open` 이고, 그중 R2-WR-01 은 1차 수정이 만든 회귀(수정 전에는 마지막 계획이 화면에 남았다)이며 실거래 설정 화면에서 나므로 운영자 triage 를 `human_needed` 로 남긴다.
- 1차 human 항목 중 CR-01(offline 오보)은 **수정 확인**: relay `set()` 이 송신 뒤 실패를 `timeout` 으로 돌려주고(`relay/src/admin/launch-plan.ts:110-117`), server 는 송신 뒤 실패를 `timeout` + `RELAY_UNKNOWN_SAVE_MESSAGE` 로(`server/src/services/admin-launch.ts` `saveLaunchPlanViaRelay`), 웹은 throw 를 `timeout` 으로 보이고 `reloadPlan()` 을 부른다(`launch-map-tab.tsx:176-181`). WR-01(`plan:null` 이면 보낸 값으로 맞춤 + 다시 읽기 — `planStateWithSentEntry` · `planNeedsReload`), WR-02(`fire_base` 키)도 수정 확인.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 1~7)

1차 보고서에서 증거를 확인한 SC1~6 은 수정 커밋 7개가 건드린 범위(백필 검증 · 화면 표기 · 계획 저장 보고)와 겹치지 않거나 오히려 강화돼 회귀 확인만 했다(마이그레이션 · 서버 라우트 · 순수 SVG 4패널 · 백필 도구 존재와 테스트 통과).

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | 목업 2화면 → 계좌·사용자 열 노출 결정 → gh-trade 회신 | ✓ VERIFIED | 1차와 동일(인박스 `261027-launch-gate-admin` done). 수정분과 무관. |
| 2 | DB: `launch_heads` · `launch_pieces` + kind 17·18 DB 해석 · 사용자 경로 제외 · purge 미포함 | ✓ VERIFIED | 마이그레이션 변경 없음(수정 7개 커밋은 SQL 을 건드리지 않음). `20261028200000_launch_project_mapping.sql` 실매핑 확인. PK 의 `fire_base` 는 `20261030200000`. |
| 3 | server 어드민 전용 라우트 · 날짜별 내역 · 날짜 범위 지도 RPC 1회 | ✓ VERIFIED | `server/tests/routes/admin-launch.test.ts` 61 passed 재실행(401 · 403 · 400 · PUT 포함). |
| 4 | webapp 사이드바 메뉴 · 두 탭 · 순수 SVG 4패널 · 폰 390 | ✓ VERIFIED | webapp `launch-map-tab` + `launch-plan-view` 54 passed 재실행. 전체 회귀 webapp 5061(오케스트레이터). IN-01~03 수정으로 주소 정본화 · 머리 카드 표기 · 저장 중 입력 보존이 강화됨. |
| 5 | 백필 1회 적재 · 첨부 지도와 대조 일치 | ✓ VERIFIED | relay `launch-backfill.test.ts` 재실행 PASS(relay 2파일 38 passed). WR-02 수정으로 `pieceKey` · `headKey` 가 DB PK 와 같아졌고(`fire_base` 포함) IN-04 로 입력 검증이 강화됨. 적재·대조 일치 자체는 35-09 UAT 사용자 확인(manual, 1차와 동일). |
| 6 | 첫 실물 날짜 라이브 UAT · 인박스 done | ✓ VERIFIED | 1차와 동일(35-11 SUMMARY, `261030` 후속 PK 보정). 프로덕션 접근 안 함. |
| 7 | 발사 계획 어드민 조회·편집·저장·이력 · 다음 발사부터 반영 | ✓ VERIFIED (경고 4건 — R2-WR-01~03 · R2-IN-01) | 정상 경로는 35-18 라이브 UAT(저장한 시각이 다음 회차 kind 17 첫 조각 · 09:00:30 `offset_used_us` 에 반영)로 입증. 1차 CR-01 · WR-01 의 정확도 결함은 수정됨(위). 새로 확인된 R2 결함은 예외 경로 한정(아래 판정표). |

**Score:** 7/7 truths verified (0 present, behavior-unverified).

### 2차 리뷰 findings 판정 — gaps 인가, triage 인가

각 항목을 코드에서 직접 확인했다.

| ID | 코드 확인 | 목표(SC7) 영향 | 판정 |
| -- | --------- | --------------- | ---- |
| R2-WR-01 | ✓ 존재. `launch-map-tab.tsx:136-143` `reloadPlan` 이 `r.kind === 'ready'` 면 `setPlan({kind:'ready', resp: r.resp})` 로 통째 덮어씀. 순번 · 서버별 ok 확인 없음. server 는 relay 실패 시 200 + 두 서버 offline 을 돌려주므로(`allServers(offline)`) 실패 모양도 `ready` 로 도착. | 호출 조건이 좁다: `planNeedsReload`(ok 인데 plan null, 또는 timeout) 또는 요청 throw 일 때만. 저장 자체와 이력은 이미 server 에서 끝났고 저장 요청 값은 사용자가 입력한 초안이지 화면 기준값이 아니다. 오염되는 것은 화면의 계획 줄 · 되돌리기 기준 · 이력 표시이며 새로고침하면 복구된다. | WARNING — human triage (회귀지만 예외 경로 · 표시 한정 · 자가 복구) |
| R2-WR-02 | ✓ 존재. `launch-plan.ts:80-88` `read()` 에 마감 없음, `admin-api.ts:819-823` GET 도 마감을 안 넘김. `set()` 만 `deadlineAt` · `#within`. server 6초(`RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS`)가 FIFO 대기 + 5초를 넘기면 두 서버 offline. | 혼잡한 순간 조회가 일시 offline 으로 떨어질 뿐 저장·적재 진실을 바꾸지 않음. 평시 조회는 라이브 UAT 로 입증. | WARNING — human triage (R2-WR-01 과 한 묶음으로 고치는 것을 권고) |
| R2-WR-03 | ✓ 존재. `saveLaunchPlanViaRelay` 가 relay 미설정 외의 모든 실패(연결 거부 · 401 · 503 `LAUNCH_PLAN_UNAVAILABLE` · 400 · 모양 위반)를 `timeout` 으로 접음. `relay-admin-client.request` 가 연결 오류를 `{status:0}` 로만 돌려 호출부가 가를 수 없음. | 보수적 방향(「모름」)의 오분류. 영구 이력(`launch_plan_changes`)에 「반영됐을 수 있음」 잡음이 쌓일 수 있음(특히 relay 롤백 때 503). 잘못된 값이 적용되거나 적용이 숨겨지지는 않음. | WARNING — human triage (BLOCKER 아님) |
| R2-IN-01 | ✓ 존재(`launch-map-tab.tsx:176-181` 모든 throw → timeout). | 4xx 세션 만료 · 400 도 「반영됐는지 몰라요」 로 표시. 이력과 무관한 표시 문제. | INFO |

**gaps 로 올리지 않는 근거.** (1) FAILED 로 내릴 must-have 가 없다 — 어느 것도 SC1~7 이 요구한 관찰 가능한 행동(적재 · 조회 · 편집 · 저장 · 이력 · 다음 발사부터 반영)의 부재가 아니다. (2) 세 Warning 모두 정상 경로 입증(35-18 라이브 UAT A~E, server 61건)을 뒤집는 증거가 아니다. (3) 방향이 모두 「모름/표시 유실」 이고 「잘못된 값을 확정 적용」 이 아니다. 반면 **UNCERTAIN 으로 뭉개지도 않는다** — 존재 여부는 확정이고, 남은 것은 「고칠지 · 미룰지」 라는 정책 결정이다. 따라서 human_needed.

참고: 이 판정이 틀렸다고 운영자가 판단하면(실거래 설정 화면의 R2-WR-01 을 목표 미달로 본다면) `gaps_found` 로 올려 `/gsd-plan-phase --gaps` 로 소형 클로징을 만들면 된다. 수정안은 R2 리뷰에 이미 구체적이다(순번 가드 · 서버별 ok 병합 / `read()` 마감 / ECONNREFUSED · 401 · 503 은 offline 유지).

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `supabase/migrations/20261027200000_launch_gate.sql` 외 7개 | ✓ VERIFIED | 1차와 동일. 수정 커밋이 SQL 을 건드리지 않음. |
| `server/src/routes/admin-launch.ts` · `services/admin-launch.ts` | ✓ VERIFIED | 라우트 · 서비스 · 이력. `saveLaunchPlanViaRelay` 가 timeout 으로 보고하도록 수정됨(R2-WR-03 잔여). |
| `relay/src/admin/launch-plan.ts` | ✓ VERIFIED | `set()` 마감 묶기 · 송신 뒤 timeout. `read()` 마감 없음(R2-WR-02). |
| `relay/src/tools/launch-backfill.ts` · `scripts/launch-backfill.ts` | ✓ VERIFIED | `fire_base` 키 · 어휘 검증 수정 반영. |
| `webapp/src/components/admin/launch-*.tsx` · `lib/launch-*.ts` | ✓ VERIFIED | 실구현 · 데이터 흐름. `reloadPlan` 가드 없음(R2-WR-01). |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| relay 원문(`dma_strategy_events`) | `launch_pieces/heads` | `dma_strategy_apply` → `launch_project_event` | WIRED | 1차와 동일 |
| server `/launch/orders` · `/launch/map` | RPC | `getLaunchOrders` · `getLaunchMap` | WIRED | |
| server `PUT /launch/plan` | relay op 8 | `setLaunchPlan` → `LaunchPlanService.set` → `ADMIN_OP.SetLaunchPlan` | WIRED | 라이브 UAT |
| server `PUT /launch/plan` | `launch_plan_changes` | `recordLaunchPlanChange` | WIRED | |
| webapp `onSave` 실패 분기 | 서버 계획 다시 읽기 | `reloadPlan` → `fetchLaunchPlan` | WIRED (가드 없음 — R2-WR-01) | |
| webapp 사이드바 → `/admin/launch` | | `NAV_ADMIN_LAUNCH` | WIRED | |

### Data-Flow Trace (Level 4)

1차와 동일: orders / map / plan-bar 모두 RPC · relay op 94 실데이터(FLOWING). 수정분은 표기·키 변경이라 데이터 원천을 바꾸지 않았다.

### Behavioral Spot-Checks (재실행, 단일 파일 · maxWorkers=2)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| server 어드민 라우트 | `vitest run tests/routes/admin-launch.test.ts` | 61 passed | ✓ PASS |
| relay 계획 서비스 · 백필 | `vitest run tests/admin-launch-plan.test.ts tests/launch-backfill.test.ts` | 38 passed | ✓ PASS |
| webapp 지도 탭 · 계획 뷰 | `vitest run launch-map-tab.test.tsx launch-plan-view.test.ts` | 54 passed | ✓ PASS |

전체 회귀(오케스트레이터): shared 852 · relay 1832 · server 667 · webapp 5061 통과. server 첫 실행의 Phase 34 `accum-report.test.ts` ECONNRESET 1건은 재실행 4회 통과(일시적 · 이 phase 무관). 아래 R2 결함은 테스트가 덮지 않는 경로이므로 「테스트 통과」 가 「결함 없음」 의 증거가 아니다 — 코드 직접 확인으로 존재를 판정했다.

### Probe Execution

해당 없음 — `probe-*.sh` 를 선언한 PLAN 없음.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| LAUNCH-01 ~ LAUNCH-16 | 전 PLAN | ⚠️ UNTRACED | PLAN 19개 frontmatter `requirements: []` 전부 확인. `REQUIREMENTS.md` 에 LAUNCH-* 없음(grep 0건). ROADMAP Phase 35 `Requirements: TBD`(326행). ID 는 35-VALIDATION.md 의 추적용 라벨뿐이라 고아 요구사항은 아니다. 1차와 동일한 문서 부채. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `webapp/.../launch-map-tab.tsx` | 136-143 | 응답 통째 덮어쓰기 · 순번 가드 없음 (R2-WR-01) | ⚠️ Warning | 위 판정표 |
| `relay/src/admin/launch-plan.ts` | 80-88 | `read()` 마감 없음 (R2-WR-02) | ⚠️ Warning | |
| `server/src/services/admin-launch.ts` | 229-250 | 확실히 안 보낸 실패도 timeout 으로 이력 기록 (R2-WR-03) | ⚠️ Warning | |
| `webapp/.../launch-map-tab.tsx` | 176-181 | 4xx 도 timeout 표기 (R2-IN-01) | ℹ️ Info | |
| `TBD\|FIXME\|XXX` 스캔 | — | 수정·검증 대상 파일(webapp launch-*.tsx · relay launch-plan.ts · backfill · server admin-launch) 에서 0건 | ℹ️ Info | 디버트 마커 게이트 통과 |

### Human Verification Required

#### 1. R2 findings 4건 처리 결정

**Test:** `35-REVIEW-R2-DISPOSITION.md` 의 R2-WR-01/02/03 · R2-IN-01 을 `fixed` / `deferred` 로 정한다.
**Expected:** 고침 → 소형 갭 클로징 한 번(웹 `reloadPlan` 순번 가드 · 서버별 ok 병합 + relay `read()` 마감 + server 확정 미송신 실패는 offline). 미룸 → 각 건 deferred + 사유.
**Why human:** 정상 경로가 입증돼 목표 달성은 막지 않지만, 실거래 발사 시각 설정 화면의 예외 경로 오표시를 감수할지는 운영 판단이다. 권고: R2-WR-01 · R2-WR-02 는 같은 「다시 읽기」 경로라 같이 고치고, R2-WR-03 · R2-IN-01 은 이력 잡음/표시 문제라 미뤄도 무방.

#### 2. UI 검토 항목 (35-UAT.md pending 3건 중 UI)

**Test:** 폰 390 · 키보드에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃을 눈으로 본다.
**Expected:** 포커스가 보이고 값이 hover 없이도 읽힌다.
**Why human:** 시각 · 접근성은 grep 으로 확인 불가. 목표 달성을 막는 항목은 아니다.

### Gaps Summary

must-have 7개 모두 VERIFIED, FAILED 없음. 1차의 열린 critical(CR-01)과 WR-01 · WR-02 는 수정 커밋으로 해소됐음을 코드로 확인했다. 2차 리뷰 Warning 3건은 수정이 추가한 「다시 읽기」 경로와 그 주변의 예외 경로 결함이며 목표 달성을 막지 않는다(gaps 아님). 남은 일:

1. R2 findings 4건 triage(고침/미룸) — 위 human 항목 1.
2. UI 눈 확인 — human 항목 2.
3. 문서 부채(코드 무관, 1차와 동일): LAUNCH-01~16 미등록(`requirements: []` · REQUIREMENTS.md 없음 · ROADMAP `TBD`), ROADMAP Phase 35 체크박스/진행도 · STATE.md · VALIDATION frontmatter 불일치는 `phase.complete` 때 정리.
4. 범위 밖: `dma_gateway_identities.test.sql` 16 not ok(기존), `relay/src/generated/**` 다른 세션 변경.

Deferred(Step 9b): 후속 phase(36 계좌 예산 · 손익)가 이 결함들을 명시적으로 다루지 않음 — 이월 불가.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier) — 2차(R2) 재검증_
