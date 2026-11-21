# Team

Das Team sind die Personen und die Agenten des Projekts. Der Umschalter hat fünf Abschnitte: Team, Rezepte, Sitzungen, Ausgaben und Rechte. Der Schalter Agenten an steht im Kopf von Team: Aus stoppt jeden Agenten und verhindert neue Läufe. Alle Agenten anhalten steht bei Ausgaben: Es stoppt jeden laufenden Agenten und lässt die Agenten an, sodass ein neuer Lauf starten kann.

Team öffnet sich mit den Karten. Personen zeigt jede Person als Karte: die aktuelle Arbeit, die Auslastung, die Rolle, die Tage pro Woche und die Fähigkeiten. Agenten zeigt jede Agenten-Rolle mit ihrer aktuellen Arbeit. Die Seite zeigt auch die Ausgaben für offene Arbeit und die Rezepte.

- Klicken Sie auf Mitglied, um eine Person hinzuzufügen. Klicken Sie auf eine Karte, um die Seite einer Person zu öffnen.
- Geben Sie auf der Seite einer Person den Namen, das Kürzel, die E-Mails und die Konten des Ticketsystems und der Code-Plattform ein. Wählen Sie eine Rolle: Die Rechte der Rolle zeigen sich vor dem Speichern. Setzen Sie Admin für die Personen, die das Team verwalten. Aus dem Team entfernen steht auf derselben Seite.
- Fügen Sie den Admin zuletzt hinzu: Ein Team mit einem Admin gibt die Rechte nur den Personen in der Datei.

## Live

Der Umschalter Karten und Live steht oben in Team. Live zeigt die Agenten bei der Arbeit. Jede Zeile zeigt einen Agenten, sein Feature mit seinem Zustand, und die Dateien und Specs, die der Agent liest und ändert. Der Filter ist Bei der Arbeit, Beendet, Dateien oder Specs. Fahren Sie über einen Agenten, um seine Ref zu sehen. Klicken Sie mit der rechten Maustaste, oder drücken Sie die Kontextmenü-Taste, um die Ref zu kopieren. Klicken Sie auf das Feature, um seine Seite zu öffnen.

## Rezepte

Ein Rezept ist die Liste der Schritte, denen ein Agent bei einem Feature folgt. Rezepte listet die Rezepte und die Rollen der Agenten, jeweils als Karte mit den Namen ihrer Schritte. Klicken Sie auf eine Karte, um sie zu lesen oder zu ändern, dann speichern Sie. Eine fehlerhafte Datei zeigt ihren Fehler und ihre Zeile. Die letzte gute Version läuft weiter.

Ein Rezept öffnet sich in einem Formular. Nutzen Sie Formular und Text, um zwischen dem Formular und dem YAML-Text zu wechseln. Beide bearbeiten dieselbe Datei.

- Die Seite eines Schritts zeigt auch Art (Agent, Person oder Prüfung, vom Schritt), Läuft neben anderen Schritten (an, wenn der Schritt auf keinen Schritt wartet), Unterschritte laufen nebeneinander und Modus. Ein Schritt, der auf eine Person wartet, hat Wer genehmigt: Nur eine Person mit dieser Rolle genehmigt ihn, und nur diese Rolle erhält seine Karte in Heute. Unter Personen ist Darf schreiben Fragt zuerst oder Allein: Allein ist die Freigabe „Für dieses Rezept nicht mehr fragen“.
- Schritte: Jeder Schritt ist eine Karte mit den Gruppen Wer, Personen, Funktionsweise und Limits. Legen Sie die Rolle oder die Aktion, die Modellstufe, den Aufwand, den Modus, die Voraussetzungen, die Werkzeuge und den Prüfschritt jedes Schritts fest. Mehr zeigt die anderen Felder: Arbeitsbereich, für jedes, parallele Kinder, Wiederholungen, Zeitlimit, Budget, Skill, frischer Kontext und Prüfrunden. Fügen Sie einen Schritt hinzu, entfernen Sie ihn und schieben Sie ihn nach oben oder unten.
- Limits: das Stillstands-Zeitlimit in Sekunden. Schalten Sie Budget ein, um jeden Lauf bei einem Betrag in USD zu stoppen, und Rundenlimit, um jeden Lauf nach einer Zahl von Runden zu pausieren. Beide sind standardmäßig aus.
- Das Formular prüft das Rezept bei jeder Änderung. Speichern bleibt aus, solange es ein Problem zeigt.
- Neu legt ein Rezept aus einer Vorlage an: feature, bug, spike, docs-update, review-only, spec-split oder bootstrap. Das Menü Weitere Aktionen des offenen Rezepts hat Duplizieren, Umbenennen und Löschen. Umbenennen und Löschen lehnen das Standardrezept des Projekts und ein Rezept ab, das ein Lauf nutzt. Löschen bittet um Bestätigung.
- Ein Speichern aus dem Formular behält die Kommentarzeilen am Anfang der Datei. Nutzen Sie Text, um andere Kommentare zu behalten.
- Ein externer Agent mit eingeschalteten Rezepte-Werkzeugen (Einrichtung / Dieser Computer, Externe Agenten) kann ein Rezept auflisten, lesen, prüfen und vorschlagen. Ein Vorschlag ändert die Datei nicht: Öffnen Sie das Rezept, lesen Sie den Diff, dann Anwenden oder Verwerfen.
- Schreibt ohne Rückfrage listet die Erlaubnisse eines Rezepts (siehe die Seite Ablauf, Freigaben). Entfernen bittet um Bestätigung, dann speichert es für das ganze Team.

