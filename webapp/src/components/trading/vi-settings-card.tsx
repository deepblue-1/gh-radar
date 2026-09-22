'use client';

/**
 * ViSettingsCard — VI 설정 카드 + 시작/중지 바 + 확인 다이얼로그 2종
 * (UI-SPEC B2~B4 · 확인 다이얼로그 1·2, TRADE-02 · D-07).
 *
 * ① 무엇을 담는가
 *   「라벨 72px | 입력」 4행 — `계좌`(네이티브 `<select>`) · `금액`(만원) · `상승률`(%) ·
 *   `마감알림`(스위치). 그 아래 시작/중지 바. 정본은 채택 목업 `16-vi-trigger-mockup.html` 이다.
 *   ★ **종목 축이 없다.** VI 설정은 **거래소별 1건**이고 주문가는 상한가 고정이라 종목
 *     선택·주문유형 UI 를 만들지 않는다. 계좌 비밀번호 입력도 없다(relay 자격증명).
 *   ★ 편집하는 거래소는 **`exchange` prop** 이다 (Phase 18 · TRADE-08). 고정 거래소 상수를
 *     없앴다 — 상수가 한 곳이라도 남으면 NXT 편집이 KRX 전략을 덮는다(Pitfall 8). 이 카드는
 *     옛 `/trading/vi` 화면 전용이고(18-13 에서 제거), 작업대는 `workbench/vi-settings-rows.tsx`
 *     의 거래소별 2줄을 쓴다. 승계 상수·확인 다이얼로그는 그 파일이 정본이고 여기서는 가져다 쓴다.
 *
 * ② ★ 값은 자동 반영되지 않는다 (D-07)
 *   계좌·금액·상승률을 바꾸면 더티가 되고 하단 `DirtyActionBar` 의 「수정」을 눌러야
 *   `SetVITriggerReq(11)` 이 나간다. **`run` 은 그때 현재값 그대로** 실린다 — 값 수정이
 *   가동 상태를 건드리면 사용자가 「금액만 고쳤는데 자동매수가 켜졌다」를 겪는다.
 *   초안의 「0.3초 자동 반영」은 폐기됐다. 이 파일에 디바운스도 지연 전송도 없다.
 *
 * ③ ★ 시작/중지만 확인 다이얼로그 (D-07 · T-16-10)
 *   이 화면은 **사람 확인 없이 주문이 나가기 시작하는 유일한 기능**이다. 그래서
 *   `order-confirm-dialog.tsx` 의 규율을 그대로 복제한다:
 *     - `showCloseButton={false}` — 실행 버튼 옆에 다른 클릭 타깃을 두지 않는다
 *     - **기본 포커스 = 취소/닫기**(`onOpenAutoFocus` 가로채기 + `autoFocus` 이중화).
 *       Radix 기본값(첫 tabbable)에 맡기면 **Enter 연타 한 번에 자동매수가 시작된다**(S-7).
 *     - 시작 요약에 **계좌 · 1건당 금액 · 상승률 조건 · 주문가**를 전부 싣는다. 무엇이
 *       얼마로 나가는지 모르는 채 시작 버튼을 누르게 두지 않는다.
 *
 * ④ ★ 제출 후 즉시 재활성하지 않는다
 *   전송하면 에코(61) 또는 타임아웃 전까지 버튼이 잠기고 `반영 중…` 을 보여 준다.
 *   곧바로 열어 두면 응답이 늦을 때 사용자가 한 번 더 눌러 **두 번째 등록**을 만든다.
 *   ★ 타임아웃은 **표시를 되돌리는 용도**일 뿐 재전송 경로가 아니다(T-16-10).
 *   ★ 단, `send` 가 `false` 를 돌려준 **보내지 못한** 경우에는 잠그지도 않는다 (GC-WR-06).
 *     기다릴 에코가 없는데 잠그면 「반영 중…」이 3초 뜨고 사용자는 등록됐다고 믿는다.
 *     확인 다이얼로그도 그 경우에만 **열린 채로** 남아 사유를 보여 준다.
 *
 * ⑤ ★ 빈 61(미등록)은 입력값을 지우지 않는다 (WinForms CR-01)
 *   서버는 전략이 없어도 61 을 **빈 슬롯**으로 돌려준다. 그것을 「값 0」으로 읽으면
 *   사용자가 방금 입력한 금액이 화면에서 사라진다. `server === null` 이면 폼은 그대로
 *   두고 가동만 내린다.
 *
 * ⑥ ★ 마감알림은 이 기기 전용이고 실패를 숨기지 않는다 (T-16-09)
 *   설정은 `localStorage`, 권한 요청은 **스위치를 켜는 순간**에만. 거부되면 스위치를
 *   되돌리고 사유를 카드 안에 남긴다 — 켜진 척 두면 안 울리는 이유를 알 수 없다.
 *
 * ⑦ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보 · C5)
 *   `--destructive` 와 `--up`(매수)은 값이 완전히 같다. 그래서 「중지」는 **테두리형**이고
 *   「시작」만 `--up` 채움이다. 채움 버튼의 글자색은 `--primary-fg` 대신 값이 동일한
 *   `--destructive-fg` 를 쓴다(`dirty-action-bar.tsx` ③ 과 같은 규율).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  RelayAccount,
  RelayExchange,
  RelayViSetMsg,
  RelayViTrigger,
} from '@gh-radar/shared';

import { DirtyActionBar } from '@/components/trading/dirty-action-bar';
import {
  VI_ACK_TIMEOUT_MS,
  VI_AMOUNT_LIMIT_MESSAGE,
  VI_DEFAULT_AMOUNT_MANWON,
  VI_DEFAULT_CHECK_RATE,
  VI_DIRTY_HINT,
  VI_SET_SEND_FAILED_TEXT,
  ViConfirmDialog,
} from '@/components/trading/workbench/vi-settings-rows';
import {
  MAX_VI_ORDER_AMOUNT_MANWON,
  krwToManwon,
  manwonToKrw,
  readViAlertEnabled,
  requestViAlertPermission,
  writeViAlertEnabled,
} from '@/lib/vi-alert';
import { useRelayContext } from '@/lib/relay-provider';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

// 승계 상수의 정본은 `workbench/vi-settings-rows.tsx` 다 — 옛 테스트·화면의 import 경로를 지킨다.
export {
  VI_ACK_TIMEOUT_MS,
  VI_AMOUNT_LIMIT_MESSAGE,
  VI_DEFAULT_AMOUNT_MANWON,
  VI_DEFAULT_CHECK_RATE,
  VI_SET_SEND_FAILED_TEXT,
};

/**
 * `submit` 한 번의 결과. **세 갈래를 구분하는 이유는 다이얼로그의 거취가 다르기 때문**이다.
 *
 * - `sent` — 나갔다. 다이얼로그를 닫고 에코를 기다린다.
 * - `blocked` — 애초에 보내지 않기로 했다(세션 잠금·연타·금액 상한). 사유는 **카드 안에**
 *   이미 떠 있으므로 다이얼로그를 닫아 그 사유가 보이게 한다.
 * - `failed` — 보내려 했으나 소켓이 받지 않았다. **다이얼로그를 성공처럼 닫지 않는다** —
 *   닫으면 「눌렀고 창이 닫혔다」가 곧 성공 신호로 읽힌다. 열어 둔 채 사유를 그 안에 띄운다.
 */
