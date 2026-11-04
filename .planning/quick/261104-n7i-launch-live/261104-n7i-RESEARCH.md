# Quick 261104-n7i: 발사 대기열 당일 자동 계산(launch-live) — Research

**Researched:** 2026-11-04
**Domain:** tick-convert 워커 새 모드 · tickgw live 계약 · launch_piece_queue RPC 가드 · 주문 내역 칸 문구
**Confidence:** HIGH(코드 경로 · 계약) / MEDIUM(키 수 · 로딩 시간 추정)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- 시각 목록 미세 조정(근거 필요) · 화면 표기 필요 여부와 최소 문구 · tickgw 변경 필요 여부 판단.

### Deferred Ideas (OUT OF SCOPE)
- 배포(db push · Job 재배포 · Scheduler 생성)는 메인 세션이 한다 — executor 는 커밋까지(서브에이전트 배포 금지).
- 화면 버튼 · 실시간 갱신(웹 폴링) · tickgw 코드 변경(가능하면 피한다 — 필요하면 리서치가 근거와 함께 제안).
</user_constraints>

## Project Constraints (from CLAUDE.md · 메모리)

- 호출량은 사용자 수와 독립(고정 스케줄 배치만) — 이 모드는 Scheduler 고정 시각 · 사용자 트리거 없음 → 부합.
- 이번 원본은 스크래핑 source 가 아니라 **우리 tickgw 캐시(gh-trade 119 피드)** 다 — 5원칙 대상 밖. 다만 tickgw 자체 규율
  (119 동시성 전역 1 · 활성 8키 · 차단 신호를 재시도로 두드리지 않음)을 지킨다.
- 새/교체 RPC 는 `REVOKE … FROM PUBLIC` + `REVOKE … FROM anon, authenticated` 명시 + `GRANT … TO service_role`(메모리 규칙).
- 무로그 fail-safe 금지 — 키 실패 · 미룸 · set 거부 수를 모두 로그로 남긴다.
- 서브에이전트 배포 금지 — executor 는 커밋까지. 보안 리뷰 생략(security_enforcement=false) · nyquist 유지.
- 작업은 master · 동시 세션이면 vitest `--maxWorkers=2`.

## Summary

당일 바이트를 얻는 길은 이미 다 있다. tickgw `/internal/ticks/live` 는 원본 zstd 프레임을 offset 커서로 내주고
(`tickgw/src/server.ts:183-222`), 그 바이트를 promote 의 `decompressFrames`(`workers/tick-convert/src/modes/promote.ts:132-136`)로 풀면
`<IIII>`+payload 레코드 열이 나온다. 그 열이 nightly 가 `gridLaunchOf(raw, …)` 에 넘기는 것과 같은 모양이다(`nightly.ts:414-421` ·
`grid-file.ts:2,61`). 그래서 shared `launchQueueOf` 를 **수정 없이** 당일 바이트에 돌릴 수 있다. 다만 워커에 live 클라이언트는 없다.
`tickgw-export.ts` 는 export(20:01 뒤 closed 키만) 전용이라 16:01 에 쓸 수 없다(`tickgw-export.ts:4-11` · `server.ts:163-171`).
그래서 작은 `tickgw-live.ts` 를 새로 둔다. 웹 `use-tick-live` ② 의 하루치 받기 루프(loading/queued 면 2초 뒤 이어 받기 · More 면 바로)를
워커판으로 옮긴 것이다.

DB 쪽은 그대로 두면 동작하지 않는다. `launch_queue_set` 의 가드는 `object_path IS NULL OR 지금 tick_grids 경로와 같음` 이다
(`20261104200000_launch_piece_queue.sql:195-198`). 그래서 `live:` 표식 행은 **버려진다**. ON CONFLICT 도 조건 없이 덮어쓴다(`:199-215`).
그러면 늦게 돈 live 가 nightly 값을 덮을 수 있다. 작은 마이그레이션 하나로 `launch_queue_set`(live 표식 허용 + live 는 live 위에만 ·
표식 시각 단조 증가 · 오늘 날짜만)과 `launch_orders_for_admin`(queue 에 `live_as_of` 한 칸)을 CREATE OR REPLACE 한다.
`launch_queue_pending` 은 고칠 필요가 없다 — 격자가 생기면 live 행은 `stale`(경로 불일치)로 잡힌다(`:261`). nightly 는 pending 과 상관없이
그날 발사 키를 모두 다시 계산해 덮는다(`nightly.ts:358-370,414-428,482-491`).

