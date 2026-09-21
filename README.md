# Anis Rojbi — site académique

Site bilingue français / anglais : https://anisrbp8.github.io/

## Publication
Site statique HTML/CSS/JavaScript. GitHub Pages : branche `main`, dossier racine. Aucune compilation nécessaire.

## Organisation
- Pages françaises à la racine et dix pages anglaises dans `en/`.
- `assets/css/styles.css` : styles de base ; `assets/css/editorial.css` : harmonisation responsive.
- `assets/js/site.js` : fermeture du menu mobile, gestion du clavier et du focus.
- `assets/img/` : quatre images ; `assets/docs/` : quatre documents PDF.

## Contact
La page propose un lien vers les coordonnées officielles du département à l’Université Paris 8. Aucun formulaire ne collecte de données et aucune adresse de réception n’est publiée dans le code. L’envoi de messages intégré au site nécessite un service de réception configuré par le propriétaire ; GitHub Pages ne traite pas les formulaires. Les anciennes pages de remerciement ne prétendent plus qu’un envoi a eu lieu.

## Vérification
Exécuter `python scripts/qa.py` (Python standard, sans dépendance), puis ouvrir le site avec `python -m http.server 8000`.
Les vérifications automatiques ne constituent pas un audit complet de conformité RGAA.

Les fichiers `netlify.toml`, `_headers` et `configure_site.py` issus de l’archive sont conservés pour une éventuelle migration. Ils ne sont pas utilisés par GitHub Pages.
