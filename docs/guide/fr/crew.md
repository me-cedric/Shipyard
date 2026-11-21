# Équipe

L'équipe réunit les personnes et les agents du projet. Le sélecteur a cinq sections : Équipe, Recettes, Sessions, Dépenses et Droits. L'interrupteur Agents actifs est dans l'en-tête d'Équipe : désactivé, il arrête chaque agent et empêche les nouvelles exécutions. Arrêter tous les agents est dans Dépenses : il arrête chaque agent en cours et laisse les agents actifs, donc une nouvelle exécution peut démarrer.

Équipe s'ouvre sur les cartes. Personnes montre chaque personne en carte : le travail en cours, la charge, le rôle, les jours par semaine et les compétences. Agents montre chaque rôle d'agent avec son travail en cours. La page montre aussi les dépenses du travail ouvert et les recettes.

- Cliquez sur Membre pour ajouter une personne. Cliquez sur une carte pour ouvrir la page d'une personne.
- Sur la page d'une personne, saisissez le nom, l'identifiant, les e-mails et les comptes de l'outil de suivi et de l'hébergeur de code. Choisissez un rôle : les droits du rôle s'affichent avant l'enregistrement. Cochez admin pour les personnes qui gèrent l'équipe. Retirer de l'équipe est sur la même page.
- Ajoutez l'admin en dernier : une équipe avec un admin donne les droits seulement aux personnes du fichier.

## En direct

Le sélecteur Cartes et En direct est en haut d'Équipe. En direct montre les agents au travail. Chaque ligne montre un agent, sa fonctionnalité avec son état, et les fichiers et les specs que l'agent lit et modifie. Le filtre est Au travail, Terminée, Fichiers ou Specs. Survolez un agent pour voir sa réf. Faites un clic droit, ou appuyez sur la touche du menu contextuel, pour copier la réf. Cliquez sur la fonctionnalité pour ouvrir sa page.

## Recettes

Une recette est la liste des étapes qu'un agent suit sur une fonctionnalité. Recettes liste les recettes et les rôles des agents, chacun en carte avec les noms de ses étapes. Cliquez sur une carte pour la lire ou la changer, puis enregistrez. Un fichier cassé montre son erreur et sa ligne. La dernière bonne version continue de tourner.

Une recette s'ouvre dans un formulaire. Utilisez Formulaire et Texte pour passer du formulaire au texte YAML. Les deux modifient le même fichier.

- La page d'une étape montre aussi Type (agent, personne ou contrôle, selon l'étape), Tourne en même temps que d'autres étapes (activé quand l'étape n'attend aucune étape), Les sous-étapes tournent côte à côte et Mode. Une étape qui attend une personne a Qui approuve : seule une personne avec ce rôle l'approuve, et seul ce rôle reçoit sa carte dans Aujourd'hui. Dans Personnes, Peut écrire est Demande d'abord ou Seul : Seul est l'approbation « Ne plus demander pour cette recette ».
- Étapes : chaque étape est une carte avec les groupes Qui, Personnes, Fonctionnement et Limites. Fixez le rôle ou l'action, le niveau de modèle, l'effort, le mode, les prérequis, les outils et le contrôle de chaque étape. Plus montre les autres champs : espace de travail, pour chaque, enfants en parallèle, essais, limite de temps, budget, compétence, contexte neuf et tours de revue. Ajoutez, retirez et déplacez une étape vers le haut ou le bas.
- Limites : le délai de blocage en secondes. Activez Budget pour arrêter chaque exécution à un montant en USD, et Limite de tours pour mettre chaque exécution en pause après un nombre de tours. Les deux sont désactivés par défaut.
- Le formulaire vérifie la recette à chaque changement. Enregistrer reste désactivé tant qu'il montre un problème.
- Nouveau crée une recette à partir d'un modèle : feature, bug, spike, docs-update, review-only, spec-split ou bootstrap. Le menu Plus d'actions de la recette ouverte a Dupliquer, Renommer et Supprimer. Renommer et Supprimer refusent la recette par défaut du projet et une recette qu'une exécution utilise. Supprimer demande une confirmation.
- Un enregistrement depuis le formulaire garde les lignes de commentaire en haut du fichier. Utilisez Texte pour garder les autres commentaires.
- Un agent extérieur avec les outils Recettes activés (Configuration / Cet ordinateur, Agents extérieurs) peut lister, lire, vérifier et proposer une recette. Une proposition ne change pas le fichier : ouvrez la recette, lisez le diff, puis Appliquer ou Écarter.
- Écrit sans demander liste les permissions d'une recette (voir la page Flux, Approbations). Retirer demande une confirmation, puis enregistre pour toute l'équipe.

