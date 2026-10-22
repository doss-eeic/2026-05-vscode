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
	if (shebang || pythonDefinition || pythonDictionary) {
		language = 'python';
	} else {
		// C 系はコメント・文字列を除外し、ヘッダーと関数定義の組み合わせで判定する。
		const code = content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|'(?:\\.|[^'\\\r\n])*'|"(?:\\.|[^"\\\r\n])*"/g, '');
		if (/^\s*#\s*include\s*<[^>]+>/m.test(code) && /\b(?:int|void)\s+\w+\s*\([^;{}]*\)\s*\{/.test(code)) {
			if (/^\s*#\s*include\s*<(?:iostream|vector|string|map|memory)>/m.test(code) || /\bstd\s*::/.test(code)) {
				language = 'cpp';
			} else if (/^\s*#\s*include\s*<(?:stdio|stdlib|string|stdint|stdbool)\.h>/m.test(code)) {
				language = 'c';
			}
		}
	}
	return language && (!supportedLangs?.length || supportedLangs.includes(language)) ? language : undefined;
}
