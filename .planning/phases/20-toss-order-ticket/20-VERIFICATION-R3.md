---
phase: 20-toss-order-ticket
verified: 2026-10-03T12:54:42Z
status: passed
score: 13/13 truths verified (12 현행 코드 직접 확인 + 1 Phase 21 D-31 로 대체) · UAT 6/6 pass (사용자 판정 2026-10-03) · R3
covered_files: [".planning/phases/20-toss-order-ticket/20-01-PLAN.md", ".planning/phases/20-toss-order-ticket/20-01-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-02-PLAN.md", ".planning/phases/20-toss-order-ticket/20-02-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-03-PLAN.md", ".planning/phases/20-toss-order-ticket/20-03-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-04-PLAN.md", ".planning/phases/20-toss-order-ticket/20-04-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-05-PLAN.md", ".planning/phases/20-toss-order-ticket/20-05-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-06-PLAN.md", ".planning/phases/20-toss-order-ticket/20-06-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-07-PLAN.md", ".planning/phases/20-toss-order-ticket/20-07-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-08-PLAN.md", ".planning/phases/20-toss-order-ticket/20-08-SUMMARY.md", ".planning/phases/20-toss-order-ticket/20-CONTEXT.md", ".planning/phases/20-toss-order-ticket/20-REVIEW-FIX.md", ".planning/phases/20-toss-order-ticket/20-REVIEW.md", ".planning/phases/20-toss-order-ticket/20-UAT.md", ".planning/phases/20-toss-order-ticket/20-UI-SPEC.md", ".planning/phases/20-toss-order-ticket/20-VALIDATION.md", ".planning/phases/20-toss-order-ticket/20-VERIFICATION-R2.md", ".planning/phases/20-toss-order-ticket/deferred-items.md", ".planning/phases/21-gh-trade-mobile-app/21-34-SUMMARY.md", ".planning/phases/21-gh-trade-mobile-app/deferred-items.md", ".planning/phases/24-limitchaser-buy3/deferred-items.md", ".planning/phases/25-order-log-progress/deferred-items.md", "packages/shared/src/krxTick.test.ts", "packages/shared/src/krxTick.ts", "packages/shared/src/limitUp.ts", "webapp/e2e/overflow.ts", "webapp/e2e/specs/a11y.spec.ts", "webapp/e2e/specs/sidebar-tree.spec.ts", "webapp/e2e/specs/stock-detail-tabs.spec.ts", "webapp/e2e/specs/trading-workbench.spec.ts", "webapp/src/components/orderbook/order-panel.tsx", "webapp/src/components/stock/stock-detail-tabs.tsx", "webapp/src/components/trading/card/card-body.tsx", "webapp/src/components/trading/card/card-header.tsx", "webapp/src/components/trading/card/manual-order-form.tsx", "webapp/src/components/trading/lc/inline-value-editor.tsx", "webapp/src/components/trading/lc/lc-fields.ts", "webapp/src/components/trading/lc/number-pad-sheet.tsx", "webapp/src/components/trading/lc/setting-group.tsx", "webapp/src/components/trading/lc/use-lc-field-commit.ts", "webapp/src/components/trading/limit-chaser-form.tsx", "webapp/src/lib/numpad.ts", "webapp/src/lib/tick-rule.ts", "webapp/src/lib/use-edit-mode.ts"]
covered_digest: "v1:sha256:8e351e1b3a8cd6ce67b3e03f0d60385418aa42ffd253b07a928442a8e4a99c29"
behavior_unverified: 0
re_verification:
  previous_status: human_needed
  previous_score: 13/13 truths verified
  previous_report: 20-VERIFICATION-R2.md
  gaps_closed:
    - "R2 human_verification 6건 — 20-UAT.md 6/6 pass (사용자 판정 2026-10-03, 9/25 master 병합 뒤 실서버 주문 실사용)"
  gaps_remaining: []
  regressions: []
  superseded:
    - "R3-S1 호가 탭 OrderbookStatusBar(D-24 안 C) → Phase 21 D-31 로 호가 탭째 삭제"
    - "R3-S2 종목상세 호가주문 탭 → /trading 작업대 카드 본문(CardBody) 단일 호스트"
    - "R3-S3 감시대상 풀폭 토글(D-02a) → Phase 24 가 감시대상 토글 자체를 폐기"
    - "R3-S4 D-19 그룹 순서·D-21 매수취소 스위치 배치 → Phase 24 선매수·추가매수·후매수 접이식 카드 4장"
    - "R3-S5 D-04a 레거시 금액 확정 특례 → Phase 24-12 가 도달 불가로 걷어냄(lcLegacyBlockOf 로 통일)"
    - "R3-S6 §2.2b 첫 밴드 경계 700 → 685 (quick-260928-q5e)"
