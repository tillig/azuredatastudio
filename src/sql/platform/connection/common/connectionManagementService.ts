/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectionProfile } from 'sql/platform/connection/common/connectionProfile';
import * as WorkbenchUtils from 'sql/workbench/common/sqlWorkbenchUtils';
import { IConnectionManagementService, IConnectOptions, IConnectionResult } from 'sql/platform/connection/common/connectionManagement';
import { IConnectionStoreService } from 'sql/platform/connection/common/connectionStoreService';
import { IConnectionProfile } from 'sql/platform/connection/common/interfaces';
import { ConnectionManagementInfo } from 'sql/platform/connection/common/connectionManagementInfo';
import * as Utils from 'sql/platform/connection/common/utils';
import * as Constants from 'sql/platform/connection/common/constants';
import { ICapabilitiesService } from 'sql/platform/capabilities/common/capabilitiesService';
import * as ConnectionContracts from 'sql/workbench/parts/connection/common/connection';
import { ConnectionStatusManager, isDefaultTypeUri } from 'sql/platform/connection/common/connectionStatusManager';
import { DashboardInput } from 'sql/workbench/parts/dashboard/dashboardInput';
import { ConnectionGlobalStatus } from 'sql/workbench/parts/connection/common/connectionGlobalStatus';
import { ConnectionStatusbarItem } from 'sql/workbench/parts/connection/browser/connectionStatus';
import * as TelemetryKeys from 'sql/platform/telemetry/telemetryKeys';
import * as TelemetryUtils from 'sql/platform/telemetry/telemetryUtilities';
import { IResourceProviderService } from 'sql/workbench/services/resourceProvider/common/resourceProviderService';
import { IAngularEventingService, AngularEventType } from 'sql/platform/angularEventing/common/angularEventingService';
import { Deferred } from 'sql/base/common/promise';
import { ConnectionOptionSpecialType } from 'sql/workbench/api/common/sqlExtHostTypes';
import { values, entries } from 'sql/base/common/objects';
import { ConnectionProviderProperties, IConnectionProviderRegistry, Extensions as ConnectionProviderExtensions } from 'sql/workbench/parts/connection/common/connectionProviderExtension';

import * as azdata from 'azdata';

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import * as platform from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Emitter } from 'vs/base/common/event';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import * as statusbar from 'vs/workbench/browser/parts/statusbar/statusbar';
import { StatusbarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IConnectionDialogService } from 'sql/workbench/services/connection/common/connectionDialogService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';

export class ConnectionManagementService extends Disposable implements IConnectionManagementService {
	_serviceBrand: any;

	private readonly _providers = new Map<string, { onReady: Promise<azdata.ConnectionProvider>, properties: ConnectionProviderProperties }>();
	private readonly uriToProvider = new Map<string, string>();
	private readonly connectionStatusManager = new ConnectionStatusManager(this.capabilitiesService);
	private readonly connectionGlobalStatus = this.instantiationService.createInstance(ConnectionGlobalStatus);

	private readonly _onConnect = this._register(new Emitter<string>());
	public readonly onConnect = this._onConnect.event;

	private readonly _onDisconnect = this._register(new Emitter<string>());
	public readonly onDisconnect = this._onDisconnect.event;

	private readonly _onConnectionChanged = this._register(new Emitter<string>());
	public readonly onConnectionChanged = this._onConnectionChanged.event;

	private readonly _onLanguageFlavorChanged = this._register(new Emitter<azdata.DidChangeLanguageFlavorParams>());
	public readonly onLanguageFlavorChanged = this._onLanguageFlavorChanged.event;

