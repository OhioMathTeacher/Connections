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
const SUBJECTS = ["Science", "Math", "Social Studies", "Language Arts", "Mixed"];
const GRADES = ["7-8", "9-10", "11-12"];

function languageLabel(code) {
  return (LANGUAGES.find(l => l.code === code) || {}).label || code || "—";
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
  if (hash === "#/review") return renderReview();
  if (hash.startsWith("#/review/")) {
    const num = hash.slice("#/review/".length);
    return renderReviewPR(num);
  }
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
      li.innerHTML = `<a href="#/play/${encodeURIComponent(it.slug)}">
        <div class="row-title">${escapeHtml(it.title)}</div>
        <div class="meta">${escapeHtml(it.author || "anonymous")} ${badges}</div>
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
  $("#play-title").textContent = puzzle.title || "Untitled";
  $("#play-author").textContent = puzzle.author ? `by ${puzzle.author}` : "";

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
}

function drawBoard(state) {
  const grid = $("#grid");
  const solved = $("#solved");
  grid.innerHTML = "";
  solved.innerHTML = "";

  for (const gi of state.solvedGroups) {
    const g = state.puzzle.groups[gi];
    const row = document.createElement("div");
    row.className = "solved-row " + DIFFICULTIES[gi];
    row.innerHTML = `<div class="cat">${escapeHtml(g.category)}</div><div class="words">${g.words.map(w => escapeHtml(w.toUpperCase())).join(", ")}</div>`;
    solved.appendChild(row);
  }

  for (const item of state.remaining) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile" + (state.selected.has(item.word) ? " selected" : "");
    btn.textContent = item.word;
    btn.disabled = state.over;
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
      setMessage(`Solved with ${state.mistakes} mistake${state.mistakes === 1 ? "" : "s"}! 🎉`, "win");
    } else {
      setMessage("Nice!", "win");
    }
    return;
  }

  state.mistakes++;
  const max = Math.max(...Object.values(counts));
  $$(".tile").forEach(t => {
    if (state.selected.has(t.textContent)) t.classList.add("shake");
  });
  setTimeout(() => $$(".tile.shake").forEach(t => t.classList.remove("shake")), 450);

  if (state.mistakes >= state.maxMistakes) {
    state.over = true;
    // reveal remaining
    const remainingGroups = [0,1,2,3].filter(gi => !state.solvedGroups.includes(gi));
    state.solvedGroups.push(...remainingGroups);
    state.remaining = [];
    drawBoard(state);
    setMessage("Out of guesses. Better luck next time!", "lose");
  } else if (max === 3) {
    setMessage("One away…", "hint");
    drawMistakes(state);
  } else {
    setMessage("Not quite.", "hint");
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
  $("#btn-preview").onclick = () => {
    const p = readForm();
    if (!p) return;
    renderPlay(p);
  };
  $("#btn-share-link").onclick = () => {
    const p = readForm();
    if (!p) return;
    const json = JSON.stringify(p);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const url = `${location.origin}${location.pathname}#/play/inline/${encodeURIComponent(b64)}`;
    const out = $("#build-output");
    out.innerHTML = `<p><strong>Share this link:</strong></p><p><a href="${url}">${escapeHtml(url)}</a></p><p class="muted">Anyone with this link can play. Note: the answer is encoded in the URL, so a curious player could decode it.</p>`;
  };
  $("#btn-submit-repo").onclick = () => {
    const p = readForm();
    if (!p) return;
    const slug = slugify(p.title);
    const filename = `puzzles/${slug}.json`;
    const content = JSON.stringify(p, null, 2) + "\n";
    const url = `https://github.com/${REPO_OWNER}/${REPO_NAME}/new/${REPO_BRANCH}?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(content)}`;
    const out = $("#build-output");
    out.innerHTML = `
      <h3>Submit to repo</h3>
      <p><a href="${url}" target="_blank" rel="noopener">Open the pre-filled new-file page on GitHub →</a></p>
      <p class="muted">Click "Propose new file" / "Commit changes". A maintainer will review your puzzle on the Review page and merge it. Once merged, it appears on the Play list automatically — no other steps needed.</p>
      <details><summary>Or copy the JSON manually</summary><pre>${escapeHtml(content)}</pre></details>
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
  // Check for duplicate words across the whole puzzle
  const all = groups.flatMap(g => g.words);
  const dup = all.find((w, i) => all.indexOf(w) !== i);
  if (dup) {
    alert(`Duplicate word: ${dup}. Each word must be unique.`);
    return null;
  }
  return {
    title: String(fd.get("title")).trim(),
    author: String(fd.get("author") || "").trim(),
    language: String(fd.get("language") || "").trim(),
    subject: String(fd.get("subject") || "").trim(),
    grade: String(fd.get("grade") || "").trim(),
    groups,
  };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "puzzle";
}

// ---------- Review ----------

async function renderReview() {
  renderTemplate("view-review");
  const list = $("#review-list");
  list.innerHTML = `<li class="loading">Loading open pull requests…</li>`;
  try {
    const prs = await fetchPuzzlePRs();
    if (!prs.length) {
      list.innerHTML = `<li class="loading">No pending puzzle submissions. 🎉</li>`;
      return;
    }
    list.innerHTML = "";
    for (const pr of prs) {
      const li = document.createElement("li");
      const fileNames = pr.puzzleFiles.map(f => f.filename).join(", ");
      li.innerHTML = `
        <div class="pr-row">
          <div class="pr-info">
            <a href="#/review/${pr.number}"><strong>#${pr.number}: ${escapeHtml(pr.title)}</strong></a>
            <div class="meta">by ${escapeHtml(pr.user.login)} · ${escapeHtml(fileNames)}</div>
          </div>
          <div class="pr-actions">
            <a href="${pr.html_url}" target="_blank" rel="noopener">View on GitHub →</a>
          </div>
        </div>`;
      list.appendChild(li);
    }
  } catch (e) {
    list.innerHTML = `<li class="loading">Couldn't load PRs. ${escapeHtml(e.message || "")}</li>`;
  }
}

