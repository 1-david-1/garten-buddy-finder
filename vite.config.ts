import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Hand-rolled replacement for @lovable.dev/vite-tanstack-config (removed so this
// project no longer depends on Lovable's platform tooling to build or deploy).
//
// What the wrapper used to provide, and where it lives now:
// - tsConfigPaths            -> vite-tsconfig-paths (resolves the "@/*" alias from tsconfig.json)
// - tailwindcss              -> @tailwindcss/vite
// - tanstackStart            -> @tanstack/react-start/plugin/vite (same entry: "server" as before)
// - viteReact                -> @vitejs/plugin-react
// - nitro (build-only,       -> nitro/vite, only added for `vite build`, preset "cloudflare-module"
//   cloudflare default)         to match src/server.ts's fetch(request, env, ctx) Worker signature
// - React/TanStack dedupe    -> resolve.dedupe below (prevents duplicate-React "invalid hook call"
//                               issues if this ever ends up in a monorepo/linked-package setup)
//
// Not replicated (Lovable-editor-only, irrelevant outside their platform):
// - TanStack devtools auto-injection, custom error-logger plugins, and sandbox
//   port/host detection. Add @tanstack/react-router-devtools yourself if you want
//   a dev overlay; a plain `vite dev` on the default port works fine without it.
export default defineConfig(({ command }) => ({
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    ...(command === "build" ? [nitro({ preset: "cloudflare-module" })] : []),
  ],
}));
