---
status: open
from: gh-trade
from_commit: 640d86cd
from_branch: master
date: 2026-11-07
fbs_sync_marker: eac98e43
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-07

> gh-trade Phase 47(뒤탐침 어드민 설정 op 10). from_commit · from_branch 는 Phase 47 실행 브랜치 값이다 — gh-trade master 병합 뒤 해시는 달라질 수 있고,
> fbs 정본 커밋 `eac98e43`(SYNC MARKER)은 병합 뒤에도 master 의 조상으로 남는다.

## 바뀐 것

gh-radar-3d 와 2026-11-07 확정한 계약 그대로다(count 상한만 사용자 결정으로 **0..10**). **새 MsgType · Envelope 슬롯 · AdminCode 없음** — 말미 append 두 곳 + 새 테이블 하나.

1. **44 AdminCommandReq op 10 SetLaunchTailProbe** — `launch_profile`(string, 기존 vtable 20 — "Q16" 16:00 | "N" 09:00:30) + 말미 append 두 칸:
   - `launch_tail_probe_count: int` (vtable **26**) — **0..10**, 0 = 끔
   - `launch_tail_probe_step_us: int` (vtable **28**) — **1..100**µs
   - `launch_market` · `launch_offsets_us` · `user_id` · `password` · `account` 는 읽지 않는다. 다른 op 는 두 칸을 읽지 않는다.
   - **count 0 이어도 step_us 를 범위 검사하고 저장한다**(count 0 + step 0 → 거부).
   - profile "A" · 빈 값 · 소문자("q16") 는 거부.
2. **94 LaunchPlanSnapshot 말미 append** `tail_probes: [LaunchTailProbe]` (vtable **12**) — 행은 **Q16 · N 두 개 고정 순서**.
3. **새 테이블** `LaunchTailProbe { profile: string; count: int; step_us: int; }` — profile(vtable 4) · count(6) · step_us(8).
   count 0 은 FlatBuffers 기본값이라 바이트에 없을 수 있다(읽으면 0).

**expected-vtable 새 6줄 원문**(gh-trade `server/scripts/expected-vtable.txt`, 슬롯 번호 그대로):

```
AdminCommandReq LaunchTailProbeCount 26
AdminCommandReq LaunchTailProbeStepUs 28
LaunchPlanSnapshot TailProbesLength 12
LaunchTailProbe Count 6
LaunchTailProbe Profile 4
LaunchTailProbe StepUs 8
```

**의미**

- 단위 = **(gateway, profile)** — 같은 서버의 K/Q 두 스레드(Q16) · 두 레인(N)이 같은 값을 쓴다. 시장 칸 없음.
- 저장 = 서버 `log/launch_plan.toml` `[tail_probe]`(`q16_count` · `q16_step_us` · `n_count` · `n_step_us`), **plan_rev 를 op 8 과 공유해 +1** · updated_at 갱신.
- 적용 = 콜드2 회차 사본 — **다음 발사부터**(콜드2 뒤 바뀐 값은 그 회차에 안 먹는다).
- 송신 시각 = 마지막 실조각 시각 + **(i+1)·step_us**(i = 0..count−1) — kind 17 `planned_us` 도 같은 식(종전 10µs 고정 → step_us).
- **kind 17 round −2(뒤탐침) 행이 발사당 시장(16:00)·레인('N')마다 최대 10** — wire = 그 시장/레인 실조각 수 + 0..9. 행 값 규칙(profile · exchange · probe · result 등)은 kee 인계(261107-nxt-tail-probe-kind17) 그대로.
- 'A'(09:00:27) 레인은 뒤탐침 없음 — op 10 profile "A" 는 거부.
- server.toml `[queued_order] tail_probe_count` · `[open_arb] nxt_tail_probe_count`(둘 다 0..10)는 **launch_plan.toml 에 뒤탐침 값이 없을 때의 초깃값만**이다(간격 초깃값 10). 파일에 값이 생긴 뒤엔 파일이 우선 — 운영 변경 · 끄기는 op 10 으로만.

**86 AdminCommandResp 문구 원문**(op 10 — 바이트 그대로, 새 code 없음):

