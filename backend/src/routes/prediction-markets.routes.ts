import { Router } from 'express';
import { getPredictionMarkets, isStateCode } from '../services/prediction-markets.service.js';

const router = Router();

router.get('/', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state.toUpperCase() : null;
  const district = typeof req.query.district === 'string' ? req.query.district.padStart(2, '0') : null;
  if (state !== null && !isStateCode(state)) return res.status(400).json({ error: 'Invalid state' });
  if (district !== null && (!state || !/^(0[1-9]|[1-4][0-9]|5[0-3])$/.test(district))) {
    return res.status(400).json({ error: 'District requires a state and a number from 1 to 53' });
  }
  try {
    res.json(await getPredictionMarkets(state, district));
  } catch {
    res.status(503).json({ error: 'Prediction markets unavailable' });
  }
});

export default router;
