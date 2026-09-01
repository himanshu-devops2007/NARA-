import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PGHOST || "nara-postgres",
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || "nara_user",
  password: process.env.PGPASSWORD || "",
  database: process.env.PGDATABASE || "nara_db",
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const chatId = searchParams.get("chatId");

  if (!sessionId) {
    return NextResponse.json({ messages: [] });
  }

  if (chatId) {
    const result = await pool.query(
      `SELECT role, content FROM conversations WHERE session_id = $1 AND chat_id = $2 ORDER BY created_at ASC`,
      [sessionId, chatId]
    );
    return NextResponse.json({ messages: result.rows });
  }

  const result = await pool.query(
    `SELECT role, content FROM conversations WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return NextResponse.json({ messages: result.rows });
}