async function fetchPuzzlePRs() {
  const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=open&per_page=50`, {
    headers: { "Accept": "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const prs = await res.json();
  const enriched = await Promise.all(prs.map(async (pr) => {
    try {
      const fr = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pr.number}/files`, {
        headers: { "Accept": "application/vnd.github+json" },
      });
      if (!fr.ok) return null;
      const files = await fr.json();
      const puzzleFiles = files.filter(f =>
        /^puzzles\/[^/]+\.json$/.test(f.filename) &&
        !f.filename.endsWith("index.json") &&
        f.status !== "removed"
      );
      if (!puzzleFiles.length) return null;
      return { ...pr, puzzleFiles };
    } catch (e) {
      return null;
    }
  }));
  return enriched.filter(Boolean);
}

async function renderReviewPR(num) {
  app.innerHTML = `<p>Loading PR #${escapeHtml(num)}…</p>`;
  try {
    const fr = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${num}/files`, {
      headers: { "Accept": "application/vnd.github+json" },
    });
    if (!fr.ok) throw new Error(`GitHub API ${fr.status}`);
    const files = await fr.json();
    const puzzleFiles = files.filter(f =>
      /^puzzles\/[^/]+\.json$/.test(f.filename) &&
      !f.filename.endsWith("index.json") &&
      f.status !== "removed"
    );
    if (!puzzleFiles.length) {
      app.innerHTML = `<p>No puzzle JSON found in this PR. <a href="#/review">Back</a></p>`;
      return;
    }
    // Fetch raw content for first puzzle file
    const f = puzzleFiles[0];
    const raw = await fetch(f.raw_url);
    if (!raw.ok) throw new Error("Couldn't load raw file");
    const puzzle = await raw.json();
    const prUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/pull/${num}`;

    // Render a header + the play view below it
    const header = document.createElement("section");
    header.className = "review-header";
    header.innerHTML = `
      <p><a href="#/review">← Back to review queue</a></p>
      <p class="muted">Reviewing <strong>${escapeHtml(f.filename)}</strong> from PR #${escapeHtml(num)}.
      <a href="${prUrl}" target="_blank" rel="noopener">Open PR on GitHub</a> to merge or close.</p>
    `;
    app.replaceChildren(header);
    // Append a play view inline
    const playRoot = document.createElement("div");
    app.appendChild(playRoot);
    // Render the play template into a sub-container
    const tpl = document.getElementById("view-play");
    playRoot.appendChild(tpl.content.cloneNode(true));
    // Re-init play with this puzzle (uses global $ which queries document)
    initPlay(puzzle);

    // Show JSON for sanity check
    const dump = document.createElement("details");
    dump.innerHTML = `<summary>Show raw JSON</summary><pre>${escapeHtml(JSON.stringify(puzzle, null, 2))}</pre>`;
    app.appendChild(dump);
  } catch (e) {
    app.innerHTML = `<p>Couldn't load PR: ${escapeHtml(e.message || "")} <a href="#/review">Back</a></p>`;
  }
}

// ---------- About ----------

function renderAbout() {
  renderTemplate("view-about");
  const link = $("#repo-link");
  if (link) link.href = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
}

// boot
route();
