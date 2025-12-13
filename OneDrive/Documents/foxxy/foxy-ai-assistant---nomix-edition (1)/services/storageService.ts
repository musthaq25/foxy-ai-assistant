import { Session, AppConfig } from '../types';
import { STORAGE_KEYS, DEFAULT_CONFIG } from '../constants';

// Interface for the exposed Electron API (Bridge)
interface ElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
}

const getElectron = (): ElectronAPI | undefined => {
  return (window as any).electron;
};

export const storageService = {
  loadConfig: async (): Promise<AppConfig> => {
    const electron = getElectron();
    if (electron) {
       try {
         // Using 'storage:get' channel convention
         const data = await electron.invoke('storage:get', STORAGE_KEYS.CONFIG);
         return data ? data : { ...DEFAULT_CONFIG };
       } catch (error) {
         console.error('Electron storage load error (config):', error);
         return { ...DEFAULT_CONFIG };
       }
    }
    const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
    return stored ? JSON.parse(stored) : { ...DEFAULT_CONFIG };
  },

  saveConfig: async (config: AppConfig): Promise<void> => {
    const electron = getElectron();
    if (electron) {
      try {
        await electron.invoke('storage:set', STORAGE_KEYS.CONFIG, config);
      } catch (error) {
        console.error('Electron storage save error (config):', error);
      }
      return;
    }
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  },

  loadSessions: async (): Promise<Session[]> => {
    const electron = getElectron();
    if (electron) {
       try {
         const data = await electron.invoke('storage:get', STORAGE_KEYS.SESSIONS);
         return Array.isArray(data) ? data : [];
       } catch (error) {
         console.error('Electron storage load error (sessions):', error);
         return [];
       }
    }
    const stored = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return stored ? JSON.parse(stored) : [];
  },

  saveSessions: async (sessions: Session[]): Promise<void> => {
    const electron = getElectron();
    if (electron) {
      try {
        await electron.invoke('storage:set', STORAGE_KEYS.SESSIONS, sessions);
      } catch (error) {
        console.error('Electron storage save error (sessions):', error);
      }
      return;
    }
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  },

  loadLastScreen: async (): Promise<string | null> => {
    const electron = getElectron();
    if (electron) {
       try {
         return await electron.invoke('storage:get', STORAGE_KEYS.LAST_SCREEN);
       } catch (error) {
         return null;
       }
    }
    return localStorage.getItem(STORAGE_KEYS.LAST_SCREEN);
  },

  saveLastScreen: async (screen: string): Promise<void> => {
    const electron = getElectron();
    if (electron) {
       try {
         await electron.invoke('storage:set', STORAGE_KEYS.LAST_SCREEN, screen);
       } catch (e) {}
       return;
    }
    localStorage.setItem(STORAGE_KEYS.LAST_SCREEN, screen);
  }
};