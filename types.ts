export enum Mood {
  LOVE = 'Apaixonado',
  JEALOUS = 'Ciumento',
  SARCASTIC = 'Sarcástico',
  FUNNY = 'Engraçado',
  DRAMATIC = 'Dramático',
  INTELLECTUAL = 'Intelectual',
  COUNSELOR = 'Conselheiro',
  COLD = 'Frio/Distante',
  CHAOTIC = 'Caótico'
}

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export enum Accent {
  PAULISTA = 'Paulista',
  CARIOCA = 'Carioca',
  BAIANO = 'Baiano',
  MINEIRO = 'Mineiro',
  GAUCHO = 'Gaúcho',
  CEARENSE = 'Cearense',
  PERNAMBUCANO = 'Pernambucano',
  MANAUARA = 'Manauara',
  NEUTRO = 'Neutro'
}

export const ACCENT_META: Record<Accent, { label: string; flagUrl: string; desc: string }> = {
  [Accent.PAULISTA]: { label: 'São Paulo', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2b/Bandeira_do_estado_de_S%C3%A3o_Paulo.svg', desc: '"Meu", "Mano", gírias urbanas.' },
  [Accent.CARIOCA]: { label: 'Rio de Janeiro', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/73/Bandeira_do_estado_do_Rio_de_Janeiro.svg', desc: 'Sotaque chiado, "Mermão".' },
  [Accent.BAIANO]: { label: 'Bahia', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/28/Bandeira_da_Bahia.svg', desc: 'Ritmo cantado, "Oxe", "Pai".' },
  [Accent.MINEIRO]: { label: 'Minas Gerais', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Bandeira_de_Minas_Gerais.svg', desc: '"Uai", "Trem", diminutivos.' },
  [Accent.GAUCHO]: { label: 'Rio Grande do Sul', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/63/Bandeira_do_Rio_Grande_do_Sul.svg', desc: '"Bah", "Tchê", conjugação tu.' },
  [Accent.CEARENSE]: { label: 'Ceará', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/2e/Bandeira_do_Cear%C3%A1.svg', desc: '"Macho", "Arretado".' },
  [Accent.PERNAMBUCANO]: { label: 'Pernambuco', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/59/Bandeira_de_Pernambuco.svg', desc: 'Sotaque forte e rápido.' },
  [Accent.MANAUARA]: { label: 'Amazonas', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/Bandeira_do_Amazonas.svg', desc: '"Mano", "Chibata".' },
  [Accent.NEUTRO]: { label: 'Padrão', flagUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Brazil.svg', desc: 'Português padrão.' },
};

export enum CallbackIntensity {
  LOW = 'Baixa (Independente)',
  MEDIUM = 'Média (Atencioso)',
  HIGH = 'Alta (Obsessivo/Grudento)'
}

export type Theme = 'dark' | 'light';

export interface CallLog {
  id: string;
  timestamp: number;
  durationSec: number;
  moodEnd: Mood;
  notes: string; // Summary of what happened
}

export interface ScheduledCall {
  triggerTime: number; // Timestamp when call should happen
  reason: string; // "Lembrete: Acordar" or "Random: Saudades"
  isRandom: boolean;
}

export enum PlatformLanguage {
  PT = 'Português',
  EN = 'English',
  ES = 'Español',
  FR = 'Français',
  IT = 'Italiano',
  DE = 'Deutsch',
  JP = '日本語',
  ZH = '中文',
  KO = '한국어',
  AR = 'العربية'
}

export const LANGUAGE_META: Record<PlatformLanguage, { label: string, flag: string }> = {
  [PlatformLanguage.PT]: { label: 'Português', flag: '🇧🇷' },
  [PlatformLanguage.EN]: { label: 'English', flag: '🇺🇸' },
  [PlatformLanguage.ES]: { label: 'Español', flag: '🇪🇸' },
  [PlatformLanguage.FR]: { label: 'Français', flag: '🇫🇷' },
  [PlatformLanguage.IT]: { label: 'Italiano', flag: '🇮🇹' },
  [PlatformLanguage.DE]: { label: 'Deutsch', flag: '🇩🇪' },
  [PlatformLanguage.JP]: { label: '日本語', flag: '🇯🇵' },
  [PlatformLanguage.ZH]: { label: '中文', flag: '🇨🇳' },
  [PlatformLanguage.KO]: { label: '한국어', flag: '🇰🇷' },
  [PlatformLanguage.AR]: { label: 'العربية', flag: '🇸🇦' },
};

export interface PartnerProfile {
  name: string;
  image: string | null;
  personality: string;
  dailyContext: string; // Used for "memory" context
  mood: Mood;
  voice: VoiceName;
  accent: Accent;
  intensity: CallbackIntensity;
  theme: Theme;
  relationshipScore: number; // 0 to 100
  history: CallLog[];
  language: PlatformLanguage;
  gender: string;
  sexuality: string;
  bestFriend: string;
  originalPartnerId: string;
  originalPartnerNumber: string;
  originalPartnerNickname: string;
  currentPartnerId: string;
  currentPartnerNumber: string;
  currentPartnerNickname: string;
  isAiReceptionistEnabled?: boolean;
  ai_number?: string;
  relationshipStartedAt?: string | null;
  relationshipEndedAt?: string | null;
  gemini_api_key?: string;
  captionsEnabled?: boolean;
  captionLanguage?: PlatformLanguage;
  callerInfo?: {
    id: string;
    name: string;
    isPartner: boolean;
    isContact?: boolean;
  };
}

export const VOICE_META: Record<VoiceName, { gender: 'Male' | 'Female', label: string }> = {
  [VoiceName.Puck]: { gender: 'Male', label: 'Masculino (Suave)' },
  [VoiceName.Charon]: { gender: 'Male', label: 'Masculino (Grave)' },
  [VoiceName.Fenrir]: { gender: 'Male', label: 'Masculino (Intenso)' },
  [VoiceName.Kore]: { gender: 'Female', label: 'Feminino (Suave)' },
  [VoiceName.Zephyr]: { gender: 'Female', label: 'Feminino (Calma)' },
};

export const MOOD_EMOJIS: Record<Mood, string> = {
  [Mood.LOVE]: '😍',
  [Mood.JEALOUS]: '😠',
  [Mood.SARCASTIC]: '🙄',
  [Mood.FUNNY]: '😂',
  [Mood.DRAMATIC]: '🎭',
  [Mood.INTELLECTUAL]: '🤓',
  [Mood.COUNSELOR]: '🐻',
  [Mood.COLD]: '❄️',
  [Mood.CHAOTIC]: '🤪'
};

export interface UserProfile {
  id: string;
  display_name: string;
  personal_number: string;
  ai_number: string;
  avatar_url: string | null;
  ai_settings: Partial<PartnerProfile>;
  nickname?: string;
  is_searchable?: boolean;
  blocked_users?: string[];
}

export interface Contact {
  id: string;
  owner_id: string;
  target_id: string;
  is_ai_contact: boolean;
  alias: string | null;
  profile?: UserProfile;
}

export interface Reminder {
  id: string;
  owner_id: string;
  title: string;
  trigger_at: string; // ISO string
  is_completed: boolean;
  created_at: string;
  creator_ai_id?: string | null;
  creator_ai_name?: string | null;
  creator_ai_number?: string | null;
}
