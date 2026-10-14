import "@repo/core/styles/globals.css";

import { ThemeProvider } from "@repo/core/components/providers/theme-provider";
import { TooltipProvider } from "@repo/core/components/tooltip";
import { cn } from "@repo/core/lib/utils";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    // The root page sets its own absolute title; this is the fallback for a page that sets none.
    default: SITE.title,
    // Applies to child segments only, so a doc title is `<seoTitle> — richcn`.
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    "notion-like editor react",
    "shadcn rich text editor",
    "block editor react",
    "plate editor shadcn",
    "wysiwyg editor nextjs",
    "slash command editor",
    "tailwind rich text editor",
    "platejs",
    "shadcn/ui",
    "richcn",
  ],
  authors: [{ name: SITE.author.name, url: SITE.author.url }],
  creator: SITE.author.name,
  category: "Developer Tools",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_US",
    url: "/",
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

/** The light background is `oklch(1 0 0)` and the dark one `oklch(0.145 0 0)` in the app styles. */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
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
