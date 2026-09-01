import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The lesson page is built ahead of time into `dist/public`, so `/teach` never
 * needs a build step. Source maps are left out because the built files are shipped.
 */
export default defineConfig({
  plugins: [react()],
  // The page is served under `/t/<token>/`, and the token is only known when the
  // lesson server starts. Relative asset links resolve inside whatever token route
  // served the page, so the built files never have to name the token.
  base: "./",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    sourcemap: false,
    // The content security policy allows only 'self' scripts and styles, so no
    // inline script or style may be emitted.
    cssCodeSplit: false,
  },
});
