import Anthropic from "npm:@anthropic-ai/sdk@0.36.3";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `This photo contains a cheese information card — approximately 2 inches wide by 3.5 inches tall, portrait orientation, slightly rounded corners, with a black border. The card may be resting on a table at a slight angle; perspective distortion (trapezoid shape, non-right-angle corners) is expected and normal.

Find the four corners of the card. Because the corners are rounded, extend the straight edges to where they would meet if they continued past the round.

Respond with ONLY this JSON (no markdown, no explanation):
{"tl":[x,y],"tr":[x,y],"br":[x,y],"bl":[x,y]}

tl=top-left, tr=top-right, br=bottom-right, bl=bottom-left. x and y are integer pixel coordinates in the image.

If you cannot clearly identify all four corners, respond with: {"error":"not found"}`;

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

  const toBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  };

  const base64 = await toBase64(imageFile);
  const mediaType = imageFile.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: PROMPT },
      ],
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "";

  try {
    const parsed = JSON.parse(text);
    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch {
    // Try to extract JSON from response in case model added surrounding text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return new Response(match[0], {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "parse failed" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
