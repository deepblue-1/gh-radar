---
phase: 26-shared-quote-feed
fixed_at: 2026-10-01T02:15:00Z
review_path: .planning/phases/26-shared-quote-feed/26-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 26: 코드 리뷰 수정 보고서

**Fixed at:** 2026-10-01T02:15:00Z (KST 11:15)
**Source review:** .planning/phases/26-shared-quote-feed/26-REVIEW.md
**Iteration:** 1

**Summary:**
- 범위 안 findings: 5건 (Critical 0 · Warning 5 — Info IN-01~06 은 범위 밖)
- 수정: 5건
- 건너뜀: 0건

**작업 위치 · 검증 위치:** 오케스트레이터 지시에 따라 **메인 체크아웃(master)에서 직접** 편집 · 커밋했다(격리 worktree 없음).
같은 워킹 트리에서 다른 세션이 작업 중이었으므로, 커밋마다 직전에 `git status -sb` 를 확인하고 내가 고친 파일만 경로를 지정해
stage · commit 했다(`git add -A` 미사용). 아래 테스트 · 타입체크 수치는 전부 메인 체크아웃에서 낸 값이라 이 트리에서 그대로 재현된다.
push · 배포는 하지 않았다.

**리뷰 이후 바뀐 코드:** 리뷰 기준점은 f07f5fbd 였다. 그 뒤 quick-261001-dyi(99184dbd · fd0f6938 · 3de6aab5)가
`relay/src/ws/fanout.ts` 의 price→full 승격 경로(캐시 q → 링버퍼 tape 스냅샷)를 고쳤다. WR-02 수정은 그 승격 경로와 신규 sub 경로가
같이 쓰는 `#sendTapeSnapshot` 한 곳에 들어가므로 두 경로가 함께 고쳐진다. dyi 의 fanout 테스트(F3 · F9)는 그대로 통과한다.

## Fixed Issues

### WR-01: 공유 quote 연결의 「수신 정체」(half-open TCP · 터널 정지)를 배지도 healthz 도 잡지 못한다

**Files modified:** `relay/src/quote/status.ts`, `relay/src/quote/feed.ts`, `relay/src/index.ts`, `relay/tests/quote-status.test.ts`, `relay/tests/quote-feed.test.ts`, `infra/relay/README.md`
**Commit:** 96810716
**Status:** fixed: requires human verification (임계값이 실측 전 보수값이다)
**Applied fix:**
- ② 복구 — `QuoteFeed` 수신 워치독. ready 동안 `QUOTE_STALL_CHECK_MS`(10초)마다 본다. 조건은 장중 창 · `keyCount() > 0` ·
  마지막 생존 신호(마지막 프레임과 ready 진입 시각 중 늦은 쪽) 뒤 `QUOTE_STALL_RECONNECT_MS`(**90초**) 무수신이다. 참이면 `dropTransport("quote 수신 정체")`
  로 DmaClient 재접속에 넘긴다. ready 진입 시각을 함께 보는 이유가 있다. 재접속 직후에는 `lastFrameAtMs` 가 이전 연결의 값이라, 그것만 보면 곧바로 다시 끊는다.
  `keyCount` 는 `index.ts` 가 `hub.stats().subscriptionCount` 로 주입한다. 주입하지 않으면 워치독은 돌지 않는다.
- ① 판정 — 순수 함수 `quoteStalled`. 조건은 ready · 장중 · `keyCount > 0` · `lastFrameAgeSec ≥ 120`(`QUOTE_STALL_ALERT_AFTER_MS`)이다.
  `quoteAlerting` 의 ready 분기와 `QuoteStatus` 배지 점검이 같은 함수를 부른다. 그래서 `/healthz` 와 배지가 어긋나지 않는다(D-02).
  정체 down 의 `since` 는 마지막 프레임 시각이다. 이 down 은 ready 복귀만으로 풀리지 않고, 프레임이 다시 와야 풀린다.
  워치독이 재접속을 되풀이하는 동안 배지가 깜빡이지 않게 하려는 것이다.
