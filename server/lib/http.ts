export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function unauthorized(): Response {
  return jsonError("Unauthorized", 401);
}

export function notFound(): Response {
  return jsonError("Not found", 404);
}
