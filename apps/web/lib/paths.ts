/**
 * Finding a repository file at runtime.
 *
 * The working directory differs between `next dev` from apps/web, a monorepo
 * build and a traced serverless bundle, so the candidates are tried in turn
 * rather than guessed from a single heuristic. Only fixture reads use this;
 * the answering path reads nothing from disk.
 */
import fs from "fs";
import path from "path";

const CANDIDATES = [".", "../..", "apps/web/../..", "../../../.."];

/** The first existing path for a repository-relative file, or null. */
export function repoFile(relative: string): string | null {
  for (const candidate of CANDIDATES) {
    const full = path.resolve(process.cwd(), candidate, relative);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** The same, but a missing file is an error rather than a null. */
export function requireRepoFile(relative: string): string {
  const found = repoFile(relative);
  if (!found) throw new Error(`missing file: ${relative}`);
  return found;
}
