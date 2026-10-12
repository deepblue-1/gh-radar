---
status: done
from: gh-trade
from_commit: 540fcdfc
from_branch: feature/limitchaser-amount-unit
date: 2026-10-12
fbs_sync_marker: e5b4fbca
done_commit: 708c4772
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-12

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경**(.fbs 필드·슬롯·MsgType 그대로 — 판정기의 3파일은 브랜치 전체 기준이고, 이번 수정이 건드린 계약 파일은 `server/docs/protocol.md` 42 행 하나다). Phase 32 코드리뷰 수정 중 서버 동작이 바뀐 두 가지:

1. **42 SetUserSettingsReq — 구 송신자 keep (IN-07, d50ffe6e).** `post_buy_floor_qty ≠ 0 ∧ post_buy_floor_amount == 0` 인 42(금액 필드를 모르는 구 송신자)는 그 키의 **저장된** `post_buy_floor_amount` 를 유지한다(종전: 0 으로 덮음). 금액이 0 이 아니면 요청값 그대로(주 칸을 되싣는 재제출이어도).
2. **SetLimitChaser 줄매수 검증 확장 (WR-06, f6e176e5).** 「최대 ≠ 0 ∧ 최소 > 최대」 거부가 종전 `extra_buy_enabled` 만 보던 것을 `extra_buy_enabled ∨ (extra_buy_auto ∧ buy3_schema ≥ 5)` 로 넓혔다. 걸리면 54 ERROR(`줄매수 설정이 불완전합니다(최소 > 최대) — 줄매수를 켜지 않았습니다`) 와 함께 줄매수·자동을 **둘 다** 끈다. ☐줄매수 OFF · 자동 ON 의 빈 구간 등록이 이제 거부된다.

판정기가 걸린 파일:

- docs/features/order-log-progress.md
- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- relay 생성물 재동기화: **불필요**(.fbs 무변경).
- relay·웹이 42 를 보낸다면: `post_buy_floor_amount` 를 싣는 한 영향 없음. 주 칸만 싣고 금액 0 으로 보내면 이제 저장 금액이 유지된다(덮이지 않음).
- 웹 lc.set 이 줄매수 자동만 켠 채 최소 > 최대로 재제출하면 이제 54 ERROR 가 오고 줄매수·자동이 OFF 로 에코된다 — 웹이 그 조합을 미리 막고 있다면 할 일 없음, 아니면 같은 검사(자동 ON 도 「켜진 그룹」)를 따라가면 된다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경, 거부가 한 조합 늘고 42 가 값을 덜 지울 뿐이다. 아직 어느 서버에도 배포하지 않았다(교보 119 는 b0d7f763).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

42 에 금액 0 · 주 칸 ≠ 0 을 보낸 뒤 84 의 `post_buy_floor_amount` 가 이전 저장값인지, 자동만 켠 최소 > 최대 lc.set 에 54 ERROR 와 `extra_buy_enabled=false, extra_buy_auto=false` 에코가 오는지 본다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.

## 회신 (2026-10-12 · gh-radar quick-261012-mig)

- 1) 42 IN-07 — 웹 영향 없음. `/me` 는 `post_buy_floor_amount` 를 싣고, relay 는 금액이 빠진 구 탭 42 를 마지막 84 캐시 금액으로 되싣는다.
- 2) WR-06 — 웹이 막지 못하던 조합이라 맞췄다(708c4772). `limit-chaser-form.tsx` `armBlockOf` 의 「줄매수 최대 0주」 항과 새 「최소 > 최대」 항이 C# `addBuyLive`(☐줄매수 ∨ ☐자동)로 **전송 직전마다** 본다. 「최소 > 최대」는 e4a66ae2 와 같은 제출 주끼리(최대 주 ≠ 0 ∧ 최소 주 > 최대 주)이고, 문장은 C# 모달 원문이다. ☐줄매수 켜기 사전 검증도 같은 판정을 쓴다.
- 회귀: ☐자동 켜기 · ☐자동만 켜진 에코에서 무관한 칸 확정이 둘 다 전송 0, 금액은 최소 > 최대지만 같은 주로 내림되면 통과. 수정 전 코드에서 3건 모두 실패를 확인했다.
- 배포: 웹 전용 변경이다(relay · DB 무변경). phase 31 브랜치에 실려 phase 31 배포(relay → push)와 함께 나간다.
