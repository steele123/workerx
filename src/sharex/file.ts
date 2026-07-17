import { Hono } from 'hono';
import { isBot } from 'isbot';
import { extension } from 'mime-types';
import type { App } from '../app';
import { requireUpload } from '../auth';
import { IMAGE_PREVIEW_URL } from '../constants';
import { createShare, findShare, recordMetric } from '../data';
import { appendQuery, escapeHtml, objectResponse, publicUrl } from '../http';
import { createPublicId, parseShareOptions } from '../share-options';
import {
	canDeleteShare,
	claimShare,
	deleteTrackedShare,
	ensureAliasAvailable,
	isMimeTypeAllowed,
	maximumUploadBytes,
	prepareShareAccess,
	unlockShare,
} from '../shares';
import { hashString, randomToken } from '../security';

export const fileRouter = new Hono<App>();

fileRouter.post('/:id/unlock', (c) => unlockShare(c, 'file', c.req.param('id')));

function safeFileName(fileName: string): string {
	return fileName.replace(/[^\x20-\x7e]|["\\]/g, '_').slice(0, 200);
}

function formatFileSize(sizeInBytes: number): string {
	return sizeInBytes >= 1024 * 1024 ? `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB` : `${(sizeInBytes / 1024).toFixed(1)} KB`;
}

fileRouter.on(['GET', 'HEAD'], '/:id', async (c) => {
	const publicId = c.req.param('id');
	const access = await prepareShareAccess(c, 'file', publicId);
	if (access.response) {
		return access.response;
	}

	const storageKey = access.share?.storage_key ?? `file/${publicId}`;
	const file = await c.env.STORAGE.get(storageKey, { range: c.req.raw.headers });
	if (!file) {
		return c.json({ error: 'Not found' }, 404);
	}

	const contentType = access.share?.content_type ?? file.httpMetadata?.contentType ?? '';
	const isPreviewableMedia = contentType.startsWith('image/') || contentType.startsWith('video/');
	if (c.req.method === 'GET' && isBot(c.req.header('User-Agent')) && !isPreviewableMedia) {
		const url = publicUrl(c.env.SITE_URL, storageKey);
		const escapedUrl = escapeHtml(url);
		const description = escapeHtml(`Download ${access.share?.original_name ?? publicId} (${formatFileSize(file.size)}).`);

		return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8" />
			<meta property="og:title" content="File download" />
			<meta property="og:description" content="${description}" />
			<meta property="og:image" content="${escapeHtml(IMAGE_PREVIEW_URL)}" />
			<meta property="og:url" content="${escapedUrl}" />
			<meta property="og:type" content="website" /><title>File download</title></head>
			<body><a href="${escapedUrl}">Download file</a></body></html>`);
	}

	if (access.share) {
		const claimed = await claimShare(c, access.share);
		if (claimed instanceof Response) {
			return claimed;
		}
	}

	return objectResponse(file, c.req.method);
});

fileRouter.post('/', requireUpload, async (c) => {
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

	if (file.size > maximumUploadBytes(c.env)) {
		return c.json({ success: false, error: 'File exceeds the configured upload limit' }, 413);
	}

	const contentType = file.type || 'application/octet-stream';
	if (!isMimeTypeAllowed(contentType, c.env)) {
		return c.json({ success: false, error: 'This file type is not allowed' }, 415);
	}

	let options;
	try {
		options = await parseShareOptions(
			{
				alias: form.alias,
				expiresIn: form.expiresIn,
				maxDownloads: form.maxDownloads,
				password: form.password,
			},
			c.env,
		);
	} catch (error) {
		return c.json({ success: false, error: error instanceof Error ? error.message : 'Invalid share options' }, 400);
	}

	const nameExtension = file.name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase();
	const fileExtension = extension(contentType) || nameExtension || 'bin';
	const publicId = createPublicId(options.alias, fileExtension);
	const storageKey = `file/${publicId}`;
	if (!(await ensureAliasAvailable(c.env, 'file', publicId, storageKey))) {
		return c.json({ success: false, error: 'That alias is already in use' }, 409);
	}

	const deleteToken = randomToken();
	const fileName = safeFileName(file.name || `file.${fileExtension}`);
	await c.env.STORAGE.put(storageKey, file, {
		httpMetadata: { contentType, contentDisposition: `attachment; filename="${fileName}"` },
	});

	try {
		await createShare(c.env.DB, {
			id: crypto.randomUUID(),
			public_id: publicId,
			kind: 'file',
			storage_key: storageKey,
			destination_url: null,
			original_name: fileName,
			content_type: contentType,
			size: file.size,
			delete_token_hash: await hashString(deleteToken),
			password_hash: options.passwordHash,
			expires_at: options.expiresAt,
			max_downloads: options.maxDownloads,
			created_at: Date.now(),
		});
	} catch (error) {
		await c.env.STORAGE.delete(storageKey);
		throw error;
	}

	const url = publicUrl(c.env.SITE_URL, storageKey);
	c.executionCtx.waitUntil(
		Promise.all([recordMetric(c.env.DB, 'uploads'), recordMetric(c.env.DB, 'bytes_uploaded', file.size)]).then(() => undefined),
	);

	return c.json({
		success: true,
		id: publicId,
		url,
		delete: appendQuery(url, { token: deleteToken }),
		expiresAt: options.expiresAt ? new Date(options.expiresAt).toISOString() : null,
	});
});

fileRouter.delete('/:id', async (c) => {
	const publicId = c.req.param('id');
	const share = await findShare(c.env.DB, 'file', publicId);
	if (share) {
		return deleteTrackedShare(c, share);
	}

	if (!(await canDeleteShare(c, null))) {
		return c.json({ success: false, error: 'Unauthorized' }, 401);
	}
	await c.env.STORAGE.delete(`file/${publicId}`);
	return c.json({ success: true });
});
