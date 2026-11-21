# La barre Demander

Demander ou dire à Shipyard, dans la rangée du haut de chaque page, est la seule barre pour une question, un lieu et une action. Appuyez sur Ctrl+K (Cmd+K sur un Mac) pour y aller. Tapez, puis utilisez les flèches et Entrée. Échap la ferme.

## Aller à

Aller à ouvre un lieu, une section, un projet, un élément ou un résultat de recherche.

Tapez quelques mots pour chercher dans le texte de vos documents, décisions, specs, questions, tickets et conceptions. La casse et les accents ne comptent pas (« decision » trouve « décision »), chaque mot doit correspondre, et le dernier mot peut être un début. Les résultats sont groupés par type, montrent un court extrait avec les mots marqués, et placent d'abord une page que beaucoup d'éléments citent. Le document que vous ouvrez depuis un résultat marque les mots.

Choisissez Demander à l'assistant pour mettre ces éléments en contexte dans la zone de message de l'assistant. Rien n'est envoyé avant votre envoi.

## Faire

Faire lance une action ou une requête pour la page que vous voyez. Exemples : Nouvelle fonctionnalité, Lancer un agent sur un ticket (elle ouvre la page Nouvelle fonctionnalité), Synchroniser maintenant, Ouvrir le mode d'emploi de cette page, Revoir la visite. Une action que votre rôle ne peut pas utiliser ne s'affiche pas.

## Demander

Demandez ce qui bloque, ce qui s'est arrêté ou ce qui vous attend. La réponse nomme chaque fonctionnalité et donne son action : Répondre, Débloquer, Ajouter du budget, Réessayer, Reprendre ou Clore comme terminée. Répondre ouvre un champ dans la réponse : tapez le texte, puis cliquez sur Envoyer. Aller à et Faire sont sous la réponse, et Ouvrir l'assistant complet ouvre la page Demander.

Tout autre texte va à l'assistant quand vous appuyez sur Entrée.

## L'assistant

L'assistant s'ouvre sur le côté. Posez-lui une question sur le projet. Chaque conversation est un onglet, et un point marque un onglet avec une nouvelle réponse. La réponse montre comment il a trouvé le résultat sous Comment j'ai trouvé.

- Sous la zone de message, une barre a le bouton de pièce jointe, un bouton avec le modèle et l'effort (il ouvre les modèles de l'outil d'IA, les niveaux d'effort et les modèles des autres outils d'IA), la permission, l'anneau de contexte et Envoyer.
- En mode Faire, la permission est Édition avec accord, Auto : accepter les éditions ou Ignorer les permissions. Ignorer les permissions saute chaque approbation de Claude Code ou de Codex : Shipyard vous demande la première fois dans chaque projet, le montre en rouge tant qu'il est actif, et le refuse dans un projet en lecture seule et quand l'interrupteur des agents est désactivé.
- Tapez `/` au début d'un message pour lister les commandes de l'outil d'IA sélectionné. Le texte part vers l'outil d'IA tel que vous l'avez tapé.
- Chaque conversation garde une session d'agent, donc un message suivant continue le travail précédent.
- Les fichiers modifiés sont dans la réponse, chacun avec un aperçu et Annuler. Annuler abandonne les changements que l'assistant a faits dans ce fichier, après votre confirmation. Sans Annuler, les changements restent.
- Sélectionnez un texte dans une page pour l'envoyer à l'assistant, ou à un agent avec Envoyer à un agent.

## La page Demander

L'assistant complet est la page Demander, à l'adresse `/ask`. Ouvrir l'assistant complet, dans la barre Demander, ou le panneau latéral, l'ouvre. Petite barre revient au panneau latéral.

- La page a trois colonnes : les conversations à gauche, le fil avec la zone de message au milieu, et les outils à droite.
- Les outils sont Cet écran (ce que l'assistant peut voir, avec Ajouter), L'assistant peut (Modifier les fichiers seul, et Lancer des commandes seul pour un outil d'IA qui l'a) et Panneau (le côté et la largeur du panneau latéral).
- Avec Codex comme outil d'IA, une carte demande : Codex demande : faire confiance à ce dossier ? Pas maintenant masque la carte pour cette visite. Faire confiance à ce dossier ajoute le dossier au fichier de configuration de Codex. Ce que cela écrit montre le changement exact, et rien n'est écrit avant votre clic.

## Garder et Annuler

Chaque fichier que l'assistant a changé a Garder et Annuler. Garder accepte le changement de ce fichier, et le fichier quitte la liste. Annuler défait ce fichier seulement. Tout garder accepte chaque fichier de la liste.
