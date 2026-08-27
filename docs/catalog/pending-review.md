# Pending review

Cards that exist under [cards/](cards/) but are not yet listed in [INDEX.md](INDEX.md), with the specific defect that blocks indexing. A card is indexable only when it has a grade, a findings or evidence section, and a non-empty "What we could not check" section.

Fix the defect and the card is indexed on the next pass. Nothing here implies a problem with the audited plugin; the defect is in the card.

| Card | Defect |
|---|---|
| [cards/dsh-free-search.md](cards/dsh-free-search.md) | No "What we could not check" section. The header's Methodology row names the unrun stages (S4 behavioral probe, S5 cross-model review, published-tarball analysis) but the card has no section that states the resulting limits, so the required disclosure is absent. |
| [cards/dsh-web-lan-access.md](cards/dsh-web-lan-access.md) | No "What we could not check" section. The Methodology row explicitly cross-references one ("see 'What we could not check'"), and that section was never written; the reference is dangling. |
| [cards/picturereader.md](cards/picturereader.md) | No "What we could not check" section. The Methodology row records unrun stages S4 and S5 plus seven Windows-only OCR test failures that could not be exercised on the audit host, none of which is carried into a limits section. |
