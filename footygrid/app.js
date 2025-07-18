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
let clubNationalityPlayers = null;
let playerIdList = null; // array of player objects
let playerIdMap = {}; // id → player object
let allAvailablePlayerIds = null; // array of all player IDs
let categoryPlayersMap = {}; // category → Set of player IDs

let nationsList = [];
let otherList = [];

let scoreX = 0;
let scoreO = 0;

let ticTurn = "X";

function updateTurnInfo() {
    const symbolImg = ticTurn === "X"
        ? `<img src="signs/x.png" alt="X" class="turn-img"/>`
        : `<img src="signs/o.png" alt="O" class="turn-img"/>`;
    document.getElementById("turn-info").innerHTML =
        `<span class="turn-label">Turn:</span>${symbolImg}`;
}
updateTurnInfo();

function updateScoreInfo() {
    const xImg = `<img src="signs/x.png" alt="X" class="turn-img"/>`;
    const oImg = `<img src="signs/o.png" alt="O" class="turn-img"/>`;
    document.getElementById("score-info").innerHTML =
        `${xImg} ${scoreX} - ${scoreO} ${oImg}`;
}
updateScoreInfo();

document.getElementById("skip-turn-btn").onclick = function() {
    ticTurn = ticTurn === "X" ? "O" : "X";
    updateTurnInfo();
};

