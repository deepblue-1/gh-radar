# Phase 29 — 범위 밖 발견 (deferred)

## 29-15 실행 중

- **`components/ui/button.tsx` `size="sm"` 글자 크기 · 변형 글자색 충돌.** `sm` 의 `text-[var(--t-caption)]` 을
  tailwind-merge 가 「글자색」 으로 읽어, 같은 버튼의 변형 글자색(`text-[var(--primary-fg)]` · `--secondary-fg`)을
  지우고 글자 크기도 주지 못한다(부모 글자 크기를 물려받는다). 실측: `twMerge("… text-[var(--primary-fg)] … text-[var(--t-caption)]")`
  → `text-[var(--primary-fg)]` 소실. 라이트 테마의 기본(파랑) 작은 버튼은 글자가 `--fg`(검정)로 그려질 수 있다.
  29-15 는 Admin 버튼에만 `ADMIN_BUTTON_PRIMARY/SECONDARY`(크기 · 색 재지정)로 피했다. 근본 수정은
  `text-[length:var(--t-caption)]` 로 바꾸는 것이지만 모든 `size="sm"` 사용처의 시각이 바뀌므로 별도 quick 으로.

## 29-17 실행 중

- **`components/chat/chat-sheet.tsx` 우측 시트 폭이 440 이 아니라 384px 일 가능성.** 기본 `SheetContent` 의
  `data-[side=right]:w-3/4 · data-[side=right]:sm:max-w-sm` 는 속성 선택자라 맨 `w-full · sm:max-w-[440px]` 보다 명시도가 높아
  이긴다(tailwind-merge 는 변형 접두가 달라 둘 다 남긴다). `AdminSheet` 는 29-17 e2e 실측(384px)으로 같은 접두를 달아 고쳤다
  (`data-[side=right]:w-full data-[side=right]:sm:max-w-[440px]`). chat-sheet(262행)도 같은 문법이라 같은 결함으로 보인다 — 실측 뒤 별도 quick.
- **데스크톱 Admin 시트의 배경 흐림.** 공용 `SheetOverlay`(backdrop-blur) 때문에 우측 패널이 열리면 왼쪽 목록이 흐려지고 클릭하면 시트가
  닫힌다. 목업 A 의 데스크톱 `.panel` 은 스크림 없이 목록이 그대로 보이는 그림이다(D-14 「목록은 남는다」 — 행 사이 이동). 비모달
  시트(포커스 트랩 · 바깥 클릭 의미가 바뀐다)는 29-15 `AdminSheet` 골격의 결정이라 이 플랜에서 바꾸지 않았다.

## 29-18 실행 중

- **e2e 목 `mockAdminApi` 의 `quote-primary` 처리가 증권사 안에서만 플래그를 바꾼다.** `webapp/e2e/fixtures/admin.ts` 는
  `order-server` 와 `quote-primary` 를 같은 분기로 처리해 `s.broker === target.broker` 인 서버만 `isQuotePrimary` 를 고친다.
  시세 주 서버는 증권사와 무관하게 전체 1대(D-11 · D-17)라, 다른 증권사로 전환이 「성공」 하면 목 상태에 시세 주 서버가 2대가 된다.
  29-18 플랜은 이 픽스처를 고치지 않는다고 정했고(필요한 응답은 spec 안 `onRequest` 로 덮는다), P29-S2 는 실패 경로(409)만 써서
  영향이 없다. 성공 경로 e2e 가 필요해지면 분기를 나눠 전체 서버의 `isQuotePrimary` 를 바꾸도록 고친다.

## 29-37 실행 중

- **Express pino-http 접근 로그가 요청 URL 원문을 남겨 경로의 계좌번호 · DMA id 가 로그에 실린다.**
  status: open
  `DELETE /api/admin/dma-users/:dma/accounts/:broker/:accountNo`(29-13)와 29-37 의 `PUT …/order-server` 모두 경로에 계좌번호가 있다.
  감사 줄(`audit`)은 마스킹되지만 pino-http 의 `req.url` 은 그대로다(29-37 감사 테스트가 이 때문에 감사 줄만 단언한다). 이 플랜 이전부터
  있던 모양이고 이 플랜 범위(지정 API)가 아니라 고치지 않았다 — 고치려면 server `logger` 의 pino-http `req` serializer 에서
  `/api/admin/dma-users/` 아래 경로 세그먼트를 마스킹한다(전 Admin 라우트 공통이라 별도 quick).

## 29-40 실행 중

- **relay 소스 머리 주석의 관찰자 정원이 아직 4 다.** `relay/src/quote/feed.ts` 19행 「관찰자 정원(kMaxObservers 4 · journal+quote 합산)」.
  status: open
  29-40 은 README(`infra/relay/README.md` 503 원인 표)를 6(journal + admin + quote 합산 · 서버당 journal 1 + admin 1, quote 는 시세 주
  서버 1)으로 고쳤고 `relay/src/admin/admin-conn.ts` 머리 주석은 이미 6 이다. feed.ts 는 이 플랜 파일 범위 밖이라 주석을 고치지 않았다
  — 동작 영향 없음(주석뿐). 다음에 feed.ts 를 만지는 플랜이 한 줄 고친다.
