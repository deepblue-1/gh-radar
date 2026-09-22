'use client';

/**
 * ViSettingsRows — `/trading` 작업대의 **VI 설정 2줄** (UI-SPEC §레이아웃 계약 3 · E2,
 * TRADE-08 · D-05 · D-27). 정본은 상단 정리 목업 `260923-bjb-mockup.html` 의 `.visets` · `.virow`
 * 다. VI 패널(`vi-trigger-strip.tsx`) 「더보기」 펼침 안에 선다.
 *
 * ① 무엇을 그리는가
 *   거래소당 한 줄 — 줄 = 거래소 태그 · on/off 스위치(`run`) · 「상승률」 % · 「금액」 만원 ·
 *   더티면 줄 끝 「수정」. 본문(`@container/wb`) 830 미만은 KRX·NXT 가 위아래로 쌓이고, 830
 *   이상은 한 줄에 나란히(2열 · 세로 구분선) 선다. 경계 정본은 `globals.css` §2.2b.
 *   가동 상태는 스위치가 말한다 — 색·위치와 `aria-checked` · `aria-label` 「VI {EX} 중지|시작」.
 *   ★ **계좌 셀렉터는 줄에 없다** — 계좌는 상태줄이 고르고 prop 으로 내려온다(Q-1 채택값, 18-11).
 *
 * ② ★ 줄의 거래소가 곧 `vi.set` 의 거래소다 (Pitfall 8)
 *   Phase 17 까지는 고정 거래소 상수 하나를 캡션·송신·요약이 함께 읽었다. 이제 거래소는
 *   **줄의 prop** 이고, 송신부가 그 prop 을 그대로 싣는다. 고정 값이 한 곳이라도 남으면 NXT
 *   줄의 「수정」이 KRX 전략을 덮는다 — 사용자는 NXT 를 고쳤다고 믿고 KRX 에서 다른 금액으로
 *   무인 매수가 나간다.
 *   ★ 두 줄은 값이 완전히 같아도 **서로 다른 전략 슬롯**이다. 폼·기준선·전송 잠금·에코 상관을
 *     줄 인스턴스마다 따로 든다 — 상위에서 에코를 받아 나눠 주는 구조를 만들지 않는다
 *     (Pitfall 9 와 같은 이유: 분배 로직이 상관의 두 번째 벌이 된다).
 *
 * ③ ★ 값은 자동 반영되지 않는다 (Phase 16 D-07 승계)
 *   상승률·금액을 바꾸면 줄이 더티가 되고 줄 끝 「수정」을 눌러야 `SetVITriggerReq(11)` 이
 *   나간다. **`run` 은 그때 현재값 그대로** 실린다. 디바운스도 지연 전송도 없다.
 *
 * ④ ★ 시작/중지만 확인 다이얼로그 (Phase 16 D-07 · T-16-10)
 *   스위치는 바로 보내지 않는다 — 사람 확인 없이 주문이 나가기 시작하는 유일한 조작이다.
 *   다이얼로그 규율(기본 포커스 = 취소/닫기, `showCloseButton={false}`, 요약에 계좌·금액·
 *   상승률·거래소)은 `ViConfirmDialog` 한 곳에 있다.
 *
 * ⑤ ★ 제출 후 즉시 재활성하지 않는다 — 그리고 **타이머는 잠금을 풀 뿐 아무것도 다시 보내지
 *   않는다** (T-16-10). 에코(61) 전에는 「수정」이 「반영 중…」+disabled, 스위치는 pending.
 *   3초 안에 에코가 없으면 잠금을 풀고 줄 아래에 「미반영」을 말한다 — 서버는 거부를 응답
 *   코드로 주지 않으므로 **에코가 오지 않는 것이 곧 거부**다. 더티 값은 그대로 둔다.
 *   ★ `send` 가 `false`(보내지 **못함**)면 잠그지 않는다 (GC-WR-06).
 *
 * ⑥ ★ 에코 규율 (D-27 · CR-01)
 *   에코가 오면 기준선을 덮고 더티를 지운다. 내가 보낸 적 없는 에코가 **더티 중에** 오면
 *   값을 덮고 「다른 단말에서 변경됨」을 줄 아래 `role="status"` 로 띄운다 — 토스트 라이브러리를
 *   쓰지 않는다. 빈 61(`null`, 미등록)은 사용자의 입력을 지우지 않는다.
 *
 * ⑦ ★ 단위 (「한 번 더 곱하면 1만 배 주문」)
 *   폼은 만원, 와이어는 원이다. 변환은 `manwonToKrw`/`krwToManwon`(`lib/vi-alert.ts`) 뿐이다.
 *   이 파일에 만원 곱셈을 인라인으로 쓰지 않는다.
 *
 * ⑧ ★ LOCKED 색 규칙 (UI-SPEC §Color)
 *   가동 스위치의 빨강 채움은 `--up`(가격 방향 축)이지 `--destructive` 가 아니다. 두 값이 같으므로
 *   다이얼로그의 「중지」는 테두리형, 「시작」만 `--up` 채움이다.
 *
 * ⑨ ★ 계좌 정본 (CR-02 · UI-SPEC Q-3 VI 판)
 *   등록된 전략(서버 61 에코의 `accountNo` 가 공란 아님)은 **자기 계좌를 유지한다** — 상태줄
 *   계좌는 미등록 줄의 기본값일 뿐이다. 그 줄이 보내는 모든 `vi.set`(「수정」·시작·중지)과 잠금·
 *   확인 요약·고지가 `viRowAccountOf` 한 값을 읽는다. 상태줄 계좌로 보내면 계좌 B 로 가동 중인
 *   무인 매수가 「수정」 한 번에 조용히 A 로 옮겨 간다(실돈 오계좌 주문).
 *   ★ 잠그지 않는다 — 계좌가 다를 때 줄을 잠그면 **중지**도 막혀 무인 매수를 끄려면 상태줄부터
 *     바꿔야 한다. 정본 계좌로 보내면 옮겨지는 것 자체가 없고, 줄 아래 `role="status"` 한 줄이
 *     「어느 계좌의 VI 인지」를 말한다. 같으면 아무것도 그리지 않는다(D-05 평상시 그대로).
 *   ★ 중지 상태에서만 명시 동작으로 옮긴다 (GC-WR-04 · 사용자 결정 2026-09-22). 등록 줄이
 *     **중지**(`run:false`)이고 등록 계좌 B 가 상태줄 계좌 A 와 다를 때만, 고지 옆에 「상태줄
 *     계좌({A})로 옮겨 시작」 이 붙는다. 누르면 시작 확인 창의 「계좌」 줄이 「B → A」 를 말하고,
 *     확정하면 같은 거래소 슬롯에 `vi.set{accountNo:A, run:true}` 가 **한 번** 나간다(삭제·재등록
 *     경로는 없다). 가동 중에는 버튼이 없고(DOM 부재) `submit` 도 계좌 지정 송신을 막는다 — 두 겹.
 *     확정 직전 `viMoveTargetOf` 를 다시 계산해 창을 연 때의 B → A 와 다르면 아무것도 보내지 않는다.
 *     일반 스위치 시작·「수정」 은 여전히 B 다 — 계좌 이동은 이 동작 하나뿐이다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { serverMsgBadge } from '@gh-radar/shared';
import type {
  RelayExchange,
  RelayViOrderItem,
  RelayViSetMsg,
  RelayViTrigger,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExchangeTag } from '@/components/trading/vi-order-list';
import { MAX_VI_ORDER_AMOUNT_MANWON, krwToManwon, manwonToKrw } from '@/lib/vi-alert';
import { useRelayContext } from '@/lib/relay-provider';
import { VI_EXCHANGES, type RelayViTriggers } from '@/lib/use-relay-socket';
import type { ViServerError } from '@/lib/use-vi-server-error';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

/* ───────────────────────── 승계 상수 (Phase 16 옛 VI 설정 카드 · 18-13 삭제) ───────────────────────── */

