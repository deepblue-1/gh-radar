---
phase: 19-account-order-journal
fixed_at: 2026-10-04T09:10:00+09:00
review_path: .planning/phases/19-account-order-journal/19-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 19: 코드 리뷰 수정 보고서

**수정 시각:** 2026-10-04
**원본 리뷰:** `.planning/phases/19-account-order-journal/19-REVIEW.md`
**반복 차수:** 1
**범위:** Warning 9건(WR-01 ~ WR-09). Info 는 Warning 수정에 자연히 포함된 IN-01 만 처리했다.

**요약:**
- 범위 안 발견: 9건
- 수정: 9건(그중 4건은 사람이 로직을 한 번 더 확인해야 함 — 표 「상태」 칸)
- 건너뜀: 0건

## 배포 순서 (메인 세션용)

| 순서 | 대상 | 포함 커밋 | 비고 |
|---|---|---|---|
| 1 | **DB 마이그레이션** | WR-06 `20261004090000` · WR-09 `20261004090100` | 둘 다 additive/호환이다. 090000 은 새 함수만 더하고 옛 SETOF 함수는 그대로 둔다. 090100 은 `dma_journal_apply` 본문을 교체하지만 반환 모양은 같고 바뀐 것은 skipped 분기의 **읽기**뿐이라, 지금 relay 와도 호환된다. |
| 2 | **relay** (radar-gw) | WR-01 · WR-02 · WR-03 · WR-04 · WR-05 | DB 와 독립적이다. `/healthz` `journal` 키는 추가만 했고 기존 키와 503 판정은 그대로다. |
| 2 | **server** (Cloud Run) | WR-06 | **반드시 DB 090000 적용 뒤에** 배포한다. 새 RPC `dma_journal_orders_for_user_json` 이 없으면 `GET /api/orders` 가 500 을 낸다. |
| 3 | **webapp** (push = 배포) | WR-07 · WR-08 | 백엔드 의존성은 없다. |

WR-09 는 relay 를 고치지 않았고 DB 만 적용하면 된다. 기록기는 RPC 가 준 `rows` 를 그대로 `applied` 로 넘긴다.

## 수정 목록

| ID | 커밋 | 배포 대상 | 상태 | 수정 파일 | 테스트 |
|---|---|---|---|---|---|
| WR-01 | `fb10a1b8` | relay | 수정 완료 | `relay/src/journal/observer.ts` · `relay/src/journal/types.ts` · `relay/tests/journal-observer.test.ts` (운영 문서 `paused:"cursor"` 절은 WR-05 커밋 `94477b85` 에 들어 있음) | journal-observer +2 |
| WR-02 | `4454026f` | relay | 수정 완료: **사람 확인 필요** | `relay/src/journal/observer.ts` · `relay/src/journal/writer.ts` · `relay/src/journal/types.ts` · `relay/tests/journal-observer.test.ts` · `relay/tests/journal-writer.test.ts` | journal-observer +5 · journal-writer +1 (②·close 단언 갱신) |
| WR-03 | `6d8307be` | relay | 수정 완료 | `relay/src/journal/writer.ts` · `relay/src/journal/types.ts` · `relay/src/journal/status.ts` · `docs/relay-operations.md` · 테스트 fixture 3파일 | journal-writer +2 · journal-status +1 단언 |
| WR-04 | `62889493` | relay | 수정 완료: **사람 확인 필요** | `relay/src/journal/access.ts` · `relay/src/journal/observer.ts` · `relay/src/journal/status.ts` · `relay/src/journal/types.ts` · `relay/src/dma/envelope.ts` · `relay/src/index.ts` · `docs/relay-operations.md` · 테스트 7파일 | journal-push +2 · journal-status +1 · journal-codec +1 단언 |
| WR-05 | `94477b85` | relay | 수정 완료 | `relay/src/journal/writer.ts` · `relay/src/journal/status.ts` · `relay/src/journal/types.ts` · `docs/relay-operations.md` · `infra/relay/README.md` · 테스트 fixture 5파일 | journal-writer +1 · journal-status +1 단언 · order-api +1 |
| WR-06 | `d4d41f6c` | **DB 마이그레이션 → server** | 수정 완료 | `supabase/migrations/20261004090000_dma_journal_orders_for_user_json.sql`(신규) · `server/src/services/dma-orders.ts` · `server/tests/routes/orders.test.ts` · `supabase/tests/dma_journal_apply.test.sql` · `supabase/tests/dma_journal_schema.test.sql` | server orders +2 · pgTAP apply +4 · schema +3 |
| WR-07 (+IN-01) | `2a76b24b` | webapp | 수정 완료 | `webapp/src/components/trading/today-orders-card.tsx` · `.../__tests__/today-orders-card.test.tsx` | card +5 |
| WR-08 | `16cef0a0` | webapp | 수정 완료: **사람 확인 필요** | `webapp/src/lib/order-notices.ts` · `webapp/src/components/trading/today-orders-card.tsx` · `webapp/src/lib/__tests__/order-notices.test.ts` · `.../__tests__/today-orders-card.test.tsx` | order-notices +4 · card +2 |
| WR-09 | `59b5f096` | **DB 마이그레이션** (relay 수정 없음) | 수정 완료: **사람 확인 필요** | `supabase/migrations/20261004090100_dma_journal_apply_skipped_rows.sql`(신규) · `supabase/tests/dma_journal_apply.test.sql` · `relay/tests/journal-writer.test.ts` | pgTAP apply +6(마이그레이션을 빼고 돌리면 4건 RED 확인) · journal-writer +1 |

