# Flux

Flux montre chaque fonctionnalité une fois, de l'idée à la fusion. Une fonctionnalité réunit un ticket de l'outil de suivi, un changement de spec, le travail d'un agent et une pull request. L'application garde une copie des tickets, donc Flux s'ouvre aussi sans réseau.

Le sélecteur a quatre sections : Flux, Liste, Terminé et Santé. Flux est le tableau. Il a cinq étapes :

| Étape | Ce qui s'y trouve |
|---|---|
| Idée | Un ticket sans travail, ou un changement de spec qui n'a que sa proposition. |
| Spec | Un changement de spec en cours, ou une exécution qui attend, planifie ou a son plan en revue. |
| Construction | Un agent travaille ou relit son propre travail. Une exécution en échec ou annulée reste ici, marquée comme arrêtée. |
| Revue | La pull request est ouverte, ou des changements sont demandés. |
| Prêt | La pull request est fusionnée, ou l'exécution est terminée. |

Une carte montre le titre, qui travaille sur la fonctionnalité et son état. Une carte qui vous attend a la couleur d'attention. Cliquez sur une carte pour ouvrir la page de la fonctionnalité. Le menu d'une carte a Arrêter, l'historique et Déplacer vers un statut de l'outil de suivi. Quand l'outil de suivi refuse le déplacement, la carte montre la raison.

La barre au-dessus du tableau contient le filtre Tout, Me concerne ou Les miens, Nouveau et Plus. Le filtre reste dans l'adresse.

Plus contient :

- Trouver une fonctionnalité : ouvre le champ de recherche. Trouvez une fonctionnalité par la clé de son ticket ou par son titre. Le texte reste dans l'adresse.
- Partir d'un ticket : ouvre Nouvelle fonctionnalité à sa liste de tickets.
- Agents actifs : l'interrupteur des agents. Désactivé arrête chaque agent et empêche les nouvelles exécutions. Réactivez-le pour continuer.

## Nouvelle fonctionnalité

Nouveau ouvre une page à part, avec un lien de retour vers le tableau et une question : Que voulez-vous construire ?

1. Tapez le titre.
2. Choisissez le type : Fonctionnalité, Bug ou Idée pour plus tard. Une idée crée seulement le changement de spec.
3. Choisissez la manière : Un agent écrit la spec, J'écris la spec, ou Construire tout de suite, sans spec.
4. Cliquez sur Créer.

Ajouter un document est à côté des types. Il prend un fichier Markdown, PDF ou Word, jusqu'à 20 Mio, et la page refuse un autre type. Créer copie chaque document dans le dossier `inputs` du changement, comme entrée de l'auteur de la spec. Limite est à côté de la recette, pour les voies qui font un ticket. C'est le plus d'argent que toutes les exécutions de la fonctionnalité peuvent dépenser, en dollars. Elle va dans `.shipyard/automation.yaml` par la clé du ticket.

Ou partez d'un ticket, sous les trois manières : trouvez un ticket sans exécution, puis cliquez sur Lancer un agent. Partir d'un ticket, dans Plus sur Flux, l'ouvre.

Chaque manière crée d'abord un changement de spec avec votre texte comme titre. Une manière est désactivée quand il vous manque le droit qu'elle demande.

## Liste

Liste montre les mêmes fonctionnalités dans un tableau : le titre, l'étape, qui et l'état. Elle contient aussi les commandes des tickets :

- Les pastilles Responsable, Étiquette et Agent filtrent les lignes. Amenez un ticket par sa clé.
- Dans Plus : le filtre par statut, et Importer. L'application montre d'abord le nombre. Elle n'écrit rien avant votre confirmation.
- Attribuer : choisissez une personne. L'application propose une personne selon les compétences et le temps libre. Le choix est le vôtre.
- Marquer pour l'agent : un clic donne le ticket aux agents.
- Nouveau changement, dans Plus, commence un changement de spec. Donnez-lui un titre simple : l'application crée l'identifiant à partir du titre. Depuis un ticket crée le changement avec le titre du ticket, met le texte du ticket dans la proposition et vous place sur la branche `specs/<id>`, pour que le changement reste à part du code.

