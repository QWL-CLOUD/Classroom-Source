#!/usr/bin/env python3
from __future__ import annotations

import shutil
import sys
from pathlib import Path

BASE_COMMIT = "786bab69cd0cdeeedd14dd8469faf7127a53a492"
PACKAGE_ROOT = Path(__file__).resolve().parent
PAYLOAD_ROOT = PACKAGE_ROOT / "payload"
REPO_ROOT = Path.cwd().resolve()

FULL_REPLACEMENTS = {
    Path("src/app/router.tsx"),
    Path("src/domain/repositories/ClassroomRepository.ts"),
    Path("src/features/editing/calendarEventMutationService.ts"),
    Path("src/features/editing/editHistoryService.ts"),
}

NEW_FILES = {
    Path("src/features/editing/scheduleBlockEditorModel.ts"),
    Path("src/features/editing/scheduleBlockEditorModel.test.ts"),
    Path("src/features/editing/scheduleBlockGraph.ts"),
    Path("src/features/editing/scheduleBlockGraph.test.ts"),
    Path("src/features/editing/scheduleBlockCommands.ts"),
    Path("src/features/editing/scheduleBlockCommands.test.ts"),
    Path("src/features/editing/editCommandRegistry.ts"),
    Path("src/features/editing/scheduleBlockMutationService.ts"),
    Path("src/features/editing/scheduleBlockMutationService.test.ts"),
    Path("src/features/editing/editHistoryService.test.ts"),
    Path("src/routes/ScheduleBlockEditorRoute.tsx"),
    Path("src/routes/ScheduleBlockEditorRoute.module.css"),
    Path("src/data/repositories/DexieScheduleBlockRepository.test.ts"),
    Path("tests/e2e/schedule-block-editing.spec.ts"),
}


def fail(message: str) -> None:
    print(f"Phase 3A installer stopped: {message}", file=sys.stderr)
    raise SystemExit(1)


def read(relative: Path) -> str:
    path = REPO_ROOT / relative
    if not path.is_file():
        fail(f"required source file is missing: {relative}")
    return path.read_text(encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"expected exactly one {label} anchor, found {count}")
    return text.replace(old, new, 1)


def build_modified_files() -> dict[Path, str]:
    modified: dict[Path, str] = {}

    repository_path = Path("src/data/repositories/DexieClassroomRepository.ts")
    repository = read(repository_path)
    repository_anchor = (
        "  async listScheduleBlocksForRange(range: LocalDateRange): Promise<ScheduleBlock[]> {\n"
    )
    repository_method = """  async listScheduleBlocks(): Promise<ScheduleBlock[]> {
    const scheduleBlocks = (await this.db.scheduleBlocks.toArray()).map((value) =>
      scheduleBlockSchema.parse(value),
    );

    for (const block of scheduleBlocks) {
      if (block.effectiveFrom) {
        assertLocalDateRange(block.effectiveFrom, block.effectiveFrom);
      }
      if (block.effectiveTo) {
        assertLocalDateRange(block.effectiveTo, block.effectiveTo);
      }
      if (block.effectiveFrom && block.effectiveTo) {
        assertLocalDateRange(block.effectiveFrom, block.effectiveTo);
      }
    }

    return scheduleBlocks.filter((block) => !block.archivedAt).sort(compareScheduleBlocks);
  }

"""
    modified[repository_path] = replace_once(
        repository,
        repository_anchor,
        repository_method + repository_anchor,
        "Schedule Block repository",
    )

    calendar_path = Path("src/routes/CalendarRoute.tsx")
    calendar = read(calendar_path)
    calendar_anchor = """        <a className="button button-primary" href={`#/calendar/edit?date=${date}`}>
          <CalendarDays aria-hidden="true" size={18} /> Manage events
        </a>
"""
    calendar_links = """        <a className="button" href={`#/schedule/edit?date=${date}`}>
          Manage schedule
        </a>
        <a className="button button-primary" href={`#/calendar/edit?date=${date}`}>
          <CalendarDays aria-hidden="true" size={18} /> Manage events
        </a>
"""
    modified[calendar_path] = replace_once(
        calendar,
        calendar_anchor,
        calendar_links,
        "Calendar Manage events",
    )

    week_path = Path("src/routes/WeekRoute.tsx")
    week = read(week_path)
    week_anchor = """          Next <ChevronRight size={18} />
        </button>
      </div>
"""
    week_links = """          Next <ChevronRight size={18} />
        </button>
        <a className="button button-primary" href={`#/schedule/edit?date=${date}`}>
          Manage schedule
        </a>
      </div>
"""
    modified[week_path] = replace_once(
        week,
        week_anchor,
        week_links,
        "Week navigation",
    )

    return modified


def validate_payload() -> None:
    expected = FULL_REPLACEMENTS | NEW_FILES
    for relative in expected:
        if not (PAYLOAD_ROOT / relative).is_file():
            fail(f"package payload is incomplete: {relative}")

    forbidden = (
        "classroom-v19-system-health",
        "_importBatchId",
        "indexeddb-export",
        "BEGIN PRIVATE",
        "data:image/",
    )
    for path in PAYLOAD_ROOT.rglob("*"):
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for token in forbidden:
            if token in text:
                fail(f"privacy/source guard found forbidden token {token!r} in {path.relative_to(PAYLOAD_ROOT)}")


def main() -> None:
    if not (REPO_ROOT / "package.json").is_file() or not (REPO_ROOT / "src/main.tsx").is_file():
        fail("run this installer from the Classroom-Source repository root")

    validate_payload()

    for relative in NEW_FILES:
        if (REPO_ROOT / relative).exists():
            fail(f"new Phase 3A file already exists: {relative}")

    modified = build_modified_files()

    for relative in FULL_REPLACEMENTS:
        source = PAYLOAD_ROOT / relative
        if not (REPO_ROOT / relative).is_file():
            fail(f"replacement target is missing: {relative}")
        modified[relative] = source.read_text(encoding="utf-8")

    for relative, text in modified.items():
        destination = REPO_ROOT / relative
        destination.write_text(text, encoding="utf-8")

    for relative in NEW_FILES:
        source = PAYLOAD_ROOT / relative
        destination = REPO_ROOT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    print("Phase 3A source files applied successfully.")
    print(f"Base commit: {BASE_COMMIT}")
    print("No dist, schema, migration, legacy storage, or private data files were changed.")


if __name__ == "__main__":
    main()
