// contents of file
let currentClubCell = null;
let currentGridCell = null;
let currentMode = "manual";
let topClubs = [];
let leftClubs = [];
let gridState = [
    [null, null, null],
    [null, null, null],
    [null, null, null]
];
let usedClubs = new Set();
let usedPlayers = new Set();

let categoriesData = null;
let CategoriesToIds  = null;
let playerIdList = null; // array of player objects
let playerIdMap = {}; // idString → player object
let allAvailablePlayerIds = null; // array of all player ID strings
let categoryPlayersMap = {}; // category → Set of player ID strings

let nationsList = [];
let otherList = [];

let scoreX = 0;
let scoreO = 0;

let ticTurn = "X";

function updateTurnInfo() {
    const symbolImg = ticTurn === "X"
        ? `<img src="symbols/x.png" alt="X" class="turn-img"/>`
        : `<img src="symbols/o.png" alt="O" class="turn-img"/>`;
    document.getElementById("turn-info").innerHTML =
        `<span class="turn-label">Turn:</span> ${symbolImg}`;
}
updateTurnInfo();

function updateScoreInfo() {
    const xImg = `<img src="symbols/x.png" alt="X" class="turn-img"/>`;
    const oImg = `<img src="symbols/o.png" alt="O" class="turn-img"/>`;
    document.getElementById("score-info").innerHTML =
        `${xImg} ${scoreX} - ${scoreO} ${oImg}`;
}

updateScoreInfo();

document.getElementById("skip-turn-btn").onclick = function() {
    ticTurn = ticTurn === "X" ? "O" : "X";
    updateTurnInfo();
};

