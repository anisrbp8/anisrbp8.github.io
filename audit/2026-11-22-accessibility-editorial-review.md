# Accessibility and editorial refinement - 22 November 2026

## Scope and baseline

Repository: anisrbp8/anisrbp8.github.io. Public origin: https://anisrojbi.fr/.
The candidate starts from commit 4c2b9d9394c4d4859790dade0434e08f44ce8c26,
not the older project ZIP. That preliminary commit improves deployment
verification by checking the two shared stylesheets and retaining the exact
source used by the public UX workflow.

This is an incremental improvement, not a WCAG or RGAA conformance declaration.
The scientific bibliography, publication identifiers, figures, contact endpoint,
receiving-address privacy, navigation structure and existing reading preferences
are preserved. No new service, tracking script, font or runtime dependency is added.

## Changes

- Contact fields no longer appear invalid before any interaction. Native HTML
  validation remains enabled. Invalid fields receive persistent FR/EN text,
  aria-invalid and an associated description, without replacing existing help.
  Correcting a value removes the corresponding error.
- Submission feedback preserves the draft on failure, restores the submit button,
  prevents duplicate simultaneous requests and handles a 30-second timeout.
  Network and timeout messages explicitly say delivery could not be confirmed.
  No automatic retry is performed and the draft is not stored externally.
- The back-to-top link is in the normal document flow after the footer, rather
  than floating over text or links on small screens.
- Reading preferences retain their native disclosure marker. Focus remains
  visible in forced-colour mode, including when a custom reading theme is active.
- The home introduction is less oversized; the portrait and scientific profiles
  use a compact mobile layout. Small home navigation targets are enlarged.
  Muted dark-teal dates and labels complement the existing black-and-white design.
- The repeated list of research domains is removed from the introduction.
  Visitor descriptions and the invitation to discuss internships, PhDs and
  collaboration are rewritten in a more direct voice in French and English.
- The Handicap 2026 item is removed from the home news list in both languages;
  three dated items remain. The English home receives the missing home class so
  that the same home styling and target sizing apply in both languages.
- Existing automated interaction tests now cover untouched fields, associated
  errors, retained help, duplicate submissions, the real abort timer under virtual
  time and the non-floating return link. Home tests cover the three-item news list
  and the shared home class.

## Local verification

The container cannot navigate to HTTP or file URLs. Local HTML was therefore
rendered in Chromium with the repository CSS, JavaScript and local images inlined.
This tests layout and interactions, not public HTTP delivery, headers or caching.

Results before publication:

- 29 HTML documents checked at 1440, 768, 390 and 320 CSS pixels: no horizontal
  page overflow or JavaScript exception in the tested initial states.
- Text-spacing overrides on all 29 pages; 200% text via the existing reading
  control on the 28 pages that have that control: no horizontal page overflow.
- Keyboard menu opening, Escape focus restoration, forced colours and the return
  link checked on the FR/EN home, contact and research pages.
- FR/EN contact: pristine state, invalid values, correction, preserved help,
  simulated success, server failure, network failure and timeout feedback.
- FR/EN home: native keyboard navigation without JavaScript and retained content.
- 336 local checks passed; 8 additional checks passed for duplicate submission,
  actual timeout using virtual time, timeout focus and bilingual home/CV parity.
  These are test assertions, not 344 WCAG criteria or a percentage of conformance.
- scripts/qa.py: 29 pages, 1277 local references, no reported issue. Its count of
  four PDF documents is an inventory, not an accessibility audit of those PDFs.
- node --check passed for the modified site and test scripts.
- Desktop/mobile screenshots inspected for home and contact presentation.

All form responses in tests are intercepted or simulated. No real message was
sent through Formspree. The repository workflows provide separate axe, W3C Nu,
interaction and public-deployment results; their run status is authoritative and
must not be inferred from this local report.

## Remaining human evaluation

Test with NVDA/Firefox and VoiceOver/Safari, especially persistent form errors,
status announcements, figure dialogs and reading preferences. Check physical
browser zoom at 200% and 400%, rather than equating a 320 CSS-pixel viewport to a
complete zoom test. Review the semantic accuracy of scientific image alternatives
with the author and audit PDF reading order, tags and links separately. Involve
users with disabilities before making any conformance claim.

Publication metadata was preserved, not independently re-audited against every
publisher during this intervention. This editorial pass is not a claim that every
scientific sentence on the site has been externally fact-checked.

## W3C WAI references

- Error identification: https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html
- Focus not obscured: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- Reflow: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- Evaluation and human review: https://www.w3.org/WAI/test-evaluate/
