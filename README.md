# Anis Rojbi — site académique

Site bilingue français / anglais : https://anisrojbi.fr/

## Publication
Site statique HTML/CSS/JavaScript. GitHub Pages : branche `main`, dossier racine. Aucune compilation nécessaire.

## Organisation
- 29 pages HTML : 14 pages françaises, 14 pages anglaises dans `en/`, et la page `404.html`.
- `assets/css/styles.css` : système graphique unique, responsive, contrastes, focus et préférences de lecture, partagé par les deux langues.
- `assets/js/site.js` : fermeture du menu mobile, gestion du clavier et du focus, préférences locales de lecture et soumission progressive du formulaire de contact.
- `assets/img/` : portraits ; `assets/figures/` : cinq schémas scientifiques en français et en anglais ; `assets/docs/` : quatre documents PDF.

## Contact
Les pages `contact.html` et `en/contact.html` utilisent Formspree en HTTPS pour transmettre les messages. L’adresse électronique destinataire n’est pas publiée dans le code. Les formulaires conservent des labels visibles, les champs obligatoires natifs, un champ honeypot anti-spam sans CAPTCHA et un message d’état accessible. Sans JavaScript, la soumission POST vers Formspree reste fonctionnelle.

## Vérification
Exécuter `python scripts/qa.py` (Python standard, sans dépendance), puis ouvrir le site avec `python -m http.server 8000`.
Le script contrôle notamment les références locales, la structure des pages et la configuration des formulaires Formspree. Les vérifications automatiques ne constituent pas un audit complet de conformité RGAA.

Les fichiers `netlify.toml`, `_headers` et `configure_site.py` issus de l’archive sont conservés pour une éventuelle migration. Ils ne sont pas utilisés par GitHub Pages.

## Audit d’accessibilité

Voir [le rapport technique](audit/RAPPORT-ACCESSIBILITE.md), les résultats JSON et la matrice RGAA dans `audit/`. Ces documents ne constituent pas une certification. Les résultats bruts antérieurs sont conservés comme historique de leur révision ; le rapport précise leur date et leur périmètre. Le workflow axe/Playwright vérifie les pages et les interactions lors de ses exécutions. Les quatre PDF disposent de versions HTML intégrales accessibles depuis leurs liens de téléchargement.

## Figures du séminaire ICH

Les figures de `recherche.html` et `en/research.html` sont des adaptations vectorielles de `ICH_Seminar_Anis8BIS.pptx`, fourni par Anis Rojbi. La correspondance précise figure/diapositive et les choix de traduction figurent dans [assets/figures/README.md](assets/figures/README.md). `python scripts/research_figures.py` régénère les dix SVG.

Chaque figure dispose de libellés localisés, d’une légende avec source, d’une description HTML complète et d’un lien vers le SVG à sa taille native. La figure de fatigue est une synthèse du texte de la diapositive 4, et non une figure expérimentale présente dans le diaporama. Aucun graphique EEG n’est attribué à ce document, qui n’en contient pas.
