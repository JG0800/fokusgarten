# 🌱 Fokusgarten

Ein Fokus-Timer mit Pausen, der konzentrierte Arbeit belohnt: Für jede abgeschlossene Fokuszeit bekommst du Münzen. Damit gießt und düngst du Pflanzen, die in deinem Garten wachsen und schließlich blühen.

## Funktionen

- **Timer mit Fokus- und Pausenzeiten** – Standard: 25 Min. Fokus, 5 Min. kurze Pause, 15 Min. lange Pause nach 4 Einheiten (alles einstellbar).
- **Münzen** – 1 🪙 pro Fokusminute, +10 🪙 Bonus für jeden vollen Zyklus. Abgebrochene Einheiten bringen nichts.
- **Garten mit 6 Beeten** – Samen kaufen, gießen (Wasser + Wachstum) und düngen (schnelleres Wachstum, alle 8 Std. möglich).
- **4 Pflanzenarten** – Sonnenblume, Tulpe, Kaktus und Kirschbaum, jeweils mit 6 Wachstumsstufen vom Samen bis zur Blüte.
- **Wasserhaushalt** – Pflanzen trocknen mit der Zeit aus (auch wenn die App geschlossen ist). Ohne Wasser welken sie und wachsen nicht weiter, bis du sie gießt.
- **Sammlung** – Voll erblühte Pflanzen kannst du in deine Sammlung aufnehmen und das Beet neu bepflanzen.
- **Statistik** – Fokusminuten heute, Anzahl Einheiten, Tage in Folge und ein Wochendiagramm.
- **Speicherung** – Münzen, Pflanzen, Statistik und sogar ein laufender Timer werden automatisch im Browser (`localStorage`) gespeichert. Zusätzlich gibt es Export/Import als JSON-Datei (Einstellungen → Spielstand).
- Ton und optionale Desktop-Benachrichtigung am Ende jeder Phase, helles und dunkles Design, funktioniert auf dem Handy.

## Starten

Keine Installation und kein Build nötig – es ist reines HTML, CSS und JavaScript.

**Variante 1:** `index.html` doppelklicken und im Browser öffnen.

**Variante 2 (empfohlen, damit Benachrichtigungen funktionieren):** einen kleinen lokalen Server starten:

```bash
python -m http.server 8000
```

und dann <http://localhost:8000> öffnen.

**Variante 3:** über GitHub Pages veröffentlichen (Repository → Settings → Pages → Branch `main`, Ordner `/`).

> Hinweis: Der Spielstand wird pro Browser und pro Adresse gespeichert. Wenn du zwischen `file://`, `localhost` und GitHub Pages wechselst, nutze Export/Import, um deinen Garten mitzunehmen.

## Spielregeln im Überblick

| Pflanze      | Samen | Gießen | Wasserverlust | Gießvorgänge bis zur Blüte* |
|--------------|------:|-------:|--------------:|----------------------------:|
| Sonnenblume  | 15 🪙 |   5 🪙 | 4 % / Std.    | 20 |
| Tulpe        | 20 🪙 |   5 🪙 | 3 % / Std.    | 22 |
| Kaktus       | 25 🪙 |   4 🪙 | 1,5 % / Std.  | 26 |
| Kirschbaum   | 50 🪙 |   8 🪙 | 2,5 % / Std.  | 35 |

\* Jedes Gießen gibt +1 Wachstum, Dünger (20 🪙) gibt +3. Gießen geht erst, wenn der Wasserstand unter 85 % liegt.

## Projektstruktur

```
index.html        Oberfläche
css/style.css     Design (hell/dunkel, responsiv)
js/plants.js      Pflanzenarten, Wachstumsregeln, SVG-Grafiken
js/storage.js     Speichern, Laden, Export/Import
js/app.js         Timer, Münzen, Garten, Statistik
```

Tastenkürzel: **Leertaste** startet bzw. pausiert den Timer.
