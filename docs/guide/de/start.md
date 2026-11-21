# Erste Schritte

Shipyard hilft einem Team, ein Softwareprojekt auszuliefern: die Features, den Plan, die Personen und die Agenten, die Spezifikationen, den Entwurf und den Code. Alles bleibt in den Dateien des Projekts, sodass das Team es mit git teilt.

## Das Fenster

- Die linke Leiste enthält die sieben Orte: Heute, Ablauf, Plan, Team, Bibliothek, Code und Einrichtung. Diese Anleitung hat eine Seite für jeden Ort.
- Die Abschnitte eines Ortes stehen oben auf der Seite, in einem Umschalter. Bibliothek hat keinen Umschalter: Sie öffnet sich mit vier Türen, und jede ihrer Seiten hat einen Link Bibliothek, der dorthin zurückführt.
- Der Inspektor rechts zeigt das Element, das Sie auswählen.
- Die Seitenleiste enthält auch den Projektnamen oben und Ihr Konto unten.
  - Der Projektname öffnet ein Menü mit Ihren Projekten und der Seite Projekte.
  - Ihr Konto öffnet das Kontomenü, neben der Seitenleiste. Die Kontozeile zeigt Ihren Namen und Ihre Initialen.
- Die obere Zeile jeder Seite enthält die Schaltfläche der Seitenleiste, Zurück und Vorwärts, die Leiste Shipyard fragen oder beauftragen und die Sync-Markierung. Das Fenster hat keine obere Leiste und keine Statusleiste.
  - Die Sync-Markierung zeigt den Zustand des Repositorys. Klicken Sie darauf, um die geänderten Dateien, den Branch, Sync und Commit zu sehen. Siehe die Seite Code, Synchronisieren.
  - Shipyard fragen oder beauftragen ist die eine Leiste für eine Frage, einen Ort und eine Aktion. Siehe die Seite Die Fragen-Leiste.
  - Das Kontomenü enthält Ihren Namen und Ihre Rolle mit Ändern (Einrichtung / Ich), Design (Hell, Dunkel, System), Sprache, Anleitung, Tastenkürzel, Neuigkeiten, Tour wiederholen, Nach einem Update suchen, Über Shipyard mit der Version und Zustand. Tastenkürzel und Neuigkeiten öffnen sich als Dialoge.
- Unter 1100 px stehen die Schaltflächen Dateien und Terminal im Menü Mehr.

Das Fenster öffnet sich in der Größe, in der Sie es geschlossen haben. Um die Daten der App neben der App zu halten (zum Beispiel auf einem USB-Stick), legen Sie eine leere Datei namens `portable` neben die App.

## Das Element der Menüleiste

- Ein Klick öffnet ein kleines Feld. Die Kopfzeile nennt das Projekt und den Sync-Zustand (Synchron, oder Synchronisierung fehlgeschlagen). Dann folgen die Dinge, die auf Sie warten (dieselbe Liste wie Heute), In Arbeit mit zwei Läufen, Alle n in seiner Titelzeile für den Rest, jeder mit Stoppen, die Erinnerung an die Zeiterfassung, Agenten mit den Ausgaben von heute und vom Monat und dem Agenten-Schalter, Synchronisieren, und Shipyard öffnen. Die Fußzeile bleibt unten, während die Mitte scrollt.
- Ein Klick öffnet ein kleines Feld: die Ausgaben von heute und des Monats, die aktiven Läufe mit Stoppen, was auf Sie wartet (dieselbe Liste wie in Heute), die Erinnerung an die Zeiterfassung, den Agenten-Schalter, den Sync-Status, das Projekt und Shipyard öffnen.
- Das Feld verlangt für jede schreibende Aktion denselben Klick wie die App.
- Schalten Sie das Element der Menüleiste in Einrichtung, dann Ich, aus.

## Erster Start

Die Seite des ersten Starts erscheint nur beim ersten Start. Sie stellt eine Frage: Welche Rolle passt zu Ihnen? Wählen Sie eine Kachel (Product Owner, Projektleitung, Architekt, Tech Lead, Business-Analyst, Entwickler, Tester, Designer, Leser oder Andere), dann klicken Sie auf Fortfahren. Die Kachel des Lesers sagt „Ich schaue nur“. Öffnen Sie danach ein Projekt, klonen Sie ein Repository oder beginnen Sie ein neues Projekt, oder wählen Sie ein letztes Projekt. Danach, wenn kein Projekt offen ist (zum Beispiel nach Projekt schließen), sagt eine Karte Kein Projekt ist offen, mit Neues Projekt und Projekt öffnen. Siehe die Seite Projekte.

