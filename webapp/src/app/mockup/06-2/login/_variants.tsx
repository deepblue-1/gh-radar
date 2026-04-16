'use client';

import { useState } from 'react';
import { AlertCircle, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

import { GoogleMark } from '../_components/google-mark';

const ERROR_OPTIONS: Array<{
  key: string;
  label: string;
  message: string;
}> = [
  { key: 'none', label: '에러 없음', message: '' },
  {
    key: 'auth_failed',
    label: 'auth_failed',
    message: '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.',
  },
  {
    key: 'oauth_denied',
    label: 'oauth_denied',
    message: 'Google 인증이 취소되었습니다. 다시 시도해주세요.',
  },
  {
    key: 'session_expired',
    label: 'session_expired',
    message: '세션이 만료되었습니다. 다시 로그인해주세요.',
  },
  {
    key: 'unknown',
    label: 'unknown',
    message: '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  },
];

function ErrorPicker({
  errorKey,
  onChange,
}: {
  errorKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {ERROR_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-full border px-2 py-0.5 text-xs transition ${
            errorKey === opt.key
              ? 'border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] text-[var(--primary)]'
              : 'border-[var(--border)] bg-[var(--bg)] text-[var(--muted-fg)] hover:border-[var(--muted-fg)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ErrorBanner({ errorKey }: { errorKey: string }) {
  const opt = ERROR_OPTIONS.find((o) => o.key === errorKey);
  if (!opt || !opt.message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-[color-mix(in_oklch,var(--destructive)_35%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] p-3 text-sm text-[var(--destructive)]"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="leading-normal">{opt.message}</p>
    </div>
  );
}

export function LoginCardCentered() {
  const [errorKey, setErrorKey] = useState('none');
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--primary)_14%,transparent)] text-[var(--primary)]">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-semibold">gh-radar</h3>
          <p className="text-sm text-[var(--muted-fg)] leading-normal">
            Google 계정으로 로그인하여 관심종목을 관리하세요.
          </p>
        </div>
        <ErrorBanner errorKey={errorKey} />
        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--fg)] transition hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <GoogleMark />
          Google로 로그인
        </button>
        <p className="mt-4 text-center text-xs text-[var(--muted-fg)] leading-normal">
          계속하면 서비스 약관과 개인정보 처리방침에 동의합니다.
        </p>
      </div>
      <ErrorPicker errorKey={errorKey} onChange={setErrorKey} />
    </div>
  );
}

export function LoginSplitHero() {
  const [errorKey, setErrorKey] = useState('none');
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="grid md:grid-cols-[1fr_1.1fr]">
          <div className="flex flex-col gap-3 bg-gradient-to-br from-[color-mix(in_oklch,var(--primary)_16%,var(--card))] to-[var(--card)] p-6">
            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)]/60 px-2 py-0.5 text-xs text-[var(--muted-fg)]">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Google OAuth 전용
            </span>
            <h3 className="text-xl font-semibold leading-snug">
              급등 포착,
              <br />
              관심종목으로
              <br />
              이어서 추적.
            </h3>
            <p className="text-sm text-[var(--muted-fg)] leading-normal">
              로그인 후 Scanner 에서 ⭐ 를 눌러 개인 watchlist 에 저장하면,
              1분마다 시세가 자동 갱신됩니다.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-4 p-6">
            <ErrorBanner errorKey={errorKey} />
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--fg)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              <GoogleMark />
              Google로 로그인
            </button>
            <p className="text-xs text-[var(--muted-fg)] leading-normal">
              계정이 없으면 Google 가입 후 자동 진입합니다.
            </p>
          </div>
        </div>
      </div>
      <ErrorPicker errorKey={errorKey} onChange={setErrorKey} />
    </div>
  );
}

export function LoginMinimalFlat() {
  const [errorKey, setErrorKey] = useState('none');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">gh-radar</span>
          <span className="text-xs text-[var(--muted-fg)]">v0.1</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
            로그인
          </p>
          <h3 className="text-lg font-semibold">관심종목을 계속 추적하세요</h3>
        </div>
        <ErrorBanner errorKey={errorKey} />
        <button
          type="button"
          className="group inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-5 py-2 text-sm font-medium text-[var(--fg)] transition hover:border-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <GoogleMark />
          Google로 계속하기
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
        <p className="text-xs text-[var(--muted-fg)] leading-normal">
          약관·개인정보 처리방침 동의로 간주됩니다.
        </p>
      </div>
      <ErrorPicker errorKey={errorKey} onChange={setErrorKey} />
    </div>
  );
}
