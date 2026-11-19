# Code

Code travaille sur le dépôt git du projet. Vous n'avez pas besoin de connaître les commandes git : chaque action a un bouton. Le sélecteur a quatre sections : Maintenant, Historique, Branches et Terminal.

## Maintenant

Maintenant est un court résumé : les fichiers à committer et les pull requests ouvertes, une ligne vers la santé du produit, et les actions Branche de travail, Terminal, Fichiers et Ouvrir une pull request.

La carte des fichiers à committer montre les trois premiers fichiers avec les lignes ajoutées et retirées, un lien vers les autres fichiers, un seul message de commit, Écrivez-le pour moi et Commit. Le lien ouvre la page des changements locaux.

1. Cochez les fichiers à garder dans une liste plate. Tout choisir et Ne rien choisir cochent toute la liste. Ou abandonnez un changement.
2. Écrivez le message de commit, ajoutez une description si vous le voulez, puis cliquez sur Commit. Un commit prend seulement les fichiers cochés. Le bouton Commit de la carte de la marque de synchronisation fait de même depuis toute page.

- Écris-le pour moi demande à l'assistant un message à partir des fichiers indexés. Rien n'est envoyé avant votre envoi.
- Un groupe sans fichier montre une ligne discrète, comme « Rien d'indexé ».
- Un fichier renommé s'affiche sous son nouveau chemin, avec l'ancien : `ancien → nouveau`. L'indexer ou abandonner son changement agit sur les deux chemins.
- Quand deux changements se rencontrent sur les mêmes lignes, une vue de conflit montre les deux côtés. Choisissez-en un, écrivez le résultat, ou confiez-le à un agent.

Les pull requests de l'hébergeur de code viennent ensuite. La liste a une recherche et deux filtres. Tout montre chaque pull request. À relire montre les pull requests ouvertes qui ne sont pas des brouillons, attendent une revue et n'ont pas de demande de changements. Les pull requests ouvertes s'affichent d'abord. Le bouton Fusionnées et fermées montre les deux autres groupes, chacun avec son nombre. Une ligne montre le numéro, le titre, la marque de brouillon, l'état des contrôles et l'état de la revue. Ouvrir une pull request en commence une : Rédiger avec un agent remplit le titre et le corps à partir des changements de la branche, du ticket lié et du changement de spec lié, et rien ne s'ouvre avant votre clic sur Ouvrir.

Cliquez sur une ligne pour ouvrir la pull request sur la page de sa fonctionnalité, section Changements (voir la page Flux, La page d'une fonctionnalité). Une pull request prête montre Fusionner : il ouvre cette page, où vous confirmez la fusion.

Deux portes en bas ouvrent Santé du produit (Flux / Santé) et les fichiers du projet.

## Historique

Historique liste les commits, le plus récent d'abord. Sélectionnez un commit pour voir ses fichiers et ses changements. Chaque auteur a une photo de profil : de GitHub pour une adresse no-reply de GitHub, sinon de Gravatar, ou les initiales quand il n'y en a pas. Shipyard n'envoie à Gravatar qu'une empreinte de l'adresse.

## Branches

Branches liste les branches de cet ordinateur et du serveur. Créez, changez de, fusionnez ou supprimez une branche. L'application ne supprime jamais la branche sur laquelle vous travaillez.

Le sélecteur de branche, dans la carte de la marque de synchronisation et sur Code / Maintenant, a un champ de filtre. Tapez pour réduire la liste, déplacez-vous avec les flèches et appuyez sur Entrée. Une branche distante s'extrait comme une nouvelle branche locale qui la suit. La ligne Nouvelle branche crée une branche à partir de celle sur laquelle vous travaillez.

## Terminal

Terminal est une ligne de commande dans le dossier du projet. Le bouton Terminal de Code / Maintenant et l'action Terminal de la barre Demander ou dire à Shipyard ouvrent la même ligne de commande dans le tiroir du terminal, depuis toute page. Quand le shell se termine, cliquez sur Relancer. Un lien dans la sortie s'ouvre dans votre navigateur.

## Synchroniser

Une marque au bout droit de la rangée du haut de chaque page montre l'état du dépôt : Échec de la synchronisation, le nombre de fichiers modifiés, Pas encore partagé, en retard, en avance ou À jour. Cliquez dessus pour ouvrir une carte avec les fichiers modifiés, la branche de travail et les boutons de synchronisation et de commit. Un lien de la carte ouvre Code / Maintenant.

Synchroniser prend les changements de l'équipe et met votre branche à jour. La flèche jointe ouvre Récupérer seulement et Push. Envoyer vos commits au serveur est une action à part. L'application ne force jamais un push.
