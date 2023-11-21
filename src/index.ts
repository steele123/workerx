import { Hono } from 'hono';
import { shareRouter } from './sharex';

const app = new Hono();

app.route("", shareRouter)

export default app; // for Cloudflare Workers or Bun
