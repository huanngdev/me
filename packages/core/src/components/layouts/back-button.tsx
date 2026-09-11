"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "../button";

type BackButtonProps = {
  href?: string;
};

export function BackButton({ href }: BackButtonProps) {
  const router = useRouter();

  if (href) {
    return (
      <Button variant="outline" asChild>
        <Link href={href} replace>
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="outline" onClick={() => router.back()}>
      <ArrowLeft className="size-4" />
      Back
    </Button>
  );
}
