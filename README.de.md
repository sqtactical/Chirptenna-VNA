<p align="center"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/logo-vna-oscuro.png">
  <img src="img/logo-vna.png" alt="Chirptenna VNA" width="560">
</picture></p>

# Chirptenna VNA

[Español](README.md) · [English](README.en.md) · [Français](README.fr.md) · **Deutsch**

Web-Assistent, um **eine Antenne mit einem NanoVNA zu messen**, direkt im Browser und ohne Installation: Er sagt dir, ob sie
dort resoniert, wo du es willst, ob du sie **verlängern oder kürzen musst und um wie viel**, und liefert alle Parameter
(Smith-Diagramm, Impedanz, SWR, Phase, Gruppenlaufzeit). Er funktioniert für **jede Antenne**; entstanden ist er im Projekt
[Chirptenna](https://sqtactical.github.io/chirptenna/) (Generator für fraktale Platinenantennen) und teilt dessen Stil.

> **Status: Alpha.** Getestet mit einem Emulator der Geräte-Shell und mit echten Daten eines NanoVNA-H, **aber der Treiber
> lief noch nicht gegen ein angeschlossenes Gerät**. Bis dahin ist er als experimentell zu betrachten.

**Gleich ausprobieren: <https://sqtactical.github.io/Chirptenna-VNA/>** (Chrome oder Edge am Desktop; mit simuliertem Modus zum Testen ohne Gerät).

## Was er kann

- **Einfacher Modus**: Band wählen (Amateurfunk von MF bis SHF, europäische und amerikanische ISM) oder einen allgemeinen
  Sweep, messen und ein Urteil lesen („Verlängere die Antenne um 3,2 %“, „deckt das Band ab“, „resoniert nicht im Bereich“ …).
- **Erweiterter Modus**: Smith-Diagramm, Z, Phase, SWR, Gruppenlaufzeit, Cursor, Bandtabelle, CSV- und Touchstone-`.s1p`-Export
  sowie **PDF-Bericht** mit den Diagrammen.
- **Untersuchung eines Bands mit seitlichem Rand** (untere Kante ×(1−m), obere ×(1+m); standardmäßig 10 %) oder **allgemeiner
  Sweep** über den ganzen Bereich des Geräts (3000 Punkte, logarithmisch) mit automatischer **Verfeinerung** um Resonanzen.
- **Verzögerung vor der Messung**, damit du dich von der Antenne entfernen kannst (Countdown und Pieptöne).
- **Geführte OSL-Kalibrierung in Abschnitten**: den ganzen Bereich auf einmal oder „stückweise“ kalibrieren, anhalten und an
  einem anderen Tag weitermachen; die Sätze werden im Browser gespeichert und als JSON exportiert/importiert. Die Kalibrierung
  der App korrigiert die Rohdaten und berührt die Speicherplätze des Geräts nicht.
- **Cricky**, die Assistenten-Grille (ein Augenzwinkern Richtung Clippy): eine dezente Sprechblase, die das Wichtige
  kommentiert (Verbindung, Kalibrierung, Countdown, Ergebnis). Nur im einfachen Modus; per Klick schließbar und dauerhaft stummschaltbar.
- Schwache Resonanzen (Rauschen, Welligkeit an der Flanke einer anderen) werden nicht mit echten vermischt: Sie erscheinen
  getrennt als **„möglicherweise falsch“**.
- **Simulierter Modus mit 13 Beispielantennen** (ohne Gerät): gut zentriert, resoniert zu tief oder zu hoch, schlecht angepasst,
  schmal, unregelmäßige Kurve, KW-Sperrkreise und die zwei typischen Fehler (offenes Kabel und 50-Ω-Abschluss). Wählst du
  eine aus, wählt die App das Band, das sie am besten zeigt.
- **Mein Meshtastic-Knoten**: Region und Preset wählen; die App berechnet die echte Frequenz deines Kanals und beurteilt die Antenne dort.
- **Antennen vergleichen**: mehrere Messungen mit Namen speichern und in Tabelle und Diagramm vergleichen.
- **Amateurfunk-Werkzeuge** (erweiterter Modus): L-Anpassnetzwerk mit E24-Werten, Messung von Koaxkabel und Stubs, Kabel aus
  der Messung herausrechnen, Güte von Sperrkreisen und Resonatoren, „Live“-Modus zum Einstellen eines Tuners und Urteil pro Band für Multiband-Antennen.
- **Expertenwerkzeuge**: Vergleich mit einer Touchstone-Datei (`.s1p`/`.s2p`) oder mit der `resultado.json` einer
  Chirptenna-Simulation (schätzt die reale εr), Mitteln von Sweeps mit geschätztem Rauschen und eine Konsolen-API (`window.chirptenna`).
- **Urteil vorlesen**.
- **Regionen**: Europa (R1), Amerika (R2) und Asien-Pazifik (R3, mit ITU-Bändern, die nicht je Land geprüft sind).
- **Sprachen**: Spanisch, Englisch, Französisch und Deutsch (Auswahl in der Kopfzeile; automatisch nach dem Browser oder
  mit `?idioma=de`). Die Übersetzungen stammen von Claude und sollten von Muttersprachlern geprüft werden.

## Geräte

| Gerät | Status |
|---|---|
| NanoVNA-H / H4 mit **DiSlord**-Firmware 1.2.x (bis 2,7 GHz) | Unterstützt (Treiber `js/drivers/nanovna-h.js`); mit angeschlossener Hardware noch nicht erprobt |
| NanoVNA V2, V2 Plus4, F V3, LiteVNA (bis 6 GHz) | Geplant: Bänder bis 6 GHz stehen schon in `bandas.json`; Treiber fehlen |

## So benutzt du ihn

Du brauchst **Chrome oder Edge am Desktop** (Web Serial) und eine Seite über `https` oder `localhost`.

```powershell
python -m http.server 8765
```

und öffne <http://localhost:8765>. Ohne Gerät aktiviere **„Simulierter Modus“**: eine Beispielantenne mit zwei Resonanzen und
realistischen Messfehlern zum Ausprobieren der Kalibrierung.

### Mit deinem NanoVNA testen

Öffne **[diagnostico.html](diagnostico.html)** bei angeschlossenem Gerät: Es prüft das Protokoll, das Punktelimit, die Zeiten
und ob die Rohmessung die Kalibrierung wiederherstellt, und erzeugt einen Textbericht zum Einfügen in ein Issue. Es sendet nie `save`.

## Antennen hin und zurück (Chirptenna Wire und Chirptenna)

Antennen reisen in gewöhnlichen Dateien; es ist nichts einzustellen. Mit **Chirptenna Wire** (Drahtantennen, NEC2):

| Was | Wie |
|---|---|
| **Die Simulation herholen** (`.s1p`) | In Wire: `python -m wire s1p <Typ> <MHz> --salida sim.s1p` oder die Schaltfläche *Simuliertes S11 herunterladen* (Reiter Simulation). Hier im Modus **Erweitert** → **Mit einer Touchstone-Datei vergleichen** → die `.s1p` wählen: sie erscheint grau über dem SWR-Diagramm, mit der Punkt-für-Punkt-Differenz und der Abweichung der Resonanz |
| **Deine Messung mitnehmen** (`.s1p`) | Messen, dann im Modus Erweitert **Touchstone (.s1p)** drücken. In Wire, Reiter *Medir* → *Abrir .s1p medido*: Wire vergleicht sie mit der Simulation, und der Entwurf wird «Gemessen», wenn die Abweichung ≤ 2 % beträgt |
| **Den Verkürzungsfaktor eines Kabels mitnehmen** | Unter **Koax und Stubs** **VF für Chirptenna Wire herunterladen** (`cable_*.json`). In Wire: *Abrir cable medido* (Reiter Diseño) oder `--cable-medido` |

Mit **Chirptenna** (auf Leiterplatten gedruckte Antennen) funktioniert der Vergleich genauso: Dasselbe Feld **Mit einer Touchstone-Datei
vergleichen** nimmt auch die `resultado.json` einer Chirptenna-Simulation an (sie vergleicht die simulierte mit der gemessenen Resonanz
und schätzt die reale εr des Substrats). Die Simulation gilt im freien Raum ohne Kabel: eine Referenz, keine Messung. Um mehrere
gemessene Antennen miteinander zu vergleichen, nutze **Antennen vergleichen**.

## Tests

```powershell
npm test
node herramientas/i18n.mjs faltan
```

Node ≥ 20, keine Abhängigkeiten. Sie decken den Treiber gegen einen DiSlord-Shell-Emulator (`pruebas/emulador.mjs`), die Analyse
(Resonanzen, Empfehlung, Bänder), die abschnittsweise Kalibrierung und **echte Daten** (`pruebas/datos/`) ab: Die SOL-Korrektur
in JS stimmt mit der Python-Version des Chirptenna-Projekts (`vna/calibracion.py`) überein, und eine gemessene 868-MHz-Antenne liefert das erwartete Ergebnis.

## Struktur

```
index.html  estilos.css  bandas.json
js/app.js          Oberfläche und Messablauf
js/analisis.js     S11 → RL, SWR, Z, Laufzeit; Resonanzen; Empfehlung; Bänder
js/calibracion.js  3-Term-OSL in Abschnitten, Abdeckung, Prüfung der Standards
js/asistente.js    Kalibrierassistent Schritt für Schritt
js/grafico.js      Canvas-Diagramme (RL, Smith, Reihen)
js/informe.js      PDF-Bericht (jsPDF, bei Bedarf von cdnjs geladen)
js/i18n.js         Sprachen: T(), Auswahl (Kataloge in idiomas/*.json; Werkzeug in herramientas/i18n.mjs)
js/drivers/        nanovna-h.js (Web Serial) und simulado.js
pruebas/           node:test, Emulator und echte Daten
```

## Bekannte Grenzen

- Die Kalibrierstandards werden als **ideal** angenommen (OPEN +1, SHORT −1, LOAD 0): Mit günstigen Sets gibt es oberhalb von
  ~1 GHz Fehler. Ein Modell mit Laufzeit und Kapazität des OPEN steht noch aus.
- **Die Bandgrenzen sind aus dem Gedächtnis geschrieben**, nicht mit nationalen Frequenzplänen abgeglichen. Prüfe sie, bevor
  du dich darauf verlässt (Regulierung, Leistung und Kanäle sind separate Themen).
- Höchstens 101 Punkte pro `scan` des Geräts; lange Sweeps werden verkettet und dauern.
- Die Gruppenlaufzeit ist verrauscht (Ableitung der Phase).
- **Die Unsicherheiten sind nur Richtwerte.** Der Bereich der Rückflussdämpfung stammt aus der Kalibrierprüfung und angenommenen typischen Spielräumen; die tatsächliche Unsicherheit kann größer sein. Für die Metrologie ohne kalibrierte, rückführbare Normale ungeeignet.

## Fahrplan

Geplante Funktionen für Einsteiger, Meshtastic, Funkamateure und HF-Experten: [ROADMAP.md](ROADMAP.md) (auf Spanisch).

## Lizenz

[AGPL-3.0](LICENSE), wie Chirptenna.
