import "@repo/core/styles/globals.css";

import { ThemeProvider } from "@repo/core/components/providers/theme-provider";
import { cn } from "@repo/core/lib/utils";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ASCII Art",
  description: "ASCII Ocean showcase: every scene and species, drawn in text.",
  robots: {
    index: false,
  },
};

/** Root layout: global styles, fonts and theme for every page of the experiment. */
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
      <body className="min-h-full" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
