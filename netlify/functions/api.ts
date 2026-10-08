import serverless from 'serverless-http';
import { createApp } from '../../backend/src/app.js';
import { loadConfig } from '../../backend/src/config.js';

const app = createApp({ config: loadConfig(process.env) });

export const handler = serverless(app);
