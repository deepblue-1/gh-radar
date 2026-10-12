---
phase: 31-limitchaser-amount-unit
verified: 2026-10-12T08:23:45Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - ".planning/phases/31-limitchaser-amount-unit/31-01-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-01-SUMMARY.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-02-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-02-SUMMARY.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-03-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-03-SUMMARY.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-04-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-04-SUMMARY.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-05-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-05-SUMMARY.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-06-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-06-SUMMARY.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-07-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-07-SUMMARY.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-08-PLAN.md"
  - ".planning/phases/31-limitchaser-amount-unit/31-08-SUMMARY.md"
  - "docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md"
  - "packages/shared/src/lc-amount.ts"
  - "relay/src/dma/envelope.ts"
  - "relay/src/ws/fanout.ts"
  - "relay/src/ws/protocol.ts"
  - "webapp/src/components/me/limit-chaser-defaults.tsx"
  - "webapp/src/components/trading/lc/lc-fields.ts"
  - "webapp/src/components/trading/lc/use-lc-field-commit.ts"
  - "webapp/src/components/trading/limit-chaser-form.tsx"
  - "webapp/src/lib/limit-chaser.ts"
covered_digest: "v3:sha256:09ac4d366fb1ca33863649f503b624507218dc0ce428f79b290f3486ea40469d"
behavior_unverified: 0
superseded_by: 31-VERIFICATION-R2.md
human_verification_resolved:
  source: ".planning/phases/31-limitchaser-amount-unit/31-UAT.md"
  commit: "edfc50df"
  result: "4/4 pass"
round1_verified: 2026-10-12T08:30:00Z
round1_status: human_needed
round1_score: 3/4 must-haves verified
round1_covered_digest: "v3:sha256:203c3b955984275a688068d554f50bd7940c741e5650da0ab39a331d12b724bb"
round1_behavior_unverified: 1
round1_behavior_unverified_items:
  - truth: "C# 단말 만원 원값이 웹 재제출로 지워지지 않는다 (실서버 경로)"
    test: "gh-trade 서버(feature/limitchaser-amount-unit) 배포 + relay 배포 + webapp 새 번들 뒤, C# 상따창에 만원(예: 매도 매수잔량 100)을 넣은 종목을 웹에서 아무 칸이나 재제출"
    expected: "Cloud Logging relay_docker 의 60 에코에서 sell_watch_amount 가 100 그대로, C# 칸도 100 그대로"
    why_human: "로컬 증거는 relay + 스텁 게이트웨이 e2e(P31-2)까지다. 실 gh-trade 서버는 vtable 158~172 를 아직 읽지 않는다(구 서버 무시) — 실서버 왕복은 코드로 볼 수 없다"
overrides_applied: 0
gaps: []
human_verification:
  - test: "AMT-01 — gh-trade feature/limitchaser-amount-unit 를 master 에 병합한 뒤 `git -C /Users/alex/repos/gh-trade merge-base --is-ancestor feature/limitchaser-amount-unit master` 가 exit 0 인지 확인하고, master worktree 기준 `RELAY=/Users/alex/repos/gh-radar/relay <master>/server/scripts/sync-relay-schema.sh --check` 를 실행"
    expected: "「신규/변경 예정 0 개 · .fbs 사본 최신」 + 생성물 마커 server-repo-commit 접두가 master FBS 마지막 커밋과 일치. squash/rebase 병합이면 e5b4fbca 가 master 에 없을 수 있어 마커 불일치 → relay/src/generated/ 재생성 경로 지정 커밋(D-15)"
    why_human: "외부 저장소(gh-trade) 병합 일정 의존. 검증 시점 실측: merge-base --is-ancestor exit 1, e5b4fbca 는 master 에 없음(master FBS 마지막 커밋 da762186), feature 58 커밋 앞섬"
  - test: "31-08 Task 1 — relay 배포(장 시간 08:00~20:00 KST 밖 권장) → scripts/smoke-relay.sh 통과 → 이미지 태그 기록. 배포 대상은 병합 커밋 88e0ed31 이후 HEAD"
    expected: "라이브 relay 가 2234a1b5 에서 새 태그로 바뀌고 smoke 통과"
    why_human: "자동 모드 분류기가 Production Deploy 로 차단. 현재 라이브 relay 는 2234a1b5(phase 30) — 웹 새 번들이 먼저 나가면 금액 키를 zod 가 떨어뜨림"
  - test: "31-08 Task 1 — Vercel 미리보기 고유 URL 배포(--skip-domain, push 없음) 후 trade.jx1.io 배포 ID(dpl_JAmpb3m3tmUnZ6qvfxpSEvTcpLQK) 전후 불변 확인, 미리보기에서 상따 두 줄 행 · /me 「후매수 최소」 화면 확인(31-08 human-check ①~⑥)"
    expected: "운영 ID 불변 · 두 줄 행(위 만원 / 아래 주) · /me 「후매수 최소(만원)」 표시·저장"
    why_human: "vercel build 가 분류기에 차단. 시각 확인(UI-REVIEW 의 685 여유 0.4px · S3/S4/S6)도 사람 몫"
  - test: "gh-trade 서버 배포 뒤 실증 — (a) C# 만원 입력 종목을 웹 재제출 → 60 에코 금액 원값 유지, (b) /me 후매수 최소 저장 → 84 에 그 값, post_buy_floor_qty 0"
    expected: "sell_watch_amount: 100 등 원값 유지 · 84 post_buy_floor_amount = 저장값"
    why_human: "실서버 의존(31-VALIDATION Manual-Only 1행)"
