---
status: open
from: gh-trade
from_commit: 3b80cfcd
from_branch: master
date: 2026-11-25
fbs_sync_marker: 8d073739
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-25 · Phase 49 시간외종가 「땡」(08:30 G2 · 15:30 G3)

서버 배포: 2026-11-25 아침 세 서버(120 · 119 · 112) 바이너리 전송, 시간외 예약 스위치 두 개는 **꺼진 채**(재기동은 사용자 지시 뒤).

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어 **필드 추가는 77 말미 bool 두 개뿐**이다. 44 · 94 · 86 · 발사 저널은 필드 무변경 — 새 값 · 새 행 · 새 문구만 생긴다(gh-radar-27 회신 2026-11-24 의 모양 그대로, D-18 · D-19).

**ⓐ 44 `AdminCommandReq` op 8 — 새 profile 값 `"G2"`(08:30 장개시전 시간외종가 예약 발사 칸)**

- `launch_profile = "G2"` · `launch_market = "K"|"Q"` · `launch_offsets_us` **길이 1** — `.fbs` 필드 추가 없음
- 범위 **−3,000 ~ +20,000µs**, 기준 **08:30:00.000000**(음수 = 앞당김)
- 서버 초깃값 **0µs = 08:30 정각**(사용자 결정 D-20 — 조사 권고 +10,500µs 는 쓰지 않는다). 화면의 기본 표시도 0 이 자연스럽다. 첫 운영일 접수 / 이른 거부 결과를 보고 이 칸으로 조정한다
- 교보 서버도 G2 는 **그 시장 칸만** 저장한다(N 처럼 K · Q 를 같이 저장하지 않는다)
- 판정 순서: 08:30 스위치 꺼짐 → market → 길이 → 범위. 성공 · 멱등 · code 10 · code 11 문구는 Q16/N 과 같다
- 요청 예시:

```text
AdminCommandReq { op: 8, request_id: 1401, launch_profile: "G2", launch_market: "K", launch_offsets_us: [12000] }
→ 86 { code: 0, message: "저장 — 다음 발사부터 적용" } → 94(아래 켬 예시, plan_rev +1)
같은 값 재요청 → 86 { code: 0, message: "변경 없음" } · 94 없음 · plan_rev 불변
서버 로그: [Launch] 발사 계획 변경 profile=G2 market=K 0us → 12000us rev=2
감사 줄 user 칸: G2/K
```

**ⓑ 94 `LaunchPlanSnapshot.entries` — 기존 네 행 순서 · 내용 그대로 + 말미 `G2/K` · `G2/Q`**

- 08:30 발사가 **실제로 켜진 서버만** 두 행을 덧붙인다 — 「켜짐」 = `[queued_order] enabled` ∧ `g2_queue_enabled` ∧ `[preopen_order] offhours_close_enabled`(서버 판정식 `Config::G2QueueLive`, 49-10). 꺼진 서버 · 구 서버는 행 없음(= 이 서버는 08:30 발사를 모름). op 8 `"G2"` 의 「08:30 발사 꺼짐」 거부도 같은 식이다. 와이어 모양 · 문구는 무변경
- `tail_probes` 에 G2 행 없음(뒤탐침 op 10 은 G2 대상 아님 — op 10 profile "G2" 는 기존 `뒤탐침 대상 밖(profile Q16|N)`)
- vtable 슬롯 무변경(필드 추가 없음). 읽는 쪽은 (profile, market) 로 찾고 행 수 · 인덱스를 가정하지 않는다. 94 는 Notice 그대로

```text
08:30 스위치 켬(g2_queue_enabled = true) — entries 여섯 행
  [0] Q16/K [-200,-190,-170]   [1] Q16/Q [-200,-190,-170]
  [2] N/K   [-245]             [3] N/Q   [-245]
  [4] G2/K  [12000]            [5] G2/Q  [0]
  tail_probes: Q16 · N 두 행(G2 행 없음)

08:30 스위치 꺼짐 · 구 서버 — entries 네 행(종전 바이트 그대로, G2 행 없음 = 이 서버는 08:30 발사를 모름)
  [0] Q16/K  [1] Q16/Q  [2] N/K  [3] N/Q
```

**ⓒ 86 — G2 전용 새 문구(code 1, 바이트 그대로) · 기존 문구 무변경**

```text
G2 발사 계획 대상 아님(08:30 발사 꺼짐)
G2 발사 계획 대상 밖(market K|Q)
G2 는 시각 한 값
G2 발사 시각 범위 밖(-3000~20000µs)
```

