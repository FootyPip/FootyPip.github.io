// =====================
// PLAYER PAGE SCRIPT
// =====================

// 1. Read player ID from URL: /player/?27992
const playerId = window.location.search.replace("?", "").trim();

if (!playerId) {
    document.body.innerHTML = "<h2>Player ID missing</h2>";
    throw new Error("Player ID missing");
}

// 2. Calculate JSON bucket
const BUCKET_SIZE = 1000;
const bucket = Math.floor(playerId / BUCKET_SIZE);
const DATA_URL = `../data/players/${bucket}.json`;

// 3. Load optimized JSON
fetch(DATA_URL)
    .then(res => res.json())
    .then(players => {
        const player = players.find(p => p.id == playerId);

        if (!player) {
            document.body.innerHTML = "<h2>Player not found</h2>";
            return;
        }

        renderPlayer(player);
    })
    .catch(err => {
        console.error(err);
        document.body.innerHTML = "<h2>Error loading player data</h2>";
    });


// =====================
// RENDER FUNCTIONS
// =====================

function renderPlayer(player) {
    document.title = `${player.name} | FootyPip`;

    document.getElementById("player-name").innerText = player.name;
    document.getElementById("player-position").innerText = player.position || "-";
    document.getElementById("player-dob").innerText = player.dateOfBirth || "-";
    document.getElementById("player-nationality").innerText =
        (player.nationality || []).join(", ");

    renderClubs(player.clubs);
    renderTrophies(player.trophies);
    renderLeagues(player.leagues);
    renderManagers(player.managers);
}

function renderClubs(clubs) {
    if (!clubs) return;

    let html = `
        <h2>Clubs</h2>
        <table>
            <tr>
                <th>Club</th><th>Apps</th><th>Goals</th>
                <th>Assists</th><th>Minutes</th>
            </tr>
    `;

    for (const [club, s] of Object.entries(clubs)) {
        html += `
            <tr>
                <td>${club}</td>
                <td>${s.apps ?? "-"}</td>
                <td>${s.goals ?? "-"}</td>
                <td>${s.assists ?? "-"}</td>
                <td>${s.minutes ?? "-"}</td>
            </tr>
        `;
    }

    html += "</table>";
    document.getElementById("clubs").innerHTML = html;
}

function renderTrophies(trophies) {
    if (!trophies) return;

    let html = "<h2>Trophies</h2>";

    for (const [name, t] of Object.entries(trophies)) {
        html += `
            <div class="block">
                <h4>${name} 🏆 (${t.titles || 0})</h4>
                <p><strong>Teams:</strong> ${(t.TeamsWithTitles || []).join(", ")}</p>
                <p><strong>Seasons:</strong> ${(t.SeasonsWithTitles || []).join(", ")}</p>
            </div>
        `;
    }

    document.getElementById("trophies").innerHTML = html;
}

function renderLeagues(leagues) {
    if (!leagues) return;

    let html = `
        <h2>Leagues</h2>
        <table>
            <tr>
                <th>League</th><th>Debut Club</th>
                <th>Debut Date</th><th>Apps</th>
            </tr>
    `;

    for (const [league, l] of Object.entries(leagues)) {
        html += `
            <tr>
                <td>${league}</td>
                <td>${l.debutClub || "-"}</td>
                <td>${l.debutDate || "-"}</td>
                <td>${l.apps ?? "-"}</td>
            </tr>
        `;
    }

    html += "</table>";
    document.getElementById("leagues").innerHTML = html;
}

function renderManagers(managers) {
    if (!managers) return;

    let html = `
        <h2>Managers</h2>
        <table>
            <tr>
                <th>Manager</th><th>Apps</th>
                <th>Goals</th><th>Assists</th><th>Minutes</th>
            </tr>
    `;

    for (const [name, m] of Object.entries(managers)) {
        html += `
            <tr>
                <td>${name}</td>
                <td>${m.apps ?? "-"}</td>
                <td>${m.goals ?? "-"}</td>
                <td>${m.assists ?? "-"}</td>
                <td>${m.minutes ?? "-"}</td>
            </tr>
        `;
    }

    html += "</table>";
    document.getElementById("managers").innerHTML = html;
}
