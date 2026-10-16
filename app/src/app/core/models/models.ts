/**
 * Domain models — mirror the PostgreSQL schema in /supabase/migrations.
 * Column names are kept snake_case so rows can flow between the client and
 * the database without a mapping layer.
 */

export type UUID = string;
export type ISODate = string; // yyyy-mm-dd
export type ISODateTime = string; // full ISO timestamp

export interface Profile {
  id: UUID;
  full_name: string;
  avatar_url: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface FamilySettings {
  skip_reasons?: string[];
  injection_sites?: string[];
}

export interface Family {
  id: UUID;
  name: string;
  created_by: UUID;
  settings: FamilySettings;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type FamilyRole = 'owner' | 'parent';
export type MemberStatus = 'active' | 'revoked';

export interface FamilyMember {
  id: UUID;
  family_id: UUID;
  user_id: UUID;
  role: FamilyRole;
  status: MemberStatus;
  display_name: string | null;
  created_at: ISODateTime;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface FamilyInvitation {
  id: UUID;
  family_id: UUID;
  email: string;
  role: FamilyRole;
  token: string;
  status: InvitationStatus;
  expires_at: ISODateTime;
  accepted_at: ISODateTime | null;
  created_by: UUID;
  created_at: ISODateTime;
}

export type Sex = 'male' | 'female' | null;

export interface Child {
  id: UUID;
  family_id: UUID;
  first_name: string;
  last_name: string | null;
  date_of_birth: ISODate;
  sex: Sex;
  photo_url: string | null;
  avatar_color: string | null;
  birth_weight_g: number | null;
  birth_length_cm: number | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** 'daily' or 'weekly:1,3,5' (ISO weekdays 1=Mon … 7=Sun). */
export type Frequency = string;

export interface Medication {
  id: UUID;
  child_id: UUID;
  name: string;
  substance: string | null;
  strength: string | null;
  unit: string | null;
  active: boolean;
  start_date: ISODate | null;
  end_date: ISODate | null;
  current_dose: number;
  dose_unit: string;
  frequency: Frequency;
  scheduled_time: string; // HH:mm
  prescribing_doctor: string | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type TherapySource = 'doctor_visit' | 'document' | 'manual';

export interface TherapyChange {
  id: UUID;
  medication_id: UUID;
  child_id: UUID;
  previous_dose: number | null;
  new_dose: number;
  dose_unit: string;
  changed_at: ISODate;
  source_type: TherapySource;
  source_document_id: UUID | null;
  doctor_visit_id: UUID | null;
  note: string | null;
  created_by: UUID;
  created_at: ISODateTime;
}

export interface MedicationStock {
  id: UUID;
  medication_id: UUID;
  child_id: UUID;
  package_name: string;
  strength: string | null;
  total_amount: number; // in the medication's dose_unit (e.g. mg in a cartridge)
  quantity: number; // number of packages / cartridges
  opened_at: ISODate | null;
  refill_date: ISODate | null;
  expires_at: ISODate | null;
  reminder_threshold_days: number;
  note: string | null;
  created_at: ISODateTime;
}

export type InjectionStatus = 'pending' | 'given' | 'skipped' | 'missed';
export type InjectionReaction = 'great' | 'redness' | 'other' | null;

export interface Injection {
  id: UUID;
  child_id: UUID;
  medication_id: UUID;
  scheduled_for: ISODateTime;
  administered_at: ISODateTime | null;
  dose: number | null;
  dose_unit: string;
  status: InjectionStatus;
  administered_by: UUID | null;
  injection_site: string | null;
  reaction: InjectionReaction;
  skip_reason: string | null;
  note: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type MeasurementSource = 'home' | 'doctor' | 'document' | 'other';

export interface GrowthMeasurement {
  id: UUID;
  child_id: UUID;
  measured_at: ISODateTime;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  head_circumference_cm: number | null;
  source: MeasurementSource;
  note: string | null;
  created_by: UUID;
  created_at: ISODateTime;
}

export interface Doctor {
  id: UUID;
  family_id: UUID;
  name: string;
  specialty: string | null;
  clinic: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: ISODateTime;
}

export type VisitStatus = 'scheduled' | 'completed' | 'cancelled';

export interface VisitTask {
  id: string;
  text: string;
  done: boolean;
}

export interface DoctorVisit {
  id: UUID;
  child_id: UUID;
  doctor_id: UUID | null;
  scheduled_at: ISODateTime;
  completed_at: ISODateTime | null;
  status: VisitStatus;
  reason: string | null;
  notes: string | null;
  follow_up_date: ISODate | null;
  tasks: VisitTask[];
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface LabTest {
  id: UUID;
  child_id: UUID;
  collected_at: ISODateTime;
  laboratory: string | null;
  document_id: UUID | null;
  notes: string | null;
  created_by: UUID;
  created_at: ISODateTime;
}

export interface LabResult {
  id: UUID;
  lab_test_id: UUID;
  child_id: UUID;
  test_name: string;
  result_value: string;
  result_numeric: number | null;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  clinician_note: string | null;
  source_text: string | null;
  verified: boolean;
  created_at: ISODateTime;
}

export type DocumentCategory =
  | 'doctor_report'
  | 'laboratory'
  | 'prescription'
  | 'referral'
  | 'imaging'
  | 'therapy'
  | 'other';

export type OcrStatus = 'none' | 'pending' | 'processing' | 'review' | 'completed' | 'failed';

export interface MedicalDocument {
  id: UUID;
  child_id: UUID;
  family_id: UUID;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  category: DocumentCategory;
  document_date: ISODate | null;
  title: string;
  tags: string[];
  doctor_visit_id: UUID | null;
  medication_id: UUID | null;
  ocr_status: OcrStatus;
  ocr_text: string | null;
  created_by: UUID;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface DocumentExtraction {
  id: UUID;
  document_id: UUID;
  child_id: UUID;
  field_name: string;
  extracted_value: string;
  confidence: Confidence;
  verified: boolean;
  verified_value: string | null;
  created_at: ISODateTime;
}

export type ReminderType = 'dose' | 'missed_dose' | 'appointment' | 'laboratory' | 'measurement' | 'stock' | 'custom';

export interface Reminder {
  id: UUID;
  child_id: UUID;
  type: ReminderType;
  title: string;
  description: string | null;
  scheduled_for: ISODateTime;
  recurrence_rule: string | null;
  related_entity_type: string | null;
  related_entity_id: UUID | null;
  enabled: boolean;
  created_by: UUID;
  created_at: ISODateTime;
}

export interface NotificationPreferences {
  id: UUID;
  user_id: UUID;
  dose_enabled: boolean;
  missed_dose_enabled: boolean;
  missed_dose_after_minutes: number;
  appointment_enabled: boolean;
  laboratory_enabled: boolean;
  measurement_enabled: boolean;
  stock_enabled: boolean;
  custom_enabled: boolean;
  push_enabled: boolean;
  quiet_hours_start: string | null; // HH:mm
  quiet_hours_end: string | null;
}

export type AuditAction = 'insert' | 'update' | 'delete' | string;

export interface AuditLog {
  id: UUID;
  family_id: UUID;
  child_id: UUID | null;
  user_id: UUID | null;
  entity_type: string;
  entity_id: UUID;
  action: AuditAction;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: ISODateTime;
}

/** Every table name the client is allowed to talk to. */
export type TableName =
  | 'profiles'
  | 'families'
  | 'family_members'
  | 'family_invitations'
  | 'children'
  | 'medications'
  | 'therapy_changes'
  | 'medication_stock'
  | 'injections'
  | 'growth_measurements'
  | 'doctors'
  | 'doctor_visits'
  | 'lab_tests'
  | 'lab_results'
  | 'documents'
  | 'document_extractions'
  | 'reminders'
  | 'notification_preferences'
  | 'audit_logs';
