import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.PGHOST || "nara-postgres",
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || "nara_user",
  password: process.env.PGPASSWORD || "",
  database: process.env.PGDATABASE || "nara_db",
});

export async function POST(req: Request) {
  try {
    const { name, email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check or insert user based on email (phone field or column reused)
    const result = await pool.query(
      `INSERT INTO users (name, phone) 
       VALUES ($1, $2) 
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name 
       RETURNING *`,
      [name || email.split('@')[0], email]
    );

    return NextResponse.json({ success: true, user: result.rows[0] });
  } catch (error: any) {
    console.error("Auth backend error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