function normalizeStr(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// --- DATA LOADERS ---
let dataReadyPromise = (async function preloadData() {
    await Promise.all([
        fetchCategories(),
        fetchClubNationalityPlayers(),
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
async function fetchClubNationalityPlayers() {
    if (!clubNationalityPlayers) {
        const res = await fetch("data/clubs_and_nationalities_players.json");
        clubNationalityPlayers = await res.json();
    }
    return clubNationalityPlayers;
}
async function fetchPlayerIdList() {
    if (!playerIdList) {
        const res = await fetch("data/players_ids.json");
        playerIdList = await res.json();
        playerIdMap = {};
        for (const player of playerIdList) {
            playerIdMap[player.id] = player;
        }
    }
    return playerIdList;
}

function extractSpecialListsFromCategories() {
    nationsList = Array.isArray(categoriesData.nations) ? categoriesData.nations : [];
    otherList = Array.isArray(categoriesData.other) ? categoriesData.other : [];
}

function buildCategoryPlayersMap() {
    categoryPlayersMap = {};
    for (const [category, playerIds] of Object.entries(clubNationalityPlayers)) {
        categoryPlayersMap[category] = new Set(playerIds);
    }
}

async function prepareAllAvailablePlayers() {
    await fetchPlayerIdList();
    allAvailablePlayerIds = playerIdList.map(player => player.id);
}

// --- Fetch categories (was clubs) ---
async function fetchCategoriesList(mode = null) {
    await fetchCategories();
    let catArray;
    if (mode === "manual") {
        catArray = Array.from(
            new Set([
                ...categoriesData["hard"],
                ...categoriesData["hnl"]
            ])
        );
    } else if (mode === "random-hard" || mode === "hard") {
        catArray = categoriesData["hard"];
    } else if (mode === "croatian-league" || mode === "hnl") {
        catArray = categoriesData["hnl"];
    } else {
        catArray = categoriesData["easy"];
    }
    return catArray
        .slice()
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .map(name => ({ name }));
}

function categoriesHaveIntersectionSync(catA, catB) {
    if (!catA || !catB || catA === "CHOOSE CATEGORY" || catB === "CHOOSE CATEGORY") return true;
    const setA = categoryPlayersMap[catA];
    const setB = categoryPlayersMap[catB];
    if (!setA || !setB) return false;
    for (const playerId of setA) {
        if (setB.has(playerId)) return true;
    }
    return false;
}

function getRandomValidCategoriesSync(categoriesList) {
    let tries = 0;
    while (tries < 30) {
        let catNames = categoriesList.slice().sort(() => Math.random() - 0.5);
        let top = catNames.slice(0, 3);
        let left = catNames.slice(3, 6);
        let ok = true;
        for (let row = 0; row < 3 && ok; ++row) {
            for (let col = 0; col < 3 && ok; ++col) {
                let c1 = top[col];
                let c2 = left[row];
                if (!categoriesHaveIntersectionSync(c1, c2)) ok = false;
            }
        }
        if (ok) return { top, left };
        tries++;
    }
    let catNames = categoriesList.slice();
    return {
        top: catNames.slice(0, 3),
        left: catNames.slice(3, 6)
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
    let catNames = cats.map(c => c.name);
    return getRandomValidCategoriesSync(catNames);
}

function setClubCellWithBadgeAndName(cell, clubName) {
    cell.innerHTML = "";
    if (clubName === "CHOOSE CATEGORY") {
        cell.textContent = "CHOOSE CATEGORY";
    } else {
        const img = document.createElement('img');
        img.src = `badges/${clubName.toLowerCase()}.png`;
        img.alt = clubName;
        img.title = clubName;
        img.className = "club-badge";
        img.onerror = function() { this.src = 'badges/default.png'; };

        const span = document.createElement('span');
        span.textContent = clubName;
        span.className = "club-name-under-badge";

        cell.appendChild(img);
        cell.appendChild(span);
    }
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
            if (cell.textContent === "CHOOSE CATEGORY") {
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
        topClubs = data.top;
        leftClubs = data.left;
        clubCellsTop.forEach((cell, i) => setClubCellWithBadgeAndName(cell, topClubs[i]));
        clubCellsLeft.forEach((cell, i) => setClubCellWithBadgeAndName(cell, leftClubs[i]));
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

    document.querySelectorAll('.cell').forEach(cell => {
        cell.innerHTML = "";
        cell.removeAttribute("data-locked");
        cell.disabled = false;
        cell.style.cursor = "pointer";
        cell.onclick = function() {
            if (currentMode === "manual" && !allClubsChosen()) {
                return;
            }
            if (cell.hasAttribute("data-locked")) return;
            currentGridCell = cell;
            showModal(playerModal);
            populatePlayerModal(cell);
        };
    });
    if (currentMode === "manual" && !allClubsChosen()) {
        lockGridCells();
    }
}

function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// --- Only show clubs not already chosen and not making impossible grids ---
function populateClubModal() {
    clubSearch.value = "";
    clubList.innerHTML = "";

    // clubs is the union of all elements in easy and hard but not in nationsList
    const easyClubs = categoriesData["easy"] || [];
    const hardClubs = categoriesData["hard"] || [];
    let clubsSet = new Set([...easyClubs, ...hardClubs]);
    nationsList.forEach(nation => clubsSet.delete(nation));
    let clubs = Array.from(clubsSet).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    // hnl clubs should also be minus nations
    const hnlClubs = (categoriesData["hnl"] || []).filter(name => !nationsList.includes(name))
        .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    // nations list for modal
    const nations = nationsList.slice().sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    // others (from otherList)
    const others = (otherList || []).slice().sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));

    let oldBtnsDiv = clubList.parentElement.querySelector(".club-filter-buttons");
    if (oldBtnsDiv) oldBtnsDiv.remove();

    let btnsDiv = document.createElement("div");
    btnsDiv.className = "club-filter-buttons";
    btnsDiv.style.display = "flex";
    btnsDiv.style.justifyContent = "space-between";
    btnsDiv.style.marginBottom = "10px";
    btnsDiv.style.gap = "6px";
    btnsDiv.innerHTML = `
        <button class="club-filter-btn active" data-type="clubs" style="flex:1;font-weight:bold">CLUBS</button>
        <button class="club-filter-btn" data-type="nations" style="flex:1;font-weight:bold">NATIONS</button>
        <button class="club-filter-btn" data-type="hnl" style="flex:1;font-weight:bold">HNL</button>
        <button class="club-filter-btn" data-type="other" style="flex:1;font-weight:bold">OTHER</button>
    `;
    clubList.parentElement.insertBefore(btnsDiv, clubList);

    setTimeout(() => clubSearch.focus(), 0);

    let currentIndex = 0;
    let mouseActiveIndex = -1;
    let mouseHovering = false;
    let currentListType = "clubs";
    let visibleClubs = [];

    function updateActiveListItem() {
        Array.from(clubList.children).forEach((li, idx) => {
            if (mouseActiveIndex > -1 && mouseHovering) {
                li.classList.toggle("active", idx === mouseActiveIndex);
            } else {
                li.classList.toggle("active", idx === currentIndex && !mouseHovering);
            }
        });
    }

    function renderList(type) {
        currentListType = type;
        let srcList;
        if (type === "clubs") {
            srcList = clubs;
            clubSearch.placeholder = "Search club...";
        } else if (type === "hnl") {
            srcList = hnlClubs;
            clubSearch.placeholder = "Search HNL club...";
        } else if (type === "nations") {
            srcList = nations;
            clubSearch.placeholder = "Search nation...";
        } else {
            srcList = others;
            clubSearch.placeholder = "Search other...";
        }
        const searchQuery = clubSearch.value.trim().toLowerCase();
        visibleClubs = srcList.filter(clubName =>
            !usedClubs.has(clubName) &&
            clubName.toLowerCase().includes(searchQuery)
        );

        clubList.innerHTML = "";
        visibleClubs.forEach((clubName, idx) => {
            let li = document.createElement("li");

            let badgeImg = document.createElement("img");
            badgeImg.className = "club-badge club-badge-in-list";
            badgeImg.style.width = "34px";
            badgeImg.style.height = "34px";
            badgeImg.style.objectFit = "contain";
            badgeImg.style.marginRight = "10px";
            badgeImg.style.verticalAlign = "middle";
            badgeImg.style.background = "transparent";
            badgeImg.style.display = "inline-block";
            badgeImg.alt = clubName;
            badgeImg.src = `badges/${clubName.toLowerCase()}.png`;
            badgeImg.onerror = function() { this.src = "badges/default.png"; };

            li.style.display = "flex";
            li.style.alignItems = "center";
            li.style.gap = "10px";
            li.appendChild(badgeImg);

            let span = document.createElement("span");
            span.className = "club-list-name";
            span.textContent = clubName;
            li.appendChild(span);

            li.onclick = function() {
                let testTop = [...topClubs];
                let testLeft = [...leftClubs];
                let posType, posIdx;
                if (currentClubCell.classList.contains('top')) {
                    posType = "top";
                    posIdx = parseInt(currentClubCell.getAttribute('data-idx'));
                } else {
                    posType = "left";
                    posIdx = parseInt(currentClubCell.getAttribute('data-idx'));
                }
                if (posType === "top") testTop[posIdx] = clubName;
                else testLeft[posIdx] = clubName;

                let possible = true;
                for (let row = 0; row < 3 && possible; ++row) {
                    for (let col = 0; col < 3 && possible; ++col) {
                        let c1 = testTop[col];
                        let c2 = testLeft[row];
                        if (c1 !== "CHOOSE CATEGORY" && c2 !== "CHOOSE CATEGORY") {
                            let ok = categoriesHaveIntersectionSync(c1, c2);
                            if (!ok) {
                                Swal.fire({
                                    html: "<b>PLEASE, CHOOSE ANOTHER CATEGORY!</b><br>There isn't a player that fits these two categories:<br><b>" + c1 + "</b> and <b>" + c2 + "</b>",
                                    icon: "warning",
                                    background: '#174e2c',
                                    color: '#ffffff'
                                });
                                possible = false;
                            }
                        }
                    }
                }
                if (!possible) return;

                setClubCellWithBadgeAndName(currentClubCell, clubName);
                usedClubs.add(clubName);
                if (posType === "top") topClubs[posIdx] = clubName;
                else leftClubs[posIdx] = clubName;
                currentClubCell.onclick = null;
                currentClubCell.style.cursor = "default";
                hideModal(clubModal);
                if (allClubsChosen()) unlockGridCells();
            };

            li.onmouseenter = function () {
                mouseActiveIndex = idx;
                mouseHovering = true;
                updateActiveListItem();
            };
            li.onmouseleave = function () {
                mouseActiveIndex = -1;
                mouseHovering = false;
                updateActiveListItem();
            };
            clubList.appendChild(li);
        });
        // highlight first element if exists and not hovering
        currentIndex = (visibleClubs.length > 0 && clubSearch.value.trim() !== "") ? 0 : -1;
        mouseActiveIndex = -1;
        mouseHovering = false;
        updateActiveListItem();
        // Remove highlight from all when mouse leaves the list area
        clubList.onmouseleave = function() {
            mouseActiveIndex = -1;
            mouseHovering = false;
            currentIndex = -1;
            updateActiveListItem();
        };
        clubList.onmouseenter = function() {};
    }

    clubSearch.oninput = function() {
        renderList(currentListType);
        clubList.onmouseleave = function() {
            mouseActiveIndex = -1;
            mouseHovering = false;
            currentIndex = -1; // No highlight until search changes again
            updateActiveListItem();
        if (clubSearch.value.trim() !== "" && visibleClubs.length > 0) {
            currentIndex = 0;
        } else {
            currentIndex = -1;
        }
        mouseActiveIndex = -1;
        mouseHovering = false;
        updateActiveListItem();
};
    };

    clubSearch.onkeydown = function(e) {
        if (!visibleClubs.length) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (currentIndex === -1) {
                currentIndex = 0;
            } else {
                currentIndex = (currentIndex + 1) % visibleClubs.length;
            }
            mouseActiveIndex = -1;
            mouseHovering = false;
            updateActiveListItem();
            let li = clubList.children[currentIndex];
            if (li) li.scrollIntoView({block: "nearest"});
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (currentIndex === -1) {
                currentIndex = visibleClubs.length - 1;
            } else {
                currentIndex = (currentIndex - 1 + visibleClubs.length) % visibleClubs.length;
            }
            mouseActiveIndex = -1;
            mouseHovering = false;
            updateActiveListItem();
            let li = clubList.children[currentIndex];
            if (li) li.scrollIntoView({block: "nearest"});
        } else if (e.key === "Enter") {
            e.preventDefault();
            let chosenIdx = (mouseHovering && mouseActiveIndex > -1) ? mouseActiveIndex : currentIndex;
            if (chosenIdx >= 0 && clubList.children[chosenIdx]) {
                clubList.children[chosenIdx].click();
            }
        }
    };

    btnsDiv.querySelectorAll(".club-filter-btn").forEach(btn => {
        btn.onclick = function() {
            btnsDiv.querySelectorAll(".club-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            clubSearch.value = "";
            renderList(btn.getAttribute("data-type"));
            clubList.onmouseleave = function() {
                mouseActiveIndex = -1;
                mouseHovering = false;
                currentIndex = -1; // No highlight until search changes again
                updateActiveListItem();
            };
            setTimeout(() => clubSearch.focus(), 0);
        };
    });

    renderList("clubs");
        clubList.onmouseleave = function() {
        mouseActiveIndex = -1;
        mouseHovering = false;
        currentIndex = -1; // No highlight until search changes again
        updateActiveListItem();
    };
    clubList.scrollTop = 0;
}



function getPlayersForCategories(catA, catB) {
    if (!catA || !catB || catA === "CHOOSE CATEGORY" || catB === "CHOOSE CATEGORY") return [];
    const setA = categoryPlayersMap[catA] || new Set();
    const setB = categoryPlayersMap[catB] || new Set();
    return Array.from(setA).filter(id => setB.has(id));
}

// --- Modal for picking a player; displays ALL players, date of birth if present ---
function populatePlayerModal(cell) {
    playerSearch.value = "";
    playerList.innerHTML = "";

    let visiblePlayerIds = [];
    let currentIndex = -1;
    let mouseActiveIndex = -1;
    let mouseHovering = false;

    setTimeout(() => {
        playerSearch.focus();

        playerSearch.oninput = debounce(function () {
            renderPlayerList();
        }, 150);

        playerSearch.onkeydown = function (e) {
            if (!visiblePlayerIds.length) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (currentIndex === -1) {
                    currentIndex = 0;
                } else {
                    currentIndex = (currentIndex + 1) % visiblePlayerIds.length;
                }
                mouseActiveIndex = -1;
                mouseHovering = false;
                updateActiveListItem();
                let li = playerList.children[currentIndex];
                if (li) li.scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (currentIndex === -1) {
                    currentIndex = visiblePlayerIds.length - 1;
                } else {
                    currentIndex = (currentIndex - 1 + visiblePlayerIds.length) % visiblePlayerIds.length;
                }
                mouseActiveIndex = -1;
                mouseHovering = false;
                updateActiveListItem();
                let li = playerList.children[currentIndex];
                if (li) li.scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
                e.preventDefault();
                let chosenIdx = (mouseHovering && mouseActiveIndex > -1) ? mouseActiveIndex : currentIndex;
                if (chosenIdx >= 0 && playerList.children[chosenIdx]) {
                    playerList.children[chosenIdx].click();
                }
            }
        };

        function renderPlayerList() {
            const searchQuery = normalizeStr(playerSearch.value.trim());
            if (!searchQuery) {
                playerList.innerHTML = "";
                visiblePlayerIds = [];
                currentIndex = -1;
                mouseActiveIndex = -1;
                mouseHovering = false;
                return;
            }
            visiblePlayerIds = allAvailablePlayerIds
                .filter(pid => !usedPlayers.has(pid))
                .map(pid => playerIdMap[pid])
                .filter(player => player && normalizeStr(player.name).includes(searchQuery))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}))
                .map(player => player.id);

            playerList.innerHTML = "";
            visiblePlayerIds.forEach((playerId, idx) => {
                const player = playerIdMap[playerId];
                let li = document.createElement("li");
                li.textContent = player.name + (player.dateOfBirth ? ` (${player.dateOfBirth})` : "");
                li.onclick = function () {
                    handlePlayerPick(cell, playerId);
                    hideModal(playerModal);
                };
                li.onmouseenter = function () {
                    mouseActiveIndex = idx;
                    mouseHovering = true;
                    updateActiveListItem();
                };
                li.onmouseleave = function () {
                    mouseActiveIndex = -1;
                    mouseHovering = false;
                    updateActiveListItem();
                };
                playerList.appendChild(li);
            });

            if (visiblePlayerIds.length > 0 && playerSearch.value.trim() !== "") {
                currentIndex = 0;
            } else {
                currentIndex = -1;
            }
            mouseActiveIndex = -1;
            mouseHovering = false;
            updateActiveListItem();

            playerList.addEventListener("mouseleave", function() {
                mouseActiveIndex = -1;
                mouseHovering = false;
                currentIndex = -1;
                updateActiveListItem();
            });
        }

        function updateActiveListItem() {
            Array.from(playerList.children).forEach((li, idx) => {
                if (mouseActiveIndex > -1 && mouseHovering) {
                    li.classList.toggle("active", idx === mouseActiveIndex);
                } else {
                    li.classList.toggle("active", idx === currentIndex && !mouseHovering && currentIndex > -1);
                }
            });
        }

        renderPlayerList();
    }, 0);
}

// --- WIN CHECK ---
function checkWin() {
    for (let r = 0; r < 3; r++) {
        if (gridState[r][0] && gridState[r][0] === gridState[r][1] && gridState[r][1] === gridState[r][2]) {
            showWin(gridState[r][0]);
            return;
        }
    }
    for (let c = 0; c < 3; c++) {
        if (gridState[0][c] && gridState[0][c] === gridState[1][c] && gridState[1][c] === gridState[2][c]) {
            showWin(gridState[0][c]);
            return;
        }
    }
    if (gridState[0][0] && gridState[0][0] === gridState[1][1] && gridState[1][1] === gridState[2][2]) {
        showWin(gridState[0][0]);
        return;
    }
    if (gridState[0][2] && gridState[0][2] === gridState[1][1] && gridState[1][1] === gridState[2][0]) {
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
                ticTurn = "X";
                updateTurnInfo();
            } else {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                document.getElementById('manual').classList.add('active');
                currentMode = "manual";
                renderClubs(currentMode);
                renderGrid();
                ticTurn = "X";
                updateTurnInfo();
            }
        });
    }, 100);
}

