---
phase: quick-261103-n1s
plan: 01
subsystem: relay · shared · webapp(상따 · /me)
status: complete
tags: [limit-chaser, sell-risk, buy3-schema-8, change-mask, user-settings, sor, gh-trade-handoff]
requires:
  - gh-trade e96aef6e (quick-261103-l41) StockDMA.fbs
provides:
  - relay buy3_schema 8 (sell_risk_enabled · sell_risk_pct) 송수신
  - 변경 마스크 비트 52 · 53
  - UserSettings 84/42 sell_risk_pct
  - 상따 매도주문 ☐위험도 [N]% 행 · 매도주문 OFF 동반 끔
  - 상한가 표 매도 SOR 「위험도(합)」
  - /me 「위험도 기준」
affects: [relay/src/dma/envelope.ts, packages/shared/src/relay.ts, webapp 상따 카드 · /me]
tech-stack:
  added: []
  patterns: [okd schema 7 복제(단조성 파생 + 미달 경고) · epl optional UserSettings(84 부재 0 → 표시 기본 · 42 미적재)]
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - relay/src/generated/stock-dma/user-settings.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/lc-change-mask.ts
    - packages/shared/src/limit-feature.ts
    - packages/shared/src/index.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/lc-ranges.ts
    - webapp/src/lib/user-settings-server.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/card/strategy-card.tsx
    - webapp/src/components/trading/card/card-tabs.tsx
    - webapp/src/components/trading/card/limit-feature-table.tsx
    - webapp/src/components/me/limit-chaser-defaults.tsx
decisions:
  - "buy3_schema 8 은 앞 일곱 조건 + sellRiskEnabled · sellRiskPct 둘 다일 때만 — 미달이면 낮은 schema · 위험도 미적재 · warn(okd 꼴)"
  - "sell_risk_pct 는 ushort — toWireUShort(USHORT_RANGE) 새 가드"
  - "에코 sellRiskPct 0(구서버)은 폼 칸 유지 · isMasterOnlyDelta 비교에서 제외(D-02 자동 끔 영구 억제 방지)"
  - "VALUE_COMPARE_SKIP 에 sellRiskEnabled(서버 런타임 OFF 를 「서버 반영 완료」 로 오귀속하지 않음) · sellRiskPct 는 설정값이라 비교 유지"
  - "84/42 sellRiskPct 의 웹 운반(sellRiskPctOf · userSettingsValuesOf 조건부 스프레드 · shown 메모)을 T1 커밋으로 당김 — webapp typecheck 가 T1 에서 요구(epl 선례도 같은 커밋)"
  - "위험도(합) 짝 85 는 strategy-card 가 짝 거래소 키 full 구독으로 받는다(sorSell ∧ 펼침일 때만) — relay 무변경"
metrics:
  duration: "약 1시간 40분"
  completed: 2026-11-03
estimate:
  tokens: 140000
  tasks: 3
actuals:
  tokens: 43600
  tasks: 3
  commits: 4
plan_head_before: 52591a3a93abb03edfeffb2a8552049f9e89f39b
plan_head_after: 107014594648b5b73e1c12c43268fe52a4f1f574
---

# Quick 261103-n1s: 상따 매도 ☐위험도 [N]% — relay buy3_schema 8 · 웹 반영 Summary

gh-trade quick-261103-l41(e96aef6e)의 상따 매도 ☐위험도를 relay `buy3_schema` 8(sell_risk_enabled vt 180 · sell_risk_pct vt 182 · 비트 52·53) 과 UserSettings `sell_risk_pct`(vt 36, optional)로 송수신하고, 웹에 WinForms 동형으로 매도주문 카드 「☐ 위험도 [N]%」 행 · 매도주문 OFF 동반 끔 · 매도 SOR 「위험도(합)」 · /me 「위험도 기준」 을 넣었다.

## 코드 커밋

| 태스크 | 커밋 | 내용 |
|---|---|---|
| T1 (트레이서) | `ce06f11e` | feat(relay,shared): buy3_schema 8 · 비트 52·53 · UserSettings sell_risk_pct · 생성물 재동기화 (+ 웹 lib 운반 · /me 42 운반) |
| T2 | `b1c076b7` | feat(webapp): 매도주문 ☐위험도 행 · 매도주문 끄면 함께 끔 · 서버 끔은 「서버 반영 완료」 아님 |
| T3 | `25da7229` | feat(webapp,shared): 상한가 표 매도 SOR 「위험도(합)」 · /me 「위험도 기준」 · SellRisk 문구 잠금 |
| T3 ⑥ 회귀 수정 | `10701459` | fix(webapp): 매도주문 Tab 순서 테스트에 lc-sell-risk-pct 추가 |

