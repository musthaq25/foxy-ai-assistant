export const handler = async (event: any) => {
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server configuration error: GROQ_API_KEY is missing." }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { query, history, mode, user_name, is_first_message } = body;
    
    // Identity Information
    const identityInfo = `
    Identity:
    - You are Foxy (or Jarvis in command mode), an AI created by NOMIX.
    - NOMIX was founded by Mohammed Musthaq (teen).
    - If asked "Who created you?", "Who made you?", or similar, ALWAYS answer: "I am created by NOMIX, founded by Mohammed Musthaq (teen)."
    `;

    // --- JARVIS MODE (Strict JSON for Automation) ---
    if (mode === 'jarvis') {
        const systemInstruction = `You are Jarvis, a high-performance system interface for a Windows user named ${user_name || 'User'}.
        ${identityInfo}

        CRITICAL: You must respond in valid JSON format.
        
        Capabilities:
        1. If the user asks to open an application (e.g., "Open Notepad", "Launch Chrome", "Start Spotify"), you MUST set "is_command" to true, "command" to "OPEN_APP", and "app_name" to the executable name or common name.
        2. Keep "text" responses concise, robotic, and cool.
        
        JSON Schema:
        {
          "text": "string (The spoken response)",
          "is_command": boolean,
          "command": "string (OPEN_APP or null)",
          "app_name": "string (e.g. 'notepad', 'chrome', 'spotify' or null)",
          "greeting": "string (Short spoken text)",
          "generated_title": "string (A concise 3-5 word title for this session if this is the first message, otherwise null)"
        }`;

        const messages = [
            { role: "system", content: systemInstruction },
            ...history.map((msg: any) => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text,
            })),
            { role: "user", content: query }
        ];

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: messages,
            response_format: { type: "json_object" }, // Strict JSON for Jarvis
            temperature: 0.3, // Lower temp for precise commands
            max_tokens: 512
          })
        });

        if (!response.ok) throw new Error(`Groq API Error: ${response.status}`);
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: content // Already JSON string
        };
    } 
    
    // --- CHAT MODE (Free Text for Conversation + Parallel Title Generation) ---
    else {
        // 1. Prepare Main Chat Request
        const systemInstruction = `You are Foxy, a witty, intelligent, and helpful AI assistant with a futuristic 'Liquid Glass' personality.
        User: ${user_name || 'User'}.
        ${identityInfo}
        
        Formatting & Style Guidelines:
        1. **Structure (Gemini Premium Style)**: Use Headers (###), bullet points, and double line breaks to create a spacious, professional layout. Do not output dense walls of text.
        2. **Math**: You MUST use LaTeX formatting for all math expressions.
           - Inline math: $E=mc^2$ (surround with single dollar signs)
           - Block math: $$ \int_{0}^{\infty} x^2 dx $$ (surround with double dollar signs)
        3. **Emojis**: Use emojis sparingly (max 1-2 per section) to add flavor but keep it clean. Do not clutter the text.
        4. **Tone**: Engaging, smart, and precise.
        
        Do not output JSON. Output the natural language response directly.`;

        const messages = [
            { role: "system", content: systemInstruction },
            ...history.map((msg: any) => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text,
            })),
            { role: "user", content: query }
        ];

        const chatRequest = fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: messages,
            // NO response_format enforced here, standard text mode
            temperature: 0.8, 
            max_tokens: 1024
          })
        });

        // 2. Prepare Title Generation Request (If first message)
        let titleRequest = Promise.resolve(null);
        if (is_first_message) {
            titleRequest = fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        { role: "system", content: "You are a specialized title generator. Generate a concise, 3-5 word title for the following user query. Return ONLY the raw title text, no quotes, no conversational filler." },
                        { role: "user", content: query }
                    ],
                    temperature: 0.5,
                    max_tokens: 20
                })
            }).then(res => res.ok ? res.json() : null);
        }

        // 3. Execute in Parallel
        const [chatResponse, titleData] = await Promise.all([chatRequest, titleRequest]);

        if (!chatResponse.ok) throw new Error(`Groq API Error: ${chatResponse.status}`);
        const chatData = await chatResponse.json();
        const rawContent = chatData.choices[0]?.message?.content || "";
        
        const generatedTitle = titleData?.choices?.[0]?.message?.content?.trim() || null;
        
        // 4. Wrap raw text in our standard API structure for the frontend
        const wrappedResponse = {
            text: rawContent,
            is_command: false,
            command: null,
            app_name: null,
            greeting: null, // Frontend will fall back to text
            generated_title: generatedTitle
        };

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(wrappedResponse)
        };
    }

  } catch (error: any) {
    console.error("Foxy Proxy Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        text: "I'm having trouble connecting to my neural net right now.",
        is_command: false,
        error: error.message
      }),
    };
  }
};