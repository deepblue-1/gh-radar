# Quick 261109-dz1 — 매매 알림(앱 푸시) 계좌별 켜고 끄기 · CONTEXT

사용자 요청(2026-11-09): 「푸시 알림 키고 끄는걸 계좌별로 할 수 있게 수정하자.」
목업: `.planning/sketches/031-push-per-account-toggle/index.html` — **A 채택**.

## 결정 (locked — 다시 묻지 않는다)

- **D-01 의미 = 사용자 × 계좌 끄기.** 계좌를 끄면 그 사용자의 **모든 기기**에서 그 계좌 사건(접수 · 체결 · 거부 · 취소 · 자동매도)
  푸시가 안 간다. 기기 스위치(`dma_push_devices.enabled`)와 별개 — 둘 다 켜져야 간다. 기기 × 계좌 조합은 만들지 않는다.
- **D-02 기본 켜짐.** 저장은 「끈 계좌」 만(행 있음 = 꺼짐). 새 계좌 · 기존 사용자는 아무 행 없이 지금처럼 다 받는다.
- **D-03 계좌 키 = account_no(정규화 문자열, ≤ 12자).** 서버(게이트웨이) 구분 없이 그 번호의 사건 전부 — `dma_push_claim` 의
  `p_recipients` 키 · `dma_push_log.account_no` 와 같은 값.
- **D-04 공유 계좌의 다른 사용자는 영향 없음** — 끄기는 본인 user_id 행만.
- **D-05 판정은 DB 에서.** `dma_push_claim` 의 기기 고르기(`FROM dma_push_devices d WHERE d.enabled …`)에
  「(d.user_id, 그 사건 account_no) 끈 행이 없음」 조건을 더한다 → **relay 무변경 · relay 배포 없음**.
  끈 사용자만 남으면 기기 0 → 기존 「기기 0 이면 아무것도 쓰지 않는다」 분기를 그대로 탄다(체인 · 로그 미기록 — 나중에 켜면 다음 단계를 받는다).
  `CREATE OR REPLACE` 새 마이그레이션(원본 20261107100100 은 수정하지 않는다) — 함수 본문 전체를 옮기되 바뀌는 줄은 그 조건 하나.
- **D-06 UI = 스케치 031 A.** 계정 카드 종 → 「매매 알림」 시트(폰 · 앱) / 팝오버(데스크톱)인 `PushDevicesPanel` 안,
  이 기기 스위치 아래 · 다른 기기 목록 위에 소제목 **「받을 계좌」** + 계좌마다 한 줄(상품명 굵게 아님 14px · 아래 12px 「번호 · 서버키」) + 스위치.
  섹션 끝 안내 한 줄 「끈 계좌는 내 모든 기기에서 알림이 오지 않아요.」. **PC 웹에서도** 계좌 스위치는 켜고 끌 수 있다(권한 불필요).
  계좌가 0 개면(relay 미연결 · DMA 없음) 섹션을 숨긴다. 종의 초록 점 판정은 그대로(이 기기 기준).
- **D-07 계좌 목록 출처 = /me 계좌 칩과 같은 relay 계좌(`RelayAccount` — accountNo · name · serverKey).** 패널은 전역
  `RelayProvider` 안에 있다. 같은 번호가 여러 서버에 있으면 한 줄(번호 기준 dedupe — D-03). 상품명이 비면 번호만.
- **D-08 API(server):** 기존 `/api/push-devices` 라우터 규율 그대로(requireAuth · `p_user_id = req.userId` · zod `.strict()` · service_role RPC).
  - `GET  /api/push-devices/accounts` → 끈 계좌번호 배열(bare array `string[]`)
  - `PUT  /api/push-devices/accounts/:accountNo` body `{ enabled: boolean }` → `{ ok: true }` (멱등 — false = 끈 행 upsert · true = 행 삭제)
  - 라우트 순서 주의: `/:deviceKey` 보다 먼저 등록하거나 deviceKey zod(UUID)가 `accounts` 를 걸러내는지 확인.
  - 남의 계좌번호를 꺼도 자기 수신에만 영향이므로 가시성 검사는 하지 않는다(길이 · 빈 값만 검증).
- **D-09 DB:** 새 표 `dma_push_account_mutes(user_id uuid FK auth.users ON DELETE CASCADE, account_no text CHECK 1..12자, created_at)`
  PK (user_id, account_no). RLS on · 정책 0 · PUBLIC/anon/authenticated 명시 REVOKE · service_role GRANT.
  RPC 2개(SECURITY INVOKER · service_role 전용 EXECUTE · anon/authenticated 명시 REVOKE):
  `dma_push_account_mutes_for_user(uuid) → jsonb(text 배열)` · `dma_push_account_mute_set(uuid, text, boolean p_enabled) → boolean`.
- **D-10 낙관적 갱신.** 스위치는 즉시 바뀌고 실패하면 되돌리고 기존 `actionFailed` 문구를 띄운다. 끈 목록은 `usePushDevices` 와 같은 모듈
  저장소 패턴(마운트 때 낡았으면 1회 · 폴링 없음)으로 읽는다.

## 배포 (executor 는 커밋까지만 — 배포는 메인 세션)
순서: `supabase db push --linked --yes`(새 표 + claim 교체) → server `scripts/deploy-server.sh` → git push(webapp).
relay 는 바뀌지 않는다.

## 하지 않는 것
- relay 코드 · 배포.
- 기기 × 계좌 조합 · 사건 종류별(접수만 끄기 등) 끄기.
- 종 초록 점 의미 변경.
