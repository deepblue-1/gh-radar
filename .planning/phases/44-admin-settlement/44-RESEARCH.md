# Phase 44: 어드민 정산 - Research

**Researched:** 2026-11-20
**Domain:** 어드민 화면(Next.js) + Express 어드민 라우트 + Supabase 표 · RPC + relay 예수금 읽기 · 쓰기(op 6) 재사용 + shared 순수 계산
**Confidence:** HIGH(코드 경로 · 계산 규칙 · 테스트 도구) / MEDIUM(반영 실패 · 재시도 규칙 — 설계 판단) / LOW(운영 예수금 현재값 · 계좌번호 대응 — 이 세션에서 못 봄)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### 수익 계산 기준 (D-01 ~ D-05)
- **D-01: 수익 = 계좌 예수금 − 그 계좌에 넣은 돈.** 계좌 누적 수익 = 예수금 − (그 계좌로 들어온 돈 합 − 그 계좌에서 나간 돈 합). 들어온 돈 = 출자 + 옮겨 온 돈, 나간 돈 = 수익 출금 + 원금 회수 + 옮겨 간 돈(목업 `accBal` 의 `bal = tin + prof − tout` 을 `prof` 에 대해 푼 식 — 목업의 「장부 잔액」 자리에 예수금이 들어간다). 묶음 누적 수익 = 소속 계좌 합. **정산 전 수익 = 묶음 누적 수익 − 그 묶음에서 이미 확정한 정산 수익의 합.** 쥬니 묶음은 정산 전 수익이 0 이하면 나눌 수익 0(목업 `dist`). 로드맵 확정 규칙 2(실현손익 합 + 역산 시작값)를 대체한다. — **Reversibility:** costly — 정산 기록이 예수금 스냅샷으로 남으므로 기준을 다시 바꾸면 지난 정산을 새 기준으로 다시 계산해야 한다.
- **D-02: 시작값 · 경계 날짜 · 손익 보정 · 잔액 대조는 만들지 않는다.** `dma_journal_events.realized_pnl_krw` 와 어드민 「매매손익」(`/admin/pnl`)은 정산 계산에 쓰지 않는다(참고 화면으로만 남는다). 예수금을 실계좌에 맞추는 것이 곧 잔액 대조다. 사용자가 예수금을 고치면 그 차이는 그대로 수익에 들어간다(의도한 동작).
- **D-03: 예수금 값은 어드민 계좌 메뉴가 보여 주는 값과 같은 값.** 등록 서버 중 (유효) 주문 서버의 값 · 67 live 가 있으면 그것, 없으면 87 값(Phase 36 D-03 · D-05 · shared `accountCostOf` 규칙). 정본은 매매 서버이고 DB 의도 저장이 없다는 Phase 36 D-04 는 그대로다. 서버마다 값이 갈린 경우의 표시는 Claude 재량(아래).
- **D-04: 마지막으로 읽은 예수금을 DB 에 남기고 「읽은 시각」 을 화면에 보인다.** 매매 서버가 꺼져 있거나 relay 가 못 읽으면 마지막 값과 그 시각을 보여 준다. 남기는 시점(화면 조회 때 · 주기 작업 · 둘 다)은 플래너가 정한다 — 화면 조회가 relay 를 부르는 것은 어드민 전용이라 사용자 수에 비례하지 않는다.
- **D-05: 계좌 4개 모두 이 시스템으로만 매매한다(사용자 확인).** 증권사 앱 직접 매매가 없으므로 손으로 손익을 더하는 칸은 없다.

### 나누는 규칙의 빈칸 (D-06 ~ D-09)
- **D-06: 쥬니 묶음 손실이 1억을 넘으면 넘는 부분은 현중 · 근형 반반.** 목업 `person()` 의 `loss` 식 그대로(심쥬니는 자기 원금 1억까지, 나머지는 둘이 똑같이). 「가정」 표시는 붙이지 않는다 — 확정 규칙이다.
- **D-07: 8/10 법인 용역 세금은 화면에 적지 않는다.** 거래 종류는 4가지 그대로이고 「공동 비용」 종류는 만들지 않는다. 필요하면 그 거래의 메모에만 적는다.
- **D-08: 화면 금액은 전부 억 · 만 표기(만 미만 버림).** 목업 `won()` · `fm()` · `sg()` 그대로 — 「9억 2,450만」 · 「5,950만」. 원 단위 표시는 어디에도 없다(정산 확정 몫 · 바로 출금 · 「얼마면 맞음」 포함). 사용자가 「보낼 돈만 원까지」 권고안 대신 고른 값이다.
- **D-09: 거래 금액 입력은 만원 단위, 내부 계산 · 저장은 원 단위.** 「바로 출금」 금액은 그 사람 몫에서 만원 미만을 버린 값으로 적는다. 버려진 끝돈과 나눌 때 남는 1 ~ 2원은 사라지지 않고 각자 수익 몫 · 다음 정산에 남는다.

### 거래 기록과 예수금 (D-10 ~ D-15)
- **D-10: 거래를 저장하면 그 계좌 예수금도 같이 고친다(「예수금에도 반영」 스위치).** 출자 = 받은 계좌 +, 수익 출금 · 원금 회수 = 뺀 계좌 −, 계좌 옮김 = 보낸 계좌 − · 받은 계좌 +. 매매 서버에는 기존 예수금 설정 경로(op 6 · `PUT /api/admin/accounts/:broker/:accountNo/budget` 의 fan-out — 등록 서버 전부에 같은 값)로 보낸다. 사용자가 「안내만 하고 직접 고침」 권고안 대신 고른 값이다.
- **D-11: 스위치 기본값은 날짜로 정한다.** 거래 날짜가 오늘이면 켜진 채로, 지난 날짜면 꺼진 채로 열리고 직접 바꿀 수 있다. 켜져 있으면 저장 전에 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」 처럼 바뀔 값을 미리 보여 준다.
- **D-12: 거래 기록 시트에 날짜 칸을 둔다.** 기본 오늘 · 지난 날짜 가능 · 미래 날짜 불가(목업에는 날짜 칸이 없다).
- **D-13: 장중에도 예수금에 반영한다.** 지금 매매 서버 명령은 「예수금을 얼마로 정해라」 뿐이라 반영 순간 체결이 겹치면 그 체결 손익 한 건이 예수금에서 빠질 수 있다 — 사용자가 감수하기로 했다(실계좌에 맞출 때 바로잡힌다). `08:00` ~ `20:00` 에 스위치가 켜져 있으면 「체결과 겹치면 어긋날 수 있어요」 한 줄만 보인다. gh-trade 에 「더하기 · 빼기」 명령을 요청하지 않는다.
- **D-14: 처음 넣을 이체 9건은 배포 때 미리 넣는다(예수금 안 건드림).** 목업 `LEDGER` 의 9건 그대로(2025-12-31 출자 2건 · 2026-08-10 법인 용역 3억 · 09-10 쥬니 출자 1억 · 09-10 / 09-13 / 09-18 KB 정근형 → KB 김현중 1억씩 · 09-13 KB 정근형 → 교보 김현중 4억 · 11-01 KB 정근형 → 교보 정근형 0.2억).
- **D-15: 정산 확정의 「바로 출금」 줄도 같은 규칙으로 예수금에 반영한다.** 오늘 날짜 거래라 기본 켜짐(D-10 · D-11 의 귀결 — 따로 묻지 않았다). 뺄 계좌는 목업 `payAcc`(그 묶음에서 본인 명의 계좌 우선 · 없으면 잔액 큰 계좌).

### 정산 확정 · 취소 (D-16 ~ D-17)
- **D-16: 정산 확정은 언제든 누를 수 있고, 누른 순간의 예수금으로 확정한다.** 확정 시트가 계좌별 예수금과 「읽은 시각」 을 보여 주고, 장중이면 「체결 중이라 값이 움직이고 있어요」 한 줄을 띄운다. 매매 서버가 꺼져 있으면 마지막으로 읽어 둔 값과 그 시각으로 확정한다. 정산 기록에는 그때의 계좌별 예수금 · 넣은 돈 · 수익을 함께 남긴다(나중에 「왜 그 금액인가」 를 따질 수 있게). 「마감 전이면 어제까지」 는 예수금 기준에서 쓸 수 없어 버렸다.
- **D-17: 확정한 정산은 묶음별로 가장 최근 것 하나만 취소할 수 있다.** 취소하면 그 수익이 「정산 전 수익」 으로 돌아가고, 그때 같이 만든 「바로 출금」 줄도 함께 사라진다(예수금을 되돌릴지는 D-10 스위치로 고름). 더 옛날 정산을 고치려면 최근 것부터 차례로 취소한다.

### 볼 수 있는 사람 (D-18)
- **D-18: 관리자만 보고 적는다.** 다른 어드민 화면과 같은 관문 — webapp 미들웨어 `/admin` 접두 + server `requireAuth` → `requireAdmin`. 사이드바 Admin 묶음에 「정산」 추가. 세 사람과 로그인 계정을 잇는 설정은 필요 없다.

### 기록 고치기 · 이력 (D-19 ~ D-21)
- **D-19: 계좌 거래는 고치기 · 지우기가 된다.** 거래 줄을 눌러 날짜 · 금액 · 계좌 · 사람 · 메모를 고치거나 지운다. 예수금에 반영했던 거래를 고치거나 지울 때는 같은 「예수금에도 반영」 스위치로 되돌릴지 고른다. 정산 확정 때 만들어진 「바로 출금」 줄은 그 정산을 취소해야만 사라진다(줄에서 직접 지우기 불가).
- **D-20: 줄마다 적은 사람 · 시각을 보인다.** 거래 줄 · 정산 기록을 펼치면 「적은 사람 · 시각」(고쳤으면 「고친 사람 · 시각」). 사람은 `req.adminEmail`.
- **D-21: 고치기 전 값 · 지운 줄 · 취소한 정산은 DB 에 남긴다. 화면 목록은 만들지 않는다.** 필요할 때 DB 에서 조회한다(「변경 이력」 전환 버튼 없음 — 아래 전환은 목업 그대로 3개).

