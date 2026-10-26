/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Recognizes a small set of distinctive syntax combinations before statistical detection.
 * Ambiguous snippets are left to the existing detectors.
 */
export function detectLanguageByRules(content: string, supportedLangs?: readonly string[]): string | undefined {
	let language: string | undefined;
	const shebang = /^#![^\r\n]*\bpython(?:\d+(?:\.\d+)*)?\b/.test(content);
	// コメントや文字列中の例を、実際の Python 構文として数えない。
	const pythonCode = content.replace(/'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\\r\n])*'|"(?:\\.|[^"\\\r\n])*"|#[^\r\n]*/g, '');
	const pythonDefinition = /^\s*(?:async\s+)?def\s+\w+\s*\([^\r\n]*\)\s*(?:->[^:\r\n]+)?\s*:\s*$/m.test(pythonCode);
	const pythonDictionary = /^\s*\w+\s*=\s*\{/m.test(pythonCode)
		&& /\b(?:True|False|None)\b/.test(pythonCode)
		&& /^\s*print\s*\(/m.test(pythonCode);
	// 文書先頭の専用マーカーで判定する。コメント内のマーカーは使わない。
	const markup = content.replace(/<!--[\s\S]*?-->/g, '');
	const phpOpening = /^\s*<\?php\b/.test(markup);
	const htmlDocument = /^\s*(?:<!doctype\s+html\s*>|<html\b[^>]*>)/i.test(markup);
	if (phpOpening) {
		language = 'php';
	} else if (htmlDocument) {
		language = 'html';
	} else if (shebang || pythonDefinition || pythonDictionary) {
		language = 'python';
	} else {
		// コメント・文字列中のコード例を除外し、言語固有の構文を組み合わせる。
		const code = content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\\r\n])*'|"(?:\\.|[^"\\\r\n])*"/g, '');
		const rustMain = /\bfn\s+main\s*\(\s*\)\s*\{/.test(code) && /\bprintln\s*!\s*\(/.test(code);
		const goMain = /^\s*package\s+main\s*$/m.test(code) && /\bfunc\s+main\s*\(\s*\)\s*\{/.test(code);
		const javaMain = /\bclass\s+\w+[^{}]*\{/.test(code)
			&& /\bpublic\s+static\s+void\s+main\s*\(\s*String\s*(?:\[\s*\]|\.\.\.)\s+\w+\s*\)/.test(code);
		// JavaScript と共有する構文だけでは TypeScript と判定しない。
		const typescriptInterface = /^\s*(?:export\s+)?interface\s+\w+\s*\{[^{}]*\b\w+\??\s*:/m.test(code);
		const typescriptAlias = /^\s*(?:export\s+)?type\s+\w+\s*=\s*(?:string|number|boolean|unknown|never)\s*;/m.test(code);
		const typescriptVariable = /\b(?:const|let)\s+\w+\s*:\s*(?:string|number|boolean)\b\s*=/.test(code);
		if (rustMain) {
			language = 'rust';
		} else if (goMain) {
			language = 'go';
		} else if (javaMain) {
			language = 'java';
		} else if (typescriptInterface || typescriptAlias || typescriptVariable) {
			language = 'typescript';
		} else if (/^\s*#\s*include\s*<[^>]+>/m.test(code) && /\b(?:int|void)\s+\w+\s*\([^;{}]*\)\s*\{/.test(code)) {
			if (/^\s*#\s*include\s*<(?:iostream|vector|string|map|memory)>/m.test(code) || /\bstd\s*::/.test(code)) {
				language = 'cpp';
			} else if (/^\s*#\s*include\s*<(?:stdio|stdlib|string|stdint|stdbool)\.h>/m.test(code)) {
				language = 'c';
			}
		}
	}
	return language && (!supportedLangs?.length || supportedLangs.includes(language)) ? language : undefined;
}