/**
 * 전송 후 잠금을 푸는 상한(ms). WinForms `RespTimeoutMs` 와 **같은 값**이다.
 * ★ 이 타이머는 잠금을 풀 뿐 **아무것도 다시 보내지 않는다**(⑤).
 */
export const VI_ACK_TIMEOUT_MS = 3_000;

/** WinForms `VITrigger` 초기 상태값 이식 — 금액 1,000만원 · 상승률 22%. */
export const VI_DEFAULT_AMOUNT_MANWON = 1_000;
export const VI_DEFAULT_CHECK_RATE = 22;

/**
 * 금액 상한 안내 문구 — **잘린 이유**를 말한다 (WR-07). 상한값의 정본은 `@gh-radar/shared`
 * 의 원 단위 상수이고, `vi-alert.ts` 가 만원으로 유도한 값을 쓴다 — 숫자를 여기 다시 적지 않는다.
 */
export const VI_AMOUNT_LIMIT_MESSAGE = `주문금액은 최대 ${NUM.format(MAX_VI_ORDER_AMOUNT_MANWON)}만원까지 넣을 수 있어요`;

/** `vi.set` 이 **나가지 못했을 때**의 문구 (GC-WR-06). */
export const VI_SET_SEND_FAILED_TEXT =
  '연결이 끊겨 설정을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.';

/** 3초 안에 에코가 없을 때 — 기존 VI 화면 상태줄 문구 그대로(신규 문구 없음, E2 error). */
export const VI_ACK_TIMEOUT_TEXT = '미반영 · 서버 응답을 기다리고 있어요';

/** 더티 중 다른 단말의 에코가 값을 덮었을 때 (D-27). */
export const VI_ECHO_OVERWRITTEN_TEXT = '다른 단말에서 변경됨';

/** 「수정」 보조 설명 — VI 줄 더티 바 기존 문구 유지(UI-SPEC §Copywriting). */
export const VI_DIRTY_HINT = '「수정」을 눌러야 반영돼요 · 가동 상태(run)는 그대로 유지돼요';

/**
 * 등록 계좌 ≠ 상태줄 계좌일 때 줄 아래 고지 (⑨ · UI-SPEC Q-3 「그 사실을 UI 가 말해야 한다」).
 * 이름은 세션 계좌 목록에서 **정본 계좌로** 찾은 값이다 — 없으면 번호만.
 * `run` 으로 두 갈래(GC-WR-04): 가동 중이면 옮길 수 없다는 것과 방법(먼저 중지)을 말하고, 중지면
 * 사실만 말한다 — 옮기는 길은 바로 옆 버튼이 말한다(위치를 가리키는 말은 폭마다 틀려진다).
 */
