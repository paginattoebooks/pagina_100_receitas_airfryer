// pages/api/webhook-cartpanda.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// client com service role (somente backend!)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido, use POST' });
  }

  try {
    const evento = req.body;

    const email = evento?.customer?.email;
    const cpf = evento?.customer?.document;
    const produtos = evento?.items || [];

    if (!email) {
      return res.status(400).json({ error: 'Email não encontrado no payload' });
    }

    // 🔐 SENHA PADRÃO FIXA PARA TODOS
    const senhaTemporaria = '123456';

    // 1️⃣ Cria usuário no Supabase (ou ignora se já existir)
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password: senhaTemporaria,
      email_confirm: true,
    });

    if (userError && !String(userError.message).toLowerCase().includes('already exists')) {
      console.error('Erro ao criar usuário:', userError);
      throw userError;
    }

    // 2️⃣ Mapeia produtos → categorias
    const mapaCategorias = {
      SKU_AIRFRYER: [0],
      SKU_DOCES: [1],
      SKU_BOLOS: [3],
      SKU_MOLHOS: [5],
      SKU_SUSHI: [6],
      SKU_FIT: [7],
      SKU_JANTAR: [8],
      SKU_DOMINGO: [9],
    };

    const categoriasLiberadas = new Set();
    produtos.forEach((p) => {
      const sku = p.sku || p.title || '';
      const categorias = mapaCategorias[sku] || [];
      categorias.forEach((c) => categoriasLiberadas.add(c));
    });

    // 3️⃣ Descobre o id do usuário
    // tenta pelo profiles (se você já tiver esse registro criado por trigger)…
    const { data: foundProfile, error: profileSearchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileSearchError) {
      console.error('Erro ao buscar profile:', profileSearchError);
    }

    let userId = foundProfile?.id || userData?.user?.id;

    // se ainda não tiver, é porque o profile ainda não foi criado
    // (opcional: você pode criar aqui um profile simples)
    if (!userId && userData?.user?.id) {
      userId = userData.user.id;
    }

    if (!userId) {
      console.error('Não foi possível obter user_id para o email:', email);
      return res.status(500).json({ error: 'Falha ao obter usuário' });
    }

    // 4️⃣ Grava os acessos na tabela access_levels
    for (const categoria of categoriasLiberadas) {
      const { error: accessError } = await supabase.from('access_levels').upsert({
        user_id: userId,
        category_id: categoria,
        granted_at: new Date().toISOString(),
      });

      if (accessError) {
        console.error('Erro upsert access_levels:', accessError);
        // se quiser parar no primeiro erro, pode dar `return res.status(500)…` aqui
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erro geral no webhook-cartpanda:', err);
    return res.status(500).json({ error: 'Erro ao processar webhook' });
  }
}



