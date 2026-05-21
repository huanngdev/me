"use client";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@repo/core/components/dialog";

export interface GalleryItem {
  src: string;
  alt: string;
}

export function ProjectGallery({ items }: { items: ReadonlyArray<GalleryItem> }) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <Dialog key={item.src}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="bg-muted group relative aspect-video w-full cursor-zoom-in overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="bg-background/95 flex h-[95dvh] max-h-none w-[95vw] max-w-[95vw] items-center justify-center p-2 sm:max-w-[95vw]">
            <DialogTitle className="sr-only">{item.alt}</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.src} alt={item.alt} className="max-h-full max-w-full object-contain" />
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
