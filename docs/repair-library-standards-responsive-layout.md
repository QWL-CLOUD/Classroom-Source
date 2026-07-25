# Library + Standards Responsive UI Repair

## Purpose

Improve the Library information hierarchy and prevent long Standard metadata
from overflowing list buttons, detail headers, and narrow mobile layouts.

## Library changes

- Present Activities, Resources, and Assessments as direct catalog tabs.
- Keep legacy Library Standard records available only when they exist.
- Add a clear link from Library to the independent Standards workspace.
- Simplify the filter grid after moving Type selection to tabs.
- Disable Resource Format when the selected catalog type cannot use it.
- Allow long item titles, formats, tags, and status badges to wrap safely.
- Preserve the existing Library create, edit, archive, restore, and filter behavior.

## Standards changes

- Add a clear link back to Library.
- Prevent long Standard codes, framework labels, subjects, grade bands,
  statements, and status badges from escaping their containers.
- Stack status badges below Standard identity on narrow screens.
- Keep the Standard directory sticky only when the two-column layout is active.
- Improve search-field icon alignment and filter control sizing.
- Preserve Standard identity, hierarchy, lifecycle, and alignment behavior.

## Regression coverage

- Update the Library catalog workflow to use the new catalog tabs.
- Add a 390px responsive test with deliberately long Activity and Standard text.
- Verify that children remain inside their buttons.
- Verify that the document has no horizontal overflow.
- Run axe against the responsive Standards workspace.

## Non-goals

- Standards import
- Activity import
- Coverage reporting
- Domain or database changes
- New lifecycle behavior
- Changes to Standard alignment semantics
