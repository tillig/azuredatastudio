/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { getGalleryExtensionId, areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import product from 'vs/platform/product/node/product';

export function isUIExtension(manifest: IExtensionManifest, configurationService: IConfigurationService): boolean {
	const uiContributions = ExtensionsRegistry.getExtensionPoints().filter(e => e.defaultExtensionKind !== 'workspace').map(e => e.name);
	const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
	const extensionKind = getExtensionKind(manifest, configurationService);
	switch (extensionKind) {
		case 'ui': return true;
		case 'workspace': return false;
		default: {
			// Tagged as UI extension in product
			if (isNonEmptyArray(product.uiExtensions) && product.uiExtensions.some(id => areSameExtensions({ id }, { id: extensionId }))) {
				return true;
			}
			// Not an UI extension if it has main
			if (manifest.main) {
				return false;
			}
			// Not an UI extension if it has dependencies or an extension pack
			if (isNonEmptyArray(manifest.extensionDependencies) || isNonEmptyArray(manifest.extensionPack)) {
				return false;
			}
			if (manifest.contributes) {
				// Not an UI extension if it has no ui contributions
				if (!uiContributions.length || Object.keys(manifest.contributes).some(contribution => uiContributions.indexOf(contribution) === -1)) {
					return false;
				}
			}
			return true;
		}
	}
}

function getExtensionKind(manifest: IExtensionManifest, configurationService: IConfigurationService): string | undefined {
	const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
	const configuredExtensionKinds = configurationService.getValue<{ [key: string]: string }>('remote.extensionKind') || {};
	for (const id of Object.keys(configuredExtensionKinds)) {
		if (areSameExtensions({ id: extensionId }, { id })) {
			return configuredExtensionKinds[id];
		}
	}
	return manifest.extensionKind;
}
