import { Hono } from 'hono';
import { adminApiRouter, adminPageRouter } from './admin';
import type { App } from './app';
import { cleanupExpiredShares } from './data';
import { shareRouter } from './sharex';

const app = new Hono<App>();

app.onError((error, c) => {
	console.error(
		JSON.stringify({
			message: 'Unhandled request error',
			error: error.message,
			method: c.req.method,
			path: c.req.path,
		}),
	);

	return c.json({ success: false, error: 'Internal server error' }, 500);
});

app.get('/health', async (c) => {
	await c.env.DB.prepare('SELECT 1').first();
	return c.json({ status: 'ok', time: new Date().toISOString() });
});

app.route('/admin', adminPageRouter);
app.route('/api/admin', adminApiRouter);
app.route('/', shareRouter);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default {
	fetch(request, env, ctx) {
		return app.fetch(request, env, ctx);
	},
	async scheduled(_controller, env) {
		const deleted = await cleanupExpiredShares(env);
		console.log(JSON.stringify({ message: 'Expired share cleanup complete', deleted }));
	},
} satisfies ExportedHandler<Env>;
