---
phase: 38-own-orders-on-ticks
verified: 2026-11-03T18:50:00Z
status: passed
score: 21/21 must-haves verified
covered_files:
  - ".planning/phases/38-own-orders-on-ticks/38-01-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-01-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-02-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-02-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-03-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-03-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-04-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-04-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-05-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-05-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-06-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-06-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-07-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-07-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-08-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-08-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-09-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-09-SUMMARY.md"
  - ".planning/phases/38-own-orders-on-ticks/38-10-PLAN.md"
  - ".planning/phases/38-own-orders-on-ticks/38-10-SUMMARY.md"
  - "packages/shared/src/ticks/own-fills.ts"
  - "packages/shared/src/ticks/record-index.ts"
  - "server/src/routes/ticks.ts"
  - "server/src/services/ticks.ts"
  - "supabase/migrations/20261104100000_tick_own_for_user.sql"
  - "supabase/tests/tick_own.test.sql"
  - "webapp/e2e/specs/ticks-viewer.spec.ts"
  - "webapp/src/components/ticks/tick-chart.tsx"
  - "webapp/src/components/ticks/tick-header.tsx"
  - "webapp/src/components/ticks/tick-msg-list.tsx"
  - "webapp/src/components/ticks/tick-order-card.tsx"
  - "webapp/src/components/ticks/tick-own-section.tsx"
  - "webapp/src/components/ticks/tick-viewer-page.tsx"
  - "webapp/src/components/ticks/tick-viewer.tsx"
  - "webapp/src/lib/ticks/msg-rows.ts"
  - "webapp/src/lib/ticks/own-model.ts"
  - "webapp/src/lib/ticks/tick-chart-tip.ts"
  - "webapp/src/lib/ticks/tick-chart.ts"
  - "webapp/src/lib/ticks/use-own-nav.ts"
  - "webapp/src/lib/ticks/use-tick-own.ts"
  - "webapp/src/styles/globals.css"
covered_digest: "v3:sha256:c6da4beb2494fa56be17bef3db1deb45dc50040f4b6ef3c159a5596a5e7badb4"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 38: 틱뷰어 우리 주문·체결 표시 — 검증 보고서

**Phase Goal:** 트레이더가 `/analytics/ticks` 에서 우리 팀 계좌가 낸 주문의 체결이 어느 A3 전문인지, 그 주문의 조건이 어느 B6/A3 전문을 보고 걸렸는지를 전문 목록 · 차트에서 바로 본다.
**Verified:** 2026-11-03
**Status:** passed (경고 5건 — 코드 리뷰 WR-01~05, 모두 open · 목표 달성을 막지 않음)
**Re-verification:** 아니오 — 최초 검증

SUMMARY 의 주장은 근거로 쓰지 않았다. 아래 증거는 이번 검증에서 코드를 직접 읽고 직접 명령을 돌려 얻은 것이다.

## 이번 검증에서 직접 돌린 명령

| 명령 | 결과 |
|---|---|
| shared `vitest run ticks-own.golden · ticks-own · ticks-record-index` (`--maxWorkers=2`) | 3 파일 · 45 passed |
| `node scripts/tick-oracle/gen-own-fixtures.mjs --check` | 6개 파일 바이트 일치 |
| server `vitest run tests/routes/ticks.test.ts ticks-live.test.ts` | 44 passed (stderr 의 500 로그는 「모양 위반」 시험이 일부러 낸 것) |
| webapp `vitest run src/lib/ticks src/components/ticks` (`--maxWorkers=2`) | 26 파일 · 353 passed |
| pgTAP `scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_own.test.sql` | 1..52 전부 ok · `# RESULT: PASS` |
| playwright `ticks-viewer.spec.ts -g "우리 주문" --workers=1` (3100 포트 비어 있음 확인 후 이 worktree 서버로) | 6 passed |

## 목표 달성

### 관찰 가능한 참 (ROADMAP SC-1~5 + CONTEXT D-01~D-16)

