# Phase 40: 체결 앱 푸시 알림 - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

주문이 움직이면 창을 안 보고 있어도 GH Trade 앱(iOS · Android)으로 **짧은 푸시**가 온다. 송신 지점은 relay 의 저널 적용 결과(`writer.on("applied")` · [relay/src/index.ts](relay/src/index.ts) `wirePipeline`) — 주문·판정 로직(order-api · 전략 · gh-trade 서버)은 무변경이고 보내기 실패는 주문에 영향 없다. 계좌→사용자는 기존 `accountsOf` · `userIdOf`(AppAccess). 송신은 **iOS APNs 직접**(HTTP/2 · .p8 · Secret Manager · 앱에 Firebase iOS SDK 없음) · **Android FCM HTTP v1**(기존 Firebase 프로젝트 `gh-radar` · VM 서비스계정 역할로 키 파일 없이). 앱은 `@capacitor/push-notifications` 8.x · iOS Push capability · Android `google-services.json` + Firebase Messaging — **D-17(앱 안 Firebase 없음) 번복은 Android 만**(`.gitignore` · 위생 검사 (8) · Gradle 조정 · 양 플랫폼 `native:release`). 웹은 `/me` 설정 탭에 기기 알림 토글(서버 저장) + 등록 기기 목록. DB 는 기기 토큰 · 알림 설정 · **송신 로그(주문 체인 · 단계 멱등)** — WR-09 응답 유실 재시도와 relay 재기동 커서 재생이 있어 중복 송신 방지가 필수다. 비용 0원.

**로드맵에서 이미 잠긴 것(재론 금지):** relay applied 훅 송신 · APNs 직접 / FCM v1 · 기존 Firebase 프로젝트 · 토글 서버 저장 · 송신 로그 멱등 · 탭하면 주문로그 · 푸시 본문에 계좌번호 원문 없음(T-19-14 동형) · 텔레그램/카카오 기각(트렐로 yP2Q3UkZ 검토 2026-11-06).

**밖:** 시세 이벤트 알림(상한가 노출 · 진입 · 버스트 · 상한가 특징 · 매집감지) · 상태전이(kind 9) 푸시 · 세션/게이트웨이 끊김 알림(`/healthz` 운영 감시) · 웹 브라우저 Web Push · Play 스토어 배포.

</domain>

<decisions>
## Implementation Decisions

