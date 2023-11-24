import { Hono } from 'hono';
import { Bindings } from '../bindings';
import { nanoid } from '../id';

export const linkRouter = new Hono<{
	Bindings: Bindings;
}>();

linkRouter.get('/:id', async (c) => {
	const store = c.env.STORAGE;
	const path = c.req.param('id');
	const file = await store.get(path);
	if (!file) {
		c.status(404);
		return c.json({
			error: 'Not found',
		});
	}

	const headers = new Headers();
	file.writeHttpMetadata(headers);
	headers.set('E-Tag', file.httpEtag);

	return new Response(file.body, {
		headers,
	});
});

linkRouter.delete('/link/:id', async (c) => {
	const store = c.env.STORAGE;
	const path = c.req.param('id');
	await store.delete(path);
	return c.json({
		success: true,
	});
});

linkRouter.post('/link', async (c) => {
	const body = await c.req.json();
	const link = body.link;

	if (!link) {
		c.status(400);
		return c.json({
			error: 'No link provided',
		});
	}

    const id = nanoid();
	const file = await c.env.KV.put(id, link);
	const url = `${c.env.SITE_URL}/${id}`;

	return c.json({
		url: url,
		delete: `${c.env.SITE_URL}/link/${id}`,
	});
});
