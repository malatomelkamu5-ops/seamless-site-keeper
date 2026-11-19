import { generateChatCompletion, GatewayError, PaymentRequiredError, RateLimitError } from "@lovable.dev/ai-gateway";
import { bytesToDataUrl, composeGrid } from "@/lib/face-grid";

/** One light model for both checks; the grid lets a single request cover the whole school. */
const MODEL = "google/gemini-3-flash-preview";
/** A grid match only blocks registration when the model is this sure. */
export const MATCH_CONFIDENCE = 0.9;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

async function ask(content: Part[]): Promise<Record<string, unknown>> {
  try {
    const res = await generateChatCompletion({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a careful identity checker for school exam registration. Return JSON only." },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
    });
    const msg = res.choices?.[0]?.message?.content as unknown;
    const text = typeof msg === "string" ? msg : Array.isArray(msg) ? msg.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "")).join("") : "";
    return parseJson(text);
  } catch (e) {
    if (e instanceof GatewayError) console.error("Face check failed", e.code, e.httpStatus, JSON.stringify(e.ids ?? {}));
    else console.error("Face check failed", e);
    if (e instanceof PaymentRequiredError) throw new Error("Face verification is paused because the school's AI credit is used up. Please tell IT Admin.");
    if (e instanceof RateLimitError) throw new Error("Face verification is busy. Please try again in a minute.");
    throw new Error("Face verification is unavailable right now. Please try again.");
  }
}

/** Reads the model's JSON reply, tolerating code fences or extra words around it. */
export function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return {}; }
}

const yes = (v: unknown) => v === true || v === "true" || v === "yes";
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export const COVERED_MSG = "Face verification failed: Your face must be completely uncovered and visible without masks or coverings.";
export const NO_FACE_MSG = "Face verification failed: exactly one face must be clearly visible. Sit alone, face the camera and try again.";
export const UNCLEAR_MSG = "Face verification failed: the photo is too dark or blurry. Move to better light, hold still and retake it.";
export const DUPLICATE_MSG = "This face is already registered to another account.";

/** Decides the outcome of the uncovered-face check from the model's reply (null = passed). */
export function uncoveredVerdict(r: Record<string, unknown>): string | null {
  const faces = num(r["face_count"]);
  if (faces !== 1) return NO_FACE_MSG;
  if (r["clear"] !== undefined && !yes(r["clear"])) return UNCLEAR_MSG;
  if (!yes(r["fully_uncovered"])) return COVERED_MSG;
  return null;
}

/** Throws if no single, fully uncovered, clearly visible face is in the photo. */
export async function checkUncovered(dataUrl: string) {
  const r = await ask([
    { type: "text", text: 'Inspect this live webcam photo for a school exam identity check. Reply only as json: {"face_count": number, "clear": boolean, "fully_uncovered": boolean, "reason": string}. face_count = number of human faces. clear = false only if the face is too dark, blurred or cut off to recognise. fully_uncovered = false if a mask, scarf over mouth or nose, sunglasses, hand, hood or any object hides part of the face. Normal clear eyeglasses, hair and head scarves that leave the whole face visible are allowed (fully_uncovered = true).' },
    { type: "image_url", image_url: { url: dataUrl } },
  ]);
  const verdict = uncoveredVerdict(r);
  if (verdict) throw new Error(verdict);
}

/**
 * Reads the grid reply: the tile number (1..tiles) the new face matches, or null.
 * Accepts numbers, "12", "R12" or "#12"; a match below the confidence bar is ignored.
 */
