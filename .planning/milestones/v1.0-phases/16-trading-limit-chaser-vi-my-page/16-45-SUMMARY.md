---
phase: 16-trading-limit-chaser-vi-my-page
plan: 45
subsystem: deploy-scripts
tags: [deploy, dma-host, config-preservation, smoke, stdout-truncation, gap-closure]

requires:
  - phase: 15
    provides: "`deploy-relay.sh` 3종 세트 규약 + 배포 후 `docker inspect` 되읽기(2026-09-06 실장애 대응)"
  - phase: 16
    provides: "16-21 의 INV-9 프로브 재작성 · 16-30(GC-WR-11) 의 argv → env 토큰 이동과 판정 이어붙임 제거"
provides:
  - "`read_live_dma_host()` — 돌고 있는 컨테이너의 `DMA_HOST` 를 되읽는 **단일 정본**. 배포 전/후 두 곳이 같은 함수를 쓴다"
  - "`DMA_HOST` 3단 우선순위(명시 주입 > 실행 중 컨테이너 보존 > 로컬 mock)를 **한 줄**에 모은 해석"
  - "`DMA_HOST_SOURCE` — 값이 어디서 왔는지를 배포 로그에 남긴다"
  - "값이 바뀌는 배포의 `이전 → 이후` 출력 + 강등 시 복구 명령 안내"
  - "INV-9 프로브의 stdout 쓰기 완료 후 종료 + 호출부 빈 verdict = FAIL 이중 방어"
affects: [relay 배포 경로, smoke INV-9 판정, 16-46 종결 plan]

tech-stack:
  added: []
  patterns:
    - "배포 스크립트의 기본값은 **선언이 아니라 상태 변경**이다 — 현재 상태를 읽지 않는 기본값은 배포마다 프로덕션을 되돌린다"
    - "같은 조회를 배포 전/후 두 벌로 적지 않는다 — 함수 하나로 모아야 언젠가 한쪽만 고쳐지는 일이 없다 (T-16-14)"
    - "우선순위 결정을 **한 줄**에 모아 두면 스크립트 원문을 그대로 추출해 격리 실행할 수 있다 — 승인 기준이 재구현이 아니라 원문과 대조된다"
    - "Node 프로브의 판정 출력은 `process.exit()` 앞에 두지 않는다 — 파이프 stdout 은 비동기다"
    - "「아무것도 모른다」가 초록불이 되는 갈래를 남기지 않는다 — 빈 판정은 SKIP 이 아니라 FAIL"

key-files:
  created: []
  modified:
    - scripts/deploy-relay.sh
    - scripts/smoke-relay.sh

key-decisions:
  - "보존을 **런타임 조회로만** 구현했다 — 스크립트에 실주소 리터럴을 새로 박지 않는다. D-27 의 취지(「실주소를 저장소에 박제하지 않는다」)는 그대로이고, 이번에 바꾼 것은 「배포가 현재 상태를 되돌리지 않는다」는 **다른 문장**이다"
  - "`DMA_HOST` 해석부를 :95 자리에 그대로 두었다 — `--rollback` 분기(:152)가 그 **뒤**에 오므로 rollback 경로도 같은 해석을 지난다. 순서 조정 불필요(코드로 확인)"
  - "조회 실패(VM 접근 불가·컨테이너 부재·최초 배포)는 **정상 경로**로 처리했다. `|| true` + 빈 문자열 반환으로 배포를 중단시키지 않고, 「현재 값 확인 실패 — 기본값을 쓴다」를 남긴다"
  - "`process.exitCode = 0` 을 **함께** 세웠다 — 쓰기 완료 콜백이 오지 못하는 경우에도 종료 코드가 0 이라야 호출부의 `rc≠0 → inconclusive` 덮어쓰기가 오작동하지 않는다"
  - "빈 verdict 를 `inconclusive` 가 아니라 **FAIL** 로 정했다. 빈 문자열은 「토큰/매핑에서 끊겼다」가 아니라 **판정 유실**이고, 유실을 회색으로 세면 그것이 곧 T-16-57 이 막겠다고 한 강등이다"
  - "승인 기준의 두 `grep -c` 를 만족시키려고 주석의 **인용 표기**를 바꿨다 — 옛 코드 형태를 주석에 그대로 인용하면 「옛 형태가 사라졌다」 grep 이 1 을 세어 기계적 불일치가 난다. 사실은 서술로 남기고 리터럴 인용만 풀었다"

