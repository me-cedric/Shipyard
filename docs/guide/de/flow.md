# Ablauf

Ablauf zeigt jedes Feature einmal, von der Idee bis zum Merge. Ein Feature verbindet ein Ticket des Ticketsystems, eine Spezifikationsänderung, die Arbeit eines Agenten und einen Pull Request. Die App hält eine Kopie der Tickets, sodass Ablauf sich auch ohne Netz öffnet.

Der Umschalter hat vier Abschnitte: Ablauf, Liste, Erledigt und Zustand. Ablauf ist das Board. Es hat fünf Phasen:

| Phase | Was dort steht |
|---|---|
| Idee | Ein Ticket ohne Arbeit, oder eine Spezifikationsänderung, die nur ihren Vorschlag hat. |
| Spezifikation | Eine Spezifikationsänderung in Arbeit, oder ein Lauf, der wartet, plant oder dessen Plan geprüft wird. |
| Bau | Ein Agent arbeitet oder prüft seine eigene Arbeit. Ein fehlgeschlagener oder abgebrochener Lauf bleibt hier, als gestoppt markiert. |
| Prüfung | Der Pull Request ist offen, oder Änderungen sind angefordert. |
| Fertig | Der Pull Request ist zusammengeführt, oder der Lauf ist erledigt. |

Eine Karte zeigt den Titel, wer an dem Feature arbeitet und seinen Zustand. Eine Karte, die auf Sie wartet, hat die Hinweisfarbe. Klicken Sie auf eine Karte, um die Seite des Features zu öffnen. Das Menü einer Karte hat Stoppen, den Verlauf und Verschieben zu einem Status des Ticketsystems. Wenn das Ticketsystem das Verschieben ablehnt, zeigt die Karte den Grund.

Die Leiste über dem Board enthält den Filter Alle, Betrifft mich oder Meine, Neu und Mehr. Der Filter bleibt in der Adresse.

Mehr enthält:

- Feature finden: öffnet das Suchfeld. Finden Sie ein Feature über den Schlüssel seines Tickets oder seinen Titel. Der Text bleibt in der Adresse.
- Von einem Ticket starten: öffnet Neues Feature bei seiner Ticketliste.
- Agenten an: der Agenten-Schalter. Aus stoppt jeden Agenten und verhindert neue Läufe. Schalten Sie ihn wieder ein, um fortzufahren.

## Neues Feature

Neu öffnet eine eigene Seite, mit dem Link Ablauf zurück zum Board und einer Frage: Was möchten Sie bauen?

1. Tippen Sie den Titel.
2. Wählen Sie die Art: Feature, Fehler oder Idee für später. Eine Idee legt nur die Spezifikationsänderung an.
3. Wählen Sie den Weg: Ein Agent schreibt die Spezifikation, Ich schreibe die Spezifikation, oder Sofort bauen, ohne Spezifikation.
4. Klicken Sie auf Erstellen.

Dokument hinzufügen steht neben den Arten. Es nimmt eine Markdown-, PDF- oder Word-Datei bis 20 MiB, und die Seite lehnt eine andere Art ab. Erstellen kopiert jedes Dokument in den Ordner `inputs` der Änderung, als Eingabe für den Spezifikationsautor. Limit steht neben dem Rezept, für die Wege, die ein Ticket anlegen. Es ist der höchste Betrag in Dollar, den alle Läufe des Features ausgeben dürfen. Es steht in `.shipyard/automation.yaml` unter dem Schlüssel des Tickets.

Oder beginnen Sie mit einem Ticket, unter den drei Wegen: Suchen Sie ein Ticket ohne Lauf, dann klicken Sie auf Agent starten. Von einem Ticket starten, unter Mehr bei Ablauf, öffnet sie.

Jeder Weg legt zuerst eine Spezifikationsänderung mit Ihrem Text als Titel an. Ein Weg ist aus, wenn Ihnen das nötige Recht fehlt.

## Liste

Liste zeigt dieselben Features als eine Tabelle: den Titel, die Phase, wer und den Zustand. Sie enthält auch die Bedienelemente der Tickets:

