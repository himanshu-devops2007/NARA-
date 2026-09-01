/**
 * NARA Stress Test — 10 students, 2 minutes
 * ------------------------------------------
 * Simulates 10 concurrent "students" each sending chat messages
 * to the NARA API over a 2-minute window, with realistic pacing
 * so we don't accidentally slam RPM limits (Gemini 15 RPM / Groq 30 RPM).
 *
 * Usage:
 *   node stress_test.js
 *
 * Config below — change API_URL to your EC2 endpoint.
 */

const API_URL = "http://localhost:3000/api/chat"; // change to http://<ec2-ip>:3000/api/chat if testing remotely

const NUM_STUDENTS = 10;
const TEST_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const MIN_GAP_MS = 4000; // min gap between a student's messages (ms)
const MAX_GAP_MS = 9000; // max gap between a student's messages (ms)

const SAMPLE_MESSAGES = [
  "Oi, quero ajuda com meu projeto de horta comunitária",
  "Eu sou estudante do ensino médio, quero criar um app",
  "Meu problema é falta de acesso à internet na minha região",
  "Já tenho um protótipo, preciso de mentoria técnica",
  "Quero conectar com outros estudantes da minha escola",
  "Como funciona o programa de patrocínio?",
  "Preciso de ajuda para validar minha ideia",
  "Qual é o próximo passo depois de cadastrar o projeto?",
  "Tenho uma dúvida sobre o território de atuação",
  "Pode me explicar melhor o que é o Connect Hub?",
];

let totalRequests = 0;
let totalSuccess = 0;
let totalFailed = 0;
const providerCounts = {};
const errors = [];
const responseTimes = [];

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomMessage() {
  return SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)];
}

async function sendMessage(studentId) {
  const startTime = Date.now();
  totalRequests++;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: randomMessage() }],
        context: `Estudante simulado #${studentId}`,
      }),
    });

    const elapsed = Date.now() - startTime;
    responseTimes.push(elapsed);

    const data = await res.json();

    if (res.ok) {
      totalSuccess++;
      const provider = data.provider || "unknown";
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      console.log(
        `[Student ${studentId}] OK (${elapsed}ms) via ${provider} — "${data.text?.slice(0, 40)}..."`
      );
    } else {
      totalFailed++;
      errors.push({ studentId, status: res.status, body: data });
      console.log(`[Student ${studentId}] FAILED (${res.status}) — ${JSON.stringify(data).slice(0, 100)}`);
    }
  } catch (err) {
    totalFailed++;
    errors.push({ studentId, error: err.message });
    console.log(`[Student ${studentId}] ERROR — ${err.message}`);
  }
}

async function studentLoop(studentId, endTime) {
  while (Date.now() < endTime) {
    await sendMessage(studentId);
    const gap = randomBetween(MIN_GAP_MS, MAX_GAP_MS);
    await new Promise((r) => setTimeout(r, gap));
  }
}

async function runStressTest() {
  console.log(`\n=== NARA Stress Test: ${NUM_STUDENTS} students, ${TEST_DURATION_MS / 1000}s ===\n`);
  console.log(`Target: ${API_URL}`);
  console.log(`Pacing: each student waits ${MIN_GAP_MS / 1000}-${MAX_GAP_MS / 1000}s between messages\n`);

  const startTime = Date.now();
  const endTime = startTime + TEST_DURATION_MS;

  const studentPromises = [];
  for (let i = 1; i <= NUM_STUDENTS; i++) {
    // stagger start slightly so all 10 don't fire in the exact same instant
    const staggerDelay = randomBetween(0, 2000);
    studentPromises.push(
      new Promise((resolve) =>
        setTimeout(() => studentLoop(i, endTime).then(resolve), staggerDelay)
      )
    );
  }

  await Promise.all(studentPromises);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgResponseTime =
    responseTimes.length > 0
      ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(0)
      : 0;

  console.log(`\n=== RESULTS (${totalElapsed}s elapsed) ===`);
  console.log(`Total requests sent: ${totalRequests}`);
  console.log(`Successful: ${totalSuccess}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Avg response time: ${avgResponseTime}ms`);
  console.log(`\nProvider breakdown:`);
  for (const [provider, count] of Object.entries(providerCounts)) {
    console.log(`  ${provider}: ${count}`);
  }

  if (errors.length > 0) {
    console.log(`\nFirst 5 errors:`);
    errors.slice(0, 5).forEach((e) => console.log(`  `, e));
  }
}

runStressTest().catch((err) => {
  console.error("Stress test crashed:", err);
  process.exit(1);
});
