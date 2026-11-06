# Équipe et droits

Le fichier d'équipe `.shipyard/team.yaml` liste les personnes du projet, leur rôle et leurs droits. Travail / Équipe le modifie. Un projet sans fichier d'équipe, ou sans admin, donne tous les droits à chaque personne.

## Rôles

Chaque membre a un rôle. Le rôle donne les droits, le premier onglet et les panneaux de Accueil / Aujourd'hui.

| Rôle | Premier onglet |
|---|---|
| Responsable produit | Travail / Backlog |
| Chef de projet | Travail / Tableau |
| Architecte | Conception / Décisions |
| Responsable technique | Usine / Exécutions |
| Analyste métier | Spécifications / Propositions |
| Développeur | Usine / Exécutions |
| Testeur | Spécifications / Plans de test |
| Designer | Conception / Écrans |
| Lecteur | Accueil / Aujourd'hui |

Un rôle ne cache jamais une page. Chaque personne peut ouvrir chaque page.

## Droits

Un droit désactive un contrôle. Le contrôle reste visible, et son infobulle donne le droit manquant et votre rôle.

- `work.edit` : tickets, backlog, tableau, plan, estimations, temps.
- `specs.edit` : propositions de spécification, capacités, questions, plans de test, constitution.
- `design.edit` : diagrammes, décisions, API, données, flux, écrans.
- `knowledge.edit` : manuel du projet, documents, présentations, tableaux de bord.
- `code.write` : commit, push, branche, ouverture d'une pull request.
- `code.merge` : fusion d'une pull request.
- `runs.start` : démarrer, arrêter et reprendre une exécution.
- `runs.approve` : approuver ce qu'un agent veut écrire, et son plan.
- `project.settings` : Réglages / Projet, automatisation, workflows, connexions, fichier d'équipe.
- `costs.view` : montants d'argent.

L'indicateur admin donne tous les droits. Un membre peut avoir des changements : `+code.merge` ajoute un droit, `-runs.approve` en retire un. Votre rôle personnel dans Réglages / Moi et le profil en lecture seule d'un projet ne peuvent que retirer des droits.

## Monter l'équipe

1. Ouvrez Travail / Équipe et cliquez sur Membre.
2. Saisissez le nom, l'identifiant, les e-mails et les comptes de l'outil de suivi des tickets et de l'hébergeur de code.
3. Choisissez un rôle. Les droits du rôle s'affichent avant l'enregistrement.
4. Cochez l'indicateur admin pour les personnes qui gèrent l'équipe.
5. Enregistrez.

Ajoutez l'admin en dernier : une équipe avec un admin ne donne des droits qu'aux personnes du fichier.

## Qui vous êtes

Shipyard vous trouve avec le compte d'une connexion ouverte, puis avec votre e-mail git. Travail / Équipe montre qui il a trouvé. Quand le fichier d'équipe a un admin et que vous n'y êtes pas, vous êtes lecteur : vous lisez chaque page et ne changez rien. Remplissez Demander à rejoindre et envoyez l'entrée copiée à un admin.

## Les droits viennent de la branche par défaut

Quand le projet a un dépôt distant, Shipyard lit les droits dans le fichier d'équipe de la branche par défaut. Un changement dans votre copie de travail ne donne aucun droit avant la fusion. Travail / Équipe vous prévient tant que les deux diffèrent. Protégez la branche par défaut chez votre hébergeur de code et exigez une relecture pour `.shipyard/team.yaml` : Shipyard ne peut pas arrêter une personne qui modifie des fichiers avec un autre outil.

## Déplacer les rôles de cet ordinateur

Si cet ordinateur garde des rôles par e-mail, Travail / Équipe propose de les écrire comme membres. Un ancien responsable fonctionnel devient responsable produit. Un ancien junior devient développeur sans `code.merge` ni `runs.approve`. Les modes de page des anciens profils sont abandonnés, et la liste les montre. Une personne avec `project.settings` confirme.

## Audit

Chaque écriture qui demande un droit, et chaque refus, ajoute une ligne au journal d'audit de votre ordinateur. Travail / Équipe montre les 100 dernières lignes à une personne avec `project.settings`.

## Boîte de réception

Accueil / À traiter montre ce que vous pouvez traiter : les approbations de vos droits, les questions de vos tickets ou de votre rôle, les relectures. Tout le monde montre le reste, avec les contrôles désactivés.
