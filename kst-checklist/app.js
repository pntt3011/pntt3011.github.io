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
    completionRange: {
        startDate: null,
        endDate: null,
    },
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
    state.dateKeys = buildDateRange(state.visibleStartDate, startOfLocalDay(new Date())).map(formatDateKey).reverse();
    // set initial selected date and default filters (month/year of the newest date)
    state.selectedDate = state.dateKeys[0] || todayKey;
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
    elements.taskList = document.getElementById("taskList");
    elements.dateButtonTemplate = document.getElementById("dateButtonTemplate");
    elements.taskRowTemplate = document.getElementById("taskRowTemplate");
}

function bindEvents() {
    elements.studentSelect.addEventListener("change", (event) => {
        const studentId = event.target.value;
        if (!studentId) return;
        setViewAndReload(studentId);
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
            "Cần cấu hình",
            "Trang đã sẵn sàng, nhưng khóa Supabase công khai đang trống."
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
            "Không thể tải dữ liệu",
            "Kiểm tra URL Supabase, khóa công khai và quyền truy cập bảng."
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
            "Không có bản ghi học viên",
            "Thêm ít nhất một hàng vào bảng students."
        );
        return;
    }

    const token = getTokenFromUrl();
    const view = getViewFromUrl();
    if (token && !view) {
        setViewAndReload(token);
        return;
    }

    const viewedStudentId = view || token;
    if (!viewedStudentId) {
        const previewStudent = state.students[0];
        setViewAndReload(previewStudent.id);
        return;
    }

    const student = state.students.find((item) => item.id === viewedStudentId) || null;
    if (!student) {
        const previewStudent = state.students[0];
        await loadStudentWorkspace(previewStudent, {
            accessMode: "readonly",
        });
        return;
    }

    const accessMode = view && view === token ? "editable" : "readonly";

    await loadStudentWorkspace(student, {
        accessMode,
    });
}

function renderStudentSelect(selectedId = getViewFromUrl() || getTokenFromUrl()) {
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
    state.completionRange = {
        startDate: null,
        endDate: null,
    };
    state.pendingTaskIds.clear();

    const { data, error } = await state.supabase
        .from("tasks")
        .select("id, student_id, name, repeat_type, time_type, is_active")
        .eq("student_id", student.id);

    if (error) throw error;

    state.tasks = data || [];
    await loadCompletionsForDateRange(initialCompletionStartDate(), todayKey);
    renderStudentSelect(student.id);
    renderTaskWorkspace();
}

async function loadCompletionsForDateRange(startDateKey, endDateKey) {
    const taskIds = state.tasks.map((task) => task.id);
    if (!taskIds.length) return;

    const startDate = formatDateKey(parseDateKey(startDateKey));
    const endDate = addDaysToKey(formatDateKey(parseDateKey(endDateKey)), 1);
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

    state.completionRange.startDate = startDate;
    state.completionRange.endDate = endDateKey;
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
        button.addEventListener("click", async () => {
            state.selectedDate = key;
            if (!isSelectedDateWithinCompletionCache(key)) {
                await ensureCompletionsForSelectedDate(key);
            }
            renderDateRail();
            renderTaskWorkspace();
        });
        elements.dateList.appendChild(fragment);
    }

    if (!keys.length) {
        elements.dateList.innerHTML = emptyStateMarkup(
            "Chưa có ngày nào",
            "Không có ngày phù hợp với tháng/năm đã chọn."
        );
    }
}

