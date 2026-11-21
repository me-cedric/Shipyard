# Bibliothek

Bibliothek enthält die Seiten, die das Projekt beschreiben: was es tun muss, wie es gebaut ist, warum es so ist, und was das Team lernt und teilt. Jedes Element ist eine Datei des Projekts.

Bibliothek öffnet sich mit vier Türen. Jede Tür nennt, wonach Sie suchen, und enthält einen Chip für jede Seite. Klicken Sie auf einen Chip, um seine Seite zu öffnen. Wenn etwas auf Sie wartet, kommt ein orangefarbener Chip zuerst und nennt die Zahl: die offenen Fragen, oder die Entscheidungen, die warten. Ein Chip markiert eine Seite, deren Quelle sich später geändert hat. Eine Seite, die Ihre Rolle nicht sieht, hat keinen Chip.

Bibliothek hat keinen Umschalter für Abschnitte. Klicken Sie auf jeder Seite von Bibliothek oben auf Bibliothek, um zu den Türen zurückzukehren.

Die Chips Was getestet ist, Antworten und Glossar öffnen die Seite, die sie enthält. Der Chip Lernen zeigt, wie viele Schritte des Pfads Sie beendet haben. Unter den Türen listen die Karten Angeheftet und Zuletzt geöffnet Seiten: Anheften hält eine Seite in Angeheftet, und Lösen entfernt sie. Zuletzt geöffnet behält auch die Elemente mit einer Ref (eine Spec, eine Entscheidung, ein Diagramm, ein Dokument): Jede Zeile zeigt einen Chip für die Art, den Namen und Anheften.

## Ein Element lesen und ändern

1. Öffnen Sie eine Seite, dann wählen Sie ein Element. Oder klicken Sie auf die Hauptaktion der Seite, um eines anzulegen. Wählen Sie ein Element, um im Inspektor die Elemente zu sehen, die es zitieren.
2. Ein Element mit einem Bild öffnet sich nur mit dem Bild. Ein Umschalter oben hat drei Möglichkeiten: Bild, Beide (der Text und das Bild nebeneinander) und Text. Ein Dokument hat Lesen, Beide und Text. Shipyard behält Ihre Wahl. Es zeigt den Text von selbst bei einer neuen Datei, wenn jemand die Datei gleichzeitig geändert hat, und bei einem Fehler, der eine Zeile nennt.
3. Ändern Sie den Text oder die Zeichnung, dann klicken Sie auf Speichern. Die App schreibt die ganze Datei oder nichts.

- Suchen: Die Listen haben ein Feld Suchen. Es nutzt dieselbe Suche wie die Fragen-Leiste.
- Mehr: Das Menü am Ende der Kopfzeile einer Seite enthält die Bedienelemente, die die Seite nicht zeigt: Referenz kopieren, Dateinamen kopieren, Umbenennen, Löschen und einige Filter.
- Löschen: Wählen Sie Löschen im Menü Mehr der Seite, oder öffnen Sie das Menü eines Elements (Rechtsklick) und wählen Sie Löschen. Die App nennt die Datei und fragt einmal. Die Datei geht dann in den Papierkorb.
- Umbenennen: Das Menü Mehr und das Menü des Elements haben Umbenennen. Tippen Sie den neuen Namen; die Endung bleibt. Die Prüfung listet jede Datei und jede Zeile, deren Links sich ändern. Umbenennen verschiebt dann die Datei und schreibt diese Links in einem Schritt um. Wenn ein Schreibvorgang fehlschlägt, bleibt jede Datei, wie sie war.
- Den Assistenten fragen: die letzte Gruppe des Menüs eines Elements. Wählen Sie eine Anfrage für diese Art von Element und Ihre Rolle. Sie füllt das Nachrichtenfeld mit dem Element, seiner Datei, seiner Spezifikation, seinem Ticket und den Elementen, die es zitieren. Nichts wird gesendet, bis Sie es senden.
- Wenn jemand die Datei gleichzeitig ändert, sagt die App es Ihnen. Wählen Sie Neu laden, um seine Version zu nehmen, oder Meine behalten.
- Ein schreibgeschütztes Projekt lehnt das Speichern, das Löschen und das Umbenennen ab.

