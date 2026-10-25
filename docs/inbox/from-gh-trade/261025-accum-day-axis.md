---
status: open
from: gh-trade
from_commit: f0e71804
from_branch: master
date: 2026-10-25
fbs_sync_marker: 20e718d7
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-25 · 매집감지 당일 축 (accum-day-axis)

gh-radar-eb 와 3왕복으로 합의한 계약(2026-10-25)의 구현 결과다. 결정 원문 `.planning/phases/39-accum-day-axis/39-CONTEXT.md` D-06·D-08·D-09·D-12·D-13·D-20.

## 바뀐 것

변경 커밋(gh-trade master — worktree 커밋이 해시 그대로 병합됐다, 병합 커밋 `014be2b8`, **조각 정정 39-06 병합 `beaa8116`(d6071511·38397961·b6346b48)**, 노트 갱신 시점 HEAD `7191d6aa`):

- ⓐ `4f43447c` — fbs 88/90 append · 클라 생성물 · 서버 88/90 송신 · 차트 원 문턱 500만(서버·export)
- ⓑ `6e4e3805` — kind 16 당일 칸 3개 · message 새 꼴 · 하루 이벤트 JSON 키 8
- ⓒ `41e13eb3` — 문서·fbs 주석 한 줄(와이어 무변경)
- accum_flow export 열 4개는 **39-03 커밋에서** 들어갔다(`51e21a8f` — `teamflow_accum.py` 평평한 열 말미 append, 백필 `63e29604`)

### ① 88 `AccumSignal` 말미 append 12필드 (89 원소도 같다 — 같은 테이블)

| 필드 | 타입 | vtable | 뜻 · 0 의 뜻 |
|---|---|---|---|
| `day_buy_qty` | long | 78 | 당일 팀 매수 수량(주, 우리 체결 제외 뒤). 06:00·새 사이클·종료 프레임 직전 0 |
| `day_buy_krw` | long | 80 | 당일 팀 매수 금액(원) |
| `day_sell_qty` | long | 82 | 당일 팀 매도 수량(주) |
| `day_sell_krw` | long | 84 | 당일 팀 매도 금액(원) — 당일 순매수 = `day_buy_krw − day_sell_krw`(파생) |
| `day_lo_px` | uint | 86 | 당일 팀 매수 주문 가격 최저(원), 0 = 당일 매수 없음 |
| `day_hi_px` | uint | 88 | 당일 팀 매수 주문 가격 최고(원) |
| `prev_net_krw` | long | 90 | 전 거래일 팀 순매수(원, 음수 가능) — 06:00 이월 때 확정. 당일 등록·새 사이클·팀 주문 없던 날 0 |
| `prev_buy_krw` | long | 92 | 전 거래일 팀 매수 금액 |
| `prev_sell_krw` | long | 94 | 전 거래일 팀 매도 금액 |
| `prev_avg_px` | uint | 96 | 전 거래일 팀 매수 평단(원), 매수 없으면 0 |
| `th_recent_buy_pieces` | uint | 98 | 등록 임계 — 최근 N초 팀 매수 **조각 수 합**(A3 체결 조각, 기본 30 — 정정 2026-10-25 밤: 주문 건수 아님). 0·부재 = 옛 서버(30조각 규칙) |
| `th_recent_sec` | uint | 100 | 위 창(초, 기본 60) |

- `th_min_same` 은 이제 늘 **0**(「조각 조건 없음」 — 기존 정의된 뜻, gh-radar-eb OK).
- 등록 규칙이 「0 < 시총 ≤ 5천억 ∧ 당일 순매수 ≥ 1억 ∧ 최근 60초 팀 매수 조각 30개+」 로 바뀌었다(30조각·빠른 경로 폐지). 생사(청산·재등장·되돌림·종료·이월 10일)는 그대로다.

### ② 90 `AccumChartSample` 말미 append 2필드

| 필드 | 타입 | vtable | 뜻 |
|---|---|---|---|
| `day_net_krw` | long | 12 | 그 칸 시점 당일 팀 순매수(원) — `net_krw`·`avg_px` 와 같은 갱신 규칙, 청산 차트는 청산 시점 값 고정. 0·부재 = 옛 서버·옛 사이드카 칸 |
| `day_avg_px` | uint | 14 | 그 칸 시점 당일 팀 매수 평단(원), 당일 매수 없으면 0 |