function normalizeStr(str) {
    return (str || "").normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Helper: normalize category input (accepts string or object {category,name,display})
function normalizeCategory(cat) {
    if (!cat && cat !== "") return "CHOOSE CATEGORY";
    if (typeof cat === "string") return cat;
    if (typeof cat === "object") {
        return cat.category || cat.name || cat.display || "CHOOSE CATEGORY";
    }
    return String(cat);
}

// --- DATA LOADERS ---
let dataReadyPromise = (async function preloadData() {
    await Promise.all([
        fetchCategories(),
        fetchCategoriesToIds(),
        fetchPlayerIdList()
    ]);
    extractSpecialListsFromCategories();
    buildCategoryPlayersMap();
    await prepareAllAvailablePlayers();
})();

async function fetchCategories() {
    if (!categoriesData) {
        const res = await fetch("data/categories.json");
        categoriesData = await res.json();
    }
    return categoriesData;
}
async function fetchCategoriesToIds() {
    if (!CategoriesToIds) {
        const res = await fetch("data/categories_to_ids.json");
        CategoriesToIds = await res.json();
    }
    return CategoriesToIds;
}
async function fetchPlayerIdList() {
    if (!playerIdList) {
        const res = await fetch("data/players_ids.json");
        const data = await res.json();

        playerIdMap = {};
        playerIdList = [];

        if (Array.isArray(data)) {
            // Stari format: [ { id: 1, name: "...", ... }, ... ]
            for (const p of data) {
                const idStr = String(p.id);
                const playerObj = Object.assign({}, p, { id: idStr });
                playerObj.normalized_name = playerObj.normalized_name || normalizeStr(playerObj.name || "");
                playerIdMap[idStr] = playerObj;
                playerIdList.push(playerObj);
            }
        } else if (data && typeof data === "object") {
            // Novi format: { "1": { name: "...", normalized_name: "..." }, "2": {...} }
            for (const [id, p] of Object.entries(data)) {
                const idStr = String(id);
                const playerObj = Object.assign({ id: idStr }, p);
                playerObj.normalized_name = playerObj.normalized_name || normalizeStr(playerObj.name || "");
                playerIdMap[idStr] = playerObj;
                playerIdList.push(playerObj);
            }
        } else {
            // neočekivan format -> ostavi prazno
            playerIdList = [];
            playerIdMap = {};
        }
    }
    return playerIdList;
}

async function prepareAllAvailablePlayers() {
    await fetchPlayerIdList();
    allAvailablePlayerIds = Object.keys(playerIdMap).slice(); // niz stringova "1","2",...
}

function extractSpecialListsFromCategories() {
    nationsList = Array.isArray(categoriesData.nations) ? categoriesData.nations : [];
    otherList = Array.isArray(categoriesData.other) ? categoriesData.other : [];
}

// Robustna izgradnja categoryPlayersMap (zamijeni postojeću)
function buildCategoryPlayersMap() {
    categoryPlayersMap = {};

    // 1) Privremeno sakupljanje po kanoničkom (trimiranom) nazivu
    const temp = {}; // canonicalName -> Set(ids)
    for (const [groupName, groupObj] of Object.entries(CategoriesToIds || {})) {
        if (!groupObj) continue;
        for (const [rawCat, ids] of Object.entries(groupObj || {})) {
            const canonical = String(rawCat).trim();
            if (!temp[canonical]) temp[canonical] = new Set();
            for (const pid of (ids || [])) {
                // trim i string da uklonimo whitespace / tip mismatch
                temp[canonical].add(String(pid).trim());
            }
        }
    }

    // 2) Popuni categoryPlayersMap s više varijanata ključeva koji referenciraju isti set
    for (const canonical of Object.keys(temp)) {
        const set = temp[canonical];
        // canonical form (exact, trimmed)
        categoryPlayersMap[canonical] = set;
        // normalized (no diacritics, lowercase)
        categoryPlayersMap[normalizeStr(canonical)] = set;
        // lowercase trimmed
        categoryPlayersMap[canonical.toLowerCase()] = set;
        // also map common display variants for winners/competitions
        const played = ("Played in " + canonical).trim();
        const won = ("Won " + canonical).trim();
        categoryPlayersMap[played] = set;
        categoryPlayersMap[won] = set;
        // also normalized/display variants
        categoryPlayersMap[normalizeStr(played)] = set;
        categoryPlayersMap[normalizeStr(won)] = set;
        categoryPlayersMap[played.toLowerCase()] = set;
        categoryPlayersMap[won.toLowerCase()] = set;
    }
}

function getCanonicalKey(raw) {
    if (raw === undefined || raw === null) return null;
    let s = raw;
    if (typeof raw === "object") {
        s = raw.category || raw.name || raw.display || "";
    }
    s = String(s).trim();
    if (s === "" || s === "CHOOSE CATEGORY") return "CHOOSE CATEGORY";

    // 1) direktna (trimirana) provjera
    if (categoryPlayersMap[s]) return s;
    // 2) normalized
    const ns = normalizeStr(s);
    if (categoryPlayersMap[ns]) return ns;
    // 3) lowercase
    const ls = s.toLowerCase();
    if (categoryPlayersMap[ls]) return ls;
    // 4) common display prefixes stripped (npr. "Won X" -> "X")
    const low = s.toLowerCase();
    if (low.startsWith("won ")) {
        const rest = s.slice(4).trim();
        if (categoryPlayersMap[rest]) return rest;
        const nrest = normalizeStr(rest);
        if (categoryPlayersMap[nrest]) return nrest;
    }
    if (low.startsWith("played in ")) {
        const rest = s.slice(10).trim();
        if (categoryPlayersMap[rest]) return rest;
        const nrest = normalizeStr(rest);
        if (categoryPlayersMap[nrest]) return nrest;
    }
    // 5) last resort: try adding display prefixes
    const played = ("Played in " + s).trim();
    if (categoryPlayersMap[played]) return played;
    const won = ("Won " + s).trim();
    if (categoryPlayersMap[won]) return won;
    const nplayed = normalizeStr(played);
    if (categoryPlayersMap[nplayed]) return nplayed;
    const nwon = normalizeStr(won);
    if (categoryPlayersMap[nwon]) return nwon;

    return s; // may not exist in map
}

function lookupSetFor(raw) {
    const key = getCanonicalKey(raw);
    if (!key || key === "CHOOSE CATEGORY") return null;
    return categoryPlayersMap[key] || null;
}


// --- Fetch categories (was clubs) ---
async function fetchCategoriesList(mode = null) {
    await fetchCategories();
    await fetchCategoriesToIds();

    const easy = new Set(categoriesData.easy || []);
    const hnl = new Set(categoriesData.hnl || []);

    const allCats = new Set([
        ...Object.keys(CategoriesToIds.clubs || {}),
        ...Object.keys(CategoriesToIds.nations || {}),
        ...Object.keys(CategoriesToIds.managers || {}),
        ...Object.keys(CategoriesToIds.winners || {}),
        ...Object.keys(CategoriesToIds.competitions || {})
    ]);

    let result = [];

    if (mode === "easy" || mode === "random-easy") {
        result = [
            ...easy,
            ...Object.keys(CategoriesToIds.winners || {}),
            ...Object.keys(CategoriesToIds.competitions || {})
        ];
    }
    else if (mode === "hard" || mode === "random-hard") {
        result = [...allCats].filter(c => !hnl.has(c));
    }
    else if (mode === "croatian-league") {
        result = [
            ...Array.from(hnl).map(name => ({ name })),
            ...Object.keys(CategoriesToIds.nations || {}).map(name => ({ name }))
        ];
    }
    else {
        result = [...easy];
    }


    return result
        .map(r => typeof r === "string" ? { name: r } : r)
        .filter((v, i, arr) => arr.findIndex(x => x.name === v.name) === i)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}


// Return true if there's at least one shared player between two categories
function categoriesHaveIntersectionSync(catA, catB) {
    // treat CHOOSE CATEGORY as wildcard (unknown) => consider valid
    const a = normalizeCategory(catA);
    const b = normalizeCategory(catB);
    if (!a || !b || a === "CHOOSE CATEGORY" || b === "CHOOSE CATEGORY") return true;
    const setA = categoryPlayersMap[a];
    const setB = categoryPlayersMap[b];
    if (!setA || !setB) return false;
    for (const playerId of setA) {
        if (setB.has(playerId)) return true;
    }
    return false;
}

function gridIsPlayable(top, left) {
    // top/left mogu biti stringovi ili objekti
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const topRaw = top[c];
            const leftRaw = left[r];
            const topKey = getCanonicalKey(topRaw);
            const leftKey = getCanonicalKey(leftRaw);

            // ako je jedna strana CHOOSE -> ignoriraj (manual mod)
            if (topKey === "CHOOSE CATEGORY" || leftKey === "CHOOSE CATEGORY") continue;

            const setA = lookupSetFor(topRaw);
            const setB = lookupSetFor(leftRaw);

            if (!setA || !setB) {
                // nema podataka za neku kategoriju => neigrivo
                return false;
            }

            let hasAny = false;
            // iterate smaller set first for perf
            if (setA.size < setB.size) {
                for (const pid of setA) {
                    if (setB.has(pid)) { hasAny = true; break; }
                }
            } else {
                for (const pid of setB) {
                    if (setA.has(pid)) { hasAny = true; break; }
                }
            }
            if (!hasAny) return false;
        }
    }
    return true;
}