## Was es tun muss

### Spezifikationen

Spezifikationen listet auf, was das Produkt heute tut. Wählen Sie links eine Spezifikation, um sie rechts zu lesen, mit jeder Anforderung und ihrem Zustand. Daneben stehen die Karten Laufende Änderungen (mit Archivieren für eine fertige Änderung), Verknüpft und Spezifikationen prüfen (Syntax und Links). Der Umschalter Lesen, Text, Dateien hat Bearbeiten. Die Schaltflächen Mit dem Code vergleichen und Spezifikation aus dem Code schreiben schicken eine vorbereitete Anfrage an den Assistenten. Eine Änderung an einer Spezifikation beginnt als Vorschlag: siehe die Seite Ablauf, Liste und Die Funktionsseite, Brief.

### Testpläne

Testpläne öffnet sich mit einem Plan: eine Karte je Szenario, mit seinen Schritten, einem Ergebnis-Chip und Bearbeiten. Daneben stehen die Karten Anforderungen und Andere Testpläne. Szenarien für mich schreiben und Ausführen schicken eine vorbereitete Anfrage an den Assistenten. Ein Plan ohne Szenario öffnet sich in seinem Text. Ein Befund der Prüfung öffnet den Plan in seinem Text, an seiner Zeile.

Was getestet ist öffnet sich über seinen Chip in der Tür Was es tun muss, unter der Adresse `/library/test-plans/coverage`, mit dem Link Testpläne zurück. Es zeigt Filter-Chips, eine Karte je Zustand (zum Beispiel Bestanden) mit ihrer Zahl und ihren Zeilen, die Prüfung der Szenarien, Fehlende Tests schreiben und Tests ausführen.

### Fragen

Fragen ist das Register der offenen Punkte: Risiken, Annahmen, Probleme, Abhängigkeiten und Fragen. Der Titel nennt die Zahl der offenen Elemente. Jedes offene Element ist eine Karte mit einem Antwortfeld und der Schaltfläche Antworten; eine leere Antwort schreibt nichts.

- Eine Reihe von Chips filtert nach Art, und Meine zeigt Ihre eigenen. Die Filter nach Text, Zustand und Verantwortlichem stehen im Menü Mehr. Exportieren steht in der Kopfzeile.
- Klicken Sie auf Neue Frage, um eine hinzuzufügen. Wählen Sie den Verantwortlichen aus dem Team.
- Beantwortete Elemente stehen in einer Karte Geschlossen. Nachdem Sie eine Frage einer Spezifikation beantwortet haben, kopiert Antwort in die Spezifikation einfügen die Antwort in die Spezifikation.

## Wie es gebaut ist

### Karte

Karte zeichnet die Elemente des Projekts in Gruppen, mit den Links zwischen ihnen. Filtern Sie nach Art. Das Menü Mehr enthält die Ansichten Karte, Tabelle und Graph und die Filter Verwaiste und Veraltete.

- Ein Element, das nichts zitiert, zeigt sich als verwaist.
- Ein Element, dessen Quelle sich später geändert hat, zeigt sich als veraltet.
- Wählen Sie ein Element, um es im Inspektor zu öffnen.

Mit der Quelle Code zeigt die Karte die Ordner des Codes. Eine Linie zwischen zwei Ordnern ist dicker, wenn mehr Aufrufe zwischen ihren Dateien laufen. Wählen Sie einen Ordner, um seine Dateien zu sehen, dann eine Datei, um ihre Symbole zu sehen und was sie aufruft oder was sie aufrufen. Alle anzeigen führt zur Karte zurück. Index startet den Code-Index-Server, wenn er aus ist, baut den Index und stoppt den Server wieder. Wenn das Programm mit einem Fehler endet, nennt die Seite das Programm, seinen Exit-Code und seine letzten Zeilen: Beheben Sie die Ursache, dann klicken Sie erneut auf Index. Die Karte des Symbols hat Erklären und Im Editor öffnen, und Spezifikationen und Entscheidungen, die es nutzen öffnet den Inspektor. Verwaiste zeigt die Dateien, die kein Aufruf erreicht oder verlässt. Der Umschalter Wissen und Code steht oben, und Code hat die Adresse `/library/graph?source=code`.

