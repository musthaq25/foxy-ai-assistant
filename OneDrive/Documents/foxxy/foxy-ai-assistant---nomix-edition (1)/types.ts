export enum Screen {
  LOADING = 'loading',
  ONBOARDING_NAME = 'onboarding_name',
  INTRO_SEQUENCE = 'intro_sequence',
  WELCOME = 'welcome',
  MODE_SELECTION = 'mode_selection',
  JARVIS_MODE = 'jarvis_mode',
  CHAT_MODE = 'chat_mode',
  SETTINGS = 'settings',
}

export enum Theme {
  DARK = 'dark',
  LIQUID_GLASS = 'liquid_glass',
}

export interface Message {
  id: string;
  sender: 'user' | 'foxy';
  text: string;
  timestamp: string;
  isLoading?: boolean;
  isCommand?: boolean;
  commandData?: {
    command: string;
    appName: string;
  };
}

export interface Session {
  id: string;
  title: string;
  mode: 'chat' | 'jarvis';
  messages: Message[];
  createdAt: number;
}

export interface AppConfig {
  userName: string | null;
  theme: Theme;
  accentColor: string;
}

export interface AIResponse {
  text: string;
  isCommand: boolean;
  generatedTitle?: string;
  command?: string;
  appName?: string;
  greeting?: string;
}