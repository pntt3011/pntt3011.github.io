import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.106.1/+esm";

const config = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = config.url || "";
const SUPABASE_ANON_KEY = config.anonKey || "";
const DEFAULT_START_DATE = config.startDate || new Date().toISOString().split("T")[0];

const elements = {};

const state = {
    supabase: null,
    students: [],
    tasks: [],
    completions: new Map(),
    student: null,
    accessMode: "editable",
    selectedDate: null,
    visibleStartDate: null,
    dateKeys: [],
    pendingTaskIds: new Set(),
};

const taskOrder = {
    daily: { start_shift: 0, random_between: 1, end_shift: 2 },
    weekly: { random_between: 3 },
    monthly: { random_between: 4 },
};

const todayKey = formatDateKey(startOfLocalDay(new Date()));

boot();

async function boot() {
    cacheElements();
    bindEvents();
    state.visibleStartDate = normalizeStartDate(DEFAULT_START_DATE);
    state.dateKeys = buildDateRange(state.visibleStartDate, startOfLocalDay(new Date())).map(formatDateKey);
    // set initial selected date and default filters (month/year of the latest date)
    state.selectedDate = state.dateKeys[state.dateKeys.length - 1] || todayKey;
    const last = parseDateKey(state.selectedDate || todayKey);
    state.filterMonth = last.getMonth() + 1;
    state.filterYear = last.getFullYear();
    populateMonthYearSelectors();
    renderDateRail();
    await initialize();
}

function populateMonthYearSelectors() {
    if (!elements.monthSelect || !elements.yearSelect) return;
    const months = new Set();
    const years = new Set();
    for (const key of state.dateKeys) {
        const d = parseDateKey(key);
        months.add(d.getMonth() + 1);
        years.add(d.getFullYear());
    }
    const monthArr = Array.from(months).sort((a, b) => a - b);
    const yearArr = Array.from(years).sort((a, b) => a - b);

    elements.monthSelect.innerHTML = monthArr
        .map((m) => `<option value="${m}" ${m === state.filterMonth ? 'selected' : ''}>${String(m).padStart(2, '0')}</option>`)
        .join("");
    elements.yearSelect.innerHTML = yearArr
        .map((y) => `<option value="${y}" ${y === state.filterYear ? 'selected' : ''}>${y}</option>`)
        .join("");
}

function cacheElements() {
    elements.studentSelect = document.getElementById("studentSelect");
    elements.dateList = document.getElementById("dateList");
    elements.monthSelect = document.getElementById("monthSelect");
    elements.yearSelect = document.getElementById("yearSelect");
    elements.datePill = document.getElementById("datePill");
    elements.taskList = document.getElementById("taskList");
    elements.dateButtonTemplate = document.getElementById("dateButtonTemplate");
    elements.taskRowTemplate = document.getElementById("taskRowTemplate");
}

function bindEvents() {
    elements.studentSelect.addEventListener("change", (event) => {
        const studentId = event.target.value;
        if (!studentId) return;
        setTokenAndReload(studentId);
    });

    if (elements.monthSelect) {
        elements.monthSelect.addEventListener("change", (e) => {
            state.filterMonth = e.target.value ? Number(e.target.value) : null;
            renderDateRail();
        });
    }

    if (elements.yearSelect) {
        elements.yearSelect.addEventListener("change", (e) => {
            state.filterYear = e.target.value ? Number(e.target.value) : null;
            renderDateRail();
        });
    }
}

async function initialize() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        elements.taskList.innerHTML = emptyStateMarkup(
            "Configuration required",
            "The page is ready, but the public Supabase key is blank."
        );
        renderDateRail();
        renderStudentSelect();
        renderTaskWorkspace();
        return;
    }

    state.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    try {
        await loadStudents();
    } catch (error) {
        console.error(error);
        elements.taskList.innerHTML = emptyStateMarkup(
            "Unable to load data",
            "Check the Supabase URL, public key, and table permissions."
        );
    }
}

