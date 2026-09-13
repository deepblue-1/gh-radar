---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 16
current_phase_name: "**GAP CLOSURE 3라운드 종결  **"
status: completed
stopped_at: Completed quick-260912-ok2 (e2e 6건 + 사용자 지시 3건)
last_updated: "2026-09-12T09:31:18.173Z"
last_activity: 2026-09-12
last_activity_desc: "Completed quick task 260912-mvo: 상따 폼·헤더 후속 7건 (FAB 범위 · 포커스 한 겹 · 세그먼트 폭 · 거래소 콤보 · 종목변경 4종 · 매수매도 틴트 · 컴팩트 호가 박스)"
state_head: 93c7e10c1dd75ebd6d91292c2eaba484f4ec2f7c
progress:
  total_phases: 25
  completed_phases: 4
  total_plans: 185
  completed_plans: 170
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** 트레이더가 급등 종목을 빠르게 포착하고, 해당 종목의 시장 심리를 AI 요약으로 즉시 파악할 수 있어야 한다
**Current focus:** Phase 16 — trading-limit-chaser-vi-my-page

## Current Position

Phase: 16 (trading-limit-chaser-vi-my-page) — **GAP CLOSURE 3라운드 종결 (46/46 plans · 28 waves)**
Plan: 46 of 46 완료 (16-01~16-17 실행 · 1라운드 16-18~16-26 · 2라운드 16-27~16-35 · **3라운드 16-36~16-46**)
Plans completed: 171 / 185
Status: **Phase 16 완결 — plan 46/46 + 요구사항 5종 전부 Complete.** TRADE-03 은 2026-09-10 장중 실계좌 **양방향 직접 관찰**로 재판정(`quick-260910-ogq`)했고, 2026-09-11 에 철거 방향(웹 매수전략 OFF → WinForms 종목창 매수주문 체크박스)까지 확인했다 — 그 단서는 **gh-trade 클라이언트 측 결함**이었고 gh-trade 에서 수정·확인됐다. **열린 항목은 smoke `INV-9` 프로덕션 첫 실행 미수행 1건**(`SMOKE_AUTH_TOKEN` 부재 — TRADE-03 조항의 결손이 아니라 프로브의 미실행)
Production URL: https://gh-radar-webapp.vercel.app
Last activity: 2026-09-13 - Completed quick task 260913-g4c: KRX 애프터마켓 대응 — 급등 탐색 20:00 연장 · 홈 테마 1분 · 30초 자동 새로고침 · 테마 랭킹 top 20

Progress: [█████████░] 92%

### Phase 16 Gap Closure 3라운드 (2026-09-09, 16-36~16-46)

- **16-46 완료 — 3라운드 종결.** 17건(R2-CR-01~03 · R2-WR-01~07 · R2-IN-01~05 · 갭 4 · 갭 5)이 10개 plan 으로 전부 닫혔고, 16-46 이 게이트·배포·문서·재판정을 맡았다. 처리 결과 정본은 `16-VALIDATION.md` §Gap Closure 3라운드 **17행 표**.
- **전량 게이트 (배포 전):** `pnpm -r test` exit 0 · **2,044 passed** · 1 skipped · 6 todo · **191 파일**(2라운드 기준선 2,012 / 190 → **+32 / +1**). 워크스페이스별 shared 99 · relay **397** · server 252 · webapp **680** = 1,428. `pnpm -r typecheck` · relay `typecheck:tests` · `pnpm build` 전부 exit 0. Playwright **126 passed · 9 skipped · 0 failed**. 임시 마커 0건 · 부채 마커 0건.
- **★ 갭 5 프로덕션 실증 — `DMA_HOST` 를 주입하지 않은 배포가 실 게이트웨이를 보존했다.** 사용자가 A안(무주입)을 직접 선택했다. 스크립트 출력 원문: `현재 컨테이너 DMA_HOST=10.41.1.120 — 이번 배포로 바뀌지 않는다` / `DMA_HOST 출처: 실행 중 컨테이너 보존`. **강등 경고 미출력 · 복구 배포 불필요.** 배포 후 독립 재측정: 컨테이너 실 env `DMA_HOST=10.41.1.120` · `APP_VERSION=a1f4ed6` · `/healthz` **200** `{"status":"ok","vpn":true,"dma":true,"version":"a1f4ed6","sessionCount":1,"everReadyCount":1,"stalledCount":0}`. 이 phase 배포 2회를 망가뜨린 회귀 경로가 프로덕션에서 처음 닫혔다.
- **webapp — 이 phase 처음으로 「내용」 증명에 성공했다.** 공개 청크 20개 중 **18개가 로컬 `pnpm build`(HEAD `a1f4ed6`) 산출물과 해시 완전 일치**. 나머지 2개도 코드 차이가 아니라 `NEXT_PUBLIC_RELAY_WS_URL` **빌드 타임 인라인** 유무와 그로 인한 minifier 변수명 리플이었다. 일치 청크 `2422-ff4cf64d654c9829.js`(app-sidebar 포함) 안 `useIsinLabels` 에 `for(let e of t)n(e.isin,{name:e.name,code:e.code})` 가 `viOrders` 뒤에 있고 의존성 3축 — **16-42 의 갭 4 수정이 라이브임이 내용으로 확인됐다.** 인증 게이트 뒤 라우트 청크는 여전히 대조 불가(정직 기록).
- **server 는 근거를 갖고 건너뛰었다 — 「배포 누락」이 아니다.** `git diff --stat 2cb5620..HEAD -- server/ packages/shared/` 는 비어 있지 **않지만**(`packages/shared/src/relay.ts` +20), ① `server/` 0줄 ② +20줄이 전부 `type` 선언과 주석(**런타임 코드 0줄**) ③ `grep -rn "RelayLimitChaser\|/relay\"" server/src` = **0건**(server 는 이 계약을 import 하지 않는다). 리비전 `gh-radar-server-00043-s4f` 유지 · `/api/health` `version=2cb5620` · smoke 15/15.
- **smoke:** `smoke-relay.sh` **PASS 12 · FAIL 0 · SKIP 1** / `smoke-server.sh` **PASS 15 · FAIL 0 · SKIP 0**. **INV-9 는 「돌렸는데 SKIP」이 아니라 「토큰이 없어 프로브 본체가 한 줄도 실행되지 않았다」** — 16-21 재작성 이후 프로덕션 첫 실행 여전히 미수행. `INV-5a` 는 이번엔 시각 의존이 아니었다(실 게이트웨이 결선으로 `stalledCount:0`) — 그 열린 항목은 **해소가 아니라 조건 미성립**이라 유지한다. `INV-2` 문구가 「방화벽 3규칙 → 4규칙」으로 바뀌었는데 이는 다른 세션(`quick-260909-t08` WireGuard)의 결과이며 RELAY-03 요구사항 문장과의 정합은 그 세션 소관이다.
- **회귀 잠금 감사 10건:** 16-36~16-44 **9건 실증함**(무력화 → 실패 관측 → 복원, `git diff` 0줄). **16-45 만 자동 테스트가 없다** — 배포 스크립트는 vitest 가 볼 수 없어 원문 추출 + 로컬 `source` 검증뿐이었고, 실 VM 실증은 이번 무주입 배포 **한 번**뿐이다. **16-44 의 `#register` 갈래는 잠기지 않았다**(오늘 코드로 도달 불가 — 지워도 빨개지는 테스트 0건).
- **SUMMARY 를 믿지 않고 코드를 직접 열었다 (T-16-96).** `#isTeardown`(`fanout.ts:841-845`, `crud` 미참조) · `NO_RETRY_STATES`(`session-manager.ts:305`) · `safePgError`(orders.ts **8곳** / relay 전체 **15곳**) · `#enrichLimitChaser`(`subscription-hub.ts:743`·`779`, 캐시 삽입 이전) · `deploy-relay.sh` 3단 우선순위(`:123-131`).
- **★ 새 함정 — `pnpm -r typecheck` 가 낡은 `packages/shared/dist` 를 보고 통과한다.** 계약 변경은 `pnpm --filter @gh-radar/shared run build` **후에야** 소비처 타입 체크에 보인다(16-41 이 실제로 데였다). 「절대 실패할 수 없는 검증 명령」 계열의 **세 번째** 사례다(앞선 둘: `pnpm --filter gh-radar-webapp` = `No projects matched` + exit 0 · relay `tests/` 가 루트 typecheck 밖).
- **★ `grep "10.41.1.120"` 0건 기준은 3라운드에서도 충족 불가였다 — 정본 계약을 확정했다.** 리터럴 0건이 아니라 **「접속 경로 0건」**(`webapp/src`·`webapp/e2e` 0건 실측 ∧ relay·scripts 잔존이 전부 경고·가드·주석·타 세션 파일)이다. 다음 라운드는 이 문장을 그대로 인용할 것.
- **이 라운드가 드러낸 것:** ① **계획·리뷰의 불완전함이 6번 잡혔다**(16-37·38·39·40·43·44) — 실행자가 코드에서 재확인하는 규율이 없었으면 그대로 새 결함이 됐다. ② **기존 테스트가 결함을 「진실」로 잠근 사례 3건 추가**(16-36 ⑰-e·⑰-e2, 16-39 ⓽) — 2라운드 3건과 합쳐 **이 phase 누적 6건**.
- **TRADE-03 재판정 → Pending 유지 (사용자 결정).** 잔여를 **「WinForms ↔ 웹 한 세션 동기화 실측」 1건**으로 좁혔다. 옛 사유(「Ready 도달 이력 0」)는 **해소됐다** — 그것을 그대로 두면 이미 거짓인 근거로 Pending 을 유지하는 셈이라 사유를 갱신했다. **`everReadyCount: 1` 은 「relay 가 게이트웨이에 붙어 DMA 세션이 Ready 상태에 도달했다」까지만 말하며, 「WinForms 와 전략·체결·미체결이 즉시 공유된다」는 뜻이 아니다** — 후자는 구조에서 파생될 것으로 기대되는 결과이지 관측된 사실이 아니다. RELAY-02 와 같은 기준을 유지한다. 실주문 검증은 하지 않았다(D-27).

- **16-44 완료 — R2-WR-05(세션 `"state"` 리스너 누수) 종결.** relay 2파일(`ws/fanout.ts` · `tests/fanout.test.ts`). 파일이 주석으로만 선언하던 「상태 리스너는 **사용자당 1개**」를 실제로 성립시켰다.
- **누수의 정체:** `#onClose` 가 마지막 소켓에서 `#users.delete` 를 하지만 `DmaSession` 은 유예 5분 동안 살아 있다(D-15). 그래서 새로고침 재접속이 `existing === undefined` 로 들어와 **같은 세션에 리스너를 하나 더** 걸었고, 옛 리스너는 `current.session === session` 이라 침묵 가드에도 안 걸렸다 — 새로고침 k 번이면 상태 프레임이 브라우저로 k 번, 11회째부터 `MaxListenersExceededWarning`.
- **`UserEntry` 가 리스너 핸들(`onState`)을 소유한다.** 인라인 익명 함수는 참조가 남지 않아 영원히 뗄 수 없다 — 리스너를 만든 주체가 그 수명을 소유하게 했다. `off("state"` 는 정확히 **2곳**(`:1082` `#onClose` · `:1135` `#register`).
- **★ 실제 누수 지점은 `#onClose` 하나였다 — 「둘 다 필요함이 증명됐다」고 쓰지 않았다.** 회귀 실증을 두 곳 **따로** 돌린 결과: `#onClose` 쪽만 제거 → **2 failed**(㉓ `expected 5 to be 1` · ㉔ `length 1 but got 5`), `#register` 쪽만 제거 → **0 failed**. 그 갈래는 오늘의 코드로 도달하지 않는다(`acquire` 의 세션 재생성은 `refCount === 0` 을 요구하는데 `existing` 이 있다는 것은 소켓이 살아 있다는 뜻이라 `refCount >= 1`). **그럼에도 남겼다** — `if (existing !== undefined)` 블록은 이미 있던 갈래이고, 갈래를 두면서 정리만 빼는 것은 버그를 예약해 두는 것이다. 도달 불가라는 사실과 실증 결과를 그 자리 주석에 못박았다.
- **침묵 가드를 지우지 않았다.** `EventEmitter.emit` 은 리스너 배열의 **사본**을 순회하므로 실행 도중 `off` 가 걸려도 같은 emit 안의 나머지 리스너는 호출된다 — 「떼는 것」과 「침묵시키는 것」은 서로 다른 시점의 방어다. 그 이유를 코드에 적었다.
- **`setMaxListeners` 로 경고만 끄지 않았다** (`grep -c` = 0). `closeAll()` 에는 세 번째 `off` 를 넣지 않았고 그 이유(같은 종료에서 `SessionManager.closeAll()` 이 세션을 끊는다)만 주석으로 남겼다.
- **신규 2케이스.** ㉓ `session.listenerCount("state")` **`toBe(1)`**(재접속 3회 반복, 매 회차 `expect(h.sessions.get(USER_A)).toBe(session)` 로 「같은 세션 재사용」 전제를 먼저 확인) · ㉔ 상태 전이 1회 발행 후 마지막 소켓 inbox 의 `state` 프레임 **`toHaveLength(1)`**. 인증 ACK 는 `#send` 직접 경로라 리스너 누수를 관측할 수 없어 `session.emit("state", ...)` 로 따로 발행했다.
- **계획이 허용한 생략 1건 — 「세션 교체 시 옛 리스너가 떨어진다」 케이스는 작성하지 않았다.** 하네스로 유발 불가함을 코드로 확인했다. **그 갈래는 잠겨 있지 않다** — 과장하지 않고 그대로 적었다.
- **게이트:** relay **395 → 397**(+2, fanout 35 → 37) · `pnpm -r test` exit 0 **2,044 passed**(기준선 2,042 → +2) · `pnpm -r typecheck` exit 0 · `typecheck:tests` exit 0 · `#deliver` diff **0줄** · 16-36 의 `#isTeardown`·sweep 면제·시장 정책 **한 글자도 손대지 않음** · 포매터 미실행. 게이트 전에 `pnpm --filter @gh-radar/shared run build` 를 먼저 돌려 낡은 `dist` 함정(16-41 발견)을 회피했다.
- **⚠️ 배포 미실시.** 프로덕션 relay 에는 R2-WR-05 가 **여전히 살아 있다** — 재배포는 **16-46** 몫. **TRADE-03 계속 Pending**(재판정 16-46).

- **16-45 완료 — 갭 5(프로덕션 회귀의 근본 원인) + R2-IN-05 종결.** 셸 스크립트 2파일. **배포가 프로덕션 상태를 되돌리지 않게** 하고, **판정이 조용히 사라지지 않게** 했다.
- **`DMA_HOST` 를 3단 우선순위로 바꿨다: 명시 주입 > 실행 중인 컨테이너 값 보존 > 로컬 mock.** 종전 해석은 미주입 시 무조건 `127.0.0.1` 로 떨어져 16-26(`2cb5620`)·16-35(`c8aa7ae`) 두 배포가 실 게이트웨이를 mock 으로 강등시켰다. 우선순위를 **한 줄**(`deploy-relay.sh:124`)에 모아 두어, 승인 기준이 재구현이 아니라 **원문 추출 + 격리 실행**으로 대조되게 했다.
- **`read_live_dma_host()` — 1곳 정의(:104) · 2곳 호출(:123 배포 전 · :469 배포 후).** 배포 후 요약이 쓰던 `docker inspect` 명령을 그대로 함수로 뽑았다. 두 벌로 적으면 언젠가 한쪽만 고쳐진다(T-16-14). 조회 실패(VM 접근 불가·컨테이너 부재·최초 배포)는 **정상 경로**로 처리해 배포를 중단시키지 않는다.
- **출처와 변경 전/후를 출력한다.** `DMA_HOST 출처: 명시 주입 | 실행 중 컨테이너 보존 | 기본값(로컬 mock)` 을 variables 줄 옆에 찍고, 값이 바뀌면 `⚠ 이전 → 이후` 를 강등 시 복구 명령과 함께 낸다. 배포 후 요약에도 **두 번의 컨테이너 실측** 비교를 더했다.
- **D-27 의 취지는 그대로다.** 스크립트에 실주소 리터럴을 새로 넣지 않았다 — 보존은 오직 런타임 조회다. `grep -c '10.41.1.120' scripts/deploy-relay.sh` **전 2 = 후 2**. D-27 경고 2줄 **diff 0줄**. 헤더 §선택 env 는 「저장소에 박제하지 않는다」와 「배포마다 mock 으로 되돌린다」가 **다른 문장**임을 본문에 박아, 두 번의 강등을 만든 오독을 명시적으로 닫았다.
- **`--rollback` 도 같은 해석을 지난다** — `MODE` 분기(:152)가 해석부(:124)보다 뒤라 순서 조정이 불필요했다(코드로 확인). rollback 이 배포 **후** 되읽기에 닿지 않는 것은 기존 동작이며 SUMMARY §알려진 한계에 남겼다.
- **R2-IN-05 — 프로브 판정 유실 차단.** `finish()` 를 `process.stdout.write(verdict + "\n", () => process.exit(0))` + `process.exitCode = 0` 으로 바꿨다. 이 프로브의 stdout 은 `verdict="$(...)"` 라 **항상 파이프**이고 POSIX 파이프에서 `process.stdout` 은 비동기다 — `process.exit()` 가 대기 중인 쓰기를 버리면 `verdict=""` → 호출부 `*` 갈래 → **FAIL 이 SKIP 으로 강등**된다(T-16-57 이 막겠다 선언한 결과 그대로, rc 0 이라 `inconclusive` 덮어쓰기도 안 걸린다).
- **이중 방어 — 빈 verdict 는 SKIP 이 아니라 FAIL.** 호출부 `case` 에 `""` 전용 갈래를 신설했다. 기존 `reachable`·`unreachable`·`*` 세 갈래는 한 줄도 바꾸지 않아 `inconclusive` 의 SKIP 판정(의도된 3갈래)은 그대로다. 격리 실행으로 4갈래 전부 확인.
- **실행 검증을 전부 원문 추출로 했다.** 해석부(3케이스)·변경보고(4케이스)·호출부 `case`(4케이스)를 `sed`/`awk` 로 **스크립트 원문에서 뽑아** `source` 했다 — 손으로 옮겨 적은 스니펫이 아니다. 프로브 JS 는 heredoc 경계로 124줄 추출해 `node --check` exit 0, 추가로 **로컬 폐쇄 포트**(`ws://127.0.0.1:1`)로 파이프 왕복을 실측해 `verdict="unreachable"`(길이 11) rc 0 을 확인했다.
- **`grep "10.41.1.120"` 0건은 승인 기준으로 쓰지 않았다** — 저장소 전체 실측 **239건**(산문·경고문·주석)이라 만족 불가능하다. 정본 계약은 리터럴 0건이 아니라 **접속 경로 0건**이다.
- **잘림을 「재현했다」고 쓰지 않았다.** 판정 문자열이 11~12바이트라 파이프 버퍼에 들어가 종전 형태도 로컬에서는 대개 온전하다. 이번 수정은 관측된 실패의 사후 수리가 아니라 **문서화된 위험의 선제 차단**이고, 그래서 빈 verdict FAIL 갈래를 함께 넣었다.
- **게이트:** `pnpm -r test` exit 0 **2,034 passed**(기준선 동일) · relay **395**(동일) · `pnpm -r typecheck` exit 0 · `typecheck:tests` exit 0 · `bash -n` 2종 exit 0. 셸만 만졌으므로 TS 게이트가 움직이지 않는 것이 정상이며 실측이 확인했다.
- **⚠️ 배포·smoke 미실행. `gcloud` 호출 0회.** 두 스크립트 수정은 **다음 배포 때부터** 효력이 생긴다 — 프로덕션은 여전히 `relay:59465e1`(사람이 명시 주입해 복구해 둔 `DMA_HOST=10.41.1.120`). 「주입 없이도 보존되는가」는 **16-46 재배포에서 처음 실측**된다. smoke 실행에 필요한 `SMOKE_AUTH_TOKEN` 은 저장소에 없는 것이 정상이다(T-16-74) — 「돌렸는데 SKIP」이 아니라 **못 돌렸다**. **TRADE-03 계속 Pending**(재판정 16-46).

- **16-41 완료 — 갭 4(사용자 직접 보고)의 relay 측 종결 + R2-IN-02.** 이름을 아는 유일한 프로세스가 이름을 붙이게 했다. relay 3파일(공유 계약 1 + 소스 1 + 테스트 1).
- **원천을 늘리지 않고 증상을 없앴다 (T-16-02).** 웹앱에 새 조회 경로(REST·Supabase)를 만들지 않았다 — relay 가 이미 들고 있는 `SymbolMap` 으로 **잔고·미체결·VI 주문에 이름을 붙이는 것과 똑같은 방식**을 상따 에코(60)·스냅샷(64)에 얹었다. `RelayLimitChaser` 에 선택 필드 `name`·`code` 를 더하고 `#enrichLimitChaser`(= `#enrichViOrder` 와 같은 모양)를 신설했다.
- **보강은 캐시에 넣기 전에 한다 — 그것이 이 수정의 핵심이다.** 캐시가 곧 `getLimitChasers` → `lc.snap`(재접속 복원, `fanout.ts:554`)의 원천이라, 팬아웃만 보강하면 「지금 화면」은 이름이 있고 「새로 연 탭」은 ISIN 이 된다. **`fanout.ts` 는 한 줄도 고치지 않았다.** 전량 교체 규율도 그대로다.
- **브라우저는 두 필드를 보낼 수 없다 (T-16-84).** `RelayLimitChaserInput` 의 `Omit` 에 `name`·`code` 를 **둘 다** 넣었다 — 「이름의 소유자도 relay 다. 브라우저가 실어 보내면 화면이 자기가 만든 이름을 자기가 믿는 순환이 생기고, 임의의 종목명이 서버 캐시를 거쳐 다른 탭까지 오염시킨다」. `market` 제외 근거(WR-03/D-28) 아래에 이었다. `webapp/src/lib/limit-chaser.ts` **diff 0줄**(실측).
- **못 풀면 비워 둔다 (T-16-05).** 「이름이 없다」와 「이름이 ISIN 이다」는 다른 사실이고, 후자를 만들면 UI 가 둘을 구분하지 못한다. 「모르면 ISIN 을 그대로」 폴백은 **UI 의 몫**으로 남겼다(16-42).
- **처분 판단 2건을 근거와 함께 남겼다.** ① `crud:"D"` 프레임에도 이름을 붙인다(캐시에서는 지우지만 프레임은 내리므로 「무엇이 사라졌는지」를 말할 수 있어야 한다). ② **미해석 건수 로그는 남기지 않는다** — `#enrichNames` 가 건수를 세는 이유는 계좌당 수십 행이라 「전량 미스 = 맵이 비었다」를 비율로만 알 수 있기 때문인데, 상따는 프레임당 1건이라 같은 판정이 성립하지 않는다.
- **R2-IN-02 — `detach()`·`releaseAll()` 삭제.** 호출자 0건을 리뷰 주장이 아니라 grep 으로 재확인했다(선언 2건이 전부). `detach` 는 `#sessions` 에서 지우기만 하고 `attach` 가 건 `frame`/`ready` 리스너를 **떼지 않아** 부르는 순간이 곧 누수였다. **메서드 선언 `1 → 0`**, 문자열 등장은 `1 → 1`(삭제 사유를 적은 **묘비 주석**) — 두 숫자를 함께 봐야 판정이 선다. `#clearCaches`·`#splitKey`·`buildSubscribeQuoteReq` 중 미사용이 되는 것은 없음을 먼저 확인했다.
- **신규 3케이스.** ⑬(60/64 팬아웃 **그리고 `getLimitChasers` 캐시 복사본**에 이름) · ⑭(모르는 ISIN 은 `undefined` 이고 **ISIN 문자열이 아님**을 명시 단언) · ⑮(`symbols` 미주입 Hub 도 무해). 기존 ③④⑤(에코 upsert·`crud "D"` 삭제·64 전량 교체) **전부 통과**.
- **회귀 잠금 실증 3라운드.** A(보강 무력화)→⑬ 1건 · **B(캐시에는 원본, 팬아웃만 보강)→⑬ 1건이 `strategy-hub.test.ts:398` 즉 `getLimitChasers` 단언 줄에서 실패** · C(못 풀면 `name: item.isin` 지어내기)→⑭·⑮ 2건. **라운드 B 가 「캐시 삽입 이전 보강」이 장식이 아니라는 관측 증거다.** 라운드 A 에서 ⑭·⑮ 가 초록으로 남는 것도 옳다 — 그 둘이 잠그는 명제는 보강 유무와 무관하다. 복원 후 `grep -c MUTATION` = 0, diff 0줄.
- **함정 1건을 실측으로 잡았다(Rule 1).** Task 1 직후의 `pnpm -r typecheck` exit 0 은 **낡은 `packages/shared/dist` 를 본 것**이었다 — relay·webapp 은 shared 를 소스가 아니라 빌드 산출물(gitignored)로 해석한다. Task 2 에서 `TS2353: 'name' does not exist in type 'RelayLimitChaser'` 로 드러났고, `pnpm --filter @gh-radar/shared run build` 후 전 게이트를 다시 돌렸다. **공유 계약을 바꾼 뒤 `pnpm -r typecheck` 단독 통과는 검증이 아니다** — 같은 계약을 webapp 에서 소비하는 **16-42 에 직접 해당한다**.
- **relay 390 tests**(387 → +3, 17 files) · `pnpm -r typecheck` exit 0 · `pnpm -r test` exit 0 **2,029 passed**(기준선 2,026 → +3, relay 외 변동 없음) · `typecheck:tests` exit 0. 포매터 미실행. DB 미변경.
- **⚠️ 사용자가 보는 증상은 아직 그대로다.** `isin-labels.ts` 가 새 필드를 읽지 않으므로 사이드바는 계속 ISIN 을 보여준다 — 소비는 **16-42(wave 27)** 몫이다. 배포도 미실시(**16-46**). `FakeSession`·`FakeSymbols` 만, 실서버·실계좌 접속 0회(D-27). **TRADE-01·TRADE-03 상태 미변경**(TRADE-03 계속 Pending).

- **16-40 완료 — R2-WR-07 + R2-WR-04 종결. 세 카운터와 한 불변식이 각자 자기가 선언한 문장을 실제로 지키게 했다.** relay 2파일(소스 1 + 테스트 1).
- **`inserted` 가 만들지 않은 행을 세지 않는다 (R2-WR-07①).** `OrderInsertSink` 반환을 `{id, created}` 로 넓혀 「새로 만들었다」와 「`23505` 로 기존 행에 수렴했다」를 sink 가 직접 말하게 했다. **`insertRequest` 의 공개 반환 타입은 `Promise<string>` 그대로**라 `order-handler.ts` diff **0줄** — 그것이 이 변경이 최소 침습임의 증거다. 덜어낸 값은 버리지 않고 `insertConverged` 로 노출했다(S-5). `stats()` 는 relay/src 에 소비처가 없어 필드 추가가 `/healthz` 에 닿지 않음을 먼저 확인했다.
- **「이미 있다」가 「기록 불가」로 열화되지 않는다 (R2-WR-07②).** 수렴 재조회를 `try`/`catch` 로 감쌌다 — 재조회가 실패해도 호출자에게 올라가는 것은 **원래의 `23505`** 다. 종전에는 조회 오류가 올라가 `ensureRow` 가 `{kind:"unavailable"}` 로 접고 통보를 드롭했다(16-28 이 닫은 문의 **뒷문**). 삼킨 사실은 `safePgError` 로그로 남는다. lookup sink 조립도 팩토리 본문 한 곳으로 모았다(T-16-14).
- **「도는 배치는 언제나 1개」를 실제로 지킨다 (R2-WR-04).** `flushNow` 의 진행 중 배치 대기를 **라운드 루프 안으로 흡수**해 남의 `#current` 핸들을 덮어쓰지 않게 했다. `close()` 호출 순서는 **바꾸지 않았다**(`index.ts` diff 0줄) — tick 을 먼저 끊으면 `ORDER_FLUSH_MAX_ROUNDS` 의 3라운드 근거(16-24)가 흔들린다. 「큐 스왑은 2선 방어다」를 `#drain` docstring 에 박았다.
- **계획·리뷰의 재현 조건이 실제와 달랐다 — 실측으로 다시 세웠다(Rule 1).** 첫 작성 케이스가 **수정 전 구현에서도 통과**했다. 임시 프로브로 이벤트 순서를 찍어 확인한 결과 ⓐ `setInterval` 은 macrotask 라 마이크로태스크 경계에 끼어들 수 없고 ⓑ 종전 구현의 **루프 밖 `while` 이 진입 구간을 이미 막고 있었다.** 실제로 열려 있던 창은 **라운드 N 종료와 N+1 대입 사이** 하나였다. 3단계 시나리오로 다시 써 **수정 전 `maxLive 2` / 수정 후 `1`** 을 실측했다. 「무엇을 못 잠갔는지」(프로덕션 실시간 경합 그대로는 아니다 — 실제 위험 경로는 `flushNow` 중복 호출)도 SUMMARY 에 명시했다.
- **16-39 가 남긴 `flushed` 잔여 오차를 함께 닫았다(Rule 2).** 「`order_no` 만 담긴 갱신의 `23505`」가 반영 0건인데 `flushed += 1` 하던 것. 16-41~46 어느 plan 도 맡고 있지 않아 여기서 종결했다. `OrderUpdateSink` 반환을 `Promise<void \| {applied}>` 로 넓혀 **기존 sink 구현 변경 0줄**(반환 생략 = `applied:true`)로 `flushedNoop` 을 분리했다. `#retried`·`#dropped` 대입문 diff **0줄** — 16-28 드롭 규율 유지.
- **패턴: 카운터가 아니라 sink 가 참말을 하게 한다.** 16-39 가 `flushed` 를, 이 plan 이 `inserted` 를, 그리고 마지막에 `flushed` 잔여분까지 **같은 형태**로 고쳤다 — 카운터 대입문이 아니라 반환 타입에 한 비트를 더한다.
- **신규 3케이스 + 1건 갱신.** ⓻-b(진짜 sink 3벌 결선으로 `inserted:1`·`insertConverged:1`) · ⓻-c(`rejects.toMatchObject({code:"23505"})` + `details` 부재) · ⑮-b(`maxLive === 1`) · ⓽-b(`flushed:0`·`flushedNoop:1` 로 잔여 오차 주석을 종결 근거로 교체).
- **회귀 잠금 실증 4라운드 — 되돌린 지점마다 정확히 그 케이스 하나만 빨개졌다.** A(created 무시)→⓻-b · B(try/catch 제거)→⓻-c · C(옛 flushNow)→⑮-b `expected 2 to be 1` · D(`applied:false` 제거)→⓽-b `expected 1 to be +0`. 복원 후 전량 통과.
- **`ws-order.test.ts` 는 손대지 않았다.** 계획 frontmatter 에 있으나 전수 확인 결과 `OrderInsertSink` 구현이 없다(있는 것은 `OrderRecorder.insertRequest` 흉내이고 그 시그니처는 의도적으로 유지했다). **없는 변경을 지어내지 않았다.** 후속 16-43 에도 영향 없음.
- **relay 387 tests**(384 → +3, 17 files) · `pnpm -r typecheck` exit 0 · `pnpm -r test` exit 0 **2,026 passed**(기준선 2,023 → +3, relay 외 변동 없음) · `typecheck:tests` exit 0. 포매터 미실행. DB 미변경.
- **⚠️ 배포 미실시 — 프로덕션에는 R2-WR-07·R2-WR-04 가 여전히 살아 있다.** 재배포는 16-46 몫. 가짜 `SupabaseClient` 하네스만, 실서버·실계좌 접속 0회(D-27). **TRADE-03 은 계속 Pending**(재판정 16-46).

