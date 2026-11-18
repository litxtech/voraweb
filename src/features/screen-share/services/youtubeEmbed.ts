import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** YouTube Error 153: WebView Referer zorunlu (app bundle / package). */
export function youtubeRefererOrigin(): string {
  const appId =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.bundleIdentifier
      : Constants.expoConfig?.android?.package;
  return `https://${(appId ?? 'com.litxtech.vora').toLowerCase()}`;
}

export function youtubeEmbedHtml(
  videoId: string,
  opts?: { autoplay?: boolean; mute?: boolean },
): string {
  const autoplay = opts?.autoplay === false ? 0 : 1;
  const mute = opts?.mute ? 1 : 0;
  const src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` +
    `?playsinline=1&rel=0&modestbranding=1&autoplay=${autoplay}&mute=${mute}`;
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
      .wrap{position:fixed;inset:0}
      iframe{width:100%;height:100%;border:0}
    </style>
  </head>
  <body>
    <div class="wrap">
      <iframe
        src="${src}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    </div>
  </body>
</html>`;
}
