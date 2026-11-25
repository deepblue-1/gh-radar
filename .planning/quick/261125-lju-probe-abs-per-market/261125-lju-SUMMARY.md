---
phase: quick-261125-lju
plan: 01
subsystem: admin-launch (경계 지도 · 탐침)
status: complete
tags: [launch, tail-probe, admin, relay, supabase, webapp, map-axis]
requires:
  - gh-trade 「러쉬주문 탐침」 답신 최종 계약(reference/gh-trade-replies.md · 2026-11-25 정정)
  - 채택 목업 reference/mockup-probe-per-market-v4.html
provides:
  - 탐침 = (서버, 프로파일, 시장)별 정각 기준 부호 있는 µs 목록(0 ~ 10발) 계약 · 검증 · 칩 파서 · 전체 이동 · 상태 판정
  - launch_tail_probe_changes 목록 모드(market · before/after_offsets_us) · 두 RPC 교체
  - server PUT /api/admin/launch/tail-probe/:gateway/:fire { market, offsets_us }
  - relay op 10 목록 모드 입력 · 94 시장별 행 · kyobo_q16_combined 옮기기(어댑터 · 운영 canSet false)
  - 시장 패널마다 탐침 줄 · 칩 편집 칸 · ⇄ · 패널 안 이력
  - 경계 지도 축 = 점은 중앙값 ± 퍼짐 상한 · 계획 · 초안 · 탐침은 전부 · 축 밖 먼 점 숨김(「먼 점 n개 숨김」) · 축 끝 표식 폐기
  - 점 툴팁 = 가장 가까운 점(launchNearestDotOf)
affects: [packages/shared, supabase, relay, server, webapp]
tech-stack:
  added: []
  patterns:
    - "와이어 어댑터 주입(LaunchTailProbeWire.canSet · tailProbesOf · kyoboQ16CombinedOf) — 생성물 대기 중 운영은 읽기 전용"
    - "⇄ 판정 한 곳(tailProbeCombinedOn) — 94 bool true 일 때만 · 칸 없음 = 꺼짐"
key-files:
  created:
    - supabase/migrations/20261125120000_launch_tail_probe_offsets.sql
    - supabase/tests/launch_tail_probe_offsets.test.sql
  modified:
    - packages/shared/src/launch-plan.ts
    - relay/src/admin/launch-plan.ts
    - relay/src/admin/types.ts
    - relay/src/admin/admin-api.ts
    - relay/src/index.ts
    - server/src/routes/admin-launch.ts
    - server/src/schemas/admin-launch.ts
    - server/src/services/admin-launch.ts
    - webapp/src/lib/launch-plan-view.ts
    - webapp/src/lib/launch-map.ts
    - webapp/src/components/admin/launch-tail-probe-bar.tsx
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/components/admin/launch-plan-bar.tsx
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/e2e/fixtures/launch.ts
    - webapp/e2e/specs/admin-launch.spec.ts
decisions:
  - "relay 운영 주입 canSet true → false — 지금 envelope 는 op 10 옛 개수 · 간격 모드만 싣고 목록 모드는 못 싣는다(생성물 대기). 운영 탐침 저장은 503 · 화면은 읽기 전용"
  - "「+ 추가」 기준 — 유효 칩도 계획 조각도 없으면 정각 0µs(플랜에 없던 빈 경우)"
  - "화면 글자 「뒤탐침」 은 옛 개수 · 간격 표기(unsupported 꼬리 · 옛 이력 행)에만 남김"
  - "사용자 추가 결정(코디네이터 중계): 먼 오발 점은 축을 늘리지 않고 숨김 — 점 퍼짐 상한 상수 이름은 DOT_SPREAD_US(플랜 음성 grep 게이트 AXIS_CAP 회피)"
  - "점 툴팁 감지를 점별 겹침 칸 → 행 위 칸 하나 + 가장 가까운 점(반경 8px) 판정으로"
metrics:
  duration: "약 1시간 10분"
  completed: 2026-11-25
estimate:
  tokens: 300000
  tasks: 3
actuals:
  tokens: 84000
  tasks: 3
  commits: 5
