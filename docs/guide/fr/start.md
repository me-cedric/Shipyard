# Démarrer

Shipyard aide une équipe à livrer un projet logiciel : la conception, les spécifications, le travail, les agents, le code et les connaissances. Tout reste dans les fichiers du projet, donc l'équipe le partage avec git.

## La fenêtre

- La barre de gauche contient les espaces : Accueil, Conception, Spécifications, Travail, Usine, Code, Connaissances et Réglages.
- Les onglets d'un espace sont en haut de la page. Chaque onglet a une icône et son nom.
- L'inspecteur à droite montre l'élément que vous sélectionnez.
- La barre d'état en bas montre le projet, l'état de la synchronisation et la commande de commit, avec le nombre de fichiers modifiés à côté de Commit.
- La barre du haut contient Précédent et Suivant, Synchroniser, Activité, la recherche, les boutons Fichiers et Terminal, Demander, les notifications et le menu du compte.
  - Synchroniser montre de combien de commits vous êtes en avance et en retard.
  - Activité montre le nombre À traiter, et une marque tant qu'une exécution ou une session est active. Son panneau a trois parties : À traiter (un lien vers Accueil / Aujourd'hui), Exécutions (Arrêter, et un lien vers Usine / Exécutions) et Sessions (Arrêter, et un lien vers Usine / Sessions).
  - Demander est un bouton partagé en deux. Cliquez sur la partie principale pour ouvrir ou fermer l'assistant. Le chevron ouvre les éléments de Demander.
  - Le menu du compte (votre photo) contient Réglages / Moi, Thème (Clair, Sombre, Système), Mode d'emploi, Raccourcis, Nouveautés et Revoir la visite.
- L'assistant s'ouvre sur le côté. Posez-lui une question sur le projet. Chaque conversation est un onglet, et un point marque un onglet avec une nouvelle réponse.
- Dans Réglages, puis Moi, choisissez le côté de la barre et des tiroirs, la couleur d'accent, le format des dates, une barre du haut étroite et votre photo.

La fenêtre s'ouvre à la taille où vous l'avez fermée. Pour garder les données de l'application à côté de l'application (sur une clé USB, par exemple), placez un fichier vide nommé `portable` à côté de l'application.

## L'élément de la barre de menus

- L'icône Shipyard est dans la barre de menus (la zone de notification sous Windows et Linux). Un point sur l'icône signale que quelque chose vous attend.
- Un clic ouvre un petit panneau : la dépense du jour et du mois, les exécutions actives avec Arrêter, le nombre À traiter avec ses premiers éléments, l'interrupteur des agents, l'état de la synchronisation, le projet et Ouvrir Shipyard.
- Le panneau demande le même clic que l'application pour chaque action qui écrit.
- Dans Réglages, puis Moi, désactivez l'élément de la barre de menus.

## La visite

- La visite ne s'ouvre pas au premier lancement. Elle s'ouvre une fois, quand vous ouvrez votre premier projet. Elle a six étapes : la boucle, ouvrir un projet, connecter l'outil de suivi et l'hébergeur de code, choisir l'outil d'IA, les autorisations, et la première exécution sur un ticket.
- Cliquez sur Suivant et Retour, ou appuyez sur les flèches gauche et droite. Fermer arrête la visite à chaque étape. Elle ne s'ouvre plus d'elle-même.
- Pour la revoir, choisissez Revoir la visite dans le menu du compte ou dans le menu Aide, ou tapez Revoir la visite dans la palette, ou allez dans Réglages, puis Moi, puis Autorisations.
- La dernière étape ouvre ce manuel.

## Autorisations

Shipyard demande une autorisation du système seulement après un clic sur Autoriser. La visite et Réglages / Moi montrent chacune avec son état : Activé, Désactivé, Pas demandé, Pas nécessaire ou Inconnu.

| Autorisation | macOS | Windows | Linux |
|---|---|---|---|
| Notifications | Autoriser affiche la demande du système. Désactivé ouvre les Réglages Système. | Envoyer un test, et Ouvrir les Réglages Système. | Envoyer un test. |
| Documents, Bureau et Téléchargements | Autoriser laisse macOS demander chaque dossier. Désactivé ouvre Confidentialité et sécurité / Fichiers et dossiers. | Pas nécessaire. | Pas nécessaire. |

