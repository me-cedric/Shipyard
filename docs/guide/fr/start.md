# Démarrer

Shipyard aide une équipe à livrer un projet logiciel : la conception, les spécifications, le travail, les agents, le code et les connaissances. Tout reste dans les fichiers du projet, donc l'équipe le partage avec git.

## La fenêtre

- La barre de gauche contient les espaces : Accueil, Conception, Spécifications, Travail, Usine, Code, Connaissances et Réglages.
- Les onglets d'un espace sont en haut de la page.
- L'inspecteur à droite montre l'élément que vous sélectionnez.
- La barre d'état en bas montre le projet, l'état de la synchronisation et la commande de commit.
- L'assistant s'ouvre sur le côté. Posez-lui une question sur le projet. Chaque conversation est un onglet, et un point marque un onglet avec une nouvelle réponse.
- Dans Réglages, puis Moi, choisissez le côté de la barre et des tiroirs, la couleur d'accent, le format des dates, une barre du haut étroite et votre photo.

La fenêtre s'ouvre à la taille où vous l'avez fermée. Pour garder les données de l'application à côté de l'application (sur une clé USB, par exemple), placez un fichier vide nommé `portable` à côté de l'application.

## L'élément de la barre de menus

- L'icône Shipyard est dans la barre de menus (la zone de notification sous Windows et Linux). Un point sur l'icône signale que quelque chose vous attend.
- Un clic ouvre un petit panneau : la dépense du jour et du mois, les exécutions actives avec Arrêter, le nombre À traiter avec ses premiers éléments, l'interrupteur des agents, l'état de la synchronisation, le projet et Ouvrir Shipyard.
- Le panneau demande le même clic que l'application pour chaque action qui écrit.
- Dans Réglages, puis Moi, désactivez l'élément de la barre de menus.

## Ouvrir un projet

1. Allez dans Accueil, puis Projets.
2. Cliquez sur Ouvrir un dossier local et choisissez le dossier de votre projet. Ou créez un nouveau projet.
3. Quand le dossier n'est pas encore un projet, cliquez sur En faire un projet.

## Trouver son chemin

- Appuyez sur Ctrl+K (Cmd+K sur Mac) pour ouvrir la palette. Tapez le nom d'une page, d'un élément ou d'une action.
- Dans la palette, tapez quelques mots pour chercher dans le texte de vos documents, décisions, spécifications, questions, tickets et maquettes. Les majuscules et les accents ne comptent pas (« decision » trouve « décision »), chaque mot doit correspondre, et le dernier mot peut être un début. Les résultats se groupent par type, montrent un court extrait avec les mots marqués, et placent en premier une page que beaucoup d'éléments citent. Choisissez Demander à l'assistant pour mettre ces éléments comme contexte dans la zone de message de l'assistant. Rien n'est envoyé avant votre envoi. Le document que vous ouvrez depuis un résultat marque les mots.
- Les listes de Design et de Connaissances ont une zone Rechercher qui filtre la liste avec la même recherche.
- Appuyez sur Ctrl+1 à Ctrl+8 pour aller dans un espace.
- Ouvrez la palette et choisissez Ouvrir le mode d'emploi de cette page pour lire l'aide de la page que vous voyez.
- Appuyez sur Ctrl+[ et Ctrl+] (Cmd sur Mac), ou cliquez sur Précédent et Suivant dans la barre du haut, pour passer d'une vue ouverte à l'autre.
- Cliquez sur le bouton ? ou appuyez sur F1 pour lire l'aide de la page que vous voyez.
- Cliquez sur le bouton de la barre latérale, au bout gauche de la barre du haut, pour masquer ou montrer la barre latérale.
- Sous 1100 px, les boutons des fichiers, du terminal et du thème sont dans le menu Plus.
- Cliquez sur la flèche à côté de Synchroniser pour Récupérer seulement ou pour Envoyer.
- Maintenez Ctrl (Cmd sur Mac) et tournez la molette de la souris sur un diagramme ou une image pour zoomer. Faites glisser pour la déplacer. Utilisez Plein écran pour une grande vue.
- Appuyez sur Ctrl+= et Ctrl+- pour changer la taille du texte, et sur Ctrl+0 pour revenir à 16 px. Réglages / Moi offre le même choix.
- Appuyez sur Ctrl+Maj+K pour voir tous les raccourcis clavier.

## Votre rôle

Dans Réglages, puis Moi, choisissez votre rôle. Le rôle fixe l'espace qui s'ouvre en premier. Un débutant commence dans Connaissances, Apprendre. Un chef de projet commence dans Travail, Tableau.

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
