# Journal des modifications

## [0.1.0]

### Ajouts

- Squelette de l’application de bureau sur Tauri v2, avec un espace de travail Rust de 10 crates.
- Barre latérale avec les sept espaces et les Réglages, chaque espace avec ses onglets.
- Palette de commandes, panneau d’inspection et barre d’état avec synchronisation et commit.
- Thèmes clair, sombre et système, anglais et français, et un accueil par rôle.
- Système de design avec jetons, composants et une galerie dans la version de développement.
- Premier lancement pour ouvrir un dossier local, cloner un dépôt ou créer un projet, et sélecteur de projet dans la barre latérale avec l’état de chaque copie de travail.
- Réglages / Projet pour les chemins et le workflow par défaut, avec des surcharges par projet du thème, de la densité, du contraste et de la couleur d’accent.
- Réglages / Santé avec une correction pour chaque constat, et un voyant de santé dans la barre d’état.
- Index des références : rétroliens groupés par type dans l’inspecteur, et recherche par référence ou par titre dans la palette de commandes.
- Les préférences, la langue et la dernière vue de chaque projet sont désormais dans le dossier de données de l’application.
- Réglages / Connexions pour ajouter, modifier, tester et supprimer des connexions de trackers et de forges (Jira, GitHub, GitLab, Azure DevOps, Linear), avec les capacités de chaque tracker, des secrets en écriture seule gardés dans le trousseau du système, et la liste des dépôts d’une forge avec un repère sur chaque dépôt où vous ne pouvez pas pousser.
- Espace Code avec Changements (arbre de dossiers, différences indexées et non indexées, indexer, désindexer, abandonner après confirmation, remiser, blocs de conflit), Historique et Branches, un sélecteur de branche de travail dans l’en-tête, une seule action de commit dans la barre d’état, une action de synchronisation qui met à jour la branche de travail, et une notification quand un collègue pousse. Un clonage utilise le jeton enregistré de la connexion de forge qui a le même hôte.
- Réglages / Connexions liste aussi les serveurs MCP (catalogue et personnalisés, démarrer, arrêter, Tout démarrer, état en direct, dépendances manquantes avec une action d’installation), les exécuteurs d’agents détectés sur cette machine, et les fournisseurs de modèles avec un test et une liste de modèles. Les clés et les champs secrets restent en écriture seule. L’application garde les serveurs démarrés ouverts pour les agents grâce à un relais et les arrête quand elle se ferme.
- Centre de notifications avec une cloche dans la barre d’état et des toasts, une notification système pour les événements qui vous attendent quand la fenêtre est en arrière-plan, un menu natif dans votre langue qui lance les mêmes actions que la palette, et une recherche de mise à jour qui vous prévient seulement quand une version plus récente existe. L’adresse des versions se règle dans Réglages / Moi.
- Menus contextuels sur les fichiers, les commits, les références et les connexions, avec les actions de la ligne, au clic secondaire ou au clavier.
- Réglages / Projet peut enregistrer la connexion de tracker et de forge d’un projet dans `.shipyard/project.yaml`, par identifiant seulement.
- Supprimer une connexion liste désormais tous les projets enregistrés qui l’utilisent, et attend la liste. Changer l’hôte d’une connexion efface son secret enregistré. Une correction de santé n’écrit que le contenu que vous avez prévisualisé.
- Travail / Backlog affiche les tickets du tracker du projet depuis un miroir local qu’un cycle garde à jour, avec un import après un décompte, l’adoption par clé et le lien vers une référence locale. L’action de synchronisation de la barre d’état lance désormais un cycle, puis met à jour la branche de travail. Chaque connexion de tracker et de forge affiche son état de synchronisation (au repos, en cours, en échec) avec l’heure du dernier succès, et un échec garde le dernier miroir. Réglages / Projet a un groupe Automatisation pour l’intervalle (30 s au minimum), le filtre de prise en charge, la concurrence, la correspondance des statuts et les quatre écritures autorisées, toutes désactivées par défaut.
- Travail / Backlog regroupe désormais les tickets par statut avec un décompte, filtre par statut, assigné, étiquette et état d’exécution, affiche un repère sur chaque ticket pris par cette machine, et ouvre un ticket dans l’inspecteur. Travail / Tableau affiche une colonne par statut : glissez une carte, ou appuyez sur Maj avec Gauche ou Droite, pour envoyer la transition. Un déplacement refusé remet la carte en place et affiche la raison.
- Travail / Équipe liste les membres de `.shipyard/team.yaml` et les modifie dans l’inspecteur (rôle, capacité, compétences, taux journalier, disponibilité et absences). Un identifiant en double est refusé et la dernière équipe valide reste en place. Un ticket dans l’inspecteur liste les membres classés par compétence et capacité libre, en assigne un d’un clic, et marque le ticket pour l’agent. Un élément qui vous est assigné et marqué apparaît comme éligible à la prise en charge.
- Travail / Estimations affiche une feuille par lot en quatre vues (backlog, synthèse, répartition mensuelle, portefeuille), avec le prix, le coût et la marge calculés à partir des taux journaliers et jamais enregistrés. Modifiez une tâche dans l’inspecteur à côté de l’estimation de son ticket, scellez toutes les feuilles et les taux avec une phrase secrète qui reste en mémoire, et importez ou exportez Excel avec un aperçu qui liste chaque ligne refusée avant tout remplacement.
- Travail / Plan dessine un Gantt à partir d’une feuille, de l’équipe et d’un calendrier de jours ouvrés et de jours fériés, avec un repère d’aujourd’hui. Déplacez une barre au clavier ou au pointeur pour fixer son début, et choisissez un membre ou l’ordre dans l’inspecteur. Seules ces décisions sont enregistrées dans le dépôt, jamais une date calculée.
- Travail / Temps liste les saisies de temps d’un membre et d’un mois par état (à envoyer, dans le suivi, seulement dans le suivi). Ajoutez une saisie avec un jour, une durée et une note, et envoyez-la au journal de travail du tracker d’un clic, avec le choix de réduire le reste à faire. Une réponse perdue n’envoie jamais deux fois : lisez le temps du tracker et gardez le reçu. Un écart de durée est signalé et laissé tel quel.
- Appliquer depuis Travail / Plan montre les epics et les stories à créer ou à mettre à jour, puis les écrit dans le tracker après un clic, avec le résultat de chaque ligne. Une ligne en échec garde les lignes déjà écrites, et une seconde application ne crée aucun doublon. Une référence dans l’inspecteur peut aussi devenir un élément de travail d’un clic.

## [0.0.1]

### Ajouts

- Plan du projet, constitution et premières décisions d’architecture.
