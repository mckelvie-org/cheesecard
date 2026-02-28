/**
 * Perspective correction using OpenCV.js (WASM).
 * detectCardCorners: finds the card outline and returns 4 corners in image pixels.
 * applyPerspective: warps the image to a fixed 400×700px output using provided corners.
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
    window.Module = {
      onRuntimeInitialized: () => {
        cvReady = true;
        resolve();
      },
    };
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.8.0/opencv.js";
    script.async = true;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return cvLoadPromise;
}

/** Order 4 points clockwise: top-left, top-right, bottom-right, bottom-left */
function orderPoints(pts: [number, number][]): [number, number][] {
  const sorted = [...pts].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const tl = sorted[0];
  const br = sorted[3];
  const remaining: [number, number][] = [sorted[1], sorted[2]];
  const tr = remaining[0][1] < remaining[1][1] ? remaining[0] : remaining[1];
  const bl = remaining[0][1] < remaining[1][1] ? remaining[1] : remaining[0];
  return [tl, tr, br, bl];
}

/**
 * Detect the card outline in the image and return 4 corners in original image pixels.
 * Returns null if no suitable quadrilateral is found.
 */
export async function detectCardCorners(file: File): Promise<[number, number][] | null> {
  await loadOpenCV();
  const cv = window.cv;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      // Scale down to max 800px wide for faster processing
      const scale = Math.min(1, 800 / origW);
      const procW = Math.round(origW * scale);
      const procH = Math.round(origH * scale);

      const canvas = document.createElement("canvas");
      canvas.width = procW;
      canvas.height = procH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, procW, procH);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edges = new cv.Mat();
      const dilated = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      const kernel = cv.Mat.ones(3, 3, cv.CV_8U);

      try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        // Auto-Canny: thresholds based on image median
        const mean = cv.mean(blurred);
        const median = mean[0];
        const low = Math.max(0, 0.33 * median);
        const high = Math.min(255, 0.66 * median);
        cv.Canny(blurred, edges, low, high);

        // Dilate to close gaps (rounded card corners fragment edges)
        cv.dilate(edges, dilated, kernel);

        // RETR_EXTERNAL: only outermost contours, prevents internal features matching
        cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        const imageArea = procW * procH;
        let bestContour: typeof cv.Mat | null = null;
        let bestArea = 0;

        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);

          // Must be at least 15% of image area
          if (area < imageArea * 0.15) {
            contour.delete();
            continue;
          }

          const perimeter = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

          if (approx.rows === 4 && area > bestArea) {
            bestContour?.delete();
            bestArea = area;
            bestContour = approx;
          } else {
            approx.delete();
          }
          contour.delete();
        }

        if (!bestContour) {
          resolve(null);
          return;
        }

        // Extract corners and scale back to original image resolution
        const pts: [number, number][] = [];
        for (let i = 0; i < 4; i++) {
          pts.push([
            Math.round(bestContour.intAt(i, 0) / scale),
            Math.round(bestContour.intAt(i, 1) / scale),
          ]);
        }

        const ordered = orderPoints(pts);
        resolve(ordered);
      } catch {
        resolve(null);
      } finally {
        [src, gray, blurred, edges, dilated, contours, hierarchy, kernel].forEach((m) => {
          try { m.delete(); } catch { /* ignore */ }
        });
      }
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Apply perspective transform to the image using the provided 4 corners (in image pixels,
 * clockwise from top-left). Outputs a fixed 400×700px (2:3.5 portrait) JPEG.
 */
export async function applyPerspective(
  file: File,
  corners: [number, number][]
): Promise<File> {
  await loadOpenCV();
  const cv = window.cv;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const src = cv.imread(canvas);

      const OUT_W = 400;
      const OUT_H = 700;

      const ordered = orderPoints(corners);

      const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        ordered[0][0], ordered[0][1],
        ordered[1][0], ordered[1][1],
        ordered[2][0], ordered[2][1],
        ordered[3][0], ordered[3][1],
      ]);
      const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,         0,
        OUT_W - 1, 0,
        OUT_W - 1, OUT_H - 1,
        0,         OUT_H - 1,
      ]);

      const M = cv.getPerspectiveTransform(srcPts, dstPts);
      const dst = new cv.Mat();
      cv.warpPerspective(
        src, dst, M,
        new cv.Size(OUT_W, OUT_H),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar()
      );

      const outCanvas = document.createElement("canvas");
      outCanvas.width = OUT_W;
      outCanvas.height = OUT_H;
      cv.imshow(outCanvas, dst);

      outCanvas.toBlob((blob) => {
        [src, srcPts, dstPts, M, dst].forEach((m) => {
          try { m.delete(); } catch { /* ignore */ }
        });
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name, { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