async function loadStudents() {
    const { data, error } = await state.supabase
        .from("students")
        .select("id, name")
        .order("name", { ascending: true });

    if (error) throw error;

    state.students = data || [];
    renderStudentSelect();

    if (!state.students.length) {
        elements.taskList.innerHTML = emptyStateMarkup(
            "No student records",
            "Add at least one row to the students table."
        );
        return;
    }

    const token = getTokenFromUrl();
    if (!token) {
        const previewStudent = state.students[0];
        await loadStudentWorkspace(previewStudent, {
            accessMode: "readonly",
        });
        return;
    }

    const student = state.students.find((item) => item.id === token) || null;
    if (!student) {
        const previewStudent = state.students[0];
        await loadStudentWorkspace(previewStudent, {
            accessMode: "readonly",
        });
        return;
    }

    await loadStudentWorkspace(student, {
        accessMode: "editable",
    });
}

function renderStudentSelect(selectedId = getTokenFromUrl()) {
    const options = state.students.map((student) => {
        const selected = student.id === selectedId ? "selected" : "";
        return `<option value="${escapeHtml(student.id)}" ${selected}>${escapeHtml(student.name)}</option>`;
    });

    elements.studentSelect.innerHTML = options.join("");
}

async function loadStudentWorkspace(student, options = {}) {
    state.student = student;
    state.accessMode = options.accessMode || "editable";
    state.completions = new Map();
    state.pendingTaskIds.clear();
    const eyebrow = document.getElementById("eyebrowStudent");
    if (eyebrow) eyebrow.textContent = student.name;

    const { data, error } = await state.supabase
        .from("tasks")
        .select("id, student_id, name, repeat_type, time_type, is_active")
        .eq("student_id", student.id);

    if (error) throw error;

    state.tasks = data || [];
    await loadCompletions();
    renderStudentSelect(student.id);
    renderTaskWorkspace();
}

async function loadCompletions() {
    const taskIds = state.tasks.map((task) => task.id);
    if (!taskIds.length) return;

    const startDate = formatDateKey(state.visibleStartDate);
    const endDate = addDaysToKey(todayKey, 1);
    const { data, error } = await state.supabase
        .from("task_completions")
        .select("task_id, finished_at")
        .in("task_id", taskIds)
        .gte("finished_at", `${startDate}T00:00:00.000Z`)
        .lt("finished_at", `${endDate}T00:00:00.000Z`)
        .order("finished_at", { ascending: true });

    if (error) throw error;

    state.completions = new Map();
    for (const row of data || []) {
        const dateKey = formatDateKey(new Date(row.finished_at));
        if (!state.completions.has(row.task_id)) {
            state.completions.set(row.task_id, new Map());
        }
        state.completions.get(row.task_id).set(dateKey, row.finished_at);
    }
}

function renderDateRail() {
    elements.dateList.innerHTML = "";
    const keys = state.dateKeys.filter((key) => {
        if (!state.filterMonth && !state.filterYear) return true;
        const d = parseDateKey(key);
        if (state.filterMonth && d.getMonth() + 1 !== state.filterMonth) return false;
        if (state.filterYear && d.getFullYear() !== state.filterYear) return false;
        return true;
    });

    for (const key of keys) {
        const date = parseDateKey(key);
        const fragment = elements.dateButtonTemplate.content.cloneNode(true);
        const button = fragment.querySelector("button");
        button.classList.toggle("is-active", key === state.selectedDate);
        fragment.querySelector(".date-chip__day").textContent = formatLongDate(date);
        button.addEventListener("click", () => {
            state.selectedDate = key;
            renderDateRail();
            renderTaskWorkspace();
        });
        elements.dateList.appendChild(fragment);
    }

    if (!keys.length) {
        elements.dateList.innerHTML = emptyStateMarkup(
            "No dates yet",
            "No dates match the selected month/year."
        );
    }
}

function renderTaskWorkspace() {
    elements.datePill.textContent = prettyDateKey(state.selectedDate);

    if (!state.student) {
        elements.taskList.innerHTML = emptyStateMarkup(
            "Pick a token",
            "Choose a student from the dropdown or add ?token=<student-id> to the URL."
        );
        return;
    }

    const tasks = getDisplayTasks();
    const activeCount = tasks.filter((task) => task.is_active).length;
    // taskScopePill removed; no status pill shown here

    if (!tasks.length) {
        elements.taskList.innerHTML = emptyStateMarkup(
            "No tasks available",
            "This student does not have any linked tasks yet."
        );
        return;
    }

    const selectedDayIsToday = state.selectedDate === todayKey;
    elements.taskList.innerHTML = "";
    for (const task of tasks) {
        elements.taskList.appendChild(renderTaskRow(task, selectedDayIsToday));
    }

    // subtitle removed — no UI update required here
}

