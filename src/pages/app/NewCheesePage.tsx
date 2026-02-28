import { useState, useRef, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { applyPerspective } from "@/lib/opencv";
import { detectCornersWithAI } from "@/lib/cornersai";

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
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append("back", back.file);
      formData.append("front", front.file);
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-metadata`,
        { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` }, body: formData }
      );
      if (!res.ok) throw new Error("Extraction failed");
      const metadata: CheeseMetadata = await res.json();
      onComplete({ frontFile: front.file, frontUrl: front.url, backFile: back.file, backUrl: back.url }, metadata);
    } catch {
      toast.error("Failed to extract metadata. You can enter it manually.");
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
          return (
            <div key={side}>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoSelect(file, side);
                  e.target.value = "";
                }}
              />
              {/* Portrait 4:7 thumbnail — plain div avoids Card's py-6 padding */}
              <div
                className="border-2 border-dashed border-amber-200 rounded-xl cursor-pointer hover:border-amber-400 transition-colors overflow-hidden relative"
                style={{ aspectRatio: "4/7" }}
                onClick={() => inputRef.current?.click()}
              >
                {photo ? (
                  <img
                    src={photo.url}
                    alt={`Card ${side}`}
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <span className="text-3xl">📷</span>
                    <p className="text-sm font-medium capitalize text-amber-800">{side}</p>
                    <p className="text-xs text-gray-400">Tap to capture</p>
                  </div>
                )}
              </div>
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

    // Use Claude Vision for reliable corner detection (handles perspective,
    // rounded corners, and complex card faces that trip up OpenCV)
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (!session) { setDetecting(false); return; }
      detectCornersWithAI(imageFile, session.access_token).then((detected) => {
        if (detected && imgRef.current) {
          const scaleX = imgRef.current.clientWidth / imgRef.current.naturalWidth;
          const scaleY = imgRef.current.clientHeight / imgRef.current.naturalHeight;
          const mapped = detected.map(([x, y]) => [x * scaleX, y * scaleY] as [number, number]);
          cornersRef.current = mapped;
          setCorners(mapped);
        }
        setDetecting(false);
      });
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

    ctx.drawImage(img, imgX - srcHalfW, imgY - srcHalfH, srcHalfW * 2, srcHalfH * 2, 0, 0, 160, 160);

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

  const getPos = (e: React.PointerEvent): [number, number] => {
    const rect = containerRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const startDrag = useCallback((e: React.PointerEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(index);
    setLoupeVisible(true);
    const pos = getPos(e);
    drawLoupe(pos[0], pos[1], index);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawLoupe]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (dragging === null || !imgSize) return;
    e.preventDefault();
    const [x, y] = getPos(e);
    // Allow handles to go 20px outside image bounds so corner handles
    // remain fully visible and draggable when at the image edge
    const cx = Math.max(-20, Math.min(imgSize.w + 20, x));
    const cy = Math.max(-20, Math.min(imgSize.h + 20, y));
    // Sync ref before drawing so edge lines see the updated corner position
    const newCorners = cornersRef.current.map((c, i) => i === dragging ? [cx, cy] : c) as [number, number][];
    cornersRef.current = newCorners;
    setCorners(newCorners);
    // Loupe samples clamped to valid image area
    drawLoupe(Math.max(0, Math.min(imgSize.w, x)), Math.max(0, Math.min(imgSize.h, y)), dragging);
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

  // Even-odd path: full image rect minus the quad = dark region outside selection
  const dimPath = imgSize
    ? `M0,0 H${imgSize.w} V${imgSize.h} H0 Z M${corners.map(([x, y]) => `${x},${y}`).join(" L")} Z`
    : "";

  return (
    <div className="space-y-3">
      {/* Loupe: fixed to viewport top-center, always in DOM so ref is valid */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-50 rounded-full border-2 border-amber-400 shadow-xl overflow-hidden"
        style={{ top: "64px", visibility: loupeVisible ? "visible" : "hidden" }}
      >
        <canvas ref={loupeRef} width={160} height={160} />
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
          onPointerMove={onMove}
          onPointerUp={stopDrag}
          onPointerLeave={stopDrag}
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
              style={{ overflow: "visible" }}
            >
              {/* Darken outside the selected quad */}
              <path d={dimPath} fill="rgba(0,0,0,0.45)" fillRule="evenodd" />
              {/* Quad outline */}
              <polygon
                points={corners.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
              />
              {/* Corner handles — r=22 for easy touch targeting */}
              {corners.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={22}
                  fill="rgba(245,158,11,0.8)"
                  stroke="white"
                  strokeWidth="2.5"
                  style={{ cursor: "grab", touchAction: "none" }}
                  onPointerDown={(e) => startDrag(e, i)}
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
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<CheeseMetadata>(initialMetadata);
  const [foodInput, setFoodInput] = useState("");
  const [wineInput, setWineInput] = useState("");

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
          tasting_id: tastingId,
          name: meta.name,
          country: meta.country || null,
          region: meta.region || null,
          milk_type: meta.milk_type || null,
          description: meta.description || null,
          food_pairings: meta.food_pairings,
          wine_pairings: meta.wine_pairings,
          front_image_url: frontUrl,
          back_image_url: backUrl,
        })
        .select()
        .single();
      if (error) throw error;
      toast.success(`${meta.name} added!`);
      navigate(`/cheeses/${(data as { id: string }).id}`);
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
          <Field label="Name *" value={meta.name} onChange={(v) => set("name", v)} />
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
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
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