### 보내는 사건 범위 (D-01 ~ D-06)
- **D-01: 보내는 사건은 7종.** 주문 1건(정정 체인 포함 · D-10)당 ① 접수(거래소 접수 확인) ② 첫 체결 ③ 전량 체결 ④ 신규 주문 거부 ⑤ 서버 자동 취소 — 그리고 자동매도는 ⑥ 시작(그룹 9 발동 · kind 11) ⑦ 완료(보유 0). 사용자가 「주문 관련 사건 전부 표로 정리」를 요구해 18종을 검토한 결과다. — **Reversibility:** reversible.
- **D-02: 안 보내는 것.** 중간 부분 체결(2번째~n-1번째 조각 · 버스트는 한 주문이라 묶임) · 내가 누른 수동 취소(CancelReason 1) · 정정 확인 · 정정/취소 **요청** 거부(원주문 그대로) · 전략 발주 이벤트(접수 확인으로 대체) · 자동매도 주문 자체의 첫/전량 체결(⑥·⑦로 대체) · 자동매도 정정(kind 12) · 상태 변화(kind 13).
- **D-03: 접수 푸시의 「무엇 때문에 나간 주문인지」 = 구분만.** 주문로그 「구분」 칸 낱말 그대로(`ORDER_GROUP_LABELS` — 선매수 · 줄매수 · 후매수 · 호가매도 · 체결매도 · 체결훅 · 수동 · VI · 자동매도). 조건·사유 문구(스윕호가변경 ≥ 3 등)는 넣지 않는다 — 탭해서 주문로그에서 본다. 수동 주문(7)도 접수 푸시를 보낸다. 저널 행에는 `origin`(manual/limit_chaser/vi)만 있으므로 구분은 **전략 발주 이벤트(kind 3 · group)와 짝지어** 채운다(짝 방식은 리서치 — 짝이 없으면 origin 으로 「수동」/「VI」/「상따」 수준 폴백).
- **D-04: 거부(④)는 게이트웨이 사유 문구 원문(`message`)을 본문에 싣는다** — 토스트 T-pgu-01 과 같은 규칙(텍스트 노드 · 문장 조립 없음). 서버 자동 취소(⑤)는 `CANCEL_REASON_LABELS` 낱말(이탈 매도 · 매수1 이탈 · VI 감시 · 거래소 취소 · 마감 정리 · 체결 감시 · 재취소 · 기타 · 매수 우선 취소 · 동시호가 감축 · 버스트 상한가)과 취소된 잔량을 싣는다. 부분 체결 뒤 잔량이 서버 취소로 끝난 경우도 ⑤ 1건(「잔량 N주 취소」).
- **D-05: 자동매도 「완료」 = 그 계좌 · 그 종목 보유 수량 0.** 자동매도 주문 미체결 0 이 아니다. 중간에 취소만 되고 보유가 남으면 완료 푸시는 없다(자동매도 상태 「완료」 동형). 보유 0 판정 원천(저널 체결 누적 vs 잔고 에코 vs kind 13 상태 「완료」)은 리서치가 정한다. 본문은 매도 수량 · 평균가 · 손익 %(스케치 029 C).
- **D-06: 범위는 그 사용자가 볼 수 있는 계좌의 주문 전부**(공유 계좌의 다른 사용자 주문 포함 — 웹 토스트 · 주문로그 가시성과 같은 범위 · `AppAccess` 매핑). 토글이 꺼진 기기 · 다른 사용자 계좌는 오지 않는다(성공 기준 4).

### 첫/전량 판정 · 멱등 · 재생 (D-07 ~ D-11)
- **D-07: 직전 상태는 DB 가 기억한다.** 적용 RPC 가 이전 `filled_qty` · `status` 를 함께 돌려주거나, 주문 체인별 「보낸 단계」 표(송신 로그와 한 곳)에 기록해 판정한다. relay 메모리 방식 기각(재기동 직후 직전 상태가 비어 첫 배치를 송신 로그로만 거른다). 왕복 1회 추가는 받아들인다 — Cloud Run 왕복 비용 메모리에 따라 판정·기록·멱등 확인을 **RPC 1회**로 묶는다. — **Reversibility:** costly — 송신 로그 · 단계 표 스키마가 relay 송신기와 짝이라 바꾸면 양쪽 재작업.
- **D-08: 접수 푸시는 거래소 접수 확인(저널 `accepted`) 때 보낸다.** 서버 발주(kind 3) 때가 아니다 — 거부된 주문은 접수 푸시 없이 거부 1건만. 구분은 D-03 의 짝으로 채운다.
- **D-09: 한 적용 묶음에 같은 주문의 여러 단계가 들어오면 마지막 상태 1건만 보낸다.** 접수→첫 체결→전량이 한 묶음이면 「전량 체결」 1건. 재생(커서 재생 · WR-09 재시도)도 같은 규칙 — 송신 로그가 「이미 보낸 단계 이상」이면 건너뛴다. 첫 체결에 다 찼으면 ②는 생략되고 ③만(로드맵).
- **D-10: 정정 체인은 한 주문으로 센다.** 원주문 → 정정주문(새 주문번호 · `orgOrderNo`)을 한 체인으로 보고 접수 1 · 첫 체결 1 · 전량 1. 정정마다 「접수」 「첫 체결」이 다시 울리지 않는다. 체인 키(원주문번호 루트)는 리서치가 저널 `org_order_no` 관계로 정한다.
- **D-11: 늦게 재생된 사건은 당일(KST 거래일 오늘) 안이면 보내고, 지난 날 것은 버린다**(송신 로그에 「늦어 버림」 기록). N분 컷 기각 · 무조건 보냄 기각.

