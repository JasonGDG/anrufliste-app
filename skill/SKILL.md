---
name: anrufliste
description: Recherchiert Firmen für Kaltakquise am Telefon und baut daraus eine Excel-Anrufliste (Prio, Stufe A/B/C, Entscheider mit Durchwahl, Mitarbeiterzahl mit Quellen, Kaufsignal, Statusspalte). Verwenden bei /anrufliste, „mach mir eine Anrufliste“, „such mir Firmen zum Anrufen“, „Leads für …“, „noch so eine Liste“.
---

# Anrufliste

Du orchestrierst. Die Recherche machen 3 bis 4 parallele Unteragenten, das Excel baut `build.py` (liegt neben dieser Datei). Alle Listen landen im Repo unter `Anruflisten/`, damit keine Firma zweimal geliefert wird. `build.py` liest dabei auch die Listen auf allen anderen Branches mit. `<skill-ordner>` ist `.claude/skills/anrufliste`.

## 1. Auftrag klären
Aus der Anfrage ablesen, nur Fehlendes kurz nachfragen (eine Nachricht, höchstens 3 Fragen):
- **Angebot:** Was verkauft der Nutzer? (Steht es in einer früheren `Anruflisten/*/auftrag.json`, nicht neu fragen, sondern übernehmen.)
- **Zielkunden:** Branche, Größe (Mitarbeiter), Art der Firma.
- **Region** und **Anzahl** (Standard 40).

Dann selbst festlegen (nicht fragen, in der Antwort kurz nennen):
- **Kaufsignal**: woran man erkennt, dass die Firma *jetzt* Bedarf hat, abgeleitet aus dem Angebot. Personaldienstleister → offene Stellen (welche, wie viele, seit wann); Software → Stellenanzeigen für die Aufgabe, Wachstum; Handwerk/Bau → neue Standorte, Bauprojekte. Name der Spalte (`signal_name`), z. B. „Offene Stellen“.
- **Verbund/Gruppe** (`verbund_name`, `verbund_definition`): wozu die Firmen in dieser Branche typischerweise gehören. Baustoffhandel → „Verbund“ (Eurobaustoff, hagebau …); Autohäuser → „Marke/Gruppe“; Pflege → „Träger“. Sonst „Gruppe“.
- **Anbieter schon da?** (`konkurrenz_name`, `konkurrenz_definition`): Hat die Firma schon, was der Nutzer verkauft? Personaldienstleister → „Zeitarbeit im Einsatz?“ (Belege: Stellen der Firma bei Zeitarbeitsfirmen ausgeschrieben, „über unseren Partner XY“); Telefon-KI → „Voicebot“ (Anbieter in Datenschutzerklärung). Rot markiert in der Liste.
- **Zusatzspalten** (4 bis 6), die für Branche und Angebot beim Anruf helfen, wie in einer guten Vertriebsliste. Beispiel Baustoffhandel: Standorte, Sortiment, Baumarkt ja/nein, Onlineshop, Fuhrpark. Beispiel Logistik für Personaldienstleister: Standorte, Leistungen (Lager/Transport/Kontrakt), Schichtbetrieb, Lagerfläche, Fuhrpark, Saisonspitzen.
- **Gesprächsleitfaden** (`leitfaden`) für genau dieses Angebot und diese Zielgruppe: 5 bis 6 Blöcke mit je 2 bis 4 kurzen Sätzen: Ziel des Anrufs, Wen ansprechen (Rolle, beste Uhrzeit), Einstieg (mit Bezug auf Kaufsignal/Gesprächshinweis), Bedarf erfragen (2 bis 3 Fragen), Einwände (die 3 häufigsten mit Antwort), Abschluss (konkreter nächster Schritt). Kein Fülltext.
- **Teilgebiete**: Region in 3 bis 4 etwa gleich ergiebige Teile schneiden (nach Landkreisen/Städten), Anzahl gleichmäßig verteilen.