## Sitzungen

Sitzungen listet die Sitzungen der Agenten: einen Lauf, eine Prüfung eines Pull Requests, eine Schätzung und den Bau einer Kachel. Klicken Sie auf eine Sitzung, um sie mit Öffnen und Stoppen zu zeigen. Stoppen eines Laufs fragt nach einer Bestätigung. Stoppen einer Prüfung beendet die Prüfung. Stoppen einer Schätzung beendet den Agenten, und das Blatt behält seine Werte. Stoppen des Baus einer Kachel beendet ihn, und das Dashboard ändert sich nicht. Beendete Sitzungen stehen auf einer eigenen Seite.

Nur lesen zeigt die Live-Ausgabe einer Sitzung, wenn ihr Tool eine Verlaufsdatei schreibt, die Shipyard lesen kann (Claude Code und Codex tun das). Ohne Verlaufsdatei zeigt der Bereich keine Ausgabe. Übernehmen stoppt die Sitzung nach Ihrer Bestätigung und führt den Fortsetzungsbefehl ihres Tools im Shipyard-Terminal aus.

## Ausgaben

Ausgaben zeigt die Tokens und das Geld, die die Agenten verbraucht haben, pro Tag und pro Person, gegenüber den Budgets, und die Erfolgsquote der Läufe.

- Budgets listet jeden festgelegten Betrag, mit eigenem Bearbeiten. Ohne festgelegtes Budget zeigt es das Formular. Klicken Sie auf einen Tag oder ein Mitglied, um das Formular zu füllen.
- Klicken Sie auf einen Lauf, um sein Feature zu öffnen.
- Iterationen zählt die Anfragen, die jeder Lauf an das Modell gesendet hat.
- Die Beträge zeigen sich standardmäßig. Schalten Sie Preise anzeigen aus, um sie zu verbergen: Eine Geld-Kachel zeigt dann die Token-Zahl. Die App merkt sich den Schalter für jedes Projekt.
- Warnen bei ist der Prozentsatz eines Budgets, bei dem die Warnung erscheint. Er beträgt 80 Prozent für das Projekt, bis Sie auf Bearbeiten klicken und einen anderen Prozentsatz von 1 bis 100 setzen.
- Jedes Limit eines Features, eines Tages und einer Person hat eine Wahl Danach: Anhalten und fragen (Standard), Pausieren, Mich fragen oder Weitermachen. Mit den ersten drei stoppt der Lauf bei 100 Prozent. Anhalten und fragen schreibt auch einen Kommentar am Ticket, Mich fragen fragt nur in der App, und Pausieren stoppt ohne Frage. Erhöhen Sie das Budget, um fortzufahren. Weitermachen macht das Budget zu einer reinen Warnung: Der Lauf geht weiter, und die Warnung erscheint einmal. Alle Agenten stoppen, das Leerlauf-Zeitlimit und die höchste Rundenzahl stoppen den Lauf weiterhin.

Wie die Agenten arbeiten zeigt Balken für Prozessor und Speicher nur für die Prozesse der Agenten, nicht für den ganzen Computer. Jeder Schritt eines Runs listet die Tool-Aufrufe des Agenten auf.

## Rechte

Die Teamdatei `.shipyard/team.yaml` listet die Personen des Projekts, ihre Rolle und ihre Rechte. Team bearbeitet die Mitglieder, und Rechte zeigt die Rechte jeder Rolle. Ein Projekt ohne Teamdatei, oder ohne Admin, gibt jeder Person jedes Recht.

### Rollen und Rechte

Jedes Mitglied hat eine Rolle: Product Owner, Projektleitung, Architekt, Tech Lead, Business-Analyst, Entwickler, Tester, Designer oder Leser. Die Rolle gibt die Rechte, die erste Seite und die Felder in Heute (siehe Erste Schritte, Ihre Rolle).

Ein Recht schaltet ein Bedienelement aus. Das Bedienelement bleibt sichtbar, und sein Tooltip nennt das fehlende Recht und Ihre Rolle. Ein Ort oder ein Abschnitt verschwindet nur, wenn das Team Ihrer Rolle keinen Zugriff darauf gibt.

