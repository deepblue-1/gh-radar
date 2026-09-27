/**
 * `/privacy` — GH Trade 개인정보처리방침(Phase 22 D-11 · MOBILE-02).
 *
 * 문안 정본: `.planning/phases/22-gh-trade-ios-testflight-android-play/22-PRIVACY-DRAFT.md`
 * (22-02 승인 · 1~13절). 문구를 바꾸려면 정본을 먼저 고치고 승인을 다시 받은 뒤 여기에 옮긴다.
 *
 * - 공개 경로: `lib/supabase/public-path.ts` 의 `/privacy` prefix — 스토어·테스터가 로그인 없이 연다.
 * - 서버 컴포넌트 정적 문서다. 데이터 요청·클라이언트 훅·relay/API 호출이 없다(사용자 수와 무관).
 * - 시행일은 방침이 운영 웹에 처음 공개된 날(22-10 · 2026-09-27 KST)이다 — 초안 frontmatter effective_date · 13절 · page.test.tsx 와 같은 값.
 * - 표는 폰 폭(320~390px) WebView 에서 잘리지 않도록 가로 스크롤 컨테이너로 감싼다.
 */

import type { ReactNode } from 'react';

import { CenterShell } from '@/components/layout/center-shell';

export const metadata = {
  title: '개인정보처리방침 · GH Trade',
  description: 'GH Trade(웹·iOS·Android 앱)가 처리하는 개인정보 항목·목적·보유 기간·위탁·권리 행사 방법',
};

const EFFECTIVE_DATE = '2026년 9월 27일';
const CONTACT_EMAIL = 'alex@jx1.io';

