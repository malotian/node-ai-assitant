// Entry point: wires the agent into the app, starts listening and shuts down cleanly.
const { config } = require("./config");
const { logger } = require("./logger");
const { createAssistantAgent } = require("./agent");
const { createApp } = require("./app");

const app = createApp({ agent: createAssistantAgent() });

const server = app.listen(config.port, () => {
  logger.info(`🚀 Assistant running at ${config.appBaseUrl}`);
});

// Docker sends SIGTERM on stop: finish in-flight requests gracefully
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