export function viRegisteredAccountText(accountNo: string, name: string | undefined, run: boolean): string {
  const label = name !== undefined && name !== '' ? `${accountNo} · ${name}` : accountNo;
  return run
    ? `계좌 ${label} 에 등록된 VI 예요 — 가동 중에는 이 계좌로만 나가요 · 옮기려면 먼저 중지하세요`
    : `계좌 ${label} 에 등록된 VI 예요 — 수정·시작은 이 계좌로 나가요`;
}

/**
 * 줄 계좌 판정의 **유일 지점** (⑨). 등록 전략(객체 ∧ `accountNo` 공란 아님)이면 그 계좌,
 * 아니면 상태줄 계좌. `differs` 는 등록 계좌가 상태줄 계좌와 다를 때만 참이다.
 */
export function viRowAccountOf(
  server: RelayViTrigger | null | undefined,
  statusAccountNo: string,
): { accountNo: string; differs: boolean } {
  const registered = server != null && server.accountNo !== '' ? server.accountNo : null;
  if (registered === null) return { accountNo: statusAccountNo, differs: false };
  return { accountNo: registered, differs: registered !== statusAccountNo };
}

/**
 * 옮기기 대상 판정 (GC-WR-04 · 사용자 결정 2026-09-22). 등록 전략(객체 ∧ `accountNo` 공란 아님)
 * ∧ **중지**(`run === false`) ∧ 상태줄 계좌 공란 아님 ∧ 등록 계좌 ≠ 상태줄 계좌일 때만
 * `{from: 등록 계좌, to: 상태줄 계좌}`, 아니면 `null`.
 *   ★ 가동 중에는 절대 옮기지 않는다 — 무인 매수가 도는 중에 계좌가 바뀌면 실돈 오계좌다(CR-02).
 *   ★ 옮기기는 명시 동작 하나다 — 「수정」·일반 스위치 시작은 이 판정을 읽지 않는다.
 */
export function viMoveTargetOf(
  server: RelayViTrigger | null | undefined,
  statusAccountNo: string,
): { from: string; to: string } | null {
  if (server == null || server.accountNo === '') return null;
  if (server.run !== false) return null;
  if (statusAccountNo === '' || server.accountNo === statusAccountNo) return null;
  return { from: server.accountNo, to: statusAccountNo };
}

/** 옮기기 창을 연 뒤 상태(가동·등록 계좌·상태줄 계좌)가 바뀌어 보내지 않았을 때 (T-18-118). */
export const VI_MOVE_STALE_TEXT = '계좌 상태가 바뀌었어요 — 다시 확인해 주세요';

/** 「다른 단말에서 변경됨」 고지를 두는 시간(ms). 기존 VI 화면 에코 배너와 같은 6초다. */
const VI_ECHO_NOTICE_MS = 6_000;

/* ───────────────────────────── 순수 조각 ───────────────────────────── */

/** 줄 폼이 다루는 값 2개. `null` 은 **공란**이다(0 이 아니다 — 공란이면 「수정」이 잠긴다). */
interface ViRowForm {
  /** 정수 %. */
  checkRate: number | null;
  /** **만원 단위**. 와이어(원)로는 `manwonToKrw` 를 통해서만 나간다. */
  amountManwon: number | null;
}

type ViRowField = keyof ViRowForm;

const DEFAULT_FORM: ViRowForm = {
  checkRate: VI_DEFAULT_CHECK_RATE,
  amountManwon: VI_DEFAULT_AMOUNT_MANWON,
};

/** 서버 에코 → 줄 폼. `null`/`undefined` 는 폼을 만들지 않는다(⑥ — 호출부가 거른다). */
function formFromServer(server: RelayViTrigger): ViRowForm {
  return {
    checkRate: server.checkRate,
    amountManwon: krwToManwon(server.orderAmountKrw),
  };
}

/** 두 값의 차이 필드 집합. 라벨 접두와 개수가 **같은 계산**을 쓴다. */
function dirtyFieldsOf(form: ViRowForm, base: ViRowForm): ReadonlySet<ViRowField> {
  const out = new Set<ViRowField>();
  if (form.checkRate !== base.checkRate) out.add('checkRate');
  if (form.amountManwon !== base.amountManwon) out.add('amountManwon');
  return out;
}

/** 입력 문자열에서 숫자만 남긴다. 숫자가 하나도 없으면 **공란(null)** 이다. */
export function parseDigits(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length === 0 ? null : Number(digits);
}

/** 중지 확인 요약용 — 아직 살아 있는(미체결) VI 주문인가. 중지해도 **유지**된다. */
function isLiveViOrder(item: RelayViOrderItem): boolean {
  return item.state === 'Pending' || item.state === 'Accepted' || item.state === 'Cancelling';
}

type ViSubmitResult = 'sent' | 'blocked' | 'failed';

/* ───────────────────────────── 2줄 ───────────────────────────── */

export interface ViSettingsRowsProps {
  /** 거래소별 서버 에코. 키 부재 = 미조회 / `null` = 미등록 / 객체 = 등록됨(3상태를 뭉개지 않는다). */
  viTriggers: RelayViTriggers;
  /**
   * 상태줄에서 고른 계좌 — **미등록 줄의 기본 계좌**다. 등록된 줄은 서버 에코의 계좌가 정본이다(⑨).
   * 정본 계좌가 비어 있으면 줄이 잠긴다(계좌 없는 `vi.set` 은 서버가 버린다).
   */
  accountNo: string;
  /** 상태줄 계좌의 이름 — 정본 계좌가 상태줄 계좌와 같을 때만 요약에 붙는다. */
  accountName?: string;
  /** 세션이 준비되지 않았다(`status !== 'ready'`). */
  disabled?: boolean;
  /** 중지 확인 요약의 「오늘 VI 주문」·「미체결」 — 줄의 거래소로 걸러 센다. */
  viOrders?: readonly RelayViOrderItem[];
  /** 전송한 프레임 알림(로그용). */
  onSent?: (msg: RelayViSetMsg) => void;
  /** 두 줄 더티 개수의 **합** — 상위 이탈 경고 게이트. */
  onDirtyCountChange?: (count: number) => void;
  className?: string;
}