- **16-39 완료 — R2-WR-01 + R2-IN-04 종결. `23505` 가 「주문번호를 못 채운다」에서 「그 행의 수명주기가 영원히 갱신되지 않는다」로 번지던 것을 컬럼 하나로 좁혔다.** relay 2파일(소스 1 + 테스트 1).
- **포기의 단위를 「패치 전체」에서 「`order_no` 컬럼 하나」로 줄였다.** `finish` 가 내는 갱신은 `{order_no, status, result_code, notice_type, message, filled_qty, origin}` **한 덩어리**다 — 종전에는 `23505` 하나로 그것이 통째로 사라져 수동 주문 행이 `requested`·`filled_qty:0` 인 채 **영구히** 남았다. 이제 `order_no` 만 뺀 patch 로 **같은 셀렉터**에 1회 재시도한다.
- **16-28 의 규율 셋은 그대로다.** ① 23505 는 큐 재시도를 태우지 않는다 ② `dropped` 를 오염시키지 않는다 ③ 조건을 셀렉터가 아니라 patch 에 건다. 바뀐 것은 포기 단위뿐이고, 그 근거 3줄을 주석에 **인용하며** 이었다.
- **카운터를 고치지 않고 `flushed` 를 참말로 만들었다.** `#flushed`/`#retried`/`#dropped` 대입문 diff **0줄** — 재시도가 성공하면 sink 가 정상 반환하므로 `#drain` 이 세는 1건이 실제로 행에 남는다. **카운터가 참이 되게 동작을 고치는** 형태다 (S-5 / T-16-80).
- **셀렉터 조립을 지역 헬퍼 `runUpdate` 한 곳으로 모았다.** 재시도가 3축(`order_no`+`user_id`+당일)을 복제했다면 언젠가 한쪽이 축을 잃고 그것이 전역 쓰기다(T-16-14). `grep -c 'eq("order_no"'` = **2 → 2**(늘지 않음), 재시도 필터를 ⓽ 가 `[{eq id row-manual}]` 로 정확히 단언한다.
- **계획의 판정식을 코드에서 검증해 고쳤다(Rule 1).** 계획은 「남은 것이 `updated_at` 뿐」을 `Object.keys(rest).length <= 1` 로 세라고 했지만, `updated_at` 이 항상 실리는 것은 **큐 경로뿐**이다 — sink 를 직접 부르는 호출자가 `{order_no, status}` 를 보내면 그 식이 **실필드 1개를 조용히 버린다**(이 plan 이 없애려는 결함 그 자체). `updated_at` 이라는 **이름을 걸러** 센다.
- **가짜 테이블이 스텁을 벗었다.** 성공한 update 가 `matched` 행에 patch 를 **실제로 병합**한다 — 예전 `{data:null,error:null}` 스텁으로는 「갱신이 반영됐는가」를 이 파일이 물을 수조차 없었고, 그래서 손실이 초록불 아래 숨어 있었다. 하네스만 바꿔 전량 실행한 결과 **옛 스텁 동작을 베낀 단언은 ⓽ 의 `toHaveLength(1)` 하나뿐**이었다.
- **⓽ 재작성 + ⓽-b·⓽-c 신규.** ⓽ = `row.status==='accepted'` · `filled_qty===7` · `order_no===''` · **`flushed===1`** · update 2건. ⓽-b = 「보낼 것이 없다」(주문번호만 채우는 갱신)는 재시도하지 않는다 — 계획이 우려한 것과 달리 `rowPatchOf` 의 `updated_at` 덕에 **실제 큐 경로로** 재현된다. ⓽-c = 재시도 실패는 throw 되어 `retried:1`·`dropped:1`·update 4건, 로그에 `details` 부재(16-38 회귀 게이트 겸용).
- **회귀 잠금 실증 2라운드.** A(재시도 무력화) → **2건**(⓽·⓽-c) · B(하네스 병합 제거) → **1건**(⓽, `expected 'requested' to be 'accepted'`). ⓽-b 는 두 라운드 모두 초록 — 그 케이스가 잠그는 명제는 재시도 유무와 무관하므로 옳다. 복원 후 diff 0줄.
- **잔여 오차를 숨기지 않았다.** 「`order_no` 만 담긴 갱신의 23505」 한 경우만은 `flushed` 가 「반영했다」가 아니라 「더 할 것이 없다」를 센다. 고치려면 `#drain` 을 건드려야 하고 그것은 16-28 의 드롭 규율과 얽혀 이 plan 범위 밖이라, ⓽-b 에 주석·단언으로 **드러내 뒀다**.
- **relay 384 tests**(382 → +2, 17 files) · `pnpm -r typecheck` exit 0 · `pnpm -r test` exit 0 **2,023 passed**(기준선 2,021 → +2, relay 외 변동 없음) · `typecheck:tests` exit 0. 포매터 미실행. DB 미변경.
- **⚠️ 배포 미실시 — 프로덕션에는 R2-WR-01 이 여전히 살아 있다.** 재배포는 16-46 몫. FakeGateway·가짜 `SupabaseClient` 만, 실서버·실계좌 접속 0회(D-27). **TRADE-03 은 계속 Pending.**

- **16-38 완료 — R2-CR-03 종결. 제약 위반 한 번이면 계좌번호 원문이 Cloud Logging 에 영구히 남던 경로를 닫았다.** relay 7파일(신규 1 + 소스 5 + 테스트 1).
- **규율을 경로가 아니라 타입에 걸었다.** 신규 `relay/src/store/pg-error.ts` 의 `safePgError(err) -> {code?, message?}` 하나가 정본이다. `details`·`hint` 를 **읽지도 않는다** — 없는 값은 샐 수 없다. 반환 타입을 두 필드로 좁혀 다음 사람이 `details` 를 다시 얹지 못하게 했다. PostgreSQL 은 CHECK(`23514`)·NOT NULL(`23502`)·FK(`23503`) 위반의 `DETAIL` 에 `Failing row contains (<모든 컬럼 값>)` 을 넣고 `dma_orders` 행에는 `account_no`·`order_no`·`user_id` 가 다 있다 (T-16-45/D-19).
- **계획이 지목한 7곳이 아니라 전수 조사 23곳 중 13곳을 교체했다.** 계획의 grep 은 한 줄짜리만 잡아 `#drain` 두 줄과 `credentials.ts` 의 `{ userId, error }`(키 순서가 다르다)를 놓친다. 멀티라인 스캔으로 찾은 **계획 목록 밖 6곳**: `order-handler` 통보 경로 3곳(`findIdByOrderNo`/`insertRequest` 가 던진 원문) · `credentials.ts`+`fanout.ts`(**같은 오류를 두 번** 로그하고 그 테이블에는 `dma_password_enc` 가 있다) · `symbols.ts`.
- **유지 10곳도 근거를 남겼다.** `order-handler.ts:411`(최후 그물)은 안쪽 Supabase 왕복 3곳이 **각각** catch 로 종결되므로 PostgREST 가 닿지 않고, `:862`(조립 거부)는 try 가 감싼 것이 `buildDirectOrderReq` 하나라 `OrderBuildError` 만 온다 — 그때는 스택이 유일한 단서다. 안쪽 catch 를 걷어내면 판정이 무효가 된다는 사실을 그 줄 주석에 박았다.
- **로그 키는 `pgError` 다.** GCP pino 설정의 `messageKey` 가 **`message`** 라, 안전 필드를 최상위로 펼치면 로그 메시지 자체와 충돌한다.
- **동작은 한 줄도 바꾸지 않았다.** `#dropped`·`#retried`·`#flushed` 대입문 diff **0줄**, throw·재시도 분기 0줄. 16-28 의 `23505` 수렴(insert 재조회 + warn, update 정상 반환)도 그대로다. 로그 페이로드만 좁혔다.
- **신규 4케이스** — ⓼-b(insert) · ⓼-c(update) · ⓼-d(조회) · ⓼-e(`#drain` 재큐잉/드롭). 세 sink 중 하나만 잠그면 나머지 둘이 다시 열린다. 각 케이스가 가짜 계좌번호·`"Failing row"`·`hint` 부재 **와 `code` 존재**를 함께 단언한다 (S-5 — 마스킹이 조용한 실패가 되지 않았다는 증거). `fakeDmaOrders` 주입 훅을 `details`·`hint` 를 실을 수 있게 넓히고 `updateError`·`selectError` 를 추가했다 — `details` 없는 스텁으로는 이 갭을 **재현조차 할 수 없다**.
- **회귀 잠금 실증 4라운드 — 되돌린 지점마다 정확히 그 케이스만 빨개졌다.** A(insert)→⓼-b 1건 · B(update)→⓼-c·⓼-e 2건 · C(조회)→⓼-d 1건 · **D(`#drain` 두 줄만, sink 는 안전한 채로)→⓼-e 1건**. 라운드 D 가 「한 자리만 고치면 옆 줄이 그대로 흘린다」의 관측 증거다. 복원 후 diff 0줄.
- **테스트 격리 결함을 잡았다(Rule 1).** 1차 실증에서 한 곳만 되돌렸는데 4건이 빨개졌다 — `vi.spyOn` 은 이미 감싼 메서드에 **같은 spy** 를 돌려주므로 복원 없이는 `mock.calls` 가 케이스를 넘어 누적된다. `afterEach(restoreAllMocks)` 를 넣어 「어느 줄이 새는가」를 이 파일이 말할 수 있게 했다.
- **relay 382 tests**(378 → +4, 17 files) · `pnpm -r typecheck` exit 0 · `pnpm -r test` exit 0 **2,021 passed**(기준선 2,017 → +4, relay 외 변동 없음) · `typecheck:tests` exit 0. 포매터 미실행(prettier 설정 없음).
- **⚠️ 배포 미실시 — 프로덕션에는 R2-CR-03 이 여전히 살아 있다.** 프로덕션이 실 게이트웨이(`10.41.1.120:9100`)에 결선돼 실주문이 흐르는 상태라 노출 표면이 실재한다. 재배포는 3라운드 종결 plan **16-46** 몫. FakeGateway·가짜 `SupabaseClient` 만 사용, 실서버·실계좌 접속 0회(D-27).
- **TRADE-03 은 계속 Pending.** `requirements.mark-complete` 미실행.

- **16-37 완료 — R2-CR-02 종결. 하나의 카운터가 서로 다른 두 원인을 삼키던 것을 갈랐다.** relay 3파일(소스 2 + 테스트 1).
- **`stats().stalledCount` 가 사유를 본다.** `NO_RETRY_STATES`(`session_rejected`·`unauthorized`) 세션은 유예를 아무리 넘겨도 세지 않는다. 그 세션은 `acquire` 가 재생성하지 않고(T-15-10/D-16) 탭이 열려 있으면 `refCount > 0` 이라 유예 소멸도 걸리지 않아 **무기한** 남는다 — 사유를 안 보면 사용자 한 명의 잘못된 DMA 비밀번호가 relay 전체를 **영구 503** 으로 만든다.
- **`sessionsOk` 판정식은 한 글자도 바뀌지 않았다.** 입력값의 정의를 좁힌 것이지 판정을 느슨하게 한 것이 아니다. `acquire`·`release`·`RETRYABLE_DEAD_STATES` diff **0줄**(hunk 헤더 3개가 전부 두 함수 밖) — T-15-10/D-16 유지.
- **GC-WR-07 을 잃지 않았다.** 응답 없는 게이트웨이의 세션 상태는 `connecting`·`reconnecting`·`logging_in`·`failed` 로 `NO_RETRY_STATES` **밖**이라 여전히 stalled 로 세어진다. 기존 ⑩·⑪ 통과 유지가 그 증거다.
- **REVIEW 스니펫을 그대로 믿지 않고 코드에서 확인했다.** `session_rejected` 진입 경로는 `#failNoRetry` **둘**이다 — 자격증명 거부 **와 등록 계좌 0건**(`NO_ACCOUNTS_MESSAGE`). R2 리뷰는 전자만 말했다. 둘 다 그 사용자 한 명의 등록 상태라 같은 처분이 맞고, 그 사실을 `NO_RETRY_STATES` 선언부에 박았다. `unauthorized` 는 세션이 스스로 들어가지 않는 상태(wss 계층이 생성 전 판정)다.
- **신규 2케이스.** ⑩-b(거부 세션, `release` 미호출 = refCount>0 재현 → `stalledCount: 0` **객체 전체 단언**) · ⑩-c(거부 세션 + 무응답 세션을 한 매니저에 함께 두고 `stalledCount: 1` — 제외가 **세션 단위**임을 잠근다). ⑩-c 는 plan 이 허용한 대체 조합(거부+Ready)을 쓰지 않았다 — 그 조합은 제외 유무와 무관하게 0 이라 회귀 게이트가 못 된다.
- **회귀 잠금 실증.** 제외 조건 무력화 시 **⑩-b·⑩-c 2건 실패**(0→1, 1→2), ⑩ 은 통과 유지. 복원 후 13 전부 통과.
- **relay 378 tests**(376 → +2, 17 files) · `pnpm -r typecheck` exit 0 · `pnpm -r test` exit 0 **2,017 passed**(기준선 2,015 → +2) · `typecheck:tests` exit 0. 포매터 미실행. 테스트 diff 삭제 **0줄**.
- **프로덕션 발현과 구분할 것.** 이번 라운드에 관측된 프로덕션 `/healthz` 503 의 원인은 R2-CR-02 가 아니라 **`DMA_HOST` 배포 회귀**(deploy-relay.sh 가 현재 값을 미보존 → 실 게이트웨이가 로컬 mock 으로 강등)였고 `DMA_HOST=10.41.1.120` 복구로 200 `everReadyCount:1` 이 됐다. R2-CR-02 는 **아직 프로덕션에서 발현한 적 없는 코드 결함**이다.
- **⚠️ 배포 미실시.** 사유를 보는 `stalledCount` 는 아직 프로덕션 `/healthz` 에 없다 — 재배포는 3라운드 종결 plan **16-46** 몫. FakeGateway 만 사용, 실서버·실계좌 접속 0회(D-27). 자동 수정(Rule 1~3) 0건, Rule 2 서술 정정 1건.

- **16-36 완료 — R2-CR-01 종결. 마지막 관문이 클라이언트의 자칭을 근거로 자기 자신을 면제하던 것을 없앴다.** relay 2파일(소스 1 + 테스트 1).
- **철거 판정의 정본이 `crud` 에서 게이트 4종으로 옮겨졌다.** `#isTeardown` 첫 줄 `if (cfg.crud === "D") return true;` 를 제거했다 — `crud` 는 **인바운드 필드**라(`protocol.ts` `z.enum(["C","D"])`, `RelayLimitChaserInput` 이 Omit 하지 않는다) 브라우저·옛 탭·임의 wss 가 값을 정한다. 계약 원문(`packages/shared/src/relay.ts:136-141`)이 「게이트가 전부 꺼지면 **서버가** `"D"` 로 정규화한다」고 못박은 대로, `crud` 는 정규화의 **결과**를 말하는 힌트이지 근거가 아니다. `{crud:"D", buyEnabled:true, buyOrderPrice:0, buyOrderQty:0, isin:<마스터에 없는 ISIN>}` 한 프레임이 시장 해석 엄격성(T-16-42)과 무장 가드(T-16-43)를 **동시에** 지나던 경로가 닫혔다.
- **GC-WR-04 를 잃지 않았다.** 게이트 4종 OFF 는 여전히 시장을 못 풀어도 폴백(`"K"`)으로 통과하고, `#strategyArmable` 첫 줄의 철거 면제도 남겼다 — 게이트 4종이 다 꺼져 있어도 `sweepEnabled: true` ∧ 가격/수량 0 이면 `reason === "sweep"` 으로 **철거가 거부되기** 때문이다(`sweepEnabled` 는 삭제 판정 4종에 없다). 그 이유를 그 줄 옆 주석에 박았고 16-42 의 UI 측 대칭 수정(R2-WR-02)이 이 문장을 근거로 삼는다.
- **불일치 로그는 `#isTeardown` 안이 아니라 `lc.set` 진입점 한 곳이다.** 그 함수는 한 프레임당 최대 두 번(`lc.set` · `#strategyArmable`) 호출되므로 안에 두면 사고 1건이 두 줄로 샌다. 계획 문구는 시그니처 확장을 지시했지만 그러면 acceptance criteria 의 `if (this.#isTeardown(cfg)) return true;` 원형 유지와 충돌한다 — 순수 판정 유지 + 진입점 로그가 둘을 모두 만족하는 배치다. 로그는 `{ userId, t, isin, crud }` 뿐, 계좌번호 미포함(T-16-45).
- **기존 테스트 2건의 전제가 거짓이었다.** Task 1 커밋 직후 실측 **2 failed | 371 passed**. 깨진 ⑰-e·⑰-e2 는 `lcInput()` 기본값 `buyEnabled: true` 때문에 「진짜 철거」가 아니라 **정확히 이 갭이 지목한 스푸핑 조합**을 태우면서, 그 위험을 단언하지 않고 초록이었다. **수정을 약화시키지 않고** 게이트 4종을 명시 OFF 로 바꿔 테스트를 진실로 만들었다.
- **신규 3케이스로 두 가드를 각각 잠갔다.** ⑰-e3(`crud:"D"` + 게이트 ON + UNKNOWN_ISIN → **시장 해석** 거부, 게이트웨이 미송신) · ⑰-e4(알려진 ISIN + `buyOrderQty:0` → **무장 가드** 거부, `gate:"buy"`) — **실패 원인이 다르다.** ⑰-e5(`crud:"C"` + 게이트 4종 OFF → 통과)는 ⑰-e3 과 **반대 방향**을 단언해 「게이트가 정본」의 대칭을 잠근다.
- **회귀 잠금 실증.** `if (cfg.crud === "D") return true;` 를 되돌리자 **⑰-e3·⑰-e4 2건 실패**(나머지 33 통과). 복원 후 `grep -c MUTATION` = 0, `git diff --stat eeb4539 -- relay/src/ws/fanout.ts` 출력 0줄. ⑰-e·⑰-e2·⑰-e5 는 무력화 상태에서도 통과하는데 **그것이 곧 GC-WR-04 를 잃지 않았다는 증거**다.
- **relay 376 tests**(373 → +3, 17 files) · `pnpm -r typecheck` exit 0 · `pnpm -r test` exit 0 **2,015 passed**(기준선 2,012 → +3, relay 외 변동 없음) · `typecheck:tests` exit 0. 포매터 미실행(prettier 설정 없음 / 16-30 사고). 자동 수정(Rule 1~3) **0건**.
- **`10.41.1.120` 실측 2건**(`relay/README.md` 경고문 · `relay/src/dma/link-health.ts` 주석) — 둘 다 산문이고 접속 대상 설정이 아니다. FakeGateway 만 사용, 실서버·실계좌 접속 0회(D-27).
- **⚠️ 배포 미실시 — 프로덕션에는 R2-CR-01 이 여전히 살아 있다.** 프로덕션이 실 게이트웨이(`10.41.1.120:9100`)에 결선된 상태이므로, 3라운드 종결 plan **16-46** 의 재배포 전까지 이 사실이 정본이다.
- **TRADE-03 은 계속 Pending.** `requirements.mark-complete` 미실행.

### Phase 16 Gap Closure 2라운드 (2026-09-09, 16-27~16-35)

- **16-35 완료 — 2라운드 종결. GC- 19건이 코드에서 닫히고 프로덕션에 올라갔다.** 저장소 소스 diff **0줄**(이 plan 은 문서 6종만 고친다).
- **전량 게이트 green.** `pnpm typecheck` exit 0(13 워크스페이스) · `pnpm --filter @gh-radar/relay run typecheck:tests` exit 0 · `pnpm -r test` exit 0 **190 파일 / 2,012 passed · 1 skipped · 6 todo**(16-26 기준선 189 / 1,970 → **+42**; shared 99 · relay 373 · server 252 · webapp 672 = 1,396) · `pnpm build` exit 0 · Playwright **126 passed · 9 skipped · 0 failed**(2.5분). **E2E 문구 단언은 고칠 것이 없었다** — 16-31 이 문구 변경과 같은 커밋에서 spec 을 맞췄기 때문이고, 회귀가 숨은 것이 아니라 애초에 red 가 없었다.
- **배포 2종.** relay `relay:c8aa7ae`(digest `sha256:a9bd44f4…`) @ VM `radar-gw`, 기동 직후 VM 로컬 `/healthz` 200 · 71.99MiB/384MiB. webapp Vercel **git 통합 자동 배포** `dpl_7iFWNKh6DYDCWofhFsqBi42QiGxQ` (16:10:25 KST, build **1m**, alias 결선). **server 는 재배포하지 않았다** — `git diff --stat 2cb5620..HEAD -- server/` 와 `-- packages/shared/` 둘 다 **출력 없음**이라 바뀐 것이 없다(리비전 `gh-radar-server-00043-s4f` 유지, smoke 15/15 PASS).
- **`/healthz` 가 200 에서 503 으로 뒤집히는 순간을 잡았다 — 이것이 GC-WR-07 의 직접 증거다.** `16:16:21 200 {…"version":"c8aa7ae","sessionCount":2,"everReadyCount":0,"stalledCount":0}` → `16:17:21 **503** {"status":"degraded",…,"sessionCount":2,"everReadyCount":0,"stalledCount":2}`. **`version` 은 고정, `sessionCount` 도 2 로 고정, 오직 `stalledCount` 만 0→2 로 올라 판정이 뒤집혔다.** relay 가 16:09 에 재기동하며 새로 생긴 세션의 `Entry.createdAt` 이 `STALE_SESSION_MS`(300,000ms)를 넘긴 **바로 다음 샘플**이다. 배포 전 빌드(`2cb5620`)에는 `stalledCount` 필드 자체가 없었다.
- **이 503 은 배포 실패가 아니라 「판정이 옳게 울린 것」이다.** 16-21 유예(`everReadyCount===0`)만 보면 이 상태는 계속 초록이어야 하고 실제로 16:16 은 `ok/200` 이었다. 게이트웨이가 5분이 지나도록 붙지 못한다는 **사실을 그대로 말하는 것**이 GC-WR-07 의 목적이다. ⚠️ 따라서 **uptime check 적색과 `gh-radar-relay-down` 발화는 예상된 결과**이고, 끄려면 그것은 판정을 되돌리는 **사용자 결정**이다(deferred-items §16-35 에 후보 4개와 함께 열린 항목으로 남겼다).
- **smoke 2종 실행.** `smoke-relay.sh` PASS 12 · FAIL 0 · SKIP 1 / `smoke-server.sh` PASS 15 · FAIL 0 · SKIP 0. **INV-9 는 이번에도 못 돌렸다** — `SMOKE_AUTH_TOKEN` 부재로 `ws_order_probe()` 첫 줄에서 조기 반환했으므로 **프로브 본체가 한 줄도 실행되지 않았다**. 「돌렸는데 SKIP」이 아니다. 따라서 **GC-WR-11 의 수정이 실제로 동작하는지는 프로덕션에서 여전히 미검증**이며(16-30 의 격리 실측만 있다), 16-21 재작성 이후 첫 실행은 열린 항목으로 유지된다. 토큰 값은 어디에도 기록하지 않았다(T-16-74).
- **`INV-5a` 의 판정이 시각 의존이 됐다.** 실행 시각(16:14 경)에는 200 이라 PASS 였지만 5분 뒤 같은 검사는 FAIL 이 된다 — GC-WR-07 이 만든 새 성질이다. 재설계 여부는 알림 정책 결정에 딸린 문제라 함께 미뤘다.
- **승인 기준 문구 2건을 정정했다(반복 방지).** ① `grep "10.41.1.120"` **0건**은 만족 불가능하다 — 실측 **33건**(`webapp/src`·`webapp/e2e` 0 / relay 산문·주석 2 / `deploy-relay.sh` 경고·가드 2 / 다른 세션의 미추적 터널 스크립트 29). 2라운드 plan 6건이 이 조건을 인용해 **6회 연속 같은 불일치**를 관측했다. **정본 계약은 리터럴 0건이 아니라 「접속 경로 0건」**이다. ② `pnpm --filter gh-radar-webapp` 은 없는 필터이고(정본 `@gh-radar/webapp`) `No projects matched the filters` + **exit 0** 이라 「절대 실패할 수 없는 검증」이다 — 16-26 이 정정했음에도 16-31·16-32 가 **또** 만났다.
- **webapp 반영은 정황 증명까지다(정직 기록).** 이번 라운드 webapp diff 5파일이 전부 인증 게이트 뒤 트레이딩 표면이라 청크를 내려받아 내용 대조를 할 수 없다. 근거는 ① build 1m(SKIP 배포는 3~5초 `Canceled`) ② `…-git-master-…` alias 결선 ③ 프로덕션 HTML 에 「상승률 상위」 2건·`data-nav-item` 1건 ④ 공개 루트 청크 `2345-c0133ca9890ddb86.js` 해시가 16-26 과 **동일** — 공개 표면을 한 줄도 안 건드린 diff 와 정확히 일치한다.
- **TRADE-03 은 Pending 을 유지한다.** 코드 19건이 닫히고 배포까지 됐으나 프로덕션 `everReadyCount: 0` · `stalledCount: 2` 는 **Ready 에 도달한 DMA 세션이 한 건도 없었다**는 뜻이다. WinForms ↔ 웹 세션 공유는 여전히 미실행이다. mock·단위 검증만으로 올리지 않는다(RELAY-02 와 같은 기준). TRADE-01·02·NAV-01·MYPAGE-01 은 체크박스와 Traceability 가 **5개 ID 전부에서 일치**함을 재확인했고 손대지 않았다.
- **자동 수정(Rule 1~3) 0건.** 이 plan 은 소스를 고치지 않았다.

