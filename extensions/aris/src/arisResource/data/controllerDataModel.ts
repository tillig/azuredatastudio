/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEndPoint } from '../../controllerApi/wrapper';

export interface IControllerInfo {
	url: string;
	username: string;
	password?: string;
	endPoints?: IEndPoint[];
}

export class ControllerDataModel {
	private cache: Map<string, IControllerInfo> = new Map<string, IControllerInfo>();

	public cacheEndPoints(url: string, username: string, password: string, endPoints: IEndPoint[]): void {
		if (!url || !username || !password || !endPoints) {
			return;
		}
		let key: string = JSON.stringify({ url, username, password });
		if (!this.cache.has(key)) {
			this.cache.set(key, <IControllerInfo>{ url, username, password, endPoints });
		} else {
			let cachedData: IControllerInfo = this.cache.get(key);
			cachedData.endPoints = endPoints;
		}
	}

	public getController(url: string, username: string, password?: string): IControllerInfo {
		if (!url || !username) {
			return;
		}
		if (password) {
			let key: string = JSON.stringify({ url, username, password });
			return this.cache.get(key);
		}

		let allControllers: IControllerInfo[] = this.getAllControllers();
		return allControllers.find(e => e.url === url && e.username === username);
	}

	public getAllControllers(): IControllerInfo[] {
		if (this.cache.size === 0) {
			return undefined;
		}
		return Array.from(this.cache.values());
	}
}
