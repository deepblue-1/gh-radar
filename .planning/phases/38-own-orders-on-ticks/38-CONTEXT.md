# Phase 38: 틱뷰어 우리 주문·체결 표시 - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

트레이더가 틱뷰어(`/analytics/ticks` · Phase 37)에서 **우리 팀 계좌가 낸 주문의 체결이 어느 A3 전문인지**, 그리고 **그 주문의 조건이 어느 호가(B6)·체결(A3) 전문을 보고 걸렸는지**를 전문 목록 · 차트 · 「이 주문」 카드에서 바로 본다 — 「이 주문은 이 전문을 보고 나갔다」. 과거(격자)와 당일(live) 경로가 같은 화면이다.

원천 · 짝짓기 규칙 · 성공 수치는 **ROADMAP Phase 38 원문이 정본**이고 이 discuss 는 그것을 바꾸지 않았다(2026-11-03 이전 세션 실측 — 다시 재지 않는다. 실측 스크립트는 저장소에 없으므로 플래너는 shared 순수 함수 + 10/30 격자 픽스처로 재현 테스트를 만든다):
- 우리 체결 = `dma_journal_events` notice_type 'E' · exec_qty > 0(gateway · gw_time · account_no · order_no · isin · exchange · side · exec_price · exec_qty).
- 조건 근거 = `dma_strategy_events` kind 3 · 6(gw_time_ms · order_no · reason_code · cond_metric/threshold/actual · ev_kind 1 호가 · 2 체결 · 3 체결통보 · 0 없음 · ev_price · ev_qty_before/after · ev_trade_qty · cum_volume). 표시명 정본 `packages/shared/src/strategy-event-labels.ts`.
- A3 에는 계좌 · 주문번호 · 체결번호가 없다. cum_volume 은 레이아웃 offset 113 · 12자에 있으나 `A3Columns` 에 열이 없어 **추가**한다.
- 짝짓기 = 같은 가격 · A3 남은 수량 ≥ 체결 수량 · (gw_time − A3 체결시각) ∈ [−200, +1500]ms 중 가장 가까운 것 · 배정한 만큼 차감 → 10/30 격자 **≥ 98%**(401/406 재현). 약 40% 는 「큰 A3 의 일부」(A3 = 공격 주문 × 가격 단 합산 → 「우리 n주 / 전체 m주」) · 약 25% 는 20ms 안 동가 후보 둘 이상 → **「추정」**.
- 조건 근거 ↔ 전문: 호가 근거(ev_kind 1) = 그 시각 −3s ~ +50ms 안 B6 중 ev_price 단 잔량 == ev_qty_after(**29/29**) · 체결 근거 단건(스윕 등)은 정확 · 주기매도는 「누적 before → after 구간」 집계 · cum_volume > 0 이벤트는 같은 누적거래량 A3 가 **100/100** 존재 → 「주문 직전 마지막 체결」 앵커 · 수동 · 장전(cum 0)은 근거 없음 → 주문 시각 위치만.

**성공 기준(ROADMAP Phase 38 의 5개 유지 · 5번만 이 discuss 로 뜻이 바뀐다 — 플래너가 고친다):**
1. 목업 검토 · 채택 완료 — **B 둘째 레일** 채택(`reference/mockup-own-fills.html` · 2026-11-03).
2. 우리 체결 ↔ A3 짝짓기 ≥ 98% · 「우리 n주 / 전체 m주」 · 동가 후보 복수 「추정」 · 짝 없는 체결은 주문 시각 위치로(누락 0).
3. 조건 근거 전문 특정 — B6 29/29 · 체결 근거 단건 정확 · 주기매도 구간 표시 · cum_volume 앵커 100/100 · `A3Columns` cum_volume 열.
4. 과거 · 당일 같은 화면 · 계좌 가시성 서버측 강제(D-01) · 체결 · 조건 근거 RPC 1회.
5. **대상 게이트웨이 = 어드민에서 켜진 서버(`dma_servers.enabled`) 전부 — 하드코딩 없음.** KB121 · KYOBO127 은 꺼져 있어 빠지고 켜면 자동 포함. gh-trade 인박스 요청 없음 · 「기록 없는 게이트웨이」 안내 없음(D-03).

