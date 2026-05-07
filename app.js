// Connections Builder - vanilla JS, no build step
// Repo for "submit to repo" flow:
const REPO_OWNER = "OhioMathTeacher";
const REPO_NAME = "Connections";
const REPO_BRANCH = "main";
const GITHUB_API = "https://api.github.com";
const DIFFICULTIES = ["yellow", "green", "blue", "purple"];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "zh", label: "Chinese" },
];
const SUBJECTS = ["Science", "Math", "Social Studies", "Language Arts", "Mixed", "Just for Fun"];

const TOPICS = [
  { id: "algebra",       label: "Algebra" },
  { id: "arithmetic",    label: "Arithmetic" },
  { id: "calculus",      label: "Calculus" },
  { id: "geometry",      label: "Geometry" },
  { id: "biology",       label: "Biology" },
  { id: "chemistry",     label: "Chemistry" },
  { id: "physics",       label: "Physics" },
  { id: "earth-science", label: "Earth Science" },
  { id: "geography",     label: "Geography" },
  { id: "history",       label: "History" },
  { id: "literature",    label: "Literature" },
  { id: "drama",         label: "Drama" },
  { id: "vocabulary",    label: "Vocabulary" },
  { id: "spanish",       label: "Spanish" },
  { id: "chinese",       label: "Chinese" },
  { id: "animals",       label: "Animals" },
  { id: "food",          label: "Food" },
  { id: "movies",        label: "Movies & TV" },
  { id: "music",         label: "Music" },
  { id: "school",        label: "School Life" },
  { id: "pop-culture",   label: "Pop Culture" },
  { id: "humor",         label: "Humor" },
];
const GRADES = ["7-8", "9-10", "11-12"];

function languageLabel(code) {
  return (LANGUAGES.find(l => l.code === code) || {}).label || code || "—";
}

const I18N = {
  en: {
    by: "by",
    shuffle: "Shuffle",
    deselect: "Deselect",
    submit: "Submit",
    mistakes: "Mistakes:",
    showHints: "Show hints",
    relaxedMode: "Relaxed mode",
    nice: "Nice!",
    oneAway: "One away…",
    notQuite: "Not quite.",
    outOfGuesses: "Out of guesses. Better luck next time!",
    solved: (n) => `Solved with ${n} mistake${n === 1 ? "" : "s"}! 🎉`,
  },
  es: {
    by: "por",
    shuffle: "Mezclar",
    deselect: "Borrar",
    submit: "Enviar",
    mistakes: "Errores:",
    showHints: "Mostrar pistas",
    relaxedMode: "Modo relajado",
    nice: "¡Muy bien!",
    oneAway: "Falta uno…",
    notQuite: "Casi.",
    outOfGuesses: "Sin intentos. ¡Suerte la próxima!",
    solved: (n) => `¡Resuelto con ${n} error${n === 1 ? "" : "es"}! 🎉`,
  },
  zh: {
    by: "作者",
    shuffle: "打乱",
    deselect: "取消选择",
    submit: "提交",
    mistakes: "错误:",
    showHints: "显示提示",
    relaxedMode: "轻松模式",
    nice: "不错!",
    oneAway: "差一个…",
    notQuite: "不对。",
    outOfGuesses: "机会用完了。下次再试!",
    solved: (n) => `用了 ${n} 次错误解开了! 🎉`,
  },
};

function t(lang, key, ...args) {
  const dict = I18N[lang] || I18N.en;
  const v = dict[key] !== undefined ? dict[key] : I18N.en[key];
  return typeof v === "function" ? v(...args) : v;
}

const app = document.getElementById("app");

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function renderTemplate(id) {
  const tpl = document.getElementById(id);
  app.replaceChildren(tpl.content.cloneNode(true));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setMessage(text, cls = "") {
  const m = $("#message");
  if (!m) return;
  m.textContent = text;
  m.className = "message " + cls;
}

// ---------- Routing ----------

function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/play/inline/")) {
    const encoded = hash.slice("#/play/inline/".length);
    try {
      const json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
      const puzzle = JSON.parse(json);
      renderPlay(puzzle);
    } catch (e) {
      app.innerHTML = "<p>Couldn't decode that puzzle link. It may be corrupted.</p>";
    }
    return;
  }
  if (hash.startsWith("#/play/")) {
    const slug = hash.slice("#/play/".length);
    loadAndPlay(slug);
    return;
  }
  if (hash === "#/build") return renderBuild();
  if (hash === "#/about") return renderAbout();
  if (hash === "#/tips") return renderTips();
  return renderHome();
}

