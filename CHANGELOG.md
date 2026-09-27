# Changelog

Convention de version : `Excalidraw-<version upstream>+Custom-<version fork>`
— la partie `Excalidraw-X.Y.Z` suit la version d'[excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)
sur laquelle ce fork est basé (`packages/excalidraw/package.json`), et
`Custom-X.Y.Z` suit nos propres changements par-dessus. `Custom` repart à
`1.0.0` à chaque fois que la base Excalidraw est resynchronisée.

## Excalidraw-0.18.0+Custom-1.12.0 — 2026-09-27

- Remplace le kanban statique (inséré une fois, puis de simples formes
  Excalidraw sans comportement particulier) par un vrai tableau
  interactif (`excalidraw-app/kanban/`) :
  - **Conteneurs groupés** : les colonnes (rectangle + titre + ses
    boutons) d'un même tableau partagent un vrai groupe Excalidraw, donc
    les sélectionner/déplacer/redimensionner agit sur la structure
    entière d'un coup — pas colonne par colonne.
  - **Ajouter/supprimer des conteneurs** via un bouton "+ Conteneur" en
    bout de ligne et un bouton "×" par colonne (avec confirmation,
    supprime aussi ses tâches) ; les colonnes restantes se recalent
    automatiquement pour combler le vide.
  - **Ajouter un post-it** via un bouton "+" au bas de chaque colonne.
  - **Déplacer un post-it d'un conteneur à l'autre** par un simple
    cliquer-glisser : les post-its ne font volontairement pas partie du
    groupe des conteneurs (sinon un seul clic aurait déplacé tout le
    tableau au lieu d'une seule tâche) ; on détecte la colonne de dépôt
    au relâchement et on y réintègre la carte.
  - **Empilement automatique et réordonnancement** : les post-its d'une
    colonne se réempilent toujours proprement les uns sous les autres,
    et l'endroit où on lâche une carte parmi ses voisines détermine sa
    nouvelle position dans la pile.
  - **Redimensionner la structure agrandit/réduit tout** : le
    redimensionnement natif du groupe de conteneurs est répercuté sur
    les post-its (taille et position, dérivées de la largeur réelle de
    leur conteneur) juste après, pour qu'ils restent visuellement
    cohérents avec des colonnes agrandies ou réduites.
  - Trois bugs non triviaux rencontrés et corrigés pendant le
    développement (documentés dans le code) : (1) déplacer
    programmatiquement un élément avec `updateScene` ne redéplace pas
    son texte lié — il faut recalculer sa position via
    `computeBoundTextPosition` ; (2) supprimer un élément ne supprime
    pas son texte lié, qui reste affiché tout seul ; (3) un post-it
    déplacé dans une colonne créée après lui dans l'historique de la
    scène restait visuellement sous le fond (opaque) de cette colonne,
    car il gardait son ancien ordre d'empilement graphique (`index`
    Excalidraw) — corrigé en le ramenant explicitement au-dessus à
    chaque réorganisation ; (4) `pointerDownState.drag.hasOccurred` ne
    passe jamais à `true` pendant un redimensionnement (seulement pour
    un déplacement), donc la détection devait se baser sur
    `resize.isResizing` en plus, sans quoi le rééquilibrage des post-its
    après un redimensionnement ne se déclenchait jamais.

## Excalidraw-0.18.0+Custom-1.11.1 — 2026-09-27

