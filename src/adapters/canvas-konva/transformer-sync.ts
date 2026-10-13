/**
 * Keep the full reconciliation path when selection is active or when a
 * previously attached selection must be detached.
 */
export function needsTransformerSynchronization(
  requestedTargetCount: number,
  attachedNodeCount: number,
): boolean {
  return requestedTargetCount > 0 || attachedNodeCount > 0;
}
