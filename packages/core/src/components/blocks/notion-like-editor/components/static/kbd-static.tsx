import { SlateLeaf, type SlateLeafProps } from "platejs/static";

import { KBD_CLASS } from "../elements/kbd-classes";

// Static leaves do not read node.props.className, so the class is passed here.
export function KbdStatic(props: SlateLeafProps) {
  return <SlateLeaf {...props} as="kbd" className={KBD_CLASS} />;
}
