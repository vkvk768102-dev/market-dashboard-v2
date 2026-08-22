export const metadata = {
  title: "시장 지표 대시보드",
  description: "정크본드 · 미국 경제지표 · 엔화 캐리트레이드 · 유동성 지표",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