### 설정 단위 · 기기 토큰 (D-12 ~ D-15)
- **D-12: 토글은 기기별.** 앱 안 `/me` 설정 탭에 「이 기기 체결 알림」 스위치(서버 저장 · 「이 기기」 카드의 localStorage 와 다름). 사용자 1개 토글 기각. 새 기기 기본값은 꺼짐.
- **D-13: 웹(PC 브라우저)의 `/me` 설정 탭은 「알림 받는 기기」 카드 — 등록 기기 목록(기기명 · 플랫폼 · 마지막 확인 시각) + 개별 끄기 · 지우기.** 켜기는 그 기기 앱에서만(권한이 필요). 앱 안에서는 같은 카드에 이 기기 스위치가 맨 위. — **Reversibility:** reversible.
- **D-14: 푸시 권한은 토글을 켤 때만 묻는다**(설치·로그인 때 안 묻음). 거부(iOS 재요청 불가)면 스위치 아래 「설정 앱에서 허용」 안내 + 설정 열기 버튼, 스위치는 꺼짐으로 되돌린다. 권한 허용 → 토큰 등록 → 서버 저장 순.
- **D-15: 토큰 정리 = 로그아웃 때 서버에서 제거 + 송신 실패(APNs 410 · FCM UNREGISTERED/NOT_FOUND) 때 제거.** 같은 폰에 다른 계정이 로그인해도 앞 사람 체결이 안 간다. 제거된 기기는 목록에서 사라진다. 토큰 갱신(앱이 새 토큰을 주면)은 같은 기기 행 교체.

### 알림 표현 (D-16 ~ D-21)
- **D-16: 메시지 모양 = 스케치 029 **C 안**(숫자 · 만원 금액 먼저).** 제목 「종목 · 구분 사건」(예 「금양그린파워 · 선매수 체결」), 본문 「수량 (만원) · 잔량 · 가격 · 거래소 시각」. 전량은 평균가, 자동매도 완료는 손익 %. 정본은 `.planning/sketches/029-fill-push-messages/`(사건 7종 문안 전부). 금액 만원 단위는 Phase 31 규칙. 종목은 이름만(코드 없음) · 시각 KST 초 단위 · 계좌번호 없음. 매수/매도 낱말은 주문로그와 같다.
- **D-17: 소리 = 플랫폼 기본 알림음, 사건 전부 같게.** 전용 소리 파일 없음(앱 리소스 추가 없음).
- **D-18: 묶음 = 종목별.** iOS `thread-id` = 종목(ISIN) · Android 는 앱 묶음 그대로(채널 1개 「체결 알림」). 주문별 묶음 기각.
- **D-19: 앱 포그라운드에서도 푸시 배너를 그대로 보여준다**(iOS `presentationOptions` banner+sound · Android 포그라운드 표시). 알림 센터에도 남는다.
- **D-20: 앱 안 작업대 토스트 — 이 기기 알림이 켜져 있고 권한 허용이면 주문 토스트(accept · fill · modify · cancel · reject · vi)를 숨긴다.** 돌파(breakout · 시세) 토스트는 유지. 토글이 꺼진 앱 · 웹 브라우저는 토스트 그대로 — 알림 공백 없음. 판단은 네이티브 감지(`isNativeApp`) + 서버 저장 토글 + 권한 상태. 사용자가 「배너와 토스트가 겹치면 하나만」을 요구해 추가한 결정.
- **D-21: 배지 숫자 없음 · 탭하면 주문로그(`/trading/order-log`)를 그 종목 · 그 거래일로 거른 채 연다**(payload 에 isin · tradeDate · 계좌는 넣지 않음 — 가시 계좌 전부). 자동매도 ⑥·⑦ 도 같은 종목 거름.

