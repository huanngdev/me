import { db } from "@repo/core/db";
import { blogPosts } from "@repo/core/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import { TriggerAiPostButton } from "@repo/core/components/layouts/trigger-ai-post";
import { StaggerList, StaggerListItem } from "@repo/core/components/reveal";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog",
  description: "Thoughts on web dev, TypeScript, and building things.",
};

const isDev = process.env.NODE_ENV === "development";

export default async function BlogPage() {
  const posts = await db
    .select({
      title: blogPosts.title,
      slug: blogPosts.slug,
      excerpt: blogPosts.excerpt,
      tags: blogPosts.tags,
      publishedAt: blogPosts.publishedAt,
    })
    .from(blogPosts)
    .orderBy(desc(blogPosts.publishedAt));

  return (
    <>
      <PageHeader title="Blog" actions={isDev ? <TriggerAiPostButton /> : undefined} />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        {posts.length === 0 ? (
          <p className="text-muted-foreground px-4 py-12 text-center text-sm sm:px-6 lg:px-8">
            No posts yet.
          </p>
        ) : (
          <StaggerList className="divide-y">
            {posts.map((post) => (
              <StaggerListItem key={post.slug} className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-base font-semibold hover:underline"
                >
                  {post.title}
                </Link>
                {post.excerpt && (
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed italic">
                    {post.excerpt}
                  </p>
                )}
                <div className="text-muted-foreground/70 mt-3 flex items-center gap-3 text-xs">
                  <time dateTime={post.publishedAt.toISOString()}>
                    {post.publishedAt.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                  {post.tags.length > 0 && (
                    <span className="flex gap-1.5">
                      {post.tags.map((t) => (
                        <span
                          key={t}
                          className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </StaggerListItem>
            ))}
          </StaggerList>
        )}
      </article>
    </>
  );
}
