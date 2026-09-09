"use client";

/**
 * MeClient — My page (`/me`) 본문 (MYPAGE-01 · 16-UI-SPEC C1~C7 · D-19/D-20/D-21).
 *
 * ① 세로 순서가 계약이다 (D-20)
 *   상태줄 → 전략 현황 → 계좌 A(미체결, 잔고) → 계좌 B(…) → … 로 **고정**이다. 데스크톱
 *   에서도 이 순서를 바꾸지 않는다 — 전략이 지금 어떤 상태인지가 먼저이고, 계좌별 주문·
 *   잔고는 그 결과다.
 *
 * ② ★ 계좌 선택 UI 를 만들지 않는다 (D-21)
 *   계좌가 몇 개든 **계좌마다 카드 하나**를 세로로 반복한다. 셀렉터를 두면 「지금 보는
 *   카드」와 「선택된 계좌」가 어긋나고, 화면에 한 계좌만 보이는 순간 다른 계좌의 미체결을
 *   놓친다. 계좌번호는 **마스킹 없이 전체** 표시한다(D2 · S-5 — 마스킹은 relay 로그에서만).
 *
 * ③ ★ 계좌별 상태는 `accountStates` 에서 가져온다 (16-15)
 *   relay 는 인증 직후 계좌마다 `acct` 프레임을 한 벌씩 내려보낸다. `account` 는 그중
 *   **마지막 한 건**이라 계좌가 2개 이상이면 나머지가 사라진다 — 그 값을 계좌 카드에
 *   그대로 물리면 계좌 A 의 카드가 계좌 B 의 주문을 보여주거나 「미체결 없음」이라고
 *   거짓말한다.
 *
 * ④ ★ 잘림 방지 규칙은 `account-panel` 안에 있다 (R4)
 *   ≥1280px 2열(477/477)과 `min-w-0` 자식 규칙은 계좌 패널이 소유한다 — 3표면이 공유하는
 *   리플로우를 여기서 다시 만들면 한 곳만 고쳐지고 나머지가 조용히 갈린다. `min-width:0`
 *   이 빠지면 표의 콘텐츠 최소폭(미체결 439px · 잔고 444px) 때문에 스크롤이 아니라
 *   **조용한 잘림**이 된다(`tasks/lessons.md` 등재 함정).
 *
 * ⑤ ★ 오늘 주문 이력 표를 만들지 않는다 (D-20 deferred)
 *   주문 이력 조회 REST 라우트를 호출하지 않는다(경로명을 주석에도 적지 않는다 — 계획의
 *   grep 감시선이 주석 때문에 무력화되면 안 된다). 표시 원천은 전역 wss 계좌 스냅샷 하나뿐이다
 *   (T-16-02) — 화면마다 조회 경로를 늘리면 그만큼 「내 계좌가 아닌 값이 보일 수 있는」
 *   표면이 늘어난다.
 *
 * ⑥ 직접 URL 진입은 게이트가 받는다 (D-19 / C6)
 *   사이드바에서 숨겨져 있어도 주소창으로는 들어올 수 있다. 비로그인·매핑 없음은
 *   `<DmaGate>` 가 본문을 **대체**한다. 다만 게이트는 권한 장치가 아니다 — 실제 차단은
 *   relay `unauthorized` 와 middleware 로그인 벽이다(T-16-04).
 */

import { RELAY_STATE_LABELS } from "@gh-radar/shared";
import type { RelayAccountState } from "@gh-radar/shared";

import { AccountPanel } from "@/components/orderbook/account-panel";
import { DmaGate, useDmaGateReason } from "@/components/trading/dma-gate";
import { StrategyStatusCard } from "@/components/trading/strategy-status-card";
import { useRelayContext } from "@/lib/relay-provider";
import type { RelayStatus } from "@/lib/use-relay-socket";
import { cn } from "@/lib/utils";

/** 점멸 도트를 쓰는 진행 상태 (C1 로딩) — `relay-status-bar` 와 같은 집합이다. */
const PROGRESS_STATES: ReadonlySet<RelayStatus> = new Set<RelayStatus>([
  "idle",
  "connecting",
  "logging_in",
  "declaring",
]);

