import type { ScheduleBlock } from '@/domain/models/entities';

const GROUP_TONE_COUNT = 6;

export interface ScheduleBlockHierarchyMetadata {
  blockId: string;
  parentId?: string;
  parentTitle?: string;
  parentUnavailable: boolean;
  directChildCount: number;
  depth: number;
  visualDepth: 0 | 1;
  rootId: string;
  groupTone: number;
}

export interface ScheduleBlockHierarchyEntry extends ScheduleBlockHierarchyMetadata {
  block: ScheduleBlock;
}

export function compareScheduleBlocks(first: ScheduleBlock, second: ScheduleBlock): number {
  if (first.sortOrder !== second.sortOrder) return first.sortOrder - second.sortOrder;
  if (first.startMinute !== second.startMinute) return first.startMinute - second.startMinute;
  const titleComparison = first.title.localeCompare(second.title);
  if (titleComparison !== 0) return titleComparison;
  return first.id.localeCompare(second.id);
}

function stableGroupTone(rootId: string): number {
  let hash = 0;
  for (const character of rootId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % GROUP_TONE_COUNT;
}

function activeScheduleBlocks(blocks: readonly ScheduleBlock[]): ScheduleBlock[] {
  return blocks.filter((block) => !block.archivedAt);
}

export function getScheduleBlockDescendantIds(
  blocks: readonly ScheduleBlock[],
  blockId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const block of activeScheduleBlocks(blocks)) {
    if (!block.parentId || (block.id === blockId && block.parentId === blockId)) continue;
    const children = childrenByParent.get(block.parentId) ?? [];
    children.push(block.id);
    childrenByParent.set(block.parentId, children);
  }

  const descendants = new Set<string>();
  const queue = [...(childrenByParent.get(blockId) ?? [])];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (descendants.has(currentId) || currentId === blockId) continue;
    descendants.add(currentId);
    queue.push(...(childrenByParent.get(currentId) ?? []));
  }
  return descendants;
}

export function buildScheduleBlockHierarchy(
  blocks: readonly ScheduleBlock[],
): ScheduleBlockHierarchyEntry[] {
  const activeBlocks = activeScheduleBlocks(blocks);
  const blockById = new Map(activeBlocks.map((block) => [block.id, block]));
  const childrenByParent = new Map<string, ScheduleBlock[]>();

  for (const block of activeBlocks) {
    if (!block.parentId || block.parentId === block.id || !blockById.has(block.parentId)) continue;
    const children = childrenByParent.get(block.parentId) ?? [];
    children.push(block);
    childrenByParent.set(block.parentId, children);
  }
  for (const children of childrenByParent.values()) children.sort(compareScheduleBlocks);

  const roots = activeBlocks
    .filter(
      (block) => !block.parentId || block.parentId === block.id || !blockById.has(block.parentId),
    )
    .sort(compareScheduleBlocks);

  const entries: ScheduleBlockHierarchyEntry[] = [];
  const visited = new Set<string>();

  const visit = (block: ScheduleBlock, rootId: string, depth: number): void => {
    if (visited.has(block.id)) return;
    visited.add(block.id);

    const parent =
      block.parentId && block.parentId !== block.id ? blockById.get(block.parentId) : undefined;
    const parentUnavailable = Boolean(block.parentId && block.parentId !== block.id && !parent);
    const directChildCount = childrenByParent.get(block.id)?.length ?? 0;
    entries.push({
      block,
      blockId: block.id,
      parentId: block.parentId,
      parentTitle: parent?.title,
      parentUnavailable,
      directChildCount,
      depth,
      visualDepth: parent || parentUnavailable ? 1 : 0,
      rootId,
      groupTone: stableGroupTone(rootId),
    });

    for (const child of childrenByParent.get(block.id) ?? []) {
      visit(child, rootId, depth + 1);
    }
  };

  for (const root of roots) visit(root, root.id, 0);

  // Invalid legacy graphs should remain visible instead of disappearing.
  for (const leftover of activeBlocks.slice().sort(compareScheduleBlocks)) {
    if (!visited.has(leftover.id)) visit(leftover, leftover.id, 0);
  }

  return entries;
}

export function buildScheduleBlockHierarchyMetadata(
  blocks: readonly ScheduleBlock[],
): ReadonlyMap<string, ScheduleBlockHierarchyMetadata> {
  return new Map(buildScheduleBlockHierarchy(blocks).map((entry) => [entry.blockId, entry]));
}