window.addEventListener("hashchange", route);

// ---------- Home ----------

async function renderHome() {
  renderTemplate("view-home");
  // Populate filter dropdowns
  fillSelect($("#filter-lang"), [{ value: "", label: "All languages" }, ...LANGUAGES.map(l => ({ value: l.code, label: l.label }))]);
  fillSelect($("#filter-subject"), [{ value: "", label: "All subjects" }, ...SUBJECTS.map(s => ({ value: s, label: s }))]);
  fillSelect($("#filter-grade"), [{ value: "", label: "All grades" }, ...GRADES.map(g => ({ value: g, label: `Grades ${g}` }))]);
  // Default to Science so the list doesn't overflow the viewport on first load
  $("#filter-subject").value = "Science";

  const list = $("#puzzle-list");
  list.innerHTML = `<li class="loading">Loading puzzles…</li>`;
  let items = [];
  try {
    items = await discoverPuzzles();
  } catch (e) {
    list.innerHTML = `<li class="loading">Couldn't load puzzles. <a href="#/build">Build one →</a></li>`;
    return;
  }

  const apply = () => {
    const lang = $("#filter-lang").value;
    const subj = $("#filter-subject").value;
    const grade = $("#filter-grade").value;
    const filtered = items.filter(it =>
      (!lang || it.language === lang) &&
      (!subj || it.subject === subj) &&
      (!grade || it.grade === grade)
    );
    if (!filtered.length) {
      list.innerHTML = `<li class="loading">No puzzles match those filters. Try widening the search, or <a href="#/build">build one</a>.</li>`;
      return;
    }
    list.innerHTML = "";
    for (const it of filtered) {
      const li = document.createElement("li");
      const badges = [
        it.language ? `<span class="badge">${escapeHtml(languageLabel(it.language))}</span>` : "",
        it.subject  ? `<span class="badge">${escapeHtml(it.subject)}</span>` : "",
        it.grade    ? `<span class="badge">Gr ${escapeHtml(it.grade)}</span>` : "",
      ].join("");
      const iconSrc = it.topic ? `assets/icons/topics/${encodeURIComponent(it.topic)}.svg` : "assets/icons/_default.svg";
      li.innerHTML = `<a href="#/play/${encodeURIComponent(it.slug)}">
        <img class="puzzle-icon" src="${iconSrc}" alt="" loading="lazy" onerror="this.src='assets/icons/_default.svg'">
        <div class="puzzle-info">
          <div class="row-title">${escapeHtml(it.title)}</div>
          <div class="meta">${escapeHtml(it.author || "anonymous")} ${badges}</div>
        </div>
      </a>`;
      list.appendChild(li);
    }
  };

  $("#filter-lang").addEventListener("change", apply);
  $("#filter-subject").addEventListener("change", apply);
  $("#filter-grade").addEventListener("change", apply);
  apply();
}

function fillSelect(sel, options) {
  sel.innerHTML = "";
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    sel.appendChild(opt);
  }
}

// Auto-discover puzzles in puzzles/ folder via GitHub Contents API.
// Falls back to puzzles/index.json (or known filenames) if GitHub is unreachable.
async function discoverPuzzles() {
  let files = [];
  try {
    const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/puzzles?ref=${REPO_BRANCH}`, {
      headers: { "Accept": "application/vnd.github+json" },
    });
    if (res.ok) {
      const entries = await res.json();
      files = entries
        .filter(e => e.type === "file" && e.name.endsWith(".json") && e.name !== "index.json")
        .map(e => e.name);
    }
  } catch (e) { /* fallback below */ }

  if (!files.length) {
    // Local-dev fallback: try index.json for an explicit list
    try {
      const r = await fetch("puzzles/index.json", { cache: "no-cache" });
      if (r.ok) {
        const items = await r.json();
        return items.map(it => ({
          slug: it.slug,
          title: it.title || it.slug,
          author: it.author || "",
        }));
      }
    } catch (e) { /* ignore */ }
    return [];
  }

  const items = await Promise.all(files.map(async (name) => {
    const slug = name.replace(/\.json$/, "");
    try {
      const r = await fetch(`puzzles/${name}`, { cache: "no-cache" });
      if (!r.ok) return null;
      const p = await r.json();
      return {
        slug,
        title: p.title || slug,
        author: p.author || "",
        language: p.language || "",
        subject: p.subject || "",
        grade: p.grade || "",
        topic: p.topic || "",
      };
    } catch (e) {
      return { slug, title: slug, author: "" };
    }
  }));
  return items.filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ---------- Play ----------

async function loadAndPlay(slug) {
  app.innerHTML = "<p>Loading…</p>";
  try {
    const res = await fetch(`puzzles/${encodeURIComponent(slug)}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error("not found");
    const puzzle = await res.json();
    renderPlay(puzzle);
  } catch (e) {
    app.innerHTML = `<p>Puzzle not found. <a href="#/">Back to list</a></p>`;
  }
}

