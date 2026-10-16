"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { NAV_ITEMS } from "../../constants";
import { Button } from "../button";
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
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
