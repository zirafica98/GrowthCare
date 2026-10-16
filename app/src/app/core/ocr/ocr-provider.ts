import { InjectionToken } from '@angular/core';

export interface OcrInput {
  file: Blob;
  mimeType: string;
  documentId: string;
  storagePath: string;
}

export interface OcrOutput {
  text: string;
  /** Mean engine confidence 0–100, or null if unknown. */
  confidence: number | null;
  provider: string;
}

/**
 * Port for OCR engines. Business logic depends only on this interface — no
 * AI/OCR vendor is hard-coded. Implementations:
 *  - BrowserOcrProvider: on-device Tesseract (document never leaves the phone)
 *  - EdgeOcrProvider:    Supabase Edge Function; the server decides which
 *                        vendor to call, keys stay server-side
 *  - MockOcrProvider:    deterministic text for demos/tests
 */
export interface OcrProvider {
  readonly name: string;
  supports(mimeType: string): boolean;
  recognize(input: OcrInput, onProgress?: (p: number) => void): Promise<OcrOutput>;
}

export const OCR_PROVIDER = new InjectionToken<OcrProvider>('OCR_PROVIDER');