## 2. Ordner anlegen
```
python3 <skill-ordner>/build.py neu "<kurzer Titel, z. B. Branche Region>"
```
Gibt den Ordner aus. Darin `auftrag.json` schreiben:
```json
{"titel": "…", "datum": "JJJJ-MM-TT", "angebot": "…", "zielprofil": "…", "region": "…",
 "min_mitarbeiter": 20, "signal_name": "…", "signal_definition": "…",
 "verbund_name": "…", "verbund_definition": "…",
 "konkurrenz_name": "…", "konkurrenz_definition": "…",
 "extra_spalten": [["standorte", "Standorte", 20], ["schluessel", "Spaltenname", 18]],
 "leitfaden": [["Ziel des Anrufs", ["…", "…"]], ["Wen ansprechen", ["…"]], ["Einstieg", ["…"]],
               ["Bedarf erfragen", ["…"]], ["Einwände", ["„Einwand“ → Antwort"]], ["Abschluss", ["…"]]],
 "teilgebiete": ["…", "…", "…"]}
```
(`min_mitarbeiter` weglassen, wenn es keine Untergrenze gibt.) Dann:
```
python3 <skill-ordner>/build.py ausschluss <ordner>
```

## 3. Recherche parallel starten
`recherche-auftrag.md` lesen und je Teilgebiet einen Unteragenten starten, **alle in einer Nachricht**, `subagent_type: "general-purpose"`, `model: "sonnet"`, im Hintergrund. Prompt = der komplette Text von `recherche-auftrag.md` mit ersetzten Platzhaltern ({ANGEBOT}, {ZIELPROFIL}, {TEILGEBIET}, {ANZAHL}, {MINIMUM} ≈ 80 %, {SIGNAL_NAME}, {SIGNAL_DEFINITION}, {VERBUND_NAME}, {VERBUND_DEFINITION}, {KONKURRENZ_NAME}, {KONKURRENZ_DEFINITION}, {EXTRA_FELDER} = Schlüssel mit Bedeutung, {ORDNER}, {DATEI} = `teil1`, `teil2` …, {AUSSCHLUSS_EXTRA} = Wünsche des Nutzers, sonst leer).
Dem Nutzer in einem Satz sagen, was läuft und wie lange es etwa dauert (10 bis 25 Minuten).

## 4. Prüfen und bauen
Wenn alle Agenten fertig sind:
- Firmen streichen, die klar nicht passen (der Agent hat sie selbst als zu groß, zu klein oder falsche Branche markiert): den Eintrag aus der JSON-Datei löschen.
- `python3 <skill-ordner>/build.py excel <ordner>` ausführen. Meldungen „Dublette“ / „schon früher geliefert“ sind normal.
- Ein Teilgebiet deutlich unter Soll? Einmal nachlegen lassen (SendMessage an denselben Agenten), sonst ehrlich melden.

## 5. Speichern und hochladen
Den kompletten Auftragsordner (auftrag.json, data/, Excel) committen und pushen, auf den Branch dieser Sitzung („Anrufliste <Titel>“). Nur so kann der Nutzer die Datei herunterladen, und nur so kennt die nächste Liste diese Firmen. Den GitHub-Link zur Excel-Datei ermitteln (`git remote get-url origin` + Branch + Pfad, Form `https://github.com/<owner>/<repo>/blob/<branch>/<pfad>`) und in der Antwort nennen. Hinweis an den Nutzer: dort oben rechts auf „Download raw file“ klicken.

## 6. Antwort an den Nutzer
Kurz und einfach, ohne Fachjargon:
- Der GitHub-Link zur Excel-Datei aus Schritt 5.
- Anzahl Firmen, Verteilung auf die Teilgebiete, Stufe A/B/C, wie viele mit starkem Kaufsignal.
- Die 3 bis 5 besten Firmen zum Starten (Prio 1 bis 5) mit je einem Halbsatz warum.
- Auffälligkeiten (Übernahmen, Grenzfälle, Gebiet ausgeschöpft) als kurze Stichpunkte.

## Regeln
- Nichts erfinden. Nummern, Namen, Stellen nur mit Quelle.
- Niemanden kontaktieren, keine Formulare absenden.
- Alte Listen, die nicht von diesem Skill stammen, kann der Nutzer als .xlsx (mit Spalte „Website“) oder .txt (eine Domain pro Zeile) auf dem Hauptbranch in `Anruflisten/alt/` hochladen; sie werden dann ausgeschlossen.
