import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@veritas/ui"],
  // The workspace root, so file tracing starts above apps/web rather than
  // guessing it from the build directory.
  outputFileTracingRoot: repoRoot,
  // The routes that read a fixture keep their fixtures in the bundle. /api/ask
  // only reads one when LLM_PROVIDER=fake; with a real provider it touches no
  // file at all.
  outputFileTracingIncludes: {
    "/api/ask": ["../../fixtures/llm/**"],
    "/api/replay": ["../../fixtures/events/**"],
    "/api/voice/speak": ["../../fixtures/voice/**"],
    "/api/voice/transcribe": ["../../fixtures/voice/**"],
    // The benchmark page reads its table at request time, so the file has to
    // travel with the bundle or the route is a 500 on a host that ships only
    // what tracing found.
    "/benchmark": ["../../eval/benchmark.json"],
  },
};

export default nextConfig;
