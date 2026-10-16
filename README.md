# GrowthCare

Privatna porodična PWA aplikacija za praćenje terapije hormonom rasta, rasta deteta, kontrola, laboratorije, dokumenata i podsetnika. Više dece, više roditelja u istoj porodici.

> GrowthCare **beleži i organizuje** ono što je lekar propisao. Ne daje medicinske savete, ne preporučuje i ne menja doze, i ne tumači laboratorijske vrednosti.

## Struktura

```
doc/        specifikacija (01–08), E2E plan (09), bezbednosna checklista (10)
design/     dizajn table
app/        Angular 19 PWA (standalone, signals, reactive forms)
supabase/   migracije (šema, RLS, storage), RLS test, Edge Functions
scan/       lični medicinski dokumenti — NIJE u gitu (.gitignore)
```

## Brzi start

```bash
cd app
npm install
npm start                 # demo režim na http://localhost:4300 — bez servera
```

**Demo režim** (`environment.development.ts`, `backend: 'local'`) čuva sve u IndexedDB na uređaju i učitava izmišljenu porodicu iz dizajna (Luka, Ana, Marko). Na ekranu za prijavu su tri demo naloga (Roditelj A, Roditelj B i nepovezana porodica za proveru izolacije). Lozinka svih demo naloga je u `app/src/app/core/data/local/demo-seed.ts`.

Rad sa pravim Supabase projektom:

```bash
npm run start:supabase    # koristi environment.supabase.ts
```

Produkcioni build (`npm run build`) koristi `environment.ts` (Supabase).

Testovi:

```bash
npm run test:ci           # 48 unit/integracionih testova u ChromeHeadless
```

## Supabase

Projekat: `gdqgskrlmxczrjppfoko` (već podešen: migracije 001–004, RLS, privatni bucket `medical-documents`, Site URL `http://localhost:4300`, min. lozinka 8).

Novi projekat:

1. Pokrenite migracije redom iz `supabase/migrations/` (SQL editor ili `supabase db push`).
2. Pokrenite `supabase/tests/rls_isolation_test.sql` — mora da vrati `ALL RLS TESTS PASSED` (sve se vraća `ROLLBACK`-om).
3. Authentication → URL Configuration: Site URL i redirect URL-ovi aplikacije.
4. U `app/src/environments/` upišite **samo** Project URL i `anon` ključ. `service_role` ključ nikada ne ide u frontend.
5. (Opciono) Edge Functions: `supabase functions deploy ocr-extract send-reminders`, tajne iz `supabase/.env.example`.

## Arhitektura

- **`DataBackend` port** (`core/data/data-backend.ts`) sa dva adaptera: `SupabaseBackend` (produkcija; autorizacija je u Postgres RLS) i `LocalBackend` (demo; emulira RLS, audit triggere i unique ograničenja). Feature servisi ne znaju koji je aktivan.
- **`DataService`** — jedini prolaz ka podacima: keš za čitanje van mreže (IndexedDB), outbox za upise.
- **Offline**: `OfflineSyncService` čuva upise u IndexedDB, šalje ih redom po povratku veze. Upisi su idempotentni (UUID sa klijenta + `upsert … ignoreDuplicates`), a `unique (medication_id, scheduled_for)` sprečava duplu dozu čak i kad dva roditelja upišu istu dozu — konflikt se prikazuje, ne prepisuje se.
- **Izabrano dete** je samo UI stanje (`ChildService`); `childData()` briše podatke prethodnog deteta odmah pri promeni, a sheet za dozu se zatvara ako se dete promeni.
- **OCR**: `OcrProvider` interfejs (Tesseract na uređaju / Edge Function / mock) + `MedicalTextExtractor` (pravila prilagođena srpskim nalazima). Tok: Upload → OCR → kandidati (`document_extractions`, `verified=false`) → **provera roditelja** → tek tada laboratorija/merenje/kontrola. Terapija se nikad ne menja iz OCR-a — samo kroz eksplicitnu „Promenu doze” uz potvrdu.
- **Obaveštenja**: centar obaveštenja u aplikaciji (iz živih podataka), lokalna obaveštenja dok je aplikacija otvorena, Web Push preko `send-reminders` (opciono).
- **Audit**: DB triggeri beleže insert/update/delete sa starim i novim vrednostima (doze, terapija, merenja, dokumenti, OCR potvrde, članstvo).

## Lokalno keširani podaci (IndexedDB)

| Baza | Sadržaj | Brisanje |
|---|---|---|
| `growthcare-cache/queries` | poslednji rezultati upita (za prikaz van mreže) | pri odjavi |
| `growthcare-cache/outbox` | nesinhronizovani upisi | pri odjavi (uz upozorenje) |
| `growthcare-demo` | samo u demo režimu: ceo demo „server” | „Vrati demo podatke” |

Originalni dokumenti se **ne** keširaju lokalno u Supabase režimu; otvaraju se 5-minutnim potpisanim URL-om. `localStorage` sadrži samo ID-jeve (izabrana porodica/dete, pročitana obaveštenja).

## Poznata ograničenja (sledeći koraci)

- OCR na uređaju podržava slike (JPG/PNG); PDF i HEIC (van Safarija) idu na ručni unos ili serverski OCR.
- Web Push zahteva VAPID ključeve i zakazivanje `send-reminders` funkcije.
- ZIP izvoz dokumenata i brisanje naloga sa servera (zahteva admin funkciju) još nisu implementirani; JSON izvoz postoji.
- Ilustracije su isečene iz dizajn table u niskoj rezoluciji — za produkciju izvesti originalne assete.
