import Anthropic from "npm:@anthropic-ai/sdk@0.36.3";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_PROMPT = `You are extracting structured data from photos of a cheese card.

Extract the following fields and return ONLY valid JSON with no markdown or explanation:
{
  "name": "cheese name (from front of card if visible, otherwise from back)",
  "country": "country of origin",
  "region": "region/area within the country",
  "milk_type": "type of milk (e.g. Cow, Sheep, Goat, Buffalo, or combinations)",
  "description": "the full descriptive text about the cheese",
  "food_pairings": ["array", "of", "food", "pairing", "items"],
  "wine_pairings": ["array", "of", "wine", "pairing", "items"]
}

For pairings: they appear under a heading like "Pairs well with..." as a list.
Separate food items from wine items. Wine items are wines, champagnes, sparkling drinks,
or any recognizable wine variety (e.g. "Sauvignon Blanc", "Pinot Noir", "Prosecco", "Sancerre").
Remove the word "wine" from wine pairing items (e.g. "Sauvignon Blanc wine" → "Sauvignon Blanc").
Return empty arrays if no pairings are found.
If a field is not present on the card, return an empty string for that field.`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Verify auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  // Check admin role
  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const profile = profileData as { role: string } | null;

  if (profile?.role !== "admin") {
    return new Response("Forbidden", { status: 403, headers: CORS_HEADERS });
  }

  const formData = await req.formData();
  const backFile = formData.get("back") as File | null;
  const frontFile = formData.get("front") as File | null;

  if (!backFile) {
    return new Response("No back image provided", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const toBase64 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  };

  const backBase64 = await toBase64(backFile);
  const frontBase64 = frontFile ? await toBase64(frontFile) : null;

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  const imageBlocks: Anthropic.ImageBlockParam[] = [];

  if (frontBase64 && frontFile) {
    imageBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: frontFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: frontBase64,
      },
    });
  }

  imageBlocks.push({
    type: "image",
    source: {
      type: "base64",
      media_type: backFile.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: backBase64,
    },
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const metadata = JSON.parse(text);
    return new Response(JSON.stringify(metadata), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return new Response(match[0], {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    return new Response("Failed to parse response", {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
