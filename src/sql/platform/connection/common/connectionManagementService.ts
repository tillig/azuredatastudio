/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConnectionProfile } from 'sql/platform/connection/common/connectionProfile';
import * as WorkbenchUtils from 'sql/workbench/common/sqlWorkbenchUtils';
import {
	IConnectionManagementService, INewConnectionParams,
	ConnectionType, IConnectableInput, IConnectionCompletionOptions, IConnectionCallbacks,
	IConnectionParams, IConnectionResult, RunQueryOnConnectionMode
} from 'sql/platform/connection/common/connectionManagement';
import { ConnectionStore } from 'sql/platform/connection/common/connectionStore';
import { IConnectionProfile } from 'sql/platform/connection/common/interfaces';
import { ConnectionManagementInfo } from 'sql/platform/connection/common/connectionManagementInfo';
import * as Utils from 'sql/platform/connection/common/utils';
import * as Constants from 'sql/platform/connection/common/constants';
import { ICapabilitiesService } from 'sql/platform/capabilities/common/capabilitiesService';
import * as ConnectionContracts from 'sql/workbench/parts/connection/common/connection';
import { ConnectionStatusManager } from 'sql/platform/connection/common/connectionStatusManager';
import { DashboardInput } from 'sql/workbench/parts/dashboard/dashboardInput';
import { ConnectionGlobalStatus } from 'sql/workbench/parts/connection/common/connectionGlobalStatus';
import { ConnectionStatusbarItem } from 'sql/workbench/parts/connection/browser/connectionStatus';
import * as TelemetryKeys from 'sql/platform/telemetry/telemetryKeys';
import * as TelemetryUtils from 'sql/platform/telemetry/telemetryUtilities';
import { IResourceProviderService } from 'sql/workbench/services/resourceProvider/common/resourceProviderService';
import { IAngularEventingService, AngularEventType } from 'sql/platform/angularEventing/common/angularEventingService';
import * as QueryConstants from 'sql/workbench/parts/query/common/constants';
import { Deferred } from 'sql/base/common/promise';
import { ConnectionOptionSpecialType } from 'sql/workbench/api/common/sqlExtHostTypes';
import { values, entries } from 'sql/base/common/objects';
import { ConnectionProviderProperties, IConnectionProviderRegistry, Extensions as ConnectionProviderExtensions } from 'sql/workbench/parts/connection/common/connectionProviderExtension';
import { IAccountManagementService, AzureResource } from 'sql/platform/accounts/common/interfaces';

