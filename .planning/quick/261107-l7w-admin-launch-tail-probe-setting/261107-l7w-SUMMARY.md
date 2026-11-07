---
phase: quick-261107-l7w
plan: 01
status: complete
subsystem: admin-launch (발사 경계 지도 · 뒤탐침 설정)
tags: [launch, tail-probe, relay, server, webapp, supabase, gh-trade-contract]
requires:
  - gh-trade-70 합의 계약(CONTEXT 「gh-trade 계약」 · count 0..10 으로 변경 반영)
provides:
  - shared 뒤탐침 계약(LaunchTailProbe · LAUNCH_TAIL_PROBE_LIMITS · 검증 · 예정 시각 · 상태 판정 · 이력 13열)
  - launch_tail_probe_changes 표 + 기록/읽기 RPC(service_role 전용)
  - relay LaunchTailProbeWire 주입 어댑터 · PUT /internal/admin/launch-tail-probe/:server(PENDING = 503)
  - server GET /launch/plan 의 tail_probe_changes · PUT /api/admin/launch/tail-probe/:gateway/:fire
  - 웹 「<서버> 뒤탐침」 줄 · 편집 칸 · 지도 예정 표식 · 계획 줄 꼬리 · 범례
affects:
  - relay/src/index.ts(어댑터 한 줄 — 후속 quick 이 교체)
  - docs/inbox/from-gh-trade/261107-nxt-tail-probe-kind17.md(done)
