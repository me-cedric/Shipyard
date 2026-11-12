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

Historique liste les commits, le plus récent en premier. Sélectionnez un commit pour voir ses fichiers et ses changements. Chaque auteur a une photo de profil : celle de GitHub pour une adresse no-reply de GitHub, sinon celle de Gravatar, ou les initiales s'il n'y en a pas. Shipyard n'envoie à Gravatar qu'une empreinte de l'adresse.

## Branches

Branches liste les branches de cet ordinateur et du serveur. Créez, changez, fusionnez ou supprimez une branche. L'application ne supprime jamais la branche sur laquelle vous travaillez.

Le sélecteur de branche de la barre du haut a une zone de filtre. Tapez pour réduire la liste, déplacez-vous avec les flèches et appuyez sur Entrée. Une branche distante s'extrait comme une nouvelle branche locale qui la suit. La ligne Nouvelle branche crée une branche à partir de la branche sur laquelle vous travaillez.

## Pull requests

Pull requests liste les pull requests de l'hébergeur de code. La liste a une recherche et deux filtres. Toutes montre chaque pull request. À relire montre les pull requests ouvertes qui ne sont pas des brouillons, attendent une relecture et n'ont pas de demande de modifications. Les lignes sont en trois groupes : Ouvertes, Fusionnées et Fermées, chacun avec son compte. Une ligne montre le numéro, le titre, la marque brouillon, l'état des vérifications et l'état de la relecture. Une ligne ne montre pas d'auteur : l'application ne le garde pas. Ouvrir une pull request en démarre une nouvelle.

Cliquez sur une ligne pour ouvrir la pull request sur sa propre page. Retour revient à la liste avec la même recherche et le même filtre.

### La page

L'en-tête montre le titre, l'état, la branche source et la branche cible, et les lignes ajoutées et retirées. Le menu à côté de l'état ouvre la pull request dans le navigateur, copie sa référence et la ferme. Un brouillon a Marquer prête dans l'en-tête. Les quatre onglets sont Vue d'ensemble, Commits, Contrôles et Fichiers modifiés, chacun avec son compte. L'onglet reste dans l'adresse.

La boîte de fusion ouvre la vue d'ensemble. Elle dit en une ligne si la pull request peut fusionner, et pourquoi non. Trois segments suivent :

- Contrôles : les vérifications réussies, en échec et en cours.
- Commentaires : les fils non résolus sur tous les fils.
- Approbations : les relecteurs qui ont approuvé, avec l'avis de chacun.

Le bouton Fusionner est un bouton scindé. Cliquez sur Fusionner, puis confirmez. La confirmation nomme la méthode de fusion et a Annuler ; elle reste occupée pendant la fusion. La flèche ouvre le menu des méthodes (Fusion, Squash, Rebase) quand l'hébergeur de code en offre plus d'une. Fusionner est désactivé quand la pull request est un brouillon, fermée ou fusionnée, quand vous n'avez pas le droit de fusionner, ou quand l'hébergeur de code la bloque. La ligne de la boîte dit pourquoi. Des vérifications en échec ou des modifications demandées ne désactivent pas Fusionner : la confirmation nomme alors ce risque et la méthode.

### Vue d'ensemble

La vue d'ensemble montre la description en Markdown, les actions de la revue par un agent (voir plus bas) et la conversation. La colonne étroite montre les relecteurs avec leur avis, les tickets et exécutions liés, et Cité par : les éléments qui citent la pull request. Elle ne montre ni étiquette, ni assigné, ni projet, ni jalon.

La conversation liste les commentaires généraux et les fils de revue dans l'ordre du temps, avec l'auteur, la date et l'heure. Quand l'hébergeur de code n'a rendu que les commentaires les plus récents, une note le dit. Un fil montre son fichier et sa ligne et ses commentaires. Cliquez sur Répondre pour répondre à un fil, sur Résoudre pour le fermer et sur Rouvrir pour l'ouvrir de nouveau. Un fil résolu se replie sur une ligne. Un fil qui est revenu avec moins de commentaires qu'il n'en a dit « Affichage des 50 derniers commentaires sur N ».

La zone d'écriture sous la conversation a Écrire et Aperçu. Commenter publie un commentaire général. Renvoyer à l'agent s'affiche pour une pull request qu'une exécution a ouverte. Fermer demande d'abord, puis ferme la pull request. Envoyer la revue ouvre la boîte décrite plus bas ; tant qu'une revue attend, la barre de revue a ce bouton et la zone d'écriture non.

### Fichiers modifiés

Chaque fichier démarre replié, avec son chemin, son statut et ses lignes ajoutées et retirées. Cliquez sur un fichier pour lire son diff, avec les numéros de ligne. L'arbre à gauche a un filtre. Cliquez sur un fichier de l'arbre pour y aller. Tout déplier ouvre les 30 premiers fichiers qui correspondent au filtre. Tant que d'autres fichiers restent repliés, l'action dit « Déplier les 30 suivants ». Tout replier les ferme. Cochez la case d'un fichier pour le marquer comme vu. Le compte « n / total vus » reste sur cet ordinateur, pour cette pull request et ce dernier commit.

