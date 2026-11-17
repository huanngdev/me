import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Reel } from "./reel";

export const metadata: Metadata = { robots: { index: false } };

/** 90-second ASCII Ocean showreel, rendered frame by frame for capture. Development only. */
export default function AsciiOceanReelPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Reel />;
}