**범위 밖:** 팀 손익 계산 변경(37 D-12 「우리 체결 포함」 유지) · /me 주문 로그 → 틱뷰어 진입점 · KB121 · KYOBO127 저널 연결(gh-trade/relay 작업 · 켜는 것은 어드민 결정) · 창구별 배분 · 「우리 체결 제외」 계산.

</domain>

<decisions>
## Implementation Decisions

### 계좌 가시성 · 대상 게이트웨이
- **D-01: 「우리」 = `dma_visible_accounts(p_user_id)` 가시 계좌의 체결 + `requireAdmin` 사용자는 전 계좌.** 「오늘 주문」 카드 · /me 손익(36 D-17 ②) · 틱뷰어 게이트(37 D-08)와 같은 가시성 조인을 RPC 안에서 서버측으로 강제한다(service_role 전용 · REVOKE anon/authenticated 명시 — [[feedback_supabase_rpc_revoke]]). 어드민 분기는 `/admin/pnl`(36 D-17 ① · `requireAdmin()` DB role 매 요청 조회) 선례 — RPC 에 `p_all_accounts boolean` 류 인자를 두고 서버가 role 로만 켠다(클라 입력 금지). 남의 계좌 체결은 일반 체결로 보인다. — **Reversibility:** reversible.
- **D-02: 계좌 선택 없음 — 보이는 계좌 전부 합쳐 「우리」 한 색.** 머리 계좌 칩(32 D-20 동형) · 계좌별 색 구분 기각. 계좌 구분(게이트웨이 · 계좌 끝 4자리 · 주문번호)은 「이 주문」 카드 섹션 · 차트 툴팁에서만. URL 파라미터 추가 없음(37 D-18 유지).
- **D-03: 대상 게이트웨이 = `dma_servers.enabled = true` 서버 전부(레지스트리 기준 · 하드코딩 금지).** RPC 가 `dma_servers` 와 조인해 켜진 서버 행만 돌려준다. KB121 · KYOBO127 은 꺼져 있어(시드 `enabled=false`) 빠지고, 어드민이 켜면 relay 관찰자가 붙어 저널이 들어오므로 **자동 포함**된다. 사용자 원문 「kb121, kyobo127 은 뺄거야. 근데 admin 에서 켜놓은 서버는 다 적용해야지」. gh-trade 인박스 요청 없음 · 화면에 「기록 없는 게이트웨이」 안내 없음 · 「우리 주문」 표 캡션에 그날 켜진 서버 목록만 적는다(D-07). — **Reversibility:** reversible.