### 리서치 뒤 확정 (D-22 ~ D-25 · 2026-11-06 사용자 답)
- **D-22: 자동매도(그룹 9) 주문 자체의 접수(①) · 서버 취소(⑤) 푸시도 보내지 않는다.** 자동매도는 시작(⑥) · 완료(⑦) 두 건만. 주기 매도(기본 3초) 재발주마다 접수 푸시가 반복되는 것을 막는다(리서치 A3). — **Reversibility:** reversible.
- **D-23: 자동매도 「완료」 손익 % = 평균 매수가 대비 실현 손익**(Phase 36 저널 손익 칸 `realized_pnl_krw` 기준 · 주문로그 손익과 같은 숫자). 자동매도 기준가 대비 기각(리서치 A7).
- **D-24: 탭 착지 계좌는 웹이 찾아 붙인다.** 푸시 payload 는 D-21 그대로(isin · tradeDate · 계좌 없음). 탭 처리기가 오늘 주문에서 그 종목의 가장 최근 주문 계좌를 찾아 `account` 쿼리를 붙여 `/trading/order-log` 를 열고, 없으면 계좌 없이 연다. 주문로그 「전체 계좌」 모드 추가 기각(리서치 Open Question 1).
- **D-25: 자동매도 「시작」 푸시의 「보유 N주 (M만)」 조각은 relay 계좌 캐시에 값이 있을 때만 싣는다.** 없으면 그 조각을 빼고 기준가 · 발동가 · 시각만. kind 11 에는 보유 수량이 없고 gh-trade 수정은 성공 기준 3 이 막는다(리서치 Open Question 2).

### Claude's Discretion
- **첫/전량 판정 RPC 모양** — 적용 RPC 확장 vs 송신 단계 표 전용 RPC · `dma_push_*` 류 이름 · 송신 로그 컬럼(주문 체인 키 · 단계 · seq · 기기 · 결과 코드 · 시각) · 멱등 키 · 보존 기간(purge).
- **구분 짝(D-03)** — kind 3 발주 이벤트와 저널 행의 (계좌 · 주문번호) 짝 · 짝이 늦게 올 때 처리(접수 푸시를 짧게 기다릴지 · origin 폴백) · 수동 주문 group 7 의 경로.
- **자동매도 완료 판정 원천(D-05)** · 자동매도 시작의 본문 값(기준 상한가/매수가 · 보유 수량) 원천(kind 11 필드).
- **APNs/FCM 송신기** — HTTP/2 클라이언트 · .p8 Secret Manager 경로 · FCM v1 OAuth(VM SA) · 재시도(네트워크 1회 · 4xx 토큰 정리 · 5xx 포기) · 송신 큐가 applied 리스너를 막지 않게(비동기 · 예외 격리 — writer 는 이미 리스너 예외를 삼킨다) · 3초 안 도착(성공 기준 1).
- **기기 토큰 · 설정 API** — server(Express) 경로 · 기기 식별(앱이 주는 기기 id · 모델명) · RLS/RPC(`REVOKE anon/authenticated` 명시) · relay 가 읽는 경로(60초 재적재 vs 송신 시 조회).
- **앱 쪽** — `@capacitor/push-notifications` 등록 흐름 · 딥링크(탭 → 웹 경로) · Android 알림 채널 · iOS entitlements(aps-environment) · Firebase Android 설정(`google-services.json` 저장소 밖 보관 + 릴리스 스크립트 주입 vs 추적) · 위생 검사 (8) 수정 범위 · `native:release` 통과.
- **D-20 토스트 숨김 구현** — 토글·권한 상태를 웹이 어떻게 아는지(앱 브리지 vs 서버 조회) · 숨김 범위 상수.
- **웹 카드 모양(D-13)** — UI-SPEC/`/gsd-ui-phase` 몫. 기기명 표기 · 마지막 확인 시각 형식 · 지우기 확인.
- **테스트** — 3조각 체결 → 2건 · 재기동/WR-09 멱등 · 계좌 범위 · 정정 체인 1회 · 당일 밖 버림 · 토큰 410 정리.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 요구 · 결정
- `.planning/ROADMAP.md` §Phase 40 — 목표 · 성공 기준 5 · 잠긴 결정 · 외부 선행(APNs Auth Key 발급은 사용자 `!` 실행 · Firebase 콘솔 `google-services.json`).
- `.planning/sketches/029-fill-push-messages/README.md` + `index.html` — 사건 7종 문안 · C 안 채택(2026-11-06). 본문 낱말의 정본.
- `.planning/sketches/MANIFEST.md` — 029 행.
- `.planning/milestones/v1.0-phases/22-gh-trade-ios-testflight-android-play/22-CONTEXT.md` §D-13~D-17 — Firebase 프로젝트 `gh-radar` · App Distribution · **D-17 「앱 안 Firebase SDK 없음」(Android 만 번복)**.