Eine Datei, deren Spec sich nach ihrer letzten Änderung geändert hat, zeigt den Chip Veraltet.

### Architektur

Architektur zeigt die Architekturmodelle des Projekts als Ansichten. Die Ansichten werden aus dem Text des Modells gezeichnet. Chips unter dem Titel wählen das Modell, und Neues Modell fügt eines hinzu. Der Umschalter Bild, Beide, Text, mit Bearbeiten, steht in der Kopfzeile; in Beide ist das Bild links und der Text rechts.

Ein Diagramm oder ein Bild, in Architektur und in Bildschirme, passt sich seinem Rahmen an und steht beim Öffnen in der Mitte. Um es zu bewegen:

- Verschieben: Ziehen Sie es, oder nutzen Sie eine seitliche Geste auf dem Trackpad. Ein senkrechtes Mausrad scrollt die Seite.
- Zoomen: Ziehen Sie zwei Finger auseinander, oder halten Sie Ctrl oder Cmd und drehen Sie das Rad.
- Tastatur: Klicken Sie auf den Rahmen, um ihm den Fokus zu geben, dann drücken Sie die Pfeiltasten zum Verschieben, + oder - zum Zoomen und 0 zum Anpassen.
- Anpassen bringt das ganze Diagramm in den Rahmen zurück.

### Diagramme

Diagramme enthält die Zeichnungen des Projekts: Excalidraw, Mermaid, draw.io und BPMN. Ein Raster oder eine Liste zeigt jedes Diagramm mit seinem Format. Klicken Sie auf ein Diagramm, dann auf Öffnen oder Bearbeiten; Format ändern und Verwendet von stehen auf seiner Karte. Die Schaltfläche Für mich zeichnen schickt eine vorbereitete Anfrage an den Assistenten, und eine Schaltfläche Neu je Format fügt ein Diagramm hinzu. Zeichnen Sie im Editor, dann speichern Sie.

### Bildschirme

Bildschirme zeigt die Bildschirme des Produkts und die Design-Tokens Ihres Projekts. Sie kommen aus dem Design-Dokument (CSS in einem Codeblock), aus einer Datei `tokens.css`, aus einer Datei `*.tokens.json` oder aus einem `@theme`-Block von Tailwind 4, gruppiert nach Datei. Ohne Token sagt die Seite Noch keine Tokens; klicken Sie auf Tokens zum Design-Dokument hinzufügen, bearbeiten Sie den Block, dann speichern Sie. Die Seite zeigt nie die Tokens von Shipyard. Jeder Bildschirm ist eine Karte mit Umgesetzt oder Nicht umgesetzt. Der Umschalter Bildschirme und Tokens zeigt die Tokens. Design in Code öffnet den offenen Bildschirm, sonst den ersten, im Inspektor, wo Plan schreiben steht.

- Eine `.fig`-Datei zeigt die Vorschau, die Figma darin hält.
- Um Figma zu lesen, fügen Sie einmal das Token Ihres Figma-Kontos hinzu. Es geht in den Schlüsselbund Ihres Computers.
- Fügen Sie dann die Adresse eines Figma-Projekts ein und klicken Sie auf Dateien auflisten. Jede Datei zeigt ihre Vorschau und ihre Design-Tokens.

### API

API zeigt die API-Verträge. Öffnen Sie einen Vertrag, um seine Routen zu lesen. Probieren Sie eine Route gegen einen Server des Vertrags aus. Die Liste zeigt die Endpunkte aller Verträge. Ausprobieren: Wählen Sie einen Server, eine Methode und einen Pfad, dann klicken Sie auf Senden; die Antwort erscheint im dunklen Feld darunter.

