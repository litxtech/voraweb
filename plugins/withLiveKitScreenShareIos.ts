import fs from 'fs';
import path from 'path';
import plist from '@expo/plist';
import {
  type ConfigPlugin,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} from 'expo/config-plugins';

const EXTENSION_NAME = 'BroadcastExtension';
const EXTENSION_BUNDLE_SUFFIX = 'broadcast';
const DEFAULT_DEPLOYMENT_TARGET = '15.1';
const JITSI_APP_GROUP_PLACEHOLDER = 'group.com.jitsi.example-screensharing.appgroup';

const SWIFT_FILES = [
  'SampleHandler.swift',
  'SampleUploader.swift',
  'SocketConnection.swift',
  'DarwinNotificationCenter.swift',
  'Atomic.swift',
] as const;

function appGroupId(bundleIdentifier: string): string {
  return `group.${bundleIdentifier}`;
}

function extensionBundleId(bundleIdentifier: string): string {
  return `${bundleIdentifier}.${EXTENSION_BUNDLE_SUFFIX}`;
}

function templatesDir(projectRoot: string): string {
  return path.join(projectRoot, 'plugins', 'livekit-broadcast');
}

/** LiveKit / WebRTC ReplayKit Broadcast Upload Extension (CNG / EAS prebuild). */
const withLiveKitScreenShareIos: ConfigPlugin = (config) => {
  config = withInfoPlist(config, (mod) => {
    const bundleId = mod.ios?.bundleIdentifier ?? '';
    mod.modResults.RTCScreenSharingExtension = extensionBundleId(bundleId);
    mod.modResults.RTCAppGroupIdentifier = appGroupId(bundleId);
    return mod;
  });

  config = withEntitlementsPlist(config, (mod) => {
    const bundleId = mod.ios?.bundleIdentifier ?? '';
    const group = appGroupId(bundleId);
    const existing = (mod.modResults['com.apple.security.application-groups'] as string[] | undefined) ?? [];
    if (!existing.includes(group)) {
      mod.modResults['com.apple.security.application-groups'] = [...existing, group];
    }
    return mod;
  });

  config = withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const bundleId = mod.ios?.bundleIdentifier ?? '';
    const extBundleId = extensionBundleId(bundleId);

    if (xcodeProject.pbxTargetByName(EXTENSION_NAME)) {
      return mod;
    }

    const target = xcodeProject.addTarget(EXTENSION_NAME, 'app_extension', EXTENSION_NAME, extBundleId);

    const group = xcodeProject.addPbxGroup([...SWIFT_FILES], EXTENSION_NAME, EXTENSION_NAME, '"<group>"');
    const mainGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    const mainGroup = xcodeProject.getPBXGroupByKey(mainGroupId);
    if (mainGroup?.children && group?.uuid) {
      const alreadyLinked = mainGroup.children.some(
        (child: { value?: string; comment?: string }) =>
          child.value === group.uuid || child.comment === EXTENSION_NAME,
      );
      if (!alreadyLinked) {
        mainGroup.children.push({ value: group.uuid, comment: EXTENSION_NAME });
      }
    }

    xcodeProject.addBuildPhase(
      SWIFT_FILES.map((file) => `${EXTENSION_NAME}/${file}`),
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    );

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    const nativeTarget = xcodeProject.pbxNativeTargetSection()[target.uuid];
    const configListId = nativeTarget?.buildConfigurationList;
    const configList = configListId ? xcodeProject.pbxXCConfigurationList()[configListId] : undefined;

    if (configList?.buildConfigurations) {
      for (const buildConfig of configList.buildConfigurations) {
        const entry = configurations[buildConfig.value];
        if (!entry?.buildSettings) continue;
        entry.buildSettings.SWIFT_VERSION = '5.0';
        entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = DEFAULT_DEPLOYMENT_TARGET;
        entry.buildSettings.TARGETED_DEVICE_FAMILY = '"1"';
        entry.buildSettings.CODE_SIGN_ENTITLEMENTS = `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
        entry.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${extBundleId}"`;
        entry.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
        entry.buildSettings.INFOPLIST_FILE = `${EXTENSION_NAME}/Info.plist`;
        entry.buildSettings.CURRENT_PROJECT_VERSION = '1';
        entry.buildSettings.MARKETING_VERSION = '1.0';
        if (mod.ios?.appleTeamId) {
          entry.buildSettings.DEVELOPMENT_TEAM = mod.ios.appleTeamId;
        }
      }
    }

    return mod;
  });

  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      const bundleId = mod.ios?.bundleIdentifier ?? '';
      const group = appGroupId(bundleId);
      const extensionPath = path.join(mod.modRequest.platformProjectRoot, EXTENSION_NAME);
      const sourceDir = templatesDir(mod.modRequest.projectRoot);

      fs.mkdirSync(extensionPath, { recursive: true });

      const extensionInfoPlist = {
        CFBundleDevelopmentRegion: '$(DEVELOPMENT_LANGUAGE)',
        CFBundleDisplayName: 'Vora Ekran Paylaşımı',
        CFBundleExecutable: '$(EXECUTABLE_NAME)',
        CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
        CFBundleInfoDictionaryVersion: '6.0',
        CFBundleName: '$(PRODUCT_NAME)',
        CFBundlePackageType: '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
        CFBundleShortVersionString: '$(MARKETING_VERSION)',
        CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
        NSExtension: {
          NSExtensionPointIdentifier: 'com.apple.broadcast-services-upload',
          NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).SampleHandler',
          RPBroadcastProcessMode: 'RPBroadcastProcessModeSampleBuffer',
        },
      };
      fs.writeFileSync(path.join(extensionPath, 'Info.plist'), plist.build(extensionInfoPlist));

      for (const file of SWIFT_FILES) {
        const src = path.join(sourceDir, file);
        if (!fs.existsSync(src)) {
          throw new Error(`[withLiveKitScreenShareIos] Eksik şablon: ${src}`);
        }
        let content = fs.readFileSync(src, 'utf8');
        if (file === 'SampleHandler.swift') {
          content = content.split(JITSI_APP_GROUP_PLACEHOLDER).join(group);
        }
        fs.writeFileSync(path.join(extensionPath, file), content);
      }

      fs.writeFileSync(
        path.join(extensionPath, `${EXTENSION_NAME}.entitlements`),
        plist.build({
          'com.apple.security.application-groups': [group],
        }),
      );

      return mod;
    },
  ]);

  return config;
};

export default withLiveKitScreenShareIos;
