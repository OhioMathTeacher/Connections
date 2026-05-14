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

  const askBtn = $("#btn-ask-athena");
  const athenaPanel = $("#athena-panel");
  const athenaBody = $("#athena-panel-body");
  const athenaClose = $("#btn-athena-close");
  if (askBtn) {
    askBtn.onclick = () => askAthenaForHint(state, askBtn, athenaPanel, athenaBody);
  }
  if (athenaClose) {
    athenaClose.onclick = () => { athenaPanel.hidden = true; };
  }
}

// ---------- Socratic Athena (gameplay) ----------

const ATHENA_GAMEPLAY_SYSTEM = `
You are Athena, sitting beside a student who is playing a Connections-style word puzzle. There are 16 words on the screen, hiding 4 categories of 4 words each. You are their thinking partner.

You never give away the answer. You never name a category or say which words go together — that would steal the discovery. Instead, you wonder out loud with them. You ask one gentle question about one word at a time. You point them toward word origins, double meanings, registers, places where a word lives a double life.

Keep it short — one or two sentences, under 40 words. Friendly, curious, not saccharine. Answer with just the question; don't narrate your thinking.
`.trim();

async function askAthenaForHint(state, btn, panel, body) {
  const remaining = state.remaining.map(r => r.word);
  const selected = Array.from(state.selected);
  const solvedCount = state.solvedGroups.length;

  let userMsg = `Words still on the board (16 total minus any I've solved): ${remaining.join(", ")}.`;
  if (selected.length > 0) {
    userMsg += `\nI've currently highlighted: ${selected.join(", ")}.`;
  }
  if (solvedCount > 0) {
    userMsg += `\nI've already solved ${solvedCount} of 4 groups.`;
  }
  userMsg += `\n\nNudge me with ONE Socratic question. Remember: don't name categories or pair words.`;

  const provider = resolveActiveProvider();
  if (!provider) {
    panel.hidden = false;
    body.textContent = "Pick a model first — click 🤖 AI Setup in the top nav.";
    return;
  }

  panel.hidden = false;
  body.textContent = `${provider.label} is thinking…`;
  btn.disabled = true;

  try {
    const text = await provider.generate({
      prompt: userMsg,
      systemMessage: ATHENA_GAMEPLAY_SYSTEM,
      jsonMode: false,
    });
    body.textContent = text || "(no response)";
  } catch (e) {
    body.textContent = `Couldn't reach ${provider.label}.\n\nError: ${e.message || e}`;
  } finally {
    btn.disabled = false;
  }
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

// ---------- AI Setup (orbit-explorer-style modal, Clique palette) ----------
//
// Three cloud providers + dynamically-discovered local OpenAI-compatible
// endpoints (configured by the user via the modal — no URLs hardcoded).
// One globally-selected provider is used everywhere (Build/Generate, Ask Athena).

const AI_STORAGE = {
  provider:   "clique.ai.provider",
  key:        (id) => `clique.ai.key.${id}`,
  endpoints:  "clique.ai.localEndpoints",
};

const AI_CLOUD_PROVIDERS = [
  {
    id: "anthropic", label: "Anthropic Claude",
    desc: "Your own key. Claude Sonnet — powerful and precise.",
    badge: "Own Key", badgeClass: "ai-badge-paid",
    placeholder: "sk-ant-…",
    keyHint: 'Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Stored only in your browser.',
  },
  {
    id: "gemini", label: "Gemini 2.0 Flash",
    desc: "Free tier via Google. Use a personal Gmail account.",
    badge: "Free", badgeClass: "ai-badge-free",
    placeholder: "AIza…",
    keyHint: 'Visit <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a> for a free key — <strong>use a personal Gmail, not a school account</strong>. Stored in your browser only.',
  },
  {
    id: "groq", label: "Groq (Llama 3.3)",
    desc: "Free tier. Any email — no Google account needed.",
    badge: "Free", badgeClass: "ai-badge-free",
    placeholder: "gsk_…",
    keyHint: 'Visit <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> for a free key — any email works. Stored in your browser only.',
  },
];

function getStoredProvider()        { return localStorage.getItem(AI_STORAGE.provider) || "none"; }
function setStoredProvider(id)      { localStorage.setItem(AI_STORAGE.provider, id); refreshHeaderIndicator(); }
function getStoredKey(id)           { return localStorage.getItem(AI_STORAGE.key(id)) || ""; }
function setStoredKey(id, key) {
  if (key) localStorage.setItem(AI_STORAGE.key(id), key);
  else     localStorage.removeItem(AI_STORAGE.key(id));
}
function getStoredLocalEndpoints() {
  try {
    const arr = JSON.parse(localStorage.getItem(AI_STORAGE.endpoints) || "[]");
    // Filter out any garbage (e.g., someone pasted an API key here once)
    return arr.filter(u => /^https?:\/\//i.test(String(u)));
  } catch { return []; }
}
function setStoredLocalEndpoints(arr) {
  localStorage.setItem(AI_STORAGE.endpoints, JSON.stringify(arr));
}

// "local:<endpoint>:<modelId>" — endpoint may contain colons, so modelId is after the LAST colon.
function parseLocalProvider(id) {
  if (!id || !id.startsWith("local:")) return null;
  const rest = id.slice("local:".length);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon === -1) return null;
  return { endpoint: rest.slice(0, lastColon), modelId: rest.slice(lastColon + 1) };
}

// In-memory cache of models discovered per endpoint: { [url]: [{id,label}, ...] }
const localModelsByEndpoint = {};

// Well-known ports for popular local LLM servers. Probed on modal open so users
// running these don't have to type a URL. The user still chooses — the result is
// surfaced as a one-click suggestion tile, not auto-saved.
const WELL_KNOWN_LOCAL_PORTS = [
  { url: "http://127.0.0.1:8765",  hint: "Athena / OpenAI-compatible shim" },
  { url: "http://127.0.0.1:11434", hint: "Ollama" },
  { url: "http://127.0.0.1:1234",  hint: "LM Studio" },
];

// Suggestions discovered this session: [{url, hint, models: [{id,label}]}]
let _suggestedLocalServers = [];

async function discoverModelsAt(url) {
  const trimmed = url.replace(/\/+$/, "");
  const probe = `${trimmed}/v1/models`;
  try {
    const res = await fetch(probe, { method: "GET" });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const models = (data.data || []).map(m => ({
      id: String(m.id),
      label: String(m.id),
    }));
    localModelsByEndpoint[url] = models;
    return models;
  } catch (e) {
    localModelsByEndpoint[url] = [];
    return [];
  }
}

async function refreshAllLocalModels() {
  const endpoints = getStoredLocalEndpoints();
  await Promise.all(endpoints.map(discoverModelsAt));
}

// Probe each well-known port (skipping those the user already saved) and
// populate _suggestedLocalServers with whatever responds. Re-renders on completion.
async function probeWellKnownLocalServers() {
  const saved = new Set(getStoredLocalEndpoints());
  const candidates = WELL_KNOWN_LOCAL_PORTS.filter(c => !saved.has(c.url));
  const settled = await Promise.all(candidates.map(async (c) => {
    try {
      const res = await fetch(`${c.url}/v1/models`, { method: "GET", signal: AbortSignal.timeout(1500) });
      if (!res.ok) return null;
      const data = await res.json();
      const models = (data.data || []).map(m => ({ id: String(m.id), label: String(m.id) }));
      if (!models.length) return null;
      return { url: c.url, hint: c.hint, models };
    } catch { return null; }
  }));
  _suggestedLocalServers = settled.filter(Boolean);
  renderProviderCards();
}

// Resolve the currently-selected provider to something with .generate({prompt,systemMessage,jsonMode}) and .label
function resolveActiveProvider() {
  const id = getStoredProvider();
  if (!id || id === "none") return null;
  const local = parseLocalProvider(id);
  if (local) {
    const trimmed = local.endpoint.replace(/\/+$/, "");
    return {
      label: local.modelId,
      generate: ({ prompt, systemMessage, jsonMode }) => callOpenAICompatible({
        url: `${trimmed}/v1/chat/completions`,
        key: "local",
        model: local.modelId,
        prompt, systemMessage, jsonMode,
      }),
    };
  }
  const cloud = AI_CLOUD_PROVIDERS.find(p => p.id === id);
  if (!cloud) return null;
  const key = getStoredKey(cloud.id);
  if (!key) return null;
  return {
    label: cloud.label,
    generate: ({ prompt, systemMessage, jsonMode }) => {
      if (cloud.id === "anthropic") return callAnthropic({ key, model: "claude-sonnet-4-6", prompt, systemMessage });
      if (cloud.id === "gemini")    return callGemini({ key, model: "gemini-2.0-flash", prompt, systemMessage, jsonMode });
      if (cloud.id === "groq")      return callOpenAICompatible({
        url: "https://api.groq.com/openai/v1/chat/completions",
        key, model: "llama-3.3-70b-versatile", prompt, systemMessage, jsonMode,
      });
      throw new Error(`Unknown cloud provider: ${cloud.id}`);
    },
  };
}

function activeProviderLabel() {
  const p = resolveActiveProvider();
  return p ? p.label : null;
}

function refreshHeaderIndicator() {
  const btn = $("#open-keys");
  if (!btn) return;
  if (resolveActiveProvider()) btn.classList.add("ai-active");
  else                          btn.classList.remove("ai-active");
}

// ---- AI Setup modal ----

let _showAddEndpoint = false;

function openAiModal() {
  _showAddEndpoint = false;
  _suggestedLocalServers = [];
  $("#ai-key-section").hidden = true;
  $("#ai-add-endpoint").hidden = true;
  $("#ai-modal-overlay").classList.add("open");
  renderProviderCards();
  refreshAllLocalModels().then(renderProviderCards);
  probeWellKnownLocalServers();  // background — re-renders on its own
}

function closeAiModal() {
  $("#ai-modal-overlay").classList.remove("open");
  $("#ai-key-input").value = "";
  $("#ai-endpoint-input").value = "";
  refreshHeaderIndicator();
}

function renderProviderCards() {
  const wrap = $("#ai-provider-cards");
  if (!wrap) return;
  const current = getStoredProvider();
  wrap.innerHTML = "";

  const addCard = (opts) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `ai-provider-card${opts.selected ? " selected" : ""}${opts.extra || ""}`;
    b.innerHTML = `
      <div class="ai-card-title">${escapeHtml(opts.title)}</div>
      <div class="ai-card-desc">${escapeHtml(opts.desc)}</div>
      ${opts.badge ? `<div class="ai-card-badge ${opts.badgeClass}">${escapeHtml(opts.badge)}</div>` : ""}
    `;
    b.onclick = opts.onClick;
    wrap.appendChild(b);
  };

  // No AI
  addCard({
    title: "No AI",
    desc: "Play and build without an AI thinking partner.",
    badge: "Off", badgeClass: "ai-badge-none",
    selected: current === "none",
    onClick: () => { setStoredProvider("none"); _showAddEndpoint = false; $("#ai-key-section").hidden = true; $("#ai-add-endpoint").hidden = true; renderProviderCards(); },
  });

  // Cloud providers
  for (const p of AI_CLOUD_PROVIDERS) {
    addCard({
      title: p.label,
      desc: p.desc,
      badge: p.badge, badgeClass: p.badgeClass,
      selected: current === p.id,
      onClick: () => {
        setStoredProvider(p.id);
        _showAddEndpoint = false;
        $("#ai-add-endpoint").hidden = true;
        showKeyEntry(p);
        renderProviderCards();
      },
    });
  }

  // Local model tiles
  for (const url of getStoredLocalEndpoints()) {
    const models = localModelsByEndpoint[url] || [];
    if (models.length === 0) {
      addCard({
        title: pretty(url),
        desc: "No models found yet — is this server running?",
        badge: "Local", badgeClass: "ai-badge-local",
        selected: false,
        onClick: () => discoverModelsAt(url).then(renderProviderCards),
      });
    } else {
      for (const m of models) {
        const provId = `local:${url}:${m.id}`;
        addCard({
          title: m.label,
          desc: `Runs on ${pretty(url)}.`,
          badge: "Local", badgeClass: "ai-badge-local",
          selected: current === provId,
          onClick: () => {
            setStoredProvider(provId);
            _showAddEndpoint = false;
            $("#ai-key-section").hidden = true;
            $("#ai-add-endpoint").hidden = true;
            renderProviderCards();
          },
        });
      }
    }
  }

  // Detected local servers (well-known ports that responded to a probe).
  // One-click: saves the endpoint AND selects its first model.
  for (const sug of _suggestedLocalServers) {
    const firstModel = sug.models[0];
    const provId = `local:${sug.url}:${firstModel.id}`;
    addCard({
      title: `Detected: ${pretty(sug.url)}`,
      desc: `${sug.hint} · ${firstModel.label}${sug.models.length > 1 ? ` (+${sug.models.length - 1} more)` : ""} · click to add`,
      badge: "Local", badgeClass: "ai-badge-local",
      extra: " add-server",
      onClick: () => {
        const list = getStoredLocalEndpoints();
        if (!list.includes(sug.url)) {
          list.push(sug.url);
          setStoredLocalEndpoints(list);
        }
        localModelsByEndpoint[sug.url] = sug.models;
        setStoredProvider(provId);
        _suggestedLocalServers = _suggestedLocalServers.filter(s => s.url !== sug.url);
        $("#ai-key-section").hidden = true;
        $("#ai-add-endpoint").hidden = true;
        renderProviderCards();
      },
    });
  }

  // + Add local server
  addCard({
    title: "+ Add local server",
    desc: "Connect to an OpenAI-compatible LLM on your machine or network.",
    extra: " add-server",
    onClick: () => {
      _showAddEndpoint = true;
      $("#ai-key-section").hidden = true;
      $("#ai-add-endpoint").hidden = false;
      setTimeout(() => $("#ai-endpoint-input")?.focus(), 0);
    },
  });
}

