# Bibliothèque

Bibliothèque contient les pages qui décrivent le projet : ce qu'il doit faire, comment il est construit, pourquoi c'est ainsi, et ce que l'équipe apprend et partage. Chaque élément est un fichier du projet.

Bibliothèque s'ouvre sur quatre portes. Chaque porte nomme ce que vous cherchez, et contient une pastille par page. Cliquez sur une pastille pour ouvrir sa page. Quand quelque chose vous attend, une pastille orange vient en premier et donne le nombre : les questions ouvertes, ou les décisions en attente. Une pastille marque une page dont la source a changé depuis. Une page que votre rôle ne voit pas n'a pas de pastille.

Bibliothèque n'a pas de sélecteur de sections. Sur chaque page de Bibliothèque, cliquez sur Bibliothèque en haut pour revenir aux portes.

Les pastilles Ce qui est testé, Réponses et Glossaire ouvrent la page qui les contient. La pastille Apprendre montre combien d'étapes du parcours vous avez finies. Sous les portes, les cartes Épinglé et Ouvert en dernier listent des pages : Épingler garde une page dans Épinglé, et Désépingler la retire. Ouvert en dernier garde aussi les éléments qui ont une réf (une spec, une décision, un schéma, un document) : chaque ligne montre une pastille de genre, son nom et Épingler.

## Lire et modifier un élément

