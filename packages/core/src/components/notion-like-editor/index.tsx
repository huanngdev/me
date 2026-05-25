"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { SlashMenu } from "./components/slash-menu";
import { blockPlaceholder, nextId } from "./lib/blocks";
import type { Block, BlockType } from "./types";

export function NotionLikeEditor() {
  const [blocks, setBlocks] = useState<Block[]>([{ id: nextId(), type: "paragraph", html: "" }]);

  const [slashOpen, setSlashOpen] = useState(false);
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const [slashBlockIndex, setSlashBlockIndex] = useState<number | null>(null);

  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    blockRefs.current = blockRefs.current.slice(0, blocks.length);
  }, [blocks]);

  function handleInput(index: number) {
    const el = blockRefs.current[index];
    if (!el) return;
    const html = el.innerHTML;
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], html };
      return next;
    });

    const text = el.textContent ?? "";
    if (text === "/") {
      const rect = el.getBoundingClientRect();
      setSlashPosition({ top: rect.bottom + 4, left: rect.left });
      setSlashBlockIndex(index);
      setSlashOpen(true);
    } else if (!text.startsWith("/")) {
      setSlashOpen(false);
      setSlashBlockIndex(null);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (slashOpen) return;
      const newBlock: Block = { id: nextId(), type: "paragraph", html: "" };
      setBlocks((prev) => {
        const next = [...prev];
        next.splice(index + 1, 0, newBlock);
        return next;
      });
      setTimeout(() => {
        const nextEl = blockRefs.current[index + 1];
        if (nextEl) nextEl.focus();
      }, 0);
    }

    if (e.key === "Backspace" && blocks.length > 1) {
      const el = blockRefs.current[index];
      if (el && (el.textContent ?? "").length === 0) {
        e.preventDefault();
        setBlocks((prev) => prev.filter((_, i) => i !== index));
        setTimeout(() => {
          const prevEl = blockRefs.current[index - 1];
          if (prevEl) prevEl.focus();
        }, 0);
      }
    }

    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      const prevEl = blockRefs.current[index - 1];
      if (prevEl) prevEl.focus();
    }

    if (e.key === "ArrowDown" && index < blocks.length - 1) {
      e.preventDefault();
      const nextEl = blockRefs.current[index + 1];
      if (nextEl) nextEl.focus();
    }
  }

  function handleSlashSelect(type: BlockType) {
    if (slashBlockIndex === null) return;
    setBlocks((prev) => {
      const next = [...prev];
      next[slashBlockIndex] = { ...next[slashBlockIndex], type, html: "" };
      return next;
    });
    setSlashOpen(false);
    setSlashBlockIndex(null);
    setTimeout(() => {
      const el = blockRefs.current[slashBlockIndex];
      if (el) {
        el.innerHTML = "";
        el.focus();
      }
    }, 0);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="bg-muted min-h-[300px] rounded-lg px-4 py-3">
        <SlashMenu open={slashOpen} position={slashPosition} onSelect={handleSlashSelect} />
        {blocks.map((block, i) => {
          const isBullet = block.type === "bullet-list";
          return (
            <div key={block.id} className={cn("group flex items-start gap-2", isBullet && "ml-5")}>
              {isBullet && (
                <span className="text-foreground mt-0.5 text-sm leading-relaxed select-none">
                  •
                </span>
              )}
              <div
                ref={(el) => {
                  blockRefs.current[i] = el;
                }}
                role="textbox"
                contentEditable
                aria-multiline
                aria-label={blockPlaceholder(block.type)}
                className={cn(
                  "data-[placeholder]:before:text-muted-foreground w-full text-sm leading-relaxed break-words whitespace-pre-wrap transition-colors outline-none",
                  "empty:before:text-muted-foreground empty:before:pointer-events-none empty:before:inline empty:before:content-[attr(aria-label)]",
                  block.type === "heading1" && "text-2xl font-semibold tracking-tight",
                  block.type === "heading2" && "text-xl font-semibold tracking-tight",
                  block.type === "paragraph" && "text-sm",
                  block.type === "bullet-list" && "text-sm",
                )}
                onInput={() => handleInput(i)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                suppressContentEditableWarning
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
