import chalk from 'chalk';
import { setupWhatsApp } from './whatsapp.js';
import { setupTelegram } from './telegram.js';

const INTEGRATIONS = {
    'whatsapp': {
        name: 'WhatsApp',
        description: 'Chat with the agent via WhatsApp using Baileys',
        setup: setupWhatsApp
    },
    'telegram': {
        name: 'Telegram',
        description: 'Chat with the agent via Telegram Bot',
        setup: setupTelegram
    }
};

export function listIntegrations() {
    console.log(chalk.bold('\nAvailable Integrations:\n'));
    Object.keys(INTEGRATIONS).forEach(key => {
        const integration = INTEGRATIONS[key];
        console.log(`${chalk.green(key)}: ${integration.name} - ${integration.description}`);
    });
    console.log('\n');
}

export async function setupIntegration(name) {
    const integration = INTEGRATIONS[name.toLowerCase()];
    if (!integration) {
        console.error(chalk.red(`Integration '${name}' not found.`));
        console.log('Available integrations:');
        listIntegrations();
        return;
    }

    try {
        await integration.setup();
    } catch (error) {
        console.error(chalk.red(`Failed to setup ${integration.name}:`), error);
    }
}
