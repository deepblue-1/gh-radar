---
phase: 37-tick-viewer
fixed_at: 2026-11-04T05:15:00+09:00
review_path: .planning/phases/37-tick-viewer/37-REVIEW.md
iteration: 1
findings_in_scope: 25
fixed: 25
skipped: 0
deferred: 11
status: partial
---

# Phase 37: 코드 리뷰 수정 보고

**수정 시각:** 2026-11-04
**원본 리뷰:** .planning/phases/37-tick-viewer/37-REVIEW.md
**회차:** 1 (fix_scope = all)

**요약:**
- 리뷰 지적 36건 중 이번 범위 25건(Part A 11 · Part B 14) — 수정 25 · 건너뜀 0
- **보류 11건(Part C webapp — WR-60 ~ WR-65 · IN-60 ~ IN-64) + WR-02 webapp 후속:** phase 38 브랜치(`phase-38-own-orders`, master 미병합 커밋 19개)가 같은 webapp 틱 파일을 고치고 있어 사용자 결정(2026-11-04)으로 phase 38 병합 뒤 별도 라운드(`37-REVIEW-FIX-R2.md`)에서 고친다.
- 수정기 둘이 각자 격리 worktree 에서 돌았고, 오케스트레이터가 master 에 fast-forward(A) · cherry-pick(B) 했다. 겹친 파일은 `server/src/services/ticks.ts` 하나(자동 병합).
- master 합친 뒤 재검증: shared ticks 248(+2 skip) · tick-convert 158 · tickgw 48 · server 751(전체 1회 `ticks.test.ts` ③ 1건 실패 → 단독 · 전체 재실행 2회 모두 통과 = 부하 flaky) · webapp ticks 353 · tsc(shared · server · tickgw · tick-convert · webapp) 0 · pgTAP tick_viewer 130/130 PASS · 배포 스크립트 `bash -n` ok.
- 배포 안 함: 새 마이그레이션 3개(`20261104300000` · `300100` · `300200`) · tickgw · tick-convert Job · server 재배포 대기.

## Part A — shared · DB · 오라클

# Phase 37: 코드 리뷰 수정 보고 — Part A

**수정 시각:** 2026-11-04
**원본 리뷰:** /Users/alex/repos/gh-radar/.planning/phases/37-tick-viewer/37-REVIEW.md
**회차:** 1
**범위:** Part A — WR-01 · WR-02 · WR-03 · IN-01 ~ IN-08. 그 밖의 ID 는 다른 에이전트가 맡았다.

**요약:**
- 범위 안 항목: 11
- 수정: 11
- 건너뜀: 0

