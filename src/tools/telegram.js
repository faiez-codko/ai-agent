import 'dotenv/config'

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;



export async function sendMessage(text) {

    if (!BOT_TOKEN || !CHAT_ID) {
        // console.error("Telegram bot token or chat ID not set in environment variables.", text);
        return;
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const body = {
        chat_id: CHAT_ID,
        text: text,
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        if (!data.ok) {
            return data.description
        } else {
            return data.result.text;
        }
    } catch (error) {
    
    }
}