In Heute nennt eine kleine Einrichtungskarte den nächsten Schritt der Liste: Projekt, KI-Tool, Modelle, Ticketsystem, Code-Plattform, Team, Berechtigungen, erste Entscheidung, erste Spezifikation, erstes zugewiesenes Ticket und erster Lauf. Jeder Schritt hat eine Aktion, die den echten nächsten Schritt nennt, etwa Installieren, Anmelden, Wählen oder Verbinden. Fortfahren auf der Karte öffnet Einrichtung / Start, das dieselben Schritte zeigt, eine Frage nach der anderen. In Heute verschwindet die Karte, wenn nichts mehr zu tun ist.

## Die Tour

- Die Tour öffnet sich nicht beim ersten Start. Sie öffnet sich einmal, wenn Sie Ihr erstes Projekt öffnen. Sie hat sechs Schritte: der Kreislauf, ein Projekt öffnen, das Ticketsystem und die Code-Plattform verbinden, das KI-Tool wählen, die Berechtigungen und der erste Lauf auf einem Ticket.
- Klicken Sie auf Weiter und Zurück, oder drücken Sie die Pfeiltasten Links und Rechts. Schließen beendet die Tour bei jedem Schritt. Sie öffnet sich nicht wieder von selbst.
- Um sie erneut zu sehen, wählen Sie Tour wiederholen im Kontomenü oder im Menü Hilfe, oder tippen Sie Tour wiederholen in die Fragen-Leiste, oder gehen Sie zu Einrichtung, dann Dieser Computer, dann Berechtigungen.
- Der letzte Schritt öffnet diese Anleitung.

## Berechtigungen

Shipyard fragt erst nach einer Berechtigung des Systems, wenn Sie auf Erlauben klicken. Die Tour und Einrichtung / Dieser Computer zeigen jede mit ihrem Zustand: An, Aus, Nicht gefragt, Nicht nötig oder Unbekannt.

| Berechtigung | macOS | Windows | Linux |
|---|---|---|---|
| Benachrichtigungen | Erlauben zeigt die Abfrage des Systems. Aus öffnet die Systemeinstellungen. | Test senden, und Systemeinstellungen öffnen. | Test senden. |
| Dokumente, Schreibtisch und Downloads | Erlauben lässt macOS für jeden Ordner fragen. Aus öffnet Datenschutz & Sicherheit / Dateien und Ordner. | Nicht nötig. | Nicht nötig. |

Shipyard fragt nicht nach Festplattenvollzugriff, Kamera, Mikrofon oder Standort. Ein Projekt auf einem Wechsel- oder Netzlaufwerk erhält die Abfrage von macOS, wenn es sich öffnet.

## Ihre Rolle

Wählen Sie in Einrichtung, dann Ich, Ihre Rolle. Die Rolle bestimmt die Seite, die sich zuerst öffnet, und die Felder in Heute. Siehe die Seite Team, Rechte.

| Rolle | Erste Seite |
|---|---|
| Product Owner | Ablauf / Liste |
| Projektleitung | Plan / Zeitplan |
| Architekt | Bibliothek / Entscheidungen |
| Tech Lead | Ablauf |
| Business-Analyst | Bibliothek / Spezifikationen |
| Entwickler | Ablauf |
| Tester | Bibliothek / Testpläne |
| Designer | Bibliothek / Bildschirme |
| Leser (Ich schaue nur) | Heute |

Wenn Ihre Rolle ihre erste Seite nicht sieht, öffnet sich Heute. Ohne Rolle öffnet sich Heute.

## Sich zurechtfinden

