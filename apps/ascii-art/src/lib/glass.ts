/*
 * Liquid-glass class strings for the home page controls. A CSS approximation: translucent fill,
 * blur plus saturation boost, a thin light edge and an inset top highlight. Passed as className
 * overrides so the shared core components stay untouched.
 */

const GLASS_SURFACE =
  "border border-white/40 bg-white/50 backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-1px_0_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-white/8 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(255,255,255,0.05),0_8px_32px_rgba(0,0,0,0.35)]";

const GLASS_PRESS =
  "transition-[background-color,transform,box-shadow,color] duration-200 ease-out motion-safe:active:scale-[0.97]";

const GLASS_FOCUS =
  "focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none dark:focus-visible:ring-white/40";

/** The pill that holds the tab segments. */
export const GLASS_CAPSULE = `${GLASS_SURFACE} h-10 rounded-full p-1 text-foreground/70 group-data-horizontal/tabs:h-10`;

/** One tab segment inside the capsule; the selected one is a brighter glass lens. */
export const GLASS_TAB = `${GLASS_PRESS} ${GLASS_FOCUS} h-full rounded-full border-transparent px-3 sm:px-4 text-foreground/65 hover:text-foreground dark:text-foreground/65 dark:hover:text-foreground data-[state=active]:border-white/50 data-[state=active]:bg-white/70 data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_rgba(0,0,0,0.12)] dark:data-[state=active]:border-white/15 dark:data-[state=active]:bg-white/18 dark:data-[state=active]:text-foreground dark:data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_2px_8px_rgba(0,0,0,0.3)]`;

/** A standalone glass pill (theme button, scene select trigger). */
export const GLASS_PILL = `${GLASS_SURFACE} ${GLASS_PRESS} ${GLASS_FOCUS} h-10 rounded-full text-foreground hover:bg-white/65 dark:bg-white/8 dark:hover:bg-white/14 aria-expanded:bg-white/65 dark:aria-expanded:bg-white/14`;

/** The scene select popup. */
export const GLASS_POPUP = `${GLASS_SURFACE} rounded-2xl p-1 text-foreground ring-0 dark:bg-neutral-900/55`;

/** An item inside the glass popup. */
export const GLASS_ITEM =
  "rounded-full py-1.5 pl-3 focus:bg-white/60 focus:text-foreground dark:focus:bg-white/15";
