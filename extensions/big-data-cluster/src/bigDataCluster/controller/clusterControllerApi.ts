/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EndpointRouterApi } from './apiGenerated';

export async function getEndPoints(
	url: string, username: string, password: string, ignoreSslVerification?: boolean
): Promise<IEndPointsResponse> {

	if (!url || !username || !password) {
		return undefined;
	}

	url = adjustUrl(url);
	let endPointApi = new EndpointRouterApi(username, password, url);
	endPointApi.ignoreSslVerification = !!ignoreSslVerification;

	let controllerResponse: IEndPointsResponse = undefined;
	let controllerError: IControllerError = undefined;
	let request = <IEndPointsRequest>{
		url: url,
		username: username,
		password: password,
		method: 'endPointsGet'
	};

	try {
		let result = await endPointApi.endpointsGet();
		controllerResponse = <IEndPointsResponse>{
			response: result.response as IHttpResponse,
			endPoints: result.body as IEndPoint[],
			request
		};
		return controllerResponse;
	} catch (error) {
		if ('response' in error) {
			let err: IEndPointsResponse = error as IEndPointsResponse;
			let errCode = `${err.response.statusCode || ''}`;
			let errMessage = err.response.statusMessage;
			let errUrl = err.response.url;
			controllerError = <IControllerError>{
				address: errUrl,
				code: errCode,
				errno: errCode,
				message: errMessage,
				name: undefined
			};
		} else {
			controllerError = error as IControllerError;
		}
		throw Object.assign(controllerError, { request }) as IControllerError;
	}
}

/**
 * Fixes missing protocol and wrong character for port entered by user
 */
function adjustUrl(url: string): string {
	if (!url) {
		return undefined;
	}

	url = url.trim().replace(/ /g, '').replace(/,(\d+)$/, ':$1');
	if (!url.includes('://')) {
		url = `https://${url}`;
	}
	return url;
}

export interface IEndPointsRequest {
	url: string;
	username: string;
	password?: string;
	method?: string;
}

export interface IEndPointsResponse {
	request?: IEndPointsRequest;
	response: IHttpResponse;
	endPoints: IEndPoint[];
}

export interface IHttpResponse {
	method?: string;
	url?: string;
	statusCode?: number;
	statusMessage?: string;
}

export interface IEndPoint {
	name?: string;
	description?: string;
	endpoint?: string;
	ip?: string;
	port?: number;
}

export interface IControllerError extends Error {
	code?: string;
	errno?: string;
	message: string;
	request?: any;
}