	constructor(
		@IConnectionDialogService private readonly connectionDialogService: IConnectionDialogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICapabilitiesService private readonly capabilitiesService: ICapabilitiesService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IResourceProviderService private readonly resourceProviderService: IResourceProviderService,
		@IAngularEventingService private readonly angularEventing: IAngularEventingService,
		@ILogService private readonly logService: ILogService,
		@IConnectionStoreService private readonly connectionStoreService: IConnectionStoreService
	) {
		super();

		// Register Statusbar item
		(<statusbar.IStatusbarRegistry>platform.Registry.as(statusbar.Extensions.Statusbar)).registerStatusbarItem(new statusbar.StatusbarItemDescriptor(
			ConnectionStatusbarItem,
			StatusbarAlignment.RIGHT,
			100 /* High Priority */
		));

		const registry = platform.Registry.as<IConnectionProviderRegistry>(ConnectionProviderExtensions.ConnectionProviderContributions);

		const providerRegistration = (p: { id: string, properties: ConnectionProviderProperties }) => {
			const provider = {
				onReady: new Deferred<azdata.ConnectionProvider>(),
				properties: p.properties
			};
			this._providers.set(p.id, provider);
		};

		registry.onNewProvider(providerRegistration, this);
		entries(registry.providers).map(v => {
			providerRegistration({ id: v[0], properties: v[1] });
		});

		// Refresh editor titles when connections start/end/change to ensure tabs are colored correctly
		this.onConnectionChanged(() => this.refreshEditorTitles());
		this.onConnect(() => this.refreshEditorTitles());
		this.onDisconnect(() => this.refreshEditorTitles());
	}

	public providerRegistered(providerId: string): boolean {
		return this._providers.has(providerId);
	}

	// Connection Provider Registration
	public registerProvider(providerId: string, provider: azdata.ConnectionProvider): void {
		if (!this._providers.has(providerId)) {
			console.warn('Provider', providerId, 'attempted to register but has no metadata');
			const providerType = {
				onReady: new Deferred<azdata.ConnectionProvider>(),
				properties: undefined
			};
			this._providers.set(providerId, providerType);
		}

		// we know this is a deferred promise because we made it
		(this._providers.get(providerId).onReady as Deferred<azdata.ConnectionProvider>).resolve(provider);
	}

	/**
	 * Get the connections provider ID from an connection URI
	 */
	public getProviderIdFromUri(ownerUri: string): string {
		let providerId = this.uriToProvider.get(ownerUri);
		if (!providerId) {
			providerId = this.connectionStatusManager.getProviderIdFromUri(ownerUri);
		}

		return providerId;
	}

	/**
	 * Loads the  password and try to connect. If fails, shows the dialog so user can change the connection
	 * @param Connection Profile
	 * @param owner of the connection. Can be the editors
	 * @param options to use after the connection is complete
	 */
	private tryConnect(connection: IConnectionProfile, options?: IConnectOptions): Promise<IConnectionResult> {
		// Load the password if it's not already loaded
		return this.connectionStoreService.addSavedPassword(connection).then(async result => {
			const newConnection = result.profile;
			let foundPassword = result.savedCred;

			// If there is no password, try to load it from an existing connection
			if (!foundPassword && this.connectionStoreService.isPasswordRequired(newConnection)) {
				const existingConnection = this.connectionStatusManager.findConnectionProfile(connection);
				if (existingConnection && existingConnection.connectionProfile) {
					newConnection.password = existingConnection.connectionProfile.password;
					foundPassword = true;
				}
			}

			// If the password is required and still not loaded show the dialog
			if ((!foundPassword && this.connectionStoreService.isPasswordRequired(newConnection) && !newConnection.password) || !tokenFillSuccess) {
				return this.showConnectionDialogOnError(connection, owner, { connected: false, errorMessage: undefined, callStack: undefined, errorCode: undefined }, options);
			} else {
				// Try to connect
				return this.connectWithOptions(newConnection, owner.uri, options, owner).then(connectionResult => {
					if (!connectionResult.connected && !connectionResult.errorHandled) {
						// If connection fails show the dialog
						return this.showConnectionDialogOnError(connection, owner, connectionResult, options);
					} else {
						//Resolve with the connection result
						return connectionResult;
					}
				});
			}
		});
	}

	/**
	 * If showing the dialog on error is set to true in the options, shows the dialog with the error
	 * otherwise does nothing
	 */
	private showConnectionDialogOnError(
		connection: IConnectionProfile,
		connectionResult: IConnectionResult,
		options?: IConnectOptions): Promise<IConnectionResult> {
		if (options && options.showConnectionDialogOnError) {
			const params: INewConnectionParams = options && options.params ? options.params : {
				connectionType: isDefaultTypeUri(connection.uri) ? ConnectionType.default : ConnectionType.editor,
				input: owner,
				runQueryOnCompletion: RunQueryOnConnectionMode.none
			};
			return this.showConnectionDialog(params, connection, connectionResult).then(() => {
				return connectionResult;
			});
		} else {
			return Promise.resolve(connectionResult);
		}
	}