// POMOĆNE FUNKCIJE: pronađi kojoj grupi pripada kategorija
function findCategoryGroup(name) {
    if (!name) return null;
    const s = String(name).trim();
    // pretraži u CategoriesToIds po grupama
    for (const group of ['clubs','nations','managers','winners','competitions']) {
        if (CategoriesToIds && CategoriesToIds[group] && Object.prototype.hasOwnProperty.call(CategoriesToIds[group], s)) {
            return group;
        }
    }
    // pokušaj normalized lookup (ako ključevi u mapama normalizirani)
    const ns = normalizeStr(s);
    for (const group of ['clubs','nations','managers','winners','competitions']) {
        if (CategoriesToIds && CategoriesToIds[group]) {
            for (const key of Object.keys(CategoriesToIds[group])) {
                if (normalizeStr(key) === ns) return group;
            }
        }
    }
    return null;
}

// Vraća "težinu" (weight) za group ovisno o modu
function getWeightForGroup(group, mode) {
    // default weights
    const defaultWeights = {
        clubs: 2,
        nations: 1,
        managers: 1,
        winners: 1,
        competitions: 1,
        other: 1
    };

    if (mode === 'croatian-league') {
        return {
            clubs: 4,
            nations: 1,
            managers: 1,
            winners: 1,
            competitions: 1,
            other: 1
        }[group] || 1;
    }

    if (mode === 'random-easy') {
        return {
            clubs: 3,
            nations: 1,
            managers: 1,
            winners: 1,
            competitions: 1,
            other: 1
        }[group] || 1;
    }

    if (mode === 'random-hard') {
        return {
            clubs: 3,
            nations: 1,
            managers: 1,
            winners: 1,
            competitions: 1,
            other: 1
        }[group] || 1;
    }

    // HNL mode/other random modes: prefer clubs modestly
    return defaultWeights[group] || defaultWeights.other;
}

// Weighted sampling without replacement (items is array of unique names)
function pickWeightedUnique(items, weightsMap, n) {
    const chosen = [];
    const remaining = new Set(items);
    // clone weights for remaining items
    const weightFor = key => Math.max(0, Number(weightsMap[key] || 1));
    while (chosen.length < n && remaining.size > 0) {
        // compute total weight among remaining
        let total = 0;
        for (const it of remaining) total += weightFor(it);
        if (total <= 0) break;
        let r = Math.random() * total;
        let picked = null;
        for (const it of remaining) {
            r -= weightFor(it);
            if (r <= 0) { picked = it; break; }
        }
        if (!picked) {
            // fallback: pick any remaining
            picked = remaining.values().next().value;
        }
        chosen.push(picked);
        remaining.delete(picked);
    }
    return chosen;
}

// zamijeni staru funkciju; sada prima i mode (string)
function getRandomValidCategoriesSync(categoriesList, mode = null) {
    // categoriesList može biti niz stringova ili objekata s .name
    const allNames = categoriesList
        .map(c => (typeof c === 'object' ? (c.name || c.category || c.display) : String(c)))
        .filter(Boolean);

    // deduplicate by normalized name but keep original form
    const mapByNorm = new Map();
    for (const name of allNames) {
        const nk = normalizeStr(name);
        if (!mapByNorm.has(nk)) mapByNorm.set(nk, name);
    }
    const unique = Array.from(mapByNorm.values());

    if (unique.length < 6) {
        const fallback = unique.slice(0, 6);
        return { top: fallback.slice(0,3), left: fallback.slice(3,6).concat([]).slice(0,3) };
    }

    // build weights map per item (by group)
    const weights = {};
    for (const name of unique) {
        const group = findCategoryGroup(name) || 'other';
        weights[name] = getWeightForGroup(group, mode);
    }

    const perCycleAttempts = 200;
    const timeLimitMs = 10000;
    const start = Date.now();

    // helper: quick check
    const isPlayable = (top, left) => {
        try { return gridIsPlayable(top, left); }
        catch (e) { return false; }
    };

    let cycles = 0;
    while (timeLimitMs === null || (Date.now() - start) < timeLimitMs) {
        cycles++;
        for (let attempt = 0; attempt < perCycleAttempts; attempt++) {
            // pick 6 distinct names weighted by weights
            const six = pickWeightedUnique(unique, weights, 6);
            if (six.length < 6) continue;
            const top = six.slice(0,3);
            const left = six.slice(3,6);

            if (isPlayable(top, left)) {
                // return raw strings (will be canonicalized later into display objects)
                return {
                    top: top.map(x => x),
                    left: left.map(x => x)
                };
            }
        }
        if (cycles % 5 === 0) console.debug(`getRandomValidCategoriesSync: ${cycles} cycles of ${perCycleAttempts} attempts done for mode=${mode}; still searching...`);
    }

    console.warn("getRandomValidCategoriesSync: could not find playable combination within time limit. Returning fallback.");
    const fallback = unique.slice(0, 6);
    return {
        top: fallback.slice(0,3),
        left: fallback.slice(3,6).concat([]).slice(0,3)
    };
}


async function fetchCategoryPositions(mode = "manual") {
    if (mode === "manual") {
        return {
            top: ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"],
            left: ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"]
        };
    }

    let cats = await fetchCategoriesList(mode);
    // fetchCategoriesList već vraća niz objekata {name}
    const catNames = cats.map(c => (c && (c.name || c)) || c).filter(Boolean).sort(() => Math.random() - 0.5);

    // get random valid as strings (may be winners/competitions names)
    const raw = getRandomValidCategoriesSync(catNames, mode);

    // convert to items that setClubCellWithBadgeAndName expects:
    // If category belongs to 'winners' -> display "Won X", competitions -> "Played in X"
    function makeItem(name) {
        const group = findCategoryGroup(name);
        if (group === 'winners') return { category: name, display: `Won ${name}` };
        if (group === 'competitions') return { category: name, display: `Played in ${name}` };
        if (group === 'managers') return { category: name, display: name };
        // clubs/nations/other -> display name
        return { category: name, display: name };
    }

    const topItems = raw.top.map(makeItem);
    const leftItems = raw.left.map(makeItem);

    // But renderClubs expects arrays of category strings in topClubs/leftClubs (we earlier used category strings).
    // To keep compatibility, return plain strings but also set display objects inside renderClubs when needed.
    // We'll return strings (category names) but also expose a map for display when setting badges.
    // For simplicity return strings (renderClubs will call setClubCellWithBadgeAndName which supports object)
    // So here return arrays of item objects:
    return {
        top: topItems,
        left: leftItems
    };
}

