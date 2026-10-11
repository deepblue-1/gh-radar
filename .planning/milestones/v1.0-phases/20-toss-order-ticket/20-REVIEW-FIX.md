---
phase: 20-toss-order-ticket
fixed_at: 2026-09-25T07:40:00Z
review_path: .planning/phases/20-toss-order-ticket/20-REVIEW.md
iteration: 2
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 20: 코드 리뷰 수정 보고서

**수정 시각:** 2026-09-25T06:55:00Z (1회차) · 2026-09-25T07:40:00Z (2회차)
**원본 리뷰:** .planning/phases/20-toss-order-ticket/20-REVIEW.md
**회차:** 2
**범위:** critical_warning (Critical 3 · Warning 7 — Info 3건은 범위 밖)

**요약 (2회차 기준):**
- 범위 안 지적: 10
- 수정: 10
  - 1회차 8건: CR-01 · CR-02 · CR-03 · WR-01 · WR-02 · WR-03 · WR-04 · WR-06
  - 2회차 2건: WR-05 · WR-07 — 사용자 결정(둘 다 권장안 A)에 따라 수정. 아래 「2회차」 절.
- 건너뜀: 0 (1회차에 건너뛴 WR-05 · WR-07 은 2회차에서 수정됨)
- 변경 불필요(no_change_needed): 0 — 10건 모두 코드에서 지적이 사실임을 확인했다.

**작업 위치:** 오케스트레이터 지시에 따라 이미 격리된 git worktree `/Users/alex/repos/gh-radar/.claude/worktrees/toss-b`(브랜치 `theme/toss-b`)에서 직접 편집·커밋했다(중첩 worktree 없음). 아래 검증 게이트도 모두 **이 worktree 체크아웃에서** 돌렸다. 커밋된 트리 그대로 재현할 수 있다.

**회귀 테스트 원칙:** 수정마다 회귀 테스트를 더했다. 그 테스트가 **수정 전 코드에서 실패함**을 직접 확인했다(수정 소스만 되돌려 실행 → 실패 → 복원). 건별 실패 수는 아래에 적었다.

## 수정한 지적

### CR-01: 비율·호가변경 값에 범위 검증이 없다 — 범위 밖 값 1회 확정이 relay WebSocket 연결 전체를 끊는다

**상태:** fixed
**커밋:** 2ccaed7
**수정 파일:** `webapp/src/lib/numpad.ts`, `webapp/src/components/trading/lc/lc-fields.ts`, `webapp/src/components/trading/lc/use-lc-field-commit.ts`, `webapp/src/components/trading/lc/inline-value-editor.tsx`, `webapp/src/components/trading/limit-chaser-form.tsx` (+ 테스트 4파일)
**근거 확인:** 범위는 `relay/src/ws/protocol.ts` `RelayLcSetSchema` 원문에서 직접 확인했다 — `sellOrderRatio` `int().min(1).max(100)` · `sellQtyTrackRatio` `int().min(1).max(90)` · `sweepMinTickCount` `UByteSchema`(0~255). 스키마 위반이면 `fanout.ts:545-548` `#reject(conn,"bad message")` → `:1463` `ws.close(BAD_MESSAGE)` 로 소켓이 닫힌다. 그 밖의 값 필드(가격·수량·금액)는 `UIntSchema`(0 이상 정수, 상한 없음)라 키패드가 스키마를 어길 수 없다.
**적용 내용:**
- `lc-fields.ts` 행 스펙에 `range` 를 두었다(relay 와 같은 값). 이 값을 relay 스키마 원문과 대조하는 **계약 테스트**도 더했다. 한쪽만 바뀌면 테스트가 깨진다.
- `numpad.ts` — `PadCtx.min/max` · `rangeIssueText` 를 추가했다. `padIssue` 가 범위 밖이면 적용을 잠근다. `padChipDisabled` 는 범위 밖 `set` 칩을 끈다. 그래서 잔량추적 시트의 「100」 칩은 비활성이고, 매도비율 시트에서는 그대로 쓸 수 있다. 이미 UI-SPEC 에 있는 「회」 칩 `maxPieces` 비활성 규칙과 같은 방식이다.
- 인라인 편집기 — **저장될 값(빈 값 → 0)** 으로 검증한다. 그래서 칸을 지우고 Enter 를 눌러 0 이 나가던 경로가 막힌다. 포커스 이탈도 같은 판정으로 취소된다(A6).
- 필드 확정 훅 `sendNow` 직전에 cfg 전체 범위 가드 `lcRangeIssue` 를 두었다. 이것이 마지막 방어선이다. 이 가드는 끄는 방향 토글도 막는다(범위 밖 프레임은 끄기조차 반영하지 못하고 연결만 끊기기 때문). 실패 사유는 새 `invalid` 이다. 서버 동기값이 범위 밖인 레거시 전략에서는 **다른 필드**를 확정해도 막힌다.
- 모든 입력 경로를 덮는다: 시트 키패드 · 칩 · 인라인 Enter/Tab/이탈(빈 버퍼 포함) · 토글 · 대기열 꺼내기.
**수정 전 실패 확인:** 새 테스트 21건이 수정 전 코드에서 실패했다.
**새 문구(사용자 확인 권장):** 「{N}{단위} 이상 입력해 주세요」 · 「최대 {N}{단위}까지 입력할 수 있어요」. 훅 가드에서는 앞에 「{라벨} · 」가 붙는다. 기존 「회」 문구의 어조를 따랐다. UI-SPEC Copywriting 표에는 없는 새 문구다.

