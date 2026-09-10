---
phase: 16-trading-limit-chaser-vi-my-page
plan: 46
subsystem: gap-closure-r3-closeout
tags: [gap-closure, deployment, dma-host, validation, requirements, trade-03, closeout]

requires:
  - phase: 16
    provides: "16-36 ~ 16-45 가 닫은 3라운드 17건 (R2-CR 3 · R2-WR 7 · R2-IN 5 · 갭 4 · 갭 5)"
  - phase: 16
    provides: "16-45 의 `deploy-relay.sh` DMA_HOST 3단 우선순위 (이 plan 이 실 VM 에서 처음 태운다)"
provides:
  - "3라운드 17건 처리 결과 정본 — `16-VALIDATION.md` §Gap Closure 3라운드 17행 표"
  - "갭 5 프로덕션 실증 — 무주입 배포가 실 게이트웨이를 보존한다는 유일한 증거"
  - "webapp 반영의 **내용** 증명 — 이 phase 처음으로 정황이 아닌 청크 해시 대조"
  - "TRADE-03 Pending 사유 갱신 — 「Ready 도달 이력 0」에서 「WinForms 세션 공유 미실측」 1건으로"
affects:
  - "Phase 16 종결 상태 (plan 46/46, phase 는 TRADE-03 잔여로 미완결)"
  - "다음 라운드의 검증 명령 순서 (shared build 선행)"

tech-stack:
  added: []
  patterns:
    - "배포 전 상태를 먼저 기록해야 「보존됐다」를 말할 기준이 생긴다 — 기록이 없으면 강등 시 복구할 값도 없다"
    - "SUMMARY 를 근거로 삼지 않는다 — Critical 급은 코드 원문을 직접 열어 인용한다 (T-16-96)"
    - "「실행했는데 SKIP」과 「못 실행했다」를 섞지 않는다 — 섞으면 미검증이 검증된 것으로 승계된다"
    - "「diff 가 비어 있지 않다」와 「배포가 필요하다」는 다른 문장이다 — 소비처 0건인 타입 전용 diff 는 no-op"

key-files:
  created:
    - .planning/phases/16-trading-limit-chaser-vi-my-page/16-46-SUMMARY.md
  modified:
    - .planning/phases/16-trading-limit-chaser-vi-my-page/16-VALIDATION.md
    - .planning/phases/16-trading-limit-chaser-vi-my-page/16-VERIFICATION-R2.md
    - .planning/phases/16-trading-limit-chaser-vi-my-page/deferred-items.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "**server 재배포를 근거를 갖고 건너뛰었다.** plan 의 규칙(「diff 가 비면 건너뛴다」)만 보면 이번엔 배포 대상이었으나, diff 를 열어 보니 `server/` 0줄 + `packages/shared/src/relay.ts` +20줄이 **전부 `type` 선언과 주석**(런타임 코드 0줄)이고 `grep -rn \"RelayLimitChaser\" server/src` = **0건** 이었다. 「배포 누락」과 「근거 있는 건너뜀」이 문서에서 구분되도록 썼다"
  - "**무주입 배포를 택했다.** 주입하는 배포는 「주입이 보존을 이기는지」만 확인하고 정작 회귀를 만든 경로(주입 없는 배포)를 미검증으로 남긴다. 사용자가 위험(몇 분간 DMA 단절)을 명시 수용했고 복구 절차를 준비했다"
  - "**TRADE-03 을 스스로 승격하지 않았다.** `everReadyCount: 1` 로 옛 Pending 사유는 해소됐지만, 그것과 「WinForms 와 즉시 공유된다」 사이의 거리를 다이얼로그에 명시하고 판단을 사용자에게 넘겼다 (T-16-97)"
  - "**Pending 사유를 갱신했다 — 유지가 아니라.** 옛 사유(「Ready 도달 이력 0」)를 그대로 두면 **이미 거짓인 근거로 Pending 을 유지**하는 셈이다. 잔여를 「WinForms ↔ 웹 한 세션 동기화 미실측」 1건으로 좁혀 적었다"
  - "**정본 4종을 덮어쓰지 않았다.** `16-VERIFICATION-R2.md` 는 `git diff --stat` 이 **65 insertions · 0 deletions** 다 — frontmatter 의 `gaps`·`status` 도 건드리지 않았다. 그것은 검증자의 판정이지 실행자가 고칠 것이 아니다"

