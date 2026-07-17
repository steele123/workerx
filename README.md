# workerx

A private ShareX backend built with Hono and Cloudflare Workers. R2 stores image and file bodies, D1 stores share metadata and usage, and KV keeps existing short links working.

## Features

- Image, file, and URL sharing through ShareX-compatible endpoints.
- Per-share deletion tokens, optional passwords, expiry, and maximum download counts.
- Custom aliases such as `/release-notes` or `/img/avatar.png`.
- Configurable upload-size and MIME-type policies.
- Byte-range and `HEAD` support for resumable downloads and media seeking.
- Image thumbnails and format conversion through the Cloudflare Images binding.
- Scoped, revocable API keys for individual devices.
- A management dashboard at `/admin` with search, deletion, API-key management, and usage statistics.
- Optional verified Cloudflare Access JWT protection for the dashboard.
- Hourly cleanup of expired R2 objects and metadata.
- Legacy R2 objects and KV short links remain readable and deletable with the master key.

## Initial setup

Install dependencies:

```powershell
bun install
```

Create the metadata database and copy the returned `database_id` into `wrangler.jsonc`:

```powershell
bunx wrangler d1 create workerx-metadata
bun run db:migrate:remote
```

Cloudflare Images transformations require an Images subscription. The `IMAGES` binding is already declared in `wrangler.jsonc`; local development uses Wrangler's offline implementation.

Create a local secret file and choose a long random master key:

```powershell
Copy-Item .dev.vars.example .dev.vars
bun run dev
```

Store the production master key interactively. Never put it in `wrangler.jsonc`:

```powershell
bunx wrangler secret put ACCESS_KEY
```

The former key used by this project appeared in local validation output during the cleanup and should be rotated before the next deployment.

## Cloudflare Access

To protect `/admin` with Cloudflare Access:

1. Create a self-hosted Access application for `https://your-domain/admin*` and `https://your-domain/api/admin*`.
2. Put its application audience tag in `POLICY_AUD` in `wrangler.jsonc`.
3. Put your team URL, such as `https://example.cloudflareaccess.com`, in `TEAM_DOMAIN`.

When both values are configured, workerx validates the `Cf-Access-Jwt-Assertion` signature, issuer, and audience. Without them, the dashboard shell loads locally and its API requests require an admin-scoped key or the master key.

## Share options

Every upload endpoint accepts the following optional settings:

| Option              | Image request                  | Multipart file       | Link JSON      |
| ------------------- | ------------------------------ | -------------------- | -------------- |
| Custom alias        | `X-Share-Alias` header         | `alias` field        | `alias`        |
| Lifetime in seconds | `X-Share-Expires-In` header    | `expiresIn` field    | `expiresIn`    |
| Download limit      | `X-Share-Max-Downloads` header | `maxDownloads` field | `maxDownloads` |
| Password            | `X-Share-Password` header      | `password` field     | `password`     |

Example short link:

```json
{
	"link": "https://example.com",
	"alias": "example",
	"expiresIn": 86400,
	"maxDownloads": 10,
	"password": "optional password"
}
```

Upload and administration requests accept either the master key or a scoped API key in `Authorization`. A `Bearer` prefix is optional.

## API

| Method                  | Path                                       | Purpose                                 |
| ----------------------- | ------------------------------------------ | --------------------------------------- |
| `POST`                  | `/img`                                     | Upload a binary image body              |
| `GET`, `HEAD`, `DELETE` | `/img/:id`                                 | Fetch or delete an image                |
| `GET`                   | `/img/:id/thumbnail?width=512&format=webp` | Resize or convert an image              |
| `POST`                  | `/file`                                    | Upload a multipart `file` field         |
| `GET`, `HEAD`, `DELETE` | `/file/:id`                                | Fetch or delete a file                  |
| `POST`                  | `/link`                                    | Create a short link                     |
| `GET`                   | `/:id`                                     | Follow a short link                     |
| `DELETE`                | `/link/:id`                                | Delete a short link                     |
| `GET`                   | `/admin`                                   | Open the management dashboard           |
| `GET`, `POST`, `DELETE` | `/api/admin/*`                             | Manage shares, statistics, and API keys |
| `GET`                   | `/health`                                  | Check Worker and D1 health              |
| `GET`                   | `/ip`, `/ua`, `/me`, `/me/json`            | Inspect request metadata                |

New upload responses contain a `delete` URL with a one-time-generated per-share token. The raw token is never stored in D1 and is only returned in that response.

## Configuration

The following non-secret variables live in `wrangler.jsonc`:

- `MAX_UPLOAD_BYTES` controls the application upload limit.
- `MAX_TTL_SECONDS` caps user-selected expiry periods.
- `ALLOWED_MIME_TYPES` is a comma-separated list supporting exact types, `image/*`-style prefixes, or `*/*`.
- `SITE_URL` is the public base URL returned to ShareX.

## Development

```powershell
bun run db:migrate:local
bun run dev
bun run test
bun run check
```

`bun run check` validates generated bindings, TypeScript, formatting, Worker-runtime tests, and a Wrangler deployment dry run.

Before production deployment:

```powershell
bun run db:migrate:remote
bun run deploy
```

Replace `YOUR_ACCESS_KEY` in the `.sxcu` templates before importing them into ShareX, and keep personalized copies out of version control.
