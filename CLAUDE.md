# Omni-Budget — notes pour Claude

PWA de gestion de budget en **React + Vite**. Contrairement aux autres PWA de
l'utilisateur, ce projet passe par une **étape de compilation** : les sources
ne s'exécutent pas telles quelles.

```bash
npm install
npm run dev      # développement
npm run build    # produit dist/
npm test         # vitest
```

## Version du service worker : automatique, ne rien incrémenter à la main

Le service worker source est `public/sw.js`. Il contient trois marqueurs
(`"__VERSION_CACHE__"`, `"__FICHIERS_A_PRECHARGER__"`, `"__BASE__"`) **remplacés
au moment du build** par le greffon `budget-service-worker` défini dans
`vite.config.js`. La version est une empreinte SHA-256 des fichiers de `dist`,
donc elle change d'elle-même dès qu'un fichier change. **Ne jamais modifier ces
marqueurs à la main.**

Nuance utile : l'empreinte est calculée sur les **noms et tailles** des fichiers,
pas sur leur contenu. Vite ajoutant un hachage au nom des fichiers compilés, un
changement de code produit toujours un nouveau nom, donc une nouvelle empreinte.
Mais une retouche d'un fichier de `public/` qui conserverait **exactement la même
taille en octets** passerait inaperçue. Dans ce cas rare, forcer le changement
(un espace en plus, par exemple) ou vérifier après déploiement.

## Chemin de base figé

`vite.config.js` fixe en dur :

```js
const NOM_DU_DEPOT = 'omni-budget';
const BASE = `/${NOM_DU_DEPOT}/`;
```

