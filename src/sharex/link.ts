import { Hono } from 'hono';
import { Bindings } from '../bindings';
import { nanoid } from '../id';

export const linkRouter = new Hono<{
	Bindings: Bindings;
}>();

linkRouter.get('/:id', async (c) => {
	const path = c.req.param('id');
	const link = await c.env.KV.get(`link_${path}`);

	if (!link) {
		c.status(404);
		return c.json({
			error: 'Not found'
		});
	}

	return c.redirect(link);
});

linkRouter.delete('/link/:id', async (c) => {
	if (c.env.ACCESS_KEY !== c.req.header('Authorization')) {
		c.status(401);
		return c.json({
			success: false,
			error: 'Unauthorized'
		});
	}

	const store = c.env.STORAGE;
	const path = c.req.param('id');
	await store.delete(path);
	return c.json({
		success: true
	});
});

linkRouter.post('/link', async (c) => {
	if (c.env.ACCESS_KEY !== c.req.header('Authorization')) {
		c.status(401);
		return c.json({
			success: false,
			error: 'Unauthorized'
		});
	}

	const body = await c.req.json();
	const link = body.link;

	if (!link) {
		c.status(400);
		return c.json({
			success: false,
			error: 'No link provided'
		});
	}

	const id = nanoid();
	await c.env.KV.put(`link_${id}`, link);
	const url = `${c.env.SITE_URL}/${id}`;

	return c.json({
		success: true,
		url: url,
		delete: `${c.env.SITE_URL}/link/${id}`
	});
});
