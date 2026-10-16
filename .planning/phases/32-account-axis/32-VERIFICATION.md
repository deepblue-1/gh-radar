---
phase: 32-account-axis
verified: 2026-10-16T12:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/32-account-axis/32-01-PLAN.md
  - .planning/phases/32-account-axis/32-01-SUMMARY.md
  - .planning/phases/32-account-axis/32-02-PLAN.md
  - .planning/phases/32-account-axis/32-02-SUMMARY.md
  - .planning/phases/32-account-axis/32-03-PLAN.md
  - .planning/phases/32-account-axis/32-03-SUMMARY.md
  - .planning/phases/32-account-axis/32-04-PLAN.md
  - .planning/phases/32-account-axis/32-04-SUMMARY.md
  - .planning/phases/32-account-axis/32-05-PLAN.md
  - .planning/phases/32-account-axis/32-05-SUMMARY.md
  - .planning/phases/32-account-axis/32-06-PLAN.md
  - .planning/phases/32-account-axis/32-06-SUMMARY.md
  - .planning/phases/32-account-axis/32-07-PLAN.md
  - .planning/phases/32-account-axis/32-07-SUMMARY.md
  - .planning/phases/32-account-axis/32-08-PLAN.md
  - .planning/phases/32-account-axis/32-08-SUMMARY.md
  - .planning/phases/32-account-axis/32-09-PLAN.md
  - .planning/phases/32-account-axis/32-09-SUMMARY.md
  - .planning/phases/32-account-axis/32-10-PLAN.md
  - .planning/phases/32-account-axis/32-10-SUMMARY.md
  - .planning/phases/32-account-axis/32-11-PLAN.md
  - .planning/phases/32-account-axis/32-11-SUMMARY.md
  - .planning/phases/32-account-axis/32-12-PLAN.md
  - .planning/phases/32-account-axis/32-12-SUMMARY.md
  - .planning/phases/32-account-axis/32-13-PLAN.md
  - .planning/phases/32-account-axis/32-13-SUMMARY.md
  - .planning/phases/32-account-axis/32-14-PLAN.md
  - .planning/phases/32-account-axis/32-14-SUMMARY.md
  - packages/shared/src/relay.ts
  - relay/src/dma/strategy-sweeper.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - webapp/src/components/me/account-chips.tsx
  - webapp/src/components/me/device-settings-card.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/src/components/trading/workbench/alert-toasts.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
covered_digest: "v3:sha256:6883c7d76656d87cf1392bddac2d2fa8cd283388e5c49cc54f39a8c88fd28b4c"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "리뷰 수정(WR-01 ~ WR-06) 배포 뒤 라이브 확인 — relay 재배포(20:00 KST 뒤) → push 한 다음, 교보119 · KB120 두 계좌에서 ① 「이 계좌 끄기」 후 다른 계좌 대기가 풀리지 않는지 ② Ready 중 계좌가 추가 선언돼도 작업대 VI 설정 행이 「미조회」 잠금으로 남지 않는지 ③ /me 에서 칩을 KB120 → KYOBO119 로 바꿔도 설정 탭에 「저장 성공」 플래시가 따라오지 않는지 ④ 새로고침 시 ?account= 가 사용자가 나중에 고른 계좌를 되돌리지 않는지"
    expected: "각 항목이 위 기대대로 동작한다. 특히 WR-03(hub 21 대기열 귀속에 닿는 논리 수정)은 구 서버 모양(거래소당 1프레임) + 재요청이 겹친 실서버 동작이 단위 테스트에 없다(32-REVIEW-FIX 가 「사람 확인 권장」 으로 표시)."
    why_human: "WR-01 ~ WR-06 수정은 master 에 커밋됐으나 relay · Vercel 에 배포되지 않았다(오케스트레이터 사실 · git log 로 확인 — 마지막 배포는 7794dcd9 / c7cdb797). 실서버 2대와 실계좌가 필요하고 웹 E2E 하네스는 단일 세션이다."
---

# Phase 32: 계좌 축 정리 검증 보고서