### relay 송신 지점 · 저널
- `relay/src/index.ts` `wirePipeline` — `p.writer.on("applied", …)` · `p.strategyWriter.on("applied", …)` 결선 자리 · `appAccess.userIdOf` · `access.accountsOf`.
- `relay/src/journal/writer.ts` `#onSuccess` — `emit("applied", rows)` · 리스너 예외 격리 · 재시도 규율(WR-09).
- `supabase/migrations/20261004090100_dma_journal_apply_skipped_rows.sql` — `dma_journal_apply` 반환 jsonb(`rows` · `errors` · `last_seq`) · skipped 분기(재시도 때 같은 행 재전송 → 멱등 필수).
- `supabase/migrations/20260924200000_dma_journal_tables.sql` · `20260924200100_dma_journal_rpcs.sql` — 주문 행 · 이벤트(E) 테이블 · 상태 6종 · `org_order_no`.
- `packages/shared/src/journal.ts` — `JournalOrderRow`(`filledQty` · `status` · `origin` · `orgOrderNo` · `message`) · `JOURNAL_ORDER_PUBLIC_COLUMNS`(T-19-08).
- `packages/shared/src/strategy-event-labels.ts` — `ORDER_GROUP_LABELS`(구분 낱말) · `STRATEGY_EVENT_KIND_LABELS`(3 주문 · 11 자동매도 발동 · 13 상태) · `CANCEL_REASON_LABELS` · `AUTO_SELL_STATE_LABELS`.
- `packages/shared/src/relay.ts` — `OrderType` N/M/C · `OrderSide`.

### 웹 · 토스트 · 설정 탭
- `webapp/src/components/trading/me-client.tsx` — `/me` 4탭 · 설정 탭 구조(Phase 32).
- `webapp/src/components/me/device-settings-card.tsx` — 「이 기기」 카드(localStorage · 돌파 알림음) — 새 「알림 받는 기기」 카드는 **서버 저장**이라 별개 카드.
- `webapp/src/components/trading/workbench/alert-toasts.tsx` · `webapp/src/lib/trading-alerts.ts` — 토스트 kind 7종 · 문구 표(D-20 숨김 범위).
- `webapp/src/lib/native/native-bridge-provider.tsx` · `native-detect.ts` — `isNativeApp` · `nativePlatform` · 앱↔웹 브리지(`postNative`).
- `webapp/src/app/trading/order-log/page.tsx` · `webapp/src/components/trading/order-log/order-log-filters.tsx` — 탭 착지 경로 · 종목/날짜 거름 파라미터.

### 앱 · 릴리스
- `mobile/capacitor.config.ts` · `mobile/package.json` — Capacitor 8.5.2 · `native:release*` 명령.
- `mobile/scripts/check-release-hygiene.sh` (8) · `mobile/.gitignore` 41~42 — `google-services.json` 차단(Android 만 풀기 · Firebase SA 키는 계속 차단).
- `mobile/scripts/release-apps.sh` · `release-android.sh` · `release-ios.sh` · `verify-prod-config.mjs` — 양 플랫폼 재릴리스 경로.

