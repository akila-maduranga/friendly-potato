import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/credits", async (req, res): Promise<void> => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.json({ available: false, reason: "API key not configured" });
    return;
  }

  const response = await fetch("https://api.elevenlabs.io/v1/user", {
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    const body = await response.text();
    req.log.warn({ status: response.status, body }, "Failed to fetch ElevenLabs user info");
    let reason = `ElevenLabs error (${response.status})`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.detail?.status === "missing_permissions") {
        reason = "missing_permissions";
      }
    } catch { /* keep generic */ }
    res.json({ available: false, reason });
    return;
  }

  const data = await response.json() as Record<string, unknown>;
  const sub = data.subscription as Record<string, unknown> | undefined;

  if (!sub) {
    res.json({ available: false, reason: "No subscription data in response" });
    return;
  }

  const used = Number(sub.character_count ?? 0);
  const limit = Number(sub.character_limit ?? 0);

  res.json({
    available: true,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    tier: String(sub.tier ?? "unknown"),
    nextReset: sub.next_character_reset_unix ?? null,
    status: sub.status ?? null,
  });
});

export default router;
