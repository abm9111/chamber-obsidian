import tseslint from "typescript-eslint";
export default tseslint.config(
  ...tseslint.configs.recommended,
  { ignores: ["main.js", "node_modules/**"] },
  {
    files: ["src/core/**/*.ts", "tests/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [{ name: "obsidian", message: "src/core is pure — no Obsidian imports; put glue in src/obsidian/." }] }],
    },
  },
);