## 수정 내용

### WR-01: 전략 커서 읽기 실패가 주문 저널 연결 자체를 막는다

**수정 파일:** `relay/src/journal/observer.ts`, `relay/src/journal/types.ts`
**커밋:** fb10a1b8
**적용한 수정:**
- 연결의 필수 조건을 **주문 커서 하나**로 줄였다.
- 전략 커서 읽기에 실패하면 새 사유 `StrategyPauseReason "cursor"` 로 전략 수신만 멈춘다. 로그인 since 는 0 으로 보내고, 로그인 응답이 와도 전략 기록기를 건드리지 않으며 그 연결의 전략분은 버린다.
- 전략 커서는 `backoffDelayMs`(1→30초)로 따로 다시 읽는다. 읽히면 상태가 live/replaying 일 때 재로그인을 한 번 해서 정확한 전략 since 로 이어받는다. 로그인 중에 복구되면 그 로그인 응답이 커서를 반영한다. 이때 since 0 으로 받은 재생분은 기록기가 중복으로 건너뛴다.
- 리뷰가 지적한 「0 으로 보내 전량 재생」 은 프로토콜상 피할 수 없다. gh-trade 명세는 `since > head` 도 resync 로 처리해 oldest 부터 다시 보내기 때문에, 커서를 모르는 동안 보낼 수 있는 since 값이 0 말고는 없다. 그래서 재생분을 동기 경로에서 버리는 것으로 비용을 막았다.
- `/healthz` `journal.strategy.paused` 에 `"cursor"` 로 드러나며, 503 판정에는 넣지 않았다.

### WR-02: 로그인 성공마다 백오프를 리셋해 1초 무한 재접속

**수정 파일:** observer/writer/types
**커밋:** 4454026f
**적용한 수정:**
1. `#onLogin` 에서 `resetReconnectAttempts()` 를 뺐다. 리셋은 **로그인 뒤 첫 진전** 때 연결당 한 번만 한다. 첫 진전이란 주문 레코드를 실제로 적재했거나(`lastReceivedSeq` 가 전진) live 에 들어선 경우다. 로그인 직후 같은 갭이 반복되면 이제 백오프가 자란다.
2. `JournalPushResult` 에 `"not_ready"`(종료됨 · epoch 미설정)를 새로 뒀다. 관찰자는 이 경우 「저널 큐 상한」 이 아니라 「저널 기록기 준비 안 됨」 이라는 사유로 끊는다. 전략 기록기가 `not_ready` 를 내면 종전 `overflow` 와 같은 일시 중지 경로를 탄다.
3. 성공 응답인데 `epoch === ""` 이면 계약 위반으로 보고 거부와 같은 정지 경로(`rejected` · `stopReconnect`)를 탄다. 매핑 교체도 하지 않는다.

**사람 확인 필요:** 빈 epoch 를 `rejected` 로 확정하면 장중 즉시 503 이 나고, relay 를 재시작해야 풀린다. 리뷰 권고를 그대로 따른 것이다. 게이트웨이 설정 오류를 고친 뒤 relay 재시작이 필요하다는 운영 의미가 맞는지 확인해 주세요.

