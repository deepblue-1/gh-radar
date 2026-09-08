'use client';

/**
 * LimitChaserForm — 상따 매수/매도 폼 카드 (UI-SPEC A4~A9, TRADE-01).
 *
 * ① 무엇을 어디에
 *   데스크톱(≥1280) 3열 중 **가운데(매수) · 오른쪽(매도)** 두 컬럼. 좁은 폭에서는 오른쪽 58%
 *   컬럼 안의 **「매수」/「매도」 세그먼트 탭**이고 탭당 카드 하나만 보인다.
 *   ★ 카드는 **2개**다. 그룹 6개를 카드 6개로 쪼개지 않는다 — 라벨 컬럼 폭(`--lw`)이 카드
 *     안에서 공유돼야 값이 세로로 정렬되고, 카드를 쪼개면 그 정렬이 깨진다.
 *
 * ② ★ 오조작 방지 — 이 파일의 존재 이유
 *   1. **색·위치·문구 3중 일치** — 매수 = `--up` · **왼쪽/위** · 「매수」, 매도 = `--down` ·
 *      **오른쪽/아래** · 「매도」. 그룹 좌측 3px 액센트 바가 그 축을 카드 안에서도 잇는다.
 *   2. **자동취소(가드) 그룹은 중립색**이다. 경고 전용 색 토큰은 이 저장소에 **없다**(UI-SPEC
 *      C1/FLAG-1) — 없는 토큰을 쓰면 색이 통째로 죽어 「경고인데 안 보이는 경고」가 된다.
 *   3. ★ **규율 3(확인 다이얼로그)은 D-05 로 뒤집혔다.** `order-panel.tsx` 는 제출마다
 *      다이얼로그를 거치지만, 여기 **스위치 3개는 확인 없이 즉시 전송**한다. 상한가 직전에
 *      다이얼로그를 한 번 더 거치게 하면 그 1~2초가 체결을 놓치는 비용이다.
 *      대신 오터치 방어는 **기하학**으로 한다 — **44×26 크기 + 최소 8px 간격 + 그룹 헤더
 *      우측 끝 고정 위치**(`ml-auto`). 이 세 가지가 이 파일에서 유일한 오터치 방어이므로
 *      크기·간격·위치를 줄이는 변경은 곧 안전장치를 줄이는 변경이다.
 *   4. **제출 후 즉시 재활성 금지** — 전송 중에는 액션 바가 `반영 중…` 으로 잠긴다.
 *   5. **삭제 버튼을 만들지 않는다**(D-08). 매수·매도·취소 게이트가 전부 꺼지면 그것이 삭제
 *      (`crud "D"`)다. 판정은 `crudOf()` 한 곳이고, **화면의 「삭제됨」 표시는 서버 에코의
 *      `crud`** 를 본다(클라 판정은 전송용 힌트일 뿐이다).
 *
 * ③ ★ 값은 자동 반영되지 않는다 (D-06)
 *   초안의 「0.3초 자동 반영」은 폐기됐다. 이 파일에 **디바운스도 지연 전송도 없다.**
 *   값이 서버값과 달라지면 그 필드가 더티가 되고(라벨 `--primary` + `● ` 접두 · 입력 테두리
 *   `--primary` + 2px 링), 하단 `DirtyActionBar` 의 「수정」을 눌러야 나간다.
 *   ★ **스위치는 더티 값을 함께 밀어낸다** — 스위치를 켜면 그 시점 폼 전체가 실린다.
 *     스위치를 막지 않는 대신 액션 바 보조문이 그 사실을 상시 고지한다.
 *
 * ④ ★ 에코가 도착하면 서버가 이긴다 (D-11)
 *   더티 필드도 **덮어쓴다.** 편집 중 보호·보류가 없다 — 「내가 치던 값이 남아 있다」는
 *   착각이 실제 서버 상태와 갈리는 순간이 이 화면에서 가장 비싼 오해다. 덮어쓴 필드는
 *   ≤150ms 배경 플래시로 한 번 알리고, 배너·로그는 상위(`limit-chaser-client`) 소관이다.
 *   유일한 예외가 `buyOrderAmount === 0`(=「서버가 모른다」)이고 그 판단은 `formFromServer`
 *   한 곳에 있다.
 *
 * ⑤ ★ 전송 필드는 **클라 입력 30 + 클라 고정 3 = 33** 이다
 *   S→C 전용 4필드(`sellOrderQty`·`sellQtyTrackBaseline`·`sellEntryLatched`·
 *   `cancelQtyTrackBaseline`)를 **싣지 않는다**(Pitfall 6). 되보내면 「값이 왕복한다」는
 *   착각으로 에코 비교가 오염된다.
 *   고정 3(`sweepRecalcEnabled: true`·`sweepMinCount: 0`·`sweepMinRate: 0`)은 **폼에 노출하지
 *   않는다** — relay 빌더가 어차피 그 값으로 덮으므로(16-04), 입력을 열면 「설정했는데 반영
 *   안 됨」이 된다.
 *
 * ⑥ 토스트를 쓰지 않는다 (UI-SPEC D3)
 *   결과는 액션 바의 소멸 + 상태줄 + 전략 로그로만 알린다.
 *
 * ⑦ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보)
 *   `--primary` 는 `--down`(매도 파랑)과 값이 완전히 같다. 채움 면의 글자색은 `--primary-fg`
 *   대신 값이 동일한 `--destructive-fg` 를 쓴다 — 규율은 `dirty-action-bar.tsx` ③ 에 있고
 *   이 파일에는 채움 면이 없다.
 *
 * ⑧ 왜 Radix 를 두 군데에서 쓰지 않는가
 *   - **탭**: 단일선택 `ToggleGroup` 은 항목에 `role="radio"` 를 강제해 UI-SPEC 이 요구하는
 *     `tablist`/`tab` 대응이 깨진다(`order-panel.tsx:422` 와 같은 판단이다).
 *   - **스위치**: `ui/switch.tsx` 의 thumb 기하(16px · `translate-x-4`)가 컴포넌트 안에
 *     하드코딩돼 호출부에서 못 바꾼다. 이 화면의 유일한 오터치 방어가 **정확히 44×26** 이라
 *     (② 3) 공용 primitive 를 이 한 화면 때문에 고치는 대신 순수 버튼으로 그린다.
 *   - **체크박스**: `ui/checkbox.tsx` 는 `<button role="checkbox">` 라 `<label for>` 로
 *     이름을 붙일 수 없다. 21개 컨트롤이 붙는 고밀도 폼에서 라벨 클릭 토글과 라벨 연결을
 *     동시에 얻으려면 네이티브 `<input type="checkbox">` 가 맞다.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type {
  OrderMarket,
  RelayExchange,
  RelayLimitChaser,
  RelayLimitChaserInput,
} from '@gh-radar/shared';

import { useRelayContext } from '@/lib/relay-provider';
import {
  buyOrderQtyFromAmount,
  crudOf,
  defaultLimitChaserForm,
  dirtyFieldsOf,
  estimatedSellQty,
  formFromServer,
  seedFromUpperLimit,
  type LimitChaserDirtyField,
  type LimitChaserFormValues,
} from '@/lib/limit-chaser';
import { cn } from '@/lib/utils';
import { DirtyActionBar } from '@/components/trading/dirty-action-bar';

/** 액션 바 보조문 — 상따 정본(UI-SPEC §CTA). 스위치가 더티를 함께 민다는 사실을 상시 고지한다. */
const DIRTY_HINT = '「수정」을 눌러야 반영돼요 · 스위치를 켜면 변경한 값까지 함께 반영돼요';