function getDisplayTasks() {
    const activeTasks = state.tasks.filter((task) => task.is_active);
    const source = activeTasks.length > 0 ? activeTasks : state.tasks.slice();
    return source.sort(compareTasks);
}

function renderTaskRow(task, selectedDayIsToday) {
    const fragment = elements.taskRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".task-row");
    const checkbox = fragment.querySelector("input[type=checkbox]");
    const title = fragment.querySelector("h3");
    const badge = fragment.querySelector(".task-badge");
    const timeLabel = fragment.querySelector(".task-time-label");
    const finishedAt = fragment.querySelector(".task-finished-at");

    const completedAt = getCompletionTime(task.id, state.selectedDate);
    const isCompleted = Boolean(completedAt);
    const isPending = state.pendingTaskIds.has(task.id);
    const isReadOnly = state.accessMode === "readonly";
    const isCheckable = selectedDayIsToday && !isCompleted && !isPending && !isReadOnly;

    row.classList.toggle("is-complete", isCompleted);
    row.classList.toggle("is-pending", isPending);
    row.classList.toggle("is-disabled", !isCheckable);

    title.textContent = task.name;
    badge.textContent = `${capitalize(task.repeat_type)} · ${formatTimeType(task.time_type)}`;
    timeLabel.textContent = isCompleted ? "Completed" : selectedDayIsToday ? "Ready to complete" : "History only";
    finishedAt.textContent = completedAt ? formatFinishedAt(completedAt) : selectedDayIsToday ? "" : "No completion recorded";

    checkbox.checked = isCompleted;
    checkbox.disabled = !isCheckable;
    checkbox.addEventListener("change", async (event) => {
        if (!event.target.checked || isCompleted || !selectedDayIsToday || isReadOnly) {
            event.target.checked = isCompleted;
            return;
        }
        await completeTask(task);
    });

    return fragment;
}

async function completeTask(task) {
    if (!state.student || task.student_id !== state.student.id || !state.supabase) return;

    state.pendingTaskIds.add(task.id);
    renderTaskWorkspace();

    const { error } = await state.supabase.from("task_completions").insert({ task_id: task.id });
    state.pendingTaskIds.delete(task.id);

    if (error) {
        console.error(error);
        await loadCompletions();
        renderTaskWorkspace();
        return;
    }

    await loadCompletions();
    renderTaskWorkspace();
}

function getCompletionTime(taskId, dateKey) {
    return state.completions.get(taskId)?.get(dateKey) || null;
}

function compareTasks(left, right) {
    const leftRank = getTaskSortKey(left);
    const rightRank = getTaskSortKey(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
}

function getTaskSortKey(task) {
    return taskOrder[task.repeat_type]?.[task.time_type] ?? 99;
}

function getTokenFromUrl() {
    return new URLSearchParams(window.location.search).get("token")?.trim() || "";
}

function setTokenAndReload(token) {
    const params = new URLSearchParams(window.location.search);
    params.set("token", token);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    initialize();
}

function buildDateRange(startDate, endDate) {
    const dates = [];
    if (!startDate || !endDate) return dates;
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
        dates.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

function normalizeStartDate(isoDate) {
    const candidate = parseDateKey(isoDate);
    const today = startOfLocalDay(new Date());
    return candidate > today ? today : candidate;
}

function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatDateKey(date) {
    const normalized = startOfLocalDay(date);
    const year = normalized.getFullYear();
    const month = String(normalized.getMonth() + 1).padStart(2, "0");
    const day = String(normalized.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDaysToKey(key, amount) {
    const date = parseDateKey(key);
    date.setDate(date.getDate() + amount);
    return formatDateKey(date);
}

function prettyDateKey(key) {
    return formatLongDate(parseDateKey(key));
}

function formatLongDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatFinishedAt(value) {
    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

function formatTimeType(value) {
    return value.split("_").map(capitalize).join(" ");
}

function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function emptyStateMarkup(title, message) {
    return `
        <div class="empty-state">
            <div class="empty-state__icon" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 6h16"></path>
                    <path d="M4 12h16"></path>
                    <path d="M4 18h10"></path>
                </svg>
            </div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}