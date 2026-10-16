# GrowthCare — UX/UI Design System

## Design direction

The product should feel:
- calm
- trustworthy
- warm
- modern
- medical without feeling like a hospital system
- optimized for parents using one hand on a phone

Avoid:
- aggressive red medical dashboards
- excessive clinical terminology
- dense tables on mobile
- dark, intimidating visuals
- unnecessary animations

## Visual language

Suggested palette:

Primary:
- Deep blue #315C8A
- Soft blue #EAF3FA

Success:
- Green #3D8B68
- Soft green #EAF6F0

Warning:
- Amber #D99A2B
- Soft amber #FFF5DE

Danger:
- Red #C95B5B
- Soft red #FCECEC

Neutral:
- Background #F7F9FB
- Card #FFFFFF
- Text #1F2937
- Secondary text #6B7280
- Border #E5E7EB

Use color as a status aid, never as the only status indicator.

## Typography

Use a modern system-friendly sans-serif:
- Inter if bundled/available
- otherwise system UI stack

H1: 28–32px
H2: 22–24px
H3: 18–20px
Body: 15–16px
Caption: 12–14px

## Navigation

Mobile:
Bottom navigation:
1. Home
2. History
3. Growth
4. Calendar
5. More

Child selector remains globally accessible.

Desktop/tablet:
Left sidebar + content area.

## Main screens

### 1. Login
Minimal:
- email
- password
- sign in
- create account
- forgot password

### 2. Family setup
- Family name
- Add child
- Invite partner

### 3. Dashboard
Large “Today’s dose” card is the visual focal point.

Example:

TODAY

Hormon rasta
0.8 mg
Scheduled 21:30

[ DATO ]

Then:
Next appointment
Latest growth
Current therapy
Recent timeline

### 4. Dose confirmation modal

Title:
“Evidentiraj dozu”

Fields:
- dose
- time
- injection site
- parent
- note

Primary CTA:
“Potvrdi da je dato”

Secondary:
“Nije dato”

### 5. Growth screen

Top:
- current height
- change since previous measurement
- last measurement date

Large chart.

Tabs:
- Height
- Weight
- Other

CTA:
“+ Novo merenje”

### 6. Therapy

Current medication card:
- medication
- dose
- frequency
- start date
- next scheduled dose

Below:
dose history and changes.

### 7. Doctor visits

Cards with:
- specialty
- doctor
- date
- countdown

CTA:
“+ Nova kontrola”

### 8. Documents

Folder/card layout:
- Reports
- Labs
- Prescriptions
- Other

Floating/action button:
“Dodaj dokument”

After upload:
Preview → OCR → Review → Save.

### 9. OCR review

Split concept:
Original image/PDF preview on top or left.

Extracted fields below:
- document date
- doctor
- diagnosis text (stored as source text only if user chooses)
- therapy
- dose
- lab values

Every extracted field should have a confidence indicator and editable input.

CTA:
“Potvrdi podatke”

### 10. Calendar

Month/week/list modes.

Tap event → details.

### 11. Child profile

- name
- date of birth
- sex
- photo/avatar optional
- therapy status
- latest height
- latest weight
- next control

### 12. Settings

- Account
- Family
- Children
- Notifications
- Security
- Data export
- Delete account/data

## Components

Create reusable Angular components:
- AppShell
- ChildSwitcher
- StatusBadge
- DoseCard
- DoseButton
- Timeline
- TimelineItem
- MetricCard
- GrowthChart
- AppointmentCard
- DocumentCard
- DocumentViewer
- OCRReviewForm
- LabResultCard
- ReminderCard
- EmptyState
- LoadingSkeleton
- ErrorState
- ConfirmDialog
- BottomNavigation

## Interaction principles

- Primary actions should be reachable with one thumb.
- Never make a parent navigate through more than three screens to record a dose.
- Destructive actions require confirmation.
- Medical data edits should display what changed.
- Use optimistic UI only when failure can be safely reconciled.
- Preserve unsaved forms.

## Accessibility

Target WCAG 2.2 AA principles:
- keyboard navigation
- screen-reader labels
- adequate contrast
- focus states
- large touch targets
- no status conveyed by color alone
- reduced-motion support
