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

  if (!sessionId) {
    return NextResponse.json({ chats: [] });
  }

  const result = await pool.query(
    `SELECT
       chat_id,
       MIN(context) FILTER (WHERE context IS NOT NULL) AS context,
       (ARRAY_AGG(content ORDER BY created_at ASC) FILTER (WHERE role = 'user'))[1] AS preview,
       MAX(created_at) AS last_active,
       COUNT(*) AS message_count
     FROM conversations
     WHERE session_id = $1
     GROUP BY chat_id
     ORDER BY last_active DESC`,
    [sessionId]
  );

  return NextResponse.json({ chats: result.rows });
}
