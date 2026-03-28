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
let playerIdList = null;
let playerIdMap = {};
let allAvailablePlayerIds = null;
let categoryPlayersMap = {};

let nationsList = [];
let otherList = [];

let scoreX = 0;
let scoreO = 0;

let ticTurn = "X";

function updateTurnInfo() {
    const symbolImg = ticTurn === "X"
        ? `<img src="../media/x.webp" alt="X" class="turn-img"/>`
        : `<img src="../media/o.webp" alt="O" class="turn-img"/>`;
    document.getElementById("turn-info").innerHTML =
        `<span class="turn-label">Turn:</span> ${symbolImg}`;
}
updateTurnInfo();

function updateScoreInfo() {
    const xImg = `<img src="../media/x.webp" alt="X" class="turn-img"/>`;
    const oImg = `<img src="../media/o.webp" alt="O" class="turn-img"/>`;
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

function normalizeCategory(cat) {
    if (!cat && cat !== "") return "CHOOSE CATEGORY";
    if (typeof cat === "string") return cat;
    if (typeof cat === "object") {
        return cat.category || cat.name || cat.display || "CHOOSE CATEGORY";
    }
    return String(cat);
}

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
        const res = await fetch("../database/footygrid/categories.json");
        categoriesData = await res.json();
    }
    return categoriesData;
}

async function fetchCategoriesToIds() {
    if (!CategoriesToIds) {
        const res = await fetch("../database/footygrid/categories_to_ids.json");
        CategoriesToIds = await res.json();
    }
    return CategoriesToIds;
}

async function fetchPlayerIdList() {
    if (!playerIdList) {
        const res = await fetch("../database/players_ids.json");
        const data = await res.json();

        playerIdMap = {};
        playerIdList = [];

        if (Array.isArray(data)) {
            for (const p of data) {
                const idStr = String(p.id);
                const playerObj = Object.assign({}, p, { id: idStr });
                playerObj.normalized_name = playerObj.normalized_name || normalizeStr(playerObj.name || "");
                playerIdMap[idStr] = playerObj;
                playerIdList.push(playerObj);
            }
        } else if (data && typeof data === "object") {
            for (const [id, p] of Object.entries(data)) {
                const idStr = String(id);
                const playerObj = Object.assign({ id: idStr }, p);
                playerObj.normalized_name = playerObj.normalized_name || normalizeStr(playerObj.name || "");
                playerIdMap[idStr] = playerObj;
                playerIdList.push(playerObj);
            }
        } else {
            playerIdList = [];
            playerIdMap = {};
        }
    }
    return playerIdList;
}

async function prepareAllAvailablePlayers() {
    await fetchPlayerIdList();
    allAvailablePlayerIds = Object.keys(playerIdMap).slice();
}

function extractSpecialListsFromCategories() {
    nationsList = Array.isArray(categoriesData.nations) ? categoriesData.nations : [];
    otherList = Array.isArray(categoriesData.other) ? categoriesData.other : [];
}

