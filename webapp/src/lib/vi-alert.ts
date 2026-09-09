/**
 * VI 화면 공용 순수 유틸 — 마감 알림 · 금액 단위 · 통지 몫 판정 (16-14, TRADE-02).
 *
 * ① 왜 한 파일인가
 *   VI 표면이 쓰는 **React 없는 계약**을 모아 둔다. 셋 다 「두 곳에 두면 조용히 갈리는」
 *   종류의 값이다 — 단위 변환이 갈리면 100배 큰 주문이 나가고, 통지 몫 판정이 갈리면
 *   남의 거부를 내 거부로 그린다. 파일명은 계획이 정한 `vi-alert.ts` 를 따른다.
 *
 * ② ★ 마감 알림은 **이 기기 전용**이다 (T-16-09)
 *   설정은 `localStorage` 에만 있고 서버로 보내지 않는다. 알림 자체도 브라우저
 *   `Notification` 이라 다른 단말에 전파되지 않는다 — 그래서 UI 문구가
 *   `(이 기기만)` 을 명시한다. 계좌번호·금액 같은 값은 알림 본문에 싣지 않는다.
 *
 * ③ ★ 권한 거부는 **조용히 넘어가지 않는다** (PC-7 무로그 fail-safe 금지)
 *   `Notification.requestPermission()` 이 거부되면 스위치를 되돌리고 사유를 돌려준다.
 *   켜진 것처럼 두면 사용자는 마감 10초 전에 아무 일도 일어나지 않는 이유를 영원히
 *   알 수 없다.
 *
 * ④ SSR 안전
 *   `webapp` 은 Next App Router 라 이 모듈이 서버에서도 평가된다. `window`·`localStorage`·
 *   `Notification` 접근은 전부 가드 뒤에 있고, 서버에서는 **끔(false)** 으로 읽힌다.
 */

import { MAX_VI_ORDER_AMOUNT_KRW } from "@gh-radar/shared";

import { isLimitChaserServerMessage } from "@/lib/limit-chaser";

/** 마감 알림 on/off 저장 키. **이 기기 전용**이라는 사실의 유일한 물리적 근거다. */
export const VI_ALERT_STORAGE_KEY = "gh-radar:vi-alert";

/**
 * 마감 알림 리드(ms) — VI 해제 예정 시각 **10초 전**.
 * WinForms `ViAlertLeadSeconds` 와 같은 값이다(두 클라이언트가 다른 시각에 울리면
 * 사용자가 어느 쪽을 믿을지 알 수 없다).
 */
export const VI_ALERT_LEAD_MS = 10_000;

/**
 * 해제 예정 시각을 못 쓸 때의 폴백(ms) — **수신 +110초**.
 * VI 단일가 2분 − 10초. WinForms `ViAlertFallbackSeconds` 와 같은 값이다.
 */
export const VI_ALERT_FALLBACK_MS = 110_000;

/**
 * 만원 → 원 배수. **단위 변환의 유일한 지점**이다.
 *
 * 와이어(`RelayViSetMsg.orderAmountKrw`)는 **원**, 화면 입력은 **만원**이다. 이 상수를
 * 호출부마다 다시 적으면 한 곳이 10,000 을 빠뜨리는 순간 **1만분의 1 금액**으로 등록되고
 * (주문수량 0 → 아무 일도 안 일어남), 반대로 한 번 더 곱하면 **1만 배** 주문이 나간다.
 */
const MANWON_IN_KRW = 10_000;

/** 만원 → 원. 와이어로 나가는 값을 만드는 유일한 함수다. */
export function manwonToKrw(manwon: number): number {
  return Math.round(manwon) * MANWON_IN_KRW;
}

/**
 * 원 → 만원. 서버 에코를 입력칸으로 되돌린다.
 *
 * 만원 미만 우수리는 **내림**한다 — 올림하면 사용자가 「수정」을 누르지 않았는데도
 * 표시값이 서버값보다 커져, 그 값을 그대로 재전송하는 순간 금액이 늘어난다.
 */
export function krwToManwon(krw: number): number {
  return Math.floor(krw / MANWON_IN_KRW);
}