### Commentaires sur les lignes

Le « + » dans la gouttière d'une ligne ajoute un commentaire sur cette ligne. Il s'affiche sur la ligne que vous pointez ou que vous atteignez avec les flèches (le diff est un seul arrêt de tabulation), sur les lignes que la pull request a ajoutées ou laissées telles quelles, jamais sur les lignes retirées : les commentaires vont sur le côté nouveau du diff seulement. La zone a deux boutons :

- Ajouter à la revue ajoute le commentaire à votre revue en attente.
- Publier ce commentaire seul le publie tout de suite, comme une revue d'un seul commentaire.

Annuler demande avant d'abandonner un texte. Un commentaire en attente s'affiche sous sa ligne avec la marque En attente, et Modifier et Supprimer.

La revue en attente reste sur cet ordinateur jusqu'à ce que vous l'envoyiez ou l'abandonniez. Elle survit à un redémarrage. La barre de revue au-dessus des onglets compte les commentaires en attente et a Envoyer la revue et Abandonner. Quand le navigateur refuse d'enregistrer, la page dit « Ce commentaire n'est pas enregistré sur cet ordinateur » et garde le commentaire jusqu'à la fermeture de la page.

Envoyer la revue ouvre une boîte. Choisissez un avis : Commenter, Approuver ou Demander des changements. Demander des changements a besoin d'un texte de revue. Une revue prend 100 commentaires au plus : au-delà, la boîte dit combien en retirer et Envoyer la revue reste désactivé. Cliquez sur Envoyer la revue pour publier tous les commentaires en attente comme une seule revue. La boîte garde votre texte jusqu'à la publication de la revue.

Un commentaire que l'hébergeur de code ne peut pas placer sur une ligne va dans le texte de la revue, et un avis dit combien. Un commentaire sur une ancienne version du fichier est marqué « Sur une version plus ancienne » et va dans le texte. Quand l'hébergeur de code ne publie qu'une partie de la revue, la page efface les commentaires envoyés et garde les autres en attente. Un refus de toute la revue montre le texte du refus et garde chaque commentaire. Azure DevOps met chaque commentaire dans le texte de la revue, avec son fichier et sa ligne.

Un commentaire sur une ligne que la pull request n'a plus s'affiche au pied de son fichier. Un commentaire sur un fichier qui a quitté la pull request s'affiche dans le groupe « Commentaires sur des fichiers qui ne sont plus dans cette pull request ».

Répondre, Résoudre, le « + », Envoyer la revue et Commenter demandent le droit d'écrire sur l'hébergeur de code. Sans ce droit, chaque commande est désactivée et dit pourquoi.

### Limites

- GitHub et GitLab listent jusqu'à 3000 fichiers. Une liste plus longue montre « Seuls les N premiers fichiers sont affichés ».
- Un fil montre ses 50 derniers commentaires.
- Les commentaires généraux montrent les plus récents. Les fils de revue GitLab montrent les 100 premiers.
- La liste ne montre pas d'auteur.

### Revue par un agent

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

### Lancer un contrôle ou un scanner

Un lancement démarre après votre clic. Pendant qu'il tourne, la carte affiche En cours, le temps qui s'écoule et les dernières lignes de la sortie, et Lancer reste désactivé. Le lancement continue quand vous quittez la page. Ouvrir dans le terminal, sur un contrôle, exécute sa commande dans le tiroir du terminal. Le bouton d'information de chaque carte dit ce qu'elle cherche, pourquoi c'est important et que faire en cas d'échec.

Les scanners sont :

- secrets : clés et jetons dans les fichiers suivis. Mettez `shipyard:allow-secret` sur la ligne d'une donnée de test, ou sur la ligne avant elle, pour l'ignorer.
- dependencies : vulnérabilités connues (CVE) dans les fichiers de verrouillage, avec `osv-scanner`. Notez un constat examiné dans `.osv-scanner.toml`.
- code : failles OWASP comme l'injection, le XSS et l'exécution de code à distance, avec `semgrep`. Mettez `// nosemgrep` sur la ligne d'un faux positif examiné.
- skills : instructions dangereuses dans les skills d'agent, avec `skillspector`.

## Impacts

Impacts dit quels éléments un changement touche, et propose un plan d'action.

## Terminal

Le bouton Terminal de la barre du haut ouvre une ligne de commande dans le dossier du projet, dans le tiroir du terminal. Terminal n'est pas un onglet. L'adresse `/code/terminal` ouvre aussi le tiroir. Quand le shell se termine, cliquez sur Relancer. Un lien dans la sortie s'ouvre dans votre navigateur.

## Synchronisation

L'action de synchronisation de la barre d'état récupère les changements de l'équipe et met votre branche à jour. Le bouton Synchroniser de la barre du haut montre de combien de commits vous êtes en avance et en retard. L'envoi de vos commits au serveur est un clic séparé. L'application ne force jamais un push.