	/**
	 * Load the password and opens a new connection
	 * @param Connection Profile
	 * @param uri assigned to the profile (used only when connecting from an editor)
	 * @param options to be used after the connection is completed
	 * @param callbacks to call after the connection is completed
	 */
	public connect(connection: IConnectionProfile, uri?: string, options?: IConnectOptions): Promise<string> {
		if (!uri) {
			uri = Utils.generateUri(connection);
		}
		if (options && options.useExistingConnection) {
			if (this.connectionStatusManager.isConnected(uri)) {
				return Promise.resolve(this.connectionStatusManager.getOriginalOwnerUri(uri));
			}
		}

		return this.tryConnect(connection, options);
	}

	private async connectWithOptions(connection: IConnectionProfile, uri: string, options?: IConnectOptions): Promise<IConnectionResult> {
		connection.options['groupId'] = connection.groupId;
		connection.options['databaseDisplayName'] = connection.databaseName;

		if (!uri) {
			uri = Utils.generateUri(connection);
		}
		uri = this.connectionStatusManager.getOriginalOwnerUri(uri);
		if (!options) {
			options = {
				saveTheConnection: false,
				showDashboard: false,
				params: undefined,
				showConnectionDialogOnError: false,
				showFirewallRuleOnError: true
			};
		}
		let tokenFillSuccess = await this.fillInAzureTokenIfNeeded(connection);
		if (!tokenFillSuccess) {
			throw new Error(nls.localize('connection.noAzureAccount', 'Failed to get Azure account token for connection'));
		}
		return this.createNewConnection(uri, connection).then(connectionResult => {
			if (connectionResult && connectionResult.connected) {
				// The connected succeeded so add it to our active connections now, optionally adding it to the MRU based on
				// the options.saveTheConnection setting
				let connectionMgmtInfo = this.connectionStatusManager.findConnection(uri);
				this.tryAddActiveConnection(connectionMgmtInfo, connection, options.saveTheConnection);

				if (options.saveTheConnection) {
					this.saveToSettings(uri, connection).then(value => {
						this._onAddConnectionProfile.fire(connection);
						this.doActionsAfterConnectionComplete(value, options);
					});
				} else {
					connection.saveProfile = false;
					this.doActionsAfterConnectionComplete(uri, options);
				}
				return connectionResult;
			} else if (connectionResult && connectionResult.errorMessage) {
				return this.handleConnectionError(connection, uri, options, connectionResult).then(result => {
					return result;
				});
			} else {
				return connectionResult;
			}
		});
	}

	private handleConnectionError(connection: IConnectionProfile, uri: string, options: IConnectOptions, connectionResult: IConnectionResult): Promise<IConnectionResult> {
		if (options.showFirewallRuleOnError && connectionResult.errorCode) {
			return this.handleFirewallRuleError(connection, connectionResult).then(success => {
				if (success) {
					options.showFirewallRuleOnError = false;
					return this.connectWithOptions(connection, uri, options);
				} else {
					return connectionResult;
				}
			});
		} else {
			return Promise.resolve(connectionResult);
		}
	}

	private handleFirewallRuleError(connection: IConnectionProfile, connectionResult: IConnectionResult): Promise<boolean> {
		return this.resourceProviderService.handleFirewallRule(connectionResult.errorCode, connectionResult.errorMessage, connection.providerName).then(response => {
			if (response.canHandleFirewallRule) {
				connectionResult.errorHandled = true;
				return this.resourceProviderService.showFirewallRuleDialog(connection, response.ipAddress, response.resourceProviderId);
			} else {
				return false;
			}
		});
	}

	private doActionsAfterConnectionComplete(uri: string, options: IConnectOptions): void {
		const connectionManagementInfo = this.connectionStatusManager.findConnection(uri);
		if (options.showDashboard) {
			this.showDashboardForConnectionManagementInfo(connectionManagementInfo.connectionProfile);
		}
		this._onConnect.fire(uri);
	}

	public showDashboard(connection: IConnectionProfile): Promise<boolean> {
		return this.showDashboardForConnectionManagementInfo(connection);
	}