/**
 * 금액 입력 상한 — **만원 단위**. 원 단위 정본에서 **유도**한다 (WR-07).
 *
 * 정본은 `@gh-radar/shared` 의 `MAX_VI_ORDER_AMOUNT_KRW`(원) 하나이고 relay 의 zod 스키마·
 * envelope 조립기가 같은 값을 본다. 여기에 만원 숫자를 직접 적으면 세 층의 상한이 갈리고,
 * 갈라진 순간 **가장 느슨한 층이 실질 상한**이 된다. 변환은 위 두 함수 밖에서 하지 않는다.
 */
export const MAX_VI_ORDER_AMOUNT_MANWON = krwToManwon(MAX_VI_ORDER_AMOUNT_KRW);

/**
 * `"HHMMSSuuu"`(9자) 해제 예정 시각을 **수신일**에 붙여 Date 로 만든다.
 *
 * 모양이 어긋나면 `null` 이다 — 「모른다」를 0시로 뭉개면 알림이 과거 시각으로 잡혀
 * 즉시 울리거나 영영 울리지 않는다. 판정은 WinForms `ComputeAlertAt` 과 같다:
 * 9자 이상 · 숫자 · `hh<24` · `mm<60` · `ss<60`.
 */
export function parseViEndTime(raw: string, receivedAt: Date): Date | null {
  if (raw.length < 9) return null;
  if (!/^\d{9}/.test(raw)) return null;

  const hh = Number(raw.slice(0, 2));
  const mm = Number(raw.slice(2, 4));
  const ss = Number(raw.slice(4, 6));
  const ms = Number(raw.slice(6, 9));
  if (hh > 23 || mm > 59 || ss > 59) return null;

  const end = new Date(receivedAt.getTime());
  end.setHours(hh, mm, ss, ms);
  return end;
}

/** 마감 알림 시각 1건. `fallback` 이면 해제 예정 시각을 쓰지 못했다는 뜻이다. */
export interface ViAlertSchedule {
  /** 알림을 울릴 시각. */
  at: Date;
  /** true = `viEndTime` 을 쓰지 못해 「수신 +110초」로 잡았다. */
  fallback: boolean;
}

/**
 * 마감 알림 시각 계산 (**순수 함수** — 타이머를 걸지 않는다).
 *
 * ★ 이름이 `schedule…` 이지만 부수효과가 없다. 실제 타이머는 화면이 소유한다 —
 *   여기서 `setTimeout` 을 걸면 같은 주문의 73 델타가 올 때마다 타이머가 중복으로 쌓인다.
 *
 * 규칙은 WinForms `ComputeAlertAt` 이식이다:
 *   - `viEndTime` 이 파싱되고 **수신 시각보다 미래**면 → 그 시각 −10초
 *   - 파싱 실패 · 빈 값 · **과거 시각**이면 → 수신 +110초
 *
 * 「끝나는 시각이 이미 지났다」에 −10초를 적용하면 알림이 과거에 잡혀 즉시 울린다.
 * 그 경우 사용자는 아직 2분 가까이 남은 단일가를 이미 끝난 것으로 오해한다.
 */
export function scheduleViAlert(
  item: { viEndTime: string },
  receivedAt: Date = new Date(),
): ViAlertSchedule {
  const end = parseViEndTime(item.viEndTime, receivedAt);
  if (end !== null && end.getTime() > receivedAt.getTime()) {
    return { at: new Date(end.getTime() - VI_ALERT_LEAD_MS), fallback: false };
  }
  return { at: new Date(receivedAt.getTime() + VI_ALERT_FALLBACK_MS), fallback: true };
}

/* ── 로컬 설정 (이 기기 전용) ──────────────────────────────────────────── */

/**
 * 저장된 마감 알림 설정. **기본은 꺼짐**이고 SSR·저장소 접근 실패도 꺼짐이다.
 *
 * 켜짐을 기본값으로 두면 권한을 물어본 적도 없는 사용자에게 「켜져 있는데 안 울리는」
 * 스위치를 보여 주게 된다.
 */
export function readViAlertEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(VI_ALERT_STORAGE_KEY) === "on";
  } catch {
    // Safari 프라이빗 모드 등 — 저장소가 막혀 있으면 「꺼짐」이다.
    return false;
  }
}

/** 마감 알림 설정 저장. **서버로 보내지 않는다**(T-16-09). */
export function writeViAlertEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VI_ALERT_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // 저장 실패는 다음 방문에 꺼짐으로 읽히는 것뿐이라 화면 동작을 막지 않는다.
  }
}