### WR-03: seq 역행 뒤 게이트웨이 seq 재사용이 debug 로그만 남기고 사라진다

**커밋:** 6d8307be
**적용한 수정:**
- 기록기가 역행을 관측하면, 게이트웨이가 잃은 구간 `(역행 head, 그때의 마지막 수신 seq]` 을 epoch 단위로 기억한다.
- 이 구간의 seq 로 오는 중복은 「seq 재사용 의심」 으로 분류해 error 로그(firstReusedSeq · lostAfterSeq · lostThroughSeq)를 남기고 계수한다.
- head 이하의 재생 중복은 정상이므로 종전처럼 debug 로 둔다. 역행 뒤 게이트웨이가 oldest 부터 재생하는 정상 흐름에서 거짓 경보가 나지 않게 하기 위해서다.
- `/healthz` `journal.duplicatesAfterRegression` · `lastDuplicateAfterRegressionAgeSec` 를 추가했다. 표시 신호이고 503 판정에는 넣지 않았다.
- 리뷰의 「가능하면」 항목인 DB 원문 해시 비교 마이그레이션은 하지 않았다.

### WR-04: 빈 매핑 스냅샷이 전 사용자 가시성을 지운다

**커밋:** 62889493
**적용한 수정:**
- `JournalAccess.replace` 는 유효 행이 0 인 스냅샷을 **메모리와 DB 모두에 적용하지 않는다**. error 로그를 남기고 `emptySnapshotsRejected` 를 센다.
- 부팅 직후(메모리가 빈 상태)에도 같다. 빈 스냅샷을 `dma_journal_sync_access` 로 보내지 않으므로 DB 의 직전 정본이 남는다. 리뷰 안에서는 「이전 스냅샷이 비어 있지 않을 때」 만 거부했지만, 그대로 두면 relay 재시작 직후 빈 스냅샷이 오는 경우 DB 매핑이 지워진다. 그래서 거부 범위를 넓혔다.
- 파서(`parseObserverLoginResp`)가 형식 이상 · null · 상한 초과로 건너뛴 항목 수를 `skippedAccounts` 로 로그인 결과에 실었다. 여기에 빈 식별자로 버린 수를 더해 `skipped` 로 집계한다.
- `/healthz` `journal.mapping` `{ rows, skipped, emptySnapshotsRejected }` 를 추가했다. 계수만 담고 503 판정에는 넣지 않았다.

**사람 확인 필요:** 게이트웨이의 매핑을 **의도적으로 전부 비우는 일**은 이제 relay 가 거부하므로 운영 SQL 로 해야 한다. 그 절차를 `docs/relay-operations.md` 에 적었다. 이 정책이 맞는지 확인해 주세요.

### WR-05: 투영 실패(apply_error)가 운영자에게 보이지 않는다

**커밋:** 94477b85
**적용한 수정:**
- 기록기 health 에 `projectionErrors`(부팅 뒤 누적)와 `lastProjectionErrorAtMs` 를 추가했다. 실패가 있는 배치마다 `health` 이벤트를 낸다.
- `/healthz` `journal.projectionErrors` · `lastProjectionErrorAgeSec`, `journal.strategy.projectionErrors` 를 추가했다. 기존 키는 그대로이고 추가만 했다.
- 지시대로 **503 은 만들지 않았다**. 리뷰의 「N건 이상이면 503」 은 선택지로만 제시된 것이어서, 표시 신호로만 남겼다.
- 운영 문서(상태별 대응)와 README 의 `/healthz` 키 목록을 갱신했다.

### WR-06: 「오늘 주문」 조회가 max_rows(1000)에서 조용히 잘린다

**커밋:** d4d41f6c
**적용한 수정:**
- 새 마이그레이션 `20261004090000_dma_journal_orders_for_user_json.sql` 에 `dma_journal_orders_for_user_json(uuid, date) RETURNS jsonb` 를 만들었다.
  - 기존 SETOF 함수(가시성 정본인 `20260929190000` 본문)의 결과를 같은 정렬로 `jsonb_agg(to_jsonb(r))` 해서 돌려주는 래퍼다. 그래서 가시성 규칙은 여전히 한 곳에만 있다.
  - 권한: STABLE · SECURITY INVOKER, `REVOKE ... FROM PUBLIC` · `FROM anon, authenticated`, `GRANT ... TO service_role`.