	private showDashboardForConnectionManagementInfo(connectionProfile: IConnectionProfile): Promise<boolean> {
		// if dashboard profile is already open, focus on that tab
		if (!this.focusDashboard(connectionProfile)) {
			const dashboardInput: DashboardInput = this.instantiationService.createInstance(DashboardInput, connectionProfile);
			return dashboardInput.initializedPromise.then(() => {
				return this.editorService.openEditor(dashboardInput, { pinned: true }, ACTIVE_GROUP);
			}).then(() => true);
		} else {
			return Promise.resolve(true);
		}
	}

	private focusDashboard(profile: IConnectionProfile): boolean {
		let found: boolean = false;

		this.editorService.editors.map(editor => {
			if (editor instanceof DashboardInput) {
				if (DashboardInput.profileMatches(profile, editor.connectionProfile)) {
					editor.connectionProfile.databaseName = profile.databaseName;
					this.editorService.openEditor(editor)
						.then(() => {
							if (!profile.databaseName || Utils.isMaster(profile)) {
								this.angularEventing.sendAngularEvent(editor.uri, AngularEventType.NAV_SERVER);
							} else {
								this.angularEventing.sendAngularEvent(editor.uri, AngularEventType.NAV_DATABASE);
							}
							found = true;
						}, errors.onUnexpectedError);
				}
			}
		});

		return found;
	}

	public getActiveConnections(providers?: string[]): ConnectionProfile[] {
		return this.connectionStatusManager.getActiveConnectionProfiles(providers);
	}

	public getConnectionUriFromId(connectionId: string): string {
		const connectionInfo = this.connectionStatusManager.findConnectionByProfileId(connectionId);
		if (connectionInfo) {
			return connectionInfo.ownerUri;
		} else {
			return undefined;
		}
	}

	public getAdvancedProperties(): azdata.ConnectionOption[] {

		const providers = this.capabilitiesService.providers;
		if (providers) {
			// just grab the first registered provider for now, this needs to change
			// to lookup based on currently select provider
			const providerCapabilities = values(providers)[0];
			if (!!providerCapabilities.connection) {
				return providerCapabilities.connection.connectionOptions;
			}
		}

		return undefined;
	}

	public getConnectionUri(connectionProfile: IConnectionProfile): string {
		return this.connectionStatusManager.getOriginalOwnerUri(Utils.generateUri(connectionProfile));
	}

	/**
	 * Returns a formatted URI in case the database field is empty for the original
	 * URI, which happens when the connected database is master or the default database
	 */
	public getFormattedUri(uri: string, connectionProfile: IConnectionProfile): string {
		if (isDefaultTypeUri(uri)) {
			return this.getConnectionUri(connectionProfile);
		} else {
			return uri;
		}
	}

	/**
	 * Sends a notification that the language flavor for a given URI has changed.
	 * For SQL, this would be the specific SQL implementation being used.
	 *
	 * @param uri the URI of the resource whose language has changed
	 * @param language the base language
	 * @param flavor the specific language flavor that's been set
	 * @throws {Error} if the provider is not in the list of registered providers
	 */
	public doChangeLanguageFlavor(uri: string, language: string, provider: string): void {
		if (this._providers.has(provider)) {
			this._onLanguageFlavorChanged.fire({
				uri: uri,
				language: language,
				flavor: provider
			});
		} else {
			throw new Error(`provider "${provider}" is not registered`);
		}
	}

	/**
	 * Ensures that a default language flavor is set for a URI, if none has already been defined.
	 * @param uri document identifier
	 */
	public ensureDefaultLanguageFlavor(uri: string): void {
		if (!this.getProviderIdFromUri(uri)) {
			// Lookup the default settings and use this
			const defaultProvider = WorkbenchUtils.getSqlConfigValue<string>(this.configurationService, Constants.defaultEngine);
			if (defaultProvider && this._providers.has(defaultProvider)) {
				// Only set a default if it's in the list of registered providers
				this.doChangeLanguageFlavor(uri, 'sql', defaultProvider);
			}
		}
	}

