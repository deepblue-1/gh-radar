# 261104-n7i — 발사 주문 대기열 당일 자동 계산(launch-live) — 결정 · 사실

사용자 요청(2026-11-04): 「4시 주문과 9시 30초 주문 내역의 대기열이 안 보여」 → 「주문 넣고 바로 확인하고 싶어」.

## 원인(진단 완료 · 2026-11-04 16:40 KST)

- 대기열 값(`launch_piece_queue`)은 quick 261103-pei 가 tick-convert **nightly(23:30 · 01:30 KST)** 에서만 계산한다.
  당일(오늘) 조각 79개는 전부 `queue: null` → 웹 「—」. 지난 날짜(10/26~11/03)는 값이 저장돼 있다(nightly · backfill-launch 로그).
- 웹 · server · RPC(`launch_orders_for_admin` 의 조각 `queue`)는 정상이다. 원본 업로드가 밤(22:00~23:14 KST)이라 nightly 는 그 전에 계산할 수 없다.

## 결정 (locked)

- **D-1 당일 계산 시점 = 정해진 시각 자동(사용자 선택 · 2026-11-04).** 평일 16:01 · 16:03 · 16:10 KST(16:00 Q16)와
  09:01 · 09:03 KST(09:00:27/29 A · 09:00:30 N). 화면 버튼 · 사용자 트리거는 하지 않는다(호출량은 사용자 수와 독립).
  정확한 시각 목록은 리서치가 tickgw 로딩 시간을 보고 조정해도 된다(근거를 남길 것).
- **D-2 계산 한 벌 유지(pei D-3).** shared `launchQueueOf` 를 그대로 쓰고, 워커(tick-convert 새 모드 — 가칭 `launch-live`)가 계산해
  `launch_piece_queue` 에 저장한다. 웹 · server 는 지금처럼 읽기만 한다. 브라우저 계산 금지.
- **D-3 당일 원본 = radar-gw tickgw** `/internal/ticks/live`(당일 원본 zstd 바이트 · 08:00 부터 · 5초 폴링 · 리스 30초 ·
  MAX_KEYS 8 · LIVE_MAX_BYTES 8MiB 분할 · X-Tick-More 로 이어 받기). 승격 Job(promote)이 이미 tickgw 에 닿는다(VPC · TICKGW 비밀).
- **D-4 밤 계산이 덮어쓴다.** 당일 값은 정본 격자가 아닌 표식(object_path)으로 저장해 nightly 의 `launch_queue_pending` 이
  그날 격자로 다시 계산하게 한다. 당일 값이 nightly 값을 덮어쓰면 안 된다(당일 Job 이 늦게 돌아도).
- **D-5 16:00 「마감 앞」 의 뜻.** 당일 계산 시점엔 세션이 끝나지 않았다 → 「계산 시점 기준 지금 앞 남은(추정)」 이 된다.
  화면에 계산 시각(computed_at) 또는 「당일 추정」 표기가 필요한지 리서치가 판단하고, 필요하면 최소 표기로 넣는다
  (웹 변경은 launch-orders-tab · launch-format 범위 안 · 목업 없이 가능한 한 줄 수준만).

## 리서치가 확인할 위험

- tickgw MAX_KEYS 8 vs 당일 발사 (ISIN, 거래소) 수(11/04 조각 79개) — queued 상태 처리, 첫 touch 시 08:00 부터 하루치 로딩 시간.
- 틱뷰어 사용자와 키 경합(리스 · LRU) — 우리 Job 이 틱뷰어를 밀어내지 않게.
- 09:00 런 계산에 필요한 우리 체결(`dma_journal_events` 'E')이 09:01 에 이미 들어와 있는지(`launch_queue_inputs` 가 당일에 동작하는지).
- 16:00 Q16 짝짓기는 우리 조각 B6 가 16:00:00.09 무렵 — 16:01 이면 충분한지. 접수 때 값은 그 뒤 바뀌지 않는다.
- request Job / promote Job 과 같은 Cloud Run Job 이미지 · VPC egress · TICKGW_URL/비밀 재사용 방법, Scheduler 추가(`scripts/deploy-tick-convert.sh`).
- `launch_queue_set` 의 「격자 경로가 지금 격자와 같거나 null 일 때만」 가드가 당일 표식 행을 받는지 · nightly 가 덮어쓰는지.

## 범위 밖

- 배포(db push · Job 재배포 · Scheduler 생성)는 메인 세션이 한다 — executor 는 커밋까지(서브에이전트 배포 금지).
- 화면 버튼 · 실시간 갱신(웹 폴링) · tickgw 코드 변경(가능하면 피한다 — 필요하면 리서치가 근거와 함께 제안).
