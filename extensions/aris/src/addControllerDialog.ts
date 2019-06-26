/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vscode-nls';
import * as azdata from 'azdata';
import { IControllerError, IEndPointsResponse } from './controllerApi/wrapper';
import { ArisControllerApi } from './controllerApi/controllerApi';

const localize = nls.loadMessageBundle();

export class AddControllerDialog {

	private readonly DialogTitle: string = localize('aris.resource.signInDialog.title', 'New Aris Controller');
	private readonly SignInButtonText: string = localize('aris.resource.signInDialog.signIn', 'Sign In');
	private readonly CancelButtonText: string = localize('aris.resource.signInDialog.cancel', 'Cancel');

	private dialog: azdata.window.Dialog;
	private modelBuilder: azdata.ModelBuilder;

	private urlInputBox: azdata.InputBoxComponent;
	private usernameInputBox: azdata.InputBoxComponent;
	private passwordInputBox: azdata.InputBoxComponent;
	private rememberPwCheckBox: azdata.CheckBoxComponent;
	private errorTextContainer: azdata.FlexContainer;
	private callback: (e: IEndPointsResponse, rememberPassword: boolean) => any;
	private callbackCancel: () => any;
	private callbackError: (e: IControllerError) => any;

	private prefilledValues: {
		url?: string,
		username?: string,
		password?: string,
		rememberPassword?: boolean,
	} = {};

	public setPrefilledValues(prefilledValues: {
		url?: string,
		username?: string,
		password?: string,
		rememberPassword?: boolean,
	}){
		if (!prefilledValues || Object.keys(prefilledValues).length === 0) {
			return;
		}
		this.prefilledValues.url = prefilledValues.url;
		this.prefilledValues.username = prefilledValues.username;
		this.prefilledValues.password = prefilledValues.password;
		this.prefilledValues.rememberPassword = prefilledValues.rememberPassword;
	}

	constructor(prefilledValues?: {
		url?: string,
		username?: string,
		password?: string,
		rememberPassword?: boolean,
	}){
		this.setPrefilledValues(prefilledValues);
	}

	public showDialog(
		callback: (e: IEndPointsResponse, rememberPassword: boolean) => any,
		callbackCancel?: () => any,
		callbackError?: (e: IControllerError) => any,
	) {
		this.createDialog();
		this.toggleSignInButton();
		this.toggleErrorText();
		this.callback = callback;
		this.callbackCancel = callbackCancel;
		this.callbackError = callbackError;
		azdata.window.openDialog(this.dialog);
	}