1. Ouvrez une page, puis sélectionnez un élément. Ou cliquez sur l'action principale de la page pour en créer un. Sélectionnez un élément pour voir, dans l'inspecteur, les éléments qui le citent.
2. Un élément avec une image s'ouvre sur l'image seule. Un sélecteur en haut a trois choix : Image, Les deux (le texte et l'image côte à côte) et Texte. Un document a Lecture, Les deux et Texte. Shipyard garde votre choix. Il montre le texte de lui-même pour un nouveau fichier, quand quelqu'un a changé le fichier en même temps, et pour une erreur qui nomme une ligne.
3. Changez le texte ou le dessin, puis cliquez sur Enregistrer. L'application écrit le fichier entier ou rien.

- Rechercher : les listes ont un champ Rechercher. Il utilise la même recherche que la barre Demander.
- Plus : le menu au bout de la ligne d'en-tête d'une page contient les contrôles que la page ne montre pas : Copier la référence, Copier le nom du fichier, Renommer, Supprimer et certains filtres.
- Supprimer : choisissez Supprimer dans le menu Plus de la page, ou ouvrez le menu d'un élément (clic droit) et choisissez Supprimer. L'application nomme le fichier et demande une fois. Le fichier va ensuite à la corbeille.
- Renommer : le menu Plus et le menu de l'élément ont Renommer. Tapez le nouveau nom ; l'extension reste. La revue liste chaque fichier et chaque ligne dont les liens changent. Renommer déplace ensuite le fichier et réécrit ces liens en une étape. Si une écriture échoue, chaque fichier reste comme il était.
- Demander à l'assistant : le dernier groupe du menu de l'élément. Choisissez une requête pour ce type d'élément et votre rôle. Elle remplit la zone de message avec l'élément, son fichier, sa spec, son ticket et les éléments qui le citent. Rien n'est envoyé avant votre envoi.
- Quand quelqu'un change le fichier en même temps, l'application vous le dit. Choisissez Recharger pour prendre sa version, ou Garder le mien.
- Un projet en lecture seule refuse l'enregistrement, la suppression et le renommage.

## Ce qu'il doit faire

### Spécifications

Spécifications liste ce que le produit fait aujourd'hui. Choisissez une spécification à gauche pour la lire à droite, avec chaque exigence et son état. Les cartes Changements en cours (avec Archiver pour un changement terminé), Liés et Vérifier les spécifications (syntaxe et liens) sont à côté. Le sélecteur Lecture, Texte, Fichiers a Modifier. Les boutons Comparer avec le code et Écrire une spécification depuis le code envoient une demande préparée à l'assistant. Un changement de spécification commence comme une proposition : voir la page Flux, Liste et La page d'une fonctionnalité, Brief.

### Plans de test

Plans de test s'ouvre sur un plan : une carte par scénario, avec ses étapes, une pastille de résultat et Modifier. Les cartes Exigences et Autres plans de test sont à côté. Écrire les scénarios pour moi et Lancer envoient une demande préparée à l'assistant. Un plan sans scénario s'ouvre sur son texte. Un constat du contrôle ouvre le plan sur son texte, à sa ligne.

Ce qui est testé s'ouvre depuis sa pastille dans la porte Ce qu'il doit faire, à l'adresse `/library/test-plans/coverage`, avec le lien Plans de test pour revenir. Il montre des pastilles de filtre, une carte par état (par exemple Réussis) avec son nombre et ses lignes, le contrôle des scénarios, Écrire les tests manquants et Lancer les tests.

### Questions

Questions est le registre des points ouverts : risques, hypothèses, problèmes, dépendances et questions. Le titre donne le nombre d'éléments ouverts. Chaque élément ouvert est une carte avec un champ de réponse et le bouton Répondre ; une réponse vide n'écrit rien.

- Une rangée de pastilles filtre par type, et Les miennes montre les vôtres. Les filtres par texte, état et responsable sont dans le menu Plus. Exporter est dans l'en-tête.
- Cliquez sur Nouvelle question pour en ajouter une. Choisissez le responsable dans l'équipe.
- Les éléments répondus sont dans une carte Closes. Après une réponse à une question d'une spécification, Ajouter la réponse à la spécification copie la réponse dans la spécification.

## Comment il est construit

### Carte

Carte dessine les éléments du projet en groupes, avec les liens entre eux. Filtrez par type. Le menu Plus contient les vues Carte, Table et Graphe, et les filtres Orphelins et Périmés.

- Un élément que rien ne cite s'affiche comme orphelin.
- Un élément dont la source a changé depuis s'affiche comme périmé.
- Sélectionnez un élément pour l'ouvrir dans l'inspecteur.

Avec la source Code, la carte montre les dossiers du code. Une ligne entre deux dossiers est plus épaisse quand plus d'appels passent entre leurs fichiers. Sélectionnez un dossier pour voir ses fichiers, puis un fichier pour voir ses symboles et ce qui les appelle ou ce qu'ils appellent. Tout afficher revient à la carte. Indexer démarre le serveur d'index du code quand il est arrêté, construit l'index, et arrête le serveur. Si le programme se termine par une erreur, la page nomme le programme, son code de sortie et ses dernières lignes : corrigez la cause, puis cliquez de nouveau sur Indexer. La carte du symbole a Expliquer et Ouvrir dans l'éditeur, et Spécifications et décisions qui l'utilisent ouvre l'inspecteur. Orphelins montre les fichiers qu'aucun appel n'atteint ni ne quitte. Le sélecteur Connaissances et Code est en haut, et Code a l'adresse `/library/graph?source=code`.

Un fichier dont la spec a changé après son dernier changement montre la pastille Périmé.

### Architecture

Architecture montre les modèles d'architecture du projet en vues. Les vues sont dessinées à partir du texte du modèle. Des pastilles sous le titre choisissent le modèle, et Nouveau modèle en ajoute un. Le sélecteur Image, Les deux, Texte, avec Modifier, est dans l'en-tête ; dans Les deux, l'image est à gauche et le texte à droite.

Un diagramme ou une image, dans Architecture et dans Écrans, s'ajuste à son cadre et se place au centre à l'ouverture. Pour le déplacer :

- Déplacer : faites-le glisser, ou utilisez un geste horizontal sur le pavé tactile. Une molette verticale fait défiler la page.
- Zoomer : pincez, ou maintenez Ctrl ou Cmd et tournez la molette.
- Clavier : cliquez sur le cadre pour lui donner le focus, puis appuyez sur les flèches pour déplacer, sur + ou - pour zoomer et sur 0 pour ajuster.
- Ajuster ramène tout le diagramme dans le cadre.

### Diagrammes

Diagrammes contient les dessins du projet : Excalidraw, Mermaid, draw.io et BPMN. Une grille ou une liste montre chaque diagramme avec son format. Cliquez sur un diagramme, puis sur Ouvrir ou Modifier ; Changer le format et Utilisé par sont sur sa carte. Le bouton Le dessiner pour moi envoie une demande préparée à l'assistant, et un bouton Nouveau par format ajoute un diagramme. Dessinez dans l'éditeur, puis enregistrez.

### Écrans

Écrans montre les écrans du produit et les jetons de design de votre projet. Ils viennent du document de conception (du CSS dans un bloc de code), d'un fichier `tokens.css`, d'un fichier `*.tokens.json` ou d'un bloc `@theme` de Tailwind 4, groupés par fichier. Sans jeton, la page dit Aucun jeton pour l'instant ; cliquez sur Ajouter des jetons au document de conception, modifiez le bloc, puis enregistrez. La page ne montre jamais les jetons de Shipyard. Chaque écran est une carte avec Réalisé ou Pas réalisé. Le sélecteur Écrans et Jetons montre les jetons. Passer au code ouvre l'écran ouvert, sinon le premier, dans l'inspecteur, où se trouve Écrire le plan.

- Un fichier `.fig` montre l'aperçu que Figma y garde.
- Pour lire Figma, ajoutez une fois le jeton de votre compte Figma. Il va dans le trousseau de votre ordinateur.
- Collez ensuite l'adresse d'un projet Figma et cliquez sur Lister les fichiers. Chaque fichier montre son aperçu et ses jetons de design.

### API

API montre les contrats d'API. Ouvrez un contrat pour lire ses routes. Essayez une route sur un serveur du contrat. La liste montre les points d'accès de tous les contrats. Essayer : choisissez un serveur, une méthode et un chemin, puis cliquez sur Envoyer ; la réponse s'affiche dans la boîte sombre dessous.

La carte d'un endpoint pointe vers le changement qui cite le contrat.

### Données

Données montre les modèles de données : les tables et les liens entre elles. Trouver une table filtre la liste. L'image marque les clés et les liens, et le sélecteur Image, Les deux, Texte montre le texte `.dbml`.

### Flux réseau

Flux réseau liste les flux réseau en tableau : d'où, vers où, le port et le protocole. Ajoutez, changez ou retirez une ligne, puis enregistrez. Chaque ligne a De, Vers et Pourquoi. Le sélecteur Flux et Briques et la carte Briques et hôtes montrent les autres vues. Ouvrir la matrice complète ouvre `/library/flows/matrix` : une page avec le lien Flux réseau pour revenir, des pastilles de filtre, Trouver un hôte et une ligne par flux (Autoriser ou Refuser), avec Modifier et Retirer dans le menu de la ligne. Ajouter un flux est dans le menu Plus de la matrice, et Modifier en texte ouvre le fichier.

Vérifier avec le code cherche dans le code les hôtes qu'il appelle. Une ligne dit Absent du code quand aucun code n'appelle son hôte, et une carte nomme chaque flux refusé que le code utilise, avec Le montrer et Demander le changement.

## Pourquoi c'est ainsi

### Décisions

Décisions contient les relevés de décision (ADR). Chaque relevé donne une décision, les options et les raisons.

- Cliquez sur Nouvelle décision pour en écrire une. Un formulaire demande chaque partie.
- Une décision proposée s'affiche en premier, avec Vous attend. Tapez une Raison, puis cliquez sur Accepter ou Refuser ; une raison vide est refusée. La carte Utilisé par liste ce qui cite la décision.

### Règles du projet

Règles du projet montre une carte numérotée par règle que chaque changement doit suivre. Modifier change le texte, et Ajouter une règle en ajoute une à la fin. La carte Qui peut modifier les règles renvoie vers Équipe / Droits (Modifier les droits), et Qui suit les règles liste les rôles d'agent.

Versions précédentes liste les commits qui ont changé le fichier. Lire montre une ancienne version ; Restaurer écrit son texte dans le fichier et ne commit rien, donc vous pouvez encore l'annuler.

## Apprendre et partager

### Apprendre

Apprendre aide une nouvelle personne à trouver son chemin.

- Parcours : une carte avec les étapes dans l'ordre de lecture (l'architecture, les décisions, puis les spécifications). Chaque étape a un numéro, son type et un titre ; Commencer ouvre l'étape suivante. Une étape que vous ouvrez compte comme faite. Une barre et N sur M montrent votre avancement.
- Glossaire : les mots que les spécifications définissent. Un terme ouvre sa spécification.
- Parcours de formation : cours, certifications et lectures, avec les experts de l'équipe qui peuvent aider. Choisissez une personne, puis cochez les étapes que cette personne a finies. Le tableau de progression de l'équipe montre chaque personne et chaque parcours. La progression de l'équipe est dans la colonne de droite : une ligne par personne, avec une barre et N sur M.
- Fils d'actualité : les fils du projet. Collez l'adresse RSS ou Atom d'un site, puis cliquez sur S'abonner. L'application lit chaque fil et garde une copie pendant une heure.

