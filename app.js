// Connections Builder - vanilla JS, no build step
// Repo for "submit to repo" flow:
const REPO_OWNER = "ohiomathteacher";
const REPO_NAME = "connections";
const REPO_BRANCH = "main";
const DIFFICULTIES = ["yellow", "green", "blue", "purple"];

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
  return renderHome();
}

window.addEventListener("hashchange", route);

// ---------- Home ----------

async function renderHome() {
  renderTemplate("view-home");
  const list = $("#puzzle-list");
  try {
    const res = await fetch("puzzles/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("index.json missing");
    const items = await res.json();
    if (!items.length) {
      list.innerHTML = `<li class="loading">No puzzles yet — be the first to <a href="#/build">build one</a>.</li>`;
      return;
    }
    list.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="#/play/${encodeURIComponent(it.slug)}">${escapeHtml(it.title)}<span class="meta">${escapeHtml(it.author || "anonymous")}</span></a>`;
      list.appendChild(li);
    }
  } catch (e) {
    list.innerHTML = `<li class="loading">No puzzles found yet. <a href="#/build">Build one →</a></li>`;
  }
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
    const indexUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/edit/${REPO_BRANCH}/puzzles/index.json`;
    const out = $("#build-output");
    out.innerHTML = `
      <h3>Submit to repo</h3>
      <ol>
        <li><a href="${url}" target="_blank" rel="noopener">Open the pre-filled new-file page</a> on GitHub. Click "Propose new file" at the bottom — that opens a pull request (or commits directly if you're a maintainer).</li>
        <li>Then <a href="${indexUrl}" target="_blank" rel="noopener">edit puzzles/index.json</a> and add an entry: <code>{"slug":"${escapeHtml(slug)}","title":"${escapeHtml(p.title)}","author":"${escapeHtml(p.author || "")}"}</code></li>
      </ol>
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
    groups,
  };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "puzzle";
}

// ---------- About ----------

function renderAbout() {
  renderTemplate("view-about");
  const link = $("#repo-link");
  if (link) link.href = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
}

// boot
route();
