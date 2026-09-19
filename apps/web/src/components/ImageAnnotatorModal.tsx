"use client";

import { useState, useRef, useEffect, useCallback, MouseEvent, TouchEvent } from "react";
import type { ArtifactRef } from "./LongInputModal";

interface ImageAnnotatorModalProps {
  artifact: ArtifactRef | null;
  onClose: () => void;
  onSaveAnnotatedCopy: (newArtifact: ArtifactRef) => void;
  activeMissionId?: string | null;
  onError?: (msg: string) => void;
}

type ToolMode = "pen" | "eraser" | "text";

const COLOR_OPTIONS = [
  { label: "Branco", value: "#ffffff" },
  { label: "Vermelho", value: "#ef4444" },
  { label: "Verde", value: "#22c55e" },
  { label: "Amarelo", value: "#eab308" },
];

const STROKE_OPTIONS = [
  { label: "Fino", value: 2 },
  { label: "Médio", value: 5 },
  { label: "Grosso", value: 10 },
];

export function ImageAnnotatorModal({
  artifact,
  onClose,
  onSaveAnnotatedCopy,
  activeMissionId,
  onError,
}: ImageAnnotatorModalProps) {
  const [tool, setTool] = useState<ToolMode>("pen");
  const [color, setColor] = useState("#ef4444");
  const [lineWidth, setLineWidth] = useState(5);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Text tool state
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  const imageUrl = artifact?.thumbnailUrl || "";

  // Reset state when artifact changes
  useEffect(() => {
    if (!artifact) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setTextPos(null);
      setTextInput("");
      setImageLoaded(false);
    }
  }, [artifact]);

  // Handle ESC key
  useEffect(() => {
    if (!artifact) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [artifact, onClose]);

  // Handle window resize / overlay sync
  const updateCanvasDimensions = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  const handleImageLoad = () => {
    setImageLoaded(true);
    updateCanvasDimensions();
  };

  // Convert client click/touch to canvas internal coordinates
  const getCanvasCoordinates = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Drawing handlers
  const startDrawing = (clientX: number, clientY: number) => {
    if (tool === "text") {
      const coords = getCanvasCoordinates(clientX, clientY);
      if (coords) {
        setTextPos(coords);
      }
      return;
    }

    const coords = getCanvasCoordinates(clientX, clientY);
    if (!coords) return;

    isDrawingRef.current = true;
    lastPosRef.current = coords;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = lineWidth * 3;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }

    ctx.arc(coords.x, coords.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = (clientX: number, clientY: number) => {
    if (!isDrawingRef.current || tool === "text") return;
    const coords = getCanvasCoordinates(clientX, clientY);
    if (!coords || !lastPosRef.current) return;

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = lineWidth * 3;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }

    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    lastPosRef.current = coords;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  };

  // Mouse / Touch Event Wrappers
  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    startDrawing(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    draw(e.clientX, e.clientY);
  };

  const handleMouseUp = () => stopDrawing();

  const handleTouchStart = (e: TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      startDrawing(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      draw(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => stopDrawing();

  // Handle placing text on canvas
  const handleApplyText = () => {
    if (!textInput.trim() || !textPos || !canvasRef.current) {
      setTextPos(null);
      setTextInput("");
      return;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      const fontSize = Math.max(20, Math.round(canvasRef.current.width / 35));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(textInput.trim(), textPos.x, textPos.y);
    }

    setTextInput("");
    setTextPos(null);
  };

  // Clear annotation layer
  const handleClearAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Zoom & Pan
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom((prev) => Math.min(Math.max(0.5, prev + delta), 4));
  };

  const handleContainerMouseDown = (e: MouseEvent) => {
    if (e.target === containerRef.current || (e.button === 1)) { // Middle click or background drag
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleContainerMouseMove = (e: MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handleContainerMouseUp = () => {
    setIsPanning(false);
  };

  // Save Annotated Copy
  const handleSave = async () => {
    if (!artifact || isSaving || !imageRef.current) return;
    setIsSaving(true);

    try {
      const img = imageRef.current;
      const annotationCanvas = canvasRef.current;

      // Offscreen composite canvas
      const compositeCanvas = document.createElement("canvas");
      compositeCanvas.width = img.naturalWidth;
      compositeCanvas.height = img.naturalHeight;

      const ctx = compositeCanvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível carregar contexto 2D");

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Draw annotation layer
      if (annotationCanvas) {
        ctx.drawImage(annotationCanvas, 0, 0);
      }

      const blob = await new Promise<Blob | null>((resolve) =>
        compositeCanvas.toBlob(resolve, "image/png")
      );

      if (!blob) throw new Error("Falha ao gerar imagem composta");

      const baseName = artifact.name.replace(/\.[^/.]+$/, "");
      const fileName = `${baseName}_anotado.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const formData = new FormData();
      formData.append("file", file);
      if (activeMissionId) formData.append("missionId", activeMissionId);

      const res = await fetch("/api/artifacts", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.artifact) {
        throw new Error(data.error || "Falha ao salvar versão anotada");
      }

      const meta = data.artifact.metadata || {};
      const isImg = Boolean(meta.isImage) || (data.artifact.type && data.artifact.type.startsWith("image/"));
      const thumbnailUrl = isImg ? ((meta.blobUrl as string) || (meta.dataUrl as string) || undefined) : undefined;

      onSaveAnnotatedCopy({
        id: data.artifact.id,
        name: data.artifact.name,
        type: data.artifact.type,
        size: data.artifact.size,
        thumbnailUrl,
      });

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar anotação";
      onError?.(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (!artifact) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-black/85 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      {/* Header Toolbar */}
      <div
        className="shrink-0 flex items-center justify-between p-3 px-4 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-[320px]">
            {artifact.name}
          </span>
          {naturalDimensions.width > 0 && (
            <span className="text-[10px] font-mono text-[var(--text-muted)] hidden sm:inline">
              {naturalDimensions.width}x{naturalDimensions.height}px
            </span>
          )}
        </div>

        {/* Tools Toolbar */}
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <div className="flex items-center bg-[var(--base)] rounded-xl p-1 border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setTool("pen")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tool === "pen"
                  ? "bg-[var(--surface)] text-[var(--selo)] border border-[var(--border)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              ✏️ Caneta
            </button>
            <button
              type="button"
              onClick={() => setTool("text")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tool === "text"
                  ? "bg-[var(--surface)] text-[var(--selo)] border border-[var(--border)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Aa Texto
            </button>
            <button
              type="button"
              onClick={() => setTool("eraser")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tool === "eraser"
                  ? "bg-[var(--surface)] text-[var(--selo)] border border-[var(--border)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              🧹 Borracha
            </button>
          </div>

          {/* Color selector */}
          {tool !== "eraser" && (
            <div className="flex items-center gap-1.5 bg-[var(--base)] p-1.5 rounded-xl border border-[var(--border)]">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  style={{ backgroundColor: c.value }}
                  className={`w-5 h-5 rounded-full border cursor-pointer transition-transform ${
                    color === c.value ? "scale-125 border-white ring-2 ring-[var(--selo)]" : "border-black/30 opacity-80 hover:opacity-100"
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          )}

          {/* Stroke width selector */}
          {tool === "pen" && (
            <div className="flex items-center gap-1 bg-[var(--base)] p-1 rounded-xl border border-[var(--border)]">
              {STROKE_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setLineWidth(s.value)}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono cursor-pointer ${
                    lineWidth === s.value ? "bg-[var(--surface)] text-[var(--selo)] font-bold" : "text-[var(--text-muted)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleClearAll}
            className="px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors cursor-pointer"
            title="Limpar anotações"
          >
            Limpar
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSave()}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--selo)] text-[var(--base)] text-xs font-semibold hover:bg-[var(--nucleo)] transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {isSaving ? "Salvando…" : "Salvar cópia"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border border-[var(--border)] bg-[var(--base)] hover:bg-[var(--surface)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Image View Container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        className="flex-1 relative overflow-hidden flex items-center justify-center p-4 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative transition-transform duration-75 ease-out flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Base Image */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt={artifact.name}
            onLoad={handleImageLoad}
            className="max-w-[85vw] max-h-[75vh] object-contain rounded-lg shadow-2xl pointer-events-none border border-[var(--border)]/40"
          />

          {/* Overlaid Annotation Canvas */}
          {imageLoaded && (
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`absolute top-0 left-0 w-full h-full rounded-lg touch-none ${
                tool === "text" ? "cursor-text" : "cursor-crosshair"
              }`}
            />
          )}

          {/* Floating Input for Text Tool */}
          {textPos && (
            <div
              className="absolute z-20 flex items-center gap-1 bg-[var(--surface)] border border-[var(--selo)] p-1.5 rounded-xl shadow-xl"
              style={{
                left: `${(textPos.x / (naturalDimensions.width || 1)) * 100}%`,
                top: `${(textPos.y / (naturalDimensions.height || 1)) * 100}%`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                autoFocus
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyText();
                  if (e.key === "Escape") setTextPos(null);
                }}
                placeholder="Digite seu texto…"
                style={{ color }}
                className="bg-[var(--base)] px-2 py-1 text-xs rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--selo)] font-bold"
              />
              <button
                type="button"
                onClick={handleApplyText}
                className="px-2 py-1 bg-[var(--selo)] text-[var(--base)] rounded-lg text-xs font-semibold cursor-pointer"
              >
                OK
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer controls */}
      <div
        className="shrink-0 py-2 px-4 bg-[var(--surface)]/80 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span>Zoom: {Math.round(zoom * 100)}% (Use a roda do mouse / pinch)</span>
        <span>Arraste pelo fundo para mover a imagem</span>
      </div>
    </div>
  );
}
