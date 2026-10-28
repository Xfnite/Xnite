import dotenv from "dotenv";
dotenv.config();

export async function sendSlackMessage(text) {
  const webhookUrl = process.env.SLACK_ERROR_WEBHOOK;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[Server] ${text}` }),
    });
  } catch (err) {
    console.error("Failed to send Slack message:", err.message);
  }
}
