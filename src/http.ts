export function publicUrl(siteUrl: string, path: string): string {
	const baseUrl = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	return new URL(encodedPath, baseUrl).toString();
}

export function objectResponse(object: R2ObjectBody): Response {
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('E-Tag', object.httpEtag);

	return new Response(object.body, { headers });
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