| # | 참 | 상태 | 증거 |
|---|---|---|---|
| SC-1 | 목업 검토·채택 | VERIFIED | `reference/mockup-own-fills.html` 존재 · B 둘째 레일이 D-04 로 채택되어 코드(`tick-msg-list.tsx` 14px 칸)에 반영 · 스케치 026 도 존재 |
| SC-2 | 우리 체결↔A3 짝짓기 ≥98% · 「n/m」 · 추정 · 누락 0 | VERIFIED | `own-fills.ts` `matchOwnFills` 규칙(같은 가격 · 남은 수량 ≥ 체결 · dt∈[−200,+1500] · 최근접 · 차감 · |dt| 차<20ms 추정). 골든 테스트 단언: 체결 406 · 같은수량 236 · 일부 165 · 못찾음 5 · 추정 108 · 짝 401 · 401/406≥0.98 통과. 짝 없는 체결 = `MSG_ITEM.NOFILL` 줄(`msg-rows.ts`) · 대기/확정 분리(`own-model.ts`) · e2e 「짝 없음」 포함 통과 |
| SC-3 | 조건 근거 전문 특정 · cum_volume 앵커 | VERIFIED | `locateEvidence` / `anchorOf` / `cumIndexOf` · `A3Columns.cumVolume`(offset 113 · 12자 `parseUint`). 골든: B6 29/29 · 분포 `1:b6 29 · 2:a3 2 · 2:range 9 · 2:none 2 · 0:none 82` · 앵커 100/100 단언 통과. 구간 점선 · ○ ◌ 는 `tick-chart.ts` · `tick-msg-list.tsx` |
| SC-4 | 과거=당일 같은 화면 · 가시성 서버측 · RPC 1회 | VERIFIED | `tick_own_for_user` jsonb 1회(fills+events+orders+servers) · 서버 `getTickOwn` RPC 인자 정확히 4개 · `no-store` · 가시성은 RPC 안(`dma_visible_accounts` + `dma_app_access_map()` role 로 어드민 판정, 불린 인자 없음). 당일: `useTickOwn(urlState, ownRefreshKey)` 자동 타이머 0 · 「최신 받기」 1회 = live 1 + own 1 (e2e 「6초 기다려도 own 추가 0」 통과) |
| SC-5 | 대상 게이트웨이 = `dma_servers.enabled` (하드코딩 0) | VERIFIED | RPC 세 배열 모두 `JOIN dma_servers s ON s.key = gateway AND s.enabled`. phase 38 파일(own-fills · own-model · use-tick-own · tick-own-section · 서버 서비스 · RPC)에 `KB120/KB121/KYOBO119/KYOBO127` 리터럴 0(grep). pgTAP E42~E48: KB121 켜면 fills·events·orders 자동 포함 · KYOBO119 끄면 빠짐 통과. 캡션 「이 날 n건 · 체결 n건 · 켜진 서버 …」 (`tick-own-section.tsx:362`) |
| D-01 | 가시 계좌 + 어드민 전 계좌 · 서버측 강제 · REVOKE | VERIFIED | SQL `(v_admin OR gateway\|account_no = ANY(v_vis))` · REVOKE PUBLIC/anon/authenticated + GRANT service_role · `dma_user_id` 미반환 · pgTAP G41 |
| D-02 | 계좌 선택 없음 · 한 색 · URL 무변경 | VERIFIED | `tick-url.ts` diff 0 · 계좌 끝 4자리는 주문 줄/카드/툴팁에만 |
| D-03 | 레지스트리 기준 · 안내 없음 | VERIFIED | SC-5 와 동일 |
| D-04 | 둘째 레일 14px · ○ ◌ ● ◆ · 추정 점선 | VERIFIED | `tick-msg-list.tsx` · e2e 「폰 390 둘째 레일 14px 칸 · 넘침 0」 통과 |
| D-05 | 점선 「주문」 줄 | VERIFIED | `MSG_ITEM.ORDER` · 슬롯 = 수신순 `lowerBoundRecv` 뒤 첫 전문 앞 |
| D-06 | `--mine` 토큰 | VERIFIED | `globals.css` 라이트 `#0f9d8a` · 다크 `#2fd3bb`(+ `--mine-bg` 16%) |
| D-07 | 「우리 주문」 정보 위치 | VERIFIED (사용자 UAT 뒤집기 기준) | 원문의 「표는 카드 아래 늘 표시」 는 UAT 에서 스케치 026 A(오른쪽 열 「이 주문·팀 \| 우리 주문 n」 탭)로 사용자가 직접 뒤집었다. 코드: `TickOwnTab` 탭(`tick-viewer.tsx:204`) · 카드 안 `TickOwnSection`(`tick-order-card.tsx:229`)은 그대로 · 폰 「버스트·팀」 안 표 e2e 통과 |
| D-08 | 차트 ◆ ○ ◇ · 클릭 이동 · 툴팁 줄 | VERIFIED | `tick-chart.ts:721~` 표식 모델 · `tick-chart-tip.ts` 「우리 체결 n주[ / 전체 m주] · 계좌 ···끝4 · 주문 #」 · 단위 테스트 통과 |
| D-09 | 제목 줄 알약 「◆ 우리 k/n · 주문 m ‹ ›」 · 키 `[` `]` | VERIFIED | `tick-header.tsx:194~` · `use-own-nav.ts:134` 키 처리(입력칸 제외 `isTypingTarget`) · UAT 로 탐색 대상이 근거·주문 줄까지 확장됨 |
| D-10 | 레일 클릭 이동 · 되돌아가기 | VERIFIED | `tick-viewer.tsx` `ownBack` 알약(`data-slot="tick-own-back"`) · 안정 키 `gateway\|order_no` · e2e 「보기 › · 되돌아가기」 통과 |
| D-11 | 구간 근거 점선 · 차트 ○ 는 구간 끝 하나 | VERIFIED | `locateTradeEvidence` range (before, after] · 골든 구간 9 · `evidenceFirstRec` / `evidenceRec` |
| D-12 | 짝 없는 체결 점선 ◆/◇ 줄 | VERIFIED | `MSG_ITEM.NOFILL` · 차트 ◇ · ‹ › 포함 |
| D-13 | 근거 없는 주문 = 주문 줄+체결만, 앵커 ◌ | VERIFIED | `own-model.ts` `NO_EVIDENCE` · `anchorOf` · cum 0 이면 −1 |
| D-14 | RPC 1회 · 과거/당일 동일 | VERIFIED | SC-4 와 동일 |
| D-15 | shared 순수 함수 + 10/30 오라클 + `A3Columns.cumVolume` | VERIFIED | `packages/shared/src/ticks/own-fills.ts` · 픽스처 `--check` 바이트 일치 |
| D-16 | 팀 손익·팀 패널 무변경 | VERIFIED | `git diff 483500a9 HEAD` — `team-model.ts` · `tick-team-panel.tsx` · `tick-url.ts` 변경 0 |

