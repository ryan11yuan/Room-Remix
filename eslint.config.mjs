import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Keep the Spark splat renderer in its own lazy chunk. A static value import of SplatLayer anywhere (it imports Spark) would
  // pull Spark into the page's main bundle; the layer is only reached through ScanController's dynamic import().
  // (`import type` is erased at build time, so it is fine. The dynamic import() itself isn't covered by this rule, which is intended.)
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": "off", // replaced by the TypeScript version, which understands type-only imports
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@sparkjsdev/spark",
              message: "Spark is imported only by src/lib/scene/SplatLayer.ts, so it stays in its own lazy chunk.",
            },
          ],
          patterns: [
            {
              group: ["**/SplatLayer", "./SplatLayer", "@/lib/scene/SplatLayer"],
              message:
                "A value import of SplatLayer pulls Spark into this bundle. Use `import type`, or the dynamic import() in ScanController.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/scene/SplatLayer.ts", "src/lib/scene/SplatLayer.test.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
