import "@repo/core/styles/globals.css";

import { Header } from "@repo/core/components/layouts/header";
import { ScrollProgress } from "@repo/core/components/layouts/scroll-progress";
import { ThemeProvider } from "@repo/core/components/providers/theme-provider";
import { IDENTITY, PUBLIC_PORTFOLIO_URL } from "@repo/core/constants";
import { cn } from "@repo/core/lib/utils";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Caveat, Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@repo/core/components/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const fontHandwriting = Caveat({
  subsets: ["latin"],
  variable: "--font-handwriting",
});

const SITE_NAME = IDENTITY.fullName;
const SITE_DESCRIPTION =
  "Ngô Gia Huấn (Ngo Gia Huan) is a fullstack TypeScript developer in Ho Chi Minh City building Next.js products, developer tools, and Sui applications.";
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_PORTFOLIO_URL),
  title: {
    default: `${SITE_NAME} (Ngo Gia Huan) — Fullstack Developer`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: PUBLIC_PORTFOLIO_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: [
    "Ngô Gia Huấn",
    "Ngo Gia Huan",
    "huanngdev",
    "Fullstack engineer",
    "Frontend engineer",
    "Backend engineer",
    "TypeScript",
    "Next.js",
    "React",
    "Node.js",
    "Sui blockchain",
    "Web3",
    "Ho Chi Minh City",
    "Vietnam",
    "Portfolio",
  ],
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: PUBLIC_PORTFOLIO_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} (Ngo Gia Huan) — Fullstack Developer`,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} (Ngo Gia Huan) — Fullstack Developer`,
    description: SITE_DESCRIPTION,
    creator: "@huanngdev",
    site: "@huanngdev",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  verification: googleSiteVerification ? { google: googleSiteVerification } : undefined,
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
      className={cn(
        "h-full antialiased",
        inter.variable,
        fontMono.variable,
        fontHandwriting.variable,
        "font-sans",
      )}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <ScrollProgress />
            <Header />
            <main className="mt-1 flex flex-1 flex-col">{children}</main>
          </TooltipProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
