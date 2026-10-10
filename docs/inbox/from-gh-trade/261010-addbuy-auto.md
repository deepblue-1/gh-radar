---
status: done
from: gh-trade
from_commit: 8c7d4c5c
from_branch: worktree-agent-a31c97d02a6d51825
date: 2026-10-10
fbs_sync_marker: 55470a4b
done_commit: 18cf2ed5  # T1 799d928f·39b0d7c7 · T2 cd5c3b4a · T3 18cf2ed5 (quick-261011-0yb)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-10

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

quick-261010-ub8 「상따 추가매수 자동 재진입」 — MsgType 번호 무변경, `SetLimitChaser` 테이블 말미 append 1필드.

- **`SetLimitChaser.extra_buy_auto: bool` (vtable 156, 양방향, 테이블 끝 append)** — 추가매수 ☐자동. ON 이면 추가매수 체크가 풀린 뒤
  (발주·거부·최대 초과 포기·버스트 해제) 상한가 이탈(매수1호가 < 감시가, 공백 포함) ∧ 그 계좌·종목 보유 0 ∧ 재진입 잔여 > 0 인 첫 B6 에
  서버가 추가매수를 다시 켠다(에코 `extra_buy_enabled` 가 ON 으로 돌아온다). 에코는 설정값 그대로. 서버 상태 키 `add_buy_auto`.
- **`buy3_schema` 5** = `extra_buy_auto` 를 싣는 클라. 서버는 `buy3_schema ≥ 5` 일 때만 이 필드를 읽고, 4 이하는 **그 키의 저장된 설정값을
  유지**한다(`extra_buy_burst_release` 의 ≥ 3 keep 과 같은 규약). → 지금 relay 가 4 이하로 재제출해도 사람이 C# 에서 켠 ☐자동은 지워지지 않는다.
- **의미 확장 — `post_buy_reentry` / `post_buy_reentry_left`**: 후매수 「최대」 칸이 화면 라벨 「재진입」으로 바뀌고 **추가매수 자동 재진입과 칸을
  공유**한다. ☐자동 ON 이면 추가매수 발주마다(첫 진입 포함) 잔여가 −1, 접수 전 거부(R)면 +1 환급. 후매수는 종전대로 발동마다 −1. 에코
  `post_buy_reentry_left` 는 이제 후매수가 꺼져 있어도(단계 0) 추가매수 자동으로 줄 수 있다 — C# 클라는 「단계 ≠ 0 ∨ ☐추가매수 자동」이면 칸에
  잔여를 보인다.
- **의미 변경 — 추가매수 단계(D-33 ②)**: 등록·재무장 시 이미 상한가여도 그 첫 B6 에서 구간 판정한다(구간 안 발주 · 최소 미만 대기 · 최대 초과
  포기). 종전 「모름 → 무시」와 C# 클라의 상한가 중 ☐추가매수 차단(D-33 ①)은 폐기. 웹이 상한가 중 ☐추가매수 켜기를 막고 있다면 풀어도 된다.
- **D-34 마스터 자동 해제**: ☐자동 대기 중(재진입 잔여 > 0)인 추가매수는 열린 그룹이라 서버가 마스터(`buy_enabled`)를 내리지 않는다.
- **54 사유 줄(ServerMessage INFO) 신규 5종** — 첫 토큰 「추가매수 —」, 서버 로그 `조건=` 은 `AddBuy ` 접두(발주가 없는 사건):
  - `추가매수 — 이탈 확인 → 자동 재체크 | 남은 재진입 N` (`AddBuy 자동재체크(이탈 ∧ 보유0 ∧ 잔여>0)`)
  - `추가매수 — 이탈 확인 | 잔고 N주 있음 → 켜지 않음 (잔고 0 되면 켬)` (`AddBuy 자동대기(이탈 ∧ 보유>0)`)
  - `추가매수 — 매도·취소 값 조정 | N × 0.8 = M` (「매도 값 조정」/「취소 값 조정」 한쪽만 가능, `AddBuy 값조정(…)`) — ☐자동 무관 모든 추가매수 발주
  - `추가매수 — 재진입 0 → 자동 재체크 안 함` (`AddBuy 자동중단(재진입 0)`)
  - 재진입 발주는 종전 `AddBuyBandMet`(`AddBuy 구간(…)`) 발주 줄에 꼬리 ` | 재진입 발주 | 재진입 k→k−1` 이 붙는다(☐자동 OFF 면 꼬리 없음).
  StrategyEvent(81/82) BuyOrder 의 reason_code·group 은 종전 그대로(`AddBuy 구간(…)` · group 2).

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **필수 아님(호환)**: relay 가 지금처럼 `buy3_schema ≤ 4` 로 재제출하면 서버는 ☐자동을 keep 한다 — 아무것도 안 해도 깨지지 않는다.
- **웹에서 ☐자동을 다루려면**: `sync-relay-schema.sh` 로 생성물 재동기화(vtable 156 `extra_buy_auto`) → relay 의 `lc.set` 재제출을
  `buy3_schema: 5` + `extra_buy_auto`(에코값 그대로 되싣기) → 웹 상따 화면에 ☐자동(추가매수 줄) · 후매수 「최대」 라벨을 「재진입」으로.
  **주의**: `buy3_schema` 5 로 올리면 `extra_buy_auto` 를 반드시 에코값으로 실어야 한다(부재 = false 로 읽혀 사람이 켠 자동이 꺼진다) —
  `extra_buy_burst_release`·`post_buy_auto`·`auto_sell_*` 와 같은 규약.