- **리뷰 제안과 다른 점:** 리뷰는 판정 임계값 60초를 제안했다. 그런데 장중 창(08:00~20:00)에는 정상인데도 조용한 구간이 실제로 있다.
  예를 들어 KRX 전용 키의 08:00~08:30 구간, 장후 시간외 단일가(10분 주기), NXT 15:20~15:40 공백이다. 오탐이 나면 재접속과 알림 소음만 반복된다.
  그래서 오케스트레이터 지시(60초 이상 · 보수적)대로 이렇게 나눴다.
  - 워치독은 90초다. 게이트웨이 유휴 스윕과 같은 값이다.
  - 판정 백스톱은 120초다. 워치독 90초에 점검 주기와 재접속 여유 30초를 더했고, 마지막 프레임부터 잰다.
  - 진짜 터널 정지라면 워치독 재접속이 실패한다. 그러면 기존 경로가 그대로 동작한다. 배지는 3초 디바운스 뒤, 503 은 60초 유예 뒤에 선다.
  - 링크가 멀쩡한 오탐이면 재접속과 로그인이 3초 안에 끝나므로 배지에 드러나지 않는다.
  - 상수와 근거 주석은 `relay/src/quote/status.ts` 한 곳에 모았다(정본).
- `QuoteHealth` 7키 고정(T-26-18)은 유지했다. 새 키를 더하지 않았다.

### WR-02: 이미 흐르는 종목을 새 FULL 소켓이 구독하면 체결 테이프가 중복된다(200ms 배치 창)

**Files modified:** `relay/src/hub/subscription-hub.ts`, `relay/src/ws/fanout.ts`, `relay/tests/hub.test.ts`, `relay/tests/fanout.test.ts`
**Commit:** 664b9b76
**Status:** fixed
**Applied fix:**
- `SubscriptionHub.getFlushedTape()` 를 새로 두었다. 링버퍼에서 `#pendingTapes` 대기 증분을 뺀 앞부분만 돌려준다.
  - 대기분이 69 스냅샷이면 undefined 다. 곧 나갈 `snap:true` 가 전량을 주기 때문이다.
  - 대기분이 링버퍼 상한보다 길면 빈 배열이다.
- fanout `#sendTapeSnapshot` 이 이 메서드를 쓴다. 신규 sub 와 price→full 승격이 이 함수를 같이 쓰므로 두 경로가 함께 고쳐진다.
- **리뷰 제안과 다른 점:** 리뷰는 `getTape` 자체의 의미를 바꾸라고 했다. 그런데 `getTape` 는 기존 hub 테스트(⑦ · LG2 등)와
  fanout 테스트 헬퍼 `pushTapeAndFlush` 가 「대기분 포함 원본」 으로 쓴다. 그래서 `getTape` 는 그대로 두고 별도 메서드를 더했다.
- 새 테스트 F10 은 수정 전 코드(`getTape`)에서 실패하는 것을 확인했다.

### WR-03: 79 거부 한 번(일시적인 관찰자 정원 초과 포함)에 시세가 수동 재시작 전까지 영구 정지한다

**Files modified:** `relay/src/quote/feed.ts`, `relay/src/quote/status.ts`(주석), `relay/tests/quote-feed.test.ts`, `infra/relay/README.md`
**Commit:** cc8c71db
**Status:** fixed: requires human verification (상태 전이 정책 변경)
**Applied fix:**
- `rejected` 는 정지 순서(stopReconnect → destroy → 상태)를 그대로 지켜 백오프 루프를 끊는다. 그 위에 긴 간격의 유한 재시도를 걸었다.
  - 간격은 `QUOTE_REJECTED_RETRY_MS`(5분), 상한은 `QUOTE_REJECTED_RETRY_MAX`(12회 = 1시간)다.
  - 재시도가 발화하면 `rejected` → `connecting` 으로 바꾸고 `transport.connect()` 를 부른다. destroy 된 DmaClient 는 소켓이 없으므로 새로 열고, 자동 재접속을 다시 켠다.
  - ready 가 되면 거부 계수를 0 으로 되돌린다.
