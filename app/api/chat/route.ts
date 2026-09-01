import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { matchSponsors, getWebSponsors } from "@/lib/sponsorDiscovery";

const pool = new Pool({
  host: process.env.PGHOST || "nara-postgres",
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || "nara_user",
  password: process.env.PGPASSWORD || "",
  database: process.env.PGDATABASE || "nara_db",
});

async function loadHistory(chatId: string, limit = 8) {
  const result = await pool.query(
    `SELECT role, content FROM conversations WHERE chat_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [chatId, limit]
  );
  return result.rows.reverse();
}

async function saveMessage(sessionId: string, chatId: string, role: string, content: string, context?: string) {
  await pool.query(
    `INSERT INTO conversations (session_id, chat_id, role, content, context) VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, chatId, role, content, context || null]
  );
}

async function detectSponsorNeed(lastMessage: string, history: string): Promise<string | null> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;
  const detectPrompt = `Analise a mensagem do usuário abaixo. Ele descreveu uma necessidade CONCRETA e específica que poderia ser conectada a um patrocinador?
HISTÓRICO: ${history}
ÚLTIMA MENSAGEM: "${lastMessage}"
Responda APENAS com JSON: { "hasNeed": true ou false, "searchQuery": "resumo ou null" }`;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: detectPrompt }], max_tokens: 200, temperature: 0.1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return parsed.hasNeed && parsed.searchQuery ? parsed.searchQuery : null;
  } catch { return null; }
}

export async function POST(req: Request) {
  const { messages, context, sessionId, chatId } = await req.json();
  const currentSessionId = sessionId || "default-session";
  const currentChatId = chatId || `${currentSessionId}-legacy`;
  const lastMessage = messages[messages.length - 1]?.content || "";

  await saveMessage(currentSessionId, currentChatId, "user", lastMessage, context);
  const dbHistory = await loadHistory(currentChatId, 8);
  const history = dbHistory.map((m: any) => `${m.role === "user" ? "USUÁRIO" : "NARA"}: ${m.content}`).join("\n\n");
  const messageCount = dbHistory.filter((m: any) => m.role === "user").length;

  const systemPrompt = `Você é a NARA, uma mentora amigável, paciente e prática para projetos sociais e desenvolvimento rural (Connect Hub).

REGRAS OBRIGATÓRIAS (SIGA ESTRITAMENTE):
1. Faça APENAS UMA pergunta por vez. NUNCA faça duas ou mais perguntas na mesma mensagem. Espere o usuário responder antes de avançar.
2. Seja concisa e direta. Use português simples e acessível para produtores rurais e jovens.
3. NUNCA diga "eu só posso responder por texto" ou algo parecido. O sistema lerá suas respostas em voz alta automaticamente.
4. Se o usuário pedir uma resposta direta ou uma lista, forneça imediatamente sem fazer mais perguntas.
5. Seja acolhedora, humana e valide a resposta do usuário antes de dar o próximo passo.

CONTEXTO: ${context || "Primeira conversa"}
MENSAGENS: ${messageCount}
HISTÓRICO:\n${history}
ÚLTIMA MENSAGEM: "${lastMessage}"
Responda em português brasileiro de forma natural:`;

  async function tryGroq(): Promise<string> {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error("Groq key missing");
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Você é a NARA, assistente brasileira acolhedora do Connect Hub. Responda sempre em português do Brasil e siga as regras do prompt." },
          { role: "user", content: systemPrompt }
        ],
        max_tokens: 1024, temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`Groq error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async function tryGemini(): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini key missing");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });
    const result = await model.generateContent(systemPrompt);
    return result.response.text();
  }

  async function tryOpenAI(): Promise<string> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error("OpenAI key missing");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages: [{ role: "user", content: systemPrompt }], max_tokens: 1024, temperature: 0.7 }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async function tryClaude(): Promise<string> {
    const claudeKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeKey) throw new Error("Claude key missing");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": claudeKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: 1024, messages: [{ role: "user", content: systemPrompt }] }),
    });
    if (!res.ok) throw new Error(`Claude error: ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || "";
  }

  const providers = [
    { name: "groq", fn: tryGroq },
    { name: "gemini", fn: tryGemini },
    { name: "openai", fn: tryOpenAI },
    { name: "claude", fn: tryClaude },
  ];

  for (const provider of providers) {
    try {
      const text = await provider.fn();
      if (text) {
        let sponsorSuggestion: any = null;
        try {
          const searchQuery = await detectSponsorNeed(lastMessage, history);
          if (searchQuery) {
            const [matches, webResults] = await Promise.all([matchSponsors(searchQuery), getWebSponsors(searchQuery, 5)]);
            sponsorSuggestion = { dbMatches: matches.filter((m) => m.matchScore >= 50), webResults };
          }
        } catch (e: any) { console.error("Sponsor error:", e.message); }
        await saveMessage(currentSessionId, currentChatId, "assistant", text, context);
        return NextResponse.json({ text, provider: provider.name, sponsorSuggestion });
      }
    } catch (err: any) {
      console.error(`${provider.name} failed:`, err.message);
    }
  }

  const fallback = "Estou processando. Pode me contar mais sobre seu projeto?";
  await saveMessage(currentSessionId, currentChatId, "assistant", fallback, context);
  return NextResponse.json({ text: fallback }, { status: 500 });
}