**Primary recommendation:** 새 Job `gh-radar-tick-convert-launch-live`(promote 와 같은 이미지 · VPC · 비밀, `--args=launch-live`)와
Scheduler 2개(`1,3,10 16 * * 1-5` · `1,3 9 * * 1-5` Asia/Seoul)를 둔다. 모드는 fire_base 가 최근 45분 안인 조각의 (isin, 거래소)만
우리 리스 동시 4키 이하로 받는다. as-of 가 fire_base+20초를 넘은 키만 계산하고 `object_path = 'live:<as-of ISO>'` 로 저장한다.
화면은 live 행이면 둘째 줄의 「마감」 을 「HH:MM 기준」 으로 바꾼다.

## 1. 데이터 경로 — tickgw live → launchQueueOf

| 사실 | 근거 |
|---|---|
| live 계약: `GET /internal/ticks/live?isin&ex&epoch&offset` · 헤더 `X-Tickgw-Secret` · 날짜 = tickgw KST 오늘 · 요청마다 `poller.touch` | `tickgw/src/server.ts:6-23,183-194` |
| 409 `{epoch}` = epoch 불일치 · epoch 없이 offset>0 · offset>끝 → offset 0 부터 다시 | `server.ts:199-201` |
| 503 `CACHE_UNAVAILABLE` (엔트리 없음) | `server.ts:196` |
| 응답 헤더: Epoch · Offset-End · Last-Recv-Ns · State(loading/ready/queued/delayed/blocked) · Queue · Complete · More · As-Of-Ms | `server.ts:206-219` |
| 본문 상한 8MiB(청크 경계) · 더 있으면 More=true 이고 state 를 loading 으로 낸다(queued 는 그대로) | `server.ts:80,202-205` |
| 헤더 이름 상수 `TICK_LIVE_HEADERS`(shared — 워커도 import 가능) | `packages/shared/src/tick-api.ts:203-214` |
| 풀기 = `splitZstdFrames` 후 프레임마다(Node zstd 는 첫 프레임만 푼다) — `decompressFrames` export 있음 | `promote.ts:131-136` |
| `launchQueueOf(buf, ex, date, pieces)` 입력 = **풀린 레코드 바이트**(`buildTickIndex(buf, …)`) · 한 ISIN · 다른 거래소 조각은 null | `packages/shared/src/ticks/launch-queue.ts:452-460,644-668` |
| 워커 래퍼 `gridLaunchOf(raw, ex, date, pieces, {date,isin,mode,objectPath})` — throw 안 함 · 이상값 · 실패 로그 · `LaunchSetRow[]` | `workers/tick-convert/src/launch-queue.ts:56-103` |
| 입력 RPC `meta.launchInputs(date)` · 저장 `meta.launchSet(rows)`(쓴 행 수 반환) | `workers/tick-convert/src/meta.ts:229-238` |

**재사용 가능 여부:** export 클라이언트(`tickgw-export.ts`)는 closed 키 전용이다. `/export/bytes` 는 closed 가 아니면 404 `NOT_CLOSED`
(`server.ts:171`)라 16:01 에 못 쓴다. 비밀 헤더 · URL 가드(`config.ts:43-71` `checkTickgwUrl` · `requireTickgw`)와 fetch 주입 패턴은
그대로 따른다. `requireTickgw` 오류 문구가 "promote:" 로 박혀 있으니(`config.ts:69`) 모드 이름을 넣도록 일반화한다.
`loadConfig` 의 `noArchive`(`:88`) · `requireTickgw` 호출(`:92`)에 `launch-live` 를 더한다.

**키 하나 받기 루프(권장 · `tickgw-live.ts`):**

