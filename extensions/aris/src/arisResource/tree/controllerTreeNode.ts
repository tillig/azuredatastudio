/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as azdata from 'azdata';
import * as nls from 'vscode-nls';
import { IControllerTreeChangeHandler } from './controllerTreeChangeHandler';
import { TreeNode } from './treeNode';
import { IEndPoint, IControllerError } from '../../controllerApi/wrapper';
import { ArisControllerApi } from '../../controllerApi/controllerApi';
import { IconPath } from '../constants';

const localize = nls.loadMessageBundle();

export abstract class ControllerTreeNode extends TreeNode {
	private _description: string;
	private _nodeType: string;
	private _iconPath: { dark: string, light: string };
	private _treeChangeHandler: IControllerTreeChangeHandler;

	constructor(p?: {
		id?: string,
		label?: string,
		parent?: ControllerTreeNode,
		description?: string,
		nodeType?: string,
		iconPath?: { dark: string, light: string },
		treeChangeHandler?: IControllerTreeChangeHandler
	}) {
		super();
		this.initialize(p);
	}

	public initialize(p?: {
		id?: string,
		label?: string,
		parent?: ControllerTreeNode,
		description?: string,
		nodeType?: string,
		iconPath?: { dark: string, light: string },
		treeChangeHandler?: IControllerTreeChangeHandler
	}): void {
		if (p) {
			super.initialize(p);
			this.description = 'description' in p ? p.description : this.description;
			this.nodeType = 'nodeType' in p ? p.nodeType : this.nodeType;
			this.iconPath = 'iconPath' in p ? p.iconPath : this.iconPath;
			this.treeChangeHandler = 'treeChangeHandler' in p ? p.treeChangeHandler : this.treeChangeHandler;
		}
	}

	public abstract expand(): Promise<TreeNode[]>;

	public getTreeItem(): vscode.TreeItem {
		let item: vscode.TreeItem = {};
		item.id = this.id;
		item.label = this.label;
		item.collapsibleState = this.isLeaf ?
			vscode.TreeItemCollapsibleState.None :
			vscode.TreeItemCollapsibleState.Collapsed;
		item.iconPath =this._iconPath;
		item.contextValue = this._nodeType;
		item.tooltip = this._description;
		item.iconPath = this._iconPath;
		return item;
	}

	public getNodeInfo(): azdata.NodeInfo {
		return {
			label: this.label,
			isLeaf: this.isLeaf,
			errorMessage: undefined,
			metadata: undefined,
			nodePath: this.nodePath,
			nodeStatus: undefined,
			nodeType: this._nodeType,
			iconType: this._nodeType,
			nodeSubType: undefined
		};
	}

	public get description(): string {
		return this._description;
	}

	public set description(description: string) {
		this._description = description;
	}

	public get nodeType(): string {
		return this._nodeType;
	}

	public set nodeType(nodeType: string) {
		this._nodeType = nodeType;
	}

	public set iconPath(iconPath: { dark: string, light: string }) {
		this._iconPath = iconPath;
	}

	public get iconPath(): { dark: string, light: string } {
		return this._iconPath;
	}

	public set treeChangeHandler(treeChangeHandler: IControllerTreeChangeHandler) {
		this._treeChangeHandler = treeChangeHandler;
	}

	public get treeChangeHandler(): IControllerTreeChangeHandler {
		return this._treeChangeHandler;
	}
}

export class ControllerRootNode extends ControllerTreeNode {
	constructor(p?: { treeChangeHandler: IControllerTreeChangeHandler }) {
		super();
		this.init(p);
	}

	public init(p?: { treeChangeHandler?: IControllerTreeChangeHandler }): void {
		if (p) {
			super.initialize(Object.assign({
				id: 'root',
				label: 'root',
				description: 'root',
				nodeType: 'ControllerRoot',
			}, p));
		}
	}

	public async expand(): Promise<ControllerNode[]> {
		return this.children as ControllerNode[];
	}

	public addControllerNode(url: string, username: string, password: string, rememberPassword: boolean, endPoints?: IEndPoint[]): void {
		let controllerNode = this.getExistingControllerNode(url, username);
		if (controllerNode) {
			controllerNode.password = password;
			controllerNode.rememberPassword = rememberPassword;
			controllerNode.clearChildren();
		} else {
			controllerNode = new ControllerNode({ url, username, password, rememberPassword, parent: this, treeChangeHandler: this.treeChangeHandler });
			this.addChild(controllerNode);
		}

		if (endPoints && endPoints.length > 0) {
			for (let ep of endPoints) {
				controllerNode.addEndPointNode(ep.name, ep.endpoint, ep.description);
			}
		}

		this.treeChangeHandler.notifyAllNodeChanged();
	}

