---
status: done
from: gh-trade
from_commit: 5a4d4a90
from_branch: master
date: 2026-10-30
fbs_sync_marker: 55e62638
done_commit: 030e39d2
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-30

gh-radar 요청 `docs/inbox/from-gh-radar/261030-launch-tail-probe-kind17.md`(gh-trade) 처리 완료 노트다.

## 바뀐 것

와이어(.fbs) 무변경. kind 17 LaunchPiece 의 **값 의미만** 늘었다 — 16:00 뒤쪽 탐침(quick-261029-st7)을 보낸 발마다 kind 17 1건이 나간다.

- `round`(ev_price) = **−2** = 뒤탐침 (−1 앞쪽 탐침 · 0+ 실조각 그대로). −2 는 그전까지 쓰인 적 없는 값이다.
- `probe`(has_remaining) = true · `piece_idx` = i(0·1·2) · `wire` = 그 시장 실조각 wire 수 + i
- 나머지 칸은 요청 노트 ① 표 그대로(sent_rel_us · planned_us · result 1~4 · rc 원문 · accept_time 이 로그 `[Launch] 뒤탐침 행` 과 같은 변수에서 나온다)
- 순서: 실조각 17 → 뒤탐침 17 → 18 (같은 스레드라 seq 로 보장)
- **kind 18 무변경** — n_pieces · n_accepted · gate_lo/hi 는 실조각만

커밋: 2df15cba(코드·테스트) · 8681cc6f(protocol.md · queued-order.md 문서). `server/docs/protocol.md` 80·82 행에 「round −2 = 뒤탐침」 한 줄.

판정기가 걸린 파일:

- server/docs/protocol.md (문서 한 줄 — 와이어 무변경)

## gh-radar 가 할 일

- `sync-relay-schema.sh` 불필요. relay 파서 · DB 변경 없음(요청 노트대로 기존 `probe` · `round` 열로 받는다).
- 웹: 뒤탐침 표식 · `기타` 탐침 처리(요청 노트에서 말한 것). rc `E127`(교보 조기 도착)은 경계 「열림」 증거에서 빼기로 한 합의 그대로.
- **10/30 백필 없음** — 아래 배포 시각 참고.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 이미 배포됐다. 120 · 119 모두 `v1.0-1131-g290bf719`(2df15cba 포함)로 10/30 16:00 전에 재기동(119 15:08 · 120 15:16 KST). 121 은 무접촉.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

10/30 16:00 서버 로그 실측(`grep '뒤탐침 행' log/stock-dma.log`) — relay 적재 `round = -2` 행과 이 표를 대조하면 된다. 시장별 3발 모두 송신됨, 총 12행.

| 게이트웨이 | 시장 | i | sent_rel_us | 결과 | rej |
|---|---|---|---|---|---|
| KB120 | K | 0 · 1 · 2 | −260 · −250 · −240 | 접수 · 접수 · 접수 | — |
| KB120 | Q | 0 · 1 · 2 | −324 · −314 · −304 | 접수 · 접수 · 접수 | — |
| KYOBO119 | K | 0 · 1 · 2 | −360 · −350 · −340 | **101** · 접수 · 접수 | `0101` |
| KYOBO119 | Q | 0 · 1 · 2 | −470 · −460 · −450 | 접수 · 접수 · 접수 | — |

- 서버 요약 줄: 120 K `last_piece_rel_us=-270 개시_rel_us=-260` · 120 Q `-334 / -324` · 119 K `-370 / -350` · 119 Q `-480 / -470`.
- 오늘 rc 는 접수 · 101 뿐 — 가격 거부 · E127 · 그 밖의 기타 거부는 **0건**. 추가 「열리기 전 기타 거부」 코드는 아직 관측 없음.
- kind 18 당일 `n_pieces` 는 실조각 수 그대로여야 한다(탐침 미포함). `wire` 가 그 시장 실조각 다음 번호부터인지 relay 쪽에서 확인 부탁.

## 질문

없음. 표와 relay 적재가 어긋나면 이 노트에 적어 달라.

## gh-radar 대조 결과 (2026-10-30 16:05 · 메인 세션)

어긋남 없음. 원격 `launch_pieces` / `launch_heads`(trade_date 2026-10-30 · fire_base 16:00) 와 위 표를 대조했다.

- `probe = true AND round = -2` 행 12건 — 4 시장 × 3. `sent_rel_us` · 결과 · rc(119 K i=0 `0101`) 가 표와 모두 같다.
- `wire` — 실조각 다음 번호부터(KB120 6·7·8 · KYOBO119 3·4·5). 실조각 PK 와 겹침 없음.
- kind 18 `n_pieces` — KB120 6 · KYOBO119 3(실조각만, 탐침 미포함).
- 지도 RPC `launch_map_for_admin('q16', 1)` 응답에 probe · round · result_code 가 실린다(20261030210000).
- 경계(shared `launchDaysOf`) — 서버 요약 줄의 개시 시각과 같다: 120 K lo −270 · hi −260(실조각만이면 hi 없음) · 119 K lo −360 · hi −350(실조각만이면 lo −370 · hi 없음). Q 는 실조각 첫 발이 이미 접수라 탐침이 경계를 바꾸지 않는다.
- gh-radar 처리 커밋: 0985ae82 · 7df7ff75 · 030e39d2(quick-261030-dz7).
