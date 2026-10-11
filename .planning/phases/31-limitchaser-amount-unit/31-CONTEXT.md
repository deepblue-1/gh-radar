# Phase 31: 인박스 상따 금액 단위 - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

gh-trade Phase 32 「상따 수량 옵션 금액 단위 전환」(SetLimitChaser 금액 8필드 append · UserSettings `post_buy_floor_amount`) 을 웹에서 **WinForms 동형**으로 받는다 — 상따 수량 8칸을 만원 입력 · 주 환산 표시로 바꾸고(AMT-04 → 도입), `lc.set` 재제출이 C# 만원 원값을 지우지 않게 금액 8필드를 싣고(AMT-02), /me 기본설정에 「후매수 최소(만원)」 를 84/42 로 보고 바꾸며(AMT-03), 생성물 마커를 확인하고(AMT-01) 인박스 노트 `261011-limitchaser-amount-unit.md` 질문 2개에 답해 닫는다. 와이어 번호 · 저널 kind · DB 는 바뀌지 않는다. 작업은 브랜치 `phase/31-limitchaser-amount-unit` 에서 하고 push 하지 않는다(phase 30 세션이 master 를 쓴다 — 끝나면 origin/master 위로 rebase).

</domain>

<decisions>
## Implementation Decisions

### 「만(주)」 도입 범위 (AMT-04 — 2026-10-11 사용자 결정: WinForms 동형 도입)
- **D-01: 수량 8칸은 만원 입력이다.** 선매수 「매도잔량」(`buyWatchQty`↔`buyWatchAmount`) · 「체결량」(`buyMinTradeQty`↔`buyMinTradeAmount`), 줄매수 「최소 잔량」(`extraBuyMinQty`↔`extraBuyMinAmount`) · 「최대 잔량」(`extraBuyMaxQty`↔`extraBuyMaxAmount`, 0 = 무제한), 후매수 「최소 잔량」(`postBuyFloorQty`↔`postBuyFloorAmount`), 매도 「매수잔량」(`sellWatchQty`↔`sellWatchAmount`) · 「체결」(`sellMinTradeQty`↔`sellMinTradeAmount`), 취소 「매수잔량」(`cancelWatchQty`↔`cancelWatchAmount`). 폼 값은 만원(uint, 0~999,999,999)이고 주 필드는 제출 때 산출한다. 단위 라벨 「주」→「만」(줄매수 최소는 「만 ~」 취지 유지). — **Reversibility:** costly — 폼 값 모델 · 범위 · 시트 · 테스트 픽스처가 만원으로 바뀐다.
- **D-02: 환산은 gh-trade §10 그대로.** 제출 1회 내림 `주 = floor(만원 × 10000 ÷ 그룹 비교가)`(uint32 로 좁힘) · 표시 역산은 반올림 `만원 = round(주 × 비교가 ÷ 10000)`(주 또는 비교가 0 이면 0). 그룹 비교가: 매수 5칸 = `buyWatchPrice`, 매도 · 취소 3칸 = `sellWatchPrice`. 비교가를 바꾸면 다음 제출에서 주를 다시 계산한다. 환산 함수는 **shared 한 벌**(`packages/shared`)에 두고 webapp · relay 테스트가 같은 것을 읽는다(두 곳에 적지 않는다).
- **D-03: 비교가 0 거부 — C# 문구 동형.** 켜진 그룹에 금액 > 0 인 칸이 있는데 그 그룹 비교가가 0 이면 등록(arm)을 막고 기존 `armBlockedTextOf` 채널로 「매수 비교가격이 0 입니다 — 금액(만원)을 주로 환산할 수 없습니다. 매수 비교가격을 입력하세요.」(매도도 같은 형식)를 낸다. 「켜진 그룹」 범위는 gh-trade §3 그대로 — 매수 쪽: 매수주문 ∧ (선매수 두 칸 | 줄매수·줄매수 자동의 최소·최대 | 후매수·후매수 자동의 최소); 매도 쪽: 매도주문의 잔량·체결, **(후매수 ∨ 후매수 자동) ∧ 매도 체결의 체결 칸(WR-05)**, 취소 잔량의 취소 칸, 취소>체결의 체결 칸. 꺼진 그룹의 칸은 보지 않는다.
- **D-04: 0주 환산 거부 — C# 문구 동형.** 금액 > 0 인데 내림 결과가 0주면 등록을 막고 문구 끝에 ` (N만 → 0주)` 를 붙인다 — 줄매수 최대 「줄매수 최대가 0주로 환산됩니다 — 0 은 무제한이라 의도와 반대로 동작합니다. 최대 금액을 늘리거나 0(무제한) 으로 하세요.」, 선매수 체결량 「선매수 체결량이 0주로 환산됩니다 — 0주면 매수 비교가격의 첫 체결부터 매수가 나갑니다. 체결량 금액을 늘리거나 ☐체결량을 끄세요.」, 매도 체결 「매도 체결수량이 0주로 환산됩니다 — 0주면 매도 비교가격의 첫 매도체결부터 매도가 나갑니다. 체결 금액을 늘리거나 매도 ☐체결을 끄세요.」. 기존 0 검사(매도 호가잔량 0 · 취소 잔량 0 · 취소 체결 0)는 **환산된 주**로 판정하고 같은 접미를 붙인다.
- **D-05: 파생(S→C 주) 표시는 만원 역산.** 「발동잔량」(`postBuyTriggerQty`, 0 이면 `postBuyUnlockQty` 흐림) 은 매수 비교가로, 「잔량추적 기준선」(`sellQtyTrackBaseline` · `cancelQtyTrackBaseline`) 은 매도 비교가로 `round` 역산해 「3,218만」 으로 보이고 아래 줄에 주 원값(D-07). 비교가 0 이면 주만 보인다.
- **D-06: 에코 적용(짝 검사) — C# `AmountOrDerive` 동형.** 에코 금액 > 0 이고 (비교가 == 0 또는 `floor(금액×10000÷비교가) == 에코 주`) 이면 그 만원 원값을 폼에 둔다. 아니면(금액 0 · 서버가 주를 바꿈 — 후매수 발동 · 줄매수 값 조정) 주를 반올림 역산해 둔다. 추적 ON 인 매도 · 취소 잔량은 기준선(주)을 역산해 보이고 **재제출 때 그 기준선 주를 그대로 되싣는다**(래칫 보존 · C# WR-04 메모 동형): 에코가 폼에 쓴 만원과 그 그룹 비교가가 제출 시점에도 그대로면 서버가 보낸 주를 싣고, 사람이 칸을 고치거나 비교가를 바꾼 뒤에만 다시 내림 환산한다.

