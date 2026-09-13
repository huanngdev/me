"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ETC_ITEMS, NAV_ITEMS } from "../../constants";
import { Button } from "../button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "../navigation-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../sheet";

const ETC_DESCRIPTIONS: Record<string, string> = {
  "/changelog": "A concise history of the portfolio's latest features and improvements.",
};

export function NavMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="hidden h-full items-center sm:flex">
        {NAV_ITEMS.map((item) => (
          <Button key={item.href} asChild variant="ghost">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}

        <NavigationMenu viewport={false} className="h-full flex-none">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Etc</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-2 md:w-[500px] md:grid-cols-2">
                  {ETC_ITEMS.map((item) => (
                    <li key={item.href}>
                      <NavigationMenuLink asChild className="h-full">
                        <Link href={item.href}>
                          <div className="flex items-start gap-2.5 text-sm">
                            <item.icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                            <div className="flex min-w-0 flex-col gap-1">
                              <div className="leading-none font-medium">{item.label}</div>
                              <div className="text-muted-foreground line-clamp-2">
                                {ETC_DESCRIPTIONS[item.href]}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open menu" className="sm:hidden">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <SheetTitle className="border-b px-4 py-3 text-base font-semibold">Menu</SheetTitle>
          <nav className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="hover:bg-accent flex items-center gap-3 px-4 py-3 text-sm"
              >
                <item.icon className="text-muted-foreground size-4" />
                {item.label}
              </Link>
            ))}
            <span className="text-muted-foreground border-t px-4 pt-3 pb-1 font-mono text-xs tracking-wide uppercase">
              Etc
            </span>
            {ETC_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="hover:bg-accent flex items-center gap-3 px-4 py-3 text-sm"
              >
                <item.icon className="text-muted-foreground size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
