import { SupabaseClient } from '@supabase/supabase-js';
import { appError } from '../data/errors';
import { OcrInput, OcrOutput, OcrProvider } from './ocr-provider';

/**
 * On-device OCR with Tesseract (Serbian Latin + English). The image is
 * processed locally; only the language model is downloaded (once, cached).
 * PDFs and HEIC (outside Safari) are not supported here → manual entry/retry.
 */
export class BrowserOcrProvider implements OcrProvider {
  readonly name = 'tesseract';

  supports(mimeType: string): boolean {
    return /^image\/(png|jpe?g|webp|bmp|gif)$/i.test(mimeType);
  }

  async recognize(input: OcrInput, onProgress?: (p: number) => void): Promise<OcrOutput> {
    if (!this.supports(input.mimeType)) throw appError('ocr', null, 'Ovaj format se ne može očitati na uređaju. Unesite podatke ručno.');
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(['srp_latn', 'eng'], 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
      },
    });
    try {
      const { data } = await worker.recognize(input.file);
      return { text: data.text, confidence: data.confidence ?? null, provider: this.name };
    } finally {
      await worker.terminate();
    }
  }
}

/**
 * Server-side OCR through the `ocr-extract` Edge Function. The function
 * downloads the file from private storage itself (after checking the caller's
 * family membership) and calls whichever provider is configured server-side.
 */
export class EdgeOcrProvider implements OcrProvider {
  readonly name = 'edge';
  constructor(private readonly sb: SupabaseClient) {}

  supports(): boolean {
    return true;
  }

  async recognize(input: OcrInput): Promise<OcrOutput> {
    const { data, error } = await this.sb.functions.invoke<OcrOutput>('ocr-extract', {
      body: { document_id: input.documentId },
    });
    if (error || !data) throw appError('ocr', error);
    return data;
  }
}

/** Deterministic provider for demos and tests. */
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';
  constructor(private readonly text = MOCK_LAB_TEXT, private readonly fail = false) {}

  supports(): boolean {
    return true;
  }

  async recognize(): Promise<OcrOutput> {
    await new Promise((r) => setTimeout(r, 600));
    if (this.fail) throw appError('ocr');
    return { text: this.text, confidence: 88, provider: this.name };
  }
}

export const MOCK_LAB_TEXT = `BIOHEMIJSKA LABORATORIJA
Datum uzorkovanja: 12.10.2026.
Laboratorijski nalazi urađeni 12.10.2026.: IGF-1 245.6 [100-400] (ng/mL), TSH 2.1 [0.4-4.0] (mIU/L), FT4 16.8 [12-22] (pmol/L), IGF-BP3 4.8 [2.8-6.3] (mg/L)`;