### CR-02: 타임아웃이 직렬화를 풀어 낡은 기준값 전송이 앞 확정(무장 해제 포함)을 조용히 되돌린다

**상태:** fixed: requires human verification (상태 기계 로직)
**커밋:** 8821259
**수정 파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` (+ 테스트)
**적용 내용:**
- 타임아웃이 나도 실패 표시는 그대로 한다. 다만 **고아 장벽**(`orphanRef`)을 세운다. 그 뒤 **다른 필드** 확정은 대기열에 선다.
- 장벽이 풀리는 경우:
  - 다음 답 신호가 오면 → 대기 건을 곧바로 꺼낸다.
  - 서버 값이 바뀌면 → 한 렌더 늦게 오는 답 신호 증가를 기다렸다가 꺼낸다(⑦ 규칙). 꺼낼 때 no-op·무장 판정은 새 서버 값으로 다시 한다.
- `LC_ORPHAN_WAIT_MS`(7초, 전송부터 약 10초) 안에 아무 신호도 없으면 대기 건을 **보내지 않고** 실패로 표시한 뒤 장벽을 푼다. 낡은 기준값 전송도, 시트가 「반영 중…」에 영구히 잠기는 일도 없다.
- **같은 필드**의 새 확정(타임아웃 뒤 같은 스위치 「다시 시도」)은 장벽 없이 곧바로 나간다. 그 cfg 가 그 필드의 최신 의도를 싣고, 같은 소켓이라 늦게 닿는 앞 건보다 뒤에 처리되기 때문이다. 앞 건을 대체할 뿐 되돌리지 않는다. `strategy-card-flow` ㉑ 계열이 잠근 「다시 누르면 곧바로 나간다」 동작도 그대로 유지된다.
- 결과 모름인 필드를 서버 값으로 되돌리는 확정은 no-op 으로 삼키지 않는다.
**수정 전 실패 확인:** 새 테스트 4건이 실패했다.
**사람 확인 요청:** 장벽 대기 중 시트는 최대 약 7초 「반영 중…」으로 잠긴다(그 뒤 실패 표시로 풀림). 7초 값이 운영 감각에 맞는지 확인해 주세요.

### CR-03: `buyOrderAmount` 특례가 거부를 성공으로 읽는다(불변식 ③ 위반) — 테스트가 이 결함을 고정했다

**상태:** fixed: requires human verification (판정 로직)
**커밋:** 0b9d6e8
**수정 파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` (+ 테스트)
**근거 확인:** relay 가 `buyOrderAmount` 를 싣고(`envelope.ts:1236`) 되돌려 준다(`:2034`). 거부(54)에는 60 에코가 없다.
**적용 내용:**
- 특례 성공 조건을 좁혔다. **에코가 실제로 왔고(서버 값 변화)**, 그 `buyOrderQty` 가 **이 전송 cfg 가 실은 수량**과 같을 때만 성공이다. 이 수량은 in-flight 에 `sentBuyOrderQty` 로 저장해 둔다. 수량 산출식을 복제하지 않고 `buildCfg` 결과를 그대로 쓴다.
- 특례로 성공하면 폼에 새 금액을 넣는다. 그래야 다음 전송이 옛 금액으로 수량을 되돌리지 않는다.
- 결함을 고정하던 테스트(답만 오면 성공)를 「답만 오고 서버 불변이면 거부」로 뒤집었다. 「수량 일치 에코면 성공 + 폼 반영」 · 「무관한 에코면 실패」 케이스도 더했다.
**수정 전 실패 확인:** 테스트 3건이 실패했다.

