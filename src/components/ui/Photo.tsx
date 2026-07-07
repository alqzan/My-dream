"use client";
import { useState } from "react";
import { ImageLightbox } from "./ImageLightbox";

/**
 * A journal photo thumbnail that opens a full-screen zoomable viewer on tap.
 * Pass the whole `images` group (from entryPhotos) plus this thumbnail's
 * `index`, so the viewer can page through the entry's photos.
 */
export function Photo({
  images,
  index = 0,
  alt = "",
  className,
}: {
  images: string[];
  index?: number;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const src = images[index];
  if (!src) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`${className ?? ""} cursor-zoom-in`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      />
      {open && <ImageLightbox images={images} index={index} onClose={() => setOpen(false)} />}
    </>
  );
}
