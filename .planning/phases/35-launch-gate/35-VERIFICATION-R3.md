---
phase: 35-launch-gate
verified: 2026-11-01T06:00:00Z
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
  - .planning/phases/35-launch-gate/35-REVIEW-R2.md
  - .planning/phases/35-launch-gate/35-REVIEW-R3-DISPOSITION.md
  - .planning/phases/35-launch-gate/35-REVIEW-R3.md
  - relay/src/admin/admin-api.ts
  - relay/src/admin/launch-plan.ts
  - relay/src/tools/launch-backfill.ts
  - server/src/routes/admin-launch.ts
  - server/src/services/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - supabase/migrations/20261028200000_launch_project_mapping.sql
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/lib/launch-api.ts
  - webapp/src/lib/launch-plan-view.ts
covered_digest: "v3:sha256:117958a6c9499331e075ca938334182156c8e9157f918bba4e148637fb8eff7c"
behavior_unverified: 0
overrides_applied: 0
supersedes: 35-VERIFICATION-R2.md (2차 — stale: R2 리뷰 수정 4커밋 5b190db2 · 9e2ebeb6 · d6307858 · 588f44cc 전 기준)
human_verification:
  - test: "R3-WR-01 · R3-IN-01 · R3-IN-02 · R3-IN-03 · R3-IN-04 처리 결정 (35-REVIEW-R3-DISPOSITION.md 5건 모두 open)"
    expected: "고친다면 소형 갭 클로징: R3-WR-01 — reloadPlan 이 대상 서버의 다시 읽기 결과(반영 · 대체됨 · 못 읽음)를 저장 결과 줄에 덧붙여, 못 읽었을 때 「다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있음)」 로 표시. R3-IN-01~04 는 같이 묶거나 deferred. 안 고친다면 각 건 deferred + 사유를 35-REVIEW-R3-DISPOSITION.md 에 기록."
    why_human: "R3-WR-01 은 코드에 리뷰 서술 그대로 존재함을 확인했다(launch-map-tab.tsx:153-168 · 204 · 216-217). 그러나 결과를 모르는 저장(응답 timeout · 요청 throw) 직후 다시 읽기가 그 서버 값을 못 가져오는 예외 경로에서만 나온다. 정상 경로(ok + plan · ok + plan null 의 보낸 값 맞춤 · failed · 4xx)는 영향이 없고 라이브 UAT 로 입증돼 SC1~7 을 막지 않는다. 실거래 발사 시각 설정 화면에서 「반영됐는데 미반영으로 읽힘」 을 운영자가 감수할지는 코드로 판정할 수 없는 운영 판단이다."
  - test: "UI 검토(35-UI-REVIEW 15/24, 코드 전용) — 폰 390 · 키보드 포커스에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃 크기 (35-UAT.md test 3 pending)"
    expected: "포커스가 보이고 값이 hover 없이도 읽힌다."
    why_human: "시각 · 접근성은 grep 으로 확인할 수 없다. 목표 달성을 막는 항목은 아니다."
  - test: "35-UAT.md test 4(R2 처리 결정) 정리"
    expected: "R2 4건은 수정 커밋으로 닫혔고 R3 리뷰가 코드로 확인했다(아래). UAT test 4 를 pass 로 갱신하고, R3 결정(위 1번)을 새 항목으로 이관한다."
    why_human: "UAT 문서 갱신은 사용자 응답이 필요한 상태(awaiting user response)다."
---

# Phase 35: 발사 경계 지도 어드민 — 3차(R3) 재검증 보고서

**Phase Goal:** gh-trade 서버(KB120 · KYOBO119)의 16:00 예약 발사(Q16)와 09:00:30 개장차익 발사(N · A) 결과를 조각·머리 단위로 gh-radar DB 에 쌓고, 웹 어드민에서 날짜별 주문 내역과 날짜 범위 발사 경계 지도를 보며(범위 7: 발사 계획 조회·편집·저장·이력), relay 는 무변경으로 DB 쪽 해석이 `launch_pieces` · `launch_heads` 로 푼다.
**Verified:** 2026-11-01
**Status:** human_needed
**Re-verification:** 예 — `35-VERIFICATION-R2.md`(human_needed · 7/7)는 R2 리뷰 수정 커밋 4개 전 기준이라 stale. 범위 `git diff c85e0dc2 HEAD -- relay server webapp`(13 파일, 소스 7 + 테스트 6)를 직접 읽어 확인했다. 정본 `35-VERIFICATION.md` · `35-VERIFICATION-R2.md` 는 수정하지 않았다.

