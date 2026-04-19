import type { ImageSourcePropType } from "react-native";

// Rezolvă cheile din DB către require(...) locale
export function resolveVisualAsset(key: string) {
  switch (key) {
    case "fake_login":
      return require("../assets/visual/fake_login.png");
    case "newsletter":
      return require("../assets/visual/newsletter.png");
    case "password_reset":
      return require("../assets/visual/password_reset.png");
    case "hr_announcement":
      return require("../assets/visual/hr_announcement.png");
    default:
      // fallback
      return require("../assets/visual/fake_login.png");
  }
}

export function isLocalVisualAsset(asset: string) {
  return asset.startsWith("file://") || asset.startsWith("content://");
}

export function getVisualAssetSource(asset: string): ImageSourcePropType {
  if (isLocalVisualAsset(asset)) {
    return { uri: asset };
  }
  return resolveVisualAsset(asset);
}