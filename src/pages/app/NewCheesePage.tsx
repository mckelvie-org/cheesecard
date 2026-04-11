import { useState, useRef, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { applyPerspective, detectCardCorners } from "@/lib/opencv";
import type { CardDetectionResult } from "@/lib/opencv";

interface CheeseMetadata {
  name: string;
  country: string;
  region: string;
  milk_type: string;
  description: string;
  food_pairings: string[];
  wine_pairings: string[];
}

interface PhotoPair {
  frontFile: File;
  frontUrl: string;
  backFile: File;
  backUrl: string;
}

type Step = "photos" | "metadata";
type CardSide = "front" | "back";

interface AdjustingState {
  file: File;
  url: string;
  side: CardSide;
}

export default function NewCheesePage() {
  const { id: tastingId } = useParams<{ id: string }>();
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<PhotoPair | null>(null);
  const [metadata, setMetadata] = useState<CheeseMetadata | null>(null);

  if (step === "photos") {
    return (
      <div className="space-y-6">
        <div>
          <Link to={`/tastings/${tastingId}`} className="text-sm text-amber-700 hover:underline">
            ← Back to tasting
          </Link>
          <h1 className="text-2xl font-bold text-amber-900 mt-2">Add Cheese</h1>
        </div>
        <CardPhotoStep
          onComplete={(p, m) => {
            setPhotos(p);
            setMetadata(m);
            setStep("metadata");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-amber-900">Cheese Details</h1>
      <MetadataStep
        tastingId={tastingId!}
        photos={photos!}
        initialMetadata={metadata!}
        onBack={() => setStep("photos")}
      />
    </div>
  );
}

// ─── CardPhotoStep ────────────────────────────────────────────────────────────

function CardPhotoStep({
  onComplete,
}: {
  onComplete: (photos: PhotoPair, metadata: CheeseMetadata) => void;
}) {
  const [front, setFront] = useState<{ file: File; url: string } | null>(null);
  const [back, setBack] = useState<{ file: File; url: string } | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustingState | null>(null);
  const [extracting, setExtracting] = useState(false);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const frontLibraryRef = useRef<HTMLInputElement>(null);
  const backLibraryRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = useCallback((file: File, side: CardSide) => {
    setAdjusting({ file, url: URL.createObjectURL(file), side });
  }, []);

  const handleAdjustConfirm = useCallback((correctedFile: File, side: CardSide) => {
    const url = URL.createObjectURL(correctedFile);
    if (side === "front") setFront({ file: correctedFile, url });
    else setBack({ file: correctedFile, url });
    setAdjusting(null);
  }, []);

  const handleRetake = useCallback((side: CardSide) => {
    setAdjusting(null);
    setTimeout(() => {
      if (side === "front") frontInputRef.current?.click();
      else backInputRef.current?.click();
    }, 50);
  }, []);

  const handleExtract = async () => {
    if (!front || !back) return;
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("back", back.file);
      formData.append("front", front.file);
      // Use invoke() so the SDK handles token refresh and auth headers
      const { data: metadata, error } = await createClient().functions.invoke("extract-metadata", { body: formData });
      if (error) throw error;
      onComplete({ frontFile: front.file, frontUrl: front.url, backFile: back.file, backUrl: back.url }, metadata);
    } catch (err) {
      console.error("extract-metadata failed:", err);
      toast.error(`Failed to extract metadata: ${err instanceof Error ? err.message : String(err)}`);
      onComplete(
        { frontFile: front.file, frontUrl: front.url, backFile: back.file, backUrl: back.url },
        { name: "", country: "", region: "", milk_type: "", description: "", food_pairings: [], wine_pairings: [] }
      );
    } finally {
      setExtracting(false);
    }
  };

  if (adjusting) {
    return (
      <CornerAdjustView
        imageFile={adjusting.file}
        imageUrl={adjusting.url}
        onConfirm={(corrected) => handleAdjustConfirm(corrected, adjusting.side)}
        onRetake={() => handleRetake(adjusting.side)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Photograph the front and back of the cheese card. You&apos;ll crop each photo before confirming.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {(["front", "back"] as CardSide[]).map((side) => {
          const photo = side === "front" ? front : back;
          const inputRef = side === "front" ? frontInputRef : backInputRef;
          const libraryRef = side === "front" ? frontLibraryRef : backLibraryRef;
          const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handlePhotoSelect(file, side);
            e.target.value = "";
          };
          return (
            <div key={side} className="flex flex-col gap-1">
              {/* Camera input (primary) */}
              <input ref={inputRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={onChange} />
              {/* Library input (secondary — no capture attribute) */}
              <input ref={libraryRef} type="file" accept="image/*"
                className="hidden" onChange={onChange} />

              {/* Portrait 4:7 thumbnail — tap to open camera */}
              <div
                className="border-2 border-dashed border-amber-200 rounded-xl cursor-pointer hover:border-amber-400 transition-colors overflow-hidden relative"
                style={{ aspectRatio: "4/7" }}
                onClick={() => inputRef.current?.click()}
              >
                {photo ? (
                  <img src={photo.url} alt={`Card ${side}`}
                    className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <span className="text-3xl">📷</span>
                    <p className="text-sm font-medium capitalize text-amber-800">{side}</p>
                    <p className="text-xs text-gray-400">Tap to capture</p>
                  </div>
                )}
              </div>

              {/* Library picker — secondary, low-prominence */}
              <button
                type="button"
                className="text-xs text-amber-700/60 hover:text-amber-700 text-center py-0.5"
                onClick={() => libraryRef.current?.click()}
              >
                📁 library
              </button>
            </div>
          );
        })}
      </div>

      <Button onClick={handleExtract} disabled={!front || !back || extracting} className="w-full">
        {extracting ? "Extracting info..." : "Extract Cheese Info →"}
      </Button>
    </div>
  );
}

// ─── CornerAdjustView ─────────────────────────────────────────────────────────

interface CornerAdjustViewProps {
  imageFile: File;
  imageUrl: string;
  onConfirm: (corrected: File) => void;
  onRetake: () => void;
}

function CornerAdjustView({ imageFile, imageUrl, onConfirm, onRetake }: CornerAdjustViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);

  const [corners, setCorners] = useState<[number, number][]>([[0, 0], [1, 0], [1, 1], [0, 1]]);
  const cornersRef = useRef<[number, number][]>([[0, 0], [1, 0], [1, 1], [0, 1]]);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [loupeVisible, setLoupeVisible] = useState(false);
  const [detecting, setDetecting] = useState(true);
  const [applying, setApplying] = useState(false);
  const [hullDisplay, setHullDisplay] = useState<[number, number][] | null>(null);

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    setImgSize({ w, h });
    // Default to 5% inset so handles are visible and away from screen edges
    const i = 0.05;
    const inset: [number, number][] = [[w*i, h*i], [w*(1-i), h*i], [w*(1-i), h*(1-i)], [w*i, h*(1-i)]];
    cornersRef.current = inset;
    setCorners(inset);

    detectCardCorners(imageFile).then((result: CardDetectionResult | null) => {
      if (result && imgRef.current) {
        const scaleX = imgRef.current.clientWidth / imgRef.current.naturalWidth;
        const scaleY = imgRef.current.clientHeight / imgRef.current.naturalHeight;
        const mapped = result.corners.map(([x, y]) => [x * scaleX, y * scaleY] as [number, number]);
        cornersRef.current = mapped;
        setCorners(mapped);
        setHullDisplay(result.hull.map(([x, y]) => [x * scaleX, y * scaleY]));
      }
      setDetecting(false);
    }).catch((err) => {
      console.error("[corners] detectCardCorners rejected:", err);
      setDetecting(false);
    });
  }, [imageFile]);

  const drawLoupe = useCallback((dispX: number, dispY: number, activeIdx: number) => {
    const img = imgRef.current;
    const canvas = loupeRef.current;
    if (!img || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    const imgX = dispX * scaleX;
    const imgY = dispY * scaleY;

    // Show ~60 display pixels each side → 1.33× zoom at 160px canvas
    const srcHalfW = 60 * scaleX;
    const srcHalfH = 60 * scaleY;

    ctx.clearRect(0, 0, 160, 160);

    // Clip everything to the circular loupe boundary
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 80, 80, 0, Math.PI * 2);
    ctx.clip();

    // Cross-hatch background — drawn in canvas so it works on iOS Safari
    // (CSS background on <canvas> doesn't reliably show through transparent pixels there)
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, 160, 160);
    ctx.save();
    ctx.strokeStyle = "#383838";
    ctx.lineWidth = 1.5;
    for (let i = -160; i < 320; i += 14) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 160, 160); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 160); ctx.lineTo(i + 160, 0); ctx.stroke();
    }
    ctx.restore();

    // Draw only the valid image region (clamp source rect to image bounds).
    const srcLeft = imgX - srcHalfW;
    const srcTop = imgY - srcHalfH;
    const srcRight = imgX + srcHalfW;
    const srcBot = imgY + srcHalfH;
    const clampedLeft = Math.max(0, srcLeft);
    const clampedTop = Math.max(0, srcTop);
    const clampedRight = Math.min(img.naturalWidth, srcRight);
    const clampedBot = Math.min(img.naturalHeight, srcBot);
    if (clampedRight > clampedLeft && clampedBot > clampedTop) {
      const totalW = srcRight - srcLeft;
      const totalH = srcBot - srcTop;
      const destLeft = ((clampedLeft - srcLeft) / totalW) * 160;
      const destTop = ((clampedTop - srcTop) / totalH) * 160;
      const destW = ((clampedRight - clampedLeft) / totalW) * 160;
      const destH = ((clampedBot - clampedTop) / totalH) * 160;
      ctx.drawImage(img, clampedLeft, clampedTop, clampedRight - clampedLeft, clampedBot - clampedTop, destLeft, destTop, destW, destH);
    }

    // Draw edge lines toward the two adjacent corners (shows card edge direction)
    // loupe canvas px per display px: 160 / (60*2) = 160/120 ≈ 1.333
    const loupeScale = 160 / 120;
    const current = cornersRef.current;
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    for (const adjIdx of [(activeIdx + 3) % 4, (activeIdx + 1) % 4]) {
      const dx = (current[adjIdx][0] - dispX) * loupeScale;
      const dy = (current[adjIdx][1] - dispY) * loupeScale;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;
      // Project line out to the circle edge (radius 80)
      const t = 80 / len;
      ctx.beginPath();
      ctx.moveTo(80, 80);
      ctx.lineTo(80 + dx * t, 80 + dy * t);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Amber crosshair (drawn on top, outside clip so it's always sharp)
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, 56); ctx.lineTo(80, 104);
    ctx.moveTo(56, 80); ctx.lineTo(104, 80);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(80, 80, 6, 0, Math.PI * 2);
    ctx.stroke();
  }, []);

  const HANDLE_R = 22;

  // onPointerDown on the SVG element — find the closest corner within tap radius
  const onSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!imgSize) return;
    const [px, py] = [e.clientX - containerRef.current!.getBoundingClientRect().left,
                      e.clientY - containerRef.current!.getBoundingClientRect().top];
    let best = -1, bestDist = HANDLE_R * 2; // generous tap target
    cornersRef.current.forEach(([cx, cy], i) => {
      const d = Math.hypot(px - cx, py - cy);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    if (best < 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(best);
    setLoupeVisible(true);
    const cx = Math.max(0, Math.min(imgSize.w, px));
    const cy = Math.max(0, Math.min(imgSize.h, py));
    drawLoupe(cx, cy, best);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgSize, drawLoupe]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (dragging === null || !imgSize) return;
    e.preventDefault();
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = Math.max(0, Math.min(imgSize.w, x));
    const cy = Math.max(0, Math.min(imgSize.h, y));
    const newCorners = cornersRef.current.map((c, i) => i === dragging ? [cx, cy] : c) as [number, number][];
    cornersRef.current = newCorners;
    setCorners(newCorners);
    drawLoupe(cx, cy, dragging);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, imgSize, drawLoupe]);

  const stopDrag = useCallback(() => {
    setDragging(null);
    setLoupeVisible(false);
  }, []);

  const handleCrop = async () => {
    const img = imgRef.current;
    if (!img) return;
    setApplying(true);
    try {
      const scaleX = img.naturalWidth / img.clientWidth;
      const scaleY = img.naturalHeight / img.clientHeight;
      const imageCorners = corners.map(([x, y]) => [
        Math.max(0, Math.min(img.naturalWidth, Math.round(x * scaleX))),
        Math.max(0, Math.min(img.naturalHeight, Math.round(y * scaleY))),
      ] as [number, number]);
      const result = await applyPerspective(imageFile, imageCorners);
      onConfirm(result);
    } catch {
      toast.error("Failed to crop image");
      setApplying(false);
    }
  };

  // Always-clamped corners for display — belt-and-suspenders in case onMove
  // fails to clamp (e.g. stale closure, missed events, etc.)
  const dispCorners: [number, number][] = imgSize
    ? corners.map(([x, y]) => [
        Math.max(0, Math.min(imgSize.w, x)),
        Math.max(0, Math.min(imgSize.h, y)),
      ] as [number, number])
    : corners;

  // Even-odd path: full image rect minus the quad = dark region outside selection
  const dimPath = imgSize
    ? `M0,0 H${imgSize.w} V${imgSize.h} H0 Z M${dispCorners.map(([x, y]) => `${x},${y}`).join(" L")} Z`
    : "";

  return (
    <div className="space-y-3">
      {/* Full-screen overlay while dragging — covers buttons so pointer release
          can't accidentally trigger Retake. Works around iOS SVG pointer-capture quirks. */}
      {dragging !== null && (
        <div
          className="fixed inset-0 z-40 touch-none"
          style={{ cursor: "grabbing" }}
          onPointerMove={onMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        />
      )}

      {/* Loupe: fixed to viewport top-center, always in DOM so ref is valid */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full border-2 border-amber-400 shadow-xl overflow-hidden"
        style={{ top: "64px", visibility: loupeVisible ? "visible" : "hidden" }}
      >
        <canvas
          ref={loupeRef}
          width={160}
          height={160}
          style={{
            background: "repeating-linear-gradient(45deg, #1e1e1e 0px, #1e1e1e 6px, #353535 6px, #353535 12px), repeating-linear-gradient(-45deg, #1e1e1e 0px, #1e1e1e 6px, #353535 6px, #353535 12px)",
          }}
        />
      </div>

      <p className="text-sm text-gray-500">
        Drag corners to the card edges, then tap Crop.
      </p>

      {/* px-4 keeps handles away from screen edges (prevents iOS back-swipe) */}
      <div className="w-full flex justify-center px-4">
        <div
          ref={containerRef}
          className="relative touch-none select-none"
          style={{ display: "inline-block", overflow: "visible" }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Card photo"
            crossOrigin="anonymous"
            style={{
              display: "block",
              width: "auto",
              height: "auto",
              maxWidth: "100%",
              maxHeight: "calc(100svh - 200px)",
            }}
            onLoad={handleImgLoad}
          />

          {imgSize && (
            <svg
              className="absolute top-0 left-0"
              width={imgSize.w}
              height={imgSize.h}
              style={{ overflow: "visible", touchAction: "none", cursor: dragging !== null ? "grabbing" : "default" }}
              onPointerDown={onSvgPointerDown}
              onPointerMove={onMove}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              {/* Darken outside the selected quad */}
              <path d={dimPath} fill="rgba(0,0,0,0.45)" fillRule="evenodd" />
              {/* Convex hull from detection — shows what watershed found */}
              {hullDisplay && (
                <polygon
                  points={hullDisplay.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                  opacity="0.8"
                />
              )}
              {/* Quad outline */}
              <polygon
                points={dispCorners.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
              />
              {/* Corner handles — center tracks the clamped corner position */}
              {dispCorners.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={HANDLE_R}
                  fill="rgba(245,158,11,0.8)"
                  stroke="white"
                  strokeWidth="2.5"
                  style={{ pointerEvents: "none" }}
                />
              ))}
            </svg>
          )}

          {detecting && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-white text-sm bg-black/60 px-3 py-1 rounded-full">
                Detecting card...
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onRetake} disabled={applying}>
          ↩ Retake
        </Button>
        <Button onClick={handleCrop} disabled={applying || detecting} className="flex-1">
          {applying ? "Cropping..." : "Crop Card →"}
        </Button>
      </div>
    </div>
  );
}

// ─── MetadataStep ─────────────────────────────────────────────────────────────

function MetadataStep({
  tastingId,
  photos,
  initialMetadata,
  onBack,
}: {
  tastingId: string;
  photos: PhotoPair;
  initialMetadata: CheeseMetadata;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<CheeseMetadata>(initialMetadata);
  const [foodInput, setFoodInput] = useState("");
  const [wineInput, setWineInput] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState<{ id: string; name: string } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof CheeseMetadata, value: string) =>
    setMeta((m) => ({ ...m, [key]: value }));

  const addTag = (type: "food" | "wine", value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (type === "food") {
      setMeta((m) => ({ ...m, food_pairings: [...m.food_pairings, trimmed] }));
      setFoodInput("");
    } else {
      setMeta((m) => ({ ...m, wine_pairings: [...m.wine_pairings, trimmed] }));
      setWineInput("");
    }
  };

  const removeTag = (type: "food" | "wine", index: number) => {
    if (type === "food") {
      setMeta((m) => ({ ...m, food_pairings: m.food_pairings.filter((_, i) => i !== index) }));
    } else {
      setMeta((m) => ({ ...m, wine_pairings: m.wine_pairings.filter((_, i) => i !== index) }));
    }
  };

  const handleSave = async () => {
    if (!meta.name.trim()) { toast.error("Cheese name is required"); return; }
    setSaving(true);
    try {
      const supabase = createClient();

      // Duplicate check (case-insensitive exact match)
      const { data: existing } = await supabase
        .from("cheeses")
        .select("id, name")
        .ilike("name", meta.name.trim())
        .maybeSingle();
      if (existing) {
        setDuplicateMatch(existing as { id: string; name: string });
        setSaving(false);
        return;
      }

      const uploadImage = async (file: File, prefix: string) => {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${tastingId}/${prefix}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("card-images").upload(path, file, { contentType: file.type });
        if (error) throw error;
        return supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl;
      };
      const [frontUrl, backUrl] = await Promise.all([
        uploadImage(photos.frontFile, "front"),
        uploadImage(photos.backFile, "back"),
      ]);
      const { data, error } = await supabase
        .from("cheeses")
        .insert({
          name: meta.name,
          country: meta.country || null,
          region: meta.region || null,
          milk_type: meta.milk_type || null,
          description: meta.description || null,
          food_pairings: meta.food_pairings,
          wine_pairings: meta.wine_pairings,
          front_image_url: frontUrl,
          back_image_url: backUrl,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      const newId = (data as { id: string }).id;
      await supabase.from("tasting_cheeses").insert({ tasting_id: tastingId, cheese_id: newId });
      toast.success(`${meta.name} added!`);
      navigate(`/cheeses/${newId}`, { replace: true });
    } catch (err) {
      console.error(err);
      toast.error("Failed to save cheese");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Portrait thumbnails — 4:7 aspect ratio, object-contain */}
      <div className="flex gap-3">
        {[{ url: photos.frontUrl, label: "Front" }, { url: photos.backUrl, label: "Back" }].map(({ url, label }) => (
          <div key={label} className="relative overflow-hidden rounded-lg border bg-gray-50 flex-1" style={{ aspectRatio: "4/7" }}>
            <img src={url} alt={label} className="absolute inset-0 w-full h-full object-contain" />
          </div>
        ))}
      </div>

      <Card className="border-amber-100">
        <CardContent className="pt-6 space-y-4">
          <Field label="Name *" value={meta.name} onChange={(v) => set("name", v)} inputRef={nameInputRef} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country" value={meta.country} onChange={(v) => set("country", v)} />
            <Field label="Region" value={meta.region} onChange={(v) => set("region", v)} />
          </div>
          <Field label="Milk Type" value={meta.milk_type} onChange={(v) => set("milk_type", v)} />
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={meta.description} onChange={(e) => set("description", e.target.value)} rows={4} />
          </div>
          <TagField label="Food Pairings" tags={meta.food_pairings} input={foodInput}
            onInputChange={setFoodInput} onAdd={() => addTag("food", foodInput)} onRemove={(i) => removeTag("food", i)} />
          <TagField label="Wine Pairings" tags={meta.wine_pairings} input={wineInput}
            onInputChange={setWineInput} onAdd={() => addTag("wine", wineInput)} onRemove={(i) => removeTag("wine", i)} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>← Retake Photos</Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? "Saving..." : "Save Cheese"}
        </Button>
      </div>

      {duplicateMatch && (
        <Dialog open onOpenChange={(open) => { if (!open) setDuplicateMatch(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cheese already exists</DialogTitle>
              <DialogDescription>
                &ldquo;{duplicateMatch.name}&rdquo; is already in the database.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={async () => {
                  const supabase = createClient();
                  await supabase
                    .from("tasting_cheeses")
                    .upsert(
                      { tasting_id: tastingId, cheese_id: duplicateMatch.id },
                      { onConflict: "tasting_id,cheese_id", ignoreDuplicates: true }
                    );
                  navigate(`/cheeses/${duplicateMatch.id}`, { replace: true });
                }}
              >
                Use &ldquo;{duplicateMatch.name}&rdquo;
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDuplicateMatch(null);
                  setTimeout(() => nameInputRef.current?.focus(), 50);
                }}
              >
                Rename
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Field({ label, value, onChange, inputRef }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TagField({ label, tags, input, onInputChange, onAdd, onRemove }: {
  label: string; tags: string[]; input: string;
  onInputChange: (v: string) => void; onAdd: () => void; onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => onInputChange(e.target.value)} placeholder="Add item..."
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())} />
        <Button type="button" variant="outline" onClick={onAdd}>Add</Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <Badge key={i} variant="secondary" className="cursor-pointer hover:bg-red-100" onClick={() => onRemove(i)}>
              {tag} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
