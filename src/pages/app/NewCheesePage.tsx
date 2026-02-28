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
import { correctPerspective } from "@/lib/opencv";

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
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Cheese Details</h1>
      </div>
      <MetadataStep
        tastingId={tastingId!}
        photos={photos!}
        initialMetadata={metadata!}
        onBack={() => setStep("photos")}
      />
    </div>
  );
}

function CardPhotoStep({
  onComplete,
}: {
  onComplete: (photos: PhotoPair, metadata: CheeseMetadata) => void;
}) {
  const [front, setFront] = useState<{ file: File; url: string } | null>(null);
  const [back, setBack] = useState<{ file: File; url: string } | null>(null);
  const [processing, setProcessing] = useState<CardSide | null>(null);
  const [extracting, setExtracting] = useState(false);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = useCallback(async (file: File, side: CardSide) => {
    setProcessing(side);
    try {
      const corrected = await correctPerspective(file);
      const url = URL.createObjectURL(corrected);
      if (side === "front") setFront({ file: corrected, url });
      else setBack({ file: corrected, url });
    } catch {
      toast.warning("Could not auto-correct perspective — using original.");
      const url = URL.createObjectURL(file);
      if (side === "front") setFront({ file, url });
      else setBack({ file, url });
    } finally {
      setProcessing(null);
    }
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
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: formData,
        }
      );

      if (!res.ok) throw new Error("Extraction failed");

      const metadata: CheeseMetadata = await res.json();
      onComplete(
        { frontFile: front.file, frontUrl: front.url, backFile: back.file, backUrl: back.url },
        metadata
      );
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Take photos of the front and back of the cheese card. The app will
        automatically correct the perspective.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {(["front", "back"] as CardSide[]).map((side) => {
          const photo = side === "front" ? front : back;
          const inputRef = side === "front" ? frontInputRef : backInputRef;
          const isProcessing = processing === side;

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
              <Card
                className="border-2 border-dashed border-amber-200 cursor-pointer hover:border-amber-400 transition-colors"
                onClick={() => inputRef.current?.click()}
              >
                <CardContent className="flex flex-col items-center justify-center h-36 gap-2 p-2">
                  {isProcessing ? (
                    <p className="text-xs text-gray-400">Correcting...</p>
                  ) : photo ? (
                    <img
                      src={photo.url}
                      alt={`Card ${side}`}
                      className="w-full h-full object-contain rounded"
                    />
                  ) : (
                    <>
                      <span className="text-3xl">📷</span>
                      <p className="text-sm font-medium capitalize text-amber-800">{side}</p>
                      <p className="text-xs text-gray-400">Tap to capture</p>
                    </>
                  )}
                </CardContent>
              </Card>
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
    if (!meta.name.trim()) {
      toast.error("Cheese name is required");
      return;
    }
    setSaving(true);

    try {
      const supabase = createClient();

      const uploadImage = async (file: File, prefix: string) => {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${tastingId}/${prefix}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from("card-images")
          .upload(path, file, { contentType: file.type });
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
      <div className="flex gap-2">
        <img src={photos.frontUrl} alt="Front" className="w-24 h-24 object-cover rounded-lg border" />
        <img src={photos.backUrl} alt="Back" className="w-24 h-24 object-cover rounded-lg border" />
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
            <Textarea
              value={meta.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
            />
          </div>
          <TagField
            label="Food Pairings"
            tags={meta.food_pairings}
            input={foodInput}
            onInputChange={setFoodInput}
            onAdd={() => addTag("food", foodInput)}
            onRemove={(i) => removeTag("food", i)}
          />
          <TagField
            label="Wine Pairings"
            tags={meta.wine_pairings}
            input={wineInput}
            onInputChange={setWineInput}
            onAdd={() => addTag("wine", wineInput)}
            onRemove={(i) => removeTag("wine", i)}
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          ← Retake Photos
        </Button>
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

function TagField({
  label, tags, input, onInputChange, onAdd, onRemove,
}: {
  label: string;
  tags: string[];
  input: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Add item..."
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
        />
        <Button type="button" variant="outline" onClick={onAdd}>Add</Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="cursor-pointer hover:bg-red-100"
              onClick={() => onRemove(i)}
            >
              {tag} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
