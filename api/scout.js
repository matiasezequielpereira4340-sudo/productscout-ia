export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { countries, criteria, capital, canal, nicho, riesgo } = req.body;

  const prompt = 'Sos un experto en comercio internacional y tendencias de consumo en Argentina con 15 anios de experiencia. Analizas mercados globales para identificar oportunidades de importacion rentables para el mercado argentino en 2025-2026.\n\nCONFIGURACION:\n- Paises de origen seleccionados: ' + (countries||[]).join(', ') + '\n- Capital disponible: ' + (capital||'flexible') + '\n- Canal de venta: ' + (canal||'multiples canales') + '\n- Categoria preferida: ' + (nicho||'cualquier categoria rentable') + '\n- Perfil de riesgo: ' + (riesgo||'moderado') + '\n- Criterios de filtro: ' + ((criteria&&criteria.length)?criteria.join(' - '):'sin filtros especificos') + '\n\nCONTEXTO MERCADO ARGENTINO 2025-2026:\n- Clase media recuperando poder adquisitivo, busqueda de valor\n- Fuerte uso de Mercado Libre, Instagram y TikTok para compras\n- Demanda de bienestar, tecnologia accesible, hogar, mascotas, estetica coreana\n- Oportunidad: productos que triunfaron en EEUU/Europa pero aun no llegaron masivamente a Argentina\n\nResponde UNICAMENTE con un objeto JSON valido, sin markdown ni texto extra:\n{\n  "productos": [\n    {\n      "nombre": "Nombre especifico del producto",\n      "pais": "Pais de los seleccionados",\n      "bandera": "emoji de bandera",\n      "descripcion": "2 oraciones: que es el producto y por que tiene oportunidad real en Argentina ahora",\n      "insight": "1 dato concreto: tendencia en EEUU u Europa que valida la demanda futura en Argentina",\n      "margen": "X%-X%",\n      "margenTipo": "good",\n      "demanda": "Alta",\n      "demandaTipo": "good",\n      "competencia": "Baja",\n      "competenciaTipo": "good",\n      "riesgo": "Bajo",\n      "riesgoTipo": "good",\n      "ticket": "X-X USD",\n      "score": 88,\n      "scoreTipo": "s-high",\n      "estrella": true,\n      "tags": ["tag1", "tag2", "tag3"]\n    }\n  ],\n  "analisis": "4 oraciones de analisis estrategico sobre los paises seleccionados y el contexto argentino.",\n  "label": "frase corta ej: 5 oportunidades desde China y Corea"\n}\n\nReglas:\n- Entre 4 y 6 productos segun la cantidad de paises seleccionados\n- Distribuir productos entre los paises seleccionados\n- Solo 1 producto con estrella true\n- Score 0-100. s-high 80+, s-mid 60-79, s-low menos de 60\n- margenTipo/demandaTipo/competenciaTipo/riesgoTipo: good warn o bad\n- Nombres especificos reales\n- ticket = precio FOB estimado en USD por unidad\n- Tags maximo 3 palabras en espanol\n- Respeta los criterios activos del usuario';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!data.content || !data.content[0]) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    const raw = data.content.map(function(i){ return i.text || ''; }).join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar el analisis: ' + err.message });
  }
}