metrics:
  duration: "약 35분"
  completed: 2026-09-09
  tasks: 2
  files-modified: 2
  commits: 2
---

# Phase 16 Plan 45: 배포가 현재 DMA_HOST 를 보존한다 + 프로브 판정 유실 차단 Summary

배포 스크립트가 **돌고 있는 컨테이너의 `DMA_HOST` 를 읽어 기본값으로 삼게** 해 「주입을 빠뜨린 배포가 실 게이트웨이를 로컬 mock 으로 강등시키는」 회귀(이번 phase 에서 2회 발생)를 닫고, INV-9 프로브가 **stdout 쓰기 완료 후 종료**하도록 바꿔 판정이 파이프에서 잘려 FAIL 이 SKIP 으로 강등되는 경로를 없앴다.

---

## Task 1 — 배포가 현재 `DMA_HOST` 를 보존한다 (갭 5)

**커밋:** `9329e1b` · `scripts/deploy-relay.sh` (+63 / −7)

### ① 조회를 함수로 뽑았다 — 1곳 정의 · 2곳 호출

정의 (`scripts/deploy-relay.sh:104-108`):

```bash
read_live_dma_host() {
  gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap --command \
    "sudo docker inspect $CONTAINER --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^DMA_HOST=//p'" \
    2>/dev/null | tr -d '\r' | tail -1
}
```

호출 지점 2곳 (`grep -n 'docker inspect\|read_live_dma_host'` 실측):

| 줄 | 역할 |
|----|------|
| `:104` | **정의** (본체의 `docker inspect` 는 `:106` 한 곳뿐) |
| `:123` | **배포 전** — `CURRENT_DMA_HOST="$(read_live_dma_host \|\| true)"` |
| `:469` | **배포 후** — `LIVE_DMA_HOST="$(read_live_dma_host \|\| true)"` (종전의 인라인 4줄을 대체) |

`:28` 의 `docker inspect` 는 헤더 주석 문장이다(코드 아님).

배포 전 조회는 **배포 후 요약이 쓰던 명령을 그대로** 옮긴 것이다 — 두 벌로 적지 않았다. 실패는 정상 경로로 처리했다: `2>/dev/null` + `tail -1` 로 빈 문자열, `set -e` 아래이므로 호출부에 `|| true`.

### ② 3단 우선순위 — **원문을 그대로 추출해 실행 검증했다**

해석부 원문 (`:124-131`, `sed -n '124,131p' scripts/deploy-relay.sh` 출력 그대로):

```bash
DMA_HOST="${DMA_HOST_INJECTED:-${CURRENT_DMA_HOST:-127.0.0.1}}"
if [[ -n "$DMA_HOST_INJECTED" ]]; then
  DMA_HOST_SOURCE="명시 주입"
elif [[ -n "$CURRENT_DMA_HOST" ]]; then
  DMA_HOST_SOURCE="실행 중 컨테이너 보존"
else
  DMA_HOST_SOURCE="기본값(로컬 mock)"
fi
```

`DMA_HOST_INJECTED="${DMA_HOST:-}"` (`:121`) 가 **덮어쓰기 전에** 주입 여부를 기억한다.

검증 방식: 위 8줄을 `sed -n '124,131p'` 로 **스크립트 원문에서 추출**해 파일로 쓰고, 그 파일을 `source` 했다. 스니펫을 손으로 옮겨 적지 않았으므로 원문과의 동일성은 추출 명령 자체가 보증한다.

