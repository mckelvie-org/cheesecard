/**
 * Perspective correction using OpenCV.js (WASM).
 * Detects the largest quadrilateral in the image (the card)
 * and warps it to a square crop.
 */

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cv: any;
    Module: {
      onRuntimeInitialized?: () => void;
    };
  }
}

let cvReady = false;
let cvLoadPromise: Promise<void> | null = null;

function loadOpenCV(): Promise<void> {
  if (cvReady) return Promise.resolve();
  if (cvLoadPromise) return cvLoadPromise;

  cvLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.8.0/opencv.js";
    script.async = true;
    script.onload = () => {
      window.Module = {
        onRuntimeInitialized: () => {
          cvReady = true;
          resolve();
        },
      };
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return cvLoadPromise;
}

function imageToMat(img: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return window.cv.imread(canvas);
}

function distance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

function orderPoints(pts: { x: number; y: number }[]) {
  // Sort: top-left, top-right, bottom-right, bottom-left
  const sorted = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = sorted[0];
  const br = sorted[3];
  const remaining = [sorted[1], sorted[2]];
  const tr = remaining[0].y < remaining[1].y ? remaining[0] : remaining[1];
  const bl = remaining[0].y < remaining[1].y ? remaining[1] : remaining[0];
  return [tl, tr, br, bl];
}

export async function correctPerspective(file: File): Promise<File> {
  await loadOpenCV();
  const cv = window.cv;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const src = imageToMat(img);
        const gray = new cv.Mat();
        const blurred = new cv.Mat();
        const edges = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        cv.Canny(blurred, edges, 75, 200);

        cv.findContours(
          edges,
          contours,
          hierarchy,
          cv.RETR_LIST,
          cv.CHAIN_APPROX_SIMPLE
        );

        let bestContour = null;
        let bestArea = 0;

        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);
          const perimeter = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

          if (approx.rows === 4 && area > bestArea) {
            bestArea = area;
            bestContour = approx;
          } else {
            approx.delete();
          }
          contour.delete();
        }

        if (!bestContour) {
          // No quad found — return original
          [src, gray, blurred, edges, contours, hierarchy].forEach((m) =>
            m.delete()
          );
          resolve(file);
          return;
        }

        // Extract the 4 corner points
        const pts = [];
        for (let i = 0; i < 4; i++) {
          pts.push({ x: bestContour.intAt(i, 0), y: bestContour.intAt(i, 1) });
        }
        const ordered = orderPoints(pts);

        const w = Math.max(
          distance(ordered[0], ordered[1]),
          distance(ordered[2], ordered[3])
        );
        const h = Math.max(
          distance(ordered[0], ordered[3]),
          distance(ordered[1], ordered[2])
        );
        const size = Math.round(Math.max(w, h));

        const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          ordered[0].x, ordered[0].y,
          ordered[1].x, ordered[1].y,
          ordered[2].x, ordered[2].y,
          ordered[3].x, ordered[3].y,
        ]);
        const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          size - 1, 0,
          size - 1, size - 1,
          0, size - 1,
        ]);

        const M = cv.getPerspectiveTransform(srcPts, dstPts);
        const dst = new cv.Mat();
        cv.warpPerspective(
          src,
          dst,
          M,
          new cv.Size(size, size),
          cv.INTER_LINEAR,
          cv.BORDER_CONSTANT,
          new cv.Scalar()
        );

        const outCanvas = document.createElement("canvas");
        outCanvas.width = size;
        outCanvas.height = size;
        cv.imshow(outCanvas, dst);

        outCanvas.toBlob((blob) => {
          [src, gray, blurred, edges, contours, hierarchy, bestContour, srcPts, dstPts, M, dst].forEach(
            (m) => { try { m.delete(); } catch { /* ignore */ } }
          );
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        }, "image/jpeg", 0.92);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