export function ViSettingsRows({
  viTriggers,
  accountNo,
  accountName,
  disabled = false,
  viOrders = [],
  onSent,
  onDirtyCountChange,
  className,
}: ViSettingsRowsProps) {
  const [dirtyByExchange, setDirtyByExchange] = useState<Partial<Record<RelayExchange, number>>>({});

  const handleRowDirty = useCallback((exchange: RelayExchange, count: number) => {
    setDirtyByExchange((prev) => (prev[exchange] === count ? prev : { ...prev, [exchange]: count }));
  }, []);

  const total = VI_EXCHANGES.reduce((sum, ex) => sum + (dirtyByExchange[ex] ?? 0), 0);
  useEffect(() => {
    onDirtyCountChange?.(total);
  }, [total, onDirtyCountChange]);

  return (
    <section
      data-slot="vi-settings-rows"
      className={cn(
        'grid min-w-0 grid-cols-1 gap-1.5 @min-[830px]/wb:grid-cols-2 @min-[830px]/wb:gap-x-4',
        className,
      )}
    >
      {VI_EXCHANGES.map((exchange) => {
        const mine = viOrders.filter((o) => o.exchange === exchange);
        return (
          <ViSettingsRow
            key={exchange}
            exchange={exchange}
            server={viTriggers[exchange]}
            accountNo={accountNo}
            accountName={accountName}
            disabled={disabled}
            todayOrderCount={mine.length}
            unfilledCount={mine.filter(isLiveViOrder).length}
            onSent={onSent}
            onDirtyCountChange={handleRowDirty}
          />
        );
      })}
    </section>
  );
}

/**
 * 최신 VI 몫 서버 거부 1건 — 경보(`role="alert"`). 판정(`isViServerMessage`)은 작업대의
 * `useViServerError` 가 하고 여기서는 그리기만 한다(18-13 · 옛 VI 상태줄 계약 승계).
 * 줄마다가 아니라 **한 자리**인 이유: `Account`·`VITrigger` 통지에는 거래소 축이 없다(어느 줄의
 * 거부인지 서버가 말하지 않는다). 자리는 작업대가 정한다 — VI 패널이 접혀도 보이는 곳이다.
 * 출처 배지는 `serverMsgBadge` 하나로 판정하는 텍스트 접두다(색만으로 가르지 않는다).
 */
export function ViServerErrorLine({
  error,
  className,
}: {
  error: ViServerError | null;
  className?: string;
}) {
  if (error === null) return null;
  return (
    <p
      role="alert"
      data-slot="vi-server-error"
      className={cn('m-0 min-w-0 text-[11px] break-keep text-[var(--destructive)]', className)}
    >
      <span data-slot="vi-server-error-src" className="font-semibold">
        {serverMsgBadge(error.src)}
      </span>{' '}
      {error.text}
    </p>
  );
}

/* ───────────────────────────── 한 줄 ───────────────────────────── */

interface ViSettingsRowProps {
  /** ★ 이 줄의 거래소 — `vi.set` 페이로드의 `exchange` 로 **그대로** 나간다(②). */
  exchange: RelayExchange;
  server: RelayViTrigger | null | undefined;
  /** 상태줄 계좌 — 미등록 줄의 기본 계좌(⑨). 송신에는 `viRowAccountOf` 결과만 쓴다. */
  accountNo: string;
  /** 상태줄 계좌의 이름. */
  accountName?: string;
  disabled: boolean;
  todayOrderCount: number;
  unfilledCount: number;
  onSent?: (msg: RelayViSetMsg) => void;
  onDirtyCountChange: (exchange: RelayExchange, count: number) => void;
}

