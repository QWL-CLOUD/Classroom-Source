#!/usr/bin/env python3
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

BASE_COMMIT = "93305f3ad369cb9ed3ada005a61100e09e563dba"
EXPECTED_BRANCH = "phase-3a-parent-child-visual-closure"
PACKAGE_DIR = Path(__file__).resolve().parent
PAYLOAD_ARCHIVE = PACKAGE_DIR / "parent-child-visual-payload.tar.gz"
REPO = Path.cwd().resolve()


def stop(message: str) -> None:
    raise SystemExit(f"Parent–Child Visual Closure installer stopped: {message}")


def run(*args: str) -> str:
    completed = subprocess.run(
        args,
        cwd=REPO,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode != 0:
        stop(completed.stderr.strip() or completed.stdout.strip() or "command failed")
    return completed.stdout.strip()


def read(path: str) -> str:
    target = REPO / path
    if not target.is_file():
        stop(f"required source file is missing: {path}")
    return target.read_text()


def write(path: str, text: str) -> None:
    target = REPO / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        stop(f"expected exactly one {label} anchor, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        stop(f"expected exactly one {label} regex anchor, found {count}")
    return updated


def append_once(text: str, marker: str, addition: str, label: str) -> str:
    if marker in text:
        stop(f"{label} already appears to be installed")
    return text.rstrip() + "\n\n" + addition.strip() + "\n"


def validate_repository() -> None:
    if run("git", "rev-parse", "--show-toplevel") != str(REPO):
        stop("run this installer from the Git repository root")
    branch = run("git", "branch", "--show-current")
    if branch != EXPECTED_BRANCH:
        stop(f"expected branch {EXPECTED_BRANCH}, found {branch or '(detached HEAD)'}")
    if run("git", "rev-parse", "HEAD") != BASE_COMMIT:
        stop(f"expected base commit {BASE_COMMIT}")
    if run("git", "status", "--porcelain", "--untracked-files=no"):
        stop("tracked files have uncommitted changes")


def archive_files(prefix: str) -> list[tuple[Path, bytes]]:
    if not PAYLOAD_ARCHIVE.is_file():
        stop(f"payload archive is missing: {PAYLOAD_ARCHIVE.name}")

    files: list[tuple[Path, bytes]] = []
    with tarfile.open(PAYLOAD_ARCHIVE, "r:gz") as archive:
        for member in archive.getmembers():
            if not member.isfile() or not member.name.startswith(f"{prefix}/"):
                continue
            relative = Path(member.name).relative_to(prefix)
            if relative.is_absolute() or ".." in relative.parts:
                stop(f"unsafe payload path: {member.name}")
            extracted = archive.extractfile(member)
            if extracted is None:
                stop(f"unable to read payload file: {member.name}")
            files.append((relative, extracted.read()))

    if not files:
        stop(f"payload archive contains no {prefix} files")
    return files


def validate_new_files() -> None:
    for relative, _ in archive_files("payload"):
        if (REPO / relative).exists():
            stop(f"new visual-closure file already exists: {relative}")


def patch_week_route() -> None:
    path = "src/routes/WeekRoute.tsx"
    text = read(path)
    text = replace_once(
        text,
        "import { useUiStore } from '@/app/uiStore';\n",
        "import { useUiStore } from '@/app/uiStore';\n"
        "import {\n"
        "  buildScheduleBlockHierarchyMetadata,\n"
        "  type ScheduleBlockHierarchyMetadata,\n"
        "} from '@/features/editing/scheduleBlockHierarchy';\n",
        "Week hierarchy import",
    )
    text = replace_once(
        text,
        "function itemCountLabel(count: number): string {\n"
        "  return `${count} ${count === 1 ? 'item' : 'items'}`;\n"
        "}\n",
        "function itemCountLabel(count: number): string {\n"
        "  return `${count} ${count === 1 ? 'item' : 'items'}`;\n"
        "}\n\n"
        "function childCountLabel(count: number): string {\n"
        "  return `${count} ${count === 1 ? 'child' : 'children'}`;\n"
        "}\n",
        "Week child-count helper",
    )
    text = replace_once(
        text,
        "  const visibleDays = week ? (showWeekends ? week.days : week.days.slice(0, 5)) : [];\n",
        "  const scheduleHierarchy = useMemo<ReadonlyMap<string, ScheduleBlockHierarchyMetadata>>(\n"
        "    () =>\n"
        "      state.status === 'ready'\n"
        "        ? buildScheduleBlockHierarchyMetadata(state.data.scheduleBlocks)\n"
        "        : new Map<string, ScheduleBlockHierarchyMetadata>(),\n"
        "    [state],\n"
        "  );\n"
        "  const visibleDays = week ? (showWeekends ? week.days : week.days.slice(0, 5)) : [];\n",
        "Week hierarchy metadata",
    )
    text = regex_once(
        text,
        r"^(?P<indent>[ \t]+)const focused = item\.occurrenceId === focusId;\n"
        r"(?P<gap>(?:[ \t]*\n)*)"
        r"(?P=indent)return \(",
        "\\g<indent>const focused = item.occurrenceId === focusId;\n"
        "\\g<gap>"
        "\\g<indent>const hierarchy =\n"
        "\\g<indent>  item.sourceType === 'schedule-block'\n"
        "\\g<indent>    ? scheduleHierarchy.get(item.sourceRecordId)\n"
        "\\g<indent>    : undefined;\n"
        "\\g<indent>return (",
        "Week item hierarchy lookup",
    )
    text = replace_once(
        text,
        "                          className={getItemClassName(item, focused)}\n",
        "                          className={`${getItemClassName(item, focused)} ${\n"
        "                            hierarchy?.visualDepth ? styles.hierarchyChild : ''\n"
        "                          } ${\n"
        "                            hierarchy && hierarchy.directChildCount > 0\n"
        "                              ? styles.hierarchyParent\n"
        "                              : ''\n"
        "                          }`}\n",
        "Week hierarchy class",
    )
    text = replace_once(
        text,
        "                          data-week-item={item.occurrenceId}\n",
        "                          data-week-item={item.occurrenceId}\n"
        "                          data-schedule-id={\n"
        "                            item.sourceType === 'schedule-block'\n"
        "                              ? item.sourceRecordId\n"
        "                              : undefined\n"
        "                          }\n"
        "                          data-schedule-depth={hierarchy?.visualDepth}\n"
        "                          data-parent-id={hierarchy?.parentId}\n"
        "                          data-child-count={hierarchy?.directChildCount}\n"
        "                          data-group-tone={hierarchy?.groupTone}\n",
        "Week hierarchy data attributes",
    )
    text = replace_once(
        text,
        "                          <p className={styles.itemTitle}>{item.title}</p>\n",
        "                          <p className={styles.itemTitle}>{item.title}</p>\n"
        "                          {hierarchy && hierarchy.directChildCount > 0 ? (\n"
        "                            <span className={styles.childCountBadge}>\n"
        "                              {childCountLabel(hierarchy.directChildCount)}\n"
        "                            </span>\n"
        "                          ) : null}\n",
        "Week child-count badge",
    )
    write(path, text)


def patch_today_route() -> None:
    path = "src/routes/TodayRoute.tsx"
    text = read(path)
    text = replace_once(
        text,
        "import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';\n",
        "import { formatCalendarMinute } from '@/features/calendar/calendarReadModel';\n"
        "import {\n"
        "  buildScheduleBlockHierarchyMetadata,\n"
        "  type ScheduleBlockHierarchyMetadata,\n"
        "} from '@/features/editing/scheduleBlockHierarchy';\n",
        "Today hierarchy import",
    )
    text = replace_once(
        text,
        "function itemCountLabel(count: number): string {\n"
        "  return `${count} ${count === 1 ? 'item' : 'items'}`;\n"
        "}\n",
        "function itemCountLabel(count: number): string {\n"
        "  return `${count} ${count === 1 ? 'item' : 'items'}`;\n"
        "}\n\n"
        "function childCountLabel(count: number): string {\n"
        "  return `${count} ${count === 1 ? 'child' : 'children'}`;\n"
        "}\n",
        "Today child-count helper",
    )
    text = replace_once(
        text,
        "  const state = useWorkspaceReadModel({ startDate: date, endDate: date });\n"
        "  const today = useMemo(\n",
        "  const state = useWorkspaceReadModel({ startDate: date, endDate: date });\n"
        "  const scheduleHierarchy = useMemo<ReadonlyMap<string, ScheduleBlockHierarchyMetadata>>(\n"
        "    () =>\n"
        "      state.status === 'ready'\n"
        "        ? buildScheduleBlockHierarchyMetadata(state.data.scheduleBlocks)\n"
        "        : new Map<string, ScheduleBlockHierarchyMetadata>(),\n"
        "    [state],\n"
        "  );\n"
        "  const today = useMemo(\n",
        "Today hierarchy metadata",
    )
    text = regex_once(
        text,
        r"^(?P<indent>[ \t]+)const durationLabel = getDurationLabel\(item\);\n"
        r"(?P<gap>(?:[ \t]*\n)*)"
        r"(?P=indent)return \(",
        r"\g<indent>const durationLabel = getDurationLabel(item);\n"
        r"\g<gap>"
        r"\g<indent>const hierarchy =\n"
        r"\g<indent>  item.sourceType === 'schedule-block'\n"
        r"\g<indent>    ? scheduleHierarchy.get(item.sourceRecordId)\n"
        r"\g<indent>    : undefined;\n"
        r"\g<indent>return (",
        "Today item hierarchy lookup",
    )
    text = replace_once(
        text,
        "className={getItemClassName(item)}\n",
        "                      className={`${getItemClassName(item)} ${\n"
        "                        hierarchy?.visualDepth ? styles.hierarchyChild : ''\n"
        "                      } ${\n"
        "                        hierarchy && hierarchy.directChildCount > 0\n"
        "                          ? styles.hierarchyParent\n"
        "                          : ''\n"
        "                      }`}\n",
        "Today hierarchy class",
    )
    text = replace_once(
        text,
        "aria-label={`${item.title}, ${item.timeLabel}, ${item.statusLabel}`}\n",
        "                      aria-label={`${item.title}, ${item.timeLabel}, ${item.statusLabel}`}\n"
        "                      data-schedule-id={\n"
        "                        item.sourceType === 'schedule-block' ? item.sourceRecordId : undefined\n"
        "                      }\n"
        "                      data-schedule-depth={hierarchy?.visualDepth}\n"
        "                      data-parent-id={hierarchy?.parentId}\n"
        "                      data-child-count={hierarchy?.directChildCount}\n"
        "                      data-group-tone={hierarchy?.groupTone}\n",
        "Today hierarchy data attributes",
    )
    text = replace_once(
        text,
        "<div className={styles.timelineTime} title={item.timeLabel}>\n",
        "                      <div\n"
        "                        className={styles.timelineTime}\n"
        "                        title={item.timeLabel}\n"
        "                        data-timeline-time\n"
        "                      >\n",
        "Today timeline time marker",
    )
    text = replace_once(
        text,
        "<div className={styles.timelineContent}>\n",
        "                      <div className={styles.timelineContent} data-timeline-content>\n",
        "Today timeline content marker",
    )
    text = replace_once(
        text,
        "<h3>{item.title}</h3>\n",
        "                        <h3>{item.title}</h3>\n"
        "                        {hierarchy && hierarchy.directChildCount > 0 ? (\n"
        "                          <span className={styles.childCountBadge}>\n"
        "                            {childCountLabel(hierarchy.directChildCount)}\n"
        "                          </span>\n"
        "                        ) : null}\n",
        "Today child-count badge",
    )
    write(path, text)


def patch_calendar_route() -> None:
    path = "src/routes/CalendarRoute.tsx"
    text = read(path)
    text = replace_once(
        text,
        "import { useMemo } from 'react';\n",
        "import { useMemo } from 'react';\n"
        "import {\n"
        "  buildScheduleBlockHierarchyMetadata,\n"
        "  type ScheduleBlockHierarchyMetadata,\n"
        "} from '@/features/editing/scheduleBlockHierarchy';\n",
        "Calendar hierarchy import",
    )
    text = replace_once(
        text,
        "  const state = useWorkspaceReadModel({\n"
        "    startDate: monthRange.gridStartDate,\n"
        "    endDate: monthRange.gridEndDate,\n"
        "  });\n"
        "  const calendar = useMemo(\n",
        "  const state = useWorkspaceReadModel({\n"
        "    startDate: monthRange.gridStartDate,\n"
        "    endDate: monthRange.gridEndDate,\n"
        "  });\n"
        "  const scheduleHierarchy = useMemo<ReadonlyMap<string, ScheduleBlockHierarchyMetadata>>(\n"
        "    () =>\n"
        "      state.status === 'ready'\n"
        "        ? buildScheduleBlockHierarchyMetadata(state.data.scheduleBlocks)\n"
        "        : new Map<string, ScheduleBlockHierarchyMetadata>(),\n"
        "    [state],\n"
        "  );\n"
        "  const calendar = useMemo(\n",
        "Calendar hierarchy metadata",
    )
    pattern = re.escape("<li key={item.occurrenceId} className={getItemClassName(item)}>")
    replacement = """<li
                              key={item.occurrenceId}
                              className={`${getItemClassName(item)} ${
                                item.sourceType === 'schedule-block' &&
                                scheduleHierarchy.get(item.sourceRecordId)?.visualDepth
                                  ? styles.hierarchyChild
                                  : ''
                              } ${
                                item.sourceType === 'schedule-block' &&
                                (scheduleHierarchy.get(item.sourceRecordId)?.directChildCount ?? 0) > 0
                                  ? styles.hierarchyParent
                                  : ''
                              }`}
                              data-calendar-item={item.occurrenceId}
                              data-schedule-id={
                                item.sourceType === 'schedule-block'
                                  ? item.sourceRecordId
                                  : undefined
                              }
                              data-schedule-depth={
                                item.sourceType === 'schedule-block'
                                  ? scheduleHierarchy.get(item.sourceRecordId)?.visualDepth
                                  : undefined
                              }
                              data-parent-id={
                                item.sourceType === 'schedule-block'
                                  ? scheduleHierarchy.get(item.sourceRecordId)?.parentId
                                  : undefined
                              }
                              data-child-count={
                                item.sourceType === 'schedule-block'
                                  ? scheduleHierarchy.get(item.sourceRecordId)?.directChildCount
                                  : undefined
                              }
                              data-group-tone={
                                item.sourceType === 'schedule-block'
                                  ? scheduleHierarchy.get(item.sourceRecordId)?.groupTone
                                  : undefined
                              }
                            >"""
    text = regex_once(text, pattern, replacement, "Calendar item opening")
    write(path, text)


HIERARCHY_TONES = """
.hierarchyParent,
.hierarchyChild {
  --hierarchy-surface: var(--surface-soft);
  --hierarchy-line: var(--border);
}

.hierarchyParent[data-group-tone='0'],
.hierarchyChild[data-group-tone='0'] {
  --hierarchy-surface: #edf3ef;
  --hierarchy-line: #879b8d;
}

.hierarchyParent[data-group-tone='1'],
.hierarchyChild[data-group-tone='1'] {
  --hierarchy-surface: #f1f3e9;
  --hierarchy-line: #979d7f;
}

.hierarchyParent[data-group-tone='2'],
.hierarchyChild[data-group-tone='2'] {
  --hierarchy-surface: #f4eee6;
  --hierarchy-line: #aa927c;
}

.hierarchyParent[data-group-tone='3'],
.hierarchyChild[data-group-tone='3'] {
  --hierarchy-surface: #f1eaee;
  --hierarchy-line: #9b8791;
}

.hierarchyParent[data-group-tone='4'],
.hierarchyChild[data-group-tone='4'] {
  --hierarchy-surface: #eaf0f3;
  --hierarchy-line: #82939d;
}

.hierarchyParent[data-group-tone='5'],
.hierarchyChild[data-group-tone='5'] {
  --hierarchy-surface: #f2ece7;
  --hierarchy-line: #9f8c80;
}
"""


def patch_css() -> None:
    week_addition = HIERARCHY_TONES + """
.hierarchyParent,
.hierarchyChild {
  border-color: color-mix(in srgb, var(--hierarchy-line) 55%, var(--border-soft));
  background: color-mix(in srgb, var(--hierarchy-surface) 58%, var(--surface));
}

.hierarchyChild {
  margin-left: 10px;
  border-left: 4px solid var(--hierarchy-line);
}

.hierarchyParent :where(.itemMeta, .itemTime, .itemContext, .itemCategory),
.hierarchyChild :where(.itemMeta, .itemTime, .itemContext, .itemCategory) {
  color: var(--text);
}

.childCountBadge {
  display: inline-flex;
  width: fit-content;
  margin-top: 5px;
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--hierarchy-line) 60%, transparent);
  border-radius: 999px;
  color: var(--heading);
  font-size: 10px;
  font-weight: 800;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}
"""
    today_addition = HIERARCHY_TONES + """
.hierarchyParent .timelineContent,
.hierarchyChild .timelineContent {
  border-radius: 10px;
  background: color-mix(in srgb, var(--hierarchy-surface) 50%, transparent);
}

.hierarchyChild .timelineContent {
  margin-left: 12px;
  padding-left: 12px;
  border-left: 4px solid var(--hierarchy-line);
}

.hierarchyParent :where(.itemType, .itemContext, .itemCategory),
.hierarchyChild :where(.itemType, .itemContext, .itemCategory) {
  color: var(--text);
}

.childCountBadge {
  display: inline-flex;
  width: fit-content;
  margin-top: 5px;
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--hierarchy-line) 60%, transparent);
  border-radius: 999px;
  color: var(--heading);
  font-size: 10px;
  font-weight: 800;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}
"""
    calendar_addition = HIERARCHY_TONES + """
.hierarchyParent,
.hierarchyChild {
  border-color: color-mix(in srgb, var(--hierarchy-line) 55%, var(--border-soft));
  background: color-mix(in srgb, var(--hierarchy-surface) 58%, var(--surface));
}

.hierarchyChild {
  box-shadow: inset 3px 0 0 var(--hierarchy-line);
}


.hierarchyParent :where(.itemMeta, .itemContext, .itemCategory),
.hierarchyChild :where(.itemMeta, .itemContext, .itemCategory) {
  color: var(--text);
}
"""
    for path, addition in [
        ("src/routes/WeekRoute.module.css", week_addition),
        ("src/routes/TodayRoute.module.css", today_addition),
        ("src/routes/CalendarRoute.module.css", calendar_addition),
    ]:
        write(path, append_once(read(path), ".hierarchyParent", addition, f"{path} hierarchy styles"))


def copy_files() -> None:
    for prefix in ["payload", "replacements"]:
        for relative, content in archive_files(prefix):
            target = REPO / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)


def main() -> None:
    validate_repository()
    validate_new_files()

    tracked = [
        "src/routes/ScheduleBlockEditorRoute.tsx",
        "src/routes/ScheduleBlockEditorRoute.module.css",
        "src/routes/WeekRoute.tsx",
        "src/routes/WeekRoute.module.css",
        "src/routes/TodayRoute.tsx",
        "src/routes/TodayRoute.module.css",
        "src/routes/CalendarRoute.tsx",
        "src/routes/CalendarRoute.module.css",
    ]
    snapshot = {path: read(path) for path in tracked}

    try:
        patch_week_route()
        patch_today_route()
        patch_calendar_route()
        patch_css()
        copy_files()
    except BaseException:
        for path, text in snapshot.items():
            write(path, text)
        for relative, _ in archive_files("payload"):
            target = REPO / relative
            if target.exists():
                target.unlink()
        raise

    print("Parent–Child Visual Closure source files applied successfully.")
    print(f"Base commit: {BASE_COMMIT}")
    print("No schema, migration, exception, dist, legacy storage, or private data files were changed.")
    shutil.rmtree(PACKAGE_DIR)


if __name__ == "__main__":
    main()