- 기다리는 동안 상태는 `rejected` 라 `/healthz` 503 과 error 로그는 그대로다. 로그에는 attempt · maxRetries · retryInMs 가 실린다.
  상한을 다 쓰면 「재시도 상한 소진 · relay 재시작 전 복구 없음」 error 로그를 남기고 예전처럼 굳는다.
- `role_mismatch` 는 영구 정지를 유지했다. 저널 관찰자 정책(19 D-13)도 바꾸지 않았다.
- 거부 사유가 비밀 불일치인지 정원 초과인지는 코드에서 단정하지 않는다. `gatewayMessage` 는 로그에만 싣고 분기에는 쓰지 않는다.
- `infra/relay/README.md` 에서 고친 곳은 다음과 같다.
  - 503 조건 표
  - 503 원인별 조치(`rejected` 에 정원 초과 가능성과 자동 재시도를 적었다)
  - 「거부는 스스로 재시도하지 않는다」 문단(quote 와 저널을 나눠 적었다)
  - 로그 목록
  - 관찰자 비밀 순환 절(저널 관찰자만 재시도 없음이라고 명시했다)
- 참고: 장 밖에서 재시도가 `connecting` 에 머무는 몇 초 동안은 `quoteAlerting` 이 거짓(200)이다. 장 밖 not-live 는 원래 200 이기 때문이다.
  거부가 다시 오면 즉시 503 으로 돌아간다. 이 짧은 200 구간이 uptime 알림 해제를 일으킬 수 있으니, 운영 알림 정책을 볼 때 확인할 것.

### WR-04: 구독 한도 거부(`sub.limit`) 뒤 웹이 재시도하지 않고, 경고는 영구히 남으며, 안내 문구가 사실과 다르다

**Files modified:** `webapp/src/lib/use-relay-socket.ts`, `webapp/src/lib/__tests__/relay-socket.test.ts`
**Commit:** 3e47a0c3
**Status:** fixed: requires human verification (구독 상태 처리 로직)
**Applied fix:**
- 재시도:
  - `sub.limit` 을 받으면 그 키를 `wireSubs` 에서 빼고 보류 집합에 넣는다.
  - 소켓당 타이머 1개가 `SUB_LIMIT_RETRY_MS`(30초) 뒤 보류를 풀고 `flushSubscriptions` 를 다시 돈다.
  - 보류 중에는 다른 카드를 열어 흘림이 돌아도 그 키를 보내지 않는다. 헛 거부를 반복하지 않게 하려는 것이다.
- 표식(`subLimit`)이 풀리는 경우:
  - 그 키의 `q` 를 받았다(재시도가 수락됐다는 뜻).
  - 그 키의 마지막 구독이 풀렸다(`sub-limit-clear` 액션).
  - 소켓 수명 경계(`local-status`)를 지났다. 새 소켓은 모든 구독을 다시 보내고, 여전히 한도를 넘으면 relay 가 다시 알린다.
- 이미 닫은 키에 대한 늦은 거부는 표식도 재시도도 없이 무시한다.
- **문구:** 「쓰지 않는 카드를 닫으면 다시 받을 수 있어요」 는 이제 사실이다. 다른 카드를 닫으면 30초 안에 재시도가 수락된다.
  그래서 문구와 목업 정본 목록(`reference/quote-badge-mockup.html`)은 바꾸지 않았다.
- 기존 테스트 2건(「sub.limit 최신 1건 보관」 · 「로그아웃 뒤 null」)은 구독 없이 `sub.limit` 를 밀어 넣고 있었다.
  relay 는 이 소켓이 보낸 sub 에만 거부를 돌려주므로, 실제 프로토콜대로 먼저 구독하도록 고쳤다.

### WR-05: 브라우저 ↔ relay 소켓이 끊겨도 시세 필이 마지막 「live」(초록)로 남는다

**Files modified:** `webapp/src/lib/use-relay-socket.ts`, `webapp/src/lib/__tests__/relay-socket.test.ts`
**Commit:** b8b51e77
**Status:** fixed
**Applied fix:**
- reducer `local-status` 에서 `quoteState: null`(모름)로 되돌린다. 이 액션은 소켓이 없는 모든 경계에서 나간다.
  재연결 중 · unauthorized(4401) · failed(4400) · manual_required · 첫 연결 시도가 모두 여기에 해당한다.
