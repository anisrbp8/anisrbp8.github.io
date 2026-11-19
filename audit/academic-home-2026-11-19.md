# Academic home additions - 19 November 2026

## Scope

French and English home pages: academic author links below the portrait, four dated news/project entries, five selected publications, an educational granularity demonstration, and initial-enquiry guidance for Master's internships, PhD projects and collaboration. Existing scientific text, page layout, Formspree configuration, verification tags and research figures are preserved.

## Sources and editorial limits

- ResearchGate author contributions: https://www.researchgate.net/scientific-contributions/Anis-Rojbi-81385993 . This is an automatically generated author-contributions page associated with Paris 8, not a verified claim of a personally managed profile. The visible link says research contributions.
- DBLP author record: https://dblp.org/pid/152/8945.html . ERUA record already present on the site: https://researchportal.erua-eui.eu/researchers/anis-rojbi . No ORCID, HAL or Scholar identifier has been invented.
- ICMV 2026: the existing, author-maintained `publications.html#fatigue-2026` supplies the contribution title and authors. https://icmv.org/ confirms the conference dates (15-18 October 2026). The news text does not claim attendance by a particular person, proceedings publication or a DOI.
- Handicap 2026: https://ifrath.fr/handicap2026/comites/ names Anis Rojbi in the scientific committee. The news concerns committee membership, not a speaking engagement or attendance claim.
- Erasmus+ Sfax 2025-2027: existing `projets.html` and `en/projects.html` supply coordination and double-degree preparation with ENIS. This is labelled an ongoing project, not a newly awarded grant. No funding amount is added.
- Frontiers: https://www.frontiersin.org/journals/neuroinformatics/articles/10.3389/fninf.2025.1521805/full confirms publication on 27 February 2025. The GAL link points to the original dataset referenced in the article: https://www.kaggle.com/competitions/grasp-and-lift-eeg-detection . It is not represented as a newly released dataset or the authors' code.

## Selected references

Titles, author lists, years and publication labels are copied from the existing reviewed bibliography, without adding new publications. Each title links back to its complete reference.

| Existing reference | DOI | Additional resource |
| --- | --- | --- |
| EEG 2025 | 10.3389/fninf.2025.1521805 | Publisher full text and original GAL dataset |
| Accessible images 2023 | 10.17758/EIRAI18.DiR0523101 | https://www.researchgate.net/publication/377694809_Enhancing_the_Accessibility_of_Images_on_the_Web_A_Holistic_View_and_New_Perspectives |
| Assistive interface 2019 | 10.1007/978-3-030-03402-3_43 | https://arxiv.org/abs/1704.05915 ; explicitly labelled a 2017 preprint, not the final 2019 version |
| Physical load 2018 | 10.1007/978-3-030-05051-1_33 | https://arxiv.org/abs/1808.04760 ; explicitly labelled a preprint |
| Tactile maps 2014 | 10.1145/2661334.2661335 | https://www.researchgate.net/publication/267506702_New_tools_for_automating_tactile_geographic_map_translation |

No publicly verified code repository was identified for this selection, so there are no speculative Code links. External platforms may impose access restrictions.

## Demonstration and privacy

The new dependency-free script samples a synthetic binary house on a 32-by-32 grid and averages blocks to display 8-by-8, 16-by-16 and 32-by-32 views. This is an educational illustration of visual granularity, not a reproduction of any published algorithm, an experimental result or a tactile rendering. The limitation is stated next to the demo in both languages.

A native select and reset button are keyboard usable. The SVG has a title and description; the current level is also explained and announced in plain text. Without JavaScript, the static shape and text remain available and inactive controls stay hidden. No upload, cookie, analytics, external widget or additional third-party request is introduced by this demo.

## Enquiries

The invitation is not an advertisement for funded positions. Availability, funding, university procedures and supervision must be discussed. The initial contact uses the existing Formspree form, which has no attachment field. CV/work examples are requested as links; further documents are arranged afterwards. No new admission rule or guaranteed position is asserted.

## Checks

- Local source-structure checker: 29 HTML pages, 1277 local references, no issues.
- Local in-memory Chromium rendering: 82 checks passed for both home pages at 320 and 1280 pixels, keyboard demo use, text descriptions, text spacing, 200 percent text enlargement, forced-colour focus, and JavaScript-free fallback. The source was rendered in memory because the local browser restricts navigations; this is not a live-site test.
- Persistent CI: `scripts/accessibility/academic-home.cjs` tests the additions, expanded-content axe checks, interaction, layout and fallback; screenshots/results are stored with the accessibility artifact. Existing W3C Nu, whole-site accessibility and published-site workflows remain enabled.
- Check the workflows for the commit being reviewed for CI/live-site outcomes; this document does not assert results of runs that have not completed.

Automated tests do not establish full WCAG/RGAA conformance. Screen-reader and user evaluation remain necessary.
