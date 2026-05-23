"use client";

import { ErrorScreen } from "@repo/core/components/layouts/error-screen";
import { Button } from "@repo/core/components/button";
import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      code={500}
      message="Something went wrong"
      description="An unexpected error occurred while rendering this page. You can try again or head back home."
      action={
        <>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back home
            </Link>
          </Button>
        </>
      }
    />
  );
}