function validatePuzzle(p) {
  if (!p || !Array.isArray(p.groups) || p.groups.length !== 4) return false;
  for (const g of p.groups) {
    if (!g.category || !Array.isArray(g.words) || g.words.length !== 4) return false;
  }
  return true;
}

function renderPlay(puzzle) {
  if (!validatePuzzle(puzzle)) {
    app.innerHTML = "<p>This puzzle is malformed.</p>";
    return;
  }
  renderTemplate("view-play");
  initPlay(puzzle);
}

function initPlay(puzzle) {
  if (!validatePuzzle(puzzle)) return;
  const lang = puzzle.language || "en";
  $("#play-title").textContent = puzzle.title || "Untitled";
  $("#play-author").textContent = puzzle.author ? `${t(lang, "by")} ${puzzle.author}` : "";

  // Localize static button labels and "Mistakes:" text
  $("#btn-shuffle").textContent = t(lang, "shuffle");
  $("#btn-deselect").textContent = t(lang, "deselect");
  $("#btn-submit").textContent = t(lang, "submit");
  const mistakesEl = $(".mistakes");
  if (mistakesEl) {
    mistakesEl.childNodes[0].textContent = t(lang, "mistakes") + " ";
  }

  // Hint toggle: only show if this puzzle has hints
  const hintLabel = $("#hint-toggle-label");
  const hintCheckbox = $("#toggle-hints");
  const hintText = $("#hint-toggle-text");
  const hasHints = puzzle.hints && Object.keys(puzzle.hints).length > 0;
  if (hasHints) {
    hintLabel.hidden = false;
    hintText.textContent = t(lang, "showHints");
    hintCheckbox.checked = localStorage.getItem("clique.hintsOn") === "1";
  } else {
    hintLabel.hidden = true;
    hintCheckbox.checked = false;
  }

  // Relaxed mode toggle: always available, persisted across sessions
  $("#relax-toggle-text").textContent = t(lang, "relaxedMode");
  const relaxCheckbox = $("#toggle-relaxed");
  relaxCheckbox.checked = localStorage.getItem("clique.relaxedOn") === "1";

  const state = {
    puzzle,
    remaining: [],   // [{word, groupIndex}]
    selected: new Set(),
    solvedGroups: [], // group indices in order solved
    mistakes: 0,
    maxMistakes: 4,
    over: false,
  };

  for (let gi = 0; gi < puzzle.groups.length; gi++) {
    for (const w of puzzle.groups[gi].words) {
      state.remaining.push({ word: w.toUpperCase(), groupIndex: gi });
    }
  }
  state.remaining = shuffle(state.remaining);

  drawBoard(state);

  $("#btn-shuffle").onclick = () => {
    state.remaining = shuffle(state.remaining);
    drawBoard(state);
  };
  $("#btn-deselect").onclick = () => {
    state.selected.clear();
    drawBoard(state);
  };
  $("#btn-submit").onclick = () => submitGuess(state);

  if (hintCheckbox) {
    hintCheckbox.onchange = () => {
      localStorage.setItem("clique.hintsOn", hintCheckbox.checked ? "1" : "0");
      drawBoard(state);
    };
  }
  relaxCheckbox.onchange = () => {
    localStorage.setItem("clique.relaxedOn", relaxCheckbox.checked ? "1" : "0");
    drawBoard(state);
  };
}