실행 결과 (3케이스, 출력 그대로):

```
주입="1.2.3.4" 현재="9.9.9.9" → DMA_HOST=1.2.3.4  (출처: 명시 주입)
주입="" 현재="9.9.9.9" → DMA_HOST=9.9.9.9  (출처: 실행 중 컨테이너 보존)
주입="" 현재="" → DMA_HOST=127.0.0.1  (출처: 기본값(로컬 mock))
```

기대와 일치한다 — **명시 주입이 보존을 이기고, 보존이 mock 을 이긴다.**

### ③ 출처 출력 (`:164-167`)

```bash
echo "✓ variables: mode=$MODE SHA=$SHA TARGET=$TARGET_IMAGE DMA_HOST=$DMA_HOST"
# 「무슨 값이냐」만으로는 부족하다 — **어디서 왔느냐**가 강등을 알아채는 유일한 단서다.
# rollback 경로도 위의 같은 해석을 이미 지나왔으므로 여기서 함께 찍힌다.
echo "  DMA_HOST 출처: $DMA_HOST_SOURCE (배포 전 컨테이너 값=${CURRENT_DMA_HOST:-<확인 실패>})"
```

### ④ 변경 전/후를 나란히 (`:133-145`) — **4케이스 실행 검증**

같은 방식(`sed -n '124,145p'` 로 원문 추출 후 `source`)으로 실행했다. 출력 그대로:

```
--- 주입="1.2.3.4" 현재="9.9.9.9"
⚠ DMA_HOST 가 이번 배포로 바뀝니다:  9.9.9.9  →  1.2.3.4  (출처: 명시 주입)
--- 주입="" 현재="9.9.9.9"
  현재 컨테이너 DMA_HOST=9.9.9.9 — 이번 배포로 바뀌지 않는다
--- 주입="" 현재=""
  현재 값 확인 실패 — 기본값을 쓴다 (VM 접근 불가 · 컨테이너 부재 · 최초 배포)
--- 주입="127.0.0.1" 현재="9.9.9.9"
⚠ DMA_HOST 가 이번 배포로 바뀝니다:  9.9.9.9  →  127.0.0.1  (출처: 명시 주입)
  이것은 실서버 → 로컬 mock **강등**입니다. 의도한 것이 아니면 중단하고
  현재 값을 명시 주입해 다시 실행하세요: DMA_HOST=9.9.9.9 bash scripts/deploy-relay.sh
```

**두 번째 케이스가 이 plan 의 핵심이다** — 주입 없는 배포에서 실 게이트웨이 값이 그대로 유지되고, 로그가 그 사실을 말한다. 종전이라면 이 자리에서 조용히 `127.0.0.1` 이 됐다.

네 번째 케이스는 강등을 **의도적으로** 시키는 경우이고, 그때도 경고와 복구 명령이 함께 뜬다.

배포 후 요약에도 실측 전/후를 더했다 (`:470-473`) — 배포 전 실측(`CURRENT_DMA_HOST`) 대비 배포 후 실측(`LIVE_DMA_HOST`)이 다르면 `변경: 이전 → 이후` 를 찍는다. 셸 변수끼리가 아니라 **두 번의 컨테이너 실측**을 비교한다.

### ⑤ D-27 안전장치 — 손대지 않았다

`:147-150` 의 D-27 경고 2줄은 그대로다. 실측:

```
$ git diff -U0 scripts/deploy-relay.sh | grep -E '^[+-].*(실서버 접속 모드|15-20 소관)'
(없음 — D-27 경고 2줄 diff 0줄)
```

헤더 주석 §선택 env 는 새 동작에 맞게 고쳤다 (`:23-30`). 「미설정 시 127.0.0.1」은 이제 거짓이므로 지웠고, **두 문장이 다르다**는 것을 본문에 박았다:

```
#   DMA_HOST   우선순위: **명시 주입 > 실행 중인 컨테이너 값 보존 > 127.0.0.1 (로컬 mock)**.
#              주입 없이 배포해도 **지금 붙어 있는 게이트웨이가 유지된다** — 배포가 프로덕션
#              상태를 조용히 되돌리지 않는다 (갭 5, 2026-09-09).
#              ⚠️ D-27 과 이 동작은 **다른 문장**이다. D-27 은 「실서버 주소를 **저장소에**
#              **박제하지 않는다**」이고, 저장소에는 지금도 실주소가 기본값으로 적혀 있지
#              않다 — 보존은 오직 런타임 `docker inspect` 조회로만 이뤄진다. 그것을
#              「배포 때 주입하지 말라」로 읽어 배포마다 mock 으로 되돌린 것이
#              16-26(`2cb5620`)·16-35(`c8aa7ae`) 의 프로덕션 강등이었다.
```

### ⑥ 실주소 리터럴 — 늘지 않았다

| 시점 | `grep -c '10\.41\.1\.120' scripts/deploy-relay.sh` |
|------|------|
| 변경 **전** (측정 후 착수) | **2** |
| 변경 **후** | **2** |

늘지 않았다. 남아 있는 2건은 기존 것 그대로 — D-27 경고의 조건(`:147`)과 실서버 안내 문구(`:475`)다. 보존 로직은 런타임 조회로만 이뤄지므로 새 리터럴이 필요 없다.

> ⚠️ 계획의 지시대로 `grep "10.41.1.120"` **0건**은 승인 기준으로 쓰지 않았다. 저장소 전체 실측은 **239건**(산문·경고문·주석 포함)이고, 이 조건은 만족 불가능하다. 정본 계약은 리터럴 0건이 아니라 **접속 경로 0건**이다.

### ⑦ `--rollback` 경로 — 순서 조정 불필요 (코드로 확인)

```
124:DMA_HOST="${DMA_HOST_INJECTED:-${CURRENT_DMA_HOST:-127.0.0.1}}"
152:if [[ "$MODE" == rollback ]]; then
164:echo "✓ variables: mode=$MODE SHA=$SHA TARGET=$TARGET_IMAGE DMA_HOST=$DMA_HOST"
```

`MODE` 분기(`:152`)가 해석부(`:124`)보다 **뒤**에 온다 — rollback 도 같은 3단 해석과 변경 보고를 이미 지나온다. 순서를 바꿀 필요가 없었다.
(rollback 은 `:390` 에서 조기 종료하므로 배포 **후** 되읽기에는 닿지 않는다. 이는 기존 동작이며 이번 변경 범위 밖이다 — 아래 「알려진 한계」에 적었다.)

### 승인 기준 실측

| 기준 | 실측 |
|------|------|
| `bash -n scripts/deploy-relay.sh` | **exit 0** |
| `grep -c '\${DMA_HOST:-127\.0\.0\.1}'` == 0 | **0** |
| `grep -c 'CURRENT_DMA_HOST\|read_live_dma_host'` >= 3 | **14** |
| `docker inspect` 1곳 정의 · 2곳 호출 | 정의 `:104` / 호출 `:123`·`:469` |
| 우선순위 3케이스 실행 | 위 ② — 3/3 기대 일치 |
| 리터럴 개수 전=후 | **2 = 2** |
| 헤더 §선택 env 갱신 | 위 ⑤ 인용 |
| D-27 경고 2줄 diff 0줄 | 위 ⑤ 실측 |
| **`gcloud` 실행 0회 · 실제 배포 없음** | 이 plan 은 `gcloud` 를 한 번도 부르지 않았다. 검증은 전부 원문 추출 + 로컬 `source` 였다 |

---

## Task 2 — 프로브 판정이 파이프에서 잘리지 않는다 (R2-IN-05)

**커밋:** `dea737b` · `scripts/smoke-relay.sh` (+17 / −2)

### ① `finish()` 종료를 안전하게 바꿨다 (`:400-409`)