/**
 * 서버가 준 갱신시각(`AccountState.st`)을 `HH:MM:SS` 로 읽는다.
 *
 * 게이트웨이는 `YYYYMMDDHHMMSS` 를 주지만 구현/스텁에 따라 `HH:MM:SS` 로 오기도 한다.
 * **모르는 모양은 지어내지 않고 `null`** 을 돌려준다 — 없는 시각을 그리느니 칸을 비운다.
 */
export function formatServerTime(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 14) {
    return `${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`;
  }
  if (digits.length === 6) {
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
  }
  return null;
}

/**
 * 계좌 **전체** 중 가장 최근 갱신시각 (16-23).
 *
 * 16-23 이전에는 「마지막으로 프레임이 온 계좌」 단일 값의 `st` 를 그렸다. 그 필드가
 * 계좌 경계 사고의 원인이라 계약에서 제거됐으므로(CR-01) 여기서는 계좌 전체를 훑는다 —
 * 상태줄은 계좌 축이 없는 전역 표시라 「어느 계좌인가」가 아니라 **「가장 최근 언제
 * 반영됐나」**가 답이어야 한다. 계좌가 하나면 결과는 이전과 완전히 같다.
 *
 * ★ 비교는 **정규화 전** 값으로 한다 (GC-IN-03). `formatServerTime` 은 `HH:MM:SS` 로 자르며
 *   **날짜를 버리는데**, 날짜를 버린 뒤 비교하면 두 자리에서 최댓값이 뒤집힌다:
 *     - **자정 경계** — 전일 `23:59:00` 과 당일 `00:01:00` 이 있으면 `"23:59:00" > "00:01:00"`
 *       이라 **어제 값이 「가장 최근」으로 뽑힌다.**
 *     - **혼합 포맷** — 게이트웨이는 `YYYYMMDDHHMMSS` 를, 구현·스텁은 `HH:MM:SS` 를 준다.
 *       날짜를 버리면 날짜를 **아는** 값과 모르는 값이 같은 축에서 겨루게 된다.
 *   그래서 아래 `serverTimeKey` 로 **원문에서** 비교 키를 만들고(날짜 유무를 축으로 분리),
 *   승자를 고른 뒤 **그 승자의 원문에서** 표시 문자열을 뽑는다. 반환 계약(표시 문자열 ·
 *   값이 없으면 `null`)과 소비부(상태줄 C1)의 표시 형식은 그대로다 — 바뀌는 것은
 *   **어느 값을 고르는가**뿐이고, 모든 값이 `HH:MM:SS` 뿐이면 결과는 이전과 완전히 같다.
 */
export function latestAccountTime(
  states: ReadonlyMap<string, RelayAccountState>,
): string | null {
  let best: { key: ServerTimeKey; raw: string } | null = null;
  for (const state of states.values()) {
    const key = serverTimeKey(state.st);
    if (key === null) continue;
    if (best === null || isNewerServerTime(key, best.key)) best = { key, raw: state.st };
  }
  // 표시는 **승자의 원문**에서 뽑는다 — 고르기와 그리기가 같은 값을 본다.
  return best === null ? null : formatServerTime(best.raw);
}

/**
 * 비교용 키. `dated` 가 **첫 번째 축**이다 — 날짜를 아는 값이 모르는 값에 지면 안 된다.
 * `key` 는 제로패딩 숫자열이라 같은 축 안에서는 문자열 비교가 곧 시각 비교다.
 */
interface ServerTimeKey {
  /** 원문에 날짜가 실려 있는가(`YYYYMMDDHHMMSS`). */
  dated: boolean;
  /** 날짜가 있으면 14자리, 없으면 `HHMMSS` 6자리. */
  key: string;
}

/** 원문 → 비교 키. 모르는 모양은 `formatServerTime` 과 **같은 기준**으로 버린다. */
function serverTimeKey(raw: string | undefined): ServerTimeKey | null {
  if (raw === undefined || raw === "") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 14) return { dated: true, key: digits.slice(0, 14) };
  if (digits.length === 6) return { dated: false, key: digits };
  return null;
}

