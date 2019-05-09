/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as azdata from 'azdata';
import { ConnectionStatusManager } from 'sql/platform/connection/common/connectionStatusManager';
import * as Utils from 'sql/platform/connection/common/utils';
import { IConnectionProfile } from 'sql/platform/connection/common/interfaces';
import { TestCapabilitiesService } from 'sql/platform/capabilities/test/common/testCapabilitiesService';
import { ConnectionProfile } from 'sql/platform/connection/common/connectionProfile';

const connectionProfile: IConnectionProfile = {
	connectionName: 'new name',
	serverName: 'new server',
	databaseName: 'database',
	userName: 'user',
	password: 'password',
	authenticationType: '',
	savePassword: true,
	groupFullName: 'g2/g2-2',
	groupId: 'group id',
	getOptionsKey: () => 'connection1',
	matches: undefined,
	providerName: 'MSSQL',
	options: {},
	saveProfile: true,
	id: undefined
};
const editorConnectionProfile: IConnectionProfile = {
	connectionName: 'new name',
	serverName: 'new server',
	databaseName: 'database',
	userName: 'user',
	password: 'password',
	authenticationType: '',
	savePassword: true,
	groupFullName: 'g2/g2-2',
	groupId: 'group id',
	getOptionsKey: () => 'connection2',
	matches: undefined,
	providerName: 'MSSQL',
	options: {},
	saveProfile: true,
	id: undefined
};
const connectionProfileWithoutDbName: IConnectionProfile = {
	connectionName: 'new name',
	serverName: 'new server',
	databaseName: '',
	userName: 'user',
	password: 'password',
	authenticationType: '',
	savePassword: true,
	groupFullName: 'g2/g2-2',
	groupId: 'group id',
	getOptionsKey: () => 'connection1',
	matches: undefined,
	providerName: 'MSSQL',
	options: {},
	saveProfile: true,
	id: undefined
};

