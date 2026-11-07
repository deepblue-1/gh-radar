# Quick Task 261107-iep: 어드민 발사 메뉴 서버별 보기 (KB120 · 교보119 · 교보112) - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Task Boundary

`/admin/launch` 는 지금 증권사(KB · 교보) 라벨로 고정 4칸(KB120 Q/K · KYOBO119 Q/K)만 그린다. 이를 **서버별**로 바꾼다 —
서버(KB120 · 교보119 · 교보112)를 골라 그 서버의 ① 주문 내역 ② 발사 경계 지도 ③ 발사 주문시각(계획 고치기)을 다룬다.

사실 확인(2026-11-07 운영 DB):
- `dma_servers` = KB120(enabled · order) · KB121(disabled) · KYOBO119(enabled · order) · **KYOBO112(enabled · sort_order 40)**.
  KYOBO112 = gh-trade 2026-11-05 옛 127 기계를 10.16.207.112 로 운영 재투입한 교보 서버(gh-trade `server/config/kyobo/112/server.toml` — 119 사본, launch 설정 동일).
- `launch_heads` · `launch_pieces` 에 KYOBO112 행은 아직 0. 적재(`dma_strategy_apply`)는 게이트웨이 무관이라 112 가 발사하면 그대로 들어온다 — DB · relay 적재 변경 없음.
- relay `GET/PUT /launch-plan` 은 서버 키를 레지스트리 형식으로만 본다(상한 8) — relay 변경 없음.
- gh-trade 43 D-02 「키 = 서버 × 발사 × 시장, 그 어드민 연결이 붙은 서버 자신」 — 112 도 같은 빌드라 44/94 를 받는다. 못 받으면 기존 「실패」 경로로 보인다.

</domain>

<decisions>
## Implementation Decisions

### 서버 고르기 모양 (목업 채택 — D 변형)
- 채택 목업: `reference/mockup-launch-server-pick.html` 변형 **D**.
- **My page 계좌 칩 꼴**(`webapp/src/components/me/account-chips.tsx` `MeAccountChips` 와 같은 칩 모양 · radiogroup 키보드 문법 · 넘치면 가로 스크롤 · 선택 칩 = `--seg-on-bg/fg/shadow`, 나머지 `--muted`).
- 자리: 페이지 제목(PageHeader) 아래 · 탭 줄 위. 고른 서버를 **주문 내역 · 경계 지도 두 탭이 함께** 따른다.
- 칩 글자: `KB120` · `교보119` · `교보112` (교보 = KYOBO 키의 표시 이름 + 번호).
- 순서 = 서버 레지스트리 순(KB120 → 교보119 → 교보112). 처음 들어오면(쿼리 없음) **KB120**.

### 상태 · 주소
- 쿼리 `?gw=<서버키>` 가 진실 원본(기존 tab · d · fire · range 와 같은 규칙). 칩 전환 = `router.replace`, 다른 키 보존. 모르는 값은 `router.replace` 로 지운다.

### 탭별 동작
- 주문 내역: 머리 카드 = 고른 서버의 코스닥 · 코스피 2장(발사 없으면 「<서버> <시장> · 이 날 발사 없음」 빈 카드). 조각 표 묶음도 고른 서버만. 출처 칩 「KB120 · KYOBO119 저널 80 …」 → 고른 서버 키. 응답은 그대로 하루치 1회(서버 전환에 재요청 없음 — 클라이언트에서 거른다).
- 경계 지도: 요약 카드 · 패널 = 고른 서버의 2개. 지도 요청은 종전 그대로(fire × range 1건), 서버 전환은 클라이언트 필터. 계획 조회(`GET /api/admin/launch/plan`)는 탭 진입 1회 그대로(모든 계획 대상 서버를 한 번에) — 계획 고치기 · 저장 흐름 무변경, 대상만 고른 서버 패널.
- 서버를 바꾸면 열린 계획 편집 칸은 닫는다(발사 세그먼트 전환과 같은 규칙).

### 라벨
- 「KB 코스닥」 · 「교보 코스피」 (증권사 라벨) → 「KB120 코스닥」 · 「교보119 코스피」 (서버 라벨). 머리 카드 · 조각 묶음 제목 · 지도 패널 · 요약 카드 전부.

