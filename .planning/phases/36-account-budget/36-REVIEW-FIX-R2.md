---
phase: 36-account-budget
fixed_at: 2026-10-28T03:50:56Z
review_path: .planning/phases/36-account-budget/36-REVIEW-R2.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 36: 코드 리뷰 수정 보고서 — 2라운드

**수정 시각:** 2026-10-28T03:50:56Z
**대상 리뷰:** .planning/phases/36-account-budget/36-REVIEW-R2.md
**회차:** 2 (1라운드 보고서 `36-REVIEW-FIX.md` 는 그대로 둔다)

**요약:**
- 범위 안 지적: 4건 (CR-01 · WR-01 · WR-02 · WR-03 · INFO IN-01~03 은 범위 밖)
- 수정: 4건
- 건너뜀: 0건

**작업 위치:** 오케스트레이터가 준비한 격리 worktree `.claude/worktrees/phase-36-fix2`(브랜치 `gsd/phase-36-fix2`, master `7d282705` 에서 갈라짐)에서 직접 고치고 커밋했다. 이 에이전트는 worktree 를 따로 만들지 않았다. push · 배포 · `supabase db push` · 마이그레이션 수정은 하지 않았다.

## 고친 지적

### CR-01: 「확인 전」 상태에서 안 고친 칸에 Enter 만 쳐도 op 6(0) · op 7(0,0)가 등록 서버 전부에 나가 예수금 · 비용률이 해제된다

**고친 파일:** `webapp/src/components/admin/account-editor.tsx`, `webapp/src/components/admin/__tests__/account-editor.test.tsx`
**커밋:** d13d32cb
**적용한 수정:** 서버 87 을 모르는 「확인 전」 상태에서는 빈 칸을 0 이 아니라 「모르는 값」 으로 본다(30 IN-06 원칙).
- 예수금: 확인 전이고 칸이 비었으면 요청을 보내지 않는다. 쳤다가 지운 빈 칸도 마찬가지다. 「0」 을 직접 쳤을 때만 해제(op 6 0)를 보낸다.
- 수수료 · 매도세: op 7 은 두 값을 한 번에 쓴다. 그래서 확인 전에 한 칸이라도 비면 보내지 않는다. 두 칸이 다 비면 조용히 끝낸다. 한 칸만 비면 그 칸을 `aria-invalid` 로 표시하고 기존 범위 줄(「수수료 · 매도세는 0~1%, 소수 넷째 자리까지예요」)을 띄운다. 새 문구는 만들지 않았다. 모르는 매도세를 0 으로 덮지 않으려면 두 칸을 다 명시해야 한다(0 도 직접 쳐야 한다).

**회귀 테스트:** 3건(`(CR-01)` 접두). 안 고친 Enter · 이탈 요청 0, 쳤다 지운 빈 칸 요청 0, 「0」 입력 시 해제, 한 칸만 입력하면 보내지 않음, 두 칸을 다 치면 op 7. 소스를 고치기 전 3건 모두 실패하는 것을 확인했다(RED → GREEN).
**상태:** fixed: requires human verification — 저장 판정 로직을 바꾼 수정이다. 확인 전 계좌에서 수수료만 쳤을 때 매도세 칸이 빨갛게 되고 범위 줄이 뜨는 동작이 운영 의도와 맞는지 봐 주기를 권한다.

### WR-01(R2): 불일치 상태에서 안 고친 Enter 가 op 6 를 fan-out 해 시트를 연 시점 값으로 주문 서버의 체결 조정분을 되감는다

**고친 파일:** `webapp/src/components/admin/account-editor.tsx`, `webapp/src/components/admin/__tests__/account-editor.test.tsx`
**커밋:** 7dc67654
**적용한 수정:** 리뷰의 (a) 안을 골랐다.
- `useCostDraft` 에 `dirty` 를 둔다. 값은 `edited ∨ hold` 다. 즉 이번 포커스 뒤에 고쳤거나, 지난 시도가 다 반영되지 않아 입력값을 쥐고 있는(재시도) 상태다.
- `saveBudget` · `saveFee` 는 `dirty` 일 때만 보낸다. 안 고친 Enter 는 불일치 상태여도 요청 없이 「변경 없음」 이다. 확인 전이면 칩을 바꾸지 않고 조용히 끝낸다.
- 불일치를 맞추려면 값을 직접 쳐야 한다. 같은 숫자를 다시 쳐도 보낸다. 표기가 같으면 1라운드 WR-01 대로 서버 원 값을 그대로 보내 끝자리를 깎지 않는다.
- 포커스 이탈 조건(`edited`)은 바꾸지 않았다. PUT 에 대상 서버 목록을 넣는 (b) 안은 API 를 넓혀야 해서 쓰지 않았다.

