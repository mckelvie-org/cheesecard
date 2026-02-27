"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { CheeseMetadata } from "./types";

interface PhotoPair {
  frontFile: File;
  frontUrl: string;
  backFile: File;
  backUrl: string;
}

interface Props {
  tastingId: string;
  photos: PhotoPair;
  initialMetadata: CheeseMetadata;
  onBack: () => void;
}

export default function MetadataStep({
  tastingId,
  photos,
  initialMetadata,
  onBack,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
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
      setMeta((m) => ({
        ...m,
        food_pairings: m.food_pairings.filter((_, i) => i !== index),
      }));
    } else {
      setMeta((m) => ({
        ...m,
        wine_pairings: m.wine_pairings.filter((_, i) => i !== index),
      }));
    }
  };

  const handleSave = async () => {
    if (!meta.name.trim()) {
      toast.error("Cheese name is required");
      return;
    }
    setSaving(true);

    try {
      // Upload images to Supabase Storage
      const uploadImage = async (file: File, prefix: string) => {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${tastingId}/${prefix}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from("card-images")
          .upload(path, file, { contentType: file.type });
        if (error) throw error;
        const { data } = supabase.storage
          .from("card-images")
          .getPublicUrl(path);
        return data.publicUrl;
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
      const cheese = data as { id: string };
      router.push(`/cheeses/${cheese.id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save cheese");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <img
          src={photos.frontUrl}
          alt="Front"
          className="w-24 h-24 object-cover rounded-lg border"
        />
        <img
          src={photos.backUrl}
          alt="Back"
          className="w-24 h-24 object-cover rounded-lg border"
        />
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TagField({
  label,
  tags,
  input,
  onInputChange,
  onAdd,
  onRemove,
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
        <Button type="button" variant="outline" onClick={onAdd}>
          Add
        </Button>
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