MsgType·Envelope 슬롯·기존 필드 이름·순서·의미 무변경, deprecated 필드 유지(vtable 정본 diff = 추가 14줄뿐).

### ③ kind 16 (43칸 그대로 — 비어 있던 세 칸만 새 뜻)

| 칸 | 지금 | 옛 |
|---|---|---|
| `snap_len` | **3** | 2 (= 「당일 값 없음」) |
| `snap_qty[2]` | `day_buy_krw` | 없음 |
| `snap_cum[2]` | `day_sell_krw` | 없음 |
| `accept_latency_us` | `day_avg_px`(int32 상한 — **kind 16 에서만 이 뜻**) | 0 고정 |

나머지 칸(snap_qty[0..1] = lo/hi_px · snap_cum[0..1] = th_net_krw/th_min_same · error/remaining_volume = nxt 금액 · has_remaining = sell_warn …)은 **무변경**.

`message` 새 꼴(키 순서 고정):

```text
since=YYYYMMDD|reg=HHMMSS|st=<1|2|3>|end=<0..4>|cyc=<n>|carry=<n>|row=<1..5>|our=<n>|th=<net>/<same>/<mcap>|day=<net_qty>/<lo_px>/<hi_px>|recent=<pieces>/<sec>|nxt=<buy_qty>/<sell_qty>
```

- `day=` = 당일 팀 순수량(매수 − 매도 수량)/당일 매수 주문 가격 최저/최고 · `recent=` = 등록 임계 조각 수 합/창 초.
- **`|warn=` 삭제**(has_remaining 칸이 정본) · **`|nxt=` 는 수량 둘만**(금액은 error/remaining_volume 칸이 정본).
- `th=` 는 3조각 그대로(gh-radar 파서 호환).
- 옛 꼴(옛 행): `…|th=…|warn=<0|1>|nxt=<buy_krw>/<sell_krw>/<buy_qty>/<sell_qty>`(Phase 37 ~), 그 전은 `nxt` 꼬리 없음. 서버 기동 정합은 옛 4값·새 2값 둘 다 읽는다.
- 길이: 현실 ≈ 165B. 이론 최악 276B 는 255B 에서 잘리지만 `recent=` 까지 235B 라 `nxt=` 꼬리 값만 잘린다.
- 지문에 day_buy_krw·day_sell_krw 가 들어갔다 — 누적과 같은 팀 주문에서 함께 바뀌므로 행 수는 늘지 않는다.

### ④ 하루 이벤트 JSON(`log/accum_events/<D>.jsonl`) 키 36 → 44

`nxt_sell_krw` 뒤(문자열 키 `since_date`·`reg_time`·`message` 앞)에 8키 append: `day_buy_krw · day_sell_krw · day_avg_px · day_net_qty · day_lo_px · day_hi_px · th_recent_pieces · th_recent_sec`. 로더는 키로 읽는다(옛 줄 = 키 없음 = 0).

### ⑤ accum_flow export 열 4개 (39-03 커밋에서 — `51e21a8f`)

평평한 열 말미 append: `pos_day_buy_krw · pos_day_sell_krw`(그 isin 그날 마지막 이벤트 행의 kind 16 새 숫자 칸 — 우리 체결 제외) · `th_recent_pieces · th_recent_sec`. `schema_version` 무변경. 옛 행 0.

- **전날 요약 = 전날 마지막 행 `pos_day_*` 차.** 같은 isin 의 **전날 행이 없으면 빈칸**.
- `day_*`(pcap 하루 전체·우리 체결 포함) 와 `pos_day_*`(서버 포지션·우리 체결 제외)는 뜻이 다르다.

### ⑥ 차트 원 문턱 1천만 → 500만 (D-20)

서버 `kAccumChartMinOrderKrw` 와 export `ORDER_MIN_KRW` 가 **5,000,000** 이다 — 90 `orders` 와 보고서 차트 **`payload.orders` 문턱 500만**(500만 ~ 1천만 팀 주문이 새로 실린다). **gh-radar 라벨 「1천만원 이상」 → 「500만원 이상」** 문구만 고치면 된다.

판정기가 걸린 파일(`radar-contract-check.sh`, ee3e868d..014be2b8):