	private createDialog(): void {
		this.dialog = azdata.window.createModelViewDialog(this.DialogTitle);
		this.dialog.registerContent(async view => {
			this.modelBuilder = view.modelBuilder;

			let tc = new TitledContainer(this.modelBuilder);
			tc.title = localize('signInLabel', 'Sign In to Controller');
			tc.setTitleMargin(6, 0, 11, 0);
			tc.setPadding(15, 30, 0, 30);
			tc.contentTopLine = true;

			let allContainer: azdata.FlexContainer = this.modelBuilder.flexContainer()
				.withLayout(<azdata.FlexLayout>{
					flexFlow: 'column',
					alignItems: 'stretch',
					width: '100%'
				})
				.component();

			let urlInputContainer: azdata.FlexContainer = this.modelBuilder.flexContainer()
				.withLayout(<azdata.FlexLayout>{
					flexFlow: 'row',
					alignItems: 'center',
					width: '100%'
				})
				.component();

			let urlInputText = this.modelBuilder.text()
                .withProperties<azdata.TextComponentProperties>({ value: 'URL' }).component();

			this.urlInputBox = this.modelBuilder.inputBox()
				.withProperties<azdata.InputBoxProperties>({ placeHolder: 'url', value: this.prefilledValues.url }).component();
			this.urlInputBox.onTextChanged(e => this.toggleSignInButton());

			urlInputContainer.addItem(urlInputText, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'width': '80px'
				}
			});

			urlInputContainer.addItem(this.urlInputBox, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'margin': '-2px 0px 0px 0px',
					'width': '100%'
				}
			});

			allContainer.addItem(urlInputContainer, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'width': '100%'
				}
			});

			let usernameInputContainer: azdata.FlexContainer = this.modelBuilder.flexContainer()
				.withLayout(<azdata.FlexLayout>{
					flexFlow: 'row',
					alignItems: 'center',
					width: '100%'
				})
				.component();

			let usernameInputText = this.modelBuilder.text()
                .withProperties<azdata.TextComponentProperties>({ value: 'Username' }).component();

			this.usernameInputBox = this.modelBuilder.inputBox()
				.withProperties<azdata.InputBoxProperties>({ placeHolder: 'username', value: this.prefilledValues.username }).component();
			this.usernameInputBox.onTextChanged(e => this.toggleSignInButton());

			usernameInputContainer.addItem(usernameInputText, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'width': '80px'
				}
			});

			usernameInputContainer.addItem(this.usernameInputBox, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'margin': '-2px 0px 0px 0px',
					'width': '100%',
				}
			});

			allContainer.addItem(usernameInputContainer, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'margin': '-2px 0px 0px 0px',
					'width': '100%'
				}
			});

			let passwordInputContainer: azdata.FlexContainer = this.modelBuilder.flexContainer()
				.withLayout(<azdata.FlexLayout>{
					flexFlow: 'row',
					alignItems: 'center',
					width: '100%'
				})
				.component();

			let passwordInputText = this.modelBuilder.text()
                .withProperties<azdata.TextComponentProperties>({ value: 'Password' }).component();

			this.passwordInputBox = this.modelBuilder.inputBox()
				.withProperties<azdata.InputBoxProperties>({
					placeHolder: 'password',
					inputType: 'password',
					value: this.prefilledValues.password
				})
				.component();
			this.passwordInputBox.onTextChanged(e => this.toggleSignInButton());

			passwordInputContainer.addItem(passwordInputText, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'width': '80px'
				}
			});

			passwordInputContainer.addItem(this.passwordInputBox, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'margin': '-2px 0px 0px 0px',
					'width': '100%',
				}
			});

			allContainer.addItem(passwordInputContainer, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'margin': '-2px 0px 0px 0px',
					'width': '100%'
				}
			});

			this.rememberPwCheckBox = this.modelBuilder.checkBox()
				.withProperties<azdata.CheckBoxProperties>({
					label: 'Remember Password',
					checked: this.prefilledValues.rememberPassword
				}).component();

			allContainer.addItem(this.rememberPwCheckBox, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'justify-content': 'flex-start',
					'align-items': 'center',
					'margin': '0px 0px 0px 65px',
				}
			});

			this.errorTextContainer = this.modelBuilder.flexContainer()
				.withLayout(<azdata.FlexLayout>{
					flexFlow: 'row',
					alignItems: 'center',
					width: '100%'
				})
				.component();

			allContainer.addItem(this.errorTextContainer, {
				flex: '1, 1, 0%',
				CSSStyles: {
					width: '100%'
				}
			});

			tc.addContentContainer(allContainer);

			await view.initializeModel(tc.flexContainer);
		});

		// this.dialog.okButton.onClick(async () => await this.execute());
		this.dialog.cancelButton.onClick(async () => await this.cancel());
		this.dialog.okButton.label = this.SignInButtonText;
		this.dialog.cancelButton.label = this.CancelButtonText;
		this.dialog.registerCloseValidator(async () => await this.getEndpoints());
	}

	private toggleErrorText(errorMessage?: string): void {
		if (!this.errorTextContainer){
			return;
		}

		this.errorTextContainer.clearItems();

		if (errorMessage) {
			let errorText = this.modelBuilder.text()
				.withProperties<azdata.TextComponentProperties>({
					value: errorMessage,
					CSSStyles: {
						'color': 'rgb(240, 62, 62)'
					}
				})
				.component();

			this.errorTextContainer.addItem(errorText, {
				flex: '1, 1, 0%',
				CSSStyles: {
					'border': '3px solid rgba(225, 17, 17, 0.5)',
					'background-color': 'rgba(245, 131, 131, 0.3)',
					'padding': '0px 16px 0px 16px',
					'margin-top': '20px',
					'word-wrap': 'break-word',
					'width': '100%'
				}
			});
		}
	}

	private toggleSignInButton(): void {
		if (!this.dialog || !this.dialog.okButton) {
			return;
		}
		if (this.urlInputBox && this.urlInputBox.value
			&& this.usernameInputBox && this.usernameInputBox.value
			&& this.passwordInputBox && this.passwordInputBox.value
		) {
			this.dialog.okButton.enabled = true;
		} else {
			this.dialog.okButton.enabled = false;
		}
	}

	private async getEndpoints(): Promise<boolean> {
		this.toggleErrorText();

		let url = this.urlInputBox && this.urlInputBox.value;
		let username = this.usernameInputBox && this.usernameInputBox.value;
		let password = this.passwordInputBox && this.passwordInputBox.value;

		return await ArisControllerApi.getEndPoints(url, username, password, true).then(async response => {
			if (this.callback) {
				await this.callback(response as IEndPointsResponse, !!this.rememberPwCheckBox.checked);
			}
			return true;
		}, async error => {
			let e = error as IControllerError;
			this.toggleErrorText(`${e.code} ${e.message}`);
			if (this.callbackError) {
				await this.callbackError(e);
			}
			return false;
		});
	}

	private async cancel() {
		if (this.callbackCancel) {
			await this.callbackCancel();
		}
	}
}

