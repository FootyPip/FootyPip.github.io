let currentClubCell = null;
let currentGridCell = null;
let currentMode = "manual"; // default
let topClubs = [];
let leftClubs = [];
let gridState = [
    [null, null, null],
    [null, null, null],
    [null, null, null]
];
let usedClubs = new Set();
let usedPlayers = new Set();
let clubsData = null;
let playersData = null;
let allAvailablePlayers = null;
let clubPlayersMap = {};

const NATIONS_LIST = [
  "Argentina","France","England","Brazil","Portugal","Spain","Netherlands","Germany","Italy","Croatia","Uruguay","Belgium","Switzerland","Morocco","Mexico","Japan","Senegal","Colombia","Austria","Denmark","Norway","Poland","South Korea","Ukraine","USA"
];
const OTHER_LIST = [
  "UCL winner", "World cup winner", "Played in HNL"
];

// --- Tic-Tac-Toe Turn State ---
let ticTurn = "X"; // X always starts

function updateTurnInfo() {
    document.getElementById("turn-info").innerHTML = 
        `Turn: <span class="turn-symbol">${ticTurn === "X" ? "✖" : "◯"}</span>`;
}
updateTurnInfo()
// Skip turn logic
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
        fetchClubs(),
        fetchPlayers()
    ]);
})();

async function fetchClubs(mode = null) {
    if (!clubsData) {
        const res = await fetch("data/clubs.json");
        clubsData = await res.json();
    }
    let clubArray;
    if (mode === "manual") {
        clubArray = Array.from(
            new Set([
                ...clubsData["hard"],
                ...clubsData["hnl"]
            ])
        );
    } else if (mode === "random-hard" || mode === "hard") {
        clubArray = clubsData["hard"];
    } else if (mode === "croatian-league" || mode === "hnl") {
        clubArray = clubsData["hnl"];
    } else {
        clubArray = clubsData["easy"];
    }
    return clubArray
        .slice()
        .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
        .map(name => ({ name }));
}

async function fetchPlayers(club = null) {
    if (!playersData) {
        const res = await fetch("data/players.json");
        playersData = await res.json();
    }
    let playerList;
    if (club && club !== "CHOOSE CATEGORY" && playersData[club]) {
        playerList = playersData[club];
    } else {
        const allPlayers = new Set();
        Object.values(playersData).forEach(arr => arr.forEach(p => allPlayers.add(p)));
        playerList = Array.from(allPlayers);
    }
    return playerList
        .slice()
        .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
        .map(name => ({ name }));
}

