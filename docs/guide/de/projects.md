# Projekte

Projekte listet die Projekte auf diesem Computer. Klicken Sie auf den Projektnamen in der oberen Leiste, um die Seite zu öffnen. Sie zeigt das Projekt, das jetzt offen ist, die zuvor geöffneten Projekte mit ihrer Code-Plattform als Badge, und die Wege, eines zu beginnen.

Ohne offenes Projekt zeigt jeder Ort dieselbe Auswahl: Ordner öffnen, Repository klonen und Neues Projekt.

## Ein Projekt öffnen

1. Klicken Sie auf ein Projekt der Liste, um es zu öffnen.
2. Oder klicken Sie auf Ordner öffnen und wählen Sie den Ordner Ihres Projekts. Wenn der Ordner noch kein Projekt ist, klicken Sie auf Zum Projekt machen.
3. Oder klicken Sie auf Repository klonen und geben Sie seine Adresse an.

## Neues Projekt

Klicken Sie auf Neues Projekt auf der Seite Projekte, auf der Seite des ersten Starts oder auf der Seite ohne Projekt. Der Ersteller hat fünf Schritte: Projekt, Auftrag, Team, Remote und Start. Alle Schritte zeigt sie auf einer Seite. Jeder Schritt hat Vorgaben. Erstellen ist ab dem ersten Schritt an, wenn der Name und der übergeordnete Ordner festgelegt sind.

1. Projekt: der Name, der Schlüssel (aus dem Namen, Sie können ihn bearbeiten), der übergeordnete Ordner und der Stack: Node, Rust, Python, Java, Go oder Andere. Der Stack legt die Prüfschritte der Projektdatei und die Ignorier-Regeln von `.gitignore` fest. Der Ordner muss leer oder neu sein: Erstellen lehnt einen Ordner ab, der Dateien enthält.
2. Auftrag: die Vision, die Nutzer und der Umfang, als Text, den Sie bearbeiten. Sie gehen nach `docs/brief.md`. Wählen Sie auch die Doku-Sprache und die Pull-Request-Sprache. Beide sind standardmäßig die Sprache der Oberfläche. Die Agenten schreiben Spezifikationen, Diagramme, Dokumente und Pull-Request-Texte in diesen Sprachen. Code, Bezeichner, Code-Kommentare und Commit-Nachrichten bleiben auf Englisch.
3. Team: Sie sind das erste Mitglied, mit einer Rolle. Fügen Sie Mitglieder mit einem Namen und einer Rolle hinzu oder entfernen Sie sie.
4. Remote: Nur lokal (die Vorgabe), eine vorhandene Remote-Adresse, oder ein neues privates Repository über eine Verbindung zu einer Code-Plattform (GitHub oder GitLab). Ein öffentliches Repository wird nicht angeboten. Wählen Sie auch eine Verbindung zu einem Ticketsystem und ihren Bereich.
5. Start: die Liste der Dateien, die Erstellen schreibt, mit ihrem Text. Nichts wird geschrieben, bevor Sie auf Erstellen klicken. Wählen Sie dann einen Start:
   - Ein Lauf des Rezepts `bootstrap`: ein Plan, der auf Ihre Freigabe wartet, ein Bau, eine Prüfung und ein Pull Request. Er braucht eine Verbindung zu einer Code-Plattform.
   - Start-Tickets: ein Ticket für jede Zeile des Umfangs. Sie sehen, bearbeiten und entfernen jedes zuerst. Sie brauchen eine Verbindung zu einem Ticketsystem. Shipyard legt die Tickets erst an, wenn Sie auf Tickets erstellen klicken, und ein zweiter Klick legt keine Kopie an.
   - Später.

   Die Vorgabe ist der Lauf, wenn er möglich ist, sonst die Tickets, sonst später.

Erstellen legt das Repository an, schreibt die Dateien, macht den ersten Commit und öffnet das Projekt. Für ein neues Repository legt es dann das Repository auf der Code-Plattform an, setzt `origin` und pusht. Wenn die Code-Plattform ablehnt, bleibt das lokale Projekt offen und der Fehler zeigt sich.

## Projekteinstellungen

Einrichtung / Dieses Projekt enthält den Namen und das Logo des Projekts, seine Verbindungen und seinen Zustand. Siehe die Seite Einrichtung.