```js
  // ★ 판정을 `console.log` 로 찍고 곧바로 `process.exit(0)` 하면 안 된다 (R2-IN-05 / T-16-57).
  //   이 프로브의 stdout 은 호출부가 `verdict="$(... node ...)"` 로 잡으므로 **항상 파이프**이고,
  //   POSIX 파이프에서 `process.stdout` 은 **비동기**다. `process.exit()` 는 대기 중인 쓰기를
  //   버릴 수 있다는 것이 Node 문서의 명시 경고다. 잘리면 호출부는 `verdict=""` 를 받고
  //   `case` 의 `*` 갈래로 떨어져 **FAIL 이 SKIP 으로 강등된다** — T-16-57 이 막겠다고 선언한
  //   바로 그 결과이고, rc 가 0 이라 `inconclusive` 덮어쓰기도 걸리지 않는다.
  //   그래서 **쓰기 완료 콜백에서** 종료한다. `process.exitCode` 는 콜백이 오지 못한 경우에도
  //   종료 코드가 0 이도록 미리 세워 둔다 (사유는 stderr 에 이미 남았다).
  process.exitCode = 0;
  process.stdout.write(verdict + "\n", () => process.exit(0));
```

타이머는 이 함수 위에서 이미 전부 정리된다(`clearTimeout(totalTimer)` · `orderTimer`)는 것을 확인했지만, `ws.terminate()` 후에도 소켓 정리가 남을 수 있어 **자연 종료가 아니라 콜백 종료**를 택했다. `process.exitCode` 는 그 콜백이 오지 못하는 경우의 2선 방어다.

`console.error` 로 사유를 찍는 부분은 그대로 뒀다 — stderr 는 명령 치환에 잡히지 않는다.

### ② 호출부 `case` — 빈 verdict 를 SKIP 으로 두지 않는다 (`:677-683`)

기존에는 빈 문자열이 `*` 갈래로 떨어져 `skip` 이 됐다. 전용 갈래를 신설했다:

```bash
    "")
      # 빈 판정은 **SKIP 이 아니다** (R2-IN-05 이중 방어). 프로브는 세 갈래 중 하나를
      # 반드시 찍고, rc≠0 이면 호출부가 `inconclusive` 로 덮어쓴다. 그러고도 비어 있다면
      # 판정이 유실된 것이다 — 원인이 stdout 잘림이든 프로브 버그든, 「아무것도 모른다」를
      # 조용한 초록불로 바꾸지 않는다. FAIL 로 세워 사람이 보게 한다.
      check "INV-9 브라우저 → relay wss 주문 왕복 도달성 (판정 유실 — 빈 문자열)" false
      ;;
```

기존 `reachable`·`unreachable`·`*` 세 갈래는 **한 줄도 바꾸지 않았다.** `inconclusive` 는 계속 `*` 로 떨어져 SKIP 이다(의도된 3갈래 판정 유지).

`case` 블록을 원문(`sed -n '669,693p'`)에서 추출해 `check`/`skip` 스텁으로 격리 실행한 결과 — **프로덕션 미접속**:

```
verdict="reachable"
  check(true) → INV-9 브라우저 → relay wss 주문 왕복 도달성
verdict="unreachable"
  check(false) → INV-9 브라우저 → relay wss 주문 왕복 도달성 (order.result 미수신)
verdict=""
  check(false) → INV-9 브라우저 → relay wss 주문 왕복 도달성 (판정 유실 — 빈 문자열)
verdict="inconclusive"
  skip → INV-9 브라우저 → relay wss 주문 왕복 도달성
```

빈 판정이 **FAIL(`check ... false`)** 이다 — SKIP 이 아니다.

### ③ 프로브 JS 문법 검사 + 파이프 실측

추출 명령 (스크립트 안의 heredoc 경계를 그대로 씀):