Die Karte eines Endpunkts verweist auf die Änderung, die den Vertrag zitiert.

### Daten

Daten zeigt die Datenmodelle: die Tabellen und die Links zwischen ihnen. Tabelle finden filtert die Liste. Das Bild markiert Schlüssel und Verknüpfungen, und der Umschalter Bild, Beide, Text zeigt den Text `.dbml`.

### Netzwerkabläufe

Netzwerkabläufe listet die Netzwerkabläufe als Tabelle: von wo, nach wo, der Port und das Protokoll. Fügen Sie eine Zeile hinzu, ändern oder entfernen Sie sie, dann speichern Sie. Jede Zeile hat Von, Nach und Warum. Der Umschalter Abläufe und Bausteine und die Karte Bausteine und Hosts zeigen die anderen Ansichten. Ganze Matrix öffnen öffnet `/library/flows/matrix`: eine Seite mit dem Link Netzwerkabläufe zurück, Filter-Chips, Host finden und einer Zeile je Ablauf (Erlauben oder Verweigern), mit Bearbeiten und Entfernen im Zeilenmenü. Fluss hinzufügen steht im Menü Mehr der Matrix, und Als Text bearbeiten öffnet die Datei.

Mit dem Code abgleichen sucht im Code die Hosts, die er aufruft. Eine Zeile sagt Nicht im Code, wenn kein Code ihren Host aufruft, und eine Karte nennt jeden verweigerten Fluss, den der Code nutzt, mit Anzeigen und Änderung anfragen.

## Warum es so ist

### Entscheidungen

Entscheidungen enthält die Entscheidungsprotokolle (ADRs). Jedes Protokoll nennt eine Entscheidung, die Optionen und die Gründe.

- Klicken Sie auf Neue Entscheidung, um eine zu schreiben. Ein Formular fragt nach jedem Teil.
- Eine vorgeschlagene Entscheidung steht zuerst, mit Wartet auf Sie. Tippen Sie einen Grund, dann klicken Sie auf Annehmen oder Ablehnen; ein leerer Grund wird abgelehnt. Die Karte Verwendet von listet, was die Entscheidung zitiert.

### Projektregeln

Projektregeln zeigt eine nummerierte Karte je Regel, die jede Änderung befolgen muss. Bearbeiten ändert den Text, und Regel hinzufügen fügt am Ende eine an. Die Karte Wer die Regeln ändern kann verweist auf Team / Rechte (Die Rechte ändern), und Wer die Regeln befolgt listet die Agentenrollen auf.

Frühere Versionen listet die Commits auf, die die Datei geändert haben. Lesen zeigt eine alte Version; Wiederherstellen schreibt ihren Text in die Datei und committet nichts, so lässt es sich noch rückgängig machen. Wiederherstellen fragt zuerst und lehnt ab, wenn die Datei Änderungen hat, die in keinem Commit sind.

## Lernen und teilen

### Lernen

Lernen hilft einer neuen Person, sich zurechtzufinden.

- Pfad: eine Karte mit den Schritten in Lesereihenfolge (die Architektur, die Entscheidungen, dann die Spezifikationen). Jeder Schritt hat eine Nummer, seine Art und einen Titel; Beginnen öffnet den nächsten Schritt. Ein Schritt, den Sie öffnen, zählt als erledigt. Ein Balken und N von M zeigen Ihren Fortschritt.
- Glossar: die Wörter, die die Spezifikationen definieren. Ein Begriff öffnet seine Spezifikation.
- Lernpfade: Kurse, Zertifizierungen und Lektüren, mit den Experten des Teams, die helfen können. Wählen Sie eine Person, dann haken Sie die Schritte an, die diese Person beendet hat. Die Fortschrittstabelle des Teams zeigt jede Person und jeden Pfad. Der Fortschritt des Teams steht in der rechten Spalte: eine Zeile je Person, mit einem Balken und N von M.
- Feeds: die Nachrichten-Feeds des Projekts. Fügen Sie die RSS- oder Atom-Adresse einer Website ein, dann klicken Sie auf Abonnieren. Die App liest jeden Feed und hält eine Kopie für eine Stunde.

