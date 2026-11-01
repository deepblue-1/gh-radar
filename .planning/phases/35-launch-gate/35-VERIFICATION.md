---
phase: 35-launch-gate
verified: 2026-11-01T08:20:00Z
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
  - .planning/phases/35-launch-gate/35-REVIEW-R4-DISPOSITION.md
  - .planning/phases/35-launch-gate/35-REVIEW-R4.md
  - relay/src/admin/admin-api.ts
  - relay/src/admin/launch-plan.ts
  - relay/src/tools/launch-backfill.ts
  - server/src/routes/admin-launch.ts
  - server/src/services/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - supabase/migrations/20261028200000_launch_project_mapping.sql
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/components/admin/launch-plan-editor.tsx
  - webapp/src/lib/launch-api.ts
  - webapp/src/lib/launch-plan-view.ts
covered_digest: "v3:sha256:69e139bf8e6ebbe6da3be4f07a0f2d87eef69fc703206a235b07b745a2d48b73"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "R4-IN-01 · R4-IN-02 · R4-IN-03 처리 결정 (35-REVIEW-R4-DISPOSITION.md 3건 모두 open · 모두 Info)"
    expected: "고친다면 소형 묶음 1회: R4-IN-01 — offline 사유가 있으면 결과 칩 · 이력 알약 글자를 「서버 연결 안 됨」 대신 「미반영」(title = 사유)으로, R4-IN-02 — saveRowSeenIn 증거를 이 어드민(admin_email)이 보낸 행으로 좁히거나 주석에 한계 명시, R4-IN-03 — relay-admin-client.test.ts 의 connectTimeoutMs 50 → 500 · timeoutMs 비율 유지. 안 고친다면 각 건 deferred + 사유를 35-REVIEW-R4-DISPOSITION.md 에 기록."
    why_human: "세 건 모두 코드에 리뷰 서술 그대로 존재함을 확인했다(launch-plan-view.ts:158-159 · 426-428 · 313-325, relay-admin-client.test.ts 연결 상한 50ms). 그러나 R4-IN-01 은 원인 가시성(판정 · 이력 message 칸 기록은 맞음), R4-IN-02 는 서로 다른 두 세션이 같은 칸에 같은 값을 거의 동시에 보내는 창, R4-IN-03 은 테스트 신뢰성이며 SC1~7 의 행동 부재가 아니다. 고칠지 미룰지는 운영 판단이다."
  - test: "UI 검토(35-UI-REVIEW 15/24, 코드 전용) — 폰 390 · 키보드 포커스에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃 크기 (35-UAT.md test 3 pending)"
    expected: "포커스가 보이고 값이 hover 없이도 읽힌다."
    why_human: "시각 · 접근성은 grep 으로 확인할 수 없다. 목표 달성을 막는 항목은 아니다."
  - test: "35-UAT.md test 5(R3 처리 결정) 정리"
    expected: "R3 5건은 모두 수정 커밋으로 닫혔고(35-REVIEW-R3-DISPOSITION.md 5/5 fixed) R4 리뷰가 코드로 확인했다. UAT test 5 를 pass 로 갱신하고 R4 결정(위 1번)을 새 항목으로 이관한다."
    why_human: "UAT 문서 갱신은 사용자 응답이 필요한 상태(awaiting user response)다."
