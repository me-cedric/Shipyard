# Einrichtung

Einrichtung enthält die Einstellungen. Jede Einstellung hat einen Platz, in einem von drei Bereichen: Dieses Projekt, Dieser Computer und Ich. Der Umschalter hat vier Abschnitte: Start, Dieses Projekt, Dieser Computer und Ich. Eine Seite, die eine Tür öffnet, hat einen Link zurück zu ihrem Bereich.

## Start

Start ist der geführte Start: jeder Schritt der Liste Erste Schritte, eine Frage nach der anderen. Überspringen geht zum nächsten offenen Schritt. Drei Türen öffnen die Bereiche.

## Dieses Projekt

Dieses Projekt enthält, was das Projekt speichert und mit dem Team teilt. Vier Türen öffnen seine Seiten: Verbindungen, Tickets, Erweiterungen und Zustand dieses Projekts.

Das Projektformular enthält den Namen und das Logo (das Logo zeigt sich in der oberen Leiste), die Ordner des Projekts, das Standardrezept, die Automatisierung und den Projektimport. Selten geänderte Einstellungen stehen unter Erweitert. Dieselbe Seite stellt beiseitegelegte Änderungen (Stashes) wieder her, zeigt, was sie enthalten, und bringt einen Branch, der hinter dem Server liegt, auf den neuesten Stand.

- Automatisierung: Die Schalter lassen die Agenten ohne Klick pushen, einen Pull Request öffnen, ein Ticket verschieben und es kommentieren. Mit einem ausgeschalteten Schalter wartet jeder Schreibvorgang dieser Art auf Ihre Freigabe.
- Erlaubnisse eines Rezepts: „Für dieses Rezept nicht mehr fragen“ an einer Freigabe erlaubt genau die Arten ihrer Wirkungen (zum Beispiel `transition` und `open_pr`) nur für die Läufe dieses Rezepts. Eine andere Art wartet weiterhin. Die Gruppe Automatisierung listet jedes Rezept mit einer Erlaubnis: Entfernen nimmt eine Art mit Speichern weg, und der nächste Schreibvorgang dieser Art wartet wieder auf Sie. Ein Speichern fügt nie eine Erlaubnis hinzu. Ein erzwungener Push wartet immer auf Sie. Die Datei hält sie unter `recipe_writes` in `.shipyard/automation.yaml`. Die Datei ist geteilt: Jedes Teammitglied braucht eine Version von Shipyard, die `recipe_writes` liest, sonst ist die Datei für dieses Teammitglied ungültig und sein Sync stoppt.
- Sprachen: Die Doku-Sprache und die Pull-Request-Sprache legen die Sprache der Spezifikationen, Dokumente und Pull-Request-Texte der Agenten fest. Code und Kommentare bleiben auf Englisch. Eine Änderung gilt nur für den nächsten Agenten-Auftrag und den nächsten Pull Request.
- Agenten-Prüfung jedes Pull Requests: Aus, Entwurf oder Senden. Entwurf hält ein Review zum Lesen und Senden bereit, eines für jeden neuen Head-Commit. Senden fügt von selbst ein Kommentar-Review hinzu und gibt nie frei.
- Das Design des Projekts: Wenn das Projekt ein Design festlegt, hat es Vorrang vor Ihrem eigenen Design.

Die Liste `docs` der Projektdatei sagt, welche Dokumente welchem Code folgen. Jede Regel hat `code` (Pfadmuster) und `feeds` (Doku-Ordner oder -Pfade), und einen optionalen `name`. Ohne die Liste speisen die Spezifikationen die anderen Doku-Ordner.

```yaml
docs:
  - name: crates
    code: ["crates/*/Cargo.toml"]
    feeds: [models]
```

### Verbindungen

Verbindungen verbindet das Projekt mit seinem Ticketsystem und seiner Code-Plattform: Jira, GitHub, GitLab, Azure DevOps und Linear. Klicken Sie auf Hinzufügen, wählen Sie das Produkt, dann fügen Sie ein Token ein. Die App öffnet die Seite, die das Token erstellt. Beim Speichern läuft ein Test. Ein Token geht in den Schlüsselbund Ihres Computers. Die App zeigt es nie wieder.