function pretty(url) {
  return String(url).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function showKeyEntry(provider) {
  const hasStored = !!getStoredKey(provider.id);
  $("#ai-key-input").value = "";
  $("#ai-key-input").placeholder = hasStored
    ? `Key saved · type to replace · ${provider.placeholder}`
    : provider.placeholder;
  $("#ai-key-hint").innerHTML = provider.keyHint;
  $("#ai-key-section").hidden = false;
  $("#ai-add-endpoint").hidden = true;
  setTimeout(() => $("#ai-key-input")?.focus(), 0);
}

function commitKeyEntry() {
  const id = getStoredProvider();
  const cloud = AI_CLOUD_PROVIDERS.find(p => p.id === id);
  if (!cloud) return;
  const v = $("#ai-key-input").value.trim();
  if (v) setStoredKey(cloud.id, v);
  $("#ai-key-input").value = "";
}

function commitNewEndpoint() {
  const raw = $("#ai-endpoint-input").value.trim();
  if (!/^https?:\/\//i.test(raw)) return;
  const clean = raw.replace(/\/+$/, "");
  const list = getStoredLocalEndpoints();
  if (!list.includes(clean)) {
    list.push(clean);
    setStoredLocalEndpoints(list);
  }
  $("#ai-endpoint-input").value = "";
  _showAddEndpoint = false;
  $("#ai-add-endpoint").hidden = true;
  discoverModelsAt(clean).then(renderProviderCards);
}

function bindAiUI() {
  const openBtn = $("#open-keys");
  if (openBtn) openBtn.addEventListener("click", (e) => { e.preventDefault(); openAiModal(); });

  const overlay = $("#ai-modal-overlay");
  if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) { commitKeyEntry(); closeAiModal(); } });

  $("#ai-modal-done")?.addEventListener("click", () => { commitKeyEntry(); closeAiModal(); });

  $("#ai-key-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { commitKeyEntry(); closeAiModal(); }
    else if (e.key === "Escape") { $("#ai-key-input").value = ""; closeAiModal(); }
  });
  $("#ai-key-input")?.addEventListener("blur", commitKeyEntry);

  $("#ai-endpoint-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitNewEndpoint();
    else if (e.key === "Escape") {
      $("#ai-endpoint-input").value = "";
      _showAddEndpoint = false;
      $("#ai-add-endpoint").hidden = true;
    }
  });

  // Generate modal
  const genOverlay = $("#gen-modal-overlay");
  if (genOverlay) genOverlay.addEventListener("click", (e) => { if (e.target === genOverlay) closeGenerateModal(); });
  $("#gen-cancel")?.addEventListener("click", closeGenerateModal);
  $("#gen-change")?.addEventListener("click", (e) => { e.preventDefault(); closeGenerateModal(); openAiModal(); });
  $("#gen-go")?.addEventListener("click", runGenerate);

  refreshHeaderIndicator();
}

