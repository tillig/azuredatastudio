/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConnectionProfile } from 'sql/platform/connection/common/interfaces';
import { ServerTreeView } from 'sql/workbench/parts/objectExplorer/browser/serverTreeView';

import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

import * as TypeMoq from 'typemoq';
import { CapabilitiesTestService } from 'sqltest/stubs/capabilitiesTestService';
import { TestConnectionStoreService } from 'sql/platform/connection/test/common/testConnectionStoreService';

suite('ServerTreeView onAddConnectionProfile handler tests', () => {

	let serverTreeView: ServerTreeView;
	let mockTree: TypeMoq.Mock<Tree>;
	let mockRefreshTreeMethod: TypeMoq.Mock<Function>;
	let capabilitiesService = new CapabilitiesTestService();

	setup(() => {
		const instantiationService = new TestInstantiationService();
		const connectionStoreService = TypeMoq.Mock.ofType(TestConnectionStoreService, TypeMoq.MockBehavior.Strict);
		connectionStoreService.setup(x => x.hasRegistersConnections()).returns(x => true);
		connectionStoreService.setup(x => x.getConnectionProfileGroups(false)).returns(x => []);
		serverTreeView = new ServerTreeView(undefined, instantiationService, undefined, undefined, undefined, undefined, connectionStoreService.object, capabilitiesService);
		let tree = <Tree>{
			clearSelection() { },
			getSelection() { },
			select(selection) { },
			reveal(reveal) { }
		};
		mockTree = TypeMoq.Mock.ofInstance(tree);
		(serverTreeView as any)._tree = mockTree.object;
		mockRefreshTreeMethod = TypeMoq.Mock.ofType(Function);
		mockRefreshTreeMethod.setup(x => x()).returns(() => Promise.resolve());
		(serverTreeView as any).refreshTree = mockRefreshTreeMethod.object;
		mockTree.setup(x => x.clearSelection());
		mockTree.setup(x => x.select(TypeMoq.It.isAny()));
	});

	async function runAddConnectionProfileHandler(oldSelection, newProfile): Promise<void> {
		mockTree.setup(x => x.getSelection()).returns(() => [oldSelection] || []);
		return (serverTreeView as any).handleAddConnectionProfile(newProfile);
	}

	test('onAddConnectionProfile handler selects the new profile when no profile is already selected', async () => {
		let newProfile = <IConnectionProfile>{
			id: 'test_connection'
		};
		await runAddConnectionProfileHandler(undefined, newProfile);
		mockRefreshTreeMethod.verify(x => x(), TypeMoq.Times.once());
		mockTree.verify(x => x.clearSelection(), TypeMoq.Times.never());
		mockTree.verify(x => x.select(TypeMoq.It.is(profile => profile === newProfile)), TypeMoq.Times.once());
	});

	test('onAddConnectionProfile handler selects the new profile when a different profile is already selected', async () => {
		let oldProfile = <IConnectionProfile>{
			id: 'old_connection'
		};
		let newProfile = <IConnectionProfile>{
			id: 'test_connection'
		};
		await runAddConnectionProfileHandler(oldProfile, newProfile);
		mockRefreshTreeMethod.verify(x => x(), TypeMoq.Times.once());
		mockTree.verify(x => x.clearSelection(), TypeMoq.Times.once());
		mockTree.verify(x => x.select(TypeMoq.It.is(profile => profile === newProfile)), TypeMoq.Times.once());
	});

	test('onAddConnectionProfile handler does not clear the selection when the new profile is already selected', async () => {
		let selectionId = 'test_connection';
		let oldProfile = <IConnectionProfile>{
			id: selectionId
		};
		let newProfile = <IConnectionProfile>{
			id: selectionId
		};
		await runAddConnectionProfileHandler(oldProfile, newProfile);
		mockRefreshTreeMethod.verify(x => x(), TypeMoq.Times.once());
		mockTree.verify(x => x.clearSelection(), TypeMoq.Times.never());
		mockTree.verify(x => x.select(TypeMoq.It.isAny()), TypeMoq.Times.never());
	});

	test('onAddConnectionProfile handler does not clear the previously selected profile if there is no new one', async () => {
		let oldProfile = <IConnectionProfile>{
			id: 'test_connection'
		};
		await runAddConnectionProfileHandler(oldProfile, undefined);
		mockRefreshTreeMethod.verify(x => x(), TypeMoq.Times.once());
		mockTree.verify(x => x.clearSelection(), TypeMoq.Times.never());
		mockTree.verify(x => x.select(TypeMoq.It.isAny()), TypeMoq.Times.never());
	});

	test('The tree refreshes when new capabilities are registered', () => {
		capabilitiesService.fireCapabilitiesRegistered(undefined);
		mockRefreshTreeMethod.verify(x => x(), TypeMoq.Times.once());
	});
});
