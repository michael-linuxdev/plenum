// Läuft in der GitHub Action: holt die Abstimmungsdaten und schreibt data/bundestag.json.
// Lokal: node scripts/daten-holen.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { datenBauen, API } from '../daten.mjs';

async function holen(pfad, versuch = 1) {
  const r = await fetch(API + pfad, { headers: { 'User-Agent': 'plenum.micana.de (Datenabruf einmal pro Nacht)' } });
  if (r.status === 429 && versuch <= 3) {
    console.log('429 – warte 65 s');
    await new Promise(res => setTimeout(res, 65000));
    return holen(pfad, versuch + 1);
  }
  if (!r.ok) throw new Error(pfad + ' -> HTTP ' + r.status);
  const j = await r.json();
  if (j?.meta?.status && j.meta.status !== 'ok') throw new Error(pfad + ' -> ' + j.meta.status_message);
  return j;
}

const daten = await datenBauen(holen, { fortschritt: t => console.log(t) });
if (!daten.mps.length || !daten.abstimmungen.length) throw new Error('Leere Daten – Datei wird nicht überschrieben');
await mkdir('data', { recursive: true });
await writeFile('data/bundestag.json', JSON.stringify(daten));
console.log(`OK: ${daten.periode.label}, ${daten.mps.length} Mandate, ${daten.abstimmungen.length} Abstimmungen`);