function drawBoard(state) {
  const grid = $("#grid");
  const solved = $("#solved");
  grid.innerHTML = "";
  solved.innerHTML = "";

  for (const gi of state.solvedGroups) {
    const g = state.puzzle.groups[gi];
    const row = document.createElement("div");
    row.className = "solved-row " + DIFFICULTIES[gi] + (state.puzzle.pictograph ? " pictograph" : "");
    const wordsHTML = state.puzzle.pictograph
      ? g.words.map(w => escapeHtml(w)).join(" ")
      : g.words.map(w => escapeHtml(w.toUpperCase())).join(", ");
    row.innerHTML = `<div class="cat">${escapeHtml(g.category)}</div><div class="words">${wordsHTML}</div>`;
    solved.appendChild(row);
  }

  const hintsOn = $("#toggle-hints")?.checked && state.puzzle.hints;
  const isPictograph = !!state.puzzle.pictograph;
  for (const item of state.remaining) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile"
      + (state.selected.has(item.word) ? " selected" : "")
      + (isPictograph ? " pictograph" : "");
    btn.textContent = item.word;
    btn.disabled = state.over;
    if (hintsOn) {
      const hint = state.puzzle.hints[item.word];
      if (hint) {
        btn.classList.add("with-hint");
        btn.dataset.hint = hint;
        btn.title = hint;
      }
    }
    btn.onclick = () => {
      if (state.over) return;
      if (state.selected.has(item.word)) {
        state.selected.delete(item.word);
      } else {
        if (state.selected.size >= 4) return;
        state.selected.add(item.word);
      }
      drawBoard(state);
    };
    grid.appendChild(btn);
  }

  $("#btn-submit").disabled = state.selected.size !== 4 || state.over;
  // Hide the mistakes counter entirely in relaxed mode — no anxiety from a ticking dial.
  const relaxed = $("#toggle-relaxed")?.checked;
  const mistakesEl = $(".mistakes");
  if (mistakesEl) mistakesEl.style.visibility = relaxed ? "hidden" : "";
  drawMistakes(state);
}

function drawMistakes(state) {
  const dots = $("#mistakes-dots");
  dots.innerHTML = "";
  for (let i = 0; i < state.maxMistakes; i++) {
    const d = document.createElement("span");
    d.className = "dot" + (i < state.mistakes ? " gone" : "");
    dots.appendChild(d);
  }
}

function submitGuess(state) {
  const lang = state.puzzle.language || "en";
  const picks = [...state.selected];
  const items = state.remaining.filter(r => picks.includes(r.word));
  const counts = {};
  for (const it of items) counts[it.groupIndex] = (counts[it.groupIndex] || 0) + 1;
  const groupIndex = items[0].groupIndex;
  const allSame = items.every(it => it.groupIndex === groupIndex);

  if (allSame) {
    // correct
    state.solvedGroups.push(groupIndex);
    state.remaining = state.remaining.filter(r => r.groupIndex !== groupIndex);
    state.selected.clear();
    drawBoard(state);
    if (state.solvedGroups.length === 4) {
      state.over = true;
      setMessage(t(lang, "solved", state.mistakes), "win");
    } else {
      setMessage(t(lang, "nice"), "win");
    }
    return;
  }

  const relaxed = $("#toggle-relaxed")?.checked;
  if (!relaxed) state.mistakes++;
  const max = Math.max(...Object.values(counts));
  $$(".tile").forEach(t => {
    if (state.selected.has(t.textContent)) t.classList.add("shake");
  });
  setTimeout(() => $$(".tile.shake").forEach(t => t.classList.remove("shake")), 450);

  if (!relaxed && state.mistakes >= state.maxMistakes) {
    state.over = true;
    // reveal remaining
    const remainingGroups = [0,1,2,3].filter(gi => !state.solvedGroups.includes(gi));
    state.solvedGroups.push(...remainingGroups);
    state.remaining = [];
    drawBoard(state);
    setMessage(t(lang, "outOfGuesses"), "lose");
  } else if (max === 3) {
    setMessage(t(lang, "oneAway"), "hint");
    drawMistakes(state);
  } else {
    setMessage(t(lang, "notQuite"), "hint");
    drawMistakes(state);
  }
}

// ---------- Build ----------