/**
 * `a` 가 `b` 보다 최근인가.
 *
 * ★ 날짜를 아는 값이 **언제나** 이긴다. 둘을 같은 축에서 겨루게 할 방법이 없기 때문이다 —
 *   날짜 없는 `23:59:00` 이 오늘인지 어제인지 이 함수는 알 수 없고, 모르는 값을 오늘로
 *   가정하면 자정 직후마다 「가장 최근」이 어제로 뒤집힌다.
 */
function isNewerServerTime(a: ServerTimeKey, b: ServerTimeKey): boolean {
  if (a.dated !== b.dated) return a.dated;
  return a.key > b.key;
}

/**
 * 상태줄 (C1) — `DMA {상태}` · 상따 N건 · VI 가동/중지 · 계좌 N개 · 반영 시각.
 *
 * ★ 상태 문구는 `RELAY_STATE_LABELS` **단일 정본**을 쓴다(D-36). 화면마다 문구를 다시
 *   지으면 호가주문 탭은 「실시간」, My page 는 다른 말이 되어 같은 상태가 두 이름을 갖는다.
 */
function MeStatusBar() {
  const { status, statusLabel, accounts, limitChasers, viTrigger, accountStates } =
    useRelayContext();
  const label = statusLabel === "" ? RELAY_STATE_LABELS.connecting : statusLabel;
  const updatedAt = latestAccountTime(accountStates);

  return (
    <div
      data-slot="me-status-bar"
      data-status={status}
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--muted-fg)]"
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-[7px] shrink-0 rounded-full bg-current",
            // prefers-reduced-motion 은 globals.css 전역 규칙 + 로컬 가드로 끈다.
            PROGRESS_STATES.has(status) && "animate-pulse motion-reduce:animate-none",
          )}
        />
        DMA <b className="font-semibold text-[var(--fg)]">{label}</b>
      </span>
      <span>
        상따 <b className="font-semibold text-[var(--fg)]">{limitChasers.length}건</b>
      </span>
      <span>
        VI{" "}
        <b className="font-semibold text-[var(--fg)]">
          {viTrigger?.run === true ? "가동" : "중지"}
        </b>
      </span>
      <span>
        계좌 <b className="font-semibold text-[var(--fg)]">{accounts.length}개</b>
      </span>
      {/* 반영 시각은 **아는 경우에만** 그린다(위 `formatServerTime`). */}
      {updatedAt !== null && <span className="mono ml-auto">반영 {updatedAt}</span>}
    </div>
  );
}

export function MeClient() {
  const gateReason = useDmaGateReason();
  const { accounts, accountStates, status } = useRelayContext();

  if (gateReason !== null) {
    return <DmaGate reason={gateReason} surface="전략·잔고·미체결" />;
  }

  return (
    <div data-slot="me-page" className="flex flex-col gap-[var(--s-3)]">
      <header className="flex flex-col gap-1">
        <h1 className="text-[length:var(--t-2xl)] font-bold tracking-[-0.01em] text-[var(--fg)]">
          My page
        </h1>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          전략 현황 · 미체결 · 잔고
        </p>
      </header>

      <MeStatusBar />

      <StrategyStatusCard />

      {accounts.length === 0 ? (
        /*
          `ready` 이전에는 빈 계좌 목록이 정상이다(`RelayAccount` 주의). 「계좌 없음」이
          아니라 「아직 모른다」이므로 빈 상태가 아니라 로딩으로 말한다.
        */
        <p
          data-slot="me-accounts-loading"
          aria-busy="true"
          className="rounded-[var(--r-lg)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center text-[length:var(--t-sm)] text-[var(--muted-fg)]"
        >
          계좌 정보를 불러오는 중이에요…
        </p>
      ) : (
        accounts.map((acct) => (
          <section
            key={acct.accountNo}
            data-slot="me-account-card"
            data-account-no={acct.accountNo}
            className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)]"
          >
            {/*
              계좌 전용 모드(`code` 미전달)는 셀렉터·탭이 없고 헤더에 계좌번호를 전체
              표시한다 — 그 헤더가 곧 C5 의 카드 머리다. 여기서 헤더를 한 벌 더 그리면
              같은 계좌번호가 두 번 나온다.
            */}
            <AccountPanel
              selectedAccountNo={acct.accountNo}
              accountName={acct.name}
              account={accountStates.get(acct.accountNo) ?? null}
              status={status}
            />
          </section>
        ))
      )}
    </div>
  );
}
