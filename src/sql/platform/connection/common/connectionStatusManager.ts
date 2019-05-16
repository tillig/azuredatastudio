/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectionManagementInfo } from 'sql/platform/connection/common/connectionManagementInfo';
import { ICapabilitiesService } from 'sql/platform/capabilities/common/capabilitiesService';
import { ConnectionProfile } from 'sql/platform/connection/common/connectionProfile';
import * as Utils from 'sql/platform/connection/common/utils';
import * as azdata from 'azdata';
import { StopWatch } from 'vs/base/common/stopwatch';

export class ConnectionStatusManager {

	private connections = new Map<string, ConnectionManagementInfo>();

	constructor(@ICapabilitiesService private capabilitiesService: ICapabilitiesService) {
	}

	public findConnection(uri: string): ConnectionManagementInfo | undefined {
		return this.connections.get(uri);
	}

	public findConnectionByProfileId(profileId: string): ConnectionManagementInfo | undefined {
		for (const conn of this.connections.values()) {
			if (conn.connectionProfile.id === profileId) {
				return conn;
			}
		}
		return undefined;
	}

	public findConnectionProfile(connectionProfile: ConnectionProfile): ConnectionManagementInfo | undefined {
		const id = Utils.generateUri(connectionProfile);
		return this.findConnection(id);
	}

	public deleteConnection(id: string): void {
		const conn = this.connections.get(id);
		if (conn) {
			conn.deleted = true;
			this.connections.delete(id);
		}
	}

	public getConnectionProfile(id: string): ConnectionProfile | undefined {
		const conn = this.connections.get(id);
		return conn && conn.connectionProfile;
	}

	public addConnection(id: string, connection: azdata.IConnectionProfile): ConnectionManagementInfo {
		// Always create a copy and save that in the list
		const connectionProfile = new ConnectionProfile(this.capabilitiesService, connection);
		const connectionInfo = new ConnectionManagementInfo();
		connectionInfo.providerId = connection.providerName;
		connectionInfo.extensionTimer = StopWatch.create();
		connectionInfo.intelliSenseTimer = StopWatch.create();
		connectionInfo.connectionProfile = connectionProfile;
		connectionInfo.connecting = true;
		this.connections.set(id, connectionInfo);
		connectionInfo.serviceTimer = StopWatch.create();
		connectionInfo.ownerUri = id;

		return connectionInfo;
	}

	/**
	 * Call after a connection is saved to settings. It's only for default url connections
	 * which their id is generated from connection options. The group id is used in the generated id.
	 * when the connection is stored, the group id get assigned to the profile and it can change the id
	 * So for those kind of connections, we need to add the new id and the connection
	 */
	public updateConnectionProfile(id: string, connection: ConnectionProfile): string | undefined {
		const conn = this.connections.get(id);
		if (conn && connection) {
			if (isDefaultTypeUri(id)) {
				conn.connectionProfile.groupId = connection.groupId;
				const newId = Utils.generateUri(connection);
				if (newId !== id) {
					this.connections.delete(id);
					this.connections.set(newId, conn);
				}
				id = newId;
			}
			conn.connectionProfile.id = connection.id;
			return id;
		}
		return undefined;
	}

	public onConnectionComplete(summary: azdata.ConnectionInfoSummary): ConnectionManagementInfo | undefined {
		const connection = this.connections.get(summary.ownerUri);
		if (connection) {
			connection.serviceTimer.stop();
			connection.connecting = false;
			connection.connectionId = summary.connectionId;
			connection.serverInfo = summary.serverInfo;
			return connection;
		}
		return undefined;
	}

	/**
	 * Updates database name after connection is complete
	 * @param summary connection summary
	 */
	public updateDatabaseName(summary: azdata.ConnectionInfoSummary): void {
		const connection = this.connections.get(summary.ownerUri);

		//Check if the existing connection database name is different the one in the summary
		if (connection && connection.connectionProfile.databaseName !== summary.connectionSummary.databaseName) {
			//Add the ownerUri with database name to the map if not already exists
			connection.connectionProfile.databaseName = summary.connectionSummary.databaseName;
			const prefix = Utils.getUriPrefix(summary.ownerUri);
			const ownerUriWithDbName = Utils.generateUriWithPrefix(connection.connectionProfile, prefix);
			if (!this.connections.has(ownerUriWithDbName)) {
				this.connections.set(ownerUriWithDbName, connection);
			}
		}
	}

	/**
	 * Tries to find an existing connection that's mapped with the given ownerUri
	 * The purpose for this method is to find the connection given the ownerUri and find the original uri assigned to it. most of the times should be the same.
	 * Only if the db name in the original uri is different when connection is complete, we need to use the original uri
	 * Returns the generated ownerUri for the connection profile if not existing connection found
	 * @param ownerUri connection owner uri to find an existing connection
	 * @param purpose purpose for the connection
	 */
	public getOriginalOwnerUri(ownerUri: string): string {
		let ownerUriToReturn: string = ownerUri;

		let connectionStatusInfo = this.findConnection(ownerUriToReturn);
		if (connectionStatusInfo && connectionStatusInfo.ownerUri) {
			//The ownerUri in the connection status is the one service knows about so use that
			//To call the service for any operation
			ownerUriToReturn = connectionStatusInfo.ownerUri;
		}
		return ownerUriToReturn;
	}

	public onConnectionChanged(changedConnInfo: azdata.ChangedConnectionInfo): azdata.IConnectionProfile | undefined {
		const connection = this.connections.get(changedConnInfo.connectionUri);
		if (connection && connection.connectionProfile) {
			connection.connectionProfile.serverName = changedConnInfo.connection.serverName;
			connection.connectionProfile.databaseName = changedConnInfo.connection.databaseName;
			connection.connectionProfile.userName = changedConnInfo.connection.userName;
			return connection.connectionProfile;
		}
		return undefined;
	}

	public isConnected(id: string): boolean {
		return this.connections.has(id) && this.connections.get(id).connectionId && !!this.connections.get(id).connectionId;
	}

	public isConnecting(id: string): boolean {
		return this.connections.has(id) && this.connections.get(id).connecting;
	}

	public getProviderIdFromUri(ownerUri: string): string {
		let providerId = '';
		const connection = this.findConnection(ownerUri);
		if (connection) {
			providerId = connection.connectionProfile.providerName;
		}
		if (!providerId && isDefaultTypeUri(ownerUri)) {
			const optionsKey = ownerUri.replace(Utils.uriPrefixes.default, '');
			providerId = ConnectionProfile.getProviderFromOptionsKey(optionsKey);
		}
		return providerId;
	}

	/**
	 * Get a list of the active connection profiles managed by the status manager
	*/
	public getActiveConnectionProfiles(providers?: string[]): ConnectionProfile[] {
		let profiles: Array<ConnectionProfile> = [];
		for (const conn of this.connections.values()) {
			profiles.push(conn.connectionProfile);
		}
		// Remove duplicate profiles that may be listed multiple times under different URIs by filtering for profiles that don't have the same ID as an earlier profile in the list
		profiles = profiles.filter((profile, index) => profiles.findIndex(otherProfile => otherProfile.id === profile.id) === index);

		if (providers) {
			profiles = profiles.filter(f => providers.includes(f.providerName));
		}
		return profiles;
	}
}

export function isDefaultTypeUri(uri: string): boolean {
	return uri && uri.startsWith(Utils.uriPrefixes.default);
}
