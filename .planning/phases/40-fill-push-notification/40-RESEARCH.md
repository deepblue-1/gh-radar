# Phase 40: 체결 앱 푸시 알림 - Research

**Researched:** 2026-11-06
**Domain:** relay 저널 적용 훅 → 판정·멱등 RPC → APNs(HTTP/2 · JWT) / FCM HTTP v1 송신 · Capacitor 푸시 플러그인 · 기기 토큰 API · 웹 설정 카드
**Confidence:** HIGH(코드베이스 · DB 계약 · APNs 문서) / MEDIUM(FCM IAM · Capacitor 동작) / LOW 항목은 Assumptions Log 에 모음

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

**로드맵에서 이미 잠긴 것(재론 금지):** relay applied 훅 송신 · APNs 직접 / FCM v1 · 기존 Firebase 프로젝트 · 토글 서버 저장 · 송신 로그 멱등 · 탭하면 주문로그 · 푸시 본문에 계좌번호 원문 없음(T-19-14 동형) · 텔레그램/카카오 기각(트렐로 yP2Q3UkZ 검토 2026-11-06).

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

### Deferred Ideas (OUT OF SCOPE)
- **상태전이(kind 9) 푸시** — Phase 39 적재 뒤 별도 판단(선매수 1회 발주 뒤 꺼짐 · 위험도 래치 등).
- **시세 이벤트 알림**(상한가 노출 · 진입 · 버스트 상한가 · 상한가 특징 · 매집감지) — 새 기능 · 별도 phase.
- **웹 브라우저 Web Push**(PC 에서 앱 없이) — 범위 밖.
- **중간 부분 체결 · 정정 · 수동 취소 푸시** — 사용자가 안 보냄으로 닫음. 요청 있으면 토글 세분화로.
- **배지 숫자** — 기각(기기별 안 본 수 동기화 비용).
</user_constraints>

<phase_requirements>
## Phase Requirements

요구사항 ID 는 매핑되지 않았다(ROADMAP「TBD」). 아래 성공 기준 5개 + D-01~D-21 이 요구 집합이다.

| ID | Description | Research Support |
|----|-------------|------------------|
| SC-1 | 「체결 알림」 켠 사용자 계좌 체결 → iOS·Android 3초 안 한 줄 푸시 · 탭하면 주문로그 · 3조각 체결 → 2건 | Pattern 1(applied 리스너 → 정착 400ms → 판정 RPC → 송신) · Pattern 3 단계 격자(첫 체결 rank 2 · 전량 rank 3) · Pattern 6 탭 경로 · Pitfall 9(주문로그는 `account` 없으면 주문 이벤트를 안 보인다) |
| SC-2 | relay 재기동(커서 재생) · WR-09 재시도 뒤 같은 체결 두 번 안 보냄 | Pattern 2 `dma_push_chains` 단조 upsert(`sent_rank < new`) · WR-09 skipped 분기가 같은 행을 다시 돌려준다는 근거(20261028210000:120-141) |
| SC-3 | 주문·판정 경로 diff 0 · 송신 실패는 로그 + 토큰 정리만, 적용·팬아웃 무영향 | Pattern 1(리스너는 동기 enqueue 만 · 자체 try/catch) · Pitfall 1(EventEmitter 는 앞 리스너가 throw 하면 뒤 리스너를 부르지 않는다) · `dma_journal_apply` 재정의 금지 |
| SC-4 | 토글 꺼진 사용자 · 다른 사용자 계좌 체결은 안 옴 · 본문에 계좌번호 없음 | Pattern 4 수신자 계산 = fanout `#extraGatewayAccounts` 와 같은 규칙(`AppAccess.dmaUserIdOf` → 그 서버 `access.accountsOf`) · RPC 는 `enabled` 기기만 · 공유 shared 문안 함수에 계좌 인자 없음 |
| SC-5 | 앱 Firebase 는 Android 만 · iOS 번들 Firebase 0 · 위생 검사가 `google-services.json` 허용 · SA 키 차단 유지 · 양 플랫폼 `native:release` | Pattern 7(플러그인 iOS 는 Capacitor 만 의존 — Package.swift 확인) · 위생 검사 (2)(3)(8) 수정안 · check-ipa/check-apk 보강 |
</phase_requirements>

## Summary

송신 지점은 이미 갖춰져 있다. `wirePipeline`(relay/src/index.ts:500-508)이 서버 파이프라인마다 `p.writer.on("applied")` · `p.strategyWriter.on("applied")` 를 fanout 에 거는데, 같은 자리에 **두 번째 리스너로 `PushNotifier.enqueue`** 를 붙이면 된다. 다만 `JournalWriter.#onSuccess` 는 `emit` 전체를 한 try/catch 로 감쌀 뿐이라(writer.ts:640-648) **앞 리스너가 throw 하면 뒤 리스너는 불리지 않는다** — 푸시 리스너는 동기 enqueue 만 하고 자기 안에서 예외를 삼켜야 fanout(앞)·적용(이미 커밋) 어느 쪽도 흔들지 않는다. 판정·멱등·기록·기기 조회는 **새 전용 RPC 1회**(`dma_push_claim`)로 묶고 `dma_journal_apply` 는 건드리지 않는다(매초 도는 적용 경로에 푸시 실패 표면을 들이지 않기 위해 — SC-3).

판정 재료는 전부 DB 에 있다. 적용 RPC 반환 행은 주문 단위 투영(상태 6종 · `filled_qty` · `org_order_no` · `requester`)뿐이고 체결가·시각·게이트웨이가 없다(20261028210000:179-182). 그래서 RPC 가 주문 행 id 를 받아 ① 정정 체인 루트를 `org_order_no` 로 거슬러 올라가 찾고(정정 행은 `order_type='M'` · `org_order_no`=직전 주문 — 20260924200100 투영 M 갈래), ② 체인 Σ`filled_qty` 와 루트 `qty` 로 「첫 체결 / 전량」을 가르고, ③ `dma_journal_events` 에서 조각 체결가·평균가·시각을, ④ `dma_strategy_events`(kind 3/6 · 주문번호 색인 `idx_dma_strategy_events_order`)에서 구분(group)을 짝짓고, ⑤ `dma_push_chains` 단조 upsert(`WHERE sent_rank < new_rank`)로 「이미 보낸 단계 이상이면 건너뜀」을 원자적으로 처리한 뒤, ⑥ 수신자의 켜진 기기 토큰을 돌려준다. 자동매도 ⑥⑦은 전략 행(kind 11 · kind 13 `cond_actual=4`)을 같은 RPC 에 싣는다 — kind 13 「완료」는 gh-trade 가 **보유 0 ∧ 나가 있는 매도 0** 일 때만 낸다(LimitChaser.cpp:7609-7616)라 D-05 의 정의와 정확히 같다.

송신은 **새 의존성 0** 으로 된다. APNs 는 `node:http2` 세션 1개 + `node:crypto` ES256 서명(JWT 50분 재사용 — Apple: 20분보다 자주 갱신 금지 · 60분보다 늦게 갱신 금지), FCM v1 은 VM 메타데이터 서버 토큰(VM 은 이미 `--scopes=cloud-platform` 로 만들어졌다 — setup-relay-iam.sh:382) + 전역 `fetch`. 앱은 `@capacitor/push-notifications@8.1.3` 하나만 `mobile/` 에 추가하고, 웹은 기존 관례(`window.Capacitor.nativePromise` · `addListener` — webapp 에 Capacitor npm 의존성 0)로 권한·등록·탭을 다룬다. Android 는 이미 `classpath google-services:4.4.4` 와 조건부 `apply plugin` 이 들어 있어(android/build.gradle:11 · app/build.gradle:81-88) `google-services.json` 만 넣으면 켜진다 — 단 조건부 블록이 파일 없으면 **조용히** 건너뛰므로 릴리스는 실패하게 바꿔야 한다.

**Primary recommendation:** `dma_journal_apply` 무변경 · 새 RPC `dma_push_claim`(판정+멱등+기기) + `dma_push_report`(결과·토큰 정리) · relay `PushNotifier`(파이프라인당 단일 비행 큐 · 정착 400ms · 구분 짝 대기 1회) · APNs/FCM 은 node 내장 모듈로 직접 · 문안은 shared 순수 함수 한 곳.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 적용 결과 수신 · 송신 큐 | relay(VM 컨테이너) | — | 로드맵 잠금 — `writer.on("applied")` 지점. 주문·판정 로직 밖 |
| 첫/전량 · 체인 · 멱등 · 당일 판정 | Database(Supabase RPC) | relay(호출) | D-07 「DB 가 기억」 · 재기동/WR-09 에도 같은 판정 |
| 구분(group) 짝 | Database(`dma_strategy_events` 조회) | relay(지연 재시도 1회) | 두 기록기가 따로 적용 — 짝은 DB 에서 보는 게 순서 독립 |
| 수신자(계좌 → 사용자) | relay(`AppAccess` + 그 서버 `JournalAccess`) | Database(기기 · 토글) | D-06 · 로드맵 「`accountsOf`·`userIdOf`」 — fanout 과 같은 원천 |
| 문안(제목·본문) | shared 순수 함수 | relay(호출) | 「표시명 정본 한 곳」(Phase 25 D-10) · 테스트 용이 |
| APNs / FCM 송신 · 토큰 정리 판단 | relay | Database(`dma_push_report`) | 비밀(.p8)·VM SA 가 relay 에만 있다 |
| 기기 등록 · 토글 · 목록 · 삭제 API | API(server Express · `requireAuth`) | Database(RPC) | 기존 `req.userId` + 서비스롤 RPC 관례 |
| 권한 요청 · 토큰 획득 · 탭 수신 | 앱(네이티브 플러그인) | 웹(원격 페이지 JS · `Capacitor.nativePromise`) | Remote-URL 셸 — 로직은 웹, 네이티브는 플러그인만 |
| 토스트 숨김(D-20) · 기기 카드(D-13) | Browser(webapp) | API(기기 목록) | 앱 안 판단 = 네이티브 감지 + 서버 토글 + 권한 |