Experts est une carte avec les personnes du fichier d'équipe et leurs sujets. Ajouter un mot écrit un mot et son sens dans `docs/glossary.md`, et le glossaire lit ce fichier avec les specs. Une étape peut avoir une deuxième pastille : Lecture, Cours ou Certification.

### Manuel

Manuel montre l'arbre des pages à gauche, avec Trouver une page, et la page ouverte. Pages qui renvoient ici liste les pages qui la citent, et Demander à un agent de la mettre à jour envoie une demande préparée à l'assistant. Passez sur Modifier pour changer une page : le sélecteur Lecture, Les deux, Texte montre la page comme on la lit, la page à côté de son texte, ou le texte seul. Cliquez sur Nouvelle page pour en ajouter une. La ligne Mode d'emploi, avec F1, ouvre le mode d'emploi.

Historique, sur une page, liste de la même façon les commits qui l'ont changée, et la page dit qui l'a changée en dernier.

### Documents

Documents liste les documents du projet, avec une pastille pour le format. Ouvrez-en un avec Lecture, Les deux ou Texte, puis cliquez sur Modifier pour le changer. Chercher dans le texte, Renommer et Supprimer sont dans le menu Plus. La carte Fichier a Afficher dans le dossier et Exporter. La carte Le planificateur peut utiliser ce document a Transformer en diapositives et Transformer en spécification : chacun envoie une demande préparée à l'assistant. Exportez le dossier d'architecture et la documentation fonctionnelle en fichiers Word, et une fiche client en fichier Excel. Chaque export ouvre un dialogue Enregistrer sous avec le nom rempli et le dossier de votre dernier enregistrement ; Annuler n'exporte rien. Après un enregistrement, Afficher dans le dossier et Ouvrir marchent sur le nouveau fichier.