- Die Chips Verantwortlich, Label und Agent filtern die Zeilen. Holen Sie ein Ticket über seinen Schlüssel.
- Unter Mehr: der Filter nach Status und Importieren. Die App zeigt zuerst die Zahl. Sie schreibt nichts vor Ihrer Bestätigung.
- Zuweisen: Wählen Sie eine Person. Die App schlägt eine Person nach Fähigkeiten und freier Zeit vor. Die Wahl liegt bei Ihnen.
- Für den Agenten markieren: Ein Klick gibt das Ticket an die Agenten.
- Neue Änderung, unter Mehr, beginnt eine Spezifikationsänderung. Geben Sie ihr einen einfachen Titel: Die App bildet die Kennung aus dem Titel. Aus einem Ticket legt die Änderung mit dem Titel des Tickets an, setzt den Text des Tickets in den Vorschlag und bringt Sie auf den Branch `specs/<id>`, damit die Änderung vom Code getrennt bleibt.

## Erledigt

Erledigt enthält die fertigen Features und den Verlauf der Läufe: jeden beendeten Lauf und jeden älteren Lauf eines Tickets, das neueste Ende zuerst. Fertiges Feature finden hat ein eigenes Feld bei Erledigt. Mehr fügt Spalten hinzu oder entfernt sie. Klicken Sie auf eine Zeile, um ihr Feature zu öffnen. Der letzte fehlgeschlagene Lauf eines Tickets bleibt auch auf dem Board, mit Erneut versuchen.

## Die Seite eines Features

Jedes Feature hat eine Seite, `/flow/feature/<id>`. Die Kennung ist die Ref eines ihrer Teile: des Tickets, der Spezifikationsänderung, des Laufs oder des Pull Requests. Die Seite zeigt den Titel, die Phasenlinie und einen Umschalter mit sechs Bereichen: Verlauf, Auftrag, Entwurf, Änderungen, Prüfungen und Gespräch. Mehr enthält Im Ticketsystem öffnen, Referenz kopieren und, bei einem gestoppten Feature, Was passiert ist. Zurück führt zu Ablauf mit seiner Suche und seinem Filter, und Escape tut dasselbe. Ein Link zu einem Lauf oder zu einem Pull Request öffnet diese Seite im Bereich dieses Teils.

### Verlauf

Verlauf zeigt zuerst, was auf Sie wartet: die Fragen, die Freigaben, den Plan mit seinen Aktionen, und den Grund, warum ein Agent gestoppt hat, mit seiner einen Aktion. Der Plan in Prüfung ist eine einzige Karte: die Schritte, die Dateien, die der Plan ändert, was der Agent allein tut und was er zuerst fragt. Geben Sie den Plan frei, oder schreiben Sie, was zu ändern ist, und klicken Sie auf Zurücksenden. Dann listet er die Ereignisse in einfachen Sätzen. Was passiert ist öffnet das ganze Protokoll, in dem Wichtig die Fragen, die Fehler, die Zustandswechsel und die Ergebnisse zeigt, und Alle jedes Ereignis zeigt. Anfragen und Sitzungen zeigt die Anfragen mit ihren Kosten, den Graphen des Rezepts und die Sitzungen. Verfolgen zeigt eine laufende Sitzung. Im Terminal öffnen setzt eine beendete Sitzung fort.

Die Ticketseite öffnet sich über Bearbeiten im Menü einer Karte. Sie zeigt das Ticket mit bearbeitbarem Titel und Text, seine Fakten, seine Kommentare und die Markierung des Syncs mit dem Ticketsystem. Zurück führt zum Feature.

Die Seitenspalte zeigt den Agenten (das KI-Tool, das Modell, den Schritt n von m, die Kosten und das Budget, die verstrichene Zeit, mit Sprechen und Stoppen), den Auftrag, die Änderungen und die Personen. Ein Feature ohne Agenten hat Agent starten.

### Auftrag

Auftrag zeigt die Fakten des Tickets und die Spezifikationsänderung des Features als Anforderungskarten, jede mit ihrem Test, und die Tickets des Features. Die Dateien der Änderung öffnen sich auf einer eigenen Seite, mit einem Link zurück zu Auftrag. Ein Formular zeigt jeden Teil der Änderung mit seinem Zustand: fehlt, Entwurf oder fertig. Eine Rohtextansicht gibt es auch. Klicken Sie auf Validieren: Jedes Problem zeigt sich an seinem Teil, mit seiner Zeile. Folgen Sie dem nächsten Schritt, den die App zeigt, zum Beispiel die Arbeit in Tickets aufteilen. Eine Änderung nimmt ihren Titel aus der ersten Überschrift ihres Vorschlags. Die Kennung bleibt der Ordnername. Ein Feature ohne Spezifikation hat Spezifikation schreiben.

