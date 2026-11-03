# Phase 38: 틱뷰어 우리 주문·체결 표시 - Research

**Researched:** 2026-11-03
**Domain:** 틱 전문(A3 · B6) ↔ 게이트웨이 저널(체결 E · 전략 이벤트 kind 3·6) 짝짓기 · Supabase RPC 가시성 조인 · 틱뷰어(Next.js 15 · 순수 SVG) 표시 확장
**Confidence:** HIGH (코드 · 마이그레이션 · 이전 세션 실측 원문을 이번 세션에 직접 열어 확인) — 단, 「추정」 판정의 문턱 해석과 fixture 재현 숫자는 이전 세션 probe 원문 기준(MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
(38-CONTEXT.md `## Implementation Decisions` 원문 그대로)

#### 계좌 가시성 · 대상 게이트웨이
- **D-01: 「우리」 = `dma_visible_accounts(p_user_id)` 가시 계좌의 체결 + `requireAdmin` 사용자는 전 계좌.** 「오늘 주문」 카드 · /me 손익(36 D-17 ②) · 틱뷰어 게이트(37 D-08)와 같은 가시성 조인을 RPC 안에서 서버측으로 강제한다(service_role 전용 · REVOKE anon/authenticated 명시 — [[feedback_supabase_rpc_revoke]]). 어드민 분기는 `/admin/pnl`(36 D-17 ① · `requireAdmin()` DB role 매 요청 조회) 선례 — RPC 에 `p_all_accounts boolean` 류 인자를 두고 서버가 role 로만 켠다(클라 입력 금지). 남의 계좌 체결은 일반 체결로 보인다. — **Reversibility:** reversible.
- **D-02: 계좌 선택 없음 — 보이는 계좌 전부 합쳐 「우리」 한 색.** 머리 계좌 칩(32 D-20 동형) · 계좌별 색 구분 기각. 계좌 구분(게이트웨이 · 계좌 끝 4자리 · 주문번호)은 「이 주문」 카드 섹션 · 차트 툴팁에서만. URL 파라미터 추가 없음(37 D-18 유지).
- **D-03: 대상 게이트웨이 = `dma_servers.enabled = true` 서버 전부(레지스트리 기준 · 하드코딩 금지).** RPC 가 `dma_servers` 와 조인해 켜진 서버 행만 돌려준다. KB121 · KYOBO127 은 꺼져 있어(시드 `enabled=false`) 빠지고, 어드민이 켜면 relay 관찰자가 붙어 저널이 들어오므로 **자동 포함**된다. 사용자 원문 「kb121, kyobo127 은 뺄거야. 근데 admin 에서 켜놓은 서버는 다 적용해야지」. gh-trade 인박스 요청 없음 · 화면에 「기록 없는 게이트웨이」 안내 없음 · 「우리 주문」 표 캡션에 그날 켜진 서버 목록만 적는다(D-07). — **Reversibility:** reversible.

#### 표시 모양 — 목업 B 「둘째 레일」 채택 (D-04 ~ D-07)
- **D-04: 전문 목록 맨 왼쪽 14px 띠 칸(둘째 레일).** 스케치 020 A 의 주문 레일(팀 보라 · 일반 회색 · 첫 칸 안쪽 3px)과 **별개로 그 왼쪽 바깥**에 둔다. 우리 주문마다 **[근거 ○ 또는 주문 ●] → 체결 ◆** 를 민트 세로선으로 잇는다. 마디: ○ 근거 전문 행 · ◌ 앵커(주문 직전 마지막 체결 · 작은 점 · 글자 없음) · ● 주문 시각 줄 · ◆ 우리 체결 A3 행. 추정(20ms 안 동가 후보 복수)은 **점선 띠 + 「추정」 칩**. 행 안 글자는 최소 — 우리 체결 A3 행 끝 민트 칩 「300/1,064」(부분 체결만 분모 · 전량이면 「500」) + 행 바탕 옅은 민트(`--mine` 6%). A 안의 「우리 k/n ···계좌」 긴 칩 · 근거 행 「근거 #n」 칩은 쓰지 않는다. 주문이 겹치면 띠가 겹친다 — 겹침 해소(옆 칸 추가)는 하지 않고 마디 · 카드로 구분한다. 폰 390: 레일 칸 유지 · 행 22px(37 전문 목록 높이 그대로). — **Reversibility:** reversible.
- **D-05: 주문 시각 자리에 점선 「주문」 줄.** 020 「⋯ 거래소순 자리」 SLOT 줄 동형(같은 높이 22px · 점선 상단선 · 옅은 바탕), 색만 `--mine`. 내용 = 「● 주문 {구분 라벨} {매수|매도} {가격 ×수량} · {조건 (실제 n) | 조건 없음 · 수동} · 근거 {호가|체결} ↑ · {게이트웨이} {···계좌끝4} #{주문번호}」. 구분 라벨 · 조건 문구는 `strategy-event-labels.ts`/`strategy-event-text.ts` 의 낱말을 그대로 쓴다(문장 새로 짓지 않음 · 25 D-09/D-10). 자리 = gw_time_ms 를 거래소순 · 수신순 각 순열의 그 시각 이후 첫 전문 **앞**(SLOT 과 같이 항목 배열에 끼운다 — `msg-rows.ts` MSG_ITEM 에 새 종류). 클릭 = 그 주문 선택(카드 섹션 표시).
- **D-06: 새 색 토큰 `--mine`.** 라이트 `#0f9d8a` · 다크 `#2fd3bb`(+ `--mine-bg` 16% 알파) 를 `webapp/src/styles/globals.css` 에 추가 — 팀 보라 · VI 주황 · 매수 빨강 · 매도 파랑 · primary 파랑과 겹치지 않는 민트. 정확한 값 · 대비는 UI-SPEC 에서 확인(SVG 는 hex 로 — [[feedback_lightweight_charts_oklch]] 는 순수 SVG 라 무관하나 토큰은 hex 유지).
- **D-07: 「우리 주문」 정보는 「이 주문」 카드 안.** 별도 패널 기각. ① 커서가 우리 체결 행 · 주문 줄 · 짝 없는 체결 줄일 때 카드 아래 **「◆ 우리 주문 #주문번호 · 게이트웨이 · 계좌 ···끝4」 섹션**: 주문(시각 · 구분 · 방향 · 가격 ×수량) · 조건(원문 라벨 · 실제값 | 「없음 · 수동 주문 — 주문 시각 위치만」) · 근거 {호가|체결|체결 구간}(시각 · 내용 · **「보기 ›」**) · 직전 체결(앵커 · 「보기 ›」 · 근거와 같은 행이면 생략) · 체결 목록(시각 · 우리 n[ / 전체 m] · +ms · 「추정 · 동가 후보 k」 칩) · 설명 꼬리말(부분 체결 = 「이 A3 m주는 … 그중 n주가 우리 체결」 · 추정 = 「k ms 안 같은 가격 · 수량 A3 가 둘 …」). ② 그 아래 **「우리 주문」 표는 늘 표시**: 캡션 「이 날 n건 · 체결 n건 · 켜진 서버 KB120 · KYOBO119」, 열 = 주문시각 · 구분+방향 · 수량 · 체결(추정 있으면 「?」) · 근거 종류, 행 클릭 = 그 주문 첫 체결 행으로 · 근거 클릭 = 근거 행으로. ③ 커서가 **근거 전문 행**이면 카드가 「이 전문을 보고 나간 주문 n건」 목록을 보인다. ④ 폰 = 019 세그먼트 「버스트 · 팀」 안에 같이 들어간다.
- **D-08: 차트(가격 판) = ◆ 우리 체결 + ○ 근거만.** 구간 띠 기각(주문 많은 날 흐려짐). 추정 = 빈 ◆ 점선 · 짝 없는 체결 = 빈 ◇ · 구간 근거의 ○ 는 구간 끝 하나. 기존 팀 원(보라) · 툴팁(`tick-chart-tip.ts`) 위에 얹는다 — ◆ 클릭 = 그 체결 행, ○ 클릭 = 근거 행. 툴팁에 「우리 체결 n주[ / 전체 m주] · 계좌 ···끝4 · 주문 #」 줄을 더한다(세부는 재량).

#### 탐색 · 근거 연결 (D-09 ~ D-13)
- **D-09: 맨 위 제목 줄(종목명 · 날짜 알약 · KRX|NXT 가 있는 줄)에 「◆ 우리 체결 k/n ‹ ›」 알약 + 키 `[` `]`.** 알약은 현재 위치 k/n(+ 「주문 n」) · ‹ › 로 앞뒤 우리 체결 이동. 키는 `←` `→` 틱 · `Shift` 10틱 · `Space` 선례 옆에 추가(입력칸 포커스 때 제외). 차트 ◆ 클릭도 같은 이동. 전문 목록 패널 제목 줄의 「◆ 다음 우리 체결」 버튼은 두지 않는다. 이동 대상 = 우리 체결 A3 행 ∪ 짝 없는 체결 줄(D-12), 현재 정렬 순열 자리 순.
- **D-10: 레일 마디 클릭 = 그 행/줄로 커서 이동 + 카드 「보기 ›」 + 되돌아가기.** 띠는 보기만 하는 게 아니라 링크다(○ 근거 · ● 주문 줄 · ◆ 체결). 카드 「근거 보기 ›」 「직전 체결 보기 ›」 로 간 뒤에는 카드 위에 **「‹ 주문 #… 로」 되돌아가기 알약**이 남는다(한 단계 · 수명 · 사라지는 조건은 재량). 근거 행에 「→ 주문 #n」 칩은 붙이지 않는다(B 가 줄인 글자를 다시 늘리지 않음).
- **D-11: 구간 근거(주기매도 · 누적 before → after)는 구간 첫 A3 ○ … 마지막 A3 ○ 사이 점선 띠.** 카드 「근거 체결 구간 n건 · X주 · HH:MM:SS~HH:MM:SS 보기 ›」(보기 = 구간 끝 행). 차트 ○ 는 구간 끝 하나. 구간 안 모든 A3 마디 · 끝 하나만 기각.
- **D-12: 짝 A3 를 못 찾은 우리 체결 = 체결 시각(gw_time) 자리에 점선 「◆ 우리 체결 n주 · 짝 전문 없음」 줄.** 주문 줄(D-05)과 같은 모양 · 레일 빈 ◇ · 차트 빈 ◇ · ‹ › 탐색 포함. 주문 줄 안에 합쳐 적기 · 가장 가까운 A3 에 「짝 불확실」 붙이기 기각(틀린 전문에 붙을 위험). 누락 0 이 성공 기준.
- **D-13: 근거 없는 주문(수동 · 장전 cum 0 · ev_kind 0)** = 주문 줄 + 체결만 · 레일 ● → ◆ · 카드 조건 「없음 · 수동 주문 — 주문 시각 위치만」. 앵커(cum_volume > 0)가 있으면 ◌ 만.

#### 데이터 · 계산
- **D-14: 체결 · 조건 근거 조회는 RPC 1회** — 인자 (user · 날짜 · isin · exchange) · 가시성(D-01) + 켜진 서버(D-03) 조인 · 반환 = 체결 E 행 + kind 3 · 6 행(주문번호로 묶을 수 있게). 과거 · 당일 같은 RPC(저널이 장중 DB 에 바로 쌓인다). Cloud Run 왕복 비용 메모리([[project_cloudrun_egress_roundtrip_cost]]) — 다중 쿼리 금지. — **Reversibility:** reversible.
- **D-15: 짝짓기 · 근거 특정 · 앵커 규칙은 ROADMAP 원문 그대로 shared 순수 함수로** — `packages/shared` 에 두고 10/30 격자 픽스처(401/406 · 29/29 · 100/100)와 수치 일치 테스트(37 D-20 오라클 픽스처 방식). `A3Columns` 에 `cumVolume` 열 추가(`record-index.ts` · 레이아웃 offset 113 · 12자). 서버 · 웹이 같은 함수를 쓴다.
- **D-16: 팀 손익 · 팀 패널은 손대지 않는다**(37 D-12 「우리 체결 포함 · 캡션」 유지). 우리 체결 표시가 생겨도 손익 정의는 export `payload.pnl` 골든과 같아야 한다.

### Claude's Discretion
(38-CONTEXT.md `### Claude's Discretion` 원문 그대로)
- **짝짓기 계산 위치** — 서버 RPC 안(SQL) vs 클라 `TickSession`(저널 행을 받아 A3 열 배열과 매칭 — 세션이 `a3.px/qty/tNs` 를 이미 갖고 있고 당일은 증분마다 세션을 다시 만들므로 클라 매칭이 자연스럽다 · Web Worker 이식 가능 순수 함수). 리서치가 정한다. 어느 쪽이든 shared 함수 하나.
- **당일(live) 저널 증분** — 틱 증분(5초 · `use-tick-live.ts`)과 같은 주기로 저널 RPC 도 다시 부를지(마지막 gw_time 이후만) · 아직 체결 안 된 주문(주문 줄만 · 체결 ◆ 없음) 표시 · 「우리 체결이 몇 초 안에 보이나」 체감 목표.
- **RPC 반환 모양 · 인덱스**(`dma_journal_events` (gateway, isin, gw_time) 조회 · `dma_strategy_events` (isin, gw_time_ms, kind)) · 서버 라우트 위치(`/api/ticks/*` 옆) · 60초 사용자별 캐시 재사용 여부.
- **레일 치수 · 마디 모양 px · 되돌아가기 알약 수명 · 툴팁 줄 문구 · 「우리 주문」 표 정렬(시각순 권고) · 추정일 때 다른 후보 A3 에도 흐린 표식을 둘지(기본 없음) · 키 `[` `]` 충돌 점검(기존 `+ − 0` 차트 키와 겹치지 않음) · 라이트 테마 `--mine` 대비.
- **주문 줄 · 짝 없는 체결 줄의 항목 종류**(`msg-rows.ts` MSG_ITEM 확장 · `useFixedWindow` 같은 높이 유지 · `posOfRec` 와 분리된 색인) · 거래소순 · 수신순 두 순열에서의 자리 계산.

### Deferred Ideas (OUT OF SCOPE)
(38-CONTEXT.md `<deferred>` 원문 그대로)
- **/me 주문 로그 · 「오늘 주문」 카드에서 「틱 보기 ›」 진입**(주문 → 그 체결 틱으로) — 새 진입점. 37 D-17 「틱 보기」 알약 동형으로 후속 quick/phase.
- **KB121 · KYOBO127 켜기** — 어드민 레지스트리 결정 + relay 관찰자 연결(gh-trade/relay). 켜지면 이 phase 코드가 그대로 적용된다(D-03).
- **팀 패널 캡션 「우리 체결 포함」 → 「우리 n주 포함」** 으로 수치화 — 이번엔 손대지 않음(D-16).
- **추정일 때 다른 후보 A3 에도 흐린 표식** — 기본 없음(재량 항목) · UAT 에서 필요하면.
- **아직 체결 안 된 당일 주문(주문 줄만)의 취소 · 정정 표시** — 저널 C/M 행은 범위 밖.
- 스케치 022(틱뷰어 거래량 · 팀 비중)는 미추적 · findings 미포장 — 이 phase 와 무관, 별도 정리.
</user_constraints>

<phase_requirements>
## Phase Requirements

ROADMAP Phase 38 은 `Requirements: TBD` 다 [VERIFIED: .planning/ROADMAP.md:485-501]. 요구사항 ID 대신 성공 기준 5개(5번은 CONTEXT D-03 뜻)를 계획 단위로 쓴다.

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-1 | 목업 검토 · 채택 완료 — B 둘째 레일(`reference/mockup-own-fills.html`) | 이미 완료(CONTEXT). 계획은 UI-SPEC → 구현에서 목업 B 값을 그대로 옮긴다(§Architecture Patterns 4 · §Pitfall 8 대비) |
| SC-2 | 우리 체결 ↔ A3 짝짓기 ≥ 98%(401/406) · 「우리 n / 전체 m」 · 20ms 동가 복수 「추정」 · 짝 없음 줄(누락 0) | §짝짓기 규칙(probe 원문) · §10/30 픽스처 계획 · `matchOwnFills` 오라클 수치(종목별 기대값 표) |
| SC-3 | 조건 근거 — B6 29/29 · 체결 단건 정확 · 주기매도 구간 · cum_volume 앵커 100/100 · `A3Columns.cumVolume` | §근거 특정 규칙(probe 원문) · §A3Columns cumVolume 변경 |
| SC-4 | 과거 · 당일 같은 화면 · 가시성 서버측 강제 · RPC 1회 | §RPC 설계(jsonb 1회 · 가시성 · enabled 조인 · 어드민 분기) · §당일 경로(「최신 받기」 버튼에 얹기) |
| SC-5 (D-03 뜻) | 대상 = `dma_servers.enabled` 전부 · 하드코딩 없음 · 인박스 요청 없음 · 「기록 없는 게이트웨이」 안내 없음 | §RPC 설계 — `JOIN dma_servers s ON s.key = j.gateway AND s.enabled` · pgTAP 로 「켜면 포함」 잠금. 플래너는 ROADMAP SC-5 문구를 D-03 뜻으로 고친다 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 사용자 대면 문장 · 문서 서술은 한국어. 식별자 · 경로 · 로그 원문은 원어.
- 커밋 메시지 한글 · Co-Authored-By 넣지 않음(전역 CLAUDE.md) · 커밋 전 메시지 확인(메인 세션 규칙).
- GSD 워크플로 밖 직접 편집 금지 — 이 phase 는 `/gsd-execute-phase` 로 실행.
- 공식 API 운영 기준 3: **호출량은 사용자 수와 독립**(사용자 트리거 O(N) 금지 — 예외: 스로틀된 수동 새로고침). → 당일 저널 재조회는 자동 폴링이 아니라 사용자의 「최신 받기」 버튼 1회에 얹는다(§당일 경로).
- 스크래핑 5원칙은 이 phase 와 무관(데이터 원천이 자사 게이트웨이 저널 · 자사 틱 격자). 단 「DB 에는 최소 필드만」 정신은 RPC 반환 칸 · 커밋 픽스처에 적용(§픽스처 — 계좌번호 익명화).
- 상따 화면 컨테이너 쿼리 규칙은 `/trading/limit-chaser` 전용 — 틱뷰어는 뷰포트 640px 판정(37 그대로).
- gh-trade 인박스: 세션 시작 시 `docs/inbox/from-gh-trade/` open 노트 확인. 이 phase 는 gh-trade 요청 없음(D-03).
- 메모리 규칙(이 phase 에 걸리는 것): Supabase RPC REVOKE anon/authenticated 명시 · Cloud Run 왕복 = RPC 1회 · 서브에이전트는 커밋까지만(배포는 메인 세션) · 배포 순서 = DB push → server → git push(push 자체가 webapp 배포) · 동시 세션이면 vitest `--maxWorkers=2` · playwright `--workers=1` · 전체 회귀는 한 세션만 · `supabase db push --linked --yes` 형태 · 보안검사 생략(security_enforcement=false) · nyquist 유지 · UI 목업 검토 게이트 · 질문 문구는 화면 기준 낱말(「머리」 금지 — 「화면 맨 위 제목 줄」).

## Summary

이 phase 의 핵심 사실은 하나다: **틱 바이트를 가진 곳은 브라우저뿐이다.** 과거 격자는 서명 URL 로 브라우저가 Storage 에서 직접 받고(server 는 서명만 · `server/src/services/ticks.ts:19-21`), 당일 바이트는 server 가 풀지 않고 그대로 중계한다(`server/src/routes/ticks.ts:25-26`). SQL 은 틱을 볼 수 없다. 그래서 짝짓기 · 근거 특정 · 앵커는 **클라이언트에서, `packages/shared` 순수 함수로** 돌리고, server · RPC 는 **저널 행(체결 E + 전략 이벤트 kind 3·6)을 가시성 · 켜진 서버로 거른 jsonb 한 장**만 준다. CONTEXT D-15 의 「서버 · 웹이 같은 함수를 쓴다」 는 이 결정으로 「웹 + 오라클 테스트가 같은 함수를 쓴다」 가 된다(server 는 틱을 안 만지므로 쓸 일이 없다).

10/30 실측 원문은 이전 세션 transcript(`131ea538…jsonl` 줄 4175~4382)에 probe 코드 · 출력 그대로 남아 있고, 입력 파일(격자 5개 · fills1030.json · strat1030.json)도 `/private/tmp/…/131ea538…/scratchpad/own/` 에 아직 있다(휘발성 — macOS /private/tmp). 이 원문으로 **규칙을 한 글자 단위로 고정**했다: A3 시각 = 체결시각(tNs, 없으면 수신), 후보 = 같은 가격 ∧ 남은 수량 ≥ 체결 수량 ∧ dt ∈ [−200, +1500]ms, |dt| 최소, 「추정」 = 두 번째 후보와 |dt| 차 < 20ms, 체결은 gw_time 오름차순으로 배정 · 차감. B6 근거 = 수신시각 [g−3000, g+50]ms 안 B6 중 ev_price 단(매수 · 매도 어느 쪽이든) 잔량 == ev_qty_after 인 **마지막** 것. 종목별 기대값(같은수량 236 · 큰 전문 일부 165 · 못찾음 5 · 추정 108 / 406)까지 원문에서 읽어 오라클 표로 만들었다. 창(window)만 남긴 픽스처는 5종목 합계 **약 347KB**(zstd-19)로 README 상한(파일당 1.5MB) 안이다 — 이번 세션 계산.

진행 중 변경이 하나 결정적이다: 동시 세션이 **당일 5초 자동 폴링을 걷고 머리 「↻ 최신 받기」 버튼으로만 증분**하게 바꾸고 있다(미커밋 · `use-tick-live.ts` · `tick-header.tsx` · `tick-viewer-page.tsx` · `tick-viewer.tsx`). 그래서 당일 저널 재조회는 **같은 버튼에 얹어 RPC 1회**로 끝낸다 — 자동 타이머 없음, 호출량은 사용자 클릭에만 비례(CLAUDE.md 공식 API 기준 3 의 「스로틀된 수동 새로고침」 예외와 같은 꼴).

**Primary recommendation:** 서버 = 새 RPC `tick_own_for_user(p_user_id, p_date, p_isin, p_ex)` 하나(jsonb · 게이트 · 어드민은 RPC 안에서 `dma_app_access_map()` role 로 판정 · `dma_servers.enabled` 조인) + `GET /api/ticks/own`. 웹 = `packages/shared/src/ticks/own-fills.ts`(순수 함수 3종) → `webapp/src/lib/ticks/own-model.ts`(세션 × 저널 → 표시 모델 · `useMemo`) → `msg-rows.ts` 새 항목 2종(ORDER · NOFILL) · 둘째 레일 · 카드 섹션 · 차트 ◆○ · 제목 줄 알약.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 가시 계좌 · 어드민 전 계좌 판정 | Database (RPC 안) | API (requireAuth 로 user id 확정) | D-01 — 가시성은 RPC 안 조인이 정본. 브라우저 입력 없음 |
| 켜진 서버 필터 · 서버 목록 | Database (RPC 안 `dma_servers` 조인) | — | D-03 · 레지스트리가 정본 · 하드코딩 금지 |
| 체결 E · 전략 이벤트 조회 | Database (jsonb 1회) | API (모양 검사 · 403 변환) | D-14 · Cloud Run 왕복 1회 |
| 우리 체결 ↔ A3 짝짓기 · B6 근거 · cum 앵커 | Browser (shared 순수 함수) | — | 틱 바이트는 브라우저에만 있다(server 는 서명 · 중계만). SQL 은 틱을 못 본다 |
| 주문 줄 · 짝 없음 줄 자리 계산 | Browser (`msg-rows.ts`) | — | 표시 순열(거래소순 · 수신순)이 클라 상태 |
| 우리 체결 탐색 ‹ › · `[` `]` | Browser (뷰어 상태) | — | 커서 · 모드가 클라 상태(URL 무변경 D-02/37 D-18) |
| 당일 저널 갱신 | Browser 가 트리거(「최신 받기」) | API · DB (같은 RPC) | 자동 폴링 없음 — 호출량 = 사용자 클릭 |
| `--mine` 토큰 | CDN/Static (globals.css) | — | 색 토큰 한 곳(37 관례) |

## Standard Stack

### Core (새 의존성 없음 — 전부 저장소에 있다)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@gh-radar/shared` ticks 모듈 | workspace | `buildTickIndex` · `a3ColumnsOf` · `bookAt` · `lowerBoundRecv` · `encodeRecord` · `concatBytes` | 37 의 뷰어 모델 정본 [VERIFIED: packages/shared/src/ticks/record-index.ts · book.ts:64 · tick-time.ts:73 · framing.ts:60,76] |
| vitest (shared · server) | ^4.1.4 | 오라클 · 단위 · supertest 라우트 | [VERIFIED: packages/shared/package.json:32 · server/package.json:44] |
| vitest (webapp) | ^2.1.9 | RTL · 모델 | [VERIFIED: webapp/package.json:55] |
| @playwright/test | ^1.59.1 | e2e(`ticks-viewer.spec.ts`) | [VERIFIED: webapp/package.json:40] |
| pgTAP (러너 `scripts/verify-dma-orders-price-check.sh --test`) | 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` | RPC · 권한 회귀 | [VERIFIED: scripts/verify-dma-orders-price-check.sh:36 · 로컬 이미지 있음] |
| fzstd | 0.1.1 | 브라우저 zstd 해제(37 그대로) | [VERIFIED: webapp/package.json:22] |
| Node `zlib.zstdCompressSync/DecompressSync` | Node 24.21.0 | 픽스처 생성 · 테스트 해제(37 헬퍼 `readTicksZst` 와 같음) | [VERIFIED: node --version · packages/shared/src/__tests__/helpers/tick-digest.ts] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 클라 짝짓기 | 서버 Node 라우트에서 격자를 받아 짝짓기 | 격자(수 MB~14.8MB)를 Cloud Run 이 매 요청 Storage 에서 받아 풀어야 함 · 당일은 tickgw 바이트를 서버가 다시 모아야 함 — 37 「Cloud Run 무경유」 원칙과 정면 충돌. 기각 |
| 클라 짝짓기 | SQL 안 짝짓기 | DB 에 틱이 없다. 불가 |
| RPC 안 어드민 판정 | 서버가 `app_users` 조회 후 `p_all_accounts` 전달 | +1 왕복(또는 60초 캐시 신설) · server 테스트 mock 이 `from()` 을 금지(`server/tests/routes/ticks.test.ts:57-59`) — 아래 Open Question 1 |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다(Standard Stack 전부 기존 workspace · 기존 의존성).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 [브라우저 · /analytics/ticks?isin&d&ex&t]
        │ ① open (37 그대로)              │ ② own (새)                     │ ③ 당일 「↻ 최신 받기」(진행 중 변경)
        ▼                                  ▼                                ▼
 GET /api/ticks/open ──RPC tick_open_for_user   GET /api/ticks/own ──RPC tick_own_for_user        GET /api/ticks/live (증분 1회)
        │ 서명 URL                          │ jsonb 1장                        │   + GET /api/ticks/own (같은 클릭에 1회)
        ▼                                  ▼                                ▼
 Storage tick-grid ──zstd──▶ TickSession(buf·index·a3·순열)   OwnResponse{servers, fills[E], events[kind3·6], orders[보조]}
                                   │                                         │
                                   └──────────────┬──────────────────────────┘
                                                  ▼
                         own-model.ts  buildOwnModel(session, own)   ← useMemo([session, own]) · 부분 갱신 없음
                           ├─ shared matchOwnFills(a3 열, fills)     → 체결별 {a3j | 없음 | 대기, 추정, 우리 n/전체 m}
                           ├─ shared locateEvidence(buf, index, a3, events) → 주문별 {B6 rec | 단건 A3 | 구간 A3[first..last] | 없음} + 앵커 A3
                           └─ 자리: gwNs → lowerBoundRecv → 슬롯 p(두 순열 공통)
                                                  ▼
       ┌──────────────────────┬──────────────────────────┬─────────────────────┬──────────────────────┐
       ▼                      ▼                          ▼                     ▼                      ▼
 msg-rows.ts           tick-msg-list.tsx           tick-order-card.tsx    tick-chart.tsx          tick-header.tsx
 ORDER/NOFILL 항목      둘째 레일 14px(○◌●◆ 마디)    ◆ 우리 주문 섹션 ·     ◆(체결) · ○(근거)        「◆ 우리 체결 k/n ‹ ›」
 + ownPos 색인          · 행 끝 「300/1,064」 칩      「우리 주문」 표        + 툴팁 줄               + 키 [ ] (뷰어 훅)
```

### Recommended Project Structure
```
packages/shared/src/
├── ticks/record-index.ts        # A3Columns.cumVolume 추가(offset 113 · 12 uint)
├── ticks/own-fills.ts           # 새: matchOwnFills · locateEvidence · placeAt(순수 · typed array)
├── ticks/index.ts               # own-fills export 추가
├── tick-api.ts                  # 새 계약: TickOwnFill · TickOwnEvent · TickOwnOrder · TickOwnResponse
├── __fixtures__/ticks/own1030-*.ticks.zst · own1030.journal.json · README 표 행 추가
└── __tests__/ticks-own.golden.test.ts · ticks-own.test.ts(합성) · ticks-record-index.test.ts(cumVolume 단언 +1)
scripts/tick-oracle/gen-own-fixtures.mjs   # 새: 10/30 창 픽스처 생성기(재생성 가능 · 계좌 익명화)
supabase/migrations/2026110?HHMMSS_tick_own_for_user.sql   # 새 RPC + 부분 인덱스 2
supabase/tests/tick_own.test.sql                           # 새 pgTAP
server/src/{routes/ticks.ts(+GET /own) · services/ticks.ts(+getTickOwn)}
server/tests/routes/ticks.test.ts (또는 ticks-own.test.ts)
webapp/src/lib/ticks/{own-model.ts · use-tick-own.ts · tick-api.ts(+fetchTickOwn) · msg-rows.ts(+ORDER/NOFILL)}
webapp/src/components/ticks/{tick-msg-list · tick-order-card · tick-chart · tick-header · tick-viewer · tick-viewer-page}.tsx
webapp/src/styles/globals.css (+ --mine · --mine-bg)
webapp/e2e/fixtures/ticks.ts (+ /api/ticks/own 케이스) · e2e/specs/ticks-viewer.spec.ts
```

### Pattern 1: 짝짓기 · 근거 · 앵커 규칙 — 이전 세션 probe 원문 그대로

출처: transcript `~/.claude/projects/-Users-alex-repos-gh-radar/131ea538-3f09-4513-a71d-4c55e6b36ebb.jsonl` 줄 4253(`own-match.probe.test.ts` 최종본 · 출력 = 401/406 재현) · 줄 4340~4364(`own-trigger.probe.test.ts` · 출력 = 29 · 2 · 100). [CITED: 이전 세션 transcript — 코드 · 출력 원문을 이번 세션에 열어 확인]

**(a) 우리 체결 → A3 (SC-2)** — probe 원문 요약(규칙 고정용):
```ts
// tr = s.a3.toTrades() · tms[j] = tNs !== null ? Number(tNs/1000n)/1000 : Number(recvNs[rec]/1000n)/1000   (ms, 소수)
// mine = 그 isin·exchange 체결, Date.parse(gw_time) 오름차순(동률 = 입력 순서 — 플래너는 (gw_time_ms, gateway, seq) 로 고정)
// left = tr.map(t => t.qty)
for (const f of mine) {
  const g = gwMs(f);
  cand = j where tr[j].px === f.exec_price && left[j] >= f.exec_qty && (g - tms[j]) ∈ [-200, 1500];
  cand.sort((a,b) => |g - tms[a]| - |g - tms[b]|);          // 안정 정렬 → 동률이면 j(파일 순서) 작은 쪽
  if (!cand.length) → 못찾음;  continue
  est  = cand.length > 1 && | |g-tms[c0]| - |g-tms[c1]| | < 20;   // 「추정」(20ms 안 동가 후보 둘↑)
  j = cand[0];  part = tr[j].qty !== f.exec_qty;              // 「우리 n / 전체 m」(m = A3 수량)
  left[j] -= f.exec_qty;
}
```
**종목별 오라클 기대값**(probe 출력 원문 · 픽스처 테스트가 단언할 숫자):

| 키 | 체결 | 같은수량 | 큰 전문의 일부 | 못찾음 | 추정 | dt p50 / p95 / max (ms) |
|---|---|---|---|---|---|---|
| KRX KR7184230001 | 227 | 153 | 72 | 2 | 71 | 0 / 543 / 729 |
| KRX KR7011080009 | 58 | 25 | 33 | 0 | 12 | 0 / 183 / 711 |
| KRX KR7051630002 | 43 | 20 | 22 | 1 | 3 | 0 / 31 / 58 |
| KRX KR7092190008 | 35 | 13 | 20 | 2 | 12 | 25 / 76 / 113 |
| NXT KR7046890000 | 43 | 25 | 18 | 0 | 10 | 23 / 168 / 746 |
| **합** | **406** | **236** | **165 (41%)** | **5** | **108 (26.6%)** | — |

→ 401/406 = 98.8% · 「약 40% 큰 A3 의 일부」 · 「약 25% 추정」 과 정확히 맞는다. 못찾음 5건 원문: `S 2490x193 01:04:00.048` · `S 2510x246 01:04:00.916`(184230) · `B 3150x11 09:24:32.843`(051630) · `S 10210x151 00:04:58.999` · `B 9110x4 01:00:58.62…`(092190) — 시각은 UTC ISO 의 11~23자.

**(b) 조건 근거 (SC-3)** — `own-trigger.probe.test.ts` 원문 요약:
```ts
// 체결 근거 ev_kind 2: 단건 = A3 중 cumVolume === ev_qty_after && qty === ev_trade_qty && px === ev_price → 정확히 1개
// 호가 근거 ev_kind 1: B6(ok) 수신 ms ∈ [g-3000, g+50] 순회, bookAt → [...bids, ...asks] 중 px === ev_price 인 단의
//                      qty === ev_qty_after 이면 found = r (덮어씀 → 창 안 **마지막** 일치)
// 앵커(cum_volume > 0): cumVolume === cum_volume 인 A3 rec 들 중 마지막(hit[hit.length-1])
```
출력 원문(5종목 합): `{"근거없음(ev 0) 누적 0":21,"누적앵커 있음":100,"호가근거 찾음":29,"근거없음(ev 0) 누적거래량 일치":61,"체결근거 없음":11,"체결근거 정확 1":2}` · 근거 gw−수신 p50 0 / p95 275 / min −45 / max 1017 ms · 앵커 gw−수신 p50 160 / p95 17,910 / max 108,073 ms.
- 「체결근거 없음」 11건 = 주기매도(`AutoSellBid1 주기매도(매수1호가)` · `AutoSellAsk1 주기매도(매도1호가)` — ev_qty_before → ev_qty_after 가 누적 구간) + before = after = 0 인 2건(`A3 차감재평가(…)` · `PreBuy A3 스윕호가변경(…)`). → **구간 규칙**: `ev_qty_after > ev_qty_before` 이면 cumVolume ∈ (before, after] 인 A3 첫 … 끝(D-11). before = after = 0 이면 근거 없음 → 앵커만(D-13).
- 이 이벤트 묶음에 ev_kind 3(체결통보)은 없었다(10/30 전체 kind/ev_kind 분포 원문: `(3,0):173 (6,0):53 (6,2):49 (3,1):26 (6,3):7 (6,1):4 (3,2):2` — (6,3) 7건은 5종목 밖). → Open Question 3.

**(c) 픽스처 재현 대상 = 5종목 키**(probe 원문 `KEYS`): `KRX_KR7184230001` · `KRX_KR7011080009` · `KRX_KR7051630002` · `KRX_KR7092190008` · `NXT_KR7046890000`. 406 체결은 전부 KB120 이다(이번 세션 fills1030.json 집계 — KYOBO119 10/30 체결 20건은 다른 종목).

### Pattern 2: shared 순수 함수 모양 (Web Worker 이식 가능 · typed array)

```ts
// packages/shared/src/ticks/own-fills.ts (제안 — 이름은 플래너 재량)
import { TAG_CODE, type A3Columns, type TickIndex } from "./record-index";   // record-index.ts:29 · :41-52 · :193-211
import { bookAt } from "./book";                                              // book.ts:64
import { lowerBoundRecv } from "./tick-time";                                 // tick-time.ts:73

export interface OwnFillIn { key: number; gwMs: number; px: number; qty: number }        // gw_time_ms 오름차순 정렬은 호출자
export interface OwnFillMatch { a3j: number; est: boolean; candidates: number; dtMs: number } // a3j -1 = 못찾음
export function a3TimeMs(index: TickIndex, a3: A3Columns, j: number): number;            // tNs(−1n 이면 recvNs) → ms
export function matchOwnFills(index: TickIndex, a3: A3Columns, fills: readonly OwnFillIn[]): OwnFillMatch[];
export type Evidence =
  | { kind: "b6"; rec: number }
  | { kind: "a3"; j: number }                       // 체결 근거 단건
  | { kind: "range"; firstJ: number; lastJ: number; n: number; qty: number }   // 주기매도 구간
  | { kind: "none" };
export function locateEvidence(buf: Uint8Array, index: TickIndex, recvOrder: Int32Array, a3: A3Columns,
  ev: { gwMs: number; evKind: number; evPrice: number; evQtyBefore: number; evQtyAfter: number; evTradeQty: number }): Evidence;
export function anchorOf(a3: A3Columns, cumVolume: number): number;  // 마지막 일치 A3 j · 없거나 0 이면 -1
```
- 성능: 체결 F ≤ 수백 · A3 ≤ 14.6만(NXT 10/30). 체결마다 전 A3 를 훑으면 수천만 연산 → **A3 를 시각 정렬 색인(Float64Array + Int32Array 순열)으로 한 번 만들고 체결마다 이분 탐색**으로 [g−1500, g+200] 창만 본다. cum 조회는 `Map<number, number[]>` 한 번. B6 근거는 `lowerBoundRecv(index.recvNs, recvOrder, BigInt(g−3000)*1_000_000n)` 부터 g+50 까지만 `bookAt`.
- 세션 재생성(당일 증분)마다 전체 재계산 — 37-19 실측 세션 재생성 21.6ms(11,990 레코드) [VERIFIED: 37-19-SUMMARY.md:107] 대비 짝짓기는 수 ms 수준이라 부분 갱신 불필요(CONTEXT Established Patterns 「부분 갱신 없음」 과 같음).

### Pattern 3: RPC — jsonb 1회 · 게이트 · 어드민 · 켜진 서버

검증한 칸 · 함수(이번 세션에 정의를 열어 확인):
- `dma_journal_events` 칸 `gateway, journal_epoch, seq, trade_date, gw_time, dma_user_id, account_no, isin, side, …, order_no, …, notice_type, …, exchange, board, order_price, order_qty, exec_price, exec_qty, …` · PK `(gateway, journal_epoch, seq)` [VERIFIED: supabase/migrations/20260924200000_dma_journal_tables.sql:62-90]
- `dma_strategy_events` 칸 `gateway, journal_epoch, seq, trade_date, gw_time_ms, kind, "group", exchange, isin, cum_volume, dma_user_id, account_no, order_no, price, qty, order_condition, reason_code, cond_threshold, cond_actual, cond_metric, ev_kind, ev_price, ev_qty_before, ev_qty_after, ev_trade_qty, …` [VERIFIED: supabase/migrations/20260929180000_dma_strategy_events.sql:43-89]
- `dma_servers(key, broker, host, port, enabled, is_order_server, is_quote_primary, sort_order, updated_at)` · 시드 `('KB120', … true …)` · `('KB121', … false …)` · `('KYOBO119', … true …)` · `('KYOBO127', … false …)` [VERIFIED: supabase/migrations/20261006200100_dma_registry_intent.sql:38-65]
- `dma_visible_accounts(p_user_id uuid) RETURNS TABLE (gateway text, account_no text)` [VERIFIED: 20260929190000_dma_gateway_identities.sql:113-129] — 원천 뷰 v2 는 `CROSS JOIN public.dma_servers s` 로 **꺼진 서버 키도 포함**한다 [VERIFIED: 20261007200100_dma_visibility_v2.sql:26-31] → D-03 은 RPC 가 `enabled` 를 따로 조인해야 성립한다.
- `dma_app_access_map() RETURNS TABLE (user_id uuid, email text, role text, dma_user_id text)` SECURITY DEFINER [VERIFIED: 20261006200100_dma_registry_intent.sql:156-169] · `app_users.role CHECK (role IN ('admin','trader','viewer'))` [VERIFIED: 20261006200000_app_access.sql:38-43]
- 기존 인덱스: `idx_dma_journal_events_fill_day ON dma_journal_events (trade_date, account_no) WHERE notice_type = 'E'` [VERIFIED: 20261028210000_dma_journal_pnl.sql:43-45] · `idx_dma_strategy_events_day (trade_date, gateway, account_no)` · `idx_dma_strategy_events_order (gateway, trade_date, account_no, order_no) WHERE order_no <> ''` [VERIFIED: 20260929180000_dma_strategy_events.sql:94-100]

```sql
-- 제안 골격 — supabase/migrations/2026110XHHMMSS_tick_own_for_user.sql (최신 = 20261103210000_tick_open_listing_shares.sql)
CREATE FUNCTION public.tick_own_for_user(p_user_id uuid, p_date text, p_isin text, p_ex text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_day date := to_date(p_date, 'YYYYMMDD'); v_admin boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);                     -- 37 tick_*_for_user 게이트 그대로
  END IF;
  v_admin := EXISTS (SELECT 1 FROM public.dma_app_access_map() m WHERE m.user_id = p_user_id AND m.role = 'admin');
  RETURN jsonb_build_object(
    'access', true, 'date', p_date, 'exchange', p_ex, 'isin', p_isin,
    'servers', (SELECT coalesce(jsonb_agg(s.key ORDER BY s.sort_order, s.key), '[]'::jsonb)
                  FROM public.dma_servers s WHERE s.enabled),
    'fills', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'gateway', j.gateway, 'seq', j.seq,
                 'gw_time_ms', (extract(epoch FROM j.gw_time) * 1000)::bigint,
                 'account_no', j.account_no, 'order_no', j.order_no, 'side', j.side,
                 'exec_price', j.exec_price, 'exec_qty', j.exec_qty)
               ORDER BY j.gw_time, j.gateway, j.seq), '[]'::jsonb)
                FROM public.dma_journal_events j
                JOIN public.dma_servers s ON s.key = j.gateway AND s.enabled
               WHERE j.trade_date = v_day AND j.isin = p_isin AND j.exchange = p_ex
                 AND j.notice_type = 'E' AND j.exec_qty > 0
                 AND (v_admin OR EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id) v
                                          WHERE v.gateway = j.gateway AND v.account_no = j.account_no))),
    'events', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'gateway', e.gateway, 'seq', e.seq, 'gw_time_ms', e.gw_time_ms, 'kind', e.kind, 'group', e."group",
                 'account_no', e.account_no, 'order_no', e.order_no, 'price', e.price, 'qty', e.qty,
                 'reason_code', e.reason_code, 'cond_metric', e.cond_metric,
                 'cond_threshold', e.cond_threshold, 'cond_actual', e.cond_actual,
                 'ev_kind', e.ev_kind, 'ev_price', e.ev_price, 'ev_qty_before', e.ev_qty_before,
                 'ev_qty_after', e.ev_qty_after, 'ev_trade_qty', e.ev_trade_qty, 'cum_volume', e.cum_volume)
               ORDER BY e.gw_time_ms, e.gateway, e.seq), '[]'::jsonb)
                FROM public.dma_strategy_events e
                JOIN public.dma_servers s ON s.key = e.gateway AND s.enabled
               WHERE e.trade_date = v_day AND e.isin = p_isin AND e.exchange = p_ex
                 AND e.kind IN (3, 6) AND e.order_no <> ''
                 AND (v_admin OR EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id) v
                                          WHERE v.gateway = e.gateway AND v.account_no = e.account_no))));
END; $$;
REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_own_for_user(uuid, text, text, text) TO service_role;

CREATE INDEX IF NOT EXISTS idx_dma_journal_events_fill_isin_day
  ON public.dma_journal_events (trade_date, isin, exchange) WHERE notice_type = 'E';
CREATE INDEX IF NOT EXISTS idx_dma_strategy_events_order_isin_day
  ON public.dma_strategy_events (trade_date, isin, exchange) WHERE kind IN (3, 6);
NOTIFY pgrst, 'reload schema';
```
- `dma_user_id` 는 반환하지 않는다(T-19-08 · 마이그레이션 주석 「감사 칸 — 반환 금지」 [VERIFIED: 20260929180000:54]).
- 인덱스 근거: 체결은 하루 ~1천 행(11/3 KB120 915 · 10/30 705 — transcript 요약)이라 기존 `fill_day` 로도 버티지만, 전략 이벤트는 kind 15 「분당 1건/키」 · kind 16 등으로 하루 행이 훨씬 많아 `(trade_date, gateway, account_no)` 로는 그날 전체를 훑는다 → **kind (3,6) 부분 인덱스 권장**. 체결 쪽은 당일 반복 호출을 대비한 저비용 부분 인덱스(권장 · 선택).
- 보조 `orders`(선택 · Open Question 2): 체결은 있는데 kind 3·6 행이 없는 주문번호(정정으로 바뀐 번호 등)의 주문 시각을 위해 `dma_account_orders`(created_at = 첫 이벤트 gw_time · side · price · qty · origin)를 같은 jsonb 에 싣는 안.

### Pattern 4: 전문 목록 항목 확장 — ORDER · NOFILL (SLOT 동형)

현재 정본 [VERIFIED: webapp/src/lib/ticks/msg-rows.ts:34-48]:
```ts
export const MSG_ITEM = { ROW: 0, TAIL: 1, SLOT: 2 } as const;
const KIND_SHIFT = 28;
const IDX_MASK = (1 << KIND_SHIFT) - 1;
export function msgItem(kind: MsgItemKind, idx: number): number { return (kind << KIND_SHIFT) | idx; }
export function itemKindOf(item: number): MsgItemKind { return (item >>> KIND_SHIFT) as MsgItemKind; }
```
- 새 종류 `ORDER: 3`(idx = 우리 주문 번호) · `NOFILL: 4`(idx = 우리 체결 번호) — `3 << 28`, `4 << 28` 은 Int32 양수 범위(종류 ≤ 7 까지 안전). `key={item}`(tick-msg-list.tsx:374)이 그대로 유일하다.
- **자리 = 수신순 슬롯 p 하나로 두 순열 공통.** `exchangeOrderOf` 는 수신순 자리 배열의 같은 슬롯에 보드별 seq 순으로 다시 채운다 [VERIFIED: packages/shared/src/ticks/record-index.ts:146-178] → `p = lowerBoundRecv(index.recvNs, recvOrder, gwNs)` 한 번 계산하고, `buildMsgRows` 루프 `for (p…)` 에서 **ROW(order[p]) 를 넣기 전에** p 에 걸린 ORDER/NOFILL 을 넣는다(p = n 이면 끝). 거래소순에서도 「그 시각 이후 첫 전문 앞」 이 된다(슬롯 시각이 단조).
- 색인 분리: `ownPosOfOrder: Int32Array` · `ownPosOfFill: Int32Array`(NOFILL 만) · 탐색용 `ownNavPos: Int32Array`(◆ 행 = `posOfRec[a3.rec[j]]` ∪ NOFILL 자리, 오름차순) — `posOfRec` 는 건드리지 않는다.
- `buildMsgRows(session, mode, own?: OwnModel | null)` — own 이 없으면 지금과 바이트 단위 같은 결과(기존 `msg-rows.test.ts` · `tick-msg-list.test.tsx` 무수정 통과).
- `joinedAt`(tick-msg-list.tsx:331-343)은 새 종류에서 주문 -1 을 돌려 레일 이음이 끊기므로, **ORDER/NOFILL 자리가 2조각 이상 묶음 한가운데면 그 묶음 끝(꼬리 뒤)으로 민다**(§Pitfall 3).

둘째 레일은 첫 칸 **바깥**이므로 행 격자에 14px 열을 앞에 더한다. 현재 [VERIFIED: tick-msg-list.tsx:77-78]:
```ts
const GRID = 'grid grid-cols-[122px_34px_66px_minmax(0,1fr)] max-[640px]:grid-cols-[84px_30px_42px_minmax(0,1fr)] items-center gap-x-1.5 px-2';
```
→ `grid-cols-[14px_122px_…]` · 폰 `[14px_84px_…]` · 머리 행(「수신 시각 · 종류 · seq · 내용」)에도 빈 칸 하나. 기존 첫 칸 안쪽 3px 레일(`railStyle` box-shadow inset 3px · tick-msg-list.tsx:122-126)은 **둘째 칸(시각 칸)으로 옮겨** 「첫 칸 안쪽」 의미를 지킨다(목업 B: `.vb .msg td.rl { width: 14px … }` 뒤에 기존 레일). 행 높이 24/22 유지 [VERIFIED: tick-msg-list.tsx:53-54 `ROW_H_DESKTOP = 24` · `ROW_H_PHONE = 22`].

### Pattern 5: 커서 · 선택 · 탐색

- 커서 정본은 여전히 `rec`(use-tick-cursor.ts:36-53). 주문 줄 · 짝 없음 줄은 rec 가 아니므로 **별도 선택 상태 `ownSel: {kind:'order'|'fill', id} | null`** 를 뷰어(또는 새 훅 `useOwnNav`)에 둔다. 줄 클릭 = `ownSel` 설정 + `rec` = 그 슬롯의 전문(URL `t` 는 rec 기준 그대로 — 37 D-18 무변경). `←/→`·클릭으로 rec 가 바뀌면 `ownSel` 해제.
- 키 `[` `]`: 지금 창 키는 `ArrowLeft/Right`(Shift 10) · Space 만 [VERIFIED: use-tick-cursor.ts:162-177] · 차트 키 `+ = - _ − 0` 은 차트 div 의 onKeyDown(창 아님) [VERIFIED: webapp/src/hooks/use-chart-view.ts:166-185 · tick-chart.tsx:331-336] → `[` `]` 충돌 없음. 입력칸 제외 규칙은 `isTypingTarget`(use-tick-cursor.ts:56 · 모듈 내부) — **export 해서 재사용**(tick-stock-picker.tsx:36 에도 복제본이 있다).
- 제목 줄 알약(D-09): 머리는 `TickViewerPage` 가 그리고 커서는 `TickViewer` 안이다 → 37 `onTick` 선례대로 `onOwn?: (s: OwnNavState | null) => void` 로 올리고 `TickHeader` 에 `ownPill` prop 추가.

### Pattern 6: 당일 경로 — 「최신 받기」 버튼에 얹기 (진행 중 변경 반영)

동시 세션 미커밋 diff(이번 세션 `git diff` 로 확인): `use-tick-live.ts` 머리 주석 ③ 「증분 = **버튼(`refresh()`)을 눌렀을 때만 1회**(2026-11-03 사용자 요청 「자동 업데이트가 불편 — 버튼으로」 · 옛 5초 자동 폴링을 걷었다)」 · 반환에 `refresh` · `refreshing` · `fetchedAt` 추가 · `TickHeader` 에 `live.onRefresh` 「↻ 최신 받기」 버튼. [VERIFIED: git diff webapp/src/lib/ticks/use-tick-live.ts · webapp/src/components/ticks/tick-header.tsx — 미커밋]
- 권고: `useTickOwn({isin, d, ex})` — (a) 열기 때 1회, (b) 당일이면 **`refresh()` 를 부를 때 같이 1회**(같은 클릭 · 병렬), (c) epoch 교체(generation 증가) 때 1회. 자동 타이머 없음 · 숨은 탭 처리 불필요. 과거 날짜는 키(`date|ex|isin`)별 메모리 캐시(격자 세션 캐시와 같은 수명).
- server 60초 사용자별 캐시: **두지 않는다.** 과거는 열 때 1회, 당일은 클릭 때 1회라 반복 호출이 없다. `tick-gate-cache` 는 5초 자동 폴링 때문에 생겼는데 그 폴링이 사라지는 중이다.
- 체감 목표: 「최신 받기」 한 번에 그 시점까지 저널에 들어온 우리 체결이 모두 보인다(저널은 relay 관찰자가 실시간 적용 · 지연 수 초 [ASSUMED]).
- **대기(pending) 상태**: 저널은 틱보다 먼저 들어올 수 있다. 체결 gw_time + 200ms(+ 여유 1s)가 세션 마지막 수신 시각보다 뒤면 짝 후보 창이 아직 다 안 왔으므로 「짝 전문 없음」 이 아니라 **대기**로 둔다(◇ 줄을 그리지 않거나 「대기」 표기 — UI 재량). 과거 격자는 늘 확정.
- 아직 체결 안 된 주문(kind 3·6 만 있고 E 없음): 주문 줄 ● 만 · 「우리 주문」 표 체결 0(CONTEXT 재량 — 표시 권고). 취소 · 정정 표시는 Deferred.

### Anti-Patterns to Avoid
- **서버에서 격자를 받아 짝짓기**: 37 의 「Cloud Run 무경유」 를 깬다(격자 최대 14.8MB · 당일 바이트 재조립). 금지.
- **가시성 필터를 Node 에서**: D-01 위반(RPC 안 조인이 정본). 금지.
- **`p_all_accounts` 를 쿼리 문자열에서 받기**: 클라 입력 금지(D-01).
- **gw_time 을 문자열로 받아 `Date.parse`**: probe 는 그렇게 했지만 계약은 `gw_time_ms` 정수로(ms 정밀 · 파싱 비용 0).
- **TickSession 안에 own 계산을 넣기**: 세션 생성(격자 · 증분)과 저널 도착은 주기가 다르다. 세션은 순수 틱 모델로 두고 `useMemo([session, own])` 로 따로.
- **team-model 에 우리 체결 섞기**: D-16 위반 · `ticks-pnl.golden.test.ts` 가 깨진다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 시각 → 수신순 자리 | 선형 탐색 | `lowerBoundRecv` [tick-time.ts:73] | 37 이 커서 · URL 에 이미 쓰는 이분 탐색 |
| B6 호가 10단 풀기 | 오프셋 손계산 | `bookAt(buf, index, rec)` [book.ts:64] | 레이아웃 정본 · 골든 잠김 |
| 픽스처 레코드 재프레이밍 | 헤더 수기 조립 | `encodeRecord` · `concatBytes` [framing.ts:60,76] | `pcapns-rec+zstd/1` 계약 그대로 |
| 구분 · 조건 · 근거 낱말 | 새 문장 | `ORDER_GROUP_LABELS` · `condMetricLabel` · `EVIDENCE_KIND_LABELS` · `strategyEventSide` · `reasonOperator` [strategy-event-labels.ts:45,78,220,234,245] | 25 D-09/D-10 · D-05 「낱말 그대로」 |
| 방향(매수/매도) 판정 | group 숫자 추측 | `strategyEventSide(group, kind)` | 수동 7 은 kind 로 갈린다(strategy-event-labels.ts:211-232) |
| 합성 틱 테스트 | 바이트 수기 | `webapp/src/test-fixtures/tick-synth.ts` `a3Msg`(이미 `cumVolume` 지원) · `b6Msg` · `synthSession` | 37 테스트 관례 · cum_volume 이미 씀(tick-synth.ts:79-97) |
| zstd 픽스처 읽기 | 새 헬퍼 | `readTicksZst` · `tickFixturePath` · `readTickJson` [__tests__/helpers/tick-digest.ts] | 37 골든 헬퍼 |
| RPC 게이트 · 모양 검사 | 새 패턴 | `services/ticks.ts` `gate(fn, data)` · `DbError` · `causeOf` | 403 `DMA_UNMAPPED` 은 RPC 가 `access:false` 를 줄 때만 |

**Key insight:** 이 phase 의 새 계산은 「규칙 3개(짝 · 근거 · 앵커)」 뿐이다. 나머지는 전부 37 의 부품(색인 · 순열 · 호가 · 라벨 · 게이트)을 조립하는 일이라, 새 부품을 만들면 37 골든과 갈린다.

## A3Columns · cumVolume 변경 (SC-3 · D-15)

- 레이아웃: `.add("cum_volume", 113, 12, "uint")` [VERIFIED: packages/shared/src/ticks/layouts.ts:106] — 12자리 십진(최대 999,999,999,999 < 2^53) → Number 안전. `parseUint` 반환 `number | bigint` [VERIFIED: decode.ts:60-62] → 기존 `toNum` 으로.
- 변경 3곳(record-index.ts): 인터페이스 `cumVolume: Float64Array`(:193-211 · `cumValue` 옆) · `A3_OFF` 에 `cumVolume: fieldOff(A3_LAYOUT, "cum_volume")`(:219-230) · 루프 `cumVolume[k] = toNum(parseUint(buf, o + A3_OFF.cumVolume, 12))`(:282 옆) · 반환 객체(:295-331).
- **`A3Trade` · `toTrades()` 는 건드리지 않는다** — `ticks-record-index.test.ts:192-202` 가 `expect(trades[j]).toEqual(a3TradeOf(r, row))` 로 잠그고, `toTrades` 는 KRX/NXT 주문 골든(orders-krx · team-pnl)의 입력이다. cumVolume 은 열 배열로만.
- 테스트: 같은 블록에 `expect(a3.cumVolume[j]).toBe(Number(row["cum_volume"]))` 한 줄(컷 13시 KRX · NXT 전 A3). `A3Columns` 를 손으로 만드는 곳은 없다(`grep cumValue` 결과 = record-index.ts · 그 테스트 · tick-amount-card · tick-chart 뿐) → 타입 추가로 깨지는 가짜 객체 없음.
- webapp 합성 `a3Msg` 는 이미 `cum_volume` 을 쓴다(`setNum(b, L, 'cum_volume', s.cumVolume ?? 0)` — tick-synth.ts:97).

## 10/30 픽스처 계획 (SC-2 · SC-3 재현 테스트)

**현황:** 저장소 픽스처(`packages/shared/src/__fixtures__/ticks/`)에는 10/30 이 없다 — 컷 13시(10/16 에코앤드림) · 10/14 천일 · 10/22 빅텍 · raw20k 뿐 [VERIFIED: ls · README.md]. 10/30 격자는 Supabase Storage `tick-grid/grid/20261030/<EX>/<isin>.nightly.ticks.zst`(37-16 밤 변환 성공 · 보존 `TICK_KEEP_DAYS` 기본 90일 → **2027-01-28 무렵 purge**) [VERIFIED: workers/tick-convert/src/config.ts:18,105 · 37-16-SUMMARY]. 이전 세션 사본이 `/private/tmp/claude-501/-Users-alex-repos-gh-radar/131ea538-3f09-4513-a71d-4c55e6b36ebb/scratchpad/own/` 에 있다(KRX_KR7011080009.zst 173,264B · KRX_KR7051630002.zst 3,383,170B · KRX_KR7092190008.zst 3,148,151B · KRX_KR7184230001.zst 285,054B · NXT_KR7046890000.zst 13,146,679B · fills1030.json 725행 · strat1030.json 314행) — **휘발성**.

**창(window) 픽스처 — 이번 세션 계산(재측정 아님 · 크기만):** 체결 gw_time [−3000, +1000]ms · 이벤트 gw_time [−3500, +500]ms 안 A3 · B6(ok) + cum_volume/ev_qty_after 와 같은 cum 의 A3 + 주기매도 구간(before, after] A3 만 남겨 `encodeRecord` 재프레이밍 → zstd-19:

| 키 | 원본 레코드 | 남긴 레코드 | zstd |
|---|---|---|---|
| KRX_KR7184230001 | 11,130 | 2,616 | 48,837 B |
| KRX_KR7011080009 | 6,421 | 607 | 13,170 B |
| KRX_KR7051630002 | 126,135 | 644 | 15,744 B |
| KRX_KR7092190008 | 118,990 | 4,879 | 104,905 B |
| NXT_KR7046890000 | 587,383 | 8,517 | 164,777 B |
| **합** | | | **347,433 B** |

창이 짝 후보 창([g−1500, g+200]) · B6 창([g−3000, g+50]) · cum 일치 · 구간을 모두 덮으므로 **결과가 원본 격자와 같다**(후보 집합이 같고 남은 수량 차감 순서도 같다). 앵커는 시각이 최대 108초 떨어지므로(probe 출력) 시각 창이 아니라 cum 값 집합으로 넣는다.

**생성기 `scripts/tick-oracle/gen-own-fixtures.mjs` (권고 사양):**
1. 입력: Storage 5 객체(deployer SA → Secret Manager `gh-radar-supabase-service-role` → Storage REST — 이전 세션 `sbget.sh` 와 같은 길) + PostgREST `dma_journal_events`(`select=gateway,seq,gw_time,account_no,order_no,isin,exchange,side,exec_price,exec_qty&trade_date=eq.2026-10-30&notice_type=eq.E&exec_qty=gt.0`) · `dma_strategy_events`(`kind=in.(3,6)` · probe select 칸 + `group,seq`). 키는 출력하지 않는다(비출력 스크립트 · 메모리 「비밀 주입은 사용자 `!` 실행」 — 분류기가 막으면 사용자가 `! node scripts/tick-oracle/gen-own-fixtures.mjs` 한 줄).
2. **계좌 익명화**: `account_no` → `ACC1…` 일관 치환(주문 묶기 키는 유지) · `dma_user_id` 는 아예 받지 않는다. 주문번호 · 가격 · 수량 · 시각은 그대로(규칙 입력).
3. 출력: `own1030-krx-KR7184230001.ticks.zst` … 5개 + `own1030.journal.json`(fills 406 · events 124 — 행마다 한 줄 · 키 정렬 · 37 README 규칙) + README 표 행 추가. 같은 입력이면 바이트가 같아야 한다(재생성 결정성).
4. 자기검사: 체결 406 · 5종목 · `notice_type=E` 필터를 더해도 406 인지 확인(probe 는 `exec_qty>0` 만 걸었다 — Assumption A1) — 다르면 종료 1.

**오라클 테스트 `ticks-own.golden.test.ts` 단언:** 위 Pattern 1 표의 종목별 (같은수량 · 일부 · 못찾음 · 추정) 정확값 + 합 401/406(≥ 98%) · 호가 근거 29/29 · 체결 단건 2 · 구간 판정 대상 = 「체결근거 없음」 11 중 구간 9 + 근거없음 2 · 앵커 100/100(cum>0 이벤트 전부 일치) · (선택) dt p50/p95 범위.

### Pitfall 목록 (Common Pitfalls)

### Pitfall 1: 「추정」 정의를 바꿔 버림
**What goes wrong:** ROADMAP 문구 「20ms 안 같은 가격 후보 둘 이상」 을 「g 기준 ±20ms 안 후보 ≥ 2」 로 구현하면 108 이 재현되지 않는다.
**Why:** probe 정의는 「최근접 후보와 두 번째 후보의 |dt| 차 < 20ms」 다.
**How to avoid:** Pattern 1 의 식 그대로 · 오라클 표의 종목별 추정 수(71 · 12 · 3 · 12 · 10)로 잠근다.

### Pitfall 2: 체결 처리 순서 · 동률
**What goes wrong:** 남은 수량 차감이 순서 의존이라 정렬이 다르면 다른 A3 에 붙는다.
**How to avoid:** RPC `ORDER BY gw_time, gateway, seq` · 함수는 입력 순서 그대로 처리 · 후보 동률은 A3 열 색인(파일 순서) 작은 쪽(probe 의 안정 정렬과 같음).

### Pitfall 3: 주문 줄이 버스트 묶음 한가운데 끼임
**What goes wrong:** gw_time 이 2조각 이상 주문의 조각 사이(µs 간격)에 떨어지면 레일 이음 · 꼬리 자리가 깨진다(`joinedAt` 가 끊김).
**How to avoid:** 슬롯 p 의 앞뒤 rec 이 같은 다조각 주문이면 그 묶음의 꼬리 뒤로 민다. 테스트: 합성 세션으로 3조각 주문 중간 시각의 주문 줄.

### Pitfall 4: 당일 — 저널이 틱보다 먼저 와서 「짝 없음」 오표시
**How to avoid:** 대기(pending) 판정(Pattern 6) — 세션 마지막 수신 < gw + 200ms + 여유면 확정하지 않는다.

### Pitfall 5: e2e 목이 새 경로를 404 로 돌려줌
**What goes wrong:** `mockTickApi` 는 모르는 `/api/ticks/*` 에 404 를 준다 [VERIFIED: webapp/e2e/fixtures/ticks.ts:291-292 `default: return json(route, 404, …)`]. 웹이 own 실패를 화면 오류로 올리면 기존 e2e 전부가 깨진다.
**How to avoid:** own 조회 실패(404 · 5xx · 네트워크)는 **우리 층만 숨기고 뷰어는 정상**(오류는 조용히 · 401/403 만 게이트와 같게) + 목에 `case '/api/ticks/own'` 추가(컷 13시 에코앤드림 10/16 픽스처에 맞춘 합성 체결 몇 건).

### Pitfall 6: 꺼진 서버 행이 가시성 뷰로 새어 들어옴
**What goes wrong:** `dma_visibility_identities` 는 `CROSS JOIN dma_servers` 로 꺼진 서버 키까지 곱한다 → 가시성 조인만으로는 KB121 행이 보인다.
**How to avoid:** RPC 에서 `JOIN dma_servers s ON s.key = … AND s.enabled` 를 체결 · 이벤트 둘 다에 · pgTAP 로 「KB121 꺼짐 = 0행 → `UPDATE dma_servers SET enabled = true WHERE key = 'KB121'` 뒤 포함」.

### Pitfall 7: 중복 수신 A3
**What goes wrong:** 같은 보드 · seq 재수신(37 Pitfall 12 · `session.duplicates`)이 후보를 둘로 만들어 남은 수량 · 추정이 부풀 수 있다.
**How to avoid:** probe 는 중복을 빼지 않았다 → **오라클 재현은 probe 그대로**(전 A3 ∧ ok). 중복 제외는 픽스처 테스트로 401 이상 · 추정 감소가 확인될 때만 바꾼다(Open Question 4).

### Pitfall 8: `--mine` 라이트 대비 부족
**What goes wrong:** `#0f9d8a` 는 흰 바탕 대비 3.38:1 · `--mine-bg` `#e3f7f3` 위 3.04:1 — 9.5~10.5px 칩 글자는 AA(4.5) 미달(팀 `#a234c7` 은 5.45:1) — 이번 세션 WCAG 식 계산.
**How to avoid:** UI-SPEC 에서 글자용 진한 값(예 `#0b7d6e` = 흰 바탕 5.03:1 · `#e3f7f3` 위 4.52:1)을 `--mine-fg` 로 두거나 칩 글자를 키우는지 결정(D-06 「대비는 UI-SPEC 에서 확인」). 선 · 도형(3:1 기준)은 `#0f9d8a` 로 충분. 다크 `#2fd3bb` 는 9.49:1(`#17171c` 기준 근사).
**참고:** 목업 라이트 `--mine-bg:#e3f7f3`(불투명) · 다크 `rgba(47,211,187,.16)` — CONTEXT 「16% 알파」 는 다크 값이고 라이트는 `--team-bg` 와 같은 불투명 패턴 [VERIFIED: mockup-own-fills.html grep · globals.css:83-84,262-263].

### Pitfall 9: 진행 중 동시 세션 변경과 충돌
**What goes wrong:** `use-tick-live.ts` · `tick-header.tsx` · `tick-viewer.tsx` · `tick-viewer-page.tsx` 가 지금 미커밋으로 바뀌는 중(자동 폴링 → 버튼). 38 계획이 옛 5초 폴링을 전제하면 어긋난다.
**How to avoid:** 플래너는 이 변경이 38 실행 전에 들어간다고 가정하고(아래 State of the Art), 실행은 전용 worktree + 시작 전 `git status -sb` 확인(메모리 「동시 세션 커밋 경합」).

### Pitfall 10: 37-17 미완료
37-17-SUMMARY `status: uat-pending` [VERIFIED: 37-17-SUMMARY.md frontmatter · transcript 인용] — ROADMAP 은 38 이 「37-17 당일 경로 완료 뒤」 에 의존한다. 당일 경로 e2e · UAT 는 37-17 UAT 종료를 전제로 한다.

## Code Examples

### 서버 라우트 (37 패턴 그대로)
```ts
// server/src/routes/ticks.ts — /open 옆 (TickOpenQuery 재사용: isin · d · ex 필수)
ticksRouter.get("/own", requireAuth(), async (req, res, next) => {
  try {
    const q = parseOr400(TickOpenQuery, req.query);
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.set("Cache-Control", "no-store");
    res.json(await getTickOwn(supabase, req.userId!, q));   // services/ticks.ts: rpc("tick_own_for_user", {p_user_id, p_date, p_isin, p_ex}) → gate() → 배열 3개 모양 검사
  } catch (e) { next(e); }
});
```
- 403 은 RPC `{access:false}` 일 때만(`gate()` · services/ticks.ts:63-70) · `DmaUnmapped` = `new ApiError(403, "DMA_UNMAPPED", "DMA 계정이 연결되지 않았습니다.")` [VERIFIED: server/src/errors.ts:83-84].
- 테스트: `server/tests/routes/ticks.test.ts` 의 `makeSupabase`(RPC 만 기록 · `from()` 은 throw — :57-59) 그대로 — 넘긴 인자 4개 · 403 · 500 모양 위반 · 401 미인증 · 쿼리에 `p_all_accounts`/`user_id` 를 넣어도 RPC 인자에 안 실림.

### 공유 계약 (snake_case 통과 — 37 관례)
```ts
// packages/shared/src/tick-api.ts 에 추가
export interface TickOwnFill { gateway: string; seq: number; gw_time_ms: number; account_no: string; order_no: string;
  side: string; exec_price: number; exec_qty: number }
export interface TickOwnEvent { gateway: string; seq: number; gw_time_ms: number; kind: number; group: number;
  account_no: string; order_no: string; price: number; qty: number; reason_code: string; cond_metric: number;
  cond_threshold: number; cond_actual: number; ev_kind: number; ev_price: number; ev_qty_before: number;
  ev_qty_after: number; ev_trade_qty: number; cum_volume: number }
export type TickOwnResponse = { access: true; date: string; exchange: TickExchange; isin: string;
  servers: string[]; fills: TickOwnFill[]; events: TickOwnEvent[] };
```

### pgTAP 골격(tick_viewer.test.sql 동형)
```sql
-- supabase/tests/tick_own.test.sql — 실행: bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql
-- 사용자: U1 trader(KB120 계좌 …3801 매핑) · U2 trader(…3802) · U3 매핑 없음 · U4 admin(app_users role 'admin' · 매핑 있음)
-- 잠그는 것: EXECUTE service_role 만(anon · authenticated 0) · 게이트 {"access":false} · 가시 계좌만 · admin 전 계좌 ·
--   KB121(enabled=false) 행 0 → UPDATE enabled=true 뒤 포함 · notice_type 'E' ∧ exec_qty>0 만 · kind 3·6 ∧ order_no<>'' 만 ·
--   dma_user_id 키 없음 · servers = enabled 키 sort_order 순 · 정렬 gw_time 오름차순.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 당일 5초 자동 증분 폴링(37-19) | 머리 「↻ 최신 받기」 버튼 1회 증분(자동 없음) | 2026-11-03 사용자 요청 · **미커밋 진행 중** | 저널 재조회도 같은 버튼에 얹는다 · server 60초 캐시 불필요 |
| 팀 주문 원 500만 문턱 | 문턱 0(팀 주문 전부) · 판 제목 「팀 주문 원」 | 89b602f1(2026-11-03) | 차트 ◆○ 를 팀 원 위에 얹을 때 원이 더 많다 — 툴팁 묶음 규칙 확인 |
| 머리 제목만 | 열린 뒤 「‹ 목록으로」 + 종목명 | 89b602f1 | D-09 알약은 날짜 알약 · KRX|NXT 옆 · 「최신 받기」 와 같은 줄 |
| 스케치 022 (넷째 판 · 거래대금 카드 · 호가 3단 원복) | 4f15fb68 · 2c727d19 커밋됨 | 2026-11-03 | 차트가 4판이다 — ◆○ 는 가격 판(첫째)만 |

**Deprecated/outdated:** CONTEXT 재량 문구 「틱 증분(5초 · `use-tick-live.ts`)과 같은 주기」 — 자동 주기가 사라지는 중이라 「같은 클릭」 으로 읽는다.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 10/30 5종목에서 `exec_qty > 0` 행 = `notice_type 'E' ∧ exec_qty > 0` 행(406) | 픽스처 계획 | 406 이 달라지면 오라클 표를 생성기 출력으로 다시 고정해야 함(생성기 자기검사가 잡는다) |
| A2 | 체결이 있는 주문은 대부분 kind 3·6 행이 있다(수동 group 7 포함) · 정정 등으로 번호가 바뀐 주문은 없을 수 있다 | RPC · Open Q2 | 주문 줄 시각을 못 찾는 주문 → 보조 `orders`(dma_account_orders) 필요 |
| A3 | 저널은 relay 관찰자가 장중 수 초 안에 적용한다 | 당일 경로 | 「최신 받기」 직후에도 체결이 늦게 보일 수 있음(대기 표기로 흡수) |
| A4 | gh-trade 게이트웨이 시계(gw_time)와 틱 수신 시계(recv)는 같은 기준(probe gw−수신 p50 0ms) | 자리 계산 | 주문 줄 자리가 수십 ms 어긋남 — 표시만 영향 |
| A5 | 어드민 판정을 RPC 안에서 해도 D-01 의도(서버측 · DB role · 매 요청 · 클라 입력 없음)를 만족한다 | RPC · Open Q1 | 사용자가 「인자로」 를 고집하면 서버 role 조회 +1 왕복 |

## Open Questions

1. **어드민 분기를 인자(`p_all_accounts`)로 할지 RPC 안 판정으로 할지**
   - What we know: D-01 은 「`p_all_accounts boolean` 류 인자 · 서버가 role 로만 켠다」. `requireAdmin` 은 비어드민을 403 으로 막는 미들웨어라 그대로 못 쓰고(트레이더도 이 경로를 써야 함), 서버가 role 을 따로 읽으면 Supabase 왕복 +1 이다. server 테스트 목은 `from()` 을 금지한다.
   - Recommendation: RPC 안 `dma_app_access_map()` role 판정(같은 원천 `app_users` · 매 요청 · 왕복 1회 유지). 인자를 꼭 두려면 `p_all_accounts` 를 받되 **RPC 가 role 로 다시 검증**(admin 아니면 무시)하는 이중 안전 — 플래너가 CONTEXT 문구와 맞춰 고른다(사용자 확인 불필요 수준의 「how」).
2. **kind 3·6 행 없는 체결의 주문 시각**
   - Recommendation: 같은 jsonb 에 `orders`(dma_account_orders: gateway · account_no · order_no · created_at → ms · side · price · qty · origin)를 체결이 있는 주문번호만 실어 보조로 쓴다(왕복 그대로 1회). 없으면 주문 줄 대신 「주문 시각 모름」 으로 첫 체결만.
3. **ev_kind 3(체결통보) 근거** — 10/30 5종목에 없었다(실측 0). 권고: 근거 = 그 계좌의 직전 우리 체결(같은 ev_price · ev_trade_qty 의 E 행)로 잇되, 못 찾으면 「근거 없음 · 앵커만」. 측정 근거가 없으므로 UAT 에서 확인.
4. **중복 수신 A3 제외 여부** — probe 재현이 우선. 픽스처 테스트에 「중복 제외 시」 수치를 같이 찍어 보고 결정.
5. **대기(pending) 표기 모양** — 줄을 숨길지 「대기」 칩 줄로 둘지 UI-SPEC 재량.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 테스트 · 생성기(`zlib.zstd*`) | ✓ | v24.21.0 | — |
| pnpm | workspace | ✓ | 11.15.1 | — |
| Docker(OrbStack) + `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP 러너 | ✓ | 29.8.2 · 이미지 로컬 있음 | 미기동이면 「pgTAP 미실행」 기록 + 사용자 승인(37-16 관례) |
| Playwright | e2e | ✓ | ^1.59.1 (`webapp/node_modules/.bin/playwright`) | `rm -rf webapp/.next` 후 재실행(메모리) |
| gcloud + deployer SA 키 | 생성기(Storage · Secret Manager) · 배포 | ✓ | `/opt/homebrew/bin/gcloud` · `~/.config/gcloud/gh-radar-deployer.json` | 분류기 차단 시 사용자 `!` 실행 |
| zstd CLI | (선택) 픽스처 점검 | ✓ | `/opt/homebrew/bin/zstd` | Node zlib |
| 10/30 격자(Storage) | 픽스처 생성 | ✓(2027-01 말 purge 전까지) | nightly | /private/tmp 사본(휘발) |

**Missing dependencies with no fallback:** 없음.
**Missing dependencies with fallback:** 없음(모두 있음).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest — shared ^4.1.4 · server ^4.1.4 · webapp ^2.1.9(jsdom) · Playwright ^1.59.1 · pgTAP(`scripts/verify-dma-orders-price-check.sh --test`) |
| Config file | `packages/shared/vitest.config.ts`(maxWorkers 2) · `server/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts`(포트 3100) — 37 그대로 |
| Quick run command | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-own.golden.test.ts src/__tests__/ticks-own.test.ts src/__tests__/ticks-record-index.test.ts --maxWorkers=2` |
| Full suite command | 아래 「Phase gate」 두 명령 |

**규칙(37 VALIDATION 그대로):** 태스크마다 파일 단위 `exec vitest run <파일>`(server · webapp `test` 스크립트는 watch 라 쓰지 않는다) · 웨이브마다 건드린 패키지 전체 `exec vitest run --maxWorkers=2` · 전체 회귀는 한 세션만(`ps aux | grep -c "[v]itest"` 0 일 때) · playwright `--workers=1`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-3 (cum) | `A3Columns.cumVolume` = decodeFields(A3).cum_volume(컷 13시 KRX · NXT 전 A3) | unit(골든) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-record-index.test.ts --maxWorkers=2` | ✅ (단언 1줄 추가) |
| SC-2 | 10/30 5종목 종목별 같은수량 · 일부 · 못찾음 · 추정 = 오라클 표 · 합 401/406 | unit(오라클 · 커밋 픽스처) | `… vitest run src/__tests__/ticks-own.golden.test.ts --maxWorkers=2` | ❌ Wave 0 |
| SC-3 | 호가 근거 29/29 · 체결 단건 2 · 구간 9 · 근거 없음 · 앵커 100/100 | unit(오라클) | 같은 파일 | ❌ Wave 0 |
| SC-2/3 | 합성 경계(dt −200/+1500 경계 · 남은 수량 차감 · 추정 20ms 경계 · B6 마지막 일치 · 구간 (before, after] · before=after=0 → 없음) | unit(합성) | `… vitest run src/__tests__/ticks-own.test.ts --maxWorkers=2` | ❌ Wave 0 |
| D-16 | 팀 손익 골든 불변 | unit(골든) | `… vitest run src/__tests__/ticks-pnl.golden.test.ts src/__tests__/ticks-orders-krx.golden.test.ts src/__tests__/ticks-orders-nxt.golden.test.ts --maxWorkers=2` | ✅ |
| SC-4/5 · D-01/D-03 | RPC 권한 · 게이트 · 가시 계좌만 · admin 전 계좌 · enabled 서버만(켜면 포함) · E ∧ qty>0 · kind 3·6 · dma_user_id 없음 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql` + 정적 grep(`REVOKE EXECUTE … FROM anon, authenticated` ≥ 1 · `s.enabled` 2곳) | ❌ Wave 0 |
| SC-4 | `GET /api/ticks/own` 401 · 400(쿼리) · 403(access false) · 500(모양) · RPC 인자 4개만 · RPC 1회 | integration(supertest) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts --maxWorkers=2` | ✅ 파일(케이스 추가) |
| D-05/D-12 | `buildMsgRows(session, mode, own)` — 주문 줄 · 짝 없음 줄 자리(두 순열) · 다조각 묶음 회피 · own 없으면 기존과 같음 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/msg-rows.test.ts src/lib/ticks/__tests__/own-model.test.ts --maxWorkers=2` | ✅ / ❌ own-model |
| D-04/D-07/D-08/D-09 | 레일 마디 · 칩 「300/1,064」 · 카드 섹션 · 「우리 주문」 표 · 차트 ◆○ · 알약 k/n · `[` `]` · 입력칸 제외 | RTL | `… vitest run src/components/ticks/__tests__/tick-msg-list.test.tsx src/components/ticks/__tests__/tick-order-card.test.tsx src/components/ticks/__tests__/tick-chart.test.tsx src/lib/ticks/__tests__/use-tick-cursor.test.tsx --maxWorkers=2` | ✅ 파일(케이스 추가) |
| SC-4(당일) | 「최신 받기」 1회 = live 증분 1 + own 1 · 자동 타이머 0 · 대기 판정 | RTL | `… vitest run src/lib/ticks/__tests__/use-tick-live.test.tsx src/lib/ticks/__tests__/use-tick-own.test.tsx --maxWorkers=2` | ✅ / ❌ |
| 전체 흐름 | 과거 열기 → 레일 · 알약 ‹ › · 카드 · own 404 여도 뷰어 정상 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts --workers=1` | ✅ (fixture `/api/ticks/own` 추가) |

### Sampling Rate
- **Per task commit:** 그 태스크 행의 파일 단위 명령.
- **Per wave merge:** 건드린 패키지 `exec vitest run --maxWorkers=2`(+ 그 웨이브가 DB 면 pgTAP).
- **Phase gate:** `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts tests/routes/ticks-live.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks src/components/ticks --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts --workers=1` 그리고 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql`(exit 3 = Docker 미기동 → 「pgTAP 미실행」 기록).
- config `workflow.build_command`(shared build · relay typecheck · webapp typecheck)도 통과.

### Wave 0 Gaps
- [ ] `scripts/tick-oracle/gen-own-fixtures.mjs` + `packages/shared/src/__fixtures__/ticks/own1030-*.ticks.zst`(5) · `own1030.journal.json` · README 표 — SC-2/3 오라클 입력(메인 세션 또는 사용자 `!` 실행 · 계좌 익명화)
- [ ] `packages/shared/src/__tests__/ticks-own.golden.test.ts` · `ticks-own.test.ts`
- [ ] `supabase/tests/tick_own.test.sql`
- [ ] `webapp/src/lib/ticks/__tests__/own-model.test.ts` · `use-tick-own.test.tsx`
- [ ] `webapp/e2e/fixtures/ticks.ts` 에 `/api/ticks/own` 목(컷 13시 에코앤드림 10/16 합성 체결)
- 프레임워크 설치: 없음(전부 있음)

## Security Domain

`workflow.security_enforcement = false`(.planning/config.json) · 메모리 「보안검사 안 함」 — 섹션 생략. (권한 회귀는 Validation 의 pgTAP · supertest 가 잠근다: EXECUTE service_role 전용 · REVOKE anon/authenticated · `p_user_id` = `req.userId` 만 · `dma_user_id` 비반환 · 클라 입력으로 어드민 분기 불가.)

## Sources

### Primary (HIGH confidence — 이번 세션에 원문 열람)
- `.planning/phases/38-own-orders-on-ticks/38-CONTEXT.md` · `38-DISCUSSION-LOG.md` · `reference/mockup-own-fills.html`(토큰 · 레일 CSS)
- `.planning/ROADMAP.md:485-501`(Phase 38) · `.planning/phases/37-tick-viewer/37-16-SUMMARY.md` · `37-17-SUMMARY.md`(transcript 인용) · `37-19-SUMMARY.md:100-110` · `37-VALIDATION.md` · `37-16-PLAN.md:72-86`
- 마이그레이션: `20260924200000_dma_journal_tables.sql` · `20260929180000_dma_strategy_events.sql` · `20260929190000_dma_gateway_identities.sql:113-129` · `20261004090000_dma_journal_orders_for_user_json.sql` · `20261006200000_app_access.sql:38-49` · `20261006200100_dma_registry_intent.sql:38-65,156-169` · `20261007200100_dma_visibility_v2.sql` · `20261028210000_dma_journal_pnl.sql:43-45` · `20261028210100_dma_pnl_rpcs.sql` · `20261102200000_tick_viewer.sql` · `20261103210000_tick_open_listing_shares.sql`
- shared: `ticks/record-index.ts` · `ticks/layouts.ts:85-112` · `ticks/framing.ts` · `ticks/decode.ts:60-73` · `ticks/tick-time.ts:73-82` · `ticks/book.ts:64-84` · `tick-api.ts` · `strategy-event.ts` · `strategy-event-labels.ts` · `strategy-event-text.ts:92-140` · `__fixtures__/ticks/README.md` · `__tests__/helpers/tick-digest.ts` · `__tests__/ticks-record-index.test.ts:140-218`
- webapp: `lib/ticks/tick-session.ts` · `msg-rows.ts` · `use-tick-cursor.ts` · `use-tick-live.ts`(+ 미커밋 diff) · `tick-api.ts` · `tick-chart-tip.ts:1-80` · `team-model.ts:163` · `components/ticks/tick-msg-list.tsx` · `tick-order-card.tsx` · `tick-header.tsx`(+ diff) · `tick-viewer.tsx`(+ diff) · `tick-viewer-page.tsx` · `tick-chart.tsx:280-345,540-610` · `hooks/use-chart-view.ts:160-185` · `test-fixtures/tick-synth.ts` · `e2e/fixtures/ticks.ts` · `styles/globals.css:50-110,229-271`
- server: `routes/ticks.ts` · `services/ticks.ts` · `services/tick-gate-cache.ts` · `schemas/ticks.ts` · `middleware/require-admin.ts` · `routes/admin-pnl.ts` · `errors.ts:83-84` · `app.ts:30-157` · `tests/routes/ticks.test.ts:1-90`
- 스크립트: `scripts/verify-dma-orders-price-check.sh` · `supabase/tests/tick_viewer.test.sql:1-80` · `workers/tick-convert/src/config.ts`
- gh-trade: `/Users/alex/repos/gh-trade/docs/analysis/krx-a3-zero-quote.md` §1-§3 · `team-flow.md` §4 규칙 7

### Secondary (MEDIUM — 이전 세션 원문)
- transcript `~/.claude/projects/-Users-alex-repos-gh-radar/131ea538-3f09-4513-a71d-4c55e6b36ebb.jsonl` 줄 4175-4382 — probe 코드 · 출력(401/406 · 29 · 2 · 100 · 종목별 수치 · 못찾음 5건 · MISS 원문) · 입력 파일 위치

### Tertiary (LOW)
- 없음(웹 검색 불필요 — 전부 사내 코드 · 데이터)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 의존성 0 · 기존 버전 package.json 확인
- Architecture: HIGH — 「틱은 브라우저에만」 이 코드로 확정(server 서명 · 중계만) · 진행 중 변경(diff) 반영
- 규칙 · 오라클 수치: MEDIUM-HIGH — probe 원문(코드 + 출력)을 그대로 옮김 · 재측정 안 함 · A1 은 생성기가 자기검사
- Pitfalls: HIGH — 코드 근거(joinedAt · 404 목 · visibility v2 CROSS JOIN · 대비 계산)

**Research date:** 2026-11-03
**Valid until:** 2026-11-17(틱뷰어가 동시 세션에서 빠르게 바뀌는 중 — 7~14일) · 10/30 격자 purge 전(≈ 2027-01-28)에 픽스처 커밋 필수
