---
phase: 41-kis-news-and-disclosure-feed
fixed_at: 2026-11-15T09:55:54Z
review_path: .planning/phases/41-kis-news-and-disclosure-feed/41-REVIEW.md
iteration: 1
fix_scope: all
findings_in_scope: 32
fixed: 29
skipped: 3
status: partial
---

# Phase 41: Code Review Fix Report

분할 수정 합본이다. 리뷰 대역별로 독립 worktree 에서 병렬 수정한 뒤 master 에 병합했다.
- 레인 A(01 ~ 29 · 수집기 · 운영 스크립트), B(30 ~ 59 · DB · server · shared · home-sync), C(60 ~ 89 · webapp + UI 감사 우선 수정)
- 레인 D: 레인 경계 때문에 건너뛴 IN-35(수집기 규칙 + DB 소급 동시) · IN-62(서버 코드별 캐시)를 병합 뒤 master 에서 수정
- 병합 커밋: 8f166aa6(A) · c94c15a2(B) · 94679784(C) · 44025c90(D)
- 각 항목 아래 `_레인 X_` 는 출처 레인. 레인별 원본 보고서의 검증 상세는 각 커밋 메시지와 테스트 파일에 있다.

## Verification

- 레인별: kis-news-sync 273 · server 1043 · shared 1378(+2 skip) · home-sync 188 통과, typecheck 0 오류. webapp 관련 단위 13파일 453 · e2e news 10 · stock-detail 4 · 작업대 신규 3 통과.
- pgTAP: 등록 잠금 순서 9 · 가운뎃점 키 14 · 낱말 규칙 11 · auto_market 12 · kis_news 61 · collector 84 · min_disclosures 10 · naver_title 17 · aliases 8 · provider_i 7 — 전부 통과(일회용 로컬 Postgres).
- 병합 뒤 전체 회귀: 아래 「병합 뒤 회귀」 절.

## Fixed Issues

### CR-01: 커서가 갱신 시각(`data_tm`)을 써서 수정본이 쪽 끝에 오면 되감기가 조용히 멈추고 틈이 영구히 빈다

**Status:** fixed: requires human verification
**Files modified:** `workers/kis-news-sync/src/kis/newsTitle.ts`, `workers/kis-news-sync/src/collector.ts`, `workers/kis-news-sync/tests/newsTitle.test.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** c2111f06
**Applied fix:**
- 실측 픽스처로 리뷰 주장을 먼저 확인했다. `past_1d` 커서 `15:30:00` 에 일련번호 `15:29:30` · `data_tm` `15:44:33` 행이 들어 있다. 모든 행이 「일련번호 앞 14자리 ≤ 커서」이고, 갱신 시각 기준으로는 커서보다 늦은 행이 있다. 쪽은 모두 일련번호 내림차순이다. `cont_by_time_only` 와 `cont_by_cursor` 의 결과는 같다. `stock_005930` 끝 행은 일련번호 `14:25:19`, `data_tm` `17:54:22` 다.
- `cursorOf` 는 이제 일련번호 앞 14자리(`YYYYMMDD` + `HHMMSS`)로 커서를 만든다. 일련번호가 19자리 숫자가 아니면 `data_dt` · `data_tm` 으로 물러선다.
- `pageUntilSeen` 결과에 `stalled` 를 더했다. 새 행이 0인 쪽에서 멈추면 참이다.
- `doFeed` 는 `stalled` 이면 warn(`feed paging stalled …` · `lastSeen` · `oldestSrno`)을 남긴다. 리뷰의 무로그 탈락을 없앴다.
- 판단: 되감기가 멈췄을 때 `lastSeen` 을 최신으로 올리는 기존 동작은 **그대로 뒀다**. 올리지 않으면 매 걸음(5초) 같은 쪽들을 최대 5쪽까지 다시 불러 한투 호출만 늘고 멈춤은 풀리지 않는다. 지시상 금지된 호출량 증가다. 근본 원인인 갱신 시각 커서가 없어졌으므로 멈춤은 「한 쪽 40건이 모두 같은 초」 같은 병리적 경우에만 남는다. 그때도 warn 으로 드러난다. 틈 이어 받기는 IN-02 선택지로 넘긴다.
- 테스트(픽스처로 잠금):
  - `stock_005930` 끝 행 커서가 `142519` 인지 본다.
  - `past_1d` 가 일련번호 시각으로 잘렸는지 본다.
  - 한투 흉내(일련번호 시각 ≤ 커서 · 내림차순 40건)로 두 경우를 본다. ① 표본 1쪽에서 갱신 시각 커서는 본 행을 여럿 다시 받지만 일련번호 커서는 1건만 겹친다. ② 수정 지연이 한 쪽 범위보다 길면 갱신 시각 커서는 같은 쪽을 돌려받지만, 일련번호 커서는 2쪽에서 마지막 본 글에 닿고 79행을 빠짐없이 받는다.
  - `stalled` 플래그와 collector 의 warn 을 확인한다.
- 사람 확인 필요: 한투가 **일련번호 시각**으로 쪽을 자른다는 결론은 표본 3개(past_1d · cont_by_cursor · cont_by_time_only)에서 끌어낸 추론이다. 첫 배포 뒤 slow 실행 로그에 `paging stalled` warn 이 0인지 본다.

_레인 A_

### CR-60: 수집 전(`collectedAt: null`) 응답을 기준선으로 잡아, 서버가 첫 종목별 수집을 마치면 3일 치 기존 글이 「새 글」로 강조된다

**Status:** fixed: requires human verification
**Files modified:** `webapp/src/lib/use-stock-feed.ts`, `webapp/src/lib/__tests__/use-stock-feed.test.tsx`
**Commit:** 0da10809
**Applied fix:** `apply` 에서 `collectedAt === null` 응답은 기준선을 잡지 않는다(이미 있던 기준선은 지워서, 수집이 끝난 뒤 첫 응답이 새 기준선이 된다). 처음 보이는 id 라도 작성 시각이 `STOCK_FEED_FRESH_PUBLISHED_MS`(30분)보다 오래됐으면 새 글로 칠하지 않는다(`isFreshlyPublished` — 시각을 못 읽으면 칠하지 않는다). 30분은 네이버 장중 수집 3분 · 순환 9분과 색인 지연을 넉넉히 덮는 값이다. 리뷰 예시(10분)보다 넓게 잡아 진짜 새 기사를 놓치지 않는 쪽을 골랐다. 회귀 테스트: ① 1회차 `null` 응답 다음 수집 응답에 3건이 와도 `firstSeen.size === 0`, 그 뒤 새 글만 기록 ② 신선도 밖 옛 글은 기록하지 않고 경계 안 글은 기록. 판단이 들어간 수정(30분 값)이라 사람 확인이 필요하다.

_레인 C_

### WR-01: 「초당 초과 5번 → 60초 전면 정지」가 같은 걸음의 나머지 흐름(F · G · 종목별)에는 걸리지 않는다

**Status:** fixed: requires human verification
**Files modified:** `workers/kis-news-sync/src/collector.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** 7d3a8bb1
**Applied fix:**
- `call()` 은 버킷을 지난 직후, 보내기 직전에 `pausedUntil` 을 본다. 정지 중이면 `PausedError` 를 던진다.
- `runFlow` 는 `PausedError` 를 오류로 세지 않는다. `errors` · `fails` · `unknownStreak` 모두 그대로 두고, 그 흐름의 `nextAt` 을 정지 끝 이후로 미룬 뒤 info 한 줄만 남긴다.
- `fastStep` 은 흐름마다 시각을 다시 읽고, 정지가 섰으면 그 걸음을 끝낸다.
- `runFlow` 는 낡은 `now` 를 받지 않는다. 성공한 흐름의 다음 예정은 흐름 시작 기준이라 5초 · 60초 박자를 지킨다. 실패의 물러섬 · 정지 시작은 실패를 받은 시각 기준이다.
- 회귀 테스트: 한투 응답이 300ms(버킷 간격 200ms 보다 김)인 가짜 시계에서 5번째 초당 초과 뒤 60초 동안 호출 0을 확인한다. 고치기 전 코드에서는 2건이 새어 나가 실패하는 것을 먼저 확인했다.