### 표시 모양 — 목업 B 「둘째 레일」 채택 (D-04 ~ D-07)
- **D-04: 전문 목록 맨 왼쪽 14px 띠 칸(둘째 레일).** 스케치 020 A 의 주문 레일(팀 보라 · 일반 회색 · 첫 칸 안쪽 3px)과 **별개로 그 왼쪽 바깥**에 둔다. 우리 주문마다 **[근거 ○ 또는 주문 ●] → 체결 ◆** 를 민트 세로선으로 잇는다. 마디: ○ 근거 전문 행 · ◌ 앵커(주문 직전 마지막 체결 · 작은 점 · 글자 없음) · ● 주문 시각 줄 · ◆ 우리 체결 A3 행. 추정(20ms 안 동가 후보 복수)은 **점선 띠 + 「추정」 칩**. 행 안 글자는 최소 — 우리 체결 A3 행 끝 민트 칩 「300/1,064」(부분 체결만 분모 · 전량이면 「500」) + 행 바탕 옅은 민트(`--mine` 6%). A 안의 「우리 k/n ···계좌」 긴 칩 · 근거 행 「근거 #n」 칩은 쓰지 않는다. 주문이 겹치면 띠가 겹친다 — 겹침 해소(옆 칸 추가)는 하지 않고 마디 · 카드로 구분한다. 폰 390: 레일 칸 유지 · 행 22px(37 전문 목록 높이 그대로). — **Reversibility:** reversible.
- **D-05: 주문 시각 자리에 점선 「주문」 줄.** 020 「⋯ 거래소순 자리」 SLOT 줄 동형(같은 높이 22px · 점선 상단선 · 옅은 바탕), 색만 `--mine`. 내용 = 「● 주문 {구분 라벨} {매수|매도} {가격 ×수량} · {조건 (실제 n) | 조건 없음 · 수동} · 근거 {호가|체결} ↑ · {게이트웨이} {···계좌끝4} #{주문번호}」. 구분 라벨 · 조건 문구는 `strategy-event-labels.ts`/`strategy-event-text.ts` 의 낱말을 그대로 쓴다(문장 새로 짓지 않음 · 25 D-09/D-10). 자리 = gw_time_ms 를 거래소순 · 수신순 각 순열의 그 시각 이후 첫 전문 **앞**(SLOT 과 같이 항목 배열에 끼운다 — `msg-rows.ts` MSG_ITEM 에 새 종류). 클릭 = 그 주문 선택(카드 섹션 표시).
- **D-06: 새 색 토큰 `--mine`.** 라이트 `#0f9d8a` · 다크 `#2fd3bb`(+ `--mine-bg` 16% 알파) 를 `webapp/src/styles/globals.css` 에 추가 — 팀 보라 · VI 주황 · 매수 빨강 · 매도 파랑 · primary 파랑과 겹치지 않는 민트. 정확한 값 · 대비는 UI-SPEC 에서 확인(SVG 는 hex 로 — [[feedback_lightweight_charts_oklch]] 는 순수 SVG 라 무관하나 토큰은 hex 유지).
- **D-07: 「우리 주문」 정보는 「이 주문」 카드 안.** 별도 패널 기각. ① 커서가 우리 체결 행 · 주문 줄 · 짝 없는 체결 줄일 때 카드 아래 **「◆ 우리 주문 #주문번호 · 게이트웨이 · 계좌 ···끝4」 섹션**: 주문(시각 · 구분 · 방향 · 가격 ×수량) · 조건(원문 라벨 · 실제값 | 「없음 · 수동 주문 — 주문 시각 위치만」) · 근거 {호가|체결|체결 구간}(시각 · 내용 · **「보기 ›」**) · 직전 체결(앵커 · 「보기 ›」 · 근거와 같은 행이면 생략) · 체결 목록(시각 · 우리 n[ / 전체 m] · +ms · 「추정 · 동가 후보 k」 칩) · 설명 꼬리말(부분 체결 = 「이 A3 m주는 … 그중 n주가 우리 체결」 · 추정 = 「k ms 안 같은 가격 · 수량 A3 가 둘 …」). ② 그 아래 **「우리 주문」 표는 늘 표시**: 캡션 「이 날 n건 · 체결 n건 · 켜진 서버 KB120 · KYOBO119」, 열 = 주문시각 · 구분+방향 · 수량 · 체결(추정 있으면 「?」) · 근거 종류, 행 클릭 = 그 주문 첫 체결 행으로 · 근거 클릭 = 근거 행으로. ③ 커서가 **근거 전문 행**이면 카드가 「이 전문을 보고 나간 주문 n건」 목록을 보인다. ④ 폰 = 019 세그먼트 「버스트 · 팀」 안에 같이 들어간다.
- **D-08: 차트(가격 판) = ◆ 우리 체결 + ○ 근거만.** 구간 띠 기각(주문 많은 날 흐려짐). 추정 = 빈 ◆ 점선 · 짝 없는 체결 = 빈 ◇ · 구간 근거의 ○ 는 구간 끝 하나. 기존 팀 원(보라) · 툴팁(`tick-chart-tip.ts`) 위에 얹는다 — ◆ 클릭 = 그 체결 행, ○ 클릭 = 근거 행. 툴팁에 「우리 체결 n주[ / 전체 m주] · 계좌 ···끝4 · 주문 #」 줄을 더한다(세부는 재량).

