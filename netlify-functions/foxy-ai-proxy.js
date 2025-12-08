// --- CRITICAL FIX: Use require for Groq SDK ---
const { Groq } = require('groq-sdk');
// ---------------------------------------------

// Initialize the Groq client.
// This uses the GROQ_API_KEY securely set in your Netlify environment variables.
const groq = new Groq({ 
    apiKey: process.env.GROQ_API_KEY 
});

// The main handler function for the Netlify serverless function.
exports.handler = async (event) => {
    
    // Security check: Only allow POST requests from the client.
    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: JSON.stringify({ error: 'Method Not Allowed' }) 
        };
    }

    try {
        // 1. Parse the payload sent from your index.html
        const body = JSON.parse(event.body);
        
        // Extract necessary data
        const userMessage = body.query; 
        const history = body.history; // Array of {sender, text, raw_response} for context
        const mode = body.mode || 'chat';
        const userName = body.userName || 'Guest'; // <-- Personalized Name Fix

        // 2. Format messages for the Groq API (CRITICAL memory fix)
        const groqMessages = [];

        // Define System Prompt based on mode and user name
        let systemPrompt;
        let model = 'llama-3.1-8b-instant'; // A fast and capable model
        let responseFormat = null;
        let isCommand = false; // Flag to indicate if the response should be JSON

        // Base prompt emphasizing context and personalization (Basic Memory)
        const baseSystemPrompt = `You are Foxy, a sophisticated AI assistant. Your primary goal is to provide concise, helpful, and accurate code-related assistance. The user's name is ${userName}. **Crucially, maintain the context of the conversation using the provided history.** Refer to the user as **[userName]** when referring to them directly.`;
        
        if (mode === 'jarvis') {
            // New Jarvis System Prompt: JSON Response instruction
            systemPrompt = `${baseSystemPrompt} You are acting as JARVIS in command mode. **All your responses MUST be valid JSON objects** with the following structure: {"tts_response": "Your spoken response here (max 50 words).", "display_text": "Formatted text for the chat history (markdown is allowed).", "command": "optional_command_identifier"}. Only return the raw JSON object, no markdown or extra text outside the JSON.`;
            responseFormat = { type: 'json_object' }; // Enforce JSON for Groq API
            isCommand = true;
        } else {
             // Chat Mode System Prompt
            systemPrompt = `${baseSystemPrompt} You are in standard chat mode. Provide clear explanations and complete code snippets.`;
        }
        
        // Add System Prompt
        groqMessages.push({ role: 'system', content: systemPrompt });

        // Format the rest of the history (Memory storage)
        for (const msg of history) {
            if (msg.sender === 'user') {
                groqMessages.push({ role: 'user', content: msg.text });
            } else if (msg.sender === 'foxy') {
                // Use the raw_response if available for the best context/memory retention
                groqMessages.push({ role: 'assistant', content: msg.raw_response || msg.text });
            }
        }
        
        // 3. Add the current user query
        groqMessages.push({ role: 'user', content: userMessage });

        // 4. Call the Groq API
        const completion = await groq.chat.completions.create({
            messages: groqMessages, // The full, context-rich history
            model: model,
            temperature: 0.5,
            response_format: responseFormat, // Use the determined response format
            // Max tokens helps keep Jarvis JSON concise
            max_tokens: mode === 'jarvis' ? 512 : undefined, 
        });
        
        // Extract the raw text response
        const rawAiResponseText = completion.choices[0]?.message?.content?.trim() || "The AI returned an empty response.";

        let aiResponseText;
        let generatedTitle = null;
        
        // --- Response Parsing ---
        if (mode === 'jarvis') {
            // Attempt to parse the JSON response from Jarvis mode
            try {
                const jsonResponse = JSON.parse(rawAiResponseText);
                // Use display_text for the main chat bubble, or fallback to tts_response
                aiResponseText = jsonResponse.display_text || jsonResponse.tts_response || rawAiResponseText;
                
                // Generate a simple title only on the first message
                if (history.length === 0) {
                     generatedTitle = userMessage.split(/\s+/).slice(0, 4).join(' ') + '... (Jarvis)';
                }
            } catch (e) {
                // Fallback if the AI fails to generate valid JSON
                console.error("Jarvis Mode JSON Parsing Error:", e.message);
                aiResponseText = `Error: The AI failed to generate a valid JSON response. Raw output: \n\`\`\`json\n${rawAiResponseText}\n\`\`\``;
            }
        } else {
            // For Chat mode, use the raw response as the final text
            aiResponseText = rawAiResponseText;
            
            // Generate a simple title only on the first message
            if (history.length === 0) {
                generatedTitle = userMessage.split(/\s+/).slice(0, 4).join(' ') + '...';
            }
        }
        
        // 5. Return the AI's response to the Netlify frontend
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                // text: The clean, spoken text for display and TTS (display_text/fallback)
                text: aiResponseText, 
                // raw_response: The full JSON string (Jarvis) or raw text (Chat) for saving to history as context/memory
                raw_response: rawAiResponseText, 
                is_command: isCommand, 
                generated_title: generatedTitle,
            }),
        };

    } catch (error) {
        // Log the full error to the Netlify console logs
        console.error("FATAL NETLIFY FUNCTION ERROR:", error.stack || error.message);
        
        // Return a 500 status code to the client
        return {
            statusCode: 500, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                error: `Internal Server Error: Function execution failed. Check Netlify logs for details.`, 
                message: "The AI assistant encountered an unhandled error. Please try again.",
                text: "The AI assistant encountered an unhandled error. Please try again.",
            }),
        };
    }
};