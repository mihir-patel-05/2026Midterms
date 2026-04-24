import { Router } from 'express';
import { researcherAuth, researcherAuthController } from '../controllers/researcher-auth.controller.js';

const router = Router();

router.post('/login', (req, res) => researcherAuthController.login(req, res));
router.get('/me', researcherAuth, (req, res) => researcherAuthController.me(req, res));

export default router;
