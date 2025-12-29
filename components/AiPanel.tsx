import React, { useState, useEffect, useRef } from 'react';
import { AppTheme, AiPanelProps, AiModel, ChatMessage, Persona } from '../types';
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

const AiPanel: React.FC<AiPanelProps> = ({ isOpen, onClose, currentPageText, pdfMetadata, theme }) => {
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

  const getThemeColors = () => {
    switch (theme) {
      case AppTheme.LIGHT: return 'bg-white border-gray-200 text-gray-800';
      case AppTheme.SOLARIZED: return 'bg-[#fdf6e3] border-[#eee8d5] text-[#586e75]';
      case AppTheme.SEPIA: return 'bg-[#fcf7e9] border-[#e0d6b5] text-[#5b4636]';
      case AppTheme.FOREST: return 'bg-[#1a2f23] border-[#2c4236] text-[#c1d1c8]';
      case AppTheme.BLUE_NIGHT: return 'bg-[#0f172a] border-[#1e293b] text-[#94a3b8]';
      case AppTheme.DARK: return 'bg-slate-900 border-gray-700 text-gray-200';
      case AppTheme.MIDNIGHT: return 'bg-black border-gray-800 text-gray-400';
      default: return 'bg-white border-gray-200 text-gray-800';
    }
  };

  const isLight = theme === AppTheme.LIGHT || theme === AppTheme.SEPIA || theme === AppTheme.SOLARIZED;
  const colors = getThemeColors();
  const inputBg = isLight ? 'bg-black/5' : 'bg-white/10';

  return (
    <div 
      className={`
        flex flex-col border-l transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1) h-full
        ${isOpen ? 'w-96 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-10 overflow-hidden'}
        ${colors}
      `}
    >
      <div className="flex flex-col h-full min-w-[24rem]">
        {/* Header with Configuration */}
        <div className={`p-4 border-b flex flex-col gap-3 flex-shrink-0 ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="text-blue-500" size={18} />
              <span className="font-light tracking-wide">Assistant AI</span>
            </div>
            <button onClick={onClose} className="p-1 hover:opacity-70 rounded">
              <X size={18} />
            </button>
          </div>
          
          <div className="flex flex-col gap-2">
            {/* Persona Selector */}
            <div className={`relative rounded-lg ${inputBg}`}>
                <select 
                    value={currentPersona.id} 
                    onChange={handlePersonaChange}
                    className="w-full bg-transparent p-2 text-xs font-medium appearance-none outline-none cursor-pointer"
                >
                    {PERSONAS.map(p => (
                        <option key={p.id} value={p.id} className={isLight ? 'bg-white text-black' : 'bg-slate-800 text-white'}>
                            {p.name}
                        </option>
                    ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-2.5 pointer-events-none opacity-50" />
            </div>

            {/* Model Selector Menu */}
            <div className={`relative rounded-lg ${inputBg}`}>
                <select 
                    value={model}
                    onChange={(e) => setModel(e.target.value as AiModel)}
                    className="w-full bg-transparent p-2 text-xs font-medium appearance-none outline-none cursor-pointer"
                >
                    <option value={AiModel.FLASH_3_0} className={isLight ? 'bg-white text-black' : 'bg-slate-800 text-white'}>Modèle: Gemini 3.0 Flash (Optimisé)</option>
                    <option value={AiModel.FLASH_2_5} className={isLight ? 'bg-white text-black' : 'bg-slate-800 text-white'}>Modèle: Gemini 2.5 Flash (Rapide)</option>
                    <option value={AiModel.PRO_3_0} className={isLight ? 'bg-white text-black' : 'bg-slate-800 text-white'}>Modèle: Gemini 3.0 Pro (Intelligent)</option>
                </select>
                <ChevronDown size={14} className="absolute right-2 top-2.5 pointer-events-none opacity-50" />
            </div>
          </div>
          
          <div className="text-[10px] opacity-60 leading-tight">
             {currentPersona.description}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-light">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} fly-enter-active`}>
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${msg.role === 'model' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' : (isLight ? 'bg-gray-200 text-gray-600' : 'bg-gray-700 text-gray-300')}
              `}>
                {msg.role === 'model' ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div className={`
                max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-line shadow-sm
                ${msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : `${isLight ? 'bg-black/5 text-gray-800' : 'bg-white/10 text-gray-200'} rounded-tl-none`
                }
              `}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 fly-enter-active">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300 flex items-center justify-center animate-pulse">
                  <Sparkles size={16} />
              </div>
              <div className={`${isLight ? 'bg-black/5' : 'bg-white/10'} rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2`}>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs opacity-70">Réflexion ({currentPersona.name})...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={`p-3 border-t flex-shrink-0 ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
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
              className={`
                w-full pl-4 pr-12 py-3 rounded-xl resize-none text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-light
                ${!isLight ? 'bg-black/20 text-white placeholder-gray-500 focus:bg-black/30' : 'bg-gray-100 text-gray-800 placeholder-gray-400 focus:bg-white focus:shadow-md'}
              `}
              rows={1}
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className={`
                absolute right-2 p-2 rounded-lg transition-all duration-300
                ${!input.trim() || loading 
                  ? 'text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md transform hover:scale-105'
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