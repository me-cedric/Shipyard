# Connaissances

Connaissances transforme les fichiers du projet en pages, documents, diapositives et leçons.

## Graphe

Graphe dessine les éléments du projet et les liens entre eux. Filtrez par type. Une vue tableau liste les mêmes éléments.

Sur le graphe de code, Indexer démarre le serveur du graphe de code s’il est arrêté, construit l’index, puis arrête le serveur. Si le programme se termine par une erreur, la page nomme le programme, son code de sortie et ses dernières lignes, puis donne une action : lisez les lignes, corrigez la cause, puis cliquez de nouveau sur Indexer.

- Un élément que rien ne cite s'affiche comme orphelin.
- Un élément dont la source a changé plus tard s'affiche comme périmé.
- Sélectionnez un élément pour l'ouvrir dans l'inspecteur.

## Manuel

Manuel contient les pages du manuel du projet. Lisez une page avec son sommaire sur le côté, ou passez à Modifier pour la changer. Cliquez sur Nouvelle page pour en ajouter une.

## Mode d'emploi

Mode d'emploi est ce guide. Ce n'est pas un onglet : ouvrez-le avec Mode d'emploi dans le menu du compte, avec F1 ou avec la palette. L'adresse `/knowledge/manual` l'affiche aussi. Il vient avec l'application et fonctionne sans projet. Il s'affiche dans la langue de l'application. Tapez un mot dans le champ de recherche pour trouver chaque page qui le contient. Ouvrez la palette et choisissez Ouvrir le mode d'emploi de cette page pour arriver à l'aide de la page que vous voyez.

## Documents

Documents liste les documents du projet. Cherchez dans leur texte, renommez-les, supprimez-les, et lisez un fichier Word. Exportez le dossier d'architecture et la documentation fonctionnelle en fichiers Word, et une fiche client en fichier Excel. Chaque export ouvre une boîte Enregistrer sous avec le nom rempli et le dossier de votre dernier enregistrement ; Annuler n'exporte rien. Après l'enregistrement, Afficher dans le dossier et Ouvrir marchent sur le nouveau fichier. Un fichier Word a une page de garde, un sommaire (Word remplit les numéros de page quand il propose de mettre à jour les champs), les diagrammes Mermaid du projet en images et des numéros de page. Un fichier LikeC4 ou draw.io apparaît en image quand un PNG du même nom est à côté, et sous forme de chemin sinon. Une feuille Excel a une ligne d'en-tête stylée qui reste visible.

## Diapositives

Diapositives contient les présentations du projet. Chaque présentation est un fichier HTML dans `docs/slides/`, avec ses animations et ses étapes.

- Nouvelle présentation : tapez un nom. L'assistant s'ouvre avec une demande pour qu'un agent écrive la présentation. Lisez la demande, puis envoyez-la.
- Cliquez sur une présentation pour l'afficher. Les flèches, Espace, Début et Fin parcourent les diapositives et les étapes.
- Présenter affiche la présentation en plein écran. Appuyez sur Échap pour arrêter.
- Exporter en PDF : choisissez le fichier dans la fenêtre Enregistrer sous. Chaque diapositive devient une page. Cela fonctionne sur macOS seulement.
- Une ancienne présentation écrite en texte s'affiche en lecture seule. Cliquez sur Convertir pour demander à un agent de la réécrire en HTML.
- Pour supprimer une présentation, ouvrez son menu, puis cliquez sur Supprimer. Le fichier va dans la Corbeille.

## Apprendre

Apprendre aide une nouvelle personne à trouver son chemin.

- Parcours : l'architecture, les décisions, puis les spécifications, dans l'ordre de lecture. Une étape que vous ouvrez compte comme faite.
- Glossaire : les mots que les spécifications définissent.
- Parcours de formation : cours, certifications et lectures, avec les experts de l'équipe qui peuvent aider. Choisissez une personne, puis cochez les étapes qu'elle a finies. Le tableau de progression de l'équipe montre chaque personne et chaque parcours.
- Fils : les fils d'actualité du projet. Collez l'adresse RSS ou Atom d'un site, puis cliquez sur S'abonner. L'application lit chaque fil et en garde une copie pendant une heure.

## Tableaux de bord

Tableaux de bord contient des tableaux de tuiles : travail, exécutions, questions, qualité et plus. Ajoutez ou retirez une tuile, changez ses réglages, puis enregistrez. Afficher en tableau donne les nombres derrière un graphique. Faites glisser une tuile vers une autre colonne, ou utilisez ses boutons Déplacer à gauche et Déplacer à droite. Épinglez une tuile pour la voir dans Accueil, Mon travail.
