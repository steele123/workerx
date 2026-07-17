import { Hono } from 'hono';
import { extension } from 'mime-types';
import { requireAccess } from '../auth';
import { objectResponse, publicUrl } from '../http';
import { createId } from '../id';

export const imgRouter = new Hono<{ Bindings: Env }>();

imgRouter.get('/:id', async (c) => {
	const image = await c.env.STORAGE.get(`img/${c.req.param('id')}`);

	if (!image) {
		return c.json({ success: false, error: 'Not found' }, 404);
	}

	return objectResponse(image);
});

imgRouter.post('/', requireAccess, async (c) => {
	const body = c.req.raw.body;
	const contentType = c.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
	const fileExtension = extension(contentType);

	if (!body) {
		return c.json({ success: false, error: 'No image provided' }, 400);
	}

	if (!fileExtension) {
		return c.json({ success: false, error: "Can't determine file extension" }, 400);
	}

	const key = `img/${createId()}.${fileExtension}`;
	await c.env.STORAGE.put(key, body, {
		httpMetadata: { contentType },
	});
	const url = publicUrl(c.env.SITE_URL, key);

	return c.json({
		success: true,
		url,
		delete: url,
	});
});

imgRouter.delete('/:id', requireAccess, async (c) => {
	await c.env.STORAGE.delete(`img/${c.req.param('id')}`);

	return c.json({ success: true });
});