전부 경로 지정 add · 한글 메시지 · Co-Authored-By 없음 · push/배포 없음.

## 생성물 재동기화

- 전제 확인: `../gh-trade` HEAD 가 e96aef6e 포함 · `flatc version 25.12.19` · `git diff --stat relay/src/generated` 비어 있음(마커 681fb854). gh-trade `681fb854..HEAD` 의 fbs 변경은 e96aef6e 하나.
- `RELAY=$PWD/relay ../gh-trade/server/scripts/sync-relay-schema.sh` → 「대조 통과」. 바뀐 파일은 예상대로 **3개뿐**: `StockDMA.fbs`(마커 e96aef6e) · `stock-dma/set-limit-chaser.ts` · `stock-dma/user-settings.ts`. 손편집 없음.
- 실측 접근자: `addSellRiskEnabled(bool)` · `addSellRiskPct(Int16, 기본 0)` · `sellRiskEnabled()` · `sellRiskPct(): number` / UserSettings `addSellRiskPct(.., null)` · `sellRiskPct(): number | null`.

## RED 기록

- T1: relay 6파일 실행 → **39 failed**(n1s-1~4 · ③-sellrisk 7 · USER_SETTINGS_RANGES · 84 파서/42 조립 4 · 54행 표 3 · zod 2 · ws-autosell 4 · 에코 키 수 81 등). webapp `limit-chaser.test.ts` → **4 failed**. `user-settings-server.test.ts` → **2 failed**.
- T2: `limit-chaser-form` ☐위험도 describe — 「매도주문 끄기 → 둘 다 false」 가 commitSellSwitch 없이 실패함을 분기만 잠시 빼서 확인(1 failed). `strategy-log` 위험도 단독 OFF 줄 없음 — skip 줄만 잠시 빼서 확인(1 failed). lc-fields 1케이스는 구현과 같은 차례에 썼다(RED 미관측 — 행 스펙 잠금).
- T3: shared `limit-feature` 위험도(합) **6 failed** → 초록. `/me` 위험도 기준 **7 failed** → 초록. webapp 표 · 카드 테스트는 merge 인자/구독을 잠시 끈 상태에서 **2 failed** 확인 후 복원.

## gh-trade .h 54줄 대조

`lc-change-mask.test.ts` 「gh-trade LimitChaserChangeMask.h 대조」 — **실행됨**(skip 아님 · `../gh-trade` 존재). `비트 상수 54줄의 [비트, 와이어 이름] = LC_CHANGE_MASK_FIELDS · 비트 집합 = 0..53` 초록. 짝 규칙 없는 칸 54칸 중 38칸(짝 규칙 16 불변).

## SellRisk 문구 확인 결과

kind 6 · group 4 · reason_code 「SellRisk 위험도(상한가거래량×100>=비율×상한가매수잔량)」 · cond_metric 0 은 **이미** 「모름」 폴백이 아닌 보통 매도주문 줄로 그려지고(조건 조각 없음 — WinForms `FormatCondition` cond_metric 0 = "" 동형), kind 7 cancel_reason 2 는 「이탈 매도」 로 그려진다. 잠금 테스트 2건만 추가 · **제품 변경 없음**.

## 테스트 결과

태스크 verify:
- T1: relay 6파일 **653 passed** · relay tsc 두 벌 0 오류 · webapp typecheck(e2e 포함) 0 오류 · webapp `limit-chaser` + `user-settings-server` + `limit-chaser-defaults` **246 passed**.
- T2: webapp 5파일 **605 passed** · typecheck 0 · eslint 0.
- T3: shared 2파일 **250 passed** · webapp 6파일 **247 passed** · typecheck 0 · eslint 0.

