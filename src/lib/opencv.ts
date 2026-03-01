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

const OPENCV_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";

function loadOpenCV(): Promise<void> {
  if (cvReady) return Promise.resolve();
  if (cvLoadPromise) return cvLoadPromise;

  cvLoadPromise = new Promise((resolve, reject) => {
    const onReady = () => {
      if (cvReady) return;  // guard against double-fire
      cvReady = true;
      clearInterval(poll);
      resolve();
    };

    // Polling fallback: some builds don't call window.Module.onRuntimeInitialized
    // (e.g. script already in DOM from a previous render, or @techstark init quirk).
    const poll = setInterval(() => {
      if (window.cv?.Mat) onReady();
    }, 100);

    // Standard OpenCV.js init callback
    window.Module = { onRuntimeInitialized: onReady };

    // Only inject the script if not already present in the DOM
    const existing = document.querySelector(`script[src="${OPENCV_URL}"]`);
    if (existing) {
      // Script was already added — it may already have initialized window.cv
      // (poll above will catch it) or will fire onRuntimeInitialized shortly.
      console.log("[opencv] script already in DOM, waiting for cv.Mat...");
    } else {
      const script = document.createElement("script");
      script.src = OPENCV_URL;
      script.async = true;
      script.onerror = (e) => { clearInterval(poll); reject(e); };
      document.head.appendChild(script);
    }

    // 30-second timeout so we never hang forever
    setTimeout(() => {
      if (!cvReady) {
        clearInterval(poll);
        reject(new Error("OpenCV.js failed to initialize within 30s"));
      }
    }, 30_000);
  });

  return cvLoadPromise;
}

/** Order 4 points: top-left, top-right, bottom-right, bottom-left */
function orderPoints(pts: [number, number][]): [number, number][] {
  const sorted = [...pts].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const tl = sorted[0];
  const br = sorted[3];
  const remaining: [number, number][] = [sorted[1], sorted[2]];
  const tr = remaining[0][1] < remaining[1][1] ? remaining[0] : remaining[1];
  const bl = remaining[0][1] < remaining[1][1] ? remaining[1] : remaining[0];
  return [tl, tr, br, bl];
}

/** Intersect two lines given as (vx, vy, x0, y0). Returns [x, y] or null if parallel. */
function lineIntersection(
  l1: [number, number, number, number],
  l2: [number, number, number, number],
): [number, number] | null {
  const [vx1, vy1, x1, y1] = l1;
  const [vx2, vy2, x2, y2] = l2;
  const denom = vx1 * vy2 - vy1 * vx2;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((x2 - x1) * vy2 - (y2 - y1) * vx2) / denom;
  return [x1 + t * vx1, y1 + t * vy1];
}

/**
 * Fit 4 independent lines to the edges of a convex hull, then intersect
 * adjacent pairs to get corners.
 *
 * Each hull edge is classified as top/bottom/left/right by its angle and
 * whether its midpoint is above/below or left/right of the hull centroid.
 * All points from edges in each group are collected and a line is fit by
 * least squares (cv.fitLine).  Adjacent lines are then intersected.
 *
 * This is superior to minAreaRect because each side finds its own best-fit
 * direction independently — the result is a general quadrilateral rather
 * than a forced rectangle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function quadFromHullLines(hull: any, cv: any): [number, number][] | null {
  const n = hull.rows;
  console.log(`[quad] hull rows=${n} cols=${hull.cols} type=${hull.type()} channels=${hull.channels()} data32S.len=${hull.data32S?.length}`);
  if (n < 4) return null;

  // Log first few hull points to verify data layout (type should be CV_32SC2 = 12)
  const pts0 = hull.data32S;
  if (pts0 && n >= 2) {
    console.log(`[quad] hull[0]=(${pts0[0]},${pts0[1]}) hull[1]=(${pts0[2]},${pts0[3]})`);
  }

  // Hull centroid
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    cx += hull.data32S[i * 2];
    cy += hull.data32S[i * 2 + 1];
  }
  cx /= n; cy /= n;
  console.log(`[quad] centroid=(${Math.round(cx)},${Math.round(cy)})`);

  // Collect edge-endpoint coordinates into 4 directional groups
  const groups: Record<string, number[]> = { top: [], bottom: [], left: [], right: [] };
  for (let i = 0; i < n; i++) {
    const x1 = hull.data32S[i * 2];
    const y1 = hull.data32S[i * 2 + 1];
    const x2 = hull.data32S[((i + 1) % n) * 2];
    const y2 = hull.data32S[((i + 1) % n) * 2 + 1];
    const angle = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const isH = angle < 45 || angle > 135;
    const key = isH
      ? (midY < cy ? "top" : "bottom")
      : (midX < cx ? "left" : "right");
    groups[key].push(x1, y1, x2, y2);
  }
  console.log(`[quad] groups: top=${groups.top.length/4} bottom=${groups.bottom.length/4} left=${groups.left.length/4} right=${groups.right.length/4} edges`);

  // Fit one line per group using least squares
  const lines: Record<string, [number, number, number, number]> = {};
  for (const [name, pts] of Object.entries(groups)) {
    if (pts.length < 4) {
      console.warn(`[quad] group '${name}' is empty — hull too sparse`);
      return null;  // group empty — hull too sparse
    }
    const mat = cv.matFromArray(pts.length / 2, 1, cv.CV_32FC2, pts);
    const lineMat = new cv.Mat();
    cv.fitLine(mat, lineMat, cv.DIST_L2, 0, 0.01, 0.01);
    lines[name] = [
      lineMat.data32F[0], lineMat.data32F[1],
      lineMat.data32F[2], lineMat.data32F[3],
    ];
    mat.delete();
    lineMat.delete();
  }

  const tl = lineIntersection(lines.top,    lines.left);
  const tr = lineIntersection(lines.top,    lines.right);
  const br = lineIntersection(lines.bottom, lines.right);
  const bl = lineIntersection(lines.bottom, lines.left);
  if (!tl || !tr || !br || !bl) return null;
  return [tl, tr, br, bl];
}

/** Validate corners in proc-space.  Returns ordered [TL,TR,BR,BL] or null. */
function validateCorners(
  corners: [number, number][],
  procW: number,
  procH: number,
): [number, number][] | null {
  const ordered = orderPoints(corners);
  const [tl, tr, br, bl] = ordered;

  // Quad area via shoelace
  const poly = [tl, tr, br, bl];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  const areaFrac = Math.abs(area) / 2 / (procW * procH);
  if (areaFrac > 0.97) return null;  // spans full image — background contamination

  // Edge-margin check (skip when card fills most of the frame)
  if (areaFrac < 0.65) {
    const margin = Math.max(5, Math.round(Math.min(procW, procH) * 0.03));
    for (const [x, y] of ordered) {
      if (x < margin || y < margin || x > procW - margin || y > procH - margin) {
        return null;
      }
    }
  }

  // Aspect ratio: portrait 0.35–0.90, landscape 1.1–2.9
  const topW = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const botW = Math.hypot(br[0] - bl[0], br[1] - bl[1]);
  const lefH = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const rigH = Math.hypot(br[0] - tr[0], br[1] - tr[1]);
  const ratio = (topW + botW) / (lefH + rigH);
  if (!((ratio >= 0.35 && ratio <= 0.90) || (ratio >= 1.1 && ratio <= 2.9))) return null;

  return ordered;
}

