# Projets

Projets liste les projets de cet ordinateur. Cliquez sur le nom du projet en haut de la barre latérale, puis sur Projets, pour l'ouvrir. La page montre le projet ouvert sous forme de carte, avec ce qui vous attend et les agents au travail, puis les projets ouverts avant sous Ouverts avant.

Les boutons de la page sont Importer des projets (il ouvre Configuration / Ce projet), Ouvrir un dossier, Cloner depuis l'hébergeur de code et Nouveau projet. Vous pouvez aussi déposer un dossier sur la page. Une carte a Ouvrir, et Fermer pour le projet ouvert ou Retirer de la liste pour un autre. Le bouton à trois points Détails montre le dossier, l'hébergeur de code, la branche et le dernier commit du projet.

## Ouvrir un projet

1. Cliquez sur Ouvrir sur une carte de Ouverts avant pour ouvrir ce projet.
2. Ou cliquez sur Ouvrir un dossier et choisissez le dossier de votre projet. Quand le dossier n'est pas encore un projet, cliquez sur En faire un projet.
3. Ou cliquez sur Cloner depuis l'hébergeur de code et donnez son adresse.

Fermer demande d'abord quand des agents travaillent pour le projet : Annuler, Les arrêter et fermer, ou Les laisser travailler. Les laisser travailler ferme le projet et les runs continuent.

## Nouveau projet

Nouveau projet est une page à part, à l'adresse `/projects/new`. Ouvrez-la avec Nouveau projet sur la page Projets, sur la page du premier lancement ou sur la page Aucun projet n'est ouvert. Elle pose une question à la fois, en cinq étapes : Nom, Type de produit, Outils, Équipe et Prêt. Toutes les étapes montre les cinq parties sur une page : Projet, Cahier, Équipe, Où vit le code et Départ. Retour quitte la page ou revient d'une étape. Chaque étape a des valeurs par défaut. Créer le projet est actif quand le nom et le dossier parent sont fixés. Rien n'est fait avant votre clic.

1. Projet : le nom, la clé courte des tickets (tirée du nom, vous pouvez la modifier), le dossier parent et la pile : Node, Rust, Python, Java, Go ou Autre. La pile fixe les contrôles du fichier de projet et les règles d'exclusion de `.gitignore`. Le dossier doit être vide ou nouveau : Créer le projet refuse un dossier qui contient des fichiers.
2. Cahier : la vision, les utilisateurs et le périmètre, en texte que vous modifiez. Ils vont dans `docs/brief.md`. Choisissez aussi la langue des docs et la langue des pull requests. Les deux prennent par défaut la langue de l'interface. Les agents écrivent les specs, les diagrammes, les documents et le texte des pull requests dans ces langues. Le code, les identifiants, les commentaires de code et les messages de commit restent en anglais.
3. Équipe : vous êtes le premier membre, avec un rôle. Ajoutez des membres avec un nom et un rôle. Retirer enlève un membre ; il est désactivé sur la première rangée (vous), avec sa raison.
4. Où vit le code : Sur cet ordinateur seulement (par défaut), une adresse distante existante, ou un nouveau dépôt privé sur une connexion à un hébergeur de code (GitHub ou GitLab). Un dépôt public n'est pas proposé. Choisissez aussi une connexion à un outil de suivi et son périmètre.
5. Départ : la liste des fichiers que Shipyard écrit, avec leur texte. Rien n'est écrit avant votre clic sur Créer le projet. Choisissez ensuite un démarrage :
   - Lancer un agent : une exécution de la recette `bootstrap`, avec un plan qui attend votre approbation, une construction, une revue et une pull request. Elle demande une connexion à un hébergeur de code.
   - Créer les tickets : un ticket par ligne du périmètre. Vous voyez, modifiez et retirez chacun d'abord. Ils demandent une connexion à un outil de suivi. Shipyard crée les tickets seulement quand vous cliquez sur Créer les tickets, et un second clic ne crée aucune copie.
   - Plus tard.

   Le choix par défaut est l'agent quand il est possible, sinon les tickets, sinon plus tard.

Créer le projet crée le dépôt, écrit les fichiers, fait le premier commit et ouvre le projet. Le projet est créé à la fin des étapes, pas avant. Pour un nouveau dépôt, il crée ensuite le dépôt chez l'hébergeur de code, fixe `origin` et pousse. Quand l'hébergeur de code refuse, le projet local reste ouvert et l'erreur s'affiche.

## Aucun projet ouvert

Quand vous fermez le projet, ou quand aucun projet n'est ouvert après le premier lancement, une carte dit Aucun projet n'est ouvert. Nouveau projet ouvre la page du créateur. Ouvrir un projet ouvre un menu : vos projets récents, Projets, Ouvrir un dossier et Cloner un dépôt. La page du premier lancement sert seulement au premier lancement (voir Démarrer, Premier lancement).

## Réglages du projet

Configuration / Ce projet contient le nom et le logo du projet, ses connexions et sa santé. Voir la page Configuration.
