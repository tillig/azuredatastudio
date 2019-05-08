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

	then<TResult>(onfulfilled?: (value: T) => TResult | Promise<TResult>, onrejected?: (reason: any) => TResult | Promise<TResult>): Promise<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Promise<TResult>, onrejected?: (reason: any) => void): Promise<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Promise<TResult>, onrejected?: (reason: any) => TResult | Promise<TResult> | void): Promise<TResult> {
		return this.promise.then(onfulfilled, onrejected);
	}

	catch<TResult = never>(onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<T | TResult>;
	catch<U>(onRejected?: (error: any) => U | Thenable<U>): Promise<U>;
	catch(onRejected?: any) {
		return this.promise.catch(onRejected);
	}

	finally(onfinally?: () => void): Promise<T> {
		return this.promise.finally(onfinally);
	}
}
