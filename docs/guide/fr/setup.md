# Configuration

Configuration contient les réglages. Chaque réglage a une seule place, dans l'une de trois portées : Ce projet, Cet ordinateur et Moi. Le sélecteur a quatre sections : Démarrage, Ce projet, Cet ordinateur et Moi. Une page qu'une porte ouvre a un lien de retour vers sa portée.

## Démarrage

Démarrage est le démarrage guidé : chaque étape de la liste Pour commencer, une question à la fois. Passer va à la prochaine étape à faire. Trois portes ouvrent les portées.

## Ce projet

Ce projet contient ce que le projet stocke et partage avec l'équipe. Quatre pastilles ouvrent ses pages : Détails, Ce que les agents font seuls, Automatisation et Extensions. Connexions, Tickets et Santé de ce projet s'ouvrent depuis Détails.

Le formulaire du projet contient le nom et le logo (le logo s'affiche à côté du nom du projet, en haut de la barre latérale), les dossiers du projet, la recette par défaut, l'automatisation et l'import du projet. Les réglages rarement changés sont sous Avancé. La même page restaure les changements mis de côté (stashes), montre ce qu'ils contiennent, et met à jour une branche en retard sur le serveur.

- Automatisation : les interrupteurs laissent les agents pousser, ouvrir une pull request, déplacer un ticket et le commenter sans clic. Avec un interrupteur désactivé, chaque écriture de ce type attend votre approbation.
- Permissions d'une recette : « Ne plus demander pour cette recette » sur une approbation permet exactement les types de ses effets (par exemple `transition` et `open_pr`) pour les exécutions de cette recette seulement. Un autre type attend encore. Le groupe Automatisation liste chaque recette qui a une permission : Retirer enlève un type avec Enregistrer, et la prochaine écriture de ce type vous attend à nouveau. Un enregistrement n'ajoute jamais de permission. Un push forcé vous attend toujours. Le fichier les garde sous `recipe_writes` dans `.shipyard/automation.yaml`. Le fichier est partagé : chaque coéquipier a besoin d'une version de Shipyard qui lit `recipe_writes`, sinon le fichier n'est pas valide pour ce coéquipier et sa synchronisation s'arrête.
- Langues : la langue des docs et la langue des pull requests fixent la langue des specs, des documents et du texte des pull requests des agents. Le code et les commentaires restent en anglais. Un changement vaut seulement pour le prochain cahier d'agent et la prochaine pull request.
- Revue par un agent de chaque pull request : Désactivée, Brouillon ou Publication. Brouillon garde une revue à lire et à publier, une pour chaque nouveau commit de tête. Publication ajoute d'elle-même une revue en commentaire et n'approuve jamais.
- Le thème du projet : quand le projet fixe un thème, il l'emporte sur votre propre thème.

La liste `docs` du fichier de projet dit quelles docs suivent quel code. Chaque règle a `code` (des motifs de chemin) et `feeds` (des dossiers ou des chemins de docs), et un `name` facultatif. Sans la liste, les specs alimentent les autres dossiers de docs.

```yaml
docs:
  - name: crates
    code: ["crates/*/Cargo.toml"]
    feeds: [models]
```

### Connexions

Connexions relie le projet à son outil de suivi et à son hébergeur de code : Jira, GitHub, GitLab, Azure DevOps et Linear. Cliquez sur Ajouter, choisissez le produit, puis collez un jeton. L'application ouvre la page qui crée le jeton. Un test s'exécute à l'enregistrement. Un jeton va dans le trousseau de votre ordinateur. L'application ne le montre plus jamais.

Outils GitLab : connectez-vous à GitLab avec le navigateur. L'interrupteur Outils GitLab ajoute alors le serveur MCP GitLab de cet hébergeur de code pour l'assistant. Il utilise la même connexion et aucun autre jeton. Une connexion ouverte auparavant montre une fois Se reconnecter. Le serveur demande GitLab 18.3 ou plus récent et l'accès à MCP pour votre groupe ou votre instance.

### Tickets

Tickets fixe quelle connexion à un outil de suivi et quel périmètre donnent les tickets du projet.

### Extensions

Extensions contient le catalogue, les plugins et les projets enfants.

- Catalogue : des parties prêtes à l'emploi. Cliquez sur Déployer pour en ajouter une au projet.
- Plugins : un plugin est un fichier .zip. L'application le lit comme une donnée et liste chaque fichier et chaque réglage. Elle écrit seulement les éléments que vous acceptez. Cliquez sur Réglages d'un plugin installé pour remplir ses réglages dans un formulaire, puis enregistrez : les fichiers que les nouvelles valeurs changent s'affichent dans la revue. Pour écrire un plugin, cliquez sur Nouveau plugin (il copie un exemple et l'ouvre comme projet), modifiez-le, cliquez sur Essayer dans ce projet pour voir la revue d'un dossier, et cliquez sur Empaqueter pour créer le .zip. Une faute dans manifest.json s'affiche avec sa ligne ; cliquez dessus pour ouvrir cette ligne. Un plugin peut ajouter des compétences, des règles, des thèmes et des langues, et peut utiliser {{config.<key>}} dans les fichiers texte. Un thème va dans la bibliothèque de thèmes de cet ordinateur (voir Thèmes).
- Projets enfants : d'autres projets qui prennent les mêmes règles. Clonez un enfant, puis cliquez sur Déployer. L'application crée une branche et un commit dans le clone. Elle ne pousse jamais.

