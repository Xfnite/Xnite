export async function sendSlackMessage(text: string) {
  const webhookUrl = process.env.SLACK_ERROR_WEBHOOK;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[${process.env.NEXT_PUBLIC_APP_ENV || "production"}] ${text}` }),
    });
  } catch (err: any) {
    console.error("Failed to send Slack message:", err.message);
  }
}
