import { GoogleGenAI, Chat } from "@google/genai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

// Helper to create a client instance (always fresh to avoid stale keys if logic changes)
const getClient = () => apiKey ? new GoogleGenAI({ apiKey }) : null;

export const createChatSession = (model: string, systemInstruction: string) => {
  const ai = getClient();
  if (!ai) return null;

  return ai.chats.create({
    model: model,
    config: {
      systemInstruction: systemInstruction
    }
  });
};

export const sendMessageToChat = async (chat: Chat, message: string, context: string): Promise<string> => {
  if (!chat) return "Erreur: Session de chat non initialisée.";

  try {
    // We combine context and user message to ensure the model focuses on the current page
    const fullPrompt = `${context}\n\n[QUESTION UTILISATEUR]:\n${message}`;

    const response = await chat.sendMessage({
      message: fullPrompt
    });

    return response.text || "Pas de réponse.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "Désolé, une erreur est survenue lors de la communication avec l'IA. Vérifiez votre connexion.";
  }
};

// Keep the old summarizer for backward compatibility or quick actions if needed
export const summarizeText = async (text: string): Promise<string> => {
  const ai = getClient();
  if (!ai || !text.trim()) return "";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.0-flash',
      contents: `Résume ce texte de manière concise:\n\n${text}`,
    });
    return response.text || "";
  } catch (e) {
    return "";
  }
};