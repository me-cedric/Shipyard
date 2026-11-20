# Bibliothek

Bibliothek enthält die Seiten, die das Projekt beschreiben: was es tun muss, wie es gebaut ist, warum es so ist, und was das Team lernt und teilt. Jedes Element ist eine Datei des Projekts.

Bibliothek öffnet sich mit vier Türen. Jede Tür nennt, wonach Sie suchen, und enthält einen Chip für jede Seite. Klicken Sie auf einen Chip, um seine Seite zu öffnen. Wenn etwas auf Sie wartet, kommt ein orangefarbener Chip zuerst und nennt die Zahl: die offenen Fragen, oder die Entscheidungen, die warten. Ein Chip markiert eine Seite, deren Quelle sich später geändert hat. Eine Seite, die Ihre Rolle nicht sieht, hat keinen Chip.

Bibliothek hat keinen Umschalter für Abschnitte. Klicken Sie auf jeder Seite von Bibliothek oben auf Bibliothek, um zu den Türen zurückzukehren.

## Ein Element lesen und ändern

1. Öffnen Sie eine Seite, dann wählen Sie ein Element. Oder klicken Sie auf die Hauptaktion der Seite, um eines anzulegen. Wählen Sie ein Element, um im Inspektor die Elemente zu sehen, die es zitieren.
2. Ein Element mit einem Bild öffnet sich nur mit dem Bild. Ein Umschalter oben hat drei Möglichkeiten: Bild, Beide (der Text und das Bild nebeneinander) und Text. Ein Dokument hat Lesen, Beide und Text. Shipyard behält Ihre Wahl. Es zeigt den Text von selbst bei einer neuen Datei, wenn jemand die Datei gleichzeitig geändert hat, und bei einem Fehler, der eine Zeile nennt.
3. Ändern Sie den Text oder die Zeichnung, dann klicken Sie auf Speichern. Die App schreibt die ganze Datei oder nichts.

- Suchen: Die Listen haben ein Feld Suchen. Es nutzt dieselbe Suche wie die Fragen-Leiste.
- Löschen: Öffnen Sie das Menü eines Elements (Rechtsklick) und wählen Sie Löschen, oder klicken Sie im Inspektor auf Löschen. Die App nennt die Datei und fragt einmal. Die Datei geht dann in den Papierkorb.
- Umbenennen: Das Menü des Elements hat Umbenennen. Tippen Sie den neuen Namen; die Endung bleibt. Die Prüfung listet jede Datei und jede Zeile, deren Links sich ändern. Umbenennen verschiebt dann die Datei und schreibt diese Links in einem Schritt um. Wenn ein Schreibvorgang fehlschlägt, bleibt jede Datei, wie sie war.
- Den Assistenten fragen: die letzte Gruppe des Menüs eines Elements. Wählen Sie eine Anfrage für diese Art von Element und Ihre Rolle. Sie füllt das Nachrichtenfeld mit dem Element, seiner Datei, seiner Spezifikation, seinem Ticket und den Elementen, die es zitieren. Nichts wird gesendet, bis Sie es senden.
- Wenn jemand die Datei gleichzeitig ändert, sagt die App es Ihnen. Wählen Sie Neu laden, um seine Version zu nehmen, oder Meine behalten.
- Ein schreibgeschütztes Projekt lehnt das Speichern, das Löschen und das Umbenennen ab.

## Was es tun muss

### Spezifikationen

Spezifikationen listet, was das Produkt heute tut, mit den Anforderungen jeder Spezifikation. Eine Änderung an einer Spezifikation beginnt als Vorschlag: siehe die Seite Ablauf, Liste und Die Seite eines Features, Auftrag.

### Testpläne

Testpläne listet die Testszenarien. Jedes Szenario nennt die Anforderungen, die es prüft. Ein Plan öffnet sich in Lesen: eine Karte für jedes Szenario, mit seinen Schritten und seinen Tags. Klicken Sie auf Bearbeiten, um seinen Text zu ändern. Ein Plan ohne Szenario öffnet sich in seinem Text. Ein Befund der Prüfung öffnet den Plan in seinem Text, an seiner Zeile.

### Fragen

Fragen ist das Register der offenen Punkte: Risiken, Annahmen, Probleme, Abhängigkeiten und Fragen.

