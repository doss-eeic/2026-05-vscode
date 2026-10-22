/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { detectLanguageByRules } from '../../common/languageDetectionRules.js';

suite('Language detection rules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes short C and distinguishes C++', () => {
		assert.deepStrictEqual([
			detectLanguageByRules('#include <stdio.h>\nint main(int argc, char** argv){\n printf("Hello World.\\n");\n return 0;\n}'),
			detectLanguageByRules('#include <stdio.h>\n#include <iostream>\nint main(){ std::cout << "Hello"; }')
		], ['c', 'cpp']);
	});

	test('recognizes Python dictionaries and definitions', () => {
		assert.deepStrictEqual([
			detectLanguageByRules(`dict_a = {\n'key11': 1,\n'key12': 'moji',\n'key13': False,\n}\ndict_b = {\n'key21': 33,\n'key22': 'string',\n'key23': True,\n'key12': 'new moji'\n}\n# 辞書同士は｜で連結可能\nprint(dict_a | dict_b)`),
			detectLanguageByRules('def greet(name):\n    print(name)'),
			detectLanguageByRules('#!/usr/bin/env python3\nprint(42)')
		], ['python', 'python', 'python']);
	});

	test('leaves ambiguous text, comments and quoted examples undecided', () => {
		assert.deepStrictEqual([
			detectLanguageByRules('This note discusses Python, True and False.'),
			detectLanguageByRules('print("hello")'),
			detectLanguageByRules('# def example():\n# print(True)'),
			detectLanguageByRules('"""\ndef example():\n    pass\n"""'),
			detectLanguageByRules('/*\n#include <stdio.h>\nint main(){ return 0; }\n*/'),
			detectLanguageByRules('const value = { enabled: true };\nconsole.log(value);')
		], Array(6).fill(undefined));
	});

	test('respects supported languages', () => {
		assert.deepStrictEqual([
			detectLanguageByRules('def greet():\n    pass', ['javascript']),
			detectLanguageByRules('def greet():\n    pass', ['python'])
		], [undefined, 'python']);
	});

	test('recognizes HTML, PHP, Rust, Go and Java', () => {
		assert.deepStrictEqual([
			detectLanguageByRules('<!DOCTYPE html>\n<html><body>Hello</body></html>'),
			detectLanguageByRules('<!-- document -->\n<html lang="ja"></html>'),
			detectLanguageByRules('<?php\necho "Hello";'),
			detectLanguageByRules('fn main() { println!("Hello"); }'),
			detectLanguageByRules('package main\nimport "fmt"\nfunc main() { fmt.Println("Hello") }'),
			detectLanguageByRules('public class Main { public static void main(String[] args) { System.out.println("Hello"); } }')
		], ['html', 'html', 'php', 'rust', 'go', 'java']);
	});

	test('recognizes explicit TypeScript syntax', () => {
		assert.deepStrictEqual([
			detectLanguageByRules('export interface User { name: string; }'),
			detectLanguageByRules('type Identifier = number;'),
			detectLanguageByRules('const count: number = 1;')
		], ['typescript', 'typescript', 'typescript']);
	});

	test('ignores quoted examples, comments and incomplete language hints', () => {
		assert.deepStrictEqual([
			detectLanguageByRules('const example = "<?php";'),
			detectLanguageByRules('<!-- <!DOCTYPE html> -->'),
			detectLanguageByRules('// fn main() { println!("Hello"); }'),
			detectLanguageByRules('const example = `\npackage main\nfunc main() {}\n`;'),
			detectLanguageByRules('/* public class Main { public static void main(String[] args) {} } */'),
			detectLanguageByRules('// interface User { name: string; }'),
			detectLanguageByRules('interface User { String getName(); }'),
			detectLanguageByRules('const count = 1; console.log(count);'),
			detectLanguageByRules('fn main() {}'),
			detectLanguageByRules('package main'),
			detectLanguageByRules('<?php echo 1;', ['html']),
			detectLanguageByRules('const count: number = 1;', ['javascript'])
		], Array(12).fill(undefined));
	});
});