type ViSubmitResult = 'sent' | 'blocked' | 'failed';

/** 폼이 다루는 값 3개. `run` 은 여기 없다 — 「수정」의 대상이 아니기 때문이다(②). */
interface ViFormValues {
  accountNo: string;
  /** **만원 단위**. 와이어(원)로는 `manwonToKrw` 를 통해서만 나간다. */
  amountManwon: number;
  /** **정수 %**. 상따 `sweepMinRate`(BasisPoints)와 단위가 다르다. */
  checkRate: number;
}

type ViDirtyField = keyof ViFormValues;

export interface ViSettingsCardProps {
  /** ★ 편집 대상 거래소 — `vi.set` 의 `exchange` 로 **그대로** 나간다(Pitfall 8). */
  exchange: RelayExchange;
  /** 허용 계좌 목록. 비면 셀렉터가 「계좌 확인 중…」으로 잠긴다. */
  accounts: readonly RelayAccount[];
  /**
   * 서버 에코. **3상태를 뭉개지 않는다** —
   * `undefined` 미조회 / `null` 미등록(빈 61) / 객체 등록됨.
   */
  server: RelayViTrigger | null | undefined;
  /** 세션이 준비되지 않았거나 상위가 잠갔다. */
  disabled?: boolean;
  /** 중지 확인 요약 — 오늘 VI 주문 건수. */
  todayOrderCount: number;
  /** 중지 확인 요약 — 미체결 건수(중지해도 **유지**된다). */
  unfilledCount: number;
  /** 가동 상태 문장의 `서버 반영 {HH:MM:SS}`. 모르면 null. */
  appliedAt?: string | null;
  /** 전송한 프레임을 상위에 알린다 — 「내 에코」와 「다른 단말」을 가르는 신호다. */
  onSent?: (msg: RelayViSetMsg) => void;
  /** 에코가 더티를 덮었을 때 그 개수를 알린다(배너 문구의 유일한 근거). */
  onServerEcho?: (info: { overwrittenDirty: number }) => void;
  /** 더티 개수 변화 — 상위의 이탈 경고 게이트다. */
  onDirtyCountChange?: (count: number) => void;
  /** 마감알림 on/off 가 바뀌었을 때(로그 1줄용). */
  onAlertToggle?: (enabled: boolean, reason?: string) => void;
  className?: string;
}

