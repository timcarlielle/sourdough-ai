"use client";

import { useState, useRef, useEffect } from "react";

type Props = { bakeId?: string };

const WAVEFORM_HEIGHT = 56;
const WAVEFORM_BUFFER_LENGTH = 400;
const WAVEFORM_SMOOTH = 0.35; // 0–1, lower = smoother

export function VoiceLogWidget({ bakeId }: Props) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const levelBufferRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
      audioContextRef.current?.close();
    };
  }, []);

  function drawWaveform(analyser: AnalyserNode, buffer: number[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio ?? 1);
    if (buffer.length === 0 && canvas.parentElement) {
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = Math.round((rect.width || 400) * dpr);
      const h = Math.round(WAVEFORM_HEIGHT * dpr);
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const centerY = height / 2;

    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(1, rms * 3);
    const smoothed =
      buffer.length > 0
        ? buffer[buffer.length - 1]! * (1 - WAVEFORM_SMOOTH) + level * WAVEFORM_SMOOTH
        : level;

    buffer.push(smoothed);
    if (buffer.length > WAVEFORM_BUFFER_LENGTH) buffer.shift();

    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(0, 0, width, height);

    const sliceWidth = width / WAVEFORM_BUFFER_LENGTH;

    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let i = 0; i < buffer.length; i++) {
      const x = i * sliceWidth;
      const amp = buffer[i]! * (height / 2) * 0.85;
      const yTop = centerY - amp;
      const yBottom = centerY + amp;
      if (i === 0) {
        ctx.lineTo(x, yTop);
      } else {
        ctx.lineTo(x, yTop);
      }
    }
    for (let i = buffer.length - 1; i >= 0; i--) {
      const x = i * sliceWidth;
      const amp = buffer[i]! * (height / 2) * 0.85;
      const yBottom = centerY + amp;
      ctx.lineTo(x, yBottom);
    }
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(180, 83, 9, 0.08)");
    gradient.addColorStop(0.5, "rgba(180, 83, 9, 0.25)");
    gradient.addColorStop(1, "rgba(180, 83, 9, 0.4)");
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 83, 9, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function tick(analyser: AnalyserNode, buffer: number[]) {
    drawWaveform(analyser, buffer);
    animationRef.current = requestAnimationFrame(() => tick(analyser, buffer));
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      levelBufferRef.current = [];

      const ac = new AudioContext();
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioContextRef.current = ac;
      analyserRef.current = analyser;

      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
        ac.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await uploadBlob(blob);
      };

      mr.start();
      setRecording(true);
      setMessage(null);

      tick(analyser, levelBufferRef.current);
    } catch (e) {
      setMessage({ type: "err", text: "Microphone access denied or unavailable." });
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setRecording(false);
    }
  }

  async function uploadBlob(blob: Blob) {
    setUploading(true);
    setMessage(null);
    const form = new FormData();
    form.append("audio", blob, "voice.webm");
    if (bakeId) form.append("bakeId", bakeId);
    try {
      const res = await fetch("/api/voice/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "err", text: data.error ?? "Upload failed." });
        return;
      }
      setMessage({ type: "ok", text: "Logged. Processing… You can add another or refresh to see results." });
    } catch {
      setMessage({ type: "err", text: "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h3 className="font-medium text-stone-800">Voice log</h3>
      <p className="mt-1 text-sm text-stone-500">
        Record a short note (e.g. feeding amounts or a bake milestone). It will be transcribed and saved automatically.
      </p>

      {recording && (
        <div
          className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-stone-50"
          style={{ height: WAVEFORM_HEIGHT }}
        >
          <canvas
            ref={canvasRef}
            className="block w-full rounded-md"
            style={{ width: "100%", height: WAVEFORM_HEIGHT, display: "block" }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={uploading}
            className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Record"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          >
            Stop & save
          </button>
        )}
      </div>
      {message && (
        <p className={`mt-2 text-sm ${message.type === "ok" ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