Experten ist eine Karte mit den Personen der Teamdatei und ihren Themen. Wort hinzufügen schreibt ein Wort und seine Bedeutung in `docs/glossary.md`, und das Glossar liest diese Datei neben den Specs. Ein Schritt kann einen zweiten Chip haben: Lektüre, Kurs oder Zertifizierung.

### Handbuch

Handbuch zeigt links den Seitenbaum, mit Seite finden, und die geöffnete Seite. Seiten, die hierher verweisen listet die Seiten, die sie zitieren, und Einen Agenten bitten, sie zu aktualisieren schickt eine vorbereitete Anfrage an den Assistenten. Wechseln Sie zu Bearbeiten, um eine Seite zu ändern: Der Umschalter Lesen, Beide, Text zeigt die Seite, wie Sie sie lesen, die Seite neben ihrem Text oder nur den Text. Klicken Sie auf Neue Seite, um eine anzulegen. Die Zeile Anleitung, mit F1, öffnet die Anleitung.

Verlauf listet auf einer Seite auf dieselbe Weise die Commits auf, die sie geändert haben, und die Seite nennt, wer sie zuletzt geändert hat.

### Dokumente

Dokumente listet die Dokumente des Projekts, mit einem Chip für das Format. Öffnen Sie eines mit Lesen, Beide oder Text, dann klicken Sie auf Bearbeiten, um es zu ändern. Im Text suchen, Umbenennen und Löschen stehen im Menü Mehr. Die Karte Datei hat Im Ordner zeigen und Exportieren. Die Karte Die Planung kann dieses Dokument nutzen hat In Folien umwandeln und In eine Spezifikation umwandeln: Jedes schickt eine vorbereitete Anfrage an den Assistenten. Exportieren Sie das Architektur-Dossier und die funktionale Dokumentation als Word-Dateien und ein Kundenblatt als Excel-Datei. Jeder Export öffnet einen Dialog Speichern unter mit ausgefülltem Namen und dem Ordner Ihrer letzten Speicherung; Abbrechen exportiert nichts. Nach einer Speicherung funktionieren Im Ordner zeigen und Öffnen für die neue Datei.

Eine Word-Datei hat ein Deckblatt, ein Inhaltsverzeichnis (Word füllt die Seitenzahlen, wenn es fragt, ob die Felder aktualisiert werden sollen), die Mermaid-Diagramme des Projekts als Bilder, und Seitenzahlen. Eine LikeC4- oder draw.io-Datei zeigt sich als Bild, wenn ein PNG mit demselben Namen daneben liegt, und sonst als ihr Pfad. Ein Excel-Blatt hat eine gestaltete Kopfzeile, die auf dem Bildschirm bleibt.

Datei hinzufügen kopiert jede gewählte Datei in den Dokumentenordner. Eine Word-Datei bleibt eine Word-Datei.

### Folien

Folien enthält die Präsentationen des Projekts. Jede Präsentation ist eine HTML-Datei in `docs/slides/`, mit ihren Animationen und ihren Schritten. Die Foliensätze stehen als Karten links, und der geöffnete Satz rechts mit einer Blätterleiste und einem Streifen von Vorschaubildern.

