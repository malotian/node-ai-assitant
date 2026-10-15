const winston = require("winston");
const { config } = require("./config");

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
      const stackTrace = stack ? `\n${stack}` : "";
      const defined = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined));
      const details = Object.keys(defined).length ? ` ${JSON.stringify(defined)}` : "";
      return `${timestamp} [${level}] ${message}${details}${stackTrace}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

module.exports = { logger };
