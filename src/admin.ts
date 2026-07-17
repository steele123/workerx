import { Hono } from 'hono';
import { SCOPES, type App, type Scope } from './app';
import { requireAdmin } from './auth';
import { createApiKey, deleteShareRecord, findShareById, getStatistics, listApiKeys, listShares, recordMetric, revokeApiKey } from './data';
import { createId } from './id';
import { hashString, randomToken, verifyAccessJwt } from './security';

export const adminPageRouter = new Hono<App>();
export const adminApiRouter = new Hono<App>();

adminPageRouter.get('/', async (c) => {
	if (c.env.TEAM_DOMAIN && c.env.POLICY_AUD && !(await verifyAccessJwt(c.req.raw, c.env))) {
		return c.text('Cloudflare Access authentication required', 403);
	}

	return c.html(`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>workerx</title>
	<style>
		:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui;background:#0b0d10;color:#f4f4f5}body{margin:0}.wrap{max-width:1180px;margin:auto;padding:2rem}header{display:flex;justify-content:space-between;align-items:center;gap:1rem}h1{font-size:1.4rem}button,input,select{font:inherit;border:1px solid #3f3f46;border-radius:.5rem;padding:.65rem;background:#18181b;color:inherit}button{cursor:pointer}.danger{color:#fca5a5}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1.5rem 0}.card{background:#18181b;border:1px solid #27272a;border-radius:.75rem;padding:1rem}.value{font-size:1.8rem;font-weight:700}.toolbar{display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0}table{width:100%;border-collapse:collapse;background:#18181b;border-radius:.75rem;overflow:hidden}th,td{text-align:left;padding:.75rem;border-bottom:1px solid #27272a}th{color:#a1a1aa;font-size:.8rem;text-transform:uppercase}a{color:#93c5fd}.muted{color:#a1a1aa}.keys{margin-top:2rem}.notice{display:none;background:#451a03;color:#fed7aa;padding:.75rem;border-radius:.5rem}code{font-size:.85em}@media(max-width:760px){.table-wrap{overflow:auto}.wrap{padding:1rem}}
	</style>
</head>
<body><main class="wrap">
	<header><div><h1>workerx dashboard</h1><div class="muted">Shares, keys, and the last 30 days of activity</div></div><button id="auth">Set API key</button></header>
	<p id="notice" class="notice"></p>
	<section class="grid"><div class="card"><div class="muted">Active shares</div><div id="shares-total" class="value">—</div></div><div class="card"><div class="muted">Stored bytes</div><div id="bytes-total" class="value">—</div></div><div class="card"><div class="muted">Downloads</div><div id="downloads-total" class="value">—</div></div></section>
	<div class="toolbar"><input id="search" placeholder="Search shares" /><select id="kind"><option value="">All types</option><option>image</option><option>file</option><option>link</option></select><button id="refresh">Refresh</button></div>
	<div class="table-wrap"><table><thead><tr><th>Share</th><th>Type</th><th>Size</th><th>Downloads</th><th>Expires</th><th></th></tr></thead><tbody id="shares"></tbody></table></div>
	<section class="keys"><h2>API keys</h2><div class="toolbar"><input id="key-name" placeholder="Device name" /><select id="key-scope"><option value="upload">Upload</option><option value="upload,delete">Upload + delete</option><option value="admin">Admin</option></select><button id="create-key">Create key</button></div><p id="new-key" class="notice"></p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Scopes</th><th>Last used</th><th></th></tr></thead><tbody id="keys"></tbody></table></div></section>
</main>
<script>
const $=id=>document.getElementById(id);let key=sessionStorage.getItem('workerx-key')||'';
const headers=()=>key?{Authorization:'Bearer '+key}:{};
async function api(path,options={}){const response=await fetch('/api/admin'+path,{credentials:'same-origin',...options,headers:{...headers(),...(options.headers||{})}});if(response.status===401){$('notice').style.display='block';$('notice').textContent='Cloudflare Access or an admin API key is required.';throw new Error('Unauthorized')}const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data}
const bytes=value=>{const units=['B','KB','MB','GB','TB'];let index=0;while(value>=1024&&index<units.length-1){value/=1024;index++}return value.toFixed(index?1:0)+' '+units[index]};
async function load(){const params=new URLSearchParams({q:$('search').value,kind:$('kind').value});const [shares,stats,keys]=await Promise.all([api('/shares?'+params),api('/stats'),api('/keys')]);$('shares-total').textContent=stats.totals.shares;$('bytes-total').textContent=bytes(Number(stats.totals.stored_bytes));$('downloads-total').textContent=stats.totals.downloads;renderShares(shares.items);renderKeys(keys.items)}
function cell(text){const td=document.createElement('td');td.textContent=text??'—';return td}
function renderShares(items){const body=$('shares');body.replaceChildren();for(const item of items){const row=document.createElement('tr');const link=document.createElement('a');link.href=item.url;link.textContent=item.publicId;link.target='_blank';const first=document.createElement('td');first.append(link);if(item.originalName){const small=document.createElement('div');small.className='muted';small.textContent=item.originalName;first.append(small)}row.append(first,cell(item.kind),cell(bytes(item.size)),cell(String(item.downloadCount)),cell(item.expiresAt?new Date(item.expiresAt).toLocaleString():'Never'));const action=document.createElement('td');const remove=document.createElement('button');remove.className='danger';remove.textContent='Delete';remove.onclick=async()=>{if(confirm('Delete this share?')){await api('/shares/'+item.id,{method:'DELETE'});await load()}};action.append(remove);row.append(action);body.append(row)}}
function renderKeys(items){const body=$('keys');body.replaceChildren();for(const item of items){const row=document.createElement('tr');row.append(cell(item.name),cell(item.scopes),cell(item.last_used_at?new Date(item.last_used_at).toLocaleString():'Never'));const action=document.createElement('td');if(!item.revoked_at){const button=document.createElement('button');button.className='danger';button.textContent='Revoke';button.onclick=async()=>{await api('/keys/'+item.id,{method:'DELETE'});await load()};action.append(button)}else action.textContent='Revoked';row.append(action);body.append(row)}}
$('auth').onclick=()=>{const value=prompt('Admin API key',key);if(value!==null){key=value.trim();sessionStorage.setItem('workerx-key',key);load()}};$('refresh').onclick=load;$('search').onkeydown=e=>{if(e.key==='Enter')load()};$('kind').onchange=load;
$('create-key').onclick=async()=>{const name=$('key-name').value.trim();if(!name)return;const scopes=$('key-scope').value.split(',');const result=await api('/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,scopes})});$('new-key').style.display='block';$('new-key').textContent='Copy this key now; it will not be shown again: '+result.key;await load()};load().catch(()=>{});
</script></body></html>`);
});

