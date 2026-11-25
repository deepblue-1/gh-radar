---
phase: quick-261125-lju
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer · 계약 → DB → server → relay) — 탐침 목록 한 건 저장 경로 + 94 시장별 행 읽기 어댑터
  - packages/shared/src/launch-plan.ts
  - packages/shared/src/__tests__/launch-plan.test.ts
  - supabase/migrations/20261125120000_launch_tail_probe_offsets.sql
  - supabase/tests/launch_tail_probe_offsets.test.sql
  - supabase/tests/launch_tail_probe_changes.test.sql
  - relay/src/admin/types.ts
  - relay/src/admin/launch-plan.ts
  - relay/src/admin/admin-api.ts
  - relay/src/index.ts
  - relay/tests/admin-launch-plan.test.ts
  - relay/tests/admin-api.test.ts
  - server/src/schemas/admin-launch.ts
  - server/src/services/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - server/src/routes/admin-launch.ts
  - server/tests/routes/admin-launch.test.ts
  - server/tests/fixtures/fake-relay-admin.ts
  # Task 2 — 웹: 시장 패널마다 탐침 줄 · 칩 편집 칸 · 전체 이동 · ⇄ · 이력 · e2e
  - webapp/src/lib/launch-api.ts
  - webapp/src/lib/__tests__/launch-api.test.ts
  - webapp/src/lib/launch-plan-view.ts
  - webapp/src/lib/__tests__/launch-plan-view.test.ts
  - webapp/src/components/admin/launch-tail-probe-bar.tsx
  - webapp/src/components/admin/__tests__/launch-tail-probe-bar.test.tsx
  - webapp/src/components/admin/launch-plan-bar.tsx
  - webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  - webapp/e2e/fixtures/launch.ts
  - webapp/e2e/specs/admin-launch.spec.ts
  # Task 3 — 경계 지도 축: 값 전부 담기 · 축 밖 표식 경로 제거
  - webapp/src/lib/launch-map.ts
  - webapp/src/lib/__tests__/launch-map.test.ts
  - webapp/src/components/admin/launch-gate-chart.tsx
  - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
  # Task 3 — 화면 이름 「뒤탐침」 → 「탐침」 나머지(주문 탭 조각 라벨)
  - webapp/src/lib/launch-format.ts
  - webapp/src/lib/__tests__/launch-format.test.ts
  - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
autonomous: true
requirements: ["261125-lju"]

estimate:
  tokens: 300000
  raw_tokens: 300000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "T-1: 경계 지도 16:00 · 09:00:30 에서 시장 패널마다 「다음 발사 계획」 줄 바로 아래에 「탐침 5발 · −210 · −200 · −190 · −180 · −170µs」 줄(같은 값은 「−270×2」 · 0발이면 「탐침 꺼짐 · 0발」)과 「탐침 고치기」/「닫기」 버튼이 있다. 지도 위쪽의 서버 공통 탐침 막대는 없다. 08:30 에는 탐침 줄이 없다"
    - "T-2: 94 에 그 (발사, 시장) 탐침 목록이 없으면(구 서버 · 지금 운영 와이어 전부 — relay 생성물에 새 칸이 없다) 그 줄은 경고색 「이 서버 버전은 시장별 탐침을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요」(옛 count/step 행이 있으면 뒤에 「 · 지금 뒤탐침 5발 10µs 간격」)이고 「탐침 고치기」 버튼이 없다. 계획을 못 읽었으면 「탐침 값을 읽지 못했어요」 · 버튼 없음, /plan 404 면 줄 자체가 없다"
    - "T-3: 「탐침 고치기」 편집 칸(목업 v4) — 칩 한 묶음(− 고정 접두 · 앞에 + 를 치면 정각 뒤 · × 삭제 · 「+ 추가」 = 가장 늦은 유효 값 + 10µs, 없으면 그 시장 계획 마지막 값 + 10 · 상한에서 멈춤 · 10발이면 비활성) · 전체 이동 −10 −5 −3 −1 | +1 +3 +5 +10(그 시장만 · 한 발이라도 한도 밖으로 나가면 그 버튼 비활성 · 검증 오류 중이면 8개 전부 비활성) · 입력 중 칩 순서 불변 · 위반은 칩 빨간 테두리 + alert 한 줄(shared 문구) · 저장 = 이른 시각부터 정렬한 값으로 PUT 1건 → 저장 뒤 정렬된 서버 값으로 다시 열림 · 되돌리기/저장/결과 줄은 계획 저장과 같은 꼴. 위치 경고(실조각 앞 · 사이 · 뒤)는 어디에도 없다"
    - "T-4: 교보 09:00:30 N 은 공통 한 목록 — 두 패널이 같은 값을 보이고, 어느 패널에서 저장해도 PUT 은 1건(market K)이며 저장 뒤 두 패널이 같은 값이다"
    - "T-5: 「⇄」 는 94 bool kyobo_q16_combined 가 true 인 교보 서버의 16:00 에서만 — 다른 시장의 실조각 계획 · 탐침과 같은 µs 인 값(계획 줄 값 · 탐침 줄 값 · 편집 칩)에 붙고(title 「코스닥과 같은 시각 — 한 번에 쏨」/「코스피와 같은 시각 — 한 번에 쏨」), 범례에 「⇄ 다른 시장과 한 번에 쏨」 이 생긴다. bool false · 칸 없음(지금 와이어) · KB · 09:00:30 에서는 하나도 없다"
    - "T-6: 지도 탐침 표식(점선 + 빈 삼각형)은 정각 기준 절대 µs 그대로 그려지고 편집 중인 패널은 유효 초안 값(data-src draft)을 따른다. 지도 축(16:00 · 09:00:30 · 08:30 전부)은 점 · 계획 · 바꿀 계획 · 탐침을 전부 담게 늘어나서, 축 끝 ◂/▸ 표식이나 「▸ 다음 …µs」 · 「바꿀 n번 …µs」 축 끝 글이 생기지 않는다"
    - "T-7: 저장 시도마다(실패 · offline · timeout 포함) launch_tail_probe_changes 에 1행(market · before_offsets_us · after_offsets_us)이 남고, 패널 안 「탐침 변경 이력 n」 접힘에 그 시장 행과 옛 count/step 행(「뒤탐침 5발 10µs 간격 → …」)이 보인다"
    - "T-8: relay 운영 주입은 목록 모드 op 10 을 와이어에 못 실어 PUT /internal/admin/launch-tail-probe/:server 가 503 LAUNCH_TAIL_PROBE_UNAVAILABLE(server = offline 확정 미반영 · 이력 1행)이다. 가짜 어댑터 테스트에서는 op 10 입력 = launchTailProbeCount −1 · launchTailProbeOffsetsUs · launchMarket, 94 시장별 4행(market · offsetsUs) · kyoboQ16Combined 가 ok 결과의 tail_probes · kyobo_q16_combined 로 옮겨진다. relay/src/generated 와 relay/src/dma/envelope.ts 는 한 줄도 안 바뀐다"
    - "T-9: 폰 390 에서 칩 10개 편집 칸 · 탐침 줄 · 이력 접힘을 펼쳐도 페이지 가로 스크롤 0 · 칩은 줄바꿈된다"
  artifacts:
    - path: packages/shared/src/launch-plan.ts
      provides: "LaunchTailProbe(market? · offsets_us?) · LaunchPlanServer ok 의 kyobo_q16_combined? · LAUNCH_TAIL_PROBE_MAX_SHOTS · parseLaunchTailProbeChip · launchTailProbeChipText · validateLaunchTailProbeDraft(fire, raw) · shiftLaunchTailProbeDraft · launchTailProbeStateOf(server, fire, market) · 시장별 저장 바디 · 이력 행 16열"
      contains: "shiftLaunchTailProbeDraft"
    - path: supabase/migrations/20261125120000_launch_tail_probe_offsets.sql
      provides: "launch_tail_probe_changes 에 market · before_offsets_us · after_offsets_us 추가 · 모드 CHECK · 기록/읽기 RPC 교체(권한 재진술)"
      contains: "after_offsets_us"
    - path: relay/src/admin/launch-plan.ts
      provides: "LaunchTailProbeWire(canSet · tailProbesOf · kyoboQ16CombinedOf) · 시장별 94 행 옮기기 · setTailProbe 목록 모드 입력"
      contains: "kyoboQ16CombinedOf"
    - path: webapp/src/components/admin/launch-tail-probe-bar.tsx
      provides: "LaunchTailProbeLine(패널 안 탐침 줄 + 이력 접힘) · LaunchTailProbeEditor(칩 편집 칸 · 전체 이동) · CombinedMark(⇄)"
      contains: "LaunchTailProbeLine"
    - path: webapp/src/lib/launch-map.ts
      provides: "launchAxisOf(values, marks) — 값 전부를 담는 축"
      contains: "launchAxisOf"
  key_links:
    - from: webapp/src/components/admin/launch-map-tab.tsx
      to: webapp/src/lib/launch-api.ts saveLaunchTailProbe
      via: "PUT /api/admin/launch/tail-probe/:gateway/:fire 바디 { market, offsets_us } (교보 N = market K 1건)"
    - from: server/src/routes/admin-launch.ts
      to: relay PUT /internal/admin/launch-tail-probe/:server
      via: "{ profile, market, offsets_us } → 이력 RPC launch_tail_probe_change_record(목록 모드)"
    - from: relay/src/admin/launch-plan.ts setTailProbe
      to: AdminConn.command
      via: "op 10 · launchProfile · launchMarket · launchTailProbeCount −1 · launchTailProbeOffsetsUs (운영은 canSet false 라 도달 전 503)"
    - from: webapp/src/lib/launch-plan-view.ts tailProbeCombinedOn
      to: LaunchPlanServer.kyobo_q16_combined
      via: "true 일 때만 ⇄ — 판정 함수 한 곳"
