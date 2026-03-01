"""
Card corner detection using Python OpenCV.

Strategy 1: Marker-based watershed
  - Seeds center 20% of image as card (1), outer 5% border as background (2)
  - CLAHE-enhanced grayscale image as the watershed input
  - After watershed, card region (label 1) contour → convex hull → minAreaRect

Strategy 2: Hough line detection (fallback)
  - Dual-pass (standard + CLAHE) HoughLinesP → convex hull of endpoints → 4-vertex quad

Strategy 3: Contour-based detection (fallback)
  - Canny + MORPH_CLOSE with progressively larger kernels → RETR_LIST contours
  - minAreaRect then approxPolyDP

Returns corners in original image pixels, ordered TL TR BR BL.
"""

import cv2
import numpy as np

MAX_PROC_PX = 800


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points: TL, TR, BR, BL."""
    s = pts.sum(axis=1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    d = np.diff(pts, axis=1).flatten()
    tr = pts[np.argmin(d)]
    bl = pts[np.argmax(d)]
    return np.array([tl, tr, br, bl], dtype=np.float32)



def _validate_corners(corners_proc, proc_w, proc_h, scale, debug=False):
    """Check quad area + aspect ratio. Returns result dict or None."""
    # Reject quads that span nearly the full image — likely background contamination
    pts = np.array(corners_proc, dtype=np.float32).reshape(-1, 1, 2)
    quad_area = float(cv2.contourArea(pts))
    image_area = proc_w * proc_h
    area_frac = quad_area / image_area if image_area > 0 else 0

    if debug:
        print(f"[detect]   area_frac={area_frac:.3f}")

    if area_frac > 0.97:
        if debug:
            print(f"[detect]   quad spans {100*area_frac:.1f}% of image — likely hull contamination")
        return None

    # Edge margin check: skip when card fills most of the frame (corners near edge are valid)
    if area_frac < 0.65:
        edge_margin = max(5, round(min(proc_w, proc_h) * 0.03))
        for px, py in corners_proc:
            if (px < edge_margin or py < edge_margin
                    or px > proc_w - edge_margin or py > proc_h - edge_margin):
                if debug:
                    print(f"[detect]   corner ({px:.0f},{py:.0f}) within {edge_margin}px of edge")
                return None

    co = [(px / scale, py / scale) for px, py in corners_proc]
    tl, tr, br, bl = co
    top_w = float(np.hypot(tr[0] - tl[0], tr[1] - tl[1]))
    bot_w = float(np.hypot(br[0] - bl[0], br[1] - bl[1]))
    lef_h = float(np.hypot(bl[0] - tl[0], bl[1] - tl[1]))
    rig_h = float(np.hypot(br[0] - tr[0], br[1] - tr[1]))
    ratio = (top_w + bot_w) / (lef_h + rig_h) if (lef_h + rig_h) > 0 else 0

    if debug:
        print(f"[detect]   ratio={ratio:.3f}")

    if (0.35 <= ratio <= 0.90) or (1.1 <= ratio <= 2.9):
        return {
            "tl": [round(co[0][0]), round(co[0][1])],
            "tr": [round(co[1][0]), round(co[1][1])],
            "br": [round(co[2][0]), round(co[2][1])],
            "bl": [round(co[3][0]), round(co[3][1])],
        }
    if debug:
        print(f"[detect]   ratio {ratio:.3f} out of range")
    return None


def _line_intersection(l1, l2):
    """Intersect two lines given as (vx, vy, x0, y0). Returns (x, y) or None."""
    vx1, vy1, x1, y1 = l1
    vx2, vy2, x2, y2 = l2
    denom = vx1 * vy2 - vy1 * vx2
    if abs(denom) < 1e-6:
        return None  # parallel
    t = ((x2 - x1) * vy2 - (y2 - y1) * vx2) / denom
    return (float(x1 + t * vx1), float(y1 + t * vy1))


def _quad_from_hull_lines(hull, debug=False):
    """
    Fit 4 independent lines to a convex hull, then intersect adjacent pairs.

    Each hull edge is classified as top/bottom/left/right by its angle and
    the position of its midpoint relative to the hull centroid.  All points
    from edges in each group are collected and a single line is fit by least
    squares (cv2.fitLine).  Adjacent lines are then intersected to give
    corners, allowing each side to find its own best-fit direction
    independently (unlike minAreaRect which forces all angles to be equal).
    """
    pts = hull.reshape(-1, 2).astype(np.float32)
    n = len(pts)
    if n < 4:
        return None

    cx = float(pts[:, 0].mean())
    cy = float(pts[:, 1].mean())

    groups = {'top': [], 'bottom': [], 'left': [], 'right': []}

    for i in range(n):
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        dx = float(p2[0] - p1[0])
        dy = float(p2[1] - p1[1])
        angle = abs(np.degrees(np.arctan2(dy, dx)))   # 0–180°
        mid_x = (p1[0] + p2[0]) / 2.0
        mid_y = (p1[1] + p2[1]) / 2.0

        if angle < 45 or angle > 135:   # roughly horizontal
            key = 'top' if mid_y < cy else 'bottom'
        else:                            # roughly vertical
            key = 'left' if mid_x < cx else 'right'

        groups[key].extend([p1, p2])

    lines = {}
    for name, gpts in groups.items():
        if len(gpts) < 2:
            if debug:
                print(f"[detect] Hull lines: '{name}' group empty — cannot fit")
            return None
        arr = np.array(gpts, dtype=np.float32).reshape(-1, 1, 2)
        params = cv2.fitLine(arr, cv2.DIST_L2, 0, 0.01, 0.01).flatten()
        lines[name] = tuple(float(v) for v in params)   # (vx, vy, x0, y0)
        if debug:
            print(f"[detect] Hull lines: '{name}' fit from {len(gpts)//2} edges")

    tl = _line_intersection(lines['top'],    lines['left'])
    tr = _line_intersection(lines['top'],    lines['right'])
    br = _line_intersection(lines['bottom'], lines['right'])
    bl = _line_intersection(lines['bottom'], lines['left'])

    if None in (tl, tr, br, bl):
        if debug:
            print("[detect] Hull lines: parallel edge pair — cannot intersect")
        return None

    return [tl, tr, br, bl]


# ---------------------------------------------------------------------------
# Strategy 1: Marker-based watershed
# ---------------------------------------------------------------------------

def _detect_watershed(blurred, proc_w, proc_h, scale, debug=False, proc_img=None, debug_prefix=None):
    """
    Seed center 20% as card (1), outer 5% border as background (2).
    CLAHE-enhance the grayscale image so dark-on-dark edges are visible to watershed.
    After watershed: card region contour → convex hull → minAreaRect → corners.
    """
    # CLAHE to enhance dark-on-dark edges before watershed
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)
    img_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    # Marker image: 0 = unknown, 1 = card, 2 = background
    markers = np.zeros((proc_h, proc_w), dtype=np.int32)

    # Background seeds: outer 5% border
    border = max(3, round(min(proc_w, proc_h) * 0.05))
    markers[:border, :]  = 2
    markers[-border:, :] = 2
    markers[:, :border]  = 2
    markers[:, -border:] = 2

    # Card seed: largest 7:4 (h:w) rectangle that fits within 60% of each axis.
    # Prior: card edges are within 20% of image edges, so the inner 60% is
    # guaranteed card. Maintaining the card aspect ratio ensures the seed stays
    # inside the card even when the image aspect differs from 7:4.
    #   seed_w = min(60% of proc_w,  60% of proc_h scaled by card w/h ratio)
    # One axis hits 60%; the other is ≤60%.  When image IS 7:4 both hit 60%.
    CARD_H_OVER_W = 7.0 / 4.0 if proc_h >= proc_w else 4.0 / 7.0
    seed_w = round(min(0.60 * proc_w, 0.60 * proc_h / CARD_H_OVER_W))
    seed_h = round(seed_w * CARD_H_OVER_W)
    seed_x0 = (proc_w - seed_w) // 2
    seed_y0 = (proc_h - seed_h) // 2
    if debug:
        print(f"[detect] Watershed: seed {seed_w}×{seed_h} "
              f"({100*seed_w/proc_w:.0f}%w × {100*seed_h/proc_h:.0f}%h) "
              f"at ({seed_x0},{seed_y0})")
    markers[seed_y0 : seed_y0 + seed_h, seed_x0 : seed_x0 + seed_w] = 1

    cv2.watershed(img_bgr, markers)

    card_mask = (markers == 1).astype(np.uint8) * 255
    card_pct  = 100.0 * np.count_nonzero(card_mask) / (proc_w * proc_h)
    if debug:
        print(f"[detect] Watershed: card region = {card_pct:.1f}%")

    contours, _ = cv2.findContours(card_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        if debug:
            print("[detect] Watershed: no card contour")
        result = None
    else:
        cnt  = max(contours, key=cv2.contourArea)
        hull = cv2.convexHull(cnt)

        # Fit 4 independent lines to hull edges, intersect adjacent pairs
        quad = _quad_from_hull_lines(hull, debug=debug)
        if quad is None:
            # Fallback: minAreaRect
            if debug:
                print("[detect] Watershed: falling back to minAreaRect")
            rect = cv2.minAreaRect(hull)
            box  = cv2.boxPoints(rect).astype(np.float32)
            ordered = _order_points(box)
            quad = [(float(ordered[i][0]), float(ordered[i][1])) for i in range(4)]
        else:
            quad = _order_points(np.array(quad, dtype=np.float32))
            quad = [(float(quad[i][0]), float(quad[i][1])) for i in range(4)]

        cp = quad
        if debug:
            print(f"[detect] Watershed corners (proc): {[(round(x), round(y)) for x, y in cp]}")
        result = _validate_corners(cp, proc_w, proc_h, scale, debug=debug)

    # Always save watershed visualization (useful even on failure)
    if debug_prefix is not None and proc_img is not None:
        # Semi-transparent region overlay on the original image
        overlay = proc_img.copy()
        overlay[markers == 1] = (30, 160,  30)   # green  = card
        overlay[markers == 2] = (30,  30, 160)   # red    = background
        vis = cv2.addWeighted(overlay, 0.45, proc_img, 0.55, 0)

        # Full-opacity boundary line
        vis[markers == -1] = (0, 220, 255)        # yellow = watershed boundary

        # Convex hull of card contour (magenta)
        if contours:
            hull_vis = cv2.convexHull(max(contours, key=cv2.contourArea))
            cv2.polylines(vis, [hull_vis], isClosed=True,
                          color=(255, 0, 200), thickness=2)

        # Detected quad (cyan)
        if result:
            cp_proc = [[round(x * scale), round(y * scale)] for x, y in
                       [result["tl"], result["tr"], result["br"], result["bl"]]]
            pts = np.array(cp_proc, dtype=np.int32).reshape(-1, 1, 2)
            cv2.polylines(vis, [pts], isClosed=True, color=(0, 200, 255), thickness=2)
            for lbl, pt in zip(["TL", "TR", "BR", "BL"], cp_proc):
                cv2.circle(vis, tuple(pt), 6, (0, 200, 255), -1)
                cv2.putText(vis, lbl, (pt[0] + 8, pt[1] + 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1)
        cv2.imwrite(f"{debug_prefix}_watershed.jpg", vis)

    return result


# ---------------------------------------------------------------------------
# Strategy 2: Hough line detection
# ---------------------------------------------------------------------------

def _hough_lines(edge_img, proc_w, proc_h, min_len_frac, gap_frac=0.02, threshold=30):
    """Run HoughLinesP and return (N,4) array or empty array."""
    min_len = round(min(proc_w, proc_h) * min_len_frac)
    max_gap = round(min(proc_w, proc_h) * gap_frac)
    lines = cv2.HoughLinesP(edge_img, 1, np.pi / 180,
                             threshold=threshold, minLineLength=min_len, maxLineGap=max_gap)
    return lines.reshape(-1, 4) if lines is not None else np.empty((0, 4), dtype=np.int32)


def _detect_hough(blurred, proc_w, proc_h, scale, debug=False, proc_img=None, debug_prefix=None):
    """
    Dual-pass Hough → convex hull of long-segment endpoints → 4-vertex quad.

    Pass 1 (standard):  catches bright/high-contrast edges with min_len=20%.
    Pass 2 (CLAHE):     catches dark-on-dark edges (e.g. black border on dark fabric)
                        with stricter Canny thresholds and longer min_len=30% to
                        suppress background noise amplified by CLAHE.

    Taking the convex hull of all endpoints ensures interior features (black panels etc.)
    can't push the hull outward — only card-edge segments reach the image extremes.
    """
    median = float(np.median(blurred))

    # --- Pass 1: standard Canny ---
    edges1 = cv2.Canny(blurred, median * 0.5, median * 1.2)
    lines1 = _hough_lines(edges1, proc_w, proc_h, min_len_frac=0.20, threshold=30)

    # --- Pass 2: CLAHE-enhanced Canny ---
    # Catches dark-on-dark edges (e.g. black card border against dark fabric).
    # Uses larger maxLineGap (5%) to bridge fragmented edge pixels at low-contrast
    # boundaries. Higher Canny thresholds suppress background noise that CLAHE amplifies.
    clahe     = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    blurred_c = clahe.apply(blurred)
    median_c  = float(np.median(blurred_c))
    edges2    = cv2.Canny(blurred_c, median_c * 0.8, median_c * 1.6)
    lines2    = _hough_lines(edges2, proc_w, proc_h, min_len_frac=0.20,
                              gap_frac=0.05, threshold=30)

    all_lines = np.concatenate([lines1, lines2], axis=0)

    if debug:
        print(f"[detect] Hough: {len(lines1)} standard segs (≥20%), "
              f"{len(lines2)} CLAHE segs (≥30%), {len(all_lines)} total")

    # Save segment visualisation
    if debug_prefix is not None and proc_img is not None:
        vis = proc_img.copy()
        for x1, y1, x2, y2 in lines1:
            cv2.line(vis, (x1, y1), (x2, y2), (255, 255, 0), 2)   # cyan = standard
        for x1, y1, x2, y2 in lines2:
            cv2.line(vis, (x1, y1), (x2, y2), (0, 165, 255), 2)   # orange = CLAHE-only
        for segs in [lines1, lines2]:
            for x1, y1, x2, y2 in segs:
                cv2.circle(vis, (x1, y1), 3, (0, 255, 0), -1)
                cv2.circle(vis, (x2, y2), 3, (0, 255, 0), -1)
        cv2.imwrite(f"{debug_prefix}_hough_segments.jpg", vis)

    if len(all_lines) < 4:
        if debug:
            print("[detect] Hough: too few segments")
        return None

    # Convex hull of all segment endpoints
    endpoints = np.concatenate([all_lines[:, :2], all_lines[:, 2:4]], axis=0)
    hull = cv2.convexHull(endpoints.reshape(-1, 1, 2).astype(np.int32))
    perimeter = cv2.arcLength(hull, True)

    if debug:
        print(f"[detect] Hough: hull has {len(hull)} points")

    for eps in [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20]:
        approx = cv2.approxPolyDP(hull, eps * perimeter, True)
        n = len(approx)
        if debug:
            print(f"[detect] Hough hull eps={eps}: {n} vertices")
        if n == 4 and cv2.isContourConvex(approx):
            pts = approx.reshape(4, 2).astype(np.float32)
            ordered = _order_points(pts)
            cp = [(float(ordered[i][0]), float(ordered[i][1])) for i in range(4)]
            if debug:
                print(f"[detect] Hough corners (proc): "
                      f"{[(round(x), round(y)) for x,y in cp]}")
            result = _validate_corners(cp, proc_w, proc_h, scale, debug=debug)
            if result:
                return result
            break  # shape is wrong; more eps won't help

    return None


# ---------------------------------------------------------------------------
# Strategy 2: Contour-based detection (fallback)
# ---------------------------------------------------------------------------

def _detect_contour(edges, proc_w, proc_h, scale, image_area, debug=False, pad=0):
    """Find card corners from contours. Tries minAreaRect then approxPolyDP.
    `pad` pixels are subtracted from all contour coordinates (undo copyMakeBorder padding).
    """
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    all_with_area = [(cv2.contourArea(c), c) for c in contours]
    if debug:
        big = sorted([a for a, _ in all_with_area if a > image_area * 0.03], reverse=True)
        print(f"[detect] Contour: all areas >3% (image): "
              f"{[f'{100*a/image_area:.1f}%' for a in big[:15]]}")

    # Filter by fraction of the PROC image area (not the padded image area)
    large = sorted(
        [(a, c) for a, c in all_with_area
         if image_area * 0.05 < a],
        key=lambda x: x[0], reverse=True,
    )
    if debug:
        print(f"[detect] Contour: {len(large)} candidates (>5% of proc area)")

    for rank, (area, cnt) in enumerate(large[:10]):
        pct = 100 * area / image_area
        if debug:
            print(f"[detect] Contour [{rank}] {area:.0f} ({pct:.1f}% of proc)")

        # Undo padding offset
        cnt_unpadded = (cnt - pad).astype(np.int32)
        hull = cv2.convexHull(cnt_unpadded)

        # --- Try minAreaRect first (handles rounded corners) ---
        rect = cv2.minAreaRect(hull)
        box  = cv2.boxPoints(rect).astype(np.float32)
        ordered = _order_points(box)
        cp = [(float(ordered[i][0]), float(ordered[i][1])) for i in range(4)]
        if debug:
            print(f"[detect]   minAreaRect corners (proc): {[(round(x), round(y)) for x,y in cp]}")
        result = _validate_corners(cp, proc_w, proc_h, scale, debug=debug)
        if result:
            if debug:
                print(f"[detect]   minAreaRect SUCCESS")
            return result

        # --- Fallback: approxPolyDP ---
        perimeter = cv2.arcLength(hull, True)
        if perimeter == 0:
            continue
        for eps in [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15]:
            approx = cv2.approxPolyDP(hull, eps * perimeter, True)
            n = len(approx)
            if n != 4 or not cv2.isContourConvex(approx):
                if debug:
                    print(f"[detect]   approx eps={eps}: {n} verts")
                continue
            pts = approx.reshape(4, 2).astype(np.float32)
            ordered = _order_points(pts)
            cp = [(float(ordered[i][0]), float(ordered[i][1])) for i in range(4)]
            result = _validate_corners(cp, proc_w, proc_h, scale, debug=debug)
            if result:
                if debug:
                    print(f"[detect]   approx eps={eps} SUCCESS")
                return result
            break

    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def detect_corners(image_bytes: bytes, debug_prefix: str | None = None) -> dict | None:
    """
    Detect card corners from raw image bytes.
    Returns {"tl":[x,y], "tr":[x,y], "br":[x,y], "bl":[x,y]} in original pixels, or None.
    """
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        print("[detect] ERROR: could not decode image")
        return None

    orig_h, orig_w = img.shape[:2]
    print(f"[detect] {orig_w}×{orig_h}")

    scale = min(1.0, MAX_PROC_PX / max(orig_w, orig_h))
    proc_w = round(orig_w * scale)
    proc_h = round(orig_h * scale)
    print(f"[detect] → proc {proc_w}×{proc_h} scale={scale:.4f}")
    proc = cv2.resize(img, (proc_w, proc_h), interpolation=cv2.INTER_AREA)

    if debug_prefix:
        cv2.imwrite(f"{debug_prefix}_1_resized.jpg", proc)

    gray    = cv2.cvtColor(proc, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Strategy 1: Watershed
    print("[detect] Strategy 1: Watershed")
    result = _detect_watershed(blurred, proc_w, proc_h, scale, debug=True,
                               proc_img=proc, debug_prefix=debug_prefix)
    if result:
        print(f"[detect] ✓ Watershed: {result}")
        return result

    # Strategy 2: Hough
    print("[detect] Strategy 2: Hough lines")
    result = _detect_hough(blurred, proc_w, proc_h, scale, debug=True,
                           proc_img=proc, debug_prefix=debug_prefix)
    if result:
        print(f"[detect] ✓ Hough: {result}")
        return result

    # Strategy 3: Contour with MORPH_CLOSE (two Canny passes × multiple kernel sizes).
    # Padding prevents card outline at the image boundary from merging with the border.
    # Progressive closing bridges gaps in the dark-on-dark bottom edge.
    PAD        = 20
    median     = float(np.median(blurred))
    image_area = proc_w * proc_h

    for pass_idx, (lo_m, hi_m) in enumerate([(0.66, 1.33), (0.33, 0.66)]):
        low  = max(20.0, median * lo_m)
        high = min(255.0, max(50.0, median * hi_m))
        print(f"[detect] Strategy 3 pass {pass_idx + 1}: Canny {low:.0f}/{high:.0f}")

        edges = cv2.Canny(blurred, low, high)

        if debug_prefix:
            cv2.imwrite(f"{debug_prefix}_p{pass_idx + 1}_edges.png", edges)

        padded = cv2.copyMakeBorder(edges, PAD, PAD, PAD, PAD,
                                    cv2.BORDER_CONSTANT, value=0)

        for k_size in [3, 5, 7, 11, 15]:
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k_size, k_size))
            closed = cv2.morphologyEx(padded, cv2.MORPH_CLOSE, kernel)
            print(f"[detect]   contour k={k_size}")
            result = _detect_contour(closed, proc_w, proc_h, scale, image_area,
                                     debug=True, pad=PAD)
            if result:
                print(f"[detect] ✓ Contour pass {pass_idx + 1} k={k_size}: {result}")
                return result

    print("[detect] all strategies failed")
    return None


def _save_result_debug(proc_img, result, scale, path):
    vis = proc_img.copy()
    cp  = [[round(x * scale), round(y * scale)]
           for x, y in [result["tl"], result["tr"], result["br"], result["bl"]]]
    pts = np.array(cp, dtype=np.int32).reshape((-1, 1, 2))
    cv2.polylines(vis, [pts], isClosed=True, color=(0, 200, 255), thickness=3)
    for label, pt in zip(["TL", "TR", "BR", "BL"], cp):
        cv2.circle(vis, tuple(pt), 8, (0, 200, 255), -1)
        cv2.putText(vis, label, (pt[0] + 10, pt[1] + 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 200, 255), 2)
    cv2.imwrite(path, vis)