```
offset=0, epoch=undefined, parts=[]
loop until deadline:
  r = GET live(isin, ex, offset, epoch)
  401 → throw(run 실패 — 비밀/배포 문제) · 503/5xx/네트워크 → 그 키 failed(로그)
  409 → epoch = body.epoch, offset = 0, parts = []   (재기동 · 엔트리 교체)
  200 → parts.push(body); offset = X-Tick-Offset-End; epoch = X-Tick-Epoch
        More=true            → 곧바로 다음 요청(대기 없음)
        state loading|queued → 2초 뒤 이어 받기(웹 TICK_LIVE_LOADING_MS 와 같은 값) — 요청 자체가 리스 갱신
        state delayed        → 2초(또는 5초) 뒤 다시 — 데드라인까지
        state blocked        → 그 키 포기(너무 큼 · 인자 오류 · 로그 error)
        state ready          → Complete=false 면 그 키 미룸(warn · 구멍 있는 하루) ·
                               asOf(=X-Tick-As-Of-Ms, 없으면 Last-Recv-Ns/1e6) − 2초 < need 면 2초 뒤 다시 · 아니면 끝
deadline 초과 → 그 키 deferred(warn · 행 없음 · 다음 run 이 잡는다)
raw = decompressFrames(concat(parts))
```

`need` = 그 키 조각 fire_base 중 가장 늦은 것(KST ms) + 20초다. 16:00 우리 B6 증가분은 16:00:00.09 무렵부터 수 ms 안에 나오고,
09:00 런은 기준 뒤 1초 창이면 된다(pei CONTEXT 실측). 그래서 20초면 넉넉하다.

**VPC · 비밀 재사용:** promote Job 의 배포 플래그를 그대로 복사한다. `--network=$VPC_NAME --subnet=gh-radar-subnet-an3
--vpc-egress=private-ranges-only` · `TICKGW_URL` env · `--set-secrets=…,TICKGW_SECRET=gh-radar-tickgw-secret:latest` · secretAccessor 바인딩은
이미 런타임 SA 에 있다(`scripts/deploy-tick-convert.sh:265-322`). Scheduler 는 `create_or_update_scheduler <sched> <job> <cron>`
(`:203-226`)이다. 이 함수는 args 오버라이드 본문을 못 싣는다. 그래서 **별도 Job(`--args=launch-live`)** 이 가장 단순하다.
알림 필터 `ops/alert-tick-convert-failure.yaml:18` 의 `one_of(...)` 에 새 job 이름을 더한다(안 더하면 실패가 알림 없이 묻힌다).

## 2. 용량 — MAX_KEYS 8 · 로딩 시간 · 틱뷰어와 경합

**tickgw 규칙(코드):**
- 활성 = 리스가 살아 있는 키를 **처음 touch 순번(seq)** 으로 세운 앞 8개다. 나머지는 queued 다(`poller.ts:330-352` `liveRuns` · `stateOf`).
  리스가 끝난 뒤 다시 touch 하면 새 seq(맨 뒤)를 받는다(`poller.ts:285-293`).
  → **우리 touch 는 이미 리스를 쥔 사용자 키를 queued 로 밀어내지 않는다.** 대신 우리 리스가 살아 있는 동안 **새로 연** 사용자 키가
  우리 뒤에 선다. 우리 키를 다 받고 멈춰도 리스는 최대 30초 남는다(`config.ts:144` 30000).
- 119 호출 동시성은 전역 1 · 활성 키 순환이다(`poller.ts:9-10,375-404`). 동시에 여러 키를 열어도 119 쪽 총 전송 시간은 줄지 않는다.
- 캐시 상한 96MB · 리스 키는 강 보호(LRU 못 지움)다(`config.ts:145` · `cache.ts:15-24`). 합이 넘으면 `full` → delayed 백오프다(`poller.ts:497-506`).

**첫 로딩 시간(실측 · 37-17 SUMMARY · 11/3 10:14 KST · 08:00 부터):** 삼성전자 KRX 8.9MB / 8.7초 · 삼성 NXT 15.8MB / 16.8초 ·
한양디지텍 KRX 0.5MB / 0.95초 · NXT 0.36MB / 0.15초다. 병목은 VPN 전송 약 1MB/s 다. 승격 11/3 20:10 은 11키 60.5MB(키당 평균 5.5MB · 하루치)였다.
→ 09:01 은 08:00~09:01 한 시간치라 키당 대개 1초 안팎이다(삼성 NXT 같은 극단도 수 초). 16:01 은 키당 하루치의 약 2/3 이다
  (보통 수 초 · 대형주 KRX 면 20~30초 [ASSUMED 외삽]).

**키 수(추정):** 16:00 은 Q16 = KRX 만이고 그날 상한가 후보 1~수 종목이다(pei 실측: 10/22 060900 · 10/30 184230 각 1종목 + 같은 종목 뒤탐침).
09:00 은 A(KRX 5+3종목) + N(NXT 약 6종목)이라 **5~15키** [ASSUMED · 11/04 조각 79개의 키 분해는 미조회].
모드가 실행마다 `keys=` 를 로그로 남기게 해서 첫날 실측한다.

