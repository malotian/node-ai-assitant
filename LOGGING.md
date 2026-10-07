# Logging Guide

## Winston Logger Setup

All logging goes through Winston with nice formatting:

```
2026-10-07 13:13:19 [info] 🚀 Assistant running at http://localhost:3000
2026-10-07 13:13:23 [info] Chat request: user=Guest authenticated=false message="Test logging..."
2026-10-07 13:13:23 [error] Chat error (with full stack trace)
```

## Usage

```javascript
const { logger } = require("./logger");

logger.info("Message", { data: "optional" });
logger.error("Error message", { error: err.message, stack: err.stack });
logger.warn("Warning message");
```

## Log Levels

- `info` — General information (green)
- `warn` — Warnings (yellow)
- `error` — Errors (red, includes stack trace)
- `debug` — Debug info (visible when `LOG_LEVEL=debug`)

## Configure Log Level

```bash
LOG_LEVEL=debug npm start    # Show debug logs
LOG_LEVEL=error npm start    # Only errors
```

Default: `info`

## Features

✅ Timestamp for every log
✅ Color-coded levels
✅ Auto stack traces on errors
✅ Shows in Node.js console
✅ Visible in production
