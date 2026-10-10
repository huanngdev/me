import { Skeleton } from "@/components/skeleton";

export function EditorDocumentSkeleton() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[700px] min-w-0 flex-col gap-3 py-8 sm:py-12">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="mt-4 h-4 w-full" />
    </div>
  );
}
