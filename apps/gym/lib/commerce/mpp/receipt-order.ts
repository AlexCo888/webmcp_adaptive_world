/**
 * The core MPP receipt makes externalId optional. Tempo 0.9.x receipts omit it,
 * so the already-verified challenge remains the order binding. If a provider
 * does echo externalId, it must still match exactly.
 */
export function receiptMatchesOrderReference(
  externalId: string | undefined,
  expectedOrderRef: string,
): boolean {
  return externalId === undefined || externalId === expectedOrderRef;
}
