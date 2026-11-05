# Code

Code travaille sur le dépôt git du projet. Vous n'avez pas besoin de connaître les commandes git : chaque action a un bouton.

## Modifications locales

Modifications locales liste les fichiers que vous avez changés, sous forme d'arbre.

1. Sélectionnez un fichier pour voir ce qui a changé.
2. Indexez les fichiers à garder. Ou annulez un changement.
3. Écrivez un court message dans la commande de commit de la barre d'état, puis cliquez sur Commit. Un commit prend seulement les fichiers indexés.

Un fichier renommé s'affiche sous son nouveau chemin, avec l'ancien : `ancien → nouveau`. L'indexer ou annuler son changement agit sur les deux chemins.

Quand deux changements se rencontrent sur les mêmes lignes, une vue de conflit montre les deux côtés. Choisissez-en un, ou écrivez le résultat.

## Historique

Historique liste les commits, le plus récent en premier. Sélectionnez un commit pour voir ses fichiers et ses changements.

## Branches

Branches liste les branches de cet ordinateur et du serveur. Créez, changez, fusionnez ou supprimez une branche. L'application ne supprime jamais la branche sur laquelle vous travaillez.

Le sélecteur de branche de la barre du haut a une zone de filtre. Tapez pour réduire la liste, déplacez-vous avec les flèches et appuyez sur Entrée. Une branche distante s'extrait comme une nouvelle branche locale qui la suit. La ligne Nouvelle branche crée une branche à partir de la branche sur laquelle vous travaillez.

## Pull requests

Pull requests liste les pull requests de l'hébergeur de code. Ouvrez-en une pour la lire, la commenter, l'approuver, demander des changements ou la fusionner. La fusion reste désactivée pour un brouillon. L'application redemande avant une fusion dont les vérifications échouent.

Actions d'agent sur une pull request :

1. Cliquez sur Relire avec un agent sur une pull request ouverte. Un agent lit les changements au dernier commit, dans une copie en lecture seule. Il suit la compétence de relecture et le rôle de relecteur du projet quand il en a. La revue est un brouillon : un résumé, un verdict et des remarques qui s'affichent sur leurs lignes du diff.
2. Modifiez le résumé et le verdict, cliquez sur Retirer sur une remarque dont vous ne voulez pas, puis cliquez sur Publier la revue. Une revue se publie une seule fois.
3. Dans le formulaire d'une nouvelle pull request, cliquez sur Rédiger avec un agent. L'agent remplit le titre et le texte à partir des changements de la branche, du ticket lié et du changement de spécification lié. Il suit la compétence pr-flow quand le projet l'a. Rien ne s'ouvre avant votre clic sur Ouvrir.
4. Dans Réglages / Projet, choisissez la revue par un agent de chaque pull request : Désactivée, Brouillon ou Publication. Brouillon garde un brouillon pour chaque nouveau dernier commit sur la page de la pull request. Publication ajoute une revue en commentaire et n'approuve jamais.

Une revue s'affiche dans Usine / Sessions, où Arrêter la termine, et compte dans la limite des agents. Un brouillon en attente s'affiche dans Accueil / À traiter avec un lien vers sa pull request. Publier la revue place chaque remarque sur sa ligne sur GitHub et GitLab. Une ligne que le diff ne montre pas va dans le texte de la revue. Azure DevOps met toutes les remarques dans le texte de la revue.

Une revue par un agent compte dans le budget du projet. L'interrupteur Agents arrêtés, le budget et la limite d'exécutions l'arrêtent. Un projet en lecture seule refuse les trois actions.

## Qualité

Qualité lance les vérifications du projet et les scanners de sécurité, après votre clic. Chaque résultat montre son fichier et sa ligne.

La liste des composants logiciels (SBOM, « software bill of materials ») nomme chaque bibliothèque que le projet utilise, avec sa version. Exportez-la quand un client ou une équipe de sécurité demande quels logiciels le projet contient.

La fraîcheur de la documentation est une vérification de Qualité. Elle liste les documents qui n'ont pas suivi le code de la branche, avec leur nombre. Le même avertissement s'affiche dans la porte de commit, la porte de push et la chaîne documentaire d'Impacts. Chaque document périmé a « Mettre à jour avec un agent ». Une exécution d'agent ne démarre qu'après votre clic, et la pull request qu'elle ouvre attend votre relecture. Un document que l'agent a laissé illisible est nommé et reste hors de la pull request. « Acquitter » garde un avertissement tel quel, avec un motif.

## Impacts

Impacts dit quels éléments un changement touche, et propose un plan d'action.

## Terminal

Terminal ouvre une ligne de commande dans le dossier du projet. Quand le shell se termine, cliquez sur Relancer. Un lien dans la sortie s'ouvre dans votre navigateur.

## Synchronisation

L'action de synchronisation de la barre d'état récupère les changements de l'équipe et met votre branche à jour. L'envoi de vos commits au serveur est un clic séparé. L'application ne force jamais un push.