### 탐색 · 근거 연결 (D-09 ~ D-13)
- **D-09: 맨 위 제목 줄(종목명 · 날짜 알약 · KRX|NXT 가 있는 줄)에 「◆ 우리 체결 k/n ‹ ›」 알약 + 키 `[` `]`.** 알약은 현재 위치 k/n(+ 「주문 n」) · ‹ › 로 앞뒤 우리 체결 이동. 키는 `←` `→` 틱 · `Shift` 10틱 · `Space` 선례 옆에 추가(입력칸 포커스 때 제외). 차트 ◆ 클릭도 같은 이동. 전문 목록 패널 제목 줄의 「◆ 다음 우리 체결」 버튼은 두지 않는다. 이동 대상 = 우리 체결 A3 행 ∪ 짝 없는 체결 줄(D-12), 현재 정렬 순열 자리 순.
- **D-10: 레일 마디 클릭 = 그 행/줄로 커서 이동 + 카드 「보기 ›」 + 되돌아가기.** 띠는 보기만 하는 게 아니라 링크다(○ 근거 · ● 주문 줄 · ◆ 체결). 카드 「근거 보기 ›」 「직전 체결 보기 ›」 로 간 뒤에는 카드 위에 **「‹ 주문 #… 로」 되돌아가기 알약**이 남는다(한 단계 · 수명 · 사라지는 조건은 재량). 근거 행에 「→ 주문 #n」 칩은 붙이지 않는다(B 가 줄인 글자를 다시 늘리지 않음).
- **D-11: 구간 근거(주기매도 · 누적 before → after)는 구간 첫 A3 ○ … 마지막 A3 ○ 사이 점선 띠.** 카드 「근거 체결 구간 n건 · X주 · HH:MM:SS~HH:MM:SS 보기 ›」(보기 = 구간 끝 행). 차트 ○ 는 구간 끝 하나. 구간 안 모든 A3 마디 · 끝 하나만 기각.
- **D-12: 짝 A3 를 못 찾은 우리 체결 = 체결 시각(gw_time) 자리에 점선 「◆ 우리 체결 n주 · 짝 전문 없음」 줄.** 주문 줄(D-05)과 같은 모양 · 레일 빈 ◇ · 차트 빈 ◇ · ‹ › 탐색 포함. 주문 줄 안에 합쳐 적기 · 가장 가까운 A3 에 「짝 불확실」 붙이기 기각(틀린 전문에 붙을 위험). 누락 0 이 성공 기준.
- **D-13: 근거 없는 주문(수동 · 장전 cum 0 · ev_kind 0)** = 주문 줄 + 체결만 · 레일 ● → ◆ · 카드 조건 「없음 · 수동 주문 — 주문 시각 위치만」. 앵커(cum_volume > 0)가 있으면 ◌ 만.

### 데이터 · 계산
- **D-14: 체결 · 조건 근거 조회는 RPC 1회** — 인자 (user · 날짜 · isin · exchange) · 가시성(D-01) + 켜진 서버(D-03) 조인 · 반환 = 체결 E 행 + kind 3 · 6 행(주문번호로 묶을 수 있게). 과거 · 당일 같은 RPC(저널이 장중 DB 에 바로 쌓인다). Cloud Run 왕복 비용 메모리([[project_cloudrun_egress_roundtrip_cost]]) — 다중 쿼리 금지. — **Reversibility:** reversible.
- **D-15: 짝짓기 · 근거 특정 · 앵커 규칙은 ROADMAP 원문 그대로 shared 순수 함수로** — `packages/shared` 에 두고 10/30 격자 픽스처(401/406 · 29/29 · 100/100)와 수치 일치 테스트(37 D-20 오라클 픽스처 방식). `A3Columns` 에 `cumVolume` 열 추가(`record-index.ts` · 레이아웃 offset 113 · 12자). 서버 · 웹이 같은 함수를 쓴다.
- **D-16: 팀 손익 · 팀 패널은 손대지 않는다**(37 D-12 「우리 체결 포함 · 캡션」 유지). 우리 체결 표시가 생겨도 손익 정의는 export `payload.pnl` 골든과 같아야 한다.

