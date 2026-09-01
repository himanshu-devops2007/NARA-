'use client';
import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

interface LoginPanelProps {
  onLoginSuccess: (user: { name: string; email: string }) => void;
}

export default function LoginPanel({ onLoginSuccess }: LoginPanelProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    // Create a fake email using the phone number for Firebase Auth
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
       setError('Por favor, insira um número de telefone válido.');
       setLoading(false);
       return;
    }
    const phoneEmail = `${cleanPhone}@nara.hub`;

    try {
      let userCredential;
      if (isRegister) {
        if (!name.trim()) throw new Error('Por favor, insira seu nome');
        userCredential = await createUserWithEmailAndPassword(auth, phoneEmail, password);
        await updateProfile(userCredential.user, { displayName: name.trim() });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, phoneEmail, password);
      }
      const user = userCredential.user;
      const userName = user.displayName || name || cleanPhone;
      
      // We pass the phone number as the identifier to the rest of the app
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName, email: cleanPhone }),
      });
      onLoginSuccess({ name: userName, email: cleanPhone });
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Telefone ou senha inválidos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Telefone já cadastrado. Tente fazer login.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setError(err.message || 'Falha na autenticação. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-md">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/20">
          <span className="text-white font-bold text-2xl">N</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {isRegister ? 'Criar Conta' : 'Bem-vindo de volta'}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {isRegister ? 'Cadastre-se para começar e salvar seu progresso' : 'Insira suas credenciais para continuar'}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegister && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Nome</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-green-400 text-sm transition-colors" />
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Telefone</label>
          <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-green-400 text-sm transition-colors" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Senha</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-green-400 text-sm transition-colors" />
        </div>
        {error && (
          <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 py-2 px-3 rounded-lg">{error}</p>
        )}
        <button type="submit" disabled={loading}
          className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-slate-950 font-semibold rounded-xl text-sm transition-all shadow-lg shadow-green-500/20">
          {loading ? 'Processando...' : isRegister ? 'Cadastrar' : 'Entrar'}
        </button>
      </form>
      <div className="mt-6 text-center text-xs text-slate-400">
        {isRegister ? 'Já tem uma conta? ' : 'Não tem uma conta? '}
        <button type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }}
          className="text-green-400 font-semibold hover:underline">
          {isRegister ? 'Entrar' : 'Cadastrar'}
        </button>
      </div>
    </div>
  );
}
