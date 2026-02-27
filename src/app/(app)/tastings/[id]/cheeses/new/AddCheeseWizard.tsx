"use client";

import { useState } from "react";
import CardPhotoStep from "./CardPhotoStep";
import MetadataStep from "./MetadataStep";
import type { CheeseMetadata } from "./types";

type Step = "photos" | "metadata";

interface PhotoPair {
  frontFile: File;
  frontUrl: string;
  backFile: File;
  backUrl: string;
}

export default function AddCheeseWizard({ tastingId }: { tastingId: string }) {
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<PhotoPair | null>(null);
  const [metadata, setMetadata] = useState<CheeseMetadata | null>(null);

  if (step === "photos") {
    return (
      <CardPhotoStep
        onComplete={(photos, extractedMetadata) => {
          setPhotos(photos);
          setMetadata(extractedMetadata);
          setStep("metadata");
        }}
      />
    );
  }

  return (
    <MetadataStep
      tastingId={tastingId}
      photos={photos!}
      initialMetadata={metadata!}
      onBack={() => setStep("photos")}
    />
  );
}
