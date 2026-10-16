# GrowthCare — OCR and AI Extraction

## Goal

Turn uploaded medical documents into useful structured data while preserving the original document and requiring parent verification.

## Pipeline

1. User selects document.
2. Upload original to private storage.
3. Create processing job.
4. OCR text extraction.
5. Document classification.
6. Candidate structured extraction.
7. Return extracted fields.
8. Parent reviews.
9. Parent confirms/corrects.
10. Save verified fields.
11. Preserve raw OCR and original document.

## Document types

- Doctor report
- Lab result
- Prescription
- Referral
- Therapy document
- Other

## Candidate extraction

Doctor report:
- date
- doctor
- specialty
- clinic
- therapy
- dose
- follow-up
- relevant notes

Laboratory:
- test name
- value
- unit
- reference range
- flag
- date

Prescription:
- medication
- strength
- dose
- frequency
- date

## Important

AI/OCR output is untrusted until reviewed by the parent.

UI:
“Automatski izvučeno — proverite podatke pre čuvanja.”

Every field must remain editable.

## Confidence

Show:
- high
- medium
- low

Do not imply clinical correctness from OCR confidence.

## Failure handling

If OCR fails:
- keep original file
- show “Nismo uspeli da očitamo dokument.”
- allow manual metadata
- allow retry

## Privacy

Medical document content should not be sent to an external AI provider unless the architecture explicitly allows it and the family has appropriate privacy controls.

Prefer processing providers that meet the application's privacy requirements and minimize retention.

Do not send the entire medical history to an AI model when a single document is sufficient.

## Audit

Record:
- uploaded
- OCR started
- OCR completed/failed
- extracted
- verified
- edited after extraction