/* ── 브라우저 알림 권한 ────────────────────────────────────────────────── */

/** 권한 요청 결과. 실패는 **반드시 사유를 들고** 돌아온다(③). */
export type ViAlertPermission =
  | { ok: true }
  | { ok: false; reason: string };

/** 알림을 지원하지 않는 브라우저(구형 · 일부 iOS 웹뷰)의 사유 문구. */
const UNSUPPORTED_REASON = "이 브라우저는 알림을 지원하지 않아요 · 마감알림을 켤 수 없어요";
/** 사용자가 이미 거부했거나 이번에 거부한 경우의 사유 문구. */
const DENIED_REASON = "브라우저에서 알림이 차단돼 있어요 · 주소창 자물쇠에서 허용해 주세요";

/**
 * 마감 알림 권한 요청. **사용자가 스위치를 켤 때만** 호출한다.
 *
 * 페이지 진입 즉시 물어보면 브라우저가 요청을 무시하거나(사용자 제스처 없음) 사용자가
 * 반사적으로 차단하고, 한 번 차단되면 이 화면에서는 되돌릴 방법이 없다.
 */
export async function requestViAlertPermission(): Promise<ViAlertPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ok: false, reason: UNSUPPORTED_REASON };
  }
  const api = window.Notification;
  if (api.permission === "granted") return { ok: true };
  try {
    const result = await api.requestPermission();
    return result === "granted" ? { ok: true } : { ok: false, reason: DENIED_REASON };
  } catch {
    return { ok: false, reason: DENIED_REASON };
  }
}

/**
 * 마감 알림 1건. 권한이 없으면 **아무 일도 하지 않는다**(예외를 던지지 않는다) —
 * 알림이 화면 동작을 막을 이유가 없다.
 *
 * 본문에는 종목명만 싣는다. 계좌번호·금액은 알림 센터에 남아 잠금화면에도 뜨므로
 * 싣지 않는다(T-16-09).
 */
export function notifyViEnd(stockLabel: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (window.Notification.permission !== "granted") return;
  try {
    new window.Notification("VI 마감 임박", {
      body: `${stockLabel} · VI 해제까지 10초 남았어요`,
      tag: `gh-radar-vi-${stockLabel}`,
    });
  } catch {
    // 일부 모바일 브라우저는 생성자 호출을 막고 ServiceWorker 만 허용한다. 화면은 그대로 둔다.
  }
}

/* ── ServerMessage(54) 의 VI 몫 판정 ──────────────────────────────────── */

/**
 * `ServerMessage(54)` 가 **VI 화면의 몫인가** (Pitfall 9).
 *
 * ★ 상따/계좌 통지의 가르는 규칙은 **다시 쓰지 않는다.** `isLimitChaserServerMessage`
 *   (16-13, `lib/limit-chaser.ts`)가 유일 지점이고 여기서는 그 결과를 뒤집어 쓴다.
 *   두 곳에서 각자 판정하면 어느 한쪽이 남의 거부를 그리고 다른 쪽은 자기 거부를 놓치는데,
 *   둘 다 사용자가 알아챌 수 없는 방식으로 조용히 일어난다.
 *
 * 규칙:
 *   - `src === "SetVITrigger"`                → VI 등록·수정 거부. 명백히 VI 몫.
 *   - `src === "Account"` ∧ **종목이 없음**    → 종목 축이 없는 계좌 통지 = VI 몫.
 *   - `src === "Account"` ∧ 종목이 있음        → 상따 몫(16-13 판정이 참).
 *
 * ★ 그 밖의 `src` 는 **VI 몫이 아니다.** 특히 relay 자신이 요청 단위로 거부할 때 쓰는
 *   `src === "Relay"` 를 VI 통지로 읽으면, 상따 요청이 형식 오류로 튕긴 것을 VI 화면이
 *   「내 자동매수가 거부됐다」로 그린다 — 사용자는 멀쩡한 VI 를 껐다 켜고 그 재등록이
 *   두 번째 무인 발주다. 그래서 `!isLimitChaserServerMessage(msg)` 만으로는 부족하고
 *   `Account` 라는 발신 맥락을 함께 본다.
 */
export function isViServerMessage(msg: { src: string; i: string }): boolean {
  if (msg.src === "SetVITrigger") return true;
  return msg.src === "Account" && !isLimitChaserServerMessage(msg);
}
