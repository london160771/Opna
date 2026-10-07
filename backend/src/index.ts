import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

// Prefer workspace-local env files, then fall back to the repository-level .env.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const config = loadConfig(process.env);
const app = createApp({ config });

app.listen(config.port, () => {
  process.stdout.write(`Opna API listening on port ${config.port}\n`);
});
