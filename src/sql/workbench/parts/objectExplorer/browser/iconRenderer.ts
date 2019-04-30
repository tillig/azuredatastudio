/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { generateUuid } from 'vs/base/common/uuid';

export function renderServerIcon(element: HTMLElement, serverInfo: ServerInfo, isConnected: boolean,
	iconSizePx?: number, topMarginPx?: number, leftMarginPx?: number
): void {
	let serverIcon: IconInfo = ServerIcon.getServerIcon(serverInfo);
	renderServerIconByPath(element, serverIcon, isConnected, iconSizePx, topMarginPx, leftMarginPx);
	if (!isConnected) {
		NewBadge.removeExistingBadge(element);
	} else if (serverInfo && serverInfo.serverMajorVersion && serverInfo.serverMajorVersion >= 15) {
		let badge: NewBadge = new NewBadge(iconSizePx, topMarginPx, leftMarginPx);
		badge.renderBadge(element);
	}
}

export function renderServerIconByPath(element: HTMLElement, iconData: IconPath | IconInfo, isConnected: boolean,
	iconSizePx?: number, topMarginPx?: number, leftMarginPx?: number
): void {
	if (!element) { return; }

	let iconPath: IconPath = undefined;
	if (iconData['path']) {
		let iconInfo = iconData as IconInfo;
		iconPath = iconInfo.path;
		iconSizePx = iconSizePx || Math.min(iconInfo.widthPx, iconInfo.heightPx);
	} else {
		iconPath = iconData as IconPath;
	}

	renderIcon(element, iconPath);
	let badge: ServerStatusBadge = new ServerStatusBadge(iconSizePx, topMarginPx, leftMarginPx);
	badge.renderBadge(element, isConnected);
}

export function renderIcon(element: HTMLElement, iconPath: string | IconPath): void {
	if (!element || !iconPath) { return; }

	let lightPath: string = undefined;
	let darkPath: string = undefined;
	if (typeof iconPath === 'string') {
		lightPath = iconPath;
		darkPath = iconPath;
	} else {
		lightPath = iconPath.light;
		darkPath = iconPath.dark;
	}

	if (element.id === undefined || element.id === '') {
		element.id = `id_${generateUuid()}`;
	}
	let elementId: string = element.id;
	let styleId: string = `icon_style_${elementId}`;

	let current = element.previousElementSibling;
	while (current) {
		let next = current.previousElementSibling;
		if (current.id === styleId) {
			current.remove();
			break;
		}
		current = next;
	}

	element.insertAdjacentHTML('beforebegin',
		`<style type="text/css" id="${styleId}">
			.monaco-shell #${elementId} {
				background: url('${lightPath}') center center no-repeat;
			}
			.vs-dark #${elementId},
			.hc-black #${elementId} {
				background: url('${darkPath}') center center no-repeat;
			}
		</style>`.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').replace(/  +/g, ' ')
	);
}

export class ServerIcon {
	private static iconDir: string = `${__dirname}/../../../../media/icons`;

	public static readonly default: IconInfo = {
		path: {
			light: `${ServerIcon.iconDir}/default_server.svg`,
			dark: `${ServerIcon.iconDir}/default_server_inverse.svg`,
		},
		widthPx: 16,
		heightPx: 16
	};

	public static readonly bigDataCluster: IconInfo = {
		path: {
			light: `${ServerIcon.iconDir}/sql_bigdata_cluster.svg`,
			dark: `${ServerIcon.iconDir}/sql_bigdata_cluster_inverse.svg`,
		},
		widthPx: 16,
		heightPx: 16
	};

	public static readonly cloud: IconInfo = {
		path: {
			light: `${ServerIcon.iconDir}/azureDB.svg`,
			dark: `${ServerIcon.iconDir}/azureDB_inverse.svg`,
		},
		widthPx: 16,
		heightPx: 16
	};

	public static readonly postGreSql: IconInfo = {
		path: {
			light: `${ServerIcon.iconDir}/unpin.svg`,
			dark: `${ServerIcon.iconDir}/unpin_inverse.svg`,
		},
		widthPx: 16,
		heightPx: 16
	};

	public static getServerIcon(serverInfo: ServerInfo): IconInfo {
		if (serverInfo) {
			if (serverInfo.options && serverInfo.options.isBigDataCluster) {
				return this.bigDataCluster;
			} else if (serverInfo.isCloud) {
				return this.cloud;
			}
		}
		return this.default;
	}
}

interface ServerInfo {
	isCloud?: boolean;
	options?: {
		isBigDataCluster?: boolean;
	};
	serverMajorVersion?: number;
}