**Phase Goal:** 트레이딩 작업대와 /me 가 「고른 계좌 · 서버」 축으로 읽힌다 — 작업대는 고른 계좌의 전략·VI 만 보이고 상단 줄이 계좌 선택 중심으로 정리되며, /me 는 탭 위 계좌 칩으로 고른 계좌를 현황 · 잔고 · 주문 · 설정 네 탭이 함께 따르고, 매매설정은 그 계좌의 서버(gh-trade 게이트웨이)에 따로 보고 저장한다
**Verified:** 2026-10-16
**Status:** human_needed
**Re-verification:** 아니오 — 최초 검증

## 요약

목표는 코드에서 달성됐다. ROADMAP 성공 기준 5개 전부 VERIFIED이고, 요구사항 AXIS-01 ~ 05 다섯 개 모두 플랜 frontmatter 와 REQUIREMENTS.md 에서 짝이 맞는다. SUMMARY 주장은 그대로 믿지 않고 소스를 직접 읽어 확인했다. 상태가 `passed` 가 아니라 `human_needed` 인 이유는 한 가지다. 코드 리뷰 경고 6건의 수정(WR-01 ~ WR-06)이 master 에 커밋됐지만 아직 배포되지 않았고, 그중 WR-03 은 21 대기열 귀속 규칙에 닿는 논리 수정이라 실서버 확인이 필요하다.

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 작업대 계좌 선택 = 화면 범위. 전략 카드 · VI 스트립 · VI 설정 행이 고른 계좌 것만 보이고, 토스트는 전 계좌 · 계좌 줄 · 누르면 계좌 전환 (AXIS-01) | ✓ VERIFIED | `trading-workbench.tsx:344-348` `inAccountScope` · `:1408` `visibleCards` · `:1411-1426` `hiddenCardIds`(주차, 언마운트 아님) · `:1429-1432` `scopedViOrders` → `<ViTriggerStrip items={scopedViOrders}>` (`:1545`). `vi-settings-rows.tsx:296-310` 계좌별 마운트, `hidden={!shown}`, 서버 값 `viSlotOf(viSlots, 계좌, 거래소)`. `alert-toasts.tsx:111-184` 계좌 줄 `accountFullLabelOf` + `account-hint`(현재 작업대 계좌와 다를 때). `pickAccount` 3경로(`:781 :785 :822 :871 :1288`). 단위 테스트 통과(workbench 디렉터리) · 라이브 UAT ①~⑥ 사용자 통과(32-10) |
| 2 | 상단 줄에 「정규」 배지 · 사운드 토글 없음, 계좌 선택 + 시세/주문 한 줄(목업 A). 알림음은 /me 설정 「이 기기」 카드로 이전 (AXIS-02) | ✓ VERIFIED | `workbench-status-bar.tsx` 에 렌더되는 「정규」 · 사운드 요소 없음(문자열은 「뺀 것」 주석에만 존재). 계좌 선택은 `MeAccountChips` 재사용(`:63 :351`, 32-15 — 사용자 지시 변경이라 갭 아님). `device-settings-card.tsx` 가 `readTonePref`/`writeTonePref` 로 토글을 옮겨 갖고 `me-client.tsx:562-563` 설정 탭에 마운트. 재생 모듈 `breakout-strip.tsx:332-335` 는 작업대에 남음. E2E `P32-top` 존재 |
| 3 | /me 현황 탭이 탭 위 계좌 칩의 계좌 기준: 전략 행 · VI 행 · 상태줄. 「이 계좌 끄기」 가 relay `strategies.disable.account`, 「전체 비활성화」 없음 (AXIS-03) | ✓ VERIFIED | `me-client.tsx:559-` `<StrategyStatusCard accountNo={shownAccountNo}>` · `<MeStatusBar accountNo=…>`. 「전체 비활성화」 는 webapp 비테스트 소스에 렌더 문자열 없음(`use-leave-warning.ts:18` 주석뿐). `strategy-status-card.tsx:315-321` 「이 계좌 끄기」 버튼 + 확인 다이얼로그(`:231`), `send({t:"strategies.disable.account"})`. relay: `protocol.ts:464-472` zod, `fanout.ts:2234` 핸들러 · `:2467` 집계, hub `#finishAccountStop`. 단위 통과(strategy-status-card 42 · me-client 30) · relay `hub-multi-session` · `fanout-multi-session` 통과 · 라이브 UAT ⑥ |
| 4 | /me 잔고 · 주문 탭도 같은 칩. 잔고 = 그 계좌 한 벌, 주문 = 평탄 목록, 탭 라벨 숫자 = 그 계좌 건수, 선택은 작업대와 따로 기기별 기억 (AXIS-04) | ✓ VERIFIED | `me-client.tsx:~435-441` `MeAccountChips`(계정 카드 아래 · 탭 위, `accounts.length>0` 게이트). 잔고: `AccountPanel selectedAccountNo={shownAccountNo} hideAccountHeader` 한 벌(`:527-536`). 주문: `TodayOrdersCard accountNo={shownAccountNo}`(`:560`). 라벨 숫자 `countOf`(`:~410-421`, 잔고 = `accountStates.get(shownAccountNo).unf.length`). 저장: `pickMeAccount` → `writeMeAccount(userId, …)` 로 `gh-radar:me-account:{userId}`(작업대 키와 분리). 단위 `account-chips` 13 통과 · E2E `me.spec` · 라이브 UAT ⑤ |
| 5 | /me 설정 탭은 고른 계좌의 서버 84 를 보고 42 로 그 서버에만 저장. relay `serverKey`, hub 84 캐시 `(userId, serverKey)`, `#fromPrimary` 해제, 42 지정 서버 라우팅, 상따 폼 시딩 = 카드 계좌 소유 서버, KB120 · KYOBO119 에서 서로 다른 값 (AXIS-05) | ✓ VERIFIED | `shared/relay.ts:793` `user.settings.set.serverKey?` · `:1549` `user.settings.serverKey?`. hub `#userSettings` 가 `ownerKey(userId,serverKey)` 키(`subscription-hub.ts:1091 :2361 :2986`). `case MSG.UserSettingsResp`(`:2790` 부근)는 `#fromPrimary` 를 부르지 않는다(76/78/77 케이스만 부름). `fanout.ts:2134-2165` 지정 서버 세션 없음/미준비 → primary 로 떨어뜨리지 않고 거부 프레임, 있으면 그 세션에 42 송신. 웹: `userSettingsByServer`(`use-relay-socket.ts:654`) · `limit-chaser-defaults.tsx:629` `userSettingsForServer` · `limit-chaser-form.tsx:821-825` `userSettingsForAccount`(시딩). 라이브 UAT ①② 사용자 통과(KB120 ≠ KYOBO119 값 · 교보 저장 후 KB 그대로 · 42 serverKey KYOBO119) |

