# Quick Task 261107-l7w: 발사 경계 지도 뒤탐침 개수 · 간격 설정 (서버별 · 발사별) - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Task Boundary

사용자 요청(2026-11-07): 「발사 경계지도에서 뒤탐침을 몇 조각을 몇 µs 간격으로 쏠 건지 세팅할 수 있게. 서버별로 4시 탐침, 09:00:30 탐침 각자 다 설정할 수 있어야 해.」

지금은 뒤탐침 개수가 gh-trade server.toml(`[queued_order] tail_probe_count` · `[open_arb] nxt_tail_probe_count`, 0..5)에 있고 간격은 10µs 고정이라 재기동 없이 못 바꾼다.
gh-trade(gh-trade-70 세션)와 계약을 합의했다(아래). gh-trade 쪽 구현(.fbs · 서버)은 **아직 착수 전**이다.

이 quick 의 범위 = **wire 를 직접 다루지 않는 모든 층**: shared 계약 · server API · DB 이력 · 웹 설정 칸 · relay 의 HTTP 계약/서비스 로직(와이어 어댑터 제외) + 인박스 `261107-nxt-tail-probe-kind17` 범례 수정.
**relay 의 flatbuffers 인코드(44 op 10) · 디코드(94 tail_probes)는 gh-trade 인계(.fbs sync) 뒤 후속 quick** 으로 붙인다 — 생성 코드(`relay/src/generated/*`)는 gh-trade `sync-relay-schema.sh` 소유라 손으로 고치지 않는다.

</domain>

<decisions>
## Implementation Decisions

### gh-trade 계약 (gh-trade-70 합의 · 2026-11-07)
- 단위 = **(서버, profile)** — Q16(16:00) · N(09:00:30). 코스피 · 코스닥 공통(시장별로 안 나눔).
- 값: `count` 0..10(0 = 끔 · 2026-11-07 gh-trade 사용자 결정으로 0..5 → 0..10) · `step_us` 1..100(끝발 최대 +1000µs). count 0 이어도 step 범위 검사 · 저장.
- 범위 밖 = 86 code 1 + 고정 문구(새 code 없음) — 웹은 서버 문구 원문을 그대로 보인다. 웹 편집 칸도 같은 범위로 막는다(계획 편집 칸과 같은 결).
- 저장 = 44 **op 10 SetLaunchTailProbe**: `launch_profile`("Q16" · "N") + 말미 append `launch_tail_probe_count: int` · `launch_tail_probe_step_us: int`.
  멱등 = code 0 「변경 없음」 · rev 불변 · 94 없음 / 변경 = 86 → 94.
- 조회 = op 9 그대로. 94 LaunchPlanSnapshot 말미 append `tail_probes: [LaunchTailProbe { profile: string; count: int; step_us: int }]` — Q16 · N 두 행 고정 순서.
- 저장 위치 log/launch_plan.toml · plan_rev 공유 +1 · updated_at 갱신 · 다음 발사부터 적용.
- 의미: 첫 발 = 마지막 실조각 계획 시각 + step_us · i 번째(0부터) = + (i+1)·step_us. kind 17 planned_us 도 같은 식.
- 파일에 값이 없을 때만 server.toml 값 + step 10 이 초깃값. 이후 롤백은 op 10 count 0.
- 구 서버 호환: 94 에 tail_probes 없음 → 웹은 「이 서버 버전은 뒤탐침 설정을 몰라요」 읽기 전용 · op 10 → 86 code 1(알 수 없는 명령) → 기존 실패 경로.
- 배포 순서 무관(양쪽 다 모르는 칸 무시).

### 화면 (목업 채택 — 변형 C)
- 채택 목업: `reference/mockup-tail-probe-setting.html` 변형 **C 한 줄 + 차트 예정 표시**.
- 경계 지도 탭 · 고른 서버 · 고른 발사(16:00 / 09:00:30)마다: 요약 카드 아래 · 시장 패널 위에 **「<서버> 뒤탐침」 줄 하나**(부제 「코스피 · 코스닥 공통」).
  - 보기: 「5발 · 10µs 간격 · 마지막 조각 뒤 +10 ~ +50µs」 / count 0 = 「꺼짐 · 0발」 / 구 서버 = 경고색 한 줄 「이 서버 버전은 뒤탐침 설정을 몰라요 — gh-trade 업데이트 뒤 바꿀 수 있어요」(고치기 버튼 없음).
  - 「뒤탐침 고치기」 → 인라인 편집: 발 수 스테퍼(0~10 · 「0 = 끔」) · 간격 입력(µs · 1~100) · 예정 미리보기 칩(+10µs · +20µs …) · 되돌리기 · 저장 · 저장 결과 줄(계획 저장과 같은 꼴 「KYOBO112 저장됨 · HH:MM · 다음 16:00 발사부터」).
  - 아래 「▸ 변경 이력 n」 접기(계획 이력과 같은 꼴).
