# Démarrer

Shipyard aide une équipe à livrer un projet logiciel : les fonctionnalités, le plan, les personnes et les agents, les spécifications, la conception et le code. Tout reste dans les fichiers du projet, donc l'équipe le partage avec git.

## La fenêtre

- La barre de gauche contient les sept lieux : Aujourd'hui, Flux, Plan, Équipe, Bibliothèque, Code et Configuration. Ce mode d'emploi a une page pour chaque lieu.
- Les sections d'un lieu sont en haut de la page, dans un seul sélecteur. Bibliothèque n'a pas de sélecteur : elle s'ouvre sur quatre portes, et chacune de ses pages a un lien Bibliothèque qui y revient.
- L'inspecteur à droite montre l'élément que vous sélectionnez.
- La barre latérale contient aussi le nom du projet en haut et votre compte en bas.
  - Le nom du projet ouvre un menu avec vos projets et la page Projets.
  - Votre compte ouvre le menu du compte, à côté de la barre latérale. La rangée du compte montre votre nom et vos initiales.
- La rangée du haut de chaque page contient le bouton de la barre latérale, Précédent et Suivant, la barre Demander ou dire à Shipyard, la marque de synchronisation, et les boutons Assistant et Terminal, qui ouvrent le panneau de l'assistant et le terminal depuis n'importe quelle page. La fenêtre n'a pas de barre du haut ni de barre d'état.
  - La marque de synchronisation montre l'état du dépôt. Cliquez dessus pour voir les fichiers modifiés, la branche, Synchroniser et Commit. Voir la page Code, Synchroniser. Un rôle sans accès à Code n'y voit ni les fichiers modifiés ni Commit.
  - Demander ou dire à Shipyard est la seule barre pour une question, un lieu et une action. Voir la page La barre Demander.
  - Le menu du compte contient votre nom et votre rôle avec Modifier (Configuration / Moi), Thème (Clair, Sombre, Système), Langue, Mode d'emploi, Raccourcis, Nouveautés, Revoir la visite, Rechercher une mise à jour, À propos de Shipyard avec la version, et Santé. Raccourcis et Nouveautés s'ouvrent en boîtes de dialogue.
- Sous 1100 px, les boutons Fichiers et Terminal sont dans le menu Plus.

La fenêtre s'ouvre à la taille où vous l'avez fermée. Pour garder les données de l'application à côté de l'application (sur une clé USB, par exemple), placez un fichier vide nommé `portable` à côté de l'application.

## L'élément de la barre de menus

