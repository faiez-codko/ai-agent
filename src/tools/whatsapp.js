import { sendWhatsAppMessage, sendWhatsAppMedia } from '../integrations/whatsapp_client.js';

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
  },
  {
    name: "whatsapp_send_media",
    description: "Send a media file (image, video, audio, or document) via WhatsApp. ONLY use this if the user explicitly asks to send a file/image.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "The phone number to send the media to (e.g., '1234567890')."
        },
        mediaPath: {
          type: "string",
          description: "The absolute local file path or public URL of the media file."
        },
        caption: {
          type: "string",
          description: "Optional text caption to accompany the media."
        },
        mediaType: {
          type: "string",
          enum: ["auto", "image", "video", "audio", "document"],
          description: "The type of media. Use 'auto' to infer from file extension. Default is 'auto'."
        }
      },
      required: ["to", "mediaPath"]
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
  },
  whatsapp_send_media: async ({ to, mediaPath, caption, mediaType }) => {
    try {
      return await sendWhatsAppMedia(to, mediaPath, caption, mediaType);
    } catch (error) {
      return `Error sending WhatsApp media: ${error.message}`;
    }
  }
};
