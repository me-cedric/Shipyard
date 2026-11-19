# Bibliothèque

Bibliothèque contient les pages qui décrivent le projet : ce qu'il doit faire, comment il est construit, pourquoi c'est ainsi, et ce que l'équipe apprend et partage. Chaque élément est un fichier du projet.

Bibliothèque s'ouvre sur quatre portes. Chaque porte nomme ce que vous cherchez, et contient une pastille par page. Cliquez sur une pastille pour ouvrir sa page. Quand quelque chose vous attend, une pastille orange vient en premier et donne le nombre : les questions ouvertes, ou les décisions en attente. Une pastille marque une page dont la source a changé depuis. Une page que votre rôle ne voit pas n'a pas de pastille.

Bibliothèque n'a pas de sélecteur de sections. Sur chaque page de Bibliothèque, cliquez sur Bibliothèque en haut pour revenir aux portes.

## Lire et modifier un élément

1. Ouvrez une page, puis sélectionnez un élément. Ou cliquez sur l'action principale de la page pour en créer un. Sélectionnez un élément pour voir, dans l'inspecteur, les éléments qui le citent.
2. Un élément avec une image s'ouvre sur l'image seule. Un sélecteur en haut a trois choix : Image, Les deux (le texte et l'image côte à côte) et Texte. Un document a Lecture, Les deux et Texte. Shipyard garde votre choix. Il montre le texte de lui-même pour un nouveau fichier, quand quelqu'un a changé le fichier en même temps, et pour une erreur qui nomme une ligne.
3. Changez le texte ou le dessin, puis cliquez sur Enregistrer. L'application écrit le fichier entier ou rien.

- Rechercher : les listes ont un champ Rechercher. Il utilise la même recherche que la barre Demander.
- Supprimer : ouvrez le menu d'un élément (clic droit) et choisissez Supprimer, ou cliquez sur Supprimer dans l'inspecteur. L'application nomme le fichier et demande une fois. Le fichier va ensuite à la corbeille.
- Renommer : le menu de l'élément a Renommer. Tapez le nouveau nom ; l'extension reste. La revue liste chaque fichier et chaque ligne dont les liens changent. Renommer déplace ensuite le fichier et réécrit ces liens en une étape. Si une écriture échoue, chaque fichier reste comme il était.
- Demander à l'assistant : le dernier groupe du menu de l'élément. Choisissez une requête pour ce type d'élément et votre rôle. Elle remplit la zone de message avec l'élément, son fichier, sa spec, son ticket et les éléments qui le citent. Rien n'est envoyé avant votre envoi.
- Quand quelqu'un change le fichier en même temps, l'application vous le dit. Choisissez Recharger pour prendre sa version, ou Garder le mien.
- Un projet en lecture seule refuse l'enregistrement, la suppression et le renommage.

## Ce qu'il doit faire

### Spécifications

Spécifications liste ce que le produit fait aujourd'hui, avec les exigences de chaque spécification. Un changement d'une spécification commence par une proposition : voir la page Flux, Liste et La page d'une fonctionnalité, Cahier.

### Plans de test

Plans de test liste les scénarios de test. Chaque scénario nomme les exigences qu'il vérifie. Un plan s'ouvre en Lecture : une carte par scénario, avec ses étapes et ses étiquettes. Cliquez sur Modifier pour changer son texte. Un plan sans scénario s'ouvre dans son texte. Un constat du contrôle ouvre le plan dans son texte, à sa ligne.

### Questions

Questions est le registre des points ouverts : risques, hypothèses, problèmes, dépendances et questions.

- Filtrez par type, état et responsable.
- Cliquez sur Nouvelle question pour en ajouter une. Choisissez le responsable dans l'équipe.
- Après votre réponse à une question d'une spec, un clic copie la réponse dans la spec.

## Comment il est construit

### Carte

Carte dessine les éléments du projet et les liens entre eux. Filtrez par type. Une vue en tableau liste les mêmes éléments.

- Un élément que rien ne cite s'affiche comme orphelin.
- Un élément dont la source a changé depuis s'affiche comme périmé.
- Sélectionnez un élément pour l'ouvrir dans l'inspecteur.

Avec la source Code, la carte montre les dossiers du code. Une ligne entre deux dossiers est plus épaisse quand plus d'appels passent entre leurs fichiers. Sélectionnez un dossier pour voir ses fichiers, puis un fichier pour voir ses symboles et ce qui les appelle ou ce qu'ils appellent. Tout afficher revient à la carte. Indexer démarre le serveur d'index du code quand il est arrêté, construit l'index, et arrête le serveur. Si le programme se termine par une erreur, la page nomme le programme, son code de sortie et ses dernières lignes : corrigez la cause, puis cliquez de nouveau sur Indexer.

### Architecture

Architecture montre les modèles d'architecture du projet en vues. Les vues sont dessinées à partir du texte du modèle.

Un diagramme ou une image, dans Architecture et dans Écrans, s'ajuste à son cadre et se place au centre à l'ouverture. Pour le déplacer :

- Déplacer : faites-le glisser, ou utilisez un geste horizontal sur le pavé tactile. Une molette verticale fait défiler la page.
- Zoomer : pincez, ou maintenez Ctrl ou Cmd et tournez la molette.
- Clavier : cliquez sur le cadre pour lui donner le focus, puis appuyez sur les flèches pour déplacer, sur + ou - pour zoomer et sur 0 pour ajuster.
- Ajuster ramène tout le diagramme dans le cadre.

### Diagrammes

Diagrammes contient les dessins du projet : Excalidraw, Mermaid, draw.io et BPMN. Dessinez dans l'éditeur, puis enregistrez.

### Écrans

Écrans montre les écrans du produit et les jetons de design de votre projet. Ils viennent du document de conception (du CSS dans un bloc de code), d'un fichier `tokens.css`, d'un fichier `*.tokens.json` ou d'un bloc `@theme` de Tailwind 4, groupés par fichier. Sans jeton, la page dit Aucun jeton pour l'instant ; cliquez sur Ajouter des jetons au document de conception, modifiez le bloc, puis enregistrez. La page ne montre jamais les jetons de Shipyard.

- Un fichier `.fig` montre l'aperçu que Figma y garde.
- Pour lire Figma, ajoutez une fois le jeton de votre compte Figma. Il va dans le trousseau de votre ordinateur.
- Collez ensuite l'adresse d'un projet Figma et cliquez sur Lister les fichiers. Chaque fichier montre son aperçu et ses jetons de design.

### API

API montre les contrats d'API. Ouvrez un contrat pour lire ses routes. Essayez une route sur un serveur du contrat.

### Données

Données montre les modèles de données : les tables et les liens entre elles.

### Flux réseau

Flux réseau liste les flux réseau en tableau : d'où, vers où, le port et le protocole. Ajoutez, changez ou retirez une ligne, puis enregistrez.

## Pourquoi c'est ainsi

### Décisions

Décisions contient les relevés de décision (ADR). Chaque relevé donne une décision, les options et les raisons.

- Cliquez sur Nouvelle décision pour en écrire une. Un formulaire demande chaque partie.
- Acceptez ou rejetez une décision proposée en un clic.

### Règles du projet

Règles du projet contient les règles du projet que chaque changement doit suivre.

## Apprendre et partager

### Apprendre

Apprendre aide une nouvelle personne à trouver son chemin.

- Parcours : l'architecture, les décisions, puis les specs, dans l'ordre de lecture. Une étape que vous ouvrez compte comme faite.
- Glossaire : les mots que les specs définissent.
- Parcours de formation : cours, certifications et lectures, avec les experts de l'équipe qui peuvent aider. Choisissez une personne, puis cochez les étapes que cette personne a finies. Le tableau de progression de l'équipe montre chaque personne et chaque parcours.
- Fils d'actualité : les fils du projet. Collez l'adresse RSS ou Atom d'un site, puis cliquez sur S'abonner. L'application lit chaque fil et garde une copie pendant une heure.

### Manuel

Manuel contient les pages du manuel du projet. Lisez une page avec son sommaire sur le côté, ou passez en Édition pour la changer. En Édition, le sélecteur Lecture, Les deux, Texte montre la page comme vous la lisez, la page à côté de son texte, ou le texte seul. Cliquez sur Nouvelle page pour en ajouter une.

### Documents

Documents liste les documents du projet. Cherchez dans leur texte, renommez-les, supprimez-les, et lisez un fichier Word. Exportez le dossier d'architecture et la documentation fonctionnelle en fichiers Word, et une fiche client en fichier Excel. Chaque export ouvre une boîte Enregistrer sous avec le nom rempli et le dossier de votre dernier enregistrement ; Annuler n'exporte rien. Après un enregistrement, Afficher dans le dossier et Ouvrir agissent sur le nouveau fichier.

Un fichier Word a une page de garde, une table des matières (Word remplit les numéros de page quand il demande de mettre à jour les champs), les diagrammes Mermaid du projet en images, et des numéros de page. Un fichier LikeC4 ou draw.io s'affiche en image quand un PNG du même nom est à côté, et sinon par son chemin. Une feuille Excel a une ligne d'en-tête stylée qui reste à l'écran.

### Diapositives

Diapositives contient les présentations du projet. Chaque présentation est un fichier HTML dans `docs/slides/`, avec ses animations et ses étapes.

- Nouvelle présentation : tapez un nom. L'assistant s'ouvre avec une demande à un agent d'écrire la présentation. Lisez la demande, puis envoyez-la.
- Cliquez sur une présentation pour la montrer. Les flèches, Espace, Début et Fin parcourent les diapositives et les étapes.
- Présenter montre la présentation en plein écran. Appuyez sur Échap pour arrêter.
- Exporter en PDF : choisissez le fichier dans la boîte Enregistrer sous. Chaque diapositive devient une page. Cela marche sur macOS seulement.
- Une présentation plus ancienne écrite en texte s'affiche en lecture seule. Cliquez sur Convertir pour demander à un agent de la réécrire en présentation HTML.
- Pour supprimer une présentation, ouvrez son menu, puis cliquez sur Supprimer. Le fichier va à la corbeille.

### Tableaux de bord

Tableaux de bord contient des tableaux de tuiles : travail, exécutions, questions, qualité et plus. Ajoutez ou retirez une tuile, changez ses réglages, puis enregistrez. Afficher en tableau donne les nombres derrière un graphique. Faites glisser une tuile vers une autre colonne, ou utilisez ses boutons Déplacer à gauche et Déplacer à droite. Les tuiles que vous épinglez s'affichent en haut de Tableaux de bord. Une tuile dont la source est désactivée le dit.

Créer une tuile pour moi demande à un agent de proposer une tuile à partir de vos mots. Vous n'avez pas besoin de connaître les types de tuiles.

1. Cliquez sur Créer une tuile pour moi, à côté d'Ajouter une tuile.
2. Tapez ce que la tuile doit montrer, en mots simples. Par exemple : les questions ouvertes par responsable.
3. Budget (USD) est la limite de l'agent : l'agent s'arrête au budget, ou après 2 minutes. Sa dernière réponse peut dépasser un peu le budget. Le budget commence à 2 dollars. Moins de budget et Plus de budget le changent de 1 dollar.
4. Cliquez sur Créer. Pendant que l'agent travaille, Arrêter le termine. Le travail s'affiche aussi dans Équipe / Sessions, et son Arrêter fait de même.
5. Regardez la Tuile proposée. Accepter l'ajoute au tableau de bord et enregistre. Écarter l'abandonne.

L'agent ne fait que lire le projet. Le tableau de bord ne change pas avant votre clic sur Accepter. Si la page dit que le budget est épuisé, ajoutez du budget, puis cliquez de nouveau sur Créer. Un tableau de bord que vous ne pouvez pas changer n'a pas Créer une tuile pour moi.

### Rapports

Rapports liste chaque fichier que Shipyard peut créer pour une personne qui n'utilise pas Shipyard : un client, un responsable, un auditeur. Chaque rapport est une carte. Format, en haut, montre Tous les rapports, ou seulement les fichiers Word, les fichiers Excel ou les images.

- Exporter : Shipyard ouvre la boîte Enregistrer sous. Choisissez le dossier, puis enregistrez.
- Remplir le formulaire : Demande de changement et Travail réalisé demandent d'abord quelques valeurs, puis créent le fichier.
- Ouvrir Plan ou Ouvrir Estimations : le rapport a besoin d'un choix que vous faites sur cette page. Le lien ouvre la page ; exportez depuis là.

Un rapport s'affiche seulement quand votre rôle voit la page qui contient son export. Le rapport Flux réseau s'affiche quand le projet a un fichier de flux. Quand il ne reste aucun rapport, Rapports n'a pas de pastille. Le menu Exporter de chaque page marche toujours.

### Mode d'emploi

Mode d'emploi est ce guide. Ouvrez-le avec Mode d'emploi dans le menu du compte, avec F1, avec la barre Demander ou avec la pastille Mode d'emploi de Bibliothèque. Il vient avec l'application, dans la langue de l'interface, et marche sans projet. Tapez un mot dans le champ de recherche pour trouver chaque section qui le contient. Ouvrir le mode d'emploi de cette page, dans la barre Demander, ouvre la page du lieu et la section que vous voyez.