superseded_by: 35-VERIFICATION-R4.md (정본 본문은 1차 기록 그대로 · 프런트매터만 R4 승계)
round3_verified: 2026-11-01T06:00:00Z
round3_status: human_needed
round3_score: 7/7 must-haves verified
round3_covered_digest: "v3:sha256:109245a3a8283592a2dda73d78c7364b3e7f8099e1d7e1ace38b4f23e3290b7d"
round3_human_verification:
  - test: "R3-WR-01 · R3-IN-01 · R3-IN-02 · R3-IN-03 · R3-IN-04 처리 결정 (35-REVIEW-R3-DISPOSITION.md 5건 모두 open)"
    expected: "고친다면 소형 갭 클로징: R3-WR-01 — reloadPlan 이 대상 서버의 다시 읽기 결과(반영 · 대체됨 · 못 읽음)를 저장 결과 줄에 덧붙여, 못 읽었을 때 「다시 읽지 못했어요(보이는 값은 저장 전 값일 수 있음)」 로 표시. R3-IN-01~04 는 같이 묶거나 deferred. 안 고친다면 각 건 deferred + 사유를 35-REVIEW-R3-DISPOSITION.md 에 기록."
    why_human: "R3-WR-01 은 코드에 리뷰 서술 그대로 존재함을 확인했다(launch-map-tab.tsx:153-168 · 204 · 216-217). 그러나 결과를 모르는 저장(응답 timeout · 요청 throw) 직후 다시 읽기가 그 서버 값을 못 가져오는 예외 경로에서만 나온다. 정상 경로(ok + plan · ok + plan null 의 보낸 값 맞춤 · failed · 4xx)는 영향이 없고 라이브 UAT 로 입증돼 SC1~7 을 막지 않는다. 실거래 발사 시각 설정 화면에서 「반영됐는데 미반영으로 읽힘」 을 운영자가 감수할지는 코드로 판정할 수 없는 운영 판단이다."
  - test: "UI 검토(35-UI-REVIEW 15/24, 코드 전용) — 폰 390 · 키보드 포커스에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃 크기 (35-UAT.md test 3 pending)"
    expected: "포커스가 보이고 값이 hover 없이도 읽힌다."
    why_human: "시각 · 접근성은 grep 으로 확인할 수 없다. 목표 달성을 막는 항목은 아니다."
  - test: "35-UAT.md test 4(R2 처리 결정) 정리"
    expected: "R2 4건은 수정 커밋으로 닫혔고 R3 리뷰가 코드로 확인했다(아래). UAT test 4 를 pass 로 갱신하고, R3 결정(위 1번)을 새 항목으로 이관한다."
    why_human: "UAT 문서 갱신은 사용자 응답이 필요한 상태(awaiting user response)다."
round3_report: 35-VERIFICATION-R3.md
round2_verified: 2026-11-01T02:00:00Z
round2_status: human_needed
round2_score: 7/7 must-haves verified
round2_covered_digest: "v3:sha256:aa6e3ba0c685fa5e534a785ca603e55a3a8ebda4e7193a3bbe72ad87face04d4"
round2_human_verification:
  - test: "R2-WR-01 · R2-WR-02 · R2-WR-03 · R2-IN-01 처리 결정 (35-REVIEW-R2-DISPOSITION.md 4건 모두 open)"
    expected: "고친다면 갭 클로징(소형): ① 웹 reloadPlan 에 순번 가드 + 서버별 ok 일 때만 반영 ② relay read() 에 요청 마감 · 서버별 timeout 접기 ③ server 의 「확실히 안 보낸」 실패(ECONNREFUSED · 401 · 503 LAUNCH_PLAN_UNAVAILABLE · 400)는 offline 유지. 안 고친다면 각 건을 deferred + 사유로 기록."
    why_human: "세 건 모두 코드에 리뷰 서술 그대로 존재함을 확인했다. 그러나 전부 저장 timeout · relay 혼잡 · relay 거절이라는 예외 경로에서만 나오고, 정상 경로(조회 · 편집 · 저장 · 이력 · 다음 발사부터 반영)는 라이브 UAT 로 입증돼 phase 목표(SC1~7)를 막지 않는다. 실거래 발사 시각 설정 화면의 오표시를 운영자가 감수할지는 코드로 판정할 수 없는 운영 판단이다."
  - test: "UI 검토(35-UI-REVIEW 15/24, 코드 전용) — 폰 390 · 키보드 포커스에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃 크기, 35-UAT.md pending 3건"
    expected: "포커스가 보이고 값이 hover 없이도 읽힌다."
    why_human: "시각 · 접근성은 grep 으로 확인할 수 없다. 목표 달성을 막는 항목은 아니다. (1차 human 항목 중 CR-01 · WR-01 · WR-02 처리 결정은 1ef9a8fe 까지의 수정으로 해소됐고 위 R2 항목으로 대체됐다.)"
