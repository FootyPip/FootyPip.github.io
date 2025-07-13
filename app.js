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

// --- Tic-Tac-Toe Turn State ---
let ticTurn = "X"; // X always starts

function updateTurnInfo() {
    document.getElementById("turn-info").textContent = `Turn: ${ticTurn === "X" ? "✖" : "◯"}`;
}

// Skip turn logic
document.getElementById("skip-turn-btn").onclick = function() {
    ticTurn = ticTurn === "X" ? "O" : "X";
    updateTurnInfo();
};

function normalizeStr(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// --- DATA LOADERS ---
let clubsData = null;
let playersData = null;

async function fetchClubs(mode = null) {
    if (!clubsData) {
        const res = await fetch("data/clubs.json");
        clubsData = await res.json();
    }
    let clubArray;
    if (mode === "manual") {
        // Combine and deduplicate 'hard' and 'hnl' clubs
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
    // Return array of objects for compatibility, SORTED ALPHABETICALLY
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
    if (club && club !== "CHOOSE CLUB" && playersData[club]) {
        playerList = playersData[club];
    } else {
        // All unique players
        const allPlayers = new Set();
        Object.values(playersData).forEach(arr => arr.forEach(p => allPlayers.add(p)));
        playerList = Array.from(allPlayers);
    }
    // SORT alphabetically and return as [{name: ...}, ...]
    return playerList
        .slice()
        .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))
        .map(name => ({ name }));
}

async function fetchClubPositions(mode = "manual") {
    // Only manual mode is truly supported in static mode
    if (mode === "manual") {
        return {
            top: ["CHOOSE CLUB", "CHOOSE CLUB", "CHOOSE CLUB"],
            left: ["CHOOSE CLUB", "CHOOSE CLUB", "CHOOSE CLUB"]
        };
    }

    // For random modes, pick from clubs (ensure intersection for each cell)
    let tries = 0;
    while (tries < 30) {
        let top = [];
        let left = [];
        let clubs = await fetchClubs(mode);
        let clubNames = clubs.map(c => c.name);
        // Shuffle
        clubNames = clubNames.sort(() => Math.random() - 0.5);
        top = clubNames.slice(0, 3);
        left = clubNames.slice(3, 6);
        // Check all intersections
        let ok = true;
        for (let row = 0; row < 3 && ok; ++row) {
            for (let col = 0; col < 3 && ok; ++col) {
                let c1 = top[col];
                let c2 = left[row];
                let intersection = await clubsHaveIntersection(c1, c2);
                if (!intersection) ok = false;
            }
        }
        if (ok) return { top, left };
        tries++;
    }
    // fallback
    let clubs = await fetchClubs(mode);
    let clubNames = clubs.map(c => c.name);
    return {
        top: clubNames.slice(0, 3),
        left: clubNames.slice(3, 6)
    };
}

// --- Utility: Does there exist a player for both clubs? ---
async function clubsHaveIntersection(clubA, clubB) {
    if (!clubA || !clubB || clubA === "CHOOSE CLUB" || clubB === "CHOOSE CLUB") return true; // Don't block empty/initial
    let [playersA, playersB] = await Promise.all([
        fetchPlayers(clubA),
        fetchPlayers(clubB)
    ]);
    let setA = new Set(playersA.map(p => p.name));
    return playersB.some(p => setA.has(p.name));
}

// For random modes: Try picking clubs until a valid grid is found.
async function getRandomValidClubs(mode) {
    let tries = 0;
    let data;
    while (tries < 30) { // Try up to 30 times before giving up
        data = await fetchClubPositions(mode);
        let ok = true;
        for (let row = 0; row < 3 && ok; ++row) {
            for (let col = 0; col < 3 && ok; ++col) {
                let c1 = data.top[col];
                let c2 = data.left[row];
                let fits = await clubsHaveIntersection(c1, c2);
                if (!fits) ok = false;
            }
        }
        if (ok) return data;
        tries++;
    }
    alert("Could not find a valid club grid after multiple tries!");
    // fallback: just return whatever, to not break UI
    return await fetchClubPositions(mode);
}

function setClubCellWithBadgeAndName(cell, clubName) {
    cell.innerHTML = "";
    if (clubName === "CHOOSE CLUB") {
        cell.textContent = "CHOOSE CLUB";
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
        // Reset to "CHOOSE CLUB"
        topClubs = ["CHOOSE CLUB", "CHOOSE CLUB", "CHOOSE CLUB"];
        leftClubs = ["CHOOSE CLUB", "CHOOSE CLUB", "CHOOSE CLUB"];
        clubCellsTop.forEach((cell, i) => setClubCellWithBadgeAndName(cell, "CHOOSE CLUB"));
        clubCellsLeft.forEach((cell, i) => setClubCellWithBadgeAndName(cell, "CHOOSE CLUB"));
        // Enable club picking
        document.querySelectorAll('.club-cell.top, .club-cell.left').forEach(cell => {
            if (cell.textContent === "CHOOSE CLUB") {
                cell.onclick = function() {
                    currentClubCell = cell;
                    populateClubModal();
                    showModal(clubModal);
                };
                cell.style.cursor = "pointer";
            } else {
                cell.onclick = null;
                cell.style.cursor = "default";
            }
        });
    } else {
        // RANDOM MODES - fill clubs from backend, but only if all intersections are valid
        let data = await getRandomValidClubs(mode);
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

function renderGrid() {
    usedPlayers = new Set();
    gridState = [
        [null, null, null],
        [null, null, null],
        [null, null, null]
    ];
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
            populatePlayerModal(cell);
            showModal(playerModal);
        };
    });
    // In manual mode: lock all grid cells until clubs chosen
    if (currentMode === "manual" && !allClubsChosen()) {
        lockGridCells();
    }
}