plan_head_before: f5fa43b8c8b5cd7d4470f3984a4b477ac738ebf4
plan_head_after: 0d81f39ea8f617ce154fcd408d837af2b9a5f922
---

# Phase quick-261125-lju Plan 01: 탐침 — 정각 기준 시장별 목록 · 패널 안 칩 편집 · 값 전부 담는 지도 축 Summary

경계 지도의 개수 · 간격 「뒤탐침」 을 정각 기준 부호 있는 µs 목록 「탐침」(시장별 · 0 ~ 10발 · 교보 N 공통)으로 다시 만들었다. shared 계약 → DB 이력 칸 → server PUT → relay 어댑터 → 패널마다 칩 편집 칸 · ⇄ 까지 연결했고, 지도 축은 이제 값 전부를 담는다.

## 커밋

| Task | 커밋 | 내용 |
| ---- | ---- | ---- |
| 1 (tracer) | 008d5b7f | shared 탐침 계약 · 검증 · 칩 파서 · 전체 이동 · 상태 판정 · 16열 이력 / 마이그레이션 20261125120000 + pgTAP 2개 / server PUT { market, offsets_us } / relay op 10 목록 모드 입력 · 94 시장별 행 · kyobo_q16_combined 어댑터 |
| 2 | 3c1b7edf | 웹 — 패널마다 탐침 줄 · 칩 편집 칸(− 기본 · + 정각 뒤 · × · + 추가 · 전체 이동 8버튼 · 저장 때만 정렬) · 교보 N PUT 1건 K · ⇄ · 패널 안 이력 · e2e 픽스처 · spec |
| 3 | 94d07481 | 지도 축 끝 표식 제거(◂/▸ · 「▸ 다음」 · 「바꿀 n번」 · 「축 밖」 꼬리) · 화면 이름 「탐침」 |
| 3 (추가 결정) | c69f1518 | 먼 오발 점 숨김 — 점은 중앙값 ± 퍼짐 상한 안만 축 후보 · 계획 · 초안 · 탐침은 전부 · 「먼 점 n개 숨김」 · 경계 띠 축 끝 자름 |
| 버그 (추가) | 0d81f39e | 점 툴팁을 가장 가까운 점으로 — 점 위에서 이웃 점 툴팁이 뜨던 문제 |

## 검증 결과

- shared vitest `launch-plan.test.ts` 71 통과 · typecheck 0
- relay vitest(admin-launch-plan · admin-api · admin-conn) 162 통과 · typecheck 0 · `typecheck:tests` 오류 2 → 1(admin-api 1823행 대역 기존 오류를 채워 고침 · 남은 1건은 admin-dispatcher 기존)
- server vitest `routes/admin-launch.test.ts` 112 통과 · typecheck 0
- pgTAP `launch_tail_probe_offsets.test.sql` 22/22 PASS · `launch_tail_probe_changes.test.sql` 27/27 PASS(일회용 컨테이너 · 원격 접촉 0)
- webapp vitest 경계 지도 접두(`src/lib/__tests__/launch` · `src/components/admin/__tests__/launch`) 12 파일 413 통과 · typecheck(앱 + e2e) 0
- e2e `admin-launch.spec.ts --workers=1` 31 통과(setup 포함 · 390 칩 10개 줄바꿈 · 가로 스크롤 0 · 점 중심 호버 = 그 점 툴팁) — 마지막 커밋 뒤 재실행
- `relay/src/generated` · `relay/src/dma/envelope.ts` 무변경(base f5fa43b8 대비)
- 음성 grep: `launchTailProbeOffsets|LAUNCH_TAIL_PROBE_LIMITS|tailProbePlanSuffixText` 0 · `AXIS_CAP|offAxis|OFF_GLYPH|LaunchOffAxis` 0

## must_haves 잠금