## Project Constraints (from CLAUDE.md)

- 사용자 대면 문장은 한국어 · 식별자·경로는 원문.
- 커밋 메시지 한글 · Co-Authored-By 금지 · 커밋 전 메시지 확인(사용자 전역 규칙 — executor 단계 몫).
- GSD 워크플로 경유(직접 편집 금지).
- **공식 API 운영 기준**이 APNs/FCM 에도 적용된다고 보는 것이 맞다: 호출량은 사용자 수와 독립(사건 수 × 켜진 기기 수 — 사용자 클릭이 송신을 일으키지 않는다) · 한도 소진/차단 신호 시 그 run 즉시 중단(APNs 429 `TooManyRequests` · FCM 429 `QUOTA_EXCEEDED` → 재시도로 두드리지 않음).
- 배포: **relay 먼저 · push(=webapp 프로덕션 배포) 나중**(메모리). 서브에이전트 배포는 분류기 차단 — executor 는 커밋까지, 배포는 메인 세션.
- 비밀 주입은 사용자 `!` 실행 · 비출력 스크립트(메모리 「비밀 주입은 사용자 `!` 실행」).
- Supabase RPC 는 `REVOKE … FROM PUBLIC` + `REVOKE … FROM anon, authenticated` 명시 · 새 테이블은 서비스롤 전용이면 RLS 활성 + 정책 0 + anon/authenticated REVOKE(저널 테이블 4줄 구성 — 20260924200000:171-189). 브라우저가 직접 읽는 표가 생기면 그때만 정책을 `TO anon, authenticated` 둘 다로.
- `supabase db push --linked --yes`(허용 규칙 접두사 그대로 · 파이프 금지).
- 동시 세션 테스트는 `vitest --maxWorkers=2` · playwright `--workers=1`(메모리 · relay vitest.config 기본 2).
- 앱 릴리스는 `release-apps.sh`(`native:release`) 한 줄.
- 작업은 master · 긴 execute 는 전용 worktree(메모리 · Phase 39 가 `executing` 상태로 동시 진행 중 — STATE.md).
- security_enforcement=false — Security Domain 절 생략(메모리 「보안검사 안 함」). 단 T-19-14(계좌번호·토큰 로그 금지)는 기존 규율로 유지.
- UI 표면(설정 카드)은 HTML 목업 먼저 · `/gsd-ui-phase`(config `ui_phase: true`).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@capacitor/push-notifications` | 8.1.3 (latest · 2026-10-02 publish) | 앱 권한 · APNs 토큰(iOS) / FCM 토큰(Android) · 수신 · 탭 이벤트 | Capacitor 공식 플러그인 · peer `@capacitor/core >=8.0.0` · 앱이 Capacitor 8.5.2 [VERIFIED: npm registry · package-legitimacy OK] |
| `node:http2` (Node 22 내장) | Node 22-alpine(relay/Dockerfile) | APNs HTTP/2 세션 | APNs 는 HTTP/2 필수 · 전역 fetch(undici)는 기본 h2 아님 [CITED: developer.apple.com sending-notification-requests-to-apns] |
| `node:crypto` `sign('sha256', …, {dsaEncoding:'ieee-p1363'})` | 내장 | APNs JWT ES256 서명 | JOSE 서명 형식(r‖s 64바이트)을 바로 낸다 — jose 등 라이브러리 불필요 [ASSUMED] |
| 전역 `fetch` | Node 22 내장 | FCM v1 · GCE 메타데이터 토큰 | deploy-relay.sh 가 이미 같은 메타데이터 경로로 토큰을 받는다(725-731) [VERIFIED: scripts/deploy-relay.sh:725-737] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `firebase-messaging`(Android AAR) | 25.0.1(플러그인 기본) | 플러그인이 의존 — 직접 추가하지 않음 | `variables.gradle` 에 `firebaseMessagingVersion` 을 두면 고정된다 [VERIFIED: plugin android/build.gradle:7,77] |
| `com.google.gms:google-services` Gradle plugin | 4.4.4 | `google-services.json` → 리소스 | 이미 classpath 에 있음 [VERIFIED: mobile/android/build.gradle:11] |
| shared `amountFromQty` · `formatManwon` · `kstDateIso` · `ORDER_GROUP_LABELS` · `CANCEL_REASON_LABELS` | workspace | 문안 | 새 낱말·금액 규칙을 만들지 않는다 [VERIFIED: packages/shared/src/lc-amount.ts:195-206 · krxCalendar.ts:53] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:http2` 직접 | `@parse/node-apn` · `apns2` | 의존성 + 슬롭 위험 · 이 규모(하루 수백 건)엔 과함. 직접 구현은 ~120줄 |
| 메타데이터 서버 토큰 직접 | `google-auth-library`(11.3.3) | relay 에 없음 · 메타데이터 경로가 이미 검증된 관례. ADC 가 필요한 로컬 개발만 불편(로컬은 FCM 송신 꺼둠) |
| 전용 RPC | `dma_journal_apply` 반환 확장(이전 상태 동봉) | 원자성(적용·판정 한 트랜잭션)은 좋지만 매초 적용 경로 재정의 · 08~20시 배포 금지 · 푸시 로직 결함이 적용을 멈출 수 있음 → SC-3 위험. 전용 RPC 를 권고 |
| UA + localStorage 기기 키 | `@capacitor/device` 8.0.3 | 모델명 정확도는 좋지만 네이티브 의존 추가. Android UA 에 모델명이 있고 iOS 는 「iPhone/iPad」 수준 — UI-SPEC 이 정확한 모델명을 요구하면 추가 |
| `google-services.json` 저장소 추적 | 저장소 밖 보관 + 릴리스 스크립트가 복사 | 추적이 단순(dev 빌드도 FCM 동작 · 스크립트 변경 적음). Firebase 는 이 파일을 비밀로 보지 않는다 [ASSUMED] · 로드맵이 「.gitignore 조정」을 명시 → 추적 권고 |

**Installation:**
```bash
pnpm --filter @gh-radar/mobile add @capacitor/push-notifications@8.1.3   # 다른 Capacitor 의존처럼 정확 버전 고정
pnpm --filter @gh-radar/mobile run native:sync                           # CapApp-SPM Package.swift · capacitor.settings.gradle 자동 갱신
```
relay · server · webapp: 새 패키지 없음.

**Version verification:** `npm view @capacitor/push-notifications dist-tags` → `latest: 8.1.3`(publish 2026-10-02T16:08:14Z) · `next: 9.0.0-alpha.2` — 9.x 는 Capacitor 9 용이므로 쓰지 않는다.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@capacitor/push-notifications` | npm | 다년(1.x~8.x 계열 · 8.1.3 = 2026-10-02) | 2,739,773/주 | github.com/ionic-team/capacitor-plugins | OK | Approved · postinstall 없음 |
| `@capacitor/device` | npm | 다년(8.0.3) | 928,201/주 | github.com/ionic-team/capacitor-plugins | OK | 선택(권고는 미사용) · postinstall 없음 |

**Packages removed due to [SLOP] verdict:** 없음
**Packages flagged as suspicious [SUS]:** 없음
(`npm view … scripts.postinstall` 둘 다 없음 · `gsd-tools query package-legitimacy check` 결과 둘 다 OK. `@parse/node-apn` · `apns2` · `google-auth-library` 는 권고하지 않으므로 감사 대상 아님.)

## Architecture Patterns

### System Architecture Diagram

```
gh-trade 게이트웨이 ──80 JournalBatch(주문 저널 + 전략 이벤트)──▶ relay JournalObserver
                                                                     │ push(동기)
                              ┌──────────────────────────────────────┴───────────────┐
                              ▼                                                      ▼
                    JournalWriter(journal)                                JournalWriter(strategy)
                     dma_journal_apply (무변경)                            dma_strategy_apply (무변경)
                              │ emit("applied", JournalOrderRow[])                   │ emit("applied", StrategyEventRow[])
              ┌───────────────┼──────────────────┐                     ┌────────────┼─────────────────┐
              ▼                                  ▼                     ▼                              ▼
   fanout.deliverJournalRows          PushNotifier.enqueueOrders   fanout.deliverStrategyEvents   PushNotifier.enqueueStrategy
   (기존 · 브라우저 wss)               (동기 · try/catch · 후보만)                                     (kind 11 · 13(cond_actual=4)만)
                                                 │
                                   파이프라인당 큐: Map<orderId,lastSeq> + 전략 키
                                   정착 타이머 400ms · 단일 비행(진행 중이면 다음 묶음에 합침 = D-09)
                                                 │ 수신자 계산: 계좌 → (그 서버 access 의 DMA id 들) → AppAccess 사용자들
                                                 ▼
                         RPC dma_push_claim(p_gateway, p_orders, p_strategy, p_recipients, p_allow_fallback)
                           ├ 체인 루트(org_order_no 거슬러 오름) · 체인 Σfilled vs 루트 qty → 단계
                           ├ 구분 짝(dma_strategy_events kind 3/6 by order_no) · 없으면 deferred(1회)
                           ├ 당일 아님 → outcome 'stale' 기록 · 수동 취소 → 'suppressed' 기록
                           ├ dma_push_chains upsert … WHERE sent_rank < new_rank  (멱등 · 단조)
                           └ 켜진 기기(dma_push_devices) 반환 + dma_push_log 행
                                                 │ { sends[], deferred[] }
                       ┌─────────────────────────┴───────────────────────┐
                       ▼                                                 ▼
        shared pushMessageOf(facts) → {title, body}       deferred → 1.5s 뒤 p_allow_fallback=true 재호출
                       │
          ┌────────────┴─────────────┐
          ▼                          ▼
   ApnsSender(http2 · JWT ES256)   FcmSender(fetch · 메타데이터 토큰)
   api.push.apple.com              fcm.googleapis.com/v1/projects/gh-radar/messages:send
          │ 결과(200 / 410 / 400 BadDeviceToken / 5xx / 네트워크)    │ (200 / 404 UNREGISTERED / 400 INVALID_ARGUMENT / 429)
          └────────────┬─────────────┘
                       ▼
       RPC dma_push_report(결과 배치) → dma_push_deliveries 기록 · 죽은 토큰 기기 행 삭제(토큰 일치 조건)

