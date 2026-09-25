export type MilestoneProgressStatus = "pending" | "completed";

export type MilestoneProgress = {
  completed: number;
  total: number;
  percent: number | null;
};

/**
 * Milestones are the only progress source.
 * Zero milestones returns a null percent so the UI does not invent 0% or 100%.
 */
export function deriveMilestoneProgress(
  statuses: readonly MilestoneProgressStatus[],
): MilestoneProgress {
  const total = statuses.length;
  if (total === 0) {
    return { completed: 0, total: 0, percent: null };
  }

  const completed = statuses.filter((status) => status === "completed").length;
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
  };
}

export function formatMilestoneProgress(progress: MilestoneProgress): string {
  if (progress.percent === null) {
    return "No milestones";
  }
  return `${progress.completed}/${progress.total} complete (${progress.percent}%)`;
}
