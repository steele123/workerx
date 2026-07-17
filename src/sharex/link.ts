import { Hono } from 'hono';
import { requireAccess } from '../auth';
import { publicUrl } from '../http';
import { createId } from '../id';

export const linkRouter = new Hono<{ Bindings: Env }>();

linkRouter.get('/:id', async (c) => {
	const link = await c.env.KV.get(`link_${c.req.param('id')}`);

	if (!link) {
		return c.json({ error: 'Not found' }, 404);
	}

	return c.redirect(link);
});

linkRouter.delete('/link/:id', requireAccess, async (c) => {
	await c.env.KV.delete(`link_${c.req.param('id')}`);

	return c.json({ success: true });
});

linkRouter.post('/link', requireAccess, async (c) => {
	let body: unknown;

	try {
		body = await c.req.json();
	} catch {
		return c.json({ success: false, error: 'Invalid JSON body' }, 400);
	}

	const link = typeof body === 'object' && body !== null && 'link' in body ? body.link : undefined;

	if (typeof link !== 'string') {
		return c.json({ success: false, error: 'No link provided' }, 400);
	}

	let destination: URL;

	try {
		destination = new URL(link);
	} catch {
		return c.json({ success: false, error: 'Invalid link' }, 400);
	}

	if (!['http:', 'https:'].includes(destination.protocol)) {
		return c.json({ success: false, error: 'Only HTTP and HTTPS links are supported' }, 400);
	}

	const id = createId();
	await c.env.KV.put(`link_${id}`, destination.toString());
	const url = publicUrl(c.env.SITE_URL, id);

	return c.json({
		success: true,
		url,
		delete: publicUrl(c.env.SITE_URL, `link/${id}`),
	});
});