- Filtern Sie nach Art, Zustand und Verantwortlichem.
- Klicken Sie auf Neue Frage, um eine hinzuzufügen. Wählen Sie den Verantwortlichen aus dem Team.
- Nachdem Sie eine Frage einer Spezifikation beantwortet haben, kopiert ein Klick die Antwort in die Spezifikation.

## Wie es gebaut ist

### Karte

Karte zeichnet die Elemente des Projekts und die Links zwischen ihnen. Filtern Sie nach Art. Eine Tabellenansicht listet dieselben Elemente.

- Ein Element, das nichts zitiert, zeigt sich als verwaist.
- Ein Element, dessen Quelle sich später geändert hat, zeigt sich als veraltet.
- Wählen Sie ein Element, um es im Inspektor zu öffnen.

Mit der Quelle Code zeigt die Karte die Ordner des Codes. Eine Linie zwischen zwei Ordnern ist dicker, wenn mehr Aufrufe zwischen ihren Dateien laufen. Wählen Sie einen Ordner, um seine Dateien zu sehen, dann eine Datei, um ihre Symbole zu sehen und was sie aufruft oder was sie aufrufen. Alle anzeigen führt zur Karte zurück. Index startet den Code-Index-Server, wenn er aus ist, baut den Index und stoppt den Server wieder. Wenn das Programm mit einem Fehler endet, nennt die Seite das Programm, seinen Exit-Code und seine letzten Zeilen: Beheben Sie die Ursache, dann klicken Sie erneut auf Index.

### Architektur

Architektur zeigt die Architekturmodelle des Projekts als Ansichten. Die Ansichten werden aus dem Text des Modells gezeichnet.

Ein Diagramm oder ein Bild, in Architektur und in Bildschirme, passt sich seinem Rahmen an und steht beim Öffnen in der Mitte. Um es zu bewegen:

- Verschieben: Ziehen Sie es, oder nutzen Sie eine seitliche Geste auf dem Trackpad. Ein senkrechtes Mausrad scrollt die Seite.
- Zoomen: Ziehen Sie zwei Finger auseinander, oder halten Sie Ctrl oder Cmd und drehen Sie das Rad.
- Tastatur: Klicken Sie auf den Rahmen, um ihm den Fokus zu geben, dann drücken Sie die Pfeiltasten zum Verschieben, + oder - zum Zoomen und 0 zum Anpassen.
- Anpassen bringt das ganze Diagramm in den Rahmen zurück.

### Diagramme

Diagramme enthält die Zeichnungen des Projekts: Excalidraw, Mermaid, draw.io und BPMN. Zeichnen Sie im Editor, dann speichern Sie.

### Bildschirme

Bildschirme zeigt die Bildschirme des Produkts und die Design-Tokens Ihres Projekts. Sie kommen aus dem Design-Dokument (CSS in einem Codeblock), aus einer Datei `tokens.css`, aus einer Datei `*.tokens.json` oder aus einem `@theme`-Block von Tailwind 4, gruppiert nach Datei. Ohne Token sagt die Seite Noch keine Tokens; klicken Sie auf Tokens zum Design-Dokument hinzufügen, bearbeiten Sie den Block, dann speichern Sie. Die Seite zeigt nie die Tokens von Shipyard.

- Eine `.fig`-Datei zeigt die Vorschau, die Figma darin hält.
- Um Figma zu lesen, fügen Sie einmal das Token Ihres Figma-Kontos hinzu. Es geht in den Schlüsselbund Ihres Computers.
- Fügen Sie dann die Adresse eines Figma-Projekts ein und klicken Sie auf Dateien auflisten. Jede Datei zeigt ihre Vorschau und ihre Design-Tokens.

### API

API zeigt die API-Verträge. Öffnen Sie einen Vertrag, um seine Routen zu lesen. Probieren Sie eine Route gegen einen Server des Vertrags aus.

### Daten

Daten zeigt die Datenmodelle: die Tabellen und die Links zwischen ihnen.

### Netzwerkabläufe

Netzwerkabläufe listet die Netzwerkabläufe als Tabelle: von wo, nach wo, der Port und das Protokoll. Fügen Sie eine Zeile hinzu, ändern oder entfernen Sie sie, dann speichern Sie.

## Warum es so ist

### Entscheidungen

Entscheidungen enthält die Entscheidungsprotokolle (ADRs). Jedes Protokoll nennt eine Entscheidung, die Optionen und die Gründe.

