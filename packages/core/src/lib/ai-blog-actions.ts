"use server";

import { revalidatePath } from "next/cache";
import { writeAndSaveBlogPost } from "./ai-blog";

export async function triggerAiPost(topic?: string): Promise<{
  ok: boolean;
  slug?: string;
  title?: string;
  error?: string;
}> {
  try {
    const result = await writeAndSaveBlogPost(topic);
    revalidatePath("/blog");
    return { ok: true, slug: result.slug, title: result.title };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  }
}