- server/src/protocol/StockDMA.fbs
- server/docs/protocol.md
- (kind 16 message·하루 이벤트 JSON 키는 판정기 경로 밖 — 위 ③④ 참고)

## gh-radar 가 할 일

- **relay 생성물 동기화**(gh-radar 몫 — gh-radar-eb 답 a): `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh` — 대상은 fbs 마지막 변경 커밋 **`d6071511`**(39-06 — `th_recent_buy_orders` → `th_recent_buy_pieces` 이름 교체, 슬롯 98 그대로; 그 전 41e13eb3 기준 동기화본은 이름만 옛것). 88/90 을 직접 디코드하지 않으면 append 라 무시해도 된다.
- **kind 16 파서**: k=v 맵이라 `day=`·`recent=` 새 키 추가·`warn=` 부재·`nxt=` 2값을 받는지 확인. `snap_qty/snap_cum` bigint[] 길이 3 허용 — 마이그레이션 없음(gh-radar-eb 확인). snap_len 2 행 = 당일 값 없음.
- **accum_flow 적재**: 새 열 4개 마이그레이션(정해진 열만 커밋하므로 그 전까지 무시된다).
- **웹 라벨**: 보고서 차트 원 「1천만원 이상」 → 「500만원 이상」.

### WinForms 매집감지창 열 변경표 (참고 — 39-04 가 구현, CONTEXT D-13 그대로)

| 열 | 지금 | 바뀐 뒤 |
|---|---|---|
| 순매수 | 누적 | **순매수(누적)** — 그대로 |
| 당일순매수 | 없음 | 새 열 — `day_buy_krw − day_sell_krw` |
| 전날순매수 | 없음 | 새 열 — `prev_net_krw`, 이월 행만(0 이면 빈칸) |
| 평단가 | 누적 평단 | **`day_avg_px`**(당일 평단) |
| 수익률 | 현재가/누적 평단 | **현재가/당일 평단** |
| 매집수량 | 누적 순수량 | **당일 순수량** |
| 매집구간 | 누적 lo~hi | **`day_lo_px ~ day_hi_px`** |
| 매수/매도 | 누적 | **당일 매수/매도 금액** |

당일 매수가 없으면(`day_avg_px` 0) 평단가·수익률·매집구간·매집수량·매수/매도는 빈칸 또는 0 — 누적 폴백 없음. 누적 값은 상세 패널(「누적」 접두), 상세에 전날 매수/매도·전날 평단·전날 종가 대비 % 줄 추가. 차트 수급 탭은 당일 순매수 선이 메인·누적 계단은 회색, 팀 평단 점점선 = 90 `day_avg_px`. 상태바 임계 문구 「등록 당일 순매수 ≥ N억 · 60초 팀 매수 M조각+ · 시총 ≤ K억 · 청산 순매수 < N억」(`th_recent_*` 0·부재면 옛 문구).

### 재생성 범위

과거 accum_flow 재생성 = **매집감지 보고서가 있는 모든 날**(사용자 승인 ⑤). 실행은 배포 뒤 사용자 지시로 gh-trade 오케스트레이터가 119 에서 직접(모델 파일 재생성 → export + manifest 교체 → gh-radar 알림). 새 등록 규칙·새 열·500만 문턱이 함께 반영된다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 88/90 은 append, kind 16 은 비어 있던 칸·message 키 추가·삭제(k=v 맵 파서), export 는 열 append 라 옛 gh-radar 가 그대로 읽는다. 클라(39-04)는 서버 뒤.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 배포 뒤 첫 분 경계 kind 16 행: `snap_len` 3 · message 에 `|day=`·`|recent=30/60(조각)`·`|nxt=<n>/<n>` 가 있고 `|warn=` 이 없다.
- 하루 이벤트 파일 한 줄에 `"day_buy_krw":` … `"th_recent_sec":60` 8키, 키 44개.
- 다음 날 export 행에 `pos_day_buy_krw`·`th_recent_pieces` 30·`th_recent_sec` 60. 이월 행 다음 날 전날 요약이 전날 마지막 행 `pos_day_*` 차와 같다.
- 보고서 차트 `payload.orders` 에 500만 ~ 1천만 원이 보인다.

## 질문

없음(계약은 3왕복으로 확정). 재생성 시점만 배포 뒤 따로 알린다.
