import { db } from "@repo/core/db";
import { blogPosts } from "@repo/core/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@repo/core/components/layouts/page-header";
import { Renderer, marked } from "marked";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

const renderer = new Renderer();

renderer.code = (token) => {
  const languageInfo = token.lang?.trim() ?? "";
  const [language = "text", ...meta] = languageInfo.split(/\s+/).filter(Boolean);
  const filename = meta.join(" ");
  const label = filename || language;
  const escapedCode = escapeHtml(token.text);

  if (["tree", "filetree", "files"].includes(language.toLowerCase())) {
    return `<figure class="doc-file-tree"><figcaption>${escapeHtml(label === language ? "Project structure" : label)}</figcaption><pre><code>${escapedCode}</code></pre></figure>`;
  }

  return `<figure class="doc-code"><figcaption><span aria-hidden="true" class="doc-code-dots"><i></i><i></i><i></i></span><span>${escapeHtml(label)}</span></figcaption><pre><code class="language-${escapeHtml(language)}">${escapedCode}</code></pre></figure>`;
};

renderer.blockquote = (token) =>
  `<blockquote class="doc-callout">${renderer.parser.parse(token.tokens)}</blockquote>`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await db
    .select({ title: blogPosts.title, excerpt: blogPosts.excerpt })
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);

  if (!post.length) return { title: "Not found" };
  return {
    title: post[0].title,
    description: post[0].excerpt ?? undefined,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const rows = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);

  if (!rows.length) notFound();
  const post = rows[0];

  const html = await marked(post.content, { breaks: true, gfm: true, renderer });

  return (
    <>
      <PageHeader title={post.title} />
      <article className="mx-auto flex w-full max-w-4xl flex-1 flex-col border-x">
        <div className="px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
          <div className="mb-3 flex items-center gap-3">
            <time
              dateTime={post.publishedAt.toISOString()}
              className="text-muted-foreground font-mono text-xs"
            >
              {post.publishedAt.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </div>
          {post.tags.length > 0 && (
            <div className="mb-10 flex flex-wrap gap-1.5">
              {post.tags.map((t) => (
                <span key={t} className="bg-muted rounded px-2 py-0.5 font-mono text-[11px]">
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="doc-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </article>
    </>
  );
}