gaps: []
advisory:
  - finding: "R3-W1 P20-3 e2e(trading-workbench.spec.ts:3788)가 HEAD 에서 빨갛다 — 344 카드 헤더 종목명 <b>삼성전자</b> 가 24px 넘침(말줄임). 우측 패널(Phase 20 범위) 잘림은 아니다."
    category: other
    reason: "quick-260925-ptw(카드 헤더 종목명 한 줄 15px/700 + ellipsis·title, 사용자 디자인 손보기) 이후 생긴 헤더 폭 문제로, Phase 21/24/25 deferred-items 3곳이 이미 같은 원인으로 기록했다. 헤더 종목명을 판정에서 빼고 돌리면 P20-1~P20-5 와 P20-3(4밴드 × 행 44px · 편집 전후 · 헤더 높이 동일)이 전부 통과한다."
    evidence_status: "자체 실행 재현 2회(동일 실패) + 헤더 제외 사본 7/7 통과 (사본은 삭제, 저장소 변경 0)"
---

# Phase 20: 호가주문 토스식 재구성 (실험 브랜치) Re-Verification Report (Round 3 — 현행 코드 재확인)

**Phase Goal:** 종목상세 호가주문 탭 = `/trading` 작업대 카드 본문(CardBody 공용)의 우측 패널을 토스 주문창 구조로 재구성한다 — 상따 설정 「라벨 ─ 값 ›」 리스트 + 그룹 헤더 스위치 · 폰/태블릿 바텀시트 + 자체 숫자 키패드(단위별 단축 칩) · 데스크톱 인라인 편집(Enter·Esc·↑↓ 한 호가) · 수동주문 토스 주문 티켓 스타일 · 상단 상태줄 1줄 압축. 불변: §2.2b 본문폭 밴드 · 라벨 잘림 0 · 주문 경로(wss 단일 주문 경로·결과 모름 잠금·확인 다이얼로그) 동작 불변.

**Verified:** 2026-10-03T12:54:42Z (HEAD a82eb7a0)
**Status:** passed
**Re-verification:** Yes — R2(human_needed) 이후. 9/25 master 병합과 Phase 21·24·25 및 다수 quick 로 코드가 크게 바뀐 뒤의 현행 코드 기준 재확인

## 재검증 요약

R2 는 truth 13/13 에 사람 확인 6건이 남아 `human_needed` 였다. 그 6건은 `20-UAT.md` 에서 6/6 pass 로 닫혔다(사용자 판정 2026-10-03). 이번 R3 는 UAT 이후가 아니라 **그 사이 코드가 바뀐 현행 저장소**에서 Phase 20 목표가 아직 서 있는지를 다시 본다. 결론: 우측 패널 재구성(상따 설정 리스트 · 키패드 시트 · 인라인 편집 · 수동주문 티켓 · 호가 단위 단일 출처 · 주문 경로 불변)은 현행 코드에 모두 살아 있고, 호스트였던 호가 탭은 사용자 요청(Phase 21 UAT 3차 G-21-R3-10)으로 삭제돼 **작업대 카드 한 곳**이 CardBody 의 유일한 소비처다. 갭은 없다. 빨간 e2e 1건은 Phase 20 범위 밖 원인이라 advisory 로 남긴다(R3-W1).

## 대체(Superseded) 항목 — 사용자 결정에 따른 의도적 교체, 갭 아님

