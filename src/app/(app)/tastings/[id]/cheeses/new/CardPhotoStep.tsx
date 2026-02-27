"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { CheeseMetadata } from "./types";
import { correctPerspective } from "@/lib/opencv";

interface PhotoPair {
  frontFile: File;
  frontUrl: string;
  backFile: File;
  backUrl: string;
}

interface Props {
  onComplete: (photos: PhotoPair, metadata: CheeseMetadata) => void;
}

type CardSide = "front" | "back";

export default function CardPhotoStep({ onComplete }: Props) {
  const [front, setFront] = useState<{ file: File; url: string } | null>(null);
  const [back, setBack] = useState<{ file: File; url: string } | null>(null);
  const [processing, setProcessing] = useState<CardSide | null>(null);
  const [extracting, setExtracting] = useState(false);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = useCallback(
    async (file: File, side: CardSide) => {
      setProcessing(side);
      try {
        const corrected = await correctPerspective(file);
        const url = URL.createObjectURL(corrected);
        if (side === "front") setFront({ file: corrected, url });
        else setBack({ file: corrected, url });
      } catch {
        // If perspective correction fails, use original
        toast.warning("Could not auto-correct perspective — using original.");
        const url = URL.createObjectURL(file);
        if (side === "front") setFront({ file, url });
        else setBack({ file, url });
      } finally {
        setProcessing(null);
      }
    },
    []
  );

  const handleExtract = async () => {
    if (!front || !back) return;
    setExtracting(true);

    try {
      // Upload back image temporarily to get a URL for the Edge Function
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append("back", back.file);
      formData.append("front", front.file);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-metadata`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      if (!res.ok) throw new Error("Extraction failed");

      const metadata: CheeseMetadata = await res.json();
      onComplete(
        {
          frontFile: front.file,
          frontUrl: front.url,
          backFile: back.file,
          backUrl: back.url,
        },
        metadata
      );
    } catch {
      toast.error("Failed to extract metadata. You can enter it manually.");
      onComplete(
        {
          frontFile: front.file,
          frontUrl: front.url,
          backFile: back.file,
          backUrl: back.url,
        },
        {
          name: "",
          country: "",
          region: "",
          milk_type: "",
          description: "",
          food_pairings: [],
          wine_pairings: [],
        }
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.url}
                      alt={`Card ${side}`}
                      className="w-full h-full object-contain rounded"
                    />
                  ) : (
                    <>
                      <span className="text-3xl">📷</span>
                      <p className="text-sm font-medium capitalize text-amber-800">
                        {side}
                      </p>
                      <p className="text-xs text-gray-400">Tap to capture</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <Button
        onClick={handleExtract}
        disabled={!front || !back || extracting}
        className="w-full"
      >
        {extracting ? "Extracting info..." : "Extract Cheese Info →"}
      </Button>
    </div>
  );
}
