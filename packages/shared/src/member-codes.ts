/**
 * Phase 28 (28-07) — 증권사 회원번호 → 회원사명 표 (카드 탭 「상한가」 창구 칸 · kind 15 문장 · 보고서 공용).
 *
 * 출처: gh-trade `client/Services/Data/MemberCodes.cs` 의 `_members` 사전을 C# 순서 그대로 옮겼다. 그 파일의 출처 주석:
 * 「교보 memcode.dat + KB ExpertPlus TRDCODE.mst (2026-09-04 대조, quick-260904-fi6 후속) — 외국계 여부는 두 마스터가
 * 다를 때 KB 표기를 따른다 (00074·00076·00078)」.
 *
 * WinForms 동형(28-UI-SPEC R-3) — 두 클라가 같은 단어(「키움증권」 꼴 전체 이름)를 쓴다. 이름을 줄이지 않는다.
 * **gh-trade 쪽 표가 바뀌면 이 표도 같이 바꾼다**(키 대조: 28-07 SUMMARY 의 grep 대조 명령).
 */

/** 회원사 정보 — 이름 · 외국계 여부(C# `MemberInfo`). */
export type MemberInfo = { name: string; foreign: boolean };

/** 5자리 회원번호 → 회원사 정보 (C# `_members` 사전 순서 그대로). */
export const MEMBER_CODES: Readonly<Record<string, MemberInfo>> = {
  "99999": { name: "외국계전체", foreign: true },
  "00001": { name: "교보증권", foreign: false },
  "00002": { name: "신한증권", foreign: false },
  "00003": { name: "한국증권", foreign: false },
  "00004": { name: "대신증권", foreign: false },
  "00005": { name: "미래에셋증권", foreign: false },
  "00006": { name: "신영증권", foreign: false },
  "00008": { name: "유진증권", foreign: false },
  "00009": { name: "한양증권", foreign: false },
  "00010": { name: "메리츠", foreign: false },
  "00012": { name: "NH투자증권", foreign: false },
  "00013": { name: "부국증권", foreign: false },
  "00017": { name: "KB증권", foreign: false },
  "00021": { name: "한화투자", foreign: false },
  "00022": { name: "현대차증권", foreign: false },
  "00023": { name: "유화증권", foreign: false },
  "00024": { name: "유안타증권", foreign: false },
  "00025": { name: "SK증권", foreign: false },
  "00029": { name: "상상인", foreign: false },
  "00030": { name: "삼성증권", foreign: false },
  "00031": { name: "DB증권", foreign: false },
  "00033": { name: "JP모간", foreign: true },
  "00035": { name: "맥쿼리", foreign: true },
  "00036": { name: "모간서울", foreign: true },
  "00037": { name: "씨티그룹", foreign: true },
  "00038": { name: "크레디아그리콜", foreign: true },
  "00040": { name: "HSBC증권", foreign: true },
  "00041": { name: "씨엘", foreign: true },
  "00042": { name: "CS증권", foreign: true },
  "00043": { name: "UBS", foreign: true },
  "00044": { name: "메릴린치", foreign: true },
  "00045": { name: "골드만", foreign: true },
  "00046": { name: "iM증권", foreign: false },
  "00048": { name: "에스지", foreign: true },
  "00050": { name: "키움증권", foreign: false },
  "00052": { name: "리딩투자", foreign: false },
  "00054": { name: "노무라", foreign: true },
  "00056": { name: "하나증권", foreign: false },
  "00058": { name: "도이치", foreign: true },
  "00061": { name: "다이와", foreign: true },
  "00063": { name: "LS증권", foreign: false },
  "00064": { name: "코리아에셋", foreign: false },
  "00066": { name: "흥국증권", foreign: false },
  "00067": { name: "비엔피", foreign: true },
  "00068": { name: "IBK증권", foreign: false },
  "00069": { name: "카카오페이증권", foreign: false },
  "00070": { name: "디에스", foreign: false },
  "00071": { name: "다올투자증권", foreign: false },
  "00072": { name: "케이프투자증권", foreign: false },
  "00074": { name: "스탠차증권", foreign: true },
  "00076": { name: "씨지에스", foreign: true },
  "00077": { name: "토스증권", foreign: false },
  "00078": { name: "한국아이엠씨", foreign: true },
  "00079": { name: "우리투자증권", foreign: false },
  "00082": { name: "NH선물", foreign: false },
  "00084": { name: "삼성선물", foreign: false },
  "00085": { name: "유진선물", foreign: false },
  "00086": { name: "BNK증권", foreign: false },
  "00088": { name: "KR투자증권", foreign: false },
  "00089": { name: "넥스트증권", foreign: false },
  "00559": { name: "중국은행", foreign: false },
};

/**
 * 회원번호 → 회원사명 (C# `MemberCodes.GetMemberName`). 빈 값 → 「」 · 앞뒤 공백 제거 · 6자리(S02)면 앞 5자리 ·
 * 표에 없으면 다듬은 코드 그대로.
 */
export function memberName(code: string): string {
  if (!code) return "";
  let c = code.trim();
  if (c.length === 6) c = c.slice(0, 5);
  return Object.prototype.hasOwnProperty.call(MEMBER_CODES, c) ? MEMBER_CODES[c]!.name : c;
}
