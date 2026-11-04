---
status: done
from: gh-trade
from_commit: 9f9f7ea3
from_branch: master
date: 2026-11-04
fbs_sync_marker: e96aef6e
done_commit: bf617ae4
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-04

## 바뀐 것

**와이어 무변경**(필드·vtable·MsgType 그대로). `StockDMA.fbs` 는 주석만 바뀌었고, **상따(LimitChaser) 후매수 두 필드의 에코 의미**가 바뀌었다 (quick-261104-krm, 서버 a6a21f20 · 미배포).

- `post_buy_enabled` (vtable 114) — 종전: 발동 뒤에도 ON 유지(「보유중」·재진입 무제한, 소진만 OFF). **이제: 에코 = (cfg ∨ 자동 켬) ∧ 마스터 무장 ∧ 단계 == 감시.** 후매수가 발동(매수 송신)하면 「보유중」 동안 OFF 로 접히고, ☐자동 OFF 로 정리(미체결 0 ∧ 보유 0)가 끝나면 단계 꺼짐으로 OFF 가 유지된다 — 선매수·줄매수와 같은 1회성.
- `post_buy_auto` (vtable 132) — 종전: 서버가 후매수를 1회 켜면 false 로 소비해 에코. **이제: 소비하지 않고 켜진 채 에코한다.** ON 이면 기존 계기(선·줄매수 무체결 상따취소 전량취소 · 보유 0 전이)에 더해 **후매수 정리 뒤** 서버가 ☐후매수를 잠김부터 다시 켠다. 후매수 설정 불완전이면 서버가 false 로 끈다(종전과 같음).
- `post_buy_phase` 는 값 체계 그대로(0 꺼짐 · 1 감시 · 2 보유중 · 3 소진=구 파일). 「보유중」인데 `post_buy_enabled=false` 인 조합이 이제 정상이다.
- 재진입 로그 `[LimitChaser] 후매수 재진입 …` 은 ☐자동 ON 일 때만 나고 끝에 ` 잠금=처음부터(☐자동 켜짐)` 꼬리가 붙는다. ☐자동 OFF 정리 끝은 새 INFO `[LimitChaser] 후매수 끝 isin=… 정리 완료 — … 1회성` (사유 줄·통지 없음).

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs (주석만 — `post_buy_enabled`·`post_buy_auto` 설명)

## gh-radar 가 할 일

- 생성물 재동기화(`sync-relay-schema.sh`): **불필요**(주석만).
- relay 파서·DB 마이그레이션: 불필요.
- 웹: 상따 설정·상태를 보여 주는 곳(`lc-fields.ts` 등)에서 「후매수 체크 = 무장 중」·「☐자동은 한 번 쓰면 꺼진다」를 가정한 표시·설명 문구가 있으면 새 의미로 고친다. 후매수 무장 여부는 `post_buy_phase`(1 감시 · 2 보유중)로 보는 것이 정확하다.
- 웹·relay 가 상따 설정을 **재제출**하는 경로가 있으면: 에코값을 그대로 되싣는 것은 안전하다(「보유중」에서 들어온 후매수 OFF 제출은 서버가 단계를 건드리지 않는다). 다만 사람이 ☐후매수를 끄는 동작에는 ☐자동도 함께 false 로 보내야 클라와 같다(클라 규약).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경이라 순서 무관. gh-radar 쪽 문구 수정은 서버 배포 뒤 아무 때나.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

서버 배포 뒤 후매수가 한 번 발동한 종목에서 웹 상따 행의 후매수 표시가 OFF(단계 보유중)로 보이고, ☐자동을 켠 종목은 정리 뒤 후매수 ON(단계 감시)·☐자동 ON 으로 다시 보이면 맞다. 서버 로그 `후매수 끝` / `후매수 재진입 … 잠금=처음부터` 로 대조.

## 질문

없음.