_레인 A_

### WR-02: 5xx 와 함께 온 모르는 `msg_cd` 는 영구 「transient」 — 한도 소진 신호여도 run 이 멈추지 않는다(운영 기준 ④)

**Status:** fixed: requires human verification
**Files modified:** `workers/kis-news-sync/src/kis/client.ts`, `workers/kis-news-sync/src/collector.ts`(머리 주석), `workers/kis-news-sync/tests/classifyError.test.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** 2be17f4f
**Applied fix:**
- `classifyKisError` 는 아는 코드 표에 없는 `msg_cd` 를 상태와 무관하게 `unknown` 으로 본다. 그러면 「연속 5번이면 한도 의심 표시 · 종료 1」 경로를 탄다.
- 상태값(0 · 5xx → transient, 429 → rate_limit)은 `msg_cd` 가 아예 없을 때만 본다.
- 일시 장애로 확인된 코드 표(`MCA`/`OPSQ` 계열 등)는 근거가 없어 만들지 않았다. 가장 보수적인 쪽, 즉 멈추는 쪽을 골랐다.
- 테스트: 500 · 502 · 503 과 모르는 코드면 `unknown` 이다. collector 에서 HTTP 500 · `EGW99999` 가 연속 5번 오면 `quota_suspected` 종료 1 이고 호출은 5건이다.
- 사람 확인 필요: 한투가 장애 때 5xx 와 함께 일시 장애 성격의 업무 코드를 준다면, 이제 5번 만에 그날 한도 의심 표시가 남는다. 다음 실행은 단독 탐침 1건으로 재개한다. 운영 로그에서 `kis unknown error` 의 `msgCd` 를 모아, 일시 장애가 확인된 코드만 표에 `transient` 로 등록하면 된다.

_레인 A_

### WR-03: 분류 통계(무효 · 미연결 · 모르는 코드)를 버린다 — 응답 모양이 바뀌거나 종목 정보가 비면 아무 로그 없이 0건 수집

**Status:** fixed
**Files modified:** `workers/kis-news-sync/src/collector.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** 1d84a2d1
**Applied fix:**
- 세 호출부(전체 최신 · 공시 F · G · 종목별)를 `classify()` 하나로 모았다. 분류 통계(`rows` · `invalid` · `unlinked` · `unknownCodes`)를 누적한다.
- 누적은 `collector stop` 로그와 새 10분 주기 로그 `collector stats`(fast · 종목 정보 다시 읽기와 같은 박자)에 싣는다.
- 받은 행이 **전부 무효**면 흐름마다 warn 1번을 남긴다. 정상 행이 다시 오면 표시를 풀어 다음 사건에 다시 warn 한다(5초마다 같은 warn 이 되풀이되지 않게).
- 시작 때 종목 정보가 0건이면 warn 한다.
- 다시 읽기가 빈 결과를 주면 지난 목록을 지키고 warn 한다. 빈 Map 으로 바꾸면 그 뒤 모든 글이 미연결로 빠지기 때문이다.
- 리뷰 예시의 「50% 이상 무효」 문턱은 넣지 않았다. 「전부 무효」만 경보로 두어 오탐을 피했다. 비율은 주기 로그의 누적으로 볼 수 있다.

_레인 A_

### WR-04: 한도 의심 표시가 있는 날 탐침이 토큰 무효를 「한도 탐침 실패」로 처리 — 강제 재발급 없이 하루 종일 실패를 반복할 수 있다

