/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as azdata from 'azdata';
import * as vscode from 'vscode';

export abstract class TreeNode {
	private _id: string;
	private _label: string;
	private _parent: TreeNode;
	private _children: TreeNode[];
	private _isLeaf: boolean;
	private _autoLeaf: boolean;

	constructor(p?: { id?: string, label?: string, parent?: TreeNode }) {
		this.initialize(p);
	}

	public initialize(p?: { id?: string, label?: string, parent?: TreeNode }) {
		if (p) {
			this._id = 'id' in p ? p.id : this._id || '_';
			this._label = 'label' in p ? p.label : this._label || this._id;
			this._parent = 'parent' in p ? p.parent : this.parent;
			this._isLeaf = false;
			this._autoLeaf = true;
		}
	}

	public set id(id: string) {
		this._id = id;
	}

	public get id(): string {
		return this._id;
	}

	public set label(label: string) {
		this._label = label;
	}

	public get label(): string {
		return this._label;
	}

	public get parent(): TreeNode {
		return this._parent;
	}

	public get children(): TreeNode[] {
		if (!this._children) {
			this._children = [];
		}
		return this._children;
	}

	public get hasChildren(): boolean {
		return this.children && this.children.length > 0;
	}

	public set isLeaf(isLeaf: boolean) {
		this._isLeaf = isLeaf;
	}

	public get isLeaf(): boolean {
		return this._isLeaf;
	}

	public set autoLeaf(autoLeaf: boolean) {
		this._autoLeaf = autoLeaf;
	}

	public get autoLeaf(): boolean {
		return this._autoLeaf;
	}

	public get root(): TreeNode {
		return TreeNode.getRoot(this);
	}

	public equals(node: TreeNode): boolean {
		if (!node) {
			return undefined;
		}
		return this.nodePath === node.nodePath;
	}

	public static getRoot(node: TreeNode): TreeNode {
		if (!node) {
			return undefined;
		}
		let current: TreeNode = node;
		while (current.parent) {
			current = current.parent;
		}
		return current;
	}

	public get nodePath(): string {
		return TreeNode.getNodePath(this);
	}

	public static getNodePath(node: TreeNode): string {
		if (!node) {
			return undefined;
		}

		let current: TreeNode = node;
		let path = current._id;
		while (current.parent) {
			current = current.parent;
			path = `${current._id}/${path}`;
		}
		return path;
	}

	public async findNode(condition: (node: TreeNode) => boolean, expandIfNeeded?: boolean): Promise<TreeNode> {
		return TreeNode.findNode(this, condition, expandIfNeeded);
	}

	public static async findNode(node: TreeNode, condition: (node: TreeNode) => boolean, expandIfNeeded?: boolean): Promise<TreeNode> {
		if (!node || !condition) {
			return undefined;
		}
		let result: TreeNode = undefined;
		let nodesToCheck: TreeNode[] = [ node ];
		while (nodesToCheck.length > 0) {
			let current = nodesToCheck.shift();
			if (condition(current)) {
				result = current;
				break;
			}
			if (current.hasChildren) {
				nodesToCheck = nodesToCheck.concat(current.children);
			} else if (!current.isLeaf && expandIfNeeded) {
				nodesToCheck = nodesToCheck.concat(await current.getChildren());
			}
		}
		return result;
	}

	public async filterNode(condition: (node: TreeNode) => boolean, expandIfNeeded?: boolean): Promise<TreeNode[]> {
		return TreeNode.filterNode(this, condition, expandIfNeeded);
	}

	public static async filterNode(node: TreeNode, condition: (node: TreeNode) => boolean, expandIfNeeded?: boolean): Promise<TreeNode[]> {
		if (!node || !condition) {
			return undefined;
		}
		let result: TreeNode[] = [];
		let nodesToCheck: TreeNode[] = [ node ];
		while (nodesToCheck.length > 0) {
			let current = nodesToCheck.shift();
			if (condition(current)) {
				result.push(current);
			}
			if (current.hasChildren) {
				nodesToCheck = nodesToCheck.concat(current.children);
			} else if (!current.isLeaf && expandIfNeeded) {
				nodesToCheck = nodesToCheck.concat(await current.getChildren());
			}
		}
		return result;
	}

	public async findNodeByPath(path: string, expandIfNeeded?: boolean): Promise<TreeNode> {
		return TreeNode.findNodeByPath(this, path, expandIfNeeded);
	}

	public static async findNodeByPath(node: TreeNode, path: string, expandIfNeeded?: boolean): Promise<TreeNode> {
		return TreeNode.findNode(node, node => {
			return node.nodePath && (node.nodePath === path || node.nodePath.startsWith(path));
		}, expandIfNeeded);
	}

	public async getChildren(refresh?: boolean): Promise<TreeNode[]> {
		if ((!this.hasChildren && !this._isLeaf) || refresh) {
			await this.expand().then(children => {
				this._children = children;
				if (this.autoLeaf) {
					this._isLeaf = !this.hasChildren;
				}
			}, error => {
				this._isLeaf = false;
			});
		}
		return this._children;
	}

	public addChild(node: TreeNode): void {
		if (!this._children) {
			this._children = [];
		}
		this._children.push(node);
		this._isLeaf = false;
	}

	public clearChildren(): void {
		if (this._children) {
			this._children = [];
			this._isLeaf = false;
		}
	}

	public abstract expand(): Promise<TreeNode[]>;
	public abstract getTreeItem(): vscode.TreeItem;
	public abstract getNodeInfo(): azdata.NodeInfo;
}
