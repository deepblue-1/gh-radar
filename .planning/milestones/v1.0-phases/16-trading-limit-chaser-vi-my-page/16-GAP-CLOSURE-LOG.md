# Phase 16 갭 클로징 이력

출처: `.planning/STATE.md` 에서 2026-09-24 이관(quick-260924-blo) — 아래 4개 절은 원문 그대로다.
Phase 16 갭 클로징 1~3라운드(16-18~16-46)와 DMA_HOST 배포 회귀의 진행·판정 기록. 처리 결과 정본은 `16-VALIDATION.md` §Gap Closure 표다.

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
