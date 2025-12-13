import { Session, Message, AIResponse } from '../types';
import { NETLIFY_AI_PROXY_URL } from '../constants';

export const fetchAIResponse = async (
  session: Session, 
  userQuery: string, 
  userName: string
): Promise<AIResponse> => {
  
  // Format history for the backend
  const history = session.messages
    .filter(m => !m.isLoading && m.text)
    .slice(-20)
    .map(m => ({
      sender: m.sender,
      text: m.text,
      // Pass raw text if needed, effectively mimicking the original app's structure
    }));

  const payload = {
    session_id: session.id,
    query: userQuery,
    is_first_message: session.messages.length <= 1,
    mode: session.mode,
    history: history,
    user_name: userName || 'Guest'
  };

  const response = await fetch(NETLIFY_AI_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.text,
    isCommand: data.is_command,
    generatedTitle: data.generated_title,
    command: data.command,
    appName: data.app_name,
    greeting: data.greeting
  };
};