GitLab-Werkzeuge: Melden Sie sich mit dem Browser bei GitLab an. Der Schalter GitLab-Werkzeuge fügt dann den GitLab-MCP-Server dieser Code-Plattform für den Assistenten hinzu. Er nutzt dieselbe Anmeldung und kein anderes Token. Eine Verbindung, die sich früher angemeldet hat, zeigt einmal Erneut anmelden. Der Server braucht GitLab 18.3 oder neuer und Zugriff auf MCP für Ihre Gruppe oder Ihre Instanz.

### Tickets

Tickets legt fest, welche Verbindung zu einem Ticketsystem und welcher Bereich die Tickets des Projekts liefern.

### Erweiterungen

Erweiterungen enthält den Katalog, die Plugins und die Kindprojekte.

- Katalog: fertige Teile. Klicken Sie auf Bereitstellen, um einen zum Projekt hinzuzufügen.
- Plugins: Ein Plugin ist eine .zip-Datei. Die App liest sie als Daten und listet jede Datei und jede Einstellung. Sie schreibt nur die Elemente, die Sie annehmen. Klicken Sie bei einem installierten Plugin auf Einstellungen, um seine Einstellungen in einem Formular auszufüllen, dann speichern Sie: Die Dateien, die die neuen Werte ändern, zeigen sich in der Prüfung. Um ein Plugin zu schreiben, klicken Sie auf Neues Plugin (es kopiert ein Beispiel und öffnet es als Projekt), bearbeiten Sie es, klicken Sie auf In diesem Projekt testen, um die Prüfung eines Ordners zu sehen, und klicken Sie auf Paketieren, um die .zip-Datei zu erstellen. Ein Fehler in manifest.json zeigt sich mit seiner Zeile; klicken Sie darauf, um diese Zeile zu öffnen. Ein Plugin kann Skills, Regeln, Designs und Sprachen hinzufügen, und kann {{config.<key>}} in Textdateien nutzen. Ein Design geht in die Design-Bibliothek dieses Computers (siehe Designs).
- Kindprojekte: andere Projekte, die dieselben Regeln übernehmen. Klonen Sie ein Kind, dann klicken Sie auf Bereitstellen. Die App legt einen Branch und einen Commit im Klon an. Sie pusht nie.

### Zustand dieses Projekts

Zustand dieses Projekts listet die Probleme des Projekts. Jedes Problem hat eine Schaltfläche, die es behebt. Untersuchen zeigt den Branch und die Änderungen eines verknüpften Projekts.

Alles mit einem Agenten beheben legt eine Funktion in Ablauf mit den Befunden in ihrem Auftrag an, und startet einen Lauf mit dem Budget des Rezepts. Ohne Budget ist die Schaltfläche aus. Das Ticket der Korrektur hat das Label `health-fix`. Der Lauf durchläuft dieselbe Prüfung und dieselben Freigaben wie jede andere Funktion, und Stoppen beendet ihn. Die Befunde zu den Werkzeugen dieses Computers gehören nicht zur Korrektur.

## Dieser Computer

Dieser Computer enthält, was dieser Rechner speichert: die KI-Tools, die Modellanbieter, die MCP-Server, die Zertifikate und die Berechtigungen des Systems mit Tour wiederholen (siehe Erste Schritte, Berechtigungen). Vier Türen öffnen seine Seiten: Agenten und Regeln, Externe Agenten, Zustand dieses Computers und Protokolle und Feedback.

- MCP-Server: die Werkzeuge, die Agenten aufrufen können. Sie sind nach Kategorie gruppiert. Klicken Sie auf Empfohlenen Satz hinzufügen, um die Server einzuschalten, die zum Projekt passen. Klicken Sie bei einem Server auf Testen, oder auf Alle testen, um zu sehen, ob jeder funktioniert und wie viele Werkzeuge er gibt. Jeder Server hat eine Erlaubnisliste: Alle Werkzeuge, Nur Lesen (die Werkzeuge, die der Server als nur lesend markiert, sonst keine) oder Eigene, wo Sie die Werkzeuge anhaken. Ein Werkzeug, das nicht auf der Liste steht, ist vor den Agenten verborgen und wird beim Aufruf abgelehnt.
- Eigener MCP-Server: Wählen Sie Eigene in Hinzufügen, oder fügen Sie das JSON (`mcpServers`) eines Servers in JSON einfügen ein. Ein geheimer Wert geht in den Schlüsselbund, nicht in eine Datei. Ein Geheimnis in den Argumenten wird abgelehnt: Verschieben Sie es in die Variablen.

