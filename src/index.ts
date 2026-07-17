import { Hono } from 'hono';
import { shareRouter } from './sharex';

const app = new Hono<{ Bindings: Env }>();

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

app.route('/', shareRouter);

export default app;