/** 서버 에코 → 폼 값. `null`/`undefined` 는 **폼을 만들지 않는다**(⑤ — 호출부가 거른다). */
function formFromServer(server: RelayViTrigger): ViFormValues {
  return {
    accountNo: server.accountNo,
    amountManwon: krwToManwon(server.orderAmountKrw),
    checkRate: server.checkRate,
  };
}

/** 두 값의 차이 필드 집합. 표시(라벨 접두)와 액션 바 개수가 **같은 계산**을 쓴다. */
function dirtyFieldsOf(form: ViFormValues, base: ViFormValues): ReadonlySet<ViDirtyField> {
  const out = new Set<ViDirtyField>();
  if (form.accountNo !== base.accountNo) out.add('accountNo');
  if (form.amountManwon !== base.amountManwon) out.add('amountManwon');
  if (form.checkRate !== base.checkRate) out.add('checkRate');
  return out;
}

export function ViSettingsCard({
  exchange,
  accounts,
  server,
  disabled = false,
  todayOrderCount,
  unfilledCount,
  appliedAt = null,
  onSent,
  onServerEcho,
  onDirtyCountChange,
  onAlertToggle,
  className,
}: ViSettingsCardProps) {
  const { send } = useRelayContext();

  const [form, setForm] = useState<ViFormValues>(() => ({
    accountNo: '',
    amountManwon: VI_DEFAULT_AMOUNT_MANWON,
    checkRate: VI_DEFAULT_CHECK_RATE,
  }));
  /**
   * 더티 기준선. 서버 값이 있으면 그것이고, 없으면 **마지막으로 확정된 표시값**이다.
   * 미등록 상태에서 기준선을 비워 두면 첫 렌더부터 3필드가 전부 더티로 뜬다.
   */
  const [baseline, setBaseline] = useState<ViFormValues>(() => ({
    accountNo: '',
    amountManwon: VI_DEFAULT_AMOUNT_MANWON,
    checkRate: VI_DEFAULT_CHECK_RATE,
  }));

  const run = server?.run === true;

  /* ── 계좌 초기 선택 ────────────────────────────────────────────────── */
  // 계좌가 도착하면 **미선택일 때만** 첫 계좌를 고른다. 사용자가 고른 계좌를 덮지 않는다.
  useEffect(() => {
    if (accounts.length === 0) return;
    setForm((prev) => (prev.accountNo === '' ? { ...prev, accountNo: accounts[0].accountNo } : prev));
    setBaseline((prev) =>
      prev.accountNo === '' ? { ...prev, accountNo: accounts[0].accountNo } : prev,
    );
  }, [accounts]);

  /* ── 서버 에코 (D-11 · ⑤) ─────────────────────────────────────────── */

  const prevServerRef = useRef<RelayViTrigger | null | undefined>(undefined);
  const formRef = useRef(form);
  formRef.current = form;
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;

  useEffect(() => {
    if (server === prevServerRef.current) return;
    prevServerRef.current = server;

    // 미조회는 아무 일도 하지 않는다. 미등록(빈 61)은 **입력값을 그대로 둔다**(⑤).
    if (server === undefined || server === null) return;

    const next = formFromServer(server);
    // 덮인 더티 수는 **덮이기 직전 기준선** 대비다(16-13 과 같은 규약).
    const overwritten = dirtyFieldsOf(formRef.current, baselineRef.current).size;
    setForm(next);
    setBaseline(next);
    onServerEcho?.({ overwrittenDirty: overwritten });
  }, [server, onServerEcho]);

  const dirty = useMemo(() => dirtyFieldsOf(form, baseline), [form, baseline]);
  const dirtyCount = dirty.size;

  useEffect(() => {
    onDirtyCountChange?.(dirtyCount);
  }, [dirtyCount, onDirtyCountChange]);

  /* ── 금액 상한 (WR-07) ────────────────────────────────────────────── */

  /**
   * 「상한에 걸렸다」는 사실. 사용자가 상한을 넘겨 입력해 **잘렸을 때** 켜진다.
   * 폼 값 자체가 상한 밖인 경우(서버 에코가 상한 넘는 금액을 돌려준 경우)는 아래
   * `amountOverLimit` 가 따로 잡는다 — 사용자가 아무것도 안 했어도 이유는 말해야 한다.
   */
  const [amountClamped, setAmountClamped] = useState(false);
  const amountOverLimit = form.amountManwon > MAX_VI_ORDER_AMOUNT_MANWON;
  const showAmountLimit = amountClamped || amountOverLimit;

  /** 보내지 **못한** `vi.set` 의 사유. 다음 성공 전송에서 지워진다(영구 경고가 아니다). */
  const [sendError, setSendError] = useState('');

  /**
   * 금액 입력 — 상한을 넘으면 **상한으로 고정**한다.
   *
   * 입력 자체를 삼키면 사용자는 왜 안 써지는지 모른다. 상한으로 잘리고 아래 문구가 이유를
   * 대는 편이 낫다. 자른 결과가 곧 폼 값이므로 **확인 다이얼로그 표시값 = 전송값**이다.
   */
  const handleAmountChange = useCallback((next: number) => {
    const clamped = next > MAX_VI_ORDER_AMOUNT_MANWON;
    setAmountClamped(clamped);
    setForm((prev) => ({
      ...prev,
      amountManwon: clamped ? MAX_VI_ORDER_AMOUNT_MANWON : next,
    }));
  }, []);

  /* ── 전송 (④) ─────────────────────────────────────────────────────── */

  const [submitting, setSubmitting] = useState(false);
  /**
   * ★ 잠금은 **ref 로도** 든다. `submitting` state 는 다음 렌더에서야 보이므로, 같은 tick 에
   *   두 번 들어온 확정(다이얼로그 실행 버튼 더블클릭)을 state 가드로는 못 막는다 —
   *   그 두 번째가 곧 두 번째 무인 발주 등록이다.
   */
  const submittingRef = useRef(false);
  const ackTimer = useRef<number | null>(null);

  const unlock = useCallback(() => {
    submittingRef.current = false;
    setSubmitting(false);
    if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
  }, []);

  // 에코가 도착하면 잠금을 푼다. 타이머보다 이쪽이 정상 경로다.
  useEffect(() => {
    if (server === undefined) return;
    unlock();
  }, [server, unlock]);

  useEffect(
    () => () => {
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
    },
    [],
  );

  /**
   * 잠금 판정의 **유일 지점**. 필드·「시작/중지」·`submit` 이 같은 값을 본다.
   *
   * 미조회(`server === undefined`) 중에는 서버 상태를 모르는 채로 「시작」을 누르게 두지
   * 않는다. `disabled` 는 `vi-client.tsx` 의 `ViSurface` 가 `<ViSettingsCard
   * disabled={!sessionReady}>` 로 내려보내는 세션 판정이다(`sessionReady = status === 'ready'`).
   */
  const locked = disabled || server === undefined;

  const submit = useCallback(
    (nextRun: boolean): ViSubmitResult => {
      /*
        ★ 세션 가드가 **여기** 있어야 한다 (16-19 감사에서 뚫려 있던 자리).
          「시작/중지」 버튼은 `disabled={locked || submitting}` 이지만 `DirtyActionBar` 의
          「수정」은 `submitting` 으로만 잠긴다 — `ready` 일 때 값을 고쳐 더티를 만든 뒤
          세션이 끊기면 그 버튼은 그대로 눌렸고 `vi.set` 이 0바이트로 사라졌다.
          확인 다이얼로그가 열린 채 세션이 끊기는 경로도 같은 한 줄이 막는다.
      */
      if (locked) return 'blocked';
      if (submittingRef.current) return 'blocked'; // 연타 가드 — 두 번째 등록을 만들지 않는다.
      /*
        ★ 금액 상한 가드 (WR-07 / T-16-41). 입력은 이미 상한으로 자르지만 **서버 에코**가
          상한 밖 금액을 돌려주면 폼 값이 그대로 상한을 넘는다. 그 값을 그냥 보내면
          zod 가 프레임을 통째로 버리고(사용자는 이유를 모른다) 확인 다이얼로그가 보여 준
          금액과 실제로 나가는 금액이 어긋난다. 보내지 않고 사유를 남긴다.
      */
      if (form.amountManwon > MAX_VI_ORDER_AMOUNT_MANWON) {
        setAmountClamped(true);
        return 'blocked';
      }
      const msg: RelayViSetMsg = {
        t: 'vi.set',
        accountNo: form.accountNo,
        /*
          ★ 거래소를 **명시**한다 (17-06 / D-18). 생략하면 relay 가 KRX 로 접어 주지만,
            그 기본값은 서버 구현의 부산물이지 이 화면이 한 약속이 아니다 — 서버가 기본값을
            바꾸는 날 이 카드는 조용히 다른 시장에 무인 매수를 등록한다.
        */
        exchange,
        // ★ 만원 → 원 변환은 `manwonToKrw` 한 곳뿐이다(단위가 갈리면 1만 배 주문이 나간다).
        orderAmountKrw: manwonToKrw(form.amountManwon),
        checkRate: form.checkRate,
        run: nextRun,
      };
      /*
        ★ 반환값을 **반드시** 읽는다 — 16-19 가 `send` 를 `boolean` 으로 바꾼 이유가 이 분기다
          (`use-relay-socket.ts:863`, `false` = 보내지 **않았음**이 확실하다, GC-WR-06).
          실패 경로에서 `submitting` 잠금·`ackTimer`·`onSent` 어느 것도 걸지 않는다:
          ④ 의 잠금은 「보냈으니 에코를 기다린다」는 뜻인데, 보내지 않았으면 기다릴 에코가
          없다 — 잠그면 `VI_ACK_TIMEOUT_MS` 동안 「반영 중…」이 뜨고 사용자는 등록됐다고 믿는다.
      */
      if (!send(msg)) {
        setSendError(VI_SET_SEND_FAILED_TEXT);
        return 'failed';
      }
      setSendError('');
      submittingRef.current = true;
      onSent?.(msg);
      setSubmitting(true);
      if (ackTimer.current !== null) window.clearTimeout(ackTimer.current);
      // 표시 잠금을 푸는 것뿐이다 — 재전송 경로는 이 파일에 없다.
      ackTimer.current = window.setTimeout(unlock, VI_ACK_TIMEOUT_MS);
      return 'sent';
    },
    [exchange, form, locked, onSent, send, unlock],
  );

  /** 「수정」 — `run` 은 **현재값 그대로**다(②). */
  const handleModify = useCallback(() => {
    submit(run);
  }, [submit, run]);
  const handleRevert = useCallback(() => setForm(baseline), [baseline]);

  /* ── 마감알림 (⑥) ─────────────────────────────────────────────────── */

  const [alertOn, setAlertOn] = useState(false);
  const [alertReason, setAlertReason] = useState<string | null>(null);
  // 저장값은 마운트 후에 읽는다 — SSR HTML 과 첫 클라 렌더가 갈리면 하이드레이션이 깨진다.
  useEffect(() => setAlertOn(readViAlertEnabled()), []);

  const handleAlertToggle = useCallback(
    async (next: boolean) => {
      if (!next) {
        setAlertOn(false);
        setAlertReason(null);
        writeViAlertEnabled(false);
        onAlertToggle?.(false);
        return;
      }
      // 권한 요청은 **사용자가 켤 때만**. 거부되면 되돌리고 사유를 남긴다(조용한 실패 금지).
      const result = await requestViAlertPermission();
      if (!result.ok) {
        setAlertOn(false);
        setAlertReason(result.reason);
        writeViAlertEnabled(false);
        onAlertToggle?.(false, result.reason);
        return;
      }
      setAlertOn(true);
      setAlertReason(null);
      writeViAlertEnabled(true);
      onAlertToggle?.(true);
    },
    [onAlertToggle],
  );

  /* ── 확인 다이얼로그 (③) ──────────────────────────────────────────── */

  const [confirmKind, setConfirmKind] = useState<'start' | 'stop' | null>(null);

  const accountName = accounts.find((a) => a.accountNo === form.accountNo)?.name;

  return (
    <>
      <section
        data-slot="vi-settings-card"
        className={cn(
          'flex min-w-0 flex-col rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--s-3)]',
          className,
        )}
      >
        <h3 className="m-0 mb-[var(--s-2)] flex flex-wrap items-center gap-[var(--s-2)] text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          설정 · {exchange}
        </h3>

        {/* 계좌 — 네이티브 `<select>`. 계좌번호는 **전체 표시**한다(D2 · S-5). */}
        <FieldRow label="계좌" htmlFor="vi-account" dirty={dirty.has('accountNo')}>
          <select
            id="vi-account"
            value={form.accountNo}
            disabled={locked || accounts.length === 0}
            onChange={(e) => setForm((prev) => ({ ...prev, accountNo: e.target.value }))}
            className={cn(
              'mono h-10 min-w-0 flex-1 rounded-[var(--r-md)] border bg-[var(--bg)] px-2.5 text-[length:var(--t-sm)] text-[var(--fg)] disabled:opacity-50',
              dirty.has('accountNo')
                ? 'border-[var(--primary)] shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary)_18%,transparent)]'
                : 'border-[var(--input)]',
            )}
          >
            {accounts.length === 0 ? (
              <option value="">계좌 확인 중…</option>
            ) : (
              accounts.map((a) => (
                <option key={a.accountNo} value={a.accountNo}>
                  {a.accountNo} · {a.name}
                </option>
              ))
            )}
          </select>
        </FieldRow>

        {/* 금액 — 화면은 만원, 와이어는 원. 파생 설명을 오른쪽 보조문에 둔다. */}
        <FieldRow label="금액" htmlFor="vi-amount" dirty={dirty.has('amountManwon')}>
          <div className="flex min-w-0 items-center gap-[var(--s-2)]">
            <NumInput
              id="vi-amount"
              unit="만원"
              value={form.amountManwon}
              disabled={locked}
              dirty={dirty.has('amountManwon')}
              onValueChange={handleAmountChange}
            />
            <span className="min-w-0 text-[11px] text-[var(--muted-fg)]">
              주문수량 = 금액 ÷ 상한가
            </span>
          </div>
        </FieldRow>

        {/* 상한 안내 — 잘린 이유를 말한다. 조용히 삼키지 않는다(WR-07). */}
        {showAmountLimit && (
          <p
            role="status"
            data-slot="vi-amount-limit"
            className="mt-[var(--s-1)] m-0 pl-[calc(72px+var(--s-2))] text-[11px] text-[var(--destructive)]"
          >
            {VI_AMOUNT_LIMIT_MESSAGE}
          </p>
        )}

        {/*
          상승률 — **정수 %** 다(와이어 계약). 소수 입력을 열면 서버가 잘라 버려
          「25.5 로 등록했는데 25 로 도는」 상태가 되므로 소수점을 만들지 않는다.
        */}
        <FieldRow label="상승률" htmlFor="vi-check-rate" dirty={dirty.has('checkRate')}>
          <div className="flex min-w-0 items-center gap-[var(--s-2)]">
            <NumInput
              id="vi-check-rate"
              unit="%"
              value={form.checkRate}
              disabled={locked}
              dirty={dirty.has('checkRate')}
              onValueChange={(v) => setForm((prev) => ({ ...prev, checkRate: v }))}
            />
            <span className="min-w-0 text-[11px] text-[var(--muted-fg)]">
              이상 VI 발동 시 자동 매수
            </span>
          </div>
        </FieldRow>

        {/* 마감알림 — 서버와 무관한 **이 기기** 설정이다(⑥). 더티 대상이 아니다. */}
        <FieldRow label="마감알림">
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--s-2)]">
            <AlertSwitch checked={alertOn} onChange={handleAlertToggle} />
            <span className="min-w-0 text-[length:var(--t-caption)] text-[var(--fg)]">
              VI 마감 시 브라우저 알림 (이 기기만)
            </span>
          </div>
        </FieldRow>

        {alertReason !== null && (
          <p
            role="status"
            data-slot="vi-alert-reason"
            className="mt-[var(--s-1)] m-0 text-[11px] text-[var(--destructive)]"
          >
            {alertReason}
          </p>
        )}

        {/* ── B3 시작/중지 바 ── */}
        <div
          data-slot="vi-run-bar"
          data-run={run ? 'true' : 'false'}
          className={cn(
            'mt-[var(--s-3)] flex min-w-0 items-center gap-[var(--s-3)] rounded-[var(--r-md)] border-[1.5px] p-[var(--s-3)]',
            run ? 'border-[var(--up)] bg-[var(--up-bg)]' : 'border-[var(--border)] bg-[var(--bg)]',
          )}
        >
          {/* 램프 — 형태(채움/속빔)가 색과 함께 상태를 말한다(WCAG 1.4.1). */}
          <span
            aria-hidden="true"
            data-slot="vi-run-lamp"
            className={cn(
              'block size-3 flex-none rounded-full',
              run
                ? 'bg-[var(--up)] shadow-[0_0_0_4px_color-mix(in_oklch,var(--up)_22%,transparent)]'
                : 'border-[1.5px] border-[var(--muted-fg)] bg-transparent',
            )}
          />
          <div className="min-w-0 flex-1">
            <b className="block text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              {run ? '자동매매 가동 중' : '중지됨'}
            </b>
            <small className="block text-[11px] text-[var(--muted-fg)]">
              {run
                ? appliedAt === null
                  ? '다른 단말에서도 같은 상태예요'
                  : `서버 반영 ${appliedAt} · 다른 단말에서도 같은 상태예요`
                : '「시작」을 누르면 확인 후 서버에 등록돼요'}
            </small>
          </div>
          {/* ⑦ 「중지」는 테두리형이다 — 채우면 매수(`--up`)와 구분되지 않는다. */}
          <button
            type="button"
            data-slot="vi-run-button"
            disabled={locked || submitting}
            onClick={() => setConfirmKind(run ? 'stop' : 'start')}
            className={cn(
              'h-10 flex-none rounded-[var(--r-md)] border px-[var(--s-4)] text-[length:var(--t-sm)] font-semibold',
              'disabled:cursor-not-allowed disabled:opacity-50',
              run
                ? 'border-[var(--destructive)] bg-transparent text-[var(--destructive)]'
                : 'border-[var(--up)] bg-[var(--up)] text-[var(--destructive-fg)]',
            )}
          >
            {submitting ? '반영 중…' : run ? '중지' : '시작'}
          </button>
        </div>

        {sendError === '' ? null : (
          /*
            눌렀는데 못 나갔다 — 「반영 중…」도 뜨지 않고 램프도 그대로인 이유를 말한다.
            자리가 **카드 안**인 이유: `DirtyActionBar` 는 더티 0 이면 렌더되지 않는데
            「시작/중지」 실패가 정확히 그 경우다(16-31 에서 상따 폼이 겪은 것과 같은 함정).
          */
          <p
            data-slot="vi-send-error"
            role="alert"
            className="mt-[var(--s-2)] m-0 text-[11px] text-[var(--destructive)]"
          >
            {sendError}
          </p>
        )}
      </section>

      {/* ── B4 하단 액션 바 (더티 0 이면 렌더 자체가 없다) ── */}
      <DirtyActionBar
        dirtyCount={dirtyCount}
        submitting={submitting}
        onSubmit={handleModify}
        onRevert={handleRevert}
        hint={VI_DIRTY_HINT}
      />

      {/*
        ★ 요약 금액은 `form.amountManwon` 에서 온다 — 입력이 상한으로 **잘린 뒤의 값**이고
          `submit` 도 같은 값을 보낸다. 그래서 **다이얼로그 표시값 = 실제 전송값**이 구조적으로
          성립한다(조립 단계가 조용히 다른 값으로 바꾸는 경로가 없다, T-16-41).
      */}
      <ViConfirmDialog
        kind={confirmKind}
        exchange={exchange}
        accountNo={form.accountNo}
        accountName={accountName}
        amountManwon={form.amountManwon}
        checkRate={form.checkRate}
        todayOrderCount={todayOrderCount}
        unfilledCount={unfilledCount}
        error={sendError}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmKind(null);
            setSendError(''); // 닫으면 사유도 접는다 — 다음에 열 때 남은 문구가 붙어 있지 않다.
          }
        }}
        onConfirm={() => {
          if (confirmKind === null) return;
          // ★ 중지 상태에서 「시작」은 **현재 폼 값**으로 나간다(더티 값 포함, D-07).
          const result = submit(confirmKind === 'start');
          /*
            ★ `failed` 면 **닫지 않는다** (GC-WR-06). 닫으면 「눌렀고 창이 닫혔다」가 곧
              성공 신호로 읽히는데, 이 화면에서 그 오독의 대가는 「자동매수를 켰다고 믿는
              사용자」다. 사유는 다이얼로그 안에 뜨고, 연결이 돌아오면 그 자리에서 다시 누르면 된다.
              `blocked`(세션 잠금·연타·금액 상한)는 사유가 **카드 안**에 이미 떠 있으므로 닫는다.
          */
          if (result === 'failed') return;
          setConfirmKind(null);
        }}
      />
    </>
  );
}

