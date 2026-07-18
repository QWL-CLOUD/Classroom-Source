import type { ScheduleBlock } from '@/domain/models/entities';

export function assertValidScheduleBlockParent(
  blocks: readonly ScheduleBlock[],
  blockId: string,
  parentId: string | undefined,
): void {
  if (!parentId) return;
  if (parentId === blockId) throw new Error('A schedule block cannot be its own parent.');

  const activeBlocks = new Map(
    blocks.filter((block) => !block.archivedAt).map((block) => [block.id, block]),
  );
  if (!activeBlocks.has(parentId)) throw new Error('The selected parent is no longer available.');

  const visited = new Set<string>([blockId]);
  let currentId: string | undefined = parentId;

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error('This parent relationship would create a schedule cycle.');
    }
    visited.add(currentId);
    currentId = activeBlocks.get(currentId)?.parentId;
  }
}

export function assertScheduleBlockCanBeArchived(
  blocks: readonly ScheduleBlock[],
  blockId: string,
): void {
  const hasActiveChild = blocks.some(
    (block) => !block.archivedAt && block.parentId === blockId && block.id !== blockId,
  );
  if (hasActiveChild) {
    throw new Error('Reassign or archive this block’s child blocks first.');
  }
}