function renderTaskWorkspace() {
    if (!state.student) {
        elements.taskList.innerHTML = emptyStateMarkup(
            "Chọn token",
            "Chọn học viên từ danh sách hoặc thêm ?token=<student-id> vào URL."
        );
        return;
    }

    const tasks = getDisplayTasks();
    const activeCount = tasks.filter((task) => task.is_active).length;
    // taskScopePill removed; no status pill shown here

    if (!tasks.length) {
        elements.taskList.innerHTML = emptyStateMarkup(
            "Không có nhiệm vụ",
            ""
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
    const finishedAt = fragment.querySelector(".task-finished-at");

    const completedAt = getCompletionTime(task, state.selectedDate);
    const isCompleted = Boolean(completedAt);
    const isPending = state.pendingTaskIds.has(task.id);
    const isReadOnly = state.accessMode === "readonly";
    // allow the checkbox to be clickable for read-only users so we can show a login prompt;
    // still prevent interaction when the task is already completed or pending
    const isCheckable = !isCompleted && !isPending;

    row.classList.toggle("is-complete", isCompleted);
    row.classList.toggle("is-pending", isPending);
    row.classList.toggle("is-disabled", !isCheckable);

    title.textContent = task.name;
    const repeat = String(task.repeat_type || '').toLowerCase();
    const repeatMap = { daily: 'Hàng ngày', weekly: 'Hàng tuần', monthly: 'Hàng tháng' };
    const dailyTimeMap = { start_shift: 'Đầu ca', random_between: 'Giữa ca', end_shift: 'Cuối ca' };
    if (repeat === 'daily') {
        const tt = String(task.time_type || '').toLowerCase();
        badge.textContent = dailyTimeMap[tt] || repeatMap.daily + (task.time_type ? ` · ${formatTimeType(task.time_type)}` : '');
    } else if (repeat === 'weekly' || repeat === 'monthly') {
        badge.textContent = repeatMap[repeat] || capitalize(task.repeat_type);
    } else {
        badge.textContent = (repeatMap[repeat] || capitalize(task.repeat_type)) + (task.time_type ? ` · ${formatTimeType(task.time_type)}` : '');
    }
    finishedAt.textContent = completedAt ? formatCompletionLabel(task, completedAt) : "";

    checkbox.checked = isCompleted;
    checkbox.disabled = !isCheckable;
    checkbox.addEventListener("change", async (event) => {
        // unchecking always reverts to the completion state
        if (!event.target.checked) {
            event.target.checked = isCompleted;
            return;
        }

        // read-only users see a prompt to sign in when attempting to complete
        if (isReadOnly) {
            event.target.checked = isCompleted;
            window.alert("Cần đăng nhập để hoàn thành công việc");
            return;
        }

        if (isCompleted || isPending) {
            event.target.checked = isCompleted;
            return;
        }

        if (!selectedDayIsToday) {
            event.target.checked = false;
            window.alert("Không thể hoàn thành công việc trong quá khứ");
            return;
        }

        await completeTask(task);
    });

    return fragment;
}

async function completeTask(task) {
    if (!state.student || task.student_id !== state.student.id || !state.supabase) return;

    const completedAt = new Date().toISOString();
    const previousCompletions = cloneCompletions(state.completions);

    applyOptimisticCompletion(task.id, todayKey, completedAt);
    renderTaskWorkspace();

    // use the current timestamp for finished_at because checking is only allowed for today
    const now = new Date();
    const finishedAtIso = now.toISOString();
    const { error } = await state.supabase.from("task_completions").insert({ task_id: task.id, finished_at: finishedAtIso });

    if (error) {
        console.error(error);
        state.completions = previousCompletions;
        renderTaskWorkspace();
        return;
    }

    try {
        await loadCompletionsForDateRange(state.completionRange.startDate || initialCompletionStartDate(), state.completionRange.endDate || todayKey);
    } catch (loadError) {
        console.error(loadError);
        state.completions = previousCompletions;
    }

    renderTaskWorkspace();
}

function applyOptimisticCompletion(taskId, dateKey, finishedAtIso) {
    const taskCompletions = state.completions.get(taskId) || new Map();
    taskCompletions.set(dateKey, finishedAtIso);
    state.completions.set(taskId, taskCompletions);
}

function cloneCompletions(completions) {
    const cloned = new Map();
    for (const [taskId, taskCompletions] of completions.entries()) {
        cloned.set(taskId, new Map(taskCompletions));
    }
    return cloned;
}

function getCompletionTime(task, dateKey) {
    const taskCompletions = state.completions.get(task.id);
    if (!taskCompletions) return null;

    const repeatType = String(task.repeat_type || "").toLowerCase();
    if (repeatType === "weekly") {
        return getPeriodCompletionTime(taskCompletions, getWeekDateKeys(dateKey));
    }

    if (repeatType === "monthly") {
        return getPeriodCompletionTime(taskCompletions, getMonthDateKeys(dateKey));
    }

    return taskCompletions.get(dateKey) || null;
}

function getPeriodCompletionTime(taskCompletions, dateKeys) {
    for (const key of dateKeys) {
        const completedAt = taskCompletions.get(key);
        if (completedAt) return completedAt;
    }
    return null;
}

function getWeekDateKeys(dateKey) {
    const selectedDate = parseDateKey(dateKey);
    const start = startOfWeekLocal(selectedDate);
    const keys = [];

    for (let offset = 0; offset < 7; offset += 1) {
        const current = new Date(start);
        current.setDate(start.getDate() + offset);
        keys.push(formatDateKey(current));
    }

    return keys;
}

function getMonthDateKeys(dateKey) {
    const selectedDate = parseDateKey(dateKey);
    const keys = [];
    const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

    for (const current of buildDateRange(start, end)) {
        keys.push(formatDateKey(current));
    }

    return keys;
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

function getViewFromUrl() {
    return new URLSearchParams(window.location.search).get("view")?.trim() || "";
}

function setViewAndReload(view) {
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
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

function startOfWeekLocal(date) {
    const normalized = startOfLocalDay(date);
    const day = normalized.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    normalized.setDate(normalized.getDate() + diff);
    return normalized;
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

function formatCompletionLabel(task, completedAt) {
    const repeatType = String(task.repeat_type || "").toLowerCase();
    const finishedDate = new Date(completedAt);
    const time = formatFinishedAt(completedAt);

    if (repeatType === "weekly" || repeatType === "monthly") {
        return `Hoàn thành lúc ${formatLongDate(finishedDate)}, ${time}`;
    }

    return `Hoàn thành lúc ${time}`;
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

function isSelectedDateWithinCompletionCache(dateKey) {
    const { startDate, endDate } = state.completionRange;
    if (!startDate || !endDate) return false;

    // Determine the month window the user needs: the whole month containing dateKey,
    // but include from the start-of-week of the month's 1st day.
    const d = parseDateKey(dateKey);
    const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthWeekStart = startOfWeekLocal(firstOfMonth);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const monthWeekStartKey = formatDateKey(monthWeekStart);
    const monthEndKey = formatDateKey(monthEnd);

    return monthWeekStartKey >= startDate && monthEndKey <= endDate;
}

async function ensureCompletionsForSelectedDate(dateKey) {
    if (isSelectedDateWithinCompletionCache(dateKey)) return;

    const range = getCompletionRangeForDate(dateKey);
    await loadCompletionsForDateRange(range.startDate, range.endDate);
}

function getCompletionRangeForDate(dateKey) {
    const selectedDate = parseDateKey(dateKey);
    const firstOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthWeekStart = startOfWeekLocal(firstOfMonth);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
    return { startDate: formatDateKey(monthWeekStart), endDate: formatDateKey(monthEnd) };
}

function initialCompletionStartDate() {
    const today = parseDateKey(todayKey);
    return formatDateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}