// electron-vite resolves `?asset` imports to a runtime file path (the asset is
// copied into the build output). Used for the app icon in the main process.
declare module "*?asset" {
  const path: string;
  export default path;
}