Shipyard ne demande pas l'accès complet au disque, la caméra, le micro ni la position. Un projet sur un volume amovible ou réseau reçoit la demande de macOS à son ouverture.

## Premier lancement

La page du premier lancement demande votre rôle. Choisissez-le, puis cliquez sur Continuer. Ensuite, ouvrez un dossier, clonez un dépôt ou démarrez un nouveau projet. Quand aucun projet n'est ouvert, chaque espace montre ce même choix : Ouvrir un dossier, Cloner un dépôt et Nouveau projet.

Dans Accueil, puis Aujourd'hui, une seule liste Pour commencer donne les prochaines étapes dans l'ordre : projet, outil d'IA, modèles, outil de suivi des tickets, hébergeur de code, équipe, autorisations, première décision, première spécification, premier ticket attribué et première exécution. Chaque élément a une action qui nomme la vraie étape suivante, comme Installer, Se connecter, Choisir ou Connecter. Réglages / Moi montre la même carte. Dans Aujourd'hui, elle se masque quand il ne reste rien à faire.

## Ouvrir un projet

1. Allez dans Accueil, puis Projets.
2. Cliquez sur Ouvrir un dossier local et choisissez le dossier de votre projet. Ou cliquez sur Nouveau projet (voir Nouveau projet ci-dessous).
3. Quand le dossier n'est pas encore un projet, cliquez sur En faire un projet.

## Nouveau projet

Cliquez sur Nouveau projet dans Accueil, puis Projets, ou sur la page du premier lancement ou la page sans projet. L'assistant a cinq étapes : Projet, Cahier, Équipe, Dépôt et Départ. Chaque étape a des valeurs par défaut. Créer est actif dès la première étape quand le nom et le dossier parent sont renseignés.

1. Projet : le nom, la clé (tirée du nom, vous pouvez la modifier), le dossier parent et la pile : Node, Rust, Python, Java, Go ou Autre. La pile fixe les contrôles du fichier de projet et les règles d'exclusion de `.gitignore`. Le dossier doit être vide ou nouveau : Créer refuse un dossier qui contient des fichiers.
2. Cahier : la vision, les utilisateurs et le périmètre, en texte que vous modifiez. Ils vont dans `docs/brief.md`. Choisissez aussi la langue des documents et la langue des pull requests. Les deux valent par défaut la langue de l'interface. Les agents écrivent les spécifications, les diagrammes, les documents et le texte des pull requests dans ces langues. Le code, les identifiants, les commentaires de code et les messages de commit restent en anglais.
3. Équipe : vous êtes le premier membre, avec un rôle. Ajoutez ou retirez des membres avec un nom et un rôle.
4. Dépôt : Local seulement (par défaut), une adresse distante existante, ou un nouveau dépôt privé sur une connexion d'hébergeur de code (GitHub ou GitLab). Un dépôt public n'est pas proposé. Choisissez aussi une connexion d'outil de suivi des tickets et son périmètre.
5. Départ : la liste des fichiers que Créer écrit, avec leur texte. Rien n'est écrit avant votre clic sur Créer. Choisissez ensuite un démarrage :
   - Une exécution Factory du workflow `bootstrap` : un plan qui attend votre approbation, une construction, une revue et une pull request. Elle demande une connexion d'hébergeur de code.
   - Des tickets de départ : un ticket pour chaque ligne du périmètre. Vous voyez, modifiez et retirez chacun d'eux d'abord. Ils demandent une connexion d'outil de suivi des tickets. Shipyard crée les tickets seulement quand vous cliquez sur Créer les tickets, et un deuxième clic ne crée aucune copie.
   - Plus tard.

   Le choix par défaut est l'exécution quand c'est possible, sinon les tickets, sinon plus tard.

Créer fait le dépôt, écrit les fichiers, fait le premier commit et ouvre le projet. Pour un nouveau dépôt, il crée ensuite le dépôt chez l'hébergeur de code, fixe `origin` et pousse. Quand l'hébergeur de code refuse, le projet local reste ouvert et l'erreur s'affiche.