Un fichier Word a une page de garde, une table des matières (Word remplit les numéros de page quand il demande de mettre à jour les champs), les diagrammes Mermaid du projet en images, et des numéros de page. Un fichier LikeC4 ou draw.io s'affiche en image quand un PNG du même nom est à côté, et sinon par son chemin. Une feuille Excel a une ligne d'en-tête stylée qui reste à l'écran.

Ajouter un fichier copie tout fichier que vous choisissez dans le dossier des documents. Un fichier Word reste un fichier Word.

### Diapositives

Diapositives contient les présentations du projet. Chaque présentation est un fichier HTML dans `docs/slides/`, avec ses animations et ses étapes. Les présentations sont des cartes à gauche, et la présentation ouverte est à droite avec une pagination et une bande de vignettes.

- Nouvelle présentation : tapez un nom. L'assistant s'ouvre avec une demande à un agent d'écrire la présentation. Lisez la demande, puis envoyez-la.
- Cliquez sur une présentation pour la montrer. Les flèches, Espace, Début et Fin parcourent les diapositives et les étapes.
- Présenter montre la présentation en plein écran. Appuyez sur Échap pour arrêter.
- Exporter en PDF : choisissez le fichier dans la boîte Enregistrer sous. Chaque diapositive devient une page. Cela marche sur macOS seulement.
- Une présentation plus ancienne écrite en texte s'affiche en lecture seule. Cliquez sur Convertir pour demander à un agent de la réécrire en présentation HTML.
- Pour supprimer une présentation, ouvrez son menu, puis cliquez sur Supprimer. Le fichier va à la corbeille.

Une présentation écrite en Markdown a Modifier, Exporter en PDF et Notes de l'intervenant. Une note est un bloc `Note:` après une diapositive. Exporter en PDF fonctionne sur macOS seulement.

### Tableaux de bord

Tableaux de bord montre un tableau de bord à la fois ; le sélecteur en haut de la page le choisit. Ses tuiles sont en lecture seule. Modifier ouvre la page de modification du tableau de bord, Exporter le rapport ouvre Rapports, et Créer un tableau de bord pour moi envoie une demande préparée à l'assistant. Nouveau tableau de bord est dans le menu Plus. Plus de chiffres renvoie vers Équipe / Dépenses, Flux / Santé et Plan. Les tuiles que vous épinglez s'affichent en haut de Tableaux de bord. Une tuile dont la source est coupée le dit.

La page de modification a l'adresse `/library/dashboards/<nom>/edit`, le lien Tableaux de bord pour revenir, Renommer et Terminé. Ajouter une tuile montre une pastille par type de tuile. Chaque tuile a une poignée de déplacement, Réglages et Retirer ; Déplacer à gauche, Déplacer à droite et la taille sont dans Réglages. Afficher en tableau donne les chiffres derrière un graphique.

Créer une tuile pour moi demande à un agent de proposer une tuile à partir de vos mots. Vous n'avez pas besoin de connaître les types de tuiles.

