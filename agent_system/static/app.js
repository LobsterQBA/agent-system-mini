const state = {
  mode: "demo",
  liveConfigured: false,
};

const form = document.querySelector("#agent-form");
const input = document.querySelector("#task-input");
const runButton = document.querySelector("#run-button");
const replyText = document.querySelector("#reply-text");
const traceList = document.querySelector("#trace-list");
const traceClock = document.querySelector("#trace-clock");
const modeNote = document.querySelector("#mode-note");

function formatDetail(detail) {
  if (typeof detail === "string") return detail;
  return JSON.stringify(detail, null, 2);
}

function traceStep(event, index) {
  const article = document.createElement("article");
  article.className = "trace-step";
  article.dataset.kind = event.kind;
  article.style.animationDelay = `${index * 45}ms`;

  const dot = document.createElement("span");
  dot.className = "trace-dot";
  dot.textContent = String(event.step).padStart(2, "0");

  const body = document.createElement("div");
  body.className = "trace-body";
  const title = document.createElement("h3");
  title.textContent = event.title;
  const detail = document.createElement("pre");
  detail.textContent = formatDetail(event.detail);
  body.append(title, detail);

  const timing = document.createElement("span");
  timing.className = "trace-time";
  timing.textContent = `${event.elapsed_ms} ms`;
  article.append(dot, body, timing);
  return article;
}

function renderTrace(trace) {
  traceList.replaceChildren();
  trace.forEach((event, index) => traceList.append(traceStep(event, index)));
  const last = trace.at(-1);
  traceClock.textContent = `${last?.elapsed_ms || 0} ms`;
}

function renderMemory(payload) {
  document.querySelector("#metric-memories").textContent = payload.memories.length;
  document.querySelector("#metric-turns").textContent = payload.turns.length;
  const grid = document.querySelector("#memory-grid");
  grid.replaceChildren();
  if (!payload.memories.length) {
    const empty = document.createElement("article");
    empty.className = "memory-empty";
    const label = document.createElement("span");
    label.textContent = "EMPTY BY DEFAULT";
    const text = document.createElement("p");
    text.textContent =
      "Ask the agent to remember something. It will appear here and remain after restart.";
    empty.append(label, text);
    grid.append(empty);
    return;
  }
  payload.memories.forEach((memory, index) => {
    const card = document.createElement("article");
    card.className = "memory-card";
    const label = document.createElement("span");
    label.textContent = `MEMORY / ${String(index + 1).padStart(2, "0")}`;
    const key = document.createElement("h3");
    key.textContent = memory.key;
    const value = document.createElement("p");
    value.textContent = memory.value;
    card.append(label, key, value);
    grid.append(card);
  });
}

async function refreshMemory() {
  const response = await fetch("/api/memory");
  if (!response.ok) return;
  renderMemory(await response.json());
}

function setMode(mode) {
  if (mode === "live" && !state.liveConfigured) return;
  state.mode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.mode === mode);
  });
  modeNote.textContent =
    mode === "demo"
      ? "Deterministic planner · no API key"
      : "Function-calling model · key stays server-side";
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.example;
    input.focus();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  runButton.disabled = true;
  runButton.querySelector("span").textContent = "Running the loop…";
  replyText.textContent = "The agent is reasoning…";
  traceClock.textContent = "running";

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, mode: state.mode }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The agent turn failed.");
    replyText.textContent = payload.reply;
    renderTrace(payload.trace);
    await refreshMemory();
  } catch (error) {
    replyText.textContent = error.message;
    traceClock.textContent = "error";
  } finally {
    runButton.disabled = false;
    runButton.querySelector("span").textContent = "Run one turn";
  }
});

async function boot() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    state.liveConfigured = Boolean(status.live_configured);
    const liveButton = document.querySelector('[data-mode="live"]');
    liveButton.disabled = !state.liveConfigured;
    liveButton.title = state.liveConfigured
      ? "Use the configured live model"
      : "Add AGENT_API_KEY and AGENT_MODEL to .env";
    const systemStatus = document.querySelector("#system-status");
    systemStatus.classList.add("ready");
    systemStatus.innerHTML = "<i></i> local · ready";
    await refreshMemory();
  } catch (error) {
    document.querySelector("#system-status").textContent = "offline";
    replyText.textContent = "Start the local Python server to use the cockpit.";
  }
}

boot();