### Agenten und Regeln

Agenten und Regeln enthält die KI-Tools, die Modellanbieter, und die Regeln und die Skills der Agenten.

1. Klicken Sie auf Vertrag installieren, um die Agenten-Regeln in das Projekt zu schreiben.
2. Wählen Sie unter Ziele, was Sie wollen: zum Beispiel Codequalität oder Spezifikationen zuerst. Klicken Sie auf Anwenden. Die App schaltet die Skills ein, die zum Projekt passen.
3. Unter Externe Skills zeigt jede Quelle ihren Zustand: Aktuell, Update bereit, Bearbeitet oder Nicht in diesem Projekt. Eine Quelle, die Sie für sich installiert haben (Ihre Skill-Ordner oder ein Agenten-Plugin) und die das Projekt nicht enthält, zeigt Auf Ihrem Computer: Installieren fügt sie dem Projekt für das Team hinzu. Klicken Sie auf Externe Skills aktualisieren, um die Updates zu holen. Klicken Sie auf Neu installieren, um die Originaldateien einer Quelle zurückzusetzen.

Die App behält jede Datei, die eine Person geändert hat, außer Sie installieren neu.

### KI-Tools

Die Liste zeigt jedes Coding-Tool, das die App kennt: Claude Code, Codex, GitHub Copilot, OpenCode und Gemini CLI (das Programm `agy` zählt als Gemini CLI). Jede Zeile zeigt den Namen, die Version, den Zustand und eine Aktion.

- Angemeldet: Das Tool ist bereit. Die Zeile hat keine Aktion.
- Abgemeldet: Klicken Sie auf Anmelden. Die Terminal-Schublade öffnet sich und führt die Anmeldung des Tools aus. Schließen Sie im Browser ab. Der Zustand ändert sich, wenn die Anmeldung endet. Für Codex klicken Sie auf Stattdessen einen Code verwenden, um sich mit einem Code anzumelden.
- Nicht geprüft: Copilot, OpenCode und Gemini CLI haben keinen Statusbefehl, den die App lesen kann. Klicken Sie auf Anmelden. Wenn ein Lauf eines dieser Tools fehlschlägt, weil es nicht angemeldet ist, zeigt die Zeile Abgemeldet.
- Nicht installiert: Klicken Sie auf Installieren.

Die App fragt das Tool nach seinem Zustand und liest nie seine Token-Dateien oder seine Einträge im Schlüsselbund.

### KI-Anbieter

Unter den Tools listet eine Zeile jeden Anbieter.

- OpenRouter: Klicken Sie auf Anmelden. Der Browser öffnet sich. Geben Sie dort frei, und die App speichert den Schlüssel im Schlüsselbund. Klicken Sie auf Abbrechen, um das Warten zu beenden. Das Warten endet nach 10 Minuten.
- Ollama, LM Studio, vLLM und LiteLLM: Die App sucht nur auf diesem Rechner. Eine Laufzeit, die antwortet, zeigt eine Zeile mit Hinzufügen. Hinzufügen legt einen Anbieter ohne Schlüssel an.
- OpenAI, Anthropic, Mistral, Google AI Studio und Azure OpenAI: Klicken Sie auf Schlüssel erstellen, um die Schlüsselseite des Anbieters zu öffnen. Klicken Sie auf Schlüssel einfügen, fügen Sie den Schlüssel ein und klicken Sie auf Speichern (oder drücken Sie die Eingabetaste). Die App testet den Schlüssel zuerst. Ein Schlüssel, der fehlschlägt, wird nicht gespeichert, und die Zeile zeigt den Grund und was zu tun ist. Azure OpenAI fragt auch nach der Adresse Ihrer Ressource.