## Sessions

Sessions liste les sessions des agents : une exécution, une relecture de pull request, une estimation et la création d'une tuile. Cliquez sur une session pour l'afficher avec Ouvrir et Arrêter. Arrêter une exécution demande une confirmation. Arrêter une relecture met fin à la relecture. Arrêter une estimation met fin à l'agent, et la feuille garde ses valeurs. Arrêter la création d'une tuile y met fin, et le tableau de bord ne change pas. Les sessions terminées sont sur leur propre page.

Lecture seule affiche la sortie en direct d'une session quand son outil écrit un fichier d'historique que Shipyard sait lire (Claude Code et Codex le font). Sans fichier d'historique, le volet n'affiche aucune sortie. Prendre la main arrête la session après votre confirmation, puis lance la commande de reprise de son outil dans le terminal de Shipyard.

## Dépenses

Dépenses montre les jetons et l'argent que les agents ont utilisés, par jour et par personne, face aux budgets, et le taux de réussite des exécutions.

- Budgets liste chaque montant fixé, avec son propre Modifier. Sans budget fixé, il montre le formulaire. Cliquez sur un jour ou un membre pour remplir le formulaire.
- Cliquez sur une exécution pour ouvrir sa fonctionnalité.
- Itérations compte les requêtes que chaque exécution a envoyées au modèle.
- Les montants s'affichent par défaut. Désactivez Afficher les prix pour les masquer : une tuile d'argent montre alors le nombre de jetons. L'application retient l'interrupteur pour chaque projet.
- Prévenir à est le pourcentage d'un budget où l'alerte s'affiche. C'est 80 pour cent pour le projet, jusqu'à ce que vous cliquiez sur Modifier et fixiez un autre pourcentage de 1 à 100.
- Chaque limite d'une fonctionnalité, d'un jour et d'une personne a un choix Ensuite : Arrêter et demander (par défaut), Mettre en pause, Me demander ou Continuer. L'exécution s'arrête à 100 pour cent avec les trois premiers. Arrêter et demander écrit aussi un commentaire sur le ticket, Me demander demande dans l'application seulement, et Mettre en pause s'arrête sans question. Augmentez le budget pour continuer. Continuer fait du budget un simple avertissement : l'exécution continue, et l'alerte s'affiche une fois. Tout arrêter, le délai d'inactivité et le nombre maximal de tours arrêtent toujours l'exécution.

Comment les agents s'en sortent affiche des barres Processeur et Mémoire pour les processus des agents seulement, pas pour tout l'ordinateur. Chaque étape d'un run liste les appels d'outils de l'agent.

## Droits

Le fichier d'équipe `.shipyard/team.yaml` liste les personnes du projet, leur rôle et leurs droits. Équipe modifie les membres, et Droits montre les droits de chaque rôle. Un projet sans fichier d'équipe, ou sans admin, donne tous les droits à chaque personne.

### Rôles et droits

Chaque membre a un rôle : Responsable produit, Chef de projet, Architecte, Responsable technique, Analyste métier, Développeur, Testeur, Designer ou Lecteur. Le rôle donne les droits, la première page et les panneaux d'Aujourd'hui (voir Démarrer, Votre rôle).

Un droit désactive une commande. La commande reste visible, et son infobulle nomme le droit manquant et votre rôle. Un lieu ou une section se masque seulement quand l'équipe ne donne à votre rôle aucun accès.

