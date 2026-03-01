#!/usr/bin/env python3
"""
Local CLI test: python test_detector.py <image_path> [--no-show]

Runs the detector, prints JSON result, saves *_result.jpg, and shows the
watershed debug image in a window (press any key to close).
Pass --no-show to skip display.
"""

import os
import sys
import json

# Suppress Qt "Cannot find font directory" warnings — must be set before cv2 is imported
os.environ.setdefault("QT_LOGGING_RULES", "qt.qpa.fonts=false")

import cv2
import numpy as np

from detector import detect_corners


def fit_to_screen(img: np.ndarray, max_dim: int = 1200) -> np.ndarray:
    h, w = img.shape[:2]
    if max(w, h) > max_dim:
        s = max_dim / max(w, h)
        img = cv2.resize(img, (round(w * s), round(h * s)))
    return img


def main():
    args  = [a for a in sys.argv[1:] if not a.startswith("-")]
    flags = [a for a in sys.argv[1:] if a.startswith("-")]
    show  = "--no-show" not in flags

    if not args:
        print("Usage: python test_detector.py <image_path> [--no-show]")
        sys.exit(1)

    path = args[0]
    with open(path, "rb") as f:
        data = f.read()

    debug_prefix = path.rsplit(".", 1)[0] + "_dbg"
    result = detect_corners(data, debug_prefix=debug_prefix)

    ws_path = debug_prefix + "_watershed.jpg"

    if result is None:
        print("No card detected.")
        if show:
            ws_img = cv2.imread(ws_path)
            if ws_img is not None:
                cv2.imshow("Watershed  (green=card  red=bg  yellow=boundary)",
                           fit_to_screen(ws_img))
                cv2.waitKey(0)
                cv2.destroyAllWindows()
        sys.exit(1)

    print(json.dumps(result, indent=2))

    result_path = path.rsplit(".", 1)[0] + "_result.jpg"
    print(f"Watershed debug saved to: {ws_path}")

    if show:
        ws_img = cv2.imread(ws_path)
        if ws_img is not None:
            cv2.imshow("Watershed  (green=card  red=bg  yellow=boundary)",
                       fit_to_screen(ws_img))
            cv2.waitKey(0)
            cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