## Terminé

Terminé contient les fonctionnalités prêtes et l'historique des exécutions : chaque exécution terminée et chaque exécution plus ancienne d'un ticket, la fin la plus récente d'abord. Trouver une fonctionnalité terminée a son propre champ dans Terminé. Plus ajoute ou retire des colonnes. Cliquez sur une ligne pour ouvrir sa fonctionnalité. La dernière exécution en échec d'un ticket reste aussi sur le tableau, avec Réessayer.

## La page d'une fonctionnalité

Chaque fonctionnalité a une page, `/flow/feature/<id>`. L'identifiant est la réf de l'une de ses parties : le ticket, le changement de spec, l'exécution ou la pull request. La page montre le titre, la ligne des étapes et un sélecteur de six sections : Histoire, Cahier, Conception, Changements, Contrôles et Discussion. Plus contient Ouvrir dans l'outil de suivi, Copier la référence et, sur une fonctionnalité arrêtée, Ce qui s'est passé. Retour revient à Flux avec sa recherche et son filtre, et Échap fait de même. Un lien vers une exécution ou une pull request ouvre cette page à la section de cette partie.

### Histoire

Histoire montre d'abord ce qui vous attend : les questions, les approbations, le plan avec ses actions, et la raison de l'arrêt d'un agent avec son action. Le plan en revue est une seule carte : les étapes, les fichiers que le plan change, ce que l'agent fait seul et ce qu'il demande d'abord. Approuvez le plan, ou écrivez ce qu'il faut changer et cliquez sur Renvoyer. Puis elle liste les événements en phrases simples. Ce qui s'est passé ouvre le journal complet, où Importants montre les questions, les erreurs, les changements d'état et les résultats, et Tous montre chaque événement. Requêtes et sessions montre les requêtes avec leur coût, le graphe de la recette et les sessions. Suivre montre une session en direct. Ouvrir dans le terminal reprend une session terminée.

La page du ticket s'ouvre par Modifier dans le menu d'une carte. Elle montre le ticket avec un titre et un texte modifiables, ses faits, ses commentaires et la marque de synchronisation avec l'outil de suivi. Retour revient à la fonctionnalité.

La colonne latérale montre l'agent (l'outil d'IA, le modèle, l'étape n sur m, le coût et le budget, le temps écoulé, avec Parler et Arrêter), le cahier, les changements et les personnes. Une fonctionnalité sans agent a Lancer un agent.

### Cahier

Cahier montre les faits du ticket et le changement de spec de la fonctionnalité comme des cartes d'exigence, chacune avec son test, et les tickets de la fonctionnalité. Les fichiers du changement s'ouvrent sur une page à part, avec un lien de retour vers Cahier. Un formulaire montre chaque partie du changement avec son état : manquante, brouillon ou terminée. Une vue en texte brut existe aussi. Cliquez sur Valider : chaque problème s'affiche sur sa partie, avec sa ligne. Suivez l'étape suivante que l'application montre, par exemple découper le travail en tickets. Un changement prend son titre dans le premier titre de sa proposition. L'identifiant reste le nom du dossier. Une fonctionnalité sans spec a Écrire la spec.

### Conception

Conception liste les décisions, les diagrammes, les écrans, les contrats d'API et les modèles de données qui citent une partie de la fonctionnalité.

### Changements

Changements montre la pull request de la fonctionnalité. Les fichiers modifiés s'ouvrent sur une page à part : Fichiers modifiés, avec l'arborescence, le compte des fichiers vus et un lien de retour vers Changements.

L'en-tête de la pull request montre le titre, l'état, la branche source et la branche cible et les lignes ajoutées et retirées. Le menu à côté de l'état ouvre la pull request dans le navigateur, copie sa réf et la ferme. Un brouillon a Marquer prête.

