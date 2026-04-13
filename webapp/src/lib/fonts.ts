import localFont from 'next/font/local';
import { Geist_Mono } from 'next/font/google';

/**
 * Pretendard Variable — self-hosted woff2.
 * Variable 폰트 weight range 45–920 (CONTEXT.md D-11 ~ D-13).
 */
export const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-sans-loaded',
  weight: '45 920',
});

/**
 * Geist Mono — 숫자 전용 고정폭 (UI-SPEC §2.2).
 * next/font/google 프록시를 통해 로드 (fonts.googleapis.com 직접 호출 금지).
 */
export const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono-loaded',
  weight: ['400', '500', '600'],
});