## 판정 요약

- **gaps 가 아니다.** ROADMAP SC1~7 중 FAILED 없음. R2 지적 4건은 코드로 닫힘을 확인했다. 새로 확인된 R3-WR-01 은 예외 경로(결과 모름 저장 뒤 다시 읽기 실패)의 표시 정확도 결함이고, SC7 이 요구한 관찰 가능한 행동(조회 · 편집 · 저장 · 이력 · 다음 발사부터 반영)의 부재가 아니다.
- **조용히 통과시키지 않는다.** R3-WR-01 은 R2-WR-01 수정이 만든 회귀다(수정 전에는 그 서버가 timeout 으로 바뀌어 「모름」 이 보였다). 실거래 발사 시각 설정 화면에서 나므로 운영자 triage 를 `human_needed` 로 남긴다. 5건 모두 disposition `open` 이다.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 1~7)

SC1~6 은 R2 보고서가 증거를 확인한 범위(마이그레이션 · 서버 라우트 · 순수 SVG 4패널 · 백필 · 라이브 UAT)와 이번 13 파일 diff 가 겹치지 않아 회귀 확인(테스트 재실행)만 했다. 이번 diff 가 SQL · 라우트 핸들러 · 백필 도구를 건드리지 않았음은 `git diff --stat` 로 확인.

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | 목업 2화면 → 계좌·사용자 열 노출 결정 → gh-trade 회신 | ✓ VERIFIED | R2 와 동일. 이번 diff 와 무관. |
| 2 | DB: `launch_heads` · `launch_pieces` + kind 17·18 DB 해석 · 사용자 경로 제외 · purge 미포함 | ✓ VERIFIED | 마이그레이션 변경 없음(diff 에 supabase 없음). |
| 3 | server 어드민 전용 라우트 · 날짜별 내역 · 날짜 범위 지도 RPC 1회 | ✓ VERIFIED | `server/tests/routes/admin-launch.test.ts` + `relay-admin-client.test.ts` 98 passed 재실행. 라우트 핸들러 변경 없음. |
| 4 | webapp 사이드바 메뉴 · 두 탭 · 순수 SVG 4패널 · 폰 390 | ✓ VERIFIED | webapp `launch-map-tab` + `launch-plan-view` 61 passed 재실행. 오케스트레이터 전체 회귀 webapp 5068 passed 1 skipped. |
| 5 | 백필 1회 적재 · 첨부 지도와 대조 일치 | ✓ VERIFIED | 이번 diff 가 백필을 건드리지 않음. 35-09 UAT(manual) 유지. |
| 6 | 첫 실물 날짜 라이브 UAT · 인박스 done | ✓ VERIFIED | R2 와 동일(35-11 SUMMARY · `261030` 후속 PK 보정). 프로덕션 접근 안 함. |
| 7 | 발사 계획 어드민 조회·편집·저장·이력 · 다음 발사부터 반영 | ✓ VERIFIED (경고 1건 + Info 4건 — R3-WR-01 · R3-IN-01~04) | 정상 경로는 35-18 라이브 UAT 로 입증. R2 결함 4건은 닫힘(아래). 새 결함은 timeout · throw 직후 다시 읽기 실패 경로 한정. |

**Score:** 7/7 truths verified (0 present, behavior-unverified).

### R2 findings 수정 확인 (코드 직접)

| ID | 판정 | 코드 근거 |
| -- | ---- | --------- |
| R2-WR-01 | ✓ 닫힘 (부작용 R3-WR-01) | `launch-map-tab.tsx:134-169` 에 `planSeq` · `planSeen` 세대 가드와 `markPlan`. `reloadPlan` 은 `status === 'ok'` 이고 `seq > planSeen[g]` 인 서버만 `take` 에 담아 `planStateWithReload` 로 서버별 반영한다. 이력은 id 로 합친다(`launch-plan-view.ts:252-266`). `fetchLaunchPlan({ fresh: true })` 가 `joined` 를 우회(`launch-api.ts:66-76`). 컴포넌트 테스트 `R2-WR-01 늦게 온 다시 읽기는 …` 통과. |
| R2-WR-02 | ✓ 닫힘 | relay `LaunchPlanService.read(keys, { deadlineAt })` 가 서버마다 `#within` 으로 접고 늦은 서버만 `timeout`(`launch-plan.ts:93-110`). GET 라우트가 도착 + `LAUNCH_PLAN_READ_DEADLINE_MS`(5초 < server 6초)를 넘긴다(`admin-api.ts:820-826`). relay `admin-launch-plan.test.ts` 18 passed. |
| R2-WR-03 | ✓ 닫힘 (잔여 R3-IN-04) | `relayNotSent`(`server/src/services/admin-launch.ts`) — status 0 + `ECONNREFUSED` · `ENOTFOUND` · `EAI_AGAIN`, 400 · 401 · 404, 503 `LAUNCH_PLAN_UNAVAILABLE` 만 offline. 연결 리셋 · 타임아웃 · 다른 5xx 는 여전히 timeout(1차 CR-01 의도 유지). `relay-admin-client.request` 가 `netCode` 를 싣는다(`relay-admin-client.ts` 347-352). |
| R2-IN-01 | ✓ 닫힘 | `onSave` rejection 분기가 `ApiClientError` 400 ≤ status < 500 이면 `rejectedSaveResultOf` → `failed`, 세대 안 올림 · 다시 읽지 않음(`launch-map-tab.tsx:213-220`). 그 밖은 timeout + `markPlan` + `reloadPlan`. |