tech-stack:
  added: []
  patterns:
    - 와이어 어댑터 주입(canSet · tailProbesOf) — 생성 코드 없이 서비스 · 라우트 · 상위층을 먼저 깐다
    - relay 저장 파이프라인 공용 헬퍼(#saveVia) — op 8 · op 10 이 같은 마감 · 결과 모름 규칙
key-files:
  created:
    - supabase/migrations/20261107200000_launch_tail_probe_changes.sql
    - supabase/tests/launch_tail_probe_changes.test.sql
    - webapp/src/components/admin/launch-tail-probe-bar.tsx
    - webapp/src/components/admin/__tests__/launch-tail-probe-bar.test.tsx
  modified:
    - packages/shared/src/launch-plan.ts
    - packages/shared/src/admin.ts
    - packages/shared/src/launch.ts
    - relay/src/admin/launch-plan.ts
    - relay/src/admin/admin-api.ts
    - relay/src/admin/admin-conn.ts
    - relay/src/admin/types.ts
    - relay/src/index.ts
    - server/src/routes/admin-launch.ts
    - server/src/services/admin-launch.ts
    - server/src/services/relay-admin-client.ts
    - server/src/schemas/admin-launch.ts
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/components/admin/launch-plan-bar.tsx
    - webapp/src/lib/launch-plan-view.ts
    - webapp/src/lib/launch-api.ts
    - webapp/src/lib/launch-map.ts
    - webapp/e2e/fixtures/launch.ts
    - webapp/e2e/specs/admin-launch.spec.ts
decisions:
  - "뒤탐침 count 범위 0..10(오케스트레이터 중계 · gh-trade 사용자 결정 · 계획서의 0..5 를 대체) — step 1..100µs 그대로 · 끝발 최대 +1000µs"
  - "relay 와이어 대기(PENDING)에서 PUT 은 op 10 을 보내지 않고 503 LAUNCH_TAIL_PROBE_UNAVAILABLE — server 는 확정 미반영 offline + 이력 1행"
  - "이력 표 count/step 범위 CHECK 없음 — gh-trade 가 거부한 범위 밖 시도도 이력에 남긴다"
  - "예정 표식 · 계획 줄 꼬리의 기준은 서버 계획 마지막 조각 — 뒤탐침 편집 칸이 열려 있으면 유효 초안 값(data-src draft)"
metrics:
  started: 2026-11-07T06:35:45Z
  completed: 2026-11-07T07:06:13Z
  duration: 30m
  tasks: 3
  files: 37
estimate:
  tokens: 230000
actuals:
  tokens: 68553
  tasks: 3
  commits: 4
plan_head_before: 6285c46d62e095297dd7c40c1b94a04959c0a2d8
plan_head_after: 60bf36db0dc656733884511ca2aa4148c6825444
---

# Phase quick-261107-l7w Plan 01: 발사 경계 지도 뒤탐침 개수 · 간격 설정 Summary

서버별 · 발사별(16:00 Q16 / 09:00:30 N) 뒤탐침 개수(0~10) · 간격(1~100µs)을 보고 고치는 전 층(shared 계약 · DB 이력 · server API · relay 서비스/라우트 · 웹 줄 · 편집 칸 · 지도 예정 표식)을 와이어 어댑터 주입형으로 깔았다 — 지금 운영(PENDING)에서는 「이 서버 버전은 뒤탐침 설정을 몰라요」 읽기 전용이고, gh-trade .fbs 인계 뒤 relay 한 줄 교체로 켜진다.

## 커밋

| # | 해시 | 제목 |
|---|------|------|
| 1 | 55c8e67c | feat(quick-261107-l7w): 뒤탐침 설정 읽기 트레이서 — shared 계약 · 이력 표 · relay 주입 어댑터 · server GET · 웹 뒤탐침 줄 |
| 2 | 1e667dbf | feat(quick-261107-l7w): 뒤탐침 저장 — 웹 편집 칸 · server PUT + 이력 · relay op 10 서비스(와이어 대기 503) |
| 3① | 91472266 | feat(quick-261107-l7w): 지도 예정 뒤탐침 · 계획 줄 꼬리 · 범례 뒤탐침 견본 09:00:30 에도(인박스 261107-nxt-tail-probe-kind17) |
| 3② | 60bf36db | docs(inbox): gh-trade 261107 N 뒤탐침 kind 17 처리(91472266) — 범례 견본 09:00:30 에도 |

4건 모두 이 계획 파일만 담았다(`git show --stat` 확인 · 동시 세션 변경 혼입 없음). `relay/src/generated/*` · `relay/src/dma/envelope.ts` 무변경.

## 실제 마이그레이션 파일명

`supabase/migrations/20261107200000_launch_tail_probe_changes.sql` (최신 20261107100100 뒤라 계획 이름 그대로).

## 검증

- shared vitest: launch · launch-plan · admin 177 통과
- relay vitest: admin-launch-plan · admin-api · admin-conn 140 통과(기존 R1~R4 · S1~S5 무수정)
- server vitest: routes/admin-launch 98 통과
- webapp vitest: `src/lib/__tests__/launch-*` · `src/components/admin/__tests__/launch-*` 12파일 338 통과
- typecheck: shared build · relay · server · webapp(+e2e) 통과
- pgTAP: `launch_tail_probe_changes.test.sql` 27/27 PASS(일회용 컨테이너 · 118 마이그레이션 재생)
- e2e: `admin-launch.spec.ts` 32 통과(기존 P35 · P-SV + TP-R1~R3 · TP-S1~S3 · TP-D1 · D2 · D2b · D3 · D4)
- must_haves T-1~T-8 매핑: T-1 TP-R1 · bar 단위 / T-2 TP-R2 · TP-R3 · bar 단위 / T-3 TP-S1 · TP-S2 · 편집 칸 단위 / T-4 pgTAP · server TP-P* / T-5 relay TP-R*/TP-S*/TW*/TP-C* · server TP-P3 / T-6 TP-D1 · D2 · 차트 · 지도 탭 단위 / T-7 TP-D3 · 지도 탭 인박스 케이스 / T-8 TP-S3 · TP-D4 · 지도 탭 「한 번에 하나」 · 「서버 · 발사 전환」

## Deviations from Plan

### 계약 변경(오케스트레이터 중계)

**1. 뒤탐침 count 범위 0..5 → 0..10**
- **출처:** 실행 중 오케스트레이터 메시지(gh-trade 사용자 결정). step_us 1..100 · 나머지 그대로 · 끝발 최대 = 마지막 실조각 + 1000µs.
- **반영:** `LAUNCH_TAIL_PROBE_LIMITS.maxCount` 10 · 검증 문구 「발 수는 0 ~ 10 사이여야 해요」 · 스테퍼 0~10 · 힌트 「0 ~ 10 · 0 = 끔」 · 테스트 범위 밖 견본을 6/9 → 11/12 로 · relay 주석 0..10 · 마이그레이션 머리 주석. relay · server zod 는 원래 구조(int32)만 보므로 숫자 변경 없음. Task 1 커밋 전에 반영해 모든 커밋이 0..10 이다.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e 주소 갱신 경합 대기 추가**
- **Found during:** Task 1 · Task 3 e2e
- **Issue:** 세그먼트 → 서버 칩(또는 서버 칩 → 세그먼트)을 연달아 누르면 두 번째 주소 갱신이 첫 갱신 전 주소를 다시 실어 앞 변경이 되돌아갔다(기존 앱 동작 · 이번 변경 무관).
- **Fix:** 테스트에서 두 조작 사이에 세그먼트 aria-pressed · 주소 · 줄 머리를 확인한 뒤 다음 조작(TP-R1 · TP-S3).
- **Files modified:** webapp/e2e/specs/admin-launch.spec.ts

**2. [Rule 1 - 테스트 범위] `launch-api.test.ts` 의 `respOf` 에 `tail_probe_changes: []`**
- `fetchLaunchPlan` 이 빈 키를 [] 로 채우게 되어 기존 정확 비교가 깨짐 → 픽스처 모양을 새 server 응답으로 맞추고, 구 server 응답 채움 케이스를 따로 추가.

### 인터페이스 미세 조정
- `LaunchMapView` 의 `onTailProbeEdit` 은 `(open: boolean)` 대신 `(base: LaunchTailProbeValue | null)` — 계획 편집의 `onEdit(target | null)` 과 같은 결(뷰가 서버 값을 넘긴다).
- `TP-D2` 의 「기본 픽스처」 확인은 라우트 재설정 대신 별도 테스트 `TP-D2b` 로 나눴다.

## 손본 시각 결함

없음 — 1280 · 390 스크린샷에서 뒤탐침 줄 · 편집 칸(10발 칩 두 줄 줄바꿈) · 예정 표식 · 꼬리 겹침 · 잘림 없음. 390 페이지 가로 스크롤 0.

## 배포 순서(메인 세션 몫 — 이 executor 는 배포하지 않음)

1. DB: `supabase db push --linked --yes`(20261107200000)
2. server: `deploy-server.sh`(라이브 Cloud Run env 추출 규칙 · CORS_ALLOWED_ORIGINS 포함)
3. relay: PENDING 어댑터 그대로 배포 → PUT 은 503 경로(배포 전 구 relay 는 404 → server 가 같은 offline 으로 접는다)
4. webapp: push

순서 무관 근거: 구 server 응답 = `tail_probe_changes` 없음 → 웹이 [] 로 읽음 · 구 relay = `tail_probes` 없음 → 「이 서버 버전은 뒤탐침 설정을 몰라요」 줄 · 구 relay PUT 404 · 새 relay PENDING 503 둘 다 server 가 확정 미반영 offline + 이력 1행. 단 DB push 전에 server 를 올리면 GET /launch/plan 의 뒤탐침 이력 RPC 가 없어 500 → 계획 줄이 「대신 값」 으로 접히므로 **DB 먼저**가 안전하다.

## 후속 quick 체크리스트(와이어 — gh-trade .fbs 인계 뒤 · relay/src/admin/launch-plan.ts `LaunchTailProbeWire` 주석 정본)

1. gh-trade `sync-relay-schema.sh` 로 `relay/src/generated/*` 갱신(손 편집 금지 · flatc 고정 버전은 gh-trade 소유).
2. `relay/src/dma/envelope.ts` `buildAdminCommandReq` 에 op 10 의 `launch_profile` · `launch_tail_probe_count` · `launch_tail_probe_step_us` 조립(`AdminCommandInput.launchProfile` · `launchTailProbeCount` · `launchTailProbeStepUs`).
3. `parseLaunchPlanSnapshot` 이 94 `tail_probes` 를 `snap.tailProbes` 로 — 길이 0 = 칸 없음 → undefined(flatbuffers 는 칸 없음과 빈 벡터를 못 가른다).
4. `relay/src/index.ts` 주입을 `{ canSet: true, tailProbesOf: (s) => s.tailProbes }` 로.
5. relay 배포.

## Known Stubs

없음 — PENDING 어댑터는 의도된 운영 기본(계획 범위 밖 = 후속 quick)이며 화면이 그 상태를 명시한다.

## Self-Check: PASSED

- 파일: 마이그레이션 · pgTAP · launch-tail-probe-bar(.tsx · 테스트) 존재 확인
- 커밋: 55c8e67c · 1e667dbf · 91472266 · 60bf36db 모두 HEAD 조상
