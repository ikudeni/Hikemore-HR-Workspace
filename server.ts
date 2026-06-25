import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add middleware to parse JSON requests
  app.use(express.json());

  // API proxy for Gajihub/Kledo to bypass browser CORS restrictions
  app.all("/api/gajihub-proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    // Security validation: only allow requests to Kledo/Gajihub domains
    if (!targetUrl.includes("kledo.com") && !targetUrl.includes("gajihub.com")) {
      return res.status(400).json({ error: "Invalid target URL. Only Gajihub/Kledo endpoints are permitted." });
    }

    const authHeader = req.headers.authorization;
    const contentType = req.headers["content-type"];

    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          ...(authHeader ? { "Authorization": authHeader } : {}),
          ...(contentType ? { "Content-Type": contentType } : { "Content-Type": "application/json" }),
          "Accept": "application/json"
        }
      };

      if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      console.log(`[Gajihub Proxy] Proxying: ${req.method} ${targetUrl}`);
      const apiResponse = await fetch(targetUrl, fetchOptions);
      const responseText = await apiResponse.text();
      
      res.status(apiResponse.status);
      
      try {
        const json = JSON.parse(responseText);
        res.json(json);
      } catch {
        res.send(responseText);
      }
    } catch (error: any) {
      console.error("[Gajihub Proxy] Error during API forwarding:", error);
      res.status(500).json({ error: error.message || "Failed to connect to Gajihub API" });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