### 계약 (shared · server)
- shared 에 발사 서버 목록 한 벌(KB120 · KYOBO119 · KYOBO112 순)과 표시 이름을 둔다. `LAUNCH_ORDER` 는 이 목록 × (Q, K)에서 나온다(KYOBO112 Q/K 가 뒤에 붙음 — 기존 두 서버 순서 불변이라 `launch-queue` 의 게이트웨이 순열 · `order_est` 결과는 기존 서버에 대해 그대로).
- `LAUNCH_PLAN_GATEWAYS` 에 KYOBO112 추가 → server `LaunchPlanParams` enum · `readLaunchPlanServers` 가 3대를 묻는다. 주석의 「KB121 · KYOBO127 은 대상 아님」 문구는 「KB121 은 대상 아님」 + 112 사실로 고친다.

### 기존 기록 보존 (사용자 추가 지시 2026-11-07)
- 「기존의 KB 주문내역 및 발사경계지도는 KB120, 교보는 교보119 로 지워지지 않고 남아 있게」.
- 운영 DB 실측: 기존 행은 이미 서버 키로 적재돼 있다 — launch_pieces KB120 462 · KYOBO119 239 / launch_heads 70 · 51 /
  launch_plan_changes 50 · 42 / launch_piece_queue 260 · 94 · 그 밖 키 0 · KYOBO112 0.
- 따라서 **DB 마이그레이션 · 데이터 이전 · 삭제 0건**. 웹은 `gateway` 로 거르기만 한다 → 옛 「KB」 기록은 KB120 칩, 옛 「교보」 기록은 교보119 칩에서 그대로 보인다(날짜 목록 · 지도 범위 · 계획 이력 포함).
- 날짜 내비(‹ ›)는 응답의 전체 날짜 목록 그대로 둔다(서버별로 좁히지 않는다) — 그 날 고른 서버에 발사가 없으면 빈 카드.
- 테스트로 못 박는다: KB120 · KYOBO119 픽스처 기록이 각 칩에서 보이고, 교보112 는 빈 카드.

### Claude's Discretion
- 칩 컴포넌트를 `MeAccountChips` 에서 일반화해 재사용할지, 발사 전용 작은 칩 컴포넌트를 둘지(키보드 로직 중복 최소화 쪽 권장). 기존 /me · 작업대 동작은 바꾸지 말 것.
- 서버 목록을 레지스트리 API 로 동적으로 받지 않는다 — shared 상수 한 벌(새 발사 서버 추가는 한 줄).

</decisions>

<specifics>
## Specific Ideas

- 사용자 원문: 「어드민 발사메뉴가 지금 교보/KB로만 구분되어있는데, 교보119, 교보112, KB120 식으로 서버별로 주문내역을 보고 발사경계지도를 보고, 주문시각을 손볼 수 있어야해.」
- 사용자 답: 서버 선택은 「마이 페이지 계좌번호처럼 칩형태로」 → 목업 D 채택.

</specifics>

<canonical_refs>
## Canonical References

- 채택 목업: `.planning/quick/261107-iep-admin-launch-per-server-view/reference/mockup-launch-server-pick.html` (변형 D)
- 칩 원형: `webapp/src/components/me/account-chips.tsx`
- 발사 어드민 원 설계: `.planning/phases/35-launch-gate/` (reference 목업 · CONTEXT)
- 계약: `packages/shared/src/launch.ts` (`LAUNCH_ORDER`) · `packages/shared/src/launch-plan.ts` (`LAUNCH_PLAN_GATEWAYS`) · `server/src/schemas/admin-launch.ts` · `server/src/services/admin-launch.ts`
- 웹: `webapp/src/components/admin/launch-client.tsx` · `launch-orders-tab.tsx` · `launch-map-tab.tsx` · `launch-gate-chart.tsx` · `webapp/src/lib/launch-format.ts` · e2e `webapp/e2e/specs/admin-launch.spec.ts` · fixtures `webapp/e2e/fixtures/launch.ts`

</canonical_refs>
