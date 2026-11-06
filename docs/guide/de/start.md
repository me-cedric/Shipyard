# Erste Schritte

Shipyard hilft einem Team, ein Softwareprojekt auszuliefern: den Entwurf, die Spezifikationen, die Arbeit, die Agenten, den Code und das Wissen. Alles bleibt in den Dateien des Projekts, sodass das Team es mit git teilt.

## Das Fenster

- Die linke Leiste enthält die Bereiche: Start, Entwurf, Spezifikationen, Arbeit, Fabrik, Code, Wissen und Einstellungen.
- Die Tabs eines Bereichs stehen oben auf der Seite.
- Der Inspektor rechts zeigt das Element, das Sie auswählen.
- Die Statusleiste unten zeigt das Projekt, den Sync-Status und die Commit-Steuerung.
- Der Assistent öffnet sich an der Seite. Stellen Sie ihm eine Frage zum Projekt. Jedes Gespräch ist ein Tab, und ein Punkt markiert einen Tab mit einer neuen Antwort.
  - Unter dem Nachrichtenfeld hat eine Leiste die Schaltfläche zum Anhängen, eine Schaltfläche mit dem Modell und dem Aufwand (sie öffnet die Modelle des KI-Tools, die Aufwandsstufen und die Modelle der anderen KI-Tools), die Berechtigung, den Kontextring und Senden.
  - Im Modus Agent ist die Berechtigung Bearbeiten mit Freigabe, Auto: Änderungen annehmen oder Berechtigungen umgehen. Berechtigungen umgehen überspringt jede Freigabe von Claude Code oder Codex: Shipyard fragt Sie beim ersten Mal in jedem Projekt, zeigt die Einstellung in Rot, solange sie aktiv ist, und lehnt sie in einem schreibgeschützten Projekt und bei ausgeschaltetem Agenten-Schalter ab.
  - Tippen Sie `/` am Anfang einer Nachricht, um die Befehle des gewählten KI-Tools aufzulisten. Der Text geht so an das KI-Tool, wie Sie ihn getippt haben.
  - Jedes Gespräch hält eine Agent-Sitzung, sodass eine spätere Nachricht die frühere Arbeit fortsetzt.
- Wählen Sie in Einstellungen, dann Ich, die Seite der Leiste und der Schubladen, die Akzentfarbe, das Datumsformat, eine schmale obere Leiste und Ihr Bild.

Das Fenster öffnet sich in der Größe, in der Sie es geschlossen haben. Um die Daten der App neben der App zu halten (zum Beispiel auf einem USB-Stick), legen Sie eine leere Datei namens `portable` neben die App.

## Das Element der Menüleiste

- Das Shipyard-Symbol steht in der Menüleiste (im Infobereich unter Windows und Linux). Ein Punkt auf dem Symbol heißt, dass etwas auf Sie wartet.
- Ein Klick öffnet ein kleines Fenster: die Ausgaben von heute und des Monats, die aktiven Läufe mit Stoppen, die Zahl Wartet auf Sie mit den ersten Elementen, der Agenten-Schalter, der Sync-Status, das Projekt und Shipyard öffnen.
- Das Fenster verlangt für jede Aktion, die schreibt, denselben Klick wie die App.
- Schalten Sie das Element der Menüleiste in Einstellungen, dann Ich, aus.

## Die Tour

- Beim ersten Start öffnet sich eine kurze Tour mit sechs Schritten: der Kreislauf, ein Projekt öffnen, das Ticketsystem und die Code-Plattform verbinden, das KI-Tool wählen, die Berechtigungen und der erste Lauf auf einem Ticket.
- Klicken Sie auf Weiter und Zurück, oder drücken Sie die Pfeiltasten links und rechts. Schließen beendet die Tour bei jedem Schritt. Sie öffnet sich nicht mehr von selbst.
- Um sie noch einmal zu sehen, wählen Sie Hilfe, dann Tour wiederholen, oder tippen Sie Tour wiederholen in die Palette, oder gehen Sie zu Einstellungen, dann Ich, dann Berechtigungen.
- Der letzte Schritt öffnet diese Anleitung.

## Berechtigungen

Shipyard fragt nach einer Berechtigung des Systems erst, nachdem Sie auf Erlauben geklickt haben. Die Tour und Einstellungen / Ich zeigen jede mit ihrem Status: An, Aus, Nicht gefragt, Nicht nötig oder Unbekannt.

| Berechtigung | macOS | Windows | Linux |
|---|---|---|---|
| Benachrichtigungen | Erlauben zeigt die Abfrage des Systems. Aus öffnet die Systemeinstellungen. | Test senden und Systemeinstellungen öffnen. | Test senden. |
| Dokumente, Schreibtisch und Downloads | Erlauben lässt macOS nach jedem Ordner fragen. Aus öffnet Datenschutz & Sicherheit / Dateien und Ordner. | Nicht nötig. | Nicht nötig. |

