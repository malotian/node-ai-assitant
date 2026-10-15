const { Router } = require("express");
const { logger } = require("../logger");

// Internal: mitmproxy event ingestion (see docs/LOGGING.md)
function createInternalRouter() {
  const router = Router();

  router.post("/api/internal/proxy-log", (req, res) => {
    if (req.headers["x-internal-proxy-log"] !== "true") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { method, url, statusCode, durationMs, service, details } = req.body || {};
    const safeMethod = String(method || "HTTP").replace(/[\r\n]/g, "").slice(0, 10);
    const safeUrl = String(url || "").replace(/[\r\n]/g, "").slice(0, 200);
    const safeStatus = Number(statusCode) || 0;
    const safeDuration = Number(durationMs) || 0;
    const safeService = String(service || "External").replace(/[\r\n]/g, "").slice(0, 50);
    const safeDetails = details ? ` [${String(details).replace(/[\r\n]/g, "").slice(0, 120)}]` : "";

    logger.info(
      `🌐 [mitmproxy] ${safeMethod} ${safeUrl} -> ${safeStatus} (${safeDuration}ms) [${safeService}]${safeDetails}`
    );
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createInternalRouter };