function setClubCellWithBadgeAndName(cell, item) {
    const category = (item && (item.category || item.name)) || item;
    const display = (item && (item.display || item.name)) || item;
    cell.innerHTML = "";

    if (category === "CHOOSE CATEGORY") {
        cell.innerHTML = '<span class="choose-category-text">CHOOSE CATEGORY</span>';
        return;
    }

    const img = document.createElement("img");

    // ⭐ FIX: managers ALWAYS default badge
    if (
        Object.keys(CategoriesToIds.managers || {}).includes(category)
    ) {
        img.src = "badges/default.png";
    } else {
        img.src = `badges/${String(category).toLowerCase()}.png`;
        img.onerror = function () {
            this.src = "badges/default.png";
        };
    }

    img.alt = display;
    img.title = display;
    img.className = "club-badge";

    const span = document.createElement("span");
    span.className = "club-name-under-badge";
    span.textContent = display;

    cell.appendChild(img);
    cell.appendChild(span);
}


async function renderClubs(mode = "manual") {
    let clubCellsTop = [0,1,2].map(i => document.querySelector('.club-cell.top-' + i));
    let clubCellsLeft = [0,1,2].map(i => document.querySelector('.club-cell.left-' + i));
    usedClubs = new Set();

    if (mode === "manual") {
        topClubs = ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"];
        leftClubs = ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"];
        clubCellsTop.forEach((cell, i) => setClubCellWithBadgeAndName(cell, "CHOOSE CATEGORY"));
        clubCellsLeft.forEach((cell, i) => setClubCellWithBadgeAndName(cell, "CHOOSE CATEGORY"));
        document.querySelectorAll('.club-cell.top, .club-cell.left').forEach(cell => {
            const clubName = cell.textContent.trim();
            // Only set .onclick and pointer if "CHOOSE CATEGORY"
            if (clubName === "CHOOSE CATEGORY") {
                cell.onclick = function() {
                    currentClubCell = cell;
                    populateClubModal();
                    showModal(clubModal);
                    clubList.scrollTop = 0; 
                };
                cell.style.cursor = "pointer";
            } else {
                cell.onclick = null;
                cell.style.cursor = "default";
            }
        });
    } else {
        let data = await fetchCategoryPositions(mode);
        topClubs = data.top.map(it => (it && (it.category || it.name)) || it);
        leftClubs = data.left.map(it => (it && (it.category || it.name)) || it);
        clubCellsTop.forEach((cell, i) => setClubCellWithBadgeAndName(cell, data.top[i]));
        clubCellsLeft.forEach((cell, i) => setClubCellWithBadgeAndName(cell, data.left[i]));
        // mark usedClubs so modal hides already used ones
        topClubs.forEach(c => usedClubs.add(normalizeCategory(c)));
        leftClubs.forEach(c => usedClubs.add(normalizeCategory(c)));
        document.querySelectorAll('.club-cell.top, .club-cell.left').forEach(cell => {
            cell.onclick = null;
            cell.style.cursor = "default";
        });
    }
}

async function renderGrid() {
    usedPlayers = new Set();
    gridState = [
        [null, null, null],
        [null, null, null],
        [null, null, null]
    ];
    await dataReadyPromise;

    // ONLY setup the intersection cells (those with both data-row and data-col)
    document.querySelectorAll('.grid-cell[data-row][data-col]').forEach(cell => {
        cell.innerHTML = "";
        cell.removeAttribute("data-locked");
        cell.classList.remove("cell-locked", "cell-active", "cell-win");
        cell.disabled = false;
        cell.style.cursor = "pointer";
        cell.onclick = function() {
            if (currentMode === "manual" && !allClubsChosen()) return;
            if (cell.hasAttribute("data-locked") || cell.classList.contains("cell-locked")) return;
            currentGridCell = cell;
            activateCellFeedback(cell); // visual feedback
            showModal(playerModal);
            populatePlayerModal(cell);
        };
    });
    if (currentMode === "manual" && !allClubsChosen()) {
        lockGridCells();
    }
    updateStatusBarVisibility();
}

function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

function activateCellFeedback(cell) {
    cell.classList.add('cell-active');
    setTimeout(() => cell.classList.remove('cell-active'), 300);
}

// --- Only show clubs not already chosen and not making impossible grids ---
let suppressClubSearchBlur = false;