### Entwurf

Entwurf listet die Entscheidungen, Diagramme, Bildschirme, API-Verträge und Datenmodelle, die einen Teil des Features zitieren.

### Änderungen

Änderungen zeigt den Pull Request des Features. Die geänderten Dateien öffnen sich auf einer eigenen Seite: Geänderte Dateien, mit dem Dateibaum, der Zahl der gesehenen Dateien und einem Link zurück zu Änderungen.

Der Kopf des Pull Requests zeigt den Titel, den Zustand, den Quell- und den Ziel-Branch und die hinzugefügten und entfernten Zeilen. Das Menü neben dem Zustand öffnet den Pull Request im Browser, kopiert seine Ref und schließt ihn. Ein Entwurf hat Als bereit markieren.

Die Merge-Box sagt in einer Zeile, ob der Pull Request zusammengeführt werden kann, und warum nicht. Drei Segmente folgen: die Prüfungen (bestanden, fehlgeschlagen und ausstehend), die Kommentare (die ungelösten Threads von allen) und die Freigaben (die Prüfer, die freigegeben haben, mit dem Urteil eines jeden). Die Schaltfläche Zusammenführen ist geteilt. Klicken Sie auf Zusammenführen, dann bestätigen Sie. Die Bestätigung nennt die Merge-Methode und hat Abbrechen. Der Pfeil öffnet die Methoden (Merge, Squash, Rebase), wenn die Code-Plattform mehr als eine anbietet. Zusammenführen ist aus, wenn der Pull Request ein Entwurf, geschlossen oder zusammengeführt ist, wenn Ihnen das Recht zum Zusammenführen fehlt, oder wenn die Code-Plattform es blockiert. Fehlgeschlagene Prüfungen oder angeforderte Änderungen schalten Zusammenführen nicht aus: Die Bestätigung nennt dann dieses Risiko.

Die schmale Spalte zeigt die Prüfer mit ihren Urteilen, die verknüpften Tickets und Läufe, und die Elemente, die den Pull Request zitieren.

Dateien: Jede Datei beginnt eingeklappt, mit ihrem Pfad, ihrem Status und ihren hinzugefügten und entfernten Zeilen. Klicken Sie auf eine Datei, um ihren Diff zu lesen. Der Baum links hat einen Filter. Alle ausklappen öffnet die ersten 30 Dateien, die zum Filter passen, dann heißt die Aktion „Nächste 30 ausklappen“. Haken Sie das Kästchen einer Datei an, um sie als gesehen zu markieren. Die Zahl der gesehenen Dateien bleibt auf diesem Computer, für diesen Pull Request und diesen Head-Commit.

Kommentare an Zeilen: Das „+“ am Rand einer Zeile fügt dieser Zeile einen Kommentar hinzu. Es zeigt sich an Zeilen, die der Pull Request hinzugefügt oder unverändert gelassen hat, nie an entfernten Zeilen. Zum Review hinzufügen fügt den Kommentar Ihrem ausstehenden Review hinzu. Einzelnen Kommentar senden sendet ihn sofort. Das ausstehende Review bleibt auf diesem Computer, bis Sie es senden oder verwerfen, und es übersteht einen Neustart. Review senden öffnet einen Dialog: Wählen Sie Kommentieren, Freigeben oder Änderungen anfordern. Änderungen anfordern braucht einen Review-Text. Ein Review nimmt höchstens 100 Kommentare.

Ein Kommentar, den die Code-Plattform nicht an einer Zeile platzieren kann, geht in den Text des Reviews, und ein Hinweis sagt, wie viele. Wenn die Code-Plattform nur einen Teil des Reviews sendet, behält die Seite die anderen Kommentare als ausstehend. Azure DevOps setzt jeden Kommentar in den Text des Reviews, mit Datei und Zeile. Antworten, Lösen, das „+“, Review senden und Kommentieren brauchen das Recht, auf die Code-Plattform zu schreiben. Ohne es ist jedes Bedienelement aus und sagt, warum.

