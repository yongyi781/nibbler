"use strict";

const arrow_props = {
	draw_arrows: function(node, specific_source, next_move) {		// specific_source is a Point(), show_move is a string
		// Function is responsible for updating the one_click_moves array.
		for (let x = 0; x < 8; x++)
			for (let y = 0; y < 8; y++)
				this.one_click_moves[x][y] = null;

		if (!config.arrows_enabled || node == null || node.destroyed)
			return;

		const full_list = SortedMoveInfo(node);
		if (full_list.length === 0)		// Keep this test early so we can assume best_info exists later.
			return;

		const best_info = full_list[0];		// Note that, since we may filter the list, it might not contain best_info later.

		const arrows = [];
		const heads = [];

		let mode;
		let next_move_head = null;

		if (specific_source) {
			mode = "specific";
		} else if (best_info.__ghost) {
			mode = "ghost";
		} else if (!best_info.__touched) {
			mode = "untouched";
		} else if (!best_info.leelaish) {
			mode = "ab";
		} else {
			mode = "normal";
		}

		const info_list = full_list.filter(info => {
			if (specific_source)
				return info.move.slice(0, 2) === specific_source.s;
			if (info.move === next_move)
				return true;
			if (!info.__touched || info.subcycle < best_info.subcycle)
				return false;
			let loss = info.depth > 0 ? (best_info.cp - info.cp) / 100 : 1000;
			// Filter for normal (Leelaish) mode...
			if (best_info.leelaish) {
				if (config.arrow_filter_type === "top") {
					if (i !== 0) {
						return false;
					}
				}

				if (config.arrow_filter_type === "N") {
					if (typeof info.n !== "number" || info.n === 0) {
						return false;
					} else {
						let n_fraction = info.n / node.table.nodes;
						if (n_fraction < config.arrow_filter_value) {
							return false;
						}
					}
				}

				// Moves proven to lose...
				if (typeof info.u === "number" && info.u === 0 && info.value() === 0) {
					if (config.arrow_filter_type !== "all") {
						return false;
					}
				}
			}
			// Filter for ab mode...
			// Note that we don't set show_move_was_forced for ab mode.
			// If it wasn't already set, then we have good info for this move.
			else {
				if (loss > config.ab_filter_threshold) {
					return false;
				}
			}
			return true;
		});

		// ------------------------------------------------------------------------------------------------------------

		for (let info of info_list) {
			let [x1, y1] = XY(info.move.slice(0, 2));
			let [x2, y2] = XY(info.move.slice(2, 4));

			let colour = !config.hide_lines && info.__touched && info.subcycle >= best_info.subcycle ? config.colors[MoveQuality(best_info, info)].color : config.colors.unknown.color;

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

			if (info.move === next_move || !config.hide_lines) {
				let width = 0;
				if (!config.hide_lines && info.__touched && info.subcycle >= best_info.subcycle)
					width = Math.min(config.arrow_width, Math.max(1, config.arrow_width * (1 - (best_info.cp - info.cp) / 100)));
				if (!config.hide_lines && info.mate !== best_info.mate && Math.sign(info.mate) === Math.sign(best_info.mate)) {
					width = config.arrow_width / 2;
				}
				arrows.push({ colour, x1, y1, x2: x2 + x_head_adjustment, y2, info, width });
			}
			// If there is no one_click_move set for the target square, then set it
			// and also set an arrowhead to be drawn later.

			if (normal_castling_flag) {
				if (!this.one_click_moves[x2 + x_head_adjustment][y2] && (specific_source || !config.hide_lines || info.move === next_move)) {
					heads.push({
						colour: colour,
						x2: x2 + x_head_adjustment,
						y2: y2,
						info: info
					});
					this.one_click_moves[x2 + x_head_adjustment][y2] = info.move;
					if (info.move === next_move) {
						next_move_head = heads[heads.length - 1];
					}
				}
			} else {
				if (!this.one_click_moves[x2][y2] && (specific_source || !config.hide_lines || info.move === next_move)) {
					heads.push({
						colour: colour,
						x2: x2 + x_head_adjustment,
						y2: y2,
						info: info
					});
					this.one_click_moves[x2][y2] = info.move;
					if (info.move === next_move) {
						next_move_head = heads[heads.length - 1];
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

		let next_move_arrow;
		for (let o of arrows) {
			if (o.info.move === next_move && config.show_next_move)
				next_move_arrow = o;
			// Draw the outline at the layer just below the actual arrow.
			if (o.width <= 0)
				continue;
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
		if (next_move_arrow != null && config.show_next_move) {		// Draw the outline at the layer just below the actual arrow.
			let cc1 = CanvasCoords(next_move_arrow.x1, next_move_arrow.y1);
			let cc2 = CanvasCoords(next_move_arrow.x2, next_move_arrow.y2);
			// Compute the amount to subtract so the line doesn't cross the circle.
			let dist = Math.hypot(cc2.cx - cc1.cx, cc2.cy - cc1.cy);
			let dx = config.arrowhead_radius * (cc2.cx - cc1.cx) / dist;
			let dy = config.arrowhead_radius * (cc2.cy - cc1.cy) / dist;

			boardctx.strokeStyle = config.actual_move_colour;
			boardctx.lineWidth = 4;
			boardctx.beginPath();
			boardctx.moveTo(cc1.cx, cc1.cy);
			boardctx.lineTo(cc2.cx - dx, cc2.cy - dy);
			boardctx.stroke();

			if (next_move_head) {			// This is the best layer to draw the head outline.
				boardctx.beginPath();
				boardctx.arc(cc2.cx, cc2.cy, config.arrowhead_radius + 1, 0, 2 * Math.PI);
				boardctx.stroke();
			}
		}

		for (let o of heads) {
			let cc2 = CanvasCoords(o.x2, o.y2);

			let s = "";

			if (!config.hide_lines && o.info.__touched && o.info.subcycle >= best_info.subcycle) {
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
			}

			if (specific_source || (!config.hide_lines && o.info.__touched && o.info.subcycle >= best_info.subcycle)) {
				boardctx.fillStyle = o.colour;
				boardctx.beginPath();
				boardctx.arc(cc2.cx, cc2.cy, s === "" ? 12 : config.arrowhead_radius, 0, 2 * Math.PI);
				boardctx.fill();
			}
			// Text color: winning, losing, drawn
			let cp = o.info.cp_with_pov(config.ev_pov);
			boardctx.fillStyle = s === "" || cp < 0 || isNaN(cp) || config.hide_lines ? "#000000" : cp > 0 ? "#ffffaa" : "#555555";

			boardctx.fillText(s, cc2.cx, cc2.cy + 1);
		}
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