- Corrige "Mes sessions actives" (et les deux autres endroits qui
  rejoignent une session déjà connue : "Se connecter avec le code" et
  la liste Firestore cachée) : cliquer pour rejoindre appelait
  `window.location.href = lien`, qui ne déclenche **aucune** navigation
  quand le lien ne diffère de l'URL actuelle que par le hash — ce qui
  est le cas le plus courant, y compris juste après avoir quitté une
  session (le hash `#room=...` reste dans l'URL après "Quitter la
  session", donc cliquer pour retourner dans **cette même** session ne
  faisait alors littéralement rien, puisqu'affecter `location.href` à
  sa propre valeur ne déclenche même pas l'événement `hashchange` dont
  l'app dépendait). Rejoindre déclenche maintenant un vrai rechargement
  de page à chaque fois, qui repasse par le chemin standard et
  bien testé d'un lien d'invitation ouvert directement.

## Excalidraw-0.18.0+Custom-1.11.0 — 2026-09-27

- Dans "Collaboration en direct", retrait de l'encart "Lien de la
  session" (coller un lien + "Rejoindre") : il faisait doublon avec le
  fait d'ouvrir directement le lien reçu dans le navigateur, ce qui
  rejoint déjà la session automatiquement. On ne peut désormais
  rejoindre une session depuis cette boîte de dialogue qu'avec le code
  d'accès ; ouvrir directement l'URL fournie continue de fonctionner
  comme avant.
- Le créateur (ou toute personne ayant déjà rejoint) d'une session n'a
  plus besoin de code d'accès pour y retourner tant qu'elle est encore
  active : un nouveau bloc "Mes sessions actives", visible dès
  l'ouverture de la boîte de dialogue "Collaboration en direct" (plus
  besoin du raccourci caché Maj+9×3), liste ses sessions récentes
  toujours actives avec un lien direct pour les rejoindre en un clic.
  Cela s'appuie sur l'historique de sessions déjà enregistré
  localement par le navigateur (`SessionHistory`) ; ce bloc "Mes
  sessions actives" a été déplacé hors de la liste cachée
  (`ActiveSessionsList`, toujours réservée à "Toutes les sessions
  actives sur le serveur" + Firestore) pour être disponible sans ce
  raccourci.
  ⚠️ Corrige au passage le bug remonté : après avoir cliqué "Sortir"
  puis rouvert la boîte de dialogue, il n'existait auparavant aucun
  moyen de revenir dans sa propre session encore active sans en
  connaître le code d'accès.
- Clarifie la popup de session active ("Live collaboration"), signalée
  comme confusante : le bouton "Sortir" faisait quitter la
  collaboration alors que l'utilisateur voulait simplement fermer la
  popup pour continuer à dessiner, sans moyen évident de faire la
  différence. Ajout d'un bouton "Fermer (continuer à dessiner)" mis en
  avant en premier (ferme juste la popup, ne touche pas à la session),
  et renommage de "Sortir" en "Quitter la session" avec sa description
  associée juste au-dessus pour lever l'ambiguïté avec "Fermer pour
  tout le monde".

## Excalidraw-0.18.0+Custom-1.10.0 — 2026-09-26

- À la création d'une session partagée, en plus du lien on génère
  maintenant aussi un **code d'accès** à 6 chiffres, affiché et
  copiable dans la boîte de dialogue de la session active.
  - Avec le **lien**, on rejoint la session directement si elle est
    active (comportement inchangé).
  - Avec le **code** (sans le lien), on ouvre "Se connecter à une
    session en cours", on choisit la session dans la liste des
    sessions actives, on saisit le code, et on rejoint si le code est
    bon. Si le code est faux, une popup "Code d'accès incorrect"
    s'affiche.
  - ⚠️ Ce changement annule la fonctionnalité de la version 1.8.0 qui
    permettait de rejoindre directement en cliquant sur une session
    listée dans "Toutes les sessions actives sur le serveur" : cette
    liste redevient purement informative (nom, créateur, nombre de
    participants), puisqu'elle ne doit plus jamais exposer la clé de
    chiffrement de bout en bout sans passer par la vérification du
    code d'accès. Rejoindre depuis cette liste se fait maintenant via
    le nouveau flux "code d'accès".
  - Côté serveur (`excalidraw-room`), la clé de chiffrement de la
    session reste stockée (comme choisi en 1.8.0, pour l'usage
    personnel), mais `GET /rooms` ne l'expose plus jamais : elle n'est
    renvoyée qu'après vérification du code via un nouvel événement
    Socket.IO dédié (`join-with-code` → `access-code-verified` /
    `access-code-invalid`).
  - Corrige au passage un bug de UX découvert pendant les tests : les
    popups "Session partagée fermée" et "Code d'accès incorrect"
    n'avaient aucun bouton (donc aucun élément focusable), ce qui fait
    qu'Échap fermait par erreur la boîte de dialogue derrière elles au
    lieu de la popup elle-même, laissant celle-ci bloquée à l'écran.
    Les deux ont maintenant un bouton "Fermer" explicite.

## Excalidraw-0.18.0+Custom-1.9.1 — 2026-09-25

- Refonte du mindmap inséré par "Insérer un mindmap" pour ressembler à
  un vrai mindmap (façon Miro/Mural) plutôt qu'à un flowchart : les
  nœuds sont maintenant du texte libre (plus de bulles/formes autour),
  reliés par des branches courbes colorées par thème, avec une
  hiérarchie sur 2 niveaux (sujet central → 4 branches → 2
  sous-branches chacune).
  ⚠️ Corrige au passage un bug découvert pendant la refonte : lier une
  flèche (`start`/`end` du skeleton) à un élément texte libre déjà
  existant via son `id` fait que `convertToExcalidrawElements`
  recalcule et écrase la position de ce texte avec une formule qui
  ignore l'autre extrémité de la flèche — plusieurs nœuds du mindmap
  se retrouvaient superposés au même endroit. Les connecteurs du
  mindmap sont donc désormais dessinés directement aux bonnes
  coordonnées plutôt que liés par `id` à des éléments texte
  (`excalidraw-app/data/templates.ts`) ; en contrepartie ils ne suivent
  plus automatiquement un nœud qu'on déplacerait à la main (comme
  n'importe quelle flèche non liée).

## Excalidraw-0.18.0+Custom-1.9.0 — 2026-09-25

- Ajout de deux entrées dans le menu hamburger pour insérer des
  structures prêtes à l'emploi, centrées sur la zone actuellement
  visible du canevas :
  - **Insérer un kanban** : 3 colonnes ("À faire" / "En cours" /
    "Terminé") avec des cartes exemples (sticky notes) dedans.
  - **Insérer un mindmap** : un sujet central relié à 4 branches, dont
    une avec deux sous-branches, pour illustrer la hiérarchie.
  Implémenté avec `convertToExcalidrawElements` (le même mécanisme que
  la conversion Mermaid → Excalidraw déjà présente dans l'éditeur) :
  ce sont des formes Excalidraw normales et éditables (déplacer,
  redimensionner, changer les couleurs, ajouter/retirer des
  cartes/branches à la main), pas un outil Kanban ou Mindmap
  interactif à part entière avec son propre état
  (`excalidraw-app/data/templates.ts`,
  `excalidraw-app/components/AppMainMenu.tsx`).

## Excalidraw-0.18.0+Custom-1.8.0 — 2026-09-25

- Les sessions listées dans "Toutes les sessions actives sur le
  serveur" sont désormais cliquables pour les rejoindre directement,
  comme "Mes sessions actives".
  ⚠️ Changement volontaire de modèle de sécurité, choisi explicitement :
  pour permettre ça, le serveur `excalidraw-room` mémorise maintenant
  aussi la clé de chiffrement E2E de chaque session créée (envoyée à
  la création via `create-room`, renvoyée par `GET /rooms`), alors
  qu'il ne l'a jamais eue jusqu'ici. Adapté à un usage personnel/mono-
  utilisateur : n'importe qui atteint le popup (déverrouillé par
  MAJ+9x3) peut désormais rejoindre n'importe quelle session active en
  un clic, sans avoir besoin du lien d'invitation. `GET /rooms` n'a
  pas d'authentification propre au-delà de `CORS_ORIGIN` — à garder en
  tête si l'accès à l'appli est un jour élargi à d'autres personnes
  (`excalidraw-room/src/index.ts`, `excalidraw-app/collab/Portal.tsx`,
  `excalidraw-app/share/ActiveSessionsList.tsx`). Les sessions créées
  avant ce changement (redémarrage du serveur compris) n'ont pas cette
  clé enregistrée et restent affichées en lecture seule.

## Excalidraw-0.18.0+Custom-1.7.1 — 2026-09-25

- Correction : `GET /rooms` (`excalidraw-room`) listait les sessions
  d'après les sockets Socket.IO actuellement connectés au lieu du
  registre des rooms créées via `create-room`. Conséquence : dès que
  plus personne n'était connecté à une room (ex. après "Sortir"), elle
  disparaissait de "Mes sessions actives" — impossible d'y revenir en
  cliquant dessus, alors qu'elle restait pourtant ouverte/rejoignable
  côté serveur. `/rooms` se base maintenant sur le registre (le nombre
  de participants peut retomber à 0 sans que la session ne disparaisse
  de la liste) (`excalidraw-room/src/index.ts`).
  ⚠️ Si le popup "Session partagée fermée" ne s'affiche toujours pas
  sur un lien de room fermée après ce correctif, vérifier que le
  service `excalidraw-room` sur Render a bien redéployé le commit
  précédent (`00b22b1`, protocole `create-room`/`join-room`) : sans
  lui, le serveur accepte encore silencieusement n'importe quel
  `join-room`.

## Excalidraw-0.18.0+Custom-1.7.0 — 2026-09-25

- Refonte de la collaboration en direct :
  - Le bouton "Partage" s'appelle désormais "Collaboration".
  - Le popup "Collaboration en direct" propose deux actions claires :
    **Démarrer une session** (avec un nom de session + votre nom) et
    **Se connecter à une session en cours** (en collant le lien reçu).
  - Les rooms doivent maintenant être explicitement créées côté serveur
    (`excalidraw-room`, événement `create-room` avec nom + créateur,
    stocké en mémoire uniquement — jamais la clé de chiffrement E2E).
    Si quelqu'un ouvre un lien vers une room qui n'a jamais été créée ou
    qui a été fermée (via "Fermer pour tout le monde"), il voit
    désormais un popup **"Session partagée fermée"** au lieu d'entrer
    dans une room vide (`excalidraw-room/src/index.ts`,
    `excalidraw-app/collab/{Portal,Collab}.tsx`,
    `excalidraw-app/collab/RoomClosedDialog.tsx`).
    ⚠️ Effet de bord accepté : si le serveur `excalidraw-room` redémarre
    (ex. mise en veille du plan gratuit Render), ce registre en mémoire
    est perdu et les liens de sessions ouvertes avant le redémarrage
    affichent ce popup même si personne ne les a explicitement fermées
    — il suffit de démarrer une nouvelle session et repartager le lien.
  - Le nom de la session et son créateur sont affichés en haut du popup
    une fois la session active.
  - La liste "sessions actives" (mes sessions / toutes les sessions du
    serveur / sessions enregistrées Firestore) — qui expose les rooms
    d'éventuels autres utilisateurs — est désormais masquée par défaut
    et ne s'affiche qu'en appuyant sur **MAJ+9** trois fois de suite
    pendant que le popup est ouvert ; elle se remasque à chaque
    fermeture/réouverture du popup (`excalidraw-app/share/ShareDialog.tsx`).

## Excalidraw-0.18.0+Custom-1.6.0 — 2026-09-25

- Après avoir dessiné un rectangle, losange ou ellipse, le focus
  passe automatiquement en mode édition de texte à l'intérieur de la
  forme (centré horizontalement et verticalement) — même mécanisme
  que les stickynotes, désormais étendu aux formes génériques.
  Auparavant, taper au clavier juste après avoir créé une forme
  déclenchait les raccourcis clavier des menus au lieu d'écrire du
  texte. Ignoré si l'outil est verrouillé (dessin en rafale) — même
  garde-fou que pour les stickynotes
  (`packages/excalidraw/components/App.tsx`).
  ⚠️ Changement de comportement volontaire par rapport à l'upstream :
  fait échouer ~41 tests de la suite historique d'Excalidraw qui
  supposaient qu'une forme reste "juste sélectionnée" après création.
  Ces tests ne font pas partie du pipeline de déploiement et n'ont
  pas été mis à jour un par un (ils testent l'ancien comportement,
  intentionnellement remplacé).

## Excalidraw-0.18.0+Custom-1.5.0 — 2026-09-24

- "Ouvrir un fichier" (`Ctrl/Cmd+O` et menu) importe désormais le
  contenu du fichier dans la scène partagée au lieu de la remplacer,
  lorsqu'une session de collaboration est active — sinon ça écrasait
  le dessin de tous les participants. Comportement inchangé hors
  collaboration. La confirmation "ceci va écraser votre dessin" ne
  s'affiche plus dans ce cas puisqu'elle ne s'applique plus
  (`packages/excalidraw/actions/actionExport.tsx`,
  `packages/excalidraw/components/main-menu/DefaultItems.tsx`).

## Excalidraw-0.18.0+Custom-1.4.0 — 2026-09-24

- Dans "Collaboration en direct", remplacement du bouton unique
  "Arrêter la session" par deux actions distinctes :
  - **Sortir** : quitte la session localement, la room reste active
    pour les autres participants (et on peut la rejoindre plus tard
    via le même lien)
  - **Fermer pour tout le monde** : met fin à la session pour tous
    les participants connectés, via un nouvel événement
    `close-room`/`room-closed` sur `excalidraw-room` (broadcast à
    tous les sockets de la room, y compris l'émetteur, pour une
    déconnexion uniforme)

## Excalidraw-0.18.0+Custom-1.3.1 — 2026-09-24

- Correction : "Arrêter la session" (collaboration) ramenait à
  `willoudev.github.io` (racine) au lieu de
  `willoudev.github.io/whiteboard/`, car le code d'origine réécrivait
  l'URL avec `window.location.origin` seul, sans le `base` path du
  site. Utilise maintenant `import.meta.env.BASE_URL`
  (`excalidraw-app/collab/Collab.tsx`).

## Excalidraw-0.18.0+Custom-1.3.0 — 2026-09-24

- Ajout d'une section "Toutes les sessions enregistrées (Firestore)"
  dans le popup Partager, listant tous les rooms ayant des données
  persistées (ID + version de scène uniquement — le contenu reste
  chiffré et illisible sans la clé, absente de Firestore). Si les
  règles de sécurité Firestore bloquent le listing de la collection
  (get par ID connu autorisé, mais pas list), un message explicite
  s'affiche plutôt que de planter (`excalidraw-app/data/firebase.ts`,
  `listStoredRooms`).

