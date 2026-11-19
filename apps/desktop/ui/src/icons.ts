/**
 * Every glyph the UI draws, from one place: Phosphor Light (the set buungroup.com uses) and Simple Icons for company
 * logos. Never import `react-icons` anywhere else. Integrations, themes and settings sections map to their glyphs here.
 */
import type { IconType } from 'react-icons'
import {
  PiAmazonLogoLight,
  PiDesktopLight,
  PiEnvelopeSimpleLight,
  PiGearSixLight,
  PiMicrosoftOutlookLogoLight,
  PiMoonLight,
  PiPaperPlaneTiltLight,
  PiPlugsConnectedLight,
  PiRowsLight,
  PiStackSimpleLight,
  PiSunLight,
  PiTrayArrowDownLight,
  PiListLight,
} from 'react-icons/pi'
import { SiBrevo, SiCloudflare, SiGmail, SiIcloud, SiMailgun, SiProtonmail, SiResend, SiSparkpost, SiZoho } from 'react-icons/si'

import type { IntegrationId } from './constants/integrations'
import type { Density, SettingsSection, ThemePreference } from './constants/ui'

export {
  PiArchiveLight as IconArchive,
  PiArrowBendUpLeftLight as IconReply,
  PiArrowUpRightLight as IconExternal,
  PiArrowsSplitLight as IconRoute,
  PiCaretRightLight as IconCaret,
  PiEnvelopeSimpleLight as IconInbox,
  PiFolderSimpleLight as IconFolder,
  PiGearSixLight as IconSettings,
  PiMagnifyingGlassLight as IconSearch,
  PiPencilSimpleLineLight as IconCompose,
  PiTrayLight as IconUnsorted,
  PiXLight as IconClose,
  PiTrayArrowDownLight as IconReceive,
  PiPaperPlaneTiltLight as IconSend,
} from 'react-icons/pi'

/** Company logos where Simple Icons has one; Phosphor where it does not (Outlook, SES) or there is no company. */
export const INTEGRATION_GLYPHS: Record<IntegrationId, IconType> = {
  cloudflare: SiCloudflare,
  gmail: SiGmail,
  outlook: PiMicrosoftOutlookLogoLight,
  proton: SiProtonmail,
  icloud: SiIcloud,
  zoho: SiZoho,
  imap: PiEnvelopeSimpleLight,
  file: PiTrayArrowDownLight,
  resend: SiResend,
  ses: PiAmazonLogoLight,
  mailgun: SiMailgun,
  brevo: SiBrevo,
  sparkpost: SiSparkpost,
  smtp: PiPaperPlaneTiltLight,
}

export const THEME_GLYPHS: Record<ThemePreference, IconType> = { system: PiDesktopLight, light: PiSunLight, dark: PiMoonLight }

export const DENSITY_GLYPHS: Record<Density, IconType> = { comfortable: PiRowsLight, compact: PiListLight }

export const SECTION_GLYPHS: Record<SettingsSection, IconType> = { general: PiGearSixLight, workspaces: PiStackSimpleLight, integrations: PiPlugsConnectedLight }
