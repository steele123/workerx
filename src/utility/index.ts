import { Hono } from 'hono';

export const utilityRouter = new Hono();

utilityRouter.get('/ip', async (c) => {
	return c.text(c.req.header('CF-Connecting-IP') ?? 'Unknown IP');
});

utilityRouter.get('/ua', async (c) => {
	return c.text(c.req.header('User-Agent') ?? 'Unknown User-Agent');
});

utilityRouter.get('/me/json', async (c) => {
	return c.json({
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
    
	});
});

utilityRouter.get('/me', async (c) => {
	let text = '';
	text += `IP: ${c.req.header('CF-Connecting-IP') ?? 'Unknown IP'}\n`;
	text += `User-Agent: ${c.req.header('User-Agent') ?? 'Unknown User-Agent'}\n`;
	text += `Country: ${c.req.raw.cf?.country ?? 'Unknown Country'}\n`;
	text += `ASN: ${c.req.raw.cf?.asOrganization ?? 'Unknown ASN'}\n`;
	text += `Timezone: ${c.req.raw.cf?.timezone ?? 'Unknown Timezone'}\n`;
	text += `City: ${c.req.raw.cf?.city ?? 'Unknown City'}\n`;
	text += `Postal Code: ${c.req.raw.cf?.postalCode ?? 'Unknown Postal Code'}\n`;
	text += `Region: ${c.req.raw.cf?.region ?? 'Unknown Region'}\n`;
	text += `Latitude: ${c.req.raw.cf?.latitude ?? 'Unknown Latitude'}\n`;
	text += `Longitude: ${c.req.raw.cf?.longitude ?? 'Unknown Longitude'}\n`;
	text += `Colo: ${c.req.raw.cf?.colo ?? 'Unknown Colo'}\n`;
	text += `HTTP Protocol: ${c.req.raw.cf?.httpProtocol ?? 'Unknown HTTP Protocol'}\n`;
	text += `TLS: ${c.req.raw.cf?.tlsCipher ?? 'Unknown TLS'}\n`;
	text += `TLS Version: ${c.req.raw.cf?.tlsVersion ?? 'Unknown TLS Version'}\n`;

	return c.text(text);
});
