/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Deferred promise
 */
export class Deferred<T> implements Promise<T> {
	promise: Promise<T>;
	resolve: (value?: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}

	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Promise<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Promise<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult> | void): Promise<TResult> {
		return this.promise.then(onfulfilled, onrejected);
	}

	catch<TResult>(onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<T | TResult>;
	catch<TResult>(onRejected?: (error: any) => TResult | Thenable<TResult>): Promise<TResult>;
	catch<TResult>(onRejected?: any): Promise<T | TResult> {
		return this.promise.catch(onRejected);
	}

	finally(onfinally?: () => void): Promise<T> {
		return this.promise.finally(onfinally);
	}
}
