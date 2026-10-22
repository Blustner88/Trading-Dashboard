# Fremdbibliotheken (lokal, feste Version)

Werden bewusst nicht von einem CDN geladen (Schutz vor manipulierten Fremdquellen,
strenge Content-Security-Policy).

| Datei | Paket | Version | Erstellt |
|---|---|---|---|
| supabase-js-2.118.0.js | @supabase/supabase-js | 2.118.0 | 22.10.2026, esbuild 0.24.2, ESM-Bundle, minifiziert |

Aktualisieren: Paket in einem leeren Ordner installieren, mit
`esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2020 --minify`
(entry.mjs: `export { createClient } from '@supabase/supabase-js';`) neu bauen,
Datei mit neuer Versionsnummer als .js ablegen (nicht .mjs – manche Server liefern .mjs mit falschem Typ) und den Import in accounts.js anpassen.
