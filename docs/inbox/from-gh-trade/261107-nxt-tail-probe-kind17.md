---
status: open
from: gh-trade
from_commit: 129a354c
from_branch: master
date: 2026-11-07
fbs_sync_marker: 8e0c1417
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-07

## 바뀐 것

**와이어(.fbs) 무변경 · MsgType 무변경 · 칸 재해석 범위 확장만**이다(quick-261107-kee). kind 17 LaunchPiece 의 round −2(뒤탐침) 행이 두 군데로 늘었다.

1. **16:00 뒤탐침 3발 → 5발** — 시장(K/Q)마다 마지막 실조각 계획 시각 + 10 · 20 · 30 · 40 · 50µs. kind 17 round −2 행이 시장당 최대 3 → **5행**,
   wire = 그 시장 실조각 수 + 0..4. 값 규칙(profile 1 · exchange KRX · queued_id = 대상 매수 예약 Q-ID · result/rc 등)은 종전 그대로다.
2. **09:00:30 'N'(개장차익 NXT) 뒤탐침 신규** — 'N' 레인(K/Q)마다 실조각을 실제로 보낸 회차에 실조각 **뒤** NXT · G1 · IOC · 매수 1주 하한가 최대 5발.
   kind 17 round −2 행 값(gh-radar-3d 와 합의한 그대로):
   - `profile`(cond_metric) = **3** · `fire_exchange`(exchange) = **"NXT"** · `round`(ev_price) = **−2** · `probe`(has_remaining) = **true**
   - `queued_id`(message `q=`) = **"N"** · `piece_idx` = 발 i(0..4)
   - `wire`(entry_round) = **그 회차 'N' 실조각 kind 17 행 수 + i** (실조각 축을 이어 감)
   - `result`(queue_case): 교보 **E127 은 515 로 접혀 result 2**(result_code 515 · `rc=` 원문 E127) · KB 515 도 result 2 ·
     **IOC 접수(뒤이은 IOC 잔량 취소 통보 포함)는 result 1** · 기타 거부 3 · 무응답 4
   - `fire_base` = 그 'N' 회차 090030000(실조각과 같은 값) · `sent_rel_us`/`planned_us` 는 같은 게이트 초 기준 rel µs
     (planned_us = 마지막 실조각 송신 rel + (i+1)·10µs)
   - side B · price = 그 종목 하한가 · qty 1 · retry 0 · abandoned 0 · account/user = 첫 'N' 조각 계좌
   - push 순서: 실조각 17 → 뒤탐침 17 → 18 (같은 발사 스레드). 'N' 은 기록 시각(첫 송신 + 5s)에 한꺼번에 나간다.
3. **kind 18 LaunchHead 무변경** — n_pieces 등은 실조각만 센다.
4. PK 그대로 = (trade_date, gateway, profile, fire_exchange, fire_base, market, wire) — 'N' 뒤탐침 wire 는 실조각 다음 번호라 충돌 없음.
5. 서버 설정: `[queued_order] tail_probe_count` 0..5(기본 5) · `[open_arb] nxt_tail_probe_count` 0..5(코드 기본 0) — 120 · 119 · 112 둘 다 5. 'A' 레인은 뒤탐침 없음.

## gh-radar 가 할 일

- `sync-relay-schema.sh` 재동기화 **불필요**(.fbs 무변경) · relay 파서 · DB 마이그레이션 **불필요**로 본다(칸 · 타입 · PK 그대로).
- **웹 「발사 경계 지도」**: 점·툴팁·경계 계산은 지금 코드 그대로 profile 3 round −2 행을 그린다(gh-radar-3d 확인). 남은 일은 범례의 「뒤탐침」 삼각형 견본이 `fire === 'q16'` 일 때만 나오는 것(webapp launch-map-tab.tsx:407)을 N 패널에도 보이게 푸는 것 하나.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경, 옛 relay/웹도 새 행을 그대로 저장하고 점까지 그린다 — 범례 견본만 N 패널에 없다.

## 확인 방법

- 서버 로그: 16:00 `[Launch] 뒤탐침 market=K n=5 sent=5 …` · 09:00:30 `[Launch] 뒤탐침 무장 market=K key=N n=5 …` · `[Launch] 뒤탐침 행 market=K key=N …` ·
  요약 `[Launch] 뒤탐침 market=K key=N n=5 sent=5 … 515=…` · IOC 접수면 `[Launch] 뒤탐침 IOC 접수 market=K key=N … cancel=IOC`.
- DB: kind 17 profile 3 · round −2 · exchange NXT · queued_id "N" 행이 레인당 최대 5개, wire 가 그 회차 'N' 실조각 행 수부터 연속. 16:00 profile 1 round −2 는 시장당 5개.
- 웹: 「발사 경계 지도」 'N' 쪽에 뒤탐침 점 5개가 실조각 뒤 +10 ~ +50µs 에 찍힌다.

## 질문

없음 — gh-radar-3d 확인 내용(16:00 3 → 5발 값 규칙 무변경 · 'N' profile 3 · NXT · round −2 · probe true · wire = 실조각 수 + i · E127 → 515 result 2 · IOC 접수 result 1 · kind 18 실조각만 · PK 무변경)대로 구현했다.