## Trouver son chemin

- Appuyez sur Ctrl+K (Cmd+K sur Mac) pour ouvrir la palette. Tapez le nom d'une page, d'un élément ou d'une action.
- Dans la palette, tapez quelques mots pour chercher dans le texte de vos documents, décisions, spécifications, questions, tickets et maquettes. Les majuscules et les accents ne comptent pas (« decision » trouve « décision »), chaque mot doit correspondre, et le dernier mot peut être un début. Les résultats se groupent par type, montrent un court extrait avec les mots marqués, et placent en premier une page que beaucoup d'éléments citent. Choisissez Demander à l'assistant pour mettre ces éléments comme contexte dans la zone de message de l'assistant. Rien n'est envoyé avant votre envoi. Le document que vous ouvrez depuis un résultat marque les mots.
- Les listes de Design et de Connaissances ont une zone Rechercher qui filtre la liste avec la même recherche.
- Appuyez sur Ctrl+1 à Ctrl+8 pour aller dans un espace.
- Ouvrez la palette et choisissez Ouvrir le mode d'emploi de cette page pour lire l'aide de la page que vous voyez.
- Appuyez sur Ctrl+[ et Ctrl+] (Cmd sur Mac), ou cliquez sur Précédent et Suivant dans la barre du haut, pour passer d'une vue ouverte à l'autre.
- Appuyez sur F1, ou choisissez Mode d'emploi dans le menu du compte, pour lire l'aide de la page que vous voyez.
- Cliquez sur le bouton de la barre latérale, au bout gauche de la barre du haut, pour masquer ou montrer la barre latérale.
- Sous 1100 px, les boutons Fichiers et Terminal sont dans le menu Plus.
- Cliquez sur le bouton Terminal pour ouvrir ou fermer le tiroir du terminal. Terminal et Mode d'emploi ne sont pas des onglets. La palette et le menu de la fenêtre gardent leurs entrées.
- Cliquez sur la flèche à côté de Synchroniser pour Récupérer seulement ou pour Envoyer.
- Maintenez Ctrl (Cmd sur Mac) et tournez la molette de la souris sur un diagramme ou une image pour zoomer. Faites glisser pour la déplacer. Utilisez Plein écran pour une grande vue.
- Appuyez sur Ctrl+= et Ctrl+- pour changer la taille du texte, et sur Ctrl+0 pour revenir à 16 px. Réglages / Moi offre le même choix.
- Appuyez sur Ctrl+Maj+K pour voir tous les raccourcis clavier.

## Votre rôle

Dans Réglages, puis Moi, choisissez votre rôle. Le rôle fixe l'espace qui s'ouvre en premier. Un responsable technique commence dans Usine, Exécutions. Un chef de projet commence dans Travail, Tableau.

## Sûr par défaut

- L'application n'envoie jamais un changement à un outil de suivi des tickets ou à un hébergeur de code sans votre clic.
- Un jeton va dans le trousseau de votre ordinateur. L'application ne le montre plus jamais.
- Un projet avec un profil en lecture seule n'accepte aucun changement.

## Les mots

| Mot | Sens |
|---|---|
| Réf | Le nom court d'un élément, comme `adr:0003` ou `wi:ACME-12`. Cliquez sur une réf pour ouvrir son élément. |
| Outil de suivi des tickets | L'outil qui contient les tickets : Jira, GitHub, GitLab, Azure DevOps ou Linear. |
| Hébergeur de code | Le serveur qui contient le code : GitHub ou GitLab. |
| Exécution | Un travail d'un agent sur un ticket. |
| Spécification | Un texte qui dit ce que le produit doit faire. |
| ADR | Une fiche de décision : une décision, ses options et ses raisons. |
| Serveur MCP | Un outil qu'un agent peut appeler, comme Jira ou Figma. |

Survolez un mot marqué dans la liste, dans la visite ou sur une page vide, ou placez le focus clavier dessus. Une phrase l'explique, avec un lien vers le mode d'emploi. Les mots marqués sont outil de suivi des tickets, hébergeur de code, outil d'IA, modèle, spécification, décision, exécution et pull request.
