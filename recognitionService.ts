import { supabase } from './supabaseClient';

export async function analyzeSessionForRecognition(conversationId: string, userId: string, apiKey: string) {
    console.log('Starting Recognition Analysis for Session:', conversationId);

    try {
        // 1. Get Messages
        const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (!messages || messages.length === 0) {
            console.log('No messages found for recognition analysis.');
            return;
        }

        const conversationText = messages.map(m => `${m.sender.toUpperCase()}: ${m.content}`).join('\n');
        const userMessages = messages.filter(m => m.sender === 'user');

        if (userMessages.length === 0) {
            console.log('No user messages recorded. Analyzing AI observations of the user...');
        }

        // 2. Get Existing Phrases
        const { data: existingPhrases } = await supabase
            .from('ai_psychological_strategies')
            .select('*')
            .eq('user_id', userId)
            .eq('category', 'user_personality');

        const phrasesJson = existingPhrases ? JSON.stringify(existingPhrases.map(p => ({ id: p.id, phrase: p.recognition_phrase, score: p.score }))) : '[]';

        // 3. Call Gemini
        const prompt = `
        Analise a transcrição de uma conversa entre uma IA (Namorada Virtual) e um Usuário.
        Sua tarefa é extrair e pontuar traços de personalidade do usuário em "Frases de Reconhecimento".
        
        REGRAS:
        1. Identifique novos traços de personalidade ou comportamentos recorrentes. Crie frases curtas e impactantes em português sobre o usuário. Ex: "Ele tem senso de humor sarcástico em momentos de reflexão."
        2. Analise as frases já existentes. Se o comportamento na conversa REAFIRMA a frase, dê +1 ponto. Se CONTRADIZ, dê -1 ponto.
        3. Se a conversa for neutra para uma frase, mantenha o score.
        
        FRASES ATUAIS:
        ${phrasesJson}
        
        TRANSCRIÇÃO DA ÚLTIMA CONVERSA:
        ${conversationText}
        
        RETORNE APENAS UM JSON NO SEGUINTE FORMATO:
        {
          "new_phrases": ["Frase 1", "Frase 2"],
          "updates": [
            {"id": "uuid-da-frase", "score_change": 1},
            {"id": "outra-uuid", "score_change": -1}
          ]
        }
        `;

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.2
                    }
                })
            }
        );

        const json = await res.json();
        const result = JSON.parse(json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

        // 4. Update Database
        if (result.new_phrases && result.new_phrases.length > 0) {
            const inserts = result.new_phrases.map((p: string) => ({
                user_id: userId,
                recognition_phrase: p,
                category: 'user_personality',
                score: 1, // Initial score for new phrases
                source_conversation_id: conversationId
            }));
            await supabase.from('ai_psychological_strategies').insert(inserts);
        }

        if (result.updates && result.updates.length > 0) {
            for (const update of result.updates) {
                // We use a RPC or just fetch and update because score is incremental
                // For simplicity, let's fetch current and update
                const current = existingPhrases?.find(p => p.id === update.id);
                if (current) {
                    await supabase
                        .from('ai_psychological_strategies')
                        .update({ score: current.score + update.score_change })
                        .eq('id', update.id);
                }
            }
        }

        console.log('Recognition Analysis Completed Successfully.');
    } catch (error) {
        console.error('Error in Recognition Analysis:', error);
    }
}
