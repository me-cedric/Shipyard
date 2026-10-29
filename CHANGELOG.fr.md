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

## [0.0.1]

### Ajouts

- Plan du projet, constitution et premières décisions d’architecture.