adminApiRouter.use('*', requireAdmin);

adminApiRouter.get('/shares', async (c) => {
	const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query('limit') ?? '100', 10) || 100));
	const shares = await listShares(c.env.DB, c.req.query('q') || null, c.req.query('kind') || null, limit);
	return c.json({
		items: shares.map((share) => ({
			id: share.id,
			publicId: share.public_id,
			kind: share.kind,
			originalName: share.original_name,
			size: share.size,
			downloadCount: share.download_count,
			maxDownloads: share.max_downloads,
			expiresAt: share.expires_at,
			createdAt: share.created_at,
			url:
				share.kind === 'link'
					? new URL(share.public_id, `${c.env.SITE_URL.replace(/\/$/, '')}/`).toString()
					: new URL(share.storage_key ?? '', `${c.env.SITE_URL.replace(/\/$/, '')}/`).toString(),
		})),
	});
});

adminApiRouter.delete('/shares/:id', async (c) => {
	const share = await findShareById(c.env.DB, c.req.param('id'));
	if (!share) {
		return c.json({ error: 'Share not found' }, 404);
	}
	if (share.storage_key) {
		await c.env.STORAGE.delete(share.storage_key);
	}
	await deleteShareRecord(c.env.DB, share.id);
	c.executionCtx.waitUntil(recordMetric(c.env.DB, 'admin_deletes'));
	return c.json({ success: true });
});

adminApiRouter.get('/stats', async (c) => c.json(await getStatistics(c.env.DB)));

adminApiRouter.get('/keys', async (c) => c.json({ items: await listApiKeys(c.env.DB) }));

adminApiRouter.post('/keys', async (c) => {
	const body: unknown = await c.req.json().catch(() => null);
	if (typeof body !== 'object' || body === null || !('name' in body) || typeof body.name !== 'string') {
		return c.json({ error: 'A key name is required' }, 400);
	}
	const requestedScopes = 'scopes' in body && Array.isArray(body.scopes) ? body.scopes : [];
	const scopes = requestedScopes.filter((scope): scope is Scope => typeof scope === 'string' && SCOPES.includes(scope as Scope));
	if (!scopes.length || body.name.trim().length > 100) {
		return c.json({ error: 'Choose a valid name and at least one scope' }, 400);
	}

	const key = `wx_${randomToken()}`;
	const id = createId(12);
	await createApiKey(c.env.DB, { id, name: body.name.trim(), keyHash: await hashString(key), scopes, createdAt: Date.now() });
	return c.json({ id, key, scopes }, 201);
});

adminApiRouter.delete('/keys/:id', async (c) => {
	await revokeApiKey(c.env.DB, c.req.param('id'), Date.now());
	return c.json({ success: true });
});