metrics:
  duration: "약 95분"
  completed: 2026-09-09
  tasks: 5
  files-modified: 6
  files-created: 1
  commits: 1
  tests_before: "2,012 passed / 190 파일"
  tests_after: "2,044 passed / 191 파일"
---

# Phase 16 Plan 46: 갭 클로징 3라운드 종결 Summary

**「닫았다」는 주장을 실측으로 바꿨다** — 17건의 처리 결과를 한 표로 모으고, `DMA_HOST` 를
주입하지 않은 배포로 갭 5 수정을 프로덕션에서 처음 증명했으며, webapp 반영을 이 phase 처음으로
**정황이 아니라 내용**으로 확인했다. TRADE-03 은 Pending 을 유지하되 **사유를 갱신**했다 —
잔여가 1건으로 좁혀졌다.

---

## Task 1 — 전량 게이트 + 회귀 잠금 감사

**커밋 없음** (측정 전용, 소스 변경 0줄).

### 게이트 6종 (전부 exit 0)

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared run build` | exit 0 — **선행 필수** (아래 §새 함정) |
| `pnpm -r typecheck` | exit 0 · 13 워크스페이스 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 (루트 밖, 따로 실행) |
| `pnpm -r test` | exit 0 · **191 파일 / 2,044 passed · 1 skipped · 6 todo** |
| `pnpm build` | exit 0 |
| `pnpm --filter @gh-radar/webapp test:e2e` | **126 passed · 9 skipped · 0 failed** (2.5분) |

기준선(16-35) **2,012 passed / 190 파일** 대비 **+32 / +1 파일**.
워크스페이스별: shared 99 · relay **397** · server 252 · webapp **680** = **1,428**
(16-35 기준선 1,396 초과).

필터는 정본(`@gh-radar/webapp` · `@gh-radar/relay`)을 썼다 — `gh-radar-webapp` 은 없는 필터이고
`No projects matched the filters` + **exit 0** 이다.

### 마커

- 임시 마커(`MUTATION`/`TEMP_DISABLE`/`XXX_REVERT`) — `relay/src` · `webapp/src` ·
  `packages/shared/src` · `scripts` 전역 **0건**
- 부채 마커(`TODO`/`FIXME`/`XXX`/`HACK`/`TBD`) — 같은 범위 **0건** (기준선 0건 유지)

### 회귀 잠금 감사 — 10개 plan 전수

| plan | 결과 |
|------|------|
| 16-36 · 37 · 38 · 39 · 40 · 41 · 42 · 43 · 44 | **9건 실증함** — 무력화 → 실패 관측 → 복원, `git diff` 0줄 / `grep -c MUTATION` 0 확인 |
| **16-45** | **자동 테스트 없음** — 배포 스크립트는 vitest 가 볼 수 없다. 원문 추출 + 로컬 `source` 검증뿐이었고 실 VM 실증은 **Task 3 의 무주입 배포 한 번**뿐 |

**사후에 대신 실증하지 않았다**(범위 밖). 누락을 드러내는 것이 이 감사의 목적이다.

두 건은 「실증했으나 잠기지 않은 부분」이 있어 그대로 승계했다:

- **16-44 의 `#register` `off("state")` 갈래** — 지워도 빨개지는 테스트 **0건**. 오늘의 코드로
  도달 불가(`acquire` 의 세션 재생성은 `refCount === 0` 을 요구하는데 `existing` 이 있다는 것은
  소켓이 살아 있다는 뜻). 지우면 안 되지만 **테스트가 지켜 주지도 않는다.**
- **16-34 의 취소 대기 `side` 변이** — `!p.isCancel` 가드가 먼저 걸러 축에 도달하지 않는
  의도적 중복 방어.

### SUMMARY 를 믿지 않고 코드를 직접 열었다 (Critical 3 + 갭 2)