### 목업 3차에서 확정한 화면 (D-22 ~ D-27 · 2026-11-19 사용자 「좋아」)
`a-real.html` 을 예수금 기준으로 고친 3차(같은 파일)를 보여 주고 채택받았다. 아래 「목업 대비 달라지는 화면」 6가지가 전부 목업에 들어 있고, 목업이 정본이다.
- **D-22: 계좌 거래 줄은 누르면 펼쳐진다(바로 시트가 열리지 않는다).** 펼친 자리에 「적은 사람 · 시각」(고쳤으면 「고친 사람 · 시각」 한 줄 더) · 「예수금」 줄(「반영함」 / 「그대로 둠」 / 「○○ 미반영 — 매매 서버에 보내지 못했어요」 + 「다시 반영」) · 「고치기」 「지우기」 단추. 정산 때 만든 「바로 출금」 줄은 단추 대신 「11/19 정산 때 만든 줄이에요 — 그 정산을 취소하면 함께 사라져요」. 적은 사람은 이메일 그대로, 배포 때 넣은 9건은 「배포 때 미리 넣은 내역」. 정산 기록 펼침과 같은 방식이다.
- **D-23: 지우기와 정산 취소는 확인 시트를 한 번 거친다.** 「거래 지우기」 · 「정산 취소」 시트가 무엇이 사라지는지 한 문단으로 보이고, 예수금에 반영했던 것이 있을 때만 같은 「예수금에도 반영」 스위치(기본 켜짐)와 바뀔 값 미리 보기를 보인다. 반영한 적이 없으면 스위치가 없다. 「거래 고치기」 시트의 스위치 기본값은 반영했던 거래면 켜짐, 아니면 날짜 규칙(D-11)이고, 켜져 있으면 옛 값을 되돌리고 새 값을 넣은 결과 하나만 미리 보인다.
- **D-24: 「정산 전 수익」 카드는 묶음마다 계좌별 「예수금 · 넣은 돈 · 수익」 표.** 부제 「수익 = 예수금 − 넣은 돈 · 예수금 읽은 시각 오늘 `HH:MM`」. 넣은 돈은 들어온 돈 − 나간 돈이고 음수면 음수 그대로(KB 정근형 「−2억 2,000만」 · 마우스를 올리면 「들어온 돈 8억 − 나간 돈 10억 2,000만」). 정산한 적이 있는 묶음은 표 아래 「누적 수익 … · 이미 정산한 수익 …」 한 줄. 2차의 기간 줄(「25년 말 ~ 11/19」)은 없다.
- **D-25: 예수금이 미설정인 계좌가 낀 묶음은 수익 「—」 + 안내 + 확정 잠금.** 표의 그 계좌 예수금 칸 「미설정」 · 수익 칸 「—」, 묶음 아래 「예수금이 설정되지 않은 계좌가 있어요」 + 「계좌 메뉴에서 설정」 링크. 그 묶음에 몫이 있는 사람 카드의 「내 수익 몫」 · 「정산 전 수익 중 내 몫」 · 「지금 몫 전체」 와 「명의 대 몫」 의 해당 금액도 「—」(「예수금이 설정되지 않은 계좌가 있어 맞출 금액을 계산할 수 없어요」). 매매 서버에서 못 읽은 계좌는 마지막으로 읽은 값으로 계산하고 표 아래 「교보 김현중 · 교보 정근형 — 매매 서버에서 못 읽어 어제 19:58 에 읽은 값이에요」 한 줄(D-04). Claude 재량 기본안이 그대로 채택된 것이다.
- **D-26: 예수금을 매매 서버에 못 보낸 거래는 저장하고 줄에 「예수금 미반영」 칩.** 펼치면 못 보낸 계좌 이름과 「다시 반영」. 계좌 옮김에서 한쪽 계좌만 실패하면 그 계좌만 미반영으로 남고 「다시 반영」 은 못 보낸 쪽만 다시 보낸다(같은 거래가 두 번 반영되지 않게 계좌별로 남긴다).
- **D-27: 「정산하기」 시트는 기간 줄 대신 계좌 표와 읽은 시각.** 「정산 전 수익 · 확정을 누른 순간의 예수금으로 정해요」 + 큰 수익 숫자 + D-24 와 같은 표 + 「예수금 읽은 시각」 + 장중 한 줄(D-16). 「바로 출금」 을 한 사람이라도 고르면 「뺄 계좌 — 김현중 교보 김현중 · … · 금액은 만원 미만을 버리고 적어요」 한 줄과 「예수금에도 반영」 스위치(기본 켜짐 · 바뀔 값 미리 보기 · 장중 한 줄 D-13)가 나온다. 정산 기록 줄의 둘째 칸은 「`HH:MM` 예수금으로 확정 · 메모」, 펼치면 사람별 몫 아래 「확정한 순간의 계좌」 표(그때의 예수금 · 넣은 돈 · 수익 · 읽은 시각) · 적은 사람 · 시각 · 「정산 취소」. 가장 최근이 아닌 정산은 단추 대신 「더 최근 정산부터 차례로 취소할 수 있어요」. 거래 기록 시트의 칸 순서는 무슨 거래 → 계좌 · 사람 → 금액 → 날짜 → 메모 → 예수금 스위치.

### 목업 대비 달라지는 화면 (3차 목업에 반영 끝)
`a-real.html` 2차 채택 뒤 이 논의로 화면에 새로 보이는 것이 생겼다. 교훈 2026-09-18(「화면에 새로 보이는 것이 하나라도 있으면 planner 전에 HTML 목업」)에 따라 `/gsd-sketch` 로 3차를 보여 주고 답을 받았다(위 D-22 ~ D-27).
- 「정산 전 수익」 카드 부제 — 「10/27 까지는 역산 시작값 · 10/28 부터 매매손익」 → 예수금 기준 · 「예수금 읽은 시각」. 계좌별 줄은 「예수금 · 넣은 돈 · 수익」.
- 거래 기록 시트 — 날짜 칸(D-12) · 「예수금에도 반영」 스위치와 바뀔 값 미리 보기(D-10 · D-11) · 장중 한 줄(D-13).
- 계좌 거래 줄 — 눌러서 고치기 · 지우기(D-19) · 적은 사람 · 시각(D-20) · 예수금 반영 실패 표시와 「다시 반영」(재량).
- 정산 확정 시트 — 계좌별 예수금 + 읽은 시각 · 장중 한 줄(D-16) · 바로 출금 금액은 만원 미만 버림(D-09).
- 정산 기록 펼침 — 그때의 계좌별 예수금 · 넣은 돈 · 수익(D-16) · 「정산 취소」(가장 최근 것만 · D-17) · 적은 사람 · 시각.
- 예수금이 「미설정」 이거나 못 읽은 계좌가 있는 묶음의 표시(재량).

**로드맵에서 이미 잠긴 것(재론 금지 — CONTEXT `<domain>`):**
- 정산 묶음 2개 — 「현중 · 근형」 = KB 정근형 · 교보 김현중 · 교보 정근형, 김현중 5 : 정근형 5 / 「쥬니」 = KB 김현중, 원금 4억(현중 1.5억 + 근형 1.5억 + 쥬니 1억)을 넘는 수익부터 심쥬니 4 : 김현중 3 : 정근형 3.
- 정산 확정은 몫만 고정한다(출금 강제 아님). 확정 때 사람별 「바로 출금」 선택. 사람별 수익 몫 = 정산한 몫 + 정산 전 몫 − 수익 출금.
- 쥬니 묶음은 원금 4억을 회복할 때까지 정산이 없다(손실 이월 · 확정 버튼 잠김). 「원금보장」 = 손실 −1억까지 심쥬니 혼자.
- 계좌 거래 종류 4가지 — 수익 출금 · 원금 회수 · 출자 · 계좌 옮김(경로 「계좌이체 / 법인 용역」). 2026-08-10 3억은 「계좌 옮김 · 법인 용역」(수익 · 몫 영향 0 · 개인 이체 합계 제외 · 따로 한 줄). 묶음 사이로 옮긴 돈은 현중 · 근형 반반 원금.
- 「0 이 되려면」 은 숫자 둘 — 명의 대 몫 / 실제 오간 계좌이체. 증여 판단은 화면이 하지 않는다(사실 관계만).
- 화면 뼈대는 A안 「사람 먼저」 — 세 사람 카드 → 정산 전 수익 → 명의 대 몫 + 현중 ↔ 근형 계좌이체 → 한 카드에서 정산 기록 · 계좌 거래 · 현중 ↔ 근형 이체 전환.

### Claude's Discretion
- 묶음 · 비율 · 계좌 소속 · 사람 · 원금 기준(4억) · 원금보장 정의를 DB 표로 둘지 shared 상수로 둘지. 화면에서 바꾸는 UI 는 범위 밖이다.
- 예수금이 「미설정(0)」 이거나 한 번도 못 읽은 계좌가 있을 때의 표시는 목업 3차로 확정됐다(D-25). 남은 재량: 등록 서버 간 값이 갈린 경우 — 기본안: 계좌 메뉴와 같은 값(주문 서버)으로 계산하고 갈림 경고 한 줄(`OrderEndpointMismatchLines` · `WARN_LINE` 선례 · 목업에는 없는 상태).
- 예수금 반영이 실패했을 때의 표시는 목업 3차로 확정됐다(D-26). 남은 재량: 한 계좌의 등록 서버 중 일부만 성공했을 때 그 계좌를 미반영으로 볼지(기본안: 한 대라도 실패면 미반영 · 「다시 반영」 은 같은 값을 다시 보내므로 두 번 반영되지 않는다).
- 예수금에 더하고 빼는 순서 — 기본안: Express 가 그 순간 값(D-03)을 읽어 새 값을 계산한 뒤 기존 op 6 경로로 보낸다. 계좌 옮김은 두 계좌를 차례로.
- 마지막으로 읽은 예수금을 남기는 방식(D-04) · 표 이름 · RPC 모양 · 이력 보존 방식(D-21 — 이력 표 / 지움 표시 열).
- 계산 함수 위치 — 기본안: 목업의 `person` · `caps` · `hgOf` · `hgSum` · `nameVs` · `payAcc` 를 shared 순수 함수 한 벌로 옮기고(webapp · server 테스트가 같은 것을 읽는다 · Phase 36 D-11 선례), 조회는 DB 왕복 1회(Cloud Run 왕복 비용 메모).
- 원 단위로 나눌 때 끝전 — 기본안: 각자 몫 원 미만 버림, 남는 원은 정산 전 수익에 남긴다.
- 사이드바 「정산」 의 자리 — 기본안: 「매매손익」 바로 다음.
- 문서 제목 「정산 · Admin」 · 빈 상태 · 불러오기 실패 문구.

### Deferred Ideas (OUT OF SCOPE)
- **관리자별 어드민 메뉴 접근 권한** — 사용자 요청(「admin 메뉴별 접근권한을 관리자별로 설정할 수 있으면 좋겠어」). 어드민 메뉴 전체(매매손익 · 계좌 · 사용자 · 서버 · 러쉬 주문 · 정산)에 걸친 새 기능이라 별도 phase. 정산 화면은 관문이 한 곳이라 나중에 그대로 얹을 수 있다.
- **세 사람(정근형 · 심쥬니) 보기 전용 화면** — 이번엔 관리자만. 메뉴별 권한이 생기면 그쪽에서 푼다.
- **매매 서버 「예수금 더하기 · 빼기」 명령(gh-trade)** — 장중 반영이 체결과 겹치는 문제의 근본 해결. 이번엔 감수(D-13). 어긋남이 실제로 문제가 되면 `scripts/trade-handoff.sh` 로 요청.
- **「공동 비용」 거래 종류** — 용역 세금 등(D-07 로 이번엔 없음).
- **화면의 「변경 이력」 목록** — 이력은 DB 에만(D-21).
- **묶음 · 비율 · 계좌 소속을 화면에서 바꾸기** — 지금은 고정값.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQUIREMENTS.md 에 매핑된 REQ-ID 가 없다(로드맵 「Requirements: TBD」). 아래는 로드맵 확정 규칙과 CONTEXT 결정 묶음을 요구사항으로 본 대응표다 — 플래너는 이 「규칙 N」 · 「D-NN」 을 must_haves 의 출처로 쓴다.

| ID | Description | Research Support |
|----|-------------|------------------|
| 규칙 1 | 묶음 2개 · 비율 · 원금 4억 · 계좌 소속 | §계산 규칙 R0(shared 상수) · §Open Questions 2(계좌번호 대응) |
| 규칙 2 / D-01 ~ D-05 | 수익 = 예수금 − 넣은 돈 · 예수금 = 계좌 메뉴 값 · 마지막 읽은 값 저장 | §예수금 읽기 경로 · Pattern 1 · R1 ~ R5 · §Open Questions 1(예수금 = 매입가 포함) |
| 규칙 3 / D-09 · D-15 · D-16 | 정산 확정 = 몫 고정 · 바로 출금 · 누른 순간 예수금 | Pattern 3 · R6 · R15 · Pitfall 5 |
| 규칙 4 / D-06 | 쥬니 묶음 손실 이월 · 원금보장 · 1억 넘는 손실 반반 | R5 · R8(loss) · 검산 픽스처 |
| 규칙 5 / D-07 · D-14 | 거래 4종 · 법인 용역 · 9건 시드 | §데이터 모델 · R7 · R9 · 시드 SQL 주의 |
| 규칙 6 | 명의 대 몫 · 계좌이체 누적 | R9 · R10 · 검산 픽스처 |
| D-08 | 억 · 만 표기 | §표기 함수 비교(기존 shared 포맷터는 다름 → 새 3개) |
| D-10 ~ D-13 · D-26 | 예수금 반영 · 스위치 · 장중 · 미반영 · 다시 반영 | Pattern 2 · Pitfall 1 ~ 4 · §Open Questions 3 |
| D-17 · D-19 ~ D-21 · D-23 | 최근 정산만 취소 · 고치기 · 지우기 · 이력 DB | §데이터 모델 · RPC 오류 코드 |
| D-18 | 관리자만 | 라우터 경로 한정 관문 · 사이드바 |
| D-22 ~ D-27 | 목업 3차 화면 | 44-UI-SPEC.md(승인) — 이 문서는 데이터 · 계산 · 경로만 |
</phase_requirements>

## Summary