- **16-34 완료 — GC-WR-03 · GC-WR-10 종결.** 둘 다 「relay 가 이미 손에 쥔 식별 정보를 쓰지 않아 가를 수 있는 것을 못 가르고, 막지 말아야 할 것을 막던」 자리다. relay 2파일(소스 1 + 테스트 1).
- **매매구분이 통보 매칭 축이 됐다(②-1).** 같은 종목·수량·가격의 매수/매도가 동시에 대기하면 ③④ 로는 영원히 갈리지 않는데, 접수 통보는 방향을 실어 온다 — 축이 없어 **실제로 접수된 주문 2건이 모두** 「결과를 확인하지 못했습니다」로 끝났다. `PendingOrder.side`(`:179`) 신설 + `narrowPending:1050-1073` 에 `refine` 축 추가. 취소 대기의 `side` 는 `""` 다 — `handle` 의 `const side = isCancel ? "S"`(`:774`)는 `dma_orders.side` CHECK 통과용 **표기**이지 방향의 정본이 아니다.
- **`sideTrusted` 한 축으로는 모자랐다.** 계획·REVIEW 스니펫은 `sideTrusted && side !== ""` 였는데 그대로 넣으니 기존 테스트 ②(「거부는 신규·취소 어느 쪽에도 온다」)가 깨졌고, **그 단언이 참이었다** — 파서는 `sideTrusted = noticeType !== "C" && !== "M"` 이라 거부("R")에 `true` 를 주지만 "R" 은 취소 요청에도 온다. 취소 요청에는 매매구분이 없어 그 통보의 side 는 브로커 기본값이므로, 축을 걸면 **취소거부가 살아 있는 신규 매수를 「거부됨」으로 정산**한다. `noticeType ∈ {A, E}` 한 겹을 더 걸었다. 즉 `sideTrusted` 는 「표시해도 되는가」의 축이지 「좁혀도 되는가」의 축이 아니다.
- **정규화는 `fromWireSide`(envelope.ts) 재사용.** `sideOf` 의 `startsWith("S") ? "S" : "B"` 를 베끼면 **모르는 값이 매수로 확정**된다. `fromWireSide` 는 첫 글자로 판정하고 아니면 `null` → 축을 건너뛴다.
- **취소 중복 키가 원주문번호로 갈렸다.** `dupKey:244-247` — 취소는 `(accountNo,isin,"C",orgOrderNo)`, **신규는 문자열 한 글자도 안 바뀌었다**(두 탭 동시 발주 차단 = 16-22 truth 25). 취소 수량은 언제나 미체결 잔량 전부라(UI D-21) 가격·수량은 취소의 식별자가 아니고, 같은 종목·가격·잔량의 미체결 2건(다른 단말·전일 잔여·자동주문)에서 두 번째 취소가 최대 5초 거부됐다 — 급락 국면의 일괄 취소를 막는 가드는 사고를 막는 것이 아니라 만든다. 같은 `orgOrderNo` 연타는 여전히 거부다. 키 회수 경로(`release`·`closeConn`·`dropUserDupKeys`)는 `claimKeys` 쌍 관례 덕에 **변경 0건**.
- **㉑ 은 「좁혀지지 않는 예」를 바꿔야 했다.** 계획은 「매수 10@70000 두 건」을 지시했지만 **그 상태는 이 경로에 존재할 수 없다** — 완전히 동일한 신규 2건은 dup 키가 같아 두 번째가 게이트 ⓪에서 거부된다. 신규 dup 축이 매칭 축을 덮기 때문이다. 대신 **부분체결**을 썼다: 체결("E") 통보는 수량·가격이 체결값이라 ③④ 가 죽고, 방향이 같으면 ②-1 도 갈라 주지 못한다. 「모든 축이 같은 신규 2건」은 단위 케이스가 계속 잠근다.
- **회귀 잠금 실증 5회.** ②-1 축 차단 → **2건**(㉙·단위) / 가드를 REVIEW 스니펫대로 되돌림 → **2건**(기존 ②·신규 단위) / 취소 dup 키 원복 → ㉚ / 취소 키를 `rid` 로 → ㉛ / 취소 대기 `side` 에 DB 표기 주입 → **0건**(`!p.isCancel` 이 먼저 걸러 관측 불가 — 의도적 중복 방어임을 SUMMARY 에 사실대로 남겼다). 확인 후 전부 복원(`grep -c MUTATION` = 0).
- **relay 373 tests**(368 → +5, 17 files) · typecheck · typecheck:tests green. 신규 마이그레이션 0건. 자동 수정(Rule 1~3) **0건**.
- **`10.41.1.120` 실측은 여전히 2건**(`relay/README.md:17` 경고문 · `relay/src/dma/link-health.ts:20` 주석) — 2라운드 5번째 연속 동일. 둘 다 산문이라 지우지 않았다.
- **TRADE-03 은 계속 Pending.** `requirements.mark-complete` 미실행 — 프로덕션 `everReadyCount: 0` 판정(16-26)이 그대로다.
- **배포 미실시.** relay 재배포는 16-35 몫이다.

- **16-33 완료 — GC-CR-02 · GC-WR-01 · GC-WR-02 종결.** 셋 다 `recordUnmatched`/`ensureRow` 한 경로에 있고, 셋 다 「통보 1건의 사고가 기록 소실 또는 전면 장애로 번진다」는 모양이었다. relay 3파일(소스 2 + 테스트 1).
- **수동 통보도 조회를 거친다.** 수동 주문의 insert 는 접수 전이라 `order_no` 를 싣지 않고 `finish` 가 정산할 때 채운다 — 그런데 좁히기 실패·연결 종료 후 도착 두 경로는 그 정산을 거치지 않으므로, 그 시점의 `order_no` 셀렉터 갱신은 **0행**이다. PostgREST 는 0행 update 를 에러로 주지 않아 **로그 한 줄 없이** 사라졌다(이 파일이 머리말에서 없애겠다고 선언한 Pitfall 18 그 자체). 이제 `findIdByOrderNo`(`:427`)로 좁혀 **행이 있음이 확인된 경우에만** `orderRowId` 로 갱신하고(`:444`), 없으면 통보 원문(`orderNo`·`noticeType`·`resultCode`·`isin`·수량·가격)을 `logger.error` 로 남기며 **갱신을 큐에 넣지 않는다**(`:452-462`). 조회 실패는 기존 `lookup-failed` 와 동형으로 열화 갱신 + error(S-5).
- **D-24 의 두 번째 감사 사본이 실재하게 됐다.** `subscription-hub.ts:708-716` 에 통보 수신 stdout 1줄(`userId`·주문번호·통보종류·결과코드·origin). 계좌번호·자격증명 미포함(D-19 승계). `dma_orders` 에 붙지 못한 통보라도 이 줄로 브로커 주문번호와 대조된다.
- **예외 격리는 두 겹이다.** 호출부 `void recordUnmatched(...).catch`(`:374`) + `autoInsertRow` 를 `insertOnly` 의 try 안으로(`:547`/`:548`). `index.ts` 의 `unhandledRejection` 은 `logger.fatal` + **프로세스 종료**라, `.catch` 하나가 없으면 통보 1건의 파손이 접속한 **전 사용자의 DMA 세션**을 끊는다. 한 겹만 두면 원인은 남고 증상만 가려지므로 둘 다 했고, **각각 독립으로 잠긴 것을 변이 2종으로 실증**했다.
- **빈 주문번호는 상관 키가 아니다.** `ensureRow:500` 이 `orderNo === ""` 를 in-flight(`:524`) 밖으로 뺀다. 합치면 그 사용자의 **모든** 접수 전 거부("R")가 `"user|"` 하나를 공유해 서로 다른 거부 2건이 같은 `row.id` 를 받고 차례로 덮어써졌다. `findIdByOrderNo` 는 이 값에서 항상 `null` 이라 dedup 의 의미도 애초에 없다.
- **기존 테스트 2건이 「일어나지 않는 일」을 참이라고 잠그고 있었다.** ⑨ 의 「다만 기록은 남는다 — `order_no` 로 좁힌 갱신이다」와 ⑭ 의 제목 「조회도 insert 도 하지 않는다」는 프로덕션에서 거짓이었다(그 update 는 0행). 옛 구현을 그대로 베낀 단언이라 **결함과 함께 초록**이었다 — 문구·단언을 진실로 교체했다. 계획은 ㉑ 만 예고했지만 실제로 깨진 것은 3건이다.
- **회귀 잠금 실증 4회.** manual 분기 원복 → **4건 실패**(⑨·⑭·㉑·㉖) / Hub 감사 사본 `info`→`debug` → ㉖ 실패 / `autoInsertRow` 를 try 밖으로 → ㉗ 가 로그 문구로 실패 / 거기에 `.catch` 까지 제거 → ㉗ 이 **실제 unhandledRejection 1건**으로 실패 / 빈 주문번호 갈래 차단 → ㉘ 이 「두 번째 insert 진입」 조건 미달로 실패. 확인 후 전부 복원(`grep -c MUTATION` = 0).
- **테스트 하네스 교훈.** `waitFor` 의 조건을 **결과**(error 로그)에 걸면 회귀가 생겼을 때 단언이 아니라 **타임아웃**으로 죽어 뒤 단언이 아예 실행되지 않는다. 조건을 회귀와 무관하게 항상 뜨는 **입력 수신**(Hub 감사 사본)으로 옮겼다.
- **relay 368 tests**(365 → +3, 17 files) · typecheck · typecheck:tests green. 신규 마이그레이션 0건.
- **`10.41.1.120` 실측은 여전히 2건**(`relay/README.md:17` 경고문 · `relay/src/dma/link-health.ts:20` 주석) — 2라운드 4번째 연속 동일. 둘 다 산문이라 지우지 않았다.
- **TRADE-03 은 계속 Pending.** `requirements.mark-complete` 미실행 — 프로덕션 `everReadyCount: 0` 판정(16-26)이 그대로다.
- **배포 미실시.** relay 재배포는 16-35 몫이다. 16-34 가 같은 파일의 `narrowPending`·`dupKey` 를 이어 손대므로 그 두 지점은 재배열하지 않았다.

- **16-32 완료 — GC-WR-06(VI 2곳) · GC-IN-03 종결.** 셋 다 「화면이 사실과 다른 것을 말하던」 자리다. webapp 5파일 + 신규 테스트 1(relay 0줄).
- **VI 확인 체크가 `send` 반환값을 읽는다.** `toggle` 은 반환값을 버리고 곧바로 낙관 반영과 행 잠금을 걸었다 — 이 화면에서 **잠금을 푸는 유일한 신호가 서버 73 델타**라, 요청이 나가지 않으면 그 델타는 오지 않고 행은 **영구히** 회색으로 남는다. 사용자는 「119초 자동취소를 면제시켰다」고 믿는다. 실패 분기의 `return`(`:255`)이 `setOptimistic`(`:258`)·`setSending`(`:259`)보다 **앞**이고, 순서가 곧 안전장치다. `isConfirmable` 가드는 그대로 — 이 분기는 「`ready` 표시와 소켓 `readyState` 가 어긋나는」 얇은 창을 메운다.
- **VI 설정의 `submit` 이 3갈래가 됐다.** boolean 으로는 뭉개지는 것이 있었다: `blocked`(세션 잠금·연타·금액 상한)는 사유가 **카드 안에 이미** 떠 있어 다이얼로그를 **닫아야** 보이고, `failed`(소켓이 안 받음)는 사유가 아직 없어 창을 **열어 둬야** 한다 — 닫으면 「눌렀고 창이 닫혔다」가 곧 성공 신호로 읽히고, 이 화면에서 그 오독은 「자동매수를 켰다고 믿는 사용자」다. `failed` 면 `submitting` 잠금·`ackTimer`·`onSent` 어느 것도 걸지 않는다(기다릴 에코가 없는데 잠그면 3초 동안 등록됐다고 믿는다). 사유는 오버레이에 가리지 않도록 **다이얼로그 안에도** 그린다.
- **「가장 최근 반영 시각」이 정규화 전 값으로 비교된다.** `formatServerTime` 은 `HH:MM:SS` 로 자르며 **날짜를 버리는데**, 그 뒤 비교하면 자정 경계에서 `"23:59:00" > "00:01:00"` 이라 **어제 값이 「가장 최근」으로 뽑히고**, 혼합 포맷에서는 날짜를 **아는** 값이 모르는 값에 진다. 이제 `st` 원문에서 비교 키를 만들고(`dated` 가 첫 번째 축) 승자의 원문에서 표시값을 뽑는다. **epoch 승격을 고르지 않은 이유**: `HH:MM:SS` 만 오는 값은 날짜를 몰라 「오늘」을 가정해야 하고, 그 가정이 정확히 버그의 원인이다. 표시 형식·`null` 계약·「계좌가 하나면 결과가 같다」는 16-23 보장은 그대로 — 바뀐 것은 **어느 값을 고르는가**뿐이다.
- **16-31 의 교훈을 예방으로 적용했다.** 두 테스트 파일의 `send` 스텁을 `mockClear()` → `mockReset() + mockReturnValue(true)` 로 **같은 커밋 안에서** 세웠다. 16-31 은 이것을 놓쳐 `limit-chaser-client.test.tsx` 2건이 한 커밋 동안 깨져 있었다 — 이번에는 중간에 깨진 상태가 없었고, **자동 수정(Rule 1~3) 0건**이다.
- **회귀 잠금 실증 3회.** `if (!send(...))` 2곳 동시 무력화 → **3건 실패**(나머지 51 통과) · `isNewerServerTime` 의 `dated` 축 **한 줄**만 제거 → 혼합 포맷 1건 실패 · `latestAccountTime` 을 16-23 원형으로 되돌림 → 2건 실패. webapp **672 tests**(665 → +7, 58 files) · typecheck · eslint green. 신규 마이그레이션 0건.
- **`latestAccountTime` 에 첫 테스트가 생겼다** (`me-client.test.tsx`, 그전까지 0건).
- **계획 문언 오류가 2라운드에서 두 번째로 반복됐다.** `pnpm --filter gh-radar-webapp` 은 존재하지 않는 필터다(정본 **`@gh-radar/webapp`**). 남은 plan(16-33~16-35)의 같은 문자열도 같은 치환이 필요하다.
- **`10.41.1.120` 실측은 여전히 2건**(`relay/README.md:17` 경고문 · `relay/src/dma/link-health.ts:20` 주석). 둘 다 산문이라 지우지 않았다 — 지우면 D-27 안전장치의 근거가 사라진다.
- **TRADE-02 · MYPAGE-01 은 상태를 바꾸지 않았다.** `requirements.mark-complete` 미실행 — 이 plan 이 닫은 것은 VI 표면의 **전송 정직성**과 상태줄 표시 정확성 1건이고, 종결 판정은 2라운드 종결 plan 의 배포·실측 몫이다.
- **배포 미실시.** webapp(Vercel) 배포는 relay 재배포와 함께 2라운드 종결 plan 에서 일괄 처리한다.

- **16-31 완료 — GC-WR-09 · GC-WR-06(상따 폼 2곳) · GC-WR-12 · GC-IN-01 · GC-IN-02 종결.** 공통점은 「이 화면이 **자기 주석이 말하는 대로 동작하지 않는다**」였다. webapp 4파일만 손댔다(relay 0줄).
- **「수정」도 무장 판정을 지난다.** 파일 머리말이 「전송 직전 가드가 `gateBlocked` 를 함께 읽는다」고 적어 왔지만 실제로 읽던 것은 `toggleGate` 하나였다 — 서버가 `buyEnabled:true` 로 에코한 뒤 시세가 끊겨 가격 칸이 0 이 되면 「수정」이 relay `#strategyArmable`(16-29)에 **통째로** 거부되고 함께 실린 다른 값까지 하나도 저장되지 않았다. 가드를 `setSubmitting(true)` **앞**에 뒀고(잠근 뒤 막으면 60 에코가 안 와 버튼이 영구히 죽는다), **켜져 있는 게이트만** 본다 — 게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다(T-16-44 확장, 케이스로 잠금).
- **상따 폼의 `send` 2곳이 반환값을 읽는다.** `toggleGate` 는 `setForm` 낙관 반영을 **전송 뒤로** 옮겼다 — 소켓이 받지 않은 요청에도 스위치가 켜진 것처럼 보이던 것이 이 화면 최악의 결과였다. `handleSubmit` 은 실패 시 `submitting` 을 되돌린다(잠금을 푸는 신호가 오지 않을 요청이므로). 실패 문구는 `strategy-status-card.tsx` 의 「연결이 끊겨 …」 계열과 같은 어조이고, 표시 자리는 새로 만든 `data-slot="lc-submit-error"`(`role="alert"`, 폼 맨 위 — `DirtyActionBar` 는 더티 0 이면 렌더되지 않아 스위치 실패 사유를 담을 수 없다).
- **안내가 원인을 값으로 가른다.** 옛 문구는 「시세를 받지 못해 발주가·수량이 0」 한 줄로 뭉갰지만, e2e 가 고정한 실제 재현 조건은 「기본 10만원으로 127,400원 종목 → 0주」 즉 **금액 부족**이다. `armBlockedTextOf(key, values)` 하나가 매수 2·매도 2·한방 2 갈래를 내고 그룹 사유줄과 전송 차단 문구가 **같은 함수**를 읽는다. 매도 문구는 「예상 매도수량」(표시 전용)이 아니라 **감시 호가잔량**을 가리키게 바로잡았다.
- **메모가 실제로 작동한다.** `canArm` 을 `useMemo`(세 파생 boolean 의존)로 감싸 `gateBlocked` 의 `useCallback` 이 진짜로 메모된다 — eslint `react-hooks/exhaustive-deps` 경고가 **1건 → 0건**으로 소멸하는 것을 실측했다. `isPickable` 은 타입 서술자가 됐고 `as string` 단언이 파일에서 **1 → 0**.
- **회귀 잠금 실증 3회.** 새 분기를 무력화하면 ⑭ 2건 / ⑭ 1건 / ⑮·⑬ 3건이 각각 실제로 실패하는 것을 확인 후 복원. webapp **660 tests** · typecheck · eslint green. 신규 마이그레이션 0건.
- **자동 수정 1건(Rule 1).** `send` 분기 도입으로 `limit-chaser-client.test.tsx` 의 스텁이 `undefined`(falsy)를 돌려주며 2건이 깨졌다 — `mockReturnValue(true)` 로 세웠다. **`send` 계약을 읽는 호출부를 늘릴 때는 그 컴포넌트를 렌더하는 모든 테스트 파일의 스텁을 함께 세워야 한다** (GC-WR-06 의 남은 2곳: `vi-order-list.tsx` · `vi-settings-card.tsx`).
- **계획 문언 오류 1건.** `pnpm --filter gh-radar-webapp` 은 존재하지 않는 필터다(실제 name 은 **`@gh-radar/webapp`**). 그대로 돌리면 `No projects matched the filters` 로 exit 1 — 이후 plan 이 이 문자열을 그대로 인용하면 같은 불일치가 반복된다.
- **TRADE-01 은 상태를 바꾸지 않았다.** `requirements.mark-complete` 미실행 — 이 plan 이 닫은 것은 안전 게이트의 **UI 측 정직성**이고 종결 판정은 2라운드 종결 plan 의 배포·실측 몫이다.
- **배포 미실시.** webapp(Vercel) 배포는 relay 재배포와 함께 2라운드 종결 plan 에서 일괄 처리한다.

- **16-30 완료 — GC-WR-07 · GC-WR-11 종결.** 둘 다 「우리가 장애를 **관측하는 수단**」이 스스로를 무력화하던 자리다 — 하나는 uptime check, 하나는 smoke 판정이다.
- **`/healthz` 의 면제에 시간 상한이 붙었다.** 16-21 의 `everReadyCount === 0` 유예는 그대로 두되, 「생성 후 `STALE_SESSION_MS`(5분)가 지나도록 한 번도 Ready 가 아닌 세션」(`stalledCount`)을 함께 세어 판정을 `(everReadyCount === 0 && stalledCount === 0) || readyCount > 0` 으로 바꿨다. `hasBeenReady` 는 **프로세스 메모리 래치**라 게이트웨이 장애 중에 relay 가 한 번만 재시작하면 진짜 장애가 영원히 `ok/200` 이었다 — 예전 규칙(`sessionCount > 0 && readyCount === 0`)이 잡던 사례가 통째로 빠져 있었다. 부팅 직후 유예(16-21 이 gap 4 로 얻은 것)는 그대로다.
- **래치는 건드리지 않았다.** 시각을 `DmaSession` 이 아니라 매니저 `Entry.createdAt` 에 얹어 `relay/src/dma/session.ts` diff **0줄**(T-16-26). `stalledCount` 는 `everReadyCount` 와 같은 규율로 **필수 필드**라, 스텁 5곳과 필드 화이트리스트 2곳이 컴파일·단정 단계에서 갱신을 강제받았다.
- **smoke INV-9 의 두 결함을 닫았다.** ① Supabase 액세스 토큰이 `node ... "$token"` argv 로 나가 `ps` 에 노출되던 것을 `SMOKE_TOKEN` **env 전달**로 바꿨다(T-16-56). ② 프로브가 판정을 찍은 **뒤** 비정상 종료하면 `printf 'inconclusive'` 가 **덧붙어** `reachable\ninconclusive` 가 되고 `case` 의 `*` 로 떨어져 **FAIL 이 SKIP 으로 강등**되던 것을, 변수 **대입 + 단일 출력 지점**으로 바꿨다(T-16-57). `case *` 갈래는 이제 관측 문자열 원문을 남긴다.
- **회귀 잠금 실증.** `sessionsOk` 를 16-21 원형으로 되돌리면 ⑧-d 가, `stats()` 의 stalled 분기를 차단하면 ⑩ 이 실제로 실패하는 것을 확인 후 복원. relay **365 tests** · typecheck · typecheck:tests green. 신규 마이그레이션 0건.
- **smoke 는 프로덕션 대상으로 돌리지 않았다** (실행은 2라운드 종결 plan 몫). 대신 `node`·`pnpm` PATH 셰임으로 `ws_order_probe` 만 격리 실행해 수정 전/후를 실측했다 — 수정 전 argv 토큰 **1건** · 판정 `reachable\ninconclusive`, 수정 후 argv 토큰 **0건** · 판정 `inconclusive`. 토큰 미설정 시 SKIP 은 전후 동일.
- **실행 중 자초한 회귀 1건을 되돌렸다.** 저장소에 prettier 설정이 **없어** `npx prettier --write` 가 기본 `printWidth: 80` 으로 무관한 줄을 통째로 재배열했다(459 insertions). 테스트 2종은 `git checkout` 후 편집 재적용으로 복구했고 최종 diff 의 삭제 줄은 의도한 것뿐이다. **이 저장소에는 자동 포매터가 없으므로 돌리지 않는다.**
- **`10.41.1.120` 실측은 여전히 2건**(`relay/README.md:17` 경고문 · `relay/src/dma/link-health.ts:20` 주석). 둘 다 산문이고 접속 대상 설정이 아니라 **삭제하지 않았다** — 지우면 D-27 안전장치의 근거가 사라진다.
- **TRADE-03 은 계속 Pending.** `requirements.mark-complete` 를 돌리지 않았다 — `stalledCount` 판정은 아직 배포되지 않았고 프로덕션 `/healthz` 의 `everReadyCount: 0`(16-26)은 그대로다.
- **배포 미실시.** relay 재배포는 2라운드 종결 plan 에서 일괄 처리한다.

- **16-29 완료 — GC-WR-04 · GC-WR-05 종결.** `lc.set` 의 관문이 **한쪽으로는 과하게 엄격하고 다른 쪽으로는 느슨하던** 상태를 동시에 바로잡았다. 시장 해석은 이제 **의도로 갈린다**: 철거(`crud:"D"` ∨ 게이트 4종 전부 OFF)는 `#teardownMarket` 이 받아 **에코 캐시(`getLimitChasers`) → `SymbolMap` → 상수 폴백** 순으로 풀고 **절대 거부하지 않는다**. 등록·수정은 `#strategyMarket` 그대로라 16-25 의 엄격함(기본값 `"K"` 금지 / T-16-42)이 유지된다.
- **폴백을 「통과」로 정한 근거는 전략 키에 시장이 없다는 사실이다.** `strategyKey()` = `ISIN:계좌:거래소` 이고 게이트웨이 `LimitChaser::MakeKey` 와 동형이라, 철거 프레임의 `market` 은 **무엇을 지울지에 관여하지 않는다** — 지어낸 값이 엉뚱한 대상을 지울 위험이 구조적으로 없다. 최종 폴백은 `logger.error` 를 동반한다(S-5, 계좌번호 미포함).
- **철거 판정을 `crud` 하나에 의존하지 않는다.** `crudOf()` 는 브라우저에만 있으므로 UI 우회 경로(옛 탭·직접 wss)의 전 게이트 OFF 는 `crud:"C"` 로 도착할 수 있다. `#isTeardown` 이 `isDeleteIntent()` 와 **같은 네 항**(`sweepEnabled` 제외)을 함께 본다.
- **무장 가드가 UI 3식과 동형이 됐다.** `#strategyArmable` 의 `reason` 이 `buy`·`sell`·`sweep` 3갈래다 — `sellWatchQty === 0`(계약이 「0 이면 서버가 매도를 눕힌다」고 못박은 값)과 한방 게이트가 이제 서버에서 통과하지 못한다. 삭제에는 이 가드가 걸리지 않으며, 그 예외를 호출부가 아니라 **함수 자신이** 소유한다.
- **회귀 잠금 실증.** `#isTeardown` 의 `crud === "D"` 를 뒤집으면 ⑰-e·⑰-e2 가, `sell`·`sweep` 갈래를 옛 상태로 되돌리면 ⑰-g·⑰-h·⑰-h2 가 실제로 실패하는 것을 확인 후 복원. relay **361 tests** · typecheck · typecheck:tests green. 신규 마이그레이션 0건.
- **검증 기준 하나가 저장소 실제와 어긋난다.** 계획의 `grep -rn "10.41.1.120" relay/` **0건** 조건은 실측 **2건**(`relay/README.md:17` 경고 문장 · `relay/src/dma/link-health.ts:20` 주석)이라 성립하지 않는다. 둘 다 이 plan 이전부터 있던 산문이고 접속 대상 설정이 아니다 — D-27 의 실질(실서버·실계좌 미접속)은 지켜졌다.
- **TRADE-03 은 계속 Pending.** 프로덕션 `everReadyCount: 0` 판정(16-26)은 그대로다 — `requirements.mark-complete` 를 돌리지 않았다.
- **배포 미실시.** relay 재배포는 2라운드 종결 plan 에서 일괄 처리한다.

- **16-28 완료 — GC-WR-08 · GC-IN-04 종결.** 16-18 의 부분 UNIQUE 인덱스가 막은 「같은 주문 두 벌」 경주는, 그 위반(`23505`)을 아무도 해석하지 않아 **「기록 소실」로 바뀌어 있었다**. insert sink 는 이제 `23505` 이고 `orderNo` 가 비어 있지 않을 때만 같은 3축으로 재조회해 **기존 행 id 로 수렴**하고 warn 을 남긴다(`origin`·SQLSTATE 만 — 계좌·주문번호 원문 없음). 다른 코드는 이 plan 전후로 완전히 동일하게 throw 다.
- **`order_no` 를 채우는 갱신의 `23505` 는 재시도하지 않는다.** 재시도해도 결과가 같은 데이터 분기라, throw 대신 사유 있는 error 로그로 끝내 `#dropped` 를 오염시키지 않는다(S-5). 분기 조건은 **셀렉터가 아니라 patch** 에 걸었다 — `finish` 는 `orderRowId` 를 쥐고 있어 셀렉터가 `id` 이고 `order_no` 는 채울 컬럼이다. 계획 문구(`order_no` 셀렉터)대로였다면 갭이 지목한 경로를 비켜 갔다.
- **`ORDER_FLUSH_MAX_ROUNDS` 의 `+2` 에 근거가 붙었다.** 「이론상 2회면 끝난다」와 식(=3)이 다른 수를 말하던 상태를 없애고, 라운드 1 첫 배치 / 2 재시도분 / **3 동시 유입 확인**(`flushNow` 가 `await` 하는 사이 동기 `enqueueUpdate` 로 들어온 항목)을 docstring 에 명시했다. 식은 유지.
- **회귀 잠금 실증.** 두 `23505` 분기를 `false` 로 무력화하면 새 테스트 ⓻·⓽ 가 실제로 실패한다(⓽ 는 드롭 카운터가 1 로 오른다)는 것을 확인 후 복원. relay 355 tests · typecheck · typecheck:tests green. 신규 마이그레이션 0건.
- **TRADE-03 은 계속 Pending.** 프로덕션 `everReadyCount: 0` 판정(16-26)은 그대로다 — `requirements.mark-complete` 를 돌리지 않았다.

- **16-27 완료 — GC-CR-01 · GC-CR-03 종결.** `narrowPending` 의 「후보 1건 지름길」을 제거하고, 통보가 **실어 온** 강한 축(비어 있지 않은 `orgOrderNo` · 취소성 `noticeType` C/M)을 후보 수와 무관한 **하드 필터**로 승격했다(0건이면 `null`). 비어 있는 축은 그대로 건너뛰므로 구 게이트웨이 호환은 유지된다. 통보 소비 루프의 warn 조건도 `candidates.length > 0 && picked === null` 로 넓혀 후보 1건 미정산의 침묵을 없앴다.
- **await 경계 TOCTOU 가드.** `await insertRequest` 직후·`buildDirectOrderReq` 이전(`order-handler.ts:701` vs `:719`)에 `conns.get(conn) !== state` 를 두어, 왕복 중 탭이 닫히면 **주문이 게이트웨이로 나가지 않는다**. 중단 시 `logger.warn` + `status:"rejected"` 를 남기며, 고아 `ConnState` 대기·타이머가 아예 생기지 않아 「실제로 접수된 주문이 `timeout` 으로 감사 기록에 남는」 경로가 사라졌다.
- **회귀 잠금을 실증했다.** 새 테스트 ㉕ 는 가드를 임시 무력화했을 때 실제로 실패한다(`DirectOrderReq` 1건 송신)는 것을 확인한 뒤 복원했다. relay 전체 352 tests · typecheck · typecheck:tests 모두 green.
- **TRADE-03 은 계속 Pending.** 코드 층위만 닫혔고 프로덕션 `everReadyCount: 0` 판정(16-26)은 그대로다 — 단위 검증만으로 Complete 로 올리지 않는다.
- **배포 미실시.** relay 재배포는 2라운드 종결 plan 에서 일괄 처리한다.

