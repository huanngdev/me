import { NodeIdPlugin, type AnyPluginConfig } from "platejs";

import { PasteFallbackPlugin } from "./editor-paste";

// Core skips its node-id plugin when NODE_ENV is "test" and no nodeId option is set.
// Plate splices NodeIdPlugin out of the plugins array it receives.
export function createEditorPlugins(): AnyPluginConfig[] {
  return [NodeIdPlugin, PasteFallbackPlugin];
}
