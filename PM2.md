# Process Management with PM2

PM2 is a production-grade process manager for Node.js applications.

## Quick Start

### Start (Background with PM2)
```bash
npm run pm2:start
```
- Starts the app in background
- Auto-restart on crash
- Logs stored and viewable

### Stop
```bash
npm run pm2:stop
```
- Gracefully stops the process

### Restart
```bash
npm run pm2:restart
```
- Restart without downtime

### View Logs
```bash
npm run pm2:logs
```
- Tail the application logs

### Monitor Processes
```bash
npm run pm2:monit
```
- Real-time dashboard of CPU/memory/uptime

## Foreground Development

For development, use foreground mode:
```bash
npm start          # Logs visible directly
npm run dev        # Watch mode (auto-restart on file changes)
```

## PM2 vs Foreground

| Feature | npm start | npm run pm2:start |
|---------|-----------|-------------------|
| Logs | Direct in terminal | Stored in PM2 |
| Auto-restart | No | Yes (on crash) |
| Background | No | Yes |
| Development | ✅ Better | Development logs harder to see |
| Production | For Kubernetes/Docker | ✅ Better |

## Best Practices

- **Development**: Use `npm start` or `npm run dev`
- **Production**: Use `npm run pm2:start` + pm2 daemon manager
- **Docker**: Use `npm start` (container handles process)

## PM2 Config File (Optional)

Create `ecosystem.config.js` for advanced config:
```javascript
module.exports = {
  apps: [{
    name: 'assistant',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production' },
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
  }]
};
```

Then use:
```bash
pm2 start ecosystem.config.js
```

See [pm2.io](https://pm2.io) for more options.