| 확인 | 위치 | 원문 |
|------|------|------|
| `#isTeardown` 반환식 | `relay/src/ws/fanout.ts:841-845` | `return (!cfg.buyEnabled && !cfg.sellEnabled && !cfg.cancelQtyEnabled && !cfg.cancelTradeEnabled);` — **`crud` 미참조** |
| `stats()` 의 `NO_RETRY_STATES` | `relay/src/dma/session-manager.ts:157·208·305` | `:305` stalled 집계에 `!NO_RETRY_STATES.has(entry.session.state)` |
| `safePgError` 사용 지점 | `orders.ts` **8곳** / relay 전체 **15곳** | 16-38 기록 13곳 + 16-39·16-40 이 2곳 추가. `orders.ts:401` 주석이 「이 파일에서 PostgREST 오류가 로그로 나가는 자리는 **전부** `safePgError` 를 지난다」 |
| `#enrichLimitChaser` 호출 위치 | `relay/src/hub/subscription-hub.ts:743`(60 에코) · `:779`(64 스냅샷) · 정의 `:765` | 둘 다 **캐시 삽입 이전** — `lc.snap` 재접속 복원이 같은 캐시를 읽기 때문 |
| `deploy-relay.sh` 3단 우선순위 | `scripts/deploy-relay.sh:104`(함수) · `:123-131` · `:469-472` | `DMA_HOST="${DMA_HOST_INJECTED:-${CURRENT_DMA_HOST:-127.0.0.1}}"` + `DMA_HOST_SOURCE` 3갈래 |

**16-38 의 「13곳」과 실측 15곳의 차이를 덮지 않았다** — 이후 plan(16-39 `f0dd2a0` · 16-40
`52cc1da`)이 2곳을 추가한 결과이며, 두 숫자 모두 참이다.

---

## Task 2 — 배포 승인 체크포인트

**사용자 응답 (2026-09-09):** **「배포 진행 — `DMA_HOST` 를 주입하지 않는다 (A안)」**

Task 1 의 게이트 숫자와 배포 전 프로덕션 실측을 함께 제시했다. 사용자가 명시 수용한 위험:
「보존 로직이 틀렸으면 DMA 연결이 몇 분간 끊긴다」. 안전장치 4겹(배포 전 값 기록 → 무주입 배포 →
배포 후 실 env 확인 → 강등 시 즉시 복구 + 정직 기록)을 함께 확인했다.

> **이 실행자가 두 번 멈췄고, 두 번 다 정당했다.** ① 오케스트레이터 메시지는 사용자 승인이
> 아니므로 프로덕션 배포 전에 멈췄다 — 사용자가 직접 A안을 골라 진행됐다. ② 그 뒤에도 배포
> 명령이 권한 classifier 에 막혔고, **우회하지 않고** 오케스트레이터에 넘겼다. `gcloud` 개별
> 명령으로 쪼개 재현하는 것은 차단의 취지를 무력화하는 것이라 시도하지 않았다.

---

## Task 3 — 배포 3종 + 프로덕션 실측 + smoke

**커밋 없음** (배포·측정 전용).

### ★ 갭 5 실증 — 주입 없는 배포가 실 게이트웨이를 보존했다

**배포 전 (모든 비교의 기준):**

```
DMA_HOST = 10.41.1.120        (VM radar-gw · docker inspect 직접)
이미지    = …/relay:59465e1
/healthz  = 200 {"status":"ok","vpn":true,"dma":true,"version":"59465e1",
                 "sessionCount":1,"everReadyCount":1,"stalledCount":0}
HEAD = a1f4ed6 · working tree clean · 미푸시 커밋 0건
```

**배포:** `DMA_HOST` **미주입**. `GCP_PROJECT_ID`·`SUPABASE_URL`·`NOTIFICATION_CHANNEL_ID` 만
주입 → `bash scripts/deploy-relay.sh` → **exit 0**.

**스크립트 출력 원문 — 이것이 갭 5 의 증거다:**

```
▶ 현재 컨테이너 DMA_HOST 조회 ...
  현재 컨테이너 DMA_HOST=10.41.1.120 — 이번 배포로 바뀌지 않는다
✓ variables: mode=deploy SHA=a1f4ed6 TARGET=…/relay:a1f4ed6 DMA_HOST=10.41.1.120
  DMA_HOST 출처: 실행 중 컨테이너 보존 (배포 전 컨테이너 값=10.41.1.120)
…
  DMA_HOST:  10.41.1.120 : 9100   ← 실제 컨테이너 값
```

**강등 경고(`⚠ DMA_HOST 가 이번 배포로 바뀝니다`)는 출력되지 않았고, 복구 배포도 필요하지
않았다.**

**배포 후 — 이 실행자가 독립 재측정:**

```
$ curl -s -w 'http=%{http_code}' https://dma.jx1.io/healthz
{"status":"ok","vpn":true,"dma":true,"version":"a1f4ed6",
 "sessionCount":1,"everReadyCount":1,"stalledCount":0}
http=200

$ gcloud compute ssh radar-gw … docker inspect gh-radar-relay
APP_VERSION=a1f4ed6
DMA_HOST=10.41.1.120
DMA_PORT=9100
이미지: asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:a1f4ed6
```