export function screenMatch(r: Record<string, unknown>, tiles: number, minConfidence = MATCH_CONFIDENCE): number | null {
  const raw = r["match"] ?? r["match_index"] ?? r["tile"];
  const idx = typeof raw === "string" ? Number(raw.trim().replace(/^(R|#|tile\s*)/i, "")) : num(raw);
  const conf = num(r["confidence"]);
  if (r["same_person"] !== undefined && !yes(r["same_person"])) return null;
  return Number.isInteger(idx) && idx >= 1 && idx <= tiles && (Number.isNaN(conf) ? true : conf >= minConfidence) ? idx : null;
}
/** True when the grid reply names a confident match. */
export const isDuplicate = (r: Record<string, unknown>, tiles: number) => screenMatch(r, tiles) !== null;

/** A one-to-one answer only counts when the model is very sure it is the same person. */
export function isSamePerson(r: Record<string, unknown>): boolean {
  const conf = num(r["confidence"]);
  return yes(r["same_person"]) && !Number.isNaN(conf) && conf >= 0.9;
}

const gridPrompt = (n: number, cols: number) =>
  `Image 1 is NEW: a student trying to register for the school exam. Image 2 is ONE grid of ${n} face tiles (${cols} per row) of students who are already registered across all sections; every tile has its number (1 to ${n}) printed in yellow on black in its top-left corner. ` +
  "Is the person in NEW the very same human being as the person in any tile? Classmates are the same age, often the same ethnicity, wear the same uniform and were photographed with similar phones, so different students can look alike. " +
  "Judge only by facial identity — face shape and jaw, eyebrows, eye shape and spacing, nose, lips, ears, skin marks — never by clothing, uniform, hairstyle, head scarf, glasses, lighting, angle or background. " +
  `Answer same_person = true only if you are certain; if in any doubt answer false. Reply only as json: {"match": tile number 1..${n} or null, "same_person": boolean, "confidence": number between 0 and 1}.`;

const PAIR_PROMPT = 'You are checking a school exam registration. Classmates are the same age, often the same ethnicity and even siblings, wear the same uniform and are photographed with similar phones, so different students can look alike. Compare face photo A with face photo B one feature at a time: face shape and jaw, eyebrows, eye shape and spacing, nose, lips, ears, skin marks. Ignore clothing, hair, head scarf, glasses, lighting, angle and background. Say same_person = true only if you are certain both photos show the very same individual; if in any doubt, answer false. Reply only as json: {"differences": string, "same_person": boolean, "confidence": number between 0 and 1}.';

/**
 * Throws if the new face matches any registered face.
 * All registered faces are combined into one compact numbered grid and screened with ONE light
 * AI request. Look-alike classmates (even sisters) can be named by the grid, so a named tile only
 * blocks registration after one light one-to-one check against that student's full photo agrees.
 * `tiles` are the stored face tiles (JPEG bytes), `labels` the matching student IDs (for logs),
 * `fullPhoto(i)` loads the full photo (data URL) of tile i (0-based).
 */
export async function checkNotDuplicate(dataUrl: string, tiles: Uint8Array[], labels: string[] = [], fullPhoto?: (i: number) => Promise<string | null>) {
  if (tiles.length === 0) return;
  const grid = composeGrid(tiles);
  const r = await ask([
    { type: "text", text: gridPrompt(tiles.length, grid.cols) },
    { type: "text", text: "Image 1 — NEW:" },
    { type: "image_url", image_url: { url: dataUrl } },
    { type: "text", text: "Image 2 — registered students grid:" },
    { type: "image_url", image_url: { url: bytesToDataUrl(grid.jpeg) } },
  ]);
  const idx = screenMatch(r, tiles.length);
  if (idx === null) return;
  const full = fullPhoto ? await fullPhoto(idx - 1) : null;
  // Two independent one-to-one answers (both image orders) must agree before anyone is blocked.
  const pair = (a: string, b: string) => ask([
    { type: "text", text: PAIR_PROMPT },
    { type: "text", text: "Photo A:" },
    { type: "image_url", image_url: { url: a } },
    { type: "text", text: "Photo B:" },
    { type: "image_url", image_url: { url: b } },
  ]).then(isSamePerson);
  const same = full ? (await Promise.all([pair(dataUrl, full), pair(full, dataUrl)])).every(Boolean) : true;
  console.error(`Face grid candidate tile ${idx} (${labels[idx - 1] ?? "?"}) confirmed=${same}`, JSON.stringify(r));
  if (same) throw new Error(DUPLICATE_MSG);
}