L'encadré de fusion dit en une ligne si la pull request peut fusionner, et sinon pourquoi. Trois segments suivent : les contrôles (réussis, en échec et en attente), les commentaires (les fils non résolus sur le total) et les approbations (les relecteurs qui ont approuvé, avec l'avis de chacun). Le bouton Fusionner est un bouton double. Cliquez sur Fusionner, puis confirmez. La confirmation nomme la méthode de fusion et a Annuler. La flèche ouvre les méthodes (Fusion, Squash, Rebase) quand l'hébergeur de code en propose plusieurs. Fusionner est désactivé quand la pull request est un brouillon, fermée ou fusionnée, quand il vous manque le droit de fusionner, ou quand l'hébergeur de code la bloque. Des contrôles en échec ou des changements demandés ne désactivent pas Fusionner : la confirmation nomme alors ce risque.

La colonne étroite montre les relecteurs avec leurs avis, les tickets et les exécutions liés, et les éléments qui citent la pull request.

Fichiers : chaque fichier commence replié, avec son chemin, son statut et ses lignes ajoutées et retirées. Cliquez sur un fichier pour lire son diff. L'arbre à gauche a un filtre. Tout déplier ouvre les 30 premiers fichiers qui correspondent au filtre, puis l'action devient « Déplier les 30 suivants ». Cochez la case d'un fichier pour le marquer comme vu. Le nombre de fichiers vus reste sur cet ordinateur, pour cette pull request et ce commit de tête.

Commentaires sur les lignes : le « + » dans la marge d'une ligne ajoute un commentaire à cette ligne. Il s'affiche sur les lignes que la pull request a ajoutées ou laissées telles quelles, jamais sur les lignes retirées. Ajouter à la revue ajoute le commentaire à votre revue en attente. Publier ce commentaire seul le publie tout de suite. La revue en attente reste sur cet ordinateur jusqu'à l'envoi ou l'abandon, et elle survit à un redémarrage. Envoyer la revue ouvre une boîte de dialogue : choisissez Commenter, Approuver ou Demander des changements. Demander des changements exige un texte de revue. Une revue prend 100 commentaires au plus.

Un commentaire que l'hébergeur de code ne peut pas placer sur une ligne va dans le texte de la revue, et un avis dit combien. Quand l'hébergeur de code ne publie qu'une partie de la revue, la page garde les autres commentaires en attente. Azure DevOps met chaque commentaire dans le texte de la revue, avec son fichier et sa ligne. Les réponses, Résoudre, le « + », Envoyer la revue et Commenter demandent le droit d'écrire sur l'hébergeur de code. Sans lui, chaque commande est désactivée et dit pourquoi.

Limites : GitHub et GitLab listent jusqu'à 3000 fichiers. Un fil montre ses 50 derniers commentaires. Les fils de revue de GitLab montrent les 100 premiers. L'application ne garde pas l'auteur d'une pull request.

Revue par un agent :

1. Cliquez sur Relire avec un agent sur une pull request ouverte. Un agent lit les changements au commit de tête, dans une copie en lecture seule. La revue est un brouillon : un résumé, un avis et des constats sur leurs lignes du diff.
2. Modifiez le résumé et l'avis, cliquez sur Supprimer sur un constat que vous ne voulez pas, puis cliquez sur Publier la revue. Une revue se publie une fois.
3. Dans Configuration / Ce projet, choisissez la revue par un agent de chaque pull request : Désactivée, Brouillon ou Publication. Publication ajoute une revue en commentaire et n'approuve jamais.

Une revue par un agent s'affiche dans Équipe / Sessions, où Arrêter la termine. Elle compte dans la limite d'agents et dans le budget du projet. Un projet en lecture seule la refuse.

### Contrôles

Contrôles montre les étapes de contrôle de l'exécution, les contrôles de la pull request avec l'état de la CI, le plan de test, les docs que le changement rend périmées et la ligne Impacts sur le reste du code. Corriger avec un agent demande à un agent de corriger les contrôles en échec.

### Discussion

