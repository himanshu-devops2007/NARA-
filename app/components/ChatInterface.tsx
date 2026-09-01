'use client'

import { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: `Olá! Que bom ter você aqui na CONNECT HUB. ✨\n\nEu sou a NARA, sua recepcionista e mentora neste ecossistema. Meu trabalho é simples: garantir que nenhum talento fique invisível e nenhuma boa ideia fique sem apoio.\n\nMe conta: o que te trouxe aqui hoje? Estou aqui para ouvir.`
}

// Get or create a persistent session ID stored in the browser
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server-side'
  const existing = localStorage.getItem('nara_session_id')
  if (existing) return existing
  const newId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
  localStorage.setItem('nara_session_id', newId)
  return newId
}

// Priority 2: Text-to-Speech Auto-Play Function
const speakText = (text: string) => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  
  // Cancel any ongoing audio to prevent overlapping speech
  window.speechSynthesis.cancel();
  
  // Strip markdown formatting characters so they are not read aloud
  const cleanText = text.replace(/[*#_`>]/g, "").trim();
  
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = "pt-BR"; // Forces Brazilian Portuguese
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  window.speechSynthesis.speak(utterance);
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string>('')

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    const sid = getSessionId()
    sessionIdRef.current = sid

    fetch(`/api/history?sessionId=${encodeURIComponent(sid)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
        }
      })
      .catch((err) => {
        console.error('Failed to load chat history:', err)
      })
      .finally(() => {
        setIsHistoryLoading(false)
      })
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  const sendToChat = async (text: string): Promise<string | null> => {
    const userMessage: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          sessionId: sessionIdRef.current
        })
      })

      if (!response.ok) {
        throw new Error('Erro na comunicação')
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.text }])
      
      // AUTO-PLAY VOICE: Trigger TTS whenever NARA responds
      speakText(data.text);
      
      return data.text as string
    } catch (err: any) {
      setError('Estou refletindo sobre sua ideia... Poderia repetir? Às vezes a conexão dá uma travadinha.')
      console.error(err)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading) return
    const text = input.trim()
    setInput('')
    await sendToChat(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const startRecording = async () => {
    if (isRecording || isTranscribing || isLoading) return
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await handleVoiceInput(blob)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error(err)
      setError('Não consegui acessar o microfone. Verifique as permissões.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleVoiceInput = async (blob: Blob) => {
    try {
      setIsTranscribing(true)
      const formData = new FormData()
      formData.append('audio', blob, 'input.webm')

      const sttRes = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData
      })
      if (!sttRes.ok) throw new Error('Falha na transcrição')
      const sttData = await sttRes.json()
      const text = (sttData.text || sttData.transcript || '').trim()
      setIsTranscribing(false)

      if (!text) {
        setError('Não consegui entender o áudio. Pode tentar de novo?')
        return
      }

      await sendToChat(text)
    } catch (err) {
      console.error(err)
      setError('Algo deu errado com o áudio. Tente novamente.')
    } finally {
      setIsTranscribing(false)
    }
  }

  const quickReplies = [
    'Tenho um projeto social',
    'Sou gestor público',
    'Quero investir',
    'Sou agricultor',
    'Preciso de mentoria'
  ]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      maxWidth: '800px',
      margin: '0 auto',
      background: 'rgba(10, 22, 40, 0.6)',
      backdropFilter: 'blur(20px)',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      borderRight: '1px solid rgba(255,255,255,0.08)'
    }}>
      <header style={{
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        background: 'rgba(10, 22, 40, 0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          fontWeight: 600,
          color: '#fff',
          boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
        }}>N</div>
        <div>
          <h1 style={{ fontSize: '17px', fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '0.3px' }}>NARA</h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0, marginTop: '2px' }}>Recepcionista & Mentora · CONNECT HUB</p>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column' }}>
        {isHistoryLoading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '16px' }}>Carregando conversa anterior...</div>}
        {messages.map((msg, index) => <MessageBubble key={index} message={msg} />)}
        {isLoading && <TypingIndicator />}
        {isTranscribing && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '16px' }}>Transcrevendo áudio...</div>}
        {error && <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#fca5a5', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 2 && !isLoading && (
        <div style={{ padding: '0 24px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {quickReplies.map((reply, index) => (
            <button
              key={index}
              onClick={() => { setInput(reply); inputRef.current?.focus() }}
              style={{
                padding: '8px 14px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '20px', color: '#93c5fd', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit'
              }}
            >{reply}</button>
          ))}
        </div>
      )}

      <div style={{ padding: '16px 24px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10, 22, 40, 0.8)', backdropFilter: 'blur(12px)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Me conta sua ideia, sonho ou necessidade..."
            rows={1}
            style={{
              flex: 1, padding: '14px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '14px', color: '#e8ecf1', fontSize: '15px', fontFamily: 'inherit', resize: 'none', outline: 'none', minHeight: '48px', maxHeight: '120px'
            }}
          />
          <button
            type="button"
            onClick={toggleRecording}
            disabled={isTranscribing || isLoading}
            style={{
              padding: '12px', background: isRecording ? '#ef4444' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '14px',
              color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '52px', transition: 'all 0.2s'
            }}
          >
            {isTranscribing ? '...' : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
              </svg>
            )}
          </button>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            style={{
              padding: '12px 20px',
              background: input.trim() && !isLoading ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(255,255,255,0.1)',
              border: 'none', borderRadius: '14px', color: '#fff', fontSize: '15px', cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '52px'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '10px' }}>
          A NARA protege seus dados sob a LGPD · CONNECT HUB 2026
        </p>
      </div>
    </div>
  )
}