export interface CardDetectionResult {
  /** 4 corners [TL, TR, BR, BL] in original image pixels */
  corners: [number, number][];
  /** Convex hull points in original image pixels (for visualisation) */
  hull: [number, number][];
}

/**
 * Detect card corners using marker-based watershed.
 *
 * Seeds the image with two labels before running watershed:
 *   - Label 2 (background): outer 5% border — guaranteed outside the card.
 *   - Label 1 (card): largest 7:4 (h:w) rectangle fitting within 60% of
 *     each axis, centred in the image — guaranteed inside the card based
 *     on the prior that card edges are within 20% of the image edges.
 *
 * After watershed the card region (label 1) is extracted as a mask,
 * its largest contour is taken, the convex hull computed, and 4 independent
 * lines are fit to the hull edges (top/bottom/left/right) then intersected
 * to give corners.  This avoids minAreaRect's forced-rectangle constraint.
 */
export async function detectCardCorners(file: File): Promise<CardDetectionResult | null> {
  console.log("[corners] detectCardCorners: loading OpenCV...");
  await loadOpenCV();
  console.log("[corners] OpenCV ready, starting detection");
  const cv = window.cv;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      console.log(`[corners] img.onload fired: ${img.naturalWidth}×${img.naturalHeight}`);
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;
      const scale = Math.min(1, 800 / Math.max(origW, origH));
      const procW = Math.round(origW * scale);
      const procH = Math.round(origH * scale);

      const canvas = document.createElement("canvas");
      canvas.width = procW;
      canvas.height = procH;
      canvas.getContext("2d")!.drawImage(img, 0, 0, procW, procH);

      // All OpenCV objects collected here for cleanup in finally
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toDelete: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mat = <T>(m: T): T => { toDelete.push(m); return m; };

      try {
        const src      = mat(cv.imread(canvas));
        const gray     = mat(new cv.Mat());
        const blurred  = mat(new cv.Mat());
        const enhanced = mat(new cv.Mat());
        const imgBGR   = mat(new cv.Mat());
        const markers  = mat(new cv.Mat(procH, procW, cv.CV_32SC1, new cv.Scalar(0)));
        const cardMask = mat(new cv.Mat(procH, procW, cv.CV_8UC1,  new cv.Scalar(0)));
        const contours = mat(new cv.MatVector());
        const hierarchy = mat(new cv.Mat());
        // ── Preprocess ──────────────────────────────────────────────────────
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

        // CLAHE enhances dark-on-dark edges (e.g. black panel on dark fabric).
        // OpenCV.js exposes CLAHE via the cv.createCLAHE factory function.
        // Fall back to plain blur if unavailable.
        try {
          const clahe = cv.createCLAHE(2.0, new cv.Size(8, 8));
          clahe.apply(blurred, enhanced);
          clahe.delete();
          console.log("[corners] CLAHE applied via cv.createCLAHE");
        } catch (e1) {
          console.warn("[corners] cv.createCLAHE failed:", e1);
          // Some builds expose it as a constructor — try that
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const clahe2: any = new cv.CLAHE(2.0, new cv.Size(8, 8));
            clahe2.apply(blurred, enhanced);
            clahe2.delete();
            console.log("[corners] CLAHE applied via new cv.CLAHE");
          } catch (e2) {
            console.warn("[corners] CLAHE unavailable — using plain blur:", e2);
            blurred.copyTo(enhanced);
          }
        }

        // Watershed needs a 3-channel image
        cv.cvtColor(enhanced, imgBGR, cv.COLOR_GRAY2BGR);

        // ── Seed markers ────────────────────────────────────────────────────
        const mData  = markers.data32S;
        const border = Math.max(3, Math.round(Math.min(procW, procH) * 0.05));

        // Background: fill top/bottom rows, then left/right columns
        for (let y = 0; y < border; y++) {
          mData.fill(2,  y            * procW,  y            * procW + procW);
          mData.fill(2, (procH-1-y)   * procW, (procH-1-y)   * procW + procW);
        }
        for (let y = border; y < procH - border; y++) {
          for (let x = 0; x < border; x++) {
            mData[y * procW + x]              = 2;
            mData[y * procW + procW - 1 - x] = 2;
          }
        }

        // Card interior: largest 7:4 (h:w) rect fitting within 60% of each axis.
        // Prior: card edges are within 20% of image edges → inner 60% is card.
        const cardHW = procH >= procW ? 7 / 4 : 4 / 7;
        const seedW  = Math.round(Math.min(0.60 * procW, 0.60 * procH / cardHW));
        const seedH  = Math.round(seedW * cardHW);
        const seedX0 = Math.floor((procW - seedW) / 2);
        const seedY0 = Math.floor((procH - seedH) / 2);
        console.log(`[corners] proc=${procW}×${procH} seed=${seedW}×${seedH} at (${seedX0},${seedY0})`);
        for (let y = seedY0; y < seedY0 + seedH; y++) {
          mData.fill(1, y * procW + seedX0, y * procW + seedX0 + seedW);
        }

        // ── Watershed ───────────────────────────────────────────────────────
        cv.watershed(imgBGR, markers);

        // Extract card mask (label == 1)
        const mOut = markers.data32S;
        const mask = cardMask.data;
        let cardPx = 0;
        for (let i = 0; i < procH * procW; i++) {
          mask[i] = mOut[i] === 1 ? 255 : 0;
          if (mOut[i] === 1) cardPx++;
        }
        console.log(`[corners] card region = ${(100 * cardPx / (procW * procH)).toFixed(1)}%`);

        // ── Contour → convex hull → 4-line fit ──────────────────────────────
        cv.findContours(cardMask, contours, hierarchy,
          cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        console.log(`[corners] contours found: ${contours.size()}`);
        if (contours.size() === 0) { resolve(null); return; }

        let best = contours.get(0);
        let bestArea = cv.contourArea(best);
        for (let i = 1; i < contours.size(); i++) {
          const c = contours.get(i);
          const a = cv.contourArea(c);
          if (a > bestArea) { bestArea = a; best = c; }
        }
        console.log(`[corners] best contour area = ${(100 * bestArea / (procW * procH)).toFixed(1)}%`);

        const hull = mat(new cv.Mat());
        cv.convexHull(best, hull, false, true);  // clockwise=false, returnPoints=true
        console.log(`[corners] hull points: ${hull.rows}, type: ${hull.type()}, channels: ${hull.channels()}`);

        // Extract hull points now (before they're deleted in finally)
        const hullOrig: [number, number][] = [];
        for (let i = 0; i < hull.rows; i++) {
          hullOrig.push([
            Math.round(hull.data32S[i * 2] / scale),
            Math.round(hull.data32S[i * 2 + 1] / scale),
          ]);
        }

        const quad = quadFromHullLines(hull, cv);
        if (!quad) {
          console.warn("[corners] quadFromHullLines failed");
          resolve(null); return;
        }
        console.log("[corners] quad (proc):", quad.map(([x,y]) => `(${Math.round(x)},${Math.round(y)})`).join(" "));

        const validated = validateCorners(quad, procW, procH);
        if (!validated) {
          console.warn("[corners] validateCorners failed");
          resolve(null); return;
        }

        const corners = validated.map(([x, y]) => [
          Math.round(x / scale),
          Math.round(y / scale),
        ]) as [number, number][];
        console.log("[corners] result (orig):", corners.map(([x,y]) => `(${x},${y})`).join(" "));
        resolve({ corners, hull: hullOrig });

      } catch (err) {
        console.error("[corners] exception:", err);
        resolve(null);
      } finally {
        toDelete.forEach(m => { try { m.delete(); } catch { /* ignore */ } });
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

      // Mask rounded corners — radius ≈ 1/8 of card width (matches real card)
      const ctx2d = outCanvas.getContext("2d")!;
      const r = OUT_W / 8; // 50px on a 400px-wide output
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
