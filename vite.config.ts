import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'gajihub-proxy-dev',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && req.url.startsWith('/api/gajihub-proxy')) {
              try {
                const parsedUrl = new URL(req.url, 'http://localhost');
                const targetUrl = parsedUrl.searchParams.get('url');
                if (!targetUrl) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "Missing 'url' query parameter" }));
                  return;
                }

                if (!targetUrl.includes("kledo.com") && !targetUrl.includes("gajihub.com")) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "Invalid target URL." }));
                  return;
                }

                const authHeader = req.headers.authorization;
                const contentType = req.headers["content-type"];

                let bodyData = '';
                if (req.method !== 'GET' && req.method !== 'HEAD') {
                  bodyData = await new Promise<string>((resolve) => {
                    let data = '';
                    req.on('data', chunk => data += chunk);
                    req.on('end', () => resolve(data));
                  });
                }

                const fetchHeaders: HeadersInit = {
                  ...(authHeader ? { "Authorization": authHeader } : {}),
                  ...(contentType ? { "Content-Type": contentType } : { "Content-Type": "application/json" }),
                  "Accept": "application/json"
                };

                const fetchOptions: RequestInit = {
                  method: req.method,
                  headers: fetchHeaders
                };

                if (bodyData) {
                  fetchOptions.body = bodyData;
                }

                console.log(`[Vite Dev Proxy] Forwarding: ${req.method} ${targetUrl}`);
                const apiResponse = await fetch(targetUrl, fetchOptions);
                const responseText = await apiResponse.text();

                res.statusCode = apiResponse.status;
                res.setHeader('Content-Type', apiResponse.headers.get('content-type') || 'application/json');
                res.end(responseText);
              } catch (err: any) {
                console.error("[Vite Dev Proxy] Error:", err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || "Dev proxy error" }));
              }
              return;
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