- Klicken Sie auf Neue Entscheidung, um eine zu schreiben. Ein Formular fragt nach jedem Teil.
- Nehmen Sie eine vorgeschlagene Entscheidung mit einem Klick an oder lehnen Sie sie ab.

### Projektregeln

Projektregeln enthält die Regeln des Projekts, denen jede Änderung folgen muss.

## Lernen und teilen

### Lernen

Lernen hilft einer neuen Person, sich zurechtzufinden.

- Pfad: die Architektur, die Entscheidungen, dann die Spezifikationen, in Lesereihenfolge. Ein Schritt, den Sie öffnen, zählt als erledigt.
- Glossar: die Wörter, die die Spezifikationen definieren.
- Lernpfade: Kurse, Zertifizierungen und Lektüren, mit den Experten des Teams, die helfen können. Wählen Sie eine Person, dann haken Sie die Schritte an, die diese Person beendet hat. Die Fortschrittstabelle des Teams zeigt jede Person und jeden Pfad.
- Feeds: die Nachrichten-Feeds des Projekts. Fügen Sie die RSS- oder Atom-Adresse einer Website ein, dann klicken Sie auf Abonnieren. Die App liest jeden Feed und hält eine Kopie für eine Stunde.

### Handbuch

Handbuch enthält die Seiten des Projekthandbuchs. Lesen Sie eine Seite mit ihrem Inhaltsverzeichnis an der Seite, oder wechseln Sie zu Bearbeiten, um sie zu ändern. In Bearbeiten zeigt der Umschalter Lesen, Beide, Text die Seite, wie Sie sie lesen, die Seite neben ihrem Text, oder nur den Text. Klicken Sie auf Neue Seite, um eine hinzuzufügen.

### Dokumente

Dokumente listet die Dokumente des Projekts. Durchsuchen Sie ihren Text, benennen Sie sie um, löschen Sie sie, und lesen Sie eine Word-Datei. Exportieren Sie das Architektur-Dossier und die funktionale Dokumentation als Word-Dateien, und ein Kundenblatt als Excel-Datei. Jeder Export öffnet einen Dialog Speichern unter mit ausgefülltem Namen und dem Ordner Ihres letzten Speicherns; Abbrechen exportiert nichts. Nach einem Speichern wirken Im Ordner anzeigen und Öffnen auf die neue Datei.

Eine Word-Datei hat ein Deckblatt, ein Inhaltsverzeichnis (Word füllt die Seitenzahlen, wenn es fragt, ob die Felder aktualisiert werden sollen), die Mermaid-Diagramme des Projekts als Bilder, und Seitenzahlen. Eine LikeC4- oder draw.io-Datei zeigt sich als Bild, wenn ein PNG mit demselben Namen daneben liegt, und sonst als ihr Pfad. Ein Excel-Blatt hat eine gestaltete Kopfzeile, die auf dem Bildschirm bleibt.

### Folien

Folien enthält die Präsentationen des Projekts. Jede Präsentation ist eine HTML-Datei in `docs/slides/`, mit ihren Animationen und ihren Schritten.

- Neue Präsentation: Tippen Sie einen Namen. Der Assistent öffnet sich mit einer Bitte an einen Agenten, die Präsentation zu schreiben. Lesen Sie die Bitte, dann senden Sie sie.
- Klicken Sie auf eine Präsentation, um sie zu zeigen. Die Pfeiltasten, die Leertaste, Pos1 und Ende führen durch die Folien und die Schritte.
- Präsentieren zeigt die Präsentation im Vollbild. Drücken Sie Escape, um zu stoppen.
- PDF exportieren: Wählen Sie die Datei im Dialog Speichern unter. Jede Folie wird eine Seite. Das funktioniert nur unter macOS.
- Eine ältere, als Text geschriebene Präsentation zeigt sich schreibgeschützt. Klicken Sie auf Umwandeln, um einen Agenten zu bitten, sie als HTML-Präsentation neu zu schreiben.
- Um eine Präsentation zu löschen, öffnen Sie ihr Menü, dann klicken Sie auf Löschen. Die Datei geht in den Papierkorb.

### Dashboards

Dashboards enthält Tafeln mit Kacheln: Arbeit, Läufe, Fragen, Qualität und mehr. Fügen Sie eine Kachel hinzu oder entfernen Sie sie, ändern Sie ihre Einstellungen, dann speichern Sie. Als Tabelle anzeigen gibt die Zahlen hinter einem Diagramm. Ziehen Sie eine Kachel in eine andere Spalte, oder nutzen Sie ihre Schaltflächen Nach links und Nach rechts. Die Kacheln, die Sie anheften, zeigen sich oben in Dashboards. Eine Kachel, deren Quelle aus ist, sagt es.

