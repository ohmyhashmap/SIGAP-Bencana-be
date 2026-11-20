import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { requireAdmin, requireAuth } from '../lib/auth.js';
import { HttpError, ok, toNumber } from '../lib/http.js';
import { AI_PACKAGES, askPersonalizedAI } from '../services/ai.js';

export const aiRouter = Router();

aiRouter.get('/credits', requireAuth, async (req, res) => {
	const [user, payments] = await Promise.all([
		query('SELECT ai_credits FROM users WHERE id = $1', [req.userId]),
		query(
			`SELECT id, package_id, amount_idr, credits, payment_reference, status, created_at
			 FROM ai_payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
			[req.userId]
		)
	]);
	ok(res, {
		balance: user.rows[0]?.ai_credits ?? 0,
		packages: AI_PACKAGES,
		paymentInstructions:
			config.paymentInstructions || 'Hubungi administrator untuk instruksi pembayaran.',
		payments: payments.rows
	});
});

aiRouter.post('/topups', requireAuth, async (req, res) => {
	const selectedPackage = AI_PACKAGES.find((item) => item.id === req.body?.packageId);
	const reference =
		typeof req.body?.paymentReference === 'string' ? req.body.paymentReference.trim() : '';
	if (!selectedPackage) throw new HttpError(400, 'Paket kredit tidak valid.');
	if (reference.length < 4 || reference.length > 120) {
		throw new HttpError(400, 'Referensi pembayaran wajib diisi (4-120 karakter).');
	}
	const { rows } = await query(
		`INSERT INTO ai_payments (user_id, package_id, amount_idr, credits, payment_reference)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, package_id, amount_idr, credits, payment_reference, status, created_at`,
		[req.userId, selectedPackage.id, selectedPackage.amountIdr, selectedPackage.credits, reference]
	);
	ok(res, rows[0], { status: 201 });
});

aiRouter.get('/admin/topups', requireAuth, requireAdmin, async (_req, res) => {
	const { rows } = await query(
		`SELECT p.id, p.user_id, u.username, u.name, p.package_id, p.amount_idr, p.credits,
		        p.payment_reference, p.created_at
		 FROM ai_payments p JOIN users u ON u.id = p.user_id
		 WHERE p.status = 'pending' ORDER BY p.created_at ASC LIMIT 200`
	);
	ok(res, rows);
});

aiRouter.put('/admin/topups/:id', requireAuth, requireAdmin, async (req, res) => {
	const id = toNumber(req.params.id, 1, Number.MAX_SAFE_INTEGER);
	const status = req.body?.status;
	if (id === null) throw new HttpError(400, 'ID pembayaran tidak valid.');
	if (!['approved', 'rejected'].includes(status)) {
		throw new HttpError(400, 'Status pembayaran harus approved atau rejected.');
	}
	const { rows } = await query(
		`WITH reviewed AS (
			UPDATE ai_payments SET status = $2, reviewed_at = now()
			WHERE id = $1 AND status = 'pending'
			RETURNING id, user_id, credits, status
		), credited AS (
			UPDATE users SET ai_credits = users.ai_credits + reviewed.credits
			FROM reviewed WHERE users.id = reviewed.user_id AND reviewed.status = 'approved'
			RETURNING users.id
		)
		SELECT id, user_id, credits, status FROM reviewed`,
		[id, status]
	);
	if (!rows[0]) throw new HttpError(404, 'Permintaan pembayaran tidak ditemukan atau sudah ditinjau.');
	ok(res, rows[0]);
});

aiRouter.post('/ask', requireAuth, async (req, res) => {
	const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
	const profile = typeof req.body?.profile === 'string' ? req.body.profile.trim() : '';
	if (question.length < 3 || question.length > 1000) {
		throw new HttpError(400, 'Pertanyaan wajib diisi (3-1000 karakter).');
	}
	if (profile.length > 1000) throw new HttpError(400, 'Profil personal maksimal 1000 karakter.');
	ok(res, await askPersonalizedAI(req.userId, question, profile));
});
