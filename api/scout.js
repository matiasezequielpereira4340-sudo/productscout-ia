export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { countries, criteria, capital, canal, nicho, riesgo } = req.body;

  const countriesList = (countries || []).join(', ') || 'China';
  const criteriaList = (criteria && criteria.length) ? criteria.join(', ') : 'sin filtros especificos';

  const prompt = 'Sos un experto en comercio internacional y tendencias de consumo en Argentina con 15 anios de experiencia. Analizas mercados globales para identificar oportunidades de importacion rentables para el mercado argentino en 2025-2026.\n\nCONFIGURACION:\n- Paises de origen: ' + countriesList + '\n- Capital disponible: ' + (capital || 'flexible') + '\n- Canal de venta: ' + (canal || 'multiples canales') + '\n- Categoria preferida: ' + (nicho || 'cualquier categoria rentable') + '\n- Perfil de riesgo: ' + (riesgo || 'moderado') + '\n- Criterios: ' + criteriaList + '\n\nCONTEXTO MERCADO ARGENTINO 2025-2026: Clase media recuperando poder adquisitivo. Fuerte uso de Mercado Libre, Instagram y TikTok. Demanda de bienestar, tecnologia accesible, hogar, mascotas, estetica coreana. Oportunidad en productos que triunfaron en EEUU/Europa pero aun no llegaron masivamente a Argentina.\n\nResponde SOLO con un objeto JSON valido, sin markdown, sin texto extra. Solo el JSON puro comenzando con { y terminando con }.\n\nFormato:{"productos":[{"nombre":"Nombre especifico del producto","pais":"Pais de los seleccionados","bandera":"emoji de bandera","descripcion":"2 oraciones sobre el producto y su oportunidad en Argentina","insight":"1 dato concreto sobre tendencia en EEUU o Europa","margen":"X%-X%","margenTipo":"good","demanda":"Alta","demandaTipo":"good","competencia":"Baja","competenciaTipo":"good","riesgo":"Bajo","riesgoTipo":"good","ticket":"X-X USD","score":88,"scoreTipo":"s-high","estrella":true,"tags":["tag1","tag2","tag3"]}],"analisis":"4 oraciones de analisis estrategico","label":"frase corta ej: 5 oportunidades desde China y Corea"}\n\nReglas: 4 a 6 productos segun paises seleccionados. Distribuir entre paises. Solo 1 estrella:true. score 0-100: s-high>=80 s-mid 60-79 s-low<60. margenTipo/demandaTipo/competenciaTipo/riesgoTipo: good warn bad. Nombres especificos reales. ticket=precio FOB por unidad en USD. Tags max 3 palabras en espanol.';

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
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

    const data = await apiRes.json();

    if (data.error) {
      return res.status(500).json({ error: 'API error: ' + data.error.message });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      return res.status(500).json({ error: 'Empty response', debug: JSON.stringify(data).substring(0, 300) });
    }

    let raw = data.content[0].text.trim();
    raw = raw.replace(/^```jsons*/i, '').replace(/^```s*/i, '').replace(/s*```$/i, '').trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'No JSON in response', raw: raw.substring(0, 200) });
    }
    const parsed = JSON.parse(raw.substring(start, end + 1));
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