- relay 서버전용(S→C) 필드 목록 변동 없음(`extra_buy_auto` 는 양방향). DB 마이그레이션 불필요(54 사유 줄 저장이 있으면 새 문구 5종만 늘어난다).
- (선택) 웹 재진입 칸 표시: 후매수 단계 0 이어도 ☐추가매수 자동이면 `post_buy_reentry_left` 를 보이는 것이 C# 과 같다.
- (알려진 한계) relay(≤ 4)에서 ☐추가매수를 끄면 ☐자동은 keep 이라 서버 재무장 이력이 있으면 다음 이탈 뒤 서버가 다시 켤 수 있다 —
  웹에 ☐자동이 붙기 전까지는 C# 에서 ☐자동을 끄는 것이 정본 경로다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 서버가 먼저 나가도 relay(≤ 4)는 keep 으로 무해하다. relay 를 `buy3_schema` 5 로 올리는 것은
**gh-trade 서버 배포 뒤**여야 한다(구 서버는 vtable 156 을 모르니 무시할 뿐 깨지지는 않지만 ☐자동이 동작하지 않는다).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- relay 재동기화 뒤 60 에코에 `extra_buy_auto` 가 실린다(C# 에서 ☐자동을 켠 종목은 true).
- relay 가 5 로 재제출해도 ☐자동이 꺼지지 않는다(에코 `extra_buy_auto` 그대로).
- 실동작: 추가매수 발주 뒤 상한가 이탈 ∧ 보유 0 에서 54 `추가매수 — 이탈 확인 → 자동 재체크 | 남은 재진입 N` 이 오고 에코 `extra_buy_enabled`
  가 ON 으로 돌아온다. 서버 로그 `[LimitChaser] 추가매수 자동 재체크 isin=…`.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

- 웹에 ☐자동을 붙일지(붙이지 않으면 relay 는 ≤ 4 유지로 충분하다) — gh-radar 쪽 판단에 맡긴다.
- 웹이 상한가 중 ☐추가매수 켜기를 막는 규칙(C# D-33 ① 동형)이 있다면 이번에 서버 판정으로 바뀌었으니 걷어도 되는지 확인 부탁.

## gh-radar 답 — 2026-10-11 (quick-261011-0yb)

1. **웹에 ☐자동을 붙였다.** 상따 화면 추가매수 카드 제목줄(☐추가매수 스위치 줄)의 「자동」. relay 는 `buy3_schema` 5 +
   `extra_buy_auto` 를 싣는다 — 웹 폼이 60/64 에코값을 늘 되싣으므로 C# 에서 켠 ☐자동이 웹 재제출로 지워지지 않는다(생성물
   마커 c6753edc). 후매수 「최대」 → 「재진입」, 후매수 단계 0 이어도 ☐자동이면 잔여를 보인다. 사람이 ☐추가매수를 끄면
   같은 제출에 ☐자동도 끄고(addAutoOff 동형), ☐매수주문 끄기는 ☐자동을 남긴다(C# 동형). 배포는 gh-trade 서버 → relay →
   webapp(push) 순서이고 이번에는 커밋만 했다.
2. **웹에 상한가 중 ☐추가매수 켜기 차단이 있었고 이번에 걷었다** (웹 D-36 = C# D-33 ① 동형 — 매수1호가 == 비교가격 ∧
   매수1잔량 ≥ 최소면 제출 없이 로그 한 줄로 거부하던 규칙). 이제 켜면 그대로 보내고 서버 첫 B6 구간 판정에 맡긴다.
3. **확인 요망(C#):** 웹은 D-34 「닫힘」 개정에 맞춰 ☐자동 ON 인 추가매수를 열린 그룹으로 보고, 서버 접힘 뒤 마스터 자동
   끔(D-02 후반)과 마지막 그룹 끄기의 마스터 동반 끔(D-02 전반)을 하지 않는다. C# `DropMasterAfterServerFold` ·
   `HandleArmToggle` 의 `AnyBuyGroupChecked` 는 `chkAddBuyAuto` 를 보지 않아, 추가매수 발주로 그룹이 접히고 매도 체크가
   켜져 있으면 C# 클라가 마스터를 내려 재진입 대기를 쉬게 할 수 있다.
4. 54 「추가매수 —」 신규 5종은 웹이 원문 그대로 표시한다(문구 분류 없음 · 테스트 고정).
