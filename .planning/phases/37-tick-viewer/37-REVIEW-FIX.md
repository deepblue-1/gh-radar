---
phase: 37-tick-viewer
fixed_at: 2026-11-04T06:40:00+09:00
review_path: .planning/phases/37-tick-viewer/37-REVIEW.md
iteration: 2
findings_in_scope: 36
fixed: 36
skipped: 0
deferred: 0
status: all_fixed
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

## 2라운드 (2026-11-04 · phase 38 병합 120ab5eb 뒤) — Part C webapp 11건 + 후속

- 보류했던 Part C 11건(WR-60 ~ WR-65 · IN-60 ~ IN-64)을 phase 38 병합 위에서 고쳤다(phase 38 에서 해소돼 건너뛴 항목 0). 수정기가 격리 worktree 에서 돌고 오케스트레이터가 master 에 cherry-pick 했다.
- **오케스트레이터 추가 수정 `90173169`(IN-63 후속):** master 에서 e2e `ticks-viewer.spec.ts` 전체를 돌리자 「폰 390 — 「전문」 둘째 레일」 이 순서 의존으로 실패했다(단독은 통과 · IN-63 을 되돌리면 통과). 원인: 폰 「전문」 목록이 높이 0 으로 숨겨진 채 마운트돼 첫 가운데 맞춤이 어긋나는데, IN-63 이 모델 변경 때 다시 맞추지 않았다. `useFixedWindow` 가 `height` 를 내고, 숨김 → 보임 전환을 처음처럼 가운데로 맞추며, 모델만 바뀌면 커서 행 위치 차만큼 scrollTop 을 옮긴다. 그 뒤 e2e 2회 연속 25/25.
- **후속 2건:** WR-02-W(합쳐진 요청 취소 화면) · WR-32-W(`X-Tick-More` 웹 연결) — 아래 Follow-ups.
- **CR-31 후속:** tickgw 19:55 따라잡기(`4d124bf6`) + gh-trade 회신 반영 창 끝 19:59(`794681e6`) · 인덱서 `skipped_records` 미완결 판정(`eb224aa9`).
- **재검증(master):** webapp vitest 전체 5607(+1 skip) · webapp 틱 407 · tsc 0 · server 753 · shared 1124(+2 skip) · tickgw 62 · e2e ticks-viewer 25/25 ×2 · sidebar-tree/accum/teamflow/limitup 49/49.
- **배포:** tickgw `2514ff8e`(radar-gw) · server `90173169`(스모크 15/15 · `X-Tick-More` CORS 노출 확인) · webapp push `90173169`(Vercel).

### Part C 검증 기록(수정기)

- **어디서 돌렸나:** 하네스가 만든 격리 worktree(`.claude/worktrees/agent-aa6494c4039f09371`, 브랜치 `worktree-agent-aa6494c4039f09371`)에서 `pnpm install --frozen-lockfile --prefer-offline` 과 shared 빌드를 한 뒤 돌렸다. 메인 체크아웃이 아니다.
- **webapp 단위:** `vitest run src/lib/ticks src/components/ticks --maxWorkers=2` 결과 26개 파일 · 407건 통과.
- **webapp tsc:** `tsc --noEmit` 오류 0.
- **webapp eslint:** 바꾼 소스 11개 오류 0.
- **server:** `vitest run tests/services/cors-config.test.ts tests/routes/ticks-live.test.ts --maxWorkers=2` 결과 22건 통과. server tsc 오류 0, shared tsc 오류 0.
- **e2e 미실행:** `playwright test e2e/specs/ticks-viewer.spec.ts --workers=1` 을 돌리지 못했다.
  - worktree 에 `webapp/.env.local` · `webapp/.env.test.local` 이 없다. auth setup 과 dev 서버에 Supabase env 가 필요하다.
  - 메인 체크아웃에서 복사하려 했지만 비밀 파일 읽기 가드 훅이 막았다. 가드는 우회하지 않았다.
  - 이번에 더하거나 고친 e2e 2건(WR-60 재생 중 목록으로 · WR-65 새로고침 seq)도 아직 검증되지 않았다.
  - master 에 병합한 뒤 메인 체크아웃에서 다음을 실행해야 한다: `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/ticks-viewer.spec.ts --workers=1`

### Part C 재배포 대상(수정기)

