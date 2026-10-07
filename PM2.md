# Process Management

Process management is kept simple and minimal using standard `npm` scripts:

## Quick Start

### Start Server
```bash
npm start
```
- Starts `node src/server.js` directly in the foreground.
- Simple and minimal (does not kill other processes on start).

### Development Mode (Watch Mode)
```bash
npm run dev
```
- Starts `node --watch src/server.js` to automatically reload on code changes.

### Stop Server
```bash
npm stop
```
- Kills the server process and frees port 3000.
- Terminates instances even if running from other terminals or in the background.

## Common Workflows

### Run in Background
```bash
npm start &
```

### Stop Any Running Instance
```bash
npm stop
```