이 phase 는 **새 라이브러리 없이** 이미 있는 부품 세 개를 엮는 일이다. ① 예수금 읽기는 relay `GET /internal/admin/account-costs` → server `relay.accountCosts()`(2초 상한) → shared 판정(`accountCostOf` → `summarizeAccountCosts`) — 계좌 메뉴와 같은 값(D-03)을 server 에서 다시 만들려면 지금 **비공개**인 함수 몇 개를 export 해야 한다. ② 예수금 쓰기는 `PUT /accounts/:broker/:accountNo/budget` 안쪽의 `fanoutOne` + `activeLinkUsers`(역시 비공개) → relay op 6. ③ 계산은 목업 JS 를 shared 순수 함수로 옮긴다 — 목업 함수를 node 로 그대로 돌려 CONTEXT 의 검산 숫자가 **전부 재현됨**을 확인했다(아래 픽스처 표).

리서치가 확인한 가장 중요한 사실은 **예수금(`budget_krw`)이 「현금 + 보유 종목 매입금액」 이라는 것**이다(gh-trade 문서 ③ 「매수 금액 자체는 잔고 매입금액으로 이미 빠진다」 · ⑦ 「한도는 지금 운용 자금」). D-01 은 그대로 성립하지만, 사용자가 「실계좌 금액에 맞춘다」 할 때 넣을 값은 증권사 앱의 「예수금」(현금)이나 「평가금액」 이 아니라 **D+2 예수금 + 보유 종목 매입금액**이어야 한다 — 사용자 확인이 필요해 Open Questions 맨 위에 올렸다. 교보도 같은 경로(op 6 · 67 · 87)로 읽고 쓴다(코드로 확인). 계좌 4개의 지금 예수금과 계좌번호 대응은 이 세션에서 볼 수 없어 「배포 날 확인할 항목」 으로 남긴다 — 10-27 기록상 KB 두 계좌는 **미설정**이었다.

반영(예수금에 더하고 빼기)은 「읽고 → 더하고 → 절댓값으로 쓰기」 라 세 가지 함정이 있다: 새 값이 0 이하면 op 6 의 0 = 「해제」 가 되어 묶음이 「미설정」 으로 뒤집힘 · relay `timeout` 은 실패가 아니라 「모름」 이라 다시 반영이 두 번 더할 수 있음 · 계좌 옮김을 두 계좌 차례로 보내면 브라우저 20초 상한을 넘을 수 있음. 아래 Pattern 2 와 Pitfall 1 ~ 4 가 막는 법이다.

**Primary recommendation:** shared `settlement.ts`(상수 · 계산 · 표기 · 예수금 선택) 한 벌 + Supabase 표 5개 · RPC 7개(조회는 `admin_settlement_raw()` 1회) + Express `adminSettlementRouter`(`/settlement` 경로 한정 관문 · 예수금 읽기는 `relay.accountCosts` 와 RPC 병렬 · 쓰기는 export 한 `fanoutOne` 재사용) + webapp `/admin/settlement`(UI-SPEC 그대로). 반영 기록은 계좌별 `{ deltaKrw, targetKrw, reason }` 로 남기고 다시 반영은 「지금 값 = targetKrw 면 보내지 않음 · 아니면 지금 값 + deltaKrw」.

## Project Constraints (from CLAUDE.md)

- 응답 · 문서는 한국어, 식별자 · 경로 · 로그 원문은 원어. 범위 물결표는 앞뒤 띄어쓰기(`08:00` ~ `20:00`).
- 배포 환경: 프론트 Vercel(push = 프로덕션), 백엔드 Cloud Run. 배포 순서 DB → server(`scripts/deploy-server.sh`) → webapp push. relay 변경이 없으면 relay 배포 없음. 배포 · `db push` 는 메인 세션만(서브에이전트 금지 — 메모리).
- 공식 API 운영 기준(Naver · OpenDART)과 스크래핑 5원칙은 이 phase 와 무관(외부 API 호출 없음 — relay 내부 HTTP 만).
- GSD 워크플로 강제 — 파일 변경은 GSD 명령 안에서.
- 상따 화면 컨테이너 쿼리 규약은 `/trading/limit-chaser` 전용 — 정산 화면은 UI-SPEC 의 `@container/settle` 768 한 경계(별개).
- 메모리 규칙(사용자 전역 · 프로젝트): Supabase RPC 는 `REVOKE … FROM PUBLIC, anon, authenticated` 명시 · 새 표 RLS on · server 는 Supabase 왕복 수가 지연을 지배(다중 조회는 RPC 1회) · 동시 세션 메모리 고갈 방지(vitest `--maxWorkers=2` · playwright `--workers=1`) · 보안 위협 모델(SECURITY.md) 생략(`security_enforcement: false`) · 마이그레이션 버전은 실행 시점에 `ls` 와 원격 머리를 보고 정함 · shared `index.ts` re-export 는 확장자 없이 · 커밋은 경로 지정(동시 세션 경합).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 화면 · 시트 · 미리 보기 계산 | Browser(webapp 클라이언트 본문) | — | 미리 보기(`diff(applied(old), eff(new))`)는 화면이 가진 값으로 즉시 그린다(UI-SPEC E10 loading dismissed) |
| 관리자 관문 | Frontend Server(middleware `/admin`) | API(`requireAuth` → `requireAdmin`) | 데이터 인가는 Express 가 한다 — 웹 판정은 표시 장치(D-18) |
| 예수금 읽기(현재값 · 서버 간 다름) | API(Express) | relay(87 · 67 캐시 · op 5 재조회) | 계좌 메뉴와 같은 판정(D-03)을 server 가 shared 함수로 만든다 |
| 예수금 쓰기(op 6) | API(Express — 새 값 계산 · fan-out) | relay(op 6 · 서버별 결과) | 「그 순간 값 + 증감」 은 Express 몫(재량 기본안) · relay 는 값 전달만 |
| 정산 확정 수익 · 몫 계산 | API(Express — 누른 순간 예수금 · D-16) | shared(순수 함수) | 확정 값의 정본은 server 가 계산해 DB 에 남긴 값 — 브라우저 값을 믿지 않는다 |
| 거래 · 정산 · 이력 · 마지막 읽은 값 저장 | Database(Supabase 표 + service_role RPC) | — | 「최근 정산만 취소」 · 동시 확정 거부 같은 불변식은 RPC 트랜잭션이 쥔다 |
| 사람별 몫 · 명의 대 몫 · 이체 누적 표시 계산 | Browser(shared 함수) | API(테스트 · 확정 계산에 같은 함수) | 같은 함수 한 벌(Phase 36 D-11 선례) |

## Standard Stack

이 phase 는 **새 패키지를 설치하지 않는다.** 모두 리포에 이미 있는 것이다.

### Core (기존)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@gh-radar/shared` | workspace | 계산 · 표기 · 타입 한 벌 | webapp · server 가 같은 함수를 읽는 프로젝트 규약 [VERIFIED: packages/shared/package.json] |
| Express 5 + zod | 기존 | `/api/admin/settlement*` 라우트 · 입력 검증 | 어드민 라우트 전부의 꼴(`admin-pnl.ts` · `admin-accounts.ts`) [VERIFIED: server/src/routes/admin-accounts.ts] |
| Supabase(Postgres 17 · supabase-js) | 기존 | 표 · RPC · pgTAP | service_role RPC 규약 [VERIFIED: supabase/migrations/20261106300000_dma_accounts_master.sql] |
| Next.js(App Router) + Tailwind v4 + radix-ui | 기존 | `/admin/settlement` 화면 | UI-SPEC 이 정함(새 shadcn 설치 0) [CITED: 44-UI-SPEC.md Registry Safety] |

### Supporting (기존 테스트 도구)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | shared `^4.1.4` · server · webapp 기존 | 계산 · 라우트 · 컴포넌트 | 전부 `--maxWorkers=2`(config 가 이미 기본 2) [VERIFIED: server/vitest.config.ts · webapp/vitest.config.ts] |
| supertest | 기존 | server 라우트 테스트 | `tests/routes/admin-accounts.test.ts` 꼴 |
| pgTAP(로컬 컨테이너) | `public.ecr.aws/supabase/postgres:17.6.1.104`(로컬에 있음) | 표 · RPC 불변식 | `scripts/verify-dma-orders-price-check.sh --test …` |
| Playwright | `@playwright/test ^1.59.1`(브라우저 chromium-1217 캐시 있음) | E2E | `--workers=1` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shared 상수(묶음 · 비율 · 사람 · 계좌 소속) | DB 표 | 화면에서 바꾸는 UI 가 범위 밖(Deferred) — 상수가 단순하고 webapp · server 가 같은 값을 읽는다. 단 **계좌번호 대응만은 DB**(계좌번호를 소스에 박지 않고 FK 로 `dma_accounts` 존재를 보장) |
| 예수금 반영을 relay 새 경로로 | 기존 `PUT …/budget` 안쪽 함수 재사용 | relay 변경 = relay 배포 필요. 재사용하면 relay 무변경(배포 단순) |
| 주기 작업으로 예수금 기록(D-04) | 화면 조회 · 확정 때만 기록 | 주기 작업은 Cloud Run Job · Scheduler 추가가 필요 — 어드민 전용 화면이라 조회 때 기록으로 충분(D-04 가 허용) |

**Installation:** 없음.

## Package Legitimacy Audit

이 phase 는 외부 패키지를 설치하지 않는다 — 감사 대상 없음.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[브라우저 /admin/settlement]
   │ ① GET /api/admin/settlement (첫 화면 · 정산 시트 열 때 다시)
   │ ② POST/PUT/DELETE …/ledger · …/ledger/:id/retry · …/settles · …/settles/:id/cancel
   ▼
[Express adminSettlementRouter]  ── requireAuth → requireAdmin(경로 /settlement 한정 · 역할 조회 1회)
   │
   ├─(병렬)─► Supabase RPC admin_settlement_raw()  → 계좌 4개 대응 · 연결 사용자 · 등록 서버(is_order) · 레지스트리
   │                                                  · 마지막 읽은 예수금 · 거래(지운 것 제외) · 정산(취소 제외)
   └─(병렬)─► relay GET /internal/admin/account-costs (2초 · op 5 재조회 ≤ 800ms · 실패 = null)
   │
   ▼
[shared settlementBudgetOf] 계좌마다: 연결 사용자 × active 서버 → accountCostOf → summarizeAccountCosts
   │   → known(값 · 출처 · 서버 간 다름) | unknown(못 읽음 → 마지막 읽은 값 · stale) | 0(미설정)
   ├─► known 값이 있으면 RPC settlement_record_reads(…) (D-04 · 2번째 왕복)
   ▼
[GET 응답] { accounts(예수금 · 읽은 시각 · stale · mismatch), ledger, settles, now }  → 화면은 shared 계산 함수로 그린다
   
쓰기(예수금 반영 켜짐):
  RPC 저장(거래 + pend = 계좌별 의도 증감) ─► 계좌마다: 지금 값 읽기 → 새 값 = 지금 + 증감
     ├─ 지금 값 모름(stale) · 새 값 < 1 ─► 보내지 않음 → pend 유지(reason)
     └─ fanoutOne(연결 사용자마다 relay setAccountBudget · op 6) ─► 전부 ok → 그 계좌 pend 지움
  ─► RPC settlement_set_pend(id, 남은 pend) ─► 응답(화면은 다시 불러옴)