function getClubNameFromCell(cell) {
    if (cell.textContent === "CHOOSE CLUB" || cell.textContent === "") return null;
    let span = cell.querySelector(".club-name-under-badge");
    return span ? span.textContent : null;
}

// --- Only show clubs not already chosen and not making impossible grids ---
async function populateClubModal() {
    clubSearch.value = ""; 
    clubList.innerHTML = "";
    let clubs = await fetchClubs(currentMode);
    let otherClubs, posType, posIdx;
    if (currentClubCell.classList.contains('top')) {
        posType = "top";
        otherClubs = leftClubs;
        posIdx = parseInt(currentClubCell.getAttribute('data-idx'));
    } else {
        posType = "left";
        otherClubs = topClubs;
        posIdx = parseInt(currentClubCell.getAttribute('data-idx'));
    }
    clubs.forEach(club => {
        let clubName = club.name;
        if (usedClubs.has(clubName)) return;
        let li = document.createElement("li");
        li.textContent = clubName;
        li.onclick = async function() {
            // Simulate the tentative club selection
            let testTop = [...topClubs];
            let testLeft = [...leftClubs];
            if (posType === "top") testTop[posIdx] = clubName;
            else testLeft[posIdx] = clubName;

            // Check all intersections
            let possible = true;
            for (let row = 0; row < 3; ++row) {
                for (let col = 0; col < 3; ++col) {
                    let c1 = testTop[col];
                    let c2 = testLeft[row];
                    if (c1 !== "CHOOSE CLUB" && c2 !== "CHOOSE CLUB") {
                        let ok = await clubsHaveIntersection(c1, c2);
                        if (!ok) {
                            Swal.fire({
                                html: "<b>PLEASE, CHOOSE ANOTHER CLUB!</b><br>Beacuse there isn't a player that fits these two categories:<br><b>" + c1 + "</b> and <b>" + c2 + "</b>",
                                icon: "warning",
                                background: '#174e2c',
                                color: '#ffffff'
                            });
                            return; // Immediately stop, don't set club
                        }
                    }
                }
            }
            if (!possible) return; // Don't pick this club

            // Otherwise, accept the pick as before:
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
    clubSearch.oninput = function() {
        let v = normalizeStr(this.value);
        Array.from(clubList.children).forEach(li => {
            li.style.display = normalizeStr(li.textContent).includes(v) ? "" : "none";
        });
    };
}

// --- REWORK: Only show valid players for the cell! ---
async function populatePlayerModal(cell) {
    playerSearch.value = ""; // <-- reset search at top!
    playerList.innerHTML = "";
    let players = await fetchPlayers();
    let availablePlayers = players.map(p => p.name).filter(p => !usedPlayers.has(p));
    // SORT PLAYERS ALPHABETICALLY
    availablePlayers = availablePlayers.slice().sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    if (availablePlayers.length === 0) {
        let li = document.createElement("li");
        li.textContent = "No players available!";
        li.style.color = "#f44";
        playerList.appendChild(li);
        return;
    }
    availablePlayers.forEach(playerName => {
        let li = document.createElement("li");
        li.textContent = playerName;
        li.onclick = function() {
            handlePlayerPick(cell, playerName);
            hideModal(playerModal);
        };
        playerList.appendChild(li);
    });
    playerSearch.oninput = function() {
        // Remove brackets from search text
        let v = normalizeStr(this.value.replace(/\(.*?\)/g, '').trim());
        Array.from(playerList.children).forEach(li => {
            // Remove brackets from player name for search
            let liName = normalizeStr(li.textContent.replace(/\(.*?\)/g, '').trim());
            li.style.display = liName.includes(v) ? "" : "none";
        });
    };
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
        if (winner === "Draw") {
            alert("It's a draw!");
        } else {
            alert(`Player ${winner === "X" ? "✖" : "◯"} wins!`);
        }
        renderClubs(currentMode); // Reset board
        renderGrid();
        ticTurn = "X";
        updateTurnInfo();
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
    return topClubs.every(c => c !== "CHOOSE CLUB") && leftClubs.every(c => c !== "CHOOSE CLUB");
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
renderClubs();
renderGrid();
ticTurn = "X";
updateTurnInfo();