---

# Phase 31: 인박스 상따 금액 단위 Verification Report

**Phase Goal:** 웹에서 상따를 재제출해도 C# 단말 칸에 사람이 넣은 만원 원값이 지워지지 않고, /me 기본설정에서 「후매수 최소」 금액을 보고 바꿀 수 있다
**Verified:** 2026-10-12T08:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## 한 줄 판정

코드 · 계약 · 테스트로 볼 수 있는 부분(AMT-02 · AMT-03 · AMT-04)은 실제 코드에서 확인됐다. 남은 것은 코드 결함이 아니라 **외부/배포 의존 3건**(AMT-01 gh-trade 미병합, relay · Vercel 미배포, 실서버 왕복)이고, 별도로 **리뷰 WR-01(구 탭 되싣기)** 은 목표 문장과 직접 닿는 경고 1건이다. gaps_found 로 보지 않은 이유는 아래 「WR-01 판정」 참조.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `sync-relay-schema.sh --check` 가 gh-trade **master** 병합 마커 기준 「신규/변경 예정 0 · .fbs 사본 최신」 | ? UNCERTAIN (외부 의존 · 오늘은 충족 불가) | `git -C gh-trade merge-base --is-ancestor feature/limitchaser-amount-unit master` → exit 1(미병합) 직접 재확인. `e5b4fbca` 는 master 조상이 아님, master FBS 마지막 커밋은 `da762186`. 로컬 `relay/src/generated/StockDMA.fbs` 마커는 `server-repo-commit: e5b4fbca`(feature 기준). feature 기준 `--check` 0/0 이라는 31-08 기록은 있으나 criterion 이 요구하는 「master 병합 마커 기준」은 아님. 후속 phase 가 이를 흡수하지도 않는다(ROADMAP 에 다른 phase 없음 → deferred 불가) |
| 2 | 웹 재제출 시 60 에코 금액 8필드가 원값 그대로(예 `sell_watch_amount: 100`), 주를 바꾸면 짝이 맞는 금액 또는 0 | ✓ VERIFIED (새 탭 경로 · 스텁 게이트웨이까지) · 실서버 경로는 human | 아래 「AMT-02 근거」. e2e `P31-2` 를 오늘 직접 재실행 → pass |
| 3 | /me 에 「후매수 최소(만원)」가 84 값으로 보이고, 저장하면 42 12값 전체 교체로 84 에 실리며 `post_buy_floor_qty` 는 0 | ✓ VERIFIED | 아래 「AMT-03 근거」. e2e `P31-5` 를 오늘 직접 재실행 → pass |
| 4 | 「만(주)」 도입 여부가 인박스 노트 질문 2개 답으로 적히고 `status: done` · `done_commit` 커밋 — 도입하면 수량 칸이 만원 입력 · 주 환산 표시 | ✓ VERIFIED | 아래 「AMT-04 근거」 |

**Score:** 3/4 truths verified (1 external-pending, 0 failed). `behavior_unverified: 1` — 실서버 왕복(SC2 의 live 부분)은 「동작이 실행된 적 없다」가 아니라 「실서버가 아직 그 필드를 읽지 않는다」라 별도 human 항목으로 둔다.

### AMT-02 근거 (코드 직접 확인)

- `packages/shared/src/lc-amount.ts` — `LC_AMOUNT_PAIRS` 8쌍(buyWatch · buyMinTrade · extraBuyMin · extraBuyMax · postBuyFloor · sellWatch · sellMinTrade · cancelWatch), `qtyForSubmit`(칸 · 비교가가 에코와 같으면 에코 주, 아니면 `floor(만원×10000÷비교가)`), `echoAmountOf`(`amountOrDerive` — 짝이 맞을 때만 원값), `amountEchoMatches`. 스텁 아님(§10 이식, BigInt 폴백 포함).
- `relay/src/dma/envelope.ts:1716-1724` — SetLimitChaser 조립에 금액 8필드 `addBuyWatchAmount … addCancelWatchAmount` 가 실제로 실린다. 파서(2583~2660)는 60/64 에코에서 8필드를 읽는다. 생성물 `relay/src/generated/stock-dma/set-limit-chaser.ts` 에 필드 존재.
- `webapp/src/components/trading/limit-chaser-form.tsx:824-850` `buildCfg` — `...values`(= 에코 적용값) 로 금액을 싣고, `LC_AMOUNT_PAIRS` 8쌍 루프로 `lcSubmitQtyOf` 주를 같이 싣는다. 조립 지점 하나.
- 행동 증거: `relay/src/dma/__tests__/envelope.test.ts` P31 describe(3302~) + `relay/tests/fanout.test.ts` — 오늘 `vitest --maxWorkers=2` 로 envelope+fanout **309 passed**, shared `lc-amount` **81 passed**. e2e `trading-workbench.spec.ts:3267 P31-2`(에코 금액 8필드 → 「호가변경」 확정 → 스텁 게이트웨이가 디코드한 10 의 금액 8필드 = 에코 원값, 구 서버 에코 금액 0 은 역산) 오늘 `playwright --workers=1 -g "P31-(2|5)"` **pass**.

### AMT-03 근거

- `webapp/src/components/me/limit-chaser-defaults.tsx:96` 행 `postBuyFloorAmount`(「후매수 최소」 · 만원 · id `me-lc-post-buy-floor-amount`), `userSettingsValuesOf` 가 12값을 84 에서 뽑아 `postBuyFloorQty: 0` 고정, `usableUserSettingsOf` 가 금액 키 없는 84(구 relay) 를 「불러오는 중」으로 접는다.
- `relay/src/dma/envelope.ts:2078-2092` `buildSetUserSettingsReq` — 12값 전체, `addPostBuyFloorQty(b, 0)` 봉인, `addPostBuyFloorAmount(vtable 28)`. 84 파서는 `postBuyFloorAmount: u.postBuyFloorAmount()`(810행).
- e2e `me.spec.ts:1516 P31-5`(84 값 84 → 「84만원」 → 300 확정 → 42 `post_buy_floor_amount 300` · `post_buy_floor_qty 0` · 나머지 10값 그대로 → 84 뒤 「300만원」) 오늘 pass.

### AMT-04 근거

- 노트 `261011-limitchaser-amount-unit.md` · `261011-amount-eok-and-limit-evprice.md` 둘 다 `status: done` · `done_commit: 9b0ccce1`(commit 은 repo 에 존재 — `git cat-file -t` = commit). 노트 1 회신에 Q1(이번 phase 에 도입) · Q2(웹이 금액을 직접 받고 주는 제출 때 산출 · 제출 내림 · 표시 반올림 · 그룹별 비교가 · 비교가 0 이면 거부) 답이 적혀 있다.
- 「도입하면 수량 칸이 만원 입력 · 주 환산 표시」 — `LC_FIELD_RANGES`/폼 모델이 수량 8칸을 만원 키로 전환, 두 줄 행(`lcQtyRowSubOf`) · 시트 힌트(`lcAmountHintOf`) · 주문로그 ⑦ 서식(`formatQtyAmt`) 구현 확인.

### Required Artifacts / Key Links

| Artifact / Link | Status | Details |
|---|---|---|
| `packages/shared/src/lc-amount.ts` | ✓ VERIFIED | 존재 · 실질 · shared 의 relay/webapp 양쪽이 import(WIRED) |
| `relay/src/dma/envelope.ts` 조립(10 · 42) · 파서(60/64 · 84) | ✓ VERIFIED | 금액 8필드 · vtable 28 · 봉인 0 |
| `relay/src/ws/fanout.ts` — 구 탭 `user.settings.set` 84 캐시 되싣기 | ✓ VERIFIED | 캐시 없으면 거부 프레임 · 소켓 유지 |
| `relay/src/ws/fanout.ts` — 구 탭 `lc.set` 금액 부재 | ⚠️ 0 으로 조립 | WR-01 참조 |
| `buildCfg → lcSubmitQtyOf → qtyForSubmit` | ✓ WIRED | 폼 · 무장 판정 · 자동 체크 공용 |
| `limit-chaser-defaults.tsx → 42 → relay → 84` | ✓ WIRED | e2e P31-5 가 왕복 확인 |
| `relay/src/generated/*` ↔ gh-trade master | ? 외부 | AMT-01 |

### Behavioral Spot-Checks / Probes

| Behavior | Command | Result | Status |
|---|---|---|---|
| shared §10 환산 | `vitest run --maxWorkers=2 src/__tests__/lc-amount.test.ts` | 81 passed | ✓ PASS |
| relay 조립 · 파서 · fanout | `vitest run --maxWorkers=2 src/dma/__tests__/envelope.test.ts tests/fanout.test.ts` | 309 passed | ✓ PASS |
| 되싣기(P31-2) · /me 후매수 최소(P31-5) | `playwright test … --workers=1 -g "P31-(2|5)"` | 3 passed(setup 포함) | ✓ PASS |
| 전체 스위트 | 실행 안 함(요청: 전폭 금지). 오케스트레이터 · 31-VALIDATION 의 병합 트리 green 기록은 인용만 | — | ? SKIP |
| Probe 스크립트 | 이 phase 는 `probe-*.sh` 를 선언하지 않음 | — | N/A |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| AMT-01 | 31-08 | ? PENDING (외부) | gh-trade 미병합. REQUIREMENTS 표도 Pending — 체크박스 유지가 맞다 |
| AMT-02 | 31-01 · 31-04 · 31-06 · 31-07 · 31-08 | ✓ SATISFIED (WR-01 주의) | 새 탭 경로 코드 · 테스트 확인 |
| AMT-03 | 31-03 · 31-06 · 31-07 · 31-08 | ✓ SATISFIED | 42 12값 · 봉인 0 · /me 행 |
| AMT-04 | 31-01 · 31-02 · 31-04 · 31-05 · 31-06 · 31-07 · 31-08 | ✓ SATISFIED | 인박스 2건 done · 도입 구현 |

PLAN frontmatter 의 ID 4개(AMT-01~04)가 모두 REQUIREMENTS.md 에 있고, REQUIREMENTS 가 Phase 31 에 매핑한 ID 도 전부 어떤 PLAN 이 claim 한다 — **orphaned 없음**.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (이 phase 비테스트 변경 24개 파일) | — | `TBD|FIXME|XXX` grep | — | 0건 |
| `relay/src/ws/fanout.ts` / `envelope.ts` | 1981-2030 / 1716-1724 | 구 탭 `lc.set` 금액 부재 → `?? 0` | ⚠️ Warning | WR-01 |
| `webapp/.../lc-fields.ts` | 727 · 743 | 비교가 0 갈래가 에코 메모를 보기 전에 단락 | ⚠️ Warning | WR-02(표시 불일치, 발주 영향 없음) |

REVIEW 의 IN-01~IN-05 는 info — 목표를 막지 않는다(disposition 전부 `open`).

## WR-01 판정 (오케스트레이터 요청 — 목표 대비 갭인가, 수용 가능한 과도기 한계인가)

**사실 확인.** `fanout.ts` 의 `lc.set` 분기는 `buy3CfgOf` 를 통과하는 구 탭(= phase 30 이하 번들, 신필드 buy3 는 있으나 금액 8키 없음)의 `cfg` 를 그대로 `buildSetLimitChaserReq` 에 넘기고, 조립기는 `cfg.xxxAmount ?? 0` 으로 금액 8개를 0 으로 싣는다(envelope.ts:1717-1724 직접 확인). gh-trade 인계 노트대로 서버는 「0 이 오면 0 을 저장」하므로, **새 gh-trade 서버가 배포된 뒤에는** 구 탭의 어떤 칸 확정이든 C# 만원 원값을 지운다. 같은 phase 의 `user.settings.set` 은 같은 문제를 84 캐시로 막아 둔 반면 `lc.set` 만 막지 않았다(정책 비대칭). 리뷰 서술이 코드와 일치한다.

**판단: gaps_found(BLOCKER)가 아니라 WARNING(사람 결정 요청)이다.**
- ROADMAP SC2 의 문장은 「C# … 웹에서 재제출해도 60 에코의 금액 8필드가 원값 그대로」인데, 이를 만족시키는 주체는 **새 webapp 번들**이다. 새 번들 + 새 relay 경로는 코드와 e2e 로 입증됐다. 구 번들은 이번 phase 이전에도 금액을 몰랐고, 현재 라이브(구 서버 · 구 relay)에서는 지워질 값 자체가 서버에 없어 증상이 없다.
- 위험 창은 「gh-trade 새 서버 배포 ~ 구 탭이 새로고침될 때까지」다. 배포 순서(gh-trade 서버 → relay → webapp push)상 **서버가 먼저** 나가므로 그 창이 실제로 열린다(활성 트레이더 탭은 장 중 오래 열려 있고 앱 셸도 번들을 캐시할 수 있다). 따라서 「일시적이라 무시」라고 단정할 수는 없다.
- 반면 수정이 작고 안전하다: relay 는 `hub.getLimitChasers(userId)` 로 최신 에코를 이미 갖고 있고, 리뷰가 제안한 「금액 키가 없는 쌍만, 에코 주 == 보낼 주일 때 에코 금액, 아니면 0」은 인계 노트가 허용한 0 을 벗어나지 않는다.

**권고(결정은 사용자):** 이 phase 의 relay 배포 **전에** WR-01 을 고치는 것을 권한다(데이터 손실 방지 · 수정 크기 대비 이득이 크고, relay 만 바뀐다). 안 고치고 가려면 「구 탭은 서버 배포 뒤 새로고침 전까지 만원 원값 소실 가능」을 **수용된 과도기 한계로 명시 기록**해야 한다(`overrides` 로 적을 수 있으나 이 검증은 임의로 적용하지 않았다). WR-02 는 표시 문구 불일치뿐이라 목표를 막지 않는다.

## Human Verification Required

1. **AMT-01 마커 재대조** — Test: gh-trade `feature/limitchaser-amount-unit` master 병합 뒤 `merge-base --is-ancestor` exit 0 확인 → master worktree 기준 `sync-relay-schema.sh --check`. Expected: 신규/변경 0 · 마커 접두 일치(squash/rebase 면 재생성 경로 지정 커밋). Why human: 외부 저장소 병합 일정.
2. **relay 배포 + smoke** — Test: 장 시간 밖에 배포(`deploy-relay.sh`) → `scripts/smoke-relay.sh`. Expected: 라이브 `2234a1b5` → 새 태그 · smoke 통과. Why human: 분류기가 배포 차단. **배포 순서는 relay → webapp**(새 번들이 먼저 나가면 구 relay zod 가 금액 키를 떨어뜨림).
3. **Vercel 미리보기** — Test: `--skip-domain` 고유 URL 배포, 운영 배포 ID 전후 동일 확인, 상따 두 줄 행 · /me 「후매수 최소」 시각 확인(UI-REVIEW 의 685 폭 여유 0.4px · S3/S4/S6 포함). Why human: 시각 · 배포.
4. **gh-trade 서버 배포 뒤 실증** — Test: C# 만원 입력 종목을 웹 재제출 · /me 후매수 최소 저장. Expected: Cloud Logging `relay_docker` 60 에코 `sell_watch_amount` 원값 유지, 84 `post_buy_floor_amount` 저장값, `post_buy_floor_qty` 0. Why human: 실서버 의존.
5. **WR-01 처리 결정** — 고친 뒤 배포(권고) vs 수용 과도기로 기록. Why human: 위험 수용 여부는 소유자 판단.

## Gaps Summary

코드 · 계약 · 단위/e2e 증거 기준 gap 은 없다(`gaps: []`). phase 를 「완료」로 닫지 못하게 하는 것은 (a) AMT-01 이 gh-trade master 병합에 묶여 있는 점, (b) relay · Vercel 배포가 사용자 손에 남은 점, (c) 실서버 왕복 확인, (d) WR-01 처리 결정이다. 모두 코드로 해소되지 않는 항목이거나 사용자 결정이라 `human_needed` 로 둔다. ROADMAP 의 SC1 은 현재 시점에 **충족되지 않은 상태**이며 다른 phase 로 deferred 할 근거도 없다 — gh-trade 병합 후 재대조가 필요하다.

---

_Verified: 2026-10-12T08:30:00Z_
_Verifier: Claude (gsd-verifier)_
