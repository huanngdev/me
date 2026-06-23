"use client";

import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ETC_ITEMS, NAV_ITEMS } from "../../constants";
import { Button } from "../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../sheet";

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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">
              etc
              <ChevronDown className="ml-1 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {ETC_ITEMS.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>
                  <item.icon className="text-muted-foreground size-4" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
              etc
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
