import Anthropic from "npm:@anthropic-ai/sdk@0.36.3";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Read width/height from a JPEG SOF marker without a full image library. */
function getJpegDimensions(buffer: ArrayBuffer): { w: number; h: number } | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null; // not a JPEG
  let offset = 2;
  while (offset < view.byteLength - 4) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = view.getUint8(offset + 1);
    // SOF0–SOF3: Start of Frame markers that contain image dimensions
    if (marker >= 0xC0 && marker <= 0xC3) {
      if (offset + 9 > view.byteLength) break;
      const h = view.getUint16(offset + 5);
      const w = view.getUint16(offset + 7);
      return { w, h };
    }
    if (marker === 0xD9 || marker === 0xDA) break; // EOI or SOS — stop
    if (offset + 4 > view.byteLength) break;
    const segLen = view.getUint16(offset + 2);
    if (segLen < 2) break;
    offset += 2 + segLen;
  }
  return null;
}

function buildPrompt(imgW: number, imgH: number): string {
  return `You are analyzing a photo of a cheese information card. The image is ${imgW} pixels wide by ${imgH} pixels tall.

The card has these characteristics:
- A solid BLACK BORDER along all four edges (the most visually distinctive feature)
- Portrait orientation (taller than wide, roughly 4:7 width-to-height ratio)
- Slightly rounded corners
- Resting on a surface, photographed from above at an angle

CRITICAL: The camera angle creates PERSPECTIVE DISTORTION. The card appears as an irregular quadrilateral — NOT a rectangle. The four corner coordinates will NOT satisfy tl.y=tr.y or tl.x=bl.x. If your answer would form a perfect rectangle, you have made an error.

Task: Find the four corners of the card's outer black border.
- Where corners are rounded, mentally extend the straight border edges until they meet — that intersection is the corner.
- Trace each of the 4 edges as a straight line. The corners are where these lines cross.

Think step by step:
1. Where is the card in the image? Describe its position.
2. Find the top edge line — what angle does it run at?
3. Find the bottom edge line — what angle?
4. Find the left edge line — what angle?
5. Find the right edge line — what angle?
6. Compute or estimate the four intersection points.

After your reasoning, output ONLY the JSON on the final line (no markdown fences):
{"tl":[x,y],"tr":[x,y],"br":[x,y],"bl":[x,y]}

tl=top-left, tr=top-right, br=bottom-right, bl=bottom-left.
x = pixels from left edge (0–${imgW}), y = pixels from top edge (0–${imgH}). All integers.

If you cannot find the card's black border, output on the final line: {"error":"not found"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response("Invalid form data", { status: 400, headers: CORS_HEADERS });
  }

  const imageFile = formData.get("image") as File | null;
  if (!imageFile) {
    return new Response("No image provided", { status: 400, headers: CORS_HEADERS });
  }

  const buffer = await imageFile.arrayBuffer();
  const dims = getJpegDimensions(buffer);
  const imgW = dims?.w ?? 0;
  const imgH = dims?.h ?? 0;

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);

  const mediaType = imageFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  console.log(`detect-corners: image ${imageFile.name} type=${mediaType} size=${imageFile.size} bytes dimensions=${imgW}x${imgH}`);

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  const prompt = imgW > 0 && imgH > 0 ? buildPrompt(imgW, imgH) : buildPrompt(0, 0);
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: prompt },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  console.log("detect-corners: Claude raw response:", text);

  // Claude may include chain-of-thought reasoning before the JSON.
  // Scan lines from the end to find the last valid JSON object.
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line);
      console.log("detect-corners: parsed corners:", JSON.stringify(parsed));
      return new Response(JSON.stringify(parsed), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch { /* not valid JSON, keep scanning */ }
  }
  return new Response(JSON.stringify({ error: "parse failed" }), {
    status: 500,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
