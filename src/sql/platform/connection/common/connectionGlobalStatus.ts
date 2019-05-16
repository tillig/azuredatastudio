/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectionSummary } from 'azdata';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { localize } from 'vs/nls';

const displayTime = 5000;


// Status when making connections from the viewlet
export class ConnectionGlobalStatus {

	constructor(
		@IStatusbarService private _statusBarService: IStatusbarService
	) {
	}

	public setStatusToConnected(connectionSummary: ConnectionSummary): void {
		let connInfo: string = connectionSummary.serverName;
		if (this._statusBarService && connInfo) {
			if (connectionSummary.databaseName && connectionSummary.databaseName !== '') {
				connInfo = connInfo + ' : ' + connectionSummary.databaseName;
			} else {
				connInfo = connInfo + ' : ' + '<default>';
			}
			let text = localize('onDidConnectMessage', 'Connected to {0}', connInfo) + ' ' + connInfo;
			this._statusBarService.setStatusMessage(text, displayTime);
		}
	}

	public setStatusToDisconnected(): void {
		if (this._statusBarService) {
			this._statusBarService.setStatusMessage(localize('onDidDisconnectMessage', 'Disconnected'), displayTime);
		}
	}
}
