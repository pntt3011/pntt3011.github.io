const API_URL = "https://crimson-sky-e56f.thanhtung30112001.workers.dev/api";
const UNASSIGNED_GROUP_ID = "unassigned";
const CHART_EXCLUDED_GROUP_NAMES = ["Đan dây"];

async function getProductionTasks() {
  const response = await fetch(API_URL, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} - ${await response.text()}`);
  }

  return response.json();
}

async function getGroupData() {
  const response = await fetch("data.json", { headers: { accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`Failed to load data.json: ${response.status}`);
  }

  return response.json();
}

function buildStepToGroupIndex(groupData) {
  const index = {};

  for (const [groupId, group] of Object.entries(groupData)) {
    for (const stepId of Object.keys(group.steps)) {
      index[stepId] = { groupId, groupName: group.name };
    }
  }

  return index;
}

function getOutstandingQty(task) {
  const outstanding = (task.quantityPlanned || 0) - (task.quantityProduced || 0);
  return Math.max(0, outstanding);
}

// estimateTime is the time to process one batch, not one unit - batch size
// is bomWorkStep.quantity (defaults to 1, i.e. per-unit timing).
function getRequiredHours(task) {
  const estimateTime = task.bomWorkStep?.estimateTime || 0;
  const batchSize = task.bomWorkStep?.quantity || 1;
  const batches = Math.ceil(getOutstandingQty(task) / batchSize);
  return (estimateTime * batches) / 3600;
}

function toDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Task's working window as whole calendar days: [taskStart, taskEnd], both
// inclusive. taskStart is clamped to today - work whose lsd has already
// passed gets its remaining qty/hours compressed into today->lfd instead of
// diluting them back over already-elapsed days. Falls back to a single day
// at lfd when lsd is missing or not before lfd.
function getTaskWindow(task) {
  if (!task.lfd) return null;

  const today = toDayStart(new Date());
  const lfd = toDayStart(new Date(task.lfd));
  const lsd = task.lsd ? toDayStart(new Date(task.lsd)) : null;

  if (!lsd || lsd >= lfd) return { taskStart: lfd, taskEnd: lfd };

  const taskStart = lsd > today ? lsd : today;
  if (taskStart >= lfd) return { taskStart: lfd, taskEnd: lfd };
  return { taskStart, taskEnd: lfd };
}

function countOverlapDays(taskStart, taskEnd, startDate, endDate) {
  const rangeStart = toDayStart(startDate);
  const rangeEndExclusive = toDayStart(endDate); // caller passes exclusive end

  const overlapStart = taskStart > rangeStart ? taskStart : rangeStart;
  const taskEndExclusive = addDays(taskEnd, 1);
  const overlapEnd = taskEndExclusive < rangeEndExclusive ? taskEndExclusive : rangeEndExclusive;

  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.round((overlapEnd - overlapStart) / msPerDay);
  return Math.max(0, days);
}

// Spreads the task's outstanding qty/hours uniformly across its lsd->lfd
// window (inclusive), then returns the portion whose days fall inside
// [startDate, endDate) (endDate exclusive). Used to interpolate a task's
// contribution to an arbitrary day/week/range.
function calculateRequiredQty(task, startDate, endDate) {
  const window = getTaskWindow(task);
  if (!window) return 0;

  const totalDays = countOverlapDays(window.taskStart, window.taskEnd, window.taskStart, addDays(window.taskEnd, 1));
  const overlapDays = countOverlapDays(window.taskStart, window.taskEnd, startDate, endDate);
  if (totalDays === 0 || overlapDays === 0) return 0;

  const dailyRate = getOutstandingQty(task) / totalDays;
  return dailyRate * overlapDays;
}

function calculateRequiredHours(task, startDate, endDate) {
  const window = getTaskWindow(task);
  if (!window) return 0;

  const totalDays = countOverlapDays(window.taskStart, window.taskEnd, window.taskStart, addDays(window.taskEnd, 1));
  const overlapDays = countOverlapDays(window.taskStart, window.taskEnd, startDate, endDate);
  if (totalDays === 0 || overlapDays === 0) return 0;

  const dailyRate = getRequiredHours(task) / totalDays;
  return dailyRate * overlapDays;
}

// Monday-anchored ISO week. Returns { weekStart: Date (local midnight Monday), key: "YYYY-MM-DD" }.
function getWeekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Chart 1 data: weekly required hours per group, from this week through the
// week containing the latest lfd in the task list, plus a flat weekly
// capacity reference line (sum of all steps' daily capacity * 7).
function buildWeeklyGroupHours(tasks, groupData) {
  const stepToGroup = buildStepToGroupIndex(groupData);

  const chartableGroupEntries = Object.entries(groupData).filter(
    ([, g]) => !CHART_EXCLUDED_GROUP_NAMES.includes(g.name)
  );

  const groupOrder = chartableGroupEntries.map(([groupId, g]) => ({
    groupId,
    groupName: g.name,
  }));
  groupOrder.push({ groupId: UNASSIGNED_GROUP_ID, groupName: "Unassigned" });

  const weeklyCapacityByGroup = {};
  chartableGroupEntries.forEach(([groupId, group]) => {
    const dailyCapacity = Object.values(group.steps).reduce((s, step) => s + (step.capacityHour || 0), 0);
    weeklyCapacityByGroup[groupId] = dailyCapacity * 7;
  });
  weeklyCapacityByGroup[UNASSIGNED_GROUP_ID] = 0;

  const weeklyCapacity = Object.values(weeklyCapacityByGroup).reduce((sum, v) => sum + v, 0);

  const thisWeekStart = getWeekStart(new Date());

  let latestWeekStart = thisWeekStart;
  for (const task of tasks) {
    if (!task.lfd) continue;
    const weekStart = getWeekStart(new Date(task.lfd));
    if (weekStart > latestWeekStart) latestWeekStart = weekStart;
  }

  const weeks = [];
  for (let ws = thisWeekStart; ws <= latestWeekStart; ws = addDays(ws, 7)) {
    weeks.push({
      key: formatDateKey(ws),
      start: ws,
      end: addDays(ws, 6),
      byGroup: Object.fromEntries(groupOrder.map((g) => [g.groupId, 0])),
      total: 0,
    });
  }

  for (const task of tasks) {
    if (!task.lfd) continue;

    const mapping = stepToGroup[String(task.stepId)];
    if (mapping && CHART_EXCLUDED_GROUP_NAMES.includes(mapping.groupName)) continue;

    const groupId = mapping ? mapping.groupId : UNASSIGNED_GROUP_ID;

    for (const week of weeks) {
      const hours = calculateRequiredHours(task, week.start, addDays(week.end, 1));
      if (hours === 0) continue;

      week.byGroup[groupId] += hours;
      week.total += hours;
    }
  }

  return { weeks, groupOrder, weeklyCapacity, weeklyCapacityByGroup };
}

// Kanban data: current week (Mon-Sun), grouped by group -> step -> part,
// cards carry cumulative outstanding qty / total planned qty (rounded up).
function buildCurrentWeekKanban(tasks, groupData) {
  const weekStart = getWeekStart(new Date());
  const weekEnd = addDays(weekStart, 7); // exclusive upper bound

  const stepToGroup = groupData ? buildStepToGroupIndex(groupData) : {};
  const UNASSIGNED_GROUP_NAME = "Unassigned";

  const cardsByGroup = {};

  for (const task of tasks) {
    if (!task.lfd) continue;

    const qty = calculateRequiredQty(task, weekStart, weekEnd);
    if (qty === 0) continue;

    const mapping = stepToGroup[String(task.stepId)];
    const groupName = mapping ? mapping.groupName : UNASSIGNED_GROUP_NAME;
    const stepName = task.step?.name || "Unknown step";
    const partName = task.component?.name || task.metadata || "Unknown part";
    const key = `${stepName}::${partName}`;

    if (!cardsByGroup[groupName]) cardsByGroup[groupName] = {};
    if (!cardsByGroup[groupName][stepName]) cardsByGroup[groupName][stepName] = {};
    if (!cardsByGroup[groupName][stepName][key]) {
      cardsByGroup[groupName][stepName][key] = {
        stepName,
        partName,
        cumulativeQty: 0,
        totalQty: 0,
      };
    }

    const card = cardsByGroup[groupName][stepName][key];
    card.cumulativeQty += qty;
    card.totalQty += task.quantityPlanned || 0;
  }

  const groups = Object.entries(cardsByGroup).map(([groupName, stepMap]) => ({
    groupName,
    columns: Object.entries(stepMap).map(([stepName, cardMap]) => ({
      stepName,
      cards: Object.values(cardMap)
        .map((card) => ({
          ...card,
          cumulativeQty: Math.ceil(card.cumulativeQty),
          totalQty: Math.ceil(card.totalQty),
        }))
        .sort((a, b) => b.cumulativeQty - a.cumulativeQty),
    })),
  }));

  return { weekStart, weekEnd: addDays(weekStart, 6), groups };
}

// Chart 2 data: for the given week, a matrix of every step (from groupData,
// across all groups) x each of the 7 days. Each cell carries required hours
// that day, the step's daily capacity, a severity status, and the list of
// contributing tasks (for the click-through modal).
function buildStepDayMatrix(tasks, groupData, weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));

  const tasksByStepId = {};
  for (const task of tasks) {
    if (!task.lfd) continue;
    const key = String(task.stepId);
    if (!tasksByStepId[key]) tasksByStepId[key] = [];
    tasksByStepId[key].push(task);
  }

  const rows = [];
  for (const [groupId, group] of Object.entries(groupData)) {
    for (const [stepId, step] of Object.entries(group.steps)) {
      const capacity = step.capacityHour || 0;
      const stepTasks = tasksByStepId[stepId] || [];

      const cells = days.map((day) => {
        const dayEnd = addDays(day, 1);
        let required = 0;
        const contributions = [];

        for (const task of stepTasks) {
          const hours = calculateRequiredHours(task, day, dayEnd);
          if (hours === 0) continue;

          const qty = calculateRequiredQty(task, day, dayEnd);
          required += hours;
          contributions.push({
            productName: task.product?.nameVn || task.product?.nameEn || task.product?.code || "",
            orderName: task.workOrder?.name || "",
            partName: task.component?.name || task.metadata || "",
            requiredQty: qty,
            completedQty: task.quantityProduced || 0,
            totalQty: task.quantityPlanned || 0,
          });
        }

        let status;
        if (required === 0) {
          status = "no-capacity";
        } else if (capacity <= 0) {
          status = "no-capacity";
        } else if (required >= capacity * 2) {
          status = "over";
        } else if (required >= capacity) {
          status = "near";
        } else {
          status = "ok";
        }

        return { date: day, required, capacity, status, contributions };
      });

      rows.push({ groupId, groupName: group.name, stepId, stepName: step.name, capacity, cells });
    }
  }

  return { weekStart, days, rows };
}

globalThis.Api = {
  getProductionTasks,
  getGroupData,
};

globalThis.Calc = {
  getOutstandingQty,
  getRequiredHours,
  calculateRequiredQty,
  calculateRequiredHours,
  getWeekStart,
  formatDateKey,
  buildWeeklyGroupHours,
  buildCurrentWeekKanban,
  buildStepDayMatrix,
};
