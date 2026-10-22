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

// 自動ソートが無限ループに入るのを防ぐためのロックフラグ
let isSortingAutomatically = false;

// ==========================================
// ✨ 【共通処理】自動で拡張子順にソートする関数
// ==========================================
function enforceAutoSort(group: IEditorGroup): void {
	if (isSortingAutomatically) { return; } // すでにソート中なら何もしない（無限ループ防止）

	const editors = group.getEditors(EditorsOrder.SEQUENTIAL);
	if (editors.length <= 1) { return; }

	// 拡張子順のソートロジック
	const sortedEditors = [...editors].sort((a, b) => {
		const uriA = EditorResourceAccessor.getOriginalUri(a);
		const uriB = EditorResourceAccessor.getOriginalUri(b);

		const extA = uriA ? extname(uriA.path).toLowerCase() : 'zzzz';
		const extB = uriB ? extname(uriB.path).toLowerCase() : 'zzzz';

		if (extA === extB) {
			const nameA = uriA ? basename(uriA.path).toLowerCase() : '';
			const nameB = uriB ? basename(uriB.path).toLowerCase() : '';
			return nameA.localeCompare(nameB);
		}
		return extA.localeCompare(extB);
	});

	// 位置に変更があるかチェックし、必要なら並び替え
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
		isSortingAutomatically = false; // 処理が終わったら必ずロック解除
	}
}

// ==========================================
// ✨ 【フック処理】VS Codeの起動時に自動ソートシステムを起動する
// ==========================================
export class InitializeAutoTabSorter {
	constructor(@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService) {

		// 1. 新しく作られるエディタグループすべてに対してイベントを監視する
		this.editorGroupService.whenReady.then(() => {
			for (const group of this.editorGroupService.groups) {
				this.registerGroupListener(group);
			}
		});

		// 2. 画面分割などで新しくグループが増えた場合も自動追従
		this.editorGroupService.onDidAddGroup(group => {
			this.registerGroupListener(group);
		});
	}

	private registerGroupListener(group: IEditorGroup): void {
		// タブが「追加」「削除」「移動」された瞬間のイベントをフック
		group.onDidModelChange(e => {
			// 常に特定の順番（今回は例として拡張子順）に強制固定
			enforceAutoSort(group);
		});
	}
}

// ==========================================
// 3. 手動実行用のアクション (右クリックメニュー)
// ==========================================
export class SortEditorsByExtensionAction extends Action2 {
	static readonly ID = 'workbench.action.files.sortEditorsByExtension';
	constructor() {
		super({
			id: SortEditorsByExtensionAction.ID,
			title: nls.localize2('sortEditorsByExtension', "Sort Tabs by Extension"),
			f1: true,
			category: Categories.File,
			menu: { id: MenuId.EditorTitleContext, group: '2_close', order: 10 }
		});
	}
	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupService = accessor.get(IEditorGroupsService);
		if (editorGroupService.activeGroup) {
			enforceAutoSort(editorGroupService.activeGroup);
		}
	}
}

// 既存のコマンドを登録
registerAction2(SortEditorsByExtensionAction);

// ✨ VS Codeの起動時に一度だけ InitializeAutoTabSorter を動かすためのハック
setTimeout(() => {
	// グローバル環境や初期化タイミングを考慮してサービスを取得し起動
	const accessor = (SortEditorsByExtensionAction as any)._lastAccessor;
	// ※より安全にインスタンス化するため、次のステップで contribution ファイル側での初期化に紐付けます
}, 1000);
