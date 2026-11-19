/**
 * Every glyph the UI draws, from one place: Phosphor Light (the set buungroup.com uses) and Simple Icons for brand
 * marks. Never import `react-icons` anywhere else. Integrations map to their glyph in `INTEGRATION_GLYPHS`.
 */
import type { IconType } from 'react-icons'
import { PiEnvelopeSimpleLight, PiMicrosoftOutlookLogoLight, PiTrayArrowDownLight } from 'react-icons/pi'
import { SiCloudflare, SiGmail, SiIcloud, SiProtonmail } from 'react-icons/si'

import type { IntegrationId } from './constants/integrations'

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
} from 'react-icons/pi'

export const INTEGRATION_GLYPHS: Record<IntegrationId, IconType> = {
  cloudflare: SiCloudflare,
  gmail: SiGmail,
  outlook: PiMicrosoftOutlookLogoLight,
  proton: SiProtonmail,
  icloud: SiIcloud,
  imap: PiEnvelopeSimpleLight,
  file: PiTrayArrowDownLight,
}