const P = 'text-[length:var(--t-base)] leading-relaxed';
const OL = 'list-decimal space-y-2 pl-5 text-[length:var(--t-base)] leading-relaxed';
const UL = 'list-disc space-y-1 pl-5 text-[length:var(--t-base)] leading-relaxed';

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section id={`section-${n}`} className="scroll-mt-20 space-y-3">
      <h2 className="text-[length:var(--t-h3)] font-semibold">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function PolicyTable({
  head,
  rows,
  minWidth,
}: {
  head: string[];
  rows: ReactNode[][];
  /** 폰 폭에서 한 글자씩 줄바꿈되지 않도록 표 최소 폭을 두고 가로 스크롤한다. */
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={`w-full border-collapse text-left text-[length:var(--t-sm)] leading-relaxed ${minWidth ?? ''}`}
      >
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border border-[var(--border)] bg-[var(--muted)] px-3 py-2 align-top font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="border border-[var(--border)] px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ITEM_ROWS: ReactNode[][] = [
  [
    'Google 계정 정보(이메일 주소 · 이름 · 프로필 사진 주소)',
    '인증 서버(Supabase)',
    '로그인, 화면에 이름·사진 표시',
    '계정 삭제 시까지',
  ],
  [
    '관심종목(종목 코드 · 추가한 시각 · 정렬 순서)',
    '데이터베이스(Supabase)',
    '관심종목 기능',
    '계정 삭제 시까지',
  ],
  [
    '직접 만든 테마(테마 이름 · 설명 · 담은 종목)',
    '데이터베이스(Supabase)',
    '테마 기능',
    '계정 삭제 시까지',
  ],
  [
    'AI 애널리스트 대화(대화 제목 · 질문과 답변 원문 · 관련 종목)',
    '데이터베이스(Supabase)',
    '대화 이력 제공',
    '계정 삭제 시까지(3절 참조)',
  ],
  [
    'AI 답변 생성을 위한 질문 내용과 대화 맥락',
    'AI 처리 사업자(Anthropic, 미국)로 전송',
    '답변 생성',
    '6절 참조',
  ],
  [
    <>
      DMA 계정 정보(주문 게이트웨이 로그인 아이디 · 암호화한 비밀번호) —{' '}
      <strong>운영자가 허용한 사용자 본인만</strong> 해당하며, 테스터 계정을 포함한 그 밖의
      계정에서는 수집하지 않습니다
    </>,
    '데이터베이스(Supabase, 서버 전용 접근)',
    '본인 계좌 주문 중계',
    '계정 삭제 또는 허용 해제 시까지',
  ],
  [
    <>
      주문 기록(계좌번호 · 종목 · 매수·매도 구분 · 수량 · 가격 · 주문번호 · 처리 상태와 메시지 ·
      체결 내역) — <strong>운영자가 허용한 사용자 본인만</strong> 해당합니다
    </>,
    '데이터베이스(Supabase, 서버 전용 접근)',
    '주문·체결 확인',
    '3절 참조',
  ],
  [
    <>
      기기 저장(최근 검색어 · 작업대 화면 배치 · 알림음 설정 · 알림을 이미 울렸거나 닫은 종목
      기록 · 목록 열 수 · 화면 테마) — <strong>서버로 보내지 않습니다</strong>
    </>,
    '이용자 기기의 브라우저·앱 저장소',
    '이용 편의',
    '이용자가 지우거나 앱을 삭제할 때까지',
  ],
  ['로그인 세션 쿠키', '이용자 기기의 브라우저·앱', '로그인 상태 유지', '로그아웃하거나 만료될 때까지'],
  [
    '앱 설정(화면 테마)',
    '이용자 기기의 iOS·Android 앱 저장소',
    '앱 첫 화면을 선택한 테마로 표시',
    '앱을 삭제할 때까지',
  ],
  ['오프라인 안내 화면', '앱 안', '네트워크가 없을 때 안내 표시', '개인정보를 수집하지 않습니다'],
  [
    '접속 기록(IP 주소 · 접속 시각 · 요청한 주소 · 브라우저·기기 정보 · 로그인 기록) — 서비스 이용 중 자동으로 생성됩니다',
    '서버·호스팅 로그(Google Cloud · Vercel · Supabase)',
    '오류 분석 · 보안 · 과도한 요청 제한',
    '각 호스팅 사업자의 기본 로그 보관 기간이 지나면 자동 삭제(3절 참조)',
  ],
];

const TRUSTEE_ROWS: ReactNode[][] = [
  ['Supabase, Inc.', '데이터베이스 운영, 회원 인증(데이터는 서울 리전에 저장)'],
  ['Vercel Inc.', '웹 서비스 호스팅'],
  ['Google LLC (Google Cloud)', 'API 서버·실시간 중계 서버 운영, 서버 로그 보관'],
  ['Google LLC', 'Google 계정 로그인 인증'],
  ['Anthropic, PBC', 'AI 답변 생성'],
];

const TRANSFER_ROWS: ReactNode[][] = [
  [
    'Anthropic, PBC',
    '미국',
    'AI 애널리스트 질문 내용과 대화 맥락',
    '질문할 때마다 암호화된 네트워크로 전송',
    'AI 답변 생성 · Anthropic 은 API 로 받은 입력과 출력을 기본적으로 모델 학습에 사용하지 않으며, 받은 뒤 30일 이내에 자동으로 삭제합니다. 다만 사용 정책 집행이나 법률 준수에 필요한 경우 더 오래 보관될 수 있습니다.',
    'privacy@anthropic.com',
  ],
  [
    'Vercel Inc.',
    '미국 등 Vercel 이 운영하는 국가(웹 처리 지역은 대한민국 서울)',
    '접속 기록',
    '서비스 이용 시 암호화된 네트워크로 전송',
    '웹 서비스 호스팅 · 런타임 로그 1시간 보관',
    'privacy@vercel.com',
  ],
  [
    'Google LLC (Google Cloud)',
    'Google 의 글로벌 로그 저장소(국가 특정 불가, 서버는 대한민국 서울)',
    '접속 기록(서버 로그)',
    '서비스 이용 시 암호화된 네트워크로 전송',
    '서버 운영 · 30일 보관(감사 로그는 400일)',
    'Google 개인정보 보호 도움말 센터 문의 페이지(https://support.google.com/policies)',
  ],
];

export default function PrivacyPage() {
  return (
    <CenterShell>
      <article className="space-y-10 break-words">
        <header className="space-y-3">
          <h1 className="text-[length:var(--t-h1)] font-bold">개인정보처리방침</h1>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">시행일: {EFFECTIVE_DATE}</p>
          <p className={P}>
            GH Trade 운영자(이하 &quot;운영자&quot;)는 GH Trade(웹 https://trade.jx1.io 와 iOS·Android
            앱, 이하 &quot;서비스&quot;)를 이용하시는 분의 개인정보를 「개인정보 보호법」에 따라
            보호하고, 이와 관련한 고충을 신속하고 원활하게 처리하기 위하여 다음과 같이
            개인정보처리방침을 둡니다. iOS·Android 앱은 같은 웹 서비스를 앱 화면으로 여는
            방식이므로, 이 방침은 웹과 앱에 똑같이 적용됩니다.
          </p>
        </header>

        <Section n={1} title="개인정보의 처리 목적">
          <p className={P}>
            운영자는 다음 목적을 위하여 개인정보를 처리합니다. 처리한 개인정보는 다음 목적 외의
            용도로는 이용하지 않으며, 이용 목적이 바뀌는 경우에는 「개인정보 보호법」 제18조에 따라
            별도의 동의를 받는 등 필요한 조치를 이행합니다.
          </p>
          <ol className={OL}>
            <li>
              <strong>회원 식별과 로그인</strong> — Google 계정으로 로그인하고 로그인 상태를
              유지합니다.
            </li>
            <li>
              <strong>서비스 기능 제공</strong> — 관심종목, 직접 만든 테마, AI 애널리스트 대화
              기록을 저장하고 다시 보여 드립니다.
            </li>
            <li>
              <strong>AI 답변 생성</strong> — 이용자가 입력한 질문을 AI 처리 사업자에게 보내
              답변을 만듭니다.
            </li>
            <li>
              <strong>주식 주문 중계(운영자가 허용한 사용자 본인에 한함)</strong> — 허용 사용자
              본인의 증권 계좌 주문을 전달하고, 주문·체결 결과를 보여 드립니다.
            </li>
            <li>
              <strong>서비스 안정성과 보안</strong> — 접속 기록으로 오류를 분석하고, 과도한 요청을
              제한합니다.
            </li>
          </ol>
        </Section>

        <Section n={2} title="처리하는 개인정보 항목">
          <p className={P}>
            서비스는 별도의 회원가입 입력 항목이 없으며, Google 계정 로그인과 서비스 이용 과정에서
            다음 항목을 처리합니다.
          </p>
          <PolicyTable
            head={['항목', '저장 위치', '목적', '보유 기간']}
            rows={ITEM_ROWS}
            minWidth="min-w-[640px]"
          />
          <p className={P}>운영자는 주민등록번호 등 고유식별정보와 민감정보를 처리하지 않습니다.</p>
        </Section>

        <Section n={3} title="보유 및 이용 기간">
          <ol className={OL}>
            <li>
              운영자는 원칙적으로 이용자가 계정 삭제를 요청하여 처리될 때까지 개인정보를 보유하고,
              처리 후에는 지체 없이 파기합니다.
            </li>
            <li>
              계정을 삭제하면 Google 계정 정보, 관심종목, 직접 만든 테마, AI 애널리스트 대화 기록,
              DMA 계정 정보, 이용자 기준 주문 기록이 함께 삭제됩니다.
            </li>
            <li>
              AI 애널리스트 대화 기록은 자동 삭제 주기를 두지 않으며 계정 삭제 시까지 보관합니다.
            </li>
            <li>
              계좌 기준으로 저장되는 주문·체결 기록은 계정 삭제와 함께 지워지지 않으며, 운영자가
              매매 내역 확인에 필요한 기간 동안 보관하고, 허용 사용자가 삭제를 요청하면 파기합니다.
            </li>
            <li>
              접속 기록은 각 호스팅 사업자의 기본 로그 보관 기간이 지나면 자동으로 삭제됩니다. 예를
              들어 Google Cloud 의 기본 로그는 30일(감사 로그는 400일), Vercel 의 런타임 로그는
              1시간 동안 보관됩니다.
            </li>
            <li>
              기기 저장 정보와 세션 쿠키는 이용자가 지우거나 만료될 때까지 이용자의 기기에만
              남습니다.
            </li>
          </ol>
        </Section>

        <Section n={4} title="제3자 제공">
          <p className={P}>
            운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 운영자가 허용한 사용자 본인이
            주식 주문을 내면, 그 주문은 본인의 지시에 따라 본인이 계좌를 개설한 증권회사로
            전달됩니다.
          </p>
        </Section>

        <Section n={5} title="처리 위탁">
          <p className={P}>
            운영자는 원활한 서비스 제공을 위하여 다음과 같이 개인정보 처리 업무를 위탁합니다. 위탁
            시 「개인정보 보호법」 제26조에 따라 위탁 업무 수행 목적 외 처리 금지, 안전성 확보 조치
            등을 정하고, 수탁자가 개인정보를 안전하게 처리하는지 감독합니다. 위탁 업무의 내용이나
            수탁자가 바뀌면 이 방침을 통해 알려 드립니다.
          </p>
          <PolicyTable head={['수탁자', '위탁 업무']} rows={TRUSTEE_ROWS} />
        </Section>

        <Section n={6} title="국외 이전">
          <p className={P}>
            운영자는 「개인정보 보호법」 제28조의8에 따라 다음과 같이 개인정보를 국외로 이전합니다.
          </p>
          <PolicyTable
            head={[
              '이전받는 자',
              '이전 국가',
              '이전 항목',
              '이전 시기와 방법',
              '이용 목적과 보유 기간',
              '연락처',
            ]}
            rows={TRANSFER_ROWS}
            minWidth="min-w-[820px]"
          />
          <p className={P}>
            국외 이전을 원하지 않으시면 AI 애널리스트 기능을 사용하지 않거나 계정 삭제를 요청하실
            수 있습니다. 다만 이 경우 해당 기능을 이용하실 수 없습니다.
          </p>
        </Section>

        <Section n={7} title="정보주체의 권리와 행사 방법">
          <ol className={OL}>
            <li>
              이용자는 운영자에게 언제든지 개인정보 열람, 정정, 삭제, 처리정지를 요구할 수
              있습니다.
            </li>
            <li>
              서비스 안에는 계정 삭제(회원 탈퇴) 기능이 없습니다. 계정 삭제를 포함한 위 요구는
              11절의 연락처로 요청해 주시면, 본인 확인을 거쳐 10일 이내에 처리하고 결과를 알려
              드립니다.
            </li>
            <li>관심종목과 직접 만든 테마는 서비스 화면에서 직접 지울 수 있습니다.</li>
            <li>권리 행사는 법정대리인이나 위임을 받은 사람 등 대리인을 통해서도 할 수 있습니다.</li>
            <li>다른 법령에서 보관하도록 정한 개인정보는 삭제를 요구할 수 없습니다.</li>
          </ol>
        </Section>

        <Section n={8} title="파기 절차와 방법">
          <ol className={OL}>
            <li>
              운영자는 보유 기간이 지나거나 처리 목적이 달성된 경우, 또는 이용자가 삭제를 요청한
              경우 지체 없이 해당 개인정보를 파기합니다.
            </li>
            <li>
              전자적 파일 형태의 개인정보는 데이터베이스에서 복구할 수 없는 방법으로 삭제합니다.
              운영자는 종이 문서로 개인정보를 처리하지 않습니다.
            </li>
            <li>데이터베이스 백업에 남은 사본은 백업 보관 주기가 지나면 자동으로 지워집니다.</li>
          </ol>
        </Section>

        <Section n={9} title="안전성 확보 조치">
          <p className={P}>운영자는 개인정보의 안전성 확보를 위해 다음 조치를 하고 있습니다.</p>
          <ol className={OL}>
            <li>
              <strong>전송 구간 암호화</strong> — 서비스와 주고받는 모든 통신은 HTTPS·WSS 로
              암호화합니다.
            </li>
            <li>
              <strong>DMA 비밀번호 암호화 저장</strong> — DMA 계정 비밀번호는 AES-256-GCM 방식으로
              암호화하여 저장합니다.
            </li>
            <li>
              <strong>접근 통제</strong> — 데이터베이스 행 수준 보안(RLS)으로 이용자 본인의
              데이터에만 접근할 수 있게 하고, DMA 계정 정보와 주문 기록은 서버 전용 권한으로만
              접근합니다.
            </li>
            <li>
              <strong>접근 권한 최소화</strong> — 개인정보에 접근할 수 있는 사람을 운영자로
              한정하고, 서버 비밀 값은 클라우드 비밀 관리 서비스에 보관합니다.
            </li>
          </ol>
        </Section>

        <Section n={10} title="쿠키와 기기 저장소">
          <ol className={OL}>
            <li>
              서비스는 로그인 상태를 유지하기 위해 세션 쿠키를 사용합니다. 광고·추적 목적의 쿠키는
              사용하지 않으며, 분석 도구나 광고 도구를 설치하지 않았습니다.
            </li>
            <li>
              서비스는 이용 편의를 위해 이용자 기기의 브라우저·앱 저장소에 최근 검색어, 작업대 화면
              배치, 알림음 설정, 알림을 이미 울렸거나 닫은 종목 기록, 목록 열 수, 화면 테마를
              저장합니다. 이 정보는 서버로 보내지 않습니다.
            </li>
            <li>
              이용자는 브라우저 설정에서 쿠키와 사이트 데이터를 지우거나 앱을 삭제하여 이 정보를
              지울 수 있습니다. 세션 쿠키를 거부하면 로그인이 필요한 기능을 이용할 수 없습니다.
            </li>
          </ol>
        </Section>

        <Section n={11} title="개인정보 보호책임자와 연락처">
          <p className={P}>
            운영자는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 이와 관련한 이용자의 불만
            처리와 피해 구제를 위하여 다음과 같이 개인정보 보호책임자를 지정하고 있습니다.
          </p>
          <ul className={UL}>
            <li>개인정보 보호책임자: GH Trade 운영자</li>
            <li>
              연락처:{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-[var(--primary)] underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
          <p className={P}>
            개인정보 침해에 대한 신고나 상담이 필요하시면 아래 기관에 문의하실 수 있습니다.
          </p>
          <ul className={UL}>
            <li>개인정보침해신고센터: privacy.kisa.or.kr / 국번 없이 118</li>
            <li>개인정보분쟁조정위원회: www.kopico.go.kr / 1833-6972</li>
            <li>대검찰청 사이버수사과: www.spo.go.kr / 국번 없이 1301</li>
            <li>경찰청 사이버수사국: ecrm.police.go.kr / 국번 없이 182</li>
          </ul>
        </Section>

        <Section n={12} title="방침 변경 고지">
          <p className={P}>
            이 개인정보처리방침의 내용을 추가·삭제·수정하는 경우에는 시행 7일 전부터 이 페이지를
            통해 알려 드립니다.
          </p>
        </Section>

        <Section n={13} title="시행일">
          <p className={P}>이 개인정보처리방침은 {EFFECTIVE_DATE}부터 시행합니다.</p>
        </Section>
      </article>
    </CenterShell>
  );
}