1. Ouvrez la page de modification du tableau de bord (Modifier), puis cliquez sur Créer une tuile pour moi, à côté d'Ajouter une tuile.
2. Tapez ce que la tuile doit montrer, en mots simples. Par exemple : les questions ouvertes par responsable.
3. Budget (USD) est la limite de l'agent : l'agent s'arrête au budget, ou après 2 minutes. Sa dernière réponse peut dépasser un peu le budget. Le budget commence à 2 dollars. Moins de budget et Plus de budget le changent de 1 dollar.
4. Cliquez sur Créer. Pendant que l'agent travaille, Arrêter le termine. Le travail s'affiche aussi dans Équipe / Sessions, et son Arrêter fait de même.
5. Regardez la Tuile proposée. Accepter l'ajoute au tableau de bord et enregistre. Écarter l'abandonne.

L'agent ne fait que lire le projet. Le tableau de bord ne change pas avant votre clic sur Accepter. Si la page dit que le budget est épuisé, ajoutez du budget, puis cliquez de nouveau sur Créer. Un tableau de bord que vous ne pouvez pas changer n'a pas Créer une tuile pour moi.

Chaque tuile a un graphique : Nombre, Barres, Courbe, Liste, Étapes du flux, Dépense ou Santé. Le genre de données choisit le premier graphique ; changez-le dans le menu de la tuile. Épingler à Aujourd'hui, sur la page de modification, montre le tableau de bord en une carte sur Aujourd'hui. Un sélecteur de versions est à côté de Modifier et ne garde que les tickets de la version dans les tuiles du gestionnaire de tickets.

### Rapports

Rapports liste chaque fichier que Shipyard peut produire pour une personne qui n'utilise pas Shipyard : un client, un responsable, un auditeur. Chaque rapport est une tuile. Format, en haut, montre Tous les rapports, ou seulement les fichiers Word, les fichiers Excel ou les images. Écrit pour vous contient trois documents, chacun avec Ouvrir et L'écrire. Un lien mène à Tableaux de bord.

- Exporter : Shipyard ouvre la boîte Enregistrer sous. Choisissez le dossier, puis enregistrez.
- Remplir le formulaire : Demande de changement et Travail réalisé ouvrent une page de formulaire (ci-dessous), puis écrivent le fichier.
- Ouvrir Plan ou Ouvrir Estimations : le rapport a besoin d'un choix que vous faites sur cette page. Le lien ouvre la page ; exportez depuis là.

Un rapport s'affiche seulement quand votre rôle voit la page qui contient son export. Le rapport Flux réseau s'affiche quand le projet a un fichier de flux. Quand il ne reste aucun rapport, Rapports n'a pas de pastille. Le menu Exporter de chaque page marche toujours.

Une page de formulaire a l'adresse `/library/reports/change-request` ou `/library/reports/work-done`, et le lien Rapports pour revenir. Remplissez les champs (une demande de changement demande Depuis la version, Jusqu'à la version et Personnes qui approuvent : Ajouter montre l'équipe avec une case par personne), puis cliquez sur Écrire le rapport. Un champ obligatoire vide donne une ligne d'erreur et n'écrit rien. Après l'écriture, la carte Écrit montre chaque fichier avec son chemin, Afficher dans le dossier et Ouvrir. Les cartes de droite listent les autres rapports avec un formulaire, les rapports sans formulaire (Tous les rapports) et les parties du dossier complet.

Le choix de format propose aussi PDF (macOS seulement) et Markdown ; chaque rapport texte peut s'écrire en Markdown. Un rapport écrit montre sa date et sa personne, Pages qui pointent vers un rapport liste les pages qui le citent, et Dossier complet demande le titre, le client et la date avant d'écrire.

### Mode d'emploi

Mode d'emploi est ce guide. Ouvrez-le avec Mode d'emploi dans le menu du compte, avec F1, avec la barre Demander ou avec la pastille Mode d'emploi de Bibliothèque. Il vient avec l'application, dans la langue de l'interface, et marche sans projet. Tapez un mot dans le champ de recherche pour trouver chaque section qui le contient. Ouvrir le mode d'emploi de cette page, dans la barre Demander, ouvre la page du lieu et la section que vous voyez.

Le manuel a une page par lieu, dans l'ordre de la barre latérale, et il s'ouvre sur Démarrer. Chaque page a une image. F1 ouvre le manuel pour chaque rôle, même pour un rôle qui ne voit pas Bibliothèque : le manuel est une aide. Sous une page, Poser une question sur cette page met une question sur la page dans l'assistant, Raccourcis ouvre les raccourcis clavier, et Manuel du projet ouvre le manuel du projet.

Un lien dans le texte d'une page, comme `adr:0003`, ouvre une carte qui l'explique. La carte dit si l'élément est dans le projet, et à quoi il est lié. Ouvrir et Expliquer avec un agent sont côte à côte. Plus montre les autres actions, et Copier la référence copie le nom de l'élément.