| ID | Phase 20 산출물 | 현재 위치 / 대체 근거 |
|----|-----------------|----------------------|
| R3-S1 | 호가 탭 `OrderbookStatusBar` 1줄 압축 (D-24 안 C, `stock-orderbook-section.tsx`, `orderbook.spec.ts` P20-6 ①②③, `orderbook.test.tsx`) | 파일 4개가 `bc36464c`/`d33572c1`(Phase 21-34, 2026-09-26)에서 삭제됐다. 근거 = Phase 21 CONTEXT D-31 · `21-UAT.md` G-21-R3-10(사용자 요청 「종목상세에서 호가주문은 제거하자」, status resolved, 4차 recheck). 호스트가 사라져 압축 대상도 없다. P20-6 ③(시간외종가 G2 배지)은 `trading-workbench.spec.ts:4144` 「G-21-R3-10 이전 …」로 이관돼 통과한다. |
| R3-S2 | 「종목상세 호가주문 탭」 | 종목상세는 3탭(차트·종목정보·뉴스토론). 옛 `?tab=orderbook` 은 매매 가능이면 `/trading?code=`, 불가면 `?tab=chart` 로 보낸다(`stock-detail-tabs.spec.ts` 5·G-21-R3-10 딥링크 통과). `CardBody` 소비처는 `trading-workbench.tsx` 하나다. 시간외종가 신규 주문은 카드 수동주문 주문유형으로 이동(D-31). |
| R3-S3 | D-02a 감시대상 풀폭 토글 행 | Phase 24 ROADMAP ⑤ — 감시대상(매도/매수잔량) 토글 폐기(`989fb4cd`, 24-VERIFICATION passed). |
| R3-S4 | D-19 그룹 순서 / D-21 | `lc-fields.ts` 가 매수주문·선매수·추가매수·후매수·매도주문·매수취소 카드로 재편(Phase 24). 「라벨 ─ 값 ›」 44px 행 · 그룹 헤더 스위치 구조 자체는 유지. |
| R3-S5 | D-04a 레거시 금액 확정 특례 | Phase 24-12(`e9aa0da1`) — 구서버 에코는 끄기만 허용하는 `lcLegacyBlockOf` 로 통일, 도달 불가가 된 특례 제거(24-VERIFICATION-R2~R4 passed). |
| R3-S6 | §2.2b 첫 밴드 경계 700 | quick-260928-q5e 로 685 (CLAUDE.md Conventions 도 685 · 830 · 992). 현행 ROADMAP 불변 문단 일부(700)와 어긋나나 사용자 결정 반영분이다. |

## Observable Truths (현행 코드)

| # | Truth | Status | Evidence (현행) |
|---|-------|--------|-----------------|
| 1 | 인라인 한 행 → `lc.set` 1회 → 60 에코 → 행 갱신(트레이서) | ✓ VERIFIED | 자체 e2e `P20-1` 통과(헤더 제외 사본) · `limit-chaser-form.tsx:675 useLcFieldCommit(` · `lc-tracer.test.tsx` 17건 통과 |
| 2 | 필드 확정 상태 기계(성공·거부·타임아웃·끊김·대기열·늦은 에코) + CardBody `unacked`·현재가 | ✓ VERIFIED | `use-lc-field-commit.ts` 978줄(Phase 24 가 companions 등 확장) · `card-body.tsx:224,276,278` · `use-lc-field-commit.test.tsx` 통과 |
| 3 | KRX 호가 단위 헬퍼 한 곳(`krxTick.ts`), `limitUp`·`order-panel` 이 호출(표 중복 0) | ✓ VERIFIED | `limitUp.ts:13,89` · `order-panel.tsx:63,124` · `TICK_TABLE`/`tickFromTable` 비테스트 코드 0건 · shared `krxTick.test.ts` 29건 통과 |
| 4 | 자체 키패드 순수 규칙(`numpad.ts`)이 shared krxTick 재사용 | ✓ VERIFIED | `numpad.ts` 253줄 · `numpad.test.ts` 통과 |
| 5 | 편집 방식은 입력 장치로만 갈림: 터치=바텀시트, 마우스=인라인 | ✓ VERIFIED | `use-edit-mode.ts` `COARSE_POINTER_QUERY='(pointer: coarse)'` · `limit-chaser-form.tsx:710,1632` · `manual-order-form.tsx:387,1073` · 자체 e2e `P20-2`(390/768 시트) 통과 · UAT #3 pass |
| 6 | 상따 설정이 「라벨 ─ 값 ›」 44px 리스트 + 그룹 헤더 스위치 | ✓ VERIFIED | `lc-fields.ts` 그룹 스펙 → `limit-chaser-form.tsx:1623-1624` · `GroupSwitch` · `lc/` 에 truncate/ellipsis/뷰포트 브레이크포인트 0건 · 자체 e2e `P20-3`(4밴드·행 44·편집 전후·헤더 높이 동일, 헤더 종목명 제외) 통과 |
| 7 | 더티 누적·하단 「수정/되돌리기」 바 제거: 필드 1개 확정 = 전송 1회 | ✓ VERIFIED | `limit-chaser-form.tsx` · `card-body.tsx` 에 `DirtyActionBar`/`LIMIT_CHASER_DIRTY_HINT`/`cardDirtyHint` 0건. `dirty-action-bar.tsx` 파일은 남았으나 프로덕션 렌더 소비처 없음(Phase 21 deferred-items 기록, 폼과 무관) |
| 8 | 데스크톱 인라인 완성: Enter/Tab/blur 저장 · Esc 취소 · ↑↓ 한 호가 · 한 번 클릭 전환 | ✓ VERIFIED | `inline-value-editor.tsx:175-197` Enter/Escape/ArrowUp 처리 · `inline-navigation.test.tsx`·`inline-value-editor.test.tsx` 통과 |
| 9 | 수동주문 토스 상자(`TicketBox`) · 48/38 버튼, 기능·옛 셀렉터 보존 | ✓ VERIFIED | `manual-order-form.tsx:830-934` TicketBox · `mo-qty-{isin}` 등 id · 자체 e2e `P20-5` 통과 |
| 10 | 주문은 매수/매도(정정/취소) 버튼 → `OrderConfirmDialog` 로만, wss 단일 경로·결과 모름 잠금 불변 | ✓ VERIFIED | `manual-order-form.tsx:385,760` `sendOrder` 는 `handleConfirmed` 안에서만, `1102 <OrderConfirmDialog onConfirm=handleConfirmed>` · `res.status==='timeout'` → unknown 배너 · `P20-5`(시트 「입력」 뒤 주문 0) 통과 |
| 11 | ETP/미분류 호가 단위 위반은 경고만(D-15a), `useTickRule` 한 번으로 두 폼에 전달 | ✓ VERIFIED | `card-body.tsx:65,257` · `tick-rule.test.tsx` 통과 · `P20-4`(D-15 잠금 호가 단위·상한가) 통과 |
| 12 | e2e 이관 + 최악값 × 4밴드 · a11y · 사이드바 | ✓ VERIFIED (R3-W1 단서) | `a11y.spec`·`sidebar-tree.spec`·`stock-detail-tabs.spec` 33/33 통과. `trading-workbench.spec` P20-3 은 헤더 종목명 때문에 HEAD 에서 빨강 — 아래 R3-W1 |
| 13 | 상단 상태줄 1줄 압축 (D-24 안 C) | ✓ SUPERSEDED (PASSED by decision) | R3-S1 — 호스트(호가 탭)가 사용자 요청으로 삭제됨. 작업대 카드 헤더·상태줄은 D-24 대상이 아니었다(UI-SPEC §10) |