### WR-01: 미등록 전략에서 등록 전송이 진행 중일 때 한 값 편집이 성공 강조 뒤 에코에 조용히 덮인다

**상태:** fixed
**커밋:** c5ff9c7
**수정 파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` (+ 테스트)
**적용 내용:**
- 등록 전송이 나가 있으면(in-flight · 답 신호 대기 · 결과 모름) 게이트 밖 확정을 로컬 성공 대신 대기열에 세운다.
- 꺼낼 때 서버가 생겼으면 정상 전송한다. 여전히 미등록이면 로컬 반영만 한다. 존재하지 않는 키의 철거 프레임은 보내지 않는다(Pitfall 2).
- 기존 테스트 하나가 「등록 in-flight 중 체크 = local」이라는 결함 동작을 잠그고 있었다. 확정 순서만 바꿔 원래 의도(게이트 밖은 로컬 · 게이트는 등록)를 잠그게 했다.
**수정 전 실패 확인:** 새 테스트 2건이 실패했다.

### WR-02: 성공 직후 대기열이 비어 있으면 뒤따르는 답 신호 증가가 다음 확정을 「거부」로 오판한다

**상태:** fixed
**커밋:** 7058a0f
**수정 파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` (+ 테스트)
**적용 내용:** 성공이 서버 값 변화 렌더에서 판정되면 대기열 유무와 관계없이 `popAfterSeqRef = seq` 를 세운다. 그 사이 새 확정은 증가 렌더까지 대기했다가 나간다.
**수정 전 실패 확인:** 새 테스트 1건이 실패했다.

### WR-03: 대기열에서 꺼낼 때 무장 불가나 끊김으로 막힌 토글이 아무 문구 없이 되돌아간다

**상태:** fixed
**커밋:** 911e8dc
**수정 파일:** `webapp/src/components/trading/limit-chaser-form.tsx` (+ 테스트)
**적용 내용:**
- 폼 맨 위 `lc-submit-error` 를 `commitToggle` 반환값 대신 **훅의 토글 실패 상태에서 파생**한다(끊김 · 무장 불가 · 범위 밖). 문구는 기존 원천 그대로다: 끊김 = `SEND_FAILED_TEXT.gate`, 무장 불가·범위 밖 = 훅이 둔 사유 문장.
- 기존 규칙 「답이 오면 접는다」는 **실패 객체 정체성**으로 유지했다. 그래서 같은 답 렌더에서 꺼내다 막힌 토글의 사유는 접히지 않고 남는다.
- UI-SPEC 레이아웃 계약(「폼 맨 위 한 줄 = 스위치·체크·토글 전송 실패 전용」 · A-P4 「끊김·무장 불가는 폼 맨 위」)은 그대로다.
**수정 전 실패 확인:** 새 테스트 2건이 실패했다.

### WR-04: 세션이 비활성이 되면 시트 「적용」과 인라인 Enter가 아무 반응 없이 무시된다

**상태:** fixed
**커밋:** 9f86194
**수정 파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` (+ 테스트 2파일)
**근거 확인:** `card-body.tsx:237` 에서 `disabled = isin === '' || accountNo === '' || status !== 'ready'` 이다. 시트·편집기가 열린 채 바뀔 수 있는 것은 사실상 연결 상태뿐이라 기존 끊김 문구가 정확하다.
**적용 내용:**
- `disabled` 일 때 `disconnected` 실패를 기록하고 `'disconnected'` 를 돌려준다.
- 결과는 각 표면이 말한다: 시트는 「연결이 끊겨 보내지 못했어요 · 다시 시도」(입력 보존), 인라인은 말풍선, 토글은 WR-03 경로로 폼 맨 위 한 줄.
**수정 전 실패 확인:** 테스트 3건이 실패했다.

### WR-06: 꺼낼 때 no-op이 된 대기 확정은 성공 신호가 없어 편집기나 시트가 열린 채 남는다

**상태:** fixed
**커밋:** 4135bac
**수정 파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` (+ 테스트 2파일)
**적용 내용:** `drain` 과 대기열 폐기(`failQueue`)의 「서버가 이미 그 값」 분기에서 `markSuccess` 를 부른다. `queued` 로 열려 기다리던 시트·편집기가 `successSeq` 로 닫힌다.
**수정 전 실패 확인:** 새 테스트 3건이 실패했다(폼 수준 시트 닫힘 포함).