function ViSettingsRow({
  exchange,
  server,
  accountNo,
  accountName,
  disabled,
  todayOrderCount,
  unfilledCount,
  onSent,
  onDirtyCountChange,
}: ViSettingsRowProps) {
  const { send, accounts } = useRelayContext();
  const ex = exchange.toLowerCase();

  /* ── 계좌 정본 (⑨) — 잠금·송신·확인 요약·고지가 이 한 값을 읽는다 ── */
  const { accountNo: rowAccountNo, differs: accountDiffers } = viRowAccountOf(server, accountNo);
  /** 계좌 이름 — 세션 목록에서 찾고, 상태줄 이름(prop)은 상태줄 계좌 번호 옆에만 붙인다. */
  const accountNameOf = (no: string) =>
    accounts.find((a) => a.accountNo === no)?.name ?? (no === accountNo ? accountName : undefined);
  const rowAccountName = accountNameOf(rowAccountNo);
  /** 옮기기 대상(GC-WR-04) — 중지 ∧ 계좌 다름일 때만 null 이 아니다. */
  const moveTarget = viMoveTargetOf(server, accountNo);

  const [form, setForm] = useState<ViRowForm>(DEFAULT_FORM);
  /** 더티 기준선. 미등록이면 마지막 확정 표시값이다 — 비워 두면 첫 렌더부터 더티가 뜬다. */
  const [baseline, setBaseline] = useState<ViRowForm>(DEFAULT_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState('');
  const [amountClamped, setAmountClamped] = useState(false);

  const run = server?.run === true;

  /* ── 전송 잠금 (⑤) ── */
  const [submitting, setSubmitting] = useState(false);
  /** 같은 tick 의 두 번째 확정을 막는다 — state 는 다음 렌더에서야 보인다. */
  const submittingRef = useRef(false);
  /** 마지막으로 보낸 요청. 에코가 오면 비운다. **재전송에 쓰지 않는다.** */
  const pendingRef = useRef<RelayViSetMsg | null>(null);
  const ackTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const unlock = useCallback(() => {
    submittingRef.current = false;
    setSubmitting(false);
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    ackTimer.current = null;
  }, []);

  useEffect(
    () => () => {
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  /* ── 에코 (⑥) ── */
  const prevServerRef = useRef<RelayViTrigger | null | undefined>(undefined);
  const seenSnapshotRef = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;

  useEffect(() => {
    if (server === prevServerRef.current) return;
    prevServerRef.current = server;
    if (server === undefined) return; // 미조회는 사건이 아니다

    const mine = pendingRef.current !== null;
    pendingRef.current = null;
    unlock();
    setRowError('');
    const hadSnapshot = seenSnapshotRef.current;
    seenSnapshotRef.current = true;

    // 빈 61(미등록)은 입력값을 그대로 둔다(CR-01). 가동은 `run` 파생으로 저절로 내려간다.
    if (server === null) return;

    const next = formFromServer(server);
    const overwritten = dirtyFieldsOf(formRef.current, baselineRef.current).size;
    setForm(next);
    setBaseline(next);
    setAmountClamped(false);

    // 내가 보낸 적 없는 에코가 **더티를 덮었을 때만** 말한다(D-27). 첫 스냅샷은 사건이 아니다.
    if (!mine && hadSnapshot && overwritten > 0) {
      setNotice(VI_ECHO_OVERWRITTEN_TEXT);
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), VI_ECHO_NOTICE_MS);
    }
  }, [server, unlock]);

  const dirty = useMemo(() => dirtyFieldsOf(form, baseline), [form, baseline]);
  useEffect(() => {
    onDirtyCountChange(exchange, dirty.size);
  }, [exchange, dirty.size, onDirtyCountChange]);

  const blank = form.checkRate === null || form.amountManwon === null;
  const amountOverLimit = form.amountManwon !== null && form.amountManwon > MAX_VI_ORDER_AMOUNT_MANWON;
  const showAmountLimit = amountClamped || amountOverLimit;

  /** 잠금 판정의 유일 지점 — 입력·스위치·`submit` 이 같은 값을 본다. */
  const locked = disabled || server === undefined || rowAccountNo === '';

  /* ── 입력 ── */
  const handleRate = useCallback((raw: string) => {
    setNotice(null);
    setForm((prev) => ({ ...prev, checkRate: parseDigits(raw) }));
  }, []);

  /** 상한을 넘으면 **상한으로 고정**하고 이유를 말한다 — 조용히 삼키지 않는다(WR-07). */
  const handleAmount = useCallback((raw: string) => {
    setNotice(null);
    const next = parseDigits(raw);
    const clamped = next !== null && next > MAX_VI_ORDER_AMOUNT_MANWON;
    setAmountClamped(clamped);
    setForm((prev) => ({ ...prev, amountManwon: clamped ? MAX_VI_ORDER_AMOUNT_MANWON : next }));
  }, []);

  /* ── 전송 ── */
  const submit = useCallback(
    /**
     * `accountOverride` 는 옮기기 확정(GC-WR-04)만 넘긴다. 그 순간 가동 중이면 보내지 않는다 —
     * 버튼 부재에 이은 **두 번째 겹**이다(가동 중 계좌 이전 금지 · CR-02).
     */
    (nextRun: boolean, accountOverride?: string): ViSubmitResult => {
      if (locked) return 'blocked';
      if (accountOverride !== undefined && (server?.run === true || accountOverride === '')) return 'blocked';
      if (submittingRef.current) return 'blocked'; // 두 번째 등록을 만들지 않는다
      if (form.checkRate === null || form.amountManwon === null) return 'blocked';
      // 금액 상한 가드 (WR-07 / T-16-41) — 에코발 상한 초과 값을 그대로 보내지 않는다.
      if (form.amountManwon > MAX_VI_ORDER_AMOUNT_MANWON) {
        setAmountClamped(true);
        return 'blocked';
      }
      const msg: RelayViSetMsg = {
        t: 'vi.set',
        // ★ 정본 계좌(⑨) — 등록된 전략을 상태줄 계좌로 옮기지 않는다(CR-02).
        //   예외는 옮기기 확정의 `accountOverride` 하나다(GC-WR-04 · 중지 상태만).
        accountNo: accountOverride ?? rowAccountNo,
        // ★ 줄의 거래소를 **명시**한다(②). 생략하면 relay 가 KRX 로 접는다.
        exchange,
        orderAmountKrw: manwonToKrw(form.amountManwon),
        checkRate: form.checkRate,
        run: nextRun,
      };
      if (!send(msg)) {
        setRowError(VI_SET_SEND_FAILED_TEXT);
        return 'failed';
      }
      setRowError('');
      setNotice(null);
      pendingRef.current = msg;
      submittingRef.current = true;
      setSubmitting(true);
      onSent?.(msg);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      // 표시 잠금을 풀고 「미반영」을 말할 뿐이다 — 재전송 경로는 이 파일에 없다.
      ackTimer.current = window.setTimeout(() => {
        pendingRef.current = null;
        unlock();
        setRowError(VI_ACK_TIMEOUT_TEXT);
      }, VI_ACK_TIMEOUT_MS);
      return 'sent';
    },
    [rowAccountNo, exchange, form, locked, onSent, send, unlock, server],
  );

  /* ── 확인 다이얼로그 (④) ── */
  const [confirmKind, setConfirmKind] = useState<'start' | 'stop' | null>(null);
  const [dialogError, setDialogError] = useState('');
  /**
   * 옮기기 확인 스냅샷(GC-WR-04) — 창을 연 순간의 B → A. 요약과 송신 계좌가 이 한 값에서 나온다.
   * `null` 이면 일반 시작/중지다.
   */
  const [moveSnapshot, setMoveSnapshot] = useState<{ from: string; to: string } | null>(null);

  const fixDescId = `vi-${ex}-fix-desc`;

  return (
    <div
      data-slot="vi-settings-block"
      data-exchange={exchange}
      className="flex min-w-0 flex-col gap-1 @min-[830px]/wb:not-first:border-l @min-[830px]/wb:not-first:border-[var(--border)] @min-[830px]/wb:not-first:pl-4"
    >
      {/* 한 줄 — 태그 · 스위치 · 상승률 · 금액 · (더티) 수정. 접히는 것은 「수정」 자리가 모자랄 때뿐. */}
      <div
        data-slot="vi-settings-row"
        data-exchange={exchange}
        data-run={run ? 'true' : 'false'}
        className="flex min-w-0 flex-wrap items-center gap-2"
      >
        <ExchangeTag exchange={exchange} size="md" />
        <RowSwitch
          exchange={exchange}
          checked={run}
          pending={submitting && pendingRef.current?.run !== run}
          disabled={locked || submitting}
          onClick={() => {
            setDialogError('');
            setMoveSnapshot(null);
            setConfirmKind(run ? 'stop' : 'start');
          }}
        />

        <RowField
          id={`vi-${ex}-rate`}
          label="상승률"
          unit="%"
          boxClassName="w-16"
          value={form.checkRate === null ? '' : String(form.checkRate)}
          dirty={dirty.has('checkRate')}
          disabled={locked}
          onChange={handleRate}
        />
        <RowField
          id={`vi-${ex}-amount`}
          label="금액"
          unit="만원"
          boxClassName="w-[92px]"
          value={form.amountManwon === null ? '' : NUM.format(form.amountManwon)}
          dirty={dirty.has('amountManwon')}
          disabled={locked}
          onChange={handleAmount}
        />

        {dirty.size > 0 && (
          <>
            <button
              type="button"
              data-slot="vi-row-fix"
              disabled={locked || submitting || blank}
              aria-describedby={fixDescId}
              title={VI_DIRTY_HINT}
              onClick={() => submit(run)}
              className="ml-auto h-[26px] flex-none rounded-[var(--r)] border border-transparent bg-[var(--primary)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--destructive-fg)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '반영 중…' : '수정'}
            </button>
            <span id={fixDescId} className="sr-only">
              {VI_DIRTY_HINT}
            </span>
          </>
        )}
      </div>

      {showAmountLimit && (
        <p role="status" data-slot="vi-amount-limit" className="m-0 text-[11px] text-[var(--destructive)]">
          {VI_AMOUNT_LIMIT_MESSAGE}
        </p>
      )}
      {rowError !== '' && (
        <p role="status" data-slot="vi-row-error" className="m-0 text-[11px] text-[var(--destructive)]">
          {rowError}
        </p>
      )}
      {accountDiffers && (
        /* 고지 + (중지일 때만) 옮기기 — 좁은 폭에서는 버튼이 고지 아래 줄로 내려간다(목업 1-a). */
        <div data-slot="vi-row-account-box" className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <p
            role="status"
            data-slot="vi-row-account"
            className="m-0 min-w-0 flex-[1_1_220px] text-[11px] break-keep text-[var(--muted-fg)]"
          >
            {viRegisteredAccountText(rowAccountNo, rowAccountName, run)}
          </p>
          {moveTarget !== null && (
            /* 테두리형 — 채움(`--up`)은 확인 창의 「시작」 하나다(⑧). 크기 축은 「수정」 과 같다. */
            <button
              type="button"
              data-slot="vi-row-move"
              disabled={locked || submitting || blank || amountOverLimit}
              onClick={() => {
                setDialogError('');
                setMoveSnapshot(moveTarget);
                setConfirmKind('start');
              }}
              className="h-[26px] flex-none rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-2.5 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              상태줄 계좌({moveTarget.to})로 옮겨 시작
            </button>
          )}
        </div>
      )}
      {notice !== null && (
        <p role="status" data-slot="vi-row-echo" className="m-0 text-[11px] text-[var(--fg)]">
          {notice}
        </p>
      )}

      <ViConfirmDialog
        kind={confirmKind}
        exchange={exchange}
        // ★ 요약의 「계좌」 = 실제로 나갈 계좌(⑨) — 확인하는 계좌와 송신 계좌가 갈라지지 않는다.
        //   옮기기면 스냅샷의 B → A 다(GC-WR-04) — 확정도 같은 스냅샷의 `to` 로 나간다.
        accountNo={moveSnapshot?.to ?? rowAccountNo}
        accountName={moveSnapshot !== null ? accountNameOf(moveSnapshot.to) : rowAccountName}
        moveFrom={
          moveSnapshot !== null
            ? { accountNo: moveSnapshot.from, name: accountNameOf(moveSnapshot.from) }
            : undefined
        }
        amountManwon={form.amountManwon}
        checkRate={form.checkRate}
        todayOrderCount={todayOrderCount}
        unfilledCount={unfilledCount}
        error={dialogError}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmKind(null);
            setDialogError('');
            setMoveSnapshot(null);
          }
        }}
        onConfirm={() => {
          if (confirmKind === null) return;
          let result: ViSubmitResult;
          if (moveSnapshot !== null) {
            // ★ 확정 직전 재판정(T-18-118) — 창을 연 뒤 다른 단말이 시작했거나 등록 계좌·상태줄
            //   계좌가 바뀌었으면, 요약에 보인 B → A 와 다른 이동이 나가지 않게 아무것도 보내지 않는다.
            const now = viMoveTargetOf(server, accountNo);
            if (now === null || now.from !== moveSnapshot.from || now.to !== moveSnapshot.to) {
              setDialogError(VI_MOVE_STALE_TEXT);
              return;
            }
            result = submit(true, moveSnapshot.to);
          } else {
            result = submit(confirmKind === 'start');
          }
          // 못 나갔으면 닫지 않는다 — 「창이 닫혔다」가 성공 신호로 읽힌다(GC-WR-06).
          if (result === 'failed') {
            setDialogError(VI_SET_SEND_FAILED_TEXT);
            return;
          }
          setConfirmKind(null);
          setMoveSnapshot(null);
        }}
      />
    </div>
  );
}