function renderBuild() {
  renderTemplate("view-build");
  // Populate metadata selects
  fillSelect($("select[name=language]"), [{ value: "", label: "Choose…" }, ...LANGUAGES.map(l => ({ value: l.code, label: l.label }))]);
  fillSelect($("select[name=subject]"),  [{ value: "", label: "Choose…" }, ...SUBJECTS.map(s => ({ value: s, label: s }))]);
  fillSelect($("select[name=grade]"),    [{ value: "", label: "Choose…" }, ...GRADES.map(g => ({ value: g, label: `Grades ${g}` }))]);
  fillSelect($("select[name=topic]"),    [{ value: "", label: "Choose…" }, ...TOPICS.map(t => ({ value: t.id, label: t.label }))]);
  $("#btn-ai-generate").onclick = () => openGenerateDialog();
  $("#btn-preview").onclick = () => {
    const p = readForm();
    if (!p) return;
    renderPlay(p);
  };
  $("#btn-share").onclick = () => {
    const p = readForm();
    if (!p) return;
    const url = sharableLink(p);
    const out = $("#build-output");
    out.innerHTML = `
      <h3>🔗 Share this link</h3>
      <p>Copy the link below and send it to anyone you want to play your puzzle — over email, Classroom, text, whatever. The whole puzzle is encoded in the URL, so no account or upload is needed.</p>
      <div class="link-row">
        <input type="text" id="share-link-input" value="${escapeHtml(url)}" readonly>
        <button type="button" id="copy-link" class="primary">Copy</button>
      </div>
      <p class="muted">Heads up: the answer is encoded in the URL, so a curious player with developer tools could decode it.</p>
    `;
    const input = $("#share-link-input");
    input.focus();
    input.select();
    $("#copy-link").onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        $("#copy-link").textContent = "Copied ✓";
        setTimeout(() => { $("#copy-link").textContent = "Copy"; }, 1500);
      } catch (e) {
        input.select();
        document.execCommand("copy");
      }
    };
  };
  $("#btn-download").onclick = () => {
    const p = readForm();
    if (!p) return;
    const slug = slugify(p.title);
    const content = JSON.stringify(p, null, 2) + "\n";
    const blob = new Blob([content], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
    const out = $("#build-output");
    out.innerHTML = `
      <h3>💾 Saved!</h3>
      <p>Your puzzle was downloaded as <code>${escapeHtml(slug)}.json</code>. Keep it safe and bring it back another day, or share the file with friends.</p>
    `;
  };
}

function readForm() {
  const f = $("#build-form");
  if (!f.reportValidity()) return null;
  const fd = new FormData(f);
  const groups = [];
  for (let gi = 0; gi < 4; gi++) {
    groups.push({
      category: String(fd.get(`cat${gi}`)).trim(),
      difficulty: DIFFICULTIES[gi],
      words: [0,1,2,3].map(wi => String(fd.get(`w${gi}_${wi}`)).trim().toUpperCase()),
    });
  }
  // Check for duplicate or empty words across the whole puzzle
  const all = groups.flatMap(g => g.words);
  $$('#build-form input.dup-bad').forEach(el => el.classList.remove('dup-bad'));
  const dup = all.find((w, i) => w && all.indexOf(w) !== i);
  if (dup) {
    // Highlight every cell containing the dup word
    $$("#build-form input").forEach(el => {
      if (el.value.trim().toUpperCase() === dup) el.classList.add('dup-bad');
    });
    alert(`"${dup}" appears more than once. Each word in the puzzle must be unique — the duplicates are highlighted in red.`);
    return null;
  }
  if (all.some(w => !w)) {
    alert("Every word slot must be filled before submitting.");
    return null;
  }
  return {
    title: String(fd.get("title")).trim(),
    author: String(fd.get("author") || "").trim(),
    language: String(fd.get("language") || "").trim(),
    subject: String(fd.get("subject") || "").trim(),
    grade: String(fd.get("grade") || "").trim(),
    topic: String(fd.get("topic") || "").trim(),
    groups,
  };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "puzzle";
}

function sharableLink(puzzle) {
  const json = JSON.stringify(puzzle);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return `${location.origin}${location.pathname}#/play/inline/${encodeURIComponent(b64)}`;
}

function renderTips() {
  renderTemplate("view-tips");
}

// ---------- About ----------

function renderAbout() {
  renderTemplate("view-about");
  const link = $("#repo-link");
  if (link) link.href = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
}

// ---------- AI puzzle generation (bring-your-own-key) ----------

const PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    keyUrl: "https://console.groq.com/keys",
    generate: (key, prompt) => callOpenAICompatible({
      url: "https://api.groq.com/openai/v1/chat/completions",
      key, model: "llama-3.3-70b-versatile", prompt,
    }),
  },
  {
    id: "openai",
    label: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    generate: (key, prompt) => callOpenAICompatible({
      url: "https://api.openai.com/v1/chat/completions",
      key, model: "gpt-4o-mini", prompt,
    }),
  },
  {
    id: "gemini",
    label: "Gemini",
    keyUrl: "https://aistudio.google.com/apikey",
    generate: (key, prompt) => callGemini({ key, model: "gemini-2.0-flash", prompt }),
  },
  {
    id: "anthropic",
    label: "Claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    generate: (key, prompt) => callAnthropic({ key, model: "claude-sonnet-4-6", prompt }),
  },
];

const KEY_PREFIX = "connections.apiKey.";
function getKey(id) { return localStorage.getItem(KEY_PREFIX + id) || ""; }
function setKey(id, val) {
  if (val) localStorage.setItem(KEY_PREFIX + id, val);
  else localStorage.removeItem(KEY_PREFIX + id);
}
function providersWithKeys() { return PROVIDERS.filter(p => getKey(p.id)); }

// ---- Keys dialog ----

