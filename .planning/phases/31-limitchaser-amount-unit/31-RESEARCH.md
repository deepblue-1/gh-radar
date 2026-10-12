# Phase 31: 인박스 상따 금액 단위 - Research

**Researched:** 2026-10-11
**Domain:** gh-trade 계약(StockDMA.fbs append) 수용 — shared 계약 · relay 코덱/zod 패스스루 · webapp 상따 폼 값 모델(만원↔주) · /me 42/84
**Confidence:** HIGH (모든 계약 값 · 공식 · 문구를 이번 세션에 원본 파일에서 직접 읽었다. 신규 패키지 0)

## Summary

이번 phase 는 새 와이어를 만드는 일이 아니다. gh-trade 가 이미 `SetLimitChaser` 말미에 금액 8필드(vtable 158~172)와 `UserSettings.post_buy_floor_amount`(vtable 28)를 붙였다. gh-radar `relay/src/generated/` 생성물도 이미 그 fbs(마커 `e5b4fbca`)로 재생성돼 있고 `--check` 는 지금 「신규/변경 예정 0 개 · .fbs 사본 최신」이다(이번 세션에 실행해서 확인). 그래서 일의 무게는 거의 전부 **webapp 폼 값 모델 전환**에 있다. 수량 8칸이 만원 값이 되고, 주는 제출 때 shared 한 벌의 §10 공식으로 산출한다. 그 위에 에코 짝 검사, 「에코가 쓴 칸은 서버 주를 그대로 되싣기」(C# `QtyForSubmit` 메모), 비교가 0 · 0주 거부, 두 줄 행, 시트 상태 줄이 얹힌다. relay 는 zod 선택 8필드, 조립 8줄, 파서 8+1필드, 42 의 1필드만 바뀐다. Express server 와 DB 는 바뀌지 않는다.

C# 원본(gh-trade `feature/limitchaser-amount-unit`)을 직접 읽어 확정한 사실 가운데, CONTEXT 와 다르거나 CONTEXT 가 다루지 않은 것이 있다. 플래너가 꼭 반영해야 한다. **① 목업과 CONTEXT 「specifics」의 예시 수치는 10배 틀렸다.** 비교가 12,870원에서 1,000만은 7,770주가 아니라 **777주**이고, 25,000주는 3,218만이 아니라 **32,175만**이다. 테스트에 그대로 옮기면 실패한다. **② C# `NarrowQty` 는 uint32 가 아니라 `int.MaxValue`(2,147,483,647)에서 자른다.** **③ 메모 되싣기는 추적 ON 칸만이 아니라 8칸 전부에 적용된다**(WR-04). **④ 현행 웹은 추적 ON 일 때 매도·취소 잔량을 cfg 값으로 재제출한다.** 서버는 재제출 때 기준선을 리셋하므로(Q4) 웹 재제출이 래칫을 되돌리고 있었다. D-06 이 이 갈림을 C# 동형으로 고친다(행동 변화 — 테스트로 고정할 것). **⑤ 웹 커밋 훅은 성공을 `server[field] === value` 로 판정한다.** gh-trade 서버가 배포되기 전에는 에코 금액이 0 으로 온다. 그래서 금액 키를 그대로 비교하면 **모든 수량 칸 확정이 「반영하지 못했어요」로 떨어진다.** D-18 이 「배포 전 역산 표시는 정상」이라고 했으므로 성공 판정을 짝·주 기준으로 바꿔야 한다. **⑥ D-14 「`postBuyFloorAmount` 필수」는 D-17·D-18(relay 선배포 · push 금지)과 함께 놓이면 문제가 된다.** 운영 webapp(구판)이 /me 를 저장하면 relay zod 가 소켓을 닫는다(4400). 시세·에코·수동주문까지 함께 끊기는 회귀다.

**Primary recommendation:** shared 에 §10 환산 한 벌을 둔다(`qtyFromAmount` 내림 · `narrowQty` int.Max · `amountFromQty` 반올림 · `amountOrDerive` 짝 검사 · 8쌍 표 · `qtyForSubmit` 에코 메모). 웹 폼은 8칸을 **금액 키**로 바꾸고, 주 8필드는 `buildCfg` 가 `server` 에코에서 메모를 복원해 산출한다. relay 는 D-11 그대로 선택 8필드 · 부재 0 으로 둔다. `user.settings.set` 의 `postBuyFloorAmount` 는 구 탭 관용(선택 + 84 캐시 되싣기)으로 둘지 사용자 확인을 받는다. 봉인 `post_buy_floor_qty` 는 relay 조립기가 늘 0 을 싣는다.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- 금액 3칸(주문금액)에 환산 주 보조 표시(C# c323c27e 툴팁 동형) — 이번 범위 밖, 후속 quick 후보.
- 상장주식수 비율 시딩(0.3%·3%) 웹 도입 — 웹에 해당 기능이 없으면 추가하지 않는다(새 능력).
- gh-trade `DropMasterAfterServerFold` 가 `chkAddBuyAuto` 를 보지 않는 문제 — gh-trade 쪽 quick(참고만).

> 연구 주: 웹에는 상장주식수 시딩이 **이미 있다**(`webapp/src/lib/limit-chaser.ts:315` `seedListSharesDefaults` · 폼 `limit-chaser-form.tsx:761`). 그래서 위 Deferred 두 번째 줄의 「새 능력」에 해당하지 않는다. D-12 의 「웹에 있으면 만원으로 바꾼다」 분기가 적용된다. [VERIFIED: webapp/src/lib/limit-chaser.ts:315-326 · limit-chaser-form.tsx:759-769]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AMT-01 | relay 생성물 재동기화 커밋(`4970c3ae`)이 gh-trade master 병합 뒤 마커와 일치하는지 `sync-relay-schema.sh --check` 로 확인하고, 다르면 재생성한다 | §「AMT-01 절차」 — `--check` 는 마커를 대조하지 않고 본문·.ts 만 본다. 그래서 마커는 `git log -1 master -- server/src/protocol/StockDMA.fbs` 와 따로 대조해야 한다. 지금 gh-trade 는 **미병합**이다(`NOT_MERGED` 실측). |
| AMT-02 | 웹 `lc.set` 재제출 때 금액 8필드를 60/64 에코값 그대로 되싣는다 — 웹이 주 필드를 바꿔 보내면 짝이 맞는 금액 또는 0 … C# 단말 칸의 만원 원값이 웹 재제출로 지워지지 않는다 | §Pattern 1~3(shared 환산 · 에코 메모 · buildCfg) · relay 조립 8줄 · Pitfall 1·2·6 |
| AMT-03 | 84 `post_buy_floor_amount` 를 /me 기본설정에 표시·설정한다 — 42 는 12값 전체 교체에 이 필드를 포함하고 봉인 필드 `post_buy_floor_qty` 는 0 | §Pattern 5 · Pitfall 3(구 탭 4400) · relay 42 조립기 0 고정 |
| AMT-04 | 「만(주)」 도입 여부를 결정해 인박스 노트 질문 2개에 답하고 닫는다 — 도입하면 §10 환산 규칙 그대로 공유 | D-16 답 확정. 웹 전환 범위는 §Architecture 와 Pitfall 4~10 · 노트 닫기 형식은 §AMT-04 노트 닫기 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 커뮤니케이션 · 문서 산문은 **한글**. 커밋 메시지 한글, **Co-Authored-By 넣지 않기**(사용자 전역 CLAUDE.md — 시스템 attribution 지시보다 우선).
- 커밋 전 메시지를 보여 주고 확인받는다(사용자 전역). GSD executor 커밋은 GSD 흐름을 따른다.
- 파일 변경은 GSD 명령 흐름 안에서만 한다.
- **gh-trade 인박스:** 처리하면 노트의 `status: done` · `done_commit` 을 채우고 **경로를 지정해** 커밋한다(`git add -A` 금지). 형식 정본은 `docs/inbox/from-gh-trade/README.md`.
- 상따 화면 반응형은 **본문 폭 4밴드 컨테이너 쿼리**다(경계 685 · 830 · 992). 표 정본은 `webapp/src/styles/globals.css` §2.2b 하나뿐이고 복사하지 않는다. 앱 셸·사이드바만 뷰포트 브레이크포인트를 쓴다.
- 배포: 프론트 Vercel · 백엔드 Cloud Run. **push = webapp 프로덕션 배포**다. relay(백엔드)를 먼저 배포하고 push 는 그 뒤에 한다(메모리 「배포는 relay 먼저·push 나중」).
- 메모리 규칙(이번 phase 와 관련된 것): 서브에이전트 배포는 분류기가 차단한다 → executor 는 커밋까지만 하고, relay·Vercel 배포는 메인 세션이 한다. 동시 세션에서는 vitest `--maxWorkers=2` · playwright `--workers=1` 로 돌린다. dev 포트는 3100. 「두 클라 갈림은 WinForms 동형 기본」. 보안검사(secure-phase)는 생략한다(`security_enforcement: false`). UI 는 HTML 목업이 먼저다(이미 채택). 손보는 표면 안의 시각 결함은 바로 고친다. 갭 클로징 재리뷰는 `-R2` 별도 파일로 낸다. 작업 브랜치는 `phase/31-limitchaser-amount-unit` 이고 push 하지 않는다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 만원↔주 환산 공식(§10) · 8쌍 표 · 짝 검사 · 메모 되싣기 판정 | shared(`packages/shared`) 순수 함수 | webapp(호출) · relay 테스트(픽스처 짝 생성) | D-02 「shared 한 벌」. 두 곳에 적으면 갈라진다 |
| 수량 8칸 만원 입력 · 주 산출 · 비교가 0 / 0주 거부 · 두 줄 표시 · 시트 상태 줄 | Browser(webapp) | — | C# 과 같이 **클라 검증 몫**이다(서버 54 거부 없음 — gh-trade §9-2 ⑩ 「비교가격 검증은 클라 몫이다(54 아님)」) |
| `lc.set` 금액 8필드 zod · 조립 · 60/64 파싱 | API/Backend(relay) | — | 패스스루. 판정 없음. 부재 = 0(D-11). 무장 가드 `#strategyArmable` 은 주 필드만 보므로 무변경 |
| 42 조립(봉인 0 고정) · 84 파싱 · (권고) 구 탭 `postBuyFloorAmount` 부재 시 84 캐시 되싣기 | API/Backend(relay) | Browser(/me) | relay 가 사용자별 84 최신값을 이미 쥐고 있다(`subscription-hub.ts:2245 getUserSettings`) |
| 금액 보관 · 에코 · `strategy_state.toml` · 42 범위 검증 | 외부(gh-trade 서버) | — | 이미 구현돼 있다(feature 브랜치, 운영 미배포) |
| 영속 저장 | — | — | **DB 변경 없음**(Supabase 무관) |
| Express `server` | — | — | 상따 · 사용자설정 경로 없음(grep 0) — 무변경 |

## Standard Stack

신규 라이브러리는 없다. 기존 스택 그대로다.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flatbuffers (npm) + flatc | flatc **25.12.19 고정** | 생성 코드 `relay/src/generated/**` | `sync-relay-schema.sh` 가드 2가 버전을 고정한다 [VERIFIED: 실행 `flatc --version` → `flatc version 25.12.19`] |
| zod | (기존) | relay 인바운드 스키마 | `RelayLcSetSchema` · `RelayUserSettingsSetSchema` 패턴 그대로 |
| vitest | relay · shared 4.x / webapp **2.1.9** | 단위 · 컴포넌트 테스트 | [VERIFIED: package.json grep — webapp `"vitest": "^2.1.9"`, relay/shared `"^4.1.4"`] |
| Playwright | 1.59.1 | webapp E2E(진짜 relay + fake gateway) | [VERIFIED: `npx playwright --version` → 1.59.1] |

**Installation:** 없음.

## Package Legitimacy Audit

이번 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 0.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (없음) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## 계약 정본 (이번 세션에 직접 읽은 값)

### SetLimitChaser 금액 8필드 — vtable · 접근자
[VERIFIED: relay/src/generated/stock-dma/set-limit-chaser.ts:370-408] 접근자는 전부 `readUint32`, 부재 = 0:
```
buyWatchAmount()     __offset(this.bb_pos, 158)
buyMinTradeAmount()  __offset(this.bb_pos, 160)
extraBuyMinAmount()  __offset(this.bb_pos, 162)
extraBuyMaxAmount()  __offset(this.bb_pos, 164)
postBuyFloorAmount() __offset(this.bb_pos, 166)
sellWatchAmount()    __offset(this.bb_pos, 168)
sellMinTradeAmount() __offset(this.bb_pos, 170)
cancelWatchAmount()  __offset(this.bb_pos, 172)
```
빌더는 `SetLimitChaser.addBuyWatchAmount` … `addCancelWatchAmount` 이다 [VERIFIED: set-limit-chaser.ts:682-710]. fbs 주석 원문은 「`buy_order_amount 규약(보관·에코·상태파일만, 평가 무접촉). C→S.`」 · 「`게이트 없음 — 0 = 클라가 주(…)에서 역산 표시.`」이다 [VERIFIED: relay/src/generated/StockDMA.fbs:698-718].

### UserSettings — 봉인 · 신규
[VERIFIED: relay/src/generated/StockDMA.fbs:1608 · 1626 · user-settings.ts:142-143]
```
post_buy_floor_qty: uint;    // 후매수 하한잔량(주) 0~99999999 (봉인 — Phase 32 D-08, 신 클라는 0 을 싣고 읽지 않는다)
post_buy_floor_amount: uint;   // 후매수 하한금액(만원) 0~999999999 — Phase 32 D-08. … present 뒤 말미 append. vtable 28
static addPostBuyFloorAmount(builder, postBuyFloorAmount) { builder.addFieldInt32(12, postBuyFloorAmount, 0); }
```
서버 42 검증 [VERIFIED: gh-trade server/src/trade/state/UserSettingsStore.h:88-90 · 150-152]: `kAmountMax = 999999999`, `kFloorQtyMax = 99999999`, `RangeViolation("후매수 하한금액은", 0, kAmountMax, "만원이어", s.postBuyFloorAmount)`. 그래서 실제 54 원문은 「후매수 하한금액은 0~999999999만원이어야 합니다(받은 값 N)」이다(괄호 꼬리가 붙는다). 봉인 필드 검사(0~99999999주)는 **남아 있다**. 0 을 싣는 것은 범위 안이다.

### §10 환산 — C# 원본
[VERIFIED: gh-trade client/Forms/Trading/LimitChaserForm.cs:5691-5757 · 5763-5766]
```csharp
private long QtyFromAmount(NumericTextBox amountBox, decimal price)
{ if (price <= 0) return 0; return (long)amountBox.Value * 10000 / (long)price; }

private long QtyForSubmit(NumericTextBox box, decimal price)
{ Tuple<long, uint, decimal> memo;
  if (_echoQtyMemo.TryGetValue(box, out memo) && (long)box.Value == memo.Item1 && price == memo.Item3)
    return (long)memo.Item2;
  return QtyFromAmount(box, price); }

private static uint NarrowQty(long qtyRaw)
{ if (qtyRaw <= 0) return 0; return qtyRaw > int.MaxValue ? (uint)int.MaxValue : (uint)qtyRaw; }

private static long AmountFromQty(long qty, decimal price)
{ if (price <= 0 || qty <= 0) return 0; return (qty * (long)price + 5000) / 10000; }

private static long AmountOrDerive(uint amount, uint qty, uint price)
{ if (amount > 0 && (price == 0 || (long)amount * 10000 / price == qty)) return amount;
  return AmountFromQty(qty, price); }

private static string ZeroQtySuffix(NumericTextBox amountBox)
{ return amountBox.Value > 0 ? string.Format(" ({0}만 → 0주)", amountBox.Value) : ""; }
```
- **제출 값**: 주 = `NarrowQty(QtyForSubmit(칸, 그룹 비교가))`, 금액 = `(uint)칸.Value`(**칸 값 그대로**) [VERIFIED: LimitChaserForm.cs:5383-5440 — `s.BuyWatchQty = NarrowQty(buyWatchQtyRaw); s.BuyWatchAmount = (uint)numBuyWatchQty.Value;` 외 7쌍].
- **에코 적용**: 추적 ON 이면 매도 칸 = `AmountFromQty(s.SellQtyTrackBaseline, s.SellWatchPrice)` 이고 메모 = 기준선, OFF 면 `AmountOrDerive(s.SellWatchAmount, s.SellWatchQty, s.SellWatchPrice)` 이고 메모 = `SellWatchQty` [VERIFIED: LimitChaserForm.cs:6240-6242 · 취소 6260-6262 동형]. **메모는 8칸 전부에 쓴다**(`RememberEchoQty` 호출 8곳 — 6242 · 6262 · 6314 · 6316 · 6319 · 6333 · 6346 · 6357).
- **메모 지움**: 사람의 칸 편집, 호가 클릭, 키 변경, 기본값 리셋, 상장주식수 시딩 [VERIFIED: LimitChaserForm.cs:1487 · 3069-3070 · 6133].

### 거부 문구 · 판정 순서 (C#)
[VERIFIED: LimitChaserForm.cs:5153-5290 — 판정식과 문구 원문]
1. 비교가 0 — `buyNeedsWatchPrice = chkBuyEnabled && ((chkPreBuyEnabled && (numBuyWatchQty.Value > 0 || numBuyMinTradeQty.Value > 0)) || ((chkAddBuyEnabled || chkAddBuyAuto) && (numAddBuyMinQty.Value > 0 || numAddBuyMaxQty.Value > 0)) || ((chkPostBuyEnabled || chkPostBuyAuto) && numPostBuyFloorQty.Value > 0))` · `sellNeedsWatchPrice = (chkSellEnabled && (sellWatch>0 || sellMinTrade>0)) || (postBuyArmsSell && chkSellTradeQtyEnabled && sellMinTrade>0) || (chkCancelByQty && cancel>0) || (chkCancelByExec && sellMinTrade>0)`. 판정 값은 **금액**(`.Value`)이다. 매수를 먼저 본다. 문구 원문은 D-03 과 같다.
2. 줄매수 — `addMaxFloored = chkAddBuyEnabled && numAddBuyMaxQty.Value > 0 && addBuyMaxQtyRaw == 0`(마스터 · ☐자동은 보지 않는다), 다음 「최소 > 최대」는 **금액끼리** 비교한다.
3. 후매수 매도비율 0 → 매도 비율 0.
4. 매도 호가잔량 0 — `chkSellEnabled && sellWatchQtyRaw == 0` 이면 문구 + `ZeroQtySuffix`.
5. 체결 0주 — `buyTradeFloored = chkBuyEnabled && chkPreBuyEnabled && chkBuyTradeQtyEnabled && 금액>0 && 주==0` · `sellTradeFloored = (chkSellEnabled || postBuyArmsSell) && chkSellTradeQtyEnabled && 금액>0 && 주==0`.
6. 취소 잔량 0(`chkCancelByQty && cancelWatchQtyRaw == 0`) → 취소 체결 0(`chkCancelByExec && sellMinTradeQtyRaw == 0`) → 매도 비교가 0(anyCancel). 모두 접미를 붙인다.

## Architecture Patterns

### System Architecture Diagram

```
[사람: 웹 상따 카드 수량 칸 탭/클릭]
        │ 만원 입력 (NumberPadSheet 단위 「만」 / 인라인 편집기)
        ▼
[numpad padIssue ctx] ──비교가 0 / 내림 0주──▶ (alert · 적용 잠금)
        │ 값 확정
        ▼
[useLcFieldCommit.sendNow]
  base = formFromServer(server)  ◀── 에코 적용: amountOrDerive / 추적 ON 기준선 역산 (shared)
  next = base + 동반 + 바꾼 칸
  lcRangeIssue(next) ─▶ armBlockOf(next, server) ──(D-03/D-04 문구 · armBlockedTextOf 단일 지점)──▶ 막힘
        │
        ▼
[buildCfg(next, server)]  주 8 = narrowQty(qtyForSubmit(만원, 그룹 비교가, 에코 메모))   (shared)
                          금액 8 = 폼 만원 그대로
        │ {t:'lc.set', cfg}  (wss)
        ▼
[relay zod RelayLcSetSchema]  금액 8 = UIntSchema.optional()  (구 탭: 부재)
        ▼
[fanout lc.set → #strategyArmable(주 필드만) → buildSetLimitChaserReq]  add*Amount(cfg.x ?? 0)
        ▼  MsgType 10
[gh-trade 서버]  보관 · 에코 · strategy_state.toml   (구 서버: vtable 158~172 무시 → 에코 금액 0)
        ▼  60 에코 / 64 목록 / 300ms 푸시
[relay readLimitChaser]  금액 8 그대로 → RelayLimitChaser
        ▼
[webapp server prop] ─▶ formFromServer ─▶ 두 줄 행(위 만원 · 아래 주) / 성공 판정(짝·주 기준)

/me:  [시트 「후매수 최소」(만원)] → 84 캐시 11값 + 1값 · postBuyFloorQty=0 → user.settings.set
      → relay zod → buildSetUserSettingsReq(봉인 0 고정 · amount) → 42 → 서버 → 84 브로드캐스트
      → parseUserSettings(+postBuyFloorAmount) → /me 행 · 새 폼 시딩(postBuyFloorAmount)
```

### Recommended touch map (파일 → 책임)
```
packages/shared/src/
├── relay.ts                 # RelayLimitChaser +8 금액(양방향 · JSDoc 「buyOrderAmount 규약」) · RelayUserSettingsValues +postBuyFloorAmount
│                            #   · USER_SETTINGS_RANGES.postBuyFloorAmount {0, 999_999_999} · postBuyFloorQty JSDoc 「봉인」
├── lc-amount.ts (신규·재량)  # §10 환산 한 벌 + 8쌍 표 + qtyForSubmit(에코 메모)
├── index.ts                 # export
└── __tests__/lc-amount.test.ts (신규)
relay/src/
├── ws/protocol.ts           # RelayLcSetSchema +8 UIntSchema.optional() · RelayUserSettingsSetSchema +postBuyFloorAmount(필수/선택 — Open Q1) · postBuyFloorQty 선택화 권고
├── dma/envelope.ts          # LcSetCfg: 8필드 Omit 후 선택으로 재부착 · buildSetLimitChaserReq add*Amount(?? 0) 8줄
│                            #   · readLimitChaser +8 · parseUserSettings +postBuyFloorAmount · buildSetUserSettingsReq 봉인 0 고정 + amount
├── ws/fanout.ts             # (권고) user.settings.set 부재 시 hub.getUserSettings(userId).postBuyFloorAmount 되싣기
└── (msg-type.ts · subscription-hub.ts switch — 무변경: 새 MsgType 없음)
relay/tests/helpers/{frames.ts,fake-gateway.ts}   # 60/64 프레임 입력 +8 · 84 프레임 +postBuyFloorAmount · 10/42 디코드 기록 +필드
webapp/src/
├── lib/limit-chaser.ts      # LimitChaserFormValues(8 주 키 → 산출) · defaultLimitChaserForm(7칸 0 · 후매수 최소=84) · formFromServer(에코 적용)
│                            #   · seedListSharesDefaults(만원 · 비교가 필요) · seedFromUserSettings(postBuyFloorAmount) · isMasterOnlyDelta · groupAutoChecksOf(환산 주)
├── lib/lc-ranges.ts         # 금액 8칸 범위 {0, 999_999_999}
├── lib/numpad.ts            # PadUnit +'만' · PAD_CHIPS['만'] = PAD_CHIPS['만원']
├── components/trading/limit-chaser-form.tsx   # buildCfg(주 산출) · canArmOf/armBlockOf/armBlockedTextOf(D-03/D-04) · 시트 ctx/상태 줄 · 두 줄 렌더
├── components/trading/lc/lc-fields.ts         # 8행 field 키(금액) · unit '만' · 시트 설명 · lcValueTextOf/lcSummaryOf 만원화 · 두 줄 메타
├── components/trading/lc/setting-group.tsx    # 두 줄 변형(SettingRow · CheckValueRow · DerivedRow) · 56px 상자(편집 중 포함)
├── components/trading/lc/number-pad-sheet.tsx # 환산 상태 줄(status 톤) · 잠금 문구
├── components/trading/lc/use-lc-field-commit.ts # 성공 · no-op 판정 금액 키 대응(Pitfall 1)
├── components/me/limit-chaser-defaults.tsx    # 행 교체 · userSettingsValuesOf(+amount · floorQty 0)
└── test-fixtures/limit-chaser.ts              # RelayLimitChaser 8 금액 · 폼 픽스처 만원화
webapp/e2e/specs/{trading-workbench,me,a11y}.spec.ts  # P31 시나리오 · 44px 단언 갱신 · 84 픽스처
docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md  # 답 2개 · status done · done_commit
```

### Pattern 1: shared §10 환산 한 벌 (D-02)
**What:** C# 5개 함수와 같은 식의 순수 함수에 8쌍 표를 더한다. webapp 이 이 함수를 호출하고, relay 테스트는 짝이 맞는 픽스처를 만들 때 쓴다.
**When to use:** 주를 산출하거나 만원을 역산하는 모든 자리에 쓴다. 행 표시, 시트 상태 줄, 제출, 검증, 자동 체크, 시딩, 파생 행이 여기에 해당한다.
```typescript
// Source: C# LimitChaserForm.cs:5691-5757 동형 (이름 · 파일은 재량)
/** C# NarrowQty — 서버가 int 로 좁혀 싣는다(uint32 아님). */
export const LC_QTY_WIRE_MAX = 2_147_483_647;
export const LC_AMOUNT_MAX_MANWON = 999_999_999;

export function qtyFromAmount(manwon: number, price: number): number {
  if (!(price > 0)) return 0;
  return Math.floor((manwon * 10_000) / price);          // ≤ 9.99e12 — 2^53 안
}
export function narrowQty(qtyRaw: number): number {
  if (!(qtyRaw > 0)) return 0;
  return qtyRaw > LC_QTY_WIRE_MAX ? LC_QTY_WIRE_MAX : qtyRaw;
}
export function amountFromQty(qty: number, price: number): number {
  if (!(price > 0) || !(qty > 0)) return 0;
  const p = qty * price;                                 // 극단값은 2^53 초과 가능 — Pitfall 14
  return Number.isSafeInteger(p) ? Math.floor((p + 5_000) / 10_000)
                                 : Number((BigInt(qty) * BigInt(price) + 5000n) / 10000n);
}
export function amountOrDerive(amount: number, qty: number, price: number): number {
  if (amount > 0 && (price === 0 || Math.floor((amount * 10_000) / price) === qty)) return amount;
  return amountFromQty(qty, price);
}
```

### Pattern 2: 8쌍 표 + 에코 메모를 server 에서 복원 (D-06 · WR-04)
**What:** C# `_echoQtyMemo` 는 상태를 가진 사전이다. 웹은 폼 기준값이 늘 `formFromServer(server)` 이므로 **메모를 server 에코에서 매번 다시 계산하면** 같은 불변식이 나온다. 별도 상태가 필요 없다. 미등록(server null)이면 메모가 없다 = 늘 내림이다. 이는 C# 이 키 변경 · 기본값 · 시딩 때 메모를 지우는 것과 같은 결과다.
```typescript
// 8쌍 — 정본 표 한 벌(webapp 행 · 제출 · 검증 · relay 테스트가 같이 읽는다)
export const LC_AMOUNT_PAIRS = [
  { amount: 'buyWatchAmount',     qty: 'buyWatchQty',     price: 'buyWatchPrice' },
  { amount: 'buyMinTradeAmount',  qty: 'buyMinTradeQty',  price: 'buyWatchPrice' },
  { amount: 'extraBuyMinAmount',  qty: 'extraBuyMinQty',  price: 'buyWatchPrice' },
  { amount: 'extraBuyMaxAmount',  qty: 'extraBuyMaxQty',  price: 'buyWatchPrice' },
  { amount: 'postBuyFloorAmount', qty: 'postBuyFloorQty', price: 'buyWatchPrice' },
  { amount: 'sellWatchAmount',    qty: 'sellWatchQty',    price: 'sellWatchPrice',
    track: 'sellQtyTrackEnabled',   baseline: 'sellQtyTrackBaseline' },
  { amount: 'sellMinTradeAmount', qty: 'sellMinTradeQty', price: 'sellWatchPrice' },
  { amount: 'cancelWatchAmount',  qty: 'cancelWatchQty',  price: 'sellWatchPrice',
    track: 'cancelQtyTrackEnabled', baseline: 'cancelQtyTrackBaseline' },
] as const;

/** 에코가 그 칸에 쓰는 값 = C# ApplyServerConfig + RememberEchoQty (LimitChaserForm.cs:6240-6357). */
export function echoAmountOf(server, pair): { shown: number; qty: number; price: number } {
  const price = server[pair.price];
  const tracking = 'track' in pair && server[pair.track];
  const qty = tracking ? server[pair.baseline] : server[pair.qty];
  const shown = tracking ? amountFromQty(qty, price) : amountOrDerive(server[pair.amount], server[pair.qty], price);
  return { shown: Math.min(shown, LC_AMOUNT_MAX_MANWON), qty, price };   // C# Clamp(Maximum) 동형
}
/** C# QtyForSubmit + NarrowQty — 칸 값 · 비교가가 에코가 쓴 그대로면 서버 주(추적 ON 은 기준선). */
export function qtyForSubmit(amount: number, price: number, echo: { shown: number; qty: number; price: number } | null): number {
  if (echo !== null && amount === echo.shown && price === echo.price) return narrowQty(echo.qty);
  return narrowQty(qtyFromAmount(amount, price));
}
```
> `echo.shown` 은 Clamp 한 뒤의 값이다. C# 메모의 Item1 도 「Clamp 뒤 실제 칸 값」이다 [VERIFIED: LimitChaserForm.cs:305-313 주석].

### Pattern 3: 폼 키 = 금액, 주는 `buildCfg` 산출 (재량 — 권고)
**What:** `LimitChaserFormValues` 에서 주 8키를 빼고(지금 `buyOrderQty` 등 3개를 빼는 Omit 목록에 더한다) 금액 8키를 편집 키로 쓴다. `RelayLimitChaserInput` 은 주 · 금액 둘 다를 **필수**로 요구하므로, `buildCfg` 가 주 8을 빠뜨리면 컴파일이 막는다(기존 「shared 는 새 클라 계약 — 필수」 규약).
**Why:** 주를 폼에 남기면 「어느 쪽이 정본인가」가 두 벌이 된다. 메모를 server 에서 복원하므로 읽기 전용 주 사본도 필요 없다. 행 id(`lc-buy-watch-qty` 등)는 **그대로 둔다** — e2e `data-lc-field` 셀렉터 · 인라인 id 가 안정적이다.
```typescript
// limit-chaser-form.tsx buildCfg 확장 — server 는 serverRef.current(훅과 같은 렌더 값)
const qtys = Object.fromEntries(LC_AMOUNT_PAIRS.map((p) => [
  p.qty, qtyForSubmit(values[p.amount], values[p.price], server ? echoAmountOf(server, p) : null),
]));
return { ...values, ...qtys, isin, accountNo, exchange, crud: crudOf(values), /* 기존 3벌 · 고정 3 */ };
```
`formFromServer` 는 금액 8키를 `echoAmountOf(server, pair).shown` 으로 채운다(D-06). **구서버 에코(buy3Schema 0)** 도 금액 0 이므로 같은 식으로 역산 표시된다.

### Pattern 4: 거부 판정 — 문장 산출 한 곳 (D-03/D-04)
**What:** C# 은 제출 1회마다 cfg **전체**를 검사한다. 웹에서 이에 해당하는 것이 `armBlockOf(next)` 다 — 끄는 방향이 아니면 모든 확정이 거친다(`use-lc-field-commit.ts` `sendNow`: `const blocked = turningOff ? null : (armBlockOf?.(next) ?? null)`) [VERIFIED: use-lc-field-commit.ts:615-616]. 그래서 게이트 루프 뒤에 「환산 검사」 한 함수를 붙이는 것이 C# 순서와 가장 가깝다. 지금 한방가격 줄이 바로 이 자리에 붙어 있다. 철거 면제(`isDeleteIntent`)는 그대로 둔다.
- 판정 입력은 `next` 와 `server`(메모) 둘이다 → `armBlockOf` 시그니처에 server 를 더하거나 `serverRef` 를 쓴다.
- `canArmOf.sell` 의 `values.sellWatchQty > 0` 은 **환산 주**로 바꾼다. relay `#strategyArmable` 은 산출된 cfg 주를 보므로 같은 식의 양 끝이 유지된다(무변경).
- 시트 잠금(D-08)은 `padIssue` 의 ctx 가 아니라 기존 `validate(value)` prop 이 더 맞는다. 비교가 · 메모가 필드마다 다르기 때문이다 — `NumberPadSheet` 의 `validate` 는 「문장을 돌려주면 확정을 잠그고 그 문장을 상태 줄에 보인다」 [VERIFIED: number-pad-sheet.tsx:91-93 · 158]. 환산 안내 「= N주 (비교가격 P원)」는 잠금이 아니므로 **새 status 톤 줄**(새 prop, 예: `hint(value)`)이 필요하다. 우선순위는 현행 사슬(issue > failure > warn > otherDevice > armed) 맨 뒤 또는 armed 앞이다 — UI-SPEC 이 정한다.

### Pattern 5: /me 행 교체 + 42 조립 (D-13/D-14)
```typescript
// limit-chaser-defaults.tsx
{ key: "postBuyFloorAmount", label: "후매수 최소", unit: "만원", group: "후매수", id: "me-lc-post-buy-floor-amount" },
// userSettingsValuesOf: postBuyFloorQty: 0 (봉인 — 84 값 무시) · postBuyFloorAmount: s.postBuyFloorAmount
// relay buildSetUserSettingsReq: UserSettings.addPostBuyFloorQty(b, 0) 고정 + addPostBuyFloorAmount(b, toWireUint(s.postBuyFloorAmount, …))
```
- `UserSettingsKey = keyof RelayUserSettingsValues` 이고 `userSettingsValuesIssue` 는 `USER_SETTINGS_ROWS` 만 돈다 [VERIFIED: limit-chaser-defaults.tsx:66 · 186-192]. 그래서 봉인 칸(행에서 빠짐)은 범위 검사에서 자연히 빠지고 0 이 실린다.
- 봉인 0 은 **relay 조립기에서 고정하는 것이 권고안**이다. 웹이 0 을 싣더라도, 구 탭이 `postBuyFloorQty: 100000` 을 싣는 경우까지 한 지점에서 막는다.

### Anti-Patterns to Avoid
- **주 기본값을 만원으로 「이전」:** `DEFAULT_POST_BUY_FLOOR_QTY 100_000` 등을 환산해 옮기지 않는다. D-12 · gh-trade D-24 에 따라 버리고 0 으로 둔다.
- **두 곳에 공식 쓰기:** `buyOrderQtyFromAmount` 와 새 `qtyFromAmount` 가 같은 식이다. 새 코드는 shared 를 부른다(기존 3벌 전환은 선택).
- **수량 칸을 시트 「지금」 서버값으로 원값 비교:** 「다른 단말에서 바뀌었어요」 판정(`otherDevice`)도 에코 적용값(`shown`)으로 본다(D-08).
- **줄매수 최소>최대를 주로 비교:** C# 은 금액끼리 비교한다(단조 근거). 웹도 금액 키로 비교한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 만원↔주 환산 · 짝 검사 · 메모 | 컴포넌트마다 `Math.floor(x*10000/p)` | shared 한 벌(Pattern 1·2) | 행 · 시트 · 제출 · 검증 · 자동 체크 · 시딩이 같은 값을 봐야 한다. C# 도 「제출·검증·툴팁·자동 체크가 같은 이 함수를 본다 — 둘이 갈리면 화면이 거짓말을 한다」 [VERIFIED: LimitChaserForm.cs:5708-5711] |
| 생성 코드 수정 | `relay/src/generated/**` 손편집 | `sync-relay-schema.sh`(gh-trade 소유) | 다음 동기화에서 소실된다 |
| 에코 메모 상태 | `useRef` 사전 · 이펙트 동기화 | `echoAmountOf(server, pair)` 순수 재계산 | 폼 기준값이 이미 server 파생이라 상태가 필요 없다 |
| 42 봉인 0 | 웹 각 경로에서 0 맞추기 | relay `buildSetUserSettingsReq` 한 줄 고정 | 구 탭 · 새 탭 모두 한 지점에서 처리된다 |
| 숫자 서식 | 새 포맷터 | `formatSettingValue(v, '만')`(`Intl.NumberFormat('ko-KR')`) | 단위만 바꾸면 「1,000만」이 된다 |

**Key insight:** 이 phase 의 위험은 공식이 아니라 **「같은 값을 여러 곳이 각자 계산하는 것」**이다. 행에는 777주가 보이는데 제출에는 778주가 실리는 순간이 오발주 표면이다.

## Runtime State Inventory

> rename 이 아니라 계약 append 다. 다만 운영 데이터가 one-way 이므로(D-10) 점검 결과를 남긴다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | gh-trade 서버 `strategy_state.toml` 의 금액 8키 · `user_settings.toml` 의 `post_buy_floor_amount`(운영 서버는 **미배포** — 120·119 는 master `da762186` 로 재배포 [VERIFIED: gh-trade .planning/STATE.md:35]). Supabase 에는 없다 | 코드 수정만. 데이터 이전 없음. 단 **웹이 0 을 보내는 경로를 만들지 않는다**(D-10) |
| Live service config | relay 의 사용자별 84 캐시(`#userSettings` 메모리) · lc 캐시. 재배포하면 비워진다 | 없음(재기동 뒤 84 · 64 로 다시 채워진다) |
| OS-registered state | 없음 — 확인: 새 MsgType · 잡 · 스케줄 없음 | 없음 |
| Secrets/env vars | 없음 — 새 env 없음 | 없음 |
| Build artifacts | `packages/shared/dist`(tsup) — relay · webapp 이 dist 를 읽는다 | 변경 뒤 `pnpm --filter @gh-radar/shared build` 를 먼저 돌린다(config `build_command` 첫 단계) |

## Common Pitfalls

### Pitfall 1: 성공 판정이 금액 원값 비교라 구 gh-trade 서버에서 모든 수량 확정이 「반영하지 못했어요」
**What goes wrong:** 훅은 `server[field] === value` 로 성공 · no-op · 늦은 에코를 판정한다 [VERIFIED: use-lc-field-commit.ts:405 `if (server[field] !== value) return false;` · 857 `const matches = server != null && server[inf.field] === inf.value;` · 917 `if (server[f] === fail.value) markSuccess(f);`]. 그런데 운영 gh-trade 서버는 Phase 32 미배포라 vtable 158~172 를 무시하고 에코 금액은 늘 0 이다. 그래서 1,000만을 확정해도 `server.sellWatchAmount === 0` 이 되어 타임아웃 · 실패 말풍선이 뜬다.
**Why it happens:** 금액 3칸(`buyOrderAmount`)은 서버가 늘 에코해 왔으니 원값 비교로 충분했다. 새 8필드는 서버 배포 전까지 에코되지 않는다.
**How to avoid:** 8 금액 키의 「서버가 이 값인가」를 한 함수로 정의한다. 권고안: `echoAmountOf(server, pair).shown === value`, 또는 「에코 금액 = 0 ∧ 에코 주 = 보낸 주」 중 하나라도 맞으면 성공. 보낸 주는 in-flight 기록에 실린 cfg 에 이미 있다(`setInflight({...p, …})` 가 cfg 를 들고 있지 않으면 추가). 역산 반올림 때문에 `shown` 만 보면 1,001만 → 777주 → 1,000만처럼 어긋날 수 있다. 그래서 **주 대조를 반드시 함께 둔다.**
**Warning signs:** 미리보기(D-17)에서 수량 칸 확정 뒤 3초 「반영하지 못했어요」.

### Pitfall 2: `isMasterOnlyDelta` 가 금액 표현 차이로 D-02 후반 자동 끔을 영구 억제
**What goes wrong:** `isMasterOnlyDelta(cfg, echo)` 는 cfg 키 전부를 에코와 `===` 로 비교한다 [VERIFIED: webapp/src/lib/limit-chaser.ts:735-741]. 에코 금액이 0(구 서버 · 구 relay 재제출)이거나 짝이 아니면, 폼은 역산값을 싣고 에코는 0 이라 서로 다르다. 그러면 「순수 델타 아님」으로 판정돼 서버 접힘 뒤 마스터 OFF(`limit-chaser-form.tsx:1289`)가 나가지 않는다.
**How to avoid:** 8 금액 키는 「cfg 금액 === `echoAmountOf(echo, pair).shown` 이고 cfg 주 === 메모 주」면 같다고 본다. 이 판정을 Pitfall 1 과 같은 함수로 둔다.

### Pitfall 3: 구 운영 webapp + 새 relay → /me 저장이 소켓 4400 종료 (D-14 「필수」)
**What goes wrong:** D-17 로 이번 phase 동안 운영 webapp 은 구판이다. D-18 로 relay 는 먼저 배포된다. 구판 /me 는 11값만 보낸다. 새 zod 가 `postBuyFloorAmount` 를 필수로 요구하면 `parseInbound` 가 null 을 돌려주고 close(4400)로 이어진다 [VERIFIED: protocol.ts:620-640 「호출자는 `null` 을 close(4400) 로 처리한다」]. 그 소켓의 시세 · 에코 · 수동주문이 모두 끊긴다. 반대로 「선택 + 부재 = 0」으로 두면 42 는 전체 교체라서 C# 이 넣은 후매수 최소를 0 으로 지운다.
**How to avoid (권고 — 사용자 확인 필요, Open Q1):** zod 는 `postBuyFloorAmount` 를 `optional()` 로 둔다. fanout `user.settings.set` 에서 부재면 `this.#hub.getUserSettings(userId)?.postBuyFloorAmount` 를 되싣는다(캐시 없으면 소켓을 끊지 않는 거부 프레임 1건 — `LC_LEGACY_SET_REJECT_TEXT` 선례). `postBuyFloorQty` 도 선택으로 바꾸고 조립기가 0 을 고정한다. 구 탭의 84 소비를 깨지 않도록 **84 → `user.settings` 에 `postBuyFloorQty` 는 계속 싣는다**(봉인 · 웹은 읽지 않음).
**Warning signs:** Cloud Logging `relay_docker` 에 `[WS] 인바운드 스키마 위반 path=s.postBuyFloorAmount`.

### Pitfall 4: 목업 · CONTEXT 예시 수치가 10배 틀렸다
**What goes wrong:** CONTEXT specifics 와 목업 C 는 「비교가 12,870원 · 1,000만 → 7,770주 · 25,000주 → 3,218만」이라고 적었다. 실측은 다르다 — `qtyFromAmount(1000,12870)=777`, `amountFromQty(25000,12870)=32175`, 7,770주가 나오려면 10,000만이어야 한다 [VERIFIED: node 실행 출력 `1000만@12870 -> 777 주` · `25000주@12870 -> 32175 만` · `10000만@12870-> 7770`].
**How to avoid:** 테스트 수치를 공식으로 생성하거나 아래 검증표를 쓴다. UI-SPEC · SUMMARY 의 예시 문구도 고친다. 「500만 → 0주」(D-08)도 예시일 뿐이다. 12,870원에서 500만은 388주다. 0주는 `만원 < 비교가/10000` 일 때만 나온다(예: 127,400원에서 12만 → 0주, 13만 → 1주).

| 비교가 | 만원 | 주(내림) | 역산(반올림) |
|---|---|---|---|
| 12,870 | 1,000 | 777 | 1,000 |
| 12,870 | 1,001 | 777 | 1,000 (짝 아님 → 역산 표시가 원값과 다름) |
| 12,870 | 10,000 | 7,770 | 10,000 |
| 12,870 | — | 25,000(발동) | 32,175 |
| 127,400 | 12 | 0 | — (0주 거부 · 접미 「 (12만 → 0주)」) |
| 127,400 | 13 | 1 | 13 |

### Pitfall 5: 주 좁힘 상한은 uint32 가 아니라 int.MaxValue
**What goes wrong:** D-02 는 「uint32 로 좁힘」이라고 적었다. 그러나 C# `NarrowQty` 는 `int.MaxValue`(2,147,483,647)에서 자른다 [VERIFIED: LimitChaserForm.cs:5728-5732]. 웹이 자르지 않으면 999,999,999만 @ 저가주에서 주가 9.99e12 가 되고, relay `toWireUint` 가 `OrderBuildError("UINT_RANGE")` 로 거부 프레임을 낸다 [VERIFIED: envelope.ts:1362-1367 · `MAX_UINT32 = 4_294_967_295` 1351].
**How to avoid:** `narrowQty` 를 C# 동형(int.MaxValue)으로 둔다(WinForms 동형 기본). 기존 `UINT32_MAX` 클램프(상장주식수 시딩)는 만원 시딩으로 바뀌면서 사라진다.

### Pitfall 6: 추적 ON 재제출이 래칫을 되돌리던 현행 웹 갈림 — D-06 은 행동 변화다
**What goes wrong:** 서버는 재제출(UpdateConfig) 때 `baseline = cfg.sellWatchQty` 로 리셋한다(Q4). 그래서 C# 은 추적 ON 이면 호가잔량 칸에 **현재 기준선**을 싣는다 [CITED: gh-trade docs/strategy/limit-chaser.md:1956-1959 「리셋: UpdateConfig(재제출) 시 baseline = cfg.sellWatchQty (Q4) / 재제출 시 클라는 추적 ON 이면 호가잔량 칸에 현재 기준선을 싣는다」 · 3432]. 현행 웹은 `formFromServer` 가 `sellWatchQty: server.sellWatchQty`(cfg 원값)를 넣는다 [VERIFIED: limit-chaser.ts:682]. 그 결과 추적 ON 상태에서 웹이 아무 칸이나 확정하면 기준선이 cfg 로 내려간다. 취소도 같다(§6-4 Q4).
**How to avoid:** Pattern 2 의 `track` · `baseline` 분기가 이 문제를 고친다. **새 행동이므로 테스트로 고정한다**: 추적 ON · 기준선 > cfg 인 에코 → 다른 칸 확정 → cfg `sellWatchQty === baseline`.
**Warning signs:** 매도 · 취소 행의 위 줄이 이제 기준선 역산값이 된다. 사용자 눈에는 「매수잔량 값이 바뀌어 보인다」로 나타난다. 「잔량추적 기준선」 파생 행과 같은 값이 두 번 보인다 — UI-SPEC 에서 문구로 정리한다.

### Pitfall 7: 행 높이 44 불변 계약 · e2e 백스톱이 두 줄 행과 충돌
**What goes wrong:** `setting-group.tsx` 머리 주석은 「행 높이는 언제나 44px 다 … 편집 중인 행만 `<button>` → `<div>` … 레이아웃 이동이 0」이다 [VERIFIED: setting-group.tsx:12-13 · `ROW_BOX` 77-78 `min-h-[44px]`]. 체크 값 행(`CheckValueRow` 814 · 852)과 파생 행(`DerivedRow` 926)도 44 를 쓴다. e2e P24-7 은 `Math.abs(r.h - 44) > 0.5` 인 행이 없어야 하고(spec:3728), P20-3 은 편집 전후 44(spec:4504 · 4530-4538)를 단언한다.
**How to avoid:** 두 줄 변형은 **편집 중 상자도 56px** 로 둔다(레이아웃 이동 0 유지 — 인라인 편집기를 위 줄 자리에 두고 아래 줄을 유지하거나 같은 높이를 확보). 백스톱은 「8 수량 행 + 파생 2행 = 56, 나머지 44」로 갱신한다. 값 슬롯(`data-slot="lc-row-value"`)은 위 줄 「1,000만」만 담고 아래 줄은 별도 슬롯으로 둔다. 폭 백스톱 L3(폰 밴드 쉐브런 숨김) 규칙은 그대로다. P24-8(폰 한 화면 ≤ 660px)은 세 카드가 접힌 상태라 영향이 거의 없다 — 매수주문 카드에는 수량 행이 없다 [VERIFIED: e2e/specs/trading-workbench.spec.ts:3989-4058].

### Pitfall 8: 자동 체크 · 사전 검증이 아직 주 키를 본다
**What goes wrong:** `groupAutoChecksOf` 는 `values.sellWatchQty === 0` · `cancelWatchQty` · `sellMinTradeQty` 로 사유를 만든다 [VERIFIED: limit-chaser.ts:518-521]. `groupPrechecksOf` 의 줄매수 최소>최대도 주 키를 본다(limit-chaser-form.tsx:475). C# 은 「임계 판정은 가격 채움 뒤 환산 주로 한다 — 제출 검증과 같은 QtyForSubmit 값」이다 [VERIFIED: LimitChaserForm.cs:7450-7455].
**How to avoid:** 자동 체크는 **빈 매도 가격을 상한가로 채운 뒤**(같은 함수 ① 단계) 그 매도 비교가로 환산한 주를 본다. 사유 문구 「매도 매수잔량 0」 등에 접미를 붙일지는 UI-SPEC 이 정한다.

### Pitfall 9: 상장주식수 시딩은 비교가가 있어야 한다
**What goes wrong:** 현행 시딩 이펙트는 `[listShares, server]` 만 보고 주를 바로 채운다 [VERIFIED: limit-chaser-form.tsx:759-769]. 만원으로 바꾸면 매수 비교가(`buyWatchPrice`)가 필요하다. C# 은 「아직 0 이면 가드를 소진하지 않고 미룬다」 · 매도 체결 칸만 매도 비교가를 쓴다 [VERIFIED: LimitChaserForm.cs:1469-1481].
**How to avoid:** `seededRef` 소진 조건에 「`formRef.current.buyWatchPrice > 0`」을 더하고, 의존성에 그 값(또는 `upperLimit`)을 넣는다. 값은 `Math.min(amountFromQty(pct, price), 999_999_999)`(C# Clamp).

### Pitfall 10: 84 를 모르는 relay(구판)와 새 webapp 미리보기
**What goes wrong:** relay 를 배포하기 전에 미리보기를 올리면 `user.settings` 에 `postBuyFloorAmount` 가 없다(undefined). 그러면 /me 행이 NaN 을 그리고, 새 폼 시딩 `fitsLcRange(undefined)` 가 false 로 떨어진다. 저장하면 구 relay zod 가 미지 키를 떨어뜨리고 42 에 금액 부재 = 0 이 실린다. **새 gh-trade 서버라면 C# 값이 0 으로 지워진다.**
**How to avoid:** 순서를 relay 배포 → 미리보기 배포로 고정한다(D-18 허용). 웹은 `typeof s.postBuyFloorAmount !== 'number'` 이면 그 행을 「—」로 두고 저장을 잠근다(방어).

### Pitfall 11: 이름 혼동 — `post_buy_floor_*` 는 두 테이블에 다 있다
`SetLimitChaser.post_buy_floor_qty` 는 **살아 있는 서버 비교값**이다(봉인 아님). `post_buy_floor_amount`(166)가 새로 생겼다. `UserSettings.post_buy_floor_qty` 는 **봉인**(0 싣기)이고 `post_buy_floor_amount`(28)가 새로 생겼다. 「봉인 0」 규칙을 상따 cfg 의 `postBuyFloorQty` 에 적용하면 후매수 최소가 0(서버 의미 「없음」)이 된다.

### Pitfall 12: AMT-01 `--check` 는 마커를 대조하지 않는다 · 작업 트리 기준이다
**What goes wrong:** `--check` 출력은 「신규/변경 예정」(.ts cmp)과 「.fbs 사본 최신 (마커 7줄 제외 본문 동일)」뿐이다 [VERIFIED: gh-trade server/scripts/sync-relay-schema.sh:226-298]. 마커(`server-repo-commit`)가 달라도 「최신」으로 나온다. 마커 비교는 비-check 반영 모드의 `MARKER_SAME` 에만 있다(310-317). 또 스크립트는 **gh-trade 작업 트리의 FBS** 를 읽는다. 지금 gh-trade 체크아웃은 `feature/limitchaser-amount-unit` 이다(`git branch` 실측 · origin 대비 ahead 31). `RELAY=` 를 생략하면 `../../gh-radar/relay` 메인 체크아웃에 쓴다.
**How to avoid:** ① gh-trade 를 전환하지 말고 `git -C /Users/alex/repos/gh-trade worktree add <tmp> master`(또는 `origin/master`) 로 master 트리를 만든 뒤 `RELAY=/Users/alex/repos/gh-radar/relay <tmp>/server/scripts/sync-relay-schema.sh --check` 를 돌린다. ② 마커는 `git -C gh-trade log -1 --format=%h master -- server/src/protocol/StockDMA.fbs` 를 `relay/src/generated/StockDMA.fbs:3` 의 `server-repo-commit: e5b4fbca` [VERIFIED: 파일 3행] 와 대조한다. ③ 다르면 반영 모드로 재생성하고 경로를 지정해 커밋한다(`relay/src/generated/`). 병합 방식(merge · squash · rebase)에 따라 해시가 바뀔 수 있다.
**Warning signs:** 실행 시점에 gh-trade master 가 아직 병합 전이다 — 이번 세션 실측 `git merge-base --is-ancestor feature/limitchaser-amount-unit master` → `NOT_MERGED`.

### Pitfall 13: 배포 · push 경계
- relay · Vercel 배포는 **메인 세션**이 한다(서브에이전트는 분류기가 차단한다). 플랜에서는 `checkpoint:human-action` 또는 「메인 세션 단계」로 둔다.
- Vercel: repo **root** 에서 실행한다(`rootDirectory=webapp`). `--prebuilt` 는 prod 빌드만 되므로 `--prod --skip-domain` 을 쓴다. 전후에 `vercel inspect https://trade.jx1.io` 를 확인한다.
- relay: 20:00 KST 이후, `git status -sb` 를 확인하고, phase 30 세션에 알린다. 배포 명령은 허용 규칙 접두사 그대로 쓴다(`yes |` · 출력 파이프 금지).
- **push 하지 않는다**(D-17). phase 가 끝나면 origin/master 위로 rebase 한다.

### Pitfall 14: JS 정밀도 — 주 × 가격 역산
`amountFromQty` 의 `qty × price` 는 2^53(9.007e15)을 넘을 수 있다(예: 2,147,483,647주 × 5,000,000원 ≈ 1.07e16). C# 은 long 이라 정확하다. 실사용 값(상장주식수 3% · 가격 수십만)에서는 안전하지만, 극단값 단위 테스트를 위해 BigInt 경로를 둔다(Pattern 1). `qtyFromAmount` 는 9.99e12 이하라 안전하다.

### Pitfall 15: 동시 세션 테스트 · 메모리
메모리(10-10 Mac 멈춤): vitest `--maxWorkers=2`, playwright `--workers=1`, 전체 회귀는 한 세션만 돌린다. e2e webServer 가 타임아웃되면 `rm -rf webapp/.next` 를 한다. webapp `test` 스크립트는 `vitest --run`, shared 는 watch 이므로 `exec vitest run` 을 쓴다.

## Code Examples

### relay — zod · LcSetCfg · 조립 · 파서 (D-11)
```typescript
// relay/src/ws/protocol.ts RelayLcSetSchema.cfg — postBuyAuto 와 같이 12필드 블록 「밖」(buy3CfgOf · lcBuy3SchemaOf 무관)
buyWatchAmount: UIntSchema.optional(),      // 단위 만원 · 보관/에코만 · 부재 = 0 (gh-trade D-06)
buyMinTradeAmount: UIntSchema.optional(),
extraBuyMinAmount: UIntSchema.optional(),
extraBuyMaxAmount: UIntSchema.optional(),
postBuyFloorAmount: UIntSchema.optional(),
sellWatchAmount: UIntSchema.optional(),
sellMinTradeAmount: UIntSchema.optional(),
cancelWatchAmount: UIntSchema.optional(),

// relay/src/dma/envelope.ts — LcSetCfg: shared 입력에서는 필수 · relay 와이어에서는 선택
type LcAmountKey = 'buyWatchAmount' | 'buyMinTradeAmount' | 'extraBuyMinAmount' | 'extraBuyMaxAmount'
  | 'postBuyFloorAmount' | 'sellWatchAmount' | 'sellMinTradeAmount' | 'cancelWatchAmount';
export type LcSetCfg = Omit<RelayLimitChaserInput, /* 기존 */ … | LcAmountKey> & { /* 기존 선택 */ } & Partial<Pick<RelayLimitChaserInput, LcAmountKey>>;

// buildSetLimitChaserReq — extra_buy_auto 뒤, endSetLimitChaser 앞. 0 은 FlatBuffers 기본값이라 버퍼에 안 쓰인다(= 부재 = 서버 0 저장 · 같은 뜻)
SetLimitChaser.addBuyWatchAmount(b, toWireUint(cfg.buyWatchAmount ?? 0, "buyWatchAmount"));
// … 8줄

// readLimitChaser — 「서버가 모른다」가 아니라 「구 서버 · 구 relay 재제출이면 0」. 역산은 웹 몫.
buyWatchAmount: t.buyWatchAmount(), /* … 8 */
// parseUserSettings
postBuyFloorAmount: u.postBuyFloorAmount(),   // vtable 28 · 구 84(부재) = 0
```

### webapp — 두 줄 행 표시 문자열
```typescript
// lcValueTextOf 확장(위 줄) + 아래 줄 산출 — 한 함수에서(행 · 요약 · 시트 「지금」 · aria 가 같은 출처)
const top = `${NUM.format(amount)}만`;
const sub = price === 0 && amount > 0 ? '비교가격 필요'           // --destructive
          : pair.amount === 'extraBuyMaxAmount' && qty === 0 ? '무제한'
          : `${NUM.format(qty)}주`;                               // qty = qtyForSubmit(...) — 제출과 같은 값
// aria-label: 「선매수 매도잔량 1,000만 777주」 (CONTEXT 재량 — 예시 수치는 Pitfall 4 로 정정)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 수량 임계 9칸 주 입력 | 만원 입력 · 제출 1회 내림 환산 · 금액 원값 보관/에코 | gh-trade Phase 32(2026-10-11, 미병합) | 웹 폼 값 모델 전환 |
| UserSettings `post_buy_floor_qty`(주) 기본값 | `post_buy_floor_amount`(만원) · 주 필드 봉인 | 같음 | /me 행 교체 · 42 12값 |
| C# 툴팁 「N주 (환산가 P원)」 | 「N주」(c323c27e) · 100ms | gh-trade c323c27e | D-16 노트 답에 한 줄 |
| 54 사유 「매수1잔량 15,000 ≤ 임계 10,000」 | 「매수1잔량 150만(15,000주) ≤ 임계 100만(10,000주)」(비교가 0 이면 종전) | gh-trade 3e5760d2 | 웹은 원문 표시라 무변경 — 웹에 54 숫자 파서 없음 [VERIFIED: grep 0건] |

**Deprecated/outdated:**
- `defaultLimitChaserForm` 의 주 상수(10,000 · 30,000 · 10 · 100,000)는 0 으로 바꾸고 상수를 버린다(D-12).
- `USER_SETTINGS_SEED_MAP` 의 `['postBuyFloorQty','postBuyFloorQty']` 는 `['postBuyFloorAmount','postBuyFloorAmount']` 로 바꾼다.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | gh-trade master 병합 뒤에도 FBS 본문은 e5b4fbca 와 같다(병합으로 fbs 가 바뀌지 않는다) | AMT-01 · Pitfall 12 | 본문이 바뀌면 생성물을 재생성하고 relay 코드도 다시 맞춰야 한다 |
| A2 | 병합 뒤 `git log -1 master -- FBS` 의 해시는 병합 방식에 따라 e5b4fbca 이거나 새 해시다 | Pitfall 12 | 마커 재생성 커밋 1건이 더 필요할 수 있다(위험 낮음) |
| A3 | phase 31 진행 중 운영 webapp(구판)이 새 relay 에 붙어 /me 를 저장할 수 있다 | Pitfall 3 | 틀리면 D-14 「필수」를 유지해도 된다 |
| A4 | 실사용 수량 × 가격은 2^53 미만이다(극단값만 BigInt 가 필요) | Pitfall 14 · Pattern 1 | 극단값 테스트에서만 1 차이가 난다 |
| A5 | shared 파일명 `lc-amount.ts` · 함수명은 재량 제안이다 | Pattern 1·2 | 없음(이름만) |
| A6 | 웹 성공 판정을 「shown 일치 ∨ (에코 금액 0 ∧ 주 일치)」로 바꾸면 구 · 신 서버 모두에서 성공한다 | Pitfall 1 | 판정이 약해 오탐이 생길 수 있다 — 주 대조를 함께 두어 줄인다 |

## Open Questions (RESOLVED)

> 2026-10-11 플래닝 리비전에서 7개 모두 해소 — 질문마다 아래 **RESOLVED** 줄이 근거(CONTEXT 결정 · UI-SPEC 표 · 담당 플랜)를 가리킨다. 미해소 질문 없음.

1. **D-14 「필수」 vs 구 운영 webapp 4400(Pitfall 3)**
   - What we know: 운영 webapp 은 구판이고(D-17 push 금지), relay 는 먼저 배포된다(D-18). zod 위반은 소켓을 닫는다.
   - What's unclear: 사용자가 이 창(창 길이 = gh-trade 병합 · 우리 push 까지)을 감수할지.
   - Recommendation: zod `optional` + fanout 84 캐시 되싣기 + 캐시 없으면 비종료 거부 프레임. `postBuyFloorQty` 도 선택으로 두고 조립기가 0 을 고정한다. discuss 결정 변경이므로 플래너가 사용자에게 한 줄로 확인받는다(권고는 WinForms 무관 · relay 안정성 근거).
   - **RESOLVED:** CONTEXT D-14 「2026-10-11 플래닝 보정」 으로 확정 — relay zod `postBuyFloorAmount` 는 `UIntSchema.optional()`, 부재(구 탭 11값)면 relay 가 84 캐시 금액을 되싣고 캐시가 없으면 소켓을 닫지 않는 거부 프레임 1건 · 새 webapp 은 12값 전부. 구현 31-03 Task 1(must_haves 「D-14 보정 · Pitfall 3」).
2. **D-10 「추적 ON 되싣기 때 금액은 에코 원값」 vs C# 「칸 값(기준선 역산)」**
   - What we know: C# 은 추적 ON 이어도 `s.SellWatchAmount = (uint)numSellWatchQty.Value`, 즉 기준선 역산값을 싣는다 [VERIFIED: LimitChaserForm.cs:5428-5429].
   - What's unclear: D-10 의 「에코 원값」이 「에코가 칸에 쓴 값」인지 「에코 금액 필드 원값」인지.
   - Recommendation: WinForms 동형(칸 값 = `echo.shown`)으로 한다. 추적 ON 동안에는 표시가 늘 기준선 역산이라 저장 금액이 화면에 영향을 주지 않는다. 이 경우 SC2 의 「짝 또는 0」은 반올림 오차 범위 안에서만 성립한다 — 테스트는 메모 경로에서 짝 등식을 단언하지 않는다.
   - **RESOLVED:** 권고대로 WinForms 동형 — 재제출 금액 = 칸 값(`echoAmountOf(...).shown`, 추적 ON 이면 기준선 역산). 31-01 「Flagged assumptions — D-10 「에코 원값」 해석」 · must_haves(추적 ON 에코 재제출 = 주 1554 · 금액 2000)로 고정.
3. **취소 0 검사 신설 여부(D-04 「기존 0 검사」)**
   - What we know: 웹에는 매도 매수잔량 0(무장 가드)과 자동 체크 사유만 있다. C# 의 「취소 잔량 0」 · 「취소 체결 0」 · 「매도 비교가 0(anyCancel)」 차단은 **웹에 없다**(grep 실측) — 지금은 서버가 ERROR 로 취소를 눕힌다.
   - Recommendation: WinForms 동형 기본에 따라 `armBlockOf` 환산 검사에 함께 넣는다(접미 포함). 신규 차단이므로 UI-SPEC 문구표에 올린다.
   - **RESOLVED:** 신설로 확정 — UI-SPEC 「등록(무장) 차단 문구」 표 7(취소 잔량 환산 0주) · 8(취소:체결 · 매도 체결 환산 0주) 행 + 접미, 「매도 비교가 0(anyCancel)」 은 2 · 7 · 8 이 먼저 잡아 문장을 따로 두지 않는다. 구현 31-06 Task 1(`armBlockOf` 환산 검사 · 순서 · 접미).
4. **취소 「잔량추적 기준선」 파생 행** — D-05 는 `cancelQtyTrackBaseline` 도 말하지만 웹에는 매도 기준선 파생 행만 있다 [VERIFIED: lc-fields.ts:455 · limit-chaser-form.tsx:1616]. 권고: 새 행을 만들지 않는다(새 능력). 취소 칸 자체가 추적 ON 이면 기준선 역산을 보인다(D-06).
   - **RESOLVED:** 권고대로 — 31-06 must_haves 「취소 기준선 파생 행은 만들지 않는다」, 취소 칸의 추적 ON 기준선 역산 표시 · 재제출 되싣기는 31-01 `echoAmountOf` 쌍 표(cancelWatch track/baseline) · 31-04 must_haves(D-06).
5. **요약 줄 · 의미어** — `lcSummaryOf` 의 「매도잔량 N주」 · 「최소 1주/없음」 · 「최대 무제한」 · 발동잔량 주 표기를 만원으로 바꿀지, 두 줄 아래 줄 의미어(최소 0 → 「1주」 · 후매수 최소 0 → 「없음」)를 어떻게 할지는 UI-SPEC(ui-phase) 몫이다.
   - **RESOLVED:** UI-SPEC 「접힌 카드 요약 줄」(Open Q5 — 이 계약이 정한다) · 「값 0 표시」 표로 확정 — 요약 kv 는 위 줄 만원 글자 하나 · 금액 0 은 의미어(「최대 무제한」 · 「최소 1주」 · 「최소 없음」). 구현 31-04 Task 2(`lcSummaryOf` · `lcAmountZeroWordOf`), 두 줄 아래 줄 의미어는 31-06(`lcQtyRowSubOf`).
6. **AMT-01 시점** — 실행 시점에 gh-trade 가 병합 전이면 SC1 「master 병합 마커 기준」을 닫을 수 없다. 권고: 마무리 플랜에 「병합 확인 → `--check` + 마커 대조」를 `checkpoint` 로 두고, 병합 전이면 feature 기준 `--check` 결과를 기록하고 AMT-01 을 Pending 으로 남긴다.
   - **RESOLVED:** 권고 폴백 채택 — 31-08 Task 2 가 `git -C /Users/alex/repos/gh-trade merge-base --is-ancestor feature/limitchaser-amount-unit master` 로 병합을 판정한다. 병합이면 master worktree `--check` + 마커 접두 대조(다르면 재생성 커밋 · D-15), 미병합이면 feature 기준 `--check` 출력 · 마커 해시 2개를 SUMMARY · 노트 1 에 「AMT-01 Pending」 으로 적고 멈추지 않는다. 노트 2건 닫기(D-16 · D-20)는 병합을 기다리지 않는다.
7. **웹 주문로그 「N만(M주)」** — C# D-17 은 클라 주문로그 7종 · 상태 로그도 만원 형식으로 바꿨다. 웹 `strategy-event-text.ts` 의 「조건 … / 실측 …」은 CONTEXT 결정에 없다. 권고: 범위 밖(서버 54 사유는 원문이라 자동으로 바뀐다). 필요하면 후속 quick 으로 한다.
   - **RESOLVED:** 권고(범위 밖)는 사용자 결정으로 바뀌었다 — 두 번째 인박스 `261011-amount-eok-and-limit-evprice.md` 접수로 CONTEXT D-19(웹 ⑦ 수량 토큰 「N만(M주)」/「X.Y억(M주)」 · kind 1·2 `ev_price` 환산 · 조립은 shared `strategy-event-text.ts` 한 곳) · D-20(노트 닫기)이 범위에 들어왔다. 구현 31-05 · 노트 닫기 31-08.

## AMT-04 노트 닫기 (형식 정본)

[VERIFIED: docs/inbox/from-gh-trade/README.md 전문] 노트 frontmatter `status: open` → `done`, `done_commit:` 에 처리 커밋 해시를 넣는다. 「질문」 절 아래에 답 2개(D-16)와 툴팁 문구 갱신 한 줄(c323c27e 로 「N주」)을 적는다. 커밋은 **경로 지정**(`git add docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md`)으로 한다. `done_commit` 은 「처리한 커밋」이다. 보통은 기능 마지막 커밋 해시를 적고, 노트 갱신을 별도 커밋으로 한다(30-07 선례와 같은 모양). 확인 명령은 `grep -qE '^status: done$' … && grep -qE '^done_commit: [0-9a-f]{7,}' …`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| flatc | AMT-01 `--check` · 재생성 | ✓ | 25.12.19 (`/opt/homebrew/bin/flatc`) | — |
| gh-trade 형제 저장소 | AMT-01 · C# 정본 대조 | ✓ | `/Users/alex/repos/gh-trade` (체크아웃 feature 브랜치) | — |
| gh-trade master 병합 | AMT-01 SC1 | ✗ (미병합) | — | feature 기준 `--check` 기록 · AMT-01 Pending |
| Node / pnpm | 빌드 · 테스트 | ✓ | v24.21.0 / 11.15.1 | — |
| Playwright | E2E | ✓ | 1.59.1 | — |
| vercel CLI | D-17 미리보기 | ✓ | 59.11.7 | — (메인 세션 실행) |
| gcloud | relay 배포 | ✓ | SDK 558.0.0 | — (메인 세션 · Deployer SA) |
| gh-trade 서버 Phase 32 배포(120/119) | AMT-02 · AMT-03 실증 | ✗ (master `da762186` 운영) | — | 배포 전에는 역산 표시가 정상(D-18) — 실증은 배포 뒤 manual |

**Missing dependencies with no fallback:** 없음(외부 실증 2건은 배포 뒤 manual 로 미룬다).
**Missing dependencies with fallback:** gh-trade 병합 · 서버 배포 — 위 표 Fallback.

`--check` 실행 결과(이번 세션, feature 체크아웃 기준) [VERIFIED: 실행 출력]:
```
      생성 .ts        : 68 개
      신규/변경 예정  : 0 개
      삭제 예정       : 없음
      .fbs 사본       : 최신 (마커 7줄 제외 본문 동일)
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x(relay · shared) · vitest 2.1.9(webapp) · Playwright 1.59.1(webapp E2E — 진짜 relay + fake gateway) |
| Config file | `relay/vitest.config.ts` · `packages/shared/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts` |
| Quick run command | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts` · `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/protocol.test.ts --maxWorkers=2` · `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/lib/__tests__/numpad.test.ts src/components/trading/lc/__tests__ src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/me/__tests__/limit-chaser-defaults.test.tsx --maxWorkers=2` |
| Full suite command | config `build_command`(`pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck`) → `pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |
| E2E | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts -g "P31\|P20-3\|P24-7\|P24-8" --workers=1` |

기준선 실측(이번 세션): relay `envelope.test.ts` + `protocol.test.ts` **261 passed** · webapp `limit-chaser` · `numpad` · `lc-fields` · `limit-chaser-defaults` **286 passed**.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AMT-01 | master 트리 기준 `--check` 「신규/변경 예정 0 · 사본 최신」 + 마커 해시 = `git log -1 master -- FBS` | doc/script check | `RELAY=/Users/alex/repos/gh-radar/relay <gh-trade master worktree>/server/scripts/sync-relay-schema.sh --check` · `test "$(git -C /Users/alex/repos/gh-trade log -1 --format=%h master -- server/src/protocol/StockDMA.fbs)" = "$(sed -n 3p relay/src/generated/StockDMA.fbs \| awk '{print $3}')"` | ✅ 스크립트 |
| AMT-02 | shared 환산: 내림 · int.Max 좁힘 · 반올림(+5000) · 짝 검사 · 0 가드 · 극단값(BigInt) · 검증표(Pitfall 4) | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts` | ❌ Wave 0 |
| AMT-02 | `echoAmountOf`/`qtyForSubmit`: 에코 짝 → 원값 · 짝 아님/0 → 역산 · 추적 ON → 기준선 역산 · 칸 · 비교가 불변 → 서버 주(기준선) · 칸 변경 또는 비교가 변경 → 내림 | unit | 같은 파일 | ❌ Wave 0 |
| AMT-02 | relay zod: 8필드 선택 통과 · 음수/소수 위반 · 부재 통과(구 탭) · buy3_schema 파생 불변 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/protocol.test.ts` | ✅ 파일 · ❌ 케이스 |
| AMT-02 | relay 조립 → readBack: vtable 158~172 값 · 부재 = 0(슬롯 없음) · 파서 60/64 8필드 · 구 에코(부재) 0 | unit | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts` | ✅ 파일 · ❌ 케이스 |
| AMT-02 | relay fanout → fake gateway 10 디코드에 8 금액 · S→C 전용 목록 불변 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` (helpers `frames.ts` · `fake-gateway.ts` 확장) | ✅ 파일 · ❌ 케이스 |
| AMT-02 | webapp `formFromServer`(에코 적용) · `buildCfg` 주 8 산출 · 추적 ON 래칫 보존(Pitfall 6) · 금액 0 을 지어내지 않음 · `isMasterOnlyDelta`(Pitfall 2) · 시딩(7칸 0 · 후매수 최소 = 84 · 상장주식수 만원 · 비교가 0 이면 미룸) | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts` | ✅ 파일 · ❌ 케이스 |
| AMT-02 | 훅 성공 판정: 구 서버 에코(금액 0 · 주 일치) = 성공 · 새 서버 에코(금액 원값) = 성공 · no-op(Pitfall 1) | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx` | ✅ 파일 · ❌ 케이스 |
| AMT-02/04 | D-03 비교가 0 · D-04 0주 문구(C# 원문 + 접미) · 켜진 그룹만 · 철거 면제 · 판정 순서 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/limit-chaser-form.test.tsx` | ✅ 파일 · ❌ 케이스 |
| AMT-04 | 시트: 단위 「만」 · 칩 · 상태 줄 「= N주 (비교가격 P원)」 · 비교가 0 / 0주 잠금 alert · 「지금 N만」 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/number-pad-sheet.test.tsx src/lib/__tests__/numpad.test.ts` | ✅ 파일 · ❌ 케이스 |
| AMT-04 | 두 줄 행: 위 「1,000만」(값 슬롯) · 아래 「777주」/「무제한」/「비교가격 필요」 · 56px · 편집 중 56 · aria | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__/setting-group.test.tsx src/components/trading/lc/__tests__/lc-fields.test.ts` | ✅ 파일 · ❌ 케이스 |
| AMT-03 | /me 행 교체(「후매수 최소」 만원 · 같은 묶음 · 같은 자리) · 42 = 84 11값 + amount · `postBuyFloorQty: 0` · 범위 밖 잠금 · 54 원문 표시 | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/me/__tests__/limit-chaser-defaults.test.tsx` | ✅ 파일 · ❌ 케이스 |
| AMT-03 | relay 42 조립: 봉인 0 고정(입력 무관) · amount vtable 28 · 84 파서 amount · 부재 0 · (Q1 채택 시) 부재 → 84 캐시 되싣기 / 캐시 없음 → 비종료 거부 | unit + integration | `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/protocol.test.ts tests/ws-autosell.test.ts` | ✅ 파일 · ❌ 케이스 |
| AMT-02~04 | P31 E2E(390 · 1080): 만원 확정 → 게이트웨이 10 에 금액 · 주(짝) → 60 에코(금액 원값) → 두 줄 「N만/M주」 · C# 원값 에코 종목 재제출 → 10 의 금액 = 원값(`sell_watch_amount: 100`) · /me 저장 → 42 amount · floorQty 0 → 84 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts -g "P31" --workers=1` | ✅ 파일 · ❌ 케이스 |
| UI backstop | P20-3 · P24-7 행 높이 단언 갱신(수량 8 + 파생 2 = 56, 나머지 44) · 폭 넘침 0 · P24-8 ≤ 660 유지 | e2e | `… -g "P20-3\|P24-7\|P24-8" --workers=1` | ✅ (갱신) |
| AMT-04 | 노트 `status: done` · `done_commit` · 답 2개 | doc check | `grep -qE '^status: done$' docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261011-limitchaser-amount-unit.md` | ✅ 파일 |
| 라이브 | gh-trade 서버 배포 뒤 C# 만원 입력 종목 → 웹 재제출 → 60 에코 금액 원값 · 84 amount | manual | 배포 뒤 사람 확인(Cloud Logging `relay_docker` · 화면) | — |

### Sampling Rate
- **Per task commit:** 그 워크스페이스의 quick 명령(위 표의 파일 단위, `--maxWorkers=2`)
- **Per wave merge:** Full suite command(+ `build_command` 타입체크 — 금액 키 전환은 컴파일 오류가 1차 안전망이다)
- **Phase gate:** Full suite green + E2E P31 · 백스톱(390 · 1080) green 뒤 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/shared/src/__tests__/lc-amount.test.ts` — 환산 · 짝 · 메모 · 검증표(신규)
- [ ] `relay/tests/helpers/frames.ts` — `LimitChaserFrameInput` +8 금액 · `FakeUserSettingsInput` +`postBuyFloorAmount`(기본 0 = 서버 내장 0)
- [ ] `relay/tests/helpers/fake-gateway.ts` — `SetLimitChaserRequest` +8 금액 · `SetUserSettingsRequest` +`postBuyFloorAmount` (vtable 28 슬롯 판정)
- [ ] `webapp/src/test-fixtures/limit-chaser.ts` — `RelayLimitChaser` 8 금액(기본 0) · 폼 픽스처 금액 키
- [ ] e2e 84 픽스처(`me.spec.ts:1411` · `a11y.spec.ts:514` · `trading-workbench.spec.ts` 다수) — `postBuyFloorAmount` 추가

## Security Domain

`security_enforcement: false`(`.planning/config.json` — 사용자 메모리 「보안검사 안 함」). 이 절은 생략한다. 참고로 이 phase 의 신뢰 경계 원칙은 기존 relay 규율을 그대로 따른다(브라우저 값은 zod 로 형식만 검증 · 판정 값 `buy3_schema` · `market` 은 relay 소유 · 로그에 계좌번호 미기록). 새 입력 8+1 필드는 보관 전용이라 발주 판정에 영향이 없다.

## Sources

### Primary (HIGH confidence — 이번 세션 Read/실행)
- gh-radar: `.planning/phases/31-limitchaser-amount-unit/{31-CONTEXT.md,31-DISCUSSION-LOG.md,reference/mockup-amount-unit.html}` · `docs/inbox/from-gh-trade/{261011-limitchaser-amount-unit.md,README.md}` · `.planning/{REQUIREMENTS,ROADMAP,STATE}.md` · `.planning/config.json` · `30-RESEARCH.md` Validation 절
- gh-radar 코드: `packages/shared/src/relay.ts:100-560 · 725-760 · 1370-1470` · `relay/src/ws/protocol.ts:96-99 · 129-300 · 395-425 · 540-667` · `relay/src/dma/envelope.ts:785-810 · 1351-1375 · 1425-1700 · 2035-2075 · 2525-2700` · `relay/src/ws/fanout.ts:1960-2035 · 2095-2120 · 2708-2770` · `relay/src/hub/subscription-hub.ts:1040-1050 · 2240-2250` · `relay/src/generated/{StockDMA.fbs:1-7 · 695-718 · 1602-1626, stock-dma/set-limit-chaser.ts:365-410 · 682-710, stock-dma/user-settings.ts:45 · 85 · 110-165}` · `webapp/src/lib/{limit-chaser.ts:55-130 · 200-415 · 470-530 · 630-741, lc-ranges.ts, numpad.ts}` · `webapp/src/components/trading/{limit-chaser-form.tsx:215-420 · 455-490 · 660-720 · 740-800, lc/lc-fields.ts:1-120 · 600-740, lc/setting-group.tsx:1-340, lc/number-pad-sheet.tsx:60-300, lc/use-lc-field-commit.ts:213-260 · 395-410 · 560-720, strategy-log.tsx:300-360 · 515-530}` · `webapp/src/components/me/limit-chaser-defaults.tsx:60-240` · `relay/tests/helpers/{frames.ts:1245-1290, fake-gateway.ts:540-560 · 800-830}` · `webapp/e2e/specs/trading-workbench.spec.ts:3989-4058`
- gh-trade(형제 저장소, `feature/limitchaser-amount-unit` 체크아웃): `server/scripts/sync-relay-schema.sh` 전문 · `.planning/phases/32-limitchaser-amount-unit/32-CONTEXT.md` 전문 · `docs/strategy/limit-chaser.md:1950-1962 · 3080-3110 · 3340-3370 · 3410-3436` · `client/Forms/Trading/LimitChaserForm.cs:300-320 · 1460-1495 · 5076-5100 · 5150-5300 · 5376-5445 · 5686-5800` · `client/Forms/LimitChaserDefaultsDialog.cs:483-500` · `client/Services/LimitChaserDefaults.cs:140 · 166-167 · 193` · `server/src/trade/state/UserSettingsStore.h:88-90 · 100-160` · `.planning/STATE.md:35`
- 실행: `flatc --version` · `sync-relay-schema.sh --check`(feature 기준) · `git merge-base --is-ancestor`(NOT_MERGED) · node 환산 검증 · relay 테스트 261 passed · webapp 테스트 286 passed · 도구 버전 프로브

### Secondary (MEDIUM)
- 사용자 메모리(배포 순서 · 서브에이전트 배포 · Vercel 수동 배포 · 동시 세션 테스트 · gh-trade 스키마 동기화 정본)

### Tertiary (LOW)
- 없음

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 패키지 0, 도구 버전 실측
- Architecture: HIGH — C# 원본 · 웹 코드 경로를 직접 대조했다. 폼 키 전환(Pattern 3)은 재량 권고
- Pitfalls: HIGH — 1·2·3·5·6·7·12 는 코드 · 실행으로 확인. 3 의 「운영 webapp 이 그 창에 쓰인다」만 ASSUMED(A3)

**Research date:** 2026-10-11
**Valid until:** gh-trade `feature/limitchaser-amount-unit` 병합 · gh-trade 서버 배포 시점까지(그 뒤 AMT-01 마커 · 라이브 실증 재확인). 코드 사실은 30일.
