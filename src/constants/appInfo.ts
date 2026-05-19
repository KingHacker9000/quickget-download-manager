export const APP_NAME = "QuickGet Download Manager";
export const APP_VERSION_FALLBACK = "0.1.0";
export const APP_VERSION =
  (typeof import.meta.env.VITE_QDM_APP_VERSION === "string" && import.meta.env.VITE_QDM_APP_VERSION.trim()) ||
  APP_VERSION_FALLBACK;
export const FRONTEND_BUILD_TIME =
  (typeof import.meta.env.VITE_QDM_FRONTEND_BUILD_TIME === "string" && import.meta.env.VITE_QDM_FRONTEND_BUILD_TIME.trim()) ||
  "unknown";
export const FRONTEND_BUILD_COMMIT =
  (typeof import.meta.env.VITE_QDM_FRONTEND_BUILD_COMMIT === "string" && import.meta.env.VITE_QDM_FRONTEND_BUILD_COMMIT.trim()) ||
  "unknown";

export const QUICKGET_REPO_URL = "https://github.com/KingHacker9000/quickget";
export const QDM_REPO_URL = "https://github.com/KingHacker9000/quickget-download-manager";
