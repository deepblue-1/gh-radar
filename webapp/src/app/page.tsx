import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>gh-radar</h1>
      <p>Phase 3 스캐폴드입니다. Phase 4 에서 본 페이지가 교체됩니다.</p>
      <p>
        디자인 시스템 카탈로그: <Link href="/design">/design</Link>
      </p>
    </main>
  );
}
