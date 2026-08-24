import { getCoreHealth } from "../../../../lib/open5gs/health";

export async function GET() {
  const health = await getCoreHealth();
  return Response.json(health, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
