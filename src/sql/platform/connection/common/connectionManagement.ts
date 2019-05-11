/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import * as azdata from 'azdata';
import { IConnectionProfileGroup } from 'sql/platform/connection/common/connectionProfileGroup';
import { ConnectionProfile } from 'sql/platform/connection/common/connectionProfile';
import { IConnectionProfile } from 'sql/platform/connection/common/interfaces';
import { ConnectionManagementInfo } from 'sql/platform/connection/common/connectionManagementInfo';

/**
 * Options for the actions that could happen after connecting is complete
 */
export interface IConnectOptions {
	/**
	 * save the connection to MRU and settings (only save to setting if profile.saveProfile is set to true)
	 */
	saveTheConnection?: boolean;

	/**
	 * open the dashboard after connection is complete
	 */
	showDashboard?: boolean;

	/**
	 * Open the connection dialog if connection fails
	 */
	showConnectionDialogOnError?: boolean;

	/**
	 * Open the connection firewall rule dialog if connection fails
	 */
	showFirewallRuleOnError?: boolean;

	/**
	 * Use an existing connection with the same profile if exists
	 */
	useExistingConnection?: boolean;
}

export interface IConnectionResult {
	connected: boolean;
	errorMessage: string;
	errorCode: number;
	callStack: string;
	connectionProfile?: IConnectionProfile;
}

export const SERVICE_ID = 'connectionManagementService';

export const IConnectionManagementService = createDecorator<IConnectionManagementService>(SERVICE_ID);

export interface IConnectionManagementService {
	_serviceBrand: any;

	// Event Emitters
	readonly onConnect: Event<string>;
	readonly onDisconnect: Event<string>;
	readonly onConnectionChanged: Event<string>;
	readonly onLanguageFlavorChanged: Event<azdata.DidChangeLanguageFlavorParams>;

	/**
	 * Open a connection with the given profile
	 */
	connect(connection: IConnectionProfile, uri?: string, options?: IConnectOptions): Promise<string>;

	/**
	 * Finds existing connection for given profile and purpose is any exists.
	 * The purpose is connection by default
	 */
	findExistingConnection(connection: IConnectionProfile, purpose?: 'dashboard' | 'insights' | 'connection'): ConnectionProfile;

	getActiveConnections(providers?: string[]): ConnectionProfile[];

	getAdvancedProperties(): azdata.ConnectionOption[];

	getConnectionUri(connectionProfile: IConnectionProfile): string;

	getFormattedUri(uri: string, connectionProfile: IConnectionProfile): string;

	getConnectionUriFromId(connectionId: string): string;

	isConnected(fileUri: string): boolean;

	/**
	 * Returns true if the connection profile is connected
	 */
	isProfileConnected(connectionProfile: IConnectionProfile): boolean;

	/**
	 * Returns true if the connection profile is connecting
	 */
	isProfileConnecting(connectionProfile: IConnectionProfile): boolean;

	isConnected(fileUri: string, connectionProfile?: ConnectionProfile): boolean;

	disconnect(connection: IConnectionProfile): Promise<void>;
	disconnect(ownerUri: string): Promise<void>;

	listDatabases(connectionUri: string): Promise<azdata.ListDatabasesResult>;

	/**
	 * Register a connection provider
	 */
	registerProvider(providerId: string, provider: azdata.ConnectionProvider): void;

	getConnectionProfile(fileUri: string): IConnectionProfile;

	getConnectionInfo(fileUri: string): ConnectionManagementInfo;

	/**
	 * Cancels the connection
	 */
	cancelConnection(connection: IConnectionProfile): Promise<boolean>;

	/**
	 * Changes the database for an active connection
	 */
	changeDatabase(connectionUri: string, databaseName: string): Promise<boolean>;

	showDashboard(connection: IConnectionProfile): Promise<boolean>;

	getProviderIdFromUri(ownerUri: string): string;

	/**
	 * Sends a notification that the language flavor for a given URI has changed.
	 * For SQL, this would be the specific SQL implementation being used.
	 *
	 * @param uri the URI of the resource whose language has changed
	 * @param language the base language
	 * @param flavor the specific language flavor that's been set
	 */
	doChangeLanguageFlavor(uri: string, language: string, flavor: string): void;

	/**
	 * Ensures that a default language flavor is set for a URI, if none has already been defined.
	 * @param uri document identifier
	 */
	ensureDefaultLanguageFlavor(uri: string): void;

	/**
	 * Refresh the IntelliSense cache for the connection with the given URI
	 */
	rebuildIntelliSenseCache(uri: string): Promise<void>;

	/**
	 * Get the credentials for a connected connection profile, as they would appear in the options dictionary
	 * @param profileId The id of the connection profile to get the password for
	 * @returns A dictionary containing the credentials as they would be included
	 * in the connection profile's options dictionary, or undefined if the profile is not connected
	 */
	getActiveConnectionCredentials(profileId: string): { [name: string]: string };

	/**
	 * Get the ServerInfo for a connected connection profile
	 * @param profileId The id of the connection profile to get the password for
	 * @returns ServerInfo
	 */
	getServerInfo(profileId: string): azdata.ServerInfo;

	/**
	 * Get the connection string for the provided connection ID
	 */
	getConnectionString(connectionId: string, includePassword: boolean): Promise<string>;

	/**
	 * Serialize connection string with optional provider
	 */
	buildConnectionInfo(connectionString: string, provider?: string): Promise<azdata.ConnectionInfo>;

	providerRegistered(providerId: string): boolean;
	/**
	 * Get connection profile by id
	 */
	getConnectionProfileById(profileId: string): IConnectionProfile;
}
