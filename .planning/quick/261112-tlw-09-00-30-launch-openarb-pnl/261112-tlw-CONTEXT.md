# quick 261112-tlw — 러쉬주문 09:00:30 주문 내역에 개장차익 손익 표시 · 확정 결정

> 사용자 요청(2026-11-12): 「gh-trade 는 개장차익에서 매수 후 매도까지 체크해서 손익을 보여 주는데, gh-radar 러쉬주문 메뉴의
> 09:00:30 주문내역엔 손익이 안 보여서 확인이 어렵다. 손익도 표시해 주자.」
> 아래 결정은 **잠금**이다 — 플래너 · 실행자는 다시 묻거나 바꾸지 않는다. 조사는 오케스트레이터가 끝냈다(다시 훑지 말 것).

## 확정 결정

### D-01 화면 모양 = 목업 변형 A (사용자 채택 2026-11-12)

정본 = `reference/mockup-launch-pnl.html` 변형 A.

- 09:00:30(`fire === 'n0930'`)일 때만. 16:00(`q16`) 화면은 한 글자도 안 바뀐다.
- (서버, 시장) 묶음마다 지금 주문(조각) 표 **위에** 「종목별 손익」 표 1개. 묶음 안 소제목 2개 — 「종목별 손익」 · 「주문」
  (손익 줄이 0개인 묶음은 소제목 · 손익 표 둘 다 없음 = 지금 모양 그대로).
- 손익 표 열 순서(폰 390 에서 옆으로 밀지 않아도 손익이 보이게 종목 바로 옆):
  `종목 | 손익 | 잔여 | 방향 | 매수 체결 | 매도 체결 | 계좌 | 사용자` + 마지막 「합계」 줄(손익 칸만 값).
  - 종목 = 이름(굵게) + 종목코드(흐리게) — 조각 표와 같은 꼴. 이름 · 코드 둘 다 없으면 ISIN.
  - 손익 = 부호 붙인 원 단위 정수(`+378,812` · `−427,197` · `0`) · 양수 `var(--up)` · 음수 `var(--down)` · 굵게.
  - 잔여 = 0 이면 흐린 `0` · 양수면 알약 「175주」(색 = 조각 표 대기열 추정 줄이 빌려 쓰는 `--vi` 토큰 · globals.css 는 건드리지 않는다).
  - 방향 = 「KRX 매수 → NXT 매도」 / 「NXT 매수 → KRX 매도」(「경우1/경우2」 표기 금지 — gh-trade D-29) · 모르면 「—」.
  - 매수 체결 / 매도 체결 = 「1,071주 · 평균 46,643」(평균 = 금액 ÷ 수량 반올림) · 수량 0 이면 「—」.
  - 계좌 · 사용자 = 마스킹 없음(D-02 어드민 전용 예외 그대로).
- 머리 카드(09:00:30 만)에 「손익」 줄 1개 — `+168,164원 · 4종목` + 잔여 종목이 있으면 ` · 잔여 1`. 손익 줄이 0개인 시장 카드는 「—」.
- 목업 맨 아래 설명 문단(`.foot`)은 **구현하지 않는다**(목업 설명용). 뜻은 손익 표 헤더 `title` 로만 단다
  (「손익」 = 식 · 「잔여」 = 자동으로 팔지 못하고 남은 수량).
- 폰 390: 손익 표도 자기 래퍼 안에서만 가로 스크롤(`min-w-0 overflow-x-auto` · 조각 표와 같은 꼴) — 페이지는 넓어지지 않는다(lessons 2026-09-07).

### D-02 손익 식 = gh-trade 개장차익 화면과 같은 값 (WinForms 동형 · 오케스트레이터 결정)

gh-trade `server/src/trade/strategy/OpenArb.cpp` `ApplySellFill` + `OpenArbMath.h` `RoundTripCostKrw`(`kCostBp = 22`)를 **체결 순서대로 재생**한다.

```
(서버, 계좌, 종목) 한 줄마다 체결을 순서대로:
  매수 체결(qty, px): buyQty += qty · buyAmt += px × qty
  매도 체결(qty, px): sellQty += qty · sellAmt += px × qty
                      b = buyQty > 0 ? floor(buyAmt × qty / buyQty) : 0      ← 그 순간까지의 매수 누계
                      s = px × qty
                      pnl += s − b − floor((b + s) × 22 / 20000)
  잔여 = max(buyQty − sellQty, 0)
```

- 계좌 실제 수수료 · 세금률로 계산된 `realized_pnl_krw`(일자별 매매손익 화면 값)는 **쓰지 않는다** — 계좌 평단 · 계좌 비용률 기준이라 gh-trade 화면 값과 다르다.
- 정수 계산: 금액은 JS number 안전 범위(< 2^53)라 `Math.floor` 로 충분하다(BigInt 불필요).
- 한 줄의 키 = (gateway, account, isin). 방향 = 그 줄 **첫 매수 체결의 거래소**(KRX → 「KRX 매수 → NXT 매도」 · NXT → 「NXT 매수 → KRX 매도」) · 매수 체결이 없으면 null(「—」).
- 사람이 따로 판 수량(출처가 개장차익이 아닌 주문)은 세지 않는다 — gh-trade 「잔여 = 사람 몫」 과 같다.

### D-03 재료 = 이미 DB 에 있는 주문 기록 (relay · server 코드 · gh-trade 변경 없음)

