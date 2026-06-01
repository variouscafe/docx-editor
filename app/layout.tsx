import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DOCX Editor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div id="root" style={{ width: "100%", minWidth: 1440, height: "100vh", overflow: "hidden" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
