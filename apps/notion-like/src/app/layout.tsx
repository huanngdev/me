import "@repo/core/styles/globals.css";

import { ThemeProvider } from "@repo/core/components/providers/theme-provider";
import { TooltipProvider } from "@repo/core/components/tooltip";
import { cn } from "@repo/core/lib/utils";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Notion-like editor",
  description:
    "A Notion-style block editor built on Plate and shadcn primitives, shown on its own.",
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
          <TooltipProvider>
            <SiteHeader />
            <main className="flex flex-1 flex-col">{children}</main>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
