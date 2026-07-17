import { Hono, type Context } from 'hono';

export const utilityRouter = new Hono();

utilityRouter.get('/ip', (c) => c.text(c.req.header('CF-Connecting-IP') ?? 'Unknown IP'));

utilityRouter.get('/ua', (c) => c.text(c.req.header('User-Agent') ?? 'Unknown User-Agent'));

function visitorDetails(c: Context) {
	return {
		ip: c.req.header('CF-Connecting-IP') ?? 'Unknown IP',
		ua: c.req.header('User-Agent') ?? 'Unknown User-Agent',
		country: c.req.raw.cf?.country ?? 'Unknown Country',
		asn: c.req.raw.cf?.asOrganization ?? 'Unknown ASN',
		timezone: c.req.raw.cf?.timezone ?? 'Unknown Timezone',
		city: c.req.raw.cf?.city ?? 'Unknown City',
		postalCode: c.req.raw.cf?.postalCode ?? 'Unknown Postal Code',
		region: c.req.raw.cf?.region ?? 'Unknown Region',
		lat: c.req.raw.cf?.latitude ?? 'Unknown Latitude',
		lon: c.req.raw.cf?.longitude ?? 'Unknown Longitude',
		colo: c.req.raw.cf?.colo ?? 'Unknown Colo',
		http: c.req.raw.cf?.httpProtocol ?? 'Unknown HTTP Protocol',
		tls: c.req.raw.cf?.tlsCipher ?? 'Unknown TLS',
		tlsVersion: c.req.raw.cf?.tlsVersion ?? 'Unknown TLS Version',
	};
}

utilityRouter.get('/me/json', (c) => c.json(visitorDetails(c)));

utilityRouter.get('/me', (c) => {
	const details = visitorDetails(c);
	const lines = [
		['IP', details.ip],
		['User-Agent', details.ua],
		['Country', details.country],
		['ASN', details.asn],
		['Timezone', details.timezone],
		['City', details.city],
		['Postal Code', details.postalCode],
		['Region', details.region],
		['Latitude', details.lat],
		['Longitude', details.lon],
		['Colo', details.colo],
		['HTTP Protocol', details.http],
		['TLS', details.tls],
		['TLS Version', details.tlsVersion],
	];

	return c.text(lines.map(([label, value]) => `${label}: ${value}`).join('\n'));
});
