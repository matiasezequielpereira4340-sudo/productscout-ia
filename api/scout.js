export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { countries, criteria, capital, canal, nicho, riesgo } = req.body;

  const countriesList = (countries || []).join(', ') || 'China';
  const criteriaList = (criteria && criteria.length) ? criteria.slice(0, 5).join(', ') : 'sin filtros';

  const prompt = `Sos experto en importacion hacia Argentina. Analiza oportunidades de mercado.

DATOS:
Paises: ${countriesList}
Capital: ${capital || 'flexible'}
Canal: ${canal || 'Mercado Libre'}
Categoria: ${nicho || 'cualquiera'}
Riesgo: ${riesgo || 'moderado'}
Criterios: ${criteriaList}

Devuelve SOLO un JSON valido (sin markdown, sin texto antes ni despues):

{"productos":[{"nombre":"Collar GPS para mascotas","pais":"China","bandera":"CN","descripcion":"Dispositivo GPS compacto para seguimiento de mascotas en tiempo real. Alta demanda en Argentina por la perdida de mascotas en zonas urbanas.","insight":"En EEUU las ventas de GPS para mascotas crecieron 180 por ciento en 2023 segun Statista.","margen":"200-300","margenTipo":"good","demanda":"Alta","demandaTipo":"good","competencia":"Baja","competenciaTipo":"good","riesgo":"Bajo","riesgoTipo":"good","ticket":"8-15","score":88,"scoreTipo":"s-high","estrella":true,"tags":["tecnologia","mascotas","tendencia"]}],"analisis":"Analisis de 3 oraciones sobre los paises y el mercado argentino.","label":"5 oportunidades desde China y Corea"}

IMPORTANTE: El campo bandera debe ser el EMOJI de la bandera del pais (por ejemplo CN para China usa la bandera emoji). El campo margen debe ser solo numeros con guion (ej: 200-300 sin el simbolo %). El campo ticket debe ser solo numeros con guion (ej: 8-15 sin USD). Devuelve entre 4 y 6 productos distribuidos entre los paises seleccionados. Solo 1 estrella true. score 0-100 donde s-high es mayor a 80.`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await apiRes.json();

    if (data.error) {
      return res.status(500).json({ error: 'API error: ' + data.error.message });
    }

    if (!data.content || !data.content[0] || !data.content[0].text) {
      return res.status(500).json({ error: 'Empty response' });
    }

    let raw = data.content[0].text.trim();
    // Strip markdown blocks
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    // Extract JSON
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'No JSON found', raw: raw.substring(0, 300) });
    }
    const jsonStr = raw.substring(start, end + 1);
    
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch(parseErr) {
      return res.status(500).json({ error: 'JSON parse error: ' + parseErr.message, raw: jsonStr.substring(0, 300) });
    }
    
    // Fix margen and ticket fields to add units back
    if (parsed.productos) {
      parsed.productos = parsed.productos.map(function(p) {
        if (p.margen && !p.margen.includes('%')) p.margen = p.margen + '%';
        if (p.ticket && !p.ticket.includes('USD')) p.ticket = '$' + p.ticket + ' USD';
        return p;
      });
    }
    
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
