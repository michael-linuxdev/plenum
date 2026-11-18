# Plenum – Abstimmungs-Zwilling und Fantasy-Bundestag (PWA)

Prototyp mit echten namentlichen Abstimmungen des aktuellen Bundestags.
Live unter **https://plenum.micana.de**

## Funktionen
- **Abstimmen:** Abstimmungen als Kartenstapel – rechts wischen = Dafür, links = Dagegen, oben = Enthalten. Danach das echte Ergebnis samt Fraktionen.
- **Zwilling:** Ab 5 Antworten zeigt Plenum, welche Abgeordneten tatsächlich so gestimmt haben wie du, dazu die Nähe zu den Fraktionen und eine Suche nach Wahlkreis.
- **Team (Fantasy-Bundestag):** 5 Abgeordnete aufstellen, höchstens 2 pro Fraktion, ein Kapitän zählt doppelt. Punkte: +2 Teilnahme, +3 „Eigener Kopf“ (anders als die eigene Fraktionsmehrheit), +1 „Wie du“. Team per Link teilen.
- Installierbar, offline nutzbar, „Jetzt aktualisieren“ bei neuen Versionen. Antworten und Team bleiben im Browser.

## Daten
- Quelle: [abgeordnetenwatch.de API](https://www.abgeordnetenwatch.de/api), Lizenz CC0 1.0. Fair-Use: höchstens 30 Anfragen pro Minute.
- Die GitHub Action `.github/workflows/daten.yml` holt jede Nacht alle Abstimmungen der laufenden Wahlperiode und schreibt `data/bundestag.json` (manuell: Actions → „Abstimmungsdaten holen“ → Run workflow).
- Fehlt die Datei noch, versucht die App ersatzweise einen direkten Abruf der neuesten 25 Abstimmungen im Browser.
- Lokal: `node scripts/daten-holen.mjs`

## Einrichtung (einmalig)
1. Settings → Pages: Deploy from branch `main`, Ordner `/` (root), Custom domain `plenum.micana.de`.
2. DNS: CNAME `plenum` → `michael-linuxdev.github.io`.
3. Settings → Actions → General → Workflow permissions: „Read and write permissions“.
4. Actions → „Abstimmungsdaten holen“ einmal von Hand starten.

## Hinweise
- Nach Änderungen an den App-Dateien `CACHE` in `sw.js` und `APP_VERSION` in `index.html` hochzählen.
- Nur namentliche Abstimmungen sind enthalten; die meisten Beschlüsse fallen per Handzeichen. Keine Wahlempfehlung.