Discussion a un bouton + à côté du champ de message. Il copie un fichier dans le dossier de l'exécution comme contexte : le prochain tour de l'agent le lit. Un fichier texte va jusqu'à 200 Kio et une image jusqu'à 2 Mio, et la discussion dit quelle limite un fichier plus gros dépasse. Mettre en pause est sur la carte Agent, entre Parler et Arrêter. L'agent finit son tour, puis l'exécution est en pause par une personne, garde sa place dans les limites et attend Reprendre. Discussion montre la conversation de la session de l'agent (le terminal en direct et les requêtes sont sous Pour les développeurs), la conversation de la pull request et les commentaires du ticket. La conversation de la pull request liste les commentaires généraux et les fils de revue dans l'ordre du temps. Cliquez sur Répondre pour répondre à un fil, sur Résoudre pour le fermer et sur Rouvrir pour l'ouvrir à nouveau. La zone d'écriture a Écrire et Aperçu. Commenter publie un commentaire général. Renvoyer à l'agent s'affiche pour une pull request qu'une exécution a ouverte.

## Approbations

Les approbations d'une exécution sont une seule question qui nomme chaque effet.

- Le bouton principal approuve chaque effet.
- Étape par étape ouvre la liste où vous approuvez ou rejetez un seul effet.
- Pas encore déplace la question vers Plus tard et ne décide rien.
- Ne plus demander pour cette recette permet exactement les types d'écriture affichés pour cette recette. Un push qui réécrit l'historique n'en fait jamais partie. Une écriture qui attend déjà garde sa question : la permission vaut pour les écritures suivantes.

Équipe / Recettes et Configuration / Ce projet listent les permissions de chaque recette, avec Retirer.

## Quand un agent s'arrête

Une exécution corrige d'abord ses propres problèmes. Un constat bloquant, un contrôle rouge, un conflit ou une branche vide lance un tour de correction sans clic. Les tours sont limités : 3 essais en échec par étape, 3 tours de retours et 8 tours de correction par exécution. Le même échec deux fois de suite arrête l'exécution tout de suite.

Ensuite l'exécution s'arrête, et la fonctionnalité vous attend. La page dit l'état en mots simples, la cause en une phrase et ce que l'exécution a essayé, avec une action principale. Aujourd'hui et la barre Demander donnent la même action. L'exécution écrit aussi le même texte en commentaire sur le ticket, et le ticket reçoit l'étiquette `shipyard:blocked`.

| Action | Quand |
|---|---|
| Répondre | L'agent a posé une question. |
| Débloquer | L'exécution est bloquée. Tapez un message : l'exécution reçoit un tour de plus et le lit. |
| Ajouter du budget | L'exécution a dépensé son budget ou ses tours. Augmentez le budget, puis l'exécution continue. |
| Reprendre | L'exécution est en pause. |
| Reprendre la main | L'exécution est bloquée. Elle se termine comme annulée avec la raison « Repris par » et votre nom, la branche et le worktree restent, le ticket est à vous et le worktree s'ouvre dans votre éditeur. |
| Réessayer | L'exécution a échoué ou a été annulée. Une nouvelle exécution commence. |
| Clore comme terminée | L'exécution n'a changé aucun fichier et le travail est déjà là. |

Une réponse d'un membre de l'équipe sur le ticket débloque aussi l'exécution. Tant que le fichier d'équipe ne nomme aucun admin, toute réponse compte : sur un outil de suivi public, nommez un admin. Une pause pour le budget du jour n'a pas d'action : elle se termine d'elle-même à la première synchronisation du jour suivant. Une exécution terminée ne recommence pas d'elle-même.

## Santé

Santé montre la santé du produit : les contrôles du projet et les scanners de sécurité. Chaque rôle la voit. Une personne sans droit sur le code voit les étapes de contrôle avec leur état, et Lancer, Configurer, le terminal et Installer sont désactivés. Le titre dit combien de contrôles sont à corriger.

Un contrôle commence après votre clic. Pendant qu'il tourne, la carte montre En cours, le temps qui s'écoule et les dernières lignes de la sortie. Il continue quand vous quittez la page. Ouvrir dans le terminal, sur un contrôle, lance sa commande dans le tiroir du terminal. Le bouton d'information de chaque carte dit ce qu'elle cherche, pourquoi c'est important et quoi faire en cas d'échec. Chaque constat montre son fichier et sa ligne.

Les scanners sont :

