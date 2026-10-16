# GrowthCare — Product Specification

## 1. Product vision

GrowthCare is a private family PWA for tracking a child's growth-hormone therapy and the surrounding medical history.

The application is a tracking and organization tool, not a medical decision engine. It records what parents and clinicians have already prescribed or documented. It must never recommend, calculate, or change a medically appropriate dose.

The app supports multiple children and multiple parent accounts in one family. Each parent has an individual account and can access the children shared with that family.

## 2. Primary goals

- Never forget a scheduled dose.
- Quickly record whether a dose was administered.
- Maintain a complete chronological medical timeline.
- Track height, weight and other growth measurements.
- Visualize growth over time.
- Track therapy and dose changes.
- Track doctor appointments and laboratory tests.
- Store medical documents securely.
- Upload a photo/PDF and extract useful structured information with OCR/AI.
- Provide reminders and notifications.
- Allow both parents to access the same data from their phones.
- Make the app extremely fast for the common action: “Did we give today's injection?”

## 3. Users

### Family owner
Creates the family and invites another parent.

### Parent/member
Can view and edit all permitted child records.

### Child
A profile within the family. A family can have multiple children.

Future roles can include read-only caregiver or clinician, but these are not required for v1.

## 4. Core modules

1. Dashboard
2. Daily dose tracking
3. Injection history
4. Therapy / medication
5. Growth tracking
6. Doctor visits
7. Laboratory results
8. Documents
9. Calendar
10. Reminders / notifications
11. Family / children
12. Settings
13. Audit/history

## 5. Medical safety principle

The app stores prescribed information but does not provide medical advice.

Examples:
- It may display: “Current recorded dose: 0.8 mg.”
- It may display: “Dose changed on 12 Oct from 0.7 mg to 0.8 mg.”
- It must NOT say: “The child should receive 0.9 mg.”
- It must NOT automatically alter a dose based on height, weight, IGF-1 or any other value.

All dose changes must be explicitly entered by a parent and preferably linked to a doctor visit/document.

## 6. Dashboard

The dashboard should answer, in under five seconds:

- Was today's dose given?
- What is the next reminder?
- When is the next doctor appointment?
- When is the next lab test?
- What is the latest height/weight?
- What is the current recorded therapy?
- Are there important unresolved items?

Suggested layout:

TOP
- Child selector
- Family/account avatar

TODAY
- Today's dose card
- Large “Given” / “Not yet given” state
- Time
- Dose
- Quick action button

UPCOMING
- Next doctor visit
- Next lab
- Next reminder

GROWTH
- Current height
- Current weight
- Growth trend mini-chart

THERAPY
- Current medication
- Current recorded dose
- Last change

RECENT
- Timeline of latest events

## 7. Daily dose

The primary interaction must be one or two taps.

Dose card:
- Medication
- Scheduled time
- Scheduled dose
- Status: pending / given / skipped / missed
- Actual time
- Given by
- Optional injection site
- Optional note

Quick flow:
1. Tap “Give dose”.
2. Confirm pre-filled dose/time.
3. Save.
4. Show success state.

If dose was not given:
- “Skip / not given”
- Required reason
- Optional note

Reasons should be configurable, e.g.:
- Forgot
- Child unavailable
- Sick
- Doctor instruction
- Other

Never infer that a missed dose should be made up. Do not give medical instructions.

## 8. Injection history

Timeline/table with filters:
- Child
- Date range
- Medication
- Status
- Parent
- Injection site

Each record can be edited with an audit trail.

Automatic calculations:
- doses given per week
- doses missed per week
- adherence percentage
- total recorded dose over selected period

These are descriptive statistics only.

## 9. Growth

Track:
- Height
- Weight
- BMI as an optional calculated value
- Head circumference, optional
- Date/time
- Measurement source
- Note

Display:
- Height chart
- Weight chart
- Growth velocity between measurements
- Table of all measurements

The app may calculate descriptive growth velocity from recorded measurements, but must not diagnose or interpret growth clinically.

Child profile must store:
- date of birth
- sex, if parents choose to enter it
- optional birth measurements

## 10. Therapy

Medication record:
- Medication name
- Active/inactive
- Start date
- End date
- Concentration/strength
- Current recorded dose
- Unit
- Scheduled frequency
- Scheduled time
- Prescribing clinician
- Notes

Dose change:
- Previous recorded dose
- New recorded dose
- Date
- Source
- Reason/note
- Linked document
- Linked doctor visit

## 11. Medication stock

Optional stock tracking:
- Package name
- Strength
- Quantity
- Date opened
- Estimated remaining amount
- Purchase/refill date
- Expiration date
- Reminder threshold

The app may calculate an estimated remaining amount from manually entered usage, but must clearly label it as an estimate.

## 12. Doctor visits

Each appointment:
- Doctor
- Specialty
- Clinic
- Date/time
- Reason
- Status
- Notes
- Attachments
- Follow-up date
- Tasks

Reminder presets:
- 7 days before
- 1 day before
- day of appointment

Also allow custom reminders.

## 13. Laboratory

Each lab event:
- Date
- Laboratory
- Document/photo
- Structured results
- Notes

Result:
- Test name
- Result value
- Unit
- Reference range
- Flag as displayed on source
- Optional clinician note

The system must preserve the original document even after OCR.

OCR/AI extraction must be reviewable before saving.

## 14. Documents

Categories:
- Doctor reports
- Laboratory
- Prescriptions
- Referrals
- Imaging
- Therapy documentation
- Other

Supported:
- PDF
- JPG/JPEG
- PNG
- HEIC where browser support permits

Features:
- camera upload
- gallery upload
- file upload
- preview
- OCR
- metadata extraction
- tagging
- date
- category
- related child
- related visit
- related medication
- download
- delete

## 15. OCR / AI extraction

When a user uploads a medical document:
1. Store the original securely.
2. Create a processing job.
3. OCR the image/PDF.
4. Extract candidate fields.
5. Present extracted values in a review screen.
6. Parent confirms/corrects.
7. Only confirmed values become structured medical data.

Never silently write OCR results into the medical record.

The UI must clearly state:
“Extracted automatically — please verify before saving.”

## 16. Calendar

Calendar combines:
- doses
- doctor appointments
- laboratory
- measurements
- custom reminders
- therapy changes

Color/status should distinguish event types.

## 17. Notifications

Support:
- daily dose reminder
- missed-dose reminder
- doctor appointment reminder
- laboratory reminder
- measurement reminder
- medication stock reminder
- custom reminder

Push notifications are optional and permission-based.

Also provide an in-app notification center.

## 18. Family

Family screen:
- Family name
- Parents
- Children
- Invitations
- Access status

Parent invitation:
- email/link
- pending/accepted/revoked

All family members should only see records belonging to their family.

## 19. Search

Global search across:
- documents
- visits
- labs
- therapy changes
- timeline events

Example:
“IGF”
“endokrinolog”
“0.8 mg”
“October 2026”

## 20. Timeline

Unified chronological timeline:
- injection
- skipped dose
- measurement
- doctor visit
- lab
- document
- therapy change
- reminder
- note

Filter by event type.

## 21. Empty/error states

Every screen needs:
- empty state
- loading state
- offline state
- failed upload state
- OCR failed state
- permission denied state

Because this is a PWA, the user should be able to view previously loaded information offline. Writes should be queued safely and synchronized when connectivity returns.

## 22. V1 non-goals

Do not build:
- medical diagnosis
- dose recommendations
- automatic treatment recommendations
- clinical decision support
- automatic interpretation of lab values
- public social features
- advertising
