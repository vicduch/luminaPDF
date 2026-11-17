import React, { useState, useEffect, useRef } from 'react';
import { AiPanelProps, AiModel, ChatMessage, Persona } from '../types';
import { X, Sparkles, Loader2, Send, Bot, User, ChevronDown } from './Icons';
import { createChatSession, sendMessageToChat } from '../services/geminiService';
import { Chat } from "@google/genai";

const PERSONAS: Persona[] = [
  {
    id: 'general',
    name: 'Assistant Standard',
    description: 'Utile et neutre',
    systemInstruction: 'Tu es un assistant utile qui aide à comprendre un document PDF. Sois concis et précis.'
  },
  {
    id: 'expert',
    name: 'Analyste Expert',
    description: 'Analyse profonde et technique',
    systemInstruction: 'Tu es un expert dans le domaine du document. Tes réponses doivent être très détaillées, techniques, et analyser les nuances du texte. N\'hésite pas à faire des critiques constructives ou à mettre en perspective les informations.'
  },
  {
    id: 'teacher',
    name: 'Guide Pédagogique',
    description: 'Explique pour apprendre',
    systemInstruction: 'Tu es un tuteur pédagogue. Ton but est d\'enseigner les concepts du document à l\'utilisateur. Utilise des analogies, simplifie les termes complexes, et propose des quiz ou des résumés structurés.'
  },
  {
    id: 'journalist',
    name: 'Journaliste de Presse',
    description: 'Synthèse d\'actualité',
    systemInstruction: 'Tu agis comme un journaliste. Pour les articles de presse, extrais les faits clés, le ton, les biais potentiels et le contexte. Résume l\'information sous forme de brève journalistique.'
  },
  {
    id: 'concise',
    name: 'Synthétiseur',
    description: 'TL;DR - L\'essentiel uniquement',
    systemInstruction: 'Tu vas droit au but. Tes réponses sont des listes à puces (bullet points) ou des phrases très courtes. Pas de politesse superflue, juste l\'information.'
  }
];

