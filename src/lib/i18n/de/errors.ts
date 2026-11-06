import type { ActionKind, ErrorCode } from "@/lib/ipc/bindings";

export const errorsDe: Record<Exclude<ErrorCode, "unknown">, string> = {
	no_project: "Öffnen oder erstellen Sie zuerst ein Projekt.",
	no_tracker: "Dieses Projekt hat keine Verbindung zu einem Ticketsystem.",
	scope_missing: "Wählen Sie das Projekt des Ticketsystems, das gelesen werden soll.",
	pickup_off: "Agenten übernehmen kein Ticket: Das Aufnahme-Label ist aus.",
	ticket_not_in_mirror:
		"Dieses Ticket ist noch nicht hier. Synchronisieren Sie und versuchen Sie es erneut.",
	needs_click: "Bestätigen Sie diese Aktion, um fortzufahren.",
	node_missing: "Node fehlt. Agenten-Tools brauchen es.",
	no_package_manager: "Kein Paketmanager gefunden. Installieren Sie das Tool von Hand.",
	no_secret: "Diese Verbindung hat noch kein Token.",
	token_refused: "Das Token wurde abgelehnt. Erstellen Sie ein neues Token.",
	connection_name: "Geben Sie der Verbindung einen Namen mit 1 bis 60 Zeichen.",
	connection_address: "Verwenden Sie eine https-Adresse.",
	secret_invalid: "Das Token ist leer oder zu lang.",
	title_invalid: "Verwenden Sie einen Titel mit mindestens einem Buchstaben oder einer Ziffer.",
	change_id_invalid:
		"Diese Änderungs-ID ist ungültig. Verwenden Sie Kleinbuchstaben, Ziffern und Bindestriche.",
	change_exists: "Eine Änderung mit diesem Titel ist vorhanden. Verwenden Sie einen anderen Titel.",
	run_not_started: "Der Lauf wurde nicht gestartet.",
	run_active: "Für dieses Ticket läuft bereits ein Lauf.",
	merge_draft: "Dieser Pull Request ist ein Entwurf. Markieren Sie ihn zuerst als bereit.",
	merge_closed: "Dieser Pull Request ist nicht offen.",
	merge_method: "Diese Code-Plattform bietet diese Merge-Methode nicht an.",
	forge_unreachable:
		"Der Server hat nicht geantwortet. Prüfen Sie das Netzwerk und versuchen Sie es erneut.",
	cert_untrusted:
		"Die Verbindung ist nicht vertrauenswürdig. Fügen Sie das Zertifikat des Firmen-Proxys hinzu.",
	forge_denied: "Der Server hat das Token abgelehnt. Erstellen Sie ein neues Token.",
	forge_missing:
		"Der Server kennt dieses Element nicht. Prüfen Sie die Adresse und die Rechte des Tokens.",
	git_nothing_staged: "Keine Datei ist vorgemerkt. Merken Sie zuerst eine Datei vor.",
	git_identity: "Git hat keinen Namen und keine E-Mail. Legen Sie user.name und user.email fest.",
	git_busy: "Das Repository ist beschäftigt. Beenden Sie zuerst den Merge oder den Rebase.",
	git_no_upstream: "Dieser Branch ist noch nicht auf dem Server. Pushen Sie ihn zuerst.",
	no_terminal: "Keine Terminal-App gefunden. Wählen Sie eine in den Einstellungen.",
	terminal_gone:
		"Diese Terminal-App ist nicht installiert. Wählen Sie eine andere in den Einstellungen.",
	device_not_set:
		"Die Anmeldung im Browser ist für diesen Host nicht eingerichtet. Verwenden Sie stattdessen ein Token.",
	no_editor:
		"Kein Code-Editor gefunden. Installieren Sie VS Code, Cursor, Zed, JetBrains oder Sublime Text.",
	no_first_commit: "Machen Sie einen ersten Commit, bevor Sie das Projekt veröffentlichen.",
	remote_address: "Verwenden Sie eine https-Adresse ohne Benutzernamen und Passwort.",
	remote_exists: "Dieses Projekt hat schon ein Remote. Ändern Sie es stattdessen.",
	sheet_frozen: "Diese Tabelle ist eingefroren. Tauen Sie sie zuerst auf.",
	feed_invalid:
		"Diese Adresse liefert keinen Nachrichten-Feed. Verwenden Sie die RSS- oder Atom-Adresse der Seite.",
	setting_invalid:
		"Ein Wert passt nicht zu seiner Einstellung. Prüfen Sie die Werte und speichern Sie erneut.",
	gitlab_no_mcp:
		"Diese GitLab-Anmeldung kann die GitLab-Werkzeuge nicht öffnen. Melden Sie sich erneut an.",
	gitlab_address:
		"Die GitLab-Adresse hat sich geändert. Schalten Sie die GitLab-Werkzeuge erneut ein.",
	read_only: "Dieses Projekt ist schreibgeschützt. Ändern Sie sein Profil, um zu bearbeiten.",
	agents_stopped: "Die Agenten sind gestoppt. Schalten Sie sie ein und versuchen Sie es erneut.",
	agent_limit:
		"Zu viele Agenten laufen gerade. Warten Sie, bis einer endet, und versuchen Sie es erneut.",
	budget_spent: "Das Budget ist aufgebraucht. Das Review wartet auf das nächste Budget.",
	head_missing:
		"Dieser Pull Request ist noch nicht auf Ihrem Computer. Rufen Sie seinen Branch ab und versuchen Sie es erneut.",
	no_changes:
		"Dieser Branch hat noch keine Änderungen. Committen Sie welche und versuchen Sie es erneut.",
	review_posted: "Dieses Review wurde schon gesendet.",
	review_running: "Ein Review dieses Pull Requests läuft.",
	figma_no_token: "Fügen Sie zuerst das Token Ihres Figma-Kontos hinzu.",
	branch_diverged:
		"Dieser Branch hat eigene Commits. Führen Sie ihn stattdessen zusammen oder nutzen Sie Rebase.",
	picture_invalid: "Wählen Sie ein PNG- oder JPEG-Bild mit höchstens 1 MB.",
	review_no_result: "Der Agent hat kein Review geliefert. Versuchen Sie es erneut.",
	agent_no_text: "Der Agent hat keinen Text geschrieben. Versuchen Sie es erneut.",
	agent_no_title: "Der Agent hat keinen Titel geschrieben. Versuchen Sie es erneut.",
	review_no_draft: "Dieses Review hat keinen Entwurf. Starten Sie zuerst das Review.",
	review_empty:
		"Das Review hat keinen Text. Schreiben Sie eine Zusammenfassung oder behalten Sie einen Fund.",
	no_base:
		"Dieser Branch hat keine Basis zum Vergleichen. Rufen Sie den Basis-Branch ab und versuchen Sie es erneut.",
	figma_address: "Verwenden Sie die Adresse einer Figma-Datei.",
	no_member: "Sie sind noch nicht im Team. Fügen Sie sich zum Team hinzu.",
	no_account:
		"Kein Konto ist angemeldet. Melden Sie sich zuerst bei Ihrer Code-Plattform oder Ihrem Ticketsystem an.",
	unknown_member: "Diese Person ist nicht im Team. Wählen Sie ein Mitglied des Teams.",
	not_found:
		"Dieses Element existiert nicht mehr. Laden Sie die Seite neu und versuchen Sie es erneut.",
	no_remote: "Dieses Projekt hat kein Remote-Repository. Veröffentlichen Sie es zuerst.",
	secret_found:
		"Dieser Text sieht wie ein Geheimnis aus. Entfernen Sie ihn und versuchen Sie es erneut.",
	file_too_big: "Diese Datei ist zu groß oder keine einfache Datei. Wählen Sie eine andere Datei.",
	file_unsupported: "Diese Datei hat den falschen Typ oder Inhalt. Wählen Sie eine andere Datei.",
	path_invalid:
		"Dieser Pfad funktioniert nicht. Wählen Sie eine andere Datei oder einen anderen Ordner des Projekts.",
	already_exists:
		"Ein Element mit diesem Namen ist schon vorhanden. Verwenden Sie einen anderen Namen.",
	file_changed:
		"Die Datei hat sich auf dem Datenträger geändert. Laden Sie sie neu und versuchen Sie es erneut.",
	no_compass: "Es ist keine Compass-Version festgelegt. Legen Sie zuerst eine fest.",
	tool_missing:
		"Ein benötigtes Programm ist nicht installiert oder wurde nicht gestartet. Prüfen Sie Einstellungen, dann Zustand.",
	tool_failed:
		"Ein Programm ist fehlgeschlagen. Lesen Sie seine Ausgabe und versuchen Sie es erneut.",
	connection_kind: "Diese Verbindung hat eine andere Art. Wählen Sie eine andere Verbindung.",
	sign_in_failed:
		"Die Anmeldung hat nicht funktioniert. Versuchen Sie es erneut oder verwenden Sie ein Token.",
	git_state:
		"Der Branch ist dafür nicht bereit. Prüfen Sie den Branch und versuchen Sie es erneut.",
	thread_state:
		"Diese Unterhaltung kann das jetzt nicht tun. Warten Sie, bis die Runde endet, und versuchen Sie es erneut.",
	stopped: "Das wurde gestoppt. Starten Sie es erneut.",
	import_not_planned: "Es ist kein Import geplant. Lesen Sie zuerst die Quelle.",
	server_off: "Dieser Server ist aus. Schalten Sie ihn zuerst ein.",
	input_invalid:
		"Ein Wert ist leer oder passt nicht. Prüfen Sie die Felder und versuchen Sie es erneut.",
	tracker_unsupported: "Ihr Ticketsystem kann das nicht. Nutzen Sie das Ticketsystem selbst.",
	project_file_invalid:
		"Die Projektdatei ist ungültig. Korrigieren Sie sie in den Projekteinstellungen und versuchen Sie es erneut.",
	doc_not_stale: "Diese Doku ist aktuell. Nichts zu aktualisieren.",
	git_dirty:
		"Sie haben Änderungen, die nicht in einem Commit gespeichert sind. Committen Sie sie oder legen Sie sie in einen Stash und versuchen Sie es erneut.",
};

export const actionsDe: Record<ActionKind, string> = {
	setting: "Einstellungen öffnen",
	sync: "Synchronisieren",
	install: "Installieren",
	create_project: "Projekt erstellen",
	open: "Öffnen",
};
