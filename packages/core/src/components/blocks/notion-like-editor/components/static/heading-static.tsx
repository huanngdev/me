import { SlateElement, type SlateElementProps } from "platejs/static";

import { HEADING_STYLES, headingAnchorId, type HeadingTag } from "../elements/heading-styles";

function headingTag(type: string): HeadingTag {
  if (type === "h1" || type === "h2" || type === "h3") {
    return type;
  }
  return "h1";
}

export function HeadingStatic(props: SlateElementProps) {
  const tag = headingTag(props.element.type);
  const id = typeof props.element.id === "string" ? props.element.id : "";
  return (
    <SlateElement
      {...props}
      as={tag}
      className={HEADING_STYLES[tag]}
      attributes={{
        ...props.attributes,
        id: id.length > 0 ? headingAnchorId(id) : undefined,
      }}
    />
  );
}
