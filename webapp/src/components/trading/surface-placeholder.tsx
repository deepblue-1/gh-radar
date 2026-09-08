"use client";

/**
 * Phase 16 Plan 11 — 라우트 셸의 **자리표시 본문**.
 *
 * 이 plan 이 세우는 것은 트리·게이트·배지·라우트뿐이고 화면 내용은 16-12~16-15 가 채운다.
 * 그때까지 빈 화면을 두면 「배포됐는데 아무것도 없다」가 되므로, 무엇을 보게 될 화면인지
 * 제목·부제로 밝히고 아직 준비 중임을 **명시**한다.
 *
 * ⚠️ 「불러오는 중」으로 위장하지 않는다. 영원히 끝나지 않는 로딩은 사용자가 새로고침을
 *    반복하게 만드는 거짓말이다. 준비 중이면 준비 중이라고 쓴다.
 *
 * `data-slot="surface-placeholder"` 는 후속 plan 이 **남은 자리표시를 grep 으로 찾기**
 * 위한 표식이다. 16-12~16-15 가 각 화면을 채우면서 이 컴포넌트 사용을 걷어낸다.
 */
export function SurfacePlaceholder({
  title,
  subtitle,
}: {
  title: string;
  /** mono 로 그릴 부제(전략키 등)면 `mono: true`. */
  subtitle?: { text: string; mono?: boolean };
}) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-[length:var(--t-2xl)] font-bold tracking-[-0.01em] text-[var(--fg)]">
        {title}
      </h1>
      {subtitle !== undefined && (
        <p
          // `.mono` 는 globals.css §2.2 의 숫자 전용 고정폭 유틸리티다(신규 토큰 0).
          className={
            subtitle.mono === true
              ? "mono text-[length:var(--t-sm)] text-[var(--muted-fg)]"
              : "text-[length:var(--t-sm)] text-[var(--muted-fg)]"
          }
        >
          {subtitle.text}
        </p>
      )}
      <p
        data-slot="surface-placeholder"
        role="status"
        className="mt-4 text-[length:var(--t-sm)] text-[var(--muted-fg)]"
      >
        이 화면은 준비 중이에요.
      </p>
    </div>
  );
}