class TitledContainer {
    private _modelBuilder: azdata.ModelBuilder;

    private _titleTopMargin: number;
    private _titleBottomMargin: number;
    public titleFontSize: number;
    public title: string;
    public titleRightMargin: number;
    public titleLeftMargin: number;

    private _contentContainers: azdata.FlexContainer[];
    private _fullContainer: azdata.FlexContainer;

    public topPaddingPx: number;
    public rightPaddingPx: number;
    public bottomPaddingPx: number;
	public leftPaddingPx: number;

	public contentTopLine: boolean;
	public contentBottomLine: boolean;

    private static readonly _pBeforePx: number = 16;
    private static readonly _pAfterPx: number = 16;

    constructor(modelBuilder: azdata.ModelBuilder) {
        this._modelBuilder = modelBuilder;
        this._contentContainers = [];

        this.titleFontSize = 14;
        this.setTitleMargin(0, 0, 5, 0);
		this.setPadding(10, 30, 0, 30);
		this.contentTopLine = false;
		this.contentBottomLine = false;
    }

    public set titleTopMargin(px: number) {
        this._titleTopMargin = px - TitledContainer._pBeforePx;
    }

    public set titleBottomMargin(px: number) {
        this._titleBottomMargin = px - TitledContainer._pAfterPx;
    }

    public setTitleMargin(topPx: number, rightPx: number, bottomPx: number, leftPx: number) {
        this.titleTopMargin = topPx;
        this.titleRightMargin = rightPx;
        this.titleBottomMargin = bottomPx;
        this.titleLeftMargin = leftPx;
    }

    public setPadding(topPx: number, rightPx: number, bottomPx: number, leftPx: number) {
        this.topPaddingPx = topPx;
        this.rightPaddingPx = rightPx;
        this.bottomPaddingPx = bottomPx;
        this.leftPaddingPx = leftPx;
    }

    public addContentContainer(content: azdata.FlexContainer) {
        this._contentContainers.push(content);
    }

    public get flexContainer(): azdata.FlexContainer {
        let titleContainer: azdata.FlexContainer = undefined;
        if (this.title) {
            let titleTextComponent = this._modelBuilder.text()
                .withProperties<azdata.TextComponentProperties>({ value: this.title })
                .component();
            titleContainer = this._modelBuilder.flexContainer()
                .withLayout({
                    flexFlow: 'column',
                    alignItems: 'start',
                    width: '100%'
                })
                .component();
            titleContainer.addItem(titleTextComponent, {
                flex: '1, 1, 0%',
                CSSStyles: {
                    'font-size': `${this.titleFontSize}px`,
                    'width': '100%',
                    'margin': `${this._titleTopMargin}px ${this.titleRightMargin}px ${this._titleBottomMargin}px ${this.titleLeftMargin}px`
                }
            });
        }

        let bindingContainer = this._modelBuilder.flexContainer()
            .withLayout({
                flexFlow: 'column',
                alignItems: 'stretch',
                width: '100%'
            })
            .component();
        if (titleContainer) {
            bindingContainer.addItem(titleContainer, {
                flex: '1, 1, 0%',
                CSSStyles: {
					'width': '100%'
                }
            });
		}
		if (this._contentContainers) {
			for (let i = 0; i < this._contentContainers.length; ++i) {
				let cssStyles = {
					'width': '100%'
				};
				if (this.contentTopLine && i === 0) {
					cssStyles = Object.assign(cssStyles, {
						'padding-top': '10px',
						'border-top': '1px solid rgb(185, 185, 185)'
					});
				}
				if (this.contentBottomLine && i === this._contentContainers.length - 1) {
					cssStyles = Object.assign(cssStyles, {
						'padding-bottom': '15px',
						'border-bottom': '1px solid rgb(185, 185, 185)'
					});
				}
				bindingContainer.addItem(this._contentContainers[i], {
					flex: '1, 1, 0%',
					CSSStyles: cssStyles
				});
			}
		}

        if (!this._fullContainer) {
            this._fullContainer = this._modelBuilder.flexContainer()
                .withLayout({
                    flexFlow: 'column',
                    alignItems: 'stretch',
                    width: '100%'
                })
                .component();
        } else {
            this._fullContainer.clearItems();
        }

        this._fullContainer.addItem(bindingContainer, {
            flex: '1, 1, 0%',
            CSSStyles: {
                'padding': `${this.topPaddingPx}px ${this.rightPaddingPx}px ${this.bottomPaddingPx}px ${this.leftPaddingPx}px`
            }
        });

        return this._fullContainer;
    }
}
