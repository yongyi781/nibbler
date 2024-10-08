"use strict";

/// <reference path="./10_globals.js" />

function NewGrapher() {

	let grapher = Object.create(null);

	grapher.dragging = false;			// Used by the event handlers in start.js

	grapher.clear_graph = function() {
		const graphContainer = document.getElementById("graphcontainer");
		const style = getComputedStyle(graphContainer);

		// This clears the canvas too
		graph.width = graphContainer.offsetWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		graph.height = graphContainer.offsetHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
	};

	grapher.draw = function(node) {
		this.draw_everything(node);
	};

	grapher.draw_everything = function(node) {
		this.clear_graph();
		let width = graph.width;		// After the above.
		let height = graph.height;

		let eval_list = node.all_graph_values();
		this.draw_horizontal_lines(width, height, [1 / 2 - 1 / config.graph_max, 1 / 2, 1 /2 + 1 / config.graph_max]);
		this.draw_position_line(eval_list.length, node);

		// We make lists of contiguous edges that can be drawn at once...

		let runs = this.make_runs(eval_list, width, height, node.graph_length_knower.val);
		let dots = [];

		// Draw our normal runs...

		graphctx.strokeStyle = "white";
		graphctx.lineWidth = config.graph_line_width;
		graphctx.lineJoin = "round";
		graphctx.setLineDash([]);

		for (let run of runs.normal_runs) {
			graphctx.beginPath();
			graphctx.moveTo(run[0].x1, run[0].y1);
			for (let edge of run) {
				graphctx.lineTo(edge.x2, edge.y2);
				if (edge.is_mate)
					dots.push({ x: edge.x2, y: edge.y2, color: "hsl(270,100%,70%)" });
				else if (edge.dot_color != null)
					dots.push({ x: edge.x2, y: edge.y2, color: edge.dot_color });
			}
			graphctx.stroke();
		}


		for (let { x, y, color } of dots) {
			graphctx.fillStyle = color;
			graphctx.beginPath();
			graphctx.arc(x, y, 5, 0, 2 * Math.PI, true);
			graphctx.fill();
		}

		// Draw our dashed runs...

		graphctx.strokeStyle = "#999999";
		graphctx.lineWidth = config.graph_line_width;
		graphctx.setLineDash([config.graph_line_width, config.graph_line_width]);

		for (let run of runs.dashed_runs) {
			graphctx.beginPath();
			graphctx.moveTo(run[0].x1, run[0].y1);
			for (let edge of run) {
				graphctx.lineTo(edge.x2, edge.y2);
			}
			graphctx.stroke();
		}
	};

	grapher.make_runs = function(eval_list, width, height, graph_length) {

		// Returns an object with 2 arrays (normal_runs and dashed_runs).
		// Each of those is an array of arrays of contiguous edges that can be drawn at once.

		let all_edges = [];

		let last_x = null;
		let last_y = null;
		let last_n = null;
		const factor = 1 / config.graph_max;

		// This loop creates all edges that we are going to draw, and marks each
		// edge as dashed or not...

		for (let n = 0; n < eval_list.length; n++) {

			const e = eval_list[n];

			if (e !== null) {
				let isMate = Math.abs(e) >= 80;
				let x = width * n / graph_length;
				let y = Math.min(isMate ? height - 2 : height - 8, Math.max(isMate ? 1 : 7, (1 - e * factor) * height / 2));
				let dot_color = null;

				if (last_n != null && n - last_n === 1) {
					// Mark as mistake, blunder, etc.
					const quality = ClassifyMove(e, eval_list[last_n], n % 2);
					if (quality === "mistake" || quality === "blunder")
						dot_color = OpaquifyHSL(config.colors[quality].color);
				}

				if (last_x != null) {
					all_edges.push({
						x1: last_x,
						y1: last_y,
						x2: x,
						y2: y,
						dashed: n - last_n !== 1,
						dot_color,
						is_mate: isMate
					});
				}

				last_x = x;
				last_y = y;
				last_n = n;
			}
		}

		// Now we make runs of contiguous edges that share a style...

		let normal_runs = [];
		let dashed_runs = [];

		let run = [];
		let current_meta_list = normal_runs;	// Will point at normal_runs or dashed_runs.

		for (let edge of all_edges) {
			if ((edge.dashed && current_meta_list !== dashed_runs) || (!edge.dashed && current_meta_list !== normal_runs)) {
				if (run.length > 0) {
					current_meta_list.push(run);
				}
				current_meta_list = edge.dashed ? dashed_runs : normal_runs;
				run = [];
			}
			run.push(edge);
		}
		if (run.length > 0) {
			current_meta_list.push(run);
		}

		return { normal_runs, dashed_runs };
	};

	grapher.draw_horizontal_lines = function(width, height, y_fractions = [0.5]) {

		// Avoid anti-aliasing... (FIXME: we assumed graph size was even)
		// let pixel_y_adjustment = config.graph_line_width % 2 === 0 ? 0 : -0.5;

		graphctx.lineWidth = config.graph_line_width;
		graphctx.setLineDash([config.graph_line_width, config.graph_line_width]);

		for (let y_fraction of y_fractions) {
			graphctx.strokeStyle = y_fraction === 1 / 2 ? "#666666" : "#444444";
			graphctx.beginPath();
			graphctx.moveTo(0, height * y_fraction);
			graphctx.lineTo(width, height * y_fraction);
			graphctx.stroke();
		}
	};

	grapher.draw_position_line = function(eval_list_length, node) {

		if (eval_list_length < 2) {
			return;
		}

		let width = graph.width;
		let height = graph.height;

		// Avoid anti-aliasing...
		let pixel_x_adjustment = config.graph_line_width % 2 === 0 ? 0 : 0.5;

		let x = Math.floor(width * node.depth / node.graph_length_knower.val) + pixel_x_adjustment;

		graphctx.strokeStyle = node.is_main_line() ? "#6cccee" : "#ffff00";
		graphctx.lineWidth = config.graph_line_width;
		graphctx.setLineDash([config.graph_line_width, config.graph_line_width]);

		graphctx.beginPath();
		graphctx.moveTo(x, 0);
		graphctx.lineTo(x, height);
		graphctx.stroke();

	};

	grapher.node_from_click = function(node, event) {

		let mousex = event.offsetX;
		if (typeof mousex !== "number") {
			return null;
		}

		let width = graph.offsetWidth;
		if (typeof width !== "number" || width < 1) {
			return null;
		}

		let node_list = node.future_node_history();
		if (node_list.length === 0) {
			return null;
		}

		// OK, everything is valid...

		let click_depth = Math.round(node.graph_length_knower.val * mousex / width);

		if (click_depth < 0) click_depth = 0;
		if (click_depth >= node_list.length) click_depth = node_list.length - 1;

		return node_list[click_depth];
	};

	return grapher;
}
