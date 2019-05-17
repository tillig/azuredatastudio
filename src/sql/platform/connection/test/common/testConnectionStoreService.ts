/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConnectionStoreService } from 'sql/platform/connection/common/connectionStoreService';
import { Event } from 'vs/base/common/event';
import { IConnectionProfile } from 'sql/platform/connection/common/interfaces';
import { ConnectionProfileGroup, IConnectionProfileGroup } from 'sql/platform/connection/common/connectionProfileGroup';
import { ConnectionProfile } from 'sql/platform/connection/common/connectionProfile';

export class TestConnectionStoreService implements IConnectionStoreService {
	hasRegistersConnections(): boolean {
		throw new Error('Method not implemented.');
	}
	_serviceBrand: any;
	onProfileDeleted: Event<IConnectionProfile>;
	onProfileAdded: Event<IConnectionProfile>;
	onProfileUpdated: Event<IConnectionProfile>;
	onGroupDeleted: Event<ConnectionProfileGroup>;
	onGroupAdded: Event<string>;
	onGroupUpdated: Event<ConnectionProfileGroup>;
	addSavedPassword(profile: IConnectionProfile): Promise<{ profile: IConnectionProfile; savedCred: boolean; }> {
		throw new Error('Method not implemented.');
	}
	isPasswordRequired(profile: IConnectionProfile): boolean {
		throw new Error('Method not implemented.');
	}
	saveProfile(profile: IConnectionProfile, forceWritePlaintextPassword?: boolean): Promise<IConnectionProfile> {
		throw new Error('Method not implemented.');
	}
	addRecentConnection(conn: IConnectionProfile): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getRecentlyUsedConnections(providers?: string[]): ConnectionProfile[] {
		throw new Error('Method not implemented.');
	}
	deleteConnectionFromConfiguration(connection: ConnectionProfile): Promise<void> {
		throw new Error('Method not implemented.');
	}
	deleteGroupFromConfiguration(group: ConnectionProfileGroup): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getConnectionProfileGroups(withoutConnections?: boolean, providers?: string[]): ConnectionProfileGroup[] {
		throw new Error('Method not implemented.');
	}
	editGroup(group: ConnectionProfileGroup): Promise<void> {
		throw new Error('Method not implemented.');
	}
	saveProfileGroup(profile: IConnectionProfileGroup): Promise<string> {
		throw new Error('Method not implemented.');
	}
	clearRecentlyUsed(): void {
		throw new Error('Method not implemented.');
	}
	removeRecentConnection(conn: IConnectionProfile): void {
		throw new Error('Method not implemented.');
	}
	getProfileWithoutPassword(conn: IConnectionProfile): ConnectionProfile {
		throw new Error('Method not implemented.');
	}
	canChangeConnectionConfig(profile: ConnectionProfile, newGroupID: string): boolean {
		throw new Error('Method not implemented.');
	}
	changeGroupIdForConnectionGroup(source: ConnectionProfileGroup, target: ConnectionProfileGroup): Promise<void> {
		throw new Error('Method not implemented.');
	}
	changeGroupIdForConnection(source: ConnectionProfile, targetGroupId: string): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getConnections(): ConnectionProfile[] {
		throw new Error('Method not implemented.');
	}
	getGroupFromId(groupId: string): IConnectionProfileGroup {
		throw new Error('Method not implemented.');
	}
}