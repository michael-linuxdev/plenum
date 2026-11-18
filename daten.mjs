// Holt namentliche Abstimmungen des aktuellen Bundestags von abgeordnetenwatch.de (Daten unter CC0 1.0)
// und packt sie in ein kompaktes Format für die App.
// Wird von zwei Stellen genutzt:
//   - scripts/daten-holen.mjs (GitHub Action, nachts) schreibt data/bundestag.json
//   - index.html als Notlösung, falls data/bundestag.json noch fehlt
// Fair-Use der API: höchstens 30 Anfragen pro Minute, besser eine pro Sekunde. Daher die Pause zwischen Abrufen.

export const API = 'https://www.abgeordnetenwatch.de/api/v2/';
const BUNDESTAG = 5;

// Kompakte Stimm-Codes, ein Zeichen pro Abgeordnetem (Reihenfolge wie in "mps")
export const CODE = { yes: 'j', no: 'n', abstain: 'e', no_show: 'x' };
export const KEIN_MANDAT = '.'; // war bei dieser Abstimmung (noch/nicht mehr) nicht im Bundestag

const pause = ms => new Promise(r => setTimeout(r, ms));

export function ohneKlammer(s) {
  // "CDU/CSU (Bundestag 2025 - 2029)" -> "CDU/CSU"
  return String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function ohneHtml(html, max = 700) {
  const t = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40)) + ' …';
}

// Liste abrufen, über alle Seiten (je Seite höchstens 1000 Einträge laut API-Doku)
async function liste(holen, pfad, params, warte) {
  const alle = [];
  for (let start = 0; ; start += 1000) {
    const q = new URLSearchParams({ ...params, range_start: String(start), range_end: '1000' });
    const j = await holen(pfad + '?' + q.toString());
    await pause(warte);
    const data = Array.isArray(j?.data) ? j.data : [];
    alle.push(...data);
    const total = Number(j?.meta?.result?.total ?? data.length);
    if (data.length < 1000 || alle.length >= total) break;
  }
  return alle;
}

async function aktuelleWahlperiode(holen, warte) {
  try {
    const p = await holen('parliaments/' + BUNDESTAG);
    await pause(warte);
    const cp = p?.data?.current_project;
    if (cp?.id) return { id: Number(cp.id), label: cp.label || '' };
  } catch (e) { /* weiter mit Ersatzweg */ }
  const perioden = await liste(holen, 'parliament-periods', { parliament: String(BUNDESTAG) }, warte);
  const lp = perioden.filter(p => p.type === 'legislature').sort((a, b) => Number(b.id) - Number(a.id))[0];
  if (!lp) throw new Error('Keine Wahlperiode des Bundestags gefunden');
  return { id: Number(lp.id), label: lp.label || '' };
}

function fraktionVon(mandat) {
  const fm = Array.isArray(mandat.fraction_membership) ? mandat.fraction_membership : [];
  // aktuelle Mitgliedschaft (ohne Enddatum) bevorzugen, sonst die letzte
  const aktiv = fm.find(f => !f.valid_until) || fm[fm.length - 1];
  return ohneKlammer(aktiv?.fraction?.label || aktiv?.label || '');
}

/**
 * holen(pfad) muss JSON der API liefern (pfad relativ zu API, z. B. "polls?...").
 * Optionen: maxAbstimmungen (neueste zuerst), warte (ms zwischen Anfragen), fortschritt(text, anteil)
 */
export async function datenBauen(holen, { maxAbstimmungen = Infinity, warte = 2100, fortschritt = () => {} } = {}) {
  fortschritt('Wahlperiode', 0);
  const periode = await aktuelleWahlperiode(holen, warte);

  fortschritt('Abgeordnete', 0.03);
  const mandate = (await liste(holen, 'candidacies-mandates', { parliament_period: String(periode.id), type: 'mandate' }, warte))
    .filter(m => !m.type || m.type === 'mandate');

  fortschritt('Abstimmungen', 0.06);
  let polls = await liste(holen, 'polls', { field_legislature: String(periode.id), sort_by: 'field_poll_date', sort_direction: 'desc' }, warte);
  polls.sort((a, b) => String(b.field_poll_date).localeCompare(String(a.field_poll_date)) || Number(b.id) - Number(a.id));
  polls = polls.slice(0, maxAbstimmungen);

  // Abgeordnete: ein Eintrag pro Mandat (Nachrücker bekommen eigene Einträge)
  const mps = mandate.map(m => {
    const ed = m.electoral_data || {};
    return {
      m: Number(m.id),
      p: Number(m.politician?.id) || null,
      n: ohneKlammer(m.politician?.label || m.label),
      f: fraktionVon(m) || 'fraktionslos',
      w: ohneKlammer(ed.constituency?.label || ''),
      l: ohneKlammer(ed.electoral_list?.label || ''),
      d: ed.mandate_won === 'constituency' ? 1 : 0,
      u: m.politician?.abgeordnetenwatch_url || '',
      ende: m.end_date || null,
    };
  });
  const index = new Map(mps.map((mp, i) => [mp.m, i]));

  const abstimmungen = [];
  for (let k = 0; k < polls.length; k++) {
    const poll = polls[k];
    fortschritt('Abstimmung ' + (k + 1) + ' von ' + polls.length, 0.08 + 0.92 * (k / Math.max(1, polls.length)));
    const votes = await liste(holen, 'votes', { poll: String(poll.id) }, warte);
    const st = new Array(mps.length).fill(KEIN_MANDAT);
    for (const v of votes) {
      const mid = Number(v.mandate?.id);
      let i = index.get(mid);
      if (i === undefined) {
        // Mandat fehlte in der Liste (z. B. Nachrücker) – nachtragen
        i = mps.length;
        mps.push({ m: mid, p: null, n: String(v.mandate?.label || v.label || '').replace(/\s*\(.*$/, '').trim(), f: ohneKlammer(v.fraction?.label) || 'fraktionslos', w: '', l: '', d: 0, u: '', ende: null });
        index.set(mid, i);
        for (const a of abstimmungen) a.s += KEIN_MANDAT;
        st.push(KEIN_MANDAT);
      }
      st[i] = CODE[v.vote] || KEIN_MANDAT;
      // Fraktion zum Zeitpunkt der Abstimmung (bei Wechsel genauer als die Mandatsliste)
      if (v.fraction?.label && !mps[i].f) mps[i].f = ohneKlammer(v.fraction.label);
    }
    abstimmungen.push({
      id: Number(poll.id),
      t: ohneKlammer(poll.label) || poll.label,
      dt: poll.field_poll_date,
      a: poll.field_accepted === true || poll.field_accepted === 1 || poll.field_accepted === '1',
      i: ohneHtml(poll.field_intro),
      th: (poll.field_topics || []).map(t => t.label).filter(Boolean).slice(0, 3),
      u: poll.abgeordnetenwatch_url || '',
      s: st.join(''),
    });
  }
  fortschritt('Fertig', 1);

  return {
    v: 1,
    erstellt: new Date().toISOString(),
    quelle: 'abgeordnetenwatch.de (CC0 1.0)',
    periode,
    mps,
    abstimmungen,
  };
}