function populateClubModal() {
    clubSearch.value = "";
    let initialInputValue = "";
    clubList.innerHTML = "";


    const clubs = Object.keys(CategoriesToIds.clubs || {});
    const nations = Object.keys(CategoriesToIds.nations || {});
    const managers = Object.keys(CategoriesToIds.managers || {});

    const winners = Object.keys(CategoriesToIds.winners || {}).map(c => ({
        display: `Won ${c}`,
        category: c
    }));

    const competitions = Object.keys(CategoriesToIds.competitions || {}).map(c => ({
        display: `Played in ${c}`,
        category: c
    }));


    let oldBtnsDiv = clubList.parentElement.querySelector(".club-filter-buttons");
    if (oldBtnsDiv) oldBtnsDiv.remove();

    let btnsDiv = document.createElement("div");
    btnsDiv.className = "club-filter-buttons";
    btnsDiv.style.display = "flex";
    btnsDiv.style.justifyContent = "space-between";
    btnsDiv.style.marginBottom = "10px";
    btnsDiv.style.gap = "6px";
    btnsDiv.innerHTML = `
            <button class="club-filter-btn active" data-type="clubs">CLUBS</button>
            <button class="club-filter-btn" data-type="nations">NATIONS</button>
            <button class="club-filter-btn" data-type="managers">MANAGERS</button>
            <button class="club-filter-btn" data-type="other">OTHER</button>

    `;
    clubList.parentElement.insertBefore(btnsDiv, clubList);

    setTimeout(() => clubSearch.focus(), 0);

    let userInputValue = initialInputValue;
    let suggestions = [];
    let highlightIdx = -1;
    let dropdownOpen = true;
    let currentListType = "clubs";

    function updateHighlight() {
        Array.from(clubList.children).forEach((li, idx) => {
            li.classList.toggle("active", idx === highlightIdx);
        });
        if (highlightIdx >= 0 && clubList.children[highlightIdx]) {
            clubList.children[highlightIdx].scrollIntoView({ block: "nearest" });
        }
        if (highlightIdx === -1) {
            clubSearch.value = userInputValue;
            setTimeout(() => {
                clubSearch.selectionStart = clubSearch.selectionEnd = clubSearch.value.length;
            }, 0);
        }
    }
    function categoryWouldBreakGrid(testCategory, posType, posIdx) {
        // testCategory is a string (category)
        let testTop = topClubs.slice();
        let testLeft = leftClubs.slice();

        if (posType === "top") testTop[posIdx] = testCategory;
        else testLeft[posIdx] = testCategory;

        // Normalize before checking. gridIsPlayable treats "CHOOSE CATEGORY" as wildcard
        testTop = testTop.map(c => normalizeCategory(c));
        testLeft = testLeft.map(c => normalizeCategory(c));

        return !gridIsPlayable(testTop, testLeft);
    }

    function renderList(type, preserveInput = true) {
        currentListType = type;
        let srcList;
            if (type === "clubs") {
                srcList = clubs.map(c => ({ display: c, category: c }));
                clubSearch.placeholder = "Search club...";
            }
            else if (type === "nations") {
                srcList = nations.map(c => ({ display: c, category: c }));
                clubSearch.placeholder = "Search nation...";
            }
            else if (type === "managers") {
                srcList = managers.map(c => ({ display: c, category: c }));
                clubSearch.placeholder = "Search manager...";
            }
            else {
                srcList = [...winners, ...competitions];
                clubSearch.placeholder = "Search category...";
            }

        // DO NOT reset clubSearch.value unless preserveInput is false
        if (!preserveInput) {
            clubSearch.value = "";
            userInputValue = "";
        }

        // If nothing typed, update placeholder and show full list
        // If typed, keep value and show filtered list
        const query = clubSearch.value.trim().toLowerCase();
        if (query === "") {
            suggestions = srcList.filter(clubObj => !usedClubs.has(normalizeCategory(clubObj.category)));
        } else {
                suggestions = srcList.filter(obj =>
                    !usedClubs.has(normalizeCategory(obj.category)) &&
                    (obj.display || "").toLowerCase().includes(query)
                );

        }

        clubList.innerHTML = "";
        highlightIdx = -1;
        suggestions.forEach((clubObj, idx) => {
            let li = document.createElement("li");
            // Left aligned badge and name
            li.style.display = "flex";
            li.style.alignItems = "center";
            li.style.justifyContent = "flex-start"; // <--- left align!
            li.style.gap = "10px";
            li.style.flexDirection = "row";
            let badgeImg = document.createElement("img");
            badgeImg.className = "club-badge club-badge-in-list";
            badgeImg.style.width = "34px";
            badgeImg.style.height = "34px";
            badgeImg.style.objectFit = "contain";
            badgeImg.style.marginRight = "10px";
            badgeImg.style.verticalAlign = "middle";
            badgeImg.style.background = "transparent";
            badgeImg.style.display = "inline-block";
            badgeImg.alt = clubObj.display;
            if (currentListType === "managers") {
                badgeImg.src = "badges/default.png";
            } else {
                badgeImg.src = `badges/${normalizeCategory(clubObj.category).toLowerCase()}.png`;
            }
            badgeImg.onerror = function() { this.src = "badges/default.png"; };
            li.appendChild(badgeImg);
            let span = document.createElement("span");
            span.className = "club-list-name";
            span.textContent = clubObj.display;
            span.style.textAlign = "left";
            li.appendChild(span);

            li.onmouseenter = function() {
                highlightIdx = idx;
                updateHighlight();
            };
            li.onmouseleave = function() {
                highlightIdx = -1;
                updateHighlight();
            };
            const posType = currentClubCell.classList.contains('top') ? "top" : "left";
            const posIdx = parseInt(currentClubCell.dataset.idx);

            const isInvalid = categoryWouldBreakGrid(
                normalizeCategory(clubObj.category),
                posType,
                posIdx
            );

            if (isInvalid) {
                li.style.opacity = "0.4";
                li.style.pointerEvents = "none";
            }

            li.onclick = function() {
                // set input to display string (not object)
                clubSearch.value = clubObj.display;
                userInputValue = clubObj.display;
                dropdownOpen = false;
                pickClub(clubObj);
            };
            clubList.appendChild(li);
        });
        updateHighlight();
    }

    // Filter button logic with blur suppression
    btnsDiv.querySelectorAll(".club-filter-btn").forEach(btn => {
        btn.onmousedown = function() { suppressClubSearchBlur = true; };
        btn.onclick = function() {
            btnsDiv.querySelectorAll(".club-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            highlightIdx = -1;
            dropdownOpen = true;
            // DO NOT reset clubSearch.value; preserve user input!
            // Only update placeholder and update list type
            renderList(btn.getAttribute("data-type"), true);
            clubList.style.display = "block";
            setTimeout(() => clubSearch.focus(), 0);
        };
    });

    function pickClub(item) {
        const category = item.category || item;
        const display = item.display || item;

        let posType, posIdx;
        if (currentClubCell.classList.contains('top')) {
            posType = "top";
            posIdx = parseInt(currentClubCell.getAttribute('data-idx'));
        } else {
            posType = "left";
            posIdx = parseInt(currentClubCell.getAttribute('data-idx'));
        }

        setClubCellWithBadgeAndName(currentClubCell, item);
        usedClubs.add(normalizeCategory(category));

        if (posType === "top") topClubs[posIdx] = normalizeCategory(category);
        else leftClubs[posIdx] = normalizeCategory(category);

        currentClubCell.onclick = null;
        currentClubCell.style.cursor = "default";

        hideModal(clubModal);

        if (allClubsChosen()) unlockGridCells();
        updateStatusBarVisibility();

        highlightIdx = -1;
        dropdownOpen = false;
    }


    clubSearch.oninput = function(e) {
        userInputValue = clubSearch.value;
        dropdownOpen = true;
        highlightIdx = -1;
        renderList(currentListType, true);
    };

    clubSearch.onfocus = function() {
        dropdownOpen = true;
        renderList(currentListType, true);
    };

    clubSearch.onblur = function(e) {
        // Only close if focus goes to another element inside clubModal (like clicking a club)
        // Otherwise, DO NOTHING: window focus loss will not close the list
        setTimeout(() => {
            // Check if the new focused element is inside clubModal
            const active = document.activeElement;
            if (clubModal.contains(active)) {
                return; // Don't close
            }
            dropdownOpen = false;
            clubList.innerHTML = "";
        }, 120);
    };

    clubSearch.onkeydown = function(e) {
        if (!dropdownOpen) return;
        if (suggestions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (highlightIdx === -1) {
                highlightIdx = 0;
            } else if (highlightIdx === suggestions.length - 1) {
                highlightIdx = -1;
            } else {
                highlightIdx++;
            }
            updateHighlight();
            if (highlightIdx >= 0) {
                clubSearch.value = suggestions[highlightIdx].display || "";
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (highlightIdx === -1) {
                highlightIdx = suggestions.length - 1;
            } else if (highlightIdx === 0) {
                highlightIdx = -1;
            } else {
                highlightIdx--;
            }
            updateHighlight();
            if (highlightIdx >= 0) {
                clubSearch.value = suggestions[highlightIdx].display || "";
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightIdx >= 0) {
                clubSearch.value = suggestions[highlightIdx].display || "";
                userInputValue = suggestions[highlightIdx].display || "";
                dropdownOpen = false;
                pickClub(suggestions[highlightIdx]);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            highlightIdx = -1;
            updateHighlight();
            clubSearch.value = userInputValue;
            dropdownOpen = false;
            clubList.innerHTML = "";
        }
    };

    renderList(currentListType, true);
    clubList.scrollTop = 0;
}


// --- Modal for picking a player; displays ALL players, date of birth if present ---
function populatePlayerModal(cell) {
    playerSearch.value = "";
    playerList.innerHTML = "";

    let userInputValue = "";
    let suggestions = [];
    let highlightIdx = -1;
    let dropdownOpen = true;

    setTimeout(() => {
        playerSearch.focus();

        function updateHighlight() {
            Array.from(playerList.children).forEach((li, idx) => {
                li.classList.toggle("active", idx === highlightIdx);
            });
            if (highlightIdx >= 0 && playerList.children[highlightIdx]) {
                playerList.children[highlightIdx].scrollIntoView({ block: "nearest" });
            }
            if (highlightIdx === -1) {
                playerSearch.value = userInputValue;
                setTimeout(() => {
                    playerSearch.selectionStart = playerSearch.selectionEnd = playerSearch.value.length;
                }, 0);
            }
        }

        function renderPlayerList(preserveInput = true) {
            const query = normalizeStr(playerSearch.value.trim());
            if (!preserveInput) {
                playerSearch.value = "";
                userInputValue = "";
            }
            if (!query || query.length < 2) {
                playerList.innerHTML = "";
                suggestions = [];
                highlightIdx = -1;
                return;
            }
            suggestions = allAvailablePlayerIds
                .filter(pid => !usedPlayers.has(pid))
                .map(pid => playerIdMap[pid])
                .filter(player => player && player.normalized_name.includes(query))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
            playerList.innerHTML = "";
            highlightIdx = -1;

            // Limit to first 20 results for speed
            suggestions.slice(0, 20).forEach((player, idx) => {
                let li = document.createElement("li");
                li.style.display = "flex";
                li.style.alignItems = "center";
                li.style.justifyContent = "space-between";
                li.style.gap = "10px";

                // Left: name + (dateOfBirth)
                let nameSpan = document.createElement("span");
                nameSpan.style.flex = "1";
                nameSpan.style.textAlign = "left";
                nameSpan.textContent = player.name;

                if (player.dateOfBirth) {
                    let dobSpan = document.createElement("span");
                    dobSpan.style.color = "#a9a9a9";
                    dobSpan.style.marginLeft = "8px";
                    dobSpan.style.fontSize = "90%";
                    dobSpan.textContent = `(${player.dateOfBirth})`;
                    nameSpan.appendChild(dobSpan);
                }

                // Right: position (always present for hover effect)
                let posSpan = document.createElement("span");
                posSpan.className = "player-pos-on-hover";
                posSpan.style.minWidth = "38px";
                posSpan.style.textAlign = "right";
                posSpan.style.fontWeight = "bold";
                posSpan.style.color = "#19d678";
                posSpan.textContent = player.position ? player.position : "";
                li.appendChild(nameSpan);
                li.appendChild(posSpan);

                li.onmouseenter = function() {
                    highlightIdx = idx;
                    updateHighlight();
                    posSpan.classList.add("show-pos"); // add class to reveal
                };
                li.onmouseleave = function() {
                    highlightIdx = -1;
                    updateHighlight();
                    posSpan.classList.remove("show-pos");
                };
                li.onclick = function() {
                    playerSearch.value = suggestions[idx].name;
                    userInputValue = suggestions[idx].name;
                    dropdownOpen = false;
                    handlePlayerPick(cell, String(suggestions[idx].id));
                    hideModal(playerModal);
                };
                playerList.appendChild(li);
            });
            updateHighlight();
        }

        // INSTANT SEARCH RESPONSE
        playerSearch.oninput = function () {
            userInputValue = playerSearch.value;
            dropdownOpen = true;
            highlightIdx = -1;
            renderPlayerList(true);
        };

        playerSearch.onfocus = function () {
            dropdownOpen = true;
            renderPlayerList(true);
        };

        playerSearch.onblur = function () {
            setTimeout(() => {
                dropdownOpen = false;
                playerList.innerHTML = "";
            }, 120);
        };

        playerSearch.onkeydown = function (e) {
            if (!dropdownOpen) return;
            if (suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (highlightIdx === -1) {
                    highlightIdx = 0;
                } else if (highlightIdx === suggestions.length - 1) {
                    highlightIdx = -1;
                } else {
                    highlightIdx++;
                }
                updateHighlight();
                if (highlightIdx >= 0) {
                    playerSearch.value = suggestions[highlightIdx].name;
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (highlightIdx === -1) {
                    highlightIdx = suggestions.length - 1;
                } else if (highlightIdx === 0) {
                    highlightIdx = -1;
                } else {
                    highlightIdx--;
                }
                updateHighlight();
                if (highlightIdx >= 0) {
                    playerSearch.value = suggestions[highlightIdx].name;
                }
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (highlightIdx >= 0) {
                    playerSearch.value = suggestions[highlightIdx].name;
                    userInputValue = suggestions[highlightIdx].name;
                    dropdownOpen = false;
                    handlePlayerPick(cell, String(suggestions[highlightIdx].id));
                    hideModal(playerModal);
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                highlightIdx = -1;
                updateHighlight();
                playerSearch.value = userInputValue;
                dropdownOpen = false;
                playerList.innerHTML = "";
            }
        };

        renderPlayerList();
        playerList.scrollTop = 0;
    }, 0);
}
// ... [rest of your code remains unchanged]
// --- WIN CHECK ---
function animateWinCells(cells) {
    // Example: highlight winning cells
    cells.forEach(cell => {
        cell.classList.add("cell-win");
    });
}

function checkWin() {
    // Helper: get cell by row/col
    function getCell(r, c) {
        return document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
    }
    for (let r = 0; r < 3; r++) {
        if (gridState[r][0] && gridState[r][0] === gridState[r][1] && gridState[r][1] === gridState[r][2]) {
            animateWinCells([getCell(r,0), getCell(r,1), getCell(r,2)]);
            showWin(gridState[r][0]);
            return;
        }
    }
    for (let c = 0; c < 3; c++) {
        if (gridState[0][c] && gridState[0][c] === gridState[1][c] && gridState[1][c] === gridState[2][c]) {
            animateWinCells([getCell(0,c), getCell(1,c), getCell(2,c)]);
            showWin(gridState[0][c]);
            return;
        }
    }
    if (gridState[0][0] && gridState[0][0] === gridState[1][1] && gridState[1][1] === gridState[2][2]) {
        animateWinCells([getCell(0,0), getCell(1,1), getCell(2,2)]);
        showWin(gridState[0][0]);
        return;
    }
    if (gridState[0][2] && gridState[0][2] === gridState[1][1] && gridState[1][1] === gridState[2][0]) {
        animateWinCells([getCell(0,2), getCell(1,1), getCell(2,0)]);
        showWin(gridState[0][2]);
        return;
    }
    if ([].concat(...gridState).every(x => x)) {
        showWin("Draw");
    }
}
function showWin(winner) {
    setTimeout(() => {
        let title, icon;
        if (winner === "Draw") {
            title = "It's a draw!";
            icon = "info";
        } else {
            title = `Player ${winner === "X" ? "✖" : "◯"} wins!`;
            icon = "success";
            if (winner === "X") scoreX++;
            if (winner === "O") scoreO++;
            updateScoreInfo();
        }
        if (typeof Swal !== "undefined") {
            Swal.fire({
                title: title,
                icon: icon,
                background: '#174e2c',
                color: '#ffffff',
                confirmButtonColor: "#19d678",
                showCancelButton: true,
                confirmButtonText: "New Round",
                cancelButtonText: "Start Menu"
            }).then((result) => {
                if (result.isConfirmed) {
                    renderClubs(currentMode);
                    renderGrid();
                    updateStatusBarVisibility();
                    ticTurn = "X";
                    updateTurnInfo();
                    checkWin();
                } else {
                    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    document.getElementById('manual').classList.add('active');
                    currentMode = "manual";
                    renderClubs(currentMode);
                    renderGrid();
                    updateStatusBarVisibility();
                    ticTurn = "X";
                    updateTurnInfo();
                    checkWin();
                }
            });
        } else {
            alert(title + " (SweetAlert2 not loaded!)");
        }
    }, 100);
}

async function handlePlayerPick(cell, playerId) {
    // ensure id is string (we stored IDs as strings)
    const pidStr = String(playerId);

    let row = parseInt(cell.dataset.row);
    let col = parseInt(cell.dataset.col);

    let rowCatRaw = leftClubs[row];
    let colCatRaw = topClubs[col];

    const rowCat = normalizeCategory(rowCatRaw);
    const colCat = normalizeCategory(colCatRaw);

    const playersCol = categoryPlayersMap[colCat] || new Set();
    const playersRow = categoryPlayersMap[rowCat] || new Set();

    let isValid = playersCol.has(pidStr) && playersRow.has(pidStr);

    if (isValid) {
        usedPlayers.add(pidStr);
        const player = playerIdMap[pidStr];
        cell.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <span class="tic-sign">${ticTurn === "X" ? "✖" : "◯"}</span>
                <span class="player-under-sign">${getDisplaySurname(player.name)}</span>
            </div>
        `;
        gridState[row][col] = ticTurn;
        cell.setAttribute("data-locked", "true");
        cell.classList.add("cell-locked");
        cell.disabled = true;
        cell.style.cursor = "default";
        cell.onclick = null;
        activateCellFeedback(cell);
        checkWin();
    } else {
        // Optionally show feedback that pick was invalid
        // console.warn("Picked player does not belong to both categories", playerId, rowCat, colCat);
    }
    ticTurn = ticTurn === "X" ? "O" : "X";
    updateTurnInfo();
}


function getDisplaySurname(playerName) {
    let nameNoBracket = playerName.replace(/\s*\(.*?\)\s*/g, '').trim();
    let words = nameNoBracket.split(/\s+/);
    if (words.length <= 2) {
        return words[words.length-1];
    } else {
        return words.slice(-2).join(' ');
    }
}

function allClubsChosen() {
    return topClubs.every(c => normalizeCategory(c) !== "CHOOSE CATEGORY") && leftClubs.every(c => normalizeCategory(c) !== "CHOOSE CATEGORY");
}

function lockGridCells() {
    document.querySelectorAll('.grid-cell[data-row][data-col]').forEach(cell => {
        cell.disabled = true;
        cell.classList.add("cell-locked");
        cell.style.cursor = "default";
    });
}
function unlockGridCells() {
    document.querySelectorAll('.grid-cell[data-row][data-col]').forEach(cell => {
        if (!cell.hasAttribute("data-locked")) {
            cell.disabled = false;
            cell.classList.remove("cell-locked");
            cell.style.cursor = "pointer";
        }
    });
}

function updateStatusBarVisibility() {
    const statusBar = document.querySelector('.status-bar-wrap');
    // ONLY show if the grid is playable (any grid cell is clickable)
    const gridCells = Array.from(document.querySelectorAll('.grid-cell[data-row][data-col]'));
    // "Round active" means at least one grid cell is enabled and not locked
    const anyPlayable = gridCells.some(cell => !cell.disabled && !cell.classList.contains("cell-locked"));

    if (anyPlayable) {
        statusBar.classList.remove('invisible');
    } else {
        statusBar.classList.add('invisible');
    }
}

document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.onclick = function() {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.id === "manual") currentMode = "manual";
        else if (btn.id === "random-easy") currentMode = "random-easy";
        else if (btn.id === "random-hard") currentMode = "random-hard";
        else if (btn.id === "croatian-league") currentMode = "croatian-league";
        renderClubs(currentMode);
        renderGrid();
        updateStatusBarVisibility();
        ticTurn = "X";
        updateTurnInfo();
    }
});

const clubModal = document.getElementById("clubModal");
const playerModal = document.getElementById("playerModal");
const clubList = document.getElementById("clubList");
const playerList = document.getElementById("playerList");
const clubSearch = document.getElementById("clubSearch");
const playerSearch = document.getElementById("playerSearch");
function showModal(modal) {
    // set visible and trap background scroll on mobile
    modal.style.display = "block";
    document.body.classList.add('modal-open');

    // if it's the club modal, reset search to improve UX on mobile
    if (modal === clubModal) {
        clubSearch.value = "";
        setTimeout(() => clubSearch.focus(), 50);
    }
    if (modal === playerModal) {
        playerSearch.value = "";
        setTimeout(() => playerSearch.focus(), 50);
    }
}
function hideModal(modal) {
    modal.style.display = "none";
    // remove the modal-open only if no other modal is open
    const anyOpen = Array.from(document.querySelectorAll('.modal')).some(m => m.style.display === 'block');
    if (!anyOpen) document.body.classList.remove('modal-open');

    if (modal === clubModal) {
        clubSearch.value = "";
    }
}
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        if (clubModal && clubModal.style.display === 'block') hideModal(clubModal);
        if (playerModal && playerModal.style.display === 'block') hideModal(playerModal);
    }
});
document.getElementById("closeClubModal").onclick = () => hideModal(clubModal);
document.getElementById("closePlayerModal").onclick = () => hideModal(playerModal);
window.onclick = (event) => {
    if (event.target == clubModal) hideModal(clubModal);
    if (event.target == playerModal) hideModal(playerModal);
};


dataReadyPromise.then(() => {
    renderClubs();
    renderGrid();
    updateStatusBarVisibility(); // <--- Add here
    ticTurn = "X";
    updateTurnInfo();
});

document.getElementById("sidebarToggle").onclick = function() {
    document.getElementById("sidebarDrawer").classList.add("open");
    document.getElementById("sidebarBackdrop").style.display = "block";
};
document.getElementById("sidebarBackdrop").onclick = function() {
    document.getElementById("sidebarDrawer").classList.remove("open");
    document.getElementById("sidebarBackdrop").style.display = "none";
};
document.getElementById("sidebarCloseBtn").onclick = function() {
    document.getElementById("sidebarDrawer").classList.remove("open");
    document.getElementById("sidebarBackdrop").style.display = "none";
};