- 각 시장 패널의 「다음 발사 계획」 줄 끝에 「+ 뒤탐침 5발 · 10µs」(꺼짐이면 「· 뒤탐침 꺼짐」, 구 서버 · 계획 대신 값 상태면 생략).
- 지도(차트)에 **예정 뒤탐침 위치**를 미리 그린다: 다음 발사 계획 마지막 조각 + (i+1)·step 마다 점선 + 빈 삼각형(기존 「다음 발사 계획」 점선과 구분되는 muted 색). 범례에 「예정 뒤탐침」 견본.
- 고칠 때 미리보기(draft)도 차트에 반영되면 좋다(계획 편집 칸의 「바꿀 계획」 표시와 같은 결) — Claude 재량.
- 서버 · 발사 전환 시 열린 뒤탐침 편집 칸은 닫는다(계획 편집 칸과 같은 규칙).

### 인박스 범례 수정 (같이 처리)
- `docs/inbox/from-gh-trade/261107-nxt-tail-probe-kind17.md`: 범례의 「뒤탐침」 삼각형 견본이 `fire === 'q16'` 일 때만 나오는 조건(launch-map-tab.tsx `tailProbed`)을 풀어 09:00:30 에도 보이게. 관련 주석의 「16:00 뒤탐침」 서술을 발사 무관으로 정리. 노트 `status: done` · `done_commit` 채움.

### 이력 (Claude 재량 범위 안 권장)
- 뒤탐침 변경도 시도마다 1행(실패 포함 · 계획 이력 D-29 와 같은 규칙). `launch_plan_changes` 는 market NOT NULL · offsets 배열이라 **별도 표** 권장(예: `launch_tail_probe_changes` — at · admin_email · gateway · fire · before_count/before_step_us(모르면 null) · after_count/after_step_us · outcome · code · message · plan_rev). RLS · REVOKE 규칙은 메모리(anon/authenticated REVOKE · service_role 전용) 그대로.

### Claude's Discretion
- server 라우트 모양(권장: `PUT /api/admin/launch/tail-probe/:gateway/:fire` 바디 `{ count, step_us }` · 조회는 기존 `GET /api/admin/launch/plan` 응답의 서버별 결과에 `tail_probes` 를 얹는다 — 계획과 한 번에 읽음).
- relay HTTP 계약(`PUT /internal/admin/launch-tail-probe/:server` · 조회 응답 `tail_probes`)과 shared 타입을 이번에 정의하고, relay 서비스는 와이어 어댑터를 주입받는 꼴로 두어 후속 quick 이 인코드/디코드만 붙이게 한다. 지금 relay 가 구 94 를 읽으면 `tail_probes` 없음(= 구 서버) 그대로.
- 계획 편집 칸과 컴포넌트 · 훅을 얼마나 공유할지.

</decisions>

<specifics>
## Specific Ideas

- 사용자 원문: 「발사 경계지도에서 뒤탐침을 몇조각을 몇us 간격으로 쏠건지 세팅할 수 있게 수정하자. gh-trade에서 뒤탐침 작업중인 세션과 상의해서 작업해줘. 서버별로 4시탐침, 09:00:30 탐침 각자 다 설정할 수 있어야해.」
- 목업 답: 「C 한 줄+차트 표시」.
- 직전 운영 사실: 세 서버(KB120 · KYOBO119 · KYOBO112) 모두 server.toml 뒤탐침 5발(16:00 · 09:00:30) — gh-trade 129a354c(미배포).

</specifics>

<canonical_refs>
## Canonical References

- 채택 목업: `.planning/quick/261107-l7w-admin-launch-tail-probe-setting/reference/mockup-tail-probe-setting.html` (변형 C)
- 인박스: `docs/inbox/from-gh-trade/261107-nxt-tail-probe-kind17.md`
- 계획 어드민 원 설계: `.planning/phases/35-launch-gate/` · shared `packages/shared/src/launch-plan.ts` · server `server/src/routes/admin-launch.ts` · `server/src/services/admin-launch.ts` · `server/src/services/relay-admin-client.ts` · relay `relay/src/admin/launch-plan.ts` · `relay/src/admin/admin-api.ts` · 이력 표 `supabase/migrations/20261028200100_launch_plan_changes.sql`
- 웹: `webapp/src/components/admin/launch-map-tab.tsx` · `launch-gate-chart.tsx` · `webapp/src/lib/launch-plan-view.ts` · `webapp/src/lib/launch-api.ts` · `webapp/src/lib/launch-map.ts`
- 직전 quick: `.planning/quick/261107-iep-*` · `261107-jhk-*`

</canonical_refs>
