import "@repo/core/styles/globals.css";

import { Header } from "@repo/core/components/layouts/header";
import { ThemeProvider } from "@repo/core/components/providers/theme-provider";
import { cn } from "@repo/core/lib/utils";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@repo/core/components/tooltip";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const SITE_URL = "https://huanngdev.site";
const SITE_NAME = "Ngo Gia Huan";
const SITE_DESCRIPTION =
  "Fullstack engineer in Ho Chi Minh City. Building Next.js products in TypeScript, with occasional detours into Sui blockchain.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Fullstack TypeScript developer`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: [
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
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Fullstack TypeScript developer`,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Fullstack TypeScript developer`,
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
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Ngo Gia Huan",
  alternateName: "Ngô Gia Huấn",
  url: SITE_URL,
  image: `${SITE_URL}/opengraph-image.png`,
  jobTitle: "Fullstack Engineer",
  email: "mailto:huanngdev@gmail.com",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Ho Chi Minh City",
    addressCountry: "VN",
  },
  sameAs: [
    "https://github.com/huanngdev",
    "https://www.linkedin.com/in/huanngdev/",
    "https://x.com/huanngdev",
    "https://www.facebook.com/huanngdev/",
  ],
  knowsAbout: ["TypeScript", "Next.js", "React", "Node.js", "Sui blockchain", "Web3"],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
        <ThemeProvider>
          <TooltipProvider>
            <Header />
            <main className="flex-1">{children}</main>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