`/healthz` 전 필드: `status=ok` · `vpn=true` · `dma=true` · `version=a1f4ed6` ·
`sessionCount=1` · `everReadyCount=1` · `stalledCount=0`.

**이 phase 배포 2회(16-26 `2cb5620` · 16-35 `c8aa7ae`)를 망가뜨린 회귀 경로가 프로덕션에서
처음으로 닫혔다.** 다만 실증은 **한 번**뿐이고 자동 테스트로 잠기지 않는다 — 다음 배포에서
다시 관측해야 「재발하지 않는다」가 된다.

### server — 근거를 갖고 건너뛰었다

```
$ git diff --stat 2cb5620..HEAD -- server/ packages/shared/
 packages/shared/src/relay.ts | 20 ++++++++++++++++++++
 1 file changed, 20 insertions(+)
```

diff 가 비어 있지 **않다.** 그럼에도 재배포가 기능적 no-op 인 근거 3겹:

1. **`server/` 는 0줄**이다.
2. **+20줄이 전부 `type` 선언과 주석**이다 — `RelayLimitChaser` 에 `name?`·`code?` 추가,
   `RelayLimitChaserInput` 의 `Omit` 에 두 키 추가. **런타임 코드 0줄**(타입은 컴파일에서 소거).
3. **server 는 이 계약을 import 하지 않는다** —
   `grep -rn "RelayLimitChaser\|/relay\"" server/src` = **0건**. server 가 `@gh-radar/shared`
   에서 쓰는 것은 `SHORT_CODE_RE`·`DmaOrderRow`·`Stock`·`Market` 등이다.

현재 server: 리비전 **`gh-radar-server-00043-s4f`** · `/api/health` →
`{"status":"ok","version":"2cb5620"}` · `smoke-server.sh` **15/15**.

**사용자 결정(2026-09-09): 건너뛰고 근거를 문서에 남긴다.** 「배포를 빠뜨렸다」가 아니라
**「근거를 갖고 건너뛰었다」**로 읽히도록 VALIDATION·STATE·ROADMAP 에 같은 문장으로 적었다.

### ★ webapp — 이 phase 처음으로 「내용」 증명에 성공했다

16-26·16-35 는 정황(빌드 시간·alias·공개 HTML 마커)으로만 증명할 수 있었다. 이번에는
**공개 청크 해시를 로컬 빌드 산출물과 직접 대조**했다.

**증명된 것:**

1. **공개 청크 20개 중 18개가 로컬 `pnpm build`(HEAD `a1f4ed6`) 산출물과 해시 완전 일치.**
2. 나머지 2개도 **코드 차이가 아니다.** 토큰 단위 diff 로 확인:
   - `2345-c0133ca9890ddb86.js` — 프로덕션은 `NEXT_PUBLIC_RELAY_WS_URL` 을
     `"wss://dma.jx1.io/ws"` 로 **빌드 타임 인라인**하고, 로컬 빌드는 그 env 가 없어 런타임
     참조(`a.env.NEXT_PUBLIC_RELAY_WS_URL`)로 남는다. 그 한 줄이 minifier 변수명 리플을 만든다.
   - `6011-46d8c38bfb60c914.js` — 위 리플로 인한 **변수명만** 다르다(diff 3블록 전부 `l`↔`o` 류).
3. **갭 4 의 webapp 측이 라이브임이 내용으로 확인됐다.** 일치 청크
   `2422-ff4cf64d654c9829.js`(app-sidebar 포함 — 「주 메뉴」·「상승률 상위」 검출) 안의
   `useIsinLabels`:

   ```js
   49821:(e,a,t)=>{ … function l(){let{accountStates:e,viOrders:a,limitChasers:t}=(0,n._)();
     return(0,r.useMemo)(()=>{ … for(let e of a)n(e.isin,{name:e.name});
     for(let e of t)n(e.isin,{name:e.name,code:e.code});return r},[e,a,t])}}
   ```

   `limitChasers` 순회가 **`viOrders` 뒤**에 있고 의존성 3축 — 16-42 의 「맨 뒤에 둔다」 병합
   규율까지 그대로다.
4. 프로덕션 HTML 회귀 없음: `GET /` 200 · 「상승률 상위」 **2건** · `data-nav-item` **1건**.

