import { Hono } from 'hono';
import { isBot } from 'isbot';
import { extension } from 'mime-types';
import { requireAccess } from '../auth';
import { IMAGE_PREVIEW_URL } from '../constants';
import { escapeHtml, objectResponse, publicUrl } from '../http';
import { createId } from '../id';

export const fileRouter = new Hono<{ Bindings: Env }>();

function safeFileName(fileName: string): string {
	return fileName.replace(/[^\x20-\x7e]|["\\]/g, '_').slice(0, 200);
}

function formatFileSize(sizeInBytes: number): string {
	if (sizeInBytes >= 1024 * 1024) {
		return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	return `${(sizeInBytes / 1024).toFixed(1)} KB`;
}

fileRouter.get('/:id', async (c) => {
	const id = c.req.param('id');
	const file = await c.env.STORAGE.get(`file/${id}`);

	if (!file) {
		return c.json({ error: 'Not found' }, 404);
	}

	const userAgent = c.req.header('User-Agent');
	const contentType = file.httpMetadata?.contentType ?? '';
	const isPreviewableMedia = contentType.startsWith('image/') || contentType.startsWith('video/');

	if (isBot(userAgent) && !isPreviewableMedia) {
		const url = publicUrl(c.env.SITE_URL, file.key);
		const escapedUrl = escapeHtml(url);
		const description = escapeHtml(`Download ${id} (${formatFileSize(file.size)}).`);

		return c.html(`
			<!doctype html>
			<html lang="en">
				<head>
					<meta charset="utf-8" />
					<meta property="og:title" content="File download" />
					<meta property="og:description" content="${description}" />
					<meta property="og:image" content="${escapeHtml(IMAGE_PREVIEW_URL)}" />
					<meta property="og:url" content="${escapedUrl}" />
					<meta property="og:type" content="website" />
					<meta property="og:site_name" content="Steele's file storage" />
					<title>File download</title>
				</head>
				<body><a href="${escapedUrl}">Download file</a></body>
			</html>
		`);
	}

	return objectResponse(file);
});

fileRouter.post('/', requireAccess, async (c) => {
	let form: Awaited<ReturnType<typeof c.req.parseBody>>;

	try {
		form = await c.req.parseBody();
	} catch {
		return c.json({ success: false, error: 'Invalid multipart body' }, 400);
	}

	const file = form.file;

	if (!(file instanceof File)) {
		return c.json({ success: false, error: 'No file provided' }, 400);
	}

	const contentType = file.type || 'application/octet-stream';
	const nameExtension = file.name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase();
	const fileExtension = extension(contentType) || nameExtension || 'bin';
	const key = `file/${createId()}.${fileExtension}`;
	const fileName = safeFileName(file.name || `file.${fileExtension}`);

	await c.env.STORAGE.put(key, file, {
		httpMetadata: {
			contentType,
			contentDisposition: `attachment; filename="${fileName}"`,
		},
	});
	const url = publicUrl(c.env.SITE_URL, key);

	return c.json({
		success: true,
		url,
		delete: url,
	});
});

fileRouter.delete('/:id', requireAccess, async (c) => {
	await c.env.STORAGE.delete(`file/${c.req.param('id')}`);

	return c.json({ success: true });
});