| 대상 | 이유 |
|---|---|
| **webapp (push = Vercel 배포)** | WR-60 ~ WR-65 · IN-60 ~ IN-64 · WR-02-W · WR-32-W 화면 쪽 |
| **server (Cloud Run · `deploy-server.sh`)** | WR-32-W — shared `TICK_LIVE_HEADERS` 에 `X-Tick-More` 가 더해져야 server 가 그 헤더를 중계하고 CORS 로 노출한다. server 를 새로 배포하지 않으면 웹은 `more` 를 늘 false 로 읽는다. 그래도 하루치는 tickgw 의 `loading` 상태로 이어 받으므로 깨지지는 않는다. 증분만 예전처럼 두 번 눌러야 한다. |
| tickgw | 변경 없음(앞 라운드 b3136711 에서 이미 `X-Tick-More` 를 낸다) |

배포 순서는 메모리 규칙(「배포는 relay 먼저 · push 나중」 · 백엔드 먼저)에 맞춰 **server 를 먼저 배포하고 webapp push 를 나중에** 하기를 권한다. 반대 순서여도 웹은 헤더가 없으면 false 로 읽어 안전하게 떨어진다.

## Follow-ups

` 에 따로 적었다.

### CR-31-F: 19:55 따라잡기 — 승격률 보전

**수정 파일:** `tickgw/src/poller.ts`, `tickgw/src/config.ts`, `tickgw/tests/poller.test.ts`, `docs/relay-operations.md`
**커밋:** 4d124bf6 (worktree 브랜치 `worktree-agent-a4e33185c028359f2` · push/배포 안 함)
**재배포:** tickgw(평일 21:00 이후 · 메인 세션)
**상태:** fixed: requires human verification (스케줄링 로직 추가)
**검증:** 이 worktree 에서 실행했다. `tsc --noEmit` 통과. `vitest run --maxWorkers=2` 결과 62/62 통과(poller 29건 · 새로 9건).
- 공정 교대 조건을 「순수 우선순위」로 바꾸면 교대 시험이 실패하는 것도 확인했다. 시험이 이 조건을 실제로 가려낸다는 뜻이다. 확인 뒤 원래대로 되돌렸다.

**무엇:**
- 따라잡기는 KST `TICKGW_CATCHUP_AT`(기본 19:55)부터 20:00 전까지 하루 한 번 돈다.
  - 값은 `HH:MM` 이고 `off` 면 끈다. 20:00 이후 값은 설정 오류로 거부한다(창이 비기 때문).
- 창에 들어선 첫 step 에 대상을 고정한다. 대상 조건은 다음과 같다.
  - 오늘 날짜다.
  - complete 다.
  - closed 가 아니다.
  - 「너무 큼」이 아니다.
  - 리스가 끝났다.
- 대상 키마다 `fromOf` 커서부터 `to 0` 으로 받는다. 커서는 lastRecvNs+1 이고, 이어받기 중이면 그 커서, 받은 적이 없으면 08:00 이다.
  - has_more 면 false 가 될 때까지 이어서 받는다.
  - 다 받아도 closed 로 만들지 않는다. closed 는 여전히 20:01 마감 마무리가 정한다. 마무리는 아직 압축 전인 마지막 몇 분(19시 · 20시 파일)만 읽는다.
- 창이 끝나면(대상 소진 또는 20:00) 요약 한 줄 `catchup done` 을 남긴다. 항목은 keys · caught · left · calls · bytes · ms 다. 시작할 때는 `catchup start` 를 남긴다.

**설계 선택:**
1. **공정 교대(순수 우선순위 아님).** 같은 `step()` 사슬을 쓰므로 동시성 1 이 유지된다.
   - 리스가 살아 있는 키와 따라잡기가 둘 다 할 일이 있으면, 직전 슬롯의 반대편이 간다. 그래서 열린 키는 따라잡기 호출 하나보다 더 기다리지 않는다.
   - 평소처럼 호출이 짧으면 5초 간격 그대로다. 시험에서 열린 키 60회 호출의 간격이 모두 5,000ms 였다.
   - 순수 우선순위를 쓰지 않은 이유는 포화 때문이다. 활성 키가 슬롯을 꽉 채우면 따라잡기가 굶고, 그러면 승격률을 지키지 못한다. 시험은 3키 × 호출 6초 상황에서 B·A·B·A·B 로 번갈아 가는지 확인한다.
2. **규율은 보통 폴링과 같다.**
   - 전역 차단이면 아무것도 하지 않는다. 연결 실패가 3회 이어지면 60초 막히고, 탐침이 실패하면 다시 막힌다.
   - 75 는 2초 + 지터 뒤 재시도하고 실패로 세지 않는다.
   - 실패는 키별로 5→60초 백오프한다. 카운터는 보통 폴링의 `run.failures` 와 따로 둔다. 그래서 따라잡기 실패가 다시 연 키의 상태 카드를 `delayed` 로 바꾸지 않는다.
   - 64 는 60초 뒤 재시도한다.
   - 캐시가 가득하면 붙이지 않고 커서를 그대로 둔 채 백오프한다(WR-33). `too_large` 면 그 키를 그날 중단하고 complete=false 로 둔다.
   - LRU 보호 술어는 바꾸지 않았다. 보호 대상은 여전히 리스가 살아 있는 키다.
3. **도중에 대상에서 빠지는 경우.** 매 step 대상을 다시 거른다.
   - 다시 touch 된 키는 보통 루프로 넘긴다.
   - complete 가 false 가 된 키, 지워진 키도 뺀다.
   - 리스는 살아 있지만 활성 8개 밖에서 대기 중인(queued) 키도 대상이 아니다. 활성 키 상한을 우회하지 않으려는 것이다. 이런 키는 20:01 마무리가 리스와 무관하게 처리한다.
4. **20:00 까지 못 끝낸 키**는 그대로 20:01 마무리 몫이다. 보통 백오프 말고 추가 재시도는 없다. 시험에서 실패가 이어지면 19:55:00 · :05 · :15 · :35 · 56:15 · 57:15 · 58:15 · 59:15 에 호출하고, 20:00 이후에는 따라잡기 호출이 0건이었다.
5. **창 밖에서 기동한 경우**(20:00 이후 첫 기동 등)에는 따라잡기를 하지 않는다. 창 안에서 재기동하면 캐시가 비어 있으므로 keys 0 으로 바로 끝난다.

**시험(`tickgw/tests/poller.test.ts`):**
- rig 기본값을 운영과 같게 `catchupHhmm: 1955` 로 켰다. 기존 20건도 이 상태에서 그대로 통과한다.
- 새 가짜 인덱서 `minuteDay` 를 만들었다. 1분마다 레코드를 내고, 20:00 뒤에는 08~18시 파일이 즉시 압축된 최악의 경우를 흉내 낸다(`compressed_files_skipped`).
- 새 시험 9건:
  - 리스가 끝난 키를 19:55 에 3페이지로 따라잡고, 20:01 마무리는 19:54:30+1 부터 읽어 압축을 건너뛴 파일이 0건이며 closed · complete 가 된다. `catchup done` 로그 값도 단언한다.
  - `off` 면 따라잡기 호출이 0건이고, 마무리가 10시부터 읽다 압축 원본을 건너뛰어 승격되지 않는다. 대조군이다.
  - 리스가 살아 있는 키는 5초 간격 그대로이고, 따라잡기는 리스가 끝난 키만 대상으로 한다.
  - 공정 교대(포화 상황).
  - 동시성 1 과 75 · 75 · 실패 간격 [2250, 2250, 5000].
  - 창이 끝날 때까지 못 끝낸 경우.
  - 「너무 큼」 키는 다시 받지 않는다.
  - 따라잡기 도중 too_large 가 나면 다음 페이지를 받지 않고 blocked 가 된다.
  - 설정 파싱: 기본값 · off · 19:50 · 20:00 거부 · 형식 오류.

**gh-trade 에 알릴 119 호출 패턴 변경(전달용):**
- **새 버스트(하루 1회):** tickgw 가 매일 KST 19:55 부터 20:00 전까지, 그날 열었다가 닫힌 키(리스 끝 · 오늘 complete)를 한 번씩 따라잡는다.
  - 질의 꼴은 기존과 같다: `<isin> <KRX|NXT> <YYYYMMDD> <from_ns> 0`. from 은 그 키가 마지막으로 받은 레코드 +1ns 다.
  - has_more 면 `next_from_ns` 로 이어서 질의한다.
  - 상한은 「그날 연 키 수 × 키당 빈 구간의 이어받기 페이지 수」 다. 낮에 열었다 닫은 키는 마지막 수신 이후부터 19:55 까지다. 받은 적이 없는 키는 08:00 부터 하루치다.
  - 동시성은 여전히 전역 1 이다. 연속 질의로 한 줄로 이어지며, 겹쳐 실행되지 않는다.
- **의도:** 20:00 압축(`zstd --rm` · 오래된 시간부터 FIFO) 전에 낮 구간을 받아 둔다. 그러면 20:01 마감 마무리 질의는 19:5x 이후 몇 분(19시 · 20시 파일)만 읽는다. 압축 중인 이른 시간 파일을 읽으려는 질의(→ `compressed_files_skipped`)가 줄어든다.
- **바뀌지 않는 것:**
  - 장중 5초 증분 · 30초 리스 · 활성 8키 상한.
  - 75 = 2초 재시도(실패 아님) · 실패 백오프 5→60초 · 연결 실패 3연속이면 전역 60초 차단.
  - 20:01 마감 마무리.
  - 끄는 방법: `TICKGW_CATCHUP_AT=off`(tickgw 재배포).
- **gh-trade 쪽에 묻고 싶은 점(선택):** 19:55~20:00 에 질의가 연속으로 이어지는 것이 기록기의 20:00 회전 · 압축 시작에 영향을 주는가. 질의 래퍼는 코어 0 · nice 19 · ionice idle 이다.

**남은 일:**
- 운영에서 배포한 뒤 첫 평일 `docker logs tickgw | grep -E 'catchup (start|done)|close sweep done'` 로 caught · left 와 closed 수를 확인한다.
- `docs/relay-operations.md` tickgw 「캐시」 항목의 「전체 128MB LRU」 는 WR-31 이후 96MB 로 바뀌었는데 문서가 아직 옛 값이다. 이번 범위 밖이라 손대지 않았다.

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

### CR-30: 레코드 0건 closed 키 하나가 그날 승격 전체를 실패시킨다 (tickgw export ↔ promote 계약 불일치)

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

### CR-31: 20:00 원본 압축(`compressed_files_skipped`)을 무시해 잘린 하루를 「완결 · closed」 로 승격한다

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

### WR-30: 승격 경로에 격자 크기 상한(`GRID_MAX_BYTES`)이 없다 → 대형 종목은 매일 두 번 실패 · 알림

**수정 파일:** `workers/tick-convert/src/modes/promote.ts`, `workers/tick-convert/tests/too-large.test.ts`
**커밋:** 4571ded2
**재배포:** tick-convert Job
**적용한 수정:**
- 새 상태 `tooLarge`를 더했다. 카운터와 실행 기록 note `too_large n`이 따라오고, 요약 줄에는 `too_large=`가 붙는다.
- `buildGridFile` 뒤에 `g.bytes.length > GRID_MAX_BYTES`이면 업로드와 upsert를 하지 않는다. 실패로 세지 않으므로 종료 0이고 알림도 없다.
- 받기 전 사전 판정을 더했다. export `bytes`가 `GRID_MAX_BYTES × PREFETCH_FACTOR(2)`를 넘으면 바이트를 당기지 않는다(2Gi Job 메모리 보호).
- 시험 2건을 더했다(받은 뒤 판정, 받기 전 판정).

### WR-31: tickgw 256MB 컨테이너에서 전체 버퍼 복사가 겹쳐 OOM → 그날 캐시(승격 입력) 소실

**수정 파일:** `tickgw/src/cache.ts`, `tickgw/src/server.ts`, `tickgw/src/config.ts`, `tickgw/src/indexer.ts`, `tickgw/tests/server.test.ts`
**커밋:** 56660c00
**재배포:** tickgw
**적용한 수정:**
- `cache.parts()`를 새로 만들었다. 청크를 복사하지 않고 subarray로 돌려준다.
- live와 `export/bytes`는 `sendParts`로 청크를 그대로 흘려보낸다. 이제 `Buffer.concat`이 없다.
- `TICKGW_CACHE_BYTES` 기본값을 128MB에서 96MB로 낮췄다(컨테이너의 40% 이하). 예산 근거는 주석에 적었다.
- ssh stdout 상한 기본값을 32MB에서 20MB로 낮췄다(계약 16MB + 여유 4MB, `DEFAULT_MAX_STDOUT_BYTES`).
- 시험을 더했다: subarray가 같은 메모리를 가리키는지 단언.

### WR-32: 당일 첫 응답(08:00~지금 하루치)에 크기 상한이 없어 server 를 통째로 버퍼링해 통과한다

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

### WR-33: 활성 키 합이 캐시 상한을 넘으면 LRU 가 폴링 중인 키를 지우고, 그 키를 08:00 부터 다시 받는 고리에 빠진다

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

### WR-34: tickgw 배포 시각 가드가 20:00~21:00 승격 창을 보호하지 않고, 실패 시 되돌릴 컨테이너도 없다

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

### WR-35: 선택 env `TICKGW_URL` 을 빠뜨린 재배포가 운영 중인 당일 경로를 조용히 끄거나 승격 Job 을 옛 이미지에 묶어 둔다

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

### WR-36: nightly 에서 키 하나만 실패해도(또는 원본 하나가 깨져도) 그 날짜 전량(≈9GB Archive)을 하루 두 번 · 최대 10일 다시 읽는다

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

### IN-30: `runIndexer` 의 상한 초과 경로가 0 으로 채운 버퍼를 만들고, 종료코드 삼항식은 죽은 코드다

**수정 파일:** `tickgw/src/indexer.ts`, `tickgw/tests/indexer.test.ts`
**커밋:** c3f54157
**재배포:** tickgw
**적용한 수정:**
- `size`는 실제로 넣은 청크만 센다.
- 상한을 넘거나 kill되면 모은 청크를 버리고 `stdout: Buffer.alloc(0)`을 돌려준다.
- `exitCode = code ?? -1`로 줄였다.
- 시험을 더했다: 상한 초과면 stdout 길이 0.

### IN-31: 요청 변환 트리거 타임아웃(10초) 뒤 되돌림이 이미 시작된 실행과 중복 실행을 낳을 수 있다

**수정 파일:** `server/src/services/tick-convert-trigger.ts`, `server/src/services/ticks.ts`, `server/tests/routes/ticks.test.ts`
**커밋:** 3003b499
**재배포:** server
**상태:** fixed: requires human verification (되돌림 정책 변경)
**적용한 수정:**
- `TRIGGER_TIMEOUT` 상수와 `isAmbiguousTriggerFailure`를 더했다.
- 타임아웃(status 0 · TIMEOUT)이면 `tick_request_trigger_failed`로 되돌리지 않는다. warn 로그를 남기고 stale 2분 규칙에 맡기며, 응답은 200 `triggered: true`다.
- 다른 실패(403 · 네트워크)는 지금처럼 되돌리고 502를 낸다.
- 시험을 더했다.

### IN-32: 통독 중 잘린 꼬리 파일 수(`truncatedFiles`)가 어디에도 보고되지 않는다

**수정 파일:** `workers/tick-convert/src/modes/nightly.ts`, `workers/tick-convert/src/modes/request.ts`, `workers/tick-convert/tests/request.test.ts`
**커밋:** ad85b686
**재배포:** tick-convert Job
**적용한 수정:**
- nightly `ExchangeResult`와 request `RequestRunResult`에 `truncatedFiles`를 더했다.
- 0이 아니면 warn 로그를 남기고, 실행 기록 error에 note `truncated n`을 붙인다(실패는 아니다). 요약 줄에는 `truncated=`가 붙는다.
- 시험을 더했다: 10시 파일 끝 5B를 자르면 `error: "truncated 1"`이고 main은 0.

### IN-33: 배포 스크립트가 HEAD SHA 로 태그하지만 작업 트리를 빌드하고, IAP 실패를 「tickpull 미설치」 로 잘못 알린다

**수정 파일:** `scripts/deploy-tickgw.sh`, `scripts/deploy-tick-convert.sh`
**커밋:** acb4a707
**재배포:** 없음 (스크립트)
**적용한 수정:**
- 두 스크립트가 빌드 입력(Dockerfile COPY 경로)에서만 `git status --porcelain`을 본다. 다른 세션이 관계없는 파일을 바꿔도 막지 않게 하려고 경로를 좁혔다.
- 변경이 있으면 종료한다. `ALLOW_DIRTY=1`이면 태그와 APP_VERSION을 `<sha>-dirty`로 바꿔 진행한다.
- deploy-tickgw ③은 원격 첫 줄 `REMOTE_OK` 표지로 VM에 닿았는지 판정한다. 표지가 없으면 「IAP SSH 실패(종료 n)」로 따로 알린다. `--help` 출력 범위도 늘어난 머리에 맞췄다.

### IN-34: `openTick` 이 RPC 응답 필드 일부를 모양 검사 없이 단언 캐스트한다

**수정 파일:** `server/src/services/ticks.ts`, `server/tests/routes/ticks.test.ts`
**커밋:** 15f7b8ca
**재배포:** server
**적용한 수정:**
- `checkOpenShape`가 **서명 전에** 응답 모양을 본다.
  - 봉투: `date` · `exchange`(KRX|NXT) · `isin` · `eta_s`(유한 수)
  - grid: `bytes` · `records` · `a3_count`(음이 아닌 정수), `mode`(열거값), `sources`(문자열 배열), `fmt` · `created_at`(문자열), `first_recv_ms` · `last_recv_ms`(수 또는 null)
- 하나라도 어긋나면 500 DB_ERROR이고 서명은 0회다.
- 위반 7가지를 시험에 더했다.


### WR-60: 재생 중 URL 스로틀 쓰기가 진행 중인 `router.push` 를 버린다 — 「목록으로」·날짜·거래소·종목 이동이 사라짐

**수정한 파일:** `webapp/src/lib/ticks/use-tick-cursor.ts`, `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx`, `webapp/e2e/specs/ticks-viewer.spec.ts`
**커밋:** 94452d49 · 9407f999(e2e)
**적용한 수정:**
- 페이지에 내비게이션 토큰 `navRef` 를 두었다. `go()` 가 (isin, d, ex) 를 바꾸는 이동이면 `router.push` 전에 토큰을 올린다.
  - 같은 열기 키로 가는 이동은 토큰을 올리지 않는다. 그런 이동은 뷰어가 다시 마운트되지 않으므로, 토큰을 올리면 URL 쓰기가 영영 멈춘다.
- `TickViewer` 가 `navToken` 을 `useTickCursor` 에 넘긴다. 커서는 마운트 때의 값을 기억한다. `write()` 가 실행될 때 값이 바뀌어 있으면 `replaceState` 를 하지 않는다. 대기 타이머로 늦게 실행되는 쓰기도 같다.
- 단위 시험: 토큰을 올린 뒤에는 대기 타이머 쓰기와 새 커서 쓰기가 모두 0건이다.
- e2e 시험: 최대 속도로 재생하는 중에 「‹ 목록으로」를 누르면 URL 에 isin 이 없고 목록 화면이 뜬다. 이 e2e 는 이번에 돌리지 못했다(아래 「검증」 참고).

### WR-61: 대기 중인 URL 쓰기 타이머가 옛 세션을 붙잡는다 — 당일 증분 직후 BigInt TypeError 또는 틀린 `t`

**수정한 파일:** `webapp/src/lib/ticks/use-tick-cursor.ts`, `webapp/src/lib/ticks/__tests__/use-tick-cursor.test.tsx`
**커밋:** e73f0d20
**적용한 수정:**
- `write()` 는 이제 클로저에 잡힌 값이 아니라 `sessionRef` · `liveRef` 로 지금 세션과 live 여부를 읽는다.
- `r` 가 세션 범위(`0 ≤ r < index.n`) 밖이면 쓰지 않는다.
- 시험: 하루치 6,000건 세션에서 끝 틱 쓰기가 대기 중일 때 증분 세션(끝을 따라감)이 들어오는 경우를 만들었다. 결과는 예외 0건이고 URL 에 `t` 가 없다.
- 이 시험을 옛 코드에 돌리면 리뷰가 적은 `TypeError: Cannot mix BigInt and other types` 가 그대로 난다. 결함을 재현하는 시험임을 확인했다.

### WR-62: 당일 zstd 해제·세션 재생성 예외를 잡지 않는다 — 하루치는 영원히 「받는 중」, 증분은 조각을 조용히 건너뜀

**수정한 파일:** `webapp/src/lib/ticks/use-tick-live.ts`, `webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx`
**커밋:** 5d4d0f46
**적용한 수정:**
- `handle` 안의 `appendTickBytes` 를 try 로 감쌌다. offset · epoch · meta · errors · fetchedAt 은 바이트가 세션에 붙은 **뒤에만** 커밋한다(`commit(m)`).
- 해제에 실패하면 `errors` 를 1 올리고 `console.warn` 을 남긴다. 그 뒤는 경로에 따라 다르다.
  - **하루치:** pending · offset · epoch 를 비우고 `pollMs` 뒤 offset 0 부터 다시 받는다. 이전 세션이 있으면 그대로 보인다.
  - **증분:** offset 을 그대로 둔다. 다시 누르면 같은 조각부터 받는다.
- `tick()` 의 `handle(r)` 도 try/catch 로 감싸 마지막 방어선을 두었다.
- 시험 2건을 더했다. 둘 다 잘린 zstd 본문을 쓴다.
  - 하루치: 「받는 중」에 갇히지 않는다. errors 가 1 이 되고, 5초 뒤 offset 0 · epoch 없이 다시 받아 ready 가 된다.
  - 증분: 세션은 그대로이고 errors 가 1 이다. 다시 누르면 같은 offset 부터 받는다.

### WR-63: `X-Tick-Complete=false`(알려진 끊김)를 화면 어디에도 보이지 않는다

**수정한 파일:** `webapp/src/components/ticks/tick-header.tsx`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx`
**커밋:** 15812dda
**적용한 수정:**
- `live.session !== null && live.meta?.complete === false` 이면 머리에 「당일 자료 일부 빠짐」 배지를 띄운다(`data-slot="tick-live-gap"` · `role="status"`). 색은 지연 배지와 같은 `--vi` 다.
- 배지의 title 은 「버스트 묶기 · 열린 주문 · 팀 손익 판정이 불완전할 수 있어요」다.
- 팀 패널 캡션에 같은 말을 붙이는 것은 리뷰가 「가능하면」으로 둔 선택 항목이라 하지 않았다. 머리 배지 하나로 알린다.

