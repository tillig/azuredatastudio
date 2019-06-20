import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
// import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';

// import { DownloadSandDance } from 'sql/workbench/parts/visualizer/browser/downloadSandDance.ts';


export class DownloadSandDance {

	constructor(
		@INotificationService notificationService: INotificationService,
	) {

		//  if sanddance is installed {
		// return;
		// }

		const downloadSandDanceNotice = localize('downloadSandDance.notice', "The SandDance extension is required to use this feature. Would you like to download the SandDance extension?");
		notificationService.prompt(
			Severity.Info,
			downloadSandDanceNotice,
			[{
				label: localize('downloadSandDanceNotice.yes', "Yes"),
				run: () => {
					// vscode.extensions.getExtension(name/id)

					// configurationService.updateValue('workbench.enablePreviewFeatures', true);
					// storageService.store(DownloadSandDance.ENABLE_PREVIEW_FEATURES_SHOWN, true, StorageScope.GLOBAL);
				}
			}, {
				label: localize('downloadSandDanceNotice.no', "No"),
				run: () => {
					// Error Message : "You cannot use this feature without downloading the SandDance extension."

					// configuration1Service.updateValue('workbench.enablePreviewFeatures', false);
				}
			}, {
				label: localize('downloadSandDanceNotice.never', "No, don't show again"),
				run: () => {
					// configurationService.updateValue('workbench.enablePreviewFeatures', false);
					// storageService.store(DownloadSandDance.ENABLE_PREVIEW_FEATURES_SHOWN, true, StorageScope.GLOBAL);
				},
				isSecondary: true
			}]
		);
	}
}