### Claude's Discretion
- **짝짓기 계산 위치** — 서버 RPC 안(SQL) vs 클라 `TickSession`(저널 행을 받아 A3 열 배열과 매칭 — 세션이 `a3.px/qty/tNs` 를 이미 갖고 있고 당일은 증분마다 세션을 다시 만들므로 클라 매칭이 자연스럽다 · Web Worker 이식 가능 순수 함수). 리서치가 정한다. 어느 쪽이든 shared 함수 하나.
- **당일(live) 저널 증분** — 틱 증분(5초 · `use-tick-live.ts`)과 같은 주기로 저널 RPC 도 다시 부를지(마지막 gw_time 이후만) · 아직 체결 안 된 주문(주문 줄만 · 체결 ◆ 없음) 표시 · 「우리 체결이 몇 초 안에 보이나」 체감 목표.
- **RPC 반환 모양 · 인덱스**(`dma_journal_events` (gateway, isin, gw_time) 조회 · `dma_strategy_events` (isin, gw_time_ms, kind)) · 서버 라우트 위치(`/api/ticks/*` 옆) · 60초 사용자별 캐시 재사용 여부.
- **레일 치수 · 마디 모양 px · 되돌아가기 알약 수명 · 툴팁 줄 문구 · 「우리 주문」 표 정렬(시각순 권고) · 추정일 때 다른 후보 A3 에도 흐린 표식을 둘지(기본 없음) · 키 `[` `]` 충돌 점검(기존 `+ − 0` 차트 키와 겹치지 않음) · 라이트 테마 `--mine` 대비.
- **주문 줄 · 짝 없는 체결 줄의 항목 종류**(`msg-rows.ts` MSG_ITEM 확장 · `useFixedWindow` 같은 높이 유지 · `posOfRec` 와 분리된 색인) · 거래소순 · 수신순 두 순열에서의 자리 계산.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 범위 · 원천 · 성공 수치 (정본)
- `.planning/ROADMAP.md` 「Phase 38」(:485~) — 원천 표 · 짝짓기 규칙 · 10/30 실측 수치 · 성공 기준 5 · 미결 3건(이 discuss 로 전부 결정). 성공 기준 5 는 D-03 뜻으로 고친다.
- `.planning/phases/38-own-orders-on-ticks/reference/mockup-own-fills.html` — **B 둘째 레일 채택**(2026-11-03 · 커서 3종: 부분 체결 · 추정 · 수동) · A/C 기각. 레일 마디 · 주문 줄 · 카드 「◆ 우리 주문」 섹션 · 「우리 주문」 표 · 차트 ◆/○ · `--mine` 토큰값의 본.
- `.planning/phases/37-tick-viewer/37-CONTEXT.md` — D-00(화면 정본 · 행 구조 · 키) · D-05~D-07(당일 경로 · 증분 · 캐시) · D-08(게이트 = `dma_visible_accounts` · 403 `DMA_UNMAPPED`) · D-12(우리 체결 포함 · 「우리」 배지 후속 = 이 phase) · D-18(URL) · D-20(shared 순수 함수 + 오라클 픽스처).
- `.planning/sketches/020-msg-row-inversion-burst/README.md` + `index.html` — 행 그룹 A 레일 · 꼬리 · SLOT 점선 줄(D-05 · D-12 의 본). `.planning/sketches/019-tick-viewer-layout/README.md` — 3판 차트 · 폰 세그먼트 「버스트 · 팀」(D-07 ④).

### 저널 · 전략 이벤트 · 가시성 · 레지스트리 (DB)
- `supabase/migrations/20260924200000_dma_journal_tables.sql` — `dma_journal_events`(gateway · gw_time · dma_user_id · account_no · isin · side · order_no · notice_type · exchange · exec_price · exec_qty · service_role 전용).
- `supabase/migrations/20260929180000_dma_strategy_events.sql` — `dma_strategy_events`(kind · gw_time_ms · exchange · isin · cum_volume · account_no · order_no · reason_code · cond_* · ev_kind · ev_price · ev_qty_before/after · ev_trade_qty).
- `supabase/migrations/20260929190000_dma_gateway_identities.sql` — `dma_visible_accounts(p_user_id)`(gateway, account_no) · 가시성 조인 규칙 D-03 · 「오늘 주문」 RPC 가 쓰는 조인 1곳(D-01 선례). `supabase/migrations/20261004090000_dma_journal_orders_for_user_json.sql` — 오늘 주문 RPC 모양.
- `supabase/migrations/20261006200100_dma_registry_intent.sql` — `dma_servers`(key · broker · enabled · 시드 KB120/KYOBO119 켜짐 · KB121/KYOBO127 꺼짐) — D-03 조인 대상. `relay/src/registry/registry.ts` — relay 가 켜진 서버에만 붙는다.
- `supabase/migrations/20261102200000_tick_viewer.sql` · `20261102200100_tick_viewer_queue.sql` — `tick_open_for_user` · `tick_access_for_user`(게이트 RPC 틀 · REVOKE 4줄) · 60초 캐시 주석.
- `server/src/routes/admin-pnl.ts` · `server/src/middleware/require-admin.ts` — `requireAdmin()` DB role 매 요청(D-01 어드민 분기 선례). `.planning/phases/36-account-budget/36-CONTEXT.md` D-17 · D-19(계정별/계좌별 · RPC 1회). `.planning/phases/32-account-axis/32-CONTEXT.md` D-20 · D-23(계좌 칩 — D-02 에서 기각한 선례).