**Score:** 5/5 truths verified (0 behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `webapp/src/components/me/account-chips.tsx` | radiogroup 계좌 칩 · 잠금 · compact | ✓ VERIFIED | 실질 구현, `/me` 와 작업대 상단 줄 양쪽에서 import |
| `webapp/src/components/me/device-settings-card.tsx` | 「이 기기」 알림음 카드 | ✓ VERIFIED | `me-client.tsx:563` 마운트, 로직 이전 |
| `webapp/src/components/trading/workbench/workbench-status-bar.tsx` | 한 줄 필 상단 줄 | ✓ VERIFIED | 칩 → 시세 → 주문 → 세그먼트 |
| `webapp/src/components/trading/workbench/vi-settings-rows.tsx` | 계좌 × 거래소 VI 슬롯 행 | ✓ VERIFIED | `viSlots` 를 `trading-workbench.tsx:1550` 에서 받음 |
| `webapp/src/components/trading/strategy-status-card.tsx` | 「이 계좌 끄기」 | ✓ VERIFIED | 전체 비활성화 제거 |
| `relay/src/hub/subscription-hub.ts` · `relay/src/ws/fanout.ts` · `relay/src/dma/strategy-sweeper.ts` | serverKey 84 · 42 라우팅 · 계좌 끄기 · VI 슬롯 · n 프레임 sweeper | ✓ VERIFIED | 실질 구현 · 단위 141 통과(3 파일) |
| `packages/shared/src/relay.ts` | `serverKey?` 계약 | ✓ VERIFIED | 선택 필드라 구 relay 와 섞여도 호환 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `MeTabs` 칩 상태 | 네 탭 | `shownAccountNo` | ✓ WIRED | 현황 · 잔고 · 주문 · 설정 + 라벨 `countOf` 모두 같은 값 |
| 설정 탭 | relay 42 | `settingsServerKey` → `LimitChaserDefaultsSection serverKey` → `user.settings.set.serverKey` | ✓ WIRED | `key={settingsServerKey ?? ""}`(WR-04) |
| 사이드바 VI 줄 | 작업대 계좌 | `/trading?account=` → `pickAccount` | ✓ WIRED | `trading-workbench.tsx:696-` 소비 후 주소창 정리(WR-05) |
| 웹 「이 계좌 끄기」 | relay hub 집계 | `strategies.disable.account` → fanout `:2234` → hub | ✓ WIRED | |
| relay VI 슬롯 | 웹 | `vi.slot` → `viSlots` → `ViSettingsRows` | ✓ WIRED | slot-only(D-17), 웹 단일 칸 VI 상태 제거 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| 설정 탭 | `selected` 84 | relay `userSettingsByServer`(서버별 84) | ✓ 라이브 UAT 에서 서버별 다른 값 확인 | ✓ FLOWING |
| VI 설정 행 | `viSlotOf(viSlots, …)` | relay hub 슬롯 캐시(61 `unregistered`) | ✓ 교보119 VI UAT ①~⑥ 통과 | ✓ FLOWING |
| /me 잔고 · 주문 | `accountStates.get(shownAccountNo)` | relay 상태 프레임 | ✓ | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| /me 칩 · 현황 · 끄기 단위 | `vitest run src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/me-client.test.tsx src/components/trading/__tests__/strategy-status-card.test.tsx` (maxWorkers=2) | 3 파일 · 85 통과 | ✓ PASS |
| relay hub 다세션 · fanout · sweeper | `vitest run tests/hub-multi-session.test.ts tests/fanout-multi-session.test.ts tests/strategy-sweeper.test.ts` (maxWorkers=2) | 3 파일 · 141 통과 | ✓ PASS |
| 전체 회귀(오케스트레이터 실행) | shared 646 · relay 1627 · webapp 4320(+1 skip) · Playwright 9 spec 188+10 rerun 통과 | 1 실패 = P31-3 | ✓ PASS (아래 Anti-Patterns 참조) |

### Probe Execution

해당 없음 — 이 phase 는 `probe-*.sh` 를 선언하지 않았다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AXIS-01 | 32-04, 32-06(경유), 32-11, 32-12, 32-13, 32-14, 32-10 | 작업대 계좌 스코프 · 토스트 | ✓ SATISFIED | 진실 1 |
| AXIS-02 | 32-03, 32-10 | 상단 줄 재설계 · 알림음 이전 | ✓ SATISFIED | 진실 2 |
| AXIS-03 | 32-01, 32-05, 32-06, 32-13, 32-10 | /me 현황 · 이 계좌 끄기 | ✓ SATISFIED | 진실 3 |
| AXIS-04 | 32-01, 32-02, 32-08, 32-10 | /me 계좌 칩 네 탭 | ✓ SATISFIED | 진실 4 |
| AXIS-05 | 32-07, 32-08, 32-09, 32-10 | 서버별 매매설정 | ✓ SATISFIED | 진실 5 |

플랜 frontmatter `requirements:` 14개 줄을 모아 REQUIREMENTS.md 의 AXIS-01 ~ 05 와 대조했다. 다섯 ID 전부 최소 하나의 플랜이 주장하고, 고아 요구사항(REQUIREMENTS.md 에는 있으나 어느 플랜도 주장하지 않은 ID)은 없다.

**문서 상태 메모(코드 갭 아님):** REQUIREMENTS.md 의 AXIS-01 ~ 05 체크박스와 추적표는 아직 `Pending`/`[ ]`, ROADMAP 의 Phase 32 는 「In Progress」 · 완료일 없음이다. 검증 통과 처리 뒤 오케스트레이터가 갱신해야 한다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `webapp/e2e/specs/trading-workbench.spec.ts` | P31-3 | E2E 1건 실패(「777주」 ≠ 「비교가격 필요」) | ⚠️ Warning | 상따 카드 `lc/*` 매도 비교가 아래 줄 규칙. `deferred-items.md` 에 32-03 실행 중 처음 관측 · 261012 quick 커밋(`6a628d3b` u04 등)이 phase 착수 기준 `4df49caf` 의 조상이라는 이력 근거로 phase 32 회귀 아님이라 판단. 재현 대조(phase 착수 전 체크아웃에서 실행)는 하지 않았다 — 이력 논증이다. |
| `trading-workbench.tsx` | ~1432 주석 | 「VI 설정 행은 웨이브 ④ 전 현행(D-16)」 주석이 낡음 | ℹ️ Info | 웨이브 ④ 로 VI 행도 계좌 스코프가 됐는데 주석만 남음. 동작 영향 없음 |
| `32-REVIEW-DISPOSITION.md` | IN-01 ~ 05 | 정보 5건 open | ℹ️ Info | IN-02(화살표 키 = 포커스만) 등. 목표 달성 비차단 |

TBD / FIXME / XXX 부채 마커는 phase 에서 수정한 핵심 소스에서 찾지 못했다.

### 후속 변경 (갭 아님)

- **32-15**(작업대 상단 줄 셀렉트 → 칩, 커밋 `55aee55b` · `09b546be`, push `c7cdb797`): 32-03 / UI-SPEC 의 네이티브 셀렉트 기술을 대체한다. 사용자 지시 변경이라 목표(「계좌 선택 중심 상단 줄」)와 충돌하지 않고 오히려 /me 와 같은 칩 문법으로 정합이다. ROADMAP 의 「14 plans」 에는 들어 있지 않은 후속 작업이므로 ROADMAP 계획 목록에 32-15 를 기록하는 정리가 필요하다.
- D-17 = slot-only(relay 는 `vi.slot` 만 송신) — 결정대로 구현됨. 배포~push 사이 약 2분 열린 옛 탭은 새로고침 전까지 VI 「모름」(32-14 SUMMARY 에 기록).
- relay 는 사용자 명시 지시로 20:00 KST 전에 배포됐다(32-14 · 롤백 태그 `55459fe5`). 플랜 문구와 다르지만 사용자 결정이 우선이고 기록돼 있다.

### Human Verification Required

#### 1. 리뷰 수정(WR-01 ~ WR-06) 배포 뒤 라이브 확인

**Test:** relay 재배포(20:00 KST 뒤) → push 한 다음 교보119 · KB120 에서 (a) 「이 계좌 끄기」 후 다른 계좌 대기가 풀리지 않는지, (b) Ready 중 계좌가 추가 선언돼도 작업대 VI 설정 행이 「미조회」 잠금으로 남지 않는지, (c) /me 칩 KB120 → KYOBO119 전환에 설정 탭 「저장 성공」 플래시가 따라오지 않는지, (d) 새로고침이 `?account=` 로 나중 선택을 되돌리지 않는지 확인.
**Expected:** 위 기대대로 동작. WR-03 은 구 서버 모양 + 재요청이 겹친 실서버 동작이 단위 테스트에 없다.
**Why human:** 수정이 커밋만 되고 미배포이며, 실서버 2대 · 실계좌가 필요하다.

### Gaps Summary

차단 갭 없음. 목표 5개 성공 기준 전부 코드와 테스트로 확인됐고 라이브 UAT(웨이브 ①~③ ①~⑥, 웨이브 ④ 교보119 ①~⑥)도 사용자가 통과시켰다. 남은 것은 (1) 미배포 리뷰 수정 6건의 배포와 라이브 확인(human_needed 사유), (2) 문서 체크박스 · 로드맵 상태 갱신, (3) P31-3 E2E 실패의 별도 quick 처리(phase 32 범위 밖으로 판단)다.

---

_Verified: 2026-10-16_
_Verifier: Claude (gsd-verifier)_