Grenzen: GitHub und GitLab listen bis zu 3000 Dateien. Ein Thread zeigt seine letzten 50 Kommentare. Review-Threads von GitLab zeigen die ersten 100. Die App speichert den Autor eines Pull Requests nicht.

Prüfung durch einen Agenten:

1. Klicken Sie auf Mit einem Agenten prüfen an einem offenen Pull Request. Ein Agent liest die Änderungen am Head-Commit, in einer schreibgeschützten Kopie. Das Review ist ein Entwurf: eine Zusammenfassung, ein Urteil und Befunde an ihren Zeilen des Diffs.
2. Bearbeiten Sie die Zusammenfassung und das Urteil, klicken Sie bei einem Befund, den Sie nicht wollen, auf Verwerfen, dann klicken Sie auf Review senden. Ein Review wird einmal gesendet.
3. Wählen Sie in Einrichtung / Dieses Projekt die Agenten-Prüfung jedes Pull Requests: Aus, Entwurf oder Senden. Senden fügt ein Kommentar-Review hinzu und gibt nie frei.

Eine Agenten-Prüfung zeigt sich in Team / Sitzungen, wo Stoppen sie beendet. Sie zählt im Agenten-Limit und gegen das Budget des Projekts. Ein schreibgeschütztes Projekt lehnt sie ab.

### Prüfungen

Prüfungen zeigt die Prüfschritte des Laufs, die Prüfungen des Pull Requests mit dem CI-Zustand, den Testplan, die Docs, die diese Änderung veralten lässt, und die Zeile Auswirkungen auf anderen Code. Mit einem Agenten beheben bittet einen Agenten, die fehlgeschlagenen Prüfungen zu beheben.

### Gespräch

Gespräch hat neben dem Nachrichtenfeld eine Schaltfläche +. Sie kopiert eine Datei als Kontext in den Ordner des Laufs: Die nächste Runde des Agenten liest sie. Eine Textdatei darf bis 200 KiB groß sein, ein Bild bis 2 MiB, und das Gespräch sagt, welche Grenze eine größere Datei überschreitet. Pausieren steht auf der Karte Agent, zwischen Sprechen und Stoppen. Der Agent beendet seine Runde, dann ist der Lauf von einer Person pausiert, behält seinen Platz in den Grenzen und wartet auf Fortsetzen. Gespräch zeigt das Gespräch der Agenten-Sitzung (das Live-Terminal und die Anfragen sind unter Für Entwickler), das Gespräch des Pull Requests und die Kommentare des Tickets. Das Gespräch des Pull Requests listet die allgemeinen Kommentare und die Review-Threads in zeitlicher Reihenfolge. Klicken Sie auf Antworten, um auf einen Thread zu antworten, auf Lösen, um ihn zu schließen, und auf Wieder öffnen, um ihn erneut zu öffnen. Das Schreibfeld hat Schreiben und Vorschau. Kommentieren sendet einen allgemeinen Kommentar. An den Agenten zurücksenden zeigt sich bei einem Pull Request, den ein Lauf geöffnet hat.

## Freigaben

Die Freigaben eines Laufs sind eine Frage, die jede Wirkung nennt.

- Die Hauptschaltfläche gibt jede Wirkung frei.
- Schritt für Schritt öffnet die Liste, in der Sie eine einzelne Wirkung freigeben oder ablehnen.
- Noch nicht schiebt die Frage zu Später und entscheidet nichts.
- Für dieses Rezept nicht mehr fragen erlaubt genau die gezeigten Arten von Schreibvorgängen für dieses Rezept. Ein Push, der den Verlauf umschreibt, gehört nie dazu. Ein Schreibvorgang, der schon wartet, behält seine Frage: Die Erlaubnis gilt für die späteren Schreibvorgänge.

Team / Rezepte und Einrichtung / Dieses Projekt listen die Erlaubnisse jedes Rezepts, mit Entfernen.

## Wenn ein Agent stoppt