### 3차 리뷰 findings 판정 — gaps 인가, triage 인가

| ID | 코드 확인 | 목표(SC7) 영향 | 판정 |
| -- | --------- | --------------- | ---- |
| R3-WR-01 | ✓ 존재. `reloadPlan`(`launch-map-tab.tsx:153-168`)은 `r.kind !== 'ready'` 면 무표시 return, 그 서버가 non-ok 면 `take` 에서 빠져 마지막 값을 유지하고, 요청 throw 는 `() => {}` 로 삼킨다. 이 호출은 timeout 저장(`:204` `if (reload) reloadPlan()`)과 throw 분기(`:216-217`)다. 이 두 경로에서 마지막 값 = 저장 전 값(`planStateWithSave` 는 plan null 이면 서버 값을 바꾸지 않음). 결과 줄 문구는 `saveResultViewOf` timeout 에 「다시 읽은 계획으로 확인」 으로 고정(`launch-plan-view.ts:329-333`)이고 다시 읽기 성패를 모른다. 다시 읽기 성패를 lastSave 에 반영하는 코드 없음(grep: `reread` 부재). | 호출 조건이 좁다: 결과 모름 저장(timeout · throw) + 직후 다시 읽기에서 그 서버가 non-ok 일 때만. `sentOnly`(ok + plan null) 경로는 보낸 값으로 먼저 맞춰 영향 없음. 값이 잘못 확정 적용되지는 않고(저장은 server 에서 끝남) 재저장은 같은 값 op 8 이라 무해하다. 새로고침하면 복구된다. 다만 R2-WR-02 의 5초 마감 때문에 혼잡 경로에서는 그 서버 timeout 이 오히려 흔해, 「반영됐는데 미반영으로 읽힘」 방향의 오보가 실거래 설정 화면에서 날 수 있다. | WARNING — human triage (R2-WR-01 수정의 회귀 · 예외 경로 · 표시 한정 · 자가 복구) |
| R3-IN-01 | ✓ 존재(throw 즉시 `markPlan` → `reloadPlan`, 서버 처리 완료 보장 없음). 창이 작음(PUT 처리 보통 1초). | 없음 | INFO |
| R3-IN-02 | ✓ 존재(`relayNotSent` 참이면 메시지가 `RELAY_FAILED_MESSAGE` 하나로 고정, relay status · code 가 이력에 안 남음). 확정 미반영 판정 자체는 맞음. | 없음(원인 가시성) | INFO |
| R3-IN-03 | ✓ 존재. `launch-api` 단위 테스트 부재(`fresh` 분기는 `fetchLaunchPlan` 목으로 인자만 단언), throw 경로 세대 · 대상 서버 non-ok 다시 읽기 테스트 없음. 이번 R3-WR-01 이 테스트가 덮지 않는 경로라는 것과 일치한다. | 없음 | INFO |
| R3-IN-04 | ✓ 존재(`ECONNABORTED` 는 NOT_SENT 집합 밖 → timeout). 보수적 방향. | 없음 | INFO |

**gaps 로 올리지 않는 근거.** (1) FAILED 로 내릴 must-have 가 없다 — R3-WR-01 은 SC1~7 의 행동 부재가 아니라 결과 모름 경로의 화면 안내 부정확이다. (2) 정상 경로 입증(35-18 라이브 UAT · 대상 단위 테스트 61 · 98 · 18 통과)을 뒤집는 증거가 아니다. (3) 방향이 「저장 전 값이 보임」 이지 「잘못된 값 확정 적용」 이 아니다. 반면 UNCERTAIN 으로 뭉개지도 않는다 — 존재는 확정이고 남은 것은 「고칠지 · 미룰지」 정책 결정이다.