- secrets : les clés et les jetons dans les fichiers suivis. Mettez `shipyard:allow-secret` sur la ligne d'une donnée de test, ou sur la ligne d'avant, pour l'ignorer.
- dépendances : les vulnérabilités connues (CVE) dans les fichiers de verrouillage, avec `osv-scanner`. Notez un constat relu dans `.osv-scanner.toml`.
- code : les problèmes OWASP comme l'injection, le XSS et l'exécution de code à distance, avec `semgrep`. Mettez `// nosemgrep` sur la ligne d'un faux positif relu.
- compétences : les instructions dangereuses dans les compétences d'agent, avec `skillspector`.

La liste des composants logiciels (SBOM, « software bill of materials ») nomme chaque bibliothèque que le projet utilise, avec sa version. Exportez-la quand un client ou une équipe de sécurité demande quels logiciels le projet contient.

La fraîcheur des docs liste les docs qui n'ont pas suivi le code de la branche, avec le nombre. Le même avertissement s'affiche dans le contrôle du commit, le contrôle du push et la chaîne des docs d'Impacts. Chaque doc périmée a « Mettre à jour avec un agent ». Une exécution d'agent ne commence qu'après votre clic, et la pull request qu'elle ouvre attend votre revue. « Acquitter » garde un avertissement tel quel, avec une raison.

## Impacts

Impacts dit quels éléments un changement touche, et propose un plan d'action. Il s'ouvre comme une page depuis les Contrôles d'une fonctionnalité : cliquez sur Impacts sur le reste du code. Il montre les fichiers modifiés, le code qui en dépend et les docs qui deviennent périmées. Corriger les documents périmés avec un agent ne lance une exécution qu'après votre clic. La page `/flow/impacts` reste. Elle demande l'accès au code.

Rapport d'impact complet ouvre le rapport comme une page : la taille du changement par Code, Spécifications, Documents, Tests et Personnes, le plan d'action et le résumé. Écrire le rapport de nouveau en crée un autre. Rapports passés liste les plus anciens. Copier le brief copie le brief pour un agent.

## Pull requests

Pull requests est une page de Code, avec un lien de retour vers Code / Maintenant. Elle a une recherche, le filtre Tout ou À relire par moi et Nouvelle pull request. Les ouvertes viennent d'abord. Les fusionnées et les fermées sont derrière un seul bouton. Choisissez une pull request pour voir sa revue : les contrôles, les changements demandés et les relecteurs. Ouvrir la pull request ouvre la page de sa fonctionnalité.

Nouvelle pull request est aussi une page. Écrivez le titre et la description (Écris-le pour moi demande à un agent). Choisissez Vers, la branche qui reçoit le changement. Réglez Brouillon et Étiquettes. Avant l'envoi, une note nomme les fichiers non validés, une branche de base en avance et les docs qui deviennent périmées : chacun a son choix. Cliquez sur Ouvrir la pull request.

## Code host et tickets

- Dans la section Contrôles d'une pull request, Relancer demande au code host de relancer les contrôles en échec, et seulement ceux-là. Il faut le même droit que pour une autre écriture sur le code host.
- Sur Nouvelle pull request, Relecteurs liste les utilisateurs du code host, et l'ouverture demande au code host de les ajouter. Fusionner avec règle la méthode par défaut du bouton Fusionner des pull requests suivantes : il ne fusionne jamais seul. Après l'ouverture, la page garde Fermer la pull request, et Marquer comme prête pour un brouillon.
- Chaque ligne de pull request montre l'avatar de son auteur.
- Dans le rapport d'impact, chaque ligne du plan d'action a une case à cocher et un responsable. Les deux vont dans le fichier du rapport, comme une case Markdown et un nom. Une ligne ne crée aucun ticket. Ajouter une ligne termine la liste.
- Un ticket a une ligne Recette (l'étiquette `wf:<id>` qui choisit la recette) et une ligne Version. Une version est la version de l'outil de suivi : la version corrigée de Jira, le jalon de GitHub et de GitLab, l'itération d'Azure DevOps et le projet de Linear. Un ticket a une seule version.