interface IconInfo {
	path: IconPath;
	widthPx: number;
	heightPx: number;
}

interface IconPath {
	light: string;
	dark: string;
}

interface IconBadge {
	badgeType: string;
}

abstract class BaseBadge implements IconBadge {
	protected static readonly defaultIconSizePx: number = 16;
	protected static readonly defaultTopMarginPx: number = 5;
	protected static readonly defaultLeftMarginPx: number = 5;

	protected iconSizePx: number = BaseBadge.defaultIconSizePx;
	protected topMarginPx: number = BaseBadge.defaultTopMarginPx;
	protected leftMarginPx: number = BaseBadge.defaultLeftMarginPx;

	public readonly badgeType: string = 'BaseBadge';

	constructor(iconSizePx?: number, topMarginPx?: number, leftMarginPx?: number) {
		this.setIconSize(iconSizePx);
		this.setMargin(topMarginPx, leftMarginPx);
	}

	public setIconSize(iconSizePx: number): BaseBadge {
		this.iconSizePx = iconSizePx || this.iconSizePx;
		return this;
	}

	public setMargin(topMarginPx: number, leftMarginPx: number): BaseBadge {
		this.topMarginPx = topMarginPx || this.topMarginPx;
		this.leftMarginPx = leftMarginPx || this.leftMarginPx;
		return this;
	}

	protected static removeExistingBadgeByPrefix(element: HTMLElement, styleIdPrefix: string): void {
		if (element.hasChildNodes) {
			let children: HTMLCollection = element.children;

			let badgeIdToDelete: string = undefined;
			let current = children[0];
			while (current) {
				let next = current.nextElementSibling;
				if (current.id) {
					if (current.id.startsWith(styleIdPrefix)) {
						badgeIdToDelete = current.id.replace(styleIdPrefix, '');
						current.remove();
						break;
					}
				}
				current = next;
			}

			if (badgeIdToDelete) {
				current = children[0];
				while (current) {
					let next = current.nextElementSibling;
					if (current.id) {
						if (current.id === badgeIdToDelete) {
							current.remove();
							break;
						}
					}
					current = next;
				}
			}
		}
	}
}

export class ServerStatusBadge extends BaseBadge {

	private static readonly defaultColorConnected: string = 'rgba(59, 180, 74, 100%)';
	private static readonly defaultColorDisconnected: string = 'rgba(208, 46, 0, 100%)';
	private static readonly defaultColorBackground: string = 'rgba(255, 255, 255, 80%)';
	private colorConnected: string = ServerStatusBadge.defaultColorConnected;
	private colorDisconnected: string = ServerStatusBadge.defaultColorDisconnected;
	private colorBackground: string = ServerStatusBadge.defaultColorBackground;
	public readonly badgeType: string = 'SeverStatusBadge';

	constructor(iconSizePx?: number, topMarginPx?: number, leftMarginPx?: number,
		colorConnected?: string, colorDisconnected?: string, colorBackground?: string
	) {
		super(iconSizePx, topMarginPx, leftMarginPx);
		this.setColorConnected(colorConnected);
		this.setColorDisconnected(colorDisconnected);
		this.setColorBackground(colorBackground);
	}

	public setColorConnected(color: string): ServerStatusBadge {
		this.colorConnected = color || this.colorConnected;
		return this;
	}

	public setColorDisconnected(color: string): ServerStatusBadge {
		this.colorDisconnected = color || this.colorDisconnected;
		return this;
	}

	public setColorBackground(color: string): ServerStatusBadge {
		this.colorBackground = color || this.colorBackground;
		return this;
	}

	public renderBadge(element: HTMLElement, isConnected: boolean): void {
		let circleColor: string = isConnected ? this.colorConnected : this.colorDisconnected;
		let backgroundColor: string = isConnected ? this.colorConnected : this.colorBackground;
		ServerStatusBadge.renderBadgeInternal(element, circleColor, backgroundColor,
			this.iconSizePx, this.topMarginPx, this.leftMarginPx);
	}