- server `listTodayOrders` 가 새 RPC 를 부른다. 응답이 배열이 아니면 빈 목록으로 감추지 않고 500 DB_ERROR 를 낸다.
- 옛 SETOF 함수는 지우지 않았다. 배포 사이 구간에서도 조회가 끊기지 않게 하기 위해서다.

### WR-07: 조회 실패 한 번이 목록과 푸시 행을 가린다 (+ IN-01)

**커밋:** 2a76b24b
**적용한 수정:**
- 조회에 실패해도 직전 성공 결과를 유지한다. 처음부터 실패했으면 `[]` 로 두어, 뒤에 오는 `journal.rows` 푸시 행이 화면에 서게 했다.
- 보일 행이 있으면 목록을 그대로 그리고, 목록 위에 「불러오기 실패 — 목록이 최신이 아닐 수 있어요.」 한 줄(`today-orders-error-note`)만 띄운다. 이 줄은 기존 「기록 지연」 안내와 같은 토큰과 크기를 쓴다.
- 보일 행이 하나도 없을 때만 종전 오류 문구를 낸다. 「오늘 낸 주문이 없어요」 같은 거짓 빈 목록을 내지 않기 위해서다.
- 2·4·8초 지수 재시도를 최대 3회 한다(폴링이 아니다). 언마운트되거나 새 조회가 시작되면 예약된 재시도를 취소한다.
- **IN-01**(겹친 재조회의 응답 역전)도 여기서 함께 해결했다. 조회마다 세대 번호를 매겨, 마지막에 시작한 조회의 응답만 반영한다.

### WR-08: 통보 단위 묶기 로직이 주문 단위 행에서 상태·수량을 틀리게 보인다

**커밋:** 16cef0a0
**고른 방법:** 묶기를 없애지 않고 의미만 고쳤다. 이쪽이 더 작은 정확한 변경이다.
- 묶기를 없애면 상따 조각 매도로 생기는 여러 **주문**을 압축하는 기존 기능이 사라진다. 이는 제품 결정 사항이라 피했다.

**적용한 수정:**
1. `MergedOrderNotice.status` 를 새로 두고 구성원 상태로부터 계산한다. 모두 같으면 그 값이고, 섞이면 `partially_filled` 다.
   - 카드의 상태 칸은 표 배치와 카드 행 모두 대표 행이 아니라 이 값을 그린다.
   - 예: 3건 중 1건만 체결이고 나머지가 부분체결이면, 이제 「체결」 이 아니라 「부분체결」 로 보인다.
2. 취소 · 정정 · 거부로 끝난 자동주문은 묶지 않는다. 다른 행의 취소확인으로 닫힌 원주문처럼 마지막 통보가 A/E 인데 status 가 cancelled 인 행도 포함한다.
   - 그 결과 묶음 상태는 항상 접수 · 부분체결 · 체결 세 값 안에서만 정해진다.
   - 「한 건 한 건이 독립 사건」 이라는 원칙과도 맞다.
3. 수량은 **주문 수량 합**으로 유지했다. 단건 행의 수량 칸(주문 수량)과 같은 뜻이고, 체결이 얼마나 진행됐는지는 상태 칸이 말한다.
   - 리뷰가 제안한 「체결 묶음은 filledQty 합」 은 단건 행과 수량 칸의 뜻이 갈라진다.
   - filledQty 를 새 칸이나 형식으로 보여 주는 것은 UI 추가에 해당하는 제품 결정이라 하지 않았다.
4. 펼침 판정을 「구성원 id 중 하나라도 열린 키를 가지면 열림」 으로 바꿨다. 닫을 때는 구성원 키를 전부 지운다.
   - 이제 행이 A→E 로 바뀌어 다른 묶음에 합류해 `members[0]` 이 바뀌어도, 열어 둔 행이 닫히지 않는다.
   - 렌더 키는 종전대로 `members[0].id` 다.
5. 시각 레이아웃과 토큰은 바꾸지 않았다.

**사람 확인 필요:** 섞인 묶음을 「부분체결」 로 보이는 것과, 끝난 주문을 묶지 않는 것이 트레이더 화면 의미에 맞는지 확인해 주세요.