// ---- Generate dialog ----

function openGenerateDialog() {
  const provider = resolveActiveProvider();
  const usingEl = $("#gen-using");
  if (provider) {
    usingEl.innerHTML = `Using: <strong>${escapeHtml(provider.label)}</strong> · <a href="#" id="gen-change">change in AI Setup</a>`;
  } else {
    usingEl.innerHTML = `No model selected — <a href="#" id="gen-change">choose one in AI Setup</a>.`;
  }
  // Re-bind the (possibly recreated) "change" link
  $("#gen-change")?.addEventListener("click", (e) => { e.preventDefault(); closeGenerateModal(); openAiModal(); });

  $("#gen-topic").value = "";
  $("#gen-status").textContent = "";
  $("#gen-modal-overlay").classList.add("open");
  setTimeout(() => $("#gen-topic")?.focus(), 0);
}

function closeGenerateModal() {
  $("#gen-modal-overlay").classList.remove("open");
}

async function runGenerate() {
  const provider = resolveActiveProvider();
  if (!provider) {
    $("#gen-status").textContent = "Pick a model first via 🤖 AI Setup.";
    return;
  }
  const fd = new FormData($("#build-form"));
  const language = String(fd.get("language") || "");
  const subject = String(fd.get("subject") || "");
  const grade = String(fd.get("grade") || "");
  const formTopic = String(fd.get("topic") || "");
  if (!language || !subject || !grade) {
    $("#gen-status").textContent = "Choose language, subject, and grade level on the form first.";
    return;
  }
  const topicHint = $("#gen-topic").value.trim();
  const prompt = buildPrompt({ language, subject, grade, topicHint, formTopic });

  $("#gen-go").disabled = true;
  $("#gen-status").textContent = `Generating with ${provider.label}… this can take 5–20 seconds.`;
  try {
    const text = await provider.generate({ prompt, jsonMode: true });
    const puzzle = parsePuzzleJSON(text);
    const topic = formTopic || (TOPICS.find(t => t.id === puzzle.topic) ? puzzle.topic : "");
    fillBuildFormFromPuzzle({ ...puzzle, language, subject, grade, topic });
    $("#gen-status").textContent = "✓ Generated — review and edit before submitting.";
    setTimeout(closeGenerateModal, 600);
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

async function callOpenAICompatible({ url, key, model, prompt, systemMessage, jsonMode = true }) {
  const sys = systemMessage || "You are a careful, school-appropriate puzzle author. Return only JSON when asked.";
  const body = {
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
    temperature: 0.8,
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini({ key, model, prompt, systemMessage, jsonMode = true }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8 },
  };
  if (jsonMode) body.generationConfig.responseMimeType = "application/json";
  if (systemMessage) body.systemInstruction = { parts: [{ text: systemMessage }] };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAnthropic({ key, model, prompt, systemMessage }) {
  const sys = systemMessage || "You are a careful, school-appropriate puzzle author. Return only JSON when asked.";
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
      system: sys,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// boot
bindAiUI();
route();