/* ───────────────────────────── 조각 ───────────────────────────── */

/** 「라벨 | 입력(단위)」 한 칸 (목업 `.virow .fld`). 더티는 색 + `● ` 문자로 말한다. */
function RowField({
  id,
  label,
  unit,
  boxClassName,
  value,
  dirty,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  /** 입력 상자 폭 — 상승률 64px · 금액 92px(목업 `.box` · `.box.w`). */
  boxClassName: string;
  value: string;
  dirty: boolean;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <label
        htmlFor={id}
        className={cn(
          'text-[11px] whitespace-nowrap',
          dirty ? 'font-semibold text-[var(--primary)]' : 'text-[var(--muted-fg)]',
        )}
      >
        {dirty ? `● ${label}` : label}
      </label>
      <span
        className={cn(
          'flex h-7 flex-none items-center gap-1 rounded-[var(--r)] border bg-[var(--bg)] px-1.5',
          boxClassName,
          // 포커스는 테두리색 한 겹 — 안쪽 input 의 `data-focus-ring="seamless"` 와 짝이다.
          'focus-within:border-[var(--ring)]',
          dirty ? 'border-[var(--primary)]' : 'border-[var(--input)]',
          disabled && 'opacity-45',
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          data-focus-ring="seamless"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mono w-0 min-w-0 flex-1 bg-transparent text-right text-[12px] text-[var(--fg)] outline-none disabled:cursor-not-allowed"
        />
        <span className="flex-none text-[10px] text-[var(--muted-fg)]">{unit}</span>
      </span>
    </span>
  );
}

/**
 * on/off 스위치 44×26 (목업 `.sw`). 누르면 **확인 다이얼로그**가 열린다 — 직접 보내지 않는다.
 * 공용 `ui/switch.tsx` 를 쓰지 않는 이유는 `limit-chaser-form.tsx` ⑧ 과 같다(36×20 은 터치 타깃이 작다).
 */
function RowSwitch({
  exchange,
  checked,
  pending,
  disabled,
  onClick,
}: {
  exchange: RelayExchange;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`VI ${exchange} ${checked ? '중지' : '시작'}`}
      aria-busy={pending || undefined}
      data-pending={pending ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-[26px] w-11 flex-none rounded-full border-0 transition-colors motion-reduce:transition-none',
        'disabled:cursor-not-allowed',
        checked ? 'bg-[var(--up)]' : 'bg-[var(--border)]',
        pending ? 'opacity-60' : disabled && 'opacity-45',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] size-5 rounded-full bg-white shadow-[0_1px_2px_oklch(0_0_0/.3)] transition-[left] motion-reduce:transition-none',
          checked ? 'left-[21px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}

/**
 * 시작/중지 확인 다이얼로그 (Phase 16 UI-SPEC §되돌릴 수 없는 액션 1·2).
 *
 * 두 다이얼로그를 한 컴포넌트에 둔 이유: **기본 포커스·`showCloseButton={false}`·중복 제출
 * 가드**가 셋 다 같아야 하기 때문이다. 옛 `/trading/vi` 카드도 이 조각을 가져다 쓴다.
 */
export function ViConfirmDialog({
  kind,
  exchange,
  accountNo,
  accountName,
  moveFrom,
  amountManwon,
  checkRate,
  todayOrderCount,
  unfilledCount,
  error,
  onOpenChange,
  onConfirm,
}: {
  kind: 'start' | 'stop' | null;
  /** 요약의 「주문가 · 상한가 · {거래소}」 — 이 확인이 어느 시장 전략인지 말한다. */
  exchange: RelayExchange;
  accountNo: string;
  accountName?: string;
  /**
   * 옮기기 시작(GC-WR-04)이면 옮겨 가기 **전** 계좌. 있으면 「계좌」 줄이 「{from} → {to}」 이고
   * `data-move="true"` 다. 제목·경고·버튼·기본 포커스는 일반 시작과 같다.
   */
  moveFrom?: { accountNo: string; name?: string };
  amountManwon: number | null;
  checkRate: number | null;
  todayOrderCount: number;
  unfilledCount: number;
  /** 보내지 못한 사유(GC-WR-06). 빈 문자열이면 아무것도 그리지 않는다. */
  error: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  /** 기본 포커스 대상(취소/닫기). 실행 버튼에 포커스가 가면 Enter 한 번에 주문이 시작된다. */
  const dismissRef = useRef<HTMLButtonElement>(null);
  const isStart = kind === 'start';

  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
        data-testid={isStart ? 'vi-start-dialog' : 'vi-stop-dialog'}
        data-move={moveFrom !== undefined ? 'true' : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dismissRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isStart ? 'VI 자동매수를 시작할까요?' : 'VI 자동매수를 중지할까요?'}
          </DialogTitle>
          <DialogDescription>
            {isStart
              ? '조건에 맞는 VI 발동 종목을 자동으로 매수해요.'
              : '새 VI 발동에 더 이상 주문하지 않아요.'}
          </DialogDescription>
        </DialogHeader>

        <dl
          data-slot="vi-confirm-summary"
          className="flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2.5 text-[length:var(--t-caption)]"
        >
          {/* 「계좌」 는 시작·중지 모두 맨 앞이다 — 어느 계좌의 전략을 켜고 끄는지 말한다(CR-02). */}
          <SummaryRow label="계좌">
            {moveFrom !== undefined ? (
              /* 옮기기 — 옛 계좌는 흐리게 취소선, 새 계좌는 굵게(목업 1-c `.mv`). */
              <span data-slot="vi-confirm-move" className="inline-flex flex-wrap justify-end gap-x-1.5 gap-y-0.5">
                <span data-slot="vi-confirm-move-from" className="font-normal text-[var(--muted-fg)] line-through decoration-1">
                  {accountLabel(moveFrom.accountNo, moveFrom.name)}
                </span>{' '}
                <span>→</span>{' '}
                <span data-slot="vi-confirm-move-to">{accountLabel(accountNo, accountName)}</span>
              </span>
            ) : (
              accountLabel(accountNo, accountName)
            )}
          </SummaryRow>
          {isStart ? (
            <>
              {/* ★ 금액·상승률이 요약에 **반드시** 있어야 한다(T-16-10). */}
              <SummaryRow label="1건당 금액">
                {amountManwon === null ? '—' : `${NUM.format(amountManwon)}만원`}
              </SummaryRow>
              <SummaryRow label="상승률 조건">
                {checkRate === null ? '—' : `${NUM.format(checkRate)}% 이상`}
              </SummaryRow>
              <SummaryRow label="주문가">상한가 · {exchange}</SummaryRow>
            </>
          ) : (
            <>
              <SummaryRow label="거래소">{exchange}</SummaryRow>
              <SummaryRow label="오늘 VI 주문">{NUM.format(todayOrderCount)}건</SummaryRow>
              <SummaryRow label="미체결">{NUM.format(unfilledCount)}건 (유지)</SummaryRow>
            </>
          )}
        </dl>

        <p
          data-slot="vi-confirm-warning"
          className="m-0 rounded-[var(--r-md)] border border-[var(--destructive)] px-2.5 py-2 text-[length:var(--t-caption)] text-[var(--destructive)]"
        >
          {isStart
            ? '시작하면 사람 확인 없이 주문이 나가요. 금액·상승률을 다시 확인해 주세요.'
            : '이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.'}
        </p>

        {error === '' ? null : (
          <p data-slot="vi-confirm-error" role="alert" className="m-0 text-[length:var(--t-caption)] text-[var(--destructive)]">
            {error}
          </p>
        )}

        <DialogFooter>
          {/* 기본 포커스 대상 — 실행 버튼보다 **앞**에 둔다(탭 순서·오클릭 방어). */}
          <Button type="button" variant="outline" autoFocus ref={dismissRef} onClick={() => onOpenChange(false)}>
            {isStart ? '취소' : '닫기'}
          </Button>
          {isStart ? (
            <Button
              type="button"
              variant="outline"
              onClick={onConfirm}
              className="border-transparent bg-[var(--up)] text-[var(--destructive-fg)] hover:bg-[color-mix(in_oklch,var(--up)_88%,black)]"
            >
              시작
            </Button>
          ) : (
            /* 채움 금지 — `--destructive` 는 `--up`(매수)과 같은 색이다(⑧). */
            <Button
              type="button"
              variant="outline"
              onClick={onConfirm}
              className="border-[var(--destructive)] bg-transparent text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]"
            >
              중지
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 「번호 · 이름」 — 이름이 없으면 번호만. */
function accountLabel(accountNo: string, name?: string): string {
  return name !== undefined && name !== '' ? `${accountNo} · ${name}` : accountNo;
}

/** 요약 한 줄. 라벨은 `--muted-fg`, 값은 mono `--fg`. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--muted-fg)]">{label}</dt>
      <dd className="mono min-w-0 text-right font-semibold break-all text-[var(--fg)]">{children}</dd>
    </div>
  );
}
