# 🌱 Fokusgarten

Ein Fokus-Timer mit Pausen, der konzentrierte Arbeit belohnt: Für jede abgeschlossene Fokuszeit bekommst du Münzen. Damit gießt und düngst du Pflanzen, die in deinem Garten wachsen und schließlich blühen.

## Funktionen

- **Timer mit Fokus- und Pausenzeiten** – Standard: 25 Min. Fokus, 5 Min. kurze Pause, 15 Min. lange Pause nach 4 Einheiten (alles einstellbar).
- **Münzen** – 1 🪙 pro Fokusminute, +10 🪙 Bonus für jeden vollen Zyklus. Abgebrochene Einheiten bringen nichts.
- **Aufgabenliste** – Aufgaben eintragen und abhaken: Jede erledigte Aufgabe bringt 50 🪙. Erledigte Aufgaben wandern in eine einklappbare Liste. Die Liste bleibt auch im Fokusmodus sichtbar.
- **Lebendiger Garten** – eine Szene mit blauem Himmel, Sonne, vorbeiziehenden Wolken, Hügeln, Zaun und 6 Beeten. Ein Klick auf ein Beet zeigt darunter die Details zur Pflanze.
- **Pflanzen mit Persönlichkeit** – im Cartoon-Stil mit Konturen, Farbverläufen und großen weißen Augen mit blauer Iris. Sie wippen, schauen umher, wiegen sich im Wind, blinzeln und zeigen ihre Stimmung: schlafend als Samen, fröhlich, durstig (Blick nach oben, Schweißtropfen), welk (halb geschlossene Augen, Träne) oder strahlend mit roten Wangen nach dem Gießen und in voller Blüte.
- **Gießen und Düngen** – Samen kaufen, gießen (Wasser + Wachstum – eine Regenwolke mit Augen zieht über die Pflanze) und düngen (schnelleres Wachstum, alle 8 Std. möglich).
- **5 Pflanzenarten** – Sonnenblume, Tulpe, Kaktus, Kirschbaum und Pilz, jeweils mit 6 Wachstumsstufen vom Samen bis zur Blüte.
- **Fokusmodus** – Sobald eine Fokuszeit läuft, werden Garten, Statistik und Sammlung ausgeblendet und der Timer rückt groß in die Mitte. Beim Pausieren und in den Pausen ist der Garten wieder da.
- **Wasserhaushalt** – Pflanzen trocknen mit der Zeit aus (auch wenn die App geschlossen ist). Ohne Wasser welken sie und wachsen nicht weiter, bis du sie gießt.
- **Ernten lohnt sich** – Voll erblühte Pflanzen erntest du in deine Sammlung: Die Pflanze springt aus dem Beet, Münzen sprudeln heraus und der Wert erscheint über ihr. Das bringt eine Ernteprämie (30–50 🪙) und verstärkt dauerhaft den **Bonus seiner Art**. Jede weitere Pflanze wirkt prozentual auf den aktuellen Wert – der Bonus wächst also immer weiter, nähert sich aber nur einem Grenzwert an:
  - 🌻 Sonnenblume: mehr 🪙 pro Fokuseinheit (1 → 4 bei 5 Stück → 7 bei 10 … bis zu +10)
  - 🌷 Tulpe: Wasserverlust aller Pflanzen −5 % vom aktuellen Wert (5 Stück: −23 %, 10: −40 %)
  - 🌵 Kaktus: Wasserreserve vor dem Welken (2,4 Std. → 9,8 Std. bei 5 Stück … bis zu 24 Std.)
  - 🌸 Kirschbaum: mehr Münzen auf Fokuszeit (+5 % → +20 % bei 5 Stück … bis zu +50 %)
  - 🍄 Pilz: Düngerzeit −10 % vom aktuellen Wert (8 Std. → 4 Std. 44 Min. bei 5 Stück → 59 Min. bei 20 Stück)
