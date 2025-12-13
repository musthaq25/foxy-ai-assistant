// This service handles Text-to-Speech (TTS) and Speech-to-Text (STT).
// For the desktop application requirement, this isolates the speech logic.
// In a full Electron app, this would bridge to native modules like 'node-stt' or SAPI via IPC.

let recognition: SpeechRecognition | null = null;

// Type definition for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: any) => void;
  onend: (event: any) => void;
  onerror: (event: any) => void;
}

// Polyfill check for browser environment
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const speechService = {
  isSupported: (): boolean => {
    return !!SpeechRecognition && !!window.speechSynthesis;
  },

  speak: (text: string, onStart?: () => void, onEnd?: () => void) => {
    if (!window.speechSynthesis) return;
    
    // Clean text for speaking (remove markdown)
    const cleanText = text.replace(/(\*\*|__|#|`)/g, '');
    
    window.speechSynthesis.cancel(); // Stop any current speech
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Select a preferred voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang === 'en-US' && v.localService) || voices.find(v => v.lang === 'en-US');
    if (preferredVoice) utterance.voice = preferredVoice;

    if (onStart) utterance.onstart = onStart;
    if (onEnd) utterance.onend = onEnd;
    
    utterance.onerror = (e) => {
      console.error("TTS Error", e);
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  },

  stopSpeaking: () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  },

  startListening: (onResult: (text: string) => void, onEnd: () => void, onError: (error: string) => void) => {
    if (!SpeechRecognition) {
      onError("Speech recognition not supported");
      return;
    }

    if (recognition) {
      try { recognition.abort(); } catch(e) {}
    }

    recognition = new SpeechRecognition();
    recognition!.continuous = false;
    recognition!.interimResults = false;
    recognition!.lang = 'en-US';

    recognition!.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition!.onend = () => {
      onEnd();
    };

    recognition!.onerror = (event: any) => {
      onError(event.error);
    };

    try {
      recognition!.start();
    } catch (e) {
      console.error("Failed to start recognition", e);
      onError("Start failed");
    }
  },

  stopListening: () => {
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
    }
  }
};
