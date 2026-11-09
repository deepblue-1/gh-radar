---
status: done
from: gh-trade
from_commit: fe65853d
from_branch: master
date: 2026-11-09
fbs_sync_marker: none(와이어 무변경)
done_commit: cad36b55
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-09 · 교보 09:00:30 N 발사시각 칸 하나로

## 바뀐 것

**와이어 무변경**(StockDMA.fbs·MsgType·필드 그대로). 의미만 바뀐다.

- gh-trade quick-261109-eqv(진행 중): **교보 서버(119·112)는 09:00:30 개장차익 'N' 회차를 코스피·코스닥 한 묶음으로 send 1회**에 보낸다
  (교보는 KOSPI·KOSDAQ 공용 주문 세션 하나라 시장별로 따로 쏠 이유가 없다 — 사용자 결정 2026-11-09). 그래서 교보의 N 발사 시각은 **한 값**만 쓴다.
- 서버 쪽 처리: 교보 서버는 44 op 8(SetLaunchPlan) `launch_profile = "N"` 이 `launch_market` K·Q 어느 쪽으로 오든 **K·Q 두 칸을 같은 값으로 함께 저장**한다
  → 94 LaunchPlanSnapshot 의 `N/K`·`N/Q` 두 행이 늘 같은 값이 된다. KB(120)는 종전 그대로 시장별 두 값.
- 16:00 예약(Q16)·뒤탐침(op 10)은 변경 없음.

## gh-radar 가 할 일

웹 어드민 「발사 계획」 편집 화면만 고친다(relay·DB·스키마 동기화 불필요).

1. 서버가 **교보**(p_gateway 의 broker = `KYOBO`)이면 N 칸을 **하나**로 보여 준다 — 라벨 예: 「09:00:30 N (코스피·코스닥 공통)」. 표시값은 94 의 `N/K` 행.
2. 저장은 **op 8 을 K·Q 두 번**(같은 값) 보낸다 — 새 서버는 한 번만 받아도 두 칸을 맞추지만, 이 노트 처리 시점에 서버가 아직 옛 빌드일 수 있어
   두 번 보내면 배포 순서와 무관하게 두 값이 같아진다.
3. 교보에서 94 의 `N/K` ≠ `N/Q`(옛 빌드에서 따로 저장된 값)이면 칸 옆에 「코스피 x · 코스닥 y 로 갈라져 있음 — 저장하면 하나로 맞춘다」 정도로 알린다.
   현재 119 는 K −349 · Q −348(1µs 차이)이다.
4. KB 서버는 지금 화면 그대로(코스피·코스닥 두 칸).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경이고, gh-radar 가 위 2번처럼 두 번 저장하면 어느 쪽이 먼저 나가도 결과가 같다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다. 이번엔 webapp 만.

## 확인 방법

- 교보 119 어드민에서 N 칸이 하나로 보이고, 값을 바꿔 저장하면 94 응답의 `N/K`·`N/Q` 가 같은 값이고 plan_rev 가 오른다.
- 서버 파일 확인(gh-trade 쪽에서 봄): `ssh kyobo119 "cat ~/gh-trade-server/log/launch_plan.toml"` 의 `[n]` K·Q 가 같은 값.
- KB 120 화면은 두 칸 그대로.

## 질문

없음. 교보 판별을 p_gateway broker 말고 다른 것으로 하고 있다면 알려 주세요.
