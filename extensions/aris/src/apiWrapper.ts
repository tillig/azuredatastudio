/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as vscode from 'vscode';
import * as azdata from 'azdata';

/**
 * Wrapper class to act as a facade over VSCode and Data APIs and allow us to test / mock callbacks into
 * this API from our code
 *
 * @export
 * ApiWrapper
 */
export class ApiWrapper {

	constructor(public readonly extensionContext?: vscode.ExtensionContext) {
	}

	private addToSubscription(e: vscode.Disposable): vscode.Disposable {
		if (this.extensionContext) {
			this.extensionContext.subscriptions.push(e);
		}
		return e;
	}

	// Data APIs
	public registerConnectionProvider(provider: azdata.ConnectionProvider): vscode.Disposable {
		return this.addToSubscription(azdata.dataprotocol.registerConnectionProvider(provider));
	}

	public registerObjectExplorerProvider(provider: azdata.ObjectExplorerProvider): vscode.Disposable {
		return this.addToSubscription(azdata.dataprotocol.registerObjectExplorerProvider(provider));
	}

	public registerTaskServicesProvider(provider: azdata.TaskServicesProvider): vscode.Disposable {
		return this.addToSubscription(azdata.dataprotocol.registerTaskServicesProvider(provider));
	}

	public registerCapabilitiesServiceProvider(provider: azdata.CapabilitiesProvider): vscode.Disposable {
		return this.addToSubscription(azdata.dataprotocol.registerCapabilitiesServiceProvider(provider));
	}

	public registerTaskHandler(taskId: string, handler: (profile: azdata.IConnectionProfile) => void): void {
		azdata.tasks.registerTask(taskId, handler);
	}

	public startBackgroundOperation(operationInfo: azdata.BackgroundOperationInfo): void {
		azdata.tasks.startBackgroundOperation(operationInfo);
	}

	public getActiveConnections(): Thenable<azdata.connection.Connection[]> {
		return azdata.connection.getActiveConnections();
	}

	public getCurrentConnection(): Thenable<azdata.connection.ConnectionProfile> {
		return azdata.connection.getCurrentConnection();
	}

	// VSCode APIs
	public createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): vscode.Terminal {
		return vscode.window.createTerminal(name, shellPath, shellArgs);
	}

	public createTerminalWithOptions(options: vscode.TerminalOptions): vscode.Terminal {
		return vscode.window.createTerminal(options);
	}

	public executeCommand(command: string, ...rest: any[]): Thenable<any> {
		return vscode.commands.executeCommand(command, ...rest);
	}

	public getFilePathRelativeToWorkspace(uri: vscode.Uri): string {
		return vscode.workspace.asRelativePath(uri);
	}

	public getWorkspaceFolders(): vscode.WorkspaceFolder[] {
		return vscode.workspace.workspaceFolders;
	}

	public getWorkspacePathFromUri(uri: vscode.Uri): string {
		let workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
		return workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
	}

	public registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): vscode.Disposable {
		return this.addToSubscription(vscode.commands.registerCommand(command, callback, thisArg));
	}

	public registerDocumentOpenHandler(handler: (doc: vscode.TextDocument) => any): vscode.Disposable {
		return this.addToSubscription(vscode.workspace.onDidOpenTextDocument(handler));
	}

	public registerTreeDataProvider<T>(viewId: string, treeDataProvider: vscode.TreeDataProvider<T>): vscode.Disposable {
		return this.addToSubscription(vscode.window.registerTreeDataProvider(viewId, treeDataProvider));
	}

	/**
	 * Get the configuration for a extensionName
	 * @param extensionName The string name of the extension to get the configuration for
	 * @param resource The optional URI, as a URI object or a string, to use to get resource-scoped configurations
	 */
	public getConfiguration(): vscode.WorkspaceConfiguration {
		return vscode.workspace.getConfiguration('centralManagementServers');
	}

	public async setConfiguration(value: any): Promise<void> {
		await vscode.workspace.getConfiguration('centralManagementServers').update('servers', value, true);
	}

	/**
	 * Parse uri
	 */
	public parseUri(uri: string): vscode.Uri {
		return vscode.Uri.parse(uri);
	}

	public showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[]> {
		return vscode.window.showOpenDialog(options);
	}

	public showSaveDialog(options: vscode.SaveDialogOptions): Thenable<vscode.Uri> {
		return vscode.window.showSaveDialog(options);
	}

	public createDialog(title: string): azdata.window.Dialog {
		return azdata.window.createModelViewDialog(title);
	}

	public openDialog(dialog: azdata.window.Dialog): void {
		return azdata.window.openDialog(dialog);
	}

	public closeDialog(dialog: azdata.window.Dialog): void {
		return azdata.window.closeDialog(dialog);
	}

	public openTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument>;
	public openTextDocument(options: { language?: string; content?: string; }): Thenable<vscode.TextDocument>;
	public openTextDocument(uriOrOptions: any): Thenable<vscode.TextDocument> {
		return vscode.workspace.openTextDocument(uriOrOptions);
	}

	public showTextDocument(document: vscode.TextDocument, column?: vscode.ViewColumn, preserveFocus?: boolean, preview?: boolean): Thenable<vscode.TextEditor> {
		let options: vscode.TextDocumentShowOptions = {
			viewColumn: column,
			preserveFocus: preserveFocus,
			preview: preview
		};
		return vscode.window.showTextDocument(document, options);
	}

	public showErrorMessage(message: string, ...items: string[]): Thenable<string> {
		return vscode.window.showErrorMessage(message, ...items);
	}

	public showWarningMessage(message: string, ...items: string[]): Thenable<string> {
		return vscode.window.showWarningMessage(message, { modal: true }, ...items);
	}

	public showInformationMessage(message: string, ...items: string[]): Thenable<string> {
		return vscode.window.showInformationMessage(message, ...items);
	}

	public createStatusBarItem(alignment?: vscode.StatusBarAlignment, priority?: number): vscode.StatusBarItem {
		return vscode.window.createStatusBarItem(alignment, priority);
	}

	public get workspaceFolders(): vscode.WorkspaceFolder[] {
		return vscode.workspace.workspaceFolders;
	}

	public createOutputChannel(name: string): vscode.OutputChannel {
		return vscode.window.createOutputChannel(name);
	}

	public registerCompletionItemProvider(selector: vscode.DocumentSelector, provider: vscode.CompletionItemProvider, ...triggerCharacters: string[]): vscode.Disposable {
		return this.addToSubscription(vscode.languages.registerCompletionItemProvider(selector, provider, ...triggerCharacters));
	}
}