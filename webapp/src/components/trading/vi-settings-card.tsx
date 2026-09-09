'use client';

/**
 * ViSettingsCard — VI 설정 카드 + 시작/중지 바 + 확인 다이얼로그 2종
 * (UI-SPEC B2~B4 · 확인 다이얼로그 1·2, TRADE-02 · D-07).
 *
 * ① 무엇을 담는가
 *   「라벨 72px | 입력」 4행 — `계좌`(네이티브 `<select>`) · `금액`(만원) · `상승률`(%) ·
 *   `마감알림`(스위치). 그 아래 시작/중지 바. 정본은 채택 목업 `16-vi-trigger-mockup.html` 이다.
 *   ★ **종목 축이 없다.** VI 설정은 세션당 1건이고 주문가는 상한가 고정·KRX 전용이라
 *     종목 선택·주문유형 UI 를 만들지 않는다. 계좌 비밀번호 입력도 없다(relay 자격증명).
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
import type { RelayAccount, RelayViSetMsg, RelayViTrigger } from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DirtyActionBar } from '@/components/trading/dirty-action-bar';
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

/** 액션 바 보조문 — VI 정본(UI-SPEC §CTA). 「수정」이 `run` 을 건드리지 않는다는 상시 고지. */
const DIRTY_HINT = '「수정」을 눌러야 반영돼요 · 가동 상태(run)는 그대로 유지돼요';

/** 카드 헤더 우측 고정 캡션 — 이 화면의 범위를 문장 하나로 못박는다(UI-SPEC §VI 라벨). */
export const VI_SETTINGS_CAPTION = '세션당 1건 · KRX · 주문가 = 상한가';

/**
 * 전송 후 잠금을 푸는 상한(ms). WinForms `RespTimeoutMs` 와 **같은 값**이다 —
 * 두 클라이언트가 다른 시각에 다른 말을 하면 사용자가 어느 쪽을 믿을지 알 수 없다.
 * ★ 이 타이머는 잠금을 풀 뿐 **아무것도 다시 보내지 않는다**(④).
 */
export const VI_ACK_TIMEOUT_MS = 3_000;

/** WinForms `VITrigger` 초기 상태값 이식 — 금액 1,000만원 · 상승률 22%. */
export const VI_DEFAULT_AMOUNT_MANWON = 1_000;
export const VI_DEFAULT_CHECK_RATE = 22;

/**
 * 금액 상한 안내 문구 — **잘린 이유**를 말한다 (WR-07).
 *
 * 입력을 조용히 삼키면 사용자는 왜 안 써지는지 알 수 없다. 상한으로 자르고 이 한 줄이
 * 이유를 대는 편이 낫다(PC-7 무로그 fail-safe 금지의 UI 판).
 *
 * ★ 상한값은 이 파일에 없다. `@gh-radar/shared` 의 `MAX_VI_ORDER_AMOUNT_KRW`(**원 단위**
 *   정본, relay 의 zod 스키마·envelope 조립기가 같은 값을 본다)를 `vi-alert.ts` 가
 *   `krwToManwon` 으로 만원 단위로 유도한 것이 `MAX_VI_ORDER_AMOUNT_MANWON` 이다.
 *   여기에 숫자를 다시 적으면 세 층의 상한이 갈린다 (WR-07).
 */
export const VI_AMOUNT_LIMIT_MESSAGE = `주문금액은 최대 ${NUM.format(MAX_VI_ORDER_AMOUNT_MANWON)}만원까지 넣을 수 있어요`;

/**
 * ★ `vi.set` 이 **나가지 못했을 때**의 문구 (GC-WR-06).
 *
 * 어조는 `strategy-status-card.tsx` 의 전송 실패 문구를 그대로 승계한다 — 같은 사실
 * (「연결이 끊겨 보내지 못했다」)을 화면마다 다른 말로 하면 같은 상태가 두 이름을 갖는다.
 */
export const VI_SET_SEND_FAILED_TEXT =
  '연결이 끊겨 설정을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.';

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
    [form, locked, onSent, send, unlock],
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
          설정
          <span
            data-slot="vi-settings-caption"
            className="ml-auto text-[length:var(--t-caption)] font-normal text-[var(--muted-fg)]"
          >
            {VI_SETTINGS_CAPTION}
          </span>
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
        hint={DIRTY_HINT}
      />

      {/*
        ★ 요약 금액은 `form.amountManwon` 에서 온다 — 입력이 상한으로 **잘린 뒤의 값**이고
          `submit` 도 같은 값을 보낸다. 그래서 **다이얼로그 표시값 = 실제 전송값**이 구조적으로
          성립한다(조립 단계가 조용히 다른 값으로 바꾸는 경로가 없다, T-16-41).
      */}
      <ViConfirmDialog
        kind={confirmKind}
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

/**
 * 시작/중지 확인 다이얼로그 (UI-SPEC §되돌릴 수 없는 액션 1·2).
 *
 * 두 다이얼로그를 한 컴포넌트에 둔 이유: **기본 포커스·`showCloseButton={false}`·중복 제출
 * 가드**가 셋 다 같아야 하기 때문이다. 파일을 나누면 한쪽만 고쳐지고, 그때 뚫리는 것이
 * 「Enter 한 번에 자동매수 시작」이다.
 */
function ViConfirmDialog({
  kind,
  accountNo,
  accountName,
  amountManwon,
  checkRate,
  todayOrderCount,
  unfilledCount,
  error,
  onOpenChange,
  onConfirm,
}: {
  kind: 'start' | 'stop' | null;
  accountNo: string;
  accountName?: string;
  amountManwon: number;
  checkRate: number;
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
          {isStart ? (
            <>
              <SummaryRow label="계좌">
                {accountNo}
                {accountName !== undefined && accountName !== '' ? ` · ${accountName}` : ''}
              </SummaryRow>
              {/* ★ 금액·상승률이 요약에 **반드시** 있어야 한다(T-16-10). */}
              <SummaryRow label="1건당 금액">{NUM.format(amountManwon)}만원</SummaryRow>
              <SummaryRow label="상승률 조건">{NUM.format(checkRate)}% 이상</SummaryRow>
              <SummaryRow label="주문가">상한가 · KRX</SummaryRow>
            </>
          ) : (
            <>
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
          /*
            눌렀는데 못 나갔다 — 창이 그대로 열려 있는 이유가 여기 있다(GC-WR-06).
            카드 안의 같은 문구는 오버레이에 가려 보이지 않으므로, 사용자가 보고 있는
            **이 창 안**에 사유를 둔다. 상태는 카드의 `sendError` 하나뿐이다.
          */
          <p
            data-slot="vi-confirm-error"
            role="alert"
            className="m-0 text-[length:var(--t-caption)] text-[var(--destructive)]"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          {/* 기본 포커스 대상 — 실행 버튼보다 **앞**에 둔다(탭 순서·오클릭 방어). */}
          <Button
            type="button"
            variant="outline"
            autoFocus
            ref={dismissRef}
            onClick={() => onOpenChange(false)}
          >
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
            /* 채움 금지 — `--destructive` 는 `--up`(매수)과 같은 색이다(⑦). */
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

/** 요약 한 줄. 라벨은 `--muted-fg`, 값은 mono `--fg`. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--muted-fg)]">{label}</dt>
      <dd className="mono min-w-0 text-right font-semibold break-all text-[var(--fg)]">
        {children}
      </dd>
    </div>
  );
}

/** 입력 문자열에서 숫자만 남겨 정수로. 빈 값은 0 이다(「모름」이 아니라 0 이다). */
function parseDigits(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length === 0 ? 0 : Number(digits);
}
