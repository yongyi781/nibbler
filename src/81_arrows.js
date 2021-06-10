"use strict";

let arrow_props = {

	draw_arrows: function(node, specific_source, show_move) {		// specific_source is a Point(), show_move is a string

		// Function is responsible for updating the one_click_moves array.

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				this.one_click_moves[x][y] = null;
			}
		}

		if (!config.arrows_enabled || config.hide_lines || !node || node.destroyed) {
			return;
		}

		let full_list = SortedMoveInfo(node);

		if (full_list.length === 0) {		// Keep this test early so we can assume full_list[0] exists later.
			return;
		}

		let best_info = full_list[0];		// Note that, since we may filter the list, it might not contain best_info later.

		let info_list = [];
		let arrows = [];
		let heads = [];

		let mode;
		let show_move_was_forced = false;	// Will become true if the show_move is only in the list because of the show_move arg
		let show_move_head = null;

		if (specific_source) {
			mode = "specific";
		} else if (full_list[0].__ghost) {
			mode = "ghost";
		} else if (full_list[0].__touched === false) {
			mode = "untouched";
		} else if (full_list[0].leelaish === false) {
			mode = "ab";
		} else {
			mode = "normal";
		}

		switch (mode) {

		case "normal":

			info_list = full_list;
			break;

		case "ab":

			for (let info of full_list) {
				if (info.__touched && info.subcycle >= full_list[0].subcycle) {
					info_list.push(info);
				} else if (info.move === show_move) {
					info_list.push(info);
					show_move_was_forced = true;
				}
			}
			break;

		case "ghost":

			for (let info of full_list) {
				if (info.__ghost) {
					info_list.push(info);
				} else if (info.move === show_move) {
					info_list.push(info);
					show_move_was_forced = true;
				}
			}
			break;

		case "untouched":

			for (let info of full_list) {
				if (info.move === show_move) {
					info_list.push(info);
					show_move_was_forced = true;
				}
			}
			break;

		case "specific":

			for (let info of full_list) {
				if (info.move.slice(0, 2) === specific_source.s) {
					info_list.push(info);
				}
			}
			break;

		}

		// ------------------------------------------------------------------------------------------------------------

		for (let i = 0; i < info_list.length; i++) {

			let loss = 1000;

			if (info_list[i].depth > 0) {
				loss = (best_info.cp - info_list[i].cp) / 100;
			}

			let ok = true;

			// Filter for normal (Leelaish) mode...

			if (mode === "normal") {

				if (config.arrow_filter_type === "top") {
					if (i !== 0) {
						ok = false;
					}
				}

				if (config.arrow_filter_type === "N") {
					if (typeof info_list[i].n !== "number" || info_list[i].n === 0) {
						ok = false;
					} else {
						let n_fraction = info_list[i].n / node.table.nodes;
						if (n_fraction < config.arrow_filter_value) {
							ok = false;
						}
					}
				}

				// Moves proven to lose...

				if (typeof info_list[i].u === "number" && info_list[i].u === 0 && info_list[i].value() === 0) {
					if (config.arrow_filter_type !== "all") {
						ok = false;
					}
				}

				// If the show_move would be filtered out, note that fact...

				if (!ok && info_list[i].move === show_move) {
					show_move_was_forced = true;
				}
			}

			// Filter for ab mode...
			// Note that we don't set show_move_was_forced for ab mode.
			// If it wasn't already set, then we have good info for this move.

			if (mode === "ab") {
				if (loss >= config.ab_filter_threshold) {
					ok = false;
				}
			}

			// Go ahead, if the various tests don't filter the move out...

			if (ok || i === 0 || info_list[i].move === show_move) {

				let [x1, y1] = XY(info_list[i].move.slice(0, 2));
				let [x2, y2] = XY(info_list[i].move.slice(2, 4));

				let colour = config.colors.blunder.color;

				if (info_list[i].move === show_move && config.next_move_unique_colour) {
					colour = config.actual_move_colour;
				} else if (info_list[i].move === show_move && show_move_was_forced) {
					colour = config.colors.blunder.color;
				} else {
					const name = MoveQuality(best_info, info_list[i]);
					colour = config.colors[name].color;
				}

				let x_head_adjustment = 0;				// Adjust head of arrow for castling moves...
				let normal_castling_flag = false;

				if (node.board && node.board.colour(Point(x1, y1)) === node.board.colour(Point(x2, y2))) {

					// So the move is a castling move (reminder: as of 1.1.6 castling format is king-onto-rook).

					if (node.board.normalchess) {
						normal_castling_flag = true;	// ...and we are playing normal Chess (not 960).
					}

					if (x2 > x1) {
						x_head_adjustment = normal_castling_flag ? -1 : -0.5;
					} else {
						x_head_adjustment = normal_castling_flag ? 2 : 0.5;
					}
				}

				let width = Math.min(config.arrow_width, Math.max(1, config.arrow_width * (1 - loss)));
				if (info_list[i].mate !== best_info.mate && Math.sign(info_list[i].mate) === Math.sign(best_info.mate)) {
					width = config.arrow_width / 2;
				}
				arrows.push({
					colour: colour,
					x1: x1,
					y1: y1,
					x2: x2 + x_head_adjustment,
					y2: y2,
					info: info_list[i],
					width: width
				});

				// If there is no one_click_move set for the target square, then set it
				// and also set an arrowhead to be drawn later.

				if (normal_castling_flag) {
					if (!this.one_click_moves[x2 + x_head_adjustment][y2]) {
						heads.push({
							colour: colour,
							x2: x2 + x_head_adjustment,
							y2: y2,
							info: info_list[i]
						});
						this.one_click_moves[x2 + x_head_adjustment][y2] = info_list[i].move;
						if (info_list[i].move === show_move) {
							show_move_head = heads[heads.length - 1];
						}
					}
				} else {
					if (!this.one_click_moves[x2][y2]) {
						heads.push({
							colour: colour,
							x2: x2 + x_head_adjustment,
							y2: y2,
							info: info_list[i]
						});
						this.one_click_moves[x2][y2] = info_list[i].move;
						if (info_list[i].move === show_move) {
							show_move_head = heads[heads.length - 1];
						}
					}
				}
			}
		}

		// It looks best if the longest arrows are drawn underneath. Manhattan distance is good enough.
		// For the sake of displaying the best pawn promotion (of the 4 possible), sort ties are broken
		// by node counts, with lower drawn first. [Eh, what about Stockfish? Meh, it doesn't affect
		// the heads, merely the colour of the lines, so it's not a huge problem I think.]

		arrows.sort((a, b) => {
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) < Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return 1;
			}
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) > Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return -1;
			}
			if (a.info.n < b.info.n) {
				return -1;
			}
			if (a.info.n > b.info.n) {
				return 1;
			}
			return 0;
		});

		boardctx.textAlign = "center";
		boardctx.textBaseline = "middle";
		boardctx.font = config.board_font;

		for (let o of arrows) {
			let cc1 = CanvasCoords(o.x1, o.y1);
			let cc2 = CanvasCoords(o.x2, o.y2);
			// Compute the amount to subtract so the line doesn't cross the circle.
			let dist = Math.hypot(cc2.cx - cc1.cx, cc2.cy - cc1.cy);
			let dx = (config.arrowhead_radius - 1) * (cc2.cx - cc1.cx) / dist;
			let dy = (config.arrowhead_radius - 1) * (cc2.cy - cc1.cy) / dist;

			boardctx.lineWidth = o.width;
			boardctx.strokeStyle = o.colour;
			boardctx.fillStyle = o.colour;
			boardctx.beginPath();
			boardctx.moveTo(cc1.cx, cc1.cy);
			boardctx.lineTo(cc2.cx - dx, cc2.cy - dy);
			boardctx.stroke();
		}

		// Draw the next move head now.
		for (let o of arrows) {
			if (o.info.move === show_move && config.next_move_outline) {		// Draw the outline at the layer just below the actual arrow.
				let cc1 = CanvasCoords(o.x1, o.y1);
				let cc2 = CanvasCoords(o.x2, o.y2);
				// Compute the amount to subtract so the line doesn't cross the circle.
				let dist = Math.hypot(cc2.cx - cc1.cx, cc2.cy - cc1.cy);
				let dx = config.arrowhead_radius * (cc2.cx - cc1.cx) / dist;
				let dy = config.arrowhead_radius * (cc2.cy - cc1.cy) / dist;

				boardctx.strokeStyle = config.actual_move_colour;
				boardctx.lineWidth = 3;
				boardctx.beginPath();
				boardctx.moveTo(cc1.cx, cc1.cy);
				boardctx.lineTo(cc2.cx - dx, cc2.cy - dy);
				boardctx.stroke();

				if (show_move_head) {			// This is the best layer to draw the head outline.
					boardctx.beginPath();
					boardctx.arc(cc2.cx, cc2.cy, config.arrowhead_radius + 1, 0, 2 * Math.PI);
					boardctx.stroke();
				}
			}
		}

		for (let o of heads) {
			let cc2 = CanvasCoords(o.x2, o.y2);

			boardctx.fillStyle = o.colour;
			boardctx.beginPath();
			boardctx.arc(cc2.cx, cc2.cy, config.arrowhead_radius, 0, 2 * Math.PI);
			boardctx.fill();
			// Text color: winning, losing, drawn
			let cp = o.info.cp_with_pov(config.ev_pov);
			boardctx.fillStyle = cp < 0 ? "#000000" : cp > 0 ? "#ffffaa" : "#555555";

			let s = "?";

			switch (config.arrowhead_type) {
			case 0:
				s = o.info.value_string(1, config.ev_pov);
				break;
			case 1:
				if (node.table.nodes > 0) {
					s = (100 * o.info.n / node.table.nodes).toFixed(0);
				}
				break;
			case 2:
				if (o.info.p > 0) {
					s = o.info.p.toFixed(0);
				}
				break;
			case 3:
				s = o.info.multipv;
				break;
			case 4:
				if (typeof o.info.m === "number") {
					s = o.info.m.toFixed(0);
				}
				break;
			default:
				s = "!";
				break;
			}

			if (o.info.__touched === false) {
				s = "?";
			}

			if (show_move_was_forced && o.info.move === show_move) {
				s = "?";
			}

			boardctx.fillText(s, cc2.cx, cc2.cy + 1);
		}

		draw_arrows_last_mode = mode;		// For debugging only.
	},

	// ----------------------------------------------------------------------------------------------------------
	// We have a special function for the book explorer mode. Explorer mode is very nicely isolated from the rest
	// of the app. The info_list here is just a list of objects each containing only "move" and "weight" - where
	// the weights have been normalised to the 0-1 scale and the list has been sorted.
	//
	// Note that info_list here should not be modified.

	draw_explorer_arrows: function(node, info_list) {

		for (let x = 0; x < 8; x++) {
			for (let y = 0; y < 8; y++) {
				this.one_click_moves[x][y] = null;
			}
		}

		if (!node || node.destroyed) {
			return;
		}

		let arrows = [];
		let heads = [];

		for (let i = 0; i < info_list.length; i++) {
			let [x1, y1] = XY(info_list[i].move.slice(0, 2));
			let [x2, y2] = XY(info_list[i].move.slice(2, 4));

			let colour = i === 0 ? config.colors.best.color : config.colors.good.color;

			let x_head_adjustment = 0;				// Adjust head of arrow for castling moves...
			let normal_castling_flag = false;

			if (node.board && node.board.colour(Point(x1, y1)) === node.board.colour(Point(x2, y2))) {

				if (node.board.normalchess) {
					normal_castling_flag = true;	// ...and we are playing normal Chess (not 960).
				}

				if (x2 > x1) {
					x_head_adjustment = normal_castling_flag ? -1 : -0.5;
				} else {
					x_head_adjustment = normal_castling_flag ? 2 : 0.5;
				}
			}

			arrows.push({
				colour: colour,
				x1: x1,
				y1: y1,
				x2: x2 + x_head_adjustment,
				y2: y2,
				info: info_list[i]
			});

			// If there is no one_click_move set for the target square, then set it
			// and also set an arrowhead to be drawn later.

			if (normal_castling_flag) {
				if (!this.one_click_moves[x2 + x_head_adjustment][y2]) {
					heads.push({
						colour: colour,
						x2: x2 + x_head_adjustment,
						y2: y2,
						info: info_list[i]
					});
					this.one_click_moves[x2 + x_head_adjustment][y2] = info_list[i].move;
				}
			} else {
				if (!this.one_click_moves[x2][y2]) {
					heads.push({
						colour: colour,
						x2: x2 + x_head_adjustment,
						y2: y2,
						info: info_list[i]
					});
					this.one_click_moves[x2][y2] = info_list[i].move;
				}
			}
		}

		arrows.sort((a, b) => {
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) < Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return 1;
			}
			if (Math.abs(a.x2 - a.x1) + Math.abs(a.y2 - a.y1) > Math.abs(b.x2 - b.x1) + Math.abs(b.y2 - b.y1)) {
				return -1;
			}
			return 0;
		});

		boardctx.lineWidth = config.arrow_width;
		boardctx.textAlign = "center";
		boardctx.textBaseline = "middle";
		boardctx.font = config.board_font;

		for (let o of arrows) {
			let cc1 = CanvasCoords(o.x1, o.y1);
			let cc2 = CanvasCoords(o.x2, o.y2);

			boardctx.strokeStyle = o.colour;
			boardctx.fillStyle = o.colour;
			boardctx.beginPath();
			boardctx.moveTo(cc1.cx, cc1.cy);
			boardctx.lineTo(cc2.cx, cc2.cy);
			boardctx.stroke();
		}

		for (let o of heads) {
			let cc2 = CanvasCoords(o.x2, o.y2);

			boardctx.fillStyle = o.colour;
			boardctx.beginPath();
			boardctx.arc(cc2.cx, cc2.cy, config.arrowhead_radius, 0, 2 * Math.PI);
			boardctx.fill();
			boardctx.fillStyle = "black";

			let s = "?";

			if (typeof o.info.weight === "number") {
				s = (100 * o.info.weight).toFixed(0);
			}

			boardctx.fillText(s, cc2.cx, cc2.cy + 1);
		}
	}
};



// For debugging...
let draw_arrows_last_mode = null;
