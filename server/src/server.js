import dns from 'node:dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { createApp } from './app.js';

await connectDb(config.mongoUri);

const server = createApp().listen(config.port, () => {
console.log(`Clinic booking API listening on http://localhost:${config.port}`);
});

const shutdown = (signal) => {
console.log(`${signal} received, shutting down`);
server.close(async () => {
await disconnectDb();
process.exit(0);
});
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
