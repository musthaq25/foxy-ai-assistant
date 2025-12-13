// Interface for the exposed Electron API
interface ElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

const getElectron = (): ElectronAPI | undefined => {
  return (window as any).electron;
};

export const desktopService = {
  /**
   * Attempts to open a Windows application via Electron's main process.
   * Assumes the main process listens for 'system:open-app'.
   */
  openApp: async (appName: string): Promise<boolean> => {
    const electron = getElectron();
    if (!electron) {
      console.warn('Desktop service not available. Cannot open:', appName);
      return false;
    }

    try {
      console.log(`[DesktopService] Requesting to open: ${appName}`);
      const result = await electron.invoke('system:open-app', appName);
      return result.success;
    } catch (error) {
      console.error('Failed to execute desktop command:', error);
      return false;
    }
  }
};