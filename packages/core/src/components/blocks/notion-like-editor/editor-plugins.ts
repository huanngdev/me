import { NodeIdPlugin, type AnyPluginConfig } from "platejs";

// Core skips its node-id plugin when NODE_ENV is "test" and no nodeId option is set.
export const EDITOR_PLUGINS: AnyPluginConfig[] = [NodeIdPlugin];