### 수량 칸 표시 모양 (목업 채택: `reference/mockup-amount-unit.html` 변형 **C**)
- **D-07: 두 줄 행.** 값 슬롯 위 줄 「1,000만」(15/500 `--fg-2`, 발동잔량은 `--up` 강조 유지), 아래 줄 작은 글씨 「7,770주」(12/400 `--muted-fg`). 행 최소 높이 44→56px. 줄매수 최대 0 은 아래 줄 「무제한」. 비교가 0 이면 아래 줄 붉은 「비교가격 필요」(`--destructive`). 모든 밴드에서 두 줄(데스크톱에서 한 줄로 접지 않는다 — 폭 백스톱 규칙을 하나로). A(한 줄 병기) · B(시트 안에만) 기각.
- **D-08: 넘버패드 시트.** 단위 「만」. 상태 줄(`numpad-status`)에 「= 7,770주 (비교가격 12,870원)」 를 입력 따라 갱신(상태 톤). 비교가 0 이면 alert 「비교가격 필요 — 매수 비교가격을 입력하세요」, 내림 0주면 alert 「500만 → 0주 — 금액을 늘리세요」 로 적용을 잠근다(기존 `padIssue` 채널). 「지금 N만」 서버값 표시는 에코 적용값(D-06). 칩은 만원 칩(`PAD_CHIPS['만원']` 재사용 — 단위 글자만 「만」).
- **D-09: 금액 3칸(선매수 · 줄매수 · 후매수 「금액」) 은 바뀌지 않는다.** 이미 만원이고 주문가격 환산(`buyOrderQtyFromAmount`)이다. 환산 주를 아래 줄에 보이는 것은 하지 않는다(C# 툴팁 추가는 참고만 — 이번 범위 밖).

### `lc.set` 금액 8필드 되싣기 (AMT-02)
- **D-10: 웹이 `lc.set` cfg 에 금액 8필드를 싣는다.** 폼 값(만원)을 그대로 싣고 주 필드는 D-02 로 산출 — 짝이 항상 맞는다(`floor(금액×10000÷비교가) == 주`). 추적 ON 되싣기(D-06)로 서버 주를 그대로 실을 때도 금액은 에코 원값이다. 0 을 지어내지 않는다. — **Reversibility:** one-way(운영 데이터) — 서버는 0 을 keep 하지 않고 저장하므로, 웹이 한 번이라도 0 을 보내면 C# 사용자가 넣은 만원 원값이 영구히 사라진다.
- **D-11: relay zod 는 8필드를 `UIntSchema.optional()` 로 받고 부재 = 0** 으로 조립한다(구 탭 관용 — `buy3_schema` 판정 12필드에 넣지 않는다, gh-trade D-06). 60/64 → `RelayLimitChaser` 에 8필드를 그대로 싣는다(S→C 전용 목록 변동 없음). shared `RelayLimitChaser` · `LimitChaserFormValues` 에 8필드 추가.
- **D-12: 새 폼 시딩** — 후매수 「최소 잔량」 기본값은 84 `postBuyFloorAmount`(만원 · C# F:6159 동형). 나머지 7칸 기본값은 0(빈칸 — gh-trade D-24 리셋 폴백 전부 0). 기존 주 기본값(`DEFAULT_POST_BUY_FLOOR_QTY 100_000` 등)은 이전하지 않고 버린다. 상장주식수 시딩(0.3%·3%)이 웹에 있으면 `round(주×상한가÷10000)` 만원으로(gh-trade D-11), 없으면 추가하지 않는다.

### /me 「후매수 최소」 (AMT-03 — 2026-10-11 사용자 결정: 교체)
- **D-13: 「후매수 하한잔량(주)」 행을 「후매수 최소(만원)」 행으로 교체한다.** key `postBuyFloorAmount`, 범위 0~999,999,999(shared `USER_SETTINGS_RANGES` 에 추가 — fbs 주석 원문), 같은 묶음 「후매수」 같은 자리. 봉인 필드 `postBuyFloorQty` 는 화면에서 빼고 42 에 **0** 을 싣고 84 의 값은 읽지 않는다. 42 는 12값 전체 교체 — 84 에서 받은 11값 + 이 값 전부 채운다(범위 밖 하나라도 있으면 54 ERROR 전체 거부 「후매수 하한금액은 0~999999999만원이어야 합니다」 — 서버 문구 그대로 표시).
- **D-14: relay** `user.settings.set` zod 에 `postBuyFloorAmount` 추가(필수 · 범위 shared), 84 파서가 `postBuyFloorAmount` 를 싣는다(`present` 뒤 vtable 28). 구 84(필드 부재) 는 0.

### 생성물 · 인박스 (AMT-01 · AMT-04 답)
- **D-15: 생성물은 이미 최신.** `RELAY=… sync-relay-schema.sh --check` 가 feature 브랜치 HEAD(6370ac1d, fbs 는 e5b4fbca 이후 무변경) 기준 「신규/변경 예정 0 · 사본 최신」 — 2026-10-11 확인. gh-trade master 병합 뒤 마커 해시만 바뀔 수 있으니 마무리 플랜에서 `--check` 재실행, 다르면 재생성 커밋.
- **D-16: 인박스 답 2개** — Q1 「만(주) 도입 시점」: **이번 Phase 31 에 도입**(웹 수량 8칸 만원 입력 · 두 줄 표시 · §10 규칙 공유). Q2 「금액을 직접 받나」: **웹이 금액(만원)을 직접 받고 주는 제출 때 산출**(§10 공유 — 제출 내림 · 표시 반올림 · 그룹별 비교가 · 비교가 0 등록 거부). 노트의 툴팁 문구 「N주 (환산가 P원)」 는 c323c27e 로 「N주」 가 됐다고 한 줄 적는다. `status: done` · `done_commit` 으로 경로 지정 커밋.

### 확인 · 배포 (2026-10-11 사용자 결정)
- **D-17: webapp 은 브랜치에서 Vercel 고유 URL 로 미리보기.** repo root 에서 `vercel pull --yes --environment=production` → `vercel build --prod` → `vercel deploy --prebuilt --prod --skip-domain`(운영 도메인 불변 · 배포 전후 `vercel inspect https://trade.jx1.io` 로 확인). 화면 플랜마다 또는 UI 웨이브 끝에 올리고 URL 을 보고한다. GitHub push 는 하지 않는다(= 프로덕션 배포 · phase 30 세션과 master 경합).
- **D-18: relay 는 gh-trade 서버 배포 전에도 배포 허용**(호환 — 구 서버는 vtable 158~172 · 28 을 무시). 단 20:00 KST 이후 · 배포 직전 `git status -sb` 로 다른 세션 커밋 확인 · phase 30 세션의 배포와 겹치지 않게 ListAgents/SendMessage 로 알린다. AMT-02 금액 에코 실증(60 에코 `sell_watch_amount: 100` 등) · 84 `post_buy_floor_amount` 실증은 gh-trade 서버 배포 뒤에만 가능 — 그 전 실서버에서는 금액 에코가 오지 않아 칸이 역산 표시로 보이는 것이 정상이다.

### Claude's Discretion
- shared 환산 함수 이름 · 위치(`packages/shared/src/…`) · `LimitChaserFormValues` 에서 주 필드를 남길지(S→C 에코 보존용 읽기 전용) 아니면 제출 시 산출만 할지 — D-06 되싣기(서버 주 그대로)가 가능해야 한다.
- 두 줄 행 컴포넌트 구현(SettingRow/DerivedRow 확장 vs 새 변형) · aria-label 문장(「선매수 매도잔량 1,000만 7,770주」) · 폭 백스톱 테스트 갱신.
- D-03/D-04 거부 판정 함수의 위치(`canArmOf`/`armBlockedTextOf` 확장) — 문장은 한 곳에서만 짓는다.
- 테스트 픽스처(`test-fixtures/limit-chaser.ts`) 만원화 범위, E2E P31 시나리오 수(390 · 1080).
- 인박스 노트 닫기 커밋을 phase 마무리 플랜에 둘지 별도 커밋으로 둘지.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 계약 (gh-trade 인박스 · 정본)
- `docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md` — 와이어 변경(8필드 vtable 158~172 · UserSettings 28 · 42 12값 · 54 사유 「N만(M주)」), 확인 방법, 질문 2개(D-16 으로 답)
- `docs/inbox/from-gh-trade/README.md` — 노트 닫기 형식(`status: done` · `done_commit` · 경로 지정 커밋)
- `relay/src/generated/StockDMA.fbs` — 생성물 사본(마커 e5b4fbca · 최신) · `relay/src/generated/stock-dma/set-limit-chaser.ts` · `user-settings.ts`
- `/Users/alex/repos/gh-trade/docs/strategy/limit-chaser.md` §10 「금액 ↔ 수량 12벌」(3348~3363) · §9-2 ⑩(3085~3106) — 환산 공식 · 짝 검사 · 그룹 비교가 · 0 처리
- `/Users/alex/repos/gh-trade/.planning/phases/32-limitchaser-amount-unit/32-CONTEXT.md` — D-01~D-26(특히 D-06 0 저장 · D-13 에코 적용 · D-22 매도 비교가 · D-23 0주 접미 · D-24 폴백 0)
- `/Users/alex/repos/gh-trade/server/docs/protocol.md` 30 · 54 · 95행 — 42/84 · 60 에코 · 54 사유 형식
- `/Users/alex/repos/gh-trade/client/Forms/Trading/LimitChaserForm.cs` — `QtyForSubmit` · `AmountOrDerive`(F:5747) · `TryPrepareSubmission`(F:5083~5094 · 5380~5441) · 거부 문구(F:5164~5176 · 5247~5248) · `ApplyServerConfig`(F:6205~) · 시딩(F:6159)
- `/Users/alex/repos/gh-trade/client/Forms/LimitChaserDefaultsDialog.cs` 174~178 · 453 · 483~498 — 「최소 [ ]만」 · 42 송신
- `/Users/alex/repos/gh-trade/server/src/trade/state/UserSettingsStore.h` 115~160 — 42 범위 · 거부 문구

### 화면
- `.planning/phases/31-limitchaser-amount-unit/reference/mockup-amount-unit.html` — **채택 변형 C**(두 줄 행 · 시트 상태 줄 · 비교가 0 표시). A/B 기각
- `.planning/milestones/v1.0-phases/27-auto-sell-integration/reference/mockup-user-settings.html` — /me 기본설정 시트 원본(행 교체는 같은 틀)
- `webapp/src/styles/globals.css` 상단 §2.2b — 상따 화면 4밴드 컨테이너 쿼리 정본(두 줄 행 폭 백스톱은 이 밴드 기준)

### 선행 결정
- `.planning/milestones/v1.0-phases/24-*/24-CONTEXT.md` · `27-auto-sell-integration/27-CONTEXT.md` — 상따 폼 값 행 · 넘버패드 시트 · /me 11행 결정(이번에 바꾸는 행만 덮는다)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/relay.ts` — `RelayLimitChaser`(174~330: 주·가격 필드, `buyOrderAmount` 「보관·에코만」 규약 주석 152~) · `RelayUserSettingsValues`/`USER_SETTINGS_RANGES`(1395~1445). 8필드 · `postBuyFloorAmount` 를 여기에 추가.
- `webapp/src/lib/limit-chaser.ts` — `buyOrderQtyFromAmount`(만원→주 내림, 금액 3칸용) 를 일반화한 그룹 비교가 환산의 본보기 · 기본값(236~277) · 서버→폼(711) · 폼 키 매핑(333~382).
- `webapp/src/components/trading/lc/lc-fields.ts` — 행 스펙(`kind: 'value' | 'checkValue' | 'derived'`, 217~525) · `unit` · `sheetTitle` · `desc`. 8칸 `unit: '주'` → 「만」 과 두 줄 표시 메타 추가.
- `webapp/src/components/trading/lc/setting-group.tsx` — `SettingRow`(263~), `DerivedRow`(905~), `ValueWithChevron`, `ROW_BOX`(44px) · `LABEL_TEXT` · `formatSettingValue`. 두 줄 변형의 바탕.
- `webapp/src/components/trading/lc/number-pad-sheet.tsx` — `numpad-status` 상태 줄(`line.tone` alert/warn/status) · `numpad-server` 「지금 …」 · `PAD_CHIPS[unit]`. D-08 의 자리.
- `webapp/src/lib/numpad.ts` — `PadUnit`('만원' 있음) · `padIssue`/`padWarning`/`canConfirmPad`(ctx 기반 잠금) — 비교가 0 · 0주 잠금을 ctx 로 넣는다.
- `webapp/src/components/trading/limit-chaser-form.tsx` — `canArmOf`(338) · `armBlockedTextOf`(266, 문장 산출 단일 지점) · 제출 cfg 조립(684~687 `buyOrderQtyFromAmount`). D-03/D-04/D-10 의 자리.
- `webapp/src/components/trading/lc/use-lc-field-commit.ts` — `formFromServer`(626: 서버가 모르는 `buyOrderAmount` 보존 패턴) — D-06 짝 검사 · 추적 ON 되싣기 패턴 참고.
- `webapp/src/components/me/limit-chaser-defaults.tsx` — `USER_SETTINGS_ROWS`(86~110, `postBuyFloorQty` 행 92) · 42 조립(201). D-13 의 자리.
- `relay/src/ws/protocol.ts` — `RelayLcSetSchema`(129~220, 선택 필드 `UIntSchema.optional()` 패턴 205·213·217) · `user.settings.set`(417) · 철거 프레임 기본값(564~570).
- `relay/src/dma/envelope.ts` — SetLimitChaser 조립(1637~1661 `toWireUint`) · 60/64 파서(2589~2624) · UserSettings 42 조립(2059) · 84 파서(802).
- `webapp/src/test-fixtures/limit-chaser.ts` · `relay/src/dma/__tests__/envelope.test.ts` — 픽스처 · 왕복 테스트.

### Established Patterns
- 「서버는 보관·에코만, 평가는 주」 규약은 `buyOrderAmount` 가 선례 — 금액 8필드도 같은 주석 어투로.
- 범위 정본은 shared 한 벌(`LC_FIELD_RANGES` · `USER_SETTINGS_RANGES`) — 두 곳에 적지 않는다.
- 문장 산출 단일 지점(`armBlockedTextOf`) · 값 슬롯 글자 불변(폭 백스톱 L3 — 쉐브런만 숨김).
- relay 선택 필드 부재 = 0 조립, `buy3_schema` 파생은 12필드만 본다.

### Integration Points
- webapp 폼 → `lc.set` cfg(금액 8 + 산출 주 8) → relay zod → envelope → 서버; 60/64 → envelope 파서 → `RelayLimitChaser` → 폼 에코 적용(D-06).
- /me 시트 → `user.settings.set`(12값) → relay → 42; 84 → relay → `user.settings`(+`postBuyFloorAmount`) → 시트 · 새 폼 시딩(D-12).

</code_context>

<specifics>
## Specific Ideas

- 「최대한 gh-trade Phase 32 작업에 맞게」 — 갈림이 생기면 WinForms 동형이 기본(문구 · 환산 · 거부 범위 · 기본값 0).
- 목업 변형 C 의 예시 데이터: 비교가 12,870원 · 매도잔량 1,000만 → 7,770주 · 발동잔량 25,000주 → 3,218만 — 테스트 수치로 재사용 가능.
- 미리보기 URL 로 사용자가 직접 확인한다 — 화면 플랜 SUMMARY 에 미리보기 URL 과 확인 항목(만원 칸 · 두 줄 · /me 행)을 적는다.

</specifics>

<deferred>
## Deferred Ideas

- 금액 3칸(주문금액)에 환산 주 보조 표시(C# c323c27e 툴팁 동형) — 이번 범위 밖, 후속 quick 후보.
- 상장주식수 비율 시딩(0.3%·3%) 웹 도입 — 웹에 해당 기능이 없으면 추가하지 않는다(새 능력).
- gh-trade `DropMasterAfterServerFold` 가 `chkAddBuyAuto` 를 보지 않는 문제 — gh-trade 쪽 quick(참고만).

</deferred>

---

*Phase: 31-인박스 상따 금액 단위*
*Context gathered: 2026-10-11*