- 기존 Q16/N 문구 8종 · op 10 문구 3종은 무변경. 구 서버는 op 8 G2 를 모르는 profile 로 보고 기존 `발사 계획 대상 밖(profile Q16|N · market K|Q)` 로 code 1

**ⓓ 발사 저널 kind 17/18 — 08:30 발사**

- profile 정수 **4 = G2**(94 문자열 `"G2"` 와 같은 발사) · exchange `"KRX"` · expected_cum **83000000**(HHMMSSmmm · 앞 0 빠진 8자리 → fire_base 08:30:00)
- queued_id = Q-ID · round 0 · probe false · wire(entry_round)는 (거래일, 서버, profile, 거래소, fire_base, 시장) 안에서 0, 1, 2 …(한 시장에서 여러 예약이 나가면 차례로)
- 1조각 — 예약 1건 = kind 17 1행. 탐침 · 예열 · 뒤탐침 · 재전송 행은 없다

**ⓔ 15:30(G3) 발사는 kind 17/18 을 남기지 않는다** — 재기동 뒤 늦게 나간 08:30 발사(복원분)와 15:30 기한 발사도 남기지 않는다.
profile 4 의 머리 행(kind 18)은 08:30 정상 회차 하루 1건 그대로다 — 계약 변경 없음, 정보 공유.

**ⓕ 77 `QueuedWindowState` 말미 `g2_queue_open` · `g3_queue_open`(bool, vtable 16 · 18)과 `DirectOrderReq.krx_session` 새 값 `"G2Q"` · `"G3Q"`** — relay 는 쓰지 않는 면이다(클라 라벨 · 상따창 예약 표식). 정보 공유.

판정기가 걸린 파일(`radar-contract-check.sh` → `계약 변경 2파일`, 49-02 · 49-04):

```text
server/docs/protocol.md
server/src/protocol/StockDMA.fbs
```

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

1. **relay 생성물 재동기화** — `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`(77 말미 두 필드 추가 · 44/94 주석). 서버 동작에는 영향 없다(구 relay 는 모르는 필드 · 행을 무시한다).
2. **DB 매핑 `4 → 'G2'`** — 발사 저널 kind 17/18 profile 4 를 'G2' 로 투영. **첫 실발사 전에** 넣어 주고, **넣으면 바로 회신해 달라**(정식 노트 전이라도 SendMessage 로).
   gh-trade 는 그 회신을 확인하기 전에는 08:30 스위치(`g2_queue_enabled`)를 켜지 않는다(D-19). 15:30 스위치는 kind 17/18 을 만들지 않아 이 조건과 무관하다.
3. **어드민 화면 08:30 칸** — (profile "G2", market K/Q) 한 값 입력 · 범위 −3,000 ~ +20,000µs · 기준 08:30:00.000000 · 94 에 G2 행이 없으면 「이 서버는 08:30 발사를 모름」 으로 표시. 화면이 붙기 전에는 gh-trade 가 `log/launch_plan.toml` `[g2]` 를 고쳐 재기동으로 바꾼다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 구 relay 는 94 의 모르는 G2 행을 warn 1줄 뒤 버리고(행 수 · 인덱스를 가정하지 않는다, D-18), 08:30 스위치가 꺼진 동안은 94 가 종전 네 행 바이트 그대로이며 kind 17/18 profile 4 도 생기지 않는다. 77 말미 두 필드는 구 relay 가 읽지 않는다. 다만 **08:30 스위치를 켜는 것(첫 profile 4 저널 발생)은 DB 매핑 회신 뒤**다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 어드민에서 G2/K 값을 저장하면 서버 로그 `[Launch] 발사 계획 변경 profile=G2 market=K 0us → …us rev=…` 와 감사 줄 `[Gateway] admin op=8 user=G2/K … code=0` 이 찍힌다
- op 9 응답 94 의 행 수 — 08:30 스위치 켠 서버 6행(말미 G2/K · G2/Q) · 꺼진 서버 4행
- 첫 운영일 08:30 뒤 kind 17 profile 4 · exchange KRX · expected_cum 83000000 행이 그 서버 예약 건수만큼, kind 18 은 시장마다 1행

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

1. 08:30 「너무 이른」 거부 코드는 아직 미실측이다(D-19). 정각(0µs)에 쏘므로 첫 운영일에 거부가 나올 수 있다 — 코드가 101 이 아니면 첫 운영일 뒤 따로 알린다(gh-radar 는 queue_case 2 에서 515/E127 이 아니면 '101' 로 푼다고 들었다 — 그 풀이로 문제가 없는지).
2. DB 매핑 `4 → 'G2'` 를 넣는 시점 — 넣으면 회신 부탁(위 「할 일」 2).
