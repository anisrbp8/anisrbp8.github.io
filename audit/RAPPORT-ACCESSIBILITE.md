# Audit et suivi d’accessibilité — Anis Rojbi

Date de mise à jour : 25 septembre 2026. Dépôt : `anisrbp8/anisrojbi.fr`.

## Statut

Ce document décrit les contrôles techniques et les points de validation encore nécessaires. Il ne constitue pas une déclaration de conformité RGAA complète et aucun taux de conformité n’est revendiqué.

## Périmètre actuel

Le site contient **29 pages HTML** : 14 françaises, 14 anglaises et une page 404. Il est statique, sans framework front-end, avec une feuille de style commune et un JavaScript local. Il comprend quatre images principales, dix figures SVG scientifiques bilingues et quatre documents PDF disposant d’équivalents HTML.

Les pages `contact.html` et `en/contact.html` utilisent Formspree pour la transmission des messages. Le formulaire comporte des labels visibles, des champs obligatoires natifs, un honeypot anti-spam sans CAPTCHA, un statut accessible et un fonctionnement de repli sans JavaScript. L’adresse électronique destinataire n’est pas exposée dans le HTML.

Les anciennes pages de remerciement `merci.html` et `en/thank-you.html` ont été supprimées le 25 septembre 2026 car elles n’étaient plus utilisées par le parcours de soumission.

## Contrôles structurels du 25 septembre 2026

Le script `scripts/qa.py` contrôle notamment :

- la présence d’une langue et d’un seul `h1` par page ;
- les identifiants dupliqués ;
- les titres de page ;
- les références locales, ancres, ressources CSS et URLs du sitemap ;
- l’absence d’adresse électronique destinataire exposée dans le HTML ;
- pour tout formulaire de contact : endpoint Formspree HTTPS, méthode `POST`, champs `name`, `email`, `subject` et `message` obligatoires et explicitement étiquetés, honeypot `_gotcha` et statut avec `role="status"` / `aria-live`.

Résultat après les corrections : **29 pages, 1 158 références locales vérifiées, 0 problème détecté**.

La syntaxe de `assets/js/site.js` a également été vérifiée avec Node.js et `scripts/qa.py` avec le compilateur Python.

## Éléments d’accessibilité présents

- navigation clavier, lien d’évitement et focus visible ;
- structure sémantique et hiérarchie de titres ;
- navigation principale cohérente en français et en anglais ;
- préférences locales de couleurs, taille du texte et espacements ;
- alternatives textuelles et descriptions HTML des figures scientifiques ;
- versions HTML du CV et de la biographie en complément des PDF ;
- glossaire, présentation en langage simple et plans du site FR/EN ;
- prise en compte de `prefers-reduced-motion` et des couleurs forcées dans la feuille de style ;
- formulaire de contact utilisable avec HTML natif et amélioration progressive JavaScript.

## Résultats automatisés antérieurs

Les fichiers `audit/accessibility-results.json` et `audit/interaction-results.json` sont conservés comme **preuves historiques de l’audit du 22 septembre 2026**. Ils portent sur l’ancien périmètre de 31 pages et contiennent donc encore des entrées pour les deux anciennes pages de remerciement aujourd’hui supprimées. Ils ne doivent pas être interprétés comme une photographie du périmètre courant.

Ces contrôles automatisés ne couvrent pas tous les critères RGAA/WCAG et ne remplacent pas les tests humains.

## Vérifications humaines restant nécessaires

| Domaine | Vérification |
|---|---|
| Lecteurs d’écran | NVDA/Firefox, NVDA/Chrome et VoiceOver/Safari : ordre de lecture, titres, liens, tableaux, formulaires et annonces |
| Zoom et reflow | Zoom réel 200 % et 400 %, différentes tailles de fenêtre et navigateurs |
| Contrastes et focus | États normal, hover, focus, couleurs personnalisées et `forced-colors` |
| Formulaire | Compréhension des erreurs, confirmation d’envoi, parcours clavier et comportement réel Formspree |
| Figures | Pertinence des alternatives et compréhension des schémas par différents publics |
| PDF | Balisage, ordre de lecture, langues et comportement avec lecteur d’écran |
| Contenu | Sigles, changements de langue, niveau de lecture et précision scientifique |

## Reproduction du contrôle structurel

```sh
python scripts/qa.py
node --check assets/js/site.js
python -m py_compile scripts/qa.py
```

Pour les contrôles de rendu automatisés :

```sh
cd scripts/accessibility
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install --with-deps chromium
cd ../..
node scripts/accessibility/audit.cjs
node scripts/accessibility/interaction.cjs
```

## Références

- [RGAA 4.1.2 et critères](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- [Exigences de conformité WCAG](https://www.w3.org/WAI/WCAG22/Understanding/conformance.html).