import * as azdata from 'azdata';

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService, ACTIVE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import * as platform from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ConnectionProfileGroup, IConnectionProfileGroup } from 'sql/platform/connection/common/connectionProfileGroup';
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
	private readonly connectionStore = this.instantiationService.createInstance(ConnectionStore);
	private readonly connectionGlobalStatus = this.instantiationService.createInstance(ConnectionGlobalStatus);

	private readonly _onAddConnectionProfile = new Emitter<IConnectionProfile>();
	public readonly onAddConnectionProfile = this._onAddConnectionProfile.event;

	private readonly _onDeleteConnectionProfile = new Emitter<void>();
	public readonly onDeleteConnectionProfile = this._onDeleteConnectionProfile.event;

	private readonly _onConnect = new Emitter<IConnectionParams>();
	public readonly onConnect = this._onConnect.event;

	private readonly _onDisconnect = new Emitter<IConnectionParams>();
	public readonly onDisconnect = this._onDisconnect.event;

	private readonly _onConnectionChanged = new Emitter<IConnectionParams>();
	public readonly onConnectionChanged = this._onConnectionChanged.event;

	private readonly _onLanguageFlavorChanged = new Emitter<azdata.DidChangeLanguageFlavorParams>();
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
		@IAccountManagementService private readonly accountManagementService: IAccountManagementService,
		@ILogService private readonly logService: ILogService
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

		this._register(this._onAddConnectionProfile);
		this._register(this._onDeleteConnectionProfile);

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
	 * Opens the connection dialog
	 * @param params Include the uri, type of connection
	 * @param model the existing connection profile to create a new one from
	 */
	public showConnectionDialog(params?: INewConnectionParams, model?: IConnectionProfile, connectionResult?: IConnectionResult): Promise<void> {
		if (!params) {
			params = { connectionType: ConnectionType.default };
		}
		if (!model && params.input && params.input.uri) {
			model = this.connectionStatusManager.getConnectionProfile(params.input.uri);
		}
		return this.connectionDialogService.showDialog(this, params, model, connectionResult);
	}

	/**
	 * Load the password for the profile
	 * @param connectionProfile Connection Profile
	 */
	public async addSavedPassword(connectionProfile: IConnectionProfile): Promise<IConnectionProfile> {
		await this.fillInAzureTokenIfNeeded(connectionProfile);
		return this.connectionStore.addSavedPassword(connectionProfile).then(result => result.profile);
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
	private tryConnect(connection: IConnectionProfile, owner: IConnectableInput, options?: IConnectionCompletionOptions): Promise<IConnectionResult> {
		// Load the password if it's not already loaded
		return this.connectionStore.addSavedPassword(connection).then(async result => {
			const newConnection = result.profile;
			let foundPassword = result.savedCred;

			// If there is no password, try to load it from an existing connection
			if (!foundPassword && this.connectionStore.isPasswordRequired(newConnection)) {
				const existingConnection = this.connectionStatusManager.findConnectionProfile(connection);
				if (existingConnection && existingConnection.connectionProfile) {
					newConnection.password = existingConnection.connectionProfile.password;
					foundPassword = true;
				}
			}

			// Fill in the Azure account token if needed and open the connection dialog if it fails
			const tokenFillSuccess = await this.fillInAzureTokenIfNeeded(newConnection);

			// If the password is required and still not loaded show the dialog
			if ((!foundPassword && this.connectionStore.isPasswordRequired(newConnection) && !newConnection.password) || !tokenFillSuccess) {
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
		owner: IConnectableInput,
		connectionResult: IConnectionResult,
		options?: IConnectionCompletionOptions): Promise<IConnectionResult> {
		if (options && options.showConnectionDialogOnError) {
			const params: INewConnectionParams = options && options.params ? options.params : {
				connectionType: this.connectionStatusManager.isDefaultTypeUri(owner.uri) ? ConnectionType.default : ConnectionType.editor,
				input: owner,
				runQueryOnCompletion: RunQueryOnConnectionMode.none,
				showDashboard: options.showDashboard
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
	public connect(connection: IConnectionProfile, uri?: string, options?: IConnectionCompletionOptions, callbacks?: IConnectionCallbacks): Promise<string> {
		if (!uri) {
			uri = Utils.generateUri(connection);
		}
		if (options && options.useExistingConnection) {
			if (this.connectionStatusManager.isConnected(uri)) {
				return Promise.resolve(this.connectionStatusManager.getOriginalOwnerUri(ownerUri));
			}
		}
		let input: IConnectableInput = options && options.params ? options.params.input : undefined;
		if (!input) {
			input = {
				onConnectReject: callbacks ? callbacks.onConnectReject : undefined,
				onConnectStart: callbacks ? callbacks.onConnectStart : undefined,
				onConnectSuccess: callbacks ? callbacks.onConnectSuccess : undefined,
				onDisconnect: callbacks ? callbacks.onDisconnect : undefined,
				onConnectCanceled: callbacks ? callbacks.onConnectCanceled : undefined,
				uri: uri
			};
		}


		if (uri !== input.uri) {
			//TODO: this should never happen. If the input is already passed, it should have the uri
			this.logService.warn(`the given uri is different that the input uri. ${uri}|${input.uri}`);
		}
		return this.tryConnect(connection, input, options);
	}

	/**
	 * If there's already a connection for given profile and purpose, returns the ownerUri for the connection
	 * otherwise tries to make a connection and returns the owner uri when connection is complete
	 * The purpose is connection by default
	 */
	public connectIfNotConnected(connection: IConnectionProfile, purpose?: 'dashboard' | 'insights' | 'connection' | 'notebook', saveConnection: boolean = false): Promise<string> {
		const ownerUri: string = Utils.generateUri(connection, purpose);
		if (this.connectionStatusManager.isConnected(ownerUri)) {
			return Promise.resolve(this.connectionStatusManager.getOriginalOwnerUri(ownerUri));
		} else {
			const options: IConnectionCompletionOptions = {
				saveTheConnection: saveConnection,
				showConnectionDialogOnError: true,
				showDashboard: purpose === 'dashboard',
				params: undefined,
				showFirewallRuleOnError: true,
			};
			return this.connect(connection, ownerUri, options).then(connectionResult => {
				if (connectionResult && connectionResult.connected) {
					return this.connectionStatusManager.getOriginalOwnerUri(ownerUri);
				} else {
					return Promise.reject(connectionResult.errorMessage);
				}
			});
		}
	}

	private async connectWithOptions(connection: IConnectionProfile, uri: string, options?: IConnectionCompletionOptions, callbacks?: IConnectionCallbacks): Promise<IConnectionResult> {
		connection.options['groupId'] = connection.groupId;
		connection.options['databaseDisplayName'] = connection.databaseName;

		if (!uri) {
			uri = Utils.generateUri(connection);
		}
		uri = this.connectionStatusManager.getOriginalOwnerUri(uri);
		if (!callbacks) {
			callbacks = {
				onConnectReject: () => { },
				onConnectStart: () => { },
				onConnectSuccess: () => { },
				onDisconnect: () => { },
				onConnectCanceled: () => { }
			};
		}
		if (!options) {
			options = {
				saveTheConnection: false,
				showDashboard: false,
				params: undefined,
				showConnectionDialogOnError: false,
				showFirewallRuleOnError: true
			};
		}
		if (callbacks.onConnectStart) {
			callbacks.onConnectStart();
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

				if (callbacks.onConnectSuccess) {
					callbacks.onConnectSuccess(options.params);
				}
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
				return this.handleConnectionError(connection, uri, options, callbacks, connectionResult).then(result => {
					return result;
				}, err => {
					if (callbacks.onConnectReject) {
						callbacks.onConnectReject(err);
					}
					return Promise.reject(err);
				});
			} else {
				if (callbacks.onConnectReject) {
					callbacks.onConnectReject(nls.localize('connectionNotAcceptedError', 'Connection Not Accepted'));
				}
				return connectionResult;
			}
		}, err => {
			if (callbacks.onConnectReject) {
				callbacks.onConnectReject(err);
			}
			return err;
		});
	}

	private handleConnectionError(connection: IConnectionProfile, uri: string, options: IConnectionCompletionOptions, callbacks: IConnectionCallbacks, connectionResult: IConnectionResult): Promise<IConnectionResult> {
		if (options.showFirewallRuleOnError && connectionResult.errorCode) {
			return this.handleFirewallRuleError(connection, connectionResult).then(success => {
				if (success) {
					options.showFirewallRuleOnError = false;
					return this.connectWithOptions(connection, uri, options, callbacks);
				} else {
					if (callbacks.onConnectReject) {
						callbacks.onConnectReject(nls.localize('connectionNotAcceptedError', 'Connection Not Accepted'));
					}
					return connectionResult;
				}
			});
		} else {
			if (callbacks.onConnectReject) {
				callbacks.onConnectReject(nls.localize('connectionNotAcceptedError', 'Connection Not Accepted'));
			}
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

	private doActionsAfterConnectionComplete(uri: string, options: IConnectionCompletionOptions): void {
		const connectionManagementInfo = this.connectionStatusManager.findConnection(uri);
		if (options.showDashboard) {
			this.showDashboardForConnectionManagementInfo(connectionManagementInfo.connectionProfile);
		}
		this._onConnect.fire(<IConnectionParams>{
			connectionUri: uri,
			connectionProfile: connectionManagementInfo.connectionProfile
		});
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

	public getConnectionGroups(providers?: string[]): ConnectionProfileGroup[] {
		return this.connectionStore.getConnectionProfileGroups(false, providers);
	}

	public getRecentConnections(providers?: string[]): ConnectionProfile[] {
		return this.connectionStore.getRecentlyUsedConnections(providers);
	}


	public clearRecentConnectionsList(): void {
		return this.connectionStore.clearRecentlyUsed();
	}

	public clearRecentConnection(connectionProfile: IConnectionProfile): void {
		this.connectionStore.removeRecentConnection(connectionProfile);
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

	public saveProfileGroup(profile: IConnectionProfileGroup): Promise<string> {
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.AddServerGroup);
		return this.connectionStore.saveProfileGroup(profile).then(groupId => {
			this._onAddConnectionProfile.fire(undefined);
			return groupId;
		});
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

	public hasRegisteredServers(): boolean {
		return this.doHasRegisteredServers(this.getConnectionGroups());
	}

	private doHasRegisteredServers(root: ConnectionProfileGroup[]): boolean {

		if (!root || root.length === 0) {
			return false;
		}

		for (const item of root) {
			if (!item) {
				return false;
			}

			if (item.connections && item.connections.length > 0) {
				return true;
			}

			if (this.doHasRegisteredServers(item.children)) {
				return true;
			}
		}

		return false;
	}

	public getConnectionUri(connectionProfile: IConnectionProfile): string {
		return this.connectionStatusManager.getOriginalOwnerUri(Utils.generateUri(connectionProfile));
	}

	/**
	 * Returns a formatted URI in case the database field is empty for the original
	 * URI, which happens when the connected database is master or the default database
	 */
	public getFormattedUri(uri: string, connectionProfile: IConnectionProfile): string {
		if (this.connectionStatusManager.isDefaultTypeUri(uri)) {
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

	private async fillInAzureTokenIfNeeded(connection: IConnectionProfile): Promise<boolean> {
		if (connection.authenticationType !== Constants.azureMFA || connection.options['azureAccountToken']) {
			return true;
		}
		const accounts = await this.accountManagementService.getAccountsForProvider('azurePublicCloud');
		if (accounts && accounts.length > 0) {
			let account = accounts.find(account => account.key.accountId === connection.userName);
			if (account) {
				if (account.isStale) {
					try {
						account = await this.accountManagementService.refreshAccount(account);
					} catch {
						// refreshAccount throws an error if the user cancels the dialog
						return false;
					}
				}
				const tokensByTenant = await this.accountManagementService.getSecurityToken(account, AzureResource.Sql);
				let token: string;
				const tenantId = connection.azureTenantId;
				if (tenantId && tokensByTenant[tenantId]) {
					token = tokensByTenant[tenantId].token;
				} else {
					const tokens = Object.values(tokensByTenant);
					if (tokens.length === 0) {
						return false;
					}
					token = Object.values(tokensByTenant)[0].token;
				}
				connection.options['azureAccountToken'] = token;
				connection.options['password'] = '';
				return true;
			}
		}
		return false;
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

	private saveToSettings(id: string, connection: IConnectionProfile): Promise<string> {
		return this.connectionStore.saveProfile(connection).then(savedProfile => {
			return this.connectionStatusManager.updateConnectionProfile(savedProfile, id);
		});
	}

	/**
	 * Add a connection to the active connections list.
	 */
	private tryAddActiveConnection(connectionManagementInfo: ConnectionManagementInfo, newConnection: IConnectionProfile, addToMru: boolean): void {
		if (newConnection && addToMru) {
			this.connectionStore.addRecentConnection(newConnection)
				.then(() => {
					connectionManagementInfo.connectHandler(true);
				}, err => {
					connectionManagementInfo.connectHandler(false, err);
				});
		} else {
			connectionManagementInfo.connectHandler(false);
		}
	}

	private addTelemetryForConnection(connection: ConnectionManagementInfo): void {
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.DatabaseConnected, {
			connectionType: connection.serverInfo ? (connection.serverInfo.isCloud ? 'Azure' : 'Standalone') : '',
			provider: connection.connectionProfile.providerName,
			serverVersion: connection.serverInfo ? connection.serverInfo.serverVersion : '',
			serverEdition: connection.serverInfo ? connection.serverInfo.serverEdition : '',

			extensionConnectionTime: connection.extensionTimer.elapsed() - connection.serviceTimer.elapsed(),
			serviceConnectionTime: connection.serviceTimer.elapsed()
		});
	}

	private addTelemetryForConnectionDisconnected(connection: IConnectionProfile): void {
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.DatabaseDisconnected, {
			provider: connection.providerName
		});
	}

	private onConnectionComplete(handle: number, info: azdata.ConnectionInfoSummary): void {
		const connection = this.connectionStatusManager.onConnectionComplete(info);

		if (info.connectionId) {
			if (info.connectionSummary && info.connectionSummary.databaseName) {
				this.connectionStatusManager.updateDatabaseName(info);
			}
			connection.serverInfo = info.serverInfo;
			connection.extensionTimer.stop();

			connection.connectHandler(true);
			this.addTelemetryForConnection(connection);

			if (this.connectionStatusManager.isDefaultTypeUri(info.ownerUri)) {
				this.connectionGlobalStatus.setStatusToConnected(info.connectionSummary);
			}
		} else {
			connection.connectHandler(false, info.errorMessage, info.errorNumber, info.messages);
		}
	}

	private onConnectionChangedNotification(handle: number, changedConnInfo: azdata.ChangedConnectionInfo): void {
		const profile: IConnectionProfile = this.connectionStatusManager.onConnectionChanged(changedConnInfo);
		this._notifyConnectionChanged(profile, changedConnInfo.connectionUri);
	}

	private _notifyConnectionChanged(profile: IConnectionProfile, connectionUri: string): void {
		if (profile) {
			this._onConnectionChanged.fire(<IConnectionParams>{
				connectionProfile: profile,
				connectionUri: connectionUri
			});
		}
	}

	public changeGroupIdForConnectionGroup(source: ConnectionProfileGroup, target: ConnectionProfileGroup): Promise<void> {
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.MoveServerConnection);
		return this.connectionStore.changeGroupIdForConnectionGroup(source, target);
	}

	public changeGroupIdForConnection(source: ConnectionProfile, targetGroupId: string): Promise<void> {
		const id = Utils.generateUri(source);
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.MoveServerGroup);
		return this.connectionStore.changeGroupIdForConnection(source, targetGroupId).then(result => {
			if (id && targetGroupId) {
				source.groupId = targetGroupId;
			}
		});
	}

	/**
	 * Returns true if the connection can be moved to another group
	 */
	public canChangeConnectionConfig(profile: ConnectionProfile, newGroupID: string): boolean {
		return this.connectionStore.canChangeConnectionConfig(profile, newGroupID);
	}

	public isRecent(connectionProfile: ConnectionProfile): boolean {
		let recentConnections = this.connectionStore.getRecentlyUsedConnections();
		recentConnections = recentConnections.filter(con => {
			return connectionProfile.id === con.id;
		});
		return (recentConnections.length >= 1);
	}
	// Disconnect a URI from its current connection
	// The default editor implementation does not perform UI updates
	// The default force implementation is set to false
	public disconnectEditor(owner: IConnectableInput, force: boolean = false): Promise<boolean> {
		// If the URI is connected, disconnect it and the editor
		if (this.isConnected(owner.uri)) {
			const connection = this.getConnectionProfile(owner.uri);
			owner.onDisconnect();
			return this.doDisconnect(owner.uri, connection);

			// If the URI is connecting, prompt the user to cancel connecting
		} else if (this.isConnecting(owner.uri)) {
			if (!force) {
				return this.shouldCancelConnect().then((result) => {
					// If the user wants to cancel, then disconnect
					if (result) {
						owner.onDisconnect();
						return this.cancelEditorConnection(owner);
					}
					// If the user does not want to cancel, then ignore
					return false;
				});
			} else {
				owner.onDisconnect();
				return this.cancelEditorConnection(owner);
			}
		}
		// If the URI is disconnected, ensure the UI state is consistent and resolve true
		owner.onDisconnect();
		return Promise.resolve(true);
	}

	/**
	 * Functions to handle the connecting life cycle
	 */

	// Connect an open URI to a connection profile
	private createNewConnection(uri: string, connection: IConnectionProfile): Promise<IConnectionResult> {
		return new Promise<IConnectionResult>(resolve => {
			const connectionInfo = this.connectionStatusManager.addConnection(connection, uri);
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
					this._onDisconnect.fire({ connectionUri: fileUri, connectionProfile: connection });
				}

				if (this.connectionStatusManager.isDefaultTypeUri(fileUri)) {
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
				this.connectionStatusManager.removeConnection(uri);
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

	public cancelEditorConnection(owner: IConnectableInput): Promise<boolean> {
		const fileUri: string = owner.uri;
		if (this.isConnecting(fileUri)) {
			return this.cancelConnectionForUri(fileUri);
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

	public editGroup(group: ConnectionProfileGroup): Promise<void> {
		return this.connectionStore.editGroup(group).then(() => {
			this.refreshEditorTitles();
			this._onAddConnectionProfile.fire(undefined);
		});
	}

	/**
	 * Deletes a connection from registered servers.
	 * Disconnects a connection before removing from settings.
	 */
	public deleteConnection(connection: ConnectionProfile): Promise<boolean> {
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.DeleteConnection, {}, connection);
		// Disconnect if connected
		const uri = Utils.generateUri(connection);
		if (this.isConnected(uri) || this.isConnecting(uri)) {
			return this.doDisconnect(uri, connection).then((result) => {
				if (result) {
					// Remove profile from configuration
					return this.connectionStore.deleteConnectionFromConfiguration(connection).then(() => {
						this._onDeleteConnectionProfile.fire();
						return true;
					});

				} else {
					// If connection fails to disconnect, resolve promise with false
					return false;
				}
			});
		} else {
			// Remove disconnected profile from settings
			return this.connectionStore.deleteConnectionFromConfiguration(connection).then(() => {
				this._onDeleteConnectionProfile.fire();
				return true;
			});
		}
	}

	/**
	 * Deletes a group with all its children groups and connections from registered servers.
	 * Disconnects a connection before removing from config. If disconnect fails, settings is not modified.
	 */
	public deleteConnectionGroup(group: ConnectionProfileGroup): Promise<boolean> {
		TelemetryUtils.addTelemetry(this.telemetryService, this.logService, TelemetryKeys.DeleteServerGroup);
		// Get all connections for this group
		const connections = ConnectionProfileGroup.getConnectionsInGroup(group);

		// Disconnect all these connections
		const disconnected = [];
		connections.forEach((con) => {
			const uri = Utils.generateUri(con);
			if (this.isConnected(uri)) {
				disconnected.push(this.doDisconnect(uri, con));
			}
		});

		// When all the disconnect promises resolve, remove profiles from config
		return Promise.all(disconnected).then(() => {
			// Remove profiles and groups from config
			return this.connectionStore.deleteGroupFromConfiguration(group).then(() => {
				this._onDeleteConnectionProfile.fire();
				return true;
			}).catch(() => {
				// If saving to config fails, reject promise with false
				return Promise.reject(false);
			});
		}).catch(() => {
			// If disconnecting all connected profiles fails, resolve promise with false
			return Promise.resolve(false);
		});
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

	public getTabColorForUri(uri: string): string {
		if (WorkbenchUtils.getSqlConfigValue<string>(this.configurationService, 'tabColorMode') === QueryConstants.tabColorModeOff) {
			return undefined;
		}
		const connectionProfile = this.getConnectionProfile(uri);
		if (!connectionProfile) {
			return undefined;
		}
		const matchingGroup = this.connectionStore.getGroupFromId(connectionProfile.groupId);
		if (!matchingGroup) {
			return undefined;
		}
		return matchingGroup.color;
	}

	private refreshEditorTitles(): void {
		if (this.editorGroupService instanceof EditorPart) {
			this.editorGroupService.refreshEditorTitles();
		}
	}

	public removeConnectionProfileCredentials(originalProfile: IConnectionProfile): IConnectionProfile {
		return this.connectionStore.getProfileWithoutPassword(originalProfile);
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
