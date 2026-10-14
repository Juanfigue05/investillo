export interface PaymentLineBalance {
  lineId: number;
  remaining: number;
}

export interface PaymentLineAllocation {
  lineId: number;
  value: number;
}

export function calculatePaymentAllocations(
  amount: number,
  selectedLineIds: number[],
  balances: PaymentLineBalance[],
): PaymentLineAllocation[] {
  let unallocated = amount;
  const balanceById = new Map(balances.map((line) => [line.lineId, line.remaining]));
  const allocations: PaymentLineAllocation[] = [];

  for (const [index, lineId] of selectedLineIds.entries()) {
    const remaining = balanceById.get(lineId) ?? 0;
    const value = Math.min(remaining, unallocated);
    if (value < remaining - 0.01 && index < selectedLineIds.length - 1) return [];
    if (value > 0) allocations.push({ lineId, value });
    unallocated -= value;
    if (unallocated <= 0.01) break;
  }

  return allocations;
}

export function orderAllocationsByCreditLines<T extends { lineaId: number }>(
  allocations: T[],
  creditLineIds: number[],
): T[] {
  const position = new Map(creditLineIds.map((lineId, index) => [lineId, index]));
  return [...allocations].sort(
    (left, right) => (position.get(left.lineaId) ?? Number.MAX_SAFE_INTEGER) - (position.get(right.lineaId) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function getMaximumPayment(creditTotal: number, creditPaid: number, editedPayment = 0): number {
  return Math.max(0, creditTotal - creditPaid + editedPayment);
}

export function readDailyIvaPreference(storage: { getItem: (key: string) => string | null }): boolean {
  try {
    const profile = storage.getItem("investillo-perfil") || "administrador";
    const preferences = JSON.parse(storage.getItem(`investillo-preferencias-${profile}`) || "null");
    return preferences?.incluirIvaVentasDiarias === true;
  } catch {
    return false;
  }
}