const NUM = new Intl.NumberFormat('ko-KR');
const EMPTY_FLASH: ReadonlySet<string> = new Set();

/** 데스크톱 3열(`.lc3`) 분기점. `account-panel.tsx` 의 `min-[1280px]` 과 같은 값이다. */
const NARROW_QUERY = '(max-width: 1279.98px)';

function subscribeNarrow(onChange: () => void): () => void {
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
function narrowSnapshot(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}
/** SSR 스냅샷은 데스크톱이다 — 하이드레이션 시점에 실제 폭으로 한 번 정정된다. */
function narrowServerSnapshot(): boolean {
  return false;
}

/**
 * 탭 pane 을 숨길지 판단하는 **유일한 근거**.
 *
 * ★ CSS 만으로는 못 한다. `hidden` 은 DOM **속성**이라 반응형 분기가 없고, 데스크톱에서까지
 *   걸리면 접근성 트리에서 매도 폼이 통째로 사라진다. 반대로 클래스(`md:hidden`)로만 숨기면
 *   목업 R2① 회귀 — 작성자 `display:grid` 가 이겨 두 폼이 아래로 흐른다.
 *   그래서 **좁을 때만** `hidden` 속성을 걸고, 그 backstop 으로 globals.css 에
 *   `[hidden]{display:none!important}` 를 둔다(Pitfall 13).
 */
function useNarrowLayout(): boolean {
  return useSyncExternalStore(subscribeNarrow, narrowSnapshot, narrowServerSnapshot);
}

export interface LimitChaserFormProps {
  /** 12자 ISIN — 상단 종목 카드(A1)가 고른 값. */
  isin: string;
  /** 주문 계좌. 소유권 대조는 relay 가 한다(`session.allowedAccounts`, T-16-01). */
  accountNo: string;
  market: OrderMarket;
  exchange: RelayExchange;
  /**
   * 서버 에코 1건. `null`/`undefined` 면 신규 폼이고 더티 기준선이 없다.
   * **이 prop 이 바뀌면 폼이 서버값으로 덮인다**(D-11).
   */
  server?: RelayLimitChaser | null;
  /** 상한가 — 신규 폼에서 가격 5칸을 **1회만** 시딩한다. */
  upperLimit?: number;
  /** 매도가능 수량(`RelayAccountState.hold[].sellableQty`) — 예상 매도수량 표시용. */
  sellableQty?: number;
  /** 세션 미준비 등 — 폼 전체 비활성. */
  disabled?: boolean;
  /** 그룹 헤더 상태 문구(`무장` / `발주 완료 · 무장 해제` 등). 매핑은 상위 소관이다. */
  buyStatusText?: string;
  sellStatusText?: string;
  /** 더티 수 통지 — 상위의 이탈 경고(라우터 가드 · `beforeunload`)가 이 값을 쓴다. */
  onDirtyCountChange?: (count: number) => void;
  /**
   * `lc.set` 을 **보낸 직후** 통지 (16-13).
   *
   * ★ 상위가 이걸 알아야 하는 이유는 두 가지이고 둘 다 오해를 막는 장치다:
   *   ① **3초 무응답 판정** — 보낸 시각을 모르면 「미반영」을 셀 수 없다. 그래도 **자동
   *      재전송은 하지 않는다**(T-16-10): 재전송은 사용자가 누르지 않은 두 번째 등록이다.
   *   ② **에코의 출처** — 내가 보낸 요청의 에코와 다른 단말의 변경을 구분하지 못하면
   *      내 「수정」이 반영될 때마다 「다른 단말에서 변경됐어요」가 뜬다.
   */
  onSent?: (cfg: RelayLimitChaserInput) => void;
  /**
   * 에코가 도착해 폼을 서버값으로 덮었을 때 통지 (16-13, D-11).
   *
   * `overwrittenDirty` 는 그중 **사용자가 고치던** 필드 수다 — 배너 문구
   * 「수정하던 값 {N}개가 서버 값으로 바뀌었어요」의 N 이고, **이 폼만이 알 수 있다**
   * (상위는 폼 값을 갖고 있지 않다).
   */
  onServerEcho?: (info: { changed: number; overwrittenDirty: number }) => void;
  className?: string;
}

export function LimitChaserForm({
  isin,
  accountNo,
  market,
  exchange,
  server = null,
  upperLimit,
  sellableQty = 0,
  disabled = false,
  buyStatusText = '',
  sellStatusText = '',
  onDirtyCountChange,
  onSent,
  onServerEcho,
  className,
}: LimitChaserFormProps) {
  const { send } = useRelayContext();
  const narrow = useNarrowLayout();
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<ReadonlySet<string>>(EMPTY_FLASH);

  const [form, setForm] = useState<LimitChaserFormValues>(() => {
    const base = defaultLimitChaserForm();
    if (server != null) return formFromServer(server, base);
    // 상한가 5칸 시딩은 **신규 폼 1회**다(`SeedFromUpperLimitOnce`). 매 렌더 걸면 에코가
    // 덮은 값을 다시 상한가로 되돌린다.
    return upperLimit != null && upperLimit > 0 ? { ...base, ...seedFromUpperLimit(upperLimit) } : base;
  });

  const flashTimer = useRef<number | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  /**
   * 직전 에코. **더티 기준선**이라 에코 효과 안에서만 갱신한다 —
   * 「덮이기 직전에 사용자가 고치고 있던 필드」를 세려면 새 서버값이 아니라 옛 서버값과
   * 비교해야 한다. 렌더 시점의 `dirty` 를 쓰면 이미 새 서버값으로 계산돼 있어 어긋난다.
   */
  const prevServerRef = useRef<RelayLimitChaser | null>(null);
  const echoNotifyRef = useRef(onServerEcho);
  echoNotifyRef.current = onServerEcho;

  /*
    D-11 — 에코가 도착하면 **서버가 이긴다.** 더티 필드도 덮는다.
    보류 큐도, 「편집 중이니 나중에」도 없다. 덮은 필드만 ≤150ms 플래시로 알린다.
  */
  useEffect(() => {
    if (server == null) return;
    const prev = formRef.current;
    const prevServer = prevServerRef.current;
    prevServerRef.current = server;
    // 덮이기 **직전**의 더티 집합. 상위 배너의 「수정하던 값 {N}개」가 이 수다.
    const wasDirty = new Set<string>(dirtyFieldsOf(prevServer, prev));
    const next = formFromServer(server, prev);
    const changed = new Set<string>();
    for (const k of Object.keys(next) as (keyof LimitChaserFormValues)[]) {
      if (next[k] !== prev[k]) changed.add(k);
    }
    setForm(next);
    echoNotifyRef.current?.({
      changed: changed.size,
      overwrittenDirty: [...changed].filter((k) => wasDirty.has(k)).length,
    });
    if (changed.size === 0) return;
    setFlash(changed);
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(EMPTY_FLASH), 150);
  }, [server]);

  useEffect(
    () => () => {
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const dirty = useMemo(() => dirtyFieldsOf(server, form), [server, form]);
  const dirtySet = useMemo(() => new Set<string>(dirty), [dirty]);

  const notifyDirty = useRef(onDirtyCountChange);
  notifyDirty.current = onDirtyCountChange;
  useEffect(() => {
    notifyDirty.current?.(dirty.length);
  }, [dirty.length]);

  /**
   * 폼 값 → 와이어 `cfg` (33필드). **조립 지점은 여기 하나다.**
   *
   * `crud` 는 `crudOf(values)` 다 — 「수정」 경로에서도 클라가 `"C"` 를 박지 않는다.
   * 자동취소 체크박스는 스위치가 아니라 **값**이라 「수정」으로만 꺼지는데, 그때 매수·매도가
   * 이미 꺼져 있으면 그 「수정」이 곧 삭제다. `"C"` 를 박으면 서버가 어차피 `"D"` 로
   * 정규화하므로 화면과 와이어만 갈린다.
   */
  const buildCfg = useCallback(
    (values: LimitChaserFormValues): RelayLimitChaserInput => ({
      ...values,
      isin,
      accountNo,
      market,
      exchange,
      crud: crudOf(values),
      // 발주 정본. **역산 금지** — 산출식은 `lib/limit-chaser.ts` 한 곳뿐이다.
      buyOrderQty: buyOrderQtyFromAmount(values.buyOrderAmount, values.buyOrderPrice),
      // 클라 고정 3 — 폼에 노출하지 않는다(파일 상단 ⑤).
      sweepRecalcEnabled: true,
      sweepMinCount: 0,
      sweepMinRate: 0,
    }),
    [isin, accountNo, market, exchange],
  );

  const setField = useCallback(<K extends keyof LimitChaserFormValues>(key: K, value: LimitChaserFormValues[K]) => {
    // ★ 여기서 전송하지 않는다(D-06). 디바운스도 타이머도 없다 — 「수정」 버튼이 유일한 출구다.
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  /**
   * 스위치 3종 — **확인 없이 즉시 전송**(D-05).
   *
   * cfg 에는 뒤집힌 게이트뿐 아니라 **그 시점 폼 전체(더티 포함)** 가 실린다. 액션 바
   * 보조문이 그 사실을 상시 고지하고 있으므로 여기서 더티를 걸러내지 않는다 — 걸러내면
   * 「스위치를 켰는데 방금 고친 값이 안 갔다」가 된다.
   */
  const sentNotifyRef = useRef(onSent);
  sentNotifyRef.current = onSent;

  const toggleGate = useCallback(
    (key: 'buyEnabled' | 'sellEnabled' | 'sweepEnabled', next: boolean) => {
      if (disabled) return;
      const values: LimitChaserFormValues = { ...formRef.current, [key]: next };
      setForm(values);
      const cfg = buildCfg(values);
      send({ t: 'lc.set', cfg });
      sentNotifyRef.current?.(cfg);
    },
    [disabled, send, buildCfg],
  );

  /** 「수정」 — 표시값 전체를 한 번에 보낸다. 부분 갱신이 없다(D-06). */
  const handleSubmit = useCallback(() => {
    if (submitting || disabled) return; // 중복 제출 가드
    setSubmitting(true);
    const cfg = buildCfg(formRef.current);
    send({ t: 'lc.set', cfg });
    sentNotifyRef.current?.(cfg);
  }, [submitting, disabled, send, buildCfg]);

  /** 「되돌리기」 — 서버값 복귀. **전송하지 않는다.** */
  const handleRevert = useCallback(() => {
    if (server == null) return;
    setForm((prev) => formFromServer(server, prev));
  }, [server]);

  // 에코가 도착하면 전송 잠금을 푼다 — 응답(또는 상위의 타임아웃) 전까지 열지 않는다.
  useEffect(() => {
    setSubmitting(false);
  }, [server]);

  const buyQty = buyOrderQtyFromAmount(form.buyOrderAmount, form.buyOrderPrice);
  const sellQty = estimatedSellQty(sellableQty, form.sellOrderRatio);

  const shared = { dirty: dirtySet, flash, disabled };

  const buyCard = (
    <Card>
      <Group
        slot="buy"
        tone="buy"
        title="매수주문"
        status={buyStatusText}
        led={form.buyEnabled ? 'on' : 'off'}
        hint="비교가격의 감시잔량이 위 값 이하로 줄면 매수 발주"
        switchProps={{
          label: '매수주문 켜기',
          checked: form.buyEnabled,
          onChange: (v) => toggleGate('buyEnabled', v),
        }}
      >
        <NumField
          id="lc-buy-watch-price"
          label="비교가격"
          unit="원"
          field="buyWatchPrice"
          value={form.buyWatchPrice}
          onChange={setField}
          {...shared}
        />
        <Row label="감시 대상" dirty={dirtySet.has('buyWatchSide')}>
          <div
            role="group"
            aria-label="감시 대상"
            className="flex h-8 min-w-0 overflow-hidden rounded-[var(--r)] border border-[var(--border)]"
          >
            {(['0', '1'] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={form.buyWatchSide === side}
                disabled={disabled}
                onClick={() => setField('buyWatchSide', side)}
                className={cn(
                  'min-w-0 flex-1 px-1 text-[11px] font-semibold',
                  form.buyWatchSide === side
                    ? 'bg-[var(--up-bg)] text-[var(--up)]'
                    : 'bg-transparent text-[var(--muted-fg)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {side === '0' ? '매도잔량' : '매수잔량'}
              </button>
            ))}
          </div>
        </Row>
        <NumField
          id="lc-buy-watch-qty"
          label="잔량"
          unit="주"
          field="buyWatchQty"
          value={form.buyWatchQty}
          onChange={setField}
          {...shared}
        />
        <CheckRow
          id="lc-buy-trade"
          label="체결"
          checked={form.buyTradeQtyEnabled}
          onCheckedChange={(v) => setField('buyTradeQtyEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('buyTradeQtyEnabled')}
        >
          <NumInput
            id="lc-buy-min-trade-qty"
            aria-label="매수 체결 수량"
            unit="주"
            value={form.buyMinTradeQty}
            onValueChange={(v) => setField('buyMinTradeQty', v)}
            disabled={disabled || !form.buyTradeQtyEnabled}
            dirty={dirtySet.has('buyMinTradeQty')}
            flash={flash.has('buyMinTradeQty')}
            className="w-[104px] flex-none"
          />
        </CheckRow>
      </Group>

      <Group slot="buy-price" tone="buy" title="매수가격">
        <NumField
          id="lc-buy-order-price"
          label="매수가격"
          unit="원"
          field="buyOrderPrice"
          value={form.buyOrderPrice}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-buy-order-amount"
          label="주문금액"
          unit="만원"
          field="buyOrderAmount"
          value={form.buyOrderAmount}
          onChange={setField}
          {...shared}
        />
        <Derived label="산출 주문수량" value={buyQty > 0 ? `${NUM.format(buyQty)}주` : '—'} />
        <Derived
          label="실제 주문금액"
          value={buyQty > 0 ? `${NUM.format(buyQty * form.buyOrderPrice)}원` : '—'}
        />
      </Group>

      <Group
        slot="sweep"
        tone="buy"
        title="한방체결"
        hint="N건 연속 한 호가에서 체결이 쏟아지면 매수 재평가"
        showHint
        switchProps={{
          label: '한방체결 켜기',
          checked: form.sweepEnabled,
          onChange: (v) => toggleGate('sweepEnabled', v),
        }}
      >
        <NumField
          id="lc-sweep-tick"
          label="호가변경"
          unit="건"
          field="sweepMinTickCount"
          value={form.sweepMinTickCount}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-sweep-watch-price"
          label="한방가격"
          unit="원"
          field="sweepWatchPrice"
          value={form.sweepWatchPrice}
          onChange={setField}
          {...shared}
        />
      </Group>
    </Card>
  );

  const sellCard = (
    <Card>
      <Group
        slot="sell"
        tone="sell"
        title="매도주문"
        status={sellStatusText}
        led={form.sellEnabled ? 'watch' : 'off'}
        switchProps={{
          label: '매도주문 켜기',
          checked: form.sellEnabled,
          onChange: (v) => toggleGate('sellEnabled', v),
        }}
      >
        <NumField
          id="lc-sell-watch-price"
          label="비교가격"
          unit="원"
          field="sellWatchPrice"
          value={form.sellWatchPrice}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-sell-watch-qty"
          label="호가잔량"
          unit="주"
          field="sellWatchQty"
          value={form.sellWatchQty}
          onChange={setField}
          {...shared}
        />
        <CheckRow
          id="lc-sell-qty-track"
          label="잔량추적"
          checked={form.sellQtyTrackEnabled}
          onCheckedChange={(v) => setField('sellQtyTrackEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('sellQtyTrackEnabled')}
        >
          <NumInput
            id="lc-sell-qty-track-ratio"
            aria-label="매도 잔량추적 비율"
            unit="%"
            value={form.sellQtyTrackRatio}
            onValueChange={(v) => setField('sellQtyTrackRatio', v)}
            disabled={disabled || !form.sellQtyTrackEnabled}
            dirty={dirtySet.has('sellQtyTrackRatio')}
            flash={flash.has('sellQtyTrackRatio')}
            className="w-[104px] flex-none"
          />
        </CheckRow>
        <CheckRow
          id="lc-sell-trade"
          label="체결"
          checked={form.sellTradeQtyEnabled}
          onCheckedChange={(v) => setField('sellTradeQtyEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('sellTradeQtyEnabled')}
        >
          <NumInput
            id="lc-sell-min-trade-qty"
            aria-label="매도 체결 수량"
            unit="주"
            value={form.sellMinTradeQty}
            onValueChange={(v) => setField('sellMinTradeQty', v)}
            disabled={disabled || !form.sellTradeQtyEnabled}
            dirty={dirtySet.has('sellMinTradeQty')}
            flash={flash.has('sellMinTradeQty')}
            className="w-[104px] flex-none"
          />
        </CheckRow>
        {/* 잔량추적 기준선은 **S→C 전용**이다 — 서버가 매도 진입을 래치한 뒤에만 존재한다. */}
        {server?.sellEntryLatched ? (
          <Derived
            label="잔량추적 기준선"
            value={`${NUM.format(server.sellQtyTrackBaseline)}주`}
          />
        ) : null}
      </Group>

      <Group slot="sell-price" tone="sell" title="매도가격">
        <NumField
          id="lc-sell-order-price"
          label="매도가격"
          unit="원"
          field="sellOrderPrice"
          value={form.sellOrderPrice}
          onChange={setField}
          {...shared}
        />
        <NumField
          id="lc-sell-order-ratio"
          label="매도비율"
          unit="%"
          field="sellOrderRatio"
          value={form.sellOrderRatio}
          onChange={setField}
          {...shared}
        />
        <Derived
          label={`예상 매도수량 (매도가능 ${NUM.format(sellableQty)}주 × ${form.sellOrderRatio}%)`}
          value={sellQty > 0 ? `${NUM.format(sellQty)}주` : '—'}
          note="서버 계산값이 정본이에요"
        />
      </Group>

      {/*
        ★ 자동취소는 **가드**다 — 중립색(좌측 3px `--border`)이고 방향색을 쓰지 않는다.
        경고 전용 색 토큰은 이 저장소에 없다(UI-SPEC C1/FLAG-1).
      */}
      <Group
        slot="cancel"
        tone="neutral"
        title="매수 미체결 자동취소"
        caption="가드"
        hint="비교가격은 매수가격을 그대로 사용 · 잔량추적은 취소잔량과 함께만 동작"
        showHint
      >
        <CheckRow
          id="lc-cancel-qty"
          label="취소잔량"
          checked={form.cancelQtyEnabled}
          onCheckedChange={(v) => setField('cancelQtyEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('cancelQtyEnabled')}
        >
          <NumInput
            id="lc-cancel-watch-qty"
            aria-label="취소 감시 잔량"
            unit="주"
            value={form.cancelWatchQty}
            onValueChange={(v) => setField('cancelWatchQty', v)}
            disabled={disabled || !form.cancelQtyEnabled}
            dirty={dirtySet.has('cancelWatchQty')}
            flash={flash.has('cancelWatchQty')}
            className="w-[104px] flex-none"
          />
        </CheckRow>
        <CheckRow
          id="lc-cancel-trade"
          label="매도 「체결」 값 재사용"
          checked={form.cancelTradeEnabled}
          onCheckedChange={(v) => setField('cancelTradeEnabled', v)}
          disabled={disabled}
          dirty={dirtySet.has('cancelTradeEnabled')}
        />
        {/* 취소 잔량추적은 **취소잔량과 함께만** 동작한다 — 미체크면 비활성(A9). */}
        <CheckRow
          id="lc-cancel-qty-track"
          label="매도 「비율」 값 재사용"
          checked={form.cancelQtyTrackEnabled}
          onCheckedChange={(v) => setField('cancelQtyTrackEnabled', v)}
          disabled={disabled || !form.cancelQtyEnabled}
          dimmed={!form.cancelQtyEnabled}
          dirty={dirtySet.has('cancelQtyTrackEnabled')}
        />
      </Group>
    </Card>
  );

  return (
    <div data-slot="limit-chaser-form" className={cn('min-w-0', className)}>
      {/*
        모바일 세그먼트 탭 — `order-panel.tsx:426~449` 마크업 승계.
        Radix `ToggleGroup` 을 쓰지 않는 근거는 파일 상단 ⑧.
      */}
      <div
        role="tablist"
        aria-label="주문 설정"
        className="mb-[var(--s-2)] grid grid-cols-2 gap-[var(--s-1)] min-[1280px]:hidden"
      >
        {(['buy', 'sell'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'h-9 min-w-0 rounded-[var(--r)] border text-[length:var(--t-sm)] font-semibold',
              tab === t && t === 'buy' && 'border-[var(--up)] bg-[var(--up-bg)] text-[var(--up)]',
              tab === t && t === 'sell' && 'border-[var(--down)] bg-[var(--down-bg)] text-[var(--down)]',
              tab !== t && 'border-[var(--border)] bg-transparent text-[var(--muted-fg)]',
            )}
          >
            {t === 'buy' ? '매수' : '매도'}
          </button>
        ))}
      </div>

      {/* `.lc3` 의 매수·매도 두 컬럼. **그리드 자식 전부 `min-w-0`**(lessons.md). */}
      <div className="grid min-w-0 grid-cols-1 gap-[var(--s-2)] min-[1280px]:grid-cols-2 min-[1280px]:gap-[var(--s-4)] [&>*]:min-w-0">
        {/*
          ★ 비활성 pane 은 **`hidden` 속성**이다 — 좁은 폭에서만 건다(`useNarrowLayout`).
            작성자 `display:grid` 가 UA 규칙을 이기므로 globals.css 의
            `[hidden]{display:none!important}` 가 backstop 이다(Pitfall 13).
        */}
        <div data-pane="buy" hidden={narrow && tab !== 'buy'} className="min-w-0">
          {buyCard}
        </div>
        <div data-pane="sell" hidden={narrow && tab !== 'sell'} className="min-w-0">
          {sellCard}
        </div>
      </div>

      <DirtyActionBar
        dirtyCount={dirty.length}
        submitting={submitting}
        onSubmit={handleSubmit}
        onRevert={handleRevert}
        hint={DIRTY_HINT}
      />
    </div>
  );
}

/* ───────────────────────── 폼 구성 요소 ───────────────────────── */

/** `.fcard` — 라벨 컬럼 폭(`--lw`)을 카드 안에서 공유한다. 그룹을 카드로 쪼개면 그 공유가 깨진다. */
function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] [--lw:60px] min-[1280px]:[--lw:72px]"
    >
      {children}
    </div>
  );
}

interface GroupSwitchProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

/** `.grp` — 좌측 3px 액센트 + 헤더(LED · 제목 · 상태문구 · 우측 끝 스위치). */
function Group({
  slot,
  tone,
  title,
  status,
  caption,
  led,
  hint,
  showHint = false,
  switchProps,
  children,
}: {
  slot: 'buy' | 'buy-price' | 'sweep' | 'sell' | 'sell-price' | 'cancel';
  tone: 'buy' | 'sell' | 'neutral';
  title: string;
  status?: string;
  caption?: string;
  led?: 'on' | 'off' | 'watch';
  hint?: string;
  /** 힌트를 화면에 렌더할지. 기본은 **`title` 툴팁으로만** — 고밀도 폼에서 한 줄이 컬럼 정렬을 깬다. */
  showHint?: boolean;
  switchProps?: GroupSwitchProps;
  children: ReactNode;
}) {
  const accent =
    tone === 'buy' ? 'var(--up)' : tone === 'sell' ? 'var(--down)' : 'var(--border)';
  return (
    <section
      data-slot={`lc-group-${slot}`}
      title={hint}
      className="relative min-w-0 border-t border-[var(--border)] py-[var(--s-2)] pl-[var(--s-4)] pr-[var(--s-2)] first:border-t-0 min-[1280px]:pr-[var(--s-3)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: accent }}
      />
      <div className="flex min-h-6 min-w-0 items-center gap-[var(--s-2)]">
        {led != null ? (
          <span
            aria-hidden="true"
            className={cn(
              'size-2 flex-none rounded-full',
              led === 'on' && 'bg-[var(--up)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--up)_25%,transparent)]',
              led === 'watch' &&
                'bg-[var(--down)] shadow-[0_0_0_3px_color-mix(in_oklch,var(--down)_25%,transparent)]',
              led === 'off' && 'border-[1.5px] border-[var(--muted-fg)] bg-transparent opacity-60',
            )}
          />
        ) : null}
        <span className="min-w-0 flex-1 leading-normal">
          <span className="text-[11px] font-semibold tracking-[0.06em] text-[var(--muted-fg)]">
            {title}
          </span>
          {status ? <span className="ml-1 text-[11px] text-[var(--muted-fg)]">{status}</span> : null}
          {caption ? (
            <span className="ml-1 text-[11px] text-[var(--muted-fg)]">{caption}</span>
          ) : null}
        </span>
        {/*
          ★ 스위치는 그룹 헤더 **우측 끝 고정**(`ml-auto`)이다 — 크기(44×26)·간격(gap 8px)과
            함께 이 화면의 유일한 오터치 방어다(파일 상단 ② 3).
        */}
        {switchProps != null ? <GateSwitch tone={tone} {...switchProps} /> : null}
      </div>
      {children}
      {showHint && hint ? (
        <p className="mt-[var(--s-1)] hidden text-[11px] text-[var(--muted-fg)] min-[1280px]:block">
          {hint}
        </p>
      ) : null}
    </section>
  );
}

/**
 * 게이트 스위치 — **44×26**. 누르면 확인 없이 즉시 전송된다(D-05).
 *
 * 순수 버튼인 이유는 파일 상단 ⑧. `role="switch"` + `aria-checked` 로 Radix 와 같은
 * 접근성 계약을 그대로 만족한다.
 */
function GateSwitch({
  tone,
  label,
  checked,
  onChange,
}: GroupSwitchProps & { tone: 'buy' | 'sell' | 'neutral' }) {
  const on = tone === 'buy' ? 'var(--up)' : tone === 'sell' ? 'var(--down)' : 'var(--primary)';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative ml-auto h-[26px] w-[44px] flex-none rounded-full border-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: checked ? on : 'var(--border)' }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] size-5 rounded-full bg-white shadow-[0_1px_2px_oklch(0_0_0/.3)] transition-[left]',
          checked ? 'left-[21px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}

/** `.fr` — 「라벨 | 입력」 한 줄. 라벨 폭은 카드가 정한 `--lw` 를 공유한다. */
function Row({
  label,
  htmlFor,
  dirty = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  dirty?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-[var(--s-1)] grid min-h-8 min-w-0 grid-cols-[var(--lw)_minmax(0,1fr)] items-center gap-[var(--s-2)]">
      <label
        htmlFor={htmlFor}
        className={cn(
          'truncate text-[length:var(--t-caption)]',
          dirty ? 'font-semibold text-[var(--primary)]' : 'text-[var(--muted-fg)]',
        )}
      >
        {/* 더티 표시는 색만이 아니라 **문자**로도 남긴다(WCAG 1.4.1). */}
        {dirty ? '● ' : ''}
        {label}
      </label>
      {children}
    </div>
  );
}

/** 숫자 입력 — 천단위 구분자 표시, 입력은 숫자만 남긴다. */
function NumInput({
  id,
  unit,
  value,
  onValueChange,
  disabled,
  dirty,
  flash,
  className,
  ...rest
}: {
  id: string;
  unit?: string;
  value: number;
  onValueChange: (next: number) => void;
  disabled?: boolean;
  dirty?: boolean;
  flash?: boolean;
  className?: string;
} & Pick<React.ComponentProps<'input'>, 'aria-label'>) {
  return (
    <div
      className={cn(
        'flex h-8 min-w-0 items-center gap-1 rounded-[var(--r)] border bg-[var(--bg)] px-2',
        dirty
          ? 'border-[var(--primary)] shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary)_18%,transparent)]'
          : 'border-[var(--input)]',
        flash && 'motion-safe:bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]',
        disabled && 'opacity-45',
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={NUM.format(value)}
        onChange={(e) => onValueChange(parseDigits(e.target.value))}
        className="mono min-w-0 flex-1 bg-transparent text-right text-[length:var(--t-caption)] text-[var(--fg)] outline-none disabled:cursor-not-allowed"
        {...rest}
      />
      {unit ? <span className="flex-none text-[11px] text-[var(--muted-fg)]">{unit}</span> : null}
    </div>
  );
}

/** 「라벨 | 숫자 입력」 한 줄 — 더티·플래시 배선을 한 곳에 모은다. */
function NumField<K extends keyof LimitChaserFormValues>({
  id,
  label,
  unit,
  field,
  value,
  onChange,
  dirty,
  flash,
  disabled,
}: {
  id: string;
  label: string;
  unit: string;
  field: K & LimitChaserDirtyField;
  value: number;
  onChange: (key: K, value: LimitChaserFormValues[K]) => void;
  dirty: ReadonlySet<string>;
  flash: ReadonlySet<string>;
  disabled: boolean;
}) {
  const isDirty = dirty.has(field);
  return (
    <Row label={label} htmlFor={id} dirty={isDirty}>
      <NumInput
        id={id}
        unit={unit}
        value={value}
        onValueChange={(v) => onChange(field, v as LimitChaserFormValues[K])}
        disabled={disabled}
        dirty={isDirty}
        flash={flash.has(field)}
      />
    </Row>
  );
}

/** `.ck` — 체크박스 한 줄. 입력이 있으면 오른쪽 끝으로 민다(위 「라벨 | 입력」 행과 끝이 맞는다). */
function CheckRow({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
  dimmed = false,
  dirty = false,
  children,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** 선행 조건이 꺼져 있을 때 — 비활성 + `opacity:.45`(A9). */
  dimmed?: boolean;
  dirty?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'mt-[var(--s-1)] flex min-h-8 min-w-0 flex-wrap items-center gap-[var(--s-2)]',
        dimmed && 'opacity-45',
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="size-[18px] flex-none accent-[var(--primary)] disabled:cursor-not-allowed"
      />
      <label
        htmlFor={id}
        className={cn(
          'min-w-0 truncate text-[length:var(--t-caption)]',
          dirty ? 'font-semibold text-[var(--primary)]' : 'text-[var(--fg)]',
        )}
      >
        {dirty ? '● ' : ''}
        {label}
      </label>
      {children}
    </div>
  );
}

/** `.drv` — 읽기 전용 파생값. 서버 계산값이 정본이라는 사실을 숨기지 않는다. */
function Derived({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="mt-[var(--s-1)] flex min-w-0 items-baseline justify-between gap-[var(--s-2)] text-[11px] text-[var(--muted-fg)]">
      <span className="min-w-0">
        {label}
        {note ? <span className="ml-1 opacity-80">· {note}</span> : null}
      </span>
      <b className="mono flex-none font-semibold text-[var(--fg)]">{value}</b>
    </div>
  );
}

/** 입력 문자열에서 숫자만 남겨 정수로. 빈 값은 0 이다(「모름」이 아니라 0 이다). */
function parseDigits(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length === 0 ? 0 : Number(digits);
}