async function handlePlayerPick(cell, playerId) {
    let row = parseInt(cell.dataset.row), col = parseInt(cell.dataset.col);
    let rowCat = leftClubs[row];
    let colCat = topClubs[col];

    const playersCol = categoryPlayersMap[colCat] || new Set();
    const playersRow = categoryPlayersMap[rowCat] || new Set();

    let isValid = playersCol.has(playerId) && playersRow.has(playerId);

    if (isValid) {
        usedPlayers.add(playerId);
        const player = playerIdMap[playerId];
        cell.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <span class="tic-sign">${ticTurn === "X" ? "✖" : "◯"}</span>
                <span class="player-under-sign">${getDisplaySurname(player.name)}</span>
            </div>
        `;
        gridState[row][col] = ticTurn;
        cell.setAttribute("data-locked", "true");
        cell.disabled = true;
        cell.style.cursor = "default";
        cell.onclick = null;
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
    return topClubs.every(c => c !== "CHOOSE CATEGORY") && leftClubs.every(c => c !== "CHOOSE CATEGORY");
}

function lockGridCells() {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.disabled = true;
        cell.style.cursor = "default";
    });
}
function unlockGridCells() {
    document.querySelectorAll('.cell').forEach(cell => {
        if (!cell.hasAttribute("data-locked")) {
            cell.disabled = false;
            cell.style.cursor = "pointer";
        }
    });
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
function showModal(modal) { modal.style.display = "block"; }
function hideModal(modal) { modal.style.display = "none"; }
document.getElementById("closeClubModal").onclick = () => hideModal(clubModal);
document.getElementById("closePlayerModal").onclick = () => hideModal(playerModal);
window.onclick = (event) => {
    if (event.target == clubModal) hideModal(clubModal);
    if (event.target == playerModal) hideModal(playerModal);
};


dataReadyPromise.then(() => {
    renderClubs();
    renderGrid();
    ticTurn = "X";
    updateTurnInfo();
});