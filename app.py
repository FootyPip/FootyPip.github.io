import os
import random
from flask import Flask, render_template, jsonify, request, send_from_directory
app = Flask(__name__)

# DATA LOADING FUNCTIONS

def load_club_players(filename):
    club_to_players = {}
    all_players = set()
    club_list = []
    with open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            if ':' in line:
                club, players = line.strip().split(':', 1)
                club = club.strip()
                player_set = set([p.strip().strip('"') for p in players.strip('[]"').split(',') if p.strip()])
                club_to_players[club] = player_set
                club_list.append(club)
                all_players.update(player_set)
    return club_to_players, all_players, club_list

def load_simple_list(filename):
    items = []
    with open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(line)
    return items

# DATA IMPORT

club_to_players, all_players, all_clubs = load_club_players('data/samo korišteni.txt')

easy_clubs = load_simple_list('data/klubovi_lagano.txt')
hnl_clubs = load_simple_list('data/HNL.txt')
hard_clubs = load_simple_list('data/klubovi.txt')
other_categories = load_simple_list('data/ostalo.txt')
countries = load_simple_list('data/države.txt')

easy_clubs += other_categories + countries
hard_clubs += other_categories + countries

def dedupe(seq):
    seen = set()
    return [x for x in seq if not (x in seen or seen.add(x))]


easy_clubs = dedupe(easy_clubs)
hard_clubs = dedupe(hard_clubs)

# API ENDPOINTS

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/clubs")
def get_clubs():
    # Instead of: return jsonify(all_clubs)
    return jsonify([{"name": c} for c in all_clubs])

@app.route("/api/clubs_by_mode")
def get_clubs_by_mode():
    mode = request.args.get("mode", "easy")
    if mode == "hnl":
        clubs = hnl_clubs
    elif mode == "hard":
        clubs = hard_clubs
    else:
        clubs = easy_clubs
    return jsonify(clubs)

@app.route("/api/players")
def get_players():
    club = request.args.get("club")
    if club and club in club_to_players:
        players = sorted(club_to_players[club])
    else:
        players = sorted(list(all_players))
    return jsonify([{"name": p} for p in players])

@app.route("/api/random_clubs")
def get_random_clubs():
    mode = request.args.get("mode", "easy")
    n = int(request.args.get("n", 3))
    if mode == "hnl":
        pool = hnl_clubs
    elif mode == "hard":
        pool = hard_clubs
    else:
        pool = easy_clubs
    result = random.sample(pool, min(n, len(pool)))
    return jsonify(result)

@app.route("/api/club-positions")
def club_positions():
    mode = request.args.get("mode", "manual")
    if mode == "manual":
        return jsonify({
            "top": ["CHOOSE CLUB"] * 3,
            "left": ["CHOOSE CLUB"] * 3
        })
    elif mode == "croatian-league":
        pool = hnl_clubs
    elif mode == "random-hard":
        pool = hard_clubs
    else:
        pool = easy_clubs

    import itertools
    max_tries = 100
    for _ in range(max_tries):
        picked = random.sample(pool, min(6, len(pool)))
        top = picked[:3]
        left = picked[3:6]
        valid = True
        for r in left:
            for c in top:
                # Try to get intersection of players
                row_players = club_to_players.get(r, set())
                col_players = club_to_players.get(c, set())
                if not (row_players & col_players):
                    valid = False
                    break
            if not valid: break
        if valid:
            break
    else:
        # fallback
        top = picked[:3] + ["CHOOSE CLUB"] * (3 - len(picked[:3]))
        left = picked[3:6] + ["CHOOSE CLUB"] * (3 - len(picked[3:6]))
    return jsonify({
        "top": top,
        "left": left
    })

@app.route('/badges/<path:filename>')
def badge(filename):
    return send_from_directory('badges', filename)

if __name__ == "__main__":
    app.run(debug=True)