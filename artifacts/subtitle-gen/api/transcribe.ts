import type { VercelRequest, VercelResponse } from "@vercel/node";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
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

  const form = formidable({ maxFileSize: 500 * 1024 * 1024 });

  let files: formidable.Files;
  try {
    [, files] = await form.parse(req);
  } catch (err) {
    return res.status(400).json({ error: "Failed to parse uploaded file" });
  }

  const fileArr = files.file;
  const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const fileBuffer = fs.readFileSync(file.filepath);
  const blob = new Blob([fileBuffer], { type: file.mimetype || "audio/mpeg" });
  const formData = new FormData();
  formData.append("file", blob, file.originalFilename || "audio");
  formData.append("model_id", "scribe_v2");
  formData.append("timestamps_granularity", "word");
  formData.append("diarize", "true");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    return res.status(response.status).json({ error });
  }

  const data = await response.json();
  return res.json(data);
}
