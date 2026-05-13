import React, { useState, useRef, useCallback } from "react";
import {
  UploadCloud, FileAudio, FileVideo, Download, AlertCircle,
  Copy, FileText, Check, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Word {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "audio_event";
  speaker_id: string;
}

interface TranscribeResponse {
  text: string;
  language_code: string;
  language_probability: number;
  words: Word[];
}

// ─── Subtitle generation ──────────────────────────────────────────────────────

const MAX_LINE_CHARS = 42;
const MAX_CUE_DURATION = 7;
const PAUSE_THRESHOLD = 0.4;
const MIN_CUE_GAP = 0.04;

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatVTTTime(seconds: number): string {
  return formatSRTTime(seconds).replace(",", ".");
}

function groupWordsIntoLines(words: Word[]): Word[][] {
  const groups: Word[][] = [];
  const onlyWords = words.filter(w => w.type === "word");
  let current: Word[] = [];
  const flush = () => { if (current.length > 0) { groups.push(current); current = []; } };
  for (let i = 0; i < onlyWords.length; i++) {
    const word = onlyWords[i];
    const prev = current[current.length - 1];
    if (current.length === 0) { current.push(word); continue; }
    const projectedText = current.map(w => w.text).join(" ") + " " + word.text;
    const duration = word.end - current[0].start;
    const hasPause = (word.start - prev.end) >= PAUSE_THRESHOLD;
    const prevEndsLine = /[.!?]$/.test(prev.text.trim());
    if (hasPause || projectedText.length > MAX_LINE_CHARS || duration > MAX_CUE_DURATION || (prevEndsLine && current.length >= 3)) {
      flush();
    }
    current.push(word);
  }
  flush();
  return groups;
}

function buildCues(words: Word[]) {
  const groups = groupWordsIntoLines(words);
  return groups.map((group, i, arr) => {
    const start = group[0].start;
    const rawEnd = group[group.length - 1].end;
    const nextStart = arr[i + 1]?.[0]?.start;
    const end = nextStart !== undefined ? Math.min(rawEnd, nextStart - MIN_CUE_GAP) : rawEnd;
    return { start, end: Math.max(start + 0.1, end), text: group.map(w => w.text).join(" ").trim() };
  });
}

function generateSRT(words: Word[]): string {
  return buildCues(words).map((cue, i) =>
    `${i + 1}\n${formatSRTTime(cue.start)} --> ${formatSRTTime(cue.end)}\n${cue.text}`
  ).join("\n\n");
}

function generateVTT(words: Word[]): string {
  const cues = buildCues(words).map(cue =>
    `${formatVTTTime(cue.start)} --> ${formatVTTTime(cue.end)}\n${cue.text}`
  ).join("\n\n");
  return `WEBVTT\n\n${cues}`;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${["B","KB","MB","GB"][i]}`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// ─── Progress stages ──────────────────────────────────────────────────────────

type Stage = "idle" | "uploading" | "transcribing" | "processing" | "done";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "",
  uploading: "Uploading file...",
  transcribing: "Transcribing via Scribe-v2...",
  processing: "Processing results...",
  done: "Done",
};

// Progress ranges per stage (within 0–100)
const STAGE_RANGE: Record<Stage, [number, number]> = {
  idle: [0, 0],
  uploading: [0, 30],
  transcribing: [32, 88],
  processing: [90, 98],
  done: [100, 100],
};

// ─── Progress panel ───────────────────────────────────────────────────────────

function ProgressPanel({ stage, progress }: { stage: Stage; progress: number }) {
  const stages: Stage[] = ["uploading", "transcribing", "processing", "done"];
  const currentIdx = stages.indexOf(stage);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-5">
        {/* Stage pipeline */}
        <div className="flex items-center gap-1 mb-4">
          {stages.map((s, i) => {
            const isActive = s === stage;
            const isDone = currentIdx > i;
            return (
              <React.Fragment key={s}>
                <div className={`flex-1 h-0.5 rounded-full transition-colors duration-500 ${
                  isDone ? "bg-primary" : isActive ? "bg-primary/60" : "bg-muted"
                }`} />
                {i < stages.length - 1 && (
                  <ChevronRight className={`w-3 h-3 shrink-0 transition-colors duration-300 ${
                    isDone || isActive ? "text-primary" : "text-muted-foreground/30"
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Bar */}
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-3">
          <motion.div
            className="h-full bg-primary rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>

        {/* Label + % */}
        <div className="flex items-center justify-between">
          <AnimatePresence mode="wait">
            <motion.span
              key={stage}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-xs font-mono text-primary"
            >
              {STAGE_LABELS[stage]}
            </motion.span>
          </AnimatePresence>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {Math.round(progress)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SubtitleGenerator() {
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<TranscribeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Smoothly tick progress toward a ceiling within the current stage's range
  const startTick = useCallback((s: Stage, tickMs = 600) => {
    clearTimer();
    const [lo, hi] = STAGE_RANGE[s];
    let current = lo;
    setProgress(lo);
    timerRef.current = setInterval(() => {
      const increment = Math.max(0.4, (hi - current) * 0.03);
      current = Math.min(hi - 0.5, current + increment);
      setProgress(current);
    }, tickMs);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  const handleFileSelect = (selectedFile: File) => {
    setError(null); setResult(null);
    if (selectedFile.size > 500 * 1024 * 1024) {
      setError("File exceeds maximum size of 500MB"); return;
    }
    const validTypes = ["video/mp4","video/x-matroska","video/quicktime","video/x-msvideo","video/webm","audio/mpeg","audio/wav","audio/ogg","audio/mp4","audio/x-m4a","audio/flac","audio/aac"];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(mp4|mkv|mov|avi|webm|mp3|wav|ogg|m4a|flac|aac)$/i)) {
      setError("Unsupported file format. Please upload a valid audio or video file."); return;
    }
    setFile(selectedFile);
  };

  const handleGenerate = async () => {
    if (!file) return;

    setIsTranscribing(true);
    setError(null);

    // Stage 1 — uploading (simulated; ticks to ~30%)
    setStage("uploading");
    // Estimate upload duration based on file size (~2 MB/s through proxy)
    const uploadEstimateMs = Math.max(1500, (file.size / (2 * 1024 * 1024)) * 1000);
    const uploadTickMs = uploadEstimateMs / 30; // ~30 ticks to fill the range
    startTick("uploading", uploadTickMs);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const fetchPromise = fetch("/api/transcribe", { method: "POST", body: formData });

      // Switch to transcribing stage after estimated upload completes
      await new Promise(r => setTimeout(r, uploadEstimateMs));
      setStage("transcribing");
      startTick("transcribing", 700);

      const response = await fetchPromise;

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Server error: ${response.statusText}`);
      }

      const data: TranscribeResponse = await response.json();

      // Stage 3 — processing
      clearTimer();
      setStage("processing");
      setProgress(STAGE_RANGE["processing"][0]);
      await new Promise(r => setTimeout(r, 400));

      // Done
      setStage("done");
      setProgress(100);
      await new Promise(r => setTimeout(r, 350));

      setResult(data);
      setIsTranscribing(false);
      setStage("idle");

    } catch (err) {
      clearTimer();
      setIsTranscribing(false);
      setStage("idle");
      const msg = err instanceof Error ? err.message : "An unknown error occurred";
      setError(msg);
      toast({ title: "Transcription Failed", description: msg, variant: "destructive" });
    }
  };

  const handleCopyText = () => {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied", description: "Transcript copied to clipboard." });
  };

  const handleDownloadSRT = () => {
    if (!result?.words) return;
    const stem = file?.name.replace(/\.[^.]+$/, "") ?? "subtitles";
    downloadFile(generateSRT(result.words), `${stem}.srt`, "text/plain");
  };

  const handleDownloadVTT = () => {
    if (!result?.words) return;
    const stem = file?.name.replace(/\.[^.]+$/, "") ?? "subtitles";
    downloadFile(generateVTT(result.words), `${stem}.vtt`, "text/vtt");
  };

  const wordCount = result?.words.filter(w => w.type === "word").length ?? 0;
  const estimatedDuration = result?.words.length
    ? result.words[result.words.length - 1].end - result.words[0].start : 0;

  return (
    <div className="container max-w-5xl mx-auto py-10 px-4 flex flex-col min-h-screen">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
              <FileAudio className="w-5 h-5" />
            </span>
            Scribe Studio
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-wider">Professional Subtitle Generator</p>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT — upload + progress */}
        <div className="lg:col-span-4 flex flex-col gap-4">

          <Card className="border-border bg-card shadow-2xl">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Input Source</CardTitle>
              <CardDescription>Select an audio or video file</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`relative border-2 border-dashed rounded-lg p-8 transition-colors flex flex-col items-center justify-center text-center cursor-pointer min-h-[180px] ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : file ? "border-muted-foreground/30 bg-muted/20" : "border-muted hover:border-primary/50 hover:bg-muted/30"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone"
              >
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".mp4,.mkv,.mov,.avi,.webm,.mp3,.wav,.ogg,.m4a,.flac,.aac"
                  data-testid="file-input"
                />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-secondary rounded-full">
                      {file.type.startsWith("video") ? (
                        <FileVideo className="w-8 h-8 text-primary" />
                      ) : (
                        <FileAudio className="w-8 h-8 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{file.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-secondary rounded-full">
                      <UploadCloud className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Click or drag file here</p>
                      <p className="text-xs text-muted-foreground mt-1">MP4, MP3, WAV, etc. up to 500MB</p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3 text-sm text-destructive-foreground">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <Button
                className="w-full mt-5 font-semibold"
                size="lg"
                disabled={!file || isTranscribing}
                onClick={handleGenerate}
                data-testid="button-generate"
              >
                {isTranscribing ? "Processing..." : "Generate Subtitles"}
              </Button>
            </CardContent>
          </Card>

          <AnimatePresence>
            {isTranscribing && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <ProgressPanel stage={stage} progress={progress} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT — results */}
        <div className="lg:col-span-8">
          {result ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <Card className="border-border bg-card shadow-2xl overflow-hidden flex flex-col h-[700px]">
                <div className="bg-secondary px-6 py-4 flex items-center justify-between border-b border-border">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="bg-background text-primary font-mono border-primary/30 uppercase">
                      {result.language_code}
                    </Badge>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
                      <span data-testid="text-wordcount">{wordCount} words</span>
                      <span>•</span>
                      <span data-testid="text-duration">{formatDuration(estimatedDuration)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={handleDownloadSRT} data-testid="btn-download-srt">
                      <Download className="w-4 h-4 mr-2" />SRT
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleDownloadVTT} data-testid="btn-download-vtt">
                      <Download className="w-4 h-4 mr-2" />VTT
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-background border-b border-border flex justify-between items-center">
                  <span className="text-sm font-medium text-foreground">Transcript</span>
                  <Button variant="ghost" size="sm" onClick={handleCopyText} className="h-8 text-muted-foreground hover:text-foreground" data-testid="btn-copy">
                    {copied ? <Check className="w-4 h-4 mr-2 text-primary" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>

                <ScrollArea className="flex-1 p-6">
                  <div className="prose prose-invert max-w-none text-lg leading-relaxed text-muted-foreground selection:bg-primary/30 selection:text-foreground">
                    {result.words.map((word, i) => (
                      <span key={i} className={word.type === "word" ? "text-foreground hover:text-primary transition-colors cursor-default" : ""}>
                        {word.text}
                      </span>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            </motion.div>
          ) : (
            <Card className="border-border bg-card shadow-2xl h-[700px] flex items-center justify-center opacity-50">
              <div className="text-center flex flex-col items-center max-w-sm px-6">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Awaiting Input</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Upload an audio or video file to generate broadcast-grade subtitles. Results will appear here.
                </p>
              </div>
            </Card>
          )}
        </div>

      </main>
    </div>
  );
}
