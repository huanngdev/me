import { PageHeaderSkeleton } from "@repo/core/components/layouts/page-header-skeleton";
import { Skeleton } from "@repo/core/components/skeleton";

export default function AudioPlayerLoading() {
  return (
    <>
      <PageHeaderSkeleton description />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-14 w-full rounded-full" />
      </article>
    </>
  );
}