### WR-64: `tickLiveMetaOf` 가 `X-Tick-Offset-End` 없음을 0 으로 받는다 — 다음 증분이 하루치 전체를 다시 이어붙인다

**수정한 파일:** `webapp/src/lib/ticks/tick-api.ts`, `webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx`
**커밋:** 154cac7e
**적용한 수정:**
- `X-Tick-Offset-End` 는 trim 한 뒤 `/^\d+$/` 와 `Number.isSafeInteger` 를 모두 통과할 때만 받는다. 아니면 null 을 돌려주고, 호출자는 이를 502 로 다룬다.
- 시험: 헤더가 없거나, 공백 · 숫자 아님 · 음수 · 소수 · `1e3` · 안전 정수 밖이면 null 이다. `'0'` 은 0 으로 받는다.

### WR-65: URL `t` 가 ms 로 잘려 딥링크·새로고침이 같은 틱으로 돌아오지 않는다 — 버스트 조각 안에서 특히

**수정한 파일:** `webapp/src/lib/ticks/tick-url.ts`, `webapp/src/lib/ticks/use-tick-cursor.ts`, `webapp/src/components/ticks/tick-viewer.tsx`, `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/components/ticks/tick-slider.tsx`, 시험 3개 파일, `webapp/e2e/specs/ticks-viewer.spec.ts`
**커밋:** 3c0a6a39
**상태:** fixed: requires human verification(URL 계약에 `k` 를 더했다 — D-18 의 `t` 형식은 그대로다)
**적용한 수정:**
- URL 에 `k` 를 더했다. `k` 는 recv 가 그 ms 인 틱들 가운데 수신순 순번(0부터)이다.
  - 0 이면 쓰지 않는다. `t` 없이 온 `k` 는 버린다. 잘못된 값도 버린다.
  - 직렬화 순서는 isin · d · ex · t · k 다.