**권장 전략:**
1. 대상 = `launch_queue_inputs(today)` 중 `fire_base ∈ [now−45분, now−20초]`(KST)인 조각을 (isin, fire_exchange)로 묶는다.
   16:xx run 은 Q16 만 · 09:0x run 은 N/A 만 자연히 걸린다. 수동 실행도 같은 규칙이다. **`--date` 는 받지 않는다**(tickgw 는 오늘만).
2. **리스 인식 동시성 K=4.** 우리 키마다 마지막 요청 시각을 기록한다. 「마지막 요청 + 31초 > now」 인 키가 4개 미만일 때만 새 키를 연다.
   그래서 사용자 몫으로 늘 ≥4 슬롯이 남는다. 119 동시성이 1이라 K 를 키워도 총시간 이득이 작다.
3. **run 예산:** 시작 뒤 100초가 지나면 새 키를 열지 않는다(남은 키는 deferred → 다음 run). 키당 데드라인 90초 · Job
   `--task-timeout=300s`. 겹친 실행(16:01 이 16:03 까지 길어짐)도 안전하다. tickgw 폴러는 키당 하나라 119 호출이 늘지 않고,
   DB 는 아래 단조 가드가 막는다.
4. 시간 견적(K=4 · 키가 빨리 끝나 31초 창이 지배): 16:00 1~5키 → 1~2창 ≈ 35~65초 · 09:00 10~15키 → 3~4창 ≈ 1.5~2분.
   15키를 넘는 날은 예산(100초)에 걸린다. 그 키는 09:03 이 이어 받는다.

**시각 목록:** D-1 그대로(16:01 · 16:03 · 16:10 / 09:01 · 09:03) 유지한다. 근거: 한 시간치 로딩이 키당 1초대라 09:01 에 데이터가 충분하다.
16:00 순번 · 접수 때 앞은 16:00:00.1 무렵 확정되고, 뒤 run 은 「HH:MM 기준 앞 남은」 만 갱신한다. 크론 두 줄:
`1,3,10 16 * * 1-5` · `1,3 9 * * 1-5`(Asia/Seoul) — Scheduler 2개(`gh-radar-tick-convert-launch-live-pm` · `-am`).

**틱뷰어 · 승격 부작용(주의):** 우리가 연 키는 오늘 complete 다. 그래서 21:00 까지 유휴 삭제에서 빠진다(`cache.ts:26-27`).
19:55 이후에는 승격 입력으로 「pinned」 된다(`poller.ts:274-283`). 낮 동안은 LRU 로 지워질 수 있다(리스 끝 = 보호 해제).
살아남은 키는 19:55 따라잡기 · 20:01 마감 마무리 · 20:10 승격 대상이 된다. 이득도 있다(발사 종목도 그날 저녁 승격 격자가 생김).
하지만 09:0x 에 연 대형주 NXT 키(예: 삼성전자 N 주문)가 남으면 19:55 창에서 119 전송(1MB/s)과 캐시를 나눠 써서,
다른 키의 따라잡기 · 승격을 줄일 수 있다. tickgw 변경 없이 Job 쪽에서 막을 방법은 없다(리스를 일찍 놓는 API 없음).
→ **이번 범위에서는 수용하고 관찰한다.** 처음 며칠 radar-gw `catchup done`(lost · left) · promote 요약(`incomplete` · `unclosed`)을 본다.
나빠지면 후속 quick 으로 tickgw 에 「잡 요청은 유휴 면제 · 승격 pin 제외」 플래그를 제안한다.

## 3. 부분일(세션 진행 중) 정확성

- **16:00 Q16:** `levelEvents` 는 `recvNs ≥ baseNs` 인 G4 B6 · 같은 가격 A3 를 거래소순으로 **버퍼 끝까지** 재생한다
  (`launch-queue.ts:475-506`). 「마감 때」 = 재생 끝(`:8-17` 머리 주석 「마감 때 = 재생 끝」). 부분일에서는 **as-of 시점 상태**로
  정확히 바뀐다. 코드 변경은 필요 없다. 순번(rank) · 접수 때 앞(`prevCur`+더 좋은 단)은 우리 증가 이벤트 직전 B6 값이라
  그 뒤 데이터와 무관하게 확정이다(`:562-567`). end_state 는 open · cancelled · filled 중 as-of 상태 값이다.
  → 화면 문구만 「마감」 → 「HH:MM 기준」 으로 바꾸면 된다(D-5).
