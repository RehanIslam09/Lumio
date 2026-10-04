import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import rootConfig from "../../eslint.config.mjs";

export default defineConfig(
  ...rootConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
);
