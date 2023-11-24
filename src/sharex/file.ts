import { Hono } from 'hono';
import { Bindings } from '../bindings';
import isbot from 'isbot';
import { IMAGE_PREVIEW_URL } from '../constants';
import { nanoid } from '../id';
import { extension } from 'mime-types';

export const fileRouter = new Hono<{
	Bindings: Bindings;
}>();

fileRouter.get('/:id', async (c) => {
	const id = c.req.param('id');
	const store = c.env.STORAGE;
	const file = await store.get(`file/${id}`);
	if (!file) {
		c.status(404);
		return c.json({
			error: 'Not found',
		});
	}

	// If its a bot don't send the file, since its probably for a link preview, instead send
	// HTML for the OpenGraph tags
	const ua = c.req.headers.get('User-Agent');
	if (isbot(ua)) {
		const url = `${c.env.SITE_URL}/${file.key}`;
		const fileSizeMb = file.size / 1024;

		return c.html(`
            <html>
                <head>
                    <meta property="og:title" content="File Download" />
                    <meta property="og:description" content="Download the file ${id} (${fileSizeMb} KB)." />
                    <meta property="og:image" content="${IMAGE_PREVIEW_URL}" />
                    <meta property="og:url" content="${url}" />
                    <meta property="og:type" content="website" />
                    <meta property="og:site_name" content="steele's file storage" />
                </head>
                <body>
                    <a href="${url}">File</a>
                </body>
            </html>
        `);
	}

	const headers = new Headers();
	file.writeHttpMetadata(headers);
	headers.set('E-Tag', file.httpEtag);

	return new Response(file.body, {
		headers,
	});
});

fileRouter.post('/', async (c) => {
	const store = c.env.STORAGE;
	const body = await c.req.parseBody();
	if (!body) {
		c.status(400);
		return c.json({
			error: 'No file provided',
		});
	}

	if (body instanceof ArrayBuffer) {
		c.status(400);
		return c.json({
			error: 'File is too large',
		});
	}

	const file = body['file'] as File;
	if (!file) {
		c.status(400);
		return c.json({
			error: 'No file provided',
		});
	}

	let fileName;
	if (file.name) {
		// remove file extension
		fileName = file.name.replace(/\.[^/.]+$/, '');
	} else {
		fileName = nanoid();
	}

	const fileExt = extension(file.type ?? '') ?? 'bin';
	const key = `file/${fileName}.${fileExt}`;
	await store.put(key, await file.arrayBuffer());
	const url = `${c.env.SITE_URL}/${key}`;

	return c.json({
		url: url,
		delete: url,
	});
});

fileRouter.delete('/:id', async (c) => {
	const store = c.env.STORAGE;
	const id = c.req.param('id');
	await store.delete(`file/${id}`);
	return c.json({
		success: true,
	});
});