round2_report: 35-VERIFICATION-R2.md
round1_verified: 2026-11-01T00:00:00Z
round1_status: human_needed
round1_score: 7/7 must-haves verified
round1_covered_digest: "v3:sha256:d3bee23e61093d127141d92793c51f91e3465e57509e6c60569d70a65cfde5bf"
round1_human_verification:
  - test: "35-REVIEW CR-01 처리 결정 — 발사 계획 저장에서 「송신 뒤 결과 불명」 을 offline(미반영) 으로 확정 보고하는 경로를 고칠지, 알려진 한계로 받아들일지"
    expected: "고친다면 relay/server/webapp 세 곳에서 송신 뒤 실패를 timeout(모름)으로 보고하고 웹이 계획을 재조회한다. 받아들인다면 35-REVIEW-DISPOSITION.md 에 deferred + 사유를 적는다."
    why_human: "코드는 리뷰가 지적한 그대로 존재한다(검증함). 정상 경로는 라이브 UAT 로 입증됐고 이 결함은 연결 끊김·타임아웃 같은 예외 경로에서만 나온다. 이 결함이 phase 목표를 막는지, 아니면 후속 quick 으로 미룰지는 실거래 설정 안전에 대한 운영자 판단이다."
  - test: "WR-01(저장 ok 인데 plan:null 이면 화면이 저장 전 계획 유지)·WR-02(백필 pieceKey/headKey 에 fire_base 누락) 처리 결정"
    expected: "WR-01 은 CR-01 과 같은 웹 onSave 분기에서 같이 고친다. WR-02 는 백필이 이미 적재 완료라 재사용 시에만 영향 — 고치거나 deferred 로 기록."
    why_human: "둘 다 목표 달성(조회·편집·저장 · 백필 적재)은 막지 않지만 disposition 이 전부 open 이라 사람이 triage 해야 한다."
  - test: "UI 검토(35-UI-REVIEW 15/24) — µs 입력칸 포커스 링 · 지도 값 hover 전용 · 작은 터치 타깃"
    expected: "폰 390 · 키보드 포커스에서 입력칸 포커스가 보이고, 지도 값이 터치에서도 읽힌다."
    why_human: "시각·접근성은 grep 으로 확인할 수 없다. 코드 전용 검토 결과이며 목표 달성을 막는 항목은 아니다."
---

# Phase 35: 발사 경계 지도 어드민 Verification Report

