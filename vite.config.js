import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    include: ["@farcaster/frame-sdk"],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