- `work.edit`: Tickets, die Liste, das Board, der Plan, Schätzungen, Zeit.
- `specs.edit`: Spezifikationsänderungen, Spezifikationen, Fragen, Testpläne, Projektregeln.
- `design.edit`: Diagramme, Entscheidungen, API, Daten, Netzwerkflüsse, Bildschirme.
- `knowledge.edit`: Handbuch, Dokumente, Folien, Dashboards.
- `code.write`: Commit, Push, Branch, einen Pull Request öffnen.
- `code.merge`: einen Pull Request zusammenführen.
- `runs.start`: einen Lauf starten, stoppen und fortsetzen.
- `runs.approve`: freigeben, was ein Agent schreiben will, und seinen Plan.
- `plan.edit`: Schätzungen, der Plankalender und das Schreiben eines Plans in das Ticketsystem. Ihre eigenen Zeiteinträge bleiben persönlich und brauchen es nicht.
- `project.settings`: Einrichtung / Dieses Projekt, Automatisierung, Rezepte, Verbindungen, die Teamdatei.
- `costs.view`: Geldbeträge.

Admin gibt jedes Recht. Ein Mitglied kann Abweichungen haben: `+code.merge` fügt ein Recht hinzu, `-runs.approve` entfernt eines. Ihre persönliche Rolle in Einrichtung / Ich und das schreibgeschützte Profil eines Projekts können Rechte nur entfernen.

Code und Merge ist eine Zeile: die Stufe von Code und ein Schalter Merge, die `code.write` und `code.merge` setzen. Die Stufe von Plan einer Rolle folgt ihrer Stufe von Arbeit, bis Sie sie ändern. Jede Rolle hat eine Einstellung Orte: Ein Ort, den Sie ausschalten, ist für diese Rolle ausgeblendet. Jede Rolle beginnt mit den ausgeblendeten Orten des Designs: Ein Product Owner sieht zum Beispiel Code nicht. Die Standardrechte ändern sich nicht.

### Wer Sie sind

Shipyard findet Sie über das Konto einer angemeldeten Verbindung, dann über Ihre git-E-Mail. Rechte zeigt, wen es gefunden hat. Wenn die Teamdatei einen Admin hat und Sie nicht darin stehen, sind Sie Leser: Sie können lesen und nichts ändern. Füllen Sie Beitritt anfragen aus und senden Sie den kopierten Eintrag an einen Admin.

### Die Rechte kommen vom Standard-Branch

Wenn das Projekt ein Remote hat, liest Shipyard die Rechte aus der Teamdatei des Standard-Branches. Eine Änderung in Ihrer Arbeitskopie gibt kein Recht, bis sie zusammengeführt ist. Rechte warnt Sie, solange die beiden sich unterscheiden. Schützen Sie den Standard-Branch auf Ihrer Code-Plattform, und verlangen Sie ein Review für `.shipyard/team.yaml`: Shipyard kann eine Person nicht aufhalten, die Dateien mit einem anderen Werkzeug bearbeitet.

### Die Rollen dieses Rechners übertragen

Wenn dieser Rechner Rollen nach E-Mail hält, bietet Rechte an, sie als Mitglieder zu schreiben. Ein früherer fachlicher Leiter wird Product Owner. Ein früherer Junior wird Entwickler ohne `code.merge` und `runs.approve`. Die Seitenmodi der alten Profile entfallen, und die Liste zeigt jeden von ihnen. Eine Person mit `project.settings` bestätigt.

### Audit

Jeder Schreibvorgang, der ein Recht braucht, und jede Ablehnung fügen dem Audit-Protokoll auf Ihrem Rechner eine Zeile hinzu. Rechte zeigt einer Person mit `project.settings` die letzten 100 Zeilen.

## Seiten

Eine Unterseite hat eine eigene Adresse und einen Zurück-Link, aber keinen Abschnitts-Umschalter.

- Team: `/crew/crew`. Das Menü Mehr enthält Live (`?view=live`) und Person hinzufügen. Eine Person öffnet sich bei `?member=<kürzel>`.
- Rezepte: `/crew/recipes`. Ein Rezept öffnet sich bei `?recipe=<id>` und ein Schritt bei `&step=<id>`. Die Dateien der Agenten-Rollen stehen im Menü Mehr.
- Sitzungen: `/crew/sessions`. Die beendeten Sitzungen stehen bei `?page=ended`.
- Rechte: `/crew/rights`. Die Team-Datei steht bei `?page=team`.
- Ausgaben: `/crew/spend`. Wie die Agenten abschneiden steht bei `?page=how` und Budgets bei `?page=budgets`. Preise zeigen, Limit hinzufügen und die Tabellen der Nutzung (`?page=usage`) stehen im Menü Mehr.

## Beitrittsanfragen

In der Teamdatei erscheint jede Person, die beitreten will, als Karte mit dem Pull Request. Als setzt die Rolle, Ablehnen schließt den Pull Request, und Annehmen schreibt die Rolle in die Teamdatei und führt den Pull Request zusammen. Annehmen braucht das Recht zum Zusammenführen. Annehmen lehnt einen Pull Request ab, der eine andere Datei, eine andere Person oder die Rechte der neuen Person ändert: Es fügt eine Person mit der gewählten Rolle und ohne Admin hinzu.
