/**
 * detectCornersWithAI: sends a card photo to the detect-corners edge function
 * (backed by Claude Vision) and returns 4 corners in original image pixels,
 * ordered [TL, TR, BR, BL]. Returns null if detection fails.
 *
 * Uses supabase.functions.invoke() so the SDK handles token refresh and auth
 * headers automatically — avoids stale-JWT issues with raw fetch().
 */

import { createClient } from "@/lib/supabase/client";

/** Resize an image file to fit within maxPx on its longest side. */
async function resizeImage(
  file: File,
  maxPx: number,
): Promise<{ blob: Blob; scaleX: number; scaleY: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("resize failed")); return; }
          // scaleX/scaleY convert from resized-image px → original-image px
          resolve({ blob, scaleX: img.naturalWidth / w, scaleY: img.naturalHeight / h });
        },
        "image/jpeg",
        0.88,
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function detectCornersWithAI(
  file: File,
): Promise<[number, number][] | null> {
  try {
    const { blob, scaleX, scaleY } = await resizeImage(file, 1600);

    const form = new FormData();
    form.append("image", new File([blob], "card.jpg", { type: "image/jpeg" }));

    // supabase.functions.invoke() handles token refresh and auth headers
    const { data, error } = await createClient().functions.invoke("detect-corners", { body: form });

    if (error) {
      console.error("detect-corners error:", error);
      return null;
    }
    console.log("detect-corners response:", data);
    if (data.error || !data.tl || !data.tr || !data.br || !data.bl) {
      console.error("detect-corners: bad response or error field", data);
      return null;
    }

    // Scale from resized-image coordinates back to original-image coordinates
    const corners: [number, number][] = [
      [Math.round(data.tl[0] * scaleX), Math.round(data.tl[1] * scaleY)],
      [Math.round(data.tr[0] * scaleX), Math.round(data.tr[1] * scaleY)],
      [Math.round(data.br[0] * scaleX), Math.round(data.br[1] * scaleY)],
      [Math.round(data.bl[0] * scaleX), Math.round(data.bl[1] * scaleY)],
    ];

    // Sanity-check: aspect ratio should be consistent with a cheese card (4:7 = 0.571).
    // Generous tolerance covers up to ~45° tilt; both portrait and landscape accepted.
    const topW = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
    const botW = Math.hypot(corners[2][0] - corners[3][0], corners[2][1] - corners[3][1]);
    const lefH = Math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]);
    const rigH = Math.hypot(corners[2][0] - corners[1][0], corners[2][1] - corners[1][1]);
    const ratio = (topW + botW) / (lefH + rigH);
    if (!((ratio >= 0.35 && ratio <= 0.90) || (ratio >= 1.1 && ratio <= 2.9))) {
      console.error(`detect-corners: aspect ratio ${ratio.toFixed(3)} out of range, rejecting`);
      return null;
    }

    return corners;
  } catch (err) {
    console.error("detect-corners: exception", err);
    return null;
  }
}
