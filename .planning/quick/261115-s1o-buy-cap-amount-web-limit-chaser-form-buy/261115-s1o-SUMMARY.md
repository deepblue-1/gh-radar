---
phase: quick-261115-s1o
plan: 01
status: complete
subsystem: relay · shared · webapp(상따 설정 폼)
tags: [limit-chaser, buy3-schema, change-mask, gh-trade-inbox, flatbuffers]
requires:
  - gh-trade 8d073739 (quick-261115-ptq) SetLimitChaser.buy_cap_amount(id 90 · vt 184)
provides:
  - relay buy3_schema 9 (LC_BUY_CAP_BUY3_SCHEMA) — buy_cap_amount 송수신
  - shared 비트 표 55행(54 = buy_cap_amount) · RelayLimitChaser.buyCapAmount
  - 웹 상따 매수주문 카드 맨 아래 「최대금액」 행(lc-buy-cap-amount)
affects:
  - relay/src/dma/envelope.ts · relay/src/ws/protocol.ts
  - packages/shared/src/relay.ts · packages/shared/src/lc-change-mask.ts
  - webapp/src/lib/limit-chaser.ts · webapp/src/components/trading/lc/lc-fields.ts · webapp/src/lib/lc-ranges.ts
tech-stack:
  added: []
  patterns: ["schema 세대 단조 파생(존재로만) + 미달 강등 warn", "shared 는 새 클라 필수 · relay 와이어는 구 탭 관용 선택"]
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/set-limit-chaser.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/lc-change-mask.ts
    - relay/src/dma/envelope.ts
    - relay/src/ws/protocol.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/src/dma/__tests__/lc-change-mask.test.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/fanout.test.ts
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/test-fixtures/limit-chaser.ts
    - webapp/src/lib/lc-ranges.ts
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-tracer.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - docs/inbox/from-gh-trade/261115-buy-cap-amount.md
decisions:
  - "최대금액 자리 = 웹 매수주문 카드 맨 아래(버스트 취소 아래) — PC 마스터 흐림 묶음(주문가격 · 비교가격 · 최대금액) 동형"
  - "최대금액 표시 단위 글자 = 「만」(값은 만원) — 계획의 「만원」 은 폰 밴드(본문 344)에서 최악값이 4 ~ 5px 넘쳐 PC 칸 단위로 바꿈"
  - "최대금액 0 표시 = 「제한 없음」 · 입력 0 ~ 999,999,999 · relay zod 는 UIntSchema(서버 검증 없음)"
  - "relay 는 buyCapAmount 존재 + 앞 여덟 조건일 때만 buy3_schema 9 — 값 없이 9 를 싣지 않는다(서버가 0 으로 읽어 한도 소거)"
metrics:
  duration: 14m
  completed: 2026-11-15
  tasks: 3
  files: 25
actuals:
  tokens: 24700
  tasks: 3
  commits: 6
plan_head_before: 1f9e4d608b75a752923f1784d4d889cb094cd811
plan_head_after: 8bc995f2ebdf630c98339920ef5bfe145cdc93cd
---

# Quick 261115-s1o: 상따 「최대금액」 — relay buy3_schema 9 · 비트 54 · 웹 매수주문 카드 칸 Summary

gh-trade 8d073739(quick-261115-ptq)의 `SetLimitChaser.buy_cap_amount`(만원 · 0 = 제한 없음 · vt 184)를 relay 가 `buy3_schema` 9 로 송수신하고(앞 여덟 조건 + 값 존재일 때만), shared 비트 표에 54 를 더해 웹 상따 매수주문 카드 맨 아래 「최대금액 [N]만」 행에서 보고 고치게 했다. **미배포** — 로컬 커밋까지만.

## 배포 상태

**미배포 — gh-trade 서버 120 · 121 · 119 배포 뒤 relay → push 순서**(구 서버는 `buy_cap_amount` 를 모르고 값을 조용히 버린다). push · relay 배포 · webapp 배포 · `supabase db push` 모두 하지 않았다.

## 플래너 판단(오케스트레이터 채택 · 그대로 기록)

1. **자리** = 웹 「매수주문」 카드 맨 아래 행(버스트 취소 아래). PC 흐림 묶음이 마스터(☐매수주문 — 주문가격 · 비교가격 · 최대금액, LimitChaserForm.cs 777행)라 그 카드의 맨 아래가 동형 자리다. 후매수 카드 아래 새 카드는 디자인 변경이라 택하지 않았다.
2. **단위** = 「만원」(웹 금액 칸 관례). → **실행 중 「만」 으로 바뀜 — 아래 「계획과 다른 점」 1 참고.**
3. **0 표시** = 「제한 없음」(웹 0 의미어 관례 `lcValueTextOf`). 시트 설명에도 「0 = 제한 없음」.
4. **입력 범위** = 0 ~ 999,999,999(PC numBuyCapAmount Maximum 과 같고 shared `LC_AMOUNT_MAX_MANWON` 과 같은 값). relay zod 는 다른 만원 칸처럼 `UIntSchema`.