	// Request Senders
	private async sendConnectRequest(connection: IConnectionProfile, uri: string): Promise<boolean> {
		const connectionInfo = Object.assign({}, {
			options: connection.options
		});

		// setup URI to provider ID map for connection
		this.uriToProvider.set(uri, connection.providerName);

		return this._providers.get(connection.providerName).onReady.then((provider) => {
			provider.connect(uri, connectionInfo);

			// TODO make this generic enough to handle non-SQL languages too
			this.doChangeLanguageFlavor(uri, 'sql', connection.providerName);
			return true;
		});
	}

	private sendDisconnectRequest(uri: string): Promise<boolean> {
		const providerId: string = this.getProviderIdFromUri(uri);
		if (!providerId) {
			return Promise.resolve(false);
		}

		return this._providers.get(providerId).onReady.then(provider => {
			provider.disconnect(uri);
			return true;
		});
	}

	private sendCancelRequest(uri: string): Promise<boolean> {
		const providerId: string = this.getProviderIdFromUri(uri);
		if (!providerId) {
			return Promise.resolve(false);
		}

		return this._providers.get(providerId).onReady.then(provider => {
			provider.cancelConnect(uri);
			return true;
		});
	}

	private sendListDatabasesRequest(uri: string): Promise<azdata.ListDatabasesResult> {
		const providerId: string = this.getProviderIdFromUri(uri);
		if (!providerId) {
			return Promise.resolve(undefined);
		}

		return this._providers.get(providerId).onReady.then(provider => {
			return provider.listDatabases(uri).then(result => {
				if (result && result.databaseNames) {
					result.databaseNames.sort();
				}
				return result;
			});
		});
	}

