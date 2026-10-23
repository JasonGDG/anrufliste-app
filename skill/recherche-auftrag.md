# Recherche-Auftrag Anrufliste

Ziel: echte, anrufbare Firmen für Kaltakquise am Telefon. Nur nachprüfbare Fakten von Websites, Registern und Verzeichnissen, nichts erfinden. Nicht auffindbar: "–".

## Auftrag (vom Orchestrator ausgefüllt)
- Wir verkaufen: {ANGEBOT}
- Zielkunden: {ZIELPROFIL}
- Dein Gebiet: {TEILGEBIET}
- Anzahl: {ANZAHL} Firmen (Minimum {MINIMUM})
- Kaufsignal ({SIGNAL_NAME}): {SIGNAL_DEFINITION}
- {VERBUND_NAME}: {VERBUND_DEFINITION}
- {KONKURRENZ_NAME}: {KONKURRENZ_DEFINITION}
- Zusatzfelder in "extra" (genau diese Schlüssel): {EXTRA_FELDER}
- Ausschluss: alle Domains in {ORDNER}/ausschluss_domains.txt (schon früher geliefert) NICHT aufnehmen. Außerdem nicht: Konzernfilialen ohne Entscheider vor Ort, Firmen ohne eigene Website, Firmen außerhalb deines Gebiets. {AUSSCHLUSS_EXTRA}
- Ausgabe: {ORDNER}/data/{DATEI}.json

## Pro Firma prüfen
Website: Startseite, Impressum, Kontakt, Team/Ansprechpartner, Karriere/Jobs, Datenschutz. Dazu Jobbörsen (Stepstone, Indeed, Arbeitsagentur), LinkedIn, Presse, North Data (frei sichtbarer Teil).

1. firma (vollständiger Name laut Impressum), ort, kreis (Landkreis/kreisfreie Stadt), bundesland (Kürzel wie NI, NW, BY …; im Ausland Landeskürzel)
2. ansprechpartner + rolle: Entscheider für unser Angebot. Inhaber/GF, zusätzlich die fachlich passende Leitung (z. B. Personal, Einkauf, Vertrieb, Werksleitung), wenn genannt. Mehrere mit "; " trennen.
3. tel_ansprechpartner: eigene Durchwahl/Mobilnummer dieser Personen, NUR wenn öffentlich. Format "Name 0541 12345-15; …". Sonst "–".
4. tel_zentrale im Format "0541 12345-0"; email: allgemeine oder persönliche Adresse laut Website, sonst "–"
5. website (URL)
6. mitarbeiter: Bestschätzung; mitarbeiter_sicher: hoch (eigene Angabe oder mehrere Quellen stimmen) / mittel (eine plausible Quelle) / niedrig (geschätzt) / "–"; quellen: Liste "Beschreibung: Befund (URL)"; widerspruch: Hinweis bei widersprüchlichen Quellen, sonst "–"
7. erreichbarkeit: telefonisch eingeschränkt (Telefonzeiten, Mittagspause, Freitag früh zu, „bitte per Mail“)? Dann "eingeschränkt: <wörtliches Zitat>". Sonst "normal: <Öffnungs-/Bürozeiten kurz>". Nicht gefunden: "–".
8. kaufsignal: konkreter Befund mit Datum und Quelle, z. B. "sucht 3 Lageristen + 1 Disponent (Stepstone, 10/2026)". signal_staerke: hoch / mittel / niedrig / "–" (nichts gefunden). Nur belegte Signale.
9. verbund: Verbund, Kooperation, Franchise oder Gruppe laut Website/Verbandsseite (z. B. "Eurobaustoff (i&M)", "Teil der XY-Gruppe"), sonst "–".
10. konkurrenz: "ja: <Anbieter + Beleg>" nur wenn belegt (siehe Auftrag), "nein: <Beleg>" wenn das Gegenteil belegt ist, sonst "k. A.".
11. eignung: "hoch" / "mittel" / "niedrig" + kurze Begründung. Hoch = inhaber-/eigentümergeführt oder Entscheider vor Ort namentlich bekannt, passende Größe, Kaufsignal vorhanden, noch kein Anbieter.
12. extra: Objekt mit genau den oben genannten Zusatzfeldern ("–" wenn unbekannt), kurz und konkret (z. B. "3 (Osnabrück, Melle, Bramsche)").
13. notiz: 1 Satz, der beim Anruf hilft (Aufhänger, z. B. "neuer Standort seit 09/2026", "GF sucht selbst per LinkedIn Fahrer").

## Ausgabe
JSON-Datei (UTF-8, Liste von Objekten), Felder exakt:
{"firma","ort","kreis","bundesland","verbund","ansprechpartner","rolle","tel_ansprechpartner","tel_zentrale","email","website","mitarbeiter","mitarbeiter_sicher","quellen":[...],"widerspruch","erreichbarkeit","kaufsignal","signal_staerke","konkurrenz","eignung","extra":{...},"notiz"}
Nach je ~5 Firmen speichern (Datei komplett neu schreiben, gültiges JSON). Am Ende kurze Rückmeldung: Anzahl, wie viele Eignung hoch, wie viele mit starkem Signal, wie viele mit Durchwahl, Auffälligkeiten, bewusst aussortierte Firmen.

## Werkzeuge
WebSearch und WebFetch; wenn eine Seite blockt, curl --compressed -L -A "Mozilla/5.0" <url>. Wenn vorhanden auch Exa (mcp__exa__*). Keine Formulare absenden, niemanden kontaktieren.