### Santé de ce projet

Santé de ce projet liste les problèmes du projet. Chaque problème a un bouton qui le corrige. Inspecter montre la branche et les changements d'un projet lié.

Tout corriger avec un agent crée une fonctionnalité dans Flux avec les constats dans son Cahier, et lance une exécution avec le budget de la recette. Sans budget, le bouton est désactivé. Le ticket de la correction a l'étiquette `health-fix`. L'exécution passe la même revue et les mêmes approbations que toute autre fonctionnalité, et Arrêter la termine. Les constats sur les outils de cet ordinateur ne sont pas dans la correction.

## Cet ordinateur

Cet ordinateur contient ce que cette machine stocke : les outils d'IA, les fournisseurs de modèles, les serveurs MCP, les certificats et les autorisations du système avec Revoir la visite (voir Démarrer, Autorisations). Trois pastilles ouvrent ses pages : Outils d'IA et connexions, Modèles et règles et Santé. Partager Shipyard avec d'autres outils et Journaux et retours s'ouvrent depuis des lignes.

- Serveurs MCP : les outils que les agents peuvent appeler. Ils sont groupés par catégorie. Cliquez sur Ajouter l'ensemble recommandé pour activer les serveurs qui conviennent au projet. Cliquez sur Tester sur un serveur, ou sur Tout tester, pour voir si chacun marche et combien d'outils il donne. Chaque serveur a une Liste permise : Tous les outils, Lecture seule (les outils que le serveur marque en lecture seule, sinon aucun) ou Personnalisée, où vous cochez les outils. Un outil hors de la liste est masqué aux agents et refusé à l'appel.
- Serveur MCP personnalisé : choisissez Personnalisé dans Ajouter, ou collez le JSON (`mcpServers`) d'un serveur dans Coller du JSON. Une valeur secrète va dans le trousseau, pas dans un fichier. Un secret dans les arguments est refusé : déplacez-le dans les variables.

### Agents et règles

Agents et règles contient les outils d'IA, les fournisseurs de modèles, et les règles et les compétences des agents.

