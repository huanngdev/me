"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "../button";

export function BackButton() {
  const router = useRouter();

  return (
    <Button variant="outline" onClick={() => router.back()}>
      <ArrowLeft className="size-4" />
      Back
    </Button>
  );
}