**따라서 갭 4 의 두 축(relay 16-41 + webapp 16-42)이 프로덕션에서 함께 라이브다** — 사용자가
보고한 사이드바 ISIN 증상이 사라지는 조건이 처음으로 충족됐다.

**증명하지 못한 것 (정직 기록):** 인증 게이트 뒤 라우트 청크(`/trading/*`·`/me`)는 미인증으로
내려받을 수 없어 **여전히 대조 불가**다. 16-42 의 나머지 두 변경(`limit-chaser-form` 철거 면제 ·
`vi-order-list` 문구)은 그 청크에 있다. 로그인 상태의 화면 확인은 Manual-Only 소관이다.

### smoke 2종

`scripts/smoke-relay.sh` — **PASS 12 · FAIL 0 · SKIP 1**
`scripts/smoke-server.sh` — **PASS 15 · FAIL 0 · SKIP 0**

**INV-9 — 「돌렸는데 SKIP」이 아니다. 토큰이 없어 못 돌렸다.**
`SMOKE_AUTH_TOKEN` 이 없어 `ws_order_probe()` 첫 줄에서 **조기 반환**했고 프로브 본체는 **한
줄도 실행되지 않았다.** 16-21 재작성 이후 프로덕션 첫 실행은 **여전히 미수행**이며, 16-45
(R2-IN-05)가 고친 「판정이 파이프에서 잘리는」 경로도 조기 반환 갈래를 지나가지 않으므로
**프로덕션에서는 미검증**이다. **토큰 값은 이 SUMMARY·문서·커밋·로그 어디에도 없다** (T-16-74).

**부수 관측 2건 (숨기지 않고 적는다):**

- **`INV-2` 문구가 「방화벽 3규칙」 → 「4규칙」으로 바뀌어 통과했다.** 동시 진행 중이던 다른
  세션(`quick-260909-muo`/`t08`, WireGuard)이 `relay-allow-wireguard` 규칙을 추가한 결과다.
  `REQUIREMENTS.md` RELAY-03 본문의 「방화벽 3규칙」과 어긋나지만 **phase 16 소관이 아니라 그
  세션 소관**이라 고치지 않고 `deferred-items.md` §16-46 에 새 미룬 항목으로 올렸다.
- **`INV-5a` 는 이번엔 시각 의존이 아니었다.** 16-35 가 남긴 「5분 뒤 503 이 되어 FAIL」은
  게이트웨이가 없을 때만 발현한다. 이번에는 실 게이트웨이가 붙어 `stalledCount:0` 이라 5분
  뒤에도 200 이다. **해소가 아니라 조건 미성립**이므로 열린 항목으로 유지했다.

### 알림 상태

`gh-radar-relay-down` = `enabled=True`. `/healthz` 200 이므로 발화 근거는 해소돼 있으나,
**인시던트가 닫히는 이벤트 자체는 관측하지 않았다**(이전 두 라운드와 동일). 알림 정책 변경은
사용자 결정 사항이라 단독으로 고르지 않았다.

### D-27

**실주문을 내는 검증을 하지 않았다.** `dma_credentials` 관련 실계좌 검증도 하지 않았다.

---

## Task 4 — TRADE-03 재판정 체크포인트

**사용자 응답 (2026-09-09): ② Pending 유지 — 잔여를 1건으로 좁힌다.**

「해소된 것 / 남은 것」을 표로 제시하고 **「Ready 도달」과 「WinForms 공유」의 거리**를 명시했다.
추정치를 실측처럼 적지 않았고, 승격을 권하지 않았다.

| 구분 | 내용 |
|------|------|
| **해소됨** | 「Ready 에 도달한 DMA 세션이 프로덕션에 한 건도 없다」 — `everReadyCount: 1` · `stalledCount: 0` · `dma: true` 실측 |
| **해소됨** | 「실서버 결선 전에 반드시 닫아야 한다」던 Critical 3건 종결 + 코드 직접 대조 + `a1f4ed6` 배포 |
| **해소됨** | 코드가 프로덕션에 실제로 반영됨 — relay 실컨테이너 + webapp 청크 **내용** 대조 |
| **잔여 1건** | **WinForms ↔ 웹 「한 세션」 동기화 실측** — phase goal 의 핵심 문장, human-only, D-27 |
| 별도 열린 항목 | smoke `INV-9` 프로덕션 첫 실행 (토큰 부재) · RELAY-02 도 같은 기준으로 Pending |

**과장을 막은 문장 (문서 3곳에 같은 표현으로 박았다):**

