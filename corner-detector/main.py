"""
FastAPI microservice: POST /detect-corners
Accepts a multipart image, returns card corner coordinates.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from detector import detect_corners

app = FastAPI(title="Card Corner Detector")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.post("/detect-corners")
async def detect_corners_endpoint(image: UploadFile = File(...)):
    data = await image.read()
    result = detect_corners(data)
    if result is None:
        raise HTTPException(status_code=422, detail="No card found in image")
    return result


@app.get("/health")
def health():
    return {"ok": True}