**Phase Goal:** gh-trade 서버(KB120 · KYOBO119)의 16:00 예약 발사(Q16)와 09:00:30 개장차익 발사(N · A) 결과를 조각·머리 단위로 gh-radar DB 에 쌓고, 웹 어드민에서 날짜별 주문 내역과 날짜 범위 발사 경계 지도를 보며(범위 7: 발사 계획 조회·편집·저장·이력), relay 는 무변경으로 DB 쪽 해석이 `launch_pieces` · `launch_heads` 로 푼다.
**Verified:** 2026-11-01
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria 1~7)

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | 목업 2화면을 웹 톤으로 다시 그려 사용자 확인 → 계좌·사용자 열 노출 결정 → gh-trade 회신 | ✓ VERIFIED | 인박스 `261027-launch-gate-admin.md` `status: done` · `done_commit: 2a81523f`. D-02(계좌 · DMA 사용자 열 노출, 어드민 전용)가 `server/src/routes/admin-launch.ts` 머리 주석에 반영됨. 35-01 은 메인 세션 manual(저장소 밖 노트)이라 SUMMARY 기록이 근거. |
| 2 | DB: `launch_heads` · `launch_pieces`(논리 키 · 최신 seq 조건부 upsert · 재생 멱등) + kind 17·18 DB 쪽 해석 · 사용자 json 래퍼에서 17·18 제외 · 15·16 purge 에 미포함 | ✓ VERIFIED | 마이그레이션 7개 존재(`20261027200000` 표 · 조건부 upsert RPC · 어드민 RPC 2 / `…200100` apply 재정의 · reproject / `20261028200000` 정식 칸 매핑 `launch_project_event` / `…200100` 이력 표 / `20261030*` 3개 후속). 표 둘 다 RLS 켬 · `REVOKE ALL … FROM PUBLIC, anon, authenticated`. `dma_strategy_apply` 가 `kind IN (17,18)` 을 `launch_project_event` 로 투영(:162-164), `dma_strategy_events_for_user_json` 은 `NOT IN (17,18)`(:271), `dma_order_events_for_user` 도 제외(:331). purge 함수는 kind 15 전용 하나뿐(`20261006090000`)이고 17·18 purge 는 없음. PK 는 후속 `20261030200000` 이 `fire_base` 포함으로 확장. relay 는 kind 를 해석하지 않음(해석은 SQL). pgTAP launch_gate 62 · launch_gate_apply 38 · launch_project_mapping 36 · launch_plan_changes 26 · dma_strategy_apply 30 PASS(오케스트레이터 증거, 재실행 안 함). |
| 3 | server: 어드민 전용 라우트(requireAuth → requireAdmin) · 날짜별 내역 · 날짜 범위 지도(RPC 1회) | ✓ VERIFIED | `adminLaunchRouter.use("/launch", requireAuth(), requireAdmin())` · `GET /launch/orders` · `GET /launch/map` · (범위 7) `GET /launch/plan` · `PUT /launch/plan/:gateway/:fire/:market`. `app.ts` 에서 `adminRouter` 앞에 마운트. 입력은 zod 검증 후 400. `admin-launch.test.ts` 61 tests 재실행 PASS(401 · 403 포함). |
| 4 | webapp: 사이드바 Admin 그룹 메뉴 · 두 화면(탭) · 순수 SVG 4패널 · 폰 390 가로 스크롤 | ✓ VERIFIED | `app-sidebar.tsx` `NAV_ADMIN_LAUNCH = { href: "/admin/launch", label: "발사" }`. `launch-client.tsx` 가 주문 내역 · 경계 지도 두 탭(쿼리 `tab` · `d` · `fire` · `range` 가 진실 원본). `launch-gate-chart.tsx`(528줄) 순수 `<svg viewBox>` · 래퍼 `overflow-x-auto`. `launch-map-tab.tsx` 의 `panelsOf` 가 패널 배열을 만들어 렌더. webapp 테스트(launch-map-tab 22 · launch-orders-tab 8 · launch-map 등 81) 재실행 PASS. Playwright admin-launch + sidebar-tree 30/30(390 포함, 오케스트레이터 증거). |
| 5 | 백필: ndjson → `launch_pieces` 1회 적재 스크립트(머리는 조각에서 계산) · 10/12~10/26 적재 후 첨부 지도와 대조 일치 | ✓ VERIFIED | `scripts/launch-backfill.{sh,ts}` · `relay/src/tools/launch-backfill.ts` 존재, relay `launch-backfill.test.ts` · shared `launch.test.ts`(첨부 `group()` 기대값 공용 픽스처) 재실행 PASS. 35-09 SUMMARY 에 `--apply` 후 UAT 에서 사용자가 「같아」 로 대조 일치 확인한 원문 인용(사용자 답 — 코드로 재현 불가한 manual). 인박스 `261027-launch-backfill.md` done `8c7c999a`. WR-02(키에 `fire_base` 누락)는 적재가 끝난 일회성 도구의 잠재 결함 — 아래 Gaps/Warnings. |
| 6 | 첫 실물 날짜 라이브 UAT(16:00:01 이후 적재 → 어드민 당일 행) · 인박스 `261027-launch-gate-admin.md` 및 후속 정식 인계 노트 `status: done` | ✓ VERIFIED | 35-11 SUMMARY: q16 10-28·29 · n0930 10-28~10-30 당일 조각 · 머리 source journal 적재, kind 18 `next_offset_us` = 계획 첫 조각 확인. 그 UAT 에서 A 재확인 회차 키 충돌을 찾아 quick 261030-d7b 로 고쳐 원격 적용 · reproject 복구(PK 에 `fire_base` — 이 저장소의 `20261030200000` 로 존재 확인). 인박스 두 노트(`261027-launch-gate-admin` · `261028-launch-plan-contract`) 모두 `status: done` + `done_commit` 확인. 라이브 결과는 SUMMARY 기록이 근거(프로덕션 접근 안 함). |
| 7 | 발사 계획 어드민 — 서버 × 발사 × 시장 칸 조회·편집·저장(admin op 8) · 변경 이력 DB · 서버 재기동 없이 다음 발사부터 | ✓ VERIFIED (경고 있음 — CR-01 · WR-01) | `relay/src/admin/launch-plan.ts` `LaunchPlanService.set`(전 조회 → op 8 → 후 조회) · server `saveLaunchPlanViaRelay` + `recordLaunchPlanChange`(D-29, 모든 결과 이력 1행) · `launch_plan_changes` 표(RLS · REVOKE · outcome CHECK) · webapp `launch-plan-bar` · `launch-plan-editor` · `launch-map-tab.onSave`. 35-18 SUMMARY: 라이브 UAT A~E — 저장한 시각이 다음 회차 kind 17 첫 조각 `sent_rel_us` · 09:00:30 `offset_used_us` 에 실제 반영(KB120 −248 → −249 · KYOBO119 −200 → −180 → −130). 인박스 `261027-launch-plan-admin` done `9f51eb45`. **정상 경로는 입증됨. 결과 보고의 예외 경로는 결함 존재 — 아래 Critical/Warning.** |

