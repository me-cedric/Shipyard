# Die Fragen-Leiste

Shipyard fragen oder beauftragen, in der oberen Zeile jeder Seite, ist die eine Leiste für eine Frage, einen Bereich und eine Aktion. Drücken Sie Ctrl+K (Cmd+K auf einem Mac), um dorthin zu gehen. Tippen Sie, dann nutzen Sie die Pfeiltasten und die Eingabetaste. Escape schließt sie.

## Wechseln zu

Wechseln zu öffnet einen Bereich, einen Abschnitt, ein Projekt, ein Element oder ein Suchergebnis.

Tippen Sie ein paar Wörter, um den Text Ihrer Dokumente, Entscheidungen, Spezifikationen, Fragen, Tickets und Entwürfe zu durchsuchen. Groß- und Kleinschreibung und Akzente spielen keine Rolle („decision“ findet „décision“), jedes Wort muss passen, und das letzte Wort kann ein Anfang sein. Die Ergebnisse sind nach Art gruppiert, zeigen einen kurzen Auszug mit den markierten Wörtern, und stellen eine Seite, die viele Elemente zitieren, an den Anfang. Das Dokument, das Sie aus einem Ergebnis öffnen, markiert die Wörter.

Wählen Sie Den Assistenten fragen, um diese Elemente als Kontext in das Nachrichtenfeld des Assistenten zu setzen. Nichts wird gesendet, bis Sie es senden.

## Aktionen

Aktionen starten eine Aktion oder eine Anfrage für die Seite, die Sie sehen. Beispiele: Neues Feature, Einen Agenten auf ein Ticket ansetzen (das öffnet die Seite Neues Feature), Jetzt synchronisieren, Anleitung zu dieser Seite öffnen, Tour wiederholen. Eine Aktion, die Ihre Rolle nicht nutzen kann, zeigt sich nicht.

## Fragen

Fragen Sie, was blockiert, was gestoppt ist oder was auf Sie wartet. Die Antwort nennt jedes Feature und gibt seine Aktion: Antworten, Blockade lösen, Budget hinzufügen, Erneut versuchen, Fortsetzen oder Als erledigt schließen. Antworten öffnet ein Feld in der Antwort: Tippen Sie den Text, dann klicken Sie auf Senden. Gehe zu und Tun stehen unter der Antwort, und Den vollen Assistenten öffnen öffnet die Seite Fragen.

Jeder andere Text geht mit der Eingabetaste an den Assistenten.

## Der Assistent

Der Assistent öffnet sich an der Seite. Stellen Sie ihm eine Frage zum Projekt. Jedes Gespräch ist ein Tab, und ein Punkt markiert einen Tab mit einer neuen Antwort. Die Antwort zeigt unter So habe ich es gefunden, wie er das Ergebnis gefunden hat.

- Unter dem Nachrichtenfeld hat eine Leiste die Schaltfläche zum Anhängen, eine Schaltfläche mit dem Modell und dem Aufwand (sie öffnet die Modelle des KI-Tools, die Aufwandsstufen und die Modelle der anderen KI-Tools), die Berechtigung, den Kontextring und Senden. Der Ring folgt der Runde, während das KI-Tool arbeitet.
- Im Modus Ausführen ist die Berechtigung Bearbeiten mit Freigabe, Auto: Änderungen annehmen oder Berechtigungen umgehen. Berechtigungen umgehen überspringt jede Freigabe von Claude Code oder Codex: Shipyard fragt Sie beim ersten Mal in jedem Projekt, zeigt die Einstellung in Rot, solange sie aktiv ist, und lehnt sie in einem schreibgeschützten Projekt und bei ausgeschaltetem Agenten-Schalter ab.
- Tippen Sie `/` am Anfang einer Nachricht, um die Befehle des gewählten KI-Tools aufzulisten. Der Text geht so an das KI-Tool, wie Sie ihn getippt haben.
- Jedes Gespräch hält eine Agenten-Sitzung, sodass eine spätere Nachricht die frühere Arbeit fortsetzt.
- Die geänderten Dateien stehen in der Antwort, jede mit einer Vorschau und Rückgängig. Rückgängig verwirft die Änderungen, die der Assistent an dieser Datei gemacht hat, nach Ihrer Bestätigung. Ohne Rückgängig bleiben die Änderungen.
- Wählen Sie einen Text auf einer Seite, um ihn an den Assistenten zu senden, oder mit An einen Agenten senden an einen Agenten.

## Die Seite Fragen

Der volle Assistent ist die Seite Fragen, unter `/ask`. Den vollen Assistenten öffnen, in der Fragen-Leiste, oder das Seitenfeld öffnet sie. Kleine Leiste geht zurück zum Seitenfeld.

- Die Seite hat drei Spalten: die Gespräche links (ein neues nimmt die erste Zeile Ihrer Nachricht, dann einen kurzen Namen, den das KI-Tool nach seiner ersten Antwort schreibt; Umbenennen behält Ihren eigenen Namen), den Verlauf mit dem Nachrichtenfeld in der Mitte und die Werkzeuge rechts.
- Die Werkzeuge sind Dieser Bildschirm (was der Assistent sehen kann, mit Hinzufügen), Der Assistent darf (Dateien allein ändern, und Befehle allein ausführen für ein KI-Tool, das sie hat) und Bereich (die Seite und die Breite des Seitenfelds).
- Mit Codex als KI-Tool fragt eine Karte: Codex fragt: diesem Ordner vertrauen? Nicht jetzt blendet die Karte für diesen Besuch aus. Diesem Ordner vertrauen fügt den Ordner der Konfigurationsdatei von Codex hinzu. Was das schreibt zeigt die genaue Änderung, und vor Ihrem Klick wird nichts geschrieben.

## Behalten und Rückgängig

Jede Datei, die der Assistent geändert hat, hat Behalten und Rückgängig. Behalten nimmt die Änderung dieser Datei an, und die Datei verlässt die Liste. Rückgängig macht nur diese Datei rückgängig. Alle behalten nimmt jede Datei der Liste an.