C'est nécessaire parce que GitHub Pages sert le site depuis un sous-dossier. En
conséquence, **une copie compilée ne fonctionne pas ailleurs qu'à cette adresse**
(ni à la racine d'un serveur local, ni depuis un dossier quelconque). Pour
produire une version utilisable ailleurs, il faut adapter cette valeur — et
vérifier que la balise CSP injectée au build reste cohérente.

## À savoir

- **Licences tierces** : `public/licences-tierces.txt` rassemble les textes de
  licence des bibliothèques publiées. Il est refait par
  `scripts/licences-tierces.mjs`, lancé automatiquement avant chaque
  `npm run build` (script `prebuild`). Après un changement de dépendances,
  committer le fichier refait.
- Le moteur de reconnaissance de texte (`ocr/`, ~6 Mo) est **volontairement
  exclu du préchargement** : il n'est mis en cache qu'au premier scan.
- Déploiement automatique par GitHub Actions
  (`.github/workflows/deploiement.yml`) à chaque envoi sur `main` →
  https://ferrusdantioch.github.io/omni-budget/
- Code et commentaires en français, rédigés pour un développeur débutant :
  conserver ce niveau d'explication.

## Champ `id` du manifeste : nom du dossier, jamais `./`

`public/manifest.webmanifest` contient `"id": "/omni-budget/"`. Chrome résout `id` par rapport à
la **racine du domaine** (`https://ferrusdantioch.github.io/`), pas par
rapport au dossier de l'application : `"id": "./"` (ou `"."`) donnait donc
l'identité de la racine du site, la même pour toutes les applications qui
l'utilisaient. C'est une exception voulue à la règle des chemins relatifs.

Ne plus changer cette valeur : pour Chrome, une application déjà installée
dont l'`id` change devient une autre application (il faut la désinstaller
puis la réinstaller pour qu'elle reprenne les mises à jour).

Exception unique (octobre 2026) : l'application s'appelait « Budget — mes dépenses » et
vivait à `/mon-budget-perso/`. Le renommage du dépôt a changé son adresse,
donc son `id` : les personnes qui l'avaient installée doivent la réinstaller
depuis la nouvelle adresse (leurs données restent, le stockage n'a pas changé).

## ⚠️ Plusieurs applications sur `ferrusdantioch.github.io` : limite de Chrome Android

Toutes les applications du portfolio partagent la même adresse d'origine
(`ferrusdantioch.github.io`). Constaté en octobre 2026 sur le téléphone de
l'utilisateur : **Chrome Android n'accepte d'installer qu'une seule de ces
applications**. Dès qu'une est installée, les autres affichent « Cette appli
est déjà installée », même avec des `id` et des `scope` tous différents
(corriger l'`id`, ci-dessus, n'a pas suffi). **Brave installe toutes les
applications sans problème** : ce n'est pas un défaut des applications.

Contournements : installer depuis Brave, ou choisir « Créer un raccourci »
dans Chrome (l'application s'ouvre alors dans un onglet Chrome). Solution
durable si l'application doit être distribuée : une adresse (origine)
distincte par application (Cloudflare Pages, Netlify, sous-domaine d'un nom
de domaine, organisation GitHub…). À savoir aussi : une même origine
signifie stockage (IndexedDB, localStorage) et autorisations (micro,
notifications) partagés entre toutes ces applications.

---

## Règles communes à l'écosystème

> Section ajoutée le 13 novembre 2026 à partir du socle commun des PWA de
> Ferrus. Elle est **adaptée à ce dépôt** : les règles du socle qui ne
> concernent que d'autres applications ont été retirées. Si une règle
> ci-dessous semble contredire les notes propres à ce dépôt (plus haut),
> ne tranche pas : signale-le à Ferrus et attends sa décision.
>
> Version de référence : dépôt privé `omni-socle`, fichier `SOCLE.md`. Toute
> modification d'une règle commune se fait d'abord là-bas, puis est recopiée
> ici.

*Chaque règle porte une étiquette :*

* [DÉCIDÉ] : choix confirmé par Ferrus. À respecter sans discuter.
* [CONSTATÉ] : relevé dans le code des dépôts omni-texte, Refuge, omni-budget et omni-grimoire (novembre 2026). Les autres dépôts n'ont pas été lus.
* [RECOMMANDÉ] : proposition non validée. À proposer, jamais à appliquer d'office.

### 1. Qui, pourquoi, comment travailler

* Ferrus veut comprendre ce qui se passe : explique en français simple, signale chaque terme technique, ne délègue pas dans le dos. [DÉCIDÉ]
* Sois clair, direct, sans édulcorant. Dis ce qui est fragile ou incohérent. [DÉCIDÉ]
* Les outils servent à aider les autres, en priorité les personnes autistes et les personnes en situation de handicap. Refuge et Cap sont des assistances pour personnes autistes ; Soutien-IMC est une fiche de contact très lisible, conçue pour des personnes infirmes moteurs cérébrales. [DÉCIDÉ]
* Objectif de fond : remplacer les outils des grandes entreprises par des outils faits maison, et être indépendant des comptes et d'internet. [DÉCIDÉ]
* Avant tout changement important : explique ce que tu vas faire, attends l'accord. Ne modifie jamais plusieurs applications d'un coup sans demande. [DÉCIDÉ]

### 2. Règles non négociables

1. Pas de compte, pas de backend, pas d'IA intégrée. [DÉCIDÉ]
2. Fonctionnement hors ligne systématique. Tout ce dont l'application a besoin est embarqué dans l'installation, moteur de reconnaissance de texte (OCR) d'omni-budget compris (environ 6 Mo). [DÉCIDÉ]
3. Aucun appel réseau sans en avoir parlé à Ferrus d'abord. Si une fonctionnalité demande internet, arrête-toi, explique pourquoi, propose une alternative locale, attends la décision. [DÉCIDÉ] Cette règle vise l'application. Les outils de développement (`npm install`, GitHub Actions) sont acceptés ; toute nouvelle bibliothèque, tout nouvel outil ou tout nouveau serveur contacté doit être signalé à Ferrus avant. [DÉCIDÉ]
4. Les données restent sur l'appareil. Rien n'est envoyé. Les liens externes ne s'ouvrent que sur action de la personne. [DÉCIDÉ]
5. Pas de police, de bibliothèque ou de script chargés depuis un CDN : tout est embarqué avec sa licence. [CONSTATÉ dans omni-texte ; à étendre]
6. Ne copie jamais un fichier depuis un serveur tiers pendant la publication (build). Le fichier est versé dans le dépôt, avec son empreinte vérifiée. [RECOMMANDÉ, suite à l'OCR téléchargé sans contrôle]

### 3. Identité, ton, mentions

* Signature : « Ferrus Dantioch », sauf dans Refuge, qui signe d'un prénom seul (celui qui figure dans son « À propos »). C'est voulu : dans le contexte de Refuge, le prénom crée la confiance. Ne pas « corriger ». [DÉCIDÉ]
* Ton : tutoiement partout, y compris dans omni-budget et omni-grimoire. Exception conservée dans Refuge : « vous » pour ce qui est montré à d'autres personnes (message d'urgence, etc.). [DÉCIDÉ pour le tutoiement ; exception CONSTATÉE]
* Chaque application contient un « À propos » avec au minimum : nom, version, « Application réalisée par Ferrus Dantioch, avec l'aide de l'intelligence artificielle », mention de licence, phrase de confidentialité, contact, lien « Découvrir l'Omni-système ». Chaque application garde son texte propre. [DÉCIDÉ pour le fond ; modèle CONSTATÉ dans omni-texte]
* Licence du code : © 2026 Ferrus Dantioch, Creative Commons BY-NC-ND 4.0, avec le fichier LICENSE identique dans tous les dépôts. Règles, fiches, logos et textes de l'Omni-système : tous droits réservés. [DÉCIDÉ]
* Contact dans les applications : l'alias e-mail de l'Omni-système. Le serveur Discord figure sur le portfolio seulement : il n'a pas besoin d'apparaître dans les applications. [DÉCIDÉ]
* Identité visuelle : violet nuit pour l'écosystème Omni. Logo de l'Omni-système (dé à vingt faces violet entouré d'un anneau lumineux) dans l'« À propos ». Exception Refuge : pas de logo Omni ; le violet nuit y est une gamme facultative parmi les autres, pas celle par défaut. [DÉCIDÉ]
* Chaque bibliothèque tierce est créditée avec sa licence (fichier de licences, et lien depuis l'« À propos »). [RECOMMANDÉ ; aujourd'hui le lien manque dans les deux applications React]

### 4. Sécurité et vie privée

* Une CSP (règle de sécurité qui interdit au navigateur de contacter d'autres sites) stricte dans chaque application. [RECOMMANDÉ ; CONSTATÉ : présente dans omni-texte et omni-budget, absente de Refuge et omni-grimoire]
* Données sensibles (journal, notes vocales, finances) : chiffrées au repos quand c'est possible. [RECOMMANDÉ ; CONSTATÉ : seul omni-budget chiffre]
* Origine partagée : toutes les applications vivent sous la même adresse de base, donc chacune pourrait techniquement lire les données des autres. Ne jamais stocker deux applications sous le même nom de base de données ou de préfixe. Préfixe propre à chaque application pour caches, IndexedDB et localStorage. Un préfixe générique (ex. `budget-`) est à éviter. [CONSTATÉ ; hébergement à origines séparées : décision reportée] Cette règle vaut pour les nouveaux noms : les noms déjà publiés (`budget-perso` et `budget-theme` d'omni-budget) restent, car les renommer ferait perdre les données des personnes. [DÉCIDÉ]
* Sur Chrome Android, une seule PWA du même site s'installe. Contournement : utiliser Brave, qui les installe indépendamment. C'est un palliatif d'installation : il ne règle ni l'isolation des données ni le risque de sécurité. À mentionner dans l'aide à l'installation de chaque application. [DÉCIDÉ comme palliatif]
* Ne pas stocker en clair ce qui pourrait nuire à la personne si quelqu'un d'autre ouvre l'appareil. [RECOMMANDÉ]

### 5. Hors ligne et versions

* Service worker (petit programme qui garde une copie de l'application sur l'appareil) : tout est copié à l'installation, puis « cache d'abord ». [CONSTATÉ]
* La mise à jour doit se vérifier au retour au premier plan, avec un message clair. [CONSTATÉ dans 3 apps sur 4 ; manque dans omni-budget] Exception Refuge : le message clair est la note discrète de l'accueil (sans bouton) et le bouton « Mettre à jour » des Réglages ; rien en bouclier, jamais de changement par surprise. [DÉCIDÉ]
* Le service worker gère l'échec réseau (plan B quand un fichier manque). [RECOMMANDÉ ; absent de Refuge]
* Numéro de version : une seule source de vérité, automatique, jamais écrite à la main à deux endroits. [RECOMMANDÉ ; CONSTATÉ : 4 méthodes différentes, dont 2 reposent sur la mémoire]
* Si le numéro de version affiché ne correspond pas au code, le signaler. [RECOMMANDÉ]

### 6. Accessibilité (minimum pour toute application)

* Cibles tactiles : 44 px minimum. Refuge en vise 60 px. [DÉCIDÉ ; CONSTATÉ : plusieurs boutons du grimoire font 34 à 40 px]
* Contraste du texte : 4,5 minimum (WCAG). [RECOMMANDÉ ; CONSTATÉ : Refuge, thème clair, à 3,8–4,3]
* Contour de focus clavier toujours visible, y compris en thème « bouclier noir » de Refuge. [RECOMMANDÉ] Dans le bouclier : contour gris foncé, juste au minimum de la norme (contraste 3:1 sur le noir, environ `#5a5a5a`), seulement autour de l'élément sélectionné, pour éclairer le moins possible. [DÉCIDÉ]
* Respect du réglage « réduire les animations » du téléphone. [CONSTATÉ dans les quatre]
* Un seul `<h1>` par page. Échap ferme les écrans plein écran. Tab ne s'en échappe pas. [RECOMMANDÉ ; CONSTATÉ : manque dans Refuge]
* Vibration : interdite dans Refuge. Ailleurs, toute vibration a un réglage pour la couper. [DÉCIDÉ ; CONSTATÉ : le grimoire vibre sans réglage]
* Thème appliqué avant l'affichage pour éviter l'éclair du mauvais thème : petit script en tête de page. [CONSTATÉ dans omni-texte et Refuge ; manque dans omni-budget et omni-grimoire]
* Thèmes de référence : Omni (violet nuit), Sombre, Clair. [CONSTATÉ] « Auto » (suit le réglage du téléphone) est accepté en plus de ces trois thèmes. [DÉCIDÉ]

### 7. Tests et livraison

* Test automatique de chaque nouvelle fonction. omni-texte a Playwright (hors ligne, contrastes, téléphone) ; omni-budget a Vitest ; Refuge n'en a pas. [CONSTATÉ ; tests pour Refuge : RECOMMANDÉ]
* Avant de dire que c'est terminé : vérifie hors ligne, vérifie sur téléphone et sur tablette, relis le bloc « À propos », vérifie qu'aucune requête réseau ne part.
* Mettre à jour le README et les commentaires quand le code change (omni-texte annonce 1.3.0 alors que le code est en 1.3.1). [CONSTATÉ]

### 8. Technologies

* Pour une petite application : HTML, CSS et JavaScript purs, sans étape de compilation (build). [RECOMMANDÉ par défaut]
* React + Vite (build obligatoire, publication par GitHub Actions) n'est utilisé que si la complexité le justifie. [CONSTATÉ dans omni-budget et omni-grimoire]
* Publication : GitHub Pages. [CONSTATÉ]

### 10. Périmètre actuel

Seuls omni-texte, Refuge, omni-budget et omni-grimoire ont été examinés. Cap, Soutien-IMC et les autres dépôts ne le seront pas pour le moment, par décision de Ferrus. Ne pas étendre les règles de ce document à un dépôt non lu sans l'avoir lu. [DÉCIDÉ]

### 11. Dettes connues, par priorité

- **Priorité 2** — Origine partagée : décision d'hébergement à étudier, reportée.
- **Priorité 3** — omni-budget : OCR embarqué dans l'installation, modèle copié dans le dépôt avec empreinte. Décidé le 13 novembre 2026. Tant que ce n'est pas fait, la phrase du CLAUDE.md d'omni-budget qui dit l'OCR « volontairement exclu du préchargement » décrit l'état réel du code : la retirer seulement quand l'OCR sera embarqué. Prévoir de ne pas retélécharger les 6 Mo à chaque mise à jour (omni-texte le fait déjà pour son dictionnaire, voir `DURABLES` dans son `sw.js`).
- **Priorité 4** — Méthode de version unique pour toutes les applications.
- **Priorité 6** — Éclair de thème (omni-budget, omni-grimoire), préfixe de cache générique d'omni-budget, documentation périmée.
- **À classer** — Tutoiement à appliquer dans omni-budget et omni-grimoire (aujourd'hui : vouvoiement).
- **À classer** — omni-budget : vérifier la mise à jour au retour au premier plan, comme les trois autres applications.
- **À classer** — omni-budget et omni-grimoire : lien vers `licences-tierces.txt` depuis l'« À propos ».
- **À classer** — omni-budget : ajouter le thème Omni (violet nuit), en gardant Auto, Clair et Sombre.
