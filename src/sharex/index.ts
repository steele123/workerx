import { Hono } from "hono";
import { cache } from 'hono/cache'
import { imgRouter } from "./img";

export const shareRouter = new Hono()

shareRouter.get("*", cache({
    cacheName: "sharex",
    cacheControl: "public, max-age=31536000, immutable"
}))

shareRouter.route("/img", imgRouter)