---

<objective>
어드민 발사 「경계 지도」 탭의 뒤탐침 설정을 **「탐침」**(정각 기준 부호 있는 절대 µs 목록 · 시장별 · 0 ~ 10발)으로 다시 만들고, 경계 지도 축이 값 전부를 담게 늘린다.

Purpose: 트레이더가 16:00 Q16 · 09:00:30 N 러쉬 주문의 탐침 시각을 발마다 자유롭게(같은 시각 여러 발 · 추가 · 삭제 · 전체 이동) 시장별로 정하고, 지도에서 경계 · 계획 · 탐침을 한 화면에 잘림 없이 본다.
Output: shared 계약 · DB 이력 칸 · server PUT · relay 어댑터(생성물 대기) · 패널 안 탐침 줄 + 칩 편집 칸 + ⇄ + 이력 · 값 전부를 담는 지도 축 · 갱신된 vitest · pgTAP · e2e.

계약 정본(잠김 — 다시 따지지 않는다): `.planning/quick/261125-lju-probe-abs-per-market/reference/gh-trade-replies.md`(2026-11-25 정정 포함) · UI 정본 `reference/mockup-probe-per-market-v4.html`.
- 값 = 정각 기준 부호 있는 µs(op 8 `launch_offsets_us` 와 같은 축). 한도 = shared `LAUNCH_PLAN_LIMITS` 의 q16 · n0930 minUs/maxUs 를 그대로 쓴다(Q16 −3000 ~ +1000 · N −2000 ~ +2000 — 두 번째 숫자 금지). 0 ~ 10발 · 빈 목록 = 꺼짐 · 중복 허용 · 서버는 정렬하지 않으니 웹이 오름차순으로 보낸다.
- 94 `tail_probes` = 4행 [Q16·K, N·K, Q16·Q, N·Q], 행에 `market` · `offsets_us` 가 붙고 구 칸 count = 목록 길이 · step_us = 0. op 10 목록 모드 = offsets 벡터 + count −1 + launch_market 필수. 교보 N 은 K · Q 어느 쪽으로 와도 두 행 같은 값.
- **⇄ 판정 정정(코디네이터 · gh-trade 확정)**: 94 말미 bool `kyobo_q16_combined` 가 **true 일 때만** 켜짐. 칸이 없으면(지금 와이어 · 구 서버) 꺼짐 — 「교보 서버 = 켜짐」 가정은 쓰지 않는다. 지금 운영에서는 ⇄ 가 안 보이는 것이 정상이고, 어댑터 · 판정 함수 · 단위 테스트(가짜 스냅샷 true / false / 없음)로만 준비한다.
- 86 범위 문구는 절대 축 문구로 바뀌며 원문은 나중에 온다 — 웹 편집 칸은 shared 검증 문구를 쓰고, 서버 문구는 지금처럼 결과 줄에 원문 그대로 보인다(문구 대응표를 새로 만들지 않는다).
- 사용자 결정: 화면 이름 「뒤탐침」 → 「탐침」(내부 식별자 `LaunchTailProbe*` · 파일 이름 · data-slot `launch-tail-probe*` 는 그대로 둔다) · 입력은 − 기본 · 저장 때만 정렬 · 위치 경고 없음 · 축 상한과 ◂▸ 폐기(지도 전체) · ⇄ 유지(KB 없음).

브리프와 다른 점(실행자가 헷갈리지 않게):
- 브리프 범위 5) 는 「`launch_plan_changes` 탐침 변경 행」 이라 했지만 **탐침 이력 표는 `launch_tail_probe_changes`** 다(마이그레이션 `supabase/migrations/20261107200000_launch_tail_probe_changes.sql` — 계획 이력 표와 별도). 이 표를 고친다. `launch_plan_changes` 는 건드리지 않는다.
- ⇄ 판정은 브리프의 「지금은 교보 서버 = 켜짐」 이 아니라 위 정정(true 일 때만)을 따른다.
- 축 상한 폐기는 사용자 결정이라 10/26 N −20,148µs 같은 오발 점도 이제 그 패널 축을 넓힌다(받아들인 결과 — 되살리지 않는다).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261125-lju-probe-abs-per-market/reference/gh-trade-replies.md
@.planning/quick/261125-lju-probe-abs-per-market/reference/mockup-probe-per-market-v4.html
@.planning/quick/261125-lju-probe-abs-per-market/reference/gh-trade-contract-note.md
@docs/inbox/from-gh-trade/261107-launch-tail-probe-op10.md
@.planning/quick/261107-l7w-admin-launch-tail-probe-setting/261107-l7w-PLAN.md

실행 규칙(전 태스크 공통):
- 메인 트리 순차 실행(격리 none). 커밋은 태스크마다 경로 지정 `git add <paths>` — `git add -A` 금지(동시 세션 경합). 커밋 직전 `git status -sb` 로 남의 미커밋이 섞이지 않았는지 본다.
- 배포 · push · `supabase db push` 금지. `relay/src/generated/*` · gh-trade 인박스 노트(`docs/inbox/from-gh-radar` 쪽 · `reference/gh-trade-contract-note.md`)는 수정 · 커밋하지 않는다.
- vitest 는 `--maxWorkers=2`, playwright 는 `--workers=1`. shared 는 `dist/` 로 소비되므로 webapp · server · relay 테스트 · 타입체크 전에 `pnpm --filter @gh-radar/shared build` 를 먼저 돌린다.
- 주석에 지운 식별자 이름을 남기지 않는다(음성 grep 게이트가 주석도 센다) — 「축 상한 폐기(quick-261125-lju)」 처럼 개념으로 적는다.
- 폰 390 줄바꿈 · 잘림 · 겹침은 기존 flex-wrap · break-keep · min-w-0 규칙으로 막는다. 보이는 시각 결함은 묻지 말고 고친 뒤 SUMMARY 에 한 줄.
- Task 1 커밋 시점에는 webapp 타입체크가 깨져 있다(shared 계약이 바뀌고 웹은 Task 2 에서 맞춘다) — Task 1 검증은 shared · relay · server · DB 만, webapp 은 Task 2 끝에서 0 오류여야 한다.
</context>

<tasks>

