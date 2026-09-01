import { NextResponse } from "next/server";
import { matchSponsors } from "@/lib/sponsorDiscovery";

export async function POST(req: Request) {
  const { need } = await req.json();

  if (!need || typeof need !== "string" || !need.trim()) {
    return NextResponse.json(
      { error: "Campo 'need' é obrigatório." },
      { status: 400 }
    );
  }

  try {
    const matches = await matchSponsors(need);
    return NextResponse.json({ matches });
  } catch (err: any) {
    console.error("Erro na rota /api/sponsors:", err.message);
    return NextResponse.json(
      { error: "Não foi possível buscar patrocinadores no momento." },
      { status: 500 }
    );
  }
}
