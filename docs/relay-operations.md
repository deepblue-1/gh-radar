# relay 운영 지식 (Phase 17)

출처: `.planning/STATE.md` §「Phase 17 이 남긴 재사용 가능한 사실 (2026-09-20)」에서 2026-09-24 이관(quick-260924-blo) — 본문은 원문 그대로다.

- **생성물 재동기화는 `RELAY=` 가 필수다.** `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh [--check]`. 기본값이 메인 체크아웃이라 worktree 에서 빼먹으면 엉뚱한 트리를 고친다. 스크립트 소유자는 **gh-trade** 이고 flatc 는 **25.12.19** 고정. `relay/src/generated/**` 손편집 금지 — `--check` 차이 0 이 그 증거다.
- **`INBOUND_MSG_TYPES` 한 줄과 hub 명시 `case` 는 언제나 같은 커밋에서 자란다.** 번호만 먼저 넣으면 그 사이 빌드에서 프레임이 `default:` 로 조용히 떨어진다(PC-12). 더 나아가 **의도적으로 무시하는 번호에도 명시 `case`** 를 준다 — `default:` 에 맡기면 `unhandledFrameCount()` 계수기가 의도된 무시를 함께 세어 진짜 위반을 가린다(17-03).
- **21 `GetVITriggerReq` 는 요청 거래소 FIFO 로 귀속한다.** 빈 61 응답은 거래소를 담지 않으므로 KRX·NXT 2회 요청의 **순서**로만 귀속하고, 귀속할 근거가 없으면 **캐시를 고치지 않는다**(지어낸 귀속은 틀린 칸의 사용자 입력을 지운다). 본문 있는 61 은 본문이 정본이고 FIFO 는 head 와 일치할 때만 소비한다. 구현 `relay/src/hub/subscription-hub.ts` `#pendingViGets`, 상수 `VI_PREFETCH_EXCHANGES` (17-05).
- **LED 판정 순수함수: `webapp/src/components/trading/latch-led.tsx` 의 `latchLedStateOf(kind, server)`.** 색·클릭 가능·라벨·툴팁을 **한 식**으로 정한다. 입력은 마지막 서버 에코 스냅샷 1건뿐 — 폼 더티값도 LED 색도 읽지 않는다. 취소 무장은 `cancelQtyEnabled || cancelTradeEnabled` 이고 **`cancelQtyTrackEnabled` 는 본문에서 주석으로도 언급하지 않는다**(봉인 게이트가 본문 grep 0). 매수는 `buyWatchSide !== "1"` 이면 초록 2단계·클릭 불가 (17-07 / 17-11).
- **통보 묶기 순수함수: `webapp/src/lib/order-notices.ts` 의 `mergeOrderNotices(rows, windowMs = 3000)` · `mergeKeyOf(row)`.** 3초 창 기준은 **그 묶음의 첫 통보 시각** 고정(슬라이딩이면 한 행이 무한히 큰다). 자동주문 체결 + 자동주문 **매도 접수만** 묶고 매수 접수·거부·취소·정정·수동·주체 미상은 묶지 않는다. 묶인 행의 가격은 합계가 아니라 **범위(min~max)** 다. 같은 파일의 `orderActionWord`/`orderActionSide`/`orderNoticeLabel` 은 **인자에 문구 키가 아예 없어** 문구 파싱이 구조적으로 불가능하다 (17-10).
- **표시 문자열의 주인은 shared 순수함수 하나다.** `packages/shared/src/strategy-display.ts` 의 `sideDisplayText(side, orderNo, pendingStatus, board)` — 접미는 **배타가 아니라 누적**이다(Q-ID ∧ 접수대기 ∧ 시간외종가 = `매수QP/종가`, C# `NotificationHub.cs:172` 정본, 사용자 확정). 같은 파일의 `serverMsgBadge(src)` 는 **동등 비교만** — `includes`/정규식은 서버 어휘가 늘면 조용히 깨진다 (17-01 / 17-09).
- **취소 제외의 유일 근거는 `pendingCancelSent` bool 하나다.** `pendingStatus` 문구 비교 금지(두 소비처 `account-panel.tsx`·`vi-client.tsx` 에 조건식 0건이 게이트). 서버가 브로커 앞에서 R 로 답하므로 relay `order.cancel` 은 그 행을 **거부하지 않는다** — 화면이 버튼을 감추는 것으로 충분 (17-02 / 17-09).
- **`0` 은 권위값이지 「모른다」가 아니다.** `RelayQuote.kc`(KRX 정규장 종가)가 `0` 이면 종전 표기, `> 0` 이면 `종가`. **벽시계로 판정하지 않는다** — `stock-orderbook-section.tsx` 의 `new Date(` grep 0 이 그 게이트다. 스냅샷 props 폴백도 금지(서버의 「아니다」가 「모른다」로 퇴행한다) (17-08 / 17-11).
- **★ 낡은 `packages/shared/dist` 가 typecheck 를 통과시킨다.** 계약을 바꿨으면 `pnpm --filter @gh-radar/shared build` **먼저** — 안 그러면 소비처 타입 체크가 옛 dist 를 보고 초록이 된다(Phase 16 에서 실제로 데였고 Phase 17 에서도 같은 순서를 지켰다).
- **★ gh-trade mock 게이트웨이를 띄우려면 macOS 툴체인이 살아 있어야 한다.** `server/scripts/build.sh --server-only` 는 Homebrew `g++-15` 를 쓰지만 macOS SDK 를 거치므로 **Xcode 라이선스 미동의면 전부 막힌다**(`clang`·`xcrun`·`strings` 까지). Xcode 를 올린 뒤에는 `sudo xcodebuild -license` 를 먼저 하라. **그리고 `server/build/` 의 낡은 바이너리를 「HEAD」로 착각하지 마라** — 2026-09-20 에 거기 있던 빌드는 2026-09-13 자였고 78·36·37·38·`krx_close_price`·`request_kind` 가 전부 없었다. 바이너리 실사는 `python3` 바이트 카운트로 한다(`strings` 는 Xcode 게이트에 걸려 **0 을 거짓으로 돌려준다**).

## 관찰자 기록 연결 (Phase 19)

주문 기록(주문 내역 · 체결 · 자동주문 기록)의 **유일한 기록 경로**다. relay 가 부팅 즉시 게이트웨이에 관찰자 연결 1개를 열고
(사용자 접속·장 시간과 무관 — D-13), 게이트웨이 저널을 받아 Supabase `dma_journal_apply` 로 적용한다. 사용자 세션 경로는
DB 에 쓰지 않는다(D-01). 결선은 `relay/src/index.ts`, 모듈은 `relay/src/journal/*`.

- **커서와 epoch.** 커서 `dma_journal_cursor(gateway, journal_epoch, last_seq, updated_at)` 는 게이트웨이(`KB`)당 1행이다.
  relay 는 로그인 **전에** 커서를 읽어 `since_seq = last_seq` · `epoch` 로 로그인한다(그래서 게이트웨이 키는 로그인 응답이 아니라
  relay 설정 `DMA_BROKER`, 기본 `KB` 다). epoch 는 게이트웨이 저널 저장소의 세대 — 저장소가 초기화되면 바뀐다. seq 는 epoch
  안에서 1씩 증가한다. 커서 조회: `select * from dma_journal_cursor;`
- **유실 0 · 이중 적용 0 의 근거.** 커서는 적용 RPC **트랜잭션 안에서만** 전진한다. relay 가 죽거나 종료 drain(2초)을 못 끝내도
  다음 부팅이 커서부터 재생하고, 겹친 재생은 이벤트 PK `(gateway, journal_epoch, seq)` 가 흡수한다. 적용 RPC 가 실패하는 동안에는
  같은 배치를 재시도하고 커서도 멈춘다(연속 3회면 healthz `journal.state = db_error`). 투영 실패 이벤트는
  `dma_journal_events.apply_error` 에 사유가 남고 커서는 계속 간다(포이즌 격리).
- **resync 로그.** `[journal] 저널 재동기화 — epoch 변경 또는 보관 범위 밖`(error)은 게이트웨이가 「since 로 이어받을 수 없다」고
  답했다는 뜻이다 — epoch 가 바뀌었거나 since 가 보관분(당일+전일)보다 오래됐다. relay 는 새 epoch 첫 레코드부터 받는다.
  같은 날 여러 번 보이면 게이트웨이 저널 저장소가 흔들리는 것이니 gh-trade 쪽 로그를 본다.
- **seq 역행 신호.** `[JOURNAL] 저널 seq 역행 — 같은 epoch 인데 게이트웨이 head 가 받은 seq 보다 작다`(error) + healthz
  `journal.seqRegressions`(부팅 뒤 횟수) · `journal.lastSeqRegressionAgeSec`. 게이트웨이가 같은 epoch 를 되살렸지만 최신 날짜 파일을
  잃은 경우다. relay 는 `resync` 값과 무관하게 **마지막 수신 seq 를 유지**하고 곧바로 live 가 된다 — gh-trade 는 이때 다음 seq 를
  `since+1` 로 올리기로 했다(Phase 23 합의). 비우면 1..head 재생 → since+1 → 갭 → 재접속이 끝없이 반복된다. **503 은 아니다**
  (스트림은 정상). 보이면 게이트웨이의 잃은 구간(head+1..since)이 DB 에는 있고 게이트웨이에는 없는 상태이니 gh-trade 에 알리고,
  게이트웨이가 그 구간 seq 를 **다시 쓰지 않는지**(since+1 부터 이어지는지) 확인한다 — 다시 쓰면 relay 는 중복으로 보고 건너뛴다.
- **로그인 거부 = 재시작 전 복구 없음.** 게이트웨이가 관찰자 로그인을 거부하면(`[JOURNAL] 관찰자 로그인 거부 — 재접속 중단`)
  relay 는 재접속을 멈추고 `rejected` 로 굳는다(계정 잠금·로그 폭주 방지 — D-13 · T-19-28). 원인은 거의 항상 비밀 불일치다.
  두 값을 맞춘 뒤 **relay 를 재배포(또는 컨테이너 재시작)** 해야 풀린다. 게이트웨이만 재시작해서는 안 풀린다.
  비밀 주입·순환 절차는 `infra/relay/README.md` §Secret 4종 값 주입(순서: 게이트웨이 재시작 → relay 재배포).
- **알림.** 장중(평일 08:00~20:00 KST · 휴장일 제외)에 `rejected` 는 즉시, 그 밖의 비-live 는 180초 뒤 `/healthz` 503 → 기존 uptime
  `gh-radar-relay-healthz` · 정책 `gh-radar-relay-down`(≈ 3분 + 5분 창). 장 밖에서는 200 이고 본문 `journal` 에만 드러난다.
  대응표는 `ops/alert-relay-down.yaml` 8번. relay 로그는 Cloud Logging 에 없다 — `sudo docker logs gh-radar-relay 2>&1 | grep -E '\[JOURNAL\]|\[journal\]'`.
- **전환 순서 (D-14, 20:00 이후 · 사용자 승인).** ① DB 마이그레이션(추가 전용) → ② 관찰자 비밀 두 곳 → ③ gh-trade 게이트웨이 배포 ·
  재시작(관찰자 지원판) → ④ relay 배포(`git status -sb` 재확인 — 메인 체크아웃 HEAD/작업 트리를 빌드한다) → 검증(`journal.state` live ·
  `dma_account_access` 행 수 · 커서 행) → ⑤ server 배포 → ⑥ webapp push(= Vercel 프로덕션). 게이트웨이가 relay 보다 먼저여야 한다 —
  관찰자를 모르는 옛 게이트웨이에 새 relay 가 붙으면 로그인 응답 타임아웃이 반복된다(장 밖이라 503 은 아니지만 기록은 0).
- **롤백.** relay 는 `bash scripts/deploy-relay.sh --rollback <이전 태그>` — 이전 relay 는 사용자 세션 경로로 `dma_orders` 를 다시 쓴다
  (동결 해제 = 수용 가능한 롤백 상태). 배포 스크립트의 비밀 사전 검사는 롤백에도 4종을 요구하므로 관찰자 비밀은 지우지 않는다(옛
  이미지는 그 env 를 무시한다). server 는 이전 revision, webapp 은 Vercel 이전 배포 승격. DB 는 추가 전용이라 롤백하지 않는다.