## 완료한 작업

| 태스크 | 이름 | 커밋 | 주요 파일 |
| ---- | ---- | ---- | ---- |
| 1 ⓪ | 생성물 재동기화(생성물만) | c2e4910e | relay/src/generated/StockDMA.fbs · stock-dma/set-limit-chaser.ts |
| 1 | relay schema 9 · shared 비트 54 · 웹 폼 값 운반 | fd21b4dc | envelope.ts · protocol.ts · relay.ts · lc-change-mask.ts · limit-chaser.ts |
| 2 | 매수주문 카드 맨 아래 최대금액 행 | 8a4ffe1f | lc-fields.ts · lc-ranges.ts |
| 3 ③ | 폰 밴드 넘침 수정(단위 글자 「만」) | f27b85a7 | lc-fields.ts(+ 단위 단언 테스트 2개) |
| 3 ④ | P24-7 최악값 잠금 | 6f4c5060 | webapp/e2e/specs/trading-workbench.spec.ts |
| 3 ⑤ | 인박스 노트 닫기 | 8bc995f2 | docs/inbox/from-gh-trade/261115-buy-cap-amount.md |

## 검증 결과

- **생성물 재동기화**: `sync-relay-schema.sh` 출력이 정확히 두 파일(StockDMA.fbs · stock-dma/set-limit-chaser.ts) · 마커 `server-repo-commit: 8d073739` · flatc 25.12.19 · 접근자 `buyCapAmount()` · `addBuyCapAmount`(id 90). gh-trade 트리에는 아무것도 쓰지 않았다.
- **RED 기록**: relay 4파일 — 새 테스트 17건 실패(envelope ③-buycap 6 · protocol ①-buycap 1 · fanout s1o 4 · 에코 키 수 82 단언 6) 확인 뒤 GREEN. Task 2 — 10건 실패(lc-fields 2 · 행 높이 1 · 폼 최대금액 5 · Tab 2) 확인 뒤 GREEN.
- **gh-trade `LimitChaserChangeMask.h` 55줄 대조는 skip 이 아니라 실행되어 초록**(`비트 상수 55줄의 [비트, 와이어 이름] = LC_CHANGE_MASK_FIELDS · 비트 집합 = 0..54` ✓).
- **fanout s1o-1** 이 브라우저 `lc.set` → 게이트웨이 `buy3Schema 9` · `buyCapAmount 10000` · `change_mask === 1n << 54n`(짝 비트 없음)을 끝에서 끝까지 보인다. s1o-3: buyCapAmount 없으면 8 그대로 · 「schema 9 조건」 warn 0.
- vitest(--maxWorkers=2): relay 4파일 528/528 · webapp 7파일 794/794.
- typecheck: shared · relay src · webapp(src + e2e) 0 오류. relay `typecheck:tests` 는 이 작업과 무관한 기존 4건(admin-api · admin-dispatcher — `deferred-items.md`)만 남는다 — 내 파일 오류 0.
- eslint(lc-fields.ts · lc-ranges.ts · limit-chaser.ts) 0.
- **P24-7 e2e 실행 · 초록**(`--workers=1` · 3100 · 8090 포트 비어 있음 확인 · 4밴드 344 · 685 · 830 · 992 잘림 0 · 말줄임 0 · 행 44/56). 첫 실행은 344 에서 넘침으로 빨강 → 아래 수정 뒤 초록.
- `limit-chaser-form.tsx` · `fanout.ts` 무변경 확인.

## 계획과 다른 점

### 자동 수정

**1. [Rule 1 - 시각 결함] 최대금액 단위 글자 「만원」 → 「만」**
- **발견:** Task 3 P24-7 첫 실행 — 본문 344(폰 밴드) 매수 pane 에서 「최대금액 999,999,999만원 ›」 가 행을 4 ~ 5px 넘침(`scrollOverflowing` 2건).
- **수정:** 같은 행 패턴(같은 value 행 · 클래스 · 컴포넌트 그대로)에서 단위 글자만 PC 칸 단위 「만」 으로. 「만」 은 이 폼의 수량 8칸 위 줄과 같은 만원 표기다. 값 · 와이어 · 범위는 그대로(만원). 표시 예: 「5,000만」 · 「999,999,999만」 · 0 은 「제한 없음」. 4밴드 전부 초록.
- **판단 근거:** 사용자 규칙(손보는 표면 안의 줄바꿈 · 잘림은 묻지 말고 고치고 한 줄 보고 · 두 클라 갈림은 WinForms 동형 기본). 같은 행 패턴 안의 수정이라 계획의 멈춤 조건에 걸리지 않는다고 봤다. **계획 · 오케스트레이터가 채택한 플래너 판단 2(「만원」)와 다르므로, 「만원」 을 꼭 원하면 다른 방법(라벨 축약 등)으로 후속 quick 이 필요하다.**
- **커밋:** f27b85a7(커밋 메시지 · e2e 단언도 「999,999,999만」).