- **09:00 런:** `aggressorRunsOf` 는 B6 · seq 틈 · bs 바뀜으로 런을 끊는다(`:327-347`). 버퍼 끝에서 끊기지 않은 마지막 런이 있어도,
  우리 런은 기준시각 직후라 20초 여유면 닫혀 있다. 매칭은 **우리 체결 열(px, qty)과 런 열의 정확 일치**다(`sameFills` `:370-374`).
- **우리 체결(`dma_journal_events` 'E') 09:01 존재 여부:** 입력 RPC 는 날짜 무관하게 그날 저널을 읽는다
  (`20261104200000_launch_piece_queue.sql:134-143`). 저널은 relay 가 실시간으로 `dma_journal_apply` 한다(`docs/relay-operations.md:19-29`).
  발사 조각 자체도 strategy 스트림 투영으로 당일 들어온다(CONTEXT: 당일 조각 79개 존재). 그래서 정상이면 09:01 에 있다.
  **위험:** relay 저널이 밀리면(`journal.state db_error`) fills 가 빈다. 그러면 `runValueOf` 가 **「미체결」(matched true)** 로 잘못 쓴다
  (`launch-queue.ts:385,424-435` — fills 0 이면 미체결 경로). 화면은 「HH:MM 기준」 표기로 잠정임을 보이고, 09:03 재계산과 nightly 덮어쓰기로 고친다.
  모드 요약 로그에 `fills_empty=`(N/A 조각 중 fills 0 개수)를 남긴다. 저널 커서 시각으로 미루는 가드는 권하지 않는다.
  `dma_journal_cursor.updated_at` 은 적용 배치 시각일 뿐이라 「발사 뒤까지 받았다」 를 보증하지 못한다.
- **nightly 의 전일 가정:** nightly 는 격자를 05~20시 통독한 뒤 계산한다. 계산 함수 쪽에 「세션 끝」 을 가정한 분기는 없다
  (end 판정 = 버퍼 끝). live 값과 nightly 값의 차이는 as-of 차이뿐이다.
- **바이트 동등성:** live 바이트와 GCS 원본은 같은 119 기록기에서 나온다. 레코드 프레이밍도 같다
  (promote 가 tickgw 바이트를 그대로 `buildGridFile` 로 격자화 — `promote.ts:207-211`). 순서는 거래소순(`exchangeOrderOf`)이라 recv 차이에 둔감하다.

## 4. DB — 표식 · 가드 · 마이그레이션

**현재 막히는 곳:**
- `launch_queue_set` WHERE: `r.object_path IS NULL OR EXISTS(tick_grids … object_path = r.object_path)`(`:195-198`) → `live:` 행 전부 탈락.
- ON CONFLICT DO UPDATE 무조건(`:199-215`) → live 가 nightly 를 덮을 수 있다(D-4 위반 가능).
- null 을 live 표식으로 쓰면 안 된다 — null 은 이미 「GRID_MAX_BYTES 초과 격자의 원시로 계산」 이다(`:28,82`).

**권장 표식:** `object_path = 'live:' || <as-of ISO UTC ms>`. 예: `live:2026-11-04T07:01:02.345Z`(`new Date(asOfMs).toISOString()`).
고정 폭이라 문자열 비교 = 시각 비교다.

**새 마이그레이션(예: `20261104700000_launch_queue_live.sql` · 마지막 파일 `20261104600200_*` 보다 뒤):**
1. `launch_queue_set` CREATE OR REPLACE — 본문은 20261104200000 그대로, 두 곳만 바꾼다:
   - WHERE 에 `OR (r.object_path LIKE 'live:%' AND to_date(r.trade_date,'YYYYMMDD') = (now() AT TIME ZONE 'Asia/Seoul')::date)` 를 더한다
     (live 는 오늘만 — 지연 · 수동 실행이 지난 날짜를 못 건드림).
   - `ON CONFLICT … DO UPDATE SET … WHERE EXCLUDED.object_path IS NULL OR EXCLUDED.object_path NOT LIKE 'live:%'
      OR (q.object_path LIKE 'live:%' AND EXCLUDED.object_path >= q.object_path)`
     → 격자 값(nightly · backfill)은 언제나 덮는다. live 는 live 위에만 · 더 새 as-of 일 때만 덮는다. 건너뛴 행은 ROW_COUNT 에 안 잡힌다
     → 워커가 `sent − written` 을 `set_skipped` 로 로그한다.
