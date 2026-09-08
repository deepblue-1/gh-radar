"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useRelayContext } from "@/lib/relay-provider";
import { cn } from "@/lib/utils";

/**
 * Phase 16 Plan 11 — 3표면 공용 게이트 (A14 / B9 / C6).
 *
 * ⚠️ **이 컴포넌트는 권한 장치가 아니다.** 실제 차단은 relay 의 `conn.unauthorized`(16-07)와
 *    각 라우트의 서버 가드다. 여기서 하는 일은 「왜 못 쓰는지」를 말해 주는 것뿐이고,
 *    사이드바 조건부 숨김과 함께 **오진입을 줄이는 편의**다(T-16-04). 이 화면을 우회해도
 *    와이어에서는 아무 일도 일어나지 않는다.
 *
 * 문구는 16-UI-SPEC §빈 상태·게이트 표를 그대로 옮긴 것이다. **매핑 없음에는 버튼이 없다** —
 * 사용자가 스스로 할 수 있는 일이 없는데 버튼을 두면 누르고 아무 일도 안 일어나는 경험이
 * 된다. 대신 관리자 문의를 본문에 적고, 이 앱에서 여전히 할 수 있는 일(차트·뉴스·종목토론방)을
 * 보조문으로 알려 준다.
 */

/** 게이트가 선 이유. 두 사유는 사용자가 할 수 있는 일이 다르므로 뭉개지 않는다. */
export type DmaGateReason = "unauthenticated" | "unmapped";

/** 막힌 표면 이름. 본문 문장에 그대로 들어간다(UI-SPEC 표의 `{...}` 자리). */
export type DmaGateSurface = "상따 전략" | "VI 자동매수" | "전략·잔고·미체결";

export interface DmaGateProps {
  reason: DmaGateReason;
  surface: DmaGateSurface;
  className?: string;
}

/**
 * 주격/보조사 「은/는」 선택.
 *
 * UI-SPEC 의 본문 템플릿은 `{...}은` 으로 고정돼 있지만 그대로 쓰면 **「VI 자동매수은」**
 * 이 된다(받침 없는 「수」로 끝난다). 한글 음절의 종성 유무로 갈라 준다 —
 * 유니코드 한글 완성형은 `(코드 - 0xAC00) % 28` 이 0 이면 받침이 없다.
 * 한글이 아닌 문자로 끝나면 받침 없음으로 본다(라틴 표기는 대개 모음으로 읽힌다).
 */
function topicParticle(word: string): "은" | "는" {
  const last = word.at(-1);
  if (last === undefined) return "는";
  const code = last.charCodeAt(0);
  const isHangulSyllable = code >= 0xac00 && code <= 0xd7a3;
  if (!isHangulSyllable) return "는";
  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}

/**
 * 게이트를 세워야 하는지 판정한다. `null` 이면 본문을 그린다.
 *
 * ★ **연결 중에는 게이트를 세우지 않는다.** `unauthorized` 는 relay 가 `dma_credentials`
 *   미등록을 확정했을 때만 오는 값이라, 그 전(`connecting`/`logging_in`/`declaring`)에
 *   미리 게이트를 그리면 **떴다가 사라진다**. 사이드바가 반대 방향(숨긴 채로 시작)으로
 *   같은 원칙을 지키는 것과 짝이다 — 확정 신호에만 반응한다.
 *
 * 3표면(상따·VI·My page)이 같은 판정을 쓰도록 여기 한 곳에 둔다. 표면마다 다시 쓰면
 * 「어떤 화면은 연결 중에 게이트가 깜빡인다」가 조용히 생긴다.
 */
export function useDmaGateReason(): DmaGateReason | null {
  const { user, isLoading } = useAuth();
  const { status } = useRelayContext();

  /*
    ★ 세션 판정 전에는 게이트를 세우지 않는다.

      `AuthProvider` 는 `isLoading: true, user: null` 로 시작해 `getSession()` 이 돌아온
      뒤에야 사용자를 채운다. 그 사이를 「비로그인」으로 읽으면 **로그인한 사용자의 첫
      페인트에 「로그인이 필요해요」가 통째로 그려진다**(SSR HTML 에도 그대로 들어간다).
      바로 아래 `unauthorized` 에 대해 지키는 규율 — 확정 신호에만 반응한다 — 을 로그인
      축에도 똑같이 적용한 것이다.

      비로그인 진입은 이 훅이 아니라 middleware 가 `/login?next=…` 로 막는다. 이 분기가
      살아 있는 이유는 **열려 있는 탭에서 세션이 만료**되는 경우다(`SIGNED_OUT` 이벤트로
      `user` 가 null 이 되고, 그때는 `isLoading` 이 false 다).
  */
  if (isLoading) return null;
  if (user == null) return "unauthenticated";
  if (status === "unauthorized") return "unmapped";
  return null;
}

export function DmaGate({ reason, surface, className }: DmaGateProps) {
  const pathname = usePathname();
  const particle = topicParticle(surface);

  const title =
    reason === "unmapped" ? "DMA 계정이 연결되지 않았어요" : "로그인이 필요해요";

  const body =
    reason === "unmapped"
      ? `${surface}${particle} 증권사 계정이 연결된 사용자만 이용할 수 있어요. 연결이 필요하면 관리자에게 문의해 주세요.`
      : `${surface}${particle} 로그인한 뒤 이용할 수 있어요.`;

  const aux =
    reason === "unmapped"
      ? "차트·뉴스·종목토론방은 그대로 이용할 수 있어요."
      : "홈·상승률 상위·테마는 로그인 없이도 볼 수 있어요.";

  return (
    <section
      data-slot="dma-gate"
      data-reason={reason}
      className={cn(
        "mx-auto flex max-w-md flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border)] px-6 py-10 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full bg-[var(--muted)] text-[var(--muted-fg)]"
      >
        <Lock className="size-5" />
      </span>

      <h1 className="text-[length:var(--t-lg)] font-bold tracking-[-0.01em] text-[var(--fg)]">
        {title}
      </h1>

      <p className="text-[length:var(--t-sm)] text-[var(--fg)]">{body}</p>
      <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{aux}</p>

      {/* 매핑 없음에는 버튼을 두지 않는다 — 사용자가 스스로 풀 수 있는 상태가 아니다. */}
      {reason === "unauthenticated" && (
        <Button asChild className="mt-2">
          <Link href={`/login?next=${encodeURIComponent(pathname)}`}>로그인</Link>
        </Button>
      )}
    </section>
  );
}
