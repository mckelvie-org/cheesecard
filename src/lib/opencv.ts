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

        // Auto-Canny: use mean as proxy for median, derive thresholds
        const mean = cv.mean(blurred)[0];
        const high = Math.min(255, Math.max(80, mean * 1.33));
        const low = high * 0.5;
        cv.Canny(blurred, edges, low, high);

        // Dilate to close gaps from rounded card corners
        cv.dilate(edges, dilated, kernel);

        // RETR_EXTERNAL: only outermost contours — prevents internal card
        // features (e.g. the photo square on the front face) from matching
        cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        const imageArea = procW * procH;
        // Boundary margin: reject quads whose corners touch the image edges
        const margin = Math.round(procW * 0.05);

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

          // Reject if the contour's bounding box touches the image boundary —
          // filters out the "entire image outline" false positive
          const br = cv.boundingRect(contour);
          const touchesBoundary =
            br.x < margin || br.y < margin ||
            br.x + br.width > procW - margin ||
            br.y + br.height > procH - margin;

          if (!touchesBoundary && area > bestArea) {
            bestContour?.delete();
            bestArea = area;
            bestContour = contour;
          } else {
            contour.delete();
          }
        }

        if (!bestContour) {
          resolve(null);
          return;
        }

        // Use minAreaRect instead of approxPolyDP — handles rotated cards
        // correctly and won't snap to axis-aligned approximations
        const rotatedRect = cv.minAreaRect(bestContour);
        const boxMat = new cv.Mat();
        cv.boxPoints(rotatedRect, boxMat);

        const pts: [number, number][] = [];
        for (let i = 0; i < 4; i++) {
          pts.push([
            Math.round(boxMat.data32F[i * 2] / scale),
            Math.round(boxMat.data32F[i * 2 + 1] / scale),
          ]);
        }
        boxMat.delete();

        resolve(orderPoints(pts));
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

      // Mask rounded corners — radius ≈ 1/16 of card width (matches real card)
      const ctx2d = outCanvas.getContext("2d")!;
      const r = OUT_W / 16; // 25px on a 400px-wide output
      ctx2d.globalCompositeOperation = "destination-in";
      ctx2d.beginPath();
      ctx2d.moveTo(r, 0);
      ctx2d.lineTo(OUT_W - r, 0);
      ctx2d.quadraticCurveTo(OUT_W, 0, OUT_W, r);
      ctx2d.lineTo(OUT_W, OUT_H - r);
      ctx2d.quadraticCurveTo(OUT_W, OUT_H, OUT_W - r, OUT_H);
      ctx2d.lineTo(r, OUT_H);
      ctx2d.quadraticCurveTo(0, OUT_H, 0, OUT_H - r);
      ctx2d.lineTo(0, r);
      ctx2d.quadraticCurveTo(0, 0, r, 0);
      ctx2d.closePath();
      ctx2d.fillStyle = "black";
      ctx2d.fill();
      ctx2d.globalCompositeOperation = "source-over";

      // Export as PNG to preserve transparent corners
      const pngName = file.name.replace(/\.[^.]+$/, ".png");
      outCanvas.toBlob((blob) => {
        [src, srcPts, dstPts, M, dst].forEach((m) => {
          try { m.delete(); } catch { /* ignore */ }
        });
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], pngName, { type: "image/png" }));
      }, "image/png");
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