```bash
awk "/^  cat > \"\\\$js\" <<'WS_ORDER_PROBE_EOF'\$/{f=1;next} /^WS_ORDER_PROBE_EOF\$/{f=0} f" \
  scripts/smoke-relay.sh > "$SP/ws-order-probe.cjs"     # 124줄 추출
node --check "$SP/ws-order-probe.cjs"                    # exit 0
```

추가로 — 계획이 요구한 것 이상으로 — **파이프(명령 치환) 경로를 실제로 태웠다.** 대상은 로컬 폐쇄 포트(`ws://127.0.0.1:1`)이며 프로덕션·실서버에 접속하지 않는다:

```
verdict="unreachable" (길이=11) rc=0
```

판정 문자열이 파이프를 통과해 **온전히** 잡혔다.

### 승인 기준 실측

| 기준 | 실측 |
|------|------|
| `bash -n scripts/smoke-relay.sh` | **exit 0** |
| 프로브 JS `node --check` | **exit 0** (추출 명령 위 인용, 124줄) |
| `grep -c 'console\.log(verdict)'` == 0 | **0** |
| `grep -c 'process\.stdout\.write'` >= 1 | **1** |
| 빈 verdict 가 SKIP 이 아님 | 위 ② 소스 + 격리 실행 인용 |
| **smoke 미실행** | 아래 명시 |

### ⚠️ smoke 를 **실행하지 않았다** — 「돌렸는데 SKIP」이 아니다

`scripts/smoke-relay.sh` 를 이번 plan 에서 **한 번도 실행하지 않았다.** 실행에는 GCP 환경과 `SMOKE_AUTH_TOKEN`(브라우저 로그인 access_token, 약 1시간 만료)이 필요하고, 저장소 어디에도 그 값이 없는 것이 정상이다(T-16-74). 실행은 종결 plan **16-46** 몫이다.

관련 사실을 섞지 않기 위해 다시 적는다 — INV-9 프로브는 **16-21 재작성 이후 프로덕션에서 한 번도 실행된 적이 없다**(`deferred-items.md` §16-35). 이번 수정은 「돌렸는데 SKIP 이 나왔다」를 고친 것이 아니라, **돌렸을 때 FAIL 이 SKIP 으로 강등될 수 있는 경로**를 미리 닫은 것이다.

---

## 게이트 실측

`pnpm --filter @gh-radar/shared run build` 를 먼저 돌린 뒤(16-41 함정 회피) 전 게이트 실행:

| 게이트 | 결과 | 기준선 |
|--------|------|--------|
| `pnpm -r typecheck` | **exit 0** | 유지 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | **exit 0** | 유지 |
| `pnpm -r test` | **exit 0 · 2,034 passed** | 2,034 — **동일** |
| relay tests | **395 passed** | 395 — **동일** |
| `bash -n scripts/deploy-relay.sh` | exit 0 | — |
| `bash -n scripts/smoke-relay.sh` | exit 0 | — |

이 plan 은 셸 스크립트 2개만 만졌으므로 TS 게이트가 움직이지 않는 것이 정상이며, 실측이 그것을 확인했다.

---

## Deviations from Plan

**None — 계획대로 실행했다.** 다만 두 곳에서 계획의 승인 기준을 그대로 만족시키기 위해 **주석 표기를 조정**했다(기능 변경 아님, 아래에 밝힌다):

**1. [Rule 3 - 승인 기준 충돌] 주석의 옛 코드 인용이 `grep -c` 를 오염시켰다**
- **발견 시점:** Task 1 · Task 2 검증 단계
- **문제:** 회귀 사유를 남기려고 옛 형태를 주석에 그대로 인용했더니 `grep -c '\${DMA_HOST:-127\.0\.0\.1}'` 와 `grep -c 'console\.log(verdict)'` 가 각각 **1** 을 셌다. 승인 기준은 둘 다 **0** 이다. 코드는 이미 사라졌는데 grep 은 「남아 있다」고 말하는, 이 라운드가 반복해 관측한 유형의 기계적 불일치다.
- **조치:** 사실은 서술로 남기고 **리터럴 인용만 풀었다**.
  - `deploy-relay.sh`: 「종전 `DMA_HOST="${DMA_HOST:-...}"` 은」 → 「종전 해석은 미주입 시 무조건 `127.0.0.1` 로 떨어져」
  - `smoke-relay.sh`: 「`console.log(verdict); process.exit(0);` 이면 안 된다」 → 「판정을 `console.log` 로 찍고 곧바로 `process.exit(0)` 하면 안 된다」