function openKeysDialog() {
  const dlg = $("#keys-dialog");
  renderKeysGrid();
  $("#key-editor").hidden = true;
  dlg.showModal();
}
function renderKeysGrid() {
  const grid = $("#keys-grid");
  grid.innerHTML = "";
  for (const p of PROVIDERS) {
    const has = !!getKey(p.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "key-card";
    btn.innerHTML = `<span>${escapeHtml(p.label)}</span><span class="status ${has ? "set" : ""}">${has ? "✓ saved" : "— add key"}</span>`;
    btn.onclick = () => openKeyEditor(p.id);
    grid.appendChild(btn);
  }
}
function openKeyEditor(id) {
  const p = PROVIDERS.find(x => x.id === id);
  $("#key-editor-title").textContent = `${p.label} API key`;
  $("#key-editor-link").href = p.keyUrl;
  $("#key-editor-input").value = getKey(id);
  $("#key-editor").hidden = false;
  $("#key-editor-save").onclick = () => {
    setKey(id, $("#key-editor-input").value.trim());
    renderKeysGrid();
    $("#key-editor").hidden = true;
  };
  $("#key-editor-remove").onclick = () => {
    setKey(id, "");
    renderKeysGrid();
    $("#key-editor").hidden = true;
  };
  $("#key-editor-cancel").onclick = () => { $("#key-editor").hidden = true; };
}

function bindKeysUI() {
  const openBtn = $("#open-keys");
  const closeBtn = $("#keys-close");
  if (openBtn) openBtn.addEventListener("click", (e) => { e.preventDefault(); openKeysDialog(); });
  if (closeBtn) closeBtn.addEventListener("click", () => $("#keys-dialog").close());
}

// ---- Generate dialog ----

function openGenerateDialog() {
  const have = providersWithKeys();
  if (!have.length) {
    alert("No API keys saved yet. Click 🔑 Keys in the top nav and add one first.");
    return;
  }
  const sel = $("#gen-provider");
  fillSelect(sel, have.map(p => ({ value: p.id, label: p.label })));
  $("#gen-topic").value = "";
  $("#gen-status").textContent = "";
  $("#gen-dialog").showModal();
  $("#gen-cancel").onclick = () => $("#gen-dialog").close();
  $("#gen-go").onclick = runGenerate;
}

async function runGenerate() {
  const providerId = $("#gen-provider").value;
  const provider = PROVIDERS.find(p => p.id === providerId);
  const key = getKey(providerId);
  if (!provider || !key) {
    $("#gen-status").textContent = "No key for that provider.";
    return;
  }
  // Pull current build form metadata
  const fd = new FormData($("#build-form"));
  const language = String(fd.get("language") || "");
  const subject = String(fd.get("subject") || "");
  const grade = String(fd.get("grade") || "");
  const formTopic = String(fd.get("topic") || "");
  if (!language || !subject || !grade) {
    $("#gen-status").textContent = "Please choose language, subject, and grade level on the form first.";
    return;
  }
  const topicHint = $("#gen-topic").value.trim();
  const prompt = buildPrompt({ language, subject, grade, topicHint, formTopic });

  $("#gen-go").disabled = true;
  $("#gen-status").textContent = "Generating… this can take 5–20 seconds.";
  try {
    const text = await provider.generate(key, prompt);
    const puzzle = parsePuzzleJSON(text);
    // Prefer the user's explicit topic; otherwise use whatever the AI picked, falling back to nothing
    const topic = formTopic || (TOPICS.find(t => t.id === puzzle.topic) ? puzzle.topic : "");
    fillBuildFormFromPuzzle({ ...puzzle, language, subject, grade, topic });
    $("#gen-status").textContent = "✓ Generated — review and edit before submitting.";
    setTimeout(() => $("#gen-dialog").close(), 600);
  } catch (e) {
    console.error(e);
    $("#gen-status").textContent = "Error: " + (e.message || e);
  } finally {
    $("#gen-go").disabled = false;
  }
}

function buildPrompt({ language, subject, grade, topicHint, formTopic }) {
  const langName = languageLabel(language);
  const topicList = TOPICS.map(t => t.id).join(", ");
  const topicLine = formTopic
    ? `- Topic: "${formTopic}" (use this exact id)`
    : `- Topic: pick the single best matching id from this list and put it in the JSON: ${topicList}`;
  return `You are generating a Connections-style word puzzle for students.

Output ONLY a single JSON object — no markdown fences, no commentary. Schema:
{
  "title": "short title in ${langName}",
  "topic": "one id from the topic list below",
  "groups": [
    {"category": "label", "difficulty": "yellow", "words": ["A","B","C","D"]},
    {"category": "label", "difficulty": "green",  "words": ["A","B","C","D"]},
    {"category": "label", "difficulty": "blue",   "words": ["A","B","C","D"]},
    {"category": "label", "difficulty": "purple", "words": ["A","B","C","D"]}
  ],
  "hints": {
    "WORD": "short, definitional clue that gives just enough to recognize the word"
  }
}

Constraints:
- All puzzle text (title, category labels, words) must be in ${langName}.
- Subject area: ${subject}
- Grade level: ${grade}
${topicLine}
- Topic hint from user (may be empty): ${topicHint || "(none — pick something fitting)"}
- Yellow = easiest category, Green = moderate, Blue = challenging, Purple = hardest (often wordplay or trickier links).
- Exactly 4 groups, each with exactly 4 words.
- CRITICAL: All 16 words must be unique. No word may appear in two categories. Double-check before returning.
- Each "word" is a single word or short phrase (max 3 words).
- Words should be UPPERCASE.
- Keep content school-appropriate.
- Make the categories specific enough to be solvable by students at the stated grade level.
- Include a "hints" object that maps every uppercase word to a short clue (8–18 words) in ${langName}. Hints should help a stuck student recognize the word without revealing the category. Definitions, synonyms, or quick descriptions work best.

Return only the JSON object.`;
}

function parsePuzzleJSON(text) {
  if (!text) throw new Error("Empty response");
  // Strip code fences if present
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // Find first { and last } as a fallback
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first > 0 || last < s.length - 1) {
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1);
  }
  let parsed;
  try { parsed = JSON.parse(s); }
  catch (e) { throw new Error("Couldn't parse JSON from model: " + e.message); }
  if (!parsed.groups || parsed.groups.length !== 4) {
    throw new Error("Model didn't return 4 groups.");
  }
  const order = ["yellow", "green", "blue", "purple"];
  parsed.groups.sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));
  for (const g of parsed.groups) {
    if (!g.words || g.words.length !== 4) throw new Error("A group is missing 4 words.");
    g.words = g.words.map(w => String(w).toUpperCase());
  }
  return parsed;
}

function fillBuildFormFromPuzzle(p) {
  const f = $("#build-form");
  if (p.title) f.elements["title"].value = p.title;
  if (p.language) f.elements["language"].value = p.language;
  if (p.subject) f.elements["subject"].value = p.subject;
  if (p.grade) f.elements["grade"].value = p.grade;
  if (p.topic) f.elements["topic"].value = p.topic;
  for (let gi = 0; gi < 4; gi++) {
    const g = p.groups[gi];
    f.elements[`cat${gi}`].value = g.category || "";
    for (let wi = 0; wi < 4; wi++) {
      f.elements[`w${gi}_${wi}`].value = (g.words[wi] || "").toUpperCase();
    }
  }
}

// ---- Provider API callers ----

async function callOpenAICompatible({ url, key, model, prompt }) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a careful, school-appropriate puzzle author. Return only JSON when asked." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini({ key, model, prompt }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAnthropic({ key, model, prompt }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.8,
      system: "You are a careful, school-appropriate puzzle author. Return only JSON when asked.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// boot
bindKeysUI();
route();