**Status:** fixed: requires human verification
**Files modified:** `workers/kis-news-sync/src/collector.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** d9dd1c9c
**Applied fix:**
- 단독 탐침을 `quotaProbe()` 로 뺐다.
- 탐침이 토큰 무효(`token_invalid`)를 받으면 강제 재발급을 1번 하고(61초 가드 · 임대 조건은 token.ts 그대로) 탐침 1건을 더 한다. 재탐침도 실패하면 종료 1 이다.
- 종료 이유에 종류를 붙였다(`quota_probe_failed_<kind>`). 오진을 막기 위해서다. 이 문자열을 읽는 스크립트 · 테스트가 없음을 grep 으로 확인했다.
- 한투 호출은 토큰 무효일 때 탐침 1건만 늘어난다. 기존에는 하루 종일 5분마다 실패 탐침이 이어졌으므로 전체 호출량은 줄어든다.
- 테스트: 재발급 뒤 탐침이 성공하면 수집을 재개한다. 재발급 뒤에도 무효면 종료 1(`quota_probe_failed_token_invalid`) · 탐침 2건 · 재발급 1번이다. 기존 「모르는 오류 탐침 실패」 테스트는 이유 `quota_probe_failed_unknown` 로 강화했다.

_레인 A_

### WR-30: 시황 제목 규칙이 종목 재료 기사를 지운다 — 「지수가 주어」 · 「두 지수 동시 등장」 규칙의 오탐

**상태:** fixed: requires human verification (규칙 판정 변경)
**바꾼 파일:** `packages/shared/src/market-summary.ts`, `packages/shared/src/__tests__/market-summary.test.ts`
**커밋:** abc5c2ba
**적용한 수정:**
- 「지수가 주어」 규칙은 지수 바로 뒤가 쉼표(「코스피, …」)이거나 방향 낱말(급등 · 하락 · 강세 · 보합 등. 「상승률」 같은 붙은 낱말은 제외)일 때만 건다. 그래서 「코스닥 대장주 OO」 · 「코스닥 시총 2위 OO」 · 「코스피 편입 앞둔 OO」 · 「코스닥 상승률 1위 OO」 는 남는다.
- 「두 지수 동시 등장」 규칙은 `이전` · `떠나` · `行` 이 있으면 걸지 않는다.
- 리뷰가 든 재현 제목 4개와 비슷한 반례 4개를 「시황이 아니다」 목록에 넣어 잠갔다. 기존 시황 표본 27개는 모두 그대로 걸린다(옛 33행에만 걸리던 「코스피, 개인·기관 쌍끌이 매수에 5100 회복」 은 쉼표 꼴로 계속 걸린다).
- DB 에는 같은 규칙 사본이 없다(응답 시점 shared 규칙). 그래서 소급할 것이 없다.
- 확인할 점: 운영 표본 2,396개에서 걸리는 비율(약 9%)이 조금 줄 수 있다. 실데이터로 다시 재지는 않았다.

_레인 B_

### WR-31: 종목 뉴스 목록의 `before` 커서가 한투 ↔ 네이버 짝을 쪽 경계에서 끊는다 — 같은 기사 두 줄 · 링크 유실

**상태:** fixed: requires human verification (쪽 넘김 로직)
**바꾼 파일:** `server/src/routes/news.ts`, `server/tests/routes/news.test.ts`
**커밋:** 9caf99db
**적용한 수정:**
- 커서 쪽은 RPC 를 둘 부른다.
  - 쪽 RPC(`< before`)는 지금과 같다. 그래서 쪽이 덜 차서 클라가 「끝」으로 오인하는 회귀가 없다.
  - 짝 RPC(`[before, before + SAME_ARTICLE_WINDOW_MS)`)를 하나 더 받는다. 두 결과를 일련번호 · id 로 중복 제거한 뒤 합치고, `publishedAt < before` 로 거른다.
  - 그 결과, 짝의 늦은 반쪽이 커서 뒤에 있어도 합친 한 줄로 나온다(공시 배지 · 자료원 · 링크 유지). 짝 구간에서 홀로 남은 행은 거름에서 빠지므로 앞 쪽 줄이 다시 나오지 않는다.
- 종목 목록의 출처별 상한을 `stockFeedPerSource(limit) × 2` 로 넓혔다. 묶음 조회는 그대로다.
- 테스트 3개를 추가했다(경계 두 방향 · 홀로 행 재등장 없음). 기존 테스트의 `p_per_source` 기대값도 고쳤다.
- 남은 한계:
  - ①번 경우(첫 쪽에서 한 출처가 상한에 닿아 짝이 밀림)는 상한을 2배로 늘려 가능성만 줄였다. 완전히 닫으려면 무제한 조회가 필요하다.
  - 짝 구간에 한 출처 글이 상한(최대 220행)을 넘게 몰리면, 커서에 가장 가까운 짝을 못 받을 수 있다.

_레인 B_

### WR-32: 묶음 조회 등록 upsert 의 잠금 순서가 정해지지 않아 동시 등록끼리 교착할 수 있다

**상태:** fixed
**바꾼 파일:** `supabase/migrations/20261115100000_stock_feed_register_lock_order.sql`(새 파일), `supabase/tests/stock_feed_register_lock_order.test.sql`(새 파일)
**커밋:** 698711ca
**적용한 수정:**
- 현재 6인자 정의(20261113300000)를 바탕으로 `stock_feed_by_codes` 를 CREATE OR REPLACE 했다.
  - 등록 INSERT 를 `SELECT d.c … FROM (SELECT DISTINCT …) d ORDER BY d.c` 로 바꿔, 코드 순으로 잠근다.
  - 서명 · 반환 모양 · `REVOKE … FROM PUBLIC` / `FROM anon, authenticated` · service_role GRANT · SECURITY INVOKER · search_path 는 그대로다.
- pgTAP 9개를 추가했다(본문 정렬 · 계획 Sort · 중복/빈 값/NULL 등록 · 60초 제한 유지 · 속성 · 권한).
- 교착 자체는 한 세션 pgTAP 으로 재현할 수 없어, 본문을 검사하는 방식으로 잠갔다.

_레인 B_

### WR-60: 회차 시작마다 진행 중 요청을 끊어서, 묶음 순차 조회가 10초를 넘으면 응답이 영영 반영되지 않는다

**Status:** fixed: requires human verification
**Files modified:** `webapp/src/lib/use-stock-feed.ts`, `webapp/src/lib/__tests__/use-stock-feed.test.tsx`
**Commit:** 5fec28cd
**Applied fix:** `inFlight` 표시를 두고, 직전 회차가 돌고 있으면 주기 tick 과 다시 보임에서 그냥 건너뛴다. 진행 중 요청을 끊는 것은 effect 정리(언마운트 · 옵션 변경) 때뿐이다. 묶음마다 `apiFetch` 8초 타임아웃이 있어 회차는 반드시 끝난다. 끊고 다시 부르는 일이 없어져 요청 수는 같거나 줄어든다. 회귀 테스트: 15초 걸리는 응답이 10초 tick 에 끊기지 않고 반영되고, 겹친 tick 은 요청을 더하지 않는다.

_레인 C_

### WR-61: 코드 집합이 바뀔 때마다 디바운스 없이 즉시 전량 재조회한다 — 돌파 목록이 자주 바뀌는 장 시작 무렵 요청이 10초 설계보다 늘고 응답이 끊겨 버려진다

**Status:** fixed: requires human verification
**Files modified:** `webapp/src/lib/use-stock-feed.ts`, `webapp/src/lib/__tests__/use-stock-feed.test.tsx`, `webapp/src/components/trading/__tests__/trading-workbench.test.tsx`
**Commit:** e1af0f82
**Applied fix:** effect 를 둘로 나눴다. ① `[sig]` effect 는 최신 코드 목록을 ref 에 넣고 기준선을 정리한 뒤 주기 쪽에 알린다. ② 주기 effect 는 `[intervalMs, days, limit]` 에만 의존해서, 코드가 바뀌어도 주기를 다시 잡지 않고 진행 중 요청도 끊지 않는다. 코드 집합 변경으로 조회하는 것은 **새 코드가 있을 때만**이다. 이때 변경을 `STOCK_FEED_CHANGE_DEBOUNCE_MS`(1.5초) 동안 모아 한 회차로 부르고, 직전 회차 시작에서 주기의 절반(5초)이 안 지났으면 그만큼 미룬다. 진행 중이면 그 회차가 끝난 뒤 한 번 더 돈다. 변경 회차 뒤 주기의 절반 안에 온 주기 tick 은 건너뛴다. 그래서 회차는 어떤 경우에도 5초에 1번을 넘지 않고, 변경이 없으면 10초에 1번 그대로다. 코드가 빠지기만 했으면 부르지 않는다. 처음 코드가 들어올 때(한 번도 부르지 않음)만 바로 부른다. 회귀 테스트 4건을 넣었다: 진행 중 요청 유지 뒤 바뀐 집합으로 1회 · 잇단 변경 3번 → 1회 + 직후 tick 건너뜀 + 주기 유지 · 빠지기만 하면 요청 0 · 처음 코드 즉시 조회. 작업대 통합 테스트 1건은 미뤄진 조회를 가짜 시계로 넘기도록 바꿨다.

_레인 C_

### WR-62: 띠 · 상세의 「N건」(서버 `count`)과 펼쳐 보이는 줄 수가 다르다 — `+` 없이 「35건」 이라 쓰고 20줄만 보인다

**Status:** fixed
**Files modified:** `webapp/src/lib/use-stock-feed.ts`, `webapp/src/components/trading/card/card-news-strip.tsx`, `webapp/src/components/trading/workbench/breakout-strip.tsx`, `webapp/src/components/trading/__tests__/card-news-strip.test.tsx`, `webapp/src/components/trading/__tests__/breakout-strip.test.tsx`
**Commit:** 73cf09db
**Applied fix:** `feedCountText(entry)` 하나를 두고, N 을 실제로 펼쳐 보이는 줄 수(`items.length`)로 쓴다. `truncated` 이거나 서버 `count` 가 더 크면 「+」 를 붙인다. 상따 띠 「N건 ▾」 와 돌파 상세 머리가 같은 함수를 쓴다. 서버 계약(`count` · `limit`)은 건드리지 않았다. 「전부」를 보이려고 limit 를 올리는 안은 응답 크기 · 출처별 상한이 함께 커지는 서버 슬라이스 결정이라 고르지 않았다. 테스트: 상한 닿음(20 / 2줄) · 상한 안 닿음 + count 35 / 2줄 → 둘 다 「2건+」, 상세 「1건+」.

_레인 C_

### WR-63: e2e 픽스처가 옛 `NewsArticle` 모양이라 새 계약(`kind` · `url: null` · 배지)을 지나가지 않는다 — 작업대 e2e 는 `/api/news/by-stock` 을 모킹하지 않는다

**Status:** fixed
**Files modified:** `webapp/e2e/fixtures/news.ts`, `webapp/e2e/specs/news.spec.ts`, `webapp/e2e/specs/trading-workbench.spec.ts`
**Commit:** 93f7a089
**Applied fix:**
1. 픽스처 `NEWS_ITEM_SAMPLE` · 새 `DISCLOSURE_ITEM_SAMPLE`(`kind: 'disclosure'` · `url: null` · 「거래소 공시」)을 `satisfies StockFeedItem` 으로 shared 계약에 묶었다. `buildNewsList` 는 `StockFeedItem[]` 를 돌려준다. `mockNewsByStockApi(page, byCode)` 를 새로 넣었다(`NewsByStockResponse` 타입).
2. `news.spec.ts` 에 Phase 41 케이스를 넣었다: 뉴스 줄은 링크 · 「뉴스」 배지 · 「한국경제 ↗」, 공시 줄은 `<a>` 없음 · `news-item-nolink` · 「공시」 배지 · 거래소 자료원 · 「↗」 없음.
3. `trading-workbench.spec.ts` 의 relay 를 쓰는 describe 3곳 `beforeEach` 에 by-stock 모킹을 넣어 실요청을 막았다. 신규 케이스 「P41」 은 돌파 칩 · 표 행의 「공」「뉴」 배지, 행 선택 → 상세 「2건」 · 뉴스 링크 줄 · 공시 링크 없는 줄, 다시 누르면 닫힘 · 카드 0 을 단언한다.

e2e 실행: news 10/10 · stock-detail 4/4 · 작업대 3/3(신규 P41 포함) 통과.

_레인 C_

### IN-01: `tokenForced` 가 한 번 서면 실행 끝까지 그대로 — 몇 시간 뒤의 정상적인 토큰 무효 1번에도 종료 1

**Status:** fixed: requires human verification
**Files modified:** `workers/kis-news-sync/src/collector.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** 93dd264b
**Applied fix:**
- `tokenForced`(bool)를 `tokenForcedAt`(시각)로 바꿨다.
- 강제 재발급 뒤 `TOKEN_REFORCE_WINDOW_MS`(10분) 안의 재무효만 종료 1 이다. 그보다 뒤의 무효는 새 사건으로 보고 1번 더 재발급한다.
- 리뷰의 첫 안(성공 호출 1번이면 리셋)은 쓰지 않았다. 「무효 · 성공」 이 번갈아 오면 61초마다 재발급(알림톡)할 수 있기 때문이다. 시간 창 안을 택했다. 종료 1 뒤 다음 깨움(≤ 5분)도 재발급 1번을 하던 예전 빈도보다 늘지 않는다.
- 테스트: 0초에 무효면 재발급하고 계속한다. 20분 뒤 무효면 다시 재발급하고, 그 직후 또 무효면 종료 1 이다. 재발급은 2번이다.

