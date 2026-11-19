/**
 * Every string the app shows, by language and namespace. Namespaces follow the app's areas so a translator works one
 * screen at a time. Bundled, not fetched: the app works offline and starts in its language on the first frame.
 */
import agents from '../locales/en/agents.json'
import common from '../locales/en/common.json'
import integrations from '../locales/en/integrations.json'
import mail from '../locales/en/mail.json'
import notifications from '../locales/en/notifications.json'
import products from '../locales/en/products.json'
import rules from '../locales/en/rules.json'
import settings from '../locales/en/settings.json'
import sidebar from '../locales/en/sidebar.json'

export const NAMESPACES = ['common', 'sidebar', 'mail', 'settings', 'notifications', 'rules', 'integrations', 'agents', 'products'] as const

export const resources = {
  en: { common, sidebar, mail, settings, notifications, rules, integrations, agents, products },
} as const