- 새 소켓의 인증 직후 `quote.state` 스냅샷이 다시 채운다. 새 relay 가 아직 모르면(재기동 직후 3초 디바운스 전 · disabled) 스냅샷을 보내지 않는다.
  그러면 필이 없는 채로 남고, 이전 relay 프로세스의 live 를 이어 그리지 않는다(quote-state.ts ② 계약).
- **리뷰 제안과 다른 점:** 리뷰는 `stale` 액션에서 null 로 하라고 했다. 그런데 4401 · 4400 종료 경로는 `stale` 을 내지 않는다.
  그래서 모든 경계를 덮는 `local-status` 에 넣었다.

## 검증 (메인 체크아웃에서 실행)

- relay 전체 `vitest run`: **35 파일 · 900건 통과**.
  - 첫 전체 실행에서 `journal-boot.test.ts` 의 부팅 케이스 1건이 15초 타임아웃으로 실패했다(실제 프로세스를 띄우는 테스트).
  - 그 파일만 다시 돌리면 10건이 통과하고, 전체를 다시 돌려도 900건이 통과한다. 부하에 따른 간헐 실패로 판단했다. 이번 수정과의 관련은 확인하지 못했다.
- relay `tsc --noEmit` · `tsc -p tsconfig.tests.json`: 통과.
- webapp 전체 `vitest --run`: **140 파일 · 3153건 통과 · 1 skipped**.
- webapp `typecheck`(`tsc --noEmit && tsc -p tsconfig.e2e.json`): 통과.
- `@gh-radar/shared` build: 통과.
- e2e(Playwright)는 돌리지 않았다. dyi 의 `trading-workbench.spec.ts` 승격 e2e 와 겹치는 경로는 relay 단위 테스트(F3 · F9 · F10)로 확인했다.

## 후속 확인 항목

1. **WR-01 임계값 실측:** 배포 뒤 장중 `/healthz .quote.lastFrameAgeSec` 분포와 `[QUOTE] 시세 수신 정체 — 연결 재수립` 로그 빈도를 본다.
   특히 08:00~09:00 · 15:20~20:00 의 조용한 구간을 봐야 한다. 그 결과로 `QUOTE_STALL_RECONNECT_MS`(90초)와 `QUOTE_STALL_ALERT_AFTER_MS`(120초)를 조정한다.
   오탐 재접속이 잦으면 값을 늘리거나, 「키 수가 적을 때만 완화」 같은 조건을 검토한다.
2. **WR-01 능동 탐침(선택):** 게이트웨이에 서버 → 클라 핑이나 에코 요청이 생기면, 「조용함」 과 「죽음」 을 가릴 수 있다. 그러면 워치독을 그 신호로 바꾸는 편이 정확하다(gh-trade 쪽 확인).
3. **WR-03 gh-trade 확인:** 관찰자 정원 초과(`kMaxObservers`) 때 79 `message` 를 비밀 불일치와 구분할 수 있는지 gh-trade 에 확인한다.
   구분된다면 정원 초과만 재시도하고, 비밀 불일치는 즉시 정지하는 쪽으로 좁힐 수 있다. 지금은 코드에서 단정하지 않고 둘 다 5분 × 12회 재시도한다.
4. **WR-03 운영 알림:** 장 밖에서 재시도가 `connecting` 으로 넘어간 몇 초 동안 `/healthz` 가 200 이 된다. uptime 정책이 이 순간을 해제로 잡는지 확인한다.
5. **배포 순서:** 이번 수정은 relay(WR-01~03)와 webapp(WR-04~05)에 걸쳐 있다. 메모리 규칙대로 **relay 배포 먼저, push 나중**이다. push 는 webapp 프로덕션 배포이기 때문이다. 이번 작업에서는 push · 배포를 하지 않았다.

---

_Fixed: 2026-10-01T02:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
