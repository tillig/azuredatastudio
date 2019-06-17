/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as azdata from 'azdata';
import * as constants from './constants';

export class MssqlSampleStrProvider implements azdata.SampleStrProvider {
	public readonly providerId: string = constants.sqlProviderName;
	public handle: number;

	getSampleStr(str: string): Thenable<string> {
		return Promise.resolve(`Hello, ${str}!`);
	}
}