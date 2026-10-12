import { SlateElement, type SlateElementProps } from "platejs/static";

export function MentionStatic(props: SlateElementProps) {
  const label = typeof props.element.label === "string" ? props.element.label : "";
  const entityType = typeof props.element.entityType === "string" ? props.element.entityType : "";
  const entityId = typeof props.element.entityId === "string" ? props.element.entityId : "";
  return (
    <SlateElement
      {...props}
      as="span"
      className="text-foreground inline align-baseline font-medium"
      attributes={{
        ...props.attributes,
        "data-mention-entity-type": entityType,
        "data-mention-entity-id": entityId,
        "data-mention-state": "known",
      }}
    >
      @{label}
      {props.children}
    </SlateElement>
  );
}