### 틱뷰어 코드 (얹을 자리)
- `packages/shared/src/ticks/record-index.ts`(`A3Columns` · `a3ColumnsOf` — cum_volume 열 추가) · `layouts.ts`(A3 `cum_volume` offset 113 · 12 uint) · `packages/shared/src/strategy-event-labels.ts`(`STRATEGY_EVENT_KIND_LABELS` · `ORDER_GROUP_LABELS` · `COND_METRIC_LABELS` · `EVIDENCE_KIND_LABELS` · `reasonOperator`) · `strategy-event-text.ts`(조건 문구 조립 규칙 — 주문 줄 D-05 는 낱말만 빌린다).
- `webapp/src/lib/ticks/tick-session.ts`(`TickSession` · `a3Of` · 순열 · `appendTickBytes` 재생성) · `msg-rows.ts`(`MSG_ITEM` ROW/TAIL/SLOT · `buildMsgRows` · `fmtA3Row`) · `components/ticks/tick-msg-list.tsx`(레일 · `useFixedWindow` · 행 높이 24/22) · `tick-order-card.tsx`(「이 주문」 카드 · 최근 주문 표 — D-07 섹션 자리) · `tick-chart.tsx` + `lib/ticks/tick-chart.ts` + `tick-chart-tip.ts`(주문 원 · 툴팁 · 묶음 — D-08) · `team-model.ts`(팀 모델 — 손대지 않음 D-16) · `use-tick-cursor.ts`(키 · 모드 — D-09 키) · `use-tick-live.ts`(5초 증분 — 당일 저널 갱신 재량) · `tick-header.tsx`(제목 줄 — D-09 알약) · `tick-viewer.tsx`(폰 세그먼트) · `tick-url.ts`(URL 무변경).
- `server/src/routes/ticks.ts` — `/api/ticks/*` 라우트 · 게이트 · 60초 캐시(새 RPC 라우트 자리). `webapp/src/lib/ticks/tick-api.ts` — 클라 호출 틀.
- `webapp/src/styles/globals.css` — `--team/--vi/--up/--down` 토큰 자리(D-06 `--mine` 추가).

### 규칙 문서 (gh-trade — 수치가 어긋나면 이 쪽이 맞다)
- `/Users/alex/repos/gh-trade/docs/analysis/krx-a3-zero-quote.md` §2 주문 묶기 · §3 모양 — 「A3 = 공격 주문 × 가격 단 합산」(부분 체결 「우리 n / 전체 m」 의 근거).
- `/Users/alex/repos/gh-trade/docs/analysis/team-flow.md` §4 규칙 7(수동 주문은 전략 이벤트에 조건이 없다) · §5-1(팀 손익 — 변경 없음).
- `/Users/alex/repos/gh-trade/server/src/trade/strategy/LimitChaser.h` `OrderReasonName`(reason_code 원문 — 조건 연산자 키).

### 운영 제약
- `CLAUDE.md` 「공식 API 운영 기준」 3(호출량은 사용자 수와 독립 — 당일 저널 폴링도 종목당) · 「배포」. [[project_cloudrun_egress_roundtrip_cost]] · [[feedback_supabase_rpc_revoke]] · [[feedback_deploy_relay_before_push]] · [[project_market_hours_0800_2000]].

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`msg-rows.ts` MSG_ITEM(ROW/TAIL/SLOT) + `useFixedWindow`** — 모든 항목이 같은 높이인 평평한 Int32 배열. 주문 줄 · 짝 없는 체결 줄은 SLOT 과 같은 방식으로 새 종류를 끼운다(D-05 · D-12).
- **`tick-msg-list.tsx` 레일 CSS**(`box-shadow: inset 3px` · `--rail`) — 둘째 레일은 첫 칸 **바깥** 14px 칸(목업)으로 추가. 행 높이 24/22 유지.
- **`tick-chart.tsx` 주문 원 + `tick-chart-tip.ts` 묶음 툴팁** — ◆/○ 표식과 툴팁 줄 추가 자리. 클릭 = 커서 이동(원 클릭 선례).
- **`tick-order-card.tsx`** — 「이 주문」 카드 · 최근 주문 표(`rl` 표 CSS) — D-07 섹션 · 「우리 주문」 표의 본.
- **`tick-header.tsx`** — 제목 줄(종목 · 날짜 알약 · KRX|NXT · 시계) — D-09 알약 자리. `use-tick-cursor.ts` 키 처리 — `[` `]` 추가.
- **`strategy-event-labels.ts`** — 구분 · 지표 · 근거 종류 라벨(주문 줄 · 카드 문구).
- **`tick_access_for_user` · `tick_open_for_user`** — RPC 게이트 틀(REVOKE 4줄 · service_role). `dma_journal_orders_for_user_json` — 가시성 조인 SQL 선례.
- **`packages/shared` 오라클 픽스처 방식**(37 D-20 · `classifyKrxOrders` 테스트) — 짝짓기 함수 + 10/30 픽스처 테스트의 본.