	private addTelemetryForConnectionDisconnected(connection: IConnectionProfile): void {
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.DatabaseDisconnected, {
			provider: connection.providerName
		});
	}

	// Disconnect a URI from its current connection
	// The default editor implementation does not perform UI updates
	// The default force implementation is set to false
	public disconnectEditor(uri: string, force: boolean = false): Promise<boolean> {
		// If the URI is connected, disconnect it and the editor
		if (this.isConnected(uri)) {
			const connection = this.getConnectionProfile(uri);
			return this.doDisconnect(uri, connection);

			// If the URI is connecting, prompt the user to cancel connecting
		} else if (this.isConnecting(uri)) {
			if (!force) {
				return this.shouldCancelConnect().then((result) => {
					// If the user wants to cancel, then disconnect
					if (result) {
						return this.cancelEditorConnection(uri);
					}
					// If the user does not want to cancel, then ignore
					return false;
				});
			} else {
				return this.cancelEditorConnection(uri);
			}
		}
		// If the URI is disconnected, ensure the UI state is consistent and resolve true
		return Promise.resolve(true);
	}

	/**
	 * Functions to handle the connecting life cycle
	 */

	// Connect an open URI to a connection profile
	private createNewConnection(uri: string, connection: IConnectionProfile): Promise<IConnectionResult> {
		return new Promise<IConnectionResult>(resolve => {
			const connectionInfo = this.connectionStatusManager.addConnection(uri, connection);
			// Setup the handler for the connection complete notification to call
			connectionInfo.connectHandler = ((connectResult, errorMessage, errorCode, callStack) => {
				const connectionMngInfo = this.connectionStatusManager.findConnection(uri);
				if (connectionMngInfo && connectionMngInfo.deleted) {
					this.connectionStatusManager.deleteConnection(uri);
					resolve({ connected: connectResult, errorMessage: undefined, errorCode: undefined, callStack: undefined, errorHandled: true, connectionProfile: connection });
				} else {
					if (errorMessage) {
						// Connection to the server failed
						this.connectionStatusManager.deleteConnection(uri);
						resolve({ connected: connectResult, errorMessage: errorMessage, errorCode: errorCode, callStack: callStack, connectionProfile: connection });
					} else {
						resolve({ connected: connectResult, errorMessage: errorMessage, errorCode: errorCode, callStack: callStack, connectionProfile: connection });
					}
				}
			});

			// send connection request
			this.sendConnectRequest(connection, uri);
		});
	}

	// Ask user if they are sure they want to cancel connection request
	private shouldCancelConnect(): Promise<boolean> {
		// Double check if the user actually wants to cancel their connection request
		// Setup our cancellation choices
		const choices: { key, value }[] = [
			{ key: nls.localize('connectionService.yes', 'Yes'), value: true },
			{ key: nls.localize('connectionService.no', 'No'), value: false }
		];

		return this.quickInputService.pick(choices.map(x => x.key), { placeHolder: nls.localize('cancelConnectionConfirmation', 'Are you sure you want to cancel this connection?'), ignoreFocusLost: true }).then((choice) => {
			const confirm = choices.find(x => x.key === choice);
			return confirm && confirm.value;
		});
	}

	private doDisconnect(fileUri: string, connection?: IConnectionProfile): Promise<boolean> {
		const disconnectParams = new ConnectionContracts.DisconnectParams();
		disconnectParams.ownerUri = fileUri;

		// Send a disconnection request for the input URI
		return this.sendDisconnectRequest(fileUri).then((result) => {
			// If the request was sent
			if (result) {
				this.connectionStatusManager.deleteConnection(fileUri);
				if (connection) {
					this._onDisconnect.fire(fileUri);
				}

				if (isDefaultTypeUri(fileUri)) {
					this.connectionGlobalStatus.setStatusToDisconnected(fileUri);
				}

				// TODO: send telemetry events
				// Telemetry.sendTelemetryEvent('DatabaseDisconnected');
			}

			return result;
		});
	}

	public disconnect(connection: IConnectionProfile): Promise<void>;
	public disconnect(ownerUri: string): Promise<void>;
	public disconnect(input: any): Promise<void> {
		let uri: string;
		let profile: IConnectionProfile;
		if (typeof input === 'object') {
			uri = Utils.generateUri(input);
			profile = input;
		} else if (typeof input === 'string') {
			profile = this.getConnectionProfile(input);
			uri = input;
		}
		return this.doDisconnect(uri, profile).then(result => {
			if (result) {
				this.addTelemetryForConnectionDisconnected(input);
				this.connectionStatusManager.deleteConnection(uri);
				return undefined;
			} else {
				return Promise.reject(result);
			}
		});
	}

	public cancelConnection(connection: IConnectionProfile): Promise<boolean> {
		const fileUri = Utils.generateUri(connection);
		return this.cancelConnectionForUri(fileUri);
	}

	public cancelConnectionForUri(fileUri: string): Promise<boolean> {
		// Create a new set of cancel connection params with our file URI
		const cancelParams: ConnectionContracts.CancelConnectParams = new ConnectionContracts.CancelConnectParams();
		cancelParams.ownerUri = fileUri;

		this.connectionStatusManager.deleteConnection(fileUri);
		// Send connection cancellation request
		return this.sendCancelRequest(fileUri);
	}

	public cancelEditorConnection(uri: string): Promise<boolean> {
		if (this.isConnecting(uri)) {
			return this.cancelConnectionForUri(uri);
		} else {
			// If the editor is connected then there is nothing to cancel
			return Promise.resolve(false);
		}
	}
	// Is a certain file URI connected?
	public isConnected(fileUri: string, connectionProfile?: ConnectionProfile): boolean {
		if (connectionProfile) {
			fileUri = Utils.generateUri(connectionProfile);
		}
		return this.connectionStatusManager.isConnected(fileUri);
	}

	/**
	 * Finds existing connection for given profile and purpose is any exists.
	 * The purpose is connection by default
	 */
	public findExistingConnection(connection: IConnectionProfile, purpose?: 'dashboard' | 'insights' | 'connection' | 'notebook'): ConnectionProfile {
		const connectionUri = Utils.generateUri(connection, purpose);
		const existingConnection = this.connectionStatusManager.findConnection(connectionUri);
		if (existingConnection && this.connectionStatusManager.isConnected(connectionUri)) {
			return existingConnection.connectionProfile;
		} else {
			return undefined;
		}
	}

	public isProfileConnected(connectionProfile: IConnectionProfile): boolean {
		const connectionManagement = this.connectionStatusManager.findConnectionProfile(connectionProfile);
		return connectionManagement && !connectionManagement.connecting;
	}

	public isProfileConnecting(connectionProfile: IConnectionProfile): boolean {
		const connectionManagement = this.connectionStatusManager.findConnectionProfile(connectionProfile);
		return connectionManagement && connectionManagement.connecting;
	}

	private isConnecting(fileUri: string): boolean {
		return this.connectionStatusManager.isConnecting(fileUri);
	}

	public getConnectionProfile(fileUri: string): IConnectionProfile {
		return this.connectionStatusManager.isConnected(fileUri) ? this.connectionStatusManager.getConnectionProfile(fileUri) : undefined;
	}

	public getConnectionInfo(fileUri: string): ConnectionManagementInfo {
		return this.connectionStatusManager.isConnected(fileUri) ? this.connectionStatusManager.findConnection(fileUri) : undefined;
	}

	public listDatabases(connectionUri: string): Promise<azdata.ListDatabasesResult> {
		if (this.isConnected(connectionUri)) {
			return this.sendListDatabasesRequest(connectionUri);
		}
		return Promise.resolve(undefined);
	}

	public changeDatabase(connectionUri: string, databaseName: string): Promise<boolean> {
		if (this.isConnected(connectionUri)) {
			const providerId: string = this.getProviderIdFromUri(connectionUri);
			if (!providerId) {
				return Promise.resolve(false);
			}

			return this._providers.get(providerId).onReady.then(provider => {
				return provider.changeDatabase(connectionUri, databaseName).then(result => {
					if (result) {
						this.getConnectionProfile(connectionUri).databaseName = databaseName;
					}
					return result;
				});
			});
		}
		return Promise.resolve(false);
	}

	/**
	 * Rebuild the IntelliSense cache for the connection with the given URI
	 */
	public rebuildIntelliSenseCache(connectionUri: string): Promise<void> {
		if (this.isConnected(connectionUri)) {
			let providerId: string = this.getProviderIdFromUri(connectionUri);
			if (!providerId) {
				return Promise.reject('No provider corresponding to the given URI');
			}

			return this._providers.get(providerId).onReady.then(provider => provider.rebuildIntelliSenseCache(connectionUri));
		}
		return Promise.reject('The given URI is not currently connected');
	}

	private refreshEditorTitles(): void {
		if (this.editorGroupService instanceof EditorPart) {
			this.editorGroupService.refreshEditorTitles();
		}
	}

	public getActiveConnectionCredentials(profileId: string): { [name: string]: string } {
		const profile = this.getActiveConnections().find(connectionProfile => connectionProfile.id === profileId);
		if (!profile) {
			return undefined;
		}

		// Find the password option for the connection provider
		const passwordOption = this.capabilitiesService.getCapabilities(profile.providerName).connection.connectionOptions.find(
			option => option.specialValueType === ConnectionOptionSpecialType.password);
		if (!passwordOption) {
			return undefined;
		}

		const credentials = {};
		credentials[passwordOption.name] = profile.options[passwordOption.name];
		return credentials;
	}

	public getServerInfo(profileId: string): azdata.ServerInfo {
		const profile = this.connectionStatusManager.findConnectionByProfileId(profileId);
		if (!profile) {
			return undefined;
		}

		return profile.serverInfo;
	}

	public getConnectionProfileById(profileId: string): IConnectionProfile {
		const profile = this.connectionStatusManager.findConnectionByProfileId(profileId);
		if (!profile) {
			return undefined;
		}
		return profile.connectionProfile;
	}

	/**
	 * Get the connection string for the provided connection ID
	 */
	public getConnectionString(connectionId: string, includePassword: boolean = false): Promise<string> {
		const ownerUri = this.getConnectionUriFromId(connectionId);

		if (!ownerUri) {
			return Promise.resolve(undefined);
		}

		const providerId = this.getProviderIdFromUri(ownerUri);
		if (!providerId) {
			return Promise.resolve(undefined);
		}

		return this._providers.get(providerId).onReady.then(provider => {
			return provider.getConnectionString(ownerUri, includePassword).then(connectionString => {
				return connectionString;
			});
		});
	}

	/**
	 * Serialize connection with options provider
	 * TODO this could be a map reduce operation
	 */
	public buildConnectionInfo(connectionString: string, provider: string): Promise<azdata.ConnectionInfo> {
		const connectionProvider = this._providers.get(provider);
		if (connectionProvider) {
			return connectionProvider.onReady.then(e => {
				return e.buildConnectionInfo(connectionString);
			});
		}
		return Promise.resolve(undefined);
	}
}