## Excalidraw-0.18.0+Custom-1.2.0 — 2026-09-24

- Retrait du "Lien partageable" (export readonly vers le backend
  officiel d'Excalidraw) dans la boîte de dialogue de collaboration ;
  remplacé par une liste des sessions actives :
  - "Mes sessions actives" : sessions démarrées/rejointes depuis ce
    navigateur (historique local) et encore actives, cliquables pour
    les rejoindre directement
  - "Toutes les sessions actives sur le serveur" : IDs de room +
    nombre de participants, informatif (aucune clé de chiffrement
    n'est jamais exposée par le serveur)
  - Nouvel endpoint `GET /rooms` sur `excalidraw-room` listant les
    rooms Socket.IO actives

## Excalidraw-0.18.0+Custom-1.1.1 — 2026-09-24

- Correction : "Ouvrir un fichier" (`fileOpen`) échouait sur certains
  navigateurs (ex. Edge sur macOS) avec `Failed to execute
  'showOpenFilePicker' ... not allowed by the user agent or the
  platform`, quand l'API File System Access est détectée comme
  supportée mais bloquée au runtime. Même correctif que pour la
  sauvegarde : bascule automatique vers un `<input type="file">`
  classique dans ce cas (`packages/excalidraw/data/filesystem.ts`).

## Excalidraw-0.18.0+Custom-1.1.0 — 2026-09-24

- Retrait des balises Open Graph / Twitter Card / meta description
  (`excalidraw-app/index.html`) : les liens partagés n'affichent plus
  de prévisualisation enrichie "Excalidraw — Collaborative
  whiteboarding made easy" pointant vers excalidraw.com

## Excalidraw-0.18.0+Custom-1.0.0 — 2026-09-24

Première version suivie de ce fork self-hosted d'Excalidraw, regroupant
tous les changements apportés jusqu'ici par rapport à l'upstream
[excalidraw/excalidraw](https://github.com/excalidraw/excalidraw).

- Portage en self-hosting sur GitHub Pages (`base` path, déploiement
  automatisé via `.github/workflows/deploy-pages.yml`)
- Collaboration temps réel pointée vers notre propre instance
  [`excalidraw-room`](https://github.com/willoudev/excalidraw-room)
  hébergée sur Render, plutôt que le serveur officiel d'Excalidraw
- Fallback de sauvegarde manuelle quand l'API File System Access est
  bloquée au runtime (ex. politique d'entreprise) malgré sa détection
- Retrait de la promotion Excalidraw+, du bouton d'aide flottant, de
  l'icône de chiffrement de bout en bout, et des entrées Excalidraw+ /
  GitHub / Suivez-nous / Discord / Sign up du menu et de l'écran d'accueil
- Rebranding : titre de page, wordmark de l'écran d'accueil et URL passés
  de "Excalidraw" à "Whiteboard" (repo renommé `willoudev/whiteboard`)
- Ajout d'un écran de code d'accès avant le chargement du whiteboard
  (même mécanisme que [`macroplanning`](https://github.com/willoudev/macroplanning) :
  hash PBKDF2-SHA256 côté client, session chiffrée AES-GCM)
- Suivi de version : ce changelog, plus le numéro de version affiché sur
  l'écran de code d'accès et en bas du menu hamburger

Site en ligne : https://willoudev.github.io/whiteboard/