function buildCategoryPlayersMap() {
    categoryPlayersMap = {};

    const temp = {};
    for (const [groupName, groupObj] of Object.entries(CategoriesToIds || {})) {
        if (!groupObj) continue;
        for (const [rawCat, ids] of Object.entries(groupObj || {})) {
            const canonical = String(rawCat).trim();
            if (!temp[canonical]) temp[canonical] = new Set();
            for (const pid of (ids || [])) {
                temp[canonical].add(String(pid).trim());
            }
        }
    }

    for (const canonical of Object.keys(temp)) {
        const set = temp[canonical];
        categoryPlayersMap[canonical] = set;
        categoryPlayersMap[normalizeStr(canonical)] = set;
        categoryPlayersMap[canonical.toLowerCase()] = set;
        const played = ("Played in " + canonical).trim();
        const won = ("Won " + canonical).trim();
        categoryPlayersMap[played] = set;
        categoryPlayersMap[won] = set;
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

    if (categoryPlayersMap[s]) return s;
    const ns = normalizeStr(s);
    if (categoryPlayersMap[ns]) return ns;
    const ls = s.toLowerCase();
    if (categoryPlayersMap[ls]) return ls;
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
    const played = ("Played in " + s).trim();
    if (categoryPlayersMap[played]) return played;
    const won = ("Won " + s).trim();
    if (categoryPlayersMap[won]) return won;
    const nplayed = normalizeStr(played);
    if (categoryPlayersMap[nplayed]) return nplayed;
    const nwon = normalizeStr(won);
    if (categoryPlayersMap[nwon]) return nwon;

    return s;
}

function lookupSetFor(raw) {
    const key = getCanonicalKey(raw);
    if (!key || key === "CHOOSE CATEGORY") return null;
    return categoryPlayersMap[key] || null;
}

async function fetchCategoriesList(mode = null) {
    await fetchCategories();
    await fetchCategoriesToIds();

    const easy = new Set(categoriesData.easy || []);
    const hnl = new Set(categoriesData.hnl || []);

    const allCats = new Set([
        ...Object.keys(CategoriesToIds.clubs || {}),
        ...Object.keys(CategoriesToIds.nations || {}),
        ...Object.keys(CategoriesToIds.managers || {}),
        ...Object.keys(CategoriesToIds.teammates || {}),
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

function categoriesHaveIntersectionSync(catA, catB) {
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
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            const topRaw = top[c];
            const leftRaw = left[r];
            const topKey = getCanonicalKey(topRaw);
            const leftKey = getCanonicalKey(leftRaw);

            if (topKey === "CHOOSE CATEGORY" || leftKey === "CHOOSE CATEGORY") continue;

            const setA = lookupSetFor(topRaw);
            const setB = lookupSetFor(leftRaw);

            if (!setA || !setB) {
                return false;
            }

            let hasAny = false;
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

function findCategoryGroup(name) {
    if (!name) return null;
    const s = String(name).trim();
    for (const group of ['clubs','nations','managers','teammates','winners','competitions']) {
        if (CategoriesToIds && CategoriesToIds[group] && Object.prototype.hasOwnProperty.call(CategoriesToIds[group], s)) {
            return group;
        }
    }
    const ns = normalizeStr(s);
    for (const group of ['clubs','nations','managers','teammates','winners','competitions']) {
        if (CategoriesToIds && CategoriesToIds[group]) {
            for (const key of Object.keys(CategoriesToIds[group])) {
                if (normalizeStr(key) === ns) return group;
            }
        }
    }
    return null;
}

function getWeightForGroup(group, mode) {
    const defaultWeights = {
        clubs: 2,
        nations: 1,
        managers: 1,
        teammates: 1,
        winners: 1,
        competitions: 1,
        other: 1
    };

    if (mode === 'croatian-league') {
        return {
            clubs: 4,
            nations: 1,
            managers: 1,
            teammates: 1,
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
            teammates: 1,
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
            teammates: 1,
            winners: 1,
            competitions: 1,
            other: 1
        }[group] || 1;
    }

    return defaultWeights[group] || defaultWeights.other;
}

function pickWeightedUnique(items, weightsMap, n) {
    const chosen = [];
    const remaining = new Set(items);
    const weightFor = key => Math.max(0, Number(weightsMap[key] || 1));
    while (chosen.length < n && remaining.size > 0) {
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
            picked = remaining.values().next().value;
        }
        chosen.push(picked);
        remaining.delete(picked);
    }
    return chosen;
}

function getRandomValidCategoriesSync(categoriesList, mode = null) {
    const allNames = categoriesList
        .map(c => (typeof c === 'object' ? (c.name || c.category || c.display) : String(c)))
        .filter(Boolean);

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

    const weights = {};
    for (const name of unique) {
        const group = findCategoryGroup(name) || 'other';
        weights[name] = getWeightForGroup(group, mode);
    }

    const perCycleAttempts = 200;
    const timeLimitMs = 10000;
    const start = Date.now();

    const isPlayable = (top, left) => {
        try { return gridIsPlayable(top, left); }
        catch (e) { return false; }
    };

    let cycles = 0;
    while (timeLimitMs === null || (Date.now() - start) < timeLimitMs) {
        cycles++;
        for (let attempt = 0; attempt < perCycleAttempts; attempt++) {
            const six = pickWeightedUnique(unique, weights, 6);
            if (six.length < 6) continue;
            const top = six.slice(0,3);
            const left = six.slice(3,6);

            if (isPlayable(top, left)) {
                return {
                    top: top.map(x => x),
                    left: left.map(x => x)
                };
            }
        }
        if (cycles % 5 === 0) console.debug(`getRandomValidCategoriesSync: ${cycles} cycles done`);
    }

    console.warn("getRandomValidCategoriesSync: fallback.");
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
    const catNames = cats.map(c => (c && (c.name || c)) || c).filter(Boolean).sort(() => Math.random() - 0.5);

    const raw = getRandomValidCategoriesSync(catNames, mode);

    function makeItem(name) {
        const group = findCategoryGroup(name);
        if (group === 'winners') return { category: name, display: `Won ${name}` };
        if (group === 'competitions') return { category: name, display: `Played in ${name}` };
        if (group === 'managers') return { category: name, display: name };
        if (group === 'teammates') return { category: name, display: name };
        return { category: name, display: name };
    }

    const topItems = raw.top.map(makeItem);
    const leftItems = raw.left.map(makeItem);

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

    if (Object.keys(CategoriesToIds.managers || {}).includes(category)) {
        img.src = "../media/default_manager.webp";
    } else {
        img.src = `../media/${String(category).replace(/ /g, '_').toLowerCase()}.webp`;
        img.onerror = function () {
            this.src = "../media/default_manager.webp";
        };
    }

    if (Object.keys(CategoriesToIds.teammates || {}).includes(category)) {
        img.src = "../media/default_player.webp";
    } else {
        img.src = `../media/${String(category).replace(/ /g, '_').toLowerCase()}.webp`;
        img.onerror = function () {
            this.src = "../media/default_manager.webp";
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
            activateCellFeedback(cell);
            showModal(playerModal);
            populatePlayerModal(cell);
        };
    });
    if (currentMode === "manual" && !allClubsChosen()) {
        lockGridCells();
    }
    updateStatusBarVisibility();
}

function activateCellFeedback(cell) {
    cell.classList.add('cell-active');
    setTimeout(() => cell.classList.remove('cell-active'), 300);
}

let suppressClubSearchBlur = false;

function populateClubModal() {
    // Očisti input i list
    clubSearch.value = "";
    clubList.innerHTML = "";

    const clubs = Object.keys(CategoriesToIds.clubs || {});
    const nations = Object.keys(CategoriesToIds.nations || {});
    const managers = Object.keys(CategoriesToIds.managers || {});
    const teammates = Object.keys(CategoriesToIds.teammates || {});

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
            <button class="club-filter-btn" data-type="teammates">TEAMMATES</button>
            <button class="club-filter-btn" data-type="other">COMPETITIONS</button>
    `;
    clubList.parentElement.insertBefore(btnsDiv, clubList);

    setTimeout(() => clubSearch.focus(), 0);

    let userInputValue = "";
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
        let testTop = topClubs.slice();
        let testLeft = leftClubs.slice();

        if (posType === "top") testTop[posIdx] = testCategory;
        else testLeft[posIdx] = testCategory;

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
        else if (type === "teammates") {
            srcList = teammates.map(c => ({ display: c, category: c }));
            clubSearch.placeholder = "Search player...";
        }
        else {
            srcList = [...winners, ...competitions];
            clubSearch.placeholder = "Search category...";
        }

        if (!preserveInput) {
            clubSearch.value = "";
            userInputValue = "";
        }

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
            li.style.display = "flex";
            li.style.alignItems = "center";
            li.style.justifyContent = "flex-start";
            li.style.gap = "10px";
            li.style.flexDirection = "row";
            let badgeImg = document.createElement("img");
            badgeImg.className = "club-badge club-badge-in-list";
            badgeImg.style.width = "34px";
            badgeImg.style.height = "34px";
            badgeImg.style.objectFit = "contain";
            badgeImg.style.marginRight = "10px";
            badgeImg.alt = clubObj.display;
            if (currentListType === "managers") {
                badgeImg.src = "../media/default_manager.webp";
            } else {
                badgeImg.src = `../media/${normalizeCategory(clubObj.category).replace(/ /g, '_').toLowerCase()}.webp`;
            }
            if (currentListType === "teammates") {
                badgeImg.src = "../media/default_player.webp";
            } else {
                badgeImg.src = `../media/${normalizeCategory(clubObj.category).replace(/ /g, '_').toLowerCase()}.webp`;
            }
            badgeImg.onerror = function() { this.src = "../media/default_manager.webp"; };
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
                clubSearch.value = clubObj.display;
                userInputValue = clubObj.display;
                dropdownOpen = false;
                pickClub(clubObj);
            };
            clubList.appendChild(li);
        });
        updateHighlight();
    }

    btnsDiv.querySelectorAll(".club-filter-btn").forEach(btn => {
        btn.addEventListener("click", function(e) {
            e.preventDefault();
            btnsDiv.querySelectorAll(".club-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            highlightIdx = -1;
            dropdownOpen = true;
            renderList(btn.getAttribute("data-type"), true);
            clubList.style.display = "block";
        });
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

    // ✅ NOVO: Koristi closure varijable umjesto globalnih event listenera
    // Ovo sprječava akumulaciju listenera
    const handleInput = function(e) {
        userInputValue = clubSearch.value;
        dropdownOpen = true;
        highlightIdx = -1;
        renderList(currentListType, true);
    };

    const handleFocus = function() {
        dropdownOpen = true;
        renderList(currentListType, true);
    };

    const handleBlur = function(e) {
        setTimeout(() => {
            const active = document.activeElement;
            if (clubModal.contains(active)) {
                return;
            }
            dropdownOpen = false;
            clubList.innerHTML = "";
        }, 120);
    };

    const handleKeydown = function(e) {
        if (!dropdownOpen) return;
        if (suggestions.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            highlightIdx = highlightIdx === -1 ? 0 : (highlightIdx === suggestions.length - 1 ? -1 : highlightIdx + 1);
            updateHighlight();
            if (highlightIdx >= 0) clubSearch.value = suggestions[highlightIdx].display || "";
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            highlightIdx = highlightIdx === -1 ? suggestions.length - 1 : (highlightIdx === 0 ? -1 : highlightIdx - 1);
            updateHighlight();
            if (highlightIdx >= 0) clubSearch.value = suggestions[highlightIdx].display || "";
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

    // ✅ Ukloni sve stare listenere prije nego što dodam nove
    clubSearch.removeEventListener("input", clubSearch._handleInput);
    clubSearch.removeEventListener("focus", clubSearch._handleFocus);
    clubSearch.removeEventListener("blur", clubSearch._handleBlur);
    clubSearch.removeEventListener("keydown", clubSearch._handleKeydown);

    // Spremi referencu na handlere kako bi ih kasnije mogao obrisati
    clubSearch._handleInput = handleInput;
    clubSearch._handleFocus = handleFocus;
    clubSearch._handleBlur = handleBlur;
    clubSearch._handleKeydown = handleKeydown;

    // Dodaj nove listenere
    clubSearch.addEventListener("input", handleInput);
    clubSearch.addEventListener("focus", handleFocus);
    clubSearch.addEventListener("blur", handleBlur);
    clubSearch.addEventListener("keydown", handleKeydown);

    renderList(currentListType, true);
    clubList.scrollTop = 0;
}

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

            suggestions.slice(0, 20).forEach((player, idx) => {
                let li = document.createElement("li");
                li.style.display = "flex";
                li.style.alignItems = "center";
                li.style.justifyContent = "space-between";
                li.style.gap = "10px";

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

                let posSpan = document.createElement("span");
                posSpan.className = "player-pos-on-hover";
                posSpan.style.minWidth = "38px";
                posSpan.style.textAlign = "right";
                posSpan.style.fontWeight = "bold";
                posSpan.style.color = "#19d678";
                posSpan.textContent = player.position ? player.position : "";
                li.appendChild(nameSpan);
                li.appendChild(posSpan);

                li.addEventListener("mouseenter", function() {
                    highlightIdx = idx;
                    updateHighlight();
                    posSpan.classList.add("show-pos");
                });
                li.addEventListener("mouseleave", function() {
                    highlightIdx = -1;
                    updateHighlight();
                    posSpan.classList.remove("show-pos");
                });
                li.addEventListener("click", function() {
                    playerSearch.value = suggestions[idx].name;
                    userInputValue = suggestions[idx].name;
                    dropdownOpen = false;
                    handlePlayerPick(cell, String(suggestions[idx].id));
                    hideModal(playerModal);
                });
                playerList.appendChild(li);
            });
            updateHighlight();
        }

        playerSearch.addEventListener("input", function () {
            userInputValue = playerSearch.value;
            dropdownOpen = true;
            highlightIdx = -1;
            renderPlayerList(true);
        });

        playerSearch.addEventListener("focus", function () {
            dropdownOpen = true;
            renderPlayerList(true);
        });

        playerSearch.addEventListener("blur", function () {
            setTimeout(() => {
                dropdownOpen = false;
                playerList.innerHTML = "";
            }, 120);
        });

        playerSearch.addEventListener("keydown", function (e) {
            if (!dropdownOpen) return;
            if (suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                highlightIdx = highlightIdx === -1 ? 0 : (highlightIdx === suggestions.length - 1 ? -1 : highlightIdx + 1);
                updateHighlight();
                if (highlightIdx >= 0) playerSearch.value = suggestions[highlightIdx].name;
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                highlightIdx = highlightIdx === -1 ? suggestions.length - 1 : (highlightIdx === 0 ? -1 : highlightIdx - 1);
                updateHighlight();
                if (highlightIdx >= 0) playerSearch.value = suggestions[highlightIdx].name;
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
        });

        renderPlayerList();
        playerList.scrollTop = 0;
    }, 0);
}

function animateWinCells(cells) {
    cells.forEach(cell => {
        cell.classList.add("cell-win");
    });
}

function checkWin() {
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
    const gridCells = Array.from(document.querySelectorAll('.grid-cell[data-row][data-col]'));
    const anyPlayable = gridCells.some(cell => !cell.disabled && !cell.classList.contains("cell-locked"));

    if (anyPlayable) {
        statusBar.classList.remove('invisible');
    } else {
        statusBar.classList.add('invisible');
    }
}

// MODE BUTTONS - FIXED
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener("click", function() {
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
    });
});

const clubModal = document.getElementById("clubModal");
const playerModal = document.getElementById("playerModal");
const clubList = document.getElementById("clubList");
const playerList = document.getElementById("playerList");
const clubSearch = document.getElementById("clubSearch");
const playerSearch = document.getElementById("playerSearch");

function showModal(modal) {
    modal.style.display = "block";
    document.body.classList.add('modal-open');
}

function hideModal(modal) {
    modal.style.display = "none";
    
    const anyOpen = Array.from(document.querySelectorAll('.modal')).some(
        m => m.style.display === 'block'
    );
    
    if (!anyOpen) {
        document.body.classList.remove('modal-open');
    }

    if (modal === clubModal) {
        clubSearch.value = "";
        suppressClubSearchBlur = false;
    }
}

window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        if (clubModal && clubModal.style.display === 'block') hideModal(clubModal);
        if (playerModal && playerModal.style.display === 'block') hideModal(playerModal);
    }
});

document.getElementById("closeClubModal").addEventListener("click", () => hideModal(clubModal));
document.getElementById("closePlayerModal").addEventListener("click", () => hideModal(playerModal));

window.addEventListener('click', (event) => {
    if (event.target == clubModal) hideModal(clubModal);
    if (event.target == playerModal) hideModal(playerModal);
});

// SIDEBAR - FIXED
document.getElementById("sidebarToggle").addEventListener("click", function() {
    document.getElementById("sidebarDrawer").classList.add("open");
    document.getElementById("sidebarBackdrop").style.display = "block";
});

document.getElementById("sidebarBackdrop").addEventListener("click", function() {
    document.getElementById("sidebarDrawer").classList.remove("open");
    document.getElementById("sidebarBackdrop").style.display = "none";
});

document.getElementById("sidebarCloseBtn").addEventListener("click", function() {
    document.getElementById("sidebarDrawer").classList.remove("open");
    document.getElementById("sidebarBackdrop").style.display = "none";
});

dataReadyPromise.then(() => {
    renderClubs();
    renderGrid();
    updateStatusBarVisibility();
    ticTurn = "X";
    updateTurnInfo();
});