/**
 * The FAQ questions and answers. Kept here rather than in the page so other surfaces (the FAQ
 * page, and structured data in the SEO pass) can read the same list.
 */

export type FaqEntry = {
  question: string;
  /** One to three sentences, from the editor's README and source. */
  answer: string;
};

export const FAQ = [
  {
    question: "Does the editor work with Vite?",
    answer:
      "Yes. It needs React 19, Tailwind CSS v4 and shadcn with Radix primitives, and nothing in it needs Next.js. The registry is tested with shadcn 4.21.4 on both Next.js and Vite.",
  },
  {
    question: "Can I use it without Next.js?",
    answer:
      "Yes, in any React 19 project that can build the shadcn components it depends on. The editor has no server requirement; only the read-only renderer is designed to run on a server, and it also runs in the browser.",
  },
  {
    question: "Does it support Base UI?",
    answer:
      "No. The block renders the Radix component APIs, and a shadcn project styled for Base UI does not compile without changes.",
  },
  {
    question: "How do I save a document to my database?",
    answer:
      "Implement EditorPersistenceAdapter, with load, save, saveRecovery and an optional subscribe, and pass it as the adapter prop. The editor autosaves 800 ms after the last change and sends the revision it edited from, so your API can reject a stale write with a conflict.",
  },
  {
    question: "How do I upload images and other files?",
    answer:
      "Pass a FileUploadAdapter whose upload returns an object with a url. Without one there is no upload function: dropped and pasted files are rejected with a notice, and only http, https or root-relative URLs are shown.",
  },
  {
    question: "Is there live collaboration or AI?",
    answer:
      "Neither. There is no presence and no suggestion engine. A document saved by someone else while the editor is open is reported as a conflict, and the user is asked to reload; the local copy is written to recovery storage first.",
  },
  {
    question: "How do I render the content read-only on the server?",
    answer:
      'Render NotionLikeEditorStatic with the saved EditorValue. It has no hooks and no "use client" directive, so a server component can render it, and it takes no adapters and no onChange. It has no width of its own, so set one on the element around it.',
  },
  {
    question: "How do I disable tables?",
    answer:
      "Pass features={{ tables: false }}. The table entries disappear from the slash menu, the Add menu and Turn into, and a pasted HTML table becomes paragraphs. Existing tables still render, and can still be edited and deleted.",
  },
  {
    question: "How do I change the width of the editor?",
    answer:
      "Set --editor-max-width on an ancestor of the editor. The default is 700px, and it applies to the editing column and to the loading skeleton and recovery notice. The static renderer ignores it, so give the element around it the same width.",
  },
  {
    question: "Why did shadcn ask me to overwrite a file?",
    answer:
      "The block depends on shadcn components you may already have, such as button or dialog. Answer N to keep your local file and continue the install; only answer yes if you want the registry's version to replace it.",
  },
  {
    question: "How do mentions work?",
    answer:
      "Pass a MentionProvider with a search method, and optionally resolve. A mention stores the entity type and entity id plus the label it shows, so renaming a person later does not break the link. Without a provider, the @ trigger does nothing.",
  },
  {
    question: "Can I export a document to Markdown?",
    answer:
      "The editor ships no import or export. A document is JSON in your storage, so an export is a function you write over that value.",
  },
] as const satisfies readonly FaqEntry[];