<task type="tracer">
  <name>Task 1: 탐침 목록 한 건 저장 경로 — shared 계약 → DB 이력 → server PUT → relay op 10 입력 · 94 시장별 행 읽기(어댑터)</name>
  <files>packages/shared/src/launch-plan.ts, packages/shared/src/__tests__/launch-plan.test.ts, supabase/migrations/20261125120000_launch_tail_probe_offsets.sql, supabase/tests/launch_tail_probe_offsets.test.sql, supabase/tests/launch_tail_probe_changes.test.sql, relay/src/admin/types.ts, relay/src/admin/launch-plan.ts, relay/src/admin/admin-api.ts, relay/src/index.ts, relay/tests/admin-launch-plan.test.ts, relay/tests/admin-api.test.ts, server/src/schemas/admin-launch.ts, server/src/services/admin-launch.ts, server/src/services/relay-admin-client.ts, server/src/routes/admin-launch.ts, server/tests/routes/admin-launch.test.ts, server/tests/fixtures/fake-relay-admin.ts</files>
  <read_first>
    - packages/shared/src/launch-plan.ts (전부 — 「뒤탐침」 절 311 ~ 481행 · LAUNCH_PLAN_LIMITS · validateLaunchPlanDraft · launchPlanUsText)
    - supabase/migrations/20261107200000_launch_tail_probe_changes.sql (표 · 두 RPC · 권한 블록 원문)
    - supabase/tests/launch_tail_probe_changes.test.sql (t_cols 13개 핀 · plan(27) · 22023 단언 199 ~ 211행)
    - relay/src/admin/launch-plan.ts (LaunchTailProbeWire · setTailProbe · #saveVia · #toServer · #tailProbesOf)
    - relay/src/admin/types.ts 140 ~ 210행 (AdminCommandInput op 10 칸 · LaunchPlanSnapshot · LaunchTailProbeWireRow)
    - relay/src/admin/admin-api.ts 330 ~ 360행 · 912 ~ 930행 (zod 바디 · PUT 라우트 · 503)
    - relay/src/index.ts 124 ~ 131행 (LAUNCH_TAIL_PROBE_WIRE 운영 주입)
    - server/src/routes/admin-launch.ts 173 ~ 225행 · server/src/schemas/admin-launch.ts · server/src/services/admin-launch.ts 140 ~ 175행 · 360 ~ 427행
    - relay/tests/admin-launch-plan.test.ts 484행 이후(TP-R* · TP-S* 묶음 — 가짜 어댑터 주입 패턴) · server/tests/routes/admin-launch.test.ts 의 tail-probe 묶음
  </read_first>
  <behavior>
    - shared parseLaunchTailProbeChip: "210" → −210 · "+30" → 30 · "0" · "+0" · " 0 " → 0 · "" · "+" · "-5" · "1.5" · "1+2" → null
    - shared launchTailProbeChipText: −210 → "210" · 30 → "+30" · 0 → "0" (parse 의 역 — 왕복 동일)
    - shared validateLaunchTailProbeDraft('q16', ["210","200","+30"]) → ok · values [−210, −200, 30](오름차순) · ["200","200"] → ok [−200, −200](중복 허용) · [] → ok [](꺼짐) · 11칸 → kind count · ["4000","x","200"] → ok false · badIdx [0, 1] · 첫 위반(0번 range) 문구 「탐침 시각은 −3000 ~ +1000µs 사이여야 해요」 · 'n0930' 한도는 −2000 ~ +2000
    - shared shiftLaunchTailProbeDraft('q16', ["210","+30"], −10) → ["220","+20"](칸 순서 그대로) · ["2995"] 에 −10 → null(한도 밖) · 검증 오류 초안 → null · [] → null
    - shared launchTailProbeStateOf(server, 'q16', 'K'): 서버 non-ok → unknown · Q16/K 행에 offsets_us 있음 → set(값 복사 · [] = 꺼짐) · 행 없음/market 없는 옛 행만 → unsupported { legacy: 첫 옛 Q16 행 {count, step_us} 또는 null } · 같은 profile 이 market 없이 4행(새 서버를 지금 파서로 읽은 모양) → unsupported
    - shared LAUNCH_TAIL_PROBE_CHANGE_COLUMNS 16개(market · before_offsets_us · after_offsets_us 추가)
    - relay 가짜 어댑터(canSet true): setTailProbe(KB120, { profile Q16, market Q, offsets_us [−300, −290] }) → command 입력 { op 10, launchProfile Q16, launchMarket Q, launchTailProbeCount −1, launchTailProbeOffsetsUs [−300, −290] } · before = 전 조회 Q16/Q 행 offsets_us
    - relay 94 행 옮기기: { profile Q16, market "K", offsetsUs [−210] } → { profile, count, step_us, market K, offsets_us [−210] } · market "K" 인데 offsetsUs 없음 → offsets_us [](빈 벡터와 칸 없음을 못 가른다) · market "" → 옛 행(market · offsets_us 키 없음) · market "X" 또는 정수 아닌 offsets → 그 행 빼고 warn 1줄 · kyoboQ16CombinedOf true/false → ok 결과 kyobo_q16_combined 그대로 · undefined → 키 없음
    - relay 운영 주입(LAUNCH_TAIL_PROBE_WIRE): canSet false → PUT /launch-tail-probe 503 LAUNCH_TAIL_PROBE_UNAVAILABLE · op 10 0건 · 옛 바디 { profile, count, step_us } → 400
    - server PUT /api/admin/launch/tail-probe/KB120/q16 { market Q, offsets_us [−300,−290] } → relay 바디 { profile Q16, market Q, offsets_us } · 이력 RPC p 에 market Q · before_offsets_us · after_offsets_us · after_count null · after_step_us null · 옛 바디 { count, step_us } → 400 · fire g0830 → 400 · relay 503 → offline + 이력 1행
    - pgTAP: 목록 모드 기록(빈 목록 포함) · 옛 모드 기록 유지 · 두 모드 다 없음 → 22023 · 목록인데 market 없음 → 22023 · market 'X' → 23514 · 표에 직접 넣는 모드 위반 → 23514 · 읽기 RPC 가 (gateway, fire, market) 별 최근 p_limit · 두 RPC EXECUTE (anon, authenticated, service_role) = (f, f, t)
  </behavior>
  <action>
  1) shared `packages/shared/src/launch-plan.ts` 「뒤탐침」 절을 「탐침」 절로 다시 쓴다(머리 주석: 출처 = reference/gh-trade-replies.md 최종 계약 · 축 = 정각 기준 절대 µs · 시장별 · 교보 N 공통 · ⇄ bool). 내부 식별자 접두 `LaunchTailProbe` 는 유지한다.
     - `LaunchTailProbe` 행: profile · count · step_us(구 칸 — 새 서버는 count = 길이 · step_us = 0) + 선택 `market?: LaunchMarket` · `offsets_us?: number[]`(market 이 있는 행만 · 새 서버 행). `LaunchTailProbeValue`(count · step_us)는 옛 행 · 옛 이력 표시용으로 남긴다.
     - `LaunchPlanServer` ok 에 선택 `kyobo_q16_combined?: boolean`(94 말미 bool · 교보 16:00 합친 레인 스위치 · 칸 없음 = 꺼짐) 추가.
     - 발 수 상한 상수 `LAUNCH_TAIL_PROBE_MAX_SHOTS = 10` 을 두고, step 기반 옛 한도 상수와 옛 예정 시각 계산 함수(마지막 조각 + (i+1)·step)는 지운다. 범위 한도는 `LAUNCH_PLAN_LIMITS[fire].minUs/maxUs` 를 그대로 읽는다(새 숫자 금지).
     - `parseLaunchTailProbeChip(raw)`: 앞뒤 공백을 자르고 `+숫자` = 정각 뒤 양수 · 숫자만 = 정각 앞 음수 · 0 과 +0 = 0 · 그 밖 null. `launchTailProbeChipText(v)`: 그 역(양수 `+v` · 0 「0」 · 음수 절댓값 숫자).
     - `validateLaunchTailProbeDraft(fire, raw)` 를 칩 문자열 배열을 받는 꼴로 바꾼다: 개수(> MAX_SHOTS → kind count · badIdx 빈 배열 · 「탐침은 0 ~ 10발이에요」) → 칸마다 정수(파스 실패 → int · 「탐침 시각은 숫자만 써요 — 정각 뒤는 앞에 + (n번)」) · 범위(→ range · 「탐침 시각은 −3000 ~ +1000µs 사이여야 해요」 — 부호 있는 표기: 음수 U+2212 · 양수 + · 0). 결과 = `{ ok: true; values }`(오름차순 정렬 · 중복 유지) 또는 `{ ok: false; kind; badIdx: number[](위반 칸 전부 오름차순); message(칸 순서로 첫 위반 문구) }`. 위치(실조각 앞 · 사이) 검사는 넣지 않는다(사용자 결정).
     - `shiftLaunchTailProbeDraft(fire, raw, delta)`: 초안이 비었거나 검증 실패거나 한 발이라도 v + delta 가 한도 밖이면 null, 아니면 칸 순서 그대로 v + delta 의 칩 문자열 배열(정렬하지 않는다 — 입력 중 칩 위치 불변). 웹 버튼의 가능 여부 · 적용 결과가 이 한 함수다.
     - `launchTailProbeStateOf(server, fire, market)`: unknown(서버 없음 · non-ok) · set `{ offsets_us }`(그 profile + market 행에 offsets_us 가 있을 때 · 빈 배열 = 꺼짐) · unsupported `{ legacy }`(그 행이 없음 — market 없는 옛 행이 있으면 첫 행의 count/step, 없으면 null). 같은 profile 이 여러 행이어도(새 서버를 지금 파서로 읽으면 market 없는 4행) find 로 첫 행만 본다.
     - 이력 `LaunchTailProbeChangeRow`: `market: LaunchMarket | null`(옛 행 null) · `before_offsets_us: number[] | null` · `after_offsets_us: number[] | null`(옛 행 null) 추가, `after_count` · `after_step_us` 는 `number | null`(새 행 null). `LAUNCH_TAIL_PROBE_CHANGE_COLUMNS` 16개.
     - 저장 계약: `LaunchTailProbeSaveBody = { market; offsets_us }` · `LaunchTailProbeRelaySetBody = { profile; market; offsets_us }` · `LaunchTailProbeRelaySetResponse.before: number[] | null`. `LaunchTailProbeSaveResponse` 모양은 그대로.
     - `packages/shared/src/__tests__/launch-plan.test.ts` 의 뒤탐침 단언을 behavior 목록대로 갈아 끼운다(옛 count/step 검증 테스트는 지운다).
  2) DB — 새 마이그레이션 `supabase/migrations/20261125120000_launch_tail_probe_offsets.sql`(머리 주석 형식은 20261107200000 그대로 · 무엇/왜/결정/권한/원격 적용 「커밋만」/되돌리기). 한 트랜잭션에서:
     - `public.launch_tail_probe_changes` 에 `market text NULL CHECK (market IN ('K','Q'))` · `before_offsets_us integer[] NULL` · `after_offsets_us integer[] NULL` 추가(COMMENT ON COLUMN 각각), `after_count` · `after_step_us` 의 NOT NULL 해제, 모드 CHECK 추가 — 목록 모드(after_offsets_us 와 market 둘 다 있음) 또는 옛 모드(after_offsets_us 없음 + after_count · after_step_us 둘 다 있음). 기존 행 · 칸은 그대로. 범위 CHECK 는 여전히 두지 않는다(서버 거부 시도도 남긴다).
     - `CREATE OR REPLACE FUNCTION public.launch_tail_probe_change_record(p jsonb)`: 공통 필수 admin_email · gateway · fire · outcome. after_offsets_us 키가 null 아니면 목록 모드 — jsonb 배열이고 원소가 전부 number 여야(아니면 22023) · market 필수(없으면 22023) · before_offsets_us 는 null 또는 number 배열(아니면 22023). 아니면 옛 모드 — 기존 검사(after_count · after_step_us number 필수 · before 둘은 number 또는 null) 그대로. 두 모드 다 아니면 22023(누락 목록 문구 — 기존 pgTAP 199 ~ 202행 단언이 계속 맞아야 한다). 배열은 `jsonb_array_elements_text` 로 integer[] 로 바꿔 넣고 `to_jsonb(r)` 반환.
     - `CREATE OR REPLACE FUNCTION public.launch_tail_probe_changes_for_admin(p_limit integer)`: 묶음 키를 (gateway, fire, market) 로(PARTITION BY · DISTINCT ON 둘 다 — NULL 끼리 한 묶음 = 옛 행 묶음). 나머지 모양은 그대로.
     - 두 함수 모두 권한 3줄 재진술(REVOKE FROM PUBLIC · REVOKE FROM anon, authenticated · GRANT TO service_role — 플랫폼 auto-grant 메모리 규칙). 새 표 · 새 RPC 는 만들지 않는다. 끝에 `NOTIFY pgrst, 'reload schema';`.
     - 기존 `supabase/tests/launch_tail_probe_changes.test.sql`: t_cols 에 market · before_offsets_us · after_offsets_us 를 더해 16개로 · 「키 13개」 설명을 16개로. 다른 단언은 그대로 통과해야 한다.
     - 새 `supabase/tests/launch_tail_probe_offsets.test.sql`(머리 주석 · 한 트랜잭션 · ROLLBACK · 단언 설명에 (서버, 발사, 시장, 기대)): behavior 의 pgTAP 항목 전부 + 목록 모드 반환 jsonb 의 after_offsets_us 가 숫자 배열이고 after_count 가 null · 읽기 RPC 에서 K 행 3 · Q 행 2 를 넣고 p_limit 2 로 부르면 시장마다 2행(+ 마지막 ok) · service_role 로 기록 성공. plan(N) 은 실제 단언 수.
  3) relay(`relay/src/generated` · `relay/src/dma/envelope.ts` 는 건드리지 않는다 — 생성물에 새 칸 접근자가 없다):
     - `relay/src/admin/types.ts`: `AdminCommandInput` 에 `launchTailProbeOffsetsUs?: readonly number[]`(op 10 목록 모드 — 지금 `buildAdminCommandReq` 는 싣지 않는다 · 후속 연결 전까지 서비스가 canSet 으로 막는다고 주석) · `launchMarket` 주석을 「op 8 · op 10 목록 모드」 로. `LaunchPlanSnapshot` 에 `kyoboQ16Combined?: boolean`(94 말미 bool · 파서 연결은 후속). `LaunchTailProbeWireRow` 에 `market?: string` · `offsetsUs?: readonly number[]`.
     - `relay/src/admin/launch-plan.ts`: `LaunchTailProbeWire` 에 `kyoboQ16CombinedOf(snap): boolean | undefined` 추가(PENDING = 늘 undefined). `canSet` 의 뜻 = 「목록 모드 op 10 을 와이어에 실을 수 있나」. `setTailProbe` 는 body { profile, market, offsets_us } 로 command 입력 { op 10, userId "", launchProfile, launchMarket, launchTailProbeCount −1, launchTailProbeOffsetsUs } 를 만들고, before = 전 조회 ok 의 tail_probes 에서 같은 profile + market 이고 offsets_us 가 있는 행의 복사본(없으면 null). `#toServer` 는 `kyoboQ16CombinedOf` 가 boolean 이면 `kyobo_q16_combined` 키를 싣는다. `#tailProbesOf` 행 규칙 = behavior 의 「relay 94 행 옮기기」(market 비어 있지 않으면 K|Q 여야 · offsetsUs 없으면 [] · 정수 검사 · 어긋나면 그 행 빼고 warn 1줄). 모듈 머리의 「후속 quick 체크리스트」 를 새 순서로 고친다: ① gh-trade `sync-relay-schema.sh` 로 생성물 갱신 ② envelope `buildAdminCommandReq` op 10 에 offsets 벡터 · count −1 · launch_market 조립 ③ `parseLaunchPlanSnapshot` 이 94 행 market · offsets_us 와 말미 kyobo_q16_combined 를 채움 ④ `relay/src/index.ts` 주입 canSet true ⑤ relay 배포.
     - `relay/src/admin/admin-api.ts`: PUT `/launch-tail-probe/:server` zod 바디 = { profile: LAUNCH_TAIL_PROBE_PROFILES, market: K|Q, offsets_us: Int32 배열 0 ~ LAUNCH_PLAN_SERVER_MAX_PIECES } strict(범위 · 개수 10 · 순서는 보지 않는다 — gh-trade 86 이 말한다). 감사 필드 = server · profile · market · n(목록 길이). 503 문구 「탐침 설정 와이어가 아직 준비되지 않았습니다」.
     - `relay/src/index.ts` `LAUNCH_TAIL_PROBE_WIRE` = { canSet: false(목록 모드 인코드 대기 — 생성물 도착 뒤 후속), tailProbesOf: s ⇒ s.tailProbes(지금은 옛 count/step 행만 온다 → 웹 unsupported), kyoboQ16CombinedOf: s ⇒ s.kyoboQ16Combined(지금 파서가 채우지 않아 undefined) }. 주석은 현재 상태(운영 = 읽기 전용 · ⇄ 꺼짐)를 적는다.
     - 테스트: `relay/tests/admin-launch-plan.test.ts` 의 TP-R* 를 시장별 4행 · market 빈 행 · 잘못된 행 · kyoboQ16Combined true/false/없음으로, TP-S* 를 목록 모드 입력(count −1 · offsets · market) · before 고르기로 갈아 끼운다. `relay/tests/admin-api.test.ts` 탐침 PUT 묶음: 새 바디 200 · 옛 바디 400 · canSet false 503 · 감사 필드. 이 파일의 1823행 근처 기존 타입 오류(launchPlan 대역 Pick 에 setTailProbe 없음)는 손대는 김에 대역을 채워 고쳐도 된다.
  4) server:
     - `server/src/schemas/admin-launch.ts`: `LaunchTailProbeSaveBodySchema` = { market: K|Q, offsets_us: Int32 배열 0 ~ LAUNCH_PLAN_SERVER_MAX_PIECES } strict(구조만 — 범위 · 10발 · 순서는 웹 shared 검증과 gh-trade 86). 경로 fire 는 `LAUNCH_TAIL_PROBE_FIRES`(q16 · n0930 — 지금 값 그대로 · g0830 400). 주석 갱신.
     - `server/src/services/admin-launch.ts`: `isTailProbes` 가 선택 market(K|Q) · offsets_us(number 배열)를 받아들이고 `isLaunchPlanServer` ok 가 `kyobo_q16_combined` 를 undefined 또는 boolean 으로만 통과. `saveLaunchTailProbeViaRelay(relay, email, gateway, fire, market, offsets)` → relay 바디 { profile: launchTailProbeProfileOf(fire), market, offsets_us }, 200 모양 검사의 before = null 또는 number 배열. 나머지 offline/timeout 규칙 그대로.
     - `server/src/services/relay-admin-client.ts`: 타입 · 주석만(바디 모양).
     - `server/src/routes/admin-launch.ts` PUT 핸들러: 이력 1행 = { market, before_offsets_us: saved.before, after_offsets_us: offsets_us, before_count · before_step_us · after_count · after_step_us 모두 null, outcome · code · message · plan_rev 기존 규칙 }. 감사 대상 `${gateway}/${fire}/${market}`. 교보 N 을 서버에서 두 번 보내지 않는다(gh-trade 가 한 번으로 두 행을 맞춘다 — 웹이 K 로 1건 보낸다).
     - `server/tests/routes/admin-launch.test.ts` 탐침 묶음(TP-P* 등)을 behavior 대로 갈아 끼운다. `server/tests/fixtures/fake-relay-admin.ts` 는 타입이 깨질 때만 고친다.
  5) 커밋(경로 지정): `feat(launch): 탐침 — 정각 기준 시장별 목록 계약 · 이력 칸 · server PUT · relay 어댑터(quick-261125-lju)` 류 한글 메시지.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm -C packages/shared exec vitest run --maxWorkers=2 src/__tests__/launch-plan.test.ts && pnpm -C packages/shared run typecheck && pnpm -C relay exec vitest run --maxWorkers=2 tests/admin-launch-plan.test.ts tests/admin-api.test.ts tests/admin-conn.test.ts && pnpm -C relay run typecheck && pnpm -C server exec vitest run --maxWorkers=2 tests/routes/admin-launch.test.ts && pnpm -C server run typecheck && git diff --quiet HEAD -- relay/src/generated relay/src/dma/envelope.ts</automated>
    <automated>test "$(pnpm -C relay run typecheck:tests 2>&1 | grep -c 'error TS')" -le 2</automated>
    <automated>bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_tail_probe_offsets.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_tail_probe_changes.test.sql</automated>
  </verify>
  <done>
    shared 검증기 · 칩 파서 · 전체 이동 · 상태 판정 · 16열 이력 계약이 테스트로 잠겼다. 새 마이그레이션이 launch_tail_probe_changes 에 시장 · 목록 칸을 더하고 두 RPC 가 목록 모드 · 시장별 읽기를 하며 두 pgTAP 파일이 전부 PASS. server PUT 은 { market, offsets_us } 만 받아 relay 로 { profile, market, offsets_us } 를 보내고 목록 모드 이력 1행을 남긴다. relay 는 가짜 어댑터에서 op 10 목록 모드 입력 · 94 시장별 행 · kyobo_q16_combined 를 옮기고, 운영 주입은 canSet false(503)다. relay 테스트 타입 오류는 기존 2건 이하, 생성물 · envelope 무변경. 커밋 1개.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 웹 — 시장 패널마다 탐침 줄 · 칩 편집 칸 · 전체 이동 · 교보 N 공통 · ⇄ · 패널 안 이력 · e2e</name>
  <files>webapp/src/lib/launch-api.ts, webapp/src/lib/__tests__/launch-api.test.ts, webapp/src/lib/launch-plan-view.ts, webapp/src/lib/__tests__/launch-plan-view.test.ts, webapp/src/components/admin/launch-tail-probe-bar.tsx, webapp/src/components/admin/__tests__/launch-tail-probe-bar.test.tsx, webapp/src/components/admin/launch-plan-bar.tsx, webapp/src/components/admin/__tests__/launch-plan-bar.test.tsx, webapp/src/components/admin/launch-map-tab.tsx, webapp/src/components/admin/__tests__/launch-map-tab.test.tsx, webapp/e2e/fixtures/launch.ts, webapp/e2e/specs/admin-launch.spec.ts</files>
  <read_first>
    - .planning/quick/261125-lju-probe-abs-per-market/reference/mockup-probe-per-market-v4.html (panel() · editor() · groupText · chain · wire() 의 추가 · 전체 이동 · 저장 규칙 — UI 정본)
    - webapp/src/components/admin/launch-tail-probe-bar.tsx (지금 막대 · 편집 칸 · 이력 표 · ReflectChip · saveResultViewOf 쓰는 법)
    - webapp/src/components/admin/launch-map-tab.tsx 120 ~ 445행(상태 · 한 번에 하나 규칙 · onSave/onTailProbeSave 흐름) · 540 ~ 760행(LaunchMapView · 패널 렌더 · 교보 N 공통 칸) · 범례 LaunchLegend
    - webapp/src/components/admin/launch-plan-bar.tsx · webapp/src/lib/launch-plan-view.ts 108 ~ 260행 · 495행 이후(뒤탐침 절)
    - webapp/src/lib/launch-format.ts 222 ~ 236행 (isCommonLaunchPlan · COMMON_PLAN_BASE_MARKET · fmtUs)
    - webapp/e2e/specs/admin-launch.spec.ts 897행 이후(TP-R* · TP-S* · TP-D* 묶음) · webapp/e2e/fixtures/launch.ts 410 ~ 590행
  </read_first>
  <behavior>
    - tailProbeSummaryParts([−210,−200]) → strong 「2발」 · 값 그룹 [−210, −200] · [−270,−270,−200] → 「−270×2 · −200」 · [] → strong 「꺼짐」 + 「 · 0발」
    - tailProbeLegacyText({count 5, step_us 10}) → 「뒤탐침 5발 10µs 간격」 · step 0 → 「뒤탐침 5발」 · count 0 → 「뒤탐침 꺼짐」
    - tailProbeChangeText: 목록 행 before [−210] after [] → 「1발 −210µs → 꺼짐」 · before null → 「— → …」 · 옛 행 → 「뒤탐침 3발 10µs 간격 → 뒤탐침 5발 10µs 간격」
    - tailProbeChangesOf(state, KB120, q16, K) → KB120 · q16 이고 market K 또는 null 인 행만 · at 내림차순
    - tailProbeAddChipOf('q16', ["210","x"], [−260,−220]) → 「200」(가장 늦은 유효 −210 + 10) · 유효 칩 없음 → 계획 마지막 −220 + 10 = 「210」 · 990 근처는 상한 +1000 에서 멈춤
    - tailProbeCombinedOn: 교보 서버 · q16 · kyobo_q16_combined true → 참 · false · 칸 없음 · n0930 → 거짓 · KB 서버는 bool 이 true 로 와도 거짓(가드가 우연이 아니라 단언으로 잠긴다)
    - 편집 칸: 칩 「+30」 은 − 접두 없음 · 숫자만은 − 접두 · 위반 칩 aria-invalid · 전체 이동 버튼은 shiftLaunchTailProbeDraft 가 null 이면 disabled · 「+ 추가」 10칩에서 disabled · 저장 = 정렬된 값 · 서버 값과 같으면 비활성
    - 지도 탭: 탐침 줄이 패널마다(16:00 · 09:00:30) · 08:30 없음 · 위쪽 공통 막대 0 · 계획 편집 칸과 탐침 편집 칸은 시장 상관없이 한 번에 하나 · 교보 N 저장 = PUT 1건 market K
    - ⇄: kyobo_q16_combined true 교보 16:00 · 코스피 계획 −350 과 코스닥 탐침 −350 → 두 패널 해당 값에 ⇄ · 범례 항목 · false/칸 없음/KB → 0
  </behavior>
  <action>
  1) `webapp/src/lib/launch-api.ts`: `saveLaunchTailProbe(gateway, fire, market, offsets)` → PUT `/api/admin/launch/tail-probe/:gateway/:fire` 바디 { market, offsets_us }(나머지 규칙 · 타임아웃 그대로). `launch-api.test.ts` 바디 단언 갱신.
  2) `webapp/src/lib/launch-plan-view.ts` 뒤탐침 절을 「탐침」 절로 다시 쓴다(옛 막대 꼬리 문구 함수 · 옛 count/step 편집 함수는 지운다):
     - 문구 상수: `TAIL_PROBE_UNSUPPORTED_TEXT` 「이 서버 버전은 시장별 탐침을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요」 · `TAIL_PROBE_UNKNOWN_TEXT` 「탐침 값을 읽지 못했어요」.
     - `tailProbeSummaryParts(offsets)` · `tailProbeLegacyText(value)` · `tailProbeChangeText(row)` · `tailProbeChangesOf(state, gateway, fire, market)` · `tailProbeAddChipOf(fire, draft, planOffsets)` = behavior 대로. 값 표기는 `fmtUs`(부호 · 천 단위 쉼표) + 「µs」.
     - 편집 상태 `LaunchTailProbeEdit = { gateway; fire; market(편집 칸이 열린 패널); base: number[](열 때 서버 값 · 정렬); draft: string[](칩 원문); valid: number[](마지막 유효 정렬 값 — 오류 중 지도 초안 표식) }` · `tailProbeEditOf(gateway, fire, market, base)`(draft = base 의 칩 문자열) · `tailProbeEditWithDraft(edit, draft)`(shared 검증이 통과할 때만 valid 갱신).
     - 저장 시장: `tailProbeSaveMarketOf(gateway, fire, market)` = 교보 N 공통이면 `COMMON_PLAN_BASE_MARKET`(K), 아니면 그 시장 — PUT 은 늘 1건(계획 저장의 K → Q 두 번 보내기와 다르다 · gh-trade 가 두 행을 맞춘다). 상태 읽기 시장도 공통이면 K.
     - `tailProbeStateWithSave` 는 그대로, `tailProbeStateWithSent(state, gateway, fire, markets, offsets)`(공통이면 [K, Q] 두 행 다 — 행 = { profile, count: 길이, step_us: 0, market, offsets_us }) · `tailProbeSaveRowSeenIn(rows, { gateway, fire, market, offsets, afterId })`(after_offsets_us 배열 같음).
     - ⇄ 판정 한 곳: `tailProbeCombinedOn(server, gateway, fire)` = fire q16 · 교보 서버(`brokerOfServerKey`) · server ok · `kyobo_q16_combined === true` 일 때만(칸 없음 = 꺼짐 — 정정 계약). `tailProbeCombinedSetOf(...)` = 다른 시장의 서버 계획 조각 + 다른 시장의 보이는 탐침 값(그 시장 편집 중이면 유효 초안, 아니면 서버 값) µs 집합. 제목 문구 = 다른 시장이 코스피면 「코스피와 같은 시각 — 한 번에 쏨」 · 코스닥이면 「코스닥과 같은 시각 — 한 번에 쏨」.
     - `launch-plan-view.test.ts` 탐침 묶음을 behavior 대로 갈아 끼운다.
  3) `webapp/src/components/admin/launch-tail-probe-bar.tsx`(파일 이름 · data-slot 접두 유지 · 머리 주석 = 목업 v4 정본 · 상태 목록):
     - `CombinedMark({ title })` — 작은 「⇄」(data-slot `launch-combined` · 목업 `.ch` 결: 10px 굵게 · `--primary` · 옅은 바탕 · 둥근 모서리 · title).
     - `LaunchTailProbeLine({ gateway, fire, market, stateMarket, plan, now, editing, onToggle, combined, combinedTitle, children })` — 패널 안 「다음 발사 계획」 줄 아래 한 줄(data-slot `launch-tail-probe` · data-state loading|unknown|unsupported|set|off · data-market). 「탐침 」 + 값(set = 굵은 `--primary` 「n발」 + 「 · 」 + 그룹 값들(⇄ 해당 값 뒤 CombinedMark) + 「µs」 · off = 굵은 muted 「꺼짐」 + 「 · 0발」 · unsupported = 경고색(`--led-latent` · data-tone warn) 문구 + legacy 가 있으면 「 · 지금 」 + tailProbeLegacyText · unknown = muted 문구) · 오른쪽 「탐침 고치기」/「닫기」(data-slot `launch-tail-probe-toggle` · set/off 이고 onToggle 이 있을 때만) · 열렸으면 children(편집 칸) · 그 아래 이력 접힘 「탐침 변경 이력 n」(data-slot `launch-tail-probe-history-fold` · 그 시장 + 옛 행 · 최근 LAUNCH_PLAN_HISTORY_MAX 행 · 열 「시각 · 이메일 · 전 → 후 · 결과」 · 전 → 후 = tailProbeChangeText · 결과 알약 기존 그대로 · 표는 가로 스크롤). 서버 라벨 제목 · 「코스피 · 코스닥 공통」 부제는 없다(패널 머리가 이미 서버 · 시장을 말한다).
     - `LaunchTailProbeEditor({ gateway, fire, market, common, server: number[], draft, planOffsets, combined, combinedTitle, onDraft, onSave, saving, result })` — 목업 v4 `.ed`:
       · 첫 줄 「전체 이동」 + 버튼 8개(−10 −5 −3 −1 | 구분선 | +1 +3 +5 +10 · data-slot `launch-tail-probe-shift` · data-delta · aria-label 「전체 −10µs」 류 · disabled = `shiftLaunchTailProbeDraft` 가 null 이거나 저장 중) + 힌트 「µs · 코스피 탐침만 · − 더 이르게 · + 더 늦게」(공통이면 「코스피 · 코스닥 공통」).
       · 둘째 줄 「탐침」 + 칩 묶음(flex-wrap): 칩마다(data-slot `launch-tail-probe-chip` · data-idx) 원문이 + 로 시작하지 않으면 고정 「−」 접두 · 입력(data-slot `launch-tail-probe-chip-input` · inputMode tel — 폰 숫자 키패드엔 + 가 없다 · 입력값은 숫자와 + 만 남긴다 · aria-label 「코스피 탐침 n번(정각 −µs)」 · 위반이면 aria-invalid + 빨간 안쪽 테두리) · 「µs」 · ⇄(유효 값이 집합에 있으면) · × 삭제(data-slot `launch-tail-probe-chip-del` · aria-label 「탐침 n번 지우기」). 끝에 「+ 추가」(data-slot `launch-tail-probe-add` · tailProbeAddChipOf · 10칩이면 disabled).
       · 힌트 「n / 10발 · 정각 기준 · 숫자만 치면 정각 −, 정각 뒤는 앞에 + · 저장할 때 이른 시각부터 정렬」 · 위반이면 alert 한 줄(data-slot `launch-tail-probe-alert` · shared 문구 원문).
       · 끝 줄: 결과(ReflectChip + 결과 줄 · `saveResultViewOf` 그대로 · data-slot `launch-tail-probe-result`) · 되돌리기(draft 가 server 칩 문자열과 같으면 disabled) · 저장(검증 통과 · 정렬 값이 서버 값과 다름 · 저장 중 아님).
       · 입력 중 칩은 자리를 옮기지 않는다(정렬은 저장 값에만). 저장 중에도 입력은 막지 않는다.
     - 옛 막대 컴포넌트 · 스테퍼 편집 칸은 지운다. `launch-tail-probe-bar.test.tsx` 를 새 두 컴포넌트 기준으로 다시 쓴다(상태 5종 · 그룹 표기 · legacy 꼬리 · 칩 접두 · 위반 표시 · 전체 이동 비활성 규칙 · 추가 · 삭제 · 되돌리기/저장 비활성 · ⇄ 유무 · 이력 시장 거르기).
  4) `webapp/src/components/admin/launch-plan-bar.tsx`: 옛 꼬리 prop 과 그 렌더를 지우고 선택 `combined?: ReadonlySet<number> | null` · `combinedTitle?: string` 을 받는다 — 집합이 비었거나 없으면 지금과 글자 하나 다르지 않은 planLineText 그대로, 값이 들어 있으면 같은 꼴(q16 「n조각 」 + 값들 · 그 밖 한 값)을 값마다 그리고 해당 값 뒤에 CombinedMark. `launch-plan-bar.test.tsx` 에 ⇄ 유무 단언 추가 · 꼬리 단언 제거.
  5) `webapp/src/components/admin/launch-map-tab.tsx`:
     - 위쪽 서버 공통 탐침 막대 블록을 지우고, `isLaunchTailProbeFire(fire)` 이고 계획 기능이 있을 때(absent 아님) 각 패널 children 안 `LaunchPlanBar` 바로 아래에 `LaunchTailProbeLine` 을 둔다(stateMarket = 공통이면 K · 아니면 패널 시장). 편집 칸은 그 패널 Line 의 children.
     - 상태: tpEdit 는 { gateway, fire, market } 하나 — 계획 편집 칸을 열면 탐침 칸을 닫고, 탐침 칸을 열면 계획 칸과 다른 시장 탐침 칸을 닫는다(한 번에 하나 규칙 그대로). 서버 칩 · 발사 세그먼트 바꾸면 닫힘(기존 effect · closeEdit 그대로). 결과 키 = `gateway|fire|market`.
     - `onTailProbeSave`: 검증 통과 정렬 값 · 저장 시장(tailProbeSaveMarketOf)으로 `saveLaunchTailProbe` 1건 — 세대 가드 · 다시 읽기 · 4xx 확정 실패 · throw = 결과 모름 흐름은 지금 그대로. 응답 뒤 untouched 이면 편집 칸을 응답 plan 의 그 시장(공통이면 K) 정렬 값으로 다시 연다(sentOnly 면 보낸 값 · tailProbeStateWithSent 는 공통이면 [K, Q]).
     - 지도 표식: 패널별 `tailProbeLines` = 그 패널이 편집 중이면 tpEdit.valid(data-src draft), 아니면 서버 offsets_us(공통이면 K 행) — 마지막 조각 + 오프셋 계산은 없앤다. unsupported · unknown 은 빈 배열.
     - ⇄: `tailProbeCombinedOn(plan 서버, gw, fire)` 일 때만 패널마다 tailProbeCombinedSetOf 로 집합을 만들어 LaunchPlanBar · LaunchTailProbeLine · Editor 에 넘기고, 범례(LaunchLegend)에 「⇄ 다른 시장과 한 번에 쏨」(data-legend `combined` · CombinedMark 견본) 항목. 거짓이면 집합 null · 범례 항목 없음.
     - 화면 글자 「뒤탐침」 → 「탐침」: 범례 「삼각형 = 탐침(…)」 · 「예정 탐침」 · 08:30 발 주석 문구(FOOT g0830 「… · 탐침 없음」). 머리 주석의 뒤탐침 설명 단락을 새 구조로 고쳐 쓴다.
     - `launch-map-tab.test.tsx` 의 뒤탐침 묶음을 갈아 끼운다: 패널마다 줄 · 공통 막대 0 · 08:30 줄 0 · 한 번에 하나 · 교보 N PUT 1건 market K · 저장 뒤 정렬 값으로 다시 열림 · 지도 표식 절대 µs · ⇄ true/false/칸 없음/KB.
  6) e2e: `webapp/e2e/fixtures/launch.ts` 의 탐침 픽스처를 4행(Q16·K, N·K, Q16·Q, N·Q · market · offsets_us · count = 길이 · step_us 0)으로 — KB120(Q16 두 시장 5발 · N 꺼짐) · KYOBO119(Q16 에 다른 시장 계획과 같은 µs 하나 이상 · kyobo_q16_combined true · N 두 행 같은 목록) · 이력 = 옛 count/step 행 1 + 목록 행 ok 1 + failed code 1 1(문구는 원문 그대로 보이는지만 단언). 저장 목 `launchTailProbeSaveOk(gateway, fire, body{ market, offsets_us })` 은 그 시장 행(교보 N 이면 두 행)만 바꾼 plan + 목록 이력 1행. 기본 `launchPlanFixture()`(tail_probes 없음)는 unsupported 경로로 남긴다. `webapp/e2e/specs/admin-launch.spec.ts` 897행 이후 TP-R* · TP-S* · TP-D* 를 새 화면으로 다시 쓴다: 읽기(패널마다 줄 문구 · 이력 접힘 · 교보 ⇄ + 범례 · KB ⇄ 0) · unsupported 문구 + 버튼 0 · 404 줄 0 · 고치기(칩 추가 · + 입력 · 전체 이동 · 저장 바디 정렬 값 · 다시 열림 정렬) · 실패 원문 결과 줄 · 한 번에 하나 · 교보 N PUT 1건 · 지도 표식 수 · 390 칩 10개 줄바꿈 · 가로 스크롤 0. 실행은 Task 3 끝에서 한다(축 변경과 함께).
  7) 커밋(경로 지정): `feat(webapp): 경계 지도 — 시장 패널마다 탐침 줄 · 칩 편집 칸 · 전체 이동 · ⇄(quick-261125-lju)` 류.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm -C webapp exec vitest run --maxWorkers=2 src/lib/__tests__/launch-api.test.ts src/lib/__tests__/launch-plan-view.test.ts src/components/admin/__tests__/launch-tail-probe-bar.test.tsx src/components/admin/__tests__/launch-plan-bar.test.tsx src/components/admin/__tests__/launch-map-tab.test.tsx && pnpm -C webapp run typecheck</automated>
    <automated>! grep -rnE "launchTailProbeOffsets|LAUNCH_TAIL_PROBE_LIMITS|tailProbePlanSuffixText" packages/shared/src webapp/src webapp/e2e</automated>
  </verify>
  <done>
    시장 패널마다 탐침 줄 · 칩 편집 칸(전체 이동 · 추가 · 삭제 · + 정각 뒤 · 저장 정렬) · 패널 안 이력이 있고 위쪽 공통 막대 · 옛 계획 줄 꼬리는 없다. 교보 N 은 공통 한 목록 · PUT 1건. ⇄ 는 kyobo_q16_combined true 인 교보 16:00 에서만. 관련 webapp vitest 통과 · webapp 타입체크(앱 + e2e) 0 오류 · 지운 옛 헬퍼 이름이 코드에 0. e2e spec 은 갱신만(실행은 Task 3). 커밋 1개.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 경계 지도 축 — 점 · 계획 · 바꿀 계획 · 탐침을 전부 담고 축 밖 표식 경로를 걷어냄 + e2e 한 spec 실행</name>
  <files>webapp/src/lib/launch-map.ts, webapp/src/lib/__tests__/launch-map.test.ts, webapp/src/components/admin/launch-gate-chart.tsx, webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx, webapp/src/components/admin/__tests__/launch-map-tab.test.tsx, webapp/src/lib/launch-format.ts, webapp/src/lib/__tests__/launch-format.test.ts, webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx, webapp/e2e/specs/admin-launch.spec.ts</files>
  <read_first>
    - webapp/src/lib/launch-map.ts 1 ~ 140행(머리 주석 · 축 상한 상수 · 축 타입 · launchAxisOf · xOfUs) · 320 ~ 372행(툴팁 · 호버 꼬리)
    - webapp/src/components/admin/launch-gate-chart.tsx 30 ~ 110행 · 160 ~ 460행(축 계산 · 점 · 계획 점선 · 바꿀 계획 · 탐침 표식 · 축 끝 글)
    - webapp/src/lib/__tests__/launch-map.test.ts 67 ~ 130행 · 280 ~ 320행 · 380 ~ 470행 · webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx 210 ~ 360행 · 500 ~ 520행 · webapp/src/components/admin/__tests__/launch-map-tab.test.tsx 448행 근처
  </read_first>
  <behavior>
    - launchAxisOf(values, marks): lo/hi = values ∪ marks 전체의 최소 · 최대(비면 0) · 폭 > 40 이면 여유 8 · 10 단위, 아니면 여유 3 · 1 단위(WIDE_SPAN 규칙 그대로) — 예 values KB 코스닥 + mark −35000 → xmin ≤ −35000 · [−300, −305, −20148] → xmin ≤ −20148 · values [] marks [−245] → −245 를 담는 좁은 축
    - 차트: 계획 · 바꿀 계획 · 탐침 값이 아무리 멀어도 점선/실선/삼각형이 각각 그려지고, ◂/▸ 글리프 · 「▸ 다음 …µs」 · 「바꿀 n번 …µs」 축 끝 글이 없다
    - 툴팁 · 호버 꼬리에 「축 밖」 이 없고, 탐침 조각 꼬리는 「탐침 n」
  </behavior>
  <action>
  <!-- planner-discipline-allow: AXIS_CAP -->
  <!-- planner-discipline-allow: offAxis -->
  <!-- planner-discipline-allow: OFF_GLYPH -->
  <!-- planner-discipline-allow: LaunchOffAxis -->
  1) `webapp/src/lib/launch-map.ts`(사용자 결정 「축 상한 · ◂▸ 폐기 — 지도 전체」):
     - 축 상한 상수(AXIS_CAP)와 중앙값 기반 core 고르기를 지우고 `launchAxisOf(values, marks)` 가 둘을 합친 전체의 최소 · 최대로 축을 잡게 한다(fire 인자 제거 — 소비자는 launch-gate-chart 뿐). 패딩 · 단위 규칙(WIDE_SPAN · 여유 8/3 · 단위 10/1)과 floor/ceil 은 그대로. 비면 0 하나.
     - 축 타입의 축 밖 판정 필드(offAxis)와 그 타입(LaunchOffAxis)을 지우고 `launchAxisFrom(xmin, xmax)` 은 { xmin, xmax } 만 돌려준다(테스트가 쓴다). `xOfUs` 의 끝 고정(clamp)은 안전장치로 남긴다(그림 경로 아님).
     - 툴팁 · 호버(`launchTooltipOf` · 호버 짝 함수 · tipPartsOf)의 축 밖 인자와 「축 밖」 꼬리를 지운다. 탐침 조각 꼬리의 화면 글자 「뒤탐침 n」 → 「탐침 n」(화면 이름 변경 — kind 17 판정 `isLaunchTailProbe` 은 그대로).
     - 머리 주석의 이상치 상한(Pitfall 4) 단락을 「축은 값 전부를 담는다(quick-261125-lju 사용자 결정 — 먼 오발 점도 축을 넓힌다)」 로 고쳐 쓴다. 눈금 · 리본 칸 수 상한(≤ 12 · ≥ 28px · ≤ 폭 px)은 그대로라 넓은 축에서도 노드 수가 폭에 비례한다.
  1b) 화면 이름 변경 나머지(사용자 결정은 화면 전체 — 탭 한정 아님): `webapp/src/lib/launch-format.ts` 90행 근처 주문 탭 조각 라벨 「· 뒤탐침」/「· 뒤탐침 n」 → 「· 탐침」/「· 탐침 n」(판정 `isLaunchTailProbe` 은 그대로). `launch-format.test.ts` · `launch-orders-tab.test.tsx` 의 해당 단언을 맞춘다.
  2) `webapp/src/components/admin/launch-gate-chart.tsx`: 예정 탐침 표식 title 「예정 뒤탐침 n번 …」 → 「예정 탐침 n번 …」. `launchAxisOf` 호출에서 fire 를 빼고, 축 밖 분기 전부를 걷어낸다 — 날짜 행의 ◂/▸ 글리프(OFF_GLYPH 상수 포함) · 점의 축 밖 표시 · 계획 「▸ 다음 …µs」 글 · 바꿀 계획 축 끝 글과 그 합침 판정 · 탐침/계획/초안의 「축 안 값만」 거르기. 계획 점선 · 바꿀 계획 실선 · 탐침 표식은 받은 값 전부를 그린다(인덱스 · data-idx 그대로). 머리 주석의 이상치 · 축 밖 문장을 새 규칙으로 고친다. 툴팁 · 호버 호출에서 축 밖 인자를 뺀다.
  3) 테스트: `launch-map.test.ts` 의 축 밖 판정 단언(78 ~ 105 · 286 ~ 298 · 461 ~ 468행 근처)을 「값 전부를 담는다」 단언으로, 툴팁 「· 축 밖」 단언(386 ~ 428행)은 꼬리 없음 + 「탐침 n」 으로 바꾼다. `launch-gate-chart.test.tsx` 217 ~ 260 · 339 · 345 · 508행 근처의 「▸ 다음」 · 「◂」 · 「축 밖」 · 합친 글 단언을 「멀리 있는 계획/초안/탐침도 선이 그려지고 축 끝 글 0」 단언으로. `launch-map-tab.test.tsx` 448행 근처 n0930 단언의 축 밖 분기 주석 · 단언도 맞춘다. 근거 수치(축 폭)는 새 식으로 다시 계산한 값을 쓴다 — 테스트를 맞추려고 구현을 바꾸지 않는다.
  4) e2e 한 spec 실행: `pnpm -C webapp exec playwright test e2e/specs/admin-launch.spec.ts --workers=1`. Task 2 에서 다시 쓴 TP-* 와 축 변경으로 어긋난 기존 단언(있으면 「▸ 다음」 류)을 고친다. webServer 타임아웃이 `NextFontGoogleFontFileReplacer` 반복이면 `rm -rf webapp/.next` 후 다시. 실패가 이 작업 밖 원인(BASE 에서도 실패)이면 고치지 말고 SUMMARY 에 「BASE 에서도 실패」 근거와 함께 적는다.
  5) 마지막 회귀: webapp 경계 지도 관련 vitest 전부(`src/lib/__tests__/launch` · `src/components/admin/__tests__/launch` 접두) · webapp 타입체크.
  6) 커밋(경로 지정): `feat(webapp): 경계 지도 축 — 값 전부 담기 · 축 밖 표식 제거(quick-261125-lju)` 류.
  7) SUMMARY(`.planning/quick/261125-lju-probe-abs-per-market/261125-lju-SUMMARY.md`)의 「남은 일」 에 적는다: gh-trade Phase 50 `.fbs` 확정 · 인계 뒤 후속 quick — ① `sync-relay-schema.sh` 로 relay 생성물 갱신 ② envelope op 10 목록 모드 조립(offsets 벡터 · count −1 · launch_market) ③ 94 행 market · offsets_us 와 말미 kyobo_q16_combined 파스 ④ `relay/src/index.ts` canSet true ⑤ 배포 순서 DB(`supabase db push` — 이 마이그레이션) → relay → server → webapp(push) · 86 범위 원문 문구 도착 확인. 그 전까지 운영 화면은 탐침 읽기 전용(unsupported) · ⇄ 안 보임이 정상이라고 한 줄.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm -C webapp exec vitest run --maxWorkers=2 src/lib/__tests__/launch src/components/admin/__tests__/launch && pnpm -C webapp run typecheck && ! grep -nE "AXIS_CAP|offAxis|OFF_GLYPH|LaunchOffAxis" webapp/src/lib/launch-map.ts webapp/src/components/admin/launch-gate-chart.tsx</automated>
    <automated>pnpm -C webapp exec playwright test e2e/specs/admin-launch.spec.ts --workers=1</automated>
  </verify>
  <done>
    경계 지도 축이 점 · 계획 · 바꿀 계획 · 탐침을 전부 담고(16:00 · 09:00:30 · 08:30), 축 밖 표식 · 축 끝 글 코드와 그 테스트가 없다. 툴팁에 「축 밖」 이 없고 탐침 조각은 「탐침 n」. webapp 경계 지도 vitest 전부 · 타입체크 · admin-launch e2e(--workers=1) 통과(작업 밖 BASE 실패는 근거와 함께 SUMMARY). SUMMARY 에 생성물 도착 뒤 후속 체크리스트. 커밋 1개.
  </done>