Ein Lauf behebt zuerst seine eigenen Probleme. Ein blockierender Befund, eine rote Prüfung, ein Konflikt oder ein leerer Branch startet eine Korrekturrunde ohne Klick. Die Runden sind begrenzt: 3 fehlgeschlagene Versuche pro Schritt, 3 Feedback-Runden und 8 Korrekturrunden pro Lauf. Derselbe Fehler zweimal hintereinander stoppt den Lauf sofort.

Dann stoppt der Lauf, und das Feature wartet auf Sie. Die Seite sagt den Zustand in einfachen Worten, die Ursache in einem Satz und was der Lauf versucht hat, mit einer Hauptaktion. Heute und die Fragen-Leiste geben dieselbe Aktion. Der Lauf schreibt denselben Text auch als Kommentar an das Ticket, und das Ticket erhält das Label `shipyard:blocked`.

| Aktion | Wann |
|---|---|
| Antworten | Der Agent hat eine Frage gestellt. |
| Entblocken | Der Lauf ist blockiert. Tippen Sie eine Nachricht: Der Lauf erhält eine weitere Runde und liest sie. |
| Budget hinzufügen | Der Lauf hat sein Budget oder seine Runden verbraucht. Erhöhen Sie das Budget, dann läuft er weiter. |
| Fortsetzen | Der Lauf ist pausiert. |
| Übernehmen | Der Lauf ist blockiert. Er endet als abgebrochen mit dem Grund „Übernommen von“ und Ihrem Namen, der Branch und der Worktree bleiben, das Ticket gehört Ihnen und der Worktree öffnet sich in Ihrem Editor. |
| Anmelden | Der Lauf ist blockiert und sein KI-Werkzeug ist abgemeldet: Die Karte sagt es. Anmelden startet die Anmeldung des Werkzeugs im Terminal; klicken Sie danach auf Entblocken. |
| Erneut versuchen | Der Lauf ist fehlgeschlagen oder wurde abgebrochen. Ein neuer Lauf startet. |
| Als erledigt schließen | Der Lauf hat keine Datei geändert und die Arbeit ist schon da. |

Eine Antwort eines Teammitglieds am Ticket entblockt den Lauf ebenfalls. Solange die Teamdatei keinen Admin nennt, zählt jede Antwort: Nennen Sie bei einem öffentlichen Ticketsystem einen Admin. Eine Pause für das Tagesbudget hat keine Aktion: Sie endet von selbst beim ersten Sync des nächsten Tages. Ein beendeter Lauf startet nicht von selbst neu.

## Zustand

Zustand zeigt den Produktzustand: die Prüfungen des Projekts und die Sicherheitsscanner. Jede Rolle sieht ihn. Eine Person ohne Recht am Code sieht die Prüfschritte mit ihrem Zustand, und Ausführen, Einrichten, das Terminal und Installieren sind aus. Der Titel sagt, wie viele Prüfschritte eine Korrektur brauchen.

Eine Prüfung startet nach Ihrem Klick. Während sie läuft, zeigt die Karte Läuft, die laufende Zeit und die letzten Zeilen der Ausgabe. Sie läuft weiter, wenn Sie die Seite verlassen. Im Terminal öffnen, an einer Prüfung, führt ihren Befehl in der Terminal-Schublade aus. Die Info-Schaltfläche jeder Karte sagt, wonach sie sucht, warum es wichtig ist und was bei einem Fehler zu tun ist. Jeder Befund zeigt seine Datei und seine Zeile.

Die Scanner sind:

- Secrets: Schlüssel und Tokens in den verfolgten Dateien. Setzen Sie `shipyard:allow-secret` auf die Zeile eines Testwerts, oder auf die Zeile davor, um ihn zu überspringen.
- Abhängigkeiten: bekannte Schwachstellen (CVE) in den Lock-Dateien, mit `osv-scanner`. Halten Sie einen geprüften Befund in `.osv-scanner.toml` fest.
- Code: OWASP-Probleme wie Injection, XSS und Remote Code Execution, mit `semgrep`. Setzen Sie `// nosemgrep` auf die Zeile eines geprüften Fehlalarms.
- Skills: unsichere Anweisungen in Agenten-Skills, mit `skillspector`.