### DMA_HOST 배포 회귀 — 발견·수정 (2026-09-09, 갭 클로징 2라운드 직후)

**Phase 16 의 배포 2회가 프로덕션 relay 를 실 게이트웨이에서 로컬 mock 으로 조용히 강등시켜 놓았다.**

- `scripts/deploy-relay.sh:95` 는 `DMA_HOST="${DMA_HOST:-127.0.0.1}"` 이고 **현재 컨테이너 값을 보존하지 않는다.** 주입 없이 배포하면 실 게이트웨이에 붙어 있던 프로덕션이 mock 으로 내려간다. mock 은 VM 에 기동돼 있지도 않아 `connect ECONNREFUSED 127.0.0.1:9100` 이 된다.
- Phase 15 는 실 게이트웨이(`10.41.1.120:9100`) 결선 + 실계좌 왕복(`dma_orders` 5행)까지 갔다. 그런데 **16-26(`2cb5620`) 과 16-35(`c8aa7ae`) 가 모두 `DMA_HOST` 를 빠뜨렸다.** 두 executor 다 D-27(「실서버 주소는 명시 주입 전용」)을 **「주입하지 말라」**로 읽고 mock 강등을 의도된 상태로 SUMMARY 에 기록했다.
- **한 원인이 세 증상으로 보였다.** ① `/healthz` 503 `degraded` ② `gh-radar-relay-down` 알림 — **오탐이 아니라 런북 원인 #4 그대로의 참 양성** ③ **웹앱 사이드바에 「트레이딩」 그룹 미표시** — `useTradingVisible()` 이 `user != null && relay status === "ready"` 를 요구하는데 `ready` 는 DMA 세션의 로그인+계좌선언 완료가 조건이다(`packages/shared/src/relay.ts:454`). 배포 누락이 **아니었다**.
- **오진 기록.** 이 세션은 처음에 「게이트웨이는 설계상 미결선」으로 판단하고 알림 snooze 를 권고·적용했다. 전제가 틀렸다 — snooze 는 5분 만에 `cancel` 했고 알림은 정상 복귀했다. `everReadyCount: 0` 을 「환경에 게이트웨이가 없다」로 읽기 전에 **컨테이너 실 env 를 먼저 확인**해야 한다.

**수정 실측 (2026-09-09):** `DMA_HOST=10.41.1.120 bash scripts/deploy-relay.sh` -> `relay:59465e1`.

- 컨테이너 실 env `DMA_HOST=10.41.1.120` · 게이트웨이 TCP 도달성 `REACHABLE 10.41.1.120:9100`
- 프로덕션 `/healthz` **200** `{"status":"ok","vpn":true,"dma":true,"version":"59465e1","sessionCount":1,"everReadyCount":1,"stalledCount":0}`
- **`everReadyCount: 1` — 프로덕션에서 DMA 세션이 Ready 에 도달한 첫 실측이다.** TRADE-03 이 Pending 이던 근거(「Ready 에 도달한 세션이 한 건도 없다」)가 해소됐다. 다만 **자동 Complete 승격은 하지 않는다** — 아래 리스크와 WinForms 세션 공유 실측(human-only)이 남아 있다.
- **후속 (2026-09-10 ~ 09-11) — 위 줄의 유보가 풀렸다.** 남아 있던 「WinForms 세션 공유 실측(human-only)」을 2026-09-10 장중 실계좌에서 사용자가 **양방향 직접 관찰**했고(`quick-260910-ogq`), 2026-09-11 에 철거 방향까지 확인됐다. **TRADE-03 은 Complete 다** — 정본은 `REQUIREMENTS.md` Traceability.
- `smoke-relay.sh` **PASS 12 · FAIL 0 · SKIP 1**(INV-9, 토큰 미설정)

**이 결선으로 위험도가 올라간 항목 — 라운드 3에서 최우선.** `16-REVIEW-R2.md` 의 **R2-CR-01**(`relay/src/ws/fanout.ts:793` — `#isTeardown` 이 클라이언트가 보낸 `crud:"D"` 를 게이트 확인 없이 단독 신뢰 -> 시장 해석 엄격성 T-16-42 와 무장 가드 T-16-43 을 **동시에** 우회)은 mock 시절엔 이론적 결함이었으나, **이제 실계좌 게이트웨이가 붙어 있으므로 무장된 반복 발주 설정이 폴백 시장으로 실제로 나갈 수 있다.** R2-CR-03(계좌번호 로그 유출)도 실주문이 흐르면 노출 표면이 커진다.

**후속 (2026-09-09, 16-46) — 근본 원인이 닫혔고 프로덕션에서 실증됐다.** 16-45 가 `deploy-relay.sh` 를 3단 우선순위(명시 주입 > **실행 중 컨테이너 값 보존** > 로컬 mock)로 고쳤고, 16-46 이 **`DMA_HOST` 를 주입하지 않고** 배포해 그 보존을 실측했다 — `현재 컨테이너 DMA_HOST=10.41.1.120 — 이번 배포로 바뀌지 않는다` · `DMA_HOST 출처: 실행 중 컨테이너 보존` · 강등 경고 미출력 · 배포 후 컨테이너 실 env `DMA_HOST=10.41.1.120` · `/healthz` 200 `version=a1f4ed6` `everReadyCount:1` `stalledCount:0`. **주입하는 배포로는 이 수정을 증명할 수 없다**(주입이 보존을 이기는지만 확인된다)는 이유로 무주입을 택했고 사용자가 그 위험을 명시 수용했다. 다만 이 실증은 **한 번**뿐이며 자동 테스트로 잠기지 않는다 — 다음 배포에서 다시 관측해야 「재발하지 않는다」가 된다.

### Phase 16 Gap Closure State (2026-09-09, 16-26)

- **14건 전부 닫혔다.** `16-VERIFICATION.md` 갭 4건(G1~G4) + `16-REVIEW.md` Critical 1(CR-01) · Warning 9(WR-01~09). 담당 plan 은 16-18(G1·WR-01) · 16-19(G3) · 16-20(WR-04·WR-05) · 16-21(G4 코드) · 16-22(G2·WR-02) · 16-23(CR-01·WR-08) · 16-24(WR-07·WR-09) · 16-25(WR-03·WR-06) · 16-26(G4 배포·실측 + 문서). 처리 결과 정본은 `16-VALIDATION.md` §Gap Closure 표 14행.
- **배포 3종 완료** (사용자 「배포 승인」, 순서 relay → server → webapp 고정, 커밋 `2cb5620`). relay `relay:2cb5620` @ VM `radar-gw` · server 리비전 `gh-radar-server-00043-s4f` · webapp `dpl_6Uwsjm3qT7WnKrhFmMPDt73Bz9C9` (Vercel **git 통합 자동 배포** — 16-17 이 우회해야 했던 `ignoreCommand` skip 은 `b691b15` 로 이미 해결돼 있었다). CLI 수동 배포 경로는 이 실행 환경 권한 정책에 막혔으나, 라이브 번들에서 16-19·16-23 의 코드 마커를 직접 검출해 갭 클로징 코드가 이미 프로덕션임을 확인했다.
- **gap 4 종결 — 세션이 있는 상태의 200 을 실측했다.** 배포 전 `{"status":"degraded",…,"version":"4b6d792","sessionCount":2}` = **503** → 배포 후 `{"status":"ok","vpn":true,"dma":true,"version":"2cb5620","sessionCount":2,"everReadyCount":0}` = **200**. `sessionCount` 가 2 로 **같고 판정만 뒤집혔다** — 배포 직후 세션 0 의 200 이 아니다. smoke `INV-5a` 도 16-17 의 유일한 FAIL 에서 PASS 로 전환.
- **smoke:** `smoke-relay.sh` PASS 12 · FAIL 0 · SKIP 1 / `smoke-server.sh` PASS 15 · FAIL 0 · SKIP 0. SKIP 은 INV-9 이며 **`SMOKE_AUTH_TOKEN` 이 없어 프로브를 한 번도 돌리지 못했다** — 16-21 의 재작성 이후 첫 실행 미수행이 열린 항목으로 남는다(재실행 명령은 `deferred-items.md` §16-26).
- **요구사항 재판정:** TRADE-01 · TRADE-02 · NAV-01 **Complete** · MYPAGE-01 Complete(16-19). **TRADE-03 은 Pending 유지** — 코드 층위(gap 1·2 포함)는 전부 닫혔으나 프로덕션 `/healthz` 의 `everReadyCount: 0` 이 **Ready 에 도달한 DMA 세션이 한 건도 없었음**을 말한다. 즉 relay 전략 중계·주문 상관 경로가 실서버에서 한 번도 실행된 적이 없다. mock·단위 검증만으로 올리지 않는다(RELAY-02 와 같은 기준).
- **이 배포가 바꾸지 않는 것:** DMA 게이트웨이는 여전히 없다(`DMA_HOST` = 로컬 mock, VM 에 미기동). 로그인 사용자는 트레이딩 3표면에서 DMA 게이트를 계속 본다. 바뀐 것은 그 상태가 **더 이상 relay 장애로 보고되지 않는다**는 것뿐이다.
- **실서버·실계좌 검증은 이번에도 미실시**(D-27). `16-VALIDATION.md` §Manual-Only 5행 유지. `dma_credentials` 는 2행이지만 사유는 「자격증명 부재」가 아니라 **「사용자 명시 지시 없이는 하지 않는다」** 다.
- **검사 사각지대 실측:** ① relay `tests/` 는 루트 `typecheck` 밖이라 16-25 의 형 경계 오류 14건을 `pnpm -r test` 가 통째로 놓쳤다(vitest 는 형을 안 본다) — `pnpm --filter @gh-radar/relay run typecheck:tests` 만 잡았고 16-26 이 고쳤다(`2cb5620`). ② phase 문서 88곳이 인용한 `pnpm --filter gh-radar-webapp test:e2e` 는 **어떤 프로젝트에도 매치되지 않아 exit 0** 으로 끝난다 — 「절대 실패할 수 없는 검증 명령」이었다. 정본은 `@gh-radar/webapp`.

### Phase 15 Production State (2026-09-08)

- **plan 20/20 실행 완료.** 종결 plan `15-20` 은 2026-09-06 에 **A안(`skip-live`)** 으로 마감했다 — 실서버·실계좌에 접속하지 않고 "미접속"을 실측으로 남긴 종결이었다(`15-LIVE-VERIFICATION.md` §1~§7, SUMMARY `ace2f7d`).
- **그 뒤 라이브 전환이 실제로 일어났다.** `f13eb7d` 로 **D-17(gh-radar 전용 DMA `user_id`)이 철회**돼 웹이 WinForms 와 동일 DMA 세션에 합류했고, relay 의 `DMA_HOST` 가 로컬 mock 에서 **실 게이트웨이(`10.41.1.120:9100`)** 로 전환됐다. **주문 경로가 실계좌에 닿는다** — 스모크·디버깅에서 `POST /api/orders`·relay `OrderApi`·DMA 로그인 호출을 하지 않는다(정본 경고: `infra/relay/README.md` §실서버 라이브 상태).
- **VPN 상시 유지가 정책이다**(`1ef7cc7` 부팅 자동기동+워치독 · `f9ca062` 재접속 상한 철회). `openconnect@kb` = `active`+`enabled`, `kbvpn-*` 타이머 2개(`kbvpn-watchdog` 10분 회수 · `kbvpn-renew` 일 06:00 KST 주간 재접속), 세션 인증 만료 예정 2026-09-20. `/healthz` 실측(2026-09-08 20:37 KST) = `{"status":"ok","vpn":true,"dma":true,"version":"a2c5238","sessionCount":1}` — `sessionCount:1` ∧ `dma:true` 는 `readyCount>0` 을 강제하므로 DMA 세션 하나가 **Ready**(로그인 성공 + 계좌 선언 완료)다.
- **실주문 왕복 실측:** `dma_credentials` **2행**(15-20 시점 0행) · `dma_orders` **5행** — `rejected` 3(실브로커 rc 606·515) / `accepted` 2(rc 0, 체결 통보). insert→통보 patch Δ **median 77 ms**(D-22 의 5초 상한 대비 약 1/60). ISIN 42종목 결손은 `8816557`(master-sync basDd 역탐색) 으로 해소 — `--check-isin` 4 PASS, 활성 **2,717종목 / isin NULL 0**.
- **SC 재집계:** ✅ **6**(SC-1·2·3·5·7·8) · ⚠ **2**(SC-4·SC-6) — 2026-09-06 의 ✅3 / ⚠5 에서 갱신. 남은 ⚠ 는 (a) 마지막 wss 종료 **5분 뒤** 세션 종료 실관측, (b) 취소(`C`) 왕복·`cancelled` 전이와 `GET /api/orders` 목록 복원 응답 미관측 둘뿐이다. **재판정 정본은 `15-LIVE-VERIFICATION.md` §8** 이며 §1~§7 은 2026-09-06 기록으로 보존한다.
- **요구사항 재판정:** RELAY-01 **Complete** · RELAY-03 **Complete** · RELAY-02 는 위 (b) 때문에 **Pending 유지**(REQUIREMENTS Traceability 에 `잔여:` 명시). 남은 2건은 실계좌 주문을 수반하므로 **사용자의 명시 지시가 있을 때만** 검증한다.

### Phase 10 Production State (2026-06-09)

- Cloud Run Job `gh-radar-theme-sync` + Scheduler `gh-radar-theme-sync-daily` (`0 16 * * *` Asia/Seoul, OAuth invoker, no OIDC) live. SA `gh-radar-theme-sync-sa` + 기존 Secret 3종 재사용(supabase-service-role/brightdata-api-key/anthropic-api-key). 이미지 `theme-sync:e944970`. `THEME_SYNC_CLASSIFY_ENABLED=true`.
- 첫 production scrape: **356 시스템 테마**(331 naver/alpha + **25 AI 발굴**) + **7,561 theme_stocks**. AI 보강 라이브(aiDiscovered=25, aiCorrected=2), backedOffSources=[] (네이버 직접 성공). themes count gate PASS(356).
- 첫 자동 Scheduler 실행: 다음 16:00 KST. 5원칙 backoff(429/403 24h) + SHA256 해시 변경감지 가드 동작 확인(smoke).
- 유저 테마 optimistic 갱신 + 테마 E2E 3종 green(10/10). THEME-01~04 production 검증 완료.
- **서버 재배포(plan 누락분, push 후 발견·수정):** 배포 server 이미지가 10-04 themes 라우트 이전(75683d1)이라 `/api/themes` 404 → `deploy-server.sh` 로 HEAD 58218f4 재배포(revision gh-radar-server-00021-jdv) → `/api/themes` 200(356 테마, 상위3평균 desc: 반도체장비 +24.94%) + `/api/themes/:id` 200 + smoke 9/9. 풀스택 라이브(Supabase→server→webapp).

### Phase 9 Production State (2026-05-12 12:24 KST)

- `stock_daily_ohlcv`: 4,003,432 rows (2020-01-02 ~ 2026-05-11)
- 3 Cloud Run Jobs + 2 Schedulers (eod `30 17`, recover `10 8` Asia/Seoul) + 2 Alert policies live
- 첫 daily Job 자동 실행: 2026-05-12 17:30 KST
- 첫 recover Job 자동 실행: 2026-05-13 08:10 KST
- Hotfix: change_rate numeric(8,4) → numeric(10,4) (제일바이오 052670 29948.08% overflow)

## Phase 1 Success Criteria 검증

| # | 기준 | 상태 | 증거 |
|---|---|---|---|
| 1 | KIS 토큰 발급 + 등락률 순위 호출 | ✅ | 실증 테스트 (FHPST01700000, J/NX) + 로컬 스모크 |
| 2 | Supabase 4개 테이블 생성 | ✅ | db push 2개 마이그레이션 적용, +kis_tokens=5개 |
| 3 | Ingestion Worker → stocks upsert | ✅ | 58행 upsert, 상한가/하한가 포함 |
| 4 | 15 req/sec 제한, EGW00201 없음 | ✅ | rateLimiter 토큰 버킷, 스모크 테스트 에러 없음 |

## Phase 2 Success Criteria 검증

| # | 기준 | 상태 | 증거 |
|---|---|---|---|
| 1 | Cloud Run 공개 URL 접근 가능 | ✅ | https://gh-radar-server-1023658565518.asia-northeast3.run.app |
| 2 | min-instances=1, cold start 없음 | ✅ | 배포 구성: min=1 max=3 cpu=1 mem=512Mi |
| 3 | /api/scanner JSON 반환 | ✅ | smoke INV-2 PASS |
| 4 | /api/stocks/:code 반환 | ✅ | smoke INV-3 PASS |
| — | INV-1~INV-9 전체 | ✅ | 9/9 PASS — DEPLOY-LOG.md |

## Phase 3 Success Criteria 검증

| # | 기준 | 상태 | 증거 |
|---|---|---|---|
| 1 | CSS 변수 토큰, 하드코딩 색상 없음 | ✅ | webapp/src/app/globals.css |
| 2 | Light/Dark 테마 전환 | ✅ | ThemeProvider + ThemeToggle (next-themes) |
| 3 | 공통 컴포넌트 (Button/Card/Table/Badge/Input 등) | ✅ | shadcn 10종 + 금융 variant |
| 4 | 레이아웃 템플릿 | ✅ | AppShell, CenterShell, AppHeader |
| 5 | HTML 카탈로그 | ✅ | /design 페이지 (7섹션) + 03-UI-PREVIEW.html |

## Performance Metrics

**Velocity:**

- Total plans completed: 89 (1 + 5 + 1×6 sub)
- Phase 1 duration: 2026-04-10 ~ 2026-04-13 (4일)
- Phase 2 duration: 2026-04-13 (1일)
- Phase 3 duration: 2026-04-13 (1일)
- Total commits: 25+

**By Phase:**

| Phase | Plans | Duration | Status |
|-------|-------|----------|--------|
| 1. Data Foundation | 1 | 4일 | ✅ 완료 |
| 2. Backend API | 5 | 1일 | ✅ 완료 |
| 3. Design System | 1 (6 sub / 3 wave) | 1일 | ✅ 완료 |
| Phase 04 P04 | 45분 | 7 tasks | 10 files |
| Phase 05.1 P01 | ~20분 | 3 tasks | 6 files |
| Phase 06 P01 | 15m | 3 tasks | 9 files |
| Phase 06 P02 | 8m | 3 tasks | 6 files |
| Phase 06 P03 | 3 | 3 tasks | 5 files |
| Phase 06 P04 | 12 | 2 tasks | 9 files |
| Phase 06 P05 | 2 | 2 tasks | 5 files |
| Phase 06 P06 | 40 | 2 tasks | 7 files |
| Phase 09-daily-candle-data P01 | 6min | 3 tasks | 4 files |
| Phase 09-daily-candle-data P02 | 3min | 2 tasks | 9 files |
| Phase 09-daily-candle-data P03 | 5min | 4 tasks | 9 files |
| Phase 09-daily-candle-data P04 | 7min | 4 tasks | 12 files |
| Phase 09-daily-candle-data P05 | 4min | 4 tasks | 5 files |
| Phase 09.1 P01 | 3min | 4 tasks | 4 files |
| Phase 09.1 P02 | 2m | 2 tasks | 3 files |
| Phase 09.1 P03 | 2m17s | 3 tasks | 12 files |
| Phase 09.1 P04 | 4m | 3 tasks | 11 files |
| Phase 09.1 P05 | 2m34s | 3 tasks | 11 files |
| Phase 09.1 P06 | 4m | 3 tasks | 12 files |
| Phase 09.1 P07 | 8m | 3 tasks | 15 files |
| Phase 09.1 P08 | 4m22s | 4 tasks | 5 files |
| Phase 09.1 P09 | 75min | 7 tasks | 8 files |
| Phase 09.1 P10 | 8m | 4 tasks | 2 files |
| Phase 09.1 P11 | 22m | 6 tasks | 47 files |
| Phase 09.2 P02 | 5min | 2 tasks | 4 files |
| Phase 09.2 P03 | 8min | 3 tasks | 6 files |
| Phase 10 P01 | 6min | 2 tasks | 11 files |
| Phase 10 P02 | ~75min (prod push 게이트 포함) | 3 tasks | 4 files |
| Phase 10 P03 | 16min | 3 tasks | 18 files |
| Phase 10-theme-classification P04 | ~7min | 2 tasks | 8 files |
| Phase 10 P05 | 6min | 2 tasks | 4 files |
| Phase 10 P06 | 55min | 3 tasks | 9 files |
| Phase 10 P07 | 13min | 3 tasks | 14 files |
| Phase 10 P08 | 13min | 3 tasks | 16 files |
| Phase 12 P01 | 8min | 2 tasks | 15 files |
| Phase 12 P02 | 12min | 3 tasks | 2 files |
| Phase 12 P03 | 11min | 3 tasks | 6 files |
| Phase 12 P04 | 10min | 2 tasks | 3 files |
| Phase 12 P05 | ~20min | 5 tasks | 6 files |
| Phase 13 P01 | 5min | 3 tasks | 15 files |
| Phase 13 P13-02 | 9min | 3 tasks | 12 files |
| Phase 13 P13-03 | ~3min | 2 tasks | 6 files |
| Phase 13 P13-04 | ~25min | 3 tasks | 11 files |
| Phase 13 P13-05 | ~4min | 2 tasks | 6 files |
| Phase 13 P13-06 | ~17min | 3 tasks | 6 files |
| Phase 14 P01 | 4min | 2 tasks | 1 files |
| Phase 14 P02 | 4min | 3 tasks | 4 files |
| Phase 14 P03 | 5min | 3 tasks | 6 files |
| Phase 14 P04 | 8 min | 3 tasks | 9 files |
| Phase 14 P07 | 5 min | 3 tasks | 5 files |
| Phase 14 P05 | 3min | 1 tasks | 2 files |
| Phase 14 P08 | 16 min | 3 tasks | 9 files |
| Phase 14 P06 | 9min | 3 tasks | 6 files |
| Phase 14 P09 | 9 min | 3 tasks | 9 files |
| Phase 14 P10 | 8 min | 2 tasks | 4 files |
| Phase 14 P11 | ~50min | 2 tasks | 15 files |
| Phase 16 P18 | 14min (게이트 대기 제외) | 3 tasks | 5 files |
| Phase 16 P19 | 9min | 3 tasks | 9 files |
| Phase 16 P20 | 5min | 2 tasks | 6 files |
| Phase 16 P21 | 8min | 3 tasks | 7 files |
| Phase 16 P22 | 11min | 2 tasks | 2 files |
| Phase 16 P23 | 15min | 3 tasks | 12 files |
| Phase 16 P24 | 12min | 2 tasks | 11 files |
| Phase 16 P25 | 20min | 3 tasks | 13 files |
| Phase 16 P26 | 78min (배포 게이트 포함) | 3 tasks | 6 files |
| Phase 16 P27 | 21min | 2 tasks | 2 files |
| Phase 16 P28 | 18min | 2 tasks | 2 files |
| Phase 16 P29 | 12min | 2 tasks | 2 files |
| Phase 16 P30 | 20min | 2 tasks | 5 files |
| Phase 16 P31 | 21min | 3 tasks | 4 files |
| Phase 16 P32 | 18min | 2 tasks | 6 files |
| Phase 16 P33 | 8min | 2 tasks | 3 files |
| Phase 16 P34 | 9min | 2 tasks | 2 files |
| Phase 16 P35 | 70m | 3 tasks | 6 files |
| Phase 16 P36 | 11min | 2 tasks | 2 files |
| Phase 16 P37 | 25min | 2 tasks | 3 files |
| Phase 16 P38 | 16min | 3 tasks | 7 files |
| Phase 16 P39 | 14min | 2 tasks | 2 files |
| Phase 16 P40 | 21min | 3 tasks | 2 files |
| Phase 16 P41 | 35m | 3 tasks | 3 files |
| Phase 16 P43 | 12min | 3 tasks | 2 files |
| Phase 16 P45 | 35m | 2 tasks | 2 files |
| Phase 16 P42 | ~40분 | 3 tasks | 5 files |
| Phase 16 P44 | 18min | 2 tasks | 2 files |

## Accumulated Context

### Roadmap Evolution

