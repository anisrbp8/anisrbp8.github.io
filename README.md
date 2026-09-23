# Anis Rojbi — site académique

Site bilingue français / anglais : https://anisrbp8.github.io/

## Publication
Site statique HTML/CSS/JavaScript. GitHub Pages : branche `main`, dossier racine. Aucune compilation nécessaire.

## Organisation
- Pages françaises à la racine et quinze pages anglaises dans `en/`.
- `assets/css/styles.css` : système graphique unique, responsive, contrastes, focus et préférences de lecture, partagé par les deux langues.
- `assets/js/site.js` : fermeture du menu mobile, gestion du clavier et du focus, préférences locales de lecture.
- `assets/img/` : portraits ; `assets/figures/` : cinq schémas scientifiques en français et en anglais ; `assets/docs/` : quatre documents PDF.

## Contact
La page propose un lien vers les coordonnées officielles du département à l’Université Paris 8. Aucun formulaire ne collecte de données et aucune adresse de réception n’est publiée dans le code. L’envoi de messages intégré au site nécessite un service de réception configuré par le propriétaire ; GitHub Pages ne traite pas les formulaires. Les anciennes pages de remerciement ne prétendent plus qu’un envoi a eu lieu.

## Vérification
Exécuter `python scripts/qa.py` (Python standard, sans dépendance), puis ouvrir le site avec `python -m http.server 8000`.
Les vérifications automatiques ne constituent pas un audit complet de conformité RGAA.

Les fichiers `netlify.toml`, `_headers` et `configure_site.py` issus de l’archive sont conservés pour une éventuelle migration. Ils ne sont pas utilisés par GitHub Pages.

## Audit du 22 septembre 2026

Voir [le rapport technique](audit/RAPPORT-ACCESSIBILITE.md), les résultats JSON et la matrice RGAA dans `audit/`. Ces documents ne constituent pas une certification. Le workflow axe/Playwright vérifie les pages et les interactions à chaque modification. Les quatre PDF disposent de versions HTML intégrales accessibles depuis leurs liens de téléchargement.

## Figures du séminaire ICH

Les figures de `recherche.html` et `en/research.html` sont des adaptations vectorielles de `ICH_Seminar_Anis8BIS.pptx`, fourni par Anis Rojbi. La correspondance précise figure/diapositive et les choix de traduction figurent dans [assets/figures/README.md](assets/figures/README.md). `python scripts/research_figures.py` régénère les dix SVG.

Chaque figure dispose de libellés localisés, d’une légende avec source, d’une description HTML complète et d’un lien vers le SVG à sa taille native. La figure de fatigue est une synthèse du texte de la diapositive 4, et non une figure expérimentale présente dans le diaporama. Aucun graphique EEG n’est attribué à ce document, qui n’en contient pas.

La refonte du 22 septembre 2026 remplace les couches CSS précédentes par une feuille commune. Les rapports antérieurs dans `audit/` décrivent leur révision d’origine ; consulter les résultats GitHub Actions du commit courant pour les contrôles automatiques les plus récents.