폰: 알림 배너(포그라운드 포함 · presentationOptions) ─탭─▶ pushNotificationActionPerformed(data.path)
    └▶ webapp NativeBridgeProvider 리스너 → isSafeInternalPath 검증 → (계좌 해석) → router.push('/trading/order-log?…')

앱 /me 설정 탭: 스위치 켜기 → checkPermissions/requestPermissions → addListener('registration') → register()
    → PUT /api/push/devices/:deviceKey {platform, token, enabled:true} → server RPC dma_push_device_upsert
```

### Recommended Project Structure
```
supabase/migrations/2026110xxxxxxx_dma_push.sql      # 표 4 · RPC 6 · 권한 (원격 적용은 사용자 db push)
supabase/tests/dma_push_claim.test.sql               # 판정 · 멱등 · 체인 · 당일 · 짝 · 수신자 · 권한
packages/shared/src/push-message.ts                  # 문안 순수 함수 + 사실 타입(PushFacts) · index.ts 재수출
packages/shared/src/__tests__/push-message.test.ts   # 스케치 029 C 안 7종 골든
relay/src/push/notifier.ts                           # PushNotifier — 큐 · 정착 · 단일 비행 · 수신자 · RPC · 송신 분배
relay/src/push/apns.ts                               # http2 세션 · JWT 캐시 · 응답 분류
relay/src/push/fcm.ts                                # 메타데이터 토큰 캐시 · v1 송신 · 응답 분류
relay/tests/push-notifier.test.ts                    # 가짜 supabase · 가짜 sender
relay/tests/push-apns.test.ts · push-fcm.test.ts     # 응답 분류 · JWT 재사용 주기
server/src/routes/push-devices.ts (+ schemas · __tests__)
webapp/src/lib/push/*.ts                             # 네이티브 호출 래퍼 · 기기 키 · 상태 훅 · 탭 처리
webapp/src/components/me/push-devices-card.tsx       # D-13 카드 (UI-SPEC 뒤)
mobile/ios/App/App/App.entitlements · AppDelegate.swift(2 메서드) · capacitor.config.ts(presentationOptions)
mobile/android/app/google-services.json(추적) · AndroidManifest meta-data(채널 · 아이콘)
```

### Pattern 1: applied 두 번째 리스너 = 동기 enqueue + 자기 예외 격리
**What:** writer 는 `try { this.emit("applied", rows) } catch {…}` 로 emit 전체를 한 번 감싼다(writer.ts:640-648). Node `EventEmitter.emit` 은 리스너를 순서대로 동기 호출하고 하나가 throw 하면 그 뒤 리스너를 부르지 않는다 [ASSUMED — Node 표준 동작]. fanout 리스너가 먼저 붙어 있으므로(index.ts:501-502) 푸시 리스너는 **뒤에** 붙이고 절대 throw 하지 않아야 한다(뒤에 붙여도 fanout 이 throw 하면 푸시가 빠지는 기존 위험은 남는다 — 허용).
**When to use:** `wirePipeline` 안.
**Example:**
```typescript
// relay/src/index.ts wirePipeline — 기존 두 줄 뒤에 추가 (fanout 줄은 그대로)
p.writer.on("applied", (rows) => pushNotifier.enqueueOrders(p, rows));
p.strategyWriter.on("applied", (rows) => pushNotifier.enqueueStrategy(p, rows));

// relay/src/push/notifier.ts
enqueueOrders(p: ServerPipeline, rows: readonly JournalOrderRow[]): void {
  try {
    if (!this.#enabled) return;                       // 비밀 없음 · 테스트 등 — 조용히 꺼짐(부팅 로그 1회)
    const q = this.#queueOf(p.server.key);
    for (const r of rows) {
      if (!isPushCandidate(r)) continue;              // 상태/유형으로 1차 거름 — DB 판정의 부분집합만
      const prev = q.orders.get(r.id);
      if (prev === undefined || r.lastSeq > prev) q.orders.set(r.id, r.lastSeq);
    }
    this.#schedule(q);                                // 정착 400ms · 진행 중이면 끝난 뒤 다시
  } catch (err) {
    logger.error({ gateway: p.server.key, err: String(err) }, "[push] enqueue 예외 — 적용 · 팬아웃 무영향");
  }
}
```
`isPushCandidate`: `orderType` N 이고 status ∈ {accepted, partially_filled, filled, rejected, cancelled} 이거나, `orderType` M(체인 체결) 이거나, `orderType` C 이고 status cancelled(취소 행 — 수동/서버 판별용). 거부된 정정/취소 요청 행(`orderType` M/C · rejected)은 후보 아님(D-02).

### Pattern 2: 멱등 = 체인 상태 행 단조 upsert (advisory lock 불필요)
**What:** 체인마다 「보낸 최고 단계」 1행. `INSERT … ON CONFLICT DO UPDATE … WHERE sent_rank < EXCLUDED.sent_rank RETURNING` 이 행을 돌려줄 때만 송신 권리가 생긴다. 같은 단계 재생(WR-09 · 재기동 재생 · 지연 재시도 중복)은 RETURNING 0 행 → 건너뜀(D-09 「이미 보낸 단계 이상」).
**Ranks:** `accepted`=1 · `first_fill`=2 · `filled`=3 · `rejected`=3 · `cancelled`=3 · 수동 취소 기록(`suppressed`)=3 · 당일 아님(`stale`)=그 단계 rank 로 기록(이후 같은 체인 재생도 막음).
**Example(스켈레톤 — 이름은 권고):**
```sql
-- 체인 상태 (D-07 · D-10) — 키 = (게이트웨이, 거래일, 계좌, 체인 키). 체인 키 = 루트 주문번호 · 로컬 거부는 'R:'||reject_seq · 자동매도 'AS:'||epoch||':'||seq
CREATE TABLE public.dma_push_chains (
  gateway     text     NOT NULL,
  trade_date  date     NOT NULL,
  account_no  text     NOT NULL,
  chain_key   text     NOT NULL,
  sent_rank   smallint NOT NULL CHECK (sent_rank BETWEEN 1 AND 3),
  sent_stage  text     NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gateway, trade_date, account_no, chain_key)
);

INSERT INTO public.dma_push_chains AS c (gateway, trade_date, account_no, chain_key, sent_rank, sent_stage)
VALUES (p_gateway, v_trade_date, v_account, v_chain_key, v_rank, v_stage)
ON CONFLICT (gateway, trade_date, account_no, chain_key) DO UPDATE
   SET sent_rank = EXCLUDED.sent_rank, sent_stage = EXCLUDED.sent_stage, updated_at = now()
 WHERE c.sent_rank < EXCLUDED.sent_rank
RETURNING 1 INTO v_claimed;   -- NULL 이면 이미 보낸 단계 이상 → 건너뜀
```
`dma_push_log`(사건 1건 = 1행: chain 키 · stage · outcome('sent'|'stale'|'suppressed'|'no_device') · facts jsonb · created_at · UNIQUE(gateway, trade_date, account_no, chain_key, stage)) · `dma_push_deliveries`(log_id · device_id · platform · result('ok'|'failed'|'token_removed') · http_status · reason · sent_at). 기기 0 이면 체인 행을 **쓰지 않는다**(나중에 켠 기기가 다음 단계를 받게 — 기록은 수신 가능할 때만).

### Pattern 3: 단계 판정 규칙(체인 기준 · SQL)
**근거 사실:**
- 상태 격자 `accepted`=1 · `partially_filled`=2 · 종결 4종=3, 종결은 다른 종결로도 안 바뀐다 [VERIFIED: supabase/migrations/20260924200100_dma_journal_rpcs.sql:58-91 — `WHEN 'accepted' THEN 1` · `WHEN 'partially_filled' THEN 2` · `WHEN 'filled' THEN 3` · `WHEN 'cancelled' THEN 3` · `WHEN 'rejected' THEN 3` · `WHEN 'modified' THEN 3`].
- 상태 CHECK `status IN ('accepted','partially_filled','filled','cancelled','rejected','modified')` · `order_type IN ('N','M','C')` · `origin IN ('manual','limit_chaser','vi')`(미상 NULL) [VERIFIED: supabase/migrations/20260924200000_dma_journal_tables.sql:110,116,120].
- 정정확인(M): 새 행 `order_type='M'` · `org_order_no`=원주문 · qty=이동 수량 · status `accepted`; 원주문 행은 `modified_qty += 이동`, 합이 qty 이상이면 `modified` [VERIFIED: 20260924200100_dma_journal_rpcs.sql:275-289(M 갈래) · 365-375(원주문 갱신)].
- 취소확인(C): org 가 비었거나 자기 번호면 거래소 자동취소(자기 행 cancelled) · 아니면 새 행 `order_type='C'` + 원주문 cancelled [VERIFIED: 20260924200100_dma_journal_rpcs.sql:261-273 · 357-364].
- `requester` = `"Manual"` 은 **사람이 낸 정정·취소**일 때만 [VERIFIED: gh-trade server/src/trade/journal/JournalFormat.cpp:144 `e.requester = r.manualRequest ? "Manual" : "";` · IBroker.h:218 「표시용 요청자(사람이 낸 정정·취소인가)」].
- 주문번호 행 유일 키 `(gateway, trade_date, account_no, order_no) WHERE order_no IS NOT NULL` [VERIFIED: 20260924200000_dma_journal_tables.sql:133-135].

**규칙(권고):**
1. **체인 루트**: 행에서 시작해 `order_type IN ('M','C')` 인 동안 `org_order_no` 행으로 거슬러 오른다(같은 gateway·trade_date·account_no). 가장 위 행의 `order_no` 가 체인 키. 부모 행이 없으면(전일·예약 원주문 — 투영 Assumption A4) 마지막으로 본 `org_order_no` 문자열을 키로 쓴다.
2. **체인 구성원** = 루트 + 루트에서 `order_type='M'` 로 내려가는 행들(재귀 · 깊이 상한 20). `C` 행은 구성원이 아니라 「취소 사건」.
3. **④ 거부**: 루트 자신이 `order_type='N'` 이고 status `rejected`(로컬 거부 `reject_seq` 행 포함 · 키 `'R:'||reject_seq`). 정정/취소 요청 거부(M/C rejected)는 판정 대상 아님(D-02).
4. **⑤ 서버 자동 취소**: 체인 구성원 중 cancelled 가 생겼고, 그 취소 사건이 (a) `order_type='C'` 행의 `requester IS DISTINCT FROM 'Manual'` 이거나 (b) 자기 번호 취소(거래소 자동취소)이며, 체인에 살아 있는 구성원(accepted/partially_filled)이 없고 Σfilled < 루트 qty. 수동 취소(`requester='Manual'`)는 `suppressed` 로 rank 3 기록만(뒤 사건 차단).
5. **③ 전량**: 루트 `qty IS NOT NULL` 이고 체인 Σ`filled_qty` ≥ 루트 `qty`(정정은 수량을 옮길 뿐 줄이지 않으므로 체인 합 = 원주문 수량에서 끝난다).
6. **② 첫 체결**: 체인 Σ`filled_qty` > 0 이고 ③ 아님.
7. **① 접수**: 트리거 행이 루트(`order_type='N'`)이고 status ≥ accepted 이며 위 2~6 이 아님. 정정 행의 `accepted` 는 ① 을 만들지 않는다(D-10).
8. 계산된 단계 rank ≤ 기록 rank 면 건너뜀(Pattern 2). 한 묶음에서 접수→전량이면 계산 결과가 곧바로 rank 3 이라 「전량」 1건(D-09).
9. **⑥/⑦ 자동매도**: 전략 행 kind 11 → `autosell_start` · kind 13 `cond_actual=4 AND cond_threshold<>4` → `autosell_done`. 체인 키 = 그 전략 이벤트 PK(`'AS:'||journal_epoch||':'||seq`) — 하루에 여러 번 발동(완료 → 감시 재무장 경로가 있다 — LimitChaser.cpp:7044-7062)해도 이벤트마다 1건.
10. **자동매도 주문 억제**: 루트의 구분이 group 9 면 ①~⑤ 전부 건너뜀(D-02 「자동매도 주문 자체의 첫/전량」 — ①⑤ 까지 넓히는 해석은 Assumption A3).
11. **D-11 당일**: `trade_date <> (now() AT TIME ZONE 'Asia/Seoul')::date` 면 outcome `stale` 로 기록 · 송신 없음.

### Pattern 4: 수신자 = fanout 과 같은 규칙, RPC 에 user_id 목록으로 넘김
**What:** fanout 서버 경로는 사용자마다 `identities.dmaUserIdOf(userId)` → `access.accountsOf(dma)` 로 거른다 [VERIFIED: relay/src/ws/fanout.ts:3368-3373 `#extraGatewayAccounts`]. 푸시는 연결된 사용자가 아니라 **기기를 가진 모든 사용자**가 대상이라 역방향이 필요하다: 계좌 → 그 서버 `p.access.dmaUserIds()` 중 `accountsOf(dma).has(계좌)` → 그 DMA id 의 **모든** 권한 사용자. `AppAccess.userIdOf(dma)` 는 첫 행 하나만 준다(app-access.ts:80-84 `reverseIndex` — `!out.has(e.dmaUserId)` 일 때만 넣음) → D-06 「공유 계좌의 다른 사용자 포함」을 만족하려면 `AppAccess.userIdsOf(dma): string[]`(권한 행만 · `isDmaGranted`) 를 새로 둔다.
**Why relay 쪽:** 로드맵이 「계좌→사용자는 기존 `accountsOf`·`userIdOf`」로 명시 · 웹 토스트와 같은 범위(D-06). DB 쪽 대안(`dma_visibility_identities` ⨝ `dma_account_access`)도 같은 규칙이지만 원천이 둘이 된다.
**기기·토글은 RPC 가 송신 시점에 읽는다**(60초 재적재 없음) — 토글 끈 직후·새 등록 직후가 바로 반영되고, relay 에 기기 캐시·reload 경로가 필요 없다.

### Pattern 5: 구분(group) 짝 — DB 조회 + 1회 지연
**근거:** `BuyOrder = 3 — A 접수 시점에 1건` [VERIFIED: relay/src/generated/StockDMA.fbs:1461] · `SellOrder = 6`(1464) · `Rejected = 8 — result_code · message`(1466) · `Cancelled = 7 — cancel_reason`(1465). 전략 이벤트 표는 `"group" smallint` · `order_no text` · `cancel_reason smallint` 칸과 `idx_dma_strategy_events_order (gateway, trade_date, account_no, order_no) WHERE order_no <> ''` 색인을 가진다 [VERIFIED: supabase/migrations/20260929180000_dma_strategy_events.sql:49-50,56,81,98-100]. OrderGroup 값 `PreBuy = 1 … Manual = 7 · VITrigger = 8 · AutoSell = 9` [VERIFIED: StockDMA.fbs:1499-1507].
**규칙:** 루트 주문번호로 kind IN (3,6) 의 `"group"` 을 찾는다(최신 1). ⑤ 의 사유는 취소된 구성원 주문번호의 kind 7 `cancel_reason`. ④ 는 주문번호가 있으면 kind 8 by order_no, 없으면(로컬 거부) (계좌 · isin · result_code · `|gw_time 차| ≤ 3초`) 최신 kind 8 — 휴리스틱(Assumption A5).
**늦은 짝:** 두 기록기는 독립 워커라 주문 행이 전략 행보다 먼저 적용될 수 있다. `p_allow_fallback=false` 첫 호출에서 루트 `origin='limit_chaser'` 인데 group 을 못 찾은 항목은 **기록하지 않고** `deferred` 로 돌려준다 → relay 가 1.5초 뒤 그 id 들만 `p_allow_fallback=true` 로 재호출 → 그래도 없으면 폴백. `origin` 이 manual/vi 면 기다리지 않는다(group 7/8 낱말 「수동」/「VI」 와 폴백이 같다). origin NULL(HTS 등 출처 미상)은 구분 낱말 없이 매수/매도만.
**취소 사유 늦은 짝:** ⑤ 도 같은 deferred 규칙(kind 7 이 늦으면 1회 대기 · 그 뒤 거래소 자동취소면 `CANCEL_REASON_LABELS[5]`「거래소 취소」, 아니면 사유 없이 「잔량 N주 취소」).

### Pattern 6: 탭 → 주문로그 (계좌 해석 필요)
**What:** payload `data.path = "/trading/order-log?stock=<ISIN>&date=<YYYY-MM-DD>"`(쿼리 이름은 `stock` · `date` 다 — `isin` 이 아님 [VERIFIED: webapp/src/lib/order-log-feed.ts:288-307 `params.get('stock')` · `params.get('date')`]). 웹이 `Capacitor.addListener('PushNotifications','pushNotificationActionPerformed', …)` 로 받아 `isSafeInternalPath`(native-bridge-provider.tsx:188-196 의 `navigate` 와 같은 검증) 후 `router.push`. iOS 는 `retainUntilConsumed: true` 로 냉시작 탭도 리스너 등록 때 전달되고 [VERIFIED: plugin ios PushNotificationsHandler.swift:79], Android 는 `BridgeActivity.onCreate` 가 `onNewIntent(getIntent())` 를 불러 `handleOnNewIntent` 가 `google.message_id` 묶음을 `actionId:"tap"` 으로 retain 발화한다 [VERIFIED: mobile/node_modules/@capacitor/android/.../BridgeActivity.java:51 · plugin PushNotificationsPlugin.java:69-88].
**함정:** 주문로그 창은 `account` 쿼리가 없으면 **시세 이벤트만** 보인다(order-log-window.tsx:18-19 「계좌가 없으면 시세 이벤트만 — 결정 1-A」). D-21 이 계좌를 payload 에 넣지 않으므로 웹 탭 처리기가 계좌를 해석해야 한다 → Open Question 1.

### Pattern 7: 앱 플러그인 · 웹 호출 관례
- 웹은 Capacitor npm 패키지 없이 `window.Capacitor.nativePromise(plugin, method, options)` 로 부른다(관례: native-google-login.ts `nativePromise('SocialLogin', …)`). 이벤트는 주입된 native-bridge 의 `cap.addListener(pluginName, eventName, callback)` → `{remove}` [VERIFIED: mobile/node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js:183-194]. 플러그인 유무는 `Capacitor.isPluginAvailable('PushNotifications')`(같은 파일 :835) — **옛 앱 빌드**(플러그인 없음)에서는 스위치 대신 「앱 업데이트 필요」.
- iOS `registration` 이벤트는 retain 이 아니다(PushNotificationsPlugin.swift:188-196 `notifyListeners("registration", data:)`) → **리스너를 먼저 붙이고 `register()`**.
- `registration.value` = iOS APNs 토큰 · Android FCM 토큰 [CITED: plugin README].
- `requestPermissions()` iOS 는 첫 호출만 프롬프트 · Android 12 이하는 항상 granted [CITED: plugin README · VERIFIED: PushNotificationsPlugin.java checkPermissions `< TIRAMISU` 분기].
- 포그라운드 표시: iOS `presentationOptions` 를 `UNNotificationPresentationOptions` 로 바꾼다(PushNotificationsHandler.swift:32-53) · Android 는 `presentationOptions` 에 `banner`/`list`/`alert` 가 있고 **`notification` 페이로드**일 때만 직접 그린다(PushNotificationsPlugin.java:258-290) → FCM 은 data-only 가 아니라 `notification` 을 반드시 싣는다.
- iOS 는 `AppDelegate.swift` 에 두 메서드 추가가 필수 [CITED: plugin README]:
```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}
func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```
- iOS 플러그인은 `capacitor-swift-pm` 만 의존한다(Firebase 없음) [VERIFIED: plugin Package.swift] → SC-5 「iOS 번들에 Firebase SDK 없음」은 구조적으로 성립.

### Anti-Patterns to Avoid
- **`dma_journal_apply` 재정의로 이전 상태 동봉:** 08~20시 배포 금지 대상(20261028210000:25) · 푸시 결함이 매초 적용을 멈출 수 있음.
- **relay 메모리로 직전 상태 보관:** D-07 기각.
- **푸시 리스너에서 await/throw:** writer 워커와 fanout 을 흔든다. enqueue 는 동기, 송신은 큐가.
- **기기 목록 60초 캐시:** 토글 반영 지연 · 경로 2벌. 송신 시 RPC 가 읽는다.
- **data-only FCM:** 앱이 종료돼 있으면 표시되지 않고(README: data-only 는 killed 상태에서 리스너로도 안 옴) 포그라운드 직접 표시도 안 된다.
- **본문에 계좌번호 · 로그에 토큰 원문:** T-19-14. 토큰은 끝 6자 마스킹만.
- **`AppAccess.userIdOf` 로 수신자 1명만:** 공유 계좌 다른 사용자 누락(D-06 위반).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 재생 멱등 | relay Set/LRU 로 「보낸 것」 기억 | `dma_push_chains` 단조 upsert | 재기동에 사라짐(D-07) · 파이프라인 재생성 |
| 체결 수량·상태 계산 | 저널 이벤트를 relay 에서 다시 누적 | `dma_account_orders` 투영값(`filled_qty` · status) | 투영 정본은 DB(writer.ts 머리 「하지 않는 것」) |
| 만원 금액 · 억 표기 | 새 반올림 | `amountFromQty` + `formatManwon` | Phase 31 규칙 · C# 동형 |
| 구분 · 취소 사유 낱말 | 새 표 | `ORDER_GROUP_LABELS` · `CANCEL_REASON_LABELS` | 표시명 정본 한 곳(strategy-event-labels.ts:46-56 · 98-111) |
| KST 날짜 | `toLocaleDateString` | shared `kstDateIso` | 거래일 경계 통일 |
| 웹 내부 경로 검증 | 정규식 새로 | `lib/safe-path.ts` `isSafeInternalPath` | `/\evil` 류 우회 이미 막음 |
| GCP 토큰 | 서비스계정 키 파일 | GCE 메타데이터 서버 | 키 파일 없음 원칙(로드맵) · deploy-relay 관례 |
| 앱 권한 UI | 커스텀 다이얼로그 | OS 권한 프롬프트(`requestPermissions`) + 설정 열기 | iOS 재요청 불가 — OS 경로만 유효 |

**Key insight:** 판정에 필요한 사실(체인 · 누적 · 짝 · 당일)은 전부 이미 DB 에 정규화돼 있다. relay 는 「언제 묻고 어디로 보낼지」만 쥐면 된다.

## Common Pitfalls

### Pitfall 1: 앞 리스너 예외가 푸시를 삼킴 / 푸시 예외가 뒤를 막음
**What goes wrong:** `emit` 한 번을 감싼 try/catch(writer.ts:640-648) 때문에 한 리스너가 throw 하면 나머지가 안 불린다.
**How to avoid:** 푸시 리스너는 fanout **뒤**에 등록 · 자기 try/catch · 동기 enqueue 만. 테스트: fanout 가짜가 정상일 때 푸시 리스너가 throw 해도 writer 가 다음 배치를 계속(기존 `journal-writer.test.ts` 리스너 예외 테스트 패턴).

### Pitfall 2: 적용 행에 게이트웨이 · 체결가 · 시각이 없다
**What goes wrong:** `JournalOrderRow` 에 `gateway` 칸이 없고(journal.ts:112-158), 적용 반환은 `price`(주문가 정본 — 체결가로 덮지 않음, 투영 E 갈래 주석)뿐이다.
**How to avoid:** gateway = `p.server.key`(파이프라인) · 체결가/평균가/시각은 RPC 가 `dma_journal_events`(E 행 `exec_price` · `exec_qty` · `gw_time`)에서 읽는다. 「조각 가격」 = 그 체인의 마지막 E `exec_price`, 「평균」 = Σ(exec_qty×exec_price)/Σexec_qty.

### Pitfall 3: 두 기록기의 적용 순서가 보장되지 않는다
**What goes wrong:** kind 3(구분)이 주문 A 행보다 늦게 DB 에 들어가 「상따」 폴백으로 나가거나, group 9(자동매도) 억제를 놓쳐 자동매도 주기 매도마다 ① 이 울린다.
**How to avoid:** Pattern 5 deferred 1회(1.5초) · `origin='limit_chaser'` 일 때만 대기. 테스트로 「전략 행 늦게 → 첫 호출 deferred → 재호출에 group 반영」 잠금.

### Pitfall 4: APNs 토큰 갱신 주기
**What goes wrong:** 요청마다 JWT 를 새로 만들면 `429 TooManyProviderTokenUpdates`, 1시간 넘게 쓰면 `403 ExpiredProviderToken`.
**How to avoid:** 「Refresh your token no more than once every 20 minutes and no less than once every 60 minutes」 [CITED: developer.apple.com establishing-a-token-based-connection-to-apns] → 50분 캐시 · 403 ExpiredProviderToken 이면 즉시 1회 재발급 후 재시도.

### Pitfall 5: aps-environment 와 서버 호스트 불일치
**What goes wrong:** TestFlight/App Store 빌드는 production APNs 토큰을 낸다. sandbox 호스트로 보내면 `400 BadDeviceToken`(「token matches the environment」 [CITED: handling-notification-responses-from-apns]) → 토큰 삭제 오판.
**How to avoid:** 운영은 `https://api.push.apple.com:443` 고정 · 기기 행 `apns_env`(기본 production) 를 두고 Xcode 직접 실행(디버그) 기기만 sandbox. `BadDeviceToken` 은 env 확인 전에는 토큰 삭제하지 말고(로그만) `410 Unregistered`/`ExpiredToken` 만 삭제.

### Pitfall 6: 수동 프로비저닝 프로파일에 Push 엔타이틀먼트가 없다
**What goes wrong:** iOS Fastfile 은 `get_provisioning_profile(readonly:false)` 로 「com.ghtrade.app AppStore」 프로파일을 **재사용**하고 export 는 `signingStyle: "manual"`(ios/App/fastlane/Fastfile:44-61). App ID 에 Push 를 켜도 옛 프로파일엔 `aps-environment` 가 없어 export 실패(또는 엔타이틀먼트 누락 IPA).
**How to avoid:** ① 개발자 포털 App ID 에 Push Notifications 켜기(사용자) ② 첫 릴리스 1회 `force: true` 로 프로파일 재생성(또는 포털에서 기존 프로파일 삭제) ③ `check-ipa.sh` 에 `aps-environment == production` 단언 추가.

### Pitfall 7: Android 조건부 google-services 가 조용히 꺼진다
**What goes wrong:** app/build.gradle:81-88 `try { if (servicesJSON.text) apply plugin } catch { logger.info(...) }` — 파일이 없으면 빌드는 성공하고 런타임에 `registrationError`(FirebaseApp 미초기화).
**How to avoid:** 파일 추적 + 조건부를 무조건 `apply plugin: 'com.google.gms.google-services'` 로(없으면 빌드 실패) · `check-apk.sh` 에 `google_app_id` 리소스 존재 단언(`aapt2 dump resources` 또는 `apkanalyzer`) [ASSUMED 도구 선택].

### Pitfall 8: 위생 검사 (2)(3)(8) 가 서로 묶여 있다
**What goes wrong:** (8)만 지우면 (2) 「`android/app/google-services.json` 이 ignore 돼야 한다」(check-release-hygiene.sh:59)와 (3) 추적 파일 정규식 `(^|/)google-services\.json$`(:67)이 계속 실패.
**How to avoid:** (2) 샘플 목록에서 `android/app/google-services.json` 제거 · (3) 정규식에서 그 정확한 경로(`mobile/android/app/google-services.json`)만 예외 · (8) 「없어야 한다」 → 「있어야 하고 `package_name == com.ghtrade.app` · `"private_key"` 키가 없다(SA 키 혼동 방지) · `project_id == gh-radar`」 로 반전 · `*service-account*.json` · `firebase-appdistro-service-account.json` 차단은 그대로. `.gitignore` 41~42 줄 제거. OK 줄 문구 「google-services.json 없음」 → 「google-services.json(Android) 검증」 으로.

### Pitfall 9: 주문로그 창은 계좌 없으면 주문을 안 보인다
**What goes wrong:** D-21 대로 계좌 없이 `/trading/order-log?stock=&date=` 를 열면 시세 이벤트만 보인다(order-log-window.tsx:18-19).
**How to avoid:** Open Question 1 권고안(웹 탭 처리기가 오늘 주문에서 그 종목 계좌를 찾아 `account` 를 붙임).

### Pitfall 10: docker `--env-file` 은 여러 줄 값을 못 싣는다
**What goes wrong:** .p8 는 PEM 여러 줄. deploy-relay.sh 는 `printf 'KEY=%s\n'` 로 env-file 을 쓴다(803-807) → 첫 줄만 들어감.
**How to avoid:** Secret 값을 base64 한 줄로 저장(`gh-radar-apns-auth-key` = base64(.p8)) → env `APNS_AUTH_KEY_B64` · relay 가 디코드. 이 Secret 은 **비치명**(KYOBO 비밀 패턴 — 없으면 푸시만 꺼진 채 기동).

### Pitfall 11: 옛 앱 빌드 · 웹 먼저 배포
**What goes wrong:** webapp push 가 프로덕션 즉시 배포인데 앱 재릴리스는 뒤. 옛 앱에서 `nativePromise('PushNotifications', …)` 는 「plugin not implemented」 로 거부.
**How to avoid:** `Capacitor.isPluginAvailable('PushNotifications')` 로 분기 · 없으면 「앱을 업데이트하면 켤 수 있어요」. D-20 숨김 조건에도 플러그인 유무 포함.

### Pitfall 12: 같은 폰 다른 계정
**What goes wrong:** 로그아웃 DELETE 가 실패(오프라인)하면 앞 사람 행이 남아 새 사람 폰으로 앞 사람 체결이 간다.
**How to avoid:** 토큰 전역 UNIQUE — 등록 RPC 가 같은 토큰의 **다른 사용자 행을 먼저 지우고** upsert(D-15 를 로그아웃 성공 여부와 무관하게 보장).

### Pitfall 13: Android 13+ 알림 권한 · 채널
**What goes wrong:** 채널을 안 만들면 FCM 기본 채널(「Miscellaneous」)로 가고 사용자가 이름을 못 알아본다 · 소형 아이콘 미지정이면 런처 아이콘이 흰 덩어리로.
**How to avoid:** 스위치 켤 때 `createChannel({id:'fills', name:'체결 알림', importance:4 /*HIGH*/, sound: undefined})`(기본 소리 · D-17) · Manifest `com.google.firebase.messaging.default_notification_channel_id = fills` · FCM `android.notification.channel_id = "fills"`. 소형 아이콘은 Open Question 4.

### Pitfall 14: 동시 진행 중인 Phase 39
**What goes wrong:** STATE.md 가 Phase 39 `executing`. 같은 트리에서 relay/webapp 테스트 동시 실행 시 메모리 고갈(10-10 사례) · git add 경합.
**How to avoid:** 전용 worktree · `--maxWorkers=2` · 전체 회귀는 한 세션만. `plan-phase` 가 STATE 를 덮는 경합 메모리 참고.

## Code Examples

### APNs 송신기 핵심 (node:http2 + ES256 JWT)
```typescript
// relay/src/push/apns.ts — 스켈레톤. 값(호스트 · 헤더 이름)은 Apple 문서, 구조는 권고.
import http2 from "node:http2";
import { createPrivateKey, sign, type KeyObject } from "node:crypto";

