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
covered_digest: "v3:sha256:03e97261ce0e1e71671b7b067b59912358879fd8d51491a513a2d02a0c4d6414"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 3/4
  gaps_closed:
    - "SC1 / AMT-01 — gh-trade feature/limitchaser-amount-unit 이 master 에 병합됨 (merge-base --is-ancestor exit 0), 마커 일치"
    - "이전 WR-01(구 탭 lc.set 금액 부재 → 0) — relay fanout #withEchoAmounts 로 닫힘"
    - "이전 behavior_unverified 1건(실서버 왕복) — 31-UAT.md test 3 pass"
  gaps_remaining: []
  regressions: []
human_verification_resolved:
  source: ".planning/phases/31-limitchaser-amount-unit/31-UAT.md"
  commit: "edfc50df"
  result: "4/4 pass (relay 배포+smoke · 웹 화면 확인 · 실서버 60 에코 sell_watch_amount 원값 유지 / 84 post_buy_floor_amount · AMT-01 재대조)"
gaps: []
advisory:
  - finding: "R3-WR-01 — IN-02 수정(cc92581d) 뒤, 금액을 아는 서버에서 옛 푸시(금액 0 · 같은 주)가 먼저 오면 같은 주로 내림되는 미세 조정이 거짓 rejected 로 보일 수 있음"
    category: other
    reason: "확정 성공/실패 표시(commit-success signalling)의 좁은 경우. C# 만원 원값 보존(목표 문장)과 무관 — 발주/저장 값에 영향 없고 다음 진짜 에코가 성공으로 되돌린다. disposition open 상태 유지(31-REVIEW-DISPOSITION-R3.md)"
    evidence_status: "리뷰 서술을 코드(shared/src/lc-amount.ts amountEchoMatches · echoKnowsAmounts)와 대조해 일치 확인; 목표 대비 비차단으로 판정"
    resolved_by: "b977002f — 모호한 에코(주 일치 · 금액 0 · 금액을 아는 서버)는 거부 대신 LC_REJECT_ECHO_GRACE_MS 유예. shared lc-amount 84 · webapp trading/me/lib 3097 테스트 통과, webapp/relay tsc 0. covered_digest 는 이 수정 뒤 재계산"
---

# Phase 31: 인박스 상따 금액 단위 Verification Report (재검증 2차)

**Phase Goal:** 웹에서 상따를 재제출해도 C# 단말 칸에 사람이 넣은 만원 원값이 지워지지 않고, /me 기본설정에서 「후매수 최소」 금액을 보고 바꿀 수 있다
**Verified:** 2026-10-12 (재검증 · master HEAD edfc50df 기준, 소스 변경은 7fd6d0b5 병합까지 반영)
**Status:** passed
**Re-verification:** Yes — 이전 31-VERIFICATION.md(human_needed, 3/4)가 리뷰 수정 라운드(d023526f … 251cf2f0)와 quick-261012-mig(708c4772 · ef9e5173) 뒤 stale 이 되어 현재 코드로 다시 확인

## 한 줄 판정

네 must-have(AMT-01~04)가 모두 현재 코드/외부 저장소 상태로 확인됐고, 이전에 사람 몫으로 남았던 항목 전부가 31-UAT.md(4/4 pass, edfc50df)로 해소됐다. 이전 WR-01(구 탭 되싣기)은 코드로 닫혔다. 남은 것은 비차단 advisory 뿐이다.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 (AMT-01) | `sync-relay-schema.sh --check` 가 gh-trade **master** 병합 마커 기준 「신규/변경 0 · .fbs 사본 최신」 | ✓ VERIFIED | 직접 재실측: `git -C gh-trade merge-base --is-ancestor feature/limitchaser-amount-unit master` → exit 0. gh-trade master = origin/master. `server/src/protocol/StockDMA.fbs` · `client/.../StockDMA.fbs` 의 master 마지막 커밋 = `e5b4fbca`(`git cat-file -t` commit, master 조상) = `relay/src/generated/StockDMA.fbs:3` 마커 `server-repo-commit: e5b4fbca`. `--check` exit 0 은 오케스트레이터 실측(2026-10-12 17:0x)과 UAT test 4 로 승계(재생성 불필요) |
| 2 (AMT-02) | 웹 재제출 시 60 에코 금액 8필드가 원값 그대로, 주를 바꾸면 짝이 맞는 금액 또는 0 | ✓ VERIFIED | 아래 「AMT-02 근거」. 실서버 경로는 UAT test 3 pass(60 에코 `sell_watch_amount` 원값 유지) |
| 3 (AMT-03) | /me 「후매수 최소(만원)」가 84 값으로 보이고 저장 시 42 12값 전체 교체 · 84 `post_buy_floor_amount` 반영 · `post_buy_floor_qty` 0 | ✓ VERIFIED | 아래 「AMT-03 근거」. UAT test 3 에서 실서버 84 `post_buy_floor_amount` 확인 |
| 4 (AMT-04) | 「만(주)」 도입 여부가 인박스 노트 질문 2개 답으로 적히고 `status: done` · `done_commit` — 도입 시 수량 칸 만원 입력 · 주 환산 표시 | ✓ VERIFIED | 아래 「AMT-04 근거」 |

**Score:** 4/4 truths verified. `behavior_unverified: 0` — 이전 report 의 실서버 왕복 항목은 UAT test 3 으로 실증됐다.

### AMT-02 근거 (현재 코드 직접 확인)

- `packages/shared/src/lc-amount.ts` — `LC_AMOUNT_PAIRS` 8쌍, `qtyForSubmit`(칸 · 비교가가 에코와 같으면 에코 주, 아니면 내림 환산), `echoAmountOf`, `amountEchoMatches`(IN-02 이후: 금액을 아는 서버의 에코 금액 0 은 관용하지 않음), `echoKnowsAmounts`. 스텁 아님.
- `relay/src/dma/envelope.ts:1708-1720` — SetLimitChaser 조립이 금액 8필드 `addBuyWatchAmount … addCancelWatchAmount` 를 실제로 싣는다(`?? 0` 은 구 탭 부재 폴백, 새 탭 값은 그대로).
- `webapp/.../limit-chaser-form.tsx` `buildCfg` — `...values` 로 금액을 싣고 쌍마다 `lcSubmitQtyOf` 주를 같이 싣는다(조립 지점 하나).
- **이전 WR-01 폐쇄 확인:** `relay/src/ws/fanout.ts:1996-1997` `cfg = this.#withEchoAmounts(userId, cfg)` + 2642~ 정의 — 금액 키가 없는 쌍만 최신 에코(`getLimitChasers`)의 원값으로, 주/비교가 짝이 어긋나면 0 으로 채운다(R2-IN-01 비교가 일치 조건 포함). 구 탭 `lc.set` 이 C# 원값을 0 으로 덮던 경로가 닫혔다. 새 탭이 보낸 0 은 그대로 간다.
- 행동 증거(오늘 직접 실행): shared `lc-amount` 83 passed · relay `envelope.test.ts`+`fanout.test.ts` 314 passed · webapp `limit-chaser-form`+`lc/`+`me/` 11 파일 735 passed · e2e `P31-2`(스텁 게이트웨이가 디코드한 10 의 금액 8필드 = 에코 원값, 구 서버 에코는 역산) pass.

### AMT-03 근거

- `webapp/src/components/me/limit-chaser-defaults.tsx:96` 행 `postBuyFloorAmount`(「후매수 최소」·만원), `usableUserSettingsOf` 가 금액 키 없는 84(구 relay)를 「불러오는 중」으로 접음(199~206), 저장은 12값 + `postBuyFloorQty: 0`.
- `relay/src/dma/envelope.ts:2073-2080` — `addPostBuyFloorQty(b, 0)` 봉인 + `addPostBuyFloorAmount`; 84 파서 `postBuyFloorAmount: u.postBuyFloorAmount()`(811) / 60·64 에코 파서(2646).
- e2e `me.spec.ts:1516 P31-5`(84 → 「84만원」 → 300 확정 → 42 `post_buy_floor_amount 300` · `post_buy_floor_qty 0` · 나머지 10값 그대로 → 84 뒤 「300만원」) 오늘 pass.

### AMT-04 근거

- 인박스 노트 `docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md` 프런트매터 `status: done` · `done_commit: 9b0ccce1`(`git cat-file -t` = commit). (노트 2건 모두 done — 이전 report 확인 유지.)
- 수량 8칸 만원 입력 · 두 줄 행 · 시트 환산 안내 · 주문로그 ⑦ 서식 구현은 form/lc 테스트 735 pass 와 UAT test 2(화면 확인 pass)로 입증.

### Required Artifacts / Key Links

| Artifact / Link | Status | Details |
|---|---|---|
| `packages/shared/src/lc-amount.ts` | ✓ VERIFIED | 실질 · relay/webapp 양쪽 import(WIRED) |
| `relay/src/dma/envelope.ts` 조립(10 · 42) · 파서(60/64 · 84) | ✓ VERIFIED | 금액 8필드 · 봉인 0 |
| `relay/src/ws/fanout.ts` — `user.settings.set` 84 캐시 되싣기 / `lc.set` `#withEchoAmounts` | ✓ VERIFIED | 두 경로 모두 구 탭 부재를 0 으로 덮지 않음 |
| `buildCfg → lcSubmitQtyOf → qtyForSubmit` | ✓ WIRED | 폼 · 무장 판정 · 자동 체크 공용 |
| `limit-chaser-defaults.tsx → 42 → relay → 84` | ✓ WIRED | e2e P31-5 · UAT 왕복 |
| `relay/src/generated/*` ↔ gh-trade master | ✓ WIRED | 마커 `e5b4fbca` = master FBS 마지막 커밋 |