suite('ConnectionStatusManager', () => {
	let connectionStatusManager: ConnectionStatusManager;
	let connectionObject: ConnectionProfile;

	setup(() => {
		const capabiltiesService = new TestCapabilitiesService();
		connectionObject = new ConnectionProfile(capabiltiesService, connectionProfile);
		connectionStatusManager = new ConnectionStatusManager(capabiltiesService);
	});

	test('findConnection should return undefined given invalid id', () => {
		const actual = connectionStatusManager.findConnection('invalid');
		assert.equal(actual, undefined);
	});

	test('findConnection should return the correct connection given valid id', () => {
		const connectionId = 'connectionId';
		connectionStatusManager.addConnection(connectionId, connectionProfile);
		const actual = connectionStatusManager.findConnection(connectionId);
		assert.ok(connectionObject.matches(actual.connectionProfile));
	});

	test('getConnectionProfile should return undefined given invalid id', () => {
		const actual = connectionStatusManager.getConnectionProfile('invalid');
		assert.equal(actual, undefined);
	});

	test('getConnectionProfile should return correct connection given valid id', () => {
		const connectionId = 'connectionId';
		connectionStatusManager.addConnection(connectionId, connectionProfile);
		const actual = connectionStatusManager.getConnectionProfile(connectionId);
		assert.ok(connectionObject.matches(actual));
	});

	test('addConnection should set connecting to true', () => {
		const connectionId = 'connectionId';
		const actual = connectionStatusManager.addConnection(connectionId, connectionProfile).connecting;
		assert.ok(actual);
	});

	test('onConnectionComplete should set connecting to false', () => {
		const connectionId = 'connectionId';
		const summary: azdata.ConnectionInfoSummary = {
			ownerUri: connectionId,
			connectionId: connectionId,
			messages: undefined,
			errorMessage: undefined,
			errorNumber: undefined,
			serverInfo: undefined,
			connectionSummary: undefined
		};
		connectionStatusManager.addConnection(connectionId, connectionProfile);
		connectionStatusManager.onConnectionComplete(summary);
		assert.ok(!connectionStatusManager.findConnection(connectionId).connecting);
		assert.ok(!connectionStatusManager.isConnecting(connectionId));
	});

	test('updateConnection should update the connection info', () => {
		const connectionId = Utils.generateUri(connectionProfile);
		const newGroupId = connectionProfile.groupId + '1';
		connectionStatusManager.addConnection(connectionId, connectionProfile);

		const updatedConnection = Object.assign({}, connectionProfile, { groupId: newGroupId, getOptionsKey: () => connectionProfile.getOptionsKey() + newGroupId, id: newGroupId });
		const actualId = connectionStatusManager.updateConnectionProfile(connectionId, updatedConnection);

		const newId = Utils.generateUri(updatedConnection);
		const actual = connectionStatusManager.getConnectionProfile(newId).groupId;
		const actualConnectionId = connectionStatusManager.getConnectionProfile(newId).id;
		assert.equal(actual, newGroupId);
		assert.equal(actualId, newId);
		assert.equal(actualConnectionId, newGroupId);
	});

	test('updateDatabaseName should update the database name in connection', () => {
		const connectionId = 'connectionId';
		const dbName: string = 'db name';
		const summary: azdata.ConnectionInfoSummary = {
			connectionSummary: {
				databaseName: dbName,
				serverName: undefined,
				userName: undefined
			}
			, ownerUri: connectionId,
			connectionId: 'connection id',
			errorMessage: undefined,
			errorNumber: undefined,
			messages: undefined,
			serverInfo: undefined
		};

		connectionStatusManager.addConnection(connectionId, connectionProfileWithoutDbName);

		//Verify database name changed after connection is complete
		connectionStatusManager.updateDatabaseName(summary);
		const connectionStatus = connectionStatusManager.findConnection(connectionId);
		assert.equal(connectionStatus.connectionProfile.databaseName, dbName);
	});

	test('getOriginalOwnerUri should return the original uri given uri with db name', () => {
		const connectionId = 'connectionId';
		const dbName: string = 'db name';
		const summary: azdata.ConnectionInfoSummary = {
			connectionSummary: {
				databaseName: dbName,
				serverName: undefined,
				userName: undefined
			}
			, ownerUri: connectionId,
			connectionId: 'connection id',
			errorMessage: undefined,
			errorNumber: undefined,
			messages: undefined,
			serverInfo: undefined
		};

		connectionStatusManager.addConnection(connectionId, connectionProfileWithoutDbName);

		//Verify database name changed after connection is complete
		connectionStatusManager.updateDatabaseName(summary);
		const connectionStatus = connectionStatusManager.findConnection(connectionId);
		let ownerUriWithDbName = Utils.generateUriWithPrefix(connectionStatus.connectionProfile, 'connection://');

		//The uri assigned to connection without db name should be the original one
		const connectionWitDbStatus = connectionStatusManager.getOriginalOwnerUri(ownerUriWithDbName);
		assert.equal(connectionWitDbStatus, connectionId);
	});

	test('getOriginalOwnerUri should return given uri if the original uri is the same as the given uri', () => {
		const connectionId = 'connectionId';
		connectionStatusManager.addConnection(connectionId, editorConnectionProfile);
		const connectionStatus = connectionStatusManager.getOriginalOwnerUri(connectionId);
		assert.equal(connectionStatus, connectionId);
	});

	test('getActiveConnectionProfiles should return a list of all the unique connections that the status manager knows about', () => {
		// Add duplicate connections
		const newConnection = Object.assign({}, connectionProfile);
		newConnection.id = 'test_id';
		newConnection.serverName = 'new_server_name';
		newConnection.options['databaseDisplayName'] = newConnection.databaseName;
		connectionStatusManager.addConnection('test_uri_1', newConnection);
		connectionStatusManager.addConnection('test_uri_2', newConnection);

		// Get the connections and verify that the duplicate is only returned once
		const activeConnections = connectionStatusManager.getActiveConnectionProfiles();
		assert.equal(activeConnections.length, 1);
		assert.equal(activeConnections.filter(connection => connection.matches(newConnection)).length, 1, 'Did not find newConnection in active connections');
	});
});