- Un clic ouvre un petit panneau. L'en-tête nomme le projet et l'état de la synchronisation (À jour, ou Échec de la synchronisation). Viennent ensuite les choses qui vous attendent (la même liste qu'Aujourd'hui), En cours avec deux exécutions, Tout voir (n) dans sa rangée de titre pour le reste, chacune avec Arrêter, le rappel de saisir le temps, Agents avec les dépenses du jour et du mois et l'interrupteur des agents, Synchroniser, et Ouvrir Shipyard. Le pied reste en bas pendant que le milieu défile.
- Un clic ouvre un petit panneau : les dépenses du jour et du mois, les exécutions actives avec Arrêter, ce qui vous attend (la même liste que dans Aujourd'hui), le rappel de saisie du temps, l'interrupteur des agents, l'état de la synchronisation, le projet et Ouvrir Shipyard.
- Le panneau demande le même clic que l'application pour chaque action qui écrit.
- Dans Configuration, puis Moi, désactivez l'élément de la barre de menus.

## Premier lancement

La page du premier lancement s'affiche seulement au premier lancement. Elle pose une question : quel rôle vous convient ? Choisissez une tuile (Responsable produit, Chef de projet, Architecte, Responsable technique, Analyste métier, Développeur, Testeur, Designer, Lecteur ou Autre), puis cliquez sur Continuer. La tuile du lecteur dit « Je regarde seulement ». Ensuite, ouvrez un projet, clonez un dépôt ou créez un projet, ou choisissez un projet récent. Après cela, quand aucun projet n'est ouvert (par exemple après Fermer le projet), une carte dit Aucun projet n'est ouvert, avec Nouveau projet et Ouvrir un projet. Voir la page Projets.

Dans Aujourd'hui, une petite carte de configuration nomme l'étape suivante de la liste : projet, outil d'IA, modèles, outil de suivi, hébergeur de code, équipe, autorisations, première décision, première spec, premier ticket attribué et première exécution. Chaque étape a une action qui nomme la vraie étape suivante, comme Installer, Se connecter, Choisir ou Connecter. Continuer, sur la carte, ouvre Configuration / Démarrage, qui montre les mêmes étapes, une question à la fois. Dans Aujourd'hui, la carte se masque quand il ne reste rien à faire.

## La visite

- La visite ne s'ouvre pas au premier lancement. Elle s'ouvre une fois, quand vous ouvrez votre premier projet. Elle a six étapes : la boucle, ouvrir un projet, connecter l'outil de suivi et l'hébergeur de code, choisir l'outil d'IA, les autorisations, et la première exécution sur un ticket.
- Cliquez sur Suivant et Précédent, ou appuyez sur les flèches Gauche et Droite. Fermer termine la visite à toute étape. Elle ne s'ouvre plus d'elle-même.
- Pour la revoir, choisissez Revoir la visite dans le menu du compte ou dans le menu Aide, ou tapez Revoir la visite dans la barre Demander, ou allez dans Configuration, puis Cet ordinateur, puis Autorisations.
- La dernière étape ouvre ce mode d'emploi.

## Autorisations

Shipyard demande une autorisation du système seulement après votre clic sur Autoriser. La visite et Configuration / Cet ordinateur montrent chacune avec son état : Activé, Désactivé, Pas demandé, Pas nécessaire ou Inconnu.

| Autorisation | macOS | Windows | Linux |
|---|---|---|---|
| Notifications | Autoriser montre la demande du système. Désactivé ouvre les Réglages Système. | Envoyer un test, et Ouvrir les Réglages Système. | Envoyer un test. |
| Documents, Bureau et Téléchargements | Autoriser laisse macOS demander pour chaque dossier. Désactivé ouvre Confidentialité et sécurité / Fichiers et dossiers. | Pas nécessaire. | Pas nécessaire. |

Shipyard ne demande pas l'accès complet au disque, la caméra, le micro ni la position. Un projet sur un volume amovible ou réseau reçoit la demande de macOS quand il s'ouvre.

## Votre rôle

Dans Configuration, puis Moi, choisissez votre rôle. Le rôle fixe la page qui s'ouvre en premier et les panneaux d'Aujourd'hui. Voir la page Équipe, Droits.

| Rôle | Première page |
|---|---|
| Responsable produit | Flux / Liste |
| Chef de projet | Plan / Calendrier |
| Architecte | Bibliothèque / Décisions |
| Responsable technique | Flux |
| Analyste métier | Bibliothèque / Spécifications |
| Développeur | Flux |
| Testeur | Bibliothèque / Plans de test |
| Designer | Bibliothèque / Écrans |
| Lecteur (Je regarde seulement) | Aujourd'hui |

Quand votre rôle ne voit pas sa première page, Aujourd'hui s'ouvre. Sans rôle, Aujourd'hui s'ouvre.

## Trouver son chemin

- Appuyez sur Ctrl+K (Cmd+K sur un Mac) pour aller à la barre Demander. Tapez le nom d'une page, d'un élément ou d'une action, puis utilisez les flèches et Entrée.
- Appuyez sur Ctrl+1 à Ctrl+7 pour aller à un lieu.
- Appuyez sur F1, ou choisissez Mode d'emploi dans le menu du compte, ou choisissez Ouvrir le mode d'emploi de cette page dans la barre Demander, pour lire l'aide de la page que vous voyez. Le mode d'emploi s'ouvre sur la page du lieu, à la section où vous étiez.
- Appuyez sur Ctrl+[ et Ctrl+] (Cmd sur un Mac), ou cliquez sur Précédent et Suivant dans la rangée du haut, pour passer d'une page ouverte à l'autre.
- Cliquez sur le bouton de la barre latérale, au bout gauche de la rangée du haut, pour masquer ou afficher la barre latérale.
- Choisissez Terminal ou Fichiers dans la barre Demander ou dire à Shipyard pour ouvrir ou fermer le tiroir du terminal ou le tiroir des fichiers.
- Une adresse d'une version plus ancienne marche encore : elle ouvre la page qui contient la même fonction aujourd'hui.
- Quand une erreur a un bouton qui ouvre un réglage, cliquez dessus. La page s'ouvre sur la ligne exacte, place le focus sur sa commande et la marque pendant 2 secondes.
- Maintenez Ctrl (Cmd sur un Mac) et tournez la molette sur un diagramme ou une image pour zoomer. Faites glisser pour le déplacer. Utilisez Plein écran pour une grande vue.
- Appuyez sur Ctrl+= et Ctrl+- pour changer la taille du texte, et sur Ctrl+0 pour revenir à 16 px. Configuration / Moi a le même choix.
- Appuyez sur Ctrl+Maj+K pour voir tous les raccourcis clavier.
- Chaque bouton, champ et interrupteur fait 44 px de haut ou plus. Les pages marchent dans une fenêtre de 960 par 600 px sans défilement horizontal.

## Sûr par défaut

- L'application n'envoie jamais un changement à un outil de suivi ou à un hébergeur de code sans votre clic.
- Un jeton va dans le trousseau de votre ordinateur. L'application ne le montre plus jamais.
- Un projet avec un profil en lecture seule ne prend aucun changement.

## Les mots

| Mot | Sens |
|---|---|
| Lieu | Une entrée de la barre de gauche, comme Flux ou Bibliothèque. |
| Fonctionnalité | Une chose à construire. Flux la montre une fois, avec son ticket, sa spec, le travail de l'agent et sa pull request. |
| Recette | Les étapes qu'un agent suit sur une fonctionnalité : plan, travail, revue, puis une pull request. |
| Équipe | Les personnes et les agents du projet. |
| Réf | Le nom court d'un élément, comme `adr:0003` ou `wi:ACME-12`. Cliquez sur une réf pour ouvrir son élément. |
| Outil de suivi | L'outil qui contient les tickets : Jira, GitHub, GitLab, Azure DevOps ou Linear. |
| Hébergeur de code | Le serveur qui contient le code : GitHub ou GitLab. |
| Exécution | Un travail d'un agent sur un ticket. |
| Spec | Un texte qui dit ce que le produit doit faire. |
| ADR | Un relevé de décision : une décision, ses options et ses raisons. |
| Serveur MCP | Un outil qu'un agent peut appeler, comme Jira ou Figma. |

Survolez un mot marqué dans la liste Pour commencer, dans la visite ou sur une page vide, ou placez-y le focus du clavier. Une phrase l'explique, avec un lien vers le mode d'emploi. Les mots marqués sont outil de suivi, hébergeur de code, outil d'IA, modèle, spec, décision, exécution et pull request.
