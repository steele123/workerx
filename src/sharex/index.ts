import { Hono } from "hono";
import { cache } from 'hono/cache'
import { imgRouter } from "./img";
import { fileRouter } from "./file";
import { linkRouter } from "./link";
import { utilityRouter } from "../utility";

export const shareRouter = new Hono()

shareRouter.route("", utilityRouter)

shareRouter.get("*", cache({
    cacheName: "sharex",
    cacheControl: "public, max-age=31536000, immutable"
}))

// image sharer
shareRouter.route("/img", imgRouter)
// file sharer
shareRouter.route("/file", fileRouter)

// link sharer
shareRouter.route("/", linkRouter)