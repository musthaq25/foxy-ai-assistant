import React from 'react';
import { Screen, Session } from '../types';
import { MessageSquare, Mic, Settings, Trash2, Menu, Plus, Home } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  currentScreen: Screen;
  sessions: Session[];
  currentSessionId: string | null;
  onToggle: (open: boolean) => void;
  onNavigate: (screen: Screen) => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewSession: (mode: 'chat' | 'jarvis') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  currentScreen,
  sessions,
  currentSessionId,
  onToggle,
  onNavigate,
  onSwitchSession,
  onDeleteSession,
  onNewSession
}) => {
  return (
    <div 
      className={`fixed top-0 left-0 h-full w-72 bg-gray-900/95 backdrop-blur-xl z-50 transform transition-transform duration-300 ease-in-out border-r border-gray-800 flex flex-col ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-3">
          <img src="foxy.png" alt="Foxy AI" className="w-8 h-8 object-contain" />
          Foxy AI
        </h2>
        <button 
          onClick={() => onToggle(false)} 
          className="lg:hidden p-2 text-gray-400 hover:text-white"
        >
          <Menu size={20} />
        </button>
      </div>

      <div className="p-4 space-y-2 border-b border-gray-800">
        <button
          onClick={() => onNavigate(Screen.WELCOME)}
          className={`flex items-center w-full p-3 rounded-lg transition-colors ${
            currentScreen === Screen.WELCOME ? 'bg-cyan-900/30 text-cyan-400' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <Home size={20} className="mr-3" />
          Home
        </button>
        <button
          onClick={() => onNavigate(Screen.CHAT_MODE)}
          className={`flex items-center w-full p-3 rounded-lg transition-colors ${
            currentScreen === Screen.CHAT_MODE ? 'bg-cyan-900/30 text-cyan-400' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <MessageSquare size={20} className="mr-3" />
          Chat Mode
        </button>
        <button
          onClick={() => onNavigate(Screen.JARVIS_MODE)}
          className={`flex items-center w-full p-3 rounded-lg transition-colors ${
            currentScreen === Screen.JARVIS_MODE ? 'bg-indigo-900/30 text-indigo-400' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <Mic size={20} className="mr-3" />
          Jarvis Mode
        </button>
        <button
          onClick={() => onNavigate(Screen.SETTINGS)}
          className={`flex items-center w-full p-3 rounded-lg transition-colors ${
            currentScreen === Screen.SETTINGS ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800'
          }`}
        >
          <Settings size={20} className="mr-3" />
          Settings
        </button>
      </div>

      <div className="p-4">
          <button 
            onClick={() => onNewSession('chat')}
            className="flex items-center justify-center w-full p-2 mb-4 bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-600/30 transition-all"
          >
            <Plus size={16} className="mr-2"/> New Chat
          </button>
          
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">History</h3>
          <div className="space-y-1 overflow-y-auto max-h-[50vh] scrollbar-thin">
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => onSwitchSession(session.id)}
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border ${
                  session.id === currentSessionId 
                    ? 'bg-gray-800 border-gray-700 text-white' 
                    : 'border-transparent text-gray-400 hover:bg-gray-800/50'
                }`}
              >
                <div className="flex items-center truncate max-w-[180px]">
                  {session.mode === 'jarvis' ? <Mic size={14} className="mr-2 shrink-0"/> : <MessageSquare size={14} className="mr-2 shrink-0"/>}
                  <span className="text-sm truncate">{session.title}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-900/30 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {sessions.length === 0 && (
                <p className="text-gray-600 text-xs text-center py-4">No history yet</p>
            )}
          </div>
      </div>
    </div>
  );
};