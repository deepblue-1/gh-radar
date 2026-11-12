# quick 261112-w2q — 상따 화면 미체결에 「VI 자동주문」 표시 · 확정 결정

> 계기: gh-trade 인계 노트 `docs/inbox/from-gh-trade/261112-unfilled-origin-companion-mask.md`(처리 완료 e40351be) —
> gh-trade 204e505d 가 `StockDMA.fbs` `UnfilledState.origin: string`(vtable 32 · 말미 append)을 더했다. 미체결 행마다
> 발주 주체 `Manual` / `LimitChaser` / `VITrigger`(그 밖 `OpenArb` 등도 올 수 있음), 모르면 `""`. gh-trade 상따창은 이 값으로
> VI 자동주문 미체결 행을 「VI매수」 · 연주황 배경 · 툴팁 「VI 자동주문」 으로 구분한다.
> 사용자(2026-11-12): 「진행해」 → 절차 = gsd-quick · 모양 = 목업 변형 B 채택.
> 아래 결정은 **잠금**이다. 조사는 오케스트레이터가 끝냈다 — 다시 넓게 훑지 말 것.

## 확정 결정

### D-01 화면 = 목업 변형 B (사용자 채택) — 정본 `reference/mockup-unfilled-vi.html` B

- 대상 표면 2곳 = 상따 작업대(`/trading/limit-chaser`)의 **공용 패널 「미체결」 탭**(계좌 전체 · account 스코프)과
  **전략 카드 「미체결」 탭**(종목 하나 · stock 스코프). 둘 다 `AccountPanel` 의 임베드 미체결 표
  (`webapp/src/components/orderbook/account-panel.tsx` ~1380 ~ 1470 · 행 `data-slot="account-embed-unfilled-row"` ·
  배지 `data-slot="account-origin-badge"` 두 군데 — stock 스코프는 SideTag 옆, account 스코프는 종목명 옆)를 쓴다.
- **VI 자동주문 행만** 표시한다(상따 · 수동 · 모름 행은 지금 그대로 — 배지 없음):
  - 배지 글자 「VI」 · 색 = 주황 배지(`bg-[var(--vi-bg)]` + `text-[var(--vi)]` + `font-semibold`/bold) — 지금 회색 배지와 같은 자리 · 같은 크기.
  - 배지 `title` = 「VI 자동주문」.
  - 행 배경 = `--vi-bg`(행 전체). 선택된 행 · 취소 보관(회색) 행 규칙은 기존 그대로 위에 얹힌다 — 선택 강조(`rowSelectClass`)가
    있으면 그쪽이 이긴다(배경 충돌 시 선택 우선). 취소 보관 행은 글자 회색 규칙 그대로 + VI 배경 유지.
- 새 CSS 토큰 금지(`--vi` · `--vi-bg` 는 globals.css 에 이미 있다 — 라이트 98 ~ 99 · 다크 295 ~ 296). globals.css 수정 금지.
- 비임베드(full) 계좌 패널의 `originTag`(화면 컨텍스트 태그 · 853행 근처) · 호가주문 탭 · My page · 「오늘 주문」 카드는 **건드리지 않는다**.

### D-02 출처 값 = 서버가 미체결 행에 싣는 원문만 (화면이 짐작하지 않는다)

- relay 생성물 재동기화: `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh`
  → 그 뒤 같은 명령 `--check` 가 차이 0. flatc 25.12.19 고정 · `relay/src/generated/**` 손편집 금지. SYNC MARKER
  `server-repo-commit` 이 a4e54275 → 새 값으로 바뀐다(204e505d 이후 .fbs 마지막 변경 커밋). 생성물에는
  `UserSettings.buy_group_companion_off_mask` 도 같이 들어온다 — relay `buildSetUserSettingsReq`(envelope.ts ~2295)는 그 칸을
  싣지 않는다(= 서버 저장값 유지 · gh-trade 노트 확인) → **손대지 않는다**.
- relay 파서 `relay/src/dma/envelope.ts` 미체결 루프(~2643 ~ 2688 · `unf.push({...})`)에 `origin` 한 칸:
  - 원문 `u.origin() ?? ""` → `"VITrigger"` = `"vi"` · `"LimitChaser"` = `"limit_chaser"` · `"Manual"` = `"manual"` · **그 밖(빈 값 · `OpenArb` · 미지) = `null`**.
  - 기존 `toOrderOrigin`(~2417)은 **쓰지 않는다** — 빈/미지 값을 `"manual"` 로 좁히고 미지 값마다 warn 을 남겨, 계좌 상태 프레임마다
    반복되는 미체결에 쓰면 로그가 넘친다. 새 작은 순수 함수(예 `toUnfilledOrigin`)로 조용히 `null`.