</task>

</tasks>

<verification>
- shared · relay · server · webapp 각각의 vitest(`--maxWorkers=2`) · typecheck 통과(relay `typecheck:tests` 는 기존 2건 이하).
- pgTAP `launch_tail_probe_offsets.test.sql` · `launch_tail_probe_changes.test.sql` 전부 PASS(일회용 컨테이너 · 원격 접촉 0).
- `git diff --quiet HEAD -- relay/src/generated relay/src/dma/envelope.ts` (Task 1 시작 커밋 기준 끝까지 무변경).
- admin-launch e2e 한 spec(`--workers=1`) 통과 — 390 가로 스크롤 0 포함.
- 배포 · push · `supabase db push` 0회. 커밋 3개 모두 경로 지정 add.
</verification>

<success_criteria>
- must_haves T-1 ~ T-9 가 테스트(vitest · pgTAP · e2e)로 하나 이상씩 잠겨 있다.
- 위치 경고 UI 가 어디에도 없다 · 「뒤탐침」 화면 글자는 옛 count/step 행 표시(이력 · unsupported 꼬리)에만 남는다.
- ⇄ 는 kyobo_q16_combined true 일 때만이고 지금 운영 와이어로는 보이지 않는다(정정 계약).
- 생성물 도착 뒤 연결이 SUMMARY 「남은 일」 체크리스트로 남았다.
</success_criteria>

<output>
Create `.planning/quick/261125-lju-probe-abs-per-market/261125-lju-SUMMARY.md` when done
</output>