- 커서가 URL 을 쓸 때 `tickUrlPosOf(session, rec)` 로 `{t, k}` 를 함께 쓴다.
- 열 때는 `initialRecOf(…, initialK)` 가 lower_bound + k 자리를 찾는다. 그 틱도 같은 ms 일 때만 그 자리로 연다. 아니면 그 ms 의 첫 틱으로 연다.
- 페이지는 `t` 를 다루는 방식 그대로 `k` 도 열기 키가 바뀔 때만 읽는다(`initialK`).
- 슬라이더 「점프」는 초안이 지금 시각과 같으면(포커스만 주고 Enter) 아무것도 하지 않는다.
- 시험:
  - 픽스처에서 `k ≥ 1` 인 자리 전부를 왕복시켜 같은 rec 로 돌아오는지 본다. 거래소순과 당일 둘 다 확인한다.
  - k 가 그 ms 를 넘으면 첫 틱으로 연다.
  - 커서가 쓴 URL 로 다시 열면 같은 rec 다.
  - 슬라이더에 포커스만 주고 Enter 를 누르면 `onJump` 가 0회다.
- e2e 「딥링크 → 새로고침」 단언에 같은 seq 확인을 더했다.

### IN-60: 「오늘」이 마운트 때 한 번만 정해져서 20:00·자정을 넘기면 목록과 열기가 엇갈린다

