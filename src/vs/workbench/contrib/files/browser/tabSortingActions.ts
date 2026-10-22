/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { extname, basename } from '../../../../base/common/path.js';
import { Action2, registerAction2, MenuId } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { EditorsOrder } from '../../../common/editor.js';
import { IEditorGroupsService, IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { RawContextKey, IContextKeyService, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';

// UIシステムと連動するための2つのシステムキー
export const AutoTabSortEnabledContext = new RawContextKey<boolean>('autoTabSortEnabled', false);
export const AutoTabSortByNameEnabledContext = new RawContextKey<boolean>('autoTabSortByNameEnabled', false);

// 状態管理用のフラグ
let globalAutoSortEnabled = false;
let globalAutoSortByNameEnabled = false;

let contextKeyExtension: IContextKey<boolean> | undefined = undefined;
let contextKeyName: IContextKey<boolean> | undefined = undefined;
let isSortingAutomatically = false;

// ==========================================
// 🧠 共通ソートコアロジック (カウント基準分離版)
// ==========================================
function enforceAutoSort(group: IEditorGroup): void {
	if ((!globalAutoSortEnabled && !globalAutoSortByNameEnabled) || isSortingAutomatically) { return; }

	// 最新の並び順で全エディタ（タブ）を取得
	const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
	if (editors.length <= 1) { return; }

	// ✨ 修正の核心：インデックスやオブジェクトでの判定をすべて廃止！
	// VS Code 本体が管理している「ピン留め（固定）されたエディタの総数」を直接取得します。
	// バージョンによるプロパティ名の違いを吸収するため、stickyCount を最優先で取得します。
	const pinnedCount = (group as any).stickyCount ?? (group as any).pinnedCount ?? 0;

	// 境界線（ピン留め数）に基づいて配列を綺麗に2つに切り分ける
	const pinnedEditors = editors.slice(0, pinnedCount);     // 左側のピン留めエリア（一切動かさない）
	const unpinnedEditors = editors.slice(pinnedCount);       // 右側の一般フリーエリア（ソート対象）

	// ソート対象のタブが1つ以下なら並び替える必要がないので終了
	if (unpinnedEditors.length <= 1) { return; }

	// ピン留めされていない一般タブのエリアだけをソート
	unpinnedEditors.sort((a, b) => {
		const uriA = EditorResourceAccessor.getOriginalUri(a);
		const uriB = EditorResourceAccessor.getOriginalUri(b);

		if (globalAutoSortByNameEnabled) {
			// 【名前順ソート】
			const nameA = uriA ? basename(uriA.path).toLowerCase() : 'zzzz';
			const nameB = uriB ? basename(uriB.path).toLowerCase() : 'zzzz';
			if (nameA === nameB) {
				const extA = uriA ? extname(uriA.path).toLowerCase() : '';
				const extB = uriB ? extname(uriB.path).toLowerCase() : '';
				return extA.localeCompare(extB);
			}
			return nameA.localeCompare(nameB);
		} else {
			// 【拡張子順ソート】
			const extA = uriA ? extname(uriA.path).toLowerCase() : 'zzzz';
			const extB = uriB ? extname(uriB.path).toLowerCase() : 'zzzz';
			if (extA === extB) {
				const nameA = uriA ? basename(uriA.path).toLowerCase() : '';
				const nameB = uriB ? basename(uriB.path).toLowerCase() : '';
				return nameA.localeCompare(nameB);
			}
			return extA.localeCompare(extB);
		}
	});

	// 左側の安全なピン留めエリア ＋ ソートされた一般エリア をマージ
	const sortedEditors = [...pinnedEditors, ...unpinnedEditors];

	// 実際のタブ位置に反映
	isSortingAutomatically = true;
	try {
		for (let i = 0; i < sortedEditors.length; i++) {
			const editor = sortedEditors[i];
			const currentIndex = group.getIndexOfEditor(editor);
			if (currentIndex !== i) {
				group.moveEditor(editor, group, { index: i });
			}
		}
	} finally {
		isSortingAutomatically = false;
	}
}

// ==========================================
// 🚀 起動時フック設定 (遅延処理)
// ==========================================
export class InitializeAutoTabSorter {
	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		contextKeyExtension = AutoTabSortEnabledContext.bindTo(this.contextKeyService);
		contextKeyName = AutoTabSortByNameEnabledContext.bindTo(this.contextKeyService);

		contextKeyExtension.set(globalAutoSortEnabled);
		contextKeyName.set(globalAutoSortByNameEnabled);

		// 共通のリスナー処理を定義
		const setupListener = (group: IEditorGroup) => {
			group.onDidModelChange((e: any) => {
				// ピン留め状態の変更イベントそのものは即座にスキップ
				if (e && (e.kind === 4 || e.kind === 5 || e.stickyChanged || e.pinnedChanged)) {
					return;
				}

				// 本家のタブ移動が完了するまで10ms待ってからソートを安全に実行
				setTimeout(() => {
					if (group && typeof group.getEditors === 'function') {
						enforceAutoSort(group);
					}
				}, 10);
			});
		};

		this.editorGroupService.whenReady.then(() => {
			for (const group of this.editorGroupService.groups) {
				setupListener(group);
			}
		});

		this.editorGroupService.onDidAddGroup(group => {
			setupListener(group);
		});
	}
}

// ==========================================
// 🎛️ アクション1：拡張子順自動ソート (トグル)
// ==========================================
export class ToggleAutoTabSortAction extends Action2 {
	static readonly ID = 'workbench.action.files.toggleAutoTabSort';
	constructor() {
		super({
			id: ToggleAutoTabSortAction.ID,
			title: nls.localize2('toggleAutoTabSort', "Auto Sort Tabs by Extension"),
			f1: true,
			category: Categories.File,
			menu: { id: MenuId.EditorTitleContext, group: '2_close', order: 10 },
			toggled: { condition: AutoTabSortEnabledContext }
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		globalAutoSortEnabled = !globalAutoSortEnabled;
		if (globalAutoSortEnabled) {
			globalAutoSortByNameEnabled = false;
		}

		contextKeyExtension?.set(globalAutoSortEnabled);
		contextKeyName?.set(globalAutoSortByNameEnabled);

		const editorGroupService = accessor.get(IEditorGroupsService);
		if (globalAutoSortEnabled && editorGroupService.activeGroup) {
			enforceAutoSort(editorGroupService.activeGroup);
		}
	}
}

// ==========================================
// 🛠️ アクション2：拡張子順手動ソート
// ==========================================
export class SortEditorsByExtensionAction extends Action2 {
	static readonly ID = 'workbench.action.files.sortEditorsByExtension';
	constructor() {
		super({
			id: SortEditorsByExtensionAction.ID,
			title: nls.localize2('sortEditorsByExtension', "Sort Tabs by Extension"),
			f1: true,
			category: Categories.File,
			menu: { id: MenuId.EditorTitleContext, group: '2_close', order: 11 }
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		if (editorGroupService.activeGroup) {
			const backupExt = globalAutoSortEnabled;
			const backupName = globalAutoSortByNameEnabled;
			globalAutoSortEnabled = true;
			globalAutoSortByNameEnabled = false;
			enforceAutoSort(editorGroupService.activeGroup);
			globalAutoSortEnabled = backupExt;
			globalAutoSortByNameEnabled = backupName;
		}
	}
}

// ==========================================
// 🎛️ アクション3：名前順自動ソート (トグル)
// ==========================================
export class ToggleAutoTabSortByNameAction extends Action2 {
	static readonly ID = 'workbench.action.files.toggleAutoTabSortByName';
	constructor() {
		super({
			id: ToggleAutoTabSortByNameAction.ID,
			title: nls.localize2('toggleAutoTabSortByName', "Auto Sort Tabs by Name"),
			f1: true,
			category: Categories.File,
			menu: { id: MenuId.EditorTitleContext, group: '2_close', order: 12 },
			toggled: { condition: AutoTabSortByNameEnabledContext }
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		globalAutoSortByNameEnabled = !globalAutoSortByNameEnabled;
		if (globalAutoSortByNameEnabled) {
			globalAutoSortEnabled = false;
		}

		contextKeyExtension?.set(globalAutoSortEnabled);
		contextKeyName?.set(globalAutoSortByNameEnabled);

		const editorGroupService = accessor.get(IEditorGroupsService);
		if (globalAutoSortByNameEnabled && editorGroupService.activeGroup) {
			enforceAutoSort(editorGroupService.activeGroup);
		}
	}
}

// ==========================================
// 🛠️ アクション4：名前順手動ソート
// ==========================================
export class SortEditorsByNameAction extends Action2 {
	static readonly ID = 'workbench.action.files.sortEditorsByName';
	constructor() {
		super({
			id: SortEditorsByNameAction.ID,
			title: nls.localize2('sortEditorsByName', "Sort Tabs by Name"),
			f1: true,
			category: Categories.File,
			menu: { id: MenuId.EditorTitleContext, group: '2_close', order: 13 }
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		if (editorGroupService.activeGroup) {
			const backupExt = globalAutoSortEnabled;
			const backupName = globalAutoSortByNameEnabled;
			globalAutoSortEnabled = false;
			globalAutoSortByNameEnabled = true;
			enforceAutoSort(editorGroupService.activeGroup);
			globalAutoSortEnabled = backupExt;
			globalAutoSortByNameEnabled = backupName;
		}
	}
}

// すべてのアクションを登録
registerAction2(ToggleAutoTabSortAction);
registerAction2(SortEditorsByExtensionAction);
registerAction2(ToggleAutoTabSortByNameAction);
registerAction2(SortEditorsByNameAction);
