import { cn } from "@repo/core/lib/utils";
import { Cookie } from "next/font/google";
import Image from "next/image";

import { SITE } from "@/lib/site";

const cookie = Cookie({ subsets: ["latin"], weight: "400" });

// The Buy Me a Coffee button, drawn in the app with the cup from public/. The cup
// is white with a black outline, the same as the official button. The label is
// hidden on small screens, and the link keeps its name through aria-label.
export function BuyMeACoffee() {
  return (
    <a
      href={SITE.coffeeUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a coffee"
      className={cn(
        cookie.className,
        "focus-visible:outline-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] bg-[#FFDD00] px-2 text-lg leading-none text-black transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-3",
      )}
    >
      <Image
        src="/bmc-logo.svg"
        alt=""
        width={884}
        height={1279}
        unoptimized
        className="h-4 w-auto"
      />
      <span className="hidden sm:inline">Buy me a coffee</span>
    </a>
  );
}
