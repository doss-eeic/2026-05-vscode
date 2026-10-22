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
// 🧠 共通ソートコアロジック
// ==========================================
function enforceAutoSort(group: IEditorGroup): void {
	if ((!globalAutoSortEnabled && !globalAutoSortByNameEnabled) || isSortingAutomatically) { return; }

	const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
	if (editors.length <= 1) { return; }

	const sortedEditors = [...editors].sort((a, b) => {
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
// 🚀 起動時フック設定
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

		this.editorGroupService.whenReady.then(() => {
			for (const group of this.editorGroupService.groups) {
				group.onDidModelChange(() => enforceAutoSort(group));
			}
		});

		this.editorGroupService.onDidAddGroup(group => {
			group.onDidModelChange(() => enforceAutoSort(group));
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
			globalAutoSortByNameEnabled = false; // 名前順自動をOFF（排他制御）
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
			globalAutoSortEnabled = false; // 拡張子順自動をOFF（排他制御）
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

// すべてのアクションをシステムに一斉登録
registerAction2(ToggleAutoTabSortAction);
registerAction2(SortEditorsByExtensionAction);
registerAction2(ToggleAutoTabSortByNameAction);
registerAction2(SortEditorsByNameAction);