/* ───────────────────────────── 조각 ───────────────────────────── */

/** 「라벨 72px | 입력」 한 줄. 라벨 폭이 공유돼야 4행의 입력 좌변이 맞는다. */
function FieldRow({
  label,
  htmlFor,
  dirty = false,
  children,
}: {
  label: string;
  htmlFor?: string;
  dirty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-[var(--s-2)] grid min-h-10 min-w-0 grid-cols-[72px_minmax(0,1fr)] items-center gap-[var(--s-2)]">
      <label
        htmlFor={htmlFor}
        className={cn(
          'truncate text-[length:var(--t-caption)]',
          dirty ? 'font-semibold text-[var(--primary)]' : 'text-[var(--muted-fg)]',
        )}
      >
        {/* 더티는 색만이 아니라 **문자**로도 남긴다(WCAG 1.4.1). */}
        {dirty ? '● ' : ''}
        {label}
      </label>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}

/** 숫자 입력 140px — 천단위 구분자 표시, 입력은 숫자만 남긴다(목업 `.inp.num`). */
function NumInput({
  id,
  unit,
  value,
  onValueChange,
  disabled,
  dirty,
}: {
  id: string;
  unit: string;
  value: number;
  onValueChange: (next: number) => void;
  disabled: boolean;
  dirty: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-10 w-[140px] flex-none items-center gap-1 rounded-[var(--r-md)] border bg-[var(--bg)] px-2.5',
        // quick-260912-mvo Q-02 — 포커스는 **테두리색 한 겹**. 안쪽 input 의
        // `data-focus-ring="seamless"` 가 전역 Double-Ring 을 걷고 이 래퍼가 그 자리를 대신한다.
        // 의사클래스라 특이도가 아래 더티/기본 테두리보다 높아, 더티 상태에서도 포커스색이 이긴다.
        // ⚠️ 이 유틸리티를 지우면 포커스가 아무 표시 없이 사라진다(WCAG 2.4.7).
        'focus-within:border-[var(--ring)]',
        dirty
          ? 'border-[var(--primary)] shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary)_18%,transparent)]'
          : 'border-[var(--input)]',
        disabled && 'opacity-45',
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        data-focus-ring="seamless"
        disabled={disabled}
        value={NUM.format(value)}
        onChange={(e) => onValueChange(parseDigits(e.target.value))}
        className="mono min-w-0 flex-1 bg-transparent text-right text-[length:var(--t-sm)] text-[var(--fg)] outline-none disabled:cursor-not-allowed"
      />
      <span className="flex-none text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        {unit}
      </span>
    </div>
  );
}

/**
 * 마감알림 스위치 44×26 (목업 `.sw`).
 *
 * 공용 `ui/switch.tsx` 를 쓰지 않는 이유는 `limit-chaser-form.tsx` ⑧ 과 같다 — thumb 기하가
 * 컴포넌트 안에 하드코딩(16px · `translate-x-4`)돼 호출부에서 못 바꾸고, 그 크기(36×20)는
 * 모바일 터치 타깃으로 작다. 한 화면 때문에 공용 primitive 를 고치는 대신 순수 버튼으로 그린다.
 */
function AlertSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="VI 마감 알림"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[26px] w-11 flex-none rounded-full border-0 transition-colors',
        checked ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
      )}
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

/** 입력 문자열에서 숫자만 남겨 정수로. 빈 값은 0 이다(「모름」이 아니라 0 이다). */
function parseDigits(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length === 0 ? 0 : Number(digits);
}