**Score:** 7/7 truths verified (0 present, behavior-unverified). CR-01 이 열린 상태라 전체 상태는 human_needed.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20261027200000_launch_gate.sql` | 표 2 + 조건부 upsert + 백필/어드민 RPC | ✓ VERIFIED | 576줄 · RLS 켬 · REVOKE 3줄 · service_role 전용 |
| `supabase/migrations/20261027200100_launch_gate_apply.sql` | apply 재정의 · reproject · 래퍼/타임라인 제외 | ✓ VERIFIED | 17·18 서브블록 투영 · 사용자 경로 제외 |
| `supabase/migrations/20261028200000_launch_project_mapping.sql` | kind 17·18 정식 칸 매핑 | ✓ VERIFIED | 칸별 jsonb_build_object 실매핑(스텁 아님) |
| `supabase/migrations/20261028200100_launch_plan_changes.sql` | 변경 이력 표 + RPC 2 | ✓ VERIFIED | outcome CHECK 5종 |
| `supabase/migrations/20261030{120000,200000,210000}_*.sql` | 후속 보정(체결 조인 · fire_base PK · 뒤탐침) | ✓ VERIFIED | PK 확장 확인 |
| `server/src/routes/admin-launch.ts` · `services/admin-launch.ts` | 라우트 4 · relay 호출 · 이력 | ✓ VERIFIED | 150줄 · 관문 · zod · 이력 try/catch |
| `relay/src/admin/launch-plan.ts` · `relay/src/tools/launch-backfill.ts` | 계획 서비스 · 백필 도구 | ✓ VERIFIED | 실구현 · 테스트 PASS (WR-02 참고) |
| `packages/shared/src/launch.ts` · `launch-plan.ts` | 계약 · 검증 · 「쐈다면」 판정 · group() 이식 | ✓ VERIFIED | shared 70 tests PASS |
| `webapp/src/app/admin/launch/page.tsx` + `components/admin/launch-*.tsx`(6) | 두 탭 · 4패널 · 계획 줄 · 편집 칸 | ✓ VERIFIED | 합 2271줄 · 실데이터 흐름(아래 Level 4) |
| `scripts/launch-backfill.{sh,ts}` | CLI(dry-run/--apply/--status/--reproject) | ✓ VERIFIED | 존재 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| relay 원문 적재(`dma_strategy_events`) | `launch_pieces/heads` | `dma_strategy_apply` → `launch_project_event` | WIRED | `kind IN (17,18)` 분기 `PERFORM launch_project_event` · reproject 도 같은 함수 |
| server `/launch/orders` · `/launch/map` | RPC `launch_orders_for_admin` · `launch_map_for_admin` | `getLaunchOrders` · `getLaunchMap` | WIRED | 라우트 → 서비스 → RPC 1회 |
| server `PUT /launch/plan` | relay op 8 | `RelayAdminClient.setLaunchPlan` → `LaunchPlanService.set` → `ADMIN_OP.SetLaunchPlan` | WIRED | 라이브 UAT 로 end-to-end 입증(35-18) |
| server `PUT /launch/plan` | `launch_plan_changes` | `recordLaunchPlanChange` | WIRED | 실패해도 응답 불변 + logger.error |
| webapp 사이드바 | `/admin/launch` | `NAV_ADMIN_LAUNCH` | WIRED | |
| webapp `launch-map-tab` | server 라우트 | `launch-api.ts` fetch | WIRED | 응답 → `panelsOf` → 패널 렌더 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `launch-orders-tab.tsx` | 머리 · 조각 | `/api/admin/launch/orders` → `launch_orders_for_admin` RPC | 예 — 35-09/11 SUMMARY 라이브 적재 행 확인 | ✓ FLOWING |
| `launch-map-tab.tsx` | `resp` → `panels` | `/api/admin/launch/map` → `launch_map_for_admin` RPC | 예 — 백필 UAT 에서 첨부 지도와 일치 | ✓ FLOWING |
| `launch-plan-bar.tsx` | 서버별 계획 | `GET /launch/plan` → relay op 94 스냅샷 | 예 — 35-18 라이브 UAT | ✓ FLOWING |

### Behavioral Spot-Checks (재실행, 단일 파일 · maxWorkers=2)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| shared 계약 · 판정 · group() | `vitest run src/__tests__/launch.test.ts src/__tests__/launch-plan.test.ts` | 70 passed | ✓ PASS |
| server 어드민 라우트(401/403/400/PUT) | `vitest run tests/routes/admin-launch.test.ts` | 61 passed | ✓ PASS |
| relay 백필 · 계획 서비스 | `vitest run tests/launch-backfill.test.ts tests/admin-launch-plan.test.ts` | 32 passed | ✓ PASS |
| webapp 지도 · 주문 탭 · 기하 | `vitest run launch-map-tab · launch-orders-tab · launch-map` | 81 passed | ✓ PASS |

pgTAP · Playwright · 전체 회귀는 오케스트레이터가 이미 돌린 결과(pgTAP 192 · e2e 30 · relay 1824 · webapp 5042)를 재사용했다. 원격 Supabase/Cloud Run 은 건드리지 않았다.

### Probe Execution

해당 없음 — 이 phase 는 `scripts/*/tests/probe-*.sh` 형 probe 를 선언하지 않았다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| LAUNCH-01 ~ LAUNCH-16 | 전 PLAN | **PLAN frontmatter `requirements:` 가 19개 전부 `[]`. REQUIREMENTS.md 에 LAUNCH-* 항목 없음. ROADMAP Phase 35 `Requirements: TBD`.** ID 는 35-VALIDATION.md 의 추적용 라벨로만 존재 | ⚠️ UNTRACED | 고아 요구사항은 아님(어디에도 등록된 적 없음). 각 라벨은 VALIDATION 표를 통해 아래 truth 와 검증으로 대응된다 — 01 → SC1 · 02/03/04 → SC2 · 05 → SC3 · 06a~e → SC4 · 07 → SC5 · 08 → SC6 · 09~16 → SC7. 정식 요구사항 추적(REQUIREMENTS.md 등록 · Traceability 표)이 비어 있어 문서 부채. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `relay/src/admin/launch-plan.ts` / `server/src/services/admin-launch.ts` / `webapp/.../launch-map-tab.tsx` | 110-117 / 229-247 / 146 | 송신 뒤 결과 불명을 `offline`(확정 미반영)으로 보고 + 이력에 영구 기록 (CR-01) | ⚠️ Warning(리뷰는 Critical) | 아래 상세 |
| `webapp/.../launch-map-tab.tsx` + `webapp/src/lib/launch-plan-view.ts` | 141-144 / 198-207 | ok 인데 `plan:null` 이면 재조회 없이 저장 전 계획 유지 (WR-01) | ⚠️ Warning | 아래 상세 |
| `relay/src/tools/launch-backfill.ts` | 362-370 | `pieceKey`/`headKey` 에 `fire_base` 누락 — 직접 확인함 (WR-02) | ⚠️ Warning | 일회성 도구 · 적재 완료 |
| `TBD\|FIXME\|XXX` 스캔 | — | 이 phase 의 리뷰 파일에서 미참조 디버트 마커 발견 못 함(리뷰 71개 파일 · 리뷰어가 보고하지 않음) | ℹ️ Info | |

**CR-01 가중 평가.** 코드는 리뷰 서술 그대로다 — relay `set()` 은 `out.kind !== "result"` 를 `outcome: out.kind` 로 그대로 돌려주고(송신 뒤 끊김 = `offline`), server 는 relay 호출의 어떤 실패든 `offline(RELAY_FAILED_MESSAGE)` 로 접으며, webapp 은 `saveLaunchPlan` throw 를 무조건 `offline` 으로 만든다. 즉 op 8 이 이미 반영됐을 수 있는 경우를 화면이 「미반영: 서버 연결 안 됨」 으로 말하고 `launch_plan_changes` 에 `outcome='offline'` 으로 굳는다. 실거래 발사 시각 설정이라 오보 비용이 크다. 다만 이것은 SC7 이 요구한 동작(조회 · 편집 · 저장 · 이력 · 다음 발사부터 반영)이 아니라 그 **예외 경로의 보고 정확도** 이고, 정상 경로는 라이브 UAT 와 단위 테스트 61건으로 입증됐다. 그래서 truth 를 FAILED 로 내리지 않고 WARNING 으로 두되, disposition 이 `open` 인 critical 을 verifier 가 조용히 통과시킬 수 없어 status 를 `passed` 가 아닌 `human_needed` 로 둔다.

**WR-01.** 같은 `onSave` 분기의 문제 — ok 인데 relay 가 후 조회 값을 못 싣는 드문 경우(마감 임박 · 후 조회 실패)에 화면이 저장 전 계획을 보이고 「저장」 이 다시 켜져, 되돌리기가 저장 전 값으로 간다. 목표 달성을 막지 않는 UX 결함.

**WR-02.** 백필은 10/12~10/26 적재를 끝냈고(35-09) 그 기간에 A 재확인 회차는 없었다. 도구를 재사용해 `fire_base` 가 있는 ndjson 을 먹일 때만 조각이 조용히 버려진다. 목표 영향 없음.

### Human Verification Required

#### 1. CR-01 처리 결정 (판단 필요)

**Test:** 35-REVIEW CR-01 을 고칠지(relay/server/webapp 송신 뒤 실패를 `timeout`(모름)으로 보고 + 웹 재조회 + relay 전체 마감 상한) 알려진 한계로 받아들일지 정한다.
**Expected:** 고침 → `/gsd-code-review-fix 35` 또는 갭 클로징 plan, 이후 `35-REVIEW-DISPOSITION.md` 가 `fixed`. 받아들임 → `deferred` + 사유 기록.
**Why human:** 정상 경로는 입증돼 목표 달성은 막지 않으나, 실거래 설정의 오보를 운영자가 감수할지는 코드로 판정할 수 없다. 권고: CR-01 + WR-01 은 같은 `onSave` 분기라 한 번에 고치는 소형 갭 클로징.

#### 2. WR-01 · WR-02 triage

**Test:** 두 경고의 disposition 을 `fixed` / `deferred` 로 정한다.
**Expected:** WR-01 은 CR-01 과 같이 고침. WR-02 는 백필 재사용 계획이 없으면 deferred.
**Why human:** 전부 `open` 상태(7건 모두)라 triage 가 필요하다.

#### 3. UI 검토 항목 (35-UI-REVIEW 15/24, 코드 전용)

**Test:** 폰 390 · 키보드에서 µs 입력칸 포커스 링 · 지도 값의 터치 가독성 · 터치 타깃 크기를 눈으로 본다.
**Expected:** 포커스가 보이고 값이 hover 없이도 읽힌다.
**Why human:** 시각 · 접근성은 grep 으로 확인 불가. 목표 달성을 막는 항목은 아님.

### Gaps Summary

must-have 7개는 모두 코드 · 테스트 · 라이브 UAT 기록으로 확인됐다(FAILED 없음). DB 해석 투영 · 사용자 경로 17·18 제외 · 어드민 전용 라우트 · 순수 SVG 4패널 · 백필 · 라이브 적재 · 발사 계획 저장의 end-to-end 반영이 실제 코드에 있고 stub 이 아니다.

남은 일은 목표 미달이 아니라 정리다.

1. **열린 리뷰 결함(CR-01 critical · WR-01 · WR-02)** — 발사 계획 저장의 예외 경로 보고 정확도와 백필 키. 사람이 고칠지 deferred 할지 정해야 한다.
2. **추적 문서 부채** — LAUNCH-01~16 이 PLAN frontmatter(`requirements: []`) · REQUIREMENTS.md · ROADMAP(`Requirements: TBD`) 어디에도 등록돼 있지 않다. VALIDATION 의 라벨만 존재.
3. **문서 상태 불일치(코드 무관)** — ROADMAP 의 Phase 35 체크박스 `[ ]` 와 `Plans: 17/19 plans executed`(실제 19개 전부 `[x]` · SUMMARY 19개 존재), `35-VALIDATION.md` frontmatter 는 `nyquist_compliant: false` 인데 같은 파일 sign-off 는 「`nyquist_compliant: true` set in frontmatter」 로 체크돼 있다(오케스트레이터는 true 로 보고). STATE.md 는 `stopped_at: Completed 35-11-PLAN.md`, `EXECUTING` 으로 뒤처져 있다. phase 완료 처리(`phase.complete`) 때 정리 필요.
4. **범위 밖(이 phase 무관)** — `dma_gateway_identities.test.sql` 16 not ok(기존 · deferred-items.md), 작업트리의 `relay/src/generated/**` 미커밋 수정(gh-trade 261031 인박스 · 다른 세션).

Deferred(Step 9b): 후속 phase 중 이 결함들을 명시적으로 다루는 항목은 없다 — Phase 36 은 계좌 예산 · 손익 범위.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