2. `launch_orders_for_admin` CREATE OR REPLACE — queue jsonb 에
   `|| jsonb_build_object('live_as_of', CASE WHEN q.object_path LIKE 'live:%' THEN substr(q.object_path, 6) END)` 를 더한다
   (`:356-359` 의 빼기 목록 뒤). 나머지는 그대로다.
3. 두 함수 모두 `REVOKE EXECUTE … FROM PUBLIC` · `FROM anon, authenticated` · `GRANT … TO service_role` 을 다시 명시한다(메모리 규칙 · 기존 꼴 `:225-227,377-379`).
4. `launch_queue_pending` · `launch_queue_inputs` 는 **변경 없음**. pending 은 격자가 생기면 `q.object_path IS DISTINCT FROM g.object_path` 로
   live 행을 stale 로 잡는다(`:261`). 격자 없는 날짜의 `no_grid` 는 `NOT any_value` 라 live 값이 있는 키는 세지 않는다(`:274`) — 수용 가능.

**nightly 덮어쓰기 경로 확인:** nightly 는 `cands.launch` 가 있으면 그날 inputs 전체를 키별로 계산한다. `tick_grid_upsert` 뒤 50행씩
`launch_queue_set` 을 부르고, 그 행은 격자 경로(또는 too-large null)를 가진다 → 새 가드에서 무조건 덮는다(`nightly.ts:358-370,414-428,482-491`).
promote(20:10)는 발사 값을 쓰지 않는다. 다만 promoted 격자가 생기면 pending 에 stale 로 잡힌다(수동 backfill-launch 를 돌리면 promoted 로 재계산 — 무해).

## 5. UI — 최소 표기

- 지금 RPC 는 queue 에서 `object_path` · `computed_at` 을 뺀다(`:356-359`). 그래서 화면은 live 와 격자 값을 구분할 수 없다
  → `live_as_of` 한 칸이 필요하다(위 2).
- 타입: shared `LaunchPieceQueue` 는 계산 출력 타입이기도 하다(`launch.ts:129-158` · `gridLaunchOf` 가 펼쳐 씀). 그래서
  **응답 전용으로** `LaunchPieceRow.queue?: (LaunchPieceQueue & { live_as_of?: string | null }) | null`(`launch.ts:117`)로 넓힌다.
- `launchQueueCellOf`(`webapp/src/lib/launch-format.ts:341-391`) 변경(live 일 때만 · `hm` = live_as_of 의 KST `HH:MM`):
  - queue open: `마감 앞 4건 · …(추정)` → `16:03 기준 앞 4건 · 30,560주 · 7,869만 (추정)`
  - queue cancelled: `마감 — 취소됨` → `16:03 기준 — 취소됨` · queue filled(둘째 줄 없음) → 둘째 줄 `16:03 기준`(dim)
  - run: 둘째 줄 끝에 ` · 09:03 기준`(없으면 `09:03 기준` dim) — fills 지연 가능성 때문에 잠정임을 보인다.
- `launch-orders-tab.tsx` 열 머리 「대기열 (접수 때 · 마감 때)」(`:413`)는 그대로 둔다(nightly 뒤엔 마감 값). 컴포넌트 변경은 없다
  — QueueCell 이 `c.sub` 를 그대로 그린다(`:470-492`). 목업 불필요(문구 한 토막).

## 6. 함정 · 운영

