# Usine

L'Usine laisse des agents travailler sur des tickets. Chaque travail est une exécution. Une exécution suit un workflow : plan, travail, revue, puis une pull request.

## Exécutions

Exécutions montre les exécutions en six voies : En file, En cours, Vous attend, En revue, Prêt à fusionner et Terminé.

1. Cliquez sur Lancer une exécution, puis choisissez un ticket par son titre.
2. Ouvrez une exécution pour voir ses étapes, ses événements, ses changements et son coût.
3. Quand une exécution a besoin de vous, elle passe dans Vous attend. Approuvez son plan, répondez à sa question ou débloquez-la.
4. Annulez une exécution à tout moment.

### Quand une exécution ne peut pas continuer

Une exécution corrige d'abord ses problèmes seule. Un constat bloquant, un contrôle en échec, un conflit ou une branche vide lance un tour de correction sans clic. Les tours sont limités : 3 essais en échec par étape, 3 tours de retours et 8 tours de correction par exécution. La même panne deux fois de suite arrête l'exécution aussitôt.

L'exécution s'arrête alors et passe dans Vous attend. Le bandeau de l'exécution donne la cause en une phrase, les dernières lignes et ce que l'exécution a essayé. L'exécution écrit le même texte en commentaire sur le ticket, et le ticket reçoit l'étiquette `shipyard:blocked`.

Pour la relancer, faites l'une de ces actions :

- Saisissez un message et cliquez sur Débloquer. L'exécution reçoit un tour de plus et lit votre message.
- Répondez sur le ticket. Une réponse d'un membre de l'équipe débloque aussi l'exécution. Tant que le fichier d'équipe ne nomme pas d'admin, toute réponse compte : sur un outil de suivi public, nommez un admin.
- Cliquez sur Clore comme terminée quand l'exécution n'a changé aucun fichier et que le travail existe déjà.

Une exécution qui a épuisé un budget ou ses tours reste en pause. Augmentez le budget, puis cliquez sur Reprendre. Une pause due au budget du jour se termine seule à la première synchronisation du jour suivant.

Une exécution terminée ne redémarre pas seule. Cliquez sur Lancer, ou modifiez le ticket.

## Workflows

Workflows liste les workflows et les rôles des agents. Ouvrez-en un pour le lire ou le modifier, puis enregistrez. Un fichier cassé montre son erreur et sa ligne. La dernière bonne version continue de tourner.

Un workflow s’ouvre dans un formulaire. Utilisez Formulaire et Texte pour passer du formulaire au texte YAML. Les deux modifient le même fichier.

- Étapes : réglez le rôle ou l’action, le niveau de modèle, l’effort, le mode, les dépendances, les outils et la validation de chaque étape. Plus montre les autres champs : espace de travail, pour chaque, enfants en parallèle, nouveaux essais, limite de temps, budget, compétence, contexte neuf et tours de revue. Ajoutez, retirez et déplacez une étape vers le haut ou vers le bas.
- Limites : le délai d’inactivité en secondes. Activez Budget pour arrêter chaque exécution à un montant en USD, et Limite de tours pour mettre chaque exécution en pause après un nombre de tours. Les deux sont désactivés par défaut.
- Le formulaire vérifie le workflow à chaque changement. Enregistrer reste désactivé tant qu’il montre un problème.
- Nouveau crée un workflow à partir d’un modèle : feature, bug, spike, docs-update, review-only, spec-split ou bootstrap. Le menu Plus d’actions du workflow ouvert contient Dupliquer, Renommer et Supprimer. Dupliquer copie le workflow. Renommer et Supprimer refusent le workflow par défaut du projet et un workflow qu’une exécution utilise. Supprimer demande une confirmation.
- Un enregistrement depuis le formulaire garde les lignes de commentaire en haut du fichier. Utilisez Texte pour garder les autres commentaires.
- Un agent extérieur avec les outils Workflows activés (Réglages / Connexions / MCP) peut lister, lire, vérifier et proposer un workflow. Une proposition ne change pas le fichier : ouvrez le workflow, lisez le diff, puis Appliquer ou Écarter.

## Carte des agents

Carte des agents dessine les exécutions, leurs tickets, leurs sessions d’agent et les fichiers de leurs constats sous forme de graphe. Un nœud montre la clé et le titre du ticket, le nom de l’étape ou le nom du fichier. Survolez un nœud pour voir sa référence. Clic droit, ou touche menu contextuel, pour copier la référence. Cliquez sur une exécution ou une session pour ouvrir l’exécution. Le bouton tableau liste les mêmes nœuds pour le clavier.

## Sessions

Sessions liste les sessions d’agent des exécutions et celles de cet ordinateur. Cliquez sur une session d’exécution pour ouvrir l’exécution à cette étape. Arrêtez une session dont vous n’avez pas besoin.

L'interrupteur Agents arrête toutes les exécutions et empêche les nouvelles. Réactivez-le pour continuer.

## Consommation

Consommation montre les jetons et l'argent que les agents ont utilisés, par jour et par personne, face aux budgets, et le taux de réussite des exécutions.

- Budgets montre les montants fixés, avec Modifier. Sans budget, il montre le formulaire. Cliquez sur un jour ou une personne pour remplir le formulaire.
- Cliquez sur une exécution pour l’ouvrir.

- Itérations compte les requêtes que chaque exécution a envoyées au modèle.
- Les montants restent masqués jusqu'au clic sur Afficher les prix.

- Une alerte s'affiche à 80 pour cent d'un budget.
- Une exécution se met en pause à 100 pour cent. Augmentez le budget pour continuer.