## 건너뛴 지적 (1회차 기록 — 두 건 모두 2회차에서 수정됨)

아래는 1회차 판단 기록이다. 결과는 「2회차」 절을 본다.

### WR-05: ETF·ETN 등 다른 호가 단위를 쓰는 유효 가격을 하드 블록한다

**파일:** `packages/shared/src/krxTick.ts:20-21,57-66` · `webapp/src/lib/numpad.ts` · `webapp/src/components/trading/lc/inline-value-editor.tsx` · `webapp/src/components/trading/card/manual-order-form.tsx:1080-1084`
**사유:** skipped — 사용자 결정 필요.
- 지적 자체는 사실이다. `priceInputIssue` 는 모든 종목에 주식 표를 적용해, 예컨대 ETF 25,005원을 「50원 단위」로 잠근다.
- 그러나 「확인 잠금」은 **합의된 D-15(LOCKED)** 이다. 수동주문 터치 시트 잠금도 UI-SPEC §8 표의 계약이다.
- 20-RESEARCH A4 가 「ETF/ETN 은 이번엔 분기하지 않는다 · 실사용 잠김 제보 시 quick」으로 명시해 이연했다.
- 카드(`CardBody`)에는 ETF·ETN 분류 정보가 전달되지 않는다(`security_group`·ETP 구분이 webapp 트레이딩 경로에 없다). 그래서 작고 명백한 수정이 불가능하다.
**권장안:**
- (A, 권장) 종목 마스터의 ETP 여부를 `CardBody` → `PadCtx.tickRule: 'stock' | 'etp' | 'unknown'` 으로 넘긴다. `etp`/`unknown` 이면 호가 단위(`offTick`)는 경고만 하고, 상한가 초과는 계속 잠근다. 데이터 배선이 필요하므로 별도 quick.
- (B, 최소) 수동주문 시트만 마우스 인라인(`:782`)과 같게 `offTick` 을 경고로 낮춘다. D-15 의 수동주문 부분을 뒤집는 결정이다.
**원래 지적:** 헬퍼는 ETF/ETN 예외 단위를 다루지 않는데 확인 버튼을 잠가, 상따 설정·수동주문 터치 시트에서 유효한 ETF 가격을 넣을 수 없다.

### WR-07: 레거시 전략(서버 `buyOrderAmount === 0`)에서는 어떤 필드를 확정해도 `buyOrderQty`가 클라이언트 기본 금액으로 재계산되어 덮인다

**파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` · `webapp/src/components/trading/limit-chaser-form.tsx:473-490` · `webapp/src/lib/limit-chaser.ts:313`
**사유:** skipped — Phase 16부터 있던 동작이고, 고치는 방식이 제품 결정이다.
- 지적은 사실이다. `buildCfg` 가 매 전송 `buyOrderQtyFromAmount(form.buyOrderAmount, price)` 를 다시 계산한다. 서버 금액이 0 이면 폼 금액은 클라 기본값(10만원)이다.
- 「비교가격 하나 바꿨는데 서버가 쥔 500주가 7주가 된다」는 실제 거래 영향이 있다.
- 그러나 올바른 동작이 하나로 정해지지 않는다:
  - ① 금액 외 필드 확정 시 서버 `buyOrderQty` 를 그대로 싣기 — 「발주 정본은 금액→수량 한 방향」 규율(`lib/limit-chaser.ts`)의 예외가 된다.
  - ② **매수가격** 확정 시 수량을 어떻게 할지 — 옛 수량 유지 = 금액이 바뀜 / 기본 금액 재계산 = 수량이 튐.
  - ③ 서버가 모르는 금액을 화면에 「10만원」으로 보여 주는 것 자체가 사실과 다르다(「—」 표시 필요 여부).
  - ④ 기본 금액 10만원 기준으로 `armBlockOf` 가 가격 10만원 초과 종목의 모든 값 확정을 막는 부작용.
- 이 넷을 함께 정해야 해서 작고 명백한 수정이 아니다.
**권장안:**
- (A, 권장) 서버 금액 0 인 전략은 값 확정 전에 「주문금액을 먼저 입력해 주세요」로 막고, 주문금액 행을 「—」로 표시한다. 금액을 한 번 입력하면 정상 경로(CR-03 수정으로 에코·수량 일치 판정)로 합류한다.
- (B) 금액·매수가격 외 필드는 cfg 에 서버 `buyOrderQty` 를 싣고, 매수가격 확정만 (A)처럼 막는다.
**원래 지적:** 서버가 금액을 모르면 폼은 클라 기본 금액을 들고, 매 전송이 그 금액으로 수량을 다시 계산해 서버의 실제 수량을 조용히 덮는다.

## 검증 — 1회차 (이 worktree 체크아웃에서 실행)

**빌드·타입 검사** — `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`
```
DTS ⚡️ Build success in 467ms
DTS dist/index.d.cts 68.77 KB
DTS dist/index.d.ts  68.77 KB
$ tsc --noEmit && tsc -p tsconfig.e2e.json
exit=0
```

**단위 테스트** — `pnpm --filter @gh-radar/webapp run test`
```
 Test Files  107 passed (107)
      Tests  2017 passed | 1 skipped (2018)
   Duration  29.28s
```
(stderr 의 스택은 stock·home 스위트의 의도된 fetch 실패 로그다. 이번 수정과 무관하다.)

**E2E** — `cd webapp && pnpm exec playwright test e2e/specs/trading-workbench.spec.ts`
- 3100 포트가 비어 있어 Playwright 가 이 worktree 의 `webapp` 에서 `PORT=3100 pnpm dev` 를 직접 기동했다. 다른 체크아웃의 서버를 재사용하지 않았다.
- P20-1 ~ P20-5 포함.
```
[39/44] … P20-1 인라인 편집 한 행 — 「호가변경」 …
[40/44] … P20-3 최악값 × 본문 344 · 700 · 830 · 992 — 우측 패널 잘림 0 · 행 44px …
[42/44] … P20-2 터치 기기 — 「호가변경」 탭 → 시트 …
[43/44] … P20-4 매수가격 시트 — 칩 현재가·상한가·±1호가 · D-15 잠금 …
[44/44] … P20-5 수동주문 시트는 값만 채운다 …
  44 passed (1.8m)
```

## 사용자 결정·확인이 필요한 것 (1회차 목록 — 1·2번은 2회차에서 결정·수정됨)

1. ~~**WR-05(ETF/ETN 호가 단위)**~~ — 사용자 결정 A(2026-09-25) → 2회차에서 수정(D-15a).
2. ~~**WR-07(레거시 금액 0 전략)**~~ — 사용자 결정 A(2026-09-25) → 2회차에서 수정(D-04a).
3. **CR-02 장벽 대기 7초**(`LC_ORPHAN_WAIT_MS`) — 그 사이 다른 필드 시트가 「반영 중…」으로 잠긴다. 값 적정성을 확인해 주세요.
4. **CR-01 새 문구 2종** — Copywriting 계약에 없던 문구다. 어조를 확인해 주세요.
5. CR-02 · CR-03 은 상태 기계·판정 로직 수정이다. 단위·E2E 는 통과했지만, 실환경(터널 지연 · 레거시 전략)에서 한 번 관찰해 보기를 권한다.

---

# 2회차 — 사용자 결정 반영 (WR-05 · WR-07)

**수정 시각:** 2026-09-25T07:40:00Z
**범위:** WR-05 · WR-07 (1회차에 건너뛴 두 건) — 둘 다 사용자 결정 **권장안 A**
**작업 위치:** 1회차와 같다. 이미 격리된 worktree `/Users/alex/repos/gh-radar/.claude/worktrees/toss-b`(브랜치 `theme/toss-b`)에서 직접 편집·커밋했다. 검증 게이트도 모두 이 체크아웃에서 돌렸다.
**회귀 테스트 원칙:** 1회차와 같다. 수정 소스만 되돌려 새 테스트가 **실패**하는 것을 확인한 뒤 복원했다.

## 수정한 지적 (2회차)

### WR-05: ETF·ETN 등 다른 호가 단위를 쓰는 유효 가격을 하드 블록한다

**상태:** fixed
**커밋:** 34910a2
**결정:** D-15a — 20-CONTEXT · STATE.md 에 기록(커밋 359bc65)
**수정 파일:**
- `packages/shared/src/krxTick.ts` · `index.ts`
- `webapp/src/lib/numpad.ts` · `webapp/src/lib/tick-rule.ts`(신규)
- `webapp/src/components/trading/card/card-body.tsx` · `card/manual-order-form.tsx` · `limit-chaser-form.tsx`
- `webapp/src/components/trading/lc/number-pad-sheet.tsx` · `lc/inline-value-editor.tsx` · `lc/setting-group.tsx`
- 테스트 9파일(신규 `tick-rule.test.tsx` 포함)

**ETP 플래그의 출처:**
- 원천은 종목 마스터 `stocks.security_group` 이다.
- 판별자는 새로 만들지 않았다. quick-260908-oh6(ec6cceb)의 `/api/stocks/search` 와 SQL 선례 4곳이 쓰는 **같은 블랙리스트 ETF·ETN·ELW** 다. 이것을 shared `ETP_SECURITY_GROUPS` · `tickRuleOfSecurityGroup` 에 모았다.
- `미확인` sentinel(intraday-sync)과 빈 값은 `unknown` 이다.
- 조회 경로는 webapp → Supabase 직접이다. `lib/tick-rule.ts` `useTickRule(isin)` 가 `stocks.select('security_group').eq('isin', isin).maybeSingle()` 을 부른다.
  - `stocks` 는 RLS `anon, authenticated` SELECT 가 이미 열려 있다.
  - `isin` 부분 유니크 인덱스가 이미 있다.
  - webapp 은 이미 watchlist·theme 에서 `stocks` 를 직접 읽는다.
- **서버·API·relay·프로토콜·DB 스키마 변경은 0 이다.** 기존 컬럼을 읽기만 한다. 그래서 STOP 조건에 해당하지 않았다.
- relay 프레임에는 분류가 없다(`SymbolMap` 은 이름·코드·시장만 푼다). 프로토콜은 넓히지 않았다.
- ★ **master-sync 는 ETP 행에 `isin` 을 싣지 않는다.** KRX ETP 응답에 표준코드가 없기 때문이다(`workers/master-sync/src/pipeline/upsert.ts`).
  - 그래서 실제 ETP 카드의 ISIN 은 마스터에서 찾지 못한다. 결과는 **`unknown` → 경고만**이다. 사용자 규칙상 ETP 와 같은 동작이다.
  - `etp` 로 판정되는 것은 같은 코드의 주식 행에 isin 이 보존된 경우뿐이다.

**적용 내용:**
- **잠금 규칙은 한 곳이다.** shared `priceIssueLocks(issue, rule)`:
  - 상한가 초과는 늘 잠근다.
  - 호가 단위 위반은 `stock` 일 때만 잠근다.
- `PadCtx.tickRule` 을 추가했다.
  - `padIssue` 는 잠그는 위반만 돌려준다.
  - 새 `padWarning` 은 잠그지 않는 호가 단위 위반을 문구로 돌려준다.
  - **미지정은 `stock`** 이다. 분류를 넘기지 않는 호출부와 조회 중인 카드는 기존 D-15 잠금 그대로다.
- **배선은 카드 본문 한 곳이다.** `CardBody` 가 `useTickRule(isin)` 을 한 번 부르고, 상따 폼과 수동주문 폼에 **같은 값**을 넘긴다. 작업대 카드 · 종목상세 호가 탭 모두 이 본문 하나를 쓰므로 진입 경로별로 갈라지지 않는다.
- 표면별 동작 (ETP·unknown 일 때):

| 표면 | 호가 단위 위반 | 상한가 초과 |
|------|----------------|-------------|
| 상따 시트 | 적용 허용 + 상태 줄 경고(`role=status`) | 잠금 |
| 상따 인라인 | 입력 중 경고 말풍선(`role=status` · `aria-invalid` 없음) · Enter/Tab/이탈 저장 허용 | 잠금 |
| 수동주문 시트 | 「입력」 허용 + 경고 | 잠금 |
| 수동주문 마우스 인라인 | 원래 경고만 — 문구만 바뀜 | 원래 경고만 |

  경고 모양은 기존 수동주문 인라인 경고(`manual-order-price-issue`: destructive 글자색 · `role=status`)를 따랐다.
- 상태 셋:
  - `undefined`(조회 중) = 잠금. 대다수인 주식 카드가 조회 동안 느슨해지지 않는다.
  - 조회 실패 = `console.warn` + `unknown`. 무로그 fail-safe 금지 규칙을 따랐고, 결과를 캐시하지 않는다.
  - 성공 결과는 탭 메모리에 ISIN 별로 캐시한다. 같은 ISIN 의 동시 조회는 한 요청을 공유한다.

**회귀 테스트:** ETP 경고만 · 주식 잠금 · unknown → 경고 · 상한가 초과는 분류와 무관하게 잠금. 층별로 넣었다.
- shared 순수 함수
- numpad
- 시트 · 인라인 편집기
- 수동주문 폼 · 상따 폼
- 카드 본문 배선: `createClient` 스텁으로 ETF · 행 없음 · 주권을 넣고 두 시트를 확인했다.
- `useTickRule` 훅

**수정 전 실패 확인:** 새 테스트 **20건**이 수정 전 코드에서 실패했다. 주식 잠금·상한가 잠금 가드 테스트는 수정 전에도 통과한다(회귀 감시용).

**새 문구(사용자 확인 권장):** 「주식 호가 단위(50원)와 달라요 · 가까운 값 25,000 / 25,050」 — 잠그지 않는 경고라 명령형(「…단위로 입력해 주세요」)을 쓰지 않았다. UI-SPEC Copywriting 표에 없는 문구다.

### WR-07: 레거시 전략(서버 `buyOrderAmount === 0`)에서는 어떤 필드를 확정해도 `buyOrderQty`가 클라이언트 기본 금액으로 재계산되어 덮인다

**상태:** fixed: requires human verification (상태 기계 판정 추가)
**커밋:** d71f619
**결정:** D-04a — 20-CONTEXT · STATE.md 에 기록(커밋 359bc65)
**수정 파일:** `webapp/src/components/trading/lc/use-lc-field-commit.ts` · `limit-chaser-form.tsx` · `lc/setting-group.tsx` · `lc/inline-value-editor.tsx` (+ 테스트 2파일)

**적용 내용:**
- 훅이 `amountRequired` 를 낸다. 조건: 서버 에코가 있고, `buyOrderAmount === 0` 이고, 아래 특례로 금액이 확인되지 않았다.
- **표시:**
  - 주문금액 행은 「—」다. 접근성 이름은 「주문금액 미입력」이다.
  - 주문금액 시트는 빈 값으로 열리고 「지금 ○○」가 없다.
  - 주문금액 인라인도 빈 칸으로 열린다.
  - 폼이 든 클라 기본값(10만원)은 더 이상 보이지 않는다.
- **막기 — 판정 함수는 하나다(`lcAmountBlockOf`).** 시트·인라인 `validate` 와 훅의 전송 직전 가드가 같은 함수를 **같은 순서**로 읽는다(범위 → 금액 먼저 → 무장 불가).
  - 값 시트: 적용이 잠기고 상태 줄이 「주문금액을 먼저 입력해 주세요」를 보인다.
  - 인라인: 말풍선으로 보인다.
  - 스위치·체크·감시대상: 새 실패 사유 `amountRequired` 가 생기고, **폼 맨 위 한 줄**(WR-03 표면)이 말한다.
- **끄기는 늘 허용한다(T-16-44).** 기존 `turningOff` 정의를 따랐다(게이트 4종 OFF).
  - 그 cfg 는 금액·수량을 **서버 값 그대로**(금액 0 · 서버 `buyOrderQty`) 싣는다.
  - 기본 금액으로 수량을 다시 계산하면 그 자체가 이 결함이다. 게다가 0주가 되면 relay 무장 판정에 막혀 끄기조차 못 한다.
- **금액 확정은 정상 경로다.** 새 금액으로 수량을 계산해 보낸다. 0 이 아닌 금액 에코 뒤에는 모든 것이 정상이다.
  - 금액 확정이 나가 있는 동안 누른 토글은 대기열에 섰다가, 금액 반영 뒤 나간다.
- **CR-03 특례와의 연결:** 에코 금액이 여전히 0 인데 수량이 일치해 성공한 경우다.
  - 이 폼 인스턴스에서는 금액을 아는 것으로 보고 잠금을 푼다. 그러지 않으면 잠긴 채 굳는다.
  - 서버가 0 이 아닌 금액을 돌려주면 이 표시를 내려놓는다.
- 미등록 전략은 해당 없다.
- 기존 테스트 1건의 기대값을 바꿨다. 「금액 0 에코 → 행은 50만원 유지」였던 것을 「→ 「—」」로 바꿨다. D-04a 가 표시 규칙을 바꿨기 때문이다. 폼 내부 값 보존(`formFromServer`)은 그대로다.

**수정 전 실패 확인:** 새·변경 테스트 **14건**이 수정 전 코드에서 실패했다. 대기열 토글 · 미등록 가드 2건은 수정 전에도 통과한다(회귀 감시용).

**사람 확인 요청:** 레거시 전략이 실환경에 있으면 확인해 주세요 — 금액 입력 → 에코 → 다른 필드 편집 흐름, 그리고 무장된 레거시 전략 끄기(수량 불변) 흐름.

## 검증 — 2회차 (이 worktree 체크아웃에서 실행)

**빌드·타입 검사** — `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/webapp run typecheck`
```
DTS ⚡️ Build success in 461ms
DTS dist/index.d.cts 69.99 KB
DTS dist/index.d.ts  69.99 KB
$ tsc --noEmit
$ tsc --noEmit && tsc -p tsconfig.e2e.json
exit=0
```

**단위 테스트** — `pnpm --filter @gh-radar/webapp run test`
```
 Test Files  108 passed (108)
      Tests  2075 passed | 1 skipped (2076)
   Duration  29.98s
