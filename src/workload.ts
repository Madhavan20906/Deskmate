export type WorkloadTask = {
  id: string;
  estimatedMinutes: number;
  scheduledStartMinute: number | null;
  status: string;
};

export type WorkloadOverlap = {
  taskIds: string[];
  startMinute: number;
  endMinute: number;
};

export type WorkloadAnalysis = {
  totalEstimatedMinutes: number;
  scheduledMinutes: number;
  availableWorkingMinutes: number;
  remainingCapacityMinutes: number;
  overloadMinutes: number;
  completedMinutes: number;
  pendingMinutes: number;
  utilization: number;
  balance: 'underloaded' | 'balanced' | 'overloaded';
  overlaps: WorkloadOverlap[];
  overloadReasons: string[];
};

function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function analyzeWorkload(
  tasks: WorkloadTask[],
  workloadCapacityMinutes: number,
  workdayStartMinute: number,
  workdayEndMinute: number,
): WorkloadAnalysis {
  const availableWorkingMinutes = Math.max(
    0,
    Number.isFinite(workloadCapacityMinutes) ? Math.floor(workloadCapacityMinutes) : 0,
  );
  const validWorkday =
    Number.isFinite(workdayStartMinute) &&
    Number.isFinite(workdayEndMinute) &&
    workdayEndMinute > workdayStartMinute;
  const validTasks = tasks.filter(
    (task) =>
      task !== null &&
      task !== undefined &&
      typeof task.id === 'string' &&
      Number.isSafeInteger(task.estimatedMinutes) &&
      task.estimatedMinutes > 0,
  );
  const totalEstimatedMinutes = validTasks.reduce(
    (total, task) => Math.min(Number.MAX_SAFE_INTEGER, total + task.estimatedMinutes),
    0,
  );
  const completedMinutes = validTasks.reduce(
    (total, task) =>
      Math.min(
        Number.MAX_SAFE_INTEGER,
        total + (task.status === 'completed' ? task.estimatedMinutes : 0),
      ),
    0,
  );
  const pendingMinutes = validTasks.reduce(
    (total, task) =>
      Math.min(
        Number.MAX_SAFE_INTEGER,
        total + (task.status !== 'completed' ? task.estimatedMinutes : 0),
      ),
    0,
  );
  const scheduledTasks = validTasks.filter(
    (task) =>
      typeof task.scheduledStartMinute === 'number' &&
      Number.isSafeInteger(task.scheduledStartMinute) &&
      validWorkday &&
      task.scheduledStartMinute >= workdayStartMinute &&
      task.scheduledStartMinute < workdayEndMinute &&
      Number.isSafeInteger(task.scheduledStartMinute + task.estimatedMinutes) &&
      task.scheduledStartMinute + task.estimatedMinutes <= workdayEndMinute,
  );
  const scheduledMinutes = scheduledTasks.reduce(
    (total, task) => Math.min(Number.MAX_SAFE_INTEGER, total + task.estimatedMinutes),
    0,
  );
  const utilization = availableWorkingMinutes === 0
    ? 0
    : scheduledMinutes / availableWorkingMinutes;
  const overlaps: WorkloadOverlap[] = [];

  for (let firstIndex = 0; firstIndex < scheduledTasks.length; firstIndex += 1) {
    const first = scheduledTasks[firstIndex];
    const firstStart = first.scheduledStartMinute as number;
    const firstEnd = firstStart + first.estimatedMinutes;
    for (let secondIndex = firstIndex + 1; secondIndex < scheduledTasks.length; secondIndex += 1) {
      const second = scheduledTasks[secondIndex];
      const secondStart = second.scheduledStartMinute as number;
      const secondEnd = secondStart + second.estimatedMinutes;
      const overlapStart = Math.max(firstStart, secondStart);
      const overlapEnd = Math.min(firstEnd, secondEnd);
      if (overlapStart < overlapEnd) {
        overlaps.push({
          taskIds: [first.id, second.id],
          startMinute: overlapStart,
          endMinute: overlapEnd,
        });
      }
    }
  }

  const overloadReasons: string[] = [];
  const overloadMinutes = Math.max(0, scheduledMinutes - availableWorkingMinutes);
  if (overloadMinutes > 0) {
    overloadReasons.push(
      `Scheduled work exceeds daily capacity by ${overloadMinutes} minutes.`,
    );
  }
  if (overlaps.length > 0) {
    for (const overlap of overlaps) {
      overloadReasons.push(
        `Tasks ${overlap.taskIds.join(' and ')} overlap from ${formatMinuteOfDay(overlap.startMinute)} to ${formatMinuteOfDay(overlap.endMinute)}.`,
      );
    }
  }

  return {
    totalEstimatedMinutes,
    scheduledMinutes,
    availableWorkingMinutes,
    remainingCapacityMinutes: Math.max(0, availableWorkingMinutes - scheduledMinutes),
    overloadMinutes,
    completedMinutes,
    pendingMinutes,
    utilization,
    balance: utilization > 1 || overlaps.length > 0
      ? 'overloaded'
      : utilization >= 0.7
        ? 'balanced'
        : 'underloaded',
    overlaps,
    overloadReasons,
  };
}