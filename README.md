# workerx

A small [ShareX](https://getsharex.com/) backend built with Hono and Cloudflare Workers. It stores images and files in R2 and short links in Workers KV.

## Setup

1. Install dependencies with `pnpm install`.
2. Update the KV namespace, R2 bucket, and public `SITE_URL` in `wrangler.jsonc` if you are deploying your own copy.
3. Copy `.dev.vars.example` to `.dev.vars` and set a local `ACCESS_KEY`.
4. Store the production key with `pnpm exec wrangler secret put ACCESS_KEY`.
5. Replace `YOUR_ACCESS_KEY` in the `.sxcu` templates before importing them into ShareX. Keep personalized copies out of version control.
6. Run `pnpm dev` for local development or `pnpm deploy` to deploy.

Do not put `ACCESS_KEY` in Wrangler's `[vars]` section. Cloudflare variables are plaintext configuration; production credentials belong in Wrangler secrets.

## API

All `POST` and `DELETE` requests require the access key in the `Authorization` header.

| Method           | Path                            | Purpose                                                   |
| ---------------- | ------------------------------- | --------------------------------------------------------- |
| `POST`           | `/img`                          | Upload a binary image body                                |
| `GET` / `DELETE` | `/img/:id`                      | Fetch or delete an image                                  |
| `POST`           | `/file`                         | Upload a multipart `file` field                           |
| `GET` / `DELETE` | `/file/:id`                     | Fetch or delete a file                                    |
| `POST`           | `/link`                         | Shorten the JSON body `{ "link": "https://example.com" }` |
| `GET`            | `/:id`                          | Follow a short link                                       |
| `DELETE`         | `/link/:id`                     | Delete a short link                                       |
| `GET`            | `/ip`, `/ua`, `/me`, `/me/json` | Inspect request metadata                                  |

## Checks

- `pnpm typecheck` verifies generated Worker bindings and TypeScript.
- `pnpm format` formats the repository.
- `pnpm check` runs type, formatting, and Wrangler dry-run validation.