**Score:** 21/21 (SC-1~5 + D-01~D-16) · behavior_unverified 0 — 상태 전이·정리 불변식(대기→확정, 되돌아가기 수명, 키 처리 등)은 단위·RTL·e2e 가 직접 행사한다.

### Requirements Coverage

모든 PLAN(38-01~38-10)의 frontmatter 는 `requirements: []` 이고 ROADMAP Phase 38 도 `Requirements: TBD` 다. `.planning/REQUIREMENTS.md` 에는 Phase 38 에 매핑된 ID 가 없다(grep 0건) — 따라서 누락·고아(ORPHANED) 요구사항 0. 이 phase 의 계약은 ROADMAP SC-1~5 와 CONTEXT D-01~D-16 이며 위 표에서 전부 확인했다.

### Required Artifacts / Key Links (요약)

| 연결 | 상태 |
|---|---|
| RPC `tick_own_for_user` → `getTickOwn` → `GET /api/ticks/own`(requireAuth · no-store) | WIRED |
| `fetchTickOwn` → `useTickOwn` → `buildOwnModel(session, own)` → `PaneCtx.own` → 전문 목록 · 차트 · 카드 · 탭 · 알약 | WIRED (`tick-viewer.tsx:291~455`) |
| 당일 「최신 받기」 → `onLiveRefresh` → `ownRefreshKey` → `useTickOwn` 재조회 | WIRED (`tick-viewer-page.tsx`) |
| 데이터 흐름(Level 4) | FLOWING — 서버 응답 → shared 짝짓기 → 렌더. 하드코딩 빈값 없음 · own 실패 시 우리 층만 사라지고 뷰어 유지(e2e 500/404 통과) |

