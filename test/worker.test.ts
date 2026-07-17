import { env } from 'cloudflare:workers';
import { createScheduledController, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src';

const authorization = { Authorization: 'test-master-key' };

function localUrl(publicUrl: string): string {
	const url = new URL(publicUrl);
	return `https://example.com${url.pathname}${url.search}`;
}

async function createLink(overrides: Record<string, unknown> = {}) {
	const response = await SELF.fetch('https://example.com/link', {
		method: 'POST',
		headers: { ...authorization, 'Content-Type': 'application/json' },
		body: JSON.stringify({ link: 'https://example.org/destination', ...overrides }),
	});
	expect(response.status).toBe(200);
	return response.json<{ id: string; url: string; delete: string; success: boolean }>();
}

describe('workerx', () => {
	it('enforces authentication on uploads', async () => {
		const response = await SELF.fetch('https://example.com/link', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ link: 'https://example.org' }),
		});
		expect(response.status).toBe(401);
	});

	it('creates custom aliases and enforces download limits', async () => {
		const share = await createLink({ alias: 'release-notes', maxDownloads: 1 });
		expect(share.id).toBe('release-notes');

		const first = await SELF.fetch(localUrl(share.url), { redirect: 'manual' });
		expect(first.status).toBe(302);
		expect(first.headers.get('Location')).toBe('https://example.org/destination');

		const second = await SELF.fetch(localUrl(share.url), { redirect: 'manual' });
		expect(second.status).toBe(410);
	});

	it('protects shares with passwords', async () => {
		const share = await createLink({ password: 'correct horse battery staple' });
		expect((await SELF.fetch(localUrl(share.url))).status).toBe(401);

		const form = new FormData();
		form.set('password', 'correct horse battery staple');
		const unlock = await SELF.fetch(`${localUrl(share.url)}/unlock`, {
			method: 'POST',
			body: form,
			redirect: 'manual',
		});
		expect(unlock.status).toBe(303);
		const cookie = unlock.headers.get('Set-Cookie')?.split(';')[0];
		expect(cookie).toBeTruthy();

		const response = await SELF.fetch(localUrl(share.url), {
			headers: { Cookie: cookie! },
			redirect: 'manual',
		});
		expect(response.status).toBe(302);
	});

	it('allows deletion with the per-share token', async () => {
		const share = await createLink();
		const response = await SELF.fetch(localUrl(share.delete), { method: 'DELETE' });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ success: true });
		expect((await SELF.fetch(localUrl(share.url))).status).toBe(404);
	});

	it('supports ranged file downloads', async () => {
		const form = new FormData();
		form.set('file', new File(['abcdefghij'], 'sample.txt', { type: 'text/plain' }));
		form.set('alias', 'range-test');
		const upload = await SELF.fetch('https://example.com/file', { method: 'POST', headers: authorization, body: form });
		expect(upload.status).toBe(200);
		const share = await upload.json<{ url: string }>();

		const response = await SELF.fetch(localUrl(share.url), { headers: { Range: 'bytes=2-5' } });
		expect(response.status).toBe(206);
		expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
		expect(await response.text()).toBe('cdef');
	});

	it('creates scoped API keys through the admin API', async () => {
		const response = await SELF.fetch('https://example.com/api/admin/keys', {
			method: 'POST',
			headers: { ...authorization, 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'laptop', scopes: ['upload', 'delete'] }),
		});
		expect(response.status).toBe(201);
		const created = await response.json<{ key: string }>();

		const upload = await SELF.fetch('https://example.com/link', {
			method: 'POST',
			headers: { Authorization: `Bearer ${created.key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ link: 'https://example.net' }),
		});
		expect(upload.status).toBe(200);
	});

	it('creates transformed image variants', async () => {
		const encoded = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
		const image = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
		const upload = await SELF.fetch('https://example.com/img', {
			method: 'POST',
			headers: { ...authorization, 'Content-Type': 'image/png', 'X-Share-Alias': 'tiny-image' },
			body: image,
		});
		expect(upload.status).toBe(200);
		const share = await upload.json<{ thumbnail: string }>();

		const thumbnail = await SELF.fetch(`${localUrl(share.thumbnail)}?width=64&format=webp`);
		expect(thumbnail.status).toBe(200);
		expect(thumbnail.headers.get('Content-Type')).toContain('image/webp');
	});

	it('removes expired objects during scheduled cleanup', async () => {
		const storageKey = 'file/expired-test.txt';
		await env.STORAGE.put(storageKey, 'expired');
		await env.DB.prepare(
			`INSERT INTO shares (
				id, public_id, kind, storage_key, size, delete_token_hash, expires_at, created_at
			) VALUES (?, ?, 'file', ?, 7, ?, ?, ?)`,
		)
			.bind('expired-test-id', 'expired-test.txt', storageKey, 'hash', Date.now() - 1, Date.now() - 10_000)
			.run();

		await worker.scheduled(createScheduledController(), env);
		expect(await env.STORAGE.head(storageKey)).toBeNull();
		expect(await env.DB.prepare('SELECT id FROM shares WHERE id = ?').bind('expired-test-id').first()).toBeNull();
	});
});