참고: 운영자가 실거래 설정 화면의 R3-WR-01 을 목표 미달로 본다면 `gaps_found` 로 올려 `/gsd-plan-phase --gaps` 로 소형 클로징을 만들면 된다. 수정안은 R3 리뷰에 구체적이다(`reloadPlan` 이 대상 서버 결과를 `lastSave` 에 `reread: ok | superseded | failed` 로 반영, timeout 줄에 「다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있음)」 분기). 이 갭 클로징은 R2 에서 수정한 R2-WR-01 · WR-02 와 같은 파일을 다시 건드리므로 세 번째 반복이 될 수 있다 — 소형으로 한 번에 닫되, 표시만 바꾸는 최소 범위(「다시 읽지 못함」 안내)가 권고다.

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `relay/src/admin/launch-plan.ts` | ✓ VERIFIED | `read(keys, { deadlineAt })` · `#within` · `LAUNCH_PLAN_READ_DEADLINE_MS`. |
| `relay/src/admin/admin-api.ts` | ✓ VERIFIED | `GET /launch-plan` 이 도착 + 5초 마감을 전달. |
| `server/src/services/admin-launch.ts` | ✓ VERIFIED | `relayNotSent` · `saveLaunchPlanViaRelay`. |
| `server/src/services/relay-admin-client.ts` | ✓ VERIFIED | `netCode` 전달 · `isRelayErrorBody` export. |
| `webapp/src/components/admin/launch-map-tab.tsx` | ✓ VERIFIED (⚠ R3-WR-01) | 세대 가드 · 서버별 반영 · 4xx 분류. 다시 읽기 실패 신호 없음. |
| `webapp/src/lib/launch-plan-view.ts` · `launch-api.ts` | ✓ VERIFIED | `planStateWithReload` · `rejectedSaveResultOf` · `fresh` 옵션. |
| `supabase/migrations/…` · 백필 · server 라우트 | ✓ VERIFIED | 이번 diff 에서 변경 없음. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| webapp `onSave` timeout/throw | 서버 계획 다시 읽기 | `markPlan` → `reloadPlan` → `fetchLaunchPlan({fresh:true})` | WIRED (결과 표시 없음 — R3-WR-01) | |
| webapp 4xx 거부 | 확정 failed 줄 | `rejectedSaveResultOf` | WIRED | |
| server PUT | relay op 8 | `setLaunchPlan` → `relayNotSent` 분기 → offline / 그 밖 timeout | WIRED | |
| relay `GET /launch-plan` | `LaunchPlanService.read` | `deadlineAt` 전달 | WIRED | |
| server `RELAY_LAUNCH_PLAN_READ_TIMEOUT_MS`(6초) | relay 마감(5초) | 서로 주석으로 결합 | WIRED | 5 < 6 확인 |

### Data-Flow Trace (Level 4)

R2 와 동일: orders / map / plan 모두 RPC · relay op 94 실데이터(FLOWING). 이번 diff 는 반영 정책과 오류 분류만 바꿨고 원천을 바꾸지 않았다. 단 다시 읽기 실패 시 화면의 서버 계획이 「저장 전 값」 에 머무는 것은 R3-WR-01 로 기록.

### Behavioral Spot-Checks (재실행, 단일 파일 · maxWorkers=2)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| webapp 지도 탭 · 계획 뷰 | `vitest run launch-map-tab.test.tsx launch-plan-view.test.ts` | 61 passed | ✓ PASS |
| relay 계획 서비스 | `vitest run tests/admin-launch-plan.test.ts` | 18 passed | ✓ PASS |
| server 어드민 라우트 · relay 클라이언트 | `vitest run tests/routes/admin-launch.test.ts tests/services/relay-admin-client.test.ts` | 98 passed | ✓ PASS |

전체 회귀(오케스트레이터 인용, 재실행 안 함): relay 61 files 1835 passed · webapp 194 files 5068 passed 1 skipped · server 45 files 676 passed(앞 2회 themes/pnl 400 테스트의 ECONNRESET 1건 — 단독 통과, Phase 35 무관 flake) · 세 패키지 `tsc --noEmit` exit 0. 「테스트 통과」 는 R3-WR-01 이 없다는 증거가 아니다 — 그 경로를 덮는 테스트가 없다(R3-IN-03). 코드 직접 확인으로 존재를 판정했다.