**검증을 돌린 곳:** 전부 하네스가 만든 격리 worktree `/Users/alex/repos/gh-radar/.claude/worktrees/agent-ae6f01da1e75a19c9` 안에서 돌렸다. 브랜치는 `worktree-agent-ae6f01da1e75a19c9`, 기준 커밋은 `fd6c044d`. 이 worktree 가 이미 격리돼 있어서 에이전트가 따로 worktree 를 만들지 않았다.
- pgTAP: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` → **PASS 130/130**. 수정 전 기준은 109/109 였다. 같은 함수를 쓰는 `tick_grid_team_day.test.sql` 과 `launch_piece_queue.test.sql` 도 PASS. 마이그레이션 102개를 일회용 로컬 컨테이너에 다시 적용한 결과이며, 원격 DB 는 건드리지 않았다.
- shared: `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks- --maxWorkers=2` → 파일 17개 통과, 248 통과 · 2 skip. 2 skip 은 빅텍 선택 골든 2건이다. 골든 출력은 바이트 단위로 그대로다.
- `pnpm --filter @gh-radar/shared exec tsc --noEmit` → 0.
- `server` 의 tsc 는 이 worktree 에서 `@gh-radar/shared` dist 가 빌드돼 있지 않아 원래부터 58건 실패한다. 이 작업은 server 파일의 주석만 바꿨다.
- 새 마이그레이션 3개는 커밋만 했다. `supabase db push` 와 배포는 하지 않았다.

## Part B — server · tickgw · tick-convert · 배포 스크립트

# Phase 37: 코드 리뷰 수정 보고서 (Part B)

**수정 시각:** 2026-11-04
**원본 리뷰:** /Users/alex/repos/gh-radar/.planning/phases/37-tick-viewer/37-REVIEW.md
**반복:** 1
**범위:** Part B만 다뤘다(server · tickgw · workers/tick-convert · 배포 스크립트). WR-01..03 · IN-01..08 · WR-60..65 · IN-60..64는 다루지 않았다.

**요약:**
- 범위 안 지적: 14
- 수정: 14 (이 중 6건은 로직 변경이라 「사람 확인 필요」로 표시)
- 건너뜀: 0

**검증한 곳:** 모든 시험은 격리 worktree `/Users/alex/repos/gh-radar/.claude/worktrees/agent-ad8eea79b05a9b487`(브랜치 `worktree-agent-ad8eea79b05a9b487`)에서 돌렸다. main checkout에서 돌린 것이 아니다. worktree에서 `pnpm install --frozen-lockfile --prefer-offline`을 실행했고, 시험에 필요해서 `packages/shared`의 `dist`를 빌드했다(gitignore 산출물이고 소스는 바꾸지 않았다).

**마지막 확인 결과(모두 `--maxWorkers=2`):**
- `@gh-radar/tickgw` vitest: 3파일 48건 통과, `tsc --noEmit` 깨끗함
- `@gh-radar/tick-convert` vitest: 12파일 158건 통과, `tsc --noEmit` 깨끗함
- `@gh-radar/server` vitest `tests/routes/ticks.test.ts tests/routes/ticks-live.test.ts tests/services`: 6파일 108건 통과, `tsc --noEmit` 깨끗함
- `bash -n`: `scripts/deploy-server.sh`, `scripts/deploy-tick-convert.sh`, `scripts/deploy-tickgw.sh` 통과. deploy-tickgw의 원격 본문(heredoc)은 따로 뽑아 `bash -n`으로 확인했다.
- 지시에 따라 배포 스크립트는 실행하지 않았다. 따라서 `deploy-tickgw.sh --self-test`도 돌리지 않았다. 시각 가드 단언 케이스는 고쳤지만 실행으로 확인하지는 못했다.
- 배포 · push는 하지 않았다.

## 재배포가 필요한 구성요소

| 구성요소 | 해당 지적 |
|----------|-----------|
| **tickgw (radar-gw · `deploy-tickgw.sh`, 평일 21:00 이후)** | CR-31 · WR-31 · WR-32 · WR-33 · IN-30 (WR-34 · IN-33 스크립트 변경은 다음 배포부터 적용) |
| **tick-convert Job (nightly · request · promote · `deploy-tick-convert.sh`)** | CR-30 · WR-30 · WR-36 · IN-32 |
| **server (Cloud Run · `deploy-server.sh`)** | WR-32(tickgw-client 복사 제거) · IN-31 · IN-34 |
| 재배포 없음(스크립트만 바뀜) | WR-34 · WR-35 · IN-33 |

⚠ WR-35 때문에 앞으로 `deploy-server.sh` · `deploy-tick-convert.sh`는 `TICKGW_URL`이 없으면 시작하자마자 종료한다. 끄는 배포만 `TICKGW_DISABLE=1`로 한다. IN-33 때문에 빌드 입력 경로에 커밋 안 된 변경이 있어도 종료한다(`ALLOW_DIRTY=1`이면 `-dirty` 태그로 진행).

## Fixed Issues

### WR-01: 요청 변환 하루 상한이 「행 수」를 세서, 같은 키를 다시 깨우는 Job 실행이 상한에 잡히지 않음

**수정한 파일:** `supabase/migrations/20261104300000_tick_request_cap_trigger_count.sql`(새 파일), `supabase/tests/tick_viewer.test.sql`
**커밋:** 90ae1761
**고친 내용:**
- `tick_convert_requests` 에 `trigger_day date` 와 `trigger_count integer` 열을 더했다.
  - (7) 단계에서 `triggered_at` 을 찍을 때 그날 횟수를 +1 한다. 날이 바뀌면 1 부터 다시 센다.
  - (6) 단계의 ON CONFLICT 로 행을 다시 pending 으로 올려도 이 두 열은 지우지 않는다.
  - 이미 있는 행은 `triggered_at` 기준으로 1회씩 채웠다.
- 상한은 이제 오늘 `trigger_count` 의 합으로 판정한다. 끝난 NOT_UPLOADED 행을 빼는 규칙은 그대로다.
  - 행 단위로 센다. 그래서 같은 (날짜, 거래소) pending 여럿을 Job 하나가 처리해도 각 행이 1씩 센다. 옛 「요청 수」 의미를 지키는 보수적인 셈이다.
- 상한을 건너뛰는 단락을 「이 호출이 Job 을 새로 깨울 수 없을 때」로 좁혔다.
  - 해당하는 경우는 이 키가 running 이거나, 2분 안에 깨운 pending 일 때다. 두 경우 모두 `tick_trigger_blocked` 가 참이라 Job 이 새로 깨워지지 않는다.
  - 따라서 stale pending 재트리거도 이제 상한을 거친다.
- `tick_request_trigger_failed` 는 깨우기가 실패해 Job 이 0회 돌았으면 오늘 횟수를 1 되돌린다.
- 두 함수 모두 CREATE OR REPLACE 하면서 REVOKE PUBLIC · anon · authenticated 와 GRANT service_role 을 다시 적었다.
- pgTAP J2 에 9건을 더했다.
  - 같은 키를 failed 뒤 재요청하면 횟수가 누적되고 상한을 소모한다.
  - stale 재트리거가 상한에 걸리면 capped 이고, 행은 그대로 남는다.
  - 2분 안에 깨운 pending 에 합류하면 capped 가 아니다.
  - 깨우기 실패분은 되돌려진다.
- 기존 단언 하나는 바뀐 의미에 맞게 라벨만 고쳤다.

**적용하지 않은 부분 — 리뷰가 선택으로 둔 (b):** NO_RECORDS · TOO_LARGE 같은 확정 실패에 대해 재트리거를 단락하지 않았다.
- 이유: 그렇게 하면 웹의 「다시 시도」가 should_trigger false 를 받고도 「변환 중」 카드로 들어갔다가 5초 뒤 다시 실패 카드로 깜빡인다.
- 그래서 이번에는 (a) 상한 소모만으로 비용을 묶었다.
- (b)를 하려면 webapp 이 NO_RECORDS 를 TOO_LARGE 처럼 `retry: false` 로 다뤄야 한다(webapp 후속).

### WR-02: 여러 사용자가 합쳐 쓰는 요청을 첫 요청자가 취소하면 다른 사용자 화면에는 「실패」로 보임

**수정한 파일:** `supabase/migrations/20261104300100_tick_request_requesters.sql`(새 파일), `supabase/tests/tick_viewer.test.sql`, `packages/shared/src/tick-api.ts`(주석), `server/src/routes/ticks.ts`(주석), `server/src/services/ticks.ts`(주석)
**커밋:** cad027a8
**설계(D-03 「같은 (종목, 날짜) 동시 요청은 Job 하나로 합친다」와 맞춤) — 요청자 집합:**
- `tick_convert_requests.requesters uuid[]` 를 더했다. 이 요청 회차(pending/running)를 기다리는 사용자 집합이다. `requested_by` 는 그 회차를 연 첫 요청자로, 의미가 그대로다. 기존 행은 `ARRAY[requested_by]` 로 채웠다.
- **요청:**
  - 새 행이거나 끝난 행을 다시 올리면 새 회차가 시작되고 집합은 {본인} 이다.
  - 이미 pending/running 인 행이면 본인을 집합에 더한다(합류). 이때 Job 은 0회이고 상한도 소모하지 않는다. WR-01 의 단락과 `tick_trigger_blocked` 가 새 Job 을 막는다.
- **취소:**
  - pending 이면서 본인이 집합에 있을 때만 본인을 뺀다.
  - 마지막 요청자가 빠져 집합이 비면 그때만 `status = cancelled` 와 `finished_at` 을 찍는다.
  - 응답의 `cancelled` 는 「내 몫을 뺐다」는 뜻이다. 요청 자체가 취소됐는지는 `request.status` 로 본다.
  - running 은 지금처럼 취소하지 않는다.
- **동시성:** 취소도 요청과 같은 (날짜, 거래소) advisory 잠금을 잡는다. 「ON CONFLICT 가 행을 안 바꿈 → 합류 UPDATE」 사이에 마지막 취소가 끼어드는 틈을 막기 위해서다.
- **노출:** `requesters` 는 응답에 내보내지 않는다. day · open · request · cancel 응답은 모두 열을 골라서 만든다. pgTAP 으로도 확인했다.
- pgTAP J3 에 10건을 더했다.
  - 합류하면 집합이 {u1, u2} 가 된다.
  - 같은 사람이 다시 요청해도 집합은 늘지 않는다.
  - 첫 요청자가 취소하면 내 몫만 빠지고 요청은 pending 그대로다.
  - 이미 뺀 사람이 다시 취소하면 false 다.
  - 마지막 요청자가 취소하면 cancelled 가 된다.
  - 다시 요청하면 새 회차가 시작된다.
  - 두 번째 요청자도 자기 몫을 취소할 수 있다.
  - 응답에 requesters 가 없다.
- 기존 J 절의 취소 단언 4건(남의 pending 은 못 취소 · 본인 pending 은 취소 · running 은 못 취소)도 그대로 통과한다.

**webapp 후속(이번에 손대지 않음 — 지시대로 표시 쪽은 미룸):**
1. `webapp/src/components/ticks/tick-viewer-page.tsx` 의 열기 분기 `isActive(r)` 는 stale 일 때만 `convert` 를 부른다. 그래서 이미 변환 중인 키를 연 사용자는 요청자 집합에 들어가지 않는 「수동 대기자」가 된다.
   - 이 상태에서 마지막 요청자가 취소하면, 그 화면의 폴링은 여전히 `cancelled` 를 받는다.
   - 열 때 활성 요청이면 `convert(run, resp, true)` 를 한 번 불러 합류시키면 된다. 이 호출은 Job 0회 · 상한 0 이다. 서버 RPC 는 이미 그렇게 동작한다.
2. 같은 파일 `pollTick` 의 `r.status === 'cancelled'` 분기는 지금 `failed` 카드를 보인다. 이것을 「취소됨 · 다시 요청」 카드로 따로 보이게 하면 리뷰가 말한 최소 수정도 함께 충족된다.
3. 취소 버튼(`cancel`)은 결과와 관계없이 목록으로 이동한다. 그래서 바뀐 `cancelled` 의미 때문에 화면 동작이 달라지지는 않는다. 변경 불필요.

### WR-03: 빅텍 하루 선택 골든은 `.pnl.json` 존재만 보고 켜지는데, 생성기는 크기 초과 `.ticks.zst` 를 「커밋하지 말라」고만 함

**수정한 파일:** `packages/shared/src/__tests__/ticks-pnl.golden.test.ts`, `scripts/tick-oracle/gen-fixtures.sh`, `packages/shared/src/__fixtures__/ticks/README.md`
**커밋:** b0b25336
**고친 내용:**
- `BIGTECH_DAY` 는 이제 `bigtech-1022.pnl.json` 과 `bigtech-1022-a3.ticks.zst` 가 **둘 다** 있을 때만 켜진다. json 만 커밋돼도 CI 가 ENOENT 로 깨지지 않는다.
- 생성기 머리 주석, 크기 초과 안내, 픽스처 README 를 모두 「1.5MB 를 넘으면 두 파일 모두 커밋하지 않는다(로컬 검증용)」로 맞췄다.
- 크기를 넘으면 두 파일을 지우는 방식은 쓰지 않았다. 로컬에서 대조할 수단이 없어지기 때문이다.

### IN-01: `hits15(pct, px, chg)` 와 `DayRateTracker.add(pct, chg, px)` 의 숫자 인자 순서가 반대

**수정한 파일:** `packages/shared/src/ticks/route.ts`, `packages/shared/src/__tests__/ticks-route.test.ts`
**커밋:** 1dc39cbb
**고친 내용:**
- `hits15` 를 `add` 와 같은 `(pct, chg, px)` 순서로 바꿨다. 이 순서는 A3 필드 순서(price_change_type · price_change · trade_price)와도 같다.
- `hits15` 는 shared 안에서만 불리고, `add` 는 워커와 webapp 다섯 곳에서 불린다. 그래서 `hits15` 쪽을 바꾸면 바깥 호출처는 하나도 고칠 필요가 없다.
- 시험 인자를 새 순서로 바꿨고, JSDoc 에 순서를 맞춘 이유를 적었다.

### IN-02: 레코드 인덱스 · 거래소순 · 뒤집힘 · 호가 재구성이 「한 파일 = 한 ISIN」을 전제하는데, 이 전제를 검사하거나 적어 두지 않음

**수정한 파일:** `packages/shared/src/ticks/record-index.ts`, `packages/shared/src/ticks/book.ts`
**커밋:** 2c3b6b47
**고친 내용:**
- `buildTickIndex` 의 JSDoc 에 「단일 ISIN 버퍼 전제」를 적었다. 여러 ISIN 이 섞이면 무엇이 틀리는지, 그리고 여러 ISIN 조각은 먼저 쪼갠다는 규칙(`cutOf`)도 함께 적었다.
- `exchangeOrderOf` · `inversionsOf` · `lastB6Of` 에도 같은 전제를 표시했다.
- `RangeError` 가드는 넣지 않았다. 무필터 `raw20k-0900` 픽스처는 여러 ISIN 이 섞인 버퍼인데, `ticks-members.test.ts` 가 이 버퍼로 머리와 수신순만 쓰는 정당한 용도가 있다. 가드를 넣으면 검증된 동작이 깨진다.

### IN-03: `PcapNsReader` 의 `nonUdp` · `badFrame` 분기가 테스트로 잠기지 않음

**수정한 파일:** `packages/shared/src/__tests__/ticks-framing.test.ts`
**커밋:** 26e4fb28
**고친 내용:**
- 합성 프레임 4종을 더했다.
  - IPv4 + TCP → nonUdp
  - incl 20 → badFrame
  - ulen 이 프레임을 넘음 → badFrame
  - ihl 16 → badFrame
- 그 뒤에 정상 UDP 프레임 1건을 다시 읽어 내는지 단언한다. 기대 카운터는 `{packets: 5, nonIpv4: 0, nonUdp: 1, badFrame: 3}`.

### IN-04: `a3ColumnsOf` 가 필드 오프셋은 레이아웃에서 찾지만 길이는 숫자로 박아 둠

**수정한 파일:** `packages/shared/src/ticks/record-index.ts`
**커밋:** aae0ffda
**고친 내용:**
- `fieldOff` 를 `fieldOf(layout, name, kind, width?)` 로 바꿨다. 이제 `{offset, length}` 를 돌려주고 kind 도 확인한다.
- uint · value22 · str 필드의 길이는 레이아웃 값을 쓴다.
- price(11) · time12(12) · 한 글자 str(1)처럼 고정 폭 파서를 쓰는 필드는 모듈을 읽을 때 길이를 확인한다. 레이아웃 길이가 바뀌면 그 자리에서 throw 한다.
- 골든 출력은 그대로다.

### IN-05: `num()` · `str()` 변환 도우미가 다섯 모듈에 복사돼 있고, `decodeAny` 가 `layoutOf` 를 다시 구현함

**수정한 파일:** `packages/shared/src/ticks/decode.ts`, `orders-krx.ts`, `orders-nxt.ts`, `book.ts`, `density.ts`, `members.ts`(모두 `packages/shared/src/ticks/` 아래)
**커밋:** 017966ce
**고친 내용:**
- `decode.ts` 에 `numOf` · `strOf` 를 두고 export 했다. 다섯 모듈은 이것을 `numOf as num` 으로 import 해서 본문을 바꾸지 않았다.
- `decodeAny` 는 `layoutOf(payload)` 를 부르게 했고, 쓰지 않게 된 `LAYOUTS` · `layoutKey` import 를 지웠다.
- 루트 `export *` 와 이름이 겹치는 곳은 없다(tsc 0).
- shared 틱 시험 248건이 그대로 통과한다. 골든은 바이트 단위로 같다.

### IN-06: `tick_grid_upsert` 는 한 배치 안에 같은 (date, exchange, isin) 가 두 번 오면 배치 전체가 실패함

**수정한 파일:** `supabase/migrations/20261104300200_tick_grid_upsert_dedupe.sql`(새 파일), `supabase/tests/tick_viewer.test.sql`
**커밋:** 1319fa63
**고친 내용:**
- 입력을 `jsonb_array_elements(p_rows) WITH ORDINALITY` 와 `jsonb_to_record` 로 펼친 뒤 `DISTINCT ON (date, exchange, isin) … ORDER BY …, ord DESC` 로 키마다 **마지막 원소**만 남긴다.
- RAISE 대신 이 방식을 고른 이유: 리뷰가 지적한 실패 방식이 「배치 전체 메타 소실」이기 때문이다.
- 모드 규칙과 팀 3칸은 20261103230000 정의 그대로이고, REVOKE/GRANT 도 다시 적었다.
- pgTAP E 에 2건을 더했다(중복 키 → 1행, 마지막 원소가 남음).

### IN-07: 오라클 `scoped_frames` 가 빈 범위에 `None` 을 넣는데, `cmd_pnl` · `cmd_g4cut` 은 바로 튜플로 풂

**수정한 파일:** `scripts/tick-oracle/oracle.py`
**커밋:** fff17a7d
**고친 내용:**
- `scope_of(res, scope)` 도우미를 더했다. 범위가 None 이면 `[oracle] {scope}: 범위 A3 0행 — ISIN · 시간(--hours) · 날짜를 확인` 메시지로 `SystemExit` 한다. 다른 실패 경로와 같은 방식이고 종료 1 이다.
- `cmd_pnl` 과 `cmd_g4cut` 의 튜플 풀기 두 곳을 이 도우미로 바꿨다.
- 확인은 `ast.parse` 까지만 했다. 오라클을 실제로 돌리려면 gh-trade venv 와 원본 pcap 이 필요해 실행하지 않았다.

### IN-08: 생성기 머리의 「.ticks.zst 하나라도 1.5MB 초과면 종료 1」이 decode · launch 에만 적용됨

**수정한 파일:** `scripts/tick-oracle/gen-fixtures.sh`
**커밋:** 34cb47bc
**고친 내용:**
- `check_size <안내> <파일…>` 함수 하나를 두고, decode · pnl(천일) · g4cut · launch 의 끝에서 부른다. 1.5MB 를 넘는 파일이 있으면 `set -e` 로 종료 1 이 된다.
- `pnl --bigtech` 는 선택 픽스처라서 예외로 두었다. 경고만 하고 종료 0 이며, 이 예외를 머리 주석에 적었다.
- decode 는 이제 자기가 만든 세 파일만 잰다. 예전에는 `*.ticks.zst` 전체를 다시 쟀다.
- 확인은 `bash -n` 과 다시 읽기까지만 했다. 생성기는 원본 pcap 이 있어야 돌아가고, 하네스가 임시 셸 스크립트 실행을 막아 함수 단독 시험도 하지 못했다.

### CR-30: 레코드 0건 closed 키 하나가 그날 승격 전체를 실패시킨다

**수정 파일:** `workers/tick-convert/src/tickgw-export.ts`, `workers/tick-convert/src/modes/promote.ts`, `workers/tick-convert/tests/helpers/fake-tickgw.ts`, `workers/tick-convert/tests/promote.test.ts`, `tickgw/src/server.ts`(계약 주석만)
**커밋:** ea2049f2
**재배포:** tick-convert Job
**적용한 수정:**
- `TickgwExportKey.first_recv_ns` · `last_recv_ns`를 `string | null`로 바꿨다. `closed_through_ns`만 필수다.
- `list()`가 키를 하나씩 검사한다. 모양이 틀린 키는 목록 전체를 throw하지 않고 `rejected[]`로 내린다. 바깥 모양(`{date, keys[], unclosed}`)이 틀리면 지금처럼 run 실패다.
- promote에서 처리가 이렇게 바뀌었다.
  - 레코드 0건 키(`records === 0` 또는 `first_recv_ns === null`)는 바이트를 당기지 않고 `incomplete`(「레코드 0(export)」)로 센다.
  - 모양이 틀린 키는 그 키만 `failed`로 센다. 거래소를 읽을 수 있으면 거래소별 실행 기록에 싣고, 못 읽으면 failed 수와 로그에만 남긴다. 나머지 키는 그대로 승격된다.
- 가짜 tickgw를 실제 계약에 맞췄다. 빈 키는 `"0"`이 아니라 `null`을 돌려준다. `listPatch`로 계약을 어긴 키도 흉내 낼 수 있게 했다.
- 시험 3건을 더했다: 0건 키 + 정상 키 → main 0, 모양 위반 키 + 정상 키 → main 1이지만 정상 키는 승격, 거래소를 못 읽는 키.

### CR-31: 20:00 원본 압축(`compressed_files_skipped`)을 무시해 잘린 하루를 「완결 · closed」로 승격

**수정 파일:** `tickgw/src/poller.ts`, `tickgw/src/cache.ts`(주석), `tickgw/src/indexer.ts`(주석), `tickgw/tests/poller.test.ts`
**커밋:** cf5a424c
**재배포:** tickgw
**상태:** fixed: requires human verification (완결 판정 로직이 바뀌었다)
**적용한 수정:**
- 필드 이름은 gh-trade `server/tools/indexer/README.md`(조회 계약 · 운영 경계)와 `IndexerCore.h` `FormatSummaryJson`을 읽고 확인했다(`compressed_files_skipped`, 정수). gh-trade 저장소는 읽기만 했다.
- `applyOk`에서 `meta.compressedFilesSkipped > 0`이면 그 키를 `entry.complete = false`로 둔다(warn 로그 1회). 그 결과는 다음과 같다.
  - 마감 마무리(`closeOne`)가 `!entry.complete` 분기에서 승격 대상에서 뺀다. export에 나오지 않으니 그날 밤 GCS 변환이 맡는다.
  - live 응답이 `X-Tick-Complete:false`가 된다.
  - 유휴 삭제 면제도 풀린다.
- 시험 2건을 더했다: 마감 마무리 응답에 건너뛴 파일이 있으면 closed 아님, 20:00 뒤 처음 연 키도 complete=false.
- **남은 일 1 — 승격률:** 이제 18~20시에 리스가 끝난 키는 대부분 승격되지 않는다. 정확성 쪽 최소 조건만 넣었다. 리뷰가 권한 「19:55부터 오늘 complete 키를 리스와 무관하게 따라잡기」 단계는 넣지 않았다. 승격률을 지키려면 후속 작업으로 판단이 필요하다.
- **남은 일 2 — gh-trade 계약 빈틈:** gh-trade 인덱서 `--query`는 파일표에 없는 `file_id`와 헤더를 읽지 못한 레코드를 경고 로그만 남기고 건너뛴다. 이 둘은 stderr JSON에 세지 않는다(`main.cpp` 범위 순회). 그래서 tickgw는 이런 끊김을 알 수 없다. 필요하면 `scripts/trade-handoff.sh`로 gh-trade에 「건너뛴 레코드 수 필드」를 요청해야 한다.

### WR-30: 승격 경로에 격자 크기 상한(`GRID_MAX_BYTES`)이 없다

**수정 파일:** `workers/tick-convert/src/modes/promote.ts`, `workers/tick-convert/tests/too-large.test.ts`
**커밋:** 4571ded2
**재배포:** tick-convert Job
**적용한 수정:**
- 새 상태 `tooLarge`를 더했다. 카운터와 실행 기록 note `too_large n`이 따라오고, 요약 줄에는 `too_large=`가 붙는다.
- `buildGridFile` 뒤에 `g.bytes.length > GRID_MAX_BYTES`이면 업로드와 upsert를 하지 않는다. 실패로 세지 않으므로 종료 0이고 알림도 없다.
- 받기 전 사전 판정을 더했다. export `bytes`가 `GRID_MAX_BYTES × PREFETCH_FACTOR(2)`를 넘으면 바이트를 당기지 않는다(2Gi Job 메모리 보호).
- 시험 2건을 더했다(받은 뒤 판정, 받기 전 판정).

### WR-31: tickgw 256MB 컨테이너에서 전체 버퍼 복사가 겹쳐 OOM

**수정 파일:** `tickgw/src/cache.ts`, `tickgw/src/server.ts`, `tickgw/src/config.ts`, `tickgw/src/indexer.ts`, `tickgw/tests/server.test.ts`
**커밋:** 56660c00
**재배포:** tickgw
**적용한 수정:**
- `cache.parts()`를 새로 만들었다. 청크를 복사하지 않고 subarray로 돌려준다.
- live와 `export/bytes`는 `sendParts`로 청크를 그대로 흘려보낸다. 이제 `Buffer.concat`이 없다.
- `TICKGW_CACHE_BYTES` 기본값을 128MB에서 96MB로 낮췄다(컨테이너의 40% 이하). 예산 근거는 주석에 적었다.
- ssh stdout 상한 기본값을 32MB에서 20MB로 낮췄다(계약 16MB + 여유 4MB, `DEFAULT_MAX_STDOUT_BYTES`).
- 시험을 더했다: subarray가 같은 메모리를 가리키는지 단언.

### WR-32: 당일 첫 응답(하루치)에 크기 상한이 없음

**수정 파일:** `tickgw/src/cache.ts`, `tickgw/src/server.ts`, `tickgw/tests/server.test.ts`, `server/src/services/tickgw-client.ts`
**커밋:** b3136711
**재배포:** tickgw + server
**상태:** fixed: requires human verification (상태 헤더 덮어쓰기 로직)
**적용한 수정:**
- `LIVE_MAX_BYTES = 8MiB`(보수적 상수)를 두었다.
  - Cloud Run 비스트리밍 응답 한도로 알려진 32MiB의 ¼이다. 그 한도는 배포 환경에서 확인하지 못했고, 주석에 그렇게 적었다.
- `cache.boundedEnd()`가 한 응답의 끝을 정한다.
  - **청크 경계**에서만 자른다. 청크 하나가 119 zstd 프레임 하나라서, 경계에서 잘라야 웹이 온전한 프레임만 푼다.
  - 첫 청크 하나는 상한을 넘어도 싣는다. 계약상 한 프레임은 16MB 이하다. 그래서 한 응답은 max(8MiB, 한 프레임)를 넘지 않는다.
- 응답에 `X-Tick-Offset-End = 자른 끝`과 새 헤더 `X-Tick-More`를 싣는다.
- 남은 바이트가 있으면 폴러 상태가 ready · delayed · blocked여도 `X-Tick-State: loading`으로 낸다. 웹 하루치 받기(use-tick-live ②)는 loading인 동안 이어 받으므로, **webapp을 바꾸지 않아도** 하루치가 여러 응답으로 나뉘어 끝까지 온다.
- server 쪽은 `Buffer.from(res.data)` 복사를 없앴다(`Buffer.isBuffer`면 그대로 쓴다).
- 시험을 더했다: 3·3·3·10MiB 청크에서 끝 offset 순서, More/State 순서, 끝까지 이어받기.
- **남은 일(webapp · shared 담당):**
  - server는 `TICK_LIVE_HEADERS`(packages/shared)에 있는 헤더만 넘기므로 `X-Tick-More`는 아직 브라우저까지 가지 않는다.
  - 증분(「최신 받기」 버튼)에서 응답이 잘리면 8MiB만 붙고, 사용자가 버튼을 다시 눌러야 한다.
  - shared에 `more` 헤더를 더하고, server CORS expose와 webapp이 More=true면 곧바로 다음 요청을 보내는 것은 Part C/shared 담당의 후속 작업이다.

### WR-33: 활성 키 합이 캐시 상한을 넘으면 LRU가 폴링 중인 키를 지우고 다시 받는 고리

**수정 파일:** `tickgw/src/cache.ts`, `tickgw/src/poller.ts`, `tickgw/tests/poller.test.ts`, `tickgw/tests/server.test.ts`
**커밋:** ddc0c709
**재배포:** tickgw
**상태:** fixed: requires human verification (밀어내기 · 백오프 정책 변경)
**적용한 수정:**
- 캐시 합계가 상한을 넘지 않게 바꿨다.
  - `append`가 `"ok" | "full" | "too_large"`를 돌려준다.
  - 붙이기 전에 **보호되지 않은** 다른 키만 LRU로 지워 자리를 만든다.
  - 지울 수 있는 몫이 모자라면 아무것도 지우지 않고 `full`이다.
- 폴러가 `setProtect`로 「리스가 살아 있는 키」를 보호한다.
- `full`이면 붙이지 않는다. 커서도 그대로 두고 백오프한다(5→10→…60초, delayed). 마감 마무리에서는 실패 시도로 센다.
- 키 하나가 혼자 상한을 넘으면(`too_large`) 지우지 않고 그날 폴링을 멈춘다(blocked, complete=false).
  - `tooLargeKeys`가 그 판정을 기억한다. 그래서 엔트리가 지워진 뒤 다시 열어도 08:00부터 다시 받지 않는다.
  - 지난 날의 판정은 날짜가 바뀌면 정리한다.
- 시험 3건을 더했다: 보호 · full · too_large 캐시 단위, 폴러 보호와 리스 해제 뒤 자리 얻기, 너무 큰 키 정지와 재오픈.

### WR-34: tickgw 배포 시각 가드가 20:00~21:00 승격 창을 보호하지 않고, 실패 시 되돌림이 없음

**수정 파일:** `scripts/deploy-tickgw.sh`
**커밋:** 215338d3
**재배포:** 없음 (다음 tickgw 배포부터 적용)
**적용한 수정:**
- `daytime_blocked`를 평일 08:00 이상 21:00 미만으로 넓혔다. 메시지와 머리 주석에 근거(마감 마무리 20:01, 승격 20:10 · 20:40, KEEP_UNTIL 21:00)를 적었다. self-test 케이스에 `2000 → 1`, `2059 → 1`, `2100 → 0`을 넣었다.
- 원격 본문에 되돌림을 넣었다.
  - 교체 전 이미지(`docker inspect .Config.Image`)를 적어 둔다.
  - `run_container` · `wait_health` · `fail_rollback`을 함수로 뺐다.
  - healthz나 자기 시험이 실패하면 새 컨테이너를 지우고 **교체 전 이미지로 다시 기동**한다.
  - 되돌림에 쓰도록 env-file은 확인이 끝난 뒤에 지운다(tmpfs, 0600, EXIT trap은 그대로).

### WR-35: 선택 env `TICKGW_URL`을 빠뜨린 재배포가 당일 경로를 조용히 끔

**수정 파일:** `scripts/deploy-server.sh`, `scripts/deploy-tick-convert.sh`
**커밋:** c24f0d9f
**재배포:** 없음 (스크립트)
**적용한 수정:**
- 두 스크립트 모두 `TICKGW_URL`이 없고 `TICKGW_DISABLE=1`도 아니면 **ERROR로 종료**한다.
  - 라이브 값을 읽는 방법(`--format=export | grep -A1 'name: TICKGW_URL'`)을 안내한다.
  - `TICKGW_DISABLE`이 0/1이 아니거나, `TICKGW_URL`과 `TICKGW_DISABLE=1`을 함께 주면 거부한다.
- 37-16 「당일 경로 꺼짐」 배포 모드는 `TICKGW_DISABLE=1`로만 할 수 있다. 이때 server는 ⚠ 경고를 찍는다.
- tick-convert가 `TICKGW_DISABLE=1`로 승격을 건너뛸 때, 승격 Job이 이미 있으면 「옛 이미지 그대로 · Scheduler 멈추는 명령」을 stderr로 크게 알린다.
- 라이브 env 자동 조회는 넣지 않았다. 명시 플래그 방식을 택했다.

### WR-36: nightly에서 키 하나만 실패해도 그 날짜 전량을 반복해서 다시 읽음

**수정 파일:** `workers/tick-convert/src/modes/nightly.ts`, `workers/tick-convert/tests/nightly.test.ts`
**커밋:** 8202ef9d
**재배포:** tick-convert Job
**상태:** fixed: requires human verification (날짜 재선택 정책 변경)
**적용한 수정:**
- `failedNightlyRunsOf`를 더했다. 실행 기록은 실행마다 새 행이 쌓이는데, 거래소별 nightly ok=false 행 수의 최댓값을 센다.
- `nightlyDatesOf`가 `NIGHTLY_MAX_FAILED_RUNS(2)`회를 넘은 날짜를 더 고르지 않는다. 일시 오류는 다시 잡히고, 영구 실패는 3번째에서 멈춘다(최대 20회 대신 3회).
- 포기한 날짜는 실행마다 warn 한 줄로 남긴다(「nightly --date D로 수동 재변환」 안내 포함).
- `--date`는 이 규칙과 상관없다.
- 시험을 더했다: 3회 실패 날짜는 포기, 2회는 다시 고름, request 실패는 세지 않음.
- **남은 일:** 리뷰가 권한 「실패 키만 요청 큐로 넘기기」는 supabase 변경이 필요해서 넣지 않았다. 빠진 키는 요청 변환으로 채운다.

### IN-30: `runIndexer` 상한 초과 경로가 0으로 채운 버퍼를 만들고, 종료코드 삼항식은 죽은 코드

**수정 파일:** `tickgw/src/indexer.ts`, `tickgw/tests/indexer.test.ts`
**커밋:** c3f54157
**재배포:** tickgw
**적용한 수정:**
- `size`는 실제로 넣은 청크만 센다.
- 상한을 넘거나 kill되면 모은 청크를 버리고 `stdout: Buffer.alloc(0)`을 돌려준다.
- `exitCode = code ?? -1`로 줄였다.
- 시험을 더했다: 상한 초과면 stdout 길이 0.

### IN-31: 요청 변환 트리거 타임아웃 뒤 되돌림이 중복 실행을 낳을 수 있음

**수정 파일:** `server/src/services/tick-convert-trigger.ts`, `server/src/services/ticks.ts`, `server/tests/routes/ticks.test.ts`
**커밋:** 3003b499
**재배포:** server
**상태:** fixed: requires human verification (되돌림 정책 변경)
**적용한 수정:**
- `TRIGGER_TIMEOUT` 상수와 `isAmbiguousTriggerFailure`를 더했다.
- 타임아웃(status 0 · TIMEOUT)이면 `tick_request_trigger_failed`로 되돌리지 않는다. warn 로그를 남기고 stale 2분 규칙에 맡기며, 응답은 200 `triggered: true`다.
- 다른 실패(403 · 네트워크)는 지금처럼 되돌리고 502를 낸다.
- 시험을 더했다.

### IN-32: 통독 중 잘린 꼬리 파일 수가 보고되지 않음

**수정 파일:** `workers/tick-convert/src/modes/nightly.ts`, `workers/tick-convert/src/modes/request.ts`, `workers/tick-convert/tests/request.test.ts`
**커밋:** ad85b686
**재배포:** tick-convert Job
**적용한 수정:**
- nightly `ExchangeResult`와 request `RequestRunResult`에 `truncatedFiles`를 더했다.
- 0이 아니면 warn 로그를 남기고, 실행 기록 error에 note `truncated n`을 붙인다(실패는 아니다). 요약 줄에는 `truncated=`가 붙는다.
- 시험을 더했다: 10시 파일 끝 5B를 자르면 `error: "truncated 1"`이고 main은 0.

### IN-33: 배포 스크립트가 HEAD SHA로 태그하면서 작업 트리를 빌드하고, IAP 실패를 「tickpull 미설치」로 알림

**수정 파일:** `scripts/deploy-tickgw.sh`, `scripts/deploy-tick-convert.sh`
**커밋:** acb4a707
**재배포:** 없음 (스크립트)
**적용한 수정:**
- 두 스크립트가 빌드 입력(Dockerfile COPY 경로)에서만 `git status --porcelain`을 본다. 다른 세션이 관계없는 파일을 바꿔도 막지 않게 하려고 경로를 좁혔다.
- 변경이 있으면 종료한다. `ALLOW_DIRTY=1`이면 태그와 APP_VERSION을 `<sha>-dirty`로 바꿔 진행한다.
- deploy-tickgw ③은 원격 첫 줄 `REMOTE_OK` 표지로 VM에 닿았는지 판정한다. 표지가 없으면 「IAP SSH 실패(종료 n)」로 따로 알린다. `--help` 출력 범위도 늘어난 머리에 맞췄다.

### IN-34: `openTick`이 RPC 응답 필드 일부를 모양 검사 없이 단언 캐스트함

**수정 파일:** `server/src/services/ticks.ts`, `server/tests/routes/ticks.test.ts`
**커밋:** 15f7b8ca
**재배포:** server
**적용한 수정:**
- `checkOpenShape`가 **서명 전에** 응답 모양을 본다.
  - 봉투: `date` · `exchange`(KRX|NXT) · `isin` · `eta_s`(유한 수)
  - grid: `bytes` · `records` · `a3_count`(음이 아닌 정수), `mode`(열거값), `sources`(문자열 배열), `fmt` · `created_at`(문자열), `first_recv_ms` · `last_recv_ms`(수 또는 null)
- 하나라도 어긋나면 500 DB_ERROR이고 서명은 0회다.
- 위반 7가지를 시험에 더했다.

---

_Fixed: 2026-11-04_
_Fixer: Claude (gsd-code-fixer × 2 parts)_
_Iteration: 1_