async function prepareAllAvailablePlayers() {
    await dataReadyPromise;
    const allPlayers = new Set();
    Object.values(playersData).forEach(arr => arr.forEach(p => allPlayers.add(p)));
    allAvailablePlayers = Array.from(allPlayers).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// --- Club → Player Set Precompute ---
function buildClubPlayersMap() {
    clubPlayersMap = {};
    for (const [club, players] of Object.entries(playersData)) {
        clubPlayersMap[club] = new Set(players);
    }
}

// --- FAST INTERSECTION CHECK ---
function clubsHaveIntersectionSync(clubA, clubB) {
    if (!clubA || !clubB || clubA === "CHOOSE CATEGORY" || clubB === "CHOOSE CATEGORY") return true;
    const setA = clubPlayersMap[clubA];
    const setB = clubPlayersMap[clubB];
    if (!setA || !setB) return false;
    for (const player of setA) {
        if (setB.has(player)) return true;
    }
    return false;
}

// --- FAST RANDOM CLUBS ---
function getRandomValidClubsSync(clubsList) {
    let tries = 0;
    while (tries < 30) {
        let clubNames = clubsList.slice().sort(() => Math.random() - 0.5);
        let top = clubNames.slice(0, 3);
        let left = clubNames.slice(3, 6);
        let ok = true;
        for (let row = 0; row < 3 && ok; ++row) {
            for (let col = 0; col < 3 && ok; ++col) {
                let c1 = top[col];
                let c2 = left[row];
                if (!clubsHaveIntersectionSync(c1, c2)) ok = false;
            }
        }
        if (ok) return { top, left };
        tries++;
    }
    // fallback:
    let clubNames = clubsList.slice();
    return {
        top: clubNames.slice(0, 3),
        left: clubNames.slice(3, 6)
    };
}

// --- Utility: Does there exist a player for both clubs? (async, only used in manual mode) ---
async function clubsHaveIntersection(clubA, clubB) {
    if (!clubA || !clubB || clubA === "CHOOSE CATEGORY" || clubB === "CHOOSE CATEGORY") return true;
    let [playersA, playersB] = await Promise.all([
        fetchPlayers(clubA),
        fetchPlayers(clubB)
    ]);
    let setA = new Set(playersA.map(p => p.name));
    return playersB.some(p => setA.has(p.name));
}

// --- Club Positions (manual/random) ---
async function fetchClubPositions(mode = "manual") {
    if (mode === "manual") {
        return {
            top: ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"],
            left: ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"]
        };
    }

    // For random modes: Use fast sync version!
    let clubs = await fetchClubs(mode);
    let clubNames = clubs.map(c => c.name);
    return getRandomValidClubsSync(clubNames);
}

// --- For random modes: Try picking clubs until a valid grid is found (NO LONGER USED, kept for reference only) ---
// async function getRandomValidClubs(mode) {
//     let tries = 0;
//     let data;
//     while (tries < 30) { // Try up to 30 times before giving up
//         data = await fetchClubPositions(mode);
//         let ok = true;
//         for (let row = 0; row < 3 && ok; ++row) {
//             for (let col = 0; col < 3 && ok; ++col) {
//                 let c1 = data.top[col];
//                 let c2 = data.left[row];
//                 let fits = await clubsHaveIntersection(c1, c2);
//                 if (!fits) ok = false;
//             }
//         }
//         if (ok) return data;
//         tries++;
//     }
//     alert("Could not find a valid club grid after multiple tries!");
//     // fallback: just return whatever, to not break UI
//     return await fetchClubPositions(mode);
// }

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
        // Reset to "CHOOSE CATEGORY"
        topClubs = ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"];
        leftClubs = ["CHOOSE CATEGORY", "CHOOSE CATEGORY", "CHOOSE CATEGORY"];
        clubCellsTop.forEach((cell, i) => setClubCellWithBadgeAndName(cell, "CHOOSE CATEGORY"));
        clubCellsLeft.forEach((cell, i) => setClubCellWithBadgeAndName(cell, "CHOOSE CATEGORY"));
        // Enable club picking
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
        // RANDOM MODES - fill clubs from backend, but only if all intersections are valid
        // Use new fast logic
        let data = await fetchClubPositions(mode);
        topClubs = data.top;
        leftClubs = data.left;
        clubCellsTop.forEach((cell, i) => setClubCellWithBadgeAndName(cell, topClubs[i]));
        clubCellsLeft.forEach((cell, i) => setClubCellWithBadgeAndName(cell, leftClubs[i]));
        // Lock club cells
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
            // In manual mode: block until all clubs chosen
            if (currentMode === "manual" && !allClubsChosen()) {
                return;
            }
            // Don't allow click if already locked:
            if (cell.hasAttribute("data-locked")) return;
            currentGridCell = cell;
            showModal(playerModal);
            populatePlayerModal(cell);
        };
    });
    // In manual mode: lock all grid cells until clubs chosen
    if (currentMode === "manual" && !allClubsChosen()) {
        lockGridCells();
    }
}