const AiPanel: React.FC<AiPanelProps> = ({ isOpen, onClose, currentPageText, pdfMetadata }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<AiModel>(AiModel.FLASH_3_0);
  const [currentPersona, setCurrentPersona] = useState<Persona>(PERSONAS[0]);
  const [chatSession, setChatSession] = useState<Chat | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Re-initialize chat when Model, Persona or Metadata changes significantly
  useEffect(() => {
    if (isOpen) {
      // Build a rich system instruction
      let systemInstruction = currentPersona.systemInstruction;

      // Append Metadata Context globally
      if (pdfMetadata) {
        const metadataStr = `
        [CONTEXTE DU DOCUMENT]
        Titre: ${pdfMetadata.title || 'Inconnu'}
        Auteur: ${pdfMetadata.author || 'Inconnu'}
        Sujet: ${pdfMetadata.subject || 'Inconnu'}
        Mots-clés: ${pdfMetadata.keywords || 'Aucun'}
        `;
        systemInstruction += metadataStr;
      }

      const session = createChatSession(model, systemInstruction);
      setChatSession(session || null);

      if (messages.length === 0) {
        setMessages([{
          role: 'model',
          text: `Bonjour. Je suis en mode "${currentPersona.name}". Comment puis-je vous aider avec ce document ?`
        }]);
      }
    }
  }, [isOpen, model, currentPersona, pdfMetadata?.title]); // Re-create session if these change

  const handlePersonaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = PERSONAS.find(p => p.id === e.target.value) || PERSONAS[0];
    setCurrentPersona(selected);
    setMessages(prev => [...prev, { role: 'model', text: `Mode changé vers : ${selected.name}` }]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !chatSession) return;

    const userMsg: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const context = currentPageText
      ? `[CONTENU DE LA PAGE ACTIVE]:\n"${currentPageText.substring(0, 15000)}..."`
      : "[INFO]: Aucune texte détecté sur la page visible (image ou page vide).";

    const responseText = await sendMessageToChat(chatSession, input, context);

    setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    setLoading(false);
  };

  const colors = 'bg-[var(--lumina-toolbar-bg)] border-[var(--lumina-filet)] text-[var(--lumina-text-primary)]';

  return (
    <div
      className={`
        reader-ai flex flex-col min-w-0 transition-all duration-200 cubic-bezier(0.16, 1, 0.3, 1) h-full
        ${isOpen
          ? 'fixed inset-0 z-50 md:relative md:inset-auto md:z-auto md:w-[380px] lg:w-[420px] opacity-100 translate-x-0 border-l'
          : 'w-0 opacity-0 translate-x-10 overflow-hidden border-0'
        }
        ${colors}
      `}
    >
      <div className="flex flex-col h-full min-w-0">
        {/* Header with Configuration */}
        <div className="p-4 border-b border-[var(--lumina-filet)] flex flex-col gap-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Sparkles className="text-[var(--lumina-accent)]" size={18} />
                <h2>Assistant IA</h2>
              </div>
              <span className="text-xs text-[var(--lumina-text-secondary)] mt-0.5">Propulsé par Gemini 3.0</span>
            </div>
            <button onClick={onClose} aria-label="Fermer l’assistant IA" className="reader-icon text-[var(--lumina-text-secondary)]">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {/* Persona Selector */}
            <div className="relative rounded-[2px]">
              <select
                aria-label="Personnalité de l’assistant"
                value={currentPersona.id}
                onChange={handlePersonaChange}
                className="w-full min-h-[44px] p-2 pr-8 text-xs font-medium appearance-none cursor-pointer"
              >
                {PERSONAS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--lumina-text-secondary)]" />
            </div>

            {/* Model Selector Menu */}
            <div className="relative rounded-[2px]">
              <select
                aria-label="Modèle de l’assistant"
                value={model}
                onChange={(e) => setModel(e.target.value as AiModel)}
                className="w-full min-h-[44px] p-2 pr-8 text-xs font-medium appearance-none cursor-pointer"
              >
                <option value={AiModel.FLASH_3_0}>Modèle: Gemini 3.0 Flash (Optimisé)</option>
                <option value={AiModel.FLASH_2_5}>Modèle: Gemini 2.5 Flash (Rapide)</option>
                <option value={AiModel.PRO_3_0}>Modèle: Gemini 3.0 Pro (Intelligent)</option>
              </select>
              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--lumina-text-secondary)]" />
            </div>
          </div>

          <div className="text-xs text-[var(--lumina-text-secondary)] leading-tight">
            {currentPersona.description}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} fly-enter-active`}>
              <div className={`
                w-8 h-8 rounded-[2px] flex items-center justify-center flex-shrink-0
                ${msg.role === 'model' ? 'bg-[var(--lumina-accent-muted)] text-[var(--lumina-accent)]' : 'bg-[var(--lumina-hover-bg)] text-[var(--lumina-text-secondary)]'}
              `}>
                {msg.role === 'model' ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div className={`
                max-w-[85%] rounded-[2px] px-4 py-2 text-sm leading-relaxed whitespace-pre-line
                ${msg.role === 'user'
                  ? 'bg-[var(--lumina-accent)] text-[var(--lumina-accent-fg)]'
                  : 'bg-[var(--lumina-hover-bg)] text-[var(--lumina-text-primary)]'
                }
              `}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 fly-enter-active">
              <div className="w-8 h-8 rounded-[2px] bg-[var(--lumina-accent-muted)] text-[var(--lumina-accent)] flex items-center justify-center animate-pulse">
                <Sparkles size={16} />
              </div>
              <div className="bg-[var(--lumina-hover-bg)] text-[var(--lumina-text-primary)] rounded-[2px] px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Réflexion ({currentPersona.name})...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[var(--lumina-filet)] flex-shrink-0">
          <div className="relative flex items-center">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Posez une question..."
              className="w-full pl-4 pr-16 py-3 rounded-[2px] resize-none text-sm border-[var(--lumina-filet)] transition-colors"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              aria-label="Envoyer la question"
              disabled={!input.trim() || loading}
              className={`
                reader-ai-send absolute right-2 min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-2 rounded-[2px] transition-colors duration-300
                ${!input.trim() || loading
                  ? 'text-[var(--lumina-text-secondary)] cursor-not-allowed'
                  : 'bg-[var(--lumina-accent)] text-[var(--lumina-accent-fg)]'
                }
              `}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiPanel;