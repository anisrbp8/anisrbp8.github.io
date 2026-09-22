# Audit et corrections d’accessibilité — Anis Rojbi

Date : 22 septembre 2026. Dépôt : anisrbp8/anisrbp8.github.io.
Base : 7f93469e9b31f461d98856e2bf11ab17ec467d50.

## État de livraison

Corrections réalisées et testées localement, préparées pour publication sur `main`. La connexion GitHub, initialement indisponible, a été rétablie. Les résultats ci-dessous décrivent les fichiers de cette révision ; le statut du déploiement est consultable dans GitHub Actions.

Ce document est un audit technique et une préparation à la validation, pas une déclaration de conformité RGAA complète. Aucun taux de conformité RGAA n’est calculé. La matrice jointe couvre les 106 identifiants du référentiel, avec statut prudent et éléments à vérifier ; elle ne constitue pas 106 critères validés.

## Périmètre et architecture

31 pages HTML : 15 françaises, 15 anglaises, une page 404. Pages de remerciement héritées conservées. Site statique sans framework, compilation, template serveur ou bibliothèque front-end externe. Trois feuilles CSS, un JavaScript local, quatre images et quatre PDF. Navigation desktop et mobile ; réglages locaux de lecture ; tableaux simples et graphiques HTML. Aucun média audio/vidéo, CAPTCHA, paiement, modale, carrousel ou formulaire d’envoi. Les réglages de lecture sont les seuls champs de saisie. Le contact renvoie aux coordonnées institutionnelles existantes.

Outils de test seulement : Playwright 1.63.0, axe-core 4.13.0, Python standard pour les contrôles structurels. Dépendances verrouillées ; aucune dépendance de test chargée par les visiteurs.

## Corrections principales et critères concernés

| Modification | RGAA 4.1.2 | WCAG 2.2 concernés |
|---|---|---|
| Balisage sémantique, groupes nommés, fil d’Ariane, titres, noms des liens langue, tableaux avec en-têtes de lignes | 5.6–5.7, 6.1–6.2, 7.1, 8.2, 8.7, 9.1–9.3 | 1.3.1, 2.4.2, 2.4.4, 2.4.6, 2.5.3, 3.1.1–3.1.2, 4.1.2 |
| Évitement sur toutes les pages dont 404 ; navigation mobile dans le flux ; focus visible ; fermeture Escape et retour du focus | 7.3, 10.7, 12.6–12.9 | 2.1.1–2.1.2, 2.4.1, 2.4.3, 2.4.7, 2.4.11 |
| Couleurs et contraste renforcés ; réglages de couleur ; commandes agrandies | 3.1–3.3, 10.6–10.7 | 1.4.1, 1.4.3, 1.4.6 (AAA), 1.4.11, 2.5.8 ; objectif 2.5.5 (AAA) |
| Grilles souples, titres et montants repliables, espacements, texte agrandi, suppression du débordement de la navigation | 10.4, 10.11–10.12 | 1.4.4, 1.4.10, 1.4.12 |
| Commandes de lecture étiquetées, choix conservés localement, remise à zéro et annonce discrète ; couleurs forcées | 7.1, 7.5, 11.1–11.4, 11.9 | 1.3.1, 3.2.1–3.2.2, 4.1.2–4.1.3 ; contribue à 1.4.8 (AAA) |
| Versions HTML intégrales des quatre PDF ; langue française corrigée dans deux PDF sans modification visuelle | 13.3–13.4 | 1.3.1, 3.1.1 ; alternatives documentaires à valider |
| Glossaire, présentation simple, plans du site FR/EN | 12.1, 12.3–12.4 | 2.4.5 ; contribue à 3.1.3–3.1.5 (AAA) |

Les correspondances indiquent les objectifs concernés, pas une certification de chaque critère. Le RGAA ne possède pas lui-même des niveaux A/AA/AAA : cette gradation appartient aux WCAG.

## Tests exécutés après corrections