- Drücken Sie Ctrl+K (Cmd+K auf einem Mac), um zur Fragen-Leiste zu gehen. Tippen Sie den Namen einer Seite, eines Elements oder einer Aktion, dann nutzen Sie die Pfeiltasten und die Eingabetaste.
- Drücken Sie Ctrl+1 bis Ctrl+7, um zu einem Ort zu gehen.
- Drücken Sie F1, oder wählen Sie Anleitung im Kontomenü, oder wählen Sie Anleitung zu dieser Seite öffnen in der Fragen-Leiste, um die Hilfe zur Seite zu lesen, die Sie sehen. Die Anleitung öffnet sich auf der Seite des Ortes, beim Abschnitt, in dem Sie waren.
- Drücken Sie Ctrl+[ und Ctrl+] (Cmd auf einem Mac), oder klicken Sie auf Zurück und Vorwärts in der oberen Zeile, um zwischen den geöffneten Seiten zu wechseln.
- Klicken Sie auf die Schaltfläche der Seitenleiste am linken Ende der oberen Zeile, um die Seitenleiste aus- oder einzublenden.
- Wählen Sie Terminal oder Dateien in der Leiste Shipyard fragen oder beauftragen, um die Terminal-Schublade oder die Dateien-Schublade zu öffnen oder zu schließen.
- Eine Adresse einer älteren Version funktioniert weiterhin: Sie öffnet die Seite, die dieselbe Funktion heute enthält.
- Wenn ein Fehler eine Schaltfläche hat, die eine Einstellung öffnet, klicken Sie darauf. Die Seite öffnet sich in der genauen Zeile, setzt den Fokus auf ihr Bedienelement und markiert es 2 Sekunden lang.
- Halten Sie Ctrl (Cmd auf einem Mac) und drehen Sie das Mausrad auf einem Diagramm oder einem Bild, um zu zoomen. Ziehen Sie, um es zu verschieben. Nutzen Sie Vollbild für eine große Ansicht.
- Drücken Sie Ctrl+= und Ctrl+-, um die Textgröße zu ändern, und Ctrl+0, um zu 16 px zurückzukehren. Einrichtung / Ich hat dieselbe Auswahl.
- Drücken Sie Ctrl+Shift+K, um alle Tastenkürzel zu sehen.
- Jede Schaltfläche, jedes Feld und jeder Schalter ist 44 px hoch oder höher. Die Seiten funktionieren in einem Fenster von 960 mal 600 px ohne seitliches Scrollen.

## Standardmäßig sicher

- Die App sendet nie eine Änderung an ein Ticketsystem oder eine Code-Plattform ohne Ihren Klick.
- Ein Token geht in den Schlüsselbund Ihres Computers. Die App zeigt es nie wieder.
- Ein Projekt mit einem schreibgeschützten Profil nimmt keine Änderung an.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| Ort | Ein Eintrag der linken Leiste, etwa Ablauf oder Bibliothek. |
| Feature | Eine Sache, die gebaut wird. Ablauf zeigt sie einmal, mit ihrem Ticket, ihrer Spezifikation, der Arbeit des Agenten und ihrem Pull Request. |
| Rezept | Die Schritte, denen ein Agent bei einem Feature folgt: Plan, Arbeit, Prüfung, dann ein Pull Request. |
| Team | Die Personen und die Agenten des Projekts. |
| Ref | Der Kurzname eines Elements, etwa `adr:0003` oder `wi:ACME-12`. Klicken Sie auf eine Ref, um ihr Element zu öffnen. |
| Ticketsystem | Das Werkzeug, das die Tickets hält: Jira, GitHub, GitLab, Azure DevOps oder Linear. |
| Code-Plattform | Der Server, der den Code hält: GitHub oder GitLab. |
| Lauf | Eine Aufgabe eines Agenten auf einem Ticket. |
| Spezifikation | Ein Text, der sagt, was das Produkt tun muss. |
| ADR | Ein Entscheidungsprotokoll: eine Entscheidung, ihre Optionen und ihre Gründe. |
| MCP-Server | Ein Werkzeug, das ein Agent aufrufen kann, etwa Jira oder Figma. |

Fahren Sie mit der Maus über ein markiertes Wort in der Liste Erste Schritte, in der Tour oder auf einer leeren Seite, oder setzen Sie den Tastaturfokus darauf. Ein Satz erklärt es, mit einem Link zur Anleitung. Die markierten Wörter sind Ticketsystem, Code-Plattform, KI-Tool, Modell, Spezifikation, Entscheidung, Lauf und Pull Request.
