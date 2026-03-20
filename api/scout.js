// ProductScout IA - API Handler
// Handles /api/auth, /api/scout, /api/chat

export default async function handler(req, res) {
  const url = req.url || '';
  const path = url.split('?')[0];

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // AUTH ENDPOINT
  if (path.endsWith('/auth')) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
    const { username, password } = req.body;
    const validUser = process.env.APP_USER || 'matypereira';
    const validPass = process.env.APP_PASS || 'maty123';
    if (username === validUser && password === validPass) {
      return res.status(200).json({success: true, user: username});
    }
    return res.status(401).json({success: false, error: 'Credenciales incorrectas'});
  }

  // CHAT ENDPOINT
  if (path.endsWith('/chat')) {
    if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
    const { message } = req.body;
    if (!message) return res.status(400).json({error: 'Message required'});

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({error: 'API key not configured'});

    try {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 512,
          system: 'Sos un analista de mercados globales especializado en importacion hacia Argentina. Respondés en español argentino. Conoces los mercados de China, India, Vietnam, Turquia, Brasil, Taiwan, Corea, Japon, USA, Mexico, Portugal e Italia. Te especializas en identificar productos con alto potencial, tendencias globales, logistica y aranceles. Maximo 3 parrafos.',
          messages: [{role: 'user', content: message}]
        })
      });

      const data = await apiRes.json();
      if (!apiRes.ok) throw new Error(data.error?.message || 'API error');
      const response = data.content?.[0]?.text || 'No pude generar una respuesta.';
      return res.status(200).json({response});
    } catch(err) {
      return res.status(500).json({error: err.message, response: 'Error al conectar con el analista IA.'});
    }
  }

  // SCOUT ENDPOINT (default)
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});

  const { countries, criteria, capital, canal, nicho, riesgo } = req.body;

  if (!countries || !Array.isArray(countries) || countries.length === 0) {
    return res.status(400).json({error: 'Se requiere al menos un pais', debug: req.body});
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({error: 'ANTHROPIC_API_KEY no configurada'});

  const criteriaText = criteria && criteria.length > 0 ? criteria.join(', ') : 'margen, demanda, tendencias';

  const prompt = 'Sos un experto analista de mercados de importacion global hacia Argentina con 15 anios de experiencia.\n\nCONFIGURACION DE BUSQUEDA:\n- Paises de origen: ' + countries.join(', ') + '\n- Criterios de filtrado: ' + criteriaText + '\n- Capital disponible: ' + capital + '\n- Canal de venta: ' + canal + '\n- Categoria preferida: ' + nicho + '\n- Tolerancia al riesgo: ' + riesgo + '\n\nAnaliza los paises seleccionados e identifica entre 4 y 6 productos especificos con alto potencial de importacion. Distribuye los productos entre los diferentes paises.\n\nDevuelve SOLO un JSON valido (sin markdown, sin texto extra) con este formato:\n{\n  "products": [\n    {\n      "nombre": "Nombre del producto",\n      "pais": "Pais de origen",\n      "score": 88,\n      "margen": 55,\n      "demanda": "Alta",\n      "riesgo": "Bajo",\n      "tendencia": "sube",\n      "descripcion": "Por que este producto es una buena oportunidad",\n      "topPick": true\n    }\n  ]\n}\n\nReglas:\n- score: numero 0-100\n- margen: numero entero porcentaje\n- demanda: Alta, Media o Baja\n- riesgo: Bajo, Medio o Alto\n- tendencia: sube, estable o baja\n- Solo un topPick true\n- Productos reales y especificos\n- Usar solo paises de la lista seleccionada';

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1536,
        messages: [{role: 'user', content: prompt}]
      })
    });

    const data = await apiRes.json();

    if (!apiRes.ok) {
      return res.status(500).json({
        error: 'Error de API Anthropic',
        debug: {status: apiRes.status, data}
      });
    }

    let rawText = data.content?.[0]?.text || '';

    // Strip markdown
    rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();

    // Extract JSON
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      rawText = rawText.substring(jsonStart, jsonEnd + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch(parseErr) {
      return res.status(500).json({
        error: 'Error al parsear JSON',
        raw: rawText.substring(0, 500),
        parseError: parseErr.message
      });
    }

    if (!parsed.products || !Array.isArray(parsed.products)) {
      return res.status(500).json({error: 'Formato invalido', raw: rawText.substring(0, 300)});
    }

    // Post-process fields
    parsed.products = parsed.products.map((p, i) => ({
      nombre: p.nombre || p.name || ('Producto ' + (i+1)),
      pais: p.pais || p.origen || countries[i % countries.length] || 'Internacional',
      score: parseInt(p.score) || 70,
      margen: parseInt(p.margen) || 35,
      demanda: p.demanda || 'Media',
      riesgo: p.riesgo || p.nivel_riesgo || 'Medio',
      tendencia: p.tendencia || 'estable',
      descripcion: p.descripcion || '',
      topPick: i === 0 ? true : false
    }));

    return res.status(200).json(parsed);

  } catch(err) {
    return res.status(500).json({
      error: 'Error interno',
      message: err.message
    });
  }
}
