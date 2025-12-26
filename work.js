export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({ status: "backend ativo" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Método não permitido", { status: 405 });
  }
}