- shared 계약 `packages/shared/src/relay.ts` `RelayUnfilled`(1184 ~ 1236)에 **선택 키** `origin?: JournalOrderOrigin | null`
  (`JournalOrderOrigin` = `packages/shared/src/journal.ts:38` 재사용). 키 없음 = 옛 relay → 배지 없음(배포 순서 무관).
  relay 는 늘 싣는다(null 포함).
- 웹 미체결 병합(`webapp/src/lib/use-relay-socket.ts` ~1599 ~ 1640)은 델타 행이 통째로 교체하므로 변경 불필요 —
  relay subscription-hub 의 `{...u}` 펼치기(2578 · 3791)도 그대로 통과. 확인만 하고 고치지 않는다.

### D-03 웹 배선 — 기존 `originOf` 슬롯을 쓴다

- `AccountPanel` 은 이미 `originOf?: (row: RelayUnfilled) => AccountRowOrigin | undefined` 를 받아 임베드 미체결 행에 배지를 그린다
  (`AccountRowOrigin = '상따' | '수동'` · 219행). 작업대는 지금 아무 것도 넘기지 않는다(card-tabs.tsx 상단 주석 ④).
- 바꿀 것: `AccountRowOrigin` 에 `'VI'` 추가 → 배지가 `'VI'` 면 주황 · `title` · 행 배경(D-01). `'상따'` · `'수동'` 기존 모양은 그대로(오늘 넘기는 곳 없음).
- 공급: `row.origin === 'vi' ? 'VI' : undefined` 순수 함수 하나(예 `unfilledOriginOf` — account-panel.tsx 또는 공용 패널 파일에 export)를
  작업대 `trading-workbench.tsx` 의 `<SharedPanels …>`(~1648)와 `<StrategyCard …>`(~1846) 양쪽에 `originOf` 로 넘긴다
  (shared-panels.tsx · strategy-card.tsx · card-tabs.tsx 는 이미 그대로 내려 준다). card-tabs.tsx 상단 주석 ④ 문구를 새 사실에 맞게 한 줄 고친다.

### D-04 범위 상한 · 검증 · 배포

1. relay: 생성물 재동기화(커밋에 생성물 포함) + envelope.ts 파서 + 테스트 헬퍼 `relay/tests/helpers/frames.ts`(~481 `UnfilledState` 빌더에 origin 옵션)
   + 파서 테스트(VITrigger → vi · LimitChaser · Manual · "" → null · OpenArb → null · 경고 로그 없음).
2. shared: `RelayUnfilled.origin?` 타입만(런타임 함수 없음).
3. webapp: account-panel.tsx(배지 · 행 배경 · 타입) + trading-workbench.tsx(공급 2곳) + card-tabs.tsx 주석 + 테스트
   (account-panel 임베드 테스트에 VI 행 배지 · title · 행 배경 클래스 · 상따/수동/null 행 무배지 · 옛 relay(키 없음) 무배지).
4. 검증: `--check` 차이 0 · relay typecheck + 해당 vitest 파일만 · shared typecheck · shared build → webapp typecheck + 해당 vitest 파일만
   (`--maxWorkers=2` — 동시 세션 메모리). 전체 e2e · 전체 회귀 · dev 서버 · 브라우저 금지.
5. 배포는 **오케스트레이터(메인 세션)** 몫 — 실행자는 커밋까지만. 순서 relay 먼저 → 웹(push). `deploy-relay.sh` · `git push` · `vercel` 실행 금지.

하지 않는 것: 사용자 설정 「같이 켜기」 칸의 웹 저장/표시, 「오늘 주문」 · 호가주문 탭 · My page 의 출처 표시, `toOrderOrigin` 수정, DB 변경, 새 토큰.

## 동시 세션 주의

다른 세션이 같은 메인 트리 master 에서 Phase 42(틱뷰어 봉 차트)를 실행 중이다(webapp/src/components/ticks · lib 등 · .planning/phases/42-*).
커밋은 **자기 파일 경로를 지정해서만**. `git add -A` · `git add .` · `git commit -a` · `git stash` · `reset --hard` 금지. `.planning/STATE.md` · `ROADMAP.md` · `phases/**` 수정 금지.