- Neue Präsentation: Tippen Sie einen Namen. Der Assistent öffnet sich mit einer Bitte an einen Agenten, die Präsentation zu schreiben. Lesen Sie die Bitte, dann senden Sie sie.
- Klicken Sie auf eine Präsentation, um sie zu zeigen. Die Pfeiltasten, die Leertaste, Pos1 und Ende führen durch die Folien und die Schritte.
- Präsentieren zeigt die Präsentation im Vollbild. Drücken Sie Escape, um zu stoppen.
- PDF exportieren: Wählen Sie die Datei im Dialog Speichern unter. Jede Folie wird eine Seite. Das funktioniert nur unter macOS.
- Eine ältere, als Text geschriebene Präsentation zeigt sich schreibgeschützt. Klicken Sie auf Umwandeln, um einen Agenten zu bitten, sie als HTML-Präsentation neu zu schreiben.
- Um eine Präsentation zu löschen, öffnen Sie ihr Menü, dann klicken Sie auf Löschen. Die Datei geht in den Papierkorb.

Ein Deck in Markdown hat Bearbeiten, PDF exportieren und Sprechernotizen. Eine Notiz ist ein `Note:`-Block nach einer Folie. PDF exportieren funktioniert nur auf macOS.

### Dashboards

Dashboards zeigt ein Dashboard auf einmal; der Umschalter oben auf der Seite wählt es. Seine Kacheln sind schreibgeschützt. Bearbeiten öffnet die Bearbeitungsseite des Dashboards, Den Bericht exportieren öffnet Berichte, und Ein Dashboard für mich bauen schickt eine vorbereitete Anfrage an den Assistenten. Neues Dashboard steht im Menü Mehr. Mehr Zahlen verweist auf Team / Ausgaben, Ablauf / Zustand und Plan. Die Kacheln, die Sie anheften, stehen oben in Dashboards. Eine Kachel, deren Quelle aus ist, sagt es.

Die Bearbeitungsseite hat die Adresse `/library/dashboards/<Name>/edit`, den Link Dashboards zurück, Umbenennen und Fertig. Kachel hinzufügen zeigt einen Chip je Kachelart. Jede Kachel hat einen Ziehgriff, Einstellungen und Entfernen; Nach links, Nach rechts und die Größe stehen in Einstellungen. Als Tabelle zeigen gibt die Zahlen hinter einem Diagramm.

Kachel für mich bauen bittet einen Agenten, aus Ihren Worten eine Kachel vorzuschlagen. Sie müssen die Arten von Kacheln nicht kennen.

1. Öffnen Sie die Bearbeitungsseite des Dashboards (Bearbeiten), dann klicken Sie auf Kachel für mich bauen, neben Kachel hinzufügen.
2. Tippen Sie in einfachen Worten, was die Kachel zeigen soll. Zum Beispiel: die offenen Fragen pro Verantwortlichem.
3. Budget (USD) ist das Limit des Agenten: Der Agent stoppt beim Budget, oder nach 2 Minuten. Seine letzte Antwort kann das Budget leicht überschreiten. Das Budget beginnt bei 2 Dollar. Weniger Budget und Mehr Budget ändern es um 1 Dollar.
4. Klicken Sie auf Bauen. Während der Agent arbeitet, beendet Stoppen ihn. Die Arbeit zeigt sich auch in Team / Sitzungen, und ihr Stoppen tut dasselbe.
5. Sehen Sie sich die Vorgeschlagene Kachel an. Annehmen fügt sie dem Dashboard hinzu und speichert. Verwerfen lässt sie fallen.

Der Agent liest das Projekt nur. Das Dashboard ändert sich nicht, bis Sie auf Annehmen klicken. Wenn die Seite sagt, dass das Budget aufgebraucht ist, fügen Sie Budget hinzu, dann klicken Sie erneut auf Bauen. Ein Dashboard, das Sie nicht ändern können, hat kein Kachel für mich bauen.

Jede Kachel hat ein Diagramm: Zahl, Balken, Linie, Liste, Flussstufen, Ausgaben oder Zustand. Die Art der Daten wählt das erste Diagramm; ändern Sie es im Menü der Kachel. An Heute anheften zeigt auf der Bearbeitungsseite das Dashboard als eine Karte auf Heute. Eine Releaseauswahl neben Bearbeiten behält in den Kacheln des Ticketsystems nur die Tickets des Releases.

