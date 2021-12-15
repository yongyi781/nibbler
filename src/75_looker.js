"use strict";

// Rate limit strategy - thanks to Sopel:
//
// .running holds the item in-flight.
// .pending holds a single item to send after.
//
// Note: Don't store the retrieved info in the node.table, because the logic
// there is already a bit convoluted with __touched, __ghost and whatnot (sadly).
//
// Note: format of entries in the DB is {type: "foo", moves: {}}
// where moves is a map of string --> object

function NewLooker() {
	let looker = Object.create(null);
	looker.running = null;
	looker.pending = null;
	looker.all_dbs = Object.create(null);
	looker.bans = Object.create(null);			// db --> time of last rate-limit
	Object.assign(looker, looker_props);
	return looker;
}

let looker_props = {

	clear_queue: function() {
		this.running = null;
		this.pending = null;
	},

	add_to_queue: function(board) {

		if (!config.looker_api || !board.normalchess) {
			return;
		}

		let query = {
			board: board,
			db_name: config.looker_api
		};

		if (!this.running) {
			this.running = query;				// Since queries are objects, different queries can always be told apart.
			this.send_query(this.running);		// And send that object we just stored, not a new one.
		} else {
			this.pending = query;				// As above.
		}
	},

	send_query: function(query) {

		// It is ESSENTIAL that every call to send_query() eventually generates a call to query_complete()
		// so that the item gets removed from the queue. While we don't really need to use promises, doing
		// it as follows lets me just have a single place where query_complete() is called. I guess.

		this.query_api(query).catch(error => {
			console.log("Query failed:", error);
		}).finally(() => {
			this.query_complete(query);
		});
	},

	query_complete: function(query) {

		if (this.running !== query) {
			return;
		}

		this.running = this.pending;
		this.pending = null;

		if (this.running) {
			this.send_query(this.running);
		}
	},

	get_db: function(db_name) {			// Creates it if needed.

		if (typeof db_name !== "string") {
			return null;
		}

		if (!this.all_dbs[db_name]) {
			this.all_dbs[db_name] = Object.create(null);
		}

		return this.all_dbs[db_name];
	},

	lookup: function(db_name, board) {

		// When repeatedly called with the same params, this should
		// return the same object (unless it changes of course).

		let db = this.get_db(db_name);
		if (db) {						// Remember get_db() can return null.
			let ret = db[board.fen()];
			if (ret) {
				return ret;
			}
		}
		return null;					// I guess we tend to like null over undefined. (Bad habit?)
	},

	set_ban: function(db_name) {
		this.bans[db_name] = performance.now();
	},

	query_api(query) {					// Returns a promise, which is solely used by the caller to attach some cleanup catch/finally()

		if (this.lookup(query.db_name, query.board)) {							// We already have a result for this board.
			return Promise.resolve();											// Consider this case a satisfactory result.
		}

		if (this.bans[query.db_name]) {
			if (performance.now() - this.bans[query.db_name] < 60000) {			// No requests within 1 minute of the ban.
				return Promise.resolve();										// Consider this case a satisfactory result.
			}
		}

		let friendly_fen = query.board.fen(true);
		let fen_for_web = ReplaceAll(friendly_fen, " ", "%20");

		let url;

		if (query.db_name === "chessdbcn") {
			url = `http://www.chessdb.cn/cdb.php?action=queryall&json=1&board=${fen_for_web}`;
		} else if (query.db_name === "lichess_masters") {
			url = `http://explorer.lichess.ovh/masters?topGames=0&fen=${fen_for_web}`;
		} else if (query.db_name === "lichess_plebs") {
			url = `http://explorer.lichess.ovh/lichess?variant=standard&topGames=0&fen=${fen_for_web}`;
		}

		if (!url) {
			return Promise.reject(new Error("Bad db_name"));					// static Promise class method
		}

		return fetch(url).then(response => {
			if (response.status === 429) {										// rate limit hit
				this.set_ban(query.db_name);
				throw new Error("rate limited");
			}
			if (!response.ok) {													// true iff status in range 200-299
				throw new Error("response.ok was false");
			}
			return response.json();
		}).then(raw_object => {
			this.handle_response_object(query, raw_object);
		});
	},

	handle_response_object: function(query, raw_object) {

		let board = query.board;
		let fen = board.fen();

		// Get the correct DB, creating it if needed...

		let db = this.get_db(query.db_name);

		// Create or recreate the info object. Recreation ensures that the infobox drawer can
		// tell that it's a new object if it changes (and a redraw is needed).

		let o = {type: query.db_name, moves: {}};
		db[fen] = o;

		// If the raw_object is invalid, now's the time to return - after the empty object
		// has been stored in the database, so we don't do this lookup again.

		if (typeof raw_object !== "object" || raw_object === null || Array.isArray(raw_object.moves) === false) {
			return;			// This can happen e.g. if the position is checkmate.
		}

		// Now add moves to the object...

		for (let item of raw_object.moves) {

			let move = item.uci;
			move = board.c960_castling_converter(move);

			if (query.db_name === "chessdbcn") {

				let move_object = Object.create(chessdbcn_move_props);
				move_object.active = board.active;
				move_object.score = item.score / 100;
				o.moves[move] = move_object;

			} else if (query.db_name === "lichess_masters" || query.db_name === "lichess_plebs") {

				let move_object = Object.create(lichess_move_props);
				move_object.active = board.active;
				move_object.white = item.white;
				move_object.black = item.black;
				move_object.draws = item.draws;
				move_object.total = item.white + item.draws + item.black;
				o.moves[move] = move_object;
			}
		}

		// Note that even if we get no info, we still leave the empty object o in the database,
		// and this allows us to know that we've done this search already.
	},
};



let chessdbcn_move_props = {	// The props for a single move in a chessdbcn object.

	text: function(pov) {		// pov can be null for current

		let score = this.score;

		if ((pov === "w" && this.active === "b") || (pov === "b" && this.active === "w")) {
			score = 0 - this.score;
		}

		let s = score.toFixed(2);
		if (s !== "0.00" && s[0] !== "-") {
			s = "+" + s;
		}

		return `API: ${s}`;
	},
};

let lichess_move_props = {		// The props for a single move in a lichess object.

	text: function(pov) {		// pov can be null for current

		let actual_pov = pov ? pov : this.active;
		let wins = actual_pov === "w" ? this.white : this.black;
		let ev = (wins + (this.draws / 2)) / this.total;

		return `API: ${(ev * 100).toFixed(1)}% [${NString(this.total)}]`;
	},
};

