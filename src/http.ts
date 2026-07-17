export function publicUrl(siteUrl: string, path: string): string {
	const baseUrl = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	return new URL(encodedPath, baseUrl).toString();
}

export function objectResponse(object: R2ObjectBody, method = 'GET'): Response {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('E-Tag', object.httpEtag);
	headers.set('Accept-Ranges', 'bytes');

	let status = 200;
	if (object.range) {
		const range = object.range;
		const isSuffix = 'suffix' in range && typeof range.suffix === 'number';
		const offset = isSuffix
			? Math.max(0, object.size - range.suffix)
			: 'offset' in range && typeof range.offset === 'number'
				? range.offset
				: 0;
		const length = !isSuffix && 'length' in range && typeof range.length === 'number' ? range.length : object.size - offset;
		headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
		headers.set('Content-Length', String(length));
		status = 206;
	}

	return new Response(method === 'HEAD' ? null : object.body, { headers, status });
}

export function escapeHtml(value: string): string {
	const entities: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	};

	return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

export function appendQuery(url: string, parameters: Record<string, string | null>): string {
	const result = new URL(url);
	for (const [key, value] of Object.entries(parameters)) {
		if (value !== null) {
			result.searchParams.set(key, value);
		}
	}
	return result.toString();
}
