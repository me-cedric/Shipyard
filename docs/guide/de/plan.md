# Plan

Plan enthält den Zeitplan, die Auslastung der Personen, die Schätzungen und die Zeit. Der Umschalter hat vier Abschnitte: Zeitplan, Personen, Schätzungen und Zeit. Zeitplan, Personen und Schätzungen teilen ein Schätztabelle: Das Blatt bleibt in der Adresse.

## Zeitplan

Zeitplan zeichnet den Zeitplan eines Loses als Gantt-Diagramm, aus einer Schätztabelle, dem Team und dem Kalender. Der Titel nennt den Tag, an dem das Release endet.

- Termine und freie Tage legt die Arbeitstage und die Feiertage fest.
- Exportieren Sie das Diagramm als Bild.

Wenn eine Person zu viel Arbeit hat, nennt eine Karte das Problem und listet Vorschläge: Eine Aufgabe geht an eine Person derselben Rolle mit Platz, oder sie beginnt später. Anwenden führt einen Vorschlag aus. Ausgleichen führt jeden aus.

## Personen

Personen zeigt jede Person mit der Auslastung gegenüber der Kapazität jeder Woche, die Aufgaben und ihre Termine. Eine Person mit zu viel Arbeit hat dort auch die Vorschläge. An das Ticketsystem senden öffnet zuerst eine Seite mit einer Vorschau: Erstellen, Ändern und Keine Änderung, jeweils mit ihrer Zahl. Nichts geht an das Ticketsystem, bevor Sie auf Anwenden klicken.

## Schätzungen

Schätzungen enthält ein Blatt für jedes Los. Jede Zeile hat eine niedrige, eine wahrscheinliche und eine hohe Schätzung. Die App berechnet den Preis, die Kosten und die Marge aus den Tagessätzen. Ein Umschalter zeigt das Blatt als Backlog, Übersicht, Verteilung, Portfolio oder Kalkulation.

- Duplizieren Sie ein Blatt, benennen Sie es um, frieren Sie es ein oder löschen Sie es, über sein Menü.
- Versiegeln Sie das Projekt mit einer Passphrase, um die Tagessätze in den Dateien zu verbergen.
- Einen Agenten schätzen lassen: Wählen Sie Aufgaben, dann klicken Sie darauf. Der Agent schlägt je einen Wert für Best Case, Wahrscheinlich und Worst Case mit seinen Annahmen vor. Ein Wert kommt erst ins Blatt, wenn Sie auf Annehmen klicken. Verwerfen lässt den Vorschlag fallen. Der Agent zeigt sich in Team / Sitzungen, während er arbeitet. Stoppen beendet ihn, und das Blatt behält seine Werte. Die Aktion ist auf einem versiegelten und auf einem eingefrorenen Blatt aus.

## Zeit

Ein Wochenraster zeigt eine Zeile für jedes Ticket und eine Spalte für jeden Tag. Tippen Sie die Stunden in eine Zelle, um einen Eintrag hinzuzufügen oder zu ändern. Leeren Sie die Zelle, um den Eintrag zu löschen, nach Ihrer Bestätigung. Eine Zelle mit zwei oder mehr Einträgen zeigt die Summe: Ändern Sie sie in der Liste des Monats.

Unter dem Raster listet der Monat die Zeit, die jede Person aufgewendet hat. Die App sendet einen Zeiteintrag erst nach Ihrem Klick an das Ticketsystem.

Klicken Sie auf Den Monat aus dem Ticketsystem lesen, um die Zeiteinträge des Monats neben Ihren Einträgen zu lesen. Das ändert nichts.

Eine Rolle mit weniger als drei Mitgliedern mit einem Tagessatz zeigt keine Kosten. Mit einem oder zwei Sätzen würden Kosten den Satz einer Person zeigen.

Aus meiner Arbeit füllen fügt eine Zeile für jeden Lauf Ihrer Tickets und jeden Commit Ihres Tages hinzu. Es füllt nur Ihre eigene Tabelle. Die Tabelle hat keine Schaltfläche Speichern: Sie speichert, wenn Sie ein Feld verlassen.

## Seiten

Eine Unterseite hat eine eigene Adresse und einen Zurück-Link. Schätzungen hält sein Blatt auch in der Adresse.

- Zeitplan: `/plan/timeline`. Termine und freie Tage stehen bei `?page=dates`.
- Personen: `/plan/people`. An das Ticketsystem senden steht bei `?page=send`.
- Zeit: `/plan/time`.
- Schätzungen: `/plan/estimates`. Die Ansichten sind `?tab=summary` (Blätter) und `?tab=costing`. Eine Schätzung öffnet sich bei `?task=<id>` und der Import aus Excel bei `?page=import`. Suche, Filter, Spalten und die Aktionen des Blatts stehen im Menü Mehr.

## Release und Heute

Die Karte Kalender des Plans hat die Zeile Release mit den Releases des Ticketsystems, die Zeile Schätztabelle und Wechseln zu Heute. Heute öffnet den Zeitplan am aktuellen Tag.
