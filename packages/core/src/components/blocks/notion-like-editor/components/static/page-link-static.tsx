import { SlateElement, type SlateElementProps } from "platejs/static";

import { PAGE_LINK_ROW_CLASS } from "../elements/page-link-classes";
import { cleanPageLinkTitle, storedPageLinkKind } from "../../lib/features/editor-page-link";
import { PageLinkBody } from "./page-link-body";

// The static output has no provider, so it shows the stored title and kind icon, as an editor with no provider does.
export function PageLinkStatic(props: SlateElementProps) {
  const element = props.element;
  const pageId = typeof element.pageId === "string" ? element.pageId : "";
  const kind = storedPageLinkKind(element.kind);
  const title = typeof element.title === "string" ? cleanPageLinkTitle(element.title) : "";

  return (
    <SlateElement {...props} className="relative py-1">
      <div className="relative">
        <div
          data-page-link=""
          data-page-id={pageId}
          data-page-kind={kind}
          className={PAGE_LINK_ROW_CLASS}
        >
          <PageLinkBody
            icon={undefined}
            kind={kind}
            title={title}
            muted={false}
            label={undefined}
          />
        </div>
      </div>
      {props.children}
    </SlateElement>
  );
}