### Anti-Patterns

phase 38 이 만든/바꾼 핵심 파일에서 `TBD|FIXME|XXX` 0건. 스텁 없음.

### 경고 (WARNING — 코드 리뷰 38-REVIEW.md, 전부 `open`, 목표 달성은 막지 않음)

각 항목은 코드에서 현재도 존재함을 직접 확인했다(WR-01·02·05). 사용자 UAT 에서 문제 삼지 않았고 ROADMAP SC 수치(과거 격자 오라클)와는 충돌하지 않지만, 아래는 실제 결함이니 후속 quick 으로 처리를 권한다.

1. **WR-01 (표시 오류):** `tick-own-section.tsx:227` 이 `` ` +${Math.round(f.dtMs)}ms` `` 로 `+` 를 무조건 붙인다. 짝지은 체결의 약 52%(401 중 210)가 dt<0 이라 카드에 「+-37ms」 로 나온다. 한 줄 수정.
2. **WR-02 (당일 경로 정확도):** `own-model.ts:278` 의 대기(pending) 판정이 `a3j<0` 일 때만 동작한다. 진짜 A3 가 아직 세션에 없어도 1.5초 안 같은 가격·남은 수량 있는 더 이른 A3 가 있으면 그 A3 에 잘못 짝지어지고 수량이 차감된다(상한가 추격처럼 가격이 몰리는 종목에서 흔함). 과거 격자 경로·오라클 수치는 영향 없음.
3. **WR-03:** 짝짓기·근거 특정이 세션의 중복 A3(`duplicates`)를 거르지 않는다 — 10/30 픽스처엔 중복 0건이라 오라클과 무충돌, 중복 있는 날엔 「추정」 오표시·근거 오판 가능.
4. **WR-04:** 고른 우리 줄을 순번 id 로 기억해 own 재조회 후 다른 주문을 가리킬 수 있음(되돌아가기 알약은 안정 키를 씀).
5. **WR-05:** `use-tick-own.ts` 실패 핸들러가 직전 결과를 `own: null` 로 덮어, 「최신 받기」 중 일시 오류 한 번에 우리 층이 통째로 사라짐.

Info 4건(IN-01~04)과 SUMMARY 의 Known follow-ups(가격 판 밖 점 미표시 · 차트 ◆ 클릭이 고른 줄을 풀지 않음 · 추정 꼬리말 k 범위)는 알려진 한계로 기록. UI 감사 16/24 는 자문(advisory).

### 사람 확인 (Human Verification)

비어 있음 — 시각 · 흐름 확인은 phase 38-10 에서 프로덕션 UAT 로 이미 수행됐다(사용자 1차 「나머지는 ok」 + 변경 요청 2건 · 호가 기본 금액 반영 → 재배포 → 2차 「ok」, 38-10-SUMMARY 에 기록). 이 UAT 기록은 SUMMARY 서술이지만 호출자가 사용자 원문을 별도로 확인해 주었다. 배포 상태(원격 마이그레이션 20261104100000 · 서버 리비전 00072)는 이번 검증이 원격에 접근하지 않았으므로 직접 재확인하지 않았다.

### Gaps Summary

목표 미달 gap 없음. 우리 체결 → A3 짝짓기, 조건 근거 → B6/A3 특정, 앵커 모두 10/30 오라클 수치(401/406 · 108 · 29/29 · 2/9/2 · 100/100)를 이번 실행에서 재현했고, RPC → 서버 → 훅 → 모델 → 전문 목록 · 차트 · 카드 · 탭 · 알약 배선이 끊김 없이 이어져 있으며, 게이트웨이 하드코딩 0 · 가시성 서버측 강제 · 팀 손익 무변경을 확인했다. 남은 것은 위 경고 5건이며 그중 WR-01(한 줄)과 WR-02(당일 오짝)를 우선 처리할 가치가 있다.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
