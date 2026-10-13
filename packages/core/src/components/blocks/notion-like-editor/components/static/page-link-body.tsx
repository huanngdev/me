import { ArrowUpRight, FileText } from "lucide-react";

import {
  PAGE_LINK_ICON_CLASS,
  PAGE_LINK_LABEL_CLASS,
  PAGE_LINK_MUTED_TITLE_CLASS,
  PAGE_LINK_TITLE_CLASS,
} from "../elements/page-link-classes";
import {
  PAGE_LINK_UNTITLED,
  pageLinkDisplayTitle,
  type PageLinkKind,
} from "../../lib/features/editor-page-link";

// The row contents shared by the editor and the static renderer. A title is already cleaned.
export function PageLinkBody({
  icon,
  kind,
  title,
  muted,
  label,
}: {
  icon: string | undefined;
  kind: PageLinkKind;
  title: string;
  muted: boolean;
  label: string | undefined;
}) {
  const empty = title.trim().length === 0;
  const quiet = muted || empty;
  const KindIcon = kind === "child" ? FileText : ArrowUpRight;

  return (
    <>
      {icon !== undefined ? (
        <span aria-hidden="true" className={PAGE_LINK_ICON_CLASS}>
          {icon}
        </span>
      ) : (
        <KindIcon aria-hidden="true" className={PAGE_LINK_ICON_CLASS} />
      )}
      <span
        data-page-title=""
        className={quiet ? PAGE_LINK_MUTED_TITLE_CLASS : PAGE_LINK_TITLE_CLASS}
      >
        {empty ? PAGE_LINK_UNTITLED : pageLinkDisplayTitle(title)}
      </span>
      {label !== undefined ? <span className={PAGE_LINK_LABEL_CLASS}>{label}</span> : null}
    </>
  );
}