**Score:** 13/13 (12 직접 확인 + 1 대체). `behavior_unverified` 0 — 상태 전이·취소·순서 불변식(결과 모름 잠금, 늦은 에코, 되돌림)은 단위·e2e 가 직접 실행한다.

### UAT 연계

`20-UAT.md` status complete, 6/6 pass, issues 0 (R2 human_verification 6건 전부: 상태줄 톤 · 우측 패널 톤 · 하이브리드 포인터 분기 · LC_ORPHAN_WAIT_MS 7초 · 신규 문구 3종 · 레거시 전략). 사용자 판정 2026-10-03. 주의: 테스트 항목 1(상태줄 톤)은 이후 삭제된 호가 탭 대상이었으나, 사용자 판정이 9/25 병합 뒤 실서버 사용 기준이고 R3-S1 로 이미 대체 처리돼 영향 없다.

### Required Artifacts (현행)

| Artifact | Status | Details |
|----------|--------|---------|
| `webapp/src/components/trading/lc/{use-lc-field-commit.ts,inline-value-editor.tsx,setting-group.tsx,lc-fields.ts,number-pad-sheet.tsx}` | ✓ | 모두 존재·실질 구현·소비처 연결(Phase 24/25 로 확장) |
| `webapp/src/lib/{numpad.ts,use-edit-mode.ts,tick-rule.ts}`, `packages/shared/src/krxTick.ts` | ✓ | 존재·연결 |
| `limit-chaser-form.tsx`, `card/manual-order-form.tsx`, `card/card-body.tsx` | ✓ | 연결 확인(위 truth 표) |
| `stock-orderbook-section.tsx` 및 테스트 2 · `orderbook.spec.ts` | SUPERSEDED | R3-S1 (삭제 커밋 `bc36464c`, `d33572c1`) |

### Key Link Verification (현행)