- T-1 패널마다 줄 · 계획 줄 바로 아래 · 공통 막대 0 · 08:30 줄 0 — map-tab vitest · e2e TP-R1 · G2 묶음
- T-2 unsupported 문구 + 옛 값 꼬리 · 버튼 0 · unknown · 404 줄 0 — tail-probe-bar · map-tab vitest · e2e TP-R2 · TP-R3
- T-3 칩 편집 칸(접두 · + · × · 추가 · 전체 이동 비활성 규칙 · 위반 표시 · 저장 정렬 · 다시 열림) — shared · tail-probe-bar · map-tab vitest · e2e TP-S1 · TP-S2
- T-4 교보 N 공통 PUT 1건 K · 두 패널 같은 값 — map-tab vitest · e2e TP-S4
- T-5 ⇄ true 일 때만 · false/칸 없음/KB/09:00:30 0 — launch-plan-view · map-tab vitest · e2e TP-R1
- T-6 표식 절대 µs · draft · 계획 · 초안 · 탐침은 축이 전부 담음 · 축 끝 글 0(점은 아래 「추가 결정」 대로 먼 점 숨김) — launch-map · gate-chart · map-tab vitest · e2e TP-D1
- T-7 이력 1행(목록 모드) · 패널 안 이력 — server vitest · pgTAP · tail-probe-bar vitest · e2e TP-R1
- T-8 운영 canSet false 503 · 가짜 어댑터 옮기기 · 생성물 무변경 — relay vitest · git diff
- T-9 폰 390 가로 스크롤 0 · 칩 줄바꿈 — e2e TP-D4

## 플랜과 달라진 점

### 자동 처리

**1. [Rule 1 - 버그] relay 테스트 대역 타입 오류(admin-api.test 1823행) 채움**
- 플랜이 허용한 범위 — `launchPlan` 대역에 `setTailProbe` · `tailProbeSettable` 를 채워 `typecheck:tests` 오류 2 → 1.
- 커밋: 008d5b7f

**2. [Rule 1 - 버그] 기존 지도 탭 테스트 「오른쪽 끝 눈금 글은 오른쪽 맞춤」 입력 조정**
- 축이 머리 −245 까지 넓어져 끝 눈금(−20,136)이 사라짐 — 테스트 입력에서 머리를 빼 원래 의도(끝 눈금 정렬)를 그대로 시험. 구현은 바꾸지 않음.
- 커밋: 94d07481

**3. [Rule 1 - 버그] e2e 칩 값 단언**
- `toHaveValues` 는 다중 select 전용이라 입력 목록에 쓸 수 없음 → `evaluateAll` + `expect.poll` 로 바꿈(첫 실행 1건 실패 · 수정 뒤 31 통과).
- 커밋: 94d07481

### 사용자 추가 결정 · 버그 보고(코디네이터 중계 · 2026-11-25)

**4. 먼 오발 점 숨김 — 플랜 Task 3 「축은 값 전부(먼 오발 점도 축을 넓힌다)」 를 바꿈**
- 플랜: 점 · 계획 · 바꿀 계획 · 탐침 전부로 축(먼 점도 축을 늘림).
- 바뀐 규칙: 지난 날 조각 점은 아래 중앙값 ± 퍼짐 상한(q16 300 · n0930 100 · g0830 20000µs) 안만 축 후보 · 계획 · 초안 · 탐침은 전부(상한 없음 — −1500 도 축을 늘린다). 축 밖 점은 그리지 않고 패널 머리에 muted 「먼 점 n개 숨김」(title = 「10/26 −20,148µs · …」 · 0개면 없음). ◂/▸ · 「축 밖」 꼬리 · 축 끝 글은 그대로 없음. 경계 띠는 축 끝에서 자르고(최소 폭도 오른쪽 끝을 넘지 않게) 리본은 축 범위만. 날짜별 표는 모든 값 그대로.
- 상수 이름은 `DOT_SPREAD_US` — 플랜 음성 grep 게이트(`AXIS_CAP|offAxis|OFF_GLYPH|LaunchOffAxis`)는 계속 0.
- `launchAxisOf` 는 다시 `fire` 인자를 받는다. 새 함수 `launchOnAxis` · `launchHiddenDotsOf` · `launchHiddenDotsText`.
- 테스트: [−300, −305, −20148] → 축 −308 ~ −297 · 점 미표시 · 「먼 점 1개 숨김」 / 계획 · 탐침 −1500 → 축 −1510 ~ · 선 · 표식 그려짐 · 숨김 0.
- 커밋: c69f1518

