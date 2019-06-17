import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
// import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';


export class Visualizer {

	constructor(
		@INotificationService notificationService: INotificationService,
	) {

		//  if sanddance is not installed { return; }


		// const downloadSandDanceNotice = localize('downloadSandDance.notice', "The SandDance extension is required to use this feature. Would you like to download the SandDance extension?");
		// notificationService.prompt(
		// 	Severity.Info,
		// 	downloadSandDanceNotice,
		// 	[{
		// 		label: localize('enablePreviewFeatures.yes', "Yes"),
		// 		run: () => {
		// 			configurationService.updateValue('workbench.enablePreviewFeatures', true);
		// 			storageService.store(EnablePreviewFeatures.ENABLE_PREVIEW_FEATURES_SHOWN, true, StorageScope.GLOBAL);
		// 		}
		// 	}, {
		// 		label: localize('enablePreviewFeatures.no', "No"),
		// 		run: () => {
		// 			configurationService.updateValue('workbench.enablePreviewFeatures', false);
		// 		}
		// 	}, {
		// 		label: localize('enablePreviewFeatures.never', "No, don't show again"),
		// 		run: () => {
		// 			configurationService.updateValue('workbench.enablePreviewFeatures', false);
		// 			storageService.store(EnablePreviewFeatures.ENABLE_PREVIEW_FEATURES_SHOWN, true, StorageScope.GLOBAL);
		// 		},
		// 		isSecondary: true
		// 	}]
		// );

	}

}