| From | To | Status |
|------|----|--------|
| `limit-chaser-form` → `useLcFieldCommit` (:675) | ✓ WIRED |
| `limit-chaser-form` → `LC_BUY_GROUPS`/`LC_SELL_GROUPS` (:1623-1624), `GroupSwitch` (:1478) | ✓ WIRED |
| `limit-chaser-form`/`manual-order-form` → `NumberPadSheet` (:1632 / :1073), `useEditMode` | ✓ WIRED |
| `card-body` → `useTickRule` → 두 폼 (:257) | ✓ WIRED |
| `numpad.ts`/`limitUp.ts`/`order-panel.tsx` → `krxTick` | ✓ WIRED |
| `manual-order-form` → `sendOrder` ← `handleConfirmed` ← `OrderConfirmDialog` | ✓ WIRED (불변) |
| 종목상세 → `/trading?code=` 카드 (`stock-detail-tabs`) | ✓ WIRED (e2e 통과) |

### Behavioral Spot-Checks / 자체 실행

| 확인 | 명령 | 결과 |
|------|------|------|
| Phase 20 단위(lc/·card/·numpad·tick-rule·use-edit-mode) | `pnpm exec vitest run src/components/trading/lc src/components/trading/card src/lib/__tests__/{numpad,tick-rule,use-edit-mode}…` | 10 files / 435 passed |
| shared krxTick | `vitest run krxTick` | 29 passed |
| e2e `P20-` 5건 + P20-6③ 이관분 (원본 그대로) | `playwright test trading-workbench.spec.ts -g "P20-"` | 2 passed · **P20-3 failed**(헤더 종목명 24px) · 4 did not run |
| 같은 e2e, 판정에서 헤더 종목명 `b[삼성전자]` 만 제외한 임시 사본 | `-g "P20-"` | **7 passed** (P20-1·2·3·4·5·G-21-R3-10 이전) — 사본 삭제, `git status` 변경 없음 |
| a11y · sidebar-tree · stock-detail-tabs | playwright | 33 passed |
| 회귀 게이트(호출자 제공) | relay 915 · webapp 3182 pass(1 skipped) | 인용(미재실행) |
| 부채 마커 | `TBD\|FIXME\|XXX` in 구현 파일 | 0건 |

### Anti-Patterns

부채 마커 0. `manual-order-form.tsx` 의 `truncate` 4곳(원주문 칩 · 주문금액 값 · 키 라벨)은 Phase 20 종료 시점(`a020d7a`)에도 있던 것으로 title 을 갖고 P20-3 이 통과한다 — Info. `lc/` 와 `limit-chaser-form.tsx` 에는 ellipsis/뷰포트 브레이크포인트 없음.

## Findings (R3-*)

| ID | 분류 | 내용 |
|----|------|------|
| R3-S1 ~ R3-S6 | 대체 | 위 표 — 갭 아님 |
| R3-W1 | Warning (advisory, 비차단) | P20-3 가 HEAD 에서 빨강. 원인은 카드 **헤더** 종목명 말줄임(quick-260925-ptw 설계, 344 폭에서 `삼성전자` 24px 넘침)이고 Phase 20 우측 패널이 아니다. Phase 21/24/25 `deferred-items.md` 3곳이 같은 원인으로 이월했고 아직 안 고쳐졌다. 후속 조치(별도 quick): ① P20-3 의 `expectCardNotClipped`/`expectEditingRow44` 판정에서 헤더 종목명(`[data-part="name"]`)을 제외하거나 ② 344 에서 4글자 이름이 안 잘리게 헤더 폭을 조정. 현재는 같은 spec 의 뒤 케이스(4밴드 순회·행 44)가 첫 실패에서 중단돼 가려진다는 점이 위험이라 가급적 조기 정리 권장 |
| R3-I1 | Info | `components/trading/dirty-action-bar.tsx` 와 `DirtyBarHostContext`·globals.css §21 규칙은 프로덕션 소비처 없이 남았다(Phase 21 deferred-items 기록). Phase 20 truth 7(폼에서 제거)에는 영향 없음 |

## Gaps Summary

**갭 없음.** Phase 20 목표는 현행 코드에서도 성립한다. 갱신/삭제된 산출물은 모두 사용자 결정(Phase 21 D-31 · Phase 24 · quick-260928-q5e)으로 교체된 것이며 대체 위치를 위에 기록했다. 실제 회귀로 볼 항목은 없고, 빨간 e2e 1건(R3-W1)은 Phase 20 범위 밖 원인의 이월 부채다.

---

_Verified: 2026-10-03T12:54:42Z_
_Verifier: Claude (gsd-verifier, round 3 — 현행 코드 재확인)_