- `work.edit` : tickets, la liste, le tableau, le plan, estimations, temps.
- `specs.edit` : changements de spec, spécifications, questions, plans de test, règles du projet.
- `design.edit` : diagrammes, décisions, API, données, flux réseau, écrans.
- `knowledge.edit` : manuel, documents, diapositives, tableaux de bord.
- `code.write` : commit, push, branche, ouvrir une pull request.
- `code.merge` : fusionner une pull request.
- `runs.start` : lancer, arrêter et reprendre une exécution.
- `runs.approve` : approuver ce qu'un agent veut écrire, et son plan.
- `plan.edit` : estimations, calendrier du plan et écriture d'un plan dans le suivi de tickets. Vos propres entrées de temps restent personnelles et n'en ont pas besoin.
- `project.settings` : Configuration / Ce projet, automatisation, recettes, connexions, le fichier d'équipe.
- `costs.view` : les montants d'argent.

Le statut admin donne tous les droits. Un membre peut avoir des écarts : `+code.merge` ajoute un droit, `-runs.approve` en retire un. Votre rôle personnel dans Configuration / Moi et le profil en lecture seule d'un projet ne peuvent que retirer des droits.

Code et fusion est une seule ligne : le niveau de Code et un interrupteur Fusion, qui règlent `code.write` et `code.merge`. Le niveau de Plan d'un rôle suit son niveau de Travail tant que vous ne le changez pas. Chaque rôle a un réglage Lieux : un lieu que vous désactivez est masqué pour ce rôle. Chaque rôle commence avec les lieux du design masqués : par exemple, un Product owner ne voit pas Code. Les droits par défaut ne changent pas.

### Qui vous êtes

Shipyard vous trouve par le compte d'une connexion ouverte, puis par votre e-mail git. Droits montre qui il a trouvé. Quand le fichier d'équipe a un admin et que vous n'y êtes pas, vous êtes lecteur : vous pouvez lire et ne rien changer. Remplissez Demander à rejoindre et envoyez l'entrée copiée à un admin.

### Les droits viennent de la branche par défaut

Quand le projet a un dépôt distant, Shipyard lit les droits dans le fichier d'équipe de la branche par défaut. Un changement dans votre copie de travail ne donne aucun droit avant sa fusion. Droits vous avertit tant que les deux diffèrent. Protégez la branche par défaut chez votre hébergeur de code, et exigez une revue pour `.shipyard/team.yaml` : Shipyard ne peut pas arrêter une personne qui modifie les fichiers avec un autre outil.

### Déplacer les rôles de cette machine

Si cette machine contient des rôles par e-mail, Droits propose de les écrire comme membres. Un ancien responsable fonctionnel devient responsable produit. Un ancien junior devient développeur sans `code.merge` ni `runs.approve`. Les modes de page des anciens profils sont abandonnés, et la liste montre chacun d'eux. Une personne avec `project.settings` confirme.

### Audit

Chaque écriture qui demande un droit, et chaque refus, ajoute une ligne au journal d'audit de votre machine. Droits montre les 100 dernières lignes à une personne avec `project.settings`.

## Pages

Une sous-page a sa propre adresse et un lien de retour, sans sélecteur de section.

- Équipe : `/crew/crew`. Le menu Plus contient En direct (`?view=live`) et Ajouter une personne. Une personne s'ouvre à `?member=<identifiant>`.
- Recettes : `/crew/recipes`. Une recette s'ouvre à `?recipe=<id>` et une étape à `&step=<id>`. Les fichiers des rôles d'agent sont dans le menu Plus.
- Sessions : `/crew/sessions`. Les sessions terminées sont à `?page=ended`.
- Droits : `/crew/rights`. Le fichier d'équipe est à `?page=team`.
- Dépenses : `/crew/spend`. Comment les agents s'en sortent est à `?page=how` et Budgets à `?page=budgets`. Afficher les prix, Ajouter une limite et les tableaux d'usage (`?page=usage`) sont dans le menu Plus.

## Demandes d'adhésion

Sur le fichier d'équipe, chaque personne qui demande à rejoindre s'affiche comme une carte avec la pull request. Comme règle le rôle, Refuser ferme la pull request, et Accepter écrit le rôle dans le fichier d'équipe et fusionne la pull request. Accepter demande le droit de fusionner. Accepter refuse une pull request qui change un autre fichier, une autre personne ou les droits de la nouvelle personne : il ajoute une personne avec le rôle choisi et sans admin.