정산 확정: 읽기(위와 같음 · 그 순간) → 수익 · 몫 계산 → RPC settlement_settle_confirm(직전 정산 id 대조 · 정산 + 바로 출금 줄 한 트랜잭션) → 바로 출금 줄 반영(위 쓰기 흐름)
```

### Recommended Project Structure
```
packages/shared/src/
├── settlement.ts              # 상수(사람 · 묶음 · 계좌 키) · 계산(R1 ~ R15) · 표기(formatEokMan*) · 장중 판정 · 예수금 선택
├── __tests__/settlement.test.ts   # 검산 픽스처(목업 숫자) · 4 : 3 : 3 끝전 · 표기 경계
└── index.ts                   # export * from "./settlement"  (확장자 없이)
server/src/
├── routes/admin-settlement.ts # 새 라우터(경로 /settlement 한정 관문 · app.ts 에서 adminRouter 앞)
├── services/settlement-budget.ts  # 예수금 읽기 · 반영(fanoutOne 재사용) — 라우트에서 분리
└── schemas/settlement.ts      # zod
server/tests/routes/admin-settlement.test.ts
supabase/migrations/2026112XXXXXXX_settlement.sql   # 표 5 · RPC 7 · 시드(9건)
supabase/tests/settlement.test.sql
webapp/src/app/admin/settlement/page.tsx
webapp/src/components/settlement/*.tsx  (UI-SPEC 표면 지도 그대로)
webapp/src/lib/admin-api.ts    # fetchSettlement · saveSettlementLedger … 추가
webapp/e2e/specs/admin-settlement.spec.ts · e2e/fixtures/settlement.ts
```

### 예수금 읽기 경로 — 정확한 입출력 (재사용 대상)

- relay 응답 모양 [VERIFIED: packages/shared/src/admin.ts:192-207]:
  ```ts
  export interface AdminAccountCostRow {
    dmaUserId: string;
    accountNo: string;
    budgetKrw: number;
    feePpm: number;
    sellTaxPpm: number;
    liveBudgetKrw: number | null;
  }
  export interface AdminAccountCostsRaw {
    servers: Record<string, AdminAccountCostRow[]>;
  }
  ```
  `servers` 에 키가 없는 서버 = 그 서버 87 을 모름(꺼짐 · 미수신). relay 는 켜진 서버 **전부**를 싣는다 — 교보 포함: account-costs 루프는 `if (!row.enabled) continue;` 뿐이고(relay/src/admin/admin-api.ts:1009), KB 만 거르는 것은 order-endpoints 쪽(`if (!row.enabled || row.broker !== "KB") continue;` · :932)이다 [VERIFIED: relay/src/admin/admin-api.ts:932 · 1009]. 응답 직전 서버마다 op 5 재조회(서버당 15초 1건 · 최대 800ms 대기 · 실패는 캐시)이고 67 live 는 그 서버 87 보다 늦게 받은 것만 싣는다(`freshLiveBudget` · :1023) [VERIFIED: relay/src/admin/admin-api.ts:198-209 · 994-1027].
- 한 서버 · 한 계좌 값 선택 [VERIFIED: packages/shared/src/admin.ts:851-858] — **`export` 가 없다(비공개)**:
  ```ts
  function accountCostOf(rows: AdminAccountCostRow[] | undefined, dmaUserId: string): AdminAccountCost | null {
    const r = rows?.find((x) => x.dmaUserId === dmaUserId) ?? rows?.[0];
    if (!r) return null;
    const fee = { feePpm: r.feePpm, sellTaxPpm: r.sellTaxPpm };
    return r.liveBudgetKrw !== null
      ? { budgetKrw: r.liveBudgetKrw, ...fee, budgetSource: "live" }
      : { budgetKrw: r.budgetKrw, ...fee, budgetSource: "snapshot" };
  }
  ```
  색인 `indexAccountCosts`(:835 · 비공개)는 키 = `normalizeAccountNo(r.accountNo)` 다.
- 계좌 하나의 표시값 · 출처 · 서버 간 다름 = `summarizeAccountCosts({ account, registry })`(exported · packages/shared/src/order-endpoint.ts:202). 입력에서 읽는 필드는 `account.servers[].state/serverKey` · `account.orderServer` · `account.defaultOrderServer` · `account.costs` 뿐이다 [VERIFIED: packages/shared/src/order-endpoint.ts:97-108 · 188-246] — 그래서 개요 전체(`deriveAdminUsersOverview`) 없이도 만들 수 있다.
- **계좌 메뉴가 실제로 보이는 값**은 위 판정을 「그 계좌를 쓰는 사용자마다」 적용해 DMA id 오름차순 첫 known 사용자의 출처 값을 고르는 webapp 함수 `summarizeLinkedCosts`(webapp/src/components/admin/account-linked-summary.ts:92-135)다 [VERIFIED: 그 파일 · account-master-sheet.tsx:445-447]. D-03 「계좌 메뉴와 같은 값」 을 server 에서 재현하려면 이 규칙(첫 known 사용자)까지 같아야 한다.
- server 쪽 읽기 함수: `relay.accountCosts(adminEmail)` — `timeoutMs: RELAY_ORDER_ENDPOINTS_TIMEOUT_MS`(2,000) · 실패는 throw 없이 `{ status: 0, data: null, netCode }` [VERIFIED: server/src/services/relay-admin-client.ts:66 · 489-492 · request 의 catch]. 모양 검사 · 실패 → null 을 하는 `fetchAccountCosts` · `isAccountCostRow` · `sanitizeAccountCosts` 는 `server/src/routes/admin.ts:286 · 301 · 327` 에 **비공개**로 있다.

**export / 추출해야 하는 것 (플래너 태스크 입력):**

| 무엇 | 지금 | 할 일 |
|---|---|---|
| `accountCostOf` · `indexAccountCosts` | shared/admin.ts 비공개 | `export`(이름 그대로) — 기존 `deriveAdminUsersOverview` 동작 불변 |
| `summarizeLinkedCosts` 의 「첫 known 사용자」 규칙 | webapp 파일 | shared 새 함수(`settlementBudgetOf` 가칭)로 같은 규칙 구현 + webapp 테스트에서 두 함수가 같은 입력에 같은 값을 내는지 대조(또는 webapp 함수를 shared 로 옮기고 webapp 은 import) |
| `fetchAccountCosts`(+ 두 보조) | server/routes/admin.ts 비공개 | `export`(또는 `services/` 로 옮김) — `/users` 개요 동작 불변 |
| `fanoutOne` · `fanoutAudit` · `activeLinkUsers` | server/routes/admin-accounts.ts 비공개 | `export`(또는 `services/account-fanout.ts` 로 옮김). 정산 쓰기는 `activeLinkUsers` 대신 RPC 가 준 링크를 쓴다(왕복 절약 — 아래) |
| `DbError` · `audit` · `parseOrThrow` · `relayResults` · `relayFailed` · `requireRelayAdmin` | server/routes/admin.ts | 이미 export [VERIFIED: server/src/routes/admin.ts:103 · 120 · 156 · 166 · 172 · 182] |

### 예수금 쓰기 경로 — fan-out 응답 · 부분 실패 표현

- 응답 모양 [VERIFIED: packages/shared/src/admin.ts:505-518]:
  ```ts
  export interface AdminAccountFanout {
    dmaUserId: string;
    results: AdminServerResult[];
    error: { code: string; message: string } | null;
  }
  export interface AdminAccountSaveResponse {
    ok: true;
    fanout: AdminAccountFanout[];
  }
  ```
  서버 1대 결과 outcome [VERIFIED: packages/shared/src/admin.ts:126]: `export type AdminOutcome = "ok" | "failed" | "timeout" | "offline" | "skipped";`
- `fanoutOne(relay, dmaUserId, op, call)` 은 relay 거부(409) · 실패(502) · 클라이언트 없음을 그 항목 `error` 로 접고 throw 하지 않는다 [VERIFIED: server/src/routes/admin-accounts.ts:123-146]. op 6 은 code 0 만 ok(「변경 없음」 포함) [VERIFIED: packages/shared/src/admin.ts:644-657].
- 계좌 하나의 「반영됨」 판정(권장 · UI-SPEC researcher decision 18 「한 대라도 실패면 미반영」 과 일치): 그 계좌 fan-out 전 항목이 `error === null` 이고 모든 `results[].outcome === "ok"`. `results` 가 빈 배열(등록 서버 0)이면 미반영으로 본다.
- 기존 라우트 상한: relay 쓰기 기본 15초(`RELAY_ADMIN_TIMEOUT_MS`) · 브라우저 `RELAY_TIMEOUT_MS = 20_000` [VERIFIED: webapp/src/lib/admin-api.ts:59 · relay-admin-client.ts createRelayAdminClient 주석].

### 데이터 모델 (권장 — 이름은 예시 · Claude 재량)

| 표 | 핵심 열 | 비고 |
|---|---|---|
| `settlement_accounts` | `acc_key text PK CHECK (acc_key IN ('kbG','kyH','kyG','kbH'))` · `broker` · `account_no` · FK `(broker, account_no) → dma_accounts ON DELETE RESTRICT` | 계좌번호 대응만 DB. 라벨 · 명의 · 묶음은 shared 상수(R0) |
| `settlement_budget_reads` | `acc_key PK FK` · `budget_krw bigint` · `source text CHECK IN ('live','snapshot')` · `server_key text` · `read_at timestamptz` | D-04 마지막으로 읽은 값. 0 도 그대로 저장(「미설정」 을 기억) |
| `settlement_ledger` | `id` · `tx_date date` · `kind`(4종 코드) · `who`(H/G/J · 계좌 옮김은 null) · `from_acc` · `to_acc` · `via`(계좌 옮김만 · 계좌이체/법인 용역) · `amount_krw bigint CHECK (amount_krw > 0)` · `memo`(≤ 100) · `settle_id` FK null · `reflect boolean` · `pend jsonb DEFAULT '{}'` · `seeded boolean` · `created_by/at` · `edited_by/at` · `deleted_at/by/reason` | 종류별 모양 CHECK(출자 = who + to_acc · 수익 출금/원금 회수 = who + from_acc · 계좌 옮김 = from_acc ≠ to_acc + via). 지운 줄은 `deleted_at` 으로 남김(D-21) |
| `settlement_ledger_history` | `id` · `ledger_id` · `action('edit','delete','settle_cancel')` · `before jsonb` · `by` · `at` | 고치기 전 값(D-21) |
| `settlement_settles` | `id` · `pool('p1','p2')` · `profit_krw bigint`(= 몫 합 · R6) · `shares jsonb`({H:…, G:…} 원) · `snapshot jsonb`(계좌별 예수금 · 넣은 돈 · 들어온/나간 돈 · 수익 · stale · 읽은 시각) · `cum_krw` · `prev_krw` · `read_at` · `memo` · `created_by/at` · `cancelled_at/by` | 몫을 그때 값으로 저장(D-01 Reversibility costly — 규칙이 바뀌어도 지난 정산 불변) |

모든 표: `ENABLE ROW LEVEL SECURITY` · 정책 없음 · `REVOKE ALL … FROM PUBLIC` · `FROM anon, authenticated` · `GRANT … TO service_role` [VERIFIED: supabase/migrations/20261106300000_dma_accounts_master.sql:62-65 — 원문 아래 Code Examples].

**RPC (권장 — 오류는 기존 규약 `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>'` [VERIFIED: 20261106300000_dma_accounts_master.sql:21 · 176 · 204]):**

| RPC | 하는 일 | 오류 코드(제안) |
|---|---|---|
| `admin_settlement_raw()` → jsonb | 계좌 4개(acc_key · broker · accountNo · name · links[{dmaUserId, servers[{serverKey, state, isOrder}]}] — **links 는 `dma_user_id` 오름차순**(「첫 known 사용자」 규칙이 `summarizeLinkedCosts` · `admin_accounts_raw` 의 `ORDER BY l.dma_user_id` 와 같은 순서를 전제) · servers 는 `sort_order, server_key` 순) · registry(dma_servers key · broker · enabled · isOrderServer · sort_order 순) · reads · ledger(지운 것 제외 · 생성 순) · settles(취소 제외 · 최신 먼저) | — |
| `settlement_record_reads(p_reads jsonb)` | 읽은 값 upsert | — |
| `settlement_ledger_save(p_id bigint, p_row jsonb, p_by text, p_reflect boolean, p_pend jsonb)` | 새로 쓰기 / 고치기(고치기는 history 에 before) — 바로 출금 줄 고치기 거부 · 미래 날짜 거부 | `NO_SUCH_ROW` · `SETTLE_LINKED` · `FUTURE_DATE` |
| `settlement_ledger_delete(p_id, p_by)` | 지움 표시 + history · 지운 줄의 반영 증감 반환 | `NO_SUCH_ROW` · `SETTLE_LINKED` |
| `settlement_set_pend(p_id, p_pend jsonb)` | 반영 결과 기록 | `NO_SUCH_ROW` |
| `settlement_settle_confirm(p_pool, p_expect_prev bigint, p_row jsonb, p_outs jsonb, p_by)` | 묶음 행 잠금(advisory lock 또는 `FOR UPDATE`) → 그 묶음 최신 정산 id 가 `p_expect_prev` 와 다르면 거부 → 정산 + 바로 출금 줄 한 트랜잭션 | `STALE_SETTLE` |
| `settlement_settle_cancel(p_id, p_by)` | 그 묶음 최신(취소 안 된) 정산인지 검사 → 취소 표시 + 바로 출금 줄 지움 표시(reason `settle_cancel`) · 그 줄들의 반영 증감 반환 | `NOT_LATEST` · `NO_SUCH_ROW` |

미래 날짜 판정은 RPC 안에서 `(now() AT TIME ZONE 'Asia/Seoul')::date` 와 비교(서버 · DB 둘 다 막음).

### Pattern 1: 조회 — RPC 1회 + relay 병렬, 읽은 값 기록 1회
**What:** `Promise.all([supabase.rpc("admin_settlement_raw"), fetchAccountCosts(req)])` → shared `settlementBudgetOf` 로 계좌마다 값 → known 이면 `settlement_record_reads` (2번째 DB 왕복) → 응답.
**When:** 첫 화면 · 정산 시트 열 때(UI-SPEC 15) · 모든 쓰기 직후 다시 불러올 때.
**규칙:** 계좌 값 = known(relay) → 그 값 · `stale:false` · `readAt: now` / unknown → 마지막 읽은 값 · `stale:true` · 그 `read_at` / 둘 다 없음 → 「미설정」 과 같은 표시(UI-SPEC 19). 예수금 0 = 미설정(`null` 로 계산 · D-25).
**왕복:** 역할 조회 1 + RPC 1 + (relay ∥) + 기록 RPC 1. 기록은 값이 마지막 기록과 같고 60초 안이면 건너뛰어도 된다(선택).

### Pattern 2: 예수금 반영(거래 저장 · 고치기 · 지우기 · 정산 취소 · 다시 반영 공용)
**What:** 원하는 증감 맵 `want` 과 지금 들어가 있는 증감 `cur`(`applied(old)`)의 `diff` → 계좌마다:
1. 지금 값 읽기(Pattern 1 의 읽기 — 같은 요청 안에서 한 번).
2. 지금 값 모름(stale) → 보내지 않음 · `pend[acc] = { deltaKrw, reason: "unreachable" }`.
3. `target = 지금 + delta`. `target < 1` → 보내지 않음 · `pend[acc] = { deltaKrw, reason: "below_one" }`(Pitfall 1).
4. RPC 가 준 그 계좌 링크의 active 서버가 있는 사용자마다 `fanoutOne(relay, dma, "settlement-budget", r => r.setAccountBudget(dma, broker, accountNo, { budgetKrw: target }, req.adminEmail!))`.
5. 전 항목 ok → 그 계좌 pend 없음. 아니면 `pend[acc] = { deltaKrw, targetKrw: target, reason: "failed" | "timeout" }`.
**순서:** DB 저장(의도 pend = 전 증감) → 반영 → `settlement_set_pend`(남은 것만). 저장이 실패하면 relay 를 부르지 않는다.
**다시 반영:** 저장된 pend 계좌만. 지금 값을 다시 읽어 `지금 === targetKrw` 면 보내지 않고 반영됨으로(앞 시도가 실제로는 들어갔던 경우 — Pitfall 2). 아니면 `지금 + deltaKrw` 로 2 ~ 5.
**두 계좌(계좌 옮김):** 두 계좌를 **병렬**로 보내거나(권장), 차례로 보낼 거면 정산 쓰기 경로의 브라우저 상한을 40초로 따로 둔다(Pitfall 3).

### Pattern 3: 정산 확정 — 서버가 그 순간 계산
**What:** 브라우저는 `{ pool, outs: ["H"], memo, reflect, expectPrev }` 만 보낸다. Express 가 그 순간 예수금을 읽고(못 읽으면 마지막 값 · stale) shared 함수로 `openProfit` · `dist` · 몫 · `payAcc` · 바로 출금 금액(R15)을 계산 → `can = poolOk && dist > 0` 아니면 409 → RPC `settlement_settle_confirm`(스냅샷 = 반영 **전** 값 · 목업 `settle-ok` 주석 「예수금을 고치기 전 값으로 남긴다」) → 바로 출금 줄 반영(Pattern 2).
**When:** 「정산 확정」.

### Anti-Patterns to Avoid
- **브라우저가 계산한 수익을 확정 값으로 저장:** D-16 은 「누른 순간」 — 화면 값은 몇 초 ~ 몇 분 묵었을 수 있다. 서버가 계산한다.
- **계좌 메뉴와 다른 예수금 고르기 규칙:** 「주문 서버 값」 을 직접 고르는 새 코드를 쓰면 계좌 메뉴(`summarizeLinkedCosts`)와 갈린다(D-03 위반). shared 판정을 재사용한다.
- **관문을 라우터 전체에 걸기:** `adminSettlementRouter.use(requireAuth(), requireAdmin())` 처럼 경로 없이 걸면 adminRouter 앞에 마운트될 때 다른 어드민 요청도 역할 조회를 한 번 더 한다 — `adminSettlementRouter.use("/settlement", …)` [VERIFIED: server/src/routes/admin-accounts.ts:51-57 주석].
- **`activeLinkUsers` 를 계좌마다 부르기:** 그 함수는 호출마다 `admin_accounts_raw` RPC 1회다 — 계좌 옮김이면 2회 + 읽기 RPC. 정산 RPC 가 준 링크를 쓴다.
- **목업 `Math.round` 그대로 옮기기:** 4 : 3 : 3 에서 몫 합이 수익을 넘을 수 있다(R6 · 픽스처).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 계좌 예수금 현재값 선택 | 새 「주문 서버 값」 고르기 | `accountCostOf` + `summarizeAccountCosts` + 「첫 known 사용자」 규칙(export · 추출) | 67 live 우선 · 87 시각 비교 · 유효 주문 서버 · 서버 간 다름을 이미 처리 — D-03 「계좌 메뉴와 같은 값」 |
| op 6 보내기 · 결과 접기 | 새 relay 호출 · 오류 매핑 | `fanoutOne` + `relay.setAccountBudget` | 409/502/클라이언트 없음 접기 · 감사 형식이 이미 있다 |
| relay 읽기 실패 처리 | try/catch 새로 | `fetchAccountCosts`(export) | 모양 위반 서버 · 행만 버리고 로그엔 status 만 |
| 계좌번호 정규화 | 문자열 trim | `normalizeAccountNo` | gh-trade 와 같은 규칙 |
| KST 날짜 | `new Date().toISOString().slice(0,10)` | `kstDateIso()`(shared krxCalendar.ts:53) | UTC 날짜는 00:00 ~ 09:00 KST 에 하루 틀린다 · `getKstDate` 는 쓰지 말라고 그 파일이 적어 둠 |
| 감사 로그 | `console.log` | `audit(req, op, target, extra)` | 어드민 쓰기 규약(이메일 · 작업 · 대상만) |
| 시트 · 세그먼트 · 칩 모양 | 새 컴포넌트 | `AdminSheet` · `AdminPanelPage` · `ADMIN_SEGMENT_*` · `ADMIN_CHIP_BASE` · `ADMIN_TONE_CLASS` | UI-SPEC 인벤토리 |

**Key insight:** 이 phase 의 위험은 UI 가 아니라 「절댓값만 쓸 수 있는 명령으로 증감을 흉내 내는 것」 이다 — 읽기와 쓰기 사이의 모든 틈(체결 · 타임아웃 · 0 = 해제 · 재시도)이 돈 숫자를 바꾼다. 읽기 · 쓰기 부품은 검증된 것을 재사용하고, 새 코드는 「증감 → 목표값」 계산과 그 기록에만 쓴다.

## 계산 규칙 — 목업 → shared 이식 목록

목업은 **만원** 단위 · shared 는 **원** 단위(D-09). 거래 금액은 만원 입력 × 10,000 이라 늘 10,000 의 배수다(바로 출금도 만원 미만 버림 · R15) — 그래서 `caps` 의 `/ 2` 는 원 단위에서 정확하다.

- **R0 상수(shared):** 사람 `H` 김현중 · `G` 정근형 · `J` 심쥬니. 계좌 키 `kbG`(KB 정근형 · 명의 G · p1) · `kyH`(교보 김현중 · H · p1) · `kyG`(교보 정근형 · G · p1) · `kbH`(KB 김현중 · H · p2). 묶음 `p1` 「현중 · 근형」 ratio {H 50, G 50} · `p2` 「쥬니」 ratio {J 40, H 30, G 30} · baseKrw 400,000,000 · guard `J` [VERIFIED: a-real.html:209-222 — 목업 값은 만원 `base: 40000`].
- **R1 넣은 돈:** `put(acc) = Σ amount(to = acc) − Σ amount(from = acc)` (지운 줄 제외). 들어온 돈 = 출자 · 옮겨 온 돈, 나간 돈 = 수익 출금 · 원금 회수 · 옮겨 간 돈 [VERIFIED: a-real.html:256-259].
- **R2 계좌 수익:** 예수금이 `null`(미설정 0 · 한 번도 못 읽음)이면 `null`, 아니면 `예수금 − put`.
- **R3 묶음:** `poolOk = 묶음 계좌 전부 예수금 ≠ null` · `cumProfit = Σ(예수금 − put)` · `settledSum = Σ 취소 안 된 정산 profit_krw` · `openProfit = cum − settledSum` · `dist = base 있으면 max(0, open) 아니면 open` [VERIFIED: a-real.html:261-267].
- **R6 몫(이식 때 바뀜):** 목업은 `Math.round(profit × ratio / 100)`(a-real.html:251). shared 는 **`Math.trunc(profit × ratio / 100)`**(CONTEXT 재량 「원 미만 버림」 · 음수 표시 몫은 0 쪽으로). 정산 확정 때 `shares[p] = trunc(dist × ratio / 100)` · **`profit_krw = Σ shares`** — 남는 1 ~ 2원은 `openProfit` 에 남는다(D-09). 정수 범위: 10억 × 50 = 5e10 < 2^53.
- **R7 원금(caps):** 출자 → `caps[pool(to)][who] += amt` · 원금 회수 → `caps[pool(from)][who] −= amt` · 계좌 옮김이 묶음을 넘으면 H · G 각각 `−amt/2`(보낸 묶음) · `+amt/2`(받은 묶음). 초기값 `{ p1: {H 0, G 0}, p2: {H 0, G 0, J 0} }` [VERIFIED: a-real.html:274-285]. **목업 결함:** 심쥬니가 p1 계좌에 출자 · 원금 회수하면 `c.p1.J` 가 없어 `NaN` — 이식 때 막아야 한다(Open Questions 4).
- **R8 사람(person):** `settled = Σ 취소 안 된 정산의 shares[p]`(저장 값 — 목업은 다시 계산) · `taken = Σ 수익 출금(who = p)` · `due = settled − taken` · 몫이 있는 묶음마다 `open[pool] = poolOk ? share(dist) : null(unk)` · `cap` = caps 에 그 사람이 있는 묶음 · `loss` = guard 가 있는 묶음(poolOk)마다 `L = max(0, −openProfit)`, `own = min(L, caps[pool][guard])`, guard 는 `own`, 나머지는 `trunc((L − own) / (멤버 수 − 1))` · `total = due + openSum` · `stake = capSum + due + openSum − loss` [VERIFIED: a-real.html:286-304]. 화면 「—」 조건은 `unk`.
- **R9 이체(hgOf · hgSum):** 출자 = 넣은 사람 → 받은 계좌 명의 · 계좌 옮김 = 보낸 계좌 명의 → 받은 계좌 명의 · 수익 출금/원금 회수 = 뺀 계좌 명의 → 받는 사람. 같은 사람이거나 J 가 끼면 제외. via(법인 용역)는 따로 합계 [VERIFIED: a-real.html:306-322].
- **R10 명의 대 몫(nameVs):** `bal[명의]` = 명의 계좌 예수금 합(null 이면 unkB) · `x = G.stake − bal.G`(> 0 이면 김현중 → 정근형 x) · `unk = unkB.H ∨ unkB.G ∨ H.unk ∨ G.unk` [VERIFIED: a-real.html:323-328].
- **R11 뺄 계좌(payAcc):** 묶음 계좌를 예수금 내림차순(null → 0) 정렬 → 본인 명의 첫 계좌, 없으면 첫 계좌 [VERIFIED: a-real.html:330-333].
- **R12 ~ R14 반영 증감:** `eff`(출자 {to +} · 계좌 옮김 {from −, to +} · 그 밖 {from −}) · `applied`(reflect 일 때 `eff − pend`) · `diff`(0 아닌 차이만) [VERIFIED: a-real.html:336-355]. 원 단위 이식에서 `pend[acc]` 는 숫자 대신 `{ deltaKrw, targetKrw?, reason }` — `applied` 는 `deltaKrw` 를 뺀다.
- **R15 바로 출금 금액:** `floor(share / 10,000) × 10,000`(D-09 · 목업 `outRows` 의 `Math.floor` 를 만원 경계로).
- **R16 장중:** 평일 `08:00` ~ `20:00` KST — **새 함수 필요.** 기존 `isKoreanMarketOpen` 은 `08:00` ~ `15:30` 이다(`return timeInMinutes >= 480 && timeInMinutes <= 930;` [VERIFIED: packages/shared/src/marketHours.ts:17-18]).

### 검산 픽스처 — 목업 JS 를 node 로 그대로 돌린 결과 (이 세션 실행)

`a-real.html` `<script>` 의 계산 부분을 떼어 node v24 로 실행했다(만원 단위 원문 출력 → 원 = × 10,000).

| 항목 | 목업 출력(만원) | CONTEXT 검산 기준 | 일치 |
|---|---|---|---|
| KB 정근형 예수금 · 넣은 돈(들어온/나간) · 수익 | 84500 · −22000(80000 / 102000) · +106500 | 8억 4,500만 · −2억 2,000만 · +10억 6,500만 | ✓ |
| 교보 김현중 | 68400 · 70000 · −1600 | −1,600만 | ✓ |
| 교보 정근형 | 2000 · 2000 · 0 | 0 | ✓ |
| KB 김현중 | 37200 · 40000 · −2800 | −2,800만 | ✓ |
| 묶음 누적 · dist | p1 104900 · dist 104900 / p2 −2800 · dist 0 | +10억 4,900만 / −2,800만 | ✓ |
| caps | p1 {H 25000, G 25000} · p2 {H 15000, G 15000, J 10000} | 현중 · 근형 각 2.5억 + 1.5억 · 쥬니 1억 | ✓ |
| person H / G | openSum 52450 · capSum 40000 · stake 92450 | 지금 몫 전체 9억 2,450만 | ✓ |
| person J | loss 2800 · stake 7200 | 7,200만 | ✓ |
| nameVs | bal H 105600 · G 86500 · x 5950 | 김현중 → 정근형 5,950만 | ✓ |
| hgSum | HG 40000(1건) · GH 70000(4건) · via 30000(1건) | 4억 · 7억 · 3억 별도 | ✓ |
| payAcc | p1 H → kyH · p1 G → kbG · p2 J → kbH | — | — |
| 「교보 정근형 미설정」 | H · G unk = true · J unk = false · nameVs unk = true | D-25 | ✓ |
| p1 정산 + 김현중 바로 출금 | H due 0 · stake 40000 / G due 52450 · stake 92450 / open p1 0 · nameVs x 5950 | — | 회귀 픽스처로 |

**목업이 못 잡는 경우 — 플래너가 픽스처로 추가:** p2 정산 전 수익 `100,000,005`원(4 : 3 : 3) → trunc 몫 J 40,000,002 · H 30,000,001 · G 30,000,001 = 100,000,004(1원 남음). 목업 `Math.round` 면 30,000,002 × 2 → 합 100,000,006 으로 수익을 넘는다. 5 : 5 짝수 금액 픽스처로는 이 차이가 안 보인다.

### 표기 함수 — 기존 shared 와 목업 비교

| 입력(원) | 목업 `won` / `fm` / `sg`(만원 입력 환산) | `formatEok` | `formatManwonFloor` | 결론 |
|---|---|---|---|---|
| 924,500,000 | 「9억 2,450만」 | 「9.2억」 | 「92,450만」 | 다름 |
| −220,000,000 | `fm` 「−2억 2,000만」 | 「-2.-2억」(음수용이 아님 — 같은 식을 node 로 실행한 결과) | 「0만」(음수 0 처리) | 다름 |
| 0 | `fm` · `sg` 「0」 · `won` 「0만」 | 「0」 | 「0만」 | 부분만 |
| 400,000,000 | 「4억」 | 「4.0억」 | 「40,000만」 | 다름 |

`formatEok` = 「원 → 「17.3억」 … 억 미만도 소수 한 자리 억」 [VERIFIED: packages/shared/src/limit-feature.ts:54-62] · `formatManwonFloor` = 「원 → 「N만」(만원 내림 · ko-KR 콤마 · 억 표기 없음). 음수는 0 으로 본다」 [VERIFIED: packages/shared/src/account-budget.ts:58-64]. **둘 다 목업과 다르다 → UI-SPEC 「숫자 · 날짜 표기 계약」 의 새 3개(`formatEokMan` · `formatEokManMinus` · `formatEokManSigned`)를 만든다.** 목업 node 출력: `won(92450)` 「9억 2,450만」 · `fm(-22000)` 「−2억 2,000만」 · `sg(106500)` 「+10억 6,500만」 · `sg(-2800)` 「−2,800만」 · `fm(0)` 「0」 · `sg(0)` 「0」 · `won(5950)` 「5,950만」 · `won(40000)` 「4억」 · `won(0)` 「0만」. 음수 부호는 U+2212(webapp `MINUS` · `launch-format.ts:37`). 경계 픽스처: 9,999원 → `won` 「0만」 · `fm` 「0」 · `sg` 「0」(만 미만 버림 뒤 0 이면 부호 · 색 없음 — UI-SPEC) · 100,000,000 → 「1억」 · 99,990,000 → 「9,999만」 · 1,000,010,000 → 「10억 1만」.

## Common Pitfalls

### Pitfall 1: 새 예수금이 0 이하 → op 6 의 0 = 「해제」
**What goes wrong:** 큰 수익 출금 · 묵은 값에 증감 → 0 이하. op 6 은 `budgetKrw` 0..MAX_SAFE_INTEGER 만 받고 0 은 「해제」 다(relay `BudgetBody` · 인박스 261027-account-budget). 해제되면 서버는 그 계좌 체결 조정을 멈추고 정산 화면은 「미설정」 으로 뒤집힌다(D-25).
**Why:** gh-trade 도 체결 조정에서 0 이하를 1원으로 막는다(account-budget.md ⑦) — 0 은 의미가 따로 있다.
**How to avoid:** `target < 1` 이면 보내지 않고 pend(reason `below_one`) · 미리 보기에도 같은 판정을 보인다(문구는 UI-SPEC 밖 — Open Questions 5).
**Warning signs:** 반영 뒤 계좌 메뉴 예수금 「미설정」.

### Pitfall 2: relay `timeout` 은 실패가 아니라 「모름」
**What goes wrong:** relay 요청 마감(10초)에 접힌 `timeout` 결과도 뒤에서 op 가 끝나 실제로 반영되는 일이 있다(dispatcher.ts 머리 주석). 그걸 실패로 보고 「다시 반영」 에서 `지금 + delta` 를 보내면 두 번 더해진다. Express 가 반영 뒤 `set_pend` 전에 죽어도 같은 모양이다.
**How to avoid:** pend 에 `targetKrw` 를 함께 남기고, 다시 반영 때 `지금 값 === targetKrw` 면 보내지 않고 반영됨으로 정리(Pattern 2).
**한계:** 그 사이 체결로 값이 움직였으면 이 대조가 빗나간다 — D-13 이 감수한 오차와 같은 종류. 미리 보기에 「지금 → 새 값」 을 보여 어드민이 계좌 메뉴와 맞춰 볼 수 있게 한다.

### Pitfall 3: 계좌 옮김 두 계좌를 차례로 보내면 브라우저 상한 초과
**What goes wrong:** 계좌 하나 반영 = relay 쓰기 상한 15초(최악) · 두 계좌 차례 + 읽기 2초 + DB → 30초 이상 > webapp `RELAY_TIMEOUT_MS` 20초. 브라우저는 「실패」 를 보이는데 server 는 계속 반영한다.
**How to avoid:** 두 계좌 병렬(같은 DMA 사용자면 relay 가 어차피 줄 세움 — 정상 응답은 ms) + 정산 쓰기 경로 브라우저 상한 40초(`SETTLEMENT_WRITE_TIMEOUT_MS` 가칭). 상한에 걸리면 화면은 다시 불러와 DB 상태를 보인다.

### Pitfall 4: 읽은 값이 최대 15초 묵음
**What goes wrong:** account-costs 의 op 5 재조회는 서버당 15초 1건 · 800ms 만 기다린다. 웹 세션이 없는 계좌는 67 live 가 없어 87 값인데, 체결 조정은 87 을 올리지 않는다(인박스 D-29) — 직전 15초 안의 체결은 빠질 수 있다.
**How to avoid:** D-13 감수 범위. 장중 줄(「체결과 겹치면 …」 · 「체결 중이라 값이 움직이고 있어요」)이 이 위험을 말한다. 추가 조치 없음.

### Pitfall 5: 동시 확정 · 동시 취소
**What goes wrong:** 두 탭이 같은 묶음을 동시에 확정하면 둘 다 같은 정산 전 수익으로 기록 → 수익 두 번 정산.
**How to avoid:** `settlement_settle_confirm` 이 묶음 단위로 잠그고 `p_expect_prev`(브라우저가 본 그 묶음 최신 정산 id · 없으면 null)와 실제가 다르면 `STALE_SETTLE` → 409. 취소는 RPC 안에서 「최신인가」 를 다시 본다(`NOT_LATEST`).

### Pitfall 6: 장중 판정에 기존 함수 재사용
**What goes wrong:** `isKoreanMarketOpen` 은 `08:00` ~ `15:30` — 15:30 뒤 NXT 체결 시간에 경고가 사라진다.
**How to avoid:** shared 새 함수(평일 · KST · `480 <= 분 < 1200`). KST 는 `+9h → getUTC*` 방식(krxCalendar.ts 의 이유 주석).

### Pitfall 7: 시드 9건의 계좌 대응을 추측
**What goes wrong:** 마이그레이션이 계좌번호를 모른 채 이름으로 찾거나 상수에 박으면, 틀린 계좌에 넣은 돈이 쌓여 첫 화면 수익이 전부 틀린다.
**How to avoid:** 계좌번호 4개를 사용자 · 메인 세션 확인값으로 받아 시드에 넣고, 마이그레이션 안에서 `dma_accounts` 에 없으면 `RAISE` 해 `db push` 가 통째로 실패하게(Open Questions 2).

### Pitfall 9: shared 를 고친 뒤 빌드하지 않고 server · webapp 테스트
**What goes wrong:** `@gh-radar/shared` 는 `main` · `module` · `exports` 가 전부 `./dist/*` 를 가리키고, server · webapp 에 shared `src` 로 가는 경로 별칭이 없다(webapp `paths` 는 `@/*` 만 · `transpilePackages` 는 dist 를 옮길 뿐). 새 export(`accountCostOf` · `settlement.ts`)를 넣고 바로 server · webapp vitest · typecheck 를 돌리면 「has no exported member」 로 실패한다 [VERIFIED: packages/shared/package.json · webapp/tsconfig.json:11-15 · webapp/next.config.ts:13].
**How to avoid:** shared 를 고친 태스크는 다른 패키지 검증 전에 `pnpm --filter @gh-radar/shared build`.

### Pitfall 8: 반영 결과의 「빈 fan-out」
**What goes wrong:** 그 계좌에 active 등록 서버가 있는 사용자가 0명이면 fan-out 이 빈 배열이고, 「전부 ok」 판정이 참이 된다(빈 배열 `every`).
**How to avoid:** 대상 0 이면 미반영(reason `no_server`).

## Code Examples

### 새 표 권한 줄 (원문)
```sql
-- Source: supabase/migrations/20261106300000_dma_accounts_master.sql:62-65
ALTER TABLE public.dma_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_accounts FROM PUBLIC;
REVOKE ALL ON public.dma_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_accounts TO service_role;
```
RPC 는 같은 파일의 꼴: `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC;` · `… FROM anon, authenticated;` · `GRANT EXECUTE … TO service_role;` + `SECURITY DEFINER` · `SET search_path = public, pg_temp`.

### 경로 한정 관문 + 마운트 자리
```ts
// Source: server/src/routes/admin-accounts.ts:55-57 (꼴)
export const adminSettlementRouter: RouterT = Router();
adminSettlementRouter.use("/settlement", requireAuth(), requireAdmin());
// server/src/app.ts:163-167 — adminPnlRouter · adminAccountsRouter 와 같이 adminRouter(:167) **앞**에
app.use("/api/admin", adminSettlementRouter);
```

### 반영 한 계좌 (권장 골격 · 의사 코드)
```ts
// fanoutOne 은 admin-accounts.ts:123 에서 export 해 재사용
async function reflectOne(req, acc: SettlementAccountRaw, deltaKrw: number, now: BudgetNow): Promise<PendEntry | null> {
  if (now.stale || now.budgetKrw === null) return { deltaKrw, reason: "unreachable" };
  const targetKrw = now.budgetKrw + deltaKrw;
  if (targetKrw < 1) return { deltaKrw, reason: "below_one" };
  const users = acc.links.filter((l) => l.servers.some((s) => s.state === "active")).map((l) => l.dmaUserId);
  if (users.length === 0) return { deltaKrw, reason: "no_server" };
  const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
  const fanout = await Promise.all(users.map((dma) =>
    fanoutOne(relay, dma, "settlement-budget", (r) =>
      r.setAccountBudget(dma, acc.broker, acc.accountNo, { budgetKrw: targetKrw }, req.adminEmail!))));
  const ok = fanout.every((f) => f.error === null && f.results.length > 0 && f.results.every((x) => x.outcome === "ok"));
  return ok ? null : { deltaKrw, targetKrw, reason: fanout.some((f) => f.results.some((x) => x.outcome === "timeout")) ? "timeout" : "failed" };
}
```
(`PendEntry` · `BudgetNow` · reason 값은 이 문서의 제안 이름 — 코드에 아직 없다.)

### 시드 9건 (만원 → 원 · 목업 LEDGER 원문 [VERIFIED: a-real.html:229-239])
| 날짜 | 종류 | 흐름 | 금액(원) | 메모 · 경로 |
|---|---|---|---|---|
| 2025-12-31 | 출자 | H → kbG | 400,000,000 | |
| 2025-12-31 | 출자 | G → kbG | 400,000,000 | |
| 2026-08-10 | 계좌 옮김 | kbG → kyH | 300,000,000 | 법인 용역 |
| 2026-09-10 | 출자 | J → kbH | 100,000,000 | |
| 2026-09-10 | 계좌 옮김 | kbG → kbH | 100,000,000 | 계좌이체 · 메모 「쥬니 묶음 원금」 |
| 2026-09-13 | 계좌 옮김 | kbG → kbH | 100,000,000 | 계좌이체 · 「쥬니 묶음 원금」 |
| 2026-09-13 | 계좌 옮김 | kbG → kyH | 400,000,000 | 계좌이체 |
| 2026-09-18 | 계좌 옮김 | kbG → kbH | 100,000,000 | 계좌이체 · 「쥬니 묶음 원금」 |
| 2026-11-01 | 계좌 옮김 | kbG → kyG | 20,000,000 | 계좌이체 |

`reflect = false` · `pend = '{}'` · `seeded = true` · `created_by = NULL`(화면 「배포 때 미리 넣은 내역」). 멱등: 시드는 `settlement_ledger` 에 `seeded` 행이 0 일 때만 넣는다. 같은 날짜의 줄 순서(「같은 날은 나중에 적은 줄이 위」)는 `id` 순으로 정해지므로 위 순서대로 넣는다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 수익 = 실현손익 합 + 10/27 역산 시작값(로드맵 규칙 2 원안) | 수익 = 예수금 − 넣은 돈 | 2026-11-19(D-01) | `dma_journal_events` · `/admin/pnl` 을 정산에 쓰지 않는다 |
| 목업 2차 `OPEN` · `accBal` | 3차 `dep` · `put` · `cumProfit` · `openProfit` | 2026-11-19 | 이식 대상은 3차 함수(2차는 git `d8739157`) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 계좌 4개가 지금 각각 active 등록 서버 1대(KB120 또는 KYOBO119)뿐이다(Phase 36 기록 「현재 KB 120 · 교보 119 각각 단독」 의 연장) | Pattern 2 · Open Questions 3 | 서버가 둘 이상이면 「일부 서버만 성공」 의 다시 반영이 두 번 더할 수 있다 |
| A2 | 「교보 정근형」(11-01 개설) 계좌가 `dma_accounts` 에 등록돼 있다 | Pitfall 7 · 데이터 모델 FK | 없으면 시드 마이그레이션이 실패(설계상 의도된 실패) — 배포 전 등록 필요 |
| A3 | 표 · RPC · 상태 코드 이름(`settlement_*` · `STALE_SETTLE` · `NOT_LATEST` · reason 값)은 이 문서의 제안이다 | 데이터 모델 · Code Examples | 없음(재량) — 플래너가 바꿔도 된다 |
| A4 | 정산 확정 · 반영 동시성은 어드민 몇 명 수준이라 RPC 잠금 + 기대값 대조로 충분하다 | Pitfall 5 | 낮음 |
| A5 | 계좌번호를 마이그레이션 SQL 에 넣는 것은 허용된다(리포의 기존 목업 · 문서에 실제 계좌번호가 이미 있음) | Open Questions 2 | 사용자가 꺼리면 배포 날 수동 SQL 로 대체 |
| A6 | 「맞출 값 = D+2 예수금 + 보유 종목 매입금액」 의 「D+2 예수금」 이름표는 증권사 정산 관례에서 온 추론이다 — 「현금 + 보유 매입금액이 예수금(`budget_krw`)과 같은 축」 이라는 계산은 gh-trade 문서로 확인했지만, 어느 증권사 화면 칸을 읽으라는 말은 문서에 없다 | Open Questions 1 | 사용자가 다른 칸(당일 예수금 등)을 넣으면 미결제 매매만큼 어긋난다 — 사용자 확인으로 해소 |

## Open Questions (RESOLVED)

> 2026-11-20 플랜 단계에서 다섯 질문 모두 처리됐다. 질문마다 **RESOLVED** 줄에 처리 위치를 적는다.

1. **[결정 전제에 영향] 「예수금을 실계좌 금액에 맞춘다」 의 기준 — 예수금은 현금 + 보유 종목 매입금액이다.**
   - **RESOLVED (2026-11-20 사용자 답 「정산 화면에 한 줄」):** 44-CONTEXT D-28 — 「정산 전 수익」 카드 부제 아래 안내 한 줄. 계좌 메뉴 화면은 고치지 않는다. 구현 44-01 · 44-06, 배포 날 확인 44-13.
   - What we know: gh-trade `docs/features/account-budget.md` ③ 「주문가능 = 한도 − Σ(잔고 평단 × 보유수량) − Σ(매수 미체결 …)」 · 「잔고는 매입가(평단) 기준」 · ⑦ 「한도는 「지금 운용 자금」 이다」 · 「매수 체결: 한도 −= 수수료 (매수 금액 자체는 잔고 매입금액으로 이미 빠진다)」 [CITED: ../gh-trade/docs/features/account-budget.md ③ · ⑦]. 즉 매수해도 예수금은 수수료만 줄고, 매도 때 실현손익만큼 바뀐다. 보유 종목의 평가손익은 예수금에 없다. 인박스 261027-account-budget 의 같은 식 [CITED: docs/inbox/from-gh-trade/261027-account-budget.md 「계산식」].
   - What's unclear: 사용자가 계좌 메뉴에서 맞출 때 넣을 값. 증권사 앱의 「예수금」(현금 · D+2 정산 전후로 다름)이나 「총평가」 를 넣으면 보유 종목이 있는 날 수익이 매입금액만큼(또는 평가손익만큼) 틀어진다. D-01 식 자체는 그대로 성립한다.
   - Recommendation: 사용자에게 한 줄 확인 — 「맞출 값 = D+2 예수금 + 보유 종목 매입금액(평가금액 아님 · 보유가 없으면 D+2 예수금 그대로)」. 화면 문구로 넣을지는 사용자 답에 따른다(UI-SPEC 에 없는 문구라 넣으면 UI-SPEC 보강 필요). 확인 전에도 계획은 진행 가능(계산 코드 무관).

2. **계좌 4개의 (증권사, 계좌번호) 대응과 지금 예수금 — 배포 날 확인할 항목.**
   - **RESOLVED (체크포인트로 이월):** 계좌번호는 44-04 Task 1 사용자 확인 체크포인트, 지금 예수금 · 등록 서버 수 · 검산 숫자 대조는 44-13 Task 3 배포 날 확인.
   - What we know: 10-27 기록 「현재 값: 교보 10279758101 예수금 7억 · …, KB 37728502101 · 37703857101 예수금 미설정」 [CITED: .planning/phases/36-account-budget/36-CONTEXT.md:15]. 계좌는 3개만 적혀 있고 어느 것이 「KB 정근형」 · 「KB 김현중」 · 「교보 김현중」 인지 문서에 없다. 「교보 정근형」 은 11-01 에 생겼다(D-14). 이 세션은 relay · 운영 DB 를 조회하지 않았다(비밀 · 운영 접근 없음). 원격 마이그레이션 머리는 조회했다(아래 Environment).
   - What's unclear: 대응 · `dma_accounts` 등록 여부 · 지금 예수금(11-19 사용자 말: 8.45억 · 6.84억 · 0.2억 · 3.72억)과의 차이. KB 두 계좌가 여전히 미설정이면 배포 첫 화면은 D-25 상태(두 묶음 모두 「—」 · 확정 잠김)다.
   - Recommendation: 플래너가 (a) 실행 전 `checkpoint:human-verify` — 사용자가 계좌 4개의 증권사 · 계좌번호(계좌 메뉴에서 보임)를 알려 줌 → 시드 SQL 에 넣음, (b) 배포 날 메인 세션 확인 태스크 — 계좌 메뉴에서 4계좌 예수금이 설정돼 있는지 · 11-19 잔액과 다르면 사용자가 Open Question 1 기준으로 맞춘 뒤 정산 화면 숫자를 CONTEXT 검산 숫자와 대조.

3. **한 계좌 등록 서버 중 일부만 성공했을 때의 다시 반영(D-26 재량).**
   - **RESOLVED (Claude 재량 기본안):** 44-CONTEXT Claude's Discretion — 반영 실패 기록에 목표값을 남기고 다시 반영 때 지금 값 = 목표값이면 보내지 않는다. 구현 44-05, 등록 서버 수 확인 44-13 Task 3.
   - What we know: UI-SPEC researcher decision 18 은 「그 계좌 미반영」. 목업 `pend` 는 계좌별 **증감**이고 CONTEXT 재량 문구는 「같은 값을 다시 보낸다」 — 두 모양이 다르다. 주문 서버는 성공하고 다른 서버만 실패했는데 「지금 값(주문 서버) + 증감」 을 보내면 주문 서버에 두 번 더해진다.
   - Recommendation: Pattern 2 의 `targetKrw` 대조로 대부분 막힌다(주문 서버 지금 값 = target → 보내지 않음 · 단 그때는 실패한 서버도 안 고쳐지므로 계좌 메뉴의 서버 간 다름 줄이 남는다 → 어드민이 계좌 메뉴에서 저장해 맞춤). A1(서버 1대씩)이 맞으면 이 경우는 지금 생기지 않는다 — 배포 날 확인 항목에 「4계좌 등록 서버 수」 를 넣는다.

4. **심쥬니가 「현중 · 근형」 계좌에 출자 · 원금 회수하는 거래.**
   - **RESOLVED (2026-11-20 사용자 답 「막는다」):** 44-CONTEXT D-29 — 알약 비활성 + server zod + DB 거부. 구현 44-01 · 44-02 · 44-03 · 44-05 · 44-10.
   - What we know: 목업 `caps` 는 그 경우 `NaN`(p1 에 J 칸 없음). 화면 알약은 막지 않는다.
   - Recommendation: server zod · RPC CHECK 로 「출자 · 원금 회수의 사람은 그 계좌 묶음의 비율에 있는 사람」 만 허용(400 · 오류 줄 「이 묶음에 원금이 없는 사람이에요」 가칭). UI-SPEC 에 없는 오류 문구라 플래너가 사용자에게 한 줄 확인하거나 시트에서 해당 알약을 비활성.

5. **새 예수금이 1원 미만이 되는 반영의 화면 문구.**
   - **RESOLVED (Claude 재량 기본안):** 44-CONTEXT Claude's Discretion · 44-UI-SPEC 「플랜 단계 보강」 — 보내지 않고 「예수금 미반영」, 문구 확정. 지우기 · 취소에서 되돌릴 수 없는 경우는 D-30. 구현 44-05 · 44-07 · 44-09.
   - Recommendation: 미리 보기 줄을 경고색으로 「… → 0 이하라 보내지 않아요」(가칭) · 저장은 하되 그 계좌 pend. UI-SPEC 에 없는 상태 — 플래너가 UI-SPEC 보강 항목으로.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | 전 패키지 | ✓ | v24.21.0 | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1 | — |
| Docker + `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP 러너 | ✓(이미지 로컬 · 데몬 동작) | 17.6.1.104 | — |
| Supabase CLI(링크됨) | `db push`(메인 세션) · 원격 머리 확인 | ✓ | 2.75.0 | — |
| Playwright chromium | E2E | ✓ | chromium-1217 캐시 | — |
| relay · 매매 서버(운영) | 배포 뒤 확인 | 이 세션 미접촉 | — | 배포 날 메인 세션 |

**마이그레이션 머리:** 로컬 `ls supabase/migrations | tail` 마지막 = `20261119170000_launch_map_q16_fire_window.sql`, 원격 `supabase migration list --linked` 마지막 = `20261119170000`(둘 같음 · 2026-11-20 이 세션 조회). 새 버전은 그보다 크게 — 동시 세션이 있으니 실행 시점에 다시 보고 정한다.

**Missing dependencies with no fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest(shared · server · webapp) · pgTAP(로컬 컨테이너) · Playwright |
| Config file | `server/vitest.config.ts` · `webapp/vitest.config.ts`(둘 다 maxWorkers 기본 2) · shared 는 vitest 기본 · `webapp/playwright.config.ts`(baseURL `http://localhost:3100`) |
| Quick run command | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/settlement.test.ts --maxWorkers=2` |
| Full suite command | `pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/server exec vitest run --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2` + pgTAP 1건 + `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-settlement.spec.ts --workers=1` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 규칙 1 · 2 · 4 · 6 / D-01 · D-06 | 검산 픽스처 표 전 항목(계좌 수익 · 묶음 · caps · person · nameVs · hgSum · payAcc · 미설정 unk) | unit(shared) | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/settlement.test.ts --maxWorkers=2` | ❌ Wave 0 |
| D-09 / R6 · R15 | 4 : 3 : 3 끝전(100,000,005 → 합 100,000,004) · 바로 출금 만원 버림 · 정산 뒤 person(due · stake) | unit(shared) | 위와 같음 | ❌ Wave 0 |
| D-08 | `formatEokMan*` 경계(0 · 9,999 · −5,000 · 1억 · 9,999만 · 10억 1만 · 음수 U+2212) · 날짜 「25년 말」 · 읽은 시각 오늘/어제 | unit(shared) | 위와 같음 | ❌ Wave 0 |
| D-13 / R16 | 장중 판정(평일 07:59 거짓 · 08:00 참 · 19:59 참 · 20:00 거짓 · 토요일 거짓 · UTC 자정 근처) | unit(shared) | 위와 같음 | ❌ Wave 0 |
| D-03 | 예수금 선택이 계좌 메뉴(`summarizeLinkedCosts`)와 같은 값 — live 우선 · 87 폴백 · 출처 서버 · 서버 간 다름 · 첫 known 사용자 | unit(shared + webapp 대조) | shared 위 + `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-linked-summary.test.ts --maxWorkers=2` | 일부(기존 webapp 테스트 있음) |
| D-04 · D-25 | GET: relay 성공 → reads 기록 RPC 호출 · relay 실패(status 0) → 마지막 값 + stale · 둘 다 없음 → 미설정 · 0 → 미설정 | integration(server supertest + `makeAdminSupabase` rpc 핸들러 + `makeFakeRelay`) | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-settlement.test.ts --maxWorkers=2` | ❌ Wave 0 |
| D-18 | 비관리자 403 · RPC 0회 · relay 0회 | integration(server) | 위와 같음 | ❌ Wave 0 |
| D-10 · D-26 / Pitfall 1 · 2 · 8 | 반영: ok → pend 없음 · 한 서버 failed → 그 계좌만 pend · timeout → pend + targetKrw · target < 1 → 보내지 않음 · 대상 0 → no_server · 계좌 옮김 한쪽 실패 · 다시 반영 때 지금 = target → 미송신 | integration(server · fake relay `setAccountBudget` 응답 조작 · `relayReject`) | 위와 같음 | ❌ Wave 0 |
| D-16 · D-17 / Pitfall 5 | 확정: 서버 계산 수익 · 스냅샷이 반영 전 값 · `STALE_SETTLE` → 409 · 쥬니 손실/미설정 → 409 · 취소 `NOT_LATEST` → 409 | integration(server) + pgTAP | server 위 + `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql` | ❌ Wave 0 |
| D-14 · D-19 · D-21 | 시드 9건 정확히 1벌(두 번 적용해도) · 종류별 모양 CHECK · 미래 날짜 `FUTURE_DATE` · 바로 출금 줄 고치기/지우기 `SETTLE_LINKED` · 고치기 → history before · 지우기 → deleted_at · 취소 → 바로 출금 줄 지움 표시 · 최신만 취소 · 권한(RLS on · anon/authenticated 권한 없음 · RPC EXECUTE service_role 만) | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql` (시드 멱등은 `--with <새 마이그레이션>` 두 번) | ❌ Wave 0 |
| D-18 · 사이드바 | Admin 하위 「매매손익 · 정산 · 계좌 · 사용자 · 서버 · 러쉬 주문」 순서 · `/admin/settlement` 활성 | unit(webapp) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` | ✅ 있음(1511 ~ 단언 갱신 필요) |
| D-22 ~ D-27 | 카드 · 표 · 시트 · 펼침 · 확인 · 반영 상자 문구와 상태(UI-SPEC 문구 정본) | component(webapp vitest + RTL) | `pnpm --filter @gh-radar/webapp exec vitest run src/components/settlement --maxWorkers=2` | ❌ Wave 0 |
| 화면 전체 · 폭 | `/admin/settlement` 첫 화면 숫자(픽스처 = 검산 숫자) · 360 / 390 / 768 / 900 가로 넘침 0 · 정산 확정 흐름 | E2E(`page.route` 로 `/api/admin/settlement*` 목 — `admin-pnl.spec.ts` · `e2e/fixtures/admin.ts` 꼴) | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin-settlement.spec.ts --workers=1` | ❌ Wave 0 |
| 실제 반영(운영) | 거래 저장 → 계좌 메뉴 예수금 변화 · 「다시 반영」 | manual-only(배포 날 · 운영 매매 서버 필요) | — | 배포 확인 태스크 |

### Sampling Rate
- **Per task commit:** 그 태스크가 닿은 패키지의 vitest 파일 하나(`--maxWorkers=2`). shared 를 고쳤으면 server · webapp 검증 전에 `pnpm --filter @gh-radar/shared build`(Pitfall 9).
- **Per wave merge:** shared · server · webapp vitest 전체(`--maxWorkers=2`) + pgTAP 1건.
- **Phase gate:** 위 + Playwright `--workers=1` + `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck`(config `build_command` 의 해당 부분 · server typecheck 포함) 녹색 뒤 `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `packages/shared/src/__tests__/settlement.test.ts` — 검산 픽스처(위 표 그대로 · 원 단위) · 4 : 3 : 3 끝전 · 표기 · 장중
- [ ] `server/tests/routes/admin-settlement.test.ts` — `makeAdminSupabase({ rpc: { admin_settlement_raw, settlement_record_reads, … } })` · `makeFakeRelay` 의 `accountCosts` · `setAccountBudget` 응답 조작
- [ ] `supabase/tests/settlement.test.sql` — 표 · RPC · 시드 · 권한
- [ ] `webapp/src/components/settlement/__tests__/*.test.tsx`
- [ ] `webapp/e2e/specs/admin-settlement.spec.ts` + `webapp/e2e/fixtures/settlement.ts`
- (갭 아님) `server/tests/fixtures/fake-relay-admin.ts` 는 이미 충분하다 — 기본 응답이 `/internal/admin/account-costs` 에 `{ status: 200, data: { servers: {} } }`, 그 밖 PUT(op 6 budget 포함)에 `{ results: OK_RESULTS }` 를 주고, `makeFakeRelay(handler)` 의 handler 가 경로별로 덮어쓴다(`calls` 로 보낸 바디 단언) [VERIFIED: server/tests/fixtures/fake-relay-admin.ts:37 · 74-79 · 116-135]. `OK_RESULTS` = `[{ server: "KB120", outcome: "ok", usersRev: "2" }]`
- Framework install: 없음(전부 있음)

## Sources

### Primary (HIGH confidence)
- 코드(이 세션 Read): `packages/shared/src/admin.ts`(126 · 184-207 · 505-518 · 644-657 · 835-858) · `packages/shared/src/order-endpoint.ts`(97-108 · 188-246) · `packages/shared/src/limit-feature.ts:54-62` · `packages/shared/src/account-budget.ts:58-64` · `packages/shared/src/marketHours.ts` · `packages/shared/src/krxCalendar.ts:45-61` · `server/src/routes/admin-accounts.ts` 전부 · `server/src/routes/admin.ts:1-360` · `server/src/services/relay-admin-client.ts` 전부 · `server/src/routes/admin-pnl.ts` · `server/src/middleware/require-admin.ts` · `server/src/app.ts`(마운트) · `relay/src/admin/admin-api.ts`(30-45 · 80-215 · 685-730 · 930-1030) · `relay/src/admin/dispatcher.ts`(30-50 · 300-380) · `webapp/src/components/admin/account-linked-summary.ts` · `webapp/src/components/admin/reflect-chip.tsx` · `webapp/src/lib/admin-api.ts` · `webapp/src/components/layout/app-sidebar.tsx:196-207` · `webapp/src/app/admin/pnl/page.tsx` · `supabase/migrations/20261106300000_dma_accounts_master.sql` · `scripts/verify-dma-orders-price-check.sh`
- 목업 `a-real.html`(3차) — 계산 부분을 node 로 실행해 픽스처 재현
- gh-trade(읽기만): `../gh-trade/docs/features/account-budget.md` ① ~ ⑦
- 인박스: `docs/inbox/from-gh-trade/261027-account-budget.md` · `261027-account-pnl.md`
- `.planning/phases/36-account-budget/36-CONTEXT.md`(D-01 ~ D-05 · D-11 · D-14 · 15행)
- `supabase migration list --linked`(원격 머리)

### Secondary (MEDIUM confidence)
- 44-UI-SPEC.md(승인 · 표기 · 상태 계약) · 44-CONTEXT.md · ROADMAP Phase 44 · 스케치 README

### Tertiary (LOW confidence)
- 운영 예수금 현재값 · 계좌번호 대응 — 미조회(Open Questions 2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 패키지 0 · 기존 경로 전부 코드로 확인
- Architecture: HIGH(읽기 · 쓰기 경로 · 마운트 · 표 규약) / MEDIUM(표 · RPC 이름과 모양 — 재량 제안)
- 계산 규칙: HIGH — 목업 실행으로 검산 재현 · 이식 때 바뀌는 점(R6 · R7 · R8) 명시
- Pitfalls: MEDIUM-HIGH — 0 = 해제 · timeout 의미 · 상한 수치는 코드 · 문서로 확인, 대응책은 설계 판단

**Research date:** 2026-11-20
**Valid until:** 2026-12-20(코드 경로는 안정 · 운영 예수금 상태는 배포 날 다시 확인)
