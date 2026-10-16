# GrowthCare — Database Design

Recommended backend:
- Supabase Auth
- PostgreSQL
- Supabase Storage
- Row Level Security
- Edge Functions for server-side processing where needed

## Tables

### profiles
- id UUID PK, references auth.users
- full_name
- avatar_url
- created_at
- updated_at

### families
- id UUID PK
- name
- created_by
- created_at
- updated_at

### family_members
- id UUID PK
- family_id
- user_id
- role: owner | parent
- status
- created_at

Unique: family_id + user_id

### family_invitations
- id
- family_id
- email
- role
- token
- expires_at
- accepted_at
- created_by
- created_at

### children
- id
- family_id
- first_name
- last_name
- date_of_birth
- sex
- photo_url
- notes
- created_at
- updated_at

### medications
- id
- child_id
- name
- strength
- unit
- active
- start_date
- end_date
- current_dose
- dose_unit
- frequency
- scheduled_time
- prescribing_doctor
- notes
- created_at
- updated_at

### therapy_changes
- id
- medication_id
- previous_dose
- new_dose
- dose_unit
- changed_at
- source_type
- source_document_id nullable
- doctor_visit_id nullable
- note
- created_by
- created_at

### injections
- id
- child_id
- medication_id
- scheduled_for
- administered_at
- dose
- dose_unit
- status: pending | given | skipped | missed
- administered_by
- injection_site
- skip_reason
- note
- created_at
- updated_at

### growth_measurements
- id
- child_id
- measured_at
- height_cm
- weight_kg
- bmi
- head_circumference_cm nullable
- source
- note
- created_by
- created_at

### doctors
- id
- family_id
- name
- specialty
- clinic
- phone
- email
- notes
- created_at

### doctor_visits
- id
- child_id
- doctor_id nullable
- scheduled_at
- completed_at
- status
- reason
- notes
- follow_up_date
- created_by
- created_at
- updated_at

### lab_tests
- id
- child_id
- collected_at
- laboratory
- document_id nullable
- notes
- created_at

### lab_results
- id
- lab_test_id
- test_name
- result_value
- result_numeric nullable
- unit
- reference_range
- flag nullable
- source_text
- verified
- created_at

### documents
- id
- child_id
- family_id
- storage_path
- original_filename
- mime_type
- size_bytes
- category
- document_date
- title
- ocr_status
- ocr_text
- created_by
- created_at
- updated_at

### document_extractions
- id
- document_id
- field_name
- extracted_value
- confidence
- verified
- verified_value
- created_at

### reminders
- id
- child_id
- type
- title
- description
- scheduled_for
- recurrence_rule nullable
- related_entity_type nullable
- related_entity_id nullable
- enabled
- created_by
- created_at

### notification_preferences
- id
- user_id
- dose_enabled
- appointment_enabled
- laboratory_enabled
- measurement_enabled
- stock_enabled
- custom_enabled
- quiet_hours_start
- quiet_hours_end

### audit_logs
- id
- family_id
- child_id nullable
- user_id
- entity_type
- entity_id
- action
- old_data JSONB nullable
- new_data JSONB nullable
- created_at

## Storage

Bucket:
`medical-documents`

Path:
`{family_id}/{child_id}/{document_id}/{filename}`

Never expose permanent public URLs.

Use short-lived signed URLs.

## RLS

Every child-owned table must enforce that the current authenticated user belongs to the child's family.

Every family-owned table must enforce membership.

Documents must be protected through both database authorization and storage policies.

No client should be able to provide a child_id and access another family's data.

## Indexes

Create indexes for:
- children.family_id
- injections.child_id + scheduled_for
- growth_measurements.child_id + measured_at
- doctor_visits.child_id + scheduled_at
- lab_tests.child_id + collected_at
- documents.child_id + document_date
- timeline/audit timestamps

## Audit requirements

Record:
- creation
- edit
- deletion
- dose changes
- document deletion
- family membership changes

Never store passwords or authentication secrets in application tables.