- `public.dma_journal_events` 의 `origin = 'OpenArb'` AND `notice_type = 'E'`(체결) 행. 2026-11-12 운영 실측: 11/2 ~ 11/12 매일 있음
  (11/12 = 211행 중 체결 145 · KB120 4종목 · 교보119 2종목 · 교보112 1종목). 개장차익이 낸 주문 전부(09:00:27 KRX 매수 ·
  09:00:30 NXT 매수 · NXT 매도 · 매수 체결 뒤 KRX 매도 · 되팔기)에 이 출처가 실린다 — 매도 중 일부는 발사 조각 표에 없다(그래서 조각 표 조인으로는 안 된다).
- 조회 함수 `public.launch_orders_for_admin(p_date text)` 가 응답에 **`fills` 키**를 더 싣는다. 최신 정의 =
  `supabase/migrations/20261104710000_launch_queue_live.sql` ② — 새 마이그레이션에서 이 본문을 통째로 복사해 `fills` 만 더한다
  (그 뒤 재정의 없음 — 확인함). 빈 표 조기 반환에도 `'fills', '[]'::jsonb`.

  ```
  fills = [{ gateway, account, dma_user_id, isin, stock_code, stock_name, side, exchange, price, qty }, …]
    FROM dma_journal_events e LEFT JOIN stocks s ON s.isin = e.isin
   WHERE e.trade_date = v_day AND e.origin = 'OpenArb' AND e.notice_type = 'E' AND e.exec_qty > 0
   ORDER BY e.gateway, e.gw_time, e.journal_epoch, e.seq          ← 체결 순서(재생 순서)
    account = e.account_no · side = e.side('B'/'S' 원문) · price = e.exec_price · qty = e.exec_qty
  ```

  인덱스 `(trade_date, account_no)` 가 이미 있다(20261028210000). 권한 · SECURITY INVOKER · REVOKE anon/authenticated · GRANT service_role 은 지금 정의 그대로 다시 적는다(memory: REVOKE 명시).
- server(`server/src/services/admin-launch.ts`)는 RPC jsonb 를 그대로 내보낸다 → **코드 변경 · 배포 없음**.
- 계산 정본은 **한 벌 = `packages/shared/src/launch.ts`** 의 순수 함수(SQL 에 두 번째 구현을 두지 않는다 — 이 모듈 관례).
  - `LaunchOpenArbFill`(응답 행) · `LaunchOpenArbPnlRow`(계산 결과) · `launchOpenArbPnlOf(fills)` · `LaunchOrdersResponse.fills?: LaunchOpenArbFill[]`
    (**선택 키** — db push 전 옛 RPC 응답엔 없다 → 손익 표 · 카드 줄 없이 지금 화면 그대로. 배포 순서 무관).
  - 결과 줄 순서 = 입력에서 그 (gateway, account, isin) 가 처음 나온 순서. `side` 가 'B'/'S' 가 아닌 체결은 건너뛴다.
  - `dma_user_id` = 그 줄 첫 매수 체결의 값(빈 문자열이면 다음 비어 있지 않은 값 · 끝까지 없으면 null).
- 시장(코스닥/코스피) 묶음 배정 = 그 날 그 서버 조각(`resp.pieces`)의 isin → market(매수는 늘 발사 조각이라 있다).
  조각에서 못 찾은 줄은 버리지 않는다 — 그 서버의 **첫 묶음 앞에 시장 이름 없는 묶음**(제목 = 서버 표시 이름만 · 조각 표 없음)으로 손익 표만 보인다.
  머리 카드 합계에는 시장을 아는 줄만 든다.

### D-04 범위 상한 (작은 quick — 넘기지 말 것)

1. `supabase/migrations/<새 타임스탬프>_launch_orders_openarb_fills.sql` — 위 RPC 재정의(되돌리기 주석 포함) + pgTAP
   (`supabase/tests/launch_gate.test.sql` 에 덧붙이거나 새 `launch_orders_openarb_fills.test.sql` — 빈 표 `fills: []` · OpenArb 체결만 · 순서 · 다른 출처/비체결 제외).
   기존 pgTAP 중 `launch_orders_for_admin()` 전체 jsonb 를 `=` 로 비교하는 단언(빈 표 등)은 `fills` 키에 맞춰 고친다.
2. `packages/shared/src/launch.ts` + `packages/shared` 의 launch 테스트 — 타입 · `launchOpenArbPnlOf` · 단위 테스트
   (2026-11-12 KB120 실측 모양: 완결 · 손실 · 잔여 · 매수만 · 매수/매도 섞인 순서 · 절사).
3. `webapp/src/lib/launch-format.ts`(표시 문자열 · 묶음 · 카드 합계 모델) + `webapp/src/components/admin/launch-orders-tab.tsx`(손익 표 · 카드 줄) + 두 테스트 파일.
4. 실행 검증: shared · webapp 타입체크 + 해당 vitest 파일만(`--maxWorkers=2` — 동시 세션 메모리) + pgTAP 해당 파일. 전체 e2e · 전체 회귀는 돌리지 않는다.

하지 않는 것: relay · server · workers · gh-trade 변경, 16:00 화면, 경계 지도 탭, 새 CSS 토큰, 실시간 갱신, 계좌 실비용 손익, 배포(= 오케스트레이터 몫 — `supabase db push` 와 `git push` 는 실행자가 하지 않는다).

## 동시 세션 주의

지금 다른 세션이 Phase 43 plan-phase 를 돌리고 있다(`.planning/ROADMAP.md` · `.planning/phases/43-*` 가 수정/미추적 상태).
커밋은 **자기 파일 경로를 지정해서만** 한다 — `git add -A` · `git add .` · `git stash` 금지. 남의 변경은 건드리지 않는다.