Ein Schlüssel geht nur in den Schlüsselbund. Er geht nie in eine Datei, ein Protokoll oder eine Adresse.

### Externe Agenten

Shipyard kann seine Werkzeuge einem Agenten anbieten, den Sie selbst starten. Schalten Sie den Server ein, wählen Sie die Werkzeuggruppen, dann sehen Sie sich Agenten-Tools an. Es listet Claude Code, Codex, Gemini und VS Code, wenn es sie findet, jeweils als Verbunden, Veraltet oder Nicht verbunden. Klicken Sie auf Verbinden, um die Datei zu sehen, wie sie geschrieben würde. Die Datei ändert sich erst, wenn Sie auf Datei schreiben klicken, und der Rest der Datei bleibt. Nachdem Sie den Port geändert haben, zeigt ein verbundenes Tool Veraltet: Klicken Sie auf Aktualisieren. Die Erlaubnisliste hat zwei Voreinstellungen, Alle Werkzeuge und Nur Lesen, und Sie können Werkzeuge einzeln wählen. Die Skills des Projekts sind MCP-Prompts und die Dateien des Projekts sind MCP-Ressourcen, solange Dateien lesen an ist.

### Zustand dieses Computers

Zustand dieses Computers listet die Probleme der Werkzeuge auf diesem Rechner. Jedes Problem hat eine Schaltfläche, die es behebt. Der Zustands-Link der Statusleiste öffnet den Bereich des schwersten Befunds.

### Protokolle und Feedback

Protokolle und Feedback zeigt die Protokolle der App. In der Mail-App öffnen öffnet Ihre Mail-App mit Ihrem Feedback.

## Ich

Ich enthält Ihre eigenen Einstellungen. Sie gelten in jedem Projekt.

- Design: Hell, Dunkel, OLED, System, „System, OLED bei Dunkel“ oder ein Design, das Sie importiert haben. Design-Dateien importiert ein Design mit einer Vorschau, und exportiert das aktuelle Design; siehe die Seite Designs.
- Dichte, Kontrast, Textgröße und Rolle.
- Sprache: Englisch, Französisch, Deutsch, Spanisch oder eine Sprache, die Sie importiert haben. Sprachdateien importiert eine Sprachdatei: Shipyard listet jeden Fehler, oder zeigt vor Hinzufügen, wie viele Texte sie übersetzt. Englisch exportieren schreibt jeden Text auf Englisch, als Anfang einer neuen Sprache: Ändern Sie den Code, den Namen und die Texte. Ein Text, den eine Sprachdatei nicht übersetzt, zeigt sich auf Englisch, und Nicht übersetzten Text markieren zeigt jeden mit einer Markierung.
- Bewegung: Wie das System oder Reduzieren. Die Einstellung des Systems oder Reduzieren stoppt jede Animation.
- Fokusrahmen: Mit der Tastatur oder Immer, 2 oder 3 px breit. Eine Vorschau daneben zeigt die Wahl sofort.
- Das Element der Menüleiste: an oder aus.
- Eine Rolle ohne Zugriff auf die Einstellungen des Projekts erhält hier die Berechtigungen des Systems und Tour wiederholen.

Benachrichtigungen: Jede Quelle hat ihren eigenen Schalter, standardmäßig an. Die Quellen sind eine Frage, eine Freigabe, ein Lauf, der auf Sie wartet, ein fehlgeschlagener Sync, ein Update, ein verschobener Remote-Branch, ein Lauf, der endet, die Prüfungen Ihrer Pull Requests, ein fehlgeschlagener Scan, den Sie nicht gestartet haben, und ein Entwurf einer Agenten-Prüfung, der zum Senden bereit ist. Ein ausgeschalteter Schalter stoppt den Eintrag in Neuigkeiten und den Hinweis des Systems. Das System zeigt einen Hinweis, solange das Fenster im Hintergrund ist.

### Aussehen und Layout

Aussehen und Layout enthält die Schriften, die Seite der Leiste und der Schubladen, die Akzentfarbe, das Datumsformat, eine schmale obere Leiste und Ihr Bild.