| 경우 | code | message |
|------|------|---------|
| 변경 저장 → 뒤이어 94 1프레임 | 0 | `저장 — 다음 발사부터 적용` |
| 같은 값(멱등) — plan_rev 불변 · 94 없음 | 0 | `변경 없음` |
| profile 이 Q16 · N 밖 | 1 | 아래 원문 ① |
| count 0..10 밖 | 1 | `뒤탐침 발 수 범위 밖(0~10)` |
| step_us 1..100 밖 | 1 | `뒤탐침 간격 범위 밖(1~100µs)` |
| 구 서버(op 10 모름) · 0 · 11 이상 op | 1 | `알 수 없는 명령입니다` |
| 저장 실패(메모리 그대로) | 10 | `저장 실패 — 서버 로그를 확인하세요` |
| plan_file 빈 값(메모리 · rev 그대로) | 10 | `발사 계획 저장 경로 없음 — 서버 plan_file 설정을 확인하세요` |
| 계획 미초기화(방어선) | 10 | `발사 계획 미초기화` |
| 사용자 세션(관리자 연결 아님) | 11 | `관리자 연결이 아닙니다` |

원문 ①(표 밖 — 파이프 이스케이프 없이 바이트 그대로):

```
뒤탐침 대상 밖(profile Q16|N)
```

거부 판정 순서 = profile → count → step. relay 는 op 6/7/8 과 같이 message 로 「서버가 범위를 거부」 와 「서버가 op 를 모름」 을 가른다.
조회는 op 9 GetLaunchPlan 그대로(94 에 `tail_probes` 두 행이 같이 온다). users 레지스트리와 무관(BUSY · 87 · users_rev 없음).

판정기가 걸린 파일:

- docs/features/order-journal.md
- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

- **relay 생성물 재동기화 — 이미 해 두었다(미커밋)**: gh-trade 쪽에서 `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 를 돌려
  `relay/src/generated/` 가 바뀌어 있다 — `StockDMA.fbs`(마커 eac98e43) · `stock-dma.ts` · `stock-dma/admin-command-req.ts` · `stock-dma/launch-plan-snapshot.ts` 수정,
  `stock-dma/launch-tail-probe.ts` 신규, 삭제 없음. 경로 지정으로 별도 커밋하면 된다.
- **relay**: op 10 인코드(`launch_profile` + `launch_tail_probe_count` · `launch_tail_probe_step_us`) · 94 `tail_probes` 파스 — 칸이 없으면(구 서버) 「서버가 뒤탐침 설정을 모름」 읽기 전용.
- **server**: `PUT /api/admin/launch/tail-probe/:gateway/:fire` (fire = q16 | n).
- **DB**: `launch_plan_changes` 이력에 뒤탐침 변경 행(시장 칸 없는 행).
- **웹**: 「발사 경계 지도」 설정 칸(발 수 0..10 · 간격 1..100µs, Q16 · N 각각).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예 — 순서 무관.** 서버 먼저면 구 relay/웹이 94 새 칸을 모르고 무시한다(뒤탐침은 server.toml 초깃값 그대로 돈다).
gh-radar 먼저면 94 에 `tail_probes` 가 없어 읽기 전용으로 보이고, op 10 을 보내면 구 서버가 86 code 1 「알 수 없는 명령입니다」 를 낸다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- op 9 → 94 `tail_probes` 두 행(Q16 · N 순서) — 배포 직후는 server.toml 초깃값(120 · 119 · 112 = count 5 · step 10).
- op 10 변경 → 86 code 0 「저장 — 다음 발사부터 적용」 → 94(plan_rev +1, entries 4행 무변경). 같은 값 재전송 → 「변경 없음」 · 94 없음.
- 서버 로그: 감사 `[Gateway] admin op=10 user=Q16 account=- client='…' req=… code=0 …` ·
  변경 `[Launch] 뒤탐침 설정 변경 profile=Q16 count 5→10 step_us 10→100 rev=2 (다음 발사부터)`.
- 다음 발사: `[Launch] 뒤탐침 무장 market=K n=10 step_us=100 isin=… q=… lower=… 계획 rev=…` · 요약 `[Launch] 뒤탐침 market=K n=10 step_us=100 sent=…`
  ('N' 은 `market=K key=N …`).
- DB: kind 17 round −2 행이 시장/레인당 count 개, `planned_us` 가 마지막 실조각 + step_us 간격.

## 질문

없음 — 계약 확정(gh-radar-3d 2026-11-07, count 상한 0..10 은 사용자 결정으로 통지된 그대로).