**수정한 파일:** `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx`
**커밋:** 975a7e5d
**적용한 수정:**
- **진입 화면에 있을 때만** `defaultTickDateOf` 를 다시 계산한다. 주기는 1분(`TICK_TODAY_RECHECK_MS`)이고, 탭이 다시 보일 때도 한 번 한다.
  - 열린 뷰어는 흔들지 않는다. 20:00 에 당일 뷰어가 어제 날짜로 튀지 않게 하기 위해서다.
- 오늘 목록의 행을 열 때는 날짜로 목록 응답의 `date` 를 쓴다.
- 시험: 19:59:30 에 진입하면 오늘 목록이 뜬다. 60초 뒤에는 `/day` 를 d 없이(최근 격자 날짜로) 다시 묻는다.

### IN-61: 공급 배지가 자료 출처가 아니라 날짜로 정해진다

**수정한 파일:** `webapp/src/components/ticks/tick-viewer-page.tsx`, `webapp/src/components/ticks/__tests__/tick-viewer-live.test.tsx`
**커밋:** 9a5ef839
**적용한 수정:**
- `supplyOf()` 를 두었다. view 가 `live` 면 live, `loaded` 면 grid 이고, 아직 열리지 않았으면 날짜로 정한다.
- 시험: 오늘 날짜라도 격자로 열면 `data-supply="grid"` 다.