### Behavioral Spot-Checks / Probes

| Behavior | Command | Result | Status |
|---|---|---|---|
| shared §10 환산 | `vitest run --maxWorkers=2 src/__tests__/lc-amount.test.ts` | 83 passed | ✓ PASS |
| relay 조립 · 파서 · fanout | `vitest run --maxWorkers=2 src/dma/__tests__/envelope.test.ts tests/fanout.test.ts` | 314 passed | ✓ PASS |
| webapp 폼 · lc · /me | `vitest run --maxWorkers=2 …limit-chaser-form.test.tsx src/components/trading/lc src/components/me` | 11 files, 735 passed | ✓ PASS |
| 되싣기(P31-2) · /me(P31-5) | `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts -g "P31-(2|5)" --workers=1` | 3 passed | ✓ PASS |
| 전체 스위트 | 재실행 안 함 — 오케스트레이터 실측 인용(relay 1552 · webapp 4019+1 skipped · shared 645 all pass, 2026-10-12 17:2x KST) | — | 인용 |
| Probe 스크립트 | 이 phase 는 `probe-*.sh` 를 선언하지 않음 | — | N/A |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| AMT-01 | 31-08 | ✓ SATISFIED | gh-trade 병합 · 마커 일치 · UAT test 4 |
| AMT-02 | 31-01 · 31-04 · 31-06 · 31-07 · 31-08 | ✓ SATISFIED | 새 탭 + 구 탭 되싣기 코드/테스트 · UAT test 3 |
| AMT-03 | 31-03 · 31-06 · 31-07 · 31-08 | ✓ SATISFIED | 42 12값 · 봉인 0 · /me 행 · UAT test 3 |
| AMT-04 | 31-01 · 31-02 · 31-04 · 31-05 · 31-06 · 31-07 · 31-08 | ✓ SATISFIED | 인박스 노트 done · 도입 구현 · UAT test 2 |

PLAN frontmatter 의 ID 4개(AMT-01~04)가 모두 REQUIREMENTS.md 에 있고(22~25행), REQUIREMENTS 의 Phase 31 매핑(58~61행)도 전부 어떤 PLAN 이 claim 한다 — orphaned 없음. 참고: REQUIREMENTS.md 체크박스/표는 여전히 `[ ]`/Pending 이다 — 완료 처리(phase complete)는 오케스트레이터 몫이며 이 검증은 수정하지 않았다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| 이 phase 소스 9개 파일 | — | `TBD|FIXME|XXX` grep | — | 0건 |
| `packages/shared/src/lc-amount.ts` / `use-lc-field-commit.ts` | 148-174 / 892-930 | R3-WR-01 거짓 rejected 가능(좁은 경우) | ℹ️ Advisory | 아래 판정 |
| 그 외 R3-IN-01~04 | — | 테스트 공백 · 주석 정확도 · 문서 갱신 | ℹ️ Info | 목표 무관 |

## R3-WR-01 판정 (목표 대비)

코드 대조 결과 리뷰 서술이 맞다: `amountEchoMatches` 는 금액을 아는 서버(`echoKnowsAmounts`)의 에코 금액 0 을 더는 관용하지 않으므로, 답 신호(`answerSeq`)가 먼저 서고 에코가 옛 푸시(금액 0 · 같은 주)이면 같은 주로 내림되는 미세 조정이 일시적으로 `rejected` 표시가 될 수 있다. 그러나 이 현상은 **확정 성공/실패 표시**에 관한 것이며,
- 발주/저장되는 값(금액 8필드 · 주)은 바뀌지 않고, C# 만원 원값 보존(AMT-02 목표 문장)과 /me 후매수 최소(AMT-03)에 닿지 않는다.
- 이어서 진짜 에코가 오면 늦은 에코 규칙(③)이 성공으로 되돌린다 — 자기 치유 경로가 있다.
- 범위가 「옛 푸시 주 == 보낸 주」 미세 조정으로 좁고, 주가 다른 확정은 수정 전에도 같은 동작이었다.

따라서 **비차단 advisory** 로 기록한다(목표 미달 아님). 처리는 `/gsd-code-review 31 --fix` 또는 quick(권고 (a) 유예 타이머 또는 (b) 알려진 한계 수용). R3-IN-01~04 도 disposition `open` 유지, 모두 목표를 막지 않는다.

## Human Verification

없음 — 이전 report 의 5개 항목은 31-UAT.md(edfc50df) 4/4 pass 와 코드 수정(WR-01)으로 모두 해소됐다 (`human_verification_resolved` 참조).

## Gaps Summary

gap 없음. SC1~SC4 모두 충족.

---

_Verified: 2026-10-12_
_Verifier: Claude (gsd-verifier)_
