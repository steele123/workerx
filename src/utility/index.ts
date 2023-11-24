import { Hono } from "hono";

export const utilityRouter = new Hono();

utilityRouter.get("/ip", async (c) => {
    return c.text(c.req.header("CF-Connecting-IP") ?? "Unknown IP")
})

utilityRouter.get("/ua", async (c) => {
    return c.text(c.req.header("User-Agent") ?? "Unknown User-Agent")
})

utilityRouter.get("/info", async (c) => {
    return c.json({
        ip: c.req.header("CF-Connecting-IP") ?? "Unknown IP",
        ua: c.req.header("User-Agent") ?? "Unknown User-Agent",
        country: c.req.header("CF-IPCountry") ?? "Unknown Country",
        asn: c.req.header("CF-Connecting-ASN") ?? "Unknown ASN",
        colo: c.req.header("CF-IPCountry") ?? "Unknown Colo",
        tls: c.req.header("CF-IPCountry") ?? "Unknown TLS",
        tlsVersion: c.req.header("CF-IPCountry") ?? "Unknown TLS Version",
    })
})

utilityRouter.get("/me", async (c) => {
    return c.json({
        ip: c.req.header("CF-Connecting-IP") ?? "Unknown IP",
        ua: c.req.header("User-Agent") ?? "Unknown User-Agent",
        country: c.req.header("CF-IPCountry") ?? "Unknown Country",
        asn: c.req.header("CF-Connecting-ASN") ?? "Unknown ASN",
        colo: c.req.header("CF-IPCountry") ?? "Unknown Colo",
        tls: c.req.header("CF-IPCountry") ?? "Unknown TLS",
        tlsVersion: c.req.header("CF-IPCountry") ?? "Unknown TLS Version",
    })
})