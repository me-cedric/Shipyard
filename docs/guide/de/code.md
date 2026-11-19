# Code

Code arbeitet am git-Repository des Projekts. Sie müssen keine git-Befehle kennen: Jede Aktion hat eine Schaltfläche. Der Umschalter hat vier Abschnitte: Jetzt, Verlauf, Branches und Terminal.

## Jetzt

Jetzt zeigt die Dateien für den Commit, dann die Pull Requests.

Die Dateien, die Sie geändert haben, zeigen sich als Baum.

1. Wählen Sie eine Datei, um zu sehen, was sich geändert hat.
2. Merken Sie die Dateien vor, die Sie behalten wollen. Oder verwerfen Sie eine Änderung.
3. Schreiben Sie im Commit-Feld unter den Dateien eine Zusammenfassung, fügen Sie eine Beschreibung hinzu, wenn Sie wollen, dann klicken Sie auf Commit. Ein Commit nimmt nur die vorgemerkten Dateien. Die Commit-Steuerung der Statusleiste tut dasselbe von jeder Seite aus.

- Schreib es für mich bittet den Assistenten um eine Nachricht aus den vorgemerkten Dateien. Nichts wird gesendet, bis Sie es senden.
- Eine Gruppe ohne Dateien zeigt eine gedämpfte Zeile, etwa „Nichts vorgemerkt“.
- Eine umbenannte Datei zeigt sich unter ihrem neuen Pfad, mit dem alten: `alt → neu`. Sie vorzumerken oder ihre Änderung zu verwerfen wirkt auf beide Pfade.
- Wenn zwei Änderungen in denselben Zeilen aufeinandertreffen, zeigt eine Konfliktansicht beide Seiten. Wählen Sie eine, schreiben Sie das Ergebnis, oder übergeben Sie es an einen Agenten.

Die Pull Requests der Code-Plattform kommen danach. Die Liste hat eine Suche und zwei Filter. Alle zeigt jeden Pull Request. Zu prüfen zeigt die offenen Pull Requests, die keine Entwürfe sind, auf ein Review warten und keine angeforderten Änderungen haben. Die offenen Pull Requests zeigen sich zuerst. Die Schaltfläche Zusammengeführt und geschlossen zeigt die beiden anderen Gruppen, jeweils mit ihrer Zahl. Eine Zeile zeigt die Nummer, den Titel, die Entwurfsmarke, den Zustand der Prüfungen und den Zustand des Reviews. Pull Request öffnen beginnt einen neuen: Mit einem Agenten schreiben füllt den Titel und den Text aus den Änderungen des Branches, dem verknüpften Ticket und der verknüpften Spezifikationsänderung, und nichts öffnet sich, bis Sie auf Öffnen klicken.

Klicken Sie auf eine Zeile, um den Pull Request auf der Seite seines Features zu öffnen, Bereich Änderungen (siehe die Seite Ablauf, Die Seite eines Features). Ein bereiter Pull Request zeigt Zusammenführen: Es öffnet diese Seite, auf der Sie das Zusammenführen bestätigen.

Zwei Türen unten öffnen Produktzustand (Ablauf / Zustand) und die Dateien des Projekts.

## Verlauf

Verlauf listet die Commits, den neuesten zuerst. Wählen Sie einen Commit, um seine Dateien und seine Änderungen zu sehen. Jeder Autor zeigt ein Profilbild: von GitHub für eine No-Reply-Adresse von GitHub, sonst von Gravatar, oder die Initialen, wenn es keines gibt. Shipyard sendet Gravatar nur einen Hash der Adresse.

## Branches

Branches listet die Branches auf diesem Computer und auf dem Server. Legen Sie einen Branch an, wechseln Sie zu ihm, führen Sie ihn zusammen oder löschen Sie ihn. Die App löscht nie den Branch, an dem Sie arbeiten.

Die Branch-Auswahl in der oberen Leiste hat ein Filterfeld. Tippen Sie, um die Liste einzugrenzen, bewegen Sie sich mit den Pfeiltasten und drücken Sie die Eingabetaste. Ein Remote-Branch wird als neuer lokaler Branch ausgecheckt, der ihm folgt. Die Zeile Neuer Branch legt einen Branch aus dem Branch an, an dem Sie arbeiten.

## Terminal

Terminal ist eine Befehlszeile im Ordner des Projekts. Die Schaltfläche Terminal in der oberen Leiste öffnet dieselbe Befehlszeile in der Terminal-Schublade, von jeder Seite aus. Wenn die Shell endet, klicken Sie auf Neu starten. Ein Link in der Ausgabe öffnet sich in Ihrem Browser.

## Synchronisieren

Eine Markierung neben dem Branch, in der oberen Leiste jeder Seite, zeigt den Zustand des Repositorys: Sync fehlgeschlagen, die Zahl der geänderten Dateien, Noch nicht geteilt, zurück, voraus oder Synchron. Klicken Sie darauf, um Code / Jetzt zu öffnen.

Synchronisieren holt die Änderungen des Teams und bringt Ihren Branch auf den neuesten Stand. Der Pfeil daneben öffnet Nur abrufen und Push. Ihre Commits an den Server zu senden ist eine eigene Aktion. Die App erzwingt nie einen Push.
