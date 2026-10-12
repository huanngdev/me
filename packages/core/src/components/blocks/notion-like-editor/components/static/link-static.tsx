import { SlateElement, type SlateElementProps } from "platejs/static";

import { isExternalLinkUrl, sanitizeLinkUrl } from "../../lib/features/editor-link-url";

export function LinkStatic(props: SlateElementProps) {
  const url = typeof props.element.url === "string" ? props.element.url : "";
  const safe = sanitizeLinkUrl(url);
  if (safe === undefined) {
    return <span {...props.attributes}>{props.children}</span>;
  }
  const external = isExternalLinkUrl(safe);
  return (
    <SlateElement
      {...props}
      as="a"
      className="link-underline"
      attributes={{
        ...props.attributes,
        href: safe,
        target: external ? "_blank" : undefined,
        rel: external ? "noopener noreferrer nofollow" : undefined,
      }}
    />
  );
}