	public static renderBadgeInternal(element: HTMLElement, circleColor: string, backgroundColor?: string,
		iconSizePx?: number, topMarginPx?: number, leftMarginPx?: number
	) {
		backgroundColor = backgroundColor || ServerStatusBadge.defaultColorBackground;
		iconSizePx = iconSizePx || ServerStatusBadge.defaultIconSizePx;
		topMarginPx = topMarginPx || ServerStatusBadge.defaultTopMarginPx;
		leftMarginPx = leftMarginPx || ServerStatusBadge.defaultLeftMarginPx;

		let height: string = `${iconSizePx / 16 * 0.25}rem`;
		let width: string = height;
		let verticalLocation: string = `${(iconSizePx / 16 * 9) + topMarginPx}px`;
		let horizontalLocation: string = `${(iconSizePx / 16 * 14) + leftMarginPx}px`;
		let borderWidth: string = `${iconSizePx / 16 * 0.12}rem`;

		let styleIdPrefix: string = 'ServerStatusBadgeStyle_';
		let badgeId: string = `id_${generateUuid()}`;
		let styleId: string = `${styleIdPrefix}${badgeId}`;
		super.removeExistingBadgeByPrefix(element, styleIdPrefix);

		element.innerHTML = (element.innerHTML || '') +
			`<style type="text/css" id="${styleId}">
				#${badgeId}:after {
					position: absolute;
					height: ${height};
					width: ${width};
					top: ${verticalLocation};
					left: ${horizontalLocation};
					border: ${borderWidth} solid ${circleColor};
					border-radius: 100%;
					background: ${backgroundColor};
					content:"";
					font-size: 100%;
					line-height: 100%;
					color:white;
					text-align:center;
					vertical-align:middle;
				}
			</style>
			<div style="width: 0px; height: 0px;" id="${badgeId}">
			</div>`.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').replace(/  +/g, ' ');
	}

	public static removeExistingBadge(element: HTMLElement) {
		super.removeExistingBadgeByPrefix(element, 'ServerStatusBadgeStyle_');
	}
}

export class NewBadge extends BaseBadge {

	private static readonly defaultShapeColor: string = 'green';
	private static readonly defaultFontColor: string = 'white';
	private shapeColor: string = NewBadge.defaultShapeColor;
	private fontColor: string = NewBadge.defaultFontColor;
	public readonly badgeType: string = 'NewBadge';

	constructor(iconSizePx?: number, topMarginPx?: number, leftMarginPx?: number,
		shapeColor?: string, fontColor?: string
	) {
		super(iconSizePx, topMarginPx, leftMarginPx);
		this.setShapeColor(shapeColor);
		this.setFontColor(fontColor);
	}

	public setShapeColor(color: string): NewBadge {
		this.shapeColor = color || this.shapeColor;
		return this;
	}

	public setFontColor(color: string): NewBadge {
		this.fontColor = color || this.fontColor;
		return this;
	}

	public renderBadge(element: HTMLElement): void {
		NewBadge.renderBadgeInternal(element, this.shapeColor, this.fontColor,
			this.iconSizePx, this.topMarginPx, this.leftMarginPx);
	}

	public static renderBadgeInternal(element: HTMLElement, shapeColor?: string, fontColor?: string,
		iconSizePx?: number, topMarginPx?: number, leftMarginPx?: number
	) {
		shapeColor = shapeColor || NewBadge.defaultShapeColor;
		fontColor = fontColor || NewBadge.defaultFontColor;
		iconSizePx = iconSizePx || NewBadge.defaultIconSizePx;
		topMarginPx = topMarginPx || NewBadge.defaultTopMarginPx;
		leftMarginPx = leftMarginPx || NewBadge.defaultLeftMarginPx;

		let height: string = `${iconSizePx / 16 * 0.4}rem`;
		let width: string = height;
		let lineHeight: string = height;
		let verticalLocation: string = `${(iconSizePx / 16 * -2) + topMarginPx}px`;
		let horizontalLocation: string = `${leftMarginPx}px`;
		let borderWidth: string = `${iconSizePx / 16}px`;
		let fontSize: string = `${iconSizePx / 16 * 0.3}rem`;

		let styleIdPrefix: string = 'NewBadgeStyle_';
		let badgeId: string = `id_${generateUuid()}`;
		let styleId: string = `${styleIdPrefix}${badgeId}`;
		super.removeExistingBadgeByPrefix(element, styleIdPrefix);

		element.innerHTML = (element.innerHTML || '') +
			`<style type="text/css" id="${styleId}">
				#${badgeId}:after {
					position: absolute;
					height: ${height};
					width: ${width};
					top: ${verticalLocation};
					left: ${horizontalLocation};
					border: ${borderWidth} solid ${shapeColor};
					border-radius: 15%;
					background: ${shapeColor};
					content:"N";
					font-size: ${fontSize};
					font-weight: bold;
					line-height: ${lineHeight};
					color: ${fontColor};
					text-align:center;
					vertical-align:middle;
				}
			</style>
			<div style="width: 0px; height: 0px;" id="${badgeId}">
			</div>`.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').replace(/  +/g, ' ');
	}

	public static removeExistingBadge(element: HTMLElement) {
		super.removeExistingBadgeByPrefix(element, 'NewBadgeStyle_');
	}
}