### 운영 규칙(메모리 · CLAUDE.md)
- Supabase RPC `REVOKE anon/authenticated` 명시 · 새 테이블 RLS `TO anon, authenticated` · Cloud Run 왕복은 RPC 1회 · 비밀 주입은 사용자 `!` 실행(APNs .p8 · Secret Manager) · 배포는 relay 먼저 · push 나중 · 앱 릴리스는 `release-apps.sh`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `writer.on("applied", rows)` 팬아웃 패턴(`fanout.deliverJournalRows`) — 푸시 송신기는 같은 자리에 두 번째 리스너로 붙는다. writer 는 리스너 예외를 삼키고 적용을 되돌리지 않는다(성공 기준 3 의 구조적 근거).
- `AppAccess.userIdOf(dmaUserId)` · `access.accountsOf(dmaUserId)` — 계좌 → 사용자 역매핑은 fanout 의 `{ access, identities }` 필터와 같은 원천.
- `ORDER_GROUP_LABELS` · `CANCEL_REASON_LABELS` — 본문 낱말을 새로 만들지 않는다(D-10 Phase 25 「표시명 정본 한 곳」).
- `trading-alerts.ts` 문구 표 · `alert-toasts.tsx` kind — D-20 숨김 범위의 열거.
- `device-settings-card.tsx` — 설정 탭 카드 꼴(제목 · 캡션 · Switch) 재사용. 저장 경로만 서버.
- `native-bridge-provider.tsx` — 앱 감지 · `postNative` 브리지(토큰 · 권한 상태 전달 후보).
- Phase 31 만원 표기 유틸(주문로그 「N만(M주)」) — C 안 금액.

### Established Patterns
- 저널 적용 RPC 는 service_role · SECURITY INVOKER · advisory lock · 멱등(PK 충돌 skipped). 송신 단계 표도 같은 트랜잭션 규율로.
- relay → Supabase 는 왕복 수가 지연을 지배 — 판정 + 멱등 + 기록은 RPC 1회.
- 비밀은 Secret Manager · 새 revision 배포 · 사용자 `!` 실행(Bright Data 사례).
- 앱 위생 검사가 비밀 파일 추적을 막는다 — `google-services.json` 은 비밀이 아니지만(Firebase 가 공개 취급) 지금 규칙이 차단하므로 (8) 만 Android 허용으로 바꾼다.

### Integration Points
- relay `wirePipeline` 두 리스너(주문 행 · 전략 이벤트) → 새 `PushNotifier`(판정 · 짝 · 송신) → APNs/FCM.
- DB: 기기 토큰 표 · 송신 단계/로그 표 · (선택) `dma_journal_apply` 반환 확장.
- server(Express): 기기 등록/해제 · 토글 API(`requireAuth` · `req.userId`) · 로그아웃 훅.
- webapp: `/me` 설정 탭 새 카드 · 토스트 숨김 조건 · 주문로그 딥링크 파라미터.
- mobile: push plugin · entitlements · Android Firebase · 릴리스 스크립트.

</code_context>

<specifics>
## Specific Ideas

- 사용자 요구 「주문 관련 사건 전부 표로 뽑아 보내는 것/안 보내는 것을 정리」 → 18종 표(DISCUSSION-LOG) · 결과 D-01/D-02.
- 「뭐로 인한 주문이었는지도 알려줘야 함」 → 구분 낱말(D-03).
- 「각 푸시별 메시지가 어떻게 올지 목업으로 먼저」 → 스케치 029 · C 안.
- 「앱에서 배너를 보여줄 거면 작업대 토스트는 안 떠야 맞다」 → D-20.
- 예시 종목 · 수치는 스케치 029 의 금양그린파워 선매수 3,120 × 500주(접수 09:00:31 · 200주 첫 체결 · 09:00:33 전량) — 테스트 픽스처로 써도 된다.

</specifics>

<deferred>
## Deferred Ideas

- **상태전이(kind 9) 푸시** — Phase 39 적재 뒤 별도 판단(선매수 1회 발주 뒤 꺼짐 · 위험도 래치 등).
- **시세 이벤트 알림**(상한가 노출 · 진입 · 버스트 상한가 · 상한가 특징 · 매집감지) — 새 기능 · 별도 phase.
- **웹 브라우저 Web Push**(PC 에서 앱 없이) — 범위 밖.
- **중간 부분 체결 · 정정 · 수동 취소 푸시** — 사용자가 안 보냄으로 닫음. 요청 있으면 토글 세분화로.
- **배지 숫자** — 기각(기기별 안 본 수 동기화 비용).

</deferred>

---

*Phase: 40-fill-push-notification*
*Context gathered: 2026-11-06*
