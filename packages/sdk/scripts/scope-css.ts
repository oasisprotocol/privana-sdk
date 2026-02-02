import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const SCOPE = "[data-flexvaults]";
const CSS_VAR_PREFIX = "--fv-";

const SDK_VARS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "radius",
];

const SCOPED_BASE = `@layer base{${SCOPE},${SCOPE} *,${SCOPE} ::before,${SCOPE} ::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:var(--fv-border,currentColor)}}`;

function extractBlock(css: string, startIndex: number): number {
  let depth = 0;
  for (let i = startIndex; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function replaceLayerBase(css: string): string {
  const marker = "@layer base{";
  const idx = css.indexOf(marker);
  if (idx === -1) return css;
  const end = extractBlock(css, idx + "@layer base".length);
  if (end === -1) return css;
  return css.slice(0, idx) + SCOPED_BASE + css.slice(end);
}

const filePath = resolve(import.meta.dirname!, "../src/compiled.css");
let css = readFileSync(filePath, "utf-8");

css = replaceLayerBase(css);

css = css.replaceAll(":root,:host", SCOPE);

css = css.replace(/:root\s*\{([^}]+)\}/g, `${SCOPE}{$1}`);

css = css.replace(
  /\.dark\s*\{([^}]+)\}/g,
  `${SCOPE}.dark,.dark ${SCOPE}{$1}`,
);

for (const v of SDK_VARS) {
  css = css.replaceAll(`var(--${v})`, `var(${CSS_VAR_PREFIX}${v})`);
  css = css.replaceAll(`--${v}:`, `${CSS_VAR_PREFIX}${v}:`);
}

writeFileSync(filePath, css);
console.log("CSS scoped successfully");