> `everReadyCount: 1` 은 **「relay 가 게이트웨이에 붙어 DMA 세션이 Ready 상태에 도달했다」**
> 까지만 말한다. **「WinForms 와 전략·체결·미체결이 즉시 공유된다」는 뜻이 아니다** — 후자는
> relay 가 같은 DMA 세션을 쓴다는 구조에서 파생될 것으로 **기대되는** 결과이지 관측된 사실이
> 아니다.

**Pending 사유를 「유지」가 아니라 「갱신」했다.** 옛 사유(「Ready 도달 이력 0」)를 그대로 두면
**이미 거짓인 근거로 Pending 을 유지**하는 셈이 된다.

---

## Task 5 — 문서 6종 정합

**커밋:** (아래 §Commits)

| 파일 | 무엇을 했는가 |
|------|---------------|
| `16-VALIDATION.md` | §Gap Closure 3라운드 (16-36~16-46) **17행 표** + 전량 게이트 · 회귀 잠금 감사 10행 · 코드 직접 대조 5건 + §Deployment Verification (16-46 Task 3) 전문 + TRADE-03 재판정 + **승인 기준 문구 확정 2건**. **이 파일이 처리 결과의 정본이다** |
| `16-VERIFICATION-R2.md` | **부록 2** 를 덧붙였다 — `git diff --stat` **65 insertions · 0 deletions**. 본문·부록 1·frontmatter(`gaps`·`status`) **무변경**. 본문 갭 1·2·3(= R2-CR-01·02·03)과 부록 1 의 갭 4·5 가 어느 plan 으로 닫혔는지, §반증 패스 3건이 어떻게 조치됐는지만 가리킨다 |
| `.planning/REQUIREMENTS.md` | TRADE-03 Traceability 행을 **사유 갱신판**으로 교체 + `*Last updated:*` 에 3라운드 한 줄. **체크박스와 Traceability 를 함께 확인**했다 (아래 대조표) |
| `.planning/ROADMAP.md` | **상단 목록(L33)과 상세(L601) 양쪽** 갱신 — `46/46 plans / 28 waves`. 진행 표(L764) `45/46 → 46/46`. 16-46 항목 `[ ] → [x]` + 결과. Phase 16 체크박스는 **`[ ]` 유지**(TRADE-03 Pending) |
| `.planning/STATE.md` | frontmatter(`stopped_at`·`last_updated`·`completed_plans` 170→171) · Current Position · §3라운드 절 맨 앞에 16-46 항목 · §DMA_HOST 배포 회귀 절에 **후속 한 줄** · Session Continuity 전면 재작성 |
| `deferred-items.md` | §16-46 — **새로 미룬 것 3건 명시**(빈 칸 없음) · 인간 검증 6건 갱신 · **이번 라운드가 드러낸 규율 8행** · 승계 항목 10행 |

### REQUIREMENTS 체크박스 ↔ Traceability 대조 (5개 ID 전부)

| ID | 체크박스 (L97-101) | Traceability (L173-177) | 일치 |
|----|--------------------|-------------------------|------|
| TRADE-01 | `- [x]` | Complete | ✅ |
| TRADE-02 | `- [x]` | Complete | ✅ |
| **TRADE-03** | **`- [ ]`** | **Pending — 잔여 1건** | ✅ |
| NAV-01 | `- [x]` | Complete | ✅ |
| MYPAGE-01 | `- [x]` | Complete | ✅ |

2차 검증의 갭 3(체크박스 ↔ 표 불일치)이 재발하지 않았다.

### ROADMAP 상단·상세 양쪽 인용

- **상단 (L33):** `- [ ] **Phase 16: 트레이딩 메뉴(상따·VI)** … (**46/46 plans / 28 waves**: 실행 17 + 갭 클로징 1라운드 9 + 2라운드 9 + **3라운드 11**) …`
- **상세 (L601):** `**Plans:** 46/46 plans executed`
- **진행 표 (L764):** `| 16. 트레이딩 메뉴(상따·VI) | 46/46 | In Progress|  |`
- Wave 23~28 **6개** 존재 · 16-36~16-46 항목 **11개** 전부 `[x]`

---

## 이 라운드가 드러낸 것 (문서에 박제함)