**2. [Rule 1 - 계획 표기 오류] protocol.test 884행 「54 → 55」 는 하지 않음**
- 그 단언(①-sellrisk)의 cfg 는 최대금액을 싣지 않아 54 가 맞다. 새 ①-buycap 테스트에서 55키를 단언했다.

**3. [Rule 1 - 계획 표기 오류] protocol ①-buycap 의 4294967296 거부 단언 대신 조립기에서 거부**
- 플래너 판단 4대로 zod 는 `UIntSchema`(상한 없음 — 다른 만원 칸과 같음)라 4294967296 은 zod 를 통과한다. uint 상한은 조립기 `toWireUint` 가 `OrderBuildError` 로 막고 envelope ③-buycap (g) 가 잠근다. protocol 은 −1 · 1.5 · 문자열 거부만 단언.

**4. [Rule 1 - 계획 표기 오류] 폼 「999,999,999 초과 → 범위 문구」 대신 「10자리 입력 안 됨 → send 0」**
- 인라인 편집기가 `PAD_MAX_DIGITS = 9` 를 넘는 입력을 받지 않아 범위 문구까지 가지 않는다(수량 8칸 만원 칸과 같은 경로). 범위 상한 자체는 lc-fields 행 스펙 단언(range 0 ~ 999,999,999)이 잠근다.

**5. [Rule 3 - 막힘] 계획 파일 목록 밖 테스트 4곳 갱신**
- `relay/src/dma/__tests__/envelope.test.ts` 에코 키 수 81 → 82 11곳(계획엔 fanout 6곳만 적혀 있었음).
- `webapp/.../setting-group.test.tsx`(매수주문 카드 행 · 옛 id 표 · lcNavigableRows) · `lc-tracer.test.tsx`(cfg 키 62 → 63 두 곳) — 둘 다 Task 2 verify 목록에 있는 파일이라 같이 고쳤다.
- `limit-chaser-form.test.tsx` 행 높이 테스트 행 수 31 → 32 · 버스트 취소 「마지막 행」 → 「끝에서 두 번째」.

**6. isMasterOnlyDelta 테스트 위치** — 계획의 「quick-261115-s1o 최대금액」 describe 대신 기존 `isMasterOnlyDelta` describe 안에 넣었다(그 describe 의 `webCfgOf` · `folded` 헬퍼를 재사용해야 기준선이 맞다).

**7. RED 관찰 범위** — lc-change-mask.test 와 webapp limit-chaser.test 는 테스트를 먼저 썼지만 shared 빌드 · 구현 뒤에 처음 돌렸다(따로 RED 를 보지 않음). lc-change-mask 의 .h 55줄 대조는 HEAD 의 shared(54행)에서 실패하는 꼴이다(gh-trade .h 90행 `kMaskBuyCapAmount` 확인).

## 인박스 · gh-trade 질문

- 인박스 노트 `docs/inbox/from-gh-trade/261115-buy-cap-amount.md` → `status: done` · `done_commit: 8a4ffe1f`(웹 칸 커밋) + 주석(relay fd21b4dc · 생성물 c2e4910e · fix f27b85a7 · 미배포 · 회신 노트) · 경로 지정 커밋 8bc995f2.
- 노트의 챗봇 질문 — 회신 노트: gh-trade `docs/inbox/from-gh-radar/261115-buy-cap-block-journal.md`(막힌 기록을 저널 80 전략 이벤트로 남겨 달라는 요청 · 회신 대기).

## 범위 상한 준수

새 컴포넌트 · 새 화면 · DB 마이그레이션 · server/ · workers/ 변경 없음. 「내 설정」 기본값 화면 · 84 시딩에 최대금액을 넣지 않음. 챗봇 사유 사전 · 진단 지식 없음. 생성물 손편집 없음. fanout.ts · limit-chaser-form.tsx 무변경.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일: relay/src/dma/envelope.ts(LC_BUY_CAP_BUY3_SCHEMA) · packages/shared/src/lc-change-mask.ts(buy_cap_amount) · packages/shared/src/relay.ts(buyCapAmount) · relay/src/ws/protocol.ts(buyCapAmount) · webapp/src/components/trading/lc/lc-fields.ts(lc-buy-cap-amount) — 모두 있음.
- 커밋: c2e4910e · fd21b4dc · 8a4ffe1f · f27b85a7 · 6f4c5060 · 8bc995f2 — 모두 HEAD 조상.
