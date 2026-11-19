/**
 * Every glyph the UI draws, from one place: Phosphor Light (the set buungroup.com uses) and Simple Icons for company
 * logos. Never import `react-icons` anywhere else. Integrations, themes and settings sections map to their glyphs here.
 */
import type { IconType } from 'react-icons'
import {
  PiAirplaneLight,
  PiAmazonLogoLight,
  PiBankLight,
  PiBellLight,
  PiBriefcaseLight,
  PiBuildingsLight,
  PiCameraLight,
  PiChartBarLight,
  PiChatCircleLight,
  PiCloudLight,
  PiCodeLight,
  PiGameControllerLight,
  PiGithubLogoLight,
  PiGlobeLight,
  PiGraduationCapLight,
  PiHeartLight,
  PiHouseLight,
  PiLeafLight,
  PiPaletteLight,
  PiReceiptLight,
  PiRocketLight,
  PiShoppingBagLight,
  PiStarLight,
  PiStorefrontLight,
  PiWrenchLight,
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
  PiImageLight as IconImage,
  PiArrowCounterClockwiseLight as IconReset,
  PiSidebarSimpleLight as IconSidebar,
  PiMinusLight as IconMinimize,
  PiSquareLight as IconMaximize,
  PiCopySimpleLight as IconRestore,
  PiCopyLight as IconCopy,
  PiPencilSimpleLight as IconRename,
  PiCaretDownLight as IconCaretDown,
  PiEnvelopeOpenLight as IconMarkRead,
} from 'react-icons/pi'

/**
 * The glyphs a workspace or folder can wear, by the key the routing file uses (`icon = "briefcase"`). A new one is
 * added here and in the comment at the top of `config/workspaces.example.toml`.
 */
export const WORKSPACE_GLYPHS = {
  briefcase: PiBriefcaseLight,
  buildings: PiBuildingsLight,
  storefront: PiStorefrontLight,
  code: PiCodeLight,
  house: PiHouseLight,
  heart: PiHeartLight,
  rocket: PiRocketLight,
  palette: PiPaletteLight,
  globe: PiGlobeLight,
  leaf: PiLeafLight,
  camera: PiCameraLight,
  bag: PiShoppingBagLight,
  wrench: PiWrenchLight,
  game: PiGameControllerLight,
  cap: PiGraduationCapLight,
  plane: PiAirplaneLight,
  receipt: PiReceiptLight,
  bank: PiBankLight,
  chart: PiChartBarLight,
  cloud: PiCloudLight,
  github: PiGithubLogoLight,
  bell: PiBellLight,
  star: PiStarLight,
  chat: PiChatCircleLight,
} as const satisfies Record<string, IconType>

export type WorkspaceGlyph = keyof typeof WORKSPACE_GLYPHS

/** True when a key names a glyph in `WORKSPACE_GLYPHS`. */
export function isWorkspaceGlyph(key: string | null | undefined): key is WorkspaceGlyph {
  return key !== null && key !== undefined && Object.hasOwn(WORKSPACE_GLYPHS, key)
}

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