_레인 A_

### IN-03: 강제 `KIS_NEWS_MODE=fast` 를 06:00 전이나 주말에 주면 14시간 task-timeout 을 넘기거나 주말 내내 돈다

**Status:** fixed: requires human verification
**Files modified:** `workers/kis-news-sync/src/collector.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** 477c31c6
**Applied fix:**
- fast 의 끝을 「그날 20:00」과 「시작 + `FAST_MAX_RUN_MS`(13시간)」 중 이른 쪽으로 잡는다. task-timeout 14h 에 강제 종료되지 않는다.
- 강제 fast 가 평일 07:00 ~ 20:00 창 밖이면(새벽 · 주말) 시작 때 warn 한다.
- 주말 강제 fast 를 거부하지는 않았다. 운영자가 명시로 준 수동 모드라서다. 대신 warn 과 13시간 상한을 둔다.
- 테스트: 05:00 강제 fast 는 warn 이고 `endAt` 은 18:00 이다. 평일 10:00 은 warn 없이 20:00 이다. 토요일은 warn 이다.

_레인 A_

### IN-04: Supabase 호출에 타임아웃이 없다 — DB 호출이 매달리면 임대 연장이 멈추고, 깨어난 뒤 남의 임대 아래서 한 걸음을 더 돈다

**Status:** fixed
**Files modified:** `workers/kis-news-sync/src/services/supabase.ts`, `workers/kis-news-sync/tests/supabase.test.ts`(새 파일)
**Commit:** 52b420c9
**Applied fix:**
- `createClient` 에 `global.fetch = fetchWithTimeout(30_000)` 을 붙였다. 호출부 signal 이 있으면 `AbortSignal.any` 로 상한과 합친다(런타임 node:22 에서 지원).
- 리뷰 예시의 15초 대신 30초로 잡았다. 하루 1번 정리 RPC(`kis_news_cleanup`)가 잘리지 않게 여유를 두면서, 임대 연장 주기(30초)와 같아 「확인 못 한 임대」 한계(60초) 안에서 오류로 돌아온다.
- 새 테스트 4건: 상한이 지나면 `TimeoutError`, 호출부 abort 가 먼저면 그쪽으로 끊김, 정상 응답은 그대로 통과, 상수 값.

_레인 A_

### IN-05: 종료 시 사용량 flush 가 실패하면 그 몫은 사라진다(예산 과소 집계)

**Status:** fixed
**Files modified:** `workers/kis-news-sync/src/collector.ts`, `workers/kis-news-sync/tests/collector.test.ts`
**Commit:** 3e7d809e
**Applied fix:**
- `shutdown` 은 `finalFlush()` 를 부른다. 3번까지, 500ms 간격으로 시도한다. SIGTERM 뒤에는 sleep 이 바로 풀려 간격 없이 시도한다.
- 끝내 실패하면 `lostCalls`(기록 못 한 호출 수)와 `attempts` 를 error 로 남긴다.
- 테스트: 두 번째 시도에 성공하면 error 없이 warn 1번이다. 계속 실패하면 3번 시도하고 error 1건이며, `lostCalls` 는 한투 호출 수와 같다.

_레인 A_

### IN-06: 스모크 INV-4 가 15분 안 다른 실행의 「probe ok」로도 통과한다

**Status:** fixed
**Files modified:** `scripts/smoke-kis-news-sync.sh`
**Commit:** e59d0242
**Applied fix:**
- INV-1 은 `--format='value(metadata.name)'` 로 실행 이름을 받아 `PROBE_EXEC` 에 담는다. `smoke-limitup-sync.sh` · `smoke-dart-alert.sh` 와 같은 꼴이다.
- INV-4 의 로그 필터에 `labels."run.googleapis.com/execution_name"="$PROBE_EXEC"` 를 더했다.
- 실행 이름을 못 받으면 INV-4 도 FAIL 이다. 다른 실행의 「probe ok」로 통과시키지 않는다.
- 검증: `bash -n` 을 통과했다. 가짜 `gcloud`(실행 이름을 돌려주고, 그 이름으로 거른 로그 조회에만 `probe ok` 를 돌려줌)로 INV-1 · INV-4 PASS 를 확인했다. 실행 실패 흉내에서는 INV-1 · INV-4 가 함께 FAIL 이다.

_레인 A_

### IN-07: `setup-kis-secrets.sh` 의 `file_mode` 가 GNU stat(Linux)에서 항상 틀린 값을 낸다

**Status:** fixed
**Files modified:** `scripts/setup-kis-secrets.sh`
**Commit:** adfde325
**Applied fix:**
- GNU 를 먼저 판별한다(`stat -c '%a'` 가 되면 그것, 아니면 `stat -f '%Lp'`). `setup-dart-alert-secrets.sh` 의 같은 수정과 같은 꼴이다.
- 검증: macOS 에서 600 · 644 를 그대로 낸다. GNU 흉내 `stat` 에서 고친 뒤는 `600` 이고, 고치기 전은 파일시스템 정보 여러 줄 + `600` 이다.

_레인 A_

### IN-08: 배포 스크립트가 Secret 이름 변수를 정의해 놓고 `--set-secrets` 에는 리터럴을 쓴다

**Status:** fixed
**Files modified:** `scripts/deploy-kis-news-sync.sh`
**Commit:** 592a8a71
**Applied fix:**
- `--set-secrets` 를 `KIS_APPKEY=${KIS_APPKEY_SECRET}:latest,KIS_APPSECRET=${KIS_APPSECRET_SECRET}:latest` 로 바꿨다. 값은 같다(`gh-radar-kis-appkey` · `gh-radar-kis-appsecret`).
- `bash -n` · `--self-test` · `tests/schedule.test.ts`(배포 스크립트 파싱) 7건 통과.

_레인 A_

### IN-09: Generality without instantiation — `pageUntilSeen` 의 `minWrittenAt` 를 운영 코드가 한 번도 넘기지 않는다

**Status:** fixed: requires human verification (necessity — 코드 제거)
**Files modified:** `workers/kis-news-sync/src/kis/newsTitle.ts`, `workers/kis-news-sync/tests/newsTitle.test.ts`
**Commit:** 4fec44f8
**Applied fix:**
- `PageUntilSeenOptions.minWrittenAt`, `writtenAtMs`, `reachedOld` 분기를 지우고, 그것만 쓰던 테스트 1건도 지웠다.
- 운영 호출부(`collector.doFeed`)는 `{ lastSeenSrno, maxPages }` 만 넘기므로 동작 변화는 없다. 남은 참조 0건을 grep 으로 확인했다.
- 나중에 시각 컷이 필요하면 CR-01 처럼 일련번호 앞 14자리로 판정해야 한다.

_레인 A_

### IN-30: `clampInt` 주석과 실제 동작이 다르다 — 비정수 · 숫자 아닌 값은 잘라 맞추지 않고 400

**상태:** fixed
**바꾼 파일:** `server/src/schemas/news-by-stock.ts`, `server/tests/routes/news-by-stock.test.ts`
**커밋:** 553d98dd
**적용한 수정:**
- 동작은 바꾸지 않았다. gh-trade 계약 D-08 「위반 400」 이 그대로다.
- 주석을 실제 동작에 맞췄다: 「정수가 아니면 400 · 정수는 1 ~ max 로 잘라 맞춤 · 빈 값 · 생략 · 1 미만은 기본값」.
- 닿지 않는 `!Number.isFinite` 분기를 지웠다.
- `days=abc` · `days=2.5` · `limit=Infinity` · `limit=1e400` → 400(RPC 안 부름), `days=` → 기본 3일 테스트를 추가했다.
- 저장소 문서에서 「비정수 잘라 맞춤」 문구는 찾지 못했다.

_레인 B_

### IN-31: `isRpcResult` 가 두 라우트에 복제돼 있다

**상태:** fixed
**바꾼 파일:** `server/src/mappers/stock-feed.ts`(새 파일), `server/src/routes/news.ts`, `server/src/routes/news-by-stock.ts`, `server/tests/mappers/stock-feed.test.ts`(새 파일)
**커밋:** 3ec06e48
**적용한 수정:**
- `isStockFeedRpcResult` 를 `server/src/mappers/stock-feed.ts` 로 옮겼다. 이제 두 라우트가 이 함수 하나를 쓴다.
- 모양 검사 단위 테스트 10개를 추가했다.

_레인 B_

### IN-32: `newsTitleKey` 가 가운뎃점 「ㆍ」(아래아)을 글자로 남긴다 — 「기호 차이 무시」(D-12)의 빈틈

**상태:** fixed
**바꾼 파일:** `packages/shared/src/stock-feed.ts`, `packages/shared/src/__tests__/stock-feed.test.ts`, `supabase/migrations/20261115110000_kis_news_title_key_middle_dot.sql`(새 파일), `supabase/tests/fixtures/41_title_key_dot_pre.sql`(새 파일), `supabase/tests/kis_news_title_key_middle_dot.test.sql`(새 파일)
**커밋:** 3a8a48d2
**적용한 수정:**
- shared `newsTitleKey` 가 NFKC 뒤 U+318D · U+119E 를 지운다. 가운뎃점 표기 5가지가 같은 키가 되는지 테스트로 잠갔다.
- 새 마이그레이션의 ① `kis_news_ingest` 는 받은 `title_key` 에서 같은 두 글자를 지운다. 다 지워 빈 키가 되면 받은 키를 그대로 쓴다. 그 밖의 본문 · 서명 · 권한 · 속성은 20261112100000 그대로다.
  - 그래서 옛 shared 를 묶은 수집기 이미지가 키를 보내도 수정본 키가 갈리지 않는다. 수집기 재배포 순서와는 무관하다.
- 새 마이그레이션의 ② 는 기존 행 `title_key` 를 멱등으로 소급한다.
  - 바꾼 키가 같은 (제공업체, 키, KST 날)의 기존 행과 겹치면 그 행은 그대로 둔다(유일키 위반 · 행 삭제 · 병합 없음).
  - 후보끼리 겹치면 일련번호가 가장 작은 한 행만 바꾼다.
- pgTAP 14개: 소급 6 · 들여오기 6 · 속성/권한 2. 마이그레이션을 두 번 적용해 멱등도 확인했다.

_레인 B_

### IN-33: `stock_title_needles` 낱말 규칙이 넓은 낱말을 만든다 — 우선주 「LG우」 → `lg`, 첫 낱말 「NHN KCP」 → `nhn`

**상태:** fixed: requires human verification (표시 규칙 변경)
**바꾼 파일:** `supabase/migrations/20261115120000_stock_title_needles_tighten.sql`(새 파일), `supabase/tests/stock_title_needles_tighten.test.sql`(새 파일), `supabase/tests/stock_feed_naver_title.test.sql`(N3 표본), `packages/shared/src/stock-feed.ts`(주석)
**커밋:** 4aabe510
**적용한 수정:**
- ① 우선주 본주 낱말은 3자 이상만 쓴다(`stock_title_needles` · IMMUTABLE 유지). 「LG우」 · 「SK우」 → 본주 낱말 없음, 「LG화학우」 → `lg화학` 유지.
- ② `stock_feed_by_codes` 가 띄어 쓴 이름의 첫 낱말을 다른 종목 이름(공백 · 끝 마침표 제거 · 소문자)과 비교해, 같으면 뺀다. 예: 「NHN KCP」 의 `nhn` 은 빠지고, 「JYP Ent.」 의 `jyp` 는 남는다.
- ③ 제목 공백 제거를 `regexp_replace(lower(title), '[[:space:] 　]', '', 'g')` 로 바꿨다(탭 · NBSP · 전각 공백 포함).
- 「알려진 한계」 주석을 갱신했다.
- 응답 시점 규칙이라 소급 UPDATE 는 필요 없다.
- `stock_feed_by_codes` 의 나머지(WR-32 의 ORDER BY 포함)는 20261115100000 그대로다.
- 기존 pgTAP N3 표본 「나래2우B」(본주 2자)를 「가람전자2우B」 로 바꿨다.
- 확인할 점: 「SK우」 처럼 본주가 2자인 그룹 우선주는 이제 제목에 「SK우」 가 있는 기사만 남는다. 필요하면 `stock_title_aliases` 로 보충한다.

_레인 B_

### IN-35: auto_market 2번 규칙이 「<이름>(<코드>) 급등, <재료>」 꼴의 재료 기사까지 숨긴다

**Status:** fixed: requires human verification
**Files modified:** `workers/kis-news-sync/src/pipeline/classify.ts`, `workers/kis-news-sync/tests/classify.test.ts`, `supabase/migrations/20261115130000_kis_news_auto_market_anchor.sql`(신규), `supabase/tests/fixtures/41_auto_market_pre.sql`, `supabase/tests/kis_news_auto_market.test.sql`
**Commit:** ca6a2a87
**Applied fix:** 레인 B 선택지 (a). 정본 `AUTO_MARKET_NEWS_PATTERNS` 2번 규칙에 끝 앵커를 뒀다.
- 괄호 코드 + 방향 낱말 뒤에는 짧은 꼬리(숫자 · 쉼표 없이 6자 이내 — 「세」 · 「폭 확대」 · 「세 기록중」 · 「 진입」)와 시세 숫자 `±N.NN%` · 「↑↓」 만 온다.
- 쉼표 뒤 조각은 둘 중 하나만 허용한다.
  - 수급 · 연속 낱말로 시작하는 조각(외국계 · 외국인 · 기관 · 개인 · 프로그램 · N거래일 · N일 연속 · N일째 · 이틀째 · 사흘째 · 나흘째)
  - 공백 없는 종목명 + `±N%` 목록 조각
- 전방탐색 없이 써서 Postgres 와 JS 가 같게 읽는다(`classify.test.ts` 문법 가드 통과).
- 새 규칙은 옛 2번 규칙의 부분집합이라 새로 숨는 글은 없다.

새 소급 마이그레이션 `20261115130000_kis_news_auto_market_anchor.sql` 은 기존 소급(`20261112310000`)과 같은 구조다. 뉴스만 다루고, 공시 · `etp` · `derivative_notice` 는 건드리지 않으며, 글은 지우지 않는다.
- 같은 배열(정본 19개 전체)에 맞는 뉴스 일련번호를 `ON COMMIT DROP` 임시 표에 한 번 담는다. 배열을 한 번만 쓰려는 것이다. 대조 테스트는 그대로 두었다.
- ① 이미 `auto_market` 인데 새 배열에 안 맞는 연결은 `NULL` 로 되돌린다. ② 보이는 연결이 새 배열에 맞으면 `auto_market` 으로 숨긴다. 두 단계 모두 멱등이다.
- 「최신 소급 마이그레이션 정규식 배열과 글자까지 같다」 테스트가 새 파일을 대조해 통과했다.

잠금:
- 수집기 테스트
  - 숨김 쪽에 3꼴을 더했다: 「…+3.19%, 외국계 매수 유입」 · 「…+3.19% ↑」 · 「…급락 -8.20%, 기관 매도 출회」
  - 남김 쪽에 반례 4꼴을 더했다: 「에코프로(086520) 급등, 2차전지 대규모 수주」 · 쉼표 없는 재료 · 숫자 뒤 재료 · 재료 뒤 숫자
- pgTAP 픽스처
  - 남아야 하는 뉴스에 K07 · K08 을 더했다. K07 은 옛 마이그레이션이 숨긴 반례, K08 은 수집기가 이미 `auto_market` 으로 넣어 둔 반례다.
  - 숨김 쪽에 H16(N거래일 연속)을 더했다.
  - A1 은 H03 · H04 · H05 · H16 시세 한 줄 4꼴이 계속 숨는지, A2 는 반례의 숨김이 풀리는지 본다.
- 논리(정규식) 변경이라 사람 확인 표시를 붙였다.

_레인 D_

### IN-60: 코드가 0개가 되면 effect 가 바로 끝나서 이전 entries · 기준선이 그대로 남는다

**Status:** fixed
**Files modified:** `webapp/src/lib/use-stock-feed.ts`, `webapp/src/lib/__tests__/use-stock-feed.test.tsx`
**Commit:** 938ec4d1
**Applied fix:** WR-61 재구성으로 `sig === ''` 조기 반환이 없어져, 빈 집합에서도 기준선이 정리된다. 이 커밋은 코드 집합이 바뀌면 빠진 코드의 entries 를 그 자리에서 지운다(빈 집합이면 전부 지운다 · 바뀐 게 없으면 상태 신원 유지). 빠진 코드는 「부른 적 없음」으로 되돌려서, 다시 들어오면 새 코드처럼 곧 조회하고 그 첫 응답이 새 기준선이 된다. 테스트: 0개로 비우면 entries 0, 다시 들어온 첫 응답의 글은 강조하지 않음 · 빠지기만 하면 entries 즉시 정리 + 요청 0.

_레인 C_

### IN-61: 영구 실패 · 형식 밖 코드는 「불러오는 중」 / pending 자리에 끝없이 머문다 — 오류와 로딩을 구분할 수 없다

**Status:** fixed
**Files modified:** `webapp/src/lib/use-stock-feed.ts`, `webapp/src/components/trading/feed/stock-feed-context.tsx`, `webapp/src/components/trading/feed/feed-rows.tsx`, `webapp/src/components/trading/workbench/breakout-strip.tsx`, `webapp/src/components/trading/card/card-news-strip.tsx`, `webapp/src/lib/__tests__/use-stock-feed.test.tsx`, `webapp/src/components/trading/__tests__/card-news-strip.test.tsx`, `webapp/src/components/trading/__tests__/breakout-strip.test.tsx`
**Commit:** 919c17ed
**Applied fix:**
- 훅이 코드별 연속 실패 회차를 세서 `STOCK_FEED_FAIL_AFTER`(3회차 ≈ 30초) 넘은 코드를 `failed` 로 내보낸다. 응답이 오면 바로 빠지고, 바뀐 게 없으면 신원을 유지한다.
- catch 는 `console.warn` 으로 `status` · `code` · `message` · 코드 수를 남긴다. 탭마다 1분에 1번이다(무로그 fail-safe 금지).
- 문맥에 `StockFeedFailedContext` · `useStockFeedFailed(code)` 를 더했다. 형식 밖 코드(`SHORT_CODE_RE`)는 폴링 대상이 아니라서 처음부터 실패로 본다.
- 첫 응답 전인데 실패 중이면 돌파 상세는 「뉴스·공시를 불러오지 못했어요」를 띄우고, 상따 띠는 같은 높이의 누를 수 없는 줄(`data-state="error"`)을 띄운다. 마지막 entries 가 있으면 지금처럼 그 값을 보인다.
- 요청 수는 늘지 않는다(재시도는 기존 주기 그대로).

_레인 C_

### IN-62: 묶음 경계가 사용자별 카드 코드와 공용 돌파 코드를 섞어서, 서버 5초 캐시를 사용자끼리 나눠 쓰지 못한다

**Status:** fixed
**Files modified:** `server/src/routes/news-by-stock.ts`, `server/tests/routes/news-by-stock.test.ts`
**Commit:** 49e857f6
**Applied fix:** 레인 C 가 제시한 서버 쪽 해법이다. 웹은 편집하지 않아 웹 요청 수는 그대로다.
- 캐시 키를 「정렬한 코드 집합 | days | limit」 에서 「days | limit | 코드」 로 바꿨다.
- 요청 코드 가운데 5초 안에 누가 부른 코드(진행 중 promise 포함)는 재사용하고, 빠진 코드만 입력 순서로 모아 RPC 1회로 부른다. 한 RPC 결과는 그 RPC 로 부른 코드 칸들이 함께 가리킨다.
- 실패는 캐시하지 않는다. 그 RPC 의 칸만 지우고, 적중 코드 칸은 남긴다.
- 만료 칸은 RPC 를 새로 부를 때 정리한다. 기존 정책과 같다(별도 개수 상한은 원래 없었다). 그래서 맵은 TTL 안에 부른 코드 수를 넘지 않는다.
- 응답 `asOf` 는 쓴 RPC 결과 중 가장 오래된 계산 시각이고, `feedAt` 은 가장 최근 값이다.
- 응답 모양 · 입력 순서 · 글 없는 코드 · `Cache-Control` · 전용 레이트리밋은 그대로다.

등록 부수효과: `stock_feed_by_codes(p_register := true)` 는 RPC 로 간 코드만 `kis_news_targets.last_requested_at` 을 갱신하고, 그 갱신도 RPC 안에서 60초에 한 번이다. 캐시 칸은 5초면 지나므로 계속 조회되는 코드는 늦어도 TTL 한 번 뒤 RPC 로 가서 등록이 이어진다. 집합 키 때와 같은 보장이라, 캐시 적중 때문에 수집 대상에서 떨어지는 코드는 없다.

테스트(9건 추가 · 기존 1건 `toBe` → `toEqual`):
- 사용자 A(X,Y) · B(X,Z) 순으로 부르면 둘째 RPC 는 Z 만 부르고 X 는 나눠 쓴다.
- 모든 코드가 적중이면 RPC 0회다.
- 빠진 코드는 입력 순서로 모은다.
- 만료는 코드마다 따로 따지고, 다시 부르는 RPC 는 `p_register: true` 다.
- 만료 칸 정리로 맵 크기는 4에서 1로 준다.
- days · limit 이 다르면 다른 칸이다.
- asOf · feedAt 합치기, 실패 시 칸 정리, 라우트 응답 순서 · 모양도 잠갔다.

_레인 D_

## Skipped Issues

### IN-02: 쪽 상한(`capped`)에 닿으면 `lastSeen` 이 최신으로 건너뛰어 그 아래 틈은 다시 받지 않는다

**File:** `workers/kis-news-sync/src/collector.ts:395-401`, `workers/kis-news-sync/src/collector.ts:427-430`
**Reason:** 틈을 메우는 어떤 수정이든 그 틈을 받아 오는 **한투 호출이 늘어난다**. 이 레인 지시(「외부 API 호출량이나 수집 대상을 늘리는 수정은 하지 말고 skipped + 선택지」)에 따라 보류했다. 경고 로그(`page cap reached`)는 이미 있다. CR-01 수정으로 「수정본 때문에 생기던 조용한 멈춤」 경로는 사라졌다.
**선택지:**
1. **이어 받기 커서(리뷰 안).** capped · stalled 면 마지막 커서를 메모리 `pendingCursor` 에 둔다. 다음 feed 흐름에서 최신 1쪽 뒤에 그 커서부터 남은 쪽 예산(빠른 창 최대 5쪽/걸음 안)만큼 이어 받는다. 설계 상한(걸음당 5쪽)은 그대로지만 틈이 있을 때 실제 호출은 늘어난다. 실행이 끝나면 메모리 커서는 사라진다(DB `last_srno` 는 RPC 가 이미 최신으로 올림).
2. **실행 간 이어 받기까지 원하면** `kis_news_state` 에 `resume_srno` 같은 칸과 RPC 변경이 필요하다. 이 레인 밖(DB · supabase 레인)이다. 필요한 DB 변경은 다음과 같다: `kis_news_state` 에 `pending_cursor_srno text NULL` 추가, 그 칸을 읽고 쓰는 RPC(또는 `kis_news_ingest` 의 `last_srno` 갱신 조건) 수정.
3. **현행 유지.** 설계상 감수(Pitfall 3) 그대로 두고 F · G 공시 안전망과 `page cap reached` warn 으로 관찰한다.
**Original issue:** 경고는 남기지만, 5쪽(빠른 창)이나 30쪽(느린 실행)을 넘는 틈은 일반 뉴스에서 영구히 빠진다.

_레인 A_

### IN-34: 인증 없는 묶음 조회가 등록 상한(200)을 밀어낼 수 있다

**File:** `server/src/routes/news-by-stock.ts:67-75`, `supabase/migrations/20261112200000_kis_news_collector.sql:155-163`
**Reason:** 설계 판단이 필요해 코드로 고치지 않았다.
- 무인증 등록은 D-03(gh-trade 클라 계약)이다.
- 마스터에 없는 코드는 이미 `kis_news_targets_list` 의 `JOIN stocks` 로 상한 몫에서 빠진다.
- 남은 공격(마스터 코드를 돌려 부르기)을 막는 방법은 셋이다.
  - IP 당 등록 빈도 제한: 사무실 NAT 를 공유하는 gh-trade 클라 여러 대의 정상 등록까지 깎는다.
  - 로그인 사용자만 등록: 클라 계약을 바꾸고 재배포해야 한다.
  - 등록 상한 확대: 한투 호출량이 늘어 「호출량 확대 금지」에 걸린다.
- 셋 다 운영 · 계약 결정이라 이 레인에서 가장 보수적인 선택은 「바꾸지 않음」이다.
**선택지:**
- (a) gh-trade 클라에 등록용 헤더 · 토큰을 주고, 그 요청만 `p_register: true`. 클라 재배포가 필요하다.
- (b) 웹 작업대 경로만 로그인 사용자 등록으로 나눈다.
- (c) 같은 IP 의 요청당 새 코드 등록 수에 상한을 둔다. 사무실 IP 실측 뒤 정한다.
**Original issue:** GET /api/news/by-stock 은 인증 없이 최대 100코드를 등록하고 IP 당 분 600회까지 허용한다. 그래서 아무나 마스터 코드 묶음을 돌려 부르면 정상 등록 종목이 상한 200 밖으로 밀려 `collectedAt` 이 null 로 남는다.

_레인 B_

### IN-36: server · home-sync 가 6인자 RPC(`p_min_disclosures`)를 전제한다 — DB 먼저 배포 필수

**File:** `server/src/routes/news-by-stock.ts:74`, `workers/home-sync/src/pipeline/loadSurges.ts:239`
**Reason:** 코드로 고칠 것이 없다. 지적한 배포 순서 위험은 이미 해소됐다.
- `docs/inbox/from-gh-trade/261113-news-disclosure-quota.md` 처리 기록: 「DB push → server `gh-radar-server-00096-fnv`(스모크 15/15) → home-sync `e762eb75` 순서로 배포」.
- `.planning/phases/43-tender-offer-telegram-alert/43-08-SUMMARY.md`: 「20261113300000 … 이미 원격 적용 · 원격 `stock_feed_by_codes` 6인자 그대로 확인」.

이번 레인의 새 마이그레이션 3개는 모두 같은 6인자 서명을 CREATE OR REPLACE 하거나(`stock_feed_by_codes` · `stock_title_needles` · `kis_news_ingest`) 기존 서명을 유지한다. 그래서 새 배포 순서 의존을 만들지 않는다.

PGRST202 대비 폴백 코드(5인자 재시도)는 이미 지나간 배포 창만을 위한 코드라 넣지 않았다. 배포 체크리스트 쪽(메모 「배포 경로는 diff 디렉터리별로 대조」에 `supabase/migrations` 를 대조 항목으로 넣기)은 문서 · 운영 결정이라 상위 보고에 넘긴다.
**Original issue:** 두 호출은 `p_min_disclosures` 를 이름 인자로 넘긴다. 그래서 20261113300000 이 원격에 적용되기 전에 이미지가 나가면, PostgREST 가 함수를 찾지 못해(PGRST202) 묶음 조회가 500 이 되고 home-sync 는 throw 한다.

_레인 B_

## UI 감사 수정

(41-UI-REVIEW.md 「Top Fixes」 — REVIEW frontmatter 집계에 넣지 않는다. 4번 「띠 터치 높이」 는 감사가 철회해 대상이 아니다.)

### UI-1: 돌파 표 행 선택을 키보드로 — 탭 순서 · Enter/Space 토글 · aria-selected · aria-expanded · aria-controls

**Status:** fixed
**Files modified:** `webapp/src/components/trading/workbench/breakout-strip.tsx`, `webapp/src/components/trading/__tests__/breakout-strip.test.tsx`
**Commit:** 7d490ad1
**Applied fix:** 코드가 있는 행만 `tabIndex=0` 를 받고, Enter · Space 로 마우스 클릭과 같은 선택 토글을 한다(Space 의 페이지 스크롤은 막는다). 키를 누른 대상이 행 자신일 때만 토글해서, 행 안 「추가」 · ✕ 버튼의 키는 번지지 않는다. 행은 `aria-selected` · `aria-expanded` 를 갖고, 선택된 행은 `aria-controls` 로 표 아래 상세(`useId`)를 가리킨다. axe 4.11 기준 `row` 역할에 허용된 속성이다. 코드 없는 행은 탭 순서에서 빠진다. 마우스 · 터치 동작과 모양은 그대로다. 키보드 포커스 표시는 전역 `*:focus-visible` 링이 맡고, 터치 기기에서는 전역 규칙대로 그리지 않는다.

### UI-2: 뉴스 링크 줄 aria-label 에 종류가 읽히게

**Status:** fixed
**Files modified:** `webapp/src/components/stock/feed-kind-badge.tsx`, `webapp/src/components/stock/news-item.tsx`, `webapp/src/components/stock/__tests__/news-item.test.tsx`
**Commit:** ebf7b99a
**Applied fix:** 링크 접근 이름을 `{종류} · {제목} 원문 보기 (새 창)` 로 바꿨다(예: 「뉴스 · 가람전자, … 원문 보기 (새 창)」). 종류 낱말은 배지와 같은 표(`FEED_KIND_LABEL`, feed-kind-badge 에서 export)에서 가져온다.

### UI-3: 뉴스 배지 대비 · 빈 띠 문구 색

**Status:** fixed
**Files modified:** `webapp/src/styles/globals.css`, `webapp/src/styles/__tests__/tds-tokens.test.ts`, `webapp/src/components/trading/card/card-news-strip.tsx`, `webapp/src/components/trading/__tests__/card-news-strip.test.tsx`
**Commit:** 1261299c
**Applied fix:** 라이트 `--feed-news` 를 `var(--muted-fg)`(4.19 : 1)에서 `var(--fg-2)`(grey800 #333d4b · 배경 `--muted` 위 9.97 : 1)로 바꿨다. `globals.css` 의 기존 회색 토큰 가운데 4.5 : 1 을 넘는 가장 옅은 값이다. grey700 같은 중간 토큰은 없어서 새 색을 만들지 않았다. 다크는 `--muted-fg` 가 `--muted` 위 5.14 : 1 로 통과라 그대로 뒀다. 빈 띠 「최근 3일 뉴스·공시 없음」 은 `--faint` 에서 `--muted-fg` 로 바꿨다(흰 카드 위 4.62 : 1 · 펼친 줄 빈 문구와 같은 색). tds-tokens 테스트에 라이트 · 다크 뉴스 배지 대비 ≥ 4.5 가드를 더했다.

### UI-5: 칩 mini 배지 간격 · 펼친 줄 글자 시작 정렬

**Status:** fixed
**Files modified:** `webapp/src/components/trading/workbench/breakout-strip.tsx`, `webapp/src/components/trading/card/card-news-strip.tsx`, `webapp/src/components/trading/feed/feed-rows.tsx`, `webapp/src/components/trading/__tests__/card-news-strip.test.tsx`, `webapp/src/components/trading/__tests__/breakout-strip.test.tsx`
**Commit:** b63b7e49
**Applied fix:** 돌파 칩 · 표의 공/뉴 배지 묶음 `gap-0.5` → `gap-1`(목업 4px). 상따 띠 펼친 영역 래퍼를 `px-3` → `px-2` 로 줄여, 줄의 `px-1` 과 합쳐 띠 글자(12px)와 시작을 맞췄다. 같은 4px 어긋남이 돌파 상세 머리 ↔ 글 줄에도 있었다. 그래서 상세 상자를 `px-2` 로 바꾸고 머리에 `px-1` 을 더했다(글자 위치 12px 유지). `FeedRows` 빈 문구에도 `px-1` 을 넣어 같은 자리에서 시작하게 했다. 강조 배경의 둥근 모서리용 `px-1` 은 그대로다.

---

_Fixed: 2026-11-15T09:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## 병합 뒤 회귀

병합 master(44025c90) 기준, 전용 worktree 에서 `--maxWorkers=2`:

| 패키지 | 결과 |
|---|---|
| relay | 2005 통과 · 1 skip |
| webapp | 258 파일 · 6334 통과 · 1 skip |
| server | 58 파일 · 1043 통과 |
| shared | 1378 통과 · 2 skip |
| kis-news-sync | 273 통과 |
| home-sync | 188 통과 |
| typecheck | webapp · server · kis-news-sync · home-sync · shared 0 오류 |

## 새 마이그레이션 (원격 미적용)

- `20261115100000_stock_feed_register_lock_order.sql` (WR-32)
- `20261115110000_kis_news_title_key_middle_dot.sql` (IN-32 · 멱등 소급)
- `20261115120000_stock_title_needles_tighten.sql` (IN-33)
- `20261115130000_kis_news_auto_market_anchor.sql` (IN-35 · 숨김 해제 소급 — 수집기 이미지와 같이 배포)

## 배포가 필요한 표면

1. DB `supabase db push` — 위 4개(서명 변경 없음)
2. `workers/kis-news-sync` 이미지 — CR-01 · WR-01 ~ 04 · IN-01 · IN-03 ~ 05 · IN-09 · IN-35 (`scripts/deploy-kis-news-sync.sh`)
3. server — WR-31 · IN-30 · IN-31 · IN-62 + shared(WR-30 · IN-32) (`scripts/deploy-server.sh`)
4. home-sync — shared(WR-30 · IN-32) 반영 재빌드
5. webapp — CR-60 · WR-60 ~ 63 · IN-60 · IN-61 · UI-1 ~ 5 (git push)

## 남은 위험 · 확인할 것

- CR-01: 「한투는 일련번호 시각으로 쪽을 자른다」는 실측 표본 3개에서의 추론. 배포 뒤 slow 실행 로그 `feed paging stalled` 경고 0건 확인.
- WR-02: 장애 때 5xx 와 함께 오는 모르는 msg_cd 가 5번이면 그날 한도 의심 표시(다음 실행이 확인 호출 1건으로 재개). 운영 `kis unknown error` 의 msgCd 를 모아 일시 장애 코드만 `transient` 로 등록.
- WR-30 · IN-35: 시황 · auto_market 규칙이 좁아져 다른 꼬리(「, 52주 신고가」 등)의 시세 한 줄이 다시 보일 수 있음 — 보이면 허용 낱말을 늘리는 새 소급.
- IN-33: 본주 이름 2자 그룹 우선주(「SK우」)는 제목에 「SK우」 가 있는 기사만 남음 — 필요 시 별칭 표.
- CR-60: 처음 보여도 작성 30분 넘은 글은 새 글 강조 안 함.
- UI-3: 라이트 「뉴스」 배지 글자가 `--fg-2` 로 진해짐(목업과 다름 — 화면 확인).

---

_Fixed: 2026-11-15T09:55:54Z_
_Fixer: Claude (gsd-code-fixer × 4 레인)_
_Iteration: 1_