function getClubNameFromCell(cell) {
    if (cell.textContent === "CHOOSE CATEGORY" || cell.textContent === "") return null;
    let span = cell.querySelector(".club-name-under-badge");
    return span ? span.textContent : null;
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
    
    const hardClubs = clubsData["hard"];
    const hnlClubs = clubsData["hnl"];
    function filterRealClubs(arr) {
        return arr.filter(
            name => !NATIONS_LIST.includes(name) && !OTHER_LIST.includes(name)
        );
    }
    const clubs = filterRealClubs(hardClubs).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    const hnl = filterRealClubs(hnlClubs).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    const nations = hardClubs.filter(c => NATIONS_LIST.includes(c)).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    const others = hardClubs.filter(c => OTHER_LIST.includes(c)).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));

    // --- Add filter buttons (always above clubList, never replacing it) ---
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

    let currentIndex = 0; // for keyboard navigation
    let currentListType = "clubs";
    let visibleClubs = [];

    function renderList(type) {
        currentListType = type;
        let srcList;
        if (type === "clubs") {
            srcList = clubs;
            clubSearch.placeholder = "Search club...";
        } else if (type === "hnl") {
            srcList = hnl;
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
                // Simulate the tentative club selection
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

                // Check all intersections (sync, instant)
                let possible = true;
                for (let row = 0; row < 3 && possible; ++row) {
                    for (let col = 0; col < 3 && possible; ++col) {
                        let c1 = testTop[col];
                        let c2 = testLeft[row];
                        if (c1 !== "CHOOSE CATEGORY" && c2 !== "CHOOSE CATEGORY") {
                            let ok = clubsHaveIntersectionSync(c1, c2);
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
            clubList.appendChild(li);
        });
        clubList.scrollTop = 0;
        currentIndex = -1;
        updateActiveListItem();
    }

    function updateActiveListItem() {
        Array.from(clubList.children).forEach((li, idx) => {
            if (idx === currentIndex) {
                li.classList.add("active");
            } else {
                li.classList.remove("active");
            }
        });
    }

    clubSearch.oninput = function() {
        renderList(currentListType);
        currentIndex = 0;
        updateActiveListItem();
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
            updateActiveListItem();
            let li = clubList.children[currentIndex];
            if (li) li.scrollIntoView({block: "nearest"});
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (currentIndex >= 0 && clubList.children[currentIndex]) {
                clubList.children[currentIndex].click();
            }
        }
    };

    btnsDiv.querySelectorAll(".club-filter-btn").forEach(btn => {
        btn.onclick = function() {
            btnsDiv.querySelectorAll(".club-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            clubSearch.value = "";
            renderList(btn.getAttribute("data-type"));
            setTimeout(() => clubSearch.focus(), 0);
        };
    });

    renderList("clubs");
    clubList.scrollTop = 0;
}

function populatePlayerModal(cell) {
    playerSearch.value = "";
    playerList.innerHTML = "";

    // No loading spinner needed!
    let visiblePlayers = [];
    let currentIndex = -1;

    setTimeout(() => {
        playerSearch.focus();

        playerSearch.oninput = debounce(function () {
            renderPlayerList();
        }, 150);

        playerSearch.onkeydown = function (e) {
            if (!visiblePlayers.length) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (currentIndex === -1) {
                    currentIndex = 0;
                } else {
                    currentIndex = (currentIndex + 1) % visiblePlayers.length;
                }
                updateActiveListItem();
                let li = playerList.children[currentIndex];
                if (li) li.scrollIntoView({ block: "nearest" });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (currentIndex === -1) {
                    currentIndex = visiblePlayers.length - 1;
                } else {
                    currentIndex = (currentIndex - 1 + visiblePlayers.length) % visiblePlayers.length;
                }
                updateActiveListItem();
                let li = playerList.children[currentIndex];
                if (li) li.scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (currentIndex >= 0 && playerList.children[currentIndex]) {
                    playerList.children[currentIndex].click();
                }
            }
        };

        function renderPlayerList() {
            const searchQuery = normalizeStr(playerSearch.value.trim());
            if (!searchQuery) {
                playerList.innerHTML = "";
                visiblePlayers = [];
                currentIndex = -1;
                return;
            }
            visiblePlayers = allAvailablePlayers.filter(playerName =>
                !usedPlayers.has(playerName) &&
                normalizeStr(playerName).includes(searchQuery)
            );
            playerList.innerHTML = "";
            visiblePlayers.forEach((playerName, idx) => {
                let li = document.createElement("li");
                li.textContent = playerName;
                li.onclick = function () {
                    handlePlayerPick(cell, playerName);
                    hideModal(playerModal);
                };
                playerList.appendChild(li);
            });
            currentIndex = visiblePlayers.length > 0 ? 0 : -1;
            updateActiveListItem();
        }

        function updateActiveListItem() {
            Array.from(playerList.children).forEach((li, idx) => {
                if (idx === currentIndex) {
                    li.classList.add("active");
                } else {
                    li.classList.remove("active");
                }
            });
        }
    }, 0);
}

