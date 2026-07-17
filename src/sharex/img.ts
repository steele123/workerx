import { Hono } from 'hono';
import { extension } from 'mime-types';
import type { App } from '../app';
import { requireUpload } from '../auth';
import { createShare, findShare, recordMetric } from '../data';
import { appendQuery, objectResponse, publicUrl } from '../http';
import { createPublicId, optionsFromHeaders, parseShareOptions } from '../share-options';
import {
	canDeleteShare,
	claimShare,
	deleteTrackedShare,
	ensureAliasAvailable,
	isMimeTypeAllowed,
	maximumUploadBytes,
	prepareShareAccess,
	unlockShare,
	validateContentLength,
} from '../shares';
import { hashString, randomToken } from '../security';

export const imgRouter = new Hono<App>();

imgRouter.post('/:id/unlock', (c) => unlockShare(c, 'image', c.req.param('id')));

imgRouter.get('/:id/thumbnail', async (c) => {
	const publicId = c.req.param('id');
	const access = await prepareShareAccess(c, 'image', publicId);
	if (access.response) {
		return access.response;
	}

	const image = await c.env.STORAGE.get(access.share?.storage_key ?? `img/${publicId}`);
	if (!image) {
		return c.json({ error: 'Not found' }, 404);
	}

	if (access.share) {
		const claimed = await claimShare(c, access.share);
		if (claimed instanceof Response) {
			return claimed;
		}
	}

	const width = Math.min(2048, Math.max(16, Number.parseInt(c.req.query('width') ?? '512', 10) || 512));
	const heightValue = Number.parseInt(c.req.query('height') ?? '', 10);
	const height = Number.isFinite(heightValue) ? Math.min(2048, Math.max(16, heightValue)) : undefined;
	const requestedFormat = c.req.query('format') ?? 'webp';
	const formats = { avif: 'image/avif', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
	const format = formats[requestedFormat as keyof typeof formats] ?? formats.webp;
	const transformed = await c.env.IMAGES.input(image.body).transform({ width, height }).output({ format });
	const response = transformed.response();
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

	return new Response(response.body, { status: response.status, headers });
});

imgRouter.on(['GET', 'HEAD'], '/:id', async (c) => {
	const publicId = c.req.param('id');
	const access = await prepareShareAccess(c, 'image', publicId);
	if (access.response) {
		return access.response;
	}

	const image = await c.env.STORAGE.get(access.share?.storage_key ?? `img/${publicId}`, { range: c.req.raw.headers });
	if (!image) {
		return c.json({ success: false, error: 'Not found' }, 404);
	}

	if (access.share) {
		const claimed = await claimShare(c, access.share);
		if (claimed instanceof Response) {
			return claimed;
		}
	}

	return objectResponse(image, c.req.method);
});

imgRouter.post('/', requireUpload, async (c) => {
	const body = c.req.raw.body;
	const contentType = c.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
	const fileExtension = extension(contentType);
	const lengthError = validateContentLength(c.req.raw.headers, c.env);

	if (!body) {
		return c.json({ success: false, error: 'No image provided' }, 400);
	}
	if (lengthError) {
		return c.json({ success: false, error: lengthError }, 413);
	}
	if (!contentType.startsWith('image/') || !fileExtension || !isMimeTypeAllowed(contentType, c.env)) {
		return c.json({ success: false, error: 'Unsupported image type' }, 415);
	}

	let options;
	try {
		options = await parseShareOptions(optionsFromHeaders(c.req.raw.headers), c.env);
	} catch (error) {
		return c.json({ success: false, error: error instanceof Error ? error.message : 'Invalid share options' }, 400);
	}

	const publicId = createPublicId(options.alias, fileExtension);
	const storageKey = `img/${publicId}`;
	if (!(await ensureAliasAvailable(c.env, 'image', publicId, storageKey))) {
		return c.json({ success: false, error: 'That alias is already in use' }, 409);
	}

	const stored = await c.env.STORAGE.put(storageKey, body, { httpMetadata: { contentType } });
	if (stored.size > maximumUploadBytes(c.env)) {
		await c.env.STORAGE.delete(storageKey);
		return c.json({ success: false, error: 'Image exceeds the configured upload limit' }, 413);
	}

	const deleteToken = randomToken();
	try {
		await createShare(c.env.DB, {
			id: crypto.randomUUID(),
			public_id: publicId,
			kind: 'image',
			storage_key: storageKey,
			destination_url: null,
			original_name: null,
			content_type: contentType,
			size: stored.size,
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
		Promise.all([recordMetric(c.env.DB, 'uploads'), recordMetric(c.env.DB, 'bytes_uploaded', stored.size)]).then(() => undefined),
	);

	return c.json({
		success: true,
		id: publicId,
		url,
		thumbnail: `${url}/thumbnail`,
		delete: appendQuery(url, { token: deleteToken }),
		expiresAt: options.expiresAt ? new Date(options.expiresAt).toISOString() : null,
	});
});

imgRouter.delete('/:id', async (c) => {
	const publicId = c.req.param('id');
	const share = await findShare(c.env.DB, 'image', publicId);
	if (share) {
		return deleteTrackedShare(c, share);
	}

	if (!(await canDeleteShare(c, null))) {
		return c.json({ success: false, error: 'Unauthorized' }, 401);
	}
	await c.env.STORAGE.delete(`img/${publicId}`);
	return c.json({ success: true });
});