### IN-62: 격자 서명 URL fetch 에 시간 상한·취소가 없다

**수정한 파일:** `webapp/src/lib/ticks/use-tick-grid.ts`, `webapp/src/lib/ticks/__tests__/use-tick-grid.test.tsx`
**커밋:** 47cbacc9
**적용한 수정:**
- 받기마다 `AbortController` 하나와 정지 타이머(`TICK_GRID_STALL_MS` = 30초)를 둔다. 바이트가 올 때마다 타이머를 다시 잰다.
  - 30초 동안 바이트가 없으면 abort 한다. 결과는 `TickGridLoadError('격자 시간 초과')` 이고, error 카드의 「다시 시도」로 벗어난다.
  - abort 하면 reader 를 cancel 한다. 그 뒤에는 끊긴 본문으로 세션을 만들지 않는다.
- 그 키를 보는 훅이 모두 떠나면 받던 것을 abort 하고, 캐시에 넣지 않는다.
  - 떠남은 0ms 뒤에 확정한다. StrictMode 재마운트나 retry 가 같은 받기를 이어 쓰도록 하기 위해서다.
- inflight 를 지울 때는 그것이 자기 항목인지 확인한다. 새 받기 항목을 실수로 지우지 않게 하기 위해서다.
- 시험:
  - 본문이 멈추면 29초에는 loading, 31초에는 error 다. 다시 시도하면 ready 가 된다.
  - 훅이 떠나면 signal 이 aborted 되고, 다시 열면 새로 받는다.
