import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return NextResponse.json({ error: "Groq API key não configurada" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "Nenhum áudio enviado" }, { status: 400 });
    }

    const groqFormData = new FormData();
    groqFormData.append("file", audioFile, "audio.webm");
    groqFormData.append("model", "whisper-large-v3-turbo");
    groqFormData.append("language", "pt");
    groqFormData.append("prompt", "Nara, Connect Hub, agricultura, café, banana, Amazônia, Rondônia, Ariquemes");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: groqFormData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq transcribe error:", errText);
      return NextResponse.json({ error: "Falha na transcrição" }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text });
  } catch (err: any) {
    console.error("Erro no endpoint transcribe:", err.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
