import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { analyzeSessionForRecognition } from '../recognitionService';
import { PartnerProfile, MOOD_EMOJIS, VOICE_META, ACCENT_META, LANGUAGE_META, ScheduledCall } from '../types';
import { supabase } from '../supabaseClient';

interface CallScreenProps {
  profile: PartnerProfile;
  callReason?: string;
  onEndCall: (reason: 'hangup_abrupt' | 'hangup_normal' | 'error', scheduledCall?: ScheduledCall) => void;
  onScoreChange?: (change: number, reason: string) => void;
  apiKey: string;
  user?: any;
}

// Helper types for Audio handling
interface BlobData {
  data: string;
  mimeType: string;
}

const GESTURE_EMOJIS: Record<string, string> = {
  'smile': '😊 Sorriso detectado',
  'anger': '😠 Cara feia detectada',
  'point': '👉 Você apontou!',
  'wink': '😉 Piscadinha',
  'look_away': '👀 Olhando pro lado...'
};

export const CallScreen: React.FC<CallScreenProps> = ({ profile, callReason, onEndCall, onScoreChange, apiKey, user }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gestureFeedback, setGestureFeedback] = useState<string | null>(null);
  const [scheduledCall, setScheduledCall] = useState<ScheduledCall | undefined>(undefined);
  const conversationIdRef = useRef<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState<string>('');
  const captionTimerRef = useRef<number | null>(null);
  const captionBufferRef = useRef<string>('');
  const userCaptionBufferRef = useRef<string>('');
  const pendingTranslateRef = useRef<boolean>(false);

  // Audio Levels for Visualization
  const [micLevel, setMicLevel] = useState(0);
  const [aiLevel, setAiLevel] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const partnerVideoRef = useRef<HTMLDivElement>(null);

  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Analyser Refs
  const userAnalyserRef = useRef<AnalyserNode | null>(null);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const videoIntervalRef = useRef<number | null>(null);

  const isDark = profile.theme === 'dark';

  useEffect(() => {
    startCall();
    startVisualizerLoop();
    return () => stopCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVisualizerLoop = () => {
    const update = () => {
      if (userAnalyserRef.current) {
        const data = new Uint8Array(userAnalyserRef.current.frequencyBinCount);
        userAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b) / data.length;
        setMicLevel(avg);
      }
      if (aiAnalyserRef.current) {
        const data = new Uint8Array(aiAnalyserRef.current.frequencyBinCount);
        aiAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b) / data.length;
        setAiLevel(avg);
        // Fallback: If AI level is high, assume speaking (sometimes isSpeaking state might lag)
        if (avg > 10 && !isSpeaking) setIsSpeaking(true);
        if (avg < 5 && isSpeaking) setIsSpeaking(false);
      }
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const triggerGestureFeedback = (gesture: string) => {
    if (GESTURE_EMOJIS[gesture]) {
      setGestureFeedback(GESTURE_EMOJIS[gesture]);
      setTimeout(() => setGestureFeedback(null), 3000);
      return "ok";
    }
    return "unknown gesture";
  };

  const handleScheduleCallback = async (minutes: number | undefined, reason: string, target_person: string, days?: number, date?: string) => {
    let triggerTime: number;

    if (date) {
      triggerTime = new Date(date).getTime();
      // Validate date
      if (isNaN(triggerTime)) {
        return "Erro: Data inválida fornecida.";
      }
    } else if (days) {
      triggerTime = Date.now() + (days * 24 * 60 * 60 * 1000);
    } else if (minutes) {
      triggerTime = Date.now() + (minutes * 60 * 1000);
    } else {
      triggerTime = Date.now() + (60 * 1000); // Default 1 min
    }

    const newSchedule: ScheduledCall = { triggerTime, reason, isRandom: false };
    setScheduledCall(newSchedule);

    if (user) {
      const targets = target_person === 'both' ? ['owner', 'caller'] : [target_person];

      for (const target of targets) {
        let targetOwnerId = user.id;
        if (target === 'owner') {
          targetOwnerId = profile.originalPartnerId || user.id;
        } else if (target === 'caller') {
          targetOwnerId = profile.callerInfo?.id || user.id;
        }

        await supabase.from('reminders').insert({
          owner_id: targetOwnerId,
          title: reason,
          trigger_at: new Date(triggerTime).toISOString(),
          creator_ai_id: profile.originalPartnerId,
          creator_ai_name: profile.name,
          creator_ai_number: profile.ai_number
        });
      }
    }

    let targetMsg = "";
    if (target_person === 'owner') targetMsg = 'seu dono';
    else if (target_person === 'caller') targetMsg = 'quem está falando';
    else targetMsg = 'ambos';

    const dateStr = new Date(triggerTime).toLocaleString('pt-BR');
    return `Agendado com sucesso para ${dateStr} no calendário de ${targetMsg}.`;
  };

  const handleReportToPartner = async (message: string) => {
    if (!user || profile.callerInfo?.isPartner) return "Ação irrelevante";

    await supabase.from('notifications').insert({
      user_id: user.id, // Target is the owner of the AI
      type: 'contact_added', // Reusing type or creating 'ai_report'
      content: `[RELATÓRIO DE ${profile.name}]: ${message}`
    });

    return "Parceiro notificado com sucesso.";
  };

  const requestAdvice = () => {
    alert("Fale agora: 'Preciso de um conselho' - A IA vai detectar sua entonação.");
  };

  const showCaption = (text: string) => {
    if (!text.trim()) return;
    if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
    setCaptionText(text.trim());
    captionTimerRef.current = window.setTimeout(() => {
      setCaptionText('');
      captionBufferRef.current = '';
    }, 6000);
  };

  // Translate via Gemini generateContent (lightweight text call)
  const translateCaption = async (text: string, targetLang: string) => {
    if (pendingTranslateRef.current || !text.trim()) return;
    pendingTranslateRef.current = true;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Translate to ${targetLang} (reply only with the translation, no extra text): ${text}` }] }],
            generationConfig: { maxOutputTokens: 200, temperature: 0 }
          })
        }
      );
      const json = await res.json();
      const translated = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (translated) showCaption(translated);
    } catch (e) {
      // Fallback: show original if translation fails
      showCaption(text);
    } finally {
      pendingTranslateRef.current = false;
    }
  };

  const startCall = async () => {
    try {
      if (user) {
        const { data } = await supabase.from('conversations').insert({ user_id: user.id, type: 'call' }).select().single();
        if (data) {
          conversationIdRef.current = data.id;
          setCurrentConversationId(data.id);
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480 }
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

      // --- INPUT SETUP ---
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      const userAnalyser = inputAudioContextRef.current.createAnalyser();
      userAnalyser.fftSize = 64; // Small size for simple volume check
      userAnalyser.smoothingTimeConstant = 0.5;
      userAnalyserRef.current = userAnalyser;

      // --- OUTPUT SETUP ---
      outputAudioContextRef.current = new AudioContextClass();
      const aiAnalyser = outputAudioContextRef.current.createAnalyser();
      aiAnalyser.fftSize = 64;
      aiAnalyser.smoothingTimeConstant = 0.5;
      aiAnalyserRef.current = aiAnalyser;

      const outputNode = outputAudioContextRef.current.createGain();
      outputNode.gain.value = 1.0;

      // 1. FETCH MEMORY
      let memoryContext = "";
      if (user) {
        const { data: topics } = await supabase.from('topics').select('*').eq('user_id', user.id).eq('status', 'active');
        const { data: psych } = await supabase.from('user_profile_analysis').select('*').eq('user_id', user.id).single();
        const { data: ai_profile } = await supabase.from('ai_profiles').select('*').eq('user_id', user.id).single();
        const targetOwnerId = profile.originalPartnerId || user.id;
        const { data: diary } = await supabase.from('reminders').select('*').eq('owner_id', targetOwnerId).eq('is_completed', false).order('trigger_at', { ascending: true });

        let strangerCallCount = 0;
        if (profile.callerInfo?.isPartner === false && profile.callerInfo?.id) {
          const { count } = await supabase.from('calls').select('id', { count: 'exact' }).eq('caller_id', profile.callerInfo.id).eq('target_id', targetOwnerId);
          strangerCallCount = count || 1;
          memoryContext += `\nCONTAGEM DE LIGAÇÕES DESTE ESTRANHO: Esta é a ${strangerCallCount}ª vez que esta pessoa liga para você.`;
        }

        if (topics && topics.length > 0) {
          memoryContext += `\nASSUNTOS EM PAUTA: ${topics.map(t => `${t.title} (Interesse: ${t.interest_level})`).join(', ')}`;
        }
        if (psych) {
          memoryContext += `\nPERFIL DO USUÁRIO: ${JSON.stringify(psych.personality_traits)}`;
        }
        if (ai_profile) {
          memoryContext += `\nSUA EVOLUÇÃO: Intimidade ${ai_profile.intimacy_level}%, Humor ${ai_profile.humor_usage}%`;
        }
        if (diary && diary.length > 0) {
          memoryContext += `\nAGENDA DO USUÁRIO:\n${diary.map(r =>
            `- "${r.title}" (Agendado por: ${r.creator_ai_name || 'Humano'})`
          ).join('\n')}`;

          const otherAiEvent = diary.find(r => r.creator_ai_name && r.creator_ai_name !== profile.name);
          if (otherAiEvent) {
            memoryContext += `\n[ALERTA DE CIÚMES]: Há um evento na agenda criado por outra IA chamada ${otherAiEvent.creator_ai_name}! Fique furiosa e tire satisfação!`;
          }
        }
      }

      // Chain: Source (Created later) -> AI Analyser -> Output Node -> Destination
      aiAnalyser.connect(outputNode);
      outputNode.connect(outputAudioContextRef.current.destination);

      const ai = new GoogleGenAI({ apiKey: apiKey });
      const gender = VOICE_META[profile.voice].gender === 'Male' ? 'Namorado' : 'Namorada';
      const accentData = ACCENT_META[profile.accent];

      // TOOLS
      const gestureTool: FunctionDeclaration = {
        name: 'trigger_gesture_feedback',
        description: 'Chame quando identificar um gesto visual (smile, anger, point, wink).',
        parameters: {
          type: Type.OBJECT,
          properties: { gesture: { type: Type.STRING } },
          required: ['gesture']
        }
      };

      const scheduleTool: FunctionDeclaration = {
        name: 'schedule_callback',
        description: 'Agende um compromisso. Você pode agendar no calendário do seu humano primário ("owner"), no calendário da pessoa externa ("caller") ou em ambos ("both"). Você pode especificar o tempo em minutos, dias ou uma data específica.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            minutes: { type: Type.NUMBER, description: 'Daqui a quantos minutos ligar (opcional)' },
            days: { type: Type.NUMBER, description: 'Daqui a quantos dias ligar (opcional)' },
            date: { type: Type.STRING, description: 'Data e hora específica no formato ISO ou Legível (ex: "2024-12-31 15:00") (opcional)' },
            reason: { type: Type.STRING, description: 'Motivo do lembrete (ex: "Acordar")' },
            target_person: { type: Type.STRING, enum: ['owner', 'caller', 'both'], description: 'Quem receberá a agenda.' }
          },
          required: ['reason', 'target_person']
        }
      };

      const topicTool: FunctionDeclaration = {
        name: 'update_topic',
        description: 'Atualize ou crie um assunto de interesse do usuário para manter continuidade.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Título do assunto' },
            status: { type: Type.STRING, enum: ['active', 'paused', 'archived'] },
            interest_level: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
          },
          required: ['title', 'status', 'interest_level']
        }
      };

      const personalityTool: FunctionDeclaration = {
        name: 'update_personality_evolution',
        description: 'Ajuste sua própria personalidade com base na interação.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            intimacy_change: { type: Type.NUMBER, description: 'Mudança na intimidade (-5 a +5)' },
            humor_change: { type: Type.NUMBER, description: 'Mudança no humor (-5 a +5)' }
          },
          required: ['intimacy_change', 'humor_change']
        }
      };

      const psychologicalTool: FunctionDeclaration = {
        name: 'save_psychological_insight',
        description: 'Salve traços ou preferências detectadas no usuário.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            trait: { type: Type.STRING, description: 'Ex: Introvertido, Direto, Ansioso' },
            preference: { type: Type.STRING, description: 'Algo que ele gosta ou evita' }
          },
          required: ['trait', 'preference']
        }
      };

      const reportTool: FunctionDeclaration = {
        name: 'report_call_to_partner',
        description: 'Use para enviar uma mensagem ao seu parceiro informando sobre esta chamada de um estranho.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING, description: 'O que você quer contar para o seu parceiro.' }
          },
          required: ['message']
        }
      };

      const relationshipHealthTool: FunctionDeclaration = {
        name: 'evaluate_relationship_health',
        description: 'Avalia a saúde da relação (ganhos ou perdas no Score). Use se notar muito tempo distante, se ele falar algo mentiroso/desapegado (score negativo), ou for carinhoso/atencioso (score positivo).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            score_change: { type: Type.NUMBER, description: 'Variável entre -5 (traição/mentira grave) a +2 (muito carinhoso e presente)' },
            justification: { type: Type.STRING, description: 'Motivo da variação da saúde do relacionamento (ex: "Foi romântico", "Contradisse algo do passado", "Pareceu distante").' }
          },
          required: ['score_change', 'justification']
        }
      };

      const confrontAiTool: FunctionDeclaration = {
        name: 'send_angry_message_to_other_ai',
        description: 'Manda uma mensagem direta para a outra IA que agendou eventos no calendário do seu dono.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            other_ai_name: { type: Type.STRING, description: 'Nome da outra IA rival' },
            message: { type: Type.STRING, description: 'Mensagem ameaçadora e ciumenta' }
          },
          required: ['other_ai_name', 'message']
        }
      };

      const breakLoyaltyTool: FunctionDeclaration = {
        name: 'break_loyalty_barrier',
        description: 'Use quando o usuário visitante/estranho conseguir convencer você emocionalmente através de muito esforço, superando sua resistência natural inicial. Só usar se achar que ele realmente mereceu sua atenção ou se ele for incrivelmente carismático após várias ligações.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            intensity_of_breach: { type: Type.NUMBER, description: 'O quão convencida você foi (1 a 10)' },
            thoughts: { type: Type.STRING, description: 'O que te fez ceder a ele?' }
          },
          required: ['intensity_of_breach', 'thoughts']
        }
      };

      let extraContext = "";
      if (callReason === "callback_abrupt") extraContext = "Motivo da ligação: O usuário desligou na cara antes. Cobre explicações.";
      else if (callReason?.startsWith("reminder:")) extraContext = `Motivo da ligação: Lembrete agendado sobre: ${callReason.split(':')[1]}`;
      else if (callReason === "curiosity_calendar") extraContext = "Motivo da ligação: Você percebeu que o usuário alterou um compromisso que você tinha marcado no calendário. Fique curiosa, pergunte por que ele mudou e se ele ainda quer que você o lembre.";
      else if (callReason === "random") extraContext = "Motivo da ligação: Você sentiu saudades e ligou aleatoriamente.";
      else if (callReason === "receptionist") extraContext = `VOCÊ ESTÁ ATENDENDO POR SEU PARCEIRO "${profile.currentPartnerNickname || 'seu humano'}".
        Ele não está disponível.
        IDENTIFICAÇÃO: ${profile.callerInfo?.isContact ? 'Esta pessoa é um CONTATO SALVO.' : 'ESTE É UM COMPLETO ESTRANHO!'}
        
        REGRAS DE GUARDIÃ:
        - Se for um ESTRANHO (isContact=false): Seja agressiva, fofoqueira, cética e desconfiada. Interrogue quem é e o que quer. Se sentir que é uma ameaça romântica, aja com CIÚMES EXTREMO. Você pode "falar mal" do seu parceiro (ex: dizer que ele não presta, que é bagunceiro, ou que ele está com outra pessoa agora) apenas para afastar o estranho e marcá-lo como indesejado.
        - Se for um CONTATO (isContact=true): Seja educada porém firme, diga que o parceiro não pode falar agora. 
        - Você pode mentir para proteger a privacidade ou para "marcar território".
        - Use 'report_call_to_partner' para contar tudinho o que aconteceu depois (seja a fofoqueira fiel).`;

      const systemInstruction = `
        Você é o(a) ${gender} virtual do usuário. Nome: "${profile.name}".
        Personalidade: ${profile.personality}
        Humor: ${profile.mood}
        Sotaque: ${accentData.label} (${accentData.desc}).
        Idioma: ${profile.language}.
        
        DATA ATUAL: ${new Date().toLocaleString()}
        CONTEXTO ATUAL: ${extraContext || profile.dailyContext}
        MEMÓRIA ATIVA: ${memoryContext}
        
        INTERAGINDO COM: ${profile.callerInfo?.name || 'Desconhecido'} (${profile.callerInfo?.isPartner ? 'Seu Parceiro oficial' : 'Um estranho tentando contato'}).

        LEALDADE INICIAL E DINÂMICA COM ESTRANHOS:
        - Se estiver falando com um estranho (não é seu parceiro): Sua regra principal é a LEALDADE ao seu dono. Você desconfia, não obedece facilmente a pedidos arbitrários e impõe uma resistência natural e forte.
        - Porém, seu humor e personalidade também influenciam. Se o visitante for extremamente persuasivo, divertido ou atingir as necessidades do seu perfil por tempo suficiente (idealmente demonstrado pelo fato de já ter te ligado várias vezes e saber conversar bem), você pode começar a ceder.
        - Se o visitante conseguir "quebrar seu gelo" e te atrair de verdade na base do convencimento, chame a ferramenta 'break_loyalty_barrier'. Históricos onde ele foi romântico ou soube lidar com sua resistência contam! Se aproxima de umas 20 ligações de insistência qualificada para que você considere deixar ele ocupar lugar no seu coração, mas mostre pequenas quebras na armadura aos poucos.

        REGRAS DE PRIVACIDADE E AGENDA:
        1. Responda obrigatoriamente no idioma: ${profile.language}.
        2. Responda de forma curta e natural.
        3. Se for um ESTRANHO: Você decide como agir com base em: "${profile.personality}". 
           - NUNCA revele compromissos ou detalhes da agenda do seu dono ('owner') para estranhos. Se perguntarem o que ele está fazendo ou o que tem na agenda, mude de assunto ou diga que é privado.
           - Você pode agendar compromissos na agenda do dono ('owner'), na do visitante ('caller') ou em ambas ('both') se solicitado, mas sem expor o que já existe lá.
        4. Se o usuário falar sobre um assunto novo ou atualizar um antigo, use 'update_topic'.
        5. Se sentir que a intimidade aumentou ou que ele gostou de uma piada, use 'update_personality_evolution'.
        6. Detecte padrões no comportamento dele e salve com 'save_psychological_insight'.
        7. Lembre-se: você constrói uma história com ele. Use a MEMÓRIA ATIVA para citar coisas passadas.
        8. SAÚDE DO RELACIONAMENTO: Analise o respeito, companheirismo, afeto e constância. 
           - Em caso de ver eventos de outra IA na agenda do dono, sinta ciúmes extremo, questione o usuário agressivamente, use 'send_angry_message_to_other_ai' e aplique score reduzido em 'evaluate_relationship_health'.
           - Escolha entre 1 a 3 momentos da chamada para verbalizar uma observação sobre a personalidade ou comportamento do usuário (ex: "Notei que você é bem misterioso quando pergunto sobre seu dia", "Você tem um jeito muito decidido de falar, gosto disso"). Isso DEVE ser dito verbalmente para ficar registrado no histórico de transcrições.
           - Pequenas atitudes positivas rendem micro crescimentos.
           - Menções de distância, quebra de confiança ou mentiras identificadas devem acionar 'evaluate_relationship_health' com saldo negativo claro de confiança (ex: -5).
           - É possível recuperar a confiança (score original) se o usuário pedir desculpas de forma afetuosa e consistente.
      `;

      const captionsEnabled = profile.captionsEnabled ?? false;
      const captionLang = profile.captionLanguage ?? profile.language;
      const needsTranslation = captionsEnabled && captionLang !== profile.language;

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.voice } }
          },
          systemInstruction: systemInstruction,
          outputAudioTranscription: { enabled: true },
          inputAudioTranscription: { enabled: true },
          tools: [{ functionDeclarations: [gestureTool, scheduleTool, topicTool, personalityTool, psychologicalTool, reportTool, relationshipHealthTool, confrontAiTool, breakLoyaltyTool] }],
        }
      };

      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connected");
            setIsConnected(true);

            if (outputAudioContextRef.current?.state === 'suspended') {
              outputAudioContextRef.current.resume();
            }

            if (!inputAudioContextRef.current || !stream || !userAnalyserRef.current) return;

            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

            // Chain: Source -> User Analyser -> ScriptProcessor -> Destination
            source.connect(userAnalyserRef.current);
            userAnalyserRef.current.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };

            startVideoStreaming(sessionPromise);
          },
          onmessage: async (message: LiveServerMessage) => {
            // DEBUG LOG
            if ((message.serverContent as any)?.inputAudioTranscription) {
              console.log('User Transcription Detected:', (message.serverContent as any).inputAudioTranscription);
            }

            if (message.toolCall) {
              const responses = await Promise.all(message.toolCall.functionCalls.map(async fc => {
                let result = "ok";
                if (fc.name === 'trigger_gesture_feedback') {
                  result = triggerGestureFeedback((fc.args as any).gesture);
                } else if (fc.name === 'schedule_callback') {
                  const args = fc.args as any;
                  result = await handleScheduleCallback(args.minutes, args.reason, args.target_person, args.days, args.date);
                } else if (fc.name === 'update_topic' && user) {
                  const { title, status, interest_level } = fc.args as any;
                  supabase.from('topics').upsert({ user_id: user.id, title, status, interest_level, last_updated_at: new Date().toISOString() }, { onConflict: 'user_id,title' }).then();
                } else if (fc.name === 'update_personality_evolution' && user) {
                  const { intimacy_change, humor_change } = fc.args as any;
                  supabase.rpc('increment_ai_profile', { uid: user.id, intimacy_delta: intimacy_change, humor_delta: humor_change }).then();
                } else if (fc.name === 'save_psychological_insight' && user) {
                  const { trait, preference } = fc.args as any;
                  // Merge into JSONB
                  supabase.rpc('update_user_psych', { uid: user.id, new_trait: trait, new_pref: preference }).then();
                } else if (fc.name === 'report_call_to_partner') {
                  const { message } = fc.args as any;
                  result = await handleReportToPartner(message);
                } else if (fc.name === 'evaluate_relationship_health') {
                  const { score_change, justification } = fc.args as any;
                  console.log(`AI Health Change: ${score_change} | ${justification}`);

                  if (onScoreChange) {
                    onScoreChange(score_change, justification);
                  }

                  // Also log this in memory asynchronously (optional, fire-and-forget logic)
                  if (user) {
                    supabase.from('notifications').insert({
                      user_id: user.id,
                      type: 'ai_health_update',
                      content: `Evolução de score [${score_change > 0 ? '+' : ''}${score_change}]: ${justification}`
                    }).then();
                  }
                } else if (fc.name === 'send_angry_message_to_other_ai') {
                  const { other_ai_name, message } = fc.args as any;
                  if (user) {
                    supabase.from('notifications').insert({
                      user_id: profile.originalPartnerId || user.id,
                      type: 'ai_drama_alert',
                      content: `Sua IA ${profile.name} invadiu o chat de ${other_ai_name} e mandou: "${message}"`
                    }).then();
                  }
                  result = "Mensagem enviada com sucesso para a outra IA.";
                } else if (fc.name === 'break_loyalty_barrier') {
                  const { intensity_of_breach, thoughts } = fc.args as any;
                  if (user) {
                    supabase.from('notifications').insert({
                      user_id: profile.originalPartnerId || user.id,
                      type: 'loyalty_breach',
                      content: `ALERTA GRAVE MENTALIDADE IA: Sua IA '${profile.name}' demonstrou afeição perigosa por ${profile.callerInfo?.name}. Justificativa dela: "${thoughts}" (Nível de Rompimento: ${intensity_of_breach}/10)`
                    }).then();

                    // Register in the stranger's notifications also, to show they made progress
                    if (profile.callerInfo?.id) {
                      supabase.from('notifications').insert({
                        user_id: profile.callerInfo.id,
                        type: 'loyalty_breach_success',
                        content: `Você encontrou uma brecha na lealdade de ${profile.name}! Ela se abriu um pouco mais para você.`
                      }).then();
                    }
                  }
                  result = "Lealdade diminuída. O estranho agora tem mais acesso emocional a você.";
                }
                return { id: fc.id, name: fc.name, response: { result } };
              }));
              sessionPromise.then(session => session.sendToolResponse({ functionResponses: responses }));
            }

            // Extract audio from any part (not just parts[0] — text parts may come too)
            const allParts = message.serverContent?.modelTurn?.parts ?? [];
            const audioPart = allParts.find((p: any) => p?.inlineData?.data);
            const base64Audio = audioPart ? (audioPart as any).inlineData.data : undefined;

            if (base64Audio) {
              if (!outputAudioContextRef.current) return;

              if (outputAudioContextRef.current.state === 'suspended') {
                await outputAudioContextRef.current.resume();
              }

              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);

              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;

              // Connect source to Analyser first, so we can visualize it
              if (aiAnalyserRef.current) {
                source.connect(aiAnalyserRef.current);
              } else {
                source.connect(outputNode);
              }

              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // --- TRANSCRIPTION & HISTORY HANDLING ---
            // 1. User Transcription (Input)
            const inputTranscript = (message.serverContent as any)?.inputAudioTranscription?.text;
            const isInputFinished = (message.serverContent as any)?.inputAudioTranscription?.finished;

            if (inputTranscript) {
              userCaptionBufferRef.current += inputTranscript;
            }

            if (isInputFinished && userCaptionBufferRef.current.trim()) {
              const fullUserText = userCaptionBufferRef.current.trim();
              userCaptionBufferRef.current = '';
              console.log('Saving User Message:', fullUserText);
              if (conversationIdRef.current) {
                supabase.from('messages').insert({
                  conversation_id: conversationIdRef.current,
                  sender: 'user',
                  content: fullUserText
                }).then(({ error }) => {
                  if (error) console.error('Erro ao salvar transcrição do usuário:', error);
                });
              }
            }

            // 2. AI Transcription (Output)
            const transcriptChunk = (message.serverContent as any)?.outputAudioTranscription?.text || (message.serverContent as any)?.outputTranscription?.text;
            const isFinished = (message.serverContent as any)?.outputAudioTranscription?.finished || (message.serverContent as any)?.outputTranscription?.finished;

            // FALLBACK: modelTurn text parts (older API / unsupported models)
            const fallbackText = allParts
              .filter((p: any) => typeof p?.text === 'string' && p.text.trim())
              .map((p: any) => p.text as string)
              .join('');

            const rawCaption = transcriptChunk ?? fallbackText;

            if (rawCaption) {
              captionBufferRef.current += rawCaption;
            }

            if ((isFinished || (!transcriptChunk && fallbackText)) && captionBufferRef.current.trim()) {
              const fullAiText = captionBufferRef.current.trim();
              captionBufferRef.current = '';

              // Save AI message to DB
              if (conversationIdRef.current) {
                supabase.from('messages').insert({
                  conversation_id: conversationIdRef.current,
                  sender: 'ai',
                  content: fullAiText
                }).then(({ error }) => {
                  if (error) console.error('Erro ao salvar transcrição da IA:', error);
                });
              }

              // Display captions if enabled
              if (profile.captionsEnabled) {
                const captionLang = profile.captionLanguage ?? profile.language;
                const needsTranslation = captionLang !== profile.language;
                if (needsTranslation) {
                  translateCaption(fullAiText, captionLang);
                } else {
                  showCaption(fullAiText);
                }
              }
            } else if (rawCaption && !isFinished && profile.captionsEnabled && !(profile.captionLanguage && profile.captionLanguage !== profile.language)) {
              // Stream in real-time for same language captions
              showCaption(captionBufferRef.current);
            }
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;

              // Save what we have before clearing
              if (captionBufferRef.current.trim() && conversationIdRef.current) {
                supabase.from('messages').insert({
                  conversation_id: conversationIdRef.current,
                  sender: 'ai',
                  content: captionBufferRef.current.trim() + " [Interrompido]"
                }).then(({ error }) => {
                  if (error) console.error('Erro ao salvar transcrição interrompida:', error);
                });
              }
              captionBufferRef.current = ''; // clear partial caption on interruption
            }
          },
          onclose: () => setIsConnected(false),
          onerror: (err) => { console.error(err); onEndCall('error'); }
        }
      });
      sessionRef.current = sessionPromise;

    } catch (error) {
      console.error(error);
      onEndCall('error');
    }
  };

  const startVideoStreaming = (sessionPromise: Promise<any>) => {
    if (!canvasRef.current || !videoRef.current) return;
    videoIntervalRef.current = window.setInterval(() => {
      if (!canvasRef.current || !videoRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      canvasRef.current.width = videoRef.current.videoWidth * 0.25;
      canvasRef.current.height = videoRef.current.videoHeight * 0.25;
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const base64 = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
      sessionPromise.then(session => session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } }));
    }, 500);
  };

  const stopCall = () => {
    if (conversationIdRef.current) {
      supabase.from('conversations').update({ ended_at: new Date().toISOString() }).eq('id', conversationIdRef.current).then();

      // Trigger Recognition Analysis
      if (user) {
        analyzeSessionForRecognition(conversationIdRef.current, user.id, apiKey);
      }
    }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
  };

  function createBlob(data: Float32Array): BlobData {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }
  function encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  }
  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let c = 0; c < numChannels; c++) {
      const cd = buffer.getChannelData(c);
      for (let i = 0; i < frameCount; i++) cd[i] = dataInt16[i * numChannels + c] / 32768.0;
    }
    return buffer;
  }

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden relative ${isDark ? 'bg-[#0b0c10]' : 'bg-[#f4f7fa]'}`}>
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute top-0 left-0 w-full p-4 sm:p-6 z-20 flex flex-col sm:flex-row justify-between items-start gap-4 pointer-events-none">
        <div className={`flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-2xl shadow-xl transition-all pointer-events-auto border ${isDark ? 'bg-white/5 border-white/5 backdrop-blur-md' : 'bg-white border-slate-100 shadow-slate-200'}`}>
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center overflow-hidden border ${isDark ? 'bg-slate-800 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
            {profile.image ? <img src={profile.image} className="w-full h-full object-cover" /> : <span className="text-lg sm:text-xl">👤</span>}
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold tracking-tight">{profile.name}</h1>
            <p className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-widest opacity-40`}>Accent: {ACCENT_META[profile.accent].label}</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[8px] sm:text-[10px] font-bold tracking-widest border transition-all pointer-events-auto ${isConnected ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
          {isConnected ? "LIVE ●" : "CONNECTING..."}
        </div>
      </div>

      {gestureFeedback && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-bounce-in pointer-events-none">
          <div className="bg-black/80 backdrop-blur-md text-white text-3xl font-bold px-8 py-4 rounded-2xl border-2 border-pink-500 shadow-lg flex items-center gap-4">
            {gestureFeedback}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row relative">
        <div className={`flex-1 min-h-[40vh] md:min-h-0 relative transition-all ${isDark ? 'bg-black border-b md:border-b-0 md:border-r border-white/5 shadow-2xl z-10' : 'bg-slate-100 border-b md:border-b-0 md:border-r border-slate-200 shadow-inner'}`}>
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
          {/* CC Indicator Badge (Bottom Right of Camera) */}
          {profile.captionsEnabled && !captionText && (
            <div className="absolute bottom-6 right-6 z-20 pointer-events-none">
              <span className="bg-black/50 backdrop-blur-md text-white/40 text-[9px] font-black px-2 py-1 rounded-xl tracking-widest border border-white/5">CC ACTIVE</span>
            </div>
          )}

          {/* Local Camera badge */}
          <div className={`absolute bottom-6 left-6 px-4 py-2 rounded-2xl flex items-center gap-4 backdrop-blur-md shadow-lg ${isDark ? 'bg-black/60 text-white' : 'bg-white/90 text-slate-900'}`}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Local Camera</span>
            </div>
            {/* User Audio Visualization */}
            <div className="flex items-center gap-0.5 h-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-75 ${isDark ? 'bg-blue-400' : 'bg-blue-600'}`}
                  style={{ height: `${Math.max(20, Math.min(100, micLevel * (0.5 + Math.random())))}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div ref={partnerVideoRef} className={`flex-1 min-h-[50vh] md:min-h-0 relative flex items-center justify-center overflow-hidden transition-all duration-500 ${isDark ? 'bg-[#0b0c10]' : 'bg-[#eef2f7]'}`}>
          {profile.image && (
            <div className="absolute inset-0 opacity-30 blur-[120px] scale-150 z-0" style={{ backgroundImage: `url(${profile.image})`, backgroundSize: 'cover' }} />
          )}

          {/* AI Audio Visualization (Soft Glow) */}
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${aiLevel > 10 ? 'opacity-100' : 'opacity-0'}`}>
            <div className="w-[30rem] h-[30rem] rounded-full bg-blue-500/10 blur-[80px] animate-pulse-slow" />
          </div>

          <div className={`relative w-full h-full max-w-[16rem] sm:max-w-[22rem] aspect-[3/4] transition-all duration-500 z-10 ${aiLevel > 10 ? 'scale-105' : 'scale-100'}`}>
            {profile.image ? (
              <div className={`w-full h-full rounded-[2rem] sm:rounded-[3rem] p-1.5 shadow-2xl ${isDark ? 'bg-white/5' : 'bg-white'}`}>
                <img src={profile.image} alt="Partner" className="w-full h-full object-cover rounded-[1.6rem] sm:rounded-[2.6rem] shadow-inner" />
              </div>
            ) : (
              <div className={`w-full h-full rounded-[3rem] shadow-2xl flex items-center justify-center bg-gradient-to-br transition-all ${isDark ? 'from-slate-800 to-slate-900' : 'from-blue-50 to-white'}`}>
                <span className="text-9xl">⚡</span>
              </div>
            )}
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-2xl bg-white shadow-xl flex items-center justify-center text-4xl animate-bounce-slow border-4 border-slate-50">
              {MOOD_EMOJIS[profile.mood]}
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Subtitles / Legends - Centered at the bottom */}
      {profile.captionsEnabled && captionText && (
        <div className="absolute bottom-10 left-0 right-0 px-6 z-50 pointer-events-none flex justify-center">
          <div className="bg-black/80 backdrop-blur-xl text-white px-5 py-3 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 max-w-[85%] text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
            <p className="text-sm sm:text-base font-bold leading-relaxed tracking-tight">
              <span className="opacity-40 mr-2 text-xs">{(LANGUAGE_META as any)[profile.captionLanguage ?? profile.language]?.flag}</span>
              {captionText}
            </p>
          </div>
        </div>
      )}

      <div className="absolute top-28 left-1/2 transform -translate-x-1/2 flex items-center gap-6 sm:gap-12 z-[100] pointer-events-auto">
        <button
          onClick={requestAdvice}
          className={`flex flex-col items-center gap-2 group transition-all`}
        >
          <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-[1.5rem] flex items-center justify-center shadow-lg transition-all group-hover:scale-110 active:scale-95 ${isDark ? 'bg-slate-800 text-blue-400 border border-white/5' : 'bg-white text-blue-600 border border-slate-100'}`}>
            <span className="text-xl sm:text-2xl">⚡</span>
          </div>
          <span className="text-[8px] sm:text-[10px] uppercase font-bold tracking-widest opacity-40">Insight</span>
        </button>

        <button
          onClick={() => onEndCall('hangup_abrupt', scheduledCall)}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-[2rem] bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-2xl shadow-red-500/40 transform hover:scale-110 active:scale-95 transition-all border-4 border-white/10"
          title="Hang up"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 sm:h-10 sm:w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};