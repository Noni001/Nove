module.exports = function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      name: "NovaVest API",
      status: "online",
      backend: "Supabase"
    });
  }
  return res.status(405).json({ error: "Method not allowed" });
};