- **Statistik** – Fokuszeit heute, im laufenden Monat, im Jahr und insgesamt. Diagramme für die letzten 7 Tage, die letzten 12 Monate und alle Jahre, dazu Serie (Tage in Folge), Anzahl der Fokuseinheiten, bester Tag und bester Monat.
- **Speicherung** – Münzen, Pflanzen, Statistik und sogar ein laufender Timer werden automatisch im Browser (`localStorage`) gespeichert. Zusätzlich gibt es Export/Import als JSON-Datei (Einstellungen → Spielstand).
- **Testumgebung** (Einstellungen → 🧪 Testmodus → „Testumgebung starten“) – startet einen eigenen, leeren Testgarten in einem getrennten Speicherplatz, mit unbegrenzten Münzen, Gießen und Düngen ohne Wartezeiten und optionalem Schnelltimer (Minuten laufen als Sekunden). Dein echter Spielstand wird dabei nicht verändert; ein laufender Timer wird pausiert. Beim Verlassen wird die Testumgebung verworfen.
- **Fokus-Musik** – Meditativ, Fokus-Techno oder Regen. Die Musik wird live im Browser erzeugt (keine Audiodateien), startet automatisch mit der Fokuszeit und blendet in Pausen aus. Ein Klick auf einen Stil spielt außerhalb der Fokuszeit eine 8-Sekunden-Hörprobe.
- **Synchronisation zwischen Handy und PC** – über einen geheimen Gist in deinem GitHub-Konto (Einstellungen → ☁️ Synchronisation). Änderungen werden nach wenigen Sekunden, jede Minute und beim Zurückkehren in die App abgeglichen; gleichzeitige Änderungen auf zwei Geräten werden zusammengeführt. Eine Fokuszeit schließt immer das Gerät ab, das sie gestartet hat – Münzen gibt es also nicht doppelt.
- **Als App installierbar** – auf Handy und PC mit eigenem Symbol, Vollbild und Offline-Start.
- Ton und optionale Desktop-Benachrichtigung am Ende jeder Phase, helles und dunkles Design, funktioniert auf dem Handy.

## Starten

**Online (Handy & PC):** <https://jg0800.github.io/fokusgarten/>

### Auf dem Handy installieren
- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
- **Android (Chrome):** Seite öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

### Synchronisation einrichten (einmal pro Gerät)
1. Auf GitHub einen Zugangsschlüssel erstellen: <https://github.com/settings/tokens/new?scopes=gist&description=Fokusgarten%20Sync> – nur das Häkchen **gist** ist nötig. Ablaufdatum nach Wunsch.
2. In der App: Einstellungen → ☁️ Synchronisation → Schlüssel einfügen → „Verbinden“.
3. Auf dem zweiten Gerät dasselbe (derselbe Schlüssel oder ein eigener). Liegt dort schon ein anderer Spielstand, fragt die App, welcher verwendet werden soll.

Der Schlüssel bleibt nur auf dem jeweiligen Gerät gespeichert. Der Spielstand liegt in einem **geheimen** Gist: Er taucht nirgends öffentlich auf, ist aber für jeden lesbar, der den genauen Link kennt.

### Lokal starten
Keine Installation und kein Build nötig – es ist reines HTML, CSS und JavaScript:

```bash
python -m http.server 8000
```

und dann <http://localhost:8000> öffnen (oder `index.html` direkt im Browser öffnen – dann ohne Offline-Modus und Installation).

> Hinweis: Ohne Synchronisation wird der Spielstand pro Browser und pro Adresse gespeichert. Export/Import (Einstellungen → Spielstand) funktioniert immer.

## Spielregeln im Überblick

| Pflanze      | Samen | Gießen | Wasserverlust | Gießvorgänge bis zur Blüte* | Ernteprämie |
|--------------|------:|-------:|--------------:|----------------------------:|------------:|
| Sonnenblume  | 15 🪙 |   5 🪙 | 4 % / Std.    | 20 | 30 🪙 |
| Tulpe        | 20 🪙 |   5 🪙 | 3 % / Std.    | 22 | 35 🪙 |
| Kaktus       | 25 🪙 |   4 🪙 | 1,5 % / Std.  | 26 | 35 🪙 |
| Kirschbaum   | 50 🪙 |   8 🪙 | 2,5 % / Std.  | 35 | 50 🪙 |
| Pilz         | 30 🪙 |   5 🪙 | 2 % / Std.    | 24 | 40 🪙 |

\* Jedes Gießen gibt +1 Wachstum, Dünger (20 🪙) gibt +3. Gießen geht erst, wenn der Wasserstand unter 85 % liegt.

## Projektstruktur

```
index.html        Oberfläche
css/style.css     Design (hell/dunkel, responsiv)
js/plants.js      Pflanzenarten, Wachstumsregeln, Pflanzengrafiken mit Gesichtern
js/scene.js       Gartenszene (Himmel, Wolken, Beete, Animationen)
js/storage.js     Speichern, Laden, Export/Import, Testumgebung
js/music.js       Fokus-Musik (Web Audio)
js/sync.js        Synchronisation über einen privaten GitHub-Gist
sw.js             Service Worker (Offline-Start)
manifest.webmanifest, icons/   Installation als App
js/app.js         Timer, Münzen, Garten, Statistik
```

Tastenkürzel: **Leertaste** startet bzw. pausiert den Timer.