	public deleteControllerNode(url: string, username: string): ControllerNode {
		if (!url || !username) {
			return undefined;
		}
		let nodes = this.children as ControllerNode[];
		let index = nodes.findIndex(e => e.url === url && e.username === username);
		let deleted = undefined;
		if (index >= 0) {
			deleted = nodes.splice(index, 1);
			this.treeChangeHandler.notifyAllNodeChanged();
		}
		return deleted;
	}

	private getExistingControllerNode(url: string, username: string): ControllerNode {
		if (!url || !username) {
			return undefined;
		}
		let nodes = this.children as ControllerNode[];
		return nodes.find(e => e.url === url && e.username === username);
	}
}

export class ControllerNode extends ControllerTreeNode {
	private _url: string;
	private _username: string;
	private _password: string;
	private _rememberPassword: boolean;
	private _skipDialog: boolean;

	constructor(p?: {
		url: string,
		username: string,
		password?: string,
		rememberPassword?: boolean,
		parent?: ControllerRootNode,
		treeChangeHandler?: IControllerTreeChangeHandler
	}) {
		super();
		this.init(p);
	}

	public init(p?: {
		url: string,
		username: string,
		password?: string,
		rememberPassword?: boolean,
		parent?: ControllerRootNode,
		treeChangeHandler?: IControllerTreeChangeHandler
	}): void {
		if (p) {
			let text = `${p.url} (${p.username})`;
			super.initialize(Object.assign({
				id: text,
				label: text,
				description: text,
				nodeType: 'ControllerNode',
				iconPath: IconPath.ControllerNode
			}, p));
			this._url = 'url' in p ? p.url : this._url;
			this._username = 'username' in p ? p.username : this._username;
			this._password = 'password' in p ? p.password : this._password;
			this._rememberPassword = 'rememberPassword' in p ? p.rememberPassword : this._rememberPassword;
			this.autoLeaf = false;
		}
	}

	public async expand(): Promise<EndPointNode[]> {
		if (this.children && this.children.length > 0) {
			this.clearChildren();
			this.treeChangeHandler.notifyNodeChanged(this);
		}

		if (!this._password) {
			if (!this._skipDialog) {
				vscode.commands.executeCommand('aris.resource.registerArisController', this);
			} else {
				this._skipDialog = false;
			}
			return this.children as EndPointNode[];
		}

		return ArisControllerApi.getEndPoints(this._url, this._username, this._password, true).then(response => {
			for (let ep of response.endPoints) {
				this.addEndPointNode(ep.name, ep.endpoint, ep.description);
			}
			this.treeChangeHandler.notifyNodeChanged(this);
			return this.children as EndPointNode[];
		}, error => {
			let e = error as IControllerError;
			vscode.window.showErrorMessage(`${e.message}, What?!!`);
			return this.children as EndPointNode[];
		});
	}

	public addEndPointNode(role: string, endPointAddress: string, description: string): void {
		this.addChild(new EndPointNode({role, endPointAddress, description, parent: this, treeChangeHandler: this.treeChangeHandler}));
		this.treeChangeHandler.notifyNodeChanged(this);
	}

	public getTreeItem(): vscode.TreeItem {
		let item: vscode.TreeItem = super.getTreeItem();
		item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		return item;
	}

	public get url() {
		return this._url;
	}

	public set url(url: string) {
		this._url = url;
	}

	public get username() {
		return this._username;
	}

	public set username(username: string) {
		this._username = username;
	}

	public get password() {
		return this._password;
	}

	public set password(pw: string) {
		this._password = pw;
	}

	public get rememberPassword() {
		return this._rememberPassword;
	}

	public set rememberPassword(rememberPassword: boolean) {
		this._rememberPassword = rememberPassword;
	}

	public skipDialog(): void {
		if (!this._password) {
			this._skipDialog = true;
		}
	}
}

export class EndPointNode extends ControllerTreeNode {
	private _role: string;
	private _endPointAddress: string;

	constructor(p?: {
		role?: string,
		endPointAddress?: string,
		description?: string,
		parent?: ControllerNode,
		treeChangeHandler?: IControllerTreeChangeHandler,
	}) {
		super();
		this.init(p);
	}

	public init(p?: {
		role?: string,
		endPointAddress?: string,
		description?: string,
		parent?: ControllerNode,
		treeChangeHandler?: IControllerTreeChangeHandler,
	}): void {
		if (p) {
			let text = `${p.role}: ${p.endPointAddress}`;
			super.initialize(Object.assign({
				id: text,
				label: text,
				description: text,
				nodeType: 'EndPointNode',
				iconPath: IconPath.EndPointNode
			}, p));
			this.isLeaf = true;
		}
	}

	public async expand(): Promise<TreeNode[]> {
		return this.children;
	}

	public get role() {
		return this._role;
	}

	public set role(role: string) {
		this._role = role;
	}

	public get endPointAddress() {
		return this._endPointAddress;
	}

	public set endPointAddress(endPointAddress: string) {
		this._endPointAddress = endPointAddress;
	}
}