| 항목 | 내용 |
|------|------|
| **★ 새 함정 — `pnpm -r typecheck` 가 낡은 `packages/shared/dist` 를 보고 통과한다** | 계약 변경은 `pnpm --filter @gh-radar/shared run build` **후에야** 소비처 타입 체크에 보인다. 16-41 이 실제로 데였다. 「절대 실패할 수 없는 검증 명령」 계열의 **세 번째** 사례다(앞선 둘: `pnpm --filter gh-radar-webapp` = `No projects matched` + exit 0 · relay `tests/` 가 루트 typecheck 밖). `deferred-items.md`·`16-VALIDATION.md` 양쪽에 정본 실행 순서를 박았다 |
| **★ `grep "10.41.1.120"` 0건 기준 — 세 라운드 연속 충족 불가, 정본 계약을 확정했다** | 리터럴 0건이 아니라 **「접속 경로 0건」**이다: `grep -rn "10\.41\.1\.120" webapp/src webapp/e2e` = **0건**(16-46 실측 충족) ∧ relay·scripts 잔존이 전부 「경고·가드·주석·타 세션 파일」. `relay/README.md` 는 접속 **금지 경고문 자체**이고 `deploy-relay.sh` 의 것은 **주입 시 경고를 띄우는 가드**라 지우면 D-27 안전장치가 사라진다 |
| **계획·리뷰의 불완전함이 6번 잡혔다** | 16-37 · 38 · 39 · 40 · 43 · 44. **실행자가 코드에서 재확인하는 규율이 없었으면 그대로 새 결함이 됐다** — 계획서를 실행 명세가 아니라 **가설**로 읽을 것 |
| **기존 테스트가 결함을 「진실」로 잠근 사례 3건 추가 (누적 6건)** | 16-36 의 ⑰-e·⑰-e2(헬퍼 기본값 `buyEnabled: true` 가 케이스 전제를 오염) · 16-39 의 ⓽(`toHaveLength(1)` 이 옛 구현을 베낀 단언). 2라운드 3건과 합쳐 **이 phase 누적 6건**. **수정을 약화시켜 통과시키지 말 것** |
| **16-45 만 회귀 잠금 자동 테스트가 없다** | 실증은 이번 무주입 배포 한 번뿐 |
| **16-44 의 `#register` 갈래는 잠기지 않았다** | 오늘 코드로 도달 불가 |
| **포매터를 돌리지 않았다** | 이 저장소에 prettier 설정이 없다(16-30 사고, 459 insertions, 되돌림) |

---

## Deviations from Plan

**1. [Rule 3 - 판정 정교화] server 배포를 「diff 비어 있음」이 아니라 「소비처 0건」 근거로 건너뛰었다**

- **발견 시점:** Task 3 ④
- **문제:** plan 은 「`git diff` 가 비어 있지 않으면 배포한다」고 했고 실제로 비어 있지 않았다.
  그러나 diff 를 열어 보니 `server/` 0줄 + `packages/shared/src/relay.ts` +20줄이 **전부
  `type` 선언과 주석**이고, server 는 그 계약을 **한 번도 import 하지 않는다**.
- **조치:** 배포하지 않고 근거 3겹을 문서에 남겼다. **사용자 결정으로 확정**했다.
- **파일:** `16-VALIDATION.md` · `STATE.md` · `ROADMAP.md` · `REQUIREMENTS.md`

**2. [Rule 3 - 권한 경계] 배포·smoke 명령이 classifier 에 막혔고, 우회하지 않았다**

- **발견 시점:** Task 3 ②·④
- **문제:** `bash scripts/deploy-relay.sh` · `bash scripts/deploy-server.sh` 가 auto mode
  classifier 에 거부됐다.
- **조치:** `gcloud` 개별 명령으로 쪼개 재현하는 것은 **차단의 취지를 무력화하는 것**이라
  시도하지 않았다. 오케스트레이터에 넘겨 실행하게 하고, 그 결과를 **독립 재측정**해 기록했다.
  smoke 2종은 이후 정상 실행됐다.

**3. [Rule 2 - 정직성] 다른 세션의 변경이 만든 문서 불일치를 발견해 기록했다**

- **발견 시점:** Task 3 ⑥ (smoke `INV-2`)
- **문제:** `REQUIREMENTS.md` RELAY-03 의 「방화벽 3규칙」이 실제(4규칙)와 어긋난다.
- **조치:** **고치지 않았다** — `quick-260909-muo`/`t08` 소관이고, 남의 요구사항 문장을 이
  라운드가 건드리면 그쪽 SUMMARY 와 어긋난다. `deferred-items.md` §16-46 「새로 미룬 것」에 올렸다.