1. Cliquez sur Installer le contrat pour écrire les règles d'agent dans le projet.
2. Sous Objectifs, choisissez ce que vous voulez : par exemple Qualité du code ou Specs d'abord. Cliquez sur Appliquer. L'application active les compétences qui conviennent au projet.
3. Sous Compétences externes, chaque source montre son état : À jour, Mise à jour prête, Modifiée ou Absente du projet. Une source que vous avez installée pour vous (vos dossiers de compétences ou un plugin d'agent) et que le projet ne contient pas montre Sur votre ordinateur : Installer l'ajoute au projet pour l'équipe. Cliquez sur Actualiser les compétences externes pour prendre les mises à jour. Cliquez sur Réinstaller pour remettre les fichiers d'origine d'une source.

L'application garde chaque fichier qu'une personne a changé, sauf si vous réinstallez.

### Outils d'IA

La liste montre chaque outil de code que l'application connaît : Claude Code, Codex, GitHub Copilot, OpenCode et Gemini CLI (le programme `agy` compte comme Gemini CLI). Chaque ligne montre le nom, la version, l'état et une action.

- Connecté : l'outil est prêt. La ligne n'a pas d'action.
- Déconnecté : cliquez sur Se connecter. Le tiroir du terminal s'ouvre et lance la connexion de l'outil. Terminez dans le navigateur. L'état change quand la connexion se termine. Pour Codex, cliquez sur Utiliser un code à la place pour vous connecter avec un code.
- Non vérifié : Copilot, OpenCode et Gemini CLI n'ont pas de commande d'état que l'application peut lire. Cliquez sur Se connecter. Quand une exécution de l'un de ces outils échoue parce qu'il n'est pas connecté, la ligne montre Déconnecté.
- Non installé : cliquez sur Installer.

L'application demande son état à l'outil et ne lit jamais ses fichiers de jetons ni ses entrées du trousseau.

### Fournisseurs d'IA

Sous les outils, une ligne liste chaque fournisseur.

- OpenRouter : cliquez sur Se connecter. Le navigateur s'ouvre. Approuvez là-bas, et l'application stocke la clé dans le trousseau. Cliquez sur Annuler pour arrêter l'attente. L'attente se termine après 10 minutes.
- Ollama, LM Studio, vLLM et LiteLLM : l'application regarde sur cette machine seulement. Un moteur qui répond montre une ligne avec Ajouter. Ajouter crée un fournisseur sans clé.
- OpenAI, Anthropic, Mistral, Google AI Studio et Azure OpenAI : cliquez sur Obtenir une clé pour ouvrir la page des clés du fournisseur. Cliquez sur Coller la clé, collez la clé et cliquez sur Enregistrer (ou appuyez sur Entrée). L'application teste d'abord la clé. Une clé qui échoue n'est pas stockée, et la ligne montre la raison et quoi faire. Azure OpenAI demande aussi l'adresse de votre ressource.

Une clé va dans le trousseau seulement. Elle ne va jamais dans un fichier, un journal ou une adresse.

### Agents extérieurs

Shipyard peut servir ses outils à un agent que vous lancez vous-même. Activez le serveur, choisissez les groupes d'outils, puis regardez Outils d'agent. Il liste Claude Code, Codex, Gemini et VS Code quand il les trouve, chacun comme Branché, Périmé ou Non branché. Cliquez sur Brancher pour voir le fichier tel qu'il serait écrit. Le fichier change seulement quand vous cliquez sur Écrire le fichier, et le reste du fichier demeure. Après un changement de port, un outil branché montre Périmé : cliquez sur Mettre à jour. La Liste permise a deux préréglages, Tous les outils et Lecture seule, et vous pouvez choisir les outils un par un. Les compétences du projet sont des prompts MCP et les fichiers du projet sont des ressources MCP, tant que Lire les fichiers est activé.

### Santé de cet ordinateur

Santé de cet ordinateur liste les problèmes des outils de cette machine. Chaque problème a un bouton qui le corrige. L'entrée Santé du menu du compte ouvre la portée du constat le plus grave.

### Journaux et retours

Journaux et retours montre les journaux de l'application. Ouvrir dans la messagerie ouvre votre application de messagerie avec vos retours.

## Moi

Moi contient vos propres réglages. Ils valent dans chaque projet.

- Thème : Clair, Sombre, OLED, Système, « Système, OLED en sombre » ou un thème que vous avez importé. Fichiers de thème importe un thème avec un aperçu, et exporte le thème actuel ; voir la page Thèmes.
- Densité, contraste, taille du texte et rôle.
- Langue : anglais, français, allemand, espagnol ou une langue que vous avez importée. Fichiers de langue importe un fichier de langue : Shipyard liste chaque faute, ou montre combien de textes il traduit avant Ajouter. Exporter l'anglais écrit chaque texte en anglais, comme début d'une nouvelle langue : changez le code, le nom et les textes. Un texte qu'un fichier de langue ne traduit pas s'affiche en anglais, et Marquer le texte non traduit montre chacun avec une marque.
- Animations : Comme le système ou Réduire. Le réglage du système ou Réduire arrête chaque animation.
- Anneau de focus : Au clavier ou Toujours, 2 ou 3 px de large. Un aperçu à côté montre le choix tout de suite.
- L'élément de la barre de menus : activé ou désactivé.
- Un rôle sans accès aux réglages du projet a ici les autorisations du système et Revoir la visite.

Notifications : chaque source a son propre interrupteur, activé par défaut. Les sources sont une question, une approbation, une exécution qui vous attend, un échec de synchronisation, une mise à jour, une branche distante déplacée, une exécution qui se termine, les contrôles de vos pull requests, un scan en échec que vous n'avez pas lancé, et un brouillon de revue d'agent prêt à publier. Un interrupteur désactivé arrête l'entrée dans Nouvelles et l'avis du système. Le système montre un avis tant que la fenêtre est en arrière-plan.

### Vues par rôle

Vues par rôle est à l'adresse `/setup/role-views`. Toutes les vues par rôle, sur la page des panneaux d'Aujourd'hui, l'ouvre. Elle montre une carte par rôle : la page sur laquelle le rôle commence (Commence sur Flux, par exemple) et les lieux que le rôle voit. Un lieu que le rôle ne voit pas est barré. La carte de votre rôle a l'étiquette Ma vue, et le rôle de lecteur se nomme Je regarde seulement. Le bouton Droits de chaque rôle ouvre Équipe / Droits, où les droits se règlent. Les cartes sont les mêmes dans chaque projet qui a les mêmes droits.

### Apparence et disposition

Apparence et disposition contient les polices, le côté de la barre et des tiroirs, la couleur d'accent, le format de date et votre image.
