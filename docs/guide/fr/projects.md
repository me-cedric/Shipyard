# Projets

Projets liste les projets de cet ordinateur. Cliquez sur le nom du projet dans la barre du haut pour l'ouvrir. La page montre le projet ouvert, les projets ouverts avant avec leur hébergeur de code en badge, et les manières d'en commencer un.

Sans projet ouvert, chaque lieu montre le même choix : Ouvrir un dossier, Cloner un dépôt et Nouveau projet.

## Ouvrir un projet

1. Cliquez sur un projet de la liste pour l'ouvrir.
2. Ou cliquez sur Ouvrir un dossier et choisissez le dossier de votre projet. Quand le dossier n'est pas encore un projet, cliquez sur En faire un projet.
3. Ou cliquez sur Cloner un dépôt et donnez son adresse.

## Nouveau projet

Cliquez sur Nouveau projet sur la page Projets, sur la page du premier lancement ou sur la page sans projet. Le créateur a cinq étapes : Projet, Cahier, Équipe, Dépôt et Démarrage. Toutes les étapes les montre sur une page. Chaque étape a des valeurs par défaut. Créer est actif dès la première étape quand le nom et le dossier parent sont fixés.

1. Projet : le nom, la clé (tirée du nom, vous pouvez la modifier), le dossier parent et la pile : Node, Rust, Python, Java, Go ou Autre. La pile fixe les contrôles du fichier de projet et les règles d'exclusion de `.gitignore`. Le dossier doit être vide ou nouveau : Créer refuse un dossier qui contient des fichiers.
2. Cahier : la vision, les utilisateurs et le périmètre, en texte que vous modifiez. Ils vont dans `docs/brief.md`. Choisissez aussi la langue des docs et la langue des pull requests. Les deux prennent par défaut la langue de l'interface. Les agents écrivent les specs, les diagrammes, les documents et le texte des pull requests dans ces langues. Le code, les identifiants, les commentaires de code et les messages de commit restent en anglais.
3. Équipe : vous êtes le premier membre, avec un rôle. Ajoutez ou retirez des membres avec un nom et un rôle.
4. Dépôt : Local seulement (par défaut), une adresse distante existante, ou un nouveau dépôt privé sur une connexion à un hébergeur de code (GitHub ou GitLab). Un dépôt public n'est pas proposé. Choisissez aussi une connexion à un outil de suivi et son périmètre.
5. Démarrage : la liste des fichiers que Créer écrit, avec leur texte. Rien n'est écrit avant votre clic sur Créer. Choisissez ensuite un démarrage :
   - Une exécution de la recette `bootstrap` : un plan qui attend votre approbation, une construction, une revue et une pull request. Elle demande une connexion à un hébergeur de code.
   - Des tickets de départ : un ticket par ligne du périmètre. Vous voyez, modifiez et retirez chacun d'abord. Ils demandent une connexion à un outil de suivi. Shipyard crée les tickets seulement quand vous cliquez sur Créer les tickets, et un second clic ne crée aucune copie.
   - Plus tard.

   Le choix par défaut est l'exécution quand elle est possible, sinon les tickets, sinon plus tard.

Créer crée le dépôt, écrit les fichiers, fait le premier commit et ouvre le projet. Pour un nouveau dépôt, il crée ensuite le dépôt chez l'hébergeur de code, fixe `origin` et pousse. Quand l'hébergeur de code refuse, le projet local reste ouvert et l'erreur s'affiche.

## Réglages du projet

Configuration / Ce projet contient le nom et le logo du projet, ses connexions et sa santé. Voir la page Configuration.
