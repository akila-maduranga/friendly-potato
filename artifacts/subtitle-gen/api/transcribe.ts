import type { VercelRequest, VercelResponse } from "@vercel/node";
import formidable from "formidable";
import fs from "fs";
import os from "os";

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 300,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ElevenLabs API key not configured" });
  }

  // Parse multipart form — write temp files to /tmp (Vercel's writable dir)
  const form = formidable({
    maxFileSize: 500 * 1024 * 1024,
    uploadDir: os.tmpdir(),
    keepExtensions: true,
  });

  let filepath: string;
  let mimetype: string;
  let originalFilename: string;

  try {
    const [, files] = await form.parse(req);
    const fileArr = files.file;
    const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }
    filepath = file.filepath;
    mimetype = file.mimetype ?? "audio/mpeg";
    originalFilename = file.originalFilename ?? "audio";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(400).json({ error: `Failed to parse upload: ${msg}` });
  }

  try {
    const fileBuffer = fs.readFileSync(filepath);
    const blob = new Blob([fileBuffer], { type: mimetype });
    const formData = new FormData();
    formData.append("file", blob, originalFilename);
    formData.append("model_id", "scribe_v2");
    formData.append("timestamps_granularity", "word");
    formData.append("diarize", "true");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: formData,
    });

    if (!response.ok) {
      let errorMsg = `ElevenLabs error ${response.status}`;
      try {
        const body = await response.json() as Record<string, unknown>;
        if (typeof body.detail === "string") errorMsg = body.detail;
        else if (body.detail && typeof body.detail === "object") {
          const detail = body.detail as Record<string, unknown>;
          if (typeof detail.message === "string") errorMsg = detail.message;
        }
      } catch { /* keep generic */ }
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: `Transcription failed: ${msg}` });
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(filepath); } catch { /* ignore */ }
  }
}