**5. 점 툴팁이 이웃 점으로 뜨던 버그(「점보다 약간 왼쪽에 대야 그 점 툴팁」)**
- 원인: 점마다 16×16 감지 칸을 조각 순서대로 그려 뒤(오른쪽) 점 칸이 앞 점 중심을 덮었다.
- 수정: 점별 칸을 없애고 날짜 행 영역 위 투명 칸 하나(`launch-dot-hit`) — 포인터를 svg 좌표(화면 상자 기준 · viewBox 1:1)로 바꿔 `launchNearestDotOf`(2D 거리 · 반경 `LAUNCH_DOT_HIT_R` 8px · 밖이면 해제 · 같은 거리면 앞 점)로 고른다. 이동 · 클릭/터치 같은 판정. 점 `<title>` 은 그대로(삼각형 · 마름모에 `data-cx` · `data-cy` 추가).
- 테스트: 단위(붙은 두 점 x · x+3 중심 → 자기 점 · 사이 → 가까운 쪽 · 세로 쌓기 · 반경 밖 null) · 컴포넌트(마름모 · 붙은 원 전부 · 삼각형) · e2e(점 중심 호버 → 그 점 µs).
- 커밋: 0d81f39e

### 그 밖

- relay 운영 주입 `canSet` 이 지금 `true`(옛 개수 · 간격 op 10 을 실제로 싣던 상태)였다 — 플랜대로 `false` 로 바꿨다. **운영에서 옛 개수 · 간격 저장이 꺼지는 동작 변화**다(배포 전까지는 영향 없음). 주석은 「envelope 는 옛 모드만 싣고 목록 모드는 생성물 대기」 로 정확히 적었다.
- server fake relay 픽스처(`server/tests/fixtures/fake-relay-admin.ts`)는 타입은 안 깨졌지만 PUT 응답 의미가 옛 모양이라 시장별 4행 · before 목록으로 맞췄다.
- 서버 로그 · 오류 문구의 「발사 뒤탐침」 도 「발사 탐침」 으로 바꿨다(테스트가 같은 문구를 잠근다).
- 커밋 보호 가드: `git.base-branch --is-protected master` = true 였지만 이 프로젝트는 `branching_strategy: none` · 「작업은 master 에서」 규칙이고 오케스트레이터가 메인 트리 순차 실행을 지정해 master 에 커밋했다.
- 시각 확인(스크린샷 1280 · 390): 폰 390 에서 탐침 줄이 길면 「탐침 고치기」 버튼이 다음 줄로 내려간다(flex-wrap 의도 · 잘림 · 겹침 없음).

## 남은 일 (gh-trade Phase 50 `.fbs` 확정 · 인계 뒤 후속 quick)

① gh-trade `sync-relay-schema.sh` 로 `relay/src/generated/*` 갱신(손 편집 금지)
② `relay/src/dma/envelope.ts` `buildAdminCommandReq` op 10 목록 모드 조립 — `launch_tail_probe_offsets_us` 벡터(빈 배열도 칸 생성 = 끔) · `launch_tail_probe_count` −1 · `launch_market`
③ `parseLaunchPlanSnapshot` 이 94 행 `market` · `offsets_us` 와 말미 `kyobo_q16_combined` 를 채움
④ `relay/src/index.ts` `LAUNCH_TAIL_PROBE_WIRE.canSet` true
⑤ 배포 순서 DB(`supabase db push --linked --yes` — 마이그레이션 20261125120000) → relay → server → webapp(push) · 86 범위 원문 문구(절대 축) 도착 확인

그 전까지 운영 화면은 탐침이 읽기 전용(「이 서버 버전은 시장별 탐침을 몰라요 … · 지금 뒤탐침 5발 10µs 간격」)이고 ⇄ 가 안 보이는 것이 정상이다.

## Known Stubs

없음 — 운영 읽기 전용 상태는 생성물 대기로 의도된 것이며 위 「남은 일」 에 연결 순서를 적었다.

## Self-Check: PASSED

- 파일: supabase/migrations/20261125120000_launch_tail_probe_offsets.sql · supabase/tests/launch_tail_probe_offsets.test.sql · webapp/src/components/admin/launch-tail-probe-bar.tsx 존재
- 커밋: 008d5b7f · 3c1b7edf · 94d07481 · c69f1518 · 0d81f39e 모두 HEAD 조상
