'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, User as UserIcon, Bot, Sparkles, ChevronRight, Zap, LogOut, Mic, Square, Plus, History, ArrowLeft } from 'lucide-react';
import LoginPanel from '@/app/components/LoginPanel';

// TTS Voice helper
const speakText = (text: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const cleanText = text.replace(/[*#_`>]/g, "").trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "pt-BR";
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
};

const genChatId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ConnectHubNara() {
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);
  const [step, setStep] = useState<'login' | 'welcome' | 'history' | 'chat' | 'chatlist'>('login');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState('');
  const [chatId, setChatId] = useState<string>('');
  const [previousChats, setPreviousChats] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const options = [
    { id: 'projeto_social', icon: '🌱', label: 'Tenho um projeto social', context: 'Pessoa tem projeto social' },
    { id: 'projeto_negocio', icon: '💼', label: 'Tenho uma ideia de negócio', context: 'Pessoa quer validar negócio' },
    { id: 'projeto_comunidade', icon: '🏘️', label: 'Quero ajudar minha comunidade', context: 'Pessoa quer impacto' },
    { id: 'projeto_educacao', icon: '📚', label: 'Projeto educativo', context: 'Pessoa quer solução educacional' },
    { id: 'projeto_ambiente', icon: '🌳', label: 'Projeto sustentável', context: 'Pessoa quer solução ambiental' },
    { id: 'projeto_saude', icon: '❤️', label: 'Projeto de saúde', context: 'Pessoa tem solução em saúde' },
    { id: 'projeto_cultura', icon: '🎭', label: 'Projeto cultural', context: 'Pessoa quer iniciativa cultural' },
    { id: 'projeto_emprego', icon: '💼', label: 'Gerar emprego e renda', context: 'Pessoa quer oportunidades econômicas' },
    { id: 'projeto_outro', icon: '💬', label: 'Outro tipo de projeto', context: 'Projeto não categorizado' },
  ];

  useEffect(() => {
    const savedPhone = localStorage.getItem('nara_user_email');
    const savedName = localStorage.getItem('nara_user_name') || '';

    if (savedPhone) {
      const user = { email: savedPhone, name: savedName };
      setCurrentUser(user);
      loadUserChatHistory(savedPhone);
    } else {
      setStep('login');
    }
  }, []);

  const loadUserChatHistory = async (email: string) => {
    try {
      const res = await fetch(`/api/chats?sessionId=${encodeURIComponent(email)}`);
      const data = await res.json();

      if (data.chats && data.chats.length > 0) {
        setPreviousChats(data.chats);
        setStep('history');
      } else {
        setStep('welcome');
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
      setStep('welcome');
    }
  };

  const loadChatMessages = async (email: string, targetChatId: string) => {
    try {
      const res = await fetch(`/api/history?sessionId=${encodeURIComponent(email)}&chatId=${encodeURIComponent(targetChatId)}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setChatId(targetChatId);
      setStep('chat');
    } catch (err) {
      console.error('Failed to load chat:', err);
    }
  };

  const openPreviousChatsList = async () => {
    if (!currentUser?.email) return;
    setLoadingChats(true);
    setStep('chatlist');
    try {
      const res = await fetch(`/api/chats?sessionId=${encodeURIComponent(currentUser.email)}`);
      const data = await res.json();
      setPreviousChats(data.chats || []);
    } catch (err) {
      console.error('Failed to load chats list:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  const continueMostRecentChat = () => {
    if (!currentUser?.email || previousChats.length === 0) return;
    loadChatMessages(currentUser.email, previousChats[0].chat_id);
  };

  const startNewChat = () => {
    const newId = genChatId();
    setChatId(newId);
    setMessages([]);
    setContext('');
    setStep('welcome');
  };

  const handleLoginSuccess = (user: { name: string; email: string }) => {
    localStorage.setItem('nara_user_email', user.email);
    localStorage.setItem('nara_user_name', user.name);
    setCurrentUser(user);
    loadUserChatHistory(user.email);
  };

  const handleLogout = () => {
    localStorage.removeItem('nara_user_email');
    localStorage.removeItem('nara_user_name');
    setCurrentUser(null);
    setMessages([]);
    setStep('login');
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleStart = (opt: any) => {
    setContext(opt.context);
    if (!chatId) setChatId(genChatId());
    setStep('chat');

    setMessages([]);

    const startMsg = `Ótimo! Você escolheu "${opt.label}".\n\nSou a NARA. Para eu te ajudar da melhor forma, me conta: qual é o problema específico que você quer resolver? E quem será impactado por isso?`;

    setMessages([{ role: 'assistant', content: startMsg }]);
    speakText(startMsg);
  };

  const sendTextToChat = async (text: string): Promise<string | null> => {
    if (!currentUser?.email) return null;

    const activeChatId = chatId || genChatId();
    if (!chatId) setChatId(activeChatId);

    const userMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          context: context,
          sessionId: currentUser.email,
          chatId: activeChatId
        }),
      });

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.text }]);
      speakText(data.text);
      return data.text as string;
    } catch (error) {
      const fallback = 'Estou com um problema técnico. Pode me contar mais sobre seu projeto enquanto resolvo isso?';
      setMessages((prev) => [...prev, { role: 'assistant', content: fallback }]);
      speakText(fallback);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !currentUser?.email) return;
    const text = input.trim();
    setInput('');
    await sendTextToChat(text);
  };

  const startRecording = async () => {
    if (isRecording || isTranscribing || loading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleVoiceInput(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Erro no microfone. Verifique as permissões.' }]);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    isRecording ? stopRecording() : startRecording();
  };

  const handleVoiceInput = async (blob: Blob) => {
    try {
      setIsTranscribing(true);
      const formData = new FormData();
      formData.append('audio', blob, 'input.webm');

      const sttRes = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData
      });
      if (!sttRes.ok) throw new Error('Falha na transcrição');
      const sttData = await sttRes.json();
      const text = (sttData.text || sttData.transcript || '').trim();
      setIsTranscribing(false);

      if (!text) return;
      await sendTextToChat(text);
    } catch (err) {
      console.error(err);
      setIsTranscribing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <main className="flex flex-col min-h-screen bg-[#0a192f] text-slate-100 font-sans selection:bg-green-500/30">
      <header className="p-5 border-b border-white/10 bg-[#0a192f]/80 backdrop-blur-md sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-green-400 to-blue-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-green-500/20">C</div>
          <span className="font-bold tracking-tight text-xl">CONNECT <span className="text-green-400">HUB</span></span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-[10px] text-green-400 font-bold uppercase tracking-tighter flex items-center gap-1">
            <Zap size={12} />
            NARA • XPRIZE
          </div>
          {currentUser && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-xl">
              <span className="text-xs text-slate-300 font-medium">{currentUser.name || currentUser.email}</span>
              <button onClick={handleLogout} className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </header>

      {step === 'login' && (
        <section className="flex-1 flex flex-col items-center justify-center p-6">
          <LoginPanel onLoginSuccess={handleLoginSuccess} />
        </section>
      )}

      {step === 'history' && (
        <section className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <h2 className="text-2xl font-bold mb-8">Olá, {currentUser?.name || 'Empreendedor'}!</h2>
          <div className="flex flex-col items-center gap-6 w-full max-w-md">

            <button
              onClick={() => {
                if (previousChats.length > 0) {
                  loadChatMessages(currentUser!.email, previousChats[0].chat_id);
                }
              }}
              className="w-full flex items-center justify-between p-5 bg-white/5 border border-white/10 hover:border-green-400/50 rounded-2xl transition-all duration-300"
            >
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-slate-200">Conversa Anterior</span>
                <span className="text-xs text-slate-400">Retome de onde parou</span>
              </div>
              <div className="bg-green-500 text-slate-900 font-bold px-4 py-2 rounded-xl text-sm shadow-lg shadow-green-500/20">
                CONTINUAR
              </div>
            </button>

            <button
              onClick={openPreviousChatsList}
              className="w-full flex items-center justify-between p-5 bg-white/5 border border-white/10 hover:border-blue-400/50 rounded-2xl transition-all duration-300"
            >
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold text-slate-200">Conversas Anteriores</span>
                <span className="text-xs text-slate-400">Veja todos os seus projetos</span>
              </div>
              <div className="bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-lg shadow-blue-500/20 flex items-center gap-2">
                <History size={16} />
                VER TODAS
              </div>
            </button>

            <div className="w-full h-px bg-white/10 my-2"></div>

            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-2 p-4 border border-green-400/30 text-green-400 hover:bg-green-400/10 rounded-2xl transition-all"
            >
              <Plus size={18} />
              <span className="font-bold">INICIAR NOVO PROJETO</span>
            </button>
          </div>
        </section>
      )}

      {step === 'chatlist' && (
        <section className="flex-1 flex flex-col items-center p-6">
          <div className="w-full max-w-2xl">
            <div className="flex items-center gap-3 mb-8">
              <button
                onClick={() => setStep('history')}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-2xl font-bold">Suas Conversas</h2>
            </div>

            {loadingChats && (
              <div className="text-center text-slate-400 py-10">Carregando...</div>
            )}

            {!loadingChats && previousChats.length === 0 && (
              <div className="text-center text-slate-400 py-10">Nenhuma conversa encontrada.</div>
            )}

            <div className="flex flex-col gap-3">
              {previousChats.map((c) => (
                <button
                  key={c.chat_id}
                  onClick={() => currentUser && loadChatMessages(currentUser.email, c.chat_id)}
                  className="w-full text-left p-4 bg-white/5 border border-white/10 hover:border-green-400/50 rounded-2xl transition-all duration-300"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate">
                        {c.preview || 'Nova conversa'}
                      </p>
                      {c.context && (
                        <p className="text-xs text-slate-500 mt-1">{c.context}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0">
                      {formatDate(c.last_active)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={startNewChat}
              className="w-full mt-6 flex items-center justify-center gap-2 p-4 border border-green-400/30 text-green-400 hover:bg-green-400/10 rounded-2xl transition-all"
            >
              <Plus size={18} />
              <span className="font-bold">INICIAR NOVO PROJETO</span>
            </button>
          </div>
        </section>
      )}

      {step === 'welcome' && (
        <section className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="relative mb-10">
            <div className="absolute inset-0 bg-green-400 rounded-full blur-3xl opacity-20 animate-pulse"></div>
            <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-blue-600 rounded-full flex items-center justify-center shadow-2xl relative">
              <Sparkles className="text-white w-10 h-10" />
            </div>
          </div>
          <h1 className="text-3xl md:text-5xl font-light mb-4 leading-tight">
            Sua ideia merece uma <br />
            <span className="font-bold text-green-400 drop-shadow-sm">estrategista de verdade</span>
          </h1>
          <p className="text-blue-100/60 max-w-lg mb-10 text-lg leading-relaxed">
            A NARA é sua <strong className="text-white">sócia de negócios</strong>. Ela escuta, questiona e conecta você com soluções reais.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-5xl">
            {options.map((opt) => (
              <button key={opt.id} onClick={() => handleStart(opt)} className="group flex items-center justify-between p-4 bg-white/5 hover:bg-green-500/10 border border-white/10 hover:border-green-400/50 rounded-2xl transition-all duration-300 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="text-sm font-medium text-slate-200 group-hover:text-white">{opt.label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-green-400 transition-colors" />
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'chat' && (
        <section className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-6 py-8 px-2 scroll-smooth">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${m.role === 'user' ? 'bg-blue-600' : 'bg-green-600'}`}>
                  {m.role === 'user' ? <UserIcon size={20} className="text-white" /> : <Bot size={20} className="text-white" />}
                </div>
                <div className={`max-w-[80%] p-5 rounded-2xl text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600/20 text-blue-50 rounded-tr-none border border-blue-500/20' : 'bg-white/5 text-slate-100 rounded-tl-none border border-white/10'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-green-400 ml-14 font-medium animate-pulse">NARA está analisando...</div>}
            {isTranscribing && <div className="text-xs text-blue-400 ml-14 font-medium animate-pulse">Transcrevendo áudio...</div>}
          </div>

          <div className="p-2 bg-white/5 rounded-3xl border border-white/10 mt-4 flex items-center gap-2 focus-within:border-green-400/50 transition-colors shadow-2xl">
            <input
              className="flex-1 bg-transparent outline-none text-sm px-4 py-3 placeholder:text-white/20 text-white"
              placeholder="Descreva seu projeto..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={toggleRecording} disabled={isTranscribing || loading} className={`p-3 rounded-2xl transition-all shadow-lg disabled:opacity-50 ${isRecording ? 'bg-red-500 text-white' : 'bg-white/10 text-white'}`}>
              {isRecording ? <Square size={18} /> : <Mic size={18} />}
            </button>
            <button onClick={sendMessage} disabled={loading || !input.trim()} className="p-3 bg-green-500 rounded-2xl disabled:opacity-50 transition-all text-black">
              <Send size={18} />
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
