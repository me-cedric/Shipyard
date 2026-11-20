# Projekte

Projekte listet die Projekte auf diesem Computer. Klicken Sie auf den Projektnamen oben in der Seitenleiste, dann auf Projekte, um die Seite zu öffnen. Sie zeigt das offene Projekt als Karte, mit dem, was auf Sie wartet, und den Agenten bei der Arbeit, dann die zuvor geöffneten Projekte unter Zuvor geöffnet.

Die Schaltflächen der Seite sind Projekte importieren (sie öffnet Einrichtung / Dieses Projekt), Ordner öffnen, Von der Code-Plattform klonen und Neues Projekt. Sie können auch einen Ordner auf die Seite ziehen. Eine Karte hat Öffnen, und Schließen für das offene Projekt oder Aus der Liste entfernen für ein anderes. Die Schaltfläche mit drei Punkten Details zeigt den Ordner, die Code-Plattform, den Branch und den letzten Commit des Projekts.

## Ein Projekt öffnen

1. Klicken Sie auf Öffnen auf einer Karte unter Zuvor geöffnet, um dieses Projekt zu öffnen.
2. Oder klicken Sie auf Ordner öffnen und wählen Sie den Ordner Ihres Projekts. Wenn der Ordner noch kein Projekt ist, klicken Sie auf Zum Projekt machen.
3. Oder klicken Sie auf Von der Code-Plattform klonen und geben Sie die Adresse an.

## Neues Projekt

Neues Projekt ist eine eigene Seite unter `/projects/new`. Öffnen Sie sie mit Neues Projekt auf der Seite Projekte, auf der Seite des ersten Starts oder auf der Seite Kein Projekt ist offen. Sie stellt eine Frage nach der anderen, in fünf Schritten: Name, Art des Produkts, Werkzeuge, Team und Bereit. Alle Schritte zeigt die fünf Teile auf einer Seite: Projekt, Auftrag, Team, Wo der Code liegt und Start. Zurück verlässt die Seite oder geht einen Schritt zurück. Jeder Schritt hat Vorgaben. Projekt erstellen ist an, wenn der Name und der übergeordnete Ordner gesetzt sind. Vor Ihrem Klick wird nichts angelegt.

1. Projekt: der Name, der kurze Schlüssel für Tickets (aus dem Namen, Sie können ihn bearbeiten), der übergeordnete Ordner und die Technologie: Node, Rust, Python, Java, Go oder Andere. Die Technologie legt die Prüfschritte der Projektdatei und die Ignorier-Regeln von `.gitignore` fest. Der Ordner muss leer oder neu sein: Projekt erstellen lehnt einen Ordner ab, der Dateien enthält.
2. Auftrag: die Vision, die Nutzer und der Umfang, als Text, den Sie bearbeiten. Sie gehen nach `docs/brief.md`. Wählen Sie auch die Doku-Sprache und die Pull-Request-Sprache. Beide sind standardmäßig die Sprache der Oberfläche. Die Agenten schreiben Spezifikationen, Diagramme, Dokumente und Pull-Request-Texte in diesen Sprachen. Code, Bezeichner, Code-Kommentare und Commit-Nachrichten bleiben auf Englisch.
3. Team: Sie sind das erste Mitglied, mit einer Rolle. Fügen Sie Mitglieder mit einem Namen und einer Rolle hinzu. Entfernen nimmt ein Mitglied heraus; es ist in der ersten Zeile (Sie) ausgeschaltet, mit seinem Grund.
4. Wo der Code liegt: Nur auf diesem Computer (die Vorgabe), eine vorhandene Remote-Adresse, oder ein neues privates Repository über eine Verbindung zu einer Code-Plattform (GitHub oder GitLab). Ein öffentliches Repository wird nicht angeboten. Wählen Sie auch eine Verbindung zu einem Ticketsystem und ihren Bereich.
5. Start: die Liste der Dateien, die Shipyard schreibt, mit ihrem Text. Nichts wird geschrieben, bevor Sie auf Projekt erstellen klicken. Wählen Sie dann einen Start:
   - Agent starten: ein Lauf des Rezepts `bootstrap`, mit einem Plan, der auf Ihre Freigabe wartet, einem Bau, einer Prüfung und einem Pull Request. Er braucht eine Verbindung zu einer Code-Plattform.
   - Tickets erstellen: ein Ticket für jede Zeile des Umfangs. Sie sehen, bearbeiten und entfernen jedes zuerst. Sie brauchen eine Verbindung zu einem Ticketsystem. Shipyard legt die Tickets erst an, wenn Sie auf Tickets erstellen klicken, und ein zweiter Klick legt keine Kopie an.
   - Später.

   Die Vorgabe ist der Agent, wenn er möglich ist, sonst die Tickets, sonst später.

Projekt erstellen legt das Repository an, schreibt die Dateien, macht den ersten Commit und öffnet das Projekt. Das Projekt entsteht am Ende der Schritte, nicht vorher. Für ein neues Repository legt es dann das Repository auf der Code-Plattform an, setzt `origin` und pusht. Wenn die Code-Plattform ablehnt, bleibt das lokale Projekt offen und der Fehler zeigt sich.

## Kein Projekt offen

Wenn Sie das Projekt schließen, oder wenn nach dem ersten Start kein Projekt offen ist, sagt eine Karte Kein Projekt ist offen. Neues Projekt öffnet die Seite des Erstellers. Projekt öffnen öffnet ein Menü: Ihre letzten Projekte, Projekte, Ordner öffnen und Repository klonen. Die Seite des ersten Starts gilt nur für den ersten Start (siehe Erste Schritte, Erster Start).

## Projekteinstellungen

Einrichtung / Dieses Projekt enthält den Namen und das Logo des Projekts, seine Verbindungen und seinen Zustand. Siehe die Seite Einrichtung.