Shipyard fragt nicht nach Vollzugriff auf die Festplatte, der Kamera, dem Mikrofon oder dem Standort. Ein Projekt auf einem Wechsel- oder Netzwerkdatenträger erhält beim Öffnen die Abfrage von macOS.

## Ein Projekt öffnen

1. Gehen Sie zu Start, dann Projekte.
2. Klicken Sie auf Lokalen Ordner öffnen und wählen Sie den Ordner Ihres Projekts. Oder erstellen Sie ein neues Projekt.
3. Wenn der Ordner noch kein Projekt ist, klicken Sie auf Zum Projekt machen.

## Sich zurechtfinden

- Drücken Sie Ctrl+K (Cmd+K auf einem Mac), um die Palette zu öffnen. Tippen Sie den Namen einer Seite, eines Elements oder einer Aktion.
- Tippen Sie in der Palette ein paar Wörter, um den Text Ihrer Dokumente, Entscheidungen, Spezifikationen, Fragen, Tickets und Entwürfe zu durchsuchen. Groß- und Kleinschreibung und Akzente spielen keine Rolle („decision“ findet „décision“), jedes Wort muss passen, und das letzte Wort darf ein Anfang sein. Die Ergebnisse sind nach Art gruppiert, zeigen einen kurzen Auszug mit markierten Wörtern und stellen eine Seite, die viele Elemente zitieren, an die erste Stelle. Wählen Sie Den Assistenten fragen, um diese Elemente als Kontext in das Nachrichtenfeld des Assistenten zu legen. Nichts wird gesendet, bevor Sie senden. Das Dokument, das Sie aus einem Ergebnis öffnen, markiert die Wörter.
- Die Listen in Entwurf und Wissen haben ein Feld Suchen, das die Liste mit derselben Suche filtert.
- Drücken Sie Ctrl+1 bis Ctrl+8, um zu einem Bereich zu gehen.
- Öffnen Sie die Palette und wählen Sie Anleitung zu dieser Seite öffnen, um die Hilfe der Seite zu lesen, die Sie sehen.
- Drücken Sie Ctrl+[ und Ctrl+] (Cmd auf einem Mac), oder klicken Sie in der oberen Leiste auf Zurück und Vorwärts, um zwischen den geöffneten Ansichten zu wechseln.
- Klicken Sie auf die Schaltfläche ? oder drücken Sie F1, um die Hilfe der Seite zu lesen, die Sie sehen.
- Klicken Sie auf die Schaltfläche der Seitenleiste am linken Ende der oberen Leiste, um die Seitenleiste aus- oder einzublenden.
- Unter 1100 px stehen die Schaltflächen für Dateien, Terminal und Farbschema im Menü Mehr.
- Klicken Sie auf Synchronisieren, um zu synchronisieren. Klicken Sie auf den Pfeil daneben für Nur abrufen oder für Push.
- Wenn ein Fehler eine Schaltfläche hat, die eine Einstellung öffnet, klicken Sie darauf. Die Seite öffnet sich genau an der Zeile, setzt den Fokus auf ihr Steuerelement und markiert es 2 Sekunden lang.
- Halten Sie Ctrl (Cmd auf einem Mac) und drehen Sie das Mausrad auf einem Diagramm oder einem Bild, um zu zoomen. Ziehen Sie, um es zu verschieben. Nutzen Sie Vollbild für eine große Ansicht.
- Drücken Sie Ctrl+= und Ctrl+-, um die Textgröße zu ändern, und Ctrl+0, um zu 16 px zurückzukehren. Einstellungen / Ich bietet dieselbe Auswahl.
- Drücken Sie Ctrl+Shift+K, um alle Tastenkürzel zu sehen.

## Ihre Rolle

Wählen Sie in Einstellungen, dann Ich, Ihre Rolle. Die Rolle legt den Bereich fest, der zuerst öffnet. Ein Junior startet in Wissen, Lernen. Eine Projektleitung startet in Arbeit, Board.

## Standardmäßig sicher

- Die App sendet nie eine Änderung an ein Ticketsystem oder eine Code-Plattform ohne Ihren Klick.
- Ein Token geht in den Schlüsselbund Ihres Computers. Die App zeigt es nie wieder.
- Ein Projekt mit einem schreibgeschützten Profil nimmt keine Änderung an.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Referenz | Der Kurzname eines Elements, zum Beispiel `adr:0003` oder `wi:ACME-12`. Klicken Sie auf eine Referenz, um ihr Element zu öffnen. |
| Ticketsystem | Das Tool, das die Tickets enthält: Jira, GitHub, GitLab, Azure DevOps oder Linear. |
| Code-Plattform | Der Server, der den Code enthält: GitHub oder GitLab. |
| Lauf | Ein Auftrag eines Agenten auf einem Ticket. |
| Spezifikation | Ein Text, der sagt, was das Produkt tun muss. |
| ADR | Ein Entscheidungsprotokoll: eine Entscheidung, ihre Optionen und ihre Gründe. |
| MCP-Server | Ein Tool, das ein Agent aufrufen kann, zum Beispiel Jira oder Figma. |