- 기존 단언 하나는 `fetch(url, { signal })` 에 맞게 고쳤다.

### IN-63: 증분·own 재조회마다 전문 목록이 커서 행으로 강제 가운데 스크롤된다

**수정한 파일:** `webapp/src/components/ticks/tick-msg-list.tsx`, `webapp/src/components/ticks/__tests__/tick-msg-list.test.tsx`
**커밋:** 24035e11
**적용한 수정:**
- 직전 (커서 rec, 순서 mode) 를 기억한다. 둘 다 그대로이고 모델만 바뀐 경우(당일 증분 · own 재조회)에는 스크롤하지 않는다.
- 처음 열 때와 순서를 바꿀 때만 가운데로, 커서가 움직일 때는 nearest 로 스크롤한다.
- 리뷰는 center 만 막자고 했다. 그런데 nearest 도 훑던 자리를 커서 행으로 끌어오므로, 모델만 바뀐 경우는 스크롤 자체를 하지 않게 했다.
- 시험: 11,990건 세션에서 사용자가 맨 위로 훑은 뒤 모델만 바뀌면 scrollTop 이 0 그대로다. 순서를 바꾸면 가운데로 간다. 이 시험은 옛 코드에서 실패하는 것을 확인했다.

### IN-64: 409(epoch 교체)로 하루치를 다시 받는 동안 「최신 받기」 버튼이 눌리지만 아무 일도 하지 않는다

**수정한 파일:** `webapp/src/lib/ticks/use-tick-live.ts`, `webapp/src/components/ticks/tick-header.tsx`, `webapp/src/components/ticks/tick-viewer-page.tsx`, 시험 2개 파일
**커밋:** d1afc53b
**적용한 수정:**
- `TickLiveView.refetching` 을 더했다. 머리는 이 값이 true 면 버튼을 「다시 받는 중」으로 바꾸고, 비활성 · aria-busy · 도는 아이콘으로 그린다. title 은 「하루치를 다시 받고 있어요」다.
- 시험(훅): 409 를 받은 뒤 refetching 이 true 가 되고 `refresh()` 는 false 를 돌려준다. 하루치를 다 받으면 false 로 돌아온다.
- 시험(머리): 버튼이 비활성이고, 눌러도 onRefresh 가 0회다.

---

_Fixed: 2026-11-04 (R1 · R2)_
_Fixer: Claude (gsd-code-fixer × 4 parts + orchestrator)_
_Iteration: 2_
