import { VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
	center,
	formatCwd,
	formatModelLabel,
	formatThinkingLabel,
	headerColumnWidths,
	padRight,
	truncateToWidth,
	visibleWidth,
} from "./utils.ts";

const USAGE_TIPS = [
	"使用 /model 切换模型",
	"使用 Tab 键自动补全路径",
	"使用 Ctrl+R 搜索历史命令",
	"使用 /export 导出对话记录",
	"使用 /compact 压缩上下文",
	"使用 @ 引用文件或文件夹",
	"拖拽文件到终端即可添加附件",
	"使用 /settings 自定义界面配置",
	"使用 Ctrl+C 中断模型生成",
	"使用 ↑↓ 键浏览历史消息",
	"输入 / 查看所有可用命令",
	"使用 /tree 管理对话分支",
	"使用 /new 开启全新对话",
	"使用 /resume 恢复之前的会话",
	"Shift+Enter 换行输入多行内容",
	"使用 /fork 复制当前对话",
	"使用 /name 给会话命名",
	"使用 Ctrl+L 清屏",
];

function pickRandomTips(count: number): string[] {
	const pool = [...USAGE_TIPS];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[pool[i], pool[j]] = [pool[j]!, pool[i]!];
	}
	return pool.slice(0, Math.min(count, pool.length));
}

/** Highlight slash commands and keyboard shortcuts inside a tip string. */
function highlightTip(
	text: string,
	muted: (s: string) => string,
	accent: (s: string) => string,
): string {
	const regex = /(\/[a-zA-Z][\w-]*|Ctrl\+\w+|Shift\+\w+|Alt\+\w+|Cmd\+\w+|Meta\+\w+|Tab|Enter|Esc|↑|↓|→|←)/g;
	const parts: string[] = [];
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = regex.exec(text)) !== null) {
		if (m.index > lastIndex) parts.push(muted(text.slice(lastIndex, m.index)));
		parts.push(accent(m[0]));
		lastIndex = m.index + m[0].length;
	}
	if (lastIndex < text.length) parts.push(muted(text.slice(lastIndex)));
	return parts.join("");
}

function renderCosmoLogo(paint: (s: string) => string): string[] {
	return [
		paint("▗▄▄▖ ▗▄▖  ▗▄▄▖▗▖  ▗▖ ▗▄▖"),
		paint("▐▌   ▐▌ ▐▌▐▌   ▐▛▚▞▜▌▐▌ ▐▌"),
		paint("▐▌   ▐▌ ▐▌ ▝▀▚▖▐▌  ▐▌▐▌ ▐▌"),
		paint("▝▚▄▄▖▝▚▄▞▘▗▄▄▞▘▐▌  ▐▌▝▚▄▞▘"),
	];
}

function borderLine(
	left: string,
	label: string,
	right: string,
	width: number,
	paint: (text: string) => string,
): string {
	if (width <= 1) return "";
	if (width < 8 || label.length === 0) {
		return paint(truncateToWidth(left + "─".repeat(Math.max(0, width - 2)) + right, width, ""));
	}

	const before = "─── ";
	const after = " ─────";
	const fixedWidth = visibleWidth(before) + visibleWidth(label) + visibleWidth(after);
	const fill = Math.max(0, width - 2 - fixedWidth);
	return `${paint(left)}${paint(before)}${label}${paint(after)}${paint("─".repeat(fill))}${paint(right)}`;
}

function boxedLine(content: string, width: number, paint: (text: string) => string): string {
	if (width <= 2) return truncateToWidth(content, width, "");
	return `${paint("│")}${padRight(content, width - 2)}${paint("│")}`;
}

function twoColumn(
	left: string,
	right: string,
	leftWidth: number,
	rightWidth: number,
	paint: (text: string) => string,
): string {
	return `${padRight(left, leftWidth)} ${paint("│")} ${padRight(right, rightWidth, "…")}`;
}

export class OpenTuiHeader implements Component {
	private readonly pi: ExtensionAPI;
	private readonly ctx: ExtensionContext;
	private readonly sessionTips: string[];

	constructor(pi: ExtensionAPI, ctx: ExtensionContext, _tui: TUI) {
		this.pi = pi;
		this.ctx = ctx;
		this.sessionTips = pickRandomTips(4);
	}

	render(width: number): string[] {
		const theme = this.ctx.ui.theme;
		const paint = (s: string) => theme.fg("accent", s);
		const muted = (s: string) => theme.fg("muted", s);
		const dim = (s: string) => theme.fg("dim", s);
		const bold = (s: string) => theme.bold(s);

		if (width < 24) return [paint(`COSMO v${VERSION}`)];

		const innerWidth = width - 2;
		const { leftWidth, rightWidth, useTips } = headerColumnWidths(innerWidth);
		const model = formatModelLabel(this.ctx.model);
		const effort = formatThinkingLabel(this.pi.getThinkingLevel());
		const cwd = formatCwd(this.ctx.cwd);

		const leftLines = [
			...renderCosmoLogo(paint).map((line) => center(line, leftWidth)),
			"",
			center(bold("卡奥斯 · 开发智能体"), leftWidth),
			center(muted(`${model} · ${effort}`), leftWidth),
			center(dim(cwd), leftWidth),
		];

		const tipDivider = paint("─".repeat(Math.max(8, rightWidth)));
		const [tip0 = "", tip1 = "", tip2 = "", tip3 = ""] = this.sessionTips;
		const tipLines = [
			paint(bold("欢迎使用 COSMO")),
			muted("你的智能开发伙伴"),
			tipDivider,
			paint(bold("小技巧")),
			highlightTip(tip0, muted, paint),
			highlightTip(tip1, muted, paint),
			highlightTip(tip2, muted, paint),
			highlightTip(tip3, muted, paint),
		];

		const lines = [borderLine("╭", `${paint("COSMO")} v${VERSION}`, "╮", width, paint)];
		const lineCount = Math.max(leftLines.length, tipLines.length);
		for (let i = 0; i < lineCount; i++) {
			const content = useTips
				? twoColumn(leftLines[i] ?? "", tipLines[i] ?? "", leftWidth, rightWidth, paint)
				: padRight(leftLines[i] ?? "", leftWidth);
			lines.push(boxedLine(content, width, paint));
		}
		lines.push(borderLine("╰", "", "╯", width, paint));
		return lines.map((line) => truncateToWidth(line, width, ""));
	}

	invalidate(): void {}

	dispose(): void {}
}

export function installHeader(pi: ExtensionAPI, ctx: ExtensionContext): () => void {
	let header: OpenTuiHeader | undefined;
	ctx.ui.setHeader((tui) => {
		header?.dispose();
		header = new OpenTuiHeader(pi, ctx, tui);
		return header;
	});
	return () => {
		header?.dispose();
		header = undefined;
		ctx.ui.setHeader(undefined);
	};
}
