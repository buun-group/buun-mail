/**
 * Every glyph the UI draws, from one place: Phosphor Light (the set buungroup.com uses) and Simple Icons for company
 * logos. Never import `react-icons` anywhere else. Integrations, themes and settings sections map to their glyphs here.
 */
import type { IconType } from 'react-icons'
import {
  PiAirplaneLight,
  PiBellLight,
  PiAmazonLogoLight,
  PiBankLight,
  PiBriefcaseLight,
  PiBuildingsLight,
  PiCameraLight,
  PiChartBarLight,
  PiChatCircleLight,
  PiCloudArrowDownLight,
  PiCloudLight,
  PiCodeLight,
  PiFunnelLight,
  PiRobotLight,
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
  PiBracketsCurlyLight,
  PiFileTxtLight,
  PiTableLight,
  PiCalendarDotLight,
  PiCalendarDotsLight,
  PiCalendarLight,
  PiClockCounterClockwiseLight,
  PiAtLight,
  PiHourglassLight,
  PiRectangleLight,
  PiSquareSplitHorizontalLight,
} from 'react-icons/pi'
import { SiBrevo, SiClaude, SiCloudflare, SiCursor, SiGmail, SiIcloud, SiMailgun, SiModelcontextprotocol, SiProtonmail, SiResend, SiSparkpost, SiZoho } from 'react-icons/si'

import type { AgentClientId } from './constants/agents'
import type { IntegrationId } from './constants/integrations'
import type { Density, ExportFormat, JumpId, ReadingPane, SettingsSection, ThemePreference } from './constants/ui'

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
  PiBellLight as IconBell,
  PiTagLight as IconTag,
  PiPlusLight as IconAdd,
  PiTrashLight as IconDelete,
  PiPlayLight as IconRun,
  PiEyeLight as IconShow,
  PiEyeSlashLight as IconHide,
  PiArrowsClockwiseLight as IconRegenerate,
  PiBellSlashLight as IconBellOff,
  PiMinusLight as IconMinimize,
  PiSquareLight as IconMaximize,
  PiCopySimpleLight as IconRestore,
  PiCopyLight as IconCopy,
  PiPencilSimpleLight as IconRename,
  PiCaretDownLight as IconCaretDown,
  PiCaretUpLight as IconCaretUp,
  PiCheckLight as IconCheck,
  PiStarLight as IconStar,
  PiAddressBookLight as IconContacts,
  PiAlarmLight as IconSnooze,
  PiCalendarBlankLight as IconCalendar,
  PiChatsLight as IconConversation,
  PiShareFatLight as IconForward,
  PiPaperclipLight as IconAttachment,
  PiFilePdfLight as IconFilePdf,
  PiFileImageLight as IconFileImage,
  PiFileZipLight as IconFileZip,
  PiFileLight as IconFile,
  PiCalendarBlankLight as IconCalendarFile,
  PiShieldCheckLight as IconShield,
  PiGlobeLight as IconGlobe,
  PiArrowBendDoubleUpLeftLight as IconReplyAll,
  PiExportLight as IconExport,
  PiArrowDownLight as IconJump,
  PiFunnelSimpleLight as IconFilter,
  PiArrowLeftLight as IconBack,
  PiTextAaLight as IconText,
  PiCheckCircleLight as IconDone,
  PiInfoLight as IconInfo,
  PiWarningCircleLight as IconProblem,
  PiEnvelopeSimpleFill as IconUnread,
  PiBellRingingLight as IconBellRinging,
  PiStarFill as IconStarred,
  PiArrowUUpLeftLight as IconPutBack,
  PiArrowsLeftRightLight as IconMove,
  PiEnvelopeOpenLight as IconMarkRead,
  PiAtLight as IconAt,
  PiTimerLight as IconTimer,
  PiFireLight as IconBurn,
  PiClockClockwiseLight as IconExtend,
  PiKeyLight as IconCode,
  PiLinkSimpleLight as IconLink,
  PiGaugeLight as IconGauge,
  PiXLight as IconCheckFail,
  PiQuestionLight as IconCheckUnclear,
  PiMinusLight as IconCheckNone,
  PiDatabaseLight as IconSize,
  PiPlusCircleLight as IconNewInbox,
  PiArrowsClockwiseLight as IconRequests,
  PiTrayLight as IconInboxes,
  PiHourglassMediumLight as IconLifetime,
  PiTextAaLight as IconName,
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
  at: PiAtLight,
} as const satisfies Record<string, IconType>

export type WorkspaceGlyph = keyof typeof WORKSPACE_GLYPHS

/** True when a key names a glyph in `WORKSPACE_GLYPHS`. */
export function isWorkspaceGlyph(key: string | null | undefined): key is WorkspaceGlyph {
  return key !== null && key !== undefined && Object.hasOwn(WORKSPACE_GLYPHS, key)
}

/** Company logos where Simple Icons has one; Phosphor where it does not (Outlook, SES) or there is no company. */
export const INTEGRATION_GLYPHS: Record<IntegrationId, IconType> = {
  gateway: PiCloudArrowDownLight,
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
  dissolve: PiAtLight,
}

export const THEME_GLYPHS: Record<ThemePreference, IconType> = { system: PiDesktopLight, light: PiSunLight, dark: PiMoonLight }

export const DENSITY_GLYPHS: Record<Density, IconType> = { comfortable: PiRowsLight, compact: PiListLight }

/** Jump to's dates: today's dot, a step back, a week of days, a month, and the long view of a year. */
export const JUMP_GLYPHS: Record<JumpId, IconType> = {
  today: PiCalendarDotLight,
  yesterday: PiClockCounterClockwiseLight,
  lastWeek: PiCalendarDotsLight,
  lastMonth: PiCalendarLight,
  lastYear: PiHourglassLight,
}

/** Export formats: the original envelope, JSON's braces, a CSV table, a text file, and a stack for an mbox. */
export const EXPORT_GLYPHS: Record<ExportFormat, IconType> = {
  eml: PiEnvelopeSimpleLight,
  json: PiBracketsCurlyLight,
  csv: PiTableLight,
  text: PiFileTxtLight,
  mbox: PiStackSimpleLight,
}

export const READING_PANE_GLYPHS: Record<ReadingPane, IconType> = { right: PiSquareSplitHorizontalLight, off: PiRectangleLight }

export const SECTION_GLYPHS: Record<SettingsSection, IconType> = {
  general: PiGearSixLight,
  notifications: PiBellLight,
  workspaces: PiStackSimpleLight,
  rules: PiFunnelLight,
  integrations: PiPlugsConnectedLight,
  agents: PiRobotLight,
}

/** Agent clients by their own logos. VS Code has no Simple Icons mark, so it takes the code glyph. */
export const AGENT_CLIENT_GLYPHS: Record<AgentClientId, IconType> = { claude: SiClaude, cursor: SiCursor, vscode: PiCodeLight, any: SiModelcontextprotocol }