---

## Known Stubs

없음. 이 plan 은 소스 코드를 한 줄도 바꾸지 않았다(문서 6종 + SUMMARY 1종).

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·파일 접근·스키마 변경 0건.

| Threat ID | 처리 |
|-----------|------|
| T-16-96 (오진 승계) | mitigate ✅ — Critical 3 + 갭 2 를 코드 원문에서 직접 확인하고 인용 |
| T-16-94 (배포 강등) | mitigate ✅ — 배포 전 값 기록 + 배포 후 즉시 검증. **강등 발생하지 않음** |
| T-16-74 (토큰 유출) | mitigate ✅ — `SMOKE_AUTH_TOKEN` 값이 SUMMARY·문서·커밋 어디에도 없다 |
| T-16-13 (실주문) | accept ✅ — 실주문을 내지 않았다 |
| T-16-97 (과장 판정) | mitigate ✅ — 「Ready 도달」과 「WinForms 공유」의 거리를 명시하고 판단을 사용자에게 넘김 |

---

## 남은 것 (한 문장)

**Phase 16 은 plan 46/46 실행 완료이나 phase 는 미완결이다.** 잔여는 **TRADE-03 의
「WinForms ↔ 웹 한 세션 동기화 실측」 1건**이며, 이는 코드 작업이 아니라 사람이 하는 관측이고
D-27 상 사용자 명시 지시가 있을 때만 실행한다. 재검증이 선결 조건으로 걸었던 R2-CR-01·R2-CR-03
이 닫혀 배포됐으므로 **지금이 그 검증에 가장 안전한 시점**이다.

## Commits

| Task | 내용 | Commit |
|------|------|--------|
| 1 · 2 · 3 · 4 | 측정 · 체크포인트 · 배포 (소스 변경 0줄) | 커밋 없음 |
| 5 | 문서 6종 정합 + SUMMARY | (아래) |

## Performance

- **Duration:** 약 95분
- **Files:** 수정 6 · 생성 1 · **소스 코드 0**
- **Tests:** 2,044 passed / 191 파일 (변동 없음 — 문서만 바꿨다)

---

## Self-Check: PASSED

**생성·수정 파일 7종 전부 존재 확인 (`[ -f ]`):**

```
FOUND: .planning/phases/16-trading-limit-chaser-vi-my-page/16-46-SUMMARY.md
FOUND: .planning/phases/16-trading-limit-chaser-vi-my-page/16-VALIDATION.md
FOUND: .planning/phases/16-trading-limit-chaser-vi-my-page/16-VERIFICATION-R2.md
FOUND: .planning/phases/16-trading-limit-chaser-vi-my-page/deferred-items.md
FOUND: .planning/REQUIREMENTS.md
FOUND: .planning/ROADMAP.md
FOUND: .planning/STATE.md
```

**주장 대조:**

| 주장 | 검증 명령 | 결과 |
|------|-----------|------|
| §Gap Closure 3라운드 표가 17행 | 표 데이터 행 파싱 | **17** ✅ |
| `16-VERIFICATION-R2.md` 는 추가만 | `git diff --stat` | **65 insertions · 0 deletions** ✅ |
| 체크박스 ↔ Traceability 5종 일치 | 두 위치 나란히 grep | TRADE-01 `[x]`/Complete · TRADE-02 `[x]`/Complete · **TRADE-03 `[ ]`/Pending** · NAV-01 `[x]`/Complete · MYPAGE-01 `[x]`/Complete ✅ |
| ROADMAP 상단·상세 양쪽 갱신 | L33 · L601 · L764 | `46/46 plans / 28 waves` · `46/46 plans executed` · `\| 46/46 \|` ✅ |
| Wave 23~28 + 16-36~16-46 전부 등장 | `grep -c` | Wave **6개** · plan 항목 **11개** 전부 `[x]` ✅ |
| `deferred-items.md` §16-46 에 「새로 미룬 것」 명시 | `grep -c` | **3건 표로 명시**(「없음」 아님) ✅ |
| 문서 변경이 코드를 건드리지 않음 | `pnpm -r test` (문서 수정 **후** 재실행) | exit 0 · **2,044 passed** (변동 없음) ✅ |
| `SMOKE_AUTH_TOKEN` 값 부재 | 전 문서·커밋 검토 | **0건** ✅ |
| 소스 코드 변경 0줄 | `git status --short` | `.planning/**` 7종만 ✅ |
