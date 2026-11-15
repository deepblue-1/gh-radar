---
status: done
from: gh-trade
from_commit: 934190c2
from_branch: master
date: 2026-11-15
fbs_sync_marker: 8d073739
done_commit: 2968f5e5  # 사유 사전 「최대금액 막힘」 · 주문로그 본문(54 보류 줄과 같은 꼴 — ev_qty_before · ev_qty_after 도 표시) · 챗봇 지식 한 문단
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-15

gh-radar 요청 `docs/inbox/from-gh-radar/261115-buy-cap-block-journal.md`(gh-trade 쪽 done) 의 회신이다. gh-trade 934190c2(quick-261115-sil).

## 바뀐 것

최대금액에 막힌 전이(54 보류 줄 `… 보류 — 최대금액 A만 중 B만 사용(보유 C만 · 미체결 D만)` 을 내는 바로 그 순간)에 **kind 9 `StateTransition` 1행**을 저널 80 으로 함께 남긴다. 새 사유 토큰 하나뿐 — 새 kind·fbs 필드·MsgType 없음(재동기화 불필요). 54 줄과 같은 「그룹별 1회 · SOR 짝당 1회」 규칙.

사유 토큰: **`GateBuyCapBlocked`** (Gate* 대역 = 서버 판정 「~로 미발주」, `reason_code` 낱말 그대로 — 사전 키와 바이트 일치)

| 칸 | 값 | 단위 |
|----|----|------|
| `group` | 1 선매수 · 2 줄매수 · 3 후매수 | — |
| `price` | 매수 주문가 | 원 |
| `qty` | 그 그룹 주문수량(막히지 않았으면 나갔을 주수) | 주 |
| `cond_threshold` | 최대금액 (= 54 줄 A) | 만원 |
| `cond_actual` | 깔린 돈 = 보유 + 미체결 (= B) | 만원 |
| `ev_qty_before` | 보유 매입금액 = 보유수량 × 평균 매입단가 (= C) | 만원 |
| `ev_qty_after` | 매수 미체결(접수 전 포함, 주문가 환산, 매수 SOR 짝 합산) (= D) | 만원 |
| `ahead_qty` = `expected_cum` | 스위치 비트셋(막힘은 스위치를 바꾸지 않아 전 == 후) | 비트 |
| `order_no` | 빈칸 | — |
| `account_no`·`dma_user_id`·isin·exchange·`gw_time`·`cum_volume` | 다른 kind 9 행과 같은 규칙으로 채움 | — |

주의: kind 9 의 다른 Auto* 행에서 `cond_threshold`/`cond_actual` 은 단계 전/후(0 ~ 3)다 — **이 토큰에서만** 만원 값으로 재해석된다.

## gh-radar 가 할 일

- 사유 사전(`packages/shared/src/strategy-event-labels.ts`)에 `GateBuyCapBlocked` 한 줄 — 예 「최대금액 막힘」.
- 챗봇 지식 한 문단 — 위 칸 매핑으로 「○○ 왜 줄매수 안 나갔어?」 → 「최대금액 A만 중 B만 사용(보유 C만 · 미체결 D만)이라 한도가 남지 않아 미발주」.
- 생성물 재동기화·relay 파서·DB 마이그레이션 불필요.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 모르는 사유 토큰이 먼저 와도 relay 는 그대로 적재한다(gh-radar 노트 확인).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

**서버 목록 정정:** gh-trade 운영 서버는 **KB 120 · 교보 119 · 교보 112** 세 대다(121 은 미사용). 최대금액(buy3_schema 9 · 비트 54) 웹 배포의 선행 조건도 이 세 대 배포다 — 배포가 끝나면 gh-trade 세션이 SendMessage 로 알린다.

## 확인 방법

- 최대금액을 작게 잡아 막은 뒤, 54 보류 줄 시각에 같은 계좌·종목의 kind 9 `GateBuyCapBlocked` 행 1건이 `dma_strategy_events` 계열에 생기는지.
- 그 행의 `cond_threshold`·`cond_actual`·`ev_qty_before`·`ev_qty_after` 가 54 줄의 A·B·C·D 와 같은지.
- 막힌 채 시간이 지나도 행이 늘지 않고, 한도가 풀려 주문이 나간 뒤 다시 막히면 1행 더 생기는지.

## 질문

- 요청 노트 질문 답: ① kind 9 새 사유 토큰이 서버 구조상 자연스럽다(기존 Auto* 전이 링을 그대로 쓴다 — 새 kind·fbs 필드 없음). ② 「보류 해제」 행은 만들지 않는다 — 다시 나간 주문은 주문 행·AutoPreBuyOff/AutoAddBuyOff/AutoPostBuyFire 로 보인다. 「조임(일부만 나감)」 도 kind 9 행이 없다 — 주문 행 수량 < `qty`(그룹 수량)로 보인다.
- 추가 질문 없음.