Die Software-Stückliste (SBOM) nennt jede Bibliothek, die das Projekt nutzt, mit ihrer Version. Exportieren Sie sie, wenn ein Kunde oder ein Sicherheitsteam fragt, welche Software das Projekt enthält.

Die Aktualität der Doku listet die Dokumente, die dem Code des Branches nicht gefolgt sind, mit der Zahl. Dieselbe Warnung zeigt sich im Commit-Prüfschritt, im Push-Prüfschritt und in der Doku-Kette von Auswirkungen. Jedes veraltete Dokument hat „Mit einem Agenten aktualisieren“. Ein Agenten-Lauf startet erst nach Ihrem Klick, und der Pull Request, den er öffnet, wartet auf Ihre Prüfung. „Bestätigen“ lässt eine Warnung, wie sie ist, mit einem Grund.

## Auswirkungen

Auswirkungen sagt, welche Elemente eine Änderung berührt, und schlägt einen Aktionsplan vor. Die Seite öffnet sich aus den Prüfungen eines Features: Klicken Sie auf Auswirkungen auf anderen Code. Sie zeigt die geänderten Dateien, den Code, der davon abhängt, und die Docs, die veralten. Veraltete Dokumente mit einem Agenten korrigieren startet einen Lauf erst nach Ihrem Klick. Die Seite `/flow/impacts` bleibt. Sie braucht Zugriff auf den Code.

Vollständiger Auswirkungsbericht öffnet den Bericht als Seite: die Größe der Änderung nach Code, Spezifikationen, Dokumenten, Tests und Personen, den Aktionsplan und die Zusammenfassung. Den Bericht neu schreiben macht einen neuen. Frühere Berichte listet die älteren. Den Auftrag kopieren kopiert den Auftrag für einen Agenten.

## Pull Requests

Pull Requests ist eine Seite von Code, mit einem Link zurück zu Code / Jetzt. Sie hat eine Suche, den Filter Alle oder Von mir zu prüfen und Neuer Pull Request. Die offenen kommen zuerst. Die zusammengeführten und geschlossenen sind hinter einer einzigen Schaltfläche. Wählen Sie einen Pull Request, um seine Prüfung zu sehen: die Prüfungen, die angeforderten Änderungen und die Reviewer. Pull Request öffnen öffnet die Seite seines Features.

Neuer Pull Request ist auch eine Seite. Schreiben Sie den Titel und die Beschreibung (Schreib es für mich bittet einen Agenten). Wählen Sie Nach, den Branch, der die Änderung erhält. Stellen Sie Entwurf und Labels ein. Vor dem Senden nennt eine Notiz die nicht übernommenen Dateien, einen Basis-Branch, der voraus ist, und die Docs, die veralten: Zu jedem gehört eine Wahl. Klicken Sie auf Pull Request öffnen.

## Code-Plattform und Tickets

- Im Abschnitt Prüfungen eines Pull Requests bittet Erneut starten die Code-Plattform, die fehlgeschlagenen Prüfungen noch einmal zu starten, und nur diese. Es braucht dasselbe Recht wie ein anderer Schreibzugriff auf die Code-Plattform.
- Bei Neuer Pull Request listet Prüfer die Benutzer der Code-Plattform, und das Öffnen bittet die Code-Plattform, sie hinzuzufügen. Zusammenführen mit setzt die Standardmethode der Schaltfläche Zusammenführen späterer Pull Requests: Es führt nie von selbst zusammen. Nach dem Öffnen behält die Seite Pull Request schließen, und Als bereit markieren für einen Entwurf.
- Jede Zeile eines Pull Requests zeigt den Avatar ihres Autors.
- Im Auswirkungsbericht hat jede Zeile des Aktionsplans ein Kästchen und einen Verantwortlichen. Beides steht in der Berichtsdatei als Markdown-Kästchen und Name. Eine Zeile erzeugt kein Ticket. Zeile hinzufügen beendet die Liste.
- Ein Ticket hat eine Zeile Rezept (das Label `wf:<id>`, das das Rezept wählt) und eine Zeile Release. Ein Release ist die Version des Ticketsystems: die Fix-Version von Jira, der Meilenstein von GitHub und GitLab, die Iteration von Azure DevOps und das Projekt von Linear. Ein Ticket hat ein Release.
