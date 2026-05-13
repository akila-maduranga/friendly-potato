import { Router, type IRouter } from "express";
import multer from "multer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.post("/transcribe", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
  const formData = new FormData();
  formData.append("file", blob, req.file.originalname);
  formData.append("model_id", "scribe_v2");
  formData.append("timestamps_granularity", "word");
  formData.append("diarize", "true");

  req.log.info({ filename: req.file.originalname, size: req.file.size }, "Sending file to ElevenLabs");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `ElevenLabs error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed?.detail?.message ?? parsed?.message ?? errorMessage;
    } catch {
      // keep the generic message
    }
    req.log.error({ status: response.status, error: errorText }, "ElevenLabs API error");
    res.status(response.status).json({ error: errorMessage });
    return;
  }

  const data = await response.json();
  res.json(data);
});

export default router;