### Probe Execution

해당 없음 — `probe-*.sh` 를 선언한 PLAN 없음.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ---------- | ------ | -------- |
| LAUNCH-01 ~ LAUNCH-16 | 전 PLAN | ⚠️ UNTRACED | R2 와 동일한 문서 부채. PLAN frontmatter `requirements: []`, `REQUIREMENTS.md` 에 LAUNCH-* 없음, ROADMAP Phase 35 `Requirements: TBD`. 고아 요구사항은 아님. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `webapp/src/components/admin/launch-map-tab.tsx` | 153-168 | 다시 읽기의 non-ok · throw · absent 가 무표시 종료 (R3-WR-01) | ⚠️ Warning | 위 판정표 |
| `webapp/src/components/admin/launch-map-tab.tsx` | 209-218 | throw 즉시 다시 읽기 · 서버 처리 완료 보장 없음 (R3-IN-01) | ℹ️ Info | |
| `server/src/services/admin-launch.ts` | 258-264 | relay 거절 원인(status · code)이 offline 문구에서 사라짐 (R3-IN-02) | ℹ️ Info | |
| `TBD\|FIXME\|XXX` 스캔 | — | 이번 diff 소스 7 파일에서 0건 | ℹ️ Info | 디버트 마커 게이트 통과 |

### Human Verification Required

#### 1. R3 findings 5건 처리 결정

**Test:** `35-REVIEW-R3-DISPOSITION.md` 의 R3-WR-01 · R3-IN-01~04 를 `fixed` / `deferred` / `skipped` 로 정한다.
**Expected:** 고침 → R3-WR-01 만 소형 갭 클로징(다시 읽기 결과를 결과 줄에 반영: 못 읽었을 때 「다시 읽지 못했어요 · 보이는 값은 저장 전 값일 수 있음」). 미룸 → 각 건 deferred + 사유.
**Why human:** 정상 경로가 입증돼 목표 달성은 막지 않지만, 실거래 발사 시각 설정 화면의 예외 경로 오안내를 감수할지는 운영 판단이다. 권고: R3-WR-01 은 표시만 바꾸는 최소 범위로 고치고, R3-IN-01~04 는 미뤄도 무방(R3-IN-03 테스트 공백은 WR-01 수정 때 같이 채우는 것을 권장).

#### 2. UI 검토 항목 (35-UAT.md test 3 pending · 35-UI-REVIEW 15/24 코드 전용)

**Test:** 폰 390 · 키보드에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃을 눈으로 본다.
**Expected:** 포커스가 보이고 값이 hover 없이도 읽힌다.
**Why human:** 시각 · 접근성은 grep 으로 확인 불가. 목표 달성을 막는 항목은 아니다.

#### 3. UAT test 4 갱신

**Test:** `35-UAT.md` test 4(R2 처리 결정)를 pass 로 갱신하고 R3 결정을 이관한다.
**Expected:** R2 4건 fixed 가 UAT 에 반영된다.
**Why human:** UAT 는 사용자 응답 대기 상태.

### Gaps Summary

must-have 7개 모두 VERIFIED, FAILED 없음. R2 리뷰 4건(R2-WR-01 · 02 · 03 · R2-IN-01)은 코드와 테스트로 닫혔음을 확인했다. 3차 리뷰의 Warning 1건(R3-WR-01)은 R2-WR-01 수정의 반대편 회귀(다시 읽기 실패 신호 부재)이며 목표 달성을 막지 않는다(gaps 아님). 남은 일:

1. R3 findings 5건 triage(고침/미룸) — human 항목 1.
2. UI 눈 확인 — human 항목 2.
3. 문서 부채(코드 무관, R2 와 동일): LAUNCH-01~16 미등록(`requirements: []` · REQUIREMENTS.md 없음 · ROADMAP `TBD`), ROADMAP Phase 35 체크박스/진행도 · STATE.md · VALIDATION frontmatter 불일치는 `phase.complete` 때 정리.
4. 범위 밖: `dma_gateway_identities.test.sql` 16 not ok(기존), `relay/src/generated/**` 다른 세션 변경, server themes/pnl 400 테스트 ECONNRESET flake(Phase 35 무관).

Deferred(Step 9b): 후속 phase(36 계좌 예산)가 이 결함들을 명시적으로 다루지 않음 — 이월 불가.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier) — 3차(R3) 재검증_
