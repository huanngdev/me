/**
 * The Twitter card for the home page reuses the Open Graph card, so the two can never disagree.
 * Next reads `twitter-image` separately from `opengraph-image`, which is why this file exists.
 */
export { alt, contentType, default, size } from "./opengraph-image";