const APNS_HOST = "https://api.push.apple.com:443";      // [CITED] Production server
const JWT_REUSE_MS = 50 * 60_000;                         // 20분 < 재사용 < 60분 [CITED]

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export class ApnsSender {
  #key: KeyObject; #jwt: { token: string; at: number } | null = null; #session: http2.ClientHttp2Session | null = null;
  constructor(private o: { keyPem: string; keyId: string; teamId: string; topic: string }) {
    this.#key = createPrivateKey(o.keyPem);
  }
  #token(now = Date.now()): string {
    if (this.#jwt && now - this.#jwt.at < JWT_REUSE_MS) return this.#jwt.token;
    const head = b64url(JSON.stringify({ alg: "ES256", kid: this.o.keyId }));
    const claims = b64url(JSON.stringify({ iss: this.o.teamId, iat: Math.floor(now / 1000) }));
    const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key: this.#key, dsaEncoding: "ieee-p1363" });
    this.#jwt = { token: `${head}.${claims}.${b64url(sig)}`, at: now };
    return this.#jwt.token;
  }
  #sess(): http2.ClientHttp2Session {
    if (this.#session && !this.#session.closed && !this.#session.destroyed) return this.#session;
    const s = http2.connect(APNS_HOST);
    s.on("error", () => {}); s.on("goaway", () => s.close());   // 다음 요청이 새 세션을 연다
    s.unref();                                                  // 종료 절차를 붙잡지 않게
    return (this.#session = s);
  }
  send(token: string, payload: object, h: { collapseId: string; expirationSec: number }): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve) => {
      const req = this.#sess().request({
        ":method": "POST", ":path": `/3/device/${token}`,
        authorization: `bearer ${this.#token()}`,
        "apns-push-type": "alert", "apns-topic": this.o.topic, "apns-priority": "10",
        "apns-expiration": String(h.expirationSec), "apns-collapse-id": h.collapseId,   // 재시도 중복은 기기에서 합쳐진다
      });
      let body = ""; let status = 0;
      req.setTimeout(5_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on("response", (hd) => { status = Number(hd[":status"]); });
      req.on("data", (c) => { body += c; });
      req.on("close", () => resolve({ status, reason: body ? (JSON.parse(body) as { reason?: string }).reason : undefined }));
      req.on("error", () => resolve({ status: 0 }));        // 네트워크 — 호출자가 1회 재시도
      req.end(JSON.stringify(payload));
    });
  }
}
// payload: { aps: { alert: { title, body }, sound: "default", "thread-id": isin }, path }   // badge 없음(D-21) · thread-id = ISIN(D-18)
// 분류: 200 ok · 410(Unregistered/ExpiredToken) → 토큰 삭제 · 400 BadDeviceToken → 로그(Pitfall 5) · 403 ExpiredProviderToken → JWT 재발급 1회
//       429 → 그 run 중단(공식 API 운영 기준 4) · 5xx/0 → 1회 재시도 후 포기
```
상태 코드 · 사유 문자열 근거: 「`410` `Unregistered` The device token is inactive for the specified topic」 · 「`400` `BadDeviceToken` … matches the environment」 · 「`429` `TooManyProviderTokenUpdates` … no more than once every 20 minutes」 · 페이로드 「maximum size of 4 KB (4096 bytes)」 [CITED: developer.apple.com handling-notification-responses-from-apns · sending-notification-requests-to-apns].

### FCM v1 송신 (메타데이터 토큰)
```typescript
// relay/src/push/fcm.ts — 스켈레톤
const MD = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
let cached: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.exp - 60_000) return cached.token;
  const r = await fetch(MD, { headers: { "Metadata-Flavor": "Google" } });
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}
export async function fcmSend(project: string, token: string, m: { title: string; body: string; path: string; tag: string }) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ message: {
      token,
      notification: { title: m.title, body: m.body },                         // notification 필수(Pattern 7)
      android: { priority: "HIGH", notification: { channel_id: "fills", sound: "default", tag: m.tag } },
      data: { path: m.path },                                                 // data 값은 문자열만
    } }),
    signal: AbortSignal.timeout(5_000),
  });
  // 200 ok · 404 UNREGISTERED → 토큰 삭제 · 400 INVALID_ARGUMENT → 페이로드가 확실히 정상일 때만 삭제(테스트로 잠근 고정 모양)
  // 403 SENDER_ID_MISMATCH → 설정 오류 로그(삭제 금지) · 429 QUOTA_EXCEEDED → run 중단 · 5xx → 1회 재시도
  return res;
}
// 스모크: body 에 "validate_only": true 를 실으면 기기 없이 권한·형식을 검증할 수 있다 [ASSUMED — v1 API 필드]
```
FCM 근거: 엔드포인트 `POST https://fcm.googleapis.com/v1/projects/{project}/messages:send` · scope `https://www.googleapis.com/auth/firebase.messaging` · Compute Engine 은 ADC 의 기본 서비스계정 사용 [CITED: firebase.google.com/docs/cloud-messaging/send/v1-api] · UNREGISTERED(404)/INVALID_ARGUMENT(400)이면 토큰 삭제 안전 [CITED: firebase.google.com/docs/cloud-messaging/manage-tokens].

