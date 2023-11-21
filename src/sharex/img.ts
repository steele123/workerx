import { Hono } from 'hono';
import { Bindings } from '../bindings';
import { nanoid } from '../id';

export const imgRouter = new Hono<{
	Bindings: Bindings;
}>();

imgRouter.get('/:id', async (c) => {
	const id = c.req.param('id');
	const store = c.env.STORAGE;
	const img = await store.get('img/' + id);
	if (!img) {
		c.status(404);
		return c.json({
			error: 'Not found',
		});
	}

	const headers = new Headers();
	img.writeHttpMetadata(headers);
	headers.set('E-Tag', img.httpEtag);

	return new Response(img.body, {
		headers,
	});
});

imgRouter.post('/', async (c) => {
	const store = c.env.STORAGE;
	const body = await c.req.arrayBuffer();
	const id = nanoid();
	const fileExt = c.req.headers.get('Content-Type')?.split('/')[1];
    const key = `img/${id}.${fileExt}`;
	const img = await store.put(key, body);
    const url = `${c.env.SITE_URL}/${key}`

	return c.json({
		url: url,
		delete: url,
	});
});

imgRouter.delete('/:id', async (c) => {
	const store = c.env.STORAGE;
	const id = c.req.param('id');
	await store.delete('img/' + id);
	return c.json({
		success: true,
	});
});
