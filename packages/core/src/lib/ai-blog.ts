import "server-only";

import OpenAI from "openai";
import { db } from "../db";
import { blogPosts } from "../db/schema";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

const NEWS_PROMPT = `Write a comprehensive tech news summary blog post covering the most notable developments in web development, AI, and developer tools from the past week.

Format the output as a JSON object with these fields:
- title: a catchy, specific title (max 90 chars)
- excerpt: a one-sentence summary that makes people want to read (max 180 chars)
- tags: array of 3-5 relevant tags (lowercase, no spaces, use hyphens)
- content: the full blog post in Markdown format

The content should:
- Start with a brief introduction (2-3 sentences)
- Have 4-6 sections covering different stories, each with a ## heading
- End with a "Worth your time" list of 3-5 links or tools mentioned
- Be specific — mention actual product names, version numbers, and release dates when possible
- Be useful to a fullstack TypeScript developer building with Next.js and shadcn/ui
- Read like a polished technical article on Medium or dev.to, not a plain AI summary
- Include practical details: tradeoffs, migration notes, commands, or code snippets where useful
- Use fenced code blocks with a language label for real examples, e.g. \`\`\`tsx, \`\`\`bash, or \`\`\`json
- Include a \`\`\`tree fenced block when explaining project structure or file placement
- Use tables or blockquotes sparingly when they make the article easier to scan
- Avoid generic filler, hype, and placeholder links

Return ONLY valid JSON, no other text.`;

export interface AiBlogResult {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
}

export async function generateBlogPost(topic?: string): Promise<AiBlogResult> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is required to generate blog posts");
  }

  const client = new OpenAI({
    baseURL: `${DEEPSEEK_BASE_URL}/v1`,
    apiKey: DEEPSEEK_API_KEY,
  });

  const prompt = topic
    ? `Write a professional blog post about: ${topic}\n\n${NEWS_PROMPT.replace("tech news summary", "blog post")}`
    : NEWS_PROMPT;

  const response = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a senior fullstack developer writing for a technical audience. Be specific, direct, and avoid fluff. Cite real products and versions.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from DeepSeek");

  let parsed: AiBlogResult;
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(cleaned) as AiBlogResult;
  } catch {
    throw new Error(`Failed to parse AI response as JSON: ${raw.slice(0, 200)}`);
  }

  if (!parsed.title || !parsed.content) {
    throw new Error("AI response missing required fields (title, content)");
  }

  return {
    title: parsed.title,
    slug: slugify(parsed.title),
    excerpt: parsed.excerpt ?? "",
    content: parsed.content,
    tags: parsed.tags ?? [],
  };
}

export async function writeAndSaveBlogPost(
  topic?: string,
): Promise<{ slug: string; title: string }> {
  const result = await generateBlogPost(topic);

  const [saved] = await db
    .insert(blogPosts)
    .values({
      title: result.title,
      slug: result.slug,
      content: result.content,
      excerpt: result.excerpt,
      tags: result.tags,
      aiGenerated: true,
    })
    .returning({ slug: blogPosts.slug, title: blogPosts.title });

  if (!saved) throw new Error("Failed to save blog post");

  return saved;
}