**회귀 테스트:** 새로 2건. 불일치 상태 안 고친 Enter 요청 0 · 「변경 없음」 · 불일치 줄 유지, 그리고 실패 뒤 입력값이 남은 칸은 고치지 않아도 Enter 로 다시 보냄(재시도 유지). 기존 2건(`(behavior 3) 불일치 …` · `(WR-01) 불일치 맞추기 …`)은 「직접 쳐서 맞춤」 계약에 맞췄다. 소스를 고치기 전 새 계약 단언 2건이 실패하는 것을 확인했다.
**상태:** fixed: requires human verification — UAT 2 의 「고치지 않고 Enter → 변경 없음 · 요청 없음」 이 이제 다중 등록 · 불일치 계좌에서도 성립한다. 반대로 「Enter 만으로 맞추기」 는 없어졌다(값을 다시 쳐야 한다). 이 UX 가 운영 의도와 맞는지 확인이 필요하다.

### WR-02(R2): `/me` 는 시세를 구독하지 않는다 — 직접 진입이면 priceOf 가 늘 undefined, 페이지 이동 뒤엔 굳은 옛 시세로 잔고 평가 · 주문가능을 계산한다

**고친 파일:** `webapp/src/lib/use-available-krw.ts`, `webapp/src/components/trading/me-client.tsx`, `webapp/src/components/trading/__tests__/me-client.test.tsx`
**커밋:** 4bd0464a
**적용한 수정:** 구독을 두는 쪽과 굳은 값을 쓰지 않는 쪽을 둘 다 적용했다.
- `priceIsinsOf(account)` 를 새로 두었다. 보유 전부와 시장가(price 0) 매수 미체결(취소 보냄 제외)의 ISIN 을 중복 없이 정렬해 돌려준다. 거르는 규칙은 `availableKrwOf` 와 같다.
- `useSubscribedPriceOf(isins, enabled)` 를 새로 두었다. 작업대와 같은 relay 구독 API(`subscribe` · `unsubscribe`)로 ISIN 마다 KRX · NXT 를 `level: "price"` 로 구독한다. 키 집합이 바뀌면 새 키를 먼저 잡고 빠진 키만 놓는다. 남는 키는 와이어 왕복이 없다(`useRelaySubscription` 과 같은 규율). 비활성 · 언마운트면 전부 놓는다.
- 반환하는 `priceOf` 는 **구독을 잡은 뒤 새로 온 시세 객체만** `holdingQuotePrice`(KRX → NXT) 규칙에 넣는다. 작업대에서 넘어와 맵에 굳어 있던 값은 쓰지 않는다. relay 가 구독 직후 마지막 스냅샷(hub `getSnapshot`)을 내리므로 보통 한 박자 안에 새 값이 온다. 그 전이나 연결이 끊긴 동안은 undefined(평가 「—」 · 시장가 매수 미체결 0 · 종전 규칙)다.
- `me-client` 는 잔고 탭이 열려 있을 때만(`tab.active === "accounts"`) 고른 계좌의 그 ISIN 을 구독한다.

**회귀 테스트:** B4d. 구독 키(보유 · 시장가 매수만 · 지정가 매수 · 매도 미체결 제외 · KRX/NXT · price), 구독 전부터 있던 굳은 값 무시, 구독 뒤 새 값 사용(KRX 가 굳었으면 새 NXT), 탭 이탈 시 4키 해제를 본다. B4c 는 새 계약(구독 뒤 도착)에 맞췄다. 소스를 고치기 전 B4d 가 실패하는 것을 확인했다.
**상태:** fixed: requires human verification — 라이브에서 「작업대 → /me 잔고」 SPA 이동과 「/me 새로고침」 두 경로를 확인하기를 권한다. 평가 · 주문가능이 잠깐 「—」 였다가 현재가로 채워지면 맞다.
**남은 점(범위 밖 · 참고):**
- 드문 경로가 하나 있다. 구독 제어 버킷이 막혀 해제가 아직 와이어로 안 나간 키를 /me 가 다시 잡으면, relay 가 새 스냅샷을 보내지 않는다. 그러면 다음 가격 변화 전까지 그 종목이 「—」 로 보인다. 틀린 값이 아니라 빈 값이라 받아들였다.
- 작업대도 카드가 없는 보유 종목은 같은 「굳은 시세」 맵을 읽는다(수정 전부터 있던 동작). 리뷰 범위 밖이라 건드리지 않았다. 근본 해결(구독 해제 시 `quotes` 에서 키를 지움)은 provider 전역 동작을 바꾸므로 별도 작업으로 남긴다.

### WR-03(R2): 되싣기 누락은 timeout · offline 실패에서 여전히 영구적이다 — `firstSeen` 이 휘발성