| 함정 | 대응 |
|---|---|
| 무로그 실패 | 키마다 error(failed) · warn(deferred: timeout/queued/incomplete/asof) · 요약 한 줄 `mode=launch-live date keys done deferred failed rows written set_skipped fills_empty ms` · failed>0 → 종료 1(알림 필터에 job 추가) |
| tickgw 401 | 비밀 불일치 = run 실패(throw · 종료 1). 비밀은 헤더에만 싣고 로그 금지(`tickgw-export.ts:15`) |
| 휴장일 · 평일 공휴일 | 크론 1-5 · inputs 0 이면 tickgw 호출 0 · 종료 0(info 한 줄) |
| Job 메모리 | 키를 순차로 풀고 계산한다(받기만 K 동시). promote 와 같은 cpu 1 · 2Gi 면 하루치 키도 충분(승격 실측 team_ms 키당 ~1초) |
| 겹친 실행 · nightly · promote · request | 시간대가 겹치지 않는다(20:10/20:40 · 23:30/01:30). 겹쳐도 DB 단조 가드 · tickgw 키당 폴러 하나라 안전 |
| run 기록(`tick_convert_runs`) | 쓰지 않는다(격자 변환이 아님 · 모드 CHECK 변경 회피). 로그만 |
| 컨테이너 시계 vs tickgw 시계 | 날짜는 둘 다 KST 오늘 · 09/16시라 경계 문제 없음. live 응답엔 날짜 헤더가 없으니 `--date` 를 받지 않는다 |
| 옛 tickgw(As-Of 헤더 없음) | `X-Tick-Last-Recv-Ns/1e6` 로 폴백(6lh 배포 여부 미확인) |
| 마이그레이션 순서 | db push 가 Job 재배포보다 먼저다. 반대 순서면 live 행이 옛 가드에 버려질 뿐이다(`set_skipped` 로 보임 · 무해). 웹은 `live_as_of` 가 없으면 지금 문구 그대로 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 09:00 키 5~15 · 16:00 키 1~5(11/04 79조각 미분해) | §2 | 15키를 넘으면 09:01 예산에 걸려 09:03 몫이 된다 — 로그 `keys=` 로 첫날 확인 |
| A2 | 16:01 하루치 2/3 로딩 = 보통 수 초 · 대형주 20~30초(10:14 실측의 선형 외삽) | §2 | 키당 데드라인 90초 안이면 무해 · 넘으면 deferred |
| A3 | 저널 'E' 가 09:01 에 들어와 있다(relay 실시간 · 정상 시) | §3 | 지연 시 「미체결」 오표시 → 09:03 · nightly 가 고침 · 「기준」 표기로 잠정 표시 |
| A4 | live 키가 19:55 승격 창 경쟁을 늘리는 정도는 작다 | §2 | 승격 누락 증가 → tickgw 후속 변경 필요(관찰 지표 명시) |

## Open Questions

1. 같은 run 안 K=4 가 09:01 사용자 체감(「대기 k건」)에 충분한가 — 첫 주 radar-gw 로그의 queued 응답 수로 본다. 필요하면 K=3 으로 내린다.
2. 6lh(As-Of 헤더) tickgw 배포 여부 — 폴백이 있어 차단 요인은 아니다.

## Validation Architecture

| Property | Value |
|---|---|
| Framework | vitest(워커 · shared · webapp) · pgTAP(일회용 로컬 컨테이너) |
| Quick run | `pnpm --filter @gh-radar/tick-convert exec vitest run tests/launch-live.test.ts --maxWorkers=2` |
| Full | `pnpm --filter @gh-radar/tick-convert test` · `pnpm --filter @gh-radar/tick-convert typecheck` · `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/launch-format.test.ts` · `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_piece_queue.test.sql` |

| 동작 | 테스트 | 파일 |
|---|---|---|
| live 루프: More 이어 받기 · loading/queued 2초 대기 · 409 리셋 · ready+asOf 미달 대기 · Complete=false 미룸 · blocked 포기 · 401 throw · 데드라인 deferred | unit(가짜 fetch · 가짜 시계) | ❌ `workers/tick-convert/tests/tickgw-live.test.ts` |
| 모드: 시간 창 필터 · (isin, ex) 묶기 · 리스 인식 K=4 · 예산 · 표식 `live:<iso>` · set 배치 · 요약/종료 코드 · inputs 0 이면 호출 0 | unit | ❌ `workers/tick-convert/tests/launch-live.test.ts` |
| 실제 바이트 계산 — 기존 G4 골든 픽스처(`launch1030-krx-g4.ticks.zst`)를 「tickgw 응답」 으로 흘려 rank 9 재현 | unit | ❌ 같은 파일(backfill-launch.test.ts 선례) |
| CLI 모드 등록 · config(noArchive · requireTickgw) | unit | ✅ `tests/entry.test.ts` · `tests/config.test.ts` 확장 |
| set 가드: live 삽입 · live→더 새 live 덮음 · 옛 live 거부 · 격자 행이 live 를 덮음 · live 가 격자/null 행을 못 덮음 · 지난 날짜 live 거부 · 권한 REVOKE | pgTAP | ✅ `supabase/tests/launch_piece_queue.test.sql` 확장 |
| admin RPC `queue.live_as_of`(live 면 ISO · 아니면 null) | pgTAP | ✅ 같은 파일 |
| 문구: live 면 「HH:MM 기준 앞 …」 · 「HH:MM 기준 — 취소됨」 · run 둘째 줄 기준 · 비 live 는 그대로 | unit | ✅ `webapp/src/lib/__tests__/launch-format.test.ts` 확장 |