T3 ⑥ 전체 회귀(순서대로 · `--maxWorkers=2`):
- shared build OK → shared vitest **39 files · 1051 passed · 2 skipped**
- relay vitest **61 files · 1879 passed**
- relay `typecheck` · `typecheck:tests` 0 오류
- webapp vitest **220 files · 5439 passed · 1 failed · 1 skipped** — 실패 1건은 이번 변경 때문(`inline-navigation.test.tsx` 매도주문 Tab 순서에 새 값 행) → `10701459` 로 고침, 그 파일 재실행 **20 passed**(전체 기준 5440 passed · 1 skipped).
- webapp `typecheck` 0 오류 · `lint` 0 오류(경고는 전부 기존 — 이번에 고친 줄 아님).
- **e2e 미실행**(범위 밖). `webapp/e2e/specs/me.spec.ts` 는 `USER_SETTINGS_BUILTIN` 에 `sellRiskPct: null` 한 줄만 갱신 — tsc e2e 프로젝트로 타입만 확인.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] /me 84/42 sellRiskPct 운반을 T1 커밋으로 당김**
- **Found during:** T1 webapp typecheck
- **Issue:** `UserSettingsNumericKey` 에 `sellRiskPct` 가 합류하자 `limit-chaser-defaults.tsx` `shown[row.key]` 가 `number | undefined` 로 tsc 실패.
- **Fix:** T3 예정이던 `sellRiskPctOf` · `sellRiskPctOrDefaultOf`(user-settings-server.ts) · `userSettingsValuesOf` 조건부 스프레드 · `shown` 메모 한 줄을 T1 에 넣었다(epl 선례 f4a27153 도 같은 커밋). /me **행** 추가는 T3 그대로.
- **Commit:** `ce06f11e`

**2. [Rule 3 - Blocking] `card-body.test.tsx` 카드 상태 픽스처에 `limitFeatureMerge: null`**
- **Found during:** T3 webapp typecheck — `StrategyCardState` 새 필드. 계획 파일 목록 밖이지만 한 줄.
- **Commit:** `25da7229`

**3. [Rule 1 - 회귀] `inline-navigation.test.tsx` 매도주문 Tab 순서** — 새 값 행 1개 추가(새 사실). 별도 fix 커밋 `10701459`.

**4. epl 「판정 비율」 Tab 테스트 시작점 변경** — 「매도 잔량추적」 다음 Tab 이 이제 「위험도 기준」 이라, 그 테스트는 위험도 기준에서 시작해 판정 비율 → 매도 주기를 본다(84 에 sellRiskPct 120 을 실어 Tab 통과가 송신하지 않게). 새 n1s Tab 테스트가 매도 잔량추적 → 위험도 기준 → 판정 비율을 잠근다.

그 밖은 계획대로.

## Known Stubs

없음.

## 인박스 질문 답 초안 (오케스트레이터가 노트를 닫을 때)

질문 「웹 상따 화면·기본설정에도 ☐위험도 [N]% 를 둘지」 → **예.** 웹도 상따 매도주문 카드 ☐체결 아래 「☐ 위험도 [N]%」(1~999 · 켜는 것은 사람뿐 · 매도주문 끄면 같은 제출로 함께 끔) · /me 「매도」 묶음 「위험도 기준」(84 1~999 아니면 80 표시 · 42 미적재) 을 둔다. relay 는 lc.set 이 앞 일곱 조건 + 위험도 둘 다일 때만 `buy3_schema` 8 을 파생해 두 필드를 싣고, 변경 마스크 비트 52 `sell_risk_enabled` · 53 `sell_risk_pct` 를 세운다(schema 7 재제출은 7 그대로). 매도 SOR 이 켜진 펼친 카드의 상한가 표 누적 행은 「위험도(합) N%」(KRX+NXT 85 합산). 54 `SellRisk` · 전략 이벤트는 기존 매도 · 이탈 매도 줄로 그려진다(웹 변경 없음).

## 배포 메모

순서: **gh-trade 서버(e96aef6e) → relay → webapp(push = 프로덕션)**. 이 quick 은 push · 배포를 하지 않았다. 확인은 노트 「확인 방법」 기준(에코 60 `sell_risk_enabled`·`sell_risk_pct` · 웹 lc.set 재제출 뒤 유지 · 84 `sell_risk_pct` 기본 80).

⚠️ 커밋 시점에 `git status -sb` 가 `master...origin/master [ahead 4, behind 43]` 을 보였다 — 다른 세션이 origin/master 에 43커밋을 올렸다(최신 `79111c5f merge: … Phase 38 브랜치에 병합`). push 전에 rebase/merge 가 필요하다.

## Self-Check: PASSED

- 커밋 `ce06f11e` · `b1c076b7` · `25da7229` · `10701459` 모두 HEAD 조상(merge-base 확인).
- 생성물 마커 `server-repo-commit: e96aef6e` 확인.
