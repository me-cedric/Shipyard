# Conception

La Conception garde l'architecture du projet : diagrammes, décisions, contrats d'API, modèles de données, flux réseau et écrans. Chaque élément est un fichier du projet. Sélectionnez un élément pour voir, dans l'inspecteur, les éléments qui le citent.

## Créer ou modifier un élément

1. Ouvrez l'onglet, puis sélectionnez un élément. Ou cliquez sur l'action principale de l'onglet pour en créer un.
2. Modifiez le texte ou le dessin. L'aperçu suit.
3. Cliquez sur Enregistrer. L'application écrit tout le fichier ou rien.

Quand quelqu'un modifie le fichier en même temps, l'application vous le dit. Choisissez Recharger pour prendre sa version, ou Garder le mien.

## Diagrammes

Diagrammes contient les dessins du projet : Excalidraw, Mermaid, draw.io et BPMN. Dessinez dans l'éditeur, puis enregistrez.

## Architecture

Architecture montre les modèles d'architecture du projet sous forme de vues. Les vues sont dessinées à partir du texte du modèle.

## Décisions

Décisions contient les fiches de décision (ADR). Chaque fiche donne une décision, les options et les raisons.

- Cliquez sur Nouvelle décision pour en écrire une. Un formulaire demande chaque partie.
- Acceptez ou rejetez une décision proposée en un clic.

## API

API montre les contrats d'API. Ouvrez un contrat pour lire ses routes. Essayez une route sur un serveur du contrat.

## Données

Données montre les modèles de données : les tables et les liens entre elles.

## Flux

Flux liste les flux réseau sous forme de tableau : d'où, vers où, le port et le protocole. Ajoutez, modifiez ou supprimez une ligne, puis enregistrez.

## Écrans

Écrans montre les écrans du produit et les jetons de design de votre projet. Ils viennent du document de conception (du CSS dans un bloc de code), d'un fichier `tokens.css`, d'un fichier `*.tokens.json` ou d'un bloc `@theme` de Tailwind 4, groupés par fichier. Sans jeton, la page dit Aucun jeton pour l'instant ; cliquez sur Ajouter des jetons au document de conception, modifiez le bloc, puis enregistrez. La page ne montre jamais les jetons de Shipyard.

- Un fichier `.fig` montre l'aperçu que Figma garde dedans.
- Pour lire Figma, ajoutez une fois le jeton de votre compte Figma. Il va dans le trousseau de votre ordinateur.
- Collez ensuite l'adresse d'un projet Figma et cliquez sur Lister les fichiers. Chaque fichier montre son aperçu et ses jetons de design.

## Renommer un élément et demander à l’assistant

Le menu d’un élément (clic droit) a Renommer. Tapez le nouveau nom ; l’extension reste. Vérifier liste chaque fichier et chaque ligne dont les liens changent. Renommer déplace alors le fichier et réécrit ces liens en une seule étape. Si une écriture échoue, chaque fichier reste comme avant. Un projet en lecture seule refuse le renommage. Le dernier groupe du menu est Demander à l’assistant : choisissez une demande adaptée à ce type d’élément et à votre rôle. Elle remplit la zone de message avec l’élément, son fichier, sa spécification, son ticket et les éléments qui le citent. Rien n’est envoyé avant que vous l’envoyiez.