// --- WIN CHECK ---
function checkWin() {
    // Rows
    for (let r = 0; r < 3; r++) {
        if (gridState[r][0] && gridState[r][0] === gridState[r][1] && gridState[r][1] === gridState[r][2]) {
            showWin(gridState[r][0]);
            return;
        }
    }
    // Columns
    for (let c = 0; c < 3; c++) {
        if (gridState[0][c] && gridState[0][c] === gridState[1][c] && gridState[1][c] === gridState[2][c]) {
            showWin(gridState[0][c]);
            return;
        }
    }
    // Diagonals
    if (gridState[0][0] && gridState[0][0] === gridState[1][1] && gridState[1][1] === gridState[2][2]) {
        showWin(gridState[0][0]);
        return;
    }
    if (gridState[0][2] && gridState[0][2] === gridState[1][1] && gridState[1][1] === gridState[2][0]) {
        showWin(gridState[0][2]);
        return;
    }
    // Draw?
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
                renderClubs(currentMode); // Start new round
                renderGrid();
                ticTurn = "X";
                updateTurnInfo();
            } else {
                // Go to start menu: reset to manual mode and reset UI
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

async function handlePlayerPick(cell, playerName) {
    let row = parseInt(cell.dataset.row), col = parseInt(cell.dataset.col);
    let rowCat = leftClubs[row];
    let colCat = topClubs[col];

    let [playersCol, playersRow] = await Promise.all([
        fetchPlayers(colCat),
        fetchPlayers(rowCat)
    ]);
    let playerSetCol = new Set(playersCol.map(p => p.name));
    let playerSetRow = new Set(playersRow.map(p => p.name));

    let isValid = playerSetCol.has(playerName) && playerSetRow.has(playerName);

    if (isValid) {
        usedPlayers.add(playerName);
        cell.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <span class="tic-sign">${ticTurn === "X" ? "✖" : "◯"}</span>
                <span class="player-under-sign">${getDisplaySurname(playerName)}</span>
            </div>
        `;
        gridState[row][col] = ticTurn;
        // Lock this cell:
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
    // Remove bracketed part
    let nameNoBracket = playerName.replace(/\s*\(.*?\)\s*/g, '').trim();
    // Split into words
    let words = nameNoBracket.split(/\s+/);
    // Rules:
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

// Gamemode buttons
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

// Modal logic (unchanged)
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

// --- INIT ---

// --- LOADING OVERLAY ---
// Create loading overlay and spinner
const loadingOverlay = document.createElement('div');
loadingOverlay.id = 'loading-overlay';
loadingOverlay.style.position = 'fixed';
loadingOverlay.style.top = '0';
loadingOverlay.style.left = '0';
loadingOverlay.style.width = '100vw';
loadingOverlay.style.height = '100vh';
loadingOverlay.style.background = 'rgba(23, 78, 44, 0.95)';
loadingOverlay.style.display = 'flex';
loadingOverlay.style.flexDirection = 'column';
loadingOverlay.style.justifyContent = 'center';
loadingOverlay.style.alignItems = 'center';
loadingOverlay.style.zIndex = '9999';
loadingOverlay.innerHTML = `
  <div style="display:flex;flex-direction:column;align-items:center;gap:24px;">
    <div class="spinner" style="width:64px;height:64px;border:8px solid #19d678;border-top:8px solid #fff;border-radius:50%;animation:spin 1s linear infinite;"></div>
    <div style="color:#fff;font-size:2rem;font-weight:bold;letter-spacing:2px;">Loading...</div>
  </div>
`;
document.body.appendChild(loadingOverlay);

// Add spinner animation style
const style = document.createElement('style');
style.innerHTML = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;
document.head.appendChild(style);

// Show loading overlay until data is ready and UI is rendered
dataReadyPromise.then(() => {
    buildClubPlayersMap();
    prepareAllAvailablePlayers().then(() => {
        renderClubs();
        renderGrid();
        ticTurn = "X";
        updateTurnInfo();
        // Hide loading overlay
        loadingOverlay.style.display = 'none';
    });
});