**고친 파일:** `relay/src/admin/dispatcher.ts`, `relay/tests/admin-dispatcher.test.ts`
**커밋:** 6f9cb46a
**적용한 수정:** 되싣기 트리거에 87 상태 기준의 멱등 조건을 더했다.
- 대상은 ① `firstSeen`(이번 호출에서 처음 생긴 계좌 · 종전)과 ② 이 서버 87(보내기 전)에서 예수금 · 수수료 · 매도세가 **전부 0** 인, 이 유저의 이 서버 active 의도 계좌다(`costsUnsetIn`). 칸이 없는 행(값 모름)은 대상이 아니다.
- 출처 값(`#costSourceOf` · 종전 규칙 그대로)이 전부 0 이면 보내지 않는다. 미설정 계좌에는 reconcile 마다 아무것도 보내지 않는다(재조회도 없다).
- ② 대상이 있는데 이번 호출에서 87 을 새로 받지 않았으면, 보내기 전에 op 5 로 한 번 다시 받는다. 그 결과 아직 0 인 것만 보낸다. relay 밖에서 넣은 값을 덮지 않기 위해서다(R3-01 과 같은 결). 재조회가 실패하면 이번에는 생략한다(fail closed).
- 실리면 87 이 0 이 아니게 된다. 그래서 다음 reconcile 은 0회다(멱등).
- 이번 호출이 연결 실패(timeout · offline)로 끝났으면 여기서는 보내지 않는다. 응답 없는 서버에 op 를 더 쌓지 않고, ② 가 다음 「다시 반영」 에서 거둔다. 그래서 timeout · relay 재기동 · admin 재접속 뒤에도 영구 누락이 없다.
- `#reloadCosts` 를 대상 선정 · `#costSourceOf`(출처 계산) · `#sendCosts`(송신 · 비치명 warn)로 나눴다. 출처 87 에 계좌가 없을 때의 warn 은 ① 에만 남긴다. ② 는 reconcile 마다 같은 줄을 남기지 않는다. ② 로 되싣을 때는 info 1줄(마스킹 계좌)을 남겨 관측할 수 있게 했다.

**회귀 테스트:** ⑥-d(0 상태 계좌를 보낼 op 없는 reconcile 이 op 5 재조회 뒤 op 6 · op 7 로 복구하고 두 번째 reconcile 은 0회), ⑥-e(뒤 op 4 timeout → 이번엔 0회 → 다음 reconcile 이 A 복구), ⑥-f(출처도 전부 0 → 재조회 · 송신 0 · 두 번 돌려도 0). 기존 ⑥-b · ⑥-c · ⑧ · (D-04)는 그대로 통과한다. 소스를 고치기 전 ⑥-d · ⑥-e 가 실패하는 것을 확인했다.
**상태:** fixed: requires human verification — 되싣기 조건을 바꾼 수정이다. 아래 두 경계가 운영상 괜찮은지 확인을 권한다.
- 어드민이 예수금 · 수수료 · 매도세를 **셋 다** 0 으로 해제했는데 일부 서버가 실패했다고 하자. 그러면 다음 「다시 반영」 이 아직 값이 남은 서버를 출처로 삼아 해제된 서버에 값을 다시 싣는다. 87 만으로는 「한 번도 설정 안 함」 과 「일부러 해제함」 을 가릴 수 없다. 예수금만 해제하는 흔한 경우는 수수료가 남아 있어 대상이 아니다. 어드민 카드의 불일치 줄은 해제 실패를 이미 보여 준다.
- op 6/7 을 모르는 구 서버(code 1)의 0 상태 계좌는 어드민이 「다시 반영」 할 때마다 op 6/7 을 다시 보내고 실패 warn 을 남긴다. reconcile 은 전부 어드민이 부르는 경로라 자동 반복은 없다. 두 운영 서버는 이미 op 6/7 을 지원한다.

## 검증

- **어디서 돌렸나:** 격리 worktree `.claude/worktrees/phase-36-fix2`(node_modules · env 준비됨)에서 돌렸다. 메인 체크아웃이 아니다. 이 브랜치를 master 에 합치면 같은 커밋에서 그대로 재현된다.
- **typecheck:** `relay` `tsc --noEmit -p .` 통과, `webapp` `tsc --noEmit -p .` 통과. shared · server 는 바꾸지 않았다.
- **lint:** `webapp` eslint(account-editor.tsx · me-client.tsx · use-available-krw.ts) 통과.
- **단위(수정마다):** 관련 vitest 를 `--maxWorkers=2` 로 돌렸다. 4건 모두 수정 전 RED · 수정 뒤 GREEN 을 확인했다.
- **전체 스위트(패키지당 1회 · `--maxWorkers=2`):** relay 60 파일 1779 passed. webapp 193 파일 5011 passed + 1 skipped.
- **Playwright(`--workers=1` · 3100 · 8090 포트가 비어 있어 이 worktree 의 dev 서버로 돌렸다):** `admin.spec.ts --grep P36` 3 passed(setup 포함). `me.spec.ts` 전체 40 passed(setup 포함).

---

_Fixed: 2026-10-28T03:50:56Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