### Established Patterns
- 보고서 · 뷰어 접근은 **RPC 안 가시성 조인**(service_role 전용 · 웹 `DmaGate` 는 표시 장치). 어드민 전 계좌는 **서버 role 조회**로만 켠다.
- 당일 경로는 **증분마다 세션 전체 재생성**(37-19) — 우리 체결 매칭도 세션 생성 때 한 번에(부분 갱신 없음).
- 값은 shared 순수 함수 + 골든/오라클 픽스처로 갈림을 막는다(37 D-20).
- 색 토큰은 globals.css 한 곳 · 목업 사본과 같은 값.

### Integration Points
- DB: 새 RPC(체결 E + kind 3·6 · 가시성 · enabled 서버 조인) · 인덱스.
- 서버: `/api/ticks/*` 옆 새 라우트(게이트 · 캐시).
- 웹: `tick-session.ts`(우리 체결 · 근거 모델) · `msg-rows.ts`(새 항목) · `tick-msg-list.tsx`(둘째 레일) · `tick-chart.tsx`/`tick-chart-tip.ts`(◆ ○) · `tick-order-card.tsx`(섹션 · 표) · `tick-header.tsx`(알약) · `use-tick-cursor.ts`(키) · `tick-viewer.tsx`(폰 세그먼트) · `globals.css`(`--mine`).
- shared: `record-index.ts` cum_volume 열 · 짝짓기/근거 함수 + 픽스처.

</code_context>

<specifics>
## Specific Ideas

- 사용자 원문 「kb121, kyobo127 은 뺄거야. 근데 admin에서 켜놓은 서버는 다 적용해야지」 → 기준은 레지스트리 `enabled`(D-03).
- 「머리」 라는 말을 사용자가 몰랐다 → 문서 · 질문에서는 **「화면 맨 위 제목 줄」 · 「전문 목록 패널 제목 줄」** 로 풀어 쓴다(UI-SPEC · UAT 문구 포함).
- 목업 B 를 고르면서 차트는 「◆ + ○ 만」(구간 띠 제거), 카드는 「이 주문」 안 섹션 — 목업 B 에서 이 둘만 바뀐다.
- 「우리」 색은 민트 `--mine`(팀 보라와 나란히 놓여도 구분) · 추정은 점선 · 짝 없음은 빈 도형 — 한 가지 색, 모양으로 상태 구분.

</specifics>

<deferred>
## Deferred Ideas

- **/me 주문 로그 · 「오늘 주문」 카드에서 「틱 보기 ›」 진입**(주문 → 그 체결 틱으로) — 새 진입점. 37 D-17 「틱 보기」 알약 동형으로 후속 quick/phase.
- **KB121 · KYOBO127 켜기** — 어드민 레지스트리 결정 + relay 관찰자 연결(gh-trade/relay). 켜지면 이 phase 코드가 그대로 적용된다(D-03).
- **팀 패널 캡션 「우리 체결 포함」 → 「우리 n주 포함」** 으로 수치화 — 이번엔 손대지 않음(D-16).
- **추정일 때 다른 후보 A3 에도 흐린 표식** — 기본 없음(재량 항목) · UAT 에서 필요하면.
- **아직 체결 안 된 당일 주문(주문 줄만)의 취소 · 정정 표시** — 저널 C/M 행은 범위 밖.
- 스케치 022(틱뷰어 거래량 · 팀 비중)는 미추적 · findings 미포장 — 이 phase 와 무관, 별도 정리.

</deferred>

---

*Phase: 38-own-orders-on-ticks*
*Context gathered: 2026-11-03*
