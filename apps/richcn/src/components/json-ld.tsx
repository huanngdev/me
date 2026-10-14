import type { JsonLdNode } from "@/lib/json-ld";

/** The `<` escape stops a string in the data from closing the script element early. */
function serialize(node: JsonLdNode): string {
  return JSON.stringify(node).replace(/</g, "\\u003c");
}

/**
 * One `<script type="application/ld+json">` per node. A server component: it renders no visible
 * markup, so it can be dropped anywhere in a page. The page's structured data can be read back with
 * `JSON.parse` on the element's text.
 */
export function JsonLd({ data }: { data: readonly JsonLdNode[] }) {
  return (
    <>
      {data.map((node, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serialize(node) }}
        />
      ))}
    </>
  );
}
