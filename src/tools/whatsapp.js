import { sendWhatsAppMessage } from '../integrations/whatsapp_client.js';

export const whatsappToolDefinitions = [
  {
    name: "whatsapp_send_message",
    description: "Send a WhatsApp message to a specific number. ONLY use this if the user explicitly asks to send a WhatsApp message. Requires WhatsApp integration to be active.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "The phone number to send the message to (e.g., '1234567890'). Country code is recommended."
        },
        message: {
          type: "string",
          description: "The text content of the message."
        }
      },
      required: ["to", "message"]
    }
  }
];

export const whatsappTools = {
  whatsapp_send_message: async ({ to, message }) => {
    try {
      const result = await sendWhatsAppMessage(to, message);
      return result;
    } catch (error) {
      return `Error sending WhatsApp message: ${error.message}`;
    }
  }
};
