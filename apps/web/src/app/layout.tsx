import "@repo/core/styles/globals.css";

import { ThemeProvider } from "@repo/core/components/theme-provider";
import { cn } from "@repo/core/lib/utils";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { Header } from "@/components/header";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Chris — Fullstack TypeScript developer",
  description: "Portfolio of Chris (Ngô Gia Huấn), fullstack engineer based in Ho Chi Minh City.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased", inter.variable, fontMono.variable, "font-sans")}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <Header />
          <main className="flex-1">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