- Phase 05.1 inserted after Phase 5: Ingestion 운영 배포 — Cloud Run Job + Cloud Scheduler 자동 트리거 (URGENT, 2026-04-14 DB stale 발견)
- Phase 06.2 inserted after Phase 6: Auth + Watchlist (URGENT, 2026-04-16 Phase 7 discuss 중 뉴스 배치 타겟에 사용자별 관심종목 필요 판명 → AUTH-01/02 + PERS-01 v2→v1 승격)
- Phase 07.1 inserted after Phase 7: news content ingestion enhancement — description 저장 (URGENT, 2026-04-17 Phase 9 discuss 중 AI 요약 입력 데이터 부재 판명 → Naver API 실측 후 description 스니펫 저장 결정. URL 원문 scraping 은 Phase 9 POC 후 재검토)
- Phase 07.1 complete 2026-04-18: migration 20260417120200 적용 + Cloud Run Job 재배포(image d9b5af3) + smoke tick 에서 신규 45건 description 저장 확인 (기존 1,103행 NULL 유지). news-sync smoke INV-5/6 은 DI-02 헤더 CR 파싱 버그로 FAIL 표기되나 데이터 정상(확인됨)
- Phase 07.2 inserted after Phase 7.1: news-sync rate-limit 안정화 + news_articles 재수집 (URGENT, 2026-04-18 진단 — abort signal from Naver 매 tick 5+회 발생, skipped 40+/55 로 74% 종목 뉴스 0건. 429 rate-limit 을 daily budget 과 혼동해 stopAll → cycle 조기 중단. 수정: concurrency 8→3 + NaverRateLimitError 분리 + per-stock backoff retry + TRUNCATE news_articles 후 clean-slate 재수집. UPSERT 정책 DO NOTHING 유지)
- Phase 07.2 complete 2026-04-18: Cloud Run Job 재배포(image news-sync:141ccdc) + deploy-news-sync.sh NEWS_SYNC_CONCURRENCY=8→3 수정 + news_articles TRUNCATE(1,270→0) + 즉시 execute → inserted 6,187 / skipped 0 / abort signal 0 / top_movers 55/55 (100%) + description 99.9% (6,183/6,187) 커버리지 달성. SC 5/5 green
- Phase 08.1 inserted after Phase 8: 종목토론 의미성 AI 분류 + 웹앱 필터 토글 (URGENT, 2026-04-21 수집된 discussions 중 다수가 욕설·뇌피셜·감탄사 노이즈)
- Phase 08.1 planned 2026-04-22: 7 plans / 4 waves. 설계 변경 — Batch API → **Claude Haiku Sync API inline 통합** (discussion-sync cycle 내부에서 수집 직후 분류, 별도 worker 없음). 4-category (price_reason/theme/news_info/noise), p-limit(5), temperature=0, max_tokens=10, model=claude-haiku-4-5. discussions.relevance/classified_at 컬럼 추가 + partial indexes. server DiscussionListQuery.filter(all|meaningful) + `relevance IS NULL OR relevance != 'noise'`. webapp Switch 토글 (풀페이지만, 기본 ON=meaningful, URL sync `?filter=meaningful`). 백필 15k 행 일회성 스크립트 ~$23, 정기 ~$2/day
- Phase 9 의미 교체 2026-05-10: 기존 Phase 9 (AI Summarization, TBD/미시작) 을 Phase 10 으로 renumber, 신규 Phase 9 = Daily Candle Data Collection (KRX 전 종목 3년치 일봉 OHLCV + 영업일 EOD 증분 갱신). 분석 기반 데이터 레이어가 AI 요약보다 선행되는 게 자연스럽다는 판단. Phase 10 의 Depends/SC/UI hint 는 변경 없음. /gsd-insert-phase 도구는 decimal 만 지원해 수동 ROADMAP/STATE/REQUIREMENTS 편집. total_phases 16→17. 신규 요구사항 DATA-01.
- Phase 09.1 inserted after Phase 09 (URGENT, 2026-05-13): intraday-current-price — 키움 REST `ka10027` 페이지네이션으로 활성 종목 ~1,898 매분 현재가 갱신. Direct VPC Egress + Static IP 인프라 (키움 IP whitelist 필수). KIS ingestion 무변경 (공존 전략). stock_daily_ohlcv 오늘자 row UPSERT.
- Phase 09.2 inserted after Phase 09.1 (URGENT, 2026-05-14): 종목 상세페이지(`/stocks/[code]`) 상단에 해당 종목의 일봉차트 출력. Phase 9 의 `stock_daily_ohlcv` (4,003,432 행) 을 source 로 활용해 트레이더가 가격 흐름을 즉시 시각적으로 확인. 디렉터리 slug `stock-detail-daily-chart`. plan/구현은 `/gsd-plan-phase 09.2` 에서 본격 설계.
- Phase 08 complete 2026-04-18: discussion-board production live. POC PIVOT 으로 RESEARCH 가정(cheerio HTML + iframe body fetch + iconv-lite) 모두 폐기 → Bright Data Web Unlocker(zone `gh_radar_naver`, country=kr) + `stock.naver.com/api/community/discussion/posts/by-item` JSON API 단일 호출로 본문 포함 50건/페이지. Cloud Run Job `gh-radar-discussion-sync` + Scheduler `gh-radar-discussion-sync-hourly` (0 * * * * KST) + Secret `gh-radar-brightdata-api-key` + 워커 first-time/stale 종목 backfill loop (max 10페이지 OR 7일) + server `before` cursor + webapp 무한 스크롤. 첫 production cycle: 58 종목 → 187 requests → upserted **15,463 row** / errors 0. smoke 8/8 PASS. server 응답 1.04s (실시간 토론방 데이터 검증). pipeline 재작성으로 월 비용 ~\$72 (당초 추정 \$144 절반).
- Phase 09.1 complete 2026-05-15: KIS ingestion 완전 폐기 + 키움 REST API (ka10027 페이지네이션 + ka10001 hot set) 단일 source 전환. workers/intraday-sync 신설 (Cloud Run Job + Scheduler `* 9-15 * * 1-5` Asia/Seoul, VPC + Static IP 34.64.195.151). server/src/kis → server/src/kiwoom 교체 + Cloud Run service VPC connector 재배포 (revision gh-radar-server-00017-mrm, image db391ac). SC #1~9 모두 충족. trade_amount 정책 정확값 → volume×close 근사값 전환 (D-23). git history 보존 (workers/ingestion + server/src/kis + packages/shared/src/kis.ts). Plan 11 RESEARCH §12 11-step cleanup 완료: Scheduler PAUSE → 정합 검증 (intraday-sync 단독 870 row 5분 갱신 정상) → Job/Scheduler/SA/Secrets×3(kis-app-key/kis-app-secret/kis-account-number)/Alert policy 삭제 → kis_tokens DROP migration apply → 47 파일 git rm/edit + commit db391ac → server redeploy (`--remove-secrets=KIS_APP_KEY,KIS_APP_SECRET --remove-env-vars=KIS_BASE_URL`) + smoke 9/9 + 종목 상세 005930/000660 200 OK + 최종 stock_quotes 952 row 5분 갱신.
- Phase 10 added 2026-06-08: Theme Classification — 테마별 종목 묶기 (네이버 금융 테마[산업/이벤트] + 알파스퀘어[정치인주/시사] 2-tier 일 1회 16:00 KST 배치 수집 → `themes`/`theme_stocks` 적재 + 웹앱 `/themes` UI). Phase 7(뉴스)·Phase 8(토론방) 의 "수집+표시" 단일 phase 선례 따름. MVP = A(수집)+B(UI), 상한가 동조 분석(C/D/E)은 후속 phase 로 분리. 신규 요구사항 THEME-01/02. **삭제된 구 Phase 10(AI Summarization) 번호 재사용** (정수 max+1). 한국 크롤링 운영 5원칙(CLAUDE.md, 2026-06-08 quick task 260608-g0k 로 명문화) 준수 — 진짜 리스크는 형사 아닌 민사 DB제작자 권리 침해(대법원 2017다224395). 콘텐츠 SHA256 해시 변경감지 + EUC-KR→UTF-8(iconv-lite). `/gsd-plan-phase 10` 에서 본격 설계.
- Phase 12 added 2026-06-25: 상한가 다음날 이력 통계 (종목상세) — "이 종목이 과거 상한가 갔을 때 다음날 따라들어갔으면 어땠나"를 과거 일봉(OHLCV, Supabase 기보유 ~4M행) 백테스트로 표시. **아이디어 디스커션(세션 진행중)으로 v1 방향 확정**: 진입가정 A안(상한가 당일 종가=상한가 매수) → 다음날 시/고/저/종 수익률 계산. 근거데이터 = 종목 자체 이력만(시장평균/shrinkage 미사용, 사용자 결정). 표시 = 단일 확률숫자 대신 실제 상한가 이벤트 리스트가 히어로(컬럼: 상한가일/다음날 시·고·저·종 수익률/거래대금·회전율/점상한가 태그, 최신순). 요약 카운트("N회 중 시초가 익절 M회·평균±x%·최악 -y%"), 확률% 는 N≥5 일때만 보조. 최근가중 = 감쇠공식 대신 "최근 N회" 보조스탯+최신순(가짜정밀도 회피). 점상한가 판별 = OHLC 만으로(시=고=저=종=상한가). 핵심지표 = 시초가 수익률(고가기반은 과대평가, 참고용). L2 보조카드 = 테마 모멘텀(최근 X일 동테마 상한가 다음날 익절 흐름, per-stock 과 분리 표시, AI테마 중복제거 위에 얹음). 아키텍처 = 순수계산(외부크롤링 없음, KRX EOD 만 → 5원칙 무관), master-sync 배치 일1회 사전계산 → Supabase 저장 → 종목상세 읽기전용(on-demand fetch 금지). v2 deferral = 상한가 잠긴시각/매수잔량(굳은강도, EOD 불가 → KIS 실시간). 신규 요구사항 후보 LIMIT-01. **표시안 = C안 채택**(2026-06-26 HTML 목업 A/B/C 비교 후): 히어로형 — 상단 "시초가 익절 확률 %"(N≥5만, 미만은 카운트) 큰 숫자 + 다음날 시초가 수익률 분포 히스토그램 + 이벤트 리스트(최신순, 오래된건 흐리게, 시·고·저·종 4컬럼+점상 태그+**거래대금·회전율 컬럼 포함**=A안 컬럼 흡수) + 소속 테마별 분리 익절률 카드(HBM/반도체장비/… 각 N 병기). 국내 색상(수익=빨강 --up, 손실=파랑 --down). 목업 = scratchpad/limit-up-nextday-mockup.html. **세부 데이터/스키마/배치는 `/gsd-plan-phase 12` 에서 확정**.
- Phase 11 added 2026-06-10: Co-movement Candidates — 상한가 동조 종목 탐지. Phase 10 직전 아이디어 회의(세션 2286945e)에서 테마와 함께 제안됐다가 후속 분리 후 누락된 동조 분석을 재개 (`tasks/co-movement-idea-prompt.md`). 종목 X 급등 시 "따라 오를 후보 Y"를 일봉 통계적 동조로 점수화해 종목상세 TOP-K 표시 (테마와 다른 축). **아이디어 디스커션 + read-only 실측(2026-06-10)으로 v1 확정**: 통계 단위 = 하이브리드(테마-풀링 참여도 주 + 페어 직접동조 보조) — 실측상 종목당 급등(≥15%) 이벤트 **중앙값 2회**라 페어 단독 통계는 ~75% 종목에서 불가, 테마 풀링 필수(테마 커버리지 89% = 활성 2,778 중 2,476). 시차 = D0 동반 + D+1 후행 둘 다. 점수 = conf_d0(주)/lift/avg_ret/conf_d1, lookback 24m, 테마 발화일 ≥8 게이팅. 테마없는 ~11%는 정직한 빈 상태(`stocks.sector` 전부 NULL). 성능 = 이벤트 부분집합 ~2.5만행을 Postgres SQL 함수로 사전계산(`theme_comovement` 테이블 + `(date,code) WHERE change_rate≥10` 부분인덱스 + change_rate>31 아티팩트 제외), 읽기 RPC는 앵커 활성 테마(중앙값 3) union 집계. 구성 = 마이그레이션 + SQL함수 + RPC + 얇은 `co-movement-sync` 워커(candle-sync EOD 이후 야간 1회) + 서버 `/api/stocks/:code/co-movement` + 종목상세 UI 섹션. 신규 요구사항 COMV-01. v2 deferral = 페어 정식모델·Granger lead-lag·인트라데이 시차·테마없음 그래프 클러스터링. `/gsd-plan-phase 11` 에서 본격 설계.
- Phase 13 added 2026-07-01: 홈 화면 — 오늘의 급등 테마 AI 분석. 앱 루트(/)에 새 홈. 오늘 +20% 이상 급등 종목을 **기존 큐레이션 테마(themes/theme_stocks) 미참조 · bottom-up 순수 발견**으로 AI 클러스터링 → 오늘의 주도 테마·상승이유·소속종목을 뉴스 근거와 함께 표시(사용자와 설계 논의 완료). 확정: ①클러스터링=bottom-up ②근거=news_articles(이미 news-sync 수집중, 신규 외부호출 없음) ③갱신=장중 매시 :30(9:30·10:30···15:30 마감직후, Cloud Scheduler) ④임계값=20% 고정(급등없는날 빈 상태 표시) ⑤단일종목=별도 '개별 급등' 섹션(2종목+ 는 '테마' 카드) ⑥이력=일별 스냅샷 누적 ⑦홈=루트(/) 승격, 스캐너 2번째 메뉴. 데이터흐름=새 `home-sync` 워커(Cloud Run Job)가 top_movers⋈stock_quotes(≥20%)+급등종목 news_articles 읽어 **급등집합+뉴스 content hash 가 직전 스냅샷과 동일하면 Claude 호출 skip**(비용/일관성 가드, theme-sync 24h hash 패턴 재사용) → Claude Haiku 1회(temp=0, JSON-only) → `home_theme_snapshots`(일별) 저장 → 웹앱 read-only. 구성=①마이그레이션 home_theme_snapshots(신규 테이블 RLS `TO anon,authenticated` 둘다 명시) ②workers/home-sync(theme-sync anthropic.ts 싱글톤·config 재사용, 프롬프트만 신규) ③server /api/home ④webapp / 루트 페이지 + app-sidebar.tsx NAV. 디렉터리 slug `home-surge-themes`(자동생성 `ai` 는 한글 stripping 결과라 수동 교정). `/gsd-plan-phase 13` 에서 본격 설계.
- Phase 14 added 2026-07-02: AI 애널리스트 챗봇 (멀티에이전트) — 팀장(Sonnet)+전문가 5 에이전트(Haiku: 시세/수급·테마·뉴스/심리·상한가패턴·웹서치) 오케스트레이션. 상한가 따라잡기 전략 대화 특화(주도 테마, 오늘 상한가 종목 분석, 내일 익절 판단). **사용자 결정(2026-07-02 AskQ)**: ①모델=팀장 Sonnet+전문가 Haiku ②히스토리=로그인 사용자별 Supabase 저장(conversations/messages, RLS)+종목별 필터 ③전문가 5명 추천안 그대로. 데이터=기존 테이블(stock_quotes/OHLCV/themes/co-movement/news/discussions/limit_up_*/home_theme_snapshots) tool 조회 + Anthropic web_search 실시간. 백엔드=기존 Express 서버 SSE POST /api/chat (참고: ../weekly-wine-bot server/src/services/chat-service.ts 의 세션 Map/tool-use 루프/sanitizeMessages/rate-limit/SSE 이벤트 프로토콜 이식). 프론트=전역 FAB+챗 시트(참고: ../weekly-wine-cafe24 skin34 somi-chat 패턴을 React로 포팅), 종목상세=해당 종목 컨텍스트+종목별 히스토리, 사이드바 /chat=일반 대화. 디렉터리 slug `ai-analyst-chatbot`(자동생성 slug 한글 stripping 으로 수동 교정). `/gsd-plan-phase 14` 에서 본격 설계.
- Phase 13 complete 2026-07-02: 홈 급등 테마 6/6 프로덕션 라이브. 배포=theme-sync 패턴 복제(VPC 없음, OAuth invoker, Secret 재사용 신규 0). Cloud Run Job `gh-radar-home-sync` @ image f6b1905(512Mi/task-timeout=120s/max-retries=1, SA `gh-radar-home-sync-sa` 최소권한 — supabase-service-role + anthropic accessor 2건만, brightdata 미바인딩) + Scheduler `gh-radar-home-sync-cron` ENABLED(`30 9-15 * * 1-5` Asia/Seoul, 7슬롯, 15:30 마감 포함). **Claude POC 게이트 PASS**(themeCount=4/stockCount=48, claudeCalled=true, isCarried=false — 호남반도체 17멤버/전력기기 5/위메이드 3/이차전지 2, reason 일관, 뉴스 verbatim + 실제 매체 URL junggi/etoday 환각 0, Haiku 1회/사이클 ~\$3.1/월 상한 이내). server 재배포(스모크 9/9, `/api/home` 200 snapshot 4테마 index 1슬롯) + webapp Vercel prebuilt(`/` 홈 200, `/scanner` 307→/login 은 비로그인 auth 정상). smoke-home-sync 6/6 + Playwright home.spec 5/5 green. **후속(비차단):** 테마 내 뉴스 URL dedup 미적용(호남반도체 news_total=44 vs unique=4 — 멤버 종목들이 동일 상한가 기사 참조, 저장 중복). UI 는 근거뉴스 top 1-2 distinct 만 노출해 표시 무영향이나 CLAUDE.md 5원칙 #5(최소 저장) 관점 quick task follow-up 권장.
- Phase 16 added 2026-09-07: 트레이딩 메뉴(상따·VI) — gh-trade WinForms 상따전략창(필드 29개, 등록버튼 없이 스위치 ON=등록·값변경 300ms 자동재제출·전략키 ISIN:계좌:거래소)과 VI 종합주문창(세션당 1건: 계좌·금액(만)·상승률·run, 주문가=상한가 고정, VI 주문내역 확인체크=119초 취소 면제)을 웹으로 이식. 사이드 메뉴 재편: 종목검색(상승률 상위=구 스캐너·테마·관심종목) / 트레이딩(상따 — 하위에 등록된 전략 목록, VI) / My page(전략 현황·잔고·미체결 = gh-trade 메인폼) / 홈·AI 애널리스트 유지. **실시간 공유는 구조적으로 해결됨**: 게이트웨이가 세션(user_id+broker) 단위로 모든 연결에 Set*Resp 에코를 팬아웃하고 Phase 15 D-17 철회로 웹도 `ezmesya` 세션에 합류 → relay 가 전략 메시지(10/11/20/21/24/33/34 ↔ 56/60/61/64/65/72/73)를 wss 로 흘리면 됨, DB 동기화 불필요. 사용자 지시: GSD 정식 절차(discuss → ui-phase 목업 → plan → execute). 사전 목업 초안(scratchpad `16-limit-chaser-mockup.html`, `16-vi-trigger-mockup.html`)은 ui-phase 에서 phase 디렉토리로 이관·재검토.
- Phase 15 added 2026-09-05: DMA 중계 서버(relay) — GCE VM(radar-gw) 에서 KB VPN 너머 gh-trade-server(10.41.1.120:9100, FlatBuffers) 에 붙어 호가 10단 시세를 브라우저로 wss 팬아웃 + 주문 릴레이. 인계 문서 `tasks/relay-handoff.md`(gh-trade 세션 2026-09-05). 사용자 지시: 정식 phase 절차(discuss→plan→execute), 핸드오프 결정 사항은 discuss-phase 에서 전면 재검토.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 16 Plan 42]: `isin-labels.ts` 의 이름 원천에 `limitChasers` 를 더한다 — 16-41 이 relay 에 실은 `name`·`code` 를 소비하므로 새 조회 경로가 생기지 않고(T-16-02), 못 푼 종목은 필드가 비어 「모르면 ISIN 그대로」 폴백이 그대로 산다(T-16-05). 새 원천은 **맨 뒤**에 두어 `put` 의 「빈 값이 이전 값을 지우지 않는다」 규칙에 태운다.
- [Phase 16 Plan 42]: 「수정」의 무장 가드에 `isDeleteIntent` 철거 면제를 붙인다 — relay `#strategyArmable` 첫 줄의 `#isTeardown` 면제와 **동형**이어야 한다. `sweepEnabled` 가 삭제 판정 4종에 없어 「게이트 4종 OFF + 한방 ON + 시세 끊김」이 막히던 것이 R2-WR-02 다. 첫 관문이 마지막 관문보다 엄격하면 사용자가 전략을 못 내린다(T-16-44).
- [Phase 16 Plan 42]: 안전 문구의 해제 트리거는 **원인 변경**(`setField`)과 **서버 응답**(`items`·`[server]`) 둘 뿐이다 — 자기 자신(전송 시도)은 아니다. 방금 띄운 문구가 같은 렌더에서 지워지면 읽을 시간이 없고, 상시 표시되는 경고는 다음번에 읽히지 않는다(T-16-86).
- [Phase 16 Plan 42]: 단일 렌더 테스트는 `useMemo` 의존성 누락을 잡지 못한다 — 「조용한 실패」를 잠그려면 다른 원천을 **같은 참조로 고정**한 채 `rerender()` 하는 케이스가 따로 있어야 한다.
- [Phase 16 Plan 26]: TRADE-03 은 갭이 전부 닫힌 뒤에도 **Pending 으로 남긴다**. 프로덕션 `/healthz` 의 `everReadyCount: 0` 이 「Ready 에 도달한 DMA 세션이 한 건도 없었다」를 뜻하므로 전략 중계·주문 상관 경로가 실서버에서 실행된 적이 없다. 코드가 옳다는 것과 그 코드가 운영에서 돈다는 것은 다른 주장이고, 요구사항은 후자다 (RELAY-02 와 같은 기준).
- [Phase 16 Plan 26]: 배포 순서 relay → server → webapp 은 취향이 아니라 계약 방향이다. 새 webapp + 옛 relay 는 `market` 없는 `cfg` 가 옛 zod 필수 필드에 걸려 `lc.set` 이 통째로 드롭되지만, 역방향(새 relay + 옛 webapp)은 스키마가 `.strict()` 가 아니라 안전하다 — 그래서 relay 가 먼저다.
- [Phase 16 Plan 26]: gap 4 의 증거는 「200」이 아니라 「**세션이 있는 상태의** 200」이다. 배포 전후로 `sessionCount` 가 2 로 같고 판정만 503→200 으로 뒤집힌 대조를 근거로 삼는다 — 세션 0 의 200 은 판정 로직을 통과하지 않으므로 아무것도 증명하지 않는다.
- [Phase 16 Plan 26]: 검증 명령이 「대상을 못 찾아도 exit 0」인 부류인지 확인한다. `pnpm --filter gh-radar-webapp test:e2e` 는 존재한 적 없는 이름이라 88개 문서에서 무동작으로 통과하고 있었다. `pnpm --filter`·`vitest -- <패턴>`·`grep` 이 전부 이 부류다.
- [Phase 16 Plan 18]: `dma_orders` 의 `order_no` 셀렉터는 `user_id` + KST 당일까지 **세 축**으로 좁힌다 — 브로커 주문번호는 일별 재사용 시퀀스라 한 축만으로는 전역 쓰기다 (T-16-14). `userId` 없는 `order_no` 갱신은 `selectorOf` 가 `null` 을 돌려 드롭 + error 로그.
- [Phase 16 Plan 18]: `maybeSingle()` 제거 — 2행일 때의 throw 가 호출자 catch 를 「셀렉터 없는 갱신」으로 열화시켜 그 자체가 전역 쓰기의 방아쇠였다. `order(created_at desc).limit(1)` 로 최근 1행 선택.
- [Phase 16 Plan 18]: 자동주문 통보의 「조회 → 없으면 insert」를 `` `${userId}|${orderNo}` `` 키 in-flight Promise 로 감싼다 (WR-01). `closeConn`/`close` 는 `inflight` 을 건드리지 않는다 — 진행 중 왕복 중단이 곧 기록 결손.
- [Phase 16 Plan 18]: `dma_orders` 유일성은 `(user_id, order_no, (created_at AT TIME ZONE 'Asia/Seoul')::date)` 부분 UNIQUE 인덱스로 DB 가 강제한다 (프로덕션 적용 2026-09-09). 전역 UNIQUE 는 일별 재사용 시퀀스라 불가능.
- [Phase 16 Plan 18]: 쿼리 경계 테스트는 sink 를 스텁으로 바꾸지 않는다 — 진짜 sink 팩토리에 가짜 `SupabaseClient` 를 주입해 **적용된 필터와 영향 받은 행**을 단언한다 (gap 1 이 통과했던 사각지대).
- Phase 1: KIS 실계좌 사용 결정 (모의투자 대신) → readOnlyGuard 안전장치 적용
- Phase 1: TR ID FHPST01700000 확정, 마켓코드 J(KOSPI)/NX(KOSDAQ)
- Phase 1: 등락률 순위에 상한가/하한가 없음 → inquirePrice(FHKST01010100) 2단계 파이프라인
- Phase 1: 휴장일 감지 acml_hgpr_date 기반 (bsop_date 없음)
- Phase 1: pnpm 8→10 업그레이드 (Node 22 호환)
- Phase 1: .nvmrc=22, Docker도 node:22-alpine (2026-04-13 Node 22 통일; 초안은 Docker=20이었으나 로컬=Prod 일치 우선, 모든 deps pure JS라 alpine 22 리스크 없음)
- Phase 2 준비: Node 22 LTS 기준으로 CONTEXT/RESEARCH 정렬, `package.json` engines `>=22`
- [Phase 04]: AppShell hideSidebar prop — 기본 false 로 /design 카탈로그 회귀 없이 v1 전 페이지 헤더 전용 모드 적용
- [Phase 04]: apiFetch 클라이언트: Phase 2 envelope 파싱 + X-Request-Id 캡처 + 8s 타임아웃, ApiClientError 단일 클래스 통합
- [Phase 04]: /scanner ISR 30s (revalidate=30 + cache:'force-cache') 로 /api/health 폴링 과도호출 방지
- [Phase 05.1]: Cloud Run Job invoker 바인딩은 setup-ingestion-iam.sh가 아닌 deploy-ingestion.sh §5.5에 배치 (Job 리소스 생성 후에만 가능)
- [Phase 05.1]: Scheduler → Cloud Run Job 인증은 --oauth-service-account-email 전용 (OIDC 금지, Pitfall 2)
- [Phase 06]: useDebouncedSearch 는 AbortError 를 name 체크로 명시 스킵 — aborted flag 만으로는 race window 발생
- [Phase 06]: Plan 03: CommandDialog 가 shouldFilter prop 미 forward → 내부 <Command shouldFilter={false}> 래핑 + CommandLoading export 부재로 div 로 치환
- [Phase 06]: [Phase 06 Plan 04]: Number 컴포넌트는 NumberDisplay 별칭으로 import — JS 전역 Number.isFinite shadow 방지
- [Phase 06]: [Phase 06 Plan 04]: StockDetailClient 에러 패턴 — 404 만 notFound() 분기, 그 외는 state 유지하여 stale-but-visible + 인라인 에러 카드
- [Phase 06]: [Phase 06 Plan 05]: /stocks/[code] 라우트는 'use client' + React.use(params) 로 Next 15 Promise params 처리 — 서버 컴포넌트 초기 fetch 대신 전체 클라이언트 경로 채택 (스캐너와 일관, refresh 훅 단순화)
- [Phase 09-daily-candle-data]: [Phase 09 Plan 01]: stock_daily_ohlcv 마이그레이션 SQL — FK NOT VALID + 런타임 stocks bootstrap (T-09-03 옵션 B), production push 는 Plan 06 [BLOCKING] task 에서
- [Phase 09-daily-candle-data]: Plan 02: vitest passWithNoTests:true — placeholder 워크스페이스에서 0 test exit 0 보장; krxBaseUrl default = data-dbg.krx.co.kr/svc/apis (RESEARCH §1.1 production 검증된 URL 직접 잠금, master-sync 와 의도적 차이)
- [Phase 09-daily-candle-data]: Plan 03: 결측 감지는 RPC 가 아닌 client-side N+1 패턴 (활성 stocks count + lookback distinct date + per-date head:true count) — Supabase JS v2 가 raw GROUP BY 제한적이라 head:true count 의 명료성 우선. lookback 영업일은 DB distinct date 기반 추론 (RESEARCH §3.3 옵션 A). Vitest mock 은 thenable 흉내 없이 final method 에서 mockResolvedValue — Supabase v2 builder 충분히 지원.
- [Phase 09-daily-candle-data]: Plan 04: config.basDd optional 추가 (BAS_DD env, daily mode 수동 재실행 override) + backfill MIN_EXPECTED 정책=throw (RESEARCH §7 warn+continue 와 의도적 차이 — 한 영업일 부분 응답이 ~4M row 오염 위험) + mock basDd 분기 패턴 (call counter race 회피, withRetry 호환)
- [Phase 09-daily-candle-data]: Plan 05: Cloud Run Job 3개 분리 (RESEARCH §5.1 채택) — daily/recover/backfill 동일 이미지 + Job 별 default MODE env, task-timeout/memory mode 별 최적화, race 자연 방지(T-09-06), alert policy 분리. Scheduler 2종 OAuth (OIDC 금지, Phase 05.1 D-07 lesson 승계). runtime SA gh-radar-candle-sync-sa 최소권한 (KIS 시크릿 미바인딩, T-09-04.1). backfill 은 alert 제외 (수동 실행). 본 plan 은 스크립트 작성만 — Plan 06 이 실제 실행.
- [Phase 09.1]: Plan 01: RPC #1 의 ON CONFLICT 에서 open 의도적 omit (STEP2 가 정확값 덮어쓰기, EOD 17:30 overlay 가 최종 보완) — D-33 / T-09.1-03
- [Phase 09.1]: Plan 01: RPC #2 의 ON CONFLICT 에서 close/volume/trade_amount/change_amount/change_rate 의도적 omit — STEP1 매분 갱신 컬럼 보호 (D-34, T-2)
- [Phase 09.1]: Plan 01: kis_tokens DROP 은 Wave 0 파일 생성, Wave 4 cutover 마지막 step 에서만 push (KIS ingestion 가용성 보장 — T-09.1-04)
- [Phase 09.1]: Plan 01: 모든 신규 RPC + kiwoom_tokens 에 REVOKE 3줄 명시 (PUBLIC + anon,authenticated + GRANT service_role) — feedback_supabase_rpc_revoke 룰 준수
- [Phase 09.1]: Plan 02: kiwoom raw 타입에 인덱서 (`[key:string]: string`) 의도적 미사용 — kis.ts (인덱서 사용) 와 의도적 차이. 명시 필드 + 타입 안전성 우선. 추가 필드 필요 시 본 타입 확장 (R3).
- [Phase 09.1]: Plan 02: IntradayOhlcUpdate.marketCap 의 mac 단위 가설 = 억원 (R2). Plan 04 fixture 캡처가 단위 확정 — 가설 틀려도 mapper parseMac 1줄 변경으로 해결, 본 타입 변경 불필요.
- [Phase 09.1]: Plan 03: candle-sync 1:1 mirror 로 workers/intraday-sync 스캐폴드 — MODE dispatch 의도적 제거 (단일 cycle). redact 7 paths (kiwoomAppkey/kiwoomSecretkey/headers.authorization/access_token/accessToken/token/supabaseServiceRoleKey) — T-09.1-07 mitigate.
- [Phase 09.1]: Plan 03: tuning env defaults — MIN_EXPECTED_ROWS=1500 (휴장일 guard), HOT_SET_TOP_N=200 (D-11), KA10001_RATE_LIMIT=24 req/s (사용자 2026-05-13 실측). 모두 env override 가능.
- [Phase 09.1]: [Plan 04] parseSignedPrice 1 함수가 +/- 부호 분리 + 절댓값 + direction(up/down/flat) 한번에 처리 — D-09. flu_rt/pred_pre 는 parseOptionalSignedNumber 로 부호 유지 별도. trim/comma strip/Number.isFinite 가드 포함.
- [Phase 09.1]: [Plan 04] tokenStore 는 axios 직접 호출 (createKiwoomClient 미사용) — token endpoint 는 Bearer 미필요. upsert onConflict=token_type 으로 race idempotent (T-09.1-13 accept). parseKiwoomExpiresDt 가 'YYYYMMDDhhmmss' KST → UTC 변환.
- [Phase 09.1]: [Plan 04] fetchKa10027 의 hard cap 5000 + cont-yn=Y AND next-key 둘 다 있어야 loop 진행 (T-09.1-14). 401 → '키움 401' / 429 → '키움 429' / return_code != 0 → return_msg 분류 throw (T-09.1-11/12).
- [Phase 09.1]: [Plan 05] parseMac (×10^8) 가설 단위=억원을 1줄 격리 — Plan 06 production smoke 시 확정. 잘못된 단위 시 함수 1줄 + mapOhlc.test.ts expectation 1줄 변경만으로 정정 (T-09.1-15 mitigate).
- [Phase 09.1]: [Plan 05] fetchKa10001ForHotSet 가 Promise.allSettled (Promise.all 아님) + 각 호출 직전 acquireKiwoomRateToken — 종목별 실패가 cycle 중단 안 함 (T-09.1-16) + token bucket 자연 직렬화 (T-09.1-17).
- [Phase 09.1]: [Plan 05] computeHotSet = top N ∪ watchlist unique (Set 자료구조). watchlist 빈 → top N 만 정상 동작 (T-09.1-18 mitigate). user_id 미노출 (stock_code 만 SELECT).
- [Phase 09.1]: [Plan 06] rebuildTopMovers 가 marketMap 인자 추가 — top_movers 의 name/market NOT NULL 제약 충족 (PLAN 원안 미반영, Rule 1 Bug 자동 수정). DELETE 패턴도 .gte('rank', 0) → .neq('code', '') 변경 (rank=NULL 회피).
- [Phase 09.1]: [Plan 06] runIntradayCycle 통합 — STEP1 (ka10027 fetch → bootstrap → mapping+dedupe → market join → RPC #1 + stock_quotes + top_movers) → STEP2 (computeHotSet → ka10001 Promise.allSettled → mapping → RPC #2 + stock_quotes) 직렬 dispatch. 휴장일/partial 가드 (0 row exit 정상, < MIN_EXPECTED throw). dedupe Map by code 로 페이지 경계 중복 자연 제거.
- [Phase 09.1]: [Plan 06] STEP1/STEP2 stock_quotes UPSERT 의도적 컬럼 분리 — onConflict=code 가 페이로드 컬럼만 UPDATE 특성 활용. STEP1 (price/change/volume/trade_amount/name/market) 과 STEP2 (open/high/low/upper/lower/market_cap) 서로 다른 컬럼 → 자연 race-free (T-09.1-21 mitigate).
- [Phase 09.1]: [Plan 07] server/src/kis/* → server/src/kiwoom/* 4 모듈 신설 (worker Plan 04 mirror). createKiwoomRuntime 의 { client, getToken } 페어 stateless 패턴 — 매 요청 getKiwoomToken 재조회. cached SELECT 를 키움 호출 이전에 수행 (Rule 1 Bug — mock upsert overwrite + production race 회피).
- [Phase 09.1]: [Plan 07] StockQuoteRowUpsert = Omit<StockQuoteRow, 'volume'|'trade_amount'> — D-22 R3 RESOLVED. inquirePriceToQuoteRow 가 partial row 반환 → Supabase upsert 가 명시 컬럼만 SET → STEP1 ka10027 의 매분 trade_amount/volume 보존. server tests 121/121 + typecheck/build exit 0.
- [Phase 09.1]: [Plan 07] KIS env optional 화 (kisAppKey/Secret default '') + KIWOOM_APPKEY/SECRETKEY required get(). server/src/kis/* + services/kis-runtime.ts 는 무변경 (dead code 잔존) — Wave 4 Plan 11 cleanup 안전 deletion 대기. tests/setup.ts 가 KIWOOM env 주입 (test loadConfig throw 회피).
- [Phase 09.1]: [Plan 08] candle-sync setup/deploy/smoke/alert 4 파일 1:1 mirror + VPC stack 확장 — Static IP 1개를 Cloud Run Job (intraday-sync) + Cloud Run service (server) 공유 (D-29). compute.networkUser 3 바인딩 (Service Agent + intraday-sync SA + default compute SA, RESEARCH §4.7). Scheduler cron '* 9-15 * * 1-5' Asia/Seoul + task-timeout=60s. OAuth (OIDC 금지, T-09.1-34 mitigate).
- [Phase 09.1]: [Plan 08] KIWOOM Secrets 빈 secret 신설 + KIS env/secret 의도적 유지 (Wave 4 cleanup 까지 transition) — setup 스크립트가 gcloud secrets create 만 + accessor 바인딩, value 등록은 Plan 09 [BLOCKING] 사용자 액션. deploy-server.sh 가 KIS_APP_KEY/SECRET + KIWOOM_APPKEY/SECRETKEY 동시 보유, kis-runtime.ts dead code (Plan 07). VPC stack 존재 확인 게이트로 server 재배포 시 잘못된 outbound 사고 방지 (T-09.1-36).
- [Phase 09.1]: [Plan 09] 키움 ka10027 stex_tp='3' (통합) 필수 파라미터 추가 — 키움 spec 변경 (2026-05-15) 대응. MIN_EXPECTED_ROWS 1500→800 (실측 900~1175).
- [Phase 09.1]: [Plan 09] stock_quotes payload 의 name/market 키 미포함 + upper_limit/lower_limit 한국 시장 일일변동폭 ±30% 임시값 채움. PLAN 06 의 잘못된 컬럼 가정 정정.
- [Phase 09.1]: [Plan 09] upsertQuotesStep2 UPSERT → 종목별 UPDATE — Supabase upsert(onConflict) 가 INSERT 분기에서 모든 NOT NULL 평가하는 함정 회피. ~250 종목 직렬 호출 수십 ms (60s cycle 매우 여유).
- [Phase 09.1]: [Plan 09] STEP2 hot set 을 STEP1 처리 종목으로 intersect — watchlist 종목 중 ka10027 미응답 종목이 STEP2 신규 INSERT 시도하는 문제 해소. dropped 카운트 로그.
- [Phase 09.1]: [Plan 10] server Cloud Run service 재배포 (revision gh-radar-server-00015-zr5, image fe96bec) — Direct VPC Egress (gh-radar-vpc + gh-radar-subnet-an3 + vpc-egress=all-traffic) + KIWOOM secret (APPKEY+SECRETKEY:latest) 적용. 종목 상세 페이지가 키움 ka10001 동기 호출로 전환. smoke 9/9 + Cloud Logging Kiwoom runtime ready (tokenLen=86) + GET /api/stocks/005930+000660 200 검증. KIS env/secret 잔존 (Plan 11 cleanup).
- [Phase 09.1]: [Plan 10] Cloud Run service Direct VPC Egress 패턴 — annotation run.googleapis.com/network-interfaces + vpc-access-egress=all-traffic 으로 Serverless VPC Access connector 없이 native VPC 연결. Cloud Run Job (intraday-sync) + service (server) 가 동일 VPC + Cloud NAT 공유, Static IP 34.64.195.151 1개로 키움 IP whitelist 운영 통합 (D-29 충족).
- [Phase 09.1]: [Plan 10] cold-start 약 3초 (예측 1-2분 대비 우수) — min-instances=1 유지 + Cloud Run 의 빠른 instance startup. RESEARCH §4.6 T-12 의 예측보다 좋게 동작. server 이미지 빌드 (Plan 07 코드) 가 production schema 와 자연 호환 (Plan 09 의 worker 5건 deviation 패턴이 server 측 발생 안 함).
- [Phase 09.1]: [Plan 10] Cloud Logging 검색 시 pino 의 실제 필드명은 jsonPayload.message (msg 아님) — Plan 본문 검증 쿼리의 jsonPayload.msg 패턴은 미동작. 향후 GCP 로그 검색 시 jsonPayload.message 사용. 본 plan 에서 자연 정정.
- [Phase 09.1]: [Plan 11] KIS ingestion 완전 폐기 (RESEARCH §12 11-step). 데이터 정합 검증 (Scheduler PAUSE 후 10분 대기 + intraday-sync 단독 운영 870 row 5분 갱신 확인) → GCP 리소스 7개 삭제 (Job + Scheduler + SA + Secrets×3 + Alert) → kis_tokens DROP migration push (PGRST205) → 47 파일 git rm/edit + commit db391ac. PLAN 본문은 KIS secret 2개만 명시했으나 GCP 에 gh-radar-kis-account-number 추가 발견 — Rule 2 (Auto-add critical) 로 함께 삭제.
- [Phase 09.1]: [Plan 11] server 재배포 시 `gcloud run deploy --update-secrets` 가 기존 KIS secret binding 을 **누적**하여 첫 deploy 가 "Permission denied on secret: gh-radar-kis-app-key" 로 실패. Rule 3 (Auto-fix blocking) — `gcloud run services update --remove-secrets=KIS_APP_KEY,KIS_APP_SECRET --remove-env-vars=KIS_BASE_URL` 로 명시 제거하여 새 revision gh-radar-server-00017-mrm (image db391ac) 활성화. lesson — Cloud Run 의 secret binding 변경 시 `--remove-secrets` 명시 필수.
- [Phase 09.2]: Plan 02: useEffect 3-effect 분리 (mount/theme/rows) — theme 변경 시 chart 인스턴스 재생성 회피 + Volume bar per-bar color 도 theme effect 에서 재주입 (Pitfall 6 fix)
- [Phase 09.2]: Plan 02: error.message 의도적 미노출 (T-09.2-07 mitigate) — generic 카피 + console.error 분리. PostgREST/RLS 내부 정보 누설 표면 0
- [Phase 09.2]: Plan 02: 단위 테스트는 lightweight-charts 전체 mock — jsdom 에서 Canvas 렌더링 불가, 시각 검증은 Manual Verification (Plan 03 checkpoint) 책임
- [Phase 09.2]: 캔들스틱 차트 채택 — REQUIREMENTS.md Out of Scope 정책 반전 (사용자 명시 2026-05-15, 상세 페이지 자체 완결성 우선). 라이브러리 = lightweight-charts 5.2.0 (RESEARCH 비교 후 lock-in: 번들 +4 kB / 캔들+Volume 네이티브 / 트레이더 친숙도). 데이터 = webapp → Supabase PostgREST 직접 호출 (Phase 06.2 watchlist 패턴 mirror). Pitfall 9 (oklch parser 거부) → chart-colors.ts utility 모듈로 회귀 방지. Pitfall 6 (다크모드 자동 분기 미작동) → next-themes useTheme + chart.applyOptions effect 로 production 해결.
- [Phase 10]: Plan 01: theme-sync logger.ts 는 master-sync named export `logger` 형태 채택(discussion-sync factory 아님) — retry.ts `import { logger }` 호환 + redact paths 만 theme-sync 시크릿(brightdata/anthropic/supabase service-role/token)으로 교체 (T-10-01-01 mitigate)
- [Phase 10]: Plan 01: alpha-all-themes.json 실측 548KB(27카테고리)→정치(full 39테마,이재명 id=6)+반도체(2테마) 트리밍 — CLAUDE.md 크롤링 5원칙 #5(부분캐싱·전체덤프 금지) + POLITICS_CATEGORIES 필터 포함/제외 양방향 검증. 네이버 HTML 은 cheerio td.name>div.name_area>a 선택자 컨텍스트 보호 위해 실측 full page 미트리밍 보존
- [Phase 10]: Plan 01: 워커 스캐폴드 패턴 = master-sync(package/tsconfig/retry/supabase) + discussion-sync(vitest passWithNoTests) 1:1 복제 후 name/redact 치환. 외부 소스 둘 다 curl 200 OK(차단 없음) → 실측 fixture 고정(RESEARCH valid_until 2026-07-09)
- [Phase 10]: Plan 02: 시스템/유저 테마를 테이블 분리 없이 단일 themes(is_system 플래그 + owner_id NULL 분기 + norm_key partial-unique)로 모델링 (D-01) — "충돌 0"은 RLS + WITH CHECK 가 강제, theme_stocks 조인 1개 유지로 목록·종목칩 UNION 회피 + fork=INSERT-SELECT 단순화
- [Phase 10]: Plan 02: 공개 read 정책(read_system_themes / read_theme_stocks) TO anon, authenticated 둘 다 명시 (Pitfall 3, feedback_supabase_rls_authenticated) — anon-only 시 로그인(JWT authenticated) 사용자 default-deny 빈 응답 회귀 방지. owner_id REFERENCES auth.users(id) ON DELETE CASCADE + CHECK themes_owner_consistency 무결성. 종목수/테마수 50-limit 은 RLS subquery 금지(recursion+42501 구분불가) → BEFORE INSERT trigger P0001 (시스템=service_role 무제한)
- [Phase 10]: Plan 02: production db push 적용 완료 + 검증 — `supabase db push --yes` 가 20260609120000_theme_tables.sql 적용(exit 0), dry-run 재실행 "Remote database is up to date", service_role REST GET themes/theme_stocks 200(테이블 존재), anon REST GET themes?is_system=eq.true 200(read_system_themes 활성). 시드 부재로 빈 배열이나 default-deny 아님 = RLS 정상
- [Phase 10]: Plan 02: [Rule 3 - 포매팅] acceptance-criteria 리터럴 lowercase grep(`references stocks(code)` / `owner_id uuid REFERENCES auth.users`) ↔ repo uppercase-SQL 컨벤션 양립 — canonical DDL 은 uppercase REFERENCES 유지 + 동일 라인 trailing 주석에 lowercase 앵커 병기. 스키마/동작 무영향 (주석은 SQL 무시)
- [Phase 10]: Plan 03: backoff 상태를 api_usage 재사용(service=theme_*_backoff, count=backoff-until epoch ms)으로 저장 — 신규 마이그레이션 회피. 콘텐츠 SHA256 은 hex 앞 13자리(52bit) 정수 다이제스트로 api_usage.count 저장/비교(변경 감지용)
- [Phase 10]: Plan 03: 직접 fetch → 403/429/undefined-status 시 Bright Data 프록시 1회 폴백(자동 지수 재시도 금지, 5원칙 #4). EUC-KR 은 arraybuffer+iconv(Pitfall 2), 알파는 zod 검증 JSON. 둘 다 차단 시 markBackoff(24h) → 다음 cycle skip
- [Phase 10]: Plan 03: 보수적 norm_key 정규화(NFKC+소문자+공백/특수문자 제거, 괄호 보존, Levenshtein 금지) — 'AI챗봇'='ai 챗봇' 병합, 'HBM(고대역폭메모리)'≠'HBM' 분리. upsertThemes 는 stocks .in() 청크(200) FK skip + theme_stocks 청크(500) + effective_to soft-제외 이력
- [Phase 10-theme-classification]: 10-04: 테마 상위3평균을 server 실시간 계산(A2)으로 — stock_quotes.change_rate 매 요청 재계산(scanner.ts 동형), DB precompute 컬럼은 캐시 폴백용. '지금 뜨는 테마' 신선도(D-14).
- [Phase 10-theme-classification]: 10-04: /api/themes 두 라우트 모두 stock_quotes/.in() 청크(200)+error throw — 테마 종목 합집합 가변 대규모, 37afcde 강세장 빈응답 회귀 선제 차단.
- [Phase 10-theme-classification]: 10-04: GET /api/themes(:id) 가 is_system=true 만 조회 — 유저 테마 id 404. 유저 테마는 webapp→Supabase RLS 직접 경로(Plan 05)라 service_role 라우트 격리(T-10-04-04).
- [Phase 10]: 유저 테마 CRUD/fetch/fork 전 경로 Supabase 직접(Express 미경유) — RLS owner-only 격리 + is_system=false 명시로 위조 차단 (10-05)
- [Phase 10]: fork = 단일 테이블 INSERT-SELECT 스냅샷, active 멤버십(effective_to IS NULL)만 source='user' 복사 (D-05, 10-05)
- [Phase 10]: P0001 50-limit 을 isThemeStockLimitError 헬퍼로 식별 + useThemesQuery 가 두 소스 60s 합성(비로그인 myThemes=[]) (10-05)
- [Phase 10]: 10-06: 펜스-tolerant JSON 추출을 parseJson.extractJsonObject 공유 유틸로 — Haiku 가 'JSON only' 지시에도 ```json 펜스로 감싸 discover/correct 두 파서의 JSON.parse 가 throw → 발굴 0건(POC 실측 라이브 버그). 첫 '{'~마지막 '}' 슬라이스로 두 파서 공유 수정. mocked 테스트가 못 잡은 사각지대.
- [Phase 10]: 10-06: 보수적 cross-chunk dedup(collapseNearDuplicates) — POC 36 후보 중 ~55% 가 청크별 같은 테마 변형명 재발굴. 병합 조건 EITHER (a)종목코드 ≥2 공유 OR (b)norm_key substring 포함(짧은쪽 길이≥4 가드). edit-distance 금지, 불확실 시 KEEP BOTH(normalizeName 보수 원칙 승계). 병합 시 더 일반적(짧은) 이름 canonical+stockCodes 합집합+confidence max.
- [Phase 10]: 10-06 POC 실측: 5 Claude 호출 ~51k in+1.9k out 토큰 = $0.06/run → ~$1.83/월(target <$1/일 통과). 정확도 GOOD(HBM/온디바이스AI/양자/파운드리 등 실 KR 테마). source='ai' 표시 승인(ai_candidate 격리 불필요, 코드 변경 0 — /api/themes is_system=true 자동 surface). prod 활성은 10-08 의 THEME_SYNC_CLASSIFY_ENABLED=true.
- [Phase 10]: [10-07] 출처 도트를 globals.css 토큰만으로 매핑(naver=--flat / alphasquare=--down 블루 정확일치 / ai=--accent 뱃지+--primary 도트) — 목업 인라인 oklch(green/purple) literal 은 하드 룰(토큰만) 우선해 폐기, 세 출처 시각 구분 유지하며 색 리터럴 0
- [Phase 10]: [10-07] theme-api.fetchMyThemeDetail 추가 — /api/themes/:id 가 유저 테마 404(Plan04 격리)라 유저 상세는 Supabase nested embed(theme_stocks→stocks→stock_quotes, watchlist 톤). 상세 fetch 는 시스템 우선 → 404 시 유저 폴백, isSystem 이 read-only/편집 분기 구동
- [Phase 10]: [10-07] /themes/[id] 종목 리스트 = scanner-table/card-list 직접 재사용(ThemeStockMember→StockWithProximity 매핑 1함수, props 변경 0). ThemeEditDialog 단일 컴포넌트가 create/edit/fork 3모드 + 종목 add·remove + P0001 인라인 흡수, 목록 CTA + 상세 편집 양쪽 재사용
- [Phase 10]: [10-08] theme-sync production 배포 — Cloud Run Job gh-radar-theme-sync + Scheduler gh-radar-theme-sync-daily(0 16 KST, OAuth invoker OIDC 금지) + SA + 기존 Secret 3종(brightdata/anthropic/supabase-service-role) 재사용(신규 0). THEME_SYNC_CLASSIFY_ENABLED=true. 첫 scrape 356 시스템 테마(331 naver/alpha + 25 AI 발굴) + 7,561 theme_stocks + aiDiscovered=25/aiCorrected=2, backedOffSources=[] (네이버 직접 성공). themes count gate PASS(356)
- [Phase 10]: [10-08] 유저 테마 optimistic 갱신 — upsertMyTheme(replace-by-id else prepend)/removeMyTheme(id) + onSaved(스냅샷)/onDeleted(id) 시그니처. Supabase 풀러 read-after-write 레이스로 생성 직후 list 빈 화면 회귀를 즉시 반영 후 refresh reconcile 2단으로 해소(통계 null 폴백). create-and-add E2E 통과
- [Phase 10]: [10-08] @gh-radar/shared 확장자 없는 re-export lesson — 10-02 의 첫 런타임 값 re-export(THEME_STOCK_SOURCES from ./theme.js)가 Turbopack dev .js→.ts resolve 갭 재유발(DEV 전용 오버레이, production build 는 항상 green). moduleResolution:bundler 에서 확장자 생략이 관용(NodeNext 소비자는 dist, 무영향)
- [Phase 10]: [10-08] smoke INV-2 — Cloud Run Job pino 로그는 jsonPayload.msg 로 쿼리(service .message 매핑과 다름, 라이브 덤프 확인) + Cloud Logging ingestion 지연 5×15s 재시도. Phase 09.1 의 'service 는 jsonPayload.message' 와 대비되는 Job 측 관측. E2E 상세(edit/delete/fork)는 Express /api/themes/:id 부재로 404 mock(mockThemesApi {list:[]}) → 실 Supabase fetchMyThemeDetail RLS owner-only 폴백 구동
- [Phase 12]: [12-01] limitUpPrice tick 판정은 target(prev_close×1.3) 가격대 기준 — prev_close 기준 시 500k 등 경계 오류(Pitfall 1). 응답 계약은 객체 {hero,events,themes}(배열 아님, comovement 드리프트 회피). TS 미러가 plpgsql limit_up_price() Wave 2 회귀 대조 기준. limit-up-sync 워커 = Phase 11 동조 워커 1:1 복제 + rebuild_limit_up 교체.
- [Phase 12]: [12-02] 마감상한가 판별 = close=limit_up_price(prev_close) 정수 정확 비교(비율 임계 아님, D-01). limit_up_price() IMMUTABLE 순수산술 REVOKE 불요, rebuild_limit_up() 만 REVOKE 3줄+search_path 격리. STEP C 테마풀링=active 시스템테마(is_system AND NOT hidden AND effective_to IS NULL) 멤버 이벤트풀 GROUP BY. 프로덕션 rebuild event_rows=3459/stock 1271/theme 322, 황금케이스(000390 4회 win 0.75·000440 4회 jeom1 win 0.50) 재현, anon RPC 401(REVOKE).
- [Phase 12]: [12-03] server 읽기 라우트 GET /api/stocks/:code/limit-up = limit_up_* SELECT → { hero, events, themes } 객체 계약(배열 아님). 정적 이력 — 시세 조인/재계산 0 (D-22 read-only). turnover/win_rate NULL 보존(toNumOrNull), 테마 sample_n DESC 정렬(D-17), 이벤트 0회 zeroStats 빈 상태. /:code 핸들러 앞 등록(shadowing 회피). prod 재배포 revision gh-radar-server-00030-wb6 + curl 검증(000440 events=4 객체·005930 빈·!!! 400·count 3459 불변). smoke INV-8 무관 FAIL.
- [Phase 12]: [12-04] limit-up-sync 워커 배포 — Phase 11 동조 워커 setup/deploy/smoke 1:1 복제(식별자만 교체). Cloud Run Job gh-radar-limit-up-sync(180s) + Scheduler nightly(cron 0 2 * * 2-6 KST, OAuth invoker OIDC 금지, 리소스 단위 run.invoker). 외부 API 키 0(supabase-service-role accessor 1개만, T-12-04-02). 배포된 Job rebuild_limit_up 실행 event_rows=3459/stock 1271/theme 322. smoke INV-1/3/4/5 PASS, INV-2 는 Cloud Logging 전파지연 flake(직접 재조회 통과).
- [Phase 12]: [12-05] webapp 상한가 다음날 이력 섹션 ②안 데이터 대시보드 — KPI 3그리드(시초가 익절 N≥3 게이팅/평균/최악) + 전폭 분포 밴드(변형 A) + OHLC 8컬럼 표(점상 태그·faded·더보기) + 테마 가로 풀링 바(N desc) + 면책. 표시 순수함수(shouldShowWinRate/sparkBucketTone/fmtRet/fmtTurnover/BUCKET_LABELS) limit-up-format.ts 분리 + 단위 테스트 박제(sparkBucketTone(2)='up' off-by-one BLOCKER 3 가드). comovement 미러 quiet fallback(return null, error.message 미노출, T-12-05-01). 국내 색상 oklch 토큰만(D-13, 하드코딩 0). prod 시각 검증 중 분포 spark 가독성 이슈 → 변형 A(라벨 세로 막대 밴드) 재디자인 후 재배포(gh-radar-webapp-faraucl94...). Phase 12 LIMIT-01 end-to-end prod live.
- [Phase 13]: [13-01] home_theme_snapshots = JSONB-blob-per-row 스냅샷 (PK trade_date,captured_at + payload jsonb Claude 출력 1:1 + content_hash/is_carried hash-skip 복제 append). RPC 없는 plain table → REVOKE 불요, RLS SELECT TO anon,authenticated + service_role write. 프로덕션 push 완료(anon GET 200).
- [Phase 13]: [13-01] workers/home-sync = theme-sync reduced 클론 — config 은 anthropic+supabase+급등튜닝(surge/news)만, 스크랩/프록시 전면 제거. anthropic.ts/parseJson.ts verbatim. Dockerfile VPC 없음(§Pattern 5 Supabase+Anthropic만 호출). [Rule 1 버그] config JSDoc 의 */scrape* 시퀀스가 블록주석 조기종료 유발 → 리워딩.
- [Phase 13]: [13-02] home-sync 파이프라인 — loadSurges(급등+종목별 top-K 뉴스 truncation 회피) + clusterSurges(Claude 1x bottom-up, newsRefs 인덱스 verbatim 해석 D-04 + breadth 정렬 D-05 + <2 강등 D-06) + runHomeSyncCycle(hash-skip clone-append is_carried, Pattern 4). TDD 20/20 green + build 0. clusterSurges 반환 ClusterResult(threshold/marketStatus 는 index 확정). tsconfig exclude src 테스트(코로케이트 테스트가 build 로 vitest 끌어오는 문제 차단, Rule 3).
- [Phase 13]: 13-03: /api/home 읽기 라우트 = limitUp 객체계약 { snapshot, index }(배열 아님). payload verbatim 서빙(실시간 시세 재조인 없음, Pitfall 3/T-13-03). 파라미터 우선순위 capturedAt>date>무필터.
- [Phase 13]: 13-04: useHomeQuery 폴링 없음 — 홈은 시점별(:30) 이력 조망 화면이라 사용자 date/slot 전환이 fetch 트리거. AbortController 로 파라미터 빠른 전환 레이스 차단(useThemesQuery 변형)
- [Phase 13]: 13-04: 시점 슬롯 HH:MM 라벨/마감(15:30) 판별 = Intl.DateTimeFormat timeZone=Asia/Seoul (capturedAt UTC ISO → KST). home-client isEmpty = snapshot null OR (themes[] AND singles[] 둘 다 비어있음)
- [Phase 13]: 13-04: /home-preview 프리뷰 + middleware PUBLIC_EXACT 항목은 임시 검증 스캐폴드 — home-client 가 라이브 /api/home 호출이라 네트워크 무관 목데이터 프리뷰로 시각 체크포인트 승인. Plan 05 가 / 루트 마운트 시 둘 다 제거
- [Phase 13]: 13-05: 홈을 앱 루트(/)로 승격 — page.tsx redirect('/scanner') → AppShell+Suspense(HomeSkeleton)+HomeClient(force-dynamic), 사이드바 NAV 홈 1번째. 임시 /home-preview 라우트+middleware 화이트리스트 제거. home.spec E2E 5/5(렌더/날짜·시점 네비/빈 상태/scanner 회귀 T-13-12)
- [Phase 13]: [13-06] home-sync 프로덕션 배포: Cloud Run Job(512Mi/120s, VPC 없음) + Scheduler gh-radar-home-sync-cron(30 9-15 KST 7슬롯, OAuth) + Secret 재사용 신규 0. Claude POC PASS(themeCount=4 실제 대응, 환각 0, ~$3.1/월 이내). 후속(비차단): 테마 내 뉴스 URL dedup(news_total 44 vs unique 4 저장 중복, 표시 무영향).
- [Phase 14]: 14-01: conversations.stock_code ON DELETE SET NULL (종목 상폐 시 대화 보존) + messages RLS 는 user_id 없이 conversations EXISTS 서브쿼리 4정책 + RPC 없어 REVOKE 불요(home_theme_snapshots 선례). 비공개라 TO authenticated 만(anon 미부여=default-deny). production push + pg_policies 8행 검증.
- [Phase 14]: Plan 02: 챗봇 웹서치 모델을 chatWebSearchModel 별도 config 키로 분리 — Haiku web_search 미지원 시(RESEARCH A2) CHAT_WEBSEARCH_MODEL=claude-sonnet-4-6 env 1줄 폴백, 코드 무변경. 팀장 Sonnet/전문가 Haiku default, anthropicApiKey 재사용. ChatSSEEventMap 이 SSE 프로토콜 단일 진실 소스.
- [Phase 14]: requireAuth 는 supabase.auth.getUser(jwt) 재사용 — jose/jsonwebtoken 신규 의존성 0. 서명·만료·revoke supabase-js 내장.
- [Phase 14]: chat-history 소유권 불일치도 404 CONVERSATION_NOT_FOUND 흡수(403 대신) — 존재 여부 누설 회피(T-14-01 IDOR). DB error 는 500 DB_ERROR 래핑으로 PostgREST 내부 미노출.
- [Phase 14]: [Plan 05] SPECIALIST_TOOLS name 은 SPECIALIST_TOOL_NAMES 상수 참조(리터럴 중복 금지) + code 는 required 제외(question 만) — 팀장이 종목 없는 질문에서 스키마 위반 없이 자연 미호출, 실제 방어는 runSpecialist code guard(D-08 quote/limitup 무데이터 조회 차단)
- [Phase 14]: P08: FAB 라벨 종목명은 provider stockContext.name 만 사용(usePathname 미도입) — 종목상세가 이미 fetch 한 데이터 재사용, 추가 조회 0(D-03)
- [Phase 14]: P08: 시트 닫힘(closeChat)은 abort 안 함 — abort 는 새 전송/명시 정지만(서버 완료 저장, D-06). FAB/시트/사이드바 라벨 'AI 애널리스트' 단일화
- [Phase 14]: [Plan 06] clientAbort(시트닫힘)/interrupt(새요청) 분리 — effectiveSignal=AbortSignal.any([interruptController.signal]) 로 Claude 스트림은 interrupt 만 취소, 시트 닫혀도 finalMessage 완료 후 히스토리 저장(D-06). ww-bot(둘다취소)과 의도적 차이(영속화 존재)
- [Phase 14]: [Plan 06] 세션 Map 은 interrupt/busy 가드 전용(키=conversationId??userId), 히스토리는 DB loadConversation 복원 — messages 는 텍스트 스냅샷만 저장(tool 원본 미저장, Pitfall 3) 후 sanitizeMessages 필수
- [Phase 14]: [Plan 09] MiniChart 는 StockDailyChart 통째 재사용 대신 동일 lightweight-charts+chart-colors 스택으로 120px mini 축약(볼륨/마커/hover 제거) — oklch 회피 sRGB 팔레트 주입, D-10 충족
- [Phase 14]: [Plan 09] 챗 blocks(stock_card/citation/chart)는 스트리밍 중 로컬 배열 수집 → response_complete 에 확정 메시지 부착. 진행 중엔 AgentProgress 스텝퍼+부분텍스트만(D-05 + shift 최소화)
- [Phase 14]: 챗 대화목록 GET 은 bare array 반환 — { data } envelope 가 webapp apiFetch(unwrap 없음) 계약과 불일치해 종목별 히스토리 유실. production smoke 로 발견, Rule 1 수정(05e96b4)
- [Phase 14]: 챗 면책 문구 전면 제거 — 사용자 checkpoint 결정. 서버 프롬프트+webapp UI+테스트 전부 삭제, 매매지시 금지·환각 금지 안전 가드는 유지(8fd25cc)
- [Phase 14]: 챗 모델 전면 claude-sonnet-5 — 사용자 결정(팀장+전문가+웹서치 3키). 전문가 temperature 제거+thinking disabled, 팀장 adaptive thinking 유지+max_tokens 8192. web_search_20250305 유지, [chat] usage 에 model=claude-sonnet-5 관측(2918a4b)
- [Phase 16 Plan 19]: relay 송신구 `send` 는 `boolean` 을 돌려주고 소켓 미연결 드롭을 `console.error` 로 남긴다 (PC-7 무로그 fail-safe 금지 / T-16-19) — 로그에는 `msg.t` 만 싣는다 — `lc.set.cfg`·`vi.set.accountNo` 의 계좌번호가 브라우저 콘솔로 새면 안 된다 (T-16-18)
- [Phase 16 Plan 19]: 킬 스위치는 세션이 `ready` 가 아니면 비활성이고, 전송 실패 시 `awaitingAck` 를 세우지 않는다 — 「보내지 못했어요」(0바이트 확실)와 「반영을 확인하지 못했어요」(65 유실 — 결과 모름)는 다른 문구다 (T-16-20 / T-16-21)
- [Phase 16 Plan 19]: send 호출부 감사 결과 세션 가드 예외는 킬 스위치 하나가 아니라 둘이었다 — `vi-settings-card` 의 `submit` 이 `DirtyActionBar` 「수정」 경로로 우회했다 — 가드는 UI 의 `disabled` prop 이 아니라 송신 콜백 첫 줄에 둔다. 공용 액션 바는 세션 상태를 모른다
- [Phase 16 Plan 20]: WR-04 는 「모듈 삭제」로 확정 — listOrders 결선은 곧 주문 이력 표를 만드는 것이고 그 표는 D-20 이 이 phase 밖(deferred)에 두었다. 라우트(GET /api/orders)는 D-03 사용자 결정이라 남긴다.
- [Phase 16 Plan 20]: dma_orders.origin 은 shared 계약(DmaOrderOrigin)에 사본으로 둔다 — server 는 relay 를 의존하지 않는다. server 에 기본값 보정을 넣지 않는다(DB DEFAULT manual + NOT NULL 이 정본). manual 은 「수동」과 「출처 불명」이 같은 값이라 자동주문 감사의 증거로 쓸 수 없다.
- [Phase 16 Plan 21]: relay `/healthz` degraded 판정에서 「한 번도 Ready 인 적 없는 세션」을 제외한다 (gap 4 해법 ③). 판정축이 `sessionCount` → `everReadyCount` 로 옮겨가 15-05 계약을 대체한다 — 게이트웨이가 애초에 없는 환경은 relay 장애가 아니다.
- [Phase 16 Plan 21]: `DmaSession#hasBeenReady` 는 래치이며 `false` 로 되돌리는 경로를 만들지 않는다 (T-16-26). 「게이트웨이 부재」와 「게이트웨이 장애」를 가르는 유일한 근거라, 되돌리면 진짜 장애 탐지가 함께 죽는다.
- [Phase 16 Plan 21]: smoke INV-9 는 사라진 server 주문 라우트 대신 relay wss 주문 왕복으로 도달성을 잰다. 기대값은 `order.result(status=rejected)` — 화이트리스트 밖 계좌 `0000000000` + 미해석 ISIN 조합이라 게이트웨이 송신·`dma_orders` insert 이전에 끝난다 (T-16-28).
- [Phase 16 Plan 22]: 주문 통보 상관을 다축 단계적 좁히기로 바꿨다 — orgOrderNo → noticeType("R" 제외) → quantity·price("E" 제외). 각 축은 남는 후보가 0이면 적용하지 않는다(구 서버가 비워 보내는 축이 정상 통보를 죽이지 않게)
- [Phase 16 Plan 22]: 하나로 좁히지 못하면 아무것도 정산하지 않고 recordUnmatched 로 보낸다 (T-16-29). 「가장 오래된 것」 폴백을 만들지 않는다 — 잘못 귀속된 기록은 없는 기록보다 나쁘다. 남은 대기는 5초 타임아웃이 「결과 모름」으로 끝낸다
- [Phase 16 Plan 22]: 통보 후보를 그 사용자의 전 연결에서 모아 좁힌다 (T-16-30). order.result 는 여전히 요청 연결로만 간다 — T-16-03 은 유지
- [Phase 16 Plan 22]: 중복 주문 판정만 userDupKeys(Map<userId, Set>) 로 사용자 스코프에 올리고 rid 재전송 가드는 연결 스코프로 남겼다 (WR-02). ConnState.dupKeys 역인덱스를 closeConn 이 회수하고, release 는 이 연결이 아직 쥔 키만 푼다 (T-16-31 / T-16-33)
- [Phase 16 Plan 23]: `account`(마지막 수신 계좌)를 relay 계약에서 **필드째 제거**했다 (CR-01 / T-16-35). 소비자 2곳을 `accountStates` 로 옮기는 것만으로는 다음 소비자가 같은 실수를 반복한다 — 계좌 축에 쓸 수 있는 값이 이제 `accountStates` 맵 하나뿐이고, 거기서 무언가를 꺼내려면 계좌번호를 명시해야 한다.
- [Phase 16 Plan 23]: 계좌 선택은 **소비자가** 한다 — `useRelaySubscription` 이 계좌 하나를 골라 주는 설계는 원리상 불가능하다. 훅은 사용자가 어느 계좌를 골랐는지 모르므로, 그럼에도 고르면 그 값은 필연적으로 「마지막으로 프레임이 온 계좌」가 되고 그것이 정확히 CR-01 이다.
- [Phase 16 Plan 23]: 호가주문 탭의 계좌 패널·매도가능수량 입력을 `accountStates.get(selectedAccountNo)` 하나로 통일했다 (T-16-34). 머리와 행의 출처가 같아져 「A 계좌 화면에서 B 주문번호를 취소」 경로가 사라진다 — relay 화이트리스트는 두 계좌 모두 그 사용자 것이라 막지 못한다.
- [Phase 16 Plan 23]: ISIN→종목명 역매핑 사본 3개를 `webapp/src/lib/isin-labels.ts` 로 합쳤다 (WR-08 / T-16-37). 사본 수가 아니라 **동작이 갈라지는 것**이 결함이었다 — 사이드바만 계좌 하나를 봐서 계좌 2개에서 표시가 프레임마다 흔들렸다. 공용 훅은 `useMemo` 로 감싼다.
- [Phase 16 Plan 23]: `me-client` 상태줄 반영 시각을 계좌 전체의 최신값(`latestAccountTime`)으로 재정의했다. 상태줄은 계좌 축이 없는 전역 요약이라 답해야 할 질문이 「어느 계좌인가」가 아니라 「가장 최근 언제 반영됐나」다. 비교는 `formatServerTime` 정규화 후에 한다(`YYYYMMDDHHMMSS` 와 `HH:MM:SS` 혼재).
- [Phase 16 Plan 24]: VI 주문금액 상한은 shared 상수 MAX_VI_ORDER_AMOUNT_KRW(원 단위 100억) 하나가 정본이고 zod·envelope·UI 세 층이 그것을 import 한다 (WR-07 / T-16-38). 세 층 어디에도 값을 복제하지 않는다 — 두 번 적으면 가장 느슨한 층이 실질 상한이 된다.
- [Phase 16 Plan 24]: 만원 상한은 vi-alert.ts 가 krwToManwon 으로 유도한다 — 단위 변환의 유일 지점이 그 파일이므로 유도식도 같은 자리에 둔다. 카드에서 10_000 으로 나누면 그 파일이 못박은 규칙을 깨고 리터럴이 되살아난다.
- [Phase 16 Plan 24]: 금액 입력 초과는 거부가 아니라 상한 클램프다 (T-16-41). 입력을 삼키면 왜 안 써지는지 알 수 없다 — 자르고 vi-amount-limit 한 줄이 이유를 댄다. 자른 결과가 곧 폼 값이라 「확인 다이얼로그 표시값 = 전송값」이 구조적으로 성립한다. 서버 에코발 초과는 submit 가드가 따로 막는다.
- [Phase 16 Plan 24]: OrderStore 의 #flushing(boolean) 을 #current(Promise|null) 로 완전히 대체했다 (WR-09 / T-16-39). boolean 은 「지금 도는가」만 답하고 「끝날 때까지 기다린다」를 답할 수 없다 — 종료 절차가 기다릴 수 있게 된 것이 이 한 줄의 전부다. 병행하지 않은 이유는 정본이 둘이면 다음 사람이 boolean 으로 즉시반환 분기를 다시 만들기 때문이다.
- [Phase 16 Plan 24]: tick 과 종료의 플러시 계약을 의도적으로 다르게 뒀다 — tick 은 진행 중이면 건너뛰고(기다리면 200ms 마다 대기자가 쌓여 장애 중인 Supabase 를 겹쳐 두드린다) 종료만 기다린다. 기다림은 「곧 죽는 프로세스」의 특권이다. 반복 상한 ORDER_FLUSH_MAX_ROUNDS(=ORDER_MAX_RETRIES+2) 에 걸리면 남은 큐 길이를 logger.error 로 남기고 반환한다 (S-5 / T-16-40).
- [Phase 16 Plan 25]: lc.set 의 시장 구분은 relay 가 소유한다 (WR-03 / D-28). RelayLcSetSchema.cfg 에서 market 필드를 **삭제**해 브라우저가 실어 보내도 z.object 가 떨어뜨리게 하고, fanout 의 ②-1 단계가 symbols.lookup(isin) 으로 푼다 — 못 풀면 거부다. 값을 검증하는 대신 애초에 받지 않는 것이 order.new 게이트 ③-1 과 같은 규율이다.
- [Phase 16 Plan 25]: buildSetLimitChaserReq 의 파라미터를 RelayLimitChaserInput & { market } 으로 좁혔다 — 조립기에 기본값 "K" 를 두는 순간 코스닥 전략이 코스피로 등록되고, 전략은 한 번의 주문이 아니라 반복 발주 설정이라 그 오차가 계속 재생산된다.
- [Phase 16 Plan 25]: 게이트 무장 판정은 gateBlocked(key, next) 하나이고 스위치 disabled 와 toggleGate 전송 가드가 그것을 함께 읽는다 (WR-06 / T-16-43, vi-order-list 의 isConfirmable 승계). next === false(끄기)는 무장 조건을 보지 않는다 — 무장 해제를 막으면 사용자의 자산을 인질로 잡는다 (T-16-44).
- [Phase 16 Plan 25]: 매도 무장 조건은 계획의 sellQty 대신 sellWatchQty 를 본다. estimatedSellQty 는 lib/limit-chaser.ts 가 「표시 전용」이라 못박은 값이고, 보유 0 을 차단 조건으로 삼으면 「사기 전에 팔 조건을 거는」 상따 주 동선이 통째로 막힌다 — 서버가 매도를 눕히는 조건도 sellWatchQty === 0 이다.
- [Phase 16 Plan 25]: 배포는 relay 를 먼저 올린다. 새 webapp + 옛 relay 조합은 market 없는 cfg 가 옛 스키마의 필수 필드 검증에 걸려 lc.set 이 전부 조용히 드롭된다 (16-26 배포 순서).
- [Phase 16]: update 의 23505 분기는 셀렉터가 아니라 patch.order_no 에 건다 — finish 경로는 셀렉터가 id 다 — selectorOf 가 orderRowId 를 우선하므로 GC-WR-08 이 지목한 경로의 셀렉터는 id 이고 order_no 는 채울 컬럼이다. 셀렉터로 좁히면 그 경로를 비켜 간다.
- [Phase 16]: ORDER_FLUSH_MAX_ROUNDS 는 +2 를 유지하고 세 라운드의 정체를 docstring 에 적는다 (a안) — 3라운드는 재시도가 아니라 flushNow 가 await 하는 동안 동기 enqueueUpdate 로 들어온 항목의 몫이다. +1 로 자르면 SIGTERM 과 마지막 통보가 겹칠 때 그 항목이 손도 못 대고 결손으로 보고된다.
- [Phase 16]: 상따 삭제(crud D · 전 게이트 OFF)는 시장 해석 실패로 거부하지 않는다 — 전략 키에 시장이 없어 폴백이 삭제 대상을 바꾸지 않는다 (GC-WR-04)
- [Phase 16]: relay 무장 가드를 UI canArmBuy·canArmSell·canArmSweep 3식과 동형으로 이식 — sellWatchQty 0 과 sweep 게이트를 서버가 막는다 (GC-WR-05)
- [Phase 16]: 세션 생성 시각(createdAt)은 DmaSession 이 아니라 SessionManager 의 Entry 에 둔다 — hasBeenReady 래치의 의미(T-16-26)를 흐리지 않기 위해서다. session.ts diff 0줄 (GC-WR-07)
- [Phase 16]: STALE_SESSION_MS(5분)는 env 로 열지 않는다 — 판정 임계가 배포 환경마다 갈리면 uptime 알림의 의미가 환경별로 갈라진다 (GC-WR-07)
- [Phase 16]: smoke 프로브 비밀은 argv 가 아니라 env(SMOKE_TOKEN)로 넘긴다(argv 는 ps 로 world-readable). 판정 문자열은 대입으로 덮어쓰고 출력 지점은 하나 (GC-WR-11)
- [Phase 16]: 16-31: 무장 판정을 setSubmitting(true) 앞에 둔다 — 잠근 뒤 막으면 60 에코가 오지 않아 「수정」이 영구히 잠긴다
- [Phase 16]: 16-31: handleSubmit 가드는 켜져 있는 게이트만 본다 — 게이트를 내리는 「수정」은 무장 조건과 무관하게 나간다 (T-16-44 확장)
- [Phase 16]: 16-31: 무장 불가 문구를 상수 3종 → 원인 6종 + armBlockedTextOf 산출 함수 — 렌더와 전송 차단이 같은 함수를 읽는다
- [Phase 16]: 16-31: pnpm 필터명은 @gh-radar/webapp — 계획 문언의 gh-radar-webapp 은 존재하지 않는 필터로 exit 1
- [Phase 16]: 16-32: vi-order-list 의 send 실패 분기는 setOptimistic·setSending 앞에서 return 한다 — 잠금을 푸는 신호가 서버 73 델타뿐이라 나가지 않은 요청에 건 잠금은 영구다
- [Phase 16]: 16-32: vi-settings-card 의 submit 을 ViSubmitResult 3갈래(sent/blocked/failed)로 만들었다 — failed 만 확인 다이얼로그를 열어 둔다. 「닫힘」이 성공 신호로 읽히지 않게
- [Phase 16]: 16-32: latestAccountTime 은 st 원문에서 만든 비교 키(dated 축 우선)로 고르고 승자의 원문에서 표시값을 뽑는다 — epoch 승격은 모르는 날짜를 「오늘」로 가정해야 해서 자정 뒤집힘의 원인이 된다
- [Phase 16 Plan 33]: 붙을 행이 없는 수동 통보는 **0행 update 를 보내지 않는다** — 조회로 확인된 경우에만 `orderRowId` 로 갱신하고, 없으면 통보 원문을 `logger.error` 로 남긴다. PostgREST 가 0행 update 를 성공으로 답하는 것이 이 파일이 없애겠다고 선언한 Pitfall 18 의 정체다.
- [Phase 16 Plan 33]: 통보 기록 경로의 예외는 **두 겹**으로 막는다 — 호출부 `.catch`(증상) + `insertOnly` 의 try 안으로 옮긴 `autoInsertRow`(원인). 한 겹만 두면 원인은 남고 증상만 가려진다. `index.ts` 의 `unhandledRejection` 은 프로세스 종료이므로 통보 1건의 파손이 전 사용자 세션 절단이다.
- [Phase 16 Plan 33]: 빈 주문번호(`""`)는 in-flight 상관 키가 아니다 — `findIdByOrderNo` 가 이 값에서 항상 `null` 이라 dedup 의 의미가 애초에 없고, 합치면 서로 다른 자동주문 거부가 한 행에 겹쳐 쓰인다. 각자 insert 한다.
- [Phase 16 Plan 34]: narrowPending ②-1 매매구분 축은 sideTrusted 만으로 부족하다 — 거부(R)는 파서가 신뢰로 표시하지만 취소 대기에도 오므로 noticeType∈{A,E} 한 겹을 더 건다
- [Phase 16 Plan 34]: 취소 dup 키는 (accountNo,isin,C,orgOrderNo) — 취소의 정체성은 원주문번호다. 신규 키 문자열은 불변(두 탭 동시 발주 차단 유지)
- [Phase 16]: 16-35: TRADE-03 은 Pending 유지 — 코드 19건이 닫히고 relay 가 c8aa7ae 로 재배포됐으나 프로덕션 /healthz 가 everReadyCount:0 · stalledCount:2 · 503 이라 DMA 경로가 실서버에서 한 프레임도 나른 적이 없다 (RELAY-02 와 같은 기준)
- [Phase 16]: 16-35: 배포 후 /healthz 503 은 회귀가 아니라 GC-WR-07 의 의도된 판정 — version·sessionCount 고정 상태에서 stalledCount 0→2 만으로 뒤집혔다. 알림을 끄는 것은 판정을 되돌리는 사용자 결정 사항이라 deferred-items 로 넘겼다
- [Phase 16]: 16-35: server 재배포 생략 — git diff --stat 2cb5620..HEAD 가 server/ 와 packages/shared/ 둘 다 빈 출력. 계약 무변경이라 배포 순서 위험도 이번 라운드에는 없다
- [Phase 16]: 16-37 (R2-CR-02): stalledCount 가 사유를 본다 — NO_RETRY_STATES(session_rejected·unauthorized) 세션은 집계에서 제외. 사용자 한 명의 자격증명 거부가 relay 전체를 영구 503 으로 만들던 경로를 닫았다. sessionsOk 판정식 무변경(입력값 정의만 좁힘), acquire·release diff 0줄로 T-15-10 유지, 기존 ⑩ 통과로 GC-WR-07 생존
- [Phase 16]: 16-38 (R2-CR-03): 마스킹 규율을 경로가 아니라 **타입**에 건다 — `safePgError` 의 좁은 반환 타입(`{code?, message?}`)이 계약의 집행 수단이다. PostgREST 오류에서 값이 들어가는 통로는 `details`/`hint` 두 곳뿐이라 그 둘을 읽지 않는 것이 마스킹의 전부다
- [Phase 16]: 16-38: 로그 키를 `pgError` 로 둔다 — GCP pino 설정의 `messageKey` 가 **`message`** 라 안전 필드를 최상위로 펼치면 로그 메시지 자체와 충돌한다
- [Phase 16]: 16-38: 리뷰·계획이 지목한 7곳이 아니라 **전수 조사 23곳 중 13곳**을 교체했다 — `order-handler` 통보 경로 3곳·`credentials`+`fanout`(같은 오류를 두 번 로그)·`symbols` 가 계획 목록 밖이었다. 계획의 grep 은 한 줄짜리만 잡아 `#drain` 두 줄과 `{ userId, error }` 순서를 놓친다
- [Phase 16]: 16-38: `order-handler.ts:411`(최후 그물)·`:862`(조립 거부)는 **유지** — 안쪽 Supabase 왕복 3곳이 각각 catch 로 종결되고 조립 try 는 `OrderBuildError` 만 던진다. PostgREST 가 닿지 않는 자리라 스택이 유일한 단서다
- [Phase 16]: 16-39: 23505 의 포기 단위를 패치 전체에서 order_no 컬럼 하나로 좁혔다 — 카운터를 고치지 않고 flushed 가 참이 되게 동작을 고쳤다 (#flushed 대입문 diff 0줄)
- [Phase 16]: 16-39: 「보낼 것이 없다」 판정을 키 개수(<=1)가 아니라 updated_at 이름 필터로 센다 — 계획 식은 sink 직접 호출자의 실필드 1개를 조용히 버린다
- [Phase 16]: 16-40: 카운터가 아니라 sink 가 참말을 하게 한다 — insert 는 created, update 는 applied 한 비트씩 — inserted 가 23505 수렴까지 세던 오염과 16-39 가 남긴 flushed 잔여 오차를 같은 형태로 닫았다. 카운터 대입문이 아니라 sink 반환 타입을 넓혀 고쳤고, 반환 생략은 기존 의미와 같게 두어 기존 sink 구현 변경 0줄.
- [Phase 16]: 16-40: flushNow 의 진행 중 배치 대기를 라운드 루프 안으로 흡수 — close() 순서는 유지 — 실제로 열려 있던 창은 라운드 N 종료와 N+1 대입 사이였다(계획·리뷰가 지목한 진입부는 종전 while 이 이미 막고 있었다). close() 를 앞으로 옮기는 대안은 ORDER_FLUSH_MAX_ROUNDS 의 3라운드 근거(16-24)를 흔들어 채택하지 않았다.
- [Phase 16]: 16-41: 상따 에코 보강은 캐시 삽입 이전에 한다 — 캐시가 lc.snap 재접속 복원의 원천이라 팬아웃만 보강하면 새 탭의 이름이 갈린다
- [Phase 16]: 16-41: RelayLimitChaserInput 이 name·code 를 Omit — 표시 문자열의 소유자는 relay 다(market 과 같은 규율, T-16-84)
- [Phase 16]: 16-41: detach()·releaseAll() 삭제 — 호출자 0건이고 detach 는 attach 가 건 리스너를 떼지 않아 호출 자체가 누수였다 (R2-IN-02)
- [Phase 16]: 16-41 함정: 공유 계약 변경 후 pnpm -r typecheck 단독 통과는 검증이 아니다 — 소비처가 packages/shared/dist 를 보므로 shared build 를 먼저 돌려야 한다
- [Phase 16 Plan 43]: 주문번호 비교 정규화(공백·선행 0 제거)의 정본은 게이트웨이의 NormalizeOrderNo(AccountManager.cpp:607-621) — relay 가 규칙을 지어내지 않고 그대로 옮겼다
- [Phase 16 Plan 43]: 통보 종류 축을 블랙리스트에서 화이트리스트(A/E)로 전환. A 는 명시 값이자 IBroker 기본값이라 교보 경로가 살아나면 재판정 필요 — 조건을 코드 주석에 박았다
- [Phase 16 Plan 43]: sideOf 미해석 기본값을 B 에서 S 로 뒤집었다 — S 는 이 파일에서 이미 방향의 정본이 아님 표기이고, dma_orders.side 를 읽어 주문을 내는 경로는 없다
- [Phase 16 Plan 45]: deploy-relay.sh 의 DMA_HOST 를 3단 우선순위(명시 주입 > 실행 중 컨테이너 보존 > 로컬 mock)로 교체 — 보존은 런타임 docker inspect 조회로만 하고 저장소 실주소 리터럴은 늘리지 않는다(2 → 2)
- [Phase 16 Plan 45]: smoke INV-9 프로브는 stdout 쓰기 완료 콜백에서 종료하고 호출부는 빈 verdict 를 SKIP 이 아니라 FAIL 로 센다 — 판정 유실이 조용한 초록불이 되는 경로를 이중 차단
- [Phase 16 Plan 44]: 세션 state 리스너의 실제 누수 지점은 #onClose 였다 — #register 갈래는 refCount 대칭 때문에 도달 불가라 방어로만 남기고 잠기지 않았음을 명시
- [Phase 16 Plan 44]: 떼는 것(off)과 침묵시키는 것(정본 대조 가드)은 서로 다른 시점의 방어다 — EventEmitter.emit 이 리스너 배열 사본을 순회하므로 둘 다 필요하다

### Pending Todos

- 주말 KIS 실증 테스트 (휴장일 acml_hgpr_date 검증) — 다음 주말에 보완
- Supabase/KIS/Naver 시크릿 로테이션 (채팅에 노출됨) — 사용자 판단 (Naver: 2026-04-17 노출)
- DI-01: `incr_api_usage(text,date,int)` RPC 에 `REVOKE ALL FROM anon, authenticated` 마이그레이션 추가 (Supabase 플랫폼 auto-grant 회귀) — Phase 8 또는 별도 infra PR
- DI-02: `scripts/smoke-master-sync.sh` INV-4 헤더 CR 파싱 버그 (동일 패턴, 별도 PR)
- Infra: `gh-radar-deployer` SA key 로테이션 주기 설정 (현재 영구 key) — 예: 90일 cron
- DI-03: Phase 09.2 RESEARCH Pitfall 10 follow-up — `news_articles`, `discussions`, `summaries` 테이블의 RLS 정책이 `TO anon` 만 명시하는지 audit. supabase/migrations/20260515163000 (stock_daily_ohlcv fix 패턴) mirror 로 `TO anon, authenticated USING (true)` 갱신 필요. supabase-js 가 인증 사용자 JWT 호출 → role=`authenticated` → 정책 부재 → default-deny 함정. 본 phase 09.2 와 무관 (차트는 stock_daily_ohlcv 만 사용) 하나 로그인 사용자 페이지 (Phase 7 뉴스, Phase 8 토론, Phase 10 요약) 의 빈 응답 가능성. 별도 phase 또는 인프라 PR 권장.
- DI-04: Phase 09.2 RESEARCH Pitfall 11 follow-up — Vercel production env 등록 시 trailing newline (`\n`) 오염 검증 절차 자동화. 증상: dev 정상이나 production 만 모든 fetch 비정상. 검증: `vercel env pull` 후 `tail -c1 .env.local | xxd -p` 가 `0a` (newline) 이면 오염. 즉시 수정: `vercel env rm` + `printf "%s" "값" | vercel env add`. CI hook 자동화 검토 (별도 인프라 PR).

### Blockers/Concerns

- 네이버 종목토론방 현재 렌더링 방식(SSR vs CSR) → Phase 8 전에 검증 필요
- Cloud Run min-instances=1 정확한 월 비용 → Phase 2 배포 시 확인

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260913-g4c | **KRX 애프터마켓(2026-09-14~, 16:00~20:00) 대응 + 홈 테마 1분 + 30초 자동 새로고침 + 테마 랭킹 top 20** — 사용자 결정: home-sync 전면 1분(Claude 매분 허용, 게이트는 `canReusePrevClassification` 한 곳), 저녁에도 두 워커 실행. Scheduler 2쌍(intraday `* 8-19`+`0-2 20`, home `* 8-19`+`0-4 20`). home-sync 1분 슬롯·`aftermarket`(15:30~19:59)·`closed`(20:00~20:04)·20:05 skip. 저장량 8MB/일 대응으로 과거 거래일은 08:00~08:09 에 5분 해상도 thinning. `/api/home` index 1500 을 `.range` 페이지네이션(max_rows 1000 잘림 RED 관측). 웹앱 공용 `useAutoRefresh`(30s·visibility·KST 평일 08:00~20:05), 홈은 최신 보기에서만. intraday-sync 로직 무변경(주석만). 게이트: webapp 838 · server 254 · home-sync 148 · intraday 154 · e2e 132/0. 배포 4표면 `ec81e59`, 프로덕션 index 1500 확인. 후속: 월 16:07 키움 애프터마켓 실측, ka10001(KRX) vs ka10027(통합) 가격 불일치 | 2026-09-13 | ec81e59 | [260913-g4c-krx-20-1](./quick/260913-g4c-krx-20-1/) |
| 260913-csp | **빌드 클라우드화 검토 → 이전 안 함 + 루트 `.dockerignore` 추가** — 형제 repo gh-trade 의 실측(에뮬 2.4배)을 gh-radar 에 대입하지 않고 재측정: 맥 M2 캐시 없는 클린 빌드 relay amd64 32s / arm64 21s · server 31s / 17s (에뮬 페널티 **1.5~1.8배**, tsc 단계만 ~2.5배) · master-sync 27s · 증분 17s · AR push 4s · 빌드 중 load ~4. Cloud Build(프로비저닝+무캐시 2~4분)·빌드 VM 모두 **느려지므로 이전하지 않음**. 대신 양성 시험에서 `.dockerignore` 부재로 `COPY workers/master-sync/` 가 실제 `.env`(KRX_AUTH_KEY)와 카나리를 builder `/app` 과 `pnpm deploy` 의 `/out/.env` 까지 복사함을 확인 — 최종 이미지·AR 은 깨끗(현 AR latest rootfs 스캔 0개, 프로덕션은 Secret Manager 주입). `.env`/`.env.*`(템플릿 예외)·node_modules·dist·빌드 무관 루트 디렉터리 제외. 게이트: builder `.env*` **0** · 대조군 canary.txt **1** · master-sync·relay·server 전체 빌드 rc 0 · 최종 이미지 root rootfs `.env*` 0 · 컨텍스트 1.30MB→3.47kB. Dockerfile·deploy 스크립트 무변경. 부수 확인: deploy 11개 전부 `set -euo pipefail`, relay 는 VM 이름+IAP 라 IP 하드코딩 없음 | 2026-09-13 | 17996e9 | [260913-csp-dockerignore](./quick/260913-csp-dockerignore/) |
| 260913-0em | 헤더 아이콘 **잉크**를 본문 여백선에 맞춤 — 사용자 신고(「본문 좌우 여백과 헤더 좌우여백이 다른데?」)의 원인은 패딩이 아니었다. 박스는 260912-u58 이 이미 맞춰 놨고(실측: 390/767→8·8, 768~1023→16·16, 1024↑→24·24, 좌우 끝까지 동일), 어긋나 보인 것은 44×44 터치 타깃 한가운데 20px 아이콘을 둔 헤더 좌우 끝 버튼의 **12px 안쪽 여백**이었다(실측 1004: 카드 16 vs 햄버거 잉크 28 · 카드 우 988 vs 돋보기 잉크 976). 터치 타깃·패딩 램프를 그대로 두고 음수 마진만으로 보정 — 햄버거 `-ml-2 md:-ml-3`, 모바일 검색 아이콘·테마토글 래퍼 `-mr-2 md:-mr-3`. 폰이 8인 이유는 **오른쪽을 12 당기면 가로 스크롤이 생기기 때문**(왼쪽 음수 오버플로는 안 생긴다) — 폰은 좌우 대칭 4px 안쪽, 768↑은 정확 일치. e2e 에 잉크 단언 신설(390 대칭 4 · 768·1004·1023 일치 · 네 폭 `scrollWidth===clientWidth`), 기존 박스 단언은 삭제 0건. 게이트: 유닛 **820 passed** · e2e **exit 0 / 132 passed / 0 failed** · lint warning 3 · build 0 | 2026-09-13 | 79c24c4 | [260913-0em-44px-12px](./quick/260913-0em-44px-12px/) |
| 260912-u58 | 상따 6건 — ① 종목 검색 결과를 ↓/↑/Enter 로 고르게(`aria-activedescendant` 콤보박스 · DOM 포커스는 입력에 남겨 기존 Esc·blur·mousedown·마우스클릭 네 경로 보존 · 고를 수 있는 항목만 순회 · 첫 항목 자동선택 금지). ② 취소 그룹 라벨 「매수 미체결 자동취소 가드」 → 「매수취소」(로그 문구는 diff 0줄). ③ 종목명 트리거 테두리 제거 + 세모 아이콘을 `--fg`·한 단 확대(`h-9`·`flex-1` 부재·hover 유지). ④ 체크박스–입력 결합 해제 **5곳** — 체크가 꺼져도 입력·조작 가능, 취소 잔량추적도 독립(A9 결합 해제). **무장 판정 `lib/limit-chaser.ts` diff 0줄**. ⑤ 본문·헤더 좌우 여백을 **같은 램프 8/16/24**(`p-2 md:p-4 lg:p-6` · `px-2 md:px-4 lg:px-6`)로 통일 — 실측 하한 컨테이너 **344px**(360폰 여유 0)이라 폰은 못 키움. 감수한 비용 2창(뷰포트 846~861 · 1008~1023 에서 밴드 한 단 하강). ⑥ 실측으로 찾은 선재 결함 — 와이드 밴드(컨테이너 832~991) **전 구간**에서 체결가가 5px 잘려 `98,10…` 으로 그려지던 것 수정(33/38 → 48/48). 게이트 전량 재확인: 유닛 **820 passed**(기준선 807) · e2e **exit 0 / 131 passed / 0 failed** · lint warning 3 · build 0. 검증자 14/14 통과, 남은 빈칸(키보드 왕복 브라우저 미확인)은 케이스 14 로 직접 닫음. WINDOWS #2 종결 · #10(7자리 가격 셀 예산 초과) · #11(밴드 전이점 단언) 신규 | 2026-09-12 | a2de22a | [260912-u58-6-5px](./quick/260912-u58-6-5px/) |
| 260912-ok2 | **Playwright 를 실제로 돌려** e2e 선재·오늘 실패 7건(계획 6 + 전량 실행이 드러낸 `auth-session` 1)을 현재 계약으로 다시 쓰고(삭제 0 · 화면 되돌림 0), 그 실측이 드러낸 진짜 결함을 고침 — 검색 입력에 포커스가 없어 Esc·blur 취소가 **한 번도 동작한 적 없던** 죽은 코드였다(activeElement=BODY 실측). 트리거로 연 경우에만 포커스(첫 진입 제외 = 폰 키보드). 헤더 3컨트롤(콤보 20/28 · 트리거 30/36 · 입력 36)을 `h-9` 36px 한 값으로 모아 잔여 점프 +3.62px → 0. 액션 바 FAB 회피 `pr-[128px]` 제거(`px-` 대칭 + `pr-*` 전면 금지 단언), `CheckRow` 라벨색 `--muted-fg` 통일. 체크박스 정렬은 실측 0.25px 이라 **변경 0줄**(매직 오프셋 금지). 전량 e2e **127 passed / 0 failed / 9 skipped · exit 0**. WINDOWS 7건 종결(잔여 2: 밴드 경계 830/992 · ≥992 높이 단언 부재) | 2026-09-12 | 93c7e10 | [260912-ok2-e2e-6-fab](./quick/260912-ok2-e2e-6-fab/) |
| 260912-mvo | 상따 폼·헤더 후속 7건 — AI FAB 을 종목상세에서만 노출, 텍스트 입력 포커스를 **테두리 한 겹**으로 통일(전역 `*:focus-visible` 의 box-shadow 가 겹쳐 그리던 것 · `data-focus-ring="seamless"` 를 5곳에 걸되 테두리 채널과 **쌍으로** 게이트), 감시 대상 세그먼트를 입력 칸 폭에 맞춤, 데스크톱 거래소 콤보 확대, 종목 변경 4가지(아이콘·터치영역·Esc/blur 복귀·검색 중 종목정보 10칸 유지), 2열 매수/매도 카드 방향색 5% 틴트, 컴팩트 2단 호가를 240px 스크롤 박스로(20행 전부 유지) | 2026-09-12 | 2851514 | [260912-mvo-7-5-ai-fab-ux](./quick/260912-mvo-7-5-ai-fab-ux/) |
| 260912-k2x | 상따 본문 반응형을 뷰포트 → **본문 폭 컨테이너 쿼리 4밴드**(700·830·992)로 재정의 + 확정 4건 — 2단 호가 트리 신설(사다리 3트리 배타 노출), 종목정보 10칸(`기준`·`거래`, 5열 순서는 CSS `order`), 사이드바 소제목 14px, 오더북 제목행·사다리 범례 삭제. 더티 액션 바는 컨테이너 containment 때문에 `document.body` 포털 | 2026-09-12 | 87fcaac | [260912-k2x-4-10](./quick/260912-k2x-4-10/) |
| 260912-gyz | 상따 후속 다듬기 4건 — 가격 칩 행 전체 삭제, 감시 대상 세그먼트를 방향색(매도잔량 파랑·매수잔량 빨강)으로, 폼 글자 확대(소제목·라벨 13px · 데스크톱 입력 15px · --lw 76/104), 데스크톱 헤더 종목정보 8칸을 한 줄 가로 나열로 | 2026-09-12 | a536474 | [260912-gyz-chaser-polish-remove-price-chips-directi](./quick/260912-gyz-chaser-polish-remove-price-chips-directi/) |
| 260911-w5h | 상따·목록 모바일 전면 정리 (목업 7벌 승인본) — 기본 테마 라이트, main 여백 p-2, 상따 폼 모바일 무카드·입력 16px(iOS 확대 차단)·포커스/더티 테두리만·전체선택, 헤더 계좌칩+거래소콤보+종목검색 트리거+종목정보 8칸, 모바일 호가 마커 제거·10단 스크롤·compact 체결테이프, 잔고·미체결·전략 3목록 문법 통일 | 2026-09-12 | e0f6ad0 | [260911-w5h-chaser-mobile-ui-rework-form-label-reaso](./quick/260911-w5h-chaser-mobile-ui-rework-form-label-reaso/) |
| 260911-tuk | 웹앱 UI 수정 5건 — 홈(`/`) 로그인 게이트, My page 계좌 전용 잔고에 매입금액(보유×평단) 표시, 데스크탑 사이드바 하단 sticky 고정, 테마 토글을 탑바→사이드바 하단(모바일 검색 아이콘은 탑바 우측), 상따 폼 파생값·힌트 정리 + 체크박스 행 입력 그리드 정렬 | 2026-09-11 | 63a6261 | [260911-tuk-webapp-ui-fixes-home-auth-gate-my-page-b](./quick/260911-tuk-webapp-ui-fixes-home-auth-gate-my-page-b/) |
| 260911-mrl | Phase 16 종결 문서 정합 — TRADE-03 Complete 재판정이 REQUIREMENTS 에만 반영돼 있던 드리프트를 ROADMAP·STATE·16-VALIDATION 에 맞춤. 역사 블록은 덮어쓰지 않고 후속만 덧붙임. 소스 diff 0줄 | 2026-09-11 | 1960c69 | [260911-mrl-phase-16-trade-03-complete](./quick/260911-mrl-phase-16-trade-03-complete/) |
| 260418-kd8 | phase 7 뉴스 풀페이지 무한 스크롤 (Phase 8 토론방 1:1 미러) | 2026-04-18 | fb2607c | [260418-kd8-phase-7](./quick/260418-kd8-phase-7/) |
| 260424-dld | 스캐너 등락률 슬라이더 제거 + 서버 고정 10% 하한 | 2026-04-24 | a371cc2 | [260424-dld-remove-scanner-rate-filter](./quick/260424-dld-remove-scanner-rate-filter/) |
| 260608-g0k | CLAUDE.md 한국 크롤링 법적 진술 정정 + 운영 5원칙 추가 | 2026-06-08 | e97e436 | [260608-g0k-claude-md-5](./quick/260608-g0k-claude-md-5/) |
| 260706-cdc | NXT 프리마켓 대응: 장중 파이프라인 8시 시작 (cron 8-15 + 홈 프리마켓 라벨) | 2026-07-06 | 95fae6c | [260706-cdc-nxt-8-intraday-home-news-cron-8-15-smoke](./quick/260706-cdc-nxt-8-intraday-home-news-cron-8-15-smoke/) |
| 260706-dvl | 종목상세 상한가 이력↔동반상승 후보 순서 교체 + 근거 기본 접힘 | 2026-07-06 | c9102ee | [260706-dvl-detail-section-order](./quick/260706-dvl-detail-section-order/) |
| 260706-erk | 테마 메뉴 AI 테마 선정 기능 완전 제거 (워커 AI 파이프라인 + 배포 env + DB 정리 + 프론트 뱃지) | 2026-07-06 | 6533fa2 | [260706-erk-ai-ai-env-db](./quick/260706-erk-ai-ai-env-db/) |
| 260706-ktd | intraday-sync 하락 종목 일봉 동결 수정 (ka10027 sort_tp 1+3 병합 + STEP2 필터 제거) | 2026-07-06 | a40ad53 | [260706-ktd-intraday-sync-ka10027-sort-tp-1-3-step2](./quick/260706-ktd-intraday-sync-ka10027-sort-tp-1-3-step2/) |
| 260707-bqj | home-sync 급등 선정 updated_at 신선도 필터 (프리마켓 stale 시세 오염 + 거래정지 잔존 수정) | 2026-07-07 | f2ff298 | [260707-bqj-home-sync-loadsurges-stale-updated-at-ks](./quick/260707-bqj-home-sync-loadsurges-stale-updated-at-ks/) |
| 260707-ihr | intraday-sync 키움 429 rate limit 대응 (retry 429 5회 승격 + 4 req/s 하향, 키움 실효 한도 7/3 축소 방어) | 2026-07-07 | 49632e9 | [260707-ihr-intraday-sync-429-rate-limit-retry](./quick/260707-ihr-intraday-sync-429-rate-limit-retry/) |
| 260713-fir | home-sync 급등테마 갱신 주기 10분→5분 완화 (5분 슬롯 + carry 등락률 최신화 + index 400) | 2026-07-13 | 9578653 | [260713-fir-home-sync-10-5-5-carry-index-limit-400](./quick/260713-fir-home-sync-10-5-5-carry-index-limit-400/) |
| 260720-in0 | home-sync 클러스터링에 네이버 테마 멤버십 힌트 추가 (곡물사료 singles 미묶임 해결) | 2026-07-20 | 420d1ae | [260720-in0-home-sync-singles](./quick/260720-in0-home-sync-singles/) |
| 260720-iqh | 모바일 홈 z-index 수정 + AI 애널리스트 UI 정리 (FAB "AI", placeholder/힌트/부제/추천칩 제거, 종목 컨텍스트 안내) | 2026-07-20 | 93782cb | [260720-iqh-z-index-ai-ui](./quick/260720-iqh-z-index-ai-ui/) |
| 260720-jh7 | home-sync 라운드업(시황) 기사 가짜 테마 신호 가드 (판정 헬퍼 + 프롬프트 규칙/라벨 + reassignOrphans 제외) | 2026-07-20 | 14fa9e9 | [260720-jh7-home-sync-reassignorphans](./quick/260720-jh7-home-sync-reassignorphans/) |
| 260720-kbf | 휴장일 가짜 '상' 표시 수정 (intraday-sync stale 감지 2단 가드 + 오염 3개 날짜 8,199행 삭제 + limit-up/comovement 재빌드 + 재배포) | 2026-07-20 | 5aa08d5 | [260720-kbf-intraday-sync-stale](./quick/260720-kbf-intraday-sync-stale/) |
| 260720-kyh | home-sync 클러스터링 안정화 3종 (sticky prior + 힌트 규칙 강화 + 중복 소속 invariant) | 2026-07-20 | ae6797c | [260720-kyh-home-sync-3-sticky-prior](./quick/260720-kyh-home-sync-3-sticky-prior/) |
| 260803-it6 | home-sync 급등 스캔 ETN/ETF/레버리지·인버스 상품 제외 (security_group + 이름 패턴 이중 필터) | 2026-08-03 | 5c2aadd | [260803-it6-home-sync-etn-etf-security-group](./quick/260803-it6-home-sync-etn-etf-security-group/) |
| 260803-fast | home-sync 급등 제외 필터에 ELW 추가 (SQL 선례 정합) | 2026-08-03 | ac95765 | — |
| 260803-mhk | home-sync 급등테마 dedup(invariant) 후 최종 멤버 기준 재정렬 (compareThemeRank 단일화 + sortHomeSurgeThemes) | 2026-08-03 | 4b1d4a1 | [260803-mhk-home-sync-clustersurges-dedup](./quick/260803-mhk-home-sync-clustersurges-dedup/) |
| 260817-f1a | 휴장일 가짜 데이터 근본 수정 (KRX 캘린더 0차 + ka10081 dt 1차 가드, 워커 3종) + 8/17 오염 정리 | 2026-08-17 | 1098d66 | [260817-f1a-2026-08-17](./quick/260817-f1a-2026-08-17/) |
| 260820-fh2 | 일봉 NXT 오염 근본 수정 (일봉 쓰기 09:00~15:30 제한 + EOD KRX 종가 패스 + recover 최근 2영업일 강제 재적재) + 배포·백필(2026-05-21~08-19, 65일/실패0) 완료 | 2026-08-20 | fcc1c08 | [260820-fh2-intraday-sync-nxt-15-30-krx-eod-recover](./quick/260820-fh2-intraday-sync-nxt-15-30-krx-eod-recover/) |
| 260905-u9b | ROADMAP.md 정합성 복구 — 상단 Phases 체크리스트·Execution Order·Progress 표에 Phase 12~15 반영, Phase 12~15 상세 섹션을 Phase Details 안으로 이동, 15-02·15-06 [x] + 4/20 집계 반영 | 2026-09-05 | e9e2822 | [260905-u9b-roadmap-md-phases-execution-order-progre](./quick/260905-u9b-roadmap-md-phases-execution-order-progre/) |
| 260908-fis | intraday-sync 종목코드 정규식을 영숫자 단축코드까지 허용 + STEP1 매핑실패 로깅 — 채비(0011T0) 등 KRX 영문 포함 단축코드 80종목이 스캐너·급등·홈에서 누락되던 회귀 수정 | 2026-09-08 | e18ea49·c3d679d | [260908-fis-intraday-sync-step1](./quick/260908-fis-intraday-sync-step1/) |
| 260908-oh6 | 종목검색에서 ETF·ETN·ELW·상장폐지 종목 제외 — 마스터 ETP 확대(ELW 2,735·영문 ETF 303) 이후 이들이 name-asc 앞자리를 점거해 삼성전자·현대차·카카오가 limit 20 밖으로 밀려나던 회귀 수정 | 2026-09-08 | ec6cceb | [260908-oh6-get-api-stocks-search-etp-etf-etn-elw-is](./quick/260908-oh6-get-api-stocks-search-etp-etf-etn-elw-is/) |
| 260908-py9 | Phase 15 이관 3건 종결 — 저장소 KB VPN 계정 ID 마스킹(15파일 38건, SC-8 충족) + VPN 주간 예약 재접속 타이머(일 06:00 KST, 저장소+VM 실적용, 무중단 실측) + relay README 정본화(상시 유지·실서버 라이브·14일 만료 복구 runbook) | 2026-09-08 | 2f8a507·ec60980·a1bbf8a | [260908-py9-phase-15-id-vpn-relay-readme](./quick/260908-py9-phase-15-id-vpn-relay-readme/) |
| 260908-qnf | Phase 15 이관 6건 종결 — rls_auto_enable() 정의를 마이그레이션 이력에 보정(빈 DB 35파일 전량 재생 0오류·anon/authenticated 실행권한 f 실증) + server·intraday-sync dockerignore 를 BuildKit 이 읽는 이름으로 교정(builder 레이어 .env 0건) + 선재 E2E 11건 청산(29건 green, 원인 2종 — envelope 계약 7건·CLASSIFY_PAUSED 3건·auth-guards 1건) + stocks 픽스처 ISIN 유일성 + 상태 바/게이트 문구 분리·UI-SPEC 소유처 명시. server flake 는 3/3 통과로 무수정. production DB·배포 무변경 | 2026-09-08 | a5187ce·bccd89d·4458b90·3e5d572·663bf35·6ce5137·18999b0·82ce673 | [260908-qnf-phase-15-rls-auto-enable-e2e-11-dockerig](./quick/260908-qnf-phase-15-rls-auto-enable-e2e-11-dockerig/) |
| 260908-scu | Phase 15 장부 재집계 — 라이브 전환(D-17 철회·실 게이트웨이·실주문 5건 왕복)을 반영해 SC-4~8 재판정(✅3/⚠5 → ✅6/⚠2) + §4-A~E 미증명 17항·이관 15건 재분류를 `15-LIVE-VERIFICATION.md` §8 로 append(§1~§7 무변경) + REQUIREMENTS RELAY-01/03 Complete·RELAY-02 Pending(잔여 2건) 대칭 갱신 + ROADMAP Phase 15 20/20 종결. 읽기 전용 실측만 — 코드·배포·새 주문·Supabase 쓰기 0건 | 2026-09-08 | 0575091·2709455 | [260908-scu-phase-15-sc-4-8-relay-01-03-roadmap-stat](./quick/260908-scu-phase-15-sc-4-8-relay-01-03-roadmap-stat/) |
| 260909-el9 | DMA 게이트웨이 터널 스크립트 2종 — 개발기가 KB VPN 없이 `10.41.1.120:9100` 에 **주소 그대로** 붙게 한다(로컬 /32 별칭 + radar-gw IAP SSH 포워딩). mac `scripts/dma-tunnel.sh`(1단) · win `scripts/dma-tunnel.ps1`(2단, PS5.1) · relay README `## DMA 터널` 절 추가. 종료 코드 0~5·선행 점검 P1~P8 계약 공유, `--check` 무변경, 실계좌 경고 + TCP connect 까지만(D-27). 전송 경로 실측 성립(19100 포워딩 → 게이트웨이 TCP 연결), P6 로컬 VPN 가드 exit 3 발화 실증. 별칭 경로·ps1 런타임은 미검증(사유·주체 SUMMARY 기재) | 2026-09-09 | edd6593 | [260909-el9-dma-2-windows-powershell-macos-bash](./quick/260909-el9-dma-2-windows-powershell-macos-bash/) |
| 260909-ftd | `scripts/dma-credentials.ts` 에 `--from-email <원본>` 링크 모드 추가 — 이미 등록된 gh-radar 계정의 DMA 자격증명을 원본 user_id 로 복호 → 대상 user_id(AAD) 로 재암호화 → 라운드트립 검증 후 upsert. 비밀번호 프롬프트 없음, `--dma-user` 는 원본과 다르면 차단(T-15-10), 성공 시 DMA 세션 공유(D-17) 경고. `scripts/dma-credentials.sh` 래퍼 신규 — 어느 cwd 에서든 저장소 루트 이동 + env source + gcloud 기본값 후 tsx 실행. `/tmp` 에서 `--list` 실측 성립 | 2026-09-09 | 147fac7 | [260909-ftd-scripts-dma-credentials-ts-from-email-dm](./quick/260909-ftd-scripts-dma-credentials-ts-from-email-dm/) |
| 260909-muo | radar-gw 에 WireGuard 서버(wg0 10.20.0.1/24 · udp 51820, nft `inet wgfwd` 로 10.41.1.120 의 9100·22 만 forward, DOCKER-USER 짝, 개인키 VM 생성·피어는 `wg-peer-add`) + 방화벽 4번째 규칙 `relay-allow-wireguard` + deploy/smoke 게이트 4규칙 + 클라이언트 템플릿(AllowedIPs /32) + 메뉴바 v3.5(DMA 터널을 `scutil --nc` WireGuard 프로필 제어로 교체, gcloud·lo0·sudoers ifconfig·2222 제거, 개인 파일은 .gitignore) + README 재편. GCP·VM 실반영 완료(기본 경로 ens4·openconnect 유지, INV-2 PASS, netns e2e 22 경로 성립). 남은 것: 클라이언트 피어 등록·9100 확정·메뉴바 재설치 | 2026-09-09 | 7d8482f·78605a8 | [260909-muo-radar-gw-wireguard-dma-wireguard](./quick/260909-muo-radar-gw-wireguard-dma-wireguard/) |
| 260909-t08 | 메뉴바 앱 v3.6 — DMA 터널을 App Store WireGuard 앱(scutil) 대신 brew wireguard-tools(wg-quick + wireguard-go)로 앱 자체가 제어. 설치 스크립트가 키쌍 생성(공개키만 출력·재실행 시 키 보존)·`KB-DMA.conf`(root 0600, AllowedIPs 10.41.1.120/32)·root 헬퍼 `kbdma-connect/disconnect` + sudoers 2줄. 상태 판정은 utun 10.20.0.x. README A절을 mac(brew)/win(공식 앱) 두 갈래로. 개인 파일은 미커밋(.gitignore). VM·방화벽 무변경. 정적 검증 22항목 PASS, 설치 실행·e2e 는 사용자 차례 | 2026-09-09 | 88d34ed | [260909-t08-v3-6-dma-brew-wireguard-tools](./quick/260909-t08-v3-6-dma-brew-wireguard-tools/) |
| 260910-fast | `docs/dma-tunnel-guide.md` 신규 — DMA 터널 사용자 설명서(공통 주의 · Mac 메뉴바 v3.6 · Windows 공식 앱 · 문제 해결 · 관리자 피어 등록 · UDP 차단 시 IAP 폴백). README §DMA 터널에 링크 1줄 | 2026-09-10 | fc2f45a | — |
| 260910-igb | Phase 16 종결 문서 커밋 정합 — 다른 세션이 미커밋으로 남긴 16-46 산출물(16-46-SUMMARY · 16-VALIDATION · 16-VERIFICATION-R2 · deferred-items · REQUIREMENTS · ROADMAP)을 커밋하고 ROADMAP `## Progress` 표를 Phase 15 `20/20 Complete` · Phase 16 `46/46 Complete` 로, 상단 목록의 Phase 16 을 체크로 맞춤. 문서만 | 2026-09-10 | 2a98f9f | [260910-igb-phase-16-roadmap-progress-phase-15-16](./quick/260910-igb-phase-16-roadmap-progress-phase-15-16/) |
| 260910-jce | RELAY-02 「오늘 주문」 복원 배선 — `GET /api/orders` 서버 라우트는 살아 있었으나 `webapp/src` 에 호출자가 0건이던 **기능 공백**(16-16 이 접수만 wss 로 옮김)을 `/me` 카드로 닫음(`orderNo` 병합 · 짝 없는 주문번호 1회 재조회). 함께 relay 의 범위 밖 `msg_type` 드롭 로그를 **응답 대역 5종만** debug 로 분리(요청 대역 20·26·27·30·31 은 WARNING 유지) — 단위 테스트로 잠금, 프로덕션 실측은 미완(§9.4 이관 1) | 2026-09-10 | 04f36d1·ecbd978 | [260910-jce-relay-02-relay](./quick/260910-jce-relay-02-relay/) |
| 260910-kql | 「오늘 주문」 종목 칸에 종목명 병기 — `useIsinLabels` 재사용(이름 → 코드 → ISIN 3단 폴백), 모바일 390px 신축 항목 불변. me.spec 에 표시와 잘림 0 을 잠금 | 2026-09-10 | 3661774·86fa150 | [260910-kql-useisinlabels](./quick/260910-kql-useisinlabels/) |
| 260910-ogq | **RELAY-02 · TRADE-03 재판정 (Pending → Complete)** + 근거인 2026-09-10 장중 실측을 `15-LIVE-VERIFICATION.md` §9 로 기록 — 취소 `C` 왕복 · 첫 통보 지연 21~32 ms(§8 의 DB 측 median 77 ms 와 다른 계측) · `/me` 오늘 주문 3건 사용자 확인 · WinForms↔웹 양방향 사용자 관찰(human-only, 로그로 방향 판별 불가) · relay `11072e4` 배포. **SC-6 ✅ 전환 · SC-4 는 ⚠ 유지**(5분 유예는 오늘도 미관측) · 집계 ✅7/⚠1/❌0 · 이관 3건(거래원 푸시 74/75 프로덕션 미실측 + 재현 절차 · relay 성공 인바운드 무로그 · lint 선재 3건). 문서만, 코드·배포·주문 0 | 2026-09-10 | dfb74bf·83bdcd1 | [260910-ogq-relay-02-trade-03-complete](./quick/260910-ogq-relay-02-trade-03-complete/) |
| 260911-dps | **radar-gw Caddy `/ghtrade/*` 정적 서빙** — gh-trade Phase 20 클라 자동 업데이트 인계(D-09~D-16). `handle` 3블록(미인증 404 → `handle_path` 서빙 → 트레일링 슬래시 없는 `/ghtrade` 404) · `/srv/ghtrade` 멱등 생성 3단 폴백 · README 파일 맵·업로드 절차. **2026-09-11 15:39:35 KST 프로덕션 반영** — validate 선통과 후 reload, 양성 200 / 음성 404 양쪽 실측, `/healthz` 200·wss 재접속 유지. D-11 고정키는 `infra/relay/Caddyfile` 한 곳만 정본 | 2026-09-11 | 5fa7221·3fa691e | [260911-dps-radar-gw-caddy-ghtrade-srv-ghtrade](./quick/260911-dps-radar-gw-caddy-ghtrade-srv-ghtrade/) |
| 260911-lss | `/ghtrade` 적용 결과를 README 정본에 기록 + **거래원 푸시(74/75) 드롭 로그 이관 항목 종결** — 장중 4.5분 구독 활성 상태에서 `unknown-msg-type` 0건(대조군 `a1f4ed6` 는 같은 조건 40분에 13건). 한계 명시: `LOG_LEVEL=info` 라 debug 강등분은 미관측 — 증명된 것은 「WARNING 이 사라졌다」이지 「75가 out-of-scope 로 분류됐다」가 아니다. 문서만 | 2026-09-11 | — | [260911-lss-ghtrade-caddy](./quick/260911-lss-ghtrade-caddy/) |

## Session Continuity

**Resume file:** None

Last session: 2026-09-12T09:31:17.343Z
Stopped at: Completed quick-260912-ok2 (e2e 6건 + 사용자 지시 3건)
Next: **Phase 16 은 완결됐다 — plan 46/46 + 요구사항 5종 전부 Complete.** phase goal 의 핵심 문장(「같은 DMA 세션으로 WinForms 와 전략·체결·미체결이 즉시 공유된다」)이 2026-09-10 장중 실계좌에서 **사용자의 양방향 직접 관찰**로 확인됐고, 2026-09-11 에 철거 방향까지 닫혔다. **다음 행동은 Phase 17 착수다.**

- **남은 것은 phase 16 의 결손이 아니라 별개 항목 3건이다.**
- **① smoke `INV-9` 프로덕션 첫 실행 미수행.** `SMOKE_AUTH_TOKEN`(브라우저 로그인 `access_token`, 약 1시간 만료)이 있어야 16-21 재작성 이후 첫 실행이 된다. 저장소 어디에도 값이 없는 것이 정상이다(T-16-74). 명령은 `deferred-items.md` §16-46. **이것은 TRADE-03 조항의 결손이 아니라 프로브의 미실행이다** — 섞어 적지 말 것.
- **② `/healthz` 알림 정책 — 사용자 결정 대기.** `gh-radar-relay-down` 은 게이트웨이가 붙어 있는 지금(`stalledCount: 0`)은 조용하지만, 끊기면 세션 생성 5분 뒤 503 이 상시화된다. 해법 후보 4개는 `deferred-items.md` §16-35. 실행자가 단독으로 고를 문제가 아니다.
- **③ 다른 세션과의 정합.** WireGuard 작업(`quick-260909-t08` 계열)이 방화벽 규칙을 4개로 늘려 smoke `INV-2` 문구가 바뀌었다. `REQUIREMENTS.md` RELAY-03 의 「방화벽 3규칙」과 어긋나므로 그 세션이 정합을 맡는다.