```
- stderr 에는 1회차와 같은 stock·home 스위트의 의도된 fetch 실패 로그가 있다.
- 새로 생긴 stderr 도 있다. 카드 본문을 그리는 다른 스위트에서 vitest 에 Supabase 환경변수가 없어 `[tick-rule] 종목 분류 조회 실패` 경고와 `act(...)` 경고가 찍힌다. 판정에는 영향이 없다(조회 실패 = 경고 경로 · 해당 스위트는 호가 단위 잠금을 단언하지 않는다).

**shared 단위** — `packages/shared` `vitest run src/krxTick.test.ts`: 29 passed.

**E2E** — `cd webapp && pnpm exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/orderbook.spec.ts`
- 3100 포트가 비어 있었다. Playwright 가 이 worktree 의 webapp 에서 dev 서버를 직접 기동했다.
```
[54/55] … P20-4 매수가격 시트 — 칩 현재가·상한가·±1호가 · D-15 잠금(호가 단위 · 상한가) …
[55/55] … P20-5 수동주문 시트는 값만 채운다 …
  55 passed (2.2m)
```
- P20-4(삼성전자 = 주권 · D-15 잠금)가 그대로 통과한다. 브라우저 분류 조회가 `stock` 을 돌려줬거나 아직 조회 중(= 잠금)이었다는 뜻이다. E2E 는 둘을 구분하지 않는다.

## 사용자 결정·확인이 필요한 것 (2회차)

1. **새 문구 2종**(Copywriting 계약 밖) 확인:
   - WR-05 경고 「주식 호가 단위(N원)와 달라요 · 가까운 값 A / B」
   - WR-07 주문금액 행 「—」의 접근성 이름 「주문금액 미입력」
   - 「주문금액을 먼저 입력해 주세요」는 결정문 원문이다.
2. **WR-05 판별자에 ELW 가 포함된다.** 지시대로 ec6cceb 과 같은 판별자(ETF·ETN·ELW)를 재사용했다. ELW 도 주식 표와 단위가 달라 경고만 하는 쪽이 맞다고 봤다.
3. **WR-07 「끄기」의 범위는 게이트 4종 OFF다**(기존 `turningOff` 정의).
   - 게이트가 아닌 체크를 끄는 것은 레거시 상태에서 막힌다: 매수 「체결」 조건, 매수취소 「체결」「잔량추적」.
   - 이것들은 무장 해제가 아니라 조건 변경이라서다. 이 체크 끄기도 허용하려면 알려 주세요.
4. **WR-07 부수 관찰(미수정 · 범위 밖):** 레거시 상태에서도 「켤 수 없는 이유」 패널은 폼이 든 기본 금액(10만원)으로 판정한다.
   - 그래서 가격이 10만원을 넘는 종목이면 금액 행은 「—」인데 패널은 「주문금액이 매수가격보다 작아 …」라고 말할 수 있다.
   - 가리키는 곳(금액)은 맞다. 문장까지 맞추려면 별도 quick 으로 처리한다.
5. 1회차 3~5번(CR-02 7초 · CR-01 문구 · CR-02/CR-03 실환경 관찰)은 그대로 열려 있다.

---

_수정: 2026-09-25T06:55:00Z (1회차) · 2026-09-25T07:40:00Z (2회차)_
_수정자: Claude (gsd-code-fixer)_
_회차: 2_
