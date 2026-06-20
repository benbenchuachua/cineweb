import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleApiRequest } from "./server/handler";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  process.env.TMDB_API_KEY = env.TMDB_API_KEY;

  return {
    plugins: [
      react(),
      {
        name: "cineweb-api",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith("/api/")) return next();
            handleApiRequest(req, res);
          });
        },
      },
    ],
  };
});