Sampling: 태스크마다 그 파일 vitest(`--maxWorkers=2`) · 마지막 태스크에서 위 Full 전부. e2e 는 불필요(문구 한 토막 · 컴포넌트 무변경).

## 권장 계획 스케치(≤3 태스크)

1. **DB** — `supabase/migrations/20261104700000_launch_queue_live.sql`(`launch_queue_set` 가드 2곳 · `launch_orders_for_admin` 의 `live_as_of` ·
   REVOKE/GRANT 명시) + `supabase/tests/launch_piece_queue.test.sql` 단언 추가. pgTAP 를 실행한다(launch_piece_queue · launch_gate 회귀).
2. **워커** — `workers/tick-convert/src/tickgw-live.ts`(live 클라이언트 + 키 받기 루프) · `src/modes/launch-live.ts`(창 필터 · K=4 리스 인식 ·
   예산 · `decompressFrames` → `gridLaunchOf(mode 'launch-live', objectPath 'live:<iso>')` → `meta.launchSet` 50행 · 요약 로그) ·
   `src/index.ts` MODES 등록 · `src/config.ts`(noArchive · requireTickgw 일반화) · 테스트 2파일 + entry/config 확장 ·
   `scripts/deploy-tick-convert.sh`(Section 7b 에 Job `gh-radar-tick-convert-launch-live` cpu 1 · 2Gi · timeout 300s · 같은 VPC · 비밀 ·
   `--args=launch-live` + Scheduler `-pm` `1,3,10 16 * * 1-5` · `-am` `1,3 9 * * 1-5`) · `ops/alert-tick-convert-failure.yaml` job 이름 추가.
3. **웹 · 타입** — `packages/shared/src/launch.ts`(`LaunchPieceRow.queue` 응답 타입에 `live_as_of?`) · `webapp/src/lib/launch-format.ts`
   (`launchQueueCellOf` live 문구) · `launch-format.test.ts` 확장. `launch-orders-tab.tsx` 는 변경 없음(테스트만 필요하면 한 건).

배포 체크리스트(메인 세션): db push → `TICKGW_URL=<promote 라이브 env> bash scripts/deploy-tick-convert.sh` → 다음 평일 16:01 · 09:01 로그
`mode=launch-live` 요약 · 어드민 주문 내역 「HH:MM 기준」 → 그날 밤 nightly 뒤 「마감」 문구로 바뀌는지 확인.

## Sources

### Primary (HIGH — 이번 세션에 연 코드)
- `tickgw/src/server.ts` · `poller.ts` · `cache.ts` · `config.ts` — live 계약 · 리스/키 상한/보호 · 상수
- `workers/tick-convert/src/{index,config,launch-queue,meta,tickgw-export,grid-file}.ts` · `modes/{nightly,promote}.ts`
- `packages/shared/src/ticks/launch-queue.ts` · `packages/shared/src/launch.ts` · `packages/shared/src/tick-api.ts`
- `supabase/migrations/20261104200000_launch_piece_queue.sql`(그 뒤 마이그레이션에 같은 함수 재정의 없음 — 파일 목록 확인)
- `webapp/src/lib/launch-format.ts` · `webapp/src/components/admin/launch-orders-tab.tsx` · `webapp/src/lib/ticks/use-tick-live.ts`
- `scripts/deploy-tick-convert.sh` · `ops/alert-tick-convert-failure.yaml` · `docs/relay-operations.md`
- `.planning/phases/37-tick-viewer/37-17-SUMMARY.md`(첫 로딩 실측 · 승격 실측) · pei CONTEXT/SUMMARY

## Metadata
- Standard stack: HIGH(새 패키지 없음 — Package Legitimacy Audit 해당 없음)
- Architecture: HIGH(코드 경로 직접 확인)
- Pitfalls: MEDIUM(키 수 · 승격 경쟁은 운영 관찰 필요)
- Research date: 2026-11-04 · Valid until: 2026-11-18(tickgw 계약이 바뀌면 재확인)
