// Supabase Edge Function: server-side OCR for one document.
//
// Security model
//  - Uses the CALLER's JWT for every database/storage access, so RLS and
//    storage policies decide whether the caller may read the document.
//    No service-role key is needed or used.
//  - Only the single requested document is sent to the OCR provider.
//  - The file is not persisted anywhere by this function.
//
// Provider selection (secrets, never in the client):
//   OCR_PROVIDER = "google-vision" | "none"
//   GOOGLE_VISION_API_KEY = …
// Adding a vendor = adding one function to PROVIDERS below; business logic
// (extraction + parent review) stays in the app and is vendor-neutral.

import { createClient } from 'npm:@supabase/supabase-js@2';

type OcrResult = { text: string; confidence: number | null; provider: string };
type Provider = (file: Blob, mime: string) => Promise<OcrResult>;

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const PROVIDERS: Record<string, Provider> = {
  'google-vision': async (file, mime) => {
    const key = Deno.env.get('GOOGLE_VISION_API_KEY');
    if (!key) throw new Error('provider not configured');
    if (mime === 'application/pdf') throw new Error('pdf requires async batch API');
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: toBase64(await file.arrayBuffer()) }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['sr-Latn', 'en'] } }],
      }),
    });
    if (!res.ok) throw new Error(`provider http ${res.status}`);
    const json = await res.json();
    const a = json.responses?.[0]?.fullTextAnnotation;
    const pages = a?.pages ?? [];
    const conf = pages.length ? Math.round((pages.reduce((s: number, p: { confidence?: number }) => s + (p.confidence ?? 0), 0) / pages.length) * 100) : null;
    return { text: a?.text ?? '', confidence: conf, provider: 'google-vision' };
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const auth = req.headers.get('Authorization');
  if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  try {
    const { document_id } = await req.json();
    if (typeof document_id !== 'string') throw new Error('bad request');

    // RLS: returns nothing unless the caller belongs to the document's family.
    const { data: doc, error } = await supabase.from('documents').select('id, storage_path, mime_type').eq('id', document_id).maybeSingle();
    if (error || !doc) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });

    const { data: file, error: dlError } = await supabase.storage.from('medical-documents').download(doc.storage_path);
    if (dlError || !file) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });

    const providerName = Deno.env.get('OCR_PROVIDER') ?? 'none';
    const provider = PROVIDERS[providerName];
    if (!provider) return new Response(JSON.stringify({ error: 'ocr not configured' }), { status: 501, headers: cors });

    const result = await provider(file, doc.mime_type);
    // Do not log document content.
    return new Response(JSON.stringify(result), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    console.error('ocr-extract failed:', (e as Error).message);
    return new Response(JSON.stringify({ error: 'ocr failed' }), { status: 500, headers: cors });
  }
});