### Berichte

Berichte listet jede Datei, die Shipyard für eine Person erstellen kann, die Shipyard nicht nutzt: einen Kunden, eine Führungskraft, einen Prüfer. Jeder Bericht ist eine Kachel. Format, oben, zeigt Alle Berichte oder nur die Word-Dateien, die Excel-Dateien oder die Bilder. Für Sie geschrieben enthält drei Dokumente, jedes mit Öffnen und Schreiben. Ein Link führt zu Dashboards.

- Exportieren: Shipyard öffnet den Dialog Speichern unter. Wählen Sie den Ordner, dann speichern Sie.
- Formular ausfüllen: Änderungsantrag und Geleistete Arbeit öffnen eine Formularseite (unten), dann schreiben sie die Datei.
- Plan öffnen oder Schätzungen öffnen: Der Bericht braucht eine Wahl, die Sie auf dieser Seite treffen. Der Link öffnet die Seite; exportieren Sie von dort.

Ein Bericht zeigt sich nur, wenn Ihre Rolle die Seite sieht, die seinen Export enthält. Der Bericht Netzwerkabläufe zeigt sich, wenn das Projekt eine Ablaufdatei hat. Wenn kein Bericht übrig ist, hat Berichte keinen Chip. Das Menü Exportieren jeder Seite funktioniert weiterhin.

Eine Formularseite hat die Adresse `/library/reports/change-request` oder `/library/reports/work-done` und den Link Berichte zurück. Füllen Sie die Felder aus (ein Änderungsantrag fragt Von Version, Bis Version und Personen, die freigeben: Hinzufügen zeigt das Team mit einem Kontrollkästchen je Person), dann klicken Sie auf Bericht schreiben. Ein leeres Pflichtfeld gibt eine Fehlerzeile und schreibt nichts. Nach dem Schreiben zeigt die Karte Geschrieben jede Datei mit ihrem Pfad, Im Ordner zeigen und Öffnen. Die Karten rechts listen die anderen Berichte mit Formular, die Berichte ohne Formular (Alle Berichte) und die Teile des vollständigen Dossiers.

Die Formatwahl bietet auch PDF (nur macOS) und Markdown; jeder Textbericht kann als Markdown geschrieben werden. Ein geschriebener Bericht zeigt Datum und Person, Seiten, die auf einen Bericht verweisen listet die Seiten, die ihn zitieren, und Komplettes Dossier fragt Titel, Kunde und Datum, bevor es schreibt.

### Anleitung

Anleitung ist dieser Leitfaden. Öffnen Sie ihn mit Anleitung im Kontomenü, mit F1, mit der Fragen-Leiste oder mit dem Chip Anleitung von Bibliothek. Er kommt mit der App, in der Sprache der Oberfläche, und funktioniert ohne Projekt. Tippen Sie ein Wort in das Suchfeld, um jeden Abschnitt zu finden, der es enthält. Anleitung zu dieser Seite öffnen, in der Fragen-Leiste, öffnet die Seite des Ortes und den Abschnitt, den Sie sehen.

Die Anleitung hat eine Seite für jeden Ort, in der Reihenfolge der Seitenleiste, und sie öffnet mit Start. Jede Seite hat ein Bild. F1 öffnet die Anleitung für jede Rolle, auch für eine Rolle, die Bibliothek nicht sieht: Die Anleitung ist Hilfe. Unter einer Seite setzt Zu dieser Seite fragen eine Frage zur Seite in den Assistenten, Tastenkürzel öffnet die Tastenkürzel, und Handbuch des Projekts öffnet das Handbuch des Projekts.

Ein Link im Text einer Seite, zum Beispiel `adr:0003`, öffnet eine Karte, die ihn erklärt. Die Karte sagt, ob das Element im Projekt ist und womit es verknüpft ist. Öffnen und Mit einem Agenten erklären stehen nebeneinander. Mehr zeigt die anderen Aktionen, und Referenz kopieren kopiert den Namen des Elements.
