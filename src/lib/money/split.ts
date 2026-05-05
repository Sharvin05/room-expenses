export type ShareMap = Map<string, number>;

export function splitShares(amount: number, participantIds: readonly string[]): ShareMap {
  const result: ShareMap = new Map();
  const n = participantIds.length;
  if (n === 0) return result;
  const base = Math.floor(amount / n);
  const remainder = amount - base * n;
  participantIds.forEach((id, i) => {
    result.set(id, base + (i < remainder ? 1 : 0));
  });
  return result;
}

export type ExpenseLite = {
  amount: number;
  payerId: string;
  participantIds: readonly string[];
};

export type UserAggregate = {
  spent: number;
  share: number;
  net: number;
};

export function aggregateForUser(userId: string, expenses: readonly ExpenseLite[]): UserAggregate {
  let spent = 0;
  let share = 0;
  for (const e of expenses) {
    if (e.payerId === userId) spent += e.amount;
    if (e.participantIds.includes(userId)) {
      const shares = splitShares(e.amount, e.participantIds);
      share += shares.get(userId) ?? 0;
    }
  }
  return { spent, share, net: spent - share };
}
