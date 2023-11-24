import { Hono } from "hono";
import { Bindings } from "../bindings";
import isbot from 'isbot'
import { IMAGE_PREVIEW_URL } from "../constants";
import { nanoid } from "../id";

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
    const ua = c.req.headers.get('User-Agent')
    if (isbot(ua)) {
        const url = `${c.env.SITE_URL}/${file.key}`
        const fileSize = file.size

        return c.html(`
            <html>
                <head>
                    <meta property="og:title" content="File Download" />
                    <meta property="og:description" content="Download the file ${id} (${fileSize} KB)." />
                    <meta property="og:image" content="${IMAGE_PREVIEW_URL}" />
                    <meta property="og:url" content="${url}" />
                    <meta property="og:type" content="website" />
                    <meta property="og:site_name" content="steele's fs" />
                </head>
                <body>
                    <a href="${url}">File</a>
                </body>
            </html>
        `)
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
	const body = await c.req.arrayBuffer();
	const id = nanoid();
	const fileExt = c.req.headers.get('Content-Type')?.split('/')[1];
    const key = `file/${id}.${fileExt}`;
	await store.put(key, body);
    const url = `${c.env.SITE_URL}/${key}`

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