- Structure et références locales : **31 pages, 1 458 références, zéro problème signalé** par `scripts/qa.py`.
- Axe avec règles A/AA, WCAG 2.2, bonnes pratiques, contraste renforcé et `target-size` activés : **62 contrôles page/largeur, 0 violation**.
- Largeurs 1 280 et 320 pixels CSS : **0 débordement détecté**, y compris avec espacements WCAG. 320 pixels représente le reflow d’une fenêtre de 1 280 pixels à 400 % ; le zoom réel du navigateur à 400 % reste à vérifier sur les navigateurs cibles.
- Agrandissement du texte à 200 % sur les 31 pages ; tests de menus, liens d’évitement et modes de lecture : **0 échec sur 48 contrôles complémentaires**.
- Scénarios additionnels FR/EN : images décodées, menu clavier, Escape, accès aux préférences, persistance, annonce, focus en couleurs forcées et repli sans JavaScript : **16/16 réussis**.
- Contenu des quatre équivalents HTML comparé au texte extrait des PDF, espaces et puces normalisés : aucun texte source omis. Une note signale la mention historique du formulaire dans les biographies.
- Deux PDF français : langue corrigée, comparaison des rendus pixel à pixel sans différence.
- Captures desktop/mobile examinées ; portrait décodé avant capture pour éviter un faux vide dû au chargement asynchrone.
- Site statique : pas d’étape de compilation. Contrôle syntaxique JavaScript et `git diff --check` exécutés.

**8 résultats axe « incomplete » conservés** : flèches décoratives des accueils FR/EN aux deux largeurs, pour contraste standard et renforcé. Les flèches portent `aria-hidden`, le lien ou le groupe contient déjà le libellé utile. Ce ne sont pas huit erreurs confirmées. La visibilité graphique et la compréhension des diagrammes restent à valider ; aucun résultat n’a été masqué dans la configuration axe.

Résultats bruts : `audit/accessibility-results.json`, `audit/interaction-results.json`. Les outils ne couvrent ni tous les critères AAA ni toutes les technologies d’assistance. Lighthouse et Pa11y n’ont pas été exécutés ; aucun score n’est annoncé.

## Points restants, classés

| Classe | Point restant | Action |
|---|---|---|
| Livraison | Connexion GitHub rétablie ; publication et contrôles de déploiement traités séparément | Consulter GitHub Actions pour le statut de la révision |
| Majeur | Aucun défaut confirmé restant dans les tests exécutés ; absence de preuve de conformité globale | Achever les vérifications humaines ci-dessous avant toute déclaration |
| Mineur | Mention historique d’un formulaire dans les PDF biographiques sources | Note explicative ajoutée aux versions HTML ; révision éditoriale future du document source souhaitable |
| Validation humaine nécessaire | Parcours NVDA/Firefox, NVDA/Chrome, VoiceOver/Safari ; ordre vocal, titres, tableaux, noms de liens, annonces | Tester les 31 pages et les états ouverts des commandes |
| Validation humaine nécessaire | Zoom navigateur réel 200/400 %, lecture sans CSS, couleurs personnalisées et états focus/hover | Vérifier dans plusieurs moteurs et avec réglages système |
| Validation humaine nécessaire | PDF : balisage, ordre de lecture, langues locales ; équivalence des documents | Valider avec outil PDF dédié et lecteur d’écran |
| Validation humaine nécessaire | Pertinence des alternatives, sigles, changements de langue, niveau de lecture, vocabulaire scientifique | Relecture éditoriale et essais avec utilisateurs ; les pages simples ne sont pas certifiées FALC |
| Validation humaine nécessaire | AAA complet : tailles de toutes les cibles avec exceptions, apparence du focus, présentation visuelle, compréhension de tous les contenus | Audit critère par critère ; aucun engagement de conformité AAA globale |

## Reproduction

```sh
python scripts/qa.py
cd scripts/accessibility
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install --with-deps chromium
cd ../..
node scripts/accessibility/audit.cjs
node scripts/accessibility/interaction.cjs
```

Le workflow `.github/workflows/accessibility.yml` exécute ces tests de rendu et conserve les résultats. En local, la variable optionnelle `CHROMIUM_EXECUTABLE_PATH` peut désigner un Chromium installé ; elle a été utilisée dans cet environnement. Le contrôle de structure se lance séparément.

## Fichiers

- Pages existantes françaises et anglaises : balisage commun, aides et liens documentaires ; `404.html` : chemins absolus et évitement.
- Nouveaux fichiers : `assets/css/accessibility.css`, `cv.html`, `biographie.html`, `glossaire.html`, `presentation-simple.html`, `plan-du-site.html` et leurs cinq équivalents anglais.
- `assets/js/site.js`, deux PDF FR dans `assets/docs/`, `sitemap.xml`, `README.md`, `VALIDATION-REPORT.json`.
- Tests : `scripts/qa.py`, `scripts/accessibility/audit.cjs`, `scripts/accessibility/interaction.cjs`, verrou npm, workflow et `.gitignore`.
- Preuves et matrice : répertoire `audit/`.

## Références officielles

- [RGAA 4.1.2 et critères](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/).
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- [Exigences de conformité WCAG](https://www.w3.org/WAI/WCAG22/Understanding/conformance.html).