- **결과:** 두 grep 모두 **0**. 주석의 정보량은 그대로다.
- **커밋:** `9329e1b` · `dea737b` (각 task 커밋에 포함)

---

## 알려진 한계 (숨기지 않는다)

1. **`--rollback` 은 배포 후 되읽기에 닿지 않는다.** `:390` 에서 조기 종료하므로 rollback 배포는 「최종 요약의 `LIVE_DMA_HOST`」를 출력하지 않는다. **기존 동작이며 이번 변경으로 생긴 것이 아니다.** rollback 도 배포 **전** 3단 해석·출처·변경 전/후 출력은 전부 지난다(`:124`→`:152` 순서). 배포 후 실측까지 필요하면 별도 항목으로 다뤄야 한다.
2. **stdout 잘림을 «수정 전에 실제로 재현»하지는 못했다.** 판정 문자열이 11~12바이트로 짧아 파이프 버퍼 안에 들어가므로, 종전 형태에서도 로컬에서는 대개 온전히 나온다. 즉 이번 수정은 **관측된 실패의 사후 수리가 아니라 문서화된 위험(Node `process.exit` 경고)의 선제 차단**이고, 그래서 호출부의 빈 verdict FAIL 갈래를 **이중 방어**로 함께 넣었다. 「재현했다」고 쓰지 않는다.
3. **보존 로직 자체를 실 VM 에서 태우지 않았다.** `read_live_dma_host()` 가 실제 `gcloud`·`docker inspect` 왕복에서 기대대로 값을 뽑는지는 **16-46 재배포에서 처음 관측된다.** 이번에 검증한 것은 그 반환값을 받은 **이후의 해석·출력**이다. 다만 조회 명령 자체는 기존 배포 후 요약이 이미 프로덕션에서 쓰던 것을 **문자 그대로** 옮긴 것이라 새로 도입된 위험은 없다.
4. **프로덕션은 아직 고쳐지지 않았다.** 프로덕션 relay 는 `relay:59465e1` 이고 이 두 스크립트 수정은 **다음 배포 때부터** 효력이 생긴다. 현재 값(`DMA_HOST=10.41.1.120` · `/healthz` 200 `everReadyCount:1`)은 사람이 명시 주입해 복구해 둔 상태다 — 16-46 이 이 스크립트로 재배포하면 그 값이 **주입 없이도** 보존되는지가 그 자리에서 실측된다.

## D-27 준수

- **실계좌·실서버 접속 0회.** `gcloud` 를 한 번도 부르지 않았고, 프로덕션에 배포하지 않았다.
- 프로브 실측은 **로컬 폐쇄 포트**(`ws://127.0.0.1:1`) 대상이었다.
- 저장소 실서버 주소 리터럴 **2 → 2**(늘지 않음).
- **TRADE-03 상태 미변경** — 계속 Pending. 재판정은 16-46 몫이다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경이 없다. 신규 `read_live_dma_host()` 는 기존 배포 후 요약이 쓰던 조회 명령과 **동일**하며 새 권한·새 표면을 만들지 않는다.

## Self-Check: PASSED

- 파일 3종 존재 확인: `scripts/deploy-relay.sh` · `scripts/smoke-relay.sh` · `16-45-SUMMARY.md`
- 커밋 2종 존재 확인: `9329e1b` · `dea737b`
- 승인 기준 재확인: `${DMA_HOST:-127.0.0.1}` **0** · `console.log(verdict)` **0** · `10.41.1.120` **2**(전 2 = 후 2)