### 문안(shared) — 스케치 029 C 안
```typescript
// packages/shared/src/push-message.ts — 정본 문안은 sketch 029 index.html:97-121
// 접수  「금양그린파워 · 선매수 접수」 / 「500주 (156만) · 3,120 · KRX 09:00:31」
// 첫체결 「… · 선매수 체결」 / 「200주 체결 (62만) · 잔량 300주 · 3,120 · KRX 09:00:31」
// 전량  「… · 선매수 전량 체결」 / 「500주 (156만) 전량 · 평균 3,120 · KRX 09:00:33」
// 거부  「… · 줄매수 거부」 / 「주문가능금액 부족 · 300주 (94만) · 3,120 · NXT 09:00:32」
// 취소  「… · 줄매수 취소」 / 「매수1 이탈 · 잔량 300주 (94만) · KRX 09:05:10」
// 자동매도 시작 「… · 자동매도 시작」 / 「보유 500주 (156만) · 기준 상한가 · 09:40:00」
// 자동매도 완료 「… · 자동매도 완료」 / 「500주 (155만) 매도 · 평균 3,105 · 손익 −0.5% · 09:41:12」
import { amountFromQty, formatManwon } from "./lc-amount";
const qtyMan = (qty: number, price: number) => `${qty.toLocaleString("ko-KR")}주 (${formatManwon(amountFromQty(qty, price))})`;
// 시그니처에 계좌 인자를 두지 않는다(SC-4 · T-19-14 구조 방어). 음수 부호는 U+2212(스케치 「−0.5%」).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FCM legacy HTTP(server key) | FCM HTTP v1 + OAuth2 | legacy API 종료(2024) [ASSUMED] | server key 없음 — SA/ADC 토큰만 |
| APNs 인증서(.p12) | 토큰 기반(.p8 · JWT) | 수년 전 | 키 1개로 sandbox/production 공용 · 만료 없음 |
| iOS `alert` presentation | `banner` + `list` | iOS 14 | README 「`alert` is deprecated on iOS」 [CITED: plugin README] |

**Deprecated/outdated:** `presentationOptions: ["alert"]` — iOS 에선 `banner`/`list` 를 쓴다(Android 는 셋 다 표시 트리거).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node `EventEmitter.emit` 은 리스너가 throw 하면 이후 리스너를 부르지 않는다 | Pattern 1 · Pitfall 1 | 낮음 — 방어 코드는 어느 쪽이든 같다 |
| A2 | VM 의 `cloud-platform` 범위 메타데이터 토큰으로 FCM v1 이 통과한다(문서는 `firebase.messaging` 범위를 명시) | Code Examples FCM | 중간 — 403 이면 메타데이터 `?scopes=` 지정 또는 범위 재설정. `validate_only` 스모크로 첫 배포 때 확인 |
| A3 | 자동매도(group 9) 주문은 ①접수 · ⑤서버 취소도 보내지 않는다(D-02 는 「첫/전량」만 명시) | Pattern 3 규칙 10 | 중간 — 안 막으면 주기 매도(기본 3초)마다 접수 푸시 폭주. **사용자 확인 필요** |
| A4 | relay 가 VM SA 에 `roles/firebasecloudmessaging.admin`(Firebase Cloud Messaging API Admin)을 받으면 `cloudmessaging.messages.create` 가 생긴다 · `fcm.googleapis.com` API 사용 설정 필요 | Environment | 중간 — IAM 문서 스니펫 기반(CITED, 표 판독 불완전). 더 좁은 `roles/cloudmessaging.editor` 대안 |
| A5 | 로컬 거부(주문번호 없음) ↔ kind 8 짝은 (계좌 · isin · result_code · 3초 창) 휴리스틱으로 충분 | Pattern 5 | 낮음 — 틀리면 구분 낱말만 폴백 |
| A6 | 자동매도 주문의 저널 `origin` 은 `LimitChaser`(→ limit_chaser) 다 | Pattern 5 대기 조건 | 중간 — 다르면(빈 값) group 대기를 건너뛰어 억제 실패. 대기 조건을 `origin IN ('limit_chaser') OR origin IS NULL AND side='S'` 로 넓히는 안 |
| A7 | 손익 % = Σ`realized_pnl_krw` / Σ(exec_qty × `avg_price`) (Phase 36 저널 손익 칸) | ⑦ 본문 | 중간 — 사용자가 「기준가 대비」를 원할 수도. **사용자 확인 필요** |
| A8 | `google-services.json` 은 비밀이 아니다(Firebase 가 공개 클라이언트 설정으로 취급) | Standard Stack · Pitfall 8 | 낮음 — 로드맵이 이미 허용 방향 |
| A9 | firebase-messaging AAR 이 `POST_NOTIFICATIONS` 권한을 매니페스트 병합으로 싣는다(플러그인 매니페스트엔 없음) | Pitfall 13 | 낮음 — 없으면 앱 매니페스트에 한 줄 |
| A10 | FCM v1 `validate_only` 필드로 무기기 스모크 가능 | Code Examples | 낮음 |
| A11 | 로드맵 「Gradle 세 곳 조정」 = app/build.gradle 조건부 apply 무조건화 · variables.gradle `firebaseMessagingVersion` 고정 · (classpath 는 이미 있음 → 세 번째는 Manifest meta-data 로 추정) | Pitfall 7 | 낮음 — 로드맵 문구의 원 의도 미기록 |
| A12 | WKWebView localStorage 는 앱 재설치 전까지 유지된다(기기 키 보관) | 기기 식별 | 낮음 — 사라져도 토큰 UNIQUE upsert 가 같은 기기 행으로 옮긴다 |

## Open Questions

1. **탭 착지에 계좌가 없으면 주문로그가 비어 보인다 (D-21 vs order-log-window 결정 1-A)**
   - What we know: `/trading/order-log` 는 `account` 쿼리 없으면 시세 이벤트만(order-log-window.tsx:18-19). D-21 은 payload 에 계좌를 넣지 않는다.
   - What's unclear: 「가시 계좌 전부」를 어떻게 보일지.
   - Recommendation: **웹 탭 처리기에서 해석** — `data.path` 를 받으면 오늘 주문(`GET /api/orders` · 기존 REST · D-11 로 푸시는 당일분만)에서 그 `isin` 의 가장 최근 주문 계좌를 찾아 `&account=` 를 붙여 연다(없으면 계좌 없이). payload 무변경(D-21 준수). 대안: 주문로그에 「전체 계좌」 모드 추가(범위 커짐). discuss/plan 체크포인트에서 확인.

2. **⑥ 자동매도 시작의 「보유 N주 (금액)」 원천**
   - What we know: kind 11 은 `qty 0` · 기준 종류(`queue_case`) · 기준가격(`bid1_price`) · 발동가(`price`) · 실측가(`cond_actual`)만 싣는다 [VERIFIED: StockDMA.fbs:1474-1477]. gh-trade 수정은 SC-3(gh-trade 서버 diff 0)이 막는다.
   - Recommendation: relay hub 계좌 캐시에 `holdingOf(serverKey, accountNo, isin)` 를 `liveBudgetOf`(subscription-hub.ts:2278-2289) 동형으로 두고, 있으면 「보유 N주 (M만)」, 없으면(그 계좌 웹 세션 없음) 그 조각을 빼고 「기준 상한가 3,120 · 발동가 3,050 · 09:40:00」. 사용자 확인 필요.

3. **⑦ 평균가·손익 % 계산 범위**
   - Recommendation: 그 계좌·종목의 kind 11 발동 시각 이후 매도 E 행 전부(거래소 불문)로 평균 · 손익은 A7. 수량은 kind 13 `qty`(누적 매도수량 — StockDMA.fbs:1481) 그대로.

4. **Android 알림 소형 아이콘**
   - What we know: D-17 은 「소리 파일」 리소스 추가 없음. 아이콘 meta-data 가 없으면 런처 아이콘을 쓴다.
   - Recommendation: 흰색 단색 벡터 1개(`res/drawable/ic_stat_ghtrade.xml`) 추가를 UI-SPEC 에서 확정 — D-17 범위(소리) 밖이라 허용 가능성 높음.

5. **설정 열기 버튼(D-14)의 네이티브 경로**
   - What we know: 플러그인에 설정 열기 API 없음. 웹→네이티브 채널 허용 타입은 `"ready","route","theme","overlay","pull"`(Android GhTradeBridge.kt:93) — iOS 도 같은 화이트리스트 관례.
   - Recommendation: `postNative('openSettings')` 새 타입 + iOS `UIApplication.openSettingsURLString` · Android `Settings.ACTION_APP_NOTIFICATION_SETTINGS` 핸들러(양 플랫폼 화이트리스트 · post-native.ts `NativeMsgType` 동시 갱신). 옛 앱은 false 반환 → 안내 문구만.

6. **기기명 표기(D-13)** — UA(Android 모델명 · iOS 「iPhone/iPad」+OS) vs `@capacitor/device`. UI-SPEC 에서 결정(권고: UA, 부족하면 device 플러그인).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | relay/server/webapp 빌드·테스트 | ✓ | 로컬 v24.21.0 · 운영 컨테이너 node:22-alpine | — |
| pnpm | 워크스페이스 | ✓ | 11.15.1(로컬) · Dockerfile 은 pnpm@10 고정 | — |
| Docker + `public.ecr.aws/supabase/postgres:17.6.1.104` | pgTAP 러너 | ✓ | Docker 29.8.2 · 이미지 로컬 존재 | — |
| Xcode | iOS 빌드·릴리스 | ✓ | 27.1 | — |
| JDK 21 | Android Gradle | ✓ | 21.0.9 | — |
| supabase CLI | `db push --linked --yes` | ✓ | 2.75.0 | — |
| gcloud | Secret · IAM · API 사용 설정 | ✓ | 설치됨(deployer SA 메모리) | 사용자 `!` 실행 |
| Apple APNs Auth Key(.p8) · Key ID | APNs 송신 | ✗ | — | **없음 — 사용자가 개발자 포털에서 발급**(Team 954QPCS3F5 · `DEVELOPMENT_TEAM` pbxproj:333) |
| App ID Push capability | iOS 엔타이틀먼트 | ✗ | — | 사용자 포털 작업 |
| Firebase Android 앱 `google-services.json` | FCM | ✗(저장소에 없음) | — | 사용자 콘솔 다운로드(App Distribution 용 Android 앱이 이미 등록돼 있어 그 앱에서 받는다) |
| `fcm.googleapis.com` API 사용 설정 · relay SA FCM 역할 | FCM 송신 | ? | — | 사용자 `!` 실행 스크립트(setup-relay-iam.sh 확장) |
| 실기기(iPhone · Android) | SC-1 3초 · 탭 확인 | 사용자 | — | 수동 UAT |

**Missing dependencies with no fallback:** APNs 키 · App ID Push · `google-services.json` · FCM 역할/API — 전부 사용자 외부 선행(로드맵 명시). 플랜은 이 셋을 `checkpoint:human-action` 으로 두고 그 전까지 relay 는 「푸시 꺼짐」으로 배포 가능해야 한다.

**Missing dependencies with fallback:** 없음.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x(shared · relay · server · webapp) · pgTAP(로컬 일회용 Postgres 컨테이너) · Playwright(webapp e2e — 이 phase 는 선택) |
| Config file | relay/vitest.config.ts(`maxWorkers` 기본 2) · relay/tsconfig.tests.json · webapp/server 기존 설정 |
| Quick run command | `pnpm --filter @gh-radar/relay exec vitest run tests/push-notifier.test.ts --maxWorkers=2` |
| Full suite command | config `workflow.build_command` + `test_command` (shared build → relay typecheck/typecheck:tests → webapp typecheck · relay test · webapp test) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | 3조각 체결(500주: 200/150/150) → 첫 체결 1 + 전량 1 = 2건 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_push_claim.test.sql` | ❌ Wave 0 |
| SC-1 | 한 묶음 접수→전량 → 「전량」 1건 · 첫 조각에 다 참 → ③만 | pgTAP | 위와 같음 | ❌ |
| SC-1 | 문안 7종 = 스케치 029 C 안 골든 · 만원 · KST 초 · 계좌 없음 | unit | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/push-message.test.ts --maxWorkers=2` | ❌ |
| SC-1 | 탭 data.path 검증 · 계좌 해석 · router.push | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/push --maxWorkers=2` | ❌ |
| SC-1 | 실기기 3초 도착 · 탭 착지 · 포그라운드 배너 | manual-only | UAT(실기기 · 장중 소액 또는 mock 게이트웨이) — 네트워크·OS 의존이라 자동화 불가 | — |
| SC-2 | 같은 배치 2번(WR-09 skipped 재전송) → 2번째 RETURNING 0 · 송신 0 | pgTAP | 위 pgTAP | ❌ |
| SC-2 | relay 재기동 = 큐 비움 후 같은 행 재enqueue → 송신 0 | unit(가짜 RPC) | `pnpm --filter @gh-radar/relay exec vitest run tests/push-notifier.test.ts --maxWorkers=2` | ❌ |
| SC-2 | 정정 체인(원 500 → 정정 200 → 양쪽 체결) → 접수 1 · 첫 체결 1 · 전량 1 | pgTAP | 위 pgTAP | ❌ |
| SC-2 | 지난 거래일 행 → outcome 'stale' 기록 · 송신 0 | pgTAP | 위 pgTAP | ❌ |
| SC-3 | 푸시 리스너 throw/RPC 실패/송신 실패에도 writer 다음 배치 · fanout 정상 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/push-notifier.test.ts tests/journal-writer.test.ts --maxWorkers=2` | 일부(journal-writer ✅) |
| SC-3 | 주문·판정 경로 diff 0 | grep 게이트 | `git diff --stat <base>..HEAD -- relay/src/order relay/src/dma supabase/migrations/*journal_apply* ` 가 비어야 함 + `dma_journal_apply` 재정의 없음 grep | — |
| SC-3 | APNs 410 / FCM 404 → `dma_push_report` 가 그 기기 삭제(토큰 일치 시만) · 400 BadDeviceToken 삭제 안 함 | unit + pgTAP | `pnpm --filter @gh-radar/relay exec vitest run tests/push-apns.test.ts tests/push-fcm.test.ts --maxWorkers=2` · pgTAP | ❌ |
| SC-3 | JWT 50분 재사용 · ExpiredProviderToken 1회 재발급 | unit(가짜 시계) | 위 push-apns | ❌ |
| SC-4 | 다른 사용자 계좌 · 토글 꺼진 기기 · viewer → 수신자 0 · 공유 DMA id 두 사용자 → 둘 다 | unit + pgTAP | push-notifier(수신자 계산) · pgTAP(enabled 거름) | ❌ |
| SC-4 | 같은 토큰 다른 사용자 등록 → 앞 사용자 행 삭제 | pgTAP | 위 pgTAP | ❌ |
| SC-4 | 기기 API: 남의 device id PATCH/DELETE → 404 · 미인증 401 · 입력 검증 400 | unit(route) | `pnpm --filter @gh-radar/server exec vitest run src/routes/__tests__/push-devices.route.test.ts --maxWorkers=2` | ❌ |
| SC-4 | RPC 권한: anon/authenticated EXECUTE 없음 · 표 SELECT 없음 | pgTAP | 위 pgTAP(`has_function_privilege` 단언) | ❌ |
| SC-5 | 위생 검사 OK(google-services.json 추적 허용 · SA 키 차단 유지) | script | `bash mobile/scripts/check-release-hygiene.sh` | ✅(수정 필요) |
| SC-5 | IPA 에 Firebase 프레임워크 0 · aps-environment production | script | `check-ipa.sh`(릴리스 lane 안) | ✅(보강 필요) |
| SC-5 | 양 플랫폼 릴리스 | manual(사용자 · `native:release`) | `pnpm --filter @gh-radar/mobile run native:release` | — |
| D-20 | 앱 + 켜짐 + 권한 granted + 플러그인 있음 → accept/fill/modify/cancel/reject/vi 숨김 · breakout 유지 · 웹은 전부 표시 | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/workbench src/lib/push --maxWorkers=2` | ❌ |

### Sampling Rate
- **Per task commit:** 해당 패키지 quick 명령(위 표의 단일 파일 vitest · pgTAP 1파일).
- **Per wave merge:** `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/server run typecheck` + relay/webapp/server `vitest run --maxWorkers=2` + pgTAP `dma_push_claim` · 기존 `dma_journal_apply.test.sql`(무변경 회귀).
- **Phase gate:** 전체 green + 위생 검사 OK + 실기기 UAT(iOS · Android 각 1회: 3조각 → 2건 · 탭 착지 · 토글 끔 → 0건) 전 `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `supabase/tests/dma_push_claim.test.sql` — SC-1·2·4 DB 판정 · 멱등 · 체인 · 당일 · 짝 deferred · 토큰 UNIQUE · 권한(픽스처: 금양그린파워 3,120 × 500주 — CONTEXT specifics)
- [ ] `packages/shared/src/__tests__/push-message.test.ts` — 문안 골든 7종
- [ ] `relay/tests/push-notifier.test.ts` — 큐 · 정착 · 단일 비행 · deferred 재호출 · 수신자 · 예외 격리
- [ ] `relay/tests/push-apns.test.ts` · `relay/tests/push-fcm.test.ts` — 응답 분류 · JWT 주기 · 토큰 캐시(가짜 http2/fetch)
- [ ] `server/src/routes/__tests__/push-devices.route.test.ts`
- [ ] `webapp/src/lib/push/__tests__/*.test.ts` — 네이티브 래퍼(가짜 `window.Capacitor`) · 탭 처리 · 숨김 조건
- 프레임워크 설치: 없음(전부 기존).

## Sources

### Primary (HIGH confidence)
- 코드베이스(이 세션에 직접 읽음): relay/src/index.ts:500-508 · relay/src/journal/writer.ts:618-656 · supabase/migrations/20261028210000_dma_journal_pnl.sql(전체) · 20260924200000_dma_journal_tables.sql(전체) · 20260924200100_dma_journal_rpcs.sql:55-380 · 20260929180000_dma_strategy_events.sql · 20261007200100_dma_visibility_v2.sql:26-36 · packages/shared/src/journal.ts · strategy-event-labels.ts · lc-amount.ts:195-226 · relay/src/generated/StockDMA.fbs:1455-1560 · relay/src/access/app-access.ts · relay/src/ws/fanout.ts:3330-3373 · webapp lib/native/* · lib/order-log-feed.ts:255-322 · components/trading/order-log/order-log-window.tsx · lib/trading-alerts.ts · mobile/* (capacitor.config.ts · package.json · .gitignore · android build.gradle 2종 · check-release-hygiene.sh · check-ipa.sh · ios Fastfile) · scripts/deploy-relay.sh · scripts/setup-relay-iam.sh
- gh-trade: server/src/trade/strategy/LimitChaser.cpp:7609-7616(자동매도 완료 = 보유 0 ∧ 나간 매도 0) · server/src/trade/journal/JournalFormat.cpp:144 · server/src/broker/IBroker.h:218
- `@capacitor/push-notifications@8.1.3` 패키지 소스(npm pack): Package.swift · android/build.gradle · PushNotificationsPlugin.java · PushNotificationsHandler.swift · PushNotificationsPlugin.swift
- Apple Developer 문서 JSON: establishing-a-token-based-connection-to-apns · sending-notification-requests-to-apns · handling-notification-responses-from-apns

### Secondary (MEDIUM confidence)
- [Firebase — Send using HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api) — 엔드포인트 · scope · ADC
- [Firebase — Manage registration tokens](https://firebase.google.com/docs/cloud-messaging/manage-tokens?authuser=7) — UNREGISTERED/INVALID_ARGUMENT 삭제 규칙
- [Firebase — FCM error codes](https://firebase.google.com/docs/cloud-messaging/error-codes?hl=de) — 오류 코드 목록(다국어 판독)
- [Google Cloud IAM — Firebase Cloud Messaging roles](https://cloud.google.com/iam/docs/roles-permissions/firebasecloudmessaging) — `roles/firebasecloudmessaging.admin` · `cloudmessaging.messages.create`
- [ionic-team/capacitor-plugins push-notifications README](https://raw.githubusercontent.com/ionic-team/capacitor-plugins/main/push-notifications/README.md)

### Tertiary (LOW confidence)
- 없음(LOW 항목은 Assumptions Log 로 이동).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 플러그인 소스 · npm · 레지스트리 감사 · node 내장 모듈.
- Architecture: HIGH — 송신 지점 · 투영 규칙 · 짝 색인 · 수신자 규칙 모두 코드에서 확인. 단계 규칙의 정정 엣지(부분 정정 뒤 원주문 잔량 취소)는 MEDIUM.
- Pitfalls: HIGH(코드 근거) / MEDIUM(FCM 범위 · IAM).

**Research date:** 2026-11-06
**Valid until:** 2026-12-06(플러그인 9.x 가 latest 로 올라오거나 Capacitor 9 이전 시 재확인)