### WR-09: 커밋 뒤 응답 유실로 재시도하면 그 배치의 실시간 푸시가 빠진다

**커밋:** 59b5f096
**적용한 수정:**
- 새 마이그레이션 `20261004090100_dma_journal_apply_skipped_rows.sql` 에 `dma_journal_apply` 를 다시 정의했다.
  - 본문은 `20260924200100` ⑦ 과 같고(diff 로 확인), 바뀐 곳은 skipped 분기 하나뿐이다. 이 함수를 그 뒤에 재정의한 마이그레이션은 없다.
  - skipped 분기에서, 그 이벤트가 투영할 때 건드리는 키로 행 id 를 모은다. 키는 같은 (gateway, trade_date, account_no) 의 자기 주문번호 · 원주문번호 행과, (gateway, journal_epoch, reject_seq=seq) 의 거부 행이다.
- 추가된 것은 **읽기뿐**이다. 「이벤트 PK 삽입 성공 = 1회 적용」 과 「커서는 적용 트랜잭션 안에서만 전진」 불변식, advisory lock, 포이즌 격리는 그대로다.
- 권한 3줄(REVOKE PUBLIC · anon/authenticated, GRANT service_role)을 다시 명시했다.
- 웹앱 병합은 lastSeq 를 비교하므로, 같은 행을 다시 보내도 결과가 같다(멱등).

**사람 확인 필요:** 운영 relay 의 유일한 쓰기 경로를 교체하는 변경이다. 메인 세션에서 배포한 뒤 다음 두 가지를 확인해 주세요.
- `select count(*) from dma_journal_events where apply_error is not null` 가 늘지 않는가.
- `/healthz` `journal.lastAppliedAgeSec` 가 정상인가.

## 건너뜀 · 범위 밖

- **IN-02**(`notice-status.ts` 의 낡은 주석), **IN-03**(게이트웨이 키를 `DMA_BROKER` 에서 분리), **IN-04**(재투영 RPC): Warning 수정으로 자연히 해결되는 항목이 아니어서, fix_scope 에 따라 손대지 않았다.
- IN-02 는 주석만 고치면 되는 작업이고, IN-04 는 WR-05 로 apply_error 가 보이게 된 뒤의 복구 경로다. 둘 다 후속 quick 후보다.

## 검증 (게이트)

**실행 위치:** 메인 체크아웃 `/Users/alex/repos/gh-radar`(master)에서 직접 실행했다.
- 호출자 지시대로 격리 worktree 를 쓰지 않았다. `git add` 는 파일을 지정해서만 했고, 커밋 전마다 `git status -sb` 를 확인했다.
- 그래서 아래 수치는 이 체크아웃에서 그대로 재현된다.
- 원격 DB 에는 접근하지 않았고, push · 배포는 하지 않았다.

| 게이트 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` | 통과 |
| `pnpm --filter @gh-radar/webapp run typecheck`(+ e2e tsconfig) | 통과 |
| `pnpm --filter @gh-radar/server run typecheck` | 통과 |
| relay `vitest run` | **35 파일 · 931 통과** (수정 전 기준 915 → +16) |
| webapp `vitest --run` | **140 파일 · 3193 통과 · 1 skip** (skip 은 기존 것) |
| server `vitest run` | **33 파일 · 290 통과** (orders 21→23) |
| pgTAP `dma_journal_apply` (전 마이그레이션 52개 재생) | **89/89 PASS** (79 → +4 WR-06 · +6 WR-09) |
| pgTAP `dma_journal_schema` | **96/96 PASS** (93 → +3 WR-06 권한) |
| pgTAP RED 확인 | `--until 20261004090000` 으로 WR-09 마이그레이션을 빼면 WR-09 단언 4건이 `not ok` |

pgTAP 실행 방법:
- 러너 `scripts/verify-dma-orders-price-check.sh` 를 썼다. 로컬 일회용 컨테이너(`public.ecr.aws/supabase/postgres:17.6.1.104`)에서 돌린다.
- 시작 시점에 이 이미지가 로컬 Docker(OrbStack)에 없어서 공개 ECR 에서 직접 받았다(`docker pull`). 러너 자체는 이미지를 받지 않는다.

---

_수정: 2026-10-04_
_수정자: Claude (gsd-code-fixer)_
_반복 차수: 1_
