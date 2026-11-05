# Réglages

Réglages contient les réglages du projet, vos connexions et vos propres choix.

## Projet

Projet contient les dossiers du projet, le workflow par défaut, les interrupteurs d'automatisation et l'import de projet. Les réglages rarement changés sont sous Avancé.

La revue par un agent de chaque pull request est un seul choix : Désactivée, Brouillon ou Publication. Brouillon garde une revue que vous lisez et publiez. Publication ajoute seule une revue en commentaire et n'approuve jamais. Le choix va dans .shipyard/automation.yaml.

## Connexions

Connexions relie l'application à vos outils.

- Outils de suivi des tickets et hébergeurs de code : Jira, GitHub, GitLab, Azure DevOps et Linear. Cliquez sur Ajouter, choisissez le produit, puis collez un jeton. L'application ouvre la page qui crée le jeton. Un test se lance à l'enregistrement.
- Serveurs MCP : les outils que les agents peuvent appeler. Ils sont groupés par catégorie. Cliquez sur Ajouter l'ensemble recommandé pour activer les serveurs qui conviennent au projet. Cliquez sur Tester sur un serveur, ou sur Tout tester, pour voir si chacun fonctionne et combien d'outils il donne.
- Agents extérieurs : Shipyard peut offrir ses outils à un agent que vous lancez vous-même. Activez le serveur, choisissez les groupes d'outils, puis regardez Outils d'agent. La liste montre Claude Code, Codex, Gemini et VS Code quand ils sont trouvés, chacun comme Branché, Périmé ou Non branché. Cliquez sur Brancher pour voir le fichier tel qu'il sera écrit. Le fichier ne change que si vous cliquez sur Écrire le fichier, et le reste du fichier reste. Après un changement de port, un outil branché montre Périmé : cliquez sur Mettre à jour. La Liste permise a deux préréglages, Tous les outils et Lecture seule, et vous pouvez choisir les outils un à un. Les skills du projet sont des prompts MCP et les fichiers du projet des ressources MCP, tant que Lire les fichiers est actif.
- Serveur MCP personnalisé : choisissez Personnalisé dans Ajouter, ou collez le JSON (`mcpServers`) d'un serveur dans Coller du JSON. Une valeur secrète va dans le trousseau, pas dans un fichier. Un secret dans les arguments est refusé : mettez-le dans les variables.
- Exécuteurs d'agents et fournisseurs de modèles : les programmes d'agent de cet ordinateur et les services de modèles.

- Outils GitLab : connectez-vous à GitLab avec le navigateur. L'interrupteur Outils GitLab ajoute ensuite le serveur MCP GitLab de cet hébergeur de code pour l'assistant. Il utilise la même connexion et aucun autre jeton. Une connexion faite avant montre une fois Se reconnecter. Le serveur demande GitLab 18.3 ou plus récent, et l'accès à MCP pour votre groupe ou votre instance.

Un jeton va dans le trousseau de votre ordinateur. L'application ne le montre plus jamais.

## Agents et règles

Agents et règles contient les règles et les compétences des agents, venues du compass.

1. Cliquez sur Installer le contrat pour écrire les règles d'agent dans le projet.
2. Sous Objectifs, choisissez ce que vous voulez : par exemple Qualité du code ou Spécifications d'abord. Cliquez sur Appliquer. L'application active les compétences qui conviennent au projet.
3. Sous Compétences externes, chaque source montre son état : À jour, Mise à jour prête ou Modifiée. Cliquez sur Actualiser les compétences externes pour prendre les mises à jour. Cliquez sur Réinstaller pour remettre les fichiers d'origine d'une source.

L'application garde chaque fichier qu'une personne a changé, sauf si vous réinstallez.

## Extensions

Extensions contient le catalogue, les plugins et les projets enfants.

- Catalogue : des éléments prêts à l'emploi. Cliquez sur Déployer pour en ajouter un au projet.
- Plugins : un plugin est un fichier .zip. L'application le lit comme des données et liste chaque fichier et chaque réglage. Elle écrit seulement les éléments que vous acceptez. Cliquez sur Réglages sur un plugin installé pour remplir ses réglages dans un formulaire, puis enregistrez : les fichiers que les nouvelles valeurs changent s'affichent dans la revue. Pour écrire un plugin, cliquez sur Nouveau plugin (il copie un exemple et l'ouvre comme projet), modifiez-le, cliquez sur Essayer dans ce projet pour voir la revue d'un dossier, puis sur Empaqueter pour fabriquer le .zip. Une faute dans manifest.json s'affiche avec sa ligne ; cliquez dessus pour l'ouvrir. Un plugin peut ajouter des compétences et des règles, et utiliser {{config.<clé>}} dans les fichiers texte.
- Projets enfants : d'autres projets qui prennent les mêmes règles. Clonez un enfant, puis cliquez sur Déployer. L'application crée une branche et un commit dans le clone. Elle ne fait jamais de push.

## Moi

Moi contient vos propres réglages : thème, densité, contraste, langue, rôle et notifications. Ils s'appliquent dans chaque projet. Les Animations sont Comme le système ou Réduire, et l'Anneau de focus s'affiche Au clavier ou Toujours, sur 2 ou 3 px ; un aperçu à côté montre le choix tout de suite.

Chaque source de notifications a son propre interrupteur, activé par défaut. Les sources sont : une question, une approbation, une exécution qui vous attend, une synchronisation en échec, une mise à jour, une branche distante déplacée, une exécution qui se termine, les vérifications de vos pull requests, une analyse en échec que vous n'avez pas lancée, et un brouillon de revue d'agent prêt à publier. Un interrupteur désactivé supprime l'entrée dans le centre et la notification du système. Cliquez sur une entrée pour ouvrir son exécution, sa pull request, la page Qualité ou son brouillon. Le système affiche une notification pour une exécution en échec, des vérifications en échec et un brouillon de revue, et pour les sources plus anciennes, quand la fenêtre est en arrière-plan.

## Santé

Santé liste les problèmes du projet. Chaque problème a un bouton qui le corrige.
