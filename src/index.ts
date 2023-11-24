import { Hono } from 'hono';
import { shareRouter } from './sharex';
import { utilityRouter } from './utility';

const app = new Hono();

app.route("", shareRouter)

export default app; // for Cloudflare Workers or Bun
