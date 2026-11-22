// Module resolution for the API tests: maps the "@/..." alias and extensionless imports to
// the project's .ts files, and swaps external services for the in-memory stand-ins.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fakes = path.join(root, "test/support/fakes");

const replacements = {
  "server-only": "server-only.ts",
  "next/headers": "next-headers.ts",
  googleapis: "googleapis.ts",
  stripe: "stripe.ts",
  "@/lib/supabase/server": "supabase-server.ts",
  "@/lib/supabase/admin": "supabase-admin.ts",
  "@/lib/email/safe-fetch": "safe-fetch.ts",
};

// next has no "exports" map, so its subpaths need the .js extension under Node's resolver.
const nextSubpaths = new Set(["next/server", "next/navigation"]);

function probe(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (replacements[specifier]) return { url: pathToFileURL(path.join(fakes, replacements[specifier])).href, shortCircuit: true };
  if (nextSubpaths.has(specifier)) return nextResolve(`${specifier}.js`, context);
  if (specifier.startsWith("@/")) {
    const url = probe(path.join(root, specifier.slice(2)));
    if (url) return { url, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:") && !path.extname(specifier)) {
    const url = probe(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (url) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
