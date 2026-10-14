# Installation

## Contents

- [Install](#install)
- [Install by name](#install-by-name)
- [What it installs](#what-it-installs)
- [The prompts](#the-prompts)
- [After the install](#after-the-install)

## Install

Run this in the project that will host the editor. It is the same command in a Next.js project and
in a Vite project.

```bash
npx shadcn@latest add https://www.huanngdev.site/r/notion-like-editor.json
```

Requirements, all of which the project must already meet:

- React 19 and React DOM 19.
- Tailwind CSS v4.
- shadcn with **Radix** primitives. A project on the Base UI style does not compile without changes.
- Next.js or Vite. Nothing in the editor needs a framework beyond React.

The registry is tested with shadcn 4.21.4 on Next.js and Vite, on Tailwind v4.

## Install by name

Register the registry once in `components.json`, then install with a short name. The same files
arrive either way.

```json
{
  "registries": {
    "@huanngdev": "https://www.huanngdev.site/r/{name}.json"
  }
}
```

```bash
npx shadcn@latest add @huanngdev/notion-like-editor
```

## What it installs

- **256 files** under `components/blocks/notion-like-editor/`. This is the editor itself: the
  document schema, the Plate plugins, the elements and the static renderer.
- **4 shared helper files** under `components/huanngdev/notion-like-editor/`. shadcn keeps them out
  of the block's own folder because another block can need them too.
- **19 npm packages**, including `platejs`, the `@platejs/*` plugins, `katex`, `highlight.js`,
  `lowlight`, `zod`, `@dnd-kit/core`, `@vidstack/react` and `lucide-react`.
- **20 shadcn components** it depends on, installed from the project's own registry: `alert`,
  `button`, `calendar`, `checkbox`, `command`, `dialog`, `dropdown-menu`, `input`, `kbd`, `popover`,
  `progress`, `scroll-area`, `separator`, `skeleton`, `spinner`, `table`, `tabs`, `textarea`,
  `toggle`, `tooltip`.
- **2 other registry items**: `audio-player` and `video-player`. They are separate because they can
  be used on their own, and they bring the vidstack stylesheets the media blocks need.
- **15 CSS rules** added to the stylesheet `components.json` points at.

## The prompts

shadcn asks before it replaces a file the project already has, for example
`components/ui/button.tsx`.

**Answer `N`.** The project's file is kept and the rest of the install continues. The editor works
against whatever shape the local primitives already have.

Do not pass `--yes` to skip the prompts unless the user asked for their primitives to be replaced.
It replaces them with the registry's versions, and any local change to them is gone.

## After the install

1. `components/blocks/notion-like-editor/index.tsx` exists and exports `NotionLikeEditorBlock` and
   `NotionLikeEditorStatic`.
2. The stylesheet gained the `--editor-*` variables in its light and dark blocks, and the
   `--color-editor-*` mappings in `@theme`. Tailwind v4 scans the project by default, so the class
   names inside the new folder need no extra configuration.
3. The 15 CSS rules are present: a `link-underline` utility, twelve `.editor-code .hljs-*` syntax
   rules, and two `.slate-editor [data-block-placeholder]` rules.
4. The project type-checks with the editor imported from `@/components/blocks/notion-like-editor`.

The main install failures and what each one means are in
[troubleshooting.md](troubleshooting.md).