Kachel für mich bauen bittet einen Agenten, aus Ihren Worten eine Kachel vorzuschlagen. Sie müssen die Arten von Kacheln nicht kennen.

1. Klicken Sie auf Kachel für mich bauen, neben Kachel hinzufügen.
2. Tippen Sie in einfachen Worten, was die Kachel zeigen soll. Zum Beispiel: die offenen Fragen pro Verantwortlichem.
3. Budget (USD) ist das Limit des Agenten: Der Agent stoppt beim Budget, oder nach 2 Minuten. Seine letzte Antwort kann das Budget leicht überschreiten. Das Budget beginnt bei 2 Dollar. Weniger Budget und Mehr Budget ändern es um 1 Dollar.
4. Klicken Sie auf Bauen. Während der Agent arbeitet, beendet Stoppen ihn. Die Arbeit zeigt sich auch in Team / Sitzungen, und ihr Stoppen tut dasselbe.
5. Sehen Sie sich die Vorgeschlagene Kachel an. Annehmen fügt sie dem Dashboard hinzu und speichert. Verwerfen lässt sie fallen.

Der Agent liest das Projekt nur. Das Dashboard ändert sich nicht, bis Sie auf Annehmen klicken. Wenn die Seite sagt, dass das Budget aufgebraucht ist, fügen Sie Budget hinzu, dann klicken Sie erneut auf Bauen. Ein Dashboard, das Sie nicht ändern können, hat kein Kachel für mich bauen.

### Berichte

Berichte listet jede Datei, die Shipyard für eine Person erstellen kann, die Shipyard nicht nutzt: einen Kunden, eine Führungskraft, einen Prüfer. Jeder Bericht ist eine Karte. Format, oben, zeigt Alle Berichte, oder nur die Word-Dateien, die Excel-Dateien oder die Bilder.

- Exportieren: Shipyard öffnet den Dialog Speichern unter. Wählen Sie den Ordner, dann speichern Sie.
- Formular ausfüllen: Änderungsantrag und Geleistete Arbeit fragen zuerst nach einigen Werten, dann erstellen sie die Datei.
- Plan öffnen oder Schätzungen öffnen: Der Bericht braucht eine Wahl, die Sie auf dieser Seite treffen. Der Link öffnet die Seite; exportieren Sie von dort.

Ein Bericht zeigt sich nur, wenn Ihre Rolle die Seite sieht, die seinen Export enthält. Der Bericht Netzwerkabläufe zeigt sich, wenn das Projekt eine Ablaufdatei hat. Wenn kein Bericht übrig ist, hat Berichte keinen Chip. Das Menü Exportieren jeder Seite funktioniert weiterhin.

### Anleitung

Anleitung ist dieser Leitfaden. Öffnen Sie ihn mit Anleitung im Kontomenü, mit F1, mit der Fragen-Leiste oder mit dem Chip Anleitung von Bibliothek. Er kommt mit der App, in der Sprache der Oberfläche, und funktioniert ohne Projekt. Tippen Sie ein Wort in das Suchfeld, um jeden Abschnitt zu finden, der es enthält. Anleitung zu dieser Seite öffnen, in der Fragen-Leiste, öffnet die Seite des Ortes und den Abschnitt, den Sie sehen.

Die Anleitung hat eine Seite für jeden Ort, in der Reihenfolge der Seitenleiste, und sie öffnet mit Start. Jede Seite hat ein Bild. F1 öffnet die Anleitung für jede Rolle, auch für eine Rolle, die Bibliothek nicht sieht: Die Anleitung ist Hilfe. Unter einer Seite setzt Zu dieser Seite fragen eine Frage zur Seite in den Assistenten, Tastenkürzel öffnet die Tastenkürzel, und Handbuch des Projekts öffnet das Handbuch des Projekts.

Ein Link im Text einer Seite, zum Beispiel `adr:0003`, öffnet eine Karte, die ihn erklärt. Die Karte sagt, ob das Element im Projekt ist und womit es verknüpft ist. Öffnen und Mit einem Agenten erklären stehen nebeneinander. Mehr zeigt die anderen Aktionen, und Referenz kopieren kopiert den Namen des Elements.
