import { createRequire } from "node:module";
import base from "./base.js";

const require = createRequire(import.meta.url);

/** @type {import("prettier").Config} */
const config = {
  ...base,
  plugins: [require.resolve("prettier-plugin-tailwindcss")],
  tailwindFunctions: ["clsx", "cn", "cva", "tw"],
};

export default config;
