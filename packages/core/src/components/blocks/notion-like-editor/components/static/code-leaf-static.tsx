import { SlateLeaf, type SlateLeafProps } from "platejs/static";

import { codeLeafClassName } from "../../lib/static/mark-classes";

// Static leaves do not read node.props.className, so the class is passed here.
export function CodeLeafStatic(props: SlateLeafProps) {
  return <SlateLeaf {...props} as="code" className={codeLeafClassName} />;
}
