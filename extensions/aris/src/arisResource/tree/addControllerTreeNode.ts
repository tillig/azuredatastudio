/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { NodeInfo } from 'azdata';
import { TreeNode } from './treeNode';
import { ArisItemType } from '../constants';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class AddControllerTreeNode extends TreeNode {
	private readonly nodeType: string;

	constructor() {
		super({
			id: ArisItemType.AddController,
			label: localize('aris.resource.signInLabel', 'Sign in to Aris Controller...')
		});
		this.nodeType = ArisItemType.AddController;
	}

	public async expand(): Promise<TreeNode[]> {
		return [];
	}

	public getTreeItem(): TreeItem {
		let item = new TreeItem(this.label, TreeItemCollapsibleState.None);
		item.command = {
			title: 'registerArisController',
			command: 'aris.resource.registerArisController',
			arguments: [this]
		};
		item.contextValue = this.nodeType;
		return item;
	}

	public getNodeInfo(): NodeInfo {
		return {
			label: this.label,
			isLeaf: this.isLeaf,
			errorMessage: undefined,
			metadata: undefined,
			nodePath: this.nodePath,
			nodeStatus: undefined,
			nodeType: this.nodeType,
			iconType: this.nodeType,
			nodeSubType: undefined
		};
	}
}
