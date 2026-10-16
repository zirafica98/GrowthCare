# GrowthCare — Screens and User Flows

## Flow A — First setup

Login
→ Create family
→ Add first child
→ Enter date of birth
→ Add therapy
→ Configure daily schedule
→ Invite partner
→ Notification permission
→ Dashboard

## Flow B — Daily dose

Dashboard
→ Today's dose card
→ Give dose
→ Confirm prefilled dose/time
→ Optional injection site/note
→ Save
→ Success

Target: under 10 seconds.

## Flow C — Missed/skipped dose

Dashboard
→ Today's dose
→ Not given
→ Select reason
→ Save

The app does not provide instructions about what to do medically after a missed dose.

## Flow D — New growth measurement

Growth
→ Add measurement
→ Date/time
→ Height
→ Weight
→ optional head circumference
→ Save
→ chart updates

## Flow E — Doctor appointment

Calendar
→ Add appointment
→ child
→ doctor
→ date/time
→ reason
→ reminders
→ save

## Flow F — Upload medical document

Documents
→ Add
→ Camera/Gallery/File
→ Upload
→ OCR processing
→ Review extracted information
→ Confirm
→ Document saved

If OCR fails:
Show original document and allow manual metadata entry.

## Flow G — Laboratory document

Documents
→ Upload lab report
→ OCR
→ detected test results
→ review each result
→ confirm
→ create lab event
→ results available in Laboratory

## Flow H — Dose change

Therapy
→ Change recorded dose
→ enter new dose
→ date
→ optional doctor visit
→ optional source document
→ confirm

Display:
“Recorded dose changed from X to Y.”

No recommendation is generated.

## Flow I — Partner invitation

Family
→ Invite parent
→ enter email
→ send invitation
→ pending
→ partner accepts
→ partner joins family

## Flow J — Multiple children

Global child switcher:
Child A
Child B
Child C

Every dashboard/module must clearly display the selected child.

Avoid cross-child mistakes by showing the child's name/photo on critical screens.

## Critical UX safeguards

Before recording a dose:
- Show child name
- Show medication
- Show dose
- Show scheduled time

Before editing therapy:
- Show previous value
- Show new value
- Ask confirmation

Before deleting:
- confirmation dialog
- explain what is deleted
- require explicit action

Before saving OCR:
- review screen
- no silent extraction-to-record flow
