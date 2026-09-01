import { NextResponse } from "next/server";

function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(req: Request) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ error: "Groq API key não configurada" }, { status: 500 });

  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "Nenhum texto enviado" }, { status: 400 });

    const cleanText = cleanForSpeech(text);

    const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "playai-tts",
        voice: "Celeste-PlayAI",
        input: cleanText,
        response_format: "wav",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq speak error:", errText);
      // fallback voice
      const res2 = await fetch("https://api.groq.com/openai/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({ model: "playai-tts", voice: "Fritz-PlayAI", input: cleanText, response_format: "wav" }),
      });
      if (!res2.ok) return NextResponse.json({ error: "Falha na síntese de voz" }, { status: 500 });
      const buf2 = await res2.arrayBuffer();
      return new NextResponse(buf2, { headers: { "Content-Type": "audio/wav" } });
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, { headers: { "Content-Type": "audio/wav" } });
  } catch (err: any) {
    console.error("Erro no endpoint speak:", err.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
