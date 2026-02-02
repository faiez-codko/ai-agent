import screenshot from 'screenshot-desktop';
import path from 'path';
import fs from 'fs/promises';

export const desktopToolDefinitions = [
    {
        name: "desktop_screenshot",
        description: "Take a screenshot of the desktop/screen. Can capture all screens or a specific display.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Optional name for the file (without extension)." },
                displayId: { type: "string", description: "Optional ID of the display to capture. Use list_displays to find IDs." },
                format: { type: "string", description: "Image format: 'png' or 'jpg' (default: 'png')." }
            },
            required: []
        }
    },
    {
        name: "list_displays",
        description: "List available displays/monitors with their IDs.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    }
];

export const desktopTools = {
    desktop_screenshot: async ({ name, displayId, format }, { agent }) => {
        try {
            const screenshotsDir = path.join(process.cwd(), '.agent', 'screenshots');
            await fs.mkdir(screenshotsDir, { recursive: true });
            
            const ext = format === 'jpg' ? 'jpg' : 'png';
            const filename = name ? `${name}.${ext}` : `desktop_${Date.now()}.${ext}`;
            const filePath = path.join(screenshotsDir, filename);

            const options = { format: ext };
            if (displayId) {
                // Parse displayId to number if it looks like one, as some libs use numbers
                // screenshot-desktop uses IDs from listDisplays
                options.screen = displayId;
            }
            
            // If options.filename is provided, it saves to file.
            options.filename = filePath;

            const savedPath = await screenshot(options);
            return `Desktop screenshot saved to ${savedPath}`;
        } catch (e) {
            return `Error taking desktop screenshot: ${e.message}`;
        }
    },

    list_displays: async ({}, { agent }) => {
        try {
            const displays = await screenshot.listDisplays();
            return displays.map(d => ({
                id: d.id,
                name: d.name,
                width: d.width,
                height: d.height
            }));
        } catch (e) {
            return `Error listing displays: ${e.message}`;
        }
    }
};
