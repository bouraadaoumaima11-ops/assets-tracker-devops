export interface AnalysisRange<T extends { date: string }> {
  filteredSnapshots: T[];
  rangeStart: Date;
  rangeEnd: Date;
  rangeStartIso: string;
}

export function resolveAnalysisRange<T extends { date: string }>(
  snapshots: T[],
  months: number,
  now = new Date(),
): AnalysisRange<T> {
  const year = now.getFullYear();
  const month = now.getMonth();
  const rangeEnd = new Date(Date.UTC(year, month, 1));

  if (months === 0) {
    const rangeStart = new Date(Date.UTC(year, 0, 1));
    const rangeStartIso = `${year}-01-01`;
    return {
      filteredSnapshots: snapshots.filter((snapshot) => snapshot.date >= rangeStartIso),
      rangeStart,
      rangeEnd,
      rangeStartIso,
    };
  }

  if (months === Infinity) {
    const firstDate = snapshots.length > 0 ? new Date(snapshots[0].date) : now;
    const rangeStart =
      snapshots.length > 0
        ? new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1))
        : rangeEnd;
    return {
      filteredSnapshots: snapshots,
      rangeStart,
      rangeEnd,
      rangeStartIso: snapshots.length > 0 ? snapshots[0].date : "1970-01-01",
    };
  }

  // Keep the user's current calendar month, but construct the date-only
  // boundary at UTC midnight so serializing it cannot roll back a day/month.
  const rangeStart = new Date(Date.UTC(year, month - months, 1));
  const rangeStartIso = rangeStart.toISOString().slice(0, 10);
  return {
    filteredSnapshots: snapshots.filter((snapshot) => snapshot.date >= rangeStartIso),
    rangeStart,
    rangeEnd,
    rangeStartIso,